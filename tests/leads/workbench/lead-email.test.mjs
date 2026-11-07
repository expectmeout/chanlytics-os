/**
 * A lead's own email (decision 0094), the rules contracts holds: which connected mailbox it leaves from, or why it goes
 * from the owner's mail app, and how each one reads in History.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEAD_OWN_EMAIL_WORDS as W, leadEmailFromOf } from "@chanlytics/contracts";
import { leadHistoryOf } from "../../../apps/dashboard/src/surfaces/leads/sheet/model/lines.ts";

const NOW = Date.parse("2026-11-05T15:00:00Z");
const ME = "user-me";
const box = (over = {}) => ({
  id: "box-1",
  address: "sam@example.com",
  provider: "google",
  connected_by: "user-other",
  state: "connected",
  resting_until: null,
  sent_days: 30,
  daily_cap: 40,
  customer_domain: false,
  used: 0,
  ...over,
});
const fromOf = (mailboxes, sequenceMailbox = null) =>
  leadEmailFromOf({ sequenceMailbox, userId: ME, mailboxes, nowMs: NOW });

test("no mailbox connected: the mail app is the road, and it says so", () => {
  assert.deepEqual(fromOf([]), { from: null, why: "no_mailbox" });
});

test("a mailbox on Microsoft is no road: Google Workspace alone is connected for this", () => {
  assert.deepEqual(fromOf([box({ provider: "microsoft" })]), { from: null, why: "no_mailbox" });
});

test("the member's own mailbox comes first, then the workspace's oldest that can send", () => {
  const other = box({ id: "other" });
  const mine = box({ id: "mine", connected_by: ME });
  assert.equal(fromOf([other, mine]).from.id, "mine");
  assert.equal(fromOf([other, box({ id: "later" })]).from.id, "other");
});

test("a mailbox that does not send now is passed over, and when none does, that is why", () => {
  const resting = box({ id: "resting", resting_until: "2026-11-06T00:00:00Z" });
  const signedOut = box({ id: "out", state: "reconnect" });
  assert.equal(fromOf([resting, box({ id: "ok" })]).from.id, "ok");
  assert.deepEqual(fromOf([resting, signedOut]), { from: null, why: "not_sending" });
  assert.equal(
    fromOf([box({ resting_until: "2026-11-05T14:00:00Z" })]).from.id,
    "box-1",
    "a rest that is over is no rest",
  );
});

test("a mailbox whose day is spent is passed over by the ramp's share, what is queued counted", () => {
  const fresh = { sent_days: 0, daily_cap: 40 }; // the ramp's first week: ten a day
  assert.deepEqual(fromOf([box({ ...fresh, used: 10 })]), { from: null, why: "day_full" });
  assert.equal(fromOf([box({ ...fresh, used: 9 })]).from.id, "box-1");
  assert.equal(fromOf([box({ id: "full", ...fresh, used: 10 }), box({ id: "room" })]).from.id, "room");
});

test("a lead in a sequence hears from its sequence's mailbox alone, even when another could send", () => {
  const seq = box({ id: "seq" });
  const mine = box({ id: "mine", connected_by: ME });
  assert.equal(fromOf([mine, seq], "seq").from.id, "seq");
  const resting = box({ id: "seq", resting_until: "2026-11-06T00:00:00Z" });
  assert.deepEqual(fromOf([mine, resting], "seq"), { from: null, why: "not_sending" });
  const full = box({ id: "seq", sent_days: 0, used: 10 });
  assert.deepEqual(fromOf([mine, full], "seq"), { from: null, why: "day_full" });
});

test("a sequence's mailbox removed since no longer holds the lead to it", () => {
  assert.equal(fromOf([box({ id: "mine", connected_by: ME })], "gone").from.id, "mine");
});

test("the words say each road", () => {
  assert.equal(W.from("sam@example.com"), "From sam@example.com");
  assert.equal(W.sending("sam@example.com"), "Sending from sam@example.com");
  for (const why of ["no_mailbox", "not_sending", "day_full"]) assert.ok(W.whyNot[why].length > 0, why);
});

/* ---------------------------------------------------------------------------------------- History -- */

const TZ = "America/New_York";
const mail = (over = {}) => ({
  id: "m1",
  state: "sent",
  at: "2026-11-03T15:00:00Z",
  from: "sam@example.com",
  said: false,
  reason: null,
  ...over,
});
const historyOf = (emails, over = {}) =>
  leadHistoryOf({
    vm: { found: [], worked: { outcome: null, note: null, at: null }, ...over },
    place: null,
    emails,
    tz: TZ,
    nowMs: NOW,
  }).map((r) => r.what);

test("each email of your own is a row on its own day: from the mailbox, or from your own mail app", () => {
  assert.deepEqual(historyOf([mail(), mail({ id: "m2", at: "2026-11-04T15:00:00Z", from: null, said: true })]), [
    "You wrote to them from sam@example.com",
    "You wrote to them yourself",
  ]);
});

test("one on its way says so, one that did not go says why, and one taken back with Undo was never anything", () => {
  assert.deepEqual(historyOf([mail({ state: "queued" })]), ["Sending from sam@example.com"]);
  assert.deepEqual(historyOf([mail({ state: "skipped", reason: "outreach_wrote_back" })]), [
    "Your email did not go: wrote back",
  ]);
  assert.deepEqual(historyOf([mail({ state: "failed", reason: "send_failed" })]), ["Your email did not go"]);
  assert.deepEqual(historyOf([mail({ state: "skipped", reason: "canceled" })]), []);
});

test("emailed on the lead is not said again where a row of its own says it", () => {
  const worked = { worked: { outcome: "emailed", note: null, at: "2026-11-03T15:00:00Z" } };
  assert.deepEqual(historyOf([mail()], worked), ["You wrote to them from sam@example.com"]);
  assert.deepEqual(historyOf([], worked), ["You wrote to them yourself"], "a mark from before there were rows");
});

test("History runs in time: your email between a sequence's two steps", () => {
  const place = {
    sequence: { id: "s", name: "Salons", state: "on" },
    joined: null,
    sends: [
      { place: 1, sent_at: "2026-11-01T15:00:00Z", state: "sent" },
      { place: 2, sent_at: "2026-11-04T15:00:00Z", state: "sent" },
    ],
    place: { group: "in", place: 2, at: null, why: null, reply: null },
  };
  const rows = leadHistoryOf({
    vm: { found: [], worked: { outcome: null, note: null, at: null } },
    place,
    emails: [mail()],
    tz: TZ,
    nowMs: NOW,
  });
  assert.deepEqual(
    rows.map((r) => r.what),
    ["Step 1 sent", "You wrote to them from sam@example.com", "Step 2 sent"],
  );
});
