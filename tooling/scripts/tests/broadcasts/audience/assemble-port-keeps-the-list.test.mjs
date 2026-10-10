/**
 * The dashboard's assemble port hands the run to the one SQL door whole: the list the audience was counted by rides
 * with it (decision 0009, "sends remember"). The core verb put the token, the rule and the moment on the audience
 * (createBroadcast, core-campaigns.test.mjs holds it), and the edge's port passed the audience whole; the dashboard's
 * port rebuilt it from three fields and dropped the list, so a broadcast a person sent forgot what its list meant
 * while a playbook's run remembered (the wiring trace, 5 October 2026). Run over a database in memory standing in as
 * the service client: what reaches the door's p_run is what is asserted.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { createBroadcastPorts } = await import(at("apps/dashboard/src/server/ports/campaign-ports.ts"));
after(() => setServiceClient(null));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const run = (audience) => ({
  name: "A quick note",
  template_id: "t-1",
  template_name: "quick_note",
  template_language: "en_US",
  params: [],
  audience,
  state: "scheduled",
  scheduled_for: "2026-10-07T14:00:00.000Z",
  recipient_count: 0,
  created_by: "u-1",
  channels: ["whatsapp"],
});

test("the list the audience was counted by reaches the door with the run; an audience with none hands none", async () => {
  const doors = [];
  const db = fakeDb(
    { broadcasts: [], broadcast_recipients: [], jobs: [] },
    {},
    {
      // The door with its decision (00373) answers the run's id, and the decision's when one was asked for.
      assemble_broadcast: (args) => {
        doors.push(args);
        return { id: "b-1" };
      },
    },
  );
  setServiceClient(db);
  const ports = createBroadcastPorts({ supabase: db, userId: "u-1" }, T, { fresh: false });

  const list = { token: "list:quiet", rule: { last_heard: { days: 30 } }, counted_at: "2026-10-06T12:00:00.000Z" };
  const made = await ports.assemble(run({ kind: "list", id: "quiet", label: "Quiet 30 days", list }), [], null, null);
  assert.deepEqual(made, { id: "b-1", decisionId: null });
  assert.deepEqual(
    doors[0].p_run.audience,
    { kind: "list", id: "quiet", label: "Quiet 30 days", list },
    "the token, the rule and the moment it was counted ride with the run",
  );
  assert.equal(doors[0].p_run.created_by, "u-1");
  assert.equal(doors[0].p_tenant, T);

  await ports.assemble(run({ kind: "everyone", id: null, label: "Everyone who said yes" }), [], null, null);
  assert.deepEqual(
    doors[1].p_run.audience,
    { kind: "everyone", id: null, label: "Everyone who said yes" },
    "everyone was counted by no list, and none is invented",
  );
});
