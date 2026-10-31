/**
 * A workspace's logo through its routes (00407): the real route modules, run over a database in memory, a storage that
 * records what it was asked, and an edge that answers what each test says. What is proved is who may, what is stored
 * and removed, what the door is asked, and that a look on the business's website is the edge's, handed on as it said.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { fakeDb } from "../_fake-db.mjs";
import { LOGO_WORDS } from "@chanlytics/contracts";

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
  // A 512 square is shrunk to the circle now (core logo-png.ts); past LOGO_FOUND_SIDE_MAX is still no logo.
  const tooBig = canvasPng(2049).toString("base64");
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

/**
 * The edge, as a test says its door answers (POST /api/admin/imports/logo-lookup; the look itself is held by
 * a-logo-is-looked-for-on-the-website.test.mjs): every call kept with the address it asked and the body it sent.
 */
function edge(answer) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body ?? "{}")) });
    const a = typeof answer === "function" ? await answer() : answer;
    return a instanceof Response
      ? a
      : new Response(JSON.stringify(a), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}
const look = () => lookup.POST.run(send("POST"), ctxFor({ memberships: membership() }));

test("the look is the edge's: the route asks its door for the member's workspace and hands on what it found", async () => {
  const image = { base64: Buffer.from("a picture").toString("base64"), content_type: "image/png" };
  const found = edge({ ok: true, outcome: "found", host: "bellastudio.example.com", image });
  try {
    assert.deepEqual(await look(), { outcome: "found", host: "bellastudio.example.com", image });
  } finally {
    found.restore();
  }
  assert.equal(found.calls.length, 1);
  assert.ok(found.calls[0].url.endsWith("/api/admin/imports/logo-lookup"), found.calls[0].url);
  assert.deepEqual(found.calls[0].body, { tenant_id: A });
  for (const said of [
    { outcome: "none", host: "quiet.example.com" },
    { outcome: "unreachable", host: "down.example.com" },
    { outcome: "no_website", host: null },
  ]) {
    const e = edge({ ok: true, ...said });
    try {
      assert.deepEqual(await look(), said);
    } finally {
      e.restore();
    }
  }
});

test("an edge that did not answer, refused, or answered no look is said in the owner's words, never as their website's fault", async () => {
  for (const answer of [
    () => {
      throw new TypeError("fetch failed");
    },
    () => new Response(JSON.stringify({ ok: false, error: "no_database" }), { status: 503 }),
    { ok: true, outcome: "found", host: "bellastudio.example.com" },
    { ok: true },
  ]) {
    const e = edge(answer);
    try {
      await refused(look(), "internal", 502, LOGO_WORDS.lookFailed);
    } finally {
      e.restore();
    }
  }
});
