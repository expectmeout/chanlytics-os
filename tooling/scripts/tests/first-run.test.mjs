/**
 * The first run (docs/superpowers/specs/2026-09-24-first-run-design.md): Setup's own rows, one step to a screen at
 * #/start, the owner's receptionist beside them, and what is left as one card on Today. Run here: the contracts that
 * decide all of it, on Setup's own fixtures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  greetingFor,
  GREETING_DEFAULT,
  setupSteps,
  firstRunOf,
  firstRunStepOf,
  firstRunStepRoute,
  setupCardOf,
  receptionistCardOf,
  shouldLandOnFirstRun,
  setupLaterOf,
  openWeekWords,
  servicesWords,
  FIRST_RUN_STEPS,
  pendingCodeOf,
  pendingWorkspaceOf,
  PENDING_WORKSPACE_KEY,
  SIGNUP_WORDS,
} from "@chanlytics/contracts";
import { greetingFor as shellGreeting, GREETING_DEFAULT as SHELL_DEFAULT } from "@chanlytics/channels";

test("the phone greeting is one sentence, composed once: contracts', and the voice shell says the same", () => {
  assert.equal(
    greetingFor("Harbor Moving"),
    "Thank you for calling Harbor Moving! This call may be recorded. I'm the automated assistant — how can I help you today?",
  );
  assert.equal(shellGreeting("Harbor Moving"), greetingFor("Harbor Moving"));
  assert.equal(GREETING_DEFAULT, SHELL_DEFAULT);
  assert.equal(
    GREETING_DEFAULT,
    "Thank you for calling! This call may be recorded. I'm the automated assistant — how can I help you today?",
  );
});

/* ---- the first run's view model, on setup.test.mjs's own fixtures ---- */

const NOW = Date.parse("2026-09-07T15:00:00Z");
const VOICE = "+13055550124";
const WA = "+13055550123";
const HANDOFF = "+13055550100";
const empty = (over = {}) => ({
  business: { name: null, hours: false, services: 0, bookingLink: false, address: false, handoff: null, broken: false },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 0 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
  later: [],
  ...over,
});
const facts = {
  name: "Northside Movers",
  hours: true,
  services: 4,
  bookingLink: true,
  address: true,
  handoff: HANDOFF,
  broken: false,
};
const live = (over = {}) =>
  empty({
    business: facts,
    channels: {
      whatsapp: { present: true, active: true, number: WA, quality: "GREEN", lastInboundAt: "2026-09-07T14:30:00Z" },
      voice: { present: true, active: true, number: VOICE, lastInboundAt: "2026-09-06T14:30:00Z" },
    },
    templates: { approved: 6, pending: 0, startersApproved: 5 },
    calendar: { state: "ok" },
    team: { members: 2, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 3, offers: 1, offersSaidYes: 1 },
    activations: [
      { capability: "voice", activated_at: "2026-09-08T09:00:00Z", activated_by: "u-owner", deactivated_at: null },
      { capability: "whatsapp", activated_at: "2026-09-08T09:00:00Z", activated_by: "u-owner", deactivated_at: null },
    ],
    ...over,
  });
const ids = (rows) => rows.map((r) => r.id);

test("a new workspace starts on its business: one step current, the rest ahead, and the step draws only its own rows", () => {
  const fr = firstRunOf(setupSteps(empty(), NOW));
  assert.deepEqual(
    fr.steps.map((s) => [s.key, s.state]),
    [
      ["business", "current"],
      ["phone", "ahead"],
      ["try", "ahead"],
      ["live", "ahead"],
    ],
  );
  assert.equal(fr.current, "business");
  assert.equal(fr.complete, false);
  assert.equal(fr.shown.key, "business");
  assert.deepEqual(ids(fr.shown.rows), ["facts"], "Setup's facts row; no Google row on a deployment without it");
  assert.equal(fr.primaryRow, "facts", "the step's one coral action is its first open row");
  assert.equal(fr.heading, "Your business");
  assert.equal(fr.phoneLine, "Step 1 of 4 · Your business");
  assert.equal(fr.progress, 25);
  assert.equal(fr.back, null);
  assert.equal(fr.onward, null, "nothing to continue to while the step asks something");
  assert.deepEqual(
    fr.steps.map((s) => s.to),
    ["start", "start/phone", "start/try", "start/live"],
    "the current step is the first run's own address, another step its own",
  );
  assert.deepEqual(
    ids(fr.steps.find((s) => s.key === "phone").rows),
    ["line", "keep"],
    "no billing row without billing",
  );
  assert.deepEqual(ids(fr.steps.find((s) => s.key === "try").rows), ["receptionist", "handoff"]);
});

test("the facts are in: the phone is current, the business can be looked at again, and a step ahead cannot", () => {
  const vm = setupSteps(empty({ business: facts }), NOW);
  const fr = firstRunOf(vm);
  assert.deepEqual(
    fr.steps.map((s) => s.state),
    ["done", "current", "ahead", "ahead"],
  );
  assert.equal(fr.shown.key, "phone");
  const back = firstRunOf(vm, "business");
  assert.equal(back.shown.key, "business", "a step already reached opens");
  assert.deepEqual(
    back.onward,
    { label: "Continue", to: "start", leaves: false },
    "and Continue goes on to where the workspace is, a step's own move",
  );
  assert.equal(back.primaryRow, null, "one coral button a step: on a step done it is Continue");
  assert.equal(firstRunOf(vm, "try").shown.key, "phone", "a step not reached yet shows where the workspace is instead");
  assert.equal(firstRunOf(vm, "phone").back, "start/business", "Back opens the step before, at its own address");
});

test("answering: Live is current, with what is left after, and Finish goes to Today", () => {
  const vm = setupSteps(live(), NOW);
  const fr = firstRunOf(vm);
  assert.equal(fr.complete, true);
  assert.equal(fr.current, "live");
  assert.deepEqual(
    fr.steps.map((s) => s.state),
    ["done", "done", "done", "current"],
  );
  assert.equal(fr.heading, "Your receptionist is answering");
  assert.equal(fr.lead, vm.readiness.sentence, "Setup's own sentence says what it answers on");
  assert.deepEqual(ids(fr.shown.rows), ["whatsapp", "calendar", "team", "yes"]);
  assert.equal(fr.primaryRow, null, "on Live the one action is Finish");
  assert.deepEqual(fr.onward, { label: "Finish", to: "today", leaves: true }, "Finish is a way out");
  assert.equal(fr.progress, 100);
});

test("an address names a step or nothing", () => {
  assert.deepEqual(
    FIRST_RUN_STEPS.map((s) => s.key),
    ["business", "phone", "try", "live"],
  );
  assert.equal(firstRunStepOf("phone"), "phone");
  assert.equal(firstRunStepOf("setup"), null);
  assert.equal(firstRunStepOf(null), null);
  assert.equal(firstRunStepRoute("phone"), "start/phone", "a door that names a row opens the step that draws it");
});

test("Today's card: while nothing answers, one row that opens the first run; after, Setup's own rows in the order they help most, never one put off", () => {
  const before = setupCardOf(setupSteps(empty(), NOW));
  assert.equal(before.title, "Finish setting up");
  assert.equal(before.left, "3 steps left");
  assert.deepEqual(before.start, {
    name: "Your receptionist isn't answering yet",
    sentence: "What your receptionist says about you: your name, when you're open, what you offer.",
    status: "Next: your business",
    cta: "Continue setting up",
    to: "start",
  });
  assert.deepEqual(before.rows, []);
  assert.equal(before.hide, null, "the first run cannot be put off");

  // WhatsApp can answer before the phone does: then it is the calls that are not answered.
  const texting = setupCardOf(
    setupSteps(empty({ business: facts, channels: { ...empty().channels, whatsapp: live().channels.whatsapp } }), NOW),
  );
  assert.equal(texting.start.name, "Calls aren't answered yet");
  assert.equal(texting.start.status, "Next: your phone");

  const after = setupCardOf(setupSteps(live(), NOW));
  assert.equal(after.start, null);
  assert.deepEqual(ids(after.rows), ["keep"], "the one thing a workspace answering everywhere has left");
  assert.equal(after.left, "1 left");
  assert.deepEqual(after.hide, { put: "Hide", said: "Put off. It stays in Setting up for when you're ready." });
  assert.deepEqual(after.skip, { put: "Skip", said: "Put off. It stays in Setting up for when you're ready." });
  assert.equal(setupCardOf(setupSteps(live({ later: ["keep"] }), NOW)), null, "nothing left once it is put off");

  const quiet = live({ calendar: { state: "none" }, team: { members: 1, invitesOpen: 0, alertEmails: 0 } });
  const three = setupCardOf(setupSteps(quiet, NOW));
  assert.deepEqual(ids(three.rows), ["calendar", "team", "keep"], "WhatsApp, the calendar, a back-up, then the rest");
  assert.equal(three.hide.said, "All 3 put off. They stay in Setting up for when you're ready.");
});

test("the receptionist card: every value is Setup's or the settings read's, the greeting is the phone's word for word, and a blank is a dash", () => {
  const hours = { mon: { open: "09:00", close: "17:00" }, tue: { open: "09:00", close: "17:00" } };
  const services = [
    { name: "Local move", duration_min: 120 },
    { name: "Packing" },
    { name: "Storage" },
    { name: "Piano" },
  ];
  const card = receptionistCardOf({
    setup: live(),
    answering: true,
    brain: {
      business_name: "Northside Movers",
      booking_link: "https://www.northside.example/book/",
      profile: { hours, services, languages: ["English", "Spanish"] },
    },
    numbers: { voiceLine: VOICE, keptLine: "+12125550142", handoff: HANDOFF },
    workspaceName: "Northside",
    tz: "America/New_York",
  });
  assert.equal(card.caption, "Your receptionist, so far");
  assert.equal(card.initials, "NM");
  assert.equal(card.name, "Northside Movers");
  assert.deepEqual(
    card.status,
    { state: "ready", words: "Answering" },
    "Setup's own state, which the page's pill tones",
  );
  assert.equal(card.strip, "Your receptionist · Answering");
  assert.equal(card.greeting, greetingFor("Northside Movers"));
  const sv = servicesWords(services);
  assert.deepEqual(
    card.rows.map((r) => [r.key, r.label, r.value]),
    [
      ["open", "Open", openWeekWords(hours, "America/New_York")],
      ["knows", "Knows", `${sv.chips.map((c) => c.name).join(", ")} ${sv.more}`],
      ["books", "Books with", "northside.example/book"],
      ["speaks", "Speaks", "English, Spanish"],
      ["answers", "Answers", "+1 (305) 555-0124, and calls forwarded from +1 (212) 555-0142"],
      ["through", "Puts through to", "+1 (305) 555-0100"],
    ],
  );
  assert.equal(card.foot, "Fills in as you go. You can change any of it later in Settings › Business.");

  const bare = receptionistCardOf({
    setup: empty(),
    answering: false,
    brain: null,
    numbers: null,
    workspaceName: "Luna Studio",
    tz: "America/New_York",
  });
  assert.equal(bare.name, "Luna Studio", "the workspace's name until the receptionist has one");
  assert.equal(bare.initials, "LS");
  assert.deepEqual(bare.status, { state: "not_started", words: "Not answering yet" });
  assert.equal(bare.greeting, GREETING_DEFAULT, "the phone greets with the receptionist's name, never the workspace's");
  assert.deepEqual(
    bare.rows.map((r) => r.value),
    [null, null, null, null, null, null],
  );

  const untried = receptionistCardOf({
    setup: live({
      channels: {
        whatsapp: empty().channels.whatsapp,
        voice: { present: true, active: true, number: VOICE, lastInboundAt: null },
      },
    }),
    answering: true,
    brain: null,
    numbers: null,
    workspaceName: null,
    tz: "America/New_York",
  });
  assert.deepEqual(untried.status, { state: "waiting_you", words: "Answering · not tried yet" });
  assert.equal(
    untried.rows.find((r) => r.key === "answers").value,
    "+1 (305) 555-0124",
    "the line itself, with no number kept",
  );
});

test("the landing rule: an owner whose receptionist answers nowhere lands on the first run once, from Today or nothing", () => {
  assert.equal(shouldLandOnFirstRun("owner", false, "today", false), true);
  assert.equal(shouldLandOnFirstRun("owner", false, "", false), true);
  assert.equal(shouldLandOnFirstRun("owner", false, "inbox", false), false, "a deep link is respected");
  assert.equal(shouldLandOnFirstRun("owner", false, "today", true), false, "once per session");
  assert.equal(shouldLandOnFirstRun("owner", true, "today", false), false, "answering: Today is the page");
  assert.equal(shouldLandOnFirstRun("operator", false, "today", false), false, "only the owner is sent");
  assert.equal(shouldLandOnFirstRun(null, false, "today", false), false);
});

test("the rows a member put off are ids from their saved view, and nothing else", () => {
  assert.deepEqual(setupLaterOf({ later: ["calendar", "calendar", 7, "team"] }), ["calendar", "team"]);
  assert.deepEqual(setupLaterOf({ later: "calendar" }), []);
  assert.deepEqual(setupLaterOf(null), []);
  assert.deepEqual(setupLaterOf({ later: ["x".repeat(41)] }), [], "an id is short");
});

/* ---- create once (F5): what sign-up kept makes the first workspace ---- */

test("the invite code sign-up checked is kept beside the name, and never read back as part of the form", () => {
  const meta = {
    [PENDING_WORKSPACE_KEY]: { name: "Luna Studio", timezone: "America/New_York", code: " LUNA-2026 " },
  };
  assert.equal(pendingCodeOf(meta), "LUNA-2026");
  assert.deepEqual(
    pendingWorkspaceOf(meta),
    { name: "Luna Studio", timezone: "America/New_York" },
    "the page never sees it",
  );
  assert.equal(pendingCodeOf({ [PENDING_WORKSPACE_KEY]: { name: "Luna Studio" } }), null);
  assert.equal(pendingCodeOf(null), null);
  assert.equal(pendingCodeOf({ [PENDING_WORKSPACE_KEY]: { code: "x".repeat(81) } }), null);
  assert.equal(pendingCodeOf({ [PENDING_WORKSPACE_KEY]: { code: "   " } }), null, "a blank code is none");
  assert.equal(SIGNUP_WORDS.making, "Making your workspace…");
});
