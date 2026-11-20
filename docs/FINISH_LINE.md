# Finish line: everything left on the Google side

One document for the person (or assistant) finishing Neophi's Instagram-to-site journey on Google Cloud. Do part A in order, hand back, then do part B one feature per pull request. The Meta side and the live test are done by the app owner after your hand-back, so part A ends with a results file that contains everything they need, with no follow-up questions.

The journey being finished: **a person opens the site, connects their Instagram once with a one-time code, shares a Reel to the connected account with a few words, and sees the save appear on the site with their exact words first.** The code for it is in the connect-flow pull request (`docs/INSTAGRAM_LINKING.md`); the staging pull request has the Cloud Run scripts and the first results (`docs/HANDOVER.md`, `docs/STAGING_RESULTS.md`).

## Rules (these are hard)

1. **Approval before changes.** Before creating, changing or deleting any Google Cloud, Firebase or Secret Manager resource, or deploying, show the owner the exact project, region, names and commands, plus how to undo it, and wait for a yes. Running the owner's approved steps for them is fine.
2. **Secrets.** Never print, store, commit or paste a secret, token, Firebase UID, Instagram-scoped ID, message text or media URL: not in chat, files, logs, pull request text or shell history. The owner types secret values into Secret Manager himself. A secret may enter the environment of one process for one command. Names, counts and statuses are fine.
3. **Do not touch the Meta app, its callback or its permissions.** The app owner does that after your hand-back. Do not enable auto-replies.
4. **Never push to `main`.** Branches and pull requests only.
5. **Plain commit and pull request text.** Describe the change and what was verified; no author or tool footers and no co-author lines.
6. **Say what you did not verify.** PASS, FAIL or NOT RUN, with real counts.
7. **Ask the owner only for what you cannot do yourself:** signing in to Google, choosing the billed project and region, typing secrets, approving a step, and decisions about money or content. For each, give one short message: what, why, the exact link or command, and what you will do next. Then wait.

## Set up your tools first (so you can drive Google Cloud and Firebase yourself)

Everything below also works with the plain command lines (`gcloud`, `firebase`, `npm`); the tool servers just let an assistant call them directly. Whatever you use acts with the owner's credentials, so rule 1 still applies.

1. The owner signs in once (interactive, cannot be done for him): `gcloud auth login`, `gcloud auth application-default login`, `firebase login`.
2. **Firebase** (Authentication, Firestore, app config): in Gemini CLI, `gemini extensions install https://github.com/gemini-cli-extensions/firebase/`, or add to `.gemini/settings.json`:
   ```json
   { "mcpServers": { "firebase": { "command": "npx", "args": ["-y", "firebase-tools@latest", "mcp"] } } }
   ```
3. **Google Cloud** (any `gcloud` command, logs, Secret Manager metadata, Scheduler): `npx @google-cloud/gcloud-mcp init --agent=gemini-cli` (run from the home directory).
4. **Cloud Run** (deploy, logs, service status): `gemini extensions install https://github.com/GoogleCloudPlatform/cloud-run-mcp`.
5. Check with `gemini mcp list` (or `/mcp list`). If a command has changed, follow that tool's README or fall back to the plain command lines.
6. Needed on the machine: Node 20 or newer, the Google Cloud CLI, the Firebase CLI, and **Java 21 or newer** for the Firestore emulator (install it, or ask the owner to).

## Part A: finish the journey (must, in order)

### A0. Put the pieces together

Start from `main` on a branch named `finish-line`. Bring in, in this order: the staging branch (the staging pull request, which already contains the handover and the deploy scripts), then the connect-flow pull request. They merge cleanly at the time of writing.

```bash
git fetch origin
git switch -c finish-line origin/main
git merge --no-edit origin/staging/cloud-run-acceptance
git fetch origin pull/8/head:connect-flow && git merge --no-edit connect-flow
npm ci && npm run typecheck && npm run lint && npm test && npm run e2e:local
```

Expect 83 passed, 5 skipped (the 5 need the emulator). Then run the emulator tests, which have never been run for the new Firestore link methods:

```bash
gcloud emulators firestore start --host-port=127.0.0.1:8085 &
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npx vitest run tests/firestore-store.emulator.test.ts
```

Expect 5 passed. If a Firestore test fails, fix the store (`server/store.ts`) on this branch and say what was wrong. Add `INSTAGRAM_HANDLE: "yuck.pov"` to `deploy/public-env.example.yaml` and to the filled `public-env.yaml`.

### A1. Let the site sign people in

Without this the deployed site cannot sign anyone in (it was built with no Firebase web config).

1. Get the web app's config (Firebase console → Project settings → Your apps, or the Firebase tool's SDK config for the web app). Four values: `apiKey`, `authDomain`, `projectId`, `appId`. They are public identifiers, not secrets, but keep them out of git: they go in `.env.production` as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (the file is ignored by git; the build script reads it).
2. Turn on **Anonymous** sign-in (Firebase console → Authentication → Sign-in method → Anonymous). With the Identity Platform API this is `PATCH https://identitytoolkit.googleapis.com/admin/v2/projects/PROJECT/config?updateMask=signIn.anonymous` with `{"signIn":{"anonymous":{"enabled":true}}}` and a `gcloud auth print-access-token` bearer.
3. Add the public Cloud Run host (and any custom domain) to Authentication → Settings → **Authorized domains**.
4. Rebuild and redeploy (`deploy/staging.sh build && deploy/staging.sh deploy`), with `INSTAGRAM_HANDLE` in the public service's environment. Open the public URL in a browser: **Open Neophi** should show the empty feed with **Connect Instagram**.

### A2. Legal pages on the new host

Meta needs a Privacy policy URL, a Terms URL and a User data deletion URL on the host that now serves the app. The earlier pull request for them (`feature/meta-legal-pages`) was closed without merging, and `main` has none. Review that branch, bring the pages in on `finish-line`, and make sure they are served at `/privacy`, `/terms` and `/data-deletion` on the public service (HTTP 200, no sign-in). They must describe what the app does today: saves in Firestore, media in Cloud Storage, analysis on Vertex AI, the exact-note rule, the Instagram connection and how to disconnect it (Settings → Instagram), and how to delete everything (Settings → Delete all, which also removes the Instagram link and queued messages). The contact address must be a real one: ask the owner for it.

### A3. Indexes and clean-up

1. Confirm the three indexes are READY and the TTL policies on `instagramEvents.expireAt` and `instagramJobs.expireAt` are active (`gcloud firestore indexes composite list`, `gcloud firestore fields ttls list`); report what you saw.
2. Add the optional clean-up policy for unused link codes: `gcloud firestore fields ttls update expireAt --collection-group=instagramLinkCodes --enable-ttl --project PROJECT` (after approval).

### A4. Run the whole journey on Cloud Run

`tools/cloud-journey.mjs` does it with no Meta and no person: a throw-away anonymous user connects a synthetic Instagram sender with a one-time code, a synthetic Reel and a note arrive as signed deliveries, the Scheduler-run worker turns them into a save, the save is read back through the same API the site uses (note byte for byte, caption as title, Reel link kept, reading finished), and everything is deleted again.

Put it behind a `journey` step in `deploy/staging.sh`, using the same pattern as the `accept` step: the app secret is read from Secret Manager into this one process's environment, never printed. The command it wraps:

```bash
META_APP_SECRET=... META_IG_RECIPIENT_ID=17841449458840084 \
  node tools/cloud-journey.mjs --public https://PUBLIC_URL --api-key FIREBASE_WEB_API_KEY
```

Expect every check PASS (about two minutes, because the Scheduler runs the worker once a minute) and `INFO ingest=link_metadata analysisBasis=caption`. A FAIL names the check: use the troubleshooting table in `docs/HANDOVER.md` and say what you found and fixed. Also rerun `node tools/staging-acceptance.mjs` after the final deploy (it should still be 10/10), and run the sign-in check by hand once: open the public site, tap **Connect Instagram**, and confirm a code appears (do not send it; let it expire).

### A5. Hand back

Open a pull request to `main` from `finish-line` (or a branch off it) that contains the merged work plus `docs/FINISH_RESULTS.md`, filled from `docs/FINISH_RESULTS_TEMPLATE.md`. **Section A of that file is what the app owner needs to finish on the Meta side, with the exact values**: fill every row, so nothing has to be asked afterwards. The owner's next steps are listed at the bottom of the template so you can check that the facts they need are really there. Then tell the owner in two lines: the pull request link, and to send the app owner the verify token privately (and nothing else secret).

## Part B: features (after A is handed back; one pull request each, in this order)

Each feature: a branch off `finish-line` (or `main` once it is merged), tests that fail without the change, `npm run typecheck && npm run lint && npm test` green, one pull request, a short note of what was and was not verified. None may break the product rules: the user's words stay exactly as typed and come first, AI text is labelled and separate, nothing is counted or invented, no streaks or fake urgency.

1. **Cheaper live updates.** The site now looks for new saves every 7 seconds while a signed-in person has Instagram connected and the tab is visible (`src/App.tsx`), and each look lists every memory. Add a light `GET /api/memories?since=ISO` (only memories updated after that time, ordered by `updatedAt`, with the index it needs in `firestore.indexes.json`) and use it for the look, with a full refresh now and then. Test with many memories.
2. **Install and share from the phone.** A web app manifest with `share_target` (GET, `url`, `text`, `title`) so that sharing a Reel link to the installed app opens the capture sheet already filled in; app icons from `public/brand`; the capture sheet reads the shared values. This is the no-Instagram-account route for the same journey.
3. **Reminders while the app is open.** When a save's reminder time passes and the app is open, show a browser notification (ask permission only after the person sets their first reminder; never promise background push). Settings shows the state and a way to turn it off.
4. **Keep your library across browsers.** Today a library belongs to one browser's anonymous account. Let a person link Google sign-in to the same account (Firebase `linkWithPopup`, so the library and the Instagram link stay), and sign back in on another browser. Settings shows the state. This must never merge or delete someone else's data.
5. **Confirmation in Instagram (off by default).** After a share is saved, optionally reply in the DM with a short line and the site link. It needs the app owner's access token (`INSTAGRAM_ACCESS_TOKEN`, entered by the owner) and the Meta messaging permission, so build it behind `INSTAGRAM_REPLY=1`, default off, with tests using a mocked send, and do not enable it anywhere.

## What the app owner will do after your hand-back (check your results file covers these)

1. Verify, not trust: fetch the pull request, run the local checks, run `tools/staging-acceptance.mjs` and `tools/cloud-journey.mjs` against your URLs with the secrets entered by the owner.
2. In the Meta app (owner approves each change): record the old callback for rollback; set the callback to `https://PUBLIC_URL/webhooks/instagram` with the verify token; confirm the GET challenge and that `messages` is still subscribed; set the Privacy, Terms and Data deletion URLs to the new host; send a dashboard test message and check the counts.
3. Live test: connect from the site with a real Instagram account, share a real Reel with a note, watch it arrive, and record what Meta sent (`ingest`, `analysisBasis`, `mediaOutcome`).
4. Media: try the Graph attachment lookup only with the owner's token and approval; keep the caption-plus-note save if Meta only sends a page.
5. Roll back to the old callback if anything is off.
