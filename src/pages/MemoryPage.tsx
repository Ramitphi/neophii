import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Calendar, Download, Trash2, Undo2 } from 'lucide-react';
import { api, fetchAuthorizedMediaUrl } from '../lib/api';
import { downloadMemoryIcs } from '../lib/ics';
import type { StringsTable } from '../lib/i18n';
import type { BBox, Category, EvidenceItem, Memory, Project } from '../types/neophi';

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
  t,
}: {
  memoryId: string;
  categories: Category[];
  projects: Project[];
  onBack: () => void;
  onRefresh: () => void;
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
    } else if (memory?.media?.svgThumb) {
      setMediaUrl(memory.media.svgThumb);
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

  const handleEvidenceClick = (ev: EvidenceItem) => {
    if (ev.bbox) {
      setActiveBBox(ev.bbox);
    }
    if (typeof ev.t === 'number' && videoRef.current) {
      videoRef.current.currentTime = ev.t;
      void videoRef.current.play().catch(() => {});
    }
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
          {memory.sample && <span className="pill">SAMPLE</span>}
          {memory.ingest === 'unsupported' && <span className="pill">SOURCE DELETED</span>}
          {memory.ingest === 'link_metadata' && <span className="pill">LINK ONLY</span>}
          {memory.chip && <span className="pill">{memory.chip}</span>}
        </div>
      </div>

      <h1 className="serif-title" style={{ fontSize: '1.9rem' }}>
        {memory.title}
      </h1>

      {/* LANE 1: SOURCE */}
      <section className="card" aria-label={t.laneSource}>
        <h2 className="serif-title" style={{ fontSize: '1.35rem', marginBottom: 12 }}>
          {t.laneSource}
        </h2>

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

        {mediaUrl && (memory.media?.kind === 'image' || memory.media?.svgThumb) && (
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
            {memory.analysis.source_summary && <p style={{ margin: 0 }}>{memory.analysis.source_summary}</p>}
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

      {/* LANE 2: YOUR WORDS */}
      <section className="user-words-panel" aria-label={t.laneYourWords}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <h2 className="serif-title" style={{ fontSize: '1.35rem' }}>
            {t.laneYourWords}
          </h2>
          <button type="button" onClick={() => setEditingNote((v) => !v)}>
            {editingNote ? 'Cancel' : 'Edit note'}
          </button>
        </div>

        {editingNote ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea
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
              margin: '8px 0',
              fontSize: '1.25rem',
              fontFamily: 'var(--font-serif)',
              lineHeight: 1.5,
            }}
          >
            “{memory.note}”
          </blockquote>
        ) : (
          <p className="muted" style={{ margin: '8px 0' }}>
            {t.noNoteAdded}
          </p>
        )}

        <p className="muted" style={{ fontSize: '0.88rem', margin: '8px 0 0' }}>
          {t.keptExactly}
        </p>

        {memory.analysis?.note_grounding && memory.note && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span className="pill">Grounding: {memory.analysis.note_grounding.status}</span>
            {memory.analysis.note_grounding.explanation && (
              <span className="muted" style={{ fontSize: '0.9rem' }}>
                {memory.analysis.note_grounding.explanation}
              </span>
            )}
            {renderEvidenceChips(memory.analysis.note_grounding.evidence)}
          </div>
        )}
      </section>

      {/* LANE 3: AI SUGGESTIONS */}
      <section className="ai-panel" aria-label={t.laneAISuggestions}>
        <h2 className="serif-title" style={{ fontSize: '1.35rem', marginBottom: 12 }}>
          {t.laneAISuggestions}
        </h2>

        {memory.privateNoAI ? (
          <p className="muted">Private mode enabled — AI analysis was skipped.</p>
        ) : !memory.analysis || memory.analysis.inferred_possible_intents.length === 0 ? (
          <p className="muted">No AI suggestions for this item.</p>
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
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--surface-muted)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(item.confidence * 100)}%`,
                      height: '100%',
                      background: 'var(--accent)',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {renderEvidenceChips(item.evidence)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* FILING, PROJECTS, REMINDERS & ACTIONS */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="muted" style={{ fontSize: '0.88rem' }}>Category</span>
            <select
              value={memory.categoryId ?? ''}
              onChange={async (e) => {
                const updated = await api.patchMemory(memory.id, {
                  categoryId: e.target.value || null,
                });
                setMemory(updated);
                onRefresh();
              }}
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
          {memory.categoryWhy && (
            <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
              Why this category: {memory.categoryWhy}
            </p>
          )}
        </div>

        <div>
          <span className="muted" style={{ fontSize: '0.88rem', display: 'block', marginBottom: 6 }}>
            Projects
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {projects.map((p) => {
              const active = memory.projectIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={async () => {
                    const next = active
                      ? memory.projectIds.filter((id) => id !== p.id)
                      : [...memory.projectIds, p.id];
                    const updated = await api.patchMemory(memory.id, { projectIds: next });
                    setMemory(updated);
                    onRefresh();
                  }}
                  style={{
                    background: active ? 'var(--accent)' : 'var(--surface)',
                    color: active ? '#fff' : 'var(--text)',
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.88rem' }}>Remind me:</span>
          <button type="button" onClick={() => void setReminderDays(1)}>Tomorrow</button>
          <button type="button" onClick={() => void setReminderDays(3)}>Friday</button>
          <button type="button" onClick={() => void setReminderDays(7)}>In a week</button>
          <button type="button" onClick={() => downloadMemoryIcs(memory)}>
            <Calendar size={16} aria-hidden="true" />
            <span>.ics</span>
          </button>
        </div>

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
