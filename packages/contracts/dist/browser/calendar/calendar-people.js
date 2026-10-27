import { isIdentifierName } from "../conversations/thread-contact.js";
import { dayInZone, dayPlusInZone } from "./zone-math.js";
import { appointmentKeyOf, recordIdOf } from "./appointment-key.js";
import { normalizeEmail } from "../shared/email-address.js";
import { alertAddressesOf } from "../config/workspace-config/alerts.js";
import { formatPhoneDisplay, normalizePhone } from "../shared/phone.js";
import { dateFormat, DAY_MS, MIN_MS } from "../shared/time.js";
const MATCH_WORDS = {
  phone: "matched by phone",
  email: "matched by email",
  name: "matched by name",
  business: "matched by their business",
  record: "linked on the booking"
};
export function matchWordsOf(via) {
  return via ? MATCH_WORDS[via] : null;
}
export function isGuess(via) {
  return via === "name" || via === "business";
}
function threadOf({ thread, waInboundAt, igInboundAt }) {
  return thread ? { thread, wa_inbound_at: waInboundAt ?? null, ig_inbound_at: igInboundAt ?? null } : {};
}
export function replyFactsOf(p) {
  return p.reach ? { reply_wire: p.reach.wire, email_stopped: p.reach.emailStopped, opted_out: p.reach.optedOut } : {};
}
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\(?\d{1,4}\)?(?:[\s.-]?\(?\d{2,4}\)?){2,5}/g;
const ISO_DATE_RE = /^\d{4}[-./]\d{2}[-./]\d{2}/;
function phoneFrom(raw) {
  const s = raw.trim();
  if (ISO_DATE_RE.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  const bare = /^\+?\d+$/.test(s);
  if (bare && !s.startsWith("+") && !(digits.length === 10 || digits.length === 11 && digits.startsWith("1")))
    return null;
  return normalizePhone(s.startsWith("+") ? `+${digits}` : digits);
}
const NO_OWN_ADDRESSES = /* @__PURE__ */ new Set();
export function calendarOwnerOf(url) {
  const m = /^https:\/\/calendar\.google\.com\/calendar\/ical\/([^/]+)\//i.exec(url ?? "");
  if (!m) return null;
  let id;
  try {
    id = decodeURIComponent(m[1]).trim().toLowerCase();
  } catch {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) || /@(group|import)\.calendar\.google\.com$/.test(id)) return null;
  return id;
}
export function ownAddressesOf(cfg) {
  const out = alertAddressesOf(cfg?.notifications);
  const owner = calendarOwnerOf(cfg?.calendar?.ical_url);
  if (owner) out.add(owner);
  return out;
}
function isOwn(own, p) {
  return !!p.email && own.has(p.email.toLowerCase());
}
export function extractContacts(item, own) {
  const text = [item.title, item.description ?? "", item.location ?? ""].join("\n");
  const organizer = item.organizer?.toLowerCase() || null;
  const emails = /* @__PURE__ */ new Set();
  for (const m of text.match(EMAIL_RE) ?? []) emails.add(m.toLowerCase());
  for (const a of item.attendees ?? []) if (a.email) emails.add(a.email.toLowerCase());
  if (organizer) emails.delete(organizer);
  for (const a of own) emails.delete(a);
  const phones = /* @__PURE__ */ new Set();
  for (const m of text.replace(EMAIL_RE, " ").match(PHONE_RE) ?? []) {
    const p = phoneFrom(m);
    if (p) phones.add(p);
  }
  const names = /* @__PURE__ */ new Set();
  for (const a of item.attendees ?? []) {
    if (organizer && a.email?.toLowerCase() === organizer) continue;
    if (a.email && own.has(a.email.toLowerCase())) continue;
    const n = (a.name ?? "").trim();
    if (n && !EMAIL_RE.test(n)) names.add(n);
    EMAIL_RE.lastIndex = 0;
  }
  return { phones: [...phones], emails: [...emails], names: [...names] };
}
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function nameMatcher(name) {
  const n = name.trim();
  if (n.length < 4 || isIdentifierName(n)) return null;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(n)}(?=$|[^\\p{L}\\p{N}])`, "iu");
}
export function personInText(text, people) {
  let best = null;
  for (const p of people) {
    const re = nameMatcher(p.name);
    if (re && re.test(text) && (!best || p.name.trim().length > best.name.trim().length)) best = p;
  }
  return best;
}
const labelOf = (p) => p.name.trim() || formatPhoneDisplay(p.phone) || p.email || "Unknown";
export function matchPerson(item, everyone, own) {
  const c = extractContacts(item, own);
  const people = everyone.filter((p2) => !isOwn(own, p2));
  if (c.phones.length) {
    const byPhone = /* @__PURE__ */ new Map();
    for (const p2 of people) if (p2.phone) byPhone.set(p2.phone, p2);
    for (const ph of c.phones) {
      const p2 = byPhone.get(ph);
      if (p2) return { id: p2.id, name: labelOf(p2), via: "phone", ...threadOf(p2), ...replyFactsOf(p2) };
    }
  }
  if (c.emails.length) {
    const byEmail = /* @__PURE__ */ new Map();
    for (const p2 of people) if (p2.email) byEmail.set(p2.email.toLowerCase(), p2);
    for (const em of c.emails) {
      const p2 = byEmail.get(em);
      if (p2) return { id: p2.id, name: labelOf(p2), via: "email", ...threadOf(p2), ...replyFactsOf(p2) };
    }
    const byBusiness2 = /* @__PURE__ */ new Map();
    for (const p2 of people) for (const em of p2.businessEmails ?? []) byBusiness2.set(em, p2);
    for (const em of c.emails) {
      const p2 = byBusiness2.get(em);
      if (p2) return { id: p2.id, name: labelOf(p2), via: "business", ...threadOf(p2), ...replyFactsOf(p2) };
    }
  }
  const words = [item.title, ...c.names, item.description ?? ""].join("\n");
  const p = personInText(words, people);
  if (p) return { id: p.id, name: labelOf(p), via: "name", ...threadOf(p), ...replyFactsOf(p) };
  const byBusiness = personInText(words, soleAtBusiness(people));
  const b = byBusiness ? people.find((x) => x.id === byBusiness.id) : void 0;
  return b ? { id: b.id, name: labelOf(b), via: "business", ...threadOf(b), ...replyFactsOf(b) } : null;
}
function soleAtBusiness(people) {
  const key = (p) => p.business?.trim().toLowerCase() ?? "";
  const n = /* @__PURE__ */ new Map();
  for (const p of people) n.set(key(p), (n.get(key(p)) ?? 0) + 1);
  return people.flatMap((p) => key(p) && n.get(key(p)) === 1 ? [{ ...p, name: p.business?.trim() ?? "" }] : []);
}
const NEAR_VISIT_MS = 3 * DAY_MS;
const isBookingRow = (it) => !!it.uid && recordIdOf(it.uid) !== null;
export function indexFeed(items, own) {
  const byPhone = /* @__PURE__ */ new Map();
  const byEmail = /* @__PURE__ */ new Map();
  const byContact = /* @__PURE__ */ new Map();
  const texts = [];
  for (const it of items) {
    const c = extractContacts(it, own);
    for (const ph of c.phones) byPhone.set(ph, [...byPhone.get(ph) ?? [], it]);
    for (const em of c.emails) byEmail.set(em, [...byEmail.get(em) ?? [], it]);
    if (it.contactId) byContact.set(it.contactId, [...byContact.get(it.contactId) ?? [], it]);
    if (!isBookingRow(it)) texts.push({ item: it, text: [it.title, ...c.names, it.description ?? ""].join("\n") });
  }
  return { byPhone, byEmail, byContact, texts, own };
}
export const SAME_VISIT_MS = 15 * MIN_MS;
export const sameVisitStart = (a, b) => Math.abs(a - b) <= SAME_VISIT_MS;
const visitOf = (it, via) => ({
  id: it.uid ? `${it.uid}:${it.start}` : `ev:${it.start}`,
  key: appointmentKeyOf(it),
  start: it.start,
  end: it.end,
  title: it.title || "Busy",
  allDay: it.allDay,
  via,
  ...it.said ? { said: it.said } : {},
  ...it.recordId ? { recordId: it.recordId } : {}
});
function namesThemFirst(it, via, person, own) {
  if (via !== "phone" && via !== "email" || isBookingRow(it)) return false;
  const c = extractContacts(it, own);
  if (via === "phone") return c.phones[0] === person.phone;
  return !c.phones.length && c.emails[0] === person.email?.toLowerCase();
}
function personVisits(index, person) {
  if (isOwn(index.own, person)) return [];
  const taken = /* @__PURE__ */ new Map();
  const take = (items, via) => {
    for (const it of items ?? []) if (!taken.has(it)) taken.set(it, via);
  };
  take(index.byContact.get(person.id), "record");
  if (person.phone) take(index.byPhone.get(person.phone), "phone");
  if (person.email) take(index.byEmail.get(person.email.toLowerCase()), "email");
  for (const em of person.businessEmails ?? []) take(index.byEmail.get(em), "business");
  const re = nameMatcher(person.name);
  if (re) {
    for (const { item, text } of index.texts) if (!taken.has(item) && re.test(text)) taken.set(item, "name");
  }
  const linked = index.byContact.get(person.id) ?? [];
  const gap = (a, b) => Math.abs(a.start - b.start);
  const copies = [];
  for (const [it, via] of taken) {
    if (!namesThemFirst(it, via, person, index.own)) continue;
    const near = linked.filter((b) => sameVisitStart(b.start, it.start)).sort((a, b) => gap(a, it) - gap(b, it));
    if (near[0]) copies.push({ it, of: near[0] });
  }
  const words = /* @__PURE__ */ new Map();
  for (const { it, of } of copies.sort((a, b) => gap(a.it, a.of) - gap(b.it, b.of)))
    if (it.said && !of.said && !words.has(of)) words.set(of, it.said);
  const left = new Set(copies.map((c) => c.it));
  return [...taken].flatMap(([it, via]) => {
    if (left.has(it)) return [];
    const said = words.get(it);
    return [said ? { ...visitOf(it, via), said } : visitOf(it, via)];
  });
}
export function allVisitsIn(index, person) {
  return personVisits(index, person).sort((a, b) => a.start - b.start);
}
export function visitsIn(index, person, nowMs) {
  let next = null;
  let last = null;
  let missed = null;
  const near = [];
  for (const v of personVisits(index, person)) {
    if (v.said === "missed") {
      if (!missed || v.start > missed.start) missed = v;
      continue;
    }
    if (v.end >= nowMs) {
      if (!next || v.start < next.start) next = v;
    } else if (!last || v.end > last.end) last = v;
    if (Math.abs(v.start - nowMs) <= NEAR_VISIT_MS) near.push(v);
  }
  return { next, last, near: near.sort((a, b) => a.start - b.start), missed };
}
export function visitsOf(items, person, nowMs, own) {
  return visitsIn(indexFeed(items, own), person, nowMs);
}
const ms = (t) => typeof t === "number" ? t : Date.parse(t);
export function visitDay(start, tz, nowMs) {
  const key = dayInZone(tz, ms(start)).key;
  const today = dayInZone(tz, nowMs).key;
  const tomorrow = dayPlusInZone(tz, nowMs, 1).key;
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return dateFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(ms(start))
  );
}
export function visitTime(v, tz) {
  if (v.allDay || v.all_day) return "all day";
  const f = dateFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const a = f.format(new Date(ms(v.start)));
  const b = f.format(new Date(ms(v.end)));
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a} \u2013 ${b}`;
}
export function visitDateKey(start, tz) {
  return dayInZone(tz, ms(start)).key;
}
export function visitStartTime(v, tz) {
  if (v.allDay || v.all_day) return "all day";
  return dateFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms(v.start)));
}
export function visitLine(v, tz, nowMs) {
  return `${visitDay(v.start, tz, nowMs)} \xB7 ${visitTime(v, tz)}`;
}
export function describeVisits(visits, tz, nowMs, opts) {
  const out = [];
  if (visits.next) {
    const n = visits.next;
    out.push(
      `Their next appointment on the calendar: ${visitLine(n, tz, nowMs)} (${n.title}).${n.via === "name" ? " Matched by name only \u2014 make sure it is them before confirming details." : n.via === "business" ? " Matched by their business only \u2014 make sure it is them before confirming details." : ""} If they ask, confirm it; to change or cancel it, ${opts.hasBookingLink ? "send the booking link" : "say the team will follow up"} \u2014 nothing is changed from here.`
    );
  }
  if (visits.last) {
    const l = visits.last;
    out.push(
      `Their last visit on the calendar: ${dateFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(l.start))} (${l.title}).`
    );
  }
  return out.length ? out.join(" ") : null;
}
export function visitsAt(v, nowMs) {
  if (!v?.next || !(Date.parse(v.next.end) < nowMs)) return v;
  const ended = v.next;
  const ahead = (v.all ?? v.near ?? []).filter((x) => x.said !== "missed" && x.id !== ended.id && Date.parse(x.end) >= nowMs).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const last = !v.last || Date.parse(ended.end) > Date.parse(v.last.end) ? ended : v.last;
  return { ...v, next: ahead.at(0) ?? null, last };
}
export function toVisitDto(v) {
  return v ? {
    id: v.id,
    start: new Date(v.start).toISOString(),
    end: new Date(v.end).toISOString(),
    title: v.title,
    all_day: v.allDay,
    via: v.via,
    ...v.key ? { key: v.key } : {},
    ...v.said ? { said: v.said } : {},
    ...v.recordId ? { record_id: v.recordId } : {}
  } : null;
}
const NAME_WORD = /^[\p{L}][\p{L}'’.-]*$/u;
const CAPITAL = /^\p{Lu}/u;
export function guessName(item, services = []) {
  const svc = new Set(services.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const organizer = item.organizer?.toLowerCase() || null;
  const guest = (item.attendees ?? []).filter((a) => !organizer || a.email?.toLowerCase() !== organizer).map((a) => (a.name ?? "").trim()).find((n) => n && !n.includes("@"));
  if (guest) return guest.slice(0, 80);
  const title = item.title.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  const parts = title.split(/\s+(?:-|–|—|·|\||:|\/)\s+|\s+(?:with|for|w\/)\s+|:\s+/i).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (svc.has(part.toLowerCase())) continue;
    const words = part.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => NAME_WORD.test(w) && CAPITAL.test(w))) continue;
    if (words.some((w) => svc.has(w.toLowerCase()))) continue;
    return part;
  }
  return null;
}
export function peopleFromItems(items, services, nowMs, window = {}) {
  const from = nowMs - (window.backDays ?? 30) * DAY_MS;
  const to = nowMs + (window.aheadDays ?? 90) * DAY_MS;
  const byPhone = /* @__PURE__ */ new Map();
  const ridersOf = /* @__PURE__ */ new Map();
  const better = (a, b) => {
    const aUp = a.start >= nowMs;
    const bUp = b.start >= nowMs;
    if (aUp !== bUp) return aUp;
    return aUp ? a.start < b.start : a.start > b.start;
  };
  for (const it of items) {
    if (it.end < from || it.start > to) continue;
    const found = extractContacts(it, NO_OWN_ADDRESSES);
    const phones = found.phones;
    if (!phones.length) continue;
    for (const e of found.emails) {
      const riders = ridersOf.get(e) ?? /* @__PURE__ */ new Set();
      for (const phone of phones) riders.add(phone);
      ridersOf.set(e, riders);
    }
    const email = phones.length === 1 && found.emails.length === 1 ? normalizeEmail(found.emails[0]) : null;
    const name = guessName(it, services);
    for (const phone of phones) {
      const row = { phone, name, title: it.title || "Busy", uid: it.uid, start: it.start, email };
      const have = byPhone.get(phone);
      if (!have) {
        byPhone.set(phone, row);
        continue;
      }
      const [keep, other] = better(row, have) ? [row, have] : [have, row];
      byPhone.set(phone, { ...keep, name: keep.name ?? other.name, email: keep.email ?? other.email });
    }
  }
  return [...byPhone.values()].map((r) => r.email && (ridersOf.get(r.email)?.size ?? 0) > 1 ? { ...r, email: null } : r).sort((a, b) => a.start - b.start);
}
export function afterPersonRefused(code) {
  return code === "22023" || code === "PE001" ? "skip" : "stop";
}
