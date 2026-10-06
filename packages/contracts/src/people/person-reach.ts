/**
 * Whether and how a person may be reached from their page: the booking link's and the proposal's buttons by the wire
 * a reply goes out on, what a reply may be in the owner's words, the words a proposal goes with, and the one rule
 * every send the page offers asks (mayReach). Its one import is the stop's words (consent.ts); the row (person-row.ts),
 * the page and the deal sheet read it.
 */
import { optOutWords } from "../consent/consent";

/**
 * What a person's page says of an address that stopped accepting mail (a permanent bounce, a complaint or the provider's
 * own list: isEmailStopped), short: `people_list` carries that it stopped and not why, so this says that and no more.
 * The Replies row says it as a sentence (EMAIL_CANT_REACH) and the address's own fact (emailFactWords) as a tag; the
 * thread's reply box, which reads the reason, says it with the day (emailStoppedWords).
 */
const EMAIL_STOPPED_TAG = "stopped accepting mail";

/**
 * Why email cannot go to them, in one sentence: the Replies row says it, and so does every button that would have sent
 * by email -- the booking link's, the proposal's and the deal card's send -- where the address has stopped.
 */
export const EMAIL_CANT_REACH = `Email can't reach them: their address ${EMAIL_STOPPED_TAG}`;

/**
 * What the booking-link button says, by the wire a reply goes out on.
 *
 * Nothing is sent from the button: it opens the thread with the link ready in
 * the composer, or, where WhatsApp's window has shut, lets the thread offer the
 * approved template. Three pages carried their own two-way copy of these words,
 * so on an email-only person they read "Text the booking link" -- and before
 * the window was channel-aware, "Send the booking-link template", a template
 * that person cannot receive. `ready` is whether the composer may be filled. Where the reply goes by email and their
 * address has stopped accepting mail (`emailStopped`, isEmailStopped: required, since a reader that forgets it offers an
 * email the route then refuses) nothing is ready, and the title says why.
 */
export function bookingLinkAction(
  replyVia: "WhatsApp" | "Text" | "Email" | null,
  win: { open: boolean; hoursLeft: number } | null,
  emailStopped: boolean,
): { label: string; title: string; ready: boolean } {
  const notReady = (title: string) => ({ label: "Send the booking link", title, ready: false });
  if (replyVia === "Email")
    return emailStopped
      ? notReady(EMAIL_CANT_REACH)
      : {
          label: "Email the booking link",
          title: "Opens the thread with the link ready to send by email",
          ready: true,
        };
  if (replyVia === "Text")
    return {
      label: "Text the booking link",
      title: "Opens the thread with the link ready to send as a text",
      ready: true,
    };
  if (win && win.open)
    return {
      label: "Text the booking link",
      title: `Opens the thread with the link ready to send · any message for ${win.hoursLeft}h more`,
      ready: true,
    };
  return notReady(
    "Only an approved message reaches them until they write again; their thread offers the one with the link",
  );
}

/** The owner's proposal for a person (00154), for the page: the address, where it lives, and whether it went out. */
export interface PersonProposalVM {
  url: string;
  host: string;
  /** The newest message that carried the address and went out: when, and on which wire. */
  sent: { at: string; via: string | null } | null;
}

/** The words the one-step send carries into the composer — once, for the page and the thread. */
export function proposalMessage(url: string): string {
  return `Here's the proposal we put together for you: ${url}`;
}

/**
 * What the send-the-proposal button says, by the wire a reply goes out on:
 * bookingLinkAction's twin. Nothing is sent from the button: it opens the
 * thread with the address ready in the composer. There is no template for a
 * proposal, so where WhatsApp's window has shut there is no button (`ready`
 * false) -- the About rail's Replies row already says why. "again" once
 * the address has gone out, so the page says what it knows without a second line. An address that stopped accepting
 * mail (`emailStopped`, as bookingLinkAction has it) is the same: no button, and the Replies row's own sentence.
 */
export function proposalAction(
  replyVia: "WhatsApp" | "Text" | "Email" | null,
  win: { open: boolean; hoursLeft: number } | null,
  sentWords: string | null,
  emailStopped: boolean,
): { label: string; title: string; ready: boolean } {
  const again = sentWords ? " again" : "";
  const sent = sentWords ? ` · sent ${sentWords}` : "";
  const notReady = (title: string) => ({ label: "Send the proposal", title, ready: false });
  if (replyVia === "Email")
    return emailStopped
      ? notReady(EMAIL_CANT_REACH)
      : {
          label: `Email the proposal${again}`,
          title: `Opens the thread with the proposal link ready to send by email${sent}`,
          ready: true,
        };
  if (replyVia === "Text")
    return {
      label: `Text the proposal${again}`,
      title: `Opens the thread with the proposal link ready to send as a text${sent}`,
      ready: true,
    };
  if (win && win.open)
    return {
      label: `Send the proposal${again}`,
      title: `Opens the thread with the proposal link ready to send · any message for ${win.hoursLeft}h more${sent}`,
      ready: true,
    };
  return notReady("Only an approved message reaches them until they write again, so the proposal waits until they do");
}

/** The person's address as the About rail and the Pipeline peek say it: the address, and that it stopped where it has. */
export function emailFactWords(email: string, stopped: boolean): string {
  return stopped ? `${email} · ${EMAIL_STOPPED_TAG}` : email;
}

/**
 * What a reply to them may be, in the owner's words: the person page's Replies and the Pipeline peek's, one sentence.
 * WhatsApp takes any message for a day after they last wrote, and after that only a message WhatsApp approved ahead
 * of time; a text or an email goes any time, unless their address has stopped accepting mail, which says so. It said
 * "Reply window · Closed · template only", and before it was channel-aware it said so to a person who had only ever
 * emailed. Null with no wire a reply goes out on.
 */
export function repliesWords(
  via: "WhatsApp" | "Text" | "Email" | null,
  window: { open: boolean; hoursLeft: number } | null,
  /**
   * Whether they asked to stop: required, because a reader that forgets it says "Any time" over a STOP. And whether mail
   * to their address has stopped (isEmailStopped): required for the same reason, since "Any time, by email" over an
   * address that bounced is the reply a person writes and the route refuses.
   */
  stop: { optedOut: boolean; who: string; emailStopped: boolean },
): string | null {
  if (stop.optedOut) return optOutWords(stop.who);
  if (via === "Email") return stop.emailStopped ? EMAIL_CANT_REACH : "Any time, by email";
  if (via === "Text") return "Any time, by text";
  if (via !== "WhatsApp" || !window) return null;
  if (!window.open) return "Approved messages only, until they write again";
  const h = window.hoursLeft;
  return h >= 1 ? `Any message, for ${h} more ${h === 1 ? "hour" : "hours"}` : "Any message, for less than an hour";
}

/**
 * Whether the page may reach them at all: a conversation to write in, no stop, no do-not-contact, and a wire that is
 * not an address that stopped accepting mail (`emailSuppressed`, isEmailStopped: the reply goes by email, and the route
 * refuses it). It is not whether free text can go now (proposalAction's and bookingLinkAction's `ready`): where
 * WhatsApp takes only an approved message, their thread offers one. Every send the page offers asks this one rule: the
 * More menu's (personActs) and the deal card's (deal-sheet.ts dealSendOf).
 */
export function mayReach(p: {
  openThread: string | null;
  consent: { state: string; dnc: boolean };
  replyVia: "WhatsApp" | "Text" | "Email" | null;
  emailSuppressed: boolean;
}): boolean {
  return (
    !!p.openThread &&
    p.consent.state !== "opted_out" &&
    !p.consent.dnc &&
    !(p.replyVia === "Email" && p.emailSuppressed)
  );
}
