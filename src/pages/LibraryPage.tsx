import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { api, fetchAuthorizedMediaUrl } from '../lib/api';
import type { StringsTable } from '../lib/i18n';
import type { Category, Memory } from '../types/neophi';

function MemoryThumb({ memory }: { memory: Memory }) {
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

  if (!src) return null;
  return (
    <img
      src={src}
      alt={memory.title}
      style={{
        width: '100%',
        height: 140,
        objectFit: 'cover',
        borderRadius: 10,
        background: 'var(--surface-muted)',
      }}
    />
  );
}

export function LibraryPage({
  memories,
  categories,
  onOpenMemory,
  onRefresh,
  t,
}: {
  memories: Memory[];
  categories: Category[];
  onOpenMemory: (id: string) => void;
  onRefresh: () => void;
  t: StringsTable;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const grouped = new Map<string, Memory[]>();
  for (const cat of categories) {
    grouped.set(cat.id, []);
  }
  grouped.set('uncategorized', []);

  for (const m of memories) {
    const key = m.categoryId && grouped.has(m.categoryId) ? m.categoryId : 'uncategorized';
    grouped.get(key)!.push(m);
  }

  const handleRename = async (catId: string) => {
    if (!renameText.trim()) return;
    await api.renameCategory(catId, renameText.trim());
    setRenamingId(null);
    onRefresh();
  };

  const handleUndoAiCategory = async (m: Memory) => {
    const idx = m.ledger.findIndex(
      (l) => l.undoable && l.undoAction?.field === 'categoryId'
    );
    if (idx >= 0) {
      await api.undoLedger(m.id, idx);
      onRefresh();
    }
  };

  if (memories.length === 0) {
    return (
      <div className="card" style={{ marginTop: 24, padding: 24 }}>
        <p className="muted">Your library is empty. Save something or load the sample library from Today.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 20 }}>
      {Array.from(grouped.entries()).map(([catId, items]) => {
        if (items.length === 0) return null;
        const cat = categories.find((c) => c.id === catId);
        const heading = cat ? cat.name : 'Uncategorized';

        return (
          <section key={catId}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 12,
              }}
            >
              {renamingId === catId ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    style={{
                      minHeight: 48,
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                    }}
                  />
                  <button type="button" className="btn-primary" onClick={() => void handleRename(catId)}>
                    Save
                  </button>
                  <button type="button" onClick={() => setRenamingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="serif-title" style={{ fontSize: '1.4rem' }}>
                    {heading}
                  </h2>
                  {cat && (
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(cat.id);
                        setRenameText(cat.name);
                      }}
                    >
                      Rename
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="grid-cards">
              {items.map((m) => (
                <article
                  key={m.id}
                  className="card"
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <MemoryThumb memory={m} />

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {m.sample && <span className="pill">SAMPLE</span>}
                    {m.ingest === 'unsupported' && <span className="pill">SOURCE DELETED</span>}
                    {m.ingest === 'link_metadata' && <span className="pill">LINK ONLY</span>}
                  </div>

                  <h3 className="serif-title" style={{ fontSize: '1.15rem' }}>
                    {m.title}
                  </h3>

                  {m.note && (
                    <blockquote
                      style={{
                        margin: 0,
                        padding: '8px 12px',
                        borderLeft: '3px solid var(--user-border)',
                        background: 'var(--user-bg)',
                        borderRadius: '0 8px 8px 0',
                      }}
                    >
                      {m.note}
                    </blockquote>
                  )}

                  {m.categoryByAI && m.categoryWhy && (
                    <div className="ai-panel" style={{ padding: 10, fontSize: '0.88rem' }}>
                      <span className="pill pill-ai">{t.aiSuggestionPill}</span>
                      <p style={{ margin: '6px 0' }}>{m.categoryWhy}</p>
                      {m.ledger.some((l) => l.undoable && l.undoAction?.field === 'categoryId') && (
                        <button type="button" onClick={() => void handleUndoAiCategory(m)}>
                          <Undo2 size={15} aria-hidden="true" />
                          <span>{t.undoLabel}</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 'auto' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: '100%' }}
                      onClick={() => onOpenMemory(m.id)}
                    >
                      {t.actionOpen}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
