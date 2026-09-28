/**
 * The first run's phone step (docs/superpowers/plans/2026-09-24-first-run-4-phone.md, 4a): how calls reach the
 * receptionist, the plan the number starts at its own price, and the receptionist's number on its way. The view model, over
 * made-up Setup reads: what each stage says, when the step hands back to Setup's rows, and the one button's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setupSteps,
  firstRunPhoneOf,
  areaCodeOf,
  forwardingCarrierOf,
  FIRST_RUN_PHONE_WORDS as W,
  FIRST_RUN_HELPERS,
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
/** A workspace whose plan is paid: the one kind that may spend on our account (contracts maySpend). */
const paying = { ...dtoOf().billing, status: "active", current_period_end: "2026-10-08T15:00:00Z" };

test("the area code a number is bought in: a US number's three digits, and nothing for anything else", () => {
  assert.equal(areaCodeOf("+13055550100"), "305");
  assert.equal(areaCodeOf("(786) 555-0113"), "786", "as typed, through the one normalizer");
  assert.equal(areaCodeOf("+442071838750"), null, "not a US number");
  assert.equal(areaCodeOf(""), null);
  assert.equal(areaCodeOf(null), null);
  assert.equal(FIRST_RUN_HELPERS.areaCodeOf, areaCodeOf, "published for the page");
  assert.equal(FIRST_RUN_HELPERS.phone, firstRunPhoneOf);
});

test("choosing (canvas R3): keeping the listing's number first and recommended, the plan the number starts at Stripe's price, the button named for the result", () => {
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
  assert.equal(vm.box, "+1 (305) 555-0100", "the box starts from the listing's number, as the app writes one");
  // A number is a cost on our account whether or not a trial ever pays, so it starts the plan: no free days offered.
  assert.deepEqual(vm.plan, {
    offer: "$49.00 a month, starting today",
    note: "Your number is included. The first charge is today, and you can cancel anytime from Billing.",
  });
  assert.doesNotMatch(`${vm.plan.offer} ${vm.plan.note}`, /free|trial|days/i);
  assert.deepEqual(vm.cta, { label: "Start my plan", held: null, act: "plan" });
  assert.equal(vm.status, null);
});

test("the plan says only what it knows: no price read, no price said; a deployment's trial days change nothing here", () => {
  const noPrice = phone(dtoOf({ billing: { ...dtoOf().billing, price: null } }));
  assert.equal(noPrice.plan.offer, "Your plan, starting today");
  const oldRead = phone(dtoOf({ billing: { ...dtoOf().billing, price: undefined } }));
  assert.equal(oldRead.plan.offer, "Your plan, starting today", "a read from before the price was carried");
  const noDays = phone(dtoOf({ billing: { ...dtoOf().billing, trial_days: 0 } }));
  assert.deepEqual(noDays.plan, phone(dtoOf()).plan);
});

test("on a free trial: the trial covers no number, so the step starts the plan early -- said, and nothing is bought while it is still a trial", () => {
  const vm = phone(dtoOf({ billing: trialing }));
  assert.equal(vm.stage, "choose");
  assert.deepEqual(vm.plan, {
    offer: "$49.00 a month, starting today",
    note: "Your free trial ends today and your plan starts, on the card you gave. Your number is included.",
  });
  assert.deepEqual(vm.cta, { label: "Start my plan", held: null, act: "startNow" });
  const picked = phone(dtoOf({ billing: trialing }), {
    way: "new",
    number: null,
    pick: { e164: "+13055550142", friendly: "(305) 555-0142" },
    pending: false,
  });
  assert.deepEqual(picked.cta, { label: "Start my plan with +1 (305) 555-0142", held: null, act: "startNow" });
  // Pressed, and still a trial (the start not yet taken): choosing, never buying.
  const pressed = phone(dtoOf({ billing: trialing }), { way: "keep", number: null, pick: null, pending: true });
  assert.equal(pressed.stage, "choose", "no number is bought on a trial");
  assert.equal(pressed.cta.act, "startNow");
});

test("each way names its button, and holds it until there is a number to keep or one picked", () => {
  const pick = { e164: "+13055550142", friendly: "(305) 555-0142" };
  const trial = (choice) => {
    const { label, held } = phone(dtoOf(), { pick: null, number: null, pending: false, ...choice }).cta;
    return { label, held };
  };
  assert.deepEqual(trial({ way: "new" }), { label: "Start my plan", held: "Pick a number first." });
  assert.deepEqual(
    trial({ way: "new", pick }),
    { label: "Start my plan with +1 (305) 555-0142", held: null },
    "the app's own way of writing a number, never the carrier's",
  );
  assert.deepEqual(trial({ way: "move", number: LISTED }), {
    label: "Start my plan and ask for the move",
    held: null,
  });
  assert.deepEqual(
    trial({ way: "keep", number: "" }),
    { label: "Start my plan", held: "Type the number customers call." },
    "an emptied box is no number, whatever the listing says",
  );
  assert.deepEqual(
    trial({ way: "keep", number: "+44 20 7183 8750" }),
    { label: "Start my plan", held: "Forwarding works for a US number: type it with its area code." },
    "no card is taken for a number that cannot be forwarded here",
  );
  assert.equal(trial({ way: "move", number: "5550 0100" }).held, W.held.us, "eight digits: not a US number");
  const typed = phone(dtoOf(), { way: "keep", number: "786 555 0113", pick: null, pending: false });
  assert.deepEqual([typed.number, typed.area, typed.ways[0].title], ["+17865550113", "786", "Keep +1 (786) 555-0113"]);
  assert.equal(typed.ways[0].sentence, W.keepTyped, "not the listing's, so not said to be");

  // Already paying: the button buys.
  const paying = (choice) =>
    phone(dtoOf({ billing: paying }), { pick: null, number: LISTED, pending: false, ...choice }).cta.label;
  assert.equal(paying({ way: "keep" }), "Keep this number");
  assert.equal(paying({ way: "new", pick }), "Get +1 (305) 555-0142");
  assert.equal(paying({ way: "move" }), "Ask for the move");
  const direct = phone(dtoOf({ billing: undefined }));
  assert.deepEqual([direct.stage, direct.plan], ["choose", null], "a workspace that does not pay by card");
});

test("(D) the number box's own problem: something typed that cannot be forwarded, said on the box -- nothing before anything is typed", () => {
  const box = (choice) => phone(dtoOf(), { pick: null, number: null, pending: false, ...choice });
  assert.equal(box({ way: "keep" }).boxProblem, null, "the listing's number, untouched");
  assert.equal(
    box({ way: "keep", number: "" }).boxProblem,
    null,
    "an emptied box asks through the button, not as a fault",
  );
  for (const typed of ["12", "+44 20 7183 8750", "5550 0100"]) {
    const vm = box({ way: "keep", number: typed });
    assert.equal(vm.boxProblem, W.held.us, typed);
    assert.equal(vm.cta.held, vm.boxProblem, "the button says the same");
  }
  assert.equal(box({ way: "move", number: "12" }).boxProblem, W.held.us, "a number moved, the same");
  assert.equal(box({ way: "keep", number: "(786) 555-0113" }).boxProblem, null);
  assert.equal(box({ way: "new", number: "12" }).boxProblem, null, "a new number has no box");
});

test("no listing number: the keep card asks for one, and a new number's area code is the owner's to type", () => {
  const vm = phone(dtoOf({ google: { ready: true, places: true, listing: null } }));
  assert.deepEqual([vm.number, vm.listed, vm.area, vm.box], [null, null, null, ""]);
  assert.equal(vm.ways[0].title, "Keep the number you have");
  assert.equal(vm.cta.held, "Type the number customers call.");
});

test("back from checkout before the plan lands: starting, until Stripe confirms it", () => {
  const vm = phone(dtoOf(), { way: "keep", number: null, pick: null, pending: true }, true);
  assert.equal(vm.stage, "starting");
  assert.deepEqual(vm.status, {
    state: "waiting_them",
    words: "Waiting on us",
    sentence: "Starting your plan…",
    detail: "Your card is on file. This page updates as Stripe confirms it.",
  });
  assert.equal(vm.cta, null);
});

test("pressed and allowed to spend: buying, in the area code of the number kept, or the number picked", () => {
  const keep = phone(dtoOf({ billing: paying }), { way: "keep", number: null, pick: null, pending: true });
  assert.equal(keep.stage, "buying");
  assert.deepEqual(keep.status, {
    state: "waiting_them",
    words: "Waiting on us",
    sentence: "Getting your receptionist's number in 305…",
    detail: "Usually a minute or two; this page updates by itself",
  });
  assert.equal(keep.lead, W.readyLeadForwarded, "customers never see it");
  const pick = { e164: "+13055550142", friendly: "(305) 555-0142" };
  const fresh = phone(dtoOf({ billing: paying }), { way: "new", number: null, pick, pending: true });
  assert.equal(fresh.status.sentence, "Getting +1 (305) 555-0142…");
  assert.equal(fresh.lead, W.readyLeadNew);
  // Not pressed: still choosing, trial or none.
  assert.equal(
    phone(dtoOf({ billing: paying }), { way: "keep", number: null, pick: null, pending: false }).stage,
    "choose",
  );
});

test("a number on its way (canvas R4): the line row's own words", () => {
  const dto = dtoOf({ billing: paying, lines: { ...dtoOf().lines, rows: [lineOf()] } });
  const vm = phone(dto, { way: "keep", number: null, pick: null, pending: false });
  const row = setupSteps(dto, NOW).rows.find((r) => r.id === "line");
  assert.equal(vm.stage, "getting");
  assert.deepEqual(vm.status, {
    state: row.state,
    words: row.stateWords,
    sentence: row.sentence,
    detail: row.details[0],
  });
  assert.match(vm.status.sentence, /^Setting up \+1 \(305\) 555-0142 — buying the number/);
  assert.equal(vm.lead, W.readyLeadForwarded);
  assert.equal(phone(dto).lead, "", "a tab that lost the choice does not say who sees the number");
  const connecting = phone(
    dtoOf({ billing: paying, lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" })] } }),
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

/* ---- 4b: the two questions and the code ---- */
const VOICE = "+13055550142";
const answeringDto = (over = {}) =>
  dtoOf({
    billing: paying,
    channels: { ...dtoOf().channels, voice: { present: true, active: true, number: VOICE, lastInboundAt: null } },
    lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" })] },
    ...over,
  });
const forwardedLine = (carrier, state = "instructed") =>
  lineOf({
    id: "fw-1",
    e164: LISTED,
    kind: "forwarded",
    provider: "carrier",
    voice_state: "none",
    forwarding_state: state,
    forwarding: {
      carrier,
      mode: "unanswered",
      destination_e164: VOICE,
      test_from: null,
      test_until: null,
      verified_at: state === "verified" ? "2026-09-24T14:00:00Z" : null,
    },
  });
const kept = (over = {}) => ({ way: "keep", number: null, pick: null, pending: false, ...over });

test("the carrier a phone's code comes from: a mobile's company, a landline's landline codes, nothing unanswered", () => {
  assert.equal(forwardingCarrierOf("mobile", "tmobile"), "tmobile");
  assert.equal(forwardingCarrierOf("landline", "verizon"), "other", "a landline takes the landline codes");
  assert.equal(forwardingCarrierOf("landline", null), "other");
  assert.equal(forwardingCarrierOf("mobile", null), null, "a mobile needs its company");
  assert.equal(forwardingCarrierOf(null, "att"), null);
  assert.equal(forwardingCarrierOf("office", "verizon"), "office", "an office phone system takes no code");
  assert.equal(FIRST_RUN_HELPERS.forwardingCarrierOf, forwardingCarrierOf);
});

test("while the number is on its way (canvas R4): the two questions for a number kept, the button held until the line answers", () => {
  const buying = phone(dtoOf({ billing: paying }), kept({ pending: true }));
  assert.equal(buying.stage, "buying");
  assert.equal(buying.questions.rings.label, "Which phone rings when customers call +1 (305) 555-0100?");
  assert.deepEqual(
    buying.questions.rings.options.map((o) => o.label),
    ["A mobile", "A landline", "An office phone system"],
  );
  assert.equal(buying.questions.company, null, "a company is asked of a mobile only");
  assert.deepEqual(buying.cta, { label: "Show me what to dial", held: "Ready in a moment", act: "forward" });
  const mobile = phone(dtoOf({ billing: paying }), kept({ pending: true, rings: "mobile" }));
  assert.deepEqual(
    mobile.questions.company.options.map((o) => o.label),
    ["Verizon", "AT&T", "T-Mobile", "Another company"],
  );
  const getting = phone(
    dtoOf({ billing: paying, lines: { ...dtoOf().lines, rows: [lineOf()] } }),
    kept({ rings: "mobile", company: "att" }),
  );
  assert.equal(getting.stage, "getting");
  assert.equal(getting.questions.company.value, "att");
  assert.equal(getting.cta.held, "Ready in a moment");
  const fresh = phone(dtoOf({ billing: paying }), {
    way: "new",
    number: null,
    pick: { e164: VOICE, friendly: "" },
    pending: true,
  });
  assert.equal(fresh.questions, null, "a new number is called directly: nothing to forward");
  assert.equal(fresh.cta, null);
});

test("the line answers and nothing is forwarded yet: the questions, and the button saves once both are answered", () => {
  const unanswered = phone(answeringDto(), kept());
  assert.equal(unanswered.stage, "ask");
  assert.deepEqual(unanswered.cta, {
    label: "Show me what to dial",
    held: "Answer the questions first.",
    act: "forward",
  });
  assert.equal(phone(answeringDto(), kept({ rings: "mobile" })).cta.held, "Answer the questions first.");
  assert.equal(phone(answeringDto(), kept({ rings: "mobile", company: "verizon" })).cta.held, null);
  assert.equal(phone(answeringDto(), kept({ rings: "landline" })).cta.held, null, "a landline needs no company");
  assert.equal(phone(answeringDto(), null).stage, "rows", "a tab that lost the choice: Setup's keep row, as before");
  assert.equal(
    phone(answeringDto(), { way: "new", number: null, pick: null, pending: false }).stage,
    "rows",
    "a new number answers: the step is done",
  );
});

test("the code (canvas R5, P5): from the forwarding saved, with the steps, the warning and the way to switch it off", () => {
  const dto = answeringDto({
    lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" }), forwardedLine("verizon")] },
  });
  const vm = phone(dto, kept({ rings: "landline" }));
  assert.equal(vm.stage, "code");
  assert.equal(vm.heading, "Dial this on the phone customers call");
  assert.deepEqual(vm.cta, { label: "Done, let's try it", held: null, act: "onward" });
  assert.equal(vm.code.label, "A landline");
  assert.deepEqual([vm.code.dial, vm.code.tap], ["*713055550142", null], "the carrier saved decides the code");
  assert.deepEqual(vm.code.steps, [
    "Pick up the phone customers call.",
    "Dial the code above.",
    "Wait for the tone, then hang up.",
  ]);
  assert.match(vm.code.warn, /answering machine/);
  assert.equal(vm.code.off, "To switch it off later, dial *73.");
  assert.equal(vm.code.help.label, "The code didn't work");
  assert.ok(vm.code.help.notes.length >= 2, "forwarding's own words for a refused code");
  assert.equal(vm.code.verified, null);

  const tmobile = answeringDto({
    lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" }), forwardedLine("tmobile")] },
  });
  const mobile = phone(tmobile, kept({ rings: "mobile", company: "tmobile" }));
  assert.equal(mobile.code.label, "T-Mobile · a mobile");
  assert.equal(mobile.code.dial, "**004*+13055550142#");
  assert.equal(mobile.code.tel, "tel:**004*%2B13055550142%23");
  assert.equal(mobile.code.tap, "Tap to dial");
  assert.match(mobile.code.warn, /^Voicemail on this phone\?/);
  assert.equal(
    phone(tmobile, null).code.label,
    "T-Mobile",
    "a tab that lost the answers names the carrier saved, not what rings",
  );

  const verified = phone(
    answeringDto({
      lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" }), forwardedLine("verizon", "verified")] },
    }),
    null,
  );
  assert.match(verified.code.verified, /reach your receptionist/, "Setup's keep row's own sentence");

  const redo = phone(dto, kept({ rings: "landline", redo: true }));
  assert.equal(redo.stage, "ask", "changing the answers asks them again");
  assert.deepEqual([redo.forwardFrom, redo.saved, redo.keepCode], [LISTED, { carrier: "verizon" }, "Keep what I have"]);
});

test("the code follows what was saved: every call when Setup's card saved that, and neutral words when the answers are lost", () => {
  const always = forwardedLine("verizon");
  always.forwarding = { ...always.forwarding, mode: "always" };
  const vm = phone(
    answeringDto({ lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" }), always] } }),
    null,
  );
  assert.deepEqual([vm.code.dial, vm.code.off], ["*723055550142", "To switch it off later, dial *73."]);
  assert.equal(vm.lead, "It tells your phone company to send every call to your receptionist. You only do this once.");
  const other = phone(
    answeringDto({ lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" }), forwardedLine("other")] } }),
    null,
  );
  assert.equal(
    other.code.label,
    "Another carrier or a landline",
    "a mobile with another company is `other` too: neither said",
  );
  assert.deepEqual(other.code.steps, W.stepsAny);
  assert.equal(other.code.warn, W.warnAny);
  assert.equal(other.code.tap, null);
  const nowhere = forwardedLine("other");
  nowhere.e164 = null;
  const lost = phone(
    answeringDto({ lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" }), nowhere] } }),
    null,
  );
  assert.equal(lost.code.change, null, "nothing to ask about: no way to change the answers");
  assert.equal(
    phone(
      answeringDto({ lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" }), nowhere] } }),
      kept({ redo: true }),
    ).stage,
    "code",
  );
});

test("an office phone system (canvas V6): the number to forward to, where to set it, and a person to do it with", () => {
  assert.equal(phone(answeringDto(), kept({ rings: "office" })).cta.held, null, "an office system needs no company");
  const rows = [lineOf({ voice_state: "answering" }), forwardedLine("office")];
  const vm = phone(answeringDto({ lines: { ...dtoOf().lines, rows } }), kept({ rings: "office" }));
  assert.equal(vm.stage, "code");
  assert.equal(vm.heading, "Forward missed calls in your phone system");
  assert.deepEqual(
    [vm.code.label, vm.code.dial, vm.code.tap],
    ["Forward unanswered calls to", "+1 (305) 555-0142", null],
  );
  assert.equal(vm.code.off, "To switch it off later, take the forwarding out in the same settings.");
  assert.equal(vm.code.help.label, "It didn't work", "no code to say did not work");
  assert.deepEqual(vm.code.withMe, {
    sentence: "Not sure where it is? A person at Chanlytics can do it with you on a call.",
    label: "Do it with me",
    asked: null,
  });
  const asked = phone(
    answeringDto({ lines: { ...dtoOf().lines, rows }, requests: { line: null, forwarding: "2026-09-24T13:00:00Z" } }),
    kept({ rings: "office" }),
  );
  assert.match(asked.code.withMe.asked, /^Asked .+: a person at Chanlytics will email you to find a time\.$/);
  const stale = phone(
    answeringDto({ lines: { ...dtoOf().lines, rows }, requests: { line: null, forwarding: "2026-09-22T13:00:00Z" } }),
    kept({ rings: "office" }),
  );
  assert.equal(stale.code.withMe.asked, null, "a day on, asked again in case it reached nobody");
  assert.equal(
    phone(answeringDto(), kept({ rings: "office" })).cta.label,
    "Show me where to forward",
    "no code for an office system",
  );
  const mobile = phone(
    answeringDto({
      lines: { ...dtoOf().lines, rows: [lineOf({ voice_state: "answering" }), forwardedLine("verizon")] },
    }),
    kept({ rings: "office" }),
  );
  assert.equal(mobile.code.withMe, null, "a phone with a code has no call to book");
  assert.equal(mobile.code.label, "Verizon", "an office answer the saved forwarding does not bear out is not said");
});

test("an office phone system asked again: the questions come before its forwarding is drawn, and an ask a day old is offered again", () => {
  const rows = [lineOf({ voice_state: "answering" }), forwardedLine("office")];
  const redo = phone(answeringDto({ lines: { ...dtoOf().lines, rows } }), kept({ rings: "office", redo: true }));
  assert.equal(redo.stage, "ask", "changing the answers asks them again, an office system's as a phone's");
  assert.deepEqual([redo.forwardFrom, redo.saved, redo.keepCode], [LISTED, { carrier: "office" }, "Keep what I have"]);
  assert.deepEqual(redo.cta, { label: "Show me where to forward", held: null, act: "forward" });
  const askedWords = (forwarding) =>
    phone(
      answeringDto({ lines: { ...dtoOf().lines, rows }, requests: { line: null, forwarding } }),
      kept({ rings: "office" }),
    ).code.withMe.asked;
  assert.match(
    askedWords("2026-09-23T15:00:00.001Z"),
    /^Asked .+: a person at Chanlytics/,
    "a millisecond inside the day",
  );
  assert.equal(askedWords("2026-09-23T15:00:00.000Z"), null, "a day to the millisecond: offered again");
});
