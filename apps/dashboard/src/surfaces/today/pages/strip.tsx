/**
 * The strip under Today's head in Glass (canvas E3): the next appointment, and when the receptionist next has time -- facts
 * the day's own view model holds, in one row of cells across the page. Classic draws none of it: the day's card says it
 * there. Drawn by the Glass composition alone (today-page.tsx), and nothing at all with no calendar and no opening to say.
 * The next appointment is drawn as E3 draws it, and opens the appointment it names (its record, else its day on the
 * Calendar): every link to a visit opens it (the wiring's second audit, S9-7), and E3 draws no day pane. A call on the
 * line is not the page's: it is the header's, on every page (Ruben, 20 Oct 2026; frame/topbar/status-bars.tsx).
 */
import type { TodayDayItemVM } from "@chanlytics/contracts";
import { routeDoor } from "../../legacy-verbs";
import { usePartShown, useSurface } from "../../use-surface";
import { useDayVm } from "./day";

/** The next appointment today: the one under way, else the next to come. */
function nextOf(items: TodayDayItemVM[]): TodayDayItemVM | null {
  return items.find((b) => b.phase === "now") ?? items.find((b) => b.phase === "next") ?? null;
}

/**
 * "Dulce Amaro · Color · 1h 30m": who or what, and how long; the start stands before it, in bold. A visit a member said
 * kept and still under way says so ("· Kept"); one said missed is never here (nextOf), nor one said cancelled (todayDay).
 */
function nextRest(b: TodayDayItemVM): string {
  const what = b.person ? [b.person.name, b.service].filter(Boolean) : [b.service];
  return [what.join(" · "), b.dur, b.said?.word].filter(Boolean).join(" · ");
}

export const TodayStrip = () => {
  const day = useDayVm();
  // Drawn once the Calendar's weeks are in, whatever they hold (client/page-speed.ts).
  usePartShown("today", "strip", useSurface("calendar") !== undefined);
  const today = day?.frames.find((f) => f.today) ?? null;
  const next = today ? nextOf(today.items) : null;
  const opening = day?.nextOpening ?? null;
  const closed = today?.closed.yes ? today.closed : null;
  if (!next && !opening && !closed) return null;
  const phase = next?.phase === "now" ? "Now" : "Next";
  return (
    <div className="today-strip" data-testid="today-strip">
      {next && (
        <a
          className="ts-cell ts-next"
          {...routeDoor(next.to)}
          title={`Open ${next.person ? next.person.name : next.service || "it"} on the Calendar`}
          data-testid="today-strip-next"
        >
          <span className="ts-eyebrow">{phase}</span>
          <span className="ts-words" data-phase={phase}>
            <b>{next.start}</b> <span className="ts-rest">{nextRest(next)}</span>
          </span>
        </a>
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
