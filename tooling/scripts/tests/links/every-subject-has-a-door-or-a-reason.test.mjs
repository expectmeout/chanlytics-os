/**
 * Settings > Activity names a line, a mailbox, a domain, a campaign, a template and a listing, and could open none of them,
 * a red "A line failed" included (wiring/records-not-pages, task 1.6; findings D1-activity-no-door and N1). Each kind of
 * thing a ledger row can be about says where it opens in ONE table beside its name (contracts activity/subjects.ts), or says
 * why it opens nowhere.
 *
 * What holds that table complete is not this file for the events written from TypeScript: the ledger's one writer
 * (packages/db events.ts) takes its subject from the table's own keys, so the compiler refuses a subject nobody declared
 * (events.type-test.ts, which `pnpm -r typecheck` compiles). This file holds the two lists the compiler cannot see, each
 * compared with the table: the subject a decision can be about (the schema's CHECK on decisions.subject_type, generated
 * into DECISION_SUBJECTS), and the types the migrations' own inserts into events write.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIVITY_SUBJECT_HOMES, DECISION_SUBJECTS, activityDoor } from "@chanlytics/contracts";

const ID = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";

/**
 * The subject types the migrations' inserts into events write (supabase/migrations: `insert into events`), found on 11 Oct
 * 2026. A migration that writes another is a row here, and a home in the table, in the same change.
 */
const WRITTEN_BY_MIGRATIONS = [
  "contact",
  "conversation",
  "message",
  "call",
  "tenant",
  "mailbox",
  "lead_round",
  "lead_search",
  "lead",
  "deal",
  "escalation",
  "channel",
  "appointment",
];

test("every subject a decision can be about, and every one a migration writes, has a home the log opens it by, or the reason it cannot", () => {
  const subjects = [...new Set([...DECISION_SUBJECTS, ...WRITTEN_BY_MIGRATIONS])];
  assert.ok(subjects.length >= 20, `${subjects.length} kinds of thing the ledgers can be about`);
  for (const type of subjects) {
    const home = ACTIVITY_SUBJECT_HOMES[type];
    assert.ok(home, `${type} has no home in contracts activity/subjects.ts: say where it opens, or why it does not`);
    const door = activityDoor({ subject_type: type, subject_id: ID });
    if ("door" in home) {
      assert.equal(door, home.door(ID), `${type}: activityDoor is the table's door`);
      assert.ok(
        typeof door === "string" && !door.startsWith("/") && !door.includes("undefined"),
        `${type} is a route without its slash: ${door}`,
      );
    } else {
      assert.equal(door, null, `${type}: a page the row alone cannot name`);
      const why = "lookup" in home ? home.lookup : home.none;
      assert.ok(why.length >= 20, `${type} says why in a sentence: ${why}`);
    }
  }
});

test("a line, a mailbox, a connected mailbox, a Google listing and a number open Connections; a campaign opens its sequence; a subscription Billing", () => {
  for (const type of ["line", "mailbox", "mailbox_connection", "listing", "channel", "tenant_channel"])
    assert.equal(activityDoor({ subject_type: type, subject_id: ID }), "admin/integrations", type);
  assert.equal(activityDoor({ subject_type: "playbook", subject_id: ID }), `campaigns/sequences/${ID}`);
  assert.equal(activityDoor({ subject_type: "subscription", subject_id: "sub_1" }), "admin/billing");
});

test("a change of the workspace opens the pane it changed; the workspace itself opens nothing (W-review-facts-rules-6)", () => {
  const T = "11111111-0000-4000-8000-000000000001";
  const door = (kind, subject_type = "workspace") => activityDoor({ kind, subject_type, subject_id: T });
  assert.equal(
    door("policy.changed"),
    "admin/autonomy",
    "REGRESSION: 'An autonomy setting changed' could not be opened",
  );
  assert.equal(door("settings.changed"), "admin/workspace", "REGRESSION: 'Settings changed' could not be opened");
  assert.equal(door("settings.changed", "tenant"), "admin/workspace", "as storage names the workspace too");
  assert.equal(door("capability.activated"), "admin/integrations");
  assert.equal(door("capability.deactivated"), "admin/integrations");
  assert.equal(door("member.left"), "admin/team");
  assert.equal(door("export"), null, "an export of the workspace has no pane");
  assert.equal(door("workspace.activated"), null, "nor its start");
  assert.equal(activityDoor({ subject_type: "workspace", subject_id: T }), null, "and with no kind, nothing");
});

test("a template is a page the server finds (its message, by name, while the row is there): the id alone opens nothing", () => {
  const home = ACTIVITY_SUBJECT_HOMES.template;
  assert.ok("lookup" in home, "a message of the Library is addressed by its name, which only its row knows");
  assert.equal(activityDoor({ subject_type: "template", subject_id: ID }), null);
});

test("a subject with no id opens nothing, and so does a type nobody declared", () => {
  assert.equal(activityDoor({ subject_type: "playbook", subject_id: null }), null);
  assert.equal(
    activityDoor({ subject_type: "line", subject_id: null }),
    "admin/integrations",
    "a page that needs no id still opens",
  );
  assert.equal(activityDoor({ subject_type: null, subject_id: ID }), null);
  assert.equal(activityDoor({ subject_type: "made_up", subject_id: ID }), null);
});
