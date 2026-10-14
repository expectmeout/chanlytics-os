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
import { neverConnected, type CallDto } from "../conversations/call-dto";
import { isTheirOwnWords, writtenChannelOf } from "../conversations/thread-channel";
import { messageAt, type MessageDto } from "../conversations/thread-dto";
import { CONSENT_CHANNEL_WORDS } from "../consent/consent-channels";
import type { PersonDetailDto } from "../people/person-dto";
import type { PersonCameFrom } from "../people/person-words";
import { clockDate } from "../shared/clock";
import { samePhone } from "../shared/phone";
import { ORIGIN_WORDS, REACH_SOURCE_WORDS } from "./words";

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
export function contactEvidenceOf(d: PersonDetailDto, first: ContactEvidence["first"]): ContactEvidence {
  const reachOut = d.lead?.reach_out ?? null;
  return {
    phone: d.row.phone_e164,
    email: d.row.email,
    first,
    calls: d.calls,
    messages: d.conversations.flatMap((c) => c.messages),
    added: d.added ? { source: d.added.source, ms: moment(d.added.at) } : null,
    listing: d.business ? { phone: d.business.lead.phone, email: d.business.lead.email } : null,
    lead: d.lead
      ? {
          foundMs: moment(d.lead.found_at),
          // A list of the owner's own (00242), never a company the people card found, which no listing named either.
          ownList: reachOut?.source ? reachOut.source === "import" : reachOut?.found_on_listing === false,
          firstSendMs: earliest((reachOut?.sends ?? []).map((x) => moment(x.sent_at))),
        }
      : null,
  };
}

const moment = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

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
      .map((m) => moment(messageAt(m))),
  );
}

/** The first call they placed from this number that reached anyone (people_list's own "reached out"). */
function firstCalled(e: ContactEvidence): number | null {
  return earliest(
    e.calls
      .filter((k) => k.direction === "inbound" && !neverConnected(k) && samePhone(k.from_e164, e.phone))
      .map((k) => moment(k.started_at)),
  );
}

/** People's exact first contact, where it came by one of these wires: a day the newest rows may have dropped. */
function exactFirst(e: ContactEvidence, wires: readonly PersonCameFrom[]): number | null {
  return e.first.ts !== null && !e.first.estimate && e.first.cameFrom && wires.includes(e.first.cameFrom)
    ? e.first.ts
    : null;
}

/** The line under their number and under their address (REACH_SOURCE_WORDS), each by its evidence. */
export function reachRowsOf(e: ContactEvidence, tz: string, nowMs: number): { phone: string; email: string } {
  const day = (t: number) => clockDate(t, tz, nowMs);
  const P = REACH_SOURCE_WORDS.phone;
  const E = REACH_SOURCE_WORDS.email;
  const called = earliest([firstCalled(e), exactFirst(e, ["call"])]);
  const wrote = earliest([firstWrote(e.messages, ["whatsapp", "sms"]), exactFirst(e, ["whatsapp", "sms"])]);
  const phone =
    called !== null && (wrote === null || called <= wrote)
      ? P.called(day(called))
      : wrote !== null
        ? P.wrote(day(wrote))
        : e.added?.source === "calendar"
          ? P.booking
          : e.listing && samePhone(e.listing.phone, e.phone)
            ? P.listing
            : P.none;
  const address = e.email?.trim().toLowerCase() ?? "";
  const emailed = earliest([firstWrote(e.messages, ["email"]), exactFirst(e, ["email"])]);
  const gave = address
    ? earliest(
        e.calls
          .filter((k) => k.direction === "inbound" && k.caller_email?.trim().toLowerCase() === address)
          .map((k) => moment(k.started_at)),
      )
    : null;
  const email =
    emailed !== null
      ? E.wrote(day(emailed))
      : gave !== null
        ? E.gaveOnCall(day(gave))
        : address && e.listing?.email?.trim().toLowerCase() === address
          ? E.listing
          : E.none;
  return { phone, email };
}

/** The call or message at their first contact, where it was ours: we called, or wrote first, and on which wire. */
function oursFirst(e: ContactEvidence): { call: true } | { on: string } | null {
  const at = e.first.ts;
  if (at === null || e.first.estimate) return null;
  const call = e.calls.find((k) => moment(k.started_at) === at);
  if (call) return call.direction === "outbound" ? { call: true } : null;
  const m = e.messages.find((x) => moment(messageAt(x)) === at);
  return m && m.direction === "outbound" ? { on: CONSENT_CHANNEL_WORDS[writtenChannelOf(m.channel)] } : null;
}

const firstLowered = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;

/**
 * Where they came from, in one line (ORIGIN_WORDS), or null where nothing says: the wire they first reached you on and
 * its day (People's own first contact); a door's name and the day it added them; a lead's finding and our first email.
 */
export function personOriginOf(e: ContactEvidence, tz: string, nowMs: number): string | null {
  const from = e.first.cameFrom;
  if (!from) return null;
  const day = (t: number | null) => (t !== null ? clockDate(t, tz, nowMs) : null);
  const W = ORIGIN_WORDS;
  if (from === "call" || from === "whatsapp" || from === "sms" || from === "email") {
    if (e.first.ts === null) return null;
    const when = firstLowered(e.first.label);
    const ours = oursFirst(e);
    if (ours) return "call" in ours ? W.weCalledFirst(when) : W.weWroteFirstOn(ours.on, when);
    return W[from](when);
  }
  if (from === "lead") {
    const found = day(e.lead?.foundMs ?? e.added?.ms ?? null);
    if (!found) return null;
    const said = e.lead?.ownList ? W.ownList(found) : W.lead(found);
    const wrote = day(e.lead?.firstSendMs ?? null);
    return wrote ? `${said} · ${W.weWroteFirst(wrote)}` : said;
  }
  const added = day(e.added?.ms ?? null) ?? (e.first.ts !== null ? firstLowered(e.first.label) : null);
  return added ? W[from](added) : null;
}
