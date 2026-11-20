import { useCallback, useEffect, useState } from 'react';
import { Moon, Plus, Search, Sun } from 'lucide-react';
import { CaptureModal } from './components/CaptureModal';
import { LandingPage } from './landing/LandingPage';
import { SearchModal } from './components/SearchModal';
import { api } from './lib/api';
import { isInstagramInAppBrowser } from './lib/firebase';
import { STRINGS } from './lib/i18n';
import { LibraryPage } from './pages/LibraryPage';
import { MemoryPage } from './pages/MemoryPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';
import type {
  Category,
  LanguageCode,
  Memory,
  Project,
  TodayResponse,
} from './types/neophi';

type Tab = 'today' | 'library' | 'projects' | 'settings';

const ENTERED_KEY = 'neophi_entered';

function shouldShowLanding(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.hash === '#welcome') return true;
  try {
    return localStorage.getItem(ENTERED_KEY) !== '1';
  } catch {
    return true;
  }
}

export function App() {
  const [showLanding, setShowLanding] = useState(shouldShowLanding);
  const [tab, setTab] = useState<Tab>('today');
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [lang, setLang] = useState<LanguageCode>(
    () => (localStorage.getItem('neophi_lang') as LanguageCode) || 'en'
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('neophi_theme') as 'light' | 'dark') || 'light'
  );
  const [readyForHourEnabled, setReadyForHourEnabled] = useState(
    () => localStorage.getItem('neophi_ready_hour') !== '0'
  );

  const [todayFeed, setTodayFeed] = useState<TodayResponse | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureFocusUrl, setCaptureFocusUrl] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const t = STRINGS[lang];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('neophi_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-lang', lang);
    localStorage.setItem('neophi_lang', lang);
  }, [lang]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const refreshAll = useCallback(async () => {
    const [feed, mems, cats, projs] = await Promise.all([
      api.getToday(tz, readyForHourEnabled),
      api.listMemories(),
      api.listCategories(),
      api.listProjects(),
    ]);
    setTodayFeed(feed);
    setMemories(mems);
    setCategories(cats);
    setProjects(projs);
  }, [tz, readyForHourEnabled]);

  useEffect(() => {
    if (showLanding) return;
    void refreshAll();
  }, [refreshAll, showLanding]);

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#welcome') {
        setShowLanding(true);
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const enterApp = async (withSamples: boolean) => {
    try {
      localStorage.setItem(ENTERED_KEY, '1');
    } catch {
      /* private mode: the landing page shows again next visit */
    }
    if (withSamples) {
      await api.loadSamples();
    }
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setSelectedMemoryId(null);
    setTab('today');
    setShowLanding(false);
    window.scrollTo(0, 0);
  };

  if (showLanding) {
    return (
      <LandingPage
        lang={lang}
        onChangeLang={setLang}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        onEnter={enterApp}
      />
    );
  }

  const hasSamples = memories.some((m) => m.sample);
  const isIgBrowser = isInstagramInAppBrowser();

  const openMemory = (id: string) => {
    setSelectedMemoryId(id);
  };

  return (
    <div>
      <header className="nav-bar">
        <div className="nav-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="serif-title"
              style={{
                fontSize: '1.4rem',
                border: 'none',
                background: 'transparent',
                padding: '4px 8px',
              }}
              onClick={() => {
                setSelectedMemoryId(null);
                setTab('today');
              }}
            >
              {t.appName}
            </button>

            <nav className="nav-links" aria-label="Main navigation">
              {(
                [
                  { id: 'today', label: t.navToday },
                  { id: 'library', label: t.navLibrary },
                  { id: 'projects', label: t.navProjects },
                  { id: 'settings', label: t.navSettings },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-link ${!selectedMemoryId && tab === item.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedMemoryId(null);
                    setTab(item.id);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setSearchOpen(true)} aria-label={t.searchPlaceholder}>
              <Search size={18} aria-hidden="true" />
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {t.searchShortcut}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              aria-label={t.settingsTheme}
            >
              {theme === 'light' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setCaptureFocusUrl(false);
                setCaptureOpen(true);
              }}
            >
              <Plus size={18} aria-hidden="true" />
              <span>{t.saveButton}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        {isIgBrowser && (
          <div className="card" style={{ marginTop: 16, borderColor: 'var(--accent)' }} role="status">
            {t.instagramBanner}
          </div>
        )}

        {hasSamples && (
          <div className="card" style={{ marginTop: 16, background: 'var(--surface-muted)' }} role="status">
            {t.sampleBanner}
          </div>
        )}

        {selectedMemoryId ? (
          <MemoryPage
            memoryId={selectedMemoryId}
            categories={categories}
            projects={projects}
            onBack={() => setSelectedMemoryId(null)}
            onRefresh={() => void refreshAll()}
            t={t}
          />
        ) : tab === 'today' ? (
          <TodayPage
            feed={todayFeed}
            readyForHourEnabled={readyForHourEnabled}
            onToggleReadyForHour={() => {
              const next = !readyForHourEnabled;
              setReadyForHourEnabled(next);
              localStorage.setItem('neophi_ready_hour', next ? '1' : '0');
            }}
            onOpenMemory={openMemory}
            onOpenCapture={(focusUrl) => {
              setCaptureFocusUrl(Boolean(focusUrl));
              setCaptureOpen(true);
            }}
            onLoadSamples={async () => {
              await api.loadSamples();
              await refreshAll();
            }}
            onRefresh={() => void refreshAll()}
            t={t}
          />
        ) : tab === 'library' ? (
          <LibraryPage
            memories={memories}
            categories={categories}
            onOpenMemory={openMemory}
            onRefresh={() => void refreshAll()}
            t={t}
          />
        ) : tab === 'projects' ? (
          <ProjectsPage
            projects={projects}
            memories={memories}
            onOpenMemory={openMemory}
            onRefresh={() => void refreshAll()}
            t={t}
          />
        ) : (
          <SettingsPage
            lang={lang}
            onChangeLang={setLang}
            theme={theme}
            onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            onRefresh={() => void refreshAll()}
            t={t}
          />
        )}
      </main>

      <CaptureModal
        open={captureOpen}
        initialFocusUrl={captureFocusUrl}
        onClose={() => setCaptureOpen(false)}
        onSaved={(mem) => {
          void refreshAll();
          setSelectedMemoryId(mem.id);
        }}
        t={t}
      />

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenMemory={openMemory}
        t={t}
      />
    </div>
  );
}

export default App;
