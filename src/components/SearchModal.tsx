import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '../lib/api';
import type { StringsTable } from '../lib/i18n';
import type { SearchResponse } from '../types/neophi';

const EXAMPLE_QUERIES = [
  'red shirt dance last month',
  'laal shirt wala dance, pichle mahine',
  'kasuri methi',
  'subah wala rasta goa',
  'बालकनी shelf',
  'caption for cafe launch',
];

export function SearchModal({
  open,
  onClose,
  onOpenMemory,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onOpenMemory: (id: string) => void;
  t: StringsTable;
}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  if (!open) return null;

  const runSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.search(trimmed);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t.searchPlaceholder}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Search size={20} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch(query);
              if (e.key === 'Escape') onClose();
            }}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
            style={{
              flex: 1,
              minHeight: 48,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          />
          <button type="button" onClick={() => void runSearch(query)} className="btn-primary">
            <Search size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={onClose} aria-label="Close search">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {!data && !loading && (
          <div>
            <p className="muted" style={{ fontSize: '0.9rem', marginBottom: 8 }}>
              Try searching with half-remembered words:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {EXAMPLE_QUERIES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setQuery(ex);
                    void runSearch(ex);
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && <p className="muted">Searching…</p>}

        {data && !loading && (
          <div>
            <p className="muted" style={{ fontSize: '0.9rem', marginBottom: 12 }}>
              <strong>{t.understoodAs}</strong>{' '}
              {data.understoodAs.keywords.join(', ') || data.understoodAs.english}
              {data.understoodAs.timeHint
                ? ` · ${data.understoodAs.timeHint.replace('_', ' ')}`
                : ''}
            </p>

            {data.results.length === 0 ? (
              <p className="muted">No matching memories found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.results.map((hit) => (
                  <button
                    key={hit.memory.id}
                    type="button"
                    onClick={() => {
                      onOpenMemory(hit.memory.id);
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      textAlign: 'left',
                      width: '100%',
                      padding: 14,
                    }}
                  >
                    <span className="serif-title" style={{ fontSize: '1.1rem' }}>
                      {hit.memory.title}
                    </span>
                    <span className="pill" style={{ marginTop: 4 }}>
                      {hit.whyMatched}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
