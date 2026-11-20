// Half-remembered queries type themselves out; Neophi shows how it understood each one in
// English, Hindi and Hinglish, and why the result matched. Sample data only.
import { useEffect, useState } from 'react';
import { CookingPot, Croissant, Lamp, Music, Search, type LucideIcon } from 'lucide-react';
import type { LanguageCode } from '../types/neophi';
import { prefersCalm } from './Panel';
import type { LandingStrings } from './strings';

interface DemoQuery {
  q: string;
  english: string;
  hindi: string;
  hinglish: string;
  time: 'last_week' | 'last_month' | null;
  title: string;
  note: string;
  Icon: LucideIcon;
  tint: string;
  why: Record<LanguageCode, string>;
}

const QUERIES: DemoQuery[] = [
  {
    q: 'laal shirt wala dance, pichle mahine',
    english: 'red shirt dance',
    hindi: 'लाल शर्ट वाला डांस',
    hinglish: 'laal shirt wala dance',
    time: 'last_month',
    title: 'Sangeet group choreography',
    note: 'the red shirt',
    Icon: Music,
    tint: '#f6d5c8',
    why: {
      en: 'Your note says “the red shirt” · a red shirt is seen at 0:07–0:12',
      hinglish: 'Tumhare note mein “the red shirt” · laal shirt 0:07–0:12 pe dikhti hai',
      hi: 'आपके नोट में “the red shirt” · लाल शर्ट 0:07–0:12 पर दिखती है',
    },
  },
  {
    q: 'पोई ब्रेड वाली जगह',
    english: 'place with poi bread',
    hindi: 'पोई ब्रेड वाली जगह',
    hinglish: 'poi bread wali jagah',
    time: null,
    title: 'Breakfast list, South Goa',
    note: 'poi bread wali jagah',
    Icon: Croissant,
    tint: '#efe3c9',
    why: {
      en: 'Your note: “poi bread wali jagah” · the caption mentions poi bread',
      hinglish: 'Tumhara note: “poi bread wali jagah” · caption mein poi bread hai',
      hi: 'आपका नोट: “poi bread wali jagah” · कैप्शन में poi bread है',
    },
  },
  {
    q: 'that lamp angle thing for reels',
    english: 'desk lamp angle for reels',
    hindi: 'रील्स के लिए लैंप का एंगल',
    hinglish: 'reels ke liye lamp ka angle',
    time: null,
    title: 'Small desk setup',
    note: 'lamp ka angle, for my reels corner',
    Icon: Lamp,
    tint: '#dcd8ec',
    why: {
      en: 'Your note: “lamp ka angle, for my reels corner”',
      hinglish: 'Tumhara note: “lamp ka angle, for my reels corner”',
      hi: 'आपका नोट: “lamp ka angle, for my reels corner”',
    },
  },
  {
    q: 'kasuri methi wala step',
    english: 'the kasuri methi step',
    hindi: 'कसूरी मेथी वाला स्टेप',
    hinglish: 'kasuri methi wala step',
    time: null,
    title: 'Dhaba style paneer',
    note: 'Sunday ko banana hai, kasuri methi wala step',
    Icon: CookingPot,
    tint: '#f1dfb4',
    why: {
      en: 'Your note mentions “kasuri methi wala step” · so does the caption',
      hinglish: 'Tumhare note mein “kasuri methi wala step” · caption mein bhi',
      hi: 'आपके नोट में “kasuri methi wala step” · कैप्शन में भी',
    },
  },
];

export function SearchDemo({ s, lang }: { s: LandingStrings; lang: LanguageCode }) {
  const calm = prefersCalm();
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(() => (calm ? QUERIES[0].q.length : 0));
  const [auto, setAuto] = useState(!calm);
  const query = QUERIES[index];
  const chars = Array.from(query.q);
  const done = typed >= chars.length;

  useEffect(() => {
    if (done) {
      if (!auto) return;
      const id = window.setTimeout(() => {
        setIndex((i) => (i + 1) % QUERIES.length);
        setTyped(0);
      }, 3600);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setTyped((n) => n + 1), 48);
    return () => window.clearTimeout(id);
  }, [typed, done, auto]);

  const pick = (i: number) => {
    setAuto(false);
    setIndex(i);
    setTyped(calm ? Array.from(QUERIES[i].q).length : 0);
  };

  return (
    <div className="lp-search">
      <div className="lp-search-box" role="group" aria-label={s.search.inputLabel}>
        <Search size={18} aria-hidden="true" />
        <span className="lp-search-text" aria-live="off">
          {chars.slice(0, typed).join('')}
          <span className={`lp-caret ${done ? 'is-idle' : ''}`} aria-hidden="true" />
        </span>
      </div>

      <div className={`lp-search-out ${done ? 'is-in' : ''}`} aria-live="polite">
        {done && (
          <>
            <div className="lp-understood">
              <span className="lp-label">{s.search.understoodAs}</span>
              <span className="lp-tag">
                <i>{s.search.english}</i> {query.english}
              </span>
              <span className="lp-tag">
                <i>{s.search.hindi}</i> {query.hindi}
              </span>
              <span className="lp-tag">
                <i>{s.search.hinglish}</i> {query.hinglish}
              </span>
              {query.time && <span className="lp-tag lp-tag-time">{s.search.time[query.time]}</span>}
            </div>

            <article className="lp-result">
              <span className="lp-result-art" style={{ background: query.tint }} aria-hidden="true">
                <query.Icon size={26} strokeWidth={1.5} />
              </span>
              <span className="lp-result-body">
                <b>{query.title}</b>
                <span className="lp-your-words lp-your-words-sm">{query.note}</span>
                <span className="lp-why">
                  <span className="lp-label">{s.search.whyMatched}</span> {query.why[lang]}
                </span>
              </span>
            </article>
          </>
        )}
      </div>

      <div className="lp-search-picks">
        <span className="lp-label">{s.search.tryAnother}</span>
        {QUERIES.map((qq, i) => (
          <button
            key={qq.q}
            type="button"
            className={`lp-pick ${i === index ? 'is-on' : ''}`}
            aria-pressed={i === index}
            onClick={() => pick(i)}
          >
            {qq.q}
          </button>
        ))}
      </div>
    </div>
  );
}
