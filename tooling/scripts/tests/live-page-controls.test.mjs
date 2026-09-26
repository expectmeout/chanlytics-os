/**
 * The Live page, rendered without a browser, with a call on the line.
 *
 * Nothing in lint or the build runs the legacy pages; a page that throws at
 * render is found by the first owner who opens it. So the page is mounted
 * here the way setup-page-activate mounts Setup: the real component tree
 * over a fake React whose hooks keep their cells between mounts, and the
 * bridge's verbs recorded. What is proved is what a click reaches, and what
 * the transcript says about who spoke.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toLiveVM, frameWhisper, frameHandOver, liveStillUp, liveBar, fmtClock } from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const CALL = "call_abc123def456";
const LINE = "+13055550199";

const call = (over = {}) => ({
  id: "c-live",
  retell_call_id: CALL,
  direction: "inbound",
  call_type: "phone_call",
  status: "ongoing",
  from_e164: "+16465550123",
  from_raw: null,
  to_e164: "+13055550100",
  started_at: iso(90_000),
  ended_at: null,
  duration_ms: null,
  disconnection_reason: null,
  sentiment: null,
  call_successful: null,
  in_voicemail: null,
  summary: null,
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: null,
  transcript_object: [
    { role: "agent", content: "Thank you for calling Harbor Moving!" },
    { role: "injected", content: frameWhisper("offer the 3pm slot") },
    { role: "user", content: "Can I speak to someone?" },
    { role: "injected", content: frameHandOver() },
  ],
  recording: null,
  conversation_id: "cv1",
  contact_id: "k1",
  message_id: null,
  created_at: iso(90_000),
  updated_at: iso(2_000),
  contact: { display_name: "Rosa", wa_profile_name: null, phone_e164: "+16465550123" },
  ...over,
});
const channels = [
  { id: "ch1", kind: "voice", number_e164: "+13055550100", status: "active", created_at: iso(86_400_000), config: {} },
];

/* ---- the page itself, rendered without a browser ---- */
const calls = { end: [], hand: [], whisper: [], flash: [], nav: [], refresh: 0 };
// The page destructures the hooks at module load, so React carries them from the start.
let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
const fresh = () => {
  cells = [];
};
globalThis.Icon = "Icon";
globalThis.StatePill = "StatePill";
globalThis.StatStrip = "StatStrip";
globalThis.StatCell = "StatCell";
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
};
globalThis.window = {
  // The chrome bridge, as installShell publishes it.
  __chrome: { liveStillUp, liveBar, fmtClock },
  __LIVE: toLiveVM([call()], channels, ZONE, new Date(NOW)),
  __FACTS: { facts: { handoff_number: { value: LINE } } },
  // The client's answers: the route's body under data (client/api.ts). A flat fake hid that the toast read r.line.
  __endCall: async (id) => {
    calls.end.push(id);
    return { ok: true, data: { ok: true, decision_id: "d1" } };
  },
  __handOverCall: async (id) => {
    calls.hand.push(id);
    return { ok: true, data: { ok: true, decision_id: "d2", line: LINE } };
  },
  __whisperCall: async (id, text) => {
    calls.whisper.push([id, text]);
    return { ok: true };
  },
  __refreshLive: () => {
    calls.refresh += 1;
  },
  usePPToast: () => [null, (m) => calls.flash.push(m)],
  gate: () => ({}),
  CHANLY: { nav: (to) => calls.nav.push(to), R: { client: (id) => `clients/${id}` } },
  setInterval: () => 1,
  clearInterval: () => {},
  addEventListener() {},
  removeEventListener() {},
};
// The end is confirmed through the shared Confirm (data-bits.jsx), drawn for real.
globalThis.document ??= {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.ReactDOM ??= { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.Confirm = globalThis.window.Confirm;
// data-bits also publishes the shell's toast hook; this harness keeps its own flash.
globalThis.window.usePPToast = () => [null, (m) => calls.flash.push(m)];
await import("../../../apps/dashboard/src/legacy/pages/live-monitor.jsx");
const Page = globalThis.window.LiveMonitorPage;

function mount() {
  frames.begin();
  return Page();
}
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};
const byTestId = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.["data-testid"] === id) hit = n;
  });
  return hit;
};
const allByTestId = (tree, id) => {
  const hits = [];
  walk(tree, (n) => {
    if (n.props?.["data-testid"] === id) hits.push(n);
  });
  return hits;
};
/** The text under a node, as a reader sees it. */
const textOf = (n) => {
  const out = [];
  walk(n, (x) => {
    for (const k of x.props?.children ?? []) if (typeof k === "string" || typeof k === "number") out.push(String(k));
  });
  return out.join("");
};
/** The toast's words: the flash carries a React element, so its strings are gathered the same way. */
const said = (m) => textOf(m.msg);

test("with a call on the line the page offers the two controls, and the hand-over names the line it rings", () => {
  fresh();
  const tree = mount();
  assert.ok(byTestId(tree, "live-controls"), "REGRESSION: the controls are on the panel for a live call");
  const hand = byTestId(tree, "live-hand-over");
  assert.ok(hand && !hand.props.disabled, "a workspace with a line can pass the call");
  assert.ok(hand.props.title.includes(LINE), "the button says what it rings");
  assert.ok(byTestId(tree, "live-end"), "and the end is offered, unarmed");
  assert.equal(byTestId(tree, "live-end-yes"), null, "nothing ends on one click");
  assert.ok(byTestId(tree, "live-whisper"), "the whisper is still there beside them");
});

test("the transcript says who spoke: the owner's whisper as the owner's, the platform's hand-over as the platform's, and never a frame", () => {
  fresh();
  const tree = mount();
  const whisper = allByTestId(tree, "live-whisper-line");
  const platform = allByTestId(tree, "live-platform-line");
  assert.equal(whisper.length, 1);
  assert.equal(platform.length, 1);
  assert.ok(textOf(whisper[0]).includes("offer the 3pm slot"));
  assert.ok(textOf(platform[0]).includes("Chanlytics told the receptionist"));
  assert.ok(textOf(platform[0]).includes("The business owner is picking up this call themselves."));
  assert.ok(
    !textOf(platform[0]).includes("transfer_to_staff"),
    "the instruction stays between the platform and the agent",
  );
});

test("ending is armed first, and the second click reaches the bridge with the call and tells the owner once", async () => {
  fresh();
  let tree = mount();
  byTestId(tree, "live-end").props.onClick();
  tree = mount();
  const yes = byTestId(tree, "live-end-yes");
  assert.ok(yes, "armed: the question with its Yes");
  await yes.props.onClick();
  assert.deepEqual(
    calls.end,
    ["c-live"],
    "the row's id, as the route takes it; the provider's call id is the route's to look up",
  );
  assert.ok(
    calls.flash.some((m) => said(m).includes("Call ended")),
    "the owner is told",
  );
  tree = mount();
  assert.equal(byTestId(tree, "live-end-yes"), null, "disarmed after the act");
});

test("the hand-over reaches the bridge with the call, and the owner is told which line will ring", async () => {
  fresh();
  const before = calls.flash.length;
  const tree = mount();
  await byTestId(tree, "live-hand-over").props.onClick();
  assert.deepEqual(calls.hand, ["c-live"], "the row's id, as the route takes it");
  const told = calls.flash.slice(before).map(said);
  assert.equal(told.length, 1);
  assert.ok(told[0].includes("pass the call to") && told[0].includes(LINE), told[0]);
});

test("a workspace with no line is told the fix on the button itself, and the button does nothing", async () => {
  fresh();
  const facts = globalThis.window.__FACTS;
  globalThis.window.__FACTS = { facts: {} };
  try {
    const tree = mount();
    const hand = byTestId(tree, "live-hand-over");
    assert.equal(hand.props.disabled, true);
    assert.ok(hand.props.title.includes("Settings"), hand.props.title);
  } finally {
    globalThis.window.__FACTS = facts;
  }
});

test("a call that has ended offers no control, only its summary and the way to the transcript", () => {
  fresh();
  const was = globalThis.window.__LIVE;
  globalThis.window.__LIVE = toLiveVM(
    [
      call({
        status: "ended",
        ended_at: iso(1_000),
        duration_ms: 89_000,
        disconnection_reason: "manual_stopped",
        summary: "Asked for a person.",
      }),
    ],
    channels,
    ZONE,
    new Date(NOW),
  );
  try {
    const tree = mount();
    assert.equal(byTestId(tree, "live-controls"), null, "nothing to end or pass");
    assert.equal(byTestId(tree, "live-whisper"), null, "nobody to whisper to");
    const summary = byTestId(tree, "live-summary");
    assert.ok(summary, "the ended call's card");
    assert.ok(textOf(summary).includes("Ended from the dashboard"), "the provider's stop, in the owner's words");
  } finally {
    globalThis.window.__LIVE = was;
  }
});
