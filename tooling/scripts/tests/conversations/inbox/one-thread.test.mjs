/**
 * One thread (docs/plans/2026-09-21-one-thread.md).
 *
 * The Inbox drew a conversation with InboxThread and Conversations drew the same one with CvViewer: two headers,
 * two sets of bubbles, two sets of actions. #746 fixed an email's quoted chain in one of them and said the other
 * drew the same messages the same way; it did not. And Conversations could not act -- "View thread in Inbox" opened
 * a second screen for the same conversation. ThreadPane is the one thread: given a thread, it draws InboxThread and
 * owns the verbs a real thread has; both tabs mount it.
 *
 * Run against the pages on a stub React, never read from them.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { stateOf, memberWords, toInboxThreadVM, toConversationVM, toCallVM } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, settle } from "../../_legacy-react.mjs";

const ZONE = "America/New_York";

/* -------------------------------- a browser -------------------------------- */

const went = [];
const timers = { setTimeout, clearTimeout, setInterval, clearInterval };
const realFetch = globalThis.fetch;
installLegacyReact({
  location: {
    pathname: "/w/marisas",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: "t1", slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: {
    nav: (to) => went.push(to),
    R: { client: (id) => `clients/${id}`, thread: (id) => `inbox/${id}` },
    IX_NOW: "12:04",
    CONF: { SAFE: 0.8, MED: 0.5 },
  },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  canDo: () => true,
  gate: () => ({}),
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
const realConsoleError = console.error;
console.error = () => {};
after(() => {
  Object.assign(globalThis, timers, { fetch: realFetch });
  console.error = realConsoleError;
});
// The shell's own helpers the pane spreads and calls (gate, touchSwipe, the toast, canDo), as the app publishes them.
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const S = "../../../../../apps/dashboard/src";
const { ThreadPane } = await import(`${S}/surfaces/inbox/thread/thread-pane.tsx`);
const { threadVerbs } = await import(`${S}/surfaces/inbox/thread/thread-verbs.tsx`);
const { InboxThread } = await import(`${S}/surfaces/inbox/thread/thread.tsx`);
const { ConversationsPage } = await import(`${S}/surfaces/inbox/pages/conversations-page.tsx`);
const { ixHeld } = await import(`${S}/surfaces/inbox/rules.ts`);
const { OWN_VERBS, VW_STORE } = await import(`${S}/surfaces/inbox/store.ts`);
const { MoreMenu } = await import(`${S}/surfaces/kit/more-menu/more-menu.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { startSurfaces } = await import(`${S}/legacy-bridge/surface-runner.ts`);
// The courier reads the surfaces again behind a write (refresh-map.ts), loaded on the first one: loaded here, so it is there.
await import(`${S}/legacy-bridge/refresh-map.ts`);
// The runner the re-read goes through; it boots nothing.
const stopRunner = startSurfaces([], () => () => {});
after(() => {
  stopRunner();
  setSurfaceValue("inbox", undefined);
  setSurfaceValue("conversations", undefined);
});

/* ------------------- the server: the requests the verbs make, over a fetch this test holds ------------------- */

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** The writes asked, the answer each gets, and the reads the surfaces make behind them (held, when the test says). */
const wire = {
  writes: [],
  held: [],
  hold: false,
  /** What a write answers, given its method, path and body: a Response, or nothing for the plain 200. */
  write: null,
  /** Called as a write arrives, before it is answered. */
  onWrite: null,
  /** What the accepted write's `data` says. */
  data: () => ({}),
  reset() {
    this.writes.length = 0;
    this.held.length = 0;
    this.hold = false;
    this.write = null;
    this.onWrite = null;
    this.data = () => ({});
  },
};
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.test");
  const method = init.method ?? "GET";
  if (method === "GET") {
    if (wire.hold) return new Promise((res) => wire.held.push(res));
    return json(500, { ok: false, error: { code: "internal", message: "not read here" } });
  }
  const body = init.body ? JSON.parse(init.body) : undefined;
  wire.writes.push([method, u.pathname, body]);
  wire.onWrite?.(method, u.pathname, body);
  const answer = wire.write?.(method, u.pathname, body);
  return answer ?? json(200, { ok: true, data: wire.data(u.pathname) });
};
/** The surfaces read behind a write land (as answers that say nothing new), and every read after is answered at once. */
const reread = () => {
  wire.hold = false;
  for (const res of wire.held.splice(0))
    res(json(500, { ok: false, error: { code: "internal", message: "not read here" } }));
};
/** Wait, in turns of the event loop, for what the code under test does behind an await; false if it never came. */
const until = async (cond, turns = 5000) => {
  for (let i = 0; i < turns && !cond(); i++) await settle();
  return cond();
};
/** A request's route as the conversation it names and the verb it asks: `[id, "take-over"]`. */
const verbOf = (path) => path.split("/").slice(-2);

/* --------------------------------- the pages --------------------------------- */

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
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const fire = (name) => globalThis.dispatchEvent(new Event(name));

// A real thread as the Inbox's read hands it over (toInboxThreadVM's shape, the fields the pane reads).
const rosa = {
  id: "th-rosa",
  real: true,
  who: "Rosa Díaz",
  conversationId: "c1",
  state: "escalated",
  needsYou: true,
  takenOver: false,
  claimedByOther: false,
  archived: false,
  tags: [],
  whoMeta: "",
  lastAtMs: 1000,
  timeline: [],
  primaryChannel: "whatsapp",
};
// The Inbox's read, as the surface publishes it (INBOX_DATA to the shell): the threads, and the words for the channels.
const store = (...threads) => {
  setSurfaceValue("inbox", {
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    THREADS: threads,
    CHANNEL_LABELS: { whatsapp: "WhatsApp" },
    INBOX_BASELINE: { doneThisWeek: 0 },
  });
};
// The pane drawn alone, by the id a Conversations row carries; what it hands InboxThread is caught: the element is
// asked for, its props kept, and nothing is drawn in its place.
const drawn = [];
let catching = false;
const drawElement = globalThis.React.createElement;
globalThis.React.createElement = (type, p, ...kids) => {
  if (catching && type === InboxThread) {
    drawn.push({ ...(p || {}) });
    return null;
  }
  return drawElement(type, p, ...kids);
};
const catchPane = () => {
  drawn.length = 0;
  catching = true;
};
const releasePane = () => {
  catching = false;
};
const pane = (props = {}) => again(() => ThreadPane({ threadId: "th-rosa", ...props }));

/* --------------------------------- the pane --------------------------------- */

test("given the id a Conversations row carries, the pane draws InboxThread for that thread", () => {
  fresh();
  catchPane();
  store(rosa);
  try {
    pane();
    assert.equal(drawn.at(-1).thread.id, "th-rosa");
  } finally {
    releasePane();
  }
});

test("its verbs reach the server with that thread -- the same verbs, from wherever it is open", async () => {
  fresh();
  catchPane();
  store(rosa);
  wire.reset();
  try {
    pane();
    const p = drawn.at(-1);
    // One at a time: the snooze reads the workspace's zone before it asks, and the order asked is what is proved.
    p.onTakeOver("th-rosa");
    await until(() => wire.writes.length === 1);
    p.onSnooze("th-rosa");
    await until(() => wire.writes.length === 2);
    p.onArchive("th-rosa");
    await until(() => wire.writes.length === 3);
    const sent = await p.onSend("th-rosa", "See you Friday!");
    // The request names the thread by its conversation, as the route does (th-rosa is conversation c1).
    assert.deepEqual(
      wire.writes.map(([method, path]) => [method, ...verbOf(path)]),
      [
        ["POST", "c1", "take-over"],
        ["POST", "c1", "snooze"],
        ["POST", "c1", "archive"],
        ["POST", "c1", "reply"],
      ],
    );
    assert.deepEqual(wire.writes.at(-1)[2], { text: "See you Friday!" }, "the words the reply box sent");
    assert.equal(sent, true, "the reply box is told the server took it");
  } finally {
    await until(() => OWN_VERBS.n === 0);
    releasePane();
  }
});

test("before the Inbox's read lands, the pane says it is opening -- and opens nobody else's conversation", () => {
  fresh();
  catchPane();
  store();
  try {
    const tree = pane();
    assert.ok(find(tree, byTestId("tp-opening")), "it says the conversation is on its way");
    assert.equal(drawn.length, 0, "and draws no thread in its place");
  } finally {
    releasePane();
  }
});

test("a re-read that moves the thread says so on the pane; your own act does not, its toast has", async () => {
  fresh();
  catchPane();
  store(rosa);
  wire.reset();
  try {
    pane();
    // A teammate handed Rosa back: the next read has her in Handled.
    store({ ...rosa, state: "done", needsYou: false });
    fire("surface:inbox");
    pane();
    assert.equal(drawn.at(-1).notice, "Moved to Handled", "the pane says what happened while you read");

    // Your own archive: its re-read lands inside the verb, the way client/api.ts refreshes after a write.
    fresh();
    drawn.length = 0;
    store(rosa);
    pane();
    wire.onWrite = () => {
      store({ ...rosa, state: "done", needsYou: false, archived: true });
      fire("surface:inbox");
    };
    drawn.at(-1).onArchive("th-rosa");
    await until(() => OWN_VERBS.n === 0);
    pane();
    assert.equal(drawn.at(-1).notice, null, "REGRESSION: the pane announced your own act to you");
  } finally {
    wire.reset();
    releasePane();
  }
});

test("a snooze, an archive or a take-over is said the moment the server takes it -- not after the Inbox, the threads and Today are read again", async () => {
  // The loading standard's D, the Inbox's way: the server owns the thread, so the pane still repaints from the
  // re-read, but the toast waited for write + three surfaces read (~900ms) before saying anything. It comes at
  // acceptance now; the act stays "yours" until the re-read lands, so the pane does not announce it to you.
  const said = [];
  const { verb } = threadVerbs((m) => said.push(m));
  wire.reset();
  wire.hold = true; // the surfaces are read again, behind: held until the test lets them land
  wire.data = (path) => ({ message_id: path.endsWith("/reply") ? "m-1" : undefined });
  try {
    for (const [name, words] of [
      ["snooze", "snoozed until tomorrow 10:00"],
      ["archive", "archived"],
      ["take-over", "you have it"],
      ["hand-back", "handed back"],
      ["wake", "awake"],
    ]) {
      said.length = 0;
      wire.held.length = 0;
      const done = verb(rosa, name, {}, words);
      // The door answered 2xx and the surfaces are being read again: the re-read is out, and not yet landed.
      assert.ok(await until(() => wire.held.length > 0), `${name}: the re-read is asked for`);
      assert.deepEqual(verbOf(wire.writes.at(-1)[1]), ["c1", name]);
      assert.equal(said.length, 1, `${name}: said at acceptance, before the re-read landed`);
      assert.match(
        String(
          said[0].msg.props.children.join
            ? said[0].msg.props.children.map((c) => (typeof c === "string" ? c : "")).join("")
            : "",
        ),
        new RegExp(words.split(" ")[0]),
      );
      assert.ok(OWN_VERBS.n > 0, "and still your own act while its re-read is out");
      reread();
      assert.equal(await done, true);
      assert.equal(said.length, 1, "said once, not again when the re-read lands");
      wire.hold = true;
    }
    // A reply's toast carries the receipt (its Undo window), so it still waits for the server's answer.
    said.length = 0;
    wire.held.length = 0;
    const sending = verb(rosa, "reply", { text: "See you Friday!" }, "reply on its way", true);
    assert.ok(await until(() => wire.held.length > 0), "the re-read of a reply is asked for");
    assert.equal(said.length, 0, "a reply is said with its receipt");
    reread();
    await sending;
    assert.equal(said.length, 1);
    assert.deepEqual(
      [verbOf(wire.writes.at(-1)[1]), wire.writes.at(-1)[2]],
      [["c1", "reply"], { text: "See you Friday!" }],
      "and it is the reply that was asked for, with nothing said of it before its answer",
    );
  } finally {
    reread();
    wire.reset();
  }
});

test("a refused act says the refusal once, and never that it happened", async () => {
  const said = [];
  const { verb } = threadVerbs((m) => said.push(m));
  wire.reset();
  wire.write = () =>
    json(409, { ok: false, error: { code: "conflict", message: "A teammate has this conversation now." } });
  try {
    assert.equal(await verb(rosa, "take-over", undefined, "you have it"), false);
    assert.deepEqual(
      said.map((m) => m.tone),
      ["danger"],
    );
  } finally {
    wire.reset();
  }
});

/* ---------------------------- a draft counting down ---------------------------- */

// Moved here from veto-ui.test.mjs, where it read inbox.jsx as a string: the hold is a function now, so it is run.
test("a draft's Hold and your first keystroke both withdraw it on the server; a withdrawal that failed claims no hold", async () => {
  const said = [];
  const { hold } = threadVerbs((m) => said.push(m));
  VW_STORE.state = {};
  wire.reset();
  // The draft each cancel-send names: the ids asked, in order.
  const asked = () => wire.writes.map(([, path]) => path.split("/").at(-2));
  const draft = (messageId) => ({ ...rosa, veto: { messageId, endsAtMs: Date.now() + 20_000, draft: "See you at 3" } });
  const a = draft("m-hold");
  const b = draft("m-type");
  try {
    hold(a, "hold");
    hold(b, "type");
    await until(() => said.length === 2); // each says it was held, once the server took it
    assert.deepEqual(asked(), ["m-hold", "m-type"], "both went to the server, each for its own draft");
    assert.ok(ixHeld(VW_STORE.state, a) && ixHeld(VW_STORE.state, b));
    hold(a, "hold");
    assert.equal(asked().length, 2, "a draft already withdrawn is not asked about again");

    // It may already have gone out: the refusal is said, and no hold is claimed.
    wire.write = () => json(409, { ok: false, error: { code: "conflict", message: "It had already been sent." } });
    const late = draft("m-late");
    hold(late, "hold");
    assert.ok(ixHeld(VW_STORE.state, late), "the countdown stops at once");
    await until(() => !ixHeld(VW_STORE.state, late));
    assert.equal(ixHeld(VW_STORE.state, late), false, "REGRESSION: the UI claimed a hold that never happened");
    assert.equal(said.at(-1).tone, "danger", "and says the server's refusal");
  } finally {
    wire.reset();
  }
});

/* ------------------------------- the thread's menu ------------------------------- */

const NOW = new Date("2026-09-14T14:00:00Z");
const at = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
// A conversation as GET conversations returns it, made a thread by the Inbox's own view model.
const convo = (over = {}) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: at(60),
  last_message_at: at(59),
  contact: {
    id: "k1",
    display_name: "Rosa Díaz",
    wa_profile_name: null,
    phone_e164: "+13475550101",
    consent: "opted_in",
    dnc: false,
  },
  messages: [
    {
      id: "m1",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Do you have Friday?",
      media: null,
      meta: null,
      status: "received",
      channel: "whatsapp",
      created_at: at(60),
      channel_ts: at(60),
    },
    {
      id: "m2",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Yes, 3pm works.",
      media: null,
      meta: null,
      status: "read",
      channel: "whatsapp",
      created_at: at(59),
      channel_ts: at(59),
    },
  ],
  ...over,
});

test("Export is in the thread's menu, from the conversation's own route -- in whichever tab the thread is open", () => {
  fresh();
  releasePane();
  const vm = toInboxThreadVM(convo(), null, ZONE, NOW);
  store(vm);
  globalThis.window.__href = (route, p) => `${route}|${p.id}`;
  const anchors = [];
  const realCreate = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => {
    const a = {
      tag,
      href: null,
      download: null,
      clicked: 0,
      click() {
        this.clicked += 1;
      },
      remove() {},
      setAttribute() {},
      style: {},
      classList: { add() {}, remove() {}, contains: () => false },
    };
    anchors.push(a);
    return a;
  };
  try {
    const tree = again(() => ThreadPane({ threadId: vm.id }));
    const menu = find(tree, (n) => n.type === MoreMenu);
    assert.ok(menu, "the thread has its menu");
    const item = menu.props.items.find((it) => it.label === "Export transcript");
    assert.ok(item, "REGRESSION: Export was a button in Conversations' header only");
    item.onClick();
    const a = anchors.find((x) => x.tag === "a");
    assert.equal(a.href, "GET conversations/[id]/export|c1", "the file the conversation's own route writes");
    assert.equal(a.download, "", "fetched as a file, not opened as a page");
    assert.equal(a.clicked, 1);
  } finally {
    globalThis.document.createElement = realCreate;
    delete globalThis.window.__href;
  }
});

/* ------------------------------ Conversations ------------------------------ */

const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
// Conversations lists a row; the Inbox's read holds the same conversation as a thread -- one GET conversations page.
const listed = (rows, threads = []) => {
  setSurfaceValue("conversations", {
    CONVERSATIONS: rows,
    CV_CHANNELS: [{ id: "all", label: "All" }],
    CALLS_READ: true,
  });
  store(...threads);
};
const conversations = (props = {}) => again(() => ConversationsPage({ channel: "all", initialId: null, ...props }));
// A call as the calls route returns it: a call record, with no recording stored yet.
const call = {
  id: "k7",
  retell_call_id: "r-k7",
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+19175550106",
  from_raw: null,
  to_e164: "+13055550123",
  started_at: at(30),
  ended_at: at(27),
  duration_ms: 190_000,
  disconnection_reason: "agent_hangup",
  sentiment: "Positive",
  call_successful: true,
  in_voicemail: false,
  summary: "The caller asked about a bridal trial.",
  transcript_object: null,
  recording: null,
  conversation_id: null,
  contact_id: "c7",
  message_id: null,
  contact: { display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106" },
  wanted: "Wants to book a bridal trial",
  outcome: null,
  follow_up: null,
  caller_name: "Emily",
};

test("a conversation row opens the one thread: the pane beside the list is the Inbox's thread, not a second viewer", () => {
  fresh();
  releasePane();
  listed([toConversationVM(convo(), ZONE, NOW)], [toInboxThreadVM(convo(), null, ZONE, NOW)]);
  const tree = conversations();
  const thread = find(tree, (n) => n.type === InboxThread);
  assert.ok(thread, "REGRESSION: Conversations drew its own viewer for a chat");
  assert.equal(thread.props.thread.id, "th-c1", "the row's own thread");
  assert.equal(typeof thread.props.onSend, "function", "with the reply box's verb -- the thread can be answered here");
  assert.equal(
    find(tree, (n) => n.type === "button" && textOf(n).includes("View thread in Inbox")),
    undefined,
    "REGRESSION: a door to a second screen for the same conversation",
  );
  assert.equal(
    find(tree, (n) => n.props?.className === "cv-summary"),
    undefined,
    "REGRESSION: the card that repeated the latest message",
  );
});

test("a call opens its thread, at the call -- not a viewer of its own", () => {
  fresh();
  releasePane();
  const note = {
    id: "e7",
    direction: "inbound",
    sender: "system",
    type: "call_summary",
    body: "Inbound call · 3 min — Wants to book a bridal trial",
    media: null,
    meta: {},
    status: "received",
    channel: "voice",
    created_at: at(30),
    channel_ts: at(30),
  };
  listed(
    [toCallVM({ ...call, conversation_id: "c7", message_id: "e7" }, ZONE, NOW)],
    [toInboxThreadVM(convo({ id: "c7", messages: [...convo().messages, note] }), null, ZONE, NOW)],
  );
  const tree = conversations();
  const pane = find(tree, (n) => n.type === ThreadPane);
  assert.ok(pane, "REGRESSION: a call opened a viewer of its own");
  assert.deepEqual([pane.props.threadId, pane.props.focusMessageId], ["th-c7", "e7"], "its thread, opened at its note");
  const card = find(tree, byTestId("tl-call"));
  assert.equal(card.props["data-mid"], "e7", "the pane finds the card by the note's id");
  assert.ok(card.props.className.split(" ").includes("focus"), "and the card it opened at says so");
  assert.equal(
    find(tree, (n) => n.props?.className === "cv-viewer"),
    undefined,
  );
});

test("a call no thread holds opens alone, in the thread's own frame: its header, its card, and a menu of only what acts", () => {
  fresh();
  releasePane();
  listed([toCallVM(call, ZONE, NOW)]);
  const alone = find(conversations(), byTestId("cv-call-pane"));
  assert.ok(
    alone && alone.props.className.split(" ").includes("ix-thread-pane"),
    "the thread's frame, which a phone gives the screen as it gives a thread",
  );
  assert.equal(textOf(find(alone, (n) => n.props?.className === "ix-th-meta")), "Phone");
  assert.match(textOf(find(alone, byTestId("tl-call"))), /Wants to book a bridal trial/);
  assert.ok(find(alone, byTestId("ix-back")), "and the phone's Back");
  const menu = find(alone, (n) => n.type === MoreMenu);
  assert.deepEqual(
    menu.props.items.map((it) => it.label),
    ["Open profile"],
    "REGRESSION: the call header's Export and Assign did nothing outside a demo",
  );
  // Its thread is older than the page the Inbox read, so holds no note of it: the call still opens, alone.
  listed(
    [toCallVM({ ...call, conversation_id: "c-old", message_id: "e-old" }, ZONE, NOW)],
    [toInboxThreadVM(convo(), null, ZONE, NOW)],
  );
  assert.ok(
    find(conversations(), byTestId("cv-call-pane")),
    "REGRESSION: 'Opening this conversation…' for a thread that was never going to be read",
  );
});

test("a call still going is a line that says so, its clock running from its start, and it opens Live", () => {
  fresh();
  releasePane();
  const realNow = Date.now;
  Date.now = () => NOW.getTime();
  try {
    listed([{ ...toCallVM(call, ZONE, NOW), live: true, outcome: "live", ts: NOW.getTime() - 83_000 }]);
    const live = find(conversations(), byTestId("cv-call-live"));
    const part = (cls) =>
      textOf(
        find(live, (n) =>
          String(n.props?.className || "")
            .split(" ")
            .includes(cls),
        ),
      );
    assert.deepEqual([part("tl-call-kind"), part("tl-call-length")], ["On the phone now", "1:23"]);
    find(live, (n) => n.type === "button" && textOf(n).includes("Open Live")).props.onClick();
    assert.equal(went.at(-1), "live");
  } finally {
    Date.now = realNow;
  }
});

test("a link to a conversation not in view says so where it would have opened, and opens nobody else's", () => {
  fresh();
  releasePane();
  listed([toConversationVM(convo(), ZONE, NOW)], [toInboxThreadVM(convo(), null, ZONE, NOW)]);
  const tree = conversations({ initialId: "c-gone" });
  const missing = find(tree, byTestId("cv-missing-thread"));
  assert.ok(missing, "the reading pane says the conversation isn't here");
  assert.match(textOf(missing), /isn't among the newest shown here/);
  assert.equal(
    find(tree, (n) => n.type === InboxThread),
    undefined,
    "REGRESSION: another customer's reply box opened in its place",
  );
});
