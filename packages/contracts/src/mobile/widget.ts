/**
 * What the home-screen widget shows (the phone app's PRD, M7): Today's four figures, how many need you and the first
 * of them, and the standing's headline, in the page's own words, as of a moment. Derived from the Today view model
 * the page already holds (today-widget.ts todayWidgetSnapshot), so the widget can never say a number the page would not.
 * This module is the shape and its parser alone: the phone app's entry (phone-app.ts) reads it, and nothing it imports
 * pulls Today's builders into the app's own compile.
 */
import { isCount } from "../shared/unknown";

export interface TodayWidgetSnapshot {
  /** The standing's headline: what Today says first. */
  headline: string;
  /** The day's four figures in the page's order, each with its word; empty on a day with nothing at all. */
  figures: Array<{ label: string; value: number }>;
  /** How many wait on you: the one count the badge says (needs-you.ts needsYouNow: Need you's rows above To do, runs). */
  waiting: number;
  /** The first person who needs you (a hold), and why; null when no hold has a row (only a run or a held send waits). */
  first: { who: string; reason: string } | null;
  /** When this was true, ISO. The widget says "as of" from it. */
  at: string;
}

const FIGURES_MAX = 4;
const TEXT_MAX = 80;

/** The snapshot as the shell may trust it after the bridge: the shapes, the sizes, nothing else. */
export function parseTodayWidgetSnapshot(raw: unknown): TodayWidgetSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const items = raw as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === "string" ? x.trim().slice(0, TEXT_MAX) : null);
  const headline = text(items.headline);
  const at = typeof items.at === "string" && !Number.isNaN(Date.parse(items.at)) ? items.at : null;
  const waiting = isCount(items.waiting) ? items.waiting : null;
  if (headline === null || at === null || waiting === null || !Array.isArray(items.figures)) return null;
  const figures: TodayWidgetSnapshot["figures"] = [];
  for (const f of items.figures.slice(0, FIGURES_MAX)) {
    if (!f || typeof f !== "object") return null;
    const label = text((f as { label?: unknown }).label);
    const value = (f as { value?: unknown }).value;
    if (label === null || typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    figures.push({ label, value: Math.floor(value) });
  }
  let first: TodayWidgetSnapshot["first"] = null;
  if (items.first !== null && items.first !== undefined) {
    if (typeof items.first !== "object") return null;
    const whoText = text((items.first as { who?: unknown }).who);
    const reason = text((items.first as { reason?: unknown }).reason);
    if (whoText === null || reason === null) return null;
    first = { who: whoText, reason };
  }
  return { headline, figures, waiting, first, at };
}
