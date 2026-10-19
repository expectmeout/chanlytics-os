/**
 * Campaigns on the board (the Calendar's lane C): the marks a day carries (contracts calendarRunMarksOf), drawn where they
 * never read as a booked chair. In Week and Day a mark with a time stands at its minute as a moment (blocks.tsx CrMoment);
 * one of the day alone (a run waiting, a last day, cold email) sits in the day lane under the dates with the all-day
 * events, two at most and then "+N", every one in Day view (Ruben, 18 Oct 2026: not in the column's head). In Month one
 * named line (a one-off send, a run waiting, a last day) and "+N"; in the agenda a row among the visits. A press opens the
 * day's sheet (the kit's, its kicker the day): each mark with its facts and its one door, Sent for a run and Campaigns for a
 * campaign, and the day's own send. Approve and Skip stay on the run's sheet and Today's row (decision 0048): the Calendar
 * shows a run, it does not decide one.
 */
import { CALENDAR_RUN_SHEET_WORDS as W, type CalendarRunMark } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { Sheet } from "../kit/sheet/sheet";
import { navigate } from "../legacy-verbs";
import { composeRoute } from "../campaigns/home/address";

/** A mark's look: still to come is hollow, a run waiting is the page's one amber, a failed one is danger, the rest quiet. */
export function markLook(m: CalendarRunMark): string {
  if (m.tone === "warn") return "wait";
  if (m.tone === "danger") return "fail";
  return m.ahead ? "ahead" : "went";
}

/**
 * One mark as the day's head and the month draw it: its dot and its words, the time first where it has one. The month says
 * the name alone, its dot saying the rest, but for a last day, whose dot is a sent run's.
 */
export function RunMark({ m, onOpen, short = false }: { m: CalendarRunMark; onOpen: () => void; short?: boolean }) {
  const words =
    short && m.kind !== "last_day" ? m.name : [short ? "" : m.time, m.name, m.words].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      className="cal-run"
      data-look={markLook(m)}
      data-cold={m.cold || undefined}
      onClick={onOpen}
      title={[m.time, m.name, m.words].filter(Boolean).join(" · ")}
      data-testid="cal-run"
    >
      <span className="cal-run-dot" aria-hidden="true" />
      <span className="cal-run-words">{words}</span>
    </button>
  );
}

/** A day's marks in its head: `max` of them, then "+N", which opens the day's sheet as each mark does. */
export function DayMarks({
  marks,
  max,
  onOpen,
}: {
  marks: readonly CalendarRunMark[];
  max: number;
  onOpen: () => void;
}) {
  if (!marks.length) return null;
  const shown = marks.slice(0, max);
  const more = marks.length - shown.length;
  return (
    <span className="cal-runs" data-testid="cal-runs">
      {shown.map((m) => (
        <RunMark key={m.key} m={m} onOpen={onOpen} />
      ))}
      {more > 0 ? (
        <button type="button" className="cal-run cal-run-more" onClick={onOpen} data-testid="cal-runs-more">
          +{more}
        </button>
      ) : null}
    </span>
  );
}

/** One mark in the day's sheet: its words, what it folds, and its one door. */
function sheetRow(m: CalendarRunMark) {
  return (
    <li key={m.key} className="cal-run-row" data-look={markLook(m)} data-testid="cal-run-row">
      <span className="cal-run-dot" aria-hidden="true" />
      <div className="cal-run-row-words">
        <span className="cal-run-row-name">{m.name}</span>
        <span className="cal-run-row-says">{[m.time, m.words].filter(Boolean).join(" · ")}</span>
        {m.items.length > 1 ? (
          <ul className="cal-run-items">
            {m.items.map((it) => (
              <li key={it.route}>
                <Button variant="quiet" size="sm" onClick={() => navigate(it.route)}>
                  {it.name} · {it.words}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button variant="quiet" size="sm" onClick={() => navigate(m.route)} data-testid="cal-run-door">
        {m.door} <Icon name="arrow-right" size={10} />
      </Button>
    </li>
  );
}

/** The day's sheet of campaigns: each mark with its door, and the day's own send. */
export function RunSheet({
  day,
  marks,
  canSend,
  onClose,
}: {
  /** "Thu, Oct 15", or null while closed. */
  day: string | null;
  marks: readonly CalendarRunMark[];
  /** Whether this member may make a send (the composer's own gate decides the rest). */
  canSend: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={day !== null}
      onClose={onClose}
      title={W.kicker(day ?? "")}
      kicker
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      testid="cal-run-sheet"
    >
      <ul className="cal-run-list">{marks.map(sheetRow)}</ul>
      {canSend ? (
        <Button
          variant="quiet"
          size="sm"
          className="cal-run-send"
          onClick={() => navigate(composeRoute("once"))}
          data-testid="cal-run-schedule"
        >
          <Icon name="plus" size={12} /> {W.schedule}
        </Button>
      ) : null}
    </Sheet>
  );
}
