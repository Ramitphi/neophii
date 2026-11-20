# Connecting Instagram to a library

The Instagram DM pipeline needs to know whose library a DM belongs to. Until now that was a hand-made map from the sender's Instagram-scoped ID to a Firebase UID, set in an environment variable and redeployed for every tester. This page replaces that for real use: a person connects their own Instagram from the site, once, in about ten seconds. The map still works next to it.

## What the person sees

1. They open Neophi. With nothing saved yet the feed offers **Connect Instagram** first (and a thin strip with the same action when there are saves but no connection). Settings has an Instagram card too.
2. The sheet shows the account to message, an **Open Instagram** button (`https://ig.me/m/<handle>`), and a one-time code like `NEO-7K4M-Q2XP`, valid for 15 minutes, with a copy button.
3. They send that code as a plain message to the account. The sheet notices within a few seconds and turns into **Instagram is connected**. Nothing needs to be typed on the site.
4. From then on, every Reel they share to the account is saved to their library. The words they type in the same message, or right after, are kept exactly as typed and shown first.
5. While the page is open, a new save is picked up by itself (every 7 s, only while the tab is visible). A notice says *Saved from Instagram: …* with a **View** button, and the feed scrolls to it. The save page shows a *Saved from Instagram* label, refreshes while it is still filling in (note arriving, reading in progress), and says *Reading this save…* instead of looking empty.
6. **Disconnect** is one tap in the same sheet. Saves already made stay.

## How it works

- `POST /api/instagram/link-code` (signed-in user) makes a code. Only a SHA-256 of the code is stored (`instagramLinkCodes`, keyed by the hash) with the owner's UID and an expiry. One live code per user: asking again cancels the earlier one.
- The webhook treats a **text-only DM whose entire text is a code** (case, spaces and dashes tolerated; a code inside a sentence is not a code) as a link request. It never becomes a note. The code is consumed exactly once, in a transaction, even if it has expired. A valid code writes `instagramLinks/<sender id>` = the code owner's UID and removes any earlier link of that owner (one Instagram account per library, one library per Instagram account).
- Every other delivery resolves the owner as before: the `INSTAGRAM_SENDER_UID_MAP` entry if there is one, otherwise the stored link, otherwise the sender is dropped and nothing is stored.
- A sender may make at most 8 code attempts per 10 minutes (in-process counter, best effort). A code has about 40 bits, so guessing is pointless.
- `GET /api/instagram/link` returns `{ available, handle, linked, linkedAt }`. `DELETE /api/instagram/link` disconnects and drops unused codes. `DELETE /api/me` removes the link and codes along with everything else.
- Neither collection is readable from a browser (the Firestore rules deny everything; only the server uses them). Codes, sender IDs and message text are never logged; the log lines are `instagram_link_created` and `instagram_link_rejected`, with no fields.

## Settings to add

| Name | Where | What |
| --- | --- | --- |
| `INSTAGRAM_HANDLE` | public service | Username of the connected account, no `@` (for example `yuck.pov`). Shown on the site and used for the Open Instagram button. Not a secret. If it is empty the site still works, it just says "our account" and hides the button. |

Optional cleanup of unused codes (they also expire by themselves, and are replaced or deleted on the owner's next request):

```bash
gcloud firestore fields ttls update expireAt --collection-group=instagramLinkCodes --enable-ttl --project "$PROJECT"
```

No new index is needed (the new queries are single-field equality).

## Limits worth knowing

- **Anonymous accounts.** The site signs people in anonymously, so a library belongs to that browser's account. If the person clears site data they start a new library; connecting again from the new browser moves their Instagram account to it (it does not move the old saves).
- **A code is a key.** Whoever sends a valid code from their Instagram account sends their future saves to the library the code was made in. The code is shown only to the signed-in person, lasts 15 minutes and works once; the connected state and Disconnect are always visible.
- **No reply in Instagram.** Auto-replies stay off, so the confirmation is on the site, not in the DM.
- **Latency.** A share is turned into a save by the worker: up to a minute until Cloud Scheduler's next run, 15 s for a trailing note to settle, then the reading. The sheet says "about a minute".
- **Seeing the Reel.** Meta currently sends the Reel's link and caption, not the video. The save keeps the caption and the exact note; the save page offers Instagram's own preview player when the link is a normal Reel link.

## Try it on your machine

No Meta or Google account is needed. A stand-in Instagram DM screen sends the same signed deliveries Meta would, so the real webhook, the link check, the queue and the worker all run; only the reading and the storage are stand-ins.

```bash
npm run build:client
npx tsx tools/demo-local.ts
```

Open `http://localhost:8099/` (the site: Open Neophi, then Connect Instagram) and `http://localhost:8099/demo/instagram` (the DM screen: paste the code, then share a Reel and type why).

## Tests

`tests/instagram-link.test.ts` (16): code format and parsing, API auth and limits, linking and then saving to the right library, single use, expiry, guessing limit, relinking, two people, disconnect, delete-me, and the old map next to links. `tests/firestore-store.emulator.test.ts` has two more for the Firestore store (transaction, replace on relink, removal, TTL field); they run only with the emulator, like the others in that file.
