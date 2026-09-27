/**
 * A partner (decision 0012), P2: the code, the link and the cookie it leaves; the two account routes; the
 * workspace-create route passing the cookie's code to the function and living without it on an older database;
 * the workspaces payload carrying each role and the partner; and the wiring that seats the pane beside the rest.
 *
 * Who is credited is the function's decision, proved against the stack in partner.db.test.mjs.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import {
  EVENT_KINDS,
  PARTNER_COOKIE,
  PARTNER_SHARE_BP_DEFAULT,
  PARTNER_WORDS,
  broughtWords,
  cleanPartnerCode,
  isPartnerCode,
  partnerCodeFromCookie,
  partnerEarningsWords,
  partnerLinkFor,
  partnerVM,
  partnerWorkspacesVM,
  partnerPayoutOutcomeWords,
  partnerStandingChoices,
  partnerStandingOutcomeWords,
  partnerStatusChoices,
  partnerStatusOutcomeWords,
  platformPartnerRows,
  platformPartnerSummary,
  shareWords,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore, RATE } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { SURFACE_STATES, ROUTE_SURFACE } = await import(at("apps/dashboard/src/legacy-bridge/surface-registry.ts"));
const link = await import(at("apps/dashboard/app/p/[code]/route.ts"));
const partner = await import(at("apps/dashboard/app/api/v1/partner/route.ts"));
const create = await import(at("apps/dashboard/app/api/v1/workspaces/create/route.ts"));
const workspaces = await import(at("apps/dashboard/app/api/v1/workspaces/route.ts"));
const partnerWorkspaces = await import(at("apps/dashboard/app/api/v1/partner/workspaces/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

/* ------------------------------------------------------------ the contracts */

test("a code: lowercase letters, digits and dashes, 3 to 24, a letter or digit at each end, never a word of the app's", () => {
  assert.deepEqual(cleanPartnerCode("  Ada-Lovelace "), { ok: true, code: "ada-lovelace" });
  assert.deepEqual(cleanPartnerCode("ab"), { ok: false, reason: "A code is 3 to 24 characters." });
  assert.equal(cleanPartnerCode("a".repeat(25)).ok, false);
  assert.equal(cleanPartnerCode("-ada").ok, false, "a dash at the start");
  assert.equal(cleanPartnerCode("ada-").ok, false, "a dash at the end");
  assert.equal(cleanPartnerCode("ada lovelace").ok, false, "a space");
  assert.equal(cleanPartnerCode("ada.io").ok, false, "a dot");
  assert.deepEqual(cleanPartnerCode("Chanlytics"), { ok: false, reason: "That code is reserved. Try another." });
  assert.deepEqual(cleanPartnerCode(""), { ok: false, reason: "Choose a code for your link." });
  assert.equal(cleanPartnerCode(42).ok, false);
  assert.equal(isPartnerCode("ada"), true);
  assert.equal(isPartnerCode("signup"), false);
});

test("the link is /p/<code> on the app, and the cookie it leaves is read back as a code or as nothing", () => {
  assert.equal(partnerLinkFor("ada", "https://app.example.com/"), "https://app.example.com/p/ada");
  assert.equal(partnerCodeFromCookie(null), null);
  assert.equal(partnerCodeFromCookie(""), null);
  assert.equal(partnerCodeFromCookie(`sb-x=1; ${PARTNER_COOKIE}=ada-lovelace; other=2`), "ada-lovelace");
  assert.equal(partnerCodeFromCookie(`${PARTNER_COOKIE}=Ada`), "ada", "as it is stored");
  assert.equal(partnerCodeFromCookie(`${PARTNER_COOKIE}=ada%2Dlovelace`), "ada-lovelace", "url-encoded");
  assert.equal(partnerCodeFromCookie(`${PARTNER_COOKIE}=not a code`), null, "a value that is not a code is no code");
  assert.equal(partnerCodeFromCookie(`${PARTNER_COOKIE}=%E0%A4%A`), null, "and neither is one that does not decode");
  assert.equal(partnerCodeFromCookie("chanlytics_partner_x=ada"), null, "the name, exactly");
});

test("the words: the share from the row, the count from the memberships, the standing from the status", () => {
  assert.equal(shareWords(2500), "25% of what it pays for its plan");
  assert.equal(shareWords(1250), "12.5% of what it pays for its plan");
  assert.equal(shareWords(PARTNER_SHARE_BP_DEFAULT), "25% of what it pays for its plan", "what 00202 defaults to");
  assert.equal(broughtWords(0), "No workspace has come through your link yet.");
  assert.equal(broughtWords(1), "1 workspace came through your link.");
  assert.equal(broughtWords(3), "3 workspaces came through your link.");
  const dto = {
    id: "p1",
    code: "ada",
    status: "active",
    share_bp: 2500,
    terms_accepted_at: "2026-09-01T00:00:00Z",
    created_at: "2026-09-01T12:00:00Z",
  };
  const vm = partnerVM(dto, "https://app.example.com", 2);
  assert.equal(vm.link, "https://app.example.com/p/ada");
  assert.equal(vm.share, "25% of what it pays for its plan");
  assert.equal(vm.brought, "2 workspaces came through your link.");
  assert.equal(vm.standing, null, "an active account leads with nothing");
  assert.match(vm.since, /^A partner since Sep 1, 2026\.$/);
  assert.equal(partnerVM({ ...dto, status: "paused" }, "x", 0).standing, PARTNER_WORDS.paused);
  assert.equal(partnerVM({ ...dto, status: "closed" }, "x", 0).standing, PARTNER_WORDS.closed);
});

test("the earnings in words: each line a sum from the ledger, a zero said, what is owed back said as owed", () => {
  const none = partnerEarningsWords([]);
  assert.equal(none.none, true);
  assert.equal(none.held, "Nothing held. A share is held 30 days after each payment.");
  assert.equal(none.payable, "$0.00 payable.");
  assert.equal(none.paid, "$0.00 paid to date.");
  const ledger = [
    { currency: "usd", state: "held", earned_cents: 10000, next_payable_at: "2026-11-02T00:00:00Z" },
    { currency: "usd", state: "paid", earned_cents: 30000, next_payable_at: null },
  ];
  const some = partnerEarningsWords(ledger, Date.parse("2026-09-27T00:00:00Z"));
  assert.equal(some.none, false);
  assert.equal(some.held, "$100.00 held, the first of it payable from Nov 2 at the earliest.");
  assert.equal(
    partnerEarningsWords(ledger, Date.parse("2026-11-20T00:00:00Z")).held,
    "$100.00 held, payable once each workspace it came from is qualified.",
    "a date that has gone is not given: what waits past it waits on a judgement or a person",
  );
  assert.equal(some.paid, "$300.00 paid to date.");
  const owed = partnerEarningsWords([
    { currency: "usd", state: "payable", earned_cents: -2500, next_payable_at: null },
  ]);
  assert.equal(owed.payable, "-$25.00 to come off your next payout, for refunds and disputes after you were paid.");
  const two = partnerEarningsWords([
    { currency: "usd", state: "paid", earned_cents: 1000, next_payable_at: null },
    { currency: "eur", state: "paid", earned_cents: 2000, next_payable_at: null },
  ]);
  assert.equal(two.paid, "$10.00 and €20.00 paid to date.", "never a sum across currencies");
  assert.equal(partnerEarningsWords(null).none, true);
});

/* ------------------------------------------------------------------ the link */

const open = (code, cookie) =>
  link.GET(new Request(`http://localhost/p/${code}`, cookie ? { headers: { cookie } } : undefined), {
    params: Promise.resolve({ code }),
  });

test("/p/<code> leaves the cookie for thirty days and goes on to sign-up; first touch wins; not a code, no cookie", async () => {
  const r = await open("Ada");
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/signup");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(
    r.headers.get("set-cookie"),
    `${PARTNER_COOKIE}=ada; Max-Age=2592000; Path=/; SameSite=Lax; Secure`,
    "as it is stored, for thirty days, on this host alone",
  );
  const second = await open("bob", `${PARTNER_COOKIE}=ada`);
  assert.equal(second.status, 302);
  assert.equal(second.headers.get("set-cookie"), null, "the partner who found the business is the one credited");
  const junk = await open("not%20a%20code");
  assert.equal(junk.status, 302, "still a way to sign-up");
  assert.equal(junk.headers.get("set-cookie"), null);
  const reserved = await open("admin");
  assert.equal(reserved.headers.get("set-cookie"), null);
});

/* ---------------------------------------------------------------- the routes */

const USER = "u1";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
const tables = (extra = {}) => ({
  memberships: [
    membership(A, "owner", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "partner", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenants: [
    { id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" },
    { id: B, slug: "bayside", name: "Bayside", status: "active", timezone: "America/New_York" },
  ],
  profiles: [],
  ...extra,
});
const ctxFor = (t, rpcs = {}, headers = {}) => ({
  supabase: fakeDb(t, {}, { is_platform_admin: () => false, ...rpcs }),
  userId: USER,
  email: "ada@example.com",
  params: {},
  headers,
});
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, headers = {}) =>
  new Request("http://localhost/api/v1/x", { method, headers, body: JSON.stringify(body) });
const refused = async (p, code, status, message) =>
  assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status);
    if (message) assert.match(e.message, message);
    return true;
  });

test("the two declare their policy: on the account, no role to name, becoming one counted by the codes tried", () => {
  assert.deepEqual(partner.GET.policy, { kind: "read", scope: "account", role: null, rate: null, spend: false });
  assert.deepEqual(partner.POST.policy, {
    kind: "write",
    scope: "account",
    role: null,
    rate: "partner_become",
    spend: false,
  });
});

test("GET partner: the caller's row and their balance, or null and nothing; a database 00202 or 00203 has not reached reads as none", async () => {
  assert.deepEqual(await partner.GET.run(get(), ctxFor(tables())), { partner: null, balance: [] });
  const row = {
    id: "p1",
    code: "ada",
    status: "active",
    share_bp: 2500,
    terms_accepted_at: null,
    created_at: "2026-09-01T00:00:00Z",
  };
  const lines = [
    { currency: "usd", state: "held", earned_cents: "10000", next_payable_at: "2026-10-26T00:00:00Z" },
    { currency: "usd", state: "paid", earned_cents: "20000", next_payable_at: null },
  ];
  assert.deepEqual(
    await partner.GET.run(get(), ctxFor(tables({ partners: [row] }), { partner_balance: () => lines })),
    {
      partner: { ...row, brought: 0, letters: null },
      balance: [
        { currency: "usd", state: "held", earned_cents: 10000, next_payable_at: "2026-10-26T00:00:00Z" },
        { currency: "usd", state: "paid", earned_cents: 20000, next_payable_at: null },
      ],
    },
    "a bigint sum comes back as a number",
  );
  const noLedger = {
    partner_balance: () => {
      throw Object.assign(new Error("Could not find the function public.partner_balance"), { code: "PGRST202" });
    },
  };
  assert.deepEqual(
    await partner.GET.run(get(), ctxFor(tables({ partners: [row] }), noLedger)),
    { partner: { ...row, brought: 0, letters: null }, balance: [] },
    "no ledger yet is nothing earned yet",
  );
  assert.equal(
    (await partner.GET.run(get(), ctxFor(tables({ partners: [{ ...row, letters: false }] }), noLedger))).partner
      .letters,
    false,
    "the daily letter's switch, as kept (00209)",
  );
  const older = ctxFor(tables());
  older.supabase = fakeDb(tables(), { "partners.select": { message: 'relation "public.partners" does not exist' } });
  assert.deepEqual(await partner.GET.run(get(), older), { partner: null, balance: [] }, "either deploy order boots");
});

test("POST partner: the code judged in contracts' words before the door, then the function's own words back", async () => {
  const asked = [];
  const rpcs = {
    partner_become: (a) => {
      asked.push(a);
      if (a.p_code === "taken") throw Object.assign(new Error("That code is taken. Try another."), { code: "23505" });
      return {
        id: "p1",
        code: a.p_code,
        status: "active",
        share_bp: 2500,
        terms_accepted_at: "now",
        created_at: "now",
      };
    },
  };
  await refused(
    partner.POST.run(send("POST", { code: "ab", terms: true }), ctxFor(tables(), rpcs)),
    "validation",
    400,
    /3 to 24/,
  );
  await refused(partner.POST.run(send("POST", { code: "ada" }), ctxFor(tables(), rpcs)), "validation", 400);
  await refused(
    partner.POST.run(send("POST", { code: "ada", terms: false }), ctxFor(tables(), rpcs)),
    "validation",
    400,
  );
  assert.equal(asked.length, 0, "nothing reached the function");
  await refused(
    partner.POST.run(send("POST", { code: "taken", terms: true }), ctxFor(tables(), rpcs)),
    "conflict",
    409,
    /taken/,
  );
  const out = await partner.POST.run(send("POST", { code: " Ada ", terms: true }), ctxFor(tables(), rpcs));
  assert.equal(out.partner.code, "ada");
  assert.deepEqual(asked.at(-1), { p_code: "ada" }, "as it is stored");
});

test("PATCH partner: the daily letter on or off through the caller's own door, its refusals mapped", async () => {
  const asked = [];
  const rpcs = {
    partner_letters_set: (a) => {
      asked.push(a);
      if (a.p_on === true && asked.length > 2)
        throw Object.assign(new Error("You are not a partner."), { code: "P0002" });
      return a.p_on;
    },
  };
  await refused(partner.PATCH.run(send("PATCH", { letters: "yes" }), ctxFor(tables(), rpcs)), "validation", 400);
  await refused(
    partner.PATCH.run(send("PATCH", { letters: true, extra: 1 }), ctxFor(tables(), rpcs)),
    "validation",
    400,
  );
  assert.equal(asked.length, 0, "nothing reached the function");
  assert.deepEqual(await partner.PATCH.run(send("PATCH", { letters: false }), ctxFor(tables(), rpcs)), {
    letters: false,
  });
  assert.deepEqual(await partner.PATCH.run(send("PATCH", { letters: true }), ctxFor(tables(), rpcs)), {
    letters: true,
  });
  await refused(
    partner.PATCH.run(send("PATCH", { letters: true }), ctxFor(tables(), rpcs)),
    "not_found",
    404,
    /not a partner/,
  );
  assert.deepEqual(asked, [{ p_on: false }, { p_on: true }, { p_on: true }]);
});

test("a new workspace: the cookie's code goes to the function only with the person's yes, and on a database without the argument the call is made again without it", async () => {
  const made = [];
  const row = (a) => ({
    id: C,
    slug: "harbor-two",
    name: a.p_name,
    status: "active",
    timezone: a.p_timezone ?? "America/New_York",
  });
  const withCode = ctxFor(tables(), { create_workspace: (a) => (made.push(a), row(a)) });
  const cookie = { cookie: `sb-a=1; ${PARTNER_COOKIE}=ada` };
  await create.POST.run(
    send("POST", { name: "Harbor Two", timezone: "America/Chicago", partner: "ada" }, cookie),
    withCode,
  );
  assert.deepEqual(made, [{ p_name: "Harbor Two", p_timezone: "America/Chicago", p_partner_code: "ada" }]);

  // A cookie the person did not say yes to, or a yes to some other code, seats and credits nobody (0012).
  made.length = 0;
  await create.POST.run(send("POST", { name: "Harbor Two" }, cookie), withCode);
  await create.POST.run(send("POST", { name: "Harbor Two", partner: "someone-else" }, cookie), withCode);
  assert.deepEqual(
    made.map((a) => "p_partner_code" in a),
    [false, false],
    "no yes, no partner",
  );

  made.length = 0;
  const bare = ctxFor(tables(), { create_workspace: (a) => (made.push(a), row(a)) });
  await create.POST.run(send("POST", { name: "Harbor Two" }), bare);
  assert.deepEqual(made, [{ p_name: "Harbor Two", p_timezone: undefined }], "no cookie, no argument");

  made.length = 0;
  const older = ctxFor(tables(), {
    create_workspace: (a) => {
      made.push(a);
      if ("p_partner_code" in a)
        throw Object.assign(
          new Error("Could not find the function public.create_workspace(p_name, p_partner_code, p_timezone)"),
          { code: "PGRST202" },
        );
      return row(a);
    },
  });
  const out = await create.POST.run(send("POST", { name: "Harbor Two", partner: "ada" }, cookie), older);
  assert.equal(out.workspace.slug, "harbor-two", "the workspace is made whichever deploys first");
  assert.deepEqual(
    made.map((a) => "p_partner_code" in a),
    [true, false],
    "once with the code, then without: the drop is logged, never a refusal",
  );
});

test("where you are: each workspace with the caller's role in it, and whether they are a partner", async () => {
  const row = { id: "p1", code: "ada", status: "active", share_bp: 2500, terms_accepted_at: null, created_at: "x" };
  const home = await workspaces.GET.run(get(`?workspace=${A}`), ctxFor(tables({ partners: [row] })));
  assert.deepEqual(
    home.workspaces.map((w) => [w.slug, w.role]),
    [
      ["bayside", "partner"],
      ["harbor", "owner"],
    ],
    "by name, each with its role",
  );
  assert.deepEqual(home.user.partner, { code: "ada", status: "active" });
  const plain = await workspaces.GET.run(get(`?workspace=${A}`), ctxFor(tables()));
  assert.equal(plain.user.partner, null);
});

/* ------------------------------------------------------------------ the wiring */

test("wiring, run: the pane's surface is real and waits for Settings, becoming one has its bucket, the ledger's kinds are declared", () => {
  // The manifest and the harness (legacy-harness.test.mjs), the public prefix (auth-gate.test.mjs), the rail and the
  // pane (partner-pane.test.mjs) and the function's refusals (partner.db.test.mjs) are proved where they are run.
  assert.equal(SURFACE_STATES["admin/partner"], "real");
  assert.equal(ROUTE_SURFACE["admin/partner"], "settings");
  assert.deepEqual(RATE.partner_become, { limit: 10, windowMs: 3_600_000, noun: "partner codes tried" });
  for (const k of [
    "partner.attributed",
    "partner.code_ignored",
    "partner.earned",
    "partner.reversed",
    "partner.standing_set",
    "partner.paid",
  ])
    assert.ok(EVENT_KINDS.includes(k), k);
  // The back office's two partner verbs (P5) have their ceilings.
  assert.equal(RATE.platform_partner_standing.limit, 60);
  assert.equal(RATE.platform_partner_payout.limit, 30);
  assert.equal(RATE.platform_partner_status.limit, 20);
});

/* ------------------------------------------------------------ the workspaces a partner brought (P4) */

const NOW = Date.parse("2026-09-26T12:00:00Z");
/** The back office's row for a workspace, as platform_overview_rows_for answers it. */
const overviewRow = (over = {}) => ({
  tenant_id: "t-live",
  slug: "harbor",
  name: "Harbor Moving",
  status: "active",
  timezone: "America/New_York",
  created_at: "2026-08-01T00:00:00Z",
  members: 2,
  billing_mode: "stripe",
  billing_status: "active",
  trial_end: null,
  current_period_end: "2026-10-20T00:00:00Z",
  line_e164: "+13055550142",
  line_kind: "provisioned",
  voice_state: "answering",
  sms_state: "active",
  reg_step: null,
  reg_mock: false,
  reg_sole_prop: false,
  line_error: null,
  whatsapp_number: null,
  whatsapp_active: null,
  voice_number: "+13055550142",
  voice_active: true,
  last_inbound_at: "2026-09-25T15:00:00Z",
  ...over,
});
const moneyRow = (over = {}) => ({
  tenant_id: "t-live",
  name: "Harbor Moving",
  on_team: true,
  standing: "qualified",
  currency: "usd",
  held_cents: 10000,
  payable_cents: 0,
  paid_cents: 20000,
  month_cents: 10000,
  ...over,
});

test("the partner's table: the back office's verdict and sentence for each, the standing when it matters, and what each earned", () => {
  const vm = partnerWorkspacesVM(
    [
      overviewRow(),
      overviewRow({
        tenant_id: "t-new",
        slug: "bayside",
        name: "Bayside Dental",
        created_at: "2026-09-26T08:00:00Z",
        line_e164: null,
        voice_state: null,
        sms_state: null,
        voice_active: null,
        voice_number: null,
        last_inbound_at: null,
        billing_status: "none",
        members: 2,
      }),
    ],
    [
      moneyRow(),
      moneyRow({
        tenant_id: "t-new",
        name: "Bayside Dental",
        standing: null,
        held_cents: 0,
        paid_cents: 0,
        month_cents: 0,
      }),
    ],
    NOW,
  );
  const live = vm.rows.find((r) => r.tenantId === "t-live");
  assert.equal(live.verdict, "live");
  assert.equal(live.label, "Live");
  assert.equal(live.standing, null, "a qualified workspace says nothing about its standing: that is the rule");
  assert.equal(live.money, "$100.00 from this month's payments · $300.00 to date");
  assert.ok(live.facts.includes("texting"), "the back office's four facts");
  assert.equal(live.onTeam, true);
  const fresh = vm.rows.find((r) => r.tenantId === "t-new");
  assert.equal(fresh.standing, "Its share is judged once it has paid.");
  assert.equal(fresh.money, "Nothing earned from it yet.");
  assert.match(vm.summary, /^2 workspaces · 1 live/);
});

test("a workspace whose owner took the partner off its team keeps its money line and shows nothing else of the business", () => {
  const vm = partnerWorkspacesVM(
    [],
    [moneyRow({ tenant_id: "t-off", name: "Old Client", on_team: false, standing: "review" })],
    NOW,
  );
  assert.equal(vm.rows.length, 1);
  const r = vm.rows[0];
  assert.deepEqual([r.verdict, r.facts, r.slug, r.onTeam], [null, null, null, false]);
  assert.match(r.sentence, /took you off its team/);
  // Paused or closed, the platform took the seat, not an owner, and the words say so.
  const paused = partnerWorkspacesVM([], [moneyRow({ tenant_id: "t-off", on_team: false })], NOW, "paused");
  assert.match(paused.rows[0].sentence, /^Your partner account is paused/);
  const closed = partnerWorkspacesVM([], [moneyRow({ tenant_id: "t-off", on_team: false })], NOW, "closed");
  assert.doesNotMatch(closed.rows[0].sentence, /share goes on/, "a closed partner earns nothing new");
  assert.match(r.standing, /^Under review/);
  assert.equal(r.money, "$100.00 from this month's payments · $300.00 to date");
  assert.equal(vm.summary, "1 workspace · 0 live");
});

test("nothing brought yet is said once, and needs-you counts only what the back office says needs someone", () => {
  assert.equal(partnerWorkspacesVM([], [], NOW).summary, "No workspace has come through your link yet.");
  const broken = overviewRow({
    tenant_id: "t-b",
    slug: "b",
    name: "B",
    voice_state: "failed",
    line_error: "Twilio said no.",
  });
  const vm = partnerWorkspacesVM([broken], [], NOW);
  assert.match(vm.summary, /1 needs you$/);
});

test("GET partner/workspaces: on the account, every caller's own two lists, none on a database without the doors", async () => {
  assert.deepEqual(partnerWorkspaces.GET.policy, {
    kind: "read",
    scope: "account",
    role: null,
    rate: null,
    spend: false,
  });
  const out = await partnerWorkspaces.GET.run(
    get(),
    ctxFor(tables(), {
      partner_overview: () => [overviewRow()],
      partner_workspace_money: () => [{ ...moneyRow(), held_cents: "10000", paid_cents: "20000" }],
    }),
  );
  assert.equal(out.overview.length, 1);
  assert.equal(out.money[0].held_cents, 10000, "a bigint sum comes back as a number");
  const missing = () => {
    throw Object.assign(new Error("Could not find the function public.partner_overview"), { code: "PGRST202" });
  };
  assert.deepEqual(
    await partnerWorkspaces.GET.run(
      get(),
      ctxFor(tables(), { partner_overview: missing, partner_workspace_money: missing }),
    ),
    { overview: [], money: [] },
  );
});

/* ------------------------------------------------------------ standing and payouts, in the back office (P5) */

const line = (over = {}) => ({
  partner_id: "p1",
  code: "ada-co",
  email: "ada@example.com",
  status: "active",
  share_bp: 2500,
  joined_at: "2026-08-01T00:00:00Z",
  workspaces: 3,
  under_review: 0,
  currency: "usd",
  held_cents: 0,
  payable_cents: 0,
  paid_cents: 0,
  last_paid_at: null,
  ...over,
});

test("the back office's partner line: who, what they are owed, and a payout only when the net is above zero", () => {
  const [row] = platformPartnerRows([
    line({ under_review: 1, status: "paused", payable_cents: 12500, held_cents: 5000 }),
  ]);
  assert.equal(row.who, "ada@example.com · 3 workspaces · 1 under review · 25% of what each pays · paused");
  assert.equal(row.money, "$125.00 payable · $50.00 held · $0.00 paid to date");
  assert.equal(row.canPay, true);
  assert.equal(row.payLabel, "Mark $125.00 as paid");
  assert.equal(row.tone, "danger", "a paused partner outranks a workspace under review");
  assert.equal(
    platformPartnerRows([line({ under_review: 1 })])[0].tone,
    "warn",
    "a workspace under review is a person's to look at",
  );
  const [owed] = platformPartnerRows([line({ payable_cents: -3000, paid_cents: 12500 })]);
  assert.equal(owed.canPay, false);
  assert.equal(owed.money, "-$30.00 to come off the next payout · $0.00 held · $125.00 paid to date");
  const [fresh] = platformPartnerRows([line({ currency: null, email: null })]);
  assert.equal(fresh.money, "Nothing earned yet.");
  assert.match(fresh.who, /^no address on file/);
});

test("the partner card's line counts partners once, sums what is payable per currency, never across them", () => {
  assert.equal(platformPartnerSummary([]), "No partners yet.");
  assert.equal(
    platformPartnerSummary([
      line({ payable_cents: 10000, under_review: 2 }),
      line({ currency: "eur", payable_cents: 2000, under_review: 2 }),
      line({ partner_id: "p2", code: "bo", payable_cents: -500 }),
    ]),
    "2 partners · $100.00 and €20.00 payable · 2 workspaces under review",
  );
  assert.equal(platformPartnerSummary([line()]), "1 partner · nothing payable");
});

test("a person's decisions: never the standing it has; the outcome said in words", () => {
  assert.deepEqual(partnerStandingChoices("review"), ["qualified", "disqualified"]);
  assert.deepEqual(partnerStandingChoices(null), ["qualified", "review", "disqualified"]);
  assert.equal(
    partnerStandingOutcomeWords({ standing: "disqualified", voided: 1, matured: 0 }),
    "Disqualified. What it still held (1 share) is void; what was paid stays paid.",
  );
  assert.equal(
    partnerStandingOutcomeWords({ standing: "qualified", voided: 0, matured: 2 }),
    "Qualified. 2 shares past the hold are payable now.",
  );
  assert.equal(
    partnerStandingOutcomeWords({ standing: "review", voided: 0, matured: 0 }),
    "Now under review. What it holds waits until a person decides.",
  );
  assert.equal(
    partnerPayoutOutcomeWords("ada-co", { paid: true, total_cents: 12500, currency: "usd", earnings: 2 }),
    "Recorded: $125.00 paid to ada-co, settling 2 ledger lines.",
  );
  assert.equal(
    partnerPayoutOutcomeWords("ada-co", { paid: false, total_cents: -3000, currency: "usd" }),
    "Nothing to pay: refunds since the last payout take $30.00, which comes off their next share.",
  );
  assert.equal(
    partnerPayoutOutcomeWords("ada-co", { paid: false, changed: true, total_cents: 13000, currency: "usd" }),
    "Nothing was recorded: what is payable to ada-co is now $130.00, not what the card showed. Read the card again before you mark it.",
  );
  assert.equal(
    partnerPayoutOutcomeWords("ada-co", { paid: false, total_cents: 0, currency: "usd" }),
    "Nothing is payable to them in that currency, so nothing was recorded.",
  );
});

test("a partner is paused, closed or restored: never to the status they have, drawn once per partner, and said in words", () => {
  assert.deepEqual(partnerStatusChoices("active"), ["paused", "closed"]);
  assert.deepEqual(partnerStatusChoices("paused"), ["active", "closed"]);
  const rows = platformPartnerRows([
    line({ currency: "usd" }),
    line({ currency: "eur" }),
    line({ partner_id: "p2", code: "bo", status: "paused" }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.first),
    [true, false, true],
    "the partner's own buttons once, on their first line",
  );
  assert.deepEqual(
    rows[2].statusChoices.map((c) => c.label),
    ["Restore", "Close"],
  );
  assert.equal(rows[2].tone, "danger", "a paused partner is not a quiet line");
  assert.equal(
    partnerStatusOutcomeWords("ada-co", { status: "paused", seats: 2 }),
    "ada-co is paused: a viewer on 2 workspaces now, and what they held there is released.",
  );
  assert.equal(
    partnerStatusOutcomeWords("ada-co", { status: "active", seats: 1 }),
    "ada-co is restored, and a partner again on 1 workspace.",
  );
  assert.equal(
    partnerStatusOutcomeWords("ada-co", { status: "closed", seats: 0 }),
    "ada-co is closed. They held no partner seat to take.",
  );
});
