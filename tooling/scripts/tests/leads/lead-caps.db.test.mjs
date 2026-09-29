/**
 * The lead caps are written once in SQL (00268), beside contracts' caps, and the two say the same numbers.
 *
 * `lead_cap(name)` is the one place the finder's functions read a cap; contracts' `LEAD_MONTHLY_ALLOWANCE`,
 * `LEAD_MONTHLY_BUDGET_USD`, `LEAD_DAY_CAP_USD`, `LEAD_PLATFORM_DAY_CAP_USD` and `LEAD_LIST_MAX` are what the pages
 * read. Here: the two agree name by name, a name the SQL does not know raises rather than letting anything by, and
 * 00242's list door, which wrote three caps a third time, now refuses and words each by the one place: a file over
 * the list's rows, an estimate over the month's budget, and a month whose leads are used. Local stack only: it makes
 * a workspace and a person.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  LEAD_DAY_CAP_USD,
  LEAD_LIST_MAX,
  LEAD_MONTHLY_ALLOWANCE,
  LEAD_MONTHLY_BUDGET_USD,
  LEAD_PLATFORM_DAY_CAP_USD,
} from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env"
        : false;

const stamp = Date.now().toString(36);
const at = (who) => `${who}-${stamp}@fixture-caps.example`;
let db;
let A;
let owner;
const users = [];
const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `caps-${stamp}`, name: "Caps Co", timezone: "America/Chicago" })
      .select("id")
      .single(),
    "tenant",
  ).id;
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }), "provision");
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }), "billing");
  const email = at("owner");
  const password = `pw-${stamp}-Aa1!`;
  const made = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user");
  users.push(made.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.user.id, role: "owner" }), "membership");
  owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await owner.auth.signInWithPassword({ email, password }), "sign in");
  const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single(), "switch");
  ok(
    await db
      .from("lead_platform")
      .update({ tenants_on: [...(p.tenants_on ?? []), A] })
      .eq("id", true),
    "switch on",
  );
});

after(async () => {
  if (skip) return;
  const p = await db.from("lead_platform").select("tenants_on").eq("id", true).single();
  if (p.data)
    await db
      .from("lead_platform")
      .update({ tenants_on: (p.data.tenants_on ?? []).filter((t) => t !== A) })
      .eq("id", true);
  if (A) {
    await db.from("events").delete().eq("tenant_id", A);
    await db.from("tenants").delete().eq("id", A);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

test("SQL's caps and contracts' are the same numbers, name by name", { skip }, async () => {
  for (const [name, contracts] of [
    ["month_leads", LEAD_MONTHLY_ALLOWANCE],
    ["month_usd", LEAD_MONTHLY_BUDGET_USD],
    ["day_usd", LEAD_DAY_CAP_USD],
    ["platform_day_usd", LEAD_PLATFORM_DAY_CAP_USD],
    ["list_rows", LEAD_LIST_MAX],
  ]) {
    assert.equal(Number(ok(await db.rpc("lead_cap", { p_name: name }), name)), contracts, name);
  }
  const typo = await db.rpc("lead_cap", { p_name: "month_lead" });
  assert.equal(typo.error?.code, "22023", "a cap nobody named raises; a null would let every comparison by");
});

test("the list door refuses and words each cap by the one place", { skip }, async () => {
  const importing = (over) =>
    owner.rpc("lead_search_import", {
      p_tenant_id: A,
      p_name: `Expo gyms ${stamp}`,
      p_asked: "gyms I met at the expo",
      p_rows: [{ name: "New Gym One", email: at("new1") }],
      p_estimate_usd: 0.5,
      ...over,
    });

  const rows = await importing({
    p_rows: Array.from({ length: LEAD_LIST_MAX + 1 }, (_, i) => ({ name: `Gym ${i}`, email: at(`many${i}`) })),
  });
  assert.equal(rows.error?.code, "22023");
  assert.equal(rows.error?.message, `rows: 1 to ${LEAD_LIST_MAX}`);

  const estimate = await importing({ p_estimate_usd: LEAD_MONTHLY_BUDGET_USD + 1 });
  assert.equal(estimate.error?.code, "22023");
  assert.equal(estimate.error?.message, `estimate: 0 to ${LEAD_MONTHLY_BUDGET_USD} usd`);

  // The month used up: the sentence says the allowance the database counted against.
  const month = ok(await db.rpc("lead_month", { p_tenant_id: A }), "month");
  ok(
    await db
      .from("lead_counters")
      .upsert(
        { tenant_id: A, kind: "allowance", period: month, used: LEAD_MONTHLY_ALLOWANCE, reserved: 0 },
        { onConflict: "tenant_id,kind,period" },
      ),
    "a full month",
  );
  const full = ok(await importing({}), "the month's refusal");
  assert.equal(full.error, "month_leads_used");
  assert.match(full.sentence, new RegExp(`^This month's ${LEAD_MONTHLY_ALLOWANCE} leads are used`));
});
