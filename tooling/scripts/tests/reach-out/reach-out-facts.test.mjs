/**
 * The opening a listing's own fields write (decision 0078, contracts reach-out-facts.ts): open 24 hours, its closing
 * times, or its rating, said as one sentence by code, with nothing to guess; and every sentence passes the check's own
 * rules against the record the check builds from the same listing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOpening, leadFactOf } from "@chanlytics/contracts";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** A week of hours as the finder stores them (00144): [{day, hours}], Monday first. */
const week = (...hours) => DAYS.map((day, i) => ({ day, hours: hours[i] }));
const weekdays = (h, sat, sun) => week(h, h, h, h, h, sat, sun);

const LISTING = {
  business_name: "Harbor Auto Repair",
  city: "Staten Island",
  hours: null,
  rating: null,
  reviews: null,
};

/** The record the check builds from a listing (the edge's openingRecordOf over hoursLine), for checkOpening. */
const recordOf = (l) => ({
  business_name: l.business_name,
  category: "Auto repair shop",
  city: l.city,
  region: "NY",
  rating: l.rating,
  reviews: l.reviews,
  website: null,
  hours: Array.isArray(l.hours) ? l.hours.map((h) => `${h.day} ${h.hours}`).join("; ") : null,
  about: null,
  why_it_fits: null,
  what_you_asked: null,
});

/** The fact's sentence, after the check's own rules read it against the record: a problem fails the test. */
function said(l) {
  const f = leadFactOf(l);
  if (f === null) return null;
  assert.equal(checkOpening(f, recordOf(l)), null, `the check refuses: ${f.opening}`);
  return f;
}

test("a listing open around the clock every day says so, leaning on its hours", () => {
  const f = said({ ...LISTING, hours: week(...Array(7).fill("Open 24 hours")), rating: 4.9, reviews: 645 });
  assert.equal(f.opening, "Harbor Auto Repair is open 24 hours, seven days a week.");
  assert.equal(f.angle, "open 24 hours");
  assert.deepEqual(f.facts_used, ["hours"]);
});

test("one closing time every day is said once", () => {
  const f = said({ ...LISTING, hours: week(...Array(7).fill("10 AM to 8 PM")) });
  assert.equal(f.opening, "Harbor Auto Repair is open until 8 PM every day.");
  assert.equal(f.angle, "their hours");
});

test("weekdays close at one time, and Saturday and Sunday are said as the listing has them", () => {
  assert.equal(
    said({ ...LISTING, hours: weekdays("8 AM to 5 PM", "8 AM to 1 PM", "Closed") }).opening,
    "Harbor Auto Repair is open until 5 PM on weekdays and until 1 PM on Saturdays.",
  );
  assert.equal(
    said({ ...LISTING, hours: weekdays("9 AM to 6 PM", "9 AM to 6 PM", "Closed") }).opening,
    "Harbor Auto Repair is open until 6 PM Monday to Saturday.",
  );
  assert.equal(
    said({ ...LISTING, hours: weekdays("8:30 AM to 5 PM", "Closed", "Closed") }).opening,
    "Harbor Auto Repair is open until 5 PM on weekdays and closed on weekends.",
  );
  assert.equal(
    said({ ...LISTING, hours: weekdays("8 AM to 8:30 PM", "9 AM to 6 PM", "10 AM to 4 PM") }).opening,
    "Harbor Auto Repair is open until 8:30 PM on weekdays, and on weekends too.",
  );
  assert.equal(
    said({ ...LISTING, hours: weekdays("8 AM to 6 PM", "Closed", "9 AM to 2 PM") }).opening,
    "Harbor Auto Repair is open until 6 PM on weekdays.",
  );
});

test("a closing time at midnight is said as midnight", () => {
  assert.equal(
    said({ ...LISTING, hours: week(...Array(7).fill("6 AM to 12 AM")) }).opening,
    "Harbor Auto Repair is open until midnight every day.",
  );
});

test("hours code cannot read whole say nothing of hours: the rating speaks, or nothing does", () => {
  const rated = { ...LISTING, rating: 4.8, reviews: 66 };
  const rating = "Harbor Auto Repair has a 4.8 rating across 66 reviews.";
  // Weekdays that close at different times.
  assert.equal(
    said({
      ...rated,
      hours: weekdays("8 AM to 5 PM", "Closed", "Closed").map((h, i) =>
        i === 2 ? { ...h, hours: "8 AM to 7 PM" } : h,
      ),
    }).opening,
    rating,
  );
  // A day missing.
  assert.equal(said({ ...rated, hours: weekdays("8 AM to 5 PM", "Closed", "Closed").slice(0, 6) }).opening, rating);
  // A shape it does not read: a split day.
  assert.equal(said({ ...rated, hours: weekdays("9 AM to 1 PM, 2 to 6 PM", "Closed", "Closed") }).opening, rating);
  // Not a week at all.
  assert.equal(said({ ...rated, hours: "Mon–Fri 8–5" }).opening, rating);
  assert.equal(leadFactOf({ ...LISTING, hours: "Mon–Fri 8–5" }), null);
});

test("a rating is said only from 4.0 up, with 20 reviews or more, to one decimal", () => {
  const f = said({ ...LISTING, rating: 5, reviews: 20 });
  assert.equal(f.opening, "Harbor Auto Repair has a 5.0 rating across 20 reviews.");
  assert.equal(f.angle, "their rating");
  assert.deepEqual(f.facts_used, ["rating", "reviews"]);
  assert.equal(leadFactOf({ ...LISTING, rating: 4.9, reviews: 19 }), null);
  assert.equal(leadFactOf({ ...LISTING, rating: 3.9, reviews: 500 }), null);
  assert.equal(leadFactOf({ ...LISTING, rating: null, reviews: 500 }), null);
});

test("the business is named as every email names it, and a listing with no name says nothing", () => {
  const f = said({
    ...LISTING,
    business_name: "Harbor Auto Repair | Brakes, Oil Change & Tires | Staten Island",
    rating: 4.6,
    reviews: 120,
  });
  assert.equal(f.opening, "Harbor Auto Repair has a 4.6 rating across 120 reviews.");
  assert.equal(leadFactOf({ ...LISTING, business_name: " ", rating: 4.6, reviews: 120 }), null);
});
