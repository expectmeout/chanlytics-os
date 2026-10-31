/**
 * A thread costs the Inbox nothing until it is opened (lane B of the mailbox analysis, 30 Oct 2026). The Inbox's read
 * carried each thread's newest hundred messages, and one program's sixty-two notices were 236 KB of every phone's load,
 * opened or not. It carries each thread's newest LIST_MESSAGES_EACH now. A thread with more is read on its own as it is
 * opened (GET conversations/:id, in the list's own shape), kept for the tab, and its conversation drawn when that read
 * lands; and Conversations' search box asks the server for the threads that say its words, since the list no longer
 * holds all of them.
 *
 * The server end runs the real routes over a database in memory; the page's end the real surface, the real thread and the
 * real search box over a fake wire.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { LIST_MESSAGES_EACH, memberWords, stateOf, toConversationVM, toInboxThreadVM } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again as drawAgain } from "../_legacy-react.mjs";

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
const conversationsRoute = await import(at("apps/dashboard/app/api/v1/conversations/route.ts"));
const threadRoute = await import(at("apps/dashboard/app/api/v1/conversations/[id]/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LONG = "cccccccc-cccc-4ccc-8ccc-000000000001";
const SHORT = "cccccccc-cccc-4ccc-8ccc-000000000002";
const ELSEWHERE = "cccccccc-cccc-4ccc-8ccc-000000000003";
const USER = "u1";
const MIN = 60_000;
const ZONE = "America/New_York";
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const mid = (i) => `m-${String(i).padStart(2, "0")}`;
const WHY = { code: "131047", message: "Re-engagement message" };

/* ------------------------------------------------------------- the server */

const membership = (tenant_id, slug) => ({
  user_id: USER,
  tenant_id,
  role: "viewer",
  tenants: { slug },
  created_at: "2026-01-01T00:00:00Z",
});
const contact = (id) => ({
  id,
  display_name: "Ada",
  wa_profile_name: null,
  phone_e164: "+15550000001",
  consent: "opted_in",
  dnc: false,
  marketing_consent: null,
});
const conversationRow = (id, tenant_id, minutesAgo) => ({
  id,
  tenant_id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: ago(minutesAgo * MIN),
  last_message_at: ago(minutesAgo * MIN),
  contact_id: `k-${id.slice(-1)}`,
  contacts: contact(`k-${id.slice(-1)}`),
});
/** A message `minutesAgo`, theirs or the receptionist's by turns. */
const messageRow = (id, conversation_id, tenant_id, minutesAgo, over = {}) => ({
  id,
  conversation_id,
  tenant_id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: `said ${id}`,
  media: null,
  meta: null,
  status: "received",
  error: null,
  channel: "whatsapp",
  channel_ts: ago(minutesAgo * MIN),
  created_at: ago(minutesAgo * MIN),
  ...over,
});
const ours = (over = {}) => ({ direction: "outbound", sender: "ai", status: "delivered", ...over });

/**
 * A thread of twenty-five, the newest a minute ago: its third message asks for the invoice, and two of the receptionist's
 * replies failed, one of them among the newest ten. A thread of three. Another workspace's thread that asks for one too.
 */
const tables = () => ({
  memberships: [membership(A, "harbor"), membership(B, "bayside")],
  conversations: [conversationRow(LONG, A, 1), conversationRow(SHORT, A, 30), conversationRow(ELSEWHERE, B, 2)],
  messages: [
    ...Array.from({ length: 25 }, (_, i) =>
      messageRow(mid(i), LONG, A, 25 - i, {
        ...(i % 2 ? ours() : {}),
        ...(i === 2 ? { body: "Could you send the invoice again?" } : {}),
        ...(i === 5 || i === 21 ? ours({ status: "failed", error: WHY }) : {}),
      }),
    ),
    ...["s0", "s1", "s2"].map((id, i) => messageRow(id, SHORT, A, 40 - i)),
    messageRow("x0", ELSEWHERE, B, 3, { body: "Where is my invoice?" }),
  ],
});
const ctxFor = (tbls, params = {}) => ({
  supabase: fakeDb(tbls, {}, {}),
  userId: USER,
  email: "ada@example.com",
  params,
});
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const idsOf = (list) => list.map((m) => m.id);

test("the Inbox's read carries each thread's newest ten, and asks for no more than that of any", async () => {
  assert.equal(LIST_MESSAGES_EACH, 10);
  const ctx = ctxFor(tables());
  const page = await conversationsRoute.GET.run(get(`?workspace=${A}`), ctx);
  const of = (id) => page.conversations.find((c) => c.id === id);
  assert.deepEqual(
    idsOf(of(LONG).messages),
    Array.from({ length: 10 }, (_, i) => mid(15 + i)),
    "the long thread's newest ten, in reading order",
  );
  assert.deepEqual(idsOf(of(SHORT).messages), ["s0", "s1", "s2"], "a short thread whole");
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "newest_messages").map((q) => [q.args.p_each, q.args.p_most]),
    [[10, 1000]],
    "ten of each, and never so many in all that a thread is cut",
  );
  assert.deepEqual(of(LONG).messages.find((m) => m.id === mid(21)).error, WHY, "a failed one says why, as before");
});

test("opened, a thread is read in the list's own shape: a message both carry is the same key for key, and a failed one says why", async () => {
  const world = tables();
  const listed = (await conversationsRoute.GET.run(get(`?workspace=${A}`), ctxFor(world))).conversations.find(
    (c) => c.id === LONG,
  );
  const opened = await threadRoute.GET.run(get(), ctxFor(world, { id: LONG }));
  assert.deepEqual(
    idsOf(opened.messages),
    Array.from({ length: 25 }, (_, i) => mid(i)),
    "the whole thread, in reading order",
  );
  for (const m of listed.messages) {
    assert.deepEqual(
      opened.messages.find((o) => o.id === m.id),
      m,
      `REGRESSION: ${m.id} is drawn one way in the row and another opened`,
    );
  }
  assert.deepEqual(
    opened.messages.find((m) => m.id === mid(5)).error,
    WHY,
    "REGRESSION: an older failure opened said only that it did not send",
  );
  assert.equal(
    opened.messages.find((m) => m.id === mid(4)).error,
    undefined,
    "a message that went says nothing of one",
  );
});

test("Conversations' box: the threads whose messages say the words, past each thread's newest, in this workspace only", async () => {
  const found = await conversationsRoute.GET.run(get(`?q=invoice&workspace=${A}`), ctxFor(tables()));
  assert.deepEqual(
    found.conversations.map((c) => c.id),
    [LONG],
    "REGRESSION: the long thread's third message asked for the invoice, and the box no longer found it",
  );
  assert.equal(found.conversations[0].messages.length, 10, "read as the list reads a thread");
  const none = await conversationsRoute.GET.run(get(`?q=zebra&workspace=${A}`), ctxFor(tables()));
  assert.deepEqual(none.conversations, [], "words nobody said find nothing, and read no thread");
});

/* ---------------------------------------------------------------- the page */

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
Object.assign(globalThis, {
  location: {
    pathname: "/w/harbor/today",
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
  canDo: () => true,
  gate: () => ({}),
});
globalThis.document.visibilityState = "hidden";
(await import(at("apps/dashboard/src/surfaces/frame/frame-globals.ts"))).installFrameGlobals();
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const { inboxOverride } = await quiet(() => import(at("apps/dashboard/src/surfaces/inbox/surface.ts")));
const { readThreadWhole, revivedThread } = await import(at("apps/dashboard/src/surfaces/inbox/read-apart.ts"));
const { surfaceValue } = await import(at("apps/dashboard/src/surfaces/surface-values.ts"));
const { InboxThread } = await import(at("apps/dashboard/src/surfaces/inbox/thread/thread.tsx"));
const { useCvVisible } = await import(at("apps/dashboard/src/surfaces/inbox/pages/calls-saying.ts"));

/** A message as the wire carries it (dto.ts groupMessages): a thread's `i`th, by turns theirs and the receptionist's. */
const wire = (conversation, i) => ({
  id: `${conversation.slice(-1)}-${String(i).padStart(2, "0")}`,
  direction: i % 2 ? "outbound" : "inbound",
  sender: i % 2 ? "ai" : "customer",
  type: "text",
  channel: "whatsapp",
  body: `words ${i}`,
  media: null,
  meta: null,
  status: i % 2 ? "delivered" : "received",
  created_at: ago((100 - i) * MIN),
  channel_ts: ago((100 - i) * MIN),
});
const dto = (id, messages) => ({
  id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(MIN),
  last_message_at: messages.at(-1).created_at,
  contact: { ...contact(`k-${id.slice(-1)}`), email: null },
  messages,
});
const range = (conversation, from, to) => Array.from({ length: to - from }, (_, k) => wire(conversation, from + k));
/** The thread a link would open, past every one the read carries: the newest ten of `upTo`, and the server's whole. */
const LONG_TWO = "cccccccc-cccc-4ccc-8ccc-000000000004";

let listed = [];
let wholeOf = new Map();
let failing = new Set();
let asked = [];
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  asked.push(u.pathname + (u.searchParams.get("q") ? `?q=${u.searchParams.get("q")}` : ""));
  const one = /^\/api\/v1\/conversations\/([^/]+)$/.exec(u.pathname);
  if (one) {
    if (failing.has(one[1])) return json(500, { ok: false, error: { code: "internal", message: "down" } });
    const messages = wholeOf.get(one[1]) ?? [];
    return json(200, { ok: true, data: { conversation: dto(one[1], messages), messages } });
  }
  if (u.pathname === "/api/v1/conversations") {
    const q = u.searchParams.get("q");
    if (q) return json(200, { ok: true, data: { conversations: q === "invoice" ? [listed[0]] : [] } });
    return json(200, { ok: true, data: { conversations: listed } });
  }
  if (u.pathname === "/api/v1/calls") return json(200, { ok: true, data: { calls: [] } });
  if (u.pathname === "/api/v1/escalations") return json(200, { ok: true, data: { escalations: [] } });
  if (u.pathname === "/api/v1/templates") return json(200, { ok: true, data: { templates: [] } });
  if (u.pathname === "/api/v1/workspaces")
    return json(200, { ok: true, data: { workspaces: globalThis.window.__WORKSPACES, activeWorkspaceId: "t1" } });
  return json(404, { ok: false, error: { code: "not_found", message: u.pathname } });
};
const threadOf = (id) => surfaceValue("inbox").THREADS.find((t) => t.conversationId === id);
const readsOf = (id) => asked.filter((p) => p === `/api/v1/conversations/${id}`).length;
const msgIds = (t) => t.timeline.filter((e) => e.type === "msg").map((e) => e.messageId);
/** The Inbox read again, as a message or a tick moves it. */
const readInbox = () => quiet(() => inboxOverride.apply());
/** The next time a thread's own read redraws the Inbox. */
const redrawn = () =>
  new Promise((resolve) => globalThis.window.addEventListener("surface:inbox", resolve, { once: true }));

test("a thread with more than the read carries is partial until it is opened; one with fewer is whole", async () => {
  wholeOf = new Map([[LONG, range(LONG, 0, 25)]]);
  listed = [dto(LONG, range(LONG, 15, 25)), dto(SHORT, range(SHORT, 0, 3))];
  asked = [];
  await readInbox();
  assert.equal(threadOf(LONG).partial, true);
  assert.equal(msgIds(threadOf(LONG)).length, 10);
  assert.equal(threadOf(SHORT).partial, undefined, "the read holds it whole: nothing waits");
  assert.equal(readsOf(LONG), 0, "REGRESSION: a thread nobody opened was read");
});

test("opened, a thread is read once, drawn whole, and every read of the Inbox after lays its newest over what was kept", async () => {
  const told = redrawn();
  await readThreadWhole(LONG);
  await told;
  assert.equal(readsOf(LONG), 1);
  assert.equal(threadOf(LONG).partial, undefined);
  assert.deepEqual(msgIds(threadOf(LONG)), idsOf(range(LONG, 0, 25)), "every message, in reading order");
  await readThreadWhole(LONG);
  assert.equal(readsOf(LONG), 1, "kept: opened again, it is not read again");

  // One more arrives, and a tick moves the newest the receptionist sent: the list's newest, laid over what was kept.
  const ticked = { ...wire(LONG, 23), status: "read" };
  listed = [
    dto(LONG, [...range(LONG, 16, 23), ticked, wire(LONG, 24), wire(LONG, 25)]),
    dto(SHORT, range(SHORT, 0, 3)),
  ];
  await readInbox();
  assert.equal(readsOf(LONG), 1, "the newest the list carries meet what was kept: nothing is read again");
  assert.deepEqual(msgIds(threadOf(LONG)), idsOf(range(LONG, 0, 26)), "the new one at its end, none lost before it");
  assert.equal(
    threadOf(LONG).timeline.find((e) => e.messageId === ticked.id).status,
    "read",
    "a message both hold is drawn as the newest read says it",
  );
});

test("more arrived than the read carries: what came between is read again, once, and drawn", async () => {
  wholeOf.set(LONG, range(LONG, 0, 40));
  listed = [dto(LONG, range(LONG, 30, 40)), dto(SHORT, range(SHORT, 0, 3))];
  const told = redrawn();
  await readInbox();
  await told;
  assert.equal(readsOf(LONG), 2, "read again, once");
  assert.deepEqual(
    msgIds(threadOf(LONG)),
    idsOf(range(LONG, 0, 40)),
    "nothing missing between what was kept and the newest",
  );
  await readInbox();
  assert.equal(readsOf(LONG), 2, "and not again once they meet");
});

test("a thread whose own read fails is drawn from what the Inbox's read holds of it, rather than waiting on nothing", async () => {
  failing = new Set([LONG_TWO]);
  listed = [...listed, dto(LONG_TWO, range(LONG_TWO, 20, 30))];
  await readInbox();
  assert.equal(threadOf(LONG_TWO).partial, true);
  await quiet(() => readThreadWhole(LONG_TWO));
  assert.equal(threadOf(LONG_TWO).partial, undefined, "REGRESSION: a failed read left its conversation empty for good");
  assert.deepEqual(msgIds(threadOf(LONG_TWO)), idsOf(range(LONG_TWO, 20, 30)));
  failing = new Set();
});

test("a refresh paints a thread read whole before it as partial again, since nothing is kept whole across a load", () => {
  const painted = toInboxThreadVM(dto(LONG_TWO.replace(/4$/, "9"), range(LONG_TWO, 0, 30)), null, ZONE);
  assert.equal(revivedThread(painted).partial, true);
  const short = toInboxThreadVM(dto(SHORT, range(SHORT, 0, 3)), null, ZONE);
  assert.equal(revivedThread(short), short, "one the read holds whole is painted as it was");
  assert.equal(revivedThread(threadOf(LONG)).partial, undefined, "one this tab keeps whole stays whole");
});

test("a partial thread draws its head and its reply box, and its conversation only once its own read lands", () => {
  const labels = { whatsapp: "WhatsApp", phone: "Phone", sms: "Text", email: "Email" };
  const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
  const found = (tree, pred) => {
    let hit = null;
    const walk = (n) => {
      if (hit || n == null || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (pred(n)) hit = n;
      walk(n.props?.children);
      walk(n.rendered);
    };
    walk(tree);
    return hit;
  };
  const vm = toInboxThreadVM(dto(LONG_TWO, range(LONG_TWO, 20, 30)), null, ZONE);
  fresh();
  const waiting = InboxThread({ thread: { ...vm, partial: true }, channelLabels: labels });
  assert.ok(found(waiting, byTestId("ix-timeline-reading")), "its conversation waits");
  assert.equal(
    found(waiting, (n) => n.props?.["data-mid"]),
    null,
    "and draws none of the newest ten meanwhile",
  );
  assert.ok(found(waiting, byTestId("ix-th-status")), "its head and its foot are drawn");
  const drawn = drawAgain(() => InboxThread({ thread: vm, channelLabels: labels }));
  assert.equal(found(drawn, byTestId("ix-timeline-reading")), null);
  assert.ok(
    found(drawn, (n) => n.props?.["data-mid"]),
    "drawn whole once it lands",
  );
});

test("Conversations' box asks the server for the threads that say its words, and a row it names matches", async () => {
  const rows = listed.map((c) => toConversationVM(c, null, ZONE));
  let visible = [];
  const Box = () => {
    visible = useCvVisible(rows, "all", "invoice");
    return null;
  };
  fresh();
  Box();
  assert.equal(visible.length, 0, "no row's own words say it");
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.ok(asked.includes("/api/v1/conversations?q=invoice"), "asked of the server, over every thread's words");
  drawAgain(() => Box());
  assert.deepEqual(
    visible.map((r) => r.id),
    [listed[0].id],
    "REGRESSION: a thread whose earlier message said it was not found",
  );
});
