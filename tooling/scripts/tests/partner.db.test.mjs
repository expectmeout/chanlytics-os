/**
 * A partner (decision 0012), P2, against the replayed stack: becoming one, and what create_workspace does with a
 * code — the attribution row, the partner's seat on the team and the event, in one transaction; nothing for a code
 * that names nobody creditable, with the reason recorded; and who may read what. Then the ledger (P3): a share of a
 * paid invoice, each delivery written once, refunds and disputes capped at the share and maturing with it, the sweep's
 * standing and its maturing, and the balance a partner reads. Skips without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users and workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};

let db;
const users = [];
const tenants = [];
let partner; // the partner: their session and id
let customer; // a business that came through the link
let other; // a business that typed a code that names nobody
let brought; // the workspace the customer made through the link

/** A real session for a fresh user. */
async function person(label) {
  const email = `partner-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

const CODE = `ada-${Math.random().toString(36).slice(2, 8)}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  partner = await person("partner");
  customer = await person("customer");
  other = await person("other");
});

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "becoming a partner: once, with a code of the right shape; the row is the caller's alone to read",
  { skip },
  async () => {
    const bad = await partner.client.rpc("partner_become", { p_code: "ab" });
    assert.equal(bad.error?.code, "22023", "the shape, in the function's words");
    const reserved = await partner.client.rpc("partner_become", { p_code: "Chanlytics" });
    assert.equal(reserved.error?.code, "22023");
    const row = ok(await partner.client.rpc("partner_become", { p_code: ` ${CODE.toUpperCase()} ` }));
    assert.equal(row.code, CODE, "as it is stored: lowercased and trimmed");
    assert.equal(row.status, "active");
    assert.equal(row.share_bp, 2500, "the share every new partner account starts with");
    assert.ok(row.terms_accepted_at, "the terms, agreed now");
    assert.equal("payout_facts" in row, false, "the platform's, never answered to the pane");
    const again = await partner.client.rpc("partner_become", { p_code: "another" });
    assert.equal(again.error?.code, "23505", "one per account");
    const taken = await customer.client.rpc("partner_become", { p_code: CODE });
    assert.equal(taken.error?.code, "23505", "a code is one person's");
    assert.match(taken.error?.message ?? "", /taken/);
    partner.id = row.id;

    const mine = ok(await partner.client.from("partners").select("id, code"));
    assert.deepEqual(mine, [{ id: row.id, code: CODE }]);
    assert.deepEqual(ok(await customer.client.from("partners").select("id")), [], "nobody else's row");
  },
);

test(
  "a workspace made through the link: the attribution, the partner's seat and the event, in one transaction",
  { skip },
  async () => {
    const w = ok(
      await customer.client
        .rpc("create_workspace", { p_name: "Harbor Moving", p_timezone: "America/Chicago", p_partner_code: CODE })
        .single(),
    );
    tenants.push(w.id);
    brought = w.id;
    const link = ok(await db.from("partner_tenants").select("partner_id, code_used, standing").eq("tenant_id", w.id));
    assert.deepEqual(
      link,
      [{ partner_id: partner.id, code_used: CODE, standing: null }],
      "fixed now; the sweep judges later",
    );
    const seats = ok(await db.from("memberships").select("user_id, role").eq("tenant_id", w.id).order("role"));
    assert.deepEqual(seats, [
      { user_id: customer.userId, role: "owner" },
      { user_id: partner.userId, role: "partner" },
    ]);
    const ev = ok(await db.from("events").select("kind, data").eq("tenant_id", w.id).eq("kind", "partner.attributed"));
    assert.equal(ev.length, 1);
    assert.equal(ev[0].data.partner_id, partner.id);
    assert.equal(ev[0].data.code, CODE);

    // Who reads the attribution: the partner (theirs), the owner (their workspace's), nobody else.
    assert.equal(ok(await partner.client.from("partner_tenants").select("tenant_id")).length, 1);
    assert.equal(ok(await customer.client.from("partner_tenants").select("tenant_id")).length, 1);
    assert.equal(ok(await other.client.from("partner_tenants").select("tenant_id")).length, 0);
    // And the partner's session is a member: the workspace is on their list.
    const theirs = ok(await partner.client.from("tenants").select("id").eq("id", w.id));
    assert.equal(theirs.length, 1, "the switcher lists it");
  },
);

test(
  "a code that names nobody creditable makes the workspace all the same, with why recorded: unknown, and the caller's own",
  { skip },
  async () => {
    const unknown = ok(
      await other.client.rpc("create_workspace", { p_name: "Bayside Dental", p_partner_code: "no-such-code" }).single(),
    );
    tenants.push(unknown.id);
    assert.equal(ok(await db.from("partner_tenants").select("tenant_id").eq("tenant_id", unknown.id)).length, 0);
    let ev = ok(await db.from("events").select("data").eq("tenant_id", unknown.id).eq("kind", "partner.code_ignored"));
    assert.deepEqual(
      ev.map((e) => e.data.why),
      ["unknown"],
    );

    const own = ok(
      await partner.client.rpc("create_workspace", { p_name: "Ada's Own", p_partner_code: CODE }).single(),
    );
    tenants.push(own.id);
    assert.equal(
      ok(await db.from("partner_tenants").select("tenant_id").eq("tenant_id", own.id)).length,
      0,
      "never their own",
    );
    const seats = ok(await db.from("memberships").select("role").eq("tenant_id", own.id));
    assert.deepEqual(seats, [{ role: "owner" }], "one seat, the owner's: no partner membership on top of it");
    ev = ok(await db.from("events").select("data").eq("tenant_id", own.id).eq("kind", "partner.code_ignored"));
    assert.deepEqual(
      ev.map((e) => e.data.why),
      ["self"],
    );

    const plain = ok(await other.client.rpc("create_workspace", { p_name: "No Code" }).single());
    tenants.push(plain.id);
    assert.equal(
      ok(await db.from("events").select("id").eq("tenant_id", plain.id).like("kind", "partner.%")).length,
      0,
    );
  },
);

test("a paused partner is credited with nothing until the platform resumes them", { skip }, async () => {
  ok(await db.from("partners").update({ status: "paused" }).eq("id", partner.id));
  try {
    const w = ok(await other.client.rpc("create_workspace", { p_name: "While Paused", p_partner_code: CODE }).single());
    tenants.push(w.id);
    assert.equal(ok(await db.from("partner_tenants").select("tenant_id").eq("tenant_id", w.id)).length, 0);
    const ev = ok(await db.from("events").select("data").eq("tenant_id", w.id).eq("kind", "partner.code_ignored"));
    assert.deepEqual(
      ev.map((e) => e.data.why),
      ["paused"],
    );
  } finally {
    ok(await db.from("partners").update({ status: "active" }).eq("id", partner.id));
  }
});

/* ------------------------------------------------------------------------------------------------ the ledger */

const PAID = "2026-08-01T12:00:00Z";
const earn = (over = {}) =>
  db.rpc("partner_earn", {
    p_tenant_id: brought,
    p_invoice_id: "in_led_1",
    p_event_id: "evt_led_share",
    p_amount_cents: 40000,
    p_currency: "USD",
    p_paid_at: PAID,
    ...over,
  });
const rows = async (invoice) =>
  ok(
    await db
      .from("partner_earnings")
      .select("kind, earned_cents, state, payable_at")
      .eq("stripe_invoice_id", invoice)
      .order("created_at"),
  );

test(
  "a share: the partner's share of what was paid, held thirty days; the same invoice or delivery again writes nothing",
  { skip },
  async () => {
    const first = ok(await earn());
    assert.equal(first.earned_cents, 10000, "25% of $400");
    assert.equal(new Date(first.payable_at).toISOString(), "2026-08-31T12:00:00.000Z");
    assert.equal(ok(await earn()), null, "the same delivery");
    assert.equal(ok(await earn({ p_event_id: "evt_led_other" })), null, "the same invoice, another delivery");
    assert.deepEqual(
      (await rows("in_led_1")).map((r) => [r.kind, r.earned_cents, r.state]),
      [["share", 10000, "held"]],
    );
    const ev = ok(await db.from("events").select("data").eq("tenant_id", brought).eq("kind", "partner.earned"));
    assert.equal(ev.length, 1);
    assert.equal(ev[0].data.currency, "usd", "stored in Stripe's own spelling");

    // A workspace nobody brought earns nobody anything.
    const plain = tenants.at(-1);
    assert.equal(ok(await earn({ p_tenant_id: plain, p_invoice_id: "in_led_x", p_event_id: "evt_led_x" })), null);
    // Nothing paid, nothing earned.
    assert.equal(ok(await earn({ p_invoice_id: "in_led_zero", p_event_id: "evt_led_zero", p_amount_cents: 0 })), null);
  },
);

test(
  "a refund takes what its running total says, less what came before; a dispute on top is capped at the share; a won dispute gives back only what it took",
  { skip },
  async () => {
    const rev = (event, kind, amount, invoice = "in_led_1") =>
      db.rpc("partner_reverse", { p_invoice_id: invoice, p_event_id: event, p_kind: kind, p_amount_cents: amount });
    assert.equal(ok(await rev("evt_led_r1", "refund", 10000)).earned_cents, -2500, "$100 of $400 refunded");
    assert.equal(ok(await rev("evt_led_r1", "refund", 10000)), null, "the same delivery again");
    assert.equal(ok(await rev("evt_led_r2", "refund", 30000)).earned_cents, -5000, "$300 refunded in all: $50 more");
    assert.equal(
      ok(await rev("evt_led_r_late", "refund", 10000)),
      null,
      "an earlier refund's word delivered late, with its smaller total, gives nothing back",
    );
    // $75 of the $100 share is gone; a dispute of all $400 may take only the $25 left.
    assert.equal(ok(await rev("evt_led_d1", "dispute", 40000)).earned_cents, -2500, "capped at what is left");
    assert.equal(
      ok(await rev("evt_led_d2", "dispute", 40000)),
      null,
      "a second word about the same dispute takes nothing",
    );
    assert.equal(ok(await rev("evt_led_w1", "dispute_won", 40000)).earned_cents, 2500, "gives back what it took");
    assert.equal(ok(await rev("evt_led_w2", "dispute_won", 40000)), null, "and never more");
    const all = await rows("in_led_1");
    assert.equal(
      all.reduce((n, r) => n + r.earned_cents, 0),
      2500,
      "the share less the refunds: $400 paid, $300 refunded, 25% of the $100 kept",
    );
    assert.ok(
      all.every((r) => r.state === "held" && r.payable_at === all[0].payable_at),
      "a reversal of a held share matures with it",
    );
    assert.equal(
      ok(await rev("evt_led_none", "refund", 100, "in_led_nobody")),
      null,
      "no share for the invoice named: nothing",
    );
    const bad = await rev("evt_led_bad", "chargeback", 100);
    assert.equal(bad.error?.code, "22023");
  },
);

test(
  "the sweep: a workspace that paid is judged once, and what is due matures only once it qualifies",
  { skip },
  async () => {
    const before = new Date("2026-08-20T00:00:00Z").toISOString();
    let out = ok(await db.rpc("partner_earnings_sweep", { p_now: before }));
    // Paid 1 Aug, no card mark: a week later it is judged, and nothing is due until 31 Aug.
    const link = ok(await db.from("partner_tenants").select("standing, checks").eq("tenant_id", brought).single());
    assert.equal(link.standing, "qualified");
    assert.deepEqual(link.checks, { same_card: false, same_listing: false });
    assert.ok(out.judged >= 1);
    assert.ok(
      (await rows("in_led_1")).every((r) => r.state === "held"),
      "not due yet",
    );

    out = ok(await db.rpc("partner_earnings_sweep", { p_now: new Date("2026-09-01T00:00:00Z").toISOString() }));
    assert.ok(
      (await rows("in_led_1")).every((r) => r.state === "payable"),
      "due, and the workspace qualifies",
    );
    assert.equal(out.judged, 0, "judged once, not again");
    assert.equal(out.payable, 5, "the share, its two refunds, the dispute and the dispute won");
    const again = ok(await db.from("partner_tenants").select("standing_at").eq("tenant_id", brought).single());
    assert.equal(Date.parse(again.standing_at), Date.parse(before), "the standing keeps the day it was decided");
  },
);

test("the sweep holds a workspace the partner pays for themselves for a person to look at", { skip }, async () => {
  // The partner owns a workspace (made in P2's test), and the workspace they brought pays with the same card.
  const own = ok(
    await db
      .from("memberships")
      .select("tenant_id")
      .eq("user_id", partner.userId)
      .eq("role", "owner")
      .limit(1)
      .single(),
  ).tenant_id;
  const second = ok(
    await customer.client.rpc("create_workspace", { p_name: "Second Shop", p_partner_code: CODE }).single(),
  );
  tenants.push(second.id);
  ok(await db.rpc("billing_card_mark", { p_tenant_id: own, p_fingerprint: "fp_same" }));
  ok(await db.rpc("billing_card_mark", { p_tenant_id: second.id, p_fingerprint: "fp_same" }));
  ok(await earn({ p_tenant_id: second.id, p_invoice_id: "in_led_2", p_event_id: "evt_led_share_2" }));
  const out = ok(await db.rpc("partner_earnings_sweep", { p_now: new Date("2026-08-02T00:00:00Z").toISOString() }));
  assert.ok(out.review >= 1);
  const link = ok(
    await db.from("partner_tenants").select("standing, standing_why, checks").eq("tenant_id", second.id).single(),
  );
  assert.equal(link.standing, "review");
  assert.equal(link.checks.same_card, true);
  assert.match(link.standing_why, /a workspace the partner owns/);
  ok(await db.rpc("partner_earnings_sweep", { p_now: new Date("2026-09-05T00:00:00Z").toISOString() }));
  assert.deepEqual(
    (await rows("in_led_2")).map((r) => r.state),
    ["held"],
    "held while it is looked at",
  );

  // A person disqualifies it: what it held is void, and it earns nothing more.
  ok(await db.from("partner_tenants").update({ standing: "disqualified" }).eq("tenant_id", second.id));
  ok(await db.rpc("partner_earnings_sweep", { p_now: new Date("2026-09-06T00:00:00Z").toISOString() }));
  assert.deepEqual(
    (await rows("in_led_2")).map((r) => r.state),
    ["void"],
  );
  assert.equal(
    ok(await earn({ p_tenant_id: second.id, p_invoice_id: "in_led_3", p_event_id: "evt_led_share_3" })),
    null,
  );
});

test(
  "the balance: the partner's own totals by state, nobody else's, and the ledger's rows are the partner's alone to read",
  { skip },
  async () => {
    const mine = ok(await partner.client.rpc("partner_balance"));
    const byState = Object.fromEntries(mine.map((r) => [r.state, Number(r.earned_cents)]));
    assert.equal(byState.payable, 2500, "$100 earned, $75 of it refunded");
    // The second workspace's share was held while it was looked at, then voided when it was disqualified (above).
    const voided = ok(
      await partner.client.from("partner_earnings").select("state").eq("stripe_invoice_id", "in_led_2"),
    );
    assert.deepEqual(
      voided.map((r) => r.state),
      ["void"],
    );
    assert.equal(byState.held, undefined, "nothing else is held");
    assert.equal(byState.void, undefined, "what was voided is not a balance");
    assert.deepEqual(ok(await customer.client.rpc("partner_balance")), [], "an owner has no balance");
    assert.ok(ok(await partner.client.from("partner_earnings").select("id")).length > 0);
    assert.deepEqual(ok(await customer.client.from("partner_earnings").select("id")), [], "never the owner's to read");
    const marks = await customer.client.from("billing_card_marks").select("tenant_id");
    assert.ok(marks.error || marks.data.length === 0, "a card's mark is nobody's to read but the sweep's");
    const earnAsMember = await partner.client.rpc("partner_earn", {
      p_tenant_id: brought,
      p_invoice_id: "in_forged",
      p_event_id: "evt_forged",
      p_amount_cents: 999999,
      p_currency: "usd",
      p_paid_at: PAID,
    });
    assert.ok(earnAsMember.error, "only the webhook writes the ledger");
  },
);

/* --------------------------------------------------------------------------- the workspaces a partner brought */

test(
  "the partner's table: the back office's row for each workspace they brought and sit on, their money for every one",
  { skip },
  async () => {
    const rows = ok(await partner.client.rpc("partner_overview"));
    const ids = rows.map((r) => r.tenant_id);
    assert.ok(ids.includes(brought), "the workspace they brought and set up");
    const theirOwn = ok(
      await db.from("memberships").select("tenant_id").eq("user_id", partner.userId).eq("role", "owner"),
    ).map((m) => m.tenant_id);
    assert.ok(
      theirOwn.every((t) => !ids.includes(t)),
      "never a workspace of their own",
    );
    const row = rows.find((r) => r.tenant_id === brought);
    assert.equal(row.name, "Harbor Moving");
    assert.equal(typeof row.members, "number");

    const money = ok(await partner.client.rpc("partner_workspace_money"));
    const mine = money.find((m) => m.tenant_id === brought);
    assert.equal(mine.on_team, true);
    assert.equal(mine.standing, "qualified");

    assert.deepEqual(ok(await customer.client.rpc("partner_overview")), [], "an owner is no partner");
    assert.deepEqual(ok(await other.client.rpc("partner_workspace_money")), []);
  },
);

test("an owner who takes the partner off the team takes the view with them; the money stays", { skip }, async () => {
  ok(
    await db.from("memberships").delete().eq("tenant_id", brought).eq("user_id", partner.userId).eq("role", "partner"),
  );
  try {
    const ids = ok(await partner.client.rpc("partner_overview")).map((r) => r.tenant_id);
    assert.ok(!ids.includes(brought), "no row of the business once they are off its team");
    const mine = ok(await partner.client.rpc("partner_workspace_money")).find((m) => m.tenant_id === brought);
    assert.equal(mine.on_team, false);
    assert.ok(
      Number(mine.payable_cents) + Number(mine.held_cents) + Number(mine.paid_cents) >= 0,
      "the money line stays",
    );
  } finally {
    ok(await db.from("memberships").insert({ tenant_id: brought, user_id: partner.userId, role: "partner" }));
  }
});

test(
  "the back office's join is nobody's door: a session cannot call it, whatever list it names",
  { skip },
  async () => {
    const r = await partner.client.rpc("platform_overview_rows_for", { p_tenants: [brought] });
    assert.ok(r.error, "owner-only, as 00093 made its caller");
  },
);

/* ------------------------------------------------------------------------- standing and payouts, by a person (P5) */

test(
  "the platform's partner verbs are a platform admin's alone: a partner, an owner and a stranger are refused the privilege",
  { skip },
  async () => {
    const [{ id: partnerId }] = ok(await partner.client.from("partners").select("id"));
    for (const who of [partner, customer, other]) {
      const standing = await who.client.rpc("partner_standing_set", {
        p_tenant: brought,
        p_standing: "disqualified",
        p_why: "forged",
      });
      assert.equal(standing.error?.code, "42501");
      const paid = await who.client.rpc("partner_payout_mark", {
        p_partner: partnerId,
        p_currency: "usd",
        p_reference: "forged",
      });
      assert.equal(paid.error?.code, "42501");
      for (const read of ["platform_partner_balances", "platform_partner_workspaces"])
        assert.equal((await who.client.rpc(read)).error?.code, "42501", read);
    }
    const link = ok(await db.from("partner_tenants").select("standing").eq("tenant_id", brought).single());
    assert.equal(link.standing, "qualified", "nothing moved");
  },
);

test(
  "a payout recorded by hand settles every payable share into one row the partner reads; a second press pays nothing",
  { skip },
  async () => {
    const admin = await person("admin");
    ok(await db.from("platform_admins").insert({ user_id: admin.userId }));
    try {
      const [{ id: partnerId }] = ok(await partner.client.from("partners").select("id"));
      const mine = ok(await admin.client.rpc("platform_partner_balances")).find(
        (r) => r.partner_id === partnerId && r.currency === "usd",
      );
      assert.equal(
        Number(mine.payable_cents),
        2500,
        "$100 earned, $75 of it refunded, the dispute taken and given back",
      );
      assert.ok(mine.workspaces >= 2, "the workspace they brought, and the second one");

      const bad = await admin.client.rpc("partner_payout_mark", {
        p_partner: partnerId,
        p_currency: "usd",
        p_reference: "  ",
      });
      assert.equal(bad.error?.code, "22023", "a payout says where it can be found");

      const paid = ok(
        await admin.client.rpc("partner_payout_mark", {
          p_partner: partnerId,
          p_currency: "USD",
          p_reference: "bank-ref-1",
        }),
      );
      assert.equal(paid.paid, true);
      assert.equal(Number(paid.total_cents), 2500);
      const rows = ok(await db.from("partner_earnings").select("state, payout_id").eq("stripe_invoice_id", "in_led_1"));
      assert.ok(
        rows.every((r) => r.state === "paid" && r.payout_id === paid.payout_id),
        "every line of the invoice, netted, in the one payout",
      );
      const again = ok(
        await admin.client.rpc("partner_payout_mark", {
          p_partner: partnerId,
          p_currency: "usd",
          p_reference: "bank-ref-2",
        }),
      );
      assert.deepEqual([again.paid, Number(again.total_cents)], [false, 0], "nothing left to pay");

      const seen = ok(await partner.client.from("partner_payouts").select("total_cents, reference, earnings"));
      assert.deepEqual(
        seen.map((p) => [Number(p.total_cents), p.reference]),
        [[2500, "bank-ref-1"]],
      );
      assert.deepEqual(ok(await customer.client.from("partner_payouts").select("id")), [], "never the owner's");
      const forged = await partner.client.from("partner_payouts").insert({
        partner_id: partnerId,
        currency: "usd",
        total_cents: 1,
        earnings: 1,
        period_start: PAID,
        period_end: PAID,
        reference: "forged",
      });
      assert.ok(forged.error, "and nobody signed in writes one");
      const balance = Object.fromEntries(
        ok(await partner.client.rpc("partner_balance")).map((r) => [r.state, Number(r.earned_cents)]),
      );
      assert.equal(balance.paid, 2500);
      assert.equal(balance.payable, undefined);
      const ev = ok(await db.from("events").select("data").eq("tenant_id", brought).eq("kind", "partner.paid"));
      assert.equal(ev.length, 1);
      assert.equal(ev[0].data.earned_cents, 2500);
      assert.equal(
        ev[0].data.reference,
        undefined,
        "the workspace's members read its events; the reference is not theirs",
      );
      const paidRow = await db
        .from("partner_earnings")
        .update({ state: "paid", payout_id: null })
        .eq("stripe_invoice_id", "in_led_1");
      assert.ok(paidRow.error, "a paid line always names its payout");
    } finally {
      await db.from("platform_admins").delete().eq("user_id", admin.userId);
    }
  },
);

test(
  "a person's decision on a brought workspace: why is required, it is recorded against them, and a void share stays void",
  { skip },
  async () => {
    const admin = await person("admin2");
    ok(await db.from("platform_admins").insert({ user_id: admin.userId }));
    try {
      const [{ id: partnerId }] = ok(await partner.client.from("partners").select("id"));
      const out = ok(
        await db.from("partner_tenants").select("tenant_id").eq("partner_id", partnerId).eq("standing", "disqualified"),
      );
      assert.equal(out.length, 1, "the second workspace, disqualified by the sweep's test");
      const second = out[0].tenant_id;
      const noWhy = await admin.client.rpc("partner_standing_set", {
        p_tenant: second,
        p_standing: "qualified",
        p_why: " ",
      });
      assert.equal(noWhy.error?.code, "22023");
      const nobody = await admin.client.rpc("partner_standing_set", {
        p_tenant: "00000000-0000-4000-8000-000000000000",
        p_standing: "qualified",
        p_why: "x",
      });
      assert.equal(nobody.error?.code, "P0002");

      const r = ok(
        await admin.client.rpc("partner_standing_set", {
          p_tenant: second,
          p_standing: "qualified",
          p_why: "A different owner, checked by hand.",
        }),
      );
      assert.equal(r.from, "disqualified");
      const link = ok(
        await db.from("partner_tenants").select("standing, standing_why, standing_by").eq("tenant_id", second).single(),
      );
      assert.deepEqual(link, {
        standing: "qualified",
        standing_why: "A different owner, checked by hand.",
        standing_by: admin.userId,
      });
      assert.deepEqual(
        (await rows("in_led_2")).map((e) => e.state),
        ["void"],
        "what was voided stays void: it earns from now on",
      );
      const acted = ok(
        await db
          .from("events")
          .select("kind, data")
          .eq("tenant_id", second)
          .in("kind", ["platform.acted", "partner.standing_set"]),
      ).filter((e) => e.data.by === admin.userId || e.data.by === "person");
      assert.deepEqual(acted.map((e) => e.kind).sort(), ["partner.standing_set", "platform.acted"]);

      const listed = ok(await admin.client.rpc("platform_partner_workspaces")).find((w) => w.tenant_id === second);
      assert.equal(listed.decided_by, "person");
    } finally {
      await db.from("platform_admins").delete().eq("user_id", admin.userId);
    }
  },
);

/* --------------------------------------------------------------------------------- a partner paused (00206) */

test(
  "a paused partner is a viewer on every workspace they brought and nowhere else changed; restored, the seats come back",
  { skip },
  async () => {
    const [{ id: partnerId }] = ok(await partner.client.from("partners").select("id"));
    const self = await partner.client.rpc("partner_status_set", {
      p_partner: partnerId,
      p_status: "active",
      p_why: "me",
    });
    assert.equal(self.error?.code, "42501", "a partner cannot restore themselves");

    const admin = await person("admin3");
    ok(await db.from("platform_admins").insert({ user_id: admin.userId }));
    const roleOn = async (tenant) =>
      ok(await db.from("memberships").select("role").eq("tenant_id", tenant).eq("user_id", partner.userId)).map(
        (m) => m.role,
      );
    const ownBefore = ok(
      await db.from("memberships").select("tenant_id, role").eq("user_id", partner.userId).eq("role", "owner"),
    );
    try {
      const paused = ok(
        await admin.client.rpc("partner_status_set", {
          p_partner: partnerId,
          p_status: "paused",
          p_why: "Reported by an owner.",
        }),
      );
      assert.ok(paused.seats >= 1);
      assert.deepEqual(await roleOn(brought), ["viewer"]);
      const own = ok(
        await db.from("memberships").select("tenant_id, role").eq("user_id", partner.userId).eq("role", "owner"),
      );
      assert.equal(own.length, ownBefore.length, "their own workspaces are theirs still");
      const held = ok(await db.from("partner_tenants").select("seat_held_at").eq("tenant_id", brought).single());
      assert.ok(held.seat_held_at, "the workspace remembers the pause took the seat");
      assert.ok(
        !ok(await partner.client.rpc("partner_overview"))
          .map((r) => r.tenant_id)
          .includes(brought),
        "a paused partner sees nothing of the business",
      );
      const ev = ok(
        await db.from("events").select("data").eq("tenant_id", brought).eq("kind", "platform.acted"),
      ).filter((e) => e.data.action === "partner_status");
      assert.equal(ev.at(-1).data.by, admin.userId, "recorded against the person, on the workspace");

      const restored = ok(
        await admin.client.rpc("partner_status_set", {
          p_partner: partnerId,
          p_status: "active",
          p_why: "Looked at; nothing wrong.",
        }),
      );
      assert.equal(restored.seats, paused.seats);
      assert.deepEqual(await roleOn(brought), ["partner"]);
      const cleared = ok(await db.from("partner_tenants").select("seat_held_at").eq("partner_id", partnerId));
      assert.ok(cleared.every((r) => r.seat_held_at === null));
    } finally {
      await db.from("partners").update({ status: "active" }).eq("id", partnerId);
      await db.from("platform_admins").delete().eq("user_id", admin.userId);
    }
  },
);
