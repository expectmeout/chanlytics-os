/**
 * Calendar — the owner's calendar as the receptionist reads it.
 *
 * A viewer, never a scheduler: what the feed says is taken, the hours and
 * closures the business keeps, and the windows the receptionist would offer
 * a caller — the same windows the phone tool and the assistant compute
 * (availability.ts), so the page shows what callers are told. Nothing is
 * booked here; the booking link does that, whichever tool stands behind it.
 *
 * The DTO is what the route returns for one span of days; the view model is
 * what the page draws — a week or a day on the mockup's own geometry (hours
 * down, days across), a month of counts, or an agenda — with bands where
 * the business is closed, blocks where the calendar is taken, dashed
 * windows where it is open, and the words Settings gave it: the hours, the
 * closures ahead, the booking rules, the services and how long they take.
 * Pure; tests feed fixtures.
 *
 * This module builds the view model (toCalendarVM) in the shape calendar-vm.ts declares. The modules beside it
 * hold the rest: the route's DTO (calendar-dto.ts), day keys (day-keys.ts), the words (calendar-words.ts), and
 * the views and the window loaded around them (calendar-views.ts).
 */
import { timezoneCity } from "../shared/time";
import { replyReachOf } from "../people/person-reach";
import { formatPhoneDisplay } from "../shared/phone";
import { BOOKING_DEFAULTS, closedOn, dayIntervals, hasHours } from "./availability";
import { clockInZone, dayInZone, dayPlusInZone } from "./zone-math";
import { offerFor } from "./service-offer";
import { visitTitleWithout } from "./visit/visit-service";
import { DAY_SHORT, DOW, keyParts, monthLabelOf, shiftKey, zoneMidnight } from "./day-keys";
import { bookingToolName, NOTICE_HOLD_WORDS } from "./booking-notice";
import {
  CALENDAR_OWED_WORD,
  bookingEmailsStep,
  calendarSourceOf,
  forwardStillAsked,
  type BookingEmailsFacts,
} from "../setup/calendar-source";
import {
  clockLabel,
  closureDatesLabel,
  closuresFrom,
  feedNotes,
  hoursLines,
  longDate,
  readAgoLabel,
  ruleParts,
  rulesLine,
  shortDate,
  spanLabel,
  type CalendarFeedHealth,
} from "./calendar-words";
import type {
  CalendarBandVM,
  CalendarBlockVM,
  CalendarClosureVM,
  CalendarDayVM,
  CalendarServiceVM,
  CalendarVM,
  CalendarWindowVM,
} from "./calendar-vm";
import type { CalendarFeedDto, CalendarItemDto, CalendarWeekDto } from "./calendar-dto";

function hoursOf(tz: string, ms: number): number {
  const c = clockInZone(tz, ms);
  return c.hh + c.mm / 60;
}

/**
 * When the next open time is, the way an owner says it: "today 3:30 PM",
 * "tomorrow 10 AM", "Fri 10 AM" within the week, and past it the date,
 * "Sep 17, 10 AM" -- a weekday alone named a day a week too soon (C1).
 */
function nextOpenWords(startIso: string | null, tz: string, todayKey: string): string {
  const ms = startIso ? Date.parse(startIso) : Number.NaN;
  if (!Number.isFinite(ms)) return "—";
  const day = dayInZone(tz, ms);
  const clock = clockLabel(hoursOf(tz, ms));
  if (day.key === todayKey) return `today ${clock}`;
  if (day.key === shiftKey(todayKey, 1)) return `tomorrow ${clock}`;
  if (day.key <= shiftKey(todayKey, 6)) return `${DAY_SHORT[day.weekday] ?? day.weekday} ${clock}`;
  return `${shortDate(day.key)}, ${clock}`;
}

/**
 * What a booking that arrived by email states and a feed's event does not (docs/plans/2026-10-07-bookings-arrive-by-email.md):
 * the tool, who it is with and the price. All null for a feed's event.
 */
function noticeFacts(item: CalendarItemDto): Pick<CalendarBlockVM, "tool" | "staff" | "price"> {
  if (item.source !== "notice") return { tool: null, staff: null, price: null };
  return { tool: item.tool ?? null, staff: item.staff ?? null, price: item.price ?? null };
}

/**
 * What the block is for: the service a notice stated; else the title with the person's name taken out of it, so a row
 * that names them does not say them twice ("Gloss · Emily Chen" beside Emily Chen is "Gloss"), by the one rule every page
 * says a visit's title by (visit-service.ts visitTitleWithout). A salon writes the customer into the event's title, so
 * the feed hands us both, and Today's card and the Calendar's agenda each drew the pair.
 */
function serviceWordsOf(item: CalendarItemDto): string {
  if (item.source === "notice" && item.service) return item.service;
  return visitTitleWithout(item.title || "Busy", [item.person?.name]);
}

/**
 * The feed's whole sentence, by its state: what was read, why it could not be, or, with no calendar, the bookings that
 * arrive by email when any have (the notices' line), else that none is connected.
 */
function feedLineOf(state: CalendarFeedDto["state"], feedDetail: string, noticesLine: string): string {
  if (state === "ok") return feedDetail;
  if (state === "unavailable") return `Your calendar could not be read${feedDetail ? ` · ${feedDetail}` : ""}`;
  return noticesLine || "No calendar connected";
}

/** The bookings that arrived by email, as the board's card, Settings' row and Ask say them: one line, said once. */
function noticesVM(n: CalendarFeedDto["notices"], now: Date): CalendarVM["feed"]["notices"] {
  const tool = n?.tool ? bookingToolName(n.tool) : null;
  const lastAgo = readAgoLabel(n?.last_at ?? null, now);
  const held = n?.held ?? 0;
  const line = n?.last_at
    ? `Bookings arrive by email from ${tool ?? "your booking tool"} · last ${lastAgo ?? "just now"}${held ? ` · ${held} to look at` : ""}`
    : "";
  // Working once a notice has become a visit; waiting from the moment the owner named a tool; nothing before that.
  const state = n?.last_at ? "working" : n?.tool ? "waiting" : "none";
  const heldList = (n?.held_list ?? []).map((h) => ({
    id: h.id,
    noticeId: h.notice_id ?? null,
    tool: bookingToolName(h.tool),
    from: h.from,
    subject: h.subject,
    receivedAgo: readAgoLabel(h.received_at, now),
    reason: NOTICE_HOLD_WORDS[h.reason],
  }));
  // Shown for as long as it is asked (setup/calendar-source.ts forwardStillAsked), and no longer.
  const forwarding =
    n?.forwarding && forwardStillAsked(n.forwarding.at, now)
      ? { account: n.forwarding.account, code: n.forwarding.code, link: n.forwarding.link }
      : null;
  const address = n?.address ?? null;
  const row = state === "none" ? null : noticeRowOf(emailsFactsOf(n, !!forwarding), lastAgo);
  const suggested = address ? null : (n?.suggested ?? null);
  return { tool, address, suggested, lastAgo, count: n?.count ?? 0, held, line, state, heldList, forwarding, row };
}

/** The notices as the one rule reads them (setup/calendar-source.ts): an address, a forward still shown, the latest, the held. */
const emailsFactsOf = (n: CalendarFeedDto["notices"], forwarding: boolean): BookingEmailsFacts => ({
  address: !!n?.address,
  forwarding,
  lastAt: n?.last_at ?? null,
  held: n?.held ?? 0,
});

/**
 * The Business row's phrase: the next thing to do, first. A tool named with no address to send to, then a forward
 * Gmail waits on, are the owner's to fix (warn); emails held for a look are too; otherwise the last email's age (ok),
 * or waiting for the first (plain).
 */
function noticeRowOf(e: BookingEmailsFacts, lastAgo: string | null): NonNullable<CalendarVM["feed"]["notices"]["row"]> {
  // The owner's to do, in the word every page gives a step that waits on them (setup/calendar-source.ts CALENDAR_OWED_WORD).
  const needsYou = (words: string) => ({ tone: "warn" as const, label: CALENDAR_OWED_WORD, words });
  const last = `Last booking email ${lastAgo ?? "just now"}`;
  // The order is the one rule's (setup/calendar-source.ts bookingEmailsStep), which every page's status asks too.
  const step = bookingEmailsStep(e);
  if (step === "address") return needsYou("Needs a workspace email address");
  if (step === "forwarding") return needsYou("Confirm the forward in Gmail");
  // Emails held for a look are the owner's to see whether or not one has become a visit yet.
  if (step === "held")
    return needsYou(
      e.lastAt ? `${last} · ${e.held} to look at` : `${e.held} booking ${e.held === 1 ? "email" : "emails"} to look at`,
    );
  if (step === "waiting") return { tone: "plain", label: "Waiting", words: "Waiting for the first booking email" };
  return { tone: "ok", label: "Working", words: last };
}

/** When the feed was read, on its own: a row that says only that is saying the one part an owner acts on ("is it current?"). */
const feedReadWords = (state: CalendarFeedDto["state"], ago: string | null): string =>
  state === "ok" ? `read ${ago ?? "just now"}` : state === "unavailable" && ago ? `last read ${ago}` : "";

/** What the calendar is fed by, said once (setup/calendar-source.ts): Setup, Connections, the board's card and Ask say the same. */
const sourceOfWeek = (dto: CalendarWeekDto, link: CalendarFeedHealth, forwarding: boolean): CalendarVM["source"] =>
  calendarSourceOf({
    link,
    problem: dto.feed.problem ?? null,
    tool: dto.feed.notices?.tool ?? null,
    byHand: !!dto.feed.by_hand,
    emails: dto.feed.notices ? emailsFactsOf(dto.feed.notices, forwarding) : null,
    bookingLink: !!dto.booking_link,
  });

function toBlock(item: CalendarItemDto, tz: string, dayStartMs: number, dayEndMs: number, now: Date): CalendarBlockVM {
  const s = Math.max(Date.parse(item.start), dayStartMs);
  const e = Math.min(Date.parse(item.end), dayEndMs);
  const t = s === dayStartMs ? 0 : hoursOf(tz, s);
  const tEnd = e === dayEndMs ? 24 : hoursOf(tz, e);
  return {
    id: item.id,
    t,
    dur: Math.max(15, Math.round((tEnd - t) * 60)),
    title: item.title || "Busy",
    service: serviceWordsOf(item),
    time: spanLabel(t, tEnd),
    person: item.person
      ? {
          id: item.person.id,
          name: item.person.name,
          via: item.person.via ?? null,
          threadId: item.person.thread ? `th-${item.person.thread}` : null,
          bookingLinkAction: replyReachOf(
            {
              // A read that carries no reach (a server that predates it: either deploy order works) is read as it was
              // before: a person with a thread is reached on WhatsApp, held by its window.
              wire:
                item.person.reply_wire !== undefined ? item.person.reply_wire : item.person.thread ? "whatsapp" : null,
              waInboundAt: item.person.wa_inbound_at,
              emailStopped: !!item.person.email_stopped,
              optedOut: !!item.person.opted_out,
              who: item.person.name,
            },
            now,
          ).bookingLinkAction,
          stopped: !!item.person.opted_out,
          facts: item.person.facts ?? null,
        }
      : null,
    description: item.description ?? null,
    location: item.location ?? null,
    contacts: {
      phones: (item.contacts?.phones ?? []).map((p) => formatPhoneDisplay(p) ?? p),
      e164: item.contacts?.phones ?? [],
      emails: item.contacts?.emails ?? [],
    },
    guess: item.guess ?? null,
    series: !!item.series,
    consultation: !!item.consultation,
    consultService: item.consultation ? (item.consult_service ?? null) : null,
    ...noticeFacts(item),
    start: item.start,
    end: item.end,
    visit: item.visit ?? null,
    ...(item.request ? { request: { threadId: item.request.thread_id, open: item.request.open } } : {}),
    ...(item.origin ? { origin: item.origin } : {}),
    lane: 0,
    lanes: 1,
  };
}

/**
 * Lanes: blocks that overlap in time sit side by side, never on top of each
 * other. Sorted by start, each block takes the first lane whose last block
 * has ended; a run of transitively overlapping blocks is one cluster, and
 * every block in it is as wide as the cluster's lane count allows.
 */
function assignLanes(timed: CalendarBlockVM[]): void {
  let cluster: CalendarBlockVM[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    for (const b of cluster) b.lanes = laneEnds.length;
  };
  for (const b of timed) {
    const end = b.t + b.dur / 60;
    if (b.t >= clusterEnd - 1e-9 && cluster.length) {
      close();
      cluster = [];
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((e) => e <= b.t + 1e-9);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else laneEnds[lane] = end;
    b.lane = lane;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, end);
  }
  close();
}

/**
 * The span as the page draws it. `now` decides today, the now line, which
 * days are past, the next open time and the closures ahead.
 */
/** The services the open times may fit, sized by the phone tool's and the assistant's rule: a consult-first one as a consultation (C5b). */
function servicesOf(dto: CalendarWeekDto): CalendarServiceVM[] {
  const all = dto.services ?? [];
  const listed = all.map((s) => ({ name: s.name, duration_min: s.duration_min ?? undefined }));
  return all.map((s) => ({
    name: s.name,
    duration: s.duration_min,
    consultFirst: s.consult_first,
    offerMinutes: offerFor(listed, dto.rules, s.name)?.minMinutes ?? null,
    label: `${s.name}${s.duration_min ? ` · ${s.duration_min} min` : ""}${s.consult_first ? " · consultation first" : ""}`,
  }));
}

/** Whether a day is closed: a closure the owner set, or a weekday the hours leave out where hours are set at all (CAL-2). */
function closedDayOf(
  closures: CalendarWeekDto["closures"],
  key: string,
  hoursSet: boolean,
  intervals: readonly unknown[],
): boolean {
  if (closedOn(closures, key)) return true;
  return hoursSet && intervals.length === 0;
}

/**
 * A day's bands over the grid's hours: the whole day where it is closed (a closure, or a weekday the hours leave out),
 * else the hours outside the business's own; none where no hours are set (CAL-2), which is no closed day.
 */
function dayBandsOf(p: {
  closedDay: boolean;
  hoursSet: boolean;
  intervals: ReadonlyArray<readonly [string, string]>;
  note: string | null;
  start: number;
  end: number;
}): CalendarBandVM[] {
  const { start, end } = p;
  if (p.closedDay) return [{ from: start, to: end, label: p.note ? `Closed · ${p.note}` : "Closed" }];
  if (!p.hoursSet) return [];
  const bands: CalendarBandVM[] = [];
  let cursor = start;
  for (const [o, c] of p.intervals) {
    const oh = Number(o.split(":")[0]) + Number(o.split(":")[1]) / 60;
    const ch = Number(c.split(":")[0]) + Number(c.split(":")[1]) / 60;
    if (oh > cursor) bands.push({ from: cursor, to: oh, label: null });
    cursor = Math.max(cursor, ch);
  }
  if (cursor < end) bands.push({ from: cursor, to: end, label: null });
  return bands;
}

export function toCalendarVM(dto: CalendarWeekDto, now = new Date()): CalendarVM {
  const tz = dto.timezone;
  const todayKey = dayInZone(tz, now.getTime()).key;
  const nowMs = now.getTime();
  // How far ahead the receptionist offers: the days freeWindows walks, today and max_days_ahead - 1 after it.
  // A day past the last of them has no open times however free it is, and says so rather than looking booked (C1).
  const offerDays = { ...BOOKING_DEFAULTS, ...(dto.rules ?? {}) }.max_days_ahead;
  const offerUntil = dayPlusInZone(tz, nowMs, offerDays - 1).key;
  // Whether the business has said when it is open at all (availability.ts hasHours). Without hours no day is Closed: a
  // workspace that never set them saw every day banded "Closed" over its bookings (CAL-2). A closure is still closed.
  const hoursSet = hasHours(dto.hours ?? undefined);

  // The grid's hours: the business's own, an hour of air on each side.
  let start = 24;
  let end = 0;
  for (const h of Object.values(dto.hours ?? {})) {
    for (const [o, c] of dayIntervals(h)) {
      const oh = Number(o.split(":")[0]);
      const ch = Number(c.split(":")[0]) + (Number(c.split(":")[1]) > 0 ? 1 : 0);
      if (Number.isFinite(oh)) start = Math.min(start, oh);
      if (Number.isFinite(ch)) end = Math.max(end, ch);
    }
  }
  if (start >= end) {
    start = 8;
    end = 20;
  }
  start = Math.max(0, start - 1);
  end = Math.min(24, end + 1);
  // A block outside the business's hours widens the grid rather than falling
  // off it: an 8 PM appointment when the shop closes at 6 is still drawn.
  for (const d of dto.days) {
    const ds = zoneMidnight(tz, d.key);
    const de = zoneMidnight(tz, shiftKey(d.key, 1));
    for (const item of d.items) {
      const s = Date.parse(item.start);
      const e = Date.parse(item.end);
      if (item.all_day || !(e > ds && s < de) || (s <= ds && e >= de)) continue;
      const b = toBlock(item, tz, ds, de, now);
      start = Math.min(start, Math.max(0, Math.floor(b.t)));
      end = Math.max(end, Math.min(24, Math.ceil(b.t + b.dur / 60)));
    }
  }

  const days: CalendarDayVM[] = dto.days.map((d) => {
    const { y, m, d: dd } = keyParts(d.key);
    const weekday = DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()].toLowerCase();
    const closure =
      dto.closures.find((c) => c.date <= d.key && d.key <= (c.until && c.until >= c.date ? c.until : c.date)) ?? null;
    const intervals = dayIntervals(dto.hours?.[weekday]);
    const closedDay = closedDayOf(dto.closures, d.key, hoursSet, intervals);
    const bands = dayBandsOf({ closedDay, hoursSet, intervals, note: closure?.note ?? null, start, end });
    const zoneDayStart = zoneMidnight(tz, d.key);
    const zoneDayEnd = zoneMidnight(tz, shiftKey(d.key, 1));
    const timed: CalendarBlockVM[] = [];
    const allDay: CalendarBlockVM[] = [];
    for (const item of d.items) {
      const s = Date.parse(item.start);
      const e = Date.parse(item.end);
      if (!(e > zoneDayStart && s < zoneDayEnd)) continue;
      const block = toBlock(item, tz, zoneDayStart, zoneDayEnd, now);
      if (item.all_day || (s <= zoneDayStart && e >= zoneDayEnd))
        allDay.push({ ...block, t: 0, dur: 24 * 60, time: "All day" });
      else timed.push(block);
    }
    timed.sort((a, b) => a.t - b.t || b.dur - a.dur);
    assignLanes(timed);
    const windows: CalendarWindowVM[] = d.windows.map((w) => {
      const t = hoursOf(tz, Date.parse(w.start));
      const tEnd = hoursOf(tz, Date.parse(w.end));
      return { t, dur: Math.round((tEnd - t) * 60), label: spanLabel(t, tEnd) };
    });
    return {
      key: d.key,
      dow: DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()],
      date: shortDate(d.key),
      long: longDate(d.key),
      dayNum: String(dd),
      today: d.key === todayKey,
      past: d.key < todayKey,
      closed: { yes: closedDay, note: closure?.note ?? null },
      bands,
      blocks: timed,
      allDay,
      windows,
      beyondOffer: d.key > offerUntil,
    };
  });

  const events = days.reduce((a, d) => a + d.blocks.length + d.allDay.length, 0);
  const windowCount = days.reduce((a, d) => a + d.windows.length, 0);
  // The receptionist's next open time, as the route found it among every time it would offer -- never worked out
  // from the loaded weeks, which on a board looking at another month held none (C1).
  const next = dto.feed.state === "ok" ? nextOpenWords(dto.next_opening?.start ?? null, tz, todayKey) : "—";
  const ago = readAgoLabel(dto.feed.read_at, now);
  const stale = dto.feed.state === "ok" && !!dto.feed.stale;
  // When the calendar was last tried is the news only when that try failed (C2).
  const tried = readAgoLabel(dto.feed.checked_at ?? null, now);
  // What the pill beside it does not say (C3). What a read left out is said once, by feedNotes, in words the owner can
  // act on; the line said it again as "2 repeating rules read once · 3 more not shown", unexplained (C1).
  const feedDetail =
    dto.feed.state === "ok"
      ? `From ${dto.feed.source ?? "your calendar"} · read ${ago ?? "just now"}${stale ? ` · could not be refreshed${tried ? ` ${tried}` : ""}` : ""} · ${dto.feed.events} event${dto.feed.events === 1 ? "" : "s"}`
      : dto.feed.state === "unavailable"
        ? [tried ? `tried ${tried}` : "", ago ? `last read ${ago}` : ""].filter(Boolean).join(" · ")
        : "";
  // The bookings that arrived by email (00345): said whole once, for the board's card, Settings' row and Ask alike.
  const notices = noticesVM(dto.feed.notices, now);
  // The whole sentence, for whoever reads the line without the pill: Ask's calendar.week.
  const feedLine = feedLineOf(dto.feed.state, feedDetail, notices.line);
  const feedRead = feedReadWords(dto.feed.state, ago);
  const feedHealth: CalendarFeedHealth = dto.feed.state === "ok" ? (stale ? "stale" : "ok") : dto.feed.state;
  const source = sourceOfWeek(dto, feedHealth, !!notices.forwarding);

  const nowIn = days.some((d) => d.today) ? hoursOf(tz, nowMs) : null;
  const last = dto.days[dto.days.length - 1]?.key ?? dto.from;
  const sameMonth = dto.from.slice(0, 7) === last.slice(0, 7);
  const ahead = closuresFrom(dto.closures, todayKey);
  const closuresAhead: CalendarClosureVM[] = ahead
    .slice(0, 6)
    .map((c) => ({ key: c.date, label: closureDatesLabel(c), note: c.note ?? null }));
  const services = servicesOf(dto);
  return {
    timezone: tz,
    zoneCity: timezoneCity(tz),
    hoursSet,
    from: dto.from,
    to: last,
    rangeLabel: `${shortDate(dto.from)} – ${sameMonth ? shortDate(last).replace(/^[A-Za-z]+ /, "") : shortDate(last)}`,
    monthLabel: monthLabelOf(dto.days.length >= 28 ? shiftKey(dto.from, 7) : dto.from),
    hours: { start, end },
    days,
    today: todayKey,
    now: nowIn,
    feed: {
      present: dto.feed.present,
      state: dto.feed.state,
      health: feedHealth,
      line: feedLine,
      detail: feedDetail,
      read: feedRead,
      events: dto.feed.events,
      source: dto.feed.source ?? "your calendar",
      problem: dto.feed.problem ?? null,
      stale,
      skippedRecurring: dto.feed.skipped_recurring || 0,
      dropped: dto.feed.dropped || 0,
      notes: feedNotes(dto.feed),
      notices,
    },
    source,
    stats: { events, windows: windowCount, next },
    offer: { days: offerDays, until: offerUntil, label: shortDate(offerUntil) },
    rules: rulesLine(dto.rules),
    ruleParts: ruleParts(dto.rules),
    hoursLines: hoursLines(dto.hours),
    closuresAhead,
    // Past the six the bar names, counted: a seventh closure used to vanish without a word (C1).
    closuresMore: Math.max(0, ahead.length - closuresAhead.length),
    consultFirst: (dto.rules?.consult_first ?? []).map((s) => s.trim()).filter(Boolean),
    services,
    bookingLink: dto.booking_link,
  };
}
