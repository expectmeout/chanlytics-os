/**
 * One reachability rule everywhere (One message, every channel, the review's item 7). A campaign reaches each person on
 * one channel it ticks (reach-for.ts reachFor); the pages that are asked with no campaign in view ask the same question
 * of every channel at once: can this person be reached, by this kind of message, on any channel this workspace can send
 * on now. People's rows and lists, Today's leaks and the proposal follow-up's stand all count from here, so what a
 * page promises is what a send enrols (there was one answer per page, each asking WhatsApp alone).
 *
 * Two questions, kept apart because they are two facts:
 *   - SAID YES: they gave the answer this kind of message asks (answeredYes). It is what they said, on whatever channel and
 *     whether the workspace can send on it or not, so it does not move with the workspace's lines; it is the word People's
 *     columns say. (The send screen's count, broadcast-audience.ts saidYesOnAny, is the yes one send's channels need.)
 *   - CAN RECEIVE: reachFor over every channel, against what the workspace can send on now. Offers go by WhatsApp, and by
 *     email once the workspace can send them (reach-for.ts channelRefuses: texts carry none); a message about a visit goes by
 *     whichever of the three their yes covers and they have a way to reach: a number, or an address that has not bounced.
 *     An email about a visit asks no yes at all (consent.ts), so an address alone reaches them there.
 */
import type { AskedPurpose } from "../consent/consent";
import { CONSENT_CHANNELS } from "../consent/consent-channels";
import type { PersonRowVM } from "../people/person-row";
import { CHANNEL_WORDS, type ChannelsReady, type HeldOn, type ReachRow, reachFor } from "./reach-for";

/**
 * The workspace as every page counted it before the channels were: WhatsApp can send, and nothing else is checked, so
 * nothing else is counted. A page that could not read the workspace's channels (a read that failed, a surface cached
 * before they were published) counts as this, and its own number banner judges WhatsApp.
 */
export const READY_WHATSAPP_ALONE: ChannelsReady = {
  whatsapp: { ready: true, why: null },
  sms: { ready: false, why: CHANNEL_WORDS.unchecked },
  email: { ready: false, why: CHANNEL_WORDS.unchecked },
};

/** The workspace's channels as a page has them: the read's own, or, where there was none, WhatsApp alone. */
export function readyOrWhatsApp(read: ChannelsReady | null | undefined): ChannelsReady {
  return read ?? READY_WHATSAPP_ALONE;
}

/**
 * Whether a person gave the answer this kind of message asks: yes to hearing from the business for a message, yes to
 * offers for an offer. The recorded answer, as People's columns say it ("Yes": consentOf folds a stop and a do-not-contact
 * into no), whatever channel it was given for: when nobody can be sent a thing and somebody on the list said yes, what is
 * missing is a way to reach them, not an answer (#663's rule).
 */
export function answeredYes(r: Pick<PersonRowVM, "consent">, purpose: AskedPurpose): boolean {
  return (purpose === "marketing" ? r.consent.marketing : r.consent.state) === "opted_in";
}

/** A value for each kind of message a page asks about: offers (a promotion) and messages (the rest, about their visit). */
type ByKind<T> = { offers: T; messages: T };

/** What a row says of reaching a person, once for each kind of message. */
export interface PersonReach {
  /** They gave the answer this kind asks, a way to reach them or not (answeredYes). */
  saidYes: ByKind<boolean>;
  /** They can be sent it: on some channel the workspace can send on now, their yes and a way to reach them (reachFor). */
  canReceive: ByKind<boolean>;
  /** Why not, where not: reachFor's strictest refusal, or no channel the workspace can send this on; null where they can. */
  whyNot: ByKind<HeldOn | null>;
}

/**
 * What a person's facts and the workspace's channels make of reaching them: each kind of message asked of every channel
 * at once (reachFor with all three ticked). `ready` is the workspace's channels now, or null where they could not be
 * read (readyOrWhatsApp). One call answers all three facts, so they cannot disagree.
 */
export function personReachOf(r: ReachRow, ready: ChannelsReady | null): PersonReach {
  // A row's "can get your messages" is the visit and proposal moments' (the home's "Opens: visit reminder, how did it
  // go"): their own, which by email asks no yes. A broadcast asks its own question of its own people (decision D1).
  const how = { channels: CONSENT_CHANNELS, ready: readyOrWhatsApp(ready), about: "theirs" as const };
  const offers = reachFor(r, "marketing", how).held;
  const messages = reachFor(r, "conversational", how).held;
  return {
    saidYes: { offers: answeredYes(r, "marketing"), messages: answeredYes(r, "conversational") },
    canReceive: { offers: offers === null, messages: messages === null },
    whyNot: { offers, messages },
  };
}
