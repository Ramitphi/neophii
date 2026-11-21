# Benchmarks

Measured on the live services (project `neophi-515314`, `asia-south1`) on 2026-11-20 and 21 (UTC). Counts and timings only.

## The journey on Cloud Run

`tools/cloud-journey.mjs`: a throw-away user connects with a one-time code, a Reel and a note arrive as signed Instagram deliveries, the worker turns them into a save, and the save is read back through the site's API.

| Run | Checks | Share to save visible |
| --- | --- | --- |
| Finish-line run | 18/18 | 75 s |
| After deploy `4c0eb53` | 18/18 | 75 s |
| After deploy `d77d088` | 18/18 | 35 s |
| After deploy `6b13fea` | 18/18 | 50 s |
| Final deploy `090ca38` | 18/18 | 30 s |

The worker is run by Cloud Scheduler once a minute, so the wait is 30 to 75 s, depending on where the minute is.

Acceptance checks (`tools/staging-acceptance.mjs`: webhook challenge, signatures, recipient filter, worker identity): 10/10 after every deploy.

## Live test with real Instagram accounts

3 accounts connected with a code, 8 shares and 8 notes saved, 0 failed jobs, 0 signature rejections from Meta, 0 server errors. Every shared Reel arrived without the video (Meta sends a link only for shared Reels), so the reading used the caption and the note.

## Reading quality (Gemini on Vertex AI)

`tools/reel-eval.ts`: 22 made-up, caption-only Reels across 15 kinds, in English, Hinglish and Hindi; 3 are hashtag-only and 1 is mixed; 12 have no note. Model `gemini-3.8-flash`.

| | Before (no type) | Reel types | Caption signal and key points |
| --- | --- | --- | --- |
| Valid outputs | 18/18 | 22/22 | 22/22 |
| The person's words unchanged | 18/18 | 22/22 | 22/22 |
| Reel type right | n/a | 19/19 | 19/19 |
| Caption judged right (informative, mixed, noise) | n/a | n/a | 22/22 |
| One-line "what this is" present | n/a | n/a | 22/22 |
| Key points present when the caption is useful | n/a | n/a | 18/19 (59 points) |
| Saves without a note that still get an AI line | n/a | n/a | 12/12 |
| Facts that cite evidence | 69% | 90% | 99% |
| Tokens per save, in / out | 1354 / 470 | 2282 / 582 | 2936 / 714 |
| Time per save | 8.2 s | 7.5 s | 10.2 s |

The first column is the 18-item set before Reel types; the other two use the 22-item set. Made-up captions are cleaner than many real ones, so these are best cases.

## Cost

- **Per save**: about 2,900 input and 700 output tokens for one reading, plus one embedding. At the current Vertex price for the model this is a fraction of a cent; check the price page before quoting a figure.
- **Running**: one public instance kept warm (`min-instances 1`, 1 vCPU, 512 MiB) so the first visit is fast; the worker scales to zero between Scheduler runs.

## Code

- 111 tests pass, 5 skipped (the 5 need the Firestore emulator).
- Typecheck, lint and build pass on `main`.
