/**
 * A customer asked to stop, told to the owner once on the bell (decision 0048): the pure half of core's consent_notice
 * subscriber. A STOP is news and no wait. Every door that records a no writes a contact.consent_changed event in its own
 * transaction (a typed STOP, the unsubscribe link and its "Stop all messages", a complaint, a carrier's late STOP,
 * WhatsApp's 131050), so the notice is read from that event, whichever door wrote it, and not from the receptionist's
 * hold: the hold it used to open sat in Needs you, the badge and Today's queue until a member resolved something nobody
 * could act on, and the mail about it was always sent.
 *
 * `optOutOf` reads the event: a no the customer or a provider said, and nothing else. A no a member recorded themselves
 * (their own page, a bulk answer), the end of a yes when a STOP came (`stop`), a merge and a yes are not news to anyone,
 * and are left. `optOutNotice` words it in the Inbox's words for asking to stop (STOP_WORDS), and gives the bell's row
 * of kind `opted_out` the person's page to open.
 */
import { formatPhoneDisplay } from "../shared/phone";
import type { JobNews } from "../today/notifications";
import { ContactConsentChangedData } from "../workspace/event-data";
import { STOP_WORDS } from "./consent";

/** How a no reached us: their own STOP, the carrier's report of one, WhatsApp's, an unsubscribe, a complaint. */
export type OptOutHow = "stop" | "carrier" | "whatsapp" | "unsubscribe" | "complaint";

/** What a no was, read from its event. */
export interface OptOutSaid {
  how: OptOutHow;
  /** What it ends: every message we send them, or offers alone (their reminders and confirmations go on). */
  scope: "everything" | "offers";
  /** The wire it was said on, as the event names it: sms, whatsapp, email. */
  channel: string | null;
  /** What they wrote, for a STOP they typed. */
  words: string | null;
}

/** The sources of a no that is the customer's or a provider's own, and how each is told. A member's record and a merge are not here. */
const HOW_OF_SOURCE: ReadonlyMap<string, OptOutHow> = new Map<string, OptOutHow>([
  ["customer_message", "stop"],
  ["carrier", "carrier"],
  ["whatsapp", "whatsapp"],
  ["unsubscribe", "unsubscribe"],
  ["complaint", "complaint"],
]);

/** The purposes of a no about offers; a no with none is the conversational one, which ends everything. */
const OFFER_PURPOSES: ReadonlySet<string> = new Set(["marketing", "email_marketing"]);

/**
 * What a contact.consent_changed event's data says when it is a no a customer or a provider gave; null for every other
 * change (a yes, a reset, a member's record, a merge, the end of a yes to offers by a STOP) and for data that is not a
 * consent change's.
 */
export function optOutOf(data: unknown): OptOutSaid | null {
  const parsed = ContactConsentChangedData.safeParse(data);
  if (!parsed.success || parsed.data.consent !== "opted_out") return null;
  const how = HOW_OF_SOURCE.get(parsed.data.source);
  if (!how) return null;
  const words = parsed.data.words?.trim();
  return {
    how,
    scope: parsed.data.purpose && OFFER_PURPOSES.has(parsed.data.purpose) ? "offers" : "everything",
    channel: parsed.data.channel ?? null,
    words: how === "stop" && words ? words : null,
  };
}

/** The person a no is about, as their record says it (packages/db personFactsOf). */
export interface OptOutPerson {
  /** Their name, when the record has one. */
  who: string | null;
  /** Their number (E.164) or their address. */
  address: string | null;
  /** Erased, or being erased: the notice is told of, never them. */
  erased: boolean;
}

/** The wire a no was said on, in the words an owner reads. */
const SAID_ON: Readonly<Record<string, string>> = { sms: "Text", whatsapp: "WhatsApp", email: "Email" };

/** What the no ends, said for the owner, after the headline: the fact that nothing waits on them. */
function endsWords(said: OptOutSaid): string {
  if (said.scope === "everything")
    return said.how === "carrier"
      ? "Their carrier told us they replied STOP to your number. Nothing more will be sent to them."
      : "Nothing more will be sent to them. They can text START to opt back in.";
  if (said.how === "whatsapp")
    return "Offers to them on WhatsApp have stopped. Reminders and confirmations still reach them.";
  if (said.how === "unsubscribe" || said.how === "complaint" || said.channel === "email")
    return "Offers and news by email to them have stopped. Reminders and confirmations still reach them.";
  return "Offers to them have stopped. Reminders and confirmations still reach them.";
}

/** The headline for a no: the Inbox's words for asking to stop where they asked, else what they did. */
function headline(name: string, said: OptOutSaid): string {
  if (said.how === "unsubscribe") return `${name} unsubscribed from your emails`;
  if (said.how === "complaint") return `${name} reported one of your emails as spam`;
  if (said.how === "whatsapp") return `${name} stopped offers on WhatsApp`;
  return said.scope === "everything" ? STOP_WORDS.said(name) : `${name} ${STOP_WORDS.short} offers`;
}

/** How the platform's copy names a no, with no word of theirs. */
const HOW_REDACTED: Readonly<Record<OptOutHow, string>> = {
  stop: "asked to stop",
  carrier: "asked to stop, by their carrier's report",
  whatsapp: "stopped offers on WhatsApp",
  unsubscribe: "unsubscribed from the emails",
  complaint: "reported an email as spam",
};

/**
 * The owner's notice of a no: who stopped, how, what that ends, and the page where their answer is kept. News, so a line on the
 * bell (the mail only as the business chose, and no phone), and nothing that waits on them. An erased person is "A
 * customer", with no words and no number; the platform's copy, for a workspace nobody can be told in, says the fact and
 * never the words.
 */
export function optOutNotice(f: OptOutPerson & OptOutSaid & { contactId: string }): Omit<JobNews, "sourceEvent"> {
  const shown = f.erased ? null : f.address?.startsWith("+") ? (formatPhoneDisplay(f.address) ?? f.address) : f.address;
  const name = (!f.erased && f.who?.trim()) || shown || "A customer";
  const where = SAID_ON[f.channel ?? ""];
  const lines = [
    ...(!f.erased && f.words ? [`They wrote: “${f.words.replace(/\s+/g, " ").slice(0, 120)}”`] : []),
    endsWords(f),
  ];
  const foot = [where, shown].filter(Boolean).join(" · ");
  return {
    kind: "opted_out",
    route: `clients/${f.contactId}`,
    about: { type: "contact", id: f.contactId },
    subject: headline(name, f).slice(0, 200),
    body: [...lines, ...(foot ? ["", foot] : [])].join("\n"),
    redactedBody: `A customer ${HOW_REDACTED[f.how]}, and nobody could be told.`,
  };
}
