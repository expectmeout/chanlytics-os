/**
 * The sending number's health: its daily limit by tier, what it has used, and the refusal when a run would go over.
 * Moved whole from broadcasts.ts (Reach out Part 2.5), which re-exports it.
 */
/* ---- The number's health: what WhatsApp has said about it, and what that permits ---- */

/** Meta's messaging-limit tiers: business-initiated conversations in a rolling day. */
export const LIMIT_TIERS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,
};

export function dailyLimit(tier: string | null | undefined): number | null {
  if (!tier) return null;
  const n = LIMIT_TIERS[String(tier).toUpperCase()];
  return typeof n === "number" ? n : null;
}

export interface NumberHealthInput {
  /** Meta's quality rating as read at connection: GREEN, YELLOW, RED, UNKNOWN. */
  quality: string | null | undefined;
  /** The newest quality webhook: FLAGGED, UNFLAGGED, DOWNGRADE, UPGRADE. */
  event: string | null | undefined;
  /** The newest messaging limit webhook: TIER_250 and the like. */
  limit: string | null | undefined;
}

export interface NumberHealth {
  canSend: boolean;
  tone: "ok" | "warn" | "danger" | "unknown";
  label: string;
  limitPerDay: number | null;
  refusal: string | null;
}

/**
 * The one reading of a number's health. A flagged or red number cannot
 * broadcast: sending more marketing on it risks the number itself. Anything
 * Meta has not reported is said so, never assumed good or bad.
 */
export function numberHealth(n: NumberHealthInput): NumberHealth {
  const q = String(n.quality ?? "").toUpperCase();
  const ev = String(n.event ?? "").toUpperCase();
  const limit = dailyLimit(n.limit);
  const limitWords =
    limit === null
      ? "daily limit not reported yet"
      : limit === Number.POSITIVE_INFINITY
        ? "no daily limit"
        : `up to ${limit.toLocaleString("en-US")} new conversations a day`;
  if (q === "RED" || ev === "FLAGGED") {
    return {
      canSend: false,
      tone: "danger",
      limitPerDay: limit,
      label: `WhatsApp flagged this number's quality · ${limitWords}`,
      refusal:
        "WhatsApp flagged this number's quality. Sending more marketing now risks the number; wait for it to recover.",
    };
  }
  if (q === "YELLOW" || ev === "DOWNGRADE")
    return {
      canSend: true,
      tone: "warn",
      limitPerDay: limit,
      label: `Number quality: medium · ${limitWords}`,
      refusal: null,
    };
  if (q === "GREEN" || ev === "UNFLAGGED" || ev === "UPGRADE")
    return {
      canSend: true,
      tone: "ok",
      limitPerDay: limit,
      label: `Number quality: good · ${limitWords}`,
      refusal: null,
    };
  return {
    canSend: true,
    tone: "unknown",
    limitPerDay: limit,
    label: `Number quality not reported yet · ${limitWords}`,
    refusal: null,
  };
}

/** Null when the audience fits the day's limit; otherwise the refusal, with the numbers. */
export function overLimitRefusal(h: NumberHealth, audience: number): string | null {
  if (h.limitPerDay === null || audience <= h.limitPerDay) return null;
  return `This number can start up to ${h.limitPerDay.toLocaleString("en-US")} new conversations a day; this audience is ${audience.toLocaleString("en-US")}. Send to a smaller list or split it.`;
}
