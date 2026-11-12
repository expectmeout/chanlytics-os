/**
 * Undo of a delete (00616, the content redesign's stage 3): DELETE files/[id] hides the file, and for ten minutes POST
 * files/[id]/restore brings it back, through the database's own doors (file_remove, file_restore) on the member's session.
 * A file whose bytes have begun to go is said to be gone, in words, and whoever may not delete may not bring one back.
 * What the doors do in the database (the purge ten minutes on, canceled by the restore) is the database suite's
 * (content/a-delete-waits-for-undo.db.test.mjs).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FILE_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const one = await import(at("apps/dashboard/app/api/v1/files/[id]/route.ts"));
const restore = await import(at("apps/dashboard/app/api/v1/files/[id]/restore/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F = "ffffffff-0000-4000-8000-000000000001";
const USER = "11111111-1111-4111-8111-111111111111";
const inA = `?workspace=${A}`;

const fileRow = (over = {}) => ({
  id: F,
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: "storefront-dusk",
  mime: "image/jpeg",
  kind: "image",
  bytes: 1000,
  width: 1600,
  height: 1200,
  look: null,
  look_status: "done",
  shows: "storefront",
  who_in_it: "no_one",
  removed_at: null,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
  ...over,
});

/** A member's session over one file, and the two doors as the database keeps them: the purge waits until restored or due. */
function world({ role = "owner", purgeBegun = false } = {}) {
  const files = [fileRow()];
  const asked = [];
  const supabase = fakeDb(
    {
      memberships: [
        { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
      ],
      files,
    },
    {},
    {
      file_remove: ({ p_tenant_id, p_id }) => {
        asked.push(["remove", p_tenant_id, p_id]);
        files[0].removed_at = new Date().toISOString();
        return null;
      },
      file_restore: ({ p_tenant_id, p_id }) => {
        asked.push(["restore", p_tenant_id, p_id]);
        if (purgeBegun) throw Object.assign(new Error("That file is gone."), { code: "P0002" });
        files[0].removed_at = null;
        return null;
      },
    },
  );
  return { files, asked, ctx: { supabase, userId: USER, email: "ada@example.com", params: { id: F } } };
}
const press = (method) => new Request(`http://localhost/api/v1/x${inA}`, { method });

test("a deleted file comes back with Undo, by its id, though no read of it finds it while it is deleted", async () => {
  const w = world();
  assert.deepEqual(await one.DELETE.run(press("DELETE"), w.ctx), { ok: true });
  assert.ok(w.files[0].removed_at, "hidden at the press");
  assert.deepEqual(await restore.POST.run(press("POST"), w.ctx), { ok: true });
  assert.equal(w.files[0].removed_at, null, "shown again");
  assert.deepEqual(
    w.asked.map(([what]) => what),
    ["remove", "restore"],
  );
  assert.deepEqual(w.asked[1], ["restore", A, F], "in this workspace, by the file's own id");
});

test("one whose bytes have begun to go is gone, said in words", async () => {
  const w = world({ purgeBegun: true });
  await assert.rejects(
    restore.POST.run(press("POST"), w.ctx),
    (e) => e.status === 404 && e.message === FILE_WORDS.restoreGone,
  );
});

test("whoever may not delete may not bring one back", async () => {
  const w = world({ role: "operator" });
  await assert.rejects(restore.POST.run(press("POST"), w.ctx), (e) => e.status === 403);
  assert.deepEqual(w.asked, [], "the door is never asked");
});

test("the delete's own words promise the Undo the doors keep", () => {
  assert.equal(FILE_WORDS.removeNote, "You can undo it for ten minutes.");
});
