# Getting the video of a shared Reel

A Reel shared by DM usually arrives as a page link plus caption, not a video file. The worker tries these in order and
reads the save with the video as soon as one gives it. All of it is off unless configured.

1. The attachment link Meta sent (HTTPS, allowed hosts only).
2. The Graph message lookup (needs `INSTAGRAM_ACCESS_TOKEN`).
3. Fallback sources, in the order of `INSTAGRAM_VIDEO_RESOLVERS` (comma separated):
   - `cobalt`: `COBALT_API_URL` (https, ideally self-hosted), optional `COBALT_API_KEY`.
   - `apify`: `APIFY_TOKEN`, optional `APIFY_ACTOR` (default `apify~instagram-scraper`).
   - `generic`: `GENERIC_RESOLVER_URL` (https) taking `{"url": "<reel link>"}` and answering JSON with the file in `url`,
     `video_url` or `videoUrl`; optional `GENERIC_RESOLVER_AUTH` (sent as the Authorization header).

Rules every source follows: only the public Reel link leaves the server (never the note, caption or a person's ID);
never for a save with AI off; the file it names must still pass the media checks (HTTPS, allowed host, size cap,
signature check); no URL or token is logged.

If nothing gives the video, the save is read from link and caption and says so. It is tried again after 5 minutes,
about 35 minutes, 2.5 hours and 4.5 hours. When the video arrives the save is read again with it and the notice goes
away; after the last try it says to send the video as a file. With `INSTAGRAM_REPLIES=1` (and the account token) the
person also gets a short DM at each of those points.

Using a third-party source to fetch Instagram media may be against that source's or Instagram's terms. Switching one on
is the owner's decision.
