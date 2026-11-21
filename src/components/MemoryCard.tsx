// The save card used on every tab (Feed, Today, Library): the media, the user's exact words first, the title
// and category with its reason, pills, a labelled AI line, and one row of actions (Open, Later, Done, Copy link).
// Also the shared actions (Later, Done, add context, copy link) with their toasts.
import { useEffect, useMemo, useState } from 'react';
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
  HelpCircle,
  Image as ImageIcon,
  Instagram,
  Link2,
  Palette,
  Plane,
  Quote,
  ShoppingBag,
  Upload,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { fetchAuthorizedMediaUrl } from '../lib/api';
import type { StringsTable } from '../lib/i18n';
import { laterNotes } from '../lib/notes';
import { popAt, popFor, popVars, type Pop } from '../landing/pop';
import { LANDING } from '../landing/strings';
import { FEED_STRINGS } from '../pages/feedStrings';
import type { Category, LanguageCode, Memory, MemoryPurpose, Platform } from '../types/neophi';
import { aiLine as describeForAi } from '../lib/aiLine';
import { useShellToast } from './AppShell';
import { InstagramThumb, instagramPost } from './InstagramThumb';

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

export interface CardProps {
  memory: Memory;
  /** Today's reason for bringing this save back, shown behind a "Why am I seeing this?" toggle. */
  why?: string;
  category: Category | null;
  pop: Pop;
  lang: LanguageCode;
  t: StringsTable;
  onOpen: (id: string) => void;
  onAct: (memory: Memory, action: 'later' | 'done') => void;
  onCopy: (url: string) => void;
}

export function MemoryCard({ memory, why, category, pop, lang, t, onOpen, onAct, onCopy }: CardProps) {
  const L = LANDING[lang].feed;
  const F = FEED_STRINGS[lang];
  const thumb = useThumb(memory);
  const [showWhy, setShowWhy] = useState(false);
  const PurposeIcon = PURPOSE_ICON[memory.analysis?.purpose ?? 'other'];
  const platform = PLATFORM[memory.platform] ?? PLATFORM.other;
  const intent = memory.analysis?.inferred_possible_intents?.[0];
  const later = laterNotes(memory);
  const noteless = memory.note || memory.privateNoAI ? null : describeForAi(memory.analysis);
  // A source that is gone keeps its 'not available' look instead of Instagram's empty embed.
  const igPost = memory.ingest === 'unsupported' ? null : instagramPost(memory.url);

  const aiLine = memory.privateNoAI
    ? F.aiOff
    : memory.analysisStatus === 'pending'
      ? F.aiPending
      : memory.analysisStatus === 'failed'
        ? F.aiFailed
        : intent
          ? `${F.maybe}: ${intent.intent} · ${intent.uncertain ? F.aiNotSure : `${Math.round(intent.confidence * 100)}%`}`
          : memory.analysis?.source_summary || null;

  const status = memory.dm?.simulated
    ? F.ig.simulated
    : memory.ingest === 'link_metadata'
      ? L.linkOnly
      : memory.ingest === 'unsupported'
        ? F.unavailable
        : null;

  return (
    <article className="ph-card ph-chrome" style={popVars(pop)}>
      {igPost ? (
        // A real Instagram Reel: its own picture, and a tap opens it on Instagram.
        <div className="ph-media is-ig">
          <InstagramThumb post={igPost} title={memory.title} ratio={1} linkLabel={`${F.openOnInstagram}: ${memory.title}`} />
          <span className="ph-platform">
            <platform.Icon size={13} aria-hidden="true" /> {platform.label}
          </span>
          {(status || memory.privateNoAI) && (
            <span className="ph-linkonly">{memory.privateNoAI ? F.privateLabel : status}</span>
          )}
          <span className="ph-ig-open" aria-hidden="true">
            <ExternalLink size={13} /> {F.openOnInstagram}
          </span>
        </div>
      ) : (
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
      )}

      {/* The user's exact words come first, directly below the save. */}
      {memory.note ? (
        <p className="ph-words">{memory.note}</p>
      ) : noteless ? (
        <p className="ph-ai-line">
          <span className="pill pill-ai">AI</span> {noteless}
        </p>
      ) : (
        <p className="ph-tagline">{t.noNoteAdded}</p>
      )}
      {later.length > 0 && (
        <ul className="ph-more" aria-label={t.laterNotesLabel}>
          {later.map((n) => (
            <li key={n.deliveryId}>{n.text}</li>
          ))}
        </ul>
      )}

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

      {why && (
        <div className="ph-why">
          <button type="button" className="ph-why-btn" aria-expanded={showWhy} onClick={() => setShowWhy((v) => !v)}>
            <HelpCircle size={15} aria-hidden="true" /> {t.whySeeingThis}
          </button>
          {showWhy && <p className="ph-why-text">{why}</p>}
        </div>
      )}

      {aiLine && (
        <p className="ph-ai">
          <b>{t.aiSuggestionPill}:</b> {aiLine}
        </p>
      )}

      {/* Quick actions under the words; the picture above stays just the Reel. */}
      {/* One row: Open (the save's page) first, then the quick actions. Context is added on the save's page. */}
      <div className="ph-actions">
        <button type="button" className="ph-act is-primary" onClick={() => onOpen(memory.id)}>
          {t.actionOpen}
        </button>
        <button type="button" className="ph-act" onClick={() => onAct(memory, 'later')}>
          <Bookmark size={15} aria-hidden="true" /> {L.rail.later}
        </button>
        <button type="button" className="ph-act" onClick={() => onAct(memory, 'done')}>
          <Check size={15} aria-hidden="true" /> {L.rail.done}
        </button>
        {memory.url && (
          <button type="button" className="ph-act" onClick={() => onCopy(memory.url!)}>
            <Link2 size={15} aria-hidden="true" /> {L.rail.copy}
          </button>
        )}
      </div>
    </article>
  );
}

/** Category colours handed out in order, so neighbouring categories never share one. */
export function useCategoryPops(categories: Category[]) {
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const popByCat = useMemo(() => new Map(categories.map((c, i) => [c.id, popAt(i)])), [categories]);
  return {
    categoryOf: (m: Memory) => (m.categoryId ? catById.get(m.categoryId) ?? null : null),
    popOf: (m: Memory) => (m.categoryId && popByCat.get(m.categoryId)) || popFor(m.id),
    popOfCategory: (id: string) => popByCat.get(id) ?? popFor(id),
  };
}

/** Later, Done, add context and copy link, with the shell's toast (and Undo for Later and Done). */
export function useMemoryActions(lang: LanguageCode, onPatch: (id: string, patch: Partial<Memory>) => Promise<void>) {
  const L = LANDING[lang].feed;
  const F = FEED_STRINGS[lang];
  const toast = useShellToast();
  return {
    act: async (memory: Memory, action: 'later' | 'done') => {
      const field = action === 'later' ? 'snoozedUntil' : 'doneAt';
      const value = action === 'later' ? new Date(Date.now() + 86_400_000).toISOString() : new Date().toISOString();
      await onPatch(memory.id, { [field]: value });
      toast({ text: action === 'later' ? F.laterToast : F.doneToast, undo: () => onPatch(memory.id, { [field]: null }) });
    },
    addNote: async (memory: Memory, text: string) => {
      // The user's own words are appended exactly as typed; nothing is rewritten.
      const note = memory.note ? `${memory.note}\n${text}` : text;
      await onPatch(memory.id, { note });
    },
    copy: async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        toast({ text: L.copied });
      } catch {
        toast({ text: L.copyFailed, link: url });
      }
    },
  };
}
