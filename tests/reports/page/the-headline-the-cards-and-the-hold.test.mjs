/**
 * Reports: the headline, the cards, and phase A through the page (the Reports lenses spec, D14 and A2): the hold the
 * owner set, and the hours they keep.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toReportVM, REPORT_CHANNELS } from "@chanlytics/contracts";
import { fresh, all, find, byTestId, textOf, classes, press } from "../../_stub-react.mjs";
import { reportDto, quiet, rday } from "../_report-world.mjs";
import {
  ARRIVALS,
  Figure,
  HELD,
  HOURS,
  HeatStrip,
  PEOPLE_RHYTHM_UNIT,
  RPT_CHANNEL_COLORS,
  RadarChart,
  RptStrip,
  Segmented,
  card,
  cls,
  factOf,
  inLens,
  page,
  pageOnce,
  redraw,
  takeaway,
  went,
} from "./_page.mjs";

/* ------------------------------------------ the headline ------------------------------------------ */

test("the headline: AI's part of the answered as a meter, the period before as a tick, the view model's sentence under it", () => {
  const hero = card(page(), "reports-hero");
  assert.equal(textOf(cls(hero, "rpt-hero-number")), "76%");
  assert.equal(
    textOf(cls(hero, "rpt-hero-line")),
    "13 of 17 customer messages, without you. Half of its replies went out within 28s.",
  );
  assert.equal(textOf(cls(hero, "rpt-hero-compare")), "100% the 7 days before");
  assert.ok(cls(hero, "ck-radial-marker"), "the period before, a tick on the ring");
  const none = card(page({ report: quiet() }), "reports-hero");
  assert.equal(textOf(cls(none, "rpt-hero-line")), "No customer wrote in this period.");
  assert.equal(cls(none, "rpt-hero-number"), null, "no share of nothing: the ring's centre stays empty");
  assert.equal(cls(none, "ck-radial-value"), null, "an empty ring");
  assert.equal(cls(none, "rpt-hero-compare"), null, "and nothing to compare with");
});

test("Worth knowing: the bridge's facts in their order, one line each, a row with a door is one link", () => {
  const facts = all(card(page(), "reports-facts"), (n) => n.type === "li");
  assert.deepEqual(
    facts.map((f) => f.props["data-fact"]),
    ["unanswered", "handovers", "busiest"],
  );
  assert.equal(textOf(facts[0]), "1 message has no reply yetOpen the Inbox");
  assert.ok(classes(facts[0]).includes("is-warn"), "in amber, with its icon");
  assert.equal(textOf(facts[1]), "Top reason it handed over: asked for a person2 timesSee them");
  assert.equal(textOf(facts[2]), "Tuesday was your busiest daypeak 10am to 12pm");
  const row = find(facts[0], (n) => n.type === "a");
  assert.ok(classes(row).includes("rpt-fact-row"), "the whole row is the door, and a door is a link");
  assert.match(row.props.href, /inbox$/, "REGRESSION: a button that went nowhere a link could: no address in it");
  assert.equal(
    row.props.title,
    undefined,
    "no native title: the sentence is the row's words, wrapped, never cut short",
  );
  press(row);
  assert.deepEqual(went, ["inbox"]);
  assert.equal(
    find(facts[2], (n) => n.type === "a" || n.type === "button"),
    null,
    "a fact with no door is no link and no button",
  );
});

test("a period that had people in it but nothing to act on says so in one line", () => {
  // Every day of the week alike (no one busiest day), nothing unanswered, no handover, no channel counted.
  const even = {
    series: reportDto().series.map((d, i) => (i < 7 ? d : rday(d.day, { messages_in: 2, answered_ai: 2 }))),
    reasons: {},
    channels: undefined,
    hours: undefined,
    replies: undefined,
  };
  assert.equal(
    textOf(card(page({ report: even, campaigns: null }), "reports-facts")),
    "Worth knowingA quiet period. Nothing stood out.",
  );
});

test("the strip's figures: five counts, each named by its metric, the period before said in counts beside the value, booked from the calendar", () => {
  const read = (t) => [
    t.props["data-figure"],
    textOf(cls(t, "figure-term") ?? cls(t, "figure-label")),
    ...["figure-value", "figure-meta"].map((c) => textOf(cls(t, c))),
  ];
  const figures = (opts) =>
    all(card(page(opts), "reports-tiles"), (n) => n.type === "div" && classes(n).includes("figure")).map(read);
  assert.deepEqual(figures(), [
    ["customer_messages", "Customer messages", "17up from 7", "on 6 of 7 days"],
    ["calls", "Calls", "3none the 7 days before", "7 min on the phone · 1 to voicemail"],
    ["new_people", "New people", "2down from 3", "first got in touch in this period"],
    ["booked", "Booked", "3", "of 8 who asked"],
    ["handovers", "Needed you", "3none the 7 days before", "times AI stopped"],
  ]);
  assert.deepEqual(figures({ booking: { calendar: "none", days: 7, asked: 0, booked: 0 } })[3], [
    "booked",
    "Booked",
    "—",
    "no calendar link",
  ]);
  assert.deepEqual(figures({ booking: { calendar: "unavailable", days: 7, asked: 4, booked: 0 } })[3], [
    "booked",
    "Booked",
    "—",
    "the calendar couldn't be read",
  ]);
  const strip = card(page(), "reports-tiles");
  assert.equal(strip.type, "dl", "terms and their values");
  assert.deepEqual(all(strip, (n) => n.type === "dt").length, 5);
  // The Campaigns lens draws five of its own, and none of them is the Overview's.
  const own = card(page(), "campaigns-strip");
  assert.equal(own.type, "dl");
  assert.deepEqual(all(own, (n) => n.type === "dt").length, 5);
  assert.deepEqual(
    all(own, (n) => n.type === "div" && n.props["data-figure"]).map((n) => n.props["data-figure"]),
    ["people_sent_to", "delivered_share", "people_wrote_back", "said_yes", "asked_to_stop"],
  );
});

test("a figure that counts what has a page opens it: Needed you is a door to the Inbox, a count with no page of its own is no door", () => {
  const strip = card(page(), "reports-tiles");
  const figureOf = (id) => find(strip, (n) => n.type === "div" && n.props["data-figure"] === id);
  const needed = find(figureOf("handovers"), (n) => n.type === "a");
  assert.ok(needed, "the number is a link, since a door is a link");
  assert.equal(needed.props.href, "/w/studio/inbox");
  assert.equal(textOf(needed), "3");
  press(needed);
  assert.deepEqual(went, ["inbox"], "and a plain press goes there by the app's own way");
  const messages = find(figureOf("customer_messages"), (n) => n.type === "a");
  assert.equal(
    messages.props.href,
    "/w/studio/conversations",
    "the customer messages open the conversations they count",
  );
  for (const id of ["calls", "new_people", "booked"])
    assert.equal(
      find(figureOf(id), (n) => n.type === "a" || n.type === "button"),
      null,
      `${id} opens nothing`,
    );
});

test("a ratio of too few is greyed and says so: three answered is under the minimum, seventeen is read", () => {
  const thin = (n) =>
    toReportVM(
      reportDto({
        series: reportDto().series.map((d, i) =>
          i < 7 ? d : rday(d.day, i === 7 ? { messages_in: n, conversations: 1, answered_ai: n } : {}),
        ),
      }),
      { profile: null },
    );
  const answeredFigure = (vm) => {
    fresh();
    const strip = RptStrip({ tiles: vm.tiles.filter((t) => t.id === "answered"), testid: "answered-strip" });
    assert.equal(strip.props["data-testid"], "answered-strip", "the strip is named for a test that finds it");
    return find(strip, (n) => n.type === "div" && n.props["data-figure"] === "answered_share");
  };
  const few = answeredFigure(thin(3));
  assert.deepEqual(classes(few), ["figure", "is-thin", "rpt-cell"], "the figure wears the kit's thin state");
  assert.equal(textOf(cls(few, "figure-n")), "only 3, too few to read");
  assert.equal(textOf(cls(few, "figure-value")), "100%", "the number is still said, greyed, never hidden");
  const enough = answeredFigure(thin(9));
  assert.deepEqual(classes(enough), ["figure", "rpt-cell"]);
  assert.equal(cls(enough, "figure-n"), null);
  const none = answeredFigure(thin(0));
  assert.equal(textOf(cls(none, "figure-value")), "—", "nothing to answer is a dash, never a zero");
  assert.deepEqual(classes(none), ["figure", "rpt-cell"], "of none there is no ratio to grey");
  assert.equal(cls(none, "figure-n"), null, "and no line says it is of none: the meta already says why");
  assert.equal(
    find(answeredFigure(thin(3)), (n) => n.type === "a" || n.type === "button"),
    null,
    "the share has no page of its own, so its number is no door",
  );
});

test("a tile that says what needs you or what failed draws a figure with its tone; a tile with none draws none", () => {
  const tile = {
    id: "stuck",
    metric: "waiting_on_you",
    label: "Steps overdue",
    value: "6",
    meta: "",
    compare: "up from 2",
  };
  const figureOf = (t) => {
    fresh();
    return find(RptStrip({ tiles: [t] }), (n) => n.type === Figure);
  };
  assert.equal(figureOf({ ...tile, tone: "warn" }).props.tone, "warn", "what needs you is amber");
  assert.equal(figureOf({ ...tile, tone: "fail" }).props.tone, "fail", "what failed is red");
  assert.equal(figureOf(tile).props.tone, undefined, "a tile with no tone draws a figure with none");
  const warned = find(
    RptStrip({ tiles: [{ ...tile, tone: "warn" }] }),
    (n) => n.type === "div" && n.props["data-figure"] === "waiting_on_you",
  );
  assert.deepEqual(classes(warned), ["figure", "is-warn", "rpt-cell"], "the kit's figure wears the tone");
  assert.equal(textOf(cls(warned, "figure-change")), "up from 2", "its change is still said, in the kit's plain ink");
  // No tile of the page's own lenses sets a tone yet: the People lens's stuck-now figures are the first.
  const vm = toReportVM(reportDto(), { profile: null });
  assert.deepEqual(
    vm.tiles.filter((t) => t.tone !== undefined).map((t) => t.id),
    [],
    "no existing tile is toned",
  );
});

/* ------------------------------------------ the cards ------------------------------------------ */

test("every card is drawn, under the testids the e2e, Today and the Google tests read, in the lenses' sections", async () => {
  const tree = page();
  for (const id of [
    "chart-answered",
    "chart-reply",
    "chart-reasons",
    "chart-calls",
    "chart-booking",
    // The Receptionist lens's own (receptionist/receptionist-page.test.mjs holds their words and states).
    "receptionist-strip",
    "chart-hold",
    "chart-topics",
    "chart-languages",
    "chart-call-endings",
    "receptionist-link",
    "receptionist-time",
    "receptionist-figures",
    "receptionist-stuck",
    // The People lens's own (people/people-page.test.mjs holds their words and states), then the two cards the frame kept.
    "people-strip",
    "chart-people-channels",
    "chart-people-first",
    "chart-people-yeses",
    "chart-people-stops",
    "chart-people-wires",
    "chart-people-fresh",
    "chart-rhythm",
    "chart-people",
    "people-time",
    "chart-people-steps",
    "chart-people-bounced",
    "people-stuck",
    "people-stand",
    // The Campaigns lens's own (campaigns/campaigns-page.test.mjs holds their words and states).
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
    "campaigns-stuck-strip",
    "rpt-reach-outs",
    "ro-strip",
    "ro-emails",
    "ro-funnel",
    "ro-angles",
    "ro-mailboxes",
    "ro-written",
    "ro-sources",
  ])
    assert.ok(card(tree, id), id);
  // The sources' card names what sent them as a person reads it: campaigns, never playbooks (decision 19). A table of none is not
  // drawn (campaigns/campaigns-page.test.mjs: nothing went out, so the funnel and the days say so).
  assert.equal(
    find(tree, (n) => n.props?.testid === "chart-sources" && typeof n.props.title === "string")?.props.title,
    "By campaign and one-off send",
  );
  // A lens draws no heading that says what its tab says (Ruben, 9 Oct 2026): the section keeps its label for a screen reader. The
  // Campaigns lens's reach-outs are a part of their own, and name themselves.
  assert.deepEqual(all(tree, (n) => n.type === "h2").map(textOf), ["Worth knowing", "Cold email"]);
  assert.deepEqual(
    all(tree, (n) => n.type === "section" && n.props.className === "rpt-section").map((n) => n.props["aria-label"]),
    [
      "AI",
      "Time between steps",
      "Stuck now",
      "Your customers",
      "Time between steps",
      "Stuck now",
      "Campaigns",
      "Time between steps",
      "Stuck now",
      "Cold email",
    ],
  );
  assert.equal(
    find(tree, (n) => n.type === "section" && n.props["aria-label"] === "This period").props.className,
    "rpt-grid rpt-top",
  );
});

test("each card's one line is the view model's, and adds the next thing: never a number the hero, a tile or a legend gives", () => {
  const tree = page();
  assert.equal(takeaway(tree, "chart-answered"), "Most messages on Sep 1: 5.");
  assert.equal(takeaway(tree, "chart-reply"), "The slowest took 33m.", "eight replies: too few for a nine-in-ten");
  assert.equal(
    takeaway(tree, "chart-calls"),
    "About 2m 10s a call.",
    "390 seconds over 3 calls; the minutes and the voicemail are the tile's",
  );
  assert.equal(takeaway(tree, "chart-rhythm"), "Nothing on Monday.", "the busy side of the week is Worth knowing's");
  // The funnel says its own sentence (the messages' shares: the strip above it counts the people they went to, and the yeses and the stops).
  assert.equal(
    takeaway(tree, "chart-funnel"),
    "80% were delivered, 79% of WhatsApp's were read and 20% were answered within 3 days, of 20 messages.",
  );
  assert.doesNotMatch(takeaway(tree, "chart-funnel"), /said yes|asked to stop/);
  assert.equal(
    takeaway(tree, "chart-campaigns"),
    "From 2 campaign runs and 1 one-off send.",
    "the sends are the funnel's; the card says what sent them, in the ledger's runs",
  );
  for (const id of ["chart-reasons", "chart-people", "chart-booking"])
    assert.equal(takeaway(tree, id), "", `${id}: its tile already says it`);
});

test("'every message was answered without you' is said only when it is true", () => {
  const without = page({
    report: {
      reasons: {},
      series: reportDto().series.map((d) => ({ ...d, answered_you: 0, unanswered: 0, escalations: 0 })),
    },
  });
  assert.ok(textOf(card(without, "chart-reasons")).includes("every message was answered without you"));
  const said = textOf(card(page({ report: { reasons: {} } }), "chart-reasons"));
  assert.ok(!said.includes("without you") && said.includes("answered by you or by nobody"), said);
});

test("the kept rhythm card: the week round a radar and the hours under it, 24 cells, in the contracts' unit words", () => {
  const tree = page();
  const rhythm = card(tree, "chart-rhythm");
  assert.ok(cls(rhythm, "ck-radar-line"), "the week round a radar");
  assert.equal(all(rhythm, (n) => classes(n).includes("ck-cell")).length, 24, "a cell an hour");
  const strip = find(rhythm, (n) => n.type === HeatStrip);
  assert.equal(strip.props.unit, PEOPLE_RHYTHM_UNIT, "the hours count what contracts says they count");
  assert.equal(PEOPLE_RHYTHM_UNIT, "messages and calls");
  assert.ok(strip.props.ariaLabel.includes(PEOPLE_RHYTHM_UNIT), strip.props.ariaLabel);
  const radar = find(rhythm, (n) => n.type === RadarChart);
  assert.ok(radar.props.ariaLabel.includes(PEOPLE_RHYTHM_UNIT), radar.props.ariaLabel);
  // The donut is gone: nothing on the page draws a pie of the channels, and the lens's card is a list of bars. The walk
  // reaches what the kit's parts rendered (the rhythm card's own cells above), so a pie's class would be found.
  assert.deepEqual(
    all(tree, (n) => classes(n).some((c) => /^ck-(pie|slice)/.test(c))),
    [],
    "REGRESSION: the donut counted messages and calls and said 'people': no element wears a ck-pie or ck-slice class",
  );
  assert.equal(card(tree, "chart-channels"), null);
});

test("a caller's mood and the reply spread are part-bars in their own order, each part in its colour and its word", () => {
  const tree = page();
  const mood = byTestId(card(tree, "chart-calls"), "caller-mood");
  // A mood is an order, not a verdict: its parts wear the ordinal ink ramp like the spread, never the green and red of a status.
  assert.deepEqual(
    [mood.props.style["--color-Positive"], mood.props.style["--color-Neutral"]],
    ["var(--chart-ramp-5)", "var(--chart-ramp-4)"],
  );
  const moodColors = Object.entries(mood.props.style).filter(([k]) => k.startsWith("--color-"));
  assert.equal(moodColors.length, 2);
  assert.ok(
    moodColors.every(([, c]) => /^var\(--chart-ramp-\d\)$/.test(c)),
    "no var(--ok) and no var(--danger)",
  );
  assert.equal(textOf(find(mood, (n) => classes(n).includes("ck-legend"))), "Positive2Neutral1");
  const spread = byTestId(card(tree, "chart-reply"), "reply-spread");
  assert.deepEqual(
    all(
      find(spread, (n) => classes(n).includes("ck-segbar-bar")),
      (n) => n.type === "i",
    ).map((i) => i.props.style["--part-color"]),
    ["var(--color-lt15)", "var(--color-lt60)", "var(--color-lt300)", "var(--color-lt1800)", "var(--color-gte1800)"],
    "fastest first: 4, 8 and 12s; 15 and 40s; 70s; 400s; 2000s",
  );
  assert.equal(spread.props.style["--color-lt15"], "var(--chart-ramp-5)", "the fastest the darkest ink");
});

test("with a hold set the reply card draws it: the chart's one reference is the hold and the spread is said against it; with none there is neither", () => {
  const held = Array.from({ length: 8 }, () => ({ day: "2026-09-01", s: 63, hold: 60 }));
  const reply = card(page({ report: { replies: held, reply_seconds: held.map((r) => r.s) } }), "chart-reply");
  assert.equal(textOf(cls(reply, "ck-dotplot-ref")), "your 1-minute hold ends");
  const spread = byTestId(reply, "reply-spread");
  assert.equal(textOf(cls(spread, "ck-segbar-title")), "Every reply, against your hold");
  assert.deepEqual(
    all(
      find(spread, (n) => classes(n).includes("ck-segbar-bar")),
      (n) => n.type === "i",
    ).map((i) => i.props.style["--part-color"]),
    ["var(--color-atEnd)"],
    "every reply went out as the hold ended: one part",
  );
  const plain = card(page(), "chart-reply");
  assert.equal(cls(plain, "ck-ref"), null, "no hold: no yardstick the owner never set");
  assert.equal(cls(plain, "ck-dotplot-ref"), null, "and no caption for one");
  assert.equal(textOf(cls(byTestId(plain, "reply-spread"), "ck-segbar-title")), "Every reply, by how long it took");
});

test("the page says the hold and the closed hours: the hero, the speed chart's yardstick, the spread's five rows, and what came while closed", () => {
  const tree = page({
    report: { replies: HELD, reply_seconds: HELD.map((r) => r.s), arrivals: ARRIVALS },
    ...HOURS,
  });
  assert.equal(
    textOf(cls(card(tree, "reports-hero"), "rpt-hero-line")),
    "13 of 17 customer messages, without you. 8 of 12 went out as your 1-minute hold ended.",
    "the hold, never the speed the setting made",
  );
  const reply = card(tree, "chart-reply");
  assert.equal(
    textOf(cls(reply, "ck-dotplot-ref")),
    "your 1-minute hold ends",
    "the reply plot's one reference is where the owner's hold ends",
  );
  const spread = byTestId(reply, "reply-spread");
  assert.equal(textOf(cls(spread, "ck-segbar-title")), "Every reply, against your hold");
  assert.deepEqual(
    all(spread, (n) => classes(n).includes("ck-legend-item")).map(textOf),
    ["with no hold1", "as the hold ended8", "up to 1m later1", "1 – 5m later1", "over 5m later1"],
    "five rows, each with its count",
  );
  assert.equal(takeaway(tree, "chart-reply"), "3 replies took longer than the hold, at most 9m more.");
  assert.equal(
    textOf(factOf(tree, "busiest")),
    "Tuesday was your busiest daypeak 10am to 12pm, 7 while you were closed",
    "counted by the workspace's own hours and closures",
  );
  assert.equal(factOf(tree, "hours"), null, "hours said: no door to set them");
});

test("a workspace with no hours is asked for them through the page, with the door to Settings; an unread profile is asked nothing", () => {
  // Nothing unanswered and no handover, so the third fact has room: Worth knowing keeps three.
  const calm = {
    series: reportDto().series.map((d) => ({ ...d, unanswered: 0, escalations: 0 })),
    reasons: {},
    arrivals: ARRIVALS,
  };
  const tree = page({ report: calm, campaigns: null, profile: {} });
  const hours = factOf(tree, "hours");
  assert.equal(textOf(hours), "Set your business hours to see what came in while you were closedOpen Settings");
  assert.ok(
    !textOf(factOf(tree, "busiest")).includes("closed"),
    "and no count of what a guess would have called closed",
  );
  press(find(hours, (n) => n.type === "a"));
  assert.deepEqual(went, ["admin/hours"], "the door opens Settings' Hours & booking, where the hours are kept");
  const unread = page({ report: calm, campaigns: null, profile: null });
  assert.equal(factOf(unread, "hours"), null, "a profile that couldn't be read says nothing of the hours");
});

test("the channels' colours are kept by channel, in contracts' order, and the same ones wherever a channel is drawn", () => {
  assert.deepEqual(
    Object.keys(RPT_CHANNEL_COLORS),
    REPORT_CHANNELS.map((c) => c.key),
    "in the order a chart lists them",
  );
  assert.deepEqual(RPT_CHANNEL_COLORS, {
    whatsapp: "var(--chart-cat-1)",
    voice: "var(--chart-cat-2)",
    email: "var(--chart-cat-3)",
    sms: "var(--chart-cat-4)",
  });
});

test("when they reach you, as a table: the seven days, then the twenty-four hours", () =>
  inLens(2, () => {
    let tree = pageOnce();
    find(card(tree, "chart-rhythm"), (n) => n.type === Segmented).props.onValueChange("table");
    tree = redraw();
    const rows = all(card(tree, "chart-rhythm"), (n) => n.type === "tr")
      .slice(1)
      .map((r) => all(r, (c) => c.type === "td").map(textOf));
    assert.equal(rows.length, 31);
    assert.deepEqual(rows[1], ["Tuesday", "7", "1"]);
    assert.deepEqual(rows[7 + 10], ["10am to 11am", "7", "—"], "an hour has no period before to set beside it");
  }));
