/**
 * Reach out's words that more than one layer says: where a lead was found, the tag a campaign's email carries, and the
 * unsubscribe page. The foot every campaign email carries is templates/email-foot.ts, one builder for every kind. Pure
 * (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.3, §4.8).
 */

/** Why a business the finder found is hearing from this one: the first line of the foot. */
export const WHY_FROM_MAPS = "I found your business on Google Maps.";

/** Why a company the people card found is hearing from this one (00429): a directory of companies and their people. */
export const WHY_FROM_DIRECTORY = "I found your company in a business directory.";

/**
 * Why they are hearing from you, from where the finder found them (a lead's source, 00429: the Maps card's, the people
 * card's, or a file of the owner's own): never a place the business was not found.
 */
export function whyFrom(source: string | null | undefined): string {
  if (source === "maps" || source === "local_businesses") return WHY_FROM_MAPS;
  if (source === "people_at_companies") return WHY_FROM_DIRECTORY;
  return "I came across your business online.";
}

/**
 * The tag a campaign's email carries when it carries no way to unsubscribe (One message, every channel, step 3): a
 * broadcast's or a playbook run's appointment email, which is not an offer and so has no List-Unsubscribe, is still a
 * campaign's, not a reply.
 */
export const CAMPAIGN_EMAIL_TAG = "cl_campaign";

/**
 * Whether an email, as its request was frozen, was a campaign's (a broadcast, a playbook's run or a reach-out) rather
 * than a reply to someone who wrote. What its failure may say hangs on it: a reply that never arrived is a customer
 * with no answer, and flags the thread for a person; a campaign's email that failed is the campaign's to count, and
 * flags nothing (Reach out D4). Read from the request alone: the header only an offer's request is built with (channels
 * buildEmailRequest), or the campaign tag an appointment email is given (CAMPAIGN_EMAIL_TAG). The one predicate: the
 * send verb, the receipt and the job that died all ask it.
 */
export function isCampaignEmail(request: unknown): boolean {
  const r = request as { headers?: Record<string, unknown>; tags?: unknown } | null | undefined;
  const v = r?.headers?.["List-Unsubscribe"];
  if (typeof v === "string" && v.trim() !== "") return true;
  return (
    Array.isArray(r?.tags) &&
    r.tags.some((t) => !!t && typeof t === "object" && (t as { name?: unknown }).name === CAMPAIGN_EMAIL_TAG)
  );
}

/** What the unsubscribe page is showing. */
export type UnsubscribeView =
  /** `sender`: the address the email came from, so a stranger knows which email this is about; null when unread. */
  | { kind: "ask"; business: string | null; sender?: string | null }
  | { kind: "done"; business: string | null; sender?: string | null }
  | { kind: "bad_link" }
  /**
   * A sound link whose email could not be read just now, so which kind it came in (an offer to a customer, or a reach-out's
   * email to a business) is not known: words that are true of both, never the one kind's by default.
   */
  | { kind: "ask_either"; business: string | null }
  | { kind: "done_either"; business: string | null }
  /** `retry`: the link is sound and a press did not go through, so the page offers the press again. */
  | { kind: "unavailable"; retry?: boolean };

/**
 * The header the page answers with, naming the view it drew (its `kind`). The edge's probe of the links reads it
 * (apps/edge lib/email/unsubscribe-probe.ts): a 404 or a 503 carrying it is the page's own answer, and one without it
 * is the platform's, or some other page's, which says nothing about the keys.
 */
export const UNSUBSCRIBE_PAGE_HEADER = "x-unsubscribe-page";

export interface UnsubscribePageWords {
  title: string;
  lead: string;
  body: string;
  /** The one button, on the page that asks; null everywhere else. */
  button: string | null;
  foot: string | null;
}

/**
 * The words for a link whose email could not be read just now, so not known to be an offer's or a reach-out's: true of both
 * (what stops is "emails like this one", and an answer to something they wrote still reaches them), with no second act.
 */
function eitherPageWords(v: Extract<UnsubscribeView, { kind: "ask_either" | "done_either" }>): UnsubscribePageWords {
  const b = v.business?.trim() || null;
  const foot = `${b ?? "This business"} sends its email with Chanlytics.`;
  return v.kind === "ask_either"
    ? {
        title: "Unsubscribe",
        lead: "Stop these emails?",
        body: `Press the button and ${b ?? "this business"} won't send you emails like this one again. If you write to them, they can still answer you.`,
        button: "Unsubscribe",
        foot,
      }
    : {
        title: "Unsubscribed",
        lead: "You're unsubscribed from these emails.",
        body: `${b ?? "This business"} won't send you emails like this one again.`,
        button: null,
        foot,
      };
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
    case "ask_either":
    case "done_either":
      return eitherPageWords(v);
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
