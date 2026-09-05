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
import { readRaw, readCode } from "./_source.mjs";

const sql = readRaw("supabase/migrations/00023_team_audit_and_invite_lookup.sql");
const service = readCode("apps/dashboard/src/server/service.ts");
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

test("every mutating team op writes to it", () => {
  for (const verb of ["change_role", "remove_member", "revoke_invite", "invite"]) {
    assert.ok(service.includes(`"${verb}"`), `${verb} is never recorded`);
  }
  assert.equal(service.split("noteTeamChange(").length - 1, 5, "one definition, four call sites");
});

test("the audit runs on the CALLER's client, so the actor cannot be spoofed", () => {
  // decisions_acting_member_insert already admits an acting member, so this
  // needs no privilege the request does not have — and actor_user_id comes
  // from the session rather than from an argument somebody passed.
  assert.ok(service.includes("await ctx.supabase.from(\"decisions\").insert({"));
  assert.ok(service.includes("actor_user_id: ctx.userId"));
});

test("a failed audit row never fails the change that already happened", () => {
  // The role change is committed by the time this runs. Throwing here would
  // report failure for something that succeeded, which is worse than a gap.
  assert.ok(service.includes('console.error("team_audit_failed"'));
  assert.ok(!/throw new Error\("team_audit/.test(service));
});

test("removal records what the row said, because the row is gone", () => {
  // After the delete there is no membership left to ask what role they held.
  assert.ok(service.includes("had_role: target.role"));
  assert.ok(service.includes("removed_user_id: target.user_id"));
});

test("the routes hand the caller through", () => {
  assert.ok(teamIdRoute.includes("setMemberRole(ctx,"));
  assert.ok(teamIdRoute.includes("removeMember(ctx,"));
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
  assert.ok(
    !workspaces.includes("!data?.length && (await acceptOpenInvites"),
    "the membership gate is the bug",
  );
});

test("the lookup that now runs every time has an index that fits it", () => {
  // The only index was (tenant_id, lower(email)) — email is the SECOND column,
  // so a cross-tenant lookup by email could not use it and scanned the table.
  assert.match(sql, /create index if not exists invitations_open_by_email\s*\n\s*on public\.invitations \(email\)/);
  assert.match(sql, /where accepted_at is null and revoked_at is null;/, "partial: settled invitations are never looked up this way");
});

test("the index matches how the reader actually filters", () => {
  // A lower(email) expression index would silently stop serving `.eq("email")`.
  // Emails are lowercased by the invite route before they are stored, so the
  // plain column is correct — and that invariant is what makes it correct.
  assert.ok(service.includes('.eq("email", email.toLowerCase())'));
  const invite = readCode("apps/dashboard/app/api/v1/team/invite/route.ts");
  assert.ok(invite.includes('.trim().toLowerCase()'), "stored lowercased at the door");
});

/* ---- the card writes to the SERVER, not to the seeded roster ---- */
{
  const { readCode } = await import("./_source.mjs");
  const settings = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  const bridge = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  const seam = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");

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
    const service = readCode("apps/dashboard/src/server/service.ts");
    assert.ok(!/throw new Error\("(last_owner|self_remove|not_found)"\)/.test(service));
    assert.ok(service.includes("AppError"), "team rules must throw AppError");
  });
}
