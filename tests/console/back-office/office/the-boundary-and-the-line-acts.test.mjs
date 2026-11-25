/**
 * The back office's boundary: one door, every platform route asking the database who calls, support seeing the
 * customer's own Setup and no member's email, and the line acts offered only where they would run, saying their cost.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupSteps, platformLineActions, platformActionWarning } from "@chanlytics/contracts";
import { importSrc, readCode, readRaw } from "../../../_source.mjs";
import { fakeDb } from "../../../_fake-db.mjs";
import { setupDtoFor } from "../../../../apps/dashboard/src/server/setup/setup.ts";
import {
  GUARDED,
  ME,
  PlatformLine,
  SETUP_FIXTURE,
  SetupAndLines,
  TENANT,
  WorkspaceScreen,
  WorkspacesScreen,
  ago,
  api,
  attnRows,
  backOffice,
  byId,
  consoleVerbs,
  homeOf,
  line,
  live,
  mount,
  segmentedIn,
  textOf,
  workspaceRows,
  workspaceTables,
} from "./_office.mjs";

/* ------------------------------- the boundary ------------------------------ */

test("one door: the check is the first statement, and the inner join is not reachable", () => {
  // Who may look across workspaces is the database's, asked about the caller alone (is_platform_admin, redefined by
  // 00467 as platform_staff_state): a staff member who showed a second factor, never a password alone, never an owner
  // -- proved on the stack (console/console.db.test.mjs); the overview refused to anyone else, run through the route
  // (console/back-office/platform-routes.test.mjs, "the back office's door"). Pinned as 00091's and 00092's text until
  // 25 Nov 2026, which later migrations had replaced.
  const three = readRaw("supabase/migrations/00093_the_inner_join_is_not_a_door.sql");
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
    // `runPlatformLineAct(` -- the only WRITE on this surface, and the one that
    // touches another business's carrier registration and phone number -- was not
    // in it. A write added tomorrow with its guard below the call would have
    // passed, which is the opposite of what this test's own header promises.
    // Every helper the route imports from the platform module has to come after
    // the handle it needs.
    // The Console's modules behind the door (decisions 0066, 0067, 0068): platform, its acts, its reads, its requests,
    // Support, Health, and what the finder set aside (decision 0133).
    const imported = [
      ...src.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*"@\/server\/console\/(?:platform|acts|console|requests|support|health|set-aside)"/g,
      ),
    ];
    assert.ok(imported.length, `${path.basename(path.dirname(file))}: nothing imported from @/server/console`);
    const helpers = imported
      .flatMap((m) => m[1].split(","))
      .map((x) => x.trim())
      .filter((x) => x && x !== "backOffice");
    assert.ok(helpers.length > 0, `${path.basename(path.dirname(file))}: only the guard is imported`);
    for (const fn of helpers) {
      const i = src.indexOf(`${fn}(`, guard === -1 ? 0 : 0);
      if (i !== -1) assert.ok(guard < i, `${path.basename(path.dirname(file))}: ${fn}() runs before the check`);
    }
    // No workspace scoping: this surface is about workspaces the caller is not
    // in, so getMemberContext would be a category error rather than a safeguard.
    assert.ok(
      !src.includes("getMemberContext("),
      `${path.basename(path.dirname(file))}: platform routes are not workspace-scoped`,
    );
  }
});

// The guard asks the database (platform_staff_state, 00467), answers 404 rather than 403 to a customer who guessed the
// address, sends staff without a second factor to show it, and says a database that cannot answer is not a no: run
// through the routes in console/console-routes.test.mjs ("who may open the Console") and
// console/back-office/platform-routes.test.mjs ("the back office's door", "behind the door: the overview is the
// database's own list"). Pinned as the guard's text until 25 Nov 2026.

test("support sees the customer's own Setup, from the customer's own function", () => {
  // The claim this surface makes is that support and the customer are looking
  // at the same rows. That is only true while it is literally one function, so
  // the assembly was lifted out of the route rather than copied.
  const assembly = ["apps/dashboard/src/server/setup/channel-rows.ts", "apps/dashboard/src/server/setup/setup.ts"]
    .map((p) => readCode(p))
    .join("\n");
  assert.match(assembly, /export async function setupDtoFor\(/);
  assert.match(
    assembly,
    /supabase: SupabaseClient<Database>/,
    "the client is an argument, so either caller may pass its own",
  );

  // The customer's route reads through its reader (readers/connections.ts), which is where the call now is; the
  // route and the reader are held to the one assembly alike. ask/readers/ runs the route: setupDtoFor's own reads.
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
  assert.match(office, /listPlatformEvents\(office, id\)/, "with the trail emitEvent has been writing all along");
  assert.ok(!office.includes('supabase.from("tenant_config")'), "no second assembly");
});

test("the nav's one bit rides on the payload the seam already fetches", () => {
  const route = readCode(
    "apps/dashboard/app/api/v1/workspaces/route.ts",
    "apps/dashboard/src/server/workspace/list.ts",
  );
  // Read beside the boot's other reads, not after them (2 Oct 2026): one of the answers the route awaits together.
  assert.match(
    route,
    /\[tenants, profileRead, platformAdmin, [\s\S]*?\] = await Promise\.all\(\[[\s\S]*?isPlatformAdmin\(ctx\),/,
  );
  assert.match(route, /platform_admin: platformAdmin/);
  // Both exits carry it: the one with workspaces and the one for somebody who
  // has none yet. A missing field reads as false and hides the tab from an
  // admin whose only workspace was removed.
  assert.equal((route.match(/platform_admin: platformAdmin/g) ?? []).length, 2);
  const bridge = readCode("apps/dashboard/src/bridge/who.ts");
  assert.match(bridge, /platform_admin\?: boolean;/);
  // It is not the authorization, and the comment says so where somebody would
  // otherwise be tempted to trust it.
  assert.match(readRaw("apps/dashboard/src/server/workspace/list.ts"), /NOT the authorization/);
});

test("the back office's Setup read touches no function that asks who is signed in", async () => {
  // THE DEFECT. setupDtoFor took a `role: string` and the back office passed
  // "owner", which routed it through getTeamRoster -> the `team_roster` RPC, whose
  // FIRST statement checks auth.uid() against memberships. On the service client
  // that is null, so Postgres raised 42501, getTeamRoster rethrew, and every single
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
  assert.equal(setup.team.invites_open, 1, "and the open invitations");
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
  assert.deepEqual(Object.keys(setup.team).sort(), ["alert_emails", "invites_open", "members"]);
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
  assert.equal(setup.team.invites_open, 1);
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
  // Who answers: the partner is on the team to set it up, never the one who backs the owner up.
  assert.equal(mine.team.members, 1, "the owner alone answers");
  const tables = workspaceTables();
  const withPartner = {
    ...tables,
    memberships: [...tables.memberships, { id: "m3", tenant_id: TENANT, role: "partner" }],
  };
  const theirs = await setupDtoFor(fakeDb(withPartner), TENANT, { kind: "back_office" });
  assert.equal("partner" in theirs.team, false);
  assert.equal(theirs.team.members, 2, "support counts who answers as the owner reads it: the partner counted out");
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
  const src = readCode(...GUARDED);
  assert.ok(
    !/export function platformDb|export async function platformDb/.test(src),
    "REGRESSION: a service-role client handed to any importer",
  );
  assert.match(
    src,
    /import \{ serviceDb \} from "\.\/service-db";/,
    "the dashboard's one service client, kept to this module",
  );
  assert.ok(!/export .*serviceDb/.test(src));
  // The only way to a client is a handle only the check can make, and the brand
  // stops an object literal standing in for one.
  assert.match(src, /declare const backOfficeBrand: unique symbol;/);
  assert.match(src, /export async function getBackOffice\(ctx: RouteContext\): Promise<BackOffice>/);
  assert.match(src, /const state = await staffState\(ctx\);/);
  // Every cross-tenant read takes the handle rather than reaching for a client.
  for (const [fn, tail] of [
    ["listPlatformOverview", "\\)"],
    ["findPlatformTenant", ","],
    ["listPlatformEvents", ","],
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\(\\s*office: BackOffice\\s*${tail}`), fn);
  }
  // A database that cannot answer is not a "no". Telling a real admin "No such
  // page" during a Postgres hiccup is the moment they opened this for.
  assert.match(src, /if \(error\) throw new AppError\("unavailable", /);
  // And the unbounded event payload does not go to the browser to be discarded: the read is packages/db's (decision 0111).
  const reads = readCode("packages/db/src/repositories/ops/console.ts");
  assert.match(src, /listWorkspaceEvents\(office\.db, tenantId, limit\)/);
  assert.match(reads, /\.select\("kind, category, subject_type, created_at"\)/);
  assert.ok(!/select\("kind, category, subject_type, created_at, data"\)/.test(reads));
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
    // Its own operation, named in its own file, not taken from the request, and the Console's act it is.
    assert.ok(
      src.includes(`runPlatformLineAct(office, "${action}", heldTenantId(input.tenant_id), input.line_id, input.why)`),
      `${action}: the action is a literal`,
    );
    assert.ok(src.includes(`act: LINE_ACTS.${action},`), `${action}: the act its role is asked for`);
    assert.ok(!/body\.(op|action)/.test(src), `${action}: the caller must not choose the operation`);
    assert.ok(src.includes("scope: platform,"), `${action}: no admin check`);
    assert.ok(src.indexOf("scope: platform,") < src.indexOf("runPlatformLineAct("), `${action}: the check runs first`);
    assert.ok(src.includes('rate: "platform_line_'), `${action}: rate-limited`);
    assert.ok(src.includes("input: LineActSchema,"), `${action}: both ids, and why, are judged by the schema`);
    assert.ok(!src.includes("getMemberContext("), `${action}: this surface is about workspaces the caller is not in`);
  }

  // And the edge operation each one maps to is a written-out list rather than a
  // parameter somebody can widen by accident.
  const server = readCode("apps/dashboard/src/server/console/platform.ts");
  assert.match(
    server,
    /const EDGE_OP: Record<PlatformLineAction, \(tenantId: TenantId, lineId: string\) => EdgeBody<"\/api\/admin\/lines">>/,
  );
  assert.match(server, /refile: \(tenant_id, line_id\) => \(\{ op: "register", tenant_id, line_id, refile: true \}\)/);
  assert.match(
    server,
    /replace: \(tenant_id, line_id\) => \(\{ op: "register", tenant_id, line_id, refile: true, replace: true \}\)/,
  );
  assert.ok(!/op: (body|action|op)\b/.test(server), "the op is never taken from the caller");
});

// No cross-tenant action happens that nobody can be held to: an act is written down with who, their role, where and
// why before it runs, and an act whose log row cannot be written does not run -- run through the routes in
// console/console-routes.test.mjs. Pinned as platform.ts's text until 25 Nov 2026.

test("the back office is read on demand, not published to every browser", async () => {
  // A surface would make every customer's browser fetch a page it will never be
  // allowed to see, on every boot, for two accounts' benefit.
  const bridge = readCode("apps/dashboard/src/bridge/platform.ts");
  assert.ok(!bridge.includes("SurfaceOverride"), "not a surface");
  assert.ok(
    bridge.includes("rows: platformRows") && bridge.includes("steps: setupSteps"),
    "the judgement and the customer's rows both come from contracts",
  );
  // Nothing reads the verbs off the window (the pane imports them), so nothing publishes them there (O4b).
  assert.ok(!bridge.includes("installPlatform"), "no window name for the verbs");
  assert.ok(!readCode("apps/dashboard/src/bridge/FrameApp.tsx").includes("installPlatform"));
  // Classified as a real PANE of Settings -- without that line the shell's
  // honesty gate fell through to the page's "demo" and a platform admin who
  // clicked Back office got the Not-in-this-release card -- but never as a
  // SURFACE of its own: it waits for who is looking alone, as every pane drawn from none of the settings read does
  // since #1890, and nothing fetches the back office at boot.
  const registry = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  assert.equal(registry.SURFACE_STATES["admin/platform"], "real", "the pane is reachable");
  assert.equal(registry.ROUTE_SURFACE["admin/platform"], "workspace", "and it waits for who is looking");
  assert.ok(!JSON.stringify(registry).includes('"platform"'), "no surface of its own, so none is fetched at boot");
});

test("the list is the contract's judgement, grouped by who the next move is with, in the row the rest of the app uses", async () => {
  backOffice.verbs = api([]);
  const tenants = [
    live({ tenant_id: "a", slug: "all-good", name: "All Good" }),
    live({
      tenant_id: "b",
      slug: "broken-co",
      name: "Broken Co",
      voice_state: "failed",
      line_error: "Twilio refused the number: 21422",
    }),
    live({ tenant_id: "c", slug: "smoke", name: "Smoke", status: "test" }),
  ];
  consoleVerbs.home = async () => ({ ok: true, data: homeOf(tenants) });
  const page = mount(WorkspacesScreen, { go: () => {}, flash: () => {} });
  assert.match(textOf(page.tree), /Reading/, "nothing is shown before it is read");
  await page.settle();
  // The broken one first, whatever it is called; our own workspace last, in a group of its own.
  const rows = workspaceRows(page.tree);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["Broken Co", "All Good", "Smoke"],
  );
  assert.deepEqual(
    rows.map((r) => r.verdict),
    ["broken", "live", "test"],
  );
  assert.ok(byId(page.tree, "console-group-needs_us") && byId(page.tree, "console-group-ours"));
  // The sentence is the verdict's, unchanged -- the provider's own words reach the screen rather than a category.
  assert.match(rows[0].sentence, /Twilio refused the number: 21422/);
  assert.match(textOf(page.tree), /2 workspaces · 1 live · 1 on us/);
});

test("a refusal is the ordinary answer, and it does not look like an empty platform", async () => {
  backOffice.verbs = api([]);
  consoleVerbs.home = async () => ({ ok: false, message: "No such page.", missing: true });
  const page = mount(WorkspacesScreen, { go: () => {}, flash: () => {} });
  await page.settle();
  assert.match(textOf(page.tree), /No such page/, "what the route said, said plainly");
  assert.equal(workspaceRows(page.tree).length, 0);
  assert.doesNotMatch(textOf(page.tree), /No workspaces yet/);
});

test("REGRESSION (S10): a list that cannot be read says so with a Retry, and never says there are no workspaces", async () => {
  backOffice.verbs = api([]);
  let fail = true;
  let reads = 0;
  const harbor = live({ tenant_id: "a", slug: "harbor-moving", name: "Harbor Moving" });
  consoleVerbs.home = async () => {
    reads += 1;
    return fail
      ? { ok: false, message: "The platform could not be read.", missing: false }
      : { ok: true, data: homeOf([harbor]) };
  };
  const page = mount(WorkspacesScreen, { go: () => {}, flash: () => {} });
  await page.settle();
  assert.match(textOf(page.tree), /The platform could not be read/);
  assert.ok(!/No workspaces yet/.test(textOf(page.tree)), "REGRESSION: a failed read said the platform was empty");
  const retry = byId(page.tree, "console-workspaces-failed-retry");
  assert.ok(retry, "and it can be read again from where it failed");
  fail = false;
  await page.act(retry);
  assert.equal(reads, 2);
  assert.equal(workspaceRows(page.tree).length, 1, "and the rows arrive");
  assert.equal(byId(page.tree, "console-workspaces-failed"), null);
});

test("REGRESSION (S10): a read that throws is a failed read, not a page reading for ever", async () => {
  backOffice.verbs = api([]);
  consoleVerbs.home = async () => {
    throw new Error("socket hang up");
  };
  const page = mount(WorkspacesScreen, { go: () => {}, flash: () => {} });
  await page.settle();
  assert.ok(!/Reading/.test(textOf(page.tree)), "REGRESSION: a thrown read left the page reading");
  assert.ok(byId(page.tree, "console-workspaces-failed"));
});

test("REGRESSION (S10): a workspace that cannot be read says so with its Retry, instead of reading for ever", async () => {
  backOffice.verbs = api([]);
  let reads = 0;
  consoleVerbs.workspace = async () => {
    reads += 1;
    return { ok: false, message: "Could not be read right now.", missing: false };
  };
  const page = mount(WorkspaceScreen, {
    slug: "harbor-moving",
    tab: "overview",
    me: ME,
    go: () => {},
    flash: () => {},
  });
  await page.settle();
  assert.ok(!/Reading/.test(textOf(page.tree)), "REGRESSION: it read for ever");
  assert.match(textOf(byId(page.tree, "console-workspace-failed")), /Could not be read right now/);
  await page.act(byId(page.tree, "console-workspace-failed-retry"));
  assert.equal(reads, 2, "Retry reads that workspace again");
  // An address no workspace has is said as that, not as a failure.
  consoleVerbs.workspace = async () => ({ ok: false, message: "No workspace has that address.", missing: true });
  const missing = mount(WorkspaceScreen, { slug: "nobody", tab: "overview", me: ME, go: () => {}, flash: () => {} });
  await missing.settle();
  assert.ok(byId(missing.tree, "console-workspace-missing"));
});

test("finding a workspace by name or slug, because that is what a support call starts with", async () => {
  backOffice.verbs = api([]);
  consoleVerbs.home = async () => ({
    ok: true,
    data: homeOf([
      live({ tenant_id: "a", slug: "harbor-moving", name: "Harbor Moving" }),
      live({ tenant_id: "b", slug: "marisas-beauty-salon", name: "Marisa's Beauty Salon" }),
    ]),
  });
  const page = mount(WorkspacesScreen, { go: () => {}, flash: () => {} });
  await page.settle();
  assert.equal(workspaceRows(page.tree).length, 2);
  page.type(byId(page.tree, "console-workspaces-find"), "marisa");
  assert.deepEqual(
    workspaceRows(page.tree).map((r) => r.name),
    ["Marisa's Beauty Salon"],
  );
  page.type(byId(page.tree, "console-workspaces-find"), "harbor-mov");
  assert.deepEqual(
    workspaceRows(page.tree).map((r) => r.name),
    ["Harbor Moving"],
    "the slug matches too",
  );
  page.type(byId(page.tree, "console-workspaces-find"), "zzz");
  assert.equal(workspaceRows(page.tree).length, 0);
  assert.match(textOf(page.tree), /Nothing matches/);
});

test("a workspace's Setup and lines show the customer's own Setup rows, and no buttons that would act on ours", () => {
  backOffice.verbs = api([]);
  const view = mount(SetupAndLines, {
    setup: SETUP_FIXTURE,
    tenantId: "a",
    role: "owner",
    onChanged: () => {},
    flash: () => {},
  });
  // The rows are setupSteps' rows -- the customer's own view model, run for their workspace. Compared against the
  // function directly, so a second rendering cannot creep in.
  const want = setupSteps({ ...SETUP_FIXTURE, later: [] });
  const shown = attnRows(view.tree)
    .map((r) => r.props.testid)
    .filter((t) => String(t).startsWith("platform-setup-"));
  assert.deepEqual(
    shown,
    want.rows.map((r) => `platform-setup-${r.id}`),
  );
  assert.ok(want.rows.length >= 5, "a real set of rows, not an empty one");
  // Read-only: not one of those rows offers a verb. Setup's buttons act on the SIGNED-IN workspace, and this is
  // somebody else's.
  for (const r of attnRows(view.tree).filter((r) => String(r.props.testid).startsWith("platform-setup-"))) {
    assert.equal(r.props.cta ?? null, null, `${r.props.testid} offers a button`);
    assert.equal(r.props.also ?? null, null);
  }
  const text = textOf(view.tree);
  assert.match(text, /Their lines/);
  assert.match(text, /stopped at brand/, "where the registration stopped");
  assert.match(text, /the carriers refused it/, "and what the provider said");
});

test("acting on a line is never one click, says the cost before it is, and asks why", async () => {
  // This line's registration was REJECTED, so the action offered is the free edit -- and the ask has to say so rather
  // than quoting the rehearsal's $19.50.
  const calls = [];
  backOffice.verbs = api([], calls);
  const rejected = { ...SETUP_FIXTURE.lines.rows[0] };
  assert.equal(rejected.sms_state, "rejected", "the fixture is the case this is about");
  let reloaded = 0;
  const row = mount(PlatformLine, {
    line: rejected,
    tenantId: "a",
    role: "support",
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

  // Arming shows the cost and the reason ask, and does NOT act.
  await row.press(byId(row.tree, "platform-act-refile").props.onClick);
  const ask = byId(row.tree, "platform-refile-why");
  assert.ok(ask, "a cross-tenant write is never one click");
  assert.match(textOf(ask), /Nothing is spent/, "this one is an edit, so it says so");
  assert.ok(!textOf(ask).includes("19.50"), "REGRESSION: quoting the rehearsal's price for a free edit");
  assert.match(textOf(ask), /Written down against you before it runs/);
  assert.deepEqual(
    segmentedIn(ask).props.options.map((o) => o.value),
    ["ticket", "call", "found", "cleanup"],
    "why, in four answers",
  );
  assert.equal(calls.length, 0, "arming is not doing");

  // A ticket as the reason needs the ticket.
  row.choose(segmentedIn(byId(row.tree, "platform-refile-why")), "ticket");
  assert.equal(byId(row.tree, "platform-refile-yes").props.disabled, true, "not without the ticket");
  row.type(byId(row.tree, "platform-refile-why-ticket"), "R-1042");
  assert.equal(byId(row.tree, "platform-refile-yes").props.disabled, false);

  // Confirming acts, once, with the workspace and line it was shown for, and why.
  await row.press(byId(row.tree, "platform-refile-yes").props.onClick);
  assert.deepEqual(calls, ["act:refile:a:l1:ticket"]);
  assert.equal(reloaded, 1, "and the reads it made stale are re-read");
});
