/**
 * Reports in every state: a period with nothing in it, a read that failed, the date range and the days picked, a
 * period on its way or failed, Google's reviews and their replies, and each lens drawn over the tests' sample.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toReportVM } from "@chanlytics/contracts";
import { fresh, again, all, find, byTestId, textOf, classes, press, settle, atWidth } from "../../_stub-react.mjs";
import {
  reportDto,
  quiet,
  campaignDto,
  surface,
  cday,
  googleConnection,
  reviewsDto,
  reviewsGoogle,
  reviewsHeld,
  reviewsLedger,
  writtenReview,
} from "../_report-world.mjs";
import { QUIET as LEDGER_QUIET, dtoWith as campaignsLedger } from "../campaigns/_campaign-world.mjs";
import { until } from "../../shared/_until.mjs";
import {
  ARRIVALS,
  Field,
  Figure,
  LENS_PATHS,
  NORTHSIDE,
  Popover,
  WEEK_BEFORE,
  WEEK_BEFORE_KEY,
  across,
  campaignsFor,
  campaignsSample,
  card,
  choose,
  chosen,
  cls,
  control,
  draw,
  factOf,
  failedLine,
  figureIds,
  followingMoves,
  holdReviews,
  inPeriodTest,
  keepReportPeriod,
  land,
  month,
  moves,
  northsideLedger,
  offSample,
  otherDays,
  overSample,
  page,
  pageOnce,
  peopleSample,
  period,
  plot,
  rangeSays,
  receptionistSample,
  redraw,
  reviewReply,
  reviewRows,
  reviewsSample,
  sectionMeta,
  seen,
  setLensAt,
  setStatus,
  setStopRunner,
  setSurfaceValue,
  standingSaid,
  startSurfaces,
  stopRunner,
  takeaway,
  toCampaignLensVM,
  toPeopleReportVM,
  toReceptionistReportVM,
  went,
} from "./_page.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

/* ------------------------------------------ states ------------------------------------------ */

test("a period with nothing in it: one card that says so, no Worth knowing, and the door to 90 days", async () => {
  await inPeriodTest("hold", async () => {
    const tree = page({ report: quiet() });
    const empty = card(tree, "reports-empty");
    assert.ok(textOf(empty).includes("Nobody wrote or called between Aug 29 and Sep 4."));
    assert.equal(card(tree, "chart-answered"), null, "no chart of nothing");
    assert.equal(card(tree, "reports-facts"), null, "the headline and this card already say it");
    press(find(empty, (n) => n.type === "button"));
    assert.deepEqual(period.asked, ["90d"]);
    await settle();
  });
});

test("the campaign read failing leaves AI's numbers standing, in the fold's words; nothing sent says so and opens Sequences", () => {
  const failed = page({ campaigns: null });
  const words = card(failed, "campaigns-failed-campaigns");
  assert.ok(textOf(words).includes("Couldn't read the campaign numbers"), textOf(words));
  assert.ok(textOf(words).includes("The rest of this page is current."), "the fold's body");
  assert.equal(card(failed, "chart-campaigns"), null, "the days card is not the failed one's id");
  assert.doesNotMatch(textOf(failed), /receptionist's own numbers above are current/);
  assert.ok(card(failed, "reports-hero") && card(failed, "chart-answered"), "the rest of the page stands");
  const nothing = page({
    campaigns: { ...campaignDto(), series: campaignDto().series.map((d) => cday(d.day)), sources: [], by_channel: [] },
    ledger: campaignsLedger(LEDGER_QUIET),
  });
  const c = card(nothing, "chart-campaigns-quiet");
  assert.ok(textOf(c).includes("Nothing went out"));
  assert.equal(card(nothing, "chart-campaigns"), null, "and no days card of nothing");
  press(find(c, (n) => n.type === "button"));
  assert.deepEqual(went, ["campaigns/sequences"]);
});

test("Worth knowing says the campaign that drew the most replies from the Campaigns lens's own read: absent before it lands, while it is of another period and where it failed, there once it is held", () => {
  const factIn = (tree) => factOf(tree, "campaign");
  const overview = (set) => {
    set();
    setLensAt(LENS_PATHS[0]);
    fresh();
    return draw();
  };
  // Nothing unanswered and no handover, so Worth knowing has room for a third fact (it keeps three).
  const calm = {
    series: reportDto().series.map((d) => ({ ...d, unanswered: 0, escalations: 0 })),
    reasons: {},
    arrivals: ARRIVALS,
  };
  const withRead = (campaigns) => {
    const R = surface({ report: calm, profile: {} });
    return overview(() => {
      keepReportPeriod("7d");
      setSurfaceValue("reports", R);
      setSurfaceValue("reports_campaigns", campaigns);
    });
  };
  const held = withRead(campaignsFor("7d"));
  assert.equal(
    textOf(factIn(held)),
    "Win-back drew the most replies3 of 14 were answeredOpen it",
    "the fold's source, from the follower, in messages answered as the Campaigns lens says them",
  );
  assert.equal(factIn(withRead(undefined)), null, "before the read lands: no fact, and no guess");
  assert.equal(factIn(withRead(campaignsFor("30d"))), null, "a period left is not said under this one's name");
  assert.equal(factIn(withRead(campaignsFor("7d", { campaigns: null }))), null, "a sends read that failed: nothing");
  // A database before the ledger still has its sends: the fact stands.
  assert.ok(
    factIn(withRead(campaignsFor("7d", { ledger: campaignsLedger(null) }))),
    "a missing ledger leaves the sources",
  );
  // The frame's read does not hold it: the Overview of a report with no Campaigns read draws everything else.
  const none = withRead(undefined);
  assert.ok(card(none, "reports-hero") && card(none, "reports-tiles"), "the Overview stands without it");
});

test("asked, then booked: the share as a meter beside the view model's words, the calendar's sentence, or a failed read", () => {
  const ok = card(page(), "chart-booking");
  assert.equal(textOf(cls(ok, "rpt-booked-number")), "38%");
  assert.equal(textOf(cls(ok, "rpt-booked-copy")), "of the people who wrote or called in the last 7 days have booked.");
  const none = card(page({ booking: { calendar: "none", days: 7, asked: 0, booked: 0 } }), "chart-booking");
  assert.ok(textOf(none).includes("Add a calendar link under Settings › Hours & booking to see who booked."));
  press(find(none, (n) => n.type === "button"));
  // The Business row that holds the link, opened (contracts CALENDAR_SETTING_ROUTE): it went to the top of the tab.
  assert.deepEqual(went, ["admin/workspace/calendar"]);
  const unread = card(page({ booking: { calendar: "unavailable", days: 7, asked: 4, booked: 0 } }), "chart-booking");
  assert.ok(
    textOf(unread).includes("Couldn't read your calendar"),
    "a calendar that couldn't be read is a failed read",
  );
  assert.ok(!textOf(unread).includes("Open Settings"), "not a missing one: no door to connect what is connected");
  assert.ok(
    textOf(card(page({ booking: { calendar: "ok", days: 7, asked: 0, booked: 0 } }), "chart-booking")).includes(
      "Nobody asked",
    ),
  );
});

test("asked, then booked: the share's other side sits on the card's foot, with the door to the people it names", () => {
  // 3 of 8 booked, so five are still waiting for a time: the half of the meter an owner can act on, and the only
  // place on the page that says it. The sentence is the view model's; the page adds no number of its own.
  const ok = card(page(), "chart-booking");
  const rest = byTestId(ok, "booked-rest");
  assert.ok(textOf(rest).includes("5 of the 8 who asked have nothing on the calendar yet."));
  // People keeps a list of these people already, so the door lands on that list and not on the page of everyone, and
  // it wears the list's name: the list counts its own month, this card counts the period above.
  assert.equal(textOf(byTestId(ok, "booked-rest-door")), "Asked, never booked");
  // People's lists, read: the door lands on the list (people/words.ts plListRoute, People's rule over what People holds).
  bridgeHolds({ values: { people: { lists: [{ id: "asked_never_booked" }], saved: [], archived: [] } } });
  try {
    press(byTestId(card(page(), "chart-booking"), "booked-rest-door"));
    assert.deepEqual(went, ["clients/seg:asked_never_booked"]);
  } finally {
    bridgeHolds({ values: { people: undefined } });
  }
  press(byTestId(card(page(), "chart-booking"), "booked-rest-door"));
  assert.deepEqual(went, ["clients"], "and on People itself before the lists are known");
  // Everybody booked: the good news, and nothing to open.
  const all8 = card(page({ booking: { calendar: "ok", days: 7, asked: 8, booked: 8 } }), "chart-booking");
  assert.equal(textOf(byTestId(all8, "booked-rest")), "Everyone who asked in the last 7 days has booked.");
  assert.equal(byTestId(all8, "booked-rest-door"), null);
  // Nothing counted, nothing said: no calendar, one that could not be read, and nobody asking.
  for (const booking of [
    { calendar: "none", days: 7, asked: 0, booked: 0 },
    { calendar: "unavailable", days: 7, asked: 4, booked: 0 },
    { calendar: "ok", days: 7, asked: 0, booked: 0 },
  ]) {
    assert.equal(byTestId(card(page({ booking }), "chart-booking"), "booked-rest"), null, booking.calendar);
  }
});

test("a v2 payload still draws: what it cannot know is said, never invented", () => {
  const v2 = reportDto();
  for (const k of ["replies", "channels", "hours"]) delete v2[k];
  const tree = across(() => setSurfaceValue("reports", { ...surface(), vm: toReportVM(v2) }));
  assert.equal(plot(tree, "chart-reply"), null, "no speed line without the replies");
  assert.ok(byTestId(card(tree, "chart-reply"), "reply-spread"), "the spread still reads");
  assert.equal(cls(card(tree, "chart-rhythm"), "ck-heat"), null, "no hours without the grid");
});

test("the head names Reports on every lens with no way back above it: a lens is picked in the strip", () => {
  for (const path of LENS_PATHS) {
    setLensAt(path);
    const tree = pageOnce();
    const said = standingSaid();
    assert.equal(said.title, "Reports", `${path}: the name`);
    assert.equal(said.back, null, `${path}: REGRESSION: "‹ Reports" stood over every lens but the Overview`);
    assert.equal(byTestId(tree, "reports-ask"), null, `${path}: and no AI door: the period row asks nothing`);
  }
  setLensAt(LENS_PATHS[0]);
});

test("the date range is a capsule that says what the page is on, and opens the four periods, the days reached in one press and a month to pick days on", () => {
  const tree = page();
  const c = control(tree);
  assert.deepEqual(
    c.props.options.map((o) => [o.value, o.label, o.testid]),
    [
      ["7d", "7 days", "period-7d"],
      ["30d", "30 days", "period-30d"],
      ["90d", "90 days", "period-90d"],
      ["month", "Month", "period-month"],
    ],
  );
  assert.equal(c.props.label, "Period");
  assert.equal(c.props.value, "7d", "the period the page is on");
  const period = byTestId(seen(tree), "reports-period");
  const pop = find(period, (n) => n.type === Popover);
  // The capsule says its word beside its glyph (the bare glyph said nothing of what it held), and names the period
  // and its days to a screen reader; on a desk the days stand beside it.
  const open = pop.props.trigger;
  assert.equal(open.props["data-testid"], "reports-period-open");
  assert.equal(open.props.iconOnly, undefined, "REGRESSION: a glyph alone, which said nothing of the period it held");
  assert.deepEqual(rangeSays(tree), ["Date range: Last 7 days, Aug 29 – Sep 4", "7 days", "Aug 29 – Sep 4"]);
  assert.equal(pop.props.label, "Date range", "what it opens names itself");
  assert.equal(textOf(byTestId(pop, "reports-period-range")), "Aug 29 – Sep 4", "the days in words");
  assert.match(textOf(cls(pop, "rpt-when-said")), /^Last 7 days · .+ time$/, "the period and the zone the days follow");
  assert.equal(
    byTestId(pop, "reports-period-before"),
    null,
    "the days every figure is compared with are the figures' own to say (Ruben, 10 Oct 2026: not needed here)",
  );
  // The days reached in one press, worked out from the business's today (Friday 4 September), on a track drawn as the
  // periods' is: none is the page's.
  const other = otherDays(tree);
  assert.deepEqual(
    other.props.options.map((o) => [o.value, o.label, o.testid]),
    [
      ["yesterday", "Yesterday", "period-yesterday"],
      ["last-week", "Last week", "period-last-week"],
      ["last-month", "Last month", "period-last-month"],
    ],
  );
  assert.equal(other.props.value, "", "none of them is the page's");
  assert.deepEqual(
    [c.props.className, other.props.className],
    ["rpt-when-presets", "rpt-when-presets"],
    "the two tracks are laid out alike",
  );
  // And the month days are picked on: the period's own days drawn on it, none after today, ninety at most.
  const picker = month(tree);
  assert.deepEqual(
    [picker.props.from, picker.props.to, picker.props.today, picker.props.most, picker.props.label],
    ["2026-08-29", "2026-09-04", "2026-09-04", 90, "Days"],
  );
  assert.equal(
    picker.props.hint({ first: null, band: { from: "2026-08-29", to: "2026-09-04" } }),
    "Press a first day, then a last. 90 days at most.",
    "what it says under itself is contracts' own",
  );
});

test("the window picked shows at once, before its read lands: Month is the 1st to today", async () => {
  await inPeriodTest("hold", async () => {
    let tree = page();
    choose(tree, "Month");
    tree = redraw();
    const pop = find(seen(tree), (n) => n.type === Popover);
    assert.equal(
      textOf(byTestId(pop, "reports-period-range")),
      "Sep 1 – Sep 4",
      "said at once, from the business's today",
    );
    assert.match(textOf(cls(pop, "rpt-when-said")), /^This month so far · /);
    assert.deepEqual([month(tree).props.from, month(tree).props.to], ["2026-09-01", "2026-09-04"]);
    assert.deepEqual(rangeSays(tree), ["Date range: This month so far, Sep 1 – Sep 4", "Month", "Sep 1 – Sep 4"]);
  });
});

test("days picked on the month move the address and are read by their first and last day; the capsule says their dates, no period is chosen, and a period picked from there takes the days out of the address", async () => {
  await inPeriodTest("answer", () =>
    followingMoves(async () => {
      let tree = page();
      month(tree).props.onRangeChange(WEEK_BEFORE);
      // Said at once, before the read lands: the control is on the days, and no period is.
      tree = redraw();
      assert.deepEqual(rangeSays(tree), ["Date range: 7 days, Aug 22 – Aug 28", "Aug 22 – 28", "7 days"]);
      assert.equal(chosen(tree), undefined, "none of the four periods is these days");
      for (let i = 0; i < 12; i++) await settle();
      assert.deepEqual(
        moves,
        [[`reports/${WEEK_BEFORE_KEY}`, false]],
        "the address says the days, as a new entry: Back walks the ranges a member looked at",
      );
      assert.deepEqual(period.asked, [WEEK_BEFORE_KEY], "one read, of the days picked");
      redraw();
      tree = redraw();
      assert.equal(byTestId(tree, "reports-real").props["data-loading"], undefined, "the days landed");
      assert.deepEqual(rangeSays(tree), ["Date range: 7 days, Aug 22 – Aug 28", "Aug 22 – 28", "7 days"]);
      assert.deepEqual(
        [month(tree).props.from, month(tree).props.to, month(tree).props.today],
        ["2026-08-22", "2026-08-28", "2026-09-04"],
        "the month shows what was picked, and today is still the business's",
      );
      assert.equal(failedLine(tree), null);
      // The booking line follows people as they stand today, so it is not counted for days that ended.
      const booked = find(tree, (n) => n.type === Figure && n.props.id === "booked");
      assert.equal(textOf(booked.props.value), "—", "no count is drawn of what was not counted");
      // A period by name from there: the address says no days again, and the period is read.
      choose(tree, "30 days");
      for (let i = 0; i < 12; i++) await settle();
      assert.deepEqual(moves.at(-1), ["reports", false], "a period is never in the address");
      assert.equal(period.asked.at(-1), "30d");
      redraw();
      tree = redraw();
      assert.equal(chosen(tree), "30 days");
      assert.equal(rangeSays(tree)[1], "30 days");
    }),
  );
});

test("a day reached in one press is days like any picked: Yesterday is the day before the business's today, in the address by its date", async () => {
  await inPeriodTest("answer", () =>
    followingMoves(async () => {
      let tree = page();
      otherDays(tree).props.onValueChange("yesterday");
      for (let i = 0; i < 12; i++) await settle();
      assert.deepEqual(moves, [["reports/2026-09-03~2026-09-03", false]]);
      assert.deepEqual(period.asked, ["2026-09-03~2026-09-03"]);
      redraw();
      tree = redraw();
      assert.deepEqual(rangeSays(tree), ["Date range: Yesterday, Sep 3", "Yesterday", "Sep 3"]);
      assert.equal(otherDays(tree).props.value, "yesterday", "and it is drawn as chosen, on its own track");
      assert.equal(chosen(tree), undefined, "and no period is");
    }),
  );
});

test("days that fail to load say so by their dates, keep the range showing, and the address goes back to it in the entry's own place", async () => {
  await inPeriodTest("refuse", () =>
    followingMoves(async () => {
      let tree = page();
      month(tree).props.onRangeChange(WEEK_BEFORE);
      for (let i = 0; i < 12; i++) await settle();
      tree = redraw();
      assert.equal(textOf(failedLine(tree)), "Couldn't load Aug 22 – Aug 28. Still showing 7 days.");
      assert.deepEqual(
        moves,
        [
          [`reports/${WEEK_BEFORE_KEY}`, false],
          ["reports", true],
        ],
        "the entry the pick made says what the page shows, so Back never returns to days that failed",
      );
      assert.equal(chosen(tree), "7 days", "and the control says what the page shows");
      assert.equal(rangeSays(tree)[1], "7 days");
      assert.equal(byTestId(tree, "reports-real").props["data-loading"], undefined, "nothing is left dimmed");
    }),
  );
});

test("a period on its way keeps the one showing, dimmed by the one rule every page uses, and says it is busy", async () => {
  // The loading standard's H: Reports dimmed its own way (.rpt-body.is-loading, at once, to 0.55). It is the shared
  // rule now -- the page wears data-loading, the body data-dims (components.css): a beat before it dims, so a period
  // the tab holds (painted at once) never flickers.
  await inPeriodTest("hold", async () => {
    let tree = page();
    assert.equal(byTestId(tree, "reports-real").props["data-loading"], undefined, "nothing on its way");
    choose(tree, "90 days");
    tree = redraw();
    assert.equal(byTestId(tree, "reports-real").props["data-loading"], "", "the page says its period is on its way");
    const body = cls(tree, "rpt-body");
    assert.equal(body.props["aria-busy"], "true");
    assert.equal(body.props["data-dims"], true, "and the body is what dims");
    assert.ok(!String(body.props.className).includes("is-loading"), "by the one rule, not a page's own");
    // The answer lands: its own read is published (the surface's fetchedAt moves), and the page clears what it held.
    await land();
    redraw(); // the effect that follows the new answer clears what the page held, and the next draw shows it
    tree = redraw();
    assert.equal(
      byTestId(tree, "reports-real").props["data-loading"],
      undefined,
      "the period landed: nothing on its way",
    );
    assert.equal(chosen(tree), "90 days", "and it is the period the read answered");
  });
});

test("the page asks no keyboard to stop on a chart point, says no zone as a raw id, and names nothing by a native title", () => {
  // Pinned as reports-page.tsx's text in reports/metrics-truth.test.mjs until 26 Nov 2026: up to 270 unnamed stops at 90
  // days, a title that reaches nobody on a keyboard or a phone, and the IANA id in the subtitle. The zone is the kit's
  // tooltip over the dates.
  const tree = page();
  assert.ok(byTestId(tree, "reports-real"), "the page drawn over its read");
  // A chart is one stop, the kit's plot: nothing inside it is another.
  const plots = all(tree, (n) => classes(n).includes("ck-plot"));
  assert.ok(plots.length > 0, "the page draws its charts");
  for (const plot of plots)
    assert.deepEqual(
      all(plot, (n) => n !== plot && n.props?.tabIndex === 0).map((n) => n.props.className ?? n.type),
      [],
      "no point of a chart is a keyboard stop",
    );
  assert.deepEqual(
    all(tree, (n) => typeof n.type === "string" && typeof n.props?.title === "string"),
    [],
    "no native title",
  );
  assert.ok(!/\b(America|Europe|Asia|Africa|Australia|Pacific)\/[A-Za-z_]+/.test(textOf(tree)), "no raw zone id said");
});

test("a period that fails to load says so, keeps the one showing, and lets the tabs go again", async () => {
  // 30 days, which no test above has read: a period this tab holds paints at once (held views) and cannot fail to load.
  await inPeriodTest("refuse", async () => {
    let tree = page();
    choose(tree, "30 days");
    for (let i = 0; i < 12; i++) await settle();
    tree = redraw();
    assert.equal(textOf(failedLine(tree)), "Couldn't load 30 days. Still showing 7 days.");
    assert.equal(chosen(tree), "7 days", "the pick that failed is taken back: the control says what the page shows");
  });
});

test("Google's reviews under the period, from the Business Profile: five figures, the stars, the weeks, who waits and the latest, with the reply door", () => {
  const V = holdReviews(NORTHSIDE, northsideLedger());
  try {
    const tree = page();
    const section = find(tree, (n) => n.type === "section" && n.props["aria-label"] === "Google reviews");
    assert.ok(section, "a section of its own");
    assert.ok(sectionMeta(tree).startsWith("Northside Studio · checked "), sectionMeta(tree));
    assert.ok(sectionMeta(tree).includes(V.google.connection.words), "the Business Profile's own words, drawn");
    assert.ok(
      !sectionMeta(tree).includes("history on record"),
      "the record is whole: nothing to say of where it starts",
    );
    assert.deepEqual(
      all(byTestId(tree, "google-tiles"), (n) => n.type === Figure).map((n) => [n.props.id, n.props.value]),
      V.tiles.map((t) => [t.metric, t.value]),
      "the kit's Figure, in the strip's pattern, each named by its metric and saying the fold's value",
    );
    assert.equal(V.tiles.length, 5, "five, from the reviews on record");
    assert.ok(classes(byTestId(tree, "google-tiles")).includes("rpt-figures"), "the strip's own frame");
    assert.ok(
      classes(byTestId(tree, "google-tiles")).includes("profile") &&
        !classes(byTestId(tree, "google-tiles")).includes("listing"),
      "the profile's strip, named for what it counts and not for how many: five columns is the strip's own",
    );
    // The mix of the period's stars: a row to each, five down to one, and the page says what the fold says under it.
    assert.deepEqual(
      all(card(tree, "chart-reviews-stars"), (n) => classes(n).includes("ck-barlist-head")).map(textOf),
      V.stars.rows.map((s) => `${s.label}${s.display}`),
    );
    assert.equal(takeaway(tree, "chart-reviews-stars"), V.lines.mix);
    assert.ok(plot(tree, "chart-reviews-weekly"), "the weeks, on the kit");
    assert.equal(takeaway(tree, "chart-reviews-weekly"), V.lines.weekly);
    // Who waits: Ana, with the reply the receptionist wrote and held, and the door to answer her.
    const waiting = card(tree, "reviews-waiting");
    assert.equal(
      textOf(find(waiting, (n) => classes(n).includes("ck-card-title"))),
      `Waiting for a reply (${V.waiting.total})`,
    );
    assert.equal(reviewRows(waiting).length, V.waiting.rows.length);
    assert.ok(V.waiting.rows[0].held, "the fold has a reply held for Ana to say");
    assert.equal(V.waiting.rows[0].held, textOf(byTestId(waiting, "google-review-held")), "the fold's own words");
    assert.ok(byTestId(waiting, "google-reply"), "a review through the Business Profile can be answered");
    // By a member who may approve, and by nobody else: a viewer reads the review and answers nothing (pinned as
    // reports/google.tsx's text in google/profile/ until 26 Nov 2026).
    const asWho = globalThis.canDo;
    globalThis.canDo = () => false;
    try {
      assert.equal(byTestId(card(page(), "reviews-waiting"), "google-reply"), null, "a viewer: no reply to send");
    } finally {
      globalThis.canDo = asWho;
    }
    // A review is drawn once: Ana waits above, so the latest has none of its own, and says why.
    const latest = card(tree, "chart-google-latest");
    assert.equal(reviewRows(latest).length, 0);
    assert.ok(V.lines.latestEmpty && textOf(latest).includes(V.lines.latestEmpty), "and says why, in the fold's words");
    assert.equal(reviewRows(tree).length, 1, "one review row on the page");
    assert.equal(card(tree, "chart-google-gained"), null, "the profile counts what was written: no day-by-day gain");
    assert.equal(card(tree, "reviews-connect"), null, "nothing to connect: it is");
    // Neither card sets the other's height: the stars and the weeks share a row, the rest take the whole one.
    for (const [id, span] of [
      ["chart-reviews-stars", "rpt-span-5"],
      ["chart-reviews-weekly", "rpt-span-7"],
      ["reviews-waiting", "rpt-span-12"],
      ["chart-google-latest", "rpt-span-12"],
    ])
      assert.ok(classes(card(tree, id)).includes(span), id);
    // The reply box is the kit's Field: its words kept, a limit of 4096, and no typing while a draft is on its way.
    setLensAt(LENS_PATHS[5]);
    const reviews = pageOnce();
    press(byTestId(card(reviews, "reviews-waiting"), "google-reply"));
    const box = find(again(draw), (n) => n.type === Field);
    assert.deepEqual(
      [box.props.rows, box.props.maxLength, box.props.readOnly, box.props["data-testid"]],
      [3, 4096, true, "google-reply-text"],
    );
    assert.ok(box.props["aria-label"], "named, with no label drawn");
    setLensAt(LENS_PATHS[0]);
    // Five reviews are what Google hands back, never the listing: the way to the rest is the listing's own address,
    // in a tab of its own. No listing address, no link -- the card never invents one.
    assert.equal(
      byTestId(card(tree, "chart-google-latest"), "google-open-listing"),
      null,
      "no address from Google, no link: the card never invents one",
    );
    holdReviews(
      { ...NORTHSIDE, listing: { ...NORTHSIDE.listing, maps_uri: "https://maps.google.com/?cid=7" } },
      northsideLedger(),
    );
    const out = byTestId(card(page(), "chart-google-latest"), "google-open-listing");
    assert.equal(textOf(out), "Read every review on Google");
    assert.deepEqual(
      [out.props.href, out.props.target, out.props.rel],
      ["https://maps.google.com/?cid=7", "_blank", "noreferrer"],
      "the listing's own address, in a tab of its own",
    );
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("a reply opened is drafted by AI for the person: the box takes its words and says whose they are; a workspace set to Stays quiet asks for none", async () => {
  // Pinned as reports/google.tsx's text in google/review-reply.test.mjs until 26 Nov 2026.
  const drafts = [];
  const answer = globalThis.window.fetch;
  globalThis.window.fetch = async (url, init) => {
    const u = new URL(String(url), "https://app.test");
    if (/\/google\/reviews\/[^/]+\/draft$/.test(u.pathname)) {
      drafts.push(u.pathname);
      return new Response(JSON.stringify({ ok: true, data: { text: "Thank you, Ana!", mode: "ask" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return answer(url, init);
  };
  try {
    for (const [mode, asked] of [
      ["ask", 1],
      ["never", 0],
    ]) {
      drafts.length = 0;
      holdReviews({ ...NORTHSIDE, reply_mode: mode }, northsideLedger());
      setLensAt(LENS_PATHS[5]);
      press(byTestId(card(pageOnce(), "reviews-waiting"), "google-reply"));
      if (asked) {
        await until(
          () => find(again(draw), (n) => n.type === Field)?.props.value === "Thank you, Ana!",
          "the box takes AI's words",
        );
        assert.ok(byTestId(again(draw), "google-reply-drafted"), "and says they are AI's");
      } else for (let i = 0; i < 8; i++) await settle();
      assert.equal(drafts.length, asked, `${mode}: ${asked ? "one draft asked for" : "none"}`);
    }
  } finally {
    globalThis.window.fetch = answer;
    setLensAt(LENS_PATHS[0]);
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("a link to one review (reports/reviews:<id>) opens it where it is listed, marked, with its reply box open; one the lens does not list says so; the bare lens names none", async () => {
  const [ana] = NORTHSIDE.reviews;
  holdReviews(NORTHSIDE, northsideLedger());
  const named = (tree) => reviewRows(tree).filter((r) => r.props["data-named"] === "true");
  try {
    setLensAt(`${LENS_PATHS[5]}:${ana.id}`);
    let tree = pageOnce();
    assert.equal(named(tree).length, 1, "Ana's, where she waits");
    assert.ok(classes(named(tree)[0]).includes("is-named"), "marked");
    assert.equal(reviewRows(tree).length, 1, "drawn once, in the card she is listed in: the link adds no second copy");
    assert.equal(reviewRows(card(tree, "reviews-waiting")).length, 1);
    assert.equal(byTestId(tree, "google-review-missing"), null);
    // Her box opens as she is drawn, as a press on Reply opens it; the draft is asked for and none comes, so it is hers to fill.
    for (let i = 0; i < 5; i++) await settle();
    tree = again(draw);
    assert.ok(
      byTestId(tree, "google-reply-composer"),
      "REGRESSION: every notice opened the lens at its top, never the review",
    );
    // A review the lens does not list is said not to be here, and no box is opened for it.
    setLensAt(`${LENS_PATHS[5]}:22222222-2222-4222-8222-222222222222`);
    tree = pageOnce();
    assert.equal(named(tree).length, 0);
    assert.ok(byTestId(tree, "google-review-missing"), "the lens says so");
    assert.equal(byTestId(tree, "google-reply-composer"), null);
    // The lens alone names no review and says nothing of one.
    setLensAt(LENS_PATHS[5]);
    tree = pageOnce();
    assert.equal(named(tree).length, 0);
    assert.equal(byTestId(tree, "google-review-missing"), null);
  } finally {
    setLensAt(LENS_PATHS[0]);
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("a review that waits is drawn once, above Latest, which keeps the ones that do not; the held reply is said only where one was held", () => {
  const [ana] = NORTHSIDE.reviews;
  const bea = {
    ...ana,
    id: "22222222-2222-4222-8222-222222222222",
    review_id: "r-bea",
    author: "Bea R.",
    published_at: "2026-09-02T13:00:00Z",
    reply_text: "Thank you, Bea!",
    replied_at: "2026-09-02T20:00:00Z",
  };
  holdReviews(
    { ...NORTHSIDE, reviews: [ana, bea] },
    northsideLedger({
      written: [writtenReview(ana.id, ana.published_at, 5), writtenReview(bea.id, bea.published_at, 5, bea.replied_at)],
    }),
  );
  try {
    const tree = page();
    assert.equal(reviewRows(card(tree, "reviews-waiting")).length, 1, "Ana waits");
    assert.match(textOf(card(tree, "reviews-waiting")), /Ana P\./);
    const kept = reviewRows(card(tree, "chart-google-latest"));
    assert.equal(kept.length, 1, "and is not drawn again under Latest, which keeps Bea");
    assert.match(textOf(kept), /Bea R\./);
    assert.equal(
      all(tree, (n) => n.props?.["data-testid"] === "google-review-held").length,
      1,
      "one held reply, Ana's",
    );
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
  const answered = { ...ana, reply_text: "Thank you, Ana!", replied_at: "2026-09-03T20:00:00Z" };
  const V = holdReviews(
    { ...NORTHSIDE, reviews: [answered] },
    northsideLedger({
      written: [writtenReview(ana.id, ana.published_at, 5, "2026-09-03T20:00:00Z")],
      waiting_total: 0,
      waiting: [],
    }),
  );
  try {
    const tree = page();
    const waiting = card(tree, "reviews-waiting");
    assert.equal(
      textOf(find(waiting, (n) => classes(n).includes("ck-card-title"))),
      `Waiting for a reply (${V.waiting.total})`,
    );
    assert.equal(V.waiting.total, 0);
    assert.ok(V.lines.waitingEmpty && textOf(waiting).includes(V.lines.waitingEmpty), "the fold's words for none");
    assert.equal(reviewRows(waiting).length, 0);
    const latest = card(tree, "chart-google-latest");
    assert.equal(reviewRows(latest).length, 1, "the answered review is the latest, once");
    assert.equal(byTestId(tree, "google-review-held"), null, "no reply was held: nothing is said of one");
    assert.equal(V.tiles.at(3)?.value, "1 of 1", "and it counts as answered");
    assert.match(textOf(latest), /Thank you, Ana!/, "its reply, under it");
    assert.equal(
      takeaway(tree, "chart-google-latest"),
      `${V.google.source} · ${V.google.reply.words}`,
      "the source is named, and what AI does under a new review beside it",
    );
    assert.ok(V.google.reply.words, "which is something to say, under AI");
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("a record that starts after the period says where, in the section's meta and where the figures would be, and draws a dash for what it cannot count: never a zero", () => {
  // 100 of Google's 213 on record, the sync did not read the whole list, and the connection began Aug 30: the week began Aug 29
  const V = holdReviews(
    reviewsGoogle({ connection: googleConnection({ connected_at: "2026-08-30T12:00:00Z" }) }),
    reviewsLedger({ on_record: { profile: 100, places: 0, complete: false } }),
  );
  try {
    const tree = page();
    assert.ok(V.lines.history && sectionMeta(tree).includes(V.lines.history), sectionMeta(tree));
    assert.deepEqual(
      all(byTestId(tree, "google-tiles"), (n) => n.type === Figure).map((n) => [n.props.id, n.props.value]),
      V.tiles.map((t) => [t.metric, t.value]),
    );
    assert.deepEqual(
      V.tiles.slice(2).map((t) => t.value),
      ["—", "—", "—"],
      "what the record cannot count is a dash in the fold, and drawn as one",
    );
    const stars = card(tree, "chart-reviews-stars");
    assert.equal(all(stars, (n) => classes(n).includes("ck-barlist-row")).length, 0, "no mix of what is not counted");
    assert.ok(
      textOf(stars).includes(V.lines.historyTitle),
      "the fold's own words for a title, never the page's lower-casing of the other",
    );
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("Google's reviews from the five it shows first: four figures, the ratings gained day by day, the latest, and what the Business Profile would add", () => {
  const places = { ...NORTHSIDE, connection: null, reviews: [{ ...NORTHSIDE.reviews[0], origin: "places" }] };
  // The reader keeps no ledger where no profile has synced: the five public reviews are no record to count.
  const V = holdReviews(places, null);
  try {
    const tree = page();
    assert.deepEqual(
      figureIds(tree),
      ["rating", "reviews", "ratings_gained", "newest_review"],
      "the listing's four, each named by its metric",
    );
    assert.ok(
      classes(byTestId(tree, "google-tiles")).includes("listing") &&
        !classes(byTestId(tree, "google-tiles")).includes("profile"),
      "the listing's strip: four columns by its role (--cells), never by a class that says four",
    );
    assert.ok(plot(tree, "chart-google-gained"), "the ratings gained, day by day, on the kit");
    assert.equal(takeaway(tree, "chart-google-gained"), "", "the count gained is the tiles'");
    assert.equal(reviewRows(card(tree, "chart-google-latest")).length, 1, "the five Google shows first, here one");
    assert.equal(
      takeaway(tree, "chart-google-latest"),
      V.google.source,
      "the source is named, and no reply to say where a review cannot be answered from here",
    );
    for (const id of ["chart-reviews-stars", "chart-reviews-weekly", "reviews-waiting"])
      assert.equal(card(tree, id), null, `${id}: the five public reviews count nothing`);
    assert.equal(
      byTestId(tree, "google-reply"),
      null,
      "a review that did not come through the profile cannot be answered",
    );
    for (const id of ["chart-google-gained", "chart-google-latest"])
      assert.ok(classes(card(tree, id)).includes("rpt-span-12"), id);
    const connect = card(tree, "reviews-connect");
    assert.ok(textOf(connect).includes(V.lines.connect), "what the profile would add, in the fold's own words");
    assert.ok(V.lines.connect, "the fold has the words");
    press(find(connect, (n) => n.type === "button"));
    assert.deepEqual(went, ["admin/integrations"], "and the door to Connections");
    // Connected, the location not yet chosen: the same five, the connection's own words in the meta and in the card.
    const toChoose = holdReviews(
      {
        ...places,
        connection: { ...NORTHSIDE.connection, location_name: null, location_title: null, last_synced_at: null },
      },
      null,
    );
    const pending = page();
    const joined = toChoose.google.connection;
    assert.ok(joined.pending && joined.words, "the fold has the connection's words for a location still to choose");
    assert.ok(sectionMeta(pending).includes(joined.words));
    assert.ok(textOf(card(pending, "reviews-connect")).includes(joined.words));
    assert.deepEqual(figureIds(pending), ["rating", "reviews", "ratings_gained", "newest_review"]);
    // One reading of Google's count is no difference: the card says so in the fold's words, with no days to draw.
    const first = holdReviews({ ...places, days: places.days.slice(-1) }, null);
    const young = page();
    assert.ok(first.lines.gained, "the fold has the words");
    assert.equal(takeaway(young, "chart-google-gained"), first.lines.gained);
    assert.ok(textOf(card(young, "chart-google-gained")).includes(first.lines.gainedEmpty));
    assert.equal(plot(young, "chart-google-gained"), null, "nothing to plot");
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("a reply from a waiting row says it is on Google: the answer takes the review out of the waiting card, and the toast is the section's, not the composer's", async () => {
  const [ana] = NORTHSIDE.reviews;
  const answered = { ...ana, reply_text: "Thank you, Ana!", replied_at: "2026-09-04T14:00:00Z" };
  // The shell's toast, as the shell holds it: the state of the component that asked for it, drawn only while that component is.
  const shellToast = globalThis.usePPToast;
  globalThis.usePPToast = () => {
    const [said, say] = globalThis.React.useState(null);
    return [said ? globalThis.React.createElement("div", { "data-testid": "toast" }, textOf(said.msg)) : null, say];
  };
  keepReportPeriod("7d");
  holdReviews(NORTHSIDE, northsideLedger());
  reviewReply.posted.length = 0;
  reviewReply.reread = 0;
  reviewReply.now = reviewsDto({
    days: 7,
    google: { ...NORTHSIDE, reviews: [answered] },
    ledger: northsideLedger({
      written: [writtenReview(ana.id, ana.published_at, 5, answered.replied_at)],
      waiting_total: 0,
      waiting: [],
    }),
  });
  const settled = async () => {
    for (let i = 0; i < 20; i++) await settle();
  };
  try {
    setLensAt(LENS_PATHS[5]);
    let tree = pageOnce();
    assert.equal(reviewRows(card(tree, "reviews-waiting")).length, 1, "Ana waits");
    // The card's heading is where focus goes once the row that held it is gone: a place the section holds, which a browser would fill.
    const focused = [];
    find(card(tree, "reviews-waiting"), (n) => classes(n).includes("ck-card-title")).props.ref.current = {
      focus: () => focused.push("the waiting card's heading"),
    };
    press(byTestId(card(tree, "reviews-waiting"), "google-reply"));
    await settled(); // the draft is asked for, and none comes: the box is hers to fill
    tree = again(draw);
    find(tree, (n) => n.type === Field).props.onValueChange("Thank you, Ana!");
    tree = again(draw);
    press(byTestId(tree, "google-reply-send"));
    await until(() => focused.length > 0, "the reply to land (its answer re-reads Reviews and Today first)");
    await settled();
    tree = again(draw);
    assert.deepEqual(reviewReply.posted, ["Thank you, Ana!"], "her words went to the route");
    assert.deepEqual(focused, ["the waiting card's heading"], "focus is sent to the card, once, when the reply landed");
    assert.equal(
      reviewReply.googleReads,
      0,
      "and Google is not read beside the Reviews read: its answer carries Google's",
    );
    assert.ok(
      textOf(card(tree, "reviews-waiting")).includes(reviewsHeld(reviewReply.now).vm.lines.waitingEmpty),
      "the review left the waiting card, which says so in the fold's words",
    );
    const toasts = all(tree, (n) => n.props?.["data-testid"] === "toast");
    assert.equal(toasts.length, 1, "and the page still says it landed, once");
    assert.equal(textOf(toasts[0]), "Your reply is on Google, under the review.");
    // The section draws it, outside every review: a toast a row draws leaves with the row, which a real React would not keep.
    assert.deepEqual(
      all(tree, (n) => classes(n).includes("rp2-review") && !!byTestId(n, "toast")),
      [],
      "not inside a review's own composer",
    );
  } finally {
    reviewReply.now = null;
    globalThis.usePPToast = shellToast;
    setLensAt(LENS_PATHS[0]);
    setSurfaceValue("reports_reviews", undefined);
    // The answer's re-read of Today, not served here, is asked for again 2 and 10 s later (RETRY_AFTER_MS): drop it.
    stopRunner();
    setStopRunner(startSurfaces([], () => () => {}));
  }
});

test("the reviews a card lists are a list, one item each, and a review's stars are an image that says its rating, or that it has none", () => {
  const [ana] = NORTHSIDE.reviews;
  const unrated = {
    ...ana,
    id: "33333333-3333-4333-8333-333333333333",
    review_id: "r-cy",
    author: "Cy T.",
    rating: null,
  };
  const answered = {
    ...ana,
    id: "22222222-2222-4222-8222-222222222222",
    review_id: "r-bea",
    author: "Bea R.",
    reply_text: "Thank you, Bea!",
    replied_at: "2026-09-02T20:00:00Z",
    published_at: "2026-09-02T13:00:00Z",
  };
  const V = holdReviews(
    { ...NORTHSIDE, reviews: [ana, unrated, answered] },
    northsideLedger({
      written: [writtenReview(answered.id, answered.published_at, 5, answered.replied_at)],
      waiting_total: 2,
      waiting: [
        { ...ana, held: "price" },
        { ...unrated, held: null },
      ],
    }),
  );
  try {
    const tree = page();
    for (const id of ["reviews-waiting", "chart-google-latest"]) {
      const list = find(card(tree, id), (n) => n.type === "ul");
      assert.ok(list, `${id}: a list`);
      assert.ok(classes(list).includes("rp2-reviews"));
      const items = all(list, (n) => n.type === "li");
      assert.deepEqual(
        items.map((li) => li.props["data-testid"]),
        items.map(() => "google-review"),
        `${id}: each review is an item of it`,
      );
      assert.equal(items.length, reviewRows(card(tree, id)).length, `${id}: and no review is drawn outside it`);
    }
    const images = all(card(tree, "reviews-waiting"), (n) => n.props?.role === "img");
    assert.deepEqual(
      images.map((n) => n.props["aria-label"]),
      ["5 of 5 stars", "No rating"],
      "the rating in words, and none said as none",
    );
    assert.deepEqual(
      images.map(textOf),
      V.waiting.rows.map((r) => r.stars),
      "over the glyphs the image stands for",
    );
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("on a phone the reviews that wait come first, ahead of the figures; with none waiting, and on a desk, they keep their place", () => {
  const ORDER = [
    "reviews-waiting",
    "google-tiles",
    "chart-reviews-stars",
    "chart-reviews-weekly",
    "chart-google-latest",
  ];
  const orderOf = (tree) =>
    all(tree, (n) => ORDER.includes(n.props?.["data-testid"])).map((n) => n.props["data-testid"]);
  const desk = [
    "google-tiles",
    "chart-reviews-stars",
    "chart-reviews-weekly",
    "reviews-waiting",
    "chart-google-latest",
  ];
  const [ana] = NORTHSIDE.reviews;
  const draws = (phone) => {
    const width = atWidth(phone);
    try {
      setLensAt(LENS_PATHS[5]);
      return pageOnce();
    } finally {
      width.put();
      setLensAt(LENS_PATHS[0]);
    }
  };
  try {
    holdReviews(NORTHSIDE, northsideLedger());
    assert.deepEqual(orderOf(draws(false)), desk, "a desk: the figures, the charts, then who waits");
    assert.deepEqual(
      orderOf(draws(true)),
      ["reviews-waiting", "google-tiles", "chart-reviews-stars", "chart-reviews-weekly", "chart-google-latest"],
      "a phone: who waits is the work, and comes first",
    );
    holdReviews(
      NORTHSIDE,
      northsideLedger({
        written: [writtenReview(ana.id, ana.published_at, 5, "2026-09-03T20:00:00Z")],
        waiting_total: 0,
        waiting: [],
      }),
    );
    assert.deepEqual(orderOf(draws(true)), desk, "nothing waits: a card that says so is no work, and keeps its place");
    // The listing's own figures count no reply: nothing to put first.
    holdReviews({ ...NORTHSIDE, connection: null, reviews: [{ ...ana, origin: "places" }] }, null);
    assert.equal(byTestId(draws(true), "reviews-waiting"), null);
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("the doors out of the Reviews lens are for a person who may use them: the words stay for the rest", () => {
  const places = { ...NORTHSIDE, connection: null, reviews: [{ ...NORTHSIDE.reviews[0], origin: "places" }] };
  const asWho = globalThis.canDo;
  const door = (tree) => find(byTestId(tree, "reviews-connect"), (n) => n.type === "button");
  try {
    for (const [who, may] of [
      ["an owner", () => true],
      ["an operator", (action) => action === "approve"],
      ["a viewer", () => false],
    ]) {
      globalThis.canDo = may;
      const V = holdReviews(places, null);
      const tree = page();
      assert.ok(textOf(byTestId(tree, "reviews-connect")).includes(V.lines.connect), `${who}: the words`);
      if (who === "an owner") {
        assert.equal(textOf(door(tree)), "Open Connections");
        press(door(tree));
        assert.deepEqual(went, ["admin/integrations"], "the owner's door leads to Connections");
      } else assert.equal(door(tree), null, `${who}: no door to what they may not do`);
    }
  } finally {
    globalThis.canDo = asWho;
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("a pick whose Reviews read could not be made says so on the lens through the follower, with its Retry, while the page shows the period picked and the head says nothing it cannot show", async () => {
  const hash = globalThis.location.hash;
  globalThis.location.hash = "#/reports/reviews";
  setLensAt(LENS_PATHS[5]);
  try {
    await inPeriodTest("answer", async () => {
      // Seven days is read and held, as it was by the visit before; the report answers every period, and the Reviews read none.
      holdReviews(NORTHSIDE, northsideLedger());
      setStatus("reports_reviews", "live");
      let tree = pageOnce();
      assert.ok(byTestId(tree, "google-tiles"), "the figures stand");
      choose(tree, "30 days");
      for (let i = 0; i < 12; i++) await settle();
      redraw(); // the effect that follows the report's answer clears what the page held, and the next draw shows it
      tree = redraw();
      assert.equal(chosen(tree), "30 days", "the page shows the period it picked: the report landed");
      assert.equal(failedLine(tree), null, "which did not fail, so the page's own row says nothing");
      const words = byTestId(tree, "reviews-failed");
      assert.ok(words, "the lens says its own read failed");
      assert.ok(textOf(words).includes("Couldn't read your Google reviews"), textOf(words));
      assert.ok(
        find(tree, (n) => n.props?.surface === "reports_reviews"),
        "with the Retry that reads it again",
      );
      assert.equal(byTestId(tree, "google-tiles"), null, "the seven days it left are not drawn under thirty");
      assert.equal(standingSaid().sentence, undefined, "nor said at the head");
      assert.equal(
        byTestId(tree, "reports-real").props["data-loading"],
        undefined,
        "and nothing dims: a card that dims takes no press",
      );
    });
  } finally {
    globalThis.location.hash = hash;
    setLensAt(LENS_PATHS[0]);
    setStatus("reports_reviews", "live");
    setSurfaceValue("reports_reviews", undefined);
    keepReportPeriod("7d");
  }
});

test("over the tests' sample as its reads, the Reviews lens draws the listing through the same section, and nothing in it can be answered", () => {
  try {
    const tree = overSample(5);
    const sample = reviewsSample("30d");
    assert.ok(byTestId(tree, "reports-real"), "the one page");
    assert.deepEqual(figureIds(tree), ["rating", "reviews", "ratings_gained", "newest_review"], "the listing's four");
    assert.equal(standingSaid().sentence, sample.vm.lines.head, "the head says the sample's fold");
    assert.equal(
      reviewRows(card(tree, "chart-google-latest")).length,
      sample.vm.latest.length,
      "the reviews Google shows",
    );
    assert.equal(byTestId(tree, "google-reply"), null, "a listing with no profile behind it takes no reply");
    assert.ok(
      textOf(byTestId(tree, "reviews-connect")).includes(sample.vm.lines.connect),
      "and says what a profile would add",
    );
    assert.equal(byTestId(tree, "reports-real").props["data-loading"], undefined, "nothing is on its way");
  } finally {
    offSample();
  }
});

test("over the tests' sample as its reads, the Receptionist lens draws every part of its own read through the same fold", () => {
  const own = receptionistSample("30d");
  const fold = toReceptionistReportVM(own.dto, { nowMs: own.readAt });
  try {
    const tree = overSample(1);
    for (const id of [
      "receptionist-strip",
      "chart-hold",
      "chart-topics",
      "chart-languages",
      "chart-call-endings",
      "receptionist-link",
      "receptionist-figures",
      "receptionist-stuck",
    ])
      assert.ok(byTestId(tree, id), `${id}: the sample has every part`);
    assert.equal(byTestId(tree, "receptionist-failed"), null);
    assert.equal(byTestId(tree, "reports-real").props["data-loading"], undefined, "nothing is on its way");
    assert.equal(
      textOf(cls(card(tree, "chart-hold"), "ck-card-takeaway")),
      fold.hold.line,
      "the hold's line is the fold's, of the sample's numbers",
    );
    assert.equal(
      textOf(cls(card(tree, "chart-reply"), "ck-dotplot-ref")),
      "your 1-minute hold ends",
      "the sample's business has a hold, so its replies are plotted past it",
    );
  } finally {
    offSample();
  }
});

test("over the tests' sample as its reads, the People lens draws every part of its own read through the same fold", () => {
  const fold = toPeopleReportVM(peopleSample("30d").dto);
  try {
    const tree = overSample(2);
    for (const id of [
      "people-strip",
      "chart-people-channels",
      "chart-people-first",
      "chart-people-yeses",
      "chart-people-stops",
      "chart-people-wires",
      "chart-people-fresh",
      "people-time",
      "chart-people-steps",
      "chart-people-bounced",
      "people-stuck",
      "people-stand",
      "chart-people",
      "chart-rhythm",
    ])
      assert.ok(byTestId(tree, id), `${id}: the sample has every part`);
    assert.equal(byTestId(tree, "people-failed"), null);
    assert.equal(byTestId(tree, "people-now-failed"), null);
    assert.equal(byTestId(tree, "reports-real").props["data-loading"], undefined, "nothing is on its way");
    assert.equal(standingSaid().sentence, fold.head, "the head says the sample's fold");
    assert.equal(
      textOf(cls(card(tree, "chart-people-steps"), "ck-card-takeaway")),
      fold.stepsDone.line,
      "a card's line is the fold's, of the sample's numbers",
    );
  } finally {
    offSample();
  }
});

test("over the tests' sample as its reads, the Campaigns lens draws every part of its own read but the reach-outs, and the Overview has something worth knowing", () => {
  const s = campaignsSample("30d");
  const fold = toCampaignLensVM({ campaigns: s.campaigns, ledger: s.ledger, reachOuts: s.reachOuts }, Date.now());
  try {
    const tree = overSample(4);
    for (const id of [
      "campaigns-strip",
      "chart-funnel",
      "chart-campaigns",
      "chart-campaigns-held",
      "chart-campaigns-stopped",
      "chart-campaigns-failed-why",
      "chart-campaign-channels",
      "chart-campaigns-by-message",
      "chart-sources",
      "campaigns-time",
      "chart-campaigns-first-reply",
      "chart-campaigns-approval",
      "campaigns-stuck",
    ])
      assert.ok(byTestId(tree, id), `${id}: the sample has every part`);
    assert.equal(byTestId(tree, "campaigns-failed-campaigns"), null);
    assert.equal(byTestId(tree, "campaigns-failed-ledger"), null);
    assert.equal(byTestId(tree, "chart-campaigns-quiet"), null, "a sample that sends is not a quiet one");
    assert.equal(byTestId(tree, "rpt-reach-outs"), null, "a read with no reach-outs draws none");
    assert.equal(byTestId(tree, "reports-real").props["data-loading"], undefined, "nothing is on its way");
    assert.equal(standingSaid().sentence, fold.head, "the head says the sample's fold");
    assert.equal(
      textOf(cls(card(tree, "chart-funnel"), "ck-card-takeaway")),
      fold.funnel.line,
      "a card's line is the fold's, of the sample's numbers",
    );
    // And the Overview stands on the same reads, Worth knowing included (it reads the same sample's sources).
    assert.ok(card(overSample(0), "reports-facts"), "Worth knowing has something to say");
  } finally {
    offSample();
  }
});

test("with nothing read the page says what Reports reads; over a read it is the one page", () => {
  offSample();
  fresh();
  assert.ok(byTestId(draw(), "reports-none"), "nothing read: the page says what Reports reads");
  try {
    const tree = overSample(0);
    assert.ok(byTestId(tree, "reports-real") && byTestId(tree, "reports-hero"), "the one Reports page, over the read");
    assert.equal(chosen(tree), "30 days");
    const people = overSample(2);
    assert.ok(
      byTestId(people, "people-strip") && byTestId(people, "chart-people") && byTestId(people, "chart-rhythm"),
      "and its People lens",
    );
    assert.equal(byTestId(people, "people-failed"), null);
  } finally {
    offSample();
  }
});
