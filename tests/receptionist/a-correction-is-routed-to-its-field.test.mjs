/**
 * A rehearsal's review and its fix (decision 0069; contracts rehearsal/), run: the owner's correction under an answer
 * becomes ONE settings change in the field the composer reads (fix-router.ts routeFix), read by its words where they
 * decide it -- the days, the times, the dates, a price, a length, a link, a service listed, the languages -- and the
 * model asked where they do not, its answer held to the ops the settings take. Beside it, the closed sets a rehearsal
 * and its review are written in: the kinds the database keeps, the verdicts the model may give, the turns a review reads
 * and the tools a rehearsal shows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkFixRoute,
  datesIn,
  daysIn,
  exchangesOf,
  languagesIn,
  linkIn,
  minutesIn,
  priceIn,
  routeFix,
  serviceIn,
  timesIn,
  turnsOfTranscript,
  FIX_ROUTE_OPS,
  FIX_ROUTE_SCHEMA,
  REHEARSAL_KINDS,
  REHEARSAL_SHOWN_TOOLS,
  REVIEW_LIMITS,
  REVIEW_SCHEMA,
  REVIEW_VERDICTS,
  SCHEMA_SETS,
} from "@chanlytics/contracts";

const TODAY = "2026-10-25";
const SERVICES = [{ name: "Color" }, { name: "Color and cut" }, { name: "Balayage" }];
const ask = (kind, words, over = {}) => ({
  kind,
  words,
  today: TODAY,
  services: SERVICES,
  hours: { sat: { open: "09:00", close: "16:00" } },
  languages: ["English"],
  ...over,
});

test("the words read for what they say: days in the week's order, an opening and a closing as a business's day reads them, dates from today on", () => {
  assert.deepEqual(daysIn("Saturdays and Mondays"), ["mon", "sat"]);
  assert.deepEqual(daysIn("weekdays"), ["mon", "tue", "wed", "thu", "fri"]);
  assert.deepEqual(daysIn("we're open every day"), ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  assert.deepEqual(
    timesIn("9 to 5"),
    { open: "09:00", close: "17:00", closed: false },
    "a closing at 5 is the afternoon",
  );
  assert.deepEqual(timesIn("10:30am - 7pm"), { open: "10:30", close: "19:00", closed: false });
  assert.deepEqual(timesIn("till 8"), { open: null, close: "20:00", closed: false });
  assert.deepEqual(timesIn("from 10"), { open: "10:00", close: null, closed: false });
  assert.deepEqual(timesIn("closed"), { open: null, close: null, closed: true });
  assert.deepEqual(datesIn("closed 24 December to 2026-12-26", TODAY), ["2026-12-24", "2026-12-26"]);
  assert.deepEqual(datesIn("January 2nd", TODAY), ["2027-01-02"], "a date past this year's is next year's");
  assert.deepEqual(datesIn("off on the 30th", TODAY), ["2026-10-30"], "the day alone: this month, from today");
  assert.deepEqual(datesIn("February 30", TODAY), [], "a day the month does not have is none");
});

test("money, length, a link, a service listed and the languages, as the words say them", () => {
  assert.equal(priceIn("it's from $120"), "from $120");
  assert.equal(priceIn("180 dollars"), "$180");
  assert.equal(priceIn("about an hour"), null);
  assert.equal(minutesIn("an hour and a half"), 90);
  assert.equal(minutesIn("half an hour"), 30);
  assert.equal(minutesIn("45 mins"), 45);
  assert.equal(minutesIn("40 hours"), null, "past what a service may take");
  assert.equal(linkIn("book at vagaro.com/harbor."), "https://vagaro.com/harbor");
  assert.equal(linkIn("write to sam@harbor.example"), null, "an address is no link");
  assert.equal(serviceIn("color and cut is $95", SERVICES), "Color and cut", "the longest name found");
  assert.equal(serviceIn("balayages take three hours", SERVICES), "Balayage");
  assert.equal(serviceIn("a perm", SERVICES), null);
  assert.deepEqual(languagesIn("we speak spanish and Haitian Creole"), ["Spanish", "Haitian Creole"]);
});

test("a correction routed by its words: the day's hours beside what stands, a closure, the booking link, a listed service's price and length, the languages, who it reaches, the owner's words, a switch", () => {
  const routed = (a) => routeFix(a);
  assert.deepEqual(routed(ask("hours", "We open at 10 on Saturdays")), {
    ok: true,
    change: { op: "set_hours", day: "sat", open: "10:00", close: "16:00" },
  });
  assert.deepEqual(routed(ask("hours", "Sundays we're closed")), {
    ok: true,
    change: { op: "set_hours", day: "sun", open: null, close: null },
  });
  assert.deepEqual(routed(ask("hours", "we close at 6")), { ok: false, why: "needs_model" }, "no day said");
  assert.deepEqual(routed(ask("note", "We're closed 24 December to 26 December")), {
    ok: true,
    change: { op: "add_closure", date: "2026-12-24", until: "2026-12-26" },
  });
  assert.deepEqual(routed(ask("note", "Book online at vagaro.com/harbor")), {
    ok: true,
    change: { op: "set_booking_link", link: "https://vagaro.com/harbor" },
  });
  assert.deepEqual(routed(ask("service", "Balayage is $180 and takes three hours")), {
    ok: true,
    change: { op: "set_service", name: "Balayage", duration_min: 180, price_note: "$180" },
  });
  assert.deepEqual(
    routed(ask("service", "A perm is $90")),
    { ok: false, why: "needs_model" },
    "a service not listed: its name is the model's",
  );
  assert.deepEqual(routed(ask("languages", "We also speak Spanish")), {
    ok: true,
    change: { op: "set_languages", languages: ["English", "Spanish"] },
  });
  assert.deepEqual(routed(ask("handoff", "Put refunds through to me")), {
    ok: true,
    change: { op: "add_escalate_when", reason: "Refunds" },
  });
  assert.deepEqual(routed(ask("own_words", "  Always offer the next opening.  ")), {
    ok: true,
    change: { op: "add_own_words", text: "Always offer the next opening." },
  });
  assert.deepEqual(routed(ask("guardrail", "", { rule: "Never quote prices" })), {
    ok: true,
    change: { op: "set_guardrail", rule: "never_quote_prices", on: false },
  });
  assert.deepEqual(routed(ask("tone", "Be warmer")), { ok: false, why: "needs_model" });
  assert.deepEqual(routed(ask("hours", "   ")), { ok: false, why: "nothing" });
});

test("the model is held to the ops the settings take: the schema's own list, and an answer outside it changes nothing", () => {
  assert.deepEqual(FIX_ROUTE_SCHEMA.properties.op.enum, [...FIX_ROUTE_OPS]);
  assert.deepEqual(checkFixRoute({ op: "delete_everything" }, ask("note", "x")), { ok: false, why: "nothing" });
  assert.deepEqual(checkFixRoute({ op: "set_hours", day: "sat", open: "18:00", close: "09:00" }, ask("hours", "x")), {
    ok: false,
    why: "nothing",
  });
  assert.deepEqual(checkFixRoute({ op: "set_hours", day: "sat", open: "10:00", close: "16:00" }, ask("hours", "x")), {
    ok: true,
    change: { op: "set_hours", day: "sat", open: "10:00", close: "16:00" },
  });
});

test("an owner's free parking becomes a note; a free service in a note changes nothing (the 30 Oct 2026 replay)", () => {
  const parking = ask("note", "We have free parking behind the building, enter from Elm Street.");
  const note = {
    op: "add_note",
    title: "Free parking",
    text: "Free parking is behind the building, enter from Elm Street.",
  };
  assert.deepEqual(checkFixRoute(note, parking), { ok: true, change: note });
  const blowout = ask("note", "Everyone gets a free blowout with a colour.");
  assert.deepEqual(
    checkFixRoute({ op: "add_note", title: "Colour", text: "Everyone gets a free blowout with a colour." }, blowout),
    { ok: false, why: "nothing" },
  );
});

test("a rehearsal's closed sets: the kinds are the database's, the verdicts the review schema's, a review reads its cap of answers, and only the tools a rehearsal shows come through", () => {
  assert.deepEqual([...REHEARSAL_KINDS].sort(), [...SCHEMA_SETS["rehearsals.kind"]].sort());
  assert.deepEqual(REVIEW_SCHEMA.properties.exchanges.items.properties.verdict.enum, [...REVIEW_VERDICTS]);
  const turns = Array.from({ length: REVIEW_LIMITS.exchangesMax + 3 }, (_, i) => [
    { role: "user", content: `question ${i}` },
    { role: "agent", content: `answer ${i}` },
  ]).flat();
  assert.equal(exchangesOf([{ role: "agent", content: "Hi!" }, ...turns]).length, REVIEW_LIMITS.exchangesMax);
  assert.deepEqual(
    turnsOfTranscript([
      { role: "agent", content: "Hi, Harbor Salon." },
      { role: "tool_call_invocation", name: REHEARSAL_SHOWN_TOOLS[0] },
      { role: "tool_call_invocation", name: "check_availability" },
      { role: "user", content: "  thanks  " },
    ]),
    [
      { role: "agent", content: "Hi, Harbor Salon." },
      { role: "tool", content: "send_booking_link" },
      { role: "user", content: "thanks" },
    ],
  );
});
