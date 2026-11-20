// A phone-style feed of saved Reels. Tabs are categories built from the saver's own words; each card has
// an action rail (open, later, done, copy link), the words it was saved with, and a box to add more context.
// Videos are not fetched or described. No counts are shown, because none are measured.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  Car,
  Check,
  CircleCheck,
  Clapperboard,
  ExternalLink,
  Home,
  Inbox,
  Instagram,
  Link2,
  Pencil,
  Plus,
  Quote,
  Search,
  TrendingUp,
  X,
  Youtube,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import type { LandingStrings } from './strings';

type CatId = 'cars' | 'investing' | 'entertainment' | 'unsorted';
type View = 'feed' | 'search' | 'later' | 'done';

interface Category {
  id: CatId;
  name: string;
  Icon: LucideIcon;
  tint: string;
  match: RegExp | null;
}

interface Save {
  id: string;
  url: string;
  platform: 'Instagram' | 'YouTube' | 'Web';
  notes: string[];
  chip: string;
  cat: CatId;
  later: boolean;
  done: boolean;
  justNow: boolean;
}

// Category names are built from the saver's own words, so they are not translated.
const CATEGORIES: Category[] = [
  { id: 'cars', name: 'Cars to buy', Icon: Car, tint: '#d5dfe9', match: /\b(cars?|suv|bikes?|scooters?|gaadi)\b|गाड़ी|कार|बाइक/i },
  { id: 'investing', name: 'Investing', Icon: TrendingUp, tint: '#d9e6c8', match: /(invest|stocks?|shares?|mutual fund|\bsip\b|finance|money|paisa)|निवेश|पैसा|शेयर/i },
  { id: 'entertainment', name: 'Entertainment', Icon: Clapperboard, tint: '#ecd3dc', match: /(entertain|movies?|films?|songs?|funny|comedy|memes?|series|\bshows?\b)|मज़ेदार|मजेदार|फ़िल्म|फिल्म|गाना/i },
  { id: 'unsorted', name: 'Unsorted', Icon: Inbox, tint: '#e9e2d3', match: null },
];

const CHIP_FOR: Record<CatId, string> = { cars: 'Buy', investing: 'Learn', entertainment: 'Just remember', unsorted: 'Just remember' };

// Real links, stored without share-tracking parameters, with the words they were saved with.
const INITIAL: Save[] = [
  { id: 'Df1HBXLTOHV', url: 'https://www.instagram.com/reel/Df1HBXLTOHV/', platform: 'Instagram', notes: ['car to buy'], chip: 'Buy', cat: 'cars', later: false, done: false, justNow: false },
  { id: 'Df9ABiAxjL4', url: 'https://www.instagram.com/reel/Df9ABiAxjL4/', platform: 'Instagram', notes: ['investment advice'], chip: 'Learn', cat: 'investing', later: false, done: false, justNow: false },
  { id: 'DdMJHsmooUM', url: 'https://www.instagram.com/reel/DdMJHsmooUM/', platform: 'Instagram', notes: ['entertainment'], chip: 'Just remember', cat: 'entertainment', later: false, done: false, justNow: false },
];

const catOf = (id: CatId) => CATEGORIES.find((c) => c.id === id)!;

function categorise(text: string): CatId {
  return CATEGORIES.find((c) => c.match?.test(text))?.id ?? 'unsorted';
}

/** Keeps the address and drops query strings, which on share links carry tracking ids. */
function cleanLink(raw: string): { url: string; platform: Save['platform'] } | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.replace(/^www\./, '');
    const platform = host.endsWith('instagram.com') ? 'Instagram' : /(^|\.)youtube\.com$|^youtu\.be$/.test(host) ? 'YouTube' : 'Web';
    if (platform !== 'YouTube') u.search = '';
    u.hash = '';
    return { url: u.toString(), platform };
  } catch {
    return null;
  }
}

const PLATFORM_ICON: Record<Save['platform'], LucideIcon> = { Instagram, YouTube: Youtube, Web: Globe };

function SaveCard({
  save,
  s,
  onToggle,
  onAddNote,
  onCopy,
}: {
  save: Save;
  s: LandingStrings;
  onToggle: (id: string, key: 'later' | 'done') => void;
  onAddNote: (id: string, note: string) => void;
  onCopy: (url: string) => void;
}) {
  const f = s.feed;
  const c = catOf(save.cat);
  const PlatformIcon = PLATFORM_ICON[save.platform];
  const [draft, setDraft] = useState('');
  const [headline, ...more] = save.notes;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onAddNote(save.id, text);
    setDraft('');
  };

  return (
    <article className={`ph-card ${save.done ? 'is-done' : ''}`}>
      <div className="ph-media" style={{ background: c.tint }}>
        <span className="ph-platform">
          <PlatformIcon size={13} aria-hidden="true" /> {save.platform}
          {save.platform === 'Instagram' ? ' · Reel' : ''}
        </span>
        <c.Icon size={56} strokeWidth={1.2} aria-hidden="true" />
        <span className="ph-linkonly">{f.linkOnly}</span>
      </div>

      <div className="ph-rail">
        <a className="ph-rail-btn" href={save.url} target="_blank" rel="noopener noreferrer">
          <span className="ph-rail-circle">
            <ExternalLink size={19} aria-hidden="true" />
          </span>
          <span>{f.rail.open}</span>
        </a>
        <button type="button" className="ph-rail-btn" aria-pressed={save.later} onClick={() => onToggle(save.id, 'later')}>
          <span className={`ph-rail-circle ${save.later ? 'is-on' : ''}`}>
            {save.later ? <BookmarkCheck size={19} aria-hidden="true" /> : <Bookmark size={19} aria-hidden="true" />}
          </span>
          <span>{save.later ? f.rail.inLater : f.rail.later}</span>
        </button>
        <button type="button" className="ph-rail-btn" aria-pressed={save.done} onClick={() => onToggle(save.id, 'done')}>
          <span className={`ph-rail-circle ${save.done ? 'is-on' : ''}`}>
            <Check size={19} aria-hidden="true" />
          </span>
          <span>{save.done ? f.rail.undo : f.rail.done}</span>
        </button>
        <button type="button" className="ph-rail-btn" onClick={() => onCopy(save.url)}>
          <span className="ph-rail-circle">
            <Link2 size={19} aria-hidden="true" />
          </span>
          <span>{f.rail.copy}</span>
        </button>
      </div>

      <div className="ph-info">
        <span className="ph-avatar" style={{ background: c.tint }} aria-hidden="true">
          <c.Icon size={24} strokeWidth={1.6} />
        </span>
        <div className="ph-who">
          <h3>
            {c.name}
            {c.id !== 'unsorted' && <BadgeCheck size={18} className="ph-verified" aria-label={f.yourWordsPill} />}
          </h3>
          <p className="ph-tagline">
            {c.id === 'unsorted' ? f.sheet.unsortedWhy : f.whyFrom(headline)}
          </p>
        </div>
      </div>

      <p className="ph-words">{headline}</p>
      {more.length > 0 && (
        <ul className="ph-more">
          {more.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      <div className="ph-pills">
        <span className="ph-pill ph-pill-strong">
          <Quote size={13} aria-hidden="true" /> {f.yourWordsPill}
        </span>
        <span className="ph-pill">{save.chip}</span>
        <span className="ph-pill ph-pill-dashed">{save.justNow ? f.savedNow : f.savedToday}</span>
      </div>
      <p className="ph-ai">{f.aiNone}</p>

      <div className="ph-cta">
        <a className="ph-try" href={save.url} target="_blank" rel="noopener noreferrer">
          {f.openReel}
        </a>
        <form className="ph-note" onSubmit={submit}>
          <Pencil size={16} aria-hidden="true" />
          <input
            id={`ph-note-${save.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={f.addContext}
            aria-label={f.addContextLabel}
            maxLength={120}
          />
          {draft.trim() && (
            <button type="submit" className="ph-note-add">
              {f.add}
            </button>
          )}
        </form>
      </div>
    </article>
  );
}

export function FeedDemo({ s }: { s: LandingStrings }) {
  const f = s.feed;
  const [saves, setSaves] = useState<Save[]>(INITIAL);
  const [tab, setTab] = useState<CatId | 'all'>('all');
  const [view, setView] = useState<View>('feed');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<{ text: string; link?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toast || toast.link) return;
    const id = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  const tabs = useMemo(
    () => CATEGORIES.filter((c) => c.id !== 'unsorted' || saves.some((x) => x.cat === 'unsorted')),
    [saves]
  );

  const shown = saves.filter((x) => {
    if (tab !== 'all' && x.cat !== tab) return false;
    if (view === 'later') return x.later;
    if (view === 'done') return x.done;
    if (view === 'search') {
      const q = query.trim().toLowerCase();
      if (!q) return !x.done;
      return [...x.notes, catOf(x.cat).name].some((t) => t.toLowerCase().includes(q));
    }
    return !x.done;
  });

  const go = (next: View) => {
    setView(next);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const toggle = (id: string, key: 'later' | 'done') =>
    setSaves((all) => all.map((x) => (x.id === id ? { ...x, [key]: !x[key] } : x)));

  const addNote = (id: string, note: string) =>
    setSaves((all) => all.map((x) => (x.id === id ? { ...x, notes: [...x.notes, note] } : x)));

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setToast({ text: f.copied });
    } catch {
      setToast({ text: f.copyFailed, link: url });
    }
  };

  const empty = view === 'later' ? f.empty.later : view === 'done' ? f.empty.done : view === 'search' && query.trim() ? f.empty.search : f.empty.feed;

  return (
    <div className="ph-frame" role="region" aria-label={f.phoneLabel}>
      <div className="ph-screen">
        <header className="ph-top">
          <div className="ph-top-row">
            <span className="ph-logo">
              Neophi<i aria-hidden="true" />
            </span>
            <button type="button" className="ph-icon" aria-label={f.nav.search} aria-pressed={view === 'search'} onClick={() => go(view === 'search' ? 'feed' : 'search')}>
              <Search size={21} aria-hidden="true" />
            </button>
            <button type="button" className="ph-icon" aria-label={f.nav.save} onClick={() => setSheet(true)}>
              <Plus size={22} aria-hidden="true" />
            </button>
          </div>
          <div className="ph-tabs" role="group" aria-label={f.tabsLabel}>
            {[{ id: 'all' as const, name: f.all }, ...tabs].map((t) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          {view === 'search' && (
            <div className="ph-search">
              <Search size={16} aria-hidden="true" />
              <input
                id="ph-search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={f.searchPlaceholder}
                aria-label={f.searchPlaceholder}
              />
            </div>
          )}
        </header>

        <div className="ph-scroll" ref={scrollRef}>
          {shown.length === 0 ? (
            <p className="ph-empty">{empty}</p>
          ) : (
            shown.map((save) => <SaveCard key={save.id} save={save} s={s} onToggle={toggle} onAddNote={addNote} onCopy={(u) => void copy(u)} />)
          )}
        </div>

        {toast && (
          <div className="ph-toast" role="status">
            <span>{toast.text}</span>
            {toast.link && (
              <>
                <input readOnly value={toast.link} onFocus={(e) => e.currentTarget.select()} aria-label={toast.text} />
                <button type="button" className="ph-icon" aria-label={f.sheet.cancel} onClick={() => setToast(null)}>
                  <X size={16} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}

        <nav className="ph-nav" aria-label={f.phoneLabel}>
          {(
            [
              { id: 'feed', label: f.nav.today, Icon: Home },
              { id: 'search', label: f.nav.search, Icon: Search },
              { id: 'save', label: f.nav.save, Icon: Plus },
              { id: 'later', label: f.nav.later, Icon: Bookmark },
              { id: 'done', label: f.nav.done, Icon: CircleCheck },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              type="button"
              aria-label={n.label}
              aria-pressed={n.id !== 'save' ? view === n.id : undefined}
              className={`${n.id === 'save' ? 'ph-nav-save' : ''} ${view === n.id ? 'is-on' : ''}`}
              onClick={() => (n.id === 'save' ? setSheet(true) : go(n.id))}
            >
              <n.Icon size={n.id === 'save' ? 22 : 21} aria-hidden="true" />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        {sheet && (
          <AddSheet
            s={s}
            onClose={() => setSheet(false)}
            onSave={(save) => {
              setSaves((all) => [save, ...all.map((x) => ({ ...x, justNow: false }))]);
              setTab('all');
              setView('feed');
              setSheet(false);
              setToast({ text: f.sheet.filed(catOf(save.cat).name) });
              scrollRef.current?.scrollTo({ top: 0 });
            }}
          />
        )}
      </div>
    </div>
  );
}

function AddSheet({ s, onClose, onSave }: { s: LandingStrings; onClose: () => void; onSave: (save: Save) => void }) {
  const f = s.feed;
  const [link, setLink] = useState('');
  const [why, setWhy] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = cleanLink(link);
    if (!cleaned) return setError(f.sheet.badLink);
    const note = why.trim();
    if (!note) return setError(f.sheet.needWhy);
    const cat = categorise(note);
    onSave({
      id: `${Date.now()}`,
      url: cleaned.url,
      platform: cleaned.platform,
      notes: [note],
      chip: CHIP_FOR[cat],
      cat,
      later: false,
      done: false,
      justNow: true,
    });
  };

  return (
    <div className="ph-sheet-backdrop" onClick={onClose}>
      <form className="ph-sheet" onSubmit={submit} onClick={(e) => e.stopPropagation()} noValidate>
        <div className="ph-sheet-head">
          <h3>{f.sheet.title}</h3>
          <button type="button" className="ph-icon" aria-label={f.sheet.cancel} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <label htmlFor="ph-add-link">{f.sheet.link}</label>
        <input
          id="ph-add-link"
          type="url"
          inputMode="url"
          autoFocus
          value={link}
          placeholder="https://www.instagram.com/reel/…"
          onChange={(e) => {
            setLink(e.target.value);
            setError(null);
          }}
        />
        <label htmlFor="ph-add-why">{f.sheet.why}</label>
        <input
          id="ph-add-why"
          value={why}
          placeholder={f.sheet.whyPh}
          maxLength={120}
          onChange={(e) => {
            setWhy(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p className="ph-sheet-error" role="alert">
            {error}
          </p>
        )}
        <div className="ph-sheet-actions">
          <button type="button" className="ph-sheet-cancel" onClick={onClose}>
            {f.sheet.cancel}
          </button>
          <button type="submit" className="ph-try">
            {f.sheet.save}
          </button>
        </div>
      </form>
    </div>
  );
}
