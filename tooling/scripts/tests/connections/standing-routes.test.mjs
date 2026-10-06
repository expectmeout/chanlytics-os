/**
 * The two routes Settings > Connections reads while it is open, run through route(): GET /api/v1/lines/codes (the one-time
 * codes texted to the workspace's own line) and POST /api/v1/channels/whatsapp/standing (what Meta holds about the number now).
 * The real route modules, their `run` called with a database in memory and a captured wire to the edge.
 *   - the policy each declares: the owner's or the partner's door, as Connect WhatsApp is, in a bucket of its own;
 *   - a viewer and an operator are refused in words and the edge is not asked; an owner and a partner's seat are let in;
 *   - what the edge is asked: a token for that door, bound to the workspace and the person the route is for (and to the body, for
 *     the one that sends one); what comes back is what the edge said, as the page holds it, a malformed code dropped and never mended;
 *   - what the edge refuses, said in the owner's words; the buckets count apart.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyEdgeToken, edgeBodyMatches } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

const SECRET = "edge-secret-for-this-file";
process.env.EDGE_CALL_SECRET = SECRET;
// A deployment that may reach its providers (the dashboard's own gate: a preview answers "not here"), and no key beside the token.
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore, RATE } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const codes = await import(at("apps/dashboard/app/api/v1/lines/codes/route.ts"));
const standing = await import(at("apps/dashboard/app/api/v1/channels/whatsapp/standing/route.ts"));
beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const membership = (role) => ({
  user_id: USER,
  tenant_id: A,
  role,
  tenants: { slug: "harbor" },
  created_at: "2026-01-01T00:00:00Z",
});
/** A member's session over these tables, past the second factor a partner's seat asks for (0013). */
const ctxFor = (role) => ({
  supabase: fakeDb({ memberships: [membership(role)] }),
  userId: USER,
  email: "ada@example.com",
  aal: "aal2",
  params: {},
});
const inA = `?workspace=${A}`;
const get = () => new Request(`http://localhost/api/v1/x${inA}`);
const post = () => new Request(`http://localhost/api/v1/x${inA}`, { method: "POST" });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

/** The edge, as far as these routes can see it: every request kept, answered by `reply(path)`. */
function edge(reply) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    seen.push({ path: u.pathname, method: init.method, init });
    const a = reply(u.pathname);
    if (a === "throws") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(a.body ?? {}), {
      status: a.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return {
    seen,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** What a captured request's token says for its own door, and whether it binds the body sent. */
function claimsOf({ path: aud, init }) {
  const v = verifyEdgeToken(SECRET, init.headers["x-edge-token"], aud);
  assert.equal(v.ok, true, `${aud}: a token for this door`);
  assert.equal(init.headers["x-diag-key"], undefined, "no key beside it");
  return {
    ws: v.claims.ws,
    user: v.claims.user,
    bound: init.body === undefined || edgeBodyMatches(v.claims, init.body),
  };
}

test("both declare the owner's door, as Connect WhatsApp does, each in a bucket of its own", () => {
  assert.deepEqual(codes.GET.policy, {
    kind: "read",
    scope: "workspace",
    role: "partner",
    rate: "lines_codes",
    spend: false,
  });
  assert.deepEqual(standing.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "whatsapp_standing",
    spend: false,
  });
  assert.deepEqual(
    [RATE.lines_codes.limit, RATE.lines_codes.windowMs],
    [40, 60_000],
    "the page asks every three seconds while Meta's window is open, and once on opening",
  );
  assert.deepEqual(
    [RATE.whatsapp_standing.limit, RATE.whatsapp_standing.windowMs],
    [12, 3_600_000],
    "a Graph read each, asked only on a standing that is missing or not available",
  );
});

test("a viewer and an operator are refused in words and the edge is not asked; an owner and a partner's seat are let in", async () => {
  const w = edge(() => ({ body: { ok: true, codes: [], kept: "same", can_send: "AVAILABLE" } }));
  try {
    for (const role of ["viewer", "operator"]) {
      await refused(codes.GET.run(get(), ctxFor(role)), "forbidden", 403, "Only an owner");
      await refused(standing.POST.run(post(), ctxFor(role)), "forbidden", 403, "Only an owner");
    }
    assert.deepEqual(w.seen, []);
    for (const role of ["owner", "partner"]) {
      assert.deepEqual(await codes.GET.run(get(), ctxFor(role)), { codes: [] }, role);
      assert.deepEqual(await standing.POST.run(post(), ctxFor(role)), { kept: "same", can_send: "AVAILABLE" }, role);
    }
  } finally {
    w.restore();
  }
});

test("GET lines/codes asks the edge for this workspace and this person, and answers the codes it read as the page holds them: a malformed one is dropped, never mended", async () => {
  const w = edge(() => ({
    body: {
      ok: true,
      codes: [
        { code: "788-963", from: "WhatsApp", at: "2026-10-06T14:58:00.000Z" },
        { code: "482913", from: null, at: "2026-10-06T14:50:00.000Z" },
        { code: "123456", at: "2026-10-06T14:40:00.000Z" },
        { code: 7, from: "x", at: "2026-10-06T14:30:00.000Z" },
        { code: "1", from: "x", at: 5 },
        null,
        "x",
      ],
    },
  }));
  let body;
  try {
    body = await codes.GET.run(get(), ctxFor("owner"));
  } finally {
    w.restore();
  }
  assert.deepEqual(body, {
    codes: [
      { code: "788-963", from: "WhatsApp", at: "2026-10-06T14:58:00.000Z" },
      { code: "482913", from: null, at: "2026-10-06T14:50:00.000Z" },
      { code: "123456", from: null, at: "2026-10-06T14:40:00.000Z" },
    ],
  });
  assert.deepEqual(
    w.seen.map((r) => [r.path, r.method]),
    [["/api/admin/lines/codes", "GET"]],
  );
  assert.deepEqual(claimsOf(w.seen[0]), { ws: A, user: USER, bound: true });
});

test("GET lines/codes: an edge that could not read them is said in words, never an empty list that reads as nobody writing", async () => {
  for (const reply of [
    () => ({ status: 502, body: { ok: false, error: "provider_refused" } }),
    () => ({ body: { ok: true } }),
    () => "throws",
  ]) {
    const w = edge(reply);
    try {
      await refused(codes.GET.run(get(), ctxFor("owner")), "internal", 502, "could not be read");
    } finally {
      w.restore();
    }
  }
});

test("POST channels/whatsapp/standing asks the edge to read what Meta holds for this workspace, as this person, and answers what was kept and Meta's word -- and nothing else", async () => {
  const w = edge(() => ({
    body: { ok: true, kept: "first", can_send: "BLOCKED", detail: "A payment method is required" },
  }));
  let body;
  try {
    body = await standing.POST.run(post(), ctxFor("owner"));
  } finally {
    w.restore();
  }
  assert.deepEqual(body, { kept: "first", can_send: "BLOCKED" });
  assert.deepEqual(
    w.seen.map((r) => [r.path, r.method, r.init.body]),
    [["/api/admin/whatsapp/standing", "POST", JSON.stringify({ tenant_id: A, user_id: USER })]],
  );
  assert.deepEqual(claimsOf(w.seen[0]), { ws: A, user: USER, bound: true });
});

test("POST channels/whatsapp/standing says what the edge refused in the owner's words: no number is a conflict, the rest is Meta's and ours to try again", async () => {
  const says = async (status, error) => {
    const w = edge(() => ({ status, body: { ok: false, error } }));
    try {
      return await standing.POST.run(post(), ctxFor("owner")).then(
        () => null,
        (e) => [e.code, e.status, e.message],
      );
    } finally {
      w.restore();
    }
  };
  assert.deepEqual(await says(409, "no_channel"), [
    "conflict",
    409,
    "This workspace has no WhatsApp number connected.",
  ]);
  assert.deepEqual(await says(503, "no_token"), [
    "upstream_meta",
    502,
    "Chanlytics could not read this number's WhatsApp credentials. Connect the number again and try again.",
  ]);
  assert.deepEqual(await says(502, "meta_failed"), [
    "upstream_meta",
    502,
    "Meta did not answer. Try again in a moment.",
  ]);
  assert.deepEqual(await says(503, "channel_read_failed"), [
    "upstream_meta",
    502,
    "Chanlytics could not read the workspace's WhatsApp number just now. Try again in a moment.",
  ]);
  assert.deepEqual(await says(500, "something_new"), [
    "upstream_meta",
    502,
    "Meta's answer about the number could not be read (something_new).",
  ]);
  // An edge that said yes and nothing of what Meta holds is a failed read, never a standing guessed.
  const w = edge(() => ({ body: { ok: true } }));
  try {
    await refused(standing.POST.run(post(), ctxFor("owner")), "upstream_meta", 502, "could not be read (edge 200)");
  } finally {
    w.restore();
  }
});

test("the two buckets count apart, and a refusal says which: forty a minute for the codes, twelve an hour for the check", async () => {
  const w = edge(() => ({ body: { ok: true, codes: [], kept: "same", can_send: "AVAILABLE" } }));
  try {
    for (let i = 0; i < RATE.whatsapp_standing.limit; i++) await standing.POST.run(post(), ctxFor("owner"));
    await refused(standing.POST.run(post(), ctxFor("owner")), "rate_limited", 429, "checks of your WhatsApp number");
    assert.deepEqual(await codes.GET.run(get(), ctxFor("owner")), { codes: [] }, "the check's count is not the codes'");
    for (let i = 1; i < RATE.lines_codes.limit; i++) await codes.GET.run(get(), ctxFor("owner"));
    await refused(codes.GET.run(get(), ctxFor("owner")), "rate_limited", 429, "checks for codes");
  } finally {
    w.restore();
  }
});
