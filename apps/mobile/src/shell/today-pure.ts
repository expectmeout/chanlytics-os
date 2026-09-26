/** The native Today's own words (the rest are the view model's), apart from the screen so a test runs them. */

/** What the screen says when the calls could not be read: the page's own sentence (dashboard-a-brief.jsx). */
export const CALLS_UNREAD = "The phone line's calls could not be read. The day's other numbers are current.";

/** "2 hours", "35 minutes": how long someone has waited, in the page's grain. */
export function sinceWords(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}
