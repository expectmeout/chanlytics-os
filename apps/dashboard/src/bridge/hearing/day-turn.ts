/**
 * The business's day turns: the surfaces that count the day so far (`readAtMidnight`) are read again, a second past its midnight by
 * the workspace's zone, and the timer is armed again for the next (a day the clocks change is 23 or 25 hours, so it is the zone's
 * midnight each time, not a day's length). Nothing else moves them at midnight: a tab left open overnight said yesterday's totals
 * under "Today so far" until its first message. A page nobody is looking at reads as it comes in front; a surface read only where it
 * is drawn is read where its page is on screen and kept for its page elsewhere, as every pass does (hearing/passes.ts). A zone saved
 * moves the next midnight: the workspace's change (`workspace:changed`, told once the new zone is published) arms the timer again.
 * And Sent's runs are said to have moved: a run waiting for approval whose day has just passed waits on nobody now (contracts
 * runWaitsOnYou), so every count of what needs you and every page that draws the runs asks again, with no read (S7-3); and
 * so they are once today's sending hours end, when a visit's run made for today is too late (sendingEndsAt).
 *
 * Moved whole from surface-runner.ts (the wiring's second audit, lane R9), its read now the one pass's.
 */
import { sendingEndsAt } from "@chanlytics/contracts";
import { api } from "../api";
import type { SurfaceOverride } from "../surface-data";
import { surfaceMoved } from "../surface-status";
import { knownZone, msUntilTheDayTurns, pageClock, workspaceZone } from "../zone";
import { hearFront, pageHidden } from "./front";
import type { Passes } from "./passes";

/** How far past the end of the sending hours their re-judging waits: a timer that fires a hair early judges the hour it leaves. */
const PAST_THE_HOUR_MS = 1_000;

/** What the day's watch asks of the runner: its surfaces, the one pass, and whether it has stopped. */
export interface DayRun {
  readonly overrides: readonly SurfaceOverride[];
  readonly passes: Pick<Passes, "again">;
  stopped(): boolean;
}

/** Watch the business's day turn; answers the stop. Arms nothing where no surface counts the day. */
export function watchTheDayTurn(run: DayRun, win: Window = window): () => void {
  const counting = run.overrides.filter((o) => o.readAtMidnight);
  if (!counting.length) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  // The end of today's sending hours: a visit's run made for today waits on nobody after it (sendingEndsAt).
  let sendingTimer: ReturnType<typeof setTimeout> | null = null;
  let owed = false;
  let stopped = false;
  /** Which arming is the latest: one still waiting for the zone when another begins gives way to it. */
  let armings = 0;
  const read = () => {
    owed = false;
    // A read already out was sent before the day turned: the reads this asks for share none (refreshSoon).
    api().forget();
    void run.passes.again("midnight", counting);
  };
  const arm = async (): Promise<void> => {
    const mine = (armings += 1);
    const zone = knownZone(win) ?? (await workspaceZone(win).catch(() => pageClock().zone()));
    if (stopped || run.stopped() || mine !== armings) return;
    if (timer) clearTimeout(timer);
    if (sendingTimer) clearTimeout(sendingTimer);
    let wait: number;
    let sendingEnds: Date | null;
    try {
      wait = msUntilTheDayTurns(zone, Date.now());
      sendingEnds = sendingEndsAt(zone, new Date());
    } catch {
      return; // a zone the browser cannot read: the day is not turned by a clock here
    }
    // Once today's sending hours end, the runs that wait for a word are judged again (the count, the head, the bell's "is
    // ready" row): a visit's run made for today is too late from then, and Approve would be refused.
    if (sendingEnds)
      sendingTimer = setTimeout(
        () => surfaceMoved("broadcasts"),
        sendingEnds.getTime() - Date.now() + PAST_THE_HOUR_MS,
      );
    timer = setTimeout(() => {
      surfaceMoved("broadcasts");
      if (pageHidden()) owed = true;
      else read();
      void arm();
    }, wait);
  };
  const onFront = () => {
    if (owed && !pageHidden()) read();
  };
  const onZone = () => void arm();
  const unhearFront = hearFront(onFront, win);
  win.addEventListener("workspace:changed", onZone);
  void arm();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (sendingTimer) clearTimeout(sendingTimer);
    unhearFront();
    win.removeEventListener("workspace:changed", onZone);
  };
}
