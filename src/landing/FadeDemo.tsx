// Drag time forward: saves blur and go quiet, until Neophi brings one back with a stated reason.
import { useState, type CSSProperties } from 'react';
import { Coffee, Shirt, Sprout, TreePalm, Utensils, type LucideIcon } from 'lucide-react';
import type { LandingStrings } from './strings';

interface FadeItem {
  id: string;
  title: string;
  note: string | null;
  savedDaysAgo: number;
  Icon: LucideIcon;
  tint: string;
  resurfaces?: boolean;
}

const ITEMS: FadeItem[] = [
  { id: 'ragi', title: 'Ragi dosa, 5 ingredients', note: 'try this weekend', savedDaysAgo: 2, Icon: Utensils, tint: '#e9d9c4' },
  { id: 'dupatta', title: 'Dupatta, three ways', note: 'second style for mehendi', savedDaysAgo: 4, Icon: Shirt, tint: '#ecd3dc' },
  { id: 'chai', title: 'Slow chai pour', note: null, savedDaysAgo: 6, Icon: Coffee, tint: '#f1dfb4' },
  { id: 'beach', title: 'Quiet beach shack', note: null, savedDaysAgo: 9, Icon: TreePalm, tint: '#cfe2dc', resurfaces: true },
  { id: 'plant', title: 'Plant shelf screenshot', note: 'बालकनी के लिए', savedDaysAgo: 12, Icon: Sprout, tint: '#d9e6c8' },
];

const MAX_LATER = 30;
const RESURFACE_AT_AGE = 21;

export function FadeDemo({ s }: { s: LandingStrings }) {
  const f = s.fade;
  const [later, setLater] = useState(0);
  const beach = ITEMS.find((i) => i.resurfaces)!;
  const back = beach.savedDaysAgo + later >= RESURFACE_AT_AGE;

  return (
    <div className="lp-fade">
      <label className="lp-fade-control">
        <span className="lp-label">{f.slider}</span>
        <input
          type="range"
          min={0}
          max={MAX_LATER}
          step={1}
          value={later}
          onChange={(e) => setLater(Number(e.target.value))}
          aria-valuetext={f.later(later)}
        />
        <span className="lp-fade-later lp-tnum">{f.later(later)}</span>
      </label>

      <ol className="lp-fade-row">
        {ITEMS.map((item) => {
          const age = item.savedDaysAgo + later;
          const isBack = Boolean(item.resurfaces && back);
          // Saves stay crisp for about a week, then go quiet.
          const fade = Math.min(1, Math.max(0, age - 6) / 26);
          const style = isBack
            ? undefined
            : ({
                '--fade-o': Math.max(0.14, 1 - fade),
                '--fade-b': `${Math.min(3.5, fade * 4)}px`,
                '--fade-g': fade,
              } as CSSProperties);
          return (
            <li key={item.id} className={`lp-fade-card ${isBack ? 'is-back' : ''}`} style={style}>
              {isBack && <span className="lp-fade-tag">{f.tag}</span>}
              <span className="lp-fade-art" style={{ background: item.tint }} aria-hidden="true">
                <item.Icon size={28} strokeWidth={1.5} />
              </span>
              <b>{item.title}</b>
              {item.note ? <span className="lp-your-words lp-your-words-sm">{item.note}</span> : <span className="lp-small">—</span>}
              <span className="lp-small">{f.saved(age)}</span>
            </li>
          );
        })}
      </ol>

      <p className={`lp-fade-status ${back ? 'is-back' : ''}`} role="status">
        {back ? (
          <>
            <span className="lp-label">{f.whyLabel}</span> {f.why}
          </>
        ) : (
          f.idle
        )}
      </p>
    </div>
  );
}
