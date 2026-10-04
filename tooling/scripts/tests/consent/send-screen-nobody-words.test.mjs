/**
 * What the send screen says when nobody on the audience can be sent the message and somebody on it said yes (the
 * Campaigns code review of 4 Oct 2026, its P2 on D1's words). By WhatsApp or a text the ones who said yes have no
 * number, said in People's words (#663). A send that ticks email is said as the route refuses it (contracts
 * emptyAudienceRefusal): what each ticked channel asks, so an email of the business's news is never said to need a
 * number. Run, never read: the page's own reading of its state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
  location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  fetch: async () => new Response("{}", { status: 200 }),
};
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const quiet = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { bcPeopleOf } = await quiet(
  () => import("../../../../apps/dashboard/src/surfaces/campaigns/broadcasts/page/reach.ts"),
);

const regulars = { label: "Regulars" };
const reading = { people: [], saidYes: 2 };

test("nobody can be sent it and somebody said yes: by WhatsApp a number is missing; by email, what the route asks", () => {
  const by = (on) => bcPeopleOf({ active: regulars, purpose: "conversational", activeCount: 0, reading, on }).noNumber;
  assert.match(by(["whatsapp"]), /number/, "WhatsApp alone: the ones who said yes have no number to send to");
  const email = by(["email"]);
  assert.match(email, /^Nobody on “Regulars” can be sent this yet\./);
  assert.match(email, /a yes to hearing from you by email or a relationship with you on record/);
  assert.doesNotMatch(email, /number/, "an email is never said to need a number");
  // Ticked with WhatsApp, each channel says its own.
  assert.match(by(["whatsapp", "email"]), /On WhatsApp: only people with a recorded yes .* and a phone number\./);
  // Somebody can be sent it, or nobody said yes: no such line.
  assert.equal(
    bcPeopleOf({ active: regulars, purpose: "conversational", activeCount: 1, reading, on: ["email"] }).noNumber,
    null,
  );
  assert.equal(
    bcPeopleOf({
      active: regulars,
      purpose: "conversational",
      activeCount: 0,
      reading: { people: [], saidYes: 0 },
      on: ["email"],
    }).noNumber,
    null,
  );
});
