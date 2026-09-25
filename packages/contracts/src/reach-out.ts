/**
 * Reach out's words that more than one layer says: the foot every campaign email carries, and the unsubscribe
 * page. Pure (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.3, §4.8).
 */

/** Why a business the finder found is hearing from this one: the first line of the foot. */
export const WHY_FROM_MAPS = "I found your business on Google Maps.";

/** Why they are hearing from you, from where the finder found them: never a place the business was not found. */
export function whyFrom(source: string | null | undefined): string {
  return source === "maps" ? WHY_FROM_MAPS : "I came across your business online.";
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * What the email is, said plainly: CAN-SPAM asks a commercial email to identify itself as one. True of every step of a
 * reach-out, the first email and its nudge alike.
 */
export const MARKETING_LINE = "This is a marketing email.";

/**
 * The foot, as the law asks (CAN-SPAM): why they are hearing from you, that the email is marketing, who you are and
 * where, and the two ways to say no. The sender adds it; a template never stores it (the spec's §4.3). It throws on a
 * blank part rather than let an email go whose foot says less than the law needs; the sheet (Part 4) refuses to start
 * without an address.
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
    MARKETING_LINE,
    `${business} · ${address}`,
    `Not interested? Reply "no thanks" and I won't write again.`,
    `Unsubscribe: ${url}`,
  ].join("\n");
}

/**
 * The foot in HTML, as the canvas draws it: why, that it is marketing, who and where, and one line to say no with the link reading
 * "Unsubscribe". The plain text keeps the address (campaignFooter), which a text-only reader needs to follow it.
 * Everything is escaped; the sender freezes both into the request.
 */
export function campaignFooterHtml(f: {
  why: string;
  business: string;
  address: string;
  unsubscribeUrl: string;
}): string {
  campaignFooter(f); // the same parts, the same refusal when one is blank
  return (
    `<p>${escapeHtml(f.why.trim())}<br>${escapeHtml(MARKETING_LINE)}<br>` +
    `${escapeHtml(f.business.trim())} · ${escapeHtml(f.address.trim())}<br>` +
    `${escapeHtml(`Not interested? Reply "no thanks" and I won't write again`)} · ` +
    `<a href="${escapeHtml(f.unsubscribeUrl.trim())}">Unsubscribe</a></p>`
  );
}

/** What the unsubscribe page is showing. */
export type UnsubscribeView =
  /** `sender`: the address the email came from, so a stranger knows which email this is about; null when unread. */
  | { kind: "ask"; business: string | null; sender?: string | null }
  | { kind: "done"; business: string | null; sender?: string | null }
  | { kind: "bad_link" }
  /** `retry`: the link is sound and a press did not go through, so the page offers the press again. */
  | { kind: "unavailable"; retry?: boolean };

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
      const like = v.sender?.trim() ? `the one from ${v.sender.trim()}` : "that one";
      return {
        title: "Unsubscribe",
        lead: b ? `Stop emails from ${b}?` : "Stop these emails?",
        body: `Press the button and ${b ?? "this business"} won't send you emails like ${like} again. If you write to them, they can still answer you.`,
        button: "Unsubscribe",
        foot: `${b ?? "This business"} sends its email with Chanlytics.`,
      };
    }
    case "done": {
      const b = v.business?.trim() || null;
      const sender = v.sender?.trim() || null;
      return {
        title: "Unsubscribed",
        lead: sender ? `You're unsubscribed from emails from ${sender}.` : "You're unsubscribed.",
        body: `${b ?? "This business"} won't send you emails like ${sender ? `the one from ${sender}` : "that one"} again.`,
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
        body: v.retry
          ? "We couldn't record it just now. Press Try again. Or reply to the email and ask them to stop."
          : "We couldn't record it just now. Try the link again in a minute. Or reply to the email and ask them to stop.",
        button: v.retry ? "Try again" : null,
        foot: null,
      };
  }
}
