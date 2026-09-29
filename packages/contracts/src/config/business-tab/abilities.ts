/**
 * What the receptionist can do, and what it cannot: the abilities card's rows and what holds the whole card back,
 * computed from what the records show, and the things no switch turns on (cannotRows).
 */
import { POLICY_MODE_WORDS, POLICY_MODES, type PolicyMode } from "../workspace-config/policy-classes";
import { handoffChatWords, transferWords } from "./handoff-words";

/**
 * What the receptionist can do, and what it cannot.
 *
 * The tab sets the inputs to three of the phone agent's four tools
 * (`check_availability`, `send_booking_link`, `transfer_to_staff`) and has
 * never said a tool exists. An owner could not know their phone agent sends
 * the booking link to a caller's WhatsApp.
 *
 * Computed from what the records show, never typed: an ability is ready only
 * when its channel is live and its input is filled. A channel says what the
 * receptionist DOES there, input and all, not which channel the ability belongs
 * to -- a lit phone beside "No number yet, so it takes a message instead" is a
 * row disagreeing with itself, and the card's one signal is the pair of them.
 * So `ready` is exactly "one of the two channels does it". Every sentence below was
 * checked against the code it describes, because the first draft of three of
 * them was not true: the link goes by WhatsApp and never by text, a transfer
 * happens only during opening hours and stays on the line, and a hand-off is a
 * pause that ends, not a stop.
 *
 * Every input is required, and the booleans are checked as it runs: the page
 * that calls this is untyped JSX, and a boolean it left out would be read as
 * false -- a live line drawn dark, a hold drawn as none -- with no error at all.
 */
export interface AbilityInputs {
  voiceLive: boolean;
  whatsappLive: boolean;
  hasCalendarFeed: boolean;
  hasBookingLink: boolean;
  /**
   * The workspace is not asked for a booking link: it says some customers get a proposal first (deals.ts
   * bookingLinkOptional), and with none its receptionist takes their details instead (the first run's decision 2).
   */
  linkOptional: boolean;
  /** An approved booking-link template: the call sends the link as one (template-order bookingTemplate). */
  hasBookingTemplate: boolean;
  hasHandoffNumber: boolean;
  hasEscalateWhen: boolean;
  /**
   * The Autonomy reply row's `limits.pause_hours`, exactly as stored -- usually
   * nothing, because most owners never set it. Read here the way the Autonomy pane
   * reads it (hardLimitsWords), which is the way the edge applies it: nothing, null
   * or 0 is the 24-hour default.
   */
  pauseHours: unknown;
  visionOn: boolean;
  /**
   * The Autonomy tab's Booking row is not on auto, so a person confirms bookings
   * and the link is never sent: bookingHeld(policy), the edge's own question.
   */
  bookingHeld: boolean;
  /**
   * The Autonomy tab's REPLIES row, exactly as stored -- a separate row from Booking,
   * set independently, and the one that decides whether the receptionist speaks at all.
   *
   * On "ask" or "never" the WhatsApp receptionist composes no reply
   * (packages/core/src/inbound/reply-posture.ts, which every inbound message asks) and a
   * call's booking-link send is refused as a policy_hold
   * (apps/edge/lib/receptionist/outbound-gate.ts). So every chat ability on the card is
   * held at once, by one cause with one fix on another tab -- which is why the words for
   * it come back beside the rows, to be said ONCE, and not on each of six rows.
   *
   * Checked as it runs like the booleans, and for the same reason: an untyped page that
   * left it out would draw six abilities on a mode nobody chose. The page reads the row's
   * mode with the edge's own default for a missing row ("ask", reply-posture.ts).
   */
  replyMode: PolicyMode;
}

/** The inputs that must be true or false. Typed off AbilityInputs, so a new boolean cannot be left off. */
const BOOLEAN_INPUTS: Record<
  { [K in keyof AbilityInputs]-?: AbilityInputs[K] extends boolean ? K : never }[keyof AbilityInputs],
  true
> = {
  voiceLive: true,
  whatsappLive: true,
  hasCalendarFeed: true,
  hasBookingLink: true,
  linkOptional: true,
  hasBookingTemplate: true,
  hasHandoffNumber: true,
  hasEscalateWhen: true,
  visionOn: true,
  bookingHeld: true,
};

export interface AbilityRowVM {
  id: "answer" | "open_times" | "booking_link" | "transfer" | "handoff" | "vision";
  title: string;
  detail: string;
  channels: { voice: boolean; whatsapp: boolean };
  /** The row on this page that supplies it. Null when nothing does. */
  runsOn: { label: string; row: string } | null;
  ready: boolean;
  /**
   * What stops this ability is a row of THIS page, still empty (or a switch still off).
   *
   * The difference between a sentence worth drawing and one worth keeping out of the way: a
   * transfer with no number takes a message instead, and the number is two cards up, so the
   * card says so and offers the row. A channel that is not connected, bookings held, replies
   * held -- none of those is filled in here, and each is one cause the card states once,
   * rather than six rows saying the same thing six times.
   */
  missing: boolean;
  /** Only the opt-in ability carries this. */
  on?: boolean;
}

/**
 * The card: its rows, and what holds the whole card back, said once.
 *
 * `held` is null unless the Autonomy tab's Replies row keeps the receptionist from
 * answering. Six rows each repeating that one sentence is the page shouting; the Quiet
 * board's rule is that a refused act is absent and the page says why once, so the sentence
 * comes back here, with the tab that fixes it.
 */
export interface AbilitiesVM {
  rows: AbilityRowVM[];
  /** `door` is what the press to that tab says, so the page draws the words and types none of them. */
  held: { sentence: string; door: string; to: "admin/autonomy" } | null;
}

export function abilityRows(i: AbilityInputs): AbilitiesVM {
  if (!i || typeof i !== "object")
    throw new TypeError(
      "abilityRows needs its inputs: which lines answer, what is filled in, and what the Autonomy tab holds.",
    );
  const notBoolean = Object.keys(BOOLEAN_INPUTS).filter(
    (k) => typeof (i as unknown as Record<string, unknown>)[k] !== "boolean",
  );
  if (notBoolean.length) {
    throw new TypeError(
      `abilityRows needs true or false for ${notBoolean.join(", ")}: missing or not a boolean, each would be drawn as false.`,
    );
  }
  if (!POLICY_MODES.includes(i.replyMode)) {
    throw new TypeError(
      `abilityRows needs replyMode, the Autonomy tab's Replies row (${POLICY_MODES.join(", ")}), not ${JSON.stringify(i.replyMode)}: every chat ability turns on it.`,
    );
  }
  // The Replies row holds the receptionist back: nothing is composed in chat, and a call's
  // booking-link send is refused. Said once for the card (`held` below), never on each row.
  const repliesHeld = i.replyMode === "ask" || i.replyMode === "never";
  // A chat ability needs a WhatsApp number that answers AND leave to answer with it.
  const chatAnswers = i.whatsappLive && !repliesHeld;
  const both = { voice: i.voiceLive, whatsapp: chatAnswers };
  // Nothing is ready on a channel that is not answering. An input filled against a
  // dead line is a setting, not an ability, and drawing it ready would tell an owner
  // the booking link goes out when there is nothing to send it.
  const answering = i.voiceLive || chatAnswers;

  // The link goes out on WhatsApp on both channels: in the thread, or on a call as a
  // template to the caller's own WhatsApp (retell-fn deliver({ channel: "whatsapp" })).
  // So a phone-only workspace cannot send it at all, and a call cannot send it without
  // an approved template -- whatever the booking link field holds.
  const callSendsLink = i.voiceLive && i.whatsappLive && i.hasBookingTemplate;
  // Where the booking-link row below is ready. Another row that promises the link after
  // something else promises it only here: with no WhatsApp to send it by, no link, or
  // bookings held on the Autonomy tab, "then the link" would not be true.
  const linkGoes = i.hasBookingLink && chatAnswers && !i.bookingHeld;
  // ...and whether the row ABOVE may promise it without naming a channel. The link goes by WhatsApp on
  // both channels, but a call sends it as a template, so a workspace on both lines with no approved
  // booking-link template sends it in chat and not on a call (retell-fn's deliver has no template to
  // send). Said unqualified, the openings row told such a workspace its call offers times "then the link".
  const linkIsChatsAlone = linkGoes && i.voiceLive && !callSendsLink;
  const inChat = linkIsChatsAlone ? " in chat" : "";
  // What is missing on this page is said first, because it is what this page can fix.
  // Then the Autonomy tab's hold: with Booking not on auto, a call's send is refused
  // (outbound-gate.ts), and a chat reply CLASSED AS A BOOKING has the link taken back out
  // (steps.ts layerTwo) -- a price or services reply still carries it, which is why the
  // sentence says "when someone asks to book" and not "it sends no link".
  const bookingDetail = !i.hasBookingLink
    ? i.linkOptional
      ? "No booking link, so it takes their details for you to follow up with a quote."
      : "No booking link yet, so there is nothing to send."
    : !i.whatsappLive
      ? i.voiceLive
        ? "It goes out on WhatsApp, which isn't connected here, so on a call it offers to have someone follow up instead."
        : "It goes out on WhatsApp, which isn't connected here."
      : i.bookingHeld
        ? "Your Autonomy tab holds bookings for you to confirm, so when someone asks to book, it sends no link: it tells them someone from the team will confirm."
        : !i.voiceLive
          ? "It sends it in the thread."
          : callSendsLink
            ? "On a call it sends it to the caller's WhatsApp, when their number has one, and says so. In chat it sends it in the thread."
            : "In chat it sends it in the thread. On a call it can't yet: sending it to a caller's WhatsApp needs an approved booking-link message.";

  const rows: AbilityRowVM[] = [
    {
      id: "answer",
      title: "Answer from your facts",
      // facts_used is the chat brain's (brain.ts); the phone agent reports an outcome, not its facts.
      detail:
        "Hours, address, services, your notes. In chat it also records which facts it leaned on, so you can see why it said what it said.",
      channels: both,
      runsOn: { label: "Name and hours", row: "name" },
      ready: answering,
      // The facts it answers from are the rows' own subject, and a missing one is the gap line's (businessGap).
      missing: false,
    },
    {
      id: "open_times",
      title: "Say which times are open",
      // describeOpenings hands chat up to five days (availability.ts maxDays), not one.
      // With bookings held, a call still offers the openings (call-start.ts; check_availability, with the team
      // confirming) and chat is handed them, while layerTwo replaces a booking reply carrying the link. So this
      // says what holds on both: it has them, and a request to book gets no link.
      detail: !i.hasCalendarFeed
        ? linkGoes
          ? `No calendar to read, so it does not guess at open times —${inChat} it sends the link instead.`
          : "No calendar to read, so it does not guess at open times."
        : i.bookingHeld
          ? "It is handed the openings on a call and in chat, but your Autonomy tab holds bookings for you to confirm, so when someone asks to book, no link follows."
          : `On a call it asks the calendar at that moment. In chat it is handed the next few days' openings with each message. It offers up to three that fit${linkGoes ? `, then the link${inChat}` : ""}.`,
      channels: { voice: i.voiceLive && i.hasCalendarFeed, whatsapp: chatAnswers && i.hasCalendarFeed },
      runsOn: { label: "The calendar it reads", row: "calendar" },
      ready: answering && i.hasCalendarFeed,
      missing: !i.hasCalendarFeed,
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
      missing: !i.hasBookingLink && !i.linkOptional,
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
      missing: !i.hasHandoffNumber,
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
      missing: false,
    },
    {
      id: "vision",
      title: "Look at a photo",
      detail: i.visionOn
        ? "It says what it sees and suggests the next step, under the rules it always keeps."
        : "Off. A photo is passed to a person.",
      channels: { voice: false, whatsapp: chatAnswers && i.visionOn },
      // The switch sits with the rules it keeps, which is the row that opens it.
      runsOn: { label: i.visionOn ? "Turn it off" : "Turn it on", row: "guardrails" },
      ready: chatAnswers && i.visionOn,
      // Off is the one state an owner changes from this card.
      missing: !i.visionOn,
      on: i.visionOn,
    },
  ];

  // The mode in the pane's own words, never the stored auto|veto|ask|never (#657). The call
  // clause only where there is a call: a workspace on WhatsApp alone is promised nothing about one.
  const held = repliesHeld
    ? {
        sentence: `Replies on your Autonomy tab: it ${POLICY_MODE_WORDS[i.replyMode].chip} — ${POLICY_MODE_WORDS[i.replyMode].sub}. Until that changes it writes no WhatsApp reply at all, so nothing here happens in chat.${i.voiceLive ? " A call still answers, and cannot send the booking link." : ""}`,
        door: "Your Autonomy tab",
        to: "admin/autonomy" as const,
      }
    : null;
  return { rows, held };
}

export interface CannotRowVM {
  id: "book" | "outbound_call" | "sms";
  title: string;
  detail: string;
  /** True when it is a thing the product intends to sell later. */
  soon?: boolean;
}

const CANNOT_ROWS: readonly CannotRowVM[] = [
  {
    id: "book",
    title: "Book, move or cancel an appointment",
    detail:
      "Not a setting you could switch on. There is no appointments table in this product — nothing in it can create, move or cancel one. Your booking link does that, whichever tool is behind it.",
  },
  {
    id: "outbound_call",
    title: "Ring a customer",
    // Not "never dials out": a transfer rings the owner's number, two rows up the same card.
    detail:
      "It answers your line and never calls a customer. The only number it rings is yours, to put a caller through. A call back is a person's, and the receptionist tells you when one is wanted.",
  },
  {
    id: "sms",
    title: "Send a text message",
    detail:
      "Not part of what is sold yet. It arrives with a line the carriers have approved, and Connections will say when. The booking link a caller receives goes to their WhatsApp.",
    soon: true,
  },
];

/** The two rows whose words lean on a booking link, as said where there is none (the first run's decision 2). */
const CANNOT_NO_LINK: Partial<Record<CannotRowVM["id"], string>> = {
  book: "Not a setting you could switch on. There is no appointments table in this product — nothing in it can create, move or cancel one. Your team does that, from the details it takes.",
  sms: "Not part of what is sold yet. It arrives with a line the carriers have approved, and Connections will say when.",
};

/**
 * Said here so nobody has to find out from a customer.
 *
 * None of these is a setting that could be switched on, and saying so on the
 * page that holds the switches is the difference between a limit and a bug.
 *
 * Texting is the one that changes: it goes live on an active carrier line that
 * is not a rehearsal filing (capabilities.ts), and on such a line "not part of
 * what is sold yet" is not true, so the row is left out. `smsLive` is checked as
 * it runs, like abilityRows' inputs: left out by an untyped page, it would read
 * as not live.
 *
 * `hasBookingLink` is checked the same way: two of the rows lean on a link, and
 * a business that quotes, with none, is told what does the work instead.
 */
export function cannotRows(i: { smsLive: boolean; hasBookingLink: boolean }): CannotRowVM[] {
  if (typeof i?.smsLive !== "boolean") {
    throw new TypeError("cannotRows needs true or false for smsLive: left out, texting would be drawn as not sold.");
  }
  if (typeof i?.hasBookingLink !== "boolean") {
    throw new TypeError(
      "cannotRows needs true or false for hasBookingLink: left out, a business with no link would be told its link books.",
    );
  }
  return CANNOT_ROWS.filter((r) => !(r.id === "sms" && i.smsLive)).map((r) =>
    !i.hasBookingLink && CANNOT_NO_LINK[r.id] ? { ...r, detail: CANNOT_NO_LINK[r.id] as string } : r,
  );
}
