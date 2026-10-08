/**
 * Whether and how a person may be reached from their page: the booking link's and the proposal's buttons by the wire
 * a reply goes out on, what a reply may be in the owner's words, the words a proposal goes with, and the one rule
 * every send the page offers asks (mayReach). Its one import is the stop's words (consent.ts); the row (person-row.ts),
 * the page and the deal sheet read it.
 */
import { optOutWords } from "../consent/consent";
import { PERSON_CHANNEL_WORDS, REPLY_VIA } from "./person-words";

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
 * Where a reply to a person goes, its window when the wire has one, and whether mail to their address has stopped
 * (isEmailStopped): the one fact the booking link, the proposal and the Replies row each read. `emailStopped` is required,
 * since a reader that forgets it offers an email the route then refuses.
 */
interface ReplyReach {
  via: "WhatsApp" | "Text" | "Email" | null;
  window: { open: boolean; hoursLeft: number } | null;
  emailStopped: boolean;
}

/**
 * What the booking-link button says, by the wire a reply goes out on.
 *
 * Nothing is sent from the button: it opens the thread with the link ready in
 * the composer, or, where WhatsApp's window has shut, lets the thread offer the
 * approved template. Three pages carried their own two-way copy of these words,
 * so on an email-only person they read "Text the booking link" -- and before
 * the window was channel-aware, "Send the booking-link template", a template
 * that person cannot receive. `ready` is whether the composer may be filled. Where the reply goes by email and their
 * address has stopped accepting mail nothing is ready, and the title says why.
 */
export function bookingLinkAction(reach: ReplyReach): { label: string; title: string; ready: boolean } {
  const { via, window: win } = reach;
  const notReady = (title: string) => ({ label: "Send the booking link", title, ready: false });
  if (via === "Email")
    return reach.emailStopped
      ? notReady(EMAIL_CANT_REACH)
      : {
          label: "Email the booking link",
          title: "Opens the thread with the link ready to send by email",
          ready: true,
        };
  if (via === "Text")
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
 * mail is the same: no button, and the Replies row's own sentence.
 */
export function proposalAction(
  reach: ReplyReach,
  sentWords: string | null,
): { label: string; title: string; ready: boolean } {
  const { via, window: win } = reach;
  const again = sentWords ? " again" : "";
  const sent = sentWords ? ` · sent ${sentWords}` : "";
  const notReady = (title: string) => ({ label: "Send the proposal", title, ready: false });
  if (via === "Email")
    return reach.emailStopped
      ? notReady(EMAIL_CANT_REACH)
      : {
          label: `Email the proposal${again}`,
          title: `Opens the thread with the proposal link ready to send by email${sent}`,
          ready: true,
        };
  if (via === "Text")
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

/** The one thing a row says under the identifier: nothing sent to that address arrives (repliesWords is the page's sentence). */
const EMAIL_STOPPED_SHORT = "Stopped accepting mail";
/** The wires a person writes on, in the order a row names them (person-row.ts channelsOf): WhatsApp, a text, email. */
const WRITTEN_WIRES = ["whatsapp", "sms", "email"] as const;

/**
 * What a People row says of reaching a person (8 Oct 2026): the wire a reply goes out on over the one way to reach them
 * there, a line under them only for an address that stopped accepting mail, and every wire with the Replies row's
 * sentence as the cell's tip. It said the channels as a strip of glyphs, where WhatsApp and a text share one, and then
 * the number. WhatsApp's window is the tip's to say and never a line: shut is the ordinary state of a WhatsApp thread
 * (a day after they last wrote), so a line for it stood on nearly every row.
 *
 * The wire is the one they last wrote on (`lastChannel`, 00320), which is where a reply to them goes and what the
 * row's own `replyVia` says too (person-row.ts replyChannelOfRow, since 8 Oct 2026; it read WhatsApp for anyone who had
 * written and was not email-only, which called a person who only ever texted "WhatsApp"). Where the row does not say
 * where they last wrote, the word is the first wire words have travelled between them, in the order a row names its
 * wires (WhatsApp, a text, email), and for someone who only ever called, the phone.
 *
 * What a reply may be is the row's own answer, `replyVia` with its window: the sentence the booking-link button on the
 * same row and the Replies row on their page are written from, so the three cannot disagree. For someone who has
 * written nothing themselves that is WhatsApp's rule, whatever wire our words went by: a row does not hold which wire
 * our own words last went by, which is where the reply route answers such a thread (the dashboard's replyChannelOf),
 * so it says the strictest, as replyChannelOfRow does, and their page says it exactly; the tip said "Any time, by
 * text" of them while the button beside it said only an approved message could go.
 */
export interface RowReachWords {
  /** "WhatsApp", "Text" or "Email" (REPLY_VIA); "Phone" for someone who only ever called; null with no wire at all. */
  wire: string | null;
  /** The address when the reply goes by email, else the number, else the address; null where the identifier is the name already. */
  id: string | null;
  /** An address that stopped accepting mail, where the reply goes by email; null otherwise, and where the State says why none may. */
  may: string | null;
  /** Every wire in words, then what a reply may be as the Replies row says it; empty where nothing is known. */
  tip: string;
}

/** `named`: the row has a name of its own. Named by a number or an address, the identifier is the name, and the cell says the wire alone. */
export function rowReachWords(
  p: {
    name: string;
    phone: string | null;
    email: string | null;
    channels: readonly string[];
    /** The channel of the last message they wrote themselves, where the row knows it. */
    lastChannel: "whatsapp" | "sms" | "email" | null;
    /** The wire a reply to them goes out on and its window, as the row answers both (rowReplyOf). */
    replyVia: "WhatsApp" | "Text" | "Email" | null;
    replyWindow: { open: boolean; hoursLeft: number } | null;
    emailSuppressed: boolean;
    stopped: boolean;
    channelWords: string;
  },
  named: boolean,
): RowReachWords {
  const wrote = p.lastChannel ?? WRITTEN_WIRES.find((c) => p.channels.includes(c)) ?? null;
  const via = wrote ? REPLY_VIA[wrote] : null;
  const wire = via ?? (p.channels.includes("voice") ? PERSON_CHANNEL_WORDS.voice : null);
  const id = !named ? null : via === "Email" ? p.email || p.phone : p.phone || p.email;
  const may = !p.stopped && p.replyVia === "Email" && p.emailSuppressed ? EMAIL_STOPPED_SHORT : null;
  const replies = p.stopped
    ? null
    : repliesWords(p.replyVia, p.replyWindow, { optedOut: false, who: p.name, emailStopped: p.emailSuppressed });
  return { wire, id: id ?? null, may, tip: [p.channelWords, replies].filter(Boolean).join(" · ") };
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
