/**
 * Every word a new conversation says (a conversation begins from the Inbox): the act in the Inbox's head, the sheet's two
 * steps, what each wire carries, who answers, the call, and what the routes refuse in. A page composes these and writes
 * none of its own. No trade's word, no key, nothing technical: what an owner between two customers needs to act.
 */
import { renderTemplate } from "../broadcasts/broadcasts";
import { clipAtWord } from "../conversations/message-words";
import { THREAD_CHANNEL_WORDS } from "../conversations/thread-channel";
import type { ConsentChannel } from "../consent/consent-channels";
import { inboxSlots } from "../templates/inbox-templates";
import { resolveParams } from "../templates/templates";
import { PLAN_NOTE_MAX, type PersonReachDto } from "./person-draft";
import type { WriteWay } from "./write-ways";

/**
 * What an Inbox address asks of the sheet: nothing (null), the pick (`inbox/new`), or one person (`inbox/new:<person>`).
 * The address is a door taken once: the Inbox opens the sheet and takes its own address back.
 */
export function newConversationOf(param: string | null | undefined): { personId: string | null } | null {
  if (param === "new") return { personId: null };
  if (param && param.startsWith("new:")) return { personId: param.slice("new:".length) || null };
  return null;
}

export const NEW_CONVERSATION_WORDS = {
  act: "New conversation",
  gate: "start a conversation",
  title: "New conversation",
  who: {
    sub: "Who is it for?",
    search: "Search people",
    none: "No one matches.",
    add: "Add someone new",
    name: "Name",
    optional: "optional",
    number: "Mobile number",
    go: "Continue",
    adding: "Adding…",
    notAdded: "Could not add them.",
  },
  thread: "Open their thread",
  page: "Open their page",
  reading: "Reading how they can be reached…",
  unread: "This could not be read just now.",
  how: { label: "Message or call", message: "Message", call: "Call" },
  about: {
    label: "What is it about?",
    hint: "A line is enough: follow up on their quote, tell them Saturday opened up.",
  },
  write: {
    message: "Write it",
    brief: "Brief me",
    writing: "Writing it…",
    shorter: "Shorter",
    warmer: "Warmer",
    rewrite: "Rewrite",
  },
  asks: "Before it is written",
  wire: "How it goes",
  subject: "Subject",
  words: "Message",
  approved: {
    label: "Approved message",
    none: (who: string) => `No approved message can go to ${who} yet.`,
    /** Which messages are not offered, and why, is one press away, never a paragraph under the choice. */
    why: "Why not the others?",
  },
  /** The line a first text carries, said before it is sent: nothing reaches their phone that the sender did not see. */
  firstText: (line: string) => `Their first text from you also carries: “${line}”`,
  then: {
    label: "When they answer",
    receptionist: "The receptionist answers",
    receptionistHint: "It will know your plan.",
    me: "I answer",
    meHint: "The receptionist stays quiet until you hand the thread back.",
    comesToYou: "Their answer comes to you, in Needs you.",
  },
  note: {
    label: "The receptionist will know",
    leaveOut: "Leave it out",
    putBack: "Tell the receptionist",
    empty: "Say what it is about above, or write the note here.",
  },
  send: "Send",
  cancel: "Cancel",
  close: "Close",
  // The house's one question about what was typed and not sent, word for word (the record kit's UnsavedAsk).
  leave: {
    question: "Throw away what you've written?",
    detail: "Nothing has been sent.",
    yes: "Yes, throw it away",
    no: "Keep writing",
  },
  done: "Done",
  change: "Change",
  sending: "Sending…",
  /** Said with the time it can still be stopped in, as a reply's is; with none left, it is on its way. */
  sent: (who: string, secs: number | null) =>
    secs ? `Message to ${who} queued · sends in ${secs} s unless you undo` : `On its way to ${who}.`,
  undone: "Send canceled. Nothing was delivered.",
  /** After an undo: the way back to what was written, which the tab kept. */
  again: "Open it again",
  /** An email whose address the server asked about: the act names where it goes, and pressing it is the yes. */
  sendTo: (address: string) => `Send to ${address}`,
  /** What gets a message to someone with no yes on record: their page is where a yes is recorded, in their words. */
  recordYes: "Record their yes on their page",
  noteLost: "It was sent. The note for the receptionist was not kept: add it on their page.",
  stillYours:
    "It was sent. The thread is still yours: hand it back from the thread when you want the receptionist to answer.",
  noWay: (who: string) => `No message can go to ${who} yet.`,
  call: {
    from: "Call from your phone",
    copy: "Copy the number",
    copied: "Copied the number",
    noNumber: "No number on their page.",
    doNotContact: "They are on your do-not-contact list.",
    after: "How did it go?",
    keep: "Keep as a note",
    tell: "The receptionist should know",
    kept: "Kept on their page.",
    /** How a call went, as the note keeps it: dated in its own words, since a note has no end. */
    noteOf: (day: string, after: string) => `${day}: the team called them. ${after.trim()}`,
  },
  brief: { know: "What we know", open: "Open with", say: "Say", avoid: "Leave out", ask: "Ask for" },
  personDoor: "Start a conversation",
  refusals: {
    priced: "The draft named a price you did not give, so it was not kept. Say it in your own words, or leave it out.",
    money:
      "The draft offered money you did not mention, so it was not kept. Say it in your own words, or leave it out.",
    approvedOnly: "Only a message WhatsApp approved ahead of time can go to them until they write. Pick one.",
    notThatWay: "A message cannot go to them that way.",
    noWords: "Write the message first.",
    noRoomForStop:
      "The first text to someone also carries the line that says how to stop, and this one leaves no room for it. Shorten it a little.",
    notYours: "This person is not in your workspace.",
  },
} as const;

/** A wire as the sheet names it: its word, and what it carries or why it cannot. "WhatsApp · an approved message only, until they write". */
export function writeWayWords(w: Pick<WriteWay, "wire" | "ok" | "why" | "carries" | "hours_left">): string {
  const name = THREAD_CHANNEL_WORDS[w.wire];
  if (!w.ok) return `${name} · ${w.why ?? NEW_CONVERSATION_WORDS.refusals.notThatWay}`;
  if (w.carries === "approved") return `${name} · an approved message only, until they write`;
  if (w.wire === "whatsapp" && w.hours_left !== null) {
    const h = w.hours_left;
    return `${name} · your own words, for ${h >= 1 ? `${h} more ${h === 1 ? "hour" : "hours"}` : "less than an hour"}`;
  }
  return `${name} · your own words`;
}

/**
 * An approved message as this person will read it: its own slots filled as the send fills them (core reply.ts
 * shapeTemplate, by inboxSlots and resolveParams), the booking link without its scheme, as the wire carries it. With
 * nothing to fill them from, the message as it is filed.
 */
export function approvedWordsFor(
  t: { name: string; body_preview: string | null; variables?: unknown },
  fills: PersonReachDto["fills"],
): string {
  if (!fills) return t.body_preview ?? "";
  const params = resolveParams(inboxSlots(t), {
    firstName: fills.first_name,
    businessName: fills.business_name,
    bookingLink: fills.booking_link?.replace(/^https?:[/][/]/, "") ?? null,
  });
  return renderTemplate(t.body_preview, params) || (t.body_preview ?? "");
}

/** A wire's short name, for a control that has no room for more. */
export const writeWireName = (wire: ConsentChannel): string => THREAD_CHANNEL_WORDS[wire];

/**
 * The note the receptionist reads when nobody wrote one: the day in its own words (a note has no end, so it says when it
 * was true), what was done, and what it was about. `day` is the business's own date, as the page says it ("Oct 7").
 */
export function planNoteOf(day: string, how: "message" | "call", about: string): string {
  const did = how === "call" ? "the team called them" : "the team wrote to them";
  // A plan may be longer than a note the receptionist reads (PLAN_NOTE_MAX): cut after a whole word, never refused. One
  // short of the limit, since the cut adds its ellipsis.
  return clipAtWord(`${day}: ${did}. It was about: ${about.trim()}`, PLAN_NOTE_MAX - 1);
}
