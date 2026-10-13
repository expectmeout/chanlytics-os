import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute, routeOf } from "../address";
import { apiGet } from "../workspace";
import { openPeekedPage, openPersonPage } from "../person-page";

/**
 * People, on a real workspace.
 *
 * The mockup's Clients page carried sixty invented people with health scores,
 * lifetime value, packages and therapists. None of those columns exist. A
 * signed-in session must see the workspace's actual people, described only
 * in facts the schema holds, with the Tier 2 tabs (Leads, Deal board, Lists)
 * absent rather than leading to a Coming Soon card.
 *
 * Read-only against real data, like the rest of the signed-in specs.
 */

/** Words that only ever described invented numbers. */
const INVENTED_VOCABULARY = [
  "LTV",
  "Health index",
  "Total book",
  "Active touches",
  "therapist",
  "Sessions left",
  "Cadence",
  "Temperature",
];
/** People who exist only in the design seeds. */
const INVENTED_PEOPLE = [
  "Aisha Khan",
  "David Chen",
  "@thewellness.co",
  "Maya Rodriguez",
  "Gabby Moreno",
  "Jordan Patel",
];

async function assertMeasuredOnly(page: Page, where: string) {
  const text = await page.locator("body").innerText();
  for (const word of INVENTED_VOCABULARY) {
    expect(text, `${where} shows a number the schema does not hold: "${word}"`).not.toContain(word);
  }
  for (const who of INVENTED_PEOPLE) {
    expect(text, `${where} shows an invented person: "${who}"`).not.toContain(who);
  }
  // A customer's own words may name a price ("can you do it for $150?"); the facts and cells may not.
  for (const cell of await page.locator(".stat-cell, td, .cl-attn-status").allInnerTexts())
    expect(cell, `${where} shows a dollar amount, and revenue has no column`).not.toMatch(/\$\d/);
}

/**
 * How many People holds, said where Glass says it: the frame's head, its sentence under the page's name. The page's own
 * standing line (people-standing) is that sentence now, and drawn on a phone alone (clients.css, "The page's standing
 * line is the head's sentence now"); it stays in the page hidden, so a count of it still tells a real page from none.
 */
const headSentence = (page: Page) => page.locator(".pg-head .pg-sentence");
const PEOPLE_SAID = /\d+ (person|people)\b/;

test.describe("People on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the list is the workspace's people, in facts only, under its scopes' strip and no other", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    await expect(headSentence(page)).toContainText(PEOPLE_SAID);
    await assertMeasuredOnly(page, "#/clients");

    // The seeded strip offered Leads, Deal board and Lists. Leads and the deal board are seed data; Lists is a
    // view of People now (its rail, a sheet on a phone). The one strip over the list is People's own scopes, drawn by
    // the frame (surfaces/people/chrome.ts): People and Leads, and the Pipeline where deals are on.
    await expect(page.locator(".stabs")).toHaveCount(1);
    expect((await page.getByTestId("people-scope").locator(".stabs-tab").allInnerTexts()).slice(0, 2)).toEqual([
      "People",
      "Leads",
    ]);

    // The table's columns are the measured ones.
    // innerText follows the CSS text-transform, so compare case-insensitively.
    // The headings a desktop shows: a column the member turned off is not built. A sortable heading ends in its caret (↕),
    // or its arrow once it is the sort (▲ ▼).
    const headers = (await page.locator(".cl-table thead th").allInnerTexts())
      .map((h) => h.replace(/[▲▼↕]/g, "").trim().toLowerCase())
      // The row's acts have a name for a screen reader alone, and the checkbox none.
      .filter((h) => h && h !== "actions");
    const cal = ((await (await apiGet(page, "/api/v1/contacts")).json()).data as { calendar?: { state: string } })
      .calendar;
    // With a calendar connected Visits is a column; the checkbox and the actions columns have no words.
    // The first column is Person: a page called People (B19); "Customer" was the mockup's word. Four are on until a member
    // turns them off, Person, State, the next step (8 Oct 2026) and the last contact (9 Oct 2026: Reach, Offers, the
    // receptionist, Came from and the rest wait in the Columns menu, so the table fits a laptop's pane).
    expect(headers).toEqual([
      "person",
      "state",
      "next step",
      "last contact",
      ...(cal?.state === "ok" ? ["visits"] : []),
    ]);
    // One state switcher: the rail, and the count in the line above. The tab row
    // and the five-tab strip are both gone.
    await expect(page.locator(".cl-section-head .cl-tabs")).toHaveCount(0);
    await expect(page.getByTestId("attention-strip")).toHaveCount(0);

    // Every state pill is one of the six.
    const pills = await page.locator(".cl-row-bucket-pill").allInnerTexts();
    for (const p of pills)
      expect(["needs you", "you have it", "opted out", "new", "quiet", "active"]).toContain(p.trim().toLowerCase());

    // The one line's count equals the rows shown when nothing is filtered, and
    // it is the only place the page says it besides the table's own foot.
    const shown = await page.locator(".cl-table tbody tr:not(:has(.empty))").count();
    const standing = (await headSentence(page).innerText()).trim();
    expect(standing).toMatch(new RegExp(`^${shown} (person|people)\\b`));
    await expect(page.locator(".cl-head-stats")).toHaveCount(0);
  });

  test("a profile opens from the list and is a timeline, not a form", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to open");

    await openPersonPage(page, rows.first());
    await expect(page).toHaveURL(atRoute(/^clients\/[0-9a-f-]{36}$/));
    await assertMeasuredOnly(page, "the profile");

    // Who they are, then what is happening, then everything that happened. The Last exchange card quoted the
    // two newest messages the timeline opens on, and a six-cell strip said the rail's facts again.
    await expect(page.getByText("Last exchange")).toHaveCount(0);
    await expect(page.locator(".cl-prof-money")).toHaveCount(0);
    // Where they stand is one line under the name now, the standing's word and its sentence. What happened is the
    // History tab, an address of its own (0052), its count on the tab rather than in a row of facts.
    await expect(page.getByTestId("person-now")).toBeVisible();
    const history = page.getByTestId("person-tab-history");
    await expect(history).toBeVisible();

    // The page fills the pane and is one scroll: the profile was as wide as its content, 304px short at 1667.
    const pane = (await page.locator(".cl-profile").boundingBox())!;
    const main = (await page.locator(".main").boundingBox())!;
    expect(Math.round(pane.width), "the profile is as wide as the pane it sits in").toBe(Math.round(main.width));

    // What the card under the name says is not said again as a row of facts.
    const keys = (await page.locator(".cl-prof-attr-key").allInnerTexts()).map((k) => k.trim());
    for (const said of ["Phone", "Channels", "First contact"])
      expect(keys, `${said} is said under the name`).not.toContain(said);

    // One button to the thread: the header's Open thread and Right now's Open in Inbox went to the same place.
    expect(
      await page.locator(".cl-profile button", { hasText: /^(Open thread|Open in Inbox|Open the thread)$/ }).count(),
    ).toBeLessThanOrEqual(1);

    // The History tab is the timeline, at the person's address with its word; the tab replaces the entry, so Back
    // below still leaves the person.
    await history.click();
    await expect(page).toHaveURL(atRoute(/^clients\/[0-9a-f-]{36}\/history$/));
    await expect(page.locator(".cl-prof-section-title", { hasText: "History" })).toBeVisible();

    // Between 901 and 1250px the name's column went to zero beside the header's buttons. The column, not the
    // name: a name's own box is only as wide as its letters, and passes while the column around it is broken.
    await page.setViewportSize({ width: 1000, height: 800 });
    const column = (await page.locator(".cl-prof-name-line").first().boundingBox())!;
    expect(column.width, "the name's column keeps its width at 1000px").toBeGreaterThan(150);

    // Back returns to the list, not to a "client not found" page. In Glass the page draws no way back of its own: the
    // frame's head draws it where the date stands (‹ People, kit/head/frame-head.tsx), so that is pressed.
    await page.locator(".pg-back", { hasText: "People" }).click();
    await expect(headSentence(page)).toContainText(PEOPLE_SAID);
  });

  // Runs for real only where deals are on (0008: the workspace answers that some customers get a proposal first): the
  // seeded nightly workspace answers that its customers book, so this skips there until the seed says otherwise (the
  // owner's call). On the local harness there is no People surface at all, so it skips too. Nothing is sent: the walk
  // records with the sheet's send turned off.
  test("a deal is recorded through the one sheet: the person's Deal section starts a proposal, the sheet records it without sending, and the card says it", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    // The real People page stands on its standing line; the local harness has no People surface and draws the
    // seeded page instead, whose profile never opens. Only the real page has a person to record a deal on.
    test.skip(
      (await page.getByTestId("people-standing").count()) === 0,
      "People is not real here: the local harness draws the seeded page",
    );
    const rows = page.locator(".cl-table tbody tr:not(:has(.empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to open");
    await openPersonPage(page, rows.first());
    const section = page.getByTestId("person-deal");
    if ((await section.count()) === 0) {
      // Deals are off here (0008: the workspace answers that its customers book, or was never asked): nothing is drawn.
      test.skip(true, "deals are off on this workspace (it answers that its customers book)");
      return;
    }
    // The deal says itself once, in its section: no Deal row among the card's settings, no Proposal row in About.
    await expect(page.getByTestId("rec-row-person-deal")).toHaveCount(0);
    await expect(page.locator(".cl-prof-attr-key", { hasText: /^Proposal$/ })).toHaveCount(0);
    const start = page.getByTestId("person-deal-start");
    test.skip(
      (await start.count()) === 0 || (await start.innerText()).trim() !== "Start a proposal",
      "the first person already has a proposal out or an engagement running",
    );
    await start.click();
    const sheet = page.getByTestId("rec-sheet-deal-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".rec-sheet-title")).toHaveText("New proposal");
    await sheet.getByTestId("deal-sheet-link-input").fill("docs.example.com/p/e2e-walk");
    // Recorded, never sent: the switch goes off where it is on, and Save says so.
    const send = sheet.getByTestId("deal-sheet-send-switch");
    if ((await send.getAttribute("aria-checked")) === "true") await send.click();
    await expect(page.getByTestId("rec-sheet-save-deal-sheet")).toHaveText("Record");
    await page.getByTestId("rec-sheet-save-deal-sheet").click();
    // Production records it, the sheet closes and the card says the proposal; a refused write stays in the sheet and
    // says why.
    await expect(async () => {
      const recorded = (await sheet.count()) === 0 && (await page.getByTestId("person-deal-card").count()) > 0;
      const refused = (await sheet.count()) > 0 && (await sheet.getByRole("alert").count()) > 0;
      expect(recorded || refused).toBe(true);
    }).toPass();
    if ((await sheet.count()) === 0) {
      const card = page.getByTestId("person-deal-card").first();
      await expect(card.getByTestId("person-deal-link")).toHaveText("docs.example.com");
      await expect(card.getByTestId("person-deal-link")).toHaveAttribute("href", "https://docs.example.com/p/e2e-walk");
      await expect(card.getByTestId("person-deal-fact").first()).toHaveText("Not sent yet");
    }
  });

  test("a profile deep link to a stranger's id says so instead of inventing a person", async ({ page }) => {
    await page.goto("/#/clients/00000000-0000-4000-8000-000000000000");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("This person is not in your workspace")).toBeVisible();
    await assertMeasuredOnly(page, "a missing profile");
  });

  test("Booked and Asked-never-booked exist only with a calendar, as facts; Leads and the Deal board land on People", async ({
    page,
  }) => {
    const list = await apiGet(page, "/api/v1/contacts");
    const body = (await list.json()).data as { people: Array<{ visits?: unknown }>; calendar?: { state: string } };
    expect(body.calendar).toBeTruthy();
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const smart = await page.locator(".cl-rail-row.smart").allInnerTexts();
    const has = (label: string) => smart.some((t) => t.includes(label));
    if (body.calendar?.state === "ok") {
      expect(has("Booked"), "a connected calendar shows the outcome lists").toBe(true);
      expect(has("Asked, never booked")).toBe(true);
      // Booked is the rail's list now; the four stat cards above the table are gone.
      await expect(page.locator(".cl-rail-row.smart", { hasText: "Booked" }).first()).toBeVisible();
      // Every green day in the Visits column belongs to a person the route says has an appointment ahead.
      const ahead = body.people.filter((p) => (p.visits as { next?: unknown } | null)?.next).length;
      await expect(page.locator('[data-testid="row-next-visit"] .cl-row-next')).toHaveCount(ahead);
      // The rail is grouped, and Booked this week and Lapsed exist.
      await expect(page.getByTestId("rail-group-journey")).toBeVisible();
      expect(has("Booked this week") && has("Lapsed")).toBe(true);
      // A list's next step waits for a recorded yes.
      await page.locator(".cl-rail-row.smart", { hasText: "Asked, never booked" }).click();
      await expect(page.getByTestId("list-action")).toBeVisible();
      await expect(page.getByTestId("list-action")).toContainText(/said yes|Nobody/);
      await expect.poll(() => routeOf(page.url())).toBe("clients/seg:asked_never_booked");
    } else {
      expect(has("Booked")).toBe(false);
      expect(has("Asked, never booked")).toBe(false);
    }
    // Leads came back on 18 Sep 2026 as a scope of People, so its old address
    // lands on that scope; the Deal board still lands on the list of clients.
    for (const [gone, lands, said] of [
      ["leads", "clients/leads", /\d+ leads?\b/],
      ["pipeline", "clients", PEOPLE_SAID],
    ] as const) {
      await page.goto(`/#/${gone}`);
      await expect.poll(() => routeOf(page.url()), { message: `${gone} retires into People` }).toBe(lands);
      // The Leads scope says its own standing, not People's: the old address lands on the scope, not beside it.
      await expect(headSentence(page)).toContainText(said);
    }
  });

  // People › Pipeline (0008) is a scope of People only where deals are on. The nightly workspace answers that its
  // customers book, so there it has no tab and its address draws People; where deals are on, the tab opens it.
  test("the Pipeline is a third scope of People only where deals are on, at clients/pipeline", async ({ page }) => {
    const body = (await (await apiGet(page, "/api/v1/contacts")).json()).data as { deals_on?: boolean };
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    test.skip(
      (await page.getByTestId("people-standing").count()) === 0,
      "People is not real here: the local harness draws the seeded page",
    );
    await expect(page.getByTestId("scope-people")).toBeVisible();
    const tab = page.getByTestId("scope-pipeline");
    if (!body.deals_on) {
      await expect(tab, "a workspace whose customers book is never offered a Pipeline").toHaveCount(0);
      await page.goto("/#/clients/pipeline");
      await expect(headSentence(page)).toContainText(PEOPLE_SAID);
      await expect(page.getByTestId("pipeline")).toHaveCount(0);
      await expect.poll(() => routeOf(page.url()), { message: "People's own address takes its place" }).toBe("clients");
      return;
    }
    await tab.click();
    await expect.poll(() => routeOf(page.url())).toBe("clients/pipeline");
    await expect(page.getByTestId("pipeline")).toBeVisible();
    await expect(page.getByTestId("scope-pipeline")).toHaveAttribute("aria-current", "page");
    // Its rows are People's, grouped; a row opens its person's deal in a peek beside the rows, whose door opens their
    // page. Nothing is recorded: the peek is read.
    const rows = page.locator('[data-testid="pipeline"] .pl-table tbody tr[id^="person-"]');
    if ((await rows.count()) > 0) {
      await rows.first().click();
      const peek = page.getByTestId("pipeline-peek");
      await expect(peek).toBeVisible();
      await expect(peek.getByTestId("pipeline-peek-name")).not.toBeEmpty();
      await expect(page.locator(".cl-prof-name"), "the Pipeline is still the page under the peek").toHaveCount(0);
      await peek.getByTestId("pipeline-peek-page").click();
      await expect(page.locator(".cl-prof-name")).toBeVisible();
    }
  });

  // The Pipeline on its path (decision 0015, step 5): `/w/<slug>/people/pipeline` boots the page under People's own route, and
  // its addresses -- a view, a person open over it -- are entries of the one page: a pick pushes, Back walks them, and a
  // reload keeps them. Where deals are off, the same path is People's own list.
  test("the Pipeline is on its path: it boots there, keeps its view and the person open over it, and Back walks them", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
    const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);
    const body = (await (await apiGet(page, "/api/v1/contacts")).json()).data as { deals_on?: boolean };

    await page.goto("/api/version");
    await page.goto(`/w/${slug}/people/pipeline`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.nav-item[aria-current="page"]')).toContainText("People");
    if (!body.deals_on) {
      await expect(headSentence(page)).toContainText(PEOPLE_SAID);
      await expect(page.getByTestId("pipeline")).toHaveCount(0);
      return;
    }
    await expect(page.getByTestId("pipeline")).toBeVisible();
    expect(routeOf(page.url())).toBe("clients/pipeline");
    expect(new URL(page.url()).pathname).toBe(`/w/${slug}/people/pipeline`);

    // A rail row is a new place: its address is pushed under the same path, and the page is the one already there.
    await page.getByTestId("pipeline-rail-row-proposals").click();
    await expect.poll(() => routeOf(page.url())).toBe("clients/pipeline:v-proposals");
    await expect(page.getByTestId("pipeline")).toBeVisible();
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe("clients/pipeline");
    await expect(page.getByTestId("pipeline")).toBeVisible();
    await page.goForward();
    await expect.poll(() => routeOf(page.url())).toBe("clients/pipeline:v-proposals");

    // A reload of the address keeps the view; a row opens its peek, which the address says, and Back closes.
    await page.reload();
    await expect(page.getByTestId("pipeline")).toBeVisible({ timeout: 30_000 });
    expect(routeOf(page.url())).toBe("clients/pipeline:v-proposals");
    const rows = page.locator('[data-testid="pipeline"] .pl-table tbody tr[id^="person-"]');
    if ((await rows.count()) > 0) {
      await rows.first().click();
      await expect(page.getByTestId("pipeline-peek")).toBeVisible();
      await expect.poll(() => routeOf(page.url())).toMatch(/^clients\/pipeline:v-proposals:p-/);
      await page.goBack();
      await expect(page.getByTestId("pipeline-peek")).toHaveCount(0);
      await expect.poll(() => routeOf(page.url())).toBe("clients/pipeline:v-proposals");
    }

    // Away to People's list by its own tab and back to the Pipeline by the sidebar's People and the tab.
    await page.getByTestId("scope-people").click();
    await expect.poll(() => routeOf(page.url())).toBe("clients");
    await expect(page.getByTestId("pipeline")).toHaveCount(0);
    await page.getByTestId("scope-pipeline").click();
    await expect.poll(() => routeOf(page.url())).toBe("clients/pipeline");
    await expect(page.getByTestId("pipeline")).toBeVisible();
  });

  test("a state and a saved list are linkable: the address opens the view, and the view writes the address", async ({
    page,
  }) => {
    await page.goto("/#/clients/state:quiet");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("state-filter")).toContainText("Quiet");
    await page.getByTestId("state-filter").locator("button").click();
    await expect.poll(() => routeOf(page.url())).toBe("clients");
    const saved = (
      (await (await apiGet(page, "/api/v1/segments")).json()).data as { lists: Array<{ id: string; name: string }> }
    ).lists;
    if (saved.length) {
      await page.goto(`/#/clients/list:${saved[0].id}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("saved-filter")).toContainText(saved[0].name);
    }
  });

  test("a selection becomes a list or a yes on record — the requests are the real ones, intercepted", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const boxes = page.getByTestId("row-select");
    test.skip((await boxes.count()) < 2, "this workspace has fewer than two people");
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    const bar = page.getByTestId("bulk-bar");
    await expect(bar).toContainText("2 selected");

    const seen: { method: string; url: string; body: unknown }[] = [];
    // Registered FIRST, so it runs LAST: a write to a person or a list that no
    // handler below answers is stopped here instead of reaching the workspace.
    // This spec signs in to a live workspace. When #426 moved "Record a yes" to
    // one batch request, the per-person route this test had stopped matching,
    // and every nightly run recorded a real consent, in person, on two real
    // customers. A door that moves again now fails the counts below, and the
    // person it would have written to is left alone.
    const stopped: string[] = [];
    await page.route(/\/api\/v1\/(?:contacts|segments)(?:[/?#]|$)/, async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        await route.continue();
        return;
      }
      stopped.push(`${req.method()} ${new URL(req.url()).pathname}`);
      await route.abort();
    });
    await page.route("**/api/v1/segments*", async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        await route.continue();
        return;
      }
      seen.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { lists: [] } }),
      });
    });
    // Both consent doors, for one person or many, conversational or offers. The
    // batch door answers with counts (server/people/consent.ts), a person's with the row.
    await page.route(/\/api\/v1\/contacts\/(?:[^/?#]+\/)?(?:marketing-)?consent(?:[?#]|$)/, async (route) => {
      const req = route.request();
      const body = req.postDataJSON() as { ids?: unknown } | null;
      seen.push({ method: req.method(), url: req.url(), body });
      const ids = body?.ids;
      const data = Array.isArray(ids)
        ? { done: ids.length, failed: [], skipped: [] }
        : { contact_id: "intercepted", consent: "opted_in", dnc: false, source: "in_person" };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
    });

    // A new list from the bar: one POST with the name.
    await bar.getByRole("button", { name: "Add to list" }).click();
    await page.getByText("New list…").click();
    await page.getByTestId("bulk-list-name").fill("E2E bulk list");
    await page.getByTestId("bulk-list-name").press("Enter");
    await expect.poll(() => seen.filter((r) => r.method === "POST").length).toBe(1);
    expect(seen.find((r) => r.method === "POST")?.body).toEqual({ name: "E2E bulk list" });
    // The bar is busy until the create settles (the intercepted list is never found again, and it says so).
    await expect(page.getByTestId("bulk-list-name")).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Record a yes" })).toBeEnabled();

    // A yes for both: ONE request through the batch door, both people in it,
    // saying how it was given. The bar has not sent one request per person
    // since #426.
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await bar.getByRole("button", { name: "Record a yes" }).click();
    await page.getByText("In person", { exact: true }).click();
    const consentWrites = () => seen.filter((r) => r.url.includes("consent"));
    await expect.poll(() => consentWrites().length).toBe(1);
    const [yes] = consentWrites();
    expect(yes.method).toBe("PUT");
    expect(new URL(yes.url).pathname).toBe("/api/v1/contacts/consent");
    const sent = yes.body as { ids: string[]; consent: string; source: string };
    expect(sent).toEqual({ ids: sent.ids, consent: "opted_in", source: "in_person" });
    expect(new Set(sent.ids).size, "both selected people, once each").toBe(2);
    expect(stopped, "a write this spec did not answer was stopped before it reached the live workspace").toEqual([]);
  });

  test("the booking link is one step from a profile with a thread: the button lands on the thread", async ({
    page,
  }) => {
    const people = (
      (await (await apiGet(page, "/api/v1/contacts")).json()).data as {
        people: Array<{ id: string; has_chat: boolean | null; latest_conversation_id: string | null }>;
      }
    ).people;
    const withChat = people.find((p) => p.has_chat && p.latest_conversation_id);
    test.skip(!withChat, "nobody here has a WhatsApp thread");
    const detail = (await (await apiGet(page, `/api/v1/contacts/${withChat!.id}`)).json()).data.person as {
      booking_link?: string | null;
      visits?: { all?: unknown[] } | null;
    };
    test.skip(!detail.booking_link, "no booking link on file");
    await page.goto(`/#/clients/${withChat!.id}`);
    await expect(page.locator(".cl-prof-name")).toBeVisible();
    // The send is in the page's More menu, in plain words, beside the one button to the thread.
    await page.getByTestId("person-more").click();
    await page.getByRole("menuitem", { name: /Send booking link/ }).click();
    await expect.poll(() => routeOf(page.url())).toMatch(/^inbox\//);
  });

  test("the keyboard walks the rows: ↓ focuses, Enter opens the person, and the peek's door their profile", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to walk");
    await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.blur) el.blur();
    });
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".cl-table tbody tr.focused")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await openPeekedPage(page);
  });

  test("the page opens on its people: one line above the table, and the count in it is the tap that filters", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");

    // A title under a top bar that already says People, two sentences of
    // explanation, four stat cards and a five-tab strip stood in front of the
    // table; the strip drew the table's own first rows over again.
    await expect(page.locator(".cl-page-title")).toHaveCount(0);
    await expect(page.locator(".cl-head-stats")).toHaveCount(0);
    await expect(page.getByTestId("attention-strip")).toHaveCount(0);

    const standing = headSentence(page);
    await expect(standing).toBeVisible();
    await expect(standing).toContainText(PEOPLE_SAID);

    // The line sits above the table, and the table's first row is close behind it.
    const lineBox = (await standing.boundingBox())!;
    const tableBox = (await page.locator(".cl-table-wrap").boundingBox())!;
    expect(lineBox.y).toBeLessThan(tableBox.y);

    // When somebody needs a person the count is a button, and pressing it shows
    // exactly them -- the rail is hidden on a phone, so this is the way there.
    // On a desk the line is the head's sentence, words alone; the count is a tap where the page draws its own line.
    const needs = page.getByTestId("people-standing-needs");
    if (await needs.isVisible()) {
      const said = (await needs.innerText()).trim();
      const n = Number(said.split(" ")[0]);
      await needs.click();
      // Needs you is a list (decision 0009): the count opens it, by its own address.
      await expect.poll(() => routeOf(page.url())).toBe("clients/seg:needs_you");
      await expect(page.locator(".cl-table tbody tr:not(:has(.empty))")).toHaveCount(n);
      for (const p of await page.locator(".cl-row-bucket-pill").allInnerTexts())
        expect(p.trim().toLowerCase()).toBe("needs you");
      await needs.click();
      await expect.poll(() => routeOf(page.url())).toBe("clients");
    }

    // Every row still says its own words and its own state -- what the strip said.
    for (const row of await page.locator(".cl-table tbody tr:not(:has(.empty))").all()) {
      const words = row.getByTestId("row-words");
      if (await words.count()) expect((await words.innerText()).trim()).not.toMatch(/nothing written to quote/);
    }
  });

  test("the Columns menu shows and hides a column and stays open; the view it saves keeps the sort -- the save is intercepted", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Any other write to a view is stopped and noted, so a save that moved to another address can never write this
    // test's choices onto the member's real view. Registered first, so it runs last: the save expected below is
    // answered before it gets here, and anything that one does not answer falls back to this.
    const stopped: string[] = [];
    await page.route(/\/api\/v1\/views(?:[/?#]|$)/, async (route) => {
      const req = route.request();
      if (req.method() === "GET" || req.method() === "HEAD") {
        await route.continue();
        return;
      }
      stopped.push(`${req.method()} ${req.url()}`);
      await route.abort();
    });
    // Registered before the page loads, so no save from this test reaches the member's real view.
    const saved: Array<{ view?: { sortBy?: unknown; sortDir?: unknown; columns?: Record<string, boolean> } }> = [];
    await page.route(/\/api\/v1\/views\/people(?:[?#]|$)/, async (route) => {
      const req = route.request();
      if (req.method() !== "PUT") {
        await route.fallback();
        return;
      }
      saved.push(req.postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { views: {} } }),
      });
    });
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const headers = async () =>
      (await page.locator(".cl-table thead th").allInnerTexts())
        .map((h) => h.replace(/[▲▼↕]/g, "").trim().toLowerCase())
        .filter(Boolean);
    expect(await headers()).not.toContain("came from");
    await page.getByTestId("people-columns").click();
    // The kit's Menu of switches, drawn on the body (people/table/columns-menu.tsx).
    const menu = page.getByRole("menu", { name: "Columns" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitemcheckbox", { name: "Person" })).toHaveAttribute("aria-disabled", "true");
    await menu.getByRole("menuitemcheckbox", { name: "Came from" }).click();
    await expect(menu, "the menu stays open while a switch flips").toBeVisible();
    await expect.poll(headers).toContain("came from");
    // A write the catch-all stopped is the answer the poll shows, so a save that moved fails saying where it went.
    await expect
      .poll(() => (stopped.length ? stopped : saved.some((s) => s.view?.columns?.came_from === true)), {
        message: "the column's save reached the one address answered here",
      })
      .toBe(true);
    const last = saved[saved.length - 1];
    expect(typeof last.view?.sortBy, "the sort rides with the columns").toBe("string");
    expect(["asc", "desc"]).toContain(last.view?.sortDir);
    // Offers waits in the menu too: switched on, every cell is one of the three answers.
    await menu.getByRole("menuitemcheckbox", { name: "Offers" }).click();
    await expect.poll(headers).toContain("offers");
    for (const t of await page.getByTestId("row-offers").allInnerTexts())
      expect(["Yes", "No", "Not asked"]).toContain(t.trim());
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(
      page.getByTestId("people-columns"),
      "Esc puts focus back on the button that opened the menu",
    ).toBeFocused();
    expect(stopped, "every write to a view went to the one address answered here").toEqual([]);
  });

  test("the table gives every column the width it declares, fits a laptop's pane with its default columns, and a width dragged to is kept in the view", async ({
    page,
  }) => {
    // The view's save is answered here and noted, never sent: no choice of this test reaches the member's real view.
    const saved: Array<{ view?: { widths?: Record<string, number> } }> = [];
    await page.route(/\/api\/v1\/views\/people(?:[?#]|$)/, async (route) => {
      const req = route.request();
      if (req.method() !== "PUT") {
        await route.fallback();
        return;
      }
      saved.push(req.postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { views: {} } }),
      });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    test.skip(
      (await page.locator(".cl-table tbody tr:not(:has(.empty))").count()) === 0,
      "this workspace has nobody to show",
    );
    const scroller = page.getByTestId("people-table-scroll");
    const table = page.locator(".cl-table");
    await expect(table, "a desktop's table is a fixed layout").toHaveAttribute("data-fixed", "true");
    // The columns' widths add up to the table's box: nothing is left for the browser to hand to the wrong column, and the
    // table does not scroll sideways with its default columns beside the sidebar and the rail.
    const sums = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>("[data-testid='people-table-scroll']")!;
      const cols = [...document.querySelectorAll("table.cl-table colgroup col")].map((c) =>
        Number(c.getAttribute("width")),
      );
      return { box: box.clientWidth, over: box.scrollWidth - box.clientWidth, sum: cols.reduce((a, b) => a + b, 0) };
    });
    expect(sums.sum, "the columns add up to the table's box").toBe(sums.box);
    expect(sums.over, "no sideways scroll at 1440").toBeLessThanOrEqual(1);
    // A long word in a cell moves no column: widths are the columns' own.
    const widthsOf = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("table.cl-table thead th")].map((th) =>
          Math.round(th.getBoundingClientRect().width),
        ),
      );
    const before = await widthsOf();
    await page.evaluate(() => {
      const words = document.querySelector(".cl-row-words");
      if (words) words.textContent = "a very long line of what they said ".repeat(8);
    });
    expect(await widthsOf(), "a long line in a cell moves no column").toEqual(before);
    // A width dragged to: the edge of State's heading, by its keyboard (the arrows step it), is kept in the view saved.
    const edge = page.locator("thead th[data-key='state'] [role='slider']");
    await edge.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => saved.some((s) => typeof s.view?.widths?.state === "number")).toBe(true);
    const grown = (await page.locator("thead th[data-key='state']").boundingBox())!.width;
    expect(Math.round(grown), "State is wider by the two steps").toBeGreaterThanOrEqual(before[2]! + 30);
    await expect(scroller).toBeVisible();
    // Delete gives it back the width it was declared with, and the view drops the key.
    await page.keyboard.press("Delete");
    await expect.poll(() => saved.length && !saved[saved.length - 1]!.view?.widths).toBeTruthy();
    // The pointer: a press on the edge with no movement is no choice and saves nothing; a drag that goes somewhere is kept.
    const savedBefore = saved.length;
    const at = (await edge.boundingBox())!;
    await page.mouse.move(at.x + 5, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(saved.length, "a press with no movement saves nothing").toBe(savedBefore);
    await page.mouse.move(at.x + 5, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + 45, at.y + at.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect
      .poll(() => saved.some((v, i) => i >= savedBefore && typeof v.view?.widths?.state === "number"))
      .toBe(true);
  });

  test("on a desktop the table scrolls sideways under a pinned Person column, with a hairline once it has", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 800 });
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to show");
    const scroller = page.getByTestId("people-table-scroll");
    // Beside the sidebar and the rail the columns are wider than their box; the box used to cut them off.
    expect(
      await scroller.evaluate((el) => el.scrollWidth > el.clientWidth + 1),
      "the table scrolls sideways at 960px",
    ).toBe(true);
    await expect(scroller).not.toHaveClass(/\bscrolled\b/);
    const name = rows.first().locator("td.cl-name-cell");
    const heading = page.locator(".cl-table thead th.pl-pin");
    const before = { name: (await name.boundingBox())!, heading: (await heading.boundingBox())! };
    await scroller.evaluate((el) => {
      el.scrollLeft = 240;
    });
    await expect(scroller).toHaveClass(/\bscrolled\b/);
    const after = { name: (await name.boundingBox())!, heading: (await heading.boundingBox())! };
    expect(Math.round(after.name.x), "Person stays where it was").toBe(Math.round(before.name.x));
    expect(Math.round(after.heading.x), "and so does its heading").toBe(Math.round(before.heading.x));
    // K past the top: the row the cursor walks up to stops below the sticky header, not under it. The box's
    // scroll-padding-top is the header's height (--pl-head), so a taller header shows here as a row under it.
    await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.blur) el.blur();
    });
    const target = Math.min(3, (await rows.count()) - 1);
    for (let i = 0; i <= target; i += 1) await page.keyboard.press("j");
    await expect(page.locator(".cl-table tbody tr.focused")).toHaveCount(1);
    // The row above the cursor goes up out of the box, as far as the box scrolls.
    await scroller.evaluate(
      (el, above) => {
        const row = el.querySelectorAll("tbody tr")[above];
        if (row) el.scrollTop += row.getBoundingClientRect().bottom - el.getBoundingClientRect().top;
      },
      Math.max(0, target - 1),
    );
    await page.keyboard.press("k");
    const cursor = page.locator(".cl-table tbody tr.focused");
    await expect(cursor).toHaveCount(1);
    const head = (await page.locator(".cl-table thead th").first().boundingBox())!;
    expect((await cursor.boundingBox())!.y, "the row K walked up to stops below the header").toBeGreaterThanOrEqual(
      head.y + head.height - 1,
    );
    // Three people (the nightly's workspace) never make the box scroll, and then the walk above cannot fail: so the
    // rule itself is read too. The box's scroll padding is the header's height, whatever the number of rows.
    const pad = await scroller.evaluate((el) => getComputedStyle(el).scrollPaddingTop);
    expect(
      Math.abs(parseFloat(pad) - head.height),
      `the box's scroll padding (${pad}) is the header's height`,
    ).toBeLessThanOrEqual(0.5);
  });
  /**
   * People's head and Leads' are one head on a desktop (22 Sep). Measured on production at 1445px, they had drifted:
   * People's search sat 9px lower, its list's name 14px lower and its table 8px later, from a 28px floor on "N need
   * you" (a button in a line of plain words on Leads) and from two different rules for the space above and below the
   * list's name. This holds the two to the same geometry, measured from the top of each page's list pane: in Glass the
   * standing line is the frame's head, kept for a reader on a desk, so it is no edge to measure from (5 Oct: the line
   * hid, and People's table had drifted 8px again).
   */
  test("People's head and Leads' are the same head: the search, the rule, the list's name and the table land alike", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1445, height: 900 });
    const measure = async () =>
      page.locator(".clients").evaluate((root) => {
        const q = (s: string) => root.querySelector(s) as HTMLElement | null;
        // The list's pane, beside the rail under the strip, on both pages: the standing over it is the frame's head in
        // Glass, a 1px box kept for a reader on a desk, and the page's own line is hidden.
        const st = q(".cl-main");
        const ctl = q(".cl-controls");
        const search = q(".cl-controls .cl-search-wrap");
        const title = q(".cl-section-title");
        const table = q(".pl-table-wrap");
        if (!st || !ctl || !search || !title || !table) return null;
        const top = st.getBoundingClientRect().top;
        const at = (el: HTMLElement) => Math.round(el.getBoundingClientRect().top - top);
        const buttons = [...root.querySelectorAll(".cl-controls-right .btn")].map((b) =>
          Math.round(b.getBoundingClientRect().height),
        );
        return {
          search: at(search),
          searchHeight: Math.round(search.getBoundingClientRect().height),
          tallestButton: Math.max(...buttons),
          rule: Math.round(ctl.getBoundingClientRect().bottom - top),
          title: at(title),
          table: at(table),
        };
      });
    await page.goto("/#/clients");
    await page.locator(".clients:not(.leads-scope) .cl-section-title").waitFor();
    const people = await measure();
    await page.goto("/#/clients/leads");
    // A workspace with no leads yet draws its first day in place of the list head.
    const leadsHead = await page
      .locator(".leads-scope .cl-section-title")
      .waitFor({ timeout: 15_000 })
      .then(
        () => true,
        () => false,
      );
    test.skip(!leadsHead, "this workspace draws Leads' first day, not a list");
    const leads = await measure();
    test.skip(!people || !leads, "a head this workspace does not draw");
    // The search's height and the buttons' are each held equal on the two pages here. That the search was as tall as the
    // buttons was Classic's row (22 Sep): in Glass the search is a capsule of its own (canvas P1, clients.css).
    expect(leads, "REGRESSION: the two heads drifted -- a button's floor, and two rules for one gap").toEqual(people);
  });
});
