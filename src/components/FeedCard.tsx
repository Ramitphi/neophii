import { useState } from 'react';
import { Calendar, Check, Clock, ExternalLink, HelpCircle, Pencil, Undo2 } from 'lucide-react';
import { api } from '../lib/api';
import { downloadMemoryIcs } from '../lib/ics';
import type { StringsTable } from '../lib/i18n';
import type { Memory } from '../types/neophi';
import { laterNotes } from '../lib/notes';
import { ReelTile } from './ReelTile';

export function FeedCard({
  memory,
  whySeeing,
  onOpen,
  onRefresh,
  t,
}: {
  memory: Memory;
  whySeeing?: string;
  onOpen: (id: string) => void;
  onRefresh: () => void;
  t: StringsTable;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const later = laterNotes(memory);

  const markDone = async () => {
    await api.patchMemory(memory.id, { doneAt: new Date().toISOString() });
    onRefresh();
  };

  const snoozeTo = async (hoursFromNow: number) => {
    const until = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
    await api.patchMemory(memory.id, { snoozedUntil: until });
    setShowLater(false);
    onRefresh();
  };

  const undoIdx = memory.ledger.findIndex(
    (l) => l.undoable && l.undoAction?.field === 'categoryId'
  );

  const undoAiCategory = async () => {
    if (undoIdx >= 0) {
      await api.undoLedger(memory.id, undoIdx);
      onRefresh();
    }
  };

  return (
    <article className="feed-card">
      <div className="feed-media-wrap">
        <ReelTile memory={memory} onOpen={() => onOpen(memory.id)} />

        <div className="feed-action-rail" aria-label="Quick actions">
          <div className="rail-item">
            <button type="button" className="rail-btn" aria-label={t.actionDone} onClick={() => void markDone()}>
              <Check size={20} aria-hidden="true" />
            </button>
            <span className="rail-label">{t.actionDone}</span>
          </div>
          <div className="rail-item">
            <button
              type="button"
              className="rail-btn"
              aria-label={t.actionLater}
              aria-expanded={showLater}
              onClick={() => setShowLater((v) => !v)}
            >
              <Clock size={20} aria-hidden="true" />
            </button>
            <span className="rail-label">{t.actionLater}</span>
          </div>
          <div className="rail-item">
            <button
              type="button"
              className="rail-btn"
              aria-label="Add to calendar (.ics)"
              onClick={() => downloadMemoryIcs(memory)}
            >
              <Calendar size={20} aria-hidden="true" />
            </button>
            <span className="rail-label">.ics</span>
          </div>
          {whySeeing && (
            <div className="rail-item">
              <button
                type="button"
                className="rail-btn"
                aria-label={t.whySeeingThis}
                aria-expanded={showWhy}
                onClick={() => setShowWhy((v) => !v)}
              >
                <HelpCircle size={20} aria-hidden="true" />
              </button>
              <span className="rail-label">Why</span>
            </div>
          )}
        </div>
      </div>

      {/* The user's exact words come first, directly below the save. */}
      <div className="feed-words-first">
        {memory.note ? (
          <div className="feed-user-note">
            <span className="feed-note-label">{t.laneYourWords}</span>
            <p className="feed-note-text">“{memory.note}”</p>
          </div>
        ) : (
          <p className="feed-no-note">{t.noNoteAdded}</p>
        )}
        {later.length > 0 && (
          <ul className="feed-later-notes" aria-label={t.laterNotesLabel}>
            {later.map((n) => (
              <li key={n.deliveryId}>
                <span className="feed-note-label">{t.laterNotesLabel}</span>
                <p className="feed-note-text">“{n.text}”</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showLater && (
        <div className="feed-inline-row">
          <button type="button" onClick={() => void snoozeTo(5)}>Tonight</button>
          <button type="button" onClick={() => void snoozeTo(48)}>This weekend</button>
          <button type="button" onClick={() => void snoozeTo(24 * 7)}>Next week</button>
        </div>
      )}

      {showWhy && whySeeing && <p className="feed-why">{whySeeing}</p>}

      <div className="feed-card-body">
        <div className="feed-tags">
          {memory.chip && <span className="tag tag-strong">{memory.chip}</span>}
          {memory.sample && <span className="tag">Sample</span>}
          {memory.ingest === 'link_metadata' && <span className="tag">Link only</span>}
          {memory.ingest === 'unsupported' && <span className="tag">Source deleted</span>}
        </div>

        {memory.categoryByAI && memory.categoryWhy && (
          <div className="feed-ai-receipt">
            <span className="pill pill-ai">{t.aiSuggestionPill}</span>
            <span className="feed-ai-text">{memory.categoryWhy}</span>
            {undoIdx >= 0 && (
              <button type="button" className="feed-ai-undo" onClick={() => void undoAiCategory()}>
                <Undo2 size={14} aria-hidden="true" />
                {t.undoLabel}
              </button>
            )}
          </div>
        )}

        <div className="feed-cta-row">
          <button type="button" className="btn-primary feed-open-btn" onClick={() => onOpen(memory.id)}>
            {t.actionOpen}
          </button>
          <button type="button" className="feed-note-trigger" onClick={() => onOpen(memory.id)}>
            <Pencil size={15} aria-hidden="true" />
            <span>{memory.note ? 'Edit your note…' : 'Add your note…'}</span>
          </button>
          {memory.url && (
            <a
              href={memory.url}
              target="_blank"
              rel="noreferrer"
              className="btn feed-link-btn"
              aria-label="Open original link"
            >
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
