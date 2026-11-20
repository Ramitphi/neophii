// One app frame for every tab after "Open Neophi": the same top bar (logo, search, theme, settings), the same
// labelled bottom nav (Feed, Today, + Save, Journey, Projects), one phone-width column on every screen size,
// and one toast. Pages render only their content inside it.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { FolderKanban, GitBranch, Home, Moon, Plus, Search, Settings, Sun } from 'lucide-react';
import type { StringsTable } from '../lib/i18n';
import { FEED_STRINGS } from '../pages/feedStrings';
import type { LanguageCode } from '../types/neophi';

export type ShellTab = 'feed' | 'today' | 'journey' | 'library' | 'projects' | 'settings';

export interface ShellToast {
  text: string;
  undo?: () => Promise<void>;
  /** Shown as selectable text when copying to the clipboard is blocked. */
  link?: string;
}

const ToastContext = createContext<(toast: ShellToast) => void>(() => {});

/** Show a short message at the bottom of the app, with an optional Undo. */
export function useShellToast() {
  return useContext(ToastContext);
}

export function AppShell({
  active,
  lang,
  t,
  theme,
  onToggleTheme,
  onNavigate,
  onSave,
  onSearch,
  notice,
  snap = false,
  previewNote,
  onLogo,
  children,
}: {
  /** The current tab, or null on a page that is not a tab (a single save). */
  active: ShellTab | null;
  lang: LanguageCode;
  t: StringsTable;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigate: (tab: ShellTab) => void;
  onSave: () => void;
  onSearch: () => void;
  /** One short line above the content, such as the sample-library note. */
  notice?: string | null;
  /** Snap scrolling, one card per screen (the Feed). */
  snap?: boolean;
  /** Landing-only preview: anything that needs the server shows this instead. */
  previewNote?: string;
  onLogo?: () => void;
  children: ReactNode;
}) {
  const F = FEED_STRINGS[lang];
  const [toast, setToast] = useState<ShellToast | null>(null);
  const showToast = useCallback((next: ShellToast) => setToast(next), []);

  useEffect(() => {
    if (!toast || toast.link) return;
    const id = window.setTimeout(() => setToast(null), toast.undo ? 5000 : 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  const go = (tab: ShellTab) => {
    if (previewNote && tab !== 'feed') {
      setToast({ text: previewNote });
      return;
    }
    onNavigate(tab);
  };
  const guarded = (fn: () => void) => () => (previewNote ? setToast({ text: previewNote }) : fn());

  const nav: { id: ShellTab | 'save'; label: string; Icon: typeof Home }[] = [
    { id: 'feed', label: F.feed, Icon: Home },
    { id: 'today', label: t.navToday, Icon: Sun },
    { id: 'save', label: t.saveButton, Icon: Plus },
    { id: 'journey', label: F.journey.nav, Icon: GitBranch },
    { id: 'projects', label: t.navProjects, Icon: FolderKanban },
  ];

  return (
    <ToastContext.Provider value={showToast}>
      <div className="ph-app">
        <div className="ph-frame is-app" role="region" aria-label="Neophi">
          <div className="ph-screen">
            <header className="ph-top ph-chrome">
              <div className="ph-top-row">
                <button type="button" className="ph-logo" onClick={onLogo ?? (() => go('feed'))}>
                  Neophi<i aria-hidden="true" />
                </button>
                <button type="button" className="ph-icon" aria-label={t.searchPlaceholder} onClick={guarded(onSearch)}>
                  <Search size={21} aria-hidden="true" />
                </button>
                <button type="button" className="ph-icon" aria-label={F.theme} onClick={onToggleTheme}>
                  {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className="ph-icon"
                  aria-label={t.navSettings}
                  aria-pressed={active === 'settings'}
                  onClick={() => go('settings')}
                >
                  <Settings size={20} aria-hidden="true" />
                </button>
              </div>
            </header>

            {/* Keyed by tab so each tab opens at its top. */}
            <div className={`ph-scroll ${snap ? 'is-snap' : ''}`} key={active ?? 'page'}>
              {notice && <p className="ph-notice">{notice}</p>}
              {children}
            </div>

            {toast && (
              <div className="ph-toast ph-chrome" role="status">
                <span>{toast.text}</span>
                {toast.undo && (
                  <button
                    type="button"
                    className="ph-toast-undo"
                    onClick={async () => {
                      const undo = toast.undo!;
                      setToast(null);
                      await undo();
                    }}
                  >
                    {t.undoLabel}
                  </button>
                )}
                {toast.link && (
                  <input readOnly value={toast.link} onFocus={(e) => e.currentTarget.select()} aria-label={toast.text} />
                )}
              </div>
            )}

            <nav className="ph-nav ph-chrome" aria-label="Main">
              {nav.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  aria-current={n.id === active ? 'page' : undefined}
                  className={`${n.id === 'save' ? 'ph-nav-save' : ''} ${n.id === active ? 'is-on' : ''}`}
                  onClick={() => (n.id === 'save' ? guarded(onSave)() : go(n.id))}
                >
                  <n.Icon size={n.id === 'save' ? 22 : 21} aria-hidden="true" />
                  <span>{n.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </ToastContext.Provider>
  );
}
