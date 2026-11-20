// The app's home after "Open Neophi": a phone-style feed of the user's real saves, in the same
// Mindful-paper look as the landing page (it sits inside an element with the landing's .lp tokens).
// Tabs are the user's categories; each card has an action rail, the user's exact words, a labelled
// AI line and a box to add more context. Nothing is counted or invented.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  BadgeCheck,
  Bookmark,
  CalendarDays,
  Check,
  Clock,
  CookingPot,
  ExternalLink,
  Globe,
  GraduationCap,
  Home,
  Image as ImageIcon,
  Instagram,
  Library,
  Link2,
  Moon,
  Palette,
  Pencil,
  Plane,
  Plus,
  Quote,
  Search,
  Settings,
  ShoppingBag,
  Sun,
  Upload,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { fetchAuthorizedMediaUrl } from '../lib/api';
import type { StringsTable } from '../lib/i18n';
import { POPS, popAt, popFor, popVars, type Pop } from '../landing/pop';
import { LANDING } from '../landing/strings';
import type { Category, LanguageCode, Memory, MemoryPurpose, Platform } from '../types/neophi';
import { FEED_STRINGS } from './feedStrings';

const PURPOSE_ICON: Record<MemoryPurpose, LucideIcon> = {
  shop: ShoppingBag,
  learn: GraduationCap,
  create: Palette,
  travel: Plane,
  food: CookingPot,
  try_later: Clock,
  other: Bookmark,
};

const PLATFORM: Record<Platform, { label: string; Icon: LucideIcon }> = {
  instagram: { label: 'Instagram', Icon: Instagram },
  youtube: { label: 'YouTube', Icon: Youtube },
  web: { label: 'Web', Icon: Globe },
  upload: { label: 'Upload', Icon: Upload },
  other: { label: 'Link', Icon: Link2 },
};

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function useThumb(memory: Memory): string | null {
  const [src, setSrc] = useState<string | null>(memory.media?.svgThumb ?? null);
  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    if (!memory.media?.svgThumb && memory.media?.kind === 'image' && memory.media.gcsPath) {
      void fetchAuthorizedMediaUrl(memory.id, true).then((url) => {
        if (active && url) {
          objUrl = url;
          setSrc(url);
        }
      });
    }
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [memory]);
  return src;
}

interface CardProps {
  memory: Memory;
  category: Category | null;
  pop: Pop;
  lang: LanguageCode;
  t: StringsTable;
  onOpen: (id: string) => void;
  onAct: (memory: Memory, action: 'later' | 'done') => void;
  onAddNote: (memory: Memory, text: string) => Promise<void>;
  onCopy: (url: string) => void;
}

function MemoryCard({ memory, category, pop, lang, t, onOpen, onAct, onAddNote, onCopy }: CardProps) {
  const L = LANDING[lang].feed;
  const F = FEED_STRINGS[lang];
  const thumb = useThumb(memory);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const PurposeIcon = PURPOSE_ICON[memory.analysis?.purpose ?? 'other'];
  const platform = PLATFORM[memory.platform] ?? PLATFORM.other;
  const intent = memory.analysis?.inferred_possible_intents?.[0];

  const aiLine = memory.privateNoAI
    ? F.aiOff
    : memory.analysisStatus === 'pending'
      ? F.aiPending
      : memory.analysisStatus === 'failed'
        ? F.aiFailed
        : intent
          ? `${F.maybe}: ${intent.intent} · ${intent.uncertain ? F.aiNotSure : `${Math.round(intent.confidence * 100)}%`}`
          : memory.analysis?.source_summary || null;

  const status =
    memory.ingest === 'link_metadata' ? L.linkOnly : memory.ingest === 'unsupported' ? F.unavailable : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onAddNote(memory, text);
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="ph-card" style={popVars(pop)}>
      <button type="button" className="ph-media ph-media-btn" onClick={() => onOpen(memory.id)} aria-label={`${t.actionOpen}: ${memory.title}`}>
        {thumb ? (
          <img src={thumb} alt="" className={`ph-media-img ${memory.media?.svgThumb ? 'is-contain' : ''}`} />
        ) : memory.media?.kind === 'image' || memory.media?.kind === 'video' ? (
          <ImageIcon size={52} strokeWidth={1.2} aria-hidden="true" />
        ) : (
          <PurposeIcon size={56} strokeWidth={1.2} aria-hidden="true" />
        )}
        <span className="ph-platform">
          <platform.Icon size={13} aria-hidden="true" /> {platform.label}
        </span>
        {(status || memory.privateNoAI) && (
          <span className="ph-linkonly">{memory.privateNoAI ? F.privateLabel : status}</span>
        )}
      </button>

      <div className="ph-rail">
        {memory.url && (
          <a className="ph-rail-btn" href={memory.url} target="_blank" rel="noopener noreferrer">
            <span className="ph-rail-circle">
              <ExternalLink size={19} aria-hidden="true" />
            </span>
            <span>{L.rail.open}</span>
          </a>
        )}
        <button type="button" className="ph-rail-btn" onClick={() => onAct(memory, 'later')}>
          <span className="ph-rail-circle">
            <Bookmark size={19} aria-hidden="true" />
          </span>
          <span>{L.rail.later}</span>
        </button>
        <button type="button" className="ph-rail-btn" onClick={() => onAct(memory, 'done')}>
          <span className="ph-rail-circle">
            <Check size={19} aria-hidden="true" />
          </span>
          <span>{L.rail.done}</span>
        </button>
        {memory.url && (
          <button type="button" className="ph-rail-btn" onClick={() => onCopy(memory.url!)}>
            <span className="ph-rail-circle">
              <Link2 size={19} aria-hidden="true" />
            </span>
            <span>{L.rail.copy}</span>
          </button>
        )}
      </div>

      <div className="ph-info">
        <span className="ph-avatar" aria-hidden="true">
          <PurposeIcon size={24} strokeWidth={1.6} />
        </span>
        <div className="ph-who">
          <h3>
            <span className="ph-title">{memory.title}</span>
            {category && !memory.categoryByAI && <BadgeCheck size={18} className="ph-verified" aria-label={F.youSorted} />}
          </h3>
          <p className="ph-tagline">
            {category ? (
              <>
                <b>{category.name}</b>
                {memory.categoryByAI && <span className="ph-ai-tag">{F.aiSorted}</span>}
                {memory.categoryWhy && <> · {memory.categoryWhy}</>}
              </>
            ) : (
              F.noCategory
            )}
          </p>
        </div>
      </div>

      {memory.note ? <p className="ph-words">{memory.note}</p> : <p className="ph-tagline">{t.noNoteAdded}</p>}

      <div className="ph-pills">
        {memory.note && (
          <span className="ph-pill ph-pill-strong">
            <Quote size={13} aria-hidden="true" /> {L.yourWordsPill}
          </span>
        )}
        {memory.chip && <span className="ph-pill">{memory.chip}</span>}
        {memory.remindAt && (
          <span className="ph-pill">
            <CalendarDays size={13} aria-hidden="true" /> {new Date(memory.remindAt).toLocaleDateString()}
          </span>
        )}
        <span className="ph-pill ph-pill-dashed">{F.savedAgo(daysSince(memory.createdAt))}</span>
      </div>

      {aiLine && (
        <p className="ph-ai">
          <b>{t.aiSuggestionPill}:</b> {aiLine}
        </p>
      )}

      <div className="ph-cta">
        <button type="button" className="ph-try" onClick={() => onOpen(memory.id)}>
          {t.actionOpen}
        </button>
        <form className="ph-note" onSubmit={(e) => void submit(e)}>
          <Pencil size={16} aria-hidden="true" />
          <input
            id={`ph-note-${memory.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={L.addContext}
            aria-label={L.addContextLabel}
            maxLength={200}
            disabled={busy}
          />
          {draft.trim() && (
            <button type="submit" className="ph-note-add" disabled={busy}>
              {L.add}
            </button>
          )}
        </form>
      </div>
    </article>
  );
}

export function FeedPage({
  memories,
  categories,
  lang,
  t,
  theme,
  onToggleTheme,
  onOpenMemory,
  onOpenCapture,
  onOpenSearch,
  onNavigate,
  onLoadSamples,
  onPatch,
  previewNote,
  onLogo,
}: {
  memories: Memory[];
  categories: Category[];
  lang: LanguageCode;
  t: StringsTable;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenMemory: (id: string) => void;
  onOpenCapture: () => void;
  onOpenSearch: () => void;
  onNavigate: (tab: 'today' | 'library' | 'settings') => void;
  onLoadSamples: () => Promise<void>;
  /** Saves a change to a memory and refreshes the list. */
  onPatch: (id: string, patch: Partial<Memory>) => Promise<void>;
  /** Set in the landing-only preview: actions that need the server show this note instead. */
  previewNote?: string;
  onLogo?: () => void;
}) {
  const L = LANDING[lang].feed;
  const F = FEED_STRINGS[lang];
  const [tab, setTab] = useState<string>('all');
  const [toast, setToast] = useState<{ text: string; undo?: () => Promise<void>; link?: string } | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toast || toast.link) return;
    const id = window.setTimeout(() => setToast(null), toast.undo ? 5000 : 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  const now = Date.now();
  const visible = memories
    .filter((m) => !m.doneAt && !(m.snoozedUntil && new Date(m.snoozedUntil).getTime() > now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const popByCat = useMemo(() => new Map(categories.map((c, i) => [c.id, popAt(i)])), [categories]);
  const tabs = categories.filter((c) => visible.some((m) => m.categoryId === c.id));
  const activeTab = tab === 'all' || tabs.some((c) => c.id === tab) ? tab : 'all';
  const shown = activeTab === 'all' ? visible : visible.filter((m) => m.categoryId === activeTab);

  const act = async (memory: Memory, action: 'later' | 'done') => {
    const field = action === 'later' ? 'snoozedUntil' : 'doneAt';
    const value = action === 'later' ? new Date(Date.now() + 86_400_000).toISOString() : new Date().toISOString();
    await onPatch(memory.id, { [field]: value });
    setToast({
      text: action === 'later' ? F.laterToast : F.doneToast,
      undo: () => onPatch(memory.id, { [field]: null }),
    });
  };

  const addNote = async (memory: Memory, text: string) => {
    // The user's own words are appended exactly as typed; nothing is rewritten.
    const note = memory.note ? `${memory.note}\n${text}` : text;
    await onPatch(memory.id, { note });
  };

  // In the preview there is no server: say so instead of opening parts that need it.
  const needsServer = <A extends unknown[]>(fn: (...args: A) => void) =>
    previewNote ? () => setToast({ text: previewNote }) : fn;
  const openCapture = needsServer(onOpenCapture);
  const openSearch = needsServer(onOpenSearch);
  const openMemory = needsServer(onOpenMemory);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setToast({ text: L.copied });
    } catch {
      setToast({ text: L.copyFailed, link: url });
    }
  };

  return (
    <div className="ph-frame is-app" role="region" aria-label={F.feed}>
      <div className="ph-screen">
        <header className="ph-top">
          <div className="ph-top-row">
            {onLogo ? (
              <button type="button" className="ph-logo" onClick={onLogo}>
                Neophi<i aria-hidden="true" />
              </button>
            ) : (
              <span className="ph-logo">
                Neophi<i aria-hidden="true" />
              </span>
            )}
            <button type="button" className="ph-icon" aria-label={F.theme} onClick={onToggleTheme}>
              {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
            </button>
            <button type="button" className="ph-icon" aria-label={t.searchPlaceholder} onClick={openSearch}>
              <Search size={21} aria-hidden="true" />
            </button>
            <button type="button" className="ph-icon" aria-label={t.saveButton} onClick={openCapture}>
              <Plus size={22} aria-hidden="true" />
            </button>
          </div>
          <div className="ph-tabs" role="group" aria-label={L.tabsLabel}>
            {[{ id: 'all', name: L.all }, ...tabs].map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={activeTab === c.id}
                className={activeTab === c.id ? 'is-on' : ''}
                style={popVars(c.id === 'all' ? POPS.violet : popByCat.get(c.id) ?? popFor(c.id))}
                onClick={() => {
                  setTab(c.id);
                  scrollRef.current?.scrollTo({ top: 0 });
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </header>

        <div className="ph-scroll" ref={scrollRef}>
          {memories.length === 0 ? (
            <div className="ph-welcome">
              <h2>{F.emptyTitle}</h2>
              <p>{F.emptyBody}</p>
              <button type="button" className="ph-try" onClick={openCapture}>
                {t.day0SaveNow}
              </button>
              <button
                type="button"
                className="ph-sheet-cancel"
                disabled={loadingSamples}
                onClick={async () => {
                  setLoadingSamples(true);
                  try {
                    await onLoadSamples();
                  } finally {
                    setLoadingSamples(false);
                  }
                }}
              >
                {t.day0TrySamples}
              </button>
            </div>
          ) : shown.length === 0 ? (
            <p className="ph-empty">{F.allCaughtUp}</p>
          ) : (
            shown.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                category={m.categoryId ? catById.get(m.categoryId) ?? null : null}
                pop={(m.categoryId && popByCat.get(m.categoryId)) || popFor(m.id)}
                lang={lang}
                t={t}
                onOpen={(id) => openMemory(id)}
                onAct={(mem, a) => void act(mem, a)}
                onAddNote={addNote}
                onCopy={(u) => void copy(u)}
              />
            ))
          )}
        </div>

        {toast && (
          <div className="ph-toast" role="status">
            <span>{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                className="ph-toast-undo"
                onClick={async () => {
                  const undo = toast.undo!;
                  setToast(null);
                  await undo();
                }}
              >
                {t.undoLabel}
              </button>
            )}
            {toast.link && <input readOnly value={toast.link} onFocus={(e) => e.currentTarget.select()} aria-label={toast.text} />}
          </div>
        )}

        <nav className="ph-nav" aria-label={F.feed}>
          {(
            [
              { id: 'feed', label: F.feed, Icon: Home },
              { id: 'today', label: t.navToday, Icon: Sun },
              { id: 'save', label: t.saveButton, Icon: Plus },
              { id: 'library', label: t.navLibrary, Icon: Library },
              { id: 'settings', label: t.navSettings, Icon: Settings },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={n.id === 'feed' ? 'page' : undefined}
              className={`${n.id === 'save' ? 'ph-nav-save' : ''} ${n.id === 'feed' ? 'is-on' : ''}`}
              onClick={() => {
                if (n.id === 'save') openCapture();
                else if (n.id === 'feed') scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                else if (previewNote) setToast({ text: previewNote });
                else onNavigate(n.id);
              }}
            >
              <n.Icon size={n.id === 'save' ? 22 : 21} aria-hidden="true" />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
