import { test } from "node:test";
import assert from "node:assert/strict";
import { US_STATE_ZONES, zoneOfRegion } from "@chanlytics/contracts";

test("every state, DC and Puerto Rico has one zone, and each is a zone the runtime knows", () => {
  assert.equal(Object.keys(US_STATE_ZONES).length, 52);
  for (const [state, zone] of Object.entries(US_STATE_ZONES)) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-US", { timeZone: zone }), `${state}: ${zone}`);
  }
});

test("a lead's region reads its zone in any case or spacing; anything else is no zone, never a guess", () => {
  assert.equal(zoneOfRegion("TX"), "America/Chicago");
  assert.equal(zoneOfRegion(" ca "), "America/Los_Angeles");
  assert.equal(zoneOfRegion("AZ"), "America/Phoenix", "Arizona keeps no daylight time");
  assert.equal(zoneOfRegion("Ontario"), null);
  assert.equal(zoneOfRegion(null), null);
});
