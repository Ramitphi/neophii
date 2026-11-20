# Neophi

**Remember why you saved it.** Neophi keeps the Reels and posts you save together with your own words about why you saved them. Your words always come first, exactly as you typed them. The AI reading sits apart, labelled, and only says what it can point to in the source.

Try it: https://neophi-4ngyvfbl6a-el.a.run.app (deployed from `main` at `d77d088`: public revision `neophi-00012-8rb`, worker `neophi-worker-00019-p9b`)

## What it does

- **Save from Instagram in a DM.** Connect once with a one-time code, then share any Reel to the Neophi Instagram account and add a few words (in the same message or right after). The save appears on the site in about a minute, your words first.
- **Save from the site.** Paste a link or upload a photo or video with the **+** button, and say why.
- **Your words stay yours.** English, Hindi or Hinglish, kept byte for byte. The AI never writes your reason for you.
- **A reading you can check.** Each save gets a short reading from Gemini: what the item shows, the kind of Reel (recipe, place, product, workout, and so on), and the useful facts for that kind (ingredients, price, hours, dates). Every fact cites where it came from (a moment in the video, the caption, or your note); anything without evidence is dropped or marked *not sure*.
- **Find it again.** Search in your own words, in any of the three languages. A Feed to work through, a Today view, a Library by category, and Projects that collect saves for a trip or a piece of content.
- **Your data, your call.** Mark a save private (no AI at all), disconnect Instagram, or delete everything from Settings. See [Privacy](https://neophi-4ngyvfbl6a-el.a.run.app/privacy), [Terms](https://neophi-4ngyvfbl6a-el.a.run.app/terms) and [Data deletion](https://neophi-4ngyvfbl6a-el.a.run.app/data-deletion).

## How it is built

Everything runs on Google Cloud in `asia-south1`.

```
Instagram DM ──► Meta webhook ──► Cloud Run `neophi` (public)
                                   ├─ site (React) and /api (Firebase ID token required)
                                   ├─ /webhooks/instagram: signature check, store the event, queue a job
                                   └─ Firestore: saves, events, jobs, link codes
Cloud Scheduler (every minute, OIDC) ──► Cloud Run `neophi-worker` (private)
                                   ├─ fetch Meta's media when it sends one ──► Cloud Storage
                                   ├─ Vertex AI Gemini: reading, Reel type, details with evidence
                                   └─ Vertex AI embeddings ──► Firestore vector index for search
```

| Piece | Used for |
| --- | --- |
| **Cloud Run** | `neophi` serves the site, the API and the Instagram webhook; `neophi-worker` processes the queue and is not publicly callable |
| **Firestore** | saves, notes, categories, projects; Instagram events, jobs and one-time link codes (with TTL clean-up); a vector index on embeddings |
| **Firebase Authentication** | anonymous sign-in, so a library belongs to the person without an account form |
| **Vertex AI** | Gemini for the reading (structured JSON with a fixed type list) and Gemini embeddings for search |
| **Cloud Storage** | uploaded and downloaded media; the reading reads it from `gs://` |
| **Cloud Scheduler** | runs the worker once a minute with an OIDC identity |
| **Secret Manager** | the Meta app secret and verify token, read only by the services |

Every AI output passes a guard (`server/guard.ts`) before it is stored or shown: unknown types and fields are dropped, facts without surviving evidence are removed, caption-only saves cannot cite video frames, and the user's note is never taken from the model.

## Run it locally

Needs Node 20 or newer.

```bash
npm ci
cp .env.example .env    # fill GOOGLE_CLOUD_PROJECT etc. to use Vertex; leave empty to run without AI
npm run dev             # server on http://localhost:8080
npm run dev:client      # site with hot reload
```

Checks:

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e:local       # the Instagram pipeline end to end with fakes
```

The Firestore tests need the emulator (Java 21 or newer): see `tests/firestore-store.emulator.test.ts`.

## Deploy and operate

- `docs/DEPLOY.md`: first deploy to Cloud Run.
- `deploy/staging.sh`: build, deploy, acceptance checks (`accept`) and the whole-journey check (`journey`).
- `docs/INSTAGRAM_PIPELINE.md` and `docs/INSTAGRAM_LINKING.md`: how the DM pipeline and the one-time code work.
- `docs/FINISH_RESULTS.md`: the latest verified state of the live services.
- `docs/DEMO.md`: a three-minute demo.
