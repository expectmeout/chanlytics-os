import { clockDate, wallClockAt, zoneDayKey } from "../shared/clock.js";
import { isRealDate } from "../config/workspace-config/config-rules.js";
import { linkHost } from "../shared/link.js";
import { DAY_MS } from "../shared/time.js";
import {
  DEAL_LOST_REASON_WORDS,
  DEAL_STAGE_WORDS,
  isDealLostReason,
  isDealPer,
  isDealStage
} from "./deal-words.js";
import { amountWords } from "./deal-amount.js";
export function dealFactsOf(r) {
  if (!r || !isDealStage(r.deal_stage)) return null;
  return {
    stage: r.deal_stage,
    service: r.deal_service ?? null,
    proposed_at: r.deal_proposed_at ?? null,
    decided_at: r.deal_decided_at ?? null,
    ended_at: r.deal_ended_at ?? null,
    amount_cents: r.deal_amount_cents ?? null,
    per: r.deal_per ?? null,
    currency: r.deal_currency ?? null,
    proposal_url: r.deal_proposal_url ?? null,
    valid_until: r.deal_valid_until ?? null,
    lost_reason: r.deal_lost_reason ?? null
  };
}
export function pickCurrentDeal(rows) {
  const sorted = [...rows].sort(
    (a, b) => Number(dealIsOpen(b)) - Number(dealIsOpen(a)) || Date.parse(b.created_at) - Date.parse(a.created_at)
  );
  return sorted[0] ?? null;
}
export function dealIsOpen(d) {
  return !!d && (d.stage === "proposed" || d.stage === "won");
}
export function proposalLinkOf(current, personLink) {
  if (!current) return personLink?.trim() || null;
  if (current.stage !== "proposed") return null;
  return (current.proposal_url ?? current.proposal?.url)?.trim() || null;
}
export function wholeDaysSince(atMs, nowMs) {
  return atMs === null ? null : Math.max(0, Math.floor((nowMs - atMs) / DAY_MS));
}
export function dealSinceMs(d) {
  const at = d.stage === "proposed" ? d.proposed_at : d.stage === "ended" ? d.ended_at : d.decided_at ?? d.proposed_at;
  const ms = at ? Date.parse(at) : NaN;
  return Number.isFinite(ms) ? ms : null;
}
function validUntilOf(day, tz, nowMs) {
  if (!day || !isRealDate(day)) return null;
  const at = wallClockAt(tz, day, 12, 0);
  if (!Number.isFinite(at)) return null;
  const lapsed = zoneDayKey(nowMs, tz) > day;
  const date = clockDate(at, tz, nowMs);
  return { day, date, words: `${lapsed ? "Lapsed" : "Valid until"} ${date}`, lapsed };
}
export function toDealVM(d, tz, nowMs) {
  if (!isDealStage(d.stage)) return null;
  const sinceMs = dealSinceMs(d);
  const since = sinceMs === null ? "" : `since ${clockDate(sinceMs, tz, nowMs)}`;
  const waitingDays = d.stage === "proposed" ? wholeDaysSince(sinceMs, nowMs) : null;
  const amount = amountWords(d.amount_cents, d.per, d.currency ?? "USD");
  const url = d.proposal_url?.trim() || null;
  const proposedMs = d.proposed_at ? Date.parse(d.proposed_at) : NaN;
  const word = DEAL_STAGE_WORDS[d.stage];
  const said = [word, since, amount].filter((x) => !!x).join(" \xB7 ");
  const line = [d.service, said].filter((x) => !!x).join(" \xB7 ");
  const facts = [d.service, since, amount].filter((x) => !!x).join(" \xB7 ");
  const brief = d.stage === "proposed" ? `${word} \xB7 ${waitingDays ?? 0} d` : d.stage === "won" ? [word, d.service].filter((x) => !!x).join(" \xB7 ") : null;
  return {
    id: d.id ?? null,
    version: d.version ?? null,
    stage: d.stage,
    word,
    service: d.service,
    sinceMs,
    since,
    said,
    line,
    facts,
    brief,
    waitingDays,
    amount,
    amountCents: d.amount_cents === null || d.amount_cents === void 0 || !Number.isFinite(d.amount_cents) ? null : d.amount_cents,
    per: isDealPer(d.per) ? d.per : null,
    currency: d.currency || "USD",
    proposedMs: Number.isFinite(proposedMs) ? proposedMs : null,
    proposal: url ? { url, host: linkHost(url) } : null,
    validUntil: d.stage === "proposed" ? validUntilOf(d.valid_until, tz, nowMs) : null,
    reason: d.stage === "lost" && isDealLostReason(d.lost_reason) ? { code: d.lost_reason, words: DEAL_LOST_REASON_WORDS[d.lost_reason] } : null
  };
}
export function dealOf(r, tz, nowMs) {
  const f = dealFactsOf(r);
  return f ? toDealVM({ ...f, id: r?.deal_id ?? null }, tz, nowMs) : null;
}
const strOrNull = (v) => typeof v === "string" ? v : null;
export function openDealsFromJson(j) {
  if (j === void 0) return void 0;
  if (!Array.isArray(j)) return null;
  const out = [];
  for (const x of j) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x;
    const id = strOrNull(o.id);
    const stage = strOrNull(o.stage);
    if (!id || !stage) continue;
    out.push({
      id,
      stage,
      service: strOrNull(o.service),
      proposed_at: strOrNull(o.proposed_at),
      decided_at: strOrNull(o.decided_at),
      ended_at: strOrNull(o.ended_at),
      amount_cents: typeof o.amount_cents === "number" ? o.amount_cents : null,
      per: strOrNull(o.per),
      currency: strOrNull(o.currency),
      proposal_url: strOrNull(o.proposal_url),
      valid_until: strOrNull(o.valid_until),
      lost_reason: strOrNull(o.lost_reason)
    });
  }
  return out;
}
export function openDealsOf(r, tz, nowMs) {
  if (!r) return [];
  if (r.open_deals === void 0) {
    const one = dealOf(r, tz, nowMs);
    return one && dealIsOpen(one) ? [one] : [];
  }
  return (r.open_deals ?? []).map(
    (x) => dealOf(
      {
        deal_id: x.id,
        deal_stage: x.stage,
        deal_service: x.service,
        deal_proposed_at: x.proposed_at,
        deal_decided_at: x.decided_at,
        deal_ended_at: x.ended_at,
        deal_amount_cents: x.amount_cents,
        deal_per: x.per,
        deal_currency: x.currency,
        deal_proposal_url: x.proposal_url,
        deal_valid_until: x.valid_until,
        deal_lost_reason: x.lost_reason
      },
      tz,
      nowMs
    )
  ).filter((d) => d !== null && dealIsOpen(d));
}
export function dealSentence(d, nowMs, tz = "UTC", opts = {}) {
  if (!d || !isDealStage(d.stage)) return null;
  const svc = d.service ? ` (${d.service})` : "";
  const sinceMs = dealSinceMs(d);
  const on = sinceMs === null ? "" : ` on ${clockDate(sinceMs, tz, nowMs)}`;
  const since = sinceMs === null ? "" : `, since ${clockDate(sinceMs, tz, nowMs)}`;
  switch (d.stage) {
    case "won":
      return `They are a client${svc}${since}. Offer them the service itself, not a consultation. Anything about their engagement or what it costs goes to a person: say someone will follow up, and hand over.`;
    case "proposed":
      return opts.hasLink ? `A proposal${svc} went out to them${on} and is waiting on their answer. If they ask about it, send them the proposal link and state none of its figures, then hand over.` : `A proposal${svc} went out to them${on} and is waiting on their answer. If they ask about it, say the person who sent it will follow up, and hand over. Never discuss its price.`;
    case "lost":
      return `They passed on a proposal${svc}${on}. Do not bring it up; if they ask again, hand over to a person.`;
    case "ended":
      return `A former client${svc}: the engagement ended${on}. Treat them as any customer.`;
  }
}
