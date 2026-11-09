/**
 * One answer for where cold email stands: the one thing that matters most, and what to press. One row per state on the
 * canvas's States board, in the order they outrank each other, so the page, New, Today and Ask cannot disagree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coldEmailStandingOf, hasFootAddress } from "@chanlytics/contracts";

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
    needsYou: true,
  },
  {
    name: "a mailbox signed out",
    facts: facts({ mailboxes: [{ state: "reconnect", held_why: null }] }),
    kind: "reconnect",
    headline: "Your mailbox needs reconnecting",
    act: "Reconnect",
    to: "admin/integrations",
    needsYou: true,
  },
  {
    name: "nothing started, three things left",
    facts: nothingStarted(),
    kind: "not_started",
    headline: "3 things before your first email",
    act: null,
    to: null,
    needsYou: true,
  },
  {
    name: "nothing started, one thing left that is not the mailbox",
    facts: nothingStarted({ mailboxes: [CONNECTED], hasAddress: true }),
    kind: "not_started",
    headline: "1 thing before your first email",
    act: null,
    to: null,
    needsYou: true,
  },
  {
    name: "only the mailbox left",
    facts: nothingStarted({ hasAddress: true, hasSearch: true }),
    kind: "no_mailbox",
    headline: "Connect your mailbox to start sending",
    act: "Connect Google",
    to: null,
    needsYou: true,
  },
  {
    name: "no mailbox, with a sequence running",
    facts: facts({ mailboxes: [] }),
    kind: "no_mailbox",
    headline: "Connect your mailbox to start sending",
    act: "Connect Google",
    to: null,
    needsYou: true,
  },
  {
    name: "no address, with emails held for it",
    facts: facts({ hasAddress: false, heldForAddress: 12 }),
    kind: "no_address",
    headline: "12 emails are waiting for your address",
    act: "Add your address",
    to: "admin/workspace/address",
    needsYou: true,
  },
  {
    name: "no address, with one email held for it",
    facts: facts({ hasAddress: false, heldForAddress: 1 }),
    kind: "no_address",
    headline: "1 email is waiting for your address",
    act: "Add your address",
    to: "admin/workspace/address",
    needsYou: true,
  },
  {
    name: "no address and a sequence running, none held yet or the count not read",
    facts: facts({ hasAddress: false, heldForAddress: null }),
    kind: "no_address",
    headline: "Your emails need your address",
    act: "Add your address",
    to: "admin/workspace/address",
    needsYou: true,
  },
  {
    name: "a first run waiting",
    facts: facts({ waitingRun: { id: "run-1", planned: 10, name: "Dental clinics · Austin", first: true } }),
    kind: "waiting_ok",
    headline: "Your first 10 emails are ready for your OK",
    act: "Read and approve",
    to: "runs/run-1",
    needsYou: true,
  },
  {
    name: "a later run waiting",
    facts: facts({ waitingRun: { id: "run-2", planned: 8, name: "Dental clinics · Austin", first: false } }),
    kind: "waiting_ok",
    headline: "Your next 8 emails are ready for your OK",
    act: "Read and approve",
    to: "runs/run-2",
    needsYou: true,
  },
  {
    name: "a run waiting whose size was not read",
    facts: facts({ waitingRun: { id: "run-3", planned: null, name: "Dental clinics · Austin", first: true } }),
    kind: "waiting_ok",
    headline: "Your first emails are ready for your OK",
    act: "Read and approve",
    to: "runs/run-3",
    needsYou: true,
  },
  {
    name: "the month's allowance used",
    facts: facts({ month: { sent: 2000, of: 2000 } }),
    kind: "month_used",
    headline: "Paused until December 1",
    act: null,
    to: null,
    needsYou: false,
  },
  {
    name: "a sequence with no one new",
    facts: facts({ running: [{ ...RUNNING, waitingLeads: 0 }] }),
    kind: "no_one_new",
    headline: "Clinics · Austin has no one new to write to",
    act: "Find more businesses",
    to: "clients/leads",
    needsYou: true,
  },
  {
    name: "every mailbox paused by its owner",
    facts: facts({ mailboxes: [{ state: "paused", held_why: null }] }),
    kind: "paused",
    headline: "Your mailbox is paused",
    act: "Open Connections",
    to: "admin/integrations",
    needsYou: false,
  },
  {
    name: "ready, and never started",
    facts: facts({ running: [], hadSequence: false }),
    kind: "ready",
    headline: "Ready for your first sequence",
    act: "Start a sequence",
    to: "campaigns/sequences/new:leads",
    needsYou: false,
  },
  {
    name: "ready, with every sequence paused",
    facts: facts({ running: [] }),
    kind: "ready",
    headline: "No sequence is running",
    act: "Start a sequence",
    to: "campaigns/sequences/new:leads",
    needsYou: false,
  },
  {
    name: "sending",
    facts: facts(),
    kind: "sending",
    headline: "Sending",
    act: null,
    to: "campaigns",
    needsYou: false,
  },
];

for (const row of ROWS) {
  test(`where it stands: ${row.name}`, () => {
    const standing = coldEmailStandingOf(row.facts);
    assert.equal(standing.kind, row.kind);
    assert.equal(standing.headline, row.headline);
    assert.equal(standing.act, row.act);
    assert.equal(standing.needsYou, row.needsYou);
    if (row.to !== null) assert.match(standing.to, new RegExp(row.to.replace(":", ".*")));
    else assert.equal(standing.to, null);
  });
}

test("one held mailbox beside one that sends is not 'sending paused': emails still go", () => {
  const standing = coldEmailStandingOf(facts({ mailboxes: [{ state: "held", held_why: "bounces" }, CONNECTED] }));
  assert.equal(standing.kind, "sending");
});

test("a signed-out mailbox beside one that sends still asks: its own emails are waiting", () => {
  const standing = coldEmailStandingOf(facts({ mailboxes: [{ state: "reconnect", held_why: null }, CONNECTED] }));
  assert.equal(standing.kind, "reconnect");
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
      ["people", false],
    ],
  );
  assert.equal(steps[0].title, "Connect your mailbox");
  assert.equal(steps[0].detail, "Emails go out from your own address");
  assert.equal(steps[1].title, "Add your business address");
  assert.equal(steps[1].detail, "The law asks for it in every email");
  assert.equal(steps[2].title, "Find businesses to write to");
  assert.equal(steps[2].detail, "Start with Dental clinics in Austin");
  const unknown = coldEmailStandingOf(nothingStarted({ whoFor: null })).steps[2];
  assert.equal(unknown.detail, "Search for the kind of business you want to reach");
});

test("the send and the page hold one rule for an address: a business name and an address", () => {
  assert.equal(hasFootAddress("Brightline", "1 Main St"), true);
  assert.equal(hasFootAddress("Brightline", "   "), false);
  assert.equal(hasFootAddress("  ", "1 Main St"), false);
  assert.equal(hasFootAddress(null, null), false);
});
