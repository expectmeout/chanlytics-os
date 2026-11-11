/**
 * Sending, in plain words: whether "Healthy" means something, what a mailbox can really send, and a pace that never
 * promises what the ramp's own rules would not give. All of it read over the rules Connections keeps, no second copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coldEmailNeedsLook, coldEmailSendingOf } from "@chanlytics/contracts";

const NOW = Date.UTC(2026, 10, 9, 15);
const ALL_FOUND = { spf: "found", dkim: "found", dmarc: "found", mx: "found" };
const box = (over = {}) => ({
  id: "m1",
  provider: "google",
  address: "maya@brightlinecleaning.example",
  host: "brightlinecleaning.example",
  state: "connected",
  held_why: null,
  resting_until: null,
  daily_cap: 40,
  customer_domain: false,
  sent_days: 0,
  dns: ALL_FOUND,
  sent_today: 7,
  counts: { sent: 500, bounced: 2, blocked: 0, complained: 0, unsubscribed: 0, said_no: 0 },
  ...over,
});
const MONTH = { sent: 34, of: 2000 };
const read = (mailboxes, month = MONTH) => coldEmailSendingOf(mailboxes, month, NOW);

test("a new mailbox on a second domain says where it is on its ramp, by the days it has really sent", () => {
  const s = read([box()]);
  assert.equal(s.pace, "10 a day now, 20 after 7 more days of sending");
  assert.equal(s.ceiling, null);
  assert.deepEqual(s.today, { sent: 7, cap: 10 });
});

test("one more day of sending is said as one", () => {
  assert.equal(read([box({ sent_days: 6 })]).pace, "10 a day now, 20 after 1 more day of sending");
});

test("a mailbox at the ramp's top has nothing left to promise", () => {
  assert.equal(read([box({ sent_days: 30 })]).pace, "40 a day");
});

test("a mailbox on the customer's domain tops out at 20, says so, and never promises 30", () => {
  const new1 = read([box({ customer_domain: true })]);
  assert.equal(new1.pace, "10 a day now, 20 after 7 more days of sending");
  assert.equal(new1.ceiling, "That's the most for a mailbox on your main domain.");
  assert.equal(new1.customer_host, "brightlinecleaning.example");
  const weekIn = read([box({ customer_domain: true, sent_days: 7 })]);
  assert.equal(weekIn.pace, "20 a day");
  assert.equal(weekIn.ceiling, "That's the most for a mailbox on your main domain.");
});

test("an owner's own cap is what the ramp stops at", () => {
  assert.equal(read([box({ daily_cap: 15 })]).pace, "10 a day now, 15 after 7 more days of sending");
  assert.equal(read([box({ daily_cap: 15, sent_days: 9 })]).pace, "15 a day");
});

test("several mailboxes add up, and the one shown is the first that sends now", () => {
  const paused = box({ id: "m0", address: "off@x.example", state: "paused" });
  const second = box({ id: "m2", address: "sam@get.example", sent_days: 8, sent_today: 3 });
  const s = read([paused, box(), second]);
  assert.equal(s.from, "maya@brightlinecleaning.example");
  assert.equal(s.more, 2);
  // What they send in all, never a number that reads as each one's; "for now" while either still climbs its ramp.
  assert.equal(s.pace, "30 a day in all across 2 mailboxes, for now");
});

test("mailboxes that send alike say what each does: twenty in all is ten from each, for now", () => {
  const second = box({ id: "m2", address: "sam@get.example" });
  assert.equal(read([box(), second]).pace, "20 a day in all, 10 from each for now");
  // At the ramp's top there is nothing more to come, and it says so by saying nothing.
  const top = [box({ sent_days: 30 }), box({ id: "m2", address: "sam@get.example", sent_days: 30 })];
  assert.equal(read(top).pace, "80 a day in all, 40 from each");
});

test("'Needs a look' is never said without what to look at: the first check that fails on a mailbox that sends, by its address where more than one does", () => {
  const missing = { mx: "found", spf: "missing", dkim: "missing", dmarc: "found" };
  // One mailbox: the check's own words, and its fix in the plural its records are.
  const one = read([box({ dns: missing })]);
  assert.equal(one.health, "attention");
  assert.equal(one.why, "Your domain is missing its SPF and DKIM records");
  assert.deepEqual(coldEmailNeedsLook([box({ dns: missing })], NOW), {
    why: "Your domain is missing its SPF and DKIM records",
    detail: "Add them on Connections, so your emails reach inboxes",
    alone: true,
  });
  // Two that send, the second failing: named, since "and 1 more" hid which.
  const other = box({ id: "m2", address: "sam@get.example", host: "get.example", dns: missing });
  const two = read([box(), other]);
  assert.equal(two.health, "attention");
  assert.equal(two.why, "sam@get.example: Your domain is missing its SPF and DKIM records");
  assert.equal(coldEmailNeedsLook([box(), other], NOW).alone, false);
  // One record is "it".
  const dmarc = { ...ALL_FOUND, dmarc: "missing" };
  assert.equal(
    coldEmailNeedsLook([box({ dns: dmarc })], NOW).detail,
    "Add it on Connections, so your emails reach inboxes",
  );
  // Healthy, or a mailbox its owner paused: nothing to look at, and nothing said.
  assert.equal(read([box()]).why, null);
  assert.equal(read([box({ state: "paused", dns: missing })]).why, null);
  assert.equal(coldEmailNeedsLook([], NOW), null);
});

test("every check passing is what Healthy means", () => {
  const s = read([box()]);
  assert.equal(s.health, "healthy");
  assert.deepEqual(s.checks, [
    { ok: true, title: "Your domain is set up to send", detail: "Its email records are in place" },
    { ok: true, title: "Few bounces: 0.4%", detail: "It pauses itself past 3%, so your name stays clean" },
    { ok: true, title: "No one unsubscribed", detail: "It pauses itself past 3% of those it wrote to" },
    { ok: true, title: "No spam complaints", detail: "It pauses itself after one" },
  ]);
});

test("a record missing from the domain fails that check, and is no longer Healthy", () => {
  const s = read([box({ dns: { spf: "found", dkim: "found", dmarc: "missing", mx: "found" } })]);
  assert.equal(s.health, "attention");
  assert.equal(s.checks[0].ok, false);
  assert.match(s.checks[0].title, /DMARC/);
});

test("records not read yet are said as not known, never as fine, and say nothing against the mailbox", () => {
  const s = read([box({ dns: {} })]);
  assert.equal(s.checks[0].ok, null);
  assert.equal(s.health, "healthy");
});

test("bounces past the line fail their check, refusals counted as the hold counts them", () => {
  const counts = { sent: 1000, bounced: 21, blocked: 20, complained: 0, unsubscribed: 0, said_no: 0 };
  const s = read([box({ counts })]);
  assert.deepEqual(s.checks[1], {
    ok: false,
    title: "Bounces: 4.1%",
    detail: "It pauses itself past 3%, so your name stays clean",
  });
  assert.equal(s.health, "attention");
});

test("a new mailbox's bounces are read as the hold reads them: a count of its few emails, never a frightening share", () => {
  const counts = (sent, bounced) => ({ sent, bounced, blocked: 0, complained: 0, unsubscribed: 0, said_no: 0 });
  const bounces = (sent, bounced) => read([box({ counts: counts(sent, bounced) })]);
  assert.deepEqual(bounces(10, 0).checks[1], {
    ok: true,
    title: "No bounces in 10 emails",
    detail: "It pauses itself at 5 while it's new, so your name stays clean",
  });
  // One bounce in twenty is 5%, and the hold rightly waits: Healthy stands.
  const one = bounces(20, 1);
  assert.equal(one.checks[1].ok, true);
  assert.equal(one.checks[1].title, "1 bounce in 20 emails");
  assert.equal(one.health, "healthy");
  assert.equal(bounces(20, 4).checks[1].ok, true, "four is still under what holds it");
  const five = bounces(20, 5);
  assert.equal(five.checks[1].ok, false);
  assert.equal(five.checks[1].title, "5 bounces in 20 emails");
  assert.equal(five.health, "attention");
  // From 150 emails on, the share is a fair measure, and the words are the share's.
  assert.equal(bounces(150, 4).checks[1].title, "Few bounces: 2.7%");
  assert.equal(bounces(150, 5).checks[1].title, "Bounces: 3.3%");
});

test("Healthy answers for every mailbox that sends: another's failure is named by its address", () => {
  const second = (over) => box({ address: "sam@getbrightline.example", host: "getbrightline.example", ...over });
  const fine = read([box(), second()]);
  assert.equal(fine.health, "healthy");
  assert.equal(fine.checks.length, 4, "the one shown says its four; a mailbox with nothing wrong adds no line");
  const failing = read([box(), second({ dns: { ...ALL_FOUND, dkim: "missing" } })]);
  assert.equal(failing.health, "attention");
  assert.equal(failing.from, "maya@brightlinecleaning.example", "the mailbox shown is still the first");
  assert.deepEqual(failing.checks.at(-1), {
    ok: false,
    title: "sam@getbrightline.example: Your domain is missing its DKIM record",
    detail: "Add it on Connections, so your emails reach inboxes",
  });
  const complained = read([
    box(),
    second({ counts: { sent: 500, bounced: 0, blocked: 0, complained: 1, unsubscribed: 0, said_no: 0 } }),
  ]);
  assert.equal(complained.health, "attention");
  assert.equal(complained.checks.at(-1).title, "sam@getbrightline.example: 1 spam complaint");
  const paused = read([box(), second({ state: "paused", dns: { ...ALL_FOUND, dkim: "missing" } })]);
  assert.equal(paused.health, "healthy", "a mailbox its owner paused sends nothing to answer for");
});

test("a mailbox that has sent nothing makes no claim about its bounces", () => {
  const s = read([box({ counts: null })]);
  assert.deepEqual(
    s.checks.map((c) => c.title),
    ["Your domain is set up to send"],
  );
});

test("a mailbox's standing outranks its checks", () => {
  assert.equal(read([box({ state: "held", held_why: "bounces" })]).health, "on_hold");
  assert.equal(read([box({ state: "reconnect" })]).health, "reconnect");
  assert.equal(read([box({ state: "paused" })]).health, "paused");
  assert.equal(read([box({ state: "removed" })]).health, "none");
  assert.equal(read([]).health, "none");
});

test("a mailbox that sends nothing has no pace to state", () => {
  assert.equal(read([box({ state: "reconnect" })]).pace, null);
  assert.equal(read([]).pace, null);
  assert.equal(read([]).from, null);
});

test("the month says what is included, never 'room for', and nothing where it could not be counted", () => {
  assert.equal(read([box()]).month, "34 sent, of 2,000 included");
  assert.equal(read([box()], { sent: null, of: 2000 }).month, null);
});
