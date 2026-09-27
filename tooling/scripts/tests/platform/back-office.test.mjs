/**
 * The back office — the one surface that deliberately crosses tenant
 * boundaries.
 *
 * WHY IT EXISTS. `public.platform_admins` was created in migration 00001 and
 * nothing had ever read it. Meanwhile every support question — "why isn't my
 * receptionist answering?" — was answered by writing SQL by hand, once,
 * unrepeatably, by the one person who knows the schema.
 *
 * WHAT THESE PIN. Two different things, and the second is the one that would
 * hurt:
 *
 *   THE JUDGEMENT — ten verdicts over real fact combinations, because a list of
 *   states is not an answer and getting the ranking wrong means the workspace
 *   that needs a person is on page two.
 *
 *   THE BOUNDARY — that there is exactly one door to cross-tenant data and
 *   everything goes through it. This is the only place in the product where
 *   reading somebody else's customers is a feature rather than a breach, so
 *   "which code path could skip the check" has to be answerable by looking, and
 *   a test is what keeps it answerable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  platformRows,
  platformSummary,
  platformNumber,
  textingWords,
  PLATFORM_VERDICTS,
  PLATFORM_QUIET_DAYS,
  PLATFORM_NEW_DAYS,
  setupSteps,
  platformLineActions,
  platformActionWarning,
  EVENT_KINDS,
  platformHealthOf,
  platformHealthWords,
  platformQueue,
  QUEUE_SENDS_NOTHING,
  activityWords,
  clockTime,
  clockDateYear,
  clockDayLabel,
  zoneDayKey,
  platformPartnerRows,
  platformPartnerSummary,
  platformPartnerStanding,
} from "@chanlytics/contracts";

const clock = (sweep, healthy, detail = null) => ({
  sweep,
  healthy,
  detail,
  last_request_at: null,
  status_code: null,
  scheduled: true,
  alerted_at: null,
});

test("the platform's own health: every clock running AND nothing waiting, or it is not healthy", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");
  const all = [clock("calendar", true), clock("lines", true)];

  const well = platformHealthOf(all, 0, now);
  assert.equal(well.ok, true);
  assert.deepEqual(well.unhealthy, []);
  assert.equal(well.checkedAt, now.toISOString());
  assert.equal(platformHealthWords(well), "Every clock is running and nothing is waiting.");

  // A clock that stopped, with the reason the function gave.
  const stopped = platformHealthOf(
    [clock("calendar", false, "no successful run in 3 hours"), clock("lines", true)],
    0,
    now,
  );
  assert.equal(stopped.ok, false);
  assert.deepEqual(stopped.unhealthy, [{ sweep: "calendar", detail: "no successful run in 3 hours" }]);
  assert.match(platformHealthWords(stopped), /1 clock not running/);

  // Work piling up while every clock says it is fine is still not healthy:
  // the heartbeat running and the heartbeat DRAINING are different facts.
  const piling = platformHealthOf(all, 40, now);
  assert.equal(piling.ok, false);
  assert.equal(platformHealthWords(piling), "40 jobs late");
  assert.equal(platformHealthWords(platformHealthOf(all, 1, now)), "1 job late");

  // Both at once reads as both.
  assert.match(
    platformHealthWords(platformHealthOf([clock("calendar", false)], 5, now)),
    /1 clock not running · 5 jobs late/,
  );
});

test("a backlog that could not be READ is never mistaken for a backlog of zero", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");
  // The two answers a health check must never confuse. Null keeps the verdict
  // false, and the words say the read failed rather than claiming all clear.
  const unknown = platformHealthOf([clock("calendar", true)], null, now);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.backlog, null);
  assert.equal(platformHealthWords(unknown), "The platform's health could not be read just now.");
  // And no rows at all is not "healthy": it is the same unknown.
  assert.equal(platformHealthOf(null, null, now).ok, false);
  assert.equal(platformHealthOf([], 0, now).ok, true, "but no rows with a real zero backlog is genuinely quiet");
});
import { readCode, readRaw } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { setupDtoFor } from "../../../../apps/dashboard/src/server/workspace/setup.ts";
import { platformWaitlist, platformWaitlistInvited } from "../../../../apps/dashboard/src/server/platform/platform.ts";

const NOW = Date.parse("2026-09-09T18:00:00Z");
const DAY = 86_400_000;
const ago = (d) => new Date(NOW - d * DAY).toISOString();

/** A workspace that is entirely fine, so every case below differs by one fact. */
const live = (over = {}) => ({
  tenant_id: "11111111-1111-1111-1111-111111111111",
  slug: "harbor-moving",
  name: "Harbor Moving",
  status: "active",
  timezone: "America/New_York",
  created_at: ago(90),
  members: 2,
  billing_mode: "stripe",
  billing_status: "active",
  trial_end: null,
  current_period_end: ago(-20),
  line_e164: "+19296566623",
  line_kind: "chanlytics",
  voice_state: "answering",
  sms_state: "active",
  reg_step: null,
  reg_mock: false,
  reg_sole_prop: false,
  line_error: null,
  whatsapp_number: "+13055550188",
  whatsapp_active: true,
  voice_number: "+19296566623",
  voice_active: true,
  last_inbound_at: ago(1),
  ...over,
});
const only = (over) => platformRows([live(over)], NOW)[0];

/** A workspace's Setup facts, as /api/v1/setup assembles them. Enough for setupSteps to draw a real page. */
const SETUP_FIXTURE = {
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 3,
    bookingLink: true,
    address: true,
    handoff: "+16465550123",
    broken: false,
  },
  conflicts: [],
  channels: {
    whatsapp: { present: true, active: true, number: "+13055550188", quality: "GREEN", lastInboundAt: ago(1) },
    voice: { present: true, active: true, number: "+19296566623", lastInboundAt: ago(2) },
  },
  templates: { approved: 5, pending: 0, startersApproved: 5 },
  calendar: { state: "ok" },
  team: { members: 2, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 12 },
  requests: { line: null },
  lines: {
    rows: [
      {
        id: "l1",
        e164: "+19296566623",
        kind: "chanlytics",
        provider: "twilio",
        area_code: 929,
        voice_state: "answering",
        sms_state: "rejected",
        reg_step: "brand",
        reg_mock: false,
        reg_sole_prop: false,
        whatsapp_state: "none",
        port_state: "none",
        forwarding_state: "none",
        step: null,
        last_error: "the carriers refused it",
        state_since: ago(3),
        created_at: ago(80),
      },
    ],
    ready: true,
    provider: "twilio",
    costs: { local_number_month_usd: 1.15 },
  },
  google: { ready: true, places: true, listing: null, connected: false },
  billing: {
    ready: true,
    mode: "stripe",
    status: "active",
    trial_end: null,
    current_period_end: ago(-20),
    trial_days: 14,
    cancel_at: null,
    cancel_at_period_end: false,
  },
};

test("a workspace that is fine says so, and says it last", () => {
  const r = only({});
  assert.equal(r.verdict, "live");
  assert.match(r.sentence, /Answering; last heard from 1d ago/);
  // Live is near the bottom of the page on purpose: the whole value of this
  // surface is that the workspaces needing a person are at the top.
  assert.ok(PLATFORM_VERDICTS.live.rank < PLATFORM_VERDICTS.broken.rank);
  assert.ok(PLATFORM_VERDICTS.live.rank < PLATFORM_VERDICTS.quiet.rank);
  assert.equal(PLATFORM_VERDICTS.live.tone, "ok");
});

test("a failed line is ours, and it carries the provider's own words", () => {
  const r = only({ voice_state: "failed", line_error: "Twilio refused the number: 21422", reg_step: null });
  assert.equal(r.verdict, "broken");
  assert.match(r.sentence, /Twilio refused the number: 21422/, "the error a person can act on, not a category");
  // A registration that stopped says WHERE, because that is what decides
  // whether it can be resumed or has to be refiled.
  const s = only({ sms_state: "failed", line_error: "the carriers suspended the brand", reg_step: "brand" });
  assert.equal(s.verdict, "broken");
  assert.match(s.sentence, /stopped at brand/);
  // Silence is its own fact: an unexplained stop must not read as nothing wrong.
  assert.match(only({ voice_state: "failed", line_error: null }).sentence, /stopped and said nothing/);
});

test("money is a verdict only where it can stop the receptionist", () => {
  // past_due still answers -- Stripe has not given up yet -- and that is
  // exactly why it needs a person BEFORE it becomes unpaid.
  const due = only({ billing_status: "past_due" });
  assert.equal(due.verdict, "billing");
  assert.match(due.sentence, /still answers, and will not/);
  for (const status of ["unpaid", "canceled", "paused", "incomplete_expired"]) {
    assert.equal(only({ billing_status: status }).verdict, "billing", status);
  }
  // A workspace that has never entered a card is still answering and is not a
  // billing emergency: it is somebody who has not finished, which is a
  // different conversation and a different verdict.
  assert.equal(only({ billing_status: "none" }).verdict, "waiting_owner");
  // Invoiced by hand: Stripe's words do not apply at all.
  assert.equal(only({ billing_mode: "direct", billing_status: "none" }).verdict, "live");
  assert.equal(only({ billing_mode: "direct" }).facts.paying, "Invoiced");
  assert.equal(only({ billing_mode: null, billing_status: null }).facts.paying, "No arrangement");
});

test("a rehearsal filing outranks everything that merely looks unfinished", () => {
  // The state most likely to be mistaken for working: the console shows the
  // brand approved, our row says approved, and not one message is delivered.
  const r = only({ reg_mock: true, sms_state: "approved" });
  assert.equal(r.verdict, "rehearsal");
  assert.match(r.sentence, /test registry/);
  assert.match(r.sentence, /expires thirty days/);
  assert.equal(only({ reg_mock: true, sms_state: "approved" }).facts.texting, "Rehearsal");
  assert.ok(PLATFORM_VERDICTS.rehearsal.rank > PLATFORM_VERDICTS.waiting_owner.rank);
  assert.ok(PLATFORM_VERDICTS.rehearsal.rank > PLATFORM_VERDICTS.stalled.rank);
});

test("nothing answering is 'new' for a day and 'stalled' after", () => {
  const off = { voice_active: false, whatsapp_active: false, voice_state: "none", sms_state: "none", line_e164: null };
  assert.equal(only({ ...off, created_at: ago(0.5) }).verdict, "new");
  const stalled = only({ ...off, created_at: ago(9), members: 1 });
  assert.equal(stalled.verdict, "stalled");
  assert.match(stalled.sentence, /nothing answers yet/);
  assert.match(
    stalled.sentence,
    /one person in the workspace/,
    "a workspace of one that never started is a different call",
  );
  assert.equal(PLATFORM_NEW_DAYS, 1);
  // Getting a number is not stalled: it is us, in progress.
  assert.equal(only({ ...off, voice_state: "provisioning", created_at: ago(9) }).facts.answering, "Getting a number");
});

test("the states whose next move is the owner's say the words the owner is being shown", () => {
  for (const sms_state of ["needs_record", "otp_waiting", "rejected"]) {
    const r = only({ sms_state, line_error: null });
    assert.equal(r.verdict, "waiting_owner", sms_state);
    // THE point of the whole surface: not a paraphrase. The literal sentence
    // on the customer's own texting row, so support and customer cannot end up
    // describing the same state differently on the same call.
    assert.equal(r.sentence, textingWords({ sms_state, reg_mock: false, reg_sole_prop: false }).sentence, sms_state);
  }
  // Plus the carriers' reason where there is one. Setup leaves it out -- the
  // owner has it on their own row -- but the reason IS the support question, and
  // the live Chanlytics campaign came back with two of them.
  const refused = only({
    sms_state: "rejected",
    line_error: "invalid campaign description (30886 · USE_CASE_DESCRIPTION)",
  });
  assert.match(refused.sentence, /refused the texting registration\. — invalid campaign description \(30886/);
});

test("quiet means answering with nobody reaching them, and says for how long", () => {
  const r = only({ last_inbound_at: ago(30) });
  assert.equal(r.verdict, "quiet");
  assert.match(r.sentence, /no customer has reached them in 30 days/);
  assert.equal(only({ last_inbound_at: ago(PLATFORM_QUIET_DAYS - 1) }).verdict, "live", "a fortnight is the line");
  // Never heard from at all, and old enough for that to mean something.
  const never = only({ last_inbound_at: null, created_at: ago(60) });
  assert.equal(never.verdict, "quiet");
  assert.match(never.sentence, /no customer has ever reached them/);
  assert.equal(never.facts.heard, "Never");
  // Never heard from and three days old is just new.
  assert.equal(only({ last_inbound_at: null, created_at: ago(3) }).verdict, "new");
});

test("a paused workspace and a test workspace are not problems to solve", () => {
  assert.equal(only({ status: "paused" }).verdict, "paused");
  assert.match(only({ status: "paused" }).sentence, /by design/);
  // And a test tenant is not a customer at all -- it must not inflate a count
  // or sit in the middle of a support queue.
  const t = only({ status: "test", voice_active: false, whatsapp_active: false, created_at: ago(200) });
  assert.equal(t.verdict, "test");
  assert.equal(PLATFORM_VERDICTS.test.rank, 0);
});

test("the page sorts itself: needs-a-person first, then by name", () => {
  const rows = platformRows(
    [
      live({ tenant_id: "a", name: "All Good" }),
      live({ tenant_id: "b", name: "Broken Co", voice_state: "failed", line_error: "boom" }),
      live({ tenant_id: "c", name: "Zed Quiet", last_inbound_at: ago(40) }),
      live({ tenant_id: "d", name: "Smoke", status: "test" }),
      live({ tenant_id: "e", name: "Card Failed", billing_status: "past_due" }),
      live({ tenant_id: "f", name: "Also Quiet", last_inbound_at: ago(40) }),
    ],
    NOW,
  );
  assert.deepEqual(
    rows.map((r) => r.name),
    ["Broken Co", "Card Failed", "Also Quiet", "Zed Quiet", "All Good", "Smoke"],
  );
  // Two workspaces in the same verdict are ordered by name, so the page does
  // not reshuffle under somebody reading it.
  assert.deepEqual(
    rows.filter((r) => r.verdict === "quiet").map((r) => r.name),
    ["Also Quiet", "Zed Quiet"],
  );
});

test("the one line at the top counts customers, not test workspaces", () => {
  const rows = platformRows(
    [
      live({ tenant_id: "a", name: "A" }),
      live({ tenant_id: "b", name: "B", voice_state: "failed" }),
      live({ tenant_id: "c", name: "C", reg_mock: true }),
      live({ tenant_id: "d", name: "D", billing_status: "unpaid" }),
      live({ tenant_id: "e", name: "E", status: "test" }),
    ],
    NOW,
  );
  const s = platformSummary(rows);
  assert.equal(s.total, 4, "the test workspace is not a customer");
  assert.equal(s.live, 1);
  assert.equal(s.needsUs, 2, "broken and rehearsal are ours");
  assert.equal(s.needsThem, 1);
  assert.match(s.sentence, /4 workspaces · 1 live · 2 on us · 1 on them/);
  // Nothing wrong anywhere: the line says so without inventing zeroes.
  const calm = platformSummary(platformRows([live({ tenant_id: "a" })], NOW));
  assert.equal(calm.sentence, "1 workspace · 1 live");
});

test("the four facts are words, so the page renders and never decides", () => {
  const r = only({});
  assert.equal(r.facts.answering, "phone + WhatsApp");
  assert.equal(only({ whatsapp_active: false }).facts.answering, "phone");
  assert.equal(only({ voice_active: false, whatsapp_active: false }).facts.answering, "Nothing yet");
  assert.equal(r.facts.texting, "On");
  assert.equal(
    only({ reg_sole_prop: true }).facts.texting,
    "On (sole proprietor)",
    "the capped registration is named where support can see it",
  );
  assert.equal(only({ line_e164: null, sms_state: "none" }).facts.texting, "No line");
  assert.equal(only({ sms_state: "needs_record" }).facts.texting, "needs record", "a state, in words, never the enum");
  assert.equal(
    only({ billing_status: "trialing", trial_end: "2026-09-30T00:00:00Z" }).facts.paying,
    "Trial to 2026-09-30",
  );
  // Numbers are read aloud on support calls, so they are grouped, and a
  // workspace with no number renders a dash rather than "null".
  assert.equal(platformNumber("+19296566623"), "+1 (929) 656-6623");
  assert.equal(platformNumber(null), "—");
});

test("a bad timestamp never becomes a wrong answer", () => {
  // The RPC returns what the columns hold, and a column can hold anything a
  // migration once allowed. A row that cannot be dated must not read as fresh.
  const r = only({ last_inbound_at: "not a date", created_at: "also not a date" });
  assert.equal(r.facts.heard, "Never");
  assert.ok(r.verdict === "new" || r.verdict === "quiet", `got ${r.verdict}`);
});

/* ------------------------------- the boundary ------------------------------ */

test("one door: the check is the first statement, and the inner join is not reachable", () => {
  const one = readRaw("supabase/migrations/00091_the_back_office.sql");
  const two = readRaw("supabase/migrations/00092_validate_the_back_office_query_at_deploy.sql");
  const three = readRaw("supabase/migrations/00093_the_inner_join_is_not_a_door.sql");

  // The predicate a session may ask about itself, and only itself.
  assert.match(one, /create or replace function public\.is_platform_admin\(\)/);
  assert.match(one, /a\.user_id = auth\.uid\(\)/);
  assert.match(one, /grant\s+execute on function public\.is_platform_admin\(\) to authenticated/);

  // The guard, and its position. `raise` before `return query` is the whole
  // authorization model; a route that forgot would get 42501 from Postgres.
  const door = two.slice(two.lastIndexOf("create or replace function public.platform_overview()"));
  assert.ok(
    door.indexOf("if not public.is_platform_admin() then") < door.indexOf("return query"),
    "the check precedes the read",
  );
  assert.match(door, /raise exception 'Not a Chanlytics platform admin\.' using errcode = '42501'/);
  assert.match(door, /grant\s+execute on function public\.platform_overview\(\) to authenticated/);

  // The join lives in a SQL-language function so the columns are checked when
  // the migration applies -- plpgsql bodies are not parsed until first call,
  // and the first call is somebody in support opening the page.
  assert.match(two, /create or replace function public\.platform_overview_rows\(\)[\s\S]*?language sql/);

  // And it is not a second door. 00092 revoked three roles and missed
  // service_role, which answered 200 with every workspace in it.
  assert.match(three, /revoke execute on function public\.platform_overview_rows\(\) from public;/);
  assert.match(three, /from pg_roles/, "the revoke asks Postgres which roles exist rather than trusting a list");
  assert.match(
    three,
    /raise exception '00093: platform_overview_rows\(\) is still granted to/,
    "a grant that comes back fails the deploy",
  );
});

test("every route under /api/v1/platform asks the database who is calling", () => {
  // The invariant the PRD's Risk section asks for, made mechanical: "every path
  // to it goes through the RPC's own check, so there is one thing to review
  // rather than one per route." A route added tomorrow without the guard fails
  // here rather than in production.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.join(here, "../../../../apps/dashboard/app/api/v1/platform");
  const routes = [];
  const walk = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "route.ts") routes.push(full);
    }
  };
  walk(dir);
  assert.ok(routes.length >= 2, `found ${routes.length} platform routes`);
  for (const file of routes) {
    const src = fs.readFileSync(file, "utf8");
    // Obtaining the handle IS the check: `backOffice(ctx)` throws unless the
    // database says yes, and nothing cross-tenant can be read without one. A
    // route that forgot would not compile rather than not being caught here.
    assert.ok(src.includes("scope: platform,"), `${path.basename(path.dirname(file))}: no admin check`);
    const guard = src.indexOf("scope: platform,");
    // DERIVED, not listed. This was a hardcoded array of four READS, so
    // `platformLineAct(` -- the only WRITE on this surface, and the one that
    // touches another business's carrier registration and phone number -- was not
    // in it. A write added tomorrow with its guard below the call would have
    // passed, which is the opposite of what this test's own header promises.
    // Every helper the route imports from the platform module has to come after
    // the handle it needs.
    const imported = /import\s*\{([^}]+)\}\s*from\s*"@\/server\/platform\/platform"/.exec(src);
    assert.ok(imported, `${path.basename(path.dirname(file))}: nothing imported from @/server/platform/platform`);
    const helpers = imported[1]
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x && x !== "backOffice");
    assert.ok(helpers.length > 0, `${path.basename(path.dirname(file))}: only the guard is imported`);
    for (const fn of helpers) {
      const i = src.indexOf(`${fn}(`, guard === -1 ? 0 : 0);
      if (i !== -1) assert.ok(guard < i, `${path.basename(path.dirname(file))}: ${fn}() runs before the check`);
    }
    // No workspace scoping: this surface is about workspaces the caller is not
    // in, so memberContext would be a category error rather than a safeguard.
    assert.ok(
      !src.includes("memberContext("),
      `${path.basename(path.dirname(file))}: platform routes are not workspace-scoped`,
    );
  }
});

test("the guard asks the database, and answers 404 rather than 403", () => {
  const src = readCode("apps/dashboard/src/server/platform/platform.ts");
  assert.match(src, /ctx\.supabase\.rpc\("is_platform_admin"\)/, "the answer comes from Postgres, not from an env var");
  assert.ok(
    !/process\.env\.[A-Z_]*ADMIN|PLATFORM_ADMIN|ALLOWLIST/.test(src),
    "no second answer that can disagree with the first",
  );
  // A customer who guesses the URL learns nothing about whether there is a
  // back office behind it.
  assert.match(src, /AppError\("not_found", "No such page\.", 404\)/);
  assert.ok(!/AppError\("forbidden"/.test(src), "403 would confirm the surface exists");
  // The list read runs on the SESSION client on purpose: the RPC's check is
  // auth.uid(), so the service-role key opens nothing.
  assert.match(src, /office\.session\.rpc\("platform_overview"\)/);
  // Nothing anywhere calls the inner join by name.
  assert.ok(!/platform_overview_rows/.test(src));
});

test("support sees the customer's own Setup, from the customer's own function", () => {
  // The claim this surface makes is that support and the customer are looking
  // at the same rows. That is only true while it is literally one function, so
  // the assembly was lifted out of the route rather than copied.
  const assembly = readCode("apps/dashboard/src/server/workspace/setup.ts");
  assert.match(assembly, /export async function setupDtoFor\(/);
  assert.match(
    assembly,
    /supabase: SupabaseClient<Database>/,
    "the client is an argument, so either caller may pass its own",
  );

  // The customer's route reads through its reader (readers/connections.ts), which is where the call now is; the
  // route and the reader are held to the one assembly alike. readers.test.mjs runs the route: setupDtoFor's own reads.
  const [own, route] = [
    "apps/dashboard/src/server/readers/connections.ts",
    "apps/dashboard/app/api/v1/setup/route.ts",
  ].map((file) => readCode(file));
  assert.match(
    own,
    /setupDtoFor\(rc\.ctx\.supabase, rc\.tenantId, \{ kind: "member" \}, rc\.now\)/,
    "the customer reads their own on the session client",
  );
  for (const src of [own, route])
    assert.ok(
      !src.includes("getTenantConfig"),
      "REGRESSION: the assembly is back inside the route, where a second copy can grow",
    );

  const office = readCode("apps/dashboard/app/api/v1/platform/tenants/[id]/route.ts");
  assert.match(
    office,
    /setupDtoFor\(office\.db, id, \{ kind: "back_office" \}\)/,
    "and support reads theirs through the same function",
  );
  // The viewer is a TYPE, not a role string. "owner" was a lie the type system
  // could not catch, and it 500'd every detail read on team_roster.
  assert.ok(!/setupDtoFor\([^)]*"owner"/.test(office), "REGRESSION: the back office claiming to be an owner");
  assert.match(office, /platformEvents\(office, id\)/, "with the trail emitEvent has been writing all along");
  assert.ok(!office.includes('supabase.from("tenant_config")'), "no second assembly");
});

test("the nav's one bit rides on the payload the seam already fetches", () => {
  const route = readCode("apps/dashboard/app/api/v1/workspaces/route.ts");
  assert.match(route, /const platformAdmin = await isPlatformAdmin\(ctx\);/);
  assert.match(route, /platform_admin: platformAdmin/);
  // Both exits carry it: the one with workspaces and the one for somebody who
  // has none yet. A missing field reads as false and hides the tab from an
  // admin whose only workspace was removed.
  assert.equal((route.match(/platform_admin: platformAdmin/g) ?? []).length, 2);
  const bridge = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.match(bridge, /platform_admin\?: boolean;/);
  // It is not the authorization, and the comment says so where somebody would
  // otherwise be tempted to trust it.
  assert.match(readRaw("apps/dashboard/app/api/v1/workspaces/route.ts"), /NOT the authorization/);
});

/* ----------------------------- the boundary, executed ---------------------- *
 * Everything above this line is a pure function over a fixture, a regex over
 * SQL text, or a page with the fetch stubbed. All of it passed while the detail
 * route 500'd on every workspace, because none of it ever ran the server path.
 *
 * `fakeDb` throws on any RPC it has not been told about, which is exactly the
 * property this needs: the cross-tenant path has no session, so `auth.uid()` is
 * null, so it may not call a SECURITY DEFINER function that asks who is signed
 * in. Naming the RPCs it is allowed to use makes that a decision rather than an
 * accident.
 * -------------------------------------------------------------------------- */

const TENANT = "6a4405d1-1e68-4fcd-bc55-eef0df8e689a";

/** Enough of a workspace for the Setup assembly to have real work to do. */
const workspaceTables = () => ({
  tenant_config: [{ tenant_id: TENANT, config: { brain: { business_name: "Harbor Moving" } } }],
  tenant_channels: [{ tenant_id: TENANT, kind: "voice", status: "active", number_e164: "+19296566623", config: {} }],
  messages: [{ tenant_id: TENANT, direction: "inbound", channel: "whatsapp", channel_ts: ago(1), created_at: ago(1) }],
  calls: [{ tenant_id: TENANT, direction: "inbound", started_at: ago(2) }],
  templates: [{ tenant_id: TENANT, name: "visit_reminder", meta_status: "approved", hidden_at: null }],
  memberships: [
    { id: "m1", tenant_id: TENANT },
    { id: "m2", tenant_id: TENANT },
  ],
  invitations: [
    {
      id: "i1",
      tenant_id: TENANT,
      email: "new@example.com",
      role: "operator",
      created_at: ago(1),
      expires_at: ago(-6),
      accepted_at: null,
      revoked_at: null,
    },
  ],
  contacts: [{ id: "c1", tenant_id: TENANT, consent: "opted_in", erased_at: null }],
  notifications: [],
  lines: [
    {
      id: "l1",
      tenant_id: TENANT,
      e164: "+19296566623",
      kind: "chanlytics",
      provider: "twilio",
      area_code: 929,
      voice_state: "answering",
      sms_state: "active",
      reg_step: null,
      reg_mock: false,
      reg_sole_prop: false,
      whatsapp_state: "none",
      port_state: "none",
      forwarding_state: "none",
      step: null,
      last_error: null,
      state_since: ago(3),
      created_at: ago(80),
      facts: {},
    },
  ],
  google_listings: [],
  google_connections: [],
  billing_accounts: [
    {
      tenant_id: TENANT,
      mode: "direct",
      status: "none",
      trial_end: null,
      current_period_end: null,
      cancel_at: null,
      cancel_at_period_end: false,
    },
  ],
});

test("the back office's Setup read touches no function that asks who is signed in", async () => {
  // THE DEFECT. setupDtoFor took a `role: string` and the back office passed
  // "owner", which routed it through teamRoster -> the `team_roster` RPC, whose
  // FIRST statement checks auth.uid() against memberships. On the service client
  // that is null, so Postgres raised 42501, teamRoster rethrew, and every single
  // /api/v1/platform/tenants/:id request 500'd. Verified against production: the
  // RPC answers `{"code":"42501","message":"Not a member of this workspace."}`
  // to the service role.
  //
  // No RPCs are modelled here, so fakeDb throws on any call — which is the
  // assertion.
  const db = fakeDb(workspaceTables());
  const setup = await setupDtoFor(db, TENANT, { kind: "back_office" });
  // The fixture's config does not satisfy the brain schema, and a config the
  // parser refuses is its own fact rather than an error -- so this asserts the
  // assembly ran and reported it, which is what the DTO says it does.
  assert.equal(setup.business.broken, true, "it read and judged the config row");
  assert.equal(setup.team.members, 2, "counted the members without asking for the roster");
  assert.equal(setup.team.invitesOpen, 1, "and the open invitations");
  assert.equal(setup.consent.yes, 1);
  assert.equal(setup.lines.rows.length, 1);
  assert.equal(setup.channels.voice.number, "+19296566623");
});

test("no member's email crosses the tenant boundary, because the roster is never read", async () => {
  // The privacy half of the same fix. SetupDto.team is three integers; the
  // roster it used to build carried every member's email address out of a
  // workspace the reader is not in.
  const db = fakeDb(workspaceTables());
  const setup = await setupDtoFor(db, TENANT, { kind: "back_office" });
  assert.ok(!JSON.stringify(setup).includes("new@example.com"), "the invited address stays in the workspace");
  assert.deepEqual(Object.keys(setup.team).sort(), ["alertEmails", "invitesOpen", "members"]);
});

test("a workspace reading its own Setup still gets the roster, on its own client", async () => {
  // The other half of the union: with a session, team_roster is exactly right —
  // it is the door that lets an owner see who is in their workspace.
  let asked = null;
  const db = fakeDb(
    workspaceTables(),
    {},
    {
      team_roster: (args) => {
        asked = args;
        return [
          {
            membership_id: "m1",
            member_user_id: "u1",
            email: "owner@example.com",
            role: "owner",
            joined_at: ago(90),
            display_name: "Ada",
          },
        ];
      },
    },
  );
  const setup = await setupDtoFor(db, TENANT, { kind: "member" });
  assert.deepEqual(asked, { p_tenant_id: TENANT }, "the member path calls the roster RPC");
  assert.equal(setup.team.members, 1);
  assert.equal(setup.team.invitesOpen, 1);
});

test("a workspace a partner brought names them on its own Setup, and nobody else's read carries the name", async () => {
  const roster = [
    {
      membership_id: "m1",
      member_user_id: "u1",
      email: "owner@example.com",
      role: "owner",
      joined_at: ago(90),
      display_name: "Bea",
    },
    {
      membership_id: "m2",
      member_user_id: "u2",
      email: "ada@example.com",
      role: "partner",
      joined_at: ago(80),
      display_name: null,
    },
  ];
  const mine = await setupDtoFor(fakeDb(workspaceTables(), {}, { team_roster: () => roster }), TENANT, {
    kind: "member",
  });
  assert.equal(mine.team.partner, "ada@example.com", "the address when they have not given a name");
  const theirs = await setupDtoFor(fakeDb(workspaceTables()), TENANT, { kind: "back_office" });
  assert.equal("partner" in theirs.team, false);
});

test("REGRESSION (S14): Setup reads what was asked for per thing, from the events -- a port read as a line, and the edge's line-is-ready bell read as a request", async () => {
  const db = fakeDb({
    ...workspaceTables(),
    notifications: [
      {
        tenant_id: TENANT,
        kind: "number",
        title: "Your phone line is ready",
        body: "x",
        route: "admin/setup",
        subject_type: "setup",
        subject_id: "c1",
        created_at: ago(1),
      },
    ],
    events: [
      {
        tenant_id: TENANT,
        kind: "setup.requested",
        category: "setup",
        data: { what: "port", by: "u1" },
        created_at: "2026-09-07T13:00:00Z",
      },
      {
        tenant_id: TENANT,
        kind: "setup.requested",
        category: "setup",
        data: { what: "port", by: "u1" },
        created_at: "2026-09-06T13:00:00Z",
      },
      {
        tenant_id: TENANT,
        kind: "setup.requested",
        category: "setup",
        data: { what: "repair", by: "u1" },
        created_at: "2026-09-07T14:00:00Z",
      },
      { tenant_id: TENANT, kind: "policy.changed", category: "system", data: {}, created_at: "2026-09-07T15:00:00Z" },
    ],
  });
  const setup = await setupDtoFor(db, TENANT, { kind: "back_office" });
  assert.deepEqual(
    setup.requests,
    { line: null, port: "2026-09-07T13:00:00Z", repair: "2026-09-07T14:00:00Z", forwarding: null },
    "REGRESSION: the newest setup bell of any kind read as a line request",
  );
});

test("the service-role client cannot be obtained without passing the check", () => {
  // The first version exported `platformDb()` — no arguments, no relationship to
  // the guard — and relied on a test walking ONE directory to prove nothing else
  // imported it. A grep cannot see the route that has not been written yet.
  const src = readCode("apps/dashboard/src/server/platform/platform.ts");
  assert.ok(
    !/export function platformDb|export async function platformDb/.test(src),
    "REGRESSION: a service-role client handed to any importer",
  );
  assert.match(
    src,
    /import \{ serviceDb \} from "\.\.\/service-db";/,
    "the dashboard's one service client, kept to this module",
  );
  assert.ok(!/export .*serviceDb/.test(src));
  // The only way to a client is a handle only the check can make, and the brand
  // stops an object literal standing in for one.
  assert.match(src, /declare const backOfficeBrand: unique symbol;/);
  assert.match(src, /export async function backOffice\(ctx: RouteContext\): Promise<BackOffice>/);
  assert.match(src, /if \(!\(await admitted\(ctx\)\)\) throw new AppError\("not_found", "No such page\.", 404\);/);
  // Every cross-tenant read takes the handle rather than reaching for a client.
  for (const [fn, tail] of [
    ["platformOverview", "\\)"],
    ["platformTenant", ","],
    ["platformEvents", ","],
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\(\\s*office: BackOffice\\s*${tail}`), fn);
  }
  // A database that cannot answer is not a "no". Telling a real admin "No such
  // page" during a Postgres hiccup is the moment they opened this for.
  assert.match(src, /if \(error\) throw new AppError\("internal", .*503\);/);
  // And the unbounded event payload does not go to the browser to be discarded.
  assert.match(src, /\.select\("kind, category, subject_type, created_at"\)/);
  assert.ok(!/select\("kind, category, subject_type, created_at, data"\)/.test(src));
});

/* ------------------------------- the ops door ------------------------------ *
 * The write half. Until now every one of these actions was performed by
 * importing the library into a local script and recovering four values from
 * Twilio and the database by hand, because `/api/admin/lines` is gated on
 * DIAG_KEY and Vercel holds that as a SENSITIVE variable -- write-only,
 * unreadable by anybody. Fine once; not an operations model, and refiling a
 * rejected campaign is the most common A2P support action there is.
 * -------------------------------------------------------------------------- */

const line = (over = {}) => ({
  id: "l1",
  e164: "+19296566623",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 929,
  voice_state: "answering",
  sms_state: "active",
  reg_step: null,
  reg_mock: false,
  reg_sole_prop: false,
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: null,
  last_error: null,
  state_since: ago(1),
  created_at: ago(80),
  ...over,
});

test("an action that would be refused is not offered", () => {
  // The edge answers 409 for a retry on a line that is not failed and for a
  // refile on a filing that stands. A button that is going to be refused teaches
  // somebody to ignore buttons.
  const healthy = platformLineActions(line()).map((a) => a.action);
  assert.deepEqual(healthy, ["release"], "a working line can only be given back");

  assert.deepEqual(
    platformLineActions(line({ voice_state: "failed" })).map((a) => a.action),
    ["retry", "release"],
  );
  assert.deepEqual(
    platformLineActions(line({ sms_state: "rejected" })).map((a) => a.action),
    ["refile", "replace", "release"],
  );
  assert.deepEqual(
    platformLineActions(line({ reg_mock: true, sms_state: "approved" })).map((a) => a.action),
    ["refile", "release"],
  );
  // Nothing to give back when there is no number.
  assert.deepEqual(
    platformLineActions(line({ e164: null })).map((a) => a.action),
    [],
  );
});

test("refile is two actions wearing one name, and the difference is money", () => {
  // A REJECTED campaign is corrected in place: Twilio assesses the vetting fee
  // once per campaign, so an edit is free. A REHEARSAL is replaced by a real
  // filing: a new brand and a new campaign, and a brand cannot be withdrawn.
  const [rejected] = platformLineActions(line({ sms_state: "rejected" }));
  assert.equal(rejected.action, "refile");
  assert.equal(rejected.cost, null, "an edit spends nothing");
  assert.equal(rejected.permanent, false);
  assert.match(platformActionWarning(rejected), /Nothing is spent/);
  // And the replacement, for a refusal an edit cannot reach: a new campaign under
  // the same brand, a new vetting fee, said so, and permanent -- the refused one
  // is deleted.
  const replace = platformLineActions(line({ sms_state: "rejected" })).find((a) => a.action === "replace");
  assert.equal(replace.label, "File a new campaign");
  assert.match(replace.cost, /\$15/);
  assert.equal(replace.permanent, true);
  assert.match(replace.sentence, /cannot be edited/);
  assert.ok(platformActionWarning(replace).indexOf("$15") < platformActionWarning(replace).indexOf("cannot be undone"));

  const [mock] = platformLineActions(line({ reg_mock: true, sms_state: "approved" }));
  assert.equal(mock.action, "refile");
  assert.match(mock.cost, /\$19\.50/, "a real filing spends, and says how much");
  assert.equal(mock.permanent, true, "a registered brand cannot be withdrawn");
  // The confirmation LEADS with the money, then the permanence.
  const said = platformActionWarning(mock);
  assert.ok(said.indexOf("$19.50") < said.indexOf("cannot be undone"));

  // The two say different things, which is the entire point of deriving them.
  assert.notEqual(rejected.label, mock.label);
  assert.notEqual(platformActionWarning(rejected), platformActionWarning(mock));
});

test("every action says what it spends, or says that it spends nothing", () => {
  for (const l of [
    line({ voice_state: "failed" }),
    line({ sms_state: "rejected" }),
    line({ reg_mock: true }),
    line(),
  ]) {
    for (const a of platformLineActions(l)) {
      assert.ok(a.label && a.sentence, a.action);
      assert.ok(
        platformActionWarning(a).length > 10,
        `${a.action}: a confirmation that says nothing is not a confirmation`,
      );
    }
  }
  // Giving a number back is permanent and stops a charge rather than making one.
  const [release] = platformLineActions(line()).filter((a) => a.action === "release");
  assert.equal(release.permanent, true);
  assert.match(release.cost, /Stops the/);
  // A retry can spend, even though it usually does not: a saga that failed
  // before the number was bought buys one when it resumes.
  const [retry] = platformLineActions(line({ voice_state: "failed" }));
  assert.match(retry.cost, /buys one/);
});

test("three named operations, and no way to send a fourth", () => {
  // THE RISK THIS DESIGN REFUSES. A route that forwards an arbitrary `op` to
  // /api/admin/lines is a back door with extra steps -- it would hand a
  // platform admin's session the master key to every edge operation, including
  // ones nobody reviewed for this surface.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.join(here, "../../../../apps/dashboard/app/api/v1/platform/lines");
  const routes = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  assert.deepEqual(routes, ["refile", "release", "replace", "retry"]);

  for (const action of routes) {
    const src = fs.readFileSync(path.join(dir, action, "route.ts"), "utf8");
    // Its own operation, named in its own file, not taken from the request.
    assert.ok(
      src.includes(`platformLineAct(office, ctx, "${action}", tenantId, lineId)`),
      `${action}: the action is a literal`,
    );
    assert.ok(!/body\.(op|action)/.test(src), `${action}: the caller must not choose the operation`);
    assert.ok(src.includes("scope: platform,"), `${action}: no admin check`);
    assert.ok(src.indexOf("scope: platform,") < src.indexOf("platformLineAct("), `${action}: the check runs first`);
    assert.ok(src.includes('rate: "platform_line_'), `${action}: rate-limited`);
    assert.ok(
      src.includes('requireUuid(body.tenant_id, "workspace")') && src.includes('requireUuid(body.line_id, "line")'),
      `${action}: both ids are checked`,
    );
    assert.ok(!src.includes("memberContext("), `${action}: this surface is about workspaces the caller is not in`);
  }

  // And the edge operation each one maps to is a written-out list rather than a
  // parameter somebody can widen by accident.
  const server = readCode("apps/dashboard/src/server/platform/platform.ts");
  assert.match(
    server,
    /const EDGE_OP: Record<PlatformLineAction, \(tenantId: string, lineId: string\) => Record<string, unknown>>/,
  );
  assert.match(server, /refile: \(tenant_id, line_id\) => \(\{ op: "register", tenant_id, line_id, refile: true \}\)/);
  assert.match(
    server,
    /replace: \(tenant_id, line_id\) => \(\{ op: "register", tenant_id, line_id, refile: true, replace: true \}\)/,
  );
  assert.ok(!/op: (body|action|op)\b/.test(server), "the op is never taken from the caller");
});

test("no cross-tenant action happens that nobody can be held to", () => {
  // The attribution is written BEFORE the action and the action is refused if it
  // cannot be written. An action taken on somebody else's business that nobody
  // can be held to is worse than an action that did not happen.
  const server = readCode("apps/dashboard/src/server/platform/platform.ts");
  const fn = server.slice(server.indexOf("export async function platformLineAct"));
  const audit = fn.indexOf('kind: "platform.acted"');
  const act = fn.indexOf("await edgeLines(");
  assert.ok(audit !== -1 && act !== -1 && audit < act, "recorded first, then done");
  assert.match(
    fn,
    /if \(auditErr\)\s+throw new AppError\("internal", [^;]*503\);/,
    "and refused when it cannot be recorded",
  );
  assert.match(
    fn,
    /by: ctx\.userId, by_email: ctx\.email \?\? null/,
    "who, by id and by the address they signed in with",
  );
  assert.ok(fn.includes('subject_type: "line"') && fn.includes("subject_id: lineId"), "the line it was done to");
  assert.ok(EVENT_KINDS.includes("platform.acted"), "the kind is in the closed set the rest of the product uses");
});

test("the page reads the cost out; it does not decide it", () => {
  const page = readCode("apps/dashboard/src/legacy/pages/platform.jsx");
  assert.ok(page.includes("const actions = P.actions(line);"), "which actions, from the contract");
  assert.ok(page.includes("{P.warning(arm)}"), "and what each costs, from the contract");
  assert.ok(!/\$\d/.test(page), "no money figure lives in the page");
  assert.ok(
    !/reg_mock === true \?|sms_state === "rejected" \?/.test(page),
    "and no judgement about which refile this is",
  );
  // Arm-then-confirm: a cross-tenant write is never one click.
  assert.ok(
    page.includes("data-testid={`platform-act-${a.action}`}") && page.includes("testid={`platform-${arm.action}`}"),
  );
  assert.ok(page.includes("P.act(a.action, tenantId, line.id)"), "the action is a name, not a request body");
  // After one lands, both reads are stale.
  assert.ok(page.includes("onChanged={() => { setDetail(null); load(); setReload((n) => n + 1); }}"));
  assert.ok(page.includes("}, [P, openId, reload]);"), "so the detail re-reads on a change, not only on a new id");
});

test("the back office is read on demand, not published to every browser", () => {
  // A surface would make every customer's browser fetch a page it will never be
  // allowed to see, on every boot, for two accounts' benefit.
  const bridge = readCode("apps/dashboard/src/legacy-bridge/platform.ts");
  assert.match(bridge, /export function installPlatform/);
  assert.ok(!bridge.includes("SurfaceOverride"), "not a surface");
  assert.ok(
    bridge.includes("rows: platformRows") && bridge.includes("steps: setupSteps"),
    "the judgement and the customer's rows both come from contracts",
  );
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installPlatform();"));
  // Classified as a real PANE of Settings -- without that line the shell's
  // honesty gate fell through to the page's "demo" and a platform admin who
  // clicked Back office got the Not-in-this-release card -- but never as a
  // SURFACE of its own: it waits on the settings data every pane waits on, and
  // nothing fetches the back office at boot.
  const registry = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.ok(registry.includes('"admin/platform": "real"'), "the pane is reachable");
  assert.ok(registry.includes('"admin/platform": "settings"'), "and it waits on the settings surface");
  assert.ok(!/:\s*"platform"/.test(registry), "no surface of its own, so no browser fetches it at boot");
});

/* -------------------------------------------------------------------------- *
 * The pane, rendered without a browser.
 *
 * Same harness as registration-path.test.mjs: no jsdom and no React, just the
 * hooks these two components use, so the component bodies run for real and what
 * comes back is the element tree. Which matters more here than usual — the
 * claim being tested is "support sees exactly what the customer sees", and that
 * is a claim about what is on the screen.
 * -------------------------------------------------------------------------- */
globalThis.React = { Fragment: "Fragment" };
globalThis.window = {
  __ME: { email: "ruben@rjcapital.io", platform_admin: true },
  canDo: () => true,
  // The shared toast, as data-bits provides it: [node, flash].
  usePPToast: () => [null, () => {}],
  // The shell registers listeners on the window it is given.
  addEventListener() {},
  removeEventListener() {},
};
globalThis.Icon = () => null;
// The shared attention row, and the pane that draws it.
const ATTN = () => null;
globalThis.window.AttnRow = ATTN;
// A line's act is confirmed through the shared Confirm (data-bits.jsx): pure,
// so the walker below expands it like any other nested component.
globalThis.document ??= {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.ReactDOM ??= { createPortal: (node) => node };
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.Confirm = globalThis.window.Confirm;
// data-bits also publishes the shell's toast hook; this harness keeps its own flash.
globalThis.window.usePPToast = () => [null, () => {}];
await import("../../../../apps/dashboard/src/legacy/pages/platform.jsx");
const Pane = globalThis.window.PanePlatform;

/** Whether a dependency array differs from the one an effect or memo last saw. Undefined deps mean "every render", as in React. */
const changed = (before, after) =>
  before === undefined ||
  after === undefined ||
  before.length !== after.length ||
  after.some((d, i) => !Object.is(d, before[i]));

function mount(Component, props = {}) {
  const cells = [];
  let seq = 0;
  /** What each effect slot last ran with, and its cleanup. */
  const effects = {};
  let pending = [];
  Object.assign(globalThis.React, {
    createElement: (type, p, ...kids) => ({ type, props: { ...(p || {}), children: kids.flat(Infinity) } }),
    // Dependency arrays are HONOURED. The first version ignored them, which made
    // the harness unable to fail: changing the effect below from [P, openId] to
    // [P] — which in a browser means clicking Open never loads anything — left
    // every test passing. A harness that cannot distinguish working code from
    // broken code is worse than no harness, because it is reported as coverage.
    useMemo: (fn, deps) => {
      const k = seq++;
      const cell = cells[k];
      if (!cell || changed(cell.deps, deps)) cells[k] = { value: fn(), deps };
      return cells[k].value;
    },
    useCallback: (fn, deps) => {
      const k = seq++;
      const cell = cells[k];
      if (!cell || changed(cell.deps, deps)) cells[k] = { value: fn, deps };
      return cells[k].value;
    },
    useState: (init) => {
      const k = seq++;
      if (!(k in cells)) cells[k] = { value: typeof init === "function" ? init() : init };
      return [
        cells[k].value,
        (v) => {
          cells[k] = { value: typeof v === "function" ? v(cells[k].value) : v };
        },
      ];
    },
    useEffect: (fn, deps) => {
      pending.push({ fn, deps, key: seq++ });
    },
  });
  const draw = () => {
    seq = 0;
    pending = [];
    return Component(props);
  };
  let tree = draw();
  /**
   * Run the effects whose deps changed, then redraw, until nothing changes --
   * rather than a fixed three passes, which both re-ran effects that should not
   * have fired and could stop before a real chain had settled.
   */
  const settle = async () => {
    for (let pass = 0; pass < 12; pass++) {
      const due = pending.filter((e) => changed(effects[e.key]?.deps, e.deps));
      if (!due.length) return;
      for (const e of due) {
        const previous = effects[e.key];
        if (previous?.cleanup) previous.cleanup();
        const cleanup = e.fn();
        effects[e.key] = { deps: e.deps, cleanup: typeof cleanup === "function" ? cleanup : null };
      }
      await new Promise((r) => setImmediate(r));
      tree = draw();
    }
    throw new Error("the page never settled: an effect keeps re-firing");
  };
  return {
    get tree() {
      return tree;
    },
    settle,
    async act(node) {
      node.props.onClick();
      tree = draw();
      await new Promise((r) => setImmediate(r));
      tree = draw();
      await settle();
    },
    /** Press a handler the pane handed to a child component -- an attention row's cta, say. */
    async press(fn) {
      fn();
      tree = draw();
      await new Promise((r) => setImmediate(r));
      tree = draw();
      await settle();
    },
    type(node, value) {
      node.props.onChange({ target: { value } });
      tree = draw();
    },
  };
}

/**
 * Walk the element tree, expanding nested components as it goes.
 *
 * `createElement` only records a component's function and props, so the detail
 * pane's own markup would be invisible without this. Expanding it is safe here
 * because the nested components in this file are pure -- no hooks, so nothing to
 * confuse the cell counter above. The shared attention row is deliberately NOT
 * expanded: it belongs to People and Today too, and what this pane owes it is
 * the props, which is what the assertions read.
 */
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  if (typeof n.type === "function" && n.type !== ATTN) walk(n.type(n.props), fn);
  for (const k of n.props?.children ?? []) walk(k, fn);
};
const byId = (root, id) => {
  let hit = null;
  walk(root, (n) => {
    if (!hit && n.props?.["data-testid"] === id) hit = n;
  });
  return hit;
};
/** Every attention row the pane drew, in order, as the props it handed the shared component. */
const attnRows = (root) => {
  const out = [];
  walk(root, (n) => {
    if (n.type === ATTN) out.push(n);
  });
  return out;
};
/** Everything a reader would see, expanding nested components the same way walk does. */
const textOf = (n) => {
  const out = [];
  const rec = (x) => {
    if (x == null || x === false || x === true) return;
    if (typeof x === "string" || typeof x === "number") {
      out.push(String(x));
      return;
    }
    if (Array.isArray(x)) {
      x.forEach(rec);
      return;
    }
    if (typeof x !== "object") return;
    if (typeof x.type === "function" && x.type !== ATTN) {
      rec(x.type(x.props));
      return;
    }
    rec(x.props?.children);
  };
  rec(n);
  return out.join(" ");
};

/** The window API, network stubbed, every judgement the real contract's. */
function api(tenants, detail = null, calls = []) {
  return {
    list: async () => {
      calls.push("list");
      return { ok: true, tenants, message: "" };
    },
    one: async (id) => {
      calls.push(`one:${id}`);
      return { ok: !!detail, detail, message: detail ? "" : "No such page." };
    },
    // The bridge reads the real clock; these fixtures are written against NOW,
    // so the stand-in reads NOW too. It used the real one, and "heard 1d ago"
    // became "2d ago" the morning after it was written.
    rows: (tenants) => platformRows(tenants, NOW),
    summary: platformSummary,
    verdicts: PLATFORM_VERDICTS,
    quietDays: PLATFORM_QUIET_DAYS,
    number: platformNumber,
    steps: setupSteps,
    actions: platformLineActions,
    warning: platformActionWarning,
    words: activityWords,
    // A zone the page is GIVEN, not the one it is in: the same contracts
    // functions the bridge hands over.
    clock: {
      time: clockTime,
      dateYear: clockDateYear,
      dayLabel: (ms, tz) => clockDayLabel(ms, tz, NOW),
      dayKey: zoneDayKey,
    },
    act: async (action, tenantId, lineId) => {
      calls.push(`act:${action}:${tenantId}:${lineId}`);
      return { ok: true, message: "Done." };
    },
    // The queue, as the bridge hands it over: the contract's own view model,
    // read at the fixtures' NOW rather than at this machine's.
    queue: (q) => platformQueue(q, NOW),
    markInvited: async (id) => {
      calls.push(`invited:${id}`);
      return { ok: true, message: "Marked. They are off the list." };
    },
  };
}

test("the list is the contract's judgement, in the row grammar the rest of the app uses", async () => {
  globalThis.window.__platform = api([
    live({ tenant_id: "a", slug: "all-good", name: "All Good" }),
    live({
      tenant_id: "b",
      slug: "broken-co",
      name: "Broken Co",
      voice_state: "failed",
      line_error: "Twilio refused the number: 21422",
    }),
    live({ tenant_id: "c", slug: "smoke", name: "Smoke", status: "test" }),
  ]);
  const page = mount(Pane);
  assert.match(textOf(page.tree), /Reading every workspace/, "nothing is shown before it is read");
  await page.settle();

  // One attention row per workspace, in the contract's order: the broken one
  // first, whatever it is called.
  const rows = attnRows(page.tree);
  assert.deepEqual(
    rows.map((r) => r.props.name),
    ["Broken Co", "All Good", "Smoke"],
  );
  assert.deepEqual(
    rows.map((r) => r.props.testid),
    ["platform-row-broken-co", "platform-row-all-good", "platform-row-smoke"],
  );
  // The sentence is the verdict's, unchanged -- the provider's own words reach
  // the screen rather than a category.
  assert.match(rows[0].props.sentence, /Twilio refused the number: 21422/);
  // The verdict leads the status line and colours the row.
  assert.equal(rows[0].props.status[0], "Broken");
  assert.equal(rows[0].props.tone, "danger");
  assert.equal(rows[1].props.tone, "ok", "the verdict speaks the six tones now; a live workspace is ok, not blank");
  // The verdict is the row; the four facts are behind its mark. They were
  // printed on every line so the answer was on the page rather than one click
  // away -- Ruben changed that call on 17 Sep, looking at five facts per row on
  // a page of twenty workspaces. They are one hover, focus or tap away now, and
  // the mark carries them on its aria-label for a reader that never hovers.
  assert.deepEqual(rows[1].props.status, ["Live"], "the verdict leads alone");
  assert.match(rows[1].props.note, /active · phone \+ WhatsApp · texting On · heard 1d ago/);
  assert.match(textOf(byId(page.tree, "platform-summary")), /2 workspaces · 1 live · 1 on us/);
});

test("a refusal is the ordinary answer, and it does not look like an empty platform", async () => {
  globalThis.window.__platform = {
    ...api([]),
    list: async () => ({ ok: false, tenants: [], message: "No such page." }),
  };
  const page = mount(Pane);
  await page.settle();
  assert.match(textOf(page.tree), /No such page/, "what the route said, said plainly");
  assert.equal(attnRows(page.tree).length, 0);
});

test("REGRESSION (S10): a list that cannot be read says so with a Retry, and never says there are no workspaces", async () => {
  const calls = [];
  let fail = true;
  const harbor = live({ tenant_id: "a", slug: "harbor-moving", name: "Harbor Moving" });
  globalThis.window.__platform = {
    ...api([harbor], null, calls),
    list: async () => {
      calls.push("list");
      return fail
        ? { ok: false, tenants: [], message: "The platform could not be read." }
        : { ok: true, tenants: [harbor], message: "" };
    },
  };
  const page = mount(Pane);
  await page.settle();
  assert.match(textOf(page.tree), /The platform could not be read/);
  assert.ok(!/No workspaces yet/.test(textOf(page.tree)), "REGRESSION: a failed read said the platform was empty");
  const retry = byId(page.tree, "platform-failed-retry");
  assert.ok(retry, "and it can be read again from where it failed");
  fail = false;
  await page.act(retry);
  assert.equal(calls.filter((c) => c === "list").length, 2);
  assert.equal(attnRows(page.tree).length, 1, "and the rows arrive");
  assert.equal(byId(page.tree, "platform-failed"), null);
});

test("REGRESSION (S10): a workspace that cannot be read says so with its Retry, instead of reading for ever", async () => {
  const calls = [];
  globalThis.window.__platform = api(
    [live({ tenant_id: "a", slug: "harbor-moving", name: "Harbor Moving" })],
    null,
    calls,
  );
  const page = mount(Pane);
  await page.settle();
  await page.press(attnRows(page.tree)[0].props.cta.onClick);
  assert.ok(!/Reading that workspace/.test(textOf(page.tree)), "REGRESSION: it read for ever");
  assert.match(textOf(byId(page.tree, "platform-detail-failed")), /No such page/, "what the route said");
  assert.equal(byId(page.tree, "platform-failed"), null, "the list is not blamed for it");
  await page.act(byId(page.tree, "platform-detail-failed-retry"));
  assert.equal(calls.filter((c) => c === "one:a").length, 2, "Retry reads that workspace again");
});

test("REGRESSION (S10): a read that throws is a failed read, not a page reading for ever", async () => {
  globalThis.window.__platform = {
    ...api([]),
    list: async () => {
      throw new Error("socket hang up");
    },
  };
  const page = mount(Pane);
  await page.settle();
  assert.ok(!/Reading every workspace/.test(textOf(page.tree)), "REGRESSION: a thrown read left the page reading");
  assert.ok(byId(page.tree, "platform-failed"));
});

test("finding a workspace by name or slug, because that is what a support call starts with", async () => {
  globalThis.window.__platform = api([
    live({ tenant_id: "a", slug: "harbor-moving", name: "Harbor Moving" }),
    live({ tenant_id: "b", slug: "marisas-beauty-salon", name: "Marisa's Beauty Salon" }),
  ]);
  const page = mount(Pane);
  await page.settle();
  assert.equal(attnRows(page.tree).length, 2);
  page.type(byId(page.tree, "platform-find"), "marisa");
  assert.deepEqual(
    attnRows(page.tree).map((r) => r.props.name),
    ["Marisa's Beauty Salon"],
  );
  page.type(byId(page.tree, "platform-find"), "harbor-mov");
  assert.deepEqual(
    attnRows(page.tree).map((r) => r.props.name),
    ["Harbor Moving"],
    "the slug matches too",
  );
  page.type(byId(page.tree, "platform-find"), "zzz");
  assert.equal(attnRows(page.tree).length, 0);
  assert.match(textOf(page.tree), /Nothing matches/);
});

test("opening one shows the customer's own Setup rows, and no buttons that would act on ours", async () => {
  const calls = [];
  const detail = {
    tenant: {
      id: "a",
      slug: "harbor-moving",
      name: "Harbor Moving",
      status: "active",
      timezone: "America/New_York",
      created_at: ago(90),
    },
    setup: SETUP_FIXTURE,
    events: [
      { kind: "line.provisioned", category: "setup", subject_type: "line", created_at: ago(2), data: {} },
      { kind: "business.recorded", category: "setup", subject_type: "tenant", created_at: ago(1), data: {} },
    ],
  };
  globalThis.window.__platform = api(
    [live({ tenant_id: "a", slug: "harbor-moving", name: "Harbor Moving" })],
    detail,
    calls,
  );
  const page = mount(Pane);
  await page.settle();
  await page.press(attnRows(page.tree)[0].props.cta.onClick);
  assert.ok(calls.includes("one:a"), "it reads that workspace");
  assert.ok(byId(page.tree, "platform-detail"), "the detail opens under the list");

  // The rows are setupSteps' rows -- the customer's own view model, run for
  // their workspace. Compared against the function directly, so a second
  // rendering cannot creep in.
  const want = setupSteps({ ...SETUP_FIXTURE, later: [] });
  const shown = attnRows(page.tree)
    .map((r) => r.props.testid)
    .filter((t) => String(t).startsWith("platform-setup-"));
  assert.deepEqual(
    shown,
    want.rows.map((r) => `platform-setup-${r.id}`),
  );
  assert.ok(want.rows.length >= 5, "a real set of rows, not an empty one");

  // Read-only: not one of those rows offers a verb. Setup's buttons act on the
  // SIGNED-IN workspace, and this is somebody else's.
  for (const r of attnRows(page.tree).filter((r) => String(r.props["data-testid"]).startsWith("platform-setup-"))) {
    assert.equal(r.props.cta ?? null, null, `${r.props["data-testid"]} offers a button`);
    assert.equal(r.props.also ?? null, null);
  }
  // The trail, newest first, and the line's own step and error.
  assert.ok(byId(page.tree, "platform-events"));
  assert.match(textOf(byId(page.tree, "platform-events")), /line\.provisioned/);
  const text = textOf(page.tree);
  assert.match(text, /Their lines/);
  assert.match(text, /stopped at brand/, "where the registration stopped");
  assert.match(text, /the carriers refused it/, "and what the provider said");
});

test("acting on a line is never one click, and says the cost before it is", async () => {
  // The line row, driven on its own: it holds the arm-then-confirm state, and a
  // harness that re-invokes nested components cannot drive one from outside.
  //
  // This line's registration was REJECTED, so the action offered is the free
  // edit -- and the confirmation has to say so rather than quoting the
  // rehearsal's $19.50.
  const calls = [];
  globalThis.window.__platform = api([], null, calls);
  const rejected = { ...SETUP_FIXTURE.lines.rows[0] };
  assert.equal(rejected.sms_state, "rejected", "the fixture is the case this is about");

  let reloaded = 0;
  const row = mount(globalThis.window.PlatformLine, {
    line: rejected,
    tenantId: "a",
    onDone: () => {
      reloaded += 1;
    },
    flash: () => {},
  });

  // The buttons the contract offers for THIS line, and no others.
  assert.ok(byId(row.tree, "platform-act-refile"), "a rejected campaign can be sent back");
  assert.ok(byId(row.tree, "platform-act-release"));
  assert.equal(byId(row.tree, "platform-act-retry"), null, "the line is answering, so there is nothing to retry");
  assert.equal(calls.length, 0, "and nothing has happened yet");

  // Arming shows the cost and does NOT act.
  await row.press(byId(row.tree, "platform-act-refile").props.onClick);
  const arm = byId(row.tree, "platform-refile-confirm");
  assert.ok(arm, "a cross-tenant write is never one click");
  assert.match(textOf(arm), /Nothing is spent/, "this one is an edit, so it says so");
  assert.ok(!textOf(arm).includes("19.50"), "REGRESSION: quoting the rehearsal's price for a free edit");
  assert.equal(calls.length, 0, "arming is not doing");

  // Confirming acts, once, with the workspace and line it was shown for.
  await row.press(byId(row.tree, "platform-refile-yes").props.onClick);
  assert.deepEqual(calls, ["act:refile:a:l1"]);
  assert.equal(reloaded, 1, "and the reads it made stale are re-read");
});

test("a rehearsal offers a different action, at a price, and says it cannot be undone", async () => {
  const calls = [];
  globalThis.window.__platform = api([], null, calls);
  const mock = { ...SETUP_FIXTURE.lines.rows[0], sms_state: "approved", reg_mock: true };
  const row = mount(globalThis.window.PlatformLine, { line: mock, tenantId: "a", onDone: () => {}, flash: () => {} });
  await row.press(byId(row.tree, "platform-act-refile").props.onClick);
  const said = textOf(byId(row.tree, "platform-refile-confirm"));
  assert.match(said, /\$19\.50/, "a real filing spends, and says how much");
  assert.match(said, /cannot be undone/);
  assert.ok(said.indexOf("$19.50") < said.indexOf("cannot be undone"), "money first");
});

test("the pane decides nothing: every verdict, word and row comes from the contract", () => {
  const src = readCode("apps/dashboard/src/legacy/pages/platform.jsx");
  for (const call of [
    "P.rows(tenants)",
    "P.summary(rows)",
    "P.verdicts[r.verdict]",
    "P.steps({ ...detail.setup, later: [] })",
    "P.number(line.e164)",
    "P.actions(line)",
    "P.warning(arm)",
  ]) {
    assert.ok(src.includes(call), `the page reads ${call} rather than deciding`);
  }
  // No thresholds, no state lists, no sorting of its own.
  assert.ok(!/\.sort\(/.test(src), "the contract sorts");
  assert.ok(!/86_?400_?000|14 \* DAY|\bDAY\b/.test(src), "no clocks of its own");
  assert.ok(!/needs_record|past_due|reg_mock === true/.test(src), "no state judgements of its own");
  // It borrows the row grammar rather than inventing one.
  assert.ok(src.includes("<window.AttnRow"), "the same row People, Today and Setup draw");
  assert.ok(!/className="pf-row/.test(src));
});

test("the tab exists for the people it is for, and for nobody else", () => {
  const settings = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  // Not in SET_TABS: a customer who types the route lands on Profile rather
  // than on a locked door they now know about.
  assert.ok(!/id: "platform".*group: "Workspace"/.test(settings));
  assert.match(settings, /const SET_TABS_PLATFORM = \[\{ id: "platform"/);
  assert.match(settings, /const isPlatformAdmin = \(\) => !!\(window\.__ME && window\.__ME\.platform_admin\);/);
  // The rail derives from the list, so the tab cannot appear where it may not.
  assert.match(settings, /\[\.\.\.SET_TABS, \.\.\.\(isPlatformAdmin\(\) \? SET_TABS_PLATFORM : \[\]\)\]/);
  // And the route resolves to it only for an admin -- otherwise SET_TAB falls
  // through to the default, which is what makes the route a dead end.
  assert.match(settings, /\|\| \(isPlatformAdmin\(\) \? SET_TABS_PLATFORM\.find\(\(t\) => t\.id === id\) : null\)/);
  assert.match(settings, /\{active\.id === "platform" && window\.PanePlatform && <window\.PanePlatform \/>\}/);
  // The crumb asks SET_TAB itself, so one route cannot be described two ways:
  // run in shell-status.test.mjs, for a customer and for an admin.
  // In both lists, in file order, like every other legacy page.
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/pages/platform.jsx";'));
});

test("the ops routes have their own ceilings, sized for a support shift and named for what they do", async () => {
  // RATE's own rule is "One rule per bucket. Named by what the route DOES, not by
  // its path." The three platform routes borrowed the OWNER buckets, and three
  // things followed, all wrong in the same direction:
  //
  //   * `takeRate` counts per PERSON, so an admin's refiles for three different
  //     customers drew down the same three-an-hour as filings for their own line.
  //   * correcting a REJECTED campaign is free and reversible -- Twilio charges the
  //     vetting fee once per campaign -- yet it was capped by a ceiling sized for an
  //     irreversible $19.50 spend, so a shift clearing four rejections failed on the
  //     fourth. It is described in server/platform/platform.ts as the most common A2P
  //     support action there is.
  //   * the refusal reads from `noun`, so handing a number BACK was refused with
  //     "Too many lines in a short time".
  const { RATE } = await import("../../../../apps/dashboard/src/server/rate-limit.ts");
  for (const [bucket, route, min] of [
    ["platform_line_retry", "retry", 10],
    ["platform_line_refile", "refile", 10],
    ["platform_line_release", "release", 1],
  ]) {
    const rule = RATE[bucket];
    assert.ok(rule, `${bucket} exists`);
    assert.ok(rule.limit >= min, `${bucket}: ${rule.limit} is a support shift, not one owner's wallet`);
    assert.match(rule.noun, /workspaces|handed back/, `${bucket}: the noun says whose thing this is`);
    const src = readCode(`apps/dashboard/app/api/v1/platform/lines/${route}/route.ts`);
    assert.ok(src.includes(`rate: "${bucket}",`), `${route} spends its own bucket`);
    for (const owner of ["lines_register", "lines_buy", "lines_retry"]) {
      assert.ok(!src.includes(`"${owner}"`), `${route}: REGRESSION: back on the owner's bucket ${owner}`);
    }
  }
  // Release stays the tightest: it is permanent, and a number handed back cannot
  // be reclaimed.
  assert.ok(RATE.platform_line_release.limit < RATE.platform_line_refile.limit, "the irreversible one is the tightest");
});

test("the back office does not tell the reader it changes nothing, in the file that changes things", () => {
  // Gate 6 added Retry / Refile / Release to this page. Two claims in it were not
  // updated, and one of them is user-visible copy sitting directly above rows
  // whose Open reveals a button that permanently releases a customer's number.
  const page = readCode("apps/dashboard/src/legacy/pages/platform.jsx");
  assert.ok(!/Read-only — nothing here changes a workspace/.test(page), "REGRESSION: the page claims to be read-only");
  assert.ok(!/Read-only: actions come later/.test(page), "REGRESSION: a comment describing the opposite of the file");
  assert.match(
    page,
    /This list changes nothing; open a workspace and its lines can be/,
    "it says which half is read-only",
  );
  assert.match(page, /each one asks twice, and each is recorded against you/);
  // And those two claims are true: arm-then-confirm, and the ledger row goes in
  // before the action runs.
  assert.match(page, /const \[arm, setArm\] = React\.useState\(null\);/);
  const server = readCode("apps/dashboard/src/server/platform/platform.ts");
  const audit = server.indexOf('kind: "platform.acted"');
  const edge = server.indexOf("await edgeLines(EDGE_OP[action]");
  assert.ok(audit !== -1 && edge !== -1 && audit < edge, "attribution is written before the action, not after it");
});

/* -------------------------------------------------------------------------- *
 * The people who are not workspaces yet.
 *
 * `public.waitlist` (00088) had a writer and no reader anywhere in the product
 * — which is how it went unnoticed that the writer did not work either. These
 * people have no workspace, so the back office is the only surface they can
 * appear on at all. waitlist.db.test.mjs proves the writing; this proves what
 * is made of it.
 * -------------------------------------------------------------------------- */

const waiting = (over = {}) => ({
  id: "w1",
  email: "ana@example.com",
  business: "Marisa's Beauty Salon",
  source: "https://chanlytics.com/pricing?utm_source=x",
  created_at: ago(3),
  ...over,
});

test("the queue says how many and how long, and an unreadable queue is not an empty one", () => {
  const empty = platformQueue({ waiting: [], total: 0 }, NOW);
  assert.equal(empty.sentence, "Nobody is waiting.");
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.unreadable, false);

  // The answer a queue must never give by accident.
  const blind = platformQueue({ waiting: null, total: null }, NOW);
  assert.equal(blind.unreadable, true);
  assert.match(blind.sentence, /could not be read/);
  assert.doesNotMatch(blind.sentence, /Nobody/, "REGRESSION: a failed read must never read as an empty list");

  const two = platformQueue({ waiting: [waiting(), waiting({ id: "w2", created_at: ago(1) })], total: 2 }, NOW);
  assert.match(two.sentence, /^2 waiting, the first since 3d ago\.$/);
  // Capped: the list is the first hundred and the sentence still counts them all.
  const many = platformQueue({ waiting: [waiting()], total: 140 }, NOW);
  assert.match(many.sentence, /140 waiting.*showing the first 1\./);
});

test("a row says who they are and where they came from, and never the query string", () => {
  const [row] = platformQueue({ waiting: [waiting()], total: 1 }, NOW).rows;
  assert.equal(row.email, "ana@example.com");
  assert.equal(row.detail, "Marisa's Beauty Salon · from chanlytics.com/pricing");
  assert.equal(row.waited, "asked 3d ago");

  // Whichever half they gave, and nothing when they gave neither.
  assert.equal(
    platformQueue({ waiting: [waiting({ business: null })], total: 1 }, NOW).rows[0].detail,
    "from chanlytics.com/pricing",
  );
  assert.equal(
    platformQueue({ waiting: [waiting({ source: null })], total: 1 }, NOW).rows[0].detail,
    "Marisa's Beauty Salon",
  );
  assert.equal(
    platformQueue({ waiting: [waiting({ business: "  ", source: "" })], total: 1 }, NOW).rows[0].detail,
    null,
  );
  // A referer that is not a URL is still shown, bounded, rather than dropped.
  assert.equal(
    platformQueue({ waiting: [waiting({ business: null, source: "an email signature" })], total: 1 }, NOW).rows[0]
      .detail,
    "from an email signature",
  );
});

test("the only action says what it does not do", () => {
  // A button that looked like it sent something would leave people waiting for
  // a mail nobody ever wrote. There is one shared sign-up code; an invitation
  // is a mail a person writes.
  assert.match(QUEUE_SENDS_NOTHING, /sends no invitations/i);
  assert.match(QUEUE_SENDS_NOTHING, /Write to them yourself/);
  assert.equal(platformQueue({ waiting: [waiting()], total: 1 }, NOW).note, QUEUE_SENDS_NOTHING);
});

test("the queue is read through the one door, still-waiting only, oldest first", async () => {
  const rows = [
    { id: "w2", email: "bea@example.com", business: null, source: null, created_at: ago(1), invited_at: null },
    { id: "w3", email: "cass@example.com", business: null, source: null, created_at: ago(9), invited_at: ago(8) },
    { id: "w1", email: "ana@example.com", business: "Salon", source: null, created_at: ago(3), invited_at: null },
  ];
  const q = await platformWaitlist({ db: fakeDb({ waitlist: rows }) });
  assert.deepEqual(
    q.waiting.map((r) => r.email),
    ["ana@example.com", "bea@example.com"],
    "invited is out of the queue; oldest first",
  );
  assert.equal(q.total, 2);
  // What the read SELECTS -- and so what reaches a browser -- is proved in
  // waitlist.db.test.mjs: this double hands back whole rows whatever is asked
  // for, and an assertion about projection here would pass on either.
});

test("a queue that could not be read answers null, not empty, and does not throw", async () => {
  const q = await platformWaitlist({
    db: fakeDb({ waitlist: [] }, { "waitlist.select": { message: "permission denied" } }),
  });
  assert.deepEqual(
    q,
    { waiting: null, total: null },
    "the back office is opened when things are wrong; this must not take the page with it",
  );
});

test("marking somebody invited is conditional on them still waiting, and records who", async () => {
  const rows = [
    {
      id: "w1",
      email: "ana@example.com",
      business: null,
      source: null,
      created_at: ago(3),
      invited_at: null,
      invited_by: null,
    },
  ];
  const office = { db: fakeDb({ waitlist: rows }) };
  const ctx = { userId: "u-admin", email: "ruben@rjcapital.io" };

  assert.equal(await platformWaitlistInvited(office, ctx, "w1"), "marked");
  assert.ok(rows[0].invited_at, "the stamp that takes them out of the queue");
  assert.equal(rows[0].invited_by, "u-admin", "the column the table was given for exactly this");

  // Two admins working down the same list is how this is used. The second one
  // is owed the truth, not a failure and not a second stamp.
  const firstStamp = rows[0].invited_at;
  assert.equal(await platformWaitlistInvited(office, ctx, "w1"), "already");
  assert.equal(rows[0].invited_at, firstStamp, "the row is somebody else's now and is left exactly as they left it");
  assert.equal(await platformWaitlistInvited(office, ctx, "w-nobody"), "already");
});

test("the page draws who is waiting, and says the product sends nothing", async () => {
  const calls = [];
  globalThis.window.__platform = {
    ...api([live({ tenant_id: "a", slug: "all-good", name: "All Good" })], null, calls),
    list: async () => ({
      ok: true,
      tenants: [live({ tenant_id: "a", slug: "all-good", name: "All Good" })],
      health: null,
      queue: {
        waiting: [
          waiting(),
          waiting({ id: "w2", email: "bea@example.com", business: null, source: null, created_at: ago(1) }),
        ],
        total: 2,
      },
      message: "",
    }),
  };
  const page = mount(Pane);
  await page.settle();

  assert.match(textOf(byId(page.tree, "platform-queue-words")), /2 waiting, the first since 3d ago/);
  assert.match(textOf(byId(page.tree, "platform-queue-note")), /sends no invitations/i);
  const rows = [];
  walk(page.tree, (n) => {
    if (n.props?.["data-testid"] === "platform-queue-row") rows.push(n);
  });
  assert.equal(rows.length, 2);
  assert.match(textOf(rows[0]), /ana@example\.com/);
  assert.match(textOf(rows[0]), /Marisa's Beauty Salon · from chanlytics\.com\/pricing · asked 3d ago/);
  assert.match(
    textOf(rows[1]),
    /bea@example\.com asked 1d ago/,
    "the halves they did not give leave no separator hanging",
  );
  assert.doesNotMatch(textOf(rows[1]), / · /, "nor an empty one");
});

test("marking somebody invited is never one click, and says what it does not do", async () => {
  // Driven on its own, the way the line row is: it holds the arm-then-confirm
  // state, and a harness that re-invokes nested components cannot drive one
  // from outside.
  const calls = [];
  globalThis.window.__platform = api([], null, calls);
  let reloaded = 0;
  const said = [];
  const [row] = platformQueue({ waiting: [waiting()], total: 1 }, NOW).rows;
  const view = mount(globalThis.window.PlatformWaitingRow, {
    row,
    P: globalThis.window.__platform,
    onDone: () => {
      reloaded += 1;
    },
    flash: (t) => said.push(t),
  });

  assert.match(textOf(view.tree), /ana@example\.com/);
  await view.press(byId(view.tree, "platform-queue-mark").props.onClick);
  assert.deepEqual(
    calls.filter((c) => c.startsWith("invited:")),
    [],
    "arming is not doing",
  );

  const confirm = byId(view.tree, "platform-queue-invited-confirm");
  assert.ok(confirm, "it asks");
  assert.match(textOf(confirm), /Nothing is sent/, "and the question says what it is not");
  assert.equal(byId(view.tree, "platform-queue-mark"), null, "the button is gone while the question stands");

  await view.press(byId(view.tree, "platform-queue-invited-yes").props.onClick);
  assert.deepEqual(
    calls.filter((c) => c.startsWith("invited:")),
    ["invited:w1"],
  );
  assert.equal(reloaded, 1, "the queue on screen is a row out of date, so the page reads again");
  assert.equal(said.length, 1, "and the person who pressed it is told what happened");
});

test("a mark that did not go through is said, and changes nothing on the page", async () => {
  let reloaded = 0;
  const said = [];
  const [row] = platformQueue({ waiting: [waiting()], total: 1 }, NOW).rows;
  const view = mount(globalThis.window.PlatformWaitingRow, {
    row,
    P: { markInvited: async () => ({ ok: false, message: "That could not be recorded, so it was not done." }) },
    onDone: () => {
      reloaded += 1;
    },
    flash: (t) => said.push(t),
  });
  await view.press(byId(view.tree, "platform-queue-mark").props.onClick);
  await view.press(byId(view.tree, "platform-queue-invited-yes").props.onClick);
  assert.equal(reloaded, 0, "nothing is re-read, because nothing happened");
  assert.equal(said.length, 1);
  assert.equal(said[0].tone, "danger");
});

test("a queue that could not be read says so on the page, and never draws an empty list", async () => {
  globalThis.window.__platform = {
    ...api([live({ tenant_id: "a", slug: "all-good", name: "All Good" })]),
    list: async () => ({
      ok: true,
      tenants: [live({ tenant_id: "a", slug: "all-good", name: "All Good" })],
      health: null,
      queue: { waiting: null, total: null },
      message: "",
    }),
  };
  const page = mount(Pane);
  await page.settle();
  assert.match(textOf(byId(page.tree, "platform-queue-words")), /could not be read/);
  assert.equal(byId(page.tree, "platform-queue-rows"), null, "nothing is drawn, because nothing is known");
  assert.equal(byId(page.tree, "platform-queue-mark"), null);
});

test("a deployment whose overview predates the queue draws no card at all", async () => {
  // The page and the API ship separately. A payload without `queue` is a client
  // reading an older server, and an absent queue is not an empty one.
  globalThis.window.__platform = api([live({ tenant_id: "a", slug: "all-good", name: "All Good" })]);
  const page = mount(Pane);
  await page.settle();
  assert.equal(byId(page.tree, "platform-queue"), null);
  assert.ok(byId(page.tree, "platform-overview"), "and the workspaces are still there");
});

/* ------------------------------------------------------------------------ partners (decision 0012, P5) */

const P1 = "10000000-0000-4000-8000-000000000001";
/** One partner's line of platform_partner_balances(). */
const balance = (over = {}) => ({
  partner_id: P1,
  code: "ada-co",
  email: "ada@example.com",
  status: "active",
  share_bp: 2500,
  joined_at: "2026-08-01T00:00:00Z",
  workspaces: 2,
  under_review: 1,
  currency: "usd",
  held_cents: 5000,
  payable_cents: 12500,
  paid_cents: 0,
  last_paid_at: null,
  ...over,
});
/** One line of platform_partner_workspaces(). */
const brought = (over = {}) => ({
  tenant_id: "b",
  partner_id: P1,
  code: "ada-co",
  attributed_at: "2026-08-01T00:00:00Z",
  standing: "review",
  standing_why: "The card that pays for it also pays for a workspace the partner owns.",
  standing_at: "2026-08-09T00:00:00Z",
  decided_by: "sweep",
  checks: { same_card: true, same_listing: false },
  ...over,
});
/** The window API with the partner card's half, network stubbed, the words the real contract's. */
function partnerApi(tenants, partners, calls = []) {
  return {
    ...api(tenants, null, calls),
    list: async () => ({ ok: true, tenants, health: null, queue: null, partners, message: "" }),
    partnerRows: platformPartnerRows,
    partnerSummary: platformPartnerSummary,
    partnerStanding: platformPartnerStanding,
    markPaid: async (partnerId, code, currency, reference, expected) => {
      calls.push(`paid:${partnerId}:${code}:${currency}:${reference}:${expected}`);
      return { ok: true, message: "Recorded." };
    },
    setStatus: async (partnerId, code, status, why) => {
      calls.push(`status:${partnerId}:${code}:${status}:${why}`);
      return { ok: true, message: "Done." };
    },
    setStanding: async (tenantId, standing, why) => {
      calls.push(`standing:${tenantId}:${standing}:${why}`);
      return { ok: true, message: "Done." };
    },
  };
}

test("the partner card: what each partner is owed, the workspaces held for a person, and who brought each workspace on its row", async () => {
  globalThis.window.__platform = partnerApi(
    [
      live({ tenant_id: "a", slug: "harbor", name: "Harbor Moving" }),
      live({ tenant_id: "b", slug: "bayside", name: "Bayside Salon" }),
      live({ tenant_id: "c", slug: "nobody", name: "Nobody's" }),
    ],
    {
      balances: [balance()],
      workspaces: [
        brought(),
        brought({ tenant_id: "a", standing: "qualified", standing_why: null, decided_by: "sweep" }),
      ],
    },
  );
  const page = mount(Pane);
  await page.settle();
  assert.equal(
    textOf(byId(page.tree, "platform-partners-words")),
    "1 partner · $125.00 payable · 1 workspace under review",
  );
  assert.equal(
    textOf(byId(page.tree, "platform-partner-money-ada-co")),
    "$125.00 payable · $50.00 held · $0.00 paid to date",
    "a zero is said as a zero",
  );
  assert.ok(byId(page.tree, "platform-standing-b"), "the one under review is on the card");
  assert.equal(byId(page.tree, "platform-standing-a"), null, "a qualified one is not: nothing to decide");
  assert.match(textOf(byId(page.tree, "platform-standing-words-b")), /Under review \(the nightly check\): The card/);
  const rows = attnRows(page.tree);
  const meta = Object.fromEntries(rows.map((r) => [r.props.name, r.props.meta]));
  assert.match(meta["Bayside Salon"], / · Brought by ada-co$/);
  assert.doesNotMatch(meta["Nobody's"], /Brought by/, "a workspace nobody brought says nothing about partners");
});

test("who brought it and who decided, in the back office's words: a link, a handover or an owner's invitation; the nightly check, a person, or the rule as the partner joined (0018)", () => {
  const WHY = "The card that pays for it also pays for a workspace the partner owns.";
  assert.equal(platformPartnerStanding(brought()).by, "Brought by ada-co", "a database before 00225 says no origin");
  assert.equal(platformPartnerStanding(brought({ origin: "link" })).by, "Brought by ada-co");
  assert.equal(platformPartnerStanding(brought({ origin: "handover" })).by, "Set up and handed over by ada-co");
  assert.equal(platformPartnerStanding(brought({ origin: "invite" })).by, "ada-co, asked in by its owner");
  const joined = platformPartnerStanding(
    brought({
      origin: "invite",
      standing: "disqualified",
      standing_why: "It was already paying for its plan when the partner joined, so it earns no share.",
      decided_by: "joining",
      checks: { already_paying: true },
    }),
  );
  assert.equal(
    joined.standing,
    "Disqualified (as the partner joined): It was already paying for its plan when the partner joined, so it earns no share.",
    "not the nightly check's: it decided nothing",
  );
  assert.equal(platformPartnerStanding(brought()).standing, `Under review (the nightly check): ${WHY}`);
  assert.equal(
    platformPartnerStanding(brought({ decided_by: "person" })).standing,
    `Under review (decided by a person): ${WHY}`,
  );
  assert.equal(
    platformPartnerStanding(brought({ decided_by: "someone-new" })).standing,
    `Under review: ${WHY}`,
    "a decider these words do not know is not named",
  );
});

test("a deployment whose overview predates the partners draws no partner card, and the workspaces are still there", async () => {
  globalThis.window.__platform = partnerApi([live({ tenant_id: "a", slug: "harbor", name: "Harbor Moving" })], null);
  const page = mount(Pane);
  await page.settle();
  assert.equal(byId(page.tree, "platform-partners"), null);
  assert.ok(byId(page.tree, "platform-overview"));
});

test("recording a payout is never one click, sends nothing, and waits for the payment's reference", async () => {
  const calls = [];
  const P = partnerApi([], null, calls);
  let reloaded = 0;
  const said = [];
  const [row] = platformPartnerRows([balance()]);
  const view = mount(globalThis.window.PlatformPartnerRow, {
    row,
    P,
    onDone: () => {
      reloaded += 1;
    },
    flash: (t) => said.push(t),
  });
  assert.equal(textOf(byId(view.tree, "platform-partner-mark-ada-co")), "Mark $125.00 as paid");
  await view.press(byId(view.tree, "platform-partner-mark-ada-co").props.onClick);
  assert.equal(calls.filter((c) => c.startsWith("paid:")).length, 0, "arming is not doing");
  assert.match(textOf(byId(view.tree, "platform-partner-pay-ada-co-confirm")), /Nothing is sent/);
  assert.equal(byId(view.tree, "platform-partner-pay-ada-co-yes").props.disabled, true, "not without a reference");
  view.type(byId(view.tree, "platform-partner-pay-ada-co-typed"), "  bank-ref-1  ");
  assert.equal(byId(view.tree, "platform-partner-pay-ada-co-yes").props.disabled, false);
  await view.press(byId(view.tree, "platform-partner-pay-ada-co-yes").props.onClick);
  assert.deepEqual(
    calls.filter((c) => c.startsWith("paid:")),
    [`paid:${P1}:ada-co:usd:bank-ref-1:12500`],
  );
  assert.equal(reloaded, 1);
  assert.equal(said.length, 1);
});

test("a partner owed nothing, or owed less than refunds took, has no payout button", () => {
  const [none, under] = platformPartnerRows([
    balance({ currency: null, held_cents: 0, payable_cents: 0 }),
    balance({ payable_cents: -3000 }),
  ]);
  for (const row of [none, under]) {
    const view = mount(globalThis.window.PlatformPartnerRow, { row, P: partnerApi([], null), onDone() {}, flash() {} });
    assert.equal(byId(view.tree, "platform-partner-mark-ada-co"), null);
  }
  assert.equal(none.money, "Nothing earned yet.");
  assert.match(under.money, /^-\$30\.00 to come off the next payout/);
});

test("a person's decision on a brought workspace asks why, and disqualifying is the red one", async () => {
  const calls = [];
  const P = partnerApi([], null, calls);
  let reloaded = 0;
  const view = mount(globalThis.window.PlatformPartnerStandingRow, {
    ws: brought(),
    name: "Bayside Salon",
    P,
    onDone: () => {
      reloaded += 1;
    },
    flash() {},
  });
  assert.ok(byId(view.tree, "platform-standing-arm-qualified-b"));
  assert.ok(byId(view.tree, "platform-standing-arm-disqualified-b"));
  assert.equal(byId(view.tree, "platform-standing-arm-review-b"), null, "never the standing it already has");
  await view.press(byId(view.tree, "platform-standing-arm-disqualified-b").props.onClick);
  const confirm = byId(view.tree, "platform-standing-disqualified-b-confirm");
  assert.match(confirm.props.className, /confirm-danger/);
  assert.match(textOf(confirm), /What was paid stays paid/);
  assert.equal(byId(view.tree, "platform-standing-disqualified-b-yes").props.disabled, true, "not without why");
  view.type(byId(view.tree, "platform-standing-disqualified-b-typed"), "Same owner as the partner.");
  await view.press(byId(view.tree, "platform-standing-disqualified-b-yes").props.onClick);
  assert.deepEqual(calls, ["standing:b:disqualified:Same owner as the partner."]);
  assert.equal(reloaded, 1);
});

test("pausing a partner asks why, is the red one, and is offered once per partner, never on a second currency's line", async () => {
  const calls = [];
  const P = partnerApi([], null, calls);
  const [usd, eur] = platformPartnerRows([balance(), balance({ currency: "eur" })]);
  const second = mount(globalThis.window.PlatformPartnerRow, { row: eur, P, onDone() {}, flash() {} });
  assert.equal(byId(second.tree, "platform-partner-arm-paused-ada-co"), null);
  let reloaded = 0;
  const view = mount(globalThis.window.PlatformPartnerRow, {
    row: usd,
    P,
    onDone: () => {
      reloaded += 1;
    },
    flash() {},
  });
  assert.ok(byId(view.tree, "platform-partner-arm-closed-ada-co"));
  assert.equal(byId(view.tree, "platform-partner-arm-active-ada-co"), null, "an active partner is not restored");
  await view.press(byId(view.tree, "platform-partner-arm-paused-ada-co").props.onClick);
  const confirm = byId(view.tree, "platform-partner-status-paused-ada-co-confirm");
  assert.match(confirm.props.className, /confirm-danger/);
  assert.match(textOf(confirm), /become a viewer on every workspace they brought/);
  assert.equal(byId(view.tree, "platform-partner-mark-ada-co"), null, "one question at a time");
  assert.equal(byId(view.tree, "platform-partner-status-paused-ada-co-yes").props.disabled, true, "not without why");
  view.type(byId(view.tree, "platform-partner-status-paused-ada-co-typed"), "Reported by an owner.");
  await view.press(byId(view.tree, "platform-partner-status-paused-ada-co-yes").props.onClick);
  assert.deepEqual(calls, [`status:${P1}:ada-co:paused:Reported by an owner.`]);
  assert.equal(reloaded, 1);
});
