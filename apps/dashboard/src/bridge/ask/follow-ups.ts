/**
 * Ask's follow-ups that came due, as the tab holds them (the closed-loop read, 17 Oct 2026: a follow-up Ask kept came due
 * and nobody was told until they happened to ask). Read once the boot's reads are in, as the tab comes back, as Ask opens
 * and after each of its turns (a turn may keep one, and a question from the home's row clears its own), and each time
 * Leads or Sequences publishes a read while one still waits: a search finishing, or replies coming in, is what wakes
 * them. Each read that lands says so with FOLLOW_UPS_EVENT, which Ask's home, the top bar's Ask and the three's light
 * hear. A read that fails keeps what was held.
 */
import { MIN_MS } from "@chanlytics/contracts";
import { afterBoot } from "../workspace";
import type { AskApiCalls } from "./api";

/** A follow-up that came due: the line the member reads, and what Ask asks itself when they come back to it. */
export interface DueFollowUp {
  id: string;
  said: string;
  prompt: string;
}

/** Said on the window each time the follow-ups are read, and as one leaves the home. */
export const FOLLOW_UPS_EVENT = "ask:follow-ups";

/** The surfaces whose reads can wake a follow-up that waits: a search's round, a sequence's replies. */
const WAKERS = ["surface:leads", "surface:sequences"] as const;

/** A tab coming back reads again only past this: switching tabs is not news. */
const BACK_AGAIN_MS = MIN_MS;

export function askFollowUps(win: Window, api: Pick<AskApiCalls, "followUps">) {
  let due: DueFollowUp[] = [];
  let waiting = 0;
  let readAt = 0;
  let asked = 0;
  const said = () => win.dispatchEvent(new CustomEvent(FOLLOW_UPS_EVENT));
  // The newest read wins: one that lands after a later one was asked says nothing.
  const read = async (): Promise<void> => {
    const mine = ++asked;
    readAt = Date.now();
    const r = await api.followUps();
    if (!r || mine !== asked) return;
    due = r.due;
    waiting = r.waiting;
    said();
  };
  if (typeof win.addEventListener === "function") {
    void afterBoot().then(read);
    for (const ev of WAKERS)
      win.addEventListener(ev, () => {
        if (waiting > 0) void read();
      });
    win.document?.addEventListener("visibilitychange", () => {
      if (win.document.visibilityState === "visible" && Date.now() - readAt > BACK_AGAIN_MS) void read();
    });
  }
  return {
    /** The follow-ups that came due, oldest first. */
    followUpsDue: (): readonly DueFollowUp[] => due,
    /** Read them again (Ask opening, a turn landing). */
    readFollowUps: read,
    /** A question from the home's row is on its way: its follow-up leaves the home at once, as the route clears it. */
    cameBackTo: (id: string): void => {
      const left = due.filter((f) => f.id !== id);
      if (left.length === due.length) return;
      due = left;
      said();
    },
  };
}
