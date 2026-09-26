import { test } from "node:test";
import assert from "node:assert/strict";
import {
  outreachRefusalOf,
  OUTREACH_WAIT_REFUSALS,
  isWaitRefusal,
  reachOutSlots,
  REACH_OUT_MONTH_EMAILS,
} from "@chanlytics/contracts";

const facts = (over = {}) => ({ leadStage: "ready", suppressed: false, wroteBack: false, ...over });

test("the lead's own facts, in the door's order: not a lead, closed, the never-again list, wrote back", () => {
  assert.equal(outreachRefusalOf(facts({ leadStage: null })), "outreach_not_a_lead");
  for (const stage of ["converted", "archived"])
    assert.equal(outreachRefusalOf(facts({ leadStage: stage })), "outreach_lead_closed");
  assert.equal(outreachRefusalOf(facts({ suppressed: true, wroteBack: true })), "outreach_suppressed");
  assert.equal(outreachRefusalOf(facts({ wroteBack: true })), "outreach_wrote_back");
  assert.equal(outreachRefusalOf(facts({ leadStage: "nurture" })), null);
});

test("a wait is the cap and a domain not ready: a send that meets one goes later, never nowhere", () => {
  assert.deepEqual([...OUTREACH_WAIT_REFUSALS], ["sending_domain_at_cap", "sending_domain_not_ready"]);
  assert.equal(isWaitRefusal("sending_domain_at_cap"), true);
  assert.equal(isWaitRefusal("outreach_wrote_back"), false);
});

test("the slots Part 3 fills, and a slot with nothing to say holds the email", () => {
  const lead = { business_name: "Harbor Movers", city: "Austin" };
  assert.deepEqual(
    reachOutSlots("Hi {{business}} in {{city}}, from {{your business}}", lead, { businessName: "Best Movers" }),
    {
      ok: true,
      text: "Hi Harbor Movers in Austin, from Best Movers",
    },
  );
  assert.deepEqual(
    reachOutSlots("Hi {{business}} in {{city}}", { business_name: "Harbor", city: null }, { businessName: "Best" }),
    {
      ok: false,
      reason: "missing_value",
    },
  );
  assert.equal(REACH_OUT_MONTH_EMAILS, 2000);
});
