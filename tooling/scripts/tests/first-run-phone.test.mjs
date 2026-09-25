/**
 * The first run's phone step (docs/superpowers/plans/2026-09-24-first-run-4-phone.md, 4a): how calls reach the
 * receptionist, the trial with the plan's own price, and the receptionist's number on its way. The view model, over
 * made-up Setup reads: what each stage says, when the step hands back to Setup's rows, and the one button's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setupSteps,
  firstRunPhoneOf,
  areaCodeOf,
  FIRST_RUN_PHONE_WORDS as W,
  FIRST_RUN_HELPERS,
  CHECKOUT_OUTCOME_WORDS,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-24T15:00:00Z");
const LISTED = "+13055550100";
const PRICE = { id: "price_example", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Plan" };

const dtoOf = (over = {}) => ({
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 2,
    bookingLink: true,
    address: true,
    handoff: null,
    broken: false,
    receptionist: "set",
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
  lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
  google: { ready: true, places: true, listing: null, phone: LISTED },
  billing: {
    ready: true,
    livemode: true,
    mode: "stripe",
    status: "none",
    trial_end: null,
    current_period_end: null,
    trial_days: 14,
    price: PRICE,
  },
  ...over,
});
const lineOf = (over = {}) => ({
  id: "line-1",
  e164: "+13055550142",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 305,
  voice_state: "provisioning",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: "number",
  last_error: null,
  state_since: new Date(NOW - 20_000).toISOString(),
  created_at: new Date(NOW - 20_000).toISOString(),
  ...over,
});
const phone = (dto, choice = null, returned = false) =>
  firstRunPhoneOf({ dto, vm: setupSteps(dto, NOW), choice, returned, nowMs: NOW });
const trialing = { ...dtoOf().billing, status: "trialing", trial_end: "2026-10-08T15:00:00Z" };

test("the area code a number is bought in: a US number's three digits, and nothing for anything else", () => {
  assert.equal(areaCodeOf("+13055550100"), "305");
  assert.equal(areaCodeOf("(786) 555-0113"), "786", "as typed, through the one normalizer");
  assert.equal(areaCodeOf("+442071838750"), null, "not a US number");
  assert.equal(areaCodeOf(""), null);
  assert.equal(areaCodeOf(null), null);
  assert.equal(FIRST_RUN_HELPERS.areaCodeOf, areaCodeOf, "published for the page");
  assert.equal(FIRST_RUN_HELPERS.phone, firstRunPhoneOf);
});

test("choosing (canvas R3): keeping the listing's number first and recommended, the trial with Stripe's price, the button named for the result", () => {
  const vm = phone(dtoOf());
  assert.equal(vm.stage, "choose");
  assert.equal(vm.heading, "How should calls reach your receptionist?");
  assert.equal(vm.way, "keep", "keeping the number customers know is the default");
  assert.deepEqual(
    vm.ways.map((w) => [w.key, w.title, w.recommended]),
    [
      ["keep", "Keep +1 (305) 555-0100", "Recommended"],
      ["new", "Get a new number", null],
      ["move", "Move my number to Chanlytics", null],
    ],
  );
  assert.equal(vm.ways[0].sentence, W.keepListed, "the listing's number says where it came from");
  assert.deepEqual([vm.number, vm.listed, vm.area], [LISTED, LISTED, "305"]);
  assert.deepEqual(vm.trial, {
    offer: "14 days free, then $49.00 a month",
    note: "We ask for a card now, and nothing is charged until Oct 8. You can cancel anytime from Billing.",
  });
  assert.deepEqual(vm.cta, { label: "Start my free trial", held: null });
  assert.equal(vm.status, null);
  assert.equal(vm.started, null);
});

test("the trial says only what it knows: no price read, the days alone; no trial days, the price and today", () => {
  const noPrice = phone(dtoOf({ billing: { ...dtoOf().billing, price: null } }));
  assert.equal(noPrice.trial.offer, "14 days free");
  const oldRead = phone(dtoOf({ billing: { ...dtoOf().billing, price: undefined } }));
  assert.equal(oldRead.trial.offer, "14 days free", "a read from before the price was carried");
  const noDays = phone(dtoOf({ billing: { ...dtoOf().billing, trial_days: 0 } }));
  assert.deepEqual(noDays.trial, {
    offer: "$49.00 a month",
    note: "We ask for a card now, and the first charge is today. You can cancel anytime from Billing.",
  });
});

test("each way names its button, and holds it until there is a number to keep or one picked", () => {
  const pick = { e164: "+13055550142", friendly: "(305) 555-0142" };
  const trial = (choice) => phone(dtoOf(), { pick: null, number: null, pending: false, ...choice }).cta;
  assert.deepEqual(trial({ way: "new" }), { label: "Start my free trial", held: "Pick a number first." });
  assert.deepEqual(trial({ way: "new", pick }), { label: "Start my trial with (305) 555-0142", held: null });
  assert.deepEqual(trial({ way: "move", number: LISTED }), {
    label: "Start my trial and ask for the move",
    held: null,
  });
  assert.deepEqual(
    trial({ way: "keep", number: "" }),
    { label: "Start my free trial", held: "Type the number customers call." },
    "an emptied box is no number, whatever the listing says",
  );
  const typed = phone(dtoOf(), { way: "keep", number: "786 555 0113", pick: null, pending: false });
  assert.deepEqual([typed.number, typed.area, typed.ways[0].title], ["+17865550113", "786", "Keep +1 (786) 555-0113"]);
  assert.equal(typed.ways[0].sentence, W.keepTyped, "not the listing's, so not said to be");

  // Already paying: no trial, and the button buys.
  const paying = (choice) =>
    phone(dtoOf({ billing: trialing }), { pick: null, number: LISTED, pending: false, ...choice }).cta.label;
  assert.equal(paying({ way: "keep" }), "Keep this number");
  assert.equal(paying({ way: "new", pick }), "Get (305) 555-0142");
  assert.equal(paying({ way: "move" }), "Ask for the move");
  const direct = phone(dtoOf({ billing: undefined }));
  assert.deepEqual([direct.stage, direct.trial], ["choose", null], "a workspace that does not pay by card");
});

test("no listing number: the keep card asks for one, and a new number's area code is the owner's to type", () => {
  const vm = phone(dtoOf({ google: { ready: true, places: true, listing: null } }));
  assert.deepEqual([vm.number, vm.listed, vm.area], [null, null, null]);
  assert.equal(vm.ways[0].title, "Keep the number you have");
  assert.equal(vm.cta.held, "Type the number customers call.");
});

test("back from checkout before the trial lands: starting, in Billing's own words", () => {
  const vm = phone(dtoOf(), { way: "keep", number: null, pick: null, pending: true }, true);
  assert.equal(vm.stage, "starting");
  assert.deepEqual(vm.status, { sentence: "Starting your trial…", detail: CHECKOUT_OUTCOME_WORDS.success });
  assert.equal(vm.cta, null);
});

test("pressed and allowed to spend: buying, in the area code of the number kept, or the number picked", () => {
  const keep = phone(dtoOf({ billing: trialing }), { way: "keep", number: null, pick: null, pending: true });
  assert.equal(keep.stage, "buying");
  assert.deepEqual(keep.status, {
    sentence: "Getting your receptionist's number in 305…",
    detail: "Usually a minute or two; this page updates by itself",
  });
  assert.equal(keep.started, "Your trial has started. Nothing is charged until Oct 8.");
  assert.equal(keep.lead, W.readyLeadForwarded, "customers never see it");
  const pick = { e164: "+13055550142", friendly: "(305) 555-0142" };
  const fresh = phone(dtoOf({ billing: trialing }), { way: "new", number: null, pick, pending: true });
  assert.equal(fresh.status.sentence, "Getting (305) 555-0142…");
  assert.equal(fresh.lead, W.readyLeadNew);
  // Not pressed: still choosing, trial or none.
  assert.equal(
    phone(dtoOf({ billing: trialing }), { way: "keep", number: null, pick: null, pending: false }).stage,
    "choose",
  );
});

test("a number on its way (canvas R4): the line row's own words", () => {
  const dto = dtoOf({ billing: trialing, lines: { ...dtoOf().lines, rows: [lineOf()] } });
  const vm = phone(dto, { way: "keep", number: null, pick: null, pending: false });
  const row = setupSteps(dto, NOW).rows.find((r) => r.id === "line");
  assert.equal(vm.stage, "getting");
  assert.deepEqual(vm.status, { sentence: row.sentence, detail: row.details[0] });
  assert.match(vm.status.sentence, /^Setting up \+1 \(305\) 555-0142 — buying the number/);
  const connecting = phone(
    dtoOf({ billing: trialing, lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" })] } }),
  );
  assert.equal(connecting.stage, "getting", "set up and being connected to the receptionist");
});

test("everything this step does not draw is Setup's rows, which already say it", () => {
  const rowsFor = (over) => phone(dtoOf(over)).stage;
  assert.equal(rowsFor({ lines: { ...dtoOf().lines, ready: false } }), "rows", "no provider: a person sets it up");
  assert.equal(rowsFor({ requests: { line: "2026-09-20T10:00:00Z" } }), "rows", "a line asked of a person");
  assert.equal(rowsFor({ requests: { line: null, port: "2026-09-20T10:00:00Z" } }), "rows", "a move asked of a person");
  assert.equal(
    rowsFor({ lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "failed" })] } }),
    "rows",
    "a line that stopped: the row's Retry",
  );
  assert.equal(
    rowsFor({ lines: { ...dtoOf().lines, rows: [lineOf({ state_since: new Date(NOW - 3_600_000).toISOString() })] } }),
    "rows",
    "stuck past the deadline: the row's Retry",
  );
  assert.equal(
    rowsFor({
      channels: {
        ...dtoOf().channels,
        voice: { present: true, active: true, number: "+13055550142", lastInboundAt: null },
      },
    }),
    "rows",
    "a line that answers",
  );
  assert.equal(rowsFor({ billing: { ...dtoOf().billing, status: "past_due" } }), "rows", "billing needs Billing");
  assert.equal(
    rowsFor({ billing: { ...dtoOf().billing, status: "canceled" } }),
    "rows",
    "a subscription to start again in Billing",
  );
  assert.equal(
    rowsFor({ billing: { ...dtoOf().billing, ready: false } }),
    "rows",
    "a card workspace where this deployment cannot charge: the line row's own sentence",
  );
});
