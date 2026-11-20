import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Instagram, X } from 'lucide-react';
import { AppShell, type ShellTab } from './components/AppShell';
import { CaptureModal } from './components/CaptureModal';
import { InstagramConnectModal } from './components/InstagramConnectModal';
import { FeedPage } from './pages/FeedPage';
import { FEED_STRINGS } from './pages/feedStrings';
import { LandingPage } from './landing/LandingPage';
import { SearchModal } from './components/SearchModal';
import { api, type InstagramLinkStatus } from './lib/api';
import { isInstagramInAppBrowser } from './lib/firebase';
import { STRINGS } from './lib/i18n';
import { JourneyPage } from './pages/JourneyPage';
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

type Tab = 'feed' | 'today' | 'journey' | 'library' | 'projects' | 'settings';

const ENTERED_KEY = 'neophi_entered';

/** A landing-only build (VITE_LANDING_PREVIEW=1) for sharing a preview without the API server. */
const LANDING_PREVIEW = import.meta.env.VITE_LANDING_PREVIEW === '1';

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
}

function shouldShowLanding(): boolean {
  if (LANDING_PREVIEW) return true;
  if (typeof window === 'undefined') return false;
  if (window.location.hash === '#welcome') return true;
  return readStore(ENTERED_KEY) !== '1';
}

function initialTheme(): 'light' | 'dark' {
  const stored = readStore('neophi_theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

export function App() {
  const [showLanding, setShowLanding] = useState(shouldShowLanding);
  // Landing-only preview: "Open Neophi" shows the feed with the sample library kept in the page.
  const [previewData, setPreviewData] = useState<{ memories: Memory[]; categories: Category[] } | null>(null);
  const [tab, setTab] = useState<Tab>('feed');
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [lang, setLang] = useState<LanguageCode>(
    () => (readStore('neophi_lang') as LanguageCode) || 'en'
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const [readyForHourEnabled, setReadyForHourEnabled] = useState(
    () => readStore('neophi_ready_hour') !== '0'
  );

  const [todayFeed, setTodayFeed] = useState<TodayResponse | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Saving from Instagram: link status, the connect sheet, and the "just arrived" notice.
  const [ig, setIg] = useState<InstagramLinkStatus | null>(null);
  const [igOpen, setIgOpen] = useState(false);
  const [arrival, setArrival] = useState<{ id: string; title: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const memoriesRef = useRef<Memory[]>([]);
  const knownIdsRef = useRef<Set<string> | null>(null);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureFocusUrl, setCaptureFocusUrl] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const t = STRINGS[lang];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeStore('neophi_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-lang', lang);
    writeStore('neophi_lang', lang);
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
    setLoaded(true);
  }, [tz, readyForHourEnabled]);

  useEffect(() => {
    if (showLanding) return;
    void refreshAll();
  }, [refreshAll, showLanding]);

  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);

  const refreshInstagram = useCallback(async () => {
    try {
      setIg(await api.instagramLink());
    } catch {
      setIg(null); // an older server without Instagram saving: the feature simply stays hidden
    }
  }, []);

  useEffect(() => {
    if (showLanding || LANDING_PREVIEW) return;
    void refreshInstagram();
  }, [showLanding, refreshInstagram]);

  const onInstagramStatus = useCallback((next: InstagramLinkStatus) => {
    setIg(next);
    if (next.linked) void refreshAll();
  }, [refreshAll]);

  // Once Instagram is connected, new saves arrive by themselves: look for them while the page is open and
  // visible, say so when one lands, and keep a save that is still being read up to date.
  useEffect(() => {
    if (showLanding || !loaded || !ig?.linked) return;
    let busy = false;
    const look = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const mems = await api.listMemories();
        if (knownIdsRef.current === null) knownIdsRef.current = new Set(memoriesRef.current.map((m) => m.id));
        const known = knownIdsRef.current;
        const fresh = mems.filter((m) => !known.has(m.id));
        const sig = (list: Memory[]) => list.map((m) => `${m.id}:${m.updatedAt}`).join('|');
        if (fresh.length > 0 || sig(mems) !== sig(memoriesRef.current)) {
          for (const m of mems) known.add(m.id);
          const newestDm = fresh.filter((m) => m.dm).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          if (newestDm) setArrival({ id: newestDm.id, title: newestDm.note ?? newestDm.title });
          await refreshAll();
          // The new save is the moment the person is waiting for: bring it into view in the feed.
          if (newestDm) window.requestAnimationFrame(() => document.querySelector('.ph-scroll')?.scrollTo({ top: 0, behavior: 'smooth' }));
        }
      } catch {
        /* a missed look is fine; the next one tries again */
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void look(), 7000);
    const onVisible = () => void look();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [showLanding, loaded, ig?.linked, refreshAll]);

  useEffect(() => {
    if (!arrival) return;
    const id = window.setTimeout(() => setArrival(null), 12000);
    return () => window.clearTimeout(id);
  }, [arrival]);

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
    if (LANDING_PREVIEW) {
      const { buildSampleLibrary } = await import('../server/samples');
      const lib = buildSampleLibrary();
      setPreviewData({ memories: lib.memories, categories: lib.categories });
      window.scrollTo(0, 0);
      return;
    }
    writeStore(ENTERED_KEY, '1');
    if (withSamples) {
      await api.loadSamples();
    }
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setSelectedMemoryId(null);
    setTab('feed');
    setShowLanding(false);
    window.scrollTo(0, 0);
  };

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  if (LANDING_PREVIEW && previewData) {
    return (
      <AppShell
        active="feed"
        lang={lang}
        t={t}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigate={() => {}}
        onSave={() => {}}
        onSearch={() => {}}
        snap
        previewNote={FEED_STRINGS[lang].previewNote}
        onLogo={() => setPreviewData(null)}
      >
        <FeedPage
          memories={previewData.memories}
          categories={previewData.categories}
          lang={lang}
          t={t}
          onOpenMemory={() => {}}
          onOpenCapture={() => {}}
          onLoadSamples={async () => {}}
          onPatch={async (id, patch) =>
            setPreviewData((d) =>
              d ? { ...d, memories: d.memories.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : d
            )
          }
          previewNote={FEED_STRINGS[lang].previewNote}
        />
      </AppShell>
    );
  }


  if (showLanding) {
    return (
      <LandingPage
        lang={lang}
        onChangeLang={setLang}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        onEnter={enterApp}
        preview={LANDING_PREVIEW}
      />
    );
  }

  const hasSamples = memories.some((m) => m.sample);
  const isIgBrowser = isInstagramInAppBrowser();

  const openMemory = (id: string) => {
    setSelectedMemoryId(id);
  };

  const modals = (
    <>
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

      <InstagramConnectModal
        open={igOpen}
        lang={lang}
        status={ig}
        onStatus={onInstagramStatus}
        onClose={() => setIgOpen(false)}
      />

      {arrival && (
        <div className="arrival-toast" role="status">
          <Instagram size={18} aria-hidden="true" />
          <span className="arrival-text">{FEED_STRINGS[lang].ig.arrived(arrival.title.slice(0, 80))}</span>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              openMemory(arrival.id);
              setArrival(null);
            }}
          >
            {FEED_STRINGS[lang].ig.view}
          </button>
          <button type="button" aria-label={FEED_STRINGS[lang].ig.dismiss} onClick={() => setArrival(null)}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );

  const patchMemory = async (id: string, patch: Partial<Memory>) => {
    await api.patchMemory(id, patch);
    await refreshAll();
  };
  const loadSamples = async () => {
    await api.loadSamples();
    await refreshAll();
  };
  const openCapture = (focusUrl = false) => {
    setCaptureFocusUrl(focusUrl);
    setCaptureOpen(true);
  };
  const navigate = (next: ShellTab) => {
    setSelectedMemoryId(null);
    setTab(next);
  };
  const F = FEED_STRINGS[lang];

  let page: ReactNode;
  if (selectedMemoryId) {
    page = (
      <div className="ph-page">
        <MemoryPage
          memoryId={selectedMemoryId}
          categories={categories}
          projects={projects}
          onBack={() => setSelectedMemoryId(null)}
          onRefresh={() => void refreshAll()}
          lang={lang}
          t={t}
        />
      </div>
    );
  } else if (tab === 'feed') {
    page = (
      <FeedPage
        memories={memories}
        categories={categories}
        lang={lang}
        t={t}
        onOpenMemory={openMemory}
        onOpenCapture={() => openCapture(false)}
        onLoadSamples={loadSamples}
        onPatch={patchMemory}
        instagram={ig}
        onConnectInstagram={() => setIgOpen(true)}
      />
    );
  } else if (tab === 'today') {
    page = (
      <TodayPage
        feed={todayFeed}
        categories={categories}
        memories={memories}
        lang={lang}
        readyForHourEnabled={readyForHourEnabled}
        onToggleReadyForHour={() => {
          const next = !readyForHourEnabled;
          setReadyForHourEnabled(next);
          writeStore('neophi_ready_hour', next ? '1' : '0');
        }}
        onOpenMemory={openMemory}
        onOpenCapture={openCapture}
        onLoadSamples={loadSamples}
        onPatch={patchMemory}
        t={t}
      />
    );
  } else if (tab === 'journey') {
    page = (
      <div className="ph-page">
        <JourneyPage
          memories={memories}
          categories={categories}
          lang={lang}
          onOpenMemory={openMemory}
          onOpenCapture={() => openCapture(false)}
          onOpenLibrary={() => navigate('library')}
          libraryLabel={t.navLibrary}
          saveLabel={t.day0SaveNow}
          loading={!loaded}
        />
      </div>
    );
  } else if (tab === 'library') {
    page = (
      <LibraryPage
        memories={memories}
        categories={categories}
        lang={lang}
        onOpenMemory={openMemory}
        onPatch={patchMemory}
        onRefresh={() => void refreshAll()}
        t={t}
      />
    );
  } else if (tab === 'projects') {
    page = (
      <div className="ph-page">
        <ProjectsPage
          projects={projects}
          memories={memories}
          onOpenMemory={openMemory}
          onRefresh={() => void refreshAll()}
          t={t}
        />
      </div>
    );
  } else {
    page = (
      <div className="ph-page">
        <SettingsPage
          lang={lang}
          onChangeLang={setLang}
          theme={theme}
          onToggleTheme={toggleTheme}
          onRefresh={() => void refreshAll()}
          instagram={ig}
          onConnectInstagram={() => setIgOpen(true)}
          t={t}
        />
      </div>
    );
  }

  return (
    <>
      <AppShell
        active={selectedMemoryId ? null : tab}
        lang={lang}
        t={t}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigate={navigate}
        onSave={() => openCapture(false)}
        onSearch={() => setSearchOpen(true)}
        notice={isIgBrowser ? t.instagramBanner : hasSamples ? F.sampleChip : null}
        snap={tab === 'feed' && !selectedMemoryId}
      >
        {page}
      </AppShell>
      {modals}
    </>
  );
}

export default App;
