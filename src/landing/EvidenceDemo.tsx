// "It shows its work": a sample reel with three lanes. Pointing at any line moves the clip to the
// second it cites and outlines the region. The line with no evidence says so and points at nothing.
import { useEffect, useState } from 'react';
import { Instagram, Pause, Play } from 'lucide-react';
import { prefersCalm } from './Panel';
import { SangeetScene } from './SangeetScene';
import type { LandingStrings } from './strings';

const DURATION = 18;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ClaimId = 'note' | 'caption' | 'red' | 'lights' | 'intent' | 'brand';

interface EvidenceRef {
  chip: string;
  t?: number;
  tEnd?: number;
  box?: Box;
}

const EV: Record<'ev1' | 'ev2' | 'ev3', EvidenceRef> = {
  ev1: { chip: 'frame 0:07–0:12', t: 7, tEnd: 12, box: { x: 24, y: 30, w: 22, h: 35 } },
  ev2: { chip: 'caption' },
  ev3: { chip: 'frame 0:02–0:05', t: 2, tEnd: 5, box: { x: 5, y: 6, w: 90, h: 12 } },
};

const CLAIM_EVIDENCE: Record<ClaimId, EvidenceRef | null> = {
  note: EV.ev1,
  caption: EV.ev2,
  red: EV.ev1,
  lights: EV.ev3,
  intent: EV.ev1,
  brand: null,
};

const fmt = (sec: number) => `0:${String(Math.floor(sec)).padStart(2, '0')}`;

export function EvidenceDemo({ s }: { s: LandingStrings }) {
  const e = s.evidence;
  const [time, setTime] = useState(9);
  const [playing, setPlaying] = useState(() => !prefersCalm());
  const [active, setActive] = useState<ClaimId | null>(null);

  useEffect(() => {
    if (!playing || active) return;
    const id = window.setInterval(() => setTime((t) => (t + 0.1 >= DURATION ? 0 : t + 0.1)), 100);
    return () => window.clearInterval(id);
  }, [playing, active]);

  const ev = active ? CLAIM_EVIDENCE[active] : null;
  const box = ev?.box ?? null;

  const point = (id: ClaimId | null) => {
    setActive(id);
    const target = id ? CLAIM_EVIDENCE[id] : null;
    if (target?.t !== undefined) setTime(target.t + 0.6);
  };

  const claimProps = (id: ClaimId) => ({
    onPointerEnter: () => point(id),
    onPointerLeave: () => point(null),
    onFocus: () => point(id),
    onBlur: () => point(null),
    onClick: () => point(active === id ? null : id),
    'aria-pressed': active === id,
    className: `lp-claim ${active === id ? 'is-active' : ''}`,
  });

  const aiClaims: { id: ClaimId; title: string; where?: string; conf: number; ev: EvidenceRef | null }[] = [
    { id: 'red', title: e.claims.redShirt, where: e.claims.redShirtWhere, conf: 0.91, ev: EV.ev1 },
    { id: 'lights', title: e.claims.lights, where: e.claims.lightsWhere, conf: 0.74, ev: EV.ev3 },
    { id: 'intent', title: e.claims.intent, conf: 0.82, ev: EV.ev1 },
    { id: 'brand', title: e.claims.brand, conf: 0.18, ev: null },
  ];

  return (
    <div className="lp-evidence">
      <figure className="lp-frame">
        <div className="lp-frame-pic">
          <SangeetScene t={time} title={e.sceneAlt} />
          {box && (
            <div
              className={`lp-frame-box ${box.y < 15 ? 'is-top' : ''}`}
              style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
            >
              <span>{ev?.chip}</span>
            </div>
          )}
          {active === 'brand' && (
            <div className="lp-frame-nothing" role="status">
              {e.nothingToPoint}
            </div>
          )}
          <span className="lp-stamp lp-frame-stamp">Sample</span>
        </div>
        <div className="lp-timeline">
          <button
            type="button"
            className="lp-icon-btn"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? e.pause : e.play}
          >
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
          <span className="lp-tnum">{fmt(time)}</span>
          <div className="lp-track">
            {[EV.ev3, EV.ev1].map((pin) => (
              <span
                key={pin.chip}
                className={`lp-pin ${ev === pin ? 'is-on' : ''}`}
                style={{ left: `${(pin.t! / DURATION) * 100}%`, width: `${((pin.tEnd! - pin.t!) / DURATION) * 100}%` }}
              />
            ))}
            <span className="lp-playhead" style={{ left: `${(time / DURATION) * 100}%` }} />
            <input
              type="range"
              min={0}
              max={DURATION}
              step={0.1}
              value={time}
              onChange={(ev2) => {
                setPlaying(false);
                setTime(Number(ev2.target.value));
              }}
              aria-label={e.timeline}
              aria-valuetext={`${fmt(time)} / ${fmt(DURATION)}`}
            />
          </div>
          <span className="lp-tnum">{fmt(DURATION)}</span>
        </div>
      </figure>

      <div className="lp-lanes">
        <div className="lp-lane lp-lane-source">
          <h3>{e.laneSource}</h3>
          <p className="lp-source-meta">
            <Instagram size={15} aria-hidden="true" /> Instagram · Reel · 0:18
          </p>
          <button type="button" {...claimProps('caption')}>
            <span className="lp-claim-body">
              <span className="lp-quote">“{e.caption}”</span>
            </span>
            <span className="lp-chip">caption</span>
          </button>
        </div>

        <div className="lp-lane lp-lane-you">
          <h3>{e.laneYou}</h3>
          <button type="button" {...claimProps('note')}>
            <span className="lp-claim-body">
              <span className="lp-your-words">the red shirt</span>
              <span className="lp-small">{e.keptExactly}</span>
              <span className="lp-grounded">
                ✓ {e.grounded}: {e.groundingText}
              </span>
            </span>
            <span className="lp-chip">{EV.ev1.chip}</span>
          </button>
        </div>

        <div className="lp-lane lp-lane-ai">
          <h3>
            {e.laneAI} <span className="lp-ai-pill">{e.aiPill}</span>
          </h3>
          <ul>
            {aiClaims.map((c) => (
              <li key={c.id}>
                <button type="button" {...claimProps(c.id)} data-unsure={c.ev ? undefined : ''}>
                  <span className="lp-claim-body">
                    <span className="lp-claim-title">
                      {c.title}
                      {c.where && <span className="lp-small"> · {c.where}</span>}
                    </span>
                    {c.ev ? (
                      <span className="lp-conf">
                        <span className="lp-conf-bar">
                          <span style={{ width: `${c.conf * 100}%` }} />
                        </span>
                        <span className="lp-small">
                          {Math.round(c.conf * 100)}% {e.confidence}
                        </span>
                      </span>
                    ) : (
                      <span className="lp-notsure">{e.notSure}</span>
                    )}
                  </span>
                  {c.ev && <span className="lp-chip">{c.ev.chip}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="lp-hint">{e.hint}</p>
      </div>
    </div>
  );
}
