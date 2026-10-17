import { audienceMembers, saidYesOnAny } from "../broadcasts/broadcast-audience.js";
import { reachFor } from "../broadcasts/reach-for.js";
import { heardWithin } from "../broadcasts/run-words.js";
import { POLICY_CLASS_WORDS } from "../config/workspace-config/policy-classes.js";
import { visitDateKey } from "../calendar/calendar-people.js";
import { dayPlusInZone } from "../calendar/zone-math.js";
import { fullNameKey } from "../calendar/visit/visit-service.js";
import { purposeOfPlaybook } from "../consent/consent.js";
import { GET_YES_ROUTE, NO_CHANNEL_REACH, saidYesWords } from "../people/people-lists.js";
import { followUpCovers, followUpDealOf, followUpKey } from "./playbook-follow-ups.js";
import { enrolPurpose, messageAboutOfTrigger } from "./playbook-purpose.js";
import { DAY_MS } from "./playbook-time.js";
import { HOUR_MS } from "../shared/time.js";
import { triggerOf } from "./playbook-triggers.js";
export const playbookPoolKey = (id) => `playbook:${id}`;
const TWIN_SAME_VISIT_MS = 20 * HOUR_MS;
function dropTwinHeard(allowed, byTwin, nowMs) {
  if (!byTwin || byTwin.size === 0) return 0;
  const heard = allowed.filter((r) => {
    const at = byTwin.get(r.id);
    return at !== void 0 && Math.abs(nowMs - at) < TWIN_SAME_VISIT_MS;
  });
  for (const r of heard) allowed.splice(allowed.indexOf(r), 1);
  return heard.length;
}
export function touchesAfterRun(touches, run, people) {
  const byThis = new Map(touches.byThis);
  const mine = new Map(byThis.get(run.playbookId));
  const byAny = new Map(touches.byAny);
  const followUps = new Map(touches.followUps);
  const followUpKeys = new Map(touches.followUpKeys);
  for (const { id, deal, link } of people) {
    mine.set(id, Math.max(mine.get(id) ?? 0, run.at));
    byAny.set(id, Math.max(byAny.get(id) ?? 0, run.at));
    if (!run.followUp) continue;
    followUps.set(id, Math.max(followUps.get(id) ?? 0, run.at));
    const m = new Map(followUpKeys.get(id));
    const key = followUpKey({ deal, link });
    m.set(key, Math.max(m.get(key) ?? 0, run.at));
    followUpKeys.set(id, m);
  }
  byThis.set(run.playbookId, mine);
  return { byThis, byAny, followUps, followUpKeys };
}
export function eligibleForPlaybook(rows, p, touches, nowMs, pace, listIds = null) {
  return playbookRunReach(rows, p, touches, nowMs, pace, listIds).eligible;
}
const savedNameOf = (r) => r.givenName ?? r.waName;
function fullNameHolders(rows) {
  const holders = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const key = fullNameKey(savedNameOf(r));
    if (key !== null) holders.set(key, (holders.get(key) ?? 0) + 1);
  }
  return holders;
}
export function visitMomentDay(trigger, tz, nowMs) {
  return dayPlusInZone(tz, nowMs, trigger === "visit_tomorrow" ? 1 : -1).key;
}
export function visitOnDay(v, day, side, theirs) {
  if (!v) return null;
  const onDay = (v.near ?? [side === "next" ? v.next : v.last]).filter(
    (x) => !!x && visitDateKey(x.start, v.timezone) === day && theirs(x.via)
  );
  return (side === "next" ? onDay[0] : onDay[onDay.length - 1]) ?? null;
}
export function theirVisitTest(rows) {
  const holders = fullNameHolders(rows);
  return (r, via) => visitIsTheirs(r, via, holders);
}
function visitIsTheirs(r, via, holders) {
  if (via === "business") return false;
  if (via !== "name") return true;
  const key = fullNameKey(savedNameOf(r));
  return key !== null && holders.get(key) === 1;
}
export function playbookRunReach(rows, p, touches, nowMs, pace, listIds = null) {
  const reach = {
    pool: 0,
    will: 0,
    noNumber: 0,
    stopped: 0,
    noYes: 0,
    heardThis: 0,
    heardAny: 0,
    overCap: 0,
    overLimit: 0,
    no_address: 0,
    address_stopped: 0,
    no_channel: 0
  };
  const byChannel = { whatsapp: 0, sms: 0, email: 0 };
  const channelOf = {};
  const none = { eligible: [], reach, saidYes: 0, channelOf };
  const t = triggerOf(p.trigger);
  if (!t) return none;
  if (t.kind === "reach_out") return none;
  const purpose = enrolPurpose(t.cls, p.message);
  const how = { channels: p.channels, ready: p.ready, about: messageAboutOfTrigger(p.trigger) };
  const hadOf = (id) => ({
    at: touches.followUps.get(id),
    keys: touches.followUpKeys.get(id)
  });
  const theirs = theirVisitTest(t.kind === "visit" ? rows : []);
  const named = t.kind === "visit" ? (
    // The calendar's own day, never hours: eleven at night tomorrow is still tomorrow. And a visit that is surely
    // theirs (visitIsTheirs).
    rows.filter((r) => {
      if (!r.calendarTz) return false;
      const day = visitMomentDay(p.trigger, r.calendarTz, nowMs);
      const onDay = r.visitDays.some((d) => d.date === day && theirs(r, d.via));
      if (p.trigger === "visit_tomorrow") return onDay;
      return onDay && !r.booked;
    })
  ) : t.kind === "saved" ? audienceMembers(rows, "saved", null, listIds ?? /* @__PURE__ */ new Set()) : t.kind === "deal" ? rows.flatMap((r) => {
    const d = followUpDealOf(r, nowMs, pace, hadOf(r.id));
    return d ? [{ ...r, deal: d }] : [];
  }) : audienceMembers(rows, t.list ? "list" : "everyone", t.list ?? null, null);
  reach.pool = named.length;
  const saidYes = named.filter((r) => saidYesOnAny(r, purpose, how)).length;
  const done = (eligible2) => {
    const kept = {};
    for (const r of eligible2) {
      const channel = channelOf[r.id];
      if (!channel) continue;
      kept[r.id] = channel;
      byChannel[channel] += 1;
    }
    reach.by_channel = byChannel;
    reach.will = eligible2.length;
    return { eligible: eligible2, reach, saidYes, channelOf: kept };
  };
  const allowed = [];
  for (const r of named) {
    const pick = reachFor(r, purpose, how);
    if (pick.channel) {
      channelOf[r.id] = pick.channel;
      allowed.push(r);
    } else if (pick.held === "no_number") reach.noNumber += 1;
    else if (pick.held === "stopped" || pick.held === "unsubscribed") reach.stopped += 1;
    else if (pick.held === "no_yes") reach.noYes += 1;
    else if (pick.held === "no_address") reach.no_address = (reach.no_address ?? 0) + 1;
    else if (pick.held === "address_stopped") reach.address_stopped = (reach.address_stopped ?? 0) + 1;
    else reach.no_channel = (reach.no_channel ?? 0) + 1;
  }
  if (t.kind === "visit") {
    reach.heardThis += dropTwinHeard(allowed, touches.byTwin, nowMs);
    allowed.sort(
      (a, b) => p.trigger === "visit_tomorrow" ? (a.nextVisitMs ?? 0) - (b.nextVisitMs ?? 0) : (a.lastVisitMs ?? 0) - (b.lastVisitMs ?? 0)
    );
    return done(allowed);
  }
  const gapMs = (p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days) * DAY_MS;
  const breathHolds = heardWithin(nowMs, nowMs);
  const heardThis = (r) => {
    if (t.kind === "deal") return !!r.deal && followUpCovers(r.deal, hadOf(r.id));
    const mine = touches.byThis.get(r.id);
    return mine !== void 0 && nowMs - mine < gapMs;
  };
  const picked = allowed.filter((r) => {
    if (heardThis(r)) {
      reach.heardThis += 1;
      return false;
    }
    const any = touches.byAny.get(r.id);
    if (any !== void 0 && breathHolds(any)) {
      reach.heardAny += 1;
      return false;
    }
    return true;
  });
  picked.sort((a, b) => (a.lastContact.ts ?? 0) - (b.lastContact.ts ?? 0));
  const eligible = picked.slice(0, Math.max(1, p.cap_per_run));
  reach.overCap = picked.length - eligible.length;
  return done(eligible);
}
export function playbookReach(p) {
  if (p.waiting) return "waiting";
  if (p.state !== "running") return "paused";
  if (p.candidates === null || p.held === null) return "uncounted";
  if (p.candidates > 0) return "sends";
  return p.held > 0 ? "all-heard" : "nobody";
}
export function playbookReachDoor(reach, named) {
  return reach === "nobody" && named !== null && named.pool > 0 && named.saidYes === 0 ? { label: "Get their yes", to: GET_YES_ROUTE } : null;
}
export function playbookNoNumberWords(p, named) {
  if (!named || named.saidYes === 0 || p.candidates === null || p.held === null || p.candidates + p.held > 0)
    return null;
  const noChannel = (named.noChannel ?? 0) > 0 ? NO_CHANNEL_REACH : null;
  return saidYesWords("the list", purposeOfPlaybook(p.policy_class), 0, named.saidYes, noChannel);
}
export const PLAYBOOK_REACH_WORDS = {
  waiting: null,
  paused: null,
  sends: null,
  nobody: "nobody to send to",
  "all-heard": "waiting out the week's gap",
  // The page says once, over the cards, that who each moment reaches could not be read.
  uncounted: null
};
export const PLAYBOOK_CLASS_LABEL = {
  reengage: POLICY_CLASS_WORDS.reengage.short,
  campaign: POLICY_CLASS_WORDS.campaign.short,
  booking: POLICY_CLASS_WORDS.booking.short,
  follow_up: POLICY_CLASS_WORDS.follow_up.short,
  outreach: POLICY_CLASS_WORDS.outreach.short
};
