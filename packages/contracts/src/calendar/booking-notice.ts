/**
 * A booking notice: the email a booking tool sends the business when a client books, changes or cancels (docs/plans/
 * 2026-10-07-bookings-arrive-by-email.md). Every tool writes one; few write into a calendar. The owner sends them to
 * the workspace's address (a recipient the tool takes, or one forward filter), the intake tells one from a person's
 * email (bookingNoticeOf), the model reads it into one shape (NOTICE_SCHEMA, noticePrompt), the answer is held to that
 * shape strictly (noticeAnswerOf), and the row it becomes is told from a repeat by its key (appointmentKey). Nothing here
 * is a tool's own: the sender list says only whose mail a forward is, and the read is the same for every tool.
 *
 * The intake's rule, the model's shape and the row's identity are one module so the four doors that use them (channels'
 * claim, core's read, the board's row, Settings' words) cannot drift.
 */
import { dayInZone, localToUtcMs } from "./zone-math";
import type { FeedItem } from "./feed";
import { extractContacts, sameVisitStart, type OwnAddresses } from "./calendar-people";
import { normalizeEmail } from "../shared/email-address";
import { normalizePhone } from "../shared/phone";
import { DAY_MS, HOUR_MS, MIN_MS } from "../shared/time";

/* ------------------------------------------------------------------ the tools whose mail is recognised */

/** The tools an owner may pick as theirs (config.bookings.tool), in the order the picker lists them. */
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
  "styleseat",
] as const;
export type BookingTool = (typeof BOOKING_TOOL_IDS)[number];
/**
 * The calendar a tool gives an owner to read, beside its emails: a link of its `own`; the owner's own calendar, which it
 * `writes` appointments into (Google, Outlook, iCloud), whose address is then the one to paste; or `none`. Verified
 * against each tool's help centre, 6 October 2026 (docs/2026-10-06-chanlytics-calendar-wiring.md, section 5); a tool
 * not verified says null, and the page then asks without claiming either.
 */
export type BookingToolCalendar = "own" | "writes" | "none";
/**
 * The tools whose notices the intake recognises by their sender, in the words the product says them: one row per id
 * above, in its order (the compiler holds each row to an id; booking-notice.test.mjs holds the list to every id).
 */
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
  { tool: "styleseat", name: "StyleSeat", domains: ["styleseat.com"], calendar: null },
] as const satisfies ReadonlyArray<{
  tool: BookingTool;
  name: string;
  domains: readonly string[];
  calendar: BookingToolCalendar | null;
}>;
/** Whether a stored or typed value names a tool of the list: the card's picker and the steps read it through this. */
export const isBookingTool = (v: unknown): v is BookingTool => BOOKING_TOOLS.some((t) => t.tool === v);

/** The tool's name as the product says it ("Booksy"); the word itself for one the list does not know. */
export function bookingToolName(tool: string | null | undefined): string | null {
  if (!tool) return null;
  return BOOKING_TOOLS.find((t) => t.tool === tool)?.name ?? tool;
}

/** The calendar a tool gives an owner to read (BookingToolCalendar); null for one not verified, or not a tool of the list. */
export function bookingToolCalendar(tool: string | null | undefined): BookingToolCalendar | null {
  return BOOKING_TOOLS.find((t) => t.tool === tool)?.calendar ?? null;
}

/** The tool whose domain the address is on (or a subdomain of), or null. */
export function bookingToolOfAddress(address: string | null | undefined): BookingTool | null {
  const a = (address ?? "").trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at < 1) return null;
  const host = a.slice(at + 1);
  for (const t of BOOKING_TOOLS) for (const d of t.domains) if (host === d || host.endsWith(`.${d}`)) return t.tool;
  return null;
}

/** A forward's subject, as mail clients write it in the languages the product meets. */
const FORWARD_SUBJECT = /^\s*(fwd?|fw|tr|wg|rv)\s*:/i;

/**
 * What the intake asks of an email before anything else is read: is this a booking tool writing to the business?
 *
 * Two ways it is. The tool's own sender, which is also what a filter in Gmail or Outlook keeps when it forwards (the
 * From line stays the tool's; the envelope is ours). Or a person's forward by hand (`Fwd:` in the subject, the sender
 * their own address), whose quoted head names the tool as the original sender (`From: Booksy <no-reply@booksy.com>`).
 * A mention of a tool's site in a person's own words ("I found you on booksy.com") is neither: only a quoted From
 * line counts, so a customer's email is never taken for a tool's.
 */
export function bookingNoticeOf(e: {
  from: { address: string } | null;
  subject: string | null;
  text: string | null;
}): { tool: BookingTool; forwarded: boolean } | null {
  const direct = bookingToolOfAddress(e.from?.address);
  if (direct) return { tool: direct, forwarded: false };
  // A forward is a person's: no sender, no forward.
  if (!e.from || !FORWARD_SUBJECT.test(e.subject ?? "") || !e.text) return null;
  // The quoted head of a forward: "From: Name <address>" or "From: address", on its own line, in the first part.
  const head = e.text.slice(0, 4000);
  const m = /^\s*(?:>\s*)?(?:from|de|von)\s*:\s*(?:"?[^<\n]*"?\s*<)?([^\s<>]+@[^\s<>]+)>?/im.exec(head);
  const quoted = m ? bookingToolOfAddress(m[1]) : null;
  return quoted ? { tool: quoted, forwarded: true } : null;
}

/* ------------------------------------------------------------------ what the model answers */

/** What a notice says happened. `other` is a tool's email that is not about one booking (a receipt, a reminder digest). */
const NOTICE_KINDS = ["booked", "changed", "cancelled", "other"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** A local clock time as the notice states it and the model answers it: the business's zone, no offset. */
const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * The one shape a notice is read into, as structured outputs take it: every field named, none optional, the ones a
 * notice may not state nullable. Times are the business's own clock, written without a zone, because that is how the
 * tool writes them and a zone the model guesses is wrong twice a year.
 */
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
        { type: "null" },
      ],
    },
    ends_at: {
      anyOf: [
        { type: "string", description: "YYYY-MM-DDTHH:MM, the business's own clock, no zone." },
        { type: "null" },
      ],
    },
    previous_starts_at: {
      anyOf: [
        { type: "string", description: "For a change only: the time it was before, YYYY-MM-DDTHH:MM." },
        { type: "null" },
      ],
    },
    price: { anyOf: [{ type: "string" }, { type: "null" }] },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
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
    "note",
  ],
  additionalProperties: false,
}))();

/** The most of a notice the model is shown: a tool's email is short, and what follows the booking is its footer. */
const NOTICE_TEXT_MAX = 6000;
/** The most tokens a read may answer with: the shape above, filled, is a few hundred. */
export const NOTICE_READ_MAX_TOKENS = 600;

/**
 * What the reader is told, and what it is shown. The system words are the same for every notice (one prompt hash on
 * the ledger); the user words carry the notice, the day it arrived in the business's zone (so "tomorrow" and a date
 * with no year resolve) and the zone's name.
 */
export function noticePrompt(p: {
  tool: BookingTool;
  subject: string | null;
  text: string;
  tz: string;
  receivedAtMs: number;
}): { system: string; user: string } {
  const system = [
    "You read one email a booking tool sent a business about one of its appointments, and answer in the JSON shape asked.",
    `kind: booked when a client booked or the tool confirms a booking; changed when a booking moved to another time; cancelled when it was cancelled or the client did not show; other when the email is not about one booking (a receipt, a digest, a reminder to the business, marketing), and other when it is written TO THE CLIENT about a booking of their own at a business ('Your appointment at Harbor Studio is confirmed', 'See you tomorrow at 3'): the business's notice names its client as someone else, it never speaks to them.`,
    "client_name, client_phone, client_email: the CLIENT's, as written; never the business's, the staff member's or the tool's own.",
    "service: the service booked, as written (with its category if the tool writes one: 'Hair Color: Partial highlight'). staff: who it is with, as written.",
    "starts_at, ends_at: the appointment's start and end on the business's own clock as YYYY-MM-DDTHH:MM, from the date and the time range the email states. For a change, the NEW time; previous_starts_at is the old one. ends_at null when no end is stated.",
    "price: as written ('$55.00+', 'Varies'), null when none. note: the client's own note, null when none.",
    "Take only what the email states. Invent nothing; a field the email does not state is null.",
  ].join("\n");
  const user = [
    `Booking tool: ${bookingToolName(p.tool)}.`,
    `Received on ${dayInZone(p.tz, p.receivedAtMs).key}; the business's zone is ${p.tz}.`,
    `Subject: ${p.subject ?? "(none)"}`,
    "",
    p.text.slice(0, NOTICE_TEXT_MAX),
  ].join("\n");
  return { system, user };
}

/* ------------------------------------------------------------------ the answer, held to its shape */

/** Why a read is held for a person rather than written as a booking. The words the row keeps and the board says. */
const NOTICE_HOLDS = [
  "no_model",
  "may_not_spend",
  "unreadable",
  "not_a_booking",
  "no_time",
  "no_client",
  // The provider no longer had the email when the read ran: nothing could be read, and the delivery is still on the ledger.
  "gone",
] as const;
export type NoticeHold = (typeof NOTICE_HOLDS)[number];
export const isNoticeHold = (v: unknown): v is NoticeHold => (NOTICE_HOLDS as readonly unknown[]).includes(v);

/** The booking a notice states, read strictly. Instants are epoch ms in the business's zone. */
export interface NoticeReading {
  kind: Exclude<NoticeKind, "other">;
  client: { name: string | null; phone: string | null; email: string | null };
  service: string | null;
  staff: string | null;
  start: number;
  end: number;
  /** A change's old start; null otherwise. */
  previousStart: number | null;
  price: string | null;
  note: string | null;
}

/** How long a booking is taken to last when the notice states no end: the slot most salons book by. */
export const NOTICE_DEFAULT_LENGTH_MS = HOUR_MS;
/**
 * The longest one visit a notice may state. An end further off is a misread (or words in the email meant for the
 * reader): written as it stands, one row would be taken time for every day it spans, and no open time would be named.
 */
const NOTICE_LENGTH_MAX_MS = 12 * HOUR_MS;
/** A number as the appointments table keeps one (00345's check): a plus, no leading zero, seven to fifteen digits. */
const E164 = /^\+[1-9][0-9]{6,14}$/;
/** A time further from now than this is a misread, not a booking. */
const NOTICE_TIME_REACH_MS = 400 * DAY_MS;
/** The most of a free-text field the row keeps. */
const NOTICE_FIELD_MAX = 200;
const NOTICE_NOTE_MAX = 1000;

function localMs(tz: string, v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = LOCAL_TIME.exec(v.trim());
  if (!m) return null;
  // The pattern's five groups, each read as a number: one the match lacked is NaN, which no bound below admits.
  const part = (i: number) => Number(m[i]);
  const y = part(1);
  const mo = part(2);
  const d = part(3);
  const hh = part(4);
  const mm = part(5);
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && hh <= 23 && mm <= 59)) return null;
  // A day its month does not have (31 February) is no date: read on, it would roll into the month after.
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return null;
  const ms = localToUtcMs(tz, y, mo, d, hh, mm);
  return Number.isFinite(ms) ? ms : null;
}

function trimmedText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

/**
 * The model's answer as a booking, or why it is not one. Strict: a kind outside the set, a start the clock cannot
 * read, a client with no name, number or address, or a time a year off are each held with a reason, never guessed at.
 */
export function noticeAnswerOf(
  answer: unknown,
  tz: string,
  nowMs: number,
): { reading: NoticeReading; hold: null } | { reading: null; hold: NoticeHold } {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return { reading: null, hold: "unreadable" };
  const a = answer as Record<string, unknown>;
  const kind = a.kind;
  if (kind === "other") return { reading: null, hold: "not_a_booking" };
  if (kind !== "booked" && kind !== "changed" && kind !== "cancelled") return { reading: null, hold: "unreadable" };
  const start = localMs(tz, a.starts_at);
  if (start === null || Math.abs(start - nowMs) > NOTICE_TIME_REACH_MS) return { reading: null, hold: "no_time" };
  const endRead = localMs(tz, a.ends_at);
  // An end before its start is the tool's midnight or a misread, and so is one half a day off: the default length.
  const end =
    endRead !== null && endRead > start && endRead - start <= NOTICE_LENGTH_MAX_MS
      ? endRead
      : start + NOTICE_DEFAULT_LENGTH_MS;
  // A number the table would refuse (a national one written with its leading zero) is no number: the visit is kept
  // by the name and the address, where the row's check would have thrown the whole notice away.
  const phone = normalizePhone(typeof a.client_phone === "string" ? a.client_phone : null);
  const client = {
    name: trimmedText(a.client_name, NOTICE_FIELD_MAX),
    phone: phone && E164.test(phone) ? phone : null,
    email: normalizeEmail(typeof a.client_email === "string" ? a.client_email : null),
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
      note: trimmedText(a.note, NOTICE_NOTE_MAX),
    },
    hold: null,
  };
}

/* ------------------------------------------------------------------ the row's identity */

/** The client as the key names them: the number, else the address, else the name folded. */
export function clientKeyOf(client: { name: string | null; phone: string | null; email: string | null }): string {
  if (client.phone) return client.phone;
  if (client.email) return client.email.toLowerCase();
  return (client.name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * One visit's identity across notices: the tool, the client and the start, so a notice delivered twice, a forward and
 * the tool's own copy, or a change that names the same new time, meet the one row (appointments_source_uq). A start
 * is kept to the minute: the tool writes minutes, and two notices for one visit never disagree by seconds.
 */
export function appointmentKey(
  tool: string,
  client: { name: string | null; phone: string | null; email: string | null },
  startMs: number,
): string {
  return `${tool}:${clientKeyOf(client)}:${Math.floor(startMs / MIN_MS) * MIN_MS}`;
}

/*
 * When two sightings of a visit are one visit (decision 0002): a booking tool that both emails the owner and writes their
 * calendar puts the same visit on the record twice, once as the booking's own row (booking_email, booking_tool) and once
 * as the calendar feed's. The board draws it once (appointment-item.ts withoutVisitsRowsDraw), the hourly sweep marks the
 * feed's copy so the bell does not tell it again (feed-appointments.ts, `twin`), and a visit told as one sighting is not
 * told again as the other (packages/db twinTold). One rule for all three, here; and the pools that say a person's
 * visits (calendar-people.ts personVisits) fold a copy by its person by the same nearness (sameVisitStart).
 *
 * Two sightings are one visit when they are the same client's and start within SAME_VISIT_MS (calendar-people.ts) of
 * each other. A calendar's event says its client by the number or the address in it (the way the panel finds them,
 * extractContacts); a row of the record by the person it is linked to. The board folds by the number or the address
 * alone, since it matches no event to a person before it draws; the sweep, which has, also by the person. So a copy that
 * names its client only by name is one visit on the bell and two on the board.
 */

/** A booking's row as the rule reads it: its client's number and address, the person it is linked to, and its start. */
export interface BookingSighting {
  client_phone: string | null;
  client_email: string | null;
  contact_id: string | null;
  /** An ISO instant. */
  starts_at: string;
}

/** A visit on the record as the rule reads it: the person it is linked to, and its start. */
export interface VisitOnRecord {
  contact_id: string | null;
  /** An ISO instant. */
  starts_at: string;
}

const near = (starts: readonly number[] | undefined, at: number): boolean =>
  !!starts?.some((s) => sameVisitStart(s, at));

/**
 * Whether two visits on the record are one: linked to the same person, and starting within SAME_VISIT_MS of each other.
 * A visit linked to nobody is no other visit's: the record cannot say whose it is.
 */
export function sameVisitOnRecord(a: VisitOnRecord, b: VisitOnRecord): boolean {
  return (
    !!a.contact_id && a.contact_id === b.contact_id && sameVisitStart(Date.parse(a.starts_at), Date.parse(b.starts_at))
  );
}

/**
 * The test of whether a calendar's event is a copy of one of these bookings, or null when none of them can have one: the
 * event carries a booking's number or address and starts within SAME_VISIT_MS of it, or (given the person the sweep
 * matched it to) is that booking's person's and starts as near. Built once for a read of many events.
 */
export function bookingCopyTest(
  bookings: readonly BookingSighting[],
  own: OwnAddresses,
): ((item: FeedItem, contactId?: string | null) => boolean) | null {
  if (!bookings.length) return null;
  const byPhone = new Map<string, number[]>();
  const byEmail = new Map<string, number[]>();
  const byPerson = new Map<string, number[]>();
  const add = (m: Map<string, number[]>, k: string, at: number) => m.set(k, [...(m.get(k) ?? []), at]);
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
    return (
      c.phones.some((p) => near(byPhone.get(p), item.start)) ||
      c.emails.some((e) => near(byEmail.get(e.toLowerCase()), item.start))
    );
  };
}

/* ------------------------------------------------------------------ the tool the owner names, and its steps */

/** The picker's choices: each tool by the name the product says it, in BOOKING_TOOL_IDS' order. */
export function bookingToolOptions(): Array<{ value: BookingTool; label: string }> {
  return BOOKING_TOOLS.map((t) => ({ value: t.tool, label: t.name }));
}

/** How a tool's booking emails reach the workspace's address: a recipient the tool takes, or a forward. */
export type BookingToolWay = "recipient" | "forward";

/**
 * What an owner does once, per tool, so the tool's booking emails reach the workspace's address: the tools that take a
 * second address take it in their own notification settings; the rest email only the account they were signed up
 * with, so one filter in Gmail or Outlook forwards those on. Verified against each tool's help centre, 6 October 2026
 * (docs/2026-10-06-chanlytics-calendar-wiring.md); a tool not verified says the forward, which always works.
 */
export const BOOKING_TOOL_STEPS: Record<BookingTool, { way: BookingToolWay; steps: readonly string[] }> = {
  acuity: {
    way: "recipient",
    steps: [
      "In Acuity, open the calendar your bookings land on, then Calendar notifications.",
      "Under “Send booking notifications to”, add the address above beside your own.",
    ],
  },
  fresha: {
    way: "recipient",
    steps: [
      "In Fresha, open Settings › Scheduling › Online bookings › Notifications, then Edit.",
      "Add the address above to the emails that get booked, rescheduled and cancelled bookings.",
    ],
  },
  booksy: {
    way: "forward",
    steps: [
      "Open the inbox your Booksy account emails: its booking emails arrive there.",
      "Make a filter for mail from no-reply@booksy.com that forwards to the address above.",
    ],
  },
  square: {
    way: "forward",
    steps: [
      "In Square, under Team members › your name › Booking notifications, keep email on.",
      "In that inbox, make a filter for Square's booking emails that forwards to the address above.",
    ],
  },
  vagaro: {
    way: "forward",
    steps: [
      "In Vagaro, under Settings › Booking › Email & Text Notifications, keep employee email notifications on.",
      "In that inbox, make a filter for mail from vagaro.com that forwards to the address above.",
    ],
  },
  glossgenius: {
    way: "forward",
    steps: [
      "In GlossGenius, under your personal notifications, keep booking emails on (they go to whoever is booked).",
      "In that inbox, make a filter for mail from glossgenius.com that forwards to the address above.",
    ],
  },
  calendly: {
    way: "forward",
    steps: [
      "Open the inbox Calendly emails your bookings to (each host gets their own).",
      "Make a filter for mail from calendly.com that forwards to the address above.",
    ],
  },
  setmore: {
    way: "forward",
    steps: ["In the inbox Setmore emails, make a filter for mail from setmore.com that forwards to the address above."],
  },
  mindbody: {
    way: "forward",
    steps: [
      "In the inbox Mindbody emails, make a filter for mail from mindbodyonline.com that forwards to the address above.",
    ],
  },
  simplybook: {
    way: "forward",
    steps: [
      "In the inbox SimplyBook emails, make a filter for mail from simplybook.me that forwards to the address above.",
    ],
  },
  schedulicity: {
    way: "forward",
    steps: [
      "In the inbox Schedulicity emails, make a filter for mail from schedulicity.com that forwards to the address above.",
    ],
  },
  styleseat: {
    way: "forward",
    steps: [
      "In the inbox StyleSeat emails, make a filter for mail from styleseat.com that forwards to the address above.",
    ],
  },
};

/** The one sentence after a filter is made: Gmail asks the address to confirm, and the fold shows the code and a press. */
export const GMAIL_FORWARD_NOTE =
  "If that inbox is Gmail, it asks once to confirm the forward: the code and a one-press confirm appear here.";

/**
 * The way to see it work at once: a forward by hand, trusted when it comes from a member's own address (core
 * email-ingest, member_has_address), so the first appointment is on the board before any filter is.
 */
export const BOOKING_TRY_NOTE =
  "To try it now, forward any past booking email to the address above, from the email you sign in with.";

/* ------------------------------------------------------------------ a held notice, in words */

/**
 * Why a notice is held, as a person reads it on the card. A held notice is read again only when a person presses Read
 * again (the job ends on a hold, it does not retry), so each sentence says what to do, never that it will happen.
 */
export const NOTICE_HOLD_WORDS: Record<NoticeHold, string> = {
  no_model: "The reader was unavailable. Press Read again.",
  may_not_spend: "The workspace's AI spend is paused. Read again once it is on.",
  unreadable: "It could not be read as a booking.",
  // Kept on the ledger and set aside, never held: nobody is asked to look at a tool's receipt or its newsletter. A
  // cancellation the visit's guard refused is set aside under this reason too, until the ledger has a word of its own
  // (core ledgerOutcomeOf), so this sentence is not true of every row set aside with it.
  not_a_booking: "It is from your booking tool, but not about one booking.",
  no_time: "No time for the booking could be read from it.",
  no_client: "No client could be read from it.",
  gone: "The email was gone before it could be read.",
};

/* ------------------------------------------------------------------ Gmail's forwarding confirmation */

/** Google's own sender for a forwarding confirmation. */
const GMAIL_FORWARDING_SENDER = /^forwarding-noreply@google\.com$/i;

/**
 * Gmail's confirmation that it may forward an account's mail here: "(#12345678) Gmail Forwarding Confirmation - Receive
 * Mail from someone@gmail.com", a link to press and the code to paste. Null for any other email. The link is the first
 * address Google's mail settings answer on; the code is the subject's, else the "Confirmation code:" line's.
 */
export function forwardingConfirmationOf(e: {
  from: { address: string } | null;
  subject: string | null;
  text: string | null;
}): { account: string; code: string; link: string | null } | null {
  if (!e.from || !GMAIL_FORWARDING_SENDER.test(e.from.address.trim())) return null;
  const subject = e.subject ?? "";
  if (!/forwarding confirmation/i.test(subject)) return null;
  const text = e.text ?? "";
  const code = /\(#(\d{5,12})\)/.exec(subject)?.[1] ?? /confirmation code:\s*(\d{5,12})/i.exec(text)?.[1] ?? null;
  const account =
    /receive mail from\s+([^\s<>]+@[^\s<>]+)/i.exec(subject)?.[1] ??
    /([^\s<>]+@[^\s<>]+)\s+has requested to automatically forward/i.exec(text)?.[1] ??
    null;
  if (!code || !account) return null;
  const link = /https:\/\/[a-z0-9.-]*\.google\.com\/mail\/vf-[^\s<>")]+/i.exec(text)?.[0] ?? null;
  return { account: account.toLowerCase(), code, link };
}
