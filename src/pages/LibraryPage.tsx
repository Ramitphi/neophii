import { useState } from 'react';
import { FeedCard } from '../components/FeedCard';
import { api } from '../lib/api';
import type { StringsTable } from '../lib/i18n';
import type { Category, Memory } from '../types/neophi';

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
  const [activeCategory, setActiveCategory] = useState<string>('all');

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

  if (memories.length === 0) {
    return (
      <div className="card" style={{ marginTop: 24, padding: 24 }}>
        <p className="muted">Your library is empty. Save something or load the sample library from Today.</p>
      </div>
    );
  }

  return (
    <div className="feed-column" style={{ marginTop: 16 }}>
      {/* Horizontal category filter pills */}
      <div className="chip-scroller" role="toolbar" aria-label="Filter by category">
        <button
          type="button"
          className={`filter-chip ${activeCategory === 'all' ? 'active' : ''}`}
          aria-pressed={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
        >
          All
          <span className="filter-chip-count">{memories.length}</span>
        </button>
        {categories.map((c) => {
          const count = grouped.get(c.id)?.length ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={c.id}
              type="button"
              className={`filter-chip ${activeCategory === c.id ? 'active' : ''}`}
              aria-pressed={activeCategory === c.id}
              onClick={() => setActiveCategory(c.id)}
            >
              {c.name}
              <span className="filter-chip-count">{count}</span>
            </button>
          );
        })}
      </div>

      {Array.from(grouped.entries()).map(([catId, items]) => {
        if (items.length === 0) return null;
        if (activeCategory !== 'all' && activeCategory !== catId) return null;
        const cat = categories.find((c) => c.id === catId);
        const heading = cat ? cat.name : 'Uncategorized';

        return (
          <section key={catId} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
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
                  <h2 className="serif-title" style={{ fontSize: '1.35rem' }}>
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

            {items.map((m) => (
              <FeedCard
                key={m.id}
                memory={m}
                onOpen={onOpenMemory}
                onRefresh={onRefresh}
                t={t}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
