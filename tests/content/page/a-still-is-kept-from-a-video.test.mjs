/**
 * A still from a video (the content redesign's stage 3): five moments spread across a video that is ready, each kept as a photo of
 * the library under the video's name and where in it, and the door refuses, in words, a video not ready or a moment outside it,
 * before anything is cut or stored. Whoever may add photos keeps one; a viewer may not.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STILL_WORDS, stillMomentsOf, stillNameOf, stillWont } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const still = await import(at("apps/dashboard/app/api/v1/files/[id]/still/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const V = "ffffffff-0000-4000-8000-000000000009";
const USER = "11111111-1111-4111-8111-111111111111";
const video = { kind: "video", media_status: "ready", seconds: 14.2 };

test("five moments spread across a video that is ready, to the tenth; none for one not ready or with no length", () => {
  assert.deepEqual(stillMomentsOf(video), [1.4, 4.3, 7.1, 9.9, 12.8]);
  assert.deepEqual(stillMomentsOf({ ...video, media_status: "processing" }), []);
  assert.deepEqual(stillMomentsOf({ ...video, seconds: null }), []);
  assert.deepEqual(stillMomentsOf({ kind: "image", media_status: null, seconds: null }), []);
});

test("a still is named for its video and where in it, so two of one clip are told apart", () => {
  assert.equal(stillNameOf("wash-day-at-the-basin", 12.8), "wash-day-at-the-basin-at-0-12");
  assert.equal(stillNameOf("a-long-one", 75.4), "a-long-one-at-1-15");
  assert.equal(stillWont(video, 7.1), false);
  assert.equal(stillWont(video, 20), true, "past its end");
  assert.equal(stillWont({ kind: "image", seconds: null }, 1), true, "a photo has no moments");
});

function world({ role = "owner", row = {} } = {}) {
  const files = [
    {
      id: V,
      tenant_id: A,
      status: "filed",
      source: "upload",
      name: "wash-day-at-the-basin",
      mime: "video/mp4",
      kind: "video",
      media_status: "ready",
      seconds: 14.2,
      bytes: 1000,
      width: 1080,
      height: 1920,
      look: null,
      look_status: "done",
      shows: "work",
      who_in_it: "no_one",
      removed_at: null,
      created_at: "2026-11-01T12:00:00Z",
      updated_at: "2026-11-01T12:00:00Z",
      ...row,
    },
  ];
  const supabase = fakeDb({
    memberships: [
      { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    files,
  });
  return { supabase, userId: USER, email: "ada@example.com", params: { id: V } };
}
const keep = (body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: JSON.stringify(body) });

test("the door refuses in words a video not ready, or a moment outside it, before anything is cut or stored", async () => {
  await assert.rejects(
    still.POST.run(keep({ at: 4 }), world({ row: { media_status: "processing" } })),
    (e) => e.message === STILL_WORDS.notReady,
  );
  await assert.rejects(still.POST.run(keep({ at: 30 }), world()), (e) => e.message === STILL_WORDS.wont);
});

test("whoever may add photos keeps a still; a viewer may not", async () => {
  await assert.rejects(still.POST.run(keep({ at: 4 }), world({ role: "viewer" })), (e) => e.status === 403);
});
