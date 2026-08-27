/**
 * THE phone normalizer (Blueprint §3 conventions). One implementation, imported
 * by edge ingestion, backfill scripts, and the dashboard alike.
 *
 * Returns E.164 with leading "+", or null when the input can't be a phone number.
 * Bare 10-digit numbers are treated as US national (the pilot's market);
 * provider ids (e.g. Meta wa_id) are stored verbatim in contact_identities —
 * this normalizer is for the display/dial identity only.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}
