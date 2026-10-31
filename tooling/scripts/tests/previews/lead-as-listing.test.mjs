/**
 * A lead read as the listing its own receptionist is set up from (decision 0079): its week as Google's periods only
 * where every day reads, its address, number, website, kind and zone, and the receptionist the first run would give it
 * (firstReceptionistOf), which never quotes a price. Made-up leads only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstReceptionistOf,
  guardrailsInForce,
  leadAsListing,
  listingPeriodsOf,
  PREVIEW_LIMITS,
  PREVIEW_STATES,
  previewZoneOf,
} from "@chanlytics/contracts";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const week = (words) => DAYS.map((day, i) => ({ day, hours: typeof words === "function" ? words(day, i) : words }));

const LEAD = {
  business_name: "Fixture Barbers | Austin's Best Fades",
  category: "Barber shop",
  street: "12 Main St",
  city: "Austin",
  region: "TX",
  postal_code: "78701",
  phone_e164: "+15125550142",
  website_host: "fixture-barbers.example.com",
  hours: week((day) => (day === "Sunday" ? "Closed" : day === "Saturday" ? "10 AM to 2 PM" : "9 AM to 6 PM")),
};

test("a week that reads whole is Google's periods, Sunday zero, a day closed with none", () => {
  const periods = listingPeriodsOf(LEAD.hours);
  assert.equal(periods.length, 6);
  assert.deepEqual(periods[0], { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } });
  assert.deepEqual(periods[5], { open: { day: 6, hour: 10, minute: 0 }, close: { day: 6, hour: 14, minute: 0 } });
  assert.ok(!periods.some((p) => p.open.day === 0), "Sunday is closed");
});

test("two stretches in a day are two periods, and a night past midnight closes on the next day", () => {
  const split = listingPeriodsOf(week("9:30 AM to 12 PM, 1 to 5:30 PM"));
  assert.equal(split.length, 14);
  assert.deepEqual(split[1], { open: { day: 1, hour: 13, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } });
  const late = listingPeriodsOf(week("6 PM to 2 AM"));
  assert.deepEqual(late.at(-1), { open: { day: 0, hour: 18, minute: 0 }, close: { day: 1, hour: 2, minute: 0 } });
});

test("open around the clock every day is Google's one period with no close", () => {
  assert.deepEqual(listingPeriodsOf(week("Open 24 hours")), [{ open: { day: 0, hour: 0, minute: 0 }, close: null }]);
});

test("a day that doesn't read, a day missing or no week at all is no week, never a guess", () => {
  assert.equal(listingPeriodsOf(week((day) => (day === "Wednesday" ? "By appointment" : "9 AM to 5 PM"))), null);
  assert.equal(listingPeriodsOf(week("9 AM to 5 PM").slice(0, 6)), null);
  assert.equal(listingPeriodsOf([]), null);
  assert.equal(listingPeriodsOf(null), null);
  assert.equal(listingPeriodsOf([{ day: "Someday", hours: "9 AM to 5 PM" }]), null);
});

test("the lead as a listing: the name it is called by, its address, number, website, kind and zone", () => {
  const listing = leadAsListing(LEAD);
  assert.equal(listing.name, "Fixture Barbers");
  assert.equal(listing.address, "12 Main St, Austin, TX 78701");
  assert.equal(listing.facts.phone_e164, "+15125550142");
  assert.equal(listing.facts.phone_display, "+1 (512) 555-0142");
  assert.equal(listing.facts.website, "https://fixture-barbers.example.com");
  assert.equal(listing.facts.primary_type_label, "Barber shop");
  assert.equal(listing.facts.time_zone, "America/Chicago");
  assert.equal(listing.facts.service_area_only, false);
  assert.equal(listing.facts.booking_page, null);
  assert.equal(listing.facts.hours.length, 6);
});

test("a lead with no site, no street and no state has no website, no address and New York's zone", () => {
  const listing = leadAsListing({
    ...LEAD,
    website_host: null,
    street: null,
    city: null,
    region: null,
    postal_code: null,
  });
  assert.equal(listing.facts.website, null);
  assert.equal(listing.address, null);
  assert.equal(listing.facts.service_area_only, true);
  assert.equal(previewZoneOf({ region: null }), "America/New_York");
  assert.equal(previewZoneOf({ region: "CA" }), "America/Los_Angeles");
});

test("the receptionist the first run would give it: its week as listed, and no price ever quoted", () => {
  const brain = firstReceptionistOf({ workspaceName: "Fixture Barbers", listing: leadAsListing(LEAD) });
  assert.equal(brain.business_name, "Fixture Barbers");
  assert.deepEqual(brain.profile.hours.mon, { open: "09:00", close: "18:00" });
  assert.deepEqual(brain.profile.hours.sat, { open: "10:00", close: "14:00" });
  assert.deepEqual(brain.profile.hours.sun, {}, "Sunday closed, as the record keeps a day closed");
  assert.equal(brain.profile.address, "12 Main St, Austin, TX 78701");
  assert.equal(guardrailsInForce(brain.profile.guardrails).never_quote_prices, true);
  const weekless = firstReceptionistOf({
    workspaceName: "Fixture Barbers",
    listing: leadAsListing({ ...LEAD, hours: [] }),
  });
  assert.equal(weekless.profile.hours, undefined, "no week is said where the listing's does not read");
});

test("a preview's states and limits are the doors' own", () => {
  assert.deepEqual(PREVIEW_STATES, ["building", "ready", "failed", "claimed", "ended"]);
  assert.deepEqual([PREVIEW_LIMITS.messages, PREVIEW_LIMITS.days, PREVIEW_LIMITS.notRight], [20, 30, 10]);
});
