/**
 * Two of an owner's questions, asked once each (the Settings wiring review, 18 Oct 2026): what happens when someone
 * wants to book, and what it says when someone asks a price. Each was two or three controls on two pages: the booking
 * requests switch in the booking tool's fold and the Book · reschedule row of Autonomy's matrix; the price rule in the
 * rules it keeps and the Service & pricing row of the matrix.
 *
 * Nothing the receptionist reads changes. A choice is a reading of the stored fields the runtime already decides by
 * (features.booking_requests and the booking policy row, through contracts takesBookingRequests; the price rule and the
 * Service & pricing row, through layerTwo and the composer), and the writes that move them. The writes come in an order
 * that leaves the workspace coherent if the second fails: the one that changes what the receptionist does first only
 * where it cannot make a state no choice names, and a write that only tidies last.
 */

/* ------------------------------------ bookings ------------------------------------ */

export type BookingChoice = "link" | "confirm" | "person";
export const BOOKING_CHOICES: readonly BookingChoice[] = ["link", "confirm", "person"];

/** What a booking choice is read from: what the runtime decides by, worked out by the caller with its own predicates. */
export interface BookingFacts {
  /** The booking requests switch (features.booking_requests). */
  switchOn: boolean;
  /** Bookings held for a person: the booking policy row under Ask me first (contracts bookingHeld). */
  held: boolean;
  /** A booking link it may hand over in chat (contracts offersLinkOn "chat"). */
  linkInChat: boolean;
  /** Whether a time a customer picks is taken as a request (contracts takesBookingRequests over the three above). */
  takes: boolean;
  /** A calendar it reads open times from: a request is checked against them. */
  calendar: boolean;
}

/** The choice the stored fields come to, by what the receptionist does with them. */
export function bookingChoiceOf(f: BookingFacts): BookingChoice {
  if (f.takes) return "confirm";
  if (!f.held && f.linkInChat) return "link";
  return "person";
}

/** One write a choice makes: a policy row's mode, or a key of the config. */
export type ChoiceWrite =
  | { kind: "policy"; cls: "booking" | "faq"; mode: "auto" | "ask" }
  | { kind: "booking_requests"; on: boolean }
  | { kind: "never_quote_prices"; on: boolean };

/**
 * The writes that make `to` true, in order. Every path's first write is the one that moves what the receptionist does,
 * or one that changes nothing yet; the cleanup after it only keeps a switch from lying in wait (requests left on under
 * a link a customer books with). A failed second write leaves the workspace in one of the three choices, never between.
 */
export function bookingChoiceWrites(to: BookingChoice, f: Omit<BookingFacts, "takes" | "calendar">): ChoiceWrite[] {
  const out: ChoiceWrite[] = [];
  if (to === "link") {
    if (f.held) out.push({ kind: "policy", cls: "booking", mode: "auto" });
    if (f.switchOn) out.push({ kind: "booking_requests", on: false });
  } else if (to === "confirm") {
    // The switch first: under a link it waits until the row holds bookings, so nothing between the two is new.
    if (!f.switchOn) out.push({ kind: "booking_requests", on: true });
    if (f.linkInChat && !f.held) out.push({ kind: "policy", cls: "booking", mode: "ask" });
  } else {
    // The switch off first: with the row holding bookings, that alone is "you reply to each one".
    if (f.switchOn) out.push({ kind: "booking_requests", on: false });
    if (f.linkInChat && !f.held) out.push({ kind: "policy", cls: "booking", mode: "ask" });
  }
  return out;
}

/** Why a choice cannot be made yet, or null: a link to send, a calendar to read open times from. */
export function bookingChoiceNeeds(to: BookingChoice, f: Pick<BookingFacts, "linkInChat" | "calendar">): string | null {
  if (to === "link" && !f.linkInChat) return BOOKING_CHOICE_WORDS.needs.link;
  if (to === "confirm" && !f.calendar) return BOOKING_CHOICE_WORDS.needs.confirm;
  return null;
}

export const BOOKING_CHOICE_WORDS = {
  label: "When someone wants to book",
  options: {
    link: { label: "They book with your link", says: "It sends your booking link and they pick a time there." },
    confirm: {
      label: "It offers times, you confirm",
      says: "It offers open times from your calendar. The one they pick waits on Today: Booked it, or Can't.",
    },
    person: {
      label: "You reply to each one",
      says: "It asks what they want and when, and the conversation waits for you in the Inbox.",
    },
  },
  needs: {
    link: "Add your booking link first.",
    confirm: "Needs your calendar link, to know what's open.",
  },
  saved: (to: BookingChoice) => `When someone wants to book: ${BOOKING_CHOICE_WORDS.options[to].label.toLowerCase()}.`,
} as const;

/* ------------------------------------ prices ------------------------------------ */

export type PriceChoice = "written" | "never" | "yours";
export const PRICE_CHOICES: readonly PriceChoice[] = ["written", "never", "yours"];

/** What a price choice is read from. */
export interface PriceFacts {
  /** The price rule in force (contracts guardrailsInForce never_quote_prices: absent is on). */
  neverQuote: boolean;
  /** The Service & pricing row under Ask me first: every such question is a person's (layerTwo's ask class). */
  handed: boolean;
}

export function priceChoiceOf(f: PriceFacts): PriceChoice {
  if (f.handed) return "yours";
  return f.neverQuote ? "never" : "written";
}

/**
 * The writes that make `to` true, in order. The rule first: while the row hands every such question to a person it
 * changes nothing a customer reads, so a failed second write leaves "hands it to you" standing.
 */
export function priceChoiceWrites(to: PriceChoice, f: PriceFacts): ChoiceWrite[] {
  const out: ChoiceWrite[] = [];
  if (to === "yours") {
    if (!f.handed) out.push({ kind: "policy", cls: "faq", mode: "ask" });
    return out;
  }
  const neverQuote = to === "never";
  if (f.neverQuote !== neverQuote) out.push({ kind: "never_quote_prices", on: neverQuote });
  if (f.handed) out.push({ kind: "policy", cls: "faq", mode: "auto" });
  return out;
}

export const PRICE_CHOICE_WORDS = {
  label: "When someone asks a price",
  options: {
    written: {
      label: "Says the prices you wrote",
      says: "Only the prices you wrote. In chat any other figure is taken out before it's sent; on a call, you're told.",
    },
    never: {
      label: "Never says a price",
      says: "It says prices are given in person or at a consult, and offers the next step.",
    },
    yours: {
      label: "Hands it to you",
      says: "Every question about a price or a service waits for you in the Inbox.",
    },
  },
  saved: (to: PriceChoice) => `When someone asks a price: ${PRICE_CHOICE_WORDS.options[to].label.toLowerCase()}.`,
} as const;
