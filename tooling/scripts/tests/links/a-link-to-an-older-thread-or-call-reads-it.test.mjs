/**
 * A link to a thread or a call older than the newest hundred reads that one record by its id, and opens it (wiring/records-
 * not-pages, task 4.1; finding A2c). A bell row from last week, an Activity line, a person's "Open the thread", an Ask
 * citation or a tapped push names a conversation. The Inbox holds the newest hundred threads (and the waiting ones), and
 * Conversations the newest hundred chats and calls, so a thread past them opened on "That conversation isn't among the newest
 * shown here" -- a record the server had all along. A link is a read of one record by its id, never a look in the window the
 * page holds; the pages still say it is not here for a record the server will not give (another workspace's, one that is gone),
 * and no other conversation opens in its place.
 *
 * The server end (GET calls takes `ids`, as GET conversations does, scoped to the workspace the tab named) and the surfaces'
 * end (the Inbox and Conversations read what the address on screen names, once, with the reads they already make) are run here:
 * the real route over a database in memory, and the real surfaces over a fake wire.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { memberWords, stateOf } from "@chanlytics/contracts";
import { installLegacyReact } from "../_legacy-react.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const quiet = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const callsRoute = await import(at("apps/dashboard/app/api/v1/calls/route.ts"));
const conversationsRoute = await import(at("apps/dashboard/app/api/v1/conversations/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const HOUR = 3_600_000;
const ZONE = "America/New_York";
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const uuid = (i) => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`;
const callId = (i) => `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, "0")}`;
const membership = (tenant_id, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role: "viewer",
  tenants: { slug },
  created_at,
});
const memberships = [membership(A, "harbor", "2026-01-01T00:00:00Z"), membership(B, "bayside", "2026-02-01T00:00:00Z")];
const ctxFor = (tables) => ({
  supabase: fakeDb(tables, {}, {}),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
async function refused(p, code, status) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status);
    return true;
  });
}
const callRow = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  retell_call_id: `rc-${id.slice(-3)}`,
  direction: "inbound",
  call_type: "inbound",
  status: "ended",
  from_e164: "+15550000001",
  from_raw: null,
  to_e164: "+15550000002",
  started_at: "2026-09-01T00:00:00Z",
  ended_at: null,
  updated_at: null,
  duration_ms: null,
  disconnection_reason: null,
  sentiment: null,
  call_successful: null,
  in_voicemail: null,
  summary: null,
  conversation_id: null,
  recording: null,
  ...over,
});

/* -------------------------------------------------------- the route, by id */

test("GET calls reads the calls named by id, in the workspace the tab named only; GET calls with no ids is the newest hundred, as it was", async () => {
  const [L1, L2, L3] = [callId(1), callId(2), callId(3)];
  const tables = {
    memberships,
    calls: [
      callRow(L1, A, { started_at: "2026-09-01T00:00:00Z" }),
      callRow(L2, A, { started_at: "2026-09-02T00:00:00Z" }),
      callRow(L3, B, { started_at: "2026-09-03T00:00:00Z" }),
    ],
  };
  const named = await callsRoute.GET.run(get(`?ids=${L1},${L3}&workspace=${A}`), ctxFor(tables));
  assert.deepEqual(
    named.calls.map((c) => c.id),
    [L1],
    "the one asked for in this workspace; another workspace's answers nothing",
  );
  const once = await callsRoute.GET.run(get(`?ids=${L2},${L2}&workspace=${A}`), ctxFor(tables));
  assert.deepEqual(
    once.calls.map((c) => c.id),
    [L2],
    "an id named twice is read once",
  );
  const all = await callsRoute.GET.run(get(`?workspace=${A}`), ctxFor(tables));
  assert.deepEqual(
    all.calls.map((c) => c.id),
    [L2, L1],
    "REGRESSION: no ids is the newest, this workspace only",
  );
  assert.ok(!JSON.stringify(named.calls).includes("storage_path"), "the recording's path never leaves");
});

test("a malformed id in ?ids= is a 404, more than a hundred is refused, and the conversations read still says the same", async () => {
  const tables = { memberships, calls: [callRow(callId(1), A)], conversations: [], messages: [] };
  await refused(callsRoute.GET.run(get(`?ids=not-a-uuid&workspace=${A}`), ctxFor(tables)), "not_found", 404);
  const many = Array.from({ length: 101 }, (_, i) => callId(i)).join(",");
  await refused(callsRoute.GET.run(get(`?ids=${many}&workspace=${A}`), ctxFor(tables)), "validation", 400);
  await refused(conversationsRoute.GET.run(get(`?ids=not-a-uuid&workspace=${A}`), ctxFor(tables)), "not_found", 404);
  await refused(
    conversationsRoute.GET.run(
      get(`?ids=${Array.from({ length: 101 }, (_, i) => uuid(i)).join(",")}&workspace=${A}`),
      ctxFor(tables),
    ),
    "validation",
    400,
  );
  const none = await callsRoute.GET.run(get(`?ids=${callId(9)}&workspace=${A}`), ctxFor(tables));
  assert.deepEqual(none.calls, [], "an id nobody has answers nothing");
});

/* ------------------------------------------------------- the surfaces, by id */

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
Object.assign(globalThis, {
  location: {
    pathname: "/w/harbor",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: "t1", slug: "harbor", name: "Harbor", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
});
globalThis.document.visibilityState = "hidden";
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const { inboxOverride } = await quiet(() => import(at("apps/dashboard/src/surfaces/inbox/surface.ts")));
const { conversationsOverride } = await quiet(
  () => import(at("apps/dashboard/src/surfaces/inbox/conversations-surface.ts")),
);
const { surfaceValue } = await import(at("apps/dashboard/src/surfaces/surface-values.ts"));

const dtoConv = (id) => ({
  id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(HOUR),
  last_message_at: ago(HOUR),
  contact: {
    id: `k-${id}`,
    display_name: "Ada",
    wa_profile_name: null,
    phone_e164: "+15550000001",
    consent: "opted_in",
    dnc: false,
    marketing_consent: null,
  },
  messages: [
    {
      id: `m-${id}`,
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "hi",
      media: null,
      meta: null,
      status: "received",
      created_at: ago(HOUR),
      channel_ts: ago(HOUR),
      channel: "whatsapp",
    },
  ],
});
const dtoCall = (id) => ({
  ...callRow(id, A, { started_at: ago(3 * 24 * HOUR), ended_at: ago(3 * 24 * HOUR - 60_000), duration_ms: 60_000 }),
  transcript_object: [],
  message_id: null,
  contact_id: null,
  contact: { display_name: "Rosa Diaz", wa_profile_name: null, phone_e164: "+15550000001" },
});

/** The newest hundred; the older ones the server holds, by id; and what a read of each kind was asked. */
const newest = Array.from({ length: 100 }, (_, i) => dtoConv(uuid(i)));
const OLD = uuid(500);
const GONE = uuid(900);
const OLD_CALL = callId(500);
const heldByTheServer = new Map([[OLD, dtoConv(OLD)]]);
const callsHeldByTheServer = new Map([[OLD_CALL, dtoCall(OLD_CALL)]]);
let asked = [];
let waiting = [];
let failByIds = false;
let failCalls = false;
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const ids = u.searchParams.get("ids");
  asked.push(`${u.pathname}${ids ? `?ids=${ids}` : ""}`);
  if (u.pathname === "/api/v1/conversations") {
    if (ids && failByIds) return json(500, { ok: false, error: { code: "internal", message: "down" } });
    const list = ids ? ids.split(",").flatMap((id) => heldByTheServer.get(id) ?? []) : newest;
    return json(200, { ok: true, data: { conversations: list } });
  }
  if (u.pathname === "/api/v1/calls") {
    if (failCalls) return json(500, { ok: false, error: { code: "internal", message: "down" } });
    const list = ids ? ids.split(",").flatMap((id) => callsHeldByTheServer.get(id) ?? []) : [];
    return json(200, { ok: true, data: { calls: list } });
  }
  if (u.pathname === "/api/v1/escalations") return json(200, { ok: true, data: { escalations: waiting } });
  if (u.pathname === "/api/v1/templates") return json(200, { ok: true, data: { templates: [] } });
  if (u.pathname === "/api/v1/workspaces")
    return json(200, { ok: true, data: { workspaces: globalThis.window.__WORKSPACES, activeWorkspaceId: "t1" } });
  return json(404, { ok: false, error: { code: "not_found", message: u.pathname } });
};
const onScreen = (route) => {
  globalThis.location.pathname = `/w/harbor/${route}`;
  asked = [];
};
const byId = (what) => asked.filter((p) => p.startsWith(`/api/v1/${what}?ids=`));

test("the Inbox opens a thread past the newest hundred by reading it by its id, once, with the reads it already makes", async () => {
  waiting = [];
  failByIds = false;
  onScreen(`inbox/th-${OLD}`);
  await quiet(() => inboxOverride.apply());
  assert.deepEqual(byId("conversations"), [`/api/v1/conversations?ids=${OLD}`], "the one the link names, and no other");
  const ids = surfaceValue("inbox").THREADS.map((t) => t.id);
  assert.equal(ids.length, 101);
  assert.ok(ids.includes(`th-${OLD}`), "REGRESSION: the thread the link names was not shown");
  assert.equal(ids.at(-1), `th-${OLD}`, "among the oldest, where its time puts it");
  assert.equal(surfaceValue("inbox").UNREAD_ESCALATED, 0);
});

test("a thread among the newest hundred, no address, a door and a word that is no id read nothing by id", async () => {
  waiting = [];
  for (const route of [
    `inbox/th-${uuid(3)}`,
    "inbox",
    "inbox/new",
    `inbox/new:${OLD}`,
    "inbox/th-not-an-id",
    "today",
  ]) {
    onScreen(route);
    await quiet(() => inboxOverride.apply());
    assert.deepEqual(byId("conversations"), [], `${route}: nothing is asked by id`);
    assert.equal(surfaceValue("inbox").THREADS.length, 100, route);
  }
});

test("a thread the server will not give -- another workspace's, one gone, one that cannot be read -- is not shown, and costs the Inbox nothing", async () => {
  waiting = [];
  failByIds = false;
  onScreen(`inbox/th-${GONE}`);
  await quiet(() => inboxOverride.apply());
  assert.equal(byId("conversations").length, 1, "asked for, by id");
  assert.equal(surfaceValue("inbox").THREADS.length, 100, "no other thread opens in its place, and nothing is added");
  assert.ok(!surfaceValue("inbox").THREADS.some((t) => t.id === `th-${GONE}`));

  failByIds = true;
  onScreen(`inbox/th-${OLD}`);
  await quiet(() => inboxOverride.apply());
  failByIds = false;
  assert.equal(surfaceValue("inbox").THREADS.length, 100, "the Inbox still lands");
  assert.equal(
    surfaceValue("inbox").UNREAD_ESCALATED,
    0,
    "a link that could not be read is no waiting customer unread",
  );
});

test("a waiting thread past the hundred that the link also names is read once, with the others waiting", async () => {
  waiting = [
    {
      id: "e1",
      reason: "human_token",
      details: null,
      state: "open",
      created_at: ago(HOUR),
      conversation_id: OLD,
    },
  ];
  onScreen(`inbox/th-${OLD}`);
  await quiet(() => inboxOverride.apply());
  waiting = [];
  assert.deepEqual(byId("conversations"), [`/api/v1/conversations?ids=${OLD}`], "one read, the id once");
  assert.equal(surfaceValue("inbox").THREADS.filter((t) => t.id === `th-${OLD}`).length, 1, "shown once");
});

test("Conversations opens a chat past the newest hundred by its id, and a call past the calls it holds by its id", async () => {
  failCalls = false;
  onScreen(`conversations/${OLD}`);
  await quiet(() => conversationsOverride.apply());
  assert.deepEqual(byId("conversations"), [`/api/v1/conversations?ids=${OLD}`], "the chat the link names");
  assert.deepEqual(byId("calls"), [], "and no call");
  assert.ok(
    surfaceValue("conversations").CONVERSATIONS.some((c) => c.id === OLD),
    "REGRESSION: the chat the link names was not a row",
  );

  onScreen(`conversations/phone:cv-${OLD_CALL}`);
  await quiet(() => conversationsOverride.apply());
  assert.deepEqual(byId("calls"), [`/api/v1/calls?ids=${OLD_CALL}`], "the call the link names, on its tab");
  assert.deepEqual(byId("conversations"), [], "and no chat");
  assert.ok(
    surfaceValue("conversations").CONVERSATIONS.some((c) => c.id === `cv-${OLD_CALL}` && c.callId === OLD_CALL),
    "REGRESSION: the call the link names was not a row",
  );
  assert.equal(surfaceValue("conversations").CALLS_READ, true);

  onScreen(`conversations/cv-${OLD_CALL}`);
  await quiet(() => conversationsOverride.apply());
  assert.deepEqual(byId("calls"), [`/api/v1/calls?ids=${OLD_CALL}`], "a call alone on All is the same read");
});

test("Conversations reads nothing by id for a tab, a chat it holds, a word that is no id, or a call when the calls could not be read", async () => {
  failCalls = false;
  for (const route of [
    "conversations",
    "conversations/phone",
    `conversations/${uuid(4)}`,
    "conversations/cv-not-an-id",
    "inbox",
  ]) {
    onScreen(route);
    await quiet(() => conversationsOverride.apply());
    assert.deepEqual([...byId("conversations"), ...byId("calls")], [], `${route}: nothing is asked by id`);
  }
  failCalls = true;
  onScreen(`conversations/cv-${OLD_CALL}`);
  await quiet(() => conversationsOverride.apply());
  failCalls = false;
  assert.deepEqual(byId("calls"), [], "the calls read failed, so a read of one is not made behind it");
  assert.equal(surfaceValue("conversations").CALLS_READ, false, "and the page says the calls were not read");
});
