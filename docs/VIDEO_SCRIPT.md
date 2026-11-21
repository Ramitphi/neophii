# Demo video script

For the Startup Buildathon India 2026 submission (closes 10:00 AM IST, 21 Nov 2026). Builds on `docs/DEMO.md`. Every number here comes from `docs/FINISH_RESULTS.md`.

Live site: https://neophi-4ngyvfbl6a-el.a.run.app

**Format:** a screen recording with voice-over. No one needs to be on camera. Record the screens, then record the voice-over over them. The face-cam intro and outro are optional.

Two screens: **Phone** (Instagram, signed in, already connected to Neophi) and **Site** (the Neophi site on a laptop or a second phone). Button names below are the ones on the site.

## 1. Main script (about 2:45, always under 3:00)

About 2:45 with the face-cam intro and outro, about 2:35 without them.

| Time | On screen (exact taps and pages) | Voice-over | On-screen text / captions |
| --- | --- | --- | --- |
| 0:00–0:05 | *Optional face-cam intro.* Presenter to camera, plain background | "Hi, I'm [your name], from team Neophi." | **[Your name] · Team Neophi** |
| 0:05–0:13 | **Site:** landing page, slow scroll through the pile of saved Reels | "You saved a Reel last week. Do you remember why?" | **Remember why you saved it.** |
| 0:13–0:30 | **Site:** keep scrolling the landing page: the pile, then the feed section | "We save Reels to act on later. A car to buy. A recipe for Maa. Investment advice. Then we forget why. And the reason is the valuable part. Notes split the Reel from the reason. AI summaries guess. And many of us write in Hindi and Hinglish." | "car to buy" · "Sunday ko banana hai, for Maa" · "investment advice" |
| 0:30–0:38 | **Site:** tap **Open Neophi**. The Feed opens, already connected | "Neophi keeps the reason, in your words. No signup form. I connected Instagram once, with a one-time code." | **No signup. Connect once.** |
| 0:38–0:55 | **Phone:** open the public Reel → tap **Share** → pick Neophi's Instagram account → send. Then type in the same chat: *Sunday ko banana hai, for Maa* → send | "Now I share a Reel the way I would to a friend. And add a few words. Sunday ko banana hai, for Maa." | **Share the Reel. Say why.** |
| 0:55–1:12 | **Site:** stay on the Feed. Cut or speed up the wait. The toast **Saved from Instagram** appears and the new save sits at the top | "It shows up in the Feed in about a minute. Behind it, Meta calls our Cloud Run service, we check the signature, queue it, and a worker reads it with Gemini." | **In the Feed in about a minute** (show "sped up" if you cut) |
| 1:12–1:25 | **Site:** tap the new save. Hold on the note at the top | "My words come first. Exactly as I typed them. Hinglish and all. The AI never rewrites my reason." | **Your words, kept exactly.** |
| 1:25–1:48 | **Site:** scroll down to the AI reading. Point at the Reel type, the facts, and the evidence tag on each (caption, note or a video moment). Pause on a *not sure* line if there is one | "The AI part is separate, and labelled. It says what kind of Reel this is and the facts that matter. Every fact points to its evidence: a moment in the video, the caption, or my note. No evidence? It says not sure." | **Every fact cites evidence. Otherwise: "not sure".** |
| 1:48–2:01 | **Site:** tap the search icon → type *maa ke liye* → tap the result | "Weeks later, I don't remember the title. I remember why. So I search the reason. Maa ke liye. English, Hindi or Hinglish." | **Search by your reason, in En, Hi or Hinglish.** |
| 2:01–2:09 | **Site:** quick taps through the bottom bar: **Today**, **Journey** (Library by category), **Projects**, back to **Feed** | "A Feed, Today, a Library by category, and Projects." | **Feed · Today · Library · Projects** |
| 2:09–2:18 | **Site:** tap **+** → show the switch **Keep private, skip AI** → close. Then **Settings** → scroll to **Delete everything** (do not confirm) | "It's your data. Private saves never reach the AI. And you can delete everything, right here." | **Private saves never reach the AI. Delete everything in Settings.** |
| 2:18–2:28 | **Architecture slide** from the deck (one still) | "It all runs on Google Cloud in asia-south1. Cloud Run takes the webhook into Firestore. Cloud Scheduler wakes a private worker. Gemini 3.8 Flash on Vertex AI writes the reading, an evidence guard checks it, and Gemini Embedding 2 powers vector search." | Instagram DM → Meta webhook → Cloud Run → Firestore → Scheduler (OIDC) → worker → Gemini 3.8 Flash → evidence guard → Gemini Embedding 2 → vector search |
| 2:28–2:40 | **Google AI slide** (one still), then the landing page with the URL | "We built the first version with Google Antigravity. It's live: the journey check passes eighteen of eighteen, and a real account saved eight shares with their notes. Next: reminders and shared Projects. Neophi. Remember why you saved it." | **neophi-4ngyvfbl6a-el.a.run.app** · Gemini 3.8 Flash · Gemini Embedding 2 · Vertex AI · Antigravity · Next: reminders, shared Projects, public launch after Meta app review |
| 2:40–2:45 | *Optional face-cam outro.* Presenter to camera, the URL as a lower third | "I'm [your name], team Neophi. Thanks for watching." | **neophi-4ngyvfbl6a-el.a.run.app** |

If you skip the face-cam, start at the landing page and end on the URL (about 2:35). If a take runs long, drop the Today / Journey / Projects row first. Never go past 3:00.

## 2. Sixty-second cut

Screen recording with voice-over only, no face-cam.

| Time | On screen | Voice-over | On-screen text |
| --- | --- | --- | --- |
| 0:00–0:08 | **Site:** landing page, the pile | "We save Reels to act on later. Then we forget why. The reason is the valuable part." | **Remember why you saved it.** |
| 0:08–0:20 | **Phone:** share the Reel to Neophi's account, type *Sunday ko banana hai, for Maa* | "With Neophi, I share the Reel in a DM and say why. In my own words." | **Share the Reel. Say why.** |
| 0:20–0:28 | **Site:** Feed, toast **Saved from Instagram** (sped up) → tap the save | "About a minute later it's in my Feed. My words first, exactly as I typed them." | **Your words, kept exactly.** |
| 0:28–0:40 | **Site:** scroll to the AI reading, point at the evidence tags | "Gemini adds a reading. Every fact points to its evidence: the video, the caption or my note. Otherwise it says not sure." | **Every fact cites evidence.** |
| 0:40–0:48 | **Site:** search *maa ke liye* → result | "And I find it again by why I saved it. In Hindi, Hinglish or English." | **Search by your reason.** |
| 0:48–0:54 | **Site:** Settings → **Delete everything** (do not confirm) | "Private saves never reach the AI. Delete everything any time." | **Your data, your call.** |
| 0:54–1:00 | Architecture still, then the URL | "Built on Google Cloud with Vertex AI Gemini. Live now." | **neophi-4ngyvfbl6a-el.a.run.app** |

## 3. Recording checklist

### Prepare (the night before)

- [ ] A **public Reel** that is safe to show: no faces of private people, no brands you don't want on screen. A recipe Reel fits the Maa note best.
- [ ] **Connect beforehand.** On the site: **Open Neophi** → **Connect Instagram** → DM the code to Neophi's account from the phone. The code works once and expires in a few minutes. Do not record this step, and never show a code on camera, used or not.
- [ ] **A backup save already in the Feed:** share the same Reel once with the same note and keep that save. If the live one is slow, you open this one.
- [ ] A second device (or the laptop) for the site, so the phone and the site can be filmed separately.
- [ ] The **architecture** and **Google AI tools** slides from the deck exported as stills.
- [ ] Do one dry run with a stopwatch. Aim for about 2:45 with face-cam (about 2:35 without). The final file must be under 3:00.
- [ ] Optional face-cam: film the 5-second intro and outro separately, in good light, against a plain background. Leave them out if anything looks off.

### Screen settings

- [ ] Phone: Do Not Disturb on, notifications hidden, battery charged, full brightness, time not showing anything odd.
- [ ] Phone Instagram: only the chat with Neophi's account on screen. Close or blur the DM list: **no personal DMs on camera**.
- [ ] Site: light theme (or one theme for the whole video), browser zoom about 125%, bookmarks bar and other tabs hidden, record at 1080p or higher.
- [ ] Use the browser window or a phone-sized frame; crop out the address bar except in the closing shot with the URL.
- [ ] Mic close to you, quiet room. Record the voice-over separately if the live take is noisy.

### If the save is slow

- The worker runs **every minute**, so a save normally takes about a minute and can take up to two. Keep talking over the architecture line, then cut the wait in editing and caption it "sped up".
- If it still hasn't arrived after two minutes, open the **backup save** from the night before and carry on. Don't mention the delay.
- Shared Reels **often arrive caption-only** (Meta sends no video). That is expected: the reading then uses the caption and your note, and the evidence tags show "caption" or "note" rather than a video moment. Say "the caption" instead of "a moment in the video" for that take.

### Upload (do this well before 10:00 AM IST)

- [ ] Export at 1080p, MP4, and check the length is under 3:00.
- [ ] Upload to **YouTube as Unlisted**, or to **Google Drive** with sharing set to **Anyone with the link** (Viewer).
- [ ] Open the link in a **private / incognito window**, signed out, and play it to the end. If it asks for sign-in or access, fix the sharing setting and test again.
- [ ] Paste that tested link into the submission form.

### Never on screen

- Tokens, keys, Secret Manager values, or the Meta dashboard.
- A connect code, before or after use.
- Personal DMs, other chats, or notifications.
- Account IDs, Firebase details, browser dev tools, or Cloud console pages with IDs. Use the deck's architecture slide instead.

### Facts you may say (and nothing beyond them)

- Journey check 18/18, acceptance checks 10/10.
- A real Instagram account connected with a code and saved 8 shares with their notes.
- Region asia-south1. Gemini 3.8 Flash and Gemini Embedding 2 on Vertex AI. Antigravity was used to build the first scope and UI; Google AI Studio and Google Agent Skills are planned.
- No user counts or market numbers.
