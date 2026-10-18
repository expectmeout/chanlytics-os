export const BOOKING_CHOICES = ["link", "confirm", "person"];
export function bookingChoiceOf(f) {
  if (f.takes) return "confirm";
  if (!f.held && f.linkInChat) return "link";
  return "person";
}
export function bookingChoiceWrites(to, f) {
  const out = [];
  if (to === "link") {
    if (f.held) out.push({ kind: "policy", cls: "booking", mode: "auto" });
    if (f.switchOn) out.push({ kind: "booking_requests", on: false });
  } else if (to === "confirm") {
    if (!f.switchOn) out.push({ kind: "booking_requests", on: true });
    if (f.linkInChat && !f.held) out.push({ kind: "policy", cls: "booking", mode: "ask" });
  } else {
    if (f.switchOn) out.push({ kind: "booking_requests", on: false });
    if (f.linkInChat && !f.held) out.push({ kind: "policy", cls: "booking", mode: "ask" });
  }
  return out;
}
export function bookingChoiceNeeds(to, f) {
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
      says: "It offers open times from your calendar. The one they pick waits on Today: Booked it, or Can't."
    },
    person: {
      label: "You reply to each one",
      says: "It asks what they want and when, and the conversation waits for you in the Inbox."
    }
  },
  needs: {
    link: "Add your booking link first.",
    confirm: "Needs your calendar link, to know what's open."
  },
  saved: (to) => `When someone wants to book: ${BOOKING_CHOICE_WORDS.options[to].label.toLowerCase()}.`
};
export const PRICE_CHOICES = ["written", "never", "yours"];
export function priceChoiceOf(f) {
  if (f.handed) return "yours";
  return f.neverQuote ? "never" : "written";
}
export function priceChoiceWrites(to, f) {
  const out = [];
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
      says: "Only the prices you wrote. In chat any other figure is taken out before it's sent; on a call, you're told."
    },
    never: {
      label: "Never says a price",
      says: "It says prices are given in person or at a consult, and offers the next step."
    },
    yours: {
      label: "Hands it to you",
      says: "Every question about a price or a service waits for you in the Inbox."
    }
  },
  saved: (to) => `When someone asks a price: ${PRICE_CHOICE_WORDS.options[to].label.toLowerCase()}.`
};
