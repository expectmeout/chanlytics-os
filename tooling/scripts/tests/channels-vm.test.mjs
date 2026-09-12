/**
 * The channel view model, EXECUTED.
 *
 * A channel row says which number, whether it is on, and when a customer last
 * used it. The pane must say exactly that — "receiving", "quiet", "switched
 * off" or "no message yet" — and never a status the schema does not hold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toChannelVM } from "@chanlytics/contracts";

const NOW = new Date("2026-09-04T16:00:00Z");
const nowMs = NOW.getTime();
const iso = (msAgo) => new Date(nowMs - msAgo).toISOString();
const H = 3_600_000, D = 24 * H;

const wa = (over = {}) => ({ id: "ch1", kind: "whatsapp", number_e164: "+17865550181", status: "active", created_at: iso(60 * D), last_inbound_at: iso(2 * H), ...over });

test("a WhatsApp channel with a recent message is receiving, and says when", () => {
  const vm = toChannelVM(wa(), NOW);
  assert.equal(vm.name, "WhatsApp Business");
  assert.equal(vm.icon, "chat");
  assert.equal(vm.on, true);
  assert.equal(vm.health, "receiving");
  assert.equal(vm.healthLabel, "Receiving · last message 2h ago");
  assert.match(vm.number, /81$/);
});

test("quiet after a week, unused when nothing ever arrived, off when disabled — each its own words", () => {
  assert.equal(toChannelVM(wa({ last_inbound_at: iso(9 * D) }), NOW).health, "quiet");
  assert.match(toChannelVM(wa({ last_inbound_at: iso(9 * D) }), NOW).healthLabel, /^Quiet · last message [A-Z][a-z]{2} \d/);
  const unused = toChannelVM(wa({ last_inbound_at: null }), NOW);
  assert.equal(unused.health, "unused");
  assert.equal(unused.healthLabel, "On — no message has arrived yet");
  const off = toChannelVM(wa({ status: "disabled", last_inbound_at: iso(H) }), NOW);
  assert.equal(off.on, false);
  assert.equal(off.health, "off");
  assert.match(off.healthLabel, /^Switched off/);
});

test("a voice channel is the phone line and counts calls, not messages", () => {
  const vm = toChannelVM({ id: "ch2", kind: "voice", number_e164: "+13475550100", status: "active", created_at: iso(10 * D), last_inbound_at: iso(3 * D) }, NOW);
  assert.equal(vm.name, "Phone line");
  assert.equal(vm.icon, "phone");
  assert.equal(vm.healthLabel, "Receiving · last call 3d ago");
});

test("an unknown kind is shown by its name, not dropped and not invented", () => {
  const vm = toChannelVM({ id: "ch3", kind: "carrierpigeon", number_e164: null, status: "active", created_at: iso(D), last_inbound_at: null }, NOW);
  assert.equal(vm.name, "Carrierpigeon");
  assert.equal(vm.number, null);
  assert.equal(vm.health, "unused");
});

test("a switched-off channel says what the code does with what still arrives: a text is dropped and the platform told, a call is picked up without facts", () => {
  const offWa = toChannelVM({ id: "c1", kind: "whatsapp", number_e164: "+19177724072", status: "disabled", created_at: "2026-09-01T00:00:00Z", last_inbound_at: null }, new Date("2026-09-12T12:00:00Z"));
  assert.equal(offWa.healthLabel, "Switched off — messages to it are neither answered nor recorded; Chanlytics is told they are arriving, you are not");
  const offVoice = toChannelVM({ id: "c2", kind: "voice", number_e164: "+13083368109", status: "disabled", created_at: "2026-09-01T00:00:00Z", last_inbound_at: null }, new Date("2026-09-12T12:00:00Z"));
  assert.equal(offVoice.healthLabel, "Switched off — calls are picked up without your facts and are not recorded; Chanlytics is told, you are not");
  const said = toChannelVM({ id: "c3", kind: "whatsapp", number_e164: "+19177724072", status: "active", created_at: "2026-09-01T00:00:00Z", last_inbound_at: null, quality: "RED", quality_event: "FLAGGED", messaging_limit: "TIER_250" }, new Date("2026-09-12T12:00:00Z"));
  assert.deepEqual([said.quality, said.qualityEvent, said.messagingLimit], ["RED", "FLAGGED", "TIER_250"], "what Meta said rides the view model");
});
