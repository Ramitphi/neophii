import type { DmNote, Memory } from '../types/neophi';

/** DM notes other than the one shown as `note`, oldest first, exactly as sent. */
export function laterNotes(memory: Memory): DmNote[] {
  return (memory.dmNotes ?? [])
    .filter((n) => n.deliveryId !== memory.dm?.primaryNoteId)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}
