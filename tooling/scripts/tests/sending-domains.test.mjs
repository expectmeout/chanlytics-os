/**
 * A workspace's own sending domains, as contracts decides them (sending-domains.ts): what may be added, the ramp,
 * how a domain's facts become its state, and what the Connections row says. Pure; the edge reads the facts and
 * writes the row (lib/email/sending-domains.ts), and cron-domains-door.test.mjs runs it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanDays,
  domainDailyCap,
  judgeDomain,
  sendingDomainWords,
  whyNotAFromLocal,
  whyNotASendingHost,
  DMARC_RECOMMENDED,
  SENDING_DOMAINS_MAX,
  reputationHoldOf,
  resumeDomain,
  domainStatsWords,
} from "@chanlytics/contracts";

const PLATFORM = { mailDomain: "mail.chanlytics.com" };
const NOW = Date.parse("2026-09-25T15:00:00Z");
const NOW_ISO = new Date(NOW).toISOString();
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();

test("a domain the business owns may be added; anything else says why, in a sentence", () => {
  for (const ok of ["getbestmovers.com", "mail.getbestmovers.co.uk", "GetBestMovers.com", "getbestmovers.com."])
    assert.equal(whyNotASendingHost(ok, PLATFORM), null, ok);
  const why = (h) => whyNotASendingHost(h, PLATFORM);
  assert.match(why(""), /Write the domain/);
  assert.match(why("https://getbestmovers.com/a"), /domain alone/);
  assert.match(why("sam@getbestmovers.com"), /domain alone/);
  assert.match(why("www.getbestmovers.com"), /without www/);
  assert.match(why("gmail.com"), /free mail/);
  assert.match(why("outlook.com"), /free mail/);
  assert.match(why("mail.chanlytics.com"), /Chanlytics' own/);
  assert.match(why("chanlytics.com"), /Chanlytics' own/);
  assert.match(why("go.chanlytics.com"), /Chanlytics' own/);
  assert.match(why("localhost"), /isn't a domain/);
  assert.match(why("bad_label.com"), /isn't a domain/);
  assert.match(why(`${"a".repeat(250)}.com`), /isn't a domain/);
  assert.equal(
    whyNotASendingHost("chanlytics.com", { mailDomain: null }),
    null,
    "no platform domain, nothing to protect",
  );
  assert.equal(SENDING_DOMAINS_MAX, 5);
  assert.equal(DMARC_RECOMMENDED, "v=DMARC1; p=none;");
});

test("the part before the @ is a name people can write back to", () => {
  for (const ok of ["sam", "sam.lee", "sam-lee", "Sam"]) assert.equal(whyNotAFromLocal(ok), null, ok);
  assert.match(whyNotAFromLocal(""), /before the @/);
  assert.match(whyNotAFromLocal("a".repeat(41)), /40 characters/);
  assert.match(whyNotAFromLocal("noreply"), /kept for the mail system/);
  assert.match(whyNotAFromLocal("postmaster"), /kept for the mail system/);
  for (const bad of [".sam", "sam.", "sam..lee", "sam lee", "sam+x"])
    assert.match(whyNotAFromLocal(bad), /letters and numbers/, bad);
});

test("the ramp: nothing until verified, 30 a day, 100 after 14 clean days, 200 after 30", () => {
  assert.equal(domainDailyCap(null, NOW), 0);
  assert.equal(domainDailyCap(daysAgo(0), NOW), 30);
  assert.equal(domainDailyCap(daysAgo(13.9), NOW), 30);
  assert.equal(domainDailyCap(daysAgo(14), NOW), 100);
  assert.equal(domainDailyCap(daysAgo(29.9), NOW), 100);
  assert.equal(domainDailyCap(daysAgo(30), NOW), 200);
  assert.equal(domainDailyCap(daysAgo(400), NOW), 200);
  assert.equal(cleanDays(daysAgo(13.9), NOW), 13);
  assert.equal(cleanDays(null, NOW), 0);
});

const row = (over = {}) => ({
  state: "records",
  held_why: null,
  held_at: null,
  verified_at: null,
  clean_since: null,
  dmarc: null,
  ...over,
});
const sending = (over = {}) =>
  row({ state: "verified", verified_at: daysAgo(20), clean_since: daysAgo(20), dmarc: "found", ...over });

test("a domain being checked: verified with DMARC sends from now; anything short of that says what is left", () => {
  for (const state of ["records", "verifying"]) {
    assert.deepEqual(judgeDomain(row({ state }), { provider: "verified", dmarc: "found" }, NOW_ISO), {
      state: "verified",
      held_why: null,
      held_at: null,
      verified_at: NOW_ISO,
      clean_since: NOW_ISO,
      dmarc: "found",
      change: "verified",
    });
    assert.equal(judgeDomain(row({ state }), { provider: "verified", dmarc: "missing" }, NOW_ISO).state, "records");
    assert.equal(
      judgeDomain(row({ state }), { provider: "verified", dmarc: null }, NOW_ISO).state,
      state,
      "DNS unread",
    );
    for (const p of ["pending", "partially_verified", "temporary_failure"])
      assert.equal(judgeDomain(row({ state }), { provider: p, dmarc: "found" }, NOW_ISO).state, "verifying", p);
    for (const p of ["not_started", "failed", "partially_failed", "not_found", "a word never heard"])
      assert.equal(judgeDomain(row({ state }), { provider: p, dmarc: "found" }, NOW_ISO).state, "records", p);
  }
});

test("a sending domain that stops verifying or loses DMARC is held; one that reads well is left as it was", () => {
  for (const p of [
    "temporary_failure",
    "failed",
    "partially_verified",
    "partially_failed",
    "not_found",
    "a word never heard",
  ])
    assert.deepEqual(
      judgeDomain(sending(), { provider: p, dmarc: "found" }, NOW_ISO),
      { ...sending(), state: "held", held_why: "verification", held_at: NOW_ISO, change: "held" },
      p,
    );
  assert.deepEqual(judgeDomain(sending(), { provider: "verified", dmarc: "found" }, NOW_ISO), {
    ...sending(),
    change: null,
  });
});

test("a check in progress is not a failure: a verified domain reading 'pending' stays verified, the owner's Check included", () => {
  // The provider marks a domain pending whatever it was when it is asked to verify (resend-node #823).
  assert.deepEqual(judgeDomain(sending(), { provider: "pending", dmarc: "found" }, NOW_ISO), {
    ...sending(),
    change: null,
  });
});

test("a missing DMARC record holds a domain only on the second read in a row: one read from a nameserver mid-move is not", () => {
  const first = judgeDomain(sending(), { provider: "verified", dmarc: "missing" }, NOW_ISO);
  assert.deepEqual(first, { ...sending(), dmarc: "missing", change: null }, "stored, not held");
  const second = judgeDomain(first, { provider: "verified", dmarc: "missing" }, NOW_ISO);
  assert.deepEqual([second.state, second.held_why, second.change], ["held", "dmarc", "held"]);
  assert.equal(second.clean_since, sending().clean_since, "the clean days stop counting only once it is released");
  const back = judgeDomain(first, { provider: "verified", dmarc: "found" }, NOW_ISO);
  assert.deepEqual(back, { ...sending(), change: null }, "the second read cleared it: nothing happened");
});

test("we could not look is not a fact about the domain: an unreadable provider or DNS changes nothing", () => {
  for (const r of [
    row(),
    row({ state: "verifying" }),
    sending(),
    sending({ state: "held", held_why: "dmarc", held_at: daysAgo(1) }),
  ]) {
    assert.deepEqual(judgeDomain(r, { provider: null, dmarc: "found" }, NOW_ISO), { ...r, change: null });
  }
  assert.deepEqual(judgeDomain(sending(), { provider: "verified", dmarc: null }, NOW_ISO), {
    ...sending(),
    change: null,
  });
});

test("a DNS hold lifts itself when both read good, and the ramp starts again; a reputation hold waits for its owner", () => {
  for (const why of ["verification", "dmarc"]) {
    const held = sending({
      state: "held",
      held_why: why,
      held_at: daysAgo(1),
      dmarc: why === "dmarc" ? "missing" : "found",
    });
    assert.deepEqual(judgeDomain(held, { provider: "verified", dmarc: "found" }, NOW_ISO), {
      ...held,
      state: "verified",
      held_why: null,
      held_at: null,
      clean_since: NOW_ISO,
      dmarc: "found",
      change: "released",
    });
    assert.equal(
      judgeDomain(held, { provider: "pending", dmarc: "found" }, NOW_ISO).state,
      "held",
      "a check in progress lifts nothing",
    );
    assert.equal(judgeDomain(held, { provider: "verified", dmarc: "missing" }, NOW_ISO).state, "held");
  }
  for (const why of ["bounces", "complaint"]) {
    const held = sending({ state: "held", held_why: why, held_at: daysAgo(1) });
    assert.deepEqual(judgeDomain(held, { provider: "verified", dmarc: "found" }, NOW_ISO), { ...held, change: null });
  }
});

const dto = (over = {}) => ({
  id: "d1",
  host: "getbestmovers.com",
  from_local: "sam",
  from_name: "Sam at Best Movers",
  address: "sam@getbestmovers.com",
  state: "records",
  held_why: null,
  held_at: null,
  verified_at: null,
  clean_since: null,
  provider_status: "not_started",
  dmarc: null,
  records: [],
  checked_at: null,
  created_at: daysAgo(1),
  ...over,
});

test("the row's words, for every state: the pill, what is left to do, and the cap", () => {
  const records = sendingDomainWords(dto(), NOW);
  assert.deepEqual([records.pill, records.tone, records.cap], ["Records to add", "warn", "Not sending yet"]);
  assert.match(records.line, /Add the records below at your registrar, then Check\./);
  assert.match(sendingDomainWords(dto({ provider_status: "failed" }), NOW).line, /weren't found/);
  assert.match(
    sendingDomainWords(dto({ provider_status: "verified", dmarc: "missing" }), NOW).line,
    /Add the DMARC record/,
  );

  const checking = sendingDomainWords(dto({ state: "verifying", provider_status: "pending" }), NOW);
  assert.deepEqual([checking.pill, checking.tone], ["Checking", "info"]);

  for (const [days, cap, next] of [
    [3, "Up to 30 a day", "100 a day after 14 clean days"],
    [20, "Up to 100 a day", "200 a day after 30 clean days"],
    [40, "Up to 200 a day", null],
  ]) {
    const w = sendingDomainWords(
      dto({ state: "verified", verified_at: daysAgo(days), clean_since: daysAgo(days) }),
      NOW,
    );
    assert.deepEqual([w.pill, w.tone, w.cap, w.next], ["Verified", "ok", cap, next], `${days} days`);
    assert.match(w.line, new RegExp(`^Sam at Best Movers · sam@getbestmovers\\.com · ${days} clean days$`));
  }
  assert.match(
    sendingDomainWords(dto({ state: "verified", verified_at: daysAgo(1.5), clean_since: daysAgo(1.5) }), NOW).line,
    /· 1 clean day$/,
  );

  for (const [why, words, next] of [
    ["verification", "it stopped verifying", "until Check passes"],
    ["dmarc", "its DMARC record is missing", "until Check passes"],
    ["bounces", "more than 2% of its recent emails bounced", "until you resume it"],
    ["complaint", "someone marked an email from it as spam", "until you resume it"],
  ]) {
    const w = sendingDomainWords(
      dto({
        state: "held",
        held_why: why,
        held_at: "2026-09-22T12:00:00Z",
        verified_at: daysAgo(9),
        clean_since: daysAgo(9),
      }),
      NOW,
    );
    assert.deepEqual([w.pill, w.tone, w.cap], ["Held", "warn", "Sending nothing"], why);
    assert.equal(w.line, `Held since Sep 22 · ${words}`);
    assert.match(w.next, new RegExp(next));
  }
  for (const d of [dto(), dto({ state: "verifying" }), dto({ state: "held", held_why: "dmarc", held_at: null })]) {
    const w = sendingDomainWords(d, NOW);
    for (const s of [w.pill, w.line, w.cap, w.next].filter((x) => x !== null))
      assert.doesNotMatch(s, /undefined|null|NaN/, JSON.stringify(d.state));
  }
});

test("a domain answers for its reputation: any complaint holds it; bounces hold it past 2% of what it sent, over at least 150", () => {
  const c = (sent, bounced, complained = 0) => ({ sent, bounced, complained });
  for (const [counts, hold] of [
    [c(30, 3), null],
    [c(30, 4), "bounces"],
    [c(150, 3), null],
    [c(150, 4), "bounces"],
    [c(500, 10), null], // exactly 2%
    [c(500, 11), "bounces"],
    [c(40, 0, 1), "complaint"],
    [c(500, 30, 1), "complaint"], // a complaint outranks bounces
    [null, null],
  ])
    assert.equal(reputationHoldOf(counts), hold, JSON.stringify(counts));

  const held = judgeDomain(sending(), { provider: "verified", dmarc: "found", counts: c(150, 4) }, NOW_ISO);
  assert.deepEqual([held.state, held.held_why, held.held_at, held.change], ["held", "bounces", NOW_ISO, "held"]);
  const spam = judgeDomain(sending(), { provider: "verified", dmarc: "found", counts: c(10, 0, 1) }, NOW_ISO);
  assert.equal(spam.held_why, "complaint");
  // Uncounted is not clean or dirty: nothing changes.
  assert.deepEqual(judgeDomain(sending(), { provider: "verified", dmarc: "found", counts: null }, NOW_ISO), {
    ...sending(),
    change: null,
  });
  // Counted from our own rows: a complaint holds even when the provider could not be asked.
  const blind = judgeDomain(sending(), { provider: null, dmarc: null, counts: c(10, 0, 1) }, NOW_ISO);
  assert.deepEqual([blind.state, blind.held_why, blind.change], ["held", "complaint", "held"]);
  // A reputation hold waits for its owner, whatever the records say.
  assert.equal(judgeDomain(held, { provider: "verified", dmarc: "found", counts: c(0, 0) }, NOW_ISO).state, "held");
});

test("Resume lifts a reputation hold only, and the ramp starts again from today", () => {
  for (const why of ["bounces", "complaint"]) {
    const held = sending({ state: "held", held_why: why, held_at: daysAgo(1) });
    assert.deepEqual(resumeDomain(held, NOW_ISO), {
      ...held,
      state: "verified",
      held_why: null,
      held_at: null,
      clean_since: NOW_ISO,
      change: "resumed",
    });
  }
  for (const r of [
    sending({ state: "held", held_why: "verification", held_at: daysAgo(1) }),
    sending({ state: "held", held_why: "dmarc", held_at: daysAgo(1) }),
    sending(),
    row({ state: "records" }),
  ])
    assert.deepEqual(resumeDomain(r, NOW_ISO), { ...r, change: null }, JSON.stringify(r));
});

test("a verified domain's line says how its mail has done, once it has sent some", () => {
  assert.equal(
    domainStatsWords({ sent_recent: 250, bounced_recent: 1, complaints: 0 }),
    "0.4% bounced · none marked as spam",
  );
  assert.equal(domainStatsWords({ sent_recent: 3, bounced_recent: 0, complaints: 2 }), "0% bounced · 2 marked as spam");
  assert.equal(
    domainStatsWords({ sent_recent: 0, bounced_recent: 0, complaints: 0 }),
    null,
    "nothing sent, nothing said",
  );
  assert.equal(domainStatsWords({ sent_recent: null, bounced_recent: null, complaints: null }), null);
  const w = sendingDomainWords(
    dto({ state: "verified", clean_since: daysAgo(3), sent_recent: 250, bounced_recent: 1, complaints: 0 }),
    NOW,
  );
  assert.match(w.line, /3 clean days · 0\.4% bounced · none marked as spam$/);
  const held = sendingDomainWords(dto({ state: "held", held_why: "bounces", held_at: daysAgo(1) }), NOW);
  assert.equal(held.next, "Nothing leaves from it until you resume it.");
  assert.match(held.line, /more than 2% of its recent emails bounced/);
});
