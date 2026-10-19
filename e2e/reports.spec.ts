import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";
import { routeOf } from "./address";

/**
 * Reports, on a real workspace: one App Router page of lenses (`/w/<slug>/reports`, the Overview, and
 * `/w/<slug>/reports/<lens>`), with the frame's chrome around it (decision 0015, and the lenses spec).
 *
 * The Overview: the receptionist's share of the answered as a meter beside Worth knowing, and a strip of five figures compared
 * with the period before in counts; then each lens's cards, each with a table twin, and nothing in dollars. Read-only: the
 * date range only issues a GET. It is the page's act at the right of the strip of lenses (the frame's row), outside the
 * page's own element: a capsule that says what the page is on and opens the four periods, three windows reached in one
 * press, and a month to pick any days on. Days a member picked are the address's (`reports/<lens>:<from>~<to>`), so a
 * link opens on them and Back walks them; they need 00360 on the database the app reads.
 *
 * The Receptionist lens draws its strip and its first cards from the frame's read and the rest from a read of its own
 * (`GET reports/receptionist`, 00380): the hold, the topics, how calls ended, the time between steps and what is stuck now.
 * The nightly's workspace holds the rows those draw (tooling/scripts/ops/e2e-workspace.mjs, convergeReceptionist), so every
 * card has something to say; what they say is the unit tests', and here it is that each is drawn, from the right read. It
 * keeps no opening hours (its config has no profile), so "answered while you were closed" asks for them. A database without
 * 00380 answers that route `series: null` and the lens draws its kept cards and none of its own parts: the spec reads which
 * of the two it is on and asserts the cards that database can draw.
 *
 * The People lens has two halves in one read (`GET reports/people`): the window (00395: who reached you and how many were new, how
 * they came, the yeses and stops, the steps done on time) and the book as it stands now (how fresh it is, where they stand, the
 * steps overdue). The nightly's workspace holds the rows the window counts (e2e-workspace.mjs, convergePeople: a yes for each of
 * its three people on the ledger, and three steps the owner finished) and no open step, so the book's steps overdue is a count
 * the seed does not set; what each part says is the unit tests', and here it is that each is drawn and agrees with the read. A
 * database without 00395 answers `series: null`: the lens draws the book and its kept cards and no window card.
 *
 * The Campaigns lens draws the sends' own read (`GET reports/campaigns`: the funnel, the day card, the channels and the sources) and
 * two of its own: the window beyond the sends' counts (`GET reports/campaigns/ledger`, 00405: the people reached and who wrote back,
 * what was held and why, each message's replies, the time between steps) and what is stuck now (the same route's `stuck`, 00406),
 * and with them the reach-outs (`GET reports/reach-outs`). The nightly's workspace holds one run that went out three days ago to
 * its three people (e2e-workspace.mjs, convergeCampaigns: Casey's message delivered and answered, Sam's read, Robin held back
 * because a person had his thread, and the owner's approval), no run waiting and no message failed. A database without 00405
 * answers `series: null` and one without 00406 `stuck: null`: the lens then draws the sends' cards and none of that read's,
 * and says nothing failed.
 */
const INVENTED = [
  "Revenue",
  "Agent performance",
  "Segment health",
  "Lead sources",
  "Where bookings come from",
  "Your judgment layer",
  "Phone Rep",
  "Share",
];

/**
 * What the Reviews lens draws from its own read once it has landed: the figures of the listing and Business Profile the nightly's
 * workspace is seeded with (tooling/scripts/ops/e2e-workspace.mjs). What they say is google.spec.ts's.
 */
const reviewsLens = (page: Page) => page.getByTestId("google-tiles");

/** The days of a report the way `GET reports` carries them, and the four counts of them that must agree. */
type ReportDay = Record<"messages_in" | "answered_ai" | "answered_you" | "unanswered", number>;

/**
 * Whether this database has the lens's own read (`receptionist_series`, 00380), as the route says it: a database without it
 * answers `series: null`, and the lens then draws the cards of the frame's read (its kept cards) and none of its own parts.
 */
async function hasReceptionistSeries(page: Page): Promise<boolean> {
  const res = await apiGet(page, "/api/v1/reports/receptionist?period=30d");
  expect(res.status()).toBe(200);
  const { series } = (await res.json()).data as { series: unknown };
  return series !== null;
}

/**
 * What the Receptionist lens draws once its own read has landed, on the nightly's workspace (e2e-workspace.mjs,
 * convergeReceptionist: a week of Sam Example's conversation, two handovers resolved, a call nobody took and a send held at
 * the door). The strip is the frame's four figures; the hold, the topics, how calls ended, the time between steps and what
 * is stuck are the lens's own read, so they are waited for. A reason it stopped is no door (the Inbox takes no reason), and
 * "Needs you" is the Inbox's. The workspace has set no opening hours, so the closed figure is not a number: it says
 * "—", asks for the hours, and its door is the page where they are set.
 *
 * And the automated email in Sam's conversation is a customer message by its row and nobody's words by its claim, so it is
 * in no count: the strip's customer messages are the period's, as the report carries them, and the report's own parts agree
 * (a message asked is answered by the receptionist, by you or by nobody). The number is read, never written here: the
 * nightly's other specs add and remove messages, and the sum is what the seed and the specs together made.
 */
async function theReceptionistLens(page: Page, report: Locator) {
  const own = await hasReceptionistSeries(page);
  const kept = ["receptionist-strip", "chart-answered", "chart-reasons", "chart-calls", "chart-reply"];
  for (const id of kept) await expect(report.getByTestId(id), id).toBeVisible({ timeout: 20_000 });
  if (!own) {
    for (const id of ["chart-hold", "chart-topics", "receptionist-stuck"])
      await expect(report.getByTestId(id), `${id}: no receptionist_series on this database`).toHaveCount(0);
  } else {
    for (const id of ["chart-hold", "chart-topics", "chart-call-endings", "receptionist-time", "receptionist-stuck"])
      await expect(report.getByTestId(id), id).toBeVisible({ timeout: 20_000 });
  }

  const figures = report.getByTestId("receptionist-strip").locator(".figure");
  await expect(figures).toHaveCount(4);
  const labels = (await figures.locator(".figure-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
  expect(labels).toEqual(["customer messages", "receptionist answered", "median reply time", "needed you"]);

  await expect(report.getByTestId("chart-reasons").locator("button.ck-barlist-row"), "no reason is a door").toHaveCount(
    0,
  );
  if (own) {
    await expect(report.getByTestId("chart-hold")).toContainText(/went out as the hold ended/i);

    const stuck = report.getByTestId("receptionist-stuck");
    const waiting = stuck
      .locator(".figure")
      .filter({ has: page.locator(".figure-label", { hasText: /^needs you$/i }) });
    await expect(waiting.locator(".figure-value"), "a count, and 0 where nobody waits").toHaveText(/^\d+\+?$/);
    await expect(waiting.locator('a[href$="/inbox"]'), "and the Inbox is its door").toHaveCount(1);

    // The steps after a reply are one strip; each figure is found by the metric it says (data-figure on the figure's root).
    const closed = report.getByTestId("receptionist-figures").locator('.figure[data-figure="answered_while_closed"]');
    await expect(closed, "no hours are set: the figure is there to ask for them").toBeVisible();
    await expect(closed.locator(".figure-value")).toHaveText("—");
    await expect(closed.locator(".figure-meta")).toContainText("set your opening hours to see this");
    // Its door is Settings › Hours & booking, where the hours are set, by the page's path (appLink: admin/hours is
    // settings/hours).
    await expect(closed.locator('a[href$="/settings/hours"]'), "and its door is where they are set").toHaveCount(1);
  }

  const res = await apiGet(page, "/api/v1/reports?period=30d");
  expect(res.status()).toBe(200);
  const { report: dto } = (await res.json()).data as { report: { days: number; series: ReportDay[] } };
  const days = dto.series.slice(-dto.days);
  const sum = (key: keyof ReportDay) => days.reduce((n, d) => n + d[key], 0);
  const persons = sum("messages_in");
  expect(persons, "the seed's people wrote to the workspace").toBeGreaterThan(0);
  expect(
    sum("answered_ai") + sum("answered_you") + sum("unanswered"),
    "every message asked is answered by someone or by nobody",
  ).toBe(persons);
  const shown = /^\d+/.exec((await figures.first().locator(".figure-value").innerText()).trim());
  expect(Number(shown?.[0]), "the strip counts the same persons' words").toBe(persons);
}

/**
 * The parts of `GET reports/people` this spec reads (contracts' PeopleDto): the window's people reached, and the book's count of
 * the Said yes to messages list. `series` is null on a database without the window's read (00395), and `now` where the book
 * could not be counted.
 */
type PeopleRead = {
  series: { reached: { now: { people: number } } } | null;
  now: { lists: { opted_in: number; quiet: number } } | null;
};

async function readPeople(page: Page): Promise<PeopleRead> {
  const res = await apiGet(page, "/api/v1/reports/people?period=30d");
  expect(res.status()).toBe(200);
  return (await res.json()).data as PeopleRead;
}

/**
 * Whether this database has the lens's own window (`people_series`, 00395), as the route says it: a database without it answers
 * `series: null`, and the lens then draws the book and its kept cards and no window card.
 */
async function hasPeopleSeries(page: Page): Promise<boolean> {
  return (await readPeople(page)).series !== null;
}

/** The figure of a strip with this label, found by what it says. */
const figureLabelled = (strip: Locator, page: Page, label: RegExp) =>
  strip.locator(".figure").filter({ has: page.locator(".figure-label", { hasText: label }) });

/**
 * What the People lens draws once its own read has landed, on the nightly's workspace (e2e-workspace.mjs, convergePeople: a yes
 * for each of its three people a week ago, and three steps finished, none open). The kept cards (the rhythm and the new people
 * adding up) and the book are drawn either way: the book is counted from the people, and it needs no function of the
 * database's. The window (the strip, how they came by channel, how the new ones first came, the yeses and stops, the steps done
 * and the email that stopped working) is 00395's, so on a database without it no window card is drawn and nothing failed.
 *
 * The numbers are read, never written here: the nightly's other specs write to the workspace, and the sum is what the seed
 * and they together made. The strip's first figure is the read's people reached; the stand's Said yes to messages is the
 * read's list, and the seed's three people said yes to messages.
 */
async function thePeopleLens(page: Page, report: Locator) {
  const { series, now } = await readPeople(page);
  expect(now, "the nightly's workspace has people the book can count").not.toBeNull();
  const kept = ["chart-rhythm", "chart-people"];
  const book = ["chart-people-wires", "chart-people-fresh", "people-stuck", "people-stand"];
  const windowCards = [
    "people-strip",
    "chart-people-channels",
    "chart-people-first",
    "chart-people-yeses",
    "chart-people-stops",
    "people-time",
    "chart-people-steps",
    "chart-people-bounced",
  ];
  for (const id of [...kept, ...book]) await expect(report.getByTestId(id), id).toBeVisible({ timeout: 20_000 });
  for (const id of ["people-failed", "people-now-failed"])
    await expect(report.getByTestId(id), `${id}: both reads were made`).toHaveCount(0);
  if (series === null) {
    for (const id of windowCards)
      await expect(report.getByTestId(id), `${id}: no people_series on this database`).toHaveCount(0);
  } else {
    for (const id of windowCards) await expect(report.getByTestId(id), id).toBeVisible({ timeout: 20_000 });

    const figures = report.getByTestId("people-strip").locator(".figure");
    await expect(figures).toHaveCount(4);
    const labels = (await figures.locator(".figure-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
    expect(labels).toEqual(["people who reached you", "new people", "yeses won", "stops"]);
    await expect(
      report.getByTestId("chart-people-channels").locator("button.ck-barlist-row"),
      "no channel is a door",
    ).toHaveCount(0);

    const reached = /^\d+/.exec((await figures.first().locator(".figure-value").innerText()).trim());
    expect(Number(reached?.[0]), "the strip counts the people the read counted").toBe(series.reached.now.people);
    expect(series.reached.now.people, "the seed's people wrote to the workspace").toBeGreaterThanOrEqual(1);
  }

  // The book, as it stands now: where they stand has a door to each list, and the steps are a count with a door.
  const stand = figureLabelled(report.getByTestId("people-stand"), page, /^said yes to messages$/i);
  const yes = /^\d+/.exec((await stand.locator(".figure-value").innerText()).trim());
  expect(Number(yes?.[0]), "the stand counts the people the read counted").toBe(now?.lists.opted_in);
  expect(now?.lists.opted_in, "the seed's three people said yes to messages").toBeGreaterThanOrEqual(3);
  await expect(stand.locator('a[href*="seg:opted_in"]'), "and it opens that list").toHaveCount(1);

  // The seed holds no open step, but a spec that failed halfway may have left one: a count, and a door to the list either way.
  const overdue = figureLabelled(report.getByTestId("people-stuck"), page, /^steps overdue$/i);
  await expect(overdue.locator(".figure-value"), "a count, and 0 where no step is past its day").toHaveText(/^\d+$/);
  await expect(overdue.locator('a[href*="seg:steps_due"]'), "and the Steps due list is its door").toHaveCount(1);

  // The quiet door is there for the people who have been quiet, and not otherwise.
  await expect(report.getByTestId("people-quiet-door"), "a door to the Quiet list where someone is quiet").toHaveCount(
    now && now.lists.quiet > 0 ? 1 : 0,
  );
}

/**
 * The parts of `GET reports/campaigns/ledger` this spec reads (contracts' CampaignLedgerDto): the window's people sent to (a person
 * once, however many runs sent to them) and what is stuck now. `series` is null on a database without the window's read (00405)
 * and `stuck` on one without what is stuck (00406), or where that read failed.
 */
type CampaignsRead = {
  series: { people: { now: { sent_to: number } } } | null;
  stuck: object | null;
};

/** The lens's own read, in which each of its two halves says whether the database has it: a database without 00405 or 00406 answers null for it. */
async function readCampaigns(page: Page): Promise<CampaignsRead> {
  const res = await apiGet(page, "/api/v1/reports/campaigns/ledger?period=30d");
  expect(res.status()).toBe(200);
  return (await res.json()).data as CampaignsRead;
}

/**
 * What the Campaigns lens draws once its reads have landed, on the nightly's workspace (e2e-workspace.mjs, convergeCampaigns: one
 * run to its three people three days ago, two messages delivered or read, a reply, Robin held back, an approval; no run waiting and
 * no message failed). The funnel, the day card and the sources are the sends' own read and are drawn either way; the strip of five
 * figures, how many were held and why, the messages' replies and the time between steps are the ledger's (00405), and the strip of
 * what is stuck now is the second half's (00406): on a database without either, those cards are not drawn and nothing failed.
 * The reach-outs are drawn exactly where the workspace has one.
 *
 * The numbers are read, never written here: the nightly's other specs write to the workspace, and the sum is what the seed and
 * they together made. The strip's first figure is the read's people sent to, and the seed's run went to two. Runs waiting for you
 * is a count, not a zero: the seed holds none, but a spec that failed halfway may have left one.
 */
async function theCampaignsLens(page: Page, report: Locator) {
  const { series, stuck } = await readCampaigns(page);
  for (const id of ["chart-funnel", "chart-sources", "chart-campaigns"])
    await expect(report.getByTestId(id), id).toBeVisible({ timeout: 20_000 });
  // A run went out in the 30 days, so this lens is not the quiet one, and every read it made was answered.
  await expect(report.getByTestId("chart-campaigns-quiet"), "a run went out in the 30 days").toHaveCount(0);
  for (const id of ["campaigns-failed-campaigns", "campaigns-failed-ledger", "campaigns-failed-stuck", "ro-failed"])
    await expect(report.getByTestId(id), `${id}: every read was made`).toHaveCount(0);

  const windowCards = [
    "chart-campaigns-held",
    "chart-campaigns-stopped",
    "chart-campaigns-by-message",
    "campaigns-time",
    "chart-campaigns-first-reply",
    "chart-campaigns-approval",
    "chart-campaigns-failed-why",
  ];
  const figures = report.getByTestId("campaigns-strip").locator(".figure");
  if (series === null) {
    for (const id of windowCards)
      await expect(report.getByTestId(id), `${id}: no campaign_ledger on this database`).toHaveCount(0);
    await expect(figures, "the ledger's two figures are not drawn").not.toHaveCount(5);
  } else {
    for (const id of windowCards) await expect(report.getByTestId(id), id).toBeVisible({ timeout: 20_000 });
    await expect(figures).toHaveCount(5);
    const labels = (await figures.locator(".figure-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
    expect(labels).toEqual(["people sent to", "delivered", "wrote back", "said yes", "asked to stop"]);

    const sentTo = /^\d+/.exec((await figures.first().locator(".figure-value").innerText()).trim());
    expect(Number(sentTo?.[0]), "the strip counts the people the read counted").toBe(series.people.now.sent_to);
    expect(series.people.now.sent_to, "the seed's run went to two people").toBeGreaterThanOrEqual(2);

    // Robin was held back because a person had his thread, and nothing the run sent failed: the card says so in its own words.
    await expect(report.getByTestId("chart-campaigns-held")).toContainText("A person had the thread");
    await expect(report.getByTestId("chart-campaigns-failed-why")).toContainText(
      "No sent message failed in this period.",
    );
  }

  // What is stuck now: five figures, a count of the runs waiting with the Campaigns home for its door, and the number's health.
  const stuckNow = report.getByTestId("campaigns-stuck");
  if (stuck === null) {
    await expect(stuckNow, "no campaign_stuck on this database").toHaveCount(0);
  } else {
    await expect(stuckNow).toBeVisible({ timeout: 20_000 });
    await expect(stuckNow.locator(".figure")).toHaveCount(5);
    const waiting = figureLabelled(stuckNow, page, /^runs waiting for you$/i);
    await expect(waiting.locator(".figure-value"), "a count, and 0 where no run waits").toHaveText(/^\d+$/);
    await expect(waiting.locator('a[href*="campaigns"]'), "and Campaigns is its door").toHaveCount(1);
    await expect(
      figureLabelled(stuckNow, page, /^your whatsapp number$/i),
      "the number's health is drawn",
    ).toBeVisible();
  }

  // The reach-outs are drawn where the workspace has one, and only there.
  const res = await apiGet(page, "/api/v1/reports/reach-outs?period=30d");
  expect(res.status()).toBe(200);
  const { report: reachOuts } = (await res.json()).data as { report: { has_reach_out: boolean } };
  if (reachOuts.has_reach_out) await expect(report.getByTestId("rpt-reach-outs")).toBeVisible({ timeout: 20_000 });
  else await expect(report.getByTestId("rpt-reach-outs")).toHaveCount(0);
}

test.describe("Reports on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the Overview: the headline, five tiles, one period control above everything, no money; each lens its own cards with table twins", async ({
    page,
  }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const report = page.getByTestId("reports-real");
    await expect(report).toBeVisible();

    const text = await report.innerText();
    for (const s of INVENTED) expect(text, `invented copy: "${s}"`).not.toContain(s);
    expect(text, "revenue has no column").not.toMatch(/\$\d/);

    await expect(report.getByTestId("reports-hero")).toContainText("answered by your receptionist");

    const tiles = report.getByTestId("reports-tiles").locator(".figure");
    await expect(tiles).toHaveCount(5);
    const labels = (await tiles.locator(".figure-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
    expect(labels).toEqual(["customer messages", "calls", "new people", "booked", "needed you"]);
    // A count (or a dash with no calendar), and the period before in counts when it had some: never a percentage.
    for (const v of await tiles.locator(".figure-value").allInnerTexts()) {
      expect(v.trim()).toMatch(
        /^(\d+|—)\s*(up from \d+|down from \d+|same as the \d+ days before|none the \d+ days before)?$/,
      );
    }

    await expect(page.locator(".pg-act-slot").getByTestId("reports-period"), "at the strip's right").toBeVisible();
    await expect(page.getByTestId("reports-period-open"), "it says the period it is on").toHaveText("30 days");
    await page.getByTestId("reports-period-open").click();
    const range = page.getByRole("dialog", { name: "Date range" });
    await expect(range).toBeVisible();
    await expect(range.getByRole("radiogroup", { name: "Period" }).getByRole("radio"), "the four periods").toHaveCount(
      4,
    );
    await expect(page.getByTestId("period-30d")).toHaveAttribute("aria-checked", "true");
    // The days it reads, and no line comparing them (#1530: the presets drawn alike, no comparison line).
    await expect(page.getByTestId("reports-period-range")).toHaveText(/\S+ \d+ – \S+ \d+/);
    await expect(page.getByTestId("reports-period-before")).toHaveCount(0);
    // The days reached in one press are a track of their own, none of them chosen while a period is.
    await expect(range.getByRole("radiogroup", { name: "Other days" }).getByRole("radio")).toHaveCount(3);
    for (const id of ["yesterday", "last-week", "last-month"])
      await expect(page.getByTestId(`period-${id}`), "days reached in one press").toHaveAttribute(
        "aria-checked",
        "false",
      );
    await expect(range.getByRole("grid", { name: "Days" }), "and a month to pick any days on").toBeVisible();
    await page.keyboard.press("Escape");
    await expect(range).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ask about this period" }), "the period asks nothing").toHaveCount(0);

    // A workspace nobody reached in the period has one honest card instead of the charts, and no Worth knowing.
    if (await report.getByTestId("reports-empty").count()) {
      await expect(report.getByTestId("reports-facts")).toHaveCount(0);
      return;
    }
    await expect(report.getByTestId("reports-facts")).toContainText("Worth knowing");
    // The campaign that drew the most replies is one fact of the three the list keeps, so it is there only if a source had replies
    // (the sends' own read, which the Overview draws it from); a list that has room for it is the unit tests' to say.
    const sends = await apiGet(page, "/api/v1/reports/campaigns?period=30d");
    expect(sends.status()).toBe(200);
    const { report: sent } = (await sends.json()).data as { report: { sources?: Array<{ replied: number }> } };
    if (!(sent.sources ?? []).some((s) => s.replied > 0))
      await expect(report.getByTestId("reports-facts"), "no source had a reply").not.toContainText(
        "drew the most replies",
      );
    // The receptionist's lens: who answered, with a table twin.
    await page.getByTestId("lens-receptionist").click();
    const main = report.getByTestId("chart-answered");
    await expect(main).toBeVisible();
    if (await main.locator(".empty").count()) {
      await expect(main.getByText("No customer messages in this period")).toBeVisible();
    } else {
      for (const who of ["Receptionist", "You", "Unanswered"])
        await expect(main.locator(".ck-legend-item", { hasText: who })).toHaveCount(1);
      await expect(main.locator("svg").first()).toBeVisible();
    }
    // Either way it has a table twin.
    await main.hover();
    await main.getByTestId("card-table").click();
    await expect(main.locator("table")).toBeVisible();
    for (const id of ["chart-reply", "chart-reasons", "chart-calls", "chart-booking"]) {
      await expect(report.getByTestId(id), id).toBeVisible();
    }
    // The rest of the lens is a read of its own: the hold, the topics, how calls ended, the time between steps, what is stuck.
    await theReceptionistLens(page, report);
    // The People lens: its kept cards and its book either way, its window from a read of its own (who reached you, how they came,
    // the yeses and stops, the steps done), and the numbers the read counted.
    await page.getByTestId("lens-people").click();
    await thePeopleLens(page, report);
    // The Campaigns lens: the sends' own cards either way, its window and what is stuck from reads of its own (the people the run
    // reached, what was held and why, the time between steps), and the reach-outs where the workspace has one.
    await page.getByTestId("lens-campaigns").click();
    await theCampaignsLens(page, report);
    // Reviews is shown to every workspace, and draws from a read of its own: here, a listing's.
    await page.getByTestId("lens-reviews").click();
    await expect(reviewsLens(page)).toBeVisible();
  });

  test("Reports is a page of its own on its path: it boots there, the frame around it, and the router walks it", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);

    // A load of the path boots the frame with Reports lit and the page drawn inside it.
    await page.goto("/api/version");
    await page.goto(`/w/${slug}/reports`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("Reports");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    expect(routeOf(page.url())).toBe("reports");

    // Away to a route the frame's own table draws, and Back: the router lands on Reports again, and the page is there.
    await page.locator(".nav-item", { hasText: "Today" }).click();
    await expect.poll(() => routeOf(page.url())).toBe("today");
    await expect(page.getByTestId("reports-real")).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe("reports");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    await page.goForward();
    await expect.poll(() => routeOf(page.url())).toBe("today");

    // And to Reports by the sidebar: a route with a page of its own asks the router, and the frame stays.
    await page.locator(".nav-item", { hasText: "Reports" }).click();
    await expect.poll(() => routeOf(page.url())).toBe("reports");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("Reports");

    // A lens is an address on this one page: the strip's tabs are links, and a press moves the address without a request for a page.
    const documents: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "document") documents.push(r.url());
    });
    await expect(page.getByTestId("reports-lenses")).toBeVisible();
    await page.getByTestId("lens-receptionist").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports/receptionist");
    await expect(page.getByTestId("chart-answered")).toBeVisible();
    await expect(page.getByTestId("reports-hero")).toHaveCount(0);
    await page.getByTestId("lens-people").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports/people");
    await expect(page.getByTestId("chart-people-wires")).toBeVisible({ timeout: 20_000 });
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe("reports/receptionist");
    await expect(page.getByTestId("chart-answered")).toBeVisible();
    await page.getByTestId("lens-overview").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports");
    await expect(page.getByTestId("reports-hero")).toBeVisible();
    expect(documents, "a move between lenses is never a page request").toEqual([]);

    // A lens address loads on its own, the frame around it; the Overview is `reports` and `reports/overview` is no address.
    await page.goto(`/w/${slug}/reports/campaigns`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    // The funnel, not the day card alone: the lens's three states (quiet, failed, drawn) have each a card of their own now.
    await expect(page.getByTestId("chart-funnel")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("lens-campaigns")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("reports-period-open"), "the lens opened on the default period").toHaveText(
      "30 days",
    );
    // A pick of another period on it reads the lens's ledger for the period asked (its window and what is stuck are the ledger's)
    // and requests no page.
    documents.length = 0;
    const campaignsRead = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname.endsWith("/api/v1/reports/campaigns/ledger") &&
        r.url().includes("period=7d") &&
        r.method() === "GET",
    );
    await page.getByTestId("reports-period-open").click();
    await page.getByTestId("period-7d").click();
    await campaignsRead;
    await page.getByTestId("reports-period-open").click();
    await expect(page.getByTestId("period-7d")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    expect(documents, "a pick of another period is never a page request").toEqual([]);
    // The pick is kept by the page (REPORT_PERIOD_STORAGE), and the Reviews address below picks 7 days itself: the stored period is
    // cleared, or that lens would open on 7 days, its read would be over before it is waited for, and its pick would read nothing.
    await page.evaluate(() => localStorage.removeItem("chanlytics.report.period"));
    await page.goto(`/w/${slug}/reports/reviews`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-real")).toBeVisible();
    await expect(page.getByTestId("lens-reviews")).toHaveAttribute("aria-current", "page");
    // The address read its own surface as it loaded: the lens is drawn, not waiting on the other lenses' reads.
    await expect(reviewsLens(page)).toBeVisible();
    // A pick of another period on it reads (the lens's own, for the period asked) and requests no page.
    documents.length = 0;
    const reviewsRead = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname.endsWith("/api/v1/reports/reviews") &&
        r.url().includes("period=7d") &&
        r.method() === "GET",
    );
    await page.getByTestId("reports-period-open").click();
    await page.getByTestId("period-7d").click();
    await reviewsRead;
    await page.getByTestId("reports-period-open").click();
    await expect(page.getByTestId("period-7d")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    expect(documents, "a pick of another period is never a page request").toEqual([]);
    // The Receptionist lens is an address too: it loads on its own, reads its own surface as it loads (a card from that read
    // is drawn, not waiting on the other lenses'), and a pick of another period reads that route for the period. The Reviews
    // block above picked 7 days, which the page keeps (REPORT_PERIOD_STORAGE) and opens on: the stored period is cleared first,
    // or this lens would open on 7 days, its read would be over before it is waited for, and a pick of 7 days would read nothing.
    await page.evaluate(() => localStorage.removeItem("chanlytics.report.period"));
    await page.goto(`/w/${slug}/reports/receptionist`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-real")).toBeVisible();
    await expect(page.getByTestId("lens-receptionist")).toHaveAttribute("aria-current", "page");
    // On a database without 00380 no card is of that read: the frame's own card stands in as the lens's proof it is drawn.
    await expect(
      page.getByTestId((await hasReceptionistSeries(page)) ? "receptionist-stuck" : "chart-reply"),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("reports-period-open"), "the lens opened on the default period").toHaveText(
      "30 days",
    );
    documents.length = 0;
    const receptionistRead = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname.endsWith("/api/v1/reports/receptionist") &&
        r.url().includes("period=7d") &&
        r.method() === "GET",
    );
    await page.getByTestId("reports-period-open").click();
    await page.getByTestId("period-7d").click();
    await receptionistRead;
    await page.getByTestId("reports-period-open").click();
    await expect(page.getByTestId("period-7d")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    expect(documents, "a pick of another period is never a page request").toEqual([]);
    // The People lens is an address too, and reads its own surface as it loads. The block above picked 7 days, which the page
    // keeps: the stored period is cleared again, or the lens would open on 7 days and a pick of 7 days would read nothing.
    await page.evaluate(() => localStorage.removeItem("chanlytics.report.period"));
    await page.goto(`/w/${slug}/reports/people`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-real")).toBeVisible();
    await expect(page.getByTestId("lens-people")).toHaveAttribute("aria-current", "page");
    // On a database without 00395 the window's card is not drawn: the book is the proof the lens's own read was drawn.
    await expect(page.getByTestId((await hasPeopleSeries(page)) ? "people-strip" : "chart-people-wires")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("reports-period-open"), "the lens opened on the default period").toHaveText(
      "30 days",
    );
    documents.length = 0;
    const peopleRead = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname.endsWith("/api/v1/reports/people") &&
        r.url().includes("period=7d") &&
        r.method() === "GET",
    );
    await page.getByTestId("reports-period-open").click();
    await page.getByTestId("period-7d").click();
    await peopleRead;
    await page.getByTestId("reports-period-open").click();
    await expect(page.getByTestId("period-7d")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    expect(documents, "a pick of another period is never a page request").toEqual([]);
    await page.goto(`/w/${slug}/reports/overview`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-real")).toHaveCount(0);
    await page.goto(`/w/${slug}/reports/anything`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-real")).toHaveCount(0);

    // The Pipeline's lens is every workspace's: its empty state where no deal was recorded, never a not-found.
    await page.goto(`/w/${slug}/reports/pipeline`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("rpt-deals").or(page.getByTestId("lens-empty"))).toBeVisible();
  });

  test("changing the period asks the API for that window and keeps the frame while it loads", async ({ page }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const report = page.getByTestId("reports-real");
    await expect(report).toBeVisible();

    const req = page.waitForRequest(
      // The Reports read alone: a pick also reads `reports/headline` (Today's line) and the Overview's one campaign fact (`reports/campaigns`, its
      // ledger and `reports/reach-outs`, the Campaigns lens's reads), and the first of those is no answer.
      (r) =>
        new URL(r.url()).pathname.endsWith("/api/v1/reports") && r.url().includes("period=7d") && r.method() === "GET",
    );
    await page.getByTestId("reports-period-open").click();
    await page.getByTestId("period-7d").click();
    const seen = await req;
    expect(seen.url()).toContain("workspace=");
    await expect(page.getByTestId("period-7d"), "a press of a period closes the popover").toBeHidden();
    await page.getByTestId("reports-period-open").click();
    await expect(page.getByTestId("period-7d")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(report.getByTestId("reports-hero")).toBeVisible();
  });

  test("days picked on the month are the address's: read by their first and last day, kept across a lens, Back and a reload, and a period takes them out again", async ({
    page,
  }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("reports-real")).toBeVisible();
    const open = page.getByTestId("reports-period-open");
    const days = /^reports\/(\d{4}-\d{2})-10~\1-12$/;

    // The month before this one always holds its 10th and its 12th, and neither is a day to come.
    await open.click();
    const range = page.getByRole("dialog", { name: "Date range" });
    await range.getByRole("button", { name: "Previous month" }).click();
    const day = (n: number) =>
      range.locator(".date-pick-cell:not([data-outside]) > .date-pick-day").filter({ hasText: new RegExp(`^${n}$`) });
    await day(10).click();
    await expect(range.locator(".date-pick-hint"), "a first press chooses nothing").toContainText("Press the last day");
    expect(routeOf(page.url()), "and moves nothing").toBe("reports");
    const read = page.waitForRequest((r) => {
      const u = new URL(r.url());
      return (
        u.pathname.endsWith("/api/v1/reports") &&
        /-10$/.test(u.searchParams.get("from") ?? "") &&
        /-12$/.test(u.searchParams.get("to") ?? "")
      );
    });
    await day(12).click();
    await read;
    await expect.poll(() => routeOf(page.url())).toMatch(days);
    await expect(open, "the capsule says the days").toHaveText(/^\S+ 10 – 12$/);
    await expect(range, "a pick closes the popover").toBeHidden();
    await expect(page.locator(".rpt-failed"), "they were read").toHaveCount(0);
    await open.click();
    await expect(range.getByRole("radio", { checked: true }), "and none of the four periods is these days").toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
    await expect(range).toBeHidden();

    // Another lens is the same days there, and Back walks the ranges a member looked at: the lens before, then the period.
    const peopleOverDays = /^reports\/people:\d{4}-\d{2}-10~\d{4}-\d{2}-12$/;
    await page.getByTestId("lens-people").click();
    await expect.poll(() => routeOf(page.url())).toMatch(peopleOverDays);
    await expect(open).toHaveText(/^\S+ 10 – 12$/);
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toMatch(days);
    await expect(open).toHaveText(/^\S+ 10 – 12$/);
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe("reports");
    await expect(open, "an address with no days is the period kept").toHaveText("30 days");
    // Forward to the days again, and a link to them (the address, loaded afresh) opens on them.
    await page.goForward();
    await page.goForward();
    await expect.poll(() => routeOf(page.url())).toMatch(peopleOverDays);
    await expect(open).toHaveText(/^\S+ 10 – 12$/);
    await page.reload();
    await expect(page.getByTestId("reports-real")).toBeVisible({ timeout: 30_000 });
    await expect(open, "a link to days opens on them").toHaveText(/^\S+ 10 – 12$/);
    await expect(page.locator(".rpt-failed"), "and says nothing failed").toHaveCount(0);

    // A window reached in one press is days like any picked, and a period by name takes the days out of the address.
    await open.click();
    await page.getByTestId("period-yesterday").click();
    await expect.poll(() => routeOf(page.url())).toMatch(/^reports\/people:(\d{4}-\d{2}-\d{2})~\1$/);
    await expect(open).toHaveText("Yesterday");
    await expect(range, "a press of a shortcut closes the popover too").toBeHidden();
    await open.click();
    await expect(page.getByTestId("period-yesterday")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("period-30d").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports/people");
    await expect(open).toHaveText("30 days");
    await expect(range, "and a press of a period").toBeHidden();
    await open.click();
    await expect(page.getByTestId("period-30d")).toHaveAttribute("aria-checked", "true");
  });

  test("asked, then booked: the share from the calendar, the calendar's own sentence, or a read that failed", async ({
    page,
  }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("chart-booking");
    if (await card.count()) {
      await expect(card).toContainText(
        /have an appointment on the calendar|Nobody asked|Add a calendar link|Couldn't read your calendar/,
      );
    } else {
      // An empty period shows one card instead of the sections; the route still carries the line.
      const res = await apiGet(page, "/api/v1/reports?period=30d");
      expect((await res.json()).data).toHaveProperty("booking");
    }
  });
});
