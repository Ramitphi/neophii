# Deploying Neophi to Cloud Run

A short runbook for going live on Google Cloud: project `neophi-515314`, region `asia-south1`. Run every step from the repository root on your Mac, in order. Every script takes `--help`, and `DRY_RUN=1` prints the gcloud commands without running them. The scripts are bash; run them directly (`scripts/deploy/30-deploy.sh`) from zsh or bash, not with `zsh script.sh`. Names and defaults are in `scripts/deploy/config.sh`, and any of them can be overridden from the environment.

Needed on the Mac: `gcloud` logged in as the project owner (`gcloud auth login`), `node` (the repo already needs it), `git`, `curl`, `openssl`. Steps 1 to 6 take about 20 minutes. Building takes the longest.

## What gets deployed

- **One public Cloud Run service, `neophi`**, running as `neophi-app@neophi-515314.iam.gserviceaccount.com` with `--allow-unauthenticated`. It serves the site, `/api/*` (every route except `/api/health` still needs a Firebase ID token) and `/webhooks/instagram`.
- **Secrets** reach the service only through `--update-secrets` references: `META_APP_SECRET` ← `neophi-meta-app-secret`, `META_VERIFY_TOKEN` ← `neophi-meta-verify-token`. No secret value appears in a file, a command line, the image or a build log. `40-smoke.sh` reads them into shell variables only, and never prints them.
- **Firebase web config.** The four public values are kept in `.env.production`, which is gitignored and never committed. Cloud Build receives them as build arguments; the source upload excludes every `.env*` file (`.gcloudignore`). The runtime image contains only `dist/` and `tools/`.
- **The Instagram worker runs as an in-process poller:** `INSTAGRAM_WORKER_POLL_MS=5000`, `--min-instances 1`, `--no-cpu-throttling`.
  - *Why:* it needs one service, no extra service account, no Cloud Scheduler job and no new IAM grants. Jobs are picked up within about 5 s; a 1-minute Scheduler would take up to 60 s. Jobs are durable and leased in Firestore, so a restart, or two instances polling at once, is safe. CPU stays allocated, so work started after a response is not throttled.
  - *Safety:* no worker auth variable (`INSTAGRAM_WORKER_SECRET`, or `INSTAGRAM_WORKER_OIDC_AUDIENCE` + `INSTAGRAM_WORKER_SERVICE_ACCOUNT`) is set. `server/index.ts` therefore never mounts `/internal/*`, and the public URL answers 404 there (`40-smoke.sh` checks this). `30-deploy.sh` refuses to run if any of those variables is set in your shell.
  - *Cost:* about USD 2 a day for one always-on instance (1 vCPU, 1 GiB). After the hackathon, `gcloud run services update neophi --region asia-south1 --min-instances 0` stops that charge. Jobs are then processed only while an instance is up.
  - *Roles:* nothing beyond what `neophi-app` already has. The person deploying needs `iam.serviceAccounts.actAs` on `neophi-app`, which a project owner has. Anyone else needs:
    `gcloud iam service-accounts add-iam-policy-binding neophi-app@neophi-515314.iam.gserviceaccount.com --project neophi-515314 --member=user:THEIR_EMAIL --role=roles/iam.serviceAccountUser`

## 1. Preflight (read-only)

```bash
git fetch origin && git checkout feature/deploy-pipeline   # or main once merged
scripts/deploy/00-preflight.sh --infra-only
```

**Success:** the run ends with `0 failed`. Two WARNs are normal at this point: `firebase.googleapis.com not enabled yet`, and a Cloud Build identity without the builder role (step 3 grants it).

**Likely errors**
- `index ... not READY` or `missing`: wait until Console → Firestore → Indexes shows the index as ready, then rerun.
- `secretAccessor missing` or `role ... missing`: the FAIL line includes the exact grant command. Run it, then rerun.

## 2. Firebase (Authentication for the browser)

```bash
scripts/deploy/10-firebase.sh
scripts/deploy/00-preflight.sh          # full preflight now, including Firebase and .env.production
```

`10-firebase.sh` does the following with your gcloud credentials:
1. Enables `firebase.googleapis.com` and `identitytoolkit.googleapis.com`.
2. Adds Firebase to the project.
3. Registers the web app `neophi-web`.
4. Writes `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID` into `.env.production`. It prints the key names only.
5. Turns on Anonymous sign-in.

It is safe to rerun.

> **STOP (console) if the script asks for it.** Whatever the API refuses is printed with the exact clicks:
> - **Add Firebase:** console.firebase.google.com → Create a project → *Add Firebase to a Google Cloud project* → `neophi-515314` → continue (Analytics is not needed).
> - **Anonymous sign-in:** Firebase console → Build → Authentication → **Get started** (first time only) → Sign-in method → Add new provider → **Anonymous** → Enable → Save.
> - **Web config by hand** (only if the script could not write it): Project settings → General → Your apps → Web app → SDK setup and configuration → *Config*. Copy `apiKey`, `authDomain`, `projectId` and `appId` into `.env.production` as the four `VITE_FIREBASE_*=` lines (see `.env.example`).
>
> Rerun `10-firebase.sh` after any console step.

**Success:** the full preflight ends with `0 failed`, and shows `anonymous sign-in enabled` and the four `VITE_FIREBASE_* set` lines.

**Likely errors**
- `Authentication is not initialised yet (HTTP 404)`: click **Get started** in Authentication once, then rerun.
- `VITE_FIREBASE_PROJECT_ID does not match`: the web app was registered in a different Firebase project. Fix `.env.production`, or rerun with `FORCE=1`.

## 3. Build

```bash
git status                    # must be clean: the image is tagged with the commit
scripts/deploy/20-build.sh
```

The script:
- creates the Artifact Registry repo `asia-south1-docker.pkg.dev/neophi-515314/neophi` if it is missing;
- grants `roles/cloudbuild.builds.builder` to the Cloud Build identity if it lacks it (new projects build as the Compute default service account);
- runs Cloud Build with `scripts/deploy/cloudbuild.yaml`. The build fails early if any VITE value is empty.

The pushed image, `...neophi/neophi:<12-char SHA>`, is recorded in `.deploy/last-image` (gitignored).

**Success:** the run ends with `Built and pushed: asia-south1-docker.pkg.dev/neophi-515314/neophi/neophi:<sha>`. The build takes 4 to 8 minutes.

**Likely errors**
- `PERMISSION_DENIED` on storage, Artifact Registry or logging just after the role grant: IAM can take a minute to apply. Rerun.
- `uncommitted changes`: commit first. `ALLOW_DIRTY=1` builds anyway, with a `-dirty-<time>` tag.
- The Docker warning `SecretsUsedInArgOrEnv ... VITE_FIREBASE_API_KEY` is only a name heuristic. These four values are public.

## 4. Deploy

```bash
scripts/deploy/30-deploy.sh
```

Without any Instagram variables, this deploys the image recorded in `.deploy/last-image`, with these settings:
- env: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`, `CLOUD_RUN_REGION`, `MEDIA_BUCKET`, `NODE_ENV=production`, `ANALYSIS_MODEL`, `EMBEDDING_MODEL`, `INSTAGRAM_WORKER_POLL_MS=5000`;
- the two secrets;
- `neophi-app` as the service account;
- min 1 / max 3 instances, CPU always allocated.

It prints the service URL and saves it in `.deploy/service-url`. The script uses `--update-env-vars`, so a redeploy keeps the Instagram variables you set later. Redeploy any time with `scripts/deploy/20-build.sh && scripts/deploy/30-deploy.sh`, or with `--image URI` for a specific image.

**Success:** you see `Service URL: https://neophi-...run.app` and `Meta callback URL: https://neophi-...run.app/webhooks/instagram`.

**Likely errors**
- `Permission denied on secret ...`: run the `secretAccessor` grant printed by preflight, then redeploy.
- `Setting IAM policy failed ... allUsers`: an organisation policy (domain restricted sharing) blocks public services. Allow `allUsers` for this project in IAM → Organization policies, or deploy from a project without that policy.
- `Revision ... is not ready` or `container failed to start`: read the logs with `gcloud run services logs read neophi --project neophi-515314 --region asia-south1 --limit 50`.

**Rollback:** `gcloud run revisions list --service neophi --region asia-south1 --project neophi-515314`, then `gcloud run services update-traffic neophi --region asia-south1 --project neophi-515314 --to-revisions=PREVIOUS_REVISION=100`.

## 5. Smoke test (public behaviour only)

```bash
scripts/deploy/40-smoke.sh                       # uses .deploy/service-url; or pass the URL
```

The smoke test checks the following:
- `/api/health` is ok and contains no secret.
- `/` serves the app and its bundle contains the Firebase config.
- `/api/memories` returns 401 without a token and 401 with a bogus token. That proves Firebase ID-token verification is active; 503 would mean it is not.
- `/internal/instagram/worker/run` returns 404.
- The webhook rejects a wrong verify token (403) and echoes the challenge for the right one.
- A bad signature is rejected (401).
- A correctly signed synthetic delivery from a non-paired sender returns 200 and stores nothing.

The verify token and app secret are read from Secret Manager into variables and are never printed. `/privacy`, `/terms` and `/data-deletion` are only reported, never failed. They show "app shell" until the legal-pages branch is merged and deployed.

**Success:** the run ends with `0 failed`. Two WARNs are expected until step 7: `webhookConfigured is false` and `signed delivery: 503 not configured`.

Then open the service URL in a browser and save something. Anonymous sign-in should happen without any prompt.

**Likely errors**
- `client bundle has no Firebase web config`: `.env.production` was incomplete when you built. Fix it and repeat steps 3 and 4.
- Webhook checks fail with the right token: a secret version was added after the deploy, or the secret value ends in a newline. Re-enter the value without a trailing newline, then rerun `30-deploy.sh`.
- The browser console shows `auth/unauthorized-domain` or `auth/requests-from-referer-...-are-blocked`: run `scripts/deploy/10-firebase.sh --add-domain neophi-xxxx.a.run.app` (the host only). If the API key has HTTP-referrer restrictions (APIs & Services → Credentials → Browser key), also add `https://neophi-xxxx.a.run.app/*` there.

## 6. Vertex smoke test (deployed identity)

```bash
scripts/deploy/50-vertex-smoke.sh
```

The script runs staging step 1 of `docs/INSTAGRAM_PIPELINE.md`. It:
1. uploads `tests/fixtures/neophi-sample.mp4` to `gs://neophi-515314-neophi-media/smoke/`;
2. runs `node tools/vertex-video-smoke.mjs gs://…` as a Cloud Run Job, from the deployed image and as `neophi-app`;
3. prints the job's redacted result lines;
4. deletes the job and the object (`KEEP=1` keeps them).

**Success:** two lines, `"mode":"inline"` and `"mode":"gcs_file_uri"`, each with `"replied":true,"mime":"video/mp4","bytes":251535`, then `PASS`.

**Likely errors**
- `inline` replies but `gcs_file_uri` gets 403: give the Vertex AI service agent read access to the bucket. The FAIL output prints the exact `gcloud storage buckets add-iam-policy-binding ... service-<number>@gcp-sa-aiplatform... --role=roles/storage.objectViewer` command.
- `http: 404`: the model `gemini-3.8-flash` is not served at location `global` for this project. Check Vertex AI → Model Garden, then set `ANALYSIS_MODEL=...` for both this script and `30-deploy.sh`.

## 7. Meta callback cutover

First tell the service which Instagram account it serves. This is the numeric ID of the connected professional account (it starts with `1784…`), shown next to the account in App Dashboard → Instagram → *API setup with Instagram business login*.

```bash
META_IG_RECIPIENT_ID=1784XXXXXXXXXXXXX scripts/deploy/30-deploy.sh --env-only
scripts/deploy/40-smoke.sh               # now 0 failed, and the signed delivery returns 200
```

> **STOP (Meta app owner).** This is done in the NeoPhi parent app (1481320687243886), Instagram use case. Do it only after steps 5 and 6 pass.
> 1. Record the current callback URL and verify token privately, for rollback.
> 2. Use cases → Instagram → API setup with Instagram business login → **Configure webhooks**:
>    - **Callback URL:** `https://<service-url>/webhooks/instagram` (from `.deploy/service-url`).
>    - **Verify token:** the value of the `neophi-meta-verify-token` secret. Copy it without displaying it: `gcloud secrets versions access latest --secret=neophi-meta-verify-token --project neophi-515314 | pbcopy`, paste, then clear the clipboard.
>    - **Verify and save**, then subscribe the field **`messages`**. Confirm it is still subscribed after saving, and that the connected account's webhook subscription toggle is on.
> 3. `neophi-meta-app-secret` must hold this parent app's **App secret** (App settings → Basic). A test app's secret will not validate signatures.
> 4. **App settings → Basic**, once the legal pages are deployed (the smoke test says `page served`):
>    - Privacy policy URL: `https://<service-url>/privacy`
>    - Terms of Service URL: `https://<service-url>/terms`
>    - User data deletion: *Data deletion instructions URL*, `https://<service-url>/data-deletion`
>
> **Rollback:** restore the old callback URL and token, then confirm one delivery arrives.

**Success:** Meta accepts the callback; the service log shows the GET as 200. A dashboard *Test* sample returns 200 and logs `instagram_webhook` with `ignored: 1`: the sample's recipient is not the configured account, so nothing is stored. Zero `instagram_webhook_rejected` lines should appear.

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="neophi" AND jsonPayload.event:"instagram_"' \
  --project neophi-515314 --freshness=1h --limit 20 --format='value(timestamp,jsonPayload)'
```

**Likely errors**
- Meta says *The URL couldn't be validated*: the verify token differs, possibly by a trailing newline. Run `40-smoke.sh` to confirm the GET challenge passes, and make sure the URL ends in `/webhooks/instagram`.
- `instagram_webhook_rejected` with `reason: signature`: `neophi-meta-app-secret` is not the parent app's secret. Add a new version with the right value, then rerun `30-deploy.sh`.

## 8. Pair a tester

People can now connect their own Instagram from the site (see `docs/INSTAGRAM_LINKING.md`); set `INSTAGRAM_HANDLE` on the public service for that. The manual map below still works and is handy for a first tester.

1. The tester opens the service URL in the browser they will use and saves anything once. Their **Firebase UID** is in Firebase console → Authentication → Users, as the anonymous row created at that time.
2. Log denied senders, by ID only:
   ```bash
   INSTAGRAM_LOG_DENIED_SENDERS=1 scripts/deploy/30-deploy.sh --env-only
   ```
3. The tester sends one DM, any text, to the connected account.
4. Read their Instagram-scoped ID:
   ```bash
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="neophi" AND jsonPayload.event="instagram_sender_not_paired"' \
     --project neophi-515314 --freshness=1h --limit 5 --format='value(timestamp,jsonPayload.senderId)'
   ```
   No line, but `instagram_webhook` shows `ignored: 1`? Then `META_IG_RECIPIENT_ID` is wrong. Fix it as in step 7.
5. Pair the tester and turn logging off. The map replaces the old one, so list every tester:
   ```bash
   INSTAGRAM_SENDER_UID_MAP='IGSID=FIREBASE_UID' INSTAGRAM_LOG_DENIED_SENDERS=0 scripts/deploy/30-deploy.sh --env-only
   ```
   Several testers: `'IGSID1=UID1,IGSID2=UID2'`. The script rejects malformed pairs, which the server would otherwise drop silently.

## 9. End-to-end check

The tester shares one of their own Reels to the connected account by DM, then types why in a second message. Within about 30 s the save appears in their library at the service URL, with the caption, their exact note and an AI reading (or a caption-only reading if Meta sent no video).

Run the log query from step 7. Expected:
- `instagram_webhook` with `stored: 1` for each message;
- `instagram_share_processed` with `media`, `mime`, `bytes` and `via`;
- no `instagram_worker_error` lines.

Record the redacted results listed in `docs/INSTAGRAM_PIPELINE.md` → Staging acceptance step 5.

## Appendix A: secrets and redeploys

- **Rotate a Meta secret:** add a new version in the Secret Manager console, then rerun `scripts/deploy/30-deploy.sh`. The new revision reads `latest`.
- **Optional Graph token:**
  1. Create the `neophi-instagram-access-token` secret in the console.
  2. Grant access: `gcloud secrets add-iam-policy-binding neophi-instagram-access-token --project neophi-515314 --member=serviceAccount:neophi-app@neophi-515314.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor`
  3. Deploy with `SECRET_IG_TOKEN=neophi-instagram-access-token scripts/deploy/30-deploy.sh`.

## Appendix B: private worker with Cloud Scheduler instead (not used)

`docs/INSTAGRAM_PIPELINE.md` also describes a private `neophi-worker` service with `--no-allow-unauthenticated`, triggered every minute by Cloud Scheduler with OIDC. It isolates the worker better, but it adds a second service, a scheduler job and these grants (with the single `neophi-app` identity as caller):

```bash
gcloud run services add-iam-policy-binding neophi-worker --project neophi-515314 --region asia-south1 \
  --member=serviceAccount:neophi-app@neophi-515314.iam.gserviceaccount.com --role=roles/run.invoker
gcloud iam service-accounts add-iam-policy-binding neophi-app@neophi-515314.iam.gserviceaccount.com --project neophi-515314 \
  --member=user:YOUR_EMAIL --role=roles/iam.serviceAccountUser   # whoever creates the Scheduler job
```

If you switch, deploy the public service with `INSTAGRAM_WORKER_POLL_MS=0` (`POLL_MS=0`) and `MIN_INSTANCES=0`.

## Appendix C: a VM instead of Cloud Run

- Meta requires a public **HTTPS** callback with a valid certificate. Put a domain on the VM and run Caddy (`your.domain { reverse_proxy 127.0.0.1:8080 }` gets a certificate automatically) or nginx with certbot. The proxy must pass the request body through unchanged, because the HMAC is over the raw bytes.
- Run one process (`npm ci && npm run build && NODE_ENV=production node dist/server/index.js`) as the VM's attached service account, `neophi-app` with the same roles. Use the same environment variables as `30-deploy.sh` plus `INSTAGRAM_WORKER_POLL_MS=5000`. Put the secret values in a root-only environment file, or fetch them from Secret Manager at start; never in the repo.
- Build the client with `.env.production` present, or `docker build .` with it in the context. Both work.
- Use the same Meta settings, with `https://your.domain/webhooks/instagram`. `scripts/deploy/40-smoke.sh https://your.domain` works unchanged.
