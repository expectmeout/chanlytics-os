/**
 * One answer for where cold email stands: the one thing that matters most, and what to press. One row per state on the
 * canvas's States board, in the order they outrank each other, so the page, New, Today and Ask cannot disagree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLD_EMAIL_NEEDS_MAILBOX,
  coldEmailCannotSendWhy,
  coldEmailNoteOf,
  coldEmailStandingOf,
  hasFootAddress,
} from "@chanlytics/contracts";

const NOV_9 = Date.UTC(2026, 10, 9, 15);
const CONNECTED = { state: "connected", held_why: null };
const RUNNING = { root_id: "seq-1", name: "Clinics · Austin", sent: 34, wroteBack: 5, interested: 2, waitingLeads: 40 };

/** A workspace that is sending, with nothing wrong: each row says what is different. */
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
  whoFor: "Dental clinics in Austin",
  nowMs: NOV_9,
  tz: "America/Chicago",
  ...over,
});
const nothingStarted = (over = {}) =>
  facts({ mailboxes: [], hasAddress: false, running: [], hadSequence: false, hasSearch: false, ...over });

const ROWS = [
  {
    name: "a held mailbox, with nothing else to send from",
    facts: facts({ mailboxes: [{ state: "held", held_why: "bounces" }] }),
    kind: "held",
    headline: "Sending paused to protect your name",
    act: "See what to fix",
    to: "admin/integrations",
    needs_you: true,
  },
  {
    name: "a mailbox signed out",
    facts: facts({ mailboxes: [{ state: "reconnect", held_why: null }] }),
    kind: "reconnect",
    headline: "Your mailbox needs reconnecting",
    act: "Reconnect",
    to: "admin/integrations",
    needs_you: true,
  },
  {
    name: "nothing started, three things left",
    facts: nothingStarted(),
    kind: "not_started",
    headline: "3 things before your first email",
    act: null,
    to: null,
    needs_you: true,
  },
  {
    name: "nothing started, one thing left that is not the mailbox",
    facts: nothingStarted({ mailboxes: [CONNECTED], hasAddress: true }),
    kind: "not_started",
    headline: "1 thing before your first email",
    act: null,
    to: null,
    needs_you: true,
  },
  {
    name: "nothing started, and nothing said of what it sells",
    facts: nothingStarted({ hasPitch: false }),
    kind: "not_started",
    headline: "4 things before your first email",
    act: null,
    to: null,
    needs_you: true,
  },
  {
    name: "only the pitch left",
    facts: nothingStarted({ mailboxes: [CONNECTED], hasAddress: true, hasSearch: true, hasPitch: false }),
    kind: "not_started",
    headline: "1 thing before your first email",
    act: null,
    to: null,
    needs_you: true,
  },
  {
    name: "only the mailbox left",
    facts: nothingStarted({ hasAddress: true, hasSearch: true }),
    kind: "no_mailbox",
    headline: "Connect your mailbox to start sending",
    act: "Connect Google",
    to: null,
    needs_you: true,
  },
  {
    name: "no mailbox, with a sequence running",
    facts: facts({ mailboxes: [] }),
    kind: "no_mailbox",
    headline: "Connect your mailbox to start sending",
    act: "Connect Google",
    to: null,
    needs_you: true,
  },
  {
    name: "no address, with emails held for it",
    facts: facts({ hasAddress: false, heldForAddress: 12 }),
    kind: "no_address",
    headline: "12 emails are waiting for your address",
    act: "Add your address",
    to: "admin/workspace/address",
    needs_you: true,
  },
  {
    name: "no address, with one email held for it",
    facts: facts({ hasAddress: false, heldForAddress: 1 }),
    kind: "no_address",
    headline: "1 email is waiting for your address",
    act: "Add your address",
    to: "admin/workspace/address",
    needs_you: true,
  },
  {
    name: "no address and a sequence running, none held yet or the count not read",
    facts: facts({ hasAddress: false, heldForAddress: null }),
    kind: "no_address",
    headline: "Your emails need your address",
    act: "Add your address",
    to: "admin/workspace/address",
    needs_you: true,
  },
  {
    name: "a first run waiting",
    facts: facts({ waitingRun: { id: "run-1", planned: 10, name: "Dental clinics · Austin", first: true } }),
    kind: "waiting_ok",
    headline: "Your first 10 emails are ready for your OK",
    act: "Read and approve",
    to: "runs/run-1",
    needs_you: true,
  },
  {
    name: "a later run waiting",
    facts: facts({ waitingRun: { id: "run-2", planned: 8, name: "Dental clinics · Austin", first: false } }),
    kind: "waiting_ok",
    headline: "Your next 8 emails are ready for your OK",
    act: "Read and approve",
    to: "runs/run-2",
    needs_you: true,
  },
  {
    name: "a run waiting whose size was not read",
    facts: facts({ waitingRun: { id: "run-3", planned: null, name: "Dental clinics · Austin", first: true } }),
    kind: "waiting_ok",
    headline: "Your first emails are ready for your OK",
    act: "Read and approve",
    to: "runs/run-3",
    needs_you: true,
  },
  {
    name: "the month's allowance used",
    facts: facts({ month: { sent: 2000, of: 2000 } }),
    kind: "month_used",
    headline: "Paused until December 1",
    act: null,
    to: null,
    needs_you: false,
  },
  {
    name: "a sequence with no one new",
    facts: facts({ running: [{ ...RUNNING, waitingLeads: 0 }] }),
    kind: "no_one_new",
    headline: "Clinics · Austin has no one new to write to",
    act: "Find more businesses",
    to: "clients/leads",
    needs_you: true,
  },
  {
    name: "every mailbox paused by its owner",
    facts: facts({ mailboxes: [{ state: "paused", held_why: null }] }),
    kind: "paused",
    headline: "Your mailbox is paused",
    act: "Open Connections",
    to: "admin/integrations",
    needs_you: false,
  },
  {
    name: "every mailbox paused, with a batch waiting for an OK",
    facts: facts({
      mailboxes: [{ state: "paused", held_why: null }],
      waitingRun: { id: "run-1", planned: 25, name: "Dental clinics · Austin", first: false },
    }),
    kind: "paused",
    headline: "Your mailbox is paused",
    act: "Open Connections",
    to: "admin/integrations",
    needs_you: true,
  },
  {
    name: "ready, and never started",
    facts: facts({ running: [], hadSequence: false }),
    kind: "ready",
    headline: "Ready for your first sequence",
    act: "Start a sequence",
    to: "campaigns/sequences/new:leads",
    needs_you: false,
  },
  {
    name: "ready, with every sequence paused",
    facts: facts({ running: [] }),
    kind: "ready",
    headline: "No sequence is running",
    act: "Start a sequence",
    to: "campaigns/sequences/new:leads",
    needs_you: false,
  },
  {
    name: "sending",
    facts: facts(),
    kind: "sending",
    headline: "Sending",
    act: null,
    to: "campaigns",
    needs_you: false,
  },
];

for (const row of ROWS) {
  test(`where it stands: ${row.name}`, () => {
    const standing = coldEmailStandingOf(row.facts);
    assert.equal(standing.kind, row.kind);
    assert.equal(standing.headline, row.headline);
    assert.equal(standing.act, row.act);
    assert.equal(standing.needs_you, row.needs_you);
    if (row.to !== null) assert.match(standing.to, new RegExp(row.to.replace(":", ".*")));
    else assert.equal(standing.to, null);
  });
}

test("one held mailbox beside one that sends asks for itself, and says the other still sends", () => {
  const standing = coldEmailStandingOf(facts({ mailboxes: [{ state: "held", held_why: "bounces" }, CONNECTED] }));
  assert.equal(standing.kind, "held");
  assert.equal(standing.headline, "One mailbox is paused to protect your name");
  assert.equal(
    standing.detail,
    "More than 3% of its recent emails bounced or were refused. Your other mailbox still sends. Fix it, then resume.",
  );
  assert.equal(standing.act, "See what to fix");
  assert.match(standing.to, /admin\/integrations/);
  assert.equal(standing.needs_you, true);
});

test("a held mailbox beside two that send says 'mailboxes'", () => {
  const boxes = [{ state: "held", held_why: "complaint" }, CONNECTED, CONNECTED];
  assert.match(coldEmailStandingOf(facts({ mailboxes: boxes })).detail, / Your other mailboxes still send\. /);
});

test("a signed-out mailbox beside one that sends asks for itself: only its own emails wait", () => {
  const standing = coldEmailStandingOf(facts({ mailboxes: [{ state: "reconnect", held_why: null }, CONNECTED] }));
  assert.equal(standing.kind, "reconnect");
  assert.equal(standing.headline, "One mailbox needs reconnecting");
  assert.equal(
    standing.detail,
    "Google asked you to sign in again. Its emails wait until you do. Your other mailbox still sends.",
  );
  assert.equal(standing.act, "Reconnect");
  assert.equal(standing.needs_you, true);
});

test("a mailbox its owner paused beside one that sends is their own choice: nothing is asked", () => {
  const standing = coldEmailStandingOf(facts({ mailboxes: [{ state: "paused", held_why: null }, CONNECTED] }));
  assert.equal(standing.kind, "sending");
});

test("a paused mailbox with a batch waiting says the batch, since an OK alone would send nothing", () => {
  const paused = [{ state: "paused", held_why: null }];
  const run = { id: "run-1", name: "Dental clinics · Austin", first: false };
  const some = coldEmailStandingOf(facts({ mailboxes: paused, waitingRun: { ...run, planned: 25 } }));
  assert.equal(some.detail, "25 emails are ready for your OK. Nothing goes out until you resume it.");
  const one = coldEmailStandingOf(facts({ mailboxes: paused, waitingRun: { ...run, planned: 1 } }));
  assert.equal(one.detail, "1 email is ready for your OK. Nothing goes out until you resume it.");
  const unread = coldEmailStandingOf(facts({ mailboxes: paused, waitingRun: { ...run, planned: null } }));
  assert.equal(unread.detail, "Emails are ready for your OK. Nothing goes out until you resume it.");
  const none = coldEmailStandingOf(facts({ mailboxes: paused }));
  assert.equal(none.detail, "Nothing goes out until you resume it.");
});

test("a workspace that has written before is never told 'before your first email' for a pitch alone", () => {
  const standing = coldEmailStandingOf(facts({ running: [], hasPitch: false }));
  assert.equal(standing.kind, "ready");
  assert.equal(standing.headline, "No sequence is running");
  assert.equal(coldEmailStandingOf(facts({ hasPitch: false })).kind, "sending");
});

test("a held mailbox says why, in the words Connections keeps", () => {
  const { detail } = coldEmailStandingOf(facts({ mailboxes: [{ state: "held", held_why: "complaint" }] }));
  assert.match(detail, /^Someone marked an email from it as spam\./);
});

test("sending names the newest sequence and its numbers, and how many more run", () => {
  assert.equal(coldEmailStandingOf(facts()).detail, "Clinics · Austin: 34 sent, 5 replies, 2 interested");
  const two = coldEmailStandingOf(facts({ running: [RUNNING, { ...RUNNING, name: "Salons" }] }));
  assert.equal(two.detail, "Clinics · Austin: 34 sent, 5 replies, 2 interested. And 1 more running");
});

test("a report that could not be read leaves its numbers out, never a made-up 0", () => {
  const running = [{ ...RUNNING, sent: null, wroteBack: null, interested: null, waitingLeads: null }];
  const standing = coldEmailStandingOf(facts({ running }));
  assert.equal(standing.kind, "sending", "an unread count is not 'no one new'");
  assert.equal(standing.detail, "Clinics · Austin");
});

test("a month whose count was not read is not used up", () => {
  assert.equal(coldEmailStandingOf(facts({ month: { sent: null, of: 2000 } })).kind, "sending");
});

test("the month's end is the workspace's, not the server's", () => {
  // Nov 30 at 23:00 in Chicago is already Dec 1 in UTC: its allowance still ends on Dec 1.
  const nowMs = Date.UTC(2026, 11, 1, 5);
  const used = { month: { sent: 2000, of: 2000 }, nowMs };
  assert.equal(coldEmailStandingOf(facts({ ...used, tz: "America/Chicago" })).headline, "Paused until December 1");
  assert.equal(coldEmailStandingOf(facts({ ...used, tz: "UTC" })).headline, "Paused until January 1");
});

test("the steps stand in the page's order, each saying if it is done, and the search leans on who it's for", () => {
  const { steps } = coldEmailStandingOf(nothingStarted({ hasAddress: true }));
  assert.deepEqual(
    steps.map((s) => [s.id, s.done]),
    [
      ["mailbox", false],
      ["address", true],
      ["pitch", true],
      ["people", false],
    ],
  );
  assert.equal(steps[0].title, "Connect your mailbox");
  assert.equal(steps[0].detail, "Emails go out from your own address");
  assert.equal(steps[1].title, "Add your business address");
  assert.equal(steps[1].detail, "The law asks for it in every email");
  assert.equal(steps[2].title, "Say what you sell");
  assert.equal(steps[2].detail, "So your emails have something to say");
  assert.equal(coldEmailStandingOf(nothingStarted({ hasPitch: false })).steps[2].done, false);
  assert.equal(steps[3].title, "Find businesses to write to");
  assert.equal(steps[3].detail, "Start with Dental clinics in Austin");
  const unknown = coldEmailStandingOf(nothingStarted({ whoFor: null })).steps[3];
  assert.equal(unknown.detail, "Search for the kind of business you want to reach");
});

test("the send and the page hold one rule for an address: a business name and an address", () => {
  assert.equal(hasFootAddress("Brightline", "1 Main St"), true);
  assert.equal(hasFootAddress("Brightline", "   "), false);
  assert.equal(hasFootAddress("  ", "1 Main St"), false);
  assert.equal(hasFootAddress(null, null), false);
});

test("Today says the same headline, only where it waits on the owner, and opens where the answer does", () => {
  const held = coldEmailStandingOf(facts({ mailboxes: [{ state: "held", held_why: "bounces" }] }));
  assert.deepEqual(coldEmailNoteOf(held), {
    headline: "Sending paused to protect your name",
    act: "See what to fix",
    to: "admin/integrations",
    needs: "settings",
  });
  assert.equal(coldEmailNoteOf(coldEmailStandingOf(facts())), null, "sending: nothing to say");
  assert.equal(
    coldEmailNoteOf(coldEmailStandingOf(facts({ running: [], hadSequence: false }))),
    null,
    "ready: nor here",
  );
  const left = coldEmailNoteOf(coldEmailStandingOf(nothingStarted({ hasSearch: true })));
  assert.deepEqual(left, {
    headline: "2 things before your first email",
    act: "Open",
    to: "admin/outreach",
    needs: null,
  });
});

test("a new sequence is refused in the words of what is true: no mailbox, or one that is held, signed out or paused", () => {
  const HELD = { state: "held", held_why: "bounces" };
  const SIGNED_OUT = { state: "reconnect", held_why: null };
  const PAUSED = { state: "paused", held_why: null };
  const REMOVED = { state: "removed", held_why: null };
  assert.equal(coldEmailCannotSendWhy([CONNECTED]), null);
  assert.equal(coldEmailCannotSendWhy([HELD, CONNECTED]), null, "one that sends is enough");
  assert.equal(coldEmailCannotSendWhy([]), COLD_EMAIL_NEEDS_MAILBOX);
  assert.equal(coldEmailCannotSendWhy([REMOVED]), COLD_EMAIL_NEEDS_MAILBOX, "a removed mailbox is none");

  // The order the page's top card says them in: held, then signed out, then paused.
  const held = coldEmailCannotSendWhy([PAUSED, SIGNED_OUT, HELD]);
  assert.match(held, /paused to protect your name: more than 3% of its recent emails bounced or were refused\./);
  const signedOut = coldEmailCannotSendWhy([PAUSED, SIGNED_OUT]);
  assert.match(signedOut, /needs reconnecting: Google asked you to sign in again\./);
  const paused = coldEmailCannotSendWhy([PAUSED, REMOVED]);
  assert.match(paused, /^Your mailbox is paused\. Resume it/);
  for (const why of [held, signedOut, paused]) {
    assert.match(why, /Settings › Connections/, "it names where the fix is");
    assert.doesNotMatch(why, /Connect your mailbox first/, "a mailbox that is there is never asked for again");
  }
});
