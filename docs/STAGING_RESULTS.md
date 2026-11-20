# Staging results

Filled from the staging run on project `neophi-515314`. Names, counts, statuses and public service URLs only; no secret values, tokens, Firebase UIDs, scoped IDs, message text or media URLs.
Gates 0-4 and the scheduler run pass. Gate 5 (tester pairing) waits for the Meta-side cutover; see C.

## A. What the Meta owner needs to act (required)

| Item | Value |
| --- | --- |
| Image/commit deployed (git SHA) | `43e57f7f0d5c` (image `asia-south1-docker.pkg.dev/neophi-515314/neophi/neophi:43e57f7f0d5c`), public revision `neophi-00002-rkp`. Later commits on this branch change only this file and the staging script's smoke-log filter; no application code. |
| Public service URL (`neophi`) | https://neophi-4ngyvfbl6a-el.a.run.app (same service also answers at https://neophi-1088973814588.asia-south1.run.app) |
| Worker service URL (`neophi-worker`, private) | https://neophi-worker-4ngyvfbl6a-el.a.run.app (the OIDC audience is this URL, no path) |
| Region | `asia-south1` (Vertex location `global`) |
| `ANALYSIS_MODEL` / `EMBEDDING_MODEL` chosen | `gemini-3.8-flash` / `gemini-embedding-2` (768 values) |
| `META_VERIFY_TOKEN` entered in Secret Manager, version | yes, `neophi-meta-verify-token`, latest enabled version pinned at the final deploy (48 characters at the check; the acceptance GET challenge with the latest version passed after that deploy). The value goes to Oliver privately. Any version added later needs `deploy/staging.sh deploy` again. |
| `META_APP_SECRET` entered in Secret Manager, version | yes, `neophi-meta-app-secret` version 1 (format check passed: 32 hex characters) |
| `META_IG_RECIPIENT_ID` set to `17841449458840084` | yes |
| Tester paired (`INSTAGRAM_SENDER_UID_MAP` set for the tester) | no (Gate 5 not run, see C) |
| `INSTAGRAM_LOG_DENIED_SENDERS` is back to `0` | yes (never turned on) |
| Public `/privacy` and `/data-deletion` pages served at the new host | not checked yet |
| Auto-replies off | yes |

## B. Gate results (one line each: PASS / FAIL / NOT RUN, with counts)

| Gate | Result | Counts / notes (redacted) |
| --- | --- | --- |
| Local: typecheck, lint, test, build, `npm run e2e:local` | PASS | tests 67 passed / 3 skipped (the 3 need the emulator); e2e:local A `full_media` / `analysisBasis=media`, B `link_metadata` / `analysisBasis=caption`, note exact in both |
| Firestore emulator tests | PASS | 3/3; full suite 70/70 with the emulator |
| Cloud Run public reachable; `/internal` is 404 on public | PASS | health OK and leaks no secret; app API without a Firebase token 401; `/internal` 404 |
| Worker denied without identity (401/403) | PASS | denied without identity and with a made-up bearer token |
| Vertex smoke, inline | PASS | `replied: true`, `video/mp4`, 251535 bytes, worker identity, `gemini-3.8-flash`, location `global`. Earlier runs failed with 403 `PERMISSION_DENIED` "Access requires an eligible paid billing account": the billing account was on the Free Trial; it passed after the owner upgraded it. |
| Vertex smoke, `gs://` object with the worker identity | PASS | `replied: true`, `video/mp4`, 251535 bytes; temporary job and object deleted afterwards |
| `node tools/staging-acceptance.mjs ...` | PASS | 10/10 checks passed, before and after the final deploy (GET challenge right/wrong token, unsigned and bad-signature POST 401, other-recipient POST ignored, worker identity checks) |
| Scheduler runs the worker (OIDC audience = service URL) | PASS | job `neophi-instagram-worker` ENABLED, last attempt OK; worker run requests in 10 min: 10 x 200 (the single 401 and 403 are the acceptance script's no-identity and made-up-token checks). No `instagram_worker_run` lines because the queue was empty (the worker logs that event only when it leases jobs); jobs drained: 0 of 0 |
| Indexes and TTL created | PASS (indexes) | 3/3 READY (2 Instagram composite + vector on `memories.embedding`); TTL on `expireAt` set by the owner earlier, not rechecked by the script |

## C. What is still blocked or unverified

- **Gate 5 pairing NOT RUN**: NeoPhi's webhook still points to the old VM, so a tester DM cannot reach Cloud Run until the Meta-side cutover. After the cutover: `deploy/staging.sh pair-find`, one tester DM, then `deploy/staging.sh pair-set`.
- **Firebase web config** (`.env.production`) not set yet: the image was built without it, so sign-in on the public site does not work yet. Needed before tester pairing; then `deploy/staging.sh build && deploy/staging.sh deploy`.
- **End-to-end worker run with a real job** not exercised on Cloud Run yet (queue empty); covered by the live test after the cutover.
- `/privacy` and `/data-deletion` on the new host not checked yet.
- **Billing**: the project's billing account was upgraded from the Free Trial to a paid account (required by Vertex for Gemini). Remaining trial credit still applies.
- **Build identity**: Cloud Build runs as the project's default compute account, which has only read on the Cloud Build source bucket, write on the `neophi` image repository, and log writing. No new account was created for builds.

## D. What happens next on the Meta side, once this is received

1. **Verify, do not trust**: fetch the PR, read the diff, run `npm ci`, typecheck, lint, test, build and `npm run e2e:local` locally; run `tools/staging-acceptance.mjs` against the public and worker URLs above (needs the secrets in the environment of that one process, entered by Oliver; no values printed).
2. **Meta side, with Oliver's approval at each change**: record the old callback privately for rollback; switch NeoPhi's webhook callback to `https://<public URL>/webhooks/instagram` using the verify token (value entered by Oliver); confirm the GET challenge passes and `messages` is still subscribed at v27.0; update the app's privacy-policy and data-deletion URLs to the new host; send one dashboard Test sample and check the counts (one more webhook, zero rejected signatures, nothing stored).
3. **Live test**: Oliver sends one tester-owned Reel and a separate reason; read the counts-only status and log lines and record the `media` outcome, `mime`, `bytes`, `via`, `dm.analysisBasis`, `ingest`, and note equality.
4. **Media gap**: test the Meta attachment first; only with Oliver's approval try the Graph lookup with `INSTAGRAM_ACCESS_TOKEN` (Oliver generates and enters it); keep the caption-plus-note fallback if Meta gives only HTML; test video-backed analysis separately via direct upload with a tester-owned MP4.
5. **Rollback** if anything is off: restore the old callback (`https://20-219-13-184.sslip.io/webhooks/instagram`, still running) and confirm a delivery.
6. Report each gate separately back to Oliver.
