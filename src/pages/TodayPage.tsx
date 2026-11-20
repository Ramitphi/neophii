// The Today tab: saves brought back for a reason (just arrived, asked for, active projects, this hour, before it
// fades, this week), each with "Why am I seeing this?". Same card, chips and spacing as the Feed.
import { useState, type ReactNode } from 'react';
import { CategoryChips } from '../components/CategoryChips';
import { MemoryCard, useCategoryPops, useMemoryActions } from '../components/MemoryCard';
import type { StringsTable } from '../lib/i18n';
import type { Category, LanguageCode, Memory, TodayCard, TodayResponse } from '../types/neophi';
import { FEED_STRINGS } from './feedStrings';

export function TodayPage({
  feed,
  categories,
  memories,
  lang,
  readyForHourEnabled,
  onToggleReadyForHour,
  onOpenMemory,
  onOpenCapture,
  onLoadSamples,
  onPatch,
  t,
}: {
  feed: TodayResponse | null;
  categories: Category[];
  memories: Memory[];
  lang: LanguageCode;
  readyForHourEnabled: boolean;
  onToggleReadyForHour: () => void;
  onOpenMemory: (id: string) => void;
  onOpenCapture: (focusUrl?: boolean) => void;
  onLoadSamples: () => Promise<void>;
  onPatch: (id: string, patch: Partial<Memory>) => Promise<void>;
  t: StringsTable;
}) {
  const F = FEED_STRINGS[lang];
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const { categoryOf, popOf } = useCategoryPops(categories);
  const { act, addNote, copy } = useMemoryActions(lang, onPatch);

  if (!feed) {
    return <p className="ph-empty">{F.loading}</p>;
  }

  if (feed.isEmptyLibrary) {
    return (
      <div className="ph-welcome">
        <h2>{t.day0Headline}</h2>
        <button type="button" className="ph-try" onClick={() => onOpenCapture(false)}>
          {t.day0SaveNow}
        </button>
        <button type="button" className="ph-sheet-cancel" onClick={() => onOpenCapture(true)}>
          {t.day0PasteLink}
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
          {loadingSamples ? F.loading : t.day0TrySamples}
        </button>
      </div>
    );
  }

  const card = (memory: Memory, why?: string) => (
    <MemoryCard
      key={memory.id}
      memory={memory}
      why={why}
      category={categoryOf(memory)}
      pop={popOf(memory)}
      lang={lang}
      t={t}
      onOpen={onOpenMemory}
      onAct={(mem, a) => void act(mem, a)}
      onAddNote={addNote}
      onCopy={(u) => void copy(u)}
    />
  );
  const cards = (list: TodayCard[]) => list.map((c) => card(c.memory, c.whySeeing));

  const open = memories.filter((m) => !m.doneAt);
  const counts = new Map(categories.map((c) => [c.id, open.filter((m) => m.categoryId === c.id).length]));
  const chipCategories = categories.filter((c) => (counts.get(c.id) ?? 0) > 0);

  const section = (title: string, body: ReactNode, aside?: ReactNode) => (
    <section className="ph-section">
      <div className="ph-section-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {body}
    </section>
  );

  return (
    <>
      <CategoryChips
        lang={lang}
        categories={chipCategories}
        palette={categories}
        active={activeCategory}
        onChange={setActiveCategory}
        counts={counts}
      />

      {activeCategory !== 'all' ? (
        open.filter((m) => m.categoryId === activeCategory).map((m) => card(m))
      ) : (
        <>
          {feed.justArrived.length > 0 && section(t.sectionJustArrived, cards(feed.justArrived))}
          {feed.youAskedForThis.length > 0 && section(t.sectionYouAsked, cards(feed.youAskedForThis))}
          {feed.activeProjects.length > 0 &&
            section(
              t.sectionActiveProjects,
              feed.activeProjects.map((grp) => (
                <div key={grp.project.id} className="ph-subsection">
                  <h3>{grp.project.name}</h3>
                  {cards(grp.cards)}
                </div>
              ))
            )}
          {(feed.readyForThisHour.cards.length > 0 || !readyForHourEnabled) &&
            section(
              `${t.sectionReadyForHour} (${feed.readyForThisHour.windowLabel})`,
              readyForHourEnabled ? cards(feed.readyForThisHour.cards) : null,
              <button type="button" className="ph-section-toggle" aria-pressed={readyForHourEnabled} onClick={onToggleReadyForHour}>
                {readyForHourEnabled ? F.switchOff : F.switchOn}
              </button>
            )}
          {feed.beforeItFades && section(t.sectionBeforeItFades, card(feed.beforeItFades.memory, feed.beforeItFades.whySeeing))}
          {feed.weeklyCard.visible && feed.weeklyCard.cards.length > 0 && section(t.sectionWeekly, cards(feed.weeklyCard.cards))}
        </>
      )}
    </>
  );
}
