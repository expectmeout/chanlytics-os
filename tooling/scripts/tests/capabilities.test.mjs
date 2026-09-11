/**
 * A capability's status is computed from records: readiness from the line,
 * the channel, Meta and the facts; evidence from the last real interaction;
 * activation from the owner's record. Each is separate, and only all three
 * together is "live".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { capabilityStatus, CAPABILITY_KINDS } from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-11T12:00:00Z");
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();

/** A workspace with a line answering, a WhatsApp number connected, facts filled in, nothing activated. */
function dto(over = {}) {
  return {
    business: { name: "Harbor Nails", hours: true, services: 4, bookingLink: true, address: true, handoff: null, broken: false },
    channels: {
      whatsapp: { present: true, active: true, number: "+13055550100", quality: "GREEN", lastInboundAt: ago(2) },
      voice: { present: true, active: true, number: "+13055550101", lastInboundAt: ago(30) },
    },
    templates: { approved: 3, pending: 0, startersApproved: 3 },
    lines: { rows: [{ id: "l1", e164: "+13055550101", kind: "chanlytics", provider: "twilio", voice_state: "answering", sms_state: "rejected", reg_mock: false, step: null, last_error: null, state_since: ago(48), created_at: ago(72) }], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
    activations: [],
    ...over,
  };
}

test("voice: ready and tested but not activated says so, and activating makes it live", () => {
  const s = capabilityStatus("voice", dto(), NOW);
  assert.equal(s.ready, true);
  assert.deepEqual(s.blockers, []);
  assert.equal(s.tested.what, "a call was answered");
  assert.equal(s.activated, null);
  assert.equal(s.live, false);
  assert.match(s.words, /Tested .*Activate it/);
  const live = capabilityStatus("voice", dto({ activations: [{ capability: "voice", activated_at: ago(1), activated_by: "u1", deactivated_at: null }] }), NOW);
  assert.equal(live.live, true);
  assert.match(live.words, /^Active since/);
});

test("a deactivated record is no activation; an activation ahead of the facts is named as such", () => {
  const off = capabilityStatus("voice", dto({ activations: [{ capability: "voice", activated_at: ago(5), activated_by: "u1", deactivated_at: ago(1) }] }), NOW);
  assert.equal(off.activated, null);
  const noFacts = capabilityStatus("voice", dto({ business: { name: null, hours: false, services: 0, bookingLink: false, address: false, handoff: null, broken: false }, activations: [{ capability: "voice", activated_at: ago(5), activated_by: "u1", deactivated_at: null }] }), NOW);
  assert.equal(noFacts.ready, false);
  assert.equal(noFacts.blockers[0].code, "no_business_facts");
  assert.equal(noFacts.live, false, "activated, but the records say no");
  assert.match(noFacts.words, /^Activated, but not ready/);
});

test("voice blockers, in the order the owner meets them", () => {
  const line = (voice_state, step = null) => ({ id: "l1", e164: "+13055550101", kind: "chanlytics", provider: "twilio", voice_state, sms_state: "none", reg_mock: false, step, last_error: null, state_since: ago(1), created_at: ago(1) });
  const noVoice = { present: false, active: false, number: null, lastInboundAt: null };
  assert.equal(capabilityStatus("voice", dto({ channels: { whatsapp: dto().channels.whatsapp, voice: noVoice }, lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1 } } }), NOW).blockers[0].code, "no_line");
  assert.equal(capabilityStatus("voice", dto({ channels: { whatsapp: dto().channels.whatsapp, voice: noVoice }, lines: { rows: [line("provisioning", "trunk")], ready: true, provider: "twilio", costs: { local_number_month_usd: 1 } } }), NOW).blockers[0].code, "line_provisioning");
  assert.equal(capabilityStatus("voice", dto({ channels: { whatsapp: dto().channels.whatsapp, voice: noVoice }, lines: { rows: [line("failed", "agent")], ready: true, provider: "twilio", costs: { local_number_month_usd: 1 } } }), NOW).blockers[0].code, "line_failed");
  assert.equal(capabilityStatus("voice", dto({ channels: { whatsapp: dto().channels.whatsapp, voice: { present: true, active: false, number: "+1", lastInboundAt: null } } }), NOW).blockers[0].code, "channel_off");
  const untested = capabilityStatus("voice", dto({ channels: { whatsapp: dto().channels.whatsapp, voice: { present: true, active: true, number: "+1", lastInboundAt: null } } }), NOW);
  assert.equal(untested.ready, true);
  assert.equal(untested.tested, null);
  assert.match(untested.words, /^Ready\. Try it/);
});

test("whatsapp: Meta's approval is a blocker; a connected-but-off number is another; a message answered is the evidence", () => {
  const waiting = capabilityStatus("whatsapp", dto({ templates: { approved: 0, pending: 2, startersApproved: 0 } }), NOW);
  assert.equal(waiting.ready, false);
  assert.equal(waiting.blockers[0].code, "meta_waiting");
  const off = capabilityStatus("whatsapp", dto({ channels: { voice: dto().channels.voice, whatsapp: { present: true, active: false, number: "+1", quality: null, lastInboundAt: null } } }), NOW);
  assert.equal(off.blockers[0].code, "channel_off");
  const none = capabilityStatus("whatsapp", dto({ channels: { voice: dto().channels.voice, whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null } } }), NOW);
  assert.equal(none.blockers[0].code, "not_connected");
  const ok = capabilityStatus("whatsapp", dto(), NOW);
  assert.equal(ok.ready, true);
  assert.equal(ok.tested.what, "a message was answered");
});

test("texting is honest: not sold until a real registration is approved, and a mock filing does not count", () => {
  const rejected = capabilityStatus("sms", dto(), NOW);
  assert.equal(rejected.ready, false);
  assert.equal(rejected.blockers[0].code, "texting_not_sold");
  const mock = capabilityStatus("sms", dto({ lines: { rows: [{ ...dto().lines.rows[0], sms_state: "active", reg_mock: true }], ready: true, provider: "twilio", costs: { local_number_month_usd: 1 } } }), NOW);
  assert.equal(mock.ready, false, "a rehearsal filing routes nothing");
  const real = capabilityStatus("sms", dto({ lines: { rows: [{ ...dto().lines.rows[0], sms_state: "active", reg_mock: false }], ready: true, provider: "twilio", costs: { local_number_month_usd: 1 } } }), NOW);
  assert.equal(real.ready, true);
  assert.equal(real.tested, null, "no evidence is recorded for texting yet");
});

test("the three kinds are the closed set the table admits", () => {
  assert.deepEqual([...CAPABILITY_KINDS], ["voice", "whatsapp", "sms"]);
});
