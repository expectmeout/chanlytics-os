/**
 * What needs you, counted once for everything that says it (decision 0048, point 1; the wiring blueprint's OW1).
 *
 * The Inbox's badge in the sidebar, the phone's Inbox tab, the title of the browser's tab, the phone app's badge and Today's
 * head each showed the number the last `inbox:counts` event carried, and two pages sent it: Today after each of its reads,
 * the Inbox whenever its own number changed. They counted a reply the owner had just held differently for the seconds before
 * the cancel's re-read, and whichever sent last was on screen. The Needs-you tab beside Conversations counted again off the
 * Inbox's rows, and the shell started from a copy of the same filter.
 *
 * They all read this now (`needsYouNow`): since Today in three zones (2 Nov 2026), the rows of Need you above To do, as
 * Today's read makes them and as this tab has worked them, and the rows of the runs an approval can still send, so the
 * badge and the head say one number over the rows the list draws. It sends nothing and keeps nothing of its own: the
 * surfaces it is made of move, and a reader that asks again is told the same thing. The parts the Inbox's threads hold are
 * read here too (`needsYouParts`: holds, held sends, runs), by the pages that say them apart: the Inbox's band for the runs
 * and its head, and Ask's Right now; the phone's widget only while the one count is unknown. A run counts only while an
 * approval can still send it (contracts runWaitsOnYou, by the business's days), and a hold whose thread the Inbox could
 * not read counts in the parts too (UNREAD_HOLDS: unknown is not handled).
 */
import { useSyncExternalStore } from "react";
import {
  needYouCountOf,
  needYouGroupsOf,
  needsYouCount,
  replyWaitsOnYou,
  runsThatWait,
  waitRowsOf,
  waitsOf,
  type BroadcastVM,
  type TodayQueueRowVM,
  type TodayVM,
  type WaitingThread,
  type Waits,
} from "@chanlytics/contracts";
import { onSurfaceMoved } from "@/bridge/surface-status";
import { approvalDaysNow } from "./campaigns/broadcasts/when-words";
import { ixWaiting, ixWaitsOnYou, vetoKeyOf } from "./inbox/rules";
import { demoSession } from "./inbox/shell";
import { IX_STORE, VW_STORE, inboxData } from "./inbox/store";
import type { Thread } from "./inbox/types";
import { surfaceValue } from "./surface-values";

/**
 * A thread as the count reads it: a real one by the Inbox's own rule, with the hold this tab has made; a seeded one (a
 * demo session's) by the mockup's, less the decisions the session has made on it.
 */
function waitingThread(t: Thread, nowMs: number): WaitingThread {
  return t.real ? ixWaiting(t, nowMs) : { needsYou: ixWaitsOnYou(t) && !IX_STORE.get(t.id) };
}

/** The runs the campaigns surface holds that wait for a word an approval can still send: none until it is read. */
export function waitingRunsNow(nowMs: number = Date.now()): BroadcastVM[] {
  const rows = surfaceValue("broadcasts")?.rows ?? [];
  // The business's days are asked only over runs to judge: a page with none never asks the clock.
  return rows.length ? runsThatWait(rows, approvalDaysNow(nowMs)) : [];
}

let lastParts: Waits | null = null;

/**
 * What waits on you now, by its parts (holds, held sends, runs), or null while the Inbox has not been read: a count of
 * what nothing has read is no count, and the seeded threads of the mockup are no one's. A demo session counts its seeds,
 * as the mockup always did. The same object while the parts are the same, so a hook over it draws once.
 */
export function needsYouParts(nowMs: number = Date.now()): Waits | null {
  const inbox = typeof window !== "undefined" && demoSession() ? inboxData() : surfaceValue("inbox");
  if (!inbox) return null;
  const rows = surfaceValue("broadcasts")?.rows ?? [];
  const parts = waitsOf({
    threads: inbox.THREADS.map((t) => waitingThread(t, nowMs)),
    // The holds whose thread the Inbox could not read, each a customer who may be waiting (a STOP's is not counted).
    unreadHolds: inbox.UNREAD_HOLDS ?? 0,
    runs: rows,
    days: rows.length ? approvalDaysNow(nowMs) : NO_DAYS,
    nowMs,
  });
  if (lastParts && lastParts.holds === parts.holds && lastParts.sends === parts.sends && lastParts.runs === parts.runs)
    return lastParts;
  lastParts = parts;
  return parts;
}

/** Days for a count with no runs to judge: never read, since no run is asked of them. */
const NO_DAYS = { today: "", sendsOn: "" };

/** The rows of Need you this tab has acted on this visit, by row and by thread (`needsYouActed`). */
interface ActedHere {
  rows: ReadonlySet<string>;
  threads: ReadonlySet<string>;
}
const NONE_ACTED: ActedHere = { rows: new Set(), threads: new Set() };
let actedHere: ActedHere = NONE_ACTED;

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/**
 * The rows Need you keeps as acted on this visit (a reply sent, a reply stopped, a thread snoozed: zones/need-you.tsx),
 * told by the list as it keeps them, none once it goes. They leave the count the moment they are pressed, as they leave
 * the list's, before the read that follows agrees; and a thread kept stands for itself, so the read's other row of it (a
 * reply stopped, read again as its closing window) is not counted either, as the list does not draw it.
 */
export function needsYouActed(rows: ReadonlyArray<Pick<TodayQueueRowVM, "id" | "conversationId">>): void {
  const next: ActedHere = rows.length
    ? {
        rows: new Set(rows.map((r) => r.id)),
        threads: new Set(rows.flatMap((r) => (r.conversationId ? [r.conversationId] : []))),
      }
    : NONE_ACTED;
  if (sameSet(next.rows, actedHere.rows) && sameSet(next.threads, actedHere.threads)) return;
  actedHere = next;
  moved();
}

/**
 * Whether a row of Today's read still waits, as this tab knows: not acted on in Need you, and, for a reply counting down,
 * by the one rule (contracts standing.ts replyWaitsOnYou): not one this tab has held in the Inbox (the one thing only a tab
 * knows, inbox/rules.ts ixHeld) before the cancel's re-read lands, nor one past its deadline, which is going out in the
 * owner's name.
 */
function stillWaits(r: TodayQueueRowVM, nowMs: number): boolean {
  if (actedHere.rows.has(r.id) || (r.conversationId && actedHere.threads.has(r.conversationId))) return false;
  if (r.kind !== "held" || !r.held) return true;
  const held = !!VW_STORE.state[vetoKeyOf(r.held.message_id)]?.held;
  return replyWaitsOnYou({ endsAtMs: r.held.sends_at_ms, held }, nowMs);
}

/**
 * How many need you now: the one count (decision 0048 as amended by Today in three zones, 2 Nov 2026), which the head,
 * the sidebar's badge, the strip's Inbox tab, the phone's tab and the tab's title all say. Need you's rows above To do,
 * as Today's read makes them and this tab has worked them (contracts needYouGroupsOf: Up next, who waits on you, what
 * waits for your OK), and the rows of the runs an approval can still send, as the list draws them (contracts waitRowsOf:
 * a batch To send, the runs waiting for an OK folded into one); your own to-dos and whoever waited past a week never.
 * A reach-out's reply that Need you draws in its handoff's place (contracts withReplies) keeps that row's id, wait and
 * clock, and both are a person waiting, so the count reads the rows as Today's read has them, and leaves the replies'
 * rows to the page that draws them. Every page reads Today (today/override.ts), so this is no read of its own. Null
 * while Today has not been read; a demo session counts its seeded threads, as the mockup always did.
 */
export function needsYouNow(nowMs: number = Date.now()): number | null {
  if (typeof window !== "undefined" && demoSession()) {
    const p = needsYouParts(nowMs);
    return p ? needsYouCount(p) : null;
  }
  const today = surfaceValue("today");
  if (!today) return null;
  const rows = today.queue.rows.filter((r) => stillWaits(r, nowMs));
  return needYouCountOf(needYouGroupsOf(rows), waitRowsOf(waitingRunsNow(nowMs)).length);
}

/**
 * The parts the phone's widget says while the one count is unknown (app-bridge.ts), which may stand before the Inbox is
 * read: the live parts when there are any (`live`, the hook's), else the brief's own (its holds and sends) with the runs
 * the campaigns surface holds.
 */
export function needsYouOnToday(vm: Pick<TodayVM, "needsYou">, live: Waits | null = needsYouParts()): Waits {
  return (
    live ?? {
      holds: vm.needsYou?.holds ?? vm.needsYou?.count ?? 0,
      sends: vm.needsYou?.sends ?? 0,
      runs: waitingRunsNow().length,
    }
  );
}

const hearers = new Set<() => void>();
let wired = false;

/** Told that something the count is made of has moved: the number may be another one. */
function moved(): void {
  for (const fn of [...hearers]) fn();
}

/**
 * Hear the count's sources move (Today's read, the Inbox's threads, the campaigns' runs, the rows Need you has acted on:
 * `needsYouActed`, and what only the Inbox's page knows: `needsYouMoved`); ask `needsYouNow` again when told. Told on a
 * move, not on a change of the number, so a reader keeps what it last drew until it compares. Answers the stop.
 */
export function hearNeedsYou(fn: () => void): () => void {
  if (!wired) {
    wired = true;
    onSurfaceMoved(["today", "inbox", "broadcasts"], moved);
    // A demo session's decisions are the session's, not a read's: the store says so with this one event (inbox/store.ts).
    if (typeof window !== "undefined" && demoSession()) window.addEventListener("inbox:decisions", moved);
  }
  hearers.add(fn);
  return () => void hearers.delete(fn);
}

/**
 * The Inbox's page tells the readers that what only it holds has moved: a reply held in this tab, which no read has told the
 * wire of yet, and a decision on a demo's seeded thread. Nothing else sends it.
 */
export function needsYouMoved(): void {
  moved();
}

/**
 * The count, as a hook: drawn again when the number changes, and by nothing else. The shell's pages that have not moved read
 * it by name (`window.useNeedsYou`, published from seed-globals); a surface imports it.
 */
export function useNeedsYou(): number | null {
  return useSyncExternalStore(hearNeedsYou, needsYouNow, needsYouNow);
}

/**
 * Whether anyone waits on the owner: the one count (needsYouNow) above none. Today's order and its setup card read this
 * one answer, so setting up never stands over a person waiting.
 */
export function useWaitsOnToday(): boolean {
  return (useNeedsYou() ?? 0) > 0;
}

/** The parts, as a hook: drawn again when a part changes (a hold becomes a held send, a run is approved), by nothing else. */
export function useNeedsYouParts(): Waits | null {
  return useSyncExternalStore(hearNeedsYou, partsNow, partsNow);
}

// useSyncExternalStore calls its snapshot with no arguments: the clock is now.
const partsNow = () => needsYouParts();
