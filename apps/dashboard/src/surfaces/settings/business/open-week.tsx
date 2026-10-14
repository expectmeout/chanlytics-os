// Chanlytics — Settings › Business: When you're open, the week.
//
// The week as seven lines (23 Sep): a day is a switch and its times as boxes, the body of the hours fold (open.tsx
// BtHoursRow). It was drawn on one scale, a track of bars beside each day's boxes under an axis, and the row at rest
// carried the same week as a ribbon; the sentence says the week in full, and the graphic said nothing it did not.
// Split from open.tsx so no file is over the length the build holds; nothing of it changed.
//
// The rows that come and go inside a fold (a day's shifts) are drawn hookless but for their times, each the house's
// menu (MoreMenu) standing in the kit's box: a glass list of the day's half hours, the one held in the middle of it, where
// the browser's own picker drew in the system's colours (Ruben, 10 Oct 2026). The menu, not the kit's Picker: Settings
// loads no Base UI popup, and the Picker's Select and Combobox would put them on every Settings tab (the interface
// skill, "A list on a page that loads no Base UI popup"). The copy menu is always drawn.
import { Fragment } from "react";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import { clockLabel } from "@chanlytics/contracts";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { RecordSwitch } from "../../kit/record/field";
import type { BtFold } from "./gestures/fold";
import { businessTabSave } from "./saver";

type MenuItems = NonNullable<ComponentProps<typeof MoreMenu>["items"]>;
/** What BtFold hands its body. */
type FoldFields<D> = Parameters<ComponentProps<typeof BtFold<D>>["body"]>[0];

/* ------------------------------------ the week ------------------------------------ */

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
interface Shift {
  open: string;
  close: string;
}
interface Day {
  isOpen: boolean;
  shifts: Shift[];
}
export type Week = Record<DayKey, Day>;

// The days of the week in the schema's order, as the fold names them: the switch says the whole name, the row the short.
const BTO_DAYS: [DayKey, string, string][] = [
  ["mon", "Monday", "Mon"],
  ["tue", "Tuesday", "Tue"],
  ["wed", "Wednesday", "Wed"],
  ["thu", "Thursday", "Thu"],
  ["fri", "Friday", "Fri"],
  ["sat", "Saturday", "Sat"],
  ["sun", "Sunday", "Sun"],
];
const BTO_SHORT = Object.fromEntries(BTO_DAYS.map(([d, , short]) => [d, short])) as Record<DayKey, string>;
const BTO_LONG = Object.fromEntries(BTO_DAYS.map(([d, long]) => [d, long])) as Record<DayKey, string>;
const BTO_WEEKDAYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];

// A shift's box, named for its day, what it does and its place: "Monday opens", "Monday closes, second shift". The
// first shift needs no place; the fold takes four at most (LIMITS.shifts).
const BTO_PLACE = ["", "second", "third", "fourth", "fifth", "sixth"];
const btoShiftName = (long: string, n: number, does: string) =>
  n === 0 ? `${long} ${does}` : `${long} ${does}, ${BTO_PLACE[n] || `${n + 1}th`} shift`;

/** The same shifts, in the same order? Used to tell a no-op from a loss. */
const btoSameShifts = (a: Day, b: Day) =>
  a.isOpen === b.isOpen &&
  a.shifts.length === b.shifts.length &&
  a.shifts.every((s, i) => s.open === b.shifts[i]?.open && s.close === b.shifts[i]?.close);

/** What BtFold hands the week's body. */
type WeekFields = FoldFields<Week>;

/** A time as the week stores it ("09:30"), in minutes from midnight. */
const btoMinutes = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};

/** A time as the page says one: "9 AM", "9:30 AM" (contracts clockLabel, the Calendar's). */
const btoTimeWords = (t: string) => clockLabel(btoMinutes(t) / 60);

/** The times a shift is picked from: every half hour of the day, as the week stores them, "00:00" to "23:30". */
const BTO_TIMES = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);

/** Where the night's hours end: the morning's first minute. */
const BTO_NIGHT_ENDS = 5 * 60;
/**
 * Where a time stands in the menu: the morning first, and the night's hours after the evening, folded on a phone
 * (MoreMenu `fold`): few businesses open then, and they stood first, over midnight's rows (Ruben, 14 Oct 2026).
 */
const btoDayOrder = (t: string) => btoMinutes(t) + (btoMinutes(t) < BTO_NIGHT_ENDS ? 24 * 60 : 0);
/** The part of the day each time falls in, from its first minute: a heading over its times, so a long list is read. */
const BTO_PARTS: [number, string][] = [
  [0, "Night"],
  [BTO_NIGHT_ENDS, "Morning"],
  [12 * 60, "Afternoon"],
  [17 * 60, "Evening"],
];

/** What one time menu picks from: the time it holds, what it does, where it starts, and the opening a closing follows. */
interface TimeChoice {
  value: string;
  does: "opens" | "closes";
  /** Where the list opens when it holds no time: nine in the morning, or eight hours after the opening. */
  start: string;
  /** The opening a closing is picked after: its times are the ones after it, each with how long the shift runs. */
  after: string | null;
  pick: (time: string) => void;
}

/**
 * A time menu's items: the half hours under the part of the day each falls in, the one held ticked (kept in the list
 * where it is off the half hour: a record typed elsewhere), and for a closing only the times after its opening, each
 * with how long the shift would run ("8 h 30 min", contracts lengthWords), so the closing is picked by the day it
 * makes.
 */
const btoTimeItems = (c: TimeChoice): NonNullable<ComponentProps<typeof MoreMenu>["items"]> => {
  const from = c.after ? btoMinutes(c.after) : -1;
  const times = [...new Set([...BTO_TIMES, ...(c.value ? [c.value] : [])])]
    .filter((t) => t === c.value || btoMinutes(t) > from)
    .sort((a, b) => btoDayOrder(a) - btoDayOrder(b));
  const items: NonNullable<ComponentProps<typeof MoreMenu>["items"]> = [];
  let part = "";
  for (const t of times) {
    const heading = [...BTO_PARTS].reverse().find(([at]) => btoMinutes(t) >= at)?.[1] ?? "";
    if (heading !== part) {
      items.push({ header: heading, fold: btoMinutes(t) < BTO_NIGHT_ENDS });
      part = heading;
    }
    items.push({
      label: btoTimeWords(t),
      value: t,
      checked: t === c.value,
      start: !c.value && t === c.start,
      hint: c.after ? BUSINESS_TAB.lengthWords(btoMinutes(t) - from) : undefined,
      onClick: () => c.pick(t),
    });
  }
  return items;
};

/**
 * Escape closes an open menu (a time's, the copy's) and nothing else: the fold's own Escape is Cancel, and with a menu
 * open over it one key would have closed the menu and asked to discard the week. The fold leaves a key alone once
 * something inside took it (the kit's recKeys). Held once, by the week, for every menu in it.
 */
const btoHoldEscape = (e: KeyboardEvent<HTMLElement>) => {
  const up =
    e.key === "Escape" &&
    e.currentTarget &&
    "querySelector" in e.currentTarget &&
    e.currentTarget.querySelector<HTMLElement>('[aria-expanded="true"]');
  if (up) e.preventDefault();
};

type Press = WeekFields["press"];
type Change = WeekFields["change"];

/** What the week's controls do to the draft: a day's shifts as a list with a list's rules, and the day's switch. */
interface WeekActs {
  shiftsOf: (d: DayKey) => ReturnType<WeekFields["rows"]>;
  toggleDay: (d: DayKey) => void;
  setShift: (d: DayKey, n: number, k: keyof Shift, v: string) => void;
  addShift: (d: DayKey) => void;
  removeShift: (d: DayKey, n: number) => void;
}

/**
 * The words said after "Copy Mon's hours": the days that were closed and are now open, and the days whose own hours were
 * replaced. Said only when it happened, and put back whole by the one Undo (BtFold's change).
 */
const btoCopyNotes = (week: Week, src: Day, days: DayKey[]): ReactNode[] => {
  const opened = days.filter((d) => !week[d].isOpen);
  const replaced = days.filter((d) => week[d].isOpen && !btoSameShifts(week[d], src));
  const names = (list: DayKey[]) => list.map((d) => BTO_SHORT[d]).join(", ");
  const notes: ReactNode[] = [];
  if (opened.length)
    notes.push(
      <>
        <b>{names(opened)}</b> {opened.length === 1 ? "was" : "were"} closed and {opened.length === 1 ? "is" : "are"}{" "}
        now open
      </>,
    );
  if (replaced.length)
    notes.push(
      <>
        replaced different hours on <b>{names(replaced)}</b>
      </>,
    );
  return notes;
};

/**
 * Copy one day's hours onto others — and SAY what that did.
 *
 * This is where the salon lost its Sundays: a whole-day replace across seven
 * days, from a link sitting inches from two other links, with a toast that
 * counted successes. The button still does what it says, because "make the
 * week look like Monday" is the thing people want. What changed is that the
 * surprising part is named — days that were CLOSED and are now open, and
 * days whose own hours (a lunch break, a late Thursday) were replaced — and
 * that the whole grid can be put back in one click.
 */
const btoApplyToAll = (week: Week, change: Change, from: DayKey, days: DayKey[]) => {
  const src = week[from];
  if (!src.isOpen) return;
  const notes = btoCopyNotes(week, src, days);
  const before = {} as Week;
  BTO_DAYS.forEach(([d]) => {
    before[d] = { isOpen: week[d].isOpen, shifts: week[d].shifts.map((s) => ({ ...s })) };
  });
  // Said only when it happened, and put back whole by the one Undo (BtFold's change).
  change(
    (h) => {
      const next = { ...h };
      days.forEach((d) => {
        next[d] = { isOpen: true, shifts: src.shifts.map((s) => ({ ...s })) };
      });
      return next;
    },
    {
      said: notes.length ? (
        <>
          Copied {BTO_SHORT[from]}&apos;s hours —{" "}
          {notes.map((n, i) => (
            <Fragment key={i}>
              {i ? ", and " : ""}
              {n}
            </Fragment>
          ))}
        </>
      ) : (
        <>Copied {BTO_SHORT[from]}&apos;s hours — nothing else changed</>
      ),
      back: () => before,
    },
  );
};

/** The week's controls over its draft. */
const btoWeekActs = (week: Week, f: WeekFields): WeekActs => {
  const { update, rows } = f;
  // A day's shifts are a list inside the week, with a list's rules from BtFold (rows): the cap the write schema keeps
  // (LIMITS.shifts, contracts MAX_INTERVALS_PER_DAY) when adding and when an Undo puts one back, the removal said only
  // when it happened, and the removed shift back at its own index.
  const shiftsOf = (d: DayKey) =>
    rows({
      // Each day's shifts are a list of their own, whose put-backs no other day's changes move.
      id: `hours-${d}`,
      name: (n) => `hours-${d}-${n}`,
      max: businessTabSave.LIMITS.shifts,
      blank: () => ({ open: "", close: "" }),
      keysOf: () => [`hours-${d}`],
      full: `${BTO_LONG[d]} already has the most shifts a day takes. Remove one first.`,
      list: (h) => h[d].shifts,
      put: (h, shifts) => ({ ...h, [d]: { ...h[d], shifts } }),
    });
  const setDay = (d: DayKey, patch: Partial<Day>) =>
    update((h) => ({ ...h, [d]: { ...h[d], ...patch } }), [`hours-${d}`]);
  /**
   * Toggling a day closed KEEPS its shifts.
   *
   * The switch sits about ten pixels from the times. Dropping the shifts on
   * the way through would mean an accidental tap costs an owner four times and
   * the decision about lunch, with the day switch offering no undo — and
   * reopening the day would present empty boxes as if nothing had been there.
   * The save is what decides a closed day stores nothing.
   */
  return {
    shiftsOf,
    toggleDay: (d) => {
      setDay(d, {
        isOpen: !week[d].isOpen,
        shifts: week[d].shifts.length ? week[d].shifts : [{ open: "", close: "" }],
      });
    },
    setShift: (d, n, k, v) => {
      shiftsOf(d).setAt(n, { [k]: v });
    },
    addShift: (d) => {
      shiftsOf(d).add();
    },
    removeShift: (d, n) => {
      shiftsOf(d).removeAt(n, (row) => {
        const gone = row as Shift;
        return (
          <>
            Removed the {BTO_SHORT[d]} shift
            {gone.open ? (
              <>
                {" "}
                at <b>{gone.open}</b>
              </>
            ) : null}
          </>
        );
      });
    },
  };
};

/**
 * One time of a shift: the house's menu in the kit's box, its words the time it holds ("9:30 AM", or "Set" while it
 * holds none), named for its day, what it does and its place ("Monday opens: 9:30 AM"), wrong by the day's sentence,
 * and shut while a save is out. Its value and id are the box's, so a reader and a test find it as they found the box.
 */
const BtoTime = ({
  id,
  name,
  bad,
  readOnly,
  choice,
}: {
  id: string;
  name: string;
  bad: string | null;
  readOnly: boolean;
  choice: TimeChoice;
}) => (
  <span className="bt-time-pick">
    <MoreMenu
      // While a save is out a time takes no change, as the box it replaced took no typing (aria-disabled, below).
      items={btoTimeItems(readOnly ? { ...choice, pick: () => undefined } : choice)}
      label={choice.value ? btoTimeWords(choice.value) : "Set"}
      title={name}
      ariaLabel={choice.value ? `${name}: ${btoTimeWords(choice.value)}` : name}
      btnClass="rec-input rec-select bt-time"
      align="left"
      escape
      grid
      boxAttrs={{
        id,
        value: choice.value,
        "data-empty": choice.value ? undefined : "true",
        "aria-invalid": bad ? true : undefined,
        "aria-describedby": bad || undefined,
        "aria-disabled": readOnly ? true : undefined,
      }}
      gated={readOnly ? "Saving — the hours can be changed once this is saved." : null}
    />
  </span>
);

/**
 * One day of the week, on one line: a switch, its times as boxes, a break to add at the end of its first shift, and
 * what is wrong with it. Hookless: a day's shifts come and go.
 */
const BtoDay = ({
  d,
  long,
  short,
  day,
  bad,
  readOnly,
  acts,
  press,
}: {
  d: DayKey;
  long: string;
  short: string;
  day: Day;
  bad: string | null;
  readOnly: boolean;
  acts: WeekActs;
  press: Press;
}) => {
  const problemId = `bt-hours-${d}-problem`;
  const kept = !day.isOpen && day.shifts.some((s) => s.open || s.close);
  const list = acts.shiftsOf(d);
  return (
    <div className="bt-week-row" data-testid={`rec-hours-day-${d}`} data-open={day.isOpen ? "true" : "false"}>
      <span className="bt-week-day">
        <RecordSwitch
          on={day.isOpen}
          onChange={() => acts.toggleDay(d)}
          label={long}
          readOnly={readOnly}
          testid={`rec-hours-switch-${d}`}
        />
        <span className="bt-week-name">{short}</span>
      </span>
      <span className="bt-week-times">
        {day.isOpen ? (
          <>
            {day.shifts.map((sh, n) => (
              <span key={n} className="bt-week-shift" {...list.row(n)}>
                {/* The kit's box for a row of a list, named for its day and its place ("Monday closes, second
                    shift"): the day's one sentence is drawn once, under the row, and both boxes are wrong by it. */}
                <BtoTime
                  id={`bt-hours-${d}-${n}-open`}
                  name={btoShiftName(long, n, "opens")}
                  bad={bad ? problemId : null}
                  readOnly={readOnly}
                  choice={{
                    value: sh.open,
                    does: "opens",
                    start: (n > 0 && day.shifts[n - 1]?.close) || "09:00",
                    after: null,
                    pick: (t) => acts.setShift(d, n, "open", t),
                  }}
                />
                <span className="bt-week-to" aria-hidden="true">
                  –
                </span>
                <BtoTime
                  id={`bt-hours-${d}-${n}-close`}
                  name={btoShiftName(long, n, "closes")}
                  bad={bad ? problemId : null}
                  readOnly={readOnly}
                  choice={{
                    value: sh.close,
                    does: "closes",
                    start: sh.open
                      ? BTO_TIMES.find((t) => btoMinutes(t) >= btoMinutes(sh.open) + 8 * 60) || "23:30"
                      : "17:00",
                    after: sh.open || null,
                    pick: (t) => acts.setShift(d, n, "close", t),
                  }}
                />
                {/* Each shift's line ends in its one act: the first shift's adds a break, where the day takes one more
                    (rows' canAdd: the write schema refuses more), and a later shift's removes it. The first shift has
                    no remove: the switch on the left already means "closed", and two ways to say the same thing is
                    how one of them gets misread. */}
                {n > 0 ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={`Remove ${long} shift ${n + 1}`}
                    {...press(() => acts.removeShift(d, n))}
                    data-testid={`rec-hours-remove-${d}-${n}`}
                  >
                    <Icon name="x" size={11} />
                  </button>
                ) : list.canAdd ? (
                  <button
                    type="button"
                    className="bt-week-break"
                    {...press(() => acts.addShift(d))}
                    aria-label={`Add a break to ${long}`}
                    data-tip="Add a break"
                    data-testid={`rec-hours-add-${d}`}
                  >
                    <Icon name="plus" size={10} />
                    <span className="bt-week-break-word"> break</span>
                  </button>
                ) : null}
              </span>
            ))}
          </>
        ) : (
          <span className="bt-week-closed">{kept ? "Closed — times kept" : "Closed"}</span>
        )}
      </span>
      <FieldError id={problemId} message={bad} testid={`rec-hours-problem-${d}`} />
    </div>
  );
};

/**
 * One menu, where the form had two links inches from each other on Monday's row alone. It copies the first day that
 * is open, which is Monday for nearly everyone and the one day there is to copy for a business shut on Mondays: to
 * every day and to the weekdays, as the two links did, and to each other day by its name.
 */
const btoCopies = (from: DayKey | null, apply: (from: DayKey, days: DayKey[]) => void): MenuItems => {
  if (!from) return [];
  const others = (list: DayKey[]) => list.filter((d) => d !== from);
  const lead: MenuItems = [
    { label: "Every day", onClick: () => apply(from, others(BTO_DAYS.map(([d]) => d))) },
    { label: "Weekdays", onClick: () => apply(from, others(BTO_WEEKDAYS)) },
    { divider: true },
  ];
  return lead.concat(
    others(BTO_DAYS.map(([d]) => d)).map((d) => ({ label: BTO_LONG[d], onClick: () => apply(from, [d]) })),
  );
};

/**
 * The week's copy menu. The menu is always drawn: a hook of its own sits in it. A copy says what it named and overwrote
 * in its own toast, with the whole week back in one Undo, so the sentence that said so under the menu went.
 */
const BtoWeekCopy = ({ from, copies, readOnly }: { from: DayKey | null; copies: MenuItems; readOnly: boolean }) => (
  <div className="bt-week-copy">
    <div className="bt-week-copy-menu" hidden={from ? undefined : true} data-testid="rec-hours-copy">
      <MoreMenu
        items={copies}
        label={`Copy ${from ? BTO_LONG[from] : "a day"} to…`}
        title="Copy one day's hours onto others"
        btnClass="bt-link"
        align="left"
        escape
        gated={readOnly ? "Saving — nothing can be copied until this is saved." : null}
      />
    </div>
  </div>
);

/**
 * The week as seven lines (23 Sep): a day is a switch and its times as boxes. It was drawn on one scale, a track of
 * bars beside each day's boxes under an axis, and the row at rest carried the same week as a ribbon; the sentence says
 * the week in full, and the graphic said nothing it did not. Hookless but for the one menu, which is always drawn: a
 * day's shifts come and go.
 */
export const BtoWeek = (f: WeekFields) => {
  const week = f.draft;
  const acts = btoWeekActs(week, f);
  // Most businesses keep one set of weekday hours. Typing the same two times
  // five more times is the kind of chore that makes people leave the field
  // blank, and blank hours are what the receptionist cannot answer with.
  const from = (BTO_DAYS.find(([d]) => week[d].isOpen) || [null])[0];
  const copies = btoCopies(from, (day, days) => btoApplyToAll(week, f.change, day, days));
  return (
    // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- the week only holds Escape for the menus in it (btoHoldEscape); every control in it is a real button
    <div className="bt-week" data-testid="rec-hours-week" onKeyDown={btoHoldEscape}>
      {BTO_DAYS.map(([d, long, short]) => (
        <BtoDay
          key={d}
          d={d}
          long={long}
          short={short}
          day={week[d]}
          bad={f.problems[`hours-${d}`] || null}
          readOnly={f.readOnly}
          acts={acts}
          press={f.press}
        />
      ))}
      <BtoWeekCopy from={from} copies={copies} readOnly={f.readOnly} />
    </div>
  );
};
