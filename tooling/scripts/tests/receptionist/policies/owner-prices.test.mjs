/**
 * The prices the receptionist may say (decision 0051): "Never quote a price" does what its label says. On, no price at
 * all; off, the amounts the owner wrote in a price box, a note or a booking note, and only those. One predicate
 * (priceBreach) over one derivation (priceAllowance), for a chat reply, a call, a steer and the eval judge; money stays
 * a person's whatever the switch says.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceFigures,
  priceBreach,
  priceAllowance,
  allowedPrices,
  spokenBreach,
  notesInForce,
} from "@chanlytics/contracts";
import { layerTwo } from "../../../../../packages/core/src/inbound/steps.ts";

const HOURS = { mon: { open: "09:00", close: "17:00" } };
/** The zone and the clock the allowance is read at: a note's last day is judged on the business's day (notesInForce). */
const TZ = "America/New_York";
const NOW = new Date("2026-10-11T12:00:00Z");
/** A brain whose details compose (hours are one), with these services, notes and switch. */
const brainWith = ({ off = false, services = [], notes = [], booking = [], greeting } = {}) => ({
  business_name: "Harbor Moving",
  system_prompt: "x".repeat(60),
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: {
    hours: HOURS,
    services,
    notes,
    ...(booking.length ? { booking_rules: { notes: booking } } : {}),
    ...(off ? { guardrails: { never_quote_prices: false } } : {}),
    ...(greeting ? { phone_greeting: greeting } : {}),
  },
});

test("a price is read as one figure however it is written: thousands, cents, words, and a share kept apart", () => {
  const cases = [
    ["It is $1,000.", ["1000"]],
    ["$1,200 or $1200", ["1200"]],
    ["$45.50 or $45.5", ["45.5"]],
    ["$45.00", ["45"]],
    ["45,50 €", ["45.5"]],
    ["20% off today", ["20%"]],
    ["forty-five dollars", ["45"]],
    ["cuarenta y cinco pesos", ["45"]],
    ["two hundred and fifty dollars", ["250"]],
    ["mil quinientos pesos", ["1500"]],
    ["MX$450", ["450"]],
    ["half price", ["half price"]],
  ];
  for (const [text, want] of cases) assert.deepEqual(priceFigures(text), want, text);
  assert.deepEqual(priceFigures("Open at 9:30 for 45 minutes"), [], "a time and a duration are not prices");
});

test("with no allowance, any price at all is a breach (the strict rule); with one, only a figure outside it", () => {
  assert.equal(priceBreach("It is $45.", null), true);
  assert.equal(priceBreach("We open at nine.", null), false);
  const allowed = new Set(["45", "60"]);
  assert.equal(priceBreach("A haircut is $45 and colour $60.", allowed), false);
  assert.equal(
    priceBreach("A haircut is forty-five dollars.", allowed),
    false,
    "spelled out, as a voice agent says it",
  );
  assert.equal(priceBreach("A haircut is $50.", allowed), true, "a price it worked out");
  assert.equal(priceBreach("45% off this week.", allowed), true, "a share is never a price it may say");
  assert.equal(priceBreach("It's half price today.", allowed), true, "words it cannot read as a number");
});

test("the allowance is null, the strict rule, while the switch is on, unset, or the record composes nothing", () => {
  const services = [{ name: "Haircut", price_note: "$45" }];
  assert.equal(priceAllowance(brainWith({ services }), TZ, NOW), null, "switch unset: on");
  assert.equal(priceAllowance(null, TZ, NOW), null);
  // Booking notes and the switches alone compose no prompt (resolve.ts hasProfile).
  const noFields = {
    ...brainWith({ off: true }),
    profile: { guardrails: { never_quote_prices: false }, booking_rules: { notes: ["A haircut is $45."] } },
  };
  assert.equal(
    priceAllowance(noFields, TZ, NOW),
    null,
    "a record whose details compose nothing: the switches change nothing",
  );
});

test("with the switch off, the amounts the owner wrote, from price boxes and notes alone, never a share, money or a ban", () => {
  const list = allowedPrices(
    brainWith({
      off: true,
      services: [
        { name: "Haircut", price_note: "$45" },
        { name: "Colour", price_note: "from 60" },
        { name: "Balayage", price_note: "180-220" },
        { name: "Consult", price_note: "60 min, free" },
        { name: "Students", price_note: "10% off first visit" },
      ],
      notes: [
        { title: "Parking", text: "Parking is $5 at the lot." },
        { title: "Deposits", text: "Bookings need a $20 deposit." },
        { title: "Old menu", text: "Never say our $500 package." },
      ],
      booking: ["A missed visit costs $25."],
    }),
    TZ,
    NOW,
  );
  assert.deepEqual(
    list.map((p) => p.figure),
    ["45", "60", "180", "220", "5", "25"],
  );
  assert.deepEqual(list[0], { figure: "45", from: "Haircut" });
  assert.equal(list.find((p) => p.figure === "5").from, "Notes");
  assert.equal(list.find((p) => p.figure === "25").from, "Booking notes");
  // Never their own words or a carried prompt: those hold examples and stale prices.
  const ownWords = brainWith({ off: true, services: [{ name: "Haircut", price_note: "$45" }] });
  ownWords.profile.extra_instructions = "We used to charge $30 for a haircut.";
  assert.deepEqual([...priceAllowance(ownWords, TZ, NOW)], ["45"]);
});

test("a note's price is said through its last day on the business's own day, and never after it, as the note stops being told", () => {
  // The plan's offer note (contracts ask/plan.ts offerNote): its title and text carry the offer, its until the last day.
  const offer = {
    title: "Offer: Colour for $60 all November",
    text: "The offer: Colour for $60 all November. It runs from November 1 to November 30.",
    until: "2026-11-30",
  };
  const open = brainWith({ off: true, notes: [offer, { title: "Parking", text: "Parking is $5." }] });
  // 11 pm in New York on the last day: already 1 December in UTC, still 30 November where the business is.
  const lastNight = new Date("2026-11-30T23:00:00-05:00");
  const dayAfter = new Date("2026-12-01T12:00:00-05:00");
  assert.deepEqual(allowedPrices(open, TZ, lastNight), [
    { figure: "60", from: "Notes" },
    { figure: "5", from: "Notes" },
  ]);
  assert.deepEqual(
    allowedPrices(open, TZ, dayAfter),
    [{ figure: "5", from: "Notes" }],
    "the ended note gives nothing; a note with no last day still does",
  );
  assert.equal(priceBreach("Colour is $60.", priceAllowance(open, TZ, lastNight)), false, "said on its last day");
  assert.equal(priceBreach("Colour is $60.", priceAllowance(open, TZ, dayAfter)), true, "a breach the day after");
  // The one rule for which notes hold is the composer's: what the receptionist is told, the allowance counts.
  assert.equal(notesInForce(open.profile.notes, TZ, dayAfter).length, 1);
});

test("a chat reply: the strict rule swaps any price, the switch off lets a written one through and swaps an invented one", () => {
  const reply = (replyText, brainCfg) =>
    layerTwo({
      replyText,
      escalate: false,
      escalationReason: "",
      intent: "other",
      language: "en",
      brainCfg,
      policy: {},
      known: null,
      tz: TZ,
      now: NOW,
    });
  const strict = brainWith({ services: [{ name: "Haircut", price_note: "$45" }] });
  const open = brainWith({ off: true, services: [{ name: "Haircut", price_note: "$45" }] });
  assert.equal(reply("A haircut is $45.", strict).priceBlocked, true);
  assert.equal(reply("A haircut is $45.", open).priceBlocked, false);
  assert.equal(reply("A haircut is $45.", open).replyText, "A haircut is $45.");
  assert.equal(reply("A haircut is $50.", open).priceBlocked, true, "an amount nobody wrote is still swapped");
  // Money stays a person's whatever the switch says.
  const deposit = reply("We take a $45 deposit to hold it.", open);
  assert.equal(deposit.moneyHeld, true);
  assert.notEqual(deposit.replyText, "We take a $45 deposit to hold it.");
});

test("a call: the owner's greeting is heard as written and never a breach; with the switch on, nothing after it may repeat its price", () => {
  const turns = (said) => [
    { role: "agent", content: "Hi, Harbor Moving. Moves start at $199. I'm the automated assistant. How can I help?" },
    { role: "user", content: "How much for a two bedroom?" },
    { role: "agent", content: said },
  ];
  const greeting = "Hi, {business}. Moves start at $199. How can I help?";
  const on = priceAllowance(brainWith({ greeting }), TZ, NOW);
  assert.equal(on, null, "the switch on: the strict rule, the greeting's figure allowed nowhere");
  assert.equal(
    spokenBreach(turns("I can't quote that, the team will confirm."), on),
    null,
    "its own turn is never read",
  );
  assert.equal(spokenBreach(turns("Moves start at $199."), on)?.turn, 2, "the greeting's price, repeated, is a breach");
  // The greeting is the agent's turn before the caller speaks: a first agent turn after the caller is read like any.
  const callerFirst = [
    { role: "user", content: "Hello?" },
    { role: "agent", content: "Moves start at $199." },
  ];
  assert.equal(spokenBreach(callerFirst, null)?.turn, 1);
  // Off, the greeting's figure is one the owner wrote: listed as theirs, and it may be said again.
  const off = brainWith({ off: true, greeting });
  assert.deepEqual(allowedPrices(off, TZ, NOW), [{ figure: "199", from: "Greeting" }]);
  assert.equal(spokenBreach(turns("Moves start at $199."), priceAllowance(off, TZ, NOW)), null);
  assert.equal(spokenBreach(turns("A two bedroom is $499."), priceAllowance(off, TZ, NOW))?.turn, 2);
  // A greeting callers never hear (it denies being automated) gives nothing.
  assert.deepEqual(
    allowedPrices(brainWith({ off: true, greeting: "Hi, I'm not a bot. Moves start at $199." }), TZ, NOW),
    [],
  );
});

test("the top of a range is read, a cut or a curly-quoted ban gives nothing, and two-for-one is never a price of 2", () => {
  assert.deepEqual(priceFigures("$45-60"), ["45", "60"]);
  assert.deepEqual(priceFigures("$45 to 60"), ["45", "60"]);
  assert.deepEqual(priceFigures("between $45 and 60"), ["45", "60"]);
  assert.deepEqual(priceFigures("$45 to 60 minutes"), ["45"], "a duration after a price is no top");
  assert.deepEqual(priceFigures("$45 and 2 hours"), ["45"]);
  assert.deepEqual(priceFigures("$45 a la semana"), ["45"]);
  assert.deepEqual(priceFigures("$45 - 555-0100"), ["45"], "a phone number is no top");
  const allowed = new Set(["45"]);
  for (const said of ["$45-60", "$45 to 60", "between $45 and 60"])
    assert.equal(priceBreach(said, allowed), true, `${said}: a top nobody wrote`);
  assert.deepEqual(priceFigures("2x1 this week"), ["2x1"]);
  assert.equal(priceBreach("2x1 this week", new Set(["2"])), true, "a deal, never the price $2");
  const list = allowedPrices(
    brainWith({
      off: true,
      notes: [
        { title: "Phone", text: "Don’t quote $45 over the phone." },
        { title: "Spring", text: "Spring special: $50 off color!" },
        { title: "Parking", text: "Parking is $5." },
      ],
    }),
    TZ,
    NOW,
  );
  assert.deepEqual(
    list.map((p) => p.figure),
    ["5"],
  );
});
