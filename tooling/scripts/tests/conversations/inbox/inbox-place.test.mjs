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
import { legacyAddress } from "../../shell/address/_address.mjs";
import { toInboxThreadVM, stateOf, memberWords, replyWaitsOnYou } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find, textOf, settle } from "../../_legacy-react.mjs";

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

const address = await legacyAddress();
installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
Object.assign(globalThis, {
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
  __chrome: { state: stateOf, replyWaits: replyWaitsOnYou },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, address, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
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
const S = "../../../../../apps/dashboard/src";

/* ------------------- the templates read, and what it leaves ------------------- */

const { inboxOverride } = await quiet(() => import(`${S}/surfaces/inbox/surface.ts`));
const { setSurfaceValue, surfaceValue } = await import(`${S}/surfaces/surface-values.ts`);

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
    surfaceValue("inbox").templates,
    null,
    "REGRESSION: a failed read stored [] and the page said no template was approved",
  );
  assert.equal(surfaceValue("inbox").THREADS.length, 1, "the Inbox itself still reads");
});

/* ------------------------------ the pages, drawn ------------------------------ */

const { Inbox } = await import(`${S}/surfaces/inbox/pages/inbox-page.tsx`);
const { InboxList } = await import(`${S}/surfaces/inbox/pages/inbox-list.tsx`);
const { InboxThread } = await import(`${S}/surfaces/inbox/thread/thread.tsx`);
const { Composer } = await import(`${S}/surfaces/inbox/thread/composer.tsx`);
const { ixRepaintNotice } = await import("../../../../../apps/dashboard/src/surfaces/inbox/thread/thread-pane.tsx");
const { OWN_VERBS } = await import(`${S}/surfaces/inbox/store.ts`);
const { AFTER } = await quiet(() => import(`${S}/legacy-bridge/refresh-map.ts`));
const { installTabMemory } = await import(`${S}/legacy-bridge/tab-memory.ts`);
// The shell's own toast and role gate, which the pages draw through the bridge (surfaces/legacy-verbs.ts).
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");

const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const click = { stopPropagation() {}, preventDefault() {} };
/** What a Inbox read holds: the words and the rows the page draws from, with the threads a test names. */
const inboxWith = (threads, over = {}) =>
  setSurfaceValue("inbox", {
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: {},
    THREADS: threads,
    ...over,
  });
/** A read lands: what the surface holds now is what the page hears of. */
const landsARead = () => globalThis.dispatchEvent({ type: "surface:inbox" });
/** A real thread as the surface hands it over, with what a test says of it laid over it. */
const threadOf = (over) => ({ ...toInboxThreadVM(conv(), asked(), ZONE, NOW), ...over });
/** The pane the page drew beside its list: the props of the thread it was given. */
const paneOf = (tree) => find(tree, (n) => n.type === InboxThread)?.props;
/** The list the page drew, as the page last gave it its rows and its doors. */
const listOf = (tree) => find(tree, (n) => n.type === InboxList).props;

test("what changed on the open thread while you had it open, in one line -- and nothing when nothing did", () => {
  const say = ixRepaintNotice;
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
  let tree = null;
  const open = threadOf({
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
  });
  const other = { ...open, id: "th-nina", who: "Nina Park" };
  const begin = () => {
    fresh();
    drawn.length = 0;
    inboxWith([other, open]);
  };
  const render = (initialThreadId = null) => {
    tree = again(() => Inbox({ initialThreadId, showAgentRail: false }));
    const pane = paneOf(tree);
    if (pane) drawn.push({ id: pane.thread ? pane.thread.id : null, notice: pane.notice ?? null });
    return tree;
  };
  // A teammate handed Rosa back: the next read has her in Handled.
  const handBack = () => {
    inboxWith([other, { ...open, state: "done", needsYou: false }]);
    landsARead();
  };

  // Opened by a click.
  begin();
  render();
  listOf(tree).onSelectThread("th-rosa");
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
  begin();
  render("th-rosa");
  assert.equal(drawn.at(-1).id, "th-rosa");
  const linkedBefore = drawn.length;
  handBack();
  const linked = render("th-rosa");
  assert.equal(
    find(linked, byTestId("inbox-missing-thread")),
    null,
    "REGRESSION: a thread the Inbox had just read said it was not among the newest",
  );
  assert.ok(drawn.length > linkedBefore, "the pane is drawn again after the re-read");
  assert.equal(drawn.at(-1).id, "th-rosa");
  assert.equal(drawn.at(-1).notice, "Moved to Handled");
});

test("REGRESSION: a thread picked from a search in another bucket opens that thread, with its own bucket -- never the bucket's first customer", () => {
  // Found on the salon's workspace, 22 Sep: searched, clicked Marcus Bell (Handled) from Needs you, and the pane
  // opened Emily Chen -- the search spans every bucket, the pane looked only in the one on screen and fell to its first.
  const drawn = [];
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
  const emily = threadOf({ ...base, id: "th-emily", who: "Emily Chen" });
  const marcus = threadOf({ ...base, id: "th-marcus", who: "Marcus Bell", state: "done", needsYou: false });
  fresh();
  inboxWith([emily, marcus]);
  let tree = null;
  const render = () => {
    tree = again(() => Inbox({ showAgentRail: false }));
    const pane = paneOf(tree);
    if (pane) drawn.push(pane.thread ? pane.thread.id : null);
    return tree;
  };
  render();
  assert.equal(drawn.at(-1), "th-emily", "Needs you opens on its first thread");
  listOf(tree).onSelectThread("th-marcus");
  render();
  assert.equal(
    drawn.at(-1),
    "th-marcus",
    "REGRESSION: Emily Chen's thread opened, and a reply meant for Marcus Bell would have gone to her",
  );
  assert.equal(
    listOf(tree).activeBucket,
    "done",
    "the bucket the thread lives in is the one on screen, so the list and the pane agree",
  );
  assert.ok(
    listOf(tree).threads.some((t) => t.id === "th-marcus"),
    "and the list the bucket shows holds it",
  );
});

test("your own act moves the open thread without a notice about it: its toast has already said so", async () => {
  const drawn = [];
  const open = threadOf({
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
  });
  const other = { ...open, id: "th-nina", who: "Nina Park", conversationId: "c2" };
  fresh();
  inboxWith([other, open]);
  const render = () => {
    const tree = again(() => Inbox({ initialThreadId: "th-rosa", showAgentRail: false }));
    const pane = paneOf(tree);
    if (pane)
      drawn.push({ id: pane.thread ? pane.thread.id : null, notice: pane.notice ?? null, onArchive: pane.onArchive });
    return tree;
  };
  render();
  // The server takes the archive, and the verb's own re-read lands before it answers, the way client/api.ts
  // refreshes after a write (refresh-map.ts: the table's row for the verb).
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => json(200, { ok: true, data: {} });
  const row = "POST conversations/[id]/archive";
  const tableRow = AFTER[row];
  let landed = false;
  AFTER[row] = () => {
    landed = true;
    inboxWith([other, { ...open, state: "done", needsYou: false, archived: true }]);
    landsARead();
    return [];
  };
  try {
    drawn.at(-1).onArchive("th-rosa");
    for (let i = 0; i < 400 && OWN_VERBS.n > 0; i += 1) await settle();
    render();
    assert.ok(landed, "the verb's own re-read landed before it answered");
    assert.equal(drawn.at(-1).id, "th-rosa", "the thread you archived stays in front of you");
    assert.equal(drawn.at(-1).notice, null, "and the pane does not announce your own act to you");
  } finally {
    globalThis.fetch = realFetch;
    AFTER[row] = tableRow;
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
  installTabMemory(globalThis.window);
  const navs = [];
  globalThis.window.appNavigate = (to, opts) => navs.push([to, opts]);
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
  const emily = threadOf({ ...base, id: "th-emily", who: "Emily Chen" });
  const zoe = threadOf({ ...base, id: "th-zoe", who: "Zoe Martin" });
  const marcus = threadOf({ ...base, id: "th-marcus", who: "Marcus Bell", state: "done", needsYou: false });
  const drawn = [];
  let tree = null;
  const begin = () => {
    fresh();
    inboxWith([emily, zoe, marcus]);
  };
  const render = (initialThreadId = null) => {
    tree = again(() => Inbox({ initialThreadId, showAgentRail: false }));
    const pane = paneOf(tree);
    if (pane) drawn.push(pane.thread ? pane.thread.id : null);
    return tree;
  };
  try {
    begin();
    render();
    listOf(tree).onSelectThread("th-zoe");
    assert.deepEqual(
      navs.at(-1),
      ["inbox/th-zoe", { replace: true }],
      "replaced: Back leaves the Inbox rather than replaying every thread read",
    );
    render();
    listOf(tree).onBucketChange("done");
    assert.deepEqual(navs.at(-1), ["inbox/th-marcus", { replace: true }], "a bucket switch names the thread it opens");
    // A refresh: the address names Marcus, and the bucket he was read in comes back.
    begin();
    render("th-marcus");
    assert.equal(listOf(tree).activeBucket, "done");
    assert.equal(drawn.at(-1), "th-marcus");
    // The bucket is kept even when the address names no thread (a bare #/inbox after a refresh).
    begin();
    render();
    assert.equal(
      listOf(tree).activeBucket,
      "done",
      "REGRESSION: the Inbox went back to the first bucket with work in it",
    );
  } finally {
    globalThis.window.sessionStorage = keepStore;
    delete globalThis.window.__tabMemory;
    delete globalThis.window.appNavigate;
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
  };
  // A browser's history of hash entries: a navigation is a new entry, a replace is not, Back steps one.
  const entries = ["#/inbox"];
  const navs = [];
  let backs = 0;
  w.location.hash = entries[0];
  w.matchMedia = (q) => ({
    matches: q === "(max-width: 720px)",
    addEventListener() {},
    removeEventListener() {},
  });
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
    threadOf({ ...base, ...more, id: "th-emily", who: "Emily Chen" }),
    threadOf({ ...base, ...more, id: "th-zoe", who: "Zoe Martin" }),
    threadOf({ ...base, ...more, id: "th-marcus", who: "Marcus Bell", state: "done", needsYou: false }),
  ];
  let tree = null;
  const begin = () => {
    fresh();
    inboxWith(threads);
  };
  // The shell hands the Inbox the thread its address names; an effect's own change shows on the draw after it.
  const draw = () => {
    const param = /^#\/inbox\/(.+)$/.exec(w.location.hash);
    for (let i = 0; i < 2; i++)
      tree = again(() => Inbox({ initialThreadId: param ? param[1] : null, showAgentRail: false }));
    return String(tree.props.className).includes("phone-thread");
  };
  const back = () => paneOf(tree).onBack();
  try {
    begin();
    assert.equal(draw(), false, "the list");
    listOf(tree).onSelectThread("th-zoe");
    assert.deepEqual(navs.at(-1), ["inbox/th-zoe", null], "a tap on a phone is a new entry");
    assert.equal(draw(), true, "the thread is the screen");
    w.history.back();
    assert.equal(w.location.hash, "#/inbox");
    assert.equal(draw(), false, "REGRESSION: Back left the Inbox with the thread open over it; it closes the thread");
    listOf(tree).onSelectThread("th-emily");
    assert.equal(draw(), true);
    back();
    assert.equal(backs, 2, "the thread's own Back is the browser's, so no entry of the thread is left behind");
    assert.equal(w.location.hash, "#/inbox");
    assert.equal(draw(), false);
    listOf(tree).onBucketChange("done");
    assert.deepEqual(
      navs.at(-1),
      ["inbox", { replace: true }],
      "REGRESSION: a bucket's list on a phone named its first thread, which a refresh then opened",
    );
    // A thread the address brought (the bell, a link, a notification) closes to its list in place.
    begin();
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
    delete w.appNavigate;
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
  installTabMemory(globalThis.window);
  const t = toInboxThreadVM(conv(), asked(), ZONE, NOW);
  const draw = () => {
    fresh();
    return again(() =>
      InboxList({
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
      }),
    );
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
  installTabMemory(globalThis.window);
  try {
    const rosa = threadOf({
      id: "th-rosa",
      real: true,
      who: "Rosa Díaz",
      primaryChannel: "whatsapp",
      hasChat: true,
      windowOpen: true,
      optedOut: false,
    });
    const nina = { ...rosa, id: "th-nina", who: "Nina Park" };
    // A new mount each time, as a thread switch (the pane is keyed by thread) and a refresh both make.
    const draw = (thread, props = {}) => {
      fresh();
      return again(() => Composer({ thread, reply: "", onSend() {}, ...props }));
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
    await settle();
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
  const closed = threadOf({
    id: "th-1",
    real: true,
    who: "Rosa Díaz",
    primaryChannel: "whatsapp",
    hasChat: true,
    windowOpen: false,
    optedOut: false,
  });
  const draw = () => {
    fresh();
    return again(() => Composer({ thread: closed, reply: "" }));
  };
  // What the surface holds of the approved templates: absent while they are read, null when the read failed, a list.
  try {
    inboxWith([], { templates: undefined });
    // Still reading: nothing yet -- never that none is approved. "Checking which templates are approved…" was the
    // machinery talking (calls you can follow).
    const reading = textOf(draw());
    assert.ok(
      !/No approved template|Checking which templates/.test(reading),
      `nothing said while it reads: ${reading}`,
    );
    inboxWith([], { templates: null });
    const failed = draw();
    const line = find(failed, byTestId("ix-tpl-failed"));
    assert.ok(line, "REGRESSION: a failed read said no template was approved");
    assert.match(textOf(line), /Couldn't read your approved templates/);
    assert.ok(!textOf(failed).includes("No approved template yet"));
    inboxWith([], { templates: [] });
    assert.match(textOf(draw()), /No approved template yet/, "an empty list is still the empty answer");
  } finally {
    setSurfaceValue("inbox", undefined);
  }
});

test("REGRESSION (A11): an archived thread says it was archived, not that nobody asked for you", () => {
  const vm = toInboxThreadVM(conv({ state: "archived" }), null, ZONE, NOW);
  assert.deepEqual([vm.state, vm.archived], ["done", true]);
  fresh();
  const tree = again(() => InboxThread({ thread: vm, channelLabels: { whatsapp: "WhatsApp", phone: "Phone" } }));
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
  fresh();
  let tree = again(() => InboxThread(props));
  const trigger = find(tree, (n) => n.type === "button" && n.props?.["aria-haspopup"] === "menu");
  trigger.props.onClick(click);
  tree = again(() => InboxThread(props));
  const item = find(tree, (n) => n.props?.role === "menuitem" && textOf(n).includes("Archive"));
  assert.ok(item, "REGRESSION: Archive lived only in the bulk bar");
  item.props.onClick(click);
  tree = again(() => InboxThread(props));
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
  type: "keydown",
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
  globalThis.dispatchEvent(ev);
};

test("REGRESSION: Cmd or Ctrl with Enter pressed inside a dialog over the thread (the deal sheet records with it) never sends what is in the reply box", () => {
  fresh();
  const sent = [];
  const thread = threadOf({
    id: "th-rosa",
    real: true,
    who: "Rosa Díaz",
    primaryChannel: "whatsapp",
    hasChat: true,
    windowOpen: true,
    optedOut: false,
  });
  again(() => Composer({ thread, reply: "Friday at 3 works for us", onSend: (id, words) => sent.push(words) }));
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
  const rosa = threadOf({
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
  });
  fresh();
  inboxWith([rosa, { ...rosa, id: "th-nina", who: "Nina Park", lastAtMs: 1000 }]);
  const render = () => {
    const tree = again(() => Inbox({ initialThreadId: null, showAgentRail: false }));
    const pane = paneOf(tree);
    if (pane) drawn.push(pane.thread ? pane.thread.id : null);
    return tree;
  };
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
});
