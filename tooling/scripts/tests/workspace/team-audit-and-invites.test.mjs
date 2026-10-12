/**
 * Two things a workspace could not answer.
 *
 * "Who changed this person's role?" — decisions recorded every conversation
 * verb and nothing about the team, which is the one table where reconstructing
 * who did what afterwards is hardest and matters most. Promoting someone to
 * owner hands them billing, the power to remove everyone else, and the
 * receptionist's voice.
 *
 * "Why did my invitation never arrive?" — acceptance ran only when the caller
 * had NO memberships, so anyone who acquired one first was stranded silently.
 * Self-serve workspace creation, shipped two changes ago, turned that from
 * exotic into ordinary: someone invited before they had an account, who signs
 * up and creates their own workspace, holds a membership by the time the
 * invitation is looked at. It was never honoured, nobody was told, and the
 * owner who sent it saw "pending" forever.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DECISION_SUBJECTS, DECISION_VERBS } from "@chanlytics/contracts";
import { readRaw, readCode } from "../_source.mjs";

const sql = readRaw("supabase/migrations/00023_team_audit_and_invite_lookup.sql");
const service = readCode("apps/dashboard/src/server/workspace/team.ts");
const workspaces = readCode(
  "apps/dashboard/app/api/v1/workspaces/route.ts",
  "apps/dashboard/src/server/workspace/workspace-list.ts",
);
const teamIdRoute = readCode("apps/dashboard/app/api/v1/team/[id]/route.ts");

/* ------------------------------ the audit trail --------------------------- */

test("the ledger accepts team subjects and verbs, in BOTH places", () => {
  // The database rejects a verb the enum allows; the enum blocks a verb the
  // database allows from any typed caller. They have to move together.
  for (const v of ["invite", "revoke_invite", "change_role", "remove_member"]) {
    assert.ok(DECISION_VERBS.includes(v), `contracts is missing ${v}`);
    assert.ok(sql.includes(`'${v}'`), `the CHECK is missing ${v}`);
  }
  for (const s of ["membership", "invitation"]) {
    assert.ok(DECISION_SUBJECTS.includes(s), `contracts is missing ${s}`);
    assert.ok(sql.includes(`'${s}'`), `the CHECK is missing ${s}`);
  }
});

test("no second audit table — one ledger, one shape, one place to look", () => {
  assert.ok(!/create table .*audit/i.test(sql));
  assert.match(sql, /alter table public\.decisions drop constraint if exists decisions_verb_check;/);
});

// The team's changes and their rows are one transaction in the database now (00277: team_change_role, team_remove,
// team_join, team_invite), each run and its rules proved on a real Postgres by
// database/team-changes-and-their-audit.db.test.mjs, and the service's half by team-writes.test.mjs.

test("the routes hand the caller through", () => {
  assert.match(teamIdRoute, /setMemberRole\(\s*ctx,/);
  assert.match(teamIdRoute, /removeMember\(\s*ctx,/);
});

/* --------------------------- the stranded invite -------------------------- */

test("REGRESSION: acceptance is no longer gated on having no memberships, and is no longer the workspace list's", () => {
  // `!data?.length &&` was the strand. Self-serve workspace creation made it
  // the ordinary path rather than an edge case. The acceptance is its own POST
  // now (decision 0047, lane 6: a read never writes, so the list neither looks
  // up an invitation nor seats anyone, cross-site or not), and still never
  // gated on having no memberships.
  assert.ok(
    !workspaces.includes("acceptOpenInvites") && !workspaces.includes("openInvitesFor"),
    "the list seats nobody",
  );
  assert.ok(!workspaces.includes("!data?.length && (await acceptOpenInvites"), "the membership gate is the bug");
  assert.ok(
    service.includes("acceptOpenInvites(ctx.userId, ctx.email ?? null)") &&
      !service.includes("data?.length && (await acceptOpenInvites"),
    "the accept takes whatever is open for the address, however many workspaces the person is in already",
  );
});

test("an open invitation, run: the list read seats nobody, whoever asks; the accept seats the person in every workspace that invited them, says which, and finishes once; the list read after it holds the seat", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
  const { fakeDb } = await import("../_fake-db.mjs");
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
  const { GET } = await import(at("apps/dashboard/app/api/v1/workspaces/route.ts"));
  const accepting = await import(at("apps/dashboard/app/api/v1/me/invitations/accept/route.ts"));
  const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
  const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
  setRateStore(memoryStore());
  const USER = "99999999-9999-4999-8999-999999999999";
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  // One world under both clients: the session's (RLS stands in for nothing here) and the service role's, which accepts.
  const world = {
    memberships: [
      { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
    ],
    tenants: [
      { id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" },
      { id: B, slug: "luna", name: "Luna", status: "active", timezone: "Europe/Madrid" },
    ],
    profiles: [],
    events: [],
    invitations: [
      {
        id: "i-1",
        tenant_id: B,
        role: "operator",
        email: "ada@example.com",
        accepted_at: null,
        revoked_at: null,
        expires_at: "2999-01-01T00:00:00Z",
      },
    ],
  };
  setServiceClient(fakeDb(world));
  const ctx = {
    supabase: fakeDb(world, {}, { is_platform_admin: () => false }),
    userId: USER,
    email: "Ada@Example.com",
    aal: "aal2",
    params: {},
    headers: {},
  };
  const read = (site) =>
    GET.run(
      new Request("http://localhost/api/v1/workspaces?workspace=harbor", { headers: { "sec-fetch-site": site } }),
      ctx,
    );
  const accept = () =>
    accepting.POST.run(new Request("http://localhost/api/v1/me/invitations/accept", { method: "POST" }), ctx);
  const roleIn = (answer, id) => answer.workspaces.find((w) => w.id === id)?.role ?? null;
  try {
    // A read never writes: the app's own read of the list, and a cross-site one, seat nobody, stamp nothing, tell nothing.
    for (const site of ["cross-site", "same-origin"]) {
      const listed = await read(site);
      assert.equal(roleIn(listed, B), null, `a ${site} read seats nobody`);
      assert.equal(roleIn(listed, A), "owner");
    }
    assert.equal(world.invitations[0].accepted_at, null, "and stamps nothing");
    assert.equal(world.memberships.length, 1);
    assert.deepEqual(world.events, [], "and writes nothing to the ledger");

    const seated = await accept();
    assert.deepEqual(
      seated,
      { joined: [{ id: B, name: "Luna", role: "operator" }] },
      "the accept says which workspace it seated them in, as the shell says it: You joined Luna",
    );
    const home = await read("same-origin");
    assert.equal(roleIn(home, B), "operator", "the list read after it says the seat the invitation made");
    assert.equal(roleIn(home, A), "owner");
    assert.equal(home.activeWorkspaceId, A, "the tab stays where it asked to be");
    assert.equal(home.user.role, "owner");
    assert.ok(world.invitations[0].accepted_at, "the invitation is stamped accepted");
    assert.equal(world.memberships.length, 2);
    assert.deepEqual(
      world.events.map((e) => [e.tenant_id, e.kind, e.subject_type, e.subject_id, e.data]),
      [[B, "member.joined", "invitation", "i-1", { by: USER, role: "operator" }]],
      "REGRESSION: the ledger kept the invitation and never that anybody arrived",
    );

    const again = await accept();
    assert.deepEqual(again, { joined: [] }, "an accepted invitation is not accepted again, and the shell says nothing");
    assert.equal(world.memberships.length, 2);
    assert.equal(roleIn(await read("same-origin"), B), "operator");
    assert.equal(world.events.length, 1, "and is said once");
  } finally {
    setServiceClient(null);
  }
});

test("a person with no address, or none open, is seated nowhere and told nothing", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
  const { fakeDb } = await import("../_fake-db.mjs");
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
  const { joinFromInvitations } = await import(at("apps/dashboard/src/server/workspace/team.ts"));
  const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
  const USER = "99999999-9999-4999-8999-999999999999";
  const world = { memberships: [], tenants: [], events: [], invitations: [] };
  try {
    setServiceClient(fakeDb(world));
    const as = (email) => ({ supabase: fakeDb(world), userId: USER, email, aal: "aal2" });
    assert.deepEqual(await joinFromInvitations(as(undefined)), { joined: [] }, "no address, no invitation to find");
    assert.deepEqual(await joinFromInvitations(as("ada@example.com")), { joined: [] }, "nothing open for it");
    assert.deepEqual([world.memberships, world.events], [[], []], "and nothing written");
  } finally {
    setServiceClient(null);
  }
});

test("an acceptance is finished by whoever accepts next: the news before the stamp, so an accept that died between the seat and its news is not the last (S1-19)", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
  const { fakeDb } = await import("../_fake-db.mjs");
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
  const { joinFromInvitations } = await import(at("apps/dashboard/src/server/workspace/team.ts"));
  const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
  const USER = "99999999-9999-4999-8999-999999999999";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const open = () => ({
    id: "i-1",
    tenant_id: B,
    role: "operator",
    email: "ada@example.com",
    accepted_at: null,
    revoked_at: null,
    expires_at: "2999-01-01T00:00:00Z",
  });
  // The accept, as the route makes it: the person on their own session, the seats written as the service role.
  const accept = (w) =>
    joinFromInvitations({ supabase: fakeDb(w), userId: USER, email: "ada@example.com", aal: "aal2" });
  const world = (over = {}) => ({
    memberships: [],
    tenants: [{ id: B, slug: "luna", name: "Luna", status: "active", timezone: "Europe/Madrid" }],
    events: [],
    invitations: [open()],
    ...over,
  });
  try {
    // The seat is taken and the news written, then the stamp: in that order, so the ledger has the news whenever the invitation is closed.
    const first = world();
    setServiceClient(fakeDb(first));
    assert.equal((await accept(first)).joined.length, 1);
    assert.equal(first.memberships.length, 1);
    assert.deepEqual(
      first.events.map((e) => [e.tenant_id, e.kind, e.subject_type, e.subject_id, e.data]),
      [[B, "member.joined", "invitation", "i-1", { by: USER, role: "operator" }]],
    );
    assert.ok(first.invitations[0].accepted_at, "stamped once the news is on the ledger");

    // A read that died after the seat and before the news: the next finds the seat held (23505) and the ledger without the
    // news, writes it, and stamps. The owner's bell line follows the event (core SUBSCRIBERS.team_notice).
    const died = world({
      memberships: [{ tenant_id: B, user_id: USER, role: "operator", created_at: "2026-10-06T00:00:00Z" }],
    });
    setServiceClient(fakeDb(died));
    assert.equal((await accept(died)).joined.length, 1);
    assert.equal(died.memberships.length, 1, "no second seat");
    assert.deepEqual(
      died.events.map((e) => [e.kind, e.subject_id]),
      [["member.joined", "i-1"]],
      "REGRESSION: a seat taken and an event never written left the owner told of nothing, for good",
    );
    assert.ok(died.invitations[0].accepted_at);

    // And a read that finds the news there already writes none: its own earlier try, or a second tab's.
    const told = world({
      memberships: [{ tenant_id: B, user_id: USER, role: "operator", created_at: "2026-10-06T00:00:00Z" }],
      events: [
        {
          id: "e-1",
          tenant_id: B,
          kind: "member.joined",
          category: "team",
          subject_type: "invitation",
          subject_id: "i-1",
          data: { by: USER, role: "operator" },
        },
      ],
    });
    setServiceClient(fakeDb(told));
    assert.equal((await accept(told)).joined.length, 1);
    assert.equal(told.events.length, 1, "said once");
    assert.ok(told.invitations[0].accepted_at, "and the invitation is closed");

    // The news cannot be written: the invitation stays open, so the next accept tries again, and nothing is counted.
    const failing = world();
    setServiceClient(fakeDb(failing, { "events.insert": { message: "connection reset" } }));
    assert.equal((await accept(failing)).joined.length, 0);
    assert.equal(failing.invitations[0].accepted_at, null, "an invitation whose news was not written is not closed");
    setServiceClient(fakeDb(failing));
    assert.equal((await accept(failing)).joined.length, 1);
    assert.equal(failing.events.length, 1, "the next accept writes it");
    assert.ok(failing.invitations[0].accepted_at);
  } finally {
    setServiceClient(null);
  }
});

test("the lookup that now runs every time has an index that fits it", () => {
  // The only index was (tenant_id, lower(email)) — email is the SECOND column,
  // so a cross-tenant lookup by email could not use it and scanned the table.
  assert.match(sql, /create index if not exists invitations_open_by_email\s*\n\s*on public\.invitations \(email\)/);
  assert.match(
    sql,
    /where accepted_at is null and revoked_at is null;/,
    "partial: settled invitations are never looked up this way",
  );
});

test("the index matches how the reader actually filters", () => {
  // A lower(email) expression index would silently stop serving `.eq("email")`.
  // Emails are lowercased by the invite route before they are stored, so the
  // plain column is correct — and that invariant is what makes it correct.
  assert.ok(service.includes('.eq("email", email.toLowerCase())'));
  const invite = readCode("apps/dashboard/app/api/v1/team/invite/route.ts");
  assert.ok(/\.trim\(\)\s*\.toLowerCase\(\)/.test(invite), "stored lowercased at the door");
});

/* ---- the card writes to the SERVER, not to the seeded roster ---- */
// The card is TSX (surfaces/settings/team/team.tsx, decision 0015 step 11), and the mockup's seeded roster left with the
// twin it fed: what these held of the seeded branches (that one never wrote on a real roster, that its undo stayed
// there) is now that there is no seeded branch, no write to the role store's roster and no undo at all.
{
  const { readCode } = await import("../_source.mjs");
  // The card, its presses (acts.tsx) and its invitation (invite.tsx): one card in three modules since 9 Oct 2026.
  const settings = readCode(
    "apps/dashboard/src/surfaces/settings/team/team.tsx",
    "apps/dashboard/src/surfaces/settings/team/acts.tsx",
    "apps/dashboard/src/surfaces/settings/team/invite.tsx",
  );
  const bridge = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  const seam = readCode("apps/dashboard/src/legacy-bridge/surfaces/settings.ts");

  test("invite, role change and remove call the API on a real roster", () => {
    // They mutated ST_STORE and toasted success on a pane fed by live data:
    // "Invite sent to x as Operator" while nothing was sent, stored or
    // audited, and a demotion confirmed while the database still said owner.
    for (const verb of ["invite", "setRole", "remove", "resend", "leave"]) {
      assert.ok(settings.includes(`teamVerbs.${verb}(`), `${verb} must be called from the Team card`);
    }
    for (const door of [
      "invite: teamInvite",
      "setRole: teamSetRole",
      "remove: teamRemove",
      "resend: teamResend",
      "leave: teamLeave",
    ])
      assert.ok(bridge.includes(door), `through the bridge's doors: ${door}`);
  });

  test("the card never writes the role store's roster", () => {
    // The seeded roster is the mockup's, and it left with the twin: the card's only writes are its three doors.
    for (const write of ["addMember(", "removeMember(", "ST_STORE"]) assert.ok(!settings.includes(write), write);
  });

  test("no team write claims an undo it cannot perform", () => {
    // An invitation email cannot be recalled and a role change is the power to message customers, so the card waits
    // for the server and re-reads rather than predicting an outcome it would have to walk back.
    assert.ok(!settings.includes("undo:"), "no undo is offered at all");
  });

  test("pending invitations are published and rendered", () => {
    assert.ok(seam.includes("invites: w.__TEAM_INVITES ?? null"), "the seam must publish open invitations");
    assert.ok(settings.includes("read.invites"), "the card must render them");
  });

  test("service-layer rules reach the owner as their own sentence", () => {
    // last_owner / self_remove / not_found were plain Error strings, which
    // withRoute turns into a generic 500 "Something went wrong" — so the one
    // guard that protects a workspace from losing its last owner read as a
    // crash.
    const service = readCode("apps/dashboard/src/server/workspace/team.ts");
    assert.ok(!/throw new Error\("(last_owner|self_remove|not_found)"\)/.test(service));
    assert.ok(service.includes("AppError"), "team rules must throw AppError");
  });
}
