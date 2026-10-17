import {
  asListRule,
  listRuleMatches,
  ruleLists,
  ruleNeeds,
  LIST_NEEDS
} from "./list-rules.js";
import { SELLS_BY_QUESTION, SELLS_BY_WORDS } from "../../deals/sells-by.js";
import { DEAL_STAGE_WORDS } from "../../deals/deal-words.js";
import { STOP_WORDS } from "../../consent/consent.js";
import { HELD_WORDS, NEEDS_YOU_WORD } from "../../conversations/standing.js";
const SAVED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILTIN_ID = /^[a-z_]{1,40}$/;
export function listToken(ref) {
  return ref.kind === "builtin" ? `seg:${ref.id}` : `list:${ref.id}`;
}
export function parseListToken(token) {
  if (typeof token !== "string") return null;
  const at = token.indexOf(":");
  const kind = token.slice(0, at);
  const id = token.slice(at + 1);
  if ((kind === "seg" || kind === "state") && BUILTIN_ID.test(id)) return { kind: "builtin", id };
  if (kind === "list" && SAVED_ID.test(id)) return { kind: "saved", id: id.toLowerCase() };
  return null;
}
export const PEOPLE_LIST_GROUPS = [
  { id: "attention", label: "Attention" },
  { id: "journey", label: "Journey" },
  { id: "reach", label: "Reach" }
];
export const LIST_GROUP_WORDS = { builtin: "Ready-made lists", own: "Your lists", pinned: "Pinned lists" };
const r = (...all) => ({ v: 2, all });
export const BUILTIN_LISTS = [
  {
    id: "needs_you",
    label: NEEDS_YOU_WORD,
    tip: "An open escalation, or a thread waiting for a person",
    group: "attention",
    onProfile: false,
    rule: r({ field: "standing", op: "is", value: "needs_you" })
  },
  // Yours by the one standing rule (standing.ts): you took it over, or your reply paused the receptionist.
  {
    id: "waiting_on_you",
    label: HELD_WORDS.yours.pill,
    tip: "Threads you have: you took them over, or your reply paused the receptionist. A teammate's waits on them",
    group: "attention",
    onProfile: false,
    rule: r({ field: "standing", op: "is", value: "waiting_on_you" })
  },
  // Their next step's day has come (0007, amended): every workspace, deals or not. The page says the step itself.
  {
    id: "steps_due",
    label: "Steps due",
    tip: "Their next step's day has come, or gone by \u2014 a note with a day, for the team",
    group: "attention",
    onProfile: false,
    rule: r({ field: "step_due", op: "is", yes: true })
  },
  // New by the date they first got in touch, whatever their standing: someone new who needs you is both.
  {
    id: "new_week",
    label: "New this week",
    tip: "First contact in the last 7 days, by evidence \u2014 imported history never counts",
    group: "journey",
    rule: r({ field: "first_contact", op: "within", days: 7 })
  },
  // This week, Monday to Sunday, by the workspace's clock.
  {
    id: "booked_week",
    label: "Booked this week",
    tip: "Booked this week, Monday to Sunday",
    group: "journey",
    rule: r({ field: "next_visit", op: "this_week" })
  },
  {
    id: "booked",
    label: "Booked",
    tip: "Something ahead on your calendar \u2014 the booking is the conversion",
    group: "journey",
    rule: r({ field: "booked", op: "is", yes: true })
  },
  // Reports' rule (calendar-people.ts visitAnswersAsk): asked in 30 days and nothing on the calendar answers it.
  {
    id: "asked_never_booked",
    label: "Asked, never booked",
    tip: "Wrote or called in the last 30 days, and nothing on your calendar since answers it \u2014 the people you can still win",
    group: "journey",
    rule: r({ field: "asked_not_booked", op: "is", yes: true })
  },
  // Forty-five days since the chair, nothing ahead: the win-back list, from visits rather than silence.
  {
    id: "lapsed",
    label: "Lapsed",
    tip: "Forty-five days or more since they were last on the calendar, nothing ahead \u2014 the win-back list, from the calendar rather than silence",
    group: "journey",
    rule: r({ field: "booked", op: "is", yes: false }, { field: "last_visit", op: "more_than", days: 44 })
  },
  // The journey past the booking (0004), as the Pipeline groups it (deals.ts dealStageOf).
  {
    id: "consultation_booked",
    label: "Consultations",
    tip: "A consultation coming up, or one this past week with no proposal since \u2014 the Pipeline's Consultations",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "consultation" })
  },
  {
    id: "proposal_out",
    // A stage's list says its stage's word (S9-9); Clients names the people, not the stage.
    label: DEAL_STAGE_WORDS.proposed,
    tip: "A proposal went out and is waiting on their answer",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "proposed" })
  },
  {
    id: "clients",
    label: "Clients",
    tip: "Said yes, or paid \u2014 the engagement is running",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "won" })
  },
  {
    id: "deal_passed",
    label: DEAL_STAGE_WORDS.lost,
    tip: "They passed on a proposal",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "lost" })
  },
  {
    id: "deal_ended",
    label: DEAL_STAGE_WORDS.ended,
    tip: "An engagement that ended \u2014 the win-back list for clients",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "ended" })
  },
  // Heard from them, then nothing for thirty days: someone we never heard from is not quiet, and our own sends are
  // not their word.
  {
    id: "quiet",
    label: "Quiet 30+ days",
    tip: "They haven't written or called in 30 days \u2014 your own messages don't count, and someone never heard from isn't quiet",
    group: "reach",
    rule: r({ field: "last_heard", op: "more_than", days: 30 })
  },
  {
    id: "phoned_only",
    label: "Phoned only",
    tip: "Only ever phoned \u2014 no WhatsApp thread",
    group: "reach",
    rule: r({ field: "has_chat", op: "is", yes: false }, { field: "calls", op: "at_least", n: 1 })
  },
  // TWO LISTS, BECAUSE THERE ARE TWO ANSWERS. This one is the yes to hearing from the business, which says nothing
  // about offers; the next is the promotional audience, who a marketing broadcast may reach: the yes AND a number.
  {
    id: "opted_in",
    label: "Said yes to messages",
    tip: "Said yes to messages \u2014 replies, reminders and confirmations",
    group: "reach",
    onProfile: false,
    rule: r({ field: "said_yes", op: "is", to: "messages", yes: true })
  },
  {
    id: "offers_ok",
    label: "Can receive offers",
    tip: "Said yes to OFFERS, separately, with a number to send to \u2014 the only people a promotional broadcast may reach",
    group: "reach",
    onProfile: false,
    rule: r({ field: "can_receive", op: "is", to: "offers", yes: true })
  },
  // A fact, not the state: someone who opted out AND needs you is in both lists.
  {
    id: "opted_out",
    label: STOP_WORDS.pill,
    tip: "Asked to stop; the receptionist stays silent, offers included",
    group: "reach",
    onProfile: false,
    rule: r({ field: "stopped", op: "is", yes: true })
  }
];
export const PEOPLE_LISTS = BUILTIN_LISTS.map((l) => {
  const needs = ruleNeeds(l.rule);
  return {
    ...l,
    ...needs.includes("calendar") ? { needsCalendar: true } : {},
    ...needs.includes("consult") ? { needsConsultFirst: true } : {},
    ...needs.includes("deals") ? { needsDeals: true } : {},
    ...needs.includes("viewer") ? { needsViewer: true } : {},
    test: (vm) => listRuleMatches(l.rule, vm)
  };
});
export function listAsks(id) {
  return id === "needs_you";
}
export function unmetNeed(needs, ctx) {
  const met = {
    calendar: ctx.calendar === "ok",
    consult: ctx.consultFirst,
    deals: ctx.dealsOn,
    viewer: ctx.viewer
  };
  return LIST_NEEDS.find((n) => needs.includes(n) && !met[n]) ?? null;
}
const builtinByToken = (token) => {
  const ref = parseListToken(token);
  return ref && ref.kind === "builtin" ? BUILTIN_LISTS.find((l) => l.id === ref.id) ?? null : null;
};
export function listMembers(list, rows, ctx, lookup = () => null) {
  if (list.rule == null) {
    const on = new Set(list.ids);
    return { state: "ok", ids: new Set(rows.filter((v) => on.has(v.id)).map((v) => v.id)) };
  }
  const rule = asListRule(list.rule);
  if (!rule) return { state: "unknown", reason: "rule" };
  const need = unmetNeed(ruleNeeds(rule), ctx);
  if (need) return { state: "unknown", reason: need };
  const read = /* @__PURE__ */ new Map();
  for (const token of ruleLists(rule)) {
    const b = builtinByToken(token);
    const other = b ? { rule: b.rule, ids: [], readable: true } : lookup(token);
    if (!other || !other.readable) return { state: "unknown", reason: "list" };
    if (other.rule && ruleLists(other.rule).length) return { state: "unknown", reason: "list" };
    const m = listMembers(other, rows, ctx);
    if (m.state === "unknown") return m;
    read.set(token, m.ids);
  }
  const inList = (token, id) => read.get(token)?.has(id) ?? false;
  return { state: "ok", ids: new Set(rows.filter((v) => listRuleMatches(rule, v, inList)).map((v) => v.id)) };
}
export function savedListIds(list, rows, ctx, lookup = () => null) {
  const m = listMembers(list, rows, ctx, lookup);
  return m.state === "ok" ? m.ids : /* @__PURE__ */ new Set();
}
export function savedListLookup(saved) {
  return (token) => {
    const ref = parseListToken(token);
    if (!ref || ref.kind !== "saved") return null;
    const l = saved.find((s) => s.id.toLowerCase() === ref.id);
    if (!l) return null;
    const rule = l.rule == null ? null : asListRule(l.rule);
    return { rule, ids: l.ids, readable: l.rule == null || rule !== null };
  };
}
export function listNamer(saved) {
  return (token) => {
    const ref = parseListToken(token);
    if (!ref) return null;
    return ref.kind === "builtin" ? PEOPLE_LISTS.find((l) => l.id === ref.id)?.label ?? null : saved.find((l) => l.id === ref.id)?.name ?? null;
  };
}
export function listNeeds(rule, lookup = () => null) {
  if (!rule) return [];
  const needs = new Set(ruleNeeds(rule));
  for (const token of ruleLists(rule)) {
    const b = builtinByToken(token);
    const other = b ? b.rule : lookup(token)?.rule;
    if (other) for (const n of ruleNeeds(other)) needs.add(n);
  }
  return LIST_NEEDS.filter((n) => needs.has(n));
}
function builtinDef(l) {
  const ref = { kind: "builtin", id: l.id };
  return {
    ref,
    token: listToken(ref),
    label: l.label,
    group: l.group,
    rule: l.rule,
    byHand: false,
    readable: true,
    ids: [],
    needs: ruleNeeds(l.rule),
    onProfile: l.onProfile !== false,
    archived: false
  };
}
function savedDef(l, lookup) {
  const ref = { kind: "saved", id: l.id };
  const rule = l.rule == null ? null : asListRule(l.rule);
  return {
    ref,
    token: listToken(ref),
    label: l.name,
    group: "saved",
    rule,
    byHand: l.rule == null,
    readable: l.rule == null || rule !== null,
    ids: l.rule == null ? l.ids : [],
    needs: listNeeds(rule, lookup),
    onProfile: true,
    archived: !!l.archived_at
  };
}
export function listsFor(ctx, saved) {
  const lookup = savedListLookup(saved);
  return [
    ...BUILTIN_LISTS.map(builtinDef).filter((d) => !unmetNeed(d.needs, ctx)),
    ...saved.filter((l) => !l.archived_at).map((l) => savedDef(l, lookup))
  ];
}
export function resolveList(ref, saved) {
  if (!ref) return null;
  if (ref.kind === "builtin") {
    const b = BUILTIN_LISTS.find((l2) => l2.id === ref.id);
    return b ? builtinDef(b) : null;
  }
  const l = saved.find((x) => x.id.toLowerCase() === ref.id.toLowerCase());
  return l ? savedDef(l, savedListLookup(saved)) : null;
}
export function membersOf(def, rows, ctx, saved = []) {
  if (!def.readable) return { state: "unknown", reason: "rule" };
  return listMembers(def.byHand ? { ids: def.ids } : { ids: [], rule: def.rule }, rows, ctx, savedListLookup(saved));
}
export function listUnknownWords(reason, calendar) {
  switch (reason) {
    case "calendar":
      return calendar === "none" ? "This list reads a calendar link. Add one under Settings \u203A Business to count it." : "This list reads your calendar, which can't be read right now.";
    case "consult":
      return "This list exists only where the profile lists a consult-first service under Settings \u203A Business.";
    case "deals":
      return `This list exists only where deals are on: the workspace answers \u201C${SELLS_BY_QUESTION}\u201D with \u201C${SELLS_BY_WORDS.proposal.label}\u201D.`;
    case "viewer":
      return "This list is about whoever is looking, so only a person can count it.";
    case "rule":
      return "This list's rule was written by a newer version of Chanlytics and can't be read here.";
    case "list":
      return "A list this one reads is gone, or can't be counted itself.";
  }
}
export function savedListTip(list) {
  if (list.unknown) return list.unknown;
  if (list.byHand) return "A list kept by hand \u2014 add people from their profile";
  return `Keeps itself current: ${(list.rule ?? []).join(" \xB7 ")}`;
}
export function ruleNeedsViewer(rule) {
  if (rule == null) return false;
  const r2 = asListRule(rule);
  return !!r2 && ruleNeeds(r2).includes("viewer");
}
export const viewerListWords = (name) => `${name} is about whoever is looking ("me"), and a campaign's run has no one looking. Pick a list that says who by what they did.`;
export const TODAY_PINS_MAX = 8;
export function pinTokens(view) {
  const pins = view && typeof view === "object" ? view.pins : null;
  return Array.isArray(pins) ? pins.filter((t) => typeof t === "string" && parseListToken(t) !== null).slice(0, TODAY_PINS_MAX) : [];
}
export function todayPins(view, people, counts) {
  const counted = (token, own) => counts && token in counts ? counts[token] ?? null : own;
  return pinTokens(view).flatMap((token) => {
    const ref = parseListToken(token);
    if (ref.kind === "builtin") {
      const l = people.lists.find((x) => x.id === ref.id);
      return l ? [{ token, label: l.label, count: counted(token, l.count), to: `clients/seg:${l.id}` }] : [];
    }
    const s = people.saved.find((x) => x.id.toLowerCase() === ref.id);
    return s ? [{ token, label: s.name, count: counted(token, s.unknown ? null : s.count), to: `clients/list:${s.id}` }] : [];
  });
}
export function togglePin(view, token) {
  const pins = pinTokens(view);
  const t = token.toLowerCase();
  if (pins.some((p) => p.toLowerCase() === t)) return { pins: pins.filter((p) => p.toLowerCase() !== t) };
  return pins.length < TODAY_PINS_MAX ? { pins: [...pins, token] } : null;
}
