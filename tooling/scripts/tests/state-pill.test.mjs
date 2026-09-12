/**
 * One pill, one map.
 *
 * Ten components drew a state pill, each with its own colours, and the Inbox
 * kept two private ones besides; "Needs you" was the accent on one page,
 * amber on another. The tone is decided in contracts now (tone.ts) and the
 * one StatePill draws it. Run here: the map's rules, the pill mounted over a
 * fake React, and the Inbox list drawn with a real thread -- which also pins
 * the regression where no real thread ever showed its wait, because the
 * list looked for a state ("needs") the view model never produces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateTone, stateLabel, stateOf, TONES, PERSON_STATE_LABELS, BROADCAST_STATE_LABELS, ROLE_WORDS, toInboxThreadVM, PLATFORM_VERDICTS } from "@chanlytics/contracts";

/* ------------------------------ the map -------------------------------- */

test("one name, one tone: a person is needed is amber wherever it is said, and the accent means right now and nothing else", () => {
  for (const [kind, value] of [["thread", "escalated"], ["thread", "needs_you"], ["person", "needs_you"], ["broadcast", "pending_approval"], ["playbook", "approval"], ["escalation", "open"], ["setup", "waiting_you"]]) {
    assert.equal(stateTone(kind, value), "warn", `${kind}/${value}`);
  }
  for (const [kind, value] of [["call", "live"], ["broadcast", "sending"], ["playbook", "running"]]) {
    assert.equal(stateTone(kind, value), "accent", `${kind}/${value} is happening right now`);
  }
  assert.equal(stateTone("role", "owner"), "info", "an owner's badge is distinguished, not live");
  assert.equal(stateTone("tone", "accent"), "accent", "a tone a caller already holds is said as itself");
  assert.equal(stateTone("tone", "escalated"), "plain", "a standing name is not a tone");
  for (const [kind, value] of [["thread", "done"], ["call", "ended"], ["person", "quiet"], ["consent", "unknown"], ["broadcast", "canceled"], ["setup", "not_started"]]) {
    assert.equal(stateTone(kind, value), "plain", `${kind}/${value} is neutral`);
  }
  for (const [kind, value] of [["broadcast", "failed"], ["template", "rejected"]]) {
    assert.equal(stateTone(kind, value), "danger", `${kind}/${value} failed`);
  }
  assert.equal(stateTone("thread", "purple"), "plain", "a state the map has never heard of is neutral, not a crash");
  assert.equal(stateTone("thread", null), "plain");
});

test("the words are the label maps contracts already keeps, and a value nobody wrote words for reads as itself", () => {
  assert.equal(stateLabel("person", "waiting_on_you"), PERSON_STATE_LABELS.waiting_on_you);
  assert.equal(stateLabel("broadcast", "pending_approval"), BROADCAST_STATE_LABELS.pending_approval);
  assert.equal(stateLabel("role", "operator"), ROLE_WORDS.operator);
  assert.equal(stateLabel("thread", "escalated"), "Needs you", "the Inbox's state, in the one name");
  assert.equal(stateLabel("thread", "open"), "Customer wrote last");
  assert.equal(stateLabel("call", "abandoned"), "Hung up early");
  assert.equal(stateLabel("call", "stale"), "No word from the provider", "a phantom is not labelled Ended");
  assert.equal(stateLabel("consent", "opted_out"), "Opted out");
  assert.equal(stateLabel("template", "pending"), "In review");
  assert.equal(stateLabel("thread", "zzz"), "zzz");
  assert.deepEqual(stateOf("setup", "ready"), { tone: "ok", label: "Ready" });
  for (const t of TONES) assert.ok(["accent", "warn", "info", "ok", "danger", "plain"].includes(t));
});

test("the back office's verdicts speak the same six tones: waiting on an owner is in progress, not live", () => {
  assert.equal(PLATFORM_VERDICTS.waiting_owner.tone, "info");
  assert.equal(PLATFORM_VERDICTS.broken.tone, "danger");
  assert.equal(PLATFORM_VERDICTS.live.tone, "ok");
  assert.equal(PLATFORM_VERDICTS.paused.tone, "plain");
  for (const v of Object.values(PLATFORM_VERDICTS)) assert.ok(TONES.includes(v.tone), v.label);
});

/* ------------------------- the pill, mounted --------------------------- */

let cells = [];
let seq = 0;
const fresh = () => { cells = []; };
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useReducer: (red, init) => { const k = seq++; if (!(k in cells)) cells[k] = init; return [cells[k], (a) => { cells[k] = red(cells[k], a); }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => { const k = seq++; if (!(k in cells)) cells[k] = fn(); return cells[k]; },
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = { body: {}, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }) };
globalThis.window = {
  __chrome: { state: stateOf },
  CHANLY: { nav() {}, R: {} },
  gate: () => ({}),
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  setTimeout: () => 1,
  clearTimeout() {},
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { StatePill } = globalThis.window;

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const textOf = (n) => { const out = []; walk(n, (x) => { for (const k of x.props?.children ?? []) if (typeof k === "string" || typeof k === "number") out.push(String(k)); }); return out.join(""); };
const byTestId = (tree, id) => { let hit = null; walk(tree, (n) => { if (!hit && n.props?.["data-testid"] === id) hit = n; }); return hit; };
const byClass = (tree, cls) => { let hit = null; walk(tree, (n) => { if (!hit && typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls)) hit = n; }); return hit; };

test("the pill: the tone's class and the map's words; the accent carries the live dot; plain carries no tone class at all", () => {
  const warn = StatePill({ kind: "thread", value: "escalated" });
  assert.equal(warn.props.className, "pill pill-warn");
  assert.equal(textOf(warn), "Needs you");
  assert.equal(warn.props["data-tone"], "warn");
  const live = StatePill({ kind: "call", value: "live" });
  assert.equal(live.props.className, "pill pill-accent");
  assert.ok(byClass(live, "live-dot"), "right now has a pulse");
  const ended = StatePill({ kind: "call", value: "ended" });
  assert.equal(ended.props.className, "pill", "neutral is the base pill");
  assert.equal(textOf(ended), "Ended");
  const worded = StatePill({ kind: "person", value: "active", label: "Regular" });
  assert.equal(worded.props.className, "pill pill-ok");
  assert.equal(textOf(worded), "Regular", "a page's better words win");
});

/* --------------------- the Inbox list, with a real thread --------------- */

/* The page reads the pill as a bare global, as a browser would through window. */
globalThis.StatePill = StatePill;
await import("../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
const InboxList = globalThis.window.InboxList;

test("REGRESSION: a real thread that needs a person shows the one pill and how long it has waited -- the list used to look for a state no real thread has", () => {
  const NOW = new Date("2026-09-14T14:00:00Z");
  const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
  const dto = {
    id: "c1", state: "needs_human", paused_until: null, snooze_until: null, assignee_user_id: null, assignee_is_me: false,
    last_wa_inbound_at: ago(40), last_message_at: ago(40),
    contact: { id: "p1", display_name: "Rosa", wa_profile_name: null, phone_e164: "+16465550123", consent: "opted_in", dnc: false },
    messages: [{ id: "m1", direction: "inbound", sender: "customer", type: "text", body: "Can I speak to someone?", media: null, meta: null, status: "received", created_at: ago(40), channel_ts: ago(40) }],
  };
  const vm = toInboxThreadVM(dto, { id: "e1", reason: "human_token", details: "asked for a person", state: "open", created_at: ago(40) }, NOW);
  assert.equal(vm.state, "escalated", "the state a real thread has");
  assert.ok(vm.waitingMin >= 39, `waited ${vm.waitingMin} minutes`);
  fresh(); seq = 0;
  const tree = InboxList({
    threads: [vm], allThreads: [vm],
    buckets: [{ id: "all", label: "All", count: 1 }], views: [],
    activeBucket: "all", onBucketChange() {},
    activeThreadId: null, onSelectThread() {},
    selected: [], onToggleSelect() {}, onClearSelection() {},
  });
  const pill = byTestId(tree, "thread-state");
  assert.ok(pill, "REGRESSION: the pill was gated on state === \"needs\"");
  assert.equal(pill.props.className, "pill pill-warn ix-state-pill");
  assert.equal(textOf(pill), "Needs you", "one name for the state, not \"Escalated\" here and \"Needs you\" there");
  const wait = byClass(tree, "ix-wait");
  assert.ok(wait, "REGRESSION: the wait chip was gated the same way");
  assert.match(textOf(wait), /waiting \d+m/);
  assert.ok(wait.props.className.includes("warn"), "past thirty minutes the wait is amber");
});

/* ------------------ the attention row, the same six -------------------- */

await import("../../../apps/dashboard/src/legacy/pages/attention-bits.jsx");
const AttnRow = globalThis.window.AttnRow;

test("the attention row's lead speaks the same six tones, and the receptionist's standing is said in them", () => {
  const cls = (tone) => AttnRow({ initials: "RM", name: "Rosa", status: ["Receptionist", "answering"], tone }).props.className;
  assert.equal(cls("escalated"), "cl-attn-row tone-warn", "People's strip: a person is needed");
  assert.equal(cls("queued"), "cl-attn-row tone-info", "a queued reply is in progress");
  assert.equal(cls("answering"), "cl-attn-row tone-ok");
  assert.equal(cls("paused"), "cl-attn-row tone-plain");
  assert.equal(cls("danger"), "cl-attn-row tone-danger", "the back office's own tone passes through");
  assert.equal(cls(""), "cl-attn-row tone-plain", "no tone is neutral, not a class of nothing");
});
