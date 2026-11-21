/**
 * New ad's route for Meta's own preview (apps/dashboard/src/server/ads/preview.ts readAdPreview, GET ads/preview; the
 * Ads plan's 4.6, "The ad as Meta draws it"), run on the dashboard's own server code over a database in memory, with the
 * edge answered where the edge would be.
 *
 * What must hold. What Meta is asked to draw is a version of the workspace's kept draft, never words a browser sends,
 * and the answer names the picture and the words it drew. A draft with no such version asks nothing. Meta's frame for
 * each place it drew is handed on, and where it drew none, or the edge could not be asked, the answer says why in one
 * of the screen's own words: nothing here is a refusal.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.example.com";
// The edge is asked, as production asks it; the fetch below answers.
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readAdPreview } = await import(at("apps/dashboard/src/server/ads/preview.ts"));
const { readerContext } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

const T = "aaaaaaaa-9999-4aaa-8aaa-000000000001";
const USER = "bbbbbbbb-9999-4bbb-8bbb-000000000001";
const ACCOUNT = "cccccccc-9999-4ccc-8ccc-000000000001";
const FILE = "dddddddd-9999-4ddd-8ddd-000000000001";
const NOW = new Date("2031-03-15T15:00:00Z");
const THREE = [
  { headline: "First appointment", text: "A first appointment at Harbor Studio. Message us on WhatsApp." },
  { headline: "Harbor Studio", text: "First appointments at Harbor Studio. Message us on WhatsApp for a time." },
  { headline: "Ask us", text: "Ask Harbor Studio about a first appointment on WhatsApp." },
];
const frameOf = (place) => `https://www.facebook.com/ads/api/preview_iframe.php?d=${place}&t=AQJ`;

/** The edge, as the route meets it: each call kept with its body, answered as a test sets it. */
const edge = { asked: [], status: 200, body: null };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  edge.asked.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
  return new Response(JSON.stringify(edge.body), {
    status: edge.status,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

const place = (one, over = {}) => ({ place: one, src: frameOf(one), width: 335, height: 580, fault: null, ...over });
const unplaced = (one, fault) => ({ place: one, src: null, width: null, height: null, fault });

/** A workspace whose kept draft holds the three versions, or as a test says. */
function seated(draft = { versions: THREE }) {
  edge.asked.length = 0;
  edge.status = 200;
  edge.body = { ok: true, outcome: "drawn", places: ["feed", "story", "reel"].map((one) => place(one)) };
  const kept = draft
    ? [
        {
          id: "eeeeeeee-9999-4eee-8eee-000000000001",
          tenant_id: T,
          account_id: ACCOUNT,
          kept_by: USER,
          updated_at: "2031-03-15T14:00:00Z",
          draft: {
            service: "First appointment",
            picture: FILE,
            miles: 5,
            total_minor: 7000,
            end_day: "2031-03-29",
            answers: {},
            ...draft,
          },
        },
      ]
    : [];
  const db = fakeDb({ ad_drafts: kept });
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  return readerContext(ctx, { tenantId: T, role: "operator" }, NOW);
}

test("Meta is asked to draw a version of the kept draft, and the answer names the picture and the words it drew", async () => {
  const rc = seated();
  const answer = await readAdPreview(rc, 1);
  assert.equal(edge.asked.length, 1);
  assert.equal(edge.asked[0].url, "https://edge.example.com/api/admin/ads/preview");
  assert.deepEqual(edge.asked[0].body, {
    tenant_id: T,
    user_id: USER,
    preview: { picture: FILE, text: THREE[1].text, headline: THREE[1].headline },
  });
  assert.deepEqual(answer, {
    drew: { picture: FILE, text: THREE[1].text, headline: THREE[1].headline },
    frames: {
      feed: { src: frameOf("feed"), width: 335, height: 580 },
      story: { src: frameOf("story"), width: 335, height: 580 },
      reel: { src: frameOf("reel"), width: 335, height: 580 },
    },
    why: null,
  });
});

test("a draft with no such version, or none kept, asks the edge nothing", async () => {
  for (const draft of [null, { versions: [] }, { versions: THREE.slice(0, 1) }]) {
    const rc = seated(draft);
    assert.deepEqual(await readAdPreview(rc, 2), { drew: null, frames: {}, why: null });
    assert.deepEqual(edge.asked, []);
  }
});

test("where Meta drew some places, the others say why; where it drew none, the edge's outcome does", async () => {
  const rc = seated();
  edge.body = { ok: true, outcome: "partly", places: [place("feed"), unplaced("story", "slowed"), place("reel")] };
  const partly = await readAdPreview(rc, 0);
  assert.deepEqual(Object.keys(partly.frames), ["feed", "reel"]);
  assert.equal(partly.why, "busy");
  const nones = [
    ["not_connected", "not_connected"],
    ["signed_out", "signed_out"],
    ["video", "video"],
    ["slowed", "busy"],
    ["silent", "busy"],
    ["refused", "refused"],
    ["no_picture", "refused"],
  ];
  for (const [outcome, why] of nones) {
    edge.body = { ok: true, outcome, places: [] };
    const answer = await readAdPreview(rc, 0);
    assert.deepEqual([answer.why, answer.frames], [why, {}], outcome);
    assert.equal(answer.drew.text, THREE[0].text, "it still names what it asked to be drawn");
  }
  // A place Meta's sign-in no longer reaches says so.
  edge.body = { ok: true, outcome: "partly", places: [unplaced("feed", "revoked"), place("story"), place("reel")] };
  assert.equal((await readAdPreview(rc, 0)).why, "signed_out");
});

test("an edge that refuses or doesn't answer is Chanlytics' own drawing with its reason, never a refusal", async () => {
  const rc = seated();
  edge.status = 409;
  edge.body = { ok: false, error: "meta_off" };
  assert.equal((await readAdPreview(rc, 0)).why, "not_here");
  // An edge deployed before this door: Meta can't be asked from here yet, which is not Meta failing to answer.
  edge.status = 404;
  edge.body = { ok: false, error: "not_found" };
  assert.equal((await readAdPreview(rc, 0)).why, "not_here");
  edge.status = 503;
  edge.body = { ok: false, error: "no_database" };
  assert.equal((await readAdPreview(rc, 0)).why, "busy");
  edge.status = 200;
  edge.body = { ok: true, outcome: "drawn", places: [{ place: "elsewhere", src: frameOf("x") }] };
  const odd = await readAdPreview(rc, 0);
  assert.deepEqual(odd.frames, {}, "a place the screen does not name is not handed on");
});
