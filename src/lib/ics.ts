import type { Memory } from '../types/neophi';

function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function downloadMemoryIcs(memory: Memory): void {
  const start = memory.remindAt ? new Date(memory.remindAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const summary = (memory.title || 'Neophi reminder').replace(/[\r\n]/g, ' ');
  const desc = [memory.note, memory.caption, memory.url]
    .filter(Boolean)
    .join('\\n')
    .replace(/\r?\n/g, '\\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Neophi//Memory Reminder//EN',
    'BEGIN:VEVENT',
    `UID:${memory.id}@neophi`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${memory.id}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
