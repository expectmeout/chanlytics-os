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
import { DECISION_SUBJECTS, DECISION_VERBS } from "@chanlytics/contracts";
import { readRaw, readCode } from "../_source.mjs";

const sql = readRaw("supabase/migrations/00023_team_audit_and_invite_lookup.sql");
const service = readCode("apps/dashboard/src/server/workspace/team.ts");
const workspaces = readCode("apps/dashboard/app/api/v1/workspaces/route.ts");
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

test("REGRESSION: acceptance is no longer gated on having no memberships", () => {
  // `!data?.length &&` was the strand. Self-serve workspace creation made it
  // the ordinary path rather than an edge case.
  // Gated on the request being the app's own (F51: a GET is exempt from the
  // cross-site check, so its write must not run for a cross-site read) —
  // never on having no memberships.
  assert.ok(
    workspaces.includes("if (isSameOrigin(_req) && (await acceptOpenInvites(userId, email ?? null)) > 0) {"),
    "acceptance must be attempted on every same-origin workspace read",
  );
  assert.ok(!workspaces.includes("!data?.length && (await acceptOpenInvites"), "the membership gate is the bug");
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
{
  const { readCode } = await import("../_source.mjs");
  const settings = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  const bridge = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  const seam = readCode("apps/dashboard/src/legacy-bridge/surfaces/settings.ts");

  test("invite, role change and remove call the API on a real roster", () => {
    // They mutated ST_STORE and toasted success on a pane fed by live data:
    // "Invite sent to x as Operator" while nothing was sent, stored or
    // audited, and a demotion confirmed while the database still said owner.
    for (const verb of ["__teamInvite", "__teamSetRole", "__teamRemove"]) {
      assert.ok(settings.includes(`window.${verb}(`), `${verb} must be called from the Team card`);
      assert.ok(bridge.includes(verb), `${verb} must be published by the bridge`);
    }
  });

  test("the seeded store is only written when the roster is seeded", () => {
    // Every ST_STORE write in the team handlers must sit behind !realRoster.
    const start = settings.indexOf("const invite = async");
    const end = settings.indexOf("return (", start);
    const handlers = settings.slice(start, end);
    assert.ok(start > -1 && end > start, "team handlers must be locatable");
    for (const write of ["S.addMember(", "S.setRole(", "S.removeMember("]) {
      let at = handlers.indexOf(write);
      while (at > -1) {
        const before = handlers.slice(0, at);
        assert.ok(
          before.lastIndexOf("!realRoster") > before.lastIndexOf("realRoster\n"),
          `${write} must be reachable only on a seeded roster`,
        );
        at = handlers.indexOf(write, at + 1);
      }
    }
  });

  test("no team write claims an undo it cannot perform", () => {
    // An invitation email cannot be recalled and a role change is the power to
    // message customers, so the real branch waits for the server and re-reads
    // rather than predicting an outcome it would have to walk back.
    const start = settings.indexOf("const invite = async");
    const end = settings.indexOf("return (", start);
    // Every `undo:` must sit in a seeded branch: reading backwards from it,
    // the guard that opened that branch must be nearer than any server call.
    const handlers = settings.slice(start, end);
    let at = handlers.indexOf("undo:");
    let checked = 0;
    while (at > -1) {
      const before = handlers.slice(0, at);
      assert.ok(
        before.lastIndexOf("!realRoster") > before.lastIndexOf("window.__team"),
        "an undo may only be offered on the seeded roster",
      );
      checked++;
      at = handlers.indexOf("undo:", at + 1);
    }
    assert.ok(checked >= 2, "the seeded branches still offer undo, so there is something to check");
  });

  test("pending invitations are published and rendered", () => {
    assert.ok(seam.includes("__TEAM_INVITES"), "the seam must publish open invitations");
    assert.ok(settings.includes("__TEAM_INVITES"), "the card must render them");
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
