/**
 * The Console's doors, run through route() (decision 0066): the real route modules, their `run` called with a database
 * in memory for the session and another for the service role. What is proved is who is let in (staff, with their
 * second factor shown), which role may take which act before anything is judged, that the Admin log's row is written
 * before an act runs and an act whose row cannot be written does not run, and what Requests, claims, Find, the log,
 * Support's queue and its presses (decision 0067) and Get help answer.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONSOLE_ACT_KEYS, SECOND_FACTOR_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const route = (p) => import(at(`apps/dashboard/app/api/v1/${p}/route.ts`));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const me = await route("platform/me");
const retry = await route("platform/lines/retry");
const payout = await route("platform/partners/payout");
const invited = await route("platform/waitlist/invited");
const requests = await route("platform/requests");
const step = await route("platform/requests/step");
const claims = await route("platform/claims");
const find = await route("platform/find");
const acts = await route("platform/acts");
const report = await route("support/report");
const support = await route("platform/support");
const bugs = await route("platform/support/bugs");
const mark = await route("platform/support/mark");
const resend = await route("platform/support/resend");
const move = await route("platform/support/kind");
const health = await route("platform/health");
const redrive = await route("platform/deliveries/redrive");

beforeEach(() => setRateStore(memoryStore()));
afterEach(() => setServiceClient(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const L1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const P1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const W1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const WHY = { kind: "ticket", ticket: "R-1042", note: "They wrote in." };

/** A session the database says is `state` to the Console. */
const ctxFor = (state, { tables = {}, rpcs = {}, params = {}, email = "alex@chanlytics.com" } = {}) => ({
  supabase: fakeDb(tables, {}, { platform_staff_state: () => state, ...rpcs }),
  userId: ME,
  email,
  params,
});
/** The service role's world: what an act writes its row to, and what the Console's own tables hold. */
function service(tables = {}, faults = {}) {
  const world = { platform_acts: [], ...tables };
  setServiceClient(fakeDb(world, faults));
  return world;
}
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const post = (body) => new Request("http://localhost/api/v1/x", { method: "POST", body: JSON.stringify(body) });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

/* --------------------------------------------------------------------------------------------------- the door */

test("every platform write names the act its role is asked for; only taking a workspace, which acts on nothing, names none", () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/route-policy.json"), "utf8"));
  const writes = Object.entries(policy.routes).filter(([, p]) => p.scope === "platform" && p.kind === "write");
  assert.ok(writes.length >= 12, `found ${writes.length}`);
  for (const [key, p] of writes) {
    if (key === "POST platform/claims") assert.equal(p.act, undefined, key);
    else assert.ok(CONSOLE_ACT_KEYS.includes(p.act), `${key} names a Console act: ${p.act}`);
  }
});

test("who may open the Console: nobody but staff learns it is there, staff show their second factor first, and a database that cannot answer is not a no", async () => {
  await refused(me.GET.run(get(), ctxFor("none")), "not_found", 404, "No such page.");
  await refused(
    me.GET.run(get(), ctxFor("needs_second_factor")),
    "mfa_required",
    403,
    SECOND_FACTOR_WORDS.staffRequired,
  );
  const hiccup = ctxFor("owner", {
    rpcs: {
      platform_staff_state: () => {
        throw new Error("connection reset");
      },
    },
  });
  await refused(me.GET.run(get(), hiccup), "internal", 503);
  assert.deepEqual(await me.GET.run(get(), ctxFor("support")), {
    user_id: ME,
    email: "alex@chanlytics.com",
    name: "Alex",
    role: "support",
  });
});

test("a role is refused an act it may not take before its body is judged, and nothing is written", async () => {
  const world = service();
  await refused(
    retry.POST.run(post({ tenant_id: A, line_id: L1, why: WHY }), ctxFor("billing")),
    "forbidden",
    403,
    "Billing cannot do that: retry setting up.",
  );
  // Before the body: a billing session sending nonsense is told the same, not told what is wrong with its body.
  await refused(retry.POST.run(post({ nonsense: true }), ctxFor("billing")), "forbidden", 403);
  await refused(
    payout.POST.run(post({ partner_id: P1, currency: "usd", reference: "r", why: WHY }), ctxFor("support")),
    "forbidden",
    403,
    "Support cannot do that: record a payout.",
  );
  assert.deepEqual(world.platform_acts, []);
});

test("an act whose log row cannot be written does not run", async () => {
  const waitlist = [
    {
      id: W1,
      email: "ana@example.com",
      business: null,
      source: null,
      created_at: "2026-10-01T00:00:00Z",
      invited_at: null,
      invited_by: null,
    },
  ];
  service({ waitlist }, { "platform_acts.insert": { message: "permission denied", code: "42501" } });
  await refused(
    invited.POST.run(post({ id: W1, why: WHY }), ctxFor("support")),
    "internal",
    503,
    "That could not be recorded, so it was not done.",
  );
  assert.equal(waitlist[0].invited_at, null, "nobody was marked: an act nobody can be held to did not happen");
});

test("an act is written down with who, their role, where and why before it runs, then what came of it", async () => {
  const waitlist = [
    {
      id: W1,
      email: "ana@example.com",
      business: null,
      source: null,
      created_at: "2026-10-01T00:00:00Z",
      invited_at: null,
      invited_by: null,
    },
  ];
  const world = service({ waitlist });
  assert.deepEqual(await invited.POST.run(post({ id: W1, why: WHY }), ctxFor("support")), { outcome: "marked" });
  const [row] = world.platform_acts;
  assert.deepEqual(
    [
      row.actor_id,
      row.actor_email,
      row.actor_role,
      row.act,
      row.target_kind,
      row.target_id,
      row.reason_kind,
      row.ticket,
      row.note,
      row.outcome,
    ],
    [
      ME,
      "alex@chanlytics.com",
      "support",
      "waitlist_invited",
      "waitlist",
      W1,
      "ticket",
      "R-1042",
      "They wrote in.",
      "done",
    ],
  );
  assert.equal(waitlist[0].invited_by, ME);
});

test("a line act the edge could not do is failed, not refused: refused says the edge said no and nothing was done", async () => {
  // No edge credential on a laptop: the edge is never asked, as when it is down or did not answer in time (a 503).
  const world = service({ events: [] });
  const out = await retry.POST.run(post({ tenant_id: A, line_id: L1, why: WHY }), ctxFor("support"));
  assert.equal(out.status, 503);
  assert.deepEqual(
    world.platform_acts.map((r) => [r.act, r.outcome, r.outcome_note]),
    [["line_retry", "failed", "no_edge_credential"]],
  );
});

/* ------------------------------------------------------------------------------------------------------- Requests */

const harbor = {
  id: A,
  slug: "old-town-cuts",
  name: "Old Town Cuts",
  status: "active",
  timezone: "America/New_York",
  created_at: "2026-01-01T00:00:00Z",
};

test("a request is filed by its workspace's address, kept by its name, and counted from when they asked", async () => {
  const world = service({ tenants: [harbor], privacy_requests: [] });
  const body = (over) => ({
    kind: "delete_workspace",
    workspace: "old-town-cuts",
    asked_by: "owner@example.com",
    asked_at: "2026-10-13T12:00:00Z",
    why: WHY,
    ...over,
  });
  await refused(
    requests.POST.run(post(body({ workspace: "nobody-here" })), ctxFor("support")),
    "validation",
    400,
    "No workspace has that address.",
  );
  await refused(
    requests.POST.run(post(body({ asked_at: "2099-01-01T00:00:00Z" })), ctxFor("support")),
    "validation",
    400,
  );
  await refused(requests.POST.run(post(body({})), ctxFor("billing")), "forbidden", 403);
  const out = await requests.POST.run(post(body({})), ctxFor("support"));
  assert.equal(out.request.due_at, "2026-11-12T12:00:00.000Z", "thirty days from when they asked");
  assert.equal(out.request.name, "Old Town Cuts");
  assert.equal(out.request.slug, "old-town-cuts");
  assert.deepEqual(out.request.steps, {});
  assert.equal(world.privacy_requests.length, 1);
  assert.deepEqual(
    world.platform_acts.map((r) => [r.act, r.target_kind, r.target_id, r.tenant_id, r.outcome]),
    [["request_file", "request", out.request.id, A, "done"]],
    "the act names the request it made",
  );
  const listed = await requests.GET.run(get(), ctxFor("support"));
  assert.deepEqual(
    listed.requests.map((r) => r.id),
    [out.request.id],
    "the roles that work requests read the clock",
  );
  // Billing works none, and who asked to be erased is no one else's: refused before anything is read.
  await refused(
    requests.GET.run(get(), ctxFor("billing")),
    "forbidden",
    403,
    "Billing cannot see the privacy requests.",
  );
});

test("a request's steps are marked one by one, it closes only once every step is done, and a refusal is the act's outcome", async () => {
  const world = service({ tenants: [harbor], privacy_requests: [] });
  const filed = await requests.POST.run(
    post({
      kind: "copy",
      workspace: "old-town-cuts",
      asked_by: "owner@example.com",
      asked_at: "2026-10-13T12:00:00Z",
      why: WHY,
    }),
    ctxFor("owner"),
  );
  const id = filed.request.id;
  const mark = (s, done = true) => step.POST.run(post({ id, step: s, done, why: WHY }), ctxFor("support"));
  await refused(mark("deleted"), "conflict", 409, "not one this request has");
  await refused(mark("close"), "conflict", 409, "Mark each step first");
  assert.equal((await mark("confirmed")).request.steps.confirmed !== undefined, true);
  assert.equal((await mark("confirmed", false)).request.steps.confirmed, undefined, "a step can be undone");
  for (const s of ["confirmed", "sent", "told"]) await mark(s);
  const closed = await mark("close");
  assert.ok(closed.request.closed_at, "closed once every step is done");
  await refused(mark("told", false), "conflict", 409, "closed already");
  assert.deepEqual(
    world.platform_acts.map((r) => [r.act, r.outcome]),
    [
      ["request_file", "done"],
      ["request_step", "refused"],
      ["request_close", "refused"],
      ["request_step", "done"],
      ["request_step", "done"],
      ["request_step", "done"],
      ["request_step", "done"],
      ["request_step", "done"],
      ["request_close", "done"],
      ["request_step", "refused"],
    ],
  );
});

test("two people marking a request at once: the second is told it changed, and neither step is erased", async () => {
  const world = service({ tenants: [harbor], privacy_requests: [] });
  const filed = await requests.POST.run(
    post({
      kind: "copy",
      workspace: "old-town-cuts",
      asked_by: "owner@example.com",
      asked_at: "2026-10-13T12:00:00Z",
      why: WHY,
    }),
    ctxFor("owner"),
  );
  const mark = (s) => step.POST.run(post({ id: filed.request.id, step: s, done: true, why: WHY }), ctxFor("support"));
  // Both read the request before either writes: the later write was judged on steps that are no longer there.
  const raced = await Promise.allSettled([mark("confirmed"), mark("sent")]);
  const landed = raced.filter((r) => r.status === "fulfilled");
  const lost = raced.filter((r) => r.status === "rejected");
  assert.equal(landed.length, 1, "one of the two lands");
  assert.equal(lost[0].reason.status, 409);
  assert.ok(lost[0].reason.message.includes("Someone else changed or closed this request"), lost[0].reason.message);
  assert.deepEqual(world.privacy_requests[0].steps, landed[0].value.request.steps, "the step that landed is kept");
  // Read again, the other goes in beside it.
  const again = await mark(landed[0].value.request.steps.confirmed ? "sent" : "confirmed");
  assert.deepEqual(Object.keys(again.request.steps).sort(), ["confirmed", "sent"]);
});

/* -------------------------------------------------------------------------------------------------- who has it */

test("a workspace is taken by one person at a time, told who has it, and let go only by whoever took it", async () => {
  const world = service({ tenants: [harbor], platform_claims: [] });
  const taken = await claims.POST.run(post({ tenant_id: A, take: true }), ctxFor("support"));
  assert.equal(taken.claim.user_id, ME);
  assert.ok(Date.parse(taken.claim.until) > Date.now() + 3 * 3_600_000, "four hours");
  // Someone else on the team: refused, by name.
  const theirs = { ...ctxFor("support", { email: "sam@chanlytics.com" }), userId: OTHER };
  await refused(claims.POST.run(post({ tenant_id: A, take: true }), theirs), "conflict", 409, "Alex is on it already.");
  // Their letting go lets go of nothing of yours.
  await claims.POST.run(post({ tenant_id: A, take: false }), theirs);
  assert.equal(world.platform_claims.length, 1);
  // Yours, taken again, runs for four hours from now; let go, it is gone.
  await claims.POST.run(post({ tenant_id: A, take: true }), ctxFor("support"));
  assert.equal(world.platform_claims.length, 1);
  assert.deepEqual(await claims.POST.run(post({ tenant_id: A, take: false }), ctxFor("support")), { claim: null });
  assert.equal(world.platform_claims.length, 0);
  // A claim that ran out is nobody's.
  world.platform_claims.push({
    tenant_id: A,
    user_id: OTHER,
    email: "sam@chanlytics.com",
    claimed_at: "2026-10-01T00:00:00Z",
    until: "2026-10-01T04:00:00Z",
  });
  assert.equal((await claims.POST.run(post({ tenant_id: A, take: true }), ctxFor("billing"))).claim.user_id, ME);
  assert.deepEqual(world.platform_acts, [], "taking a workspace acts on nothing, so it is not in the log");
});

/* ------------------------------------------------------------------------------------------------------- Find */

test("Find asks the database's own function on the session, and a refusal there is no such page", async () => {
  const asked = [];
  const rows = [
    {
      kind: "workspace",
      tenant_id: A,
      slug: "old-town-cuts",
      name: "Old Town Cuts",
      label: "Old Town Cuts",
      detail: "old-town-cuts",
    },
    { kind: "nonsense", tenant_id: A, slug: "x", name: "x", label: "x", detail: "x" },
  ];
  const ok = ctxFor("support", { rpcs: { platform_find: (a) => (asked.push(a), rows) } });
  const out = await find.GET.run(get("?q=%20old%20"), ok);
  assert.deepEqual(asked, [{ p_q: "old" }], "the words, trimmed");
  assert.deepEqual(
    out.rows.map((r) => r.kind),
    ["workspace"],
    "only the kinds the Console knows",
  );
  await refused(find.GET.run(get("?q=o"), ok), "validation", 400, "At least 2 characters.");
  const denied = ctxFor("support", {
    rpcs: {
      platform_find: () => {
        throw Object.assign(new Error("staff only"), { code: "42501" });
      },
    },
  });
  await refused(find.GET.run(get("?q=old"), denied), "not_found", 404);
});

/* --------------------------------------------------------------------------------------------------- the log */

test("the log is read newest first, one person's or everyone's, and as a CSV file for the record", async () => {
  const at = (h) => new Date(Date.parse("2026-10-21T12:00:00Z") - h * 3_600_000).toISOString();
  const row = (id, hoursAgo, actor_id) => ({
    id,
    at: at(hoursAgo),
    actor_id,
    actor_email: actor_id === ME ? "alex@chanlytics.com" : "sam@chanlytics.com",
    actor_role: "support",
    act: "line_retry",
    tenant_id: A,
    target_kind: "line",
    target_id: L1,
    reason_kind: "found",
    ticket: null,
    note: "Stopped, at the brand",
    outcome: "done",
    outcome_note: null,
    finished_at: at(hoursAgo),
    // The embed, as PostgREST joins it (the double draws what the fixture joined).
    tenant: { slug: "old-town-cuts", name: "Old Town Cuts" },
  });
  service({
    tenants: [harbor],
    platform_acts: [
      row("00000000-0000-4000-8000-000000000001", 3, ME),
      row("00000000-0000-4000-8000-000000000002", 1, OTHER),
    ],
  });
  const all = await acts.GET.run(get(), ctxFor("billing"));
  assert.deepEqual(
    all.rows.map((r) => r.id.slice(-1)),
    ["2", "1"],
    "newest first",
  );
  assert.equal(all.rows[0].name, "Old Town Cuts", "with the workspace's name");
  const mine = await acts.GET.run(get(`?who=${ME}`), ctxFor("billing"));
  assert.deepEqual(
    mine.rows.map((r) => r.actor_id),
    [ME],
  );
  const csv = await acts.GET.run(get("?format=csv"), ctxFor("billing"));
  assert.equal(csv.rows.length, 0);
  assert.match(csv.csv, /^at,who,role,act,workspace,reason,ticket,note,outcome,outcome_note\r\n/);
  assert.match(csv.csv, /"Stopped, at the brand"/);
});

/* --------------------------------------------------------------------------------------------- Report a problem */

test("Get help keeps the report first, with what they need, under the workspace only when the member belongs to it", async () => {
  const world = service({ support_reports: [] });
  const member = {
    supabase: fakeDb(
      {
        memberships: [
          {
            user_id: ME,
            tenant_id: A,
            role: "owner",
            tenants: { slug: "old-town-cuts" },
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      {},
      {},
    ),
    userId: ME,
    email: "owner@example.com",
    params: {},
  };
  const body = (over) => ({
    words: "  The calendar won't load  ",
    page: "calendar",
    error: { id: "e4c1", name: "TypeError", message: "Cannot read properties of undefined" },
    workspace: "old-town-cuts",
    ...over,
  });
  await refused(report.POST.run(post(body({ words: "   " })), member), "validation", 400, "Say what you need first.");
  await refused(report.POST.run(post(body({ page: "Not/A/Page" })), member), "validation", 400);
  const out = await report.POST.run(post(body({})), member);
  // Its number is the database's identity, R-1001 and up, which console.db.test.mjs proves; the double keeps none.
  assert.ok(out.code.startsWith("R-"));
  assert.equal(out.mailed, false, "a deployment that reaches no provider sends no mail, and says so");
  const [kept] = world.support_reports;
  assert.deepEqual(
    [kept.kind, kept.tenant_id, kept.user_id, kept.email, kept.page, kept.error_id, kept.words],
    ["wrong", A, ME, "owner@example.com", "calendar", "e4c1", "The calendar won't load"],
    "a sheet from before the pick, with an error, is something that isn't working",
  );
  assert.equal(out.meanwhile, null, "a bug has no line of help to say back");
  assert.equal(kept.mail_error, "This deployment sends no mail.", "and Support shows it as not in the inbox");
  // A workspace the member is not in is not taken: the report is theirs, about no workspace.
  await report.POST.run(post(body({ workspace: "someone-elses" })), member);
  assert.equal(world.support_reports[1].tenant_id, null);
  // A question: the error goes with nothing, and the answer says the one line that helps meanwhile.
  const asked = await report.POST.run(
    post(body({ kind: "how_to", words: "How do I connect WhatsApp?", page: "admin" })),
    member,
  );
  const question = world.support_reports[2];
  assert.deepEqual([question.kind, question.error_id], ["how_to", null]);
  assert.equal(asked.meanwhile, "WhatsApp connects from Settings › Connections › WhatsApp.");
  assert.equal(world.platform_acts.length, 0, "a member's report is not the team's act");
});

/* ----------------------------------------------------------------------------------------- Support (decision 0067) */

const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const R1 = "33333333-3333-4333-8333-333333333331";
const R2 = "33333333-3333-4333-8333-333333333332";
const E1 = "3f9c2a77-0000-4000-8000-000000000000";
const DAY_MS = 86_400_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const overviewRow = (tenant_id, slug, name) => ({
  tenant_id,
  slug,
  name,
  status: "active",
  timezone: "America/New_York",
  created_at: ago(30 * DAY_MS),
  members: 1,
  billing_mode: "stripe",
  billing_status: "active",
  trial_end: null,
  current_period_end: null,
  line_e164: null,
  line_kind: null,
  voice_state: null,
  sms_state: null,
  reg_step: null,
  reg_mock: null,
  reg_sole_prop: null,
  line_error: null,
  whatsapp_number: null,
  whatsapp_active: null,
  voice_number: null,
  voice_active: null,
  last_inbound_at: null,
});

const reportRow = (over = {}) => ({
  id: R1,
  number: 1044,
  kind: "how_to",
  tenant_id: A,
  user_id: OTHER,
  email: "dana@example.com",
  page: "admin",
  error_id: null,
  error_name: null,
  error_message: null,
  words: "How do I connect WhatsApp?",
  created_at: ago(3 * 3_600_000),
  mailed_at: ago(3 * 3_600_000),
  mail_error: null,
  tenant: { slug: "harbor-moving", name: "Harbor Moving" },
  ...over,
});

/** The log's rows as Postgres keeps them: the double stamps no default but an id, and `at` defaults to now(). */
const stamped = (world) => {
  for (const a of world.platform_acts) a.at ??= new Date().toISOString();
};

/** The service role's world for Support: a question and a bug, an ask, who sent them, and the workspaces. */
function supportWorld() {
  return service({
    support_reports: [
      reportRow(),
      reportRow({ id: R2, number: 1045, kind: "wrong", error_id: "e4c1", words: "The calendar is blank" }),
    ],
    events: [
      {
        id: E1,
        tenant_id: T2,
        kind: "setup.requested",
        data: { what: "line", by: OTHER },
        // Five calendar days hold at least three business days, so the ask is past its promise whatever weekday the
        // suite runs on; two days were not on a Sunday or a Monday, when the weekend sits between (supportDueAt).
        created_at: ago(5 * DAY_MS),
      },
    ],
    tenants: [
      { id: A, slug: "harbor-moving", name: "Harbor Moving" },
      { id: T2, slug: "atlas-plumbing", name: "Atlas Plumbing" },
    ],
    memberships: [{ user_id: OTHER, tenant_id: A, role: "owner", created_at: ago(20 * DAY_MS) }],
    profiles: [{ user_id: OTHER, display_name: "Dana Kim" }],
    platform_claims: [],
    lines: [],
  });
}
const overview = () => ({
  platform_overview: () => [
    overviewRow(A, "harbor-moving", "Harbor Moving"),
    overviewRow(T2, "atlas-plumbing", "Atlas Plumbing"),
  ],
});

test("Support's queue is the questions and asks, never a bug; each comes back as its own record, who sent it beside it", async () => {
  supportWorld();
  const out = await support.GET.run(get("?view=needs"), ctxFor("support", { rpcs: overview() }));
  assert.deepEqual(
    out.book.reports.map((r) => [r.id, r.kind]),
    [[R1, "how_to"]],
    "the bug report is Health's",
  );
  assert.deepEqual([out.book.reports[0].who?.name, out.book.reports[0].who?.role], ["Dana Kim", "owner"]);
  assert.deepEqual(
    out.book.asks.map((a) => [a.id, a.what, a.slug]),
    [[E1, "line", "atlas-plumbing"]],
  );
  assert.deepEqual(out.counts.views, { needs: 2, waiting: 0, done: 0 });
  assert.equal(out.counts.late, 1, "the ask of five days is past its day");
  assert.equal(out.to_health, 1, "and Support says one bug went to Health this week");
  assert.equal(out.more, false);
  assert.equal(out.inbox, null, "no inbox address here: the page copies the code instead");
  const listed = await bugs.GET.run(get(), ctxFor("billing", { rpcs: overview() }));
  assert.deepEqual(
    listed.reports.map((r) => r.id),
    [R2],
    "Health lists the bug, to every role",
  );
});

test("marking a row is one press, written down with its own code as the reason, and the queue reads it", async () => {
  const world = supportWorld();
  await refused(
    mark.POST.run(post({ target: "report", id: R1, mark: "answered" }), ctxFor("billing")),
    "forbidden",
    403,
  );
  assert.equal(world.platform_acts.length, 0, "Billing is refused before anything is written");
  await mark.POST.run(post({ target: "report", id: R1, mark: "answered" }), ctxFor("support"));
  const [row] = world.platform_acts;
  assert.deepEqual(
    [row.act, row.target_kind, row.target_id, row.tenant_id, row.reason_kind, row.ticket, row.outcome],
    ["report_answered", "report", R1, A, "ticket", "R-1044", "done"],
  );
  stamped(world);
  const done = await support.GET.run(get("?view=done"), ctxFor("support", { rpcs: overview() }));
  assert.deepEqual(done.counts.views, { needs: 1, waiting: 0, done: 1 });
  await mark.POST.run(post({ target: "ask", id: E1, mark: "answered" }), ctxFor("owner"));
  const asked = world.platform_acts[1];
  assert.deepEqual([asked.act, asked.ticket, asked.tenant_id], ["ask_answered", "A-3f9c2a", T2]);
  stamped(world);
  const waiting = await support.GET.run(get("?view=waiting"), ctxFor("support", { rpcs: overview() }));
  assert.deepEqual(waiting.counts.views, { needs: 0, waiting: 1, done: 1 }, "an ask answered waits on the workspace");
  await refused(mark.POST.run(post({ target: "report", id: R1, mark: "done" }), ctxFor("support")), "validation", 400);
  await refused(
    mark.POST.run(
      post({ target: "report", id: "44444444-4444-4444-8444-444444444444", mark: "answered" }),
      ctxFor("support"),
    ),
    "not_found",
    404,
  );
});

test("a report is moved to Health and back as the member's need, and sent again only where this deployment mails", async () => {
  const world = supportWorld();
  await move.POST.run(post({ id: R1, kind: "wrong" }), ctxFor("support"));
  assert.equal(world.support_reports.find((r) => r.id === R1).kind, "wrong");
  const [moved] = world.platform_acts;
  assert.deepEqual(
    [moved.act, moved.ticket, moved.note, moved.outcome],
    ["report_moved", "R-1044", "To Health", "done"],
  );
  await move.POST.run(post({ id: R1, kind: "how_to" }), ctxFor("owner"));
  assert.equal(world.support_reports.find((r) => r.id === R1).kind, "how_to");
  await refused(resend.POST.run(post({ id: R1 }), ctxFor("support")), "conflict", 409, "sends no mail");
  const tried = world.platform_acts.at(-1);
  assert.deepEqual([tried.act, tried.outcome], ["report_resent", "refused"], "the press is written down, refused");
});

/* -------------------------------------------------------------------------------------------- Health (decision 0068) */

/** What platform_health_parts answers: every list, quiet but for what a case says. */
const quietParts = (over = {}) => ({
  days: 30,
  ...Object.fromEntries(
    [
      "sends",
      "send_errors",
      "calls",
      "webhooks",
      "billing",
      "model",
      "model_by_workspace",
      "model_failures",
      "deliveries",
      "delivery_failures",
      "ask",
      "ask_traced",
      "ask_tools",
      "ask_by_workspace",
      "ask_failures",
      "ask_threads",
      "lines",
      "channels",
      "google",
      "mailboxes",
    ].map((k) => [k, []]),
  ),
  ...over,
});

test("Health is one read for staff alone: every part read on its own, the clocks beside their judgement, a part of the wrong shape said as unread", async () => {
  await refused(health.GET.run(get(), ctxFor("none")), "not_found", 404, "No such page.");
  const asked = [];
  const rpc = (name, answer) => ({ [name]: (args) => (asked.push([name, args]), answer) });
  const world = {
    tenants: [
      { id: A, slug: "harbor", name: "Harbor", status: "active", ours: false, created_at: "2026-01-01T00:00:00Z" },
      {
        id: P1,
        slug: "nightly",
        name: "The nightly suite",
        status: "active",
        ours: true,
        created_at: "2026-01-02T00:00:00Z",
      },
    ],
    jobs: [
      {
        id: L1,
        tenant_id: A,
        kind: "booking_read",
        lane: 1,
        attempts: 3,
        last_error: "resend answered 422",
        state: "failed",
        created_at: new Date(Date.now() - 3_600_000).toISOString(),
        updated_at: new Date(Date.now() - 1_800_000).toISOString(),
      },
    ],
    operator_pages: [
      {
        key: "numbers_past_target",
        first_at: "2026-10-13T00:43:00Z",
        last_at: "2026-10-21T00:43:00Z",
        count: 9,
        alerted_at: null,
      },
    ],
    client_errors: [],
  };
  const clock = {
    sweep: "health",
    jobname: "sweep-health",
    schedule: "13,43 * * * *",
    judged_by: "request",
    max_silence: "00:35:00",
    last_run: null,
    runs: 336,
    failed: 0,
    last_failure: null,
  };
  setServiceClient(
    fakeDb(
      world,
      {},
      {
        ...rpc("platform_clocks", [clock]),
        ...rpc("sweep_health", [
          {
            sweep: "health",
            healthy: true,
            detail: null,
            last_request_at: "2026-10-21T11:43:00Z",
            alerted_at: null,
            scheduled: true,
            status_code: 200,
          },
        ]),
        ...rpc("jobs_backlog", 0),
        ...rpc(
          "platform_health_parts",
          quietParts({
            calls: [{ ours: false, status: "ended", reason: "user_hangup", n: 4, last_at: "2026-10-21T10:00:00Z" }],
          }),
        ),
        ...rpc("platform_metrics_read", []),
      },
    ),
  );
  const h = await health.GET.run(get("?days=7"), ctxFor("support"));
  assert.equal(h.days, 7);
  assert.deepEqual(
    asked
      .filter(([n]) => n !== "sweep_health" && n !== "jobs_backlog")
      .map(([n, args]) => [n, args.p_days])
      .sort(),
    [
      ["platform_clocks", 7],
      ["platform_metrics_read", 7],
      ["platform_health_parts", 7],
    ].sort(),
    "the window is asked of every read that takes one",
  );
  assert.deepEqual(h.workspaces, [
    { id: A, slug: "harbor", name: "Harbor", ours: false },
    { id: P1, slug: "nightly", name: "The nightly suite", ours: true },
  ]);
  assert.deepEqual(
    h.clocks.map((c) => [c.sweep, c.runs, c.healthy, c.last_request_at]),
    [["health", 336, true, "2026-10-21T11:43:00Z"]],
  );
  assert.equal(h.backlog, 0);
  assert.deepEqual(
    h.failed_jobs.map((j) => [j.id, j.kind, j.attempts]),
    [[L1, "booking_read", 3]],
  );
  assert.deepEqual(
    h.pages.map((p) => [p.key, p.count]),
    [["numbers_past_target", 9]],
  );
  assert.equal(h.parts.calls[0].n, 4);
  assert.deepEqual(h.client_errors, []);

  // A parts answer missing its lists is not drawn as a quiet platform: it is unread, and the rest still answer.
  const quiet = console.error;
  console.error = () => {};
  try {
    setServiceClient(
      fakeDb(
        world,
        {},
        {
          platform_clocks: () => {
            throw new Error("cron is gone");
          },
          sweep_health: () => [],
          jobs_backlog: () => 2,
          platform_health_parts: () => ({ days: 30, sends: [] }),
          platform_metrics_read: () => [],
        },
      ),
    );
    const broken = await health.GET.run(get(), ctxFor("owner"));
    assert.equal(broken.days, 30, "a month by default");
    assert.equal(broken.parts, null);
    assert.equal(broken.clocks, null);
    assert.equal(broken.backlog, 2);
    assert.equal(broken.failed_jobs.length, 1);
  } finally {
    console.error = quiet;
  }
});

test("Deliver again is an act: Billing is refused before anything runs; Support's is written down first, then every failed delivery of the subscriber is scheduled once", async () => {
  const empty = service();
  await refused(
    redrive.POST.run(post({ subscriber: "consent_notice", why: WHY }), ctxFor("billing")),
    "forbidden",
    403,
    "Billing cannot do that",
  );
  assert.deepEqual(empty.platform_acts, []);

  const asked = [];
  const world = { platform_acts: [] };
  setServiceClient(fakeDb(world, {}, { event_deliveries_redrive: (args) => (asked.push(args), 13) }));
  assert.deepEqual(await redrive.POST.run(post({ subscriber: "consent_notice", why: WHY }), ctxFor("support")), {
    subscriber: "consent_notice",
    scheduled: 13,
  });
  assert.deepEqual(asked, [{ p_subscriber: "consent_notice" }]);
  const [row] = world.platform_acts;
  assert.deepEqual(
    [row.act, row.tenant_id, row.target_kind, row.target_id, row.ticket, row.outcome, row.outcome_note],
    ["delivery_redrive", null, "platform", "consent_notice", "R-1042", "done", "13 scheduled again."],
  );
  await refused(redrive.POST.run(post({ subscriber: "Not a subscriber", why: WHY }), ctxFor("support")), "validation");
});
