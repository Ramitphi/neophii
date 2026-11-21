// The Library tab: every save, grouped by the user's categories, with counts on the chips and Rename beside
// each category. Same card, chips and spacing as the Feed.
import { useState } from 'react';
import { CategoryChips } from '../components/CategoryChips';
import { MemoryCard, useCategoryPops, useMemoryActions } from '../components/MemoryCard';
import { api } from '../lib/api';
import type { StringsTable } from '../lib/i18n';
import type { Category, LanguageCode, Memory } from '../types/neophi';
import { FEED_STRINGS } from './feedStrings';

export function LibraryPage({
  memories,
  categories,
  lang,
  onOpenMemory,
  onPatch,
  onRefresh,
  t,
}: {
  memories: Memory[];
  categories: Category[];
  lang: LanguageCode;
  onOpenMemory: (id: string) => void;
  onPatch: (id: string, patch: Partial<Memory>) => Promise<void>;
  onRefresh: () => void;
  t: StringsTable;
}) {
  const F = FEED_STRINGS[lang];
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const { categoryOf, popOf } = useCategoryPops(categories);
  const { act, copy } = useMemoryActions(lang, onPatch);

  if (memories.length === 0) {
    return <p className="ph-empty">{F.libraryEmpty}</p>;
  }

  const sorted = [...memories].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = new Map<string, Memory[]>(categories.map((c) => [c.id, []]));
  groups.set('uncategorized', []);
  for (const m of sorted) {
    const key = m.categoryId && groups.has(m.categoryId) ? m.categoryId : 'uncategorized';
    groups.get(key)!.push(m);
  }
  const counts = new Map(Array.from(groups.entries()).map(([id, items]) => [id, items.length]));
  const chipCategories = categories.filter((c) => (counts.get(c.id) ?? 0) > 0);

  const handleRename = async (catId: string) => {
    if (!renameText.trim()) return;
    await api.renameCategory(catId, renameText.trim());
    setRenamingId(null);
    onRefresh();
  };

  return (
    <>
      <CategoryChips
        lang={lang}
        categories={chipCategories}
        palette={categories}
        active={activeCategory}
        onChange={setActiveCategory}
        counts={counts}
        allCount={memories.length}
      />

      {Array.from(groups.entries()).map(([catId, items]) => {
        if (items.length === 0) return null;
        if (activeCategory !== 'all' && activeCategory !== catId) return null;
        const cat = categories.find((c) => c.id === catId);
        return (
          <section key={catId} className="ph-section">
            <div className="ph-section-head">
              {renamingId === catId ? (
                <form
                  className="ph-rename ph-chrome"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleRename(catId);
                  }}
                >
                  <input
                    id={`rename-${catId}`}
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    aria-label={F.rename}
                    autoFocus
                  />
                  <button type="submit" className="ph-section-toggle is-primary">
                    {F.save}
                  </button>
                  <button type="button" className="ph-section-toggle" onClick={() => setRenamingId(null)}>
                    {F.cancel}
                  </button>
                </form>
              ) : (
                <>
                  <h2>
                    {cat ? cat.name : F.uncategorized} <span className="ph-chip-count">{items.length}</span>
                  </h2>
                  {cat && (
                    <button
                      type="button"
                      className="ph-section-toggle"
                      onClick={() => {
                        setRenamingId(cat.id);
                        setRenameText(cat.name);
                      }}
                    >
                      {F.rename}
                    </button>
                  )}
                </>
              )}
            </div>
            {items.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                category={categoryOf(m)}
                pop={popOf(m)}
                lang={lang}
                t={t}
                onOpen={onOpenMemory}
                onAct={(mem, a) => void act(mem, a)}
                onCopy={(u) => void copy(u)}
              />
            ))}
          </section>
        );
      })}
    </>
  );
}
