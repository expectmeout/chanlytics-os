/**
 * Opt-out, at the layers a unit test can reach.
 *
 * The defect this covers was not a wrong branch — it was an ABSENT one:
 * consent was written by ingest since 00002 and read by nothing, so texting
 * STOP recorded the opt-out and got an AI reply in the same request. Tests
 * that assert a branch works would not have caught that; these assert the
 * classification and the view-model boundary, and the integration test asserts
 * the database half.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPT_IN_PATTERN,
  OPT_OUT_PATTERN,
  ESCALATION_REASON_LABELS,
  isOptedOut,
  toInboxThreadVM,
} from "@chanlytics/contracts";
import { normalizeInbound } from "@chanlytics/channels";

/* ------------------------------ classification ----------------------------- */

const wa = (body) => normalizeInbound(
  { from: "13475550101", id: "wamid.1", type: "text", text: { body } },
  { contacts: [{ wa_id: "13475550101", profile: { name: "Dana" } }] },
);

test("the opt-out words are recognised, in both languages", () => {
  for (const w of ["STOP", "stop", " Stop ", "stop.", "BAJA", "unsubscribe", "alto"]) {
    assert.equal(wa(w).optOut, true, `"${w}" must opt out`);
  }
});

test("an ordinary message is not an opt-out", () => {
  // The pattern is anchored for a reason: "stop by at 4?" is a booking, and
  // silencing that customer forever would be the worse failure.
  for (const w of ["can you stop by at 4?", "please stop the appointment reminders for now", "nonstop"]) {
    assert.equal(wa(w).optOut, false, `"${w}" must NOT opt out`);
  }
});

test("only an explicit word opts back in", () => {
  for (const w of ["START", "start", "alta", "unstop", "YES OFFERS", "yes offers", "Sí ofertas!", "si ofertas"]) assert.equal(wa(w).optIn, true, w);
  // If any message lifted the block, the block would not exist.
  for (const w of ["hi", "sí", "yes", "start my appointment at 3", "yes offers please", "offers"]) {
    assert.equal(wa(w).optIn, false, `"${w}" must NOT opt back in`);
  }
});

test("opt-out and opt-in cannot both be true", () => {
  for (const w of ["stop", "start", "hello"]) {
    const n = wa(w);
    assert.ok(!(n.optOut && n.optIn), `"${w}" classified as both`);
  }
});

test("a photo is never an opt-out", () => {
  // The pattern only ever sees text; a caption reading "stop" on an image must
  // not silence anyone, because the caption is not the message.
  const n = normalizeInbound(
    { from: "13475550101", id: "wamid.2", type: "image", image: { id: "m1", caption: "stop" } },
    { contacts: [] },
  );
  assert.equal(n.optOut, false);
  assert.equal(n.optIn, false);
});

/* ------------------------------ the boundary ------------------------------- */

const conv = (contact) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  last_wa_inbound_at: new Date().toISOString(),
  last_message_at: new Date().toISOString(),
  contact: { id: "k1", display_name: "Dana", wa_profile_name: null, phone_e164: "+13475550101", ...contact },
  messages: [{
    id: "m1", direction: "inbound", sender: "customer", type: "text", body: "stop",
    media: null, meta: null, status: "received", created_at: new Date().toISOString(),
  }],
});

test("either column alone blocks — consent and dnc are independent", () => {
  assert.equal(isOptedOut(conv({ consent: "opted_out", dnc: false })), true, "consent alone");
  assert.equal(isOptedOut(conv({ consent: "opted_in", dnc: true })), true, "dnc alone (operator override)");
  assert.equal(isOptedOut(conv({ consent: "opted_in", dnc: false })), false);
  assert.equal(isOptedOut(conv({ consent: "unknown", dnc: false })), false);
});

test("a payload with no consent fields is not treated as opted out", () => {
  // Absence means "nothing on record". Reading it as a block would silence
  // every contact the moment a caller forgot to select the columns.
  assert.equal(isOptedOut(conv({})), false);
  assert.equal(isOptedOut(conv({ consent: null, dnc: null })), false);
});

test("the thread view model carries the block to the composer", () => {
  // Without this the composer offers a Send button whose only outcome is a
  // rejection from the API — the operator types a reply and loses it.
  assert.equal(toInboxThreadVM(conv({ consent: "opted_out", dnc: true }), new Date()).optedOut, true);
  assert.equal(toInboxThreadVM(conv({ consent: "opted_in", dnc: false }), new Date()).optedOut, false);
});

test("the opt-out escalation reason has a human label", () => {
  // An unlabelled reason renders as the raw enum in Needs You.
  assert.equal(typeof ESCALATION_REASON_LABELS.opt_out, "string");
  assert.notEqual(ESCALATION_REASON_LABELS.opt_out, "opt_out");
});

/* --------------------------- the patterns themselves ----------------------- */

test("the patterns are anchored and case-insensitive", () => {
  for (const p of [OPT_OUT_PATTERN, OPT_IN_PATTERN]) {
    assert.match(p.source, /^\^/, "must be anchored at the start");
    assert.match(p.source, /\$$/, "must be anchored at the end");
    assert.ok(p.flags.includes("i"));
    // A global flag would make .test() stateful across calls — the classic
    // "every other message is an opt-out" bug.
    assert.ok(!p.flags.includes("g"), "must not be global: lastIndex would persist between messages");
  }
});

/* ---- the edge routes on KIND, not on the storage column ---- */
{
  const { readCode } = await import("./_source.mjs");
  const edgeSrc = readCode("apps/edge/api/whatsapp.ts");

  test("a reaction or a system notice ends the request without an ack", () => {
    // The bug this pins: a customer tapping a thumbs-up got "sorry, I can't
    // read that", the receptionist muted itself for 24h, an escalation opened
    // and the owner was emailed. The check must come BEFORE the unreadable
    // branch or it never runs.
    const quiet = edgeSrc.indexOf('n.kind === "reaction"');
    // The condition gained a "not a photo the receptionist looked at" guard
    // in front of it; the branch itself, and its place, are unchanged.
    const unreadable = edgeSrc.indexOf('(n.type !== "text" || !n.body)');
    assert.ok(quiet > -1, "reactions must be handled by kind");
    assert.ok(unreadable > -1, "the unreadable branch must still exist");
    assert.ok(quiet < unreadable, "handle the no-request kinds before the unreadable branch");
  });

  test("a location or contact card escalates WITHOUT the cannot-read apology", () => {
    // Both are legible to a person and normalizeInbound already wrote them as
    // a sentence. Acknowledging them as unreadable tells the customer we did
    // not receive what they plainly sent.
    const at = edgeSrc.indexOf('n.kind === "location"');
    assert.ok(at > -1, "readable non-text kinds must be routed by kind");
    // Bound the slice to THIS branch. A fixed character window runs on into
    // the unreadable branch below, which does send the apology — so the
    // assertion would have been reading the code it exists to rule out.
    const rest = edgeSrc.slice(at);
    const branch = rest.slice(0, rest.indexOf("\n  }") + 4);
    assert.ok(branch.includes("sink.escalate"), "a person has to be told");
    assert.ok(!branch.includes("fallbacks.non_text"), "must not send the unreadable acknowledgement");
    assert.ok(!branch.includes("sink.pause"), "must not mute the receptionist");
  });

  test("a late message is answered or escalated, never dropped in silence", () => {
    // Meta redelivers for days, so any outage longer than the guard turned its
    // whole backlog into customers who wrote and were never answered.
    assert.ok(edgeSrc.includes("STALE_REPLY_MS"), "there must be a horizon past which a person answers");
    const at = edgeSrc.indexOf("ageMs > STALE_REPLY_MS");
    assert.ok(at > -1);
    const branch = edgeSrc.slice(at, at + 700);
    assert.ok(branch.includes('sink.escalate("stale"'), "escalate rather than return quietly");
    assert.ok(branch.includes("alertStaff"), "and tell somebody");
    assert.ok(
      !/wa_skip_stale/.test(edgeSrc),
      "the silent drop must be gone, not merely bypassed",
    );
  });
}
