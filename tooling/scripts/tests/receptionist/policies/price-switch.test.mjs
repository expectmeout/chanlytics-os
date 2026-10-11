/**
 * "Never quote a price" does what its label says (decision 0051, 11 October 2026).
 *
 * It reverses the owner's decision of 20 September 2026, that a receptionist never states a price whatever the switch
 * says, which this file pinned under the name price-always-blocked. On, no price leaves the receptionist. Off, the
 * amounts the owner wrote may, and only those: a price nobody wrote is caught on every reply, switch on, off or never
 * set. The detectors take the allowance (contracts priceAllowance) and nothing else, so the Business tab's words and the
 * edge's code are held to one another here, by executing the edge's own code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spokenBreach, ruleStrength, priceAllowance } from "@chanlytics/contracts";
import { layerTwo } from "../../../../../packages/core/src/inbound/steps.ts";

const brainCfg = (guardrails, priceNote) => ({
  business_name: "Marisa's Beauty Salon",
  phone_display: "+1 (305) 555-0123",
  booking_link: "https://book.example.com/en-us/4471902",
  profile: {
    services: [{ name: "Balayage", duration_min: 180, ...(priceNote ? { price_note: priceNote } : {}) }],
    ...(guardrails === undefined ? {} : { guardrails }),
  },
});

const SWITCH = [
  ["on", { never_quote_prices: true }],
  ["off", { never_quote_prices: false }],
  ["never set", undefined],
];
const PRICED = ["A full balayage runs about $180.", "That one is 180 dollars.", "Son 180 pesos."];
const reply = (replyText, cfg) =>
  layerTwo({ replyText, escalate: false, escalationReason: "", brainCfg: cfg, policy: null, intent: "pricing" });

test("a price nobody wrote is blocked in a chat reply whether the switch is on, off or never set", () => {
  for (const [label, guardrails] of SWITCH) {
    for (const priced of PRICED) {
      const out = reply(priced, brainCfg(guardrails));
      assert.equal(out.priceBlocked, true, `switch ${label}: "${priced}" is caught`);
      assert.doesNotMatch(out.replyText, /180/, `switch ${label}: the customer never reads the figure`);
      assert.match(
        out.replyText,
        /a member of our team will follow up here/i,
        `switch ${label}: it hands the question to a person instead`,
      );
    }
  }
});

test("a price the owner wrote is said with the switch off, and only then", () => {
  for (const priced of PRICED) {
    assert.equal(reply(priced, brainCfg({ never_quote_prices: false }, "$180")).priceBlocked, false, priced);
    assert.equal(reply(priced, brainCfg({ never_quote_prices: true }, "$180")).priceBlocked, true, priced);
    assert.equal(reply(priced, brainCfg(undefined, "$180")).priceBlocked, true, priced);
  }
  assert.equal(reply("It's $200.", brainCfg({ never_quote_prices: false }, "$180")).priceBlocked, true);
});

test("a call's price is caught by the same allowance -- the detector takes it as its one required argument", () => {
  // Required, so a caller says which: a defaulted second argument would leave .length at 1 and this pin green.
  assert.equal(spokenBreach.length, 2, "the turns, and the allowance");
  const turns = [
    { role: "user", content: "How much is balayage?" },
    { role: "agent", content: "A full balayage runs about $180." },
  ];
  assert.equal(spokenBreach(turns, null)?.rule, "price", "strict: any price");
  assert.equal(spokenBreach(turns, priceAllowance(brainCfg({ never_quote_prices: false }, "$180"))), null);
  assert.equal(spokenBreach(turns, priceAllowance(brainCfg({ never_quote_prices: false })))?.rule, "price");
});

test("what the Business tab says about it is what the receptionist does, claim by claim", () => {
  // Each claim the sentence makes, beside the reply that proves it: a page that says what the code does not fails here.
  const { strength, sentence } = ruleStrength("never_quote_prices");
  const written = (on) => brainCfg({ never_quote_prices: on }, "$180");
  assert.equal(strength, "checked");
  assert.match(sentence, /Every reply is checked for a price in dollars or pesos/);
  for (const priced of ["It's $180.", "Son 180 pesos."])
    assert.equal(reply(priced, written(false)).priceBlocked, false);
  assert.match(sentence, /On, it says none/);
  assert.equal(reply("It's $180.", written(true)).priceBlocked, true);
  assert.match(sentence, /off, it may say the ones you've written, and any other is swapped out/);
  const other = reply("It's $200.", written(false));
  assert.equal(other.priceBlocked, true);
  assert.doesNotMatch(other.replyText, /200/, "swapped out: the customer never reads it");
});
