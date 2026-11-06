/**
 * Good news in its own tone, and a warning in a warning's (the wiring's second audit, R11 S6-9). "Texting is on", "Your
 * phone line is ready", "Your receptionist is back" and "Your trial has started" were drawn in the warning's amber with its
 * icon, because a kept row's look is by kind and `number` and `billing` carry bad news too, and Today sorts amber first;
 * a carrier sending the texting registration back, kept as a plain alert, was drawn as no warning at all. Run on the bell's
 * own drawing of kept rows (contracts serverNotificationRows over noticeTone), with the titles as their writers make them
 * where the writer is a package's (channels registrationVerdict).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeTone, serverNotificationRows } from "@chanlytics/contracts";
import { registrationVerdict } from "@chanlytics/channels";

const kept = (kind, title, i) => ({
  id: `n${i}`,
  kind,
  title,
  body: "",
  route: null,
  subject_type: null,
  subject_id: null,
  created_at: "2026-10-14T12:00:00Z",
  read: false,
  dismissed: false,
});
const drawn = (rows) =>
  serverNotificationRows({ notifications: rows.map(([k, t], i) => kept(k, t, i)), seen_at: null }).map((r) => [
    r.title,
    r.tone,
    r.icon,
  ]);

test("good news under a kind that also carries warnings is drawn as good news; the warnings beside it keep the warning's look", () => {
  const texting = registrationVerdict("pending", "active", { number: "(305) 555-0100" });
  const approved = registrationVerdict("pending", "approved", { number: "(305) 555-0100" });
  assert.deepEqual(
    drawn([
      ["number", texting.title],
      ["number", approved.title],
      ["number", "Your phone line is ready: (305) 555-0100"],
      ["number", "Forwarding works: calls to (305) 555-0100 reach your receptionist"],
      ["number", "WhatsApp quality rating back to normal"],
      ["billing", "Your receptionist is back"],
      ["billing", "Your trial has started"],
    ]),
    [
      [texting.title, "ok", "check"],
      [approved.title, "ok", "check"],
      ["Your phone line is ready: (305) 555-0100", "ok", "check"],
      ["Forwarding works: calls to (305) 555-0100 reach your receptionist", "ok", "check"],
      ["WhatsApp quality rating back to normal", "ok", "check"],
      ["Your receptionist is back", "ok", "check"],
      ["Your trial has started", "ok", "check"],
    ],
  );
  assert.deepEqual(
    drawn([
      ["number", "WhatsApp quality rating flagged"],
      ["billing", "A payment did not go through"],
      ["sweep", "Google Business Profile stopped syncing"],
    ]).map(([, tone]) => tone),
    ["warn", "warn", "warn"],
    "the bad news of the same kinds, as their looks draw it",
  );
});

test("a carrier sending the texting registration back, or stopping it, is a warning, though it is kept as an alert", () => {
  for (const after of ["rejected", "failed"]) {
    const v = registrationVerdict("pending", after, { number: "(305) 555-0100", reason: "the brand name" });
    assert.equal(v.kind, "alert");
    assert.equal(noticeTone(v.kind, v.title), "warn", after);
    assert.equal(drawn([[v.kind, v.title]])[0][1], "warn", after);
  }
  assert.equal(
    drawn([["alert", "Something else the platform said"]])[0][1],
    "",
    "an alert listed nowhere keeps its look",
  );
});

test("a row listed nowhere keeps its kind's look: a title is matched under its own kind alone", () => {
  assert.equal(noticeTone("number", "Your trial has started"), null, "a billing title under another kind");
  assert.equal(noticeTone("billing", "Your receptionist is paused"), null);
});

test("a search that ended because its source failed is a warning; one that is done keeps its good news", () => {
  // The titles as lead_rounds_notify writes them (00491; leads.db.test.mjs holds the trigger to them). A source that
  // failed was told "Your search for … is done" in good news's green, the one notice about a search that had stopped.
  assert.deepEqual(
    drawn([
      ["leads_ready", "Your search for dog groomers didn't run: the source couldn't start it"],
      ["leads_ready", "Your search for bike shops stopped: the source stopped answering"],
      ["leads_ready", "Your search for personal trainers is done"],
    ]).map(([, tone]) => tone),
    ["warn", "warn", "ok"],
  );
});
