/**
 * Reach out's words that more than one layer says: the foot every campaign email carries, and the unsubscribe
 * page. Pure (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.3, §4.8).
 */

/** Why a business the finder found is hearing from this one: the first line of the foot. */
export const WHY_FROM_MAPS = "I found your business on Google Maps.";

/**
 * The foot, as the law asks (CAN-SPAM): why they are hearing from you, who you are and where, and the two ways to
 * say no. The sender adds it; a template never stores it (the spec's §4.3). It throws on a blank part rather than
 * let an email go whose foot says less than the law needs; the sheet (Part 4) refuses to start without an address.
 */
export function campaignFooter(f: { why: string; business: string; address: string; unsubscribeUrl: string }): string {
  const why = f.why.trim();
  const business = f.business.trim();
  const address = f.address.trim();
  const url = f.unsubscribeUrl.trim();
  if (!why || !business || !address || !url)
    throw new Error("campaignFooter: a campaign's foot names why, who, where and how to stop");
  return [
    why,
    `${business} · ${address}`,
    `Not interested? Reply "no thanks" and I won't write again.`,
    `Unsubscribe: ${url}`,
  ].join("\n");
}

/** What the unsubscribe page is showing. */
export type UnsubscribeView =
  | { kind: "ask"; business: string | null }
  | { kind: "done"; business: string | null }
  | { kind: "bad_link" }
  | { kind: "unavailable" };

export interface UnsubscribePageWords {
  title: string;
  lead: string;
  body: string;
  /** The one button, on the page that asks; null everywhere else. */
  button: string | null;
  foot: string | null;
}

/**
 * Every sentence the unsubscribe page says (apps/dashboard server/unsubscribe.ts draws them). "Emails like that one"
 * is the promise the door keeps: marketing email stops (the send door's outreach and marketing purposes); an answer
 * to something the person wrote still reaches them, which is why the page says so.
 */
export function unsubscribePageWords(v: UnsubscribeView): UnsubscribePageWords {
  switch (v.kind) {
    case "ask": {
      const b = v.business?.trim() || null;
      return {
        title: "Unsubscribe",
        lead: b ? `Stop emails from ${b}?` : "Stop these emails?",
        body: `Press the button and ${b ?? "this business"} won't send you emails like that one again. If you write to them, they can still answer you.`,
        button: "Unsubscribe",
        foot: `${b ?? "This business"} sends its email with Chanlytics.`,
      };
    }
    case "done": {
      const b = v.business?.trim() || null;
      return {
        title: "Unsubscribed",
        lead: "You're unsubscribed.",
        body: `${b ?? "This business"} won't send you emails like that one again.`,
        button: null,
        foot: `${b ?? "This business"} sends its email with Chanlytics.`,
      };
    }
    case "bad_link":
      return {
        title: "Unsubscribe",
        lead: "This link doesn't work.",
        body: "It may have been cut short when it was copied. Open the Unsubscribe link in the email itself, or reply to the email and ask them to stop.",
        button: null,
        foot: null,
      };
    case "unavailable":
      return {
        title: "Unsubscribe",
        lead: "That didn't go through.",
        body: "We couldn't record it just now. Try the link again in a minute.",
        button: null,
        foot: null,
      };
  }
}
