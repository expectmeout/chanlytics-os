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
  MAILBOX_DAILY_CAP_MAX,
  MAILBOX_DNS_WORDS,
  MAILBOX_RAMP,
  REACH_OUT_COUNTRIES_FREE,
  REACH_OUT_COUNTRIES_REFUSED,
  chainIssueWords,
  customerDomainWords,
  holdDoors,
  mailboxActs,
  mailboxConnectOk,
  mailboxConnectWords,
  mailboxConnectionDtoOf,
  mailboxDailyCap,
  mailboxGmailSignsWords,
  mailboxHealthWords,
  mailboxHoldFixWords,
  mailboxHoldOf,
  mailboxHoldWords,
  mailboxRampShare,
  mailboxRecordRows,
  mailboxRowWords,
  mailboxSendingLines,
  mailboxSendsNow,
  mailboxWords,
  mailboxesFootWords,
  reachOutCountryOf,
  reachOutWritesFrom,
  validateReachOutChain,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-10-13T15:00:00.000Z");
/** The workspace's zone: every day and time a row says is its, whatever the zone the suite runs in. */
const TZ = "America/New_York";
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

test("a mailbox's own mail holds it: any complaint, or hard bounces and refusals, or unsubscribes past 3% of what it sent, of 150 at least; never a no", () => {
  const c = (sent, bounced = 0, complained = 0, unsubscribed = 0, blocked = 0, said_no = 0) => ({
    sent,
    bounced,
    blocked,
    complained,
    unsubscribed,
    said_no,
  });
  assert.equal(mailboxHoldOf(null), null);
  assert.equal(mailboxHoldOf(c(10, 0, 1)), "complaint", "one complaint, however few it sent");
  assert.equal(mailboxHoldOf(c(20, 4)), null, "four of its first emails: 3% of 150 is 4.5");
  assert.equal(mailboxHoldOf(c(20, 5)), "bounces", "five holds it");
  assert.equal(mailboxHoldOf(c(400, 12)), null, "3% of 400 is 12: not past it");
  assert.equal(mailboxHoldOf(c(400, 13)), "bounces");
  assert.equal(
    mailboxHoldOf(c(400, 6, 0, 0, 7)),
    "bounces",
    "a server refusing the sender counts beside a dead address",
  );
  assert.equal(mailboxHoldOf(c(400, 0, 0, 13)), "unsubscribes");
  assert.equal(mailboxHoldOf(c(400, 0, 0, 0, 0, 40)), null, "a polite no is a reply, never a hold");
  assert.equal(mailboxHoldOf(c(400, 13, 1, 13)), "complaint", "a complaint is said first");
  assert.equal(mailboxHoldWords("bounces"), "more than 3% of its recent emails bounced or were refused");
  assert.equal(mailboxHoldWords("unsubscribes"), "more than 3% of the businesses it wrote to unsubscribed");
  assert.equal(mailboxHoldWords(null), "it was held");
  assert.match(mailboxHoldFixWords("bounces"), /Check the addresses/);
  assert.equal(mailboxHealthWords(c(0)), null, "nothing to say before it sends");
  assert.equal(mailboxHealthWords(c(250, 1, 0, 2)), "0.4% bounced · 2 unsubscribed · none marked as spam");
  assert.equal(
    mailboxHealthWords(c(250, 1, 1, 2, 3, 4)),
    "0.4% bounced · 3 refused by the server · 2 unsubscribed · 4 said no · 1 marked as spam",
  );
});

test("a row says its day and its health from the counts its read carried, and a record DNS did not answer is never missing", () => {
  const counts = { sent: 250, bounced: 1, blocked: 0, complained: 0, unsubscribed: 0, said_no: 2 };
  const w = mailboxWords(row({ sent_days: 9, sent_today: 12, counts }), NOW, TZ);
  assert.deepEqual([w.day, w.health], ["12 of 20 today", "0.4% bounced · 2 said no · none marked as spam"]);
  assert.equal(mailboxWords(row({ sent_days: 9, sent_today: 20 }), NOW, TZ).pill, "Done for today");
  assert.equal(mailboxWords(row({ counts: null }), NOW, TZ).health, null);
  assert.equal(
    mailboxWords(row({ dns: {} }), NOW, TZ).fix,
    "Its records couldn't be read just now: Set up DNS checks them again.",
  );
  assert.equal(
    mailboxWords(row({ dns: { spf: "missing", dkim: "found", dmarc: "missing" }, spf_record: "v=spf1 -all" }), NOW, TZ)
      .fix,
    "Add its DMARC record in Set up DNS. Change its SPF record in Set up DNS.",
    "an SPF record the domain has is changed, never added beside",
  );
  const unread = mailboxRecordRows({ provider: "google", dns: { spf: "found" } });
  assert.deepEqual(
    unread.map((r) => [r.key, r.state, r.found]),
    [
      ["spf", "found", true],
      ["dkim", "unread", false],
      ["dmarc", "unread", false],
    ],
  );
});

test("SPF: the record the domain has, with the provider put in before its all; two records become one; none, a new one that ends ~all", () => {
  const spf = (provider, spf_record, spf_lookups = null) =>
    mailboxRecordRows({ provider, dns: { spf: "missing" }, spf_record, spf_lookups })[0];
  assert.equal(spf("google", null).value, "v=spf1 include:_spf.google.com ~all");
  assert.equal(spf("microsoft", null).value, "v=spf1 include:spf.protection.outlook.com ~all", "never -all");
  assert.equal(spf("google", null).note, null);
  const kept = spf("google", "v=spf1 include:mailgun.org ip4:192.0.2.1 -all", 3);
  assert.equal(kept.value, "v=spf1 include:mailgun.org ip4:192.0.2.1 include:_spf.google.com -all", "its own all kept");
  assert.match(kept.note, /may have only one: change it to this, which keeps every sender it names and adds Google/);
  assert.equal(
    spf("google", "v=spf1 a mx redirect=_spf.example.com").value,
    "v=spf1 a mx include:_spf.google.com redirect=_spf.example.com",
  );
  assert.equal(spf("microsoft", "v=spf1 a").value, "v=spf1 a include:spf.protection.outlook.com");
  const two = spf("google", "v=spf1 include:mailgun.org -all | v=spf1 a include:mailgun.org ~all");
  assert.equal(two.value, "v=spf1 include:mailgun.org a include:_spf.google.com ~all");
  assert.match(two.note, /2 SPF records, and with more than one none of them counts/);
  // The edge counts the record with the provider in it (Google's include spends four: itself and three netblocks).
  assert.match(spf("google", "v=spf1 a -all", 11).note, /spend 11 of SPF's 10 lookups and fail/);
  assert.doesNotMatch(spf("google", "v=spf1 a -all", 10).note, /lookups/, "ten is SPF's own limit, not past it");
  assert.equal(mailboxRecordRows({ provider: "google", dns: { spf: "found" }, spf_record: "v=spf1 a" })[0].note, null);
});

test("what each row says and offers, from its state: sending, done for the day, resting, paused, held, signed out", () => {
  const sending = mailboxWords(row({ sent_days: 9 }), NOW, TZ);
  assert.deepEqual([sending.pill, sending.tone, sending.day], ["Connected", "ok", "Up to 20 a day"]);
  assert.equal(sending.ramp, "Day 10 of its ramp · 20 a day, 30 after 5 more days of sending");
  assert.deepEqual(
    [mailboxWords(row(), NOW, TZ, 10).pill, mailboxWords(row(), NOW, TZ, 10).day],
    ["Done for today", "10 of 10 today"],
  );
  assert.equal(
    mailboxWords(row(), NOW, TZ).ramp,
    "New: its ramp starts today · 10 a day, 20 after 7 more days of sending",
  );
  assert.equal(
    mailboxWords(row({ customer_domain: true, sent_days: 30 }), NOW, TZ).ramp,
    `Customer domain: kept to ${CUSTOMER_DOMAIN_DAILY_MAX} a day`,
  );
  const resting = mailboxWords(row({ resting_until: new Date(NOW + 3_600_000).toISOString() }), NOW, TZ);
  assert.equal(resting.pill, "Done for today");
  assert.match(resting.day, /Google's own daily limit: it sends again from/);
  const held = mailboxWords(
    row({ state: "held", held_why: "complaint", held_at: "2026-10-12T09:00:00.000Z" }),
    NOW,
    TZ,
  );
  assert.deepEqual([held.pill, held.tone], ["Held", "warn"]);
  assert.match(held.day, /someone marked an email from it as spam/);
  const out = mailboxWords(row({ provider: "microsoft", state: "reconnect" }), NOW, TZ);
  assert.deepEqual([out.pill, out.tone], ["Reconnect", "danger"]);
  assert.match(out.day, /Microsoft signed it out/);
  assert.equal(mailboxWords(row({ state: "paused" }), NOW, TZ).pill, "Paused");
  assert.equal(
    mailboxWords(row({ dns: { spf: "found", dkim: "missing", dmarc: "missing" } }), NOW, TZ).fix,
    "Add its DKIM and DMARC record in Set up DNS.",
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

test("the row says what came in through it, never its ramp: when it was read, who wrote, and what keeps it from sending", () => {
  const read = new Date(NOW - 3 * 60_000).toISOString();
  const at = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(
    new Date(read),
  );
  const live = mailboxRowWords(row({ synced_at: read, came_in: 3, sent_days: 9, sent_today: 20 }), NOW, TZ);
  assert.deepEqual(
    live,
    { pill: "Connected", tone: "ok", cameIn: `Read at ${at} · 3 people wrote today`, standing: null, fix: null },
    "a mailbox at its sending cap still reads: Connected, and nothing of its day",
  );
  assert.equal(
    mailboxRowWords(row({ synced_at: read, came_in: 1 }), NOW, TZ).cameIn,
    `Read at ${at} · 1 person wrote today`,
  );
  assert.equal(
    mailboxRowWords(row({ synced_at: read, came_in: 0 }), NOW, TZ).cameIn,
    `Read at ${at} · No one wrote today`,
  );
  assert.equal(
    mailboxRowWords(row({ synced_at: read }), NOW, TZ).cameIn,
    `Read at ${at}`,
    "an unread count is left out",
  );
  assert.equal(mailboxRowWords(row(), NOW, TZ).cameIn, "Not read yet");
  const late = mailboxRowWords(row({ synced_at: new Date(NOW - 45 * 60_000).toISOString(), came_in: 2 }), NOW, TZ);
  assert.equal(late.cameIn, "Not read since today 10:15 AM · 2 people wrote today", "past 20 minutes, since when");
  const resting = mailboxRowWords(
    row({ synced_at: read, resting_until: new Date(NOW + 3_600_000).toISOString() }),
    NOW,
    TZ,
  );
  assert.deepEqual(
    [resting.pill, resting.standing],
    ["Connected", null],
    "Google's day for sending is its Sending lines'",
  );
  const paused = mailboxRowWords(row({ state: "paused", synced_at: read }), NOW, TZ);
  assert.deepEqual(
    [paused.pill, paused.standing],
    ["Paused", "You paused its sending: what people write still comes in."],
  );
  assert.match(paused.cameIn, /^Read at /, "a paused mailbox is still read");
  const held = mailboxRowWords(
    row({ state: "held", held_why: "complaint", held_at: "2026-10-12T09:00:00.000Z" }),
    NOW,
    TZ,
  );
  assert.deepEqual([held.pill, held.tone], ["Held", "warn"]);
  assert.match(held.standing, /^Its sending is held since Oct 12: someone marked an email from it as spam\.$/);
  assert.equal(held.fix, mailboxHoldFixWords("complaint"));
  const out = mailboxRowWords(row({ provider: "google", state: "reconnect", synced_at: read, came_in: 4 }), NOW, TZ);
  assert.deepEqual([out.pill, out.tone, out.cameIn], ["Reconnect", "danger", null], "signed out: nothing is read");
  assert.match(out.standing, /^Google signed it out: nothing is read from it or sent/);
  assert.equal(
    mailboxRowWords(row({ dns: { spf: "found", dkim: "missing", dmarc: "missing" } }), NOW, TZ).fix,
    "Add its DKIM and DMARC record in Set up DNS.",
  );
});

test("a day or a time a mailbox says is the workspace's, whatever zone the page is read in", () => {
  // Noon UTC on Oct 1 is the morning of Oct 1 in Los Angeles and one in the morning of Oct 2 in Auckland: the card said
  // the browser's day, so an owner away from home read the hold a day off.
  const held = row({ state: "held", held_why: "complaint", held_at: "2026-10-01T12:00:00.000Z" });
  assert.match(mailboxRowWords(held, NOW, "America/Los_Angeles").standing, /^Its sending is held since Oct 1: /);
  assert.match(mailboxRowWords(held, NOW, "Pacific/Auckland").standing, /^Its sending is held since Oct 2: /);
  assert.match(mailboxWords(held, NOW, "Pacific/Auckland").day, /^Held since Oct 2: /);
  assert.match(
    mailboxWords({ ...held, held_at: "2025-12-31T12:00:00.000Z" }, NOW, TZ).day,
    /^Held since Dec 31, 2025: /,
    "a hold from another year says its year",
  );
  assert.match(
    mailboxWords({ ...held, held_at: "not a moment" }, NOW, TZ).day,
    /^Held: /,
    "a moment that is none is left out",
  );
  // 14:57 UTC on Oct 13 is 10:57 in the morning in New York and 3:57 the next morning in Auckland.
  const read = row({ synced_at: "2026-10-13T14:57:00.000Z" });
  assert.equal(mailboxRowWords(read, NOW, TZ).cameIn, "Read at 10:57 AM");
  assert.equal(mailboxRowWords(read, NOW, "Pacific/Auckland").cameIn, "Read at 3:57 AM");
  // Past a late read, since when by the workspace's days: 03:30 UTC on Oct 13 was the night before in New York.
  const late = "2026-10-13T03:30:00.000Z";
  assert.equal(mailboxRowWords(row({ synced_at: late }), NOW, TZ).cameIn, "Not read since yesterday 11:30 PM");
  assert.equal(MAILBOX_DNS_WORDS.checked(late, TZ, NOW), "Checked yesterday 11:30 PM");
  assert.equal(MAILBOX_DNS_WORDS.checked(null, TZ, NOW), "Not checked yet");
  assert.equal(
    mailboxWords(row({ resting_until: "2026-10-13T16:00:00.000Z" }), NOW, TZ).day,
    "Google's own daily limit: it sends again from today 12:00 PM.",
  );
  const gmail = { provider: "google", from_name: "Sam at Harbor", signs: { gmail: "Sam", gmail_read_at: late } };
  assert.equal(
    mailboxGmailSignsWords(gmail, TZ, NOW).read,
    "Read from Gmail yesterday 11:30 PM. Saving reads it again.",
  );
});

test("its Sending lines: its day while it sends, its ramp, its health, the customer domain's ceiling, and the ramp's rule", () => {
  const counts = { sent: 250, bounced: 1, blocked: 0, complained: 0, unsubscribed: 0, said_no: 2 };
  assert.deepEqual(mailboxSendingLines(row({ sent_days: 9, sent_today: 12, counts }), NOW, TZ), [
    "12 of 20 today",
    "Day 10 of its ramp · 20 a day, 30 after 5 more days of sending",
    "0.4% bounced · 2 said no · none marked as spam",
    "A new mailbox starts at 10 a day and grows with the days it sends, to 40.",
  ]);
  const customer = mailboxSendingLines(row({ customer_domain: true, sent_days: 30 }), NOW, TZ);
  assert.ok(customer.includes(customerDomainWords("getharbor.example")), "the customer domain's ceiling, said once");
  const paused = mailboxSendingLines(row({ state: "paused" }), NOW, TZ);
  assert.equal(
    paused[0],
    "New: its ramp starts today · 10 a day, 20 after 7 more days of sending",
    "its row says it's paused",
  );
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
  assert.deepEqual([dto.spf_record, dto.spf_lookups, dto.sent_today, dto.counts], [null, null, null, null]);
  const kept = mailboxConnectionDtoOf(
    { ...row(), dns: { spf: "missing", spf_record: " v=spf1 a -all ", spf_lookups: 4 } },
    { sent_today: 3, counts: null },
  );
  assert.deepEqual([kept.spf_record, kept.spf_lookups, kept.sent_today], ["v=spf1 a -all", 4, 3]);
});

test("the owner's cap stops where the ramp does: 40", () => {
  assert.equal(MAILBOX_DAILY_CAP_MAX, 40);
  assert.equal(MAILBOX_DAILY_CAP_MAX, Math.max(...MAILBOX_RAMP.map((s) => s.perDay)));
});

test("a connect come back, in words: each reason the edge answers, and the rule once in the block's foot", () => {
  for (const code of [
    "connected",
    "reconnected",
    "declined",
    "scopes_missing",
    "taken",
    "too_many",
    "free_mail",
    "no_address",
    "unverified",
    "not_workspace",
    "no_mailbox",
    "wrong_account",
    "admin_consent",
    "admin_approved",
  ]) {
    assert.equal(mailboxConnectWords(code), MAILBOX_CONNECT_WORDS[code], code);
    assert.notEqual(MAILBOX_CONNECT_WORDS[code], MAILBOX_CONNECT_WORDS.failed, `${code} has words of its own`);
  }
  assert.deepEqual(["connected", "reconnected", "admin_approved", "declined", null].map(mailboxConnectOk), [
    true,
    true,
    true,
    false,
    false,
  ]);
  assert.equal(MAILBOX_CONNECT_WORDS.not_owner, "Only an owner can connect a mailbox.", "the page's own gate's words");
  assert.equal(mailboxConnectWords("something_new"), MAILBOX_CONNECT_WORDS.failed);
  assert.equal(mailboxConnectWords(null), MAILBOX_CONNECT_WORDS.failed);
  assert.match(mailboxesFootWords(0), /through Google or Microsoft/);
  assert.match(mailboxesFootWords(3), /comes into your Inbox/);
  assert.doesNotMatch(mailboxesFootWords(3), /a day/, "its ramp is its Sending lines', not the foot's");
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

test("the DNS sheet's count and states (the mailbox canvas's D1): found, to add, to change, to turn on, not read yet", async () => {
  const { mailboxDnsOf, mailboxRecordStateWords } = await import("@chanlytics/contracts");
  const d = mailboxDnsOf({ provider: "google", dns: { spf: "missing", dkim: "missing", dmarc: "found" } });
  assert.deepEqual([d.found, d.missing, d.total], [1, 2, 3]);
  assert.deepEqual(d.rows.map(mailboxRecordStateWords), ["Add this", "Turn on", "Found"]);
  const had = mailboxDnsOf({
    provider: "google",
    dns: { spf: "missing", dkim: "found" },
    spf_record: "v=spf1 include:mailgun.org ~all",
    spf_lookups: 2,
  });
  assert.deepEqual(had.rows.map(mailboxRecordStateWords), ["Change this", "Found", "Not read yet"]);
  assert.deepEqual([had.found, had.missing], [1, 1], "a record not read yet is neither found nor missing");
});
