/**
 * The foot the sender puts under a campaign's email, said once for every kind of email that has one (One message, every
 * channel, steps 3 to 5): the send adds it (core's broadcast-channels.ts, the reach-out's request), and the composers' and
 * the sheet's previews draw it (broadcasts/preview-by-channel.ts), so what an owner reads beside the message is what the
 * person gets. It is the sender's, never stored with a version or a step: it names the business and the reason, and the
 * way out. It speaks the language of the version it is under (sender-words.ts: English, Spanish, and English for any other).
 *
 * Three kinds, one builder:
 *   visit  a message about their visit or their proposal. It carries no unsubscribe, so its way out is a reply of STOP.
 *   offer  an offer to a customer (the spec's 4.6): why they are getting it, the business's name and postal address, and
 *          an Unsubscribe link, the one the mail client's one click carries too. It refuses to build with the address or
 *          the link blank, as a cold foot does.
 *   cold   a reach-out's first email or nudge to a business the finder found (CAN-SPAM): why they are hearing from you,
 *          that it is marketing, who you are and where, and the two ways to say no. It refuses to build with a part blank
 *          rather than let an email go whose foot says less than the law needs.
 */
import { escapeHtml } from "../shared/html";
import { senderWords, type SenderWords } from "./sender-words";

/**
 * Which foot, and what it says that is its own. An `offer` says why a customer gets it: `asked` is someone who asked for
 * offers by email themselves (YES OFFERS); `customer` is someone who has dealt with the business (they wrote, called or
 * have a deal) and has not unsubscribed. A `cold` foot's reason is the finder's words for where the business was found
 * (reach-out/reach-out.ts whyFrom). Both carry the link the Unsubscribe line and the List-Unsubscribe header share.
 */
export type EmailFoot =
  | { kind: "visit"; facts: Record<string, unknown> }
  | { kind: "offer"; why: "customer" | "asked"; unsubscribeUrl: string }
  | { kind: "cold"; why: string; unsubscribeUrl: string };

/** The foots that carry an unsubscribe link, and so have an HTML twin to put it in. */
export type LinkedFoot = Exclude<EmailFoot, { kind: "visit" }>;

/** Why a customer gets an offer, in the words of the language it is sent in. */
const offerWhy = (w: SenderWords, who: string, why: "customer" | "asked"): string =>
  why === "asked" ? w.offerAsked(who) : w.offerCustomer(who);

/**
 * An offer's address and link, trimmed, or the refusal: an offer's foot owes the business's postal address and the way out
 * (CAN-SPAM, the spec's 4.6), so the builder never makes one without them, as the cold foot never does. A business with no
 * address on file sends no offers (the send holds the person: `no_business_address`; the composers say so before anyone
 * sends); the preview of an offer with none says so rather than draw a foot the send would never carry.
 */
function offerParts(address: string | null | undefined, f: { unsubscribeUrl: string }) {
  const parts = { address: address?.trim() ?? "", url: f.unsubscribeUrl.trim() };
  if (!parts.address || !parts.url) throw new Error("emailFoot: an offer foot names where and how to stop");
  return parts;
}

/**
 * The cold foot's parts, trimmed, or the refusal: a cold email is not sent with a part of its foot missing, and the sheet
 * refuses to start without an address.
 */
function coldParts(business: string, address: string | null | undefined, f: { why: string; unsubscribeUrl: string }) {
  const parts = {
    why: f.why.trim(),
    business: business.trim(),
    address: address?.trim() ?? "",
    url: f.unsubscribeUrl.trim(),
  };
  if (!parts.why || !parts.business || !parts.address || !parts.url)
    throw new Error("emailFoot: a cold foot names why, who, where and how to stop");
  return parts;
}

/**
 * The foot of an email, in text: why they are hearing from the business, how to stop hearing from it, then who and where
 * when the Business record has a postal address. `language` is the version's (null where it kept none): the words are
 * said in it, so a Spanish version does not end in English.
 *
 * A visit's reason names what the message is about, from the words their row kept (a proposal's link, a visit's time), else
 * says only that they have been in touch; its way out is a reply of STOP. An offer's reason is its own (offerWhy), and its
 * way out the Unsubscribe link, after who and where. A cold foot's is the finder's reason, the marketing line, who and
 * where, the "no thanks" reply and the link.
 */
export function emailFoot(
  business: string,
  address: string | null | undefined,
  foot: EmailFoot,
  language: string | null,
): string {
  const w = senderWords(language);
  if (foot.kind === "cold") {
    const p = coldParts(business, address, foot);
    return [p.why, w.marketing, `${p.business} · ${p.address}`, `${w.noThanks}.`, `${w.unsubscribe}: ${p.url}`].join(
      "\n",
    );
  }
  const who = business.trim() || w.us;
  if (foot.kind === "offer") {
    const p = offerParts(address, foot);
    return [offerWhy(w, who, foot.why), `${who} · ${p.address}`, `${w.unsubscribe}: ${p.url}`].join("\n");
  }
  const where = address?.trim();
  const facts = foot.facts;
  const why =
    typeof facts.proposal_link === "string"
      ? w.visitProposal(who)
      : typeof facts.visit_when === "string"
        ? w.visitBooked(who)
        : w.visitInTouch(who);
  return where ? `${why}\n${w.emailStop}\n${who} · ${where}` : `${why}\n${w.emailStop}`;
}

/**
 * A foot with a link, in HTML, the link reading "Unsubscribe" (the canvas draws it so) or its word in the version's
 * language: the same lines as `emailFoot`'s, which a text-only reader keeps with the address spelled out. Everything is
 * escaped. The request builder checks that this carries the very link the List-Unsubscribe header does (channels
 * buildEmailRequest). A cold foot refuses a blank part, as its text does.
 */
export function emailFootHtml(
  business: string,
  address: string | null | undefined,
  foot: LinkedFoot,
  language: string | null,
): string {
  const w = senderWords(language);
  if (foot.kind === "cold") {
    const p = coldParts(business, address, foot);
    return (
      `<p>${escapeHtml(p.why)}<br>${escapeHtml(w.marketing)}<br>` +
      `${escapeHtml(p.business)} · ${escapeHtml(p.address)}<br>` +
      `${escapeHtml(w.noThanks)} · <a href="${escapeHtml(p.url)}">${escapeHtml(w.unsubscribe)}</a></p>`
    );
  }
  const who = business.trim() || w.us;
  const p = offerParts(address, foot);
  return (
    `<p>${escapeHtml(offerWhy(w, who, foot.why))}<br>` +
    `${escapeHtml(`${who} · ${p.address}`)}<br>` +
    `<a href="${escapeHtml(p.url)}">${escapeHtml(w.unsubscribe)}</a></p>`
  );
}
