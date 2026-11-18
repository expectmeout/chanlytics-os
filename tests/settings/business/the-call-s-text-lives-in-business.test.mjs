/**
 * The call's text lives in Settings › Business (Campaigns, one tab, call C9, 17 Nov 2026): it lived in Messages until
 * Messages folded into Campaigns. The abilities card's booking-link row already says what a call does with no approved
 * message to text the link as; where a call wants one, the row carries the one press that sends the ready-made call's text
 * to WhatsApp, says WhatsApp is checking it, or opens it where WhatsApp turned it down.
 *
 * And the one sentence AI is asked where an owner says a message to keep: from New's line (call C12) and from the Inbox's
 * new conversation where no approved message can start a chat (call C10), the same card wherever it is asked for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALL_TEXT_NAME,
  CALL_TEXT_WORDS,
  callTextStandOf,
  callTextWanted,
} from "../../../apps/dashboard/src/surfaces/settings/business/model/call-text.ts";
import { newMessageAsked } from "../../../apps/dashboard/src/bridge/ask/new-message.ts";

/** The inputs a live phone line and WhatsApp, a booking link and nothing held give, with no approved message for it. */
const LIVE = {
  voiceLive: true,
  whatsappLive: true,
  hasCalendarFeed: true,
  hasBookingLink: true,
  hasBookingTemplate: false,
  textingLine: false,
  hasHandoffNumber: true,
  hasEscalateWhen: true,
  visionOn: false,
  bookingHeld: false,
  replyMode: "auto",
};

test("a call wants the call's text where it would text the booking link to WhatsApp and has no approved message to", () => {
  assert.equal(callTextWanted(LIVE), true);
  assert.equal(callTextWanted({ ...LIVE, hasBookingTemplate: true }), false, "one is approved: nothing to send");
  assert.equal(callTextWanted({ ...LIVE, voiceLive: false }), false, "no phone line: no call sends it");
  assert.equal(callTextWanted({ ...LIVE, whatsappLive: false }), false, "WhatsApp not live: it cannot go there");
  assert.equal(callTextWanted({ ...LIVE, hasBookingLink: false }), false, "no link to send");
  assert.equal(callTextWanted({ ...LIVE, bookingHeld: true }), false, "bookings held: a call sends no link");
  // A texting line carries the link meanwhile; the call's text is still what WhatsApp carries.
  assert.equal(callTextWanted({ ...LIVE, textingLine: true }), true);
});

test("where the call's text stands: none on file, WhatsApp checking it, or one to open", () => {
  const row = (meta_status) => ({ name: CALL_TEXT_NAME, meta_status });
  assert.equal(callTextStandOf([]), "none");
  assert.equal(callTextStandOf([{ name: "win_back", meta_status: "approved" }]), "none", "another message is not it");
  assert.equal(callTextStandOf([row("pending")]), "checking");
  for (const status of ["rejected", "paused", "disabled"]) assert.equal(callTextStandOf([row(status)]), "open", status);
  assert.match(CALL_TEXT_WORDS.sent, /WhatsApp, which looks at it first \(usually minutes, sometimes a day\)/);
  assert.ok(!/template/i.test(Object.values(CALL_TEXT_WORDS).join(" ")), "never a template on screen");
});

test("AI is asked the same sentence for a message to keep wherever it is asked: the Inbox's says it starts a chat", () => {
  const words = "thanks for your review, 10% off your next visit";
  assert.equal(
    newMessageAsked(words),
    `New message, with a version for WhatsApp, email and text wherever its kind may go (an offer never by text): ${words}`,
  );
  assert.equal(
    newMessageAsked(words, "inbox"),
    `New message the Inbox can start a chat with, with a version for WhatsApp, email and text wherever its kind may go (an offer never by text): ${words}`,
  );
});
