/**
 * The strip under Today's head in Glass (canvas E3): who is on the line right now, the next appointment, and when the
 * receptionist next has time -- three facts the page already holds (the Live surface, the day's own view model), in
 * one row of cells across the page. Classic draws none of it: the call rides above the queue there (queue.tsx
 * LiveRail) and the day's card says the rest. Drawn by the Glass composition alone (today-page.tsx), and nothing at
 * all with no call up, no calendar and no opening to say. The next appointment is a fact here, not a door: the day's
 * card, in the column beside the bell, opens it.
 */
import type { TodayDayItemVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { appNavigate } from "../shell";
import { useDayVm } from "./day";
import { liveClock, useLiveNow } from "./live-now";

/** The next appointment today: the one under way, else the next to come. */
function nextOf(items: TodayDayItemVM[]): TodayDayItemVM | null {
  return items.find((b) => b.phase === "now") ?? items.find((b) => b.phase === "next") ?? null;
}

/** "5:00 PM Dulce Amaro · Color · 1h 30m": the appointment's start, who or what, and how long. */
function nextWords(b: TodayDayItemVM): string {
  const what = b.person ? [b.person.name, b.service].filter(Boolean) : [b.service];
  return [`${b.start} ${what.join(" · ")}`, b.dur].filter(Boolean).join(" · ");
}

export const TodayStrip = () => {
  const { live, nowMs } = useLiveNow();
  const day = useDayVm();
  const today = day?.frames.find((f) => f.today) ?? null;
  const next = today ? nextOf(today.items) : null;
  const call = live[0] ?? null;
  const opening = day?.nextOpening ?? null;
  const closed = today?.closed.yes ? today.closed : null;
  if (!call && !next && !opening && !closed) return null;
  const elapsed = call ? Math.max(0, Math.floor((nowMs - (call.startedAtMs || nowMs)) / 1000)) : 0;
  return (
    <div className="today-strip" data-testid="today-strip">
      {call && (
        <div className="ts-cell ts-live" data-testid="today-strip-live">
          <span className="live-dot" />
          <span className="ts-words">
            <b>{call.who}</b> on the line
          </span>
          <span className="ts-clock tabular">{liveClock(elapsed)}</span>
          {live.length > 1 && <span className="ts-more">+{live.length - 1} more</span>}
          <Button variant="quiet" size="sm" onClick={() => appNavigate(`live/${call.callId}`)}>
            Listen in
          </Button>
        </div>
      )}
      {next && (
        <div className="ts-cell ts-next" data-testid="today-strip-next">
          <span className="ts-eyebrow">{next.phase === "now" ? "Now" : "Next"}</span>
          <span className="ts-words">{nextWords(next)}</span>
        </div>
      )}
      {(opening || closed) && (
        <div className="ts-cell ts-open" data-testid="today-strip-open">
          <span className={`ts-capsule${closed ? " ts-closed" : ""}`}>
            {closed ? `Closed today${closed.note ? ` · ${closed.note}` : ""}` : `Next open time ${opening}`}
          </span>
        </div>
      )}
    </div>
  );
};
