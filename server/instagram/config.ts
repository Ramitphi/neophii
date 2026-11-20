// Instagram DM pipeline configuration. Everything comes from the environment; secrets are never logged,
// never returned by an endpoint and never written to Firestore.

export interface InstagramConfig {
  /** Parent Meta app secret: validates X-Hub-Signature-256 on POST deliveries. */
  appSecret: string;
  /** Random token typed into the Meta callback form: answers the GET challenge only. */
  verifyToken: string;
  /** Numeric ID of the connected professional account. Only deliveries to this recipient are processed. */
  recipientId: string;
  /** Public username of that account (no @), shown on the site so people know where to send. Not a secret. */
  handle: string;
  /** "Try without Instagram": lets a signed-in person send a simulated share into their own library. Off by default. */
  demoSender: boolean;
  /** Pre-approved tester mapping: Instagram-scoped sender ID -> Firebase UID. Unknown senders are denied. */
  senderUidMap: Map<string, string>;
  /** Optional token for the documented Graph message attachment read. Sent only as a header. */
  accessToken: string;
  graphHost: string;
  graphVersion: string;
  /** Host suffixes media may be downloaded from (HTTPS only, redirects re-checked). */
  mediaHosts: string[];
  maxMediaBytes: number;
  mediaTimeoutMs: number;
  maxBodyBytes: number;
  /** Deliveries whose event time is older than this are ignored as stale. */
  maxEventAgeMs: number;
  /** A note waits this long before it is matched, so its share delivery can land first. */
  noteSettleMs: number;
  /** Notes attach to the most recent preceding share within this window. */
  noteWindowMs: number;
  maxAttempts: number;
  leaseMs: number;
  workerBatch: number;
  /** In-process poller interval. 0 disables it (use the internal worker endpoint instead). */
  pollMs: number;
  /** Shared bearer secret for the internal worker endpoint (e.g. a VM cron). */
  workerSecret: string;
  /** Google OIDC audience and caller for the internal worker endpoint (Cloud Scheduler / Cloud Tasks). */
  workerOidcAudience: string;
  workerServiceAccount: string;
  /** Setup aid, off by default: log the Instagram-scoped ID (only) of a denied sender so it can be paired. */
  logDeniedSenders: boolean;
}

const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const IGSID_RE = /^[0-9A-Za-z_-]{1,64}$/;

/** Parses "igsid=uid,igsid2=uid2". Malformed pairs are dropped rather than guessed. */
export function parseSenderUidMap(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of (raw ?? '').split(',')) {
    const [sender, uid, ...rest] = pair.split('=').map((s) => s.trim());
    if (rest.length > 0 || !sender || !uid) continue;
    if (!IGSID_RE.test(sender) || !UID_RE.test(uid)) continue;
    map.set(sender, uid);
  }
  return map;
}

/** An Instagram username (letters, digits, dots, underscores; at most 30), with an optional leading @. */
export function parseHandle(raw: string | undefined): string {
  const h = (raw ?? '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : '';
}

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const DEFAULT_MEDIA_HOSTS = ['lookaside.fbsbx.com', 'fbcdn.net', 'cdninstagram.com'];

export function loadInstagramConfig(env: NodeJS.ProcessEnv = process.env): InstagramConfig {
  const hosts = (env.INSTAGRAM_MEDIA_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]+$/.test(h));
  return {
    appSecret: env.META_APP_SECRET ?? '',
    verifyToken: env.META_VERIFY_TOKEN ?? '',
    recipientId: (env.META_IG_RECIPIENT_ID ?? '').trim(),
    handle: parseHandle(env.INSTAGRAM_HANDLE),
    demoSender: env.INSTAGRAM_DEMO_SENDER === '1',
    senderUidMap: parseSenderUidMap(env.INSTAGRAM_SENDER_UID_MAP),
    accessToken: env.INSTAGRAM_ACCESS_TOKEN ?? '',
    graphHost: (env.META_GRAPH_HOST || 'graph.instagram.com').trim(),
    graphVersion: (env.META_GRAPH_VERSION || 'v27.0').trim(),
    mediaHosts: hosts.length > 0 ? hosts : DEFAULT_MEDIA_HOSTS,
    maxMediaBytes: num(env.INSTAGRAM_MAX_MEDIA_BYTES, 15 * 1024 * 1024),
    mediaTimeoutMs: num(env.INSTAGRAM_MEDIA_TIMEOUT_MS, 25_000),
    maxBodyBytes: 1024 * 1024,
    maxEventAgeMs: num(env.INSTAGRAM_MAX_EVENT_AGE_HOURS, 48) * 3_600_000,
    noteSettleMs: 15_000,
    noteWindowMs: 10 * 60 * 1000,
    maxAttempts: Math.max(1, Math.floor(num(env.INSTAGRAM_JOB_MAX_ATTEMPTS, 5))),
    leaseMs: 5 * 60 * 1000,
    workerBatch: 10,
    pollMs: num(env.INSTAGRAM_WORKER_POLL_MS, 0),
    workerSecret: env.INSTAGRAM_WORKER_SECRET ?? '',
    workerOidcAudience: (env.INSTAGRAM_WORKER_OIDC_AUDIENCE ?? '').trim(),
    workerServiceAccount: (env.INSTAGRAM_WORKER_SERVICE_ACCOUNT ?? '').trim().toLowerCase(),
    logDeniedSenders: env.INSTAGRAM_LOG_DENIED_SENDERS === '1',
  };
}
