import { useState } from 'react';
import { Calendar, Check, Clock, HelpCircle } from 'lucide-react';
import { api } from '../lib/api';
import { downloadMemoryIcs } from '../lib/ics';
import type { StringsTable } from '../lib/i18n';
import type { TodayCard, TodayResponse } from '../types/neophi';

function TodayCardItem({
  card,
  onOpen,
  onRefresh,
  t,
}: {
  card: TodayCard;
  onOpen: (id: string) => void;
  onRefresh: () => void;
  t: StringsTable;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const [showLater, setShowLater] = useState(false);

  const markDone = async () => {
    await api.patchMemory(card.memory.id, { doneAt: new Date().toISOString() });
    onRefresh();
  };

  const snoozeTo = async (hoursFromNow: number) => {
    const until = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
    await api.patchMemory(card.memory.id, { snoozedUntil: until });
    setShowLater(false);
    onRefresh();
  };

  return (
    <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <h3 className="serif-title" style={{ fontSize: '1.15rem' }}>
          {card.memory.title}
        </h3>
        {card.memory.sample && <span className="pill">SAMPLE</span>}
      </div>

      {card.memory.note && (
        <blockquote
          style={{
            margin: 0,
            padding: '8px 12px',
            borderLeft: '3px solid var(--user-border)',
            background: 'var(--user-bg)',
            borderRadius: '0 8px 8px 0',
          }}
        >
          {card.memory.note}
        </blockquote>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          style={{ minHeight: 48, fontSize: '0.88rem', padding: '6px 10px' }}
        >
          <HelpCircle size={15} aria-hidden="true" />
          <span>{t.whySeeingThis}</span>
        </button>
        {showWhy && (
          <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
            {card.whySeeing}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
        <button type="button" className="btn-primary" onClick={() => onOpen(card.memory.id)}>
          {t.actionOpen}
        </button>
        <button type="button" onClick={() => void markDone()}>
          <Check size={16} aria-hidden="true" />
          <span>{t.actionDone}</span>
        </button>
        <button type="button" onClick={() => setShowLater((v) => !v)}>
          <Clock size={16} aria-hidden="true" />
          <span>{t.actionLater}</span>
        </button>
        <button type="button" onClick={() => downloadMemoryIcs(card.memory)}>
          <Calendar size={16} aria-hidden="true" />
          <span>{t.actionIcs}</span>
        </button>
      </div>

      {showLater && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 6 }}>
          <button type="button" onClick={() => void snoozeTo(5)}>
            Tonight
          </button>
          <button type="button" onClick={() => void snoozeTo(48)}>
            This weekend
          </button>
          <button type="button" onClick={() => void snoozeTo(24 * 7)}>
            Next week
          </button>
        </div>
      )}
    </article>
  );
}

export function TodayPage({
  feed,
  readyForHourEnabled,
  onToggleReadyForHour,
  onOpenMemory,
  onOpenCapture,
  onLoadSamples,
  onRefresh,
  t,
}: {
  feed: TodayResponse | null;
  readyForHourEnabled: boolean;
  onToggleReadyForHour: () => void;
  onOpenMemory: (id: string) => void;
  onOpenCapture: (focusUrl?: boolean) => void;
  onLoadSamples: () => Promise<void>;
  onRefresh: () => void;
  t: StringsTable;
}) {
  const [loadingSamples, setLoadingSamples] = useState(false);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 20 }}>
      {feed.justArrived.length > 0 && (
        <section>
          <h2 className="serif-title" style={{ fontSize: '1.4rem', marginBottom: 12 }}>
            {t.sectionJustArrived}
          </h2>
          <div className="grid-cards">
            {feed.justArrived.map((c) => (
              <TodayCardItem key={c.memory.id} card={c} onOpen={onOpenMemory} onRefresh={onRefresh} t={t} />
            ))}
          </div>
        </section>
      )}

      {feed.youAskedForThis.length > 0 && (
        <section>
          <h2 className="serif-title" style={{ fontSize: '1.4rem', marginBottom: 12 }}>
            {t.sectionYouAsked}
          </h2>
          <div className="grid-cards">
            {feed.youAskedForThis.map((c) => (
              <TodayCardItem key={c.memory.id} card={c} onOpen={onOpenMemory} onRefresh={onRefresh} t={t} />
            ))}
          </div>
        </section>
      )}

      {feed.activeProjects.length > 0 && (
        <section>
          <h2 className="serif-title" style={{ fontSize: '1.4rem', marginBottom: 12 }}>
            {t.sectionActiveProjects}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {feed.activeProjects.map((grp) => (
              <div key={grp.project.id}>
                <h3 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: 10 }}>
                  {grp.project.name}
                </h3>
                <div className="grid-cards">
                  {grp.cards.map((c) => (
                    <TodayCardItem key={c.memory.id} card={c} onOpen={onOpenMemory} onRefresh={onRefresh} t={t} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(feed.readyForThisHour.cards.length > 0 || !readyForHourEnabled) && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h2 className="serif-title" style={{ fontSize: '1.4rem' }}>
              {t.sectionReadyForHour} ({feed.readyForThisHour.windowLabel})
            </h2>
            <button type="button" onClick={onToggleReadyForHour}>
              {readyForHourEnabled ? 'Switch off' : 'Switch on'}
            </button>
          </div>
          {readyForHourEnabled && feed.readyForThisHour.cards.length > 0 && (
            <div className="grid-cards">
              {feed.readyForThisHour.cards.map((c) => (
                <TodayCardItem key={c.memory.id} card={c} onOpen={onOpenMemory} onRefresh={onRefresh} t={t} />
              ))}
            </div>
          )}
        </section>
      )}

      {feed.beforeItFades && (
        <section>
          <h2 className="serif-title" style={{ fontSize: '1.4rem', marginBottom: 12 }}>
            {t.sectionBeforeItFades}
          </h2>
          <div className="grid-cards">
            <TodayCardItem card={feed.beforeItFades} onOpen={onOpenMemory} onRefresh={onRefresh} t={t} />
          </div>
        </section>
      )}

      {feed.weeklyCard.visible && feed.weeklyCard.cards.length > 0 && (
        <section>
          <h2 className="serif-title" style={{ fontSize: '1.4rem', marginBottom: 12 }}>
            {t.sectionWeekly}
          </h2>
          <div className="grid-cards">
            {feed.weeklyCard.cards.map((c) => (
              <TodayCardItem key={c.memory.id} card={c} onOpen={onOpenMemory} onRefresh={onRefresh} t={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
