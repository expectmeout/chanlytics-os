/**
 * An address that stopped accepting mail is offered no email: not the booking link, not the proposal, not the deal
 * card's send.
 *
 * #1431 made the page say it: the Replies row reads "Email can't reach them: their address stopped accepting mail" and
 * the Email fact carries the tag. The buttons beside them still read ready for the same person: "Email the booking
 * link" and "Email the proposal" opened the thread with the link in the box, the More menu offered both, and the deal
 * card led with "Send proposal" and, where it could not go, blamed WhatsApp's window. Each reads whether the person may
 * be reached on their wire (mayReach) and what that wire's action is (bookingLinkAction, proposalAction), and now says
 * the one sentence the Replies row says. A person whose replies go by another wire is unchanged: the address is theirs
 * to fix, and the thread's other wire is not held by it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingLinkAction,
  dealCardsOf,
  dealNextAct,
  dealSendOf,
  mayReach,
  proposalAction,
  toPersonRowVM,
  toPersonVM,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
const NOW = new Date("2026-09-18T02:45:00Z");
const H = 3_600_000;
const ADDRESS = "ana@example.com";
const PROPOSAL = "https://docs.example.com/p/ana";
const BOOKING = "https://book.example/salon";
/** The sentence the Replies row says (person-reach.ts), word for word: the buttons must not word it a second way. */
const STOPPED = "Email can't reach them: their address stopped accepting mail";
const at = (ms) => new Date(NOW.getTime() - ms).toISOString();

const row = (over = {}) => ({
  id: "p1",
  display_name: "Ana Reyes",
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
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: "c1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: at(2 * H),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Can you move Saturday?",
  last_inbound_at: at(2 * H),
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: at(240 * H),
  earliest_row_at: at(240 * H),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});

const message = (channel) => ({
  id: "m1",
  conversation_id: "c1",
  direction: "inbound",
  sender: "customer",
  type: "text",
  channel,
  body: "Can you move Saturday?",
  media: null,
  meta: null,
  status: "received",
  created_at: at(2 * H),
  channel_ts: at(2 * H),
});

const deal = {
  id: "d1",
  contact_id: "p1",
  service: "Ad management",
  stage: "proposed",
  proposed_at: at(24 * H),
  decided_at: null,
  ended_at: null,
  amount_cents: 120_000,
  per: "once",
  currency: "USD",
  note: null,
  version: 2,
  created_at: at(24 * H),
  proposal_url: PROPOSAL,
  valid_until: null,
  lost_reason: null,
};

/**
 * A person as the profile reads them, on one wire (`channel`), whose address has stopped or has not. With a deal their
 * card leads with the proposal's send, so the More menu leaves it out (personActs); without one the link left on the
 * person is the menu's to offer.
 */
const personOn = (channel, { stopped, withDeal = true }) =>
  toPersonVM(
    {
      row: row({
        channels: [channel],
        message_channels: [channel],
        phone_e164: channel === "email" ? null : "+17865550181",
        latest_wa_inbound_at: channel === "whatsapp" ? at(2 * H) : null,
        email_suppressed_at: stopped ? at(48 * H) : null,
        ...(withDeal
          ? {
              deal_id: deal.id,
              deal_stage: deal.stage,
              deal_service: deal.service,
              deal_proposed_at: deal.proposed_at,
              deal_decided_at: null,
              deal_ended_at: null,
              deal_amount_cents: deal.amount_cents,
              deal_per: deal.per,
              deal_proposal_url: PROPOSAL,
              deal_valid_until: null,
              deal_lost_reason: null,
            }
          : {}),
      }),
      identities: [],
      conversations: [
        {
          id: "c1",
          state: "open",
          paused_until: null,
          last_wa_inbound_at: channel === "whatsapp" ? at(2 * H) : null,
          last_message_at: at(2 * H),
          contact: {
            id: "p1",
            display_name: "Ana Reyes",
            wa_profile_name: null,
            phone_e164: channel === "email" ? null : "+17865550181",
            email: ADDRESS,
            consent: "unknown",
            dnc: false,
            email_suppressed_at: stopped ? at(48 * H) : null,
          },
          messages: [message(channel)],
        },
      ],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
      booking_link: BOOKING,
      proposal_url: PROPOSAL,
      deals: withDeal ? [deal] : [],
      deals_on: true,
      services: ["Ad management"],
    },
    TZ,
    NOW,
  );

const actIds = (p) => p.acts.map((a) => a.id);

test("by email to a stopped address, the booking link and the proposal say why they cannot go, in the Replies row's own sentence", () => {
  const p = personOn("email", { stopped: true });
  assert.equal(p.replyVia, "Email");
  assert.equal(p.emailSuppressed, true);

  assert.equal(p.bookingLinkAction.ready, false, "was ready: the thread opened with the link in the box");
  assert.equal(p.bookingLinkAction.title, STOPPED);
  assert.doesNotMatch(p.bookingLinkAction.label, /Email/, "the button no longer says an email goes");
  assert.equal(p.proposalAction.ready, false);
  assert.equal(p.proposalAction.title, STOPPED);
  assert.doesNotMatch(p.proposalAction.label, /Email/);

  // The same words from the functions the row and the page call, and the Replies row beside them.
  assert.deepEqual(
    bookingLinkAction(
      { via: "Email", window: { open: false, hoursLeft: 0 }, emailStopped: true },
      { optedOut: false, who: "Ana Reyes" },
    ).title,
    STOPPED,
  );
  assert.equal(proposalAction({ via: "Email", window: null, emailStopped: true }, null).title, STOPPED);
  assert.equal(p.about.find((a) => a.k === "Replies").v, STOPPED);
});

test("the More menu offers no send over a stopped address, and the person is not one the page may reach", () => {
  const stopped = personOn("email", { stopped: true, withDeal: false });
  assert.equal(mayReach(stopped), false, "the one rule every send the page offers asks");
  assert.equal(actIds(stopped).includes("booking"), false, "was offered: 'Send booking link', hinted 'by email'");
  assert.equal(actIds(stopped).includes("proposal"), false);

  const fine = personOn("email", { stopped: false, withDeal: false });
  assert.equal(mayReach(fine), true);
  assert.equal(actIds(fine).includes("booking"), true);
  assert.equal(actIds(fine).includes("proposal"), true);
  assert.equal(fine.bookingLinkAction.label, "Email the booking link");
  assert.equal(fine.bookingLinkAction.ready, true);
  assert.equal(fine.proposalAction.label, "Email the proposal");
  assert.equal(fine.proposalAction.ready, true);
});

test("the deal card's send says the stopped address too, not WhatsApp's window, and leads with no send", () => {
  const stopped = personOn("email", { stopped: true });
  const send = dealSendOf(stopped);
  assert.deepEqual([send.can, send.reach, send.why], [false, false, STOPPED], "was can:true, offered over the bounce");

  const next = dealNextAct(stopped, NOW.getTime());
  assert.notEqual(next?.id, "send", "the card does not lead with a send to an address that refuses it");
  const card = dealCardsOf(stopped, NOW.getTime(), TZ).cards[0];
  assert.notEqual(card.next?.id, "send");

  const fine = personOn("email", { stopped: false });
  assert.deepEqual([dealSendOf(fine).can, dealSendOf(fine).reach], [true, true]);
  assert.equal(dealNextAct(fine, NOW.getTime())?.id, "send");
});

test("the People row's booking button is the same answer, and a person whose replies go by another wire is unchanged", () => {
  const rowVM = (over) => toPersonRowVM(row(over), TZ, NOW, null, null);
  const stopped = rowVM({ email_suppressed_at: at(48 * H) });
  assert.equal(stopped.bookingLinkAction.ready, false);
  assert.equal(stopped.bookingLinkAction.title, STOPPED);
  assert.equal(rowVM({}).bookingLinkAction.ready, true);

  // Their address stopped, but their replies go by WhatsApp, inside its window: nothing the address holds.
  const whatsapp = personOn("whatsapp", { stopped: true, withDeal: false });
  assert.equal(whatsapp.emailSuppressed, true);
  assert.equal(whatsapp.replyVia, "WhatsApp");
  assert.equal(whatsapp.bookingLinkAction.ready, true);
  assert.equal(whatsapp.bookingLinkAction.label, "Text the booking link");
  assert.equal(whatsapp.proposalAction.ready, true);
  assert.equal(mayReach(whatsapp), true);
  assert.deepEqual(
    actIds(whatsapp).filter((id) => id === "booking" || id === "proposal"),
    ["booking", "proposal"],
  );
  const withDeal = personOn("whatsapp", { stopped: true });
  assert.deepEqual([dealSendOf(withDeal).can, dealSendOf(withDeal).reach], [true, true]);
  assert.equal(dealNextAct(withDeal, NOW.getTime())?.id, "send");

  const text = personOn("sms", { stopped: true });
  assert.equal(text.replyVia, "Text");
  assert.equal(text.bookingLinkAction.label, "Text the booking link");
  assert.equal(text.proposalAction.ready, true);
});
