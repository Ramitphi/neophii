// Operational log lines for the Instagram pipeline: event names, counts and status classes only.
// Never pass a note, caption, URL, token, sender ID or message payload here.
type LogValue = string | number | boolean | null;

export function logEvent(event: string, fields: Record<string, LogValue> = {}): void {
  console.info(JSON.stringify({ event, ...fields }));
}
