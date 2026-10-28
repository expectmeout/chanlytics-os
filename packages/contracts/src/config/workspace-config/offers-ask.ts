/**
 * The receptionist asks for the yes to offers, once (One message, every channel, step 2; the design canvas' board A5).
 *
 * Two halves that must agree, said from here so each has ONE spelling:
 *
 *   - The rule the receptionist is told (offersAskRule, composed under "Rules you must follow" for a workspace with a
 *     WhatsApp number): at the natural end of a conversation the customer started, after something went well, ask
 *     once, in these words, and never in the cases it names.
 *   - The facts it reads of the person each turn (offersFacts, said by describeLead in packages/db): what they answered
 *     about offers, and whether they were ever asked. "Asked" is a fact the database keeps (`contacts.offers_asked_at`,
 *     stamped when an outbound message holding the phrase is stored); this side only reads it. The rule names the
 *     sentence that lets it ask, so the two cannot drift.
 *
 * The question is asked on WhatsApp alone: a text carries no offers (deliver.ts), and the sign-up page offers the yes on
 * WhatsApp only (consent-page.ts). The prompt names WhatsApp for every conversation it is composed for, a text
 * included (it rides the same road), so the conversation's channel is said in the facts as well, and the sentence that
 * lets the receptionist ask is never said on a text or a call.
 */
import { yesCovers } from "../../consent/consent-channels";
import { STOP_ENDED_OFFERS_SOURCE } from "../../people/person-consent";
import { clockDate } from "../../shared/clock";
import { OFFERS_OPT_IN_PHRASES } from "../../shared/enums";

/** The channel of the conversation a note about a person is read in. */
export type LeadChannel = "whatsapp" | "sms" | "instagram" | "voice";

/**
 * The facts, one sentence each. Built inside a call marked pure: a table with a function in it is an expression the
 * bundler keeps at the top level, and every package that bundles contracts would carry it unused.
 */
const FACT = /* @__PURE__ */ (() => ({
  yes: "Said yes to offers.",
  no: "Said no to offers.",
  never: "Has not been asked for the yes to offers.",
  asked: (on: string | null) => `Asked for the yes to offers${on ? ` on ${on}` : ""}; has not said it.`,
  text: "This conversation is by text message, not WhatsApp.",
  dm: "This conversation is by Instagram direct message, not WhatsApp.",
}))();

/**
 * What the receptionist is told of a person's answer about offers, and of the channel they are on, as sentences for
 * the lead note. Facts only; nothing inferred.
 *
 * The sentence the rule asks on ("Has not been asked for the yes to offers.") is said only where asking is allowed and
 * the person's state is known: on WhatsApp, to someone who has not sent STOP, who has no yes that covers WhatsApp (no
 * answer yet, or a yes kept for text alone) and whose `offers_asked_at` was read and is null. A reader that could not
 * say (the column absent, `undefined`), a call, a text or a conversation of no stated channel says nothing that lets it
 * ask: the rule fails closed.
 */
export function offersFacts(
  p: {
    /** contacts.marketing_consent: unknown, opted_in or opted_out. Absent where the reader never learned it. */
    marketingConsent?: string | null;
    /**
     * contacts.marketing_channels: the channels that yes covers. Null or absent covers WhatsApp alone (yesCovers), the
     * reach a yes recorded before the channels were always had.
     */
    marketingChannels?: readonly string[] | null;
    /** contacts.offers_asked_at: null when they were never asked, absent when the reader could not say. */
    offersAskedAt?: string | null;
    /** They sent STOP, or are on the do-not-contact list. */
    optedOut?: boolean;
  },
  channel: LeadChannel | undefined,
  now: Date,
  tz: string,
): string[] {
  const out: string[] = [];
  if (channel === "sms") out.push(FACT.text);
  if (channel === "instagram") out.push(FACT.dm);
  const asked = p.offersAskedAt;
  // Offers go by WhatsApp, so a yes counts where it covers WhatsApp (yesCovers, the one reading of a row's channels): a
  // yes kept for text alone is not said on WhatsApp, and reads like no answer yet.
  const open =
    p.marketingConsent === "unknown" ||
    (p.marketingConsent === "opted_in" && !yesCovers(p.marketingChannels, "whatsapp"));
  if (p.marketingConsent === "opted_in" && !open) out.push(FACT.yes);
  else if (p.marketingConsent === "opted_out") out.push(FACT.no);
  else if (open) {
    if (typeof asked === "string") {
      const at = Date.parse(asked);
      out.push(FACT.asked(Number.isFinite(at) ? clockDate(at, tz, now.getTime()) : null));
    } else if (asked === null && channel === "whatsapp" && !p.optedOut) out.push(FACT.never);
  }
  return out;
}

/**
 * What a START's confirmation adds for a person whose yes to offers ended with their STOP (00323), or null.
 *
 * A START is a yes to messages about their own visit and nothing more, so a person who had offers before they stopped
 * would otherwise wait for news that no longer comes. The confirmation says so, with the phrase that turns offers
 * on again (the inbound path records it as their own yes). On WHATSAPP ALONE: the texting line's confirmation is the
 * campaign's filed opt-in message, word for word (consent-page.ts optInConfirmation), and offers are never offered on
 * that line (30896). Nothing for a person who never said yes, who was asked and did not answer, or who said no: the
 * receptionist's own ask is once (offersAskRule), and this is not a second one. It is said on each START while the
 * ended yes is the answer on their row, and no longer once they answer about offers again. The sentence holds the
 * phrase, so the database counts it as the ask (offers_asked_at) and the receptionist does not ask after it.
 */
export function offersAfterStart(
  p: { marketingConsent?: string | null; marketingConsentSource?: string | null },
  channel: LeadChannel | undefined,
): string | null {
  if (channel !== "whatsapp") return null;
  if (p.marketingConsent !== "unknown" || p.marketingConsentSource !== STOP_ENDED_OFFERS_SOURCE) return null;
  return `Offers and news stay off. Reply ${OFFERS_OPT_IN_PHRASES.en} to get them here again.`;
}

/**
 * The answer to a customer whose message is only the phrase, as one line under "Rules you must follow", in chat alone
 * (compose.ts): a call has no message to find it in, and said there it was a line about texts on every phone call (the
 * call prompts' read, 28 Oct 2026). Offers go by WhatsApp alone (core reply-gates confirmedYes), so the yes is one to
 * WhatsApp offers only where a WhatsApp line answers; elsewhere nothing is promised.
 */
export function offersAnswerRule(whatsappLine: boolean): string {
  return whatsappLine
    ? "If a message is only the words YES OFFERS or SI OFERTAS, the customer is saying yes to offers and news by WhatsApp: thank them in one short line, say they can reply STOP at any time, and ask nothing else."
    : "If a message is only the words YES OFFERS or SI OFERTAS, thank them in one short line and promise nothing: this business sends no offers or news by message.";
}

/**
 * The rule, as one line under "Rules you must follow". The question is the house's own words, with the customer's
 * phrase from OFFERS_OPT_IN_PHRASES (the phrase the inbound path records as their yes), never a second spelling.
 */
export function offersAskRule(): string {
  const { en, es } = OFFERS_OPT_IN_PHRASES;
  return (
    `When a WhatsApp conversation the customer started comes to its natural end after something went well (a booking made or confirmed, or their question fully answered), ` +
    `and the facts about them say "${FACT.never}", close your reply with this question, once, in their language: "Want our offers and news here too? Reply ${en}. You can stop any time." ` +
    `(in Spanish, ${es} in place of ${en}). ` +
    `Never ask twice; never on a text or email conversation, in a complaint, in a cancellation, after STOP, or of anyone who has said no to offers; never make it a condition of anything.`
  );
}
