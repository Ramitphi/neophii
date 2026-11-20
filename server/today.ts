import type { Memory, Project, TodayCard, TodayResponse } from '../src/types/neophi.js';

export interface LocalTimeParts {
  dateStr: string; // YYYY-MM-DD
  weekday: string; // Sun, Mon, ...
  hour: number; // 0..23
}

export function getLocalTimeParts(now: Date, timeZone: string): LocalTimeParts {
  let tz = timeZone;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(now);
  } catch {
    tz = 'Asia/Kolkata';
  }

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  });

  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const weekday = get('weekday');
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;

  return {
    dateStr: `${year}-${month}-${day}`,
    weekday,
    hour,
  };
}

/**
 * Deterministic FNV-1a hash of dateStr + memoryId so selection is stable for the day.
 */
export function deterministicHash(dateStr: string, memoryId: string): number {
  const str = `${dateStr}::${memoryId}`;
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isAvailable(m: Memory, nowMs: number): boolean {
  if (m.doneAt) return false;
  if (m.snoozedUntil && new Date(m.snoozedUntil).getTime() > nowMs) return false;
  return true;
}

function getHourWindow(hour: number): {
  label: string;
  matches: (m: Memory) => boolean;
} {
  if (hour >= 5 && hour < 12) {
    return {
      label: 'morning',
      matches: (m) => m.analysis?.purpose === 'food' || m.chip === 'Try',
    };
  }
  if (hour >= 12 && hour < 17) {
    return {
      label: 'daytime',
      matches: (m) =>
        m.analysis?.purpose === 'learn' ||
        m.analysis?.purpose === 'create' ||
        m.chip === 'Learn' ||
        m.chip === 'Remix',
    };
  }
  if (hour >= 17 && hour < 22) {
    return {
      label: 'evening',
      matches: (m) =>
        m.analysis?.purpose === 'shop' ||
        m.analysis?.purpose === 'travel' ||
        m.chip === 'Buy' ||
        m.chip === 'Go there',
    };
  }
  return {
    label: 'night',
    matches: (m) =>
      m.analysis?.purpose === 'other' ||
      m.analysis?.purpose === 'try_later' ||
      m.chip === 'Just remember',
  };
}

export function isInWeeklyWindow(local: LocalTimeParts): boolean {
  if (local.weekday === 'Sun' && local.hour >= 9) return true;
  if (local.weekday === 'Mon' && local.hour < 12) return true;
  return false;
}

export function buildTodayFeed(options: {
  memories: Memory[];
  projects: Project[];
  now?: Date;
  timeZone?: string;
  readyForHourEnabled?: boolean;
}): TodayResponse {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const timeZone = options.timeZone || 'Asia/Kolkata';
  const readyEnabled = options.readyForHourEnabled !== false;
  const local = getLocalTimeParts(now, timeZone);

  if (options.memories.length === 0) {
    return {
      isEmptyLibrary: true,
      justArrived: [],
      youAskedForThis: [],
      activeProjects: [],
      readyForThisHour: { enabled: readyEnabled, windowLabel: getHourWindow(local.hour).label, cards: [] },
      beforeItFades: null,
      weeklyCard: { visible: false, savesCount: 0, opensCount: 0, cards: [] },
    };
  }

  const available = options.memories.filter((m) => isAvailable(m, nowMs));
  const usedIds = new Set<string>();

  // 1. Just arrived (last 24 hours, at most 3)
  const dayMs = 24 * 60 * 60 * 1000;
  const justArrived: TodayCard[] = available
    .filter((m) => nowMs - new Date(m.createdAt).getTime() <= dayMs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .map((memory) => {
      usedIds.add(memory.id);
      return {
        memory,
        whySeeing: 'Saved in the last 24 hours',
        section: 'just_arrived',
      };
    });

  // 2. You asked for this (due reminders, at most 3)
  const youAskedForThis: TodayCard[] = available
    .filter((m) => m.remindAt && new Date(m.remindAt).getTime() <= nowMs && !usedIds.has(m.id))
    .sort((a, b) => (a.remindAt || '').localeCompare(b.remindAt || ''))
    .slice(0, 3)
    .map((memory) => {
      usedIds.add(memory.id);
      const dayLabel = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        timeZone,
      }).format(new Date(memory.remindAt!));
      return {
        memory,
        whySeeing: `You asked to be reminded on ${dayLabel}`,
        section: 'you_asked',
      };
    });

  // 3. Active projects (saved to in the last 7 days; at most 2 projects, 3 cards each)
  const weekMs = 7 * dayMs;
  const activeProjects: { project: Project; cards: TodayCard[] }[] = [];
  for (const project of options.projects) {
    const projectMemories = available
      .filter((m) => m.projectIds.includes(project.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const hasRecentSave = projectMemories.some(
      (m) => nowMs - new Date(m.createdAt).getTime() <= weekMs
    );
    if (!hasRecentSave) continue;

    const cards: TodayCard[] = projectMemories.slice(0, 3).map((memory) => ({
      memory,
      whySeeing: `Part of active project "${project.name}"`,
      section: 'active_projects',
      projectName: project.name,
    }));

    if (cards.length > 0) {
      activeProjects.push({ project, cards });
    }
    if (activeProjects.length >= 2) break;
  }

  // 4. Ready for this hour (at most 2 cards, deterministic)
  const hourWin = getHourWindow(local.hour);
  const readyCards: TodayCard[] = readyEnabled
    ? available
        .filter((m) => !usedIds.has(m.id) && hourWin.matches(m))
        .sort(
          (a, b) =>
            deterministicHash(local.dateStr, a.id) - deterministicHash(local.dateStr, b.id)
        )
        .slice(0, 2)
        .map((memory) => ({
          memory,
          whySeeing: `Matched to ${hourWin.label} window`,
          section: 'ready_for_hour',
        }))
    : [];

  // 5. Before it fades (exactly 1 card a day, >=10 saves, >=30 days old, never opened)
  let beforeItFades: TodayCard | null = null;
  if (options.memories.length >= 10) {
    const thirtyDaysMs = 30 * dayMs;
    const candidates = available
      .filter(
        (m) =>
          m.lastOpenedAt === null &&
          nowMs - new Date(m.createdAt).getTime() >= thirtyDaysMs
      )
      .sort(
        (a, b) =>
          deterministicHash(local.dateStr, a.id) - deterministicHash(local.dateStr, b.id)
      );

    if (candidates.length > 0) {
      const picked = candidates[0];
      const ageDays = Math.floor((nowMs - new Date(picked.createdAt).getTime()) / dayMs);
      beforeItFades = {
        memory: picked,
        whySeeing: `Saved ${ageDays} days ago, never opened`,
        section: 'before_it_fades',
      };
    }
  }

  // 6. Weekly card (Sun 09:00 to Mon 12:00, >=2 saves or >=1 opens that week)
  const savesCount = options.memories.filter(
    (m) => nowMs - new Date(m.createdAt).getTime() <= weekMs
  ).length;
  const opensCount = options.memories.filter(
    (m) => m.lastOpenedAt && nowMs - new Date(m.lastOpenedAt).getTime() <= weekMs
  ).length;

  const weeklyVisible =
    isInWeeklyWindow(local) && (savesCount >= 2 || opensCount >= 1);

  const weeklyCards: TodayCard[] = weeklyVisible
    ? available
        .filter((m) => nowMs - new Date(m.createdAt).getTime() <= weekMs)
        .sort(
          (a, b) =>
            deterministicHash(local.dateStr, a.id) - deterministicHash(local.dateStr, b.id)
        )
        .slice(0, 3)
        .map((memory) => ({
          memory,
          whySeeing: `Weekly recap: ${savesCount} saved, ${opensCount} opened this week`,
          section: 'weekly',
        }))
    : [];

  return {
    isEmptyLibrary: false,
    justArrived,
    youAskedForThis,
    activeProjects,
    readyForThisHour: {
      enabled: readyEnabled,
      windowLabel: hourWin.label,
      cards: readyCards,
    },
    beforeItFades,
    weeklyCard: {
      visible: weeklyVisible,
      savesCount,
      opensCount,
      cards: weeklyCards,
    },
  };
}
