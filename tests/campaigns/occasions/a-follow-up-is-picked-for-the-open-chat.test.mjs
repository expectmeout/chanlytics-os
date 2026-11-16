/**
 * A follow-up WhatsApp approved as an offer goes in the open chat (decision 0135): which steps, the switch, and the run.
 *
 * Only a step about the person's own request (its moment's yes is to messages) whose message WhatsApp approved as an
 * offer replies in the chat (contracts inChatPurposeOf), and only in a workspace whose switch is on (replyInChatOf,
 * `features.reply_in_chat`, off by default). Its run then picks the person whose chat will be open when the batch goes,
 * on WhatsApp under the moment's yes, and marks them on their row (`in_chat`), which is what the send goes by. Run on
 * core's runPlaybook with an occasion, as an ask's follow-up runs, through fakes that keep its writes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, inChatPurposeOf, numberHealth, replyInChatOf, toPersonRowVM } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");

const TZ = "America/New_York";
/** Monday 16 November 2026, 10:00 AM in New York: the day after the booking link was sent. */
const NOW = new Date("2026-11-16T15:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const US_NUMBER = "+13055550100";

test("only a step about their own request whose message WhatsApp approved as an offer replies in the open chat", () => {
  const offer = { category: "marketing", whatsappApproved: true };
  assert.equal(inChatPurposeOf("follow_up", offer), "conversational", "the ready-made booking follow-up");
  assert.equal(inChatPurposeOf("booking", offer), "conversational", "a reminder WhatsApp filed as an offer");
  assert.equal(inChatPurposeOf("follow_up", { ...offer, category: null }), "conversational", "nobody filed: an offer");
  assert.equal(inChatPurposeOf("reengage", offer), null, "an offer's own moment is an offer wherever it goes");
  assert.equal(inChatPurposeOf("campaign", offer), null);
  assert.equal(inChatPurposeOf("follow_up", { ...offer, category: "utility" }), null, "a notice goes as it always did");
  assert.equal(inChatPurposeOf("follow_up", { ...offer, whatsappApproved: false }), null, "no approved words to send");
});

test("the switch is the workspace's, off unless its config says true", () => {
  assert.equal(replyInChatOf({ features: { reply_in_chat: true } }), true);
  for (const config of [
    null,
    {},
    { features: {} },
    { features: { reply_in_chat: "yes" } },
    { features: { reply_in_chat: false } },
  ])
    assert.equal(replyInChatOf(config), false, JSON.stringify(config));
});

/** Someone who said yes to messages and never to offers, who last wrote on WhatsApp `hoursAgo` hours ago. */
const person = (id, hoursAgo) =>
  toPersonRowVM(
    {
      id,
      display_name: `Person ${id}`,
      wa_profile_name: null,
      phone_e164: `+1305555014${id.charCodeAt(0) % 10}`,
      consent: "opted_in",
      consent_source: "customer_message",
      consent_updated_at: new Date(NOW.getTime() - 30 * DAY).toISOString(),
      dnc: false,
      marketing_consent: "unknown",
      marketing_consent_source: null,
      marketing_consent_updated_at: null,
      channels: ["whatsapp"],
      conversation_count: 1,
      escalation_count: 0,
      needs_human: false,
      latest_conversation_id: `cv-${id}`,
      latest_state: "open",
      latest_wa_inbound_at: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
      last_message_at: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
      last_message_direction: "outbound",
      last_message_sender: "receptionist",
      last_inbound_text: "Can I book a trim?",
      last_inbound_at: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
      call_count: 0,
      call_seconds: 0,
      first_contact_at: new Date(NOW.getTime() - 30 * DAY).toISOString(),
      earliest_row_at: new Date(NOW.getTime() - 30 * DAY).toISOString(),
      has_backfill: false,
      has_chat: true,
      effective_reply_mode: "auto",
      visits: null,
    },
    TZ,
    NOW,
  );

/** The workspace as an occasion's job reads it, its WhatsApp number a US one, nothing else to send by. */
const world = (repliesInChat, people = [person("a", 20), person("b", 30)]) => ({
  tz: TZ,
  now: NOW,
  people,
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  ready: channelsReady({
    whatsapp: { canSend: true, refusal: null, number: US_NUMBER },
    textLine: null,
    email: { mailbox: false, domain: false },
  }),
  touches: { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() },
  calendar: "none",
  visits: new Map(),
  listMembers: () => null,
  pace: null,
  ...(repliesInChat === undefined ? {} : { repliesInChat }),
});

/** The ready-made booking follow-up's step, its words seen going, sending on its own. */
const step = {
  id: "p1",
  tenant_id: "t1",
  name: "Customer · Asked, didn't book",
  trigger: "asked_no_booking",
  template_id: "tpl-1",
  template_name: "booking_follow_up",
  template_language: "en_US",
  params: [],
  policy_class: "follow_up",
  mode: "auto",
  words_ok_at: "2026-11-01T10:00:00.000Z",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 7,
  cadence_days: 30,
  channels: ["whatsapp", "sms", "email"],
  created_by: "owner",
  last_run_for: null,
};

/** The run's ports: its message the WhatsApp version WhatsApp approved as an offer; the writes kept in order. */
function fakes() {
  const calls = [];
  const answers = {
    message: (name, language) => [
      {
        id: "tpl-whatsapp",
        channel: "whatsapp",
        name,
        language,
        meta_status: "approved",
        category: "marketing",
        variables: [],
        hidden_at: null,
        title: null,
        source: "chanlytics",
        components: [],
        body_preview: "Still want to book? Here's the link again.",
        rejected_reason: null,
      },
    ],
    alreadyRan: false,
    record: undefined,
    assemble: (_row, _people, _sendAt, decision) => ({ id: "b1", decisionId: decision ? "d1" : null }),
    monthSent: 0,
    holdRecipients: (_id, ids) => ({ skipped: ids, error: null }),
    notify: undefined,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      calls.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, of: (name) => calls.filter((c) => c[0] === name) };
}
const occasion = (contactId) => ({
  contactId,
  occasion: `ask:${contactId}0000000-b2b2-4b2b-8b2b-b2b2b2b2b2b2`,
  visit: null,
});
const run = (ports, ctx, contactId = "a") =>
  runPlaybook(ports, { playbook: step, ctx, by: { kind: "system" }, occasion: occasion(contactId) });

test("switched on, the person whose chat is open is enrolled on WhatsApp, marked to be answered in the chat", async () => {
  const { ports, of } = fakes();
  const r = await run(ports, world(true));
  assert.equal(r.outcome, "sent", "REGRESSION (15 Nov 2026): the booking follow-up reached nobody from a US number");
  const [, , people] = of("assemble")[0];
  assert.deepEqual(
    people.map((p) => [p.contact_id, p.channel, p.facts.in_chat]),
    [["a", "whatsapp", "yes"]],
  );
});

test("switched on, a person whose chat is closed is held as before; switched off, nobody is answered in the chat", async () => {
  const closed = fakes();
  assert.equal((await run(closed.ports, world(true), "b")).outcome, "empty", "30 hours since they wrote");
  assert.equal(closed.of("assemble").length, 0);
  for (const repliesInChat of [false, undefined]) {
    const off = fakes();
    assert.equal((await run(off.ports, world(repliesInChat))).outcome, "empty", String(repliesInChat));
    assert.equal(off.of("assemble").length, 0);
  }
});
