/**
 * How a member may write to one person now, wire by wire (a conversation begins from the Inbox): WhatsApp, a text and an
 * email, each with whether a message can go by it, why not, what it carries, and whether it would be the first thing the
 * person hears from the business there. THE one statement of it: the sheet draws its answer, the route that sends asks it
 * again before anything is queued, and the send door asks the same predicate at the wire (consent.ts mayMessageFor).
 *
 * A message STARTS on a wire when the person has never been heard on it: they last wrote somewhere else, or nowhere, and
 * on a phone's wire they have not called within the month either (someone who phoned is answered at the number they
 * called from, as the call's own booking link is: Ruben's decision of 10 Sep 2026; a month on, People's own line for
 * "quiet", that call is no longer being answered). A start asks what a start always asked: their recorded
 * yes covering that wire on WhatsApp and by text; by email only an address, unless the business has no history with
 * them at all, in which case an email of its own choosing is an offer (consent.ts isOfferByEmail) and goes from Campaigns.
 */
import {
  isOfferByEmail,
  isOptedOutContact,
  mayMessageFor,
  PURPOSE_REFUSALS,
  relationshipOnRecord,
  type MessageAbout,
  type PurposeBearing,
} from "../consent/consent";
import { CONSENT_CHANNELS, CONSENT_CHANNEL_WORDS, type ConsentChannel } from "../consent/consent-channels";
import { STOP_WORDS } from "../consent/consent";
import { replyWindow } from "../config/policy";
import type { ChannelsReady } from "../broadcasts/reach-for";
import type { PersonRowDto } from "../people/person-dto";
import { personName } from "../people/person-name";
import { QUIET_AFTER_DAYS } from "../people/person-state";
import { DAY_MS, HOUR_MS } from "../shared/time";
import { firstNameOf } from "../templates/templates";
import { NEW_CONVERSATION_WORDS } from "./new-conversation-words";
import type { PersonReachDto } from "./person-draft";

/**
 * What the rule reads of a person: People's own row, as the wire carries it (people_list), with their thread where they
 * have one, which a conversation's beginning asks before a first email (core begin.ts: a subject, or one to go under).
 */
export type WriteRow = Pick<
  PersonRowDto,
  | "phone_e164"
  | "email"
  | "email_suppressed_at"
  | "consent"
  | "dnc"
  | "marketing_consent"
  | "consent_channels"
  | "marketing_channels"
  | "email_marketing"
  | "last_inbound_channel"
  | "last_wrote_at"
  | "last_inbound_call_at"
  | "latest_wa_inbound_at"
  | "deal_id"
  | "latest_conversation_id"
>;

/** Why a message cannot go by a wire: a closed set, so a reason cannot reach the sheet without its words. */
export const WRITE_HOLDS = [
  "stopped",
  "no_number",
  "no_address",
  "address_stopped",
  "not_ready",
  "no_history",
  "unsubscribed",
  "no_yes",
] as const;
export type WriteHold = (typeof WRITE_HOLDS)[number];

export interface WriteWay {
  wire: ConsentChannel;
  /** A message can go by it now. */
  ok: boolean;
  hold: WriteHold | null;
  /** Why not, in the owner's words; null where it can. */
  why: string | null;
  /** What it carries: the member's own words, or only a message WhatsApp approved ahead of time. */
  carries: "words" | "approved";
  /** It would be the first thing they hear from the business on this wire. */
  starts: boolean;
  /** What a message to them is about (consent.ts MessageAbout): theirs once they have dealt with the business. */
  about: MessageAbout;
  /** WhatsApp's window for the member's own words, in whole hours left; null where there is none. */
  hours_left: number | null;
}

const heardWire = (c: string | null | undefined): ConsentChannel | null =>
  c === "whatsapp" || c === "sms" || c === "email" ? c : null;

/**
 * How long a call they placed counts as being heard from on a phone's wire: People's own line for "quiet"
 * (person-state.ts QUIET_AFTER_DAYS). A text or a WhatsApp message back inside it answers their call, as the booking
 * link sent during one does; after it, a message starts there, and asks the yes a start asks. Where they wrote is not
 * bounded: a reply goes where they wrote, as the thread's own box has always sent one.
 */
const HEARD_BY_CALL_MS = QUIET_AFTER_DAYS * DAY_MS;

/**
 * Whether a message by this wire would start there: they have not written on it, and on a phone's wire have not
 * called within the month.
 */
export function startsOn(
  wire: ConsentChannel,
  heard: { lastWrote: ConsentChannel | null; calledAt: string | null },
  now: Date,
): boolean {
  const called = !!heard.calledAt && now.getTime() - Date.parse(heard.calledAt) <= HEARD_BY_CALL_MS;
  return !(heard.lastWrote === wire || (wire !== "email" && called));
}

/** The words for each hold. A wire the workspace cannot send on says the workspace's own reason (reach-for.ts CHANNEL_WORDS). */
export const WRITE_HOLD_WORDS: Record<Exclude<WriteHold, "not_ready">, (wire: ConsentChannel) => string> = {
  stopped: () => `${STOP_WORDS.said("They")}.`,
  no_number: () => "No number on their page.",
  no_address: () => "No email address on their page.",
  address_stopped: () => "Email to their address has stopped.",
  no_history: () =>
    "A first email to someone with no history with you goes from Campaigns, with its way to unsubscribe.",
  // The send door's own sentence for it (consent.ts), so the sheet and a refused row say the same thing.
  unsubscribed: () => PURPOSE_REFUSALS.unsubscribed,
  no_yes: (wire) => `No yes on record for messages ${CONSENT_CHANNEL_WORDS[wire]}.`,
};

/** What a wire is judged against: the person's standing, what the workspace can send on, and what the message is. */
interface Judged {
  bearing: PurposeBearing;
  ready: ChannelsReady;
  starts: boolean;
  about: MessageAbout;
}

function holdOf(wire: ConsentChannel, r: WriteRow, { bearing, ready, starts, about }: Judged): WriteHold | null {
  if (isOptedOutContact(bearing)) return "stopped";
  if (wire === "email") {
    if (!r.email) return "no_address";
    if (r.email_suppressed_at) return "address_stopped";
  } else if (!r.phone_e164) return "no_number";
  if (!ready[wire].ready) return "not_ready";
  if (isOfferByEmail({ channel: wire, purpose: "conversational", proactive: starts, about })) return "no_history";
  // The one predicate, told this is a person's own message and whether it begins there (`begins`): the send door asks
  // it the same way at the wire (core deliver.ts).
  const may = mayMessageFor(bearing, "conversational", { proactive: starts, channel: wire, about, begins: starts });
  if (may.ok) return null;
  return may.reason === "unsubscribed" ? "unsubscribed" : "no_yes";
}

/** Every wire, in the house order (WhatsApp, text, email), as a message to this person stands on it now. */
export function writeWaysOf(r: WriteRow, ready: ChannelsReady, now: Date = new Date()): WriteWay[] {
  const relationship = relationshipOnRecord({
    lastWroteAt: r.last_wrote_at,
    lastInboundCallAt: r.last_inbound_call_at,
    hasDeal: !!r.deal_id,
  });
  const about: MessageAbout = relationship ? "theirs" : "ours";
  const bearing: PurposeBearing = {
    consent: r.consent,
    dnc: r.dnc,
    marketing_consent: r.marketing_consent,
    consent_channels: r.consent_channels,
    marketing_channels: r.marketing_channels,
    email_marketing: r.email_marketing,
    has_relationship: relationship,
  };
  const heard = { lastWrote: heardWire(r.last_inbound_channel), calledAt: r.last_inbound_call_at ?? null };
  return CONSENT_CHANNELS.map((wire): WriteWay => {
    const starts = startsOn(wire, heard, now);
    const hold = holdOf(wire, r, { bearing, ready, starts, about });
    const window = replyWindow(wire, r.latest_wa_inbound_at, now);
    const left = window.closesAtIso ? new Date(window.closesAtIso).getTime() - now.getTime() : 0;
    return {
      wire,
      ok: hold === null,
      hold,
      why: hold === null ? null : hold === "not_ready" ? ready[wire].why : WRITE_HOLD_WORDS[hold](wire),
      carries: window.open ? "words" : "approved",
      starts,
      about,
      hours_left: wire === "whatsapp" && window.open ? Math.max(0, Math.floor(left / HOUR_MS)) : null,
    };
  });
}

/** The wire the sheet opens on: where they last wrote when a message can go there, else the first that can; null for none. */
export function defaultWriteWire(
  ways: readonly WriteWay[],
  lastWrote: string | null | undefined,
): ConsentChannel | null {
  const last = heardWire(lastWrote);
  const there = ways.find((w) => w.wire === last && w.ok);
  return (there ?? ways.find((w) => w.ok))?.wire ?? null;
}

/**
 * What the reach read answers of one person (GET people/[id]/reach), composed from People's row for them: who they are,
 * their thread as the Inbox addresses it, each wire as it stands, the wire the sheet opens on, the call, whether the
 * receptionist answers them, and what fills an approved message's slots. `mode` is the receptionist's mode in force for
 * them (their own setting, else the workspace's; null where neither says): it answers unless told to ask first or
 * never. `facts` are the workspace's own words for the slots that name it, as the send reads them; null with none.
 * `firstTextLine` is the line a first text to them would carry, where no text of ours has reached them yet.
 */
export function writeReachOf(
  r: WriteRow & Pick<PersonRowDto, "id" | "display_name" | "wa_profile_name">,
  at: {
    ready: ChannelsReady;
    mode: string | null;
    facts: { business_name: string; booking_link: string | null } | null;
    firstTextLine: string | null;
    now?: Date;
  },
): PersonReachDto {
  const { ready, mode, facts, now = new Date() } = at;
  const ways = writeWaysOf(r, ready, now);
  const C = NEW_CONVERSATION_WORDS.call;
  return {
    person: { id: r.id, name: personName(r), phone: r.phone_e164, email: r.email },
    thread: r.latest_conversation_id ? `th-${r.latest_conversation_id}` : null,
    ways,
    default_wire: defaultWriteWire(ways, r.last_inbound_channel),
    call: !r.phone_e164
      ? { ok: false, tel: null, why: C.noNumber }
      : r.dnc
        ? { ok: false, tel: null, why: C.doNotContact }
        : { ok: true, tel: r.phone_e164, why: null },
    receptionist: { answers: mode !== "ask" && mode !== "never" },
    offers_ok: r.marketing_consent === "opted_in",
    fills: facts ? { first_name: firstNameOf(r.display_name, r.wa_profile_name), ...facts } : null,
    first_text_line: ways.some((w) => w.wire === "sms" && w.ok) ? at.firstTextLine : null,
  };
}
