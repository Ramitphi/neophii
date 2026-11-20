import { useState } from 'react';
import { FeedCard } from '../components/FeedCard';
import type { StringsTable } from '../lib/i18n';
import type { Category, Memory, TodayResponse } from '../types/neophi';

export function TodayPage({
  feed,
  categories,
  memories,
  readyForHourEnabled,
  onToggleReadyForHour,
  onOpenMemory,
  onOpenCapture,
  onLoadSamples,
  onRefresh,
  t,
}: {
  feed: TodayResponse | null;
  categories: Category[];
  memories: Memory[];
  readyForHourEnabled: boolean;
  onToggleReadyForHour: () => void;
  onOpenMemory: (id: string) => void;
  onOpenCapture: (focusUrl?: boolean) => void;
  onLoadSamples: () => Promise<void>;
  onRefresh: () => void;
  t: StringsTable;
}) {
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  if (!feed) {
    return <p className="muted">Loading…</p>;
  }

  if (feed.isEmptyLibrary) {
    return (
      <section
        className="card"
        style={{
          marginTop: 24,
          padding: 32,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <h1 className="serif-title" style={{ fontSize: '2rem', maxWidth: 540 }}>
          {t.day0Headline}
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          <button type="button" className="btn-primary" onClick={() => onOpenCapture(false)}>
            {t.day0SaveNow}
          </button>
          <button type="button" onClick={() => onOpenCapture(true)}>
            {t.day0PasteLink}
          </button>
          <button
            type="button"
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
            {loadingSamples ? 'Loading…' : t.day0TrySamples}
          </button>
        </div>
      </section>
    );
  }

  const filteredMemories =
    activeCategory === 'all'
      ? []
      : memories.filter((m) => m.categoryId === activeCategory && !m.doneAt);

  return (
    <div className="feed-column" style={{ marginTop: 16 }}>
      {/* Category filter tiles */}
      {categories.length > 0 && (
        <div className="chip-scroller" role="toolbar" aria-label="Filter by category">
          <button
            type="button"
            className={`filter-chip ${activeCategory === 'all' ? 'active' : ''}`}
            aria-pressed={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
          >
            All
          </button>
          {categories.map((cat) => {
            const count = memories.filter((m) => m.categoryId === cat.id && !m.doneAt).length;
            if (count === 0) return null;
            return (
              <button
                key={cat.id}
                type="button"
                className={`filter-chip ${activeCategory === cat.id ? 'active' : ''}`}
                aria-pressed={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.name}
                <span className="filter-chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {activeCategory !== 'all' ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filteredMemories.map((m) => (
            <FeedCard
              key={m.id}
              memory={m}
              onOpen={onOpenMemory}
              onRefresh={onRefresh}
              t={t}
            />
          ))}
        </section>
      ) : (
        <>
          {feed.justArrived.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="serif-title" style={{ fontSize: '1.35rem' }}>
                {t.sectionJustArrived}
              </h2>
              {feed.justArrived.map((c) => (
                <FeedCard
                  key={c.memory.id}
                  memory={c.memory}
                  whySeeing={c.whySeeing}
                  onOpen={onOpenMemory}
                  onRefresh={onRefresh}
                  t={t}
                />
              ))}
            </section>
          )}

          {feed.youAskedForThis.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="serif-title" style={{ fontSize: '1.35rem' }}>
                {t.sectionYouAsked}
              </h2>
              {feed.youAskedForThis.map((c) => (
                <FeedCard
                  key={c.memory.id}
                  memory={c.memory}
                  whySeeing={c.whySeeing}
                  onOpen={onOpenMemory}
                  onRefresh={onRefresh}
                  t={t}
                />
              ))}
            </section>
          )}

          {feed.activeProjects.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 className="serif-title" style={{ fontSize: '1.35rem' }}>
                {t.sectionActiveProjects}
              </h2>
              {feed.activeProjects.map((grp) => (
                <div key={grp.project.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h3 className="serif-title" style={{ fontSize: '1.1rem' }}>
                    {grp.project.name}
                  </h3>
                  {grp.cards.map((c) => (
                    <FeedCard
                      key={c.memory.id}
                      memory={c.memory}
                      whySeeing={c.whySeeing}
                      onOpen={onOpenMemory}
                      onRefresh={onRefresh}
                      t={t}
                    />
                  ))}
                </div>
              ))}
            </section>
          )}

          {(feed.readyForThisHour.cards.length > 0 || !readyForHourEnabled) && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <h2 className="serif-title" style={{ fontSize: '1.35rem' }}>
                  {t.sectionReadyForHour} ({feed.readyForThisHour.windowLabel})
                </h2>
                <button type="button" onClick={onToggleReadyForHour}>
                  {readyForHourEnabled ? 'Switch off' : 'Switch on'}
                </button>
              </div>
              {readyForHourEnabled &&
                feed.readyForThisHour.cards.map((c) => (
                  <FeedCard
                    key={c.memory.id}
                    memory={c.memory}
                    whySeeing={c.whySeeing}
                    onOpen={onOpenMemory}
                    onRefresh={onRefresh}
                    t={t}
                  />
                ))}
            </section>
          )}

          {feed.beforeItFades && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="serif-title" style={{ fontSize: '1.35rem' }}>
                {t.sectionBeforeItFades}
              </h2>
              <FeedCard
                memory={feed.beforeItFades.memory}
                whySeeing={feed.beforeItFades.whySeeing}
                onOpen={onOpenMemory}
                onRefresh={onRefresh}
                t={t}
              />
            </section>
          )}

          {feed.weeklyCard.visible && feed.weeklyCard.cards.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="serif-title" style={{ fontSize: '1.35rem' }}>
                {t.sectionWeekly}
              </h2>
              {feed.weeklyCard.cards.map((c) => (
                <FeedCard
                  key={c.memory.id}
                  memory={c.memory}
                  whySeeing={c.whySeeing}
                  onOpen={onOpenMemory}
                  onRefresh={onRefresh}
                  t={t}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
