/**
 * One idea of a list (decision 0009): the built-in lists are rules in the owner's own language, judged over facts the
 * row works out once. This file is the proof the note promised.
 *
 * PARITY. Every built-in, its closure as it stood at 966edb3b (spelled out below, over the row as it was then read)
 * against its rule, over two thousand seeded people. Every difference is one the note names -- Quiet, New this week,
 * Waiting on you and Booked this week as Ruben approved them, Asked-never-booked on Reports' rule, the consent lists on
 * the consent rule, the deal lists as the Pipeline groups them, and the move from 24-hour blocks to the workspace's
 * dates -- or the test fails and prints the person.
 *
 * PROPERTIES. Over the same people: never and ever split everyone; a condition added never grows a list; an "any"
 * group is the union of its facts; a list is unknown exactly when its context cannot meet what it needs; a version 1
 * rule means what it meant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const {
  PEOPLE_LISTS,
  listMembers,
  listRuleMatches,
  asListRule,
  ruleNeeds,
  unmetNeed,
  personStanding,
  replyWaitsOnYou,
  mayReceive,
  stepIsDue,
  toPersonRowVM,
  pipelineOf,
  localDaysBetween,
} = contracts;

const TZ = "America/New_York";
// A Thursday: this week runs Monday the 21st to Sunday the 27th, so the next seven days cross into the next week.
const NOW = Date.parse("2026-09-24T16:00:00.000Z");
const D = 86_400_000;
const H = 3_600_000;
const ME = "user-me";
const MATE = "user-mate";

/* ------------------------------------------------------------------ a seeded population */

// mulberry32: small, seeded, and the same people on every run.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function population(n, seed = 9) {
  const rnd = prng(seed);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const maybe = (p) => rnd() < p;
  // Days ago, with the hours that put a moment either side of a 24-hour boundary and a local midnight.
  const ago = (maxDays) => new Date(NOW - Math.floor(rnd() * maxDays * D) - Math.floor(rnd() * 24) * H).toISOString();
  const ahead = (maxDays) => new Date(NOW + Math.floor(rnd() * maxDays * D) + Math.floor(rnd() * 24) * H).toISOString();
  const visit = (start, consultation) => ({
    id: `v${Math.floor(rnd() * 1e6)}`,
    start,
    end: new Date(Date.parse(start) + H).toISOString(),
    title: consultation ? "Consultation" : "Cut",
    all_day: false,
    via: "phone",
    consultation,
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const inbound = maybe(0.8) ? ago(80) : null;
    const ourSend = maybe(0.4) ? ago(40) : null;
    const lastMessage = [inbound, ourSend].filter(Boolean).sort().at(-1) ?? null;
    const inboundCall = maybe(0.25) ? ago(80) : null;
    const ourCall = maybe(0.15) ? ago(80) : null;
    const lastCall = [inboundCall, ourCall].filter(Boolean).sort().at(-1) ?? null;
    const backfill = maybe(0.1);
    const firstAt = maybe(0.9) ? ago(20) : null;
    const assignee = pick([null, null, null, ME, MATE]);
    const stage = pick([null, null, null, "proposed", "won", "lost", "ended"]);
    const next = maybe(0.35) ? visit(ahead(14), maybe(0.2)) : null;
    const last = maybe(0.45) ? visit(ago(90), maybe(0.2)) : null;
    const due = maybe(0.2) ? new Date(NOW + (Math.floor(rnd() * 7) - 3) * D).toISOString().slice(0, 10) : null;
    out.push({
      id: `p${i}`,
      display_name: `Person ${i}`,
      wa_profile_name: null,
      phone_e164: maybe(0.9) ? `+1305555${String(1000 + i).slice(-4)}` : null,
      email: null,
      consent: pick(["opted_in", "opted_in", "unknown", "opted_out"]),
      consent_source: null,
      marketing_consent: pick(["opted_in", "unknown", "unknown", "opted_out"]),
      marketing_consent_source: null,
      marketing_consent_updated_at: null,
      consent_updated_at: null,
      dnc: maybe(0.05),
      channels: ["whatsapp"],
      conversation_count: Math.floor(rnd() * 3),
      escalation_count: 0,
      needs_human: maybe(0.1),
      open_escalation_reason: maybe(0.15) ? "human_token" : null,
      open_escalation_since: null,
      latest_conversation_id: null,
      latest_state: pick(["open", "open", "snoozed", "needs_human"]),
      latest_paused_until: maybe(0.15) ? new Date(NOW + 2 * H).toISOString() : null,
      latest_assignee_user_id: assignee,
      latest_snooze_until: null,
      latest_wa_inbound_at: inbound,
      last_message_at: lastMessage,
      last_message_direction: lastMessage ? (lastMessage === inbound ? "inbound" : "outbound") : null,
      last_message_sender: lastMessage && lastMessage !== inbound ? "human" : null,
      last_inbound_text: null,
      last_inbound_at: inbound,
      last_call_at: lastCall,
      last_inbound_call_at: inboundCall,
      call_count: lastCall ? 1 + Math.floor(rnd() * 3) : 0,
      call_seconds: 0,
      first_contact_at: firstAt,
      earliest_row_at: firstAt ?? (maybe(0.5) ? ago(200) : null),
      has_backfill: backfill,
      has_chat: !!lastMessage || maybe(0.1),
      message_channels: lastMessage ? ["whatsapp"] : [],
      queued_reply_at: maybe(0.05) ? new Date(NOW - H).toISOString() : null,
      came_from: pick(["whatsapp", "call", "lead", "calendar", "manual"]),
      visits: { timezone: TZ, source: "Google Calendar", state: "ok", next, last },
      deal_id: stage ? `d${i}` : null,
      deal_stage: stage,
      deal_service: stage ? "Consulting" : null,
      deal_proposed_at: stage ? ago(40) : null,
      deal_decided_at: stage === "won" || stage === "lost" ? ago(10) : null,
      deal_ended_at: stage === "ended" ? ago(5) : null,
      deal_amount_cents: null,
      deal_per: null,
      step_id: due ? `s${i}` : null,
      step_body: due ? "Call back" : null,
      step_due_on: due,
      step_for_user_id: null,
      step_deal_id: null,
    });
  }
  return out;
}

const DTOS = population(2000);
const ROWS = DTOS.map((r) => toPersonRowVM(r, TZ, new Date(NOW), ME));
const BY_ID = new Map(DTOS.map((r) => [r.id, r]));
const CTX = { calendar: "ok", dealsOn: true, consultFirst: true, viewer: true };

/* ------------------------------------------------------------------ the lists as they stood at 966edb3b */

const ts = (iso) => (iso ? Date.parse(iso) : null);
const lastContactTs = (r) => {
  const m = ts(r.last_message_at);
  const k = ts(r.last_call_at);
  return m === null ? k : k === null ? m : Math.max(m, k);
};
const heardTs = (r) => {
  const at = [ts(r.last_inbound_at), ts(r.last_inbound_call_at)].filter((x) => x !== null);
  return at.length ? Math.max(...at) : null;
};

/** The row's pill as people.ts spelled it at 966edb3b: no viewer, a 24-hour clock, any contact either way. */
function oldState(r) {
  const v = personStanding(r, NOW);
  const owned = !!r.latest_assignee_user_id || v.takenOver;
  if (v.standing === "needs_you" || replyWaitsOnYou({ queued: !!r.queued_reply_at }, NOW)) return "needs_you";
  if (owned && (v.flagged || r.last_message_direction === "inbound")) return "waiting_on_you";
  if (r.consent === "opted_out" || r.dnc) return "opted_out";
  const first = ts(r.first_contact_at);
  if (!r.has_backfill && first !== null && NOW - first <= 7 * D) return "new";
  const last = lastContactTs(r);
  if (last === null || NOW - last > 30 * D) return "quiet";
  return "active";
}

/** What the old closures read that the row no longer carries in that form. */
function old(r) {
  const next = ts(r.visits?.next?.start);
  const last = ts(r.visits?.last?.start);
  const asked = heardTs(r);
  return {
    state: oldState(r),
    nextVisitDays: next !== null ? Math.max(0, Math.ceil((next - NOW) / D)) : null,
    lastVisitDays: last !== null ? Math.max(0, Math.floor((NOW - last) / D)) : null,
    askedNotBooked: asked !== null && NOW - asked <= 30 * D && next === null && last === null,
  };
}

/** Each built-in's closure at 966edb3b, over the old reading (o) and the row (v) for what did not change. */
const OLD = {
  needs_you: (o) => o.state === "needs_you",
  waiting_on_you: (o) => o.state === "waiting_on_you",
  steps_due: (o, v) => stepIsDue(v.nextStep),
  new_week: (o) => o.state === "new",
  booked_week: (o) => o.nextVisitDays !== null && o.nextVisitDays <= 7,
  booked: (o, v) => v.booked,
  asked_never_booked: (o) => o.askedNotBooked,
  lapsed: (o, v) => !v.booked && o.lastVisitDays !== null && o.lastVisitDays >= 45,
  consultation_booked: (o, v) => v.consultationVisit && !v.deal,
  proposal_out: (o, v) => v.deal?.stage === "proposed",
  clients: (o, v) => v.deal?.stage === "won",
  deal_ended: (o, v) => v.deal?.stage === "ended",
  quiet: (o) => o.state === "quiet",
  phoned_only: (o, v) => !v.hasChat && v.calls > 0,
  opted_in: (o, v) => v.consent.state === "opted_in",
  offers_ok: (o, v) => mayReceive(v, "marketing"),
  opted_out: (o, v) => v.consent.state === "opted_out",
};

const localDays = (at) => localDaysBetween(at, NOW, TZ);

/**
 * The differences the note names, one reason per list: a difference that is not one of these fails. Each returns the
 * reason in words, or null when it cannot explain the difference.
 */
const APPROVED = {
  // Call 1: a teammate's thread is theirs.
  waiting_on_you: (r) => (r.latest_assignee_user_id === MATE ? "a teammate has the thread" : null),
  // Call 1: whatever the standing; and the workspace's dates, and a first contact on the row's earliest line.
  new_week: (r, o) => {
    if (["needs_you", "waiting_on_you", "opted_out"].includes(o.state)) return "new whatever the standing";
    const first = ts(r.first_contact_at);
    if (first === null) return "first contact from the earliest row";
    if (NOW - first <= 7 * D !== localDays(first) <= 7) return "the workspace's dates";
    return null;
  },
  // Call 1: Monday to Sunday.
  booked_week: (r) => (r.visits?.next ? "this week, Monday to Sunday" : null),
  // Reports' rule: a visit before they asked does not answer it.
  asked_never_booked: (r) => {
    const last = ts(r.visits?.last?.start);
    const asked = heardTs(r);
    return !r.visits?.next && last !== null && asked !== null && last < asked - D ? "a visit before they asked" : null;
  },
  // The workspace's dates.
  lapsed: (r) => {
    const last = ts(r.visits?.last?.start);
    return last !== null && Math.floor((NOW - last) / D) >= 45 !== localDays(last) > 44
      ? "the workspace's dates"
      : null;
  },
  // The Pipeline's group.
  consultation_booked: () => "the Pipeline's Consultations",
  deal_ended: (r, o, v) => (v.dealStage === "consultation" ? "a consultation ahead begins something new" : null),
  // Call 1: never heard from is not quiet, our sends are not their word; and the pill's order no longer hides a fact.
  quiet: (r, o) => {
    const heard = heardTs(r);
    if (heard === null) return "never heard from";
    if (["needs_you", "waiting_on_you", "opted_out", "new"].includes(o.state)) return "quiet whatever the standing";
    if (lastContactTs(r) !== heard) return "our own sends are not their word";
    if (NOW - heard > 30 * D !== localDays(heard) > 30) return "the workspace's dates";
    return null;
  },
  // The consent rule: a do-not-contact is a stop.
  opted_in: (r) => (r.dnc ? "a do-not-contact is not a yes" : null),
  opted_out: (r) => (r.dnc ? "a do-not-contact is a stop" : null),
};

test("parity: every built-in, its old closure against its rule, differs only where the decision note says", () => {
  const unexplained = [];
  const differed = {};
  for (const list of PEOPLE_LISTS) {
    const was = OLD[list.id];
    if (!was) continue; // Passed is new: it has no old closure to agree with.
    for (const v of ROWS) {
      const r = BY_ID.get(v.id);
      const o = old(r);
      const before = !!was(o, v);
      const now = !!list.test(v);
      if (before === now) continue;
      const why = APPROVED[list.id]?.(r, o, v) ?? null;
      if (why) differed[list.id] = (differed[list.id] ?? 0) + 1;
      else unexplained.push(`${list.id} · ${v.id}: was ${before}, is ${now}`);
    }
  }
  assert.deepEqual(unexplained.slice(0, 20), [], `${unexplained.length} differences the note does not name`);
  // The approved changes did change something: a parity test that saw no difference would prove nothing.
  for (const id of ["waiting_on_you", "new_week", "booked_week", "asked_never_booked", "quiet", "consultation_booked"])
    assert.ok(differed[id] > 0, `${id} moved as approved`);
});

test("the pill says the lists' own facts: Needs you and Waiting on you are the lists, New and Quiet are on theirs", () => {
  const on = (id) => new Set(ROWS.filter(PEOPLE_LISTS.find((l) => l.id === id).test).map((v) => v.id));
  const needs = on("needs_you");
  const waiting = on("waiting_on_you");
  const fresh = on("new_week");
  const quiet = on("quiet");
  for (const v of ROWS) {
    assert.equal(v.state === "needs_you", needs.has(v.id), `${v.id} needs you`);
    assert.equal(v.state === "waiting_on_you", waiting.has(v.id), `${v.id} waits on you`);
    if (v.state === "new") assert.ok(fresh.has(v.id), `${v.id} is new and on New this week`);
    if (v.state === "quiet") assert.ok(quiet.has(v.id), `${v.id} is quiet and on Quiet 30+ days`);
    if (v.state === "unheard") assert.ok(!quiet.has(v.id), `${v.id} was never heard from, so is not quiet`);
  }
  assert.ok(
    ROWS.some((v) => v.state === "unheard"),
    "the population has people never heard from",
  );
});

test("the deal lists are the Pipeline's own groups: one rule, one set of people", () => {
  const vm = pipelineOf(ROWS, NOW, TZ, null);
  const inGroup = (key) => new Set((vm.groups.find((g) => g.key === key)?.rows ?? []).map((row) => row.person.id));
  const onList = (id) => new Set(ROWS.filter(PEOPLE_LISTS.find((l) => l.id === id).test).map((v) => v.id));
  const same = (a, b) => [...a].sort().join() === [...b].sort().join();
  assert.ok(same(inGroup("consultations"), onList("consultation_booked")), "Consultations");
  assert.ok(same(inGroup("proposals"), onList("proposal_out")), "Proposals");
  assert.ok(same(inGroup("clients"), onList("clients")), "Clients");
  assert.ok(same(inGroup("closed"), new Set([...onList("deal_passed"), ...onList("deal_ended")])), "Passed or ended");
  assert.ok(onList("deal_passed").size > 0 && inGroup("consultations").size > 0, "the population fills them");
});

/* ------------------------------------------------------------------ properties */

const DAY_FIELDS = ["last_visit", "next_visit", "last_heard", "first_contact"];

test("never and ever split everyone, for every day fact", () => {
  for (const field of DAY_FIELDS) {
    for (const v of ROWS) {
      const never = listRuleMatches(asListRule({ all: [{ field, op: "never" }] }), v);
      const ever = listRuleMatches(asListRule({ all: [{ field, op: "ever" }] }), v);
      assert.notEqual(never, ever, `${field} · ${v.id}`);
    }
  }
});

/** A fact drawn at random from the vocabulary, as an owner could write it. */
function randomFact(rnd) {
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const days = 1 + Math.floor(rnd() * 90);
  return pick([
    () => ({ field: pick(DAY_FIELDS), op: pick(["more_than", "within"]), days }),
    () => ({ field: pick(DAY_FIELDS), op: pick(["never", "ever"]) }),
    () => ({ field: "next_visit", op: "this_week" }),
    () => ({
      field: pick(["booked", "asked_not_booked", "has_chat", "stopped", "consultation", "step_due"]),
      op: "is",
      yes: rnd() < 0.5,
    }),
    () => ({ field: "channel", op: pick(["is", "is_not"]), channel: pick(["whatsapp", "sms", "voice", "email"]) }),
    () => ({ field: "came_from", op: pick(["is", "is_not"]), from: pick(["whatsapp", "call", "lead", "calendar"]) }),
    () => ({ field: pick(["calls", "conversations"]), op: pick(["at_least", "at_most"]), n: Math.floor(rnd() * 3) }),
    () => ({ field: pick(["said_yes", "can_receive"]), op: "is", to: pick(["offers", "messages"]), yes: rnd() < 0.5 }),
    () => ({ field: "standing", op: pick(["is", "is_not"]), value: pick(["needs_you", "waiting_on_you"]) }),
    () => ({ field: "assigned", op: pick(["is", "is_not"]), value: pick(["me", "teammate", "nobody"]) }),
    () => ({
      field: "deal_stage",
      op: pick(["is", "is_not"]),
      value: pick(["consultation", "proposed", "won", "lost", "ended"]),
    }),
  ])();
}

const members = (rule, ctx = CTX) => {
  const m = listMembers({ ids: [], rule }, ROWS, ctx);
  return m.state === "ok" ? m.ids : null;
};

test("a condition added never grows a list, and an any group is the union of its facts", () => {
  const rnd = prng(42);
  for (let i = 0; i < 200; i++) {
    const a = randomFact(rnd);
    const b = randomFact(rnd);
    const one = members(asListRule({ all: [a] }));
    const two = members(asListRule({ all: [a, b] }));
    for (const id of two) assert.ok(one.has(id), `${JSON.stringify(b)} grew ${JSON.stringify(a)}`);
    const either = members(asListRule({ all: [{ any: [a, b] }] }));
    const union = new Set([...one, ...members(asListRule({ all: [b] }))]);
    assert.deepEqual([...either].sort(), [...union].sort(), `any of ${JSON.stringify([a, b])}`);
  }
});

test("a list is unknown exactly when its context cannot meet what it needs", () => {
  const rnd = prng(7);
  const contexts = [
    CTX,
    { ...CTX, calendar: "unavailable" },
    { ...CTX, calendar: "none" },
    { ...CTX, dealsOn: false },
    { ...CTX, consultFirst: false },
    { ...CTX, viewer: false },
  ];
  for (let i = 0; i < 200; i++) {
    const rule = asListRule({ all: [randomFact(rnd), randomFact(rnd)] });
    for (const ctx of contexts) {
      const m = listMembers({ ids: [], rule }, ROWS, ctx);
      const need = unmetNeed(ruleNeeds(rule), ctx);
      assert.equal(m.state === "unknown", need !== null, JSON.stringify({ rule, ctx }));
      if (need) assert.equal(m.reason, need);
    }
  }
});

test("a version 1 rule means what it meant: its fields read the same, and offers_yes is said yes to offers", () => {
  const v1 = {
    all: [
      { field: "offers_yes", op: "is", yes: true },
      { field: "calls", op: "at_least", n: 1 },
    ],
  };
  const v2 = asListRule(v1);
  assert.deepEqual(v2, {
    v: 2,
    all: [
      { field: "said_yes", op: "is", to: "offers", yes: true },
      { field: "calls", op: "at_least", n: 1 },
    ],
  });
  for (const v of ROWS) assert.equal(listRuleMatches(v2, v), v.saidYes.offers && v.calls >= 1, `${v.id}`);
  assert.deepEqual(asListRule(v2), v2, "a version 2 rule reads as itself");
});
