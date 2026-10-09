// Chanlytics — Settings › Business: When you're open.
//
// The second card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.3; the canvas's Record and
// Group-Open boards): the week as one sentence, the zone with the local time beside it, the days the week
// does not apply to, and what the business books with: its calendar link, saying what its last read found, and its
// tool's booking emails (open-bookings.tsx). Four rows, each edited where it is stated: the week and the closed days
// fold open under their rows, the zone is one value edited in its row, and the booking tool's fold asks one question
// and draws what the answer has. It replaces three sections of the form this page retires (BusinessEditor,
// settings.jsx: "When you are open", "Days you are closed", "Calendar it may look at") and its TimezoneRow, and what
// those learned came with them, comments and all.
//
// The page composes and never derives. The two sentences here with a number in them are contracts' (openWeekWords,
// closuresAheadWords, through BUSINESS_TAB); the week's summary is the composer's own run-collapsing
// (hoursLines, as the old card's hoursSummary calls it, never a second implementation); the zone's words are
// contracts' (tzApi); what the calendar's last read found is the Calendar page's own view model
// (calendarNow, contracts toCalendarVM). What a fold opens with, refuses and writes is folds.ts's,
// and the gestures every row and fold share are BtRow and BtFold (gestures/).
//
// The week's row is a component of its own (BtHoursRow), and so is the zone's (BtZoneRow): the first run's Check
// draws both too, so the two screens never disagree. The week itself is open-week.tsx and the calendar's read and
// box open-calendar.tsx, split out so no file is over the length the build holds.
//
// The rows that come and go inside a fold (the closed days) are drawn hookless, as plain boxes wearing the kit's class.
import type { ComponentProps, ReactNode } from "react";
import { BOOKING_TOOL_WORDS, bookingToolName, bookingToolOfLink, booksWithOf } from "@chanlytics/contracts";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import type { TzApi } from "@/legacy-bridge/identity";
import type { WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";
import type { PromptPreviewDto } from "@/server/receptionist/prompt-preview";
import { Button } from "../../kit/button/button";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordBox } from "../../kit/record/field";
import { RecordCombobox } from "../../kit/record/combobox";
import { gate as roleGate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { BtRow } from "./gestures/row";
import { BtFold } from "./gestures/fold";
import { BtoFeedRead } from "./open-calendar";
import { BtoBookingsRead, BtoBooksWith, BtoSourceBody } from "./open-bookings";
import type { CalendarDraft } from "./fold-shapes";
import { BtoWeek } from "./open-week";
import type { Week } from "./open-week";
import { businessTabSave } from "./saver";
import type { BusinessTabSave } from "./saver";
import { activeWorkspaceNow, defaultTimezone, hoursLinesFn, tzApi, workspaceApi, workspacesNow } from "./shell";

type Brain = NonNullable<WorkspaceSettings["brain"]>;
type Saver = BusinessTabSave["saver"];
type Flash = (flash: LegacyFlash) => void;
/** What BtFold hands its body. */
type FoldFields<D> = Parameters<ComponentProps<typeof BtFold<D>>["body"]>[0];
/** The closed days and the hours a record holds, as the sentences read them. */
type ClosuresIn = Parameters<typeof BUSINESS_TAB.closuresAheadWords>[0];
type WeekWordsIn = Parameters<typeof BUSINESS_TAB.openWeekWords>[0];
/** The hours a record holds, as `hoursLines` reads them. */
type HoursIn = Parameters<NonNullable<ReturnType<typeof hoursLinesFn>>>[0];

/* ------------------------------------ the week's row ------------------------------------ */

/**
 * The owner's own summary of their hours: the composer's run-collapsing (contracts hoursLines, through the shell), joined
 * as the old card's hoursSummary joins it (settings.jsx, a wrapper over the same function, which stays where it is until
 * that card goes). Never a second implementation: its comment says why two copies of "which days share the same hours"
 * is how the card and the receptionist start disagreeing, on the one screen an owner glances at to check. The words are
 * the Calendar's too (C3), so this row and the Calendar's bar say one thing.
 */
const btoHoursLine = (hours: HoursIn): string | null => {
  const lines = hoursLinesFn();
  if (!hours || !lines) return null;
  return lines(hours).join(" · ") || null;
};

/** The workspace's zone, as the workspace list carries it: the one every time on this card is in until a read says otherwise. */
const btoWorkspaceZone = (): string => {
  // The list carries each workspace's zone (surface-data.ts), whatever else a page types of it.
  const listed: { id: string; timezone?: string | null }[] = workspacesNow() || [];
  const ws = listed.find((t) => t.id === activeWorkspaceNow()) || null;
  return (ws && ws.timezone) || defaultTimezone() || "America/New_York";
};

/**
 * The week, as its row states it and its fold edits it. `prompt` is the settings read's preview: the zone the
 * receptionist states the times in is the one it was resolved with, the workspace's own until that is read. `note` is
 * drawn under the row at rest, for a screen that has more to say of the week (the first run's Check names the days
 * whose hours Google gives in a way the week cannot hold).
 */
export const BtHoursRow = ({
  brain,
  prompt = null,
  canEdit,
  flash,
  saver,
  note = null,
}: {
  brain: Brain;
  prompt?: Pick<PromptPreviewDto, "tz"> | null;
  canEdit: boolean;
  flash: Flash;
  saver: Saver;
  note?: ReactNode;
}) => {
  const tab = BUSINESS_TAB;
  const toldIn = (prompt && prompt.tz) || btoWorkspaceZone();
  const hoursLine = btoHoursLine((brain.profile || {}).hours as HoursIn);
  return (
    <BtFold<Week>
      canEdit={canEdit}
      flash={flash}
      saver={saver}
      id="hours"
      label="Hours"
      hint={tab.hoursZoneWords ? tab.hoursZoneWords(toldIn) : null}
      wide
      saveLabel="Save the week"
      gate={roleGate("settings", "change your hours")}
      row={{
        value: hoursLine ? (
          <span className="bt-hours-line" data-testid="rec-hours-line">
            {hoursLine}
          </span>
        ) : null,
        // What the old card said of a week nobody has typed.
        empty: "Not set — the receptionist cannot state your hours",
        act: hoursLine ? "Change" : "Add them",
        name: hoursLine ? "Change your opening hours" : "Add them: your opening hours",
        children: note,
      }}
      body={(f) => <BtoWeek {...f} />}
    />
  );
};

/* ------------------------------------ the zone ------------------------------------ */

/** What the zone's row hands its box. */
interface ZoneBoxProps {
  draft: string;
  set: (zone: string) => void;
  field: { id: string };
  readOnly: boolean;
  open: boolean;
}

/**
 * The workspace's timezone, edited in the row that states it: the old card's TimezoneRow, with the kit's combobox where
 * it had a select of 418 options (spec §6). Its words are contracts' (tzApi): the zone, and the local time there
 * now, which is this row's consequence -- it draws no "It will say". The zone is in the prompt, but it is the
 * workspace's, saved through its own route (workspaceApi().setTimezone, PATCH workspaces) and never through the
 * settings saver, so no draft of it can be resolved as the edge resolves one (the bridge's FOLD_BLOCK says so). Once it
 * is saved the settings surface is read again (refresh-map.ts), so the hours fold's hint and block name the new zone.
 *
 * It is a body of the page's BtRow, as every row edited in its place is, and not a third copy of the gesture: the row
 * keeps the registry, the asks, the read-only box and the busy Save, and this draws the box. Its way out is the zone's
 * own door (save.tsx `zone`), which holds "my save is out" where it outlives the page, and says the old
 * row's words when the zone is taken.
 */
const btoZoneBox =
  (T: Partial<TzApi>) =>
  ({ draft, set, field, readOnly, open }: ZoneBoxProps) => {
    // The zones are listed only while the editor is open: 418 options worked out for a row at rest are 418 too many.
    const zones = open && T.known ? T.known() : [];
    const device = T.device ? T.device() : null;
    return (
      <>
        <RecordCombobox
          id={field.id}
          label="Timezone"
          value={draft}
          // Found by the cities and states it covers too (contracts zoneSearchWords): "Miami" finds America/New York.
          options={zones.map((z) => ({ value: z, label: z.replace(/_/g, " "), also: T.also ? T.also(z) : "" }))}
          onChange={set}
          placeholder="Search for a city"
          readOnly={readOnly}
          testid="rec-inline-timezone-zones"
        />
        <span className="bt-inline-note" data-testid="rec-inline-timezone-note">
          {(T.words ? T.words(draft) : { line: draft }).line}
          {device && device !== draft ? (
            <>
              {" "}
              ·{" "}
              <LinkButton onClick={() => set(device)} data-testid="rec-inline-timezone-device">
                Use this device&rsquo;s ({T.city ? T.city(device) : device})
              </LinkButton>
            </>
          ) : null}
        </span>
      </>
    );
  };

export const BtZoneRow = ({ brain, canEdit, flash }: { brain: Brain; canEdit: boolean; flash: Flash }) => {
  const current = btoWorkspaceZone();
  // Its own gate, wherever it is drawn: the tab's card, the create card and the first run's Check say it alike.
  const gate = roleGate("settings", "change the timezone");
  const T: Partial<TzApi> = tzApi() || {};
  const zone = businessTabSave.zone;
  return (
    <BtRow
      id="timezone"
      label="Timezone"
      brain={brain}
      value={(T.words ? T.words(current) : { line: current }).line}
      initial={current}
      storedAs={(d: string) => d}
      // Only where there is a door to save it through: the standalone mockup has none.
      canEdit={canEdit && !!workspaceApi()}
      gate={gate}
      flash={flash}
      door={{ save: (tz: string, done: () => void) => zone.save({ tz, done, flash }), pending: () => zone.pending() }}
      body={btoZoneBox(T)}
    />
  );
};

/* ------------------------------------ the days the week does not apply to ------------------------------------ */

interface Closure {
  date: string;
  until?: string;
  note: string;
}
type ClosureKey = "date" | "until" | "note";

/** What BtFold hands the closed days' body. */
type ClosureFields = FoldFields<Closure[]>;

/** The closed days, as rows of from, until and why. Hookless: its rows come and go. */
const BtoClosures = ({ draft: days, rows, press, problems, readOnly }: ClosureFields) => {
  // The same cap the write schema enforces (contracts MAX_CLOSURES, LIMITS.closures), so the fold
  // stops at the number the save would refuse, instead of refusing at Save.
  const max = businessTabSave.LIMITS.closures;
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
  const setClosure = (i: number, k: ClosureKey, v: string) => closed.setAt(i, { [k]: v });
  /**
   * Removing one closure is undoable, because it is a date somebody typed.
   *
   * Every other destructive control in this file offers an undo; a bulk
   * "clear past dates" button would not have, and does not exist — the
   * composer already stops stating a date once it has gone by, so there is
   * nothing an owner has to tidy and nothing for them to delete by accident.
   */
  const removeClosure = (i: number) =>
    closed.removeAt(i, (row) => {
      const gone = row as Closure;
      return (
        <>
          Removed {gone.date ? <b>{gone.date}</b> : "the closure"}
          {gone.note ? ` — ${gone.note}` : ""}
        </>
      );
    });
  const said = (key: string) => problems[key] || null;
  return (
    <div className="bt-closures" data-testid="rec-closures-rows">
      {days.length > 0 ? (
        <div className="bt-closure bt-closure-head" aria-hidden="true">
          <span>From</span>
          <span>Until (optional)</span>
          <span>Why</span>
          <span />
        </div>
      ) : null}
      {days.map((c, i) => {
        // Each box is named for its row, by its date once there is one: "Closed from, Dec 24" is a row a screen reader
        // can tell from the one under it; "row 2" is all a row with no date yet has.
        const named = (what: string) => `${what}, ${c.date ? c.date : `row ${i + 1}`}`;
        const box = (k: ClosureKey, more: { label: string; type?: string; min?: string; placeholder?: string }) => (
          <RecordBox
            id={`bt-closure-${i}-${k}`}
            value={c[k] || ""}
            onChange={(v) => setClosure(i, k, v)}
            problem={said(`closure-${i}-${k}`)}
            readOnly={readOnly}
            testid={`rec-closure-${i}-${k}`}
            {...more}
          />
        );
        return (
          <div key={i} className="bt-closure" data-testid={`rec-closure-${i}`} {...closed.row(i)}>
            {/* type=date, so 31 November cannot be typed at all — the class of
                bug where a stored non-date names the wrong day downstream. */}
            {box("date", { type: "date", label: named("Closed from") })}
            {box("until", { type: "date", label: named("Closed until"), min: c.date || undefined })}
            {box("note", { label: named("Reason"), placeholder: "Christmas" })}
            <Button
              size="sm"
              variant="quiet"
              iconOnly
              aria-label={`Remove closure ${c.date || ""}`}
              {...press(() => removeClosure(i))}
              data-testid={`rec-closure-remove-${i}`}
            >
              <Icon name="x" size={12} />
            </Button>
          </div>
        );
      })}
      {closed.canAdd ? (
        <LinkButton {...press(() => closed.add())} data-testid="rec-closures-add">
          <Icon name="plus" size={12} /> Add a closed day
        </LinkButton>
      ) : (
        <p className="bt-fold-note" data-testid="rec-closures-cap">
          {full}
        </p>
      )}
      <FieldError id="bt-closures-problem" message={said("closures")} testid="rec-closures-problem" />
      {/* The one case this cannot express, said plainly rather than left for
          an owner to discover by picking the only option and turning away an
          afternoon of bookings. */}
      <p className="bt-fold-note">
        Closing early rather than all day? Leave it out of this list and set that day&apos;s hours above instead. Dates
        that have passed stop being mentioned on their own — there is nothing to tidy up.
      </p>
    </div>
  );
};

/* ------------------------------------ the card ------------------------------------ */

/**
 * When you're open (spec §4.3): four rows, in the order a customer's question meets them -- the week, whose clock it is
 * on, the days it does not apply to, and what the business books with, which says which of its times are taken.
 *
 * `brain` and `config` are the settings read's, which the rows state; what a fold opens with and saves onto is the
 * saver's base, which BtFold asks for itself.
 */
export const BtOpenCard = ({
  brain,
  config = null,
  prompt = null,
  canEdit,
  flash,
  saver,
}: {
  brain: Brain;
  config?: {
    calendar?: { ical_url?: string | null } | null;
    bookings?: { tool?: string | null; by_hand?: boolean | null } | null;
  } | null;
  prompt?: Pick<PromptPreviewDto, "tz"> | null;
  canEdit: boolean;
  flash: Flash;
  saver: Saver;
}) => {
  // Whether it sends a link at all, by the resolver's own test; without the bridge, the words that have one.
  const tab = BUSINESS_TAB;
  const offers = !tab.offersBookingLink || tab.offersBookingLink(brain);
  const profile = brain.profile || {};
  const wsZone = btoWorkspaceZone();
  const gate = (thing: string) => roleGate("settings", `change ${thing}`);
  const shared = { canEdit, flash, saver };

  const ahead = tab.closuresAheadWords
    ? tab.closuresAheadWords(profile.closures as ClosuresIn, wsZone, new Date())
    : { count: 0, line: null };
  const feed = (config && config.calendar && config.calendar.ical_url) || "";
  // What the owner books with, as the fold's picker holds it; and, with nothing said yet, the tool its booking link is on.
  const booksWith = booksWithOf({ ...((config && config.bookings) || {}), ical_url: feed });
  const guess = booksWith ? null : bookingToolName(bookingToolOfLink(brain.booking_link));

  return (
    <section className="rec-card" data-testid="rec-card-open" aria-labelledby="bt-open-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-open-title">
          When you&apos;re open
        </h2>
        <span className="rec-card-sub">
          {tab.openWeekWords ? tab.openWeekWords(profile.hours as WeekWordsIn, wsZone) : null}
        </span>
      </div>

      <BtHoursRow brain={brain} prompt={prompt} {...shared} />

      <BtZoneRow brain={brain} canEdit={canEdit} flash={flash} />

      <BtFold<Closure[]>
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

      {/* What the business books with, one row (7 Oct 2026; it was "Calendar it reads" and "Where your bookings come
          from", each sending the owner to the other). The row states the owner's own fact (BtoBooksWith) and, under
          it, a quiet signal each for the calendar link's last read and the tool's emails (the Calendar page's own
          read); the fold asks what they book with and draws only what that answer has (open-bookings.tsx). Its id
          stays `calendar`: every door on another page opens it by that name (contracts CALENDAR_SETTING_ROUTE). */}
      <BtFold<CalendarDraft>
        {...shared}
        id="calendar"
        light
        label={BOOKING_TOOL_WORDS.label}
        hint={BOOKING_TOOL_WORDS.hint}
        channel={null}
        gate={gate("what you book with")}
        row={{
          value: booksWith ? <BtoBooksWith withWhat={booksWith} feed={feed} /> : null,
          empty: BOOKING_TOOL_WORDS.empty,
          hint: booksWith
            ? null
            : guess
              ? `Your booking link is on ${guess}. Set it up to fill your calendar.`
              : BOOKING_TOOL_WORDS.hint,
          children: (
            <>
              <BtoFeedRead stored={!!feed} whole={!canEdit} />
              <BtoBookingsRead />
            </>
          ),
          name: booksWith ? "Change what you book with" : "Set up: what you book with",
        }}
        body={(f) => (
          <BtoSourceBody
            f={f}
            stored={feed}
            offers={offers}
            bookingLink={String(brain.booking_link || "")}
            name={String(brain.business_name || "")}
          />
        )}
      />
    </section>
  );
};
