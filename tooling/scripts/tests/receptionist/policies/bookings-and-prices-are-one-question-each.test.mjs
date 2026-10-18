/**
 * Two of an owner's questions, asked once each (the Settings wiring review, 18 Oct 2026; contracts
 * business-tab/choices.ts, and the rows in settings/business/choices): what happens when someone wants to book, on Hours
 * & booking, and what it says when someone asks a price, on Autonomy's Limits. Each was two or three controls on two
 * pages. The reading of the stored fields, over every state they can be in; the writes that move them, each path
 * reaching its answer and never passing through a third; and the two rows on the stub React, writing in that order and
 * stopping at a refusal.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_CHOICES,
  BOOKING_CHOICE_WORDS,
  PRICE_CHOICES,
  PRICE_CHOICE_WORDS,
  bookingChoiceNeeds,
  bookingChoiceOf,
  bookingChoiceWrites,
  priceChoiceOf,
  priceChoiceWrites,
  takesBookingRequests,
} from "@chanlytics/contracts";
import { unmount, all, byTestId, textOf, press } from "../../_legacy-react.mjs";
import { POLICIES, W, drawTab, redrawTab, saving } from "../../_business-tab-harness.mjs";

after(() => unmount());

const BIZ = "../../../../../apps/dashboard/src/surfaces/settings/business";
const { choiceRun } = await import(`${BIZ}/choices/run.ts`);

const flags = [false, true];

/* ------------------------------------ bookings, as contracts reads them ------------------------------------ */

/** The facts as the row works them out: takes by the runtime's own predicate (contracts takesBookingRequests). */
const bookingFacts = ({ switchOn, held, linkInChat }) => ({
  switchOn,
  held,
  linkInChat,
  takes: takesBookingRequests({ switchOn, linkInChat, bookingHeld: held }),
  calendar: true,
});
/** A state with one write made: what the runtime would read next. */
const bookingAfter = (s, w) =>
  w.kind === "booking_requests"
    ? { ...s, switchOn: w.on }
    : w.kind === "policy" && w.cls === "booking"
      ? { ...s, held: w.mode === "ask" }
      : assert.fail(`a booking choice wrote ${JSON.stringify(w)}`);
const STATES = flags.flatMap((switchOn) =>
  flags.flatMap((held) => flags.map((linkInChat) => ({ switchOn, held, linkInChat }))),
);

test("the booking choice is what the receptionist does with the stored fields, by the runtime's own predicate", () => {
  const of = (s) => bookingChoiceOf(bookingFacts(s));
  // A time a customer picks is a request wherever the runtime takes one: it offers times, and you confirm.
  for (const s of STATES) if (bookingFacts(s).takes) assert.equal(of(s), "confirm", JSON.stringify(s));
  // Otherwise the link, where it may hand one over and bookings are not held; else a person replies.
  assert.equal(of({ switchOn: false, held: false, linkInChat: true }), "link");
  assert.equal(of({ switchOn: false, held: true, linkInChat: true }), "person");
  assert.equal(of({ switchOn: false, held: false, linkInChat: false }), "person");
  // A switch left on under a link a customer books with takes nothing: the link is what it does.
  assert.equal(of({ switchOn: true, held: false, linkInChat: true }), "link");
});

test("every booking choice's writes reach it from every state, and a write that fails leaves one of the two choices", () => {
  for (const from of STATES) {
    const was = bookingChoiceOf(bookingFacts(from));
    for (const to of BOOKING_CHOICES) {
      if (bookingChoiceNeeds(to, { linkInChat: from.linkInChat, calendar: true })) continue;
      const writes = bookingChoiceWrites(to, from);
      let s = from;
      for (const w of writes) {
        s = bookingAfter(s, w);
        // Stopped here, the workspace is in the choice it was in, or the one asked for: never a third.
        const now = bookingChoiceOf(bookingFacts(s));
        assert.ok([was, to].includes(now), `${JSON.stringify(from)} → ${to}: ${now} after ${JSON.stringify(w)}`);
      }
      assert.equal(bookingChoiceOf(bookingFacts(s)), to, `${JSON.stringify(from)} → ${to}`);
      // And a switch never lies in wait: under a link a customer books with, requests are left off.
      if (to === "link") assert.equal(s.switchOn, false, `${JSON.stringify(from)} → link leaves the switch off`);
    }
  }
});

test("a booking choice that cannot be made yet says what it needs, and only that one", () => {
  assert.equal(bookingChoiceNeeds("link", { linkInChat: false, calendar: true }), BOOKING_CHOICE_WORDS.needs.link);
  assert.equal(
    bookingChoiceNeeds("confirm", { linkInChat: true, calendar: false }),
    BOOKING_CHOICE_WORDS.needs.confirm,
  );
  assert.equal(bookingChoiceNeeds("person", { linkInChat: false, calendar: false }), null, "a person can always reply");
  assert.equal(BOOKING_CHOICE_WORDS.saved("confirm"), "When someone wants to book: it offers times, you confirm.");
});

/* ------------------------------------ prices, as contracts reads them ------------------------------------ */

const priceAfter = (s, w) =>
  w.kind === "never_quote_prices"
    ? { ...s, neverQuote: w.on }
    : w.kind === "policy" && w.cls === "faq"
      ? { ...s, handed: w.mode === "ask" }
      : assert.fail(`a price choice wrote ${JSON.stringify(w)}`);

test("every price choice's writes reach it from every state, never through a third", () => {
  assert.equal(priceChoiceOf({ neverQuote: true, handed: false }), "never");
  assert.equal(priceChoiceOf({ neverQuote: false, handed: false }), "written");
  for (const neverQuote of flags) assert.equal(priceChoiceOf({ neverQuote, handed: true }), "yours");
  for (const neverQuote of flags)
    for (const handed of flags) {
      const from = { neverQuote, handed };
      const was = priceChoiceOf(from);
      for (const to of PRICE_CHOICES) {
        let s = from;
        for (const w of priceChoiceWrites(to, from)) {
          s = priceAfter(s, w);
          assert.ok([was, to].includes(priceChoiceOf(s)), `${JSON.stringify(from)} → ${to} after ${JSON.stringify(w)}`);
        }
        assert.equal(priceChoiceOf(s), to, `${JSON.stringify(from)} → ${to}`);
      }
    }
  // Handing every question to a person leaves the rule as it was: it is said again once they take it back.
  assert.deepEqual(priceChoiceWrites("yours", { neverQuote: false, handed: false }), [
    { kind: "policy", cls: "faq", mode: "ask" },
  ]);
  assert.equal(PRICE_CHOICE_WORDS.saved("yours"), "When someone asks a price: hands it to you.");
});

/* ------------------------------------ the two rows ------------------------------------ */

/** Stand in for the policies door: record each mode asked for, and answer as told. */
const policyDoor = (answer = { ok: true }) => {
  const asked = [];
  choiceRun.setPolicy = async (cls, mode) => {
    asked.push([cls, mode]);
    return answer;
  };
  return asked;
};
const flush = () => new Promise((r) => setImmediate(r));
/** A row's menu, pressed open, and the answer by its label pressed, on a page drawn with the test's toast. */
const pick = async (row, label, flash = () => {}) => {
  press(byTestId(redrawTab(flash), `${row}-menu`));
  const items = all(redrawTab(flash), (n) => n.props?.role === "menuitemradio");
  const item = items.find((i) => textOf(i).startsWith(label));
  assert.ok(item, `${row} offers "${label}": ${items.map(textOf).join(" | ")}`);
  press(item);
  for (let i = 0; i < 5; i++) await flush();
};
const valueOf = (tree, row) => textOf(byTestId(tree, `${row}-menu`)).trim();

test("When someone wants to book: the switch on first, then the booking row held, and one toast that says what is so", async () => {
  const sent = saving();
  const asked = policyDoor();
  const flashes = [];
  // A booking link it hands over in chat, bookings not held, no requests: they book with the link.
  const flash = (f) => flashes.push(f);
  const tree = drawTab({ flash });
  assert.equal(valueOf(tree, "booking_choice"), BOOKING_CHOICE_WORDS.options.link.label);
  await pick("booking_choice", BOOKING_CHOICE_WORDS.options.confirm.label, flash);
  assert.equal(sent.length, 1, "one settings save");
  assert.equal(sent[0].config.features.booking_requests, true, "the switch, written first");
  assert.deepEqual(asked, [["booking", "ask"]], "then the booking row, held");
  assert.deepEqual(
    flashes.map((f) => f.msg),
    [BOOKING_CHOICE_WORDS.saved("confirm")],
    "and one toast, the choice's",
  );
});

test("a refused write stops the choice there: nothing after it is sent, and the refusal is said", async () => {
  saving();
  const asked = policyDoor({ ok: false, message: "Your role can't change autonomy." });
  const flashes = [];
  const policies = POLICIES();
  policies.rows = policies.rows.map((r) => (r.class === "booking" ? { ...r, mode: "ask" } : r));
  // Bookings held and requests on: it offers times, you confirm. Back to the link is the row first, which is refused.
  const flash = (f) => flashes.push(f);
  drawTab({ flash, policies, config: { features: { booking_requests: true } } });
  assert.equal(valueOf(redrawTab(flash), "booking_choice"), BOOKING_CHOICE_WORDS.options.confirm.label);
  await pick("booking_choice", BOOKING_CHOICE_WORDS.options.link.label, flash);
  assert.deepEqual(asked, [["booking", "auto"]]);
  assert.equal(W.__SETTINGS.config.features.booking_requests, true, "the switch is not touched after a refusal");
  assert.deepEqual(
    flashes.map((f) => [f.tone, f.msg]),
    [["danger", "Your role can't change autonomy."]],
  );
});

test("When someone asks a price: handing it to you holds the Service & pricing row alone, and the rule is left", async () => {
  const sent = saving();
  const asked = policyDoor();
  const tree = drawTab();
  assert.equal(valueOf(tree, "price_choice"), PRICE_CHOICE_WORDS.options.never.label);
  await pick("price_choice", PRICE_CHOICE_WORDS.options.yours.label);
  assert.deepEqual(asked, [["faq", "ask"]]);
  assert.equal(sent.length, 0, "the price rule is as it was");
  // The prices you wrote: the rule off, and nothing asked of the row, which answers already.
  policyDoor();
  const more = saving();
  drawTab();
  await pick("price_choice", PRICE_CHOICE_WORDS.options.written.label);
  assert.equal(more.length, 1);
  assert.equal(more[0].config.brain.profile.guardrails.never_quote_prices, false);
});

test("a role that may not change the settings reads each answer, and is offered no menu", () => {
  const policies = { ...POLICIES(), role: "viewer" };
  const tree = drawTab({ policies });
  // The harness's role is the page's; a viewer's rows carry the answer as their value, with nothing to press.
  const gated = W.canDo;
  W.canDo = () => false;
  try {
    const t = drawTab({ policies });
    assert.equal(byTestId(t, "booking_choice-menu"), null);
    assert.match(textOf(byTestId(t, "rec-row-booking_choice")), new RegExp(BOOKING_CHOICE_WORDS.options.link.label));
    assert.equal(byTestId(t, "price_choice-menu"), null);
  } finally {
    W.canDo = gated;
  }
  assert.ok(byTestId(tree, "booking_choice-menu"), "an owner's has one");
});
