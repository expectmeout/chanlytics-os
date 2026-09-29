/**
 * The three team writes, executed, over the database's own functions (00279).
 *
 * Inviting, changing a role and removing someone hand out and take back the power to message customers. Their rules
 * (the last owner is immovable, nobody removes themself, the ledger row carries what the row said) now live with the
 * change in one transaction in the database, and database/what-happened-is-named-audited-and-counted.db.test.mjs proves
 * them on a real Postgres. What runs here is the service's half: what it hands each function (the session's user as
 * the actor, the card's mark, the undo's link), how a refusal reaches the owner in words, and the invitation whose
 * mail could not go, taken back with its row. The platform's client is a stand-in that answers as each function does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASK_PAGES, ASK_PAGE_ROUTES, inviteState } from "@chanlytics/contracts";
import { logLineOf } from "../_log-lines.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { inviteMember, setMemberRole, removeMember } = await import(at("apps/dashboard/src/server/workspace/team.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";

/**
 * The platform's client: each function answers what `answers` says (a value, or `{ error }`), every call is kept,
 * and the mail is a fake that fails when told to.
 */
function platform(answers = {}, { mailError = null } = {}) {
  const calls = [];
  const mails = [];
  const svc = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      const a = typeof answers[name] === "function" ? answers[name](args) : answers[name];
      if (a && a.error) return { data: null, error: a.error };
      return { data: a ?? null, error: null };
    },
    auth: {
      admin: {
        inviteUserByEmail: async (email) => {
          mails.push(email);
          return { error: mailError };
        },
      },
    },
  };
  return { svc, calls, mails };
}
const ctx = (over = {}) => ({ userId: USER, ...over });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
const raised = (message) => ({ error: { code: "P0001", message } });

test("an invitation to a new address: the invitation and its row in one call, then the mail, marked when a card sent it", async () => {
  const w = platform({ lookup_user_for_invite: null, team_invite: { invitation_id: "i1", decision_id: "d1" } });
  assert.deepEqual(await inviteMember(A, USER, "bo@example.com", "operator", "ask", w.svc), { invited: true });
  assert.deepEqual(w.calls, [
    ["lookup_user_for_invite", { p_tenant_id: A, p_email: "bo@example.com" }],
    ["team_invite", { p_tenant_id: A, p_actor: USER, p_email: "bo@example.com", p_role: "operator", p_via: "ask" }],
  ]);
  assert.deepEqual(w.mails, ["bo@example.com"]);
  const again = platform({ lookup_user_for_invite: null, team_invite: { already_invited: true } });
  assert.deepEqual(await inviteMember(A, USER, "bo@example.com", "viewer", undefined, again.svc), {
    alreadyInvited: true,
  });
  assert.deepEqual(again.mails, [], "an open invitation is not mailed twice");
});

test("an invitation to a known account joins them now, through the platform's lookup and the platform's join; someone already on the team is left alone", async () => {
  const w = platform({
    lookup_user_for_invite: (a) => ({ "cy@example.com": "u3", "di@example.com": "u2" })[a.p_email],
    team_join: (a) => (a.p_user_id === "u2" ? { already_member: true } : { added: true, membership_id: "m3" }),
  });
  assert.deepEqual(await inviteMember(A, USER, "cy@example.com", "viewer", undefined, w.svc), { added: true });
  assert.deepEqual(w.calls[1], [
    "team_join",
    { p_tenant_id: A, p_actor: USER, p_user_id: "u3", p_role: "viewer", p_email: "cy@example.com" },
  ]);
  assert.deepEqual(await inviteMember(A, USER, "di@example.com", "viewer", undefined, w.svc), {
    alreadyMember: true,
  });
  assert.deepEqual(w.mails, [], "no sign-up ceremony for an account that exists");
});

test("an invitation the mail could not carry is taken back with its row, and the owner is told in the mail's words", async () => {
  const w = platform(
    {
      lookup_user_for_invite: null,
      team_invite: { invitation_id: "i1", decision_id: "d1" },
      team_invite_withdraw: null,
    },
    { mailError: { message: "smtp: connection refused" } },
  );
  await refused(
    inviteMember(A, USER, "bo@example.com", "operator", undefined, w.svc),
    "upstream_email",
    502,
    "We could not send the invitation email: smtp: connection refused",
  );
  assert.deepEqual(w.calls.at(-1), ["team_invite_withdraw", { p_tenant_id: A, p_invitation_id: "i1" }]);
  assert.deepEqual(w.mails, ["bo@example.com"], "the mail was attempted");
});

test("a role change hands the database the actor, the card's mark and the undo's link; each refusal reaches the owner in words", async () => {
  const w = platform({ team_change_role: { membership_id: "m2", role: "owner", decision_id: "d1" } });
  assert.deepEqual(await setMemberRole(ctx({ via: "ask", undoOf: "d0" }), A, "m2", "owner", w.svc), {
    membershipId: "m2",
    role: "owner",
  });
  assert.deepEqual(w.calls, [
    [
      "team_change_role",
      { p_tenant_id: A, p_actor: USER, p_membership_id: "m2", p_role: "owner", p_via: "ask", p_undo_of: "d0" },
    ],
  ]);
  for (const [message, code, status, words] of [
    ["last_owner", "conflict", 409, "This is the only owner. Promote someone else first."],
    ["not_found", "not_found", 404, "That person is not on this team."],
    ["forbidden", "forbidden", 403, "Only an owner can do this."],
  ])
    await refused(
      setMemberRole(ctx(), A, "m2", "viewer", platform({ team_change_role: raised(message) }).svc),
      code,
      status,
      words,
    );
  await assert.rejects(
    setMemberRole(ctx(), A, "m2", "viewer", platform({ team_change_role: raised("connection reset") }).svc),
    /connection reset/,
    "anything else is the database's failure, a 500",
  );
});

test("an undo whose decision the database does not have keeps the change without the link, and says so once", async () => {
  const w = platform({ team_change_role: { membership_id: "m2", role: "viewer", undo_dropped: true } });
  const lines = [];
  const real = console.error;
  console.error = (...args) => lines.push(logLineOf(args));
  try {
    await setMemberRole(ctx({ undoOf: "d-gone" }), A, "m2", "viewer", w.svc);
  } finally {
    console.error = real;
  }
  assert.deepEqual(
    lines.map((l) => [l.event, l.undo_of, l.verb]),
    [["decision_undo_of_unknown", "d-gone", "change_role"]],
  );
});

test("a removal: an open invitation revoked or a member removed, as the database found it; nobody removes themself", async () => {
  const invite = platform({ team_remove: { revoked_invite: true } });
  assert.deepEqual(await removeMember(ctx({ via: "ask" }), A, "i1", invite.svc), { revokedInvite: true });
  assert.deepEqual(invite.calls, [["team_remove", { p_tenant_id: A, p_actor: USER, p_id: "i1", p_via: "ask" }]]);
  assert.deepEqual(await removeMember(ctx(), A, "m2", platform({ team_remove: { removed: true } }).svc), {
    removed: true,
  });
  await refused(
    removeMember(ctx(), A, "m1", platform({ team_remove: raised("self_remove") }).svc),
    "conflict",
    409,
    "You cannot remove yourself. Ask another owner.",
  );
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
