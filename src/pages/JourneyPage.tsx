// Journey: every save at one glance, as a tree that grows. The shape is derived from the person's own categories and
// from what each save is about (see src/lib/journey.ts); the AI is never asked for a reason, and the person's own
// words are shown first on every save, exactly as typed.
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Globe, Instagram, Link2, Search, Sprout, Upload, Youtube, type LucideIcon } from 'lucide-react';
import { buildJourney, expandableIds, type JourneyLens, type JourneyNode } from '../lib/journey';
import type { Category, LanguageCode, Memory, Platform } from '../types/neophi';
import { FEED_STRINGS } from './feedStrings';
import { aiLine } from '../lib/aiLine';

const PLATFORM_ICON: Record<Platform, LucideIcon> = {
  instagram: Instagram,
  youtube: Youtube,
  web: Globe,
  upload: Upload,
  other: Link2,
};

/** Eight calm-to-bold hues; a branch keeps its hue for life, so a person learns "orange is food". */
const HUES = [262, 332, 152, 24, 192, 46, 8, 214];
const LOCALE: Record<LanguageCode, string> = { en: 'en-IN', hinglish: 'en-IN', hi: 'hi-IN' };

function firstLine(text: string | null): string | null {
  const line = (text ?? '').split('\n').map((l) => l.trim()).find(Boolean);
  return line ? (line.length > 140 ? `${line.slice(0, 137)}…` : line) : null;
}

export function JourneyPage({
  memories,
  categories,
  lang,
  onOpenMemory,
  onOpenCapture,
  onOpenLibrary,
  libraryLabel,
  saveLabel,
  loading = false,
}: {
  memories: Memory[];
  categories: Category[];
  lang: LanguageCode;
  onOpenMemory: (id: string) => void;
  onOpenCapture: () => void;
  /** The flat list of saves, one tap away for anyone who prefers it. */
  onOpenLibrary: () => void;
  libraryLabel: string;
  saveLabel: string;
  /** The library has not finished loading: say so instead of showing the empty state. */
  loading?: boolean;
}) {
  const J = FEED_STRINGS[lang].journey;
  const locale = LOCALE[lang];
  const [lens, setLens] = useState<JourneyLens>('themes');
  const [query, setQuery] = useState('');
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());

  const tree = useMemo(
    () =>
      buildJourney(
        memories,
        categories,
        {
          purposes: J.purposes,
          unsorted: J.unsorted,
          month: (key) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        },
        { lens, query }
      ),
    [memories, categories, J, lens, query, locale]
  );

  const searching = query.trim().length > 0;
  const isOpen = (n: JourneyNode, index: number): boolean => {
    const chosen = toggled.get(n.id);
    if (chosen !== undefined) return chosen;
    if (searching || n.newCount > 0) return true;
    return n.kind === 'branch' && index < 3;
  };
  const toggle = (n: JourneyNode, index: number) =>
    setToggled((prev) => new Map(prev).set(n.id, !isOpen(n, index)));
  const setAll = (open: boolean) => setToggled(new Map(expandableIds(tree).map((id) => [id, open])));

  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const renderLeaf = (n: JourneyNode) => {
    const m = n.memory!;
    const Icon = PLATFORM_ICON[m.platform] ?? Link2;
    const words = firstLine(m.note);
    return (
      <li key={n.id} className="jy-leaf-item">
        <button type="button" className="jy-leaf" onClick={() => onOpenMemory(m.id)}>
          <span className="jy-leaf-dot" aria-hidden="true" />
          <span className="jy-leaf-main">
            <span className="jy-leaf-title">
              <Icon size={14} aria-hidden="true" /> {m.title}
              {n.newCount > 0 && (
                <span className="jy-new">
                  <Sprout size={12} aria-hidden="true" /> {J.newBadge}
                </span>
              )}
            </span>
            {words ? (
              <span className="jy-leaf-words">“{words}”</span>
            ) : aiLine(m.analysis) ? (
              <span className="jy-leaf-ai">AI · {aiLine(m.analysis)}</span>
            ) : (
              <span className="jy-leaf-nowords">{J.withoutWords}</span>
            )}
          </span>
          <span className="jy-leaf-date">{date(m.createdAt)}</span>
        </button>
      </li>
    );
  };

  const renderNode = (n: JourneyNode, index: number): ReactNode => {
    if (n.kind === 'leaf') return renderLeaf(n);
    const open = isOpen(n, index);
    return (
      <li key={n.id} className={`jy-node jy-${n.kind}`} style={{ ['--tone' as string]: `hsl(${HUES[n.tone % HUES.length]} 72% 58%)` }}>
        <button type="button" className="jy-head" aria-expanded={open} onClick={() => toggle(n, index)}>
          <ChevronRight size={18} className={`jy-chev ${open ? 'is-open' : ''}`} aria-hidden="true" />
          <span className="jy-bud" aria-hidden="true" />
          <span className="jy-label">{n.label}</span>
          <span className="jy-count">{J.saves(n.count)}</span>
          {n.newCount > 0 && (
            <span className="jy-new">
              <Sprout size={12} aria-hidden="true" /> {J.newCount(n.newCount)}
            </span>
          )}
          {n.kind === 'branch' && n.chips.length > 0 && (
            <span className="jy-chips">
              {n.chips.map((c) => (
                <span key={c} className="jy-chip">
                  {c}
                </span>
              ))}
            </span>
          )}
        </button>
        {open && <ul className="jy-children">{n.children.map((c, i) => renderNode(c, i))}</ul>}
      </li>
    );
  };

  if (memories.length === 0 && loading) {
    return (
      <p className="muted" role="status" style={{ marginTop: 24 }}>
        {J.loading}
      </p>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="jy-empty card" style={{ marginTop: 24 }}>
        <Sprout size={30} aria-hidden="true" />
        <h1 className="serif-title">{J.emptyTitle}</h1>
        <p className="muted">{J.emptyBody}</p>
        <button type="button" className="btn-primary" onClick={onOpenCapture}>
          {saveLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="jy" style={{ marginTop: 16 }}>
      <header className="jy-top">
        <h1 className="serif-title">{J.title}</h1>
        <p className="muted">{J.subtitle}</p>
        <dl className="jy-stats">
          <div>
            <dd>{tree.totals.saves}</dd>
            <dt>{J.statSaves}</dt>
          </div>
          <div>
            <dd>{tree.totals.branches}</dd>
            <dt>{J.statBranches}</dt>
          </div>
          <div>
            <dd>{tree.totals.newThisWeek}</dd>
            <dt>{J.statNew}</dt>
          </div>
          <div>
            <dd>{tree.totals.withWords}</dd>
            <dt>{J.statWords}</dt>
          </div>
        </dl>
      </header>

      <div className="jy-tools">
        <div className="jy-lens" role="group" aria-label="View">
          {(['themes', 'time'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lens === l} className={lens === l ? 'is-on' : ''} onClick={() => setLens(l)}>
              {l === 'themes' ? J.lensThemes : J.lensTime}
            </button>
          ))}
        </div>
        <label className="jy-search">
          <Search size={16} aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={J.search} aria-label={J.search} />
        </label>
        <div className="jy-fold">
          <button type="button" onClick={() => setAll(true)}>
            {J.expandAll}
          </button>
          <button type="button" onClick={() => setAll(false)}>
            {J.collapseAll}
          </button>
        </div>
      </div>

      {tree.branches.length === 0 ? (
        <p className="muted" role="status">
          {J.noMatch}
        </p>
      ) : (
        <ul className="jy-tree" aria-label={J.title}>
          {tree.branches.map((b, i) => renderNode(b, i))}
        </ul>
      )}

      <p className="jy-tip muted">{J.tip}</p>
      <button type="button" className="jy-library" onClick={onOpenLibrary}>
        {libraryLabel}
      </button>
    </div>
  );
}
