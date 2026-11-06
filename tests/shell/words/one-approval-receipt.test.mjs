/**
 * An approved run is said in one sentence wherever it is approved (the wiring's second audit, S9-9 and S9-10): Sent's toast,
 * Today's, a campaign's drawer and Ask's card. The page's bcWhenWords and Ask's runGoes were two implementations of when it
 * goes, and Today said "approved: 3 people" where the rest said "approved — 3 people". Both halves are contracts' now
 * (whenItGoes, runApprovedTail), and these hold every place that says an approval to them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIFECYCLE_TOAST,
  PROPOSAL_SPECS,
  SENDING_HOURS_WORDS,
  SENDING_NOW_WORDS,
  clockWhen,
  runApprovedTail,
  todayRunApproved,
  whenItGoes,
} from "@chanlytics/contracts";

const ZONE = "America/New_York";
// 22:00 in New York: past the sending hours, so an approval now waits for nine tomorrow.
const NOW = Date.parse("2026-10-15T02:00:00Z");
const NINE = Date.parse("2026-10-15T13:00:00Z");
const when = (ms) => clockWhen(ms, ZONE, NOW);
const iso = (ms) => new Date(ms).toISOString();
/** A lifecycle sentence as the toast reads it: the bold name, then the words. */
const said = (parts) => parts.map((p) => (typeof p === "string" ? p : p.b)).join("");

test("when it goes: now, a moment ahead, or moved into the sending hours", () => {
  assert.equal(whenItGoes(null, when, NOW), SENDING_NOW_WORDS, "no answer is a send now");
  assert.equal(whenItGoes({ scheduled_for: null }, when, NOW), SENDING_NOW_WORDS);
  assert.equal(
    whenItGoes({ scheduled_for: "not a time" }, when, NOW),
    SENDING_NOW_WORDS,
    "a time it cannot read is no moment",
  );
  assert.equal(
    whenItGoes({ scheduled_for: iso(NOW + 30_000) }, when, NOW),
    SENDING_NOW_WORDS,
    "within a minute is now",
  );
  const later = NOW + 3 * 3_600_000;
  assert.equal(whenItGoes({ scheduled_for: iso(later) }, when, NOW), `scheduled for ${when(later)}`);
  assert.equal(
    whenItGoes({ scheduled_for: iso(NINE), moved_from: iso(NOW) }, when, NOW),
    `scheduled for tomorrow 9:00 AM — messages go out ${SENDING_HOURS_WORDS.between} by your clock`,
    "the server moved it, and the sentence says why",
  );
});

test("approved: one tail, with the count's own noun", () => {
  assert.equal(runApprovedTail(1, SENDING_NOW_WORDS), "approved — 1 person, sending now");
  assert.equal(runApprovedTail(3, SENDING_NOW_WORDS), "approved — 3 people, sending now");
  assert.equal(runApprovedTail(0, "scheduled for 9:00 AM"), "approved — 0 people, scheduled for 9:00 AM");
});

test("REGRESSION (S9-9, S9-10): Campaigns' toast, Today's and Ask's card say one approval in the same sentence", () => {
  const card = (answer, people) =>
    PROPOSAL_SPECS.run.receipt({ payload: { verb: "approve", name: "Win-back", people, timezone: ZONE } }, answer);
  for (const answer of [
    { recipient_count: 3, scheduled_for: iso(NINE), moved_from: iso(NOW) },
    { recipient_count: 1, scheduled_for: iso(NOW), moved_from: null },
    { recipient_count: 1 },
  ]) {
    const goes = whenItGoes(answer, when, NOW);
    const n = answer.recipient_count;
    const one = `Win-back ${runApprovedTail(n, goes)}`;
    assert.equal(said(LIFECYCLE_TOAST.approved("Win-back", n, goes)), one, "Campaigns' toast");
    const today = todayRunApproved("Win-back", n, goes);
    assert.equal(`${today.lead} ${today.rest}`, one, "Today's");
    // Ask's card counts by the server's answer, never the card's own figure (2), by the zone it carries.
    assert.equal(card(answer, 2), one, "Ask's card");
  }
  // A card that names no zone is told in UTC rather than said to be sending now.
  const utc = PROPOSAL_SPECS.run.receipt(
    { payload: { verb: "approve", name: "Win-back" } },
    { recipient_count: 3, scheduled_for: iso(NINE), moved_from: iso(NOW) },
  );
  assert.match(utc, /^Win-back approved — 3 people, scheduled for .+ by your clock$/);
});
