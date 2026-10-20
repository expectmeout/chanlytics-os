import { renderTemplate } from "../broadcasts/broadcasts.js";
import { clipAtWord } from "../conversations/message-words.js";
import { THREAD_CHANNEL_WORDS } from "../conversations/thread-channel.js";
import { inboxSlots } from "../templates/inbox-templates.js";
import { resolveParams } from "../templates/templates.js";
import { PLAN_NOTE_MAX } from "./person-draft.js";
import { WRITE_WAY_REFUSED } from "./write-ways.js";
export function newConversationOf(param) {
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
    none: "No one matches."
  },
  thread: "Open their thread",
  page: "Open their page",
  reading: "Reading how they can be reached\u2026",
  unread: "This could not be read just now.",
  how: { label: "Message or call", message: "Message", call: "Call" },
  about: {
    label: "What is it about?",
    // What a line looks like is the box's own, until something is typed (Ruben, 10 Oct 2026: a sentence under it said it).
    placeholder: "Follow up on their quote, or Saturday opened up"
  },
  write: {
    message: "Write it",
    brief: "Brief me",
    writing: "Writing it\u2026",
    shorter: "Shorter",
    warmer: "Warmer",
    rewrite: "Rewrite"
  },
  asks: "Before it is written",
  wire: "How it goes",
  /** The ways it cannot go, one press away under the way it goes: "Why not Text or Email?". */
  heldWhy: (names) => `Why not ${names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0]}?`,
  subject: "Subject",
  words: "Message",
  approved: {
    label: "Approved message",
    none: (who) => `No approved message can go to ${who} yet.`,
    /** Which messages are not offered, and why, is one press away, never a paragraph under the choice. */
    why: "Why not the others?"
  },
  /** The line a first text carries, said before it is sent: nothing reaches their phone that the sender did not see. */
  firstText: (line) => `Their first text from you also carries: \u201C${line}\u201D`,
  then: {
    label: "When they answer",
    receptionist: "The receptionist answers",
    receptionistHint: "Knows your plan",
    me: "I answer",
    meHint: "It stays quiet until you hand it back",
    comesToYou: "Their answer comes to you, in Needs you."
  },
  note: {
    label: "Note for the receptionist",
    leaveOut: "Leave it out",
    putBack: "Add a note for the receptionist",
    empty: "What it should know"
  },
  send: "Send",
  cancel: "Cancel",
  close: "Close",
  // The house's one question about what was typed and not sent, word for word (the record kit's UnsavedAsk).
  leave: {
    question: "Discard what you wrote?",
    detail: null,
    yes: "Discard",
    no: "Keep editing"
  },
  done: "Done",
  change: "Change",
  sending: "Sending\u2026",
  /** Said with the time it can still be stopped in, as a reply's is; with none left, it is on its way. */
  sent: (who, secs) => secs ? `Message to ${who} queued \xB7 sends in ${secs} s unless you undo` : `On its way to ${who}.`,
  undone: "Send canceled. Nothing was delivered.",
  /** After an undo: the way back to what was written, which the tab kept. */
  again: "Open it again",
  /** An email whose address the server asked about: the act names where it goes, and pressing it is the yes. */
  sendTo: (address) => `Send to ${address}`,
  /** What gets a message to someone with no yes on record: their page is where a yes is recorded, in their words. */
  recordYes: "Record their yes on their page",
  noteLost: "It was sent. The note for the receptionist was not kept: add it on their page.",
  stillYours: "It was sent. The thread is still yours: hand it back from the thread when you want the receptionist to answer.",
  noWay: (who) => `No message can go to ${who} yet.`,
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
    noteOf: (day, after) => `${day}: the team called them. ${after.trim()}`
  },
  brief: { know: "What we know", open: "Open with", say: "Say", avoid: "Leave out", ask: "Ask for" },
  personDoor: "Start a conversation",
  refusals: {
    priced: "The draft named a price you did not give, so it was not kept. Say it in your own words, or leave it out.",
    money: "The draft offered money you did not mention, so it was not kept. Say it in your own words, or leave it out.",
    approvedOnly: "Only a message WhatsApp approved ahead of time can go to them until they write. Pick one.",
    notThatWay: WRITE_WAY_REFUSED,
    noWords: "Write the message first.",
    noRoomForStop: "The first text to someone also carries the line that says how to stop, and this one leaves no room for it. Shorten it a little.",
    notYours: "This person is not in your workspace."
  }
};
export function writeWayWords(w) {
  const name = THREAD_CHANNEL_WORDS[w.wire];
  if (!w.ok) return `${name} \xB7 ${w.why ?? NEW_CONVERSATION_WORDS.refusals.notThatWay}`;
  if (w.carries === "approved") return `${name} \xB7 an approved message only, until they write`;
  if (w.wire === "whatsapp" && w.hours_left !== null) {
    const h = w.hours_left;
    return `${name} \xB7 your own words, for ${h >= 1 ? `${h} more ${h === 1 ? "hour" : "hours"}` : "less than an hour"}`;
  }
  return `${name} \xB7 your own words`;
}
export function approvedWordsFor(t, fills) {
  if (!fills) return t.body_preview ?? "";
  const params = resolveParams(inboxSlots(t), {
    firstName: fills.first_name,
    businessName: fills.business_name,
    bookingLink: fills.booking_link?.replace(/^https?:[/][/]/, "") ?? null
  });
  return renderTemplate(t.body_preview, params) || (t.body_preview ?? "");
}
export const writeWireName = (wire) => THREAD_CHANNEL_WORDS[wire];
export function planNoteOf(day, how, about) {
  const did = how === "call" ? "the team called them" : "the team wrote to them";
  return clipAtWord(`${day}: ${did}. It was about: ${about.trim()}`, PLAN_NOTE_MAX - 1);
}
