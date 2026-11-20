// Neophi landing page. Layout follows the Neophi v4 public site: full-screen panels with looping
// paper-cut videos, a night hero, numbered steps, the lanes, a vermilion trust band, the reason ladder
// and a night closing panel. Interactive pieces: the settling pile, evidence pointing, search, fading.
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Menu, Moon, Search, Sun, X } from 'lucide-react';
import type { LanguageCode } from '../types/neophi';
import { EvidenceDemo } from './EvidenceDemo';
import { FadeDemo } from './FadeDemo';
import { FeedDemo } from './FeedDemo';
import { asset, Panel, prefersCalm, scrollPastPanel } from './Panel';
import { Pile } from './Pile';
import { SearchDemo } from './SearchDemo';
import { LANDING } from './strings';
import './landing.css';

const LANGS: { code: LanguageCode; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हिं' },
  { code: 'hinglish', label: 'Hinglish' },
];

function Wordmark() {
  return (
    <span className="lp-wordmark">
      Neophi<i aria-hidden="true" />
    </span>
  );
}

function HeroPanel({
  s,
  onStart,
}: {
  s: (typeof LANDING)['en'];
  onStart: () => void;
}) {
  const ref = useRef<HTMLElement>(null);

  // Rest on the first screen for a few seconds, then glide on once per visit, unless the visitor moves first.
  useEffect(() => {
    const section = ref.current;
    if (!section || prefersCalm()) return;
    try {
      if (sessionStorage.getItem('neophi_intro')) return;
    } catch {
      /* private mode: runs once per page load */
    }
    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
    for (const name of events) window.addEventListener(name, stop, { once: true, passive: true });
    const timer = window.setTimeout(() => {
      if (stopped || window.scrollY > 8) return;
      try {
        sessionStorage.setItem('neophi_intro', '1');
      } catch {
        /* nothing to remember */
      }
      window.scrollTo({ top: section.getBoundingClientRect().bottom + window.scrollY - 64, behavior: 'smooth' });
    }, 6500);
    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, stop);
    };
  }, []);

  return (
    <section ref={ref} className="lp-panel lp-night lp-hero" aria-label="Neophi">
      <video
        className="lp-video"
        muted
        loop
        playsInline
        autoPlay={!prefersCalm()}
        preload="auto"
        poster={asset('video/posters/night_hero.webp')}
        src={prefersCalm() ? undefined : asset('video/night_hero.mp4')}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="lp-shade" aria-hidden="true" />
      <div className="lp-panel-in lp-hero-words lp-wrap">
        <h1>
          <span className="lp-line lp-line-small">{s.hero.small}</span>
          <span className="lp-line lp-line-big">{s.hero.big}</span>
          <span className="lp-line lp-line-accent">{s.hero.accent}</span>
        </h1>
        <p className="lp-hero-sub">{s.hero.sub}</p>
        <p className="lp-cta">
          <button type="button" className="lp-btn lp-btn-primary" onClick={onStart}>
            {s.hero.ctaStart} <ArrowRight size={17} aria-hidden="true" />
          </button>
          <a className="lp-btn lp-btn-ghost" href="#lp-pile">
            {s.hero.ctaSee}
          </a>
        </p>
      </div>
      <a
        className="lp-cue"
        href="#lp-pile"
        onClick={(e) => {
          e.preventDefault();
          scrollPastPanel(e.currentTarget);
        }}
      >
        {s.scroll}
      </a>
    </section>
  );
}

export function LandingPage({
  lang,
  onChangeLang,
  theme,
  onToggleTheme,
  onEnter,
  preview = false,
}: {
  preview?: boolean;
  lang: LanguageCode;
  onChangeLang: (lang: LanguageCode) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onEnter: (withSamples: boolean) => Promise<void>;
}) {
  const s = LANDING[lang];
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Panels below the first screen rise in as they arrive. Without script or with reduced motion, nothing is hidden.
  useEffect(() => {
    const main = mainRef.current;
    if (!main || prefersCalm() || !('IntersectionObserver' in window)) return;
    const panels = Array.from(main.querySelectorAll<HTMLElement>(':scope > section')).slice(1);
    const watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            watcher.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' }
    );
    for (const p of panels) {
      if (p.getBoundingClientRect().top < window.innerHeight) continue;
      p.setAttribute('data-reveal', '');
      watcher.observe(p);
    }
    return () => watcher.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('lp-root');
    return () => document.documentElement.classList.remove('lp-root');
  }, []);

  const start = () => void onEnter(false);
  const samples = async () => {
    setLoadingSamples(true);
    try {
      await onEnter(true);
    } finally {
      setLoadingSamples(false);
    }
  };

  const nav = [
    { href: '#lp-feed', label: s.nav.feed },
    { href: '#lp-steps', label: s.nav.steps },
    { href: '#lp-evidence', label: s.nav.evidence },
    { href: '#lp-search', label: s.nav.search },
    { href: '#lp-today', label: s.nav.today },
    { href: '#lp-trust', label: s.nav.trust },
  ];

  return (
    <div className="lp">
      <a className="lp-skip" href="#lp-main">
        {s.skip}
      </a>

      <header className="lp-head">
        <div className="lp-wrap lp-head-in">
          <a href="#lp-main" className="lp-brand" aria-label="Neophi">
            <Wordmark />
            {preview && <span className="lp-stamp">{s.preview}</span>}
          </a>
          <nav className={`lp-nav ${menuOpen ? 'is-open' : ''}`} id="lp-nav" aria-label="Sections">
            {nav.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="lp-head-end">
            <div className="lp-lang" role="group" aria-label={s.langLabel}>
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  aria-pressed={lang === l.code}
                  className={lang === l.code ? 'is-on' : ''}
                  onClick={() => onChangeLang(l.code)}
                  lang={l.code === 'hi' ? 'hi' : 'en'}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="lp-icon-btn"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? s.themeToLight : s.themeToDark}
            >
              {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>
            <button type="button" className="lp-btn lp-btn-small" onClick={start}>
              {s.openApp}
            </button>
            <button
              type="button"
              className="lp-icon-btn lp-nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="lp-nav"
              aria-label={s.menu}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <main id="lp-main" ref={mainRef} className="lp-main">
        <HeroPanel s={s} onStart={start} />

        <Panel video="loop_scatter" id="lp-pile" className="lp-intro" label={s.pile.label}>
          <div className="lp-wrap lp-intro-in">
            <div className="lp-intro-copy">
              <p className="lp-label">{s.pile.label}</p>
              <h2 className="lp-h2">
                {s.pile.title} <em>{s.pile.titleEm}</em>
              </h2>
              <p className="lp-lede">{s.pile.lede}</p>
              <p>{s.pile.body}</p>
            </div>
            <Pile s={s} />
          </div>
        </Panel>

        <Panel video="loop_evening" id="lp-feed" className="lp-section" label={s.feed.title}>
          <div className="lp-wrap lp-feed-in">
            <div className="lp-section-head">
              <p className="lp-label">{s.feed.label}</p>
              <h2 className="lp-h2">{s.feed.title}</h2>
              <p>{s.feed.sub}</p>
            </div>
            <FeedDemo s={s} />
          </div>
        </Panel>

        <Panel video="loop_today" id="lp-steps" className="lp-steps" label={s.steps.title}>
          <div className="lp-wrap">
            <h2 className="lp-sr-only">{s.steps.title}</h2>
            <ol className="lp-steps-row">
              {s.steps.items.map((step, i) => (
                <li key={step.title}>
                  <span className="lp-steps-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <div className="lp-steps-art" aria-hidden="true">
                    {i === 0 && (
                      <>
                        <span className="lp-chipbtn">Buy</span>
                        <span className="lp-chipbtn is-on">Try</span>
                        <span className="lp-chipbtn">Go there</span>
                        <span className="lp-steps-note">Sunday ko banana hai</span>
                      </>
                    )}
                    {i === 1 && (
                      <>
                        <span className="lp-steps-tab">Sunday cooking</span>
                        <span className="lp-steps-tab">Goa in January</span>
                        <span className="lp-steps-why">{s.steps.artWhy}</span>
                      </>
                    )}
                    {i === 2 && (
                      <>
                        <span className="lp-steps-query">
                          <Search size={15} /> laal shirt wala dance, pichle mahine
                        </span>
                        <span className="lp-steps-why">{s.steps.artMatched}</span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Panel>

        <Panel video="loop_lanes" id="lp-evidence" className="lp-section" label={s.evidence.title}>
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="lp-label">{s.evidence.label}</p>
              <h2 className="lp-h2">{s.evidence.title}</h2>
              <p>{s.evidence.sub}</p>
            </div>
            <EvidenceDemo s={s} />
          </div>
        </Panel>

        <Panel video="loop_student" id="lp-search" className="lp-section" label={s.search.title}>
          <div className="lp-wrap lp-split">
            <div className="lp-section-head">
              <p className="lp-label">{s.search.label}</p>
              <h2 className="lp-h2">{s.search.title}</h2>
              <p>{s.search.sub}</p>
            </div>
            <SearchDemo s={s} lang={lang} />
          </div>
        </Panel>

        <Panel video="loop_traveller" id="lp-today" className="lp-section" label={s.fade.title}>
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="lp-label">{s.fade.label}</p>
              <h2 className="lp-h2">{s.fade.title}</h2>
              <p>{s.fade.sub}</p>
            </div>
            <FadeDemo s={s} />
          </div>
        </Panel>

        <Panel video="loop_evening" id="lp-trust" className="lp-trust" label={s.trust.title}>
          <div className="lp-wrap lp-trust-in">
            <div>
              <h2 className="lp-h2">{s.trust.title}</h2>
              <p>{s.trust.sub}</p>
            </div>
            <ol className="lp-trust-rules">
              {s.trust.rules.map((r) => (
                <li key={r.title}>
                  <b>{r.title}</b> {r.body}
                </li>
              ))}
            </ol>
          </div>
        </Panel>

        <Panel video="loop_creator" className="lp-ladder" label={s.ladder.title}>
          <div className="lp-wrap lp-ladder-in">
            <div>
              <h2 className="lp-h2">{s.ladder.title}</h2>
              <p>{s.ladder.sub}</p>
            </div>
            <ol className="lp-ladder-list">
              {s.ladder.rungs.map((r, i) => (
                <li key={r.title}>
                  <span className="lp-tnum">{i + 1}</span>
                  <b>{r.title}</b>
                  <span>{r.body}</span>
                </li>
              ))}
            </ol>
          </div>
        </Panel>

        <Panel video="night_footer" tone="night" className="lp-closing" label={s.closing.title}>
          <div className="lp-wrap lp-closing-in">
            <h2 className="lp-h2">{s.closing.title}</h2>
            <p className="lp-lede">{s.closing.sub}</p>
            <p className="lp-cta">
              <button type="button" className="lp-btn lp-btn-primary" onClick={start}>
                {s.closing.ctaStart} <ArrowRight size={17} aria-hidden="true" />
              </button>
              <button type="button" className="lp-btn lp-btn-ghost" onClick={() => void samples()} disabled={loadingSamples}>
                {loadingSamples ? s.closing.loading : s.closing.ctaSamples}
              </button>
            </p>
            <p className="lp-hint">{s.closing.note}</p>
          </div>
        </Panel>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <Wordmark />
          <p>{s.footer.tagline}</p>
          <p className="lp-hint">{s.footer.note}</p>
        </div>
      </footer>
    </div>
  );
}
