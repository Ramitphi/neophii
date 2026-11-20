// The category chip row shared by Feed, Today and Library: "All" plus each category in its own colour,
// pinned to the top of the page while it scrolls. Counts are shown only when given.
import { POPS, popVars } from '../landing/pop';
import { LANDING } from '../landing/strings';
import type { Category, LanguageCode } from '../types/neophi';
import { useCategoryPops } from './MemoryCard';

export function CategoryChips({
  lang,
  categories,
  active,
  onChange,
  counts,
  allCount,
  palette,
}: {
  lang: LanguageCode;
  categories: Category[];
  active: string;
  onChange: (id: string) => void;
  counts?: Map<string, number>;
  allCount?: number;
  /** All categories, so colours stay the same on every tab even when some are hidden here. */
  palette?: Category[];
}) {
  const L = LANDING[lang].feed;
  const { popOfCategory } = useCategoryPops(palette ?? categories);
  if (categories.length === 0) return null;
  return (
    <div className="ph-chips ph-chrome">
      <div className="ph-tabs" role="group" aria-label={L.tabsLabel}>
        {[{ id: 'all', name: L.all }, ...categories].map((c) => {
          const count = c.id === 'all' ? allCount : counts?.get(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={active === c.id}
              className={active === c.id ? 'is-on' : ''}
              style={popVars(c.id === 'all' ? POPS.violet : popOfCategory(c.id))}
              onClick={() => onChange(c.id)}
            >
              {c.name}
              {typeof count === 'number' && <span className="ph-chip-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
