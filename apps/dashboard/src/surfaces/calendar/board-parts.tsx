/**
 * What stands round the board (moved from legacy/pages/calendar.jsx CalendarReal, decision 0015): the one bar of controls
 * over it, the cards about the calendar's read, and the foot with the legend and the hours and rules. Each is a plain
 * function the page calls, never a component: the page's tree is what it was.
 *
 * The calendar first: one bar of controls over the board, and the hours, the booking rules, the calendar's source and
 * Refresh one tap away under it. A title the top bar already says, a paragraph, three stat cards and five rows of controls
 * came first, and on a phone the first day sat below the fold. A line of counts stood under the bar until 22 Sep ("This
 * week 30 on your calendar · Open times 1 that fit Haircut · Next open time tomorrow 4 PM"): the board draws every one of
 * those (the appointments, the open times the service picker leaves, the next of them), and Today's day says the next open
 * time in words. Days that could not be read and days on their way keep their own lines (cal-failed with its Retry,
 * cal-reading), which never needed the counts.
 */
import type { CalendarServiceVM, CalendarVM, CalendarView } from "@chanlytics/contracts";
import type { RefObject } from "react";
import { Button } from "../kit/button/button";
import { FailedRead } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { LinkButton } from "../kit/link-button/link-button";
import { holdStill, navigate } from "../legacy-verbs";
import { crOpenPicker } from "./board-dom";
import { routeTo, statePill } from "./shell-verbs";
import { CR_FEED_WORDS, CR_VIEWS } from "./words";

/** What the bar over the board is drawn from and does. */
interface BarProps {
  vm: CalendarVM;
  view: CalendarView;
  anchor: string;
  label: string;
  onToday: boolean;
  serviceName: string;
  move: (n: number) => void;
  setAnchorKey: (key: string | null) => void;
  setServiceName: (name: string) => void;
  setView: (view: CalendarView) => void;
}

/**
 * The bar: the steps, the range (which says which days are on screen, and opens a date picker: the date field was a control
 * of its own), the service the open times must fit, and the four views.
 */
export function calendarHead(p: BarProps) {
  const { vm, view, anchor, label, onToday, serviceName, move, setAnchorKey, setServiceName, setView } = p;
  return (
    <div className="cal-head">
      <div className="cal-bar" data-testid="cal-bar">
        <div className="cal-when">
          <div className="cal-steps">
            <Button
              variant="quiet"
              size="sm"
              iconOnly
              className="cal-nav"
              title="Previous"
              aria-label="Previous"
              onClick={() => move(-1)}
              data-testid="cal-prev"
            >
              <Icon name="chevron" size={14} className="cal-flip" />
            </Button>
            <Button
              variant="quiet"
              size="sm"
              className="cal-today-btn"
              onClick={() => setAnchorKey(null)}
              disabled={onToday}
              data-testid="cal-today"
            >
              Today
            </Button>
            <Button
              variant="quiet"
              size="sm"
              iconOnly
              className="cal-nav"
              title="Next"
              aria-label="Next"
              onClick={() => move(1)}
              data-testid="cal-next"
            >
              <Icon name="chevron" size={14} />
            </Button>
          </div>
          {/* The range says which days are on screen, and opens a date picker: the date field was a control of its own. */}
          <label className="cal-title" title="Go to a date">
            <span className="cal-title-range" aria-live="polite" data-testid="cal-range">
              {label}
            </span>
            <Icon name="chevron-down" size={12} />
            <input
              className="cal-jump"
              type="date"
              aria-label="Go to a date"
              value={anchor}
              onChange={(e) => {
                if (e.target.value) setAnchorKey(e.target.value);
              }}
              onClick={crOpenPicker}
              onKeyDown={(e) => {
                if (e.key === "Enter") crOpenPicker(e);
              }}
              data-testid="cal-jump"
            />
          </label>
        </div>
        <div className="cal-tools">
          {vm.services.length > 0 && (
            <select
              className="tpl-select cal-service"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              aria-label="Open times that fit a service"
              title="Show only the open times long enough for a service"
              data-testid="cal-service"
            >
              <option value="">Any service</option>
              {vm.services.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          <div className="cl-tabs cal-views" role="group" aria-label="View">
            {/* A view is a different height under the tabs (fourteen cards, six weeks, a day): they hold still. */}
            {CR_VIEWS.map(([id, l]) => (
              <button
                key={id}
                className={`cl-tab ${view === id ? "active" : ""}`}
                aria-pressed={view === id}
                onClick={(e) => holdStill(e && e.currentTarget, () => setView(id))}
                data-testid={`cal-view-${id}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** What the cards over the board are drawn from and do. */
interface CardProps {
  vm: CalendarVM;
  service: CalendarServiceVM | null;
  refreshing: boolean;
  refreshNow: () => void | Promise<void>;
}

/** The service picked needs a consultation first: the receptionist offers the consultation, and the open times here are its. */
export function consultNote(p: Pick<CardProps, "vm" | "service">) {
  const { vm, service } = p;
  return (
    service &&
    service.consultFirst && (
      <div className="cal-feed-card" data-testid="cal-consult-note">
        <Icon name="shield" size={14} />
        <span>
          <b>{service.name} needs a consultation first.</b> The receptionist does not offer times for it; it offers the
          consultation and {vm.bookingLink ? "sends the booking link" : "takes their details"}. The open times here are
          for a consultation{service.offerMinutes ? `, about ${service.offerMinutes} minutes` : ""}.
        </span>
      </div>
    )
  );
}

/** A calendar that is not connected, or could not be read: what it means for the receptionist, and the way to fix it. */
export function feedCard(p: Pick<CardProps, "vm" | "refreshing" | "refreshNow">) {
  const { vm, refreshing, refreshNow } = p;
  return (
    vm.feed.state !== "ok" && (
      <div className="cal-feed-card" data-testid="cal-feed-card">
        <Icon name="calendar" size={14} />
        {vm.feed.state === "none" ? (
          <span>
            <b>No calendar connected.</b> Paste the private iCal address of the calendar your appointments land in —
            Google, Apple or Outlook; Booksy, Calendly and the rest sync into one — under Settings › Business. Until
            then the receptionist {vm.bookingLink ? "sends the booking link but " : ""}never names an open time, and
            this board shows only your hours and closures.
          </span>
        ) : (
          <span>
            <b>Your calendar could not be read.</b> {vm.feed.problem || CR_FEED_WORDS.unavailable}
            {vm.feed.problem
              ? ` Until it reads, the receptionist ${vm.bookingLink ? "sends the booking link but " : ""}never names an open time.`
              : ""}
          </span>
        )}
        {/* A calendar that can't be read: its only way back was Settings (C2). */}
        {vm.feed.state === "unavailable" && (
          <Button size="sm" onClick={refreshNow} disabled={refreshing} data-testid="cal-feed-retry">
            {refreshing ? "Retrying…" : "Retry"}
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={() => navigate(routeTo.admin("workspace"))}>
          {vm.feed.state === "none" ? "Paste the address" : "Check the address"}
        </Button>
      </div>
    )
  );
}

/** A read that landed after a read that failed: the last good one is on screen, and the receptionist is using it too. */
export function staleCard(p: Pick<CardProps, "vm" | "refreshing" | "refreshNow">) {
  const { vm, refreshing, refreshNow } = p;
  return (
    vm.feed.state === "ok" &&
    vm.feed.stale && (
      <div className="cal-feed-card" data-testid="cal-feed-stale">
        <Icon name="calendar" size={14} />
        <span>
          <b>Showing the last good read.</b> {vm.feed.problem || CR_FEED_WORDS.stale} The receptionist is using this
          read too; it tries again every few minutes.
        </span>
        <Button size="sm" onClick={refreshNow} disabled={refreshing} data-testid="cal-feed-stale-retry">
          {refreshing ? "Retrying…" : "Retry"}
        </Button>
        <Button variant="quiet" size="sm" onClick={() => navigate(routeTo.admin("workspace"))}>
          Check the address
        </Button>
      </div>
    )
  );
}

/** What a read that landed left out (repeating events it cannot follow, events it does not draw), explained. */
export function feedNotes(p: { vm: CalendarVM; feedOk: boolean }) {
  const { vm, feedOk } = p;
  return (
    feedOk &&
    vm.feed.notes.map((n) => (
      <div key={n.id} className={`cal-feed-card cal-feed-note ${n.id}`} data-testid={`cal-feed-note-${n.id}`}>
        <Icon name={n.id === "repeats" ? "alert" : "calendar"} size={14} />
        <span>
          <b>{n.title}</b> {n.body}
        </span>
      </div>
    ))
  );
}

/** Days that could not be read say so, with a Retry, where a toast said it once and faded over days still dimmed as if loading. */
export function failedLine(p: {
  covered: boolean;
  failedSpan: string | null;
  spanKey: string | null;
  read: () => void;
  pending: boolean;
}) {
  const { covered, failedSpan, spanKey, read, pending } = p;
  return (
    !covered &&
    failedSpan === spanKey && (
      <FailedRead
        kind="line"
        what="those days"
        body="What was already on screen is still current, and the receptionist reads your calendar on its own."
        onRetry={read}
        busy={pending}
        className="cal-failed"
        testid="cal-failed"
      />
    )
  );
}

/** A read on its way says so in words; the board only dimmed (C2). */
export function readingLine(pending: boolean) {
  return (
    pending && (
      <div className="cal-reading" role="status" data-testid="cal-reading">
        Reading those days…
      </div>
    )
  );
}

/** The hours the receptionist works from, a run of days to a line. */
function hoursGroup(vm: CalendarVM) {
  return (
    <div className="cal-rules-group">
      <dt className="cal-rules-label">Hours</dt>
      <dd className="cal-rules-value">
        {vm.hoursLines.length
          ? vm.hoursLines.map((l) => (
              <span key={l} className="cal-rules-line">
                {l}
              </span>
            ))
          : "Not set yet"}
      </dd>
    </div>
  );
}

/** The closures ahead, and how many more there are than the bar names. */
function closedGroup(vm: CalendarVM) {
  return (
    <div className="cal-rules-group">
      <dt className="cal-rules-label">Closed</dt>
      <dd className="cal-rules-value">
        {vm.closuresAhead.length
          ? vm.closuresAhead.map((c) => (
              <span key={c.label} className="cal-rules-line">{`${c.label}${c.note ? ` (${c.note})` : ""}`}</span>
            ))
          : "None ahead"}
        {vm.closuresMore > 0 && <span className="cal-rules-line cal-rules-more">+{vm.closuresMore} more</span>}
      </dd>
    </div>
  );
}

/** The booking rules, one phrase to a part, so a narrow screen wraps between rules and never inside one. */
function bookingGroup(vm: CalendarVM) {
  return (
    <div className="cal-rules-group">
      <dt className="cal-rules-label">Booking</dt>
      <dd className="cal-rule-parts cal-rules-value">
        {vm.ruleParts.map((part) => (
          <span key={part} className="cal-rule" data-testid="cal-rule">
            {part}
          </span>
        ))}
      </dd>
    </div>
  );
}

/** The calendar's read as the pill Connections and Setup use (C3), and beside it only when it was read; Refresh asks for another. */
function feedGroup(p: Pick<CardProps, "vm" | "refreshing" | "refreshNow">) {
  const { vm, refreshing, refreshNow } = p;
  const Pill = statePill();
  return (
    <div className="cal-rules-group">
      {/* The Business tab's name for it, word for word (spec §10): one name for one thing on both pages. */}
      <dt className="cal-rules-label">Calendar it reads</dt>
      <dd className="cal-rules-value cal-rules-feed">
        {/* The state in the pill Connections and Setup use (C3), and beside it only when it was read: where
                    it reads from and how many events it found are Settings' to say. Something wrong keeps the whole
                    detail, when it was tried and when it was last read. */}
        <span className="cal-feed-chip" data-testid="cal-feed">
          <Pill kind="calendar" value={vm.feed.health} testid="cal-feed-state" />
          {(vm.feed.state === "ok" && !vm.feed.stale ? vm.feed.read : vm.feed.detail) && (
            <span className="cal-feed-detail">
              {vm.feed.state === "ok" && !vm.feed.stale ? vm.feed.read : vm.feed.detail}
            </span>
          )}
        </span>
        {vm.feed.present && (
          <Button
            size="sm"
            className="cal-refresh"
            onClick={refreshNow}
            disabled={refreshing}
            aria-busy={refreshing ? "true" : "false"}
            data-testid="cal-refresh"
          >
            <Icon name="refresh" size={12} />
            {refreshing ? "Reading…" : "Refresh"}
          </Button>
        )}
      </dd>
    </div>
  );
}

/** The hours, the rules and the calendar it reads, as one sheet: a term and its value, each value on lines of its own. */
function rulesSheet(p: Pick<CardProps, "vm" | "refreshing" | "refreshNow"> & { copyLink: () => void | Promise<void> }) {
  const { vm, refreshing, refreshNow, copyLink } = p;
  return (
    <div className="cal-rules" data-testid="cal-rules">
      <dl className="cal-rules-list">
        {hoursGroup(vm)}
        {closedGroup(vm)}
        {bookingGroup(vm)}
        {/* Which services wait for a consultation was said only inside the service picker (C1). */}
        {vm.consultFirst.length > 0 && (
          <div className="cal-rules-group" data-testid="cal-rules-consult">
            <dt className="cal-rules-label">Consultation first</dt>
            <dd className="cal-rules-value">{vm.consultFirst.join(" · ")}</dd>
          </div>
        )}
        {feedGroup({ vm, refreshing, refreshNow })}
      </dl>
      <div className="cal-rules-links">
        <span className="cal-about-note">
          {vm.bookingLink ? "Customers book through your booking link." : "Customers book with your team."}
        </span>
        <span className="cal-rules-doors">
          {vm.bookingLink && (
            <LinkButton className="cal-door" title={vm.bookingLink} onClick={copyLink} data-testid="cal-copy-link">
              <Icon name="copy" size={11} />
              Copy booking link
            </LinkButton>
          )}
          <LinkButton className="cal-door" onClick={() => navigate(routeTo.admin("workspace"))}>
            Edit in Settings › Business <Icon name="arrow-right" size={10} />
          </LinkButton>
        </span>
      </div>
    </div>
  );
}

/** What the foot is drawn from and does. */
interface FootProps extends Pick<CardProps, "vm" | "service" | "refreshing" | "refreshNow"> {
  aboutOpen: boolean;
  aboutRef: RefObject<HTMLDivElement | null>;
  toggleAbout: () => void;
  copyLink: () => void | Promise<void>;
}

/**
 * The foot: the legend, and the hours, the rules, the calendar's source and Refresh one tap away. The hours and the rules
 * were a card over the board, and the calendar's pill and Refresh sat among the controls: they are one tap away here. A
 * calendar that can't be read still says so over the board, with its Retry.
 */
export function calendarFoot(p: FootProps) {
  const { vm, service, refreshing, refreshNow, aboutOpen, aboutRef, toggleAbout, copyLink } = p;
  return (
    <div className="cal-foot">
      <div className="cal-foot-row">
        <div className="cal-legend" data-testid="cal-legend">
          <span>
            <i className="cal-legend-swatch taken" /> Taken, from your calendar
          </span>
          <span>
            <i className="cal-legend-swatch open" /> Open — the receptionist would offer it
            {service ? (service.consultFirst ? " for a consultation" : ` for ${service.name}`) : ""}, through{" "}
            {vm.offer.label}
          </span>
          <span>
            <i className="cal-legend-swatch closed" /> Outside your hours, or closed
          </span>
          <span className="cal-legend-rules">Times are {vm.zoneCity} time</span>
        </div>
        <Button
          variant="quiet"
          size="sm"
          className="cal-about-toggle"
          aria-expanded={aboutOpen}
          aria-controls="cal-about"
          onClick={toggleAbout}
          data-testid="cal-about-toggle"
        >
          Hours and rules <Icon name="chevron-down" size={12} />
        </Button>
      </div>
      <div
        className="cal-about"
        id="cal-about"
        ref={aboutRef}
        data-open={aboutOpen ? "true" : "false"}
        aria-hidden={aboutOpen ? undefined : "true"}
        inert={aboutOpen ? undefined : true}
        data-testid="cal-about"
      >
        {/* What the receptionist works from, as one sheet: a term and its value, each value on lines of its own. It
              was a run of labels and sentences ("From your calendar · read just now · 36 events") with a Refresh that
              read as a word (Ruben, 24 Sep: "less copy ... the refresh button does not even look like a button"). */}
        <div className="cal-about-in">{rulesSheet({ vm, refreshing, refreshNow, copyLink })}</div>
      </div>
    </div>
  );
}
