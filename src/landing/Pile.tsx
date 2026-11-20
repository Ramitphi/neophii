// A pile of saves that settles into the user's own categories. Each card turns over to show
// the reason it was kept, in the user's exact words (or an honest "no note" with a labelled guess).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Bike,
  CookingPot,
  Croissant,
  Lamp,
  Music,
  Shirt,
  Shuffle,
  TreePalm,
  Utensils,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { prefersCalm } from './Panel';
import type { LandingStrings } from './strings';

type CatId = 'goa' | 'cooking' | 'wedding' | 'cafe';

interface Pos {
  x: number;
  y: number;
  r: number;
}

interface PileItem {
  id: string;
  title: string;
  platform: string;
  Icon: LucideIcon;
  tint: string;
  note: string | null;
  cat: CatId;
  scatter: Pos;
  mScatter: Pos;
}

// Category names are the user's own (from the sample library), so they stay as typed.
const CATEGORIES: { id: CatId; name: string }[] = [
  { id: 'goa', name: 'Goa in January' },
  { id: 'cooking', name: 'Sunday cooking' },
  { id: 'wedding', name: "Cousin's wedding" },
  { id: 'cafe', name: 'Cafe launch content' },
];

const ITEMS: PileItem[] = [
  { id: 'sangeet', title: 'Sangeet group choreography', platform: 'Reel', Icon: Music, tint: '#f6d5c8', note: 'the red shirt', cat: 'wedding', scatter: { x: 12, y: 8, r: -8 }, mScatter: { x: 4, y: 2, r: -8 } },
  { id: 'paneer', title: 'Dhaba style paneer', platform: 'Short', Icon: CookingPot, tint: '#f1dfb4', note: 'Sunday ko banana hai, kasuri methi wala step', cat: 'cooking', scatter: { x: 38, y: 4, r: 5 }, mScatter: { x: 52, y: 6, r: 6 } },
  { id: 'beach', title: 'Quiet beach shack', platform: 'Reel', Icon: TreePalm, tint: '#cfe2dc', note: null, cat: 'goa', scatter: { x: 64, y: 10, r: -4 }, mScatter: { x: 30, y: 20, r: -4 } },
  { id: 'coast', title: 'Coast road by scooter', platform: 'Reel', Icon: Bike, tint: '#d5dfe9', note: 'is raste se jaana hai, subah subah', cat: 'goa', scatter: { x: 78, y: 40, r: 9 }, mScatter: { x: 64, y: 28, r: 9 } },
  { id: 'poi', title: 'Breakfast list, South Goa', platform: 'Link', Icon: Croissant, tint: '#efe3c9', note: 'poi bread wali jagah', cat: 'goa', scatter: { x: 6, y: 48, r: 6 }, mScatter: { x: 6, y: 38, r: 5 } },
  { id: 'ragi', title: 'Ragi dosa, 5 ingredients', platform: 'Short', Icon: Utensils, tint: '#e9d9c4', note: 'try this weekend', cat: 'cooking', scatter: { x: 30, y: 38, r: -6 }, mScatter: { x: 40, y: 46, r: -7 } },
  { id: 'dupatta', title: 'Dupatta, three ways', platform: 'Reel', Icon: Shirt, tint: '#ecd3dc', note: 'second style for mehendi', cat: 'wedding', scatter: { x: 52, y: 52, r: 3 }, mScatter: { x: 10, y: 62, r: 4 } },
  { id: 'desk', title: 'Small desk setup', platform: 'Screenshot', Icon: Lamp, tint: '#dcd8ec', note: 'lamp ka angle, for my reels corner', cat: 'cafe', scatter: { x: 22, y: 64, r: 10 }, mScatter: { x: 56, y: 70, r: 8 } },
];

function settledPos(item: PileItem, narrow: boolean): Pos {
  const col = CATEGORIES.findIndex((c) => c.id === item.cat);
  const idx = ITEMS.filter((i) => i.cat === item.cat).findIndex((i) => i.id === item.id);
  const tilt = idx % 2 === 0 ? -1.5 : 1.5;
  if (narrow) {
    return { x: 3 + idx * 32.5, y: 1 + col * 25 + 5.5, r: tilt };
  }
  return { x: 3 + col * 24.5, y: 22 + idx * 20, r: tilt };
}

function tabPos(index: number, narrow: boolean): CSSProperties {
  return narrow
    ? { left: '3%', top: `${1 + index * 25}%`, width: '94%' }
    : { left: `${3 + index * 24.5}%`, top: '3%', width: '22%' };
}

function useNarrow(query = '(max-width: 640px)') {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

export function Pile({ s }: { s: LandingStrings }) {
  const narrow = useNarrow();
  const [settled, setSettled] = useState(() => prefersCalm());
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [lifted, setLifted] = useState<string | null>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  // The first time the desk comes into view, it settles by itself once, unless the visitor acts first.
  useEffect(() => {
    const desk = deskRef.current;
    if (!desk || prefersCalm() || !('IntersectionObserver' in window)) return;
    let timer = 0;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          timer = window.setTimeout(() => {
            if (!touched.current) setSettled(true);
          }, 1400);
          watcher.disconnect();
        }
      },
      { threshold: 0.45 }
    );
    watcher.observe(desk);
    return () => {
      watcher.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  const toggleFlip = (id: string) => {
    touched.current = true;
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="lp-pile">
      <div
        ref={deskRef}
        className={`lp-desk ${settled ? 'is-settled' : ''} ${narrow ? 'is-narrow' : ''}`}
        onPointerLeave={() => setLifted(null)}
      >
        {CATEGORIES.map((c, i) => (
          <div key={c.id} className="lp-desk-tab" style={tabPos(i, narrow)} aria-hidden={!settled}>
            <b>{c.name}</b>
            <span>{s.pile.categoryWhy[c.id]}</span>
          </div>
        ))}

        {ITEMS.map((item, i) => {
          const p = settled ? settledPos(item, narrow) : narrow ? item.mScatter : item.scatter;
          const isFlipped = flipped.has(item.id);
          const style = {
            left: `${p.x}%`,
            top: `${p.y}%`,
            '--r': `${p.r}deg`,
            '--d': `${i * 55}ms`,
            zIndex: lifted === item.id ? 20 : isFlipped ? 10 : i + 1,
          } as CSSProperties;
          return (
            <button
              key={item.id}
              type="button"
              className={`lp-card ${isFlipped ? 'is-flipped' : ''}`}
              style={style}
              aria-pressed={isFlipped}
              aria-label={`${item.title}. ${s.pile.backLabel}: ${item.note ?? s.pile.noNote}`}
              onClick={() => toggleFlip(item.id)}
              onPointerEnter={() => setLifted(item.id)}
              onFocus={() => setLifted(item.id)}
            >
              <span className="lp-card-inner" aria-hidden="true">
                <span className="lp-card-face lp-card-front">
                  <span className="lp-card-art" style={{ background: item.tint }}>
                    <item.Icon size={30} strokeWidth={1.5} />
                    <span className="lp-card-platform">{item.platform}</span>
                  </span>
                  <span className="lp-card-title">{item.title}</span>
                </span>
                <span className="lp-card-face lp-card-back">
                  <span className="lp-card-why">{s.pile.backLabel}</span>
                  {item.note ? (
                    <span className="lp-card-note">{item.note}</span>
                  ) : (
                    <>
                      <span className="lp-card-nonote">{s.pile.noNote}</span>
                      <span className="lp-card-guess">{s.pile.noNoteAI}</span>
                    </>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="lp-desk-foot">
        <button
          type="button"
          className="lp-btn"
          onClick={() => {
            touched.current = true;
            setSettled((v) => !v);
          }}
        >
          {settled ? <Shuffle size={16} aria-hidden="true" /> : <LayoutGrid size={16} aria-hidden="true" />}
          <span>{settled ? s.pile.scatter : s.pile.sort}</span>
        </button>
        <p className="lp-hint">{s.pile.hint}</p>
        <span className="lp-stamp">{s.pile.sample}</span>
      </div>
    </div>
  );
}
