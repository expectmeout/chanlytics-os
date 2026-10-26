/**
 * What stands round the board (moved from legacy/pages/calendar.jsx CalendarReal, decision 0015): the one bar of controls
 * over it, its one notice, and the sheets of the hours and rules and of the booking emails held for a look. Each is a
 * plain function the page calls, never a component: the page's tree is what it was.
 *
 * The calendar first: one bar over the board (the range, the steps, what Show draws, the service the open times fit, and
 * Settings), then at most one notice, then the board. Show says what the board draws over the visits, which are always
 * drawn: the open times, the campaigns and cold email (contracts CALENDAR_SHOW_WORDS); its caption is the legend, which
 * stood in a foot under the board with Hours and rules. That foot is gone (D6): Hours and rules is a sheet Settings opens,
 * and on a phone Show's switches head Settings, where the bar has no room for a capsule of its own.
 */
import {
  BOOKING_TOOL_WORDS,
  CALENDAR_SETTING_ROUTE,
  CALENDAR_SHOW_WORDS as SHOW,
  addressOf,
  bookingEmailsHeldWords,
  bookingEmailsStep,
} from "@chanlytics/contracts";
import type { CalendarServiceVM, CalendarVM } from "@chanlytics/contracts";
import type { ReactNode } from "react";
import { Button } from "../kit/button/button";
import { DatePicker } from "../kit/datepicker/datepicker";
import { FailedRead } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { LinkButton } from "../kit/link-button/link-button";
import { Menu, type MenuGroup } from "../kit/menu/menu";
import { Notice } from "../kit/notice/notice";
import { StatePill } from "../kit/pill/state-pill";
import { Select } from "../kit/select/select";
import { Sheet } from "../kit/sheet/sheet";
import { navigate, openBookingTool } from "../legacy-verbs";
import { HeldBookingEmails } from "../settings/business/held-emails";
import type { CalendarShow } from "./use-calendar";
import { CR_CONNECT, CR_FEED_WORDS } from "./words";

/** Where a Business row of Settings opens: its pane, the row named (settings/frame/tabs.ts settingsRowOf). */
const businessRow = (row: string): string => `${addressOf({ kind: "facts" })}/${row}`;

/** What the bar over the board is drawn from and does. */
interface BarProps {
  vm: CalendarVM;
  anchor: string;
  label: string;
  /** A read of the days on screen is on its way: the range says so, where the board only dims (CAL-11). */
  pending: boolean;
  onToday: boolean;
  serviceName: string;
  move: (n: number) => void;
  setAnchorKey: (key: string | null) => void;
  setServiceName: (name: string) => void;
  refreshing: boolean;
  refreshNow: () => void | Promise<void>;
  openRules: () => void;
  show: CalendarShow;
  setShow: (show: CalendarShow) => void;
  /** Whether the workspace has a campaign, and a chain of cold email: Show offers what it has. */
  offers: { campaigns: boolean; cold: boolean };
  /** The workspace's word for what is booked (appointmentWords Many): Show's first, always-on switch. */
  many: string;
  /** Whether this is a phone, where Show's switches head Settings. */
  phone: boolean;
}

/** The service picker's first option, which is no service: the page keeps that as an empty name. */
const ANY_SERVICE = "*";

/** An item's glyph, at the size the menu draws it. */
const crGlyph = (name: string) => <Icon name={name} size={13} />;

/**
 * The legend, one short line under the switches while open times are drawn: for the service the picker filters by, and for
 * a consultation where that service needs one first (C5b, the rule the phone and the assistant follow), through the last
 * day the receptionist offers (C1), and the clock. On a desk too (Ruben, 21 Oct 2026: its three sentences, "Taken is from
 * your calendar or your booking tool. Open is a time the receptionist would offer…", read as confusing).
 */
function showLegend(vm: CalendarVM, serviceName: string): string {
  const service = vm.services.find((s) => s.name === serviceName) ?? null;
  const forWhat = service ? ` for ${service.consultFirst ? "a consultation" : service.name}` : "";
  return `Open times${forWhat} through ${vm.offer.label} · ${vm.zoneCity} time`;
}

/**
 * Whether the board has open times to draw: only from a calendar link that reads (contracts calendarSourceOf `times`; the
 * server reads no window without one, calendar-week.ts). With none, Open times flipped and nothing on the board moved
 * (Ruben, 21 Oct 2026), so neither it nor the service it filters by is offered.
 */
const opensTimes = (p: BarProps): boolean => p.vm.source.times;

/**
 * Show's switches: open times where the board has them; campaigns and cold email where it has them; none at all where
 * nothing can be switched. On a desk, the rows say the workspace's word for what is booked first, locked on; a phone's
 * chips leave it out, since a chip that cannot be pressed was the board itself said again ("Meetings · Always", Ruben,
 * 21 Oct 2026), and its one line of chips fits the three that can.
 */
function showGroup(p: BarProps): MenuGroup | null {
  const { show, setShow, offers } = p;
  const times = opensTimes(p);
  const switches = [
    ...(times ? [{ value: "open", label: SHOW.open, on: show.open }] : []),
    ...(offers.campaigns ? [{ value: "campaigns", label: SHOW.campaigns, on: show.campaigns }] : []),
    ...(offers.cold ? [{ value: "cold", label: SHOW.cold, on: show.cold }] : []),
  ];
  if (!switches.length) return null;
  const items = [...(p.phone ? [] : [{ value: "visits", label: p.many, on: true, locked: SHOW.always }]), ...switches];
  return {
    header: SHOW.label,
    ...(times && show.open ? { caption: showLegend(p.vm, p.serviceName) } : {}),
    toggles: {
      items,
      tick: <Icon name="check" size={13} />,
      chips: true,
      onToggle: (value) => {
        if (value === "open" || value === "campaigns" || value === "cold") setShow({ ...show, [value]: !show[value] });
      },
    },
  };
}

/**
 * What the calendar offers its owner, in one menu at the bar's end: on a phone what Show draws first, then the calendar's
 * settings in one group (Ruben, 21 Oct 2026: a quieter, compact Settings): the booking link, copied in place on one row
 * where it had a heading and two rows of its own; the hours and rules; the booking tool, saying where the calendar stands
 * where that is not simply working, in the one answer's few words; and the calendar read again now, where one is read.
 */
function optionsGroups(p: BarProps): MenuGroup[] {
  const { vm, refreshing, refreshNow, openRules } = p;
  const link = vm.bookingLink;
  const show = p.phone ? showGroup(p) : null;
  const groups: MenuGroup[] = show ? [show] : [];
  groups.push({
    header: "Calendar settings",
    items: [
      // Copied in place, the menu held open: the toast said it at the foot of a phone, under the thumb (CAL-23).
      ...(link ? [{ label: "Copy booking link", glyph: crGlyph("copy"), copy: { text: link, said: "Copied" } }] : []),
      { label: "Hours and rules", glyph: crGlyph("clock"), onSelect: openRules },
      {
        label: BOOKING_TOOL_WORDS.label,
        hint: vm.source.state === "ready" ? undefined : vm.source.words,
        glyph: crGlyph("cog"),
        onSelect: () => openBookingTool(CALENDAR_SETTING_ROUTE),
      },
      ...(vm.feed.present
        ? [
            {
              label: "Read it again now",
              hint: refreshing ? "Reading…" : undefined,
              glyph: crGlyph("refresh"),
              disabled: refreshing,
              onSelect: () => void refreshNow(),
            },
          ]
        : []),
    ],
  });
  return groups;
}

/** The steps and the range, which says which days are on screen (or that they are being read) and opens a date picker. */
function whenPart(p: BarProps) {
  const { vm, anchor, label, onToday, move, setAnchorKey } = p;
  return (
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
      {/* The range says which days are on screen, and opens the kit's date picker; a read on its way says so in it. */}
      <DatePicker
        value={anchor}
        onValueChange={setAnchorKey}
        today={vm.today}
        label="Go to a date"
        glyphs={{ previous: <Icon name="chevron" size={14} />, next: <Icon name="chevron" size={14} /> }}
        trigger={
          <Button variant="quiet" size="sm" className="cal-title" title="Go to a date" data-testid="cal-jump">
            <span
              className="cal-title-range"
              aria-live="polite"
              data-testid="cal-range"
              data-reading={p.pending || undefined}
            >
              {label}
            </span>
            {p.pending ? (
              <span className="cal-title-reading" role="status" data-testid="cal-reading">
                Reading…
              </span>
            ) : null}
            <Icon name="chevron-down" size={12} />
          </Button>
        }
      />
    </div>
  );
}

/**
 * Show, a capsule of the bar's own glass on a desk: its value says what is on beside the visits. Drawn wherever something
 * can be switched (open times from a calendar that reads, campaigns, cold email; a phone's are at the head of Settings),
 * and never where nothing can: a capsule whose only row is locked on says nothing.
 */
function showCapsule(p: BarProps) {
  if (p.phone) return null;
  const group = showGroup(p);
  if (!group) return null;
  // Open times are on only where the board has them to draw: the value never names what it cannot show.
  const on = { ...p.show, open: p.show.open && opensTimes(p) };
  return (
    <Menu
      align="end"
      label={SHOW.label}
      groups={[group]}
      trigger={
        <Button variant="quiet" className="cal-show" data-testid="cal-show">
          <span className="cal-show-key">{SHOW.label}</span>
          <span className="cal-show-value">{SHOW.value(on, p.offers)}</span>
          <Icon name="chevron-down" size={12} />
        </Button>
      }
    />
  );
}

/**
 * The service the open times must fit, "Open for · Any service": hidden while open times are off, all it filters (CAL-4),
 * and where the board has none to draw (`opensTimes`).
 */
function servicePick(p: BarProps) {
  const { vm, serviceName, setServiceName } = p;
  if (!vm.services.length || !p.show.open || !opensTimes(p)) return null;
  return (
    <Select
      value={serviceName || ANY_SERVICE}
      onValueChange={(next) => setServiceName(next === ANY_SERVICE ? "" : next)}
      options={[
        { value: ANY_SERVICE, label: `${SHOW.openFor} · ${SHOW.anyService}` },
        ...vm.services.map((s) => ({ value: s.name, label: `${SHOW.openFor} · ${s.label}` })),
      ]}
      chevron={<Icon name="chevron-down" size={12} />}
      label="Open times that fit a service"
      className="cal-service"
      data-testid="cal-service"
    />
  );
}

/**
 * Settings: what the Calendar offers its owner, one menu. The cog says its word where the row has the room for it, as the
 * capsules beside it say theirs (Ruben, 8 Oct 2026: a bare cog at the bar's end), and is the glass circle, the cog in its
 * middle, where it has not; a screen reader has the button's name either way (calendar.css, decision D8).
 */
function settingsPart(p: BarProps) {
  return (
    <Menu
      align="end"
      label="Calendar settings"
      groups={optionsGroups(p)}
      trigger={
        <Button
          variant="quiet"
          className="cal-options"
          title="Calendar settings"
          aria-label="Calendar settings"
          data-testid="cal-options"
        >
          <Icon name="cog" size={16} />
          <span className="cal-options-word">Settings</span>
        </Button>
      }
    />
  );
}

/**
 * The page's act, on the frame's row of views (chrome.ts), where Reports' period stands: on a desk the whole bar, the steps
 * and the range beside the views and Show, the service and Settings at the row's end (Ruben, 14 Oct 2026: one row, where
 * the tabs are); on a phone Settings alone, beside the views, where the bar under them has no room for it.
 */
export function calendarAct(p: BarProps) {
  if (p.phone) return <div className="cal-act">{settingsPart(p)}</div>;
  return (
    <div className="cal-act" data-testid="cal-bar">
      {whenPart(p)}
      <div className="cal-tools">
        {showCapsule(p)}
        {servicePick(p)}
        {settingsPart(p)}
      </div>
    </div>
  );
}

/**
 * A phone's bar, under the frame's row of views: the range and the steps on one row with no room to spare. Yesterday's
 * visits to mark are the header's (frame/topbar/status-bars.tsx UnmarkedVisitsBar), as a call is, on every page but
 * Today. A desk's bar is the act on the row of views (`calendarAct`).
 */
export function calendarHead(p: BarProps) {
  if (!p.phone) return null;
  return (
    <div className="cal-head">
      <div className="cal-bar" data-testid="cal-bar">
        {whenPart(p)}
        {/* The service the open times fit, on a tablet's bar; a phone's glance is the day (mobile.css). */}
        <div className="cal-tools">{servicePick(p)}</div>
      </div>
    </div>
  );
}

/** What the one notice is drawn from: the view model, the service picked, and the board's own reads. */
interface NoticeProps {
  vm: CalendarVM;
  service: CalendarServiceVM | null;
  refreshing: boolean;
  refreshNow: () => void | Promise<void>;
  covered: boolean;
  failedSpan: string | null;
  spanKey: string;
  read: () => void;
  pending: boolean;
  /** Open the booking emails held for a look, over the board (`heldEmailsSheet`). */
  openHeld: () => void;
}

/** One notice, the kit's: its fact, its one act, its name for a screen reader. */
interface NoticeVM {
  id: string;
  fact: ReactNode;
  act: ReactNode;
  label: string;
}

/**
 * The feed card's one door: the next press the one answer names (contracts calendarSourceOf), which opens the Booking
 * tool's sheet here. Where the answer's own door is this page, the row is offered by its name.
 */
function feedDoorOf(s: CalendarVM["source"]): { words: string; to: string } {
  const here = s.next.to === "calendar";
  return { words: here ? BOOKING_TOOL_WORDS.label : s.next.label, to: here ? CALENDAR_SETTING_ROUTE : s.next.to };
}

/** A press of a notice's act, by where it goes: the booking tool's sheet over the board, else the page it names. */
const goTo = (to: string) => () => (to === CALENDAR_SETTING_ROUTE ? openBookingTool(to) : navigate(to));

/**
 * Whether the card's next step is a look at the tool's held emails (contracts bookingEmailsStep, the rule the card's
 * words come from): then its door opens them, never the Booking tool's picker, which asked what the business books with
 * and drew none of them (Ruben, 20 Oct 2026). An address to make or a forward to confirm comes first, and keeps the sheet.
 * The step asks when the last one became a visit only after the held, so the board's read, which says how long ago and
 * not when, gives it none.
 */
function heldIsNext(vm: CalendarVM): boolean {
  const n = vm.feed.notices;
  const facts = { address: !!n.address, forwarding: !!n.forwarding, lastAt: null, held: n.held };
  return n.heldList.length > 0 && bookingEmailsStep(facts) === "held";
}

/** The calendar could not be read: why, and Retry. */
function unreadNotice(p: NoticeProps): NoticeVM {
  const { vm } = p;
  const why = vm.feed.problem || CR_FEED_WORDS.unavailable;
  const until = vm.feed.problem
    ? ` Until it reads, the receptionist ${vm.bookingLink ? "sends the booking link but " : ""}never names an open time.`
    : "";
  return {
    id: "feed",
    fact: (
      <>
        <b>Your calendar could not be read.</b> {why}
        {until}
      </>
    ),
    act: (
      <Button size="sm" onClick={p.refreshNow} disabled={p.refreshing} data-testid="cal-feed-retry">
        {p.refreshing ? "Retrying…" : "Retry"}
      </Button>
    ),
    label: "Your calendar could not be read.",
  };
}

/**
 * No calendar link that reads: what the calendar is fed by instead (vm.source), and the way to what is next: the held
 * emails' own sheet where that is a look at them (`openHeld`), else the door the one answer names. Nothing connected is
 * its first sentence alone and a door that says Connect (Ruben, 21 Oct 2026: the sentence after it and "Connect your
 * calendar" said it three times); Settings' row, where the owner chooses, keeps the whole sentence.
 */
function sourceNotice(vm: CalendarVM, openHeld: () => void): NoticeVM | null {
  const s = vm.source;
  if (s.state === "hand" || s.state === "ready") return null;
  const door = feedDoorOf(s);
  const brief = s.state === "none";
  return {
    id: "feed",
    fact: (
      <span data-testid={s.by === "emails" ? "cal-feed-notices" : undefined}>
        <b>{s.lead}</b>
        {s.rest && !brief ? ` ${s.rest}` : ""}
      </span>
    ),
    act: (
      <Button
        size="sm"
        variant={s.state === "waiting" ? "quiet" : "primary"}
        onClick={heldIsNext(vm) ? openHeld : goTo(door.to)}
        data-testid="cal-feed-door"
      >
        {brief ? CR_CONNECT : door.words}
      </Button>
    ),
    label: s.lead,
  };
}

/** The notices the board may carry, the most pressing first; the slot draws the first (CAL-12). */
function noticesOf(p: NoticeProps): NoticeVM[] {
  const { vm, service } = p;
  const out: NoticeVM[] = [];
  if (vm.feed.state === "unavailable") out.push(unreadNotice(p));
  else if (vm.feed.state !== "ok") {
    const n = sourceNotice(vm, p.openHeld);
    if (n) out.push(n);
  }
  if (vm.feed.state === "ok" && vm.feed.stale)
    out.push({
      id: "stale",
      fact: (
        <>
          <b>Showing the last good read.</b> {vm.feed.problem || CR_FEED_WORDS.stale} The receptionist is using it too.
        </>
      ),
      act: (
        <Button size="sm" onClick={p.refreshNow} disabled={p.refreshing} data-testid="cal-feed-stale-retry">
          {p.refreshing ? "Retrying…" : "Retry"}
        </Button>
      ),
      label: "Showing the last good read.",
    });
  // Hours never set: no day is drawn closed, and none is offered (CAL-2).
  if (!vm.hoursSet)
    out.push({
      id: "hours",
      fact: (
        <>
          <b>Your hours aren't set.</b> No day shows as closed, and the receptionist offers no time until they are.
        </>
      ),
      act: (
        <Button size="sm" variant="quiet" onClick={() => navigate(businessRow("hours"))} data-testid="cal-hours-door">
          Set your hours
        </Button>
      ),
      label: "Your hours aren't set.",
    });
  if (service?.consultFirst)
    out.push({
      id: "consult",
      fact: (
        <>
          <b>{service.name} needs a consultation first.</b> The open times here are for a consultation
          {service.offerMinutes ? `, about ${service.offerMinutes} minutes` : ""}.
        </>
      ),
      act: null,
      label: `${service.name} needs a consultation first.`,
    });
  for (const n of vm.feed.state === "ok" ? vm.feed.notes : [])
    out.push({
      id: `note-${n.id}`,
      fact: (
        <>
          <b>{n.title}</b> {n.body}
        </>
      ),
      act: null,
      label: n.title,
    });
  return out;
}

/**
 * The board's one notice slot (CAL-12): the most pressing of what it has to say, in the kit's Notice, where up to five
 * cards stacked over the days and pushed the first one off a phone. Days a read could not reach keep their own line
 * with its Retry (the kit's FailedRead), which is about the days on screen, not the calendar.
 */
export function noticeSlot(p: NoticeProps) {
  if (!p.covered && p.failedSpan === p.spanKey)
    return (
      <FailedRead
        kind="line"
        what="those days"
        body="What was already on screen is still current, and the receptionist reads your calendar on its own."
        onRetry={p.read}
        busy={p.pending}
        className="cal-failed"
        testid="cal-failed"
      />
    );
  const first = noticesOf(p).at(0);
  if (!first) return null;
  return (
    <Notice
      line
      fact={first.fact}
      act={first.act}
      label={first.label}
      className="cal-notice"
      testid={`cal-notice-${first.id}`}
    />
  );
}

/**
 * A group's name, which is the door to where it is kept: the Business row of that name, opened (the address names the
 * row: settings/frame/tabs.ts settingsRowOf).
 */
function rulesLabel(words: string, row: string) {
  return (
    <dt className="cal-rules-label">
      <LinkButton
        className="cal-door"
        onClick={() => navigate(businessRow(row))}
        title="Change it in Settings › Hours & booking"
        data-testid={`cal-rules-door-${row}`}
      >
        {words} <Icon name="arrow-right" size={9} />
      </LinkButton>
    </dt>
  );
}

/** One group of the sheet: its name, the door to where it is kept, and its lines (or what it says with none). */
function rulesGroup(g: { words: string; row: string; lines: readonly string[]; none: string; testid?: string }) {
  const { words, row, lines, none, testid } = g;
  return (
    <div className="cal-rules-group" data-testid={testid}>
      {rulesLabel(words, row)}
      <dd className="cal-rules-value">
        {lines.length
          ? lines.map((l) => (
              <span key={l} className="cal-rules-line">
                {l}
              </span>
            ))
          : none}
      </dd>
    </div>
  );
}

/** What the calendar is fed by: its read in the pill Connections uses, and Refresh; with no link, the one answer's words. */
function feedGroup(p: { vm: CalendarVM; refreshing: boolean; refreshNow: () => void | Promise<void> }) {
  const { vm, refreshing, refreshNow } = p;
  const read = vm.feed.state === "ok" && !vm.feed.stale ? vm.feed.read : vm.feed.detail;
  return (
    <div className="cal-rules-group">
      {rulesLabel(BOOKING_TOOL_WORDS.label, "calendar")}
      <dd className="cal-rules-value cal-rules-feed">
        <span className="cal-feed-state" data-testid="cal-feed">
          {vm.feed.present ? (
            <StatePill kind="calendar" value={vm.feed.health} testid="cal-feed-state" />
          ) : (
            <StatePill kind="tone" value={vm.source.tone} label={vm.source.words} testid="cal-feed-state" />
          )}
          {vm.feed.present && read ? <span className="cal-feed-detail">{read}</span> : null}
          {!vm.feed.present && vm.feed.notices.tool ? (
            <span className="cal-feed-detail">{vm.feed.notices.tool}</span>
          ) : null}
        </span>
        {vm.feed.present && (
          <Button
            size="sm"
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

/**
 * The hours, the rules and the calendar it reads, as the kit's sheet Settings opens (D6): a term and its value, each
 * value on lines of its own, each term a door to the Business row that keeps it.
 */
export function rulesSheet(p: {
  open: boolean;
  onClose: () => void;
  vm: CalendarVM;
  refreshing: boolean;
  refreshNow: () => void | Promise<void>;
}) {
  const { vm } = p;
  const closed = [
    ...vm.closuresAhead.map((c) => `${c.label}${c.note ? ` (${c.note})` : ""}`),
    ...(vm.closuresMore > 0 ? [`+${vm.closuresMore} more`] : []),
  ];
  return (
    <Sheet
      open={p.open}
      onClose={p.onClose}
      title="Hours and rules"
      sub={`Times are ${vm.zoneCity} time`}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      fit
      testid="cal-rules"
    >
      <dl className="cal-rules-list">
        {rulesGroup({ words: "Hours", row: "hours", lines: vm.hoursLines, none: "Not set yet" })}
        {rulesGroup({ words: "Closed", row: "closures", lines: closed, none: "None ahead" })}
        {rulesGroup({ words: "Booking", row: "booking_rules", lines: vm.ruleParts, none: "" })}
        {vm.consultFirst.length > 0
          ? rulesGroup({
              words: "Consultation first",
              row: "consult_first",
              lines: [vm.consultFirst.join(" · ")],
              none: "",
              testid: "cal-rules-consult",
            })
          : null}
        {feedGroup(p)}
      </dl>
      <p className="cal-about-note">
        {vm.bookingLink ? "Customers book through your booking link." : "Customers book with your team."}
      </p>
    </Sheet>
  );
}

/**
 * The card's "Look at them", over the board: the held emails themselves in the kit's sheet, named by their count, the
 * list Settings' Booking tool fold draws too (settings/business/held-emails.tsx). It closes by itself once the last of
 * them is read again or dismissed, since there is nothing left in it to look at.
 */
export function heldEmailsSheet(p: { open: boolean; onClose: () => void; notices: CalendarVM["feed"]["notices"] }) {
  return (
    <Sheet
      open={p.open && p.notices.heldList.length > 0}
      onClose={p.onClose}
      title={bookingEmailsHeldWords(p.notices.held)}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      testid="cal-held-emails"
    >
      <HeldBookingEmails notices={p.notices} head={false} />
    </Sheet>
  );
}
