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
  platformRows, platformSummary, platformNumber, textingWords,
  PLATFORM_VERDICTS, PLATFORM_QUIET_DAYS, PLATFORM_NEW_DAYS,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const NOW = Date.parse("2026-09-09T18:00:00Z");
const DAY = 86_400_000;
const ago = (d) => new Date(NOW - d * DAY).toISOString();

/** A workspace that is entirely fine, so every case below differs by one fact. */
const live = (over = {}) => ({
  tenant_id: "11111111-1111-1111-1111-111111111111",
  slug: "harbor-moving", name: "Harbor Moving", status: "active",
  timezone: "America/New_York", created_at: ago(90), members: 2,
  billing_mode: "stripe", billing_status: "active", trial_end: null, current_period_end: ago(-20),
  line_e164: "+19296566623", line_kind: "chanlytics", voice_state: "answering", sms_state: "active",
  reg_step: null, reg_mock: false, reg_sole_prop: false, line_error: null,
  whatsapp_number: "+19177724072", whatsapp_active: true,
  voice_number: "+19296566623", voice_active: true,
  last_inbound_at: ago(1),
  ...over,
});
const only = (over) => platformRows([live(over)], NOW)[0];

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
  assert.match(stalled.sentence, /one person in the workspace/, "a workspace of one that never started is a different call");
  assert.equal(PLATFORM_NEW_DAYS, 1);
  // Getting a number is not stalled: it is us, in progress.
  assert.equal(only({ ...off, voice_state: "provisioning", created_at: ago(9) }).facts.answering, "Getting a number");
});

test("the states whose next move is the owner's say the words the owner is being shown", () => {
  for (const sms_state of ["needs_record", "otp_waiting", "rejected"]) {
    const r = only({ sms_state, line_error: sms_state === "rejected" ? "the website could not be reached" : null });
    assert.equal(r.verdict, "waiting_owner", sms_state);
    // THE point of the whole surface: not a paraphrase. The literal sentence
    // on the customer's own texting row, so support and customer cannot end up
    // describing the same state differently on the same call.
    assert.equal(r.sentence, textingWords({ sms_state, reg_mock: false, reg_sole_prop: false }).sentence, sms_state);
  }
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
  const rows = platformRows([
    live({ tenant_id: "a", name: "All Good" }),
    live({ tenant_id: "b", name: "Broken Co", voice_state: "failed", line_error: "boom" }),
    live({ tenant_id: "c", name: "Zed Quiet", last_inbound_at: ago(40) }),
    live({ tenant_id: "d", name: "Smoke", status: "test" }),
    live({ tenant_id: "e", name: "Card Failed", billing_status: "past_due" }),
    live({ tenant_id: "f", name: "Also Quiet", last_inbound_at: ago(40) }),
  ], NOW);
  assert.deepEqual(rows.map((r) => r.name), ["Broken Co", "Card Failed", "Also Quiet", "Zed Quiet", "All Good", "Smoke"]);
  // Two workspaces in the same verdict are ordered by name, so the page does
  // not reshuffle under somebody reading it.
  assert.deepEqual(rows.filter((r) => r.verdict === "quiet").map((r) => r.name), ["Also Quiet", "Zed Quiet"]);
});

test("the one line at the top counts customers, not test workspaces", () => {
  const rows = platformRows([
    live({ tenant_id: "a", name: "A" }),
    live({ tenant_id: "b", name: "B", voice_state: "failed" }),
    live({ tenant_id: "c", name: "C", reg_mock: true }),
    live({ tenant_id: "d", name: "D", billing_status: "unpaid" }),
    live({ tenant_id: "e", name: "E", status: "test" }),
  ], NOW);
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
  assert.equal(only({ reg_sole_prop: true }).facts.texting, "On (sole proprietor)", "the capped registration is named where support can see it");
  assert.equal(only({ line_e164: null, sms_state: "none" }).facts.texting, "No line");
  assert.equal(only({ sms_state: "needs_record" }).facts.texting, "needs record", "a state, in words, never the enum");
  assert.equal(only({ billing_status: "trialing", trial_end: "2026-09-30T00:00:00Z" }).facts.paying, "Trial to 2026-09-30");
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
  assert.ok(door.indexOf("if not public.is_platform_admin() then") < door.indexOf("return query"), "the check precedes the read");
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
  assert.match(three, /raise exception '00093: platform_overview_rows\(\) is still granted to/, "a grant that comes back fails the deploy");
});

test("every route under /api/v1/platform asks the database who is calling", () => {
  // The invariant the PRD's Risk section asks for, made mechanical: "every path
  // to it goes through the RPC's own check, so there is one thing to review
  // rather than one per route." A route added tomorrow without the guard fails
  // here rather than in production.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.join(here, "../../../apps/dashboard/app/api/v1/platform");
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
    assert.ok(src.includes("await requirePlatformAdmin(ctx);"), `${path.basename(path.dirname(file))}: no admin check`);
    // And it is the FIRST thing, before any read: a check after a query has
    // already run has leaked whatever the query returned into a log line.
    const guard = src.indexOf("await requirePlatformAdmin(ctx);");
    for (const read of ["platformOverview(", "platformTenant(", "platformEvents(", "setupDtoFor(", "platformDb("]) {
      const i = src.indexOf(read);
      if (i !== -1) assert.ok(guard < i, `${path.basename(path.dirname(file))}: ${read} runs before the check`);
    }
    // No workspace scoping: this surface is about workspaces the caller is not
    // in, so memberContext would be a category error rather than a safeguard.
    assert.ok(!src.includes("memberContext("), `${path.basename(path.dirname(file))}: platform routes are not workspace-scoped`);
  }
});

test("the guard asks the database, and answers 404 rather than 403", () => {
  const src = readCode("apps/dashboard/src/server/platform.ts");
  assert.match(src, /ctx\.supabase\.rpc\("is_platform_admin"\)/, "the answer comes from Postgres, not from an env var");
  assert.ok(!/process\.env\.[A-Z_]*ADMIN|PLATFORM_ADMIN|ALLOWLIST/.test(src), "no second answer that can disagree with the first");
  // A customer who guesses the URL learns nothing about whether there is a
  // back office behind it.
  assert.match(src, /AppError\("not_found", "No such page\.", 404\)/);
  assert.ok(!/AppError\("forbidden"/.test(src), "403 would confirm the surface exists");
  // The list read runs on the SESSION client on purpose: the RPC's check is
  // auth.uid(), so the service-role key opens nothing.
  assert.match(src, /export async function platformOverview\(ctx: RouteContext\)[\s\S]*?ctx\.supabase\.rpc\("platform_overview"\)/);
  // Nothing anywhere calls the inner join by name.
  assert.ok(!/platform_overview_rows/.test(src));
});

test("support sees the customer's own Setup, from the customer's own function", () => {
  // The claim this surface makes is that support and the customer are looking
  // at the same rows. That is only true while it is literally one function, so
  // the assembly was lifted out of the route rather than copied.
  const assembly = readCode("apps/dashboard/src/server/setup.ts");
  assert.match(assembly, /export async function setupDtoFor\(/);
  assert.match(assembly, /supabase: SupabaseClient<Database>/, "the client is an argument, so either caller may pass its own");

  const own = readCode("apps/dashboard/app/api/v1/setup/route.ts");
  assert.match(own, /setupDtoFor\(ctx\.supabase, member\.tenantId, member\.role\)/, "the customer reads their own on the session client");
  assert.ok(!own.includes("getTenantConfig"), "REGRESSION: the assembly is back inside the route, where a second copy can grow");

  const office = readCode("apps/dashboard/app/api/v1/platform/tenants/[id]/route.ts");
  assert.match(office, /setupDtoFor\(platformDb\(\), id, "owner"\)/, "and support reads theirs through the same function");
  assert.match(office, /platformEvents\(id\)/, "with the trail emitEvent has been writing all along");
  assert.ok(!office.includes("supabase.from(\"tenant_config\")"), "no second assembly");
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

test("the back office is read on demand, not published to every browser", () => {
  // A surface would make every customer's browser fetch a page it will never be
  // allowed to see, on every boot, for two accounts' benefit.
  const bridge = readCode("apps/dashboard/src/legacy-bridge/platform.ts");
  assert.match(bridge, /export function installPlatform/);
  assert.ok(!bridge.includes("SurfaceOverride"), "not a surface");
  assert.ok(bridge.includes("rows: platformRows") && bridge.includes("steps: setupSteps"), "the judgement and the customer's rows both come from contracts");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installPlatform();"));
  const registry = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.ok(!registry.includes("platform"), "and it is not in the surface registry");
});
