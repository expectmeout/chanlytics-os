/**
 * The script that ends the places an erasure left standing (tooling/scripts/ops/erasure/erased-leave-sequences.mjs):
 * which places it takes, which sends it says will be skipped, and what it reports when the door ends fewer than it
 * planned. The leave itself is the database's door (sequence_enrollments_leave), proved on a stack
 * (an-erased-person-leaves-their-sequences.db.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLeaves, planLeaves } from "../../ops/erasure/erased-leave-sequences.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const place = (id, over = {}) => ({
  id,
  tenant_id: T,
  sequence_id: "seq-1",
  lead_id: null,
  contact_id: null,
  state: "in",
  place: 1,
  next_at: null,
  ...over,
});
const send = (id, over = {}) => ({
  id,
  tenant_id: T,
  sequence_id: "seq-1",
  lead_id: null,
  contact_id: null,
  state: "planned",
  ...over,
});
const ids = (rows) => rows.map((r) => r.id);

test("a lead's place leaves when its lead is erased, and only then: not for a lead that stands, nor a place already ended", () => {
  const plan = planLeaves({
    enrollments: [
      place("e-gone", { lead_id: "lead-gone" }),
      place("e-stands", { lead_id: "lead-stands" }),
      place("e-done", { lead_id: "lead-gone", state: "done" }),
      place("e-left", { lead_id: "lead-gone", state: "left" }),
    ],
    erasedLeads: new Set(["lead-gone"]),
    erasedContacts: new Set(),
    sends: [],
  });
  assert.deepEqual(ids(plan.places), ["e-gone"]);
});

test("a customer's place leaves when its person is erased; a lead's place is never judged by a person", () => {
  const plan = planLeaves({
    enrollments: [
      place("e-person", { contact_id: "k-gone" }),
      place("e-other", { contact_id: "k-stands" }),
      // The lead stands (someone else at the business is written to now): its place is the lead's.
      place("e-lead", { lead_id: "lead-stands", contact_id: "k-gone" }),
    ],
    erasedLeads: new Set(),
    erasedContacts: new Set(["k-gone"]),
    sends: [],
  });
  assert.deepEqual(ids(plan.places), ["e-person"]);
});

test("the sends it says will be skipped are the door's own choice: theirs, in that sequence, not yet gone", () => {
  const plan = planLeaves({
    enrollments: [place("e-lead", { lead_id: "lead-gone" }), place("e-person", { contact_id: "k-gone" })],
    erasedLeads: new Set(["lead-gone"]),
    erasedContacts: new Set(["k-gone"]),
    sends: [
      send("s-planned", { lead_id: "lead-gone", contact_id: "k-of-lead" }),
      send("s-held", { lead_id: "lead-gone", state: "held" }),
      send("s-drafted", { lead_id: "lead-gone", state: "drafted" }),
      send("s-sent", { lead_id: "lead-gone", state: "sent" }),
      send("s-claimed", { lead_id: "lead-gone", state: "claimed" }),
      send("s-elsewhere", { lead_id: "lead-gone", sequence_id: "seq-2" }),
      send("s-queued", { contact_id: "k-gone", state: "queued" }),
      // A lead's send that names the erased person is its lead's, not the customer's place's.
      send("s-leads", { lead_id: "lead-stands", contact_id: "k-gone" }),
      send("s-other-workspace", { tenant_id: T2, contact_id: "k-gone", state: "queued" }),
    ],
  });
  assert.deepEqual(ids(plan.sends).sort(), ["s-drafted", "s-held", "s-planned", "s-queued"]);
});

test("the places go to the door a workspace at a time, and one that ended fewer than planned is said", async () => {
  const plan = planLeaves({
    enrollments: [
      place("e-1", { lead_id: "lead-1" }),
      place("e-2", { lead_id: "lead-2" }),
      place("e-3", { tenant_id: T2, contact_id: "k-3" }),
    ],
    erasedLeads: new Set(["lead-1", "lead-2"]),
    erasedContacts: new Set(["k-3"]),
    sends: [],
  });
  const asked = [];
  const out = await applyLeaves(plan, async (p) => {
    asked.push(p);
    // The second workspace's place ended meanwhile: the door finds nobody still in.
    return p.tenantId === T ? 2 : 0;
  });
  assert.deepEqual(asked, [
    { tenantId: T, enrollmentIds: ["e-1", "e-2"], why: "erased" },
    { tenantId: T2, enrollmentIds: ["e-3"], why: "erased" },
  ]);
  assert.equal(out.left, 2);
  assert.deepEqual(out.short, [{ tenant_id: T2, planned: 1, left: 0 }]);
});

test("nothing to end asks the door nothing", async () => {
  const plan = planLeaves({ enrollments: [], erasedLeads: new Set(), erasedContacts: new Set(), sends: [] });
  const out = await applyLeaves(plan, async () => assert.fail("the door was asked"));
  assert.deepEqual(out, { left: 0, short: [] });
});
