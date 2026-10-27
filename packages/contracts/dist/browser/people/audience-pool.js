import { feedWithRecord } from "../calendar/appointment-item.js";
import {
  indexFeed,
  toVisitDto,
  visitsIn
} from "../calendar/calendar-people.js";
import { isOptedOutContact } from "../consent/consent.js";
import { isEmailStopped } from "../conversations/thread-contact.js";
import { isConsultationTitle } from "../deals/deal-consultations.js";
import { igClockOfRow, replyChannelOfRow, toPersonRowVM } from "./person-row.js";
export function personLikeOf(p) {
  return {
    id: p.id,
    name: p.display_name || p.wa_profile_name || "",
    phone: p.phone_e164,
    // Optional on the Pick the way personName takes it: a row read before 00125 carries no address, and no address is
    // no match, never a crash.
    email: p.email ?? null,
    thread: p.has_chat && p.latest_conversation_id ? p.latest_conversation_id : null,
    waInboundAt: p.latest_wa_inbound_at ?? null,
    igInboundAt: igClockOfRow({
      last_inbound_channel: p.last_inbound_channel ?? null,
      last_wrote_at: p.last_wrote_at ?? null
    }),
    // What a reply to them is judged by, from the same row and the same functions the People row asks (person-row.ts), so the
    // board's block offers the booking link, or does not, as the row does. A row without the columns says no stop: absence is
    // no opt-out (consent.ts).
    reach: {
      wire: replyChannelOfRow({
        has_chat: p.has_chat ?? false,
        last_inbound_channel: p.last_inbound_channel ?? null,
        message_channels: p.message_channels
      }),
      emailStopped: isEmailStopped({ email_suppressed_at: p.email_suppressed_at ?? null }),
      optedOut: isOptedOutContact({ consent: p.consent, dnc: p.dnc })
    },
    // The business they work at, while it stands (0052): the calendar's fourth match.
    business: p.lead_id && !p.lead_gone && p.lead_name ? p.lead_name : null,
    // Its own addresses, on its own person alone (people_list, 00418): a booking from one is theirs, by their business.
    businessEmails: p.lead_id && !p.lead_gone && p.lead_emails ? p.lead_emails.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0) : []
  };
}
export function peopleVisitsOf(items, people, cal, nowMs) {
  const index = indexFeed(feedWithRecord(items, cal.record, cal.own), cal.own);
  const mark = (v) => v ? { ...v, consultation: isConsultationTitle(v.title, cal.services, cal.rules) } : null;
  const out = /* @__PURE__ */ new Map();
  for (const p of people) {
    const v = visitsIn(index, personLikeOf(p), nowMs);
    out.set(p.id, {
      timezone: cal.timezone,
      source: cal.source,
      state: "ok",
      next: mark(toVisitDto(v.next)),
      last: mark(toVisitDto(v.last)),
      near: v.near.map((x) => mark(toVisitDto(x))).filter((x) => x !== null),
      missed: mark(toVisitDto(v.missed ?? null))
    });
  }
  return out;
}
export function withVisitsOf(people, visits, cal) {
  const unread = {
    timezone: cal.timezone,
    source: cal.source,
    state: "unavailable",
    next: null,
    last: null
  };
  return people.map((p) => ({
    ...p,
    visits: cal.state === "ok" ? visits.get(p.id) ?? null : cal.state === "unavailable" ? unread : null
  }));
}
export function poolRowOf(person, o) {
  return toPersonRowVM(person, o.tz, o.now, o.viewer, o.ready, o.names ?? null);
}
export function poolRowsOf(people, o) {
  return people.map((p) => poolRowOf(p, o));
}
export function consultFirstOf(rules) {
  return (rules?.consult_first ?? []).length > 0;
}
export function poolListContext(o) {
  return { calendar: o.calendar, hasDeals: o.hasDeals, consultFirst: o.consultFirst, viewer: o.viewer !== null };
}
