/**
 * The back office and billing's three, run through route(): the real route
 * modules, their `run` called with a database in memory. What is proved is the
 * policy each declares and what the handler answers, not its text. The back
 * office's door is the database's answer to `is_platform_admin`, which the
 * double gives; what lies behind it reaches the service client or the edge,
 * so only the door and the words at it are run here.
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
const overview = await import(at("apps/dashboard/app/api/v1/platform/overview/route.ts"));
const tenant = await import(at("apps/dashboard/app/api/v1/platform/tenants/[id]/route.ts"));
const refile = await import(at("apps/dashboard/app/api/v1/platform/lines/refile/route.ts"));
const release = await import(at("apps/dashboard/app/api/v1/platform/lines/release/route.ts"));
const retry = await import(at("apps/dashboard/app/api/v1/platform/lines/retry/route.ts"));
const invoices = await import(at("apps/dashboard/app/api/v1/billing/invoices/route.ts"));
const resume = await import(at("apps/dashboard/app/api/v1/billing/resume/route.ts"));
const sync = await import(at("apps/dashboard/app/api/v1/billing/sync/route.ts"));
const standing = await import(at("apps/dashboard/app/api/v1/platform/partners/standing/route.ts"));
const payout = await import(at("apps/dashboard/app/api/v1/platform/partners/payout/route.ts"));
const partnerStatus = await import(at("apps/dashboard/app/api/v1/platform/partners/status/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const L1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];
const ctxFor = (tables, params = {}, rpcs = {}) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const inA = `?workspace=${A}`;
const inB = `?workspace=${B}`;
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
/** Every row the code under test wrote, changed or removed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;
/** The database's answer about this session, and everything else the back office reads through its own rpc. */
const admin = (yes, more = {}) => ({ is_platform_admin: () => yes, ...more });

test("the eight declare their policy: the back office on the platform scope with no workspace role, its three actions on their own support ceilings; billing's two writes counted together, its read on its own ceiling", () => {
  const office = { kind: "read", scope: "platform", role: null, rate: null, spend: false };
  const act = (rate) => ({ kind: "write", scope: "platform", role: null, rate, spend: false });
  assert.deepEqual(overview.GET.policy, office);
  assert.deepEqual(tenant.GET.policy, office);
  assert.deepEqual(refile.POST.policy, act("platform_line_refile"));
  assert.deepEqual(release.POST.policy, act("platform_line_release"));
  assert.deepEqual(retry.POST.policy, act("platform_line_retry"));
  // A read of the invoices takes from its own ceiling: pressing Show invoices never locks an owner out of Checkout for the hour.
  assert.deepEqual(invoices.GET.policy, {
    kind: "read",
    scope: "workspace",
    role: "owner",
    rate: "billing_read",
    spend: false,
  });
  assert.deepEqual(resume.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "owner",
    rate: "billing",
    spend: false,
  });
  assert.deepEqual(sync.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "billing",
    spend: false,
  });
});

test("the back office's door: the database says who may look across workspaces, a customer who guessed the URL learns nothing, and a database that cannot answer is not a no", async () => {
  const tables = { memberships: both("owner", "owner") };
  const body = { tenant_id: A, line_id: L1 };
  for (const [name, run] of [
    ["overview", () => overview.GET.run(get(), ctxFor(tables, {}, admin(false)))],
    ["tenant", () => tenant.GET.run(get(), ctxFor(tables, { id: A }, admin(false)))],
    ["refile", () => refile.POST.run(send("POST", body), ctxFor(tables, {}, admin(false)))],
    ["release", () => release.POST.run(send("POST", body), ctxFor(tables, {}, admin(false)))],
    ["retry", () => retry.POST.run(send("POST", body), ctxFor(tables, {}, admin(false)))],
  ]) {
    await refused(run(), "not_found", 404, "No such page.").catch((e) => {
      throw new Error(`${name}: ${e.message}`);
    });
  }
  const hiccup = ctxFor(
    tables,
    {},
    {
      is_platform_admin: () => {
        throw new Error("connection reset");
      },
    },
  );
  await refused(overview.GET.run(get(), hiccup), "internal", 503, "Could not check that just now");
  const refusedAction = ctxFor(tables, {}, admin(false));
  await refused(refile.POST.run(send("POST", body), refusedAction), "not_found", 404);
  assert.equal(writes(refusedAction), 0, "nothing recorded for a person the database did not admit");
});

test("behind the door: the overview is the database's own list; a workspace's page and the three actions check their ids before anything reaches the service client or the edge", async () => {
  const tables = { memberships: both("owner", "owner") };
  const rows = [
    { id: A, slug: "harbor", name: "Harbor", status: "active" },
    { id: B, slug: "bayside", name: "Bayside", status: "active" },
  ];
  const out = await overview.GET.run(get(), ctxFor(tables, {}, admin(true, { platform_overview: () => rows })));
  assert.deepEqual(out.tenants, rows);
  // The platform's health rides on this same read. It goes through the
  // SERVICE-role client, which this test has no handle on, so both of its rpcs
  // fail here — and that is the property worth proving: the back office is
  // opened precisely when something is wrong, so a health read that cannot
  // answer must not take the page down with it.
  assert.equal(out.health.backlog, null, "unread, which is not the same as zero");
  assert.equal(out.health.ok, false, "and unread is never reported as all clear");
  assert.deepEqual(out.health.unhealthy, []);
  await refused(
    tenant.GET.run(get(), ctxFor(tables, { id: "not-a-uuid" }, admin(true))),
    "not_found",
    404,
    "That workspace does not exist.",
  );
  for (const route of [refile, release, retry]) {
    await refused(
      route.POST.run(send("POST", { tenant_id: "x", line_id: L1 }), ctxFor(tables, {}, admin(true))),
      "not_found",
      404,
      "That workspace does not exist.",
    );
    await refused(
      route.POST.run(send("POST", { tenant_id: A, line_id: "x" }), ctxFor(tables, {}, admin(true))),
      "not_found",
      404,
      "That line does not exist.",
    );
  }
});

test("billing's three: the invoices and a resume the owner's, a refresh an operator's, each stopping at the edge's credential in the words the owner reads", async () => {
  const tables = { memberships: both("operator", "owner") };
  await refused(invoices.GET.run(get(inA), ctxFor(tables)), "forbidden", 403, "Only an owner");
  await refused(
    invoices.GET.run(get(inB), ctxFor(tables)),
    "upstream_auth",
    503,
    "The invoices could not be read (no_edge_credential).",
  );
  await refused(resume.POST.run(send("POST", undefined, inA), ctxFor(tables)), "forbidden", 403, "Only an owner");
  await refused(
    resume.POST.run(send("POST", undefined, inB), ctxFor(tables)),
    "upstream_auth",
    503,
    "The subscription could not be resumed (no_edge_credential).",
  );
  const viewer = { memberships: both("viewer", "operator") };
  await refused(
    sync.POST.run(send("POST", undefined, inA), ctxFor(viewer)),
    "forbidden",
    403,
    "Viewers can see everything",
  );
  await refused(
    sync.POST.run(send("POST", undefined, inB), ctxFor(viewer)),
    "upstream_auth",
    503,
    "Billing could not be refreshed (no_edge_credential).",
  );
  await refused(sync.POST.run(send("POST"), ctxFor(viewer)), "choose_workspace", 400);
});

/* ------------------------------------------------------------------------ partners (decision 0012, P5) */

const P1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
/** A function's own refusal, as the database raises it: its words, with its code. */
const raise = (code, message) => () => {
  throw Object.assign(new Error(message), { code });
};

test("partners: the two verbs declare the platform scope, no workspace role, and a support ceiling each", () => {
  assert.equal(standing.POST.policy.scope, "platform");
  assert.equal(standing.POST.policy.role, null);
  assert.equal(standing.POST.policy.rate, "platform_partner_standing");
  assert.equal(payout.POST.policy.scope, "platform");
  assert.equal(payout.POST.policy.role, null);
  assert.equal(payout.POST.policy.rate, "platform_partner_payout");
});

test("partners: a customer who guessed the doors learns nothing, and nothing reaches the functions", async () => {
  const tables = { memberships: both("owner", "owner") };
  const ctx = ctxFor(tables, {}, admin(false));
  await refused(
    standing.POST.run(send("POST", { tenant_id: A, standing: "qualified", why: "x" }), ctx),
    "not_found",
    404,
  );
  await refused(
    payout.POST.run(send("POST", { partner_id: P1, currency: "usd", reference: "r" }), ctx),
    "not_found",
    404,
  );
  assert.deepEqual(
    ctx.supabase.seen.filter((x) => x.rpc).map((x) => x.rpc),
    ["is_platform_admin", "is_platform_admin"],
  );
});

test("partners: a decision names a workspace, a standing and why, and the function's own words come back", async () => {
  const tables = { memberships: both("owner", "owner") };
  const asked = [];
  const ok = admin(true, {
    partner_standing_set: (args) => {
      asked.push(args);
      return { tenant_id: A, standing: args.p_standing, from: "review", voided: 0, matured: 2 };
    },
  });
  await refused(
    standing.POST.run(send("POST", { tenant_id: "x", standing: "qualified", why: "y" }), ctxFor(tables, {}, ok)),
    "not_found",
    404,
    "That workspace does not exist.",
  );
  await refused(
    standing.POST.run(send("POST", { tenant_id: A, standing: "maybe", why: "y" }), ctxFor(tables, {}, ok)),
    "validation",
    400,
  );
  await refused(
    standing.POST.run(send("POST", { tenant_id: A, standing: "qualified", why: "   " }), ctxFor(tables, {}, ok)),
    "validation",
    400,
    "Say why",
  );
  assert.deepEqual(asked, [], "nothing reached the function");
  const out = await standing.POST.run(
    send("POST", { tenant_id: A, standing: "qualified", why: "  Checked by hand.  " }),
    ctxFor(tables, {}, ok),
  );
  assert.deepEqual(asked, [{ p_tenant: A, p_standing: "qualified", p_why: "Checked by hand." }]);
  assert.equal(out.result.matured, 2);
  await refused(
    standing.POST.run(
      send("POST", { tenant_id: A, standing: "qualified", why: "y" }),
      ctxFor(tables, {}, admin(true, { partner_standing_set: raise("P0002", "No partner brought that workspace.") })),
    ),
    "not_found",
    404,
    "No partner brought that workspace.",
  );
});

test("partners: a payout names the partner, the currency and the reference; the function settles it, or says why not", async () => {
  const tables = { memberships: both("owner", "owner") };
  const asked = [];
  const ok = admin(true, {
    partner_payout_mark: (args) => {
      asked.push(args);
      return { paid: true, total_cents: "12500", currency: "usd", earnings: 2, payout_id: "p1" };
    },
  });
  await refused(
    payout.POST.run(send("POST", { partner_id: "x", currency: "usd", reference: "r" }), ctxFor(tables, {}, ok)),
    "not_found",
    404,
    "That partner does not exist.",
  );
  await refused(
    payout.POST.run(send("POST", { partner_id: P1, currency: "dollars", reference: "r" }), ctxFor(tables, {}, ok)),
    "validation",
    400,
  );
  await refused(
    payout.POST.run(send("POST", { partner_id: P1, currency: "usd", reference: " " }), ctxFor(tables, {}, ok)),
    "validation",
    400,
    "reference",
  );
  assert.deepEqual(asked, []);
  await refused(
    payout.POST.run(
      send("POST", { partner_id: P1, currency: "usd", reference: "r", expected_cents: "12500" }),
      ctxFor(tables, {}, ok),
    ),
    "validation",
    400,
    "whole number of cents",
  );
  const out = await payout.POST.run(
    send("POST", { partner_id: P1, currency: "USD", reference: " bank-ref-1 ", expected_cents: 12500 }),
    ctxFor(tables, {}, ok),
  );
  assert.deepEqual(asked, [{ p_partner: P1, p_currency: "usd", p_reference: "bank-ref-1", p_expected_cents: 12500 }]);
  assert.equal(out.result.total_cents, 12500, "a bigint read as a number");
  await refused(
    payout.POST.run(
      send("POST", { partner_id: P1, currency: "usd", reference: "r" }),
      ctxFor(tables, {}, admin(true, { partner_payout_mark: raise("22023", "Unknown currency: xyz") })),
    ),
    "validation",
    400,
    "Unknown currency",
  );
});

test("partners ride on the overview, and a partner list that cannot be read never takes the workspaces down", async () => {
  const tables = { memberships: both("owner", "owner") };
  const bal = {
    partner_id: P1,
    code: "ada-co",
    email: "ada@example.com",
    status: "active",
    share_bp: 2500,
    joined_at: "2026-08-01T00:00:00Z",
    workspaces: 1,
    under_review: 0,
    currency: "usd",
    held_cents: "5000",
    payable_cents: "0",
    paid_cents: "0",
    last_paid_at: null,
  };
  const out = await overview.GET.run(
    get(),
    ctxFor(
      tables,
      {},
      admin(true, {
        platform_overview: () => [],
        platform_partner_balances: () => [bal],
        platform_partner_workspaces: () => [],
      }),
    ),
  );
  assert.equal(out.partners.balances[0].held_cents, 5000);
  assert.deepEqual(out.partners.workspaces, []);
  const down = await overview.GET.run(
    get(),
    ctxFor(
      tables,
      {},
      admin(true, {
        platform_overview: () => [],
        platform_partner_balances: raise("57014", "canceling statement due to statement timeout"),
        platform_partner_workspaces: () => [],
      }),
    ),
  );
  assert.equal(down.partners, null, "unread, said as unread");
  assert.deepEqual(down.tenants, []);
  const older = await overview.GET.run(
    get(),
    ctxFor(
      tables,
      {},
      admin(true, {
        platform_overview: () => [],
        platform_partner_balances: raise("PGRST202", "Could not find the function public.platform_partner_balances"),
        platform_partner_workspaces: raise(
          "PGRST202",
          "Could not find the function public.platform_partner_workspaces",
        ),
      }),
    ),
  );
  assert.deepEqual(
    older.partners,
    { balances: [], workspaces: [] },
    "a database 00205 has not reached has no partners to show",
  );
});

test("partners: a pause names the partner, a status and why; a customer is refused at the door and the function answers the rest", async () => {
  const tables = { memberships: both("owner", "owner") };
  assert.equal(partnerStatus.POST.policy.scope, "platform");
  assert.equal(partnerStatus.POST.policy.rate, "platform_partner_status");
  const guessed = ctxFor(tables, {}, admin(false));
  await refused(
    partnerStatus.POST.run(send("POST", { partner_id: P1, status: "paused", why: "x" }), guessed),
    "not_found",
    404,
  );
  const asked = [];
  const ok = admin(true, {
    partner_status_set: (args) => {
      asked.push(args);
      return { partner_id: P1, status: args.p_status, from: "active", seats: 3 };
    },
  });
  await refused(
    partnerStatus.POST.run(send("POST", { partner_id: P1, status: "gone", why: "x" }), ctxFor(tables, {}, ok)),
    "validation",
    400,
  );
  await refused(
    partnerStatus.POST.run(send("POST", { partner_id: P1, status: "paused", why: "" }), ctxFor(tables, {}, ok)),
    "validation",
    400,
    "Say why",
  );
  assert.deepEqual(asked, []);
  const out = await partnerStatus.POST.run(
    send("POST", { partner_id: P1, status: "paused", why: " Reported by an owner. " }),
    ctxFor(tables, {}, ok),
  );
  assert.deepEqual(asked, [{ p_partner: P1, p_status: "paused", p_why: "Reported by an owner." }]);
  assert.equal(out.result.seats, 3);
});
