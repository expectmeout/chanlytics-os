/**
 * A kept post on the business's Google profile, from its sheet (apps/dashboard/src/server/posts/google.ts, decision 0099, step
 * 3), run through route(): the real route, the real composer, a database and a Storage in memory, and a fetch where the edge would be.
 * The picture is drawn for what Google shows and kept in the file's own folder, Google is sent to fetch it, and the person's words go as
 * they wrote them. A press only: nothing here runs by itself. The press keeps its placement as Instagram's does (00611, decision 0121,
 * D16): written before the edge is asked, its one send kept, up with Google's name for it or refused in words, and taken down.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sharp = createRequire(path.join(ROOT, "apps/dashboard/package.json"))("sharp");

/** What the edge was asked, and how it answers. */
const edge = { asked: [], answer: null };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  // The Meta link is not switched on here: the sheet offers Instagram nothing.
  if (url.includes("/api/admin/meta/connection"))
    return new Response(JSON.stringify({ ok: true, ready: false, on: false, app: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
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

const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
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
  posts = [],
} = {}) {
  const uploaded = [];
  const signed = [];
  const attempts = [];
  // One table of placements, as the database has: the member's door writes it, the service role's doors move it.
  const doors = placementDoors(posts, attempts);
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
        posts,
      },
      {},
      { post_begin: doors.begin, post_pull: doors.pull },
    ),
    userId: USER,
    email: "ada@example.com",
    params: { id: POST_ID },
  };
  const service = fakeDb(
    { files: [{ id: POST_ID, tenant_id: A, source: "made", made }], events, posts },
    {},
    doors.service,
  );
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
  return { ctx, uploaded, signed, posts, attempts };
}

/** The placement doors (00611) over one table, as the migration writes them: what this press needs of them. */
function placementDoors(posts, attempts) {
  const find = (id) => posts.find((p) => p.id === id);
  return {
    begin: (a) => {
      if (
        posts.some(
          (p) => p.file_id === a.p_file_id && p.place === a.p_place && ["queued", "publishing"].includes(p.status),
        )
      )
        return { fate: "busy", post_id: null };
      const id = `0000000${posts.length + 1}-0000-4000-8000-000000000000`;
      // As 00616 has it: later than two minutes on, a Google post waits for its job; sooner, the press asks Google itself.
      const later = !!a.p_when && Date.parse(a.p_when) - Date.now() > 120_000;
      posts.push(
        placementRow({
          id,
          place: a.p_place,
          kind: a.p_kind,
          caption: a.p_caption,
          status: later ? "queued" : "publishing",
          scheduled_for: a.p_when ?? new Date().toISOString(),
        }),
      );
      return { fate: "begun", post_id: id };
    },
    pull: ({ p_post_id }) => {
      const p = find(p_post_id);
      if (!p) return { fate: "unknown" };
      if (!["queued", "preparing"].includes(p.status)) return { fate: "late", status: p.status };
      p.status = "pulled";
      return { fate: "pulled" };
    },
    service: {
      post_attempt_open: (a) => {
        const row = {
          id: `att-${attempts.length + 1}`,
          post_id: a.p_post_id,
          step: a.p_step,
          request: a.p_request,
          outcome: null,
        };
        attempts.push(row);
        return { fate: "open", id: row.id, finished: false, outcome: null, container_id: null, external_id: null };
      },
      post_attempt_close: (a) => {
        Object.assign(
          attempts.find((r) => r.id === a.p_attempt_id),
          { outcome: a.p_outcome, external_id: a.p_external_id ?? null },
        );
        return true;
      },
      post_moved: ({ p_post_id, p_from, p_to, p_patch }) => {
        const p = find(p_post_id);
        if (!p || !p_from.includes(p.status)) return false;
        p.status = p_to;
        if (p_patch.external_id) p.external_id = p_patch.external_id;
        if (p_patch.permalink) p.permalink = p_patch.permalink;
        if (p_patch.error) p.error = p_patch.error;
        if (p_to === "published") p.published_at = "2026-11-10T10:00:00.000Z";
        return true;
      },
    },
  };
}

/** A placement as the table keeps it. */
const placementRow = (over = {}) => ({
  id: "00000009-0000-4000-8000-000000000000",
  tenant_id: A,
  file_id: POST_ID,
  place: "google",
  kind: "picture",
  caption: null,
  status: "published",
  held_reason: null,
  permalink: null,
  scheduled_for: "2026-11-10T09:00:00.000Z",
  published_at: null,
  error: null,
  external_id: null,
  approved_by: USER,
  approved_at: "2026-11-10T09:00:00.000Z",
  via: "press",
  attempts: 0,
  container_id: null,
  created_at: "2026-11-10T09:00:00.000Z",
  updated_at: "2026-11-10T09:00:00.000Z",
  ...over,
});
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

test("a post set for its time is drawn now and kept with its time, and Google is asked by its job then (00616)", async () => {
  const { ctx, uploaded, posts } = world();
  const when = new Date(Date.now() + 24 * 3_600_000).toISOString();
  const said = await route.POST.run(send("POST", { summary: WORDS, when }), ctx);
  assert.deepEqual(said, { name: null, search_url: null, state: "scheduled" });
  assert.equal(uploaded.length, 1, "the picture drawn now, in its folder, for its job to hand Google");
  assert.deepEqual(edge.asked, [], "nothing reaches Google at the press");
  assert.deepEqual([posts[0].status, posts[0].scheduled_for, posts[0].caption], ["queued", when, WORDS]);
  // Within two minutes is now: the press asks Google itself.
  const soon = world();
  await route.POST.run(send("POST", { summary: WORDS, when: new Date(Date.now() + 30_000).toISOString() }), soon.ctx);
  assert.equal(edge.asked.length, 1);
  assert.equal(soon.posts[0].status, "published");
});

test("Don't post takes back one set for its time on Google, up to its time; one up already is taken down by its name", async () => {
  const waiting = placementRow({ id: "00000005-0000-4000-8000-000000000000", status: "queued", caption: WORDS });
  const { ctx, posts } = world({ posts: [waiting] });
  assert.deepEqual(await route.DELETE.run(send("DELETE", { post_id: waiting.id }), ctx), { pulled: true });
  assert.equal(posts[0].status, "pulled");
  assert.deepEqual(edge.asked, [], "nothing was on Google to ask about");
  // Another place's post is not this door's to pull.
  const other = placementRow({ id: "00000006-0000-4000-8000-000000000000", place: "instagram", status: "queued" });
  const elsewhere = world({ posts: [other] });
  await assert.rejects(route.DELETE.run(send("DELETE", { post_id: other.id }), elsewhere.ctx), (e) => e.status === 404);
});

test("the press keeps its placement: begun before the edge is asked, its send kept, and up under Google's own name", async () => {
  const { ctx, posts, attempts } = world();
  await route.POST.run(send("POST", { summary: WORDS }), ctx);
  assert.equal(posts.length, 1);
  const [placed] = posts;
  assert.deepEqual(
    [placed.place, placed.kind, placed.caption, placed.status, placed.external_id, placed.permalink],
    ["google", "picture", WORDS, "published", NAME, "https://local.google.com/x"],
  );
  assert.deepEqual(
    attempts.map((a) => [a.step, a.outcome, a.external_id]),
    [["publish", "ok", NAME]],
  );
  assert.equal(attempts[0].request.photo, "storage.example", "the picture's host alone, never its signed address");
});

test("a refusal leaves the placement not posted, in the person's words, and a second press while one is going is the first", async () => {
  const refused = world();
  edge.answer = () => ({ status: 502, body: { ok: false, error: "google_refused", detail: "Photo too small" } });
  await assert.rejects(route.POST.run(send("POST", { summary: WORDS }), refused.ctx), /did not take the post/);
  assert.equal(refused.posts[0].status, "failed");
  assert.match(refused.posts[0].error.words, /did not take the post/);
  const busy = world({ posts: [placementRow({ status: "publishing" })] });
  await assert.rejects(route.POST.run(send("POST", { summary: WORDS }), busy.ctx), /already on its way to Google/);
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

test("a caption changed once a post is set for its time is the one it goes up with, and words it could not take are refused", async () => {
  // Ruben, 12 Nov 2026: the sheet said the new words over "Goes up Sat", and the old ones went up.
  const later = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString();
  const waiting = placementRow({
    id: "00000005-0000-4000-8000-000000000000",
    status: "queued",
    caption: WORDS,
    scheduled_for: later,
  });
  const story = placementRow({
    id: "00000006-0000-4000-8000-000000000000",
    place: "instagram",
    kind: "story",
    status: "queued",
    scheduled_for: later,
  });
  const up = placementRow({
    id: "00000007-0000-4000-8000-000000000000",
    place: "instagram",
    caption: WORDS,
    status: "published",
  });
  const making = placementRow({
    id: "00000008-0000-4000-8000-000000000000",
    place: "instagram",
    caption: WORDS,
    status: "preparing",
  });
  const { ctx, posts } = world({ posts: [waiting, story, up, making] });
  const captions = () => posts.map((p) => p.caption);
  assert.deepEqual(await one.PATCH.run(send("PATCH", { caption: "  New words for Saturday.  " }), ctx), { ok: true });
  assert.deepEqual(
    captions(),
    ["New words for Saturday.", null, WORDS, WORDS],
    "the post that waits takes them; a story shows none; one up, or being made ready on Instagram, keeps its own",
  );
  await assert.rejects(
    one.PATCH.run(send("PATCH", { caption: "   " }), ctx),
    (e) => e.code === "validation" && /Keep a caption/.test(e.message),
  );
  await assert.rejects(
    one.PATCH.run(send("PATCH", { caption: "x".repeat(1501) }), ctx),
    (e) => e.code === "validation" && /Google takes up to 1,500/.test(e.message),
  );
  assert.equal(posts[0].caption, "New words for Saturday.", "a refused caption changes nothing");
  // With nothing waiting, a caption is the owner's to clear.
  const quiet = world({ posts: [up] });
  assert.deepEqual(await one.PATCH.run(send("PATCH", { caption: "" }), quiet.ctx), { ok: true });
  assert.equal(quiet.posts[0].caption, WORDS);
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
  const { ctx, uploaded, posts } = world({ posts: [placementRow({ external_id: NAME })] });
  edge.answer = () => ({ body: { ok: true } });
  assert.deepEqual(await route.DELETE.run(send("DELETE", { name: NAME }), ctx), { down: true });
  assert.deepEqual(edge.asked, [{ op: "unpost", tenant_id: A, user_id: USER, file_id: POST_ID, post_name: NAME }]);
  assert.deepEqual(uploaded, []);
  assert.equal(posts[0].status, "taken_down", "its placement says so");
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

test("a placement says where the post is on Google before the events do; a failed one leaves it to the events", async () => {
  const placed = await recorded({
    posts: [
      placementRow({
        external_id: NAME,
        permalink: "https://local.google.com/p",
        published_at: "2026-11-10T10:00:00.000Z",
      }),
    ],
  });
  assert.deepEqual(placed.google.posted, {
    name: NAME,
    search_url: "https://local.google.com/p",
    at: "2026-11-10T10:00:00.000Z",
  });
  const down = await recorded({
    posts: [placementRow({ status: "taken_down", external_id: NAME })],
    events: [posted("file.posted", "2026-11-05T10:00:00Z")],
  });
  assert.equal(down.google.posted, null, "taken down, whatever an older event said");
  const unheard = await recorded({
    posts: [placementRow({ status: "failed" })],
    events: [posted("file.posted", "2026-11-05T10:00:00Z")],
  });
  assert.equal(
    unheard.google.posted.name,
    NAME,
    "a press that never heard its answer: the edge's event says it went up",
  );
  assert.equal(placed.instagram, null, "with the Meta link off, nothing of Instagram");
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
