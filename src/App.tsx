import { useCallback, useEffect, useState } from 'react';
import { Compass, FolderKanban, Home, Moon, Plus, Search, Settings, Sun } from 'lucide-react';
import { CaptureModal } from './components/CaptureModal';
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

export function App() {
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
    void refreshAll();
  }, [refreshAll]);

  const hasSamples = memories.some((m) => m.sample);
  const isIgBrowser = isInstagramInAppBrowser();

  const openMemory = (id: string) => {
    setSelectedMemoryId(id);
  };

  return (
    <div>
      <header className="nav-bar">
        <div className="nav-inner">
          <div className="nav-left">
            <button
              type="button"
              className="serif-title nav-logo"
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
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-tab ${!selectedMemoryId && tab === item.id ? 'active' : ''}`}
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

          <div className="nav-right">
            <button
              type="button"
              className="nav-icon-btn"
              onClick={() => setSearchOpen(true)}
              aria-label={t.searchPlaceholder}
              title={t.searchShortcut}
            >
              <Search size={20} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="nav-icon-btn"
              onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              aria-label={t.settingsTheme}
            >
              {theme === 'light' ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
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
            categories={categories}
            memories={memories}
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

      <nav className="bottom-nav" aria-label="Mobile navigation">
        <button
          type="button"
          className={`bottom-nav-btn ${!selectedMemoryId && tab === 'today' ? 'active' : ''}`}
          aria-label={t.navToday}
          onClick={() => {
            setSelectedMemoryId(null);
            setTab('today');
          }}
        >
          <Home size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`bottom-nav-btn ${!selectedMemoryId && tab === 'library' ? 'active' : ''}`}
          aria-label={t.navLibrary}
          onClick={() => {
            setSelectedMemoryId(null);
            setTab('library');
          }}
        >
          <Compass size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="bottom-nav-btn bottom-nav-add"
          aria-label={t.saveButton}
          onClick={() => {
            setCaptureFocusUrl(false);
            setCaptureOpen(true);
          }}
        >
          <Plus size={24} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`bottom-nav-btn ${!selectedMemoryId && tab === 'projects' ? 'active' : ''}`}
          aria-label={t.navProjects}
          onClick={() => {
            setSelectedMemoryId(null);
            setTab('projects');
          }}
        >
          <FolderKanban size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`bottom-nav-btn ${!selectedMemoryId && tab === 'settings' ? 'active' : ''}`}
          aria-label={t.navSettings}
          onClick={() => {
            setSelectedMemoryId(null);
            setTab('settings');
          }}
        >
          <Settings size={22} aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}

export default App;
