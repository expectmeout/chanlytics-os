/**
 * Where a visit came from (00426 appointments_lead_stamp, canvas B's loop): the record's row names the lead its person was
 * made from, the board carries it on the visit's mark (a booking's and a feed event's alike), and the visit's sheet says
 * the sequence and the email that wrote to them before they booked, as a door to the lead (visitOriginOf).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { feedMarksOf, itemOfAppointment, leadsRoute, markOn, visitOriginOf } from "@chanlytics/contracts";

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-16T14:00:00Z");

const row = (over = {}) => ({
  id: "appt-1",
  tool: "Booksy",
  status: "booked",
  starts_at: "2026-10-20T14:00:00Z",
  ends_at: "2026-10-20T15:00:00Z",
  all_day: false,
  title: null,
  service: "Consultation",
  staff: null,
  price: null,
  note: null,
  client_name: "Maya Ortiz",
  client_phone: null,
  client_email: null,
  contact_id: "contact-1",
  lead_id: "lead-1",
  ...over,
});

test("the visit's mark carries the lead its person was made from: a booking's row, and a feed event's", () => {
  assert.equal(itemOfAppointment(row(), []).visit.lead_id, "lead-1");
  assert.equal("lead_id" in itemOfAppointment(row({ lead_id: null }), []).visit, false);
  const start = Date.parse("2026-10-20T14:00:00Z");
  const marks = feedMarksOf([
    { id: "appt-2", status: "booked", external_id: "evt-1", starts_at: "2026-10-20T14:00:00Z", lead_id: "lead-2" },
  ]);
  assert.deepEqual(markOn(marks, { uid: "evt-1", start }), {
    id: "appt-2",
    status: "booked",
    lead_id: "lead-2",
  });
});

const send = (n, sentAt, over = {}) => ({
  id: `send-${n}`,
  n,
  hand: null,
  state: "sent",
  reason: null,
  send_at: sentAt,
  sent_at: sentAt,
  angle: null,
  host: null,
  message_id: null,
  email_status: null,
  bounced: false,
  ...over,
});

const story = (over = {}) => ({
  lead_id: "lead-1",
  business_name: "Luxe Lane Salon",
  chain: { root_id: "root-1", name: "Salon owners · Queens", state: "running" },
  search: { id: "search-1", name: "Salons in Queens", asked: null, fit: null },
  sends: [send(0, "2026-10-08T13:10:00Z"), send(1, "2026-10-12T13:10:00Z"), send(2, null, { state: "planned" })],
  ...over,
});

test("the sheet says the sequence and the last email it sent them, and opens the lead", () => {
  const o = visitOriginOf(story(), TZ, NOW);
  assert.equal(o.label, "Came from");
  assert.match(o.text, /^“Salon owners · Queens” · email 2 on /);
  assert.equal(o.route, leadsRoute({ peek: "lead-1", searchId: "search-1" }));
});

test("with nothing sent yet, the sequence alone; with no sequence, the search they were found in", () => {
  assert.equal(visitOriginOf(story({ sends: [] }), TZ, NOW).text, "“Salon owners · Queens”");
  assert.equal(visitOriginOf(story({ chain: null }), TZ, NOW).text, "A lead found in “Salons in Queens”");
  assert.equal(visitOriginOf(story({ chain: null, search: null }), TZ, NOW).text, "Luxe Lane Salon, a lead");
  // A call or a note for the team is no email: the last email is what is said.
  const handed = story({ sends: [send(0, "2026-10-08T13:10:00Z"), send(1, "2026-10-12T13:10:00Z", { hand: "call" })] });
  assert.match(visitOriginOf(handed, TZ, NOW).text, /email 1 on /);
});
