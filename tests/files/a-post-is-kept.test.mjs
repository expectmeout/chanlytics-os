/**
 * A post's picture and its Save, run through route() (apps/dashboard/src/server/posts/, decision 0099, step 3): the real route
 * modules and the real composer, over a database in memory and a Storage that answers from memory. What a card shows is drawn
 * from the same plan its Save keeps, a shape each, and nothing stays behind that no row names.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sharp = createRequire(path.join(ROOT, "apps/dashboard/package.json"))("sharp");
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setUnsubscribeServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const save = await import(at("apps/dashboard/app/api/v1/files/post/route.ts"));
const preview = await import(at("apps/dashboard/app/api/v1/files/post/preview/route.ts"));
const view = await import(at("apps/dashboard/app/api/v1/files/[id]/view/route.ts"));
const one = await import(at("apps/dashboard/app/api/v1/files/[id]/route.ts"));

beforeEach(() => setRateStore(memoryStore()));
after(() => setUnsubscribeServiceClient(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F = "ffffffff-0000-4000-8000-000000000001";
const MADE = "ffffffff-0000-4000-8000-000000000002";
const USER = "11111111-1111-4111-8111-111111111111";
const inA = `?workspace=${A}`;

const member = (role = "owner") => ({
  user_id: USER,
  tenant_id: A,
  role,
  tenants: { slug: "harbor" },
  created_at: "2026-01-01T00:00:00Z",
});
const fileRow = (over = {}) => ({
  id: F,
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
const PHOTO = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#5e7d98" } })
  .jpeg()
  .toBuffer();
const PLAN = {
  file_id: F,
  line: "Come see the new floor.",
  over: "Newly renovated",
  under: null,
  book: true,
  words_at: "bottom",
  voice: "classic",
  layout: "over",
  language: "en",
  people_agreed: false,
};

/** The world: a member's database, and a service role whose Storage and door answer from memory. */
function world({
  rows = [fileRow()],
  fate = { fate: "kept", file_id: null },
  doorThrows = false,
  role = "owner",
  uploadFails = null,
  capReached = false,
  phone = "(555) 010-0100",
  kept = [],
} = {}) {
  const asked = { steps: [], started: [], uploaded: [], removed: [], made: [], changed: [], downloaded: [] };
  const ctx = {
    supabase: fakeDb(
      {
        memberships: [member(role)],
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
                system_prompt: "Answer as the front desk of Harbor: brief and warm, never a price.",
                fallbacks: { greeting: "g", error: "e", non_text: "n" },
                ...(phone ? { phone_display: phone } : {}),
              },
            },
          },
        ],
        tenant_channels: [],
        google_listings: [],
        lines: [],
      },
      {},
      {
        file_start: (a) => {
          asked.steps.push("start");
          asked.started.push(a);
          if (capReached) throw Object.assign(new Error("as many files as it can"), { code: "22023" });
          return null;
        },
        file_change: (a) => {
          asked.changed.push(a);
          return null;
        },
      },
    ),
    userId: USER,
    email: "ada@example.com",
    params: {},
  };
  const service = fakeDb(
    { files: kept },
    {},
    {
      file_made: (a) => {
        asked.made.push(a);
        if (doorThrows) throw new Error("no such door");
        return { ...fate, file_id: fate.file_id ?? a.p_id };
      },
    },
  );
  service.storage = {
    from: () => ({
      download: async (p, o) => {
        asked.downloaded.push({ path: p, ...o });
        return { data: new Blob([PHOTO]), error: null };
      },
      upload: async (p, bytes, o) => {
        asked.steps.push("upload");
        asked.uploaded.push({ path: p, bytes, ...o });
        return uploadFails && p.endsWith(uploadFails)
          ? { error: { message: "full" } }
          : { data: { path: p }, error: null };
      },
      remove: async (paths) => {
        asked.removed.push(...paths);
        return { data: paths, error: null };
      },
      createSignedUrl: async (p, s, o) => ({
        data: { signedUrl: `https://storage.example/${p}?token=t${o?.transform ? `&w=${o.transform.width}` : ""}` },
        error: null,
      }),
    }),
  };
  setUnsubscribeServiceClient(service);
  return { asked, ctx };
}
const post = (body) => new Request(`http://localhost/api/v1/x${inA}`, { method: "POST", body: JSON.stringify(body) });

/* ------------------------------------------------------------------------- the picture on the card */

test("the card's picture is the real one: a JPEG in the shape it asks, from the photo as Storage copies it, and nothing kept", async () => {
  const { asked, ctx } = world();
  const res = await preview.POST.run(post(PLAN), ctx);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const seen = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  assert.deepEqual([seen.format, seen.width, seen.height], ["jpeg", 1080, 1350], "portrait, where it does not say");
  assert.deepEqual(
    asked.downloaded[0].transform,
    { width: 2000, resize: "contain" },
    "a HEIC comes back as one the code reads",
  );
  assert.deepEqual([asked.uploaded, asked.made], [[], []]);
  const story = await preview.POST.run(post({ ...PLAN, shape: "story" }), ctx);
  assert.equal((await sharp(Buffer.from(await story.arrayBuffer())).metadata()).height, 1920);
});

test("the picture says whether the business has a number to print, so an editor offers only what will draw", async () => {
  const has = world();
  const res = await preview.POST.run(post(PLAN), has.ctx);
  assert.equal(res.headers.get("x-post-phone"), "1");
  const none = world({ phone: null });
  const bare = await preview.POST.run(post(PLAN), none.ctx);
  assert.equal(bare.headers.get("x-post-phone"), "0");
});

test("a person changing a post's words draws the same photo again and again, and it is read once", async () => {
  const { asked, ctx } = world();
  for (const line of ["One", "Two", "Three"]) await preview.POST.run(post({ ...PLAN, line }), ctx);
  await save.POST.run(post(PLAN), ctx);
  assert.equal(asked.downloaded.length, 1, "a file's bytes never change");
  const other = world();
  await preview.POST.run(post(PLAN), other.ctx);
  assert.equal(
    other.asked.downloaded.length,
    1,
    "and a read of it is held by the process, not shared with a test's next world",
  );
});

test("a photo removed is never drawn from memory: the row is read first, under the caller's own RLS", async () => {
  const { asked, ctx } = world();
  await preview.POST.run(post(PLAN), ctx);
  ctx.supabase = world({ rows: [] }).ctx.supabase;
  await assert.rejects(preview.POST.run(post({ ...PLAN, line: "Again" }), ctx), (e) => e.code === "not_found");
  assert.equal(asked.downloaded.length, 1);
});

test("words that can't be drawn are said to a person in the post's own language, and a layout left out draws as it did", async () => {
  const { ctx } = world();
  const emoji = { ...PLAN, line: "New floor 🎉" };
  await assert.rejects(preview.POST.run(post(emoji), ctx), (e) => e.code === "validation" && /emoji/.test(e.message));
  await assert.rejects(
    preview.POST.run(post({ ...emoji, language: "es" }), ctx),
    (e) => e.code === "validation" && /carácter/.test(e.message),
  );
  const { layout: _none, ...before } = PLAN;
  assert.equal((await preview.POST.run(post(before), ctx)).status, 200);
  const made = await save.POST.run(post(before), ctx);
  assert.ok(made.file_id);
});

test("a photo a post can't be made from is refused at the picture and at the Save", async () => {
  for (const rows of [[fileRow({ status: "inbox" })], [fileRow({ shows: "graphic" })], [fileRow({ source: "made" })]]) {
    const { ctx } = world({ rows });
    for (const route of [preview, save]) {
      await assert.rejects(
        route.POST.run(post(PLAN), ctx),
        (e) => e.code === "validation",
        JSON.stringify(rows[0].status),
      );
    }
  }
  const { ctx } = world({ rows: [] });
  await assert.rejects(save.POST.run(post(PLAN), ctx), (e) => e.code === "not_found");
});

test("words that can't be drawn are refused whoever sent them; a person's press is their word on the rest", async () => {
  const { ctx } = world();
  await assert.rejects(save.POST.run(post({ ...PLAN, line: "New floor 🎉" }), ctx), (e) => e.code === "validation");
  await assert.rejects(save.POST.run(post({ ...PLAN, over: "Visit harbor.com" }), ctx), (e) => e.code === "validation");
  const theirs = world();
  const kept = await save.POST.run(post({ ...PLAN, line: "20% off, free consultation" }), theirs.ctx);
  assert.ok(kept.file_id, "Ask's check is where it is known who said what; a member pressing Save has said it");
});

test("who may: whoever may add a photo", async () => {
  for (const route of [preview, save]) {
    const { ctx } = world({ role: "operator" });
    await assert.rejects(route.POST.run(post(PLAN), ctx), (e) => e.code === "forbidden");
  }
});

/* ------------------------------------------------------------------------- Save */

test("Save keeps a shape each in the file's folder, and the file by its door: what it says, who is in it, how it was made", async () => {
  const { asked, ctx } = world();
  const out = await save.POST.run(post(PLAN), ctx);
  assert.equal(asked.uploaded.length, 3);
  const id = asked.made[0].p_id;
  assert.deepEqual(asked.uploaded.map((u) => u.path).sort(), [
    `${A}/${id}/original.jpg`,
    `${A}/${id}/square.jpg`,
    `${A}/${id}/story.jpg`,
  ]);
  for (const u of asked.uploaded) {
    assert.equal(u.contentType, "image/jpeg");
    assert.equal(u.upsert, false);
  }
  const door = asked.made[0];
  assert.equal(door.p_name, "come-see-the-new-floor");
  assert.deepEqual([door.p_width, door.p_height], [1080, 1350]);
  assert.equal(door.p_look.line, 'A post saying "Come see the new floor.", made from storefront-dusk.');
  assert.deepEqual(door.p_look.text_seen, ["Newly renovated", "Come see the new floor."]);
  assert.deepEqual(door.p_look.people, { count: 0, recognizable: 0 }, "who is in it is the photo's");
  assert.equal(door.p_who_in_it, "not_asked");
  assert.deepEqual(door.p_made, { from: F, plan: PLAN });
  assert.equal(door.p_actor, USER);
  assert.deepEqual(asked.removed, []);
  assert.equal(out.file_id, id);
  assert.equal(out.twin, false);
});

test("the same picture pressed twice is the one file, and the second press leaves nothing behind", async () => {
  const { asked, ctx } = world({
    fate: { fate: "here", file_id: MADE },
    rows: [fileRow(), fileRow({ id: MADE, name: "come-see" })],
  });
  const out = await save.POST.run(post(PLAN), ctx);
  assert.deepEqual([out.file_id, out.name, out.twin], [MADE, "come-see", true]);
  assert.equal(asked.removed.length, 3, "these bytes are nobody's");
});

test("a library that is full, a door that fails, or a shape that won't store each leave nothing behind", async () => {
  const full = world({ fate: { fate: "full", file_id: null } });
  await assert.rejects(save.POST.run(post(PLAN), full.ctx), (e) => e.code === "validation");
  assert.equal(full.asked.removed.length, 3);

  const broken = world({ doorThrows: true });
  await assert.rejects(save.POST.run(post(PLAN), broken.ctx));
  assert.equal(broken.asked.removed.length, 3);

  const stuck = world({ uploadFails: "story.jpg" });
  await assert.rejects(save.POST.run(post(PLAN), stuck.ctx), (e) => e.code === "internal");
  assert.equal(stuck.asked.removed.length, 3);
  assert.equal(stuck.asked.made.length, 0, "no row for a post that did not arrive");
});

test("a Save leaves its purge before anything travels, so a function that dies part way leaves nothing for good", async () => {
  const { asked, ctx } = world();
  const out = await save.POST.run(post(PLAN), ctx);
  assert.equal(asked.steps[0], "start");
  assert.equal(asked.started[0].p_tenant_id, A);
  assert.equal(asked.started[0].p_id, out.file_id, "the folder this press stores into");
  assert.equal(asked.started[0].p_id, asked.made[0].p_id);
});

test("a library at its cap is told so at the start, with nothing drawn, stored or changed", async () => {
  const { asked, ctx } = world({ capReached: true });
  await assert.rejects(save.POST.run(post({ ...PLAN, people_agreed: true }), ctx), (e) => e.code === "validation");
  assert.deepEqual([asked.downloaded, asked.uploaded, asked.changed, asked.made], [[], [], [], []]);
});

test("the owner's word that those in the photo agreed goes on the photo, and on the post", async () => {
  const { asked, ctx } = world();
  await save.POST.run(post({ ...PLAN, people_agreed: true }), ctx);
  assert.equal(asked.changed[0].p_who_in_it, "agreed");
  assert.equal(asked.changed[0].p_id, F);
  assert.equal(asked.made[0].p_who_in_it, "agreed");
});

/* ------------------------------------------------------------------------- as a file */

const viewed = async (q, row) => {
  const { ctx } = world({ rows: [row] });
  ctx.params = { id: row.id };
  const res = await view.GET.run(new Request(`http://localhost/api/v1/x${inA}&${q}`), ctx);
  return res.headers.get("location");
};

/** What the sheet reads as it opens a file. `kept` is the rows as the service role reads them, with what a member can't. */
const recorded = (row, options) => {
  const { ctx } = world(options);
  ctx.params = { id: row.id };
  return one.GET.run(new Request(`http://localhost/api/v1/x${inA}`), ctx);
};
const POST_ROW = fileRow({ id: MADE, source: "made", shows: "graphic", name: "come-see" });
const KEPT = [
  { id: MADE, tenant_id: A, source: "made", made: { from: F, plan: { ...PLAN, layout: "band", voice: "modern" } } },
];

test("a post says which photo it came from and what it was asked to be, to any member, where the list says neither", async () => {
  const said = await recorded(POST_ROW, { rows: [POST_ROW, fileRow()], kept: KEPT, role: "viewer" });
  assert.equal(said.file.id, MADE);
  assert.deepEqual(said.made.from, { id: F, name: "storefront-dusk" });
  assert.equal(said.made.plan.line, PLAN.line);
  assert.deepEqual(
    [said.made.plan.layout, said.made.plan.voice],
    ["band", "modern"],
    "what was pressed, not a default",
  );
  assert.equal(said.made.plan.file_id, F, "so a new version is drawn from the same photo");
});

test("a post whose photo was deleted since keeps what it was asked to be, and names no photo", async () => {
  const gone = fileRow({ removed_at: "2026-11-02T00:00:00Z" });
  const said = await recorded(POST_ROW, { rows: [POST_ROW, gone], kept: KEPT });
  assert.equal(said.made.from, null);
  assert.equal(said.made.plan.line, PLAN.line);
});

test("a photo, and a post that kept no record, have nothing to say of how they were made", async () => {
  assert.equal((await recorded(fileRow(), { kept: KEPT })).made, null);
  const bare = await recorded(POST_ROW, { rows: [POST_ROW], kept: [{ id: MADE, tenant_id: A, made: null }] });
  assert.equal(bare.made, null);
  assert.equal(bare.file.id, MADE);
});

test("a file another workspace's, or removed, is not read", async () => {
  await assert.rejects(
    recorded(fileRow({ id: MADE }), { rows: [] }),
    (e) => e.code === "not_found",
    "the caller's own read of the row comes first",
  );
});

test("a new version saved is another file: the post it came from is left, and what was pressed is what it keeps", async () => {
  const { asked, ctx } = world({ rows: [POST_ROW, fileRow()] });
  const changed = { ...PLAN, line: "Now open late.", layout: "frame" };
  const made = await save.POST.run(post(changed), ctx);
  assert.ok(made.file_id);
  assert.notEqual(made.file_id, MADE);
  assert.equal(asked.made[0].p_made.from, F);
  assert.equal(asked.made[0].p_made.plan.layout, "frame");
  assert.deepEqual(asked.removed, [], "nothing of the old one goes");
});

test("a kept post gives each shape, under its own name; a photo has its one picture whatever is asked", async () => {
  const post_ = fileRow({ id: MADE, source: "made", shows: "graphic", name: "come-see" });
  assert.match(
    await viewed("download&shape=story", post_),
    new RegExp(`${MADE}/story\\.jpg.*download=come-see-story\\.jpg`),
  );
  assert.match(await viewed("download&shape=square", post_), new RegExp(`${MADE}/square\\.jpg`));
  assert.match(
    await viewed("download&shape=portrait", post_),
    new RegExp(`${MADE}/original\\.jpg.*download=come-see-portrait\\.jpg`),
  );
  assert.match(await viewed("shape=story", post_), new RegExp(`${MADE}/story\\.jpg`));
  assert.match(
    await viewed("download&shape=story", fileRow()),
    new RegExp(`${F}/original\\.jpg.*download=storefront-dusk\\.jpg`),
  );
  assert.match(
    await viewed("download&shape=../../x", post_),
    new RegExp(`${MADE}/original\\.jpg`),
    "only a shape it has",
  );
});

test("a post is never resized: it is drawn at its own size, and a resize would only count against Storage's allowance", async () => {
  const post_ = fileRow({ id: MADE, source: "made", shows: "graphic", name: "come-see" });
  for (const q of ["w=480", "w=1280", "shape=square&w=480"]) assert.doesNotMatch(await viewed(q, post_), /w=\d/, q);
  assert.match(await viewed("w=480", fileRow()), /w=480/, "a photo is");
});
