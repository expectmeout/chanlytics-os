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
const { bcPeopleOf, bcReachOf } = await quiet(
  () => import("../../../../apps/dashboard/src/surfaces/campaigns/broadcasts/page/reach.ts"),
);
const { NO_CHANNEL_REACH, channelsReady, noChannelWords } = await import("@chanlytics/contracts");

const regulars = { label: "Regulars" };
const reading = { people: [], saidYes: 2 };

test("nobody can be sent it and somebody said yes: by WhatsApp a number is missing; by email, what the route asks", () => {
  const by = (on) =>
    bcPeopleOf({ active: regulars, purpose: "conversational", activeCount: 0, leftOut: 0, reading, on }).noNumber;
  assert.match(by(["whatsapp"]), /number/, "WhatsApp alone: the ones who said yes have no number to send to");
  const email = by(["email"]);
  assert.match(email, /^Nobody on “Regulars” can be sent this yet\./);
  assert.match(email, /a yes to hearing from you by email or a relationship with you on record/);
  assert.doesNotMatch(email, /number/, "an email is never said to need a number");
  // Ticked with WhatsApp, each channel says its own.
  assert.match(by(["whatsapp", "email"]), /On WhatsApp: only people with a recorded yes .* and a phone number\./);
  // Somebody can be sent it, or nobody said yes: no such line.
  assert.equal(
    bcPeopleOf({ active: regulars, purpose: "conversational", activeCount: 1, leftOut: 0, reading, on: ["email"] })
      .noNumber,
    null,
  );
  assert.equal(
    bcPeopleOf({
      active: regulars,
      purpose: "conversational",
      activeCount: 0,
      leftOut: 0,
      reading: { people: [], saidYes: 0 },
      on: ["email"],
    }).noNumber,
    null,
  );
  // Everyone on it left out by the week's breath (they hear from you within a week of it): they can be reached, so nobody
  // is said to lack a number, on any channel.
  for (const on of [["whatsapp"], ["email"]])
    assert.equal(
      bcPeopleOf({ active: regulars, purpose: "conversational", activeCount: 0, leftOut: 2, reading, on }).noNumber,
      null,
      `${on}: the ones left out can be reached`,
    );
});

test("REGRESSION: on a US WhatsApp number an offer's line says how many said yes and that no channel can carry it -- it said '0 people on “Everyone” said yes to offers' (the operator stress run, 15 Oct 2026)", () => {
  // Meta's pause on offers to US numbers closes WhatsApp to an offer, and nothing else carries one: the send goes by no
  // channel, and the server's reading of the list (by WhatsApp alone) counts the 26 who said yes.
  const ready = channelsReady({
    whatsapp: { canSend: true, refusal: null, number: "+13055550100" },
    textLine: null,
    email: { mailbox: false, domain: false },
  });
  const nobody = { sending: 0, held: 26, saidYes: 26, people: [], heardTouches: [] };
  const base = { ...nobody, split: { reached: 0, byChannel: { whatsapp: 0, sms: 0, email: 0 }, held: 26, heldBy: {} } };
  const everyone = {
    kind: "everyone",
    id: null,
    label: "Everyone",
    counts: { marketing: 0, conversational: 26 },
    preview: { marketing: base, conversational: base },
  };
  const reach = bcReachOf({
    audiences: [everyone],
    aud: "everyone:",
    templates: [],
    tplId: "",
    data: { ready, number: null },
    channels: ["whatsapp"],
    heardTooFor: null,
    setHeardTooFor() {},
    whenAt: null,
  });
  assert.deepEqual(reach.on, [], "no channel carries an offer here");
  assert.equal(reach.reading.saidYes, 26, "REGRESSION: the list's yes was read as none where no channel was open");
  const said = bcPeopleOf({ ...reach, active: everyone });
  assert.equal(
    said.yesWords,
    `26 people on “Everyone” said yes to offers, none can be sent an offer — ${NO_CHANNEL_REACH}`,
  );
  assert.equal(said.noNumber, noChannelWords("“Everyone”", "marketing"), "a channel is missing, never a number");
});
