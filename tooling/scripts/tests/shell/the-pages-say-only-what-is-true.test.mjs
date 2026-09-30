/**
 * The pages say only what is true.
 *
 * Walking the live app on 14 September 2026 turned up sentences the data
 * underneath contradicts, on a real workspace, in front of its owner:
 *
 * - Today said "The oldest has been waiting since 6:51 PM" of a customer who
 *   had been waiting eight days, because the time was printed without its date.
 * - Conversations pilled a call "Receptionist handled it" directly above its own
 *   "Needs a call back" and "To do: Call Emily back" -- the pill only knew
 *   live, missed and everything else.
 * - The same call's notes said "Noted on Emily's WhatsApp thread" of a caller
 *   who has no WhatsApp thread at all.
 *
 * Each is pinned here as behaviour, run against the contracts that decide it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM, toCallVM, toInboxThreadVM, stateOf, replyWaitsOnYou } from "@chanlytics/contracts";
import { hookFrames } from "../_hook-frames.mjs";
import { kitHooks, kitPages } from "../_legacy-react.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

// 10:00 in New York on Sunday 6 September 2026.
const NOW = new Date("2026-09-06T14:00:00Z");

const metrics = (oldest) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [
    { kind: "whatsapp", status: "active", number: "+1 305" },
    { kind: "voice", status: "active", number: "+1 786" },
  ],
  window: {
    days: 1,
    since: "2026-09-06T04:00:00Z",
    since_local: "2026-09-06T00:00:00",
    now_local: "2026-09-06T10:00:00",
  },
  now: {
    escalations_open: 2,
    oldest_open_escalation_at: oldest,
    threads_needing_human: 2,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: "2026-09-06T13:00:00Z",
    last_outbound_at: "2026-09-06T13:01:00Z",
  },
  period: {
    messages_in: 5,
    messages_out_ai: 4,
    messages_out_you: 0,
    conversations_active: 3,
    answered_by_ai: 4,
    answered_by_you: 0,
    unanswered_in_window: 1,
    median_reply_seconds_ai: 40,
    send_failures: 0,
    escalations_new: 2,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
});
const contact = (id, name) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+17865550181",
  consent: "opted_in",
  dnc: false,
});
const conversation = (id, name) => ({
  id,
  state: "needs_human",
  paused_until: null,
  last_wa_inbound_at: null,
  last_message_at: "2026-08-29T12:00:00Z",
  contact: contact(`c-${id}`, name),
  messages: [
    {
      id: `m-${id}`,
      conversation_id: id,
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Can I move Saturday?",
      media: null,
      meta: null,
      status: "received",
      created_at: "2026-08-29T12:00:00Z",
    },
  ],
});
const escalation = (id, conversationId, createdAt) => ({
  id,
  reason: "human_token",
  details: null,
  state: "open",
  created_at: createdAt,
  conversation_id: conversationId,
});

/* ---------------------- a wait is said with its day --------------------- */

test("a wait from an earlier day says which day: yesterday, the weekday inside a week, the date beyond it -- and today stays a bare time", () => {
  const cases = [
    ["2026-09-06T12:00:00Z", "since 8:00 AM"],
    ["2026-09-05T12:00:00Z", "since yesterday 8:00 AM"],
    ["2026-09-04T12:00:00Z", "since Fri 8:00 AM"],
    ["2026-08-31T12:00:00Z", "since Mon 8:00 AM"],
    ["2026-08-29T12:00:00Z", "since Aug 29, 8:00 AM"],
  ];
  for (const [createdAt, words] of cases) {
    const vm = toTodayVM(
      metrics(createdAt),
      [conversation("cv1", "Zoe Martin")],
      [escalation("e1", "cv1", createdAt)],
      [],
      NOW,
    );
    const row = vm.queue.rows.find((r) => r.kind === "handoff");
    assert.ok(row, `a handoff row for ${createdAt}`);
    assert.ok(row.status.includes(words), `${createdAt}: expected "${words}" in ${JSON.stringify(row.status)}`);
  }
});

test("the headline's oldest wait carries its day too: eight days is not 'since 6:51 PM'", () => {
  const vm = toTodayVM(
    metrics("2026-08-29T22:51:00Z"),
    [conversation("cv1", "Zoe Martin"), conversation("cv2", "Daniela Reyes")],
    [escalation("e1", "cv1", "2026-08-29T22:51:00Z"), escalation("e2", "cv2", "2026-08-29T22:57:00Z")],
    [],
    NOW,
  );
  assert.equal(vm.standing.detail, "The oldest has been waiting since Aug 29, 6:51 PM.");
});

/* --------------------- a call's pill tells its story -------------------- */

const call = (over = {}) => ({
  id: "k7",
  retell_call_id: "r-k7",
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+19175550106",
  from_raw: null,
  to_e164: "+13055550123",
  started_at: "2026-09-06T13:00:00Z",
  ended_at: "2026-09-06T13:03:10Z",
  duration_ms: 190_000,
  disconnection_reason: "agent_hangup",
  sentiment: "Positive",
  call_successful: true,
  in_voicemail: false,
  summary: "The user called Marisa's Beauty Salon to arrange a bridal trial.",
  transcript_object: null,
  recording: null,
  conversation_id: "cv7",
  contact_id: "c7",
  message_id: "m7",
  contact: { display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106" },
  wanted: "Wants to book a bridal trial on October 3",
  outcome: "callback_needed",
  follow_up: "Call Emily back to confirm the bridal trial",
  caller_name: "Emily",
  ...over,
});

test("a call that asked for a call back is never pilled 'handled', and the words stay true after someone calls back", () => {
  const vm = toCallVM(call(), ZONE, NOW);
  assert.equal(vm.outcome, "callback");
  assert.deepEqual(stateOf("call", "callback"), { tone: "warn", label: "Asked for a call back" });
});

test("the caller who hung up in seconds is pilled as that, the same rule Today already uses", () => {
  const vm = toCallVM(
    call({ duration_ms: 6_000, disconnection_reason: "user_hangup", outcome: null, follow_up: null }),
    ZONE,
    NOW,
  );
  assert.equal(vm.outcome, "abandoned");
  assert.equal(stateOf("call", "abandoned").label, "Hung up early");
});

test("a call that neither asked for anything nor ended early is still handled", () => {
  assert.equal(toCallVM(call({ outcome: null, follow_up: null }), ZONE, NOW).outcome, "handled");
  assert.equal(
    toCallVM(call({ status: "not_connected", duration_ms: 0, outcome: null }), ZONE, NOW).outcome,
    "missed",
    "a dial that never connected keeps its own word",
  );
});

test("a call's note names the thread it went to, never a channel the caller may not have", () => {
  const bullets = toCallVM(call(), ZONE, NOW).summary.bullets;
  assert.ok(bullets.includes("Noted on Emily's thread in the Inbox"), JSON.stringify(bullets));
  assert.ok(!bullets.some((b) => b.includes("WhatsApp thread")), "a phone-only caller has no WhatsApp thread");
});

/* ------------------- the Conversations pill, mounted -------------------- */

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
  // A cell, so the tape stays aligned with every other hook -- but recomputed
  // every draw, as React may at any time. Cached, it handed a memo mounted on
  // a later draw (a message opened) the value another component had left in
  // that cell, which no real React would do.
  useMemo: (fn) => {
    frames.key();
    return fn();
  },
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
  useCallback: (fn) => fn,
  // A store outside React (the TSX surfaces' useSurface): read at each draw, which these tests make by hand.
  useSyncExternalStore: (_subscribe, snapshot) => {
    frames.key();
    return snapshot();
  },
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.useSurface = () => 0; // the bridge's hook: these tests draw once, and the redraw is proved in shell/surfaces
globalThis.document = {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  __chrome: { state: stateOf, replyWaits: replyWaitsOnYou },
  CHANLY: { nav() {}, R: {} },
  gate: () => ({}),
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  setTimeout: () => 1,
  clearTimeout() {},
};
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
await import("../../../../apps/dashboard/src/legacy/components/record-fold.jsx");
await import("../../../../apps/dashboard/src/legacy/components/message-preview.jsx");
await import("../../../../apps/dashboard/src/legacy/components/template-chips.jsx");
await import("../../../../apps/dashboard/src/legacy/components/campaign-bits.jsx");
// The kit's components (Confirm, StatePill, ...) are on the window the pages read them off (seed-globals, in the app).
Object.assign(globalThis.window, kitPages);
globalThis.StatePill = kitPages.StatePill;
const { OutcomePill } = await import("../../../../apps/dashboard/src/surfaces/inbox/pages/conversations-page.tsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};
const textOf = (n) => {
  const out = [];
  walk(n, (x) => {
    for (const k of x.props?.children ?? []) if (typeof k === "string" || typeof k === "number") out.push(String(k));
  });
  return out.join("");
};
const pillClass = (n) => (n.rendered ?? n).props.className;

test("Conversations draws a call's own story in amber -- 'Asked for a call back', 'Hung up early' -- and keeps 'Receptionist handled it' for the calls it describes", () => {
  const callback = OutcomePill({ outcome: toCallVM(call(), ZONE, NOW).outcome, channel: "phone" });
  assert.equal(textOf(callback), "Asked for a call back");
  assert.ok(pillClass(callback).includes("pill-warn"), pillClass(callback));

  const quick = OutcomePill({
    outcome: toCallVM(
      call({ duration_ms: 6_000, disconnection_reason: "user_hangup", outcome: null, follow_up: null }),
      ZONE,
      NOW,
    ).outcome,
    channel: "phone",
  });
  assert.equal(textOf(quick), "Hung up early");
  assert.ok(pillClass(quick).includes("pill-warn"), pillClass(quick));

  const handled = OutcomePill({
    outcome: toCallVM(call({ outcome: null, follow_up: null }), ZONE, NOW).outcome,
    channel: "phone",
  });
  assert.equal(textOf(handled), "Receptionist handled it");
});

/* ------------- Today: a dark line silences the reassurance -------------- */

Object.assign(globalThis, { EmptyState: kitPages.EmptyState, FailedRead: kitPages.FailedRead });
kitHooks();
globalThis.PolicyChip = kitPages.PolicyChip;
globalThis.StatStrip = globalThis.window.StatStrip || (({ children }) => children);
globalThis.StatCell = globalThis.window.StatCell || ((p) => p.value);
globalThis.useHotkey = () => {};
Object.assign(globalThis.window, {
  canDo: () => true,
  appNavigate() {},
  setInterval: () => 1,
  clearInterval() {},
  dispatchEvent() {},
});
// Today's pages are TSX (decision 0015): they draw the kit's AttnRow and read the day over the seam.
const { HeroBrief } = await import("../../../../apps/dashboard/src/surfaces/today/pages/brief.tsx");
const { TodayCard } = await import("../../../../apps/dashboard/src/surfaces/today/pages/card.tsx");
const { AgentCommand } = await import("../../../../apps/dashboard/src/surfaces/today/pages/queue.tsx");
const { setSurfaceValue, surfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");

const todayWith = (channels) =>
  toTodayVM(
    {
      ...metrics(null),
      channels,
      now: {
        escalations_open: 0,
        oldest_open_escalation_at: null,
        threads_needing_human: 0,
        threads_snoozed: 0,
        threads_awaiting_reply: 0,
        last_inbound_at: null,
        last_outbound_at: null,
      },
    },
    [],
    [],
    [],
    NOW,
  );
const mountToday = (vm) => {
  setSurfaceValue("today", vm);
  cells = [];
  frames.begin();
  const hero = textOf(HeroBrief());
  cells = [];
  frames.begin();
  // The day's card sits under the work; the hero is the line above it, drawn only while a line is down.
  const recap = textOf(TodayCard());
  cells = [];
  frames.begin();
  const queue = textOf(AgentCommand());
  return { hero, recap, queue };
};

test("REGRESSION: while a line is down, Today never says nothing needs you -- the hero and the queue say new messages go unanswered", () => {
  const down = todayWith([{ kind: "whatsapp", status: "disconnected", number: "+1 305" }]);
  assert.ok(down.standing.alert, "the fixture is a day with a dark line");
  const { hero, queue } = mountToday(down);
  assert.ok(!hero.includes("Queue clear"), hero);
  assert.ok(!queue.includes("All caught up"), queue);
  assert.ok(!queue.includes("nothing needs you"), `the queue's own heading does not reassure either: ${queue}`);
  assert.ok(hero.includes(down.standing.alert), `the line above the work carries the dark line: ${hero}`);
  assert.ok(queue.includes("Nothing in the queue — new messages go unanswered until the line is back."), queue);
});

test("with every line up and nothing waiting, the reassurance stands", () => {
  const { hero, queue } = mountToday(todayWith([{ kind: "whatsapp", status: "active", number: "+1 305" }]));
  // The reassurance is the queue's own, said once: a chip above it said it again, over the work it describes.
  assert.equal(hero, "", `nothing above the work says it too: ${hero}`);
  assert.ok(queue.includes("All caught up — the receptionist is answering on its own."), queue);
});

/* ---------------- the Inbox: Hold all, and a missing link ---------------- */

globalThis.window.CHANLY = { ...globalThis.window.CHANLY, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } };
// The Inbox (surfaces/inbox, TSX), drawn over the rows the seam holds; the one thread it mounts is thread-pane.tsx's.
const SRC = "../../../../apps/dashboard/src";
const { Inbox } = await import(`${SRC}/surfaces/inbox/pages/inbox-page.tsx`);
const { InboxThread } = await import(`${SRC}/surfaces/inbox/thread/thread.tsx`);
const { ixHoldAll } = await import(`${SRC}/surfaces/inbox/pages/hold-all.ts`);
const { ixRouteThread } = await import(`${SRC}/surfaces/inbox/rules.ts`);
const inboxValue = () => surfaceValue("inbox");
/** The threads a draw of the Inbox handed the one thread's pane: none while a link's notice stands. */
const openedIn = (tree) => {
  const opened = [];
  walk(tree, (n) => {
    if (n.type === InboxThread) opened.push(n.props.thread ? n.props.thread.id : null);
  });
  return opened.filter(Boolean);
};

test("REGRESSION: Hold all withdraws every real draft through the door the single Hold uses, stops every countdown at once, and names a draft the server would not hold", async () => {
  assert.equal(typeof ixHoldAll, "function", "Hold all is one act that can be run");
  const state = {};
  const calls = [];
  const heldWhenAsked = [];
  const cancelSend = async (messageId) => {
    calls.push(messageId);
    heldWhenAsked.push(Object.values(state).every((s) => s.held));
    return messageId === "m2" ? { ok: false, message: "It has already gone out." } : { ok: true };
  };
  const drafts = [
    { id: "th-1", real: true, who: "Rosa", veto: { messageId: "m1" } },
    { id: "th-2", real: true, who: "Ana", veto: { messageId: "m2" } },
  ];
  const result = await ixHoldAll(drafts, { state, cancelSend });
  assert.deepEqual(
    calls,
    ["m1", "m2"],
    "REGRESSION: the old Hold all never called the server, so every draft still sent",
  );
  assert.ok(
    heldWhenAsked.length === 2 && heldWhenAsked.every(Boolean),
    "every countdown stopped before the first answer came back",
  );
  // A hold is the draft's own record (I3): kept against the thread, the next draft there read "Held" and sent.
  assert.equal(state["draft:m1"].held, true);
  assert.equal(state["draft:m2"].held, false, "a draft the server could not hold is not shown as held");
  assert.equal(result.held, 1);
  assert.deepEqual(
    result.refused.map((r) => r.who),
    ["Ana"],
  );
});

test("REGRESSION: the shell passes a thread id on even when the Inbox has not loaded it, instead of dropping it", () => {
  assert.equal(typeof ixRouteThread, "function", "the route's thread is one rule that can be run");
  const threads = [{ id: "th-a", who: "Emily Chen" }];
  assert.deepEqual(ixRouteThread("th-missing", threads), { id: "th-missing", who: null });
  assert.deepEqual(ixRouteThread("th-a", threads), { id: "th-a", who: "Emily Chen" });
  assert.deepEqual(ixRouteThread(undefined, threads), { id: null, who: null });
});

test("REGRESSION: a link to a thread the Inbox has not loaded draws the missing notice in the pane and opens nobody else's conversation", () => {
  setSurfaceValue("inbox", {
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: {},
    THREADS: [{ id: "th-a", real: true, who: "Emily Chen", state: "escalated", needsYou: true, tags: [], whoMeta: "" }],
  });
  cells = [];
  frames.begin();
  const tree = Inbox({ initialThreadId: "th-missing", showAgentRail: false });
  const missing = (() => {
    let hit = null;
    walk(tree, (n) => {
      if (!hit && n.props?.["data-testid"] === "inbox-missing-thread") hit = n;
    });
    return hit;
  })();
  assert.ok(missing, "the pane says the conversation is not among those loaded");
  assert.ok(textOf(missing).includes("isn't among the newest"), textOf(missing));
  assert.deepEqual(openedIn(tree), [], "REGRESSION: Emily Chen's thread opened in place of the one the link named");
});

test("REGRESSION: the missing notice holds when the Inbox is read again -- on the live salon a refresh moments later opened Emily Chen in its place", () => {
  // The page's own listener, run: the harness's addEventListener keeps nothing, which is how the
  // first test passed while the live page, re-read seconds after the link, still opened the first thread.
  const listeners = {};
  const keep = { add: globalThis.window.addEventListener, remove: globalThis.window.removeEventListener };
  globalThis.window.addEventListener = (type, fn) => {
    (listeners[type] ||= []).push(fn);
  };
  globalThis.window.removeEventListener = () => {};
  try {
    // Threads as the view model makes them: the one the link names is drawn by the real pane when it arrives.
    const threadOf = (id, name) =>
      toInboxThreadVM(conversation(id, name), escalation(`e-${id}`, id, "2026-08-29T12:00:00Z"), ZONE, NOW);
    const emily = threadOf("a", "Emily Chen");
    setSurfaceValue("inbox", {
      INBOX_BUCKETS: [],
      INBOX_VIEWS: [],
      CHANNEL_LABELS: {},
      INBOX_BASELINE: {},
      THREADS: [emily],
    });
    const render = () => {
      frames.begin();
      return Inbox({ initialThreadId: "th-missing", showAgentRail: false });
    };
    const missingIn = (tree) => {
      let hit = null;
      walk(tree, (n) => {
        if (!hit && n.props?.["data-testid"] === "inbox-missing-thread") hit = n;
      });
      return hit;
    };
    const reread = (threads) => {
      setSurfaceValue("inbox", { ...inboxValue(), THREADS: threads });
      for (const fn of listeners["surface:inbox"] ?? []) fn();
    };
    cells = [];
    assert.ok(missingIn(render()), "the notice, as the link lands");
    assert.ok((listeners["surface:inbox"] ?? []).length > 0, "the Inbox listens for its surface being read again");

    // Read again -- a realtime event, a verb elsewhere, the periodic refresh -- and still no such thread.
    reread([{ ...emily }]);
    assert.ok(missingIn(render()), "REGRESSION: after the re-read the notice was gone");
    assert.deepEqual(
      openedIn(render()),
      [],
      "REGRESSION: Emily Chen's thread opened in place of the one the link named",
    );

    // The link was right, only early: when a later read brings the thread, it opens.
    reread([{ ...emily }, threadOf("missing", "Nina Park")]);
    const arrived = render();
    assert.equal(missingIn(arrived), null, "no notice once the thread is loaded");
    assert.equal(openedIn(arrived).at(-1), "th-missing", "the thread the link named opens");
  } finally {
    globalThis.window.addEventListener = keep.add;
    globalThis.window.removeEventListener = keep.remove;
  }
});

/* ---------- the composer: no Save draft that keeps nothing ---------- */

const { Composer } = await import(`${SRC}/surfaces/inbox/thread/composer.tsx`);

test("REGRESSION: a real thread's composer offers no Save draft -- it flashed 'Draft saved' and kept nothing", () => {
  assert.equal(typeof Composer, "function", "the composer can be drawn on its own");
  const buttons = (tree) => {
    const out = [];
    walk(tree, (n) => {
      if (n.type === "button") out.push(textOf(n));
    });
    return out;
  };
  cells = [];
  frames.begin();
  const real = Composer({
    thread: {
      id: "th-1",
      real: true,
      who: "Rosa",
      primaryChannel: "whatsapp",
      hasChat: true,
      windowOpen: true,
      optedOut: false,
    },
    reply: "",
  });
  assert.ok(!buttons(real).some((b) => b.includes("Save draft")), JSON.stringify(buttons(real)));
  assert.ok(
    buttons(real).some((b) => b.includes("Send")),
    "the send stays",
  );
  cells = [];
  frames.begin();
  const seed = Composer({
    thread: { id: "t-seed", real: false, who: "Aisha", primaryChannel: "sms" },
    reply: "",
  });
  assert.ok(
    buttons(seed).some((b) => b.includes("Save draft")),
    "the demo keeps its mockup control",
  );
});

/* People › Lists folded into People (#563): the Offers-column test lives in people-honest.test.mjs, on the People table. */

/* ---------------------- Calendar: Day view steps a day ---------------------- */

await import("../../../../apps/dashboard/src/legacy/pages/calendar.jsx");

test("REGRESSION: in Day view the arrows move one day -- they moved seven", async () => {
  const { shiftKey, shiftMonth } = await import("@chanlytics/contracts");
  assert.equal(typeof globalThis.window.crStep, "function", "the step is one rule that can be run");
  const kit = { shiftKey, shiftMonth };
  assert.equal(globalThis.window.crStep("day", "2026-09-14", 1, kit), "2026-09-15");
  assert.equal(globalThis.window.crStep("day", "2026-09-14", -1, kit), "2026-09-13");
  assert.equal(globalThis.window.crStep("week", "2026-09-14", 1, kit), "2026-09-21");
  assert.equal(globalThis.window.crStep("agenda", "2026-09-14", 1, kit), "2026-09-28");
  assert.equal(globalThis.window.crStep("month", "2026-09-14", 1, kit), shiftMonth("2026-09-14", 1));
});

/* ---------------- the policy chip: no invented trust figures ---------------- */

test("REGRESSION: on a real workspace a policy chip's tooltip names the policy -- it quoted the mockup's '128 auto-sent · 9% edited'", () => {
  const PolicyChip = kitPages.PolicyChip;
  Object.assign(globalThis.window, {
    POLICY: { row: () => ({ id: "reengage", chip: "Re-engage", locked: false }), modeOf: () => "Ask" },
    TRUST: { cls: () => ({ sent: 128 }), rate: () => 9 },
    __POLICIES: { rows: [] },
  });
  cells = [];
  frames.begin();
  const real = PolicyChip({ cls: "reengage" });
  assert.equal(real.props["data-tip"], "Workspace policy — Settings · Autonomy");
  delete globalThis.window.__POLICIES;
  cells = [];
  frames.begin();
  const demo = PolicyChip({ cls: "reengage" });
  assert.ok(String(demo.props["data-tip"]).includes("128 auto-sent"), "the demo keeps its own figures");
});

/* ------------- Campaigns: an approve says when the run really goes ------------- */

// The pages' one clock (legacy-bridge/zone.ts): the workspace's zone once one is published.
const { installClock } = await import("../../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();
await import("../../../../apps/dashboard/src/legacy/pages/broadcasts-run.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/broadcasts-ledger.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/broadcasts.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/playbook-bits.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/playbook-card.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/playbook-composer.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/outbound.jsx");

test("REGRESSION: approving a run the server moved to nine says so -- the toast said 'sending now'", async () => {
  assert.equal(typeof globalThis.window.bcWhenWords, "function", "one sentence for when a send really goes");
  const moved = globalThis.window.bcWhenWords({
    scheduled_for: "2026-09-15T13:00:00Z",
    moved_from: "2026-09-15T02:00:00Z",
  });
  assert.ok(moved.startsWith("scheduled for "), moved);
  assert.ok(moved.includes("between 9:00 and 20:59"), moved);
  assert.equal(
    globalThis.window.bcWhenWords({ scheduled_for: new Date(Date.now() + 5_000).toISOString(), moved_from: null }),
    "sending now",
  );

  const toasts = [];
  globalThis.window.__playbooks = {
    approveRun: async () => ({
      ok: true,
      data: { recipient_count: 3, scheduled_for: "2026-09-15T13:00:00Z", moved_from: "2026-09-15T02:00:00Z" },
    }),
  };
  const p = {
    id: "pb-1",
    name: "Win-back",
    state: "running",
    trigger: "winback",
    triggerLabel: "Quiet 30 days",
    triggerHint: "",
    schedule: "daily at 10:00",
    next: "tomorrow 10:00",
    policy_class: "marketing",
    template_name: "winback_offer",
    template_language: "en_US",
    candidates: 3,
    last_run_for: null,
    totals: {
      waiting: { id: "b-w", recipient_count: 3 },
      runs: 1,
      sent: 0,
      delivered: 0,
      replied: 0,
      held: 0,
      history: [],
    },
  };
  cells = [];
  frames.begin();
  const tree = globalThis.window.PlaybookCard({ p, canAct: true, onEdit() {}, flash: (t) => toasts.push(t) });
  let approve = null;
  walk(tree, (n) => {
    if (!approve && n.props?.["data-testid"] === "pb-approve") approve = n;
  });
  assert.ok(approve, "a waiting run offers Approve");
  await approve.props.onClick();
  const said = textOf(toasts.at(-1).msg);
  assert.ok(!said.includes("sending now"), said);
  assert.ok(said.includes("scheduled for"), said);
});

/** A Tokyo workspace, with "now" pinned, for one page test: New York and UTC disagree with it about the day. */
const inTokyo = (nowIso, fn) => {
  const before = {
    ws: globalThis.window.__WORKSPACES,
    active: globalThis.window.__ACTIVE_WORKSPACE,
    bc: globalThis.window.__BROADCASTS,
  };
  const realNow = Date.now;
  Object.assign(globalThis.window, {
    __WORKSPACES: [{ id: "t-tokyo", slug: "tokyo", name: "Tokyo Salon", status: "active", timezone: "Asia/Tokyo" }],
    __ACTIVE_WORKSPACE: "t-tokyo",
  });
  Date.now = () => Date.parse(nowIso);
  try {
    return fn();
  } finally {
    Date.now = realNow;
    Object.assign(globalThis.window, {
      __WORKSPACES: before.ws,
      __ACTIVE_WORKSPACE: before.active,
      __BROADCASTS: before.bc,
    });
  }
};

test("REGRESSION (C11): the schedule box reads and writes the business's clock, and says before Schedule when the send will really go", () => {
  // Noon on 15 December in Tokyo; 10 PM on the 14th in New York.
  inTokyo("2026-12-15T03:00:00Z", () => {
    let picked;
    cells = [];
    frames.begin();
    const box = globalThis.window.BcWhenBox({
      at: null,
      maxDays: 30,
      onChange: (v) => {
        picked = v;
      },
    });
    assert.equal(box.props.min, "2026-12-15T12:00", "no earlier than now, by the clock in Tokyo");
    assert.equal(box.props.max, "2027-01-14T12:00", "and within thirty days");
    box.props.onChange({ target: { value: "2026-12-15T22:30" } });
    assert.equal(picked, Date.parse("2026-12-15T13:30:00Z"), "REGRESSION: 10:30 PM was read on the device's clock");
    const late = globalThis.window.bcWhenNote(picked, 30);
    assert.deepEqual(
      [late.ok, late.words],
      [true, "Goes out tomorrow 9:00 AM, Tokyo time — sends wait for 9:00–20:59"],
    );
    assert.equal(
      globalThis.window.bcWhenNote(Date.parse("2026-12-15T05:00:00Z"), 30).words,
      "Goes out today 2:00 PM, Tokyo time",
    );
    assert.equal(
      globalThis.window.bcWhenNote(Date.parse("2026-12-15T02:00:00Z"), 30).ok,
      false,
      "a time that has passed is not scheduled",
    );
    assert.equal(
      globalThis.window.bcWhenNote(Date.parse("2027-02-01T02:00:00Z"), 30).ok,
      false,
      "nor one past thirty days",
    );
    assert.equal(globalThis.window.bcWhenNote(null, 30).words, "By Tokyo time · within 30 days");
    const receipt = globalThis.window.bcWhenWords({
      scheduled_for: "2026-12-16T00:00:00Z",
      moved_from: "2026-12-15T13:30:00Z",
    });
    assert.ok(receipt.startsWith("scheduled for tomorrow 9:00 AM"), `the receipt, by the same clock: ${receipt}`);
  });
});

test("REGRESSION (D5): Today's 'went out' line is the business's today, at the business's time", () => {
  // 2 PM on the 7th in Tokyo; 1 AM on the 7th in New York. The run went out at 1:30 AM on the 7th in Tokyo.
  inTokyo("2026-09-07T05:00:00Z", () => {
    globalThis.window.__BROADCASTS = {
      rows: [
        {
          id: "b1",
          name: "Spring offer",
          state: "sent",
          started_at: "2026-09-06T16:30:00Z",
          playbook_id: null,
          audience: { label: "Everyone" },
          counts: { sent: 8, replied: 1 },
        },
      ],
    };
    setSurfaceValue("today", todayWith([{ kind: "whatsapp", status: "active", number: "+1 305" }]));
    cells = [];
    frames.begin();
    // The line is drawn by a component that returns a list, which the walk does not enter: read it off its own node.
    let lines = null;
    walk(TodayCard(), (n) => {
      if (lines === null && typeof n.type === "function" && n.type.name === "RunsDone") lines = n.rendered;
    });
    const said = (lines || []).map(textOf).join(" | ");
    assert.ok(
      said.includes("went out at 1:30 AM: 8 sent, 1 replied") && said.includes("Spring offer"),
      `REGRESSION: yesterday in New York, so not said at all: ${said}`,
    );
  });
});

/* ------ Messages: an unread number, and the business the preview names ------ */

await import("../../../../apps/dashboard/src/legacy/pages/messages.jsx");

const mountMessages = (over) => {
  Object.assign(
    globalThis.window,
    {
      __TEMPLATES_ALL: [],
      __CHANNELS: [],
      __ME: { role: "owner" },
      __starters: undefined,
      __SETTINGS: {
        config: { brain: { business_name: "Marisa's Beauty Salon", booking_link: "https://book.example.com/marisa" } },
      },
    },
    over,
  );
  cells = [];
  frames.begin();
  return globalThis.window.MessagesPage();
};
const byId = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.["data-testid"] === id) hit = n;
  });
  return hit;
};
/**
 * Messages with ONE named message open: a row carries a line of the words, and
 * the whole message -- its slots filled with this business's own -- is inside it.
 * Named, because eight starters are rows on the same page and opening whichever
 * is first passes a preview assertion with another message's words.
 */
const mountMessagesOpen = (over, name) => {
  const tree = mountMessages(over);
  let row = null;
  // By the name WhatsApp knows it by, which the row carries as data-template: the row's own words are its title and
  // its quote, and the name in type left the closed row (23 Sep, Campaigns made compact).
  walk(tree, (n) => {
    if (
      !row &&
      /^(starter|custom)-row$/.test(String(n.props?.["data-testid"] || "")) &&
      n.props?.["data-template"] === name
    )
      row = n;
  });
  assert.ok(row, `no row for ${name}`);
  byId(row, "template-open").props.onClick();
  frames.begin();
  return globalThis.window.MessagesPage();
};

test("REGRESSION: when the number could not be read, Messages says that -- it said 'Connect a WhatsApp number first' on a workspace that has one", () => {
  const failed = mountMessages({ __CHANNELS: null });
  assert.ok(byId(failed, "messages-channels-failed"), "the failed read has its own card");
  assert.equal(byId(failed, "messages-no-number"), null, "REGRESSION: a null read was shown as no number");
  const none = mountMessages({ __CHANNELS: [] });
  assert.ok(byId(none, "messages-no-number"), "a workspace with no number is still told to connect one");
});

test("REGRESSION: a message's preview names this business and its booking link -- it showed the sample filed with Meta, 'Luna Studio'", async () => {
  // The page reads the starter library the bridge installs, not a stand-in.
  const { installTemplates } = await import("../../../../apps/dashboard/src/legacy-bridge/templates.ts");
  installTemplates();
  const starters = globalThis.window.__starters;
  // A row as the sync stores it (apps/edge/api/admin/whatsapp/templates-create.ts): a position, a label,
  // the example filed with Meta -- and no kind. The first fix read a `kind` no real row carries, so the
  // salon's five approved starters still said "Luna Studio" on 14 September.
  const filed = [
    { label: "Value 1", example: "Dani", position: 1 },
    { label: "Value 2", example: "Luna Studio", position: 2 },
    { label: "Value 3", example: "https://booksy.com/luna-studio", position: 3 },
  ];
  const row = (over) => ({
    id: "t1",
    channel: "whatsapp",
    name: "save_our_number",
    language: "en_US",
    meta_status: "approved",
    category: "marketing",
    source: "chanlytics",
    hidden_at: null,
    title: null,
    quality: null,
    rejected_reason: null,
    synced_at: null,
    body_preview: "Hi {{1}}, thanks for calling {{2}}. Book any time: {{3}} or just write to us here.",
    variables: filed,
    ...over,
  });
  for (const language of ["en_US", "es"]) {
    const said = textOf(
      byId(
        mountMessagesOpen(
          { __CHANNELS: [{ kind: "whatsapp" }], __starters: starters, __TEMPLATES_ALL: [row({ language })] },
          "save_our_number",
        ),
        "template-open-body",
      ),
    );
    assert.ok(said.includes("Marisa's Beauty Salon"), `${language}: ${said}`);
    assert.ok(said.includes("https://book.example.com/marisa"), `${language}: ${said}`);
    assert.ok(
      !said.includes("Luna Studio") && !said.includes("booksy.com/luna-studio"),
      `REGRESSION (${language}): another business's name and link in this business's message`,
    );
    assert.ok(said.includes("Hi Dani"), "the customer's name stays a sample: no one customer is being shown");
  }
  // A template written in WhatsApp Manager is that business's own words: a slot nothing names keeps the example it filed.
  const theirs = textOf(
    byId(
      mountMessagesOpen(
        {
          __CHANNELS: [{ kind: "whatsapp" }],
          __starters: starters,
          __TEMPLATES_ALL: [
            row({
              id: "t2",
              name: "front_desk_note",
              source: "meta",
              body_preview: "A note from {{1}}.",
              variables: [{ label: "Value 1", example: "the front desk", position: 1 }],
            }),
          ],
        },
        "front_desk_note",
      ),
      "template-open-body",
    ),
  );
  assert.ok(theirs.includes("A note from the front desk."), theirs);
});

/* ------ Broadcasts: numbers over the latest fifty say they are the latest fifty ------ */

test("REGRESSION (D12): past fifty broadcasts the header says its numbers are the latest fifty -- they read as everything", () => {
  assert.equal(
    typeof globalThis.window.BcHistoryStats,
    "function",
    "the history's numbers are one piece that can be drawn",
  );
  const cellWords = (p) => ({
    type: "stat",
    props: { children: [String(p.label), " ", String(p.value), " ", String(p.meta || "")] },
  });
  const keep = globalThis.StatCell;
  globalThis.StatCell = cellWords;
  try {
    const row = (i) => ({
      id: `b${i}`,
      open: false,
      state: "sent",
      counts: { sent: 2, delivered: 1, replied: 1, skipped: 0, failed: 0 },
    });
    cells = [];
    frames.begin();
    const capped = textOf(globalThis.window.BcHistoryStats({ rows: [row(1), row(2)], more: true }));
    assert.ok(capped.includes("latest 50"), capped);
    cells = [];
    frames.begin();
    const whole = textOf(globalThis.window.BcHistoryStats({ rows: [row(1), row(2)], more: false }));
    assert.ok(!whole.includes("latest 50"), whole);
    assert.ok(whole.includes("4 messages"), whole);
  } finally {
    globalThis.StatCell = keep;
  }
});

/* -------------- Ask: an undo stays open only while it can still be true -------------- */

test("REGRESSION: an Ask card's undo expires -- it was offered forever, and a settings undo wrote the whole earlier config over later saves", async () => {
  const { askUndoOpen, ASK_UNDO_MS } = await import("@chanlytics/contracts");
  assert.equal(typeof askUndoOpen, "function", "one rule for when an undo is still true");
  const T = Date.parse("2026-09-14T12:00:00Z");
  // A reply: until the send's own cancel window closes, and not a moment after.
  assert.equal(
    askUndoOpen("reply", { message_id: "m", cancelable_until: new Date(T + 5_000).toISOString() }, T, T, null),
    true,
  );
  assert.equal(
    askUndoOpen("reply", { message_id: "m", cancelable_until: new Date(T - 1).toISOString() }, T - 20_000, T, null),
    false,
    "a message already sent cannot be canceled",
  );
  // Everything else: ten minutes after the act.
  assert.equal(ASK_UNDO_MS, 10 * 60_000);
  assert.equal(
    askUndoOpen("thread_verb", { verb: "wake", conversation_id: "c" }, T - ASK_UNDO_MS + 1_000, T, null),
    true,
  );
  assert.equal(askUndoOpen("thread_verb", { verb: "wake", conversation_id: "c" }, T - ASK_UNDO_MS - 1, T, null), false);
  // Settings: and only while nobody has saved since.
  assert.equal(askUndoOpen("settings", { config: {}, version_after: 4 }, T - 1_000, T, 4), true);
  assert.equal(
    askUndoOpen("settings", { config: {}, version_after: 4 }, T - 1_000, T, 5),
    false,
    "REGRESSION: the whole earlier config restored over a later save",
  );
  assert.equal(
    askUndoOpen("settings", { config: {} }, T - 1_000, T, 4),
    false,
    "an undo that does not know what it wrote cannot prove nobody saved since",
  );
  assert.equal(askUndoOpen("reply", null, T, T, null), false);
});

await import("../../../../apps/dashboard/src/legacy/pages/ask-text.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/ask-turn.jsx");

test("REGRESSION: a reopened card whose undo has expired offers none, and undoing a new playbook asks first -- it deleted the playbook in one click", async () => {
  const { askUndoOpen } = await import("@chanlytics/contracts");
  const undone = [];
  globalThis.window.__ask = {
    undoOpen: askUndoOpen,
    undo: async (p) => {
      undone.push(p.kind);
      return { ok: true, receipt: "Deleted — nothing will run" };
    },
    outcome: async () => true,
    commit: async () => ({ ok: true, receipt: "", undo: null }),
  };
  globalThis.window.canDo = () => true;
  const t = globalThis.window.askText("en");
  const buttons = (tree) => {
    const out = [];
    walk(tree, (n) => {
      if (n.type === "button") out.push(n);
    });
    return out;
  };

  // A reply sent two days ago: its cancel window closed long since.
  const sentAt = Date.now() - 2 * 86_400_000;
  const old = {
    id: "p1",
    kind: "reply",
    title: "Reply to Rosa",
    summary: "On our way.",
    payload: { conversation_id: "c1", text: "On our way.", who: "Rosa" },
    undo: "Cancel within 15 seconds of sending",
    outcome: {
      state: "done",
      receipt: "Sent to Rosa",
      atMs: sentAt,
      undo: { message_id: "m9", cancelable_until: new Date(sentAt + 15_000).toISOString() },
    },
  };
  cells = [];
  frames.begin();
  // A send's undo says Undo, its words its title (the spec 2026-09-27-ask-chat-on-a-phone, D16): neither may stand.
  assert.ok(
    !buttons(globalThis.window.AskCard({ p: old, messageId: "x", t, onNav() {} })).some(
      (b) =>
        textOf(b) === t.undo ||
        textOf(b).includes("Cancel within") ||
        String(b.props.title || "").includes("Cancel within"),
    ),
    "REGRESSION: the undo outlived the send",
  );

  // A playbook made a minute ago: undoing it deletes it, so the card asks first.
  const made = {
    id: "p2",
    kind: "playbook",
    title: "Win-back",
    summary: "Every 30 days",
    payload: {},
    undo: "Delete it — nothing will run",
    outcome: {
      state: "done",
      receipt: "Playbook “Win-back” is running",
      atMs: Date.now() - 60_000,
      undo: { playbook_id: "pb1" },
    },
  };
  cells = [];
  frames.begin();
  let tree = globalThis.window.AskCard({ p: made, messageId: "x", t, onNav() {} });
  const undoButton = buttons(tree).find((b) => textOf(b).includes("Delete it"));
  assert.ok(undoButton, "a fresh undo is offered");
  await undoButton.props.onClick();
  assert.deepEqual(undone, [], "REGRESSION: one click deleted the playbook");
  frames.begin();
  tree = globalThis.window.AskCard({ p: made, messageId: "x", t, onNav() {} });
  let yes = null;
  walk(tree, (n) => {
    if (!yes && n.props?.["data-testid"] === "ask-card-undo-yes") yes = n;
  });
  assert.ok(yes, "the card asks before it deletes");
  await yes.props.onClick();
  assert.deepEqual(undone, ["playbook"]);
});

test("a deal card wears the deal word and Open goes to the person's page: a kind the card's maps did not know read as its key and opened inbox/th-undefined", async () => {
  const { cardOpenRoute } = await import("@chanlytics/contracts");
  globalThis.window.__ask = {
    undoOpen: () => false,
    undo: async () => ({ ok: true, receipt: "" }),
    outcome: async () => true,
    commit: async () => ({ ok: true, receipt: "", undo: null }),
    // Where a card's Open goes is the contract's (ask-answer.ts), as the bridge publishes it.
    cardOpenRoute,
  };
  globalThis.window.canDo = () => true;
  const buttons = (tree) => {
    const out = [];
    walk(tree, (n) => {
      if (n.type === "button") out.push(n);
    });
    return out;
  };
  const went = [];
  const p = {
    id: "p3",
    kind: "deal",
    title: "Maria · Client",
    summary: "Client · SEO · $2,500 a month",
    payload: { contact_id: "c-21", stage: "won", who: "Maria" },
    undo: null,
  };
  for (const lang of ["en", "es"]) {
    const t = globalThis.window.askText(lang);
    cells = [];
    frames.begin();
    const tree = globalThis.window.AskCard({ p, messageId: "x", t, onNav: (to) => went.push(to) });
    let kind = null;
    walk(tree, (n) => {
      if (!kind && n.props?.className === "ask-card-kind") kind = n;
    });
    assert.ok(kind, `${lang}: the card names its kind`);
    assert.equal(textOf(kind), t.kDeal, `${lang}: the kind word, not the key`);
    const open = buttons(tree).find((b) => textOf(b) === t.openIt);
    assert.ok(open, `${lang}: Open is offered on a deal card`);
    open.props.onClick();
  }
  assert.deepEqual(went, ["clients/c-21", "clients/c-21"], "Open lands on the person's page, where the deal is");
  assert.notEqual(globalThis.window.askText("es").kDeal, "deal", "the Spanish card says it in Spanish");
});

/* -------------------- Ask: a failure says what failed -------------------- */

test("REGRESSION: Ask's failures say what failed -- a failed read said 'Thread deleted', a failed delete and a failed copy said the calendar could not be read", async () => {
  const { openingsAnswer } = await import("@chanlytics/contracts");
  for (const lang of ["en", "es"]) {
    const t = globalThis.window.askText(lang);
    // The calendar's own sentence is the quick answer's now (contracts ask-answer.ts).
    const calendar = openingsAnswer({ state: "unavailable", days: [] }, lang).say.headline;
    for (const k of ["threadUnreadable", "deleteFailed", "copyFailed"]) {
      assert.equal(typeof t[k], "string", `${lang}.${k}`);
      assert.notEqual(t[k], calendar, `${lang}.${k} is not the calendar's sentence`);
      assert.notEqual(t[k], t.deleted, `${lang}.${k} is not "deleted"`);
    }
  }
});

/* ------------------ the Terms: the ways in, as they are ------------------ */

test("REGRESSION: the Terms name the password among the ways to sign in -- they said Google or a code after the password became the everyday credential", async () => {
  const { default: TermsPage } = await import("../../../../apps/dashboard/app/terms/page.tsx");
  const lines = [];
  const collect = (n) => {
    if (n == null || typeof n !== "object") return;
    const kids = n.props?.children;
    for (const k of Array.isArray(kids) ? kids : [kids]) {
      if (typeof k === "string") lines.push(k);
      else collect(k);
    }
  };
  collect(TermsPage());
  const signIn = lines.find((s) => s.startsWith("Sign-in is"));
  assert.ok(signIn, `the sign-in sentence among ${lines.length} lines`);
  assert.ok(signIn.includes("password"), signIn);
});
