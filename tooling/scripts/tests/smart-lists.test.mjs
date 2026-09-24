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
  listRuleMatches,
  listRuleParts,
  ruleNeedsCalendar,
  savedListIds,
  playbookRunReach,
  triggerOf,
  LIST_RULE_FIELDS,
  LIST_DRAFT_JSON_SCHEMA,
} = contracts;

const NOW = Date.parse("2026-09-20T15:00:00Z");
const D = 86_400_000;

/** A person as the People page reads them, with the facts a rule may name. */
const vm = (id, over = {}) => ({
  id,
  channels: ["whatsapp"],
  cameFrom: null,
  calls: 0,
  threads: 1,
  booked: false,
  askedNotBooked: false,
  lastVisitDays: null,
  nextVisitDays: null,
  lastContact: { ts: NOW - 3 * D },
  firstContact: { ts: NOW - 60 * D },
  phone: `+1305555${id.padStart(4, "0")}`,
  state: "active",
  consent: { state: "opted_in", marketing: "opted_in", dnc: false },
  ...over,
});
const rule = (...all) => ({ all });

/* ----------------------------------------- the vocabulary ----------------------------------------- */

test("a rule holds over the facts a row carries: a visit's days, when they were heard from, their wires, where they came from, their counts, their yes", () => {
  const lapsed = vm("1", { lastVisitDays: 60 });
  const recent = vm("2", { lastVisitDays: 10 });
  const never = vm("3");
  const r = rule({ field: "last_visit", op: "more_than", days: 45 });
  assert.deepEqual(
    [lapsed, recent, never].map((v) => listRuleMatches(r, v, NOW)),
    [true, false, false],
    "a person with no visit is not 'more than 45 days' from one",
  );
  assert.equal(listRuleMatches(rule({ field: "last_visit", op: "within", days: 14 }), recent, NOW), true);
  assert.equal(
    listRuleMatches(
      rule({ field: "last_heard", op: "more_than", days: 30 }),
      vm("4", { lastContact: { ts: NOW - 40 * D } }),
      NOW,
    ),
    true,
  );
  assert.equal(
    listRuleMatches(
      rule({ field: "last_heard", op: "more_than", days: 30 }),
      vm("5", { lastContact: { ts: null } }),
      NOW,
    ),
    false,
  );
  assert.equal(
    listRuleMatches(
      rule({ field: "first_contact", op: "within", days: 7 }),
      vm("6", { firstContact: { ts: NOW - 2 * D } }),
      NOW,
    ),
    true,
  );
  const sms = vm("7", { channels: ["sms", "voice"] });
  assert.equal(listRuleMatches(rule({ field: "channel", op: "is", channel: "sms" }), sms, NOW), true);
  assert.equal(listRuleMatches(rule({ field: "channel", op: "is_not", channel: "whatsapp" }), sms, NOW), true);
  const lead = vm("8", { cameFrom: { key: "lead", label: "A lead you found" } });
  assert.equal(listRuleMatches(rule({ field: "came_from", op: "is", from: "lead" }), lead, NOW), true);
  assert.equal(listRuleMatches(rule({ field: "came_from", op: "is_not", from: "lead" }), vm("9"), NOW), true);
  assert.equal(listRuleMatches(rule({ field: "calls", op: "at_least", n: 2 }), vm("10", { calls: 3 }), NOW), true);
  assert.equal(
    listRuleMatches(rule({ field: "conversations", op: "at_most", n: 0 }), vm("11", { threads: 1 }), NOW),
    false,
  );
  assert.equal(
    listRuleMatches(
      rule({ field: "offers_yes", op: "is", yes: false }),
      vm("12", { consent: { state: "opted_in", marketing: "unknown", dnc: false } }),
      NOW,
    ),
    true,
  );
  assert.equal(listRuleMatches(rule({ field: "booked", op: "is", yes: true }), vm("13", { booked: true }), NOW), true);
  // Every condition must hold.
  const both = rule({ field: "last_visit", op: "more_than", days: 45 }, { field: "channel", op: "is", channel: "sms" });
  assert.equal(listRuleMatches(both, vm("14", { lastVisitDays: 60, channels: ["sms"] }), NOW), true);
  assert.equal(listRuleMatches(both, vm("15", { lastVisitDays: 60 }), NOW), false);
});

test("a rule is read strictly and said in the page's words; one that reads the calendar says so", () => {
  assert.equal(asListRule({ all: [] }), null, "a list of everyone is Everyone, not a rule");
  assert.equal(asListRule({ all: [{ field: "stylist", op: "is" }] }), null, "no field the row cannot answer");
  assert.equal(asListRule({ all: [{ field: "last_visit", op: "more_than", days: 0 }] }), null);
  assert.equal(asListRule("anything"), null);
  const r = asListRule({
    all: [
      { field: "last_visit", op: "more_than", days: 60 },
      { field: "channel", op: "is", channel: "sms" },
      { field: "offers_yes", op: "is", yes: true },
      { field: "calls", op: "at_least", n: 1 },
    ],
  });
  assert.deepEqual(listRuleParts(r), [
    "Last visit more than 60 days ago",
    "Reaches you by Text",
    "Said yes to offers",
    "At least 1 call",
  ]);
  assert.equal(ruleNeedsCalendar(r), true);
  assert.equal(ruleNeedsCalendar(rule({ field: "channel", op: "is", channel: "sms" })), false);
  assert.deepEqual(
    LIST_DRAFT_JSON_SCHEMA.properties.all.items.properties.field.enum,
    LIST_RULE_FIELDS.map((f) => f.id),
    "the model is offered exactly the fields a rule may name",
  );
});

test("who is on a list: the ids kept on it, or who its rule holds for today; nobody when the rule cannot be read, or reads a calendar that could not be", () => {
  const rows = [vm("1", { lastVisitDays: 60 }), vm("2", { lastVisitDays: 5 }), vm("3", { channels: ["sms"] })];
  assert.deepEqual(
    [...savedListIds({ ids: ["2", "9"], rule: null }, rows, NOW, true)],
    ["2", "9"],
    "kept by hand: its ids",
  );
  const lapsed = rule({ field: "last_visit", op: "more_than", days: 45 });
  assert.deepEqual([...savedListIds({ ids: [], rule: lapsed }, rows, NOW, true)], ["1"]);
  assert.deepEqual(
    [...savedListIds({ ids: [], rule: lapsed }, rows, NOW, false)],
    [],
    "a calendar that could not be read names nobody, never everyone else",
  );
  assert.deepEqual(
    [...savedListIds({ ids: [], rule: rule({ field: "channel", op: "is", channel: "sms" }) }, rows, NOW, false)],
    ["3"],
  );
  assert.deepEqual(
    [...savedListIds({ ids: ["1"], rule: { all: "nope" } }, rows, NOW, true)],
    [],
    "an unreadable rule has nobody on it",
  );
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
  assert.deepEqual(made.rule, { all: [{ field: "channel", op: "is", channel: "sms" }] });
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
    rule: { all: [{ field: "last_visit", op: "more_than", days: 60 }] },
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
    rule: { all: [{ field: "last_visit", op: "more_than", days: 60 }] },
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
