// Fallback video getters for a shared Reel whose DM carried only a page link. Tried in the configured order after
// Meta's own attachment and the Graph lookup, and only when switched on: with nothing configured, none runs.
//
// What leaves the server: the public Reel link, to the one service being tried, and nothing else (no note, no
// caption, no person's ID). Never used for a save with AI off. A service only names where the file is; the file
// itself still goes through fetchAuthorizedMedia (HTTPS, allowed hosts, size cap, signature check).
// No URL or token is ever logged or returned.
import type { FetchLike } from './media.js';

export interface ResolverEnv {
  [key: string]: string | undefined;
}

export interface Resolved {
  /** Candidate media URLs, best first. */
  urls: string[];
  /** Extra host suffixes this resolver's URLs may come from (its own tunnel host, for example). */
  hosts: string[];
}

export interface VideoResolver {
  name: string;
  resolve(permalink: string, fetchImpl: FetchLike): Promise<Resolved>;
}

const TIMEOUT_MS = 25_000;
const INSTAGRAM_CDNS = ['cdninstagram.com', 'fbcdn.net'];

const httpsBase = (raw: string | undefined): URL | null => {
  const v = (raw ?? '').trim();
  if (!v || !URL.canParse(v)) return null;
  const u = new URL(v);
  return u.protocol === 'https:' && !u.username && !u.password ? u : null;
};

async function postJson(fetchImpl: FetchLike, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'NeophiCapture/1.0', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`status_${res.status}`);
  return res.json();
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A cobalt-compatible API (self-hosted is best: COBALT_API_URL is the instance's base URL). */
function cobalt(env: ResolverEnv): VideoResolver | null {
  const base = httpsBase(env.COBALT_API_URL);
  if (!base) return null;
  const key = env.COBALT_API_KEY ?? '';
  return {
    name: 'cobalt',
    async resolve(permalink, fetchImpl) {
      const body = obj(await postJson(fetchImpl, base.toString(), key ? { authorization: `Api-Key ${key}` } : {}, { url: permalink }));
      const status = str(body.status);
      const urls: string[] = [];
      if (status === 'tunnel' || status === 'redirect') urls.push(str(body.url));
      if (status === 'picker' && Array.isArray(body.picker)) {
        for (const item of body.picker) {
          const rec = obj(item);
          if (str(rec.type) === 'video') urls.push(str(rec.url));
        }
      }
      return { urls: urls.filter(Boolean), hosts: [base.hostname, ...INSTAGRAM_CDNS] };
    },
  };
}

/** An Apify Instagram actor, run synchronously. Needs APIFY_TOKEN; APIFY_ACTOR defaults to apify~instagram-scraper. */
function apify(env: ResolverEnv): VideoResolver | null {
  const token = env.APIFY_TOKEN ?? '';
  const actor = (env.APIFY_ACTOR || 'apify~instagram-scraper').trim();
  if (!token || !/^[A-Za-z0-9_.~-]+$/.test(actor)) return null;
  return {
    name: 'apify',
    async resolve(permalink, fetchImpl) {
      const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items`;
      const items = await postJson(fetchImpl, url, { authorization: `Bearer ${token}` }, { directUrls: [permalink], resultsType: 'details', resultsLimit: 1 });
      const first = Array.isArray(items) ? obj(items[0]) : {};
      return { urls: [str(first.videoUrl), str(first.video_url)].filter(Boolean), hosts: INSTAGRAM_CDNS };
    },
  };
}

/**
 * Any other service that takes {"url": <reel link>} and answers JSON with the file's address in `url`, `video_url`
 * or `videoUrl` (RapidAPI-style providers and in-house ones). GENERIC_RESOLVER_URL is the endpoint; the optional
 * GENERIC_RESOLVER_AUTH is sent whole as the Authorization header.
 */
function generic(env: ResolverEnv): VideoResolver | null {
  const base = httpsBase(env.GENERIC_RESOLVER_URL);
  if (!base) return null;
  const auth = env.GENERIC_RESOLVER_AUTH ?? '';
  return {
    name: 'generic',
    async resolve(permalink, fetchImpl) {
      const body = obj(await postJson(fetchImpl, base.toString(), auth ? { authorization: auth } : {}, { url: permalink }));
      return { urls: [str(body.url), str(body.video_url), str(body.videoUrl)].filter(Boolean), hosts: [base.hostname, ...INSTAGRAM_CDNS] };
    },
  };
}

const BUILDERS: Record<string, (env: ResolverEnv) => VideoResolver | null> = { cobalt, apify, generic };

/** INSTAGRAM_VIDEO_RESOLVERS="apify,cobalt": the order to try. Unknown or unconfigured names are skipped. */
export function loadResolvers(env: ResolverEnv = process.env): VideoResolver[] {
  const out: VideoResolver[] = [];
  for (const name of (env.INSTAGRAM_VIDEO_RESOLVERS ?? '').split(',').map((s) => s.trim().toLowerCase())) {
    const built = BUILDERS[name]?.(env);
    if (built && !out.some((r) => r.name === built.name)) out.push(built);
  }
  return out;
}
