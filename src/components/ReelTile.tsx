import { useEffect, useState } from 'react';
import { Film, Globe, Image as ImageIcon, Link2, Play, X, Youtube } from 'lucide-react';
import { fetchAuthorizedMediaUrl } from '../lib/api';
import type { Memory } from '../types/neophi';

const PALETTES: Array<[string, string]> = [
  ['#FF8A3D', '#F26A12'],
  ['#6C47FF', '#4F2BE8'],
  ['#FF4FA3', '#E8338A'],
  ['#2ED3E6', '#12B5CB'],
  ['#C6F432', '#9BCB0E'],
  ['#FFD23F', '#F0B400'],
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function instagramEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  const kind = m[1].toLowerCase() === 'p' ? 'p' : 'reel';
  return `https://www.instagram.com/${kind}/${m[2]}/embed/`;
}

function platformLabel(m: Memory): { label: string; Icon: typeof Film } {
  if (m.platform === 'instagram') return { label: 'Instagram Reel', Icon: Film };
  if (m.platform === 'youtube') return { label: 'YouTube', Icon: Youtube };
  if (m.platform === 'upload') return { label: 'Your upload', Icon: ImageIcon };
  if (m.platform === 'web') return { label: 'Web link', Icon: Globe };
  return { label: 'Saved link', Icon: Link2 };
}

/**
 * Visual tile for a memory. Shows a real thumbnail only for the user's own uploads.
 * Link-only saves get a designed gradient tile. Instagram links can optionally load
 * Instagram's official embed player, in the browser only, when the user taps "Preview Reel".
 */
export function ReelTile({
  memory,
  onOpen,
  compact = false,
}: {
  memory: Memory;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [showEmbed, setShowEmbed] = useState(false);
  const embedUrl = instagramEmbedUrl(memory.url);

  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    if (memory.media?.kind === 'image' && memory.media.gcsPath) {
      void fetchAuthorizedMediaUrl(memory.id, true).then((url) => {
        if (active && url) {
          objUrl = url;
          setThumb(url);
        }
      });
    }
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [memory]);

  if (showEmbed && embedUrl) {
    return (
      <div className="reel-embed-wrap">
        <div className="reel-embed-bar">
          <span className="reel-embed-note">Instagram preview · loaded from instagram.com</span>
          <button
            type="button"
            className="reel-embed-close"
            aria-label="Close preview"
            onClick={() => setShowEmbed(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <iframe
          src={embedUrl}
          title={`Instagram preview: ${memory.title}`}
          className="reel-embed"
          loading="lazy"
          allow="encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  const [c1, c2] = PALETTES[hashString(memory.categoryId || memory.id) % PALETTES.length];
  const { label, Icon } = platformLabel(memory);

  return (
    <div
      className={`reel-tile ${compact ? 'reel-tile-compact' : ''}`}
      style={{
        background: thumb
          ? `center / cover no-repeat url(${thumb})`
          : `linear-gradient(160deg, ${c1} 0%, ${c2} 100%)`,
      }}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={onOpen ? `Open ${memory.title}` : undefined}
    >
      {!thumb && <div className="reel-tile-pattern" aria-hidden="true" />}

      <span className="reel-badge">
        <Icon size={14} aria-hidden="true" />
        {label}
      </span>

      {!thumb && (
        <div className="reel-center" aria-hidden="true">
          <div className="reel-play">
            <Play size={28} fill="currentColor" />
          </div>
        </div>
      )}

      <div className="reel-overlay">
        <p className="reel-overlay-title">{memory.title}</p>
        {memory.ingest === 'link_metadata' && (
          <p className="reel-overlay-sub">Link saved · no video stored</p>
        )}
        {memory.ingest === 'unsupported' && (
          <p className="reel-overlay-sub">Source no longer available</p>
        )}
      </div>

      {embedUrl && memory.ingest !== 'unsupported' && (
        <button
          type="button"
          className="reel-preview-btn"
          onClick={(e) => {
            e.stopPropagation();
            setShowEmbed(true);
          }}
        >
          <Play size={14} fill="currentColor" aria-hidden="true" />
          Preview Reel
        </button>
      )}
    </div>
  );
}
