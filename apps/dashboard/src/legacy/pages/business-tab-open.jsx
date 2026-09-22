/* global React, Icon */
// Chanlytics — Settings › Business: When you're open.
//
// The second card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.3; the canvas's Record and
// Group-Open boards): the week as a ribbon and one sentence, the zone with the local time beside it, the days the week
// does not apply to, and the calendar the receptionist reads, saying what its last read found. Four rows, each edited
// where it is stated: the week and the closed days fold open under their rows, the zone is one value edited in its row,
// and the calendar's fold holds its one box. It replaces three sections of the form this page retires (BusinessEditor,
// settings.jsx: "When you are open", "Days you are closed", "Calendar it may look at") and its TimezoneRow, and what
// those learned came with them, comments and all.
//
// The page composes and never derives. The two sentences here with a number in them are contracts' (openWeekWords,
// closuresAheadWords, through window.__businessTab); the week's summary is the composer's own run-collapsing
// (window.__hoursLines, as the old card's hoursSummary calls it, never a second implementation); the zone's words are
// contracts' (window.__tz); what the calendar's last read found is the Calendar page's own view model
// (window.__CALENDAR, contracts toCalendarVM). What a fold opens with, refuses and writes is business-tab-folds.jsx's,
// and the gestures every row and fold share are BtRow and BtFold (business-tab-gestures.jsx), read from window as each
// card draws.
//
// Loaded after business-tab-gestures.jsx and before business-tab.jsx (both load lists), and read there as
// window.BtOpenCard. Its top-level names are bto-prefixed, and no pattern in it holds an object rest, for the reasons
// business-tab-save.jsx gives. And the rule of the tests' stub React holds here as it does for the gestures
// (business-tab-gestures.jsx's header): every component that holds a
// hook is drawn on every render, so the rows that come and go inside a fold (a day's shifts, the closed days) are
// drawn hookless, as plain boxes wearing the kit's class, and the one menu is always drawn.

const { useState: useBtoState, useEffect: useBtoEffect, useRef: useBtoRef } = React;

/* ------------------------------------ the week ------------------------------------ */

// The days of the week in the schema's order, as the fold names them: the switch says the whole name, the row the short.
const BTO_DAYS = [["mon", "Monday", "Mon"], ["tue", "Tuesday", "Tue"], ["wed", "Wednesday", "Wed"], ["thu", "Thursday", "Thu"], ["fri", "Friday", "Fri"], ["sat", "Saturday", "Sat"], ["sun", "Sunday", "Sun"]];
const BTO_SHORT = Object.fromEntries(BTO_DAYS.map(([d, , short]) => [d, short]));
const BTO_LONG = Object.fromEntries(BTO_DAYS.map(([d, long]) => [d, long]));
const BTO_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];

// The one scale the week is drawn on, in minutes from midnight: 6 AM to 10 PM, the canvas's axis. A bar's place comes
// from its times and this, never from a typed percentage; the axis labels are read off the same two numbers.
const BTO_SCALE = { from: 6 * 60, to: 22 * 60 };
const BTO_AXIS = [0, 0.25, 0.5, 0.75, 1].map((f) => {
  const h = (BTO_SCALE.from + f * (BTO_SCALE.to - BTO_SCALE.from)) / 60;
  return `${((h + 11) % 12) + 1} ${h >= 12 ? "PM" : "AM"}`;
});
// The least a bar is drawn at, in hundredths of the scale: a stretch wholly outside it (a bar open from 11 PM) clamps to
// the edge, and still has to be seen there, or a day that is open would look shut.
const BTO_SLIVER = 2;

const btoClock = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm == null ? "" : hhmm).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * A day's open stretches as bars on the scale: { left, width } in hundredths of it. Only a stretch with both its times,
 * closing after it opens, is one; a break is simply the next bar on the same row. Times outside the scale clamp to its
 * edge, so nothing is drawn past the track, and the day still reads in full in the sentence under the ribbon.
 */
const btoBars = (shifts) => (shifts || []).flatMap((s) => {
  const o = btoClock(s.open);
  const c = btoClock(s.close);
  if (o == null || c == null || c <= o) return [];
  const span = BTO_SCALE.to - BTO_SCALE.from;
  const at = (t) => ((Math.min(BTO_SCALE.to, Math.max(BTO_SCALE.from, t)) - BTO_SCALE.from) / span) * 100;
  const width = Math.max(BTO_SLIVER, at(c) - at(o));
  return [{ left: Math.min(at(o), 100 - width), width }];
});

/** The bars of one day, on a track. A closed day has no bar at all: shut, and looks it. */
const BtoTrack = ({ day }) => (
  <span className="bt-week-track" data-open={day.isOpen ? "true" : "false"}>
    {day.isOpen ? btoBars(day.shifts).map((b, i) => (
      <span key={i} className="bt-ribbon-bar" style={{ left: `${b.left}%`, width: `${b.width}%` }} />
    )) : null}
  </span>
);

/**
 * The week at a glance, at rest: seven days, each its bars on the one scale, before any grid. It is a picture of the
 * sentence under it and says nothing the sentence does not, so a screen reader is given the sentence alone.
 */
const BtoRibbon = ({ week }) => (
  <span className="bt-ribbon" data-testid="bt-hours-ribbon" aria-hidden="true">
    {BTO_DAYS.map(([d, , short]) => (
      <span key={d} className="bt-ribbon-day" data-day={d} data-open={week[d].isOpen ? "true" : "false"}>
        <BtoTrack day={week[d]} />
        <span className="bt-ribbon-name">{short}</span>
      </span>
    ))}
  </span>
);

/**
 * The owner's own summary of their hours: the composer's run-collapsing (contracts hoursLines, published by the bridge
 * as window.__hoursLines), joined as the old card's hoursSummary joins it (settings.jsx, a wrapper over the same
 * function, which stays where it is until that card goes). Never a second implementation: its comment says why two
 * copies of "which days share the same hours" is how the card and the receptionist start disagreeing, on the one screen
 * an owner glances at to check. The words are the Calendar's too (C3), so this row and the Calendar's bar say one thing.
 */
const btoHoursLine = (hours) => {
  if (!hours || !window.__hoursLines) return null;
  return window.__hoursLines(hours).join(" · ") || null;
};

// A shift's box, named for its day, what it does and its place: "Monday opens", "Monday closes, second shift". The
// first shift needs no place; the fold takes four at most (LIMITS.shifts).
const BTO_PLACE = ["", "second", "third", "fourth", "fifth", "sixth"];
const btoShiftName = (long, n, does) => (n === 0 ? `${long} ${does}` : `${long} ${does}, ${BTO_PLACE[n] || `${n + 1}th`} shift`);

/** The same shifts, in the same order? Used to tell a no-op from a loss. */
const btoSameShifts = (a, b) =>
  a.isOpen === b.isOpen &&
  a.shifts.length === b.shifts.length &&
  a.shifts.every((s, i) => s.open === b.shifts[i].open && s.close === b.shifts[i].close);

/**
 * The week on one scale (the canvas's Group-Open): a day is a switch, its bars, and its times as boxes. Hookless but
 * for the one menu, which is always drawn: a day's shifts come and go.
 */
const BtoWeek = ({ draft: week, update, change, rows, press, problems, readOnly }) => {
  // A day's shifts are a list inside the week, with a list's rules from BtFold (rows): the cap the write schema keeps
  // (LIMITS.shifts, contracts MAX_INTERVALS_PER_DAY) when adding and when an Undo puts one back, the removal said only
  // when it happened, and the removed shift back at its own index.
  const shiftsOf = (d) => rows({
    // Each day's shifts are a list of their own, whose put-backs no other day's changes move.
    id: `hours-${d}`,
    name: (n) => `hours-${d}-${n}`,
    max: window.__businessTabSave.LIMITS.shifts,
    blank: () => ({ open: "", close: "" }),
    keysOf: () => [`hours-${d}`],
    full: `${BTO_LONG[d]} already has the most shifts a day takes. Remove one first.`,
    list: (h) => h[d].shifts,
    put: (h, shifts) => ({ ...h, [d]: { ...h[d], shifts } }),
  });
  const setDay = (d, patch) => update((h) => ({ ...h, [d]: { ...h[d], ...patch } }), [`hours-${d}`]);
  const setShift = (d, n, k, v) => shiftsOf(d).setAt(n, { [k]: v });
  /**
   * Toggling a day closed KEEPS its shifts.
   *
   * The switch sits about ten pixels from the times. Dropping the shifts on
   * the way through would mean an accidental tap costs an owner four times and
   * the decision about lunch, with the day switch offering no undo — and
   * reopening the day would present empty boxes as if nothing had been there.
   * The save is what decides a closed day stores nothing.
   */
  const toggleDay = (d) => setDay(d, { isOpen: !week[d].isOpen, shifts: week[d].shifts.length ? week[d].shifts : [{ open: "", close: "" }] });
  const addShift = (d) => shiftsOf(d).add();
  const removeShift = (d, n) => shiftsOf(d).removeAt(n, (gone) => <>Removed the {BTO_SHORT[d]} shift{gone.open ? <> at <b>{gone.open}</b></> : null}</>);

  // Most businesses keep one set of weekday hours. Typing the same two times
  // five more times is the kind of chore that makes people leave the field
  // blank, and blank hours are what the receptionist cannot answer with.
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
  const applyToAll = (from, days) => {
    const src = week[from];
    if (!src.isOpen) return;
    const opened = days.filter((d) => !week[d].isOpen);
    const replaced = days.filter((d) => week[d].isOpen && !btoSameShifts(week[d], src));
    const before = {};
    BTO_DAYS.forEach(([d]) => { before[d] = { isOpen: week[d].isOpen, shifts: week[d].shifts.map((s) => ({ ...s })) }; });
    const names = (list) => list.map((d) => BTO_SHORT[d]).join(", ");
    const notes = [];
    if (opened.length) notes.push(<><b>{names(opened)}</b> {opened.length === 1 ? "was" : "were"} closed and {opened.length === 1 ? "is" : "are"} now open</>);
    if (replaced.length) notes.push(<>replaced different hours on <b>{names(replaced)}</b></>);
    // Said only when it happened, and put back whole by the one Undo (BtFold's change).
    change((h) => {
      const next = { ...h };
      days.forEach((d) => { next[d] = { isOpen: true, shifts: src.shifts.map((s) => ({ ...s })) }; });
      return next;
    }, {
      said: notes.length
        ? <>Copied {BTO_SHORT[from]}&apos;s hours — {notes.map((n, i) => <React.Fragment key={i}>{i ? ", and " : ""}{n}</React.Fragment>)}</>
        : <>Copied {BTO_SHORT[from]}&apos;s hours — nothing else changed</>,
      back: () => before,
    });
  };

  // One menu, where the form had two links inches from each other on Monday's row alone. It copies the first day that
  // is open, which is Monday for nearly everyone and the one day there is to copy for a business shut on Mondays: to
  // every day and to the weekdays, as the two links did, and to each other day by its name.
  const from = (BTO_DAYS.find(([d]) => week[d].isOpen) || [null])[0];
  const others = (list) => list.filter((d) => d !== from);
  const copies = from ? [
    { label: "Every day", onClick: () => applyToAll(from, others(BTO_DAYS.map(([d]) => d))) },
    { label: "Weekdays", onClick: () => applyToAll(from, others(BTO_WEEKDAYS)) },
    { divider: true },
  ].concat(others(BTO_DAYS.map(([d]) => d)).map((d) => ({ label: BTO_LONG[d], onClick: () => applyToAll(from, [d]) }))) : [];

  return (
    <div className="bt-week" data-testid="rec-hours-week">
      <div className="bt-week-row bt-week-axis" aria-hidden="true">
        <span className="bt-week-day" />
        <span className="bt-week-ticks">{BTO_AXIS.map((t) => <span key={t}>{t}</span>)}</span>
        <span className="bt-week-times" />
        <span className="bt-week-more" />
      </div>
      {BTO_DAYS.map(([d, long, short]) => {
        const day = week[d];
        const bad = problems[`hours-${d}`] || null;
        const problemId = `bt-hours-${d}-problem`;
        const kept = !day.isOpen && day.shifts.some((s) => s.open || s.close);
        return (
          <div key={d} className="bt-week-row" data-testid={`rec-hours-day-${d}`} data-open={day.isOpen ? "true" : "false"}>
            <span className="bt-week-day">
              <window.RecordSwitch on={day.isOpen} onChange={() => toggleDay(d)} label={long} readOnly={readOnly} testid={`rec-hours-switch-${d}`} />
              <span className="bt-week-name">{short}</span>
            </span>
            <BtoTrack day={day} />
            <span className="bt-week-times">
              {day.isOpen ? (
                <>
                  {day.shifts.map((sh, n) => (
                    <span key={n} className="bt-week-shift" {...shiftsOf(d).row(n)}>
                      {/* The kit's box for a row of a list, named for its day and its place ("Monday closes, second
                          shift"): the day's one sentence is drawn once, under the row, and both boxes are wrong by it. */}
                      <window.RecordBox
                        id={`bt-hours-${d}-${n}-open`} label={btoShiftName(long, n, "opens")} type="time" size="sm" className="bt-time"
                        value={sh.open} onChange={(v) => setShift(d, n, "open", v)} invalid={bad ? problemId : null} readOnly={readOnly}
                      />
                      <span className="bt-week-to">to</span>
                      <window.RecordBox
                        id={`bt-hours-${d}-${n}-close`} label={btoShiftName(long, n, "closes")} type="time" size="sm" className="bt-time"
                        value={sh.close} onChange={(v) => setShift(d, n, "close", v)} invalid={bad ? problemId : null} readOnly={readOnly}
                      />
                      {/* The first shift has no remove control: the switch on
                          the left already means "closed", and two ways to say
                          the same thing is how one of them gets misread. */}
                      {n > 0 ? (
                        <button
                          type="button" className="btn btn-ghost btn-icon btn-sm"
                          aria-label={`Remove ${long} shift ${n + 1}`}
                          {...press(() => removeShift(d, n))}
                          data-testid={`rec-hours-remove-${d}-${n}`}
                        ><Icon name="x" size={11} /></button>
                      ) : null}
                    </span>
                  ))}
                </>
              ) : (
                <span className="bt-week-closed">{kept ? "Closed — times kept" : "Closed"}</span>
              )}
            </span>
            <span className="bt-week-more">
              {/* The write schema refuses more than this, so the fold must not offer it (rows' canAdd). */}
              {day.isOpen && shiftsOf(d).canAdd ? (
                <button type="button" className="bt-week-break" {...press(() => addShift(d))} aria-label={`Add a break to ${long}`} data-testid={`rec-hours-add-${d}`}>
                  <Icon name="plus" size={10} /> break
                </button>
              ) : null}
            </span>
            <window.FieldError id={problemId} message={bad} testid={`rec-hours-problem-${d}`} />
          </div>
        );
      })}
      <div className="bt-week-copy">
        {/* Escape closes the menu and nothing else: the fold's own Escape is Cancel, and with the menu open over it one
            key would have closed the menu and asked to discard the week. The fold leaves a key alone once something
            inside took it (record-fold.jsx recKeys). */}
        <div
          className="bt-week-copy-menu"
          hidden={from ? undefined : true}
          onKeyDown={(e) => {
            const up = e.key === "Escape" && e.currentTarget && e.currentTarget.querySelector && e.currentTarget.querySelector('[aria-expanded="true"]');
            if (up) e.preventDefault();
          }}
          data-testid="rec-hours-copy"
        >
          <window.MoreMenu
            items={copies}
            label={`Copy ${from ? BTO_LONG[from] : "a day"} to…`}
            title="Copy one day's hours onto others"
            btnClass="btn btn-sm"
            align="left"
            escape
            gated={readOnly ? "Saving — nothing can be copied until this is saved." : null}
          />
        </div>
        <span className="bt-fold-note">Names every day it opens or overwrites, and puts the whole week back in one press.</span>
      </div>
    </div>
  );
};

/* ------------------------------------ the zone ------------------------------------ */

/**
 * The workspace's timezone, edited in the row that states it: the old card's TimezoneRow, with the kit's combobox where
 * it had a select of 418 options (spec §6). Its words are contracts' (window.__tz): the zone, and the local time there
 * now, which is this row's consequence -- it draws no "It will say". The zone is in the prompt, but it is the
 * workspace's, saved through its own route (window.__workspace.setTimezone, PATCH workspaces) and never through the
 * settings saver, so no draft of it can be resolved as the edge resolves one (the bridge's FOLD_BLOCK says so). Once it
 * is saved the settings surface is read again (refresh-map.ts), so the hours fold's hint and block name the new zone.
 *
 * It is a body of the page's BtRow, as every row edited in its place is, and not a third copy of the gesture: the row
 * keeps the registry, the asks, the read-only box and the busy Save, and this draws the box. Its way out is the zone's
 * own door (business-tab-save.jsx `zone`), which holds "my save is out" where it outlives the page, and says the old
 * row's words when the zone is taken.
 */
const btoZoneBox = (T) => ({ draft, set, field, readOnly, open }) => {
  // The zones are listed only while the editor is open: 418 options worked out for a row at rest are 418 too many.
  const zones = open && T.known ? T.known() : [];
  const device = T.device ? T.device() : null;
  return (
    <>
      <window.RecordCombobox
        id={field.id}
        label="Timezone"
        value={draft}
        options={zones.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))}
        onChange={set}
        placeholder="Search for a city"
        readOnly={readOnly}
        testid="rec-inline-timezone-zones"
      />
      <span className="bt-inline-note" data-testid="rec-inline-timezone-note">
        {(T.words ? T.words(draft) : { line: draft }).line}
        {device && device !== draft ? (
          <> · <button type="button" className="bt-link" onClick={() => set(device)} data-testid="rec-inline-timezone-device">Use this device&rsquo;s ({T.city ? T.city(device) : device})</button></>
        ) : null}
      </span>
    </>
  );
};

const BtoZone = ({ brain, canEdit, gate, flash }) => {
  const ws = (window.__WORKSPACES || []).find((t) => t.id === window.__ACTIVE_WORKSPACE) || null;
  const current = (ws && ws.timezone) || window.DEFAULT_TIMEZONE || "America/New_York";
  const T = window.__tz || {};
  const zone = window.__businessTabSave.zone;
  const Row = window.BtRow;
  return (
    <Row
      id="timezone"
      label="Timezone"
      brain={brain}
      value={(T.words ? T.words(current) : { line: current }).line}
      initial={current}
      storedAs={(d) => d}
      // Only where there is a door to save it through: the standalone mockup has none.
      canEdit={canEdit && !!window.__workspace}
      gate={gate}
      flash={flash}
      door={{ save: (tz, done) => zone.save({ tz, done, flash }), pending: () => zone.pending() }}
      body={btoZoneBox(T)}
    />
  );
};

/* ------------------------------------ the days the week does not apply to ------------------------------------ */

/** The closed days, as rows of from, until and why. Hookless: its rows come and go. */
const BtoClosures = ({ draft: days, rows, press, problems, readOnly }) => {
  // The same cap the write schema enforces (contracts MAX_CLOSURES, LIMITS.closures), so the fold
  // stops at the number the save would refuse, instead of refusing at Save.
  const max = window.__businessTabSave.LIMITS.closures;
  const full = `That is the most closures the receptionist keeps (${max}). Dates that have passed can go.`;
  const closed = rows({
    id: "closures",
    name: (i) => `closure-${i}`,
    max,
    blank: () => ({ date: "", note: "" }),
    keysOf: (i) => [`closure-${i}-date`, `closure-${i}-until`, `closure-${i}-note`],
    key: "closures",
    full,
  });
  const setClosure = (i, k, v) => closed.setAt(i, { [k]: v });
  /**
   * Removing one closure is undoable, because it is a date somebody typed.
   *
   * Every other destructive control in this file offers an undo; a bulk
   * "clear past dates" button would not have, and does not exist — the
   * composer already stops stating a date once it has gone by, so there is
   * nothing an owner has to tidy and nothing for them to delete by accident.
   */
  const removeClosure = (i) => closed.removeAt(i, (gone) => <>Removed {gone.date ? <b>{gone.date}</b> : "the closure"}{gone.note ? ` — ${gone.note}` : ""}</>);
  const said = (key) => problems[key] || null;
  return (
    <div className="bt-closures" data-testid="rec-closures-rows">
      {days.length > 0 ? (
        <div className="bt-closure bt-closure-head" aria-hidden="true">
          <span>From</span><span>Until (optional)</span><span>Why</span><span />
        </div>
      ) : null}
      {days.map((c, i) => {
        // Each box is named for its row, by its date once there is one: "Closed from, Dec 24" is a row a screen reader
        // can tell from the one under it; "row 2" is all a row with no date yet has.
        const named = (what) => `${what}, ${c.date ? c.date : `row ${i + 1}`}`;
        const box = (k, more) => (
          <window.RecordBox
            id={`bt-closure-${i}-${k}`} value={c[k] || ""} onChange={(v) => setClosure(i, k, v)}
            problem={said(`closure-${i}-${k}`)} readOnly={readOnly} testid={`rec-closure-${i}-${k}`} {...more}
          />
        );
        return (
          <div key={i} className="bt-closure" data-testid={`rec-closure-${i}`} {...closed.row(i)}>
            {/* type=date, so 31 November cannot be typed at all — the class of
                bug where a stored non-date names the wrong day downstream. */}
            {box("date", { type: "date", label: named("Closed from") })}
            {box("until", { type: "date", label: named("Closed until"), min: c.date || undefined })}
            {box("note", { label: named("Reason"), placeholder: "Christmas" })}
            <button
              type="button" className="btn btn-ghost btn-icon btn-sm"
              aria-label={`Remove closure ${c.date || ""}`}
              {...press(() => removeClosure(i))}
              data-testid={`rec-closure-remove-${i}`}
            ><Icon name="x" size={12} /></button>
          </div>
        );
      })}
      {closed.canAdd ? (
        <button type="button" className="btn btn-sm bt-fold-add" {...press(() => closed.add())} data-testid="rec-closures-add">
          <Icon name="plus" size={12} /> Add a closed day
        </button>
      ) : (
        <p className="bt-fold-note" data-testid="rec-closures-cap">{full}</p>
      )}
      <window.FieldError id="bt-closures-problem" message={said("closures")} testid="rec-closures-problem" />
      {/* The one case this cannot express, said plainly rather than left for
          an owner to discover by picking the only option and turning away an
          afternoon of bookings. */}
      <p className="bt-fold-note">
        Closing early rather than all day? Leave it out of this list and set that
        day&apos;s hours above instead. Dates that have passed stop being mentioned
        on their own — there is nothing to tidy up.
      </p>
    </div>
  );
};

/* ------------------------------------ the calendar it reads ------------------------------------ */

/**
 * WHERE it reads, as the row states it: the host, and nothing after it.
 *
 * A private feed's address is a long secret (…/ical/<account>/private-<key>/basic.ics), the row is read over a
 * shoulder, and the path is not a thing anybody checks at a glance -- "app.chanlytics.com" answers "which calendar is
 * this?" and the whole of it waits in the box that edits it. An address this cannot parse (a non-owner's arrives
 * masked by the server, which is no address to take apart) is named for what it is instead.
 */
const btoFeedHost = (url) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.replace(/^webcal:/i, "https:")).host || "Your calendar";
  } catch {
    return "Your calendar";
  }
};

/**
 * What the calendar's last read found, in the words the Calendar page says it in: the same pill (contracts
 * CALENDAR_FEED_WORDS, through StatePill's `calendar` kind) and the same line (toCalendarVM's feed.detail: where it was
 * read from, when, how many events; feed.problem when it could not be, or that page's own words where the read gives no
 * reason, window.__calendarPage.words). The form had a "Check the address" button for this; a row that can say it needs
 * no button (spec §4.3).
 *
 * Only a read this tab HAS is stated, and only while it is fresh. The Calendar surface is read as the app boots on
 * every route, so it is here; but its "read 4m ago" is counted from the moment IT was read (contracts toCalendarVM),
 * so on a tab open since the morning the words would be the morning's. Fresh is as long as the Calendar page itself
 * keeps a read before it reads again (its CR_REFRESH_MS, window.__calendarPage.refreshMs: one number, that page's).
 *   fresh                 stated as it stands, and ONE timer is set for the moment it stops being fresh, which draws
 *                         the row again: worked out only as the row drew, an idle page said "read 4m ago" for forty
 *                         minutes. The timer DECIDES: as it fires it records that the read it was set for has expired,
 *                         and an expired read is not fresh whatever the clock says. A timer runs on the monotonic
 *                         clock and Date.now() on the wall clock, so one that fired a moment early met a row that
 *                         still read fresh, whose effect's inputs had not moved: no second timer, and the same bug;
 *   not fresh             a new read is asked for (window.__calendar.refresh: the route's few minutes' cache, never the
 *                         calendar itself; not from a tab nobody is looking at, as that page's own timer holds off),
 *                         and while it is on its way the last read stays where it is, dimmed (spec §9: a read in
 *                         flight dims the last value): it does not vanish and move the rows under it;
 *   that read failed      said where the read would be (spec §3), with a Retry, by the refresh's own answer or the
 *                         runner's (window.__surfaceFailed): the old read is never stated as if it were the latest.
 *                         Retry keeps the block, busy, until its read answers: it flipped to the dimmed line and back;
 *   no way to ask         nothing is said of a read that is not fresh (the standalone mockup has no bridge to ask).
 * A read from before the calendar's address was saved is said nothing of, until the read after the save lands: the
 * saver says when it took the calendar fold's save (takenAt), and a read fetched before that moment is the old
 * calendar's, whatever it found. The save reads the calendar again (refresh-map.ts), so nothing is asked for it here.
 * The surface carries no address to hold a read against (the address never leaves the server), so the moment of the
 * save is the one thing the row can know it by. A read that says no calendar is connected is said nothing of either.
 * And a re-read after the save that FAILED is said, as a failed read is, with its Retry: the read still in the window
 * is the old calendar's, so waiting for a newer one to land waited for good.
 */
const BtoFeedRead = ({ stored, whole = false }) => {
  const [, setTick] = useBtoState(0);
  const bump = () => setTick((n) => n + 1);
  // Whether the read this row asked for is out, whether it failed, whether the row is still on the page to hear its
  // answer, and the read (by when it was fetched) whose timer has fired.
  const flight = useBtoRef({ out: false, failed: false, gone: false, expired: null });
  useBtoEffect(() => {
    flight.current.gone = false;
    window.addEventListener("surface:calendar", bump);
    // Back in view, the row looks again: a read that went stale in a tab nobody was looking at is asked for then.
    document.addEventListener("visibilitychange", bump);
    return () => {
      flight.current.gone = true;
      window.removeEventListener("surface:calendar", bump);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);
  const keeps = window.__calendarPage || {};
  const C = window.__CALENDAR || null;
  const at = C && typeof C.fetchedAt === "number" ? C.fetchedAt : null;
  const fresh = at != null && flight.current.expired !== at && typeof keeps.refreshMs === "number" && Date.now() - at < keeps.refreshMs;
  const canAsk = !!(window.__calendar && typeof window.__calendar.refresh === "function");
  const visible = document.visibilityState !== "hidden";
  // The saver says when the server last took the calendar fold's save in this tab: a read from before it is the old
  // calendar's.
  const saver = window.__businessTabSave && window.__businessTabSave.saver;
  const savedAt = saver && saver.takenAt ? saver.takenAt("calendar") : null;
  const before = at != null && savedAt != null && at <= savedAt;
  const ask = () => {
    flight.current.out = true;
    const settled = (landed) => { if (flight.current.gone) return; flight.current.out = false; flight.current.failed = !landed; bump(); };
    let sent;
    try { sent = window.__calendar.refresh(); } catch (e) { sent = Promise.reject(e); }
    Promise.resolve(sent).then((landed) => settled(landed !== false), () => settled(false));
    bump();
  };
  useBtoEffect(() => {
    if (!stored || !fresh) return undefined;
    // Named, so a test that holds the clock can tell this timer from a toast's.
    const btoReadExpires = () => { flight.current.expired = at; bump(); };
    const timer = window.setTimeout(btoReadExpires, at + keeps.refreshMs - Date.now());
    return () => window.clearTimeout(timer);
  }, [stored, at, keeps.refreshMs]);
  useBtoEffect(() => {
    if (stored && !fresh && !before && canAsk && visible) ask();
  }, [stored, fresh, before, canAsk, visible]);

  if (!stored) return null;
  const surfaceFailed = !!(window.__surfaceFailed && window.__surfaceFailed("calendar"));
  // From before the address was saved: nothing of it is stated, and the save's own re-read is on its way. Unless that
  // re-read failed, which is said where the read would be, as any failed read is: asked first, a failed re-read left the
  // row blank for good, since the read in the window stays the old calendar's and `before` never stops being true.
  if (before && !surfaceFailed) return null;
  const failed = before || (!fresh && (flight.current.failed || surfaceFailed));
  if (failed) {
    return <window.FailedRead kind="line" what="what its last read found" onRetry={canAsk ? ask : null} busy={flight.current.out} surface="calendar" testid="rec-calendar-unread" />;
  }
  // Not fresh, and no way to ask for a new one: nothing is said of it.
  if (!fresh && !canAsk) return null;
  const feed = C && C.vm ? C.vm.feed : null;
  if (!feed || feed.state === "none") return null;
  const words = keeps.words || {};
  // One mark for whether the last read worked, and one phrase for when it was. The mark carries the Calendar page's
  // own words (contracts CALENDAR_FEED_WORDS through the chrome bridge, as its pill does) in its accessible name and
  // under a pointer: a coloured pill of four words on a row that already states a fact is two facts, and on a phone it
  // took a line. Where it read from and how many events it found are in the fold (BtoFeedBox) -- EXCEPT for a reader
  // who has no fold: a viewer is offered no act on any row, so the fold is not a place to keep anything from them, and
  // `whole` puts the Calendar page's own line on the row instead. It is still this component's read, with its
  // freshness and its failures, so a viewer is never shown a stale one as if it were the latest.
  const state = window.__chrome && window.__chrome.state ? window.__chrome.state("calendar", feed.health) : { tone: "plain", label: feed.health };
  return (
    <span className="bt-feed" data-testid="rec-calendar-read" data-state={feed.health} data-reading={fresh ? undefined : "true"} aria-busy={fresh ? undefined : true}>
      <span
        className="bt-feed-dot"
        role="img"
        aria-label={state.label}
        data-tip={state.label}
        data-tone={state.tone}
        data-testid="rec-calendar-state"
      />
      {(whole ? feed.detail : feed.read) ? <span className="bt-feed-when">{whole ? feed.detail : feed.read}</span> : null}
      {feed.state !== "ok" || feed.stale ? (
        <span className="bt-feed-problem">{feed.problem || (feed.stale ? words.stale : words.unavailable) || null}</span>
      ) : null}
    </span>
  );
};

/**
 * The whole of what the last read found, for the fold: where it read from, when, and how many events it took
 * (contracts toCalendarVM's feed.detail, the Calendar page's own line). Hookless, and drawn from the read the row is
 * already keeping fresh: a fold is only open while somebody is looking at it.
 */
const BtoFeedWhole = () => {
  const C = window.__CALENDAR || null;
  const feed = C && C.vm ? C.vm.feed : null;
  if (!feed || feed.state === "none" || !feed.detail) return null;
  return <p className="bt-fold-note" data-testid="rec-calendar-whole">{feed.detail}</p>;
};

/** The calendar's one box, the whole of its last read, and the old form's note about what the address is. */
const BtoFeedBox = ({ draft, update, problems, readOnly, stored }) => (
  <>
    {stored ? <BtoFeedWhole /> : null}
    <window.RecordField
      id="bt-calendar"
      label="Calendar feed address"
      value={draft}
      onChange={(v) => update(() => v, ["ical_url"])}
      problem={problems.ical_url || null}
      placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
      inputMode="url"
      autoComplete="off"
      spellCheck={false}
      readOnly={readOnly || undefined}
    />
    <p className="bt-fold-note">
      The private iCal address of the calendar your appointments land in (Google, Apple or Outlook — Booksy, Calendly and the rest sync into one).
      It is only ever read. Nothing is booked from here; the booking link does that, whichever tool is behind it.
    </p>
    {/* Only an owner is sent the address whole (the settings route masks it for everyone else), and a masked address
        edited in part would be saved as written. */}
    {String(stored || "").includes("…") ? (
      <p className="bt-fold-note" data-testid="rec-calendar-masked">Only an owner sees this address whole. Leave it as it is to keep it, or paste a new one over it.</p>
    ) : null}
    {stored ? (
      <p className="bt-fold-note">
        <button type="button" className="bt-link" onClick={() => window.CHANLY.nav("calendar")} data-testid="rec-calendar-open">Open Calendar</button>
      </p>
    ) : null}
  </>
);

/* ------------------------------------ the card ------------------------------------ */

/**
 * When you're open (spec §4.3): four rows, in the order a customer's question meets them -- the week, whose clock it is
 * on, the days it does not apply to, and the calendar that says which of its times are taken.
 *
 * `brain` and `config` are the settings read's, which the rows state; what a fold opens with and saves onto is the
 * saver's base, which BtFold asks for itself.
 */
const BtOpenCard = ({ brain, config = null, prompt = null, canEdit, flash, saver }) => {
  const S = window.__businessTabSave;
  const tab = window.__businessTab || {};
  const Fold = window.BtFold;
  const profile = brain.profile || {};
  const ws = (window.__WORKSPACES || []).find((t) => t.id === window.__ACTIVE_WORKSPACE) || null;
  const wsZone = (ws && ws.timezone) || window.DEFAULT_TIMEZONE || "America/New_York";
  // The zone the receptionist states the times in is the one the settings read resolved the prompt with; the
  // workspace's own until that is read.
  const toldIn = (prompt && prompt.tz) || wsZone;
  const gate = (thing) => window.gate("settings", `change ${thing}`);
  const shared = { canEdit, flash, saver };

  // The week as the fold reads a stored one (draftOf: both shapes a day may be stored in, as the composer unions them),
  // so the ribbon and the fold never read a day two ways.
  const week = S.draftOf("hours", { brain });
  const hoursLine = btoHoursLine(profile.hours);
  const ahead = tab.closuresAheadWords ? tab.closuresAheadWords(profile.closures, wsZone, new Date()) : { count: 0, line: null };
  const feed = (config && config.calendar && config.calendar.ical_url) || "";

  return (
    <section className="rec-card" data-testid="rec-card-open" aria-labelledby="bt-open-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-open-title">When you&apos;re open</h2>
        <span className="rec-card-sub">{tab.openWeekWords ? tab.openWeekWords(profile.hours, wsZone) : null}</span>
      </div>

      <Fold
        {...shared}
        id="hours"
        label="Hours"
        hint={tab.hoursZoneWords ? tab.hoursZoneWords(toldIn) : null}
        wide
        saveLabel="Save the week"
        gate={gate("your hours")}
        row={{
          value: hoursLine ? (
            <span className="bt-hours">
              <BtoRibbon week={week} />
              <span className="bt-hours-line" data-testid="rec-hours-line">{hoursLine}</span>
            </span>
          ) : null,
          // What the old card said of a week nobody has typed.
          empty: "Not set — the receptionist cannot state your hours",
          act: hoursLine ? "Change" : "Add them",
          name: hoursLine ? "Change your opening hours" : "Add them: your opening hours",
        }}
        body={(f) => <BtoWeek {...f} />}
      />

      <BtoZone brain={brain} canEdit={canEdit} gate={gate("the timezone")} flash={flash} />

      <Fold
        {...shared}
        id="closures"
        label="Days you're closed"
        hint="Holidays and one-off closures."
        gate={gate("the days you are closed")}
        row={{
          value: ahead.line,
          empty: "None ahead",
          name: ahead.line ? "Change the days you are closed" : "Add one: a day you are closed",
        }}
        body={(f) => <BtoClosures {...f} />}
      />

      <Fold
        {...shared}
        id="calendar"
        label="Calendar it reads"
        hint="Read-only, so it can say which times are open before sending the link."
        channel={null}
        gate={gate("the calendar it reads")}
        row={{
          value: feed ? <span className="bt-feed-where">{btoFeedHost(feed)}</span> : null,
          empty: "Not connected",
          hint: feed ? null : "Read-only, so it can say which times are open before sending the link.",
          children: <BtoFeedRead stored={!!feed} whole={!canEdit} />,
          name: feed ? "Change the calendar it reads" : "Add one: a calendar for it to read",
        }}
        body={(f) => <BtoFeedBox {...f} stored={feed} />}
      />
    </section>
  );
};

// The zone's row too, for the one other place it is drawn: a workspace with no receptionist yet, whose day it decides
// all the same (business-tab-create.jsx).
Object.assign(window, { BtOpenCard, BtZoneRow: BtoZone });
