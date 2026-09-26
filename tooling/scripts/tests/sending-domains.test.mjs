/**
 * A workspace's own sending domains, as contracts decides them (sending-domains.ts): what may be added, the ramp,
 * how a domain's facts become its state, and what the Connections row says. Pure; the edge reads the facts and
 * writes the row (lib/email/sending-domains.ts), and cron-domains-door.test.mjs runs it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
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
  sendingDomainActs,
  ownDomainAddress,
  sendingDomainDtoOf,
  domainPatchOf,
  domainHoldWords,
  isFreeMail,
  domainRecordRows,
  domainRecordsIntro,
  domainRegistrarHint,
  checkResultWords,
  domainHoldFixWords,
  sendingDomainsFootWords,
  domainHoldNoticeWords,
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

test("the ramp counts the days a domain actually sent, not the days since it was clean (D15): 30, then 100 after 14, 200 after 30", () => {
  assert.equal(domainDailyCap(0), 30);
  assert.equal(domainDailyCap(13), 30);
  assert.equal(domainDailyCap(14), 100);
  assert.equal(domainDailyCap(29), 100);
  assert.equal(domainDailyCap(30), 200);
  assert.equal(domainDailyCap(400), 200);
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
      counted_since: NOW_ISO,
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
  for (const p of ["failed", "partially_verified", "partially_failed", "not_started"])
    assert.deepEqual(
      judgeDomain(sending(), { provider: p, dmarc: "found" }, NOW_ISO),
      { ...sending(), state: "held", held_why: "verification", held_at: NOW_ISO, change: "held" },
      p,
    );
  // The provider no longer knowing the domain, or a word it never documented, is the account's fact: held as
  // provider on the second read in a row, as one bad answer is not a fact about anything.
  for (const p of ["not_found", "a word never heard"]) {
    assert.deepEqual(
      judgeDomain(sending(), { provider: p, dmarc: "found" }, NOW_ISO),
      { ...sending(), change: null },
      `${p}: once`,
    );
    assert.deepEqual(
      judgeDomain(sending({ provider_status: "unknown" }), { provider: p, dmarc: "found" }, NOW_ISO),
      {
        ...sending({ provider_status: "unknown" }),
        state: "held",
        held_why: "provider",
        held_at: NOW_ISO,
        change: "held",
      },
      `${p}: twice`,
    );
  }
  // The provider's own recheck state: one read is stored and waited on, two in a row hold (Part 2.5).
  assert.deepEqual(judgeDomain(sending(), { provider: "temporary_failure", dmarc: "found" }, NOW_ISO), {
    ...sending(),
    change: null,
  });
  assert.equal(
    judgeDomain(
      sending({ provider_status: "temporary_failure" }),
      { provider: "temporary_failure", dmarc: "found" },
      NOW_ISO,
    ).held_why,
    "verification",
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
  // A provider hold lifts the same way and keeps its ramp (its own test below).
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
  counted_since: null,
  sent_recent: null,
  bounced_recent: null,
  complaints: null,
  sent_days: 0,
  ...over,
});

test("the row's words, for every state: the pill, what is left to do, and the cap", () => {
  const records = sendingDomainWords(dto());
  assert.deepEqual([records.pill, records.tone, records.cap], ["Records to add", "warn", "Not sending yet"]);
  assert.match(records.line, /Add the records below at your registrar, then Check\./);
  assert.match(sendingDomainWords(dto({ provider_status: "failed" })).line, /weren't found/);
  assert.match(sendingDomainWords(dto({ provider_status: "verified", dmarc: "missing" })).line, /Add the DMARC record/);

  const checking = sendingDomainWords(dto({ state: "verifying", provider_status: "pending" }));
  assert.deepEqual([checking.pill, checking.tone], ["Checking", "info"]);

  // Verified sixty days ago, whatever it sent since: the ramp and its words read the days it sent (D15), and the next
  // step is the days still to send, never a date the days it rests on cannot promise.
  for (const [sent, cap, next, said] of [
    [0, "Up to 30 a day", "100 a day after 14 more days of sending", "nothing sent yet"],
    [1, "Up to 30 a day", "100 a day after 13 more days of sending", "1 day sending"],
    [13, "Up to 30 a day", "100 a day after 1 more day of sending", "13 days sending"],
    [14, "Up to 100 a day", "200 a day after 16 more days of sending", "14 days sending"],
    [20, "Up to 100 a day", "200 a day after 10 more days of sending", "20 days sending"],
    [29, "Up to 100 a day", "200 a day after 1 more day of sending", "29 days sending"],
    [30, "Up to 200 a day", null, "30 days sending"],
    [40, "Up to 200 a day", null, "40 days sending"],
  ]) {
    const w = sendingDomainWords(
      dto({ state: "verified", verified_at: daysAgo(60), clean_since: daysAgo(60), sent_days: sent }),
    );
    assert.deepEqual([w.pill, w.tone, w.cap, w.next], ["Verified", "ok", cap, next], `${sent} days`);
    assert.equal(w.line, `Sam at Best Movers · sam@getbestmovers.com · ${said}`);
  }
  // A hold says the share the days it had sent earned; a domain never clean had none.
  const heldAt = (over) =>
    sendingDomainWords(dto({ state: "held", held_why: "bounces", held_at: daysAgo(1), ...over })).cap;
  assert.equal(heldAt({ clean_since: daysAgo(60), sent_days: 20 }), "Sending nothing · was 100 a day");
  assert.equal(heldAt({ clean_since: null, sent_days: 0 }), "Sending nothing");

  for (const [why, words, next] of [
    ["verification", "it stopped verifying", "sends again by itself once the records read right"],
    ["dmarc", "its DMARC record is missing", "sends again by itself once the records read right"],
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
    );
    // What the hold costs: the day's share it had when it was held (clean six days by then: 30 a day).
    assert.deepEqual([w.pill, w.tone, w.cap], ["Held", "warn", "Sending nothing · was 30 a day"], why);
    assert.equal(w.line, `Held since Sep 22 · ${words}`);
    assert.match(w.next, new RegExp(next));
  }
  for (const d of [dto(), dto({ state: "verifying" }), dto({ state: "held", held_why: "dmarc", held_at: null })]) {
    const w = sendingDomainWords(d);
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
      counted_since: NOW_ISO,
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
    dto({
      state: "verified",
      clean_since: daysAgo(3),
      sent_recent: 250,
      bounced_recent: 1,
      complaints: 0,
      sent_days: 3,
    }),
  );
  assert.match(w.line, /3 days sending$/);
  assert.equal(w.stats, "0.4% bounced · none marked as spam", "how its mail has done, on its own line");
  const held = sendingDomainWords(dto({ state: "held", held_why: "bounces", held_at: daysAgo(1) }));
  assert.equal(held.next, "Nothing leaves from it until you resume it.");
  assert.match(held.line, /more than 2% of its recent emails bounced/);
});

test("the reputation count keeps its own clock: a DNS release restarts the ramp, never the count; verification and Resume set both (D9)", () => {
  const counted = daysAgo(20);
  const held = sending({
    state: "held",
    held_why: "dmarc",
    held_at: daysAgo(1),
    counted_since: counted,
    dmarc: "missing",
  });
  const released = judgeDomain(held, { provider: "verified", dmarc: "found", counts: null }, NOW_ISO);
  assert.deepEqual([released.change, released.clean_since, released.counted_since], ["released", NOW_ISO, counted]);
  const resumed = resumeDomain(
    sending({ state: "held", held_why: "complaint", held_at: daysAgo(1), counted_since: counted }),
    NOW_ISO,
  );
  assert.deepEqual([resumed.clean_since, resumed.counted_since], [NOW_ISO, NOW_ISO]);
  // A provider hold lifts itself, so the owner has nothing to resume.
  assert.equal(
    resumeDomain(sending({ state: "held", held_why: "provider", held_at: daysAgo(1) }), NOW_ISO).change,
    null,
  );
});

test("what the page may do with a domain comes from its state, once", () => {
  const cases = [
    [
      { state: "records", held_why: null },
      { check: true, resume: false, remove: true, records: true },
    ],
    [
      { state: "verifying", held_why: null },
      { check: true, resume: false, remove: true, records: true },
    ],
    [
      { state: "verified", held_why: null },
      { check: false, resume: false, remove: true, records: false },
    ],
    [
      { state: "held", held_why: "verification" },
      { check: true, resume: false, remove: true, records: true },
    ],
    [
      { state: "held", held_why: "dmarc" },
      { check: true, resume: false, remove: true, records: true },
    ],
    [
      { state: "held", held_why: "provider" },
      { check: true, resume: false, remove: true, records: false },
    ],
    [
      { state: "held", held_why: "bounces" },
      { check: false, resume: true, remove: true, records: false },
    ],
    [
      { state: "held", held_why: "complaint" },
      { check: false, resume: true, remove: true, records: false },
    ],
  ];
  for (const [d, acts] of cases) assert.deepEqual(sendingDomainActs(d), acts, JSON.stringify(d));
});

test("one spelling of an own domain's address, one DTO that never carries the provider's id, one patch of a judgement", () => {
  assert.equal(ownDomainAddress({ from_local: "Sam", host: "GetHarbor.com" }), "sam@getharbor.com");
  const dtoRow = {
    id: "d1",
    host: "getharbor.com",
    from_local: "sam",
    from_name: "Sam",
    state: "verified",
    held_why: null,
    held_at: null,
    verified_at: daysAgo(3),
    clean_since: daysAgo(3),
    counted_since: daysAgo(3),
    provider_status: "verified",
    dmarc: "found",
    records: [],
    checked_at: null,
    created_at: daysAgo(4),
    sent_recent: 3,
    bounced_recent: 0,
    complaints: 0,
    provider_domain_id: "pd-secret",
  };
  const d = sendingDomainDtoOf(dtoRow);
  assert.equal("provider_domain_id" in d, false);
  assert.equal(d.address, "sam@getharbor.com");
  const j = judgeDomain(sending(), { provider: "failed", dmarc: "found" }, NOW_ISO);
  assert.deepEqual(Object.keys(domainPatchOf(j)).sort(), [
    "clean_since",
    "counted_since",
    "dmarc",
    "held_at",
    "held_why",
    "state",
    "verified_at",
  ]);
  assert.equal(domainHoldWords("provider"), "the mail provider no longer has it");
});

test("free mail is one list: the finder and the domains read the same", () => {
  for (const h of ["gmail.com", "GMAIL.com ", "zoho.com", "proton.me", "mac.com"]) assert.equal(isFreeMail(h), true, h);
  assert.equal(isFreeMail("getharbor.com"), false);
  assert.equal(isFreeMail(null), false);
  assert.match(whyNotASendingHost("zoho.com", PLATFORM) ?? "", /free mail/);
});

test("a provider hold that lifts keeps the ramp: the account's blip is not the domain's fault (Part 2.5 review)", () => {
  const clean = daysAgo(20);
  const held = sending({
    state: "held",
    held_why: "provider",
    held_at: daysAgo(1),
    clean_since: clean,
    provider_status: "not_found",
  });
  const back = judgeDomain(held, { provider: "verified", dmarc: "found", counts: null }, NOW_ISO);
  assert.deepEqual([back.change, back.clean_since], ["released", clean]);
});

test("a domain being set up that the provider no longer has says to add it again", () => {
  const w = sendingDomainWords(dto({ state: "records", provider_status: "not_found" }));
  assert.match(w.line, /no longer has this domain\. Remove it and add it again\./);
});

test("the records as a registrar wants them: named from the domain, labelled by what they do, each saying whether it reads", () => {
  const d = dto({
    host: "getharbor.com",
    dmarc: "missing",
    records: [
      {
        label: "SPF",
        type: "MX",
        name: "send",
        value: "feedback-smtp.us-east-1.amazonses.com",
        priority: 10,
        status: "verified",
      },
      {
        label: "SPF",
        type: "TXT",
        name: "send.getharbor.com",
        value: "v=spf1 include:amazonses.com ~all",
        priority: null,
        status: "not_started",
      },
      { label: "DKIM", type: "TXT", name: "resend._domainkey", value: "p=MIGf", priority: null, status: "failed" },
    ],
  });
  const rows = domainRecordRows(d);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.type, r.name, r.priority, r.found]),
    [
      ["Return path", "MX", "send", 10, true],
      ["Sender (SPF)", "TXT", "send", null, false],
      ["Signing (DKIM)", "TXT", "resend._domainkey", null, false],
      ["Policy (DMARC)", "TXT", "_dmarc", null, false],
    ],
  );
  assert.equal(rows[3].value, "v=DMARC1; p=none;");
  assert.equal(domainRecordRows({ ...d, dmarc: "found" }).length, 3, "no DMARC row once it has one");
  assert.match(
    domainRecordsIntro("getharbor.com"),
    /^These records tell Gmail and others that Chanlytics may send as getharbor\.com\./,
  );
  assert.match(domainRegistrarHint("getharbor.com"), /Some registrars add getharbor\.com for you/);
});

test("a Check says what it found, in its own tone: never a success for records not there yet", () => {
  const verified = checkResultWords(dto({ state: "verified", clean_since: NOW_ISO, verified_at: NOW_ISO }));
  assert.deepEqual([verified.tone, verified.msg], ["ok", "getbestmovers.com is verified. It starts at 30 a day."]);
  const records = checkResultWords(dto({ state: "records" }));
  assert.equal(records.tone, "warn");
  assert.match(records.msg, /not found yet\. DNS changes can take a few hours\. Press Check again later\./);
  const verifying = checkResultWords(dto({ state: "verifying" }));
  assert.equal(verifying.tone, "info");
  assert.match(verifying.msg, /We look again every ten minutes; nothing to press\./);
  const dnsHeld = checkResultWords(dto({ state: "held", held_why: "dmarc", held_at: daysAgo(1) }));
  assert.equal(dnsHeld.tone, "warn");
  assert.match(dnsHeld.msg, /sends again by itself once the records read right/);
});

test("a row says what a hold costs and how to fix it; a verified row says how its mail has done on a line of its own", () => {
  const held = sendingDomainWords(
    dto({ state: "held", held_why: "bounces", held_at: daysAgo(1), clean_since: daysAgo(20), sent_days: 20 }),
  );
  assert.equal(held.cap, "Sending nothing · was 100 a day");
  assert.equal(held.fix, "Check the addresses you write to before you resume it.", "what to do, not the reason again");
  assert.equal(
    sendingDomainWords(dto({ state: "held", held_why: "provider", held_at: daysAgo(1) })).fix,
    null,
    "a provider hold lifts itself: nothing tells the owner to remove it",
  );
  const dns = sendingDomainWords(
    dto({ state: "held", held_why: "dmarc", held_at: daysAgo(1), clean_since: daysAgo(3) }),
  );
  assert.equal(dns.next, "It sends again by itself once the records read right, starting at 30 a day.");
  for (const why of ["verification", "dmarc", "bounces", "complaint", "provider"])
    assert.ok(domainHoldFixWords(why), why);
  const ok = sendingDomainWords(
    dto({
      state: "verified",
      clean_since: daysAgo(3),
      sent_recent: 250,
      bounced_recent: 1,
      complaints: 0,
      sent_days: 3,
    }),
  );
  assert.doesNotMatch(ok.line, /bounced/, "the stats are their own line");
  assert.equal(ok.stats, "0.4% bounced · none marked as spam");
  assert.equal(ok.next, "100 a day after 11 more days of sending", "the next step by the days still to send (D15)");
});

test("the foot says the rule once, the most there can be, and where replies and direct mail go", () => {
  const none = sendingDomainsFootWords(0, 5);
  assert.match(none, /No spare domain\? Buy one like get<yourbusiness>\.com, then add it here\./);
  assert.doesNotMatch(none, /never at risk/);
  assert.match(
    sendingDomainsFootWords(2, 5),
    /Mail sent straight to a domain's own address goes wherever that domain's mail goes\./,
  );
  assert.match(sendingDomainsFootWords(5, 5), /^Five is the most\. Remove one to add another\./);
});

test("a record's name, however the provider spells it: the domain itself is @, a trailing dot and capitals are the same name", () => {
  const rows = domainRecordRows(
    dto({
      host: "getharbor.com",
      dmarc: "found",
      records: [
        { label: "SPF", type: "TXT", name: "getharbor.com", value: "v=spf1 ~all", priority: null, status: "verified" },
        {
          label: "DKIM",
          type: "TXT",
          name: "Resend._DomainKey.GetHarbor.com.",
          value: "p=x",
          priority: null,
          status: "verified",
        },
        { label: "SPF", type: "MX", name: "send.other.example", value: "mx.example", priority: 10, status: "verified" },
      ],
    }),
  );
  assert.deepEqual(
    rows.map((r) => r.name),
    ["@", "resend._domainkey", "send.other.example"],
  );
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length, "each row its own key");
});

test("Check after a DNS hold lifts says it sends again, not that it is new", () => {
  const before = dto({ state: "held", held_why: "dmarc", held_at: daysAgo(1), clean_since: daysAgo(20) });
  const after = dto({ state: "verified", clean_since: NOW_ISO, verified_at: daysAgo(20) });
  assert.equal(checkResultWords(after, before).msg, "getbestmovers.com is sending again, starting at 30 a day.");
  assert.equal(checkResultWords(after).msg, "getbestmovers.com is verified. It starts at 30 a day.");
});

test("the owner's email says where to look, never 'below'", () => {
  for (const why of ["verification", "dmarc", "bounces", "complaint", "provider"]) {
    const words = domainHoldNoticeWords(why);
    assert.ok(words, why);
    assert.doesNotMatch(words, /below/, why);
  }
});

test("a held domain still answers for its reputation: a complaint during a DNS hold holds it for its owner, and outranks bounces (Part 2.6)", () => {
  const c = (sent, bounced, complained = 0) => ({ sent, bounced, complained });
  const since = new Date(NOW - 86_400_000).toISOString();
  // Held for DNS, the records now good, and a complaint arrived meanwhile: held for the complaint, not released.
  const dns = sending({ state: "held", held_why: "dmarc", held_at: since, dmarc: "missing" });
  const j = judgeDomain(dns, { provider: "verified", dmarc: "found", counts: c(40, 0, 1) }, NOW_ISO);
  assert.deepEqual([j.state, j.held_why, j.held_at, j.change], ["held", "complaint", NOW_ISO, "held"]);
  // A provider hold with bounces past the line: the owner's to resume now, not the provider's to lift.
  const lost = sending({ state: "held", held_why: "provider", held_at: since });
  assert.equal(
    judgeDomain(lost, { provider: "verified", dmarc: "found", counts: c(150, 4) }, NOW_ISO).held_why,
    "bounces",
  );
  // Held for bounces, then a complaint: held for the complaint, which is what Resume must weigh.
  const bounced = sending({ state: "held", held_why: "bounces", held_at: since });
  const worse = judgeDomain(bounced, { provider: null, dmarc: null, counts: c(150, 4, 1) }, NOW_ISO);
  assert.deepEqual([worse.held_why, worse.change], ["complaint", "held"]);
  // The same reason again changes nothing; a complaint hold is the last word until its owner resumes it.
  assert.equal(judgeDomain(bounced, { provider: null, dmarc: null, counts: c(150, 4) }, NOW_ISO).change, null);
  const complained = sending({ state: "held", held_why: "complaint", held_at: since });
  assert.equal(judgeDomain(complained, { provider: null, dmarc: null, counts: c(150, 9, 2) }, NOW_ISO).change, null);
  // A clean held domain lifts as before.
  assert.equal(
    judgeDomain(dns, { provider: "verified", dmarc: "found", counts: c(40, 0) }, NOW_ISO).change,
    "released",
  );
});

test("a row from an edge that does not say its days yet reads as none sent, never a NaN (either deploy order)", () => {
  const older = dto({ state: "verified", verified_at: daysAgo(5), clean_since: daysAgo(5) });
  delete older.sent_days;
  const w = sendingDomainWords(older);
  assert.deepEqual([w.cap, w.next], ["Up to 30 a day", "100 a day after 14 more days of sending"]);
  assert.match(w.line, /nothing sent yet$/);
  assert.equal(checkResultWords(older).msg, "getbestmovers.com is verified. It starts at 30 a day.");
  assert.equal(sendingDomainDtoOf({ ...older, sent_days: undefined }).sent_days, 0);
});
