/**
 * The voice path's send door.
 *
 * The WhatsApp receptionist enforces consent, pause, reply-mode and a rate cap
 * as statement order across one long handler, which holds because every inbound
 * message walks that path. The VOICE path is a second sender — a caller asks the
 * phone agent to text them a booking link — and it was assembled by hand: it
 * checked consent and stopped.
 *
 * So a booking link would land in a thread a human had taken over, which is the
 * precise interruption pause exists to prevent and which the customer cannot
 * tell apart from the person they are already talking to; it kept sending after
 * a workspace switched its receptionist to 'ask'; and nothing capped it, so a
 * caller who phoned repeatedly got one billable template per attempt.
 *
 * AND IT ASKED HALF THE CONSENT QUESTION. The gate took a single `optedOut`
 * boolean, so after 00095 split consent into two answers this path was back to a
 * bar of its own -- the under-blocking half of the defect that migration names.
 * It now takes the person's consent row and the message's PURPOSE and asks
 * `mayMessageFor`, the same predicate the broadcast wire asks, which also lets it
 * tell apart the two sends that used to look identical to it:
 *
 *   the caller's OWN number   answering somebody who just phoned in -- not
 *                             proactive, so no prior opt-in is needed, which is
 *                             what makes the feature work for a first-time caller
 *   a THIRD party's number    a number merely spoken aloud, starting a
 *                             conversation with somebody who asked for nothing
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { outboundGate, refusalScript } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/outbound-gate.ts")).href
);

const NOW = 1_800_000_000_000;
/** Nobody has been asked anything: the state every first-time caller is in. */
const NEVER_ASKED = { consent: "unknown", dnc: false, marketing_consent: "unknown" };
/** A caller asking for their own link, on an ordinary thread. */
const base = {
  contact: NEVER_ASKED,
  purpose: "conversational",
  proactive: false,
  pausedUntilMs: null,
  replyMode: "auto",
  bookingHeld: false,
  sentToday: 0,
  dailyCap: 3,
  nowMs: NOW,
};
const gate = (over) => outboundGate({ ...base, ...over });
/** The old shape's one knob, in the two ways a person can be stopped. */
const stopped = { consent: "opted_out", dnc: false, marketing_consent: "unknown" };
const doNotContact = { consent: "unknown", dnc: true, marketing_consent: "opted_in" };

test("the ordinary case sends", () => {
  const d = gate({});
  assert.equal(d.allowed, true);
  assert.equal(d.refusal, null);
});

test("consent outranks a caller asking out loud", () => {
  // Someone who said stop said stop, whatever channel they said it on — asking
  // on the phone is not a fresh opt-in. Both ways of being stopped, because
  // `dnc` is the operator's override and outranks even a recorded yes to offers.
  for (const contact of [stopped, doNotContact]) {
    const d = gate({ contact });
    assert.equal(d.allowed, false);
    assert.equal(d.refusal, "opted_out");
  }
});

test("a first-time caller's own link is not blocked by never having been asked", () => {
  // THE FEATURE. A stranger phones, asks to be texted the booking link, and has
  // no consent on record because nobody has ever asked them. Answering the person
  // on the line is not a proactive send, so this must go out — reading it as one
  // would refuse every first-time caller, which is the over-block 00095 exists to
  // remove arriving in a new place.
  assert.equal(gate({ contact: NEVER_ASKED, proactive: false }).allowed, true);
});

test("a THIRD party spoken aloud needs their own recorded yes", () => {
  // The hole the single `optedOut` boolean could not see. A caller reads out
  // somebody else's number; that person asked for nothing.
  assert.equal(gate({ proactive: true }).refusal, "not_opted_in");
  assert.equal(
    gate({ proactive: true, contact: { consent: "opted_in", dnc: false, marketing_consent: "unknown" } }).allowed,
    true,
    "a third party who HAS said yes to messages may be texted",
  );
});

test("a promotional message needs the offers answer, on either kind of send", () => {
  // The purpose is the message's, not the direction's. A yes to conversation is
  // not a yes to offers (error 30913), and it is refused with the reason that
  // says which yes was missing.
  const saidYesToMessages = { consent: "opted_in", dnc: false, marketing_consent: "unknown" };
  assert.equal(gate({ purpose: "marketing", contact: saidYesToMessages }).refusal, "no_marketing_consent");
  assert.equal(
    gate({ purpose: "marketing", contact: { ...saidYesToMessages, marketing_consent: "opted_in" } }).allowed,
    true,
  );
});

test("marketing FAILS CLOSED on a row that never projected the column", () => {
  // consent.ts's stated asymmetry, pinned here because this gate is the one that
  // reads a row assembled by a resolver rather than selected for the send.
  assert.equal(
    gate({ purpose: "marketing", contact: { consent: "opted_in", dnc: false } }).refusal,
    "no_marketing_consent",
  );
  assert.equal(
    gate({ purpose: "conversational", contact: { consent: "opted_in", dnc: false } }).allowed,
    true,
    "and a missing column never silences a reply",
  );
});

test("REGRESSION: a thread a human has taken over is not texted over", () => {
  const d = gate({ pausedUntilMs: NOW + 60_000 });
  assert.equal(d.allowed, false);
  assert.equal(d.refusal, "human_has_it");
});

test("an EXPIRED pause does not block — the human is done", () => {
  const d = gate({ pausedUntilMs: NOW - 1 });
  assert.equal(d.allowed, true);
});

test("REGRESSION: 'ask' mode silences this sender too", () => {
  // A send triggered from a phone call is no less automatic for having been
  // requested out loud. The workspace turned automation off.
  for (const mode of ["ask", "off", "never", ""]) {
    assert.equal(gate({ replyMode: mode }).refusal, "policy_hold", `mode ${mode}`);
  }
});

test("REGRESSION: repeated calls cannot send unlimited templates", () => {
  assert.equal(gate({ sentToday: 2 }).allowed, true, "under the cap");
  assert.equal(gate({ sentToday: 3 }).refusal, "daily_cap", "at the cap");
  assert.equal(gate({ sentToday: 9 }).refusal, "daily_cap", "past it");
});

test("the workspace that confirms its own bookings does not have its link sent for it", () => {
  // Autonomy -> Booking -> "Ask me first". The text receptionist has obeyed this
  // row since it existed: layerTwo takes the booking link back out of the
  // reply and hands the thread to a person. This sender read the REPLY row
  // instead, so one workspace's two receptionists answered the same request
  // differently -- the phone agent texting the link the WhatsApp agent had just
  // been stopped from sending.
  assert.equal(gate({ bookingHeld: true }).refusal, "booking_needs_a_person");
  assert.equal(
    gate({ bookingHeld: true, replyMode: "auto" }).refusal,
    "booking_needs_a_person",
    "REGRESSION: a free reply dial is not permission to book",
  );
  assert.equal(gate({ bookingHeld: true, replyMode: "veto" }).refusal, "booking_needs_a_person");
  // It is the workspace's own answer about bookings, so it outranks the generic
  // "automation is off" and is reported as itself: the caller is owed the true
  // reason, which is that a person will confirm.
  const said = refusalScript("booking_needs_a_person", "(646) 932-5775");
  assert.match(said, /confirm/i);
  assert.match(said, /name/i, "the agent is told to take the caller's name, as the prompt says");
});

test("consent is reported before every other refusal", () => {
  // All four conditions at once. The reason is logged and shapes what the agent
  // says, so the ordering has to be the one an operator would expect.
  const d = gate({ contact: stopped, pausedUntilMs: NOW + 1, replyMode: "ask", sentToday: 99 });
  assert.equal(d.refusal, "opted_out");
});

/* --------------------------- what the caller hears ------------------------ */

test("no refusal leaks our internal state to the caller", () => {
  // The agent SPEAKS these. A caller must not be told a colleague is mid-thread
  // with them, nor hear the words for our policy machinery.
  for (const r of [
    "opted_out",
    "not_opted_in",
    "no_marketing_consent",
    "human_has_it",
    "policy_hold",
    "booking_needs_a_person",
    "daily_cap",
  ]) {
    const said = refusalScript(r, "(646) 932-5775");
    assert.ok(said.length > 20, `${r} must say something useful`);
    assert.doesNotMatch(said, /paused|policy_hold|opted_out|daily_cap|rate cap|tenant/i, r);
  }
});

test("every refusal offers the caller a way forward", () => {
  for (const r of [
    "opted_out",
    "not_opted_in",
    "no_marketing_consent",
    "human_has_it",
    "policy_hold",
    "booking_needs_a_person",
    "daily_cap",
  ]) {
    assert.match(
      refusalScript(r, "(646) 932-5775"),
      /offer|tell the caller|book/i,
      `${r} must name an alternative — the caller is waiting on the line`,
    );
  }
});

test("every refusal a caller can hear calls the booking link a WhatsApp message, never a text", () => {
  // send_booking_link sends one thing: a WhatsApp template. retell-fn.ts
  // delivers it on channel "whatsapp", and texting is not sold
  // (capabilities.ts). These sentences called it a text, which it never is.
  //
  // Two refusals keep the word, because in neither is it this tool's message.
  // booking_needs_a_person says a PERSON will call or text to confirm, the
  // prompt's own sentence (contracts policyRules). sms_carries_no_promotions
  // is the texting line's refusal, which a WhatsApp send never meets: the
  // door refuses it on channel "sms" only (core deliver).
  const heard = (r) => [refusalScript(r, "(646) 932-5775"), refusalScript(r, null)];
  const whatsapp = [
    "opted_out",
    "not_opted_in",
    "no_marketing_consent",
    "paused",
    "human_has_it",
    "policy_hold",
    "daily_cap",
  ];
  assert.deepEqual(
    whatsapp.filter((r) => heard(r).some((said) => /\btext/i.test(said))),
    [],
    "not one calls it a text",
  );
  assert.deepEqual(
    whatsapp.filter((r) => !heard(r).every((said) => said.includes("WhatsApp"))),
    [],
    "and each says WhatsApp",
  );
});

test("veto is not off: the booking link a caller just asked for goes out", () => {
  // Veto holds a reply the receptionist COMPOSED so a person can redirect it.
  // A template the caller requested has nothing to redirect, and refusing it
  // silently punished the workspaces that chose the middle setting.
  assert.equal(gate({ replyMode: "veto" }).allowed, true);
  assert.equal(gate({ replyMode: "auto" }).allowed, true);
  assert.equal(gate({ replyMode: "never" }).refusal, "policy_hold", "a person set to Never is still refused");
});
