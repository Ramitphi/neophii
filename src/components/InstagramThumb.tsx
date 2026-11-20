// A real Instagram post or Reel as its own thumbnail, using Instagram's official embed (no scraping, no login).
// The embed is cropped to its picture, cannot be clicked itself, and a link on top opens the post on Instagram.
// It loads only when the card is near the screen and sends no referrer.

const HEADER_PX = 54; // Instagram's embed starts with a fixed 54 px profile bar
const MEDIA_RATIO = 1.25; // its picture is about 4:5 (height / width)

export interface InstagramPost {
  /** https://www.instagram.com/reel/CODE/ (or /p/CODE/), with no tracking parameters */
  permalink: string;
  embed: string;
}

/** A real Instagram post or Reel link, or null (other sites, or the invented sample links). */
export function instagramPost(url: string | null | undefined): InstagramPost | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/(?:www\.)?instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (!m || /^sample/i.test(m[2])) return null;
  const kind = m[1].toLowerCase() === 'p' ? 'p' : 'reel';
  return {
    permalink: `https://www.instagram.com/${kind}/${m[2]}/`,
    embed: `https://www.instagram.com/${kind}/${m[2]}/embed/`,
  };
}

export function InstagramThumb({
  post,
  title,
  ratio,
  linkLabel,
}: {
  post: InstagramPost;
  title: string;
  /** Height / width of the box it fills: 1 for a square card, 1.25 for a 4:5 tile. */
  ratio: number;
  /** Accessible name of the link, e.g. "Open on Instagram: <title>". */
  linkLabel: string;
}) {
  // Centre the embed's picture in the box: skip the profile bar and half of any extra height.
  const offsetPct = Math.max(0, ((MEDIA_RATIO - ratio) / (2 * ratio)) * 100);
  const heightPct = (MEDIA_RATIO / ratio) * 100;
  return (
    <>
      <iframe
        className="ig-thumb"
        src={post.embed}
        title={`Instagram: ${title}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        tabIndex={-1}
        aria-hidden="true"
        scrolling="no"
        style={{ top: `calc(-${HEADER_PX}px - ${offsetPct}%)`, height: `calc(${HEADER_PX + 220}px + ${heightPct}%)` }}
      />
      <a className="ig-thumb-link" href={post.permalink} target="_blank" rel="noopener noreferrer" aria-label={linkLabel} />
    </>
  );
}
