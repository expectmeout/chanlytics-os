import { test, expect, type Page } from "@playwright/test";
import {
  EVERYONE_LABEL,
  compareTemplates,
  groupTemplates,
  sendableTemplates,
  templateSlots,
} from "../../packages/contracts/src/index";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { apiGet } from "../workspace";

/**
 * Campaigns › Broadcasts on a real workspace.
 *
 * The route renders the real page, not the Coming Soon card. It opens on the
 * ledger (#758): the runs are what the route holds, and nothing is invented.
 * New broadcast opens the composer, its own screen: the audience chips carry
 * the count of people the send reaches, the templates are the ones the page can
 * send (or the honest line), and the number says what WhatsApp has said about
 * it. Sending is never done here — the workspace keeps no test broadcast — but
 * the send button must be disabled whenever nobody on the chosen audience has
 * said yes.
 */
const INVENTED = ["credits", "Booked from broadcasts", "April win-back", "Serenity"];
/** The finished runs the ledger shows before "All N sent" (broadcasts-real.jsx, `recent`). */
const LATEST_SHOWN = 5;

type TemplateRow = {
  name: string;
  language: string;
  channel: string;
  meta_status: string;
  variables: unknown;
  blocked?: string | null;
};

/** The composer is its own screen: New broadcast opens it in place of the ledger. */
async function openComposer(page: Page) {
  const real = page.getByTestId("broadcasts-real");
  await real.getByTestId("bc-new").click();
  const composer = real.getByTestId("bc-composer");
  await expect(composer).toBeVisible();
  return composer;
}

test.describe("Broadcasts on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders the real page from the workspace's rows, templates and audiences, and never invents a number", async ({
    page,
  }) => {
    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    const real = page.getByTestId("broadcasts-real");
    await expect(real).toBeVisible();

    const [bc, tpl, cfg] = await Promise.all([
      apiGet(page, "/api/v1/broadcasts"),
      apiGet(page, "/api/v1/templates"),
      apiGet(page, "/api/v1/settings"),
    ]);
    expect(bc.status()).toBe(200);
    expect(tpl.status()).toBe(200);
    expect(cfg.status()).toBe(200);
    const broadcasts = (await bc.json()).data.broadcasts as { state: string }[];
    const approved = ((await tpl.json()).data.templates as TemplateRow[]).filter(
      (t) => t.channel === "whatsapp" && t.meta_status === "approved",
    );
    const bookingLink = !!(await cfg.json()).data.config?.brain?.booking_link;

    // The ledger: every run still to go out, then the latest that went.
    // Open = still to go out: scheduled, sending, or a playbook run held for a person (the page's own rule).
    const open = broadcasts.filter(
      (b) => b.state === "scheduled" || b.state === "sending" || b.state === "pending_approval",
    ).length;
    await expect(real.getByTestId("bc-new")).toBeVisible();
    await expect(real.getByTestId("bc-open")).toHaveCount(open);
    await expect(real.getByTestId("bc-history")).toHaveCount(Math.min(broadcasts.length - open, LATEST_SHOWN));
    await expect(real.getByTestId("bc-empty")).toHaveCount(broadcasts.length === 0 ? 1 : 0);
    const ledger = await real.innerText();
    for (const s of INVENTED) expect(ledger, `invented on the ledger: "${s}"`).not.toContain(s);

    const composer = await openComposer(page);

    // Audiences: at least Everyone (contracts EVERYONE_LABEL), each with the count the send reaches.
    const chips = composer.getByTestId("bc-audience");
    expect(await chips.count()).toBeGreaterThanOrEqual(1);
    await expect(chips.first()).toContainText(EVERYONE_LABEL);

    // Templates: one chip per message the page can send, by contracts' own rules
    // over the route's rows -- a message in two languages is one chip, one the
    // wire cannot carry is left out and said so, and one a broadcast cannot fill
    // (the visit reminder) is left out -- or the honest line.
    const { sendable, why } = sendableTemplates(approved.slice().sort(compareTemplates));
    const offered = groupTemplates(sendable.filter((t) => templateSlots(t, { visits: false, bookingLink }) !== null));
    if (offered.length === 0) {
      await expect(composer.getByTestId("bc-no-template")).toBeVisible();
      await expect(composer.getByTestId("bc-template")).toHaveCount(0);
    } else {
      await expect(composer.getByTestId("bc-template")).toHaveText(offered.map((g) => g.title));
      await expect(composer.getByTestId("bc-preview")).toBeVisible();
    }
    if (why) await expect(composer.getByTestId("bc-blocked")).toHaveText(why);
    else await expect(composer.getByTestId("bc-blocked")).toHaveCount(0);

    // The number a broadcast goes out on, and what WhatsApp has said about it (in the composer's When column).
    const number = composer.getByTestId("bc-number");
    await expect(number).toBeVisible();
    await expect(number).toContainText(/quality|No WhatsApp number/);
    const numberLine = await number.innerText();

    const words = await real.innerText();
    for (const s of INVENTED) expect(words, `invented in the composer: "${s}"`).not.toContain(s);

    // A template can be written here: the composer opens, and nothing is submitted.
    if (/WhatsApp \+/.test(numberLine)) {
      await composer.getByTestId("bc-new-template").click();
      await expect(composer.getByTestId("tpl-composer")).toBeVisible();
      await expect(composer.getByTestId("tpl-submit")).toBeDisabled();
      await composer.getByTestId("tpl-body").fill("Hi {{1}}, a quick note from {{2}}.");
      await expect(composer.getByTestId("tpl-examples").locator("input")).toHaveCount(2);
      await expect(composer.getByTestId("tpl-preview")).toContainText("{{1}}");
    }

    // Cancel goes back to the ledger, which holds how a customer says yes: the card and the code, whenever there is a number.
    await composer.getByTestId("bc-compose-close").click();
    await expect(real.getByTestId("bc-composer")).toHaveCount(0);
    if (/WhatsApp \+/.test(numberLine)) {
      await expect(real.getByTestId("bc-optin")).toBeVisible();
      await expect(real.getByTestId("bc-optin")).toContainText("YES OFFERS");
      const qr = await apiGet(page, "/api/v1/consent/qr");
      expect(qr.status()).toBe(200);
      expect(qr.headers()["content-type"]).toContain("image/svg+xml");
      expect((await qr.text()).startsWith("<svg")).toBe(true);
    }

    // A run that went opens its people.
    if (broadcasts.length - open > 0) {
      await real.getByTestId("bc-history").first().getByTestId("bc-open-who").click();
      await expect(real.getByTestId("bc-detail")).toBeVisible();
      await expect(real.getByTestId("bc-touched")).toBeVisible();
    }
  });

  test("the send button is disabled whenever nobody on the chosen audience has said yes", async ({ page }) => {
    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("broadcasts-real")).toBeVisible();
    const composer = await openComposer(page);
    const active = composer.locator('[data-testid="bc-audience"].active');
    await expect(active).toHaveCount(1);
    const count = Number((await active.locator(".bc-chip-count").innerText()).trim());
    if (count === 0) {
      await expect(composer.getByTestId("bc-send")).toBeDisabled();
      await expect(composer.getByTestId("bc-nobody")).toBeVisible();
    } else {
      // Someone said yes: the button follows the template and its values, never the count alone.
      await expect(composer.getByTestId("bc-nobody")).toHaveCount(0);
    }
  });
});
