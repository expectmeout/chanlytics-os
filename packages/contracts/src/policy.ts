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
