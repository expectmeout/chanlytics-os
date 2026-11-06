/**
 * A kept post on the business's Google profile, from its sheet (apps/dashboard/src/server/files/post/google.ts, decision 0099, step
 * 3), run through route(): the real route, the real composer, a database and a Storage in memory, and a fetch where the edge would be.
 * The picture is drawn for what Google shows and kept in the file's own folder, Google is sent to fetch it, and the person's words go as
 * they wrote them. A press only: nothing here runs by itself.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.VERCEL_ENV;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sharp = createRequire(path.join(ROOT, "apps/dashboard/package.json"))("sharp");

/** What the edge was asked, and how it answers. */
const edge = { asked: [], answer: null };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/google")) return realFetch(input, init);
  const body = JSON.parse(init.body);
  edge.asked.push(body);
  const a = edge.answer(body);
  return new Response(JSON.stringify(a.body), {
    status: a.status ?? 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const route = await import(at("apps/dashboard/app/api/v1/files/[id]/google/route.ts"));
const one = await import(at("apps/dashboard/app/api/v1/files/[id]/route.ts"));
const preview = await import(at("apps/dashboard/app/api/v1/files/post/preview/route.ts"));

beforeEach(() => {
  setRateStore(memoryStore());
  edge.asked.length = 0;
  edge.answer = () => ({
    body: { ok: true, name: NAME, search_url: "https://local.google.com/x", state: "PROCESSING" },
  });
});
after(() => setServiceClient(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO_ID = "ffffffff-0000-4000-8000-000000000001";
const POST_ID = "ffffffff-0000-4000-8000-000000000002";
const USER = "11111111-1111-4111-8111-111111111111";
const NAME = "accounts/111/locations/222/localPosts/999";
const inA = `?workspace=${A}`;

const PHOTO = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#5e7d98" } })
  .jpeg()
  .toBuffer();
const PLAN = {
  file_id: PHOTO_ID,
  line: "Come see the new floor.",
  over: "Newly renovated",
  under: null,
  book: true,
  words_at: "bottom",
  voice: "classic",
  layout: "band",
  language: "es",
  people_agreed: false,
};
const fileRow = (over = {}) => ({
  id: PHOTO_ID,
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: "storefront-dusk",
  mime: "image/jpeg",
  bytes: 1000,
  width: 1600,
  height: 1200,
  look: { line: "A shopfront at dusk.", people: { count: 0, recognizable: 0 }, subject: [0.2, 0.2, 0.8, 0.8] },
  look_status: "done",
  shows: "storefront",
  who_in_it: "not_asked",
  removed_at: null,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
  ...over,
});
const postRow = (over = {}) =>
  fileRow({ id: POST_ID, source: "made", shows: "graphic", name: "come-see-the-new-floor", ...over });

function world({
  rows = [postRow(), fileRow()],
  role = "owner",
  connections = [{ tenant_id: A, google_email: "o@example.com", location_name: "locations/222" }],
  events = [],
  made = { from: PHOTO_ID, plan: PLAN },
  storeFails = false,
} = {}) {
  const uploaded = [];
  const signed = [];
  const ctx = {
    supabase: fakeDb(
      {
        memberships: [
          { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
        ],
        files: rows,
        tenants: [
          {
            id: A,
            name: "Harbor",
            slug: "harbor",
            timezone: "UTC",
            status: "active",
            logo_path: null,
            accent: "#e8c156",
          },
        ],
        tenant_config: [
          {
            tenant_id: A,
            version: 1,
            config: {
              brain: {
                business_name: "Harbor",
                system_prompt: "Answer as the front desk of Harbor.",
                fallbacks: { greeting: "g", error: "e", non_text: "n" },
                phone_display: "(555) 010-0100",
              },
            },
          },
        ],
        tenant_channels: [],
        google_listings: [],
        google_connections: connections,
        lines: [],
      },
      {},
      {},
    ),
    userId: USER,
    email: "ada@example.com",
    params: { id: POST_ID },
  };
  const service = fakeDb({ files: [{ id: POST_ID, tenant_id: A, source: "made", made }], events }, {}, {});
  service.storage = {
    from: () => ({
      download: async () => ({ data: new Blob([PHOTO]), error: null }),
      upload: async (p, bytes, o) => {
        if (storeFails) return { error: { message: "full" } };
        uploaded.push({ path: p, bytes, ...o });
        return { data: { path: p }, error: null };
      },
      createSignedUrl: async (p, seconds) => {
        signed.push({ path: p, seconds });
        return { data: { signedUrl: `https://storage.example/${p}?token=t` }, error: null };
      },
    }),
  };
  setServiceClient(service);
  return { ctx, uploaded, signed };
}
const send = (method, body) => new Request(`http://localhost/api/v1/x${inA}`, { method, body: JSON.stringify(body) });
const WORDS = "Come see the new floor this week.";

test("the post goes up: drawn for what Google shows, kept in its own folder, fetched by Google, in the person's words", async () => {
  const { ctx, uploaded, signed } = world();
  const said = await route.POST.run(send("POST", { summary: `  ${WORDS}  ` }), ctx);
  assert.deepEqual(said, { name: NAME, search_url: "https://local.google.com/x", state: "PROCESSING" });
  assert.equal(uploaded.length, 1);
  const [stored] = uploaded;
  assert.equal(
    stored.path,
    `${A}/${POST_ID}/google.jpg`,
    "in the file's folder, so the purge that empties it empties this",
  );
  assert.equal(stored.upsert, true, "a second time over the first");
  const seen = await sharp(stored.bytes).metadata();
  assert.deepEqual([seen.format, seen.width, seen.height], ["jpeg", 1200, 900], "4:3, which Google shows whole");
  assert.deepEqual(edge.asked, [
    {
      op: "post",
      tenant_id: A,
      user_id: USER,
      file_id: POST_ID,
      summary: WORDS,
      photo_url: `https://storage.example/${A}/${POST_ID}/google.jpg?token=t`,
      language: "es",
      call: true,
    },
  ]);
  assert.ok(signed[0].seconds >= 3600, "long enough for Google to come for it, whenever it does");
});

test("what a person pressed is what goes: its number by the plan, and a post with none asks for no Call button", async () => {
  const { ctx } = world({ made: { from: PHOTO_ID, plan: { ...PLAN, book: false, language: "en" } } });
  await route.POST.run(send("POST", { summary: WORDS }), ctx);
  assert.equal(edge.asked[0].call, false);
  assert.equal(edge.asked[0].language, "en");
});

test("only a post goes, and only while the photo it came from is here to draw it from", async () => {
  const photo = world();
  photo.ctx.params = { id: PHOTO_ID };
  await assert.rejects(route.POST.run(send("POST", { summary: WORDS }), photo.ctx), /Only a post can go on Google/);
  const gone = world({ rows: [postRow(), fileRow({ removed_at: "2026-11-02T00:00:00Z" })] });
  await assert.rejects(route.POST.run(send("POST", { summary: WORDS }), gone.ctx), /was deleted/);
  assert.deepEqual(edge.asked, [], "and Google hears of neither");
});

test("words are needed, and no more than Google takes", async () => {
  const { ctx } = world();
  await assert.rejects(route.POST.run(send("POST", { summary: "   " }), ctx), (e) => e.code === "validation");
  await assert.rejects(
    route.POST.run(send("POST", { summary: "x".repeat(1501) }), ctx),
    (e) => e.code === "validation",
  );
  assert.deepEqual(edge.asked, []);
});

test("only whoever may save a post may put it up, or take it down", async () => {
  for (const role of ["viewer", "operator"]) {
    const { ctx } = world({ role });
    await assert.rejects(route.POST.run(send("POST", { summary: WORDS }), ctx), (e) => e.code === "forbidden", role);
    await assert.rejects(route.DELETE.run(send("DELETE", { name: NAME }), ctx), (e) => e.code === "forbidden", role);
  }
  assert.deepEqual(edge.asked, []);
});

test("a picture that won't store says so, and Google is not asked", async () => {
  const { ctx } = world({ storeFails: true });
  await assert.rejects(route.POST.run(send("POST", { summary: WORDS }), ctx), /did not go through/);
  assert.deepEqual(edge.asked, []);
});

test("what the edge says comes back in a person's words", async () => {
  const cases = [
    [{ error: "not_connected" }, 409, /Connect your Business Profile/],
    [{ error: "no_token" }, 502, /connection to Google was lost/],
    [{ error: "google_refused", detail: "Photo too small" }, 502, /did not take the post\. Photo too small/],
    [{ error: "something_else" }, 502, /did not go through/],
  ];
  for (const [body, status, words] of cases) {
    const { ctx } = world();
    edge.answer = () => ({ status, body: { ok: false, ...body } });
    await assert.rejects(route.POST.run(send("POST", { summary: WORDS }), ctx), (e) => {
      assert.match(e.message, words);
      return true;
    });
  }
});

test("it comes down by its name, and stays in Files", async () => {
  const { ctx, uploaded } = world();
  edge.answer = () => ({ body: { ok: true } });
  assert.deepEqual(await route.DELETE.run(send("DELETE", { name: NAME }), ctx), { down: true });
  assert.deepEqual(edge.asked, [{ op: "unpost", tenant_id: A, user_id: USER, file_id: POST_ID, post_name: NAME }]);
  assert.deepEqual(uploaded, []);
});

test("one the edge can't find to take down is said to be gone", async () => {
  const { ctx } = world();
  edge.answer = () => ({ status: 404, body: { ok: false, error: "not_found" } });
  await assert.rejects(route.DELETE.run(send("DELETE", { name: NAME }), ctx), (e) => e.code === "not_found");
});

/* ------------------------------------------------------------------------- what the sheet reads */

const posted = (kind, at_, data = {}) => ({
  id: `${kind}-${at_}`,
  tenant_id: A,
  kind,
  category: "setup",
  subject_type: "workspace",
  subject_id: A,
  created_at: at_,
  data: { file_id: POST_ID, post_name: NAME, search_url: "https://local.google.com/x", by: USER, ...data },
});
const recorded = (options) => {
  const { ctx } = world(options);
  return one.GET.run(new Request(`http://localhost/api/v1/x${inA}`), ctx);
};

test("a post's sheet says whether it can go up, and whether it is there", async () => {
  assert.deepEqual((await recorded()).google, { connected: true, posted: null });
  const up = await recorded({ events: [posted("file.posted", "2026-11-05T10:00:00Z")] });
  assert.deepEqual(up.google.posted, {
    name: NAME,
    search_url: "https://local.google.com/x",
    at: "2026-11-05T10:00:00Z",
  });
  const down = await recorded({
    events: [posted("file.posted", "2026-11-05T10:00:00Z"), posted("file.unposted", "2026-11-05T11:00:00Z")],
  });
  assert.equal(down.google.posted, null, "the ledger's newest word stands");
  const again = await recorded({
    events: [
      posted("file.posted", "2026-11-05T10:00:00Z", { post_name: "accounts/1/locations/2/localPosts/old" }),
      posted("file.unposted", "2026-11-05T11:00:00Z", { post_name: "accounts/1/locations/2/localPosts/old" }),
      posted("file.posted", "2026-11-05T12:00:00Z"),
    ],
  });
  assert.equal(again.google.posted.name, NAME);
  const another = await recorded({ events: [posted("file.posted", "2026-11-05T10:00:00Z", { file_id: PHOTO_ID })] });
  assert.equal(another.google.posted, null, "another file's is not this one's");
});

test("with nothing connected, or no location chosen, it can't go up", async () => {
  assert.equal((await recorded({ connections: [] })).google.connected, false);
  assert.equal(
    (await recorded({ connections: [{ tenant_id: A, google_email: "o@example.com", location_name: null }] })).google
      .connected,
    false,
  );
});

test("a photo has nothing to say of Google", async () => {
  const { ctx } = world();
  ctx.params = { id: PHOTO_ID };
  const said = await one.GET.run(new Request(`http://localhost/api/v1/x${inA}`), ctx);
  assert.equal(said.google, null);
  assert.equal(said.made, null);
});

test("a person sees the picture as Google will show it before they press", async () => {
  const { ctx } = world();
  const res = await preview.POST.run(
    new Request(`http://localhost/api/v1/x${inA}`, {
      method: "POST",
      body: JSON.stringify({ ...PLAN, shape: "wide" }),
    }),
    ctx,
  );
  const seen = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  assert.deepEqual([seen.width, seen.height], [1200, 900]);
});
