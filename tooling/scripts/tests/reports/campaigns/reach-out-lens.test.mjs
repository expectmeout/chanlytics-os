/**
 * The Campaigns lens's Reach-outs part, in businesses (contracts reports/campaigns/reach-out-lens.ts): the page-only fold
 * that says every sentence the part draws from the ReachOutReportDto -- the strip of emails written, landed and bounced
 * against the period before, the emails and the businesses counted apart (an outcome is a share of businesses, never of
 * emails), the angles of the businesses whose last email had them, the sources a chain and a step at a time, the mailboxes
 * and the days. EXECUTED: the real fold over a salon with a reach-out built here. Run it under TEST_TZ=Pacific/Auckland
 * too: the fold reads a clock only through the workspace's own zone.
 *
 * It is the only fold of the report: the first one (in emails alone) and its cases went on 11 Oct 2026; the 6 PM line and each
 * chain's totals are tested in reach-out-back/report-words.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REPORT_MIN_N, toReachOutLensVM } from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-28T22:00:00.000Z");
const counts = (over = {}) => ({
  written: 0,
  delivered: 0,
  bounced: 0,
  wrote_back: 0,
  interested: 0,
  booked: 0,
  said_no: 0,
  handed: 0,
  ...over,
});
const step = (id, n, over = {}) => ({ id, n, hand: null, ...counts(over) });
/** Two chains of two steps: the first writes 30 emails to 20 businesses (5 wrote back), the second 10 to 5 (1 wrote back). */
const chains = () => [
  {
    root_id: "r1",
    name: "Trainers in Austin",
    state: "running",
    search: { id: "s1", name: "Personal trainers · Austin" },
    last_at: "2026-09-23T15:00:00.000Z",
    runs: 2,
    steps: [
      step("p1", 0, {
        written: 18,
        delivered: 16,
        bounced: 1,
        businesses: 12,
        wrote_back: 3,
        interested: 2,
        booked: 1,
      }),
      step("p2", 1, { written: 12, delivered: 11, businesses: 8, wrote_back: 2, interested: 1, said_no: 1 }),
    ],
  },
  {
    root_id: "r2",
    name: "Studios nearby",
    state: "running",
    search: null,
    last_at: "2026-09-26T15:00:00.000Z",
    runs: 1,
    steps: [
      step("q1", 0, { written: 6, delivered: 5, bounced: 1, businesses: 3, wrote_back: 1, said_no: 1 }),
      step("q2", 1, { written: 4, delivered: 4, businesses: 2 }),
    ],
  },
];
/** The salon with a reach-out: 40 emails (36 delivered, 2 bounced) to 25 businesses, 30 emails the 30 days before. */
const report = (over = {}) => ({
  timezone: "America/Chicago",
  days: 30,
  today: "2026-09-28",
  since: "2026-08-30",
  has_reach_out: true,
  totals: counts({
    written: 40,
    delivered: 36,
    bounced: 2,
    businesses: 25,
    wrote_back: 6,
    interested: 3,
    booked: 1,
    said_no: 2,
  }),
  before: { written: 30, delivered: 27, bounced: 1 },
  series: [
    { day: "2026-09-22", written: 10 },
    { day: "2026-09-23", written: 30 },
  ],
  chains: chains(),
  angles: [
    { angle: "their rating", written: 20, businesses: 8, wrote_back: 2 },
    { angle: "mid-session calls", written: 8, businesses: 4, wrote_back: 2 },
    { angle: "a local mention", written: 2, businesses: 0, wrote_back: 0 },
  ],
  other_angles: { written: 0, businesses: 0, wrote_back: 0 },
  no_angle: 10,
  mailboxes: [
    {
      address: "sam@mail.example.com",
      state: "connected",
      held_why: null,
      held_at: null,
      sent: 40,
      delivered: 36,
      bounced: 2,
      complained: 0,
    },
  ],
  ...over,
});
/** The same salon on a database before 00404: no `businesses` anywhere, and no period before. */
const before00404 = () => {
  const dto = report();
  delete dto.totals.businesses;
  delete dto.before;
  for (const a of dto.angles) delete a.businesses;
  delete dto.other_angles.businesses;
  for (const c of dto.chains) for (const s of c.steps) delete s.businesses;
  return dto;
};
/** A period that wrote nothing (on a database that counts businesses, so it has 0 of them). */
const NOTHING = { totals: counts({ businesses: 0 }), chains: [], angles: [], mailboxes: [], no_angle: 0, series: [] };
const tile = (t) => [t.id, t.metric, t.label, t.value, t.meta, t.compare];
const rows = (part) => part.rows.map((r) => [r.label, r.value]);
const vm = (over, nowMs = NOW) => toReachOutLensVM(report(over), nowMs);

test("the strip: emails written, landed and bounced against the period before", () => {
  const { strip } = vm();
  assert.deepEqual(strip.map(tile), [
    ["emails-written", "emails_written", "Emails written", "40", "25 businesses written to", "up from 30"],
    ["emails-landed", "emails_landed", "Landed", "90%", "36 of 40 emails delivered", "was 90% the 30 days before"],
    ["emails-bounced", "emails_bounced", "Bounced", "2", "2 of 40 emails bounced", "up from 1"],
  ]);
  // The landed share is of the emails written, and says so: the kit greys it under five.
  assert.deepEqual([strip[1].n, strip[1].minN], [40, REPORT_MIN_N]);
  assert.equal(REPORT_MIN_N, 5);
  assert.deepEqual([strip[0].n, strip[2].n], [undefined, undefined], "a count is of nothing");
  // Plain ink: no tone on any (a bounce is counted, not a failure of the lens).
  assert.deepEqual(
    strip.map((t) => t.tone),
    [undefined, undefined, undefined],
  );
});

test("the strip against the period before: none where it is absent, nothing written, or the same", () => {
  const compares = (over) => vm(over).strip.map((t) => t.compare);
  const none = report();
  delete none.before;
  assert.deepEqual(
    toReachOutLensVM(none, NOW).strip.map((t) => t.compare),
    [null, null, null],
    "no period before in the answer (a database before 00404)",
  );
  assert.deepEqual(
    compares({ before: { written: 0, delivered: 0, bounced: 0 } }),
    [null, null, null],
    "the period before wrote nothing: nothing to set it against, never 'none' or 'up from 0'",
  );
  assert.deepEqual(compares({ before: { written: 40, delivered: 36, bounced: 2 } }), [
    "same as the 30 days before",
    "was 90% the 30 days before",
    "same as the 30 days before",
  ]);
  // Fewer written, fewer bounced; the share is said against the share, never a percentage of a percentage.
  assert.deepEqual(compares({ before: { written: 80, delivered: 40, bounced: 8 } }), [
    "down from 80",
    "was 50% the 30 days before",
    "down from 8",
  ]);
  // Nothing bounced the period before and something did now: a count that rose from none.
  assert.deepEqual(compares({ before: { written: 30, delivered: 27, bounced: 0 } }).at(2), "none the 30 days before");
  // A period that wrote nothing against one that did.
  assert.deepEqual(
    vm({ ...NOTHING }).strip.map((t) => t.compare),
    ["down from 30", null, "down from 1"],
  );
});

test("a period before of fewer than five emails is set beside this one as a count, never as a share (D9)", () => {
  const landed = (before, over = {}) => vm({ before, ...over }).strip[1].compare;
  // Three emails before, two delivered: "was 67%" would be a share of three.
  assert.equal(landed({ written: 3, delivered: 2, bounced: 0 }), "was 2 of 3 the 30 days before");
  assert.equal(landed({ written: 1, delivered: 1, bounced: 0 }), "was 1 of 1 the 30 days before");
  assert.equal(landed({ written: 4, delivered: 0, bounced: 4 }), "was 0 of 4 the 30 days before");
  // Five is enough, as everywhere else.
  assert.equal(landed({ written: 5, delivered: 4, bounced: 0 }), "was 80% the 30 days before");
  // None before, or nothing written now: no compare.
  assert.equal(landed({ written: 0, delivered: 0, bounced: 0 }), null);
  assert.equal(landed({ written: 3, delivered: 2, bounced: 0 }, NOTHING), null);
  // The other two compares are counts already, and stay: the whole strip says no percentage for a period before of three.
  const small = vm({ before: { written: 3, delivered: 2, bounced: 1 } }).strip;
  assert.deepEqual(
    small.map((t) => t.compare),
    ["up from 3", "was 2 of 3 the 30 days before", "up from 1"],
  );
  assert.doesNotMatch(JSON.stringify(small.map((t) => t.compare)), /%/);
  // A day, and a window that ended, say the period before the way they do everywhere.
  assert.equal(landed({ written: 3, delivered: 2, bounced: 0 }, { days: 1 }), "was 2 of 3 the day before");
  assert.equal(
    landed({ written: 3, delivered: 2, bounced: 0 }, { days: 20, end: "2026-09-20" }),
    "was 2 of 3 the 20 days before",
  );
});

test("the strip says a zero as 0 and a share of nothing as a dash, with words", () => {
  const { strip } = vm({ ...NOTHING });
  assert.deepEqual(strip.map(tile), [
    ["emails-written", "emails_written", "Emails written", "0", "0 businesses written to", "down from 30"],
    ["emails-landed", "emails_landed", "Landed", "—", "nothing written", null],
    ["emails-bounced", "emails_bounced", "Bounced", "0", "none bounced", "down from 1"],
  ]);
  // Few emails: the share is said, with the count it is of, for the kit to grey (D9).
  const few = vm({ totals: counts({ written: 4, delivered: 3, businesses: 3 }) }).strip;
  assert.deepEqual([few[1].value, few[1].n, few[1].minN], ["75%", 4, 5]);
  assert.equal(few[1].meta, "3 of 4 emails delivered");
  assert.equal(
    vm({ totals: counts({ written: 1, delivered: 1, businesses: 1 }) }).strip[1].meta,
    "1 of 1 email delivered",
  );
  assert.equal(few[0].meta, "3 businesses written to");
  assert.equal(
    vm({ totals: counts({ written: 1, businesses: 1 }) }).strip[0].meta,
    "1 business written to",
    "one business, singular",
  );
});

test("on a database before 00404 the strip counts emails alone, and says nothing of businesses", () => {
  const { strip } = toReachOutLensVM(before00404(), NOW);
  assert.deepEqual(
    strip.map((t) => [t.value, t.meta, t.compare]),
    [
      ["40", "40 emails", null],
      ["90%", "36 of 40 emails delivered", null],
      ["2", "2 of 40 emails bounced", null],
    ],
  );
  const quiet = { ...before00404(), totals: counts(), chains: [], angles: [], series: [], mailboxes: [] };
  assert.equal(toReachOutLensVM(quiet, NOW).strip[0].meta, "none in this period");
});

test("emails and businesses are counted apart, and each outcome is a share of businesses", () => {
  const { emails, businesses } = vm();
  assert.deepEqual(rows(emails), [
    ["Written", 40],
    ["Delivered", 36],
    ["Bounced", 2],
  ]);
  assert.equal(
    emails.line,
    "Of 40 emails written in these 30 days: 90% were delivered and 5% bounced. No opens: only what came back.",
  );
  assert.equal(emails.empty, null);
  assert.deepEqual(rows(businesses), [
    ["Written to", 25],
    ["Wrote back", 6],
    ["Interested", 3],
    ["Booked", 1],
    ["Said no", 2],
  ]);
  assert.equal(
    businesses.line,
    "Of 25 businesses written to in these 30 days: 24% wrote back and 12% were interested. Each counts once, at the last email that wrote to it; a question counts as interested. Who wrote back, was interested, booked or said no is as it stands now.",
  );
  assert.equal(businesses.empty, null);
  // The bars measure against the largest in their own list: a unit never mixes in one list.
  assert.deepEqual(
    emails.rows.map((r) => r.share),
    [1, 0.9, 0.05],
  );
  assert.deepEqual(
    businesses.rows.map((r) => r.id),
    ["written_to", "wrote_back", "interested", "booked", "said_no"],
  );
});

test("a share is said only of five or more, and a count under that", () => {
  const few = vm({
    totals: counts({ written: 4, delivered: 3, bounced: 1, businesses: 4, wrote_back: 2, interested: 1 }),
  });
  assert.equal(few.emails.line, "Of 4 emails written in these 30 days. No opens: only what came back.");
  assert.match(few.businesses.line, /^Of 4 businesses written to in these 30 days\. Each counts once/);
  for (const line of [few.emails.line, few.businesses.line]) assert.doesNotMatch(line, /%/);
  // Five is enough.
  const five = vm({ totals: counts({ written: 5, delivered: 5, businesses: 5, wrote_back: 1 }) });
  assert.match(five.emails.line, /: 100% were delivered and 0% bounced\./);
  assert.match(five.businesses.line, /: 20% wrote back and 0% were interested\./);
  // One email, one business: the singular.
  const one = vm({ totals: counts({ written: 1, delivered: 1, businesses: 1 }) });
  assert.match(one.emails.line, /^Of 1 email written in/);
  assert.match(one.businesses.line, /^Of 1 business written to in/);
});

test("on a database before 00404 the businesses part says it does not count them, and the emails part stands", () => {
  const old = toReachOutLensVM(before00404(), NOW);
  assert.deepEqual(old.businesses, {
    rows: [],
    line: null,
    empty: "This database does not count businesses yet.",
  });
  assert.deepEqual(old.emails, vm().emails, "the emails part is the same words and numbers");
  // It does not guess a unit from the emails: nothing in the angles or the sources is a share of emails either.
  assert.deepEqual(old.angles, { rows: [], line: null, empty: "This database does not count businesses yet." });
  const chain = old.sources.find((s) => s.kind === "chain");
  assert.deepEqual([chain.businesses, chain.wroteBack], ["—", "5"], "no businesses to divide by: the count alone");
});

test("angles are of the businesses whose last email had them", () => {
  const { angles } = vm();
  assert.deepEqual(
    angles.rows.map((r) => [r.id, r.label, r.value, r.display]),
    [
      ["their rating", "their rating", 25, "2 of 8  25%"],
      ["mid-session calls", "mid-session calls", 50, "2 of 4"],
      ["a local mention", "a local mention", 0, "—"],
    ],
  );
  // Who answered is state now, and the line says so where the bars are drawn (the fold said it on the businesses line alone).
  assert.equal(
    angles.line,
    "The opening written for each business, and who answered, as they stand now. 10 emails had no opening, so no angle.",
  );
  assert.equal(angles.empty, null);
  // A bar is a share of the businesses its angle was the last email to: the count it is of rides with it, for the page to grey it.
  assert.deepEqual(
    angles.rows.map((r) => [r.n, r.minN]),
    [
      [8, REPORT_MIN_N],
      [4, REPORT_MIN_N],
      [0, REPORT_MIN_N],
    ],
  );
  // The rest, past the eight most written, is one row, in the same unit.
  const more = vm({ other_angles: { written: 7, businesses: 6, wrote_back: 2 }, no_angle: 0 }).angles;
  assert.deepEqual(more.rows.at(-1), {
    id: "other",
    label: "Other angles",
    value: 33,
    display: "2 of 6  33%",
    n: 6,
    minN: REPORT_MIN_N,
  });
  assert.doesNotMatch(more.line, /no opening/);
  const noneAnswered = vm({ other_angles: { written: 3, businesses: 0, wrote_back: 0 } }).angles;
  assert.deepEqual(noneAnswered.rows.at(-1), {
    id: "other",
    label: "Other angles",
    value: 0,
    display: "—",
    n: 0,
    minN: REPORT_MIN_N,
  });
  // No angle at all: the words for why there is none, and no rows.
  const none = vm({ angles: [], no_angle: 40 }).angles;
  assert.deepEqual(none, {
    rows: [],
    line: null,
    empty: "No email in these days had an opening, so there is no angle to compare.",
  });
});

test("sources: a chain is the sum of its steps, in businesses", () => {
  const { sources } = vm();
  const [one, p1, p2, two, q1, q2] = sources;
  assert.deepEqual(
    sources.map((s) => [s.kind, s.id]),
    [
      ["chain", "r1"],
      ["step", "r1:p1"],
      ["step", "r1:p2"],
      ["chain", "r2"],
      ["step", "r2:q1"],
      ["step", "r2:q2"],
    ],
  );
  assert.equal(one.name, "Trainers in Austin");
  assert.equal(one.to, "campaigns/sequences/r1");
  assert.equal(one.meta, "To leads · 2 steps · 2 runs · Personal trainers · Austin");
  assert.equal(two.meta, "To leads · 2 steps · 1 run");
  const cells = (s) => [
    s.written,
    s.delivered,
    s.businesses,
    s.wroteBack,
    s.interested,
    s.booked,
    s.saidNo,
    s.bounced,
    s.last,
  ];
  assert.deepEqual(cells(one), ["30", "90%", "20", "25% (5)", "3", "1", "1", "1", "Sep 23"]);
  assert.deepEqual(cells(two), ["10", "90%", "5", "20% (1)", "0", "0", "1", "1", "Sep 26"]);
  // A step: its own businesses; a share only of five or more, the count it is of ("1 of 3") under that.
  assert.deepEqual(cells(p1), ["18", "89%", "12", "25% (3)", "2", "1", "0", "1", ""]);
  assert.deepEqual(cells(p2), ["12", "92%", "8", "25% (2)", "1", "0", "1", "0", ""]);
  assert.deepEqual(
    cells(q1),
    ["6", "83%", "3", "1 of 3", "0", "0", "1", "1", ""],
    "three businesses: the count it is of",
  );
  assert.deepEqual(
    cells(q2),
    ["4", "4 of 4", "2", "0 of 2", "0", "0", "0", "0", ""],
    "four emails: delivered as a count",
  );
  assert.deepEqual([p1.name, p2.name, p1.to, p1.meta], ["1 · Your email", "2 · A short nudge", null, ""]);
  // The chain's businesses are its steps' sum, so the sources add up to the head.
  assert.equal(
    sources.filter((s) => s.kind === "chain").reduce((t, s) => t + Number(s.businesses), 0),
    25,
  );
});

test("sources: the emails landed and the businesses that wrote back are a share from five and the count they are of under (four, then five)", () => {
  // One chain of one step, so the chain's line and the step's say the same: three emails of four delivered, one of four businesses wrote back.
  const cells = (written, businesses) => {
    const only = { ...chains()[0], steps: [step("p1", 0, { written, delivered: 3, businesses, wrote_back: 1 })] };
    return toReachOutLensVM(report({ chains: [only] }), NOW).sources.map((s) => [s.delivered, s.wroteBack]);
  };
  assert.deepEqual(cells(4, 4), [
    ["3 of 4", "1 of 4"],
    ["3 of 4", "1 of 4"],
  ]);
  assert.deepEqual(cells(5, 5), [
    ["60%", "20% (1)"],
    ["60%", "20% (1)"],
  ]);
  // The two rules are apart: four emails to five businesses, five emails to four.
  assert.deepEqual(cells(4, 5)[1], ["3 of 4", "20% (1)"]);
  assert.deepEqual(cells(5, 4)[1], ["60%", "1 of 4"]);
  // Nothing written to nobody: the emails' share is a dash and the count of those who wrote back a zero, as it has been.
  const none = { ...chains()[0], steps: [step("p1", 0, { businesses: 0 })] };
  assert.deepEqual(
    toReachOutLensVM(report({ chains: [none] }), NOW).sources.map((s) => [s.delivered, s.wroteBack]),
    [
      ["—", "0"],
      ["—", "0"],
    ],
  );
});

test("decision 8: nothing in the fold says an open rate or a click", () => {
  assert.doesNotMatch(JSON.stringify(vm()), /open(ed|s)? rate|clicked/i);
});

test("sources: a hand step is dashes, a paused chain says so, a step that wrote nothing is a zero", () => {
  const withHand = report();
  withHand.chains[0].steps.push({ id: "p3", n: 2, hand: "call", ...counts({ handed: 4, businesses: 0 }) });
  withHand.chains[1].state = "paused";
  const { sources } = toReachOutLensVM(withHand, NOW);
  const call = sources.find((s) => s.id === "r1:p3");
  assert.deepEqual(
    [call.name, call.meta, call.to, call.written, call.delivered, call.businesses, call.wroteBack],
    ["3 · A call for you", "4 handed to you", null, "—", "—", "—", "—"],
  );
  assert.deepEqual([call.interested, call.booked, call.saidNo, call.bounced, call.last], ["—", "—", "—", "—", ""]);
  const one = sources.find((s) => s.id === "r1");
  assert.equal(one.meta, "To leads · 3 steps · 2 runs · Personal trainers · Austin");
  assert.equal(one.businesses, "20", "a hand step writes to no business: the chain's sum stands");
  assert.equal(sources.find((s) => s.id === "r2").meta, "To leads · 2 steps · 1 run · paused");
  // A step that wrote nothing: a zero is a count; the shares are dashes where there is nothing to take one of.
  const quiet = report();
  quiet.chains[1].steps[1] = step("q2", 1, { businesses: 0 });
  const q2 = toReachOutLensVM(quiet, NOW).sources.find((s) => s.id === "r2:q2");
  assert.deepEqual([q2.written, q2.delivered, q2.businesses, q2.wroteBack], ["0", "—", "0", "0"]);
});

test("mailboxes, the days written and the handed line are the old fold's, said the same from five sent", () => {
  const { mailboxes, points, table, lines } = vm();
  assert.deepEqual(
    mailboxes.map((d) => [d.id, d.address, d.state, d.held, d.sent, d.landed, d.bounced, d.complained]),
    [["sam@mail.example.com", "sam@mail.example.com", "Connected", false, 40, "90%", "5%", "0%"]],
  );
  const held = vm({
    mailboxes: [
      {
        address: "sam@hi.example.com",
        state: "held",
        held_why: "bounces",
        held_at: "2026-09-26T15:00:00.000Z",
        sent: 5,
        delivered: 4,
        bounced: 1,
        complained: 0,
      },
      { address: null, state: null, held_why: null, held_at: null, sent: 5, delivered: 5, bounced: 0, complained: 0 },
      // Sent from their owner's own inbox (00429): no mailbox wrote them, and no receipt of theirs reaches us.
      {
        address: null,
        yours: true,
        state: null,
        held_why: null,
        held_at: null,
        sent: 6,
        delivered: 6,
        bounced: 0,
        complained: 0,
      },
    ],
  }).mailboxes;
  assert.deepEqual(
    held.map((d) => [d.id, d.address, d.state, d.held, d.landed, d.bounced, d.complained]),
    [
      [
        "sam@hi.example.com",
        "sam@hi.example.com",
        "Held since Sat: more than 3% of its recent emails bounced",
        true,
        "80%",
        "20%",
        "0%",
      ],
      ["removed", "A mailbox since removed", "Since removed", false, "100%", "0%", "0%"],
      ["your-inbox", "Your own inbox", "You send these", false, "—", "—", "—"],
    ],
  );
  assert.deepEqual(
    points.map((p) => [p.day, p.label, p.short, p.written]),
    [
      ["2026-09-22", "Sep 22", "22", 10],
      ["2026-09-23", "Sep 23", "23", 30],
    ],
  );
  assert.deepEqual(table, {
    columns: ["Day", "Written"],
    rows: [
      ["Sep 22", 10],
      ["Sep 23", 30],
    ],
  });
  // A day's column says itself aloud in the fold's words (a screen reader reads it; the page writes no sentence of its own).
  assert.deepEqual(
    points.map((p) => p.writtenWords),
    ["Sep 22: 10 written", "Sep 23: 30 written"],
  );
  assert.equal(lines.written, "");
  assert.equal(lines.mailboxes, "Where it left from, and how it landed. Past 3% bounced, a mailbox holds itself.");
  // Under the sources table: each business counts once, and what came of it is state now (the angles' line says it likewise).
  assert.equal(
    lines.sources,
    "A business counts once, at the last email that wrote to it. What came of each is as it stands now.",
  );
  assert.equal(
    vm({ totals: counts({ written: 40, businesses: 25, handed: 4 }) }).lines.written,
    "4 businesses handed to you as a call or a note, too.",
  );
});

/** A mailbox as the report sends it: `sent` emails, of which `delivered` landed, `bounced` bounced for good, `complained` drew a complaint. */
const mailbox = (address, sent, delivered, bounced, complained = 0) => ({
  address,
  state: "connected",
  held_why: null,
  held_at: null,
  sent,
  delivered,
  bounced,
  complained,
});

test("a mailbox's cells are counts under five sent, shares from five, and a dash at none (D9)", () => {
  const cells = (d) => vm({ mailboxes: [d] }).mailboxes.map((r) => [r.sent, r.landed, r.bounced, r.complained]);
  // Three sent: 67%, 33.3% would be shares of three.
  assert.deepEqual(cells(mailbox("sam@a.example.com", 3, 2, 1)), [[3, "2 of 3", "1 of 3", "0 of 3"]]);
  assert.deepEqual(cells(mailbox("sam@a.example.com", 4, 4, 0, 1)), [[4, "4 of 4", "0 of 4", "1 of 4"]]);
  assert.deepEqual(cells(mailbox("sam@a.example.com", 1, 0, 1)), [[1, "0 of 1", "1 of 1", "0 of 1"]]);
  // Exactly five is enough, as everywhere else: the landed share to the unit, the rates to a tenth.
  assert.deepEqual(cells(mailbox("sam@a.example.com", 5, 4, 1)), [[5, "80%", "20%", "0%"]]);
  assert.deepEqual(cells(mailbox("sam@a.example.com", 7, 6, 1, 1)), [[7, "86%", "14.3%", "14.3%"]]);
  // Nothing sent: nothing to take a share or a count of.
  assert.deepEqual(cells(mailbox("sam@a.example.com", 0, 0, 0)), [[0, "—", "—", "—"]]);
  // The cells stay the strings the Mailboxes card draws; the removed mailbox's line follows the same rule.
  assert.deepEqual(cells({ ...mailbox(null, 2, 2, 0), state: null }), [[2, "2 of 2", "0 of 2", "0 of 2"]]);
});

test("a period that wrote nothing says so, a workspace with no reach-out draws nothing", () => {
  const empty = vm({ ...NOTHING });
  assert.deepEqual([empty.present, empty.empty, empty.days], [true, true, 30]);
  assert.equal(empty.lines.empty, "No sequence to leads wrote in the last 30 days.");
  assert.deepEqual(empty.emails, { rows: [], line: null, empty: "Nothing was written in these days." });
  assert.deepEqual(empty.businesses, { rows: [], line: null, empty: "No business was written to in these days." });
  assert.deepEqual(empty.angles, {
    rows: [],
    line: null,
    empty: "No email in these days had an opening, so there is no angle to compare.",
  });
  assert.deepEqual([empty.sources, empty.points, empty.mailboxes], [[], [], []]);
  assert.equal(vm({ has_reach_out: false }).present, false);
  // Only handed to the team is not empty: the steps say so.
  const handed = vm({ ...NOTHING, totals: counts({ handed: 2, businesses: 0 }) });
  assert.deepEqual(
    [handed.empty, handed.lines.written],
    [false, "2 businesses handed to you as a call or a note, too."],
  );
  // Nothing in a quiet period is a NaN, an undefined, or a share of nothing (the mailboxes' line names the 3% a mailbox holds
  // itself at: a limit, not a share).
  const said = JSON.stringify({ ...empty, lines: { ...empty.lines, mailboxes: "" } });
  assert.doesNotMatch(said, /NaN|undefined|Infinity|%/);
  // A server before 00241 answers the route with nothing of it: a workspace with nothing to draw, never a throw.
  const bare = toReachOutLensVM({}, NOW);
  assert.deepEqual([bare.present, bare.empty, bare.days], [false, true, 30]);
  assert.doesNotMatch(JSON.stringify(bare), /NaN|undefined|Infinity/);
});

test("a period of one day (This month so far, on the 1st) is today, and one a member picked is its date", () => {
  const day = { days: 1, since: "2026-09-28", series: [{ day: "2026-09-28", written: 40 }] };
  const today = vm(day);
  assert.match(today.emails.line, /^Of 40 emails written today: 90% were delivered and 5% bounced\. /);
  assert.match(today.businesses.line, /^Of 25 businesses written to today: 24% wrote back/);
  assert.deepEqual(
    today.strip.map((t) => t.compare),
    ["up from 30", "was 90% the day before", "up from 1"],
    "one day is 'the day before', never 'the 1 day before'",
  );
  const quiet = vm({ ...day, ...NOTHING });
  assert.deepEqual(
    [quiet.lines.empty, quiet.emails.empty, quiet.businesses.empty],
    ["No sequence to leads wrote today.", "Nothing was written today.", "No business was written to today."],
  );
  assert.equal(quiet.angles.empty, "No email today had an opening, so there is no angle to compare.");
  assert.doesNotMatch(JSON.stringify([quiet, today.emails, today.businesses]), /\b1 day\b|these days/);
  // A day a member picked that ended before today (00360) is said by its date, never as today.
  const picked = { days: 1, end: "2026-09-20", since: "2026-09-20", series: [{ day: "2026-09-20", written: 40 }] };
  assert.match(vm(picked).emails.line, /^Of 40 emails written on Sep 20: /);
  assert.match(vm(picked).businesses.line, /^Of 25 businesses written to on Sep 20: /);
  const pickedEmpty = vm({ ...picked, ...NOTHING });
  assert.deepEqual(
    [pickedEmpty.lines.empty, pickedEmpty.emails.empty],
    ["No sequence to leads wrote on Sep 20.", "Nothing was written on Sep 20."],
  );
});

test("a window that ended before today is its days, said by them, with the days before it", () => {
  const ended = { days: 20, end: "2026-09-20", since: "2026-09-01" };
  const vmEnded = vm(ended);
  assert.match(vmEnded.emails.line, /^Of 40 emails written in these 20 days: /);
  assert.deepEqual(
    vmEnded.strip.map((t) => t.compare),
    ["up from 30", "was 90% the 20 days before", "up from 1"],
  );
  assert.equal(vm({ ...ended, ...NOTHING }).lines.empty, "No sequence to leads wrote in the 20 days to Sep 20.");
  assert.equal(vm({ ...ended, ...NOTHING }).emails.empty, "Nothing was written in these days.");
});

/** Every string the vm holds, wherever it is (a cell, a line, a label), so a test reads what a person could read. */
const stringsOf = (v) =>
  typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(stringsOf) : [];

test("no share of fewer than five is said anywhere in the vm, and nothing is a NaN", () => {
  // A small reach-out: four emails to three businesses (one wrote back), a period before of three emails, an angle of three
  // businesses and the rest of two, a chain of one step (four emails), and four mailboxes: one that sent 3,
  // one that sent 4 and is held, the removed one that sent 2, and one that sent none.
  const held = {
    ...mailbox("sam@held.example.com", 4, 3, 1),
    state: "held",
    held_why: "bounces",
    held_at: "2026-09-26T15:00:00.000Z",
  };
  const dto = report({
    totals: counts({ written: 4, delivered: 3, bounced: 1, businesses: 3, wrote_back: 1, interested: 1, handed: 2 }),
    before: { written: 3, delivered: 2, bounced: 1 },
    angles: [{ angle: "their rating", written: 4, businesses: 3, wrote_back: 1 }],
    other_angles: { written: 2, businesses: 2, wrote_back: 1 },
    chains: [
      {
        ...chains()[0],
        steps: [step("p1", 0, { written: 4, delivered: 3, bounced: 1, businesses: 3, wrote_back: 1 })],
      },
    ],
    mailboxes: [
      mailbox("sam@a.example.com", 3, 2, 1),
      held,
      { ...mailbox(null, 2, 2, 0), state: null },
      mailbox("sam@c.example.com", 0, 0, 0),
    ],
  });
  const small = toReachOutLensVM(dto, NOW);
  // The whole vm: its totals, lines, points, table, mailboxes and sources too. Two kinds of "%" are named and taken out.
  const exceptions = {
    // The strip's values are a share the kit greys by `n` under `minN` (D9), not a sentence; assert the greying instead.
    strip: small.strip.map((t) => ({ ...t, value: "" })),
  };
  assert.deepEqual([small.strip[1].n, small.strip[1].minN], [4, 5], "the landed share is greyed by the kit");
  const said = stringsOf({ ...small, ...exceptions })
    // The 3% a mailbox holds itself at is a limit, not a share: in the Mailboxes card's line and in a held mailbox's state.
    .filter((s) => s !== small.lines.mailboxes && s !== small.mailboxes[1].state);
  assert.equal(small.mailboxes[1].state, "Held since Sat: more than 3% of its recent emails bounced");
  assert.ok(said.length > 40, "the whole vm was read");
  assert.deepEqual(
    said.filter((s) => /%|NaN|undefined|Infinity/.test(s)),
    [],
  );
  // And what it says instead of a share.
  assert.deepEqual(
    small.mailboxes.map((d) => [d.landed, d.bounced, d.complained]),
    [
      ["2 of 3", "1 of 3", "0 of 3"],
      ["3 of 4", "1 of 4", "0 of 4"],
      ["2 of 2", "0 of 2", "0 of 2"],
      ["—", "—", "—"],
    ],
  );
  assert.deepEqual(
    small.angles.rows.map((r) => r.display),
    ["1 of 3", "1 of 2"],
  );
  assert.deepEqual(
    small.sources.map((s) => [s.delivered, s.wroteBack]),
    [
      ["3 of 4", "1 of 3"],
      ["3 of 4", "1 of 3"],
    ],
  );
  assert.equal(small.strip[1].compare, "was 2 of 3 the 30 days before");
  // The boundary: at exactly five, the shares are said (a mailbox that sent 5, five businesses, five emails).
  const five = toReachOutLensVM(
    report({
      totals: counts({ written: 5, delivered: 4, bounced: 1, businesses: 5, wrote_back: 1, interested: 1 }),
      before: { written: 5, delivered: 5, bounced: 0 },
      mailboxes: [mailbox("sam@e.example.com", 5, 4, 1)],
    }),
    NOW,
  );
  assert.deepEqual(
    [five.mailboxes[0].landed, five.strip[1].compare, five.emails.line.includes("80% were delivered")],
    ["80%", "was 100% the 30 days before", true],
  );
});

test("a businesses count that is null or not a count reads as absent: the pre-00404 words, never 'null'", () => {
  // A route's answer is trusted loosely (wholeOf): a `null` is no more a count than a missing key is.
  const dto = before00404();
  dto.totals.businesses = null;
  for (const a of dto.angles) a.businesses = null;
  dto.other_angles = { written: 3, businesses: null, wrote_back: 1 };
  for (const c of dto.chains) for (const s of c.steps) s.businesses = null;
  const vmNull = toReachOutLensVM(dto, NOW);
  const old = toReachOutLensVM(before00404(), NOW);
  assert.equal(vmNull.strip[0].meta, "40 emails");
  assert.deepEqual(vmNull.businesses, old.businesses);
  assert.equal(vmNull.businesses.empty, "This database does not count businesses yet.");
  assert.deepEqual(vmNull.angles, { rows: [], line: null, empty: "This database does not count businesses yet." });
  assert.equal("businesses" in vmNull.totals, false, "the totals say it is absent, not null");
  const chain = vmNull.sources.find((s) => s.id === "r1");
  const p1 = vmNull.sources.find((s) => s.id === "r1:p1");
  assert.deepEqual([chain.businesses, chain.wroteBack, p1.businesses, p1.wroteBack], ["—", "5", "—", "3"]);
  assert.deepEqual(vmNull.sources, old.sources, "the sources are the same as for an absent key");
  assert.deepEqual(
    stringsOf(vmNull).filter((s) => /\bnull\b|NaN|undefined/.test(s)),
    [],
  );
  // One step's null does not make the chain's businesses a sum of the others: half a sum is no count.
  const half = report();
  half.chains[0].steps[0].businesses = null;
  const sources = toReachOutLensVM(half, NOW).sources;
  assert.deepEqual(
    [sources[0].businesses, sources[0].wroteBack, sources[1].businesses, sources[2].businesses],
    ["—", "5", "—", "8"],
  );
  // A real zero is a count.
  const zero = report({ totals: counts({ written: 3, businesses: 0 }) });
  assert.equal(toReachOutLensVM(zero, NOW).strip[0].meta, "0 businesses written to");
});
