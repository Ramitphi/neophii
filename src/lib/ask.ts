import type { UserAsk } from '../types/neophi';

/** A note that is only a label ("for Maa") or a reminder asks nothing of the save's content, so there is nothing to show. */
export function asksSomething(ask: UserAsk | undefined): ask is UserAsk {
  return Boolean(ask) && ask!.kind !== 'remember' && ask!.kind !== 'reminder';
}
