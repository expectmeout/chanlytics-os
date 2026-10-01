/**
 * The strip under Today's head in Glass (canvas E3): who is on the line right now, the next appointment, and when the
 * receptionist next has time -- three facts the page already holds (the Live surface, the day's own view model), in
 * one row of cells across the page. Classic draws none of it: the call rides above the queue there (queue.tsx
 * LiveRail) and the day's card says the rest. Drawn by the Glass composition alone (today-page.tsx), and nothing at
 * all with no call up, no calendar and no opening to say. The next appointment is a fact here, not a door: the day is
 * the Calendar's, which the rail opens (E3 draws no day pane). The call's cell is E3's: the dot, "On the line", the
 * clock, the bars that move while it lasts, and Listen in; the caller's name is the button's label for a reader.
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

/** "Dulce Amaro · Color · 1h 30m": who or what, and how long; the start stands before it, in bold. */
function nextRest(b: TodayDayItemVM): string {
  const what = b.person ? [b.person.name, b.service].filter(Boolean) : [b.service];
  return [what.join(" · "), b.dur].filter(Boolean).join(" · ");
}

/** The eight bars that move while a call lasts (E3's waveform): drawn once, moved by the sheet. */
const WAVE = Array.from({ length: 8 }, (_, i) => <i key={i} />);

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
  const phase = next?.phase === "now" ? "Now" : "Next";
  return (
    <div className="today-strip" data-testid="today-strip">
      {call && (
        <div className="ts-cell ts-live" data-testid="today-strip-live">
          <span className="ts-live-dot" aria-hidden="true" />
          <span className="ts-words">On the line</span>
          <span className="ts-clock tabular">{liveClock(elapsed)}</span>
          <span className="ts-wave" aria-hidden="true">
            {WAVE}
          </span>
          {live.length > 1 && <span className="ts-more">+{live.length - 1} more</span>}
          <Button
            variant="secondary"
            size="sm"
            className="ts-listen"
            aria-label={`Listen in: ${call.who} on the line`}
            onClick={() => appNavigate(`live/${call.callId}`)}
          >
            Listen in
          </Button>
        </div>
      )}
      {next && (
        <div className="ts-cell ts-next" data-testid="today-strip-next">
          <span className="ts-eyebrow">{phase}</span>
          <span className="ts-words" data-phase={phase}>
            <b>{next.start}</b> <span className="ts-rest">{nextRest(next)}</span>
          </span>
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
