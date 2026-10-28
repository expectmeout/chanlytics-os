import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The sidebar's places, by what they say, on any desk. A small desk (over 900px, at or under tokens.css --bp-desk's
 * 1280px) opens with the sidebar as its rail (shell-hooks.ts useDeskSidebar, #1841): a row draws its glyph alone and
 * says its place in its label, where a wide desk draws the words. Its accessible name says the place either way, so
 * that is what a spec reads. Playwright's Desktop Chrome is 1280px wide, so the suite's own desk is a small one: on
 * 27 Oct 2026 every spec that read a row's words failed there, three tries each, and the nightly ran out of its hour.
 * The shell's own, beside its specs: e2e's root is at its twenty modules.
 */

/** A place as its row says it: the place first, then its count or hint, if it has one. */
const says = (place: string): RegExp => new RegExp(`^${place}\\b`);

/** The frame is on this place: the row the route lights is the one that says it. */
export async function expectLit(page: Page, place: string): Promise<void> {
  await expect(page.locator('.nav-item[aria-current="page"]')).toHaveAccessibleName(says(place));
}

/** The row that says this place, to press. */
export const placeRow = (page: Page, place: string): Locator =>
  page.getByTestId("sidebar").getByRole("link", { name: says(place) });
