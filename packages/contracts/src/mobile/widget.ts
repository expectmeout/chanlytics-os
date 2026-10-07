/**
 * What the home-screen widget shows (the phone app's PRD, M7): Today's four figures, how many need you and the first
 * of them, and the standing's headline, in the page's own words, as of a moment. Derived from the Today view model
 * the page already holds, so the widget can never say a number the page would not.
 */
import type { TodayVM } from "../today/today-vm";

export interface TodayWidgetSnapshot {
  /** The standing's headline: what Today says first. */
  headline: string;
  /** The day's four figures in the page's order, each with its word; empty on a day with nothing at all. */
  figures: Array<{ label: string; value: number }>;
  /** How many people are waiting on you across the whole queue. */
  waiting: number;
  /** The first person who needs you, and why; null when nobody does. */
  first: { who: string; reason: string } | null;
  /** When this was true, ISO. The widget says "as of" from it. */
  at: string;
}

/**
 * The first person and the count come from one list, the queue, as the page's own Today draws it: the first was the
 * needs-you list's while the count was the queue's, so the widget could name someone the count did not include.
 */
export function todayWidgetSnapshot(vm: TodayVM, at: Date): TodayWidgetSnapshot {
  const row = vm.queue.rows[0] ?? null;
  return {
    headline: vm.standing.headline,
    figures: (vm.figures ?? []).map((f) => ({ label: f.label, value: f.value })),
    waiting: vm.queue.waiting,
    first: row ? { who: row.who, reason: row.sentence } : null,
    at: at.toISOString(),
  };
}

const FIGURES_MAX = 4;
const TEXT_MAX = 80;

/** The snapshot as the shell may trust it after the bridge: the shapes, the sizes, nothing else. */
export function parseTodayWidgetSnapshot(v: unknown): TodayWidgetSnapshot | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === "string" ? x.trim().slice(0, TEXT_MAX) : null);
  const headline = text(s.headline);
  const at = typeof s.at === "string" && !Number.isNaN(Date.parse(s.at)) ? s.at : null;
  const waiting = typeof s.waiting === "number" && Number.isInteger(s.waiting) && s.waiting >= 0 ? s.waiting : null;
  if (headline === null || at === null || waiting === null || !Array.isArray(s.figures)) return null;
  const figures: TodayWidgetSnapshot["figures"] = [];
  for (const f of s.figures.slice(0, FIGURES_MAX)) {
    if (!f || typeof f !== "object") return null;
    const label = text((f as { label?: unknown }).label);
    const value = (f as { value?: unknown }).value;
    if (label === null || typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    figures.push({ label, value: Math.floor(value) });
  }
  let first: TodayWidgetSnapshot["first"] = null;
  if (s.first !== null && s.first !== undefined) {
    if (typeof s.first !== "object") return null;
    const who = text((s.first as { who?: unknown }).who);
    const reason = text((s.first as { reason?: unknown }).reason);
    if (who === null || reason === null) return null;
    first = { who, reason };
  }
  return { headline, figures, waiting, first, at };
}
