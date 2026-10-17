import { shiftKey } from "../calendar/day-keys.js";
import { clockNear, wallClockAt, zoneDayKey } from "../shared/clock.js";
import { purposeOfPlaybook } from "../consent/consent.js";
import { SELLS_BY_QUESTION, SELLS_BY_WORDS } from "../deals/sells-by.js";
import { waitingOnProposal } from "../deals/deal-waits.js";
import { readyOrWhatsApp } from "../broadcasts/reach-any.js";
import { DEFAULT_CAMPAIGN_CHANNELS, reachFor } from "../broadcasts/reach-for.js";
import { heardWithin } from "../broadcasts/run-words.js";
import { runDueNow } from "./playbook-schedule.js";
import { DAY_MS, sweepTickAtOrAfter } from "./playbook-time.js";
export const FOLLOW_UP_NEEDS_DEALS = `Proposal follow-ups need deals: in Settings \u203A Details, answer \u201C${SELLS_BY_QUESTION}\u201D with \u201C${SELLS_BY_WORDS.proposal.label}\u201D.`;
export const FOLLOW_UP_NEEDS_LINK = "A proposal follow-up carries the proposal's link: pick a message with a slot for it, and fill that slot with their proposal's link.";
export const FOLLOW_UP_ONE = "This workspace already has a proposal follow-up. Change that one rather than starting another.";
export const PLAYBOOK_TOUCH_WINDOW_MS = (365 + 7) * DAY_MS;
export function followUpNames(r, nowMs, pace) {
  return waitingOnProposal(r, nowMs, pace) && !!r.deal?.proposal?.url && nowMs - (r.deal.sinceMs ?? Number.NEGATIVE_INFINITY) <= PLAYBOOK_TOUCH_WINDOW_MS;
}
export function followUpKey(about) {
  return about.deal ? `deal:${about.deal}` : about.link ? `link:${about.link}` : "bare";
}
export function followUpCovers(d, had) {
  if (!had.keys) return had.at !== void 0 && followUpIsFor({ deal: d }, had.at);
  const since = d.sinceMs ?? Number.POSITIVE_INFINITY;
  const at = [
    d.id ? had.keys.get(followUpKey({ deal: d.id, link: null })) : void 0,
    d.proposal?.url ? had.keys.get(followUpKey({ deal: null, link: d.proposal.url })) : void 0,
    had.keys.get(followUpKey({ deal: null, link: null }))
  ];
  return at.some((x) => x !== void 0 && x >= since);
}
export function followUpDealOf(r, nowMs, pace, had) {
  const open = r.openDeals && r.openDeals.length ? r.openDeals : r.deal ? [r.deal] : [];
  const named = open.filter((d) => d.stage === "proposed" && followUpNames({ deal: d, askedMs: r.askedMs }, nowMs, pace)).sort((a, b) => (a.sinceMs ?? 0) - (b.sinceMs ?? 0));
  return named.find((d) => !followUpCovers(d, had)) ?? named[0] ?? null;
}
export function followUpIsFor(r, atMs) {
  return atMs >= (r.deal?.sinceMs ?? Number.POSITIVE_INFINITY);
}
export function playbookRunStop(o) {
  if (o.templateStatus !== "approved" && !o.byOthers) return "template_not_approved";
  if (!o.canSend) return "number_flagged";
  return null;
}
export function playbookStopBy(o) {
  return playbookRunStop({
    templateStatus: o.templateStatus,
    canSend: !o.channels.includes("whatsapp") || o.numberCanSend,
    byOthers: o.channels.some((c) => c !== "whatsapp")
  });
}
export function followUpRunAt(f, tz, clearAt, nowMs) {
  const today = zoneDayKey(nowMs, tz);
  const p = { state: "running", run_hour: f.run_hour, last_run_for: f.last_run_for };
  if (f.last_run_for !== today) {
    const tick2 = sweepTickAtOrAfter(Math.max(nowMs, wallClockAt(tz, today, f.run_hour, 0)));
    if (zoneDayKey(tick2, tz) === today && runDueNow(p, tz, new Date(tick2)) && clearAt(tick2)) return tick2;
  }
  let day = shiftKey(today, 1);
  let tick = sweepTickAtOrAfter(wallClockAt(tz, day, f.run_hour, 0));
  for (let i = 0; i < 400 && !clearAt(tick); i++) {
    day = shiftKey(day, 1);
    tick = sweepTickAtOrAfter(wallClockAt(tz, day, f.run_hour, 0));
  }
  return tick;
}
export function followUpStandOf(r, f, tz, nowMs, pace, ready) {
  if (!followUpNames(r, nowMs, pace)) return null;
  const how = {
    channels: f.channels ?? DEFAULT_CAMPAIGN_CHANNELS,
    ready: readyOrWhatsApp(ready),
    about: "theirs"
  };
  if (reachFor(r, purposeOfPlaybook("follow_up"), how).channel === null) return null;
  if (f.purpose === "marketing" && reachFor(r, "marketing", how).channel === null) return null;
  const when = (m) => {
    const ms = m[r.id] ? Date.parse(m[r.id]) : Number.NaN;
    return Number.isFinite(ms) ? ms : null;
  };
  const had = when(f.had);
  if (had !== null && followUpIsFor(r, had)) return { kind: "had", atMs: had };
  const queued = when(f.queued);
  if (queued !== null && followUpIsFor(r, queued)) return { kind: "will", atMs: queued, asks: false };
  const held = when(f.held);
  if (held !== null && followUpIsFor(r, held)) return { kind: "will", atMs: held, asks: true };
  const times = (f.heard[r.id] ?? []).map(Date.parse);
  const clearAt = (tick) => !times.some(heardWithin(tick, nowMs));
  return { kind: "will", atMs: followUpRunAt(f, tz, clearAt, nowMs), asks: f.asks };
}
export function followUpWords(s, tz, nowMs) {
  const day = clockNear(s.atMs, tz, nowMs);
  return s.asks ? `Follow-up to approve ${day}` : `Follow-up ${day}`;
}
