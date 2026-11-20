# Three-minute demo

Uses the live site and a real Instagram account. Prepare before you start: a phone with Instagram signed in, the site open on a laptop or a second phone (https://neophi-4ngyvfbl6a-el.a.run.app), and a public Reel you are happy to show. Do the connect step once beforehand if you want to save time; the code works once and expires after a few minutes.

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | The landing page | "We save Reels all the time and forget why. Neophi keeps the reason, in your own words." |
| 0:15 | Tap **Open Neophi**. The empty Feed with **Connect Instagram** | "No account form. You get a private library straight away." |
| 0:30 | Tap **Connect Instagram**. A one-time code appears | "Connecting Instagram is one message: send this code to our account." |
| 0:45 | On the phone, DM the code to the account. The site switches to *connected* by itself | "That's it. The site picks it up on its own." |
| 1:00 | Share the Reel to the account in a DM, then type a reason, for example *Sunday ko banana hai, for Maa* | "Now I just share a Reel the way I would to a friend, and say why." |
| 1:20 | Wait for the save to arrive in the Feed (about a minute; the toast says *Saved from Instagram*). Meanwhile, open Settings → Instagram | "Behind the scenes: Meta calls Cloud Run, we check the signature, queue it in Firestore, and a worker reads it with Gemini on Vertex AI." |
| 1:50 | Open the save | "My words first, exactly as I typed them, Hinglish and all." |
| 2:05 | Scroll to the AI reading | "The AI part is separate and labelled. It says what kind of Reel this is and the facts that matter, and each one points to where it came from. If it is not sure, it says so. It never writes my reason for me." |
| 2:25 | Open Journey (or Library) | "Everything I saved, in one place, grouped by what it is for." |
| 2:40 | Search in Hindi or Hinglish for the reason, for example *maa ke liye* | "And I can find it again by why I saved it, in my own language." |
| 2:55 | Settings → Delete all (do not confirm) | "And it's mine: disconnect Instagram or delete everything here." |

If a step fails live: the save takes up to two minutes when the worker is between runs; a shared Reel often arrives without the video, in which case the reading uses the caption and your note, which is expected.
