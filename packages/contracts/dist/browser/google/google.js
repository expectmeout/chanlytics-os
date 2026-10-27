import { clockDate, zoneDayKey } from "../shared/clock.js";
import { agoWords, isoMs, WEEK_MS, HOUR_MS, DAY_MS } from "../shared/time.js";
import { plural, reviewsPhrase } from "../shared/words.js";
import { heldReviewReplyOf, reviewReplyWords } from "./review-reply.js";
import { reviewRoute } from "../reports/lenses.js";
import { dayPointOf, fmtDay, rangeLabelOf, withinWords } from "../reports/reports.js";
import { beforeWords, compareWords } from "../reports/report-tiles.js";
import { DAYS, dayProblems } from "../config/workspace-config/config-rules.js";
import { shiftKey } from "../calendar/day-keys.js";
import { WEEKDAY_KEYS } from "../calendar/zone-math.js";
import { normalizePhone } from "../shared/phone.js";
import { bookingPageOf } from "./booking-page.js";
const pointOf = (v) => {
  const p = v !== null && typeof v === "object" ? v : null;
  return p && typeof p.day === "number" && typeof p.hour === "number" && typeof p.minute === "number" ? { day: p.day, hour: p.hour, minute: p.minute } : null;
};
export function listingFactsOf(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw;
  if (!Object.keys(r).length) return null;
  const text = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
  const hours = Array.isArray(r.hours) ? r.hours.flatMap((p) => {
    const q = p !== null && typeof p === "object" ? p : null;
    const open = q ? pointOf(q.open) : null;
    if (!q || !open) return [];
    if (q.close == null) return [{ open, close: null }];
    const close = pointOf(q.close);
    return close ? [{ open, close }] : [];
  }) : null;
  return {
    hours,
    phone_e164: text(r.phone_e164),
    phone_display: text(r.phone_display),
    website: text(r.website),
    primary_type: text(r.primary_type),
    primary_type_label: text(r.primary_type_label),
    service_area_only: r.service_area_only === true,
    time_zone: text(r.time_zone),
    booking_page: bookingPageOf(text(r.booking_page))
  };
}
export function bookingPageKept(prev, website) {
  return prev && prev.website === website ? prev.booking_page ?? null : null;
}
export function bookingPageOffered(found, holdsLink) {
  return holdsLink ? null : found ?? null;
}
const hhmm = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
export function hoursFromGoogle(periods) {
  if ((periods ?? []).some((p) => !p.close)) return { hours: {}, unsure: [...DAYS] };
  const shifts = /* @__PURE__ */ new Map();
  const unsure = /* @__PURE__ */ new Set();
  for (const p of periods ?? []) {
    const day = WEEKDAY_KEYS[p.open.day];
    if (!day) continue;
    if (!p.close || p.close.day !== p.open.day) {
      unsure.add(day);
      continue;
    }
    const shift = { open: hhmm(p.open.hour, p.open.minute), close: hhmm(p.close.hour, p.close.minute) };
    shifts.set(day, [...shifts.get(day) ?? [], shift]);
  }
  const hours = {};
  for (const day of DAYS) {
    const list = (shifts.get(day) ?? []).sort((a, b) => a.open.localeCompare(b.open));
    if (unsure.has(day) || !list.length) continue;
    const made = list.length === 1 ? { open: list[0].open, close: list[0].close } : { intervals: list };
    if (dayProblems(made, day).length) unsure.add(day);
    else hours[day] = made;
  }
  return { hours, unsure: DAYS.filter((d) => unsure.has(d)) };
}
export function placesQueryOf(words) {
  const w = words.replace(/\s+/g, " ").trim();
  return /^[\d\s().+-]+$/.test(w) ? normalizePhone(w) ?? w : w;
}
export const GOOGLE_SHOWN_REVIEWS = 5;
export const NEW_REVIEW_NEWS = "New on Google:";
export const REVIEW_NEWS_MS = 36 * HOUR_MS;
export const REVIEW_NEWS_MAX_AGE_MS = 14 * DAY_MS;
const BOOTSTRAP_MS = HOUR_MS;
export function ratingWords(rating) {
  return typeof rating === "number" && Number.isFinite(rating) ? `${rating.toFixed(1)} \u2605` : "no rating yet";
}
export function starsOf(rating) {
  const n = typeof rating === "number" && Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
  return "\u2605".repeat(n) + "\u2606".repeat(5 - n);
}
export function reviewsWords(count) {
  return typeof count === "number" ? reviewsPhrase(count) : "reviews not counted yet";
}
export function listingLine(l) {
  if (!l.review_count) return `${l.name} \xB7 no reviews on Google yet`;
  return `${l.name} \xB7 ${ratingWords(l.rating)} \xB7 ${reviewsWords(l.review_count)} on Google`;
}
export function checkedWords(l, nowMs) {
  if (l.check_error && l.checked_at)
    return `Google could not be read since ${agoWords(Date.parse(l.checked_at), nowMs)} \u2014 read again once a day`;
  if (l.check_error) return "Google could not be read yet \u2014 read again once a day";
  if (l.checked_at) return `Checked ${agoWords(Date.parse(l.checked_at), nowMs)}`;
  return "Not read yet";
}
export function connectionWords(c, nowMs) {
  const who = c.google_email ? `Connected as ${c.google_email}` : "Connected";
  if (!c.location_name) return `${who} \xB7 choose the location to finish`;
  if (c.sync_error && c.last_synced_at)
    return `${who} \xB7 could not sync since ${agoWords(Date.parse(c.last_synced_at), nowMs)} \u2014 read again once a day`;
  if (c.sync_error) return `${who} \xB7 could not sync yet \u2014 read again once a day`;
  if (c.last_synced_at) return `${who} \xB7 synced ${agoWords(Date.parse(c.last_synced_at), nowMs)}`;
  return `${who} \xB7 not synced yet`;
}
export function reviewsFromProfile(c) {
  return !!c && !!c.location_name && !!c.last_synced_at;
}
export function reviewSnippet(body, max = 90) {
  const t = (body ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}\u2026` : t;
}
export function reviewNoticeIsAbout(about, review) {
  return !!about && about.type === "review" && (about.id === review.id || about.id === review.reviewId);
}
function ratingCompareWords(rating, before, rangeLabel) {
  const now = Math.round(rating * 10);
  const was = Math.round(before * 10);
  if (now === was) return `same as ${beforeWords(rangeLabel)}`;
  return `${now > was ? "up" : "down"} from ${(was / 10).toFixed(1)}`;
}
function whenWords(iso, tz, nowMs) {
  const at = isoMs(iso);
  if (at === null) return "";
  return agoWords(at, nowMs, { dateAfterMs: WEEK_MS, date: (ms) => clockDate(ms, tz, nowMs) });
}
export function reviewIsNew(r, linkedAt, nowMs) {
  const seen = isoMs(r.first_seen_at);
  if (seen === null || nowMs - seen > REVIEW_NEWS_MS) return false;
  const linked = isoMs(linkedAt);
  if (linked !== null && seen - linked < BOOTSTRAP_MS) return false;
  const written = isoMs(r.published_at);
  return written !== null && nowMs - written <= REVIEW_NEWS_MAX_AGE_MS;
}
export function toGoogleReviewVM(r, linkedAt, tz, nowMs) {
  return {
    id: r.id,
    reviewId: r.review_id,
    stars: starsOf(r.rating),
    rating: r.rating,
    author: r.author?.trim() || "A customer",
    when: whenWords(r.published_at, tz, nowMs),
    text: (r.body ?? "").replace(/\s+/g, " ").trim(),
    replied: !!r.reply_text,
    replyText: (r.reply_text ?? "").replace(/\s+/g, " ").trim(),
    heldReply: heldReviewReplyOf(r, tz),
    mapsUri: r.maps_uri,
    isNew: reviewIsNew(r, linkedAt, nowMs),
    fromProfile: r.origin === "profile"
  };
}
export function googleReviewsTable(rows) {
  return {
    columns: ["Reviewer", "Stars", "Written", "Words"],
    rows: rows.map((r) => [r.author, r.rating ?? "\u2014", r.when || "\u2014", r.text || "\u2014"])
  };
}
const NEEDS_SECOND_READING = "needs a second day of reading";
const noGainYet = () => ({
  value: "\u2014",
  meta: NEEDS_SECOND_READING,
  head: `what changed ${NEEDS_SECOND_READING}`
});
const noGained = () => ({ points: [], max: 0, total: null, sinceLabel: null });
function gainedScope(g, days, last, behind) {
  if (g.sinceLabel) return `since ${g.sinceLabel}`;
  if (!behind) return withinWords(days, null);
  return days === 1 ? `on ${fmtDay(last)}` : `in the ${rangeLabelOf(days)} to ${fmtDay(last)}`;
}
function gainedWords(g, days, today, until) {
  const { total, sinceLabel } = g;
  if (total === null) return noGainYet();
  const last = g.points.at(-1)?.day ?? today;
  const behind = until !== null || last < shiftKey(today, -1);
  const scope = gainedScope(g, days, last, behind);
  const head = total < 0 ? `down ${plural(-total, "rating")} ${scope}` : `${total ? `${plural(total, "rating")} gained` : "none gained"} ${scope}`;
  const meta = sinceLabel ? `since ${sinceLabel}, the first day on record` : total < 0 ? "Google's count fell" : `new ratings${behind ? ` to ${fmtDay(last)}` : ""}, words or not`;
  return { value: total < 0 ? `down ${-total}` : String(total), meta, head };
}
export function gainedOver(days, periodDays) {
  const sorted = [...days].sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
  if (sorted.length < 2) return { current: noGained(), previous: null };
  const last = sorted[sorted.length - 1];
  const since = shiftKey(last.day, -(periodDays - 1));
  const before = sorted.filter((d) => d.day < since);
  const inside = sorted.filter((d) => d.day >= since);
  const baseline = before.length ? before[before.length - 1] : inside[0];
  const total = last.review_count - baseline.review_count;
  const sinceLabel = before.length ? null : fmtDay(baseline.day);
  const byDay = new Map(sorted.map((d) => [d.day, d.review_count]));
  const points = [];
  let prev = before.length ? baseline.review_count : null;
  for (let day = since; day <= last.day; day = shiftKey(day, 1)) {
    const count = byDay.get(day);
    const gained = count !== void 0 && prev !== null ? Math.max(0, count - prev) : 0;
    if (count !== void 0) prev = count;
    points.push({ ...dayPointOf(day), gained });
  }
  const max = Math.max(0, ...points.map((p) => p.gained));
  const prevSince = shiftKey(since, -periodDays);
  const prevBefore = sorted.filter((d) => d.day < prevSince);
  const prevInside = sorted.filter((d) => d.day >= prevSince && d.day < since);
  const previous = prevBefore.length && prevInside.length ? prevInside[prevInside.length - 1].review_count - prevBefore[prevBefore.length - 1].review_count : null;
  return { current: { points, max, total: before.length || inside.length >= 2 ? total : null, sinceLabel }, previous };
}
export function toGoogleVM(dto, period, nowMs, tz) {
  const { days: periodDays, until } = period;
  const l = dto.listing;
  const c = dto.connection ?? null;
  const connection = c ? {
    email: c.google_email,
    location: c.location_title,
    words: connectionWords(c, nowMs),
    pending: !c.location_name,
    trouble: !!c.sync_error
  } : null;
  const canReply = !!c && !!c.location_name;
  const reply = { mode: dto.reply_mode, words: reviewReplyWords(dto.reply_mode, canReply) };
  if (!l)
    return {
      listing: null,
      connection,
      canReply,
      reply,
      tiles: [],
      gained: { ...noGained(), words: noGainYet() },
      latest: [],
      source: "",
      table: googleReviewsTable([]),
      todayLine: null
    };
  const latest = [...dto.reviews].sort((a, b) => (isoMs(b.published_at) ?? 0) - (isoMs(a.published_at) ?? 0)).map((r) => toGoogleReviewVM(r, l.linked_at, tz, nowMs));
  const source = reviewsFromProfile(c) ? "every review, from your Business Profile" : `the ${latest.length === 1 ? "one" : latest.length} Google shows first`;
  const days = dto.days.filter((d) => until === null || d.day <= until).sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
  const { current, previous } = gainedOver(days, periodDays);
  const gained = {
    ...current,
    words: gainedWords(current, periodDays, zoneDayKey(nowMs, tz), until)
  };
  const noun = plural(periodDays, "day");
  const inPeriod = days.length ? days.filter((d) => d.day >= shiftKey(days[days.length - 1].day, -(periodDays - 1))) : [];
  const ratingSpark = inPeriod.flatMap((d) => d.rating === null ? [] : [d.rating]);
  const countSpark = inPeriod.map((d) => d.review_count);
  const baselineRating = (() => {
    if (!days.length) return null;
    const since = shiftKey(days[days.length - 1].day, -(periodDays - 1));
    const before = days.filter((d) => d.day < since);
    return before.length ? before[before.length - 1].rating : null;
  })();
  const rangeLabel = rangeLabelOf(periodDays);
  const ratingCompare = typeof l.rating === "number" && typeof baselineRating === "number" ? ratingCompareWords(l.rating, baselineRating, rangeLabel) : null;
  const newest = latest[0] ?? null;
  const checked = checkedWords(l, nowMs);
  const tiles = [
    {
      id: "rating",
      metric: "rating",
      label: "Rating on Google",
      value: typeof l.rating === "number" ? l.rating.toFixed(1) : "\u2014",
      meta: `${reviewsWords(l.review_count)} \xB7 ${checked.toLowerCase()}`,
      delta: null,
      spark: ratingSpark,
      compare: ratingCompare
    },
    {
      id: "reviews",
      metric: "reviews",
      label: "Reviews on Google",
      value: typeof l.review_count === "number" ? String(l.review_count) : "\u2014",
      meta: "as Google counts them, with or without words",
      delta: null,
      spark: countSpark,
      compare: null
    },
    {
      id: "gained",
      metric: "ratings_gained",
      label: `Gained in ${noun}`,
      value: gained.words.value,
      meta: gained.words.meta,
      delta: null,
      spark: gained.points.map((p) => p.gained),
      // A count that fell in the period before is no figure to measure against ("up from -2").
      compare: gained.total !== null && previous !== null && previous >= 0 ? compareWords(gained.total, previous, rangeLabel, true) : null
    },
    {
      id: "newest",
      metric: "newest_review",
      label: "Newest review",
      value: newest?.when || "\u2014",
      meta: newest ? `${newest.stars} \xB7 ${newest.author}` : canReply ? "no review yet" : "none of the five Google shows has a date",
      delta: null,
      spark: [],
      compare: null
    }
  ];
  const news = latest.find((r) => r.isNew && !r.replied) ?? null;
  const todayLine = news ? {
    text: `${NEW_REVIEW_NEWS} ${news.stars} from ${news.author}${news.text ? ` \u2014 \u201C${reviewSnippet(news.text)}\u201D` : ""}`,
    to: reviewRoute(news.id),
    review: { id: news.id, reviewId: news.reviewId }
  } : null;
  return {
    listing: {
      name: l.name,
      address: l.address,
      ratingLabel: ratingWords(l.rating),
      count: l.review_count,
      checked,
      mapsUri: l.maps_uri,
      trouble: !!l.check_error
    },
    connection,
    canReply,
    reply,
    tiles,
    gained,
    latest,
    source,
    table: googleReviewsTable(latest),
    todayLine
  };
}
