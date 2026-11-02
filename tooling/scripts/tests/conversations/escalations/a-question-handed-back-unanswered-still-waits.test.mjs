/**
 * A question held for a person and handed back with nothing sent still waits on a person, and the Inbox says so.
 *
 * Seen on the salon's workspace, 16 Oct 2026, look-only: Daniela Reyes asked on 20 Sep whether balayage could be $150.
 * The receptionist held it (prices are the owner's), the hold was handed back the next day, and nobody answered. The
 * receptionist never comes back to a message it held, so the thread read Handled, "Answered by the receptionist", for 26
 * days. Run here: the read carries the newest closed hold of a thread whose customer wrote last (contracts LastHoldDto),
 * the view model names such a thread Unanswered (unansweredOf), its dock offers the two ways to settle it besides the
 * reply box, and a hand back that would leave their message with no answer asks first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { memberWords, stateOf, theyWroteLast, toInboxThreadVM } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { all, again, find, fresh, installLegacyReact, textOf } from "../../_legacy-react.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const ZONE = "America/New_York";
const NOW = new Date("2026-10-16T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const DAY = 24 * 60;

const daniela = {
  id: "p1",
  display_name: "Daniela Reyes",
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
const ours = (id, sender, body, min, status = "delivered") => ({
  id,
  direction: "outbound",
  sender,
  type: "text",
  body,
  media: null,
  meta: null,
  status,
  created_at: ago(min),
  channel_ts: ago(min),
});
const callNote = (id, min) => ({
  ...wrote(id, "Inbound call · 2 min — asked about parking", min),
  sender: "system",
  type: "call_summary",
  meta: {},
});
// Her thread: a price, a question about it, and the hold that opened on it and was handed back a day later.
const asked = [
  wrote("m1", "Hi! How much for balayage?", 27 * DAY),
  ours("m2", "ai", "It runs $180–$240.", 27 * DAY - 1),
  wrote("m3", "I booked for Saturday but can you do it for $150?", 26 * DAY),
];
const hold = (over = {}) => ({
  reason: "human_token",
  details: "Asked for $150. You quote $180–$240.",
  created_at: ago(26 * DAY - 1),
  resolved_at: ago(25 * DAY),
  ...over,
});
const conv = (messages, over = {}) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(26 * DAY),
  last_message_at: ago(26 * DAY),
  contact: daniela,
  messages,
  ...over,
});
const vmOf = (dto, esc = null) => toInboxThreadVM(dto, esc, ZONE, NOW);

/* ------------------------------- the view model ------------------------------- */

test("they wrote last when their words are the last exchanged: a call, a held draft and words of ours that never left are not an answer", () => {
  assert.equal(theyWroteLast(asked), true);
  assert.equal(
    theyWroteLast([...asked, ours("m4", "human", "We can do $160.", 10)]),
    false,
    "an answer that reached her",
  );
  assert.equal(
    theyWroteLast([...asked, ours("m4", "ai", "We can do $160.", 10, "failed")]),
    true,
    "one that never left",
  );
  assert.equal(theyWroteLast([...asked, callNote("m4", 10)]), true, "a call's note is not words to her");
  assert.equal(theyWroteLast([]), false, "nobody wrote");
});

test("a thread whose question was held and handed back with nothing sent is Unanswered, amber, with what the hold noted and how long she has waited", () => {
  const vm = vmOf(conv(asked, { last_hold: hold() }));
  assert.equal(vm.state, "done", "it reads as handled, which is the trap");
  assert.deepEqual(vm.lastWord, {
    text: "They wrote last, and nobody has answered them.",
    tone: "warn",
    short: "Unanswered",
  });
  assert.deepEqual(
    { ...vm.unanswered, sinceMs: undefined },
    { line: "Asked for $150.", closed: "Closed Sep 21 without a reply", waited: "26d", sinceMs: undefined },
    "REGRESSION: 'Answered by the receptionist' over a price question nobody answered, 26 days on",
  );
  assert.equal(vm.unanswered.sinceMs, Date.parse(asked[2].created_at), "her wait runs from her question");

  // What the hold noted is said in a line: its first sentence, cut at a word; none noted, the plain fact.
  const long =
    "She wants to know whether the balayage can come down to one hundred and fifty dollars, as her friend's did.";
  const cut = vmOf(conv(asked, { last_hold: hold({ details: `${long} And more.`, resolved_at: null }) })).unanswered;
  assert.ok(cut.line.endsWith("…") && cut.line.length <= 101, `one line: ${cut.line}`);
  assert.ok(long.startsWith(cut.line.slice(0, -1).trimEnd()), "cut after a whole word");
  assert.equal(cut.closed, "Closed without a reply", "a hold closed before its time was kept says no date");
  assert.equal(
    vmOf(conv(asked, { last_hold: hold({ details: "  " }) })).unanswered.line,
    "They're waiting on an answer.",
  );
});

test("only the hold on her last words makes a thread Unanswered: not after an answer, not a hold older than what she wrote since, not archived, and not one that still needs you", () => {
  const answered = vmOf(conv([...asked, ours("m4", "human", "We can do $160.", 10)], { last_hold: hold() }));
  assert.equal(answered.unanswered, null, "an answer reached her");
  assert.notEqual(answered.lastWord?.short, "Unanswered");
  const wroteSince = vmOf(conv([...asked, wrote("m4", "Hello?", 60)], { last_hold: hold() }));
  assert.equal(wroteSince.unanswered, null, "she wrote again after that hold: the receptionist has her newest words");
  const archived = vmOf(conv(asked, { state: "archived", last_hold: hold() }));
  assert.deepEqual([archived.unanswered, archived.lastWord], [null, null], "closed by a person");
  const held = vmOf(conv(asked, { state: "needs_human", last_hold: hold() }), {
    id: "e2",
    reason: "human_token",
    details: null,
    state: "open",
    created_at: ago(30),
  });
  assert.equal(held.unanswered, null, "a hold still open is Needs you's to say");
  assert.equal(vmOf(conv(asked)).unanswered, null, "no hold read, nothing claimed");
});

/* ------------------------------------ the read ------------------------------------ */

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const kernel = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { conversations } = await import(at("apps/dashboard/src/server/readers/conversations.ts"));

const convo = (id, contactId) => ({
  id,
  tenant_id: T,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: ago(26 * DAY),
  last_message_at: ago(26 * DAY),
  contact_id: contactId,
  contacts: { ...daniela, id: contactId, email: null, marketing_consent: null, proposal_url: null },
});
const row = (m, conversationId) => ({
  ...m,
  id: `${conversationId}-${m.id}`,
  conversation_id: conversationId,
  tenant_id: T,
  error: null,
  channel: "whatsapp",
});
const escalation = (id, conversationId, over = {}) => ({
  id,
  tenant_id: T,
  conversation_id: conversationId,
  reason: "human_token",
  details: null,
  state: "resolved",
  created_at: ago(26 * DAY - 1),
  resolved_at: ago(25 * DAY),
  ...over,
});

test("the Inbox's read carries the newest closed hold of each thread whose customer wrote last, in one read beside the messages", async () => {
  const tables = {
    conversations: [convo("c1", "k1"), convo("c2", "k2"), convo("c3", "k3")],
    messages: [
      ...asked.map((m) => row(m, "c1")),
      ...[...asked, ours("m4", "human", "We can do $160.", 10)].map((m) => row(m, "c2")),
      ...asked.map((m) => row(m, "c3")),
    ],
    escalations: [
      escalation("e1", "c1", {
        details: "Asked about a trial.",
        created_at: ago(27 * DAY),
        resolved_at: ago(27 * DAY - 5),
      }),
      escalation("e2", "c1", { details: "Asked for $150. You quote $180–$240." }),
      escalation("e3", "c1", { state: "open", created_at: ago(5), resolved_at: null }),
      escalation("e4", "c2", { details: "Asked for $150." }),
    ],
  };
  const supabase = fakeDb(tables);
  const ctx = { supabase, userId: "u1", email: "owner@example.com", params: {} };
  const read = await kernel.load(kernel.readerContext(ctx, { tenantId: T, role: "viewer" }), conversations, {
    ids: null,
  });
  const byId = new Map(read.data.conversations.map((c) => [c.id, c]));
  assert.deepEqual(
    byId.get("c1").last_hold,
    {
      reason: "human_token",
      details: "Asked for $150. You quote $180–$240.",
      created_at: ago(26 * DAY - 1),
      resolved_at: ago(25 * DAY),
    },
    "the newest hold that closed, never the one still open",
  );
  assert.equal(byId.get("c2").last_hold, undefined, "an answer reached them: a closed hold says nothing of who waits");
  assert.equal(byId.get("c3").last_hold, undefined, "no hold, nothing carried");
  assert.equal(
    supabase.seen.filter((q) => q.table === "escalations" && q.op === "select").length,
    1,
    "one read for the threads of the answer",
  );
  assert.equal(
    vmOf(byId.get("c1")).lastWord.short,
    "Unanswered",
    "and the Inbox names the thread from what the read carried",
  );

  // No threads, no read.
  const none = fakeDb({ conversations: [], messages: [], escalations: [] });
  await kernel.load(kernel.readerContext({ ...ctx, supabase: none }, { tenantId: T, role: "viewer" }), conversations, {
    ids: null,
  });
  assert.equal(none.seen.filter((q) => q.table === "escalations").length, 0);
});

/* ------------------------------------ the pane ------------------------------------ */

installLegacyReact({
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
(await import("../../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
const { InboxThread } = await import("../../../../../apps/dashboard/src/surfaces/inbox/thread/thread.tsx");

const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const hasClass = (cls) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls);
const button = (tree, pred) => find(tree, (n) => n.type === "button" && pred(n));
const labels = { whatsapp: "WhatsApp", phone: "Phone" };

test("the pane: Unanswered in the bar with her wait, and a dock with what the hold noted, Call and No reply needed, which archives after asking", () => {
  const thread = vmOf(conv(asked, { last_hold: hold() }));
  const archived = [];
  const draw = () => InboxThread({ thread, channelLabels: labels, onArchive: (id) => archived.push(id) });
  fresh();
  let tree = again(draw);
  const standing = find(tree, byTestId("ix-th-standing"));
  const pill = find(standing, (n) => n.props?.kind === "tone");
  assert.deepEqual([pill?.props.value, pill?.props.label], ["warn", "Unanswered"], "the warning's amber, said once");
  assert.equal(textOf(find(standing, hasClass("ix-th-standing-meta"))), "26d", "her wait beside it, in the mono face");
  const dock = find(tree, byTestId("ix-unanswered"));
  assert.equal(textOf(find(dock, hasClass("notice-fact"))), "Asked for $150. · Closed Sep 21 without a reply");
  const call = find(dock, byTestId("ix-unanswered-call"));
  assert.equal(call.props.href, "tel:+16465550123", "Call dials her");
  assert.equal(find(tree, byTestId("ix-archive-confirm")), null);
  button(dock, byTestId("ix-no-reply-needed")).props.onClick();
  tree = again(draw);
  const ask = find(tree, byTestId("ix-archive-confirm"));
  assert.ok(ask, "No reply needed asks first: it closes her request");
  assert.deepEqual(archived, [], "nothing archived until yes");
  button(ask, byTestId("ix-archive-yes")).props.onClick();
  assert.deepEqual(archived, [thread.id], "then the thread is archived, and a new message from her brings it back");

  // A reader who may not archive is offered no way to, and someone who said stop is not offered a call.
  fresh();
  const viewer = again(() => InboxThread({ thread, channelLabels: labels }));
  assert.equal(find(viewer, byTestId("ix-no-reply-needed")), null);
  fresh();
  const stopped = again(() =>
    InboxThread({
      thread: vmOf(conv(asked, { contact: { ...daniela, dnc: true }, last_hold: hold() })),
      channelLabels: labels,
      onArchive() {},
    }),
  );
  assert.equal(find(stopped, byTestId("ix-unanswered-call")), null);
  assert.ok(find(stopped, byTestId("ix-no-reply-needed")));
});

test("the pane: a hand back that would leave her message with no answer asks first -- answer it, or hand back anyway", () => {
  const needs = vmOf(conv(asked, { state: "needs_human" }), {
    id: "e9",
    reason: "human_token",
    details: "Asked for $150.",
    state: "open",
    created_at: ago(26 * DAY - 1),
  });
  const decided = [];
  const focused = [];
  const hear = (e) => focused.push(e.detail);
  const draw = () =>
    InboxThread({ thread: needs, channelLabels: labels, onDecide: (id, act) => decided.push([id, act]) });
  // A new tree forgets every listener, so the reply box's ear is put back after it.
  fresh();
  globalThis.window.addEventListener("inbox:focus-composer", hear);
  try {
    let tree = again(draw);
    // Hand back stands beside the reply box's Send, the box that answers the hold (the thread canvas, 1 Nov 2026).
    find(tree, byTestId("ix-hand-back")).props.onClick();
    assert.deepEqual(decided, [], "REGRESSION: handed back at once, and the receptionist never came back to her");
    tree = again(draw);
    const ask = find(tree, byTestId("ix-hand-back-ask"));
    assert.equal(
      textOf(find(ask, hasClass("notice-fact"))),
      "Daniela's message has no answer yet. · Handing back sends nothing, and the receptionist won't come back to it.",
    );
    assert.equal(find(tree, byTestId("ix-needs-you")), null, "the ask stands in the dock's place");
    assert.equal(find(tree, byTestId("ix-hand-back")), null, "and the box's Hand back waits on its answer");
    button(ask, byTestId("ix-answer-first")).props.onClick();
    assert.deepEqual(focused, [{ threadId: needs.id }], "Answer first puts her in the reply box");
    tree = again(draw);
    assert.ok(find(tree, byTestId("ix-needs-you")), "and the dock is back");

    find(tree, byTestId("ix-hand-back")).props.onClick();
    tree = again(draw);
    button(find(tree, byTestId("ix-hand-back-ask")), byTestId("ix-hand-back-anyway")).props.onClick();
    assert.deepEqual(decided, [[needs.id, "__HANDBACK__"]], "Hand back anyway hands it back");
  } finally {
    globalThis.window.removeEventListener("inbox:focus-composer", hear);
  }

  // Answered already: nothing is left with no answer, so the hand back goes at once.
  const answered = vmOf(conv([...asked, ours("m4", "human", "We can do $160.", 10)], { state: "needs_human" }), {
    id: "e9",
    reason: "human_token",
    details: null,
    state: "open",
    created_at: ago(30),
  });
  const went = [];
  fresh();
  const tree = again(() =>
    InboxThread({ thread: answered, channelLabels: labels, onDecide: (id, act) => went.push(act) }),
  );
  find(tree, byTestId("ix-hand-back")).props.onClick();
  assert.deepEqual(went, ["__HANDBACK__"]);
  assert.equal(all(tree, byTestId("ix-hand-back-ask")).length, 0);
});
