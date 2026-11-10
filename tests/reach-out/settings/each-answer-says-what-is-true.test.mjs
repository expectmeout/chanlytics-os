/**
 * What the end-to-end review of Cold email found said wrong (9 Nov 2026), each held to what is true: a batch of one, a
 * count not read, a workspace that has already sent, a list that is written through, two mailboxes held, Today's press,
 * who may press, a first run's OK on a lead's line, the unsubscribe check, and a refusal known by its code, not its words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLD_EMAIL_CONNECT_ROUTE,
  COLD_EMAIL_NEEDS_MAILBOX,
  coldBatchAsks,
  coldEmailNoteOf,
  coldEmailSendingOf,
  coldEmailStandingOf,
  refusalNeedsMailbox,
  refusalOf,
} from "@chanlytics/contracts";

const NOV_9 = Date.UTC(2026, 10, 9, 15);
const CONNECTED = { state: "connected", held_why: null };
const RUNNING = { root_id: "seq-1", name: "Clinics · Austin", sent: 34, wroteBack: 5, interested: 2, waitingLeads: 40 };

const facts = (over = {}) => ({
  mailboxes: [CONNECTED],
  hasAddress: true,
  heldForAddress: 0,
  waitingRun: null,
  month: { sent: 34, of: 2000 },
  running: [RUNNING],
  hadSequence: true,
  hasSearch: true,
  hasPitch: true,
  whoFor: null,
  nowMs: NOV_9,
  tz: "America/Chicago",
  ...over,
});
const run = (over = {}) => ({ id: "run-1", planned: 12, name: "Clinics · Austin", first: true, ...over });

test("a batch is said as many as it holds: one is an email, and a count not read says neither first nor next", () => {
  const said = (r) => coldEmailStandingOf(facts({ waitingRun: run(r) })).headline;
  assert.equal(said({}), "Your first 12 emails are ready for your OK");
  assert.equal(said({ first: false }), "Your next 12 emails are ready for your OK");
  assert.equal(said({ planned: 1 }), "Your first email is ready for your OK");
  assert.equal(said({ planned: 1, first: false }), "Your next email is ready for your OK");
  assert.equal(said({ first: null }), "12 emails are ready for your OK");
  assert.equal(said({ planned: 1, first: null }), "1 email is ready for your OK");
  assert.equal(said({ planned: null, first: null }), "Emails are ready for your OK");
});

test("another sequence waiting is said beside the one named", () => {
  const s = coldEmailStandingOf(facts({ waitingRun: run(), othersWaiting: 2 }));
  assert.match(s.detail ?? "", /2 other sequences wait too\.$/);
  assert.equal(s.needs, "approve");
});

test("a workspace that has had a sequence hears what stands in the way by its own answer, the address's with its count", () => {
  const s = coldEmailStandingOf(
    facts({ running: [], hasAddress: false, heldForAddress: 7, hasSearch: false, hadSequence: true }),
  );
  assert.equal(s.kind, "no_address");
  assert.equal(s.headline, "7 emails are waiting for your address");
  // Before any sequence, the list of what is left.
  const first = coldEmailStandingOf(facts({ running: [], hasAddress: false, hasSearch: false, hadSequence: false }));
  assert.equal(first.kind, "not_started");
});

test("no mailbox says what is true while an old by-hand sequence still runs, and its press needs settings", () => {
  const s = coldEmailStandingOf(facts({ mailboxes: [] }));
  assert.equal(s.kind, "no_mailbox");
  assert.doesNotMatch(s.detail ?? "", /Nothing can go out/);
  assert.match(s.detail ?? "", /A new sequence needs one\./);
  assert.equal(s.needs, "settings");
});

test("two mailboxes held beside one that sends are said as two", () => {
  const held = { state: "held", held_why: "bounces" };
  const s = coldEmailStandingOf(facts({ mailboxes: [held, held, CONNECTED] }));
  assert.equal(s.headline, "2 mailboxes are paused to protect your name");
  assert.equal(
    coldEmailStandingOf(facts({ mailboxes: [held, CONNECTED] })).headline,
    "One mailbox is paused to protect your name",
  );
});

test("a list written through is news, opening its sequence; a search with no one new asks for more on that search", () => {
  const list = coldEmailStandingOf(facts({ running: [{ ...RUNNING, waitingLeads: 0, fed_by: "list" }] }));
  assert.equal(list.kind, "no_one_new");
  assert.equal(list.headline, "Clinics · Austin has written to everyone on its list");
  assert.equal(list.needs_you, false);
  assert.equal(list.needs, null);
  assert.match(list.to ?? "", /seq-1/);
  const search = coldEmailStandingOf(
    facts({ running: [{ ...RUNNING, waitingLeads: 0, fed_by: "search", search_id: "s-9" }] }),
  );
  assert.equal(search.headline, "Clinics · Austin has no one new to write to");
  assert.equal(search.needs, "find");
  assert.match(search.to ?? "", /s-s-9/);
});

test("Today's Connect Google opens the connect sheet, and each note says what its press needs", () => {
  const none = coldEmailNoteOf(coldEmailStandingOf(facts({ mailboxes: [] })));
  assert.deepEqual(none, {
    headline: "Connect your mailbox to start sending",
    act: "Connect Google",
    to: COLD_EMAIL_CONNECT_ROUTE,
    needs: "settings",
  });
  const waits = coldEmailNoteOf(coldEmailStandingOf(facts({ waitingRun: run() })));
  assert.equal(waits?.needs, "approve");
});

test("a first run whose words are new asks whatever the mode, and a held batch after it does not", () => {
  assert.equal(coldBatchAsks({ mode: "veto", words_ok_at: null }), true);
  assert.equal(
    coldBatchAsks({ mode: "auto", words_ok_at: null }),
    true,
    "new words ask, even of one that sends on its own",
  );
  assert.equal(coldBatchAsks({ mode: "veto", words_ok_at: "2026-11-09T15:00:00Z" }), false);
  assert.equal(coldBatchAsks({ mode: "ask", words_ok_at: "2026-11-09T15:00:00Z" }), true);
  // Set to send on its own by its owner (decision 0120), once its words have their OK it does not ask.
  assert.equal(coldBatchAsks({ mode: "auto", words_ok_at: "2026-11-09T15:00:00Z" }), false);
});

test("no mailbox at all is known by its code, never by its words", () => {
  const refused = refusalOf({
    code: "validation",
    status: 400,
    message: COLD_EMAIL_NEEDS_MAILBOX,
    details: { needs: "mailbox" },
  });
  assert.equal(refusalNeedsMailbox(refused), true);
  const reworded = refusalOf({
    code: "validation",
    status: 400,
    message: "Anything at all",
    details: { needs: "mailbox" },
  });
  assert.equal(refusalNeedsMailbox(reworded), true, "a reworded sentence still says it");
  const other = refusalOf({ code: "validation", status: 400, message: COLD_EMAIL_NEEDS_MAILBOX });
  assert.equal(refusalNeedsMailbox(other), false, "the words alone say nothing");
});

/** A mailbox that has sent, with its counts. */
const mailbox = (counts) => ({
  address: "sam@harbor.example",
  host: "harbor.example",
  state: "connected",
  resting_until: null,
  daily_cap: null,
  customer_domain: false,
  sent_days: 30,
  dns: { spf: "found", dkim: "found", dmarc: "found" },
  sent_today: 3,
  counts: { sent: 400, bounced: 0, blocked: 0, complained: 0, unsubscribed: 0, said_no: 0, ...counts },
});
const checks = (counts) => coldEmailSendingOf([mailbox(counts)], { sent: 400, of: 2000 }, NOV_9).checks;

test("Sending says none as none, a held share past the hold as past it, and checks who unsubscribed", () => {
  const clean = checks({});
  assert.ok(clean.some((c) => c.title === "No bounces" && c.ok === true));
  assert.ok(clean.some((c) => c.title === "No one unsubscribed" && c.ok === true));
  // 13 of 400 is 3.25%, past the hold; 12.2 of 400 would round to 3%: the title never says the hold's own number.
  assert.ok(checks({ bounced: 13 }).some((c) => c.title === "Bounces: 3.3%" && c.ok === false));
  assert.ok(checks({ unsubscribed: 13 }).some((c) => c.title === "Unsubscribed: 3.3%" && c.ok === false));
  assert.ok(checks({ unsubscribed: 4 }).some((c) => c.title === "Unsubscribed: 1%" && c.ok === true));
  const held = coldEmailSendingOf([mailbox({ unsubscribed: 13 })], { sent: 400, of: 2000 }, NOV_9);
  assert.equal(held.health, "attention");
});
