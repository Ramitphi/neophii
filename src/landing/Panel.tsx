// Full-screen sections with a looping paper-cut video behind them (pattern from the Neophi v4 public site).
// Videos load only near the screen and pause off screen. Reduced motion keeps the still poster.
import { useEffect, useRef, type ReactNode } from 'react';

export type VideoName =
  | 'night_hero'
  | 'night_footer'
  | 'loop_scatter'
  | 'loop_lanes'
  | 'loop_evening'
  | 'loop_creator'
  | 'loop_traveller'
  | 'loop_student'
  | 'loop_today';

export const prefersCalm = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function BackdropVideo({ name, eager = false }: { name: VideoName; eager?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || prefersCalm()) return;
    const load = () => {
      if (!video.getAttribute('src')) video.src = `/video/${name}.mp4`;
    };
    const play = () => void video.play().catch(() => undefined);
    if (eager) {
      load();
      play();
    }
    if (!('IntersectionObserver' in window)) {
      load();
      play();
      return;
    }
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          load();
          play();
        } else {
          video.pause();
        }
      },
      { rootMargin: '30% 0px' }
    );
    watcher.observe(video);
    return () => watcher.disconnect();
  }, [name, eager]);

  return (
    <video
      ref={ref}
      className="lp-video"
      muted
      loop
      playsInline
      preload="none"
      poster={`/video/posters/${name}.webp`}
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}

export function Panel({
  video,
  tone = 'paper',
  id,
  label,
  className = '',
  children,
}: {
  video: VideoName;
  tone?: 'paper' | 'night';
  id?: string;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`lp-panel lp-${tone} ${className}`.trim()} aria-label={label}>
      <BackdropVideo name={video} />
      <div className="lp-shade" aria-hidden="true" />
      <div className="lp-panel-in">{children}</div>
    </section>
  );
}

/** Scrolls to just below the panel that holds the clicked element. */
export function scrollPastPanel(el: HTMLElement) {
  const panel = el.closest('.lp-panel');
  if (!panel) return;
  window.scrollTo({
    top: panel.getBoundingClientRect().bottom + window.scrollY - 64,
    behavior: prefersCalm() ? 'auto' : 'smooth',
  });
}
