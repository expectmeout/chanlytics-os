/**
 * The subscriber `occasion_enrol` (decision 0119): an appointment's change, or the booking link sent, is handed to the
 * edge's door, which enrols the person in each sequence that starts on it; every other event is nobody's occasion and
 * asks nothing. The door's own rules are the edge's (apps/edge/lib/campaigns/occasions/enrol.ts); here, what reaches it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENT_SUBSCRIBERS } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { SUBSCRIBERS } = await importSrc("packages/core/src/events/subscribers.ts");

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const MESSAGE = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";

const event = (over = {}) => ({
  id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1",
  tenant_id: TENANT,
  kind: "appointment.changed",
  subject_type: "appointment",
  subject_id: APPT,
  data: { change: "added", source: "receptionist" },
  ...over,
});

/** The one port the subscriber takes: it keeps what it was asked and answers what a test says. */
function door(answer = { enrolled: 1, left: 0 }) {
  const asked = [];
  return {
    asked,
    ports: {
      enrolOccasions: async (tenantId, happened) => {
        asked.push([tenantId, happened]);
        return answer;
      },
    },
  };
}

test("the subscriber is one a delivery can name", () => {
  assert.ok(EVENT_SUBSCRIBERS.includes("occasion_enrol"));
  assert.equal(typeof SUBSCRIBERS.occasion_enrol, "function");
});

test("an appointment's change reaches the door with what changed, whatever the change", async () => {
  for (const change of ["added", "confirmed", "moved", "missed", "kept", "cancelled"]) {
    const { asked, ports } = door();
    await SUBSCRIBERS.occasion_enrol(event({ data: { change } }), ports);
    assert.deepEqual(asked, [[TENANT, { about: "appointment", appointmentId: APPT, change }]], change);
  }
});

test("the booking link sent reaches the door with the message that carried it", async () => {
  const { asked, ports } = door();
  await SUBSCRIBERS.occasion_enrol(
    event({ kind: "booking_link.sent", subject_type: "message", subject_id: MESSAGE, data: { channel: "whatsapp" } }),
    ports,
  );
  assert.deepEqual(asked, [[TENANT, { about: "ask", messageId: MESSAGE }]]);
});

test("an event that is nobody's occasion asks nothing", async () => {
  const { asked, ports } = door();
  await SUBSCRIBERS.occasion_enrol(event({ kind: "member.joined", subject_type: "invitation" }), ports);
  await SUBSCRIBERS.occasion_enrol(event({ subject_id: null }), ports);
  await SUBSCRIBERS.occasion_enrol(event({ data: {} }), ports);
  assert.deepEqual(asked, []);
});

test("a door that cannot be asked throws on, so the delivery tries again", async () => {
  const ports = {
    enrolOccasions: async () => {
      throw new Error("the database did not answer");
    },
  };
  await assert.rejects(() => SUBSCRIBERS.occasion_enrol(event(), ports), /did not answer/);
});
