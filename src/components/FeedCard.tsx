import { useEffect, useState } from 'react';
import { Calendar, Check, Clock, HelpCircle, Pencil, Undo2 } from 'lucide-react';
import { api, fetchAuthorizedMediaUrl } from '../lib/api';
import { downloadMemoryIcs } from '../lib/ics';
import type { StringsTable } from '../lib/i18n';
import type { Memory } from '../types/neophi';

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
  const [thumbSrc, setThumbSrc] = useState<string | null>(memory.media?.svgThumb ?? null);
  const [showWhy, setShowWhy] = useState(false);
  const [showLater, setShowLater] = useState(false);

  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    if (!memory.media?.svgThumb && memory.media?.kind === 'image' && memory.media.gcsPath) {
      void fetchAuthorizedMediaUrl(memory.id, true).then((url) => {
        if (active && url) {
          objUrl = url;
          setThumbSrc(url);
        }
      });
    } else if (memory.media?.svgThumb) {
      setThumbSrc(memory.media.svgThumb);
    }
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [memory]);

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

  const undoAiCategory = async () => {
    const idx = memory.ledger.findIndex(
      (l) => l.undoable && l.undoAction?.field === 'categoryId'
    );
    if (idx >= 0) {
      await api.undoLedger(memory.id, idx);
      onRefresh();
    }
  };

  return (
    <article className="feed-card">
      {/* Media frame + floating right action rail */}
      <div className="feed-media-wrap">
        <div className="feed-media-box" onClick={() => onOpen(memory.id)}>
          {thumbSrc ? (
            <img src={thumbSrc} alt={memory.title} className="feed-media-img" />
          ) : (
            <div className="feed-media-placeholder">
              <span className="pill">{memory.platform}</span>
              <p className="serif-title" style={{ fontSize: '1.25rem', marginTop: 8 }}>
                {memory.title}
              </p>
              {memory.caption && (
                <p className="muted" style={{ fontSize: '0.9rem', margin: '6px 0 0' }}>
                  {memory.caption.slice(0, 110)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="feed-action-rail" aria-label="Quick actions">
          <button
            type="button"
            className="rail-btn"
            title={t.actionDone}
            aria-label={t.actionDone}
            onClick={() => void markDone()}
          >
            <Check size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="rail-btn"
            title={t.actionLater}
            aria-label={t.actionLater}
            onClick={() => setShowLater((v) => !v)}
          >
            <Clock size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="rail-btn"
            title={t.actionIcs}
            aria-label={t.actionIcs}
            onClick={() => downloadMemoryIcs(memory)}
          >
            <Calendar size={18} aria-hidden="true" />
          </button>
          {whySeeing && (
            <button
              type="button"
              className="rail-btn"
              title={t.whySeeingThis}
              aria-label={t.whySeeingThis}
              onClick={() => setShowWhy((v) => !v)}
            >
              <HelpCircle size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="feed-card-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h3 className="serif-title" style={{ fontSize: '1.3rem' }}>
            {memory.title}
          </h3>
        </div>

        {memory.note ? (
          <blockquote className="feed-user-note">“{memory.note}”</blockquote>
        ) : memory.caption ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.94rem' }}>
            {memory.caption}
          </p>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {memory.chip && <span className="pill">{memory.chip}</span>}
          {memory.sample && <span className="pill">SAMPLE</span>}
          {memory.ingest === 'unsupported' && <span className="pill">SOURCE DELETED</span>}
          {memory.ingest === 'link_metadata' && <span className="pill">LINK ONLY</span>}
          {memory.analysis?.source_summary && (
            <span className="pill pill-ai">{t.aiSuggestionPill}</span>
          )}
        </div>

        {memory.categoryByAI && memory.categoryWhy && (
          <div className="ai-panel" style={{ padding: 10, fontSize: '0.86rem' }}>
            <span>{memory.categoryWhy}</span>
            {memory.ledger.some((l) => l.undoable && l.undoAction?.field === 'categoryId') && (
              <button
                type="button"
                onClick={() => void undoAiCategory()}
                style={{ marginLeft: 8, minHeight: 38, padding: '4px 10px' }}
              >
                <Undo2 size={14} aria-hidden="true" />
                <span>{t.undoLabel}</span>
              </button>
            )}
          </div>
        )}

        {showWhy && whySeeing && (
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            {whySeeing}
          </p>
        )}

        {showLater && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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

        {/* Bottom CTA row inspired by the reference feed */}
        <div className="feed-cta-row">
          <button type="button" className="btn-primary" onClick={() => onOpen(memory.id)}>
            {t.actionOpen}
          </button>
          <button
            type="button"
            className="feed-note-trigger"
            onClick={() => onOpen(memory.id)}
          >
            <Pencil size={15} aria-hidden="true" />
            <span>{memory.note ? 'Edit your note…' : 'Add your note…'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
