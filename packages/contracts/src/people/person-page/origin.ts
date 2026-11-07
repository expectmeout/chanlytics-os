/**
 * Where a person's number and address came from, and where they themselves came from (canvas A, C3: Reach them and
 * "Where they came from"). Read from the rows the person read already holds: their calls and their own words, the door
 * that added them (contact.added), the listing of the business they work at, and People's own first contact for them
 * (people_list's came_from and first_contact_at, the one origin rule; the page never derives a second).
 *
 * A source is evidence first: they called from the number, or wrote from it or from the address, on the day of the
 * first; else the door it came in by (the booking, the listing); else the word alone. The person read holds their
 * newest calls and messages, so where People's first contact is exact for a wire it lowers that wire's day to it.
 */
import { neverConnected, type CallDto } from "../../conversations/call-dto";
import { isTheirOwnWords, writtenChannelOf, type WrittenChannel } from "../../conversations/thread-channel";
import { messageAt, type MessageDto } from "../../conversations/thread-dto";
import { CONSENT_CHANNEL_WORDS } from "../../consent/channels";
import type { PersonBeforeDto, PersonDetailDto } from "../person-dto";
import { viaWords } from "../../imports/csv";
import type { PersonCameFrom } from "../person-words";
import { clockDate } from "../../shared/clock";
import { formatterOnUse, isoMs } from "../../shared/time";
import { samePhone } from "../../shared/phone";
import { BEFORE_WORDS, ORIGIN_WORDS, REACH_SOURCE_WORDS } from "./words";

/** What the sources and the origin are read from: the person read's own rows, narrowed. */
interface ContactEvidence {
  phone: string | null;
  email: string | null;
  /** People's first contact for them: its moment, its words ("Jul 14", "Before Aug 27") and the wire it came by. */
  first: { ts: number | null; label: string; estimate: boolean; cameFrom: PersonCameFrom | null };
  calls: readonly Pick<CallDto, "direction" | "status" | "from_e164" | "started_at" | "caller_email">[];
  messages: readonly MessageDto[];
  /** The door that added them (contact.added): its source and when; null where they came by writing or calling. */
  added: { source: string; ms: number | null } | null;
  /** The listing of the business they work at, as the lead holds it. */
  listing: { phone: string | null; email: string | null } | null;
  /** The lead they were found as: when, whether a list of the owner's own brought it, and the reach-out's first send. */
  lead: { foundMs: number | null; ownList: boolean; firstSendMs: number | null } | null;
}

/** The evidence, from the person read and People's first contact for them (the row's own, made exact by the read). */
export function contactEvidenceOf(personDetail: PersonDetailDto, first: ContactEvidence["first"]): ContactEvidence {
  const reachOut = personDetail.lead?.reach_out ?? null;
  return {
    phone: personDetail.row.phone_e164,
    email: personDetail.row.email,
    first,
    calls: personDetail.calls,
    messages: personDetail.conversations.flatMap((c) => c.messages),
    added: personDetail.added ? { source: personDetail.added.source, ms: isoMs(personDetail.added.at) } : null,
    listing: personDetail.business
      ? { phone: personDetail.business.lead.phone, email: personDetail.business.lead.email }
      : null,
    lead: personDetail.lead
      ? {
          foundMs: isoMs(personDetail.lead.found_at),
          // A list of the owner's own (00242), never a company the people card found, which no listing named either.
          ownList: reachOut?.source ? reachOut.source === "import" : reachOut?.found_on_listing === false,
          firstSendMs: earliest((reachOut?.sends ?? []).map((x) => isoMs(x.sent_at))),
        }
      : null,
  };
}

const earliest = (xs: readonly (number | null)[]): number | null => {
  const ok = xs.filter((x): x is number => x !== null);
  return ok.length ? Math.min(...ok) : null;
};

/** A moved-in row with no time of its own is not a day anyone wrote (people_list's message_moment leaves it out too). */
const undated = (m: MessageDto): boolean => m.meta?.backfill === true && !m.channel_ts;

/** The first of their own words on the given wires, by the channel's clock. */
function firstWrote(messages: readonly MessageDto[], wires: readonly string[]): number | null {
  return earliest(
    messages
      .filter((m) => isTheirOwnWords(m) && wires.includes(writtenChannelOf(m.channel)) && !undated(m))
      .map((m) => isoMs(messageAt(m))),
  );
}

/** The first call they placed from this number that reached anyone (people_list's own "reached out"). */
function firstCalled(e: ContactEvidence): number | null {
  return earliest(
    e.calls
      .filter((k) => k.direction === "inbound" && !neverConnected(k) && samePhone(k.from_e164, e.phone))
      .map((k) => isoMs(k.started_at)),
  );
}

/** People's exact first contact, where it came by one of these wires: a day the newest rows may have dropped. */
function exactFirst(e: ContactEvidence, wires: readonly PersonCameFrom[]): number | null {
  return e.first.ts !== null && !e.first.estimate && e.first.cameFrom && wires.includes(e.first.cameFrom)
    ? e.first.ts
    : null;
}

/** The line under their number and under their address (REACH_SOURCE_WORDS), each by its evidence. */
export function reachRowsOf(
  contactEvidence: ContactEvidence,
  tz: string,
  nowMs: number,
): { phone: string; email: string } {
  const day = (t: number) => clockDate(t, tz, nowMs);
  const otherPhone = REACH_SOURCE_WORDS.phone;
  const otherEmail = REACH_SOURCE_WORDS.email;
  const called = earliest([firstCalled(contactEvidence), exactFirst(contactEvidence, ["call"])]);
  const wrote = earliest([
    firstWrote(contactEvidence.messages, ["whatsapp", "sms"]),
    exactFirst(contactEvidence, ["whatsapp", "sms"]),
  ]);
  const phone =
    called !== null && (wrote === null || called <= wrote)
      ? otherPhone.called(day(called))
      : wrote !== null
        ? otherPhone.wrote(day(wrote))
        : contactEvidence.added?.source === "calendar"
          ? otherPhone.booking
          : contactEvidence.listing && samePhone(contactEvidence.listing.phone, contactEvidence.phone)
            ? otherPhone.listing
            : otherPhone.none;
  const address = contactEvidence.email?.trim().toLowerCase() ?? "";
  const emailed = earliest([firstWrote(contactEvidence.messages, ["email"]), exactFirst(contactEvidence, ["email"])]);
  const given = address
    ? earliest(
        contactEvidence.calls
          .filter((k) => k.direction === "inbound" && k.caller_email?.trim().toLowerCase() === address)
          .map((k) => isoMs(k.started_at)),
      )
    : null;
  const email =
    emailed !== null
      ? otherEmail.wrote(day(emailed))
      : given !== null
        ? otherEmail.gaveOnCall(day(given))
        : address && contactEvidence.listing?.email?.trim().toLowerCase() === address
          ? otherEmail.listing
          : otherEmail.none;
  return { phone, email };
}

/** The call or message at their first contact, where it was ours: we called, or wrote first, and on which wire. */
function oursFirst(e: ContactEvidence): { call: true } | { on: string } | null {
  const at = e.first.ts;
  if (at === null || e.first.estimate) return null;
  const call = e.calls.find((k) => isoMs(k.started_at) === at);
  if (call) return call.direction === "outbound" ? { call: true } : null;
  const m = e.messages.find((x) => isoMs(messageAt(x)) === at);
  return m && m.direction === "outbound" ? { on: FIRST_WRITTEN_ON[writtenChannelOf(m.channel)] } : null;
}

/** How our first written words went, in a sentence: as a yes is said for the three a yes covers, and a DM by its own words. */
const FIRST_WRITTEN_ON: Record<WrittenChannel, string> = { ...CONSENT_CHANNEL_WORDS, instagram: "by Instagram DM" };

const firstLowered = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;

/**
 * Where they came from, in one line (ORIGIN_WORDS), or null where nothing says: the wire they first reached you on and
 * its day (People's own first contact); a door's name and the day it added them; a lead's finding and our first email.
 */
export function personOriginOf(contactEvidence: ContactEvidence, tz: string, nowMs: number): string | null {
  const from = contactEvidence.first.cameFrom;
  if (!from) return null;
  const day = (t: number | null) => (t !== null ? clockDate(t, tz, nowMs) : null);
  const words = ORIGIN_WORDS;
  if (from === "call" || from === "whatsapp" || from === "sms" || from === "email") {
    if (contactEvidence.first.ts === null) return null;
    const when = firstLowered(contactEvidence.first.label);
    const ours = oursFirst(contactEvidence);
    if (ours) return "call" in ours ? words.weCalledFirst(when) : words.weWroteFirstOn(ours.on, when);
    return words[from](when);
  }
  if (from === "lead") {
    const found = day(contactEvidence.lead?.foundMs ?? contactEvidence.added?.ms ?? null);
    if (!found) return null;
    const sentence = contactEvidence.lead?.ownList ? words.ownList(found) : words.lead(found);
    const wrote = day(contactEvidence.lead?.firstSendMs ?? null);
    return wrote ? `${sentence} · ${words.weWroteFirst(wrote)}` : sentence;
  }
  const added =
    day(contactEvidence.added?.ms ?? null) ??
    (contactEvidence.first.ts !== null ? firstLowered(contactEvidence.first.label) : null);
  return added ? words[from](added) : null;
}

/** A birthday as its month and day ("Mar 14"): the year, where a file had one, is not the page's to say. */
const MONTH_DAY = formatterOnUse("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * What another system said of them before Chanlytics, in one line (BEFORE_WORDS), or null where it said nothing: the
 * visits it counted, the last one, their birthday, and the file it came from. A file's day is a calendar day, read at
 * noon UTC so no zone moves it.
 */
export function personBeforeOf(before: PersonBeforeDto | null | undefined, nowMs: number): string | null {
  if (!before) return null;
  const words = BEFORE_WORDS;
  const [, mm, dd] = (before.birthday ? /(\d{2})-(\d{2})$/.exec(before.birthday) : null) ?? [];
  const parts = [
    before.visits !== undefined && before.visits > 0 ? words.visits(before.visits) : null,
    before.last_visit ? words.last(clockDate(Date.parse(`${before.last_visit}T12:00:00Z`), "UTC", nowMs)) : null,
    mm && dd ? words.birthday(MONTH_DAY.format(new Date(Date.UTC(2000, +mm - 1, +dd)))) : null,
  ].filter((x): x is string => !!x);
  if (!parts.length) return null;
  return [words.label, ...parts, words.from(viaWords(before.via ?? null))].join(" · ");
}
