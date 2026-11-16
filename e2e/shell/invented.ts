import { expect, type Page } from "@playwright/test";

/** Names and numbers that exist only in the design seeds. */
export const INVENTED = [
  "Serenity Spa",
  "Sarah Chen",
  "Marcus Webb",
  "Lena Park",
  "Jay Rivera",
  "(415) 555-0100",
  "serenityspa.co",
  // the mockup's clients, now that People is real
  "Aisha Khan",
  "David Chen",
  // the mockup's callers, now that Live is real
  "Selena Cho",
  "Maya Rodriguez",
  // Every person the demo's Inbox and Conversations invented (the wiring's second audit, X6-3), as their seeds named them
  // when demo mode went (16 Nov 2026): the seeded Inbox that stood in on a real session before its read (X6-1) showed them.
  "Gabby Moreno",
  "@thewellness.co",
  "Jordan Patel",
  "Tara Ellis",
  "Noah Williams",
  "Kayla Brooks",
  "Elena Park",
  "@marcus_lee",
].filter((seed, i, all) => all.indexOf(seed) === i);

/** On a signed-in session, the mockup's people, business and phone numbers appear nowhere. */
export async function assertNothingInvented(page: Page, where: string): Promise<void> {
  const text = await page.locator("body").innerText();
  for (const seed of INVENTED) {
    expect(text, `${where} is showing invented data: "${seed}"`).not.toContain(seed);
  }
}
