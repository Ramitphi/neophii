# Deploy main automatically

Every push or merge to `main` builds the image and moves the Cloud Run services `neophi` (public) and
`neophi-worker` (private) onto it. The build file is `deploy/cloudbuild.main.yaml`. It changes only the image:
each service keeps its environment variables, secrets and service account. The last step fails the build if
`/api/health` on the public service does not answer 200.

Project `neophi-515314`, region `asia-south1`, image repository `neophi`.

## One-time setup (run on a machine where gcloud is signed in)

```bash
PROJECT=neophi-515314; REGION=asia-south1
```

**1. Connect GitHub to Cloud Build.** In the console: Cloud Build → Repositories → 2nd gen → Create host
connection → GitHub, region `asia-south1`, name `github`. Authorize, install the Cloud Build app on
`Ramitphi/neophii`, then Link repository and name it `neophii`. The same with gcloud:

```bash
gcloud builds connections create github github --region=$REGION --project=$PROJECT
```

Open the link it prints to authorize, then:

```bash
gcloud builds repositories create neophii --remote-uri=https://github.com/Ramitphi/neophii.git --connection=github --region=$REGION --project=$PROJECT
```

**2. An account for the deploys.** It can build, push and deploy, and act as the two runtime accounts.

```bash
gcloud iam service-accounts create neophi-deployer --display-name="Neophi deploys" --project=$PROJECT
D=neophi-deployer@$PROJECT.iam.gserviceaccount.com
for R in roles/run.developer roles/artifactregistry.writer roles/logging.logWriter; do gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$D --role=$R --condition=None; done
for SA in neophi-app neophi-worker; do gcloud iam service-accounts add-iam-policy-binding $SA@$PROJECT.iam.gserviceaccount.com --member=serviceAccount:$D --role=roles/iam.serviceAccountUser --project=$PROJECT; done
```

**3. The trigger.** The four Firebase web settings are public config, read from your local `.env.production`
(never committed) and stored on the trigger:

```bash
SUBS=$(grep -E '^VITE_FIREBASE_(API_KEY|AUTH_DOMAIN|PROJECT_ID|APP_ID)=' .env.production | sed 's/^/_/' | paste -sd, -)
gcloud builds triggers create github --name=neophi-main --region=$REGION --project=$PROJECT \
  --repository=projects/$PROJECT/locations/$REGION/connections/github/repositories/neophii \
  --branch-pattern='^main$' --build-config=deploy/cloudbuild.main.yaml \
  --service-account=projects/$PROJECT/serviceAccounts/neophi-deployer@$PROJECT.iam.gserviceaccount.com \
  --substitutions="$SUBS"
```

**4. Try it once without a new commit:**

```bash
gcloud builds triggers run neophi-main --region=$REGION --branch=main --project=$PROJECT
gcloud builds list --region=$REGION --limit=1 --project=$PROJECT
```

Success: the build is `SUCCESS` and its log ends with `health 200 on <commit>`.

## Day to day

Merge a pull request into `main`. The deploy starts by itself and takes a few minutes. Watch it in the console
(Cloud Build → History) or with `gcloud builds list --region=asia-south1 --limit=3`.

## Undo

Every deploy is a new Cloud Run revision. To go back to the previous one:

```bash
gcloud run revisions list --service=neophi --region=asia-south1 --project=neophi-515314
gcloud run services update-traffic neophi --region=asia-south1 --project=neophi-515314 --to-revisions=REVISION_NAME=100
```

Do the same for `neophi-worker` if needed. To stop automatic deploys: Cloud Build → Triggers → `neophi-main` →
Disable (or delete it). To remove the setup: delete the trigger, the `neophi-deployer` account and the GitHub
connection.

## Common errors

| Error | Fix |
| --- | --- |
| `PERMISSION_DENIED ... iam.serviceaccounts.actAs` | step 2's `serviceAccountUser` grant on `neophi-app` / `neophi-worker` |
| `artifactregistry ... denied` on push | `roles/artifactregistry.writer` for `neophi-deployer`, and the `neophi` repository exists in `asia-south1` |
| Build passes but sign-in fails on the site | the trigger's `_VITE_FIREBASE_*` substitutions are empty; recreate it from a complete `.env.production` |
| `health 503` | the service started without its secrets or variables; check the revision's logs |
