/**
 * Ask's thread read tells a thread that is gone from a read that failed.
 *
 * thread() answered null for both, and the palette said "Thread deleted" and
 * dropped the thread from the owner's list whenever a read failed -- a timeout
 * made a conversation vanish, and a refresh brought it back. Gone and failed
 * are different answers now, and the palette says a different sentence for each.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { askApi } = await import(at("apps/dashboard/src/legacy-bridge/ask/api.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T1 = "11111111-1111-4111-8111-111111111111";

/** The typed client on a fake fetch that answers every call with `res()`. */
const answering = (res) =>
  createApi({
    fetch: async () => res(),
    workspace: () => A,
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async () => {},
    now: () => 1_000,
  });
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("REGRESSION: a thread that is gone reads as gone, and a read that failed reads as failed -- both were null, and the palette dropped the thread", async () => {
  const thread = { id: T1, title: "Saturday", scope: null };
  const read = await askApi(answering(() => json(200, { ok: true, data: { thread, messages: [] } }))).thread(T1);
  assert.deepEqual(read, { thread, messages: [] });

  const gone = await askApi(
    answering(() => json(404, { ok: false, error: { code: "not_found", message: "Thread not found." } })),
  ).thread(T1);
  assert.deepEqual(gone, { missing: true }, "a thread that is not there any more");

  const failed = await askApi(
    answering(() => json(500, { ok: false, error: { code: "internal", message: "boom" } })),
  ).thread(T1);
  assert.equal(failed, null, "a read that failed is not a thread that was deleted");

  const offline = await askApi(
    answering(() => {
      throw new TypeError("Failed to fetch");
    }),
  ).thread(T1);
  assert.equal(offline, null, "nor is a network that dropped");
});
