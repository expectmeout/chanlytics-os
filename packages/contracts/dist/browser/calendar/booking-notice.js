import { localToUtcMs } from "./zone-math.js";
import { extractContacts } from "./calendar-people.js";
import { normalizeEmail } from "../shared/email-address.js";
import { normalizePhone } from "../shared/phone.js";
import { DAY_MS, HOUR_MS, MIN_MS } from "../shared/time.js";
export const BOOKING_TOOL_IDS = [
  "booksy",
  "acuity",
  "fresha",
  "square",
  "vagaro",
  "glossgenius",
  "calendly",
  "setmore",
  "mindbody",
  "simplybook",
  "schedulicity",
  "styleseat"
];
const BOOKING_TOOLS = [
  { tool: "booksy", name: "Booksy", domains: ["booksy.com"], calendar: "none" },
  { tool: "acuity", name: "Acuity", domains: ["acuityscheduling.com", "squarespacescheduling.com"], calendar: "own" },
  { tool: "fresha", name: "Fresha", domains: ["fresha.com"], calendar: "own" },
  { tool: "square", name: "Square", domains: ["squareup.com", "square.com"], calendar: "writes" },
  { tool: "vagaro", name: "Vagaro", domains: ["vagaro.com"], calendar: "writes" },
  { tool: "glossgenius", name: "GlossGenius", domains: ["glossgenius.com"], calendar: "own" },
  { tool: "calendly", name: "Calendly", domains: ["calendly.com"], calendar: "writes" },
  { tool: "setmore", name: "Setmore", domains: ["setmore.com"], calendar: null },
  { tool: "mindbody", name: "Mindbody", domains: ["mindbodyonline.com"], calendar: null },
  { tool: "simplybook", name: "SimplyBook", domains: ["simplybook.me"], calendar: null },
  { tool: "schedulicity", name: "Schedulicity", domains: ["schedulicity.com"], calendar: null },
  { tool: "styleseat", name: "StyleSeat", domains: ["styleseat.com"], calendar: null }
];
export const isBookingTool = (v) => BOOKING_TOOLS.some((t) => t.tool === v);
export function bookingToolName(tool) {
  if (!tool) return null;
  return BOOKING_TOOLS.find((t) => t.tool === tool)?.name ?? tool;
}
export function bookingToolCalendar(tool) {
  return BOOKING_TOOLS.find((t) => t.tool === tool)?.calendar ?? null;
}
export function bookingToolOfAddress(address) {
  const a = (address ?? "").trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at < 1) return null;
  const host = a.slice(at + 1);
  for (const t of BOOKING_TOOLS) for (const d of t.domains) if (host === d || host.endsWith(`.${d}`)) return t.tool;
  return null;
}
const FORWARD_SUBJECT = /^\s*(fwd?|fw|tr|wg|rv)\s*:/i;
export function bookingNoticeOf(e) {
  const direct = bookingToolOfAddress(e.from?.address);
  if (direct) return { tool: direct, forwarded: false };
  if (!e.from || !FORWARD_SUBJECT.test(e.subject ?? "") || !e.text) return null;
  const head = e.text.slice(0, 4e3);
  const m = /^\s*(?:>\s*)?(?:from|de|von)\s*:\s*(?:"?[^<\n]*"?\s*<)?([^\s<>]+@[^\s<>]+)>?/im.exec(head);
  const quoted = m ? bookingToolOfAddress(m[1]) : null;
  return quoted ? { tool: quoted, forwarded: true } : null;
}
const NOTICE_KINDS = ["booked", "changed", "cancelled", "other"];
const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
export const NOTICE_SCHEMA = /* @__PURE__ */ (() => ({
  type: "object",
  properties: {
    kind: { type: "string", enum: [...NOTICE_KINDS] },
    client_name: { anyOf: [{ type: "string" }, { type: "null" }] },
    client_phone: { anyOf: [{ type: "string" }, { type: "null" }] },
    client_email: { anyOf: [{ type: "string" }, { type: "null" }] },
    service: { anyOf: [{ type: "string" }, { type: "null" }] },
    staff: { anyOf: [{ type: "string" }, { type: "null" }] },
    starts_at: {
      anyOf: [
        { type: "string", description: "YYYY-MM-DDTHH:MM, the business's own clock, no zone." },
        { type: "null" }
      ]
    },
    ends_at: {
      anyOf: [
        { type: "string", description: "YYYY-MM-DDTHH:MM, the business's own clock, no zone." },
        { type: "null" }
      ]
    },
    previous_starts_at: {
      anyOf: [
        { type: "string", description: "For a change only: the time it was before, YYYY-MM-DDTHH:MM." },
        { type: "null" }
      ]
    },
    price: { anyOf: [{ type: "string" }, { type: "null" }] },
    note: { anyOf: [{ type: "string" }, { type: "null" }] }
  },
  required: [
    "kind",
    "client_name",
    "client_phone",
    "client_email",
    "service",
    "staff",
    "starts_at",
    "ends_at",
    "previous_starts_at",
    "price",
    "note"
  ],
  additionalProperties: false
}))();
const NOTICE_TEXT_MAX = 6e3;
export const NOTICE_READ_MAX_TOKENS = 600;
export function noticePrompt(p) {
  const system = [
    "You read one email a booking tool sent a business about one of its appointments, and answer in the JSON shape asked.",
    `kind: booked when a client booked or the tool confirms a booking; changed when a booking moved to another time; cancelled when it was cancelled or the client did not show; other when the email is not about one booking (a receipt, a digest, a reminder to the business, marketing), and other when it is written TO THE CLIENT about a booking of their own at a business ('Your appointment at Harbor Studio is confirmed', 'See you tomorrow at 3'): the business's notice names its client as someone else, it never speaks to them.`,
    "client_name, client_phone, client_email: the CLIENT's, as written; never the business's, the staff member's or the tool's own.",
    "service: the service booked, as written (with its category if the tool writes one: 'Hair Color: Partial highlight'). staff: who it is with, as written.",
    "starts_at, ends_at: the appointment's start and end on the business's own clock as YYYY-MM-DDTHH:MM, from the date and the time range the email states. For a change, the NEW time; previous_starts_at is the old one. ends_at null when no end is stated.",
    "price: as written ('$55.00+', 'Varies'), null when none. note: the client's own note, null when none.",
    "Take only what the email states. Invent nothing; a field the email does not state is null."
  ].join("\n");
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: p.tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const user = [
    `Booking tool: ${bookingToolName(p.tool)}.`,
    `Received on ${day.format(new Date(p.receivedAtMs))}; the business's zone is ${p.tz}.`,
    `Subject: ${p.subject ?? "(none)"}`,
    "",
    p.text.slice(0, NOTICE_TEXT_MAX)
  ].join("\n");
  return { system, user };
}
const NOTICE_HOLDS = [
  "no_model",
  "may_not_spend",
  "unreadable",
  "not_a_booking",
  "no_time",
  "no_client",
  // The provider no longer had the email when the read ran: nothing could be read, and the delivery is still on the ledger.
  "gone"
];
export const isNoticeHold = (v) => NOTICE_HOLDS.includes(v);
export const NOTICE_DEFAULT_LENGTH_MS = HOUR_MS;
const NOTICE_LENGTH_MAX_MS = 12 * HOUR_MS;
const E164 = /^\+[1-9][0-9]{6,14}$/;
const NOTICE_TIME_REACH_MS = 400 * DAY_MS;
const NOTICE_FIELD_MAX = 200;
const NOTICE_NOTE_MAX = 1e3;
function localMs(tz, v) {
  if (typeof v !== "string") return null;
  const m = LOCAL_TIME.exec(v.trim());
  if (!m) return null;
  const part = (i) => Number(m[i]);
  const y = part(1);
  const mo = part(2);
  const d = part(3);
  const hh = part(4);
  const mm = part(5);
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && hh <= 23 && mm <= 59)) return null;
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return null;
  const ms = localToUtcMs(tz, y, mo, d, hh, mm);
  return Number.isFinite(ms) ? ms : null;
}
function trimmedText(v, max) {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}
export function noticeAnswerOf(answer, tz, nowMs) {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return { reading: null, hold: "unreadable" };
  const a = answer;
  const kind = a.kind;
  if (kind === "other") return { reading: null, hold: "not_a_booking" };
  if (kind !== "booked" && kind !== "changed" && kind !== "cancelled") return { reading: null, hold: "unreadable" };
  const start = localMs(tz, a.starts_at);
  if (start === null || Math.abs(start - nowMs) > NOTICE_TIME_REACH_MS) return { reading: null, hold: "no_time" };
  const endRead = localMs(tz, a.ends_at);
  const end = endRead !== null && endRead > start && endRead - start <= NOTICE_LENGTH_MAX_MS ? endRead : start + NOTICE_DEFAULT_LENGTH_MS;
  const phone = normalizePhone(typeof a.client_phone === "string" ? a.client_phone : null);
  const client = {
    name: trimmedText(a.client_name, NOTICE_FIELD_MAX),
    phone: phone && E164.test(phone) ? phone : null,
    email: normalizeEmail(typeof a.client_email === "string" ? a.client_email : null)
  };
  if (!client.name && !client.phone && !client.email) return { reading: null, hold: "no_client" };
  const previous = kind === "changed" ? localMs(tz, a.previous_starts_at) : null;
  return {
    reading: {
      kind,
      client,
      service: trimmedText(a.service, NOTICE_FIELD_MAX),
      staff: trimmedText(a.staff, NOTICE_FIELD_MAX),
      start,
      end,
      previousStart: previous !== null && Math.abs(previous - nowMs) <= NOTICE_TIME_REACH_MS ? previous : null,
      price: trimmedText(a.price, NOTICE_FIELD_MAX),
      note: trimmedText(a.note, NOTICE_NOTE_MAX)
    },
    hold: null
  };
}
export function clientKeyOf(client) {
  if (client.phone) return client.phone;
  if (client.email) return client.email.toLowerCase();
  return (client.name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function appointmentKey(tool, client, startMs) {
  return `${tool}:${clientKeyOf(client)}:${Math.floor(startMs / MIN_MS) * MIN_MS}`;
}
export const SAME_VISIT_MS = 15 * MIN_MS;
const near = (starts, at) => !!starts?.some((s) => Math.abs(s - at) <= SAME_VISIT_MS);
export function sameVisitOnRecord(a, b) {
  return !!a.contact_id && a.contact_id === b.contact_id && Math.abs(Date.parse(a.starts_at) - Date.parse(b.starts_at)) <= SAME_VISIT_MS;
}
export function bookingCopyTest(bookings, own) {
  if (!bookings.length) return null;
  const byPhone = /* @__PURE__ */ new Map();
  const byEmail = /* @__PURE__ */ new Map();
  const byPerson = /* @__PURE__ */ new Map();
  const add = (m, k, at) => m.set(k, [...m.get(k) ?? [], at]);
  for (const b of bookings) {
    const at = Date.parse(b.starts_at);
    if (b.client_phone) add(byPhone, b.client_phone, at);
    if (b.client_email) add(byEmail, b.client_email.toLowerCase(), at);
    if (b.contact_id) add(byPerson, b.contact_id, at);
  }
  if (!byPhone.size && !byEmail.size && !byPerson.size) return null;
  return (item, contactId) => {
    if (contactId && near(byPerson.get(contactId), item.start)) return true;
    if (!byPhone.size && !byEmail.size) return false;
    const c = extractContacts(item, own);
    return c.phones.some((p) => near(byPhone.get(p), item.start)) || c.emails.some((e) => near(byEmail.get(e.toLowerCase()), item.start));
  };
}
export function bookingToolOptions() {
  return BOOKING_TOOLS.map((t) => ({ value: t.tool, label: t.name }));
}
export const BOOKING_TOOL_STEPS = {
  acuity: {
    way: "recipient",
    steps: [
      "In Acuity, open the calendar your bookings land on, then Calendar notifications.",
      "Under \u201CSend booking notifications to\u201D, add the address above beside your own."
    ]
  },
  fresha: {
    way: "recipient",
    steps: [
      "In Fresha, open Settings \u203A Scheduling \u203A Online bookings \u203A Notifications, then Edit.",
      "Add the address above to the emails that get booked, rescheduled and cancelled bookings."
    ]
  },
  booksy: {
    way: "forward",
    steps: [
      "Open the inbox your Booksy account emails: its booking emails arrive there.",
      "Make a filter for mail from no-reply@booksy.com that forwards to the address above."
    ]
  },
  square: {
    way: "forward",
    steps: [
      "In Square, under Team members \u203A your name \u203A Booking notifications, keep email on.",
      "In that inbox, make a filter for Square's booking emails that forwards to the address above."
    ]
  },
  vagaro: {
    way: "forward",
    steps: [
      "In Vagaro, under Settings \u203A Booking \u203A Email & Text Notifications, keep employee email notifications on.",
      "In that inbox, make a filter for mail from vagaro.com that forwards to the address above."
    ]
  },
  glossgenius: {
    way: "forward",
    steps: [
      "In GlossGenius, under your personal notifications, keep booking emails on (they go to whoever is booked).",
      "In that inbox, make a filter for mail from glossgenius.com that forwards to the address above."
    ]
  },
  calendly: {
    way: "forward",
    steps: [
      "Open the inbox Calendly emails your bookings to (each host gets their own).",
      "Make a filter for mail from calendly.com that forwards to the address above."
    ]
  },
  setmore: {
    way: "forward",
    steps: ["In the inbox Setmore emails, make a filter for mail from setmore.com that forwards to the address above."]
  },
  mindbody: {
    way: "forward",
    steps: [
      "In the inbox Mindbody emails, make a filter for mail from mindbodyonline.com that forwards to the address above."
    ]
  },
  simplybook: {
    way: "forward",
    steps: [
      "In the inbox SimplyBook emails, make a filter for mail from simplybook.me that forwards to the address above."
    ]
  },
  schedulicity: {
    way: "forward",
    steps: [
      "In the inbox Schedulicity emails, make a filter for mail from schedulicity.com that forwards to the address above."
    ]
  },
  styleseat: {
    way: "forward",
    steps: [
      "In the inbox StyleSeat emails, make a filter for mail from styleseat.com that forwards to the address above."
    ]
  }
};
export const GMAIL_FORWARD_NOTE = "If that inbox is Gmail, it asks once to confirm the forward: the code and a one-press confirm appear here.";
export const BOOKING_TRY_NOTE = "To try it now, forward any past booking email to the address above, from the email you sign in with.";
export const NOTICE_HOLD_WORDS = {
  no_model: "The reader was unavailable. Press Read again.",
  may_not_spend: "The workspace's AI spend is paused. Read again once it is on.",
  unreadable: "It could not be read as a booking.",
  // Kept on the ledger and set aside, never held: nobody is asked to look at a tool's receipt or its newsletter.
  not_a_booking: "It is from your booking tool, but not about one booking.",
  no_time: "No time for the booking could be read from it.",
  no_client: "No client could be read from it.",
  gone: "The email was gone before it could be read."
};
const GMAIL_FORWARDING_SENDER = /^forwarding-noreply@google\.com$/i;
export function forwardingConfirmationOf(e) {
  if (!e.from || !GMAIL_FORWARDING_SENDER.test(e.from.address.trim())) return null;
  const subject = e.subject ?? "";
  if (!/forwarding confirmation/i.test(subject)) return null;
  const text = e.text ?? "";
  const code = /\(#(\d{5,12})\)/.exec(subject)?.[1] ?? /confirmation code:\s*(\d{5,12})/i.exec(text)?.[1] ?? null;
  const account = /receive mail from\s+([^\s<>]+@[^\s<>]+)/i.exec(subject)?.[1] ?? /([^\s<>]+@[^\s<>]+)\s+has requested to automatically forward/i.exec(text)?.[1] ?? null;
  if (!code || !account) return null;
  const link = /https:\/\/[a-z0-9.-]*\.google\.com\/mail\/vf-[^\s<>")]+/i.exec(text)?.[0] ?? null;
  return { account: account.toLowerCase(), code, link };
}
