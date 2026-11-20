# Finish-line results (copy to `docs/FINISH_RESULTS.md`, fill every line, open the pull request)

**Never write a secret value, token, Firebase UID, Instagram-scoped ID of a person, message text or media URL in this file.** Names, counts, statuses, versions and public URLs only. `17841449458840084` is the connected account's public ID and may be written. `PASS`, `FAIL` or `NOT RUN`, with real counts.

## A. What the app owner needs to finish on the Meta side (every row required)

| Item | Value |
| --- | --- |
| Commit deployed (git SHA) and image | |
| Public service URL | https:// |
| **Callback URL to enter in Meta** | `https://<public URL>/webhooks/instagram` (written out in full) |
| Verify token: Secret Manager name and version | `neophi-meta-verify-token`, version N. The value goes to the app owner privately, not here. |
| App secret: Secret Manager name and version, shape check | `neophi-meta-app-secret`, version N, 32 hex characters (yes/no). Must be NeoPhi's, not the test app's. |
| GET challenge from the public internet with the verify token | PASS / FAIL |
| `META_IG_RECIPIENT_ID` | `17841449458840084` (yes/no) |
| `INSTAGRAM_HANDLE` set on the public service | the username, no `@` |
| Privacy policy URL: status without sign-in, and its own page title (not the app shell) | `https://<public URL>/privacy` — 200? title: |
| Terms of Service URL: status and own page title | `https://<public URL>/terms` — 200? title: |
| User data deletion URL: status and own page title | `https://<public URL>/data-deletion` — 200? title: |
| Contact address used on the legal pages | (the address, or "set by owner") |
| TLS certificate valid for the public host | yes / no |
| Old callback for rollback | `https://20-219-13-184.sslip.io/webhooks/instagram` (still running?) |
| Auto-replies | off |
| `INSTAGRAM_SENDER_UID_MAP` | empty, or the tester map (names only) |
| `INSTAGRAM_LOG_DENIED_SENDERS` | `0` |

## B. Gates (one line each, with counts)

| Gate | Result | Counts / notes |
| --- | --- | --- |
| A0 merged tree: typecheck, lint, test, build, `npm run e2e:local` | | tests passed / skipped: |
| A0 Firestore emulator tests (5, including the 2 link-store tests) | | passed / total: |
| A1 Firebase web config in the image, Anonymous sign-in on, authorized domains | | |
| A1 public site: **Open Neophi** shows the empty feed with **Connect Instagram**; a code appears | | |
| A2 legal pages served on the public host | | |
| A3 indexes READY, TTL on events, jobs and link codes | | |
| A4 `node tools/cloud-journey.mjs` | | `N/N checks passed`, seconds until the save appeared, the `INFO` line |
| A4 `node tools/staging-acceptance.mjs` after the final deploy | | `N/N checks passed` |
| Scheduler runs the worker (OIDC audience = worker service URL) | | last status, jobs drained |

## C. Part B features (one line each)

| Feature | Pull request | Tests added | Verified how | Not verified |
| --- | --- | --- | --- | --- |
| Cheaper live updates | | | | |
| Install and share from the phone | | | | |
| Reminders while the app is open | | | | |
| Keep your library across browsers | | | | |
| Confirmation in Instagram (off by default) | | | | |

## D. Blocked, skipped or unverified

List everything that failed, was skipped or could not be checked, and why.

## E. What the app owner does next (do not edit; check that section A covers each step)

1. Verify, not trust: fetch the pull request, run the local checks, run `tools/staging-acceptance.mjs` and `tools/cloud-journey.mjs` against the URLs above with the secrets entered by the owner.
2. In the Meta app, with approval for each change: record the old callback; set the callback to the URL in section A with the verify token; confirm the GET challenge and that `messages` is still subscribed; set the Privacy, Terms and Data deletion URLs; send a dashboard test message and check the counts.
3. Live test: connect from the site with a real Instagram account, share a real Reel with a note, watch it arrive, record what Meta sent (`ingest`, `analysisBasis`, `mediaOutcome`).
4. Media: Graph attachment lookup only with the owner's token and approval; keep the caption-plus-note save if Meta only sends a page.
5. Roll back to the old callback if anything is off.
