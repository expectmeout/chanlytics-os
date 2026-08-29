/**
 * Layer-2 policy enforcement (Blueprint §6): deterministic post-generation
 * checks — prompt text is never the only defense. v1 ships the one hard rule
 * of tenant #1: NO dollar prices, ever.
 */

// $45 / $ 45 / 45 dollars / 45 usd / 45 bucks / 45 dólares / 45 pesos —
// while ignoring bare durations/times the salon bot legitimately says.
const PRICE_PATTERNS: RegExp[] = [
  /\$\s?\d/,
  /\b\d+(?:[.,]\d{2})?\s?(?:dollars?|usd|bucks?)\b/i,
  /\b\d+(?:[.,]\d{2})?\s?(?:d[oó]lares?|pesos?)\b/i,
];

export function violatesNoPrices(text: string): boolean {
  return PRICE_PATTERNS.some((p) => p.test(text));
}

/** The WhatsApp 24h customer-service window (Blueprint §4/§6). Pure — imported
 *  by BOTH the reply endpoint (enforcement) and the composer (honest display). */
export const WA_WINDOW_MS = 24 * 3600 * 1000;

export interface WaWindow {
  open: boolean;
  /** When the window closes (null when it never opened). */
  closesAtIso: string | null;
}

export function waWindow(lastWaInboundAtIso: string | null | undefined, now = new Date()): WaWindow {
  if (!lastWaInboundAtIso) return { open: false, closesAtIso: null };
  const closes = new Date(lastWaInboundAtIso).getTime() + WA_WINDOW_MS;
  return { open: closes > now.getTime(), closesAtIso: new Date(closes).toISOString() };
}

/* ----------------------------- live calls -------------------------------- */

/**
 * How long a call may go without any sign of life before we stop calling it
 * live, whatever its status column says.
 *
 * `calls.status = 'ongoing'` is written from Retell's own `call_status`, and it
 * is only ever cleared by a later webhook. So a single lost `call_ended` — a
 * deploy mid-call, a provider blip, a 500 on our side — leaves that row
 * `ongoing` FOREVER, and anything reading the flag alone shows a call in
 * progress that hung up days ago. A status flag is a claim; this is the
 * evidence.
 *
 * Ten minutes, not ninety seconds, and the difference is a deployment fact
 * rather than a preference: with only `call_started` and `call_ended`
 * configured on the Retell webhook, nothing touches the row between them, so a
 * tight bound would declare every ordinary call dead a minute into it. Enabling
 * the `transcript_updated` event — which fires on every turn — makes the
 * heartbeat continuous and this bound effectively tight, at which point it can
 * come down.
 *
 * This is a DISPLAY guard, not the fix. It bounds how long a phantom can be
 * shown; only reconciling against the provider makes the row itself honest.
 */
export const CALL_HEARTBEAT_MS = 10 * 60 * 1000;

export function isLiveCall(
  call: { status: string; updated_at?: string | null; started_at?: string | null },
  now = new Date(),
): boolean {
  if (call.status !== "ongoing") return false;
  // updated_at moves on every ingest (moddatetime + the upsert in ingest_call);
  // started_at is the fallback for a row written before that was true.
  const beat = call.updated_at ?? call.started_at;
  // Ongoing with no timestamp at all is not evidence of anything.
  if (!beat) return false;
  const at = new Date(beat).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < CALL_HEARTBEAT_MS;
}
