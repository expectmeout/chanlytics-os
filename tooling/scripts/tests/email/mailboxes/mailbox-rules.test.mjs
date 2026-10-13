/**
 * A connected mailbox as contracts decides it (email/mailbox-connections.ts; decision 0056): the ramp by the days it
 * sent, the day's cap (its ramp, its owner's cap, the customer domain's ceiling), whether it sends now, which a step
 * writes from, the hold its own mail earns, what each row says and offers, the records its domain needs, and the words
 * of a connect come back. And the reach-out rules the decision adds beside them: a first email free of links, and the
 * country a business is in. Pure: the edge and the pages read these, so each is proved here once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_DOMAIN_DAILY_MAX,
  DMARC_RECOMMENDED,
  MAILBOX_CONNECTIONS_MAX,
  MAILBOX_CONNECT_WORDS,
  MAILBOX_RAMP,
  REACH_OUT_COUNTRIES_FREE,
  REACH_OUT_COUNTRIES_REFUSED,
  chainIssueWords,
  customerDomainWords,
  holdDoors,
  mailboxActs,
  mailboxConnectWords,
  mailboxConnectionDtoOf,
  mailboxDailyCap,
  mailboxHealthWords,
  mailboxHoldFixWords,
  mailboxHoldOf,
  mailboxHoldWords,
  mailboxRampShare,
  mailboxRecordRows,
  mailboxSendsNow,
  mailboxWords,
  mailboxesFootWords,
  reachOutCountryOf,
  reachOutWritesFrom,
  validateReachOutChain,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-10-13T15:00:00.000Z");
const row = (over = {}) => ({
  id: "m1",
  provider: "google",
  address: "sam@getharbor.example",
  host: "getharbor.example",
  from_name: "Sam",
  signature: null,
  state: "connected",
  held_why: null,
  held_at: null,
  resting_until: null,
  daily_cap: 40,
  customer_domain: false,
  sent_days: 0,
  dns: { spf: "found", dkim: "found", dmarc: "found", mx: "found" },
  dns_checked_at: null,
  last_error: null,
  connected_at: "2026-10-01T00:00:00.000Z",
  sent_at: null,
  ...over,
});

test("the ramp: 10, 20, 30 and 40 a day by the days a mailbox has sent on, never by the days it has been connected", () => {
  assert.deepEqual(
    MAILBOX_RAMP.map((s) => [s.days, s.perDay]),
    [
      [0, 10],
      [7, 20],
      [14, 30],
      [21, 40],
    ],
  );
  for (const [days, share] of [
    [0, 10],
    [6, 10],
    [7, 20],
    [13, 20],
    [14, 30],
    [21, 40],
    [400, 40],
    [-3, 10],
    [Number.NaN, 10],
  ])
    assert.equal(mailboxRampShare(days), share, String(days));
});

test("a day's cap is the least of its ramp's share, its owner's cap and the customer domain's ceiling", () => {
  assert.equal(
    mailboxDailyCap({ sent_days: 0, daily_cap: 40, customer_domain: false }),
    10,
    "new: the ramp's first step",
  );
  assert.equal(mailboxDailyCap({ sent_days: 30, daily_cap: 40, customer_domain: false }), 40);
  assert.equal(mailboxDailyCap({ sent_days: 30, daily_cap: 25, customer_domain: false }), 25, "its owner's cap");
  assert.equal(
    mailboxDailyCap({ sent_days: 30, daily_cap: 40, customer_domain: true }),
    CUSTOMER_DOMAIN_DAILY_MAX,
    "the domain its customers write to keeps to 20",
  );
  assert.equal(mailboxDailyCap({ sent_days: 30, daily_cap: 500, customer_domain: false }), 40, "never past the ramp");
  assert.equal(mailboxDailyCap({ sent_days: 30, daily_cap: 0, customer_domain: false }), 0);
});

test("a mailbox sends now only when connected and not resting for its provider's day; a step writes from its named or, naming none, every live one", () => {
  assert.equal(mailboxSendsNow({ state: "connected", resting_until: null }, NOW), true);
  for (const state of ["paused", "held", "reconnect", "removed"])
    assert.equal(mailboxSendsNow({ state, resting_until: null }, NOW), false, state);
  assert.equal(mailboxSendsNow({ state: "connected", resting_until: new Date(NOW + 1).toISOString() }, NOW), false);
  assert.equal(mailboxSendsNow({ state: "connected", resting_until: new Date(NOW).toISOString() }, NOW), true);
  assert.equal(
    reachOutWritesFrom({ id: "m1", state: "paused" }, []),
    true,
    "every live one: whether it sends is its day's",
  );
  assert.equal(reachOutWritesFrom({ id: "m1", state: "removed" }, []), false);
  assert.equal(reachOutWritesFrom({ id: "m1", state: "connected" }, ["m2"]), false);
  assert.equal(reachOutWritesFrom({ id: "m2", state: "connected" }, ["m2"]), true);
});

test("a mailbox's own mail holds it: any complaint, or bounces or noes past 3% of what it sent, of 150 at least", () => {
  const c = (sent, bounced = 0, complained = 0, unsubscribed = 0) => ({ sent, bounced, complained, unsubscribed });
  assert.equal(mailboxHoldOf(null), null);
  assert.equal(mailboxHoldOf(c(10, 0, 1)), "complaint", "one complaint, however few it sent");
  assert.equal(mailboxHoldOf(c(20, 4)), null, "four of its first emails: 3% of 150 is 4.5");
  assert.equal(mailboxHoldOf(c(20, 5)), "bounces", "five holds it");
  assert.equal(mailboxHoldOf(c(400, 12)), null, "3% of 400 is 12: not past it");
  assert.equal(mailboxHoldOf(c(400, 13)), "bounces");
  assert.equal(mailboxHoldOf(c(400, 0, 0, 13)), "unsubscribes");
  assert.equal(mailboxHoldOf(c(400, 13, 1, 13)), "complaint", "a complaint is said first");
  assert.equal(mailboxHoldWords("bounces"), "more than 3% of its recent emails bounced");
  assert.equal(mailboxHoldWords(null), "it was held");
  assert.match(mailboxHoldFixWords("bounces"), /Check the addresses/);
  assert.equal(mailboxHealthWords(c(0)), null, "nothing to say before it sends");
  assert.equal(mailboxHealthWords(c(250, 1, 0, 2)), "0.4% bounced · 2 said no · none marked as spam");
});

test("what each row says and offers, from its state: sending, done for the day, resting, paused, held, signed out", () => {
  const sending = mailboxWords(row({ sent_days: 9 }), NOW);
  assert.deepEqual([sending.pill, sending.tone, sending.day], ["Connected", "ok", "Up to 20 a day"]);
  assert.equal(sending.ramp, "Day 10 of its ramp · 20 a day, 30 after 5 more days of sending");
  assert.deepEqual(
    [mailboxWords(row(), NOW, 10).pill, mailboxWords(row(), NOW, 10).day],
    ["Done for today", "10 of 10 today"],
  );
  assert.equal(mailboxWords(row(), NOW).ramp, "New: its ramp starts today · 10 a day, 20 after 7 more days of sending");
  assert.equal(
    mailboxWords(row({ customer_domain: true, sent_days: 30 }), NOW).ramp,
    `Customer domain: kept to ${CUSTOMER_DOMAIN_DAILY_MAX} a day`,
  );
  const resting = mailboxWords(row({ resting_until: new Date(NOW + 3_600_000).toISOString() }), NOW);
  assert.equal(resting.pill, "Done for today");
  assert.match(resting.day, /Google's own daily limit: it sends again from/);
  const held = mailboxWords(row({ state: "held", held_why: "complaint", held_at: "2026-10-12T09:00:00.000Z" }), NOW);
  assert.deepEqual([held.pill, held.tone], ["Held", "warn"]);
  assert.match(held.day, /someone marked an email from it as spam/);
  const out = mailboxWords(row({ provider: "microsoft", state: "reconnect" }), NOW);
  assert.deepEqual([out.pill, out.tone], ["Reconnect", "danger"]);
  assert.match(out.day, /Microsoft signed it out/);
  assert.equal(mailboxWords(row({ state: "paused" }), NOW).pill, "Paused");
  assert.equal(
    mailboxWords(row({ dns: { spf: "found", dkim: "missing", dmarc: "missing" } }), NOW).fix,
    "Add its DKIM and DMARC record below.",
  );
  assert.deepEqual(mailboxActs(row()), {
    reconnect: false,
    resume: false,
    pause: true,
    unpause: false,
    test: true,
    remove: true,
  });
  assert.deepEqual(
    [mailboxActs(row({ state: "held" })).resume, mailboxActs(row({ state: "held" })).test],
    [true, false],
  );
  assert.equal(mailboxActs(row({ state: "reconnect" })).reconnect, true);
  assert.equal(mailboxActs(row({ state: "paused" })).unpause, true);
});

test("the records its domain needs, for the provider it is at, each found or not", () => {
  const g = mailboxRecordRows({ provider: "google", dns: { spf: "found", dkim: "missing" } });
  assert.deepEqual(
    g.map((r) => [r.key, r.type, r.name, r.found]),
    [
      ["spf", "TXT", "@", true],
      ["dkim", "TXT", "google._domainkey", false],
      ["dmarc", "TXT", "_dmarc", false],
    ],
  );
  assert.match(g[0].value, /include:_spf\.google\.com/);
  assert.equal(g[2].value, DMARC_RECOMMENDED);
  const m = mailboxRecordRows({ provider: "microsoft", dns: {} });
  assert.match(m[0].value, /spf\.protection\.outlook\.com/);
  assert.deepEqual([m[1].type, m[1].name], ["CNAME", "selector1._domainkey"]);
});

test("a row as either app reads it: its closed sets held, its records read as found or missing only, never a token's name", () => {
  const dto = mailboxConnectionDtoOf({
    ...row(),
    provider: "yahoo",
    state: "deleted",
    held_why: "rumour",
    dns: { spf: "found", dkim: "maybe", dmarc: "missing", nonsense: "found" },
    sent_days: null,
    credentials_ref: "mailbox-creds-m1",
  });
  assert.deepEqual([dto.provider, dto.state, dto.held_why, dto.sent_days], ["google", "removed", null, 0]);
  assert.deepEqual(dto.dns, { spf: "found", dmarc: "missing" });
  assert.equal("credentials_ref" in dto, false);
});

test("a connect come back, in words: each reason the edge answers, and the rule once in the block's foot", () => {
  for (const code of ["connected", "reconnected", "declined", "scopes_missing", "taken", "too_many", "free_mail"])
    assert.equal(mailboxConnectWords(code), MAILBOX_CONNECT_WORDS[code], code);
  assert.equal(mailboxConnectWords("something_new"), MAILBOX_CONNECT_WORDS.failed);
  assert.equal(mailboxConnectWords(null), MAILBOX_CONNECT_WORDS.failed);
  assert.match(mailboxesFootWords(0), /through Google or Microsoft/);
  assert.match(mailboxesFootWords(3), /starts at 10 a day/);
  assert.equal(mailboxesFootWords(MAILBOX_CONNECTIONS_MAX), "10 is the most. Remove one to add another.");
  assert.match(customerDomainWords("getharbor.example"), /20 a day at most.*getgetharbor\.example/);
});

test("a first email carries no link and no booking link (decision 0056, 7): the booking link goes in the nudge", () => {
  const chain = (body, next = "Just following up. {{booking link}}") => ({
    name: "Movers",
    search_id: "s1",
    include_unconfirmed: false,
    gap_minutes: 12,
    mailbox_ids: [],
    signed_by: "Sam",
    steps: [
      { subject: "A quick one", body, after_days: null, hand: null },
      { subject: null, body: next, after_days: 3, hand: null },
    ],
  });
  const linked = (body) =>
    validateReachOutChain(chain(body), { bookingLink: true }).filter((i) => i.problem === "first_has_a_link");
  assert.equal(linked("Saw your shop on the map.").length, 0, "the nudge may carry the booking link");
  assert.equal(linked("Book here: https://cal.example.com/sam").length, 1);
  assert.equal(linked("Book a time: {{booking link}}").length, 1);
  assert.equal(
    chainIssueWords(linked("www.example.com")[0]),
    "Keep your first email free of links: put your booking link in the nudge.",
  );
});

test("the country a business is in: the US, Canada and the UK go; Germany and Austria are never written to; anywhere else waits for its owner", () => {
  assert.deepEqual([...REACH_OUT_COUNTRIES_FREE].sort(), ["CA", "GB", "US"]);
  assert.deepEqual([...REACH_OUT_COUNTRIES_REFUSED].sort(), ["AT", "DE"]);
  for (const c of ["US", "us", " ca ", "GB", null, undefined, ""])
    assert.equal(reachOutCountryOf(c), "free", String(c));
  for (const c of ["DE", "at"]) assert.equal(reachOutCountryOf(c), "refused", c);
  for (const c of ["FR", "MX", "AU"]) assert.equal(reachOutCountryOf(c), "held", c);
  assert.deepEqual(holdDoors("abroad"), ["include", "skip"], "its owner includes it, or skips it");
});
