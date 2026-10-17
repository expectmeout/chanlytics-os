import { timezoneCity } from "../shared/time.js";
import { replyReachOf } from "../people/person-reach.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { BOOKING_DEFAULTS, closedOn, dayIntervals, hasHours } from "./availability.js";
import { clockInZone, dayInZone, dayPlusInZone } from "./zone-math.js";
import { offerFor } from "./service-offer.js";
import { visitTitleWithout } from "./visit/visit-service.js";
import { DAY_SHORT, DOW, keyParts, monthLabelOf, shiftKey, zoneMidnight } from "./day-keys.js";
import { bookingToolName, NOTICE_HOLD_WORDS } from "./booking-notice.js";
import {
  CALENDAR_OWED_WORD,
  bookingEmailsStep,
  calendarSourceOf,
  forwardStillAsked
} from "../setup/calendar-source.js";
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
  spanLabel
} from "./calendar-words.js";
function hoursOf(tz, ms) {
  const c = clockInZone(tz, ms);
  return c.hh + c.mm / 60;
}
function nextOpenWords(startIso, tz, todayKey) {
  const ms = startIso ? Date.parse(startIso) : Number.NaN;
  if (!Number.isFinite(ms)) return "\u2014";
  const day = dayInZone(tz, ms);
  const clock = clockLabel(hoursOf(tz, ms));
  if (day.key === todayKey) return `today ${clock}`;
  if (day.key === shiftKey(todayKey, 1)) return `tomorrow ${clock}`;
  if (day.key <= shiftKey(todayKey, 6)) return `${DAY_SHORT[day.weekday] ?? day.weekday} ${clock}`;
  return `${shortDate(day.key)}, ${clock}`;
}
function noticeFacts(item) {
  if (item.source !== "notice") return { tool: null, staff: null, price: null };
  return { tool: item.tool ?? null, staff: item.staff ?? null, price: item.price ?? null };
}
function serviceWordsOf(item) {
  if (item.source === "notice" && item.service) return item.service;
  return visitTitleWithout(item.title || "Busy", [item.person?.name]);
}
function feedLineOf(state, feedDetail, noticesLine) {
  if (state === "ok") return feedDetail;
  if (state === "unavailable") return `Your calendar could not be read${feedDetail ? ` \xB7 ${feedDetail}` : ""}`;
  return noticesLine || "No calendar connected";
}
function noticesVM(n, now) {
  const tool = n?.tool ? bookingToolName(n.tool) : null;
  const lastAgo = readAgoLabel(n?.last_at ?? null, now);
  const held = n?.held ?? 0;
  const line = n?.last_at ? `Bookings arrive by email from ${tool ?? "your booking tool"} \xB7 last ${lastAgo ?? "just now"}${held ? ` \xB7 ${held} to look at` : ""}` : "";
  const state = n?.last_at ? "working" : n?.tool ? "waiting" : "none";
  const heldList = (n?.held_list ?? []).map((h) => ({
    id: h.id,
    noticeId: h.notice_id ?? null,
    tool: bookingToolName(h.tool),
    from: h.from,
    subject: h.subject,
    receivedAgo: readAgoLabel(h.received_at, now),
    reason: NOTICE_HOLD_WORDS[h.reason]
  }));
  const forwarding = n?.forwarding && forwardStillAsked(n.forwarding.at, now) ? { account: n.forwarding.account, code: n.forwarding.code, link: n.forwarding.link } : null;
  const address = n?.address ?? null;
  const row = state === "none" ? null : noticeRowOf(emailsFactsOf(n, !!forwarding), lastAgo);
  const suggested = address ? null : n?.suggested ?? null;
  return { tool, address, suggested, lastAgo, count: n?.count ?? 0, held, line, state, heldList, forwarding, row };
}
const emailsFactsOf = (n, forwarding) => ({
  address: !!n?.address,
  forwarding,
  lastAt: n?.last_at ?? null,
  held: n?.held ?? 0
});
function noticeRowOf(e, lastAgo) {
  const needsYou = (words) => ({ tone: "warn", label: CALENDAR_OWED_WORD, words });
  const last = `Last booking email ${lastAgo ?? "just now"}`;
  const step = bookingEmailsStep(e);
  if (step === "address") return needsYou("Needs a workspace email address");
  if (step === "forwarding") return needsYou("Confirm the forward in Gmail");
  if (step === "held")
    return needsYou(
      e.lastAt ? `${last} \xB7 ${e.held} to look at` : `${e.held} booking ${e.held === 1 ? "email" : "emails"} to look at`
    );
  if (step === "waiting") return { tone: "plain", label: "Waiting", words: "Waiting for the first booking email" };
  return { tone: "ok", label: "Working", words: last };
}
const feedReadWords = (state, ago) => state === "ok" ? `read ${ago ?? "just now"}` : state === "unavailable" && ago ? `last read ${ago}` : "";
const sourceOfWeek = (dto, link, forwarding) => calendarSourceOf({
  link,
  problem: dto.feed.problem ?? null,
  tool: dto.feed.notices?.tool ?? null,
  byHand: !!dto.feed.by_hand,
  emails: dto.feed.notices ? emailsFactsOf(dto.feed.notices, forwarding) : null,
  bookingLink: !!dto.booking_link
});
function toBlock(item, tz, dayStartMs, dayEndMs, now) {
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
    person: item.person ? {
      id: item.person.id,
      name: item.person.name,
      via: item.person.via ?? null,
      threadId: item.person.thread ? `th-${item.person.thread}` : null,
      bookingLinkAction: replyReachOf(
        {
          // A read that carries no reach (a server that predates it: either deploy order works) is read as it was
          // before: a person with a thread is reached on WhatsApp, held by its window.
          wire: item.person.reply_wire !== void 0 ? item.person.reply_wire : item.person.thread ? "whatsapp" : null,
          waInboundAt: item.person.wa_inbound_at,
          emailStopped: !!item.person.email_stopped,
          optedOut: !!item.person.opted_out,
          who: item.person.name
        },
        now
      ).bookingLinkAction,
      stopped: !!item.person.opted_out,
      facts: item.person.facts ?? null
    } : null,
    description: item.description ?? null,
    location: item.location ?? null,
    contacts: {
      phones: (item.contacts?.phones ?? []).map((p) => formatPhoneDisplay(p) ?? p),
      e164: item.contacts?.phones ?? [],
      emails: item.contacts?.emails ?? []
    },
    guess: item.guess ?? null,
    series: !!item.series,
    consultation: !!item.consultation,
    consultService: item.consultation ? item.consult_service ?? null : null,
    ...noticeFacts(item),
    start: item.start,
    end: item.end,
    visit: item.visit ?? null,
    ...item.request ? { request: { threadId: item.request.thread_id, open: item.request.open } } : {},
    ...item.origin ? { origin: item.origin } : {},
    lane: 0,
    lanes: 1
  };
}
function assignLanes(timed) {
  let cluster = [];
  let clusterEnd = -1;
  let laneEnds = [];
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
function servicesOf(dto) {
  const all = dto.services ?? [];
  const listed = all.map((s) => ({ name: s.name, duration_min: s.duration_min ?? void 0 }));
  return all.map((s) => ({
    name: s.name,
    duration: s.duration_min,
    consultFirst: s.consult_first,
    offerMinutes: offerFor(listed, dto.rules, s.name)?.minMinutes ?? null,
    label: `${s.name}${s.duration_min ? ` \xB7 ${s.duration_min} min` : ""}${s.consult_first ? " \xB7 consultation first" : ""}`
  }));
}
function closedDayOf(closures, key, hoursSet, intervals) {
  if (closedOn(closures, key)) return true;
  return hoursSet && intervals.length === 0;
}
function dayBandsOf(p) {
  const { start, end } = p;
  if (p.closedDay) return [{ from: start, to: end, label: p.note ? `Closed \xB7 ${p.note}` : "Closed" }];
  if (!p.hoursSet) return [];
  const bands = [];
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
export function toCalendarVM(dto, now = /* @__PURE__ */ new Date()) {
  const tz = dto.timezone;
  const todayKey = dayInZone(tz, now.getTime()).key;
  const nowMs = now.getTime();
  const offerDays = { ...BOOKING_DEFAULTS, ...dto.rules ?? {} }.max_days_ahead;
  const offerUntil = dayPlusInZone(tz, nowMs, offerDays - 1).key;
  const hoursSet = hasHours(dto.hours ?? void 0);
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
  for (const d of dto.days) {
    const ds = zoneMidnight(tz, d.key);
    const de = zoneMidnight(tz, shiftKey(d.key, 1));
    for (const item of d.items) {
      const s = Date.parse(item.start);
      const e = Date.parse(item.end);
      if (item.all_day || !(e > ds && s < de) || s <= ds && e >= de) continue;
      const b = toBlock(item, tz, ds, de, now);
      start = Math.min(start, Math.max(0, Math.floor(b.t)));
      end = Math.max(end, Math.min(24, Math.ceil(b.t + b.dur / 60)));
    }
  }
  const days = dto.days.map((d) => {
    const { y, m, d: dd } = keyParts(d.key);
    const weekday = DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()].toLowerCase();
    const closure = dto.closures.find((c) => c.date <= d.key && d.key <= (c.until && c.until >= c.date ? c.until : c.date)) ?? null;
    const intervals = dayIntervals(dto.hours?.[weekday]);
    const closedDay = closedDayOf(dto.closures, d.key, hoursSet, intervals);
    const bands = dayBandsOf({ closedDay, hoursSet, intervals, note: closure?.note ?? null, start, end });
    const zoneDayStart = zoneMidnight(tz, d.key);
    const zoneDayEnd = zoneMidnight(tz, shiftKey(d.key, 1));
    const timed = [];
    const allDay = [];
    for (const item of d.items) {
      const s = Date.parse(item.start);
      const e = Date.parse(item.end);
      if (!(e > zoneDayStart && s < zoneDayEnd)) continue;
      const block = toBlock(item, tz, zoneDayStart, zoneDayEnd, now);
      if (item.all_day || s <= zoneDayStart && e >= zoneDayEnd)
        allDay.push({ ...block, t: 0, dur: 24 * 60, time: "All day" });
      else timed.push(block);
    }
    timed.sort((a, b) => a.t - b.t || b.dur - a.dur);
    assignLanes(timed);
    const windows = d.windows.map((w) => {
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
      beyondOffer: d.key > offerUntil
    };
  });
  const events = days.reduce((a, d) => a + d.blocks.length + d.allDay.length, 0);
  const windowCount = days.reduce((a, d) => a + d.windows.length, 0);
  const next = dto.feed.state === "ok" ? nextOpenWords(dto.next_opening?.start ?? null, tz, todayKey) : "\u2014";
  const ago = readAgoLabel(dto.feed.read_at, now);
  const stale = dto.feed.state === "ok" && !!dto.feed.stale;
  const tried = readAgoLabel(dto.feed.checked_at ?? null, now);
  const feedDetail = dto.feed.state === "ok" ? `From ${dto.feed.source ?? "your calendar"} \xB7 read ${ago ?? "just now"}${stale ? ` \xB7 could not be refreshed${tried ? ` ${tried}` : ""}` : ""} \xB7 ${dto.feed.events} event${dto.feed.events === 1 ? "" : "s"}` : dto.feed.state === "unavailable" ? [tried ? `tried ${tried}` : "", ago ? `last read ${ago}` : ""].filter(Boolean).join(" \xB7 ") : "";
  const notices = noticesVM(dto.feed.notices, now);
  const feedLine = feedLineOf(dto.feed.state, feedDetail, notices.line);
  const feedRead = feedReadWords(dto.feed.state, ago);
  const feedHealth = dto.feed.state === "ok" ? stale ? "stale" : "ok" : dto.feed.state;
  const source = sourceOfWeek(dto, feedHealth, !!notices.forwarding);
  const nowIn = days.some((d) => d.today) ? hoursOf(tz, nowMs) : null;
  const last = dto.days[dto.days.length - 1]?.key ?? dto.from;
  const sameMonth = dto.from.slice(0, 7) === last.slice(0, 7);
  const ahead = closuresFrom(dto.closures, todayKey);
  const closuresAhead = ahead.slice(0, 6).map((c) => ({ key: c.date, label: closureDatesLabel(c), note: c.note ?? null }));
  const services = servicesOf(dto);
  return {
    timezone: tz,
    zoneCity: timezoneCity(tz),
    hoursSet,
    from: dto.from,
    to: last,
    rangeLabel: `${shortDate(dto.from)} \u2013 ${sameMonth ? shortDate(last).replace(/^[A-Za-z]+ /, "") : shortDate(last)}`,
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
      notices
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
    bookingLink: dto.booking_link
  };
}
