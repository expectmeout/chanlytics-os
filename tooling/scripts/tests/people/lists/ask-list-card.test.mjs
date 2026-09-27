/**
 * Ask's list card (Ask Rewired, PR 4.7; the Phase 4 plan, D10): propose_list, whose rule this turn's model writes in the
 * list vocabulary -- the drafter's own shape, shown to it as the drafter's schema says it -- and whose builder checks it
 * with the lists routes' own guards before a card is shown. Each call the model makes runs through the registry over
 * the database in memory, from a table: the refusal in the model's words and what was read before it, or the card, its
 * rule as People's chips, who it holds today as people.lists counts a list, and what the vocabulary could not say. Then
 * the card walked end to end -- built, approved through the palette's commit walk, undone -- against the real lists
 * routes: made, then deleted; made, then archived because a playbook came to run on it; and refused in the route's own
 * words when a list of that name was made in between.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  LIST_DRAFT_JSON_SCHEMA,
  PROPOSAL_SPECS,
  asListRule,
  cardOpenRoute,
  listDraftFieldLines,
  listRuleParts,
  listUnknownWords,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { buildProposal, newToolContext, toApiTools } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { LIST_NAME_TAKEN, LIST_RULE_LINES } = await import(at("apps/dashboard/src/server/people/lists.ts"));
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { commitProposal, undoProposal } = await import(at("apps/dashboard/src/legacy-bridge/ask/commit.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const listsRoute = await import(at("apps/dashboard/app/api/v1/segments/route.ts"));
const listRoute = await import(at("apps/dashboard/app/api/v1/segments/[id]/route.ts"));

beforeEach(() => {
  readerCache.clear();
  setRateStore(memoryStore());
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const L_HAND = "5e5e5e5e-0000-4000-8000-000000000001";
const L_OLD = "5e5e5e5e-0000-4000-8000-000000000004";
const L_B = "5e5e5e5e-0000-4000-8000-00000000000b";
const USER = "u1";
const TZ = "America/New_York";
/** A Monday at 10:00 in New York. */
const NOW = new Date("2026-09-14T14:00:00Z");
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

/** A People row as people_list answers it (people/ask-people.test.mjs's shape). */
const personRow = (id, name, over = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+15555550100",
  consent: "opted_in",
  dnc: false,
  has_chat: true,
  first_seen_at: iso(NOW.getTime() - 60 * DAY),
  last_message_at: iso(NOW.getTime() - 3 * DAY),
  last_inbound_at: iso(NOW.getTime() - 3 * DAY),
  latest_conversation_id: null,
  conversation_count: 1,
  ...over,
});
/** Harbor's people: four who wrote, one of them twice, and one who only phoned. */
const HARBOR = [
  personRow("abababab-abab-4aba-8aba-abababababa1", "Rosa", { conversation_count: 2 }),
  personRow("abababab-abab-4aba-8aba-abababababa2", "Quinn"),
  personRow("abababab-abab-4aba-8aba-abababababa3", "Lena"),
  personRow("abababab-abab-4aba-8aba-abababababa4", "Omar"),
  personRow("abababab-abab-4aba-8aba-abababababa5", "Mia", { has_chat: false, conversation_count: 0 }),
];
/**
 * Harbor: a list kept by hand ("Regulars"), an archived one whose name is free again ("Lapsed"), and Bayside's own
 * list, which a member of both could read. No calendar is connected, so a list about visits cannot be counted here.
 */
function world(role = "operator") {
  return {
    memberships: [
      { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
      { user_id: USER, tenant_id: B, role, tenants: { slug: "bayside" }, created_at: "2026-02-01T00:00:00Z" },
    ],
    tenants: [
      { id: A, name: "Harbor", timezone: TZ, sells_by: "booking" },
      { id: B, name: "Bayside", timezone: "Europe/Madrid", sells_by: "booking" },
    ],
    tenant_config: [],
    tenant_channels: [],
    policies: [],
    conversations: [],
    messages: [],
    contacts: [],
    deals: [],
    templates: [],
    segments: [
      { id: L_HAND, tenant_id: A, name: "Regulars", rule: null, archived_at: null },
      {
        id: L_OLD,
        tenant_id: A,
        name: "Lapsed",
        rule: { v: 2, all: [{ field: "last_heard", op: "more_than", days: 90 }] },
        archived_at: "2026-09-01T00:00:00Z",
      },
      { id: L_B, tenant_id: B, name: "Texters", rule: null, archived_at: null },
    ],
    segment_members: [{ tenant_id: A, segment_id: L_HAND, contact_id: HARBOR[0].id }],
    playbooks: [],
    broadcasts: [],
    broadcast_recipients: [],
    decisions: [],
  };
}
const RPCS = {
  people_list: (a) =>
    (a.p_tenant_id === A ? HARBOR : []).slice(a.p_offset ?? 0, (a.p_offset ?? 0) + (a.p_limit ?? 1000)),
};
/** 00169's one live name per workspace (segments_live_name), as the database refuses a second. */
const LIVE_NAME = [
  { table: "segments", name: "segments_live_name", columns: ["tenant_id", "name"], where: (r) => !r.archived_at },
];

/** One call the model makes, through the registry, over a fresh world: what it came to, what it read, the read set. */
async function listCall(input, role = "operator") {
  const supabase = fakeDb(world(role), {}, RPCS);
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, role, TZ, NOW);
  const out = await buildProposal(t, "propose_list", input);
  const p = out.proposal;
  return {
    got: p
      ? { kind: p.kind, needs: p.needs, title: p.title, summary: p.summary, payload: p.payload, undo: p.undo }
      : JSON.parse(out.result),
    isError: out.isError,
    reads: [...new Set(supabase.seen.map((q) => (q.rpc ? `rpc.${q.rpc}` : `${q.table}.${q.op}`)))],
    read: t.read,
  };
}

const TALKERS = [{ field: "conversations", op: "at_least", n: 1 }];
const rule = (all) => ({ v: 2, all });
const chips = (all) => listRuleParts(asListRule(rule(all))).join(" · ");
/** What the lists read reads: the lists, and every one's people (packages/db savedListsFor). */
const LISTS_READ = ["segments.select", "segment_members.select"];

/**
 * Each call and what it comes to: a refusal in the model's words (and what was read before it), or the card. The
 * refusals of the name, of what was left out and of the rule read nothing; the name another live list has is known
 * from the lists alone; a card reads the lists and the pool it counts over.
 */
const LIST_CALLS = [
  [
    "a name of spaces",
    { name: "   ", all: TALKERS, cannot: "" },
    { error: "A list needs a name of up to 60 characters." },
    [],
  ],
  [
    "a name longer than People keeps, refused in the route's words and never cut",
    { name: "L".repeat(61), all: TALKERS, cannot: "" },
    { error: "A list needs a name of up to 60 characters." },
    [],
  ],
  [
    "more left out than a few words",
    { name: "Talkers", all: TALKERS, cannot: "x".repeat(201) },
    { error: "cannot is a few words, at most 200 characters" },
    [],
  ],
  [
    "what was left out never skipped: it has no default",
    { name: "Talkers", all: TALKERS },
    { error: "propose_list: cannot Invalid input: expected string, received undefined" },
    [],
  ],
  [
    "no condition at all",
    { name: "Everybody", all: [], cannot: "" },
    { error: "all needs a condition: a list of everyone is Everyone, which People has" },
    [],
  ],
  [
    "a fact the vocabulary has no field for (what they asked about)",
    { name: "Balayage", all: [{ field: "service", op: "is", value: "balayage" }], cannot: "" },
    {
      error:
        "all is not a rule the list vocabulary reads: one to twelve conditions, each one fact with the op and value its field takes, or { any: [two to six facts] }; what the fields cannot say goes in cannot",
    },
    [],
  ],
  [
    "a day fact with an op it does not take",
    { name: "Lapsed", all: [{ field: "last_visit", op: "is", yes: true }], cannot: "" },
    {
      error:
        "all is not a rule the list vocabulary reads: one to twelve conditions, each one fact with the op and value its field takes, or { any: [two to six facts] }; what the fields cannot say goes in cannot",
    },
    [],
  ],
  [
    "more than N days with no N",
    { name: "Quiet", all: [{ field: "last_heard", op: "more_than" }], cannot: "" },
    {
      error:
        "all is not a rule the list vocabulary reads: one to twelve conditions, each one fact with the op and value its field takes, or { any: [two to six facts] }; what the fields cannot say goes in cannot",
    },
    [],
  ],
  [
    "a rule that reads another list: a draft never does",
    { name: "Regulars who text", all: [{ field: "in_list", op: "is", list: `list:${L_HAND}` }], cannot: "" },
    { error: "a list proposed here never reads another list; one that does is made on People" },
    [],
  ],
  [
    "a name a live list of the workspace has, in any case",
    { name: " regulars ", all: TALKERS, cannot: "" },
    {
      error: `${LIST_NAME_TAKEN} Read people with action lists: it may say this already, or take another name`,
    },
    LISTS_READ,
  ],
  [
    "an archived list's name is free again (00169), and a rule the pool counts: how many are on it today",
    { name: "Lapsed", all: TALKERS, cannot: "" },
    {
      kind: "list",
      needs: "operator",
      title: "List: Lapsed",
      summary: `${chips(TALKERS)} — 4 people on it today, and it keeps itself current`,
      payload: { name: "Lapsed", rule: rule(TALKERS), cannot: "", count: 4 },
      undo: "Delete it",
    },
    null,
  ],
  [
    "another workspace's list name is this workspace's to take",
    { name: "Texters", all: [{ field: "has_chat", op: "is", yes: true }], cannot: "" },
    {
      kind: "list",
      needs: "operator",
      title: "List: Texters",
      summary: `${chips([{ field: "has_chat", op: "is", yes: true }])} — 4 people on it today, and it keeps itself current`,
      payload: { name: "Texters", rule: rule([{ field: "has_chat", op: "is", yes: true }]), cannot: "", count: 4 },
      undo: "Delete it",
    },
    null,
  ],
  [
    "what the words asked that no field says, kept on the card and said back; a fact cut to the keys its field reads; Rosa, who wrote twice",
    {
      name: "  Chatty   ones ",
      all: [
        { field: "conversations", op: "at_least", n: 2, days: 30, yes: null },
        {
          any: [
            { field: "channel", op: "is", channel: "sms" },
            { field: "channel", op: "is", channel: "whatsapp" },
          ],
        },
      ],
      cannot: "  who asked about balayage ",
    },
    {
      kind: "list",
      needs: "operator",
      title: "List: Chatty ones",
      summary: `${chips([
        { field: "conversations", op: "at_least", n: 2 },
        {
          any: [
            { field: "channel", op: "is", channel: "sms" },
            { field: "channel", op: "is", channel: "whatsapp" },
          ],
        },
      ])} — 1 person on it today, and it keeps itself current. Left out: who asked about balayage`,
      payload: {
        name: "Chatty ones",
        rule: rule([
          { field: "conversations", op: "at_least", n: 2 },
          {
            any: [
              { field: "channel", op: "is", channel: "sms" },
              { field: "channel", op: "is", channel: "whatsapp" },
            ],
          },
        ]),
        cannot: "who asked about balayage",
        count: 1,
      },
      undo: "Delete it",
    },
    null,
  ],
  [
    "a rule about visits where no calendar is read: made, and why it cannot be counted here, in the rail's words",
    { name: "Two months out", all: [{ field: "last_visit", op: "more_than", days: 60 }], cannot: "regulars" },
    {
      kind: "list",
      needs: "operator",
      title: "List: Two months out",
      // The rail's sentence ends with its own stop: "…Business to count it. Left out: regulars".
      summary: `${chips([{ field: "last_visit", op: "more_than", days: 60 }])} — ${listUnknownWords("calendar", "none")} Left out: regulars`,
      payload: {
        name: "Two months out",
        rule: rule([{ field: "last_visit", op: "more_than", days: 60 }]),
        cannot: "regulars",
      },
      undo: "Delete it",
    },
    null,
  ],
];

test("propose_list over the database in memory, from a table: each refusal in the model's words, before any read where it can be -- the name as the route cleans it, what was left out, a rule the vocabulary cannot read, one that reads a list, a name a live list has -- and each card with its rule as People's chips, who it holds today and what it left out", async () => {
  for (const [what, input, want, reads] of LIST_CALLS) {
    const r = await listCall(input);
    assert.deepEqual(r.got, want, what);
    assert.equal(r.isError, "error" in want, what);
    if (reads) assert.deepEqual(r.reads, reads, `${what}: what was read`);
    else assert.deepEqual(r.reads.slice(0, 2), LISTS_READ, `${what}: the lists first, then the pool`);
    if (!reads) assert.ok(r.reads.includes("rpc.people_list"), `${what}: counted over everyone in People`);
  }
  // An owner and a partner may make one too; a viewer is offered none (below), as with every card an operator may approve.
  for (const role of ["partner", "owner"])
    assert.equal((await listCall({ name: "Talkers", all: TALKERS, cannot: "" }, role)).got.kind, "list", role);
});

/** A schema with every key sorted, and an object's `required: []` said as nothing: the registry's normaliser writes one. */
function canonical(node) {
  if (Array.isArray(node)) return node.map(canonical);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.keys(node)
      .sort()
      .filter((k) => !(k === "required" && Array.isArray(node[k]) && node[k].length === 0))
      .map((k) => [k, canonical(node[k])]),
  );
}

test("the rule the model is shown is the drafter's own: all as LIST_DRAFT_JSON_SCHEMA says it, imported, and the vocabulary's lines, every field from listDraftFieldLines; name and cannot beside it, every one required", () => {
  for (const role of ["operator", "partner", "owner"]) {
    const t = toApiTools(role, true).find((x) => x.name === "propose_list");
    assert.deepEqual(Object.keys(t.input_schema.properties), ["name", "all", "cannot"]);
    assert.deepEqual(t.input_schema.required, ["name", "all", "cannot"]);
    assert.deepEqual(canonical(t.input_schema.properties.all), canonical(LIST_DRAFT_JSON_SCHEMA.properties.all));
    assert.ok(!JSON.stringify(t.input_schema).includes('"in_list"'), "a draft never reads another list");
    for (const line of LIST_RULE_LINES) assert.ok(t.description.includes(`\n${line}\n`), line);
    for (const line of listDraftFieldLines()) assert.ok(LIST_RULE_LINES.includes(line), line);
  }
  assert.equal(
    toApiTools("viewer", true).find((x) => x.name === "propose_list"),
    undefined,
    "a viewer is offered none",
  );
});

const envelope = (data) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });

/** The routes a list card reaches, by method and path: each the real route module, run as the server runs it. */
const CARD_ROUTES = [
  ["POST", /^\/api\/v1\/segments$/, listsRoute.POST, () => ({})],
  ["DELETE", /^\/api\/v1\/segments\/([^/]+)$/, listRoute.DELETE, (m) => ({ id: m[1] })],
];

/**
 * A tab over the world: the typed client on a fetch that runs the route a card names over the same database the card's
 * builder read, answered as the server answers (its envelope, or its refusal); the window the commit walk tells.
 */
function tabOver(tables) {
  const sent = [];
  const events = [];
  const supabase = fakeDb(tables, {}, RPCS, { uniqueIndexes: LIVE_NAME });
  const client = createApi({
    fetch: async (url, init) => {
      const u = new URL(String(url), "http://localhost");
      const hit = CARD_ROUTES.find(([method, re]) => method === init.method && re.test(u.pathname));
      assert.ok(hit, `a route this walk does not run: ${init.method} ${u.pathname}`);
      const [, re, handler, params] = hit;
      sent.push({ key: `${init.method} ${u.pathname}`, body: init.body ? JSON.parse(init.body) : undefined });
      const ctx = { supabase, userId: USER, email: "ada@example.com", params: params(re.exec(u.pathname)) };
      try {
        return envelope(await handler.run(new Request(u, { method: init.method, body: init.body }), ctx));
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: { code: e.code, message: e.message } }), {
          status: e.status ?? 500,
        });
      }
    },
    workspace: () => A,
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async (key) => {
      events.push(`refresh ${key}`);
    },
    now: () => 1_000,
  });
  const win = {
    __SETTINGS: null,
    location: { hash: "" },
    dispatchEvent: (e) => {
      events.push(e.type);
      return true;
    },
    setTimeout: (fn) => {
      fn();
      return 1;
    },
  };
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
  return { client, win, sent, events, t };
}
const doneWith = (r) => ({ state: "done", receipt: r.receipt, atMs: 1, undo: r.undo });
const ledger = (tables) => tables.decisions.map((d) => [d.verb, d.subject_type]);

test("a list card, walked end to end: the model's call makes it, Approve makes the list through the lists route with its rule, People is read again, Open goes to it, and Delete it takes it away by the id the route answered", async () => {
  const tables = world();
  const tab = tabOver(tables);
  const built = await buildProposal(tab.t, "propose_list", { name: "Talkers", all: TALKERS, cannot: "" });
  assert.equal(built.isError, false, built.result);
  const card = built.proposal;
  const done = await commitProposal(tab.win, card, tab.client);
  const made = tables.segments.find((s) => s.name === "Talkers");
  assert.ok(made, "the list is made");
  assert.deepEqual([made.tenant_id, made.rule, made.archived_at ?? null], [A, rule(TALKERS), null]);
  assert.deepEqual(done, { ok: true, receipt: "Talkers made. It keeps itself current.", undo: { list_id: made.id } });
  assert.deepEqual(tab.sent, [{ key: "POST /api/v1/segments", body: { name: "Talkers", rule: rule(TALKERS) } }]);
  assert.ok(tab.events.includes("refresh POST segments"), "People, Broadcasts and Playbooks read again behind it");
  assert.deepEqual(ledger(tables), [["make_list", "list"]]);
  assert.equal(cardOpenRoute({ ...card, outcome: doneWith(done) }), `clients/list:${made.id}`, "Open: the list");
  const undone = await undoProposal(tab.win, card, doneWith(done), tab.client);
  assert.deepEqual(undone, { ok: true, receipt: "Deleted. The people stay.", undo: null });
  assert.ok(!tables.segments.some((s) => s.id === made.id), "the list it made is gone");
  assert.deepEqual(tab.sent[1], { key: `DELETE /api/v1/segments/${made.id}`, body: undefined });
  assert.deepEqual(ledger(tables), [
    ["make_list", "list"],
    ["delete_list", "list"],
  ]);
});

test("a list card undone after a playbook came to run on it: the route archives it rather than delete it, the playbook pauses, and the undo's receipt says so in People's words", async () => {
  const tables = world();
  const tab = tabOver(tables);
  const card = (await buildProposal(tab.t, "propose_list", { name: "Talkers", all: TALKERS, cannot: "" })).proposal;
  const done = await commitProposal(tab.win, card, tab.client);
  const id = done.undo.list_id;
  // Within the undo's ten minutes, a playbook is put on the list.
  tables.playbooks.push({
    id: "99999999-9999-4999-8999-999999999991",
    tenant_id: A,
    name: "Win-back",
    list_id: id,
    state: "running",
  });
  const undone = await undoProposal(tab.win, card, doneWith(done), tab.client);
  assert.deepEqual(undone, {
    ok: true,
    receipt: "Archived, not deleted: Win-back paused. It comes back from Archived under your lists.",
    undo: null,
  });
  const kept = tables.segments.find((s) => s.id === id);
  assert.ok(kept && typeof kept.archived_at === "string", "kept, archived");
  assert.equal(tables.playbooks[0].state, "paused");
  // The spec's receipt reads the route's answer both ways: pinned over that answer in ask/ask-specs.test.mjs.
  assert.equal(PROPOSAL_SPECS.list.undo.receipt({ deleted: true, id }), "Deleted. The people stay.");
});

test("a list card whose name another list took before it was approved fails in the route's own words, and keeps no undo", async () => {
  const tables = world();
  const tab = tabOver(tables);
  const card = (await buildProposal(tab.t, "propose_list", { name: "Talkers", all: TALKERS, cannot: "" })).proposal;
  // Someone made a list of that name on People while the card waited.
  tables.segments.push({
    id: "5e5e5e5e-0000-4000-8000-000000000009",
    tenant_id: A,
    name: "Talkers",
    rule: null,
    archived_at: null,
  });
  const failed = await commitProposal(tab.win, card, tab.client);
  assert.deepEqual(
    [failed.ok, failed.status, failed.message, "undo" in failed],
    [false, 409, LIST_NAME_TAKEN, false],
    "the route's 409, in its words",
  );
  assert.equal(tables.segments.filter((s) => s.name === "Talkers").length, 1, "nothing of the card was made");
  assert.deepEqual(ledger(tables), [], "nothing on the ledger");
});
