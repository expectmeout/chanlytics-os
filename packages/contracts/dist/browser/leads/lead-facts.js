import { CLOCK, hourOf } from "./lead-helpers.js";
import { LEAD_KIND_KEY, LEAD_UNREACHABLE_KEY, leadKindWord } from "./search/class.js";
import { LEAD_CHECK_WORDS, LEAD_LEFT_OUT_WORD, LEAD_MAILBOX_WORDS, LEAD_UNREACHABLE_WORD } from "./lead-words.js";
import { dateFormat, DAY_MS } from "../shared/time.js";
export function leadTodayLine(hours, tz, now) {
  if (!hours.length) return null;
  const dayOf = (d) => dateFormat("en-US", { timeZone: tz, weekday: "long" }).format(d).toLowerCase();
  const hoursOn = (d) => hours.find((x) => x.day.toLowerCase() === dayOf(d))?.hours.trim() ?? null;
  const parts = dateFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  }).formatToParts(now);
  const at = Number(parts.find((p) => p.type === "hour")?.value ?? 0) + Number(parts.find((p) => p.type === "minute")?.value ?? 0) / 60;
  const clock = (hh, mm, ap) => `${hh}${mm && mm !== "00" ? `:${mm}` : ""} ${ap.toUpperCase()}`;
  const last = hoursOn(new Date(now.getTime() - DAY_MS))?.match(CLOCK);
  if (last && hourOf(last[4], last[5], last[6]) <= hourOf(last[1], last[2], last[3]) && at < hourOf(last[4], last[5], last[6])) {
    return `Open until ${clock(last[4], last[5], last[6])}`;
  }
  const text = hoursOn(now);
  if (text === null) return null;
  if (/^closed/i.test(text)) return "Closed today";
  if (/^open 24 hours$/i.test(text)) return "Open 24 hours";
  const m = text.match(CLOCK);
  if (!m) return `Open today \xB7 ${leadHoursShort(text)}`;
  const open = hourOf(m[1], m[2], m[3]);
  let close = hourOf(m[4], m[5], m[6]);
  if (close <= open) close += 24;
  if (at < open) return `Opens ${clock(m[1], m[2], m[3])}`;
  if (at < close) return `Open until ${clock(m[4], m[5], m[6])}`;
  return "Closed now";
}
export function leadHoursShort(text) {
  const t = text.trim();
  if (/^open 24 hours$/i.test(t)) return "24 hours";
  if (/^closed/i.test(t)) return "Closed";
  const at = (h, mm) => mm && mm !== "00" ? `${h}:${mm}` : h;
  const ranges = t.split(/\s*,\s*/).map((part) => {
    const m = part.match(CLOCK);
    if (!m) return null;
    const a1 = m[3].toUpperCase();
    const a2 = m[6].toUpperCase();
    const wraps = hourOf(m[4], m[5], m[6]) <= hourOf(m[1], m[2], m[3]);
    if (!wraps && a1 === "AM" && a2 === "PM") return `${at(m[1], m[2])}\u2013${at(m[4], m[5])}`;
    if (!wraps && a1 === a2) return `${at(m[1], m[2])}\u2013${at(m[4], m[5])} ${a2}`;
    return `${at(m[1], m[2])} ${a1}\u2013${at(m[4], m[5])} ${a2}`;
  });
  return ranges.every(Boolean) ? ranges.join(", ") : t;
}
export function leadWhere(r) {
  const town = [r.city, r.state].filter(Boolean).join(", ") + (r.postal_code ? ` ${r.postal_code}` : "");
  const line = [r.street, town].filter(Boolean).join(", ");
  return line ? { line, href: r.maps_url ?? null } : null;
}
export const LEAD_UNDO_MS = DAY_MS;
export function leadUndoable(s, now) {
  if (s?.via === "chosen") return false;
  const r = s?.round;
  return !!r && !r.undo_op_id && !!r.ended_at && now.getTime() - Date.parse(r.ended_at) < LEAD_UNDO_MS;
}
export function leadExclusionWord(search, key) {
  if (!key) return LEAD_LEFT_OUT_WORD;
  const plan = search?.plan;
  if (key === LEAD_KIND_KEY) return plan ? leadKindWord(plan.name) : LEAD_LEFT_OUT_WORD;
  if (key === LEAD_UNREACHABLE_KEY) return LEAD_UNREACHABLE_WORD;
  const ex = plan?.exclusions.find((e) => e.key === key);
  if (ex) return ex.text;
  const cr = plan?.criteria.find((c) => c.key === key);
  return cr ? cr.text : LEAD_LEFT_OUT_WORD;
}
const LEAD_CHECK_UNSURE_WORD = "couldn't tell";
export function leadCheckWord(search, key, answer) {
  const plan = search?.plan;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const low = (s) => s[1] && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const said = (yes, no) => answer === "yes" ? yes : answer === "no" ? no : `${yes}: ${LEAD_CHECK_UNSURE_WORD}`;
  if (key === LEAD_KIND_KEY && plan) return said(`One of the ${plan.name}`, leadKindWord(plan.name));
  const cr = plan?.criteria.find((c) => c.key === key);
  if (cr) return said(cap(cr.text), `${cap(cr.text)}: no`);
  const ex = plan?.exclusions.find((e) => e.key === key);
  if (ex) return said(`Not ${low(ex.text)}`, `One of the ${low(ex.text)}`);
  const fixed = LEAD_CHECK_WORDS[key];
  if (fixed) return fixed[answer];
  const plain = cap(key.replace(/_+/g, " ").trim()) || key;
  return said(plain, `${plain}: no`);
}
export const LEAD_SLOT_WORDS = {
  ok: "Checked",
  part: "Unconfirmed",
  none: "Nothing found",
  bad: "Bad",
  checking: "Still checking"
};
export function leadSlots(r) {
  const phone = !r.phone ? { state: "none", value: null, word: LEAD_SLOT_WORDS.none, tip: "No phone on the listing", copy: false } : r.phone_wrong ? {
    state: "bad",
    value: r.phone,
    word: LEAD_SLOT_WORDS.bad,
    tip: `${r.phone} \u2014 you marked this number wrong`,
    copy: false
  } : r.phone_agrees ? {
    state: "ok",
    value: r.phone,
    word: LEAD_SLOT_WORDS.ok,
    tip: `${r.phone} \u2014 the same number on Google Maps and on their website`,
    copy: true
  } : {
    state: "part",
    value: r.phone,
    word: LEAD_SLOT_WORDS.part,
    tip: `${r.phone} \u2014 one source, their Google Maps listing`,
    copy: true
  };
  const s = r.email_state;
  const mailbox = !r.email || s === "none" ? {
    state: "none",
    value: null,
    word: LEAD_SLOT_WORDS.none,
    tip: `${LEAD_MAILBOX_WORDS.none} \u2014 home, contact and about pages checked`,
    copy: false
  } : s === "ok" ? {
    state: "ok",
    value: r.email,
    word: LEAD_SLOT_WORDS.ok,
    tip: `${r.email} \u2014 ${LEAD_MAILBOX_WORDS.ok}`,
    copy: true
  } : s === "invalid" ? {
    state: "bad",
    value: r.email,
    word: LEAD_SLOT_WORDS.bad,
    tip: `${r.email} \u2014 ${LEAD_MAILBOX_WORDS.invalid}`,
    copy: false
  } : s === "checking" ? {
    state: "checking",
    value: r.email,
    word: LEAD_SLOT_WORDS.checking,
    tip: `${r.email} \u2014 ${LEAD_MAILBOX_WORDS.checking}. It resolves itself`,
    copy: true
  } : {
    state: "part",
    value: r.email,
    word: LEAD_SLOT_WORDS.part,
    tip: `${r.email} \u2014 ${LEAD_MAILBOX_WORDS[s]}`,
    copy: true
  };
  return { phone, mailbox };
}
export function leadTintOf(kind) {
  let h = 7;
  for (const ch of kind ?? "") h = h * 31 + ch.charCodeAt(0) >>> 0;
  return h % 6 + 1;
}
export const LEAD_TILE_PX = 96;
export function leadTileSrc(url, px = LEAD_TILE_PX) {
  if (!url) return null;
  if (!/^https:\/\/lh3\.googleusercontent\.com\//.test(url)) return url;
  return url.replace(/=w\d+-h\d+(?:-[a-z0-9-]+)?$/i, `=s${px}-c`);
}
