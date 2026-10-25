/**
 * Checkout comes back to where it was asked from (F4).
 *
 * Stripe's success and cancel addresses are built on the edge (billing-door.test.mjs runs that half). The first run
 * starts the trial from its own step and must come back to it, not to Settings › Billing. Run here: the dashboard's
 * checkout route over a fake edge, with the production guard open, recording the body it sends -- a place on the
 * closed list rides along, anything else is refused before the edge is asked. And the first run's Go live paying in the
 * page (decision 0073, R16): `embedded` rides along, and the session's secret and key come back for the page to mount.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The guard is read once, as its module loads: open it before the route is imported.
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const checkout = await import(at("apps/dashboard/app/api/v1/billing/checkout/route.ts"));
beforeEach(() => setRateStore(memoryStore()));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";

/**
 * The edge's billing door: records every body, answers a Checkout address -- or, asked for the page while it holds a
 * publishable key (`edgeKey`), the session's secret and the key.
 */
const asked = [];
let edgeKey = "pk_test_made_up_for_this_file";
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith("/api/admin/billing")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    asked.push(body);
    const made =
      body.embedded && edgeKey
        ? { ok: true, client_secret: "cs_e_secret_abc", publishable_key: edgeKey }
        : { ok: true, url: "https://checkout.stripe.test/cs_1" };
    return new Response(JSON.stringify(made), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: false, error: "shut" }), { status: 503 });
};

const ctx = () => ({
  supabase: fakeDb({ memberships: [{ user_id: USER, tenant_id: T, role: "owner", tenants: { slug: "harbor" } }] }),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
const post = (body) =>
  new Request(`http://localhost/api/v1/billing/checkout?workspace=${T}`, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("F4: the first run's word rides to the edge; Billing's callers send nothing and are unchanged", async () => {
  asked.length = 0;
  assert.deepEqual(await checkout.POST.run(post({ return: "start" }), ctx()), {
    url: "https://checkout.stripe.test/cs_1",
  });
  assert.deepEqual(await checkout.POST.run(post({}), ctx()), { url: "https://checkout.stripe.test/cs_1" });
  assert.deepEqual(
    asked.map((b) => [b.op, b.tenant_id, b.return]),
    [
      ["checkout", T, "start"],
      ["checkout", T, undefined],
    ],
    "the place on the list rides along; nothing said, nothing sent",
  );
});

test("F4: a place that is not on the list is refused before the edge is asked", async () => {
  asked.length = 0;
  for (const junk of ["https://evil.example/steal", "admin/billing", 7, null]) {
    await assert.rejects(checkout.POST.run(post({ return: junk }), ctx()), (e) => {
      assert.equal(e.code, "validation");
      assert.equal(e.status, 400);
      assert.equal(e.message, "return: Checkout comes back to Billing or to setting up.");
      return true;
    });
  }
  assert.equal(asked.length, 0, "the edge never heard of it");
  // An older page that posts no body at all still reaches Checkout, and comes back to Billing.
  assert.deepEqual(await checkout.POST.run(post(undefined), ctx()), { url: "https://checkout.stripe.test/cs_1" });
  assert.deepEqual(
    asked.map((b) => b.return),
    [undefined],
  );
});

test("the first run pays in the page: embedded rides to the edge, and the session's secret and key come back for Stripe's form; an edge with no key answers the hosted page", async () => {
  asked.length = 0;
  assert.deepEqual(await checkout.POST.run(post({ return: "start", embedded: true }), ctx()), {
    client_secret: "cs_e_secret_abc",
    publishable_key: "pk_test_made_up_for_this_file",
  });
  assert.deepEqual(
    asked.map((b) => [b.return, b.embedded]),
    [["start", true]],
  );
  edgeKey = null;
  try {
    assert.deepEqual(
      await checkout.POST.run(post({ return: "start", embedded: true }), ctx()),
      { url: "https://checkout.stripe.test/cs_1" },
      "the page goes to Stripe's own instead",
    );
  } finally {
    edgeKey = "pk_test_made_up_for_this_file";
  }
  await assert.rejects(checkout.POST.run(post({ embedded: "yes" }), ctx()), (e) => e.code === "validation");
});
