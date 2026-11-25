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
import { DECISION_SUBJECTS, DECISION_VERBS, SCHEMA_SETS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { schemaOf } from "../_schema.mjs";
import { bridgeHolds } from "../shell/_bridge-holds.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// The bridge's own client, over a wire that keeps what each request carried: the tab the Team card is pressed in.
globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/admin/team" };
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.window.dispatchEvent ??= () => true;
bridgeHolds({
  who: {
    workspaces: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
    activeWorkspaceId: "t1",
  },
});
/** Every request the tab made: `METHOD path` and the body it carried. */
const wire = [];
globalThis.window.fetch = async (url, init = {}) => {
  const where = new URL(String(url), "https://app.chanlytics.com").pathname.replace("/api/v1/", "");
  wire.push([`${init.method ?? "GET"} ${where}`, init.body ? JSON.parse(init.body) : null]);
  return new Response(JSON.stringify({ ok: true, data: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const { teamVerbs } = await import(at("apps/dashboard/src/bridge/inbox-verbs.ts"));
const teamRoute = await import(at("apps/dashboard/app/api/v1/team/[id]/route.ts"));
const inviteRoute = await import(at("apps/dashboard/app/api/v1/team/invite/route.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));

/* ------------------------------ the audit trail --------------------------- */

test("the ledger accepts team subjects and verbs, in BOTH places", () => {
  // The database rejects a verb the enum allows; the enum blocks a verb the
  // database allows from any typed caller. They have to move together. The database's side is its CHECK as the replay
  // builds it (schema-sets.generated.ts, which the Database workflow holds to the migrations); every verb contracts
  // names is one the check accepts, run on a real Postgres in conversations/media/recording-is-audited.db.test.mjs.
  for (const v of ["invite", "revoke_invite", "change_role", "remove_member"]) {
    assert.ok(DECISION_VERBS.includes(v), `contracts is missing ${v}`);
    assert.ok(SCHEMA_SETS["decisions.verb"].includes(v), `the CHECK is missing ${v}`);
  }
  for (const subject of ["membership", "invitation"]) {
    assert.ok(DECISION_SUBJECTS.includes(subject), `contracts is missing ${subject}`);
    assert.ok(SCHEMA_SETS["decisions.subject_type"].includes(subject), `the CHECK is missing ${subject}`);
  }
});

test("no second audit table — one ledger, one shape, one place to look", async () => {
  const { relations } = await schemaOf();
  assert.deepEqual(
    Object.keys(relations).filter((t) => /audit/i.test(t)),
    [],
    "the team's changes are the decisions ledger's rows",
  );
});

// The team's changes and their rows are one transaction in the database now (00277: team_change_role, team_remove,
// team_join, team_invite), each run and its rules proved on a real Postgres by
// database/team-changes-and-their-audit.db.test.mjs, and the service's half by team-writes.test.mjs.

test("the routes hand the caller through: the database is told who changed the role, and who removed whom", async () => {
  setRateStore(memoryStore());
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const M = "11111111-1111-4111-8111-111111111111";
  const USER = "99999999-9999-4999-8999-999999999999";
  const asked = [];
  setServiceClient(
    fakeDb(
      {},
      {},
      {
        team_change_role: (args) => (asked.push(["team_change_role", args]), { membership_id: M, role: args.p_role }),
        team_remove: (args) => (asked.push(["team_remove", args]), { removed: "member" }),
      },
    ),
  );
  const ctx = {
    supabase: fakeDb({
      memberships: [
        { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
      ],
    }),
    userId: USER,
    email: "ada@example.com",
    aal: "aal2",
    params: { id: M },
    headers: {},
  };
  const req = (method, body) =>
    new Request(`http://localhost/api/v1/team/${M}?workspace=${A}`, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    assert.deepEqual(await teamRoute.PATCH.run(req("PATCH", { role: "viewer" }), ctx), {
      membership_id: M,
      role: "viewer",
    });
    await teamRoute.DELETE.run(req("DELETE"), ctx);
    assert.deepEqual(asked, [
      ["team_change_role", { p_tenant_id: A, p_actor: USER, p_membership_id: M, p_role: "viewer" }],
      ["team_remove", { p_tenant_id: A, p_actor: USER, p_id: M }],
    ]);
  } finally {
    setServiceClient(null);
  }
});

/* --------------------------- the stranded invite -------------------------- */

// REGRESSION: acceptance is no longer gated on having no memberships (`!data?.length &&` was the strand: self-serve
// workspace creation made a person invited before they had an account hold a membership by the time the invitation was
// looked at), and is no longer the workspace list's (decision 0047, lane 6: a read never writes). Run below, by a person
// who already owns a workspace: the list read seats nobody, and the accept seats them where they were invited.

test("an open invitation, run: the list read seats nobody, whoever asks; the accept seats the person in every workspace that invited them, says which, and finishes once; the list read after it holds the seat", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
  const { fakeDb } = await import("../_fake-db.mjs");
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
  const { GET } = await import(at("apps/dashboard/app/api/v1/workspaces/route.ts"));
  const accepting = await import(at("apps/dashboard/app/api/v1/me/invitations/accept/route.ts"));
  const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
  const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
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
    supabase: fakeDb(world, {}, { platform_staff_state: () => "none" }),
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
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
  const { joinFromInvitations } = await import(at("apps/dashboard/src/server/workspace/team.ts"));
  const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
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
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
  const { joinFromInvitations } = await import(at("apps/dashboard/src/server/workspace/team.ts"));
  const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
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

// The lookup that runs on every accept has an index that fits it: invitations_open_by_email, on the plain email column
// and partial to the open ones (00023; supabase/schema.sql, the replay's snapshot, holds it). The reader filters by that
// plain column (`.eq("email", email)`), so the address is lowercased where it is asked for and where it is stored: the
// accept above is asked by "Ada@Example.com" and finds the invitation kept as "ada@example.com".

test("an invitation's address is stored lowercased at the door, so the same address invited twice is the same address", async () => {
  setRateStore(memoryStore());
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const USER = "99999999-9999-4999-8999-999999999999";
  const looked = [];
  // The first thing the invite asks the database is who holds the address: answered as a refusal, so nothing is mailed.
  setServiceClient(
    fakeDb(
      {},
      {},
      {
        lookup_user_for_invite: (args) => {
          looked.push(args.p_email);
          throw Object.assign(new Error("stop here"), { code: "XX000" });
        },
      },
    ),
  );
  const ctx = {
    supabase: fakeDb({
      memberships: [
        { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
      ],
    }),
    userId: USER,
    email: "owner@example.com",
    aal: "aal2",
    params: {},
    headers: {},
  };
  try {
    await inviteRoute.POST.run(
      new Request(`http://localhost/api/v1/team/invite?workspace=${A}`, {
        method: "POST",
        body: JSON.stringify({ email: "  Ada@Example.COM ", role: "viewer" }),
      }),
      ctx,
    ).catch(() => null);
    assert.deepEqual(looked, ["ada@example.com"]);
  } finally {
    setServiceClient(null);
  }
});

/* ---- the card writes to the SERVER, not to the seeded roster ---- */
// The card is TSX (surfaces/settings/team/team.tsx, decision 0015 step 11), and the mockup's seeded roster left with the
// twin it fed. Drawn, not read: team/team-card.test.mjs presses every act of the card on a real roster through the
// bridge's teamVerbs (a role given, Owner asked for first, an invitation resent and revoked, Leave, a removal, several
// addresses at once), and waits for the server each time: no write predicts an outcome it would have to walk back, so
// none offers an undo. The pending invitations are drawn in their own group there too, and the settings read that lands
// them is run in team/the-settings-read-lands-the-roster.test.mjs. The service's refusals (the last owner, nobody removes
// themself, not on this team) reach the owner in its own sentence, run in team-writes.test.mjs.

test("the card's five doors are the server's, each its own route on the wire", async () => {
  // They mutated ST_STORE and toasted success on a pane fed by live data: "Invite sent to x as Operator" while nothing
  // was sent, stored or audited, and a demotion confirmed while the database still said owner.
  wire.length = 0;
  await teamVerbs.invite("ada@example.com", "operator");
  await teamVerbs.setRole("m-1", "viewer");
  await teamVerbs.remove("i-1");
  await teamVerbs.resend("i-2");
  await teamVerbs.leave();
  assert.deepEqual(wire, [
    ["POST team/invite", { email: "ada@example.com", role: "operator" }],
    ["PATCH team/m-1", { role: "viewer" }],
    ["DELETE team/i-1", null],
    ["POST team/invite/i-2/resend", null],
    ["POST team/leave", null],
  ]);
});
