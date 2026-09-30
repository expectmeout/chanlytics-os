/**
 * The day (moved from pages/dashboard-a-day.jsx, decision 0015, step 4): today and tomorrow from the calendar the
 * receptionist reads -- who is coming and when, what is open, what is closed -- and the visit playbooks' line. Reads
 * the calendar and playbooks surfaces the page already holds, and People for a visit that needs someone and a person's
 * channel -- People lands last on a cold boot (surface-registry.ts ROUTE_DRAWS), so the card redraws on it too; the
 * words are contracts/today.ts todayDay, which the page reaches as TODAY_HELPERS. Silent without a feed -- that is the
 * Calendar page's card to make -- but never silent about a feed it HAS and could not read.
 * An appointment opens its person when the calendar names one, else the Calendar; nothing is booked or changed from
 * here. Five rows at most, the rest a line to the Calendar (contracts TODAY_DAY_MAX); a calendar read that failed
 * says so where the day would be.
 *
 * At its head, the steps due (0007, amended): whose next step's day has come or gone, the oldest first, three at most
 * and a line to People's Steps due for the rest (contracts todaySteps, TODAY_STEPS_MAX). In every workspace,
 * calendar or not: with no day to draw, the panel is the steps alone.
 *
 * The one row every list of appointments wears (components/day-agenda.jsx) is the shell's, borrowed through the doors
 * of ../shell: the JSX drew AgendaItems, AgendaItem and AgendaOpen as bare globals, and a page without them threw a
 * ReferenceError where it drew one, which `present` says again.
 */
import type { ComponentType, ReactNode } from "react";
import type {
  CalendarLike,
  PlaybookCardLike,
  TodayDayFrameVM,
  TodayDayItemVM,
  TodayDayVM,
  TodayStepsVM,
} from "@chanlytics/contracts";
import type { CalendarSurface } from "@/surfaces/calendar/surface";
import type { PeopleSurface } from "@/surfaces/people/surface";
import type { PlaybooksSurface } from "@/surfaces/campaigns/playbooks/surface";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { TODAY_HELPERS } from "../helpers";
import {
  agendaItem,
  agendaItems,
  agendaOpen,
  appNavigate,
  borrowed,
  workspaceClock,
  surfaceFailed,
  useMoved,
} from "../shell";
import { Button } from "../../kit/button/button";

/** Move to a route (the frame's `appNavigate`). */
type Nav = (to: string) => void;

/** What the shell's agenda row takes (components/day-agenda.jsx `AgendaItem`). */
interface AgendaItemProps {
  time: string;
  name: string;
  service: string | null;
  dur: string;
  flag: string | null;
  glyph: string | null;
  phase: string;
  onOpen: () => void;
  hint: string;
  testid: string;
}

/** What the shell's agenda list and its open windows take: the rows, or the windows, as children (`AgendaItems`, `AgendaOpen`). */
interface AgendaChildren {
  children?: ReactNode;
}

/** A component of the shell the page draws, or the ReferenceError the JSX threw where it named a global that is not there. */
function present<P>(name: string, door: ComponentType<P> | undefined): ComponentType<P> {
  if (!door) throw new ReferenceError(`${name} is not defined`);
  return door;
}

// The steps due, as contracts says them, in the day's own frame: each opens its person. Hookless.
const TodaySteps = ({ vm, nav }: { vm: TodayStepsVM; nav: Nav }) => {
  const more = vm.more;
  return (
    <div className="td-frame td-steps" data-testid="today-steps">
      <div className="td-frame-head">
        <span className="td-frame-label">{vm.title}</span>
      </div>
      <ul className="td-steps-list">
        {vm.items.map((s) => (
          <li key={s.personId}>
            <button
              type="button"
              className="td-step"
              onClick={() => nav(`clients/${s.personId}`)}
              data-testid="today-step"
            >
              <span className="td-step-who">{s.name}</span>
              <span className="td-step-words">{s.words}</span>
              {s.forWho ? <span className="td-step-for">{s.forWho}</span> : null}
              <span className="td-step-when" data-due={s.due}>
                {s.when}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {more ? (
        <button type="button" className="td-day-more" onClick={() => nav(more.to)} data-testid="today-steps-more">
          <span>{more.words}</span>
          <Icon name="arrow-right" size={10} />
        </button>
      ) : null}
    </div>
  );
};

/** The channel a known person uses, as People knows it: a chat, or calls only. */
type GlyphFor = (b: TodayDayItemVM) => string | null;

/** What a press on an appointment opens: its person, else the Calendar. */
type Open = (b: TodayDayItemVM) => void;

/** The day's head: its title, when the next time is open, and the door to the Calendar. */
function dayHead(vm: TodayDayVM, nav: Nav) {
  return (
    <div className="td-day-head">
      <span className="td-day-title">The day</span>
      <span className="td-day-sub">{vm.nextOpening ? `next open time ${vm.nextOpening}` : ""}</span>
      <Button variant="quiet" size="sm" onClick={() => nav("calendar")}>
        Open Calendar <Icon name="arrow-right" size={11} />
      </Button>
    </div>
  );
}

/** A frame's head: its label, and either that it is closed or how many are booked. */
function frameHead(d: TodayDayFrameVM) {
  return (
    <div className="td-frame-head">
      <span className="td-frame-label">{d.label}</span>
      {d.closed.yes ? (
        <span className="td-frame-note">Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>
      ) : (
        d.summary && (
          <span className="td-frame-note tabular">
            {d.summary.booked}
            {d.summary.flagged && (
              <>
                {" · "}
                <b className="warn">{d.summary.flagged}</b>
              </>
            )}
          </span>
        )
      )}
    </div>
  );
}

/** The appointments, on the list the shell's agenda draws. */
function frameItems(items: TodayDayItemVM[], glyphFor: GlyphFor, open: Open) {
  const Items = present("AgendaItems", agendaItems<AgendaChildren>());
  return (
    <Items>
      {items.map((b) => {
        const Item = present("AgendaItem", agendaItem<AgendaItemProps>());
        return (
          <Item
            key={b.id}
            time={b.start}
            name={b.person ? b.person.name : b.service}
            service={b.person ? b.service : null}
            dur={b.dur}
            flag={b.flag}
            glyph={glyphFor(b)}
            phase={b.phase}
            onOpen={() => open(b)}
            hint={`${b.time}${b.person ? ` · open ${b.person.name}` : " · open the Calendar"}`}
            testid="today-day-item"
          />
        );
      })}
    </Items>
  );
}

/** What the receptionist would offer, under a day's rows. */
function frameOpen(windows: string[]) {
  const Windows = present("AgendaOpen", agendaOpen<AgendaChildren>());
  return (
    <Windows>
      {windows.map((w) => (
        <span key={w} className="ag-window">
          {w}
        </span>
      ))}
    </Windows>
  );
}

/** One day: its head, its appointments (or that there are none), the tail the cap left out, and the open windows. */
function dayFrame(d: TodayDayFrameVM, glyphFor: GlyphFor, open: Open, nav: Nav) {
  return (
    <div key={d.key} className={`td-frame ${d.today ? "today" : ""}`} data-testid="today-day-frame">
      {frameHead(d)}
      {/* The one row every list of appointments wears (components/day-agenda.jsx): the start in a column, a
          rail with the now marker, who it is for with what it is for and how long under them, and a red line
          when that person's thread needs someone. Nobody matched means the service is the headline itself.
          `service` is the title with the person's name taken out of it, so the row says them once. */}
      {d.items.length > 0
        ? frameItems(d.items, glyphFor, open)
        : !d.closed.yes && <div className="td-empty">Nothing on the calendar.</div>}
      {/* The cap's tail: contracts says how many the five rows left out. */}
      {d.more > 0 && (
        <button className="td-day-more" onClick={() => nav("calendar")} data-testid="today-day-more">
          <span>{d.moreLine}</span>
          <Icon name="arrow-right" size={10} />
        </button>
      )}
      {d.open.length > 0 && frameOpen(d.open)}
    </div>
  );
}

export const TodayDay = () => {
  useMoved(["calendar", "playbooks", "people"]);
  const C = borrowed<CalendarSurface>("__CALENDAR");
  const P = borrowed<PlaybooksSurface>("__PLAYBOOKS");
  const people = borrowed<PeopleSurface>("__PEOPLE");
  const go: Nav = (to) => appNavigate(to);
  const pageClock = workspaceClock();
  const tz = pageClock && pageClock.zone ? pageClock.zone() : "UTC";
  // Judged as every page judges a step: at the moment People's rows were published, as its own Steps due is.
  const stepsVm = people ? TODAY_HELPERS.steps(people.rows, people.fetchedAt || Date.now(), tz) : null;
  const steps = stepsVm ? <TodaySteps vm={stepsVm} nav={go} /> : null;
  // No day to draw: the panel is the steps alone, where any are due.
  const stepsOnly = steps ? (
    <section className="td-day" data-testid="today-day-steps">
      {steps}
    </section>
  ) : null;
  // The read failed, and the module would otherwise be silent about it: FailedRead, with the one Retry, where the day goes.
  if (!C && surfaceFailed("calendar")) {
    return (
      <section className="td-day" data-testid="today-day-failed">
        {steps}
        <FailedRead
          kind="card"
          what="the calendar"
          body="The queue and the day's numbers are current."
          surface="calendar"
          testid="today-day-failed-read"
        />
      </section>
    );
  }
  if (!C || !C.vm) return stepsOnly;
  const nav: Nav = (to) => appNavigate(to);
  // A calendar IS connected and could not be read. This returned null, and the card was simply not there --
  // a working day and a broken feed looked identical, which is how a bad address went two rounds unnoticed.
  // It says so now, where the day goes, in the feed's own words, with the one Retry and the door to the
  // address. The numbers beside it are from other reads and are still true, so the card says that too.
  if (C.vm.feed.state === "unavailable") {
    return (
      <section className="td-day" data-testid="today-day-unreadable">
        {steps}
        <FailedRead
          kind="card"
          what="the calendar"
          why={C.vm.feed.problem}
          body="The queue and the day's numbers are current."
          surface="calendar"
          also={{ label: "Open Calendar", onClick: () => nav("calendar"), testid: "today-day-unreadable-open" }}
          testid="today-day-unreadable-read"
        />
      </section>
    );
  }
  // No calendar connected: silent on purpose. Nothing has failed, there is nothing to retry, and the invitation
  // to connect one is the Calendar page's card to make -- not a fault reported on a page about today's work.
  if (C.vm.feed.state !== "ok") return stepsOnly;
  // The calendar's `now` is null when today is not in its span, and a playbook's `candidates` when the server could not
  // count it; todayDay reads the first only on today's frame, where it is a number, and its own types (CalendarLike,
  // PlaybookCardLike) say neither null: what the surfaces published is handed over as the JSX handed it.
  const vm = TODAY_HELPERS.day(C.vm as CalendarLike, (P ? P.rows : null) as PlaybookCardLike[] | null, people || null);
  if (!vm.frames.length) return stepsOnly;
  const open: Open = (b) => nav(b.person ? `clients/${b.person.id}` : "calendar");
  // The channel a known person uses, as People knows it: a chat, or calls only.
  const peopleRows = people ? people.rows : [];
  const glyphFor: GlyphFor = (b) => {
    const person = b.person;
    if (!person) return null;
    const r = peopleRows.find((x) => x.id === person.id);
    return !r ? null : r.hasChat ? "chat" : r.calls > 0 ? "phone" : null;
  };
  const reminders = vm.reminders;
  return (
    <section className="td-day" data-testid="today-day">
      {dayHead(vm, nav)}
      {steps}
      {vm.frames.map((d) => dayFrame(d, glyphFor, open, nav))}
      {reminders && (
        <button className="td-day-foot" onClick={() => nav(reminders.to)} data-testid="today-day-reminders">
          <Icon name="bolt" size={11} />
          <span>{reminders.text}</span>
          <Icon name="arrow-right" size={10} />
        </button>
      )}
    </section>
  );
};
