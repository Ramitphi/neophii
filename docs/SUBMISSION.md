# Neophi: submission description

## One line
**Saving is a decision. Neophi keeps it.**

## The problem
When you save a Reel or a post, your mind is making a decision for your future self: *I need this*, *this is an idea*, *I will try this*. Almost always, by the time you could use it, that decision is gone, and the pile of saves cannot tell you what it was for. The effort of saving was wasted, and you cannot reach what you meant.

## What Neophi does
Send a Reel or post to Neophi on Instagram, the way you would send it to a friend, and say why if you like. The message is optional: the save works without it.

- **Your words stay yours.** What you type is kept exactly as typed and shown first, always. The AI never rewrites it and never invents a reason for you.
- **The AI reading is separate and labelled.** Gemini on Vertex AI reads each save (what it is, the useful points, what the caption actually says) and shows it as an AI suggestion with its evidence, or says it is not sure.
- **Journey: everything in one place.** One page shows every save as a tree that grows by itself: branches from your own categories and from what each save is about, topics shared by several saves, and the saves themselves with your words first. New growth is marked. It replaces the long list and the big folders that make saved posts unusable.
- **Connect once, in ten seconds.** From the site, tap Connect Instagram, send the one-time code to the Neophi account, and the page connects by itself. English, Hindi and Hinglish throughout.
- **Private by design.** Saves marked private never reach an AI model. Everything can be exported or deleted in one tap, including the Instagram link.

## How it works
Instagram message to Meta's webhook, then a Cloud Run service that checks the signature and writes the event durably to Firestore, then a worker (triggered by Cloud Scheduler) that creates the save, stores any media in Cloud Storage and calls Gemini on Vertex AI. Sign-in is Firebase Authentication; secrets are in Secret Manager.

## Try it
1. Open the live site and tap **Open Neophi**. You are registered automatically.
2. Tap **Connect Instagram**.
   - With an approved Instagram tester account: send the code to the Neophi account, then share any Reel (add a few words if you like) and watch it arrive.
   - Without one: scroll to **Try without Instagram**, pick a sample Reel, optionally add your words, and tap send. The result is clearly labelled as a simulated share.
3. Open **Journey** from the bottom bar to see everything in one place.

## Honest limits
- The Instagram connection runs in Meta's development mode, so only approved tester accounts can message the Neophi account until Meta approves the app. The simulated share exists so anyone can still experience the whole journey.
- For a shared Reel, Meta sends the link and caption, not the video, so the reading uses the caption (and your words); a video sent as a file is read from the video itself.
- Evaluations so far are small tests, not a benchmark.

## Built with
Cloud Run, Firestore, Firebase Authentication, Cloud Storage, Vertex AI (Gemini), Cloud Scheduler, Secret Manager, React and TypeScript.
