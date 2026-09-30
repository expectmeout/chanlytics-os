/**
 * The milestones a workspace passes on its way to being a customer (change 11; category 39, "analytics events"): each is
 * written once per workspace as `workspace.activated`, where it happens. The writer is best effort: a read or a write that
 * fails costs the caller nothing, and a milestone already on the ledger is not written again. Over a database in memory.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { ACTIVATION_MILESTONES } from "@chanlytics/contracts";
import { recordActivation } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { pgSink } = await import(at("apps/edge/lib/whatsapp/persist.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
after(() => setPg(null));

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const kept = (t, tenant) =>
  t.events.filter((e) => e.kind === "workspace.activated" && e.tenant_id === tenant).map((e) => e.data);

test("a milestone is written once per workspace, whoever passes it again, and each workspace has its own", async () => {
  assert.deepEqual([...ACTIVATION_MILESTONES], ["line_live", "first_reply", "first_lead_search"]);
  const t = { events: [] };
  const db = fakeDb(t);
  assert.equal(await recordActivation(db, A, "line_live", "whatsapp"), true, "the first time is written");
  assert.equal(await recordActivation(db, A, "line_live", "voice"), false, "the second is not, by whichever door");
  assert.equal(await recordActivation(db, A, "first_reply", "receptionist"), true, "another milestone is another row");
  assert.equal(await recordActivation(db, B, "line_live", "voice"), true, "another workspace has its own");
  assert.deepEqual(kept(t, A), [
    { milestone: "line_live", via: "whatsapp" },
    { milestone: "first_reply", via: "receptionist" },
  ]);
  assert.deepEqual(kept(t, B), [{ milestone: "line_live", via: "voice" }]);
});

test("a read or a write that fails writes nothing and throws nothing", async () => {
  const lines = [];
  const real = console.error;
  console.error = (...a) => lines.push(a.join(" "));
  try {
    const t = { events: [] };
    assert.equal(
      await recordActivation(fakeDb(t, { "events.select": { message: "down" } }), A, "line_live", "voice"),
      false,
    );
    assert.equal(
      await recordActivation(fakeDb(t, { "events.insert": { message: "down" } }), A, "line_live", "voice"),
      false,
    );
    assert.deepEqual(t.events, []);
  } finally {
    console.error = real;
  }
  assert.equal(lines.length, 2, "each said once");
});

test("the receptionist's first answer to a customer is the second milestone: a held draft is not an answer, and it is written once", async () => {
  const t = { events: [], usage: [], conversations: [] };
  const db = fakeDb(t);
  const sink = pgSink(db, A, { conversation_id: "c1", contact_id: "p1", message_id: "m1" });
  await sink.usage({ input_tokens: 10, output_tokens: 5, held: "veto_window" });
  assert.deepEqual(kept(t, A), [], "a reply waiting for a person has not been sent");
  await sink.usage({ input_tokens: 10, output_tokens: 5 });
  await sink.usage({ input_tokens: 12, output_tokens: 6 });
  assert.deepEqual(kept(t, A), [{ milestone: "first_reply", via: "receptionist" }], "the first answer, once");
});
