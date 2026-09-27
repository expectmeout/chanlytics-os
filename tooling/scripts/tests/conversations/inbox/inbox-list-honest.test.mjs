/**
 * The Inbox list: a bulk act that says what happened, rows a keyboard can reach, and no invented receptionist.
 *
 * - Bulk snooze and archive went through the single verb once per thread: a toast each (the stack keeps
 *   three), a re-read of three surfaces each, no count, no busy state, no Undo a real thread could use,
 *   and an archive -- which has no undo -- went out with no question (the wiring audit's A19).
 * - Rows were divs with a click and nothing else: Tab never reached one, Enter opened nothing, a screen
 *   reader heard no list, and the search's clear had no name (A25).
 * - The agent rail invented the receptionist on a real thread: an autonomy line and a voice nobody set,
 *   an Ask box answering with canned text, a menu to a hidden Fleet page (D11, A3, A17). Dormant, because
 *   nothing turns the rail on; not drawn for a real thread now, so nothing can.
 * Run against the contracts, the bridge over a fake wire with a runner mounted, and the pages on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords, replyWaitsOnYou } from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const person = (id, name) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+16465550123",
  consent: "opted_in",
  dnc: false,
});
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
const conv = (id, name) => ({
  id,
  state: "needs_human",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(40),
  last_message_at: ago(40),
  contact: person(`p-${id}`, name),
  messages: [wrote(`m-${id}`, "Can I move my appointment?", 40)],
});
const asked = (id) => ({ id: `e-${id}`, reason: "human_token", details: null, state: "open", created_at: ago(40) });

/* -------------------------------- a browser -------------------------------- */

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
globalThis.document = {
  visibilityState: "hidden",
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }),
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
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

/* --------------------------- the bulk courier, run --------------------------- */

const { inboxBulk, inboxVerb } = await quiet(
  () => import("../../../../../apps/dashboard/src/legacy-bridge/inbox-verbs.ts"),
);
const { startSurfaces } = await quiet(
  () => import("../../../../../apps/dashboard/src/legacy-bridge/surface-runner.ts"),
);
// Loaded now, so a re-read the courier starts is not held up loading the table.
await quiet(() => import("../../../../../apps/dashboard/src/legacy-bridge/refresh-map.ts"));

test("REGRESSION (A19): a bulk snooze asks once per thread and reads the Inbox again once every ask is answered -- not after each -- with what was refused named", async () => {
  const seen = [];
  const gates = [];
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const method = init.method ?? "GET";
    seen.push(`${method} ${u.pathname}`);
    if (method !== "POST") {
      return json(200, {
        ok: true,
        data: {
          conversations: [],
          escalations: [],
          templates: [],
          workspaces: globalThis.window.__WORKSPACES,
          activeWorkspaceId: "t1",
        },
      });
    }
    await new Promise((r) => gates.push(r));
    seen.push(`ANSWERED ${u.pathname}`);
    if (u.pathname === "/api/v1/conversations/c2/snooze")
      return json(409, {
        ok: false,
        error: { code: "conflict", message: "That conversation changed; read it again." },
      });
    return json(200, { ok: true, data: { conversation: { id: u.pathname.split("/")[4], state: "snoozed" } } });
  };
  const stop = startSurfaces([]);
  try {
    const threads = ["c1", "c2", "c3"].map((id) => ({
      id: `th-${id}`,
      conversationId: id,
      escalationId: null,
      who: `Person ${id}`,
    }));
    const pending = quiet(() => inboxBulk(threads, "snooze"));
    // The server answers one ask at a time, with time between for a re-read to start, were one coming.
    for (let answered = 0; answered < 3; answered += 1) {
      for (let i = 0; !gates.length; i += 1) {
        if (i > 400) assert.fail(`ask ${answered + 1} never went out`);
        await tick(5);
      }
      gates.shift()();
      await tick(40);
    }
    const result = await pending;
    assert.equal(seen.filter((s) => s.startsWith("POST")).length, 3, "one ask per thread");
    const lastAnswer = Math.max(...seen.map((s, i) => (s.startsWith("ANSWERED") ? i : -1)));
    const firstRead = seen.findIndex((s) => s.startsWith("GET"));
    assert.ok(
      firstRead > lastAnswer,
      `REGRESSION: each snooze read the Inbox, the threads and Today again before the next was answered: ${seen.join(" | ")}`,
    );
    assert.ok(
      seen.slice(lastAnswer).includes("GET /api/v1/conversations"),
      "and the Inbox is read again once every ask has its answer",
    );
    assert.deepEqual(
      result.done.map((t) => t.conversationId),
      ["c1", "c3"],
    );
    assert.deepEqual(
      result.refused.map((r) => r.thread.conversationId),
      ["c2"],
    );
    assert.equal(typeof result.refused[0].message, "string");
    assert.ok(result.refused[0].message.length > 0, "a refusal carries its sentence");
  } finally {
    stop();
  }
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
const RealInboxList = globalThis.window.InboxList;
await import("../../../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
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
const findAll = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const buttonNamed = (tree, words) => find(tree, (n) => n.type === "button" && textOf(n).trim() === words);

const rosa = toInboxThreadVM(conv("c1", "Rosa Díaz"), asked("c1"), ZONE, NOW);
const nina = toInboxThreadVM(conv("c2", "Nina Park"), asked("c2"), ZONE, NOW);
const ada = toInboxThreadVM(conv("c3", "Ada Lovelace"), asked("c3"), ZONE, NOW);
const listProps = (over = {}) => ({
  threads: [rosa, nina, ada],
  allThreads: [rosa, nina, ada],
  buckets: [{ id: "escalated", label: "Needs you", icon: "flag", count: 3 }],
  views: [],
  activeBucket: "escalated",
  onBucketChange() {},
  activeThreadId: nina.id,
  onSelectThread() {},
  selected: [],
  onToggleSelect() {},
  onClearSelection() {},
  ...over,
});
const inboxWith = (threads) => {
  globalThis.window.INBOX_DATA = {
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: {},
    THREADS: threads,
  };
};

/** Today's read, in the shape the server answers it: without it Today's boot failed and tried again 800ms later. */
const metrics = {
  workspace: { name: "Marisa's Beauty Salon", timezone: ZONE, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+16465550100" }],
  window: {
    days: 1,
    since: "2026-09-14T04:00:00+00:00",
    since_local: "2026-09-14T00:00:00",
    now_local: "2026-09-14T10:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 0,
    messages_out_ai: 0,
    messages_out_you: 0,
    conversations_active: 0,
    answered_by_ai: 0,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
};

test("a single act tells the page the moment the server takes it, while the Inbox, the threads and Today are still being read again behind it", async () => {
  const events = [];
  const parked = [];
  globalThis.window.fetch = async (_url, init = {}) => {
    if ((init.method ?? "GET") === "POST") {
      events.push("POST answered");
      return json(200, { ok: true, data: { conversation: { id: "c1", state: "snoozed" } } });
    }
    await new Promise((r) => parked.push(r));
    return json(200, {
      ok: true,
      data: {
        conversations: [],
        escalations: [],
        templates: [],
        calls: [],
        metrics,
        workspaces: globalThis.window.__WORKSPACES,
        activeWorkspaceId: "t1",
        days: 1,
      },
    });
  };
  const { inboxOverride, conversationsOverride, todayOverride } = await quiet(
    () => import("../../../../../apps/dashboard/src/legacy-bridge/surface-data.ts"),
  );
  let joined = 0;
  const stop = startSurfaces([inboxOverride, conversationsOverride, todayOverride], () => {
    joined += 1;
    return () => {};
  });
  try {
    // Let the boot's own reads through first, so what is parked below is the re-read the snooze starts.
    for (let i = 0; i < 40; i += 1) {
      while (parked.length) parked.shift()();
      await tick(5);
    }
    assert.equal(joined, 1, "the boot is in -- the runner joins the feed only then -- so nothing parked below is its");
    const t = { id: "th-c1", conversationId: "c1", escalationId: null, who: "Aiko" };
    let settled = false;
    const done = quiet(() =>
      inboxVerb(t, "snooze", undefined, { onAccepted: () => events.push("told the page") }),
    ).then((r) => {
      settled = true;
      return r;
    });
    for (let i = 0; i < 200 && !parked.length; i += 1) await tick(5);
    assert.deepEqual(events, ["POST answered", "told the page"], "the page hears it when the server took it");
    assert.ok(parked.length > 0, "the re-read is out");
    assert.equal(
      settled,
      false,
      "and the act itself still answers once the surfaces have been read again (the pane's own act lasts until then)",
    );
    for (let i = 0; i < 80 && !settled; i += 1) {
      while (parked.length) parked.shift()();
      await tick(5);
    }
    assert.equal((await done).ok, true);
  } finally {
    while (parked.length) parked.shift()();
    stop();
  }
});

test("REGRESSION (A19): the Inbox's bulk snooze is one act -- busy while it runs, one toast with the count and each refusal named, the refused left selected, and an Undo that wakes what it snoozed", async () => {
  let list = null;
  globalThis.InboxList = (p) => {
    list = p;
    return null;
  };
  globalThis.InboxThread = () => null;
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  inboxWith([rosa, nina]);
  const bulk = [];
  let finish = () => {};
  globalThis.window.__inboxBulk = (threads, verb) => {
    bulk.push([verb, threads.map((t) => t.id)]);
    if (verb === "wake") return Promise.resolve({ done: threads, refused: [] });
    return new Promise((r) => {
      finish = () =>
        r({
          done: threads.slice(0, 1),
          refused: [{ thread: threads[1], message: "That conversation changed; read it again." }],
        });
    });
  };
  const single = [];
  globalThis.window.__inboxVerb = (t, verb) => {
    single.push(verb);
    return Promise.resolve({ ok: true, data: {} });
  };
  try {
    cells = [];
    const render = () => {
      frames.begin();
      return globalThis.window.Inbox({ showAgentRail: false });
    };
    render();
    list.onToggleSelect(rosa.id);
    render();
    list.onToggleSelect(nina.id);
    render();
    const pending = list.onBulkSnooze();
    assert.deepEqual(
      single,
      [],
      "REGRESSION: the single verb went out once per thread, each with its own toast and its own re-read",
    );
    render();
    assert.equal(list.bulkBusy, "snooze", "the bar says it is working");
    list.onBulkSnooze();
    assert.equal(bulk.length, 1, "a second press while it runs asks nothing");
    finish();
    await pending;
    const tree = render();
    assert.deepEqual(bulk[0], ["snooze", [rosa.id, nina.id]]);
    assert.equal(list.bulkBusy, null);
    assert.deepEqual(list.selected, [nina.id], "the refused stay selected, to try again");
    const toasts = findAll(
      tree,
      (n) => typeof n.props?.className === "string" && n.props.className.startsWith("pp-toast "),
    );
    assert.equal(toasts.length, 1, "one toast for the act");
    assert.match(textOf(toasts[0]), /1 of 2 snoozed/);
    assert.match(
      textOf(toasts[0]),
      /Nina Park: That conversation changed; read it again\./,
      "the refusal is named in it",
    );
    buttonNamed(toasts[0], "Undo").props.onClick();
    assert.deepEqual(bulk[1], ["wake", [rosa.id]], "Undo wakes what was snoozed, and only that");
  } finally {
    delete globalThis.window.__inboxBulk;
    delete globalThis.window.__inboxVerb;
  }
});

test("REGRESSION (A19): a bulk archive of real threads asks first -- it has no undo -- and the question says it is working until it is done", () => {
  const archived = [];
  cells = [];
  const props = listProps({
    selected: [rosa.id, nina.id],
    onBulkArchive: () => {
      archived.push(1);
      return new Promise(() => {});
    },
  });
  const draw = (over = {}) => {
    frames.begin();
    return RealInboxList({ ...props, ...over });
  };
  buttonNamed(draw(), "Archive").props.onClick();
  assert.deepEqual(
    archived,
    [],
    "REGRESSION: two conversations were archived on one press, with no question and no way back",
  );
  let tree = draw();
  const ask = find(tree, byTestId("ix-bulk-archive-confirm"));
  assert.ok(ask, "the question is asked in the list");
  assert.match(textOf(ask), /Archive 2 conversations\?/);
  assert.match(textOf(ask), /If they write again, they come back\./);
  find(ask, byTestId("ix-bulk-archive-yes")).props.onClick();
  assert.equal(archived.length, 1, "Yes archives them, once");
  tree = draw({ bulkBusy: "archive" });
  assert.equal(
    textOf(find(tree, byTestId("ix-bulk-archive-yes"))),
    "Archiving…",
    "and the question says it is working",
  );
  const seeded = { ...rosa, id: "t-seed", real: false };
  cells = [];
  let pressed = 0;
  frames.begin();
  buttonNamed(
    RealInboxList(
      listProps({
        threads: [seeded],
        allThreads: [seeded],
        selected: ["t-seed"],
        onBulkArchive: () => {
          pressed += 1;
        },
      }),
    ),
    "Archive",
  ).props.onClick();
  assert.equal(pressed, 1, "the demo's archive keeps its Undo and asks nothing");
});

test("REGRESSION (A25): the rows are a list a keyboard can walk -- Tab lands on the open one, arrows and J/K open and focus the row on screen, Enter opens, Space selects -- and a screen reader hears a list", () => {
  const opened = [];
  const toggled = [];
  const focused = [];
  cells = [];
  const props = listProps({
    selected: [ada.id],
    onSelectThread: (id) => opened.push(id),
    onToggleSelect: (id) => toggled.push(id),
  });
  const draw = (over = {}) => {
    frames.begin();
    return RealInboxList({ ...props, ...over });
  };
  let tree = draw();
  const box = find(tree, (n) => n.props?.role === "listbox");
  assert.ok(box, "REGRESSION: a screen reader heard no list");
  assert.equal(box.props["aria-label"], "Conversations");
  assert.equal(box.props["aria-multiselectable"], "true");
  const rows = findAll(box, (n) => n.props?.role === "option");
  assert.equal(rows.length, 3, "REGRESSION: rows were divs with only a click");
  assert.deepEqual(
    rows.map((r) => r.props.tabIndex),
    [-1, 0, -1],
    "one tab stop, on the open thread",
  );
  assert.deepEqual(
    rows.map((r) => r.props["aria-current"]),
    [undefined, "true", undefined],
    "the open thread is the current one",
  );
  assert.deepEqual(
    rows.map((r) => r.props["aria-selected"]),
    [false, false, true],
    "selected means picked for a bulk act",
  );
  const list = {
    querySelector: (sel) => {
      const m = /data-thread-id="([^"]+)"/.exec(sel);
      return m ? { focus: () => focused.push(m[1]) } : null;
    },
  };
  const press = (row, key) => {
    let stopped = false;
    row.props.onKeyDown({
      key,
      target: { tagName: "DIV" },
      currentTarget: { parentNode: list },
      preventDefault() {},
      stopPropagation() {
        stopped = true;
      },
    });
    return stopped;
  };
  assert.equal(
    press(rows[1], "ArrowDown"),
    true,
    "the row answers its own arrows, not the page's walk through its bucket",
  );
  assert.deepEqual(
    [opened.at(-1), focused.at(-1)],
    [ada.id, ada.id],
    "REGRESSION: an arrow on a row did nothing; it opens and focuses the next row on screen",
  );
  press(rows[1], "k");
  assert.deepEqual([opened.at(-1), focused.at(-1)], [rosa.id, rosa.id]);
  press(rows[1], "End");
  assert.deepEqual([opened.at(-1), focused.at(-1)], [ada.id, ada.id]);
  press(rows[0], "Enter");
  assert.equal(opened.at(-1), rosa.id, "REGRESSION: Enter opened nothing");
  press(rows[0], " ");
  assert.deepEqual(toggled, [rosa.id], "Space picks it for a bulk act");
  const check = find(rows[0], (n) => n.type === "input" && n.props?.type === "checkbox");
  assert.deepEqual(
    [check.props.tabIndex, check.props["aria-hidden"]],
    [-1, "true"],
    "the box is the mouse's; the row itself says selected",
  );
  tree = draw({ activeThreadId: null });
  assert.deepEqual(
    findAll(tree, (n) => n.props?.role === "option").map((r) => r.props.tabIndex),
    [0, -1, -1],
    "with none of these open, the first row keeps the list reachable",
  );
  const search = find(tree, (n) => n.type === "input" && n.props?.className === "ix-search-input");
  assert.equal(search.props["aria-label"], "Search conversations");
  search.props.onChange({ target: { value: "ro" } });
  tree = draw();
  assert.equal(
    find(tree, (n) => n.props?.className === "ix-search-clear").props["aria-label"],
    "Clear search",
    "REGRESSION: the clear was an unnamed icon",
  );
});

test("REGRESSION (D11, A3, A17): no invented receptionist on a real thread -- the rail is not drawn for one, and the view model carries no autonomy or voice to invent it from", () => {
  assert.deepEqual(
    Object.keys(rosa.agent).sort(),
    ["glyph", "name"],
    "REGRESSION: 'Pauses on handoff' and 'Warm · bilingual (EN/ES)' were written into every real thread",
  );
  const railed = [];
  globalThis.InboxList = () => null;
  globalThis.InboxThread = () => null;
  globalThis.InboxAgentRail = (p) => {
    railed.push(p.thread ? p.thread.id : null);
    return null;
  };
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  const draw = (threads) => {
    cells = [];
    frames.begin();
    inboxWith(threads);
    return globalThis.window.Inbox({ showAgentRail: true });
  };
  const real = draw([rosa]);
  assert.deepEqual(railed, [], "REGRESSION: the rail drew canned answers beside a real customer");
  assert.ok(!String(real.props.className).includes("with-rail"), "and the page keeps no column for it");
  const seeded = {
    id: "t-seed",
    real: false,
    who: "Aisha",
    state: "needs",
    tags: [],
    whoMeta: "",
    timeline: [],
    agent: { name: "Front Desk", glyph: "F", autonomy: "Asks first", tone: "Warm" },
  };
  const demo = draw([seeded]);
  assert.deepEqual(railed, ["t-seed"], "the demo keeps its rail");
  assert.ok(String(demo.props.className).includes("with-rail"));
});

test("the list tells Ask what it draws (the Phase 2 plan, D3): the conversations in its bucket, in the list's order, and the bucket that chose them", () => {
  cells = [];
  delete globalThis.window.__askOnScreen;
  frames.begin();
  RealInboxList(listProps());
  assert.deepEqual(globalThis.window.__askOnScreen, {
    key: "inbox",
    ids: ["c1", "c2", "c3"],
    labels: ["Rosa Díaz", "Nina Park", "Ada Lovelace"],
    view: "escalated",
  });
  cells = [];
  frames.begin();
  RealInboxList(listProps({ threads: [ada], activeBucket: "all" }));
  assert.deepEqual(
    [globalThis.window.__askOnScreen.ids, globalThis.window.__askOnScreen.view],
    [["c3"], "all"],
    "another bucket, its own rows",
  );
});
