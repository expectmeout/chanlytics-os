/**
 * Billing, run through route(): the real route modules, their `run` called
 * with a database in memory. What is proved is the policy each declares and
 * what the handler answers. Every verb reaches Stripe through the edge, which
 * this machine has no credential for: each stops there, in the owner's
 * words. The 402 door on the two routes that spend is run, not read.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { forgetBillingReadiness } = await import(at("apps/dashboard/src/server/workspace/billing.ts"));
const billing = await import(at("apps/dashboard/app/api/v1/billing/route.ts"));
const checkout = await import(at("apps/dashboard/app/api/v1/billing/checkout/route.ts"));
const portal = await import(at("apps/dashboard/app/api/v1/billing/portal/route.ts"));
const invoices = await import(at("apps/dashboard/app/api/v1/billing/invoices/route.ts"));
const resume = await import(at("apps/dashboard/app/api/v1/billing/resume/route.ts"));
const sync = await import(at("apps/dashboard/app/api/v1/billing/sync/route.ts"));
const buy = await import(at("apps/dashboard/app/api/v1/lines/buy/route.ts"));

beforeEach(() => {
  setRateStore(memoryStore());
  forgetBillingReadiness();
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const membership = (role) => ({
  user_id: USER,
  tenant_id: T,
  role,
  tenants: { slug: "harbor" },
  created_at: "2026-01-01T00:00:00Z",
});
const account = (over = {}) => ({
  tenant_id: T,
  mode: "stripe",
  status: "trialing",
  price_id: "price_1",
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
  trial_end: "2026-09-20T00:00:00Z",
  current_period_end: "2026-09-20T00:00:00Z",
  cancel_at: null,
  cancel_at_period_end: false,
  card_brand: "visa",
  card_last4: "4242",
  last_payment_failed_at: null,
  last_paid_at: null,
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});
const tables = (role, over = {}) => ({
  memberships: [membership(role)],
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  billing_accounts: [account()],
  ...over,
});
const ctxFor = (t) => ({ supabase: fakeDb(t), userId: USER, email: "ada@example.com", params: {} });
const get = () => new Request(`http://localhost/api/v1/x?workspace=${T}`);
const send = (method, body) =>
  new Request(`http://localhost/api/v1/x?workspace=${T}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("GET billing: the row as a member may read it, whether this deployment can charge, and no id and no role", async () => {
  const out = await billing.GET.run(get(), ctxFor(tables("viewer")));
  assert.equal(out.billing.ready, false, "no edge credential here: nothing draws a verb that cannot work");
  assert.deepEqual(
    [out.billing.account.mode, out.billing.account.status, out.billing.account.card_last4],
    ["stripe", "trialing", "4242"],
  );
  assert.ok(
    !("stripe_customer_id" in out.billing.account) && !("stripe_subscription_id" in out.billing.account),
    "Stripe's ids stay on the server",
  );
  assert.ok(!("role" in out.billing), "the page draws its buttons from the session's own role, not a field on the row");
  assert.deepEqual([out.billing.price, out.billing.trial_days], [null, 14]);
  const none = await billing.GET.run(get(), ctxFor(tables("viewer", { billing_accounts: [] })));
  assert.equal(none.billing.account, null, "no row reads as a direct arrangement on the page, never as a debt");
});

test("the doors declare who may press them, and each stops at the edge credential in the owner's words", async () => {
  await refused(checkout.POST.run(send("POST", {}), ctxFor(tables("operator"))), "forbidden", 403);
  await refused(
    checkout.POST.run(send("POST", {}), ctxFor(tables("owner"))),
    "upstream_auth",
    503,
    "no_edge_credential",
  );
  await refused(portal.POST.run(send("POST", {}), ctxFor(tables("viewer"))), "forbidden", 403);
  await refused(portal.POST.run(send("POST", {}), ctxFor(tables("owner"))), "upstream_auth", 503, "no_edge_credential");
  await refused(invoices.GET.run(get(), ctxFor(tables("operator"))), "forbidden", 403);
  await refused(invoices.GET.run(get(), ctxFor(tables("owner"))), "upstream_auth", 503, "no_edge_credential");
  await refused(resume.POST.run(send("POST", {}), ctxFor(tables("operator"))), "forbidden", 403);
  await refused(resume.POST.run(send("POST", {}), ctxFor(tables("owner"))), "upstream_auth", 503);
  await refused(sync.POST.run(send("POST", {}), ctxFor(tables("viewer"))), "forbidden", 403);
  await refused(sync.POST.run(send("POST", {}), ctxFor(tables("operator"))), "upstream_auth", 503);
});

test("reading the invoices spends its own bucket, never Checkout's", async () => {
  const ctx = ctxFor(tables("owner"));
  for (let i = 0; i < 25; i++) await refused(invoices.GET.run(get(), ctx), "upstream_auth", 503);
  await refused(checkout.POST.run(send("POST", {}), ctx), "upstream_auth", 503, "no_edge_credential");
});

test("the 402 door on a route that spends: a failed card, a missing row, and a direct arrangement that passes to the edge", async () => {
  const body = { number: "+13055550142", area_code: "305" };
  await refused(
    buy.POST.run(send("POST", body), ctxFor(tables("owner", { billing_accounts: [account({ status: "past_due" })] }))),
    "payment_required",
    402,
    "Your last payment did not go through. Update the card in Billing, then try again.",
  );
  await refused(
    buy.POST.run(send("POST", body), ctxFor(tables("owner", { billing_accounts: [] }))),
    "payment_required",
    402,
    "This workspace has no billing record. Open Billing to set one up.",
  );
  await refused(
    buy.POST.run(send("POST", body), ctxFor(tables("owner", { billing_accounts: [account({ status: "none" })] }))),
    "payment_required",
    402,
  );
  await assert.rejects(
    buy.POST.run(
      send("POST", body),
      ctxFor(tables("owner", { billing_accounts: [account({ mode: "direct", status: "active" })] })),
    ),
    (e) => {
      assert.notEqual(e.code, "payment_required", "a direct arrangement may spend");
      assert.ok(e.message.includes("no_edge_credential"), "and stops at the edge, past the door");
      return true;
    },
  );
  await refused(
    buy.POST.run(send("POST", body), ctxFor(tables("operator", { billing_accounts: [account({ status: "active" })] }))),
    "forbidden",
    403,
    undefined,
  );
});
