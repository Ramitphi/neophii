// Connect an Instagram account to this library, once. The page asks the server for a short one-time code; the
// person sends exactly that code to the connected Instagram account as a DM; the page notices by itself and says
// so. After that, every Reel they share to the account is saved here.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Instagram, X } from 'lucide-react';
import { api, type InstagramLinkCode, type InstagramLinkStatus } from '../lib/api';
import { FEED_STRINGS } from '../pages/feedStrings';
import { ComingSoon } from './ComingSoon';
import type { LanguageCode } from '../types/neophi';

const POLL_MS = 3000;
const CODE_KEY = 'neophi_ig_code';

/** The live code is kept in this browser, so going to Instagram and coming back (or a reload) does not issue a new one. */
function readStoredCode(): InstagramLinkCode | null {
  try {
    const raw = localStorage.getItem(CODE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as InstagramLinkCode;
    return c && typeof c.code === 'string' && new Date(c.expiresAt).getTime() > Date.now() + 30_000 ? c : null;
  } catch {
    return null;
  }
}
function storeCode(c: InstagramLinkCode | null): void {
  try {
    if (c) localStorage.setItem(CODE_KEY, JSON.stringify(c));
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* storage blocked: the code lasts for this page only */
  }
}

export function dmUrlFor(handle: string | null): string | null {
  return handle && /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://ig.me/m/${handle}` : null;
}

export function InstagramConnectModal({
  open,
  lang,
  status,
  onStatus,
  onDemoSent,
  onClose,
}: {
  open: boolean;
  lang: LanguageCode;
  status: InstagramLinkStatus | null;
  /** Called with the fresh status whenever it changes (linked, disconnected). */
  onStatus: (status: InstagramLinkStatus) => void;
  /** A simulated share was sent and read; the app should refresh and show it. */
  onDemoSent: () => void;
  onClose: () => void;
}) {
  const T = FEED_STRINGS[lang].ig;
  const [code, setCode] = useState<InstagramLinkCode | null>(null);
  const [phase, setPhase] = useState<'idle' | 'making' | 'error'>('idle');
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const requested = useRef(false);
  const [demoNote, setDemoNote] = useState('');
  const [demoIndex, setDemoIndex] = useState(0);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState(false);

  const makeCode = useCallback(async () => {
    setPhase('making');
    try {
      const made = await api.createInstagramLinkCode();
      setNow(Date.now()); // the clock state may be old if the sheet was closed for a while
      storeCode(made);
      setCode(made);
      setPhase('idle');
    } catch {
      setPhase('error');
    }
  }, []);

  // Closing forgets the code, so the next open starts clean.
  useEffect(() => {
    if (!open) {
      requested.current = false;
      setCode(null);
      setPhase('idle');
      setCopied(false);
    }
  }, [open]);

  // Opening while not linked makes a code straight away: the person already said they want to connect.
  useEffect(() => {
    if (open && status?.available && !status.linked && !requested.current) {
      requested.current = true;
      const kept = readStoredCode();
      if (kept) {
        setNow(Date.now());
        setCode(kept);
      } else {
        void makeCode();
      }
    }
  }, [open, status, makeCode]);

  const expiresMs = code ? new Date(code.expiresAt).getTime() : 0;
  const expired = Boolean(code) && now >= expiresMs;
  const linked = Boolean(status?.linked);
  useEffect(() => {
    if (linked) storeCode(null);
  }, [linked]);

  // Count down, and notice the moment the DM has been received.
  useEffect(() => {
    if (!open || linked) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [open, linked]);

  useEffect(() => {
    if (!open || linked || !code || expired) return;
    let stop = false;
    const poll = window.setInterval(async () => {
      try {
        const next = await api.instagramLink();
        if (!stop && next.linked) onStatus(next);
      } catch {
        /* a missed poll is fine; the next one tries again */
      }
    }, POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(poll);
    };
  }, [open, linked, code, expired, onStatus]);

  // Coming back from Instagram: check at once instead of waiting for the next tick (background tabs are throttled).
  useEffect(() => {
    if (!open || linked || !code || expired) return;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await api.instagramLink();
        if (next.linked) onStatus(next);
      } catch {
        /* the next check tries again */
      }
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [open, linked, code, expired, onStatus]);

  if (!open) return null;

  const handle = status?.handle ?? code?.handle ?? null;
  const dmUrl = dmUrlFor(handle);
  const minutesLeft = code ? Math.max(1, Math.ceil((expiresMs - now) / 60000)) : 15;

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the code is shown selectable, so it can still be copied by hand */
    }
  };

  const sendDemo = async () => {
    setDemoBusy(true);
    setDemoError(false);
    try {
      await api.demoInstagramShare(demoIndex, demoNote);
      setDemoNote('');
      onDemoSent();
    } catch {
      setDemoError(true);
    } finally {
      setDemoBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm(T.disconnectConfirm)) return;
    try {
      await api.unlinkInstagram();
      if (status) onStatus({ ...status, linked: false, linkedAt: null });
      requested.current = false;
    } catch {
      setPhase('error');
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={T.modalTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card ig-modal">
        <div className="ig-modal-head">
          <h2 className="serif-title">
            <Instagram size={22} aria-hidden="true" /> {T.modalTitle}
          </h2>
          <button type="button" onClick={onClose} aria-label={T.close}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {!status ? (
          <p className="muted" role="status">
            {T.makingCode}
          </p>
        ) : !status.available ? (
          <p className="pill" role="status">
            {T.notAvailable}
          </p>
        ) : linked ? (
          <div className="ig-linked" role="status">
            <p className="ig-linked-title">
              <span className="ig-tick" aria-hidden="true">
                <Check size={18} />
              </span>
              {T.linkedTitle}
            </p>
            <p>{T.linkedBody(handle)}</p>
            <p className="muted">{T.linkedHow}</p>
            <div className="ig-actions">
              {dmUrl && (
                <a className="btn btn-primary" href={dmUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} aria-hidden="true" /> {T.openInstagram}
                </a>
              )}
              <button type="button" onClick={onClose}>
                {T.done}
              </button>
              <button type="button" className="ig-disconnect" onClick={() => void disconnect()}>
                {T.disconnect}
              </button>
            </div>
          </div>
        ) : (
          <ol className="ig-steps">
            <li>
              <span className="ig-step-num" aria-hidden="true">1</span>
              <div>
                <p>{T.step1(handle)}</p>
                {dmUrl && (
                  <a className="btn" href={dmUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} aria-hidden="true" /> {T.openInstagram}
                  </a>
                )}
              </div>
            </li>
            <li>
              <span className="ig-step-num" aria-hidden="true">2</span>
              <div>
                <p>{T.step2}</p>
                {phase === 'making' && !code && <p className="muted">{T.makingCode}</p>}
                {phase === 'error' && (
                  <p role="alert">
                    {T.failed}{' '}
                    <button type="button" onClick={() => void makeCode()}>
                      {T.tryAgain}
                    </button>
                  </p>
                )}
                {code && !expired && (
                  <>
                    <div className="ig-code" aria-label={code.code}>
                      {code.code}
                    </div>
                    <div className="ig-code-row">
                      <button type="button" onClick={() => void copy()}>
                        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{' '}
                        {copied ? T.copied : T.copy}
                      </button>
                      <span className="muted">{T.codeHint(minutesLeft)}</span>
                    </div>
                  </>
                )}
                {code && expired && (
                  <p role="status">
                    {T.expired}{' '}
                    <button type="button" className="btn-primary" onClick={() => void makeCode()}>
                      {T.newCode}
                    </button>
                  </p>
                )}
              </div>
            </li>
            <li>
              <span className="ig-step-num" aria-hidden="true">3</span>
              <div>
                <p>{T.step3}</p>
                {code && !expired && (
                  <>
                    <p className="ig-wait muted" role="status">
                      <span className="ig-dot" aria-hidden="true" /> {T.waiting}
                    </p>
                    <p className="muted" style={{ fontSize: '0.85rem' }}>
                      {T.returnHint}
                    </p>
                  </>
                )}
              </div>
            </li>
          </ol>
        )}

        {status?.demoAvailable && (
          <section className="ig-demo" aria-labelledby="ig-demo-title">
            <h3 id="ig-demo-title">{T.demoTitle}</h3>
            <p className="muted">{T.demoBody}</p>
            <label>
              <span>{T.demoSample}</span>
              <select value={demoIndex} onChange={(e) => setDemoIndex(Number(e.target.value))} disabled={demoBusy}>
                {T.demoSamples.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{T.demoNote}</span>
              <textarea value={demoNote} onChange={(e) => setDemoNote(e.target.value)} rows={2} maxLength={500} disabled={demoBusy} />
            </label>
            <button type="button" className="btn-primary" onClick={() => void sendDemo()} disabled={demoBusy}>
              {demoBusy ? T.demoSending : T.demoSend}
            </button>
            {demoError && (
              <p role="alert" className="muted">
                {T.demoFailed}
              </p>
            )}
          </section>
        )}

        <ComingSoon lang={lang} compact />
      </div>
    </div>
  );
}
