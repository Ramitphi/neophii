// A demo feed built from three real Reel links and the words they were saved with.
// The videos are not fetched or described: categories come only from the saver's own context text.
import { useState } from 'react';
import { Car, Clapperboard, ExternalLink, Instagram, Layers, TrendingUp, type LucideIcon } from 'lucide-react';
import type { LandingStrings } from './strings';

type FeedCat = 'cars' | 'investing' | 'entertainment';

interface FeedCategory {
  id: FeedCat;
  name: string;
  Icon: LucideIcon;
  tint: string;
}

interface FeedSave {
  reelId: string;
  url: string;
  note: string;
  chip: string;
  cat: FeedCat;
}

// Category names are built from the saver's own words, so they are not translated.
const CATEGORIES: FeedCategory[] = [
  { id: 'cars', name: 'Cars to buy', Icon: Car, tint: '#d5dfe9' },
  { id: 'investing', name: 'Investing', Icon: TrendingUp, tint: '#d9e6c8' },
  { id: 'entertainment', name: 'Entertainment', Icon: Clapperboard, tint: '#ecd3dc' },
];

// Links are stored without share-tracking parameters.
const SAVES: FeedSave[] = [
  { reelId: 'Df1HBXLTOHV', url: 'https://www.instagram.com/reel/Df1HBXLTOHV/', note: 'car to buy', chip: 'Buy', cat: 'cars' },
  { reelId: 'Df9ABiAxjL4', url: 'https://www.instagram.com/reel/Df9ABiAxjL4/', note: 'investment advice', chip: 'Learn', cat: 'investing' },
  { reelId: 'DdMJHsmooUM', url: 'https://www.instagram.com/reel/DdMJHsmooUM/', note: 'entertainment', chip: 'Just remember', cat: 'entertainment' },
];

const catOf = (id: FeedCat) => CATEGORIES.find((c) => c.id === id)!;

export function FeedDemo({ s }: { s: LandingStrings }) {
  const f = s.feed;
  const [filter, setFilter] = useState<FeedCat | 'all'>('all');
  const shown = filter === 'all' ? SAVES : SAVES.filter((x) => x.cat === filter);

  return (
    <div className="lp-feed">
      <div className="lp-feed-tiles" role="group" aria-label={f.filterLabel}>
        <button
          type="button"
          className={`lp-feed-tile ${filter === 'all' ? 'is-on' : ''}`}
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          <span className="lp-feed-tile-icon" style={{ background: 'var(--paper-deep)' }} aria-hidden="true">
            <Layers size={22} strokeWidth={1.6} />
          </span>
          <span className="lp-feed-tile-text">
            <b>{f.all}</b>
            <span className="lp-small">{f.count(SAVES.length)}</span>
          </span>
        </button>
        {CATEGORIES.map((c) => {
          const items = SAVES.filter((x) => x.cat === c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`lp-feed-tile ${filter === c.id ? 'is-on' : ''}`}
              aria-pressed={filter === c.id}
              onClick={() => setFilter(filter === c.id ? 'all' : c.id)}
            >
              <span className="lp-feed-tile-icon" style={{ background: c.tint }} aria-hidden="true">
                <c.Icon size={22} strokeWidth={1.6} />
              </span>
              <span className="lp-feed-tile-text">
                <b>{c.name}</b>
                <span className="lp-small">{f.count(items.length)}</span>
                <span className="lp-feed-tile-why">{f.whyFrom(items.map((i) => i.note).join('”, “'))}</span>
              </span>
            </button>
          );
        })}
      </div>

      <ul className="lp-feed-grid" aria-live="polite">
        {shown.map((save) => {
          const c = catOf(save.cat);
          return (
            <li key={save.reelId} className="lp-feed-card">
              <div className="lp-feed-poster" style={{ background: c.tint }}>
                <span className="lp-feed-platform">
                  <Instagram size={13} aria-hidden="true" /> Instagram · Reel
                </span>
                <c.Icon size={44} strokeWidth={1.3} aria-hidden="true" />
                <span className="lp-feed-linkonly">{f.linkOnly}</span>
              </div>
              <div className="lp-feed-body">
                <span className="lp-feed-cat">
                  <b>{c.name}</b>
                  <span>{f.whyFrom(save.note)}</span>
                </span>
                <span className="lp-label">{f.yourWords}</span>
                <span className="lp-your-words">{save.note}</span>
                <p className="lp-feed-ai">
                  <span className="lp-ai-pill">{s.evidence.aiPill}</span> {f.aiNone}
                </p>
                <div className="lp-feed-foot">
                  <span className="lp-chipbtn is-on" title={f.chipLabel}>
                    {save.chip}
                  </span>
                  <span className="lp-small">{f.savedToday}</span>
                  <a className="lp-feed-open" href={save.url} target="_blank" rel="noopener noreferrer">
                    {f.open} <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
