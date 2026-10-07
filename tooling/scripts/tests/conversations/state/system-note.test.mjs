/**
 * A note the platform wrote on a thread (messages.type = 'note', sender system) is a line between the words, not a
 * reply: drawn as a bubble it read "by WhatsApp Receptionist · Delivered", the Inbox's quiet line said the
 * receptionist had answered, and Conversations' pill flipped to handled (the 2 Oct 2026 audit). One question,
 * isChatMessage, for the three readers.
 * Run: node tooling/scripts/checks/test.mjs tooling/scripts/tests/conversations/state/system-note.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isChatMessage, toConversationVM, toInboxThreadVM } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-10-02T18:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const msg = (over) => ({
  id: "m",
  direction: "inbound",
  sender: "customer",
  channel: "whatsapp",
  type: "text",
  body: "hi",
  media: null,
  meta: {},
  status: "received",
  created_at: ago(10),
  channel_ts: ago(10),
  ...over,
});
const wrote = msg({
  id: "m1",
  body: "Do I need a patch test before colour?",
  created_at: ago(10),
  channel_ts: ago(10),
});
const note = msg({
  id: "m2",
  direction: "outbound",
  sender: "system",
  channel: "system",
  type: "note",
  body: "Patch test required 48 hours before colour services.",
  status: "delivered",
  created_at: ago(9),
  channel_ts: ago(9),
});
const dto = {
  id: "c1",
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(10),
  last_message_at: ago(9),
  contact: {
    id: "p1",
    display_name: "Pru Example",
    wa_profile_name: null,
    phone_e164: "+12125550177",
    consent: "opted_in",
    dnc: false,
  },
  messages: [wrote, note],
};

test("a note is not a chat message; a call's note is not either; words are", () => {
  assert.equal(isChatMessage(note), false);
  assert.equal(isChatMessage({ type: "call_summary" }), false);
  assert.equal(isChatMessage(wrote), true);
  assert.equal(isChatMessage({ type: "template" }), true);
  assert.equal(isChatMessage({ type: "media" }), true);
});

test("the Inbox draws the note as a line, and still says they wrote last", () => {
  const vm = toInboxThreadVM(dto, null, ZONE, NOW);
  const entry = vm.timeline.find((e) => e.type === "event" && e.kind === "note");
  assert.ok(entry, "the note is an event, not a bubble");
  assert.equal(entry.body, "Note: Patch test required 48 hours before colour services.");
  assert.equal(
    vm.timeline.some((e) => e.type === "msg" && e.body.startsWith("Patch test")),
    false,
  );
  assert.equal(vm.lastWord?.text, "They wrote last — no reply yet.");
  assert.equal(vm.hasChat, true, "their own words make it a chat thread");
});

test("Conversations' row reads the customer as having the last word", () => {
  const row = toConversationVM(dto, null, ZONE, NOW);
  assert.equal(row.outcome, "open");
  assert.equal(row.snippet, "Do I need a patch test before colour?");
});

test("a note is not a call in the thread's count, and not the Inbox row's preview", () => {
  // Conversations counted every row that was not a chat message as a call ("1 message · 1 call"), and the Inbox's row
  // previewed the team's note as the last thing said between them.
  const row = toConversationVM(dto, null, ZONE, NOW);
  assert.doesNotMatch(row.summary.bullets[0], /call/, "REGRESSION: the note was counted as a call");
  assert.match(row.summary.bullets[0], /^1 message · started /);
  const withCall = {
    ...dto,
    messages: [...dto.messages, msg({ id: "m3", type: "call_summary", body: "Asked about colour." })],
  };
  assert.match(toConversationVM(withCall, null, ZONE, NOW).summary.bullets[0], /^1 message · 1 call · started /);
  assert.equal(
    toInboxThreadVM(dto, null, ZONE, NOW).preview,
    "Do I need a patch test before colour?",
    "REGRESSION: the Inbox row previewed the note",
  );
});
