// The Feed tab: the user's saves, newest first, one per screen, filtered by category chips.
// Saves marked Done or put off with Later stay out until they come back. Nothing is counted or invented.
import { useState } from 'react';
import { useShellToast } from '../components/AppShell';
import { MemoryCard, useCategoryPops, useMemoryActions } from '../components/MemoryCard';
import { CategoryChips } from '../components/CategoryChips';
import type { StringsTable } from '../lib/i18n';
import type { Category, LanguageCode, Memory } from '../types/neophi';
import { FEED_STRINGS } from './feedStrings';

export function FeedPage({
  memories,
  categories,
  lang,
  t,
  onOpenMemory,
  onOpenCapture,
  onLoadSamples,
  onPatch,
  previewNote,
}: {
  memories: Memory[];
  categories: Category[];
  lang: LanguageCode;
  t: StringsTable;
  onOpenMemory: (id: string) => void;
  onOpenCapture: () => void;
  onLoadSamples: () => Promise<void>;
  /** Saves a change to a memory and refreshes the list. */
  onPatch: (id: string, patch: Partial<Memory>) => Promise<void>;
  /** Set in the landing-only preview: opening a save needs the server, so this note shows instead. */
  previewNote?: string;
}) {
  const F = FEED_STRINGS[lang];
  const toast = useShellToast();
  const [tab, setTab] = useState<string>('all');
  const [loadingSamples, setLoadingSamples] = useState(false);
  const { categoryOf, popOf } = useCategoryPops(categories);
  const { act, addNote, copy } = useMemoryActions(lang, onPatch);

  const now = Date.now();
  const visible = memories
    .filter((m) => !m.doneAt && !(m.snoozedUntil && new Date(m.snoozedUntil).getTime() > now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tabs = categories.filter((c) => visible.some((m) => m.categoryId === c.id));
  const activeTab = tab === 'all' || tabs.some((c) => c.id === tab) ? tab : 'all';
  const shown = activeTab === 'all' ? visible : visible.filter((m) => m.categoryId === activeTab);
  const open = (id: string) => (previewNote ? toast({ text: previewNote }) : onOpenMemory(id));
  const capture = () => (previewNote ? toast({ text: previewNote }) : onOpenCapture());

  if (memories.length === 0) {
    return (
      <div className="ph-welcome">
        <h2>{F.emptyTitle}</h2>
        <p>{F.emptyBody}</p>
        <button type="button" className="ph-try" onClick={capture}>
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
    );
  }

  return (
    <>
      <CategoryChips
        lang={lang}
        categories={tabs}
        palette={categories}
        active={activeTab}
        onChange={setTab}
        counts={new Map(tabs.map((c) => [c.id, visible.filter((m) => m.categoryId === c.id).length]))}
        allCount={visible.length}
      />
      {shown.length === 0 ? (
        <p className="ph-empty">{F.allCaughtUp}</p>
      ) : (
        shown.map((m) => (
          <MemoryCard
            key={m.id}
            memory={m}
            category={categoryOf(m)}
            pop={popOf(m)}
            lang={lang}
            t={t}
            onOpen={open}
            onAct={(mem, a) => void act(mem, a)}
            onAddNote={addNote}
            onCopy={(u) => void copy(u)}
          />
        ))
      )}
    </>
  );
}
