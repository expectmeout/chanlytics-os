/**
 * A thread the business began (a conversation begins from the Inbox, the design's F8 and 4.6): its reply box writes on
 * the wire our own words went by, where it read WhatsApp whatever they were; the activity log says a start as a start;
 * and the shortcuts sheet lists the key the Inbox answers to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityWords, answerWireOf, SHORTCUTS, toInboxThreadVM } from "@chanlytics/contracts";

const NOW = new Date("2026-10-07T15:00:00Z");
const ours = (channel, over = {}) => ({
  id: `m-${channel}`,
  direction: "outbound",
  sender: "human",
  channel,
  type: "text",
  body: "Hello from the team",
  media: null,
  meta: null,
  status: "sent",
  created_at: "2026-10-07T14:00:00Z",
  ...over,
});
const theirs = (channel, over = {}) =>
  ours(channel, { id: `in-${channel}`, direction: "inbound", sender: "customer", body: "Hi", ...over });
const thread = (messages, over = {}) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  last_wa_inbound_at: null,
  last_message_at: "2026-10-07T14:00:00Z",
  last_inbound_at: null,
  contact: {
    id: "k1",
    display_name: "Robin Example",
    wa_profile_name: null,
    phone_e164: "+12125550143",
    email: "robin@example.com",
    consent: "opted_in",
    dnc: false,
    marketing_consent: "unknown",
  },
  messages,
  ...over,
});

test("a thread nothing has come to is answered on the wire our own words went by", () => {
  assert.equal(answerWireOf([ours("email")]), "email");
  assert.equal(answerWireOf([ours("email"), ours("sms", { created_at: "2026-10-07T14:30:00Z" })]), "sms");
  assert.equal(answerWireOf([]), "whatsapp", "nothing written: as every thread read before a wire was said");
  assert.equal(
    answerWireOf([ours("email"), { ...ours("whatsapp"), type: "call_summary", sender: "system" }]),
    "email",
    "a call's note is no written word",
  );
});

test("once they write, the box follows where they wrote", () => {
  assert.equal(answerWireOf([ours("email"), theirs("whatsapp", { created_at: "2026-10-07T14:40:00Z" })]), "whatsapp");
});

test("the Inbox's thread says the wire, and an email the business began is open to write on", () => {
  const vm = toInboxThreadVM(thread([ours("email")]), null, "America/New_York", NOW);
  assert.equal(vm.replyVia, "Email");
  assert.equal(vm.primaryChannel, "email");
  assert.equal(vm.windowOpen, true, "an email has no window");
  assert.equal(vm.hasChat, true);
  const text = toInboxThreadVM(thread([ours("sms")]), null, "America/New_York", NOW);
  assert.equal(text.replyVia, "Text");
  assert.equal(text.windowOpen, true);
  const wa = toInboxThreadVM(thread([ours("whatsapp")]), null, "America/New_York", NOW);
  assert.equal(wa.replyVia, "WhatsApp");
  assert.equal(wa.windowOpen, false, "they never wrote: only an approved message goes");
});

test("the activity log says a start as a start, and a reply as it always did", () => {
  assert.equal(activityWords("reply", { message_id: "m1", starts: true }), "Began a conversation from the dashboard");
  assert.equal(activityWords("reply", { message_id: "m1" }), "Replied from the dashboard");
});

test("the shortcuts sheet lists the Inbox's key for a new conversation", () => {
  const row = SHORTCUTS.find((s) => s.group === "Inbox" && s.does === "New conversation");
  assert.deepEqual(row?.keys, ["N"]);
});

test("their page reads the same wire for a thread only the business wrote on", async () => {
  const { ourWireOfThreads } = await import("../../../../packages/contracts/src/people/person-helpers.ts");
  const at = (iso, over) => ({ type: "text", direction: "outbound", created_at: iso, channel_ts: null, ...over });
  const threads = [
    {
      messages: [
        at("2026-10-05T10:00:00Z", { channel: "whatsapp", type: "template" }),
        at("2026-10-06T10:00:00Z", { channel: "sms" }),
        // What came from their side is not ours, and a note the platform wrote on the thread is no written message.
        at("2026-10-07T10:00:00Z", { channel: "email", direction: "inbound" }),
        at("2026-10-07T11:00:00Z", { channel: "email", type: "note" }),
      ],
    },
  ];
  assert.equal(ourWireOfThreads(threads), "sms", "the newest of our own written words");
  assert.equal(ourWireOfThreads([{ messages: [] }]), null);
});
