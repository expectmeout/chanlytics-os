import { POLICY_MODE_WORDS, POLICY_MODES } from "../workspace-config/policy-classes.js";
import { handoffChatWords, transferWords } from "./handoff-words.js";
const BOOLEAN_INPUTS = {
  voiceLive: true,
  whatsappLive: true,
  hasCalendarFeed: true,
  hasBookingLink: true,
  hasBookingTemplate: true,
  hasHandoffNumber: true,
  hasEscalateWhen: true,
  visionOn: true,
  bookingHeld: true
};
export function abilityRows(i) {
  if (!i || typeof i !== "object")
    throw new TypeError(
      "abilityRows needs its inputs: which lines answer, what is filled in, and what the Autonomy tab holds."
    );
  const notBoolean = Object.keys(BOOLEAN_INPUTS).filter(
    (k) => typeof i[k] !== "boolean"
  );
  if (notBoolean.length) {
    throw new TypeError(
      `abilityRows needs true or false for ${notBoolean.join(", ")}: missing or not a boolean, each would be drawn as false.`
    );
  }
  if (!POLICY_MODES.includes(i.replyMode)) {
    throw new TypeError(
      `abilityRows needs replyMode, the Autonomy tab's Replies row (${POLICY_MODES.join(", ")}), not ${JSON.stringify(i.replyMode)}: every chat ability turns on it.`
    );
  }
  const repliesHeld = i.replyMode === "ask" || i.replyMode === "never";
  const chatAnswers = i.whatsappLive && !repliesHeld;
  const both = { voice: i.voiceLive, whatsapp: chatAnswers };
  const answering = i.voiceLive || chatAnswers;
  const callSendsLink = i.voiceLive && i.whatsappLive && i.hasBookingTemplate;
  const linkGoes = i.hasBookingLink && chatAnswers && !i.bookingHeld;
  const linkIsChatsAlone = linkGoes && i.voiceLive && !callSendsLink;
  const inChat = linkIsChatsAlone ? " in chat" : "";
  const bookingDetail = !i.hasBookingLink ? "No booking link, so it takes their details for you to follow up." : !i.whatsappLive ? i.voiceLive ? "It goes out on WhatsApp, which isn't connected here, so on a call it offers to have someone follow up instead." : "It goes out on WhatsApp, which isn't connected here." : i.bookingHeld ? "Your Autonomy tab holds bookings for you to confirm, so when someone asks to book, it sends no link: it tells them someone from the team will confirm." : !i.voiceLive ? "It sends it in the thread." : callSendsLink ? "On a call it sends it to the caller's WhatsApp, when their number has one, and says so. In chat it sends it in the thread." : "In chat it sends it in the thread. On a call it can't yet: sending it to a caller's WhatsApp needs an approved booking-link message.";
  const rows = [
    {
      id: "answer",
      title: "Answer from your facts",
      // facts_used is the chat brain's (brain.ts); the phone agent reports an outcome, not its facts.
      detail: "Hours, address, services, your notes. In chat it also records which facts it leaned on, so you can see why it said what it said.",
      channels: both,
      runsOn: { label: "Name and hours", row: "name" },
      ready: answering,
      // The facts it answers from are the rows' own subject, and a missing one is the gap line's (businessGap).
      missing: false
    },
    {
      id: "open_times",
      title: "Say which times are open",
      // describeOpenings hands chat up to five days (availability.ts maxDays), not one.
      // With bookings held, a call still offers the openings (call-start.ts; check_availability, with the team
      // confirming) and chat is handed them, while layerTwo replaces a booking reply carrying the link. So this
      // says what holds on both: it has them, and a request to book gets no link.
      detail: !i.hasCalendarFeed ? linkGoes ? `No calendar to read, so it does not guess at open times \u2014${inChat} it sends the link instead.` : "No calendar to read, so it does not guess at open times." : i.bookingHeld ? "It is handed the openings on a call and in chat, but your Autonomy tab holds bookings for you to confirm, so when someone asks to book, no link follows." : `On a call it asks the calendar at that moment. In chat it is handed the next few days' openings with each message. It offers up to three that fit${linkGoes ? `, then the link${inChat}` : ""}.`,
      channels: { voice: i.voiceLive && i.hasCalendarFeed, whatsapp: chatAnswers && i.hasCalendarFeed },
      runsOn: { label: "Your calendar link", row: "calendar" },
      ready: answering && i.hasCalendarFeed,
      missing: !i.hasCalendarFeed
    },
    {
      id: "booking_link",
      title: "Send the booking link",
      detail: bookingDetail,
      // The call's send goes through the same outbound gate the Replies row holds, so a
      // workspace whose replies are held has no channel here at all -- and neither has one
      // where there is no link to send, or where the Autonomy tab confirms bookings itself.
      channels: { voice: linkGoes && callSendsLink && !repliesHeld, whatsapp: linkGoes },
      runsOn: { label: "The booking link", row: "booking_link" },
      ready: linkGoes,
      missing: !i.hasBookingLink
    },
    {
      id: "transfer",
      title: "Put a caller through",
      // What a transfer does, in the words the hand-off row's fold says it in too (transferWords).
      detail: transferWords(i.hasHandoffNumber),
      channels: { voice: i.voiceLive && i.hasHandoffNumber, whatsapp: false },
      // The transfer number's one editor, Who you are's "Transfer number" (the plan's Task 3.2 decision): the
      // hand-off row (escalate_when) shows the number and opens this same row, and edits only the reasons.
      runsOn: { label: "The transfer number", row: "handoff_number" },
      ready: i.voiceLive && i.hasHandoffNumber,
      missing: !i.hasHandoffNumber
    },
    {
      id: "handoff",
      title: "Hand the thread to you",
      // A hand-off pauses the thread for pause_hours and no longer (inbound.ts, steps.ts); after that the receptionist
      // answers the next message itself, Needs you or not. The base triggers hold with no reasons at all -- they asked
      // for a person, or it cannot help -- so the owner's reasons widen the hand-off; they do not switch it on. The
      // hand-off row's fold says it in the same words (handoffChatWords).
      detail: handoffChatWords({ hasEscalateWhen: i.hasEscalateWhen, pauseHours: i.pauseHours }),
      channels: { voice: false, whatsapp: chatAnswers },
      runsOn: { label: "Your reasons", row: "escalate_when" },
      ready: chatAnswers,
      // The base triggers hold with no reasons at all, so nothing here is missing.
      missing: false
    },
    {
      id: "vision",
      title: "Look at a photo",
      detail: i.visionOn ? "It says what it sees and suggests the next step, under the rules it always keeps." : "Off. A photo is passed to a person.",
      channels: { voice: false, whatsapp: chatAnswers && i.visionOn },
      // Its switch is on this row since 18 Oct 2026 (it sat in the rules fold, among limits): no other row supplies it.
      runsOn: null,
      ready: chatAnswers && i.visionOn,
      // Off is the one state an owner changes from this card.
      missing: !i.visionOn,
      on: i.visionOn
    }
  ];
  const held = repliesHeld ? {
    sentence: `Replies on your Autonomy tab: it ${POLICY_MODE_WORDS[i.replyMode].chip} \u2014 ${POLICY_MODE_WORDS[i.replyMode].sub}. Until that changes it writes no WhatsApp reply at all, so nothing here happens in chat.${i.voiceLive ? " A call still answers, and cannot send the booking link." : ""}`,
    door: "Your Autonomy tab",
    to: "admin/autonomy"
  } : null;
  return { rows, held };
}
const CANNOT_ROWS = [
  {
    id: "book",
    title: "Make, move or cancel a booking",
    detail: "Not a setting you could switch on. Nothing in this product can make, move or cancel a booking: it only records the ones your booking tool reports. Your booking link does that, whichever tool is behind it."
  },
  {
    id: "outbound_call",
    title: "Ring a customer",
    // Not "never dials out": a transfer rings the owner's number, two rows up the same card.
    detail: "It answers your line and never calls a customer. The only number it rings is yours, to put a caller through. A call back is a person's, and the receptionist tells you when one is wanted."
  },
  {
    id: "sms",
    title: "Send a text message",
    detail: "Not part of what is sold yet. It arrives with a line the carriers have approved, and Connections will say when. The booking link a caller receives goes to their WhatsApp.",
    soon: true
  }
];
const CANNOT_NO_LINK = {
  book: "Not a setting you could switch on. Nothing in this product can make, move or cancel a booking. Your team does that, from the details it takes.",
  sms: "Not part of what is sold yet. It arrives with a line the carriers have approved, and Connections will say when."
};
const CANNOT_REQUESTS_BOOK = "Not a setting you could switch on: it never makes, moves or cancels a booking itself. A time a customer picks by text waits on Today for your Booked it or Can't.";
export function cannotRows(i) {
  if (typeof i?.smsLive !== "boolean") {
    throw new TypeError("cannotRows needs true or false for smsLive: left out, texting would be drawn as not sold.");
  }
  if (typeof i?.hasBookingLink !== "boolean") {
    throw new TypeError(
      "cannotRows needs true or false for hasBookingLink: left out, a business with no link would be told its link books."
    );
  }
  return CANNOT_ROWS.filter((r) => !(r.id === "sms" && i.smsLive)).map(
    (r) => r.id === "book" && i.takesRequests === true ? { ...r, detail: CANNOT_REQUESTS_BOOK } : !i.hasBookingLink && CANNOT_NO_LINK[r.id] ? { ...r, detail: CANNOT_NO_LINK[r.id] } : r
  );
}
const CANNOT_COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five"];
export function cannotFoldWords(count) {
  const n = CANNOT_COUNT_WORDS[count] ?? String(count);
  return count === 1 ? `${n} thing it cannot do` : `${n} things it cannot do`;
}
export const VISION_SWITCH_WORDS = {
  label: "Look at a photo",
  gate: "turn photos on or off",
  saved: (on) => on ? "Photos on: it says what it sees." : "Photos off: a photo goes to a person."
};
