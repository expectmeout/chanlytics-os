/**
 * What a request's page in the Inbox says (00680; the Forms canvas, board Inbox): its head, how the person came, the
 * reply's card in each of its states, and the two quiet presses every open request has. The Inbox's own: no other tree
 * says these. A person is "they" throughout: a form never asks who someone is.
 */
import { agoWords, formatPhoneDisplay, throughPlace, type FormRequestDto } from "@chanlytics/contracts";

export const REQUEST_WORDS = {
  back: "Inbox",
  reading: "Opening this request…",
  gone: {
    title: "That request isn't here any more",
    body: "It was removed, or it belongs to another workspace.",
    act: "Show the Inbox",
  },
  unread: {
    title: "This request couldn't be read just now",
    body: "Nothing is lost. It is read again when you come back to it.",
    act: "Read it again",
  },
  /** How the person came, under their answers. */
  through: (place: string | null) => throughPlace(place),
  knew: "you knew them",
  isNew: "new to you",
  reachLabel: (email: boolean, phone: boolean) =>
    [email ? "Email" : "", phone ? "Phone" : ""].filter(Boolean).join(" · "),
  draft: {
    writing: "AI is writing a reply",
    wrote: "AI wrote this reply",
    changed: "AI wrote this reply · changed by you",
    own: "Reply",
    byEmail: "By email to",
    inChat: "In the chat they already have",
    placeholder: "Write the reply…",
    send: "Send",
    sending: "Sending…",
    askAi: "Ask AI to draft it",
    again: "Ask AI again",
    couldNot: "AI couldn't write a reply just now. Write it here, or ask again.",
    aria: "The reply",
    /** What AI's reply is told it is about, in the owner's words; what they asked goes beside it, as theirs. */
    about: "A reply to what they asked on the form.",
  },
  sent: {
    waiting: (recipient: string) => `Message to ${recipient} waiting`,
    undo: "Undo",
    tooLate: "It had already gone.",
    kept: "Taken back. The request is open again.",
  },
  quiet: {
    mark: "Mark answered",
    notReal: "Not a real request",
    marked: "Marked answered",
    held: (form: string) => `Not a real request · in ${form}'s held pile for 30 days`,
    undo: "Undo",
  },
  /** Its reply is still going (00726): the seconds it can be taken back, then the wire. Answered once it has gone. */
  sending: {
    title: "Sending…",
    body: "Your reply is on its way. If it doesn't reach them, this request comes back to Needs you.",
  },
  /** Nobody answered it and its sixty days in Needs you passed (00726): a quiet line over a request still answerable. */
  aged: "Never answered · left Needs you after 60 days",
  /** Needs you's line that reads on past the requests it lists (the list holds 200; the count has no cap). */
  more: {
    title: (n: number) => `${n} more ${n === 1 ? "request" : "requests"} from your forms`,
    body: "Older ones, waiting too.",
    act: "Show more",
    unread: "Couldn't load them",
    again: "Try again",
  },
  answered: {
    reply: "Answered by a reply sent from here",
    conversation: "Answered when they wrote with its code",
    marked: "Marked answered by the team",
    open: "Open the conversation",
    reopen: "Not answered after all",
  },
  held: {
    title: "Held for a look",
    why: {
      hidden_field: "A part of the form people cannot see was filled in.",
      too_fast: "It was filled in faster than a person can.",
      too_many: "The same sender sent several in a short time.",
      member: "Someone on the team said it wasn't a real request.",
      elsewhere: "It was sent straight to the form's address, not from its page.",
    },
    letThrough: "Let it through",
    leave: "Leave it",
    left: "It goes by itself after 30 days.",
  },
  test: {
    title: "A test",
    body: "It told nobody and counts nowhere. It goes by itself after 7 days.",
  },
  phoneOnly: {
    title: "Waiting for their message",
    body: "They gave a number only, so nothing can be texted to them first. If they write, AI answers them and this closes.",
    call: "Call them",
  },
  cantSend: {
    title: "Nothing can be sent to them",
    call: "Call them",
  },
  /** How to reach them could not be checked: a read that failed, said as one (docs/words.md), with its one act. */
  unchecked: {
    title: "Couldn't check how to reach them",
    act: "Try again",
  },
  unreached: {
    title: "The reply didn't reach them",
    body: "It left and came back, so they have no answer yet. Send another to an address that works, or call.",
    sendTo: (address: string) => `Send to ${address}`,
    /** What the press does beside sending: said before it, since it changes their page. */
    takes: (address: string) => `Their page takes ${address}.`,
  },
  otherEmail: {
    title: "They typed a different email this time",
    body: (page: string) => `Their page says ${page}. Where should the reply go?`,
    typed: "The one on this request. Their page takes it.",
    page: "The one on their page",
    /** They said yes to offers by email from the address on their page: a yes that address gave, which ends with it. */
    offersEnd:
      "Their yes to offers by email was given from the one on their page, and ends if their page takes another.",
  },
  failed: "That didn't go through. Nothing was sent.",
  /**
   * The time a request asked for (00691; the canvas's board "Ask for a time: you confirm it"): answered as a time asked
   * in a chat is, Booked it or Can't, and then told to them from here. The two presses' own words are contracts'
   * (BOOKING_REQUEST_WORDS), as Today's, the thread's and the Calendar's are.
   */
  time: {
    asked: "They asked for a time",
    booked: "Booked",
    cant: "You couldn't take it",
    held: (until: string) => `Held for them until ${until}`,
    onCalendar: "On your calendar",
    notHeld: "No longer held on your calendar",
    foot: "On your calendar as Requested. Nothing is booked until you say.",
    taken: {
      title: "That time is booked now",
      body: (name: string, when: string) =>
        `You booked ${name || "someone else"} for ${when}. Tell them it can't, with other times.`,
      too: "Booked it too",
    },
    lapsed: {
      title: "Not confirmed in time",
      body: (until: string) =>
        `It was held until ${until} and may have gone since, so it can't be booked from here. Tell them what's open now.`,
    },
    /** What the page says once a press is taken: the reply that tells them is below. */
    said: { booked: "Booked. Tell them below.", cant: "Let go. Tell them below." },
    /** What AI's reply is told of the time, beside what they asked (the request's note, told as theirs). */
    aboutBooked: (when: string) =>
      `The business booked the time they asked for: ${when}. Tell them they are booked, and promise nothing else.`,
    aboutGone: (offer: string) =>
      `The time they asked for can't be booked. Tell them so, in these words or close: ${offer}`,
  },
} as const;

/** "Colour consultation · 2h ago": which form and how long ago, under the person's name. */
export const requestSubline = (
  request: Pick<FormRequestDto, "heading" | "created_at"> & { site?: string | null },
  nowMs: number,
): string =>
  [request.heading, request.site ? `from ${request.site}` : null, agoWords(Date.parse(request.created_at), nowMs)]
    .filter(Boolean)
    .join(" · ");

/** Who a request is from, as its head names them: what they typed, else their address or their number. */
export const requestWho = (request: Pick<FormRequestDto, "reach" | "person">): string =>
  request.reach.name ||
  request.person?.name ||
  request.reach.email ||
  formatPhoneDisplay(request.reach.phone) ||
  "Someone";

/** The line under the answers: through which place, and whether the business knew them before. */
export function requestCameWords(request: Pick<FormRequestDto, "place" | "sender">, knew: boolean | null): string {
  return [
    REQUEST_WORDS.through(request.place),
    request.sender,
    knew === null ? null : knew ? REQUEST_WORDS.knew : REQUEST_WORDS.isNew,
  ]
    .filter(Boolean)
    .join(" · ");
}
