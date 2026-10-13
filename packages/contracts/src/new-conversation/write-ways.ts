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
import { QUIET_AFTER_DAYS } from "../people/person-state";
import { DAY_MS, HOUR_MS } from "../shared/time";

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

/** A wire that cannot go, where no reason is to hand: the sheet's and the page's one fallback sentence. */
export const WRITE_WAY_REFUSED = "A message cannot go to them that way.";

/**
 * What a wire is judged against: the person's standing, what the workspace can send on (null where its lines were not
 * judged: every hold but not_ready is still said), and what the message is.
 */
interface Judged {
  bearing: PurposeBearing;
  ready: ChannelsReady | null;
  starts: boolean;
  about: MessageAbout;
}

function holdOf(wire: ConsentChannel, r: WriteRow, { bearing, ready, starts, about }: Judged): WriteHold | null {
  if (isOptedOutContact(bearing)) return "stopped";
  if (wire === "email") {
    if (!r.email) return "no_address";
    if (r.email_suppressed_at) return "address_stopped";
  } else if (!r.phone_e164) return "no_number";
  if (ready && !ready[wire].ready) return "not_ready";
  if (isOfferByEmail({ channel: wire, purpose: "conversational", proactive: starts, about })) return "no_history";
  // The one predicate, told this is a person's own message and whether it begins there (`begins`): the send door asks
  // it the same way at the wire (core deliver.ts).
  const may = mayMessageFor(bearing, "conversational", { proactive: starts, channel: wire, about, begins: starts });
  if (may.ok) return null;
  return may.reason === "unsubscribed" ? "unsubscribed" : "no_yes";
}

/**
 * Every wire, in the house order (WhatsApp, text, email), as a message to this person stands on it now. `ready` null:
 * the workspace's lines were not judged (a person's page before People has read them), so every hold but not_ready is
 * said, and the sheet and the send judge the lines again.
 */
export function writeWaysOf(r: WriteRow, ready: ChannelsReady | null, now: Date = new Date()): WriteWay[] {
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
      why: hold === null ? null : hold === "not_ready" ? (ready?.[wire].why ?? null) : WRITE_HOLD_WORDS[hold](wire),
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

/** Why a message cannot go by this wire now, in the sheet's own words; null where it can (a person's page's More). */
export function wayOff(ways: readonly WriteWay[], wire: ConsentChannel): string | null {
  const w = ways.find((x) => x.wire === wire);
  return w && !w.ok ? (w.why ?? WRITE_WAY_REFUSED) : null;
}
