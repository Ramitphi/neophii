// Other places people save from, shown honestly as coming soon. Nothing here connects to anything yet.
import { AtSign, Linkedin, MessageCircle, Music2, Pin, Youtube, type LucideIcon } from 'lucide-react';
import { FEED_STRINGS } from '../pages/feedStrings';
import type { LanguageCode } from '../types/neophi';

/** The X logo is not in the icon set, so it is drawn here. */
function XGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  );
}

const SERVICES: { id: string; name: string; Icon: LucideIcon | typeof XGlyph }[] = [
  { id: 'threads', name: 'Threads', Icon: AtSign },
  { id: 'x', name: 'X', Icon: XGlyph },
  { id: 'youtube', name: 'YouTube', Icon: Youtube },
  { id: 'tiktok', name: 'TikTok', Icon: Music2 },
  { id: 'whatsapp', name: 'WhatsApp', Icon: MessageCircle },
  { id: 'pinterest', name: 'Pinterest', Icon: Pin },
  { id: 'linkedin', name: 'LinkedIn', Icon: Linkedin },
];

export function ComingSoon({ lang, compact = false }: { lang: LanguageCode; compact?: boolean }) {
  const T = FEED_STRINGS[lang].ig;
  return (
    <div className={`soon ${compact ? 'is-compact' : ''}`}>
      <p className="soon-title">{T.moreTitle}</p>
      {!compact && <p className="muted soon-body">{T.moreBody}</p>}
      <ul className="soon-list" aria-label={T.moreTitle}>
        {SERVICES.map(({ id, name, Icon }) => (
          <li key={id} className="soon-chip">
            <Icon size={18} aria-hidden="true" />
            <span>{name}</span>
            <em>{T.soon}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}
