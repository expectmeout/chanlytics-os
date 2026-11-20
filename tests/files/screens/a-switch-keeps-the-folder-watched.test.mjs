/**
 * Switching folders (the footage sources plan, P5; the canvas's Confirm 11 and 5): a workspace watches one folder, so a
 * switch is one ask of the edge with `instead` (apps/dashboard/src/server/files/sources.ts watchSourceFolder), which
 * opens the new folder and reads its place before it stops the one watched today (apps/edge/lib/files/sources/watch.ts;
 * held by tests/files/sources/a-drive-is-connected.test.mjs). One the account cannot open, or one gone since it was
 * chosen, is said in the folder's own words and costs nothing.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { CONNECTION, OWNER, SOURCE, T, sourceRow } from "../sources/_world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.VERCEL_ENV;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/** The edge's sources door: what a watch answers here, and every ask it was sent, in order. */
const edge = { watch: "ok", asked: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/sources")) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? "{}"));
  edge.asked.push({ op: body.op, instead: body.instead ?? false });
  const answer = (status, said) =>
    new Response(JSON.stringify(said), { status, headers: { "content-type": "application/json" } });
  if (body.op === "watch")
    return edge.watch === "ok"
      ? answer(200, { ok: true, source_id: "new-source", made: true })
      : answer(404, { ok: false, error: "not_found", reason: edge.watch });
  return answer(400, { ok: false, error: "bad_request" });
};
after(() => {
  globalThis.fetch = realFetch;
});

const { watchSourceFolder } = await import(at("apps/dashboard/src/server/files/sources.ts"));

beforeEach(() => Object.assign(edge, { watch: "ok", asked: [] }));

const ctx = () => ({
  supabase: fakeDb(
    {
      source_connections: [
        rows.sourceConnection({
          id: CONNECTION,
          tenant_id: T,
          provider_account: "google-sub-1",
          email: "owner@example.com",
          connected_by: OWNER,
          credentials_ref: `source-creds-${CONNECTION}`,
        }),
      ],
      media_sources: [sourceRow({ id: SOURCE, folder_id: "salon", folder_name: "Salon clips", state: "watching" })],
    },
    {},
    {},
  ),
  userId: OWNER,
  email: "owner@example.com",
  params: {},
});
const member = { tenantId: T, role: "owner", userId: OWNER };
const ask = { folder_id: "winter", include_subfolders: true, instead: true };

test("a switch is ONE ask of the edge, which opens the new folder before it stops the old (review finding 4)", async () => {
  assert.deepEqual(await watchSourceFolder(ctx(), member, ask), { source_id: "new-source" });
  assert.deepEqual(edge.asked, [{ op: "watch", instead: true }]);
});

test("a new folder the account cannot open is said in the folder's own words: the edge stopped nothing", async () => {
  for (const reason of ["no_access", "not_found"]) {
    edge.asked = [];
    edge.watch = reason;
    await assert.rejects(watchSourceFolder(ctx(), member, ask), (failure) => {
      assert.equal(failure.code, "forbidden", reason);
      assert.match(failure.message, /^That folder can't be opened any more, so nothing is watched\./);
      return true;
    });
    assert.deepEqual(edge.asked, [{ op: "watch", instead: true }], `${reason}: one ask, nothing stopped here`);
  }
});

test("a folder gone between choosing it and the press is said as the folder's, never as a bare not-found", async () => {
  edge.watch = "not_found";
  await assert.rejects(watchSourceFolder(ctx(), member, { ...ask, instead: false }), (failure) => {
    assert.equal(failure.code, "forbidden");
    assert.doesNotMatch(failure.message, /isn't there any more/);
    return true;
  });
});
