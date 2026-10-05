import { test, expect, type Page } from "@playwright/test";
import {
  EVERYONE_LABEL,
  compareTemplates,
  groupTemplates,
  sendableTemplates,
  templateSlots,
} from "../../packages/contracts/src/index";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute } from "../address";
import { apiGet } from "../workspace";

/**
 * Campaigns › Broadcasts on a real workspace.
 *
 * The route renders the real page, not the Coming Soon card. It opens on the
 * ledger (#758): the runs are what the route holds, and nothing is invented.
 * The ledger is always the list, and what is open (a run's report) is a pane
 * beside it, as a thread is beside the Inbox's list.
 * New message is Campaigns' one door to the composer, here as on the home: it goes to
 * `campaigns/new`, where the send screen is in a sheet from the side, the audience a token in the
 * To sentence, which says how many of the list can hear the message, the
 * templates are the ones the page can send (or the honest line), and the number
 * says what WhatsApp has said about it. Sending is never done here — the workspace keeps no test broadcast — but
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

/**
 * The composer is the home's sheet at `campaigns/new` (its foot and its Cancel are the send screen's own): New message, on the
 * ledger, opens it. In Glass, the default look, the page's act is drawn in the frame's head, outside the page's own element, so
 * it is found on the page.
 */
async function openComposer(page: Page) {
  await page.getByTestId("bc-new").click();
  await expect(page).toHaveURL(atRoute(/^campaigns\/new$/));
  const composer = page.getByTestId("cmh-composer").getByTestId("bc-composer");
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
    await expect(page.getByTestId("bc-new")).toBeVisible();
    await expect(real.getByTestId("bc-open")).toHaveCount(open);
    await expect(real.getByTestId("bc-history")).toHaveCount(Math.min(broadcasts.length - open, LATEST_SHOWN));
    await expect(real.getByTestId("bc-empty")).toHaveCount(broadcasts.length === 0 ? 1 : 0);
    const ledger = await real.innerText();
    for (const s of INVENTED) expect(ledger, `invented on the ledger: "${s}"`).not.toContain(s);

    const composer = await openComposer(page);

    // Audiences: the list is a token in the To sentence, on Everyone (contracts EVERYONE_LABEL) unless a link named one,
    // and the sentence says how many of what it holds can hear the message.
    await expect(composer.getByTestId("bc-audience")).toContainText(EVERYONE_LABEL);
    await expect(composer.getByTestId("bc-who-count")).toContainText("can hear it");

    // Templates: one option per message the page can send, by contracts' own rules
    // over the route's rows -- a message in two languages is one option, one the
    // wire cannot carry is left out and said so, and one a broadcast cannot fill
    // (the visit reminder) is left out -- or the honest line.
    const { sendable, why } = sendableTemplates(approved.slice().sort(compareTemplates));
    const offered = groupTemplates(sendable.filter((t) => templateSlots(t, { visits: false, bookingLink }) !== null));
    if (offered.length === 0) {
      await expect(composer.getByTestId("bc-no-template")).toBeVisible();
      await expect(composer.getByTestId("bc-template")).toHaveCount(0);
    } else {
      // The message is the kit's picker: its list, opened, holds one option per message and, under them, why the rest is
      // not there. Escape closes the list and keeps the pane.
      await composer.getByTestId("bc-template").click();
      const options = page.getByRole("option");
      await expect(options).toHaveCount(offered.length);
      for (const [at, group] of offered.entries()) await expect(options.nth(at)).toContainText(group.title);
      if (why) await expect(page.locator(".rec-combo-note")).toHaveText(why);
      else await expect(page.locator(".rec-combo-note")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(composer.getByTestId("bc-preview")).toBeVisible();
    }
    // With nothing to pick the reason is a line of its own; with a list, it stands under the list.
    if (offered.length === 0 && why) await expect(composer.getByTestId("bc-blocked")).toHaveText(why);
    else await expect(composer.getByTestId("bc-blocked")).toHaveCount(0);

    // The number a broadcast goes out on, and what WhatsApp has said about it (in the composer's When column).
    const number = composer.getByTestId("bc-number");
    await expect(number).toBeVisible();
    await expect(number).toContainText(/quality|No WhatsApp number/);
    const numberLine = await number.innerText();

    const words = await composer.innerText();
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

    // Cancel closes the sheet, which a link arrived at: the address goes to the home, and Back is the way to Sent. The ledger
    // holds how a customer says yes: the card and the code, whenever there is a number.
    await composer.getByTestId("bc-compose-close").click();
    await expect(page.getByTestId("bc-composer")).toHaveCount(0);
    await expect(page).toHaveURL(atRoute(/^campaigns$/));
    await page.goto("/#/broadcasts");
    await expect(real).toBeVisible();
    if (/WhatsApp \+/.test(numberLine)) {
      await expect(real.getByTestId("bc-optin")).toBeVisible();
      await expect(real.getByTestId("bc-optin")).toContainText("YES OFFERS");
      const qr = await apiGet(page, "/api/v1/consent/qr");
      expect(qr.status()).toBe(200);
      expect(qr.headers()["content-type"]).toContain("image/svg+xml");
      expect((await qr.text()).startsWith("<svg")).toBe(true);
    }

    // A run that went opens its people, in the pane beside the list, which stays; Close puts the pane away.
    if (broadcasts.length - open > 0) {
      await real.getByTestId("bc-history").first().getByTestId("bc-open-who").click();
      await expect(real.getByTestId("bc-run-solo")).toBeVisible();
      await expect(real.getByTestId("bc-detail")).toBeVisible();
      await expect(real.getByTestId("bc-touched")).toBeVisible();
      await expect(real.getByTestId("bc-runs")).toBeVisible();
      await real.getByTestId("bc-detail-close").click();
      await expect(real.getByTestId("bc-run-solo")).toHaveCount(0);
    }
  });

  test("the send button is disabled whenever nobody on the chosen audience has said yes", async ({ page }) => {
    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("broadcasts-real")).toBeVisible();
    const composer = await openComposer(page);
    // The count the chosen list reaches is the To sentence's own: "N of M can hear it".
    const count = Number((await composer.getByTestId("bc-who-n").innerText()).replace(/,/g, "").trim());
    if (count === 0) {
      await expect(composer.getByTestId("bc-send")).toBeDisabled();
      await expect(composer.getByTestId("bc-nobody")).toBeVisible();
    } else {
      // Someone said yes: the button follows the template and its values, never the count alone.
      await expect(composer.getByTestId("bc-nobody")).toHaveCount(0);
    }
  });
});
