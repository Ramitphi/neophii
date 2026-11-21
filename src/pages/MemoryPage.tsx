import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Calendar, Download, Trash2, Undo2 } from 'lucide-react';
import { ReelTile } from '../components/ReelTile';
import { api, fetchAuthorizedMediaUrl } from '../lib/api';
import { downloadMemoryIcs } from '../lib/ics';
import { laterNotes } from '../lib/notes';
import type { StringsTable } from '../lib/i18n';
import type { BBox, Category, EvidenceItem, LanguageCode, Memory, MemoryChip, Project } from '../types/neophi';
import { FEED_STRINGS } from './feedStrings';

const CHIPS: MemoryChip[] = ['Try', 'Buy', 'Learn', 'Remix', 'Go there', 'Share with', 'Just remember'];

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function MemoryPage({
  memoryId,
  categories,
  projects,
  onBack,
  onRefresh,
  lang = 'en',
  t,
}: {
  memoryId: string;
  categories: Category[];
  projects: Project[];
  onBack: () => void;
  onRefresh: () => void;
  lang?: LanguageCode;
  t: StringsTable;
}) {
  const [memory, setMemory] = useState<Memory | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [activeBBox, setActiveBBox] = useState<BBox | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const load = async (markOpen = false) => {
    const m = await api.getMemory(memoryId, markOpen);
    setMemory(m);
    setNoteDraft(m.note ?? '');
  };

  useEffect(() => {
    void load(true);
  }, [memoryId]);

  // A save that just arrived by Instagram DM is still filling in: its note may land seconds after the Reel and the
  // reading takes a moment. Keep it fresh while it is on screen, without touching a note the person is typing.
  const inFlight =
    Boolean(memory?.dm) &&
    (memory?.analysisStatus === 'pending' || Date.now() - new Date(memory?.createdAt ?? 0).getTime() < 3 * 60_000);
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await api.getMemory(memoryId);
        setMemory((prev) => {
          if (prev && prev.updatedAt === next.updatedAt) return prev;
          setNoteDraft((draft) => (draft === (prev?.note ?? '') ? (next.note ?? '') : draft));
          return next;
        });
      } catch {
        /* a missed refresh is fine; the next one tries again */
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [inFlight, memoryId]);

  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    if (memory?.media?.gcsPath) {
      void fetchAuthorizedMediaUrl(memory.id, false).then((u) => {
        if (active && u) {
          objUrl = u;
          setMediaUrl(u);
        }
      });
    } else {
      setMediaUrl(null);
    }
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [memory]);

  if (!memory) {
    return <p className="muted" style={{ marginTop: 24 }}>Loading…</p>;
  }

  const later = laterNotes(memory);

  const handleEvidenceClick = (ev: EvidenceItem) => {
    if (ev.bbox) {
      setActiveBBox(ev.bbox);
    }
    if (typeof ev.t === 'number' && videoRef.current) {
      videoRef.current.currentTime = ev.t;
      void videoRef.current.play().catch(() => {});
    }
  };

  /** Compact source tags for key points: where each point came from, without repeating the whole caption. */
  const renderSourceTags = (ids: string[]) => {
    if (!memory.analysis) return null;
    const tags = new Set<string>();
    for (const id of ids) {
      const ev = memory.analysis.evidence.find((e) => e.id === id);
      if (!ev) continue;
      tags.add(ev.kind === 'frame' && typeof ev.t === 'number' ? formatTime(ev.t) : ev.kind);
    }
    return [...tags].map((tag) => (
      <span key={tag} className="key-point-source">
        {tag}
      </span>
    ));
  };

  const renderEvidenceChips = (ids: string[]) => {
    if (!memory.analysis) return null;
    if (ids.length === 0) {
      return <span className="pill">{t.notSureNoEvidence}</span>;
    }
    return ids.map((id) => {
      const ev = memory.analysis!.evidence.find((e) => e.id === id);
      if (!ev) return null;
      const label =
        ev.kind === 'frame' && typeof ev.t === 'number'
          ? `frame ${formatTime(ev.t)}${typeof ev.tEnd === 'number' ? `–${formatTime(ev.tEnd)}` : ''}`
          : ev.ref;
      return (
        <button
          key={id}
          type="button"
          onClick={() => handleEvidenceClick(ev)}
          style={{ minHeight: 48, padding: '6px 12px', fontSize: '0.88rem' }}
        >
          {label}
        </button>
      );
    });
  };

  const saveNote = async () => {
    const updated = await api.patchMemory(memory.id, { note: noteDraft });
    setMemory(updated);
    setEditingNote(false);
    onRefresh();
  };

  const patch = async (changes: Record<string, unknown>) => {
    const updated = await api.patchMemory(memory.id, changes);
    setMemory(updated);
    onRefresh();
  };

  const setReminderDays = async (days: number) => {
    const dt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const updated = await api.patchMemory(memory.id, { remindAt: dt.toISOString() });
    setMemory(updated);
    onRefresh();
  };

  const exportMarkdown = () => {
    const md = [
      `# ${memory.title}`,
      '',
      memory.url ? `- URL: ${memory.url}` : null,
      memory.caption ? `- Caption: ${memory.caption}` : null,
      '',
      '## Your words',
      memory.note ? `> ${memory.note}` : '_No note added._',
      ...later.map((n) => `> ${n.text}`),
      '',
      '## AI reading',
      memory.analysis?.source_summary || '_None_',
    ]
      .filter((l) => l !== null)
      .join('\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${memory.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    await api.deleteMemory(memory.id);
    onRefresh();
    onBack();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" />
          <span>Back</span>
        </button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {memory.dm && (
            <span className="pill">{memory.dm.simulated ? FEED_STRINGS[lang].ig.simulated : FEED_STRINGS[lang].ig.fromInstagram}</span>
          )}
          {memory.sample && <span className="pill">SAMPLE</span>}
          {memory.ingest === 'unsupported' && <span className="pill">SOURCE DELETED</span>}
          {memory.ingest === 'link_metadata' && <span className="pill">LINK ONLY</span>}
          {memory.chip && <span className="pill">{memory.chip}</span>}
        </div>
      </div>

      <h1 className="serif-title" style={{ fontSize: '1.9rem' }}>
        {memory.title}
      </h1>

      {/* 1. SOURCE EVIDENCE */}
      <section className="card memory-lane" aria-labelledby="lane-source">
        <div className="memory-lane-head">
          <h2 id="lane-source" className="serif-title">
            <span className="memory-lane-num" aria-hidden="true">1</span>
            {t.laneSourceEvidence}
          </h2>
          <p className="memory-lane-hint">{t.laneSourceHint}</p>
        </div>

        {memory.ingest === 'link_metadata' && (
          <p className="pill" style={{ marginBottom: 10 }}>
            {t.linkOnlyMessage}
          </p>
        )}

        {memory.ingest === 'unsupported' && (
          <p className="pill" style={{ marginBottom: 10 }}>
            {t.unsupportedMessage}
          </p>
        )}

        {mediaUrl && memory.media?.kind === 'video' && memory.media.gcsPath && (
          <div style={{ marginBottom: 12 }}>
            <video ref={videoRef} src={mediaUrl} controls style={{ width: '100%', maxHeight: 360, borderRadius: 10 }} />
          </div>
        )}

        {mediaUrl && memory.media?.kind === 'image' && memory.media.gcsPath && (
          <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', marginBottom: 12 }}>
            <img
              src={mediaUrl}
              alt={memory.title}
              style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 10, display: 'block' }}
            />
            {activeBBox && (
              <div
                style={{
                  position: 'absolute',
                  left: `${activeBBox.x}%`,
                  top: `${activeBBox.y}%`,
                  width: `${activeBBox.w}%`,
                  height: `${activeBBox.h}%`,
                  border: '3px solid var(--accent)',
                  borderRadius: 6,
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        )}

        {!memory.media?.gcsPath && (
          <div style={{ marginBottom: 12 }}>
            <ReelTile memory={memory} />
          </div>
        )}

        {memory.url && (
          <p style={{ margin: '6px 0', wordBreak: 'break-all' }}>
            <a href={memory.url} target="_blank" rel="noreferrer">
              {memory.url}
            </a>
          </p>
        )}

        {memory.caption && (
          <p className="muted" style={{ margin: '6px 0' }}>
            {memory.caption}
          </p>
        )}

        {memory.ingest !== 'unsupported' && memory.analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {memory.analysis.what_this_is && (
              <p style={{ margin: 0 }}>
                <span className="pill pill-ai">{t.aiWhatThisIs}</span> {memory.analysis.what_this_is}
              </p>
            )}
            {memory.analysis.source_summary && <p style={{ margin: 0 }}>{memory.analysis.source_summary}</p>}
            {(memory.analysis.key_points?.length ?? 0) > 0 && (
              <div className="key-points">
                <h3 className="key-points-title">
                  {t.keyPointsTitle} <span className="pill pill-ai">AI</span>
                </h3>
                <ul>
                  {memory.analysis.key_points!.map((p, idx) => (
                    <li key={idx}>
                      <span className="key-point-kind">{p.kind}</span> {p.text} {renderSourceTags(p.evidence)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {memory.analysis.caption_signal?.usefulness === 'noise' && memory.analysis.caption_signal.ignored_reason && (
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                {t.captionSkipped} {memory.analysis.caption_signal.ignored_reason}
              </p>
            )}
            {memory.analysis.observed_objects.map((obj, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  background: 'var(--surface-muted)',
                  borderRadius: 10,
                }}
              >
                <strong>{obj.label}</strong>
                {obj.uncertain && <span className="pill">{t.notSureNoEvidence}</span>}
                {renderEvidenceChips(obj.evidence)}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. YOUR WORDS — only what the user wrote, nothing from the AI */}
      <section className="user-words-panel memory-lane" aria-labelledby="lane-words">
        <div className="memory-lane-head">
          <h2 id="lane-words" className="serif-title">
            <span className="memory-lane-num" aria-hidden="true">2</span>
            {t.laneYourWords}
          </h2>
          <button type="button" onClick={() => setEditingNote((v) => !v)}>
            {editingNote ? 'Cancel' : 'Edit note'}
          </button>
        </div>

        {editingNote ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea
              id="memory-note-edit"
              rows={3}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              style={{
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
              }}
            />
            <button type="button" className="btn-primary" onClick={() => void saveNote()}>
              Save note
            </button>
          </div>
        ) : memory.note ? (
          <blockquote
            style={{
              margin: '4px 0',
              fontSize: '1.25rem',
              fontFamily: 'var(--font-serif)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            “{memory.note}”
          </blockquote>
        ) : (
          <p className="muted" style={{ margin: '4px 0' }}>
            {t.noNoteAdded}
          </p>
        )}

        {later.length > 0 && (
          <ul className="memory-later-notes">
            {later.map((n) => (
              <li key={n.deliveryId}>
                <span className="memory-choice-label">
                  {t.laterNotesLabel} · {new Date(n.sentAt).toLocaleString()}
                </span>
                <blockquote>“{n.text}”</blockquote>
              </li>
            ))}
          </ul>
        )}

        <p className="muted" style={{ fontSize: '0.88rem', margin: 0 }}>
          {t.keptExactly}
        </p>
      </section>

      {/* 3. YOUR CHOICES — things only the user sets */}
      <section className="card memory-lane" aria-labelledby="lane-choices">
        <div className="memory-lane-head">
          <h2 id="lane-choices" className="serif-title">
            <span className="memory-lane-num" aria-hidden="true">3</span>
            {t.laneYourChoices}
          </h2>
          <p className="memory-lane-hint">{t.laneChoicesHint}</p>
        </div>

        <div>
          <span className="memory-choice-label">{t.chipChoiceLabel}</span>
          <div className="memory-choice-row">
            {CHIPS.map((chip) => {
              const active = memory.chip === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  className="memory-choice-btn"
                  aria-pressed={active}
                  onClick={() => void patch({ chip: active ? null : chip })}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>

        <div className="memory-choice-row">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="memory-choice-label" style={{ marginBottom: 0 }}>Category</span>
            <select
              id="memory-category"
              value={memory.categoryId ?? ''}
              onChange={(e) => void patch({ categoryId: e.target.value || null })}
              style={{ minHeight: 48, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {memory.categoryByAI && memory.categoryWhy && (
            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <span className="pill pill-ai">{t.aiSuggestionPill}</span>
              <span className="muted" style={{ fontSize: '0.9rem' }}>
                {memory.categoryWhy}
              </span>
            </span>
          )}
        </div>

        <div>
          <span className="memory-choice-label">Projects</span>
          <div className="memory-choice-row">
            {projects.length === 0 && <span className="muted">No projects yet.</span>}
            {projects.map((p) => {
              const active = memory.projectIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="memory-choice-btn"
                  aria-pressed={active}
                  onClick={() =>
                    void patch({
                      projectIds: active ? memory.projectIds.filter((id) => id !== p.id) : [...memory.projectIds, p.id],
                    })
                  }
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="memory-choice-label">
            Remind me{memory.remindAt ? ` · ${new Date(memory.remindAt).toLocaleDateString()}` : ''}
          </span>
          <div className="memory-choice-row">
            <button type="button" onClick={() => void setReminderDays(1)}>Tomorrow</button>
            <button type="button" onClick={() => void setReminderDays(3)}>In 3 days</button>
            <button type="button" onClick={() => void setReminderDays(7)}>In a week</button>
            <button type="button" onClick={() => downloadMemoryIcs(memory)}>
              <Calendar size={16} aria-hidden="true" />
              <span>.ics</span>
            </button>
          </div>
        </div>

        <label className="memory-private" htmlFor="memory-private">
          <input
            id="memory-private"
            type="checkbox"
            checked={memory.privateNoAI}
            onChange={(e) => void patch({ privateNoAI: e.target.checked })}
          />
          <span>
            <strong>{t.privateChoiceLabel}</strong>
            <span className="memory-lane-hint" style={{ display: 'block' }}>
              {t.privateChoiceHint}
            </span>
          </span>
        </label>
      </section>

      {/* 4. AI IDEAS — labelled guesses, kept apart from the user's words and choices */}
      <section className="ai-panel memory-lane" aria-labelledby="lane-ai">
        <div className="memory-lane-head">
          <h2 id="lane-ai" className="serif-title">
            <span className="memory-lane-num" aria-hidden="true">4</span>
            {t.laneAIIdeas}
          </h2>
          <p className="memory-lane-hint">{t.laneAIHint}</p>
        </div>

        {memory.privateNoAI ? (
          <p className="muted" style={{ margin: 0 }}>Private mode is on, so no AI ideas are made for this save.</p>
        ) : (
          <>
            {memory.analysis?.note_grounding && memory.note && memory.analysis.note_grounding.status !== 'not_attempted' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <span className="pill pill-ai">
                  {memory.analysis.note_grounding.status === 'grounded' ? 'Your note matches the source' : t.notSureNoEvidence}
                </span>
                {memory.analysis.note_grounding.explanation && (
                  <span className="muted" style={{ fontSize: '0.9rem' }}>
                    {memory.analysis.note_grounding.explanation}
                  </span>
                )}
                {renderEvidenceChips(memory.analysis.note_grounding.evidence)}
              </div>
            )}
            {!memory.analysis && memory.analysisStatus === 'pending' ? (
              <p className="muted" style={{ margin: 0 }} role="status">{FEED_STRINGS[lang].aiPending}</p>
            ) : !memory.analysis || memory.analysis.inferred_possible_intents.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No AI ideas for this save.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {memory.analysis.inferred_possible_intents.map((item, idx) => (
                  <div key={idx} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <span className="pill pill-ai">{t.aiSuggestionPill}</span>
                      <span className="muted" style={{ fontSize: '0.88rem' }}>
                        {item.uncertain ? t.notSureNoEvidence : `${Math.round(item.confidence * 100)}%`}
                      </span>
                    </div>
                    <p style={{ margin: 0 }}>{item.intent}</p>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-muted)', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.round(item.confidence * 100)}%`,
                          height: '100%',
                          background: 'var(--accent)',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{renderEvidenceChips(item.evidence)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ACTIONS */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={exportMarkdown}>
            <Download size={16} aria-hidden="true" />
            <span>Export Markdown</span>
          </button>
          <button type="button" className="btn-danger" onClick={() => void handleDelete()}>
            <Trash2 size={16} aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </section>

      {/* LEDGER */}
      <section className="card">
        <h2 className="serif-title" style={{ fontSize: '1.25rem', marginBottom: 10 }}>
          {t.ledgerTitle}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {memory.ledger.map((entry, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                padding: '8px 10px',
                background: 'var(--surface-muted)',
                borderRadius: 8,
              }}
            >
              <div>
                <span className="pill" style={{ marginRight: 8 }}>
                  {entry.who === 'ai' ? 'AI' : 'YOU'}
                </span>
                <span>{entry.text}</span>
              </div>
              {entry.undoable && (
                <button
                  type="button"
                  onClick={async () => {
                    const updated = await api.undoLedger(memory.id, idx);
                    setMemory(updated);
                    onRefresh();
                  }}
                >
                  <Undo2 size={15} aria-hidden="true" />
                  <span>{t.undoLabel}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
