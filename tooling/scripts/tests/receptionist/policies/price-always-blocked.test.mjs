/**
 * A receptionist never states a price, whatever the "Never quote or confirm a price" switch says.
 *
 * The owner's decision, 20 September 2026. The detector runs on every reply regardless of
 * guardrails.never_quote_prices; the switch only adds or removes one line from the composed prompt,
 * so that the model rarely writes a price that then has to be caught. It reads like a bug -- a switch
 * that does not switch the thing it names -- so it is the kind of thing that gets "fixed". A review
 * made the chat detector honour the switch and every other test stayed green: the decision was
 * pinned only by the Business tab's words. This executes the edge's own code instead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spokenBreach, ruleStrength } from "@chanlytics/contracts";
import { layerTwo } from "../../../../../packages/core/src/inbound/steps.ts";

const brainCfg = (guardrails) => ({
  business_name: "Marisa's Beauty Salon",
  phone_display: "+1 (305) 555-0123",
  booking_link: "https://book.example.com/en-us/4471902",
  profile: { services: [{ name: "Balayage", duration_min: 180 }], ...(guardrails === undefined ? {} : { guardrails }) },
});

const SWITCH = [
  ["on", { never_quote_prices: true }],
  ["off", { never_quote_prices: false }],
  ["never set", undefined],
];

test("a chat reply with a price is blocked whether the switch is on, off or never set", () => {
  for (const [label, guardrails] of SWITCH) {
    for (const priced of ["A full balayage runs about $180.", "That one is 180 dollars.", "Son 180 pesos."]) {
      const out = layerTwo({
        replyText: priced,
        escalate: false,
        escalationReason: "",
        brainCfg: brainCfg(guardrails),
        policy: null,
        intent: "pricing",
      });
      assert.equal(out.priceBlocked, true, `switch ${label}: "${priced}" is caught`);
      assert.doesNotMatch(out.replyText, /180/, `switch ${label}: the customer never reads the figure`);
      assert.match(out.replyText, /consult/i, `switch ${label}: it offers a consult instead`);
    }
  }
});

test("a call's price is caught whether the switch is on or off -- the detector takes no switch at all", () => {
  // spokenBreach reads the agent's own turns and has no guardrails argument, so it cannot honour the
  // switch by construction. Pinned anyway, so adding one has to change this test.
  assert.equal(spokenBreach.length, 1, "it takes the turns and nothing else");
  const breach = spokenBreach([
    { role: "user", content: "How much is balayage?" },
    { role: "agent", content: "A full balayage runs about $180." },
  ]);
  assert.equal(breach?.rule, "price");
});

test("what the Business tab says about it matches what the edge does", () => {
  // If this and the two tests above ever disagree, the page is saying something that is not true.
  assert.match(ruleStrength("never_quote_prices").sentence, /whether this switch is on or off/);
});
