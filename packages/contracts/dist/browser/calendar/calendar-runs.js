import { BROADCAST_STATE_LABELS } from "../broadcasts/broadcasts.js";
import { addressOf } from "../activity/record-address.js";
import { RUN_WAITING_WORDS } from "../shell/campaign-rooms.js";
import { campaignEnded, nextRunOf, planRun } from "../playbooks/playbook-schedule.js";
import { clockInZone, dayInZone } from "./zone-math.js";
import { shiftKey } from "./day-keys.js";
import { clockLabel } from "./calendar-words.js";
import { plural } from "../shared/words.js";
import { MIN_MS } from "../shared/time.js";
const CALENDAR_RUN_DOORS = { sent: "Open in Sent", campaigns: "Open in Campaigns" };
export const CALENDAR_SHOW_WORDS = {
  label: "Show",
  always: "Always",
  open: "Open times",
  campaigns: "Campaigns",
  cold: "Cold email",
  /** The capsule's value: what is on beside the visits, of what the workspace has to show. */
  value: (on, offered) => {
    const campaigns = on.campaigns && offered.campaigns;
    const cold = on.cold && offered.cold;
    const all = on.open && (campaigns || !offered.campaigns) && (cold || !offered.cold);
    if (all) return "Everything";
    const parts = [on.open ? "Open times" : null, campaigns ? "campaigns" : null, cold ? "cold email" : null];
    const said = parts.filter(Boolean).join(", ");
    return said ? said.charAt(0).toUpperCase() + said.slice(1) : "Bookings only";
  },
  /** The service picker's word now that it only filters the open times: "Open for · Any service". */
  openFor: "Open for",
  anyService: "Any service"
};
export const CALENDAR_RUN_SHEET_WORDS = {
  kicker: (day) => `Campaigns \xB7 ${day}`,
  toCome: "to come",
  runs: "runs",
  withinTheHour: "within the hour",
  toApprove: "to approve",
  lastDay: "last day",
  tooLate: "Too late to approve",
  written: (n) => `${n} written`,
  planned: (n) => `${n} planned`,
  sent: (n) => `${n} sent`,
  many: "Campaigns",
  failed: "Failed",
  /** D13: the day's sheet offers a send of its own (the composer, Send once, where its When picks the day). */
  schedule: "Schedule a message"
};
const RUN_WORDS = CALENDAR_RUN_SHEET_WORDS;
function hoursIn(tz, ms) {
  const c = clockInZone(tz, ms);
  return c.hh + c.mm / 60;
}
const placedAt = (r) => Date.parse(r.finished_at ?? r.started_at ?? r.scheduled_for);
function pushOn(days, day, mark) {
  days.get(day)?.push(mark);
}
function sendMark(r, tz) {
  if (r.state === "canceled") return null;
  const at = placedAt(r);
  const waiting = r.state === "pending_approval";
  const t = waiting || !Number.isFinite(at) ? null : hoursIn(tz, at);
  const words = r.state === "sent" ? RUN_WORDS.sent(r.sent) : r.state === "sending" ? `${BROADCAST_STATE_LABELS.sending} \xB7 ${RUN_WORDS.sent(r.sent)}` : r.state === "scheduled" ? `${BROADCAST_STATE_LABELS.scheduled} \xB7 ${plural(r.recipient_count, "person", "people")}` : BROADCAST_STATE_LABELS[r.state];
  const tone = r.state === "failed" ? "danger" : waiting ? "warn" : r.state === "sending" ? "accent" : r.state === "scheduled" ? "info" : "plain";
  return {
    key: `send:${r.id}`,
    kind: "send",
    t,
    time: t === null ? "" : clockLabel(t),
    name: r.name,
    words,
    tone,
    ahead: r.state === "scheduled" || waiting,
    cold: false,
    route: addressOf({ kind: "send", id: r.id }),
    door: CALENDAR_RUN_DOORS.sent,
    named: true,
    items: []
  };
}
function waitingMark(r, name, todayKey) {
  const late = !!r.run_for && r.run_for < todayKey;
  return {
    key: `run:${r.id}`,
    kind: "run",
    t: null,
    time: "",
    name,
    words: late ? RUN_WORDS.tooLate : RUN_WAITING_WORDS,
    tone: late ? "plain" : "warn",
    ahead: !late,
    cold: false,
    route: addressOf({ kind: "send", id: r.id }),
    door: CALENDAR_RUN_DOORS.sent,
    named: true,
    items: []
  };
}
function failedMark(r, name, tz) {
  const at = placedAt(r);
  const t = Number.isFinite(at) ? hoursIn(tz, at) : null;
  return {
    key: `run:${r.id}`,
    kind: "run",
    t,
    time: t === null ? "" : clockLabel(t),
    name,
    words: RUN_WORDS.failed,
    tone: "danger",
    ahead: false,
    cold: false,
    route: addressOf({ kind: "send", id: r.id }),
    door: CALENDAR_RUN_DOORS.sent,
    named: true,
    items: []
  };
}
const WENT_FOLD_MS = 15 * MIN_MS;
function wentMarks(day, runs, tz) {
  const timed = runs.map((x) => ({ ...x, at: placedAt(x.r) })).sort((a, b) => a.at - b.at);
  const folds = [];
  for (const x of timed) {
    const fold = folds[folds.length - 1];
    const first = fold?.[0];
    if (fold && first && Number.isFinite(x.at) && x.at - first.at <= WENT_FOLD_MS) fold.push(x);
    else folds.push([x]);
  }
  return folds.map((fold) => wentMark(day, fold, tz));
}
function wentMark(day, runs, tz) {
  const sent = runs.reduce((n, x) => n + x.r.sent, 0);
  const one = runs.length === 1 ? runs[0] : void 0;
  const first = runs[0];
  const t = first && Number.isFinite(first.at) ? hoursIn(tz, first.at) : null;
  return {
    key: `campaigns:${day}:${first?.r.id ?? ""}`,
    kind: "campaigns",
    t,
    time: t === null ? "" : clockLabel(t),
    name: one ? one.name : plural(runs.length, "campaign", "campaigns"),
    words: RUN_WORDS.sent(sent),
    tone: "plain",
    ahead: false,
    cold: false,
    route: one ? addressOf({ kind: "send", id: one.r.id }) : "broadcasts",
    door: CALENDAR_RUN_DOORS.sent,
    named: false,
    items: runs.map((x) => ({
      name: x.name,
      words: RUN_WORDS.sent(x.r.sent),
      route: addressOf({ kind: "send", id: x.r.id })
    }))
  };
}
function coldMark(day, playbookId, name, runs, todayKey) {
  const sent = runs.reduce((n, r) => n + r.sent, 0);
  const planned = runs.filter((r) => r.state === "scheduled").reduce((n, r) => n + r.recipient_count, 0);
  const waiting = runs.some((r) => r.state === "pending_approval") && day >= todayKey;
  const words = waiting ? RUN_WAITING_WORDS : sent ? RUN_WORDS.written(sent) : RUN_WORDS.planned(planned);
  const first = runs[0];
  return {
    key: `cold:${playbookId}:${day}`,
    kind: "cold",
    t: null,
    time: "",
    name,
    words,
    tone: waiting ? "warn" : "plain",
    ahead: waiting || !sent && planned > 0,
    cold: true,
    route: runs.length === 1 && first ? addressOf({ kind: "send", id: first.id }) : "broadcasts",
    door: CALENDAR_RUN_DOORS.sent,
    named: false,
    items: runs.map((r) => ({
      name,
      words: r.sent ? RUN_WORDS.written(r.sent) : RUN_WORDS.planned(r.recipient_count),
      route: addressOf({ kind: "send", id: r.id })
    }))
  };
}
function runMarks(dto, days, todayKey, names) {
  const tz = dto.timezone;
  const went = /* @__PURE__ */ new Map();
  const cold = /* @__PURE__ */ new Map();
  for (const r of dto.runs) {
    const at = placedAt(r);
    const day = r.run_for ?? (Number.isFinite(at) ? dayInZone(tz, at).key : null);
    if (!day || !days.has(day) || r.state === "canceled") continue;
    const name = (r.playbook_id ? names.get(r.playbook_id) : null) ?? r.name;
    if (r.reach_out) {
      const key = `${r.playbook_id ?? r.id}:${day}`;
      const c = cold.get(key) ?? { day, id: r.playbook_id ?? r.id, runs: [] };
      c.runs.push(r);
      cold.set(key, c);
    } else if (!r.playbook_id) {
      const m = sendMark(r, tz);
      if (m) pushOn(days, day, m);
    } else if (r.state === "pending_approval") pushOn(days, day, waitingMark(r, name, todayKey));
    else if (r.state === "failed") pushOn(days, day, failedMark(r, name, tz));
    else if (r.state === "sent" || r.state === "sending") went.set(day, [...went.get(day) ?? [], { r, name }]);
  }
  for (const [day, runs] of went) for (const m of wentMarks(day, runs, tz)) pushOn(days, day, m);
  for (const c of cold.values())
    pushOn(days, c.day, coldMark(c.day, c.id, names.get(c.id) ?? c.runs[0]?.name ?? "", c.runs, todayKey));
}
function nextMarks(dto, days, now, todayKey) {
  if (dto.paused) return;
  const tz = dto.timezone;
  const standing = new Set(
    dto.runs.filter((r) => r.playbook_id && r.run_for).map((r) => `${r.playbook_id}:${r.run_for}`)
  );
  for (const p of dto.moments) {
    if (p.state !== "running" || p.reach_out) continue;
    const next = nextRunOf(p, tz, now);
    const day = next.day === "today" ? todayKey : shiftKey(todayKey, 1);
    const made = !!p.last_run_for && p.last_run_for >= day;
    if (made || standing.has(`${p.id}:${day}`) || campaignEnded(p, day)) continue;
    const sends = planRun(p.mode, now).kind === "send";
    const t = sends && !next.soon ? next.hour : null;
    const when = next.day === "today" ? "today" : "tomorrow";
    pushOn(days, day, {
      key: `next:${p.id}`,
      kind: "next",
      t,
      time: t === null ? "" : clockLabel(t),
      name: p.name,
      // The hour leads where it has one (`time`), so the words do not say it twice.
      words: sends ? t === null ? `${RUN_WORDS.runs} ${RUN_WORDS.withinTheHour} \xB7 ${RUN_WORDS.toCome}` : RUN_WORDS.toCome : `${RUN_WORDS.toApprove} ${when}`,
      tone: "info",
      ahead: true,
      cold: false,
      route: addressOf({ kind: "campaign", id: p.id }),
      door: CALENDAR_RUN_DOORS.campaigns,
      named: false,
      items: []
    });
  }
}
function lastDayMarks(dto, days) {
  for (const p of dto.moments) {
    if (p.state !== "running" || p.reach_out || !p.until || !days.has(p.until)) continue;
    pushOn(days, p.until, {
      key: `last:${p.id}`,
      kind: "last_day",
      t: null,
      time: "",
      name: p.name,
      words: RUN_WORDS.lastDay,
      tone: "plain",
      ahead: false,
      cold: false,
      route: addressOf({ kind: "campaign", id: p.id }),
      door: CALENDAR_RUN_DOORS.campaigns,
      named: true,
      items: []
    });
  }
}
const KIND_ORDER = { run: 0, last_day: 1, send: 2, next: 3, campaigns: 4, cold: 5 };
export function calendarRunMarksOf(dto, now) {
  const days = /* @__PURE__ */ new Map();
  for (let i = 0; i < dto.days; i++) days.set(shiftKey(dto.from, i), []);
  const todayKey = dayInZone(dto.timezone, now.getTime()).key;
  const names = new Map(dto.moments.map((p) => [p.id, p.name]));
  runMarks(dto, days, todayKey, names);
  nextMarks(dto, days, now, todayKey);
  lastDayMarks(dto, days);
  for (const marks of days.values())
    marks.sort(
      (a, b) => (a.t ?? -1) - (b.t ?? -1) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name)
    );
  return days;
}
export function runMarkShown(m, show) {
  return m.cold ? show.cold : show.campaigns;
}
