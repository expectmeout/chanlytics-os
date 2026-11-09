/**
 * Sending, in plain words: whether "Healthy" means something, what a mailbox can really send, and a pace that never
 * promises what the ramp's own rules would not give. All of it read over the rules Connections keeps, no second copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coldEmailSendingOf } from "@chanlytics/contracts";

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
  assert.equal(new1.customerHost, "brightlinecleaning.example");
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
  assert.equal(s.pace, "30 a day across 2 mailboxes");
});

test("every check passing is what Healthy means", () => {
  const s = read([box()]);
  assert.equal(s.health, "healthy");
  assert.deepEqual(s.checks, [
    { ok: true, title: "Your domain is set up to send", detail: "Its email records are in place" },
    { ok: true, title: "Few bounces: 0.4%", detail: "It pauses itself past 3%, so your name stays clean" },
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
