/**
 * AI's approval of a week's placement is one write (00727; apps/dashboard/src/server/posts/approve.ts over
 * tests/_fake-db.mjs): readying a placement overnight runs every check and writes nothing. What it answers is the
 * approval whole, as the door that places it takes it: its facts as claims, its words where they change the piece's, and
 * how the words on the made picture stood as they were read, so the door keeps them with the placement or keeps none. A
 * week stopped between readying and 8:00 has therefore kept no words and no facts. AI never writes over words someone
 * put on a picture it drew, and a slot the door refuses because everything is stopped says so in the owner's words.
 * The door itself is proven on a real database (ai-s-approval-is-one-write.db.test.mjs).
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONTENT_CHECK_WORDS, ON_INSTAGRAM } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { madeJpegBytes } from "../making/_made-bytes.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.VERCEL_ENV;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// The edge says the Meta link is switched on for every workspace here.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/meta/connection")) return realFetch(input, init);
  const app = { client_id: "1", config_id: "2", redirect_uri: "https://app.example/cb" };
  return new Response(JSON.stringify({ ok: true, ready: true, on: true, app }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { prepareApproval, placeSlotAsAI } = await import(at("apps/dashboard/src/server/posts/approve.ts"));
const { prepareOnInstagram } = await import(at("apps/dashboard/src/server/posts/instagram.ts"));

beforeEach(() => setRateStore(memoryStore()));
after(() => setServiceClient(null));

const USER = "11111111-1111-4111-8111-111111111111";
const MADE = "ffffffff-0005-4000-8000-000000000002";
const WORDS = "Warm colour, all winter.";
const WHEN = new Date(Date.now() + 2 * 86_400_000).toISOString();
let seq = 0;

/** A workspace of its own each time, with a picture AI drew ahead for a slot of a held week. */
function world({ caption = null } = {}) {
  seq += 1;
  const tenant = `aaaaaaaa-0005-4aaa-8aaa-${String(seq).padStart(12, "0")}`;
  // Every door the member's session was asked, in order.
  const doors = [];
  const said = (name, answer) => (args) => {
    doors.push({ name, args });
    return answer;
  };
  // How the picture was made, as every made post keeps it: the words on it are written here once it is approved.
  const made = { from: "ffffffff-0005-4000-8000-000000000001", plan: { line: "Warm", under: null }, caption };
  const row = {
    id: MADE,
    tenant_id: tenant,
    status: "filed",
    source: "made",
    source_ref: null,
    name: "warm",
    mime: "image/jpeg",
    bytes: 1000,
    width: 1080,
    height: 1350,
    look: { line: "A post saying Warm." },
    look_status: "done",
    shows: "graphic",
    who_in_it: "no_one",
    removed_at: null,
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
    kind: "image",
    seconds: null,
  };
  const channels = [
    {
      id: `cccccccc-0005-4ccc-8ccc-${String(seq).padStart(12, "0")}`,
      tenant_id: tenant,
      kind: "instagram",
      external_id: "17841400000000001",
      status: "active",
      credentials_ref: "ref",
      config: { login: "meta", scopes: ["instagram_basic", "instagram_manage_messages", "instagram_content_publish"] },
      created_at: "2026-11-01T00:00:00Z",
    },
  ];
  const ctx = {
    supabase: fakeDb(
      {
        memberships: [
          {
            user_id: USER,
            tenant_id: tenant,
            role: "owner",
            tenants: { slug: `w${seq}` },
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        files: [{ ...row, made }],
        tenant_channels: channels,
        tenants: [
          { id: tenant, name: "Harbor", slug: `w${seq}`, timezone: "UTC", status: "active", sending_stopped_at: null },
        ],
        posts: [],
      },
      {},
      {
        piece_words_keep: said("piece_words_keep", { revision: 1, followed: 0 }),
        owner_claims_keep: said("owner_claims_keep", { id: "claim" }),
        post_approve: said("post_approve", { fate: "approved", posts: [] }),
      },
    ),
    userId: USER,
    email: "ada@example.com",
    params: { id: MADE },
  };
  // What the service role holds of the picture: where its words on how it was made would be written.
  const kept = [{ id: MADE, tenant_id: tenant, source: "made", kind: "image", made: { ...made }, removed_at: null }];
  const service = fakeDb({ tenant_channels: channels, files: kept, events: [], posts: [], pieces: [] }, {}, {});
  service.storage = {
    from: () => ({ download: async () => ({ data: new Blob([madeJpegBytes({ tag: tenant })]), error: null }) }),
  };
  setServiceClient(service);
  const member = { tenantId: tenant, role: "owner", facts: { timezone: "UTC" } };
  return { ctx, member, row, tenant, doors, kept };
}

test("readying a placement writes nothing: no words on the piece, none on how the picture was made, no fact kept", async () => {
  const w = world();
  const approval = await prepareOnInstagram(w.ctx, w.member, w.row, {
    as: "picture",
    caption: `  ${WORDS}  `,
    when: WHEN,
  });
  assert.deepEqual(w.doors, [], "no door of the member's session was asked to keep anything");
  assert.equal(w.kept[0].made.caption, null, "the picture's own words are as they stood");
  // What it answers is the approval whole, for the door that places it.
  assert.equal(approval.via, "rung");
  assert.equal(approval.words, WORDS, "the words that go, to be kept with the placement");
  assert.deepEqual(approval.stood, { caption: null }, "and how the picture's words stood as they were read");
  assert.deepEqual(approval.claims, []);
  assert.equal(approval.placements[0].caption, WORDS);
  assert.equal(approval.snapshot.placements[0].caption, WORDS);
});

test("a fact the approval carries rides inside it as the owner's claim, kept by the door and not at readying", async () => {
  const w = world();
  const approval = await prepareApproval(w.ctx, w.member, w.row, {
    placements: [{ place: "instagram", kind: "picture", caption: WORDS, when: WHEN }],
    intent: null,
    facts: [{ says: "Thursday still has openings", until: "2027-01-07" }],
    via: "rung",
    connections: { instagram: "yes" },
  });
  assert.deepEqual(w.doors, [], "nothing kept yet");
  assert.deepEqual(approval.claims, [
    { kind: "fact", text: "Thursday still has openings", source: "said", valid_until: "2027-01-07" },
  ]);
});

test("words the picture says already are not sent to be kept again, and how they stood is said", async () => {
  const w = world({ caption: WORDS });
  const approval = await prepareOnInstagram(w.ctx, w.member, w.row, { as: "picture", caption: WORDS, when: WHEN });
  assert.equal("words" in approval, false);
  assert.deepEqual(approval.stood, { caption: WORDS });
  assert.deepEqual(w.doors, []);
});

test("a story carries no words, so nothing of the picture's words is read or held", async () => {
  const w = world();
  const approval = await prepareOnInstagram(w.ctx, w.member, w.row, { as: "story", caption: WORDS, when: WHEN });
  assert.equal("words" in approval, false);
  assert.equal("stood" in approval, false);
  assert.equal(approval.placements[0].caption, null);
});

test("AI never writes over words someone put on a picture it drew: the slot waits for their look", async () => {
  const w = world({ caption: "My own words." });
  await assert.rejects(
    prepareOnInstagram(w.ctx, w.member, w.row, { as: "picture", caption: WORDS, when: WHEN }),
    (e) => e.name === "AppError" && e.status === 409 && e.message === ON_INSTAGRAM.held.changed,
  );
  assert.deepEqual(w.doors, []);
  assert.equal(w.kept[0].made.caption, "My own words.");
});

test("a slot the door refuses because everything is stopped says so in the owner's words, and nothing more is asked", async () => {
  const asked = [];
  const ctx = {
    supabase: fakeDb(
      {},
      {},
      {
        plan_slot_place: (args) => {
          asked.push(args);
          return { fate: "stopped", posts: [] };
        },
      },
    ),
  };
  const slot = { id: "eeee5555-0005-4000-8000-000000000240", fileId: MADE, approval: { via: "rung", placements: [] } };
  await assert.rejects(
    placeSlotAsAI(ctx, { tenantId: "aaaaaaaa-0005-4aaa-8aaa-000000000999" }, slot),
    (e) => e.name === "AppError" && e.message === CONTENT_CHECK_WORDS.stopped,
  );
  assert.equal(asked.length, 1);
});
