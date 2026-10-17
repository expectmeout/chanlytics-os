export const LIMIT_TIERS = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_2K: 2e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
export function dailyLimit(tier) {
  if (!tier) return null;
  const n = LIMIT_TIERS[String(tier).toUpperCase()];
  return typeof n === "number" ? n : null;
}
export function numberHealth(n) {
  const q = String(n.quality ?? "").toUpperCase();
  const ev = String(n.event ?? "").toUpperCase();
  const limit = dailyLimit(n.limit);
  const limitWords = limit === null ? "daily limit not reported yet" : limit === Number.POSITIVE_INFINITY ? "no daily limit" : `up to ${limit.toLocaleString("en-US")} new conversations a day`;
  if (q === "RED" || ev === "FLAGGED") {
    return {
      canSend: false,
      tone: "danger",
      limitPerDay: limit,
      label: `WhatsApp flagged this number's quality \xB7 ${limitWords}`,
      refusal: "WhatsApp flagged this number's quality. Sending more marketing now risks the number; wait for it to recover."
    };
  }
  if (q === "YELLOW" || ev === "DOWNGRADE")
    return {
      canSend: true,
      tone: "warn",
      limitPerDay: limit,
      label: `Number quality: medium \xB7 ${limitWords}`,
      refusal: null
    };
  if (q === "GREEN" || ev === "UNFLAGGED" || ev === "UPGRADE")
    return {
      canSend: true,
      tone: "ok",
      limitPerDay: limit,
      label: `Number quality: good \xB7 ${limitWords}`,
      refusal: null
    };
  return {
    canSend: true,
    tone: "unknown",
    limitPerDay: limit,
    label: `Number quality not reported yet \xB7 ${limitWords}`,
    refusal: null
  };
}
export function overLimitRefusal(h, audience) {
  if (h.limitPerDay === null || audience <= h.limitPerDay) return null;
  return `This number can start up to ${h.limitPerDay.toLocaleString("en-US")} new conversations a day; this audience is ${audience.toLocaleString("en-US")}. Send to a smaller list or split it.`;
}
