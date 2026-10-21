import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute } from "../address";
import { openDraftedOnce } from "./new-draft";
import { apiGet } from "../workspace";

/**
 * Campaigns' sends on a real workspace: New's Once, Get their yes and a run's report.
 *
 * Sent's list went to each sequence's History (decision 0060, D3), and its mount with the Campaigns wiring review (19 Oct
 * 2026): its addresses land where their pages went -- a run's report (`broadcasts/run:<id>/sheet`) at the run's home under
 * its sequence, and Get their yes (`broadcasts/get-yes`) on People's sheet (`clients/get-yes`). A message sent once is New's
 * Once (decision 0065; `campaigns/sequences/new:once`, where the composer's `campaigns/new` lands): one line to Ask and the
 * starts read from the workspace, then the draft, one sentence of who, when and how. Ask's answer is given here
 * (new-draft.ts, beside this) so a nightly asks no model. Sending is never done here -- the workspace keeps no test broadcast -- but
 * Send now must be held whenever nobody it is for can hear it.
 */
const INVENTED = ["credits", "Booked from broadcasts", "April win-back", "Serenity"];

/** New's Once by the composer's old address, which lands there: its start, before a line is said. */
async function openOnce(page: Page) {
  await page.goto("/#/campaigns/new");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(atRoute(/^campaigns\/sequences\/new:once$/));
  const pane = page.getByTestId("sq-new");
  await expect(pane.getByTestId("sq-nw-line")).toBeVisible();
  return pane;
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

    const [bc, ch] = await Promise.all([apiGet(page, "/api/v1/broadcasts"), apiGet(page, "/api/v1/channels")]);
    expect(bc.status()).toBe(200);
    expect(ch.status()).toBe(200);
    const broadcasts = (await bc.json()).data.broadcasts as { state: string }[];
    // Whether there is a number to send from, as the page reads it: an active WhatsApp channel.
    const hasNumber = ((await ch.json()).data.channels as { kind: string; status: string }[]).some(
      (c) => c.kind === "whatsapp" && c.status === "active",
    );

    // New's Once: the line to Ask, Draft it held until it says enough, and the starts the workspace's own. Nothing invented.
    const pane = await openOnce(page);
    await expect(pane.getByTestId("sq-nw-draft")).toBeDisabled();
    const words = await pane.innerText();
    for (const s of INVENTED) expect(words, `invented in New: "${s}"`).not.toContain(s);

    // Close goes to Sequences, which a link arrived at New from. Get their yes, People's sheet, holds how a customer says
    // yes: the code and the phrase, whenever there is a number.
    await page.getByTestId("cm-pane-close").click();
    await expect(page.getByTestId("sq-new")).toHaveCount(0);
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences$/));
    await page.goto("/#/broadcasts/get-yes");
    await expect(page).toHaveURL(atRoute(/^clients\/get-yes$/));
    const yes = page.getByTestId("bc-optin");
    await expect(yes).toBeVisible();
    if (hasNumber) {
      await expect(yes).toContainText("YES OFFERS");
      const qr = await apiGet(page, "/api/v1/consent/qr");
      expect(qr.status()).toBe(200);
      expect(qr.headers()["content-type"]).toContain("image/svg+xml");
      expect((await qr.text()).startsWith("<svg")).toBe(true);
    }

    // A run that went: its sheet's old address lands on its home under its sequence, its one screen beside Sequences' list,
    // its people under its report; Close goes to its sequence's History, the days it is one of.
    const went = (broadcasts as { id: string; state: string }[]).find((b) => b.state === "sent");
    if (went) {
      await page.goto(`/#/broadcasts/run:${went.id}/sheet`);
      await expect(page).toHaveURL(atRoute(new RegExp(`^campaigns/sequences/[^/]+/runs/${went.id}$`)));
      const run = page.getByTestId("bc-run-solo");
      await expect(run).toBeVisible();
      await expect(run.getByTestId("bc-detail")).toBeVisible();
      await expect(run.getByTestId("bc-touched")).toBeVisible();
      const report = await run.innerText();
      for (const s of INVENTED) expect(report, `invented in a run's report: "${s}"`).not.toContain(s);
      await run.getByTestId("bc-detail-close").click();
      await expect(page).toHaveURL(atRoute(/^campaigns\/sequences(\/[^/]+\/history)?$/));
    }
  });

  test("Send now is held whenever nobody it is for can hear it, and the draft says so with the ways it could be", async ({
    page,
  }) => {
    const pane = await openDraftedOnce(page);
    // The sentence is the draft's: once, to everyone who said yes to offers, now, by WhatsApp; nobody can hear it.
    await expect(pane.getByTestId("sq-nw-sentence")).toContainText("Once");
    await expect(pane.getByTestId("sq-nw-reach")).toContainText("0");
    await expect(pane.getByTestId("sq-nw-send-now")).toBeDisabled();
    // The card says why and offers the ways: how it goes, the yes nobody gave (People's Get their yes), someone else.
    const nobody = pane.getByTestId("sq-nw-nobody");
    await expect(nobody).toBeVisible();
    await expect(nobody.getByTestId("sq-nw-nobody-yes")).toBeVisible();
    await expect(nobody.getByTestId("sq-nw-nobody-who")).toBeVisible();
  });
});
