/** Conversations row rules. A call has its OWN row on this surface, so the chat
 *  row must summarise the MESSAGING thread only — otherwise one call renders
 *  twice and the row's pill lies about who owes a reply. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toConversationVM } from "@chanlytics/contracts";

const NOW = new Date("2026-08-27T15:00:00Z");

const msg = (over = {}) => ({
  id: "m", direction: "inbound", sender: "customer", type: "text",
  body: "hi", media: null, meta: null, status: "received",
  created_at: "2026-08-27T12:00:00Z", ...over,
});

const conv = (messages) => ({
  id: "c1", state: "open", paused_until: null,
  last_wa_inbound_at: "2026-08-27T12:00:00Z",
  last_message_at: "2026-08-27T12:00:00Z",
  contact: { id: "k1", display_name: null, wa_profile_name: null, phone_e164: "+13475550101" },
  messages,
});

test("a call note never becomes the chat row's preview", () => {
  const vm = toConversationVM(conv([
    msg({ id: "m1", body: "do you do gel refills?" }),
    msg({ id: "m2", direction: "outbound", sender: "ai", body: "Yes — Tuesdays work.", status: "sent", created_at: "2026-08-27T12:00:41Z" }),
    msg({ id: "m3", channel: "voice", sender: "system", type: "call_summary",
          body: "Inbound call · 1 min — asked about hours.", created_at: "2026-08-27T14:15:00Z" }),
  ]), NOW);
  assert.match(vm.snippet, /Yes — Tuesdays work\./);
  assert.doesNotMatch(vm.snippet, /Inbound call/);
});

test("a call note does not flip the pill to 'open'", () => {
  // The customer phoned and was handled. A call note is direction:"inbound",
  // so counting it made the row claim the customer spoke last and is waiting.
  const vm = toConversationVM(conv([
    msg({ id: "m1", body: "hi" }),
    msg({ id: "m2", direction: "outbound", sender: "ai", body: "Hello!", status: "sent", created_at: "2026-08-27T12:00:41Z" }),
    msg({ id: "m3", sender: "system", type: "call_summary", body: "Inbound call · 1 min", created_at: "2026-08-27T14:15:00Z" }),
  ]), NOW);
  assert.equal(vm.outcome, "handled");
});

test("the row's time comes from the message it is previewing", () => {
  // last_message_at ignored the imported call note, so the row read one time
  // beside a preview written at another.
  const vm = toConversationVM(conv([
    msg({ id: "m1", direction: "outbound", sender: "ai", body: "Booking link sent.", status: "sent", created_at: "2026-08-27T12:00:00Z" }),
    msg({ id: "m2", sender: "system", type: "call_summary", body: "Inbound call", created_at: "2026-08-27T14:15:00Z" }),
  ]), NOW);
  assert.match(vm.snippet, /Booking link sent\./);
  // Locale-independent: the row time must equal what the SAME thread renders
  // without the imported call note. A literal clock string would only pass in
  // the timezone the test was written in (CI runs UTC).
  const chatOnly = toConversationVM(conv([
    msg({ id: "m1", direction: "outbound", sender: "ai", body: "Booking link sent.", status: "sent", created_at: "2026-08-27T12:00:00Z" }),
  ]), NOW);
  assert.equal(vm.at, chatOnly.at);
});

test("a caller who never messaged is not given an empty chat row", () => {
  const vm = toConversationVM(conv([
    msg({ id: "m1", sender: "system", type: "call_summary", body: "Inbound call · 1 min", created_at: "2026-08-27T14:15:00Z" }),
  ]), NOW);
  assert.equal(vm.hasChat, false, "their call rows already represent them");
});

test("a normal messaging thread still counts as chat", () => {
  const vm = toConversationVM(conv([msg({ id: "m1" })]), NOW);
  assert.equal(vm.hasChat, true);
});

test("the summary counts messages and calls separately", () => {
  const vm = toConversationVM(conv([
    msg({ id: "m1" }),
    msg({ id: "m2", sender: "system", type: "call_summary", body: "Inbound call", created_at: "2026-08-27T14:15:00Z" }),
  ]), NOW);
  assert.match(vm.summary.bullets[0], /^1 message · 1 call/);
});

/* ---- snoozing hides a thread; it must not discard what it was about ---- */
{
  const { threadStanding } = await import("@chanlytics/contracts");
  const { readCode } = await import("./_source.mjs");

  const conv = (over = {}) => ({
    id: "c1", state: "open", paused_until: null, snooze_until: null,
    assignee_user_id: null, assignee_is_me: undefined,
    last_wa_inbound_at: null, last_message_at: null,
    contact: { id: "k1", display_name: "Ana", wa_profile_name: null, phone_e164: "+15550001111", consent: null, dnc: false },
    messages: [], ...over,
  });
  const esc = { id: "e1", reason: "human_token", state: "open", created_at: new Date().toISOString() };

  test("a snoozed thread reads snoozed even with the request still open", () => {
    // Snooze used to RESOLVE the escalation, because an open one outranked
    // "snoozed" here and the thread would not have hidden. The cost was the
    // customer's request. Snoozed wins the ordering instead, so the escalation
    // can stay open while the thread is out of the way.
    const s = threadStanding(conv({ state: "snoozed" }), esc);
    assert.equal(s.state, "snoozed");
    assert.equal(s.needsYou, false, "a snoozed thread is not waiting on you today");
  });

  test("waking a thread puts the request back in the queue", () => {
    // wake_stale_snoozes() flips state to open and touches nothing else, so the
    // escalation that survived the snooze is what brings it back.
    const s = threadStanding(conv({ state: "open" }), esc);
    assert.equal(s.state, "escalated");
    assert.equal(s.needsYou, true);
  });

  test("a paused snoozed thread is still snoozed, not escalated", () => {
    const s = threadStanding(
      conv({ state: "snoozed", paused_until: new Date(Date.now() + 3600_000).toISOString() }),
      null,
    );
    assert.equal(s.state, "snoozed");
  });

  test("the snooze route leaves the escalation open", () => {
    const src = readCode("apps/dashboard/app/api/v1/conversations/[id]/snooze/route.ts");
    assert.ok(
      !src.includes("resolveOpenEscalation"),
      "snoozing must not resolve the request the operator is postponing",
    );
  });

  test("Wake now is its own verb, not hand-back", () => {
    // hand-back resolves the escalation AND returns the thread to the
    // receptionist, so waking through it discarded the very request being
    // pulled forward.
    const inbox = readCode("apps/dashboard/src/legacy/pages/inbox.jsx");
    const wakeFn = inbox.slice(inbox.indexOf("const wake = "));
    const body = wakeFn.slice(0, wakeFn.indexOf("\n  };"));
    assert.ok(body.includes('realVerb(t, "wake"'), "wake must call the wake verb");
    assert.ok(!body.includes('"hand-back"'), "waking must not hand the thread back");

    const route = readCode("apps/dashboard/app/api/v1/conversations/[id]/wake/route.ts");
    assert.ok(!route.includes("resolveOpenEscalation"), "the wake route must not resolve either");
    assert.ok(route.includes('.select("id")'), "and must count the rows it changed");
  });
}
