/**
 * The server behind the Inbox (I5).
 *
 * Mapped end to end, 15 Sep 2026:
 * - the list read no message's channel, so a text-message thread read as WhatsApp: its window closed, and its
 *   composer offered only templates, which the reply route refuses on a text (production holds two inbound texts);
 * - the messages were read with .limit(4000) under PostgREST's max_rows of 1,000, so past a thousand messages the
 *   older threads came back with none and read "No messages yet";
 * - escalated threads outside the newest hundred were fetched one by one, the first twenty only: the twenty-first
 *   waiting customer vanished from the Inbox, with nothing said;
 * - a send job that died marked its message failed and flagged nothing: a customer with no answer, and a quiet Inbox.
 * Run through the real route, the real bridge over a fake wire, the real settle, and the view model.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
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
const list = await import(at("apps/dashboard/app/api/v1/conversations/route.ts"));
const { groupMessages } = await import(at("apps/dashboard/src/server/dto.ts"));
const { settleJob } = await import(at("packages/jobs/src/settle.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const HOUR = 3_600_000;
const ZONE = "America/New_York";
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const uuid = (i) => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`;
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];
const inA = `?workspace=${A}`;
const ctxFor = (tables, params = {}, opts = {}) => ({
  supabase: fakeDb(tables, {}, {}, opts),
  userId: USER,
  email: "ada@example.com",
  params,
});
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
async function refused(p, code, status) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status);
    return true;
  });
}
const contact = (over = {}) => ({
  id: "k1",
  display_name: "Ada",
  wa_profile_name: null,
  phone_e164: "+15550000001",
  consent: "opted_in",
  dnc: false,
  marketing_consent: null,
  ...over,
});
const conversation = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  state: "needs_human",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: ago(HOUR),
  last_message_at: ago(HOUR),
  contact_id: "k1",
  contacts: contact(),
  ...over,
});
const message = (id, conversation_id, tenant_id, over = {}) => ({
  id,
  conversation_id,
  tenant_id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "hi",
  media: null,
  meta: null,
  status: "received",
  channel: "whatsapp",
  channel_ts: ago(HOUR),
  created_at: ago(HOUR),
  ...over,
});

/* -------------------------------- a text thread -------------------------------- */

test("a text-message thread is a text thread: its window is open and its channel is Text", () => {
  const rows = [
    message("m1", uuid(1), A, {
      body: "Can I come at 4?",
      channel: "sms",
      created_at: ago(50 * HOUR),
      channel_ts: ago(50 * HOUR),
    }),
  ];
  const [msg] = groupMessages(rows).get(uuid(1));
  assert.equal(msg.channel, "sms", "REGRESSION: the list read no channel, so every thread read as WhatsApp");
  const dto = {
    id: uuid(1),
    state: "needs_human",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    assignee_is_me: false,
    last_wa_inbound_at: null,
    last_message_at: ago(50 * HOUR),
    contact: contact(),
    messages: [msg],
  };
  const vm = toInboxThreadVM(dto, null, ZONE, new Date());
  assert.deepEqual(
    [vm.windowOpen, vm.primaryChannel, vm.channels, vm.timeline[0].channel],
    [true, "sms", ["sms"], "sms"],
    "REGRESSION: its window read closed, and its composer offered only templates the route refuses on a text",
  );
  assert.match(vm.whoMeta, /^Text · /);
});

/* ------------------------------- the list's read ------------------------------- */

test("the Inbox's read reaches every thread's messages past PostgREST's thousand rows -- not the newest thousand only", async () => {
  const conversations = Array.from({ length: 30 }, (_, i) =>
    conversation(uuid(i), A, { last_message_at: ago(i * HOUR) }),
  );
  // Ninety messages a thread, 2,700 in all: the read asked for 4,000 and PostgREST answered 1,000.
  const messages = conversations.flatMap((c, i) =>
    Array.from({ length: 90 }, (_, j) =>
      message(`m-${i}-${j}`, c.id, A, { created_at: ago(i * HOUR + j * 1000), channel_ts: ago(i * HOUR + j * 1000) }),
    ),
  );
  const out = await list.GET.run(
    get(inA),
    ctxFor({ memberships: both("viewer", "viewer"), conversations, messages }, {}, { maxRows: 1000 }),
  );
  const empty = out.conversations.filter((c) => c.messages.length === 0);
  assert.equal(
    empty.length,
    0,
    `REGRESSION: ${empty.length} threads came back with no messages and read "No messages yet"`,
  );
  assert.equal(
    out.conversations.reduce((n, c) => n + c.messages.length, 0),
    2700,
  );
});

test("the escalated threads the page did not load come back in one read, by id, in the tab's workspace only; a malformed id refuses", async () => {
  const C1 = uuid(1);
  const C2 = uuid(2);
  const tables = {
    memberships: both("viewer", "viewer"),
    conversations: [conversation(C1, A), conversation(C2, A), conversation(uuid(9), B)],
    messages: [message("m1", C1, A), message("m2", C2, A), message("m9", uuid(9), B)],
  };
  const out = await list.GET.run(get(`?ids=${C2},${uuid(9)}&workspace=${A}`), ctxFor(tables));
  assert.deepEqual(
    out.conversations.map((c) => c.id),
    [C2],
    "REGRESSION: the ids were ignored; the ones asked for, in the tab's workspace only",
  );
  assert.deepEqual(
    out.conversations[0].messages.map((m) => m.id),
    ["m2"],
  );
  await refused(list.GET.run(get(`?ids=not-a-uuid&workspace=${A}`), ctxFor(tables)), "not_found", 404);
});

/* --------------------------------- the job's end --------------------------------- */

test("a send job that died flags the thread for a person, as a failed delivery does; a message that had already gone out flags nothing", async () => {
  const messages = [
    { id: "m1", tenant_id: A, conversation_id: uuid(1), sender: "ai", status: "queued", error: null },
    { id: "m2", tenant_id: A, conversation_id: uuid(2), sender: "human", status: "sent", error: null },
  ];
  const escalations = [];
  const db = fakeDb({ messages, escalations });
  const send = (id) => ({ id: `job-${id}`, kind: "outbound_send", tenant_id: A, payload: { message_id: id } });
  assert.deepEqual(await settleJob(db, send("m1"), true), [{ what: "message", changed: true, flagged: "opened" }]);
  assert.equal(escalations.length, 1, "REGRESSION: the reply never left, and the Inbox said nothing");
  assert.deepEqual(
    [escalations[0].tenant_id, escalations[0].conversation_id, escalations[0].reason],
    [A, uuid(1), "send_failed"],
  );
  assert.equal(
    escalations[0].details,
    "The receptionist's reply never left: the job that would have sent this never ran.",
  );
  assert.deepEqual(await settleJob(db, send("m2"), false), [{ what: "message", changed: false }]);
  assert.equal(escalations.length, 1, "a message that had already gone out is not a failure");
});

test("an email intake that died leaves the email flagged for a person, and marks the mailbox whether or not there is a thread", async () => {
  // The deadman sweep used to cover this by accident and wrongly -- it claimed
  // the row, called it a receptionist that never answered, and marked it
  // handled, after which the retrying job read `processed` and stopped. It no
  // longer touches email, so the intake owns its own failure: the thread it
  // managed to store the email on is flagged the way a finished intake would
  // have flagged it.
  const messages = [
    {
      id: "m1",
      tenant_id: A,
      conversation_id: uuid(3),
      channel: "email",
      external_id: "rcv_stored",
      status: "received",
    },
  ];
  const escalations = [];
  const mailboxes = [
    {
      id: "mb-1",
      tenant_id: A,
      local_part: "bestmovers",
      from_name: "Best Movers",
      last_received_at: null,
      last_error: null,
    },
  ];
  const db = fakeDb({ messages, escalations, mailboxes });
  const intake = (receivedId) => ({
    id: `job-${receivedId}`,
    kind: "email_ingest",
    tenant_id: A,
    payload: { mailbox_id: "mb-1", received_id: receivedId },
  });

  assert.deepEqual(await settleJob(db, intake("rcv_stored"), true), [
    { what: "email", changed: true, flagged: "opened", mailbox: "marked" },
  ]);
  assert.equal(escalations.length, 1);
  assert.deepEqual([escalations[0].conversation_id, escalations[0].reason], [uuid(3), "email_review"]);
  assert.match(escalations[0].details, /could not be taken in/);
  assert.match(escalations[0].details, /reply from the Inbox/i, "what the person is to do, not who to blame");

  // Died before it stored anything: there is no thread to flag, and inventing
  // a hold would mean inventing a conversation to hang it on. The MAILBOX is
  // there either way, so that is where it is said -- and it is what the owner
  // reads on Connections.
  mailboxes[0].last_error = null;
  assert.deepEqual(await settleJob(db, intake("rcv_never_stored"), true), [
    { what: "email", changed: false, mailbox: "marked" },
  ]);
  assert.equal(escalations.length, 1, "nothing invented");
  assert.match(mailboxes[0].last_error, /could not be taken in/);
  assert.doesNotMatch(
    mailboxes[0].last_error,
    /job|lease|error/i,
    "a sentence for the owner, never the job's own reason",
  );

  // The job says which mailbox; a mailbox that is not this workspace's is not
  // marked, and does not report that it was.
  assert.deepEqual(await settleJob(db, { ...intake("rcv_never_stored"), tenant_id: uuid(9) }, true), [
    { what: "email", changed: false, mailbox: "gone" },
  ]);
  assert.deepEqual(
    await settleJob(db, { ...intake("rcv_never_stored"), payload: { received_id: "rcv_never_stored" } }, true),
    [{ what: "email", changed: false }],
    "a job naming no mailbox speaks for none",
  );

  // A mailbox that could not be written costs nobody their escalation.
  const hurt = fakeDb(
    { messages, escalations: [], mailboxes },
    { "mailboxes.update": { message: "deadlock detected" } },
  );
  assert.deepEqual(await settleJob(hurt, intake("rcv_stored"), true), [
    { what: "email", changed: true, flagged: "opened", mailbox: "failed" },
  ]);

  assert.deepEqual(await settleJob(db, { ...intake("x"), payload: { mailbox_id: "mb-1" } }, true), [
    { what: "email", changed: false, error: "no received_id on the job" },
  ]);
});

/* ------------------------------- the bridge's read ------------------------------- */

globalThis.window = {
  location: {
    pathname: "/w/harbor",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  __WORKSPACES: [{ id: "t1", slug: "harbor", name: "Harbor", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const { inboxOverride } = await quiet(() => import(at("apps/dashboard/src/legacy-bridge/surface-data.ts")));

test("the bridge asks once for every escalated thread past the newest hundred, and says how many it could not read", async () => {
  const dtoConv = (id) => ({
    id,
    state: "needs_human",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    assignee_is_me: false,
    last_wa_inbound_at: ago(HOUR),
    last_message_at: ago(HOUR),
    contact: contact({ id: `k-${id}` }),
    messages: [],
  });
  const newest = Array.from({ length: 100 }, (_, i) => dtoConv(uuid(i)));
  const waiting = Array.from({ length: 25 }, (_, i) => ({
    id: `e${i}`,
    reason: "human_token",
    details: null,
    state: "open",
    created_at: ago(HOUR),
    conversation_id: uuid(200 + i),
  }));
  let asked = [];
  let idsFail = false;
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const ids = u.searchParams.get("ids");
    asked.push(`${u.pathname}${ids ? "?ids" : ""}`);
    if (u.pathname === "/api/v1/conversations") {
      if (ids && idsFail) return json(500, { ok: false, error: { code: "internal", message: "down" } });
      return json(200, { ok: true, data: { conversations: ids ? ids.split(",").map(dtoConv) : newest } });
    }
    if (u.pathname === "/api/v1/escalations") return json(200, { ok: true, data: { escalations: waiting } });
    if (u.pathname === "/api/v1/templates") return json(200, { ok: true, data: { templates: [] } });
    if (u.pathname === "/api/v1/workspaces")
      return json(200, { ok: true, data: { workspaces: globalThis.window.__WORKSPACES, activeWorkspaceId: "t1" } });
    return json(404, { ok: false, error: { code: "not_found", message: u.pathname } });
  };
  await quiet(() => inboxOverride.apply());
  assert.equal(
    asked.filter((p) => p.startsWith("/api/v1/conversations/")).length,
    0,
    "REGRESSION: one read per thread",
  );
  assert.equal(asked.filter((p) => p === "/api/v1/conversations?ids").length, 1, "one read for all of them");
  assert.equal(
    globalThis.window.INBOX_DATA.THREADS.length,
    125,
    "REGRESSION: the first twenty only; the other five vanished",
  );
  assert.equal(globalThis.window.INBOX_DATA.UNREAD_ESCALATED, 0);

  asked = [];
  idsFail = true;
  await quiet(() => inboxOverride.apply());
  assert.equal(
    globalThis.window.INBOX_DATA.UNREAD_ESCALATED,
    25,
    "every waiting customer the read could not bring is counted, and the list says so",
  );
});

/* -------------------------------- the composer -------------------------------- */

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = fn();
    return cells[k];
  },
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = {
  visibilityState: "hidden",
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }),
};

test("the composer of a text thread says Text, not WhatsApp", async () => {
  await import(at("apps/dashboard/src/legacy/components/data-bits.jsx"));
  for (const k of [
    "StatePill",
    "MoreMenu",
    "EmptyState",
    "PolicyChip",
    "TlMedia",
    "FailedRead",
    "Confirm",
    "usePPToast",
    "useHotkey",
  ])
    globalThis[k] = globalThis.window[k];
  await import(at("apps/dashboard/src/legacy/pages/inbox-thread.jsx"));
  const walk = (n, fn) => {
    if (n == null || typeof n !== "object") return;
    if (Array.isArray(n)) {
      for (const k of n) walk(k, fn);
      return;
    }
    fn(n);
    walk(n.props?.children, fn);
    walk(n.rendered, fn);
  };
  const find = (tree, pred) => {
    let hit;
    walk(tree, (n) => {
      if (hit === undefined && pred(n)) hit = n;
    });
    return hit;
  };
  const rows = [message("m1", uuid(1), A, { channel: "sms", created_at: ago(50 * HOUR), channel_ts: ago(50 * HOUR) })];
  const vm = toInboxThreadVM(
    {
      id: uuid(1),
      state: "open",
      paused_until: null,
      snooze_until: null,
      assignee_user_id: null,
      last_wa_inbound_at: null,
      last_message_at: ago(HOUR),
      contact: contact(),
      messages: groupMessages(rows).get(uuid(1)),
    },
    null,
    ZONE,
    new Date(),
  );
  cells = [];
  frames.begin();
  const tree = globalThis.window.InboxComposer({ thread: vm, reply: "", onSend() {} });
  // The reply box names the channel in its field; the line under it that said "Text · to Ada" is gone.
  assert.equal(
    find(tree, (n) => n.type === "textarea").props.placeholder,
    "Text to Ada…",
    "REGRESSION: a text was said to go out on WhatsApp",
  );
});
