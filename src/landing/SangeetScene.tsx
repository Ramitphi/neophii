// An original paper-cut style illustration of a sangeet rehearsal (no third-party content).
// `t` is the clip time in seconds; arms and lights move with it so the scrubber feels like video.

interface DancerProps {
  cx: number;
  top: number;
  scale: number;
  shirt: string;
  lower: string;
  skin: string;
  hair: string;
  phase: number;
  t: number;
  skirt?: boolean;
}

function Dancer({ cx, top, scale, shirt, lower, skin, hair, phase, t, skirt }: DancerProps) {
  const swing = Math.sin(t * 1.7 + phase);
  const leftA = (-120 + swing * 35) * (Math.PI / 180);
  const rightA = (-60 - swing * 35) * (Math.PI / 180);
  const arm = (sx: number, a: number) => {
    const ex = sx + Math.cos(a) * 26;
    const ey = 26 + Math.sin(a) * 26;
    const hx = ex + Math.cos(a + (sx < 0 ? -0.5 : 0.5)) * 22;
    const hy = ey + Math.sin(a + (sx < 0 ? -0.5 : 0.5)) * 22;
    return { ex, ey, hx, hy };
  };
  const l = arm(-18, leftA);
  const r = arm(18, rightA);
  const bob = Math.abs(Math.sin(t * 1.7 + phase)) * 3;

  return (
    <g transform={`translate(${cx} ${top - bob}) scale(${scale})`}>
      {skirt ? (
        <path d="M-20 84 L20 84 L40 152 Q0 160 -40 152 Z" fill={lower} />
      ) : (
        <>
          <path d="M-10 88 L-15 150" stroke={lower} strokeWidth="13" strokeLinecap="round" />
          <path d="M10 88 L15 150" stroke={lower} strokeWidth="13" strokeLinecap="round" />
        </>
      )}
      <ellipse cx="-16" cy="154" rx="9" ry="4" fill="#3d362c" />
      <ellipse cx="16" cy="154" rx="9" ry="4" fill="#3d362c" />
      <path d={`M-18 26 L${l.ex} ${l.ey} L${l.hx} ${l.hy}`} stroke={shirt} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M18 26 L${r.ex} ${r.ey} L${r.hx} ${r.hy}`} stroke={shirt} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={l.hx} cy={l.hy} r="5" fill={skin} />
      <circle cx={r.hx} cy={r.hy} r="5" fill={skin} />
      <path d="M-22 22 Q0 14 22 22 L26 92 Q0 98 -26 92 Z" fill={shirt} />
      <path d="M-6 18 L0 30 L6 18" fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth="2" />
      <rect x="-5" y="10" width="10" height="9" fill={skin} />
      <circle cx="0" cy="0" r="16" fill={skin} />
      <path d="M-16 -2 Q-15 -19 0 -18 Q15 -19 16 -2 Q10 -11 0 -10 Q-10 -11 -16 -2 Z" fill={hair} />
    </g>
  );
}

function bulbAt(s: number) {
  const p0 = { x: 10, y: 36 };
  const p1 = { x: 200, y: 96 };
  const p2 = { x: 390, y: 36 };
  const a = (1 - s) * (1 - s);
  const b = 2 * (1 - s) * s;
  const c = s * s;
  return { x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y };
}

export function SangeetScene({ t, title }: { t: number; title: string }) {
  const bulbs = Array.from({ length: 13 }, (_, i) => bulbAt((i + 0.5) / 13));
  return (
    <svg viewBox="0 0 400 500" role="img" aria-label={title} className="lp-scene">
      <rect width="400" height="500" fill="#efe2c8" />
      <path d="M120 330 V178 A80 80 0 0 1 280 178 V330 Z" fill="#e2cfab" />
      {Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 4 }, (_, col) => (
          <circle key={`${row}-${col}`} cx={155 + col * 30} cy={185 + row * 28} r="6" fill="none" stroke="#c9b38a" strokeWidth="2" />
        ))
      )}
      <rect x="0" y="330" width="400" height="170" fill="#d9c39b" />
      <path d="M0 330 H400" stroke="#b9a37a" strokeWidth="2" />
      <ellipse cx="200" cy="420" rx="175" ry="42" fill="#b8290a" opacity="0.16" />

      <path d="M10 36 Q200 96 390 36" stroke="#6b5a3a" strokeWidth="1.5" fill="none" />
      {bulbs.map((b, i) => {
        const glow = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3 + i * 1.3));
        return (
          <g key={i}>
            <circle cx={b.x} cy={b.y + 4} r="9" fill="#f2b632" opacity={glow} />
            <circle cx={b.x} cy={b.y + 4} r="4.5" fill="#f2b632" />
          </g>
        );
      })}

      <Dancer cx={215} top={182} scale={0.8} shirt="#2f6f6a" lower="#c99a3a" skin="#a8714f" hair="#2b2119" phase={1.1} t={t} skirt />
      <Dancer cx={342} top={180} scale={0.8} shirt="#c99a3a" lower="#5b4a8a" skin="#c58c66" hair="#2b2119" phase={2.3} t={t} skirt />
      <Dancer cx={282} top={170} scale={1} shirt="#2d3a5a" lower="#e7c46a" skin="#b27a55" hair="#1f1813" phase={0.4} t={t} skirt />
      <Dancer cx={140} top={166} scale={1} shirt="#d6331b" lower="#2a2620" skin="#bf8460" hair="#1f1813" phase={0} t={t} />
    </svg>
  );
}
