/**
 * Reports' regressions, moved from reports-honest (C13, C25 to C28).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { toDealReportVM } from "@chanlytics/contracts";
import { all, find, byTestId, textOf, classes, press } from "../../_stub-react.mjs";
import { quiet, dealsDto, NO_DEALS, DEALS } from "../_report-world.mjs";
import {
  LENS_PATHS,
  Popover,
  Segmented,
  card,
  cardOfPage,
  choose,
  chosen,
  cls,
  control,
  failedLine,
  inLens,
  inPeriodTest,
  land,
  lensAt,
  onAPhone,
  page,
  pageOnce,
  period,
  plot,
  redraw,
  seen,
  setLensAt,
  standingSaid,
  went,
} from "./_page.mjs";

/* ----------------------- the regressions, moved from reports-honest (C13, C25 to C28) ----------------------- */

test("REGRESSION (C13): each source row opens its playbook or its broadcast -- the rows were dead text", () => {
  const rows = all(page(), (n) => n.props?.["data-testid"] === "source-row");
  assert.equal(rows.length, 2);
  for (const r of rows) press(byTestId(r, "source-open"));
  assert.deepEqual(
    went,
    ["campaigns/sequences/p1", "campaigns/sequences/b1/runs/b1"],
    "REGRESSION: no door on either row",
  );
  // Each row's shares are of its own sends, said as the view model says them: from five sends a percentage (the answered with their count).
  assert.deepEqual(
    rows.map((r) =>
      all(r, (n) => n.type === "td")
        .map(textOf)
        .slice(1, 4),
    ),
    [
      ["14", "86%", "21% (3)"],
      ["6", "67%", "17% (1)"],
    ],
  );
  assert.deepEqual(
    rows.map((r) => byTestId(r, "source-open").props.href),
    ["/w/studio/campaigns/sequences/p1", "/w/studio/campaigns/sequences/b1/runs/b1"],
    "and each is a link with its address",
  );
});

test("REGRESSION (C25): the period before is drawn where it reads -- beside the running total and round the week, never zigzagging over daily columns", () => {
  const tree = page();
  assert.ok(cls(card(tree, "chart-people"), "ck-prior"), "REGRESSION: new people drew this period alone");
  assert.ok(
    find(card(tree, "chart-rhythm"), (n) => classes(n).includes("ck-radar-line") && classes(n).includes("prior")),
    "and so did the week",
  );
  for (const id of ["chart-answered", "chart-campaigns"])
    assert.equal(cls(card(tree, id), "ck-prior"), null, `${id}: no line over the columns (#557)`);
  for (const id of ["chart-people", "chart-rhythm"])
    assert.ok(textOf(card(tree, id)).includes("The 7 days before"), `${id}: the legend names it`);
});

test("REGRESSION (C26): a chart is one keyboard stop whose arrows read each day aloud -- its day areas answered focus no key could reach", () =>
  inLens(1, () => {
    let tree = pageOnce();
    const answered = () => card(tree, "chart-answered");
    assert.equal(plot(tree, "chart-answered").props.tabIndex, 0, "one stop for the chart");
    assert.equal(all(answered(), (n) => n.props && "tabIndex" in n.props).length, 1, "and none per day");
    const live = () => textOf(find(answered(), (n) => n.props?.["aria-live"] === "polite"));
    plot(tree, "chart-answered").props.onFocus();
    tree = redraw();
    assert.equal(
      live(),
      "Sep 4: 2 customer messages, 2 answered by AI, 0 by you, 0 unanswered",
      "focus lands on the latest day",
    );
    const key = (k) => {
      plot(tree, "chart-answered").props.onKeyDown({ key: k, preventDefault() {} });
      tree = redraw();
    };
    key("Home");
    assert.equal(live(), "Aug 29: 4 customer messages, 3 answered by AI, 1 by you, 0 unanswered");
    key("ArrowLeft");
    assert.match(live(), /^Aug 29:/, "held at the first day");
    key("ArrowRight");
    assert.match(live(), /^Aug 30:/);
    key("End");
    assert.match(live(), /^Sep 4:/);
  }));

test("REGRESSION: the period control never holds -- arrowing on to Month is a choice per key, each pick is read and the latest one wins", async () => {
  await inPeriodTest("hold", async () => {
    let tree = page();
    choose(tree, "30 days");
    tree = redraw();
    assert.equal(
      control(tree).props.readOnly,
      undefined,
      "REGRESSION: the control was read-only while a period loaded",
    );
    assert.equal(chosen(tree), "30 days", "the control shows the pick as it is made, so the next key goes on from it");
    choose(tree, "90 days");
    assert.deepEqual(period.asked, ["30d", "90d"], "each pick is read; none waits behind another");
    await land();
    redraw();
    tree = redraw();
    assert.equal(
      chosen(tree),
      "90 days",
      "the latest pick is the one shown: the surface dropped the answer for 30 days",
    );
    assert.equal(failedLine(tree), null, "and the pick that was left says nothing of its own");
  });
});

test("REGRESSION: a pick back to the period on screen, made while another loads, is shown at once and dims nothing -- the page waited on a read it did not need", async () => {
  // A workspace of its own, where no period is held yet, so the pick in between stays out until it lands.
  const was = globalThis.location.pathname;
  globalThis.location.pathname = "/w/pick-back";
  try {
    await inPeriodTest("hold", async () => {
      let tree = page();
      choose(tree, "30 days");
      await land();
      redraw();
      tree = redraw();
      assert.equal(chosen(tree), "30 days", "30 days is read, and held");
      choose(tree, "Month");
      tree = redraw();
      assert.equal(byTestId(tree, "reports-real").props["data-loading"], "", "Month is on its way");
      choose(tree, "30 days");
      redraw();
      tree = redraw();
      assert.equal(chosen(tree), "30 days", "the pick back is shown at once, from the 30 days held");
      assert.equal(
        byTestId(tree, "reports-real").props["data-loading"],
        undefined,
        "REGRESSION: the page dimmed, over the period it already showed, until a read behind it landed",
      );
      await land();
      redraw();
      tree = redraw();
      assert.deepEqual(period.asked, ["30d", "month", "30d"], "Month's read, and the read behind the held 30 days");
      assert.equal(chosen(tree), "30 days", "Month's answer, for a period left, is dropped");
      assert.equal(failedLine(tree), null, "and nothing failed");
    });
  } finally {
    globalThis.location.pathname = was;
  }
});

test("Month is a period of its own: its tab, its read by that name, and the page says the days it holds", async () => {
  await inPeriodTest("hold", async () => {
    let tree = page();
    assert.deepEqual(
      control(tree).props.options.map((o) => o.label),
      ["7 days", "30 days", "90 days", "Month"],
    );
    choose(tree, "Month");
    assert.deepEqual(period.asked, ["month"]);
    await land();
    redraw();
    tree = redraw();
    assert.equal(chosen(tree), "Month");
    assert.equal(failedLine(tree), null, "nothing failed");
  });
});

test("REGRESSION (C28): a card with a table saves it as a CSV -- the numbers were on screen and nowhere else", async () => {
  const saved = [];
  const clicked = [];
  const real = { create: URL.createObjectURL, revoke: URL.revokeObjectURL, el: globalThis.document.createElement };
  URL.createObjectURL = (blob) => {
    saved.push(blob);
    return "blob:report";
  };
  URL.revokeObjectURL = () => {};
  globalThis.document.createElement = (tag) => ({
    tag,
    style: {},
    setAttribute() {},
    click() {
      clicked.push({ href: this.href, download: this.download });
    },
    remove() {},
  });
  try {
    const tree = page();
    press(byTestId(card(tree, "chart-campaigns"), "card-csv"));
    assert.deepEqual(
      clicked,
      [{ href: "blob:report", download: "sent-day-by-day.csv" }],
      "REGRESSION: no way to take the table",
    );
    const bytes = new Uint8Array(await saved[0].arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "a spreadsheet reads it as UTF-8");
    const lines = (await saved[0].text()).replace(String.fromCharCode(0xfeff), "").split("\r\n");
    assert.equal(
      lines[0],
      "Day,Sent,Delivered,Answered,Said yes,Asked to stop",
      "each cell spelled by contracts' csvCell; the header is the table twin's, one string, and it counts messages: Answered",
    );
    assert.equal(lines.length, 8, "the header and a row a day, as the Table view shows");
    assert.equal(
      byTestId(card(tree, "chart-booking"), "card-csv"),
      null,
      "chart-booking: no CSV where there is no table",
    );
    // The funnel is a mix like the others: its bars have a table twin, and so a CSV of its own, in messages.
    assert.deepEqual(
      cardOfPage(tree, "chart-funnel").props.table.columns,
      ["What happened", "Messages"],
      "chart-funnel: its table says messages",
    );
    assert.ok(byTestId(card(tree, "chart-funnel"), "card-csv"), "chart-funnel: and so its CSV");
  } finally {
    URL.createObjectURL = real.create;
    URL.revokeObjectURL = real.revoke;
    globalThis.document.createElement = real.el;
  }
});

test("REGRESSION: a tile is a number, what it is and one line under it; the head says the period and its days once (#557)", () => {
  const tree = page();
  assert.equal(
    all(byTestId(tree, "reports-tiles"), (n) => n.type === "div" && classes(n).includes("rpt-cell")).length,
    5,
    "the Overview's strip is five cells; the Campaigns lens draws two of its own",
  );
  assert.equal(
    find(tree, (n) => /spark|delta/.test(String(n.props?.className || ""))),
    null,
    "REGRESSION: a sparkline and a percentage delta in every tile",
  );
  const head = byTestId(seen(tree), "reports-period");
  // The period is the segmented control's chosen option (the stub draws a Base UI part as a leaf, so its words are read from its props).
  assert.ok(
    head &&
      find(head, (n) => n.type === Segmented) &&
      chosen(head) === "7 days" &&
      textOf(cls(head, "rpt-dates")) === "Aug 29 – Sep 4",
    `the period and its days: ${textOf(head)}`,
  );
  const said = textOf(tree);
  assert.ok(!said.includes("What AI handled"), "REGRESSION: a sub-headline under a title the top bar already says");
  assert.ok(!said.includes("Reports"), "and the page does not title itself");
});

test("REGRESSION (C25): Reports says what the campaigns sent, not what offers earned -- a visit reminder is no offer", () => {
  const said = textOf(page());
  assert.ok(
    !said.includes("offers earned") && !said.includes("yes to offers"),
    "REGRESSION: offers over visit reminders",
  );
  assert.ok(said.includes("Sent") || said.includes("sent"), "the lens still says what a campaign sent");
  // The lens's own words are the fold's: a yes or a stop is the answer to a message of yours, within its reply window.
  const own = textOf(card(page(), "campaigns-strip"));
  assert.ok(own.includes("after a message of yours, within 3 days"), own);
  assert.doesNotMatch(own, /offer/i);
});

test("Reports draws a Deals section where deals are on and a deal was recorded: the headline, what became of the cohort in the kit's bars, the lines beside them, the stock", () => {
  // The bridge publishes contracts' DealReportVM (0004, 0008) from the route's report; nothing where deals are off or
  // none was ever recorded, so a workspace whose customers book never grows a section of zeros.
  const none = page({ deals: NO_DEALS });
  assert.equal(byTestId(none, "rpt-deals"), null, "nothing where no deal was ever recorded");
  assert.equal(byTestId(none, "rpt-deals-outcomes"), null);
  const tree = page({ deals: DEALS });
  const section = byTestId(tree, "rpt-deals");
  assert.ok(section, "its own section");
  assert.equal(textOf(byTestId(section, "rpt-deals-headline")), "5 proposals went out in the last 7 days.");
  const bars = byTestId(section, "rpt-deals-outcomes");
  assert.ok(classes(bars).includes("ck-card"), "the kit's card");
  assert.equal(textOf(cls(bars, "ck-card-title")), "What became of the proposals");
  const rows = all(bars, (n) => classes(n).includes("ck-barlist-row"));
  assert.deepEqual(
    rows.map((r) => [textOf(cls(r, "ck-barlist-label")), textOf(cls(r, "ck-barlist-value"))]),
    [
      ["Became clients", "3  60%"],
      ["Still waiting", "1  20%"],
      ["Passed", "1  20%"],
    ],
  );
  const drawn = all(bars, (n) => classes(n).includes("ck-barlist-bar")).map((b) => b.props.style);
  assert.deepEqual(
    drawn.map((s) => s.width),
    ["60%", "20%", "20%"],
    "each bar out of the proposals sent, not out of the largest outcome",
  );
  assert.ok(
    drawn.every((s) => s.background === "var(--chart-1)"),
    "the kit's one data hue, no colour of its own",
  );
  assert.deepEqual(
    all(byTestId(section, "rpt-deals-lines"), (n) => n.type === "li").map((l) => [l.props["data-line"], textOf(l)]),
    [
      ["median", "Median 9 days to a yes."],
      ["sources", "2 of 3 new clients came from Leads."],
      ["reasons", "Price was the reason given for passing."],
      ["open", "$4,250 still open across 3 proposals."],
    ],
  );
  assert.equal(textOf(byTestId(section, "rpt-deals-stock")), "4 clients now · $7,500 a month.");
  // Each fact once and nothing more: the section is the headline, the card, the lines and the stock (no title drawn).
  assert.equal(
    textOf(section),
    [
      "5 proposals went out in the last 7 days.",
      "What became of the proposals",
      "Became clients",
      "3  60%",
      "Still waiting",
      "1  20%",
      "Passed",
      "1  20%",
      "Median 9 days to a yes.",
      "2 of 3 new clients came from Leads.",
      "Price was the reason given for passing.",
      "$4,250 still open across 3 proposals.",
      "4 clients now · $7,500 a month.",
    ].join(""),
  );
  // Inside the Deals section only: the five tiles stay five, and none of the copy the e2e holds Reports to appears.
  assert.equal(
    all(byTestId(tree, "reports-tiles"), (n) => n.type === "div" && classes(n).includes("rpt-cell")).length,
    5,
  );
  for (const s of ["Revenue", "Lead sources", "Where bookings come from"]) assert.ok(!textOf(tree).includes(s), s);
});

test("a period no proposal went out in draws no bars: the headline, what is still open in the column, and the stock", () => {
  const tree = page({
    deals: toDealReportVM(dealsDto({ clients: 2, open: { count: 2, amounts: [] } }), "in the last 7 days"),
  });
  const section = byTestId(tree, "rpt-deals");
  assert.equal(textOf(byTestId(section, "rpt-deals-headline")), "No proposals went out in the last 7 days.");
  assert.equal(byTestId(section, "rpt-deals-outcomes"), null, "no bars of nothing");
  const lines = byTestId(section, "rpt-deals-lines");
  assert.deepEqual(all(lines, (n) => n.type === "li").map(textOf), ["2 proposals still open."]);
  assert.ok(!classes(lines).includes("rpt-span-7"), "no card to sit beside: the lines take the column");
  assert.equal(textOf(byTestId(section, "rpt-deals-stock")), "2 clients now.");
  const bare = page({ deals: toDealReportVM(dealsDto({ clients: 1 }), "in the last 7 days") });
  assert.equal(byTestId(bare, "rpt-deals-lines"), null, "nothing more to say: no lines");
  assert.equal(textOf(byTestId(bare, "rpt-deals-stock")), "1 client now.");
});

test("REGRESSION: a period nobody wrote or called in still says its deals -- the section sat inside the branch for a period with messages, so a workspace whose deals are made in meetings saw none", () => {
  const tree = page({
    report: quiet(),
    deals: toDealReportVM(dealsDto({ sent: 1, waiting: 1, open: { count: 1, amounts: [] } }), "in the last 7 days"),
  });
  assert.ok(card(tree, "reports-empty"), "the period is still said to be quiet");
  assert.ok(byTestId(tree, "rpt-deals"), "and the deals are there beside it");
  assert.equal(textOf(byTestId(tree, "rpt-deals-headline")), "1 proposal went out in the last 7 days.");
  assert.ok(byTestId(tree, "rpt-deals-outcomes"), "with what became of it");
  assert.equal(
    byTestId(page({ report: quiet(), deals: NO_DEALS }), "rpt-deals"),
    null,
    "a quiet workspace whose customers book grows nothing",
  );
});

test("REGRESSION: recording a deal re-reads Reports as well as People -- an open session kept the Deals section's old numbers until a reload", async () => {
  const { AFTER } = await importSrc("apps/dashboard/src/bridge/refresh-map.ts");
  // And the audiences with them (W3): a deal moved changes the deal lists and who a follow-up reaches, read where a page draws them
  // and left for those pages from Reports, which draws neither (S10-6).
  assert.deepEqual(
    AFTER["POST contacts/[id]/deal"]().map((o) => o.key),
    ["people", "reports"],
  );
});

test("on a desk the period is the head's act on every lens, its days then its button, and the page draws no row of its own", () => {
  for (const path of LENS_PATHS) {
    setLensAt(path);
    const tree = pageOnce();
    const group = byTestId(standingSaid()?.act, "reports-period");
    assert.ok(classes(group).includes("rpt-period"), `${path}: the period, said to the head as its act`);
    const kids = group.props.children.filter(Boolean);
    assert.equal(textOf(kids[0]), "Aug 29 – Sep 4", `${path}: the days it covers first`);
    assert.ok(
      find(kids.at(-1), (n) => n.type === Popover),
      `${path}: then the button that opens it, at the row's end`,
    );
    assert.equal(all(tree, (n) => classes(n).includes("rpt-head")).length, 0, `${path}: no period row in the page`);
    assert.equal(byTestId(tree, "reports-period"), null, `${path}: the period once, in the head`);
  }
  setLensAt(LENS_PATHS[0]);
});

test("on a phone the period is the button alone beside the strip, on every lens; the page draws no row of its own", () => {
  onAPhone(() => {
    for (const path of LENS_PATHS) {
      setLensAt(path);
      const tree = pageOnce();
      const group = byTestId(standingSaid()?.act, "reports-period");
      assert.equal(
        find(group, (n) => n.type === Popover)?.props.trigger.props["data-testid"],
        "reports-period-open",
        `${path}: the button, the head's act beside the strip`,
      );
      assert.equal(cls(group, "rpt-dates"), null, `${path}: a phone has room for the button alone`);
      assert.equal(all(tree, (n) => classes(n).includes("rpt-head")).length, 0, `${path}: no period row in the page`);
    }
  });
  setLensAt(LENS_PATHS[0]);
});
