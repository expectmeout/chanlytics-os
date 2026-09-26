/**
 * One person, the same person on every page.
 *
 * FOUND LIVE, 18 Sep 2026. The first real email into the product came from a
 * person with no name and no number -- an address and nothing else -- and four
 * surfaces said four different things about them:
 *
 *   Conversations and the Inbox   "Unknown", credited to "WhatsApp Receptionist"
 *   their own page                ruben@... , "Phone since Sep 17",
 *                                 "Reply window: Closed · template only" (now "Replies"),
 *                                 "Send the booking-link template"
 *
 * None of those was a missing feature. Each was a second copy of a rule that
 * already existed somewhere, written before email and never told about it:
 *
 *   the name          five copies; the one the Inbox read was fed a contact
 *                     whose address the mapper in front of it had dropped
 *   the agent         one constant, "WhatsApp Receptionist", on every row
 *   the wire's words  the page's own `whatsapp ? "WhatsApp" : "Phone"`
 *   the window        WhatsApp's 24 hours, asked of everybody
 *   the button        three pages' own two-way copy of its words
 *
 * So what is proved here is the CHAIN, from the row the database returns to the
 * words a page draws, for a person reached only by email -- the case that
 * exposed every one of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  personName,
  contactName,
  agentFor,
  toConversationVM,
  toInboxThreadVM,
  toPersonVM,
  PERSON_CHANNEL_WORDS,
} from "@chanlytics/contracts";
import { toConversationDto } from "../../../apps/dashboard/src/server/dto.ts";
import { personLabel } from "../../../apps/dashboard/src/server/export/export.ts";

const TZ = "America/New_York";
const NOW = new Date("2026-09-18T02:45:00Z");
const ADDRESS = "ruben@rjcapital.io";

/** The contact exactly as CONVERSATION_COLUMNS selects it: email and all. */
const contactRow = {
  id: "p1",
  display_name: null,
  wa_profile_name: null,
  phone_e164: null,
  email: ADDRESS,
  consent: null,
  dnc: false,
  marketing_consent: null,
};
const msg = (id, sender, at, body) => ({
  id,
  direction: sender === "customer" ? "inbound" : "outbound",
  sender,
  type: "text",
  channel: "email",
  body,
  media: null,
  meta: null,
  status: sender === "customer" ? "received" : "delivered",
  created_at: at,
  channel_ts: at,
});
const messages = [
  msg("m1", "customer", "2026-09-18T02:05:16Z", "test message"),
  msg("m2", "customer", "2026-09-18T02:42:00Z", "testing"),
  msg("m3", "human", "2026-09-18T02:43:00Z", "testing back at you"),
];
const dto = () =>
  toConversationDto(
    {
      id: "c1",
      state: "needs_human",
      paused_until: null,
      snooze_until: null,
      assignee_user_id: null,
      last_wa_inbound_at: null,
      last_message_at: "2026-09-18T02:43:00Z",
      contacts: contactRow,
    },
    messages,
    "u1",
  );

/* ------------------------------------------------------------- the name */

test("REGRESSION: the conversation keeps the address the database gave it", () => {
  // The select asked for it; the mapper threw it away.
  assert.equal(dto().contact.email, ADDRESS);
  assert.equal(contactName(dto()), ADDRESS, 'so the thread names them by it, not "Unknown"');
});

test("one rule names a person, whatever surface asks and whichever fields it has", () => {
  const cases = [
    [{ display_name: "Ana Reyes", wa_profile_name: "ana", phone_e164: "+19293709606", email: ADDRESS }, "Ana Reyes"],
    [{ display_name: null, wa_profile_name: "ana", phone_e164: "+19293709606", email: ADDRESS }, "ana"],
    [{ display_name: null, wa_profile_name: null, phone_e164: "+19293709606", email: ADDRESS }, "+1 (929) 370-9606"],
    [{ display_name: null, wa_profile_name: null, phone_e164: null, email: ADDRESS }, ADDRESS],
    [{ display_name: null, wa_profile_name: null, phone_e164: null, email: null }, "Unknown"],
    [{}, "Unknown"],
    [null, "Unknown"],
  ];
  for (const [c, want] of cases) {
    assert.equal(personName(c), want, JSON.stringify(c));
    // The transcript export used to print the raw +19293709606 here.
    assert.equal(personLabel(c), want, `export: ${JSON.stringify(c)}`);
  }
});

/* ------------------------------------------------------------ the agent */

test("REGRESSION: an email thread credits the team, not a WhatsApp receptionist that never touched it", () => {
  assert.deepEqual(
    agentFor("email"),
    { glyph: "Y", name: "Your team" },
    "the words the thread already signs a person's reply with",
  );
  assert.deepEqual(agentFor("whatsapp"), { glyph: "W", name: "WhatsApp Receptionist" });
  assert.deepEqual(agentFor("sms"), { glyph: "T", name: "Text Receptionist" });
  assert.deepEqual(agentFor("phone"), { glyph: "P", name: "Phone Receptionist" });

  const row = toConversationVM(dto(), TZ, NOW);
  assert.equal(row.channel, "email");
  assert.equal(row.agent.name, "Your team");
  assert.equal(row.who, ADDRESS);

  const thread = toInboxThreadVM(dto(), null, TZ, NOW);
  assert.equal(thread.who, ADDRESS);
  assert.equal(thread.agent.name, "Your team");
  // The address IS the name here, so the line under it says so rather than
  // printing it twice (contactMeta). Before the mapper kept the address this
  // read "Unknown" above "Email · no phone".
  assert.equal(thread.whoMeta, "Email · no name saved");
});

/* ----------------------------------------------------------- their page */

const ROW = {
  id: "p1",
  display_name: null,
  wa_profile_name: null,
  phone_e164: null,
  email: ADDRESS,
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  dnc: false,
  channels: ["email"],
  message_channels: ["email"],
  conversation_count: 1,
  escalation_count: 1,
  needs_human: true,
  open_escalation_reason: "email_review",
  open_escalation_since: "2026-09-18T02:42:05Z",
  latest_conversation_id: "c1",
  latest_state: "needs_human",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: "2026-09-18T02:43:00Z",
  last_message_direction: "outbound",
  last_message_sender: "human",
  last_inbound_text: "testing",
  last_inbound_at: "2026-09-18T02:42:00Z",
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: "2026-09-18T02:05:16Z",
  earliest_row_at: "2026-09-18T02:05:16Z",
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
};
const person = () =>
  toPersonVM(
    {
      row: ROW,
      identities: [],
      conversations: [dto()],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
    },
    TZ,
    NOW,
  );

test("REGRESSION: their page introduces them by the wire they came on", () => {
  const p = person();
  assert.equal(p.name, ADDRESS);
  assert.equal(p.channelWords, "Email", 'was "Phone": the page\'s own copy knew WhatsApp and nothing else');
  assert.deepEqual(p.channels, ["email"]);
  const first = p.about.find((a) => a.k === "First contact");
  assert.match(first.v, /· Email$/, "the first contact came by email, and says so");
});

test("REGRESSION: their page does not hold a reply behind a window email does not have", () => {
  const p = person();
  assert.equal(p.replyVia, "Email");
  assert.equal(p.replyWindow.open, true);
  assert.deepEqual(
    p.about.find((a) => a.k === "Replies"),
    { k: "Replies", v: "Any time, by email" },
  );
  assert.deepEqual(
    p.bookingLinkAction,
    { label: "Email the booking link", title: "Opens the thread with the link ready to send by email", ready: true },
    "and the button fills the composer, which sends by email, instead of offering a WhatsApp template",
  );
});

test("the page takes its words for a wire from the one table", () => {
  assert.deepEqual(PERSON_CHANNEL_WORDS, { whatsapp: "WhatsApp", sms: "Text", voice: "Phone", email: "Email" });
});

test("the profile answers the reply wire from the messages, where a row can only guess", () => {
  // They wrote on WhatsApp days ago and by email last: the reply goes by email,
  // and email has no window -- the row alone would have read WhatsApp's.
  const wa = { ...msg("w1", "customer", "2026-09-15T12:00:00Z", "hola"), channel: "whatsapp" };
  const both = toPersonVM(
    {
      row: {
        ...ROW,
        message_channels: ["whatsapp", "email"],
        channels: ["whatsapp", "email"],
        latest_wa_inbound_at: "2026-09-15T12:00:00Z",
      },
      identities: [],
      conversations: [{ ...dto(), messages: [wa, ...messages] }],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
    },
    TZ,
    NOW,
  );
  assert.equal(both.replyVia, "Email", "where they last wrote");
  assert.equal(both.replyWindow.open, true);
  assert.match(
    both.about.find((a) => a.k === "First contact").v,
    /· WhatsApp$/,
    "while their FIRST contact was WhatsApp, and says so",
  );
});
