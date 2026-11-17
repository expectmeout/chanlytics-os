/**
 * A queued send that meets Stop everything at the door (outbound_send, core sendQueued). What the door HELD (a message a
 * sequence sends one person) is given back and comes back a while on, as the same job with the same payload, until
 * sending is resumed or its own time passes: nothing fails, nobody is told, and it spends none of its bounded tries. A
 * reply the door canceled for the stop is somebody waiting: its thread is handed to a person, in the stop's own words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PURPOSE_REFUSALS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const core = await importSrc("packages/core/src/messages/index.ts");
const NOW = Date.parse("2026-11-13T15:00:00Z");
// The stop's own wait before a held send is looked at again, and the longest a send is held with no last moment of its own.
const STOP_WAIT_MS = 5 * 60_000;
const HELD_AT_MOST_MS = 24 * 3_600_000;

/** The queued send's ports, each call kept in order; the door answers what the case says. */
function portsWith(door) {
  const calls = [];
  const kept =
    (name, answer) =>
    async (...args) => {
      calls.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  return {
    calls,
    ports: {
      queued: async () => ({ status: "queued", body: "See you at 3", channel: "whatsapp", sender: "ai" }),
      purposeOf: async () => "conversational",
      claim: async () => true,
      release: kept("release"),
      deliver: kept("deliver", door),
      openHold: async () => null,
      escalate: kept("escalate", "opened"),
      alert: kept("alert"),
      page: kept("page"),
      retry: kept("retry"),
      now: () => NOW,
      random: () => 0,
    },
  };
}
const job = (payload = {}) => ({
  tenantId: "t1",
  payload: { message_id: "m1", conversation_id: "c1", to_phone: "+13475550101", body: "See you at 3", ...payload },
});
const namesOf = (calls) => calls.map((c) => c[0]);

test("a send Stop everything holds is given back and looked at again a while on, as it was: nothing fails and nobody is told", async () => {
  const held = { outcome: "refused", reason: "stopped", messageId: "m1", held: true };
  const { ports, calls } = portsWith(held);
  const lastMoment = new Date(NOW + 3_600_000).toISOString();
  const asked = job({ proactive: true, resumes: 1, stale_after: lastMoment });
  await core.sendQueued(ports, asked);
  assert.deepEqual(namesOf(calls), ["deliver", "release", "retry"]);
  assert.deepEqual(calls[1], ["release", "m1"], "the claim is given back: the next job takes it");
  const [, at, payload] = calls[2];
  assert.equal(at.getTime(), NOW + STOP_WAIT_MS, "looked at again after the stop's own wait");
  assert.deepEqual(payload, asked.payload, "the same job: a stop spends none of a send's bounded tries");
});

test("a held send that names no last moment is given one, a day on: a stop never keeps a message waiting for ever", async () => {
  const held = { outcome: "refused", reason: "stopped", messageId: "m1", held: true };
  const { ports, calls } = portsWith(held);
  const asked = job({ proactive: true });
  await core.sendQueued(ports, asked);
  const [, , payload] = calls.find((c) => c[0] === "retry");
  assert.deepEqual(payload, { ...asked.payload, stale_after: new Date(NOW + HELD_AT_MOST_MS).toISOString() });
});

test("a reply the door canceled for the stop is handed to a person, in the stop's words: someone is waiting for it", async () => {
  const canceled = { outcome: "refused", reason: "stopped", messageId: "m1" };
  const { ports, calls } = portsWith(canceled);
  await core.sendQueued(ports, job());
  assert.deepEqual(namesOf(calls), ["deliver", "escalate"]);
  assert.deepEqual(calls[1], ["escalate", "c1", "stale", PURPOSE_REFUSALS.stopped]);
});

test("a cold email the door canceled for the stop is its clock's to plan again: no thread is handed to anybody", async () => {
  const canceled = { outcome: "refused", reason: "stopped", messageId: "m1" };
  const { ports, calls } = portsWith(canceled);
  await core.sendQueued(ports, job({ purpose: "outreach", proactive: true }));
  assert.deepEqual(namesOf(calls), ["deliver"]);
});
