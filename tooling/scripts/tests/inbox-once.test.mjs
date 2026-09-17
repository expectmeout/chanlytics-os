/**
 * The Inbox says each thing once.
 *
 * Measured 15 Sep 2026 in the harness (the real page code and CSS, threads built by toInboxThreadVM) at 1280x800:
 * - Rosa's header said "WhatsApp · +1 (646) 555-0123" beside a WhatsApp chip, and Snooze and Open profile were buttons
 *   beside the menu that held them both;
 * - a strip under it, 108px, said the reason, the wait, the receptionist and the reply window again, and "Paused — you
 *   have it" over a thread nobody had taken;
 * - the list's head said "3 need you · 1 being answered" under a Needs you chip of 3, on a 38px line of its own;
 * - her row said "waiting 12m" beside "5:51 PM", and the receptionist's holding reply where her own words belong.
 * Here, on a stub React: what the header, the list and each row say. How it looks is measured in the harness and by
 * the nightly (thread.spec.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-15T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const later = new Date(NOW.getTime() + 3 * 3_600_000).toISOString();
const person = (id, name, over = {}) => ({ id, display_name: name, wa_profile_name: null, phone_e164: "+16465550123", consent: "opted_in", dnc: false, ...over });
const rosa = person("p1", "Rosa Díaz");
const wrote = (id, body, min) => ({ id, direction: "inbound", sender: "customer", channel: "whatsapp", type: "text", body, media: null, meta: null, status: "received", created_at: ago(min), channel_ts: ago(min) });
const ours = (id, body, min, status = "read") => ({ id, direction: "outbound", sender: "ai", channel: "whatsapp", type: "text", body, media: null, meta: null, status, created_at: ago(min), channel_ts: ago(min) });
const call = (id, min) => ({ id, direction: "inbound", sender: "system", channel: "voice", type: "call_summary", body: "Inbound call · 3 min — asked about a bridal trial", media: null, meta: {}, status: "received", created_at: ago(min), channel_ts: ago(min) });
const chat = (over = {}) => ({
  id: "c1", state: "needs_human", paused_until: null, snooze_until: null, assignee_user_id: null, assignee_is_me: false,
  last_wa_inbound_at: ago(40), last_message_at: ago(39), contact: rosa,
  messages: [wrote("m1", "Can I move my appointment to Friday?", 40), ours("m2", "Let me check with the team.", 39)], ...over,
});
const asked = (id = "e1", min = 40) => ({ id, reason: "human_token", details: null, state: "open", created_at: ago(min) });
const vmOf = (dto, esc = null) => toInboxThreadVM(dto, esc, ZONE, NOW);

/* -------------------------------- a browser -------------------------------- */

globalThis.window = {
  location: { pathname: "/w/melanys", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  __TEAM: null,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
globalThis.document = { body: { appendChild() {} }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }) };

let cells = [];
let seq = 0;
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
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatePill", "MoreMenu", "EmptyState", "PolicyChip", "TlMedia", "FailedRead", "Confirm", "usePPToast", "useHotkey"]) globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
await import("../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
const { InboxThread, InboxList, MoreMenu } = globalThis.window;

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => { let hit; walk(tree, (n) => { if (hit === undefined && pred(n)) hit = n; }); return hit; };
const findAll = (tree, pred) => { const out = new Set(); walk(tree, (n) => { if (pred(n)) out.add(n); }); return [...out]; };
const hasClass = (cls) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls);
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const paneOf = (thread, over = {}) => { cells = []; seq = 0; return InboxThread({ thread, channelLabels: { whatsapp: "WhatsApp", phone: "Phone", sms: "Text" }, ...over }); };
const headOf = (pane) => find(pane, (n) => n.type === "header" && hasClass("ix-th-head")(n));
const menuOf = (head) => find(head, (n) => n.type === MoreMenu);
const listOf = (threads, over = {}) => {
  seq = 0;
  return InboxList({
    threads, allThreads: threads, buckets: [{ id: "escalated", label: "Needs you", icon: "flag", count: 1 }], views: [],
    activeBucket: "escalated", onBucketChange() {}, activeThreadId: null, onSelectThread() {},
    selected: [], onToggleSelect() {}, onClearSelection() {}, ...over,
  });
};
const rowOf = (tree, who) => find(tree, (n) => n.props?.role === "option" && textOf(n).includes(who));
const dials = (tree) => findAll(tree, (n) => n.type === "a" && String(n.props?.href || "").startsWith("tel:"));

/* -------------------------------- the header -------------------------------- */

test("REGRESSION: a real thread's header names its channel once and keeps Snooze and the profile in its menu -- 'WhatsApp · +1 (646) 555-0123' sat beside a WhatsApp chip, and both were buttons beside the menu that held them", () => {
  const vm = vmOf(chat(), asked());
  assert.equal("contextStrip" in vm, false, "REGRESSION: a strip of facts said again what the status line and the reply box say");
  const pane = paneOf(vm);
  assert.equal(find(pane, hasClass("ix-context-strip")), undefined);
  const head = headOf(pane);
  assert.equal(textOf(find(head, hasClass("ix-th-meta"))), "WhatsApp · +1 (646) 555-0123");
  assert.equal(find(head, hasClass("ix-channel-chip")), undefined, "REGRESSION: a chip said WhatsApp again");
  assert.equal(textOf(head).split("WhatsApp").length - 1, 1, `the channel once: ${textOf(head)}`);
  assert.equal(find(head, (n) => (n.type === "button" || n.type === "a") && /Snooze|Open profile|Call back/.test(textOf(n))), undefined, "REGRESSION: Snooze and Open profile beside the menu");
  const items = menuOf(head).props.items.map((it) => it.label).filter(Boolean);
  for (const label of ["Open profile", "Snooze"]) assert.ok(items.includes(label), `${label} is in the menu: ${items.join(", ")}`);

  // Snoozed, it wakes from its status line: no Snooze in the menu, and no "Wakes …" button in the header.
  const asleep = headOf(paneOf(vmOf(chat({ state: "snoozed", snooze_until: later, paused_until: later }))));
  assert.ok(!menuOf(asleep).props.items.some((it) => it.label === "Snooze"));
  assert.ok(!textOf(asleep).includes("Wakes"));
});

test("a caller with no WhatsApp thread has one Call back: on the line that needs you it dials and claims the thread, and otherwise the reply box carries it -- it was in two places at once, saying two different things", () => {
  const caller = (contact = rosa, over = {}) => chat({ last_wa_inbound_at: null, last_message_at: ago(30), contact, messages: [call("k1", 30)], ...over });
  const callback = { id: "e2", reason: "callback", details: "Call Rosa back about the bridal trial", state: "open", created_at: ago(29) };
  const vm = vmOf(caller(), callback);
  assert.deepEqual([vm.primaryChannel, vm.hasChat, vm.optedOut], ["phone", false, false]);

  const needsYou = paneOf(vm);
  assert.equal(dials(needsYou).length, 1, "REGRESSION: one by the decision and one in the reply box");
  const dialer = find(find(needsYou, byTestId("ix-th-status")), byTestId("ix-call-back"));
  assert.ok(dialer && String(dialer.props.href).startsWith("tel:"), "the line's own primary action dials");
  assert.equal(find(find(needsYou, hasClass("ix-composer")), byTestId("ix-call-back")), undefined, "and the reply box does not say it again");

  // Nobody is waiting on you: the line above has no call, so the reply box keeps it.
  const quiet = paneOf(vmOf(caller(rosa, { state: "open" })));
  assert.equal(dials(quiet).length, 1);
  assert.ok(find(find(quiet, hasClass("ix-composer")), byTestId("ix-call-back")), "in the reply box");

  // Opted out: their reply box offers nothing to send, so the header carries the call.
  const out = paneOf(vmOf(caller(person("p1", "Rosa Díaz", { consent: "opted_out" }), { state: "open" })));
  assert.equal(dials(out).length, 1, "an opted-out caller can still be called back");
  assert.ok(find(headOf(out), byTestId("ix-call-back")), "from the header");
});

test("on a phone, Back is the arrow alone: the top bar says Inbox over it, and '← Inbox' said it again", () => {
  const back = find(paneOf(vmOf(chat(), asked()), { onBack() {} }), byTestId("ix-back"));
  assert.deepEqual([textOf(back).trim(), back.props["aria-label"]], ["←", "Back to the list"]);
});

/* --------------------------------- the list --------------------------------- */

test("REGRESSION: the list has no head line until a search or a pick -- it said '3 need you · 1 being answered' under a Needs you chip of 3 -- and the select-all box leads the search row", () => {
  const threads = [
    vmOf(chat(), asked()),
    vmOf(chat({ id: "c2", contact: person("p2", "Nina Park"), paused_until: later, assignee_user_id: "u-me", assignee_is_me: true }), asked("e2")),
  ];
  cells = [];
  let tree = listOf(threads);
  assert.equal(find(tree, hasClass("ix-list-head")), undefined, "REGRESSION: a head saying the chip's number again");
  const box = find(find(tree, hasClass("ix-search-row")), (n) => n.type === "input" && n.props?.type === "checkbox");
  assert.equal(box.props["aria-label"], "Select all 2 conversations");

  // A search says what it found, by the words the rows show: what they asked, not only the last message.
  find(tree, (n) => n.type === "input" && n.props?.className === "ix-search-input").props.onChange({ target: { value: "friday" } });
  tree = listOf(threads);
  assert.equal(textOf(find(tree, hasClass("ix-list-count"))).trim(), "2 matches");

  cells = [];
  tree = listOf(threads, { selected: [threads[0].id] });
  assert.equal(textOf(find(find(tree, hasClass("ix-list-head")), hasClass("ix-bulk-count"))), "1 selected", "a pick says what is picked, with what can be done to it");
});

test("REGRESSION: a row says each thing once -- why a person is needed, what they asked, and one time -- where it said 'waiting 12m' beside '5:51 PM', and the receptionist's holding reply in place of the customer's words", () => {
  const open = vmOf(chat(), asked());
  const mine = vmOf(chat({ id: "c2", contact: person("p2", "Nina Park"), paused_until: later, assignee_user_id: "u-me", assignee_is_me: true }));
  const theirs = vmOf(chat({ id: "c3", contact: person("p3", "Ada Lovelace"), paused_until: later, assignee_user_id: "u-ana", assignee_is_me: false }), asked("e3"));
  const quiet = vmOf(chat({ id: "c4", state: "open", contact: person("p4", "Dana Kim"), messages: [wrote("m1", "Open Sunday?", 30), ours("m2", "Closed Sundays.", 29)] }));
  const asleep = vmOf(chat({ id: "c5", state: "snoozed", snooze_until: later, paused_until: later, contact: person("p5", "Sam Ortiz") }));
  cells = [];
  const tree = listOf([open, mine, theirs, quiet, asleep]);
  const said = (who) => {
    const row = rowOf(tree, who);
    const one = (cls) => { const n = find(row, hasClass(cls)); return n ? textOf(n).trim() : null; };
    return { subject: one("ix-thread-subject"), words: one("ix-thread-preview"), wait: one("ix-wait"), time: one("ix-thread-time") !== null, foot: one("ix-thread-foot") !== null, text: textOf(row) };
  };

  const rosaRow = said("Rosa Díaz");
  assert.deepEqual(
    [rosaRow.subject, rosaRow.words, rosaRow.wait, rosaRow.time, rosaRow.foot],
    ["Customer asked for a person", "Can I move my appointment to Friday?", "waiting 40m", false, false],
    "REGRESSION: the receptionist's 'Let me check with the team.' in place of her words, and a clock time beside the wait",
  );
  const ninaRow = said("Nina Park");
  assert.equal(ninaRow.subject, null, "a thread you have that nobody flagged has no reason line");
  assert.ok(ninaRow.text.includes("You have it") && !ninaRow.text.includes("answering this one"), `REGRESSION: "You're answering this one" under "You have it": ${ninaRow.text}`);
  const adaRow = said("Ada Lovelace");
  assert.equal(adaRow.subject, "Customer asked for a person", "a teammate's row keeps the reason");
  assert.ok(adaRow.text.includes("A teammate has it") && !adaRow.text.includes("is answering this"), `REGRESSION: "A teammate is answering this" under the pill that says so: ${adaRow.text}`);
  const danaRow = said("Dana Kim");
  assert.deepEqual([danaRow.subject, danaRow.words, danaRow.time], [null, "Closed Sundays.", true], "a quiet thread's row is the last thing that happened, and when");
  const samRow = said("Sam Ortiz");
  assert.ok(samRow.wait && !samRow.time, "a snoozed row says when it wakes, and not also when it last moved");
});

test("an email in the thread is drawn as one: the envelope, the word Email, its subject above its words; a WhatsApp bubble beside it has no subject line", () => {
  const ana = person("p9", null, { phone_e164: null, email: "ana@example.com" });
  const emailed = { ...wrote("m9", "Can you do Saturday at 9?", 20), channel: "email", meta: { email: { subject: "Quote for Saturday" } } };
  const vm = vmOf(chat({ contact: ana, last_wa_inbound_at: ago(60), messages: [wrote("m8", "hello", 60), emailed] }), { id: "e9", reason: "email_review", details: "An email arrived.", state: "open", created_at: ago(20) });
  const pane = InboxThread({ thread: vm, channelLabels: { whatsapp: "WhatsApp", phone: "Phone", sms: "Text", email: "Email" } });
  const bubbles = findAll(pane, hasClass("tl-msg"));
  assert.equal(bubbles.length, 2);
  const [chatBubble, emailBubble] = bubbles;
  assert.equal(textOf(find(emailBubble, byTestId("tl-msg-subject"))), "Quote for Saturday");
  assert.equal(find(chatBubble, byTestId("tl-msg-subject")), undefined, "a subject is an email's");
  assert.ok(find(emailBubble, (n) => n.type === "Icon" && n.props?.name === "mail"), "an envelope, not a chat bubble");
  assert.match(textOf(find(emailBubble, hasClass("tl-msg-meta"))), /Email/);
  const order = [];
  walk(emailBubble, (n) => { if (byTestId("tl-msg-subject")(n)) order.push("subject"); if (hasClass("tl-msg-body")(n)) order.push("body"); });
  assert.deepEqual(order, ["subject", "body"], "what it is about, then what it says");
  assert.equal(find(emailBubble, byTestId("tl-msg-left-out")), undefined, "an email that was kept whole says nothing about it");
  // An email's files are not kept: the bubble says which, or "see attached" reads as the whole of it.
  const attached = { ...wrote("m10", "The floor plan is attached.", 10), channel: "email", meta: { email: { subject: "Floor plan", attachments: [{ filename: "floorplan.pdf", contentType: "application/pdf", size: 120000 }], more_attachments: 0, truncated: false } } };
  const withFile = InboxThread({ thread: vmOf(chat({ contact: ana, last_wa_inbound_at: null, messages: [attached] })), channelLabels: { email: "Email" } });
  assert.equal(textOf(find(withFile, byTestId("tl-msg-left-out"))).trim(), "1 attachment was not kept: floorplan.pdf.");
  // They wrote last by email, so that is where a reply goes, and the reply box says so: no window, no templates.
  const box = find(pane, (n) => n.type === "textarea" && hasClass("ix-composer-text")(n));
  assert.equal(box?.props.placeholder, `Email to ${vm.who}…`, "REGRESSION guard: every wire that was not a text was named WhatsApp");
  assert.equal(find(pane, (n) => /24-hour WhatsApp window/.test(textOf(n)) && hasClass("ix-composer-banner")(n)), undefined);
});
