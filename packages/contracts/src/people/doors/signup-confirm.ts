/**
 * A website's sign-up, confirmed by its person (00489, the double opt-in): an address typed into a form proves nothing,
 * so the edge's door (website-form.ts) emails the address a link, and only the person's press on the page it opens is
 * their yes to offers by email (set_email_offers_yes, confirmed_signup).
 *
 * Here: whether a sign-up is asked (signupAskRefusal, over the facts the edge reads), the email's words, the page's
 * words, what the person's page says while an ask waits and whether a member may ask again from it, and the line the
 * owner is told. Pure.
 */
import { letterHtml } from "../../look/letter";
import type { WorkspaceLook } from "../../look/look";
import { DAY_MS } from "../../shared/time";
import { fmtDate } from "../person-helpers";

/** meta.source of a sign-up's confirmation email: what the yes door, the limits and the person's page find it by. */
export const SIGNUP_CONFIRM_SOURCE = "signup_confirm";

/** How long a confirmation link works, as the yes door holds it (00489: seven days from the email). */
export const SIGNUP_CONFIRM_MS = 7 * DAY_MS;

/**
 * How often a sign-up is asked, so a form flooded by a program never makes the business a sender of unwanted mail:
 * one ask open per person, three to one address in ninety days, fifty from one workspace in a day, and none more that
 * day once three of the day's did not arrive (the hosted domain every workspace's replies leave from is the one these
 * leave from).
 */
export const SIGNUP_ASK_LIMITS = {
  perAddress: 3,
  perAddressMs: 90 * DAY_MS,
  perWorkspaceDay: 50,
  failedStop: 3,
} as const;

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/**
 * An address a program made up: a Gmail address whose name holds three dots or more ("j.o.h.n.s.m.i.t.h@gmail.com").
 * Gmail reads no dots, so a program writes them to pass a list's check for an address it has used; a person's own
 * address rarely holds more than two. The first website to post here dropped these at its own door (28 Oct 2026).
 */
export function looksMadeUp(email: string): boolean {
  const [name, domain] = email.trim().toLowerCase().split("@");
  return !!name && !!domain && GMAIL.has(domain) && (name.match(/\./g) ?? []).length >= 3;
}

/**
 * The address as the limits count it: one Gmail inbox is one whatever its dots and its +tag, and any other address is
 * itself, lower-cased.
 */
export function signupAddressKey(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  const domain = e.slice(at + 1);
  if (!GMAIL.has(domain)) return e;
  const name = e.slice(0, at);
  const tag = name.indexOf("+");
  return `${(tag < 0 ? name : name.slice(0, tag)).replace(/\./g, "")}@gmail.com`;
}

/** What the edge read before it asks: the person, the workspace's mailbox, and the asks already made. */
export interface SignupAskFacts {
  /** The person's row as it stands, null when they are gone (erased, being erased, merged into another). */
  person: {
    email: string | null;
    stopped: boolean;
    suppressed: boolean;
    emailOffers: string | null;
    /**
     * They signed up on the website, so the email's words are true of them: they first reached the workspace through its
     * form (acquired_via website), or a sign-up of theirs was asked to confirm before (a customer who signs up later keeps
     * their first way in). Read by a member's ask; the form's own ask is a sign-up by being one.
     */
    fromWebsite: boolean;
  } | null;
  /** The workspace has a mailbox to send from (and the deployment a domain and a key to seal the link with). */
  mailbox: boolean;
  /** An ask to this person still within its days, sent or about to be. */
  open: boolean;
  /** Asks to this address (signupAddressKey) in the last ninety days. */
  addressAsks: number;
  /** Asks by this workspace in the last day. */
  workspaceToday: number;
  /** Of the workspace's asks in the last day, how many did not arrive. */
  failedToday: number;
}

/** Why a sign-up was not asked to confirm, or why it was asked once already. */
export type SignupAskRefusal =
  | "made_up"
  | "gone"
  | "not_from_website"
  | "no_email"
  | "not_their_address"
  | "already"
  | "stopped"
  | "suppressed"
  | "no_mailbox"
  | "open"
  | "address_limit"
  | "workspace_limit"
  | "failing";

/**
 * Whether a sign-up with `typed` as its address is asked to confirm, or why not: the person's own state first (an
 * address they do not have on their page is not theirs to be asked at: resolve_person fills and never overwrites),
 * then the workspace's mailbox, then the limits.
 */
export function signupAskRefusal(typed: string, f: SignupAskFacts): SignupAskRefusal | null {
  if (looksMadeUp(typed)) return "made_up";
  const p = f.person;
  if (!p) return "gone";
  if (!p.email || p.email !== typed.trim().toLowerCase()) return "not_their_address";
  if (p.emailOffers === "opted_in") return "already";
  if (p.stopped) return "stopped";
  if (p.suppressed) return "suppressed";
  if (!f.mailbox) return "no_mailbox";
  if (f.open) return "open";
  if (f.addressAsks >= SIGNUP_ASK_LIMITS.perAddress) return "address_limit";
  if (f.workspaceToday >= SIGNUP_ASK_LIMITS.perWorkspaceDay) return "workspace_limit";
  if (f.failedToday >= SIGNUP_ASK_LIMITS.failedStop) return "failing";
  return null;
}

/**
 * The line a sign-up's note gains (website-form.ts websiteFormNote): whether the person was emailed to confirm, and
 * why not where they were not. Null where there is nothing to say (no address on the form).
 */
export function signupAskLine(outcome: SignupAskRefusal | "asked" | null): string | null {
  switch (outcome) {
    case "asked":
      return "We emailed them to confirm. Offers by email start once they do.";
    case "made_up":
      return "The address looks made up by a program, so we did not email it.";
    case "not_their_address":
      return "They typed an address their page does not have, so we did not email it.";
    case "already":
      return "They already said yes to offers by email.";
    case "stopped":
      return "They asked you to stop messaging them, so we did not email them.";
    case "suppressed":
      return "Email to their address does not arrive, so we did not ask them to confirm.";
    case "no_mailbox":
      return "We could not email them to confirm: you have no email address yet (Settings › Connections › Email).";
    case "open":
      return "We already emailed them to confirm.";
    case "not_from_website":
      return "Only someone who signed up on your website is asked to confirm by email.";
    case "no_email":
      return "Their page has no email address to ask them at.";
    case "address_limit":
      return `We did not email them to confirm: their address was asked ${SIGNUP_ASK_LIMITS.perAddress} times already in ${SIGNUP_ASK_LIMITS.perAddressMs / DAY_MS} days.`;
    case "workspace_limit":
      return `We did not email them to confirm: today's ${SIGNUP_ASK_LIMITS.perWorkspaceDay} confirmations went out already.`;
    case "failing":
      return "We did not email them to confirm: too many of today's confirmations did not arrive.";
    default:
      return null;
  }
}

/** The confirmation email's words: the business's name and the link, nothing that sells. */
export function signupConfirmEmail(p: { business: string; link: string }): { subject: string; body: string } {
  const business = p.business.trim() || "us";
  return {
    subject: `Confirm your sign-up with ${business}`.slice(0, 200),
    body: [
      `You signed up on ${business}'s website for offers and news.`,
      `To get them by email, confirm here:\n${p.link}`,
      "If this wasn't you, ignore this email. Without your yes, no offers are sent.",
    ].join("\n\n"),
  };
}

/**
 * The same words as a letter (decision 0075): the business's look at the top, the two lines, and the page's own button
 * words on the link, so the email and the page it opens say one thing. The text part (signupConfirmEmail) is what a
 * text-only reader gets.
 */
export function signupConfirmEmailHtml(p: { business: string; link: string; look: WorkspaceLook }): string {
  const business = p.business.trim() || "us";
  const signedUp = `You signed up on ${business}'s website for offers and news.`;
  return letterHtml({
    look: { ...p.look, business: p.look.business.trim() || business },
    subject: signupConfirmEmail(p).subject,
    preview: signedUp,
    lines: [signedUp, "If this wasn't you, ignore this email. Without your yes, no offers are sent."],
    button: {
      words: confirmPageWords("ask", { business, address: null }).button ?? "Yes, send me offers",
      href: p.link,
    },
    foot: [],
  });
}

/** "j•••@example.com": enough of an address for its owner to know it, on a page anyone holding the link can open. */
export function maskAddress(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "your address";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

/** What the confirmation page shows: the question, its answer, or why the link opens nothing. */
export type ConfirmPageView = "ask" | "done" | "expired" | "address_changed" | "stopped" | "gone" | "unavailable";

/** The page's words for one view: its heading, its lines, and its button where it asks. */
export function confirmPageWords(
  view: ConfirmPageView,
  p: { business: string | null; address: string | null },
): { title: string; lines: string[]; button: string | null } {
  const business = p.business?.trim() || "This business";
  const at = p.address ? maskAddress(p.address) : "your address";
  switch (view) {
    case "ask":
      return {
        title: business,
        lines: [`Get offers and news from ${business} by email at ${at}?`],
        button: "Yes, send me offers",
      };
    case "done":
      return {
        title: "Done",
        lines: [`${business} will send offers and news to ${at}. Every email has a link to stop.`],
        button: null,
      };
    case "expired":
      return {
        title: "This link has ended",
        lines: [`Sign up again on ${business}'s website for a new one.`],
        button: null,
      };
    case "address_changed":
      return {
        title: "This link has ended",
        lines: [`It was for an address ${business} no longer has for you.`],
        button: null,
      };
    case "stopped":
      return {
        title: "Nothing changed",
        lines: [`${business} won't send you messages, because you asked them to stop.`],
        button: null,
      };
    case "gone":
      return { title: "Link not found", lines: ["This link doesn't open anything."], button: null };
    default:
      return {
        title: "Not now",
        lines: ["This page can't answer right now. Try the link again in a few minutes."],
        button: null,
      };
  }
}

/** A message as the person's page holds it: enough to find a sign-up's confirmation among them. */
interface HeldMessage {
  direction: string;
  channel?: string | null;
  status?: string;
  created_at: string;
  meta?: unknown;
}

/** Whether a held message is a sign-up's confirmation email (meta.source, as the edge wrote it). */
function isSignupAsk(m: HeldMessage): boolean {
  const meta = m.meta && typeof m.meta === "object" ? (m.meta as { source?: unknown }) : null;
  return m.direction === "outbound" && m.channel === "email" && meta?.source === SIGNUP_CONFIRM_SOURCE;
}

/** What the person's page asks of a website sign-up's confirmation: the first ask, or another once one ended. */
type SignupAskAct = "Ask to confirm" | "Ask again";

/** Who the person is, as the email offers row reads them: their answer, where they came from, and their address. */
interface AskedWho {
  /** They first reached the workspace through its website's form (People's came_from website). */
  emailOffers: string | null;
  fromWebsite: boolean;
  email: string | null;
  suppressed: boolean;
  stopped: boolean;
}

/**
 * What the person's page says of their website sign-up's confirmation, and whether a member may ask (again): the newest
 * ask among their messages, still open ("Asked to confirm", until when), past its days ("Did not confirm"), or one that
 * did not arrive ("Confirmation not delivered"). A member may ask someone who signed up on the website (it brought
 * them, or a sign-up of theirs was asked before) and has an address that takes email: first ("Ask to confirm", the row
 * keeping its own answer: `label` null) or once the last ask ended ("Ask again"). Null where there is nothing to say: no
 * ask and none to make, a yes (their answer says it), or a STOP.
 * Whether an ask goes is the edge's to judge again (signupAskRefusal, its limits); the page offers what may.
 */
export function signupAskOf(
  messages: readonly HeldMessage[],
  who: AskedWho,
  tz: string,
  nowMs: number,
): {
  label: "Asked to confirm" | "Did not confirm" | "Confirmation not delivered" | null;
  sub: string | null;
  act: SignupAskAct | null;
} | null {
  if (who.emailOffers === "opted_in" || who.stopped) return null;
  let newest: { m: HeldMessage; at: number } | null = null;
  let signedUp = who.fromWebsite;
  for (const m of messages) {
    if (!isSignupAsk(m)) continue;
    signedUp = true;
    if (m.status === "canceled") continue;
    const at = Date.parse(m.created_at);
    if (Number.isFinite(at) && (!newest || at > newest.at)) newest = { m, at };
  }
  const canAsk = signedUp && !!who.email && !who.suppressed;
  if (!newest) return canAsk ? { label: null, sub: null, act: "Ask to confirm" } : null;
  const asked = `asked ${fmtDate(newest.at, tz, nowMs)}`;
  const again = canAsk ? "Ask again" : null;
  if (newest.m.status === "failed") return { label: "Confirmation not delivered", sub: asked, act: again };
  const until = newest.at + SIGNUP_CONFIRM_MS;
  if (nowMs >= until) return { label: "Did not confirm", sub: asked, act: again };
  return { label: "Asked to confirm", sub: `${asked} · the link works until ${fmtDate(until, tz, nowMs)}`, act: null };
}
