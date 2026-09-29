/**
 * The three team writes, executed.
 *
 * Inviting, changing a role and removing someone hand out and take back the
 * power to message customers, and until now every rule in them -- the last
 * owner is immovable, nobody removes themself, an invitation the mail could
 * not carry is rolled back, the ledger row carries what the row said -- was
 * read from the source. The service takes its privileged client the way
 * the roster takes its own, so here both are the database in memory, the
 * mail is a fake, and the rules run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { ASK_PAGES, ASK_PAGE_ROUTES, inviteState } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { inviteMember, setMemberRole, removeMember } = await import(at("apps/dashboard/src/server/workspace/team.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const member = (id, user_id, role) => ({ id, tenant_id: A, user_id, role, created_at: "2026-01-01T00:00:00Z" });

/** One database for both clients (the caller's and the platform's), a fake mail, and the ledger. */
function world(over = {}, { known = {}, mailError = null, faults = {} } = {}) {
  const tables = {
    memberships: [member("m1", USER, "owner"), member("m2", "u2", "viewer")],
    invitations: [],
    decisions: [],
    ...over,
  };
  const mails = [];
  const db = fakeDb(tables, faults, { lookup_user_for_invite: (a) => known[a.p_email] ?? null });
  const svc = {
    ...db,
    auth: {
      admin: {
        inviteUserByEmail: async (email) => {
          mails.push(email);
          return { error: mailError };
        },
      },
    },
  };
  const ctx = (userId = USER, via) => ({ supabase: db, userId, ...(via ? { via } : {}) });
  return { tables, mails, db, svc, ctx };
}
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
const ledger = (t) => t.decisions.map((d) => [d.subject_type, d.verb, d.payload, d.undo_of ?? null]);

test("an invitation to a new address: the row, then the mail, then the ledger, marked when a card sent it", async () => {
  const w = world();
  const out = await inviteMember(w.svc, A, USER, "bo@example.com", "operator", "ask", w.svc);
  assert.deepEqual(out, { invited: true });
  assert.deepEqual(
    w.tables.invitations.map((i) => [i.tenant_id, i.email, i.role, i.invited_by]),
    [[A, "bo@example.com", "operator", USER]],
  );
  assert.deepEqual(w.mails, ["bo@example.com"]);
  assert.deepEqual(
    ledger(w.tables),
    [["invitation", "invite", { email: "bo@example.com", role: "operator", via: "ask" }, null]],
    "the invitation itself is on the ledger, once its email is on its way",
  );
  assert.equal(w.tables.decisions[0].subject_id, w.tables.invitations[0].id);
  assert.equal(w.tables.decisions[0].actor_user_id, USER, "the actor is the session");
});

test("the email lookup runs on the platform's client: a session is never asked whether an address has an account", async () => {
  // 00121 closed lookup_user_for_invite to sessions. This caller models one:
  // its client has no lookup, and asking it would throw.
  const w = world({}, { known: { "cy@example.com": "u3" } });
  const caller = fakeDb(w.tables);
  assert.deepEqual(await inviteMember(caller, A, USER, "cy@example.com", "viewer", undefined, w.svc), { added: true });
  assert.deepEqual(
    w.tables.memberships.map((m) => m.user_id),
    [USER, "u2", "u3"],
    "the known account joined, found through the platform's client",
  );
});

test("an invitation to a known account joins them now: a membership at the role, no mail, the ledger saying so; someone already on the team is left alone", async () => {
  const w = world({}, { known: { "cy@example.com": "u3", "di@example.com": "u2" } });
  assert.deepEqual(await inviteMember(w.svc, A, USER, "cy@example.com", "viewer", undefined, w.svc), { added: true });
  assert.deepEqual(
    w.tables.memberships.map((m) => [m.user_id, m.role]),
    [
      [USER, "owner"],
      ["u2", "viewer"],
      ["u3", "viewer"],
    ],
  );
  assert.deepEqual(w.mails, [], "no sign-up ceremony for an account that exists");
  assert.deepEqual(ledger(w.tables), [
    ["membership", "invite", { email: "cy@example.com", role: "viewer", joined_existing_account: true }, null],
  ]);
  assert.deepEqual(await inviteMember(w.svc, A, USER, "di@example.com", "viewer", undefined, w.svc), {
    alreadyMember: true,
  });
  assert.equal(w.tables.memberships.length, 3);
  assert.equal(w.tables.decisions.length, 1, "nothing to record");
});

test("an invitation the mail could not carry is rolled back: no row left in the invites list, no ledger row, and the owner told in the mail's words", async () => {
  const w = world({}, { mailError: { message: "smtp: connection refused" } });
  await refused(
    inviteMember(w.svc, A, USER, "bo@example.com", "operator", undefined, w.svc),
    "upstream_email",
    502,
    "We could not send the invitation email: smtp: connection refused",
  );
  assert.deepEqual(w.tables.invitations, [], "the intent row without the email is a lie in the invites list");
  assert.deepEqual(w.tables.decisions, []);
  assert.deepEqual(w.mails, ["bo@example.com"], "the mail was attempted");
});

test("a role change: the ledger carries where it came from and where it went; the last owner cannot be demoted; a stranger's id is not on this team", async () => {
  const w = world();
  assert.deepEqual(await setMemberRole(w.ctx(USER, "ask"), A, "m2", "owner", w.svc), {
    membershipId: "m2",
    role: "owner",
  });
  assert.equal(w.tables.memberships.find((m) => m.id === "m2").role, "owner");
  assert.deepEqual(
    ledger(w.tables),
    [["membership", "change_role", { from: "viewer", to: "owner", via: "ask" }, null]],
    "was promoted, not was already one",
  );
  // Two owners now: demoting one is allowed.
  assert.deepEqual(await setMemberRole(w.ctx(), A, "m1", "operator", w.svc), { membershipId: "m1", role: "operator" });
  assert.deepEqual(ledger(w.tables).at(-1), ["membership", "change_role", { from: "owner", to: "operator" }, null]);
  // One owner left: immovable.
  await refused(
    setMemberRole(w.ctx(), A, "m2", "viewer", w.svc),
    "conflict",
    409,
    "This is the only owner. Promote someone else first.",
  );
  assert.equal(w.tables.memberships.find((m) => m.id === "m2").role, "owner", "unchanged");
  await refused(setMemberRole(w.ctx(), A, "m9", "viewer", w.svc), "not_found", 404, "That person is not on this team.");
  assert.equal(w.tables.decisions.length, 2, "a refusal leaves no ledger row");
});

test("a removal: an open invitation is revoked; nobody removes themself; the last owner stays; a member goes with the role they held on the ledger; a stranger's id is not on this team", async () => {
  const w = world({
    invitations: [
      {
        id: "i1",
        tenant_id: A,
        email: "bo@example.com",
        role: "operator",
        accepted_at: null,
        revoked_at: null,
        expires_at: "2026-09-18T00:00:00Z",
      },
    ],
  });
  assert.deepEqual(await removeMember(w.ctx(USER, "ask"), A, "i1", USER, w.svc), { revokedInvite: true });
  assert.ok(w.tables.invitations[0].revoked_at, "stamped, not deleted");
  assert.deepEqual(ledger(w.tables), [["invitation", "revoke_invite", { via: "ask" }, null]]);
  await refused(
    removeMember(w.ctx(), A, "m1", USER, w.svc),
    "conflict",
    409,
    "You cannot remove yourself. Ask another owner.",
  );
  await refused(
    removeMember(w.ctx("u2"), A, "m1", "u2", w.svc),
    "conflict",
    409,
    "This is the only owner. Promote someone else first.",
  );
  assert.equal(w.tables.memberships.length, 2, "nothing removed by a refusal");
  assert.deepEqual(await removeMember(w.ctx(), A, "m2", USER, w.svc), { removed: true });
  assert.deepEqual(
    w.tables.memberships.map((m) => m.id),
    ["m1"],
  );
  assert.deepEqual(
    ledger(w.tables).at(-1),
    ["membership", "remove_member", { removed_user_id: "u2", had_role: "viewer" }, null],
    "the row is gone; the ledger is the only record of what it said",
  );
  await refused(removeMember(w.ctx(), A, "m9", USER, w.svc), "not_found", 404, "That person is not on this team.");
});

test("two owners changed at once: the count before the write passes both, and the database's refusal says the same words", async () => {
  // Two owners: each request counts two and writes. The second write is refused at the end of its transaction by
  // 00267's trigger (P0001, last_owner), and the owner reads the words the count would have said, not a 500.
  const lastOwner = {
    code: "P0001",
    message: "last_owner",
    hint: "This is the only owner. Promote someone else first.",
  };
  const owners = { memberships: [member("m1", USER, "owner"), member("m2", "u2", "owner")] };
  for (const [op, write] of [
    ["delete", (w) => removeMember(w.ctx(), A, "m2", USER, w.svc)],
    ["update", (w) => setMemberRole(w.ctx(), A, "m2", "viewer", w.svc)],
  ]) {
    const w = world(structuredClone(owners), { faults: { [`memberships.${op}`]: lastOwner } });
    await refused(write(w), "conflict", 409, "This is the only owner. Promote someone else first.");
    assert.equal(w.tables.decisions.length, 0, `a refused ${op} leaves no ledger row`);
  }
  // Any other failure of the write is not a conflict, and not worded as one.
  const w = world(structuredClone(owners), {
    faults: { "memberships.delete": { code: "57014", message: "canceled" } },
  });
  await assert.rejects(removeMember(w.ctx(), A, "m2", USER, w.svc), (e) => {
    assert.equal(e.code, undefined, "a plain error, for the route's own answer");
    assert.equal(e.message, "canceled");
    return true;
  });
});

test("an invitation's state on the Team card: pending with its expiry, expiring today, expired, and no date at all", () => {
  const now = Date.parse("2026-09-11T12:00:00Z");
  assert.deepEqual(inviteState("2026-09-18T12:00:00Z", now), {
    expired: false,
    words: "invite pending · expires in 7 days",
  });
  assert.deepEqual(inviteState("2026-09-11T20:00:00Z", now), {
    expired: false,
    words: "invite pending · expires today",
  });
  assert.deepEqual(inviteState("2026-09-10T12:00:00Z", now), {
    expired: true,
    words: "invite expired — revoke it and send a new one",
  });
  assert.deepEqual(inviteState(null, now), { expired: false, words: "invite pending" });
});

test("the palette's page jumps land on pages that exist: Team on the Team pane, the receptionist's memory on Business details, and no jump to a pane that says not built", () => {
  const by = Object.fromEntries(ASK_PAGES.map((p) => [p.label, p.to]));
  assert.equal(by.Team, "admin/team");
  assert.equal(by["Receptionist memory"], "admin/workspace", "what the receptionist knows lives in Business details");
  assert.ok(
    !ASK_PAGE_ROUTES.includes("admin/memory"),
    "the model may not send a person to the pane that says not built",
  );
  assert.ok(ASK_PAGE_ROUTES.includes("admin/team"));
  for (const p of ASK_PAGES)
    assert.ok(ASK_PAGE_ROUTES.includes(p.to), `${p.label} jumps to a page a citation may name`);
});
