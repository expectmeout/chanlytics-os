import { expect, type Page } from "@playwright/test";

/**
 * The desk sign (/yes/<slug>/sign), checked the way it is used: printed.
 *
 * A sign that spills onto a second sheet, or prints the button that printed it, fails on paper while every screen
 * check passes -- the page looks right in the browser either way. So the check prints it, to Letter and to A4, and
 * counts the sheets.
 *
 * Shared by the nightly spec and by the harness that verified it before it ran against production, where the same
 * checks were run against a sign broken on purpose (a code too big for the page, the button left in the print) and
 * had to fail.
 */

/** Sheets in a PDF Chromium printed: its /Type /Page objects, not the /Type /Pages tree above them. */
export function sheetsIn(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

/** Letter at 96 CSS pixels to the inch: the width a printed page lays out at. */
const LETTER_PX = 8.5 * 96;

export async function expectDeskSign(page: Page): Promise<void> {
  const sheet = page.getByTestId("desk-sign");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("desk-sign-qr").locator("svg")).toBeVisible();
  // What a call to action owes, on the sheet a customer reads before scanning -- not on a page they never see.
  const terms = sheet.getByTestId("desk-sign-terms");
  for (const words of [
    "Message and data rates may apply",
    "Reply HELP",
    "Reply STOP",
    "No mobile information is shared with third parties",
    "not a condition of any purchase",
  ]) {
    await expect(terms).toContainText(words);
  }
  await expect(sheet).toContainText("YES OFFERS");
  // A printed page, so nothing on it takes input.
  await expect(page.locator("form, input, textarea, select")).toHaveCount(0);

  for (const format of ["Letter", "A4"] as const) {
    expect(sheetsIn(await page.pdf({ format, printBackground: true })), `${format}: the sign on one sheet`).toBe(1);
  }
  // On paper: the sheet alone, and a code large enough to scan from where a customer stands -- three inches with
  // its quiet zone on Letter.
  await page.emulateMedia({ media: "print" });
  try {
    await page.setViewportSize({ width: LETTER_PX, height: 11 * 96 });
    await expect(page.getByTestId("desk-sign-bar")).toBeHidden();
    const qr = await sheet.getByTestId("desk-sign-qr").locator("svg").boundingBox();
    expect(qr!.width / 96, "the code's width on Letter, in inches").toBeGreaterThanOrEqual(3);
  } finally {
    // Off, not "screen": a forced screen medium outlives the check, and a page.pdf() after it prints the dark
    // screen page with its button on -- which is how the first live check of the sign saved a misleading PDF.
    await page.emulateMedia({ media: null });
  }
}
