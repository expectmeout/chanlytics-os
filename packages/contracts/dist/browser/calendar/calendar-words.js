import { agoWords } from "../shared/time.js";
import { DAYS } from "../config/workspace-config/config-rules.js";
import { hoursRuns } from "../config/workspace-config/prompt-hours.js";
import { BOOKING_DEFAULTS, dayIntervals } from "./availability.js";
import { DAY_SHORT, keyParts } from "./day-keys.js";
import { isGuess, matchWordsOf } from "./calendar-people.js";
export const VISIT_WORDS = { kept: "Kept", missed: "Missed", cancelled: "Cancelled" };
export const VISIT_REFUSALS = {
  never_booked: "It was only requested, never booked: it can be cancelled, but not kept or missed.",
  cancelled: "It was cancelled already.",
  not_begun: "It hasn't begun yet: whether they came is said once it has.",
  already_said: "It's marked kept or missed already: say the other if that was wrong.",
  over: "It has ended: say whether they came instead."
};
export function visitStands(visit) {
  return visit?.status !== "cancelled";
}
export function sightingStands(row) {
  return visitStands(row) && !row.vanished_at;
}
const VISIT_PAST_WORD = "Past";
const VISIT_REQUESTED_WORD = "Requested";
const VISIT_PILL_TONES = {
  kept: "ok",
  missed: "warn",
  cancelled: "plain",
  past: "plain",
  requested: "plain"
};
export function visitStateOf(visit, endMs, nowMs) {
  const said = visit?.status;
  if (said === "kept" || said === "missed" || said === "cancelled")
    return { text: VISIT_WORDS[said], tone: said, pill: VISIT_PILL_TONES[said] };
  if (said === "proposed") return { text: VISIT_REQUESTED_WORD, tone: "requested", pill: VISIT_PILL_TONES.requested };
  return endMs <= nowMs ? { text: VISIT_PAST_WORD, tone: "past", pill: VISIT_PILL_TONES.past } : null;
}
export function visitActsOf(visit, startMs, endMs, nowMs) {
  if (!visit) return [];
  switch (visit.status) {
    // A correction is a word about a visit that has begun, as the door holds it (not_begun).
    case "kept":
      return startMs <= nowMs ? ["missed"] : [];
    case "missed":
      return startMs <= nowMs ? ["kept"] : [];
    case "cancelled":
      return [];
    case "proposed":
      return endMs > nowMs ? ["cancelled"] : [];
    case "booked": {
      const out = startMs <= nowMs ? ["kept", "missed"] : [];
      if (endMs > nowMs) out.push("cancelled");
      return out;
    }
  }
}
export const VISIT_ASK_WORDS = {
  /** The question over the presses: Today's row, the person's History and Coming up. */
  question: "Did they come?",
  /** What a visit that has ended and nobody has marked is, said where "Past" alone would leave the owner guessing. */
  unmarked: "Not marked yet",
  gate: "say whether they came",
  /** The confirm before a cancel, under the workspace's own question (appointmentWords cancelAsk). */
  cancel: {
    detail: "It can't be undone here. Its reminders stop; the calendar keeps the time until it is changed there.",
    yes: "Yes, cancelled",
    no: "Keep it"
  }
};
export function visitLineOf(v, nowMs) {
  const someone = v.someone ?? !!v.person;
  const acts = someone ? visitActsOf(v.mark, v.startMs, v.endMs, nowMs) : [];
  const standing = someone && v.mark?.status === "booked";
  const said = visitStateOf(v.mark, v.endMs, nowMs);
  return {
    id: v.id,
    mark: v.mark,
    title: v.title,
    day: v.day,
    time: v.time,
    person: v.person,
    // A word a member said stands; "Past" is said only of someone's visit, which waits for that word.
    state: said && said.tone === "past" && !someone ? null : said,
    unmarked: standing && v.endMs <= nowMs,
    match: matchWordsOf(v.via),
    guess: isGuess(v.via),
    acts,
    asks: standing ? acts.filter((a) => a !== "cancelled") : [],
    to: v.to ?? null
  };
}
export function visitLineOfBlock(b, nowMs, day = "", to = null) {
  return visitLineOf(
    {
      id: b.visit ? b.visit.id : b.id,
      mark: b.visit,
      startMs: Date.parse(b.start),
      endMs: Date.parse(b.end),
      title: b.title,
      day,
      time: b.time,
      person: b.person ? { id: b.person.id, name: b.person.name } : null,
      via: b.person?.via ?? null,
      to,
      someone: !!b.person || !!b.contacts?.e164.length || !!b.contacts?.emails.length
    },
    nowMs
  );
}
export function visitMarkOfDto(v) {
  if (v.said) return { id: v.record_id ?? "", status: v.said };
  return v.record_id ? { id: v.record_id, status: "booked" } : null;
}
export const ADD_TO_PEOPLE_WORDS = {
  /** The press, and the role gate's "to ...". */
  act: "Add to People",
  gate: "add this person to People",
  busy: "Adding\u2026",
  /** Said once the door answered: made now, or already there (a person is never made twice). */
  added: (name) => name ? `${name} is in People now` : "In People now",
  existed: (name) => name ? `${name} was in People already` : "They were in People already"
};
export function addToPeopleOf(b) {
  if (b.person || !b.contacts) return null;
  const { e164, emails } = b.contacts;
  const email = emails.length === 1 ? emails.at(0) ?? null : null;
  if (e164.length === 1) return { phone: e164.at(0) ?? null, email, name: b.guess };
  if (e164.length === 0 && email) return { phone: null, email, name: b.guess };
  return null;
}
export function clockLabel(t) {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  const ap = h >= 12 && h < 24 ? "PM" : "AM";
  const hh = (h + 11) % 12 + 1;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""} ${ap}`;
}
const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const LONG = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
export function shortDate(key) {
  const { y, m, d } = keyParts(key);
  return SHORT.format(new Date(Date.UTC(y, m - 1, d, 12)));
}
export function longDate(key) {
  const { y, m, d } = keyParts(key);
  return LONG.format(new Date(Date.UTC(y, m - 1, d, 12)));
}
export function closureDatesLabel(c) {
  if (!(c.until && c.until > c.date)) return shortDate(c.date);
  return `${shortDate(c.date)} \u2013 ${c.until.slice(0, 7) === c.date.slice(0, 7) ? c.until.slice(8).replace(/^0/, "") : shortDate(c.until)}`;
}
export function closuresFrom(closures, todayKey) {
  return closures.filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= todayKey).sort((a, b) => a.date.localeCompare(b.date));
}
export function readAgoLabel(iso, now) {
  if (!iso) return null;
  return agoWords(Date.parse(iso), now.getTime(), { dateAfterMs: Number.POSITIVE_INFINITY });
}
export function ruleParts(rules) {
  const r = { ...BOOKING_DEFAULTS, ...rules ?? {} };
  const parts = [`at least ${r.lead_hours}h notice`];
  if (r.buffer_min > 0) parts.push(`${r.buffer_min} min between bookings`);
  parts.push(`up to ${r.max_days_ahead} days ahead`, `${r.slot_min}-min slots`);
  if (rules?.party_max)
    parts.push(`up to ${rules.party_max} ${rules.party_max === 1 ? "person" : "people"} per booking`);
  return parts;
}
export function rulesLine(rules) {
  return `Offers times with ${ruleParts(rules).join(" \xB7 ")}`;
}
export function feedNotes(feed) {
  if (feed.state !== "ok") return [];
  const notes = [];
  const repeats = feed.skipped_recurring || 0;
  if (repeats > 0) {
    const one = repeats === 1;
    notes.push({
      id: "repeats",
      title: `${repeats} repeating event${one ? " counts" : "s count"} only once.`,
      body: `${one ? "It repeats" : "They repeat"} in a pattern the receptionist can't follow, like the second Tuesday of each month, so only the first date is treated as taken, and a caller could be offered a time on a later one. Repeating daily, weekly on set days, or monthly on one date fixes it.`
    });
  }
  const undrawn = feed.dropped || 0;
  if (undrawn > 0) {
    const one = undrawn === 1;
    notes.push({
      id: "undrawn",
      title: `${undrawn} more event${one ? " isn't" : "s aren't"} drawn.`,
      body: `${one ? "It falls" : "They fall"} on a day holding more events than the board draws; the receptionist still treats ${one ? "its time" : "their times"} as taken.`
    });
  }
  return notes;
}
export function hoursLines(hours) {
  if (!hours) return [];
  const clean = {};
  for (const d of DAYS) if (hours[d]) clean[d] = hours[d];
  return hoursRuns(clean).map(
    (r) => `${DAY_SHORT[r.from] ?? r.from}${r.to !== r.from ? `\u2013${DAY_SHORT[r.to] ?? r.to}` : ""} ${dayHoursWords(clean[r.from])}`
  );
}
function dayHoursWords(h) {
  const at = (s) => Number(s.split(":")[0]) + Number(s.split(":")[1]) / 60;
  const parts = dayIntervals(h).map(([o, c]) => spanLabel(at(o), at(c)));
  if (!parts.length) return h?.open || h?.close || h?.intervals?.length ? "hours incomplete" : "closed";
  return parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
export const CALENDAR_FEED_WORDS = {
  ok: "Readable",
  stale: "Last good read",
  unavailable: "Could not be read",
  none: "Not connected"
};
export function spanLabel(t1, t2) {
  const a = clockLabel(t1);
  const b = clockLabel(t2);
  const sameHalf = t2 < 24 && t1 < 12 === t2 < 12;
  return `${sameHalf ? a.slice(0, -3) : a} \u2013 ${b}`;
}
export function feedSourceLabel(url) {
  if (!url) return "your calendar";
  if (url.startsWith("mailbox-calendar:google:")) return "Google Calendar";
  if (url.startsWith("mailbox-calendar:microsoft:")) return "Outlook";
  let host;
  try {
    host = new URL(url.replace(/^webcal:\/\//i, "https://")).hostname.toLowerCase();
  } catch {
    return "your calendar";
  }
  if (host.includes("google")) return "Google Calendar";
  if (host.includes("icloud")) return "Apple Calendar";
  if (host.includes("office365") || host.includes("outlook") || host.includes("live.com")) return "Outlook";
  return "your calendar";
}
export function eventText(raw, max = 1500) {
  if (!raw) return null;
  const text = raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}\u2026` : text;
}
