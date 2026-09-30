/**
 * `tenantDb(db, tenantId)` (packages/db/src/tenant-db.ts): a service-role client that cannot forget whose rows it
 * reads. The service role skips row-level security, so a statement on a workspace's table was scoped only by the
 * `.eq("tenant_id", …)` its author remembered; through `tenantDb` every select, update and delete is filtered by the
 * workspace before the caller adds anything, and every row written is stamped with it or refused.
 *
 * Run over the fake database, which has two workspaces' rows in each table: the statement that reached another
 * workspace's row by an id alone is the one this holds shut.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const { tenantDb, platformWide } = await importSrc("packages/db/src/tenant-db.ts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function world() {
  return fakeDb({
    calls: [
      { id: "call-a", tenant_id: A, retell_call_id: "call_a0000001", status: "ongoing" },
      { id: "call-b", tenant_id: B, retell_call_id: "call_b0000001", status: "ongoing" },
    ],
    lines: [
      { id: "line-a", tenant_id: A, voice_state: "provisioning" },
      { id: "line-b", tenant_id: B, voice_state: "provisioning" },
    ],
  });
}

test("a read by an id alone finds only the workspace's own row: another workspace's id is a row that is not there", async () => {
  const db = world();
  const mine = await tenantDb(db, A).from("calls").select("id").eq("retell_call_id", "call_a0000001").maybeSingle();
  assert.equal(mine.data.id, "call-a");
  const theirs = await tenantDb(db, A).from("calls").select("id").eq("retell_call_id", "call_b0000001").maybeSingle();
  assert.equal(theirs.data, null, "B's call, asked for by its own id, is not A's to read");
  // The same statement on the bare client is the one this replaces: it reads B's row.
  const bare = await db.from("calls").select("id").eq("retell_call_id", "call_b0000001").maybeSingle();
  assert.equal(bare.data.id, "call-b");
});

test("an update and a delete reach only the workspace's own rows, whatever id they are given", async () => {
  const db = world();
  await tenantDb(db, A).from("lines").update({ voice_state: "failed" }).eq("id", "line-b");
  assert.equal(
    (await db.from("lines").select("voice_state").eq("id", "line-b").maybeSingle()).data.voice_state,
    "provisioning",
    "B's line was not touched by A's statement",
  );
  await tenantDb(db, A).from("lines").update({ voice_state: "failed" }).eq("id", "line-a");
  assert.equal(
    (await db.from("lines").select("voice_state").eq("id", "line-a").maybeSingle()).data.voice_state,
    "failed",
  );
  await tenantDb(db, A).from("calls").delete().eq("id", "call-b");
  assert.equal((await db.from("calls").select("id")).data.length, 2, "B's call was not deleted by A's statement");
  await tenantDb(db, A).from("calls").delete().eq("id", "call-a");
  assert.deepEqual(
    (await db.from("calls").select("id")).data.map((r) => r.id),
    ["call-b"],
  );
});

test("a row written is stamped with the workspace, and a row that names another is refused before it is sent", async () => {
  const db = world();
  await tenantDb(db, A).from("calls").insert({ id: "call-a2", retell_call_id: "call_a0000002", status: "ongoing" });
  assert.equal((await db.from("calls").select("tenant_id").eq("id", "call-a2").maybeSingle()).data.tenant_id, A);
  await tenantDb(db, A)
    .from("calls")
    .insert([{ id: "call-a3", retell_call_id: "call_a0000003", tenant_id: A }]);
  assert.equal((await db.from("calls").select("id").eq("tenant_id", A)).data.length, 3);
  assert.throws(
    () => tenantDb(db, A).from("calls").insert({ id: "call-x", retell_call_id: "call_x", tenant_id: B }),
    /names another workspace/,
  );
  assert.throws(
    () =>
      tenantDb(db, A)
        .from("calls")
        .upsert([{ id: "call-y", tenant_id: B }], { onConflict: "tenant_id,id" }),
    /names another workspace/,
  );
  assert.equal((await db.from("calls").select("id").eq("tenant_id", B)).data.length, 1, "nothing landed in B");
});

test("an upsert conflicts on the workspace as well as the row, and a patch cannot move a row to another workspace", async () => {
  const db = world();
  for (const options of [undefined, {}, { onConflict: "id" }, { onConflict: "retell_call_id" }])
    assert.throws(
      () => tenantDb(db, A).from("calls").upsert({ id: "call-b", retell_call_id: "call_b0000001" }, options),
      /conflict on tenant_id/,
      JSON.stringify(options),
    );
  await tenantDb(db, A).from("calls").upsert({ id: "call-a", status: "ended" }, { onConflict: "tenant_id,id" });
  await tenantDb(db, A).from("calls").upsert({ id: "call-a9", status: "ended" }, { onConflict: "id, tenant_id" });
  assert.throws(
    () => tenantDb(db, A).from("lines").update({ tenant_id: B }).eq("id", "line-a"),
    /names another workspace/,
    "a patch that moves the row is refused",
  );
  await tenantDb(db, A).from("lines").update({ tenant_id: A, voice_state: "failed" }).eq("id", "line-a");
  assert.equal(
    (await db.from("lines").select("voice_state").eq("id", "line-a").maybeSingle()).data.voice_state,
    "failed",
  );
  assert.equal((await db.from("lines").select("id").eq("tenant_id", B)).data.length, 1, "B still holds its line");
});

test("a workspace is required, and the platform-wide door hands back the client as it is, said at the call", () => {
  const db = world();
  assert.throws(() => tenantDb(db, ""), /workspace is required/);
  assert.equal(platformWide(db), db);
});
