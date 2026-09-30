/**
 * The Inbox keeps your place, and says what changed.
 *
 * On a real workspace the Inbox is read again whenever anything moves -- a message, any verb,
 * a tab coming back into focus -- and each re-read reseeded the page in silence:
 * - when the open thread left its bucket (a teammate handed it back, it was archived or snoozed
 *   from another tab), the pane fell to the first thread in the list: another customer opened in
 *   its place, and a half-written reply went with the old pane;
 * - a failed read of the approved templates stored [], so every closed-window thread said "No
 *   approved template yet" when the truth was that the list could not be read (the wiring
 *   audit's A15);
 * - Archive existed only as a bulk action behind a hover checkbox, and an archived thread then
 *   read "Answered by the receptionist -- no one asked for you" (A11).
 * Run against the contracts, the bridge over a fake wire, and the pages on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyAddress } from "../../_address.mjs";
import { toInboxThreadVM, stateOf, memberWords, replyWaitsOnYou } from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const rosa = {
  id: "p1",
  display_name: "Rosa Díaz",
  wa_profile_name: null,
  phone_e164: "+16465550123",
  consent: "opted_in",
  dnc: false,
};
const wrote = (id, body, min) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  created_at: ago(min),
  channel_ts: ago(min),
});
const conv = (over = {}) => ({
  id: "c1",
  state: "needs_human",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(40),
  last_message_at: ago(40),
  contact: rosa,
  messages: [wrote("m1", "Can I move my appointment to Friday?", 40)],
  ...over,
});
const asked = (over = {}) => ({
  id: "e1",
  reason: "human_token",
  details: null,
  state: "open",
  created_at: ago(40),
  ...over,
});

/* -------------------------------- a browser -------------------------------- */

const listeners = {};
globalThis.window = {
  location: {
    pathname: "/w/marisas",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  __WORKSPACES: [{ id: "t1", slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf, replyWaits: replyWaitsOnYou },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, address: await legacyAddress(), IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener: (type, fn) => {
    (listeners[type] ||= []).push(fn);
  },
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const quiet = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};

/* ------------------- the templates read, and what it leaves ------------------- */

const { inboxOverride } = await quiet(
  () => import("../../../../../apps/dashboard/src/legacy-bridge/surfaces/inbox.ts"),
);

test("REGRESSION (A15): a templates read that fails leaves null -- 'could not read' -- where it left [], 'none approved'", async () => {
  globalThis.window.fetch = async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    if (path === "/api/v1/templates") return json(500, { ok: false, error: { code: "internal", message: "down" } });
    if (path === "/api/v1/conversations") return json(200, { ok: true, data: { conversations: [conv()] } });
    if (path === "/api/v1/escalations") return json(200, { ok: true, data: { escalations: [] } });
    if (path === "/api/v1/workspaces")
      return json(200, { ok: true, data: { workspaces: globalThis.window.__WORKSPACES, activeWorkspaceId: "t1" } });
    return json(404, { ok: false, error: { code: "not_found", message: path } });
  };
  await quiet(() => inboxOverride.apply());
  assert.equal(
    globalThis.window.__TEMPLATES,
    null,
    "REGRESSION: a failed read stored [] and the page said no template was approved",
  );
  assert.equal(globalThis.window.INBOX_DATA.THREADS.length, 1, "the Inbox itself still reads");
});

/* ------------------------------ the pages, drawn ------------------------------ */

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
globalThis.useSurface = () => 0; // the bridge's hook: these tests draw once, and the redraw is proved in shell/surfaces
globalThis.document = {
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }),
};
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
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
await import("../../../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
await import("../../../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
const { InboxThread, InboxComposer } = globalThis.window;
const RealInboxThread = InboxThread;
// The one thread, which the Inbox mounts (thread-pane.jsx): loaded first, published as the page reads it.
await import("../../../../../apps/dashboard/src/legacy/pages/thread-pane.jsx");
globalThis.ThreadPane = globalThis.window.ThreadPane;
await import("../../../../../apps/dashboard/src/legacy/pages/inbox.jsx");

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
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const click = { stopPropagation() {}, preventDefault() {} };

test("what changed on the open thread while you had it open, in one line -- and nothing when nothing did", () => {
  const say = globalThis.window.ixRepaintNotice;
  assert.equal(typeof say, "function", "the words are one rule that can be run");
  const was = {
    id: "th-1",
    real: true,
    who: "Rosa Díaz",
    state: "escalated",
    takenOver: false,
    claimedByOther: false,
    archived: false,
    lastAtMs: 1000,
    timeline: [{ type: "msg", from: "client" }],
  };
  assert.equal(say(was, { ...was }), null);
  assert.equal(
    say(was, { ...was, lastAtMs: 2000, timeline: [...was.timeline, { type: "msg", from: "client" }] }),
    "Rosa Díaz wrote again",
  );
  assert.equal(
    say(was, { ...was, lastAtMs: 2000, timeline: [...was.timeline, { type: "msg", from: "agent" }] }),
    "The receptionist replied",
  );
  assert.equal(say(was, { ...was, state: "done" }), "Moved to Handled");
  assert.equal(say(was, { ...was, state: "done", archived: true }), "Archived");
  assert.equal(say(was, { ...was, state: "snoozed", wake: "Tue 10:00 AM" }), "Snoozed until Tue 10:00 AM");
  assert.equal(say({ ...was, state: "snoozed" }, { ...was }), "Back in Needs you");
  assert.equal(say(was, { ...was, claimedByOther: true }, "Ana García"), "Ana García took this conversation");
});

test("REGRESSION: a re-read that moves the open thread out of its bucket keeps it open, says what happened, and opens nobody else in its place", () => {
  const drawn = [];
  let select = null;
  globalThis.InboxList = (p) => {
    select = p.onSelectThread;
    return null;
  };
  globalThis.InboxThread = (p) => {
    drawn.push({ id: p.thread ? p.thread.id : null, notice: p.notice ?? null });
    return null;
  };
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  const open = {
    id: "th-rosa",
    real: true,
    who: "Rosa Díaz",
    state: "escalated",
    needsYou: true,
    takenOver: false,
    claimedByOther: false,
    archived: false,
    tags: [],
    whoMeta: "",
    lastAtMs: 1000,
    timeline: [],
  };
  const other = { ...open, id: "th-nina", who: "Nina Park" };
  const fresh = () => {
    cells = [];
    drawn.length = 0;
    for (const k of Object.keys(listeners)) delete listeners[k];
    globalThis.window.INBOX_DATA = {
      INBOX_BUCKETS: [],
      INBOX_VIEWS: [],
      CHANNEL_LABELS: {},
      INBOX_BASELINE: {},
      THREADS: [other, open],
    };
  };
  const render = (initialThreadId = null) => {
    frames.begin();
    return globalThis.window.Inbox({ initialThreadId, showAgentRail: false });
  };
  // A teammate handed Rosa back: the next read has her in Handled.
  const handBack = () => {
    globalThis.window.INBOX_DATA = {
      ...globalThis.window.INBOX_DATA,
      THREADS: [other, { ...open, state: "done", needsYou: false }],
    };
    for (const fn of listeners["surface:inbox"] ?? []) fn();
  };

  // Opened by a click.
  fresh();
  render();
  select("th-rosa");
  render();
  assert.equal(drawn.at(-1).id, "th-rosa", "Rosa is open");
  const before = drawn.length;
  handBack();
  render();
  assert.ok(drawn.length > before, "the pane is drawn again after the re-read");
  assert.equal(
    drawn.at(-1).id,
    "th-rosa",
    "REGRESSION: Nina Park's thread opened in Rosa's place, and the reply half-written to Rosa went with the old pane",
  );
  assert.equal(drawn.at(-1).notice, "Moved to Handled", "and the pane says what happened");

  // Opened from a link: the same, not "isn't among the newest" over a thread the Inbox holds.
  fresh();
  render("th-rosa");
  assert.equal(drawn.at(-1).id, "th-rosa");
  const linkedBefore = drawn.length;
  handBack();
  const linked = render("th-rosa");
  assert.equal(
    find(linked, byTestId("inbox-missing-thread")),
    undefined,
    "REGRESSION: a thread the Inbox had just read said it was not among the newest",
  );
  assert.ok(drawn.length > linkedBefore, "the pane is drawn again after the re-read");
  assert.equal(drawn.at(-1).id, "th-rosa");
  assert.equal(drawn.at(-1).notice, "Moved to Handled");
  globalThis.InboxThread = RealInboxThread;
});

test("REGRESSION: a thread picked from a search in another bucket opens that thread, with its own bucket -- never the bucket's first customer", () => {
  // Found on the salon's workspace, 22 Sep: searched, clicked Marcus Bell (Handled) from Needs you, and the pane
  // opened Emily Chen -- the search spans every bucket, the pane looked only in the one on screen and fell to its first.
  const drawn = [];
  let list = null;
  globalThis.InboxList = (p) => {
    list = p;
    return null;
  };
  globalThis.InboxThread = (p) => {
    drawn.push(p.thread ? p.thread.id : null);
    return null;
  };
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  const base = {
    real: true,
    state: "escalated",
    needsYou: true,
    takenOver: false,
    claimedByOther: false,
    archived: false,
    tags: [],
    whoMeta: "",
    lastAtMs: 1000,
    timeline: [],
  };
  const emily = { ...base, id: "th-emily", who: "Emily Chen" };
  const marcus = { ...base, id: "th-marcus", who: "Marcus Bell", state: "done", needsYou: false };
  cells = [];
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.window.INBOX_DATA = {
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: {},
    THREADS: [emily, marcus],
  };
  const render = () => {
    frames.begin();
    return globalThis.window.Inbox({ showAgentRail: false });
  };
  render();
  assert.equal(drawn.at(-1), "th-emily", "Needs you opens on its first thread");
  list.onSelectThread("th-marcus");
  render();
  assert.equal(
    drawn.at(-1),
    "th-marcus",
    "REGRESSION: Emily Chen's thread opened, and a reply meant for Marcus Bell would have gone to her",
  );
  assert.equal(
    list.activeBucket,
    "done",
    "the bucket the thread lives in is the one on screen, so the list and the pane agree",
  );
  assert.ok(
    list.threads.some((t) => t.id === "th-marcus"),
    "and the list the bucket shows holds it",
  );
  globalThis.InboxThread = RealInboxThread;
});

test("your own act moves the open thread without a notice about it: its toast has already said so", async () => {
  const drawn = [];
  globalThis.InboxList = () => null;
  globalThis.InboxThread = (p) => {
    drawn.push({ id: p.thread ? p.thread.id : null, notice: p.notice ?? null, onArchive: p.onArchive });
    return null;
  };
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  const open = {
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
  };
  const other = { ...open, id: "th-nina", who: "Nina Park", conversationId: "c2" };
  cells = [];
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.window.INBOX_DATA = {
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: {},
    THREADS: [other, open],
  };
  const render = () => {
    frames.begin();
    return globalThis.window.Inbox({ initialThreadId: "th-rosa", showAgentRail: false });
  };
  render();
  // The verb's own re-read lands before it answers, the way client/api.ts refreshes after a write.
  globalThis.window.__inboxVerb = async () => {
    globalThis.window.INBOX_DATA = {
      ...globalThis.window.INBOX_DATA,
      THREADS: [other, { ...open, state: "done", needsYou: false, archived: true }],
    };
    for (const fn of listeners["surface:inbox"] ?? []) fn();
    return { ok: true, data: {} };
  };
  try {
    drawn.at(-1).onArchive("th-rosa");
    await new Promise((r) => setTimeout(r, 0));
    render();
    assert.equal(drawn.at(-1).id, "th-rosa", "the thread you archived stays in front of you");
    assert.equal(drawn.at(-1).notice, null, "and the pane does not announce your own act to you");
  } finally {
    delete globalThis.window.__inboxVerb;
    globalThis.InboxThread = RealInboxThread;
  }
});

test("the thread open is the address's: a click replaces it, a bucket switch names the next thread, and a refresh opens it in the bucket you had", async () => {
  // The loading standard's E and F: a click never wrote the address, so a refresh opened the bucket's first thread and
  // the crumbs kept the name of whichever thread a link had opened; and the bucket went back to the first with work.
  const m = new Map();
  const keepStore = globalThis.window.sessionStorage;
  globalThis.window.sessionStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
  const { installTabMemory } = await import("../../../../../apps/dashboard/src/legacy-bridge/tab-memory.ts");
  installTabMemory(globalThis.window);
  const navs = [];
  globalThis.window.appNavigate = (to, opts) => navs.push([to, opts]);
  let list = null;
  globalThis.InboxList = (p) => {
    list = p;
    return null;
  };
  const drawn = [];
  globalThis.InboxThread = (p) => {
    drawn.push(p.thread ? p.thread.id : null);
    return null;
  };
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  const base = {
    real: true,
    state: "escalated",
    needsYou: true,
    takenOver: false,
    claimedByOther: false,
    archived: false,
    tags: [],
    whoMeta: "",
    lastAtMs: 1000,
    timeline: [],
  };
  const emily = { ...base, id: "th-emily", who: "Emily Chen" };
  const zoe = { ...base, id: "th-zoe", who: "Zoe Martin" };
  const marcus = { ...base, id: "th-marcus", who: "Marcus Bell", state: "done", needsYou: false };
  const fresh = () => {
    cells = [];
    for (const k of Object.keys(listeners)) delete listeners[k];
    globalThis.window.INBOX_DATA = {
      INBOX_BUCKETS: [],
      INBOX_VIEWS: [],
      CHANNEL_LABELS: {},
      INBOX_BASELINE: {},
      THREADS: [emily, zoe, marcus],
    };
  };
  const render = (initialThreadId = null) => {
    frames.begin();
    return globalThis.window.Inbox({ initialThreadId, showAgentRail: false });
  };
  try {
    fresh();
    render();
    list.onSelectThread("th-zoe");
    assert.deepEqual(
      navs.at(-1),
      ["inbox/th-zoe", { replace: true }],
      "replaced: Back leaves the Inbox rather than replaying every thread read",
    );
    render();
    list.onBucketChange("done");
    assert.deepEqual(navs.at(-1), ["inbox/th-marcus", { replace: true }], "a bucket switch names the thread it opens");
    // A refresh: the address names Marcus, and the bucket he was read in comes back.
    fresh();
    render("th-marcus");
    assert.equal(list.activeBucket, "done");
    assert.equal(drawn.at(-1), "th-marcus");
    // The bucket is kept even when the address names no thread (a bare #/inbox after a refresh).
    fresh();
    render();
    assert.equal(list.activeBucket, "done", "REGRESSION: the Inbox went back to the first bucket with work in it");
  } finally {
    globalThis.window.sessionStorage = keepStore;
    delete globalThis.window.__tabMemory;
    delete globalThis.window.appNavigate;
    globalThis.InboxThread = RealInboxThread;
  }
});

test("on a phone a thread a tap opens is an entry of its own: Back closes it to the list, the thread's own Back is that Back, and the list's address names no thread", () => {
  // The phone app used to draw the thread natively over the page; retired, the page's own thread must answer Back.
  // Every read replaced the address, so Back -- Android's, the browser's, the app's -- left the Inbox with the thread
  // still open, and a bucket's first thread in the address opened it on a refresh.
  const w = globalThis.window;
  const keep = {
    matchMedia: w.matchMedia,
    history: w.history,
    hash: w.location.hash,
    useEffect: globalThis.React.useEffect,
  };
  // A browser's history of hash entries: a navigation is a new entry, a replace is not, Back steps one.
  const entries = ["#/inbox"];
  const navs = [];
  let backs = 0;
  w.location.hash = entries[0];
  w.matchMedia = (q) => ({ matches: q === "(max-width: 720px)" });
  w.appNavigate = (to, opts) => {
    navs.push([to, opts || null]);
    if (opts && opts.replace) entries[entries.length - 1] = "#/" + to;
    else entries.push("#/" + to);
    w.location.hash = entries.at(-1);
  };
  w.history = {
    back: () => {
      backs += 1;
      entries.pop();
      w.location.hash = entries.at(-1);
    },
  };
  // Effects that run again when what they follow changes, as React runs them: the address is followed by an effect.
  const seen = new Map();
  globalThis.React.useEffect = (fn, deps) => {
    const k = frames.key();
    const was = seen.get(k);
    if (was && deps && deps.every((d, i) => Object.is(d, was[i]))) return;
    seen.set(k, deps || []);
    fn();
  };
  let list = null;
  let back = null;
  globalThis.InboxList = (p) => {
    list = p;
    return null;
  };
  globalThis.InboxThread = (p) => {
    back = p.onBack;
    return null;
  };
  globalThis.InboxAgentRail = () => null;
  w.VW_UTIL = { seed() {}, remaining: () => null };
  const base = {
    real: true,
    state: "escalated",
    needsYou: true,
    takenOver: false,
    claimedByOther: false,
    archived: false,
  };
  const more = { tags: [], whoMeta: "", lastAtMs: 1000, timeline: [] };
  const threads = [
    { ...base, ...more, id: "th-emily", who: "Emily Chen" },
    { ...base, ...more, id: "th-zoe", who: "Zoe Martin" },
    { ...base, ...more, id: "th-marcus", who: "Marcus Bell", state: "done", needsYou: false },
  ];
  const fresh = () => {
    cells = [];
    seen.clear();
    w.INBOX_DATA = { INBOX_BUCKETS: [], INBOX_VIEWS: [], CHANNEL_LABELS: {}, INBOX_BASELINE: {}, THREADS: threads };
  };
  // The shell hands the Inbox the thread its address names; an effect's own change shows on the draw after it.
  const draw = () => {
    const param = /^#\/inbox\/(.+)$/.exec(w.location.hash);
    let tree;
    for (let i = 0; i < 2; i++) {
      frames.begin();
      tree = w.Inbox({ initialThreadId: param ? param[1] : null, showAgentRail: false });
    }
    return String(tree.props.className).includes("phone-thread");
  };
  try {
    fresh();
    assert.equal(draw(), false, "the list");
    list.onSelectThread("th-zoe");
    assert.deepEqual(navs.at(-1), ["inbox/th-zoe", null], "a tap on a phone is a new entry");
    assert.equal(draw(), true, "the thread is the screen");
    w.history.back();
    assert.equal(w.location.hash, "#/inbox");
    assert.equal(draw(), false, "REGRESSION: Back left the Inbox with the thread open over it; it closes the thread");
    list.onSelectThread("th-emily");
    assert.equal(draw(), true);
    back();
    assert.equal(backs, 2, "the thread's own Back is the browser's, so no entry of the thread is left behind");
    assert.equal(w.location.hash, "#/inbox");
    assert.equal(draw(), false);
    list.onBucketChange("done");
    assert.deepEqual(
      navs.at(-1),
      ["inbox", { replace: true }],
      "REGRESSION: a bucket's list on a phone named its first thread, which a refresh then opened",
    );
    // A thread the address brought (the bell, a link, a notification) closes to its list in place.
    fresh();
    entries.splice(0, entries.length, "#/today", "#/inbox/th-marcus");
    w.location.hash = entries.at(-1);
    assert.equal(draw(), true, "a link opens straight onto its thread");
    back();
    assert.equal(backs, 2, "its Back is not the browser's: that would leave the Inbox");
    assert.deepEqual(navs.at(-1), ["inbox", { replace: true }]);
    assert.equal(draw(), false);
  } finally {
    w.matchMedia = keep.matchMedia;
    w.history = keep.history;
    w.location.hash = keep.hash;
    globalThis.React.useEffect = keep.useEffect;
    delete w.appNavigate;
    globalThis.InboxThread = RealInboxThread;
  }
});

test("the words in the Inbox's search come back after a refresh, in this tab only", async () => {
  const m = new Map();
  const keepStore = globalThis.window.sessionStorage;
  globalThis.window.sessionStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
  const { installTabMemory } = await import("../../../../../apps/dashboard/src/legacy-bridge/tab-memory.ts");
  installTabMemory(globalThis.window);
  const RealList = globalThis.window.InboxList;
  const t = toInboxThreadVM(conv(), asked(), ZONE, NOW);
  const draw = () => {
    cells = [];
    frames.begin();
    return RealList({
      threads: [t],
      allThreads: [t],
      buckets: [],
      views: [],
      activeBucket: "escalated",
      onBucketChange() {},
      onSelectThread() {},
      selected: [],
      onToggleSelect() {},
      onClearSelection() {},
    });
  };
  const box = (tree) => find(tree, (n) => n.type === "input" && n.props?.className === "ix-search-input");
  try {
    box(draw()).props.onChange({ target: { value: "friday" } });
    assert.equal(box(draw()).props.value, "friday", "a refresh brings the words back");
    box(draw()).props.onChange({ target: { value: "" } });
    assert.equal(box(draw()).props.value, "", "and an emptied box stays empty");
  } finally {
    globalThis.window.sessionStorage = keepStore;
    delete globalThis.window.__tabMemory;
  }
});

test("a reply half-written is kept for its thread in this tab: another thread, or a refresh, and back brings it back -- and it goes once the server took it", async () => {
  // The pane is keyed by thread, so opening another thread dropped a half-written reply for good, and a refresh did
  // too. The loading standard's G: kept per thread in the tab's one store (tab-memory.ts), never the device's.
  const m = new Map();
  const keepStore = globalThis.window.sessionStorage;
  globalThis.window.sessionStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
  const { installTabMemory } = await import("../../../../../apps/dashboard/src/legacy-bridge/tab-memory.ts");
  installTabMemory(globalThis.window);
  try {
    const rosa = {
      id: "th-rosa",
      real: true,
      who: "Rosa Díaz",
      primaryChannel: "whatsapp",
      hasChat: true,
      windowOpen: true,
      optedOut: false,
    };
    const nina = { ...rosa, id: "th-nina", who: "Nina Park" };
    // A new mount each time, as a thread switch (the pane is keyed by thread) and a refresh both make.
    const draw = (thread, props = {}) => {
      cells = [];
      frames.begin();
      return InboxComposer({ thread, reply: "", onSend() {}, ...props });
    };
    const box = (tree) => find(tree, (n) => n.type === "textarea");
    box(draw(rosa)).props.onChange({ target: { value: "Friday at 3 works for us" } });
    assert.equal(box(draw(nina)).props.value, "", "another thread's box is its own");
    assert.equal(
      box(draw(rosa)).props.value,
      "Friday at 3 works for us",
      "REGRESSION: back to Rosa, and what was written to her was gone",
    );
    // The receptionist's draft is its own: kept words win over it, and it is never kept as the member's.
    assert.equal(box(draw(rosa, { reply: "Yes, 3pm works." })).props.value, "Friday at 3 works for us");
    box(draw(nina, { reply: "Yes, 3pm works." })).props.onChange({ target: { value: "Yes, 3pm works." } });
    assert.equal(
      globalThis.window.__tabMemory.draft("reply", "th-nina"),
      null,
      "the receptionist's words, untouched, are not a draft of yours",
    );
    // Sent, and the server took it: the words go.
    let accept = () => {};
    const tree = draw(rosa, {
      onSend: () =>
        new Promise((r) => {
          accept = r;
        }),
    });
    find(tree, (n) => n.type === "button" && n.props?.onClick && /Send/.test(textOf(n))).props.onClick();
    accept(true);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(globalThis.window.__tabMemory.draft("reply", "th-rosa"), null, "a reply the server took is no draft");
    // Emptied by hand: gone too.
    box(draw(nina)).props.onChange({ target: { value: "Hi Nina" } });
    box(draw(nina)).props.onChange({ target: { value: "" } });
    assert.equal(globalThis.window.__tabMemory.draft("reply", "th-nina"), null);
  } finally {
    globalThis.window.sessionStorage = keepStore;
    delete globalThis.window.__tabMemory;
  }
});

test("REGRESSION (A15): the template send says when the list could not be read, with a way to read it again -- not that none is approved", () => {
  const closed = {
    id: "th-1",
    real: true,
    who: "Rosa Díaz",
    primaryChannel: "whatsapp",
    hasChat: true,
    windowOpen: false,
    optedOut: false,
  };
  const draw = () => {
    cells = [];
    frames.begin();
    return InboxComposer({ thread: closed, reply: "" });
  };
  globalThis.window.__TEMPLATES = undefined;
  // Still reading: nothing yet -- never that none is approved. "Checking which templates are approved…" was the
  // machinery talking (calls you can follow).
  const reading = textOf(draw());
  assert.ok(!/No approved template|Checking which templates/.test(reading), `nothing said while it reads: ${reading}`);
  globalThis.window.__TEMPLATES = null;
  const failed = draw();
  const line = find(failed, byTestId("ix-tpl-failed"));
  assert.ok(line, "REGRESSION: a failed read said no template was approved");
  assert.match(textOf(line), /Couldn't read your approved templates/);
  assert.ok(!textOf(failed).includes("No approved template yet"));
  globalThis.window.__TEMPLATES = [];
  assert.match(textOf(draw()), /No approved template yet/, "an empty list is still the empty answer");
});

test("REGRESSION (A11): an archived thread says it was archived, not that nobody asked for you", () => {
  const vm = toInboxThreadVM(conv({ state: "archived" }), null, ZONE, NOW);
  assert.deepEqual([vm.state, vm.archived], ["done", true]);
  cells = [];
  frames.begin();
  const tree = InboxThread({ thread: vm, channelLabels: { whatsapp: "WhatsApp", phone: "Phone" } });
  assert.equal(
    textOf(find(tree, byTestId("ix-th-standing"))),
    "Archived",
    "the pill says it, in the bar under the header",
  );
  const archived = textOf(find(tree, byTestId("ix-archived")));
  assert.match(archived, /^Their request is closed\. If they write again, it comes back\./);
  assert.ok(!textOf(tree).includes("no one asked for you"));
  assert.equal(toInboxThreadVM(conv({ state: "open" }), null, ZONE, NOW).archived, false);
});

test("REGRESSION (A11): Archive is in the open thread's menu, asks first, and says what it does", () => {
  const vm = toInboxThreadVM(conv(), asked(), ZONE, NOW);
  let archived = null;
  const props = {
    thread: vm,
    channelLabels: { whatsapp: "WhatsApp", phone: "Phone" },
    onArchive: (id) => {
      archived = id;
    },
  };
  cells = [];
  frames.begin();
  let tree = InboxThread(props);
  const trigger = find(tree, (n) => n.type === "button" && n.props?.["aria-haspopup"] === "menu");
  trigger.props.onClick(click);
  frames.begin();
  tree = InboxThread(props);
  const item = find(tree, (n) => n.props?.role === "menuitem" && textOf(n).includes("Archive"));
  assert.ok(item, "REGRESSION: Archive lived only in the bulk bar");
  item.props.onClick(click);
  frames.begin();
  tree = InboxThread(props);
  const ask = find(tree, byTestId("ix-archive-confirm"));
  assert.ok(ask, "it asks first: archiving closes the request");
  assert.match(textOf(ask), /Archive Rosa Díaz's conversation\?/);
  assert.match(textOf(ask), /It leaves the Inbox and their request is closed\. If they write again, it comes back\./);
  assert.equal(archived, null, "nothing is archived by opening the question");
  find(tree, byTestId("ix-archive-yes")).props.onClick(click);
  assert.equal(archived, vm.id);
});

/* ---------------------------- a key meant for a dialog over the Inbox ---------------------------- */

// A key as the window hears it: from inside a dialog over the page (the deal sheet is an aria-modal RecordSheet), or
// from the page itself; one a control already took says so.
const keyFrom = (key, { modal = false, prevented = false, ...mods } = {}) => ({
  key,
  target: {
    tagName: "BUTTON",
    closest: (sel) => (modal && sel === '[aria-modal="true"]' ? { className: "rec-sheet deal-sheet" } : null),
  },
  defaultPrevented: prevented,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  ...mods,
});
const hear = (ev) => {
  for (const fn of [...(listeners.keydown ?? [])]) fn(ev);
};

test("REGRESSION: Cmd or Ctrl with Enter pressed inside a dialog over the thread (the deal sheet records with it) never sends what is in the reply box", () => {
  for (const k of Object.keys(listeners)) delete listeners[k];
  cells = [];
  frames.begin();
  const sent = [];
  const thread = {
    id: "th-rosa",
    real: true,
    who: "Rosa Díaz",
    primaryChannel: "whatsapp",
    hasChat: true,
    windowOpen: true,
    optedOut: false,
  };
  InboxComposer({ thread, reply: "Friday at 3 works for us", onSend: (id, words) => sent.push(words) });
  hear(keyFrom("Enter", { modal: true, ctrlKey: true }));
  hear(keyFrom("Enter", { modal: true, metaKey: true }));
  assert.deepEqual(sent, [], "REGRESSION: the sheet's own Ctrl+Enter sent the half-written reply behind it");
  hear(keyFrom("Enter", { ctrlKey: true, prevented: true }));
  assert.deepEqual(sent, [], "nor one a control already took");
  hear(keyFrom("Enter", { ctrlKey: true }));
  assert.deepEqual(sent, ["Friday at 3 works for us"], "on the page it still sends");
});

test("REGRESSION: j, k and the arrows pressed inside a dialog over the Inbox move nothing behind it; on the page they still walk the list", () => {
  const drawn = [];
  globalThis.InboxList = () => null;
  globalThis.InboxThread = (p) => {
    drawn.push(p.thread ? p.thread.id : null);
    return null;
  };
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  const rosa = {
    id: "th-rosa",
    real: true,
    who: "Rosa Díaz",
    state: "escalated",
    needsYou: true,
    takenOver: false,
    claimedByOther: false,
    archived: false,
    tags: [],
    whoMeta: "",
    lastAtMs: 2000,
    timeline: [],
  };
  cells = [];
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.window.INBOX_DATA = {
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: {},
    THREADS: [rosa, { ...rosa, id: "th-nina", who: "Nina Park", lastAtMs: 1000 }],
  };
  const render = () => {
    frames.begin();
    return globalThis.window.Inbox({ initialThreadId: null, showAgentRail: false });
  };
  try {
    render();
    const first = drawn.at(-1);
    assert.ok(first, "a thread is open");
    for (const key of ["j", "k", "ArrowDown", "ArrowUp"]) {
      const ev = keyFrom(key, { modal: true });
      hear(ev);
      assert.equal(ev.defaultPrevented, false, `${key}: the dialog's own control keeps its key`);
    }
    render();
    assert.equal(drawn.at(-1), first, "REGRESSION: an arrow on the sheet's select moved the thread behind it");
    hear(keyFrom("j"));
    render();
    assert.notEqual(drawn.at(-1), first, "on the page, j still walks the list");
  } finally {
    globalThis.InboxThread = RealInboxThread;
  }
});
