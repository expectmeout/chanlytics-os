/**
 * A workspace's logo through its routes (00407): the real route modules, run over a database in memory, a storage that
 * records what it was asked, and a network that answers what each test says. What is proved is who may, what is stored
 * and removed, what the door is asked, and what a look on the business's website answers.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { fakeDb } from "../_fake-db.mjs";
import { LOGO_WORDS, parseTenantConfig } from "@chanlytics/contracts";
import { setPublicFetch } from "@chanlytics/channels";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const logo = await import(at("apps/dashboard/app/api/v1/workspaces/logo/route.ts"));
const lookup = await import(at("apps/dashboard/app/api/v1/workspaces/logo/lookup/route.ts"));
const workspaces = await import(at("apps/dashboard/app/api/v1/workspaces/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const ORIGIN = "http://127.0.0.1:1";
const PUBLIC = `${ORIGIN}/storage/v1/object/public/workspace-logos/`;
const OLD_A = `${A}/11111111-1111-4111-8111-111111111111.png`;
const OF_B = `${B}/22222222-2222-4222-8222-222222222222.png`;

/** The storage the service role sees: every call recorded, a failure where a test asks for one. */
function storage({ uploadError = null } = {}) {
  const calls = [];
  const client = {
    storage: {
      from: (bucket) => ({
        upload: async (p, bytes, opts) => {
          calls.push({ op: "upload", bucket, path: p, bytes, opts });
          return { data: uploadError ? null : { path: p }, error: uploadError };
        },
        remove: async (paths) => {
          calls.push({ op: "remove", bucket, paths });
          return { data: [], error: null };
        },
      }),
    },
  };
  return { client, calls };
}

/** The door, as a test says it answers: the address it held, or the database's refusal. */
function door(answer) {
  const asked = [];
  return {
    asked,
    rpcs: {
      set_workspace_logo: (args) => {
        asked.push(args);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  };
}

const membership = (role = "owner") => [
  { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
];
const ctxFor = (tables, rpcs) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
const send = (method, body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** A square PNG as a canvas writes one: eight bits, truecolour with alpha, the picture a pattern. */
function canvasPng(side = 256) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((1 + side * 4) * side);
  for (let i = 0; i < raw.length; i++) raw[i] = i % (1 + side * 4) === 0 ? 0 : (i * 31) & 0xff;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("iCCP", Buffer.from("profile\0\0x")),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

beforeEach(() => setRateStore(memoryStore()));
afterEach(() => {
  setServiceClient(null);
  setPublicFetch(null);
});

test("the three declare their policy: whoever may change the workspace's settings, each counted in a bucket of its own", () => {
  const policy = (rate) => ({ kind: "write", scope: "workspace", role: "partner", rate, spend: false });
  assert.deepEqual(logo.PUT.policy, policy("workspace_logo"));
  assert.deepEqual(logo.DELETE.policy, policy("workspace_logo"));
  assert.deepEqual(lookup.POST.policy, policy("workspace_logo_lookup"));
});

test("a save stores the picture remade, in the workspace's own folder under a new name, sets it through the door, and removes the one before", async () => {
  const s = storage();
  setServiceClient(s.client);
  const d = door(OLD_A);
  const out = await logo.PUT.run(
    send("PUT", { image: canvasPng().toString("base64") }),
    ctxFor({ memberships: membership() }, d.rpcs),
  );
  const up = s.calls.find((c) => c.op === "upload");
  assert.equal(up.bucket, "workspace-logos");
  assert.match(up.path, new RegExp(`^${A}/[0-9a-f-]{36}\\.png$`), "the workspace's folder, a random name");
  assert.deepEqual(up.opts, { contentType: "image/png", cacheControl: "86400", upsert: false });
  assert.ok(
    !Buffer.from(up.bytes).includes(Buffer.from("iCCP")),
    "remade from its pixels: the encoder's chunks are gone",
  );
  assert.deepEqual(d.asked, [{ p_tenant_id: A, p_logo_path: up.path }], "the door, on the member's own session");
  assert.deepEqual(
    s.calls.filter((c) => c.op === "remove").map((c) => c.paths),
    [[OLD_A]],
    "the picture it wore before is let go, after the door took the new one",
  );
  assert.deepEqual(out, { logo_url: `${PUBLIC}${up.path}` });
});

test("a picture the door answers as another workspace's, or none, is never removed", async () => {
  for (const before of [OF_B, null, "not/a/path.png"]) {
    const s = storage();
    setServiceClient(s.client);
    await logo.PUT.run(
      send("PUT", { image: canvasPng(128).toString("base64") }),
      ctxFor({ memberships: membership() }, door(before).rpcs),
    );
    assert.deepEqual(
      s.calls.filter((c) => c.op === "remove"),
      [],
      String(before),
    );
  }
});

test("a save the door refuses removes the picture it stored at once, and says the door's words", async () => {
  const s = storage();
  setServiceClient(s.client);
  const no = Object.assign(new Error("Only someone who may change this workspace's settings can change its logo."), {
    code: "42501",
  });
  await refused(
    logo.PUT.run(
      send("PUT", { image: canvasPng().toString("base64") }),
      ctxFor({ memberships: membership() }, door(no).rpcs),
    ),
    "forbidden",
    403,
    "change its logo",
  );
  const up = s.calls.find((c) => c.op === "upload");
  assert.deepEqual(
    s.calls.find((c) => c.op === "remove").paths,
    [up.path],
    "nothing left public that no workspace wears",
  );
});

test("anything but a PNG of the kept shape is refused in the owner's words, before anything is stored or asked", async () => {
  const s = storage();
  setServiceClient(s.client);
  const d = door(null);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(64)]).toString("base64");
  const tooBig = canvasPng(512).toString("base64");
  for (const image of [jpeg, tooBig, "not base64!", "abc", "A".repeat(349_532), ""])
    await refused(
      logo.PUT.run(send("PUT", { image }), ctxFor({ memberships: membership() }, d.rpcs)),
      "validation",
      400,
      LOGO_WORDS.unusable,
    );
  assert.deepEqual(s.calls, [], "nothing stored");
  assert.deepEqual(d.asked, [], "the door never asked");
});

test("a member who may not change the workspace's settings is refused before a byte is read", async () => {
  const s = storage();
  setServiceClient(s.client);
  for (const role of ["viewer", "operator"])
    await refused(
      logo.PUT.run(
        send("PUT", { image: canvasPng().toString("base64") }),
        ctxFor({ memberships: membership(role) }, door(null).rpcs),
      ),
      "forbidden",
      403,
    );
  assert.deepEqual(s.calls, []);
});

test("storage that refuses the picture is said in the owner's words, and the door is not asked", async () => {
  setServiceClient(storage({ uploadError: { message: "the bucket is full" } }).client);
  const d = door(null);
  await refused(
    logo.PUT.run(send("PUT", { image: canvasPng().toString("base64") }), ctxFor({ memberships: membership() }, d.rpcs)),
    "internal",
    503,
    LOGO_WORDS.notSaved,
  );
  assert.deepEqual(d.asked, []);
});

test("taking the logo away clears it through the door and removes the picture it wore", async () => {
  const s = storage();
  setServiceClient(s.client);
  const d = door(OLD_A);
  const out = await logo.DELETE.run(send("DELETE"), ctxFor({ memberships: membership() }, d.rpcs));
  assert.deepEqual(d.asked, [{ p_tenant_id: A, p_logo_path: "" }]);
  assert.deepEqual(s.calls, [{ op: "remove", bucket: "workspace-logos", paths: [OLD_A] }]);
  assert.deepEqual(out, { logo_url: null });
});

test("where you are answers each workspace's logo as the address it is served at, never its path; a database before 00407 answers none", async () => {
  const tables = {
    memberships: membership(),
    tenants: [
      {
        id: A,
        slug: "harbor",
        name: "Harbor",
        status: "active",
        timezone: "America/New_York",
        logo_path: OLD_A,
      },
    ],
    profiles: [],
  };
  const rpcs = { platform_staff_state: () => "none" };
  const home = await workspaces.GET.run(new Request("http://localhost/api/v1/x"), ctxFor(tables, rpcs));
  assert.equal(home.workspaces[0].logo_url, `${PUBLIC}${OLD_A}`);
  assert.ok(!("logo_path" in home.workspaces[0]), "the storage path never reaches the browser");
  // A database that has not reached 00407 answers "column does not exist" for logo_path: read again without it.
  const db = fakeDb(tables, {}, rpcs);
  const older = {
    ...db,
    from: (t) => {
      const q = db.from(t);
      if (t !== "tenants") return q;
      return {
        select: (cols, o) =>
          /\blogo_path\b/.test(String(cols))
            ? {
                order: async () => ({
                  data: null,
                  error: { message: "column tenants.logo_path does not exist", code: "42703" },
                }),
              }
            : q.select(cols, o),
      };
    },
  };
  const before = await workspaces.GET.run(new Request("http://localhost/api/v1/x"), {
    supabase: older,
    userId: USER,
    email: "ada@example.com",
    params: {},
  });
  assert.deepEqual(
    before.workspaces.map((w) => [w.slug, w.logo_url]),
    [["harbor", null]],
    "no logo, and the rest of the row as ever",
  );
});

/* ---------------------------------------------------------------------- the look on the website -- */

const CONFIG = (website) => ({
  brain: {
    business_name: "Bella Studio",
    system_prompt: "x".repeat(50),
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: website ? { website } : {},
  },
});

/** The workspace's tables for a look: its config (the owner's website) and its linked listing (Google's). */
function lookTables({ own = null, google = null } = {}) {
  return {
    tables: {
      memberships: membership(),
      google_listings: google
        ? [{ tenant_id: A, place_id: "p1", name: "Bella Studio", address: null, facts: { website: google } }]
        : [],
    },
    rpcs: {
      tenant_config_read: () =>
        own === undefined
          ? null
          : { tenant_id: A, config: CONFIG(own), version: 1, updated_at: "2026-10-01T00:00:00Z", feed_hidden: false },
    },
  };
}

/** A PNG's first bytes, saying its size: all the lookup reads of a picture. */
function pngHead(w, h) {
  const b = Buffer.alloc(64);
  b.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

/** The network: each address a test names answers what it says; anything else is not reached. */
function network(pages) {
  const asked = [];
  setPublicFetch(async (url) => {
    asked.push(String(url));
    const said = pages[String(url)];
    if (!said) throw new TypeError("fetch failed");
    return new Response(said.body, { status: 200, headers: { "content-type": said.type } });
  });
  return asked;
}

const html = (head) => ({ type: "text/html; charset=utf-8", body: `<html><head>${head}</head><body></body></html>` });

test("a config the test builds is one the app reads, so the owner's website is what the look reads first", () => {
  assert.equal(
    parseTenantConfig(CONFIG("https://bellastudio.example.com"))?.brain?.profile?.website,
    "https://bellastudio.example.com",
  );
});

test("the look reads the owner's website, finds what it declares as its logo, and answers the picture with the site's host", async () => {
  const asked = network({
    "https://bellastudio.example.com": html(
      '<script type="application/ld+json">{"@type":"Organization","logo":"https://cdn.example.net/bella-logo.png"}</script>',
    ),
    "https://cdn.example.net/bella-logo.png": { type: "image/png", body: pngHead(400, 300) },
  });
  const { tables, rpcs } = lookTables({
    own: "https://www.bellastudio.example.com/about",
    google: "https://other.example.org",
  });
  const out = await lookup.POST.run(send("POST"), ctxFor(tables, rpcs));
  assert.equal(out.outcome, "found");
  assert.equal(out.host, "bellastudio.example.com", "the website's host the owner gave, never the image's");
  assert.equal(out.image.content_type, "image/png");
  assert.deepEqual(Buffer.from(out.image.base64, "base64"), pngHead(400, 300));
  assert.deepEqual(
    asked,
    [
      "https://www.bellastudio.example.com",
      "https://bellastudio.example.com",
      "https://cdn.example.net/bella-logo.png",
    ],
    "the website as the owner typed it first, then its other spelling, which answers here",
  );
});

test("a website that is a page on another service is not looked at: its logo would be the service's", async () => {
  const asked = network({});
  const { tables, rpcs } = lookTables({
    own: "https://www.facebook.com/bellastudio",
    google: "https://booksy.com/en-us/123_bella",
  });
  assert.deepEqual(await lookup.POST.run(send("POST"), ctxFor(tables, rpcs)), { outcome: "not_its_own", host: null });
  assert.deepEqual(asked, [], "nothing asked of anyone");
});

test("the owner's website being another service's page, the listing's own website is looked at instead", async () => {
  network({
    "https://bella.example.org": html('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">'),
    "https://bella.example.org/apple-touch-icon.png": { type: "image/png", body: pngHead(180, 180) },
  });
  const { tables, rpcs } = lookTables({ own: "https://instagram.com/bella", google: "https://bella.example.org" });
  const out = await lookup.POST.run(send("POST"), ctxFor(tables, rpcs));
  assert.equal(out.outcome, "found");
  assert.equal(out.host, "bella.example.org");
});

test("no website at all says so; a site that cannot be reached says so; one with nothing usable says so", async () => {
  network({
    "https://quiet.example.com": html(
      [
        '<link rel="icon" type="image/svg+xml" href="/mark.svg">',
        '<link rel="icon" href="/favicon.ico">',
        '<link rel="apple-touch-icon" href="https://quiet.example.com:8443/touch.png">',
        '<link rel="icon" sizes="64x64" href="/small.png">',
      ].join(""),
    ),
    "https://quiet.example.com/small.png": { type: "image/png", body: pngHead(64, 64) },
  });
  assert.deepEqual(await lookup.POST.run(send("POST"), ctxFor(lookTables().tables, lookTables().rpcs)), {
    outcome: "no_website",
    host: null,
  });
  const down = lookTables({ own: "https://down.example.com" });
  assert.deepEqual(await lookup.POST.run(send("POST"), ctxFor(down.tables, down.rpcs)), {
    outcome: "unreachable",
    host: "down.example.com",
  });
  const quiet = lookTables({ own: "https://quiet.example.com" });
  assert.deepEqual(
    await lookup.POST.run(send("POST"), ctxFor(quiet.tables, quiet.rpcs)),
    { outcome: "none", host: "quiet.example.com" },
    "an SVG, a favicon file, a candidate on another port and a picture too small are each passed over",
  );
});

test("our own website is no business's logo", async () => {
  const asked = network({});
  const { tables, rpcs } = lookTables({ own: "https://app.chanlytics.com/b/bella" });
  assert.deepEqual(await lookup.POST.run(send("POST"), ctxFor(tables, rpcs)), { outcome: "not_its_own", host: null });
  assert.deepEqual(asked, []);
});
