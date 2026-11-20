import { useEffect, useState } from 'react';
import { Lock, Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import type { StringsTable } from '../lib/i18n';
import type { Memory, MemoryChip } from '../types/neophi';

const CHIPS: MemoryChip[] = [
  'Try',
  'Buy',
  'Learn',
  'Remix',
  'Go there',
  'Share with',
  'Just remember',
];

export function CaptureModal({
  open,
  initialFocusUrl,
  onClose,
  onSaved,
  t,
}: {
  open: boolean;
  initialFocusUrl?: boolean;
  onClose: () => void;
  onSaved: (memory: Memory) => void;
  t: StringsTable;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [note, setNote] = useState('');
  const [chip, setChip] = useState<MemoryChip | null>(null);
  const [privateNoAI, setPrivateNoAI] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Escape closes the sheet, like the search sheet, unless a save is in progress.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleFileChange = (f: File | null) => {
    setError(null);
    setVideoDurationSec(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setError('File exceeds 15 MB limit.');
      return;
    }
    if (f.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        if (video.duration > 60) {
          setError('Video exceeds 60 second limit.');
          setFile(null);
        } else {
          setVideoDurationSec(Math.round(video.duration));
          setFile(f);
        }
      };
      video.src = URL.createObjectURL(f);
      return;
    }
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file && !url.trim() && !caption.trim() && !note.trim()) {
      setError('Add a file, link, caption, or note.');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      if (videoDurationSec !== null) fd.append('videoDurationSec', String(videoDurationSec));
      if (url.trim()) fd.append('url', url.trim());
      if (caption.trim()) fd.append('caption', caption.trim());
      // Keep note byte-identical (never trim!)
      if (note.length > 0) fd.append('note', note);
      if (chip) fd.append('chip', chip);
      fd.append('privateNoAI', String(privateNoAI));

      const created = await api.createMemory(fd);

      if (!privateNoAI && created.analysisStatus === 'pending') {
        setStatusMessage(t.captureReading);
        let latest = created;
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 700));
          latest = await api.getMemory(created.id);
          if (latest.analysisStatus !== 'pending') break;
        }
        if (latest.analysisStatus === 'failed') {
          setStatusMessage(t.captureFailed);
          setTimeout(() => {
            onSaved(latest);
            onClose();
          }, 1200);
          return;
        }
        onSaved(latest);
      } else {
        onSaved(created);
      }

      setFile(null);
      setUrl('');
      setCaption('');
      setNote('');
      setChip(null);
      setPrivateNoAI(false);
      setStatusMessage(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t.captureTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="modal-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 className="serif-title" style={{ fontSize: '1.5rem' }}>
            {t.captureTitle}
          </h2>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>{t.captureUploadLabel}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              style={{ padding: 8, border: '1px dashed var(--border)', borderRadius: 10 }}
            />
            {file && (
              <span className="pill">
                <Upload size={14} aria-hidden="true" /> {file.name}
              </span>
            )}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>{t.captureUrlLabel}</span>
            <input
              type="url"
              autoFocus={initialFocusUrl}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://instagram.com/reel/…"
              style={{
                minHeight: 48,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>{t.captureCaptionLabel}</span>
            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>{t.captureNoteLabel}</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.captureNotePlaceholder}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1.5px solid var(--user-border)',
                background: 'var(--user-bg)',
              }}
            />
          </label>

          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChip(chip === c ? null : c)}
                  style={{
                    background: chip === c ? 'var(--accent)' : 'var(--surface)',
                    color: chip === c ? '#fff' : 'var(--text)',
                    borderColor: chip === c ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 48,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={privateNoAI}
              onChange={(e) => setPrivateNoAI(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            <Lock size={16} aria-hidden="true" />
            <span>{t.capturePrivateSwitch}</span>
          </label>

          {error && (
            <p style={{ color: 'var(--danger)', margin: 0 }} role="alert">
              {error}
            </p>
          )}
          {statusMessage && (
            <p className="pill pill-ai" role="status">
              {statusMessage}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? t.captureReading : t.saveButton}
          </button>
        </form>
      </div>
    </div>
  );
}
