/**
 * The rows a list acted on this visit, and where each stood (Today in three zones, 2 Nov 2026): Need you's groups and To
 * do keep a row pressed in its place, with its receipt and its undo, whatever the next read says; one rule for both.
 */
import type { TodayQueueRowVM } from "@chanlytics/contracts";

/**
 * A row acted on this visit, where it stood among the rows drawn, and how many of its presses hold it: a press inside
 * another's work (Booked it's confirmation, a Stopped reply's own Send) holds it once more, and its refusal or its Undo
 * lets go of that one alone, so the row the first press kept stays, with the words written in it.
 */
export type Kept = Record<string, { row: TodayQueueRowVM; at: number; holds: number }>;

/**
 * The rows as read, with each one acted on this visit as it was kept (a held reply stopped reads "Held for you") and,
 * where the read no longer has it, put back where it stood: its receipt and its undo stay there. A thread kept under one
 * row stands for itself for the visit: the read's other row of it (a held reply stopped reads again as its closing window)
 * is not drawn a second time.
 */
export function withKept(rows: readonly TodayQueueRowVM[], kept: Kept): TodayQueueRowVM[] {
  const threads = new Set(Object.values(kept).flatMap(({ row }) => (row.conversationId ? [row.conversationId] : [])));
  const out = rows.flatMap((r) => {
    const k = kept[r.id];
    if (k) return [k.row];
    return r.conversationId && threads.has(r.conversationId) ? [] : [r];
  });
  for (const { row, at } of Object.values(kept).sort((x, y) => x.at - y.at)) {
    if (!out.some((r) => r.id === row.id)) out.splice(Math.min(at, out.length), 0, row);
  }
  return out;
}

/** A row kept, where it stood among `rows` (or where it was kept before), held once more. */
export const keptWith = (was: Kept, row: TodayQueueRowVM, rows: readonly TodayQueueRowVM[]): Kept => ({
  ...was,
  [row.id]: {
    row,
    at: was[row.id]?.at ?? rows.findIndex((r) => r.id === row.id),
    holds: (was[row.id]?.holds ?? 0) + 1,
  },
});

/** A press that held a row let go (refused, or undone): the last one gone, the row waits again, drawn as the read says. */
export function keptWithout(was: Kept, row: TodayQueueRowVM): Kept {
  const k = was[row.id];
  if (!k) return was;
  const next = { ...was };
  if (k.holds > 1) next[row.id] = { ...k, holds: k.holds - 1 };
  else delete next[row.id];
  return next;
}
