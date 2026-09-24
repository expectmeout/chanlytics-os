/**
 * Lists that keep themselves current, and playbooks that run on a list (00155).
 *
 * A list kept by hand is a name and the people put on it. A smart list is a name and a rule in a vocabulary the
 * person's row can answer (contracts list-rules.ts): drafted by the assistant from the owner's own words, shown back
 * as chips with who it holds for, and judged on every read by one function (savedListIds) -- the People rail, a
 * broadcast's send, a playbook's run on the edge and the Playbooks page's count. A playbook may run on one of the
 * workspace's lists, and on People's Lapsed list, the win-back by visits that had no playbook of its own.
 *
 * Run against contracts, the run in core, the routes over a database in memory, and the edge's loader.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as contracts from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const {
  asListRule,
  listMembers,
  listRuleMatches,
  listRuleParts,
  listUnknownWords,
  ruleNeeds,
  savedListIds,
  savedListLookup,
  playbookRunReach,
  triggerOf,
  LIST_RULE_FIELDS,
  LIST_DRAFT_JSON_SCHEMA,
} = contracts;

const NOW = Date.parse("2026-09-20T15:00:00Z");
const D = 86_400_000;

/**
 * A person as the People page reads them, with the facts a rule may name: each worked out once when the row is built
 * (people.ts toPersonRowVM), in the workspace's own dates, so a rule needs no clock (decision 0009).
 */
const vm = (id, over = {}) => ({
  id,
  channels: ["whatsapp"],
  cameFrom: null,
  calls: 0,
  threads: 1,
  hasChat: true,
  booked: false,
  askedNotBooked: false,
  lastVisitDays: null,
  nextVisitDays: null,
  nextVisitThisWeek: false,
  heardDays: 3,
  firstDays: 60,
  lastContact: { ts: NOW - 3 * D },
  firstContact: { ts: NOW - 60 * D, evidence: true },
  phone: `+1305555${id.padStart(4, "0")}`,
  state: "active",
  standing: null,
  assigned: "nobody",
  dealStage: null,
  consultationVisit: false,
  stepDue: false,
  consent: { state: "opted_in", marketing: "opted_in", dnc: false },
  saidYes: { offers: true, messages: true },
  canReceive: { offers: true, messages: true },
  stopped: false,
  ...over,
});
const rule = (...all) => ({ all });
/** What a workspace and a reader give a list: here, everything. */
const ALL = { calendar: "ok", dealsOn: true, consultFirst: true, viewer: true };

/* ----------------------------------------- the vocabulary ----------------------------------------- */

test("a rule holds over the facts a row carries: a visit's days, when they were heard from, their wires, where they came from, their counts, their yes", () => {
  const lapsed = vm("1", { lastVisitDays: 60 });
  const recent = vm("2", { lastVisitDays: 10 });
  const never = vm("3");
  const r = rule({ field: "last_visit", op: "more_than", days: 45 });
  assert.deepEqual(
    [lapsed, recent, never].map((v) => listRuleMatches(r, v)),
    [true, false, false],
    "a person with no visit is not 'more than 45 days' from one",
  );
  assert.equal(listRuleMatches(rule({ field: "last_visit", op: "within", days: 14 }), recent), true);
  // Never and ever: the absence of a moment is a fact of its own (decision 0009).
  assert.deepEqual(
    [lapsed, never].map((v) => listRuleMatches(rule({ field: "last_visit", op: "never" }), v)),
    [false, true],
  );
  assert.deepEqual(
    [lapsed, never].map((v) => listRuleMatches(rule({ field: "last_visit", op: "ever" }), v)),
    [true, false],
  );
  // Last heard from is THEIR word: the days since they wrote or called (heardDays), never our own send.
  assert.equal(
    listRuleMatches(rule({ field: "last_heard", op: "more_than", days: 30 }), vm("4", { heardDays: 40 })),
    true,
  );
  assert.equal(
    listRuleMatches(rule({ field: "last_heard", op: "more_than", days: 30 }), vm("5", { heardDays: null })),
    false,
    "never heard from is not quiet",
  );
  assert.equal(listRuleMatches(rule({ field: "last_heard", op: "never" }), vm("5", { heardDays: null })), true);
  // First contact within N days only on a real date: an import's floor says it was earlier.
  const fresh = vm("6", { firstDays: 2, firstContact: { ts: NOW - 2 * D, evidence: true } });
  const floor = vm("6b", { firstDays: 2, firstContact: { ts: NOW - 2 * D, evidence: false } });
  assert.equal(listRuleMatches(rule({ field: "first_contact", op: "within", days: 7 }), fresh), true);
  assert.equal(listRuleMatches(rule({ field: "first_contact", op: "within", days: 7 }), floor), false);
  // The next visit this week: Monday to Sunday, by the workspace's clock (the row says it).
  assert.equal(
    listRuleMatches(rule({ field: "next_visit", op: "this_week" }), vm("6c", { nextVisitThisWeek: true })),
    true,
  );
  const sms = vm("7", { channels: ["sms", "voice"] });
  assert.equal(listRuleMatches(rule({ field: "channel", op: "is", channel: "sms" }), sms), true);
  assert.equal(listRuleMatches(rule({ field: "channel", op: "is_not", channel: "whatsapp" }), sms), true);
  const lead = vm("8", { cameFrom: { key: "lead", label: "A lead you found" } });
  assert.equal(listRuleMatches(rule({ field: "came_from", op: "is", from: "lead" }), lead), true);
  assert.equal(listRuleMatches(rule({ field: "came_from", op: "is_not", from: "lead" }), vm("9")), true);
  assert.equal(listRuleMatches(rule({ field: "calls", op: "at_least", n: 2 }), vm("10", { calls: 3 })), true);
  assert.equal(listRuleMatches(rule({ field: "conversations", op: "at_most", n: 0 }), vm("11", { threads: 1 })), false);
  // Version 1's offers_yes reads as said yes to offers: the consent rule's own answer (saidYesTo).
  assert.equal(
    listRuleMatches(
      asListRule(rule({ field: "offers_yes", op: "is", yes: false })),
      vm("12", { saidYes: { offers: false, messages: true } }),
    ),
    true,
  );
  assert.equal(listRuleMatches(rule({ field: "booked", op: "is", yes: true }), vm("13", { booked: true })), true);
  // The facts the built-ins are written in.
  const waiting = vm("16", { standing: "waiting_on_you", assigned: "me" });
  assert.equal(listRuleMatches(rule({ field: "standing", op: "is", value: "waiting_on_you" }), waiting), true);
  assert.equal(listRuleMatches(rule({ field: "assigned", op: "is_not", value: "teammate" }), waiting), true);
  assert.equal(
    listRuleMatches(rule({ field: "deal_stage", op: "is", value: "lost" }), vm("17", { dealStage: "lost" })),
    true,
  );
  assert.equal(listRuleMatches(rule({ field: "can_receive", op: "is", to: "offers", yes: true }), vm("18")), true);
  assert.equal(listRuleMatches(rule({ field: "stopped", op: "is", yes: true }), vm("19", { stopped: true })), true);
  assert.equal(listRuleMatches(rule({ field: "step_due", op: "is", yes: true }), vm("20", { stepDue: true })), true);
  assert.equal(listRuleMatches(rule({ field: "has_chat", op: "is", yes: false }), vm("21", { hasChat: false })), true);
  // Every condition must hold; an "any" group when one of its facts does.
  const both = rule({ field: "last_visit", op: "more_than", days: 45 }, { field: "channel", op: "is", channel: "sms" });
  assert.equal(listRuleMatches(both, vm("14", { lastVisitDays: 60, channels: ["sms"] })), true);
  assert.equal(listRuleMatches(both, vm("15", { lastVisitDays: 60 })), false);
  const either = rule({
    any: [
      { field: "channel", op: "is", channel: "sms" },
      { field: "channel", op: "is", channel: "email" },
    ],
  });
  assert.deepEqual(
    [vm("22", { channels: ["sms"] }), vm("23", { channels: ["email"] }), vm("24")].map((v) =>
      listRuleMatches(either, v),
    ),
    [true, true, false],
  );
});

test("a rule is read strictly and said in the page's words; what it needs comes from its facts", () => {
  assert.equal(asListRule({ all: [] }), null, "a list of everyone is Everyone, not a rule");
  assert.equal(asListRule({ all: [{ field: "stylist", op: "is" }] }), null, "no field the row cannot answer");
  assert.equal(asListRule({ all: [{ field: "last_visit", op: "more_than", days: 0 }] }), null);
  assert.equal(asListRule({ all: [{ field: "last_visit", op: "more_than" }] }), null, "more than how many days");
  assert.equal(
    asListRule({ all: [{ field: "last_visit", op: "this_week" }] }),
    null,
    "only the next visit is this week",
  );
  assert.equal(asListRule({ all: [{ any: [{ field: "booked", op: "is", yes: true }] }] }), null, "an any of one");
  assert.equal(asListRule("anything"), null);
  const r = asListRule({
    all: [
      { field: "last_visit", op: "more_than", days: 60 },
      { field: "channel", op: "is", channel: "sms" },
      { field: "offers_yes", op: "is", yes: true },
      { field: "calls", op: "at_least", n: 1 },
    ],
  });
  assert.equal(r.v, 2, "read as version 2");
  assert.deepEqual(r.all[2], { field: "said_yes", op: "is", to: "offers", yes: true }, "v1's offers_yes, upgraded");
  assert.deepEqual(listRuleParts(r), [
    "Last visit more than 60 days ago",
    "Reaches you by Text",
    "Said yes to offers",
    "At least 1 call",
  ]);
  assert.deepEqual(
    listRuleParts(
      asListRule(
        rule(
          { field: "last_heard", op: "never" },
          {
            any: [
              { field: "channel", op: "is", channel: "sms" },
              { field: "channel", op: "is", channel: "email" },
            ],
          },
        ),
      ),
    ),
    ["Never heard from", "Reaches you by Text, or Reaches you by Email"],
  );
  assert.deepEqual(ruleNeeds(r), ["calendar"]);
  assert.deepEqual(ruleNeeds(rule({ field: "channel", op: "is", channel: "sms" })), []);
  assert.deepEqual(ruleNeeds(rule({ field: "deal_stage", op: "is", value: "consultation" })), [
    "calendar",
    "consult",
    "deals",
  ]);
  assert.deepEqual(ruleNeeds(rule({ field: "standing", op: "is", value: "waiting_on_you" })), ["viewer"]);
  assert.deepEqual(
    ruleNeeds(rule({ field: "assigned", op: "is", value: "nobody" })),
    [],
    "nobody needs no one looking",
  );
  assert.deepEqual(
    LIST_DRAFT_JSON_SCHEMA.properties.all.items.properties.field.enum,
    LIST_RULE_FIELDS.map((f) => f.id).filter((id) => id !== "in_list"),
    "the model is offered exactly the fields a rule may name, and never another list",
  );
});

test("who is on a list: the ids kept on it, or who its rule holds for today; unknown, with its reason, when it can't be counted", () => {
  const rows = [vm("1", { lastVisitDays: 60 }), vm("2", { lastVisitDays: 5 }), vm("3", { channels: ["sms"] })];
  assert.deepEqual(
    [...savedListIds({ ids: ["2", "9"], rule: null }, rows, ALL)],
    ["2"],
    "kept by hand: its ids that are people here (an erased person never counts)",
  );
  const lapsed = rule({ field: "last_visit", op: "more_than", days: 45 });
  assert.deepEqual([...savedListIds({ ids: [], rule: lapsed }, rows, ALL)], ["1"]);
  // Can't tell is not nobody (decision 0009): the judge says why, and only a reader that enrols reads it as nobody.
  const noCalendar = { ...ALL, calendar: "unavailable" };
  assert.deepEqual(listMembers({ ids: [], rule: lapsed }, rows, noCalendar), { state: "unknown", reason: "calendar" });
  assert.deepEqual([...savedListIds({ ids: [], rule: lapsed }, rows, noCalendar)], [], "the send enrols nobody");
  assert.match(listUnknownWords("calendar", "unavailable"), /can't be read right now/);
  assert.match(listUnknownWords("calendar", "none"), /Connect it/);
  assert.deepEqual(
    [...savedListIds({ ids: [], rule: rule({ field: "channel", op: "is", channel: "sms" }) }, rows, noCalendar)],
    ["3"],
    "a rule that reads no calendar needs none",
  );
  assert.deepEqual(listMembers({ ids: ["1"], rule: { all: "nope" } }, rows, ALL), { state: "unknown", reason: "rule" });
  const mine = rule({ field: "assigned", op: "is", value: "me" });
  assert.deepEqual(listMembers({ ids: [], rule: mine }, rows, { ...ALL, viewer: false }), {
    state: "unknown",
    reason: "viewer",
  });
  assert.deepEqual(
    listMembers({ ids: [], rule: rule({ field: "deal_stage", op: "is", value: "won" }) }, rows, {
      ...ALL,
      dealsOn: false,
    }),
    {
      state: "unknown",
      reason: "deals",
    },
  );
  // A list may read another, one level deep: a built-in, or a saved list whose rule reads none.
  const VIP = "11111111-1111-4111-8111-111111111111";
  const saved = [{ id: VIP, name: "VIPs", ids: ["1", "3"], rule: null }];
  const onVip = rule(
    { field: "in_list", op: "is", list: `list:${VIP}` },
    { field: "channel", op: "is", channel: "sms" },
  );
  assert.deepEqual([...savedListIds({ ids: [], rule: onVip }, rows, ALL, savedListLookup(saved))], ["3"]);
  assert.deepEqual(listMembers({ ids: [], rule: onVip }, rows, ALL), { state: "unknown", reason: "list" }, "gone");
  const onLapsed = rule({ field: "in_list", op: "is_not", list: "seg:lapsed" });
  assert.deepEqual([...savedListIds({ ids: [], rule: onLapsed }, rows, ALL)].sort(), ["2", "3"]);
  const deep = [{ id: VIP, name: "VIPs", ids: [], rule: onLapsed }];
  assert.deepEqual(
    listMembers({ ids: [], rule: onVip }, rows, ALL, savedListLookup(deep)),
    { state: "unknown", reason: "list" },
    "a list that reads a list that reads a list is never a guess",
  );
});

test("a stored rule is read strictly: a part, a version or a shape this build does not read is a list it cannot count, never a broader one", () => {
  const { draftListRule } = contracts;
  const booked = { field: "booked", op: "is", yes: true };
  const stopped = { field: "stopped", op: "is", yes: true };
  assert.equal(asListRule({ v: 3, all: [booked] }), null, "a version this build does not read");
  assert.equal(asListRule({ all: [booked], none: [stopped] }), null, "a part it does not know");
  assert.equal(
    asListRule({ all: [{ field: "last_visit", op: "within", days: 30, service: "balayage" }] }),
    null,
    "a fact that says more than its field",
  );
  assert.equal(
    asListRule({ all: [{ any: [booked, stopped], field: "calls", op: "at_least", n: 1 }] }),
    null,
    "a condition that is both a fact and an any group",
  );
  // The model's draft is cut down to what each field reads first (every property of its schema is optional).
  assert.deepEqual(draftListRule([{ field: "booked", op: "is", yes: true, days: null, channel: "sms" }]), {
    v: 2,
    all: [booked],
  });
  assert.deepEqual(
    draftListRule([
      {
        any: [
          { field: "channel", op: "is", channel: "sms", n: 0 },
          { field: "channel", op: "is", channel: "email" },
        ],
      },
    ]),
    {
      v: 2,
      all: [
        {
          any: [
            { field: "channel", op: "is", channel: "sms" },
            { field: "channel", op: "is", channel: "email" },
          ],
        },
      ],
    },
  );
});

test("a list that reads a list whose rule can't be read cannot be counted either: never counted as a list kept by hand", () => {
  const rows = [vm("1"), vm("2")];
  const B = "22222222-2222-4222-8222-222222222222";
  const saved = [{ id: B, name: "Future", ids: [], rule: { v: 3, all: [{ field: "future_fact", op: "is" }] } }];
  for (const op of ["is", "is_not"]) {
    assert.deepEqual(
      listMembers(
        { ids: [], rule: rule({ field: "in_list", op, list: `list:${B}` }) },
        rows,
        ALL,
        savedListLookup(saved),
      ),
      { state: "unknown", reason: "list" },
      `in_list ${op}`,
    );
  }
});

/* ---------------------------------------- playbooks on a list ---------------------------------------- */

test("a playbook on a list runs on who is on it; the Lapsed moment runs on People's Lapsed list", () => {
  const rows = [vm("1"), vm("2"), vm("3")];
  const touches = { byThis: new Map(), byAny: new Map() };
  const p = { trigger: "saved_list", cap_per_run: 25, gap_days: 90, cadence_days: 30 };
  const drawn = playbookRunReach(rows, p, touches, NOW, null, new Set(["1", "3"]));
  assert.deepEqual(drawn.eligible.map((r) => r.id).sort(), ["1", "3"]);
  assert.equal(drawn.reach.pool, 2);
  assert.equal(playbookRunReach(rows, p, touches, NOW, null, null).reach.pool, 0, "no list, nobody");
  const lapsedRows = [
    vm("a", { lastVisitDays: 60 }),
    vm("b", { lastVisitDays: 60, booked: true }),
    vm("c", { lastVisitDays: 10 }),
  ];
  const lapsed = playbookRunReach(lapsedRows, { ...p, trigger: "lapsed" }, touches, NOW, null);
  assert.deepEqual(
    lapsed.eligible.map((r) => r.id),
    ["a"],
    "45 days since the chair, nothing booked",
  );
  assert.equal(triggerOf("lapsed").label, "Lapsed");
  assert.equal(
    contracts.starterForTrigger("lapsed")?.name,
    "winback_offer",
    "the win-back's words, already about a visit",
  );
  assert.equal(contracts.starterForTrigger("saved_list"), null, "a list's message is the owner's choice");
});

const { runPlaybook } = await import(at("packages/core/src/campaigns/run-playbook.ts"));
const { checkPlaybook } = await import(at("packages/core/src/campaigns/check-playbook.ts"));

function runPorts() {
  const log = [];
  const answer = { template: { meta_status: "approved" }, alreadyRan: false, create: "b1" };
  const ports = new Proxy(
    {},
    {
      get:
        (_, name) =>
        async (...args) => {
          log.push([name, ...args]);
          return answer[name];
        },
    },
  );
  return { ports, log };
}
const runCtx = (over = {}) => ({
  tz: "America/New_York",
  now: new Date(NOW),
  people: [vm("1"), vm("2")],
  modes: new Map([
    ["campaign", "auto"],
    ["reengage", "auto"],
  ]),
  health: contracts.numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  touches: { byThis: new Map(), byAny: new Map() },
  calendar: "none",
  visits: new Map(),
  lists: new Map(),
  ...over,
});
const pbRow = (over = {}) => ({
  id: "p1",
  tenant_id: "t1",
  name: "Regulars",
  trigger: "saved_list",
  list_id: "l1",
  template_id: "tpl-1",
  template_name: "offer",
  template_language: "en_US",
  params: [],
  policy_class: "campaign",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner",
  last_run_for: null,
  ...over,
});

test("a run on a list: its people, and a list deleted under it runs nobody and says so; Lapsed without a calendar is off", async () => {
  const on = runPorts();
  const sent = await runPlaybook(on.ports, {
    playbook: pbRow(),
    ctx: runCtx({ lists: new Map([["l1", new Set(["2"])]]) }),
    runFor: "2026-09-20",
    by: { kind: "system" },
  });
  assert.equal(sent.outcome, "sent", JSON.stringify(sent));
  assert.equal(sent.eligible, 1, "the one on the list");
  const gone = runPorts();
  const off = await runPlaybook(gone.ports, {
    playbook: pbRow({ list_id: null }),
    ctx: runCtx(),
    runFor: "2026-09-20",
    by: { kind: "system" },
  });
  assert.deepEqual([off.outcome, off.skipped], ["off", "no_list"]);
  const lapsed = await runPlaybook(runPorts().ports, {
    playbook: pbRow({ trigger: "lapsed", list_id: null, policy_class: "reengage" }),
    ctx: runCtx({ calendar: "none" }),
    runFor: "2026-09-20",
    by: { kind: "system" },
  });
  assert.deepEqual([lapsed.outcome, lapsed.skipped], ["off", "no_calendar"], "Lapsed reads the calendar");
});

test("a playbook on a list names it, the workspace's own, and takes its name when none was given", async () => {
  const template = {
    id: "tpl-1",
    name: "autumn_offer",
    language: "en_US",
    category: "marketing",
    meta_status: "approved",
    variables: [],
    body_preview: "Hi",
    title: "Autumn offer",
  };
  const L = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
  const ports = {
    template: async () => template,
    bookingLink: async () => null,
    businessName: async () => "Studio",
    listName: async (id) => (id === L ? "Regulars" : null),
  };
  const body = { trigger: "saved_list", template_id: "11111111-1111-4111-8111-111111111111", params: [] };
  await assert.rejects(checkPlaybook(ports, body), /Pick the list it runs on/);
  await assert.rejects(checkPlaybook(ports, { ...body, list_id: "not-a-uuid" }), /Pick the list it runs on/);
  await assert.rejects(
    checkPlaybook(ports, { ...body, list_id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb" }),
    /List not found/,
  );
  const ok = await checkPlaybook(ports, { ...body, list_id: L });
  assert.equal(ok.list_id, L);
  assert.equal(ok.name, "Regulars · Autumn offer");
  assert.equal(ok.policy_class, "campaign");
});

/* ------------------------------------------ the routes ------------------------------------------ */

const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const lists = await import(at("apps/dashboard/app/api/v1/segments/route.ts"));
const list = await import(at("apps/dashboard/app/api/v1/segments/[id]/route.ts"));
const draft = await import(at("apps/dashboard/app/api/v1/segments/draft/route.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/model-json.ts"));
const { cleanListRule } = await import(at("apps/dashboard/src/server/lists.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const USER = "u1";
const inA = `?workspace=${A}`;
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  segments: [
    { id: S1, tenant_id: A, name: "Regulars", rule: null },
    { id: S2, tenant_id: A, name: "Drifting", rule: { all: [{ field: "last_visit", op: "more_than", days: 45 }] } },
  ],
  segment_members: [{ segment_id: S1, contact_id: P1, tenant_id: A }],
  contacts: [{ id: P1, tenant_id: A, erased_at: null }],
});
const ctxFor = (t, params = {}) => ({ supabase: fakeDb(t), userId: USER, email: "ada@example.com", params });
const send = (method, body, q = inA) =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("the lists carry their rule; a smart list is made with one, and a rule the vocabulary cannot read is refused in words", async () => {
  const t = tables();
  const got = await lists.GET.run(new Request(`http://localhost/api/v1/x${inA}`), ctxFor(t));
  assert.deepEqual(
    got.lists.map((l) => [l.name, l.ids, l.rule]),
    [
      ["Drifting", [], { all: [{ field: "last_visit", op: "more_than", days: 45 }] }],
      ["Regulars", [P1], null],
    ],
  );
  const made = await lists.POST.run(
    send("POST", { name: "Text only", rule: { all: [{ field: "channel", op: "is", channel: "sms" }] } }),
    ctxFor(t),
  );
  // Stored as version 2, the version it was judged in (decision 0009).
  assert.deepEqual(made.rule, { v: 2, all: [{ field: "channel", op: "is", channel: "sms" }] });
  assert.deepEqual(t.segments.find((s) => s.id === made.id).rule, made.rule, "stored as it was judged");
  await assert.rejects(
    lists.POST.run(send("POST", { name: "Stylists", rule: { all: [{ field: "stylist", op: "is" }] } }), ctxFor(t)),
    /That rule can't be read/,
  );
});

test("nobody is put on or taken off a smart list by hand; its rule changes, a hand list takes none", async () => {
  const t = tables();
  await assert.rejects(list.PUT.run(send("PUT", { add: [P1] }), ctxFor(t, { id: S2 })), /its rule says who is on it/);
  await assert.rejects(
    list.PUT.run(send("PUT", { remove: [P1] }), ctxFor(t, { id: S2 })),
    /its rule says who is on it/,
  );
  await assert.rejects(
    list.PUT.run(send("PUT", { rule: { all: [{ field: "calls", op: "at_least", n: 1 }] } }), ctxFor(t, { id: S1 })),
    /A list kept by hand has no rule/,
  );
  const changed = await list.PUT.run(
    send("PUT", { rule: { all: [{ field: "last_visit", op: "more_than", days: 60 }] } }),
    ctxFor(t, { id: S2 }),
  );
  assert.deepEqual(changed, {
    id: S2,
    name: "Drifting",
    ids: [],
    rule: { v: 2, all: [{ field: "last_visit", op: "more_than", days: 60 }] },
  });
  assert.deepEqual(t.segments.find((s) => s.id === S2).rule.all[0].days, 60);
});

test("a smart list drafted from the owner's words: a name, a rule, and what it could not say -- and words it can say nothing of are refused with what was missing", async () => {
  const calls = [];
  const answerWith = (said) =>
    setModelStream(async function* (call) {
      calls.push(call);
      yield { type: "text", index: 0, text: JSON.stringify(said) };
      yield { type: "stop", stopReason: "end_turn" };
    });
  answerWith({
    name: "Drifting regulars",
    cannot: "who their stylist is",
    all: [{ field: "last_visit", op: "more_than", days: 60 }],
  });
  const out = await draft.POST.run(
    send("POST", { words: "regulars of Ana who haven't been in two months" }),
    ctxFor(tables()),
  );
  assert.deepEqual(out, {
    name: "Drifting regulars",
    rule: { v: 2, all: [{ field: "last_visit", op: "more_than", days: 60 }] },
    cannot: "who their stylist is",
  });
  assert.equal(calls[0].purpose, "list_draft", "counted as the assistant's, under its own purpose");
  answerWith({ name: "Big spenders", cannot: "what they spend", all: [] });
  await assert.rejects(
    draft.POST.run(send("POST", { words: "people who spend a lot" }), ctxFor(tables())),
    /A list can't say that yet: what they spend/,
  );
  await assert.rejects(draft.POST.run(send("POST", { words: "hi" }), ctxFor(tables())), (e) => e.code === "validation");
  setModelStream(null);
});

test("a send to a smart list enrols who its rule holds for, over the same pool it counts from", async () => {
  const { createBroadcastPorts } = await import(at("apps/dashboard/src/server/campaign-ports.ts"));
  const person = (id, channels) => ({
    id,
    display_name: id,
    phone_e164: `+1305555${id.padStart(4, "0")}`,
    consent: "opted_in",
    marketing_consent: "opted_in",
    dnc: false,
    channels,
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    first_contact_at: "2026-08-01T00:00:00Z",
    last_message_at: "2026-09-18T00:00:00Z",
    has_chat: true,
    has_backfill: false,
  });
  const db = fakeDb(
    {
      tenants: [{ id: A, timezone: "America/New_York" }],
      policies: [],
      tenant_config: [],
      segments: [
        { id: S2, tenant_id: A, name: "Texters", rule: { all: [{ field: "channel", op: "is", channel: "sms" }] } },
      ],
      segment_members: [],
    },
    {},
    { people_list: () => [person("1", ["sms"]), person("2", ["whatsapp"]), person("3", ["sms", "voice"])] },
  );
  const seg = await createBroadcastPorts({ supabase: db, userId: USER }, A).savedList(S2);
  assert.equal(seg.name, "Texters");
  assert.deepEqual(seg.memberIds.sort(), ["1", "3"]);
});

/* ------------------------------------------- the edge ------------------------------------------- */

test("the sweep reads every list once per workspace, with who is on each now", async () => {
  const { loadTenantRunContext } = await import(at("apps/edge/lib/playbooks.ts"));
  const person = (id, channels) => ({
    id,
    display_name: id,
    phone_e164: `+1305555${id.padStart(4, "0")}`,
    consent: "opted_in",
    marketing_consent: "opted_in",
    dnc: false,
    channels,
    conversation_count: 1,
    has_chat: true,
    has_backfill: false,
  });
  const db = fakeDb(
    {
      tenants: [{ id: "t1", timezone: "America/New_York", status: "active" }],
      policies: [],
      tenant_channels: [],
      tenant_config: [],
      broadcasts: [],
      broadcast_recipients: [],
      segments: [
        { id: "l-hand", tenant_id: "t1", name: "Regulars", rule: null },
        {
          id: "l-smart",
          tenant_id: "t1",
          name: "Texters",
          rule: { all: [{ field: "channel", op: "is", channel: "sms" }] },
        },
      ],
      segment_members: [{ segment_id: "l-hand", contact_id: "2", tenant_id: "t1" }],
    },
    {},
    { people_list: () => [person("1", ["sms"]), person("2", ["whatsapp"])] },
  );
  const ctx = await loadTenantRunContext(db, "t1", new Date(NOW));
  assert.ok(!("error" in ctx), JSON.stringify(ctx));
  assert.deepEqual([...ctx.lists.get("l-hand")], ["2"]);
  assert.deepEqual([...ctx.lists.get("l-smart")], ["1"]);
});

test("either deploy order: on a database 00155 has not reached, every list reads as one kept by hand, never as an error", async () => {
  const { savedListsFor, savedListFor, listRow } = await import(at("packages/db/src/repositories/lists.ts"));
  const base = fakeDb({
    segments: [{ id: "s1", tenant_id: "t1", name: "Regulars" }],
    segment_members: [{ segment_id: "s1", contact_id: "c1", tenant_id: "t1" }],
  });
  const missing = { data: null, error: { code: "42703", message: "column segments.rule does not exist" } };
  const refusing = {
    eq() {
      return this;
    },
    order() {
      return this;
    },
    range: async () => missing,
    maybeSingle: async () => missing,
  };
  const db = {
    from: (table) => {
      const q = base.from(table);
      if (table !== "segments") return q;
      const select = q.select.bind(q);
      q.select = (columns, ...rest) => (String(columns).includes("rule") ? refusing : select(columns, ...rest));
      return q;
    },
  };
  assert.deepEqual(await savedListsFor(db, "t1"), [{ id: "s1", name: "Regulars", ids: ["c1"], rule: null }]);
  assert.deepEqual(await savedListFor(db, "t1", "s1"), { id: "s1", name: "Regulars", ids: ["c1"], rule: null });
  assert.deepEqual(await listRow(db, "s1"), { id: "s1", tenant_id: "t1", name: "Regulars", rule: null });
});

test("a rule may read another list only one level deep, only one there is, never itself, never one this version can't read", () => {
  const A1 = "33333333-3333-4333-8333-333333333333";
  const B1 = "44444444-4444-4444-8444-444444444444";
  const C1 = "55555555-5555-4555-8555-555555555555";
  const reads = (id) => ({ all: [{ field: "in_list", op: "is", list: `list:${id}` }] });
  const saved = [
    { id: A1, rule: null },
    { id: B1, rule: reads(A1) },
    { id: C1, rule: { v: 3, all: [{ field: "future_fact" }] } },
  ];
  assert.deepEqual(cleanListRule(reads(A1), saved).all[0].list, `list:${A1}`, "a hand list, one level");
  assert.ok(cleanListRule({ all: [{ field: "in_list", op: "is_not", list: "seg:lapsed" }] }, saved), "a built-in");
  assert.throws(() => cleanListRule(reads(B1), saved), /reads another list itself/);
  assert.throws(() => cleanListRule(reads(C1), saved), /this version can't read/);
  assert.throws(() => cleanListRule(reads("66666666-6666-4666-8666-666666666666"), saved), /a list there isn't/);
  assert.throws(() => cleanListRule(reads(A1), saved, A1), /can't read itself/);
  assert.throws(
    () => cleanListRule({ all: [{ field: "in_list", op: "is", list: "seg:nope" }] }, saved),
    /a list there isn't/,
  );
  // A list another list reads may not start reading lists itself: one level deep either way.
  const D1 = "77777777-7777-4777-8777-777777777777";
  assert.throws(() => cleanListRule(reads(D1), [...saved, { id: D1, rule: null }], A1), /Another list reads this one/);
});
