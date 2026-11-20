# Finish-line results

Filled from the finish-line run on project `neophi-515314` (region `asia-south1`) on 2026-11-20, UTC times. Names, counts, statuses, versions and public URLs only; no secret values, tokens, Firebase UIDs, scoped IDs, message text or media URLs.

Summary: the whole journey passes on Cloud Run (18/18), the acceptance checks pass (10/10), and the Meta app now delivers to Cloud Run. A live test with a real Instagram account connected with a code and saved 8 shares with their notes; no job failed and no signature was rejected from Meta.

## A. What the app owner needs to finish on the Meta side

| Item | Value |
| --- | --- |
| Commit deployed (git SHA) and image | `d77d088739af` (main after #17 and #18), image `asia-south1-docker.pkg.dev/neophi-515314/neophi/neophi:d77d088739af`. Public revision `neophi-00012-8rb`, worker revision `neophi-worker-00019-p9b` (`INSTAGRAM_MAX_MEDIA_BYTES=52428800`). After this deploy: journey 18/18 (save after 35 s), acceptance 10/10. |
| Public service URL | https://neophi-4ngyvfbl6a-el.a.run.app (also https://neophi-1088973814588.asia-south1.run.app) |
| **Callback URL to enter in Meta** | `https://neophi-4ngyvfbl6a-el.a.run.app/webhooks/instagram` (already entered and verified by the app owner) |
| Verify token: Secret Manager name and version | `neophi-meta-verify-token`, version 1 (the only version, enabled; the serving revision reads version 1). The value went to the app owner privately. |
| App secret: Secret Manager name and version, shape check | `neophi-meta-app-secret`, version 1, 32 hex characters: yes |
| GET challenge from the public internet with the verify token | PASS (acceptance script, and the Meta dashboard verified the callback) |
| `META_IG_RECIPIENT_ID` | `17841449458840084`: yes |
| `INSTAGRAM_HANDLE` set on the public service | `yuck.pov` |
| Privacy policy URL: status without sign-in, and its own page title | `https://neophi-4ngyvfbl6a-el.a.run.app/privacy`: 200, title "Neophi Privacy" (7.2 KB) |
| Terms of Service URL: status and own page title | `https://neophi-4ngyvfbl6a-el.a.run.app/terms`: 200, title "Neophi Terms" (2.8 KB) |
| User data deletion URL: status and own page title | `https://neophi-4ngyvfbl6a-el.a.run.app/data-deletion`: 200, title "Neophi Data Deletion" (3.7 KB) |
| Contact address used on the legal pages | mittalachit@gmail.com (the app owner confirmed it matches the Meta app) |
| TLS certificate valid for the public host | yes (`*.a.run.app`, valid until 2027-01-26) |
| Old callback for rollback | `https://20-219-13-184.sslip.io/webhooks/instagram`: did not answer at 23:02 UTC (connection timed out), so it is no longer a working rollback target |
| Auto-replies | off (`INSTAGRAM_REPLY` not set) |
| `INSTAGRAM_SENDER_UID_MAP` | empty; people connect themselves with a one-time code |
| `INSTAGRAM_LOG_DENIED_SENDERS` | `0` |

## B. Gates

Final check on the live site at phone width, on a throw-away account (2026-11-20, 23:35 UTC): the connect code appears, the Journey page shows the sample library (15 saves, 8 branches, the person's words first), a Hinglish search puts the right save first, and Delete everything empties the library; no console errors.

| Gate | Result | Counts / notes |
| --- | --- | --- |
| A0 merged tree: typecheck, lint, test, build, `npm run e2e:local` | PASS | tests 84 passed / 5 skipped (the 5 need the emulator); e2e:local A `analysisBasis=media`, B `analysisBasis=caption`, note exact in both |
| A0 Firestore emulator tests (5, including the 2 link-store tests) | NOT RUN | no Java runtime on this machine; the 3 earlier store tests passed in staging (see `docs/STAGING_RESULTS.md`) |
| A1 Firebase web config in the image, Anonymous sign-in on, authorized domains | PASS | web config in the served bundle; Anonymous enabled; 5 authorized domains including the `run.app` host |
| A1 public site: **Open Neophi** shows the empty feed with **Connect Instagram**; a code appears | PASS | a code was issued (journey check) and a real account connected with one in the live test |
| A2 legal pages served on the public host | PASS | 3/3 with their own titles and policy text, no sign-in |
| A3 indexes READY, TTL on events, jobs and link codes | PASS | 3/3 indexes READY; TTL on `expireAt` ACTIVE for `instagramEvents`, `instagramJobs`, `instagramLinkCodes` |
| A4 `node tools/cloud-journey.mjs` | PASS | 18/18 checks passed; the save appeared after 75 s; `INFO ingest=link_metadata analysisBasis=caption mediaOutcome=no_link`; clean-up removed the link and the throw-away user |
| A4 `node tools/staging-acceptance.mjs` after the final deploy | PASS | 10/10 checks passed |
| Scheduler runs the worker (OIDC audience = worker service URL) | PASS | job `neophi-instagram-worker` ENABLED, last attempt OK at 23:01 UTC; it reached the new worker revision with 200 |

### Live test with a real Instagram account (22:36–23:01 UTC)

After the app owner switched the Meta callback to Cloud Run:

- Links created: 3 (each code DM was accepted and stored nothing). The journey check's own synthetic link and save at 23:00 UTC are not counted here.
- Webhook deliveries: 0 signature rejections from Meta, 0 5xx, 0 denied; read receipts and echoes were ignored as designed.
- Shares saved: 8, all kept. 7 arrived without a media link (`media=no_link`, `ingest=link_metadata`). 1 arrived as a Meta attachment over the 15 MB limit (`media=too_large`, `via=attachment`, `ingest=unsupported`), before the limit was raised.
- Notes: 8, all `outcome=primary` (the person's words are the save's first text).
- Readings: all done and applied; `analysisBasis=caption` except the over-size share (`basis=none`).
- Worker: every run finished with 0 retried and 0 dead.

## C. Part B features

| Feature | Pull request | Tests added | Verified how | Not verified |
| --- | --- | --- | --- | --- |
| Cheaper live updates | not started | | | |
| Install and share from the phone | not started | | | |
| Reminders while the app is open | not started | | | |
| Keep your library across browsers | not started | | | |
| Confirmation in Instagram (off by default) | not started | | | |

## D. Blocked, skipped or unverified

- **Firestore emulator tests**: NOT RUN here (no Java runtime). They need Java 21 or newer.
- **Large media by attachment**: `INSTAGRAM_MAX_MEDIA_BYTES` was raised to 50 MB (`52428800`) on the worker after one Meta attachment was rejected at the 15 MB default. The worker holds up to that much in memory (512 MiB available) and the reading takes it from Cloud Storage. Not yet exercised with a real attachment over 15 MB. The deploy script's worker template now sets it, so later deploys keep it.
- **Shared Reels give no media**: every shared Reel in the live test came without a media link, so the reading used the caption plus the person's note. The Graph attachment lookup needs the app owner's access token and was not tried.
- **Old callback**: the old VM did not answer, so rolling back means fixing forward on Cloud Run.
- **Part B**: not started.

## E. What the app owner does next

1. Verify, not trust: fetch the pull request, run the local checks, run `tools/staging-acceptance.mjs` and `tools/cloud-journey.mjs` against the URLs above with the secrets entered by the owner.
2. In the Meta app, with approval for each change: record the old callback; set the callback to the URL in section A with the verify token; confirm the GET challenge and that `messages` is still subscribed; set the Privacy, Terms and Data deletion URLs; send a dashboard test message and check the counts.
3. Live test: connect from the site with a real Instagram account, share a real Reel with a note, watch it arrive, record what Meta sent (`ingest`, `analysisBasis`, `mediaOutcome`).
4. Media: Graph attachment lookup only with the owner's token and approval; keep the caption-plus-note save if Meta only sends a page.
5. Roll back to the old callback if anything is off.

Status: the callback, legal URLs and a live test are done (section B); step 4 is open; step 5 is not available (old callback down).
