import { test, expect, type Page } from "@playwright/test";
import { EVERYONE_LABEL } from "../../packages/contracts/src/index";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute } from "../address";
import { apiGet } from "../workspace";
import { broadcastSlots, messagesOffered, type TemplatesRead } from "./offered";

/**
 * Campaigns' sends on a real workspace: the send screen, Get their yes and a run's report.
 *
 * Sent's list went to each sequence's History (decision 0060, D3): its address lands on Sequences, and what it opened stands
 * beside Sequences' list at its own address -- a run's report (`broadcasts/run:<id>/sheet`) and Get their yes
 * (`broadcasts/get-yes`). The send screen is Campaigns' composer, in a sheet from the side at `campaigns/new` (a date's New
 * opens it), the audience a token in the To sentence, which says how many of the list can hear the message, the templates
 * the ones the page can send (or the honest line), and the number what WhatsApp has said about it. Sending is never done
 * here — the workspace keeps no test broadcast — but the send button must be disabled whenever nobody on the chosen
 * audience has said yes.
 */
const INVENTED = ["credits", "Booked from broadcasts", "April win-back", "Serenity"];

/** The composer, Campaigns' sheet at `campaigns/new` (its foot and its Cancel are the send screen's own), by its address. */
async function openComposer(page: Page) {
  await page.goto("/#/campaigns/new");
  await page.waitForLoadState("networkidle");
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

  test("Sent's address lands on Sequences; the send screen, Get their yes and a run are drawn from the workspace's rows, and nothing is invented", async ({
    page,
  }) => {
    await page.goto("/#/broadcasts");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences$/));

    const [bc, tpl, cfg, ch] = await Promise.all([
      apiGet(page, "/api/v1/broadcasts"),
      apiGet(page, "/api/v1/templates"),
      apiGet(page, "/api/v1/settings"),
      apiGet(page, "/api/v1/channels"),
    ]);
    expect(bc.status()).toBe(200);
    expect(tpl.status()).toBe(200);
    expect(cfg.status()).toBe(200);
    expect(ch.status()).toBe(200);
    const broadcasts = (await bc.json()).data.broadcasts as { state: string }[];
    const read = (await tpl.json()).data as TemplatesRead;
    // The links a slot may be filled from, as the page reads them (broadcasts/surface.ts): the booking link on file,
    // and whether the Google listing keeps a review link (GET settings' review_link).
    const settings = (await cfg.json()).data;
    const links = { bookingLink: !!settings.config?.brain?.booking_link, reviewLink: settings.review_link === true };
    // Whether there is a number to send from, as the page reads it (broadcasts/surface.ts): an active WhatsApp channel.
    const hasNumber = ((await ch.json()).data.channels as { kind: string; status: string }[]).some(
      (c) => c.kind === "whatsapp" && c.status === "active",
    );

    const composer = await openComposer(page);

    // Audiences: the list is a word of the send's sentence, on Everyone (contracts EVERYONE_LABEL) unless a link named one,
    // and the line under it says how many of what it holds can hear the message (or that nobody is on it).
    await expect(composer.getByTestId("bc-audience")).toContainText(EVERYONE_LABEL);
    await expect(composer.getByTestId("bc-reach")).toContainText(/can hear it|Nobody/);

    // Messages: one option per message the page can send, by contracts' own rules over what the route answers
    // (messagesOffered: its `messages`, which the page lists from, and which hold a message's WhatsApp version's
    // standing where the list of rows leaves it out) -- a message with a version on any of WhatsApp, email and text is
    // one option, in two languages still one; one the wire cannot carry is left out and said so, and one a broadcast
    // cannot fill (the visit reminder) is left out -- or the honest line. Nothing here assumes a channel, so a workspace
    // with no WhatsApp number offers the messages it has written, as one with a number does.
    const { groups: offered, why } = messagesOffered(read, broadcastSlots(links));
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

    // The number a broadcast goes out on, and what WhatsApp has said about it (in the composer's When column), where the
    // send goes by WhatsApp, and where WhatsApp is ticked for a message it carries and the number is what holds it off: the
    // line then says why (broadcasts-honest.test.mjs, "the number's own words stand"). The nightly's number has no
    // credentials, and a workspace ready on nothing opens ticked on WhatsApp, so its tick is off and the line stands. The
    // composer opens on the first channel the workspace can send on and the message holds, so a message written for email
    // alone opens on Email, with no number to say.
    // The channels are a word of the sentence ("by [WhatsApp or Email]"); a healthy number is said where the send's time is.
    const number = composer.getByTestId("bc-number");
    if ((await composer.getByTestId("bc-via-word").innerText()).includes("WhatsApp")) {
      await expect(number).toBeVisible();
      await expect(number).toContainText(/quality|No WhatsApp number|From WhatsApp/);
    } else if ((await number.count()) > 0)
      await expect(number).toContainText(/quality|No WhatsApp number|From WhatsApp/);

    const words = await composer.innerText();
    for (const s of INVENTED) expect(words, `invented in the composer: "${s}"`).not.toContain(s);

    // A template can be written here, to a number's account: the composer opens, and nothing is submitted.
    if (hasNumber) {
      await composer.getByTestId("bc-new-template").click();
      await expect(composer.getByTestId("tpl-composer")).toBeVisible();
      await expect(composer.getByTestId("tpl-submit")).toBeDisabled();
      await composer.getByTestId("tpl-body").fill("Hi {{1}}, a quick note from {{2}}.");
      await expect(composer.getByTestId("tpl-examples").locator("input")).toHaveCount(2);
      await expect(composer.getByTestId("tpl-preview")).toContainText("{{1}}");
    }

    // Cancel closes the sheet, which a link arrived at: the address goes to Sequences. Get their yes holds how a customer says
    // yes: the code and the phrase, whenever there is a number.
    // The sheet's Close, which presses the composer's own Cancel (hidden in the sheet: home/pane-sheet.tsx).
    await page.getByRole("dialog").getByLabel("Close", { exact: true }).click();
    await expect(page.getByTestId("bc-composer")).toHaveCount(0);
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences$/));
    await page.goto("/#/broadcasts/get-yes");
    const real = page.getByTestId("broadcasts-real");
    await expect(real).toBeVisible();
    if (hasNumber) {
      await expect(real.getByTestId("bc-optin")).toBeVisible();
      await expect(real.getByTestId("bc-optin")).toContainText("YES OFFERS");
      const qr = await apiGet(page, "/api/v1/consent/qr");
      expect(qr.status()).toBe(200);
      expect(qr.headers()["content-type"]).toContain("image/svg+xml");
      expect((await qr.text()).startsWith("<svg")).toBe(true);
    }

    // A run that went opens its people at its sheet's address, in the pane beside Sequences' list; Close goes to Sequences.
    const went = (broadcasts as { id: string; state: string }[]).find((b) => b.state === "sent");
    if (went) {
      await page.goto(`/#/broadcasts/run:${went.id}/sheet`);
      await expect(real.getByTestId("bc-run-solo")).toBeVisible();
      await expect(real.getByTestId("bc-detail")).toBeVisible();
      await expect(real.getByTestId("bc-touched")).toBeVisible();
      const report = await real.getByTestId("bc-run-solo").innerText();
      for (const s of INVENTED) expect(report, `invented in a run's report: "${s}"`).not.toContain(s);
      await real.getByTestId("bc-detail-close").click();
      await expect(page).toHaveURL(atRoute(/^campaigns\/sequences$/));
    }
  });

  test("the send button is disabled whenever nobody on the chosen audience has said yes", async ({ page }) => {
    const composer = await openComposer(page);
    // The count the chosen list reaches is the reach line's own ("N of M can hear it"), which it carries as data-count.
    const count = Number(await composer.getByTestId("bc-reach").getAttribute("data-count"));
    if (count === 0) {
      await expect(composer.getByTestId("bc-send")).toBeDisabled();
      // Everyone it reaches hears from you within a week of it: they said yes, so the heard line and the foot say why,
      // never the line about a missing yes.
      if ((await composer.getByTestId("bc-heard-line").count()) > 0)
        await expect(composer.getByTestId("bc-nobody")).toHaveCount(0);
      else await expect(composer.getByTestId("bc-nobody")).toBeVisible();
    } else {
      // Someone said yes: the button follows the template and its values, never the count alone.
      await expect(composer.getByTestId("bc-nobody")).toHaveCount(0);
    }
  });
});
