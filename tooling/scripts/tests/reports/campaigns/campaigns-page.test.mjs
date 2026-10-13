/**
 * The Campaigns lens drawn (surfaces/reports/lenses/campaigns.tsx and campaigns-mix.tsx), EXECUTED on the stub React over the one
 * read it draws from (`reports_campaigns`: the sends' report, the ledger beside it and the reach-outs, each failing alone, folded on
 * the page by the real `toCampaignLensVM`); the frame (`reports`) holds the report alone and says nothing of campaigns. The part of
 * the page this file holds is the lens's frame, its five figures and the window's cards: the funnel, the days, what was held back,
 * what stopped, why sends failed, the channels, each message's rate and the sources. Every sentence, row and word a card says is the
 * fold's; a quiet period is the lens's own card; a read that failed is its own state, told apart from a quiet period and from the
 * days card; and a share of too few is greyed and says so. The rest of the page is the second half of this file: the time between
 * steps (how soon a message was answered, how long a run waited for your OK), what is stuck now (five figures, each in its tone and
 * with its door), and the reach-outs in businesses over businesses, every one of them absent, or a failed read of its own, where
 * its read is missing, failed or empty; and the demo, which draws the same page from the sample and no reach-outs.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { isThinShare, lensEmpty } from "@chanlytics/contracts";
import { toCampaignLensVM } from "@chanlytics/contracts/report-lens";
import { installLegacyReact, fresh, again, all, byTestId, textOf, classes, find, press } from "../../_legacy-react.mjs";
import { quiet, surface } from "../_report-world.mjs";
import {
  CAMPAIGNS,
  CAMPAIGNS_QUIET,
  NOW,
  NUMBER,
  QUIET,
  SERIES,
  STUCK_NOW,
  dtoWith,
  held,
} from "./_campaign-world.mjs";
import { NOTHING_WRITTEN, beforeBusinesses, reachCounts, reachOuts, reachStep } from "./_reach-out-world.mjs";

const navigated = [];
installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
Object.assign(globalThis, { CHANLY: { nav: (to) => navigated.push(to), R: { admin: (pane) => `admin/${pane}` } } });
globalThis.window.fetch = async () =>
  new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "not read here" } }), { status: 500 });
globalThis.__WORKSPACES = [
  {
    id: "w1",
    slug: "harbor",
    name: "Harbor Studio",
    status: "active",
    timezone: "America/New_York",
    sells_by: "proposal",
    role: "owner",
  },
];
globalThis.__ACTIVE_WORKSPACE = "w1";
const S = "../../../../../apps/dashboard/src";
const { ReportsPage } = await import(`${S}/surfaces/reports/reports-page.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { keepReportPeriod } = await import(`${S}/surfaces/reports/surface.ts`);
const { setStatus } = await import(`${S}/legacy-bridge/surface-status.ts`);
const { standingSaid, forgetStanding } = await import(`${S}/surfaces/kit/head/standing.ts`);
const { RPT_CHANNEL_COLORS } = await import(`${S}/surfaces/reports/series.ts`);
const { campaignsSample } = await import(`${S}/surfaces/reports/campaigns-sample.ts`);
const { BarChart, BarList } = await import(`${S}/surfaces/kit/charts/bar.tsx`);
const { CampaignsLens } = await import(`${S}/surfaces/reports/lenses/campaigns.tsx`);
const { ChartCard } = await import(`${S}/surfaces/kit/charts/card.tsx`);
const { Figure } = await import(`${S}/surfaces/kit/figure/figure.tsx`);
after(() => forgetStanding());

/** The Campaigns lens over what both reads hold, for the period the strip shows (the week: the frame's, whatever days the world's DTOs are of). */
const draw = ({ R = surface(), ...opts } = {}) => {
  keepReportPeriod("7d");
  setSurfaceValue("reports", R);
  setSurfaceValue("reports_campaigns", "own" in opts ? opts.own : held(dtoWith(), "7d"));
  fresh();
  navigated.length = 0;
  return ReportsPage({ pathname: "/w/harbor/reports/campaigns" });
};
/** The lens's own read as the surface holds it, with the sends and the ledger replaced (`null`: that read failed; a ledger of `dtoWith(null)`: a database without it). */
const own = (over = {}) => ({ campaigns: CAMPAIGNS, ledger: dtoWith(), key: "7d", ...over });

/** The window's cards in the order the page draws them, and the strip above them. */
const ORDER = [
  "campaigns-strip",
  "chart-funnel",
  "chart-campaigns",
  "chart-campaigns-held",
  "chart-campaigns-stopped",
  "chart-campaigns-failed-why",
  "chart-campaign-channels",
  "chart-campaigns-by-message",
  "chart-sources",
];
const FAILED_IDS = ["campaigns-failed-campaigns", "campaigns-failed-ledger"];
/** The lens's other three parts: the waits, what is stuck now (its five figures by metric), and the reach-outs (the section, its strip and cards). */
const TIME_IDS = ["campaigns-time", "chart-campaigns-first-reply", "chart-campaigns-approval"];
const STUCK_IDS = ["campaigns-stuck", "campaigns-stuck-strip"];
const STUCK_METRICS = ["runs_waiting", "runs_failed", "campaign_replies_waiting", "templates_paused", "number_health"];
const RO_IDS = [
  "rpt-reach-outs",
  "ro-strip",
  "ro-emails",
  "ro-funnel",
  "ro-angles",
  "ro-domains",
  "ro-written",
  "ro-sources",
];
const RO_CARDS = RO_IDS.slice(2);
/** The cards of the sends' report alone and the ledger's alone. */
const SENDS_IDS = ["chart-funnel", "chart-campaigns", "chart-campaign-channels", "chart-sources"];
const LEDGER_IDS = [
  "chart-campaigns-held",
  "chart-campaigns-stopped",
  "chart-campaigns-failed-why",
  "chart-campaigns-by-message",
];
const present = (tree, ids) => ids.map((id) => !!byTestId(tree, id));
const yes = (ids) => ids.map(() => true);
const no = (ids) => ids.map(() => false);
const metricsOf = (strip) =>
  all(strip, (n) => n.type === "div" && n.props["data-figure"]).map((n) => n.props["data-figure"]);
const rowsOf = (tree, id) => find(byTestId(tree, id), (n) => n.type === BarList).props.rows;
const lineOf = (tree, id) => textOf(find(byTestId(tree, id), (n) => classes(n).includes("ck-card-takeaway")));
const titleOf = (tree, id) => textOf(find(byTestId(tree, id), (n) => n.type === "h3"));
const cardOf = (tree, id) => find(tree, (n) => n.type === ChartCard && n.props.testid === id);
/** What is on its way, by the one rule every page uses: the test ids of the nodes that wear data-loading (a tree is far too large to print). */
const dimmed = (tree) => all(tree, (n) => n.props?.["data-loading"] === "").map((n) => n.props["data-testid"]);
const PAGE = ["reports-real"];
const sectionsOf = (tree) =>
  all(tree, (n) => n.type === "section" && n.props.className === "rpt-section").map((n) => n.props["aria-label"]);
const figureProps = (tree, metric) => find(tree, (n) => n.type === Figure && n.props.id === metric)?.props;
/** What the fold says of a read, on the clock the world is judged at (nothing in this file's parts reads the clock). */
const foldOf = (input = {}) =>
  toCampaignLensVM({ campaigns: CAMPAIGNS, ledger: dtoWith(), reachOuts: undefined, ...input }, NOW);

/** The cards a grid draws directly, a card that is absent (false) left out. */
const cardsOfGrid = (grid) => [grid.props.children].flat(Infinity).filter((n) => n && typeof n === "object");
/** How many of the grid's twelve columns a card takes: its `rpt-span-N` class. */
const spanOf = (card) =>
  Number(
    classes(card)
      .find((c) => /^rpt-span-\d+$/.test(c))
      ?.slice("rpt-span-".length),
  );
/** Every grid of cards the page draws, in order, as the columns each of its cards takes. */
const rowsOfSpans = (tree) =>
  all(tree, (n) => n.type === "div" && classes(n).includes("rpt-grid")).map((grid) => cardsOfGrid(grid).map(spanOf));

test("the window's cards, in order, for a workspace that has everything", () => {
  const tree = draw();
  const seen = all(tree, (n) => ORDER.includes(n.props?.["data-testid"])).map((n) => n.props["data-testid"]);
  assert.deepEqual(
    seen,
    ORDER,
    "the strip, the funnel beside the days, what was held, stopped and failed, the channels beside each message, the sources",
  );
  const strip = byTestId(tree, "campaigns-strip");
  assert.equal(strip.type, "dl", "terms and their values");
  assert.deepEqual(metricsOf(strip), [
    "people_sent_to",
    "delivered_share",
    "people_wrote_back",
    "said_yes",
    "asked_to_stop",
  ]);
  assert.equal(byTestId(tree, "reports-real").props["data-lens"], "campaigns");
  assert.equal(byTestId(tree, "reports-empty"), null, "the lens never says that nothing came in");
  assert.equal(byTestId(tree, "chart-campaigns-quiet"), null, "a period with sends is not a quiet one");
  assert.deepEqual(present(tree, FAILED_IDS), no(FAILED_IDS), "every read landed");
  assert.deepEqual(dimmed(tree), [], "nothing is on its way");
  // A section that names what the tab says draws no heading, and keeps its label for a screen reader; the waits and what is stuck
  // are the lens's too (this world has no reach-outs: the second half of this file draws them).
  assert.deepEqual(sectionsOf(tree), ["Campaigns", "Time between steps", "Stuck now"]);
  assert.equal(all(tree, (n) => n.type === "h2").length, 0);
  // Each row of cards fills the grid's twelve columns; the waits are halves.
  assert.deepEqual(rowsOfSpans(tree), [[5, 7], [4, 4, 4], [6, 6], [12], [6, 6]]);
});

test("every row, line and title a card draws is the fold's, and each offers its table", () => {
  const v = foldOf();
  const tree = draw();
  const cards = [
    ["chart-funnel", v.funnel, "Messages, from sent to answered", ["What happened", "Messages"]],
    ["chart-campaigns-held", v.held, "Held back", ["Why", "People"]],
    ["chart-campaigns-stopped", v.stopped, "Runs that stopped", ["How it stopped", "Runs"]],
    ["chart-campaigns-failed-why", v.failedWhy, "Sends that failed", ["Why it failed", "Messages"]],
  ];
  for (const [id, part, title, columns] of cards) {
    const wanted = part.rows.map((r) => [r.label, r.value]);
    assert.ok(wanted.length > 0, `${id}: the world has rows`);
    assert.deepEqual(
      rowsOf(tree, id).map((r) => [r.label, r.value]),
      wanted,
      `${id}: a bar a row`,
    );
    assert.equal(lineOf(tree, id), part.line, `${id}: its line`);
    assert.equal(titleOf(tree, id), title);
    assert.deepEqual(cardOf(tree, id).props.table, { columns, rows: wanted }, `${id}: the table twin`);
  }
  for (const f of v.strip) {
    assert.equal(figureProps(tree, f.metric).value, f.value, `${f.metric}: the fold's number`);
    assert.equal(figureProps(tree, f.metric).meta, f.meta, `${f.metric}: and its line`);
    assert.equal(figureProps(tree, f.metric).change, f.compare, `${f.metric}: and the period before`);
  }
  // The days card says the runs behind the sends; the channels card the report's own line and rows, in the colour each channel wears.
  assert.equal(lineOf(tree, "chart-campaigns"), v.runsLine);
  assert.equal(v.runsLine, "From 12 campaign runs and 2 one-off broadcasts.");
  assert.equal(lineOf(tree, "chart-campaign-channels"), v.report.lines.channels);
  assert.deepEqual(
    Object.fromEntries(rowsOf(tree, "chart-campaign-channels").map((r) => [r.id, r.color])),
    { whatsapp: RPT_CHANNEL_COLORS.whatsapp, sms: RPT_CHANNEL_COLORS.sms, email: RPT_CHANNEL_COLORS.email },
    "a channel is one colour wherever it is drawn",
  );
  // The sources are the report's own, with the table twin the card has always offered.
  assert.equal(titleOf(tree, "chart-sources"), "By campaign and broadcast");
  assert.deepEqual(
    cardOf(tree, "chart-sources").props.table.rows.map((r) => r.slice(0, 2)),
    v.report.sources.map((x) => [x.name, x.kindLabel]),
  );
  // One count of messages, one name in every table twin (and so in every CSV a reader saves): "Answered". "Wrote back" is the
  // strip's, a count of people; "Replied" is nobody's word any more.
  const twin = (id) => cardOf(tree, id).props.table.columns;
  assert.deepEqual(
    [twin("chart-campaigns").at(3), twin("chart-campaign-channels").at(-1), twin("chart-sources").at(-1)],
    ["Answered", "Answered", "Answered"],
  );
  for (const id of ["chart-funnel", "chart-campaigns", "chart-campaign-channels", "chart-sources"])
    assert.equal(
      twin(id).some((c) => c === "Wrote back" || c === "Replied"),
      false,
      `${id}: no twin names messages as the strip names people`,
    );
});

test("the funnel says its own sentence, and the head is the fold's", () => {
  const v = foldOf();
  const tree = draw();
  assert.equal(lineOf(tree, "chart-funnel"), v.funnel.line);
  // REGRESSION: the funnel once said the yes and stop sentence of the strip (the sends' report held it until 11 Oct 2026).
  assert.doesNotMatch(lineOf(tree, "chart-funnel"), /said yes|asked to stop/);
  assert.equal(
    lineOf(tree, "chart-funnel"),
    "92% were delivered, 26% of WhatsApp's were read and 21% were answered within 3 days, of 240 messages.",
  );
  assert.equal(standingSaid().title, "Reports");
  assert.equal(standingSaid().sentence, v.head, "the head is the fold's");
  assert.equal(
    standingSaid().sentence,
    "240 messages to 180 people over 14 runs; 48 of 180 wrote back (41 the 30 days before).",
  );
});

test("the strip's Wrote back is people and the funnel's is messages: the card says so, so the two never read as one number", () => {
  const tree = draw();
  const wrote = figureProps(tree, "people_wrote_back");
  assert.equal(wrote.value, "27%");
  assert.equal(
    wrote.meta,
    "48 of 180 people within 3 days, 9 sent to in the last 3 days may still answer",
    "48 of 180 people, and the 9 whose time is not over",
  );
  assert.deepEqual([wrote.n, wrote.minN], [180, 5], "a share of the people sent to");
  const funnel = rowsOf(tree, "chart-funnel");
  assert.deepEqual(
    funnel.map((r) => [r.label, r.value]),
    [
      ["Sent", 240],
      ["Delivered", 220],
      ["Read", 31],
      ["Answered", 50],
    ],
    "50 messages were answered",
  );
  assert.equal(
    funnel.some((r) => r.label === "Wrote back"),
    false,
    "REGRESSION: a bar of messages bore the name of the strip's figure of people, so the two read as one number",
  );
  assert.match(titleOf(tree, "chart-funnel"), /\bMessages\b/, "the card is titled in messages");
  assert.deepEqual(cardOf(tree, "chart-funnel").props.table.columns, ["What happened", "Messages"]);
  assert.doesNotMatch(titleOf(tree, "chart-funnel"), /people/i);
});

test("the by-message card is a rate with its n: a row under five mature sends carries no percentage and is greyed, as a strip's figure is", () => {
  const v = foldOf();
  const tree = draw();
  const rows = rowsOf(tree, "chart-campaigns-by-message");
  assert.deepEqual(
    rows.map((r) => [r.id, r.label, r.value, r.display]),
    v.byMessage.rows.map((r) => [r.id, r.label, r.value, r.display]),
    "a bar a message, the fold's words beside it",
  );
  assert.deepEqual(
    rows.map((r) => r.display),
    ["30 of 110 were answered  27%", "18 of 120 were answered  15%"],
  );
  assert.deepEqual(
    rows.map((r) => r.color),
    [undefined, undefined],
    "of 110 and 120 it is read: no colour of its own",
  );
  assert.equal(lineOf(tree, "chart-campaigns-by-message"), v.byMessage.line);
  assert.equal(titleOf(tree, "chart-campaigns-by-message"), "Replies, by message");
  assert.deepEqual(
    cardOf(tree, "chart-campaigns-by-message").props.table,
    { columns: ["Message", "Answered"], rows: v.byMessage.rows.map((r) => [r.label, r.display]) },
    "the table twin says the same words: the sends are answered, the strip's people are the ones who wrote back",
  );
  // Every bar is on the one scale of all of them, so a share is the length of its bar.
  assert.equal(find(byTestId(tree, "chart-campaigns-by-message"), (n) => n.type === BarList).props.max, 100);
  // A message with fewer than five sends that have had their time: the count, never a percentage, and the bar is grey.
  const few = draw({
    own: held(
      dtoWith({
        by_message: [
          { name: "winback_offer", language: "en_US", sent: 120, mature: 3, replied: 1 },
          { name: "spring_note", language: "en_US", sent: 120, mature: 120, replied: 18 },
          { name: "quick_note", language: "en_US", sent: 9, mature: 0, replied: 0 },
        ],
      }),
      "7d",
    ),
  });
  const thin = rowsOf(few, "chart-campaigns-by-message");
  assert.deepEqual(
    thin.map((r) => r.display),
    ["1 of 3 was answered", "18 of 120 were answered  15%", "9 sent in the last 3 days, too new to say"],
  );
  assert.ok(!/%/.test(thin[0].display), "REGRESSION: a share of three sends said as a percentage");
  assert.equal(thin[0].color, "var(--chart-prior)", "greyed in the chart grey that recedes");
  assert.equal(thin[1].color, undefined, "a share of 120 is read");
  assert.equal(thin[2].color, undefined, "none to take a share of: an empty bar, nothing to grey");
  assert.equal(thin[2].value, 0);
});

test("the by-message bar greys at four mature sends and not at five, as the kit's Figure does, and the words say the count up to four and the share from five", () => {
  const at = (mature) => {
    const tree = draw({
      own: held(
        dtoWith({
          by_message: [{ name: "winback_offer", language: "en_US", sent: 20, mature, replied: Math.min(2, mature) }],
        }),
        "7d",
      ),
    });
    return rowsOf(tree, "chart-campaigns-by-message")[0];
  };
  for (const [mature, grey, words] of [
    [0, false, "20 sent in the last 3 days, too new to say"],
    [1, true, "1 of 1 was answered"],
    [4, true, "2 of 4 were answered"],
    [5, false, "2 of 5 were answered  40%"],
    [6, false, "2 of 6 were answered  33%"],
  ]) {
    const row = at(mature);
    assert.equal(row.display, words, `mature ${mature}: the fold's words`);
    assert.equal(row.color === "var(--chart-prior)", grey, `mature ${mature}: ${grey ? "greyed" : "read"}`);
  }
});

test("a quiet period is the lens's own card, in place of the strip and every card of the window, with the registry's words and its door to Sent", () => {
  const R = surface({ report: quiet() });
  const tree = draw({ R, own: held(dtoWith(QUIET), "7d", { campaigns: CAMPAIGNS_QUIET }) });
  assert.equal(foldOf({ campaigns: CAMPAIGNS_QUIET, ledger: dtoWith(QUIET) }).quiet, true, "the world is a quiet one");
  const card = byTestId(tree, "chart-campaigns-quiet");
  assert.ok(card, "the lens's own card");
  const words = lensEmpty("campaigns", { since: R.vm.since, until: R.vm.until });
  assert.ok(textOf(card).includes(words.title) && textOf(card).includes(words.body), textOf(card));
  assert.ok(words.door, "the registry gives it a door");
  const door = find(card, (n) => n.type === "button");
  assert.equal(textOf(door).trim(), words.door.label);
  press(door);
  assert.deepEqual(navigated, [words.door.to], "to Sent");
  assert.equal(words.door.to, "broadcasts");
  assert.deepEqual(present(tree, ORDER), no(ORDER), "no strip and none of the window's cards");
  assert.equal(
    byTestId(tree, "reports-empty"),
    null,
    "REGRESSION: the Overview's empty stood where the lens's own belongs",
  );
  assert.doesNotMatch(textOf(tree), /NaN|Infinity/);
  assert.deepEqual(rowsOfSpans(tree), [], "nothing else is in a grid");
  // The head still says what the period was.
  assert.equal(standingSaid().sentence, "Nothing went out in this period.");
});

test("a ledger the database lacks draws the strip at three figures, the sends' cards and no failure", () => {
  const tree = draw({ own: own({ ledger: dtoWith(null) }) });
  assert.deepEqual(metricsOf(byTestId(tree, "campaigns-strip")), ["delivered_share", "said_yes", "asked_to_stop"]);
  assert.ok(classes(byTestId(tree, "campaigns-strip")).includes("trio"), "three across");
  assert.deepEqual(present(tree, SENDS_IDS), yes(SENDS_IDS), "the funnel, the days, the channels and the sources");
  assert.deepEqual(present(tree, LEDGER_IDS), no(LEDGER_IDS), "no held, stopped, failed-why or by-message card");
  assert.deepEqual(present(tree, FAILED_IDS), no(FAILED_IDS), "a function a database lacks is not a failed read");
  assert.equal(
    standingSaid().sentence,
    "240 messages over 14 runs; people wrote back to 50 of them.",
    "the head without the people",
  );
  assert.deepEqual(rowsOfSpans(tree), [[5, 7], [12], [12]], "the channels take the row they have to themselves");
  assert.deepEqual(dimmed(tree), []);
});

test("a ledger that could not be read draws one failed read with its Retry, in the fold's words, and the sends' cards", () => {
  const tree = draw({ own: own({ ledger: null }) });
  const failed = all(tree, (n) => n.props?.["data-testid"] === "campaigns-failed-ledger");
  assert.equal(failed.length, 1, "one, not one a card");
  assert.ok(textOf(failed[0]).includes("Couldn't read who it reached and what is stuck"), textOf(failed[0]));
  assert.ok(textOf(failed[0]).includes("The rest of this page is current."), "the fold's body");
  const read = find(tree, (n) => n.props?.surface === "reports_campaigns");
  assert.ok(read, "its Retry reads the lens's own surface again");
  assert.equal(read.props.kind, "card");
  assert.equal(byTestId(tree, "campaigns-failed-campaigns"), null, "the sends did not fail");
  assert.deepEqual(present(tree, SENDS_IDS), yes(SENDS_IDS), "and stand");
  assert.deepEqual(present(tree, LEDGER_IDS), no(LEDGER_IDS), "none of what the ledger feeds");
  assert.deepEqual(metricsOf(byTestId(tree, "campaigns-strip")), ["delivered_share", "said_yes", "asked_to_stop"]);
  assert.deepEqual(rowsOfSpans(tree), [[12], [5, 7], [12], [12]], "the failed read, then the sends' rows");
  assert.deepEqual(dimmed(tree), [], "nothing is dimmed: a dimmed card takes no press, and the Retry is on it");
  assert.equal(foldOf({ ledger: null }).failed.at(0).body, "The rest of this page is current.");
});

test("the sends failing draws its failed read and the ledger's parts: the people, what was held, stopped and failed, and each message", () => {
  const tree = draw({ own: own({ campaigns: null }) });
  const failed = all(tree, (n) => n.props?.["data-testid"] === "campaigns-failed-campaigns");
  assert.equal(failed.length, 1);
  assert.ok(textOf(failed[0]).includes("Couldn't read the campaign numbers"), textOf(failed[0]));
  assert.ok(textOf(failed[0]).includes("The rest of this page is current."), "the fold's body");
  assert.ok(
    find(tree, (n) => n.props?.surface === "reports_campaigns"),
    "its Retry reads the lens's own surface again",
  );
  assert.equal(byTestId(tree, "campaigns-failed-ledger"), null);
  assert.deepEqual(present(tree, SENDS_IDS), no(SENDS_IDS), "nothing the sends feed");
  assert.deepEqual(present(tree, LEDGER_IDS), yes(LEDGER_IDS), "the ledger's cards stand");
  assert.deepEqual(metricsOf(byTestId(tree, "campaigns-strip")), ["people_sent_to", "people_wrote_back"]);
  assert.ok(classes(byTestId(tree, "campaigns-strip")).includes("duo"), "two across");
  assert.deepEqual(
    rowsOfSpans(tree),
    [[12], [4, 4, 4], [12], [6, 6]],
    "each message's rate takes the row it has to itself, and the waits are the ledger's",
  );
  assert.equal(standingSaid().sentence, undefined, "no head where the sends could not be read: the lens's name alone");
});

test("both reads failing say that nothing else could be read, and the old words about the receptionist's numbers are nowhere", () => {
  const tree = draw({ own: own({ campaigns: null, ledger: null }) });
  for (const id of FAILED_IDS) assert.ok(byTestId(tree, id), id);
  assert.ok(
    textOf(byTestId(tree, "campaigns-failed-campaigns")).includes("Nothing else on this page could be read either."),
  );
  assert.deepEqual(
    present(tree, [...SENDS_IDS, ...LEDGER_IDS, "campaigns-strip"]),
    no([...SENDS_IDS, ...LEDGER_IDS, "campaigns-strip"]),
  );
  assert.deepEqual(rowsOfSpans(tree), [[12, 12]]);
  for (const t of [
    tree,
    draw({ own: own({ campaigns: null }) }),
    draw({ own: own({ ledger: null }) }),
    draw({ own: undefined }),
  ])
    assert.doesNotMatch(
      textOf(t),
      /receptionist's own numbers/,
      "REGRESSION: a failed read told the Overview's numbers were current",
    );
});

test("the quiet card, the failed card and the days card have three different test ids, and each stands only in its own state", () => {
  const quietTree = draw({
    R: surface({ report: quiet() }),
    own: held(dtoWith(QUIET), "7d", { campaigns: CAMPAIGNS_QUIET }),
  });
  const failedTree = draw({ own: own({ campaigns: null }) });
  const full = draw();
  const ids = ["chart-campaigns-quiet", "campaigns-failed-campaigns", "chart-campaigns"];
  assert.deepEqual(new Set(ids).size, 3);
  assert.deepEqual(present(quietTree, ids), [true, false, false], "quiet: the quiet card alone");
  assert.deepEqual(
    present(failedTree, ids),
    [false, true, false],
    "failed: the failed card, and no days card of nothing",
  );
  assert.deepEqual(present(full, ids), [false, false, true], "a workspace that sent: the days card");
});

test("its own read still out: nothing of it is drawn and the page dims; one of another period is not drawn under this one's name; it lands and nothing is on its way", () => {
  const out = draw({ own: undefined });
  assert.deepEqual(
    present(out, [...ORDER, ...FAILED_IDS, "chart-campaigns-quiet"]),
    no([...ORDER, ...FAILED_IDS, "chart-campaigns-quiet"]),
  );
  assert.deepEqual(dimmed(out), PAGE, "the page says a period is on its way, by the one rule");
  assert.equal(all(out, (n) => n.props?.["data-dims"] === true)[0].props["aria-busy"], "true");
  assert.equal(standingSaid().sentence, undefined, "the head: the lens's name alone");
  // The read held is of another period than the one shown (and holds a reach-out, so a section fed the unfiltered fold would show it).
  const left = draw({ own: held(dtoWith(), "30d", { reachOuts: reachOuts() }) });
  assert.deepEqual(present(left, ORDER), no(ORDER), "a period left is not drawn");
  assert.equal(byTestId(left, "campaigns-failed-ledger"), null, "and a read on its way is not a failed one");
  assert.deepEqual(dimmed(left), PAGE);
  // Nothing of the lens's own is drawn from a read that is out or of another period, in any of its four sections: the lens
  // draws nothing at all, not even the Campaigns section's label, and the waits, what is stuck and the reach-outs go with it.
  const others = [...TIME_IDS, ...STUCK_IDS, ...RO_IDS, "ro-failed", "ro-report-empty", "campaigns-failed-stuck"];
  for (const [said, tree] of [
    ["still out", out],
    ["of another period", left],
  ]) {
    assert.deepEqual(present(tree, others), no(others), `${said}: no wait, no stuck figure, no reach-out`);
    assert.deepEqual(sectionsOf(tree), [], `${said}: no section of the lens`);
  }
  assert.equal(standingSaid().sentence, undefined, "nor does the head say its comparison");
  // And it lands.
  const landed = draw();
  assert.deepEqual(dimmed(landed), []);
  assert.deepEqual(present(landed, ORDER), yes(ORDER));
  assert.equal(standingSaid().sentence, foldOf().head);
  // Another lens is of the report the page holds: this read, still out, dims nothing there.
  keepReportPeriod("7d");
  setSurfaceValue("reports", surface());
  setSurfaceValue("reports_campaigns", undefined);
  fresh();
  assert.deepEqual(dimmed(ReportsPage({ pathname: "/w/harbor/reports" })), [], "the Overview");
});

test("a read that could not be made says so with its Retry, and never holds the period it left under the new one's name", () => {
  setStatus("reports_campaigns", "seeded");
  try {
    const none = draw({ own: undefined });
    for (const id of FAILED_IDS) assert.equal(all(none, (n) => n.props?.["data-testid"] === id).length, 1, id);
    assert.ok(
      textOf(byTestId(none, "campaigns-failed-campaigns")).includes("Nothing else on this page could be read either."),
    );
    assert.deepEqual(present(none, ORDER), no(ORDER));
    // The reach-outs' read failed with the rest, and says so once, in their section; the ledger's card names what is stuck, so
    // what is stuck has none of its own, and there are no waits to draw.
    assert.equal(all(none, (n) => n.props?.["data-testid"] === "ro-failed").length, 1, "the reach-outs: one");
    assert.ok(textOf(byTestId(none, "ro-failed")).includes("Nothing else on this page could be read either."));
    assert.equal(byTestId(none, "campaigns-failed-stuck"), null);
    assert.deepEqual(present(none, [...TIME_IDS, "campaigns-stuck"]), no([...TIME_IDS, "campaigns-stuck"]));
    assert.deepEqual(sectionsOf(none), ["Campaigns", "Reach-outs"]);
    assert.deepEqual(dimmed(none), [], "nothing is dimmed: a dimmed card takes no press, and the Retry is on it");
    assert.equal(standingSaid().sentence, undefined, "the head says nothing of a read that failed");
  } finally {
    setStatus("reports_campaigns", "live");
  }
  setStatus("reports_campaigns", "degraded");
  try {
    const stuck = draw({ own: held(dtoWith(), "30d") });
    assert.equal(all(stuck, (n) => n.props?.["data-testid"] === "campaigns-failed-campaigns").length, 1);
    assert.deepEqual(present(stuck, ORDER), no(ORDER), "the period left is not drawn");
    assert.deepEqual(dimmed(stuck), []);
    assert.equal(standingSaid().sentence, undefined);
    // What is held of the period the strip shows says nothing of the failure: the figures are current.
    const current = draw();
    assert.equal(byTestId(current, "campaigns-failed-campaigns"), null);
    assert.deepEqual(present(current, ORDER), yes(ORDER));
    assert.equal(standingSaid().sentence, foldOf().head);
  } finally {
    setStatus("reports_campaigns", "live");
  }
});

test("every row of cards fills the grid's twelve columns, whichever of the lens's reads were made, and the strip says how many are across", () => {
  const oneChannel = {
    ...CAMPAIGNS,
    by_channel: [{ channel: "whatsapp", sent: 240, delivered: 220, read: 31, replied: 50 }],
  };
  const states = [
    ["everything", draw(), [[5, 7], [4, 4, 4], [6, 6], [12], [6, 6]], undefined],
    ["one channel", draw({ own: own({ campaigns: oneChannel }) }), [[5, 7], [4, 4, 4], [12], [12], [6, 6]], undefined],
    ["no ledger", draw({ own: own({ ledger: dtoWith(null) }) }), [[5, 7], [12], [12]], "trio"],
    ["ledger failed", draw({ own: own({ ledger: null }) }), [[12], [5, 7], [12], [12]], "trio"],
    ["sends failed", draw({ own: own({ campaigns: null }) }), [[12], [4, 4, 4], [12], [6, 6]], "duo"],
  ];
  for (const [state, tree, wanted, across] of states) {
    assert.deepEqual(rowsOfSpans(tree), wanted, `${state}: the rows, by the columns each card takes`);
    for (const spans of rowsOfSpans(tree)) {
      assert.ok(spans.every(Number.isInteger), `${state}: every card names its columns`);
      assert.equal(
        spans.reduce((a, b) => a + b, 0),
        12,
        `${state}: a row of ${spans.join(" + ")} leaves a hole`,
      );
    }
    const strip = byTestId(tree, "campaigns-strip");
    assert.ok(strip, `${state}: the strip`);
    for (const c of ["duo", "trio", "quad"]) assert.equal(classes(strip).includes(c), c === across, `${state}: ${c}`);
  }
});

test("the days card draws the sends, and says why where nobody was sent a message but somebody said yes or stop", () => {
  const justAnswers = {
    ...CAMPAIGNS_QUIET,
    series: CAMPAIGNS_QUIET.series.map((d, i) => (i === 40 ? { ...d, opt_ins: 2 } : d)),
  };
  const tree = draw({ own: own({ campaigns: justAnswers, ledger: dtoWith(QUIET) }) });
  const v = foldOf({ campaigns: justAnswers, ledger: dtoWith(QUIET) });
  assert.equal(v.quiet, false, "a yes is not nothing");
  assert.equal(byTestId(tree, "chart-campaigns-quiet"), null);
  assert.ok(
    textOf(byTestId(tree, "chart-campaigns")).includes("No message went out in this period."),
    "the fold's words",
  );
  assert.ok(textOf(byTestId(tree, "chart-funnel")).includes(v.funnel.empty));
  assert.equal(
    all(byTestId(tree, "chart-campaigns"), (n) => classes(n).includes("ck-plot")).length,
    0,
    "no chart of nothing",
  );
  assert.doesNotMatch(textOf(tree), /NaN|Infinity/);
  assert.deepEqual(figureProps(tree, "said_yes").value, "2");
  // No run sent, so there is no table of sources to draw: a table of none would say again what the funnel and the days say.
  assert.equal(
    byTestId(tree, "chart-sources"),
    null,
    "REGRESSION: a table of no source under a lens that sent nothing",
  );
});

test("a day's column says its sends and its answered messages in the view model's words, as messages", () => {
  const tree = draw();
  const chart = find(byTestId(tree, "chart-campaigns"), (n) => n.type === BarChart);
  const answered = chart.props.data.find((d) => d.replied > 0);
  const none = chart.props.data.find((d) => d.replied === 0);
  assert.ok(answered && none, "the world has a day of each");
  assert.equal(chart.props.tipNote(answered), answered.answeredWords);
  assert.equal(
    chart.props.tipNote(answered),
    `${answered.replied} answered`,
    "messages, not people: the strip's Wrote back",
  );
  assert.equal(chart.props.tipNote(none), null, "nothing under a day nothing was answered on");
  assert.equal(chart.props.describe(answered, 0), answered.sentWords);
  assert.equal(chart.props.describe(answered, 0), `${answered.label}: ${answered.sent} sent`);
});

test("the channels' bars and the sources' rows say a share only of five sends or more, and the count under that", () => {
  const sends = {
    ...CAMPAIGNS,
    by_channel: [
      { channel: "whatsapp", sent: 120, delivered: 110, read: 31, replied: 30 },
      { channel: "email", sent: 5, delivered: 4, read: 0, replied: 1 },
      { channel: "sms", sent: 4, delivered: 3, read: 0, replied: 1 },
    ],
    sources: [
      { ...CAMPAIGNS.sources[0], sent: 4, delivered: 3, replied: 1 },
      { ...CAMPAIGNS.sources[1], sent: 5, delivered: 4, replied: 1 },
    ],
  };
  const tree = draw({ own: own({ campaigns: sends }) });
  assert.deepEqual(
    rowsOf(tree, "chart-campaign-channels").map((r) => r.display),
    ["120 · 92% delivered", "5 · 80% delivered", "4 · 3 of 4 delivered"],
    "four texts: the count; five emails: the share (most first)",
  );
  assert.doesNotMatch(textOf(byTestId(tree, "chart-campaign-channels")), /75%/, "REGRESSION: a share of four sends");
  const cells = all(byTestId(tree, "chart-sources"), (n) => n.props?.["data-testid"] === "source-row").map((row) =>
    all(row, (n) => n.type === "td").map(textOf),
  );
  assert.deepEqual(
    cells.map((c) => c.slice(1, 4)),
    [
      ["4", "3 of 4", "1 of 4"],
      ["5", "80%", "20% (1)"],
    ],
    "four sends: counts; five: the shares, the answered with their count",
  );
  assert.match(
    textOf(byTestId(tree, "chart-sources")),
    /Answered/,
    "the column counts messages, as the funnel's row does",
  );
});

test("the strip says how many figures are across: four where a run count is missing, one where the sends failed too", () => {
  // The database counted the moments and not the broadcasts: the people sent to are not said, and the other four are.
  const noBroadcasts = dtoWith({ runs: { now: { moment: 12 }, before: { moment: 10, broadcast: 1 } } });
  const four = draw({ own: own({ ledger: noBroadcasts }) });
  assert.deepEqual(metricsOf(byTestId(four, "campaigns-strip")), [
    "delivered_share",
    "people_wrote_back",
    "said_yes",
    "asked_to_stop",
  ]);
  assert.ok(classes(byTestId(four, "campaigns-strip")).includes("quad"), "four across");
  assert.deepEqual(
    foldOf({ ledger: noBroadcasts }).strip.map((t) => t.metric),
    metricsOf(byTestId(four, "campaigns-strip")),
    "and it is the fold's own output",
  );
  // And the sends failing too: the people who wrote back, alone.
  const one = draw({ own: own({ campaigns: null, ledger: noBroadcasts }) });
  assert.deepEqual(metricsOf(byTestId(one, "campaigns-strip")), ["people_wrote_back"]);
  assert.ok(classes(byTestId(one, "campaigns-strip")).includes("solo"), "one, filling its frame");
  for (const tree of [four, one]) assert.doesNotMatch(textOf(tree), /NaN|Infinity/);
});

test("the fold is made once per read value: a draw again over the same read keeps it, and a new read makes a new one", () => {
  const foldOfTree = (tree) => find(tree, (n) => n.type === CampaignsLens).props.fold;
  keepReportPeriod("7d");
  setSurfaceValue("reports", surface());
  setSurfaceValue("reports_campaigns", held(dtoWith(), "7d"));
  fresh();
  const pathname = "/w/harbor/reports/campaigns";
  const first = foldOfTree(ReportsPage({ pathname }));
  const second = foldOfTree(again(() => ReportsPage({ pathname })));
  assert.ok(
    first && first === second,
    "REGRESSION: a draw folded the read again, and the head and the cards could part",
  );
  setSurfaceValue("reports_campaigns", held(dtoWith(), "7d"));
  const third = foldOfTree(again(() => ReportsPage({ pathname })));
  assert.notEqual(third, first, "a new read is folded anew");
});

test("the numbers the world adds up to stay the world's: the sums beside them are the strip's, not the page's", () => {
  const tree = draw();
  const sentTo = figureProps(tree, "people_sent_to");
  assert.equal(sentTo.value, String(SERIES.people.now.sent_to));
  assert.equal(sentTo.meta, "240 messages over 14 runs");
  assert.equal(sentTo.change, `up from ${SERIES.people.before.sent_to}`, "against the people of the 30 days before");
  assert.equal(figureProps(tree, "delivered_share").value, "92%");
  assert.deepEqual([figureProps(tree, "delivered_share").n, figureProps(tree, "delivered_share").minN], [240, 5]);
  assert.equal(figureProps(tree, "said_yes").value, "14");
  assert.equal(figureProps(tree, "asked_to_stop").value, "3");
});

/* ------------------------------------------------------------------------------------------------ the page, part two */

/** The fold on the page's own clock (the page folds at Date.now()): for a line that says when, as "checked today" or "since Sat" do. */
const liveFoldOf = (input = {}) =>
  toCampaignLensVM({ campaigns: CAMPAIGNS, ledger: dtoWith(), reachOuts: undefined, ...input }, Date.now());
/** A workspace that has everything: the sends, the ledger, what is stuck and a reach-out. */
const everything = (over = {}) => held(dtoWith(), "7d", { reachOuts: reachOuts(), ...over });
/** The figure's own element, by its metric, and the address its number opens (no link: null). */
const figureOf = (tree, metric) => find(tree, (n) => n.type === "div" && n.props["data-figure"] === metric);
const hrefOf = (tree, metric) => find(figureOf(tree, metric), (n) => n.type === "a")?.props.href ?? null;
const valueOf = (tree, metric) => textOf(find(figureOf(tree, metric), (n) => classes(n).includes("figure-value")));
const toneOf = (tree, metric) => figureProps(tree, metric).tone;
/** The text of each cell of each row of a table, by the test id its rows wear. */
const cellsOfRows = (tree, rowId) =>
  all(tree, (n) => n.props?.["data-testid"] === rowId).map((row) => all(row, (n) => n.type === "td").map(textOf));
const headersOf = (tree, id) => all(byTestId(tree, id), (n) => n.type === "th").map(textOf);
/** The stuck read as the database gives it, with each count `over` puts in its place. */
const stuckWith = (over = {}) => ({ ...STUCK_NOW, ...over });
const NOTHING_STUCK = stuckWith({
  waiting: { n: 0, late: 0, oldest_at: null, capped: false },
  failed: { n: 0, latest: null, capped: false },
  replies: { n: 0, oldest_at: null, capped: false },
  templates: { n: 0, items: [] },
});

test("the five parts, in order, for a workspace that has everything", () => {
  const tree = draw({ own: everything() });
  // The cards and the strips in the order the page draws them: the stub walks a section after what is in it, so the three
  // sections that wrap them (the waits, what is stuck and the reach-outs) are held apart and in their own order.
  const inOrder = (ids) => all(tree, (n) => ids.includes(n.props?.["data-testid"])).map((n) => n.props["data-testid"]);
  const sections = ["campaigns-time", "campaigns-stuck", "rpt-reach-outs"];
  const cards = [
    ...ORDER,
    "chart-campaigns-first-reply",
    "chart-campaigns-approval",
    "campaigns-stuck-strip",
    ...RO_IDS.filter((id) => id !== "rpt-reach-outs"),
  ];
  assert.deepEqual(inOrder(cards), cards, "the sentence's strip and mix, the waits, what is stuck, and the reach-outs");
  assert.deepEqual(inOrder(sections), sections, "and the three parts that follow the lens, in order");
  assert.deepEqual(sectionsOf(tree), ["Campaigns", "Time between steps", "Stuck now", "Reach-outs"]);
  // The lens's own sections are bare (their tab says it); the reach-outs, a part of their own under it, name themselves.
  assert.deepEqual(all(tree, (n) => n.type === "h2").map(textOf), ["Reach-outs"]);
  // Every row of cards fills the twelve columns.
  assert.deepEqual(rowsOfSpans(tree), [[5, 7], [4, 4, 4], [6, 6], [12], [6, 6], [4, 4, 4], [5, 7], [12]]);
  assert.deepEqual(metricsOf(byTestId(tree, "campaigns-stuck-strip")), STUCK_METRICS);
  assert.deepEqual(present(tree, FAILED_IDS), no(FAILED_IDS));
  assert.deepEqual(dimmed(tree), []);
  assert.doesNotMatch(textOf(tree), /NaN|Infinity|undefined/);
});

test("the time cards are the fold's two distributions, every bucket kept, each with its own line", () => {
  const v = liveFoldOf();
  const tree = draw({ own: everything() });
  const cards = [
    ["chart-campaigns-first-reply", v.firstReply, "From a message to the first reply", ["How soon", "Messages"]],
    ["chart-campaigns-approval", v.approval, "Waiting for your OK", ["How long it waited", "Runs"]],
  ];
  for (const [id, part, title, columns] of cards) {
    const wanted = part.rows.map((r) => [r.label, r.value]);
    assert.deepEqual(
      rowsOf(tree, id).map((r) => [r.label, r.value]),
      wanted,
      `${id}: a bar a bucket`,
    );
    assert.equal(lineOf(tree, id), part.line, `${id}: the fold's line`);
    assert.equal(titleOf(tree, id), title);
    assert.deepEqual(cardOf(tree, id).props.table, { columns, rows: wanted }, `${id}: the table twin`);
    assert.equal(cardOf(tree, id).props.className, "rpt-span-6", `${id}: half the row`);
  }
  assert.deepEqual(
    rowsOf(tree, "chart-campaigns-first-reply").map((r) => r.label),
    ["Within 15 minutes", "Within an hour", "Within 4 hours", "Within a day", "Within 3 days"],
  );
  assert.equal(
    lineOf(tree, "chart-campaigns-first-reply"),
    "The middle one was answered 1h 30m after it was sent, of 50 answered messages.",
  );
  // A bucket nobody fell in is still a bar of nothing, not a missing one (it is a distribution), and fewer than five have no middle.
  const few = draw({
    own: held(dtoWith({ approval: { n: 2, median_s: null, buckets: { h1: 2, h4: 0, h24: 0, over: 0 } } }), "7d"),
  });
  assert.deepEqual(
    rowsOf(few, "chart-campaigns-approval").map((r) => [r.label, r.value]),
    [
      ["An hour or less", 2],
      ["Up to 4 hours", 0],
      ["Up to a day", 0],
      ["More than a day", 0],
    ],
  );
  assert.equal(lineOf(few, "chart-campaigns-approval"), "2 runs you approved: too few for a middle.");
  // Nothing answered, nothing approved: the fold's words, and no bars of nothing.
  const nobody = draw({
    own: held(
      dtoWith({
        first_reply: { n: 0, median_s: null, buckets: { m15: 0, h1: 0, h4: 0, h24: 0, h72: 0 } },
        approval: { n: 0, median_s: null, buckets: { h1: 0, h4: 0, h24: 0, over: 0 } },
      }),
      "7d",
    ),
  });
  assert.ok(textOf(byTestId(nobody, "chart-campaigns-approval")).includes("No run waited for your OK in this period."));
  assert.ok(
    textOf(byTestId(nobody, "chart-campaigns-first-reply")).includes("No message was answered in this period."),
  );
  for (const id of ["chart-campaigns-first-reply", "chart-campaigns-approval"])
    assert.equal(
      find(byTestId(nobody, id), (n) => n.type === BarList),
      null,
      `${id}: no bars of nothing`,
    );
});

test("what is stuck wears its tone and opens its door; with every count at 0 no figure is toned and the number is the only figure with a word", () => {
  const v = liveFoldOf();
  const tree = draw({ own: everything() });
  const strip = byTestId(tree, "campaigns-stuck-strip");
  assert.equal(strip.type, "dl");
  assert.deepEqual(metricsOf(strip), STUCK_METRICS);
  assert.deepEqual(
    metricsOf(strip).map((m) => figureProps(tree, m).label),
    ["Runs waiting for you", "Failed runs", "Replies that need you", "Messages Meta stopped", "Your WhatsApp number"],
  );
  assert.deepEqual(
    metricsOf(strip).map((m) => valueOf(tree, m)),
    ["3", "1", "2", "2", "Good"],
  );
  assert.deepEqual(
    STUCK_METRICS.map((m) => toneOf(tree, m)),
    ["warn", "fail", "warn", "fail", undefined],
    "amber for what needs you, red for what failed, a good number plain",
  );
  assert.deepEqual(
    STUCK_METRICS.map((m) => hrefOf(tree, m)),
    [
      "/w/studio/campaigns",
      "/w/studio/broadcasts",
      "/w/studio/inbox",
      "/w/studio/templates",
      "/w/studio/settings/integrations",
    ],
    "a door each",
  );
  // The words under each number are the fold's, and the tone is drawn by the kit (is-warn, is-fail).
  for (const f of v.stuck) {
    assert.equal(figureProps(tree, f.metric).meta, f.meta, `${f.metric}: the fold's line`);
    assert.equal(figureProps(tree, f.metric).definition?.length > 0, true, `${f.metric}: it says what it counts`);
  }
  assert.ok(classes(figureOf(tree, "runs_waiting")).includes("is-warn"));
  assert.ok(classes(figureOf(tree, "runs_failed")).includes("is-fail"));
  assert.equal(
    classes(figureOf(tree, "number_health")).some((c) => /^is-(warn|fail)$/.test(c)),
    false,
  );
  navigated.length = 0;
  press(find(figureOf(tree, "runs_waiting"), (n) => n.type === "a"));
  assert.deepEqual(navigated, ["campaigns"], "a plain press goes the app's own way");
  // The number carries its own tone: amber at medium, red once flagged, nothing otherwise, and a door to where it is fixed.
  const numberAs = (number) => draw({ own: own({ ledger: dtoWith({}, stuckWith({ number })) }) });
  const medium = numberAs({ ...NUMBER, tone: "warn", label: "Number quality: medium" });
  assert.deepEqual([valueOf(medium, "number_health"), toneOf(medium, "number_health")], ["Medium", "warn"]);
  const flagged = numberAs({ ...NUMBER, tone: "danger", label: "Number flagged" });
  assert.deepEqual([valueOf(flagged, "number_health"), toneOf(flagged, "number_health")], ["Flagged", "fail"]);
  const unknown = numberAs({ ...NUMBER, tone: "unknown", label: "Not reported" });
  assert.deepEqual([valueOf(unknown, "number_health"), toneOf(unknown, "number_health")], ["Not reported", undefined]);
  const none = numberAs({ state: "none" });
  assert.deepEqual([valueOf(none, "number_health"), toneOf(none, "number_health")], ["—", undefined]);
  assert.equal(figureProps(none, "number_health").meta, "no WhatsApp number is connected");
  assert.equal(hrefOf(none, "number_health"), "/w/studio/settings/integrations", "and where to connect one");
  // Nothing stuck: a count that is zero is a 0, no figure wears a tone, and only the number says a word.
  const calm = draw({ own: own({ ledger: dtoWith({}, NOTHING_STUCK) }) });
  assert.deepEqual(
    STUCK_METRICS.slice(0, 4).map((m) => valueOf(calm, m)),
    ["0", "0", "0", "0"],
  );
  assert.equal(valueOf(calm, "number_health"), "Good");
  assert.deepEqual(
    STUCK_METRICS.map((m) => toneOf(calm, m)),
    STUCK_METRICS.map(() => undefined),
    "nothing needs you and nothing failed: no figure is toned",
  );
  assert.equal(
    all(byTestId(calm, "campaigns-stuck-strip"), (n) => /^is-(warn|fail)$/.test(classes(n).join(" "))).length,
    0,
  );
  assert.equal(hrefOf(calm, "runs_waiting"), "/w/studio/campaigns", "the door is still there at 0");
  // A list the database cut at 500 is a floor, said as one.
  const capped = draw({
    own: own({ ledger: dtoWith({}, stuckWith({ waiting: { n: 500, late: 2, oldest_at: null, capped: true } })) }),
  });
  assert.equal(valueOf(capped, "runs_waiting"), "500+");
});

test("a quiet period hides neither the stuck nor the reach-outs, and draws no window card", () => {
  const R = surface({ report: quiet() });
  const tree = draw({ R, own: held(dtoWith(QUIET), "7d", { campaigns: CAMPAIGNS_QUIET, reachOuts: reachOuts() }) });
  assert.ok(byTestId(tree, "chart-campaigns-quiet"), "the lens's own card");
  assert.ok(byTestId(tree, "campaigns-stuck"), "what is stuck is as of now, whatever the window held");
  assert.ok(byTestId(tree, "rpt-reach-outs"), "and a reach-out writes without a campaign");
  assert.deepEqual(present(tree, RO_CARDS), yes(RO_CARDS));
  assert.deepEqual(present(tree, ORDER), no(ORDER), "no strip and none of the window's cards");
  assert.deepEqual(present(tree, TIME_IDS), no(TIME_IDS), "and no waits of an empty window");
  assert.deepEqual(sectionsOf(tree), ["Campaigns", "Stuck now", "Reach-outs"]);
  assert.deepEqual(rowsOfSpans(tree), [[4, 4, 4], [5, 7], [12]]);
  assert.equal(
    standingSaid().sentence,
    liveFoldOf({ campaigns: CAMPAIGNS_QUIET, ledger: dtoWith(QUIET), reachOuts: reachOuts() }).head,
  );
  assert.equal(
    standingSaid().sentence,
    "Nothing went out in this period. Your reach-outs wrote 40 emails to 25 businesses.",
  );
  assert.doesNotMatch(textOf(tree), /NaN|Infinity/);
});

test("the reach-outs are businesses over businesses: the emails and the businesses in cards of their own, each on the fold's words", () => {
  const v = liveFoldOf({ reachOuts: reachOuts() }).reachOuts;
  const tree = draw({ own: everything() });
  const strip = byTestId(tree, "ro-strip");
  assert.equal(strip.type, "dl");
  assert.ok(classes(strip).includes("trio"), "three across");
  assert.deepEqual(metricsOf(strip), ["emails_written", "emails_landed", "emails_bounced"]);
  for (const f of v.strip) {
    assert.equal(figureProps(tree, f.metric).value, f.value, `${f.metric}: the fold's number`);
    assert.equal(figureProps(tree, f.metric).meta, f.meta);
    assert.equal(figureProps(tree, f.metric).change, f.compare);
  }
  assert.deepEqual([figureProps(tree, "emails_landed").n, figureProps(tree, "emails_landed").minN], [40, 5]);
  // The emails: three counts of emails. The businesses: five counts of businesses, with the words that they are as they stand now.
  assert.equal(titleOf(tree, "ro-emails"), "Emails");
  assert.deepEqual(
    rowsOf(tree, "ro-emails").map((r) => [r.label, r.value]),
    [
      ["Written", 40],
      ["Delivered", 36],
      ["Bounced", 2],
    ],
  );
  assert.equal(lineOf(tree, "ro-emails"), v.emails.line);
  assert.equal(titleOf(tree, "ro-funnel"), "Businesses");
  assert.deepEqual(
    rowsOf(tree, "ro-funnel").map((r) => [r.label, r.value]),
    [
      ["Written to", 25],
      ["Wrote back", 6],
      ["Interested", 3],
      ["Booked", 1],
      ["Said no", 2],
    ],
  );
  assert.equal(lineOf(tree, "ro-funnel"), v.businesses.line);
  assert.match(lineOf(tree, "ro-funnel"), /as it stands now/, "the fold says it on the businesses line");
  assert.deepEqual(cardOf(tree, "ro-emails").props.table.columns, ["What happened", "Emails"]);
  assert.deepEqual(cardOf(tree, "ro-funnel").props.table.columns, ["What came of it", "Businesses"]);
  // The angles are state now too, and the card says so (the fold says it; the page writes no sentence).
  assert.equal(titleOf(tree, "ro-angles"), "Replies, by angle");
  assert.equal(lineOf(tree, "ro-angles"), v.angles.line);
  assert.match(lineOf(tree, "ro-angles"), /as they stand now/);
  assert.deepEqual(
    rowsOf(tree, "ro-angles").map((r) => [r.label, r.value, r.display]),
    [
      ["their rating", 25, "2 of 8  25%"],
      ["mid-session calls", 50, "2 of 4"],
    ],
  );
  assert.equal(
    find(byTestId(tree, "ro-angles"), (n) => n.type === BarList).props.max,
    100,
    "every bar on the one scale",
  );
});

test("the angles' bars grey where the businesses they are of are fewer than five, by contracts' one predicate", () => {
  const dto = reachOuts({
    angles: [
      { angle: "their rating", written: 20, businesses: 8, wrote_back: 2 },
      { angle: "mid-session calls", written: 8, businesses: 4, wrote_back: 2 },
      { angle: "a local mention", written: 2, businesses: 5, wrote_back: 1 },
      { angle: "no reply yet", written: 2, businesses: 0, wrote_back: 0 },
    ],
  });
  const v = liveFoldOf({ reachOuts: dto }).reachOuts;
  const tree = draw({ own: held(dtoWith(), "7d", { reachOuts: dto }) });
  const rows = rowsOf(tree, "ro-angles");
  assert.deepEqual(
    rows.map((r) => r.display),
    ["2 of 8  25%", "2 of 4", "1 of 5  20%", "—"],
    "a share from five businesses, a count under that, a dash for none",
  );
  assert.deepEqual(
    rows.map((r) => r.color === "var(--chart-prior)"),
    v.angles.rows.map((a) => isThinShare(a.n, a.minN)),
    "grey exactly where the fold's n is under its minN",
  );
  assert.deepEqual(
    rows.map((r) => r.color === "var(--chart-prior)"),
    [false, true, false, false],
    "four businesses: grey; five: read; none: an empty bar, nothing to grey",
  );
});

test("the sources say a business once: the Businesses column, a door on a reach-out's name, a count where fewer than five", () => {
  const v = liveFoldOf({ reachOuts: reachOuts() }).reachOuts;
  const tree = draw({ own: everything() });
  assert.equal(titleOf(tree, "ro-sources"), "By reach-out and step");
  assert.equal(lineOf(tree, "ro-sources"), v.lines.sources);
  assert.match(lineOf(tree, "ro-sources"), /as it stands now/, "what came of each is state now, and the card says so");
  assert.deepEqual(headersOf(tree, "ro-sources"), [
    "Reach-out",
    "Written",
    "Delivered",
    "Businesses",
    "Wrote back",
    "Interested",
    "Booked",
    "Won",
    "Said no",
    "Bounced",
    "Last",
  ]);
  const lines = v.sources;
  const rendered = [
    ...cellsOfRows(tree, "ro-source-row").map((c) => ["chain", c]),
    ...cellsOfRows(tree, "ro-step-row").map((c) => ["step", c]),
  ];
  assert.equal(rendered.length, lines.length, "a line a reach-out and a line a step");
  const cellsOf = (l) => [
    l.written,
    l.delivered,
    l.businesses,
    l.wroteBack,
    l.interested,
    l.booked,
    l.won,
    l.saidNo,
    l.bounced,
    l.last,
  ];
  for (const kind of ["chain", "step"])
    assert.deepEqual(
      rendered.filter(([k]) => k === kind).map(([, c]) => c.slice(1)),
      lines.filter((l) => l.kind === kind).map(cellsOf),
      `${kind}: every cell is the fold's`,
    );
  // Thirty emails to twenty businesses, five of whom wrote back: the share from five, with the count; three businesses: "1 of 3".
  assert.deepEqual(
    lines.filter((l) => l.kind === "chain").map((l) => [l.businesses, l.wroteBack]),
    [
      ["20", "25% (5)"],
      ["5", "20% (1)"],
    ],
  );
  assert.deepEqual(
    cellsOf(lines.find((l) => l.id === "r2:q1")).slice(2, 4),
    ["3", "1 of 3"],
    "three businesses: the count it is of, as the rest of the page says a share of fewer than five",
  );
  // The table twin carries the Businesses column too.
  assert.deepEqual(cardOf(tree, "ro-sources").props.table.columns, [
    "Reach-out",
    "Written",
    "Delivered",
    "Businesses",
    "Wrote back",
    "Interested",
    "Booked",
    "Won",
    "Said no",
    "Bounced",
  ]);
  assert.equal(cardOf(tree, "ro-sources").props.switchable, false);
  assert.deepEqual(
    cardOf(tree, "ro-sources").props.table.rows.map((r) => r.slice(0, 4)),
    lines.map((l) => [l.name, l.written, l.delivered, l.businesses]),
  );
  // A reach-out's name opens its row on Playbooks, a step's does not.
  const doors = all(
    byTestId(tree, "ro-sources"),
    (n) => n.type === "a" && n.props?.["data-testid"] === "ro-source-open",
  );
  assert.deepEqual(
    doors.map((d) => d.props.href),
    ["/w/studio/campaigns/moment:r1", "/w/studio/campaigns/moment:r2"],
  );
  navigated.length = 0;
  press(doors[0]);
  assert.deepEqual(navigated, ["outbound/r1"]);
  // A hand step is dashes, as the fold says it.
  const withHand = reachOuts();
  withHand.chains[0].steps.push({ id: "p3", n: 2, hand: "call", ...reachCounts({ handed: 4, businesses: 0 }) });
  const hand = draw({ own: held(dtoWith(), "7d", { reachOuts: withHand }) });
  assert.deepEqual(
    cellsOfRows(hand, "ro-step-row")
      .find((c) => c[0].startsWith("3 ·"))
      .slice(1, 5),
    ["—", "—", "—", "—"],
  );
});

test("a share of fewer than five businesses or emails is a count on the reach-outs' cards, and never a percentage", () => {
  const small = reachOuts({
    totals: reachCounts({ written: 4, delivered: 3, bounced: 1, businesses: 3, wrote_back: 1, interested: 1 }),
    before: { written: 3, delivered: 2, bounced: 1 },
    angles: [{ angle: "their rating", written: 4, businesses: 3, wrote_back: 1 }],
    chains: [
      {
        ...reachOuts().chains[0],
        steps: [reachStep("p1", 0, { written: 4, delivered: 3, bounced: 1, businesses: 3, wrote_back: 1 })],
      },
    ],
    domains: [
      {
        host: "mail.example.com",
        state: "verified",
        held_why: null,
        held_at: null,
        sent: 3,
        delivered: 2,
        bounced: 1,
        complained: 0,
      },
    ],
  });
  const tree = draw({ own: held(dtoWith(), "7d", { reachOuts: small }) });
  const landed = figureProps(tree, "emails_landed");
  assert.deepEqual([landed.n, landed.minN], [4, 5]);
  assert.equal(isThinShare(landed.n, landed.minN), true);
  assert.ok(classes(figureOf(tree, "emails_landed")).includes("is-thin"), "greyed by the kit, saying how few");
  const said = [
    textOf(byTestId(tree, "ro-emails")),
    textOf(byTestId(tree, "ro-funnel")),
    textOf(byTestId(tree, "ro-angles")),
    textOf(byTestId(tree, "ro-sources")),
    textOf(byTestId(tree, "ro-domains")).replace("Past 2% bounced, a domain holds itself.", ""),
  ].join(" ");
  assert.doesNotMatch(said, /\d%/, "REGRESSION: a share of fewer than five said as a percentage");
  assert.deepEqual(
    rowsOf(tree, "ro-angles").map((r) => [r.display, r.color]),
    [["1 of 3", "var(--chart-prior)"]],
  );
  assert.deepEqual(
    cellsOfRows(tree, "ro-domain-row").map((c) => c.slice(1)),
    [["3", "2 of 3", "1 of 3", "0 of 3"]],
  );
});

test("a database before 00404 says it does not count businesses and draws the emails", () => {
  const tree = draw({ own: held(dtoWith(), "7d", { reachOuts: beforeBusinesses() }) });
  const v = liveFoldOf({ reachOuts: beforeBusinesses() }).reachOuts;
  assert.equal(v.businesses.empty, "This database does not count businesses yet.");
  assert.ok(textOf(byTestId(tree, "ro-funnel")).includes(v.businesses.empty), "the words, in the businesses' card");
  assert.equal(
    find(byTestId(tree, "ro-funnel"), (n) => n.type === BarList),
    null,
    "no bars of a unit it does not count",
  );
  assert.ok(textOf(byTestId(tree, "ro-angles")).includes("This database does not count businesses yet."));
  assert.equal(
    find(byTestId(tree, "ro-angles"), (n) => n.type === BarList),
    null,
  );
  assert.deepEqual(
    rowsOf(tree, "ro-emails").map((r) => [r.label, r.value]),
    [
      ["Written", 40],
      ["Delivered", 36],
      ["Bounced", 2],
    ],
    "the emails stand",
  );
  assert.equal(
    figureProps(tree, "emails_written").meta,
    "40 emails",
    "the strip counts emails, with no businesses to say",
  );
  assert.deepEqual(
    cellsOfRows(tree, "ro-source-row").map((c) => [c[3], c[4]]),
    [
      ["—", "5"],
      ["—", "1"],
    ],
    "no businesses to divide by: the count of those who wrote back alone",
  );
  assert.doesNotMatch(textOf(tree), /NaN|null|undefined/);
});

test("the days written and the domains are the fold's, said aloud in its words", () => {
  const v = liveFoldOf({ reachOuts: reachOuts() }).reachOuts;
  const tree = draw({ own: everything() });
  assert.equal(titleOf(tree, "ro-written"), "Written, day by day");
  const chart = find(byTestId(tree, "ro-written"), (n) => n.type === BarChart);
  assert.deepEqual(chart.props.data, v.points);
  assert.deepEqual(chart.props.keys, ["written"]);
  assert.deepEqual(
    chart.props.data.map((d, i) => chart.props.describe(d, i)),
    ["Aug 31: 10 written", "Sep 2: 30 written"],
    "a day aloud is the fold's words",
  );
  assert.deepEqual(cardOf(tree, "ro-written").props.table, v.table);
  assert.equal(cardOf(tree, "ro-written").props.takeaway, null, "nothing was handed to you: no line");
  const handed = reachOuts({ totals: reachCounts({ ...reachOuts().totals, handed: 4 }) });
  assert.equal(
    lineOf(draw({ own: held(dtoWith(), "7d", { reachOuts: handed }) }), "ro-written"),
    "4 businesses handed to you as a call or a note, too.",
  );
  assert.equal(titleOf(tree, "ro-domains"), "By domain");
  assert.equal(lineOf(tree, "ro-domains"), v.lines.domains);
  assert.deepEqual(headersOf(tree, "ro-domains"), ["Domain", "Sent", "Landed", "Bounced", "Spam"]);
  assert.deepEqual(
    cellsOfRows(tree, "ro-domain-row").map((c) => [c[0], ...c.slice(1)]),
    v.domains.map((d) => [`${d.host}${d.state}`, String(d.sent), d.landed, d.bounced, d.complained]),
  );
  // No domain sent: the card is not drawn (it would say a sentence of the page's own), and the days take the row.
  const none = draw({ own: held(dtoWith(), "7d", { reachOuts: reachOuts({ domains: [] }) }) });
  assert.equal(byTestId(none, "ro-domains"), null);
  assert.deepEqual(rowsOfSpans(none).slice(-2), [[12], [12]]);
});

test("a period in which only calls and notes were handed to you says nothing was written once, and draws no days card of its own", () => {
  // Hand steps alone ran: handed > 0, written = 0, so the period is not empty but no email left (and so none from any domain).
  const handed = (over = {}) =>
    reachOuts({
      totals: reachCounts({ businesses: 0, handed: 4 }),
      before: { written: 0, delivered: 0, bounced: 0 },
      series: [],
      angles: [],
      no_angle: 0,
      domains: [],
      chains: [
        {
          ...reachOuts().chains[0],
          steps: [{ id: "p1", n: 0, hand: "call", ...reachCounts({ handed: 4, businesses: 0 }) }],
        },
      ],
      ...over,
    });
  const tree = draw({ own: held(dtoWith(), "7d", { reachOuts: handed() }) });
  const v = liveFoldOf({ reachOuts: handed() }).reachOuts;
  assert.equal(v.empty, false, "four were handed to you: the period is not an empty one");
  assert.equal(v.emails.empty, "Nothing was written in these days.");
  const said = textOf(byTestId(tree, "rpt-reach-outs"));
  assert.equal(said.split(v.emails.empty).length - 1, 1, "REGRESSION: the emails part's empty words were said twice");
  assert.ok(
    byTestId(tree, "ro-emails") && byTestId(tree, "ro-sources"),
    "the emails card and the step on its line stand",
  );
  assert.equal(byTestId(tree, "ro-written"), null, "no days card of a sentence");
  assert.equal(byTestId(tree, "ro-domains"), null, "and no domain sent");
  assert.equal(lineOf(tree, "ro-sources"), v.lines.sources);
  assert.deepEqual(
    all(byTestId(tree, "rpt-reach-outs"), (n) => n.type === "div" && classes(n).includes("rpt-grid")).map((g) =>
      cardsOfGrid(g).map(spanOf),
    ),
    [[4, 4, 4], [12]],
    "the sources stand alone in their row",
  );
  // A domain that sent nothing is still a card, and takes the whole row.
  const quietDomain = reachOuts({
    ...handed(),
    domains: [
      {
        host: "mail.example.com",
        state: "verified",
        held_why: null,
        held_at: null,
        sent: 0,
        delivered: 0,
        bounced: 0,
        complained: 0,
      },
    ],
  });
  const withDomain = draw({ own: held(dtoWith(), "7d", { reachOuts: quietDomain }) });
  assert.equal(byTestId(withDomain, "ro-written"), null);
  assert.deepEqual(
    all(byTestId(withDomain, "rpt-reach-outs"), (n) => n.type === "div" && classes(n).includes("rpt-grid")).map((g) =>
      cardsOfGrid(g).map(spanOf),
    ),
    [[4, 4, 4], [12], [12]],
    "the domain takes its row, and the sources theirs",
  );
});

test("a reach-out period that wrote nothing is the old card with the fold's words and a door to Campaigns", () => {
  const tree = draw({ own: held(dtoWith(), "7d", { reachOuts: reachOuts(NOTHING_WRITTEN) }) });
  const v = liveFoldOf({ reachOuts: reachOuts(NOTHING_WRITTEN) }).reachOuts;
  assert.equal(v.empty, true);
  const card = byTestId(tree, "ro-report-empty");
  assert.ok(card, "nothing written");
  assert.ok(textOf(card).includes("Nothing written") && textOf(card).includes(v.lines.empty), textOf(card));
  assert.equal(v.lines.empty, "No reach-out wrote in the last 30 days.");
  assert.ok(byTestId(tree, "rpt-reach-outs"), "the section is still there, under its heading");
  for (const id of RO_CARDS) assert.equal(byTestId(tree, id), null, `${id}: no card of nothing`);
  assert.equal(byTestId(tree, "ro-strip"), null, "and no strip of zeros");
  navigated.length = 0;
  press(find(card, (n) => n.type === "button"));
  assert.deepEqual(navigated, ["outbound"]);
  // A workspace with no reach-out, and a demo that reads none, draw nothing.
  const none = draw({ own: held(dtoWith(), "7d", { reachOuts: reachOuts({ has_reach_out: false }) }) });
  assert.equal(byTestId(none, "rpt-reach-outs"), null);
  assert.deepEqual(sectionsOf(none), ["Campaigns", "Time between steps", "Stuck now"]);
  const demo = draw({ own: held(dtoWith(), "7d") });
  assert.equal(byTestId(demo, "rpt-reach-outs"), null);
});

test("the time cards and the stuck strip are absent where their functions are; a failed read is one failed card, and the rest stands", () => {
  // No campaign_ledger: no waits (they are the ledger's), and no failure; what is stuck stands, as the database answers it.
  const noLedger = draw({ own: own({ ledger: dtoWith(null) }) });
  assert.deepEqual(present(noLedger, TIME_IDS), no(TIME_IDS));
  assert.ok(byTestId(noLedger, "campaigns-stuck"), "campaign_stuck is another function");
  assert.deepEqual(present(noLedger, FAILED_IDS), no(FAILED_IDS));
  // No campaign_stuck: nothing stuck is said, and no failure.
  const noStuck = draw({ own: own({ ledger: dtoWith({}, null) }) });
  assert.equal(byTestId(noStuck, "campaigns-stuck"), null, "a function the database lacks is not drawn");
  assert.equal(byTestId(noStuck, "campaigns-failed-stuck"), null, "and is not a failed read");
  assert.deepEqual(present(noStuck, TIME_IDS), yes(TIME_IDS));
  assert.deepEqual(sectionsOf(noStuck), ["Campaigns", "Time between steps"]);
  // campaign_stuck failed: one failed read, in the strip's place, with its Retry; the waits and the window stand.
  const failedStuck = draw({ own: own({ ledger: { ...dtoWith({}, null), stuck_failed: true } }) });
  const failed = all(failedStuck, (n) => n.props?.["data-testid"] === "campaigns-failed-stuck");
  assert.equal(failed.length, 1, "one");
  assert.ok(textOf(failed[0]).includes("Couldn't read what is stuck now"), textOf(failed[0]));
  assert.ok(textOf(failed[0]).includes("The rest of this page is current."), "the fold's body");
  assert.equal(
    find(failedStuck, (n) => n.props?.testid === "campaigns-failed-stuck")?.props.surface,
    "reports_campaigns",
    "its Retry reads the lens's own surface again",
  );
  assert.equal(byTestId(failedStuck, "campaigns-stuck-strip"), null, "none of the five figures");
  assert.ok(byTestId(failedStuck, "campaigns-stuck"), "the part is there, with its failure in it");
  assert.deepEqual(present(failedStuck, TIME_IDS), yes(TIME_IDS));
  assert.deepEqual(present(failedStuck, ORDER), yes(ORDER));
  // The ledger failing took what is stuck with it and said so once (campaigns-failed-ledger names both): no second card for it.
  const noWindow = draw({ own: own({ ledger: null }) });
  assert.equal(byTestId(noWindow, "campaigns-failed-stuck"), null);
  assert.equal(byTestId(noWindow, "campaigns-stuck"), null);
  assert.deepEqual(present(noWindow, TIME_IDS), no(TIME_IDS));
  // The reach-outs failing: their own failed read, in their section, with the fold's body; the rest of the lens stands.
  const roFailed = draw({ own: own({ reachOuts: null }) });
  const roFail = all(roFailed, (n) => n.props?.["data-testid"] === "ro-failed");
  assert.equal(roFail.length, 1, "one");
  assert.ok(textOf(roFail[0]).includes("Couldn't read the reach-out numbers"), textOf(roFail[0]));
  assert.ok(textOf(roFail[0]).includes("The rest of this page is current."));
  assert.ok(byTestId(roFailed, "rpt-reach-outs"), "under the section's own heading");
  assert.deepEqual(present(roFailed, RO_CARDS), no(RO_CARDS));
  assert.deepEqual(present(roFailed, ORDER), yes(ORDER), "the rest stands");
  assert.deepEqual(present(roFailed, [...TIME_IDS, "campaigns-stuck"]), yes([...TIME_IDS, "campaigns-stuck"]));
  assert.deepEqual(present(roFailed, FAILED_IDS), no(FAILED_IDS), "and its failure is its own");
  assert.equal(byTestId(roFailed, "campaigns-failed-reach_outs"), null);
  assert.equal(find(roFailed, (n) => n.props?.testid === "ro-failed")?.props.surface, "reports_campaigns");
});

test("the demo draws the same page from the sample through the real fold, the waits and what is stuck included, and no reach-outs", () => {
  setSurfaceValue("reports", undefined);
  setSurfaceValue("reports_campaigns", undefined);
  globalThis.__DEMO_MODE = true;
  try {
    fresh();
    navigated.length = 0;
    const tree = ReportsPage({ pathname: "/w/harbor/reports/campaigns" });
    assert.ok(byTestId(tree, "reports-sample"), "the sample's page");
    assert.deepEqual(
      present(tree, [...ORDER, ...TIME_IDS, "campaigns-stuck"]),
      yes([...ORDER, ...TIME_IDS, "campaigns-stuck"]),
    );
    assert.equal(byTestId(tree, "rpt-reach-outs"), null, "nothing reads the reach-outs in a demo");
    assert.deepEqual(sectionsOf(tree), ["Campaigns", "Time between steps", "Stuck now"]);
    assert.deepEqual(metricsOf(byTestId(tree, "campaigns-stuck-strip")), STUCK_METRICS);
    const s = campaignsSample("30d");
    const v = toCampaignLensVM({ campaigns: s.campaigns, ledger: s.ledger, reachOuts: s.reachOuts }, Date.now());
    assert.equal(
      lineOf(tree, "chart-campaigns-first-reply"),
      v.firstReply.line,
      "the fold's line, of the sample's numbers",
    );
    assert.equal(figureProps(tree, "runs_waiting").value, v.stuck.at(0).value);
    assert.deepEqual(
      present(tree, ["campaigns-failed-campaigns", "campaigns-failed-ledger", "campaigns-failed-stuck", "ro-failed"]),
      no(["campaigns-failed-campaigns", "campaigns-failed-ledger", "campaigns-failed-stuck", "ro-failed"]),
    );
  } finally {
    globalThis.__DEMO_MODE = false;
  }
});
