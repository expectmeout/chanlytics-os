/**
 * The first run (docs/superpowers/specs/2026-09-24-first-run-design.md): Setup's own rows, one step to a screen at
 * #/start, the owner's receptionist beside them, and what is left as one card on Today. Run here: the contracts that
 * decide all of it, on Setup's own fixtures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  greetingFor,
  pausedGreetingFor,
  GREETING_DEFAULT,
  setupSteps,
  firstRunOf,
  firstRunStepOf,
  firstRunStepRoute,
  firstRunKicker,
  FIRST_RUN_WORDS,
  FIRST_RUN_FIND_ROUTE,
  businessNameOf,
  setupCardOf,
  TRY_SKIPPED,
  REMIND_SKIPPED,
  receptionistCardOf,
  shouldLandOnFirstRun,
  setupLaterOf,
  setupRestsOf,
  setupPutOffNext,
  putOffEnds,
  keptNumberRowOf,
  SETUP_REST_MS,
  setupPhoneWantOf,
  keptPhoneKind,
  KEEP_ROW,
  openWeekWords,
  servicesWords,
  FIRST_RUN_STEPS,
  pendingCodeOf,
  pendingWorkspaceOf,
  PENDING_WORKSPACE_KEY,
  SIGNUP_WORDS,
  listingFactsOf,
  firstReceptionistOf,
  newReceptionistDefaults,
  TenantConfigWriteSchema,
  unsureHoursWords,
  googleFillsOf,
} from "@chanlytics/contracts";
import { greetingFor as shellGreeting, GREETING_DEFAULT as SHELL_DEFAULT } from "@chanlytics/channels";

test("the phone greeting is one sentence, composed once: contracts', and the voice shell says the same", () => {
  assert.equal(
    greetingFor("Harbor Moving"),
    "Hi, Harbor Moving. I'm the automated assistant, and calls are recorded. How can I help?",
  );
  assert.equal(shellGreeting("Harbor Moving"), greetingFor("Harbor Moving"));
  assert.equal(GREETING_DEFAULT, SHELL_DEFAULT);
  assert.equal(
    GREETING_DEFAULT,
    "Hi, thanks for calling. I'm the automated assistant, and calls are recorded. How can I help?",
  );
});

test("the greeting is short and says both things a caller is owed first, the paused one too", () => {
  // The engine review's second pass: a 22-word line lost callers before it ended. Every line under its 35 words, and
  // the everyday one under twenty, with a long name.
  const name = "Northside Family Hair & Beauty Studio";
  for (const line of [greetingFor(name), greetingFor(null), pausedGreetingFor(name), pausedGreetingFor(null)]) {
    const words = line.split(/\s+/).filter(Boolean).length;
    assert.ok(words < 35, `${words} words: ${line}`);
    assert.match(line, /automated assistant/, "the caller is told it is not a person");
    assert.match(line, /calls are recorded/, "the caller is told the call is recorded");
  }
  assert.ok(greetingFor(name).split(/\s+/).length < 20, "the everyday line stays under twenty words");
});

/* ---- the first run's view model, on setup.test.mjs's own fixtures ---- */

const NOW = Date.parse("2026-09-07T15:00:00Z");
const VOICE = "+13055550124";
const WA = "+13055550123";
const HANDOFF = "+13055550100";
const empty = (over = {}) => ({
  business: {
    name: null,
    hours: false,
    services: 0,
    bookingLink: false,
    address: false,
    handoff: null,
    broken: false,
    receptionist: "none",
  },
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
  rests: {},
  ...over,
});
/** What a kept number's forwarding waiting costs, said with every put-off of it (first-run-phone.ts). */
const WAITING = "Until it is set up, only calls to your receptionist's own number are answered.";
/** A moment a week put off ends: before NOW, so the row is back; or after, so it still rests. */
const ENDED = new Date(NOW - 1).toISOString();
const RESTING = new Date(NOW + SETUP_REST_MS).toISOString();
const facts = {
  name: "Northside Movers",
  hours: true,
  services: 4,
  bookingLink: true,
  address: true,
  handoff: HANDOFF,
  broken: false,
  receptionist: "set",
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

test("a new workspace starts on its business: one step current, the rest ahead, and the step is Check", () => {
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
  assert.equal(fr.primaryRow, null, "Check draws the Business tab's rows, not Setup's");
  assert.equal(fr.heading, "Tell us the basics", "nothing on Google: the basics are asked");
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
  assert.deepEqual(
    ids(fr.steps.find((s) => s.key === "try").rows),
    ["handoff"],
    "Setup's Try it row arrives with calls answered: nothing to try before",
  );
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
    { label: "Looks right", to: "start", leaves: false, held: null },
    "and Looks right goes on to where the workspace is, a step's own move",
  );
  assert.equal(back.primaryRow, null, "one coral button a step: on a step done it is the onward");
  assert.deepEqual(
    firstRunOf(vm, "phone").onward,
    null,
    "the phone step asks something still: its rows carry the coral button",
  );
  assert.deepEqual(
    firstRunOf(setupSteps(empty({ business: facts, channels: live().channels }), NOW), "phone").onward,
    { label: "Continue", to: "start", leaves: false, held: null },
    "a step done that is not Check goes on with Continue",
  );
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
  assert.deepEqual(fr.onward, { label: "Finish", to: "today", leaves: true, held: null }, "Finish is a way out");
  assert.equal(fr.progress, 100);
});

test("Find is the business step for an owner while Google can be searched and nothing is linked or put off", () => {
  const g = (over = {}) => empty({ google: { ready: true, places: true, listing: null, connected: false }, ...over });
  // A new workspace's owner: no receptionist's name yet, the one typed at sign-up.
  const owner = { owner: true, receptionistName: null, workspaceName: "Harbor Moving" };
  const fr = firstRunOf(setupSteps(g(), NOW), null, owner);
  assert.equal(fr.find, true);
  assert.equal(fr.shown.key, "business");
  assert.equal(fr.heading, "Is this Harbor Moving?", "the name typed at sign-up");
  assert.equal(fr.lead, "We looked you up on Google with the name you signed up with.");
  assert.equal(fr.primaryRow, null, "Find's rows are not drawn, so none of them carries the coral button");
  assert.equal(fr.findDone, null, "the plain address: Find goes by itself once Google is put off");
  assert.equal(
    firstRunOf(setupSteps(g(), NOW), null, { ...owner, owner: false }).find,
    false,
    "search and link are the owner's",
  );
  assert.equal(firstRunOf(setupSteps(g(), NOW)).find, false, "and nobody is an owner unless the page says so");
  const named = firstRunOf(setupSteps(g(), NOW), null, { ...owner, receptionistName: "Harbor Moving & Storage" });
  assert.equal(named.heading, "Is this Harbor Moving & Storage?", "the receptionist's own name first");
  assert.equal(named.lead, "We looked you up on Google with the name and address on record.", "as the search asks it");
  const putOff = setupSteps(g({ later: ["google"] }), NOW);
  assert.equal(firstRunOf(putOff, null, owner).find, false, "said: not on Google");
  const asked = firstRunOf(putOff, "find", owner);
  assert.equal(asked.find, true, "but Find it asks for Find, whatever was said before");
  assert.equal(asked.shown.key, "business");
  assert.equal(asked.findDone, "start", "and not on Google, again, goes to the step's own address");
  const linked = g({
    google: {
      ready: true,
      places: true,
      listing: { name: "Harbor Moving", rating: 4.8, review_count: 12, checked_at: null, check_error: null },
      connected: false,
    },
  });
  assert.equal(firstRunOf(setupSteps(linked, NOW), "find", owner).find, false, "a listing linked is found");
  const profileOnly = g({ google: { ready: true, places: false, listing: null, connected: false } });
  assert.equal(
    firstRunOf(setupSteps(profileOnly, NOW), "find", owner).find,
    false,
    "no search here: the profile's door",
  );
  assert.equal(firstRunOf(setupSteps(empty(), NOW), "find", owner).find, false, "no Google on this deployment");
  const done = setupSteps(g({ business: facts }), NOW);
  assert.equal(firstRunOf(done, null, owner).find, false, "the phone step, once the facts are in");
  const again = firstRunOf(done, "business", owner);
  assert.equal(again.find, true, "the business step looked at again still finds");
  assert.equal(again.onward, null, "one coral button a step: Find's, not Continue beside it");
});

test("what the business goes by is one rule: the receptionist's name, else the one typed at sign-up", () => {
  assert.equal(businessNameOf("  Harbor Moving ", "harbor"), "Harbor Moving");
  assert.equal(businessNameOf("", "Harbor Moving"), "Harbor Moving");
  assert.equal(businessNameOf(null, "  "), null);
});

test("Find says only what Google said, in the owner's words", () => {
  const W = FIRST_RUN_WORDS.find;
  assert.equal(W.heading("Harbor Moving"), "Is this Harbor Moving?");
  assert.equal(W.heading(null), "Which one is your business?");
  assert.equal(W.none("Harbor Moving"), "Nothing on Google for “Harbor Moving”.");
  assert.equal(W.linked("Harbor Moving", true), "Harbor Moving is your listing on Google — read just now.");
  assert.equal(
    W.linked("Harbor Moving", false),
    "Harbor Moving is your listing on Google — Google will be read within the hour.",
  );
  assert.equal(FIRST_RUN_FIND_ROUTE, "start/find");
});

test("the step line is one sentence wherever it is said", () => {
  assert.equal(firstRunKicker("business"), "Step 1 of 4 · Your business");
  assert.equal(firstRunKicker("live"), "Step 4 of 4 · Live");
  assert.equal(firstRunOf(setupSteps(empty(), NOW)).phoneLine, firstRunKicker("business"));
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
    ctaShort: "Continue",
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
  // Calls answered and a step still open (the facts, here): the row never says calls are not answered.
  const calls = setupCardOf(
    setupSteps(empty({ channels: { ...empty().channels, voice: live().channels.voice } }), NOW),
  );
  assert.equal(calls.start.name, "Your receptionist is answering");
  assert.equal(calls.start.status, "Next: your business");

  const after = setupCardOf(setupSteps(live(), NOW));
  assert.equal(after.start, null);
  assert.deepEqual(ids(after.rows), ["keep"], "the one thing a workspace answering everywhere has left");
  assert.equal(after.left, "2 left", "the row, and the reminder's row its calendar offers");
  // Each put off for a week, as its own Skip would put it; never "It stays in Setting up", a page nothing reached.
  assert.deepEqual(after.hide, { put: "Hide", said: `All 2 put off for a week. ${WAITING}` });
  assert.deepEqual(after.skip, { put: "Skip", back: "Back after a week", backShort: "Back" });
  assert.equal(after.rows[0].said, `Put off for a week. ${WAITING}`, "the kept number's Skip says what waiting costs");
  const alone = setupCardOf(setupSteps(live({ later: [REMIND_SKIPPED] }), NOW));
  assert.equal(alone.left, "1 left");
  assert.deepEqual(alone.hide, { put: "Hide", said: alone.rows[0].said }, "one row: Hide says its own words");
  assert.equal(setupCardOf(setupSteps(live({ later: ["keep"] }), NOW)), null, "nothing left once it is put off");

  const quiet = live({ calendar: { state: "none" }, team: { members: 1, invitesOpen: 0, alertEmails: 0 } });
  const three = setupCardOf(setupSteps(quiet, NOW));
  assert.deepEqual(ids(three.rows), ["calendar", "team", "keep"], "WhatsApp, the calendar, a back-up, then the rest");
  assert.equal(three.hide.said, `All 3 put off for a week. ${WAITING}`);
  assert.doesNotMatch(JSON.stringify([after, alone, three]), /Setting up/, "no word sends anyone to Setting up");
});

test("a Skip rests a row a week: off the card while it rests, back after with a word by its name, and the next is for good, said with where it lives", () => {
  const quiet = (over = {}) =>
    live({ calendar: { state: "none" }, team: { members: 1, invitesOpen: 0, alertEmails: 0 }, ...over });
  const first = setupCardOf(setupSteps(quiet(), NOW));
  assert.equal(first.rows.find((r) => r.id === "calendar").said, "Put off for a week.");
  assert.equal(first.rows.find((r) => r.id === "calendar").back, false);

  // Resting: off the card and the first run's open rows, as a row put off always was.
  const resting = setupSteps(quiet({ rests: { calendar: RESTING } }), NOW);
  assert.equal(resting.rows.find((r) => r.id === "calendar").later, true);
  assert.deepEqual(ids(setupCardOf(resting).rows), ["team", "keep"]);

  // Its week ended: back where it was, saying so, and its Skip is for good, with the page it is set up on.
  const back = setupSteps(quiet({ rests: { calendar: ENDED } }), NOW);
  const calendar = setupCardOf(back).rows.find((r) => r.id === "calendar");
  assert.deepEqual([calendar.later, calendar.back], [false, true]);
  assert.equal(calendar.said, "Off your list. It's in Settings › Hours & booking.");
  assert.deepEqual(ids(setupCardOf(back).rows), ["calendar", "team", "keep"], "in its own place, not at the end");

  // Put off for good: off the card for ever, as every row put off before rests was.
  const good = setupSteps(quiet({ later: ["calendar"], rests: { calendar: ENDED } }), NOW);
  const gone = good.rows.find((r) => r.id === "calendar");
  assert.deepEqual([gone.later, gone.back], [true, false]);
  assert.deepEqual(ids(setupCardOf(good).rows), ["team", "keep"]);
});

test("each row put off for good says where it is set up from then: the page its own button opens", () => {
  const backFrom = (rowIds) => Object.fromEntries(rowIds.map((id) => [id, ENDED]));
  const homes = (over) => Object.fromEntries(setupCardOf(setupSteps(live(over), NOW)).rows.map((r) => [r.id, r.said]));
  const said = homes({
    calendar: { state: "none" },
    team: { members: 1, invitesOpen: 0, alertEmails: 0 },
    consent: { yes: 0, offers: 0, offersSaidYes: 0 },
    google: { ready: true, places: true, listing: null },
    later: [KEEP_ROW],
    rests: backFrom(["calendar", "team", "yes", "google"]),
  });
  assert.deepEqual(said, {
    calendar: "Off your list. It's in Settings › Hours & booking.",
    // No alert address: the row's button asks for one.
    team: "Off your list. It's in Settings › Notifications.",
    google: "Off your list. It's in Settings › Connections.",
    yes: "Off your list. It's in People › Get their yes.",
  });
  const invite = homes({
    team: { members: 1, invitesOpen: 0, alertEmails: 1 },
    later: [KEEP_ROW],
    rests: backFrom(["team"]),
  });
  assert.equal(invite.team, "Off your list. It's in Settings › Team.", "alerts set: the row asks for a teammate");
});

test("the number you already have goes for good as every row does, now that How it answers holds it, and says what waiting costs", () => {
  assert.deepEqual([putOffEnds(false), putOffEnds(true)], ["week", "good"]);
  const first = setupCardOf(setupSteps(live(), NOW)).rows.find((r) => r.id === KEEP_ROW);
  assert.equal(first.said, `Put off for a week. ${WAITING}`);
  const back = setupCardOf(setupSteps(live({ rests: { [KEEP_ROW]: ENDED } }), NOW));
  const keep = back.rows.find((r) => r.id === KEEP_ROW);
  assert.equal(keep.back, true, "back after its week, and said to be");
  assert.equal(keep.said, `Off your list. It's in Settings › How it answers. ${WAITING}`, "for good, with its home");
  const next = setupPutOffNext({ later: [], rests: { [KEEP_ROW]: ENDED } }, [KEEP_ROW], { on: true, why: "rest" }, NOW);
  assert.deepEqual(next, { later: [KEEP_ROW], rests: { [KEEP_ROW]: ENDED } });
});

test("Settings' row for the number kept is Setup's own: its name, its sentence and its act, the number once one is saved", () => {
  const vm = setupSteps(live(), NOW);
  const keep = vm.rows.find((r) => r.id === KEEP_ROW);
  assert.deepEqual(keptNumberRowOf(vm, undefined), {
    label: "The number you already have",
    value: null,
    empty: "Not forwarded",
    hint: keep.sentence,
    act: "Set up forwarding",
    close: "Close",
  });
  const forwarded = {
    id: "fw",
    e164: "+13055550100",
    kind: "forwarded",
    provider: "carrier",
    area_code: 305,
    voice_state: "none",
    sms_state: "none",
    whatsapp_state: "none",
    port_state: "none",
    forwarding_state: "instructed",
    step: null,
    last_error: null,
    state_since: "2026-09-07T14:00:00Z",
    created_at: "2026-09-07T14:00:00Z",
    forwarding: {
      carrier: "verizon",
      mode: "unanswered",
      destination_e164: VOICE,
      test_until: null,
      verified_at: null,
    },
  };
  const lines = { rows: [forwarded], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } };
  const saved = setupSteps(live({ lines }), NOW);
  const row = keptNumberRowOf(saved, lines);
  assert.equal(row.value, "+1 (305) 555-0100");
  assert.equal(row.hint, saved.rows.find((r) => r.id === KEEP_ROW).sentence, "Today's card and Settings say one thing");
  assert.equal(row.act, "Test it");
  // No line to forward to yet: nothing to set up there, and no row.
  assert.equal(keptNumberRowOf(setupSteps(empty(), NOW), undefined), null);
});

test("what Hide says counts each row as its own Skip would put it: a week, or for good", () => {
  const quiet = live({
    calendar: { state: "none" },
    team: { members: 1, invitesOpen: 0, alertEmails: 0 },
    rests: { calendar: ENDED },
  });
  assert.equal(setupCardOf(setupSteps(quiet, NOW)).hide.said, `2 put off for a week, 1 off your list. ${WAITING}`);
  const noKeep = setupSteps(live({ calendar: { state: "none" }, later: [KEEP_ROW], rests: { calendar: ENDED } }), NOW);
  assert.equal(
    setupCardOf(noKeep).hide.said,
    "Off your list. It's in Settings › Hours & booking.",
    "one row: its words",
  );
  const bothBack = live({
    calendar: { state: "none" },
    team: { members: 1, invitesOpen: 0, alertEmails: 0 },
    later: [KEEP_ROW],
    rests: { calendar: ENDED, team: ENDED },
  });
  assert.equal(setupCardOf(setupSteps(bothBack, NOW)).hide.said, "All 2 off your list.");
});

test("a put-off rests a week, then is for good; an answer is for good at once; taking back undoes the last one", () => {
  const none = { later: [], rests: {} };
  const rest = { on: true, why: "rest" };
  const once = setupPutOffNext(none, ["calendar"], rest, NOW);
  assert.deepEqual(once, { later: [], rests: { calendar: RESTING } });
  assert.deepEqual(setupPutOffNext(once, ["calendar"], rest, NOW + 1000), once, "already off: nothing changes");
  const ended = NOW + SETUP_REST_MS;
  const good = setupPutOffNext(once, ["calendar"], rest, ended);
  assert.deepEqual(good, { later: ["calendar"], rests: { calendar: RESTING } }, "back from its week: for good");
  assert.deepEqual(setupPutOffNext(good, ["calendar"], { on: false }, ended), once, "taken back: back from its week");
  assert.deepEqual(setupPutOffNext(once, ["calendar"], { on: false }, NOW), none, "a rest taken back: never put off");
  // Answers: not on Google, a new number and none kept, the test call skipped.
  assert.deepEqual(setupPutOffNext(none, ["google", TRY_SKIPPED], { on: true, why: "answer" }, NOW), {
    later: ["google", TRY_SKIPPED],
    rests: {},
  });
  // Every other row's put-off is left as it was.
  const two = { later: ["yes"], rests: { team: RESTING } };
  assert.deepEqual(setupPutOffNext(two, ["calendar"], rest, NOW), {
    later: ["yes"],
    rests: { team: RESTING, calendar: RESTING },
  });
});

test("the rows a member put off for a week are a short id and a moment from their saved view, and nothing else", () => {
  assert.deepEqual(setupRestsOf({ later: [], rests: { calendar: RESTING } }), { calendar: RESTING });
  assert.deepEqual(setupRestsOf({ rests: { calendar: "soon", team: 7, ["x".repeat(41)]: RESTING } }), {});
  assert.deepEqual(setupRestsOf({ rests: ["calendar"] }), {});
  assert.deepEqual(setupRestsOf({ rests: "calendar" }), {});
  assert.deepEqual(setupRestsOf({ later: ["calendar"] }), {}, "a view saved before rests: none");
  assert.deepEqual(setupRestsOf(null), {});
});

test("after the first run, with the calendar in, Today's card carries one door to the appointment reminder; never before", () => {
  const liveWithCalendar = () => live();
  const liveWithoutCalendar = () => live({ calendar: { state: "none" } });
  const before = setupCardOf(setupSteps(empty(), NOW));
  assert.equal(before.remind, null, "while a step is open, the card is the first run's");
  const after = setupCardOf(setupSteps(liveWithCalendar(), NOW));
  assert.deepEqual(after.remind, {
    // A row of the card: its name, its state's words, its sentence, its button, and what its Skip puts off and says.
    // No word for the appointment: New sequence, which it opens, says the workspace's own (a meeting where deals are on).
    id: REMIND_SKIPPED,
    name: "The day-before reminder",
    stateWords: "Not started",
    words: "Your calendar is in. Remind each customer the day before.",
    label: "Turn on",
    to: "campaigns/sequences/new:moment:visit_tomorrow",
    said: "Put off for a week.",
    back: false,
  });
  assert.doesNotMatch(`${after.remind.name} ${after.remind.words}`, /appointment|visit|meeting|session|lesson/i);
  const noCalendar = setupCardOf(setupSteps(liveWithoutCalendar(), NOW));
  assert.equal(noCalendar?.remind ?? null, null, "no calendar: no reminder to offer");
});

test("the reminder is not offered once a day-before reminder runs: the routes refuse a second", () => {
  const running = setupSteps(live({ reminders: { day_before: true } }), NOW);
  assert.equal(running.dayBeforeOn, true);
  assert.equal(setupCardOf(running).remind, null);
  assert.equal(setupCardOf(running).left, "1 left", "and it is not counted");
  // A read from before the field, or one that could not be read: offered, as it was; the route still refuses.
  assert.ok(setupCardOf(setupSteps(live(), NOW)).remind);
  assert.ok(setupCardOf(setupSteps(live({ reminders: { day_before: false } }), NOW)).remind);
});

test("the card holds what waits on the owner: a row waiting on Meta, Google or a first booking email stays on Setting up", () => {
  // WhatsApp connected, its first messages with Meta: the row waits on them, and drew the card's coral "Open the Inbox".
  const meta = setupSteps(live({ templates: { approved: 0, pending: 3, startersApproved: 0 } }), NOW);
  assert.equal(meta.rows.find((r) => r.id === "whatsapp").state, "waiting_them");
  assert.ok(!ids(setupCardOf(meta).rows).includes("whatsapp"));
  // A booking tool named, its first email not in yet.
  const emails = { address: true, forwarding: false, last_at: null, held: 0 };
  const tool = setupSteps(live({ calendar: { state: "none", tool: "square", emails } }), NOW);
  assert.equal(tool.rows.find((r) => r.id === "calendar").state, "waiting_them");
  assert.ok(!ids(setupCardOf(tool).rows).includes("calendar"));
});

test("a payment that failed after setting up is said as the plan, never as a step of setting up", () => {
  const billing = (status) => ({
    ready: true,
    livemode: true,
    mode: "stripe",
    status,
    trial_end: null,
    current_period_end: "2026-10-01T00:00:00Z",
    trial_days: 14,
    cancel_at: null,
    cancel_at_period_end: false,
    price: { unit_amount: 14900, currency: "usd", interval: "month" },
  });
  // Billing is the phone step's need, so the card read "Your receptionist is answering · Next: your phone".
  const failed = setupCardOf(setupSteps(live({ billing: billing("past_due") }), NOW));
  assert.equal(failed.title, "Your plan");
  assert.equal(failed.left, "Needs you");
  assert.equal(failed.start, null);
  assert.deepEqual(ids(failed.rows), ["billing"]);
  assert.deepEqual(failed.rows[0].verb, { label: "Update the card", to: "verb:billing-portal" });
  assert.equal(failed.hide, null, "a plan cannot be put off");
  assert.equal(failed.remind, null);
  const paused = setupCardOf(setupSteps(live({ billing: billing("paused") }), NOW));
  assert.deepEqual(paused.rows[0].verb, { label: "Resume in Billing", to: "admin/billing" });
  // Paid: the card is setting up's again.
  assert.equal(setupCardOf(setupSteps(live({ billing: billing("active") }), NOW)).title, "Finish setting up");
});

test("the reminder's row, skipped, is put off as a row is: the member's, on every device, and back with its Undo", () => {
  const skipped = setupSteps(live({ later: [REMIND_SKIPPED] }), NOW);
  assert.equal(skipped.remindSkipped, true);
  assert.equal(setupCardOf(skipped).remind, null, "skipped: no reminder on the card");
  assert.ok(setupCardOf(setupSteps(live({ later: [] }), NOW)).remind, "taken back: the reminder again");
  // Skipped for a week: off the card while it rests, then back, saying so, and its next Skip is for good.
  assert.equal(setupCardOf(setupSteps(live({ rests: { [REMIND_SKIPPED]: RESTING } }), NOW)).remind, null);
  const back = setupSteps(live({ rests: { [REMIND_SKIPPED]: ENDED } }), NOW);
  assert.deepEqual([back.remindSkipped, back.remindBack], [false, true]);
  const remind = setupCardOf(back).remind;
  assert.equal(remind.back, true);
  assert.equal(remind.said, "Off your list. Turn it on any time in Sequences.");
});

test("Today's reminder door stands only where Campaigns can make the reminder: a calendar link connected", () => {
  // Setup's calendar row says Ready for these two, and Campaigns' moments read neither as a calendar (momentOffered's
  // calendarOn: a link connected), so the door would open a reminder core refuses.
  const byHand = setupSteps(live({ calendar: { state: "none", by_hand: true } }), NOW);
  assert.equal(byHand.rows.find((r) => r.id === "calendar")?.state, "ready", "booked by hand: Setup's row is ready");
  assert.equal(setupCardOf(byHand)?.remind ?? null, null, "booked by hand: no door");
  const emails = { address: true, forwarding: false, last_at: "2026-09-06T14:00:00Z", held: 0 };
  const byEmail = setupSteps(live({ calendar: { state: "none", tool: "square", emails } }), NOW);
  assert.equal(
    byEmail.rows.find((r) => r.id === "calendar")?.state,
    "ready",
    "bookings by email: Setup's row is ready",
  );
  assert.equal(setupCardOf(byEmail)?.remind ?? null, null, "bookings by email alone: no door");
  const both = setupSteps(live({ calendar: { state: "ok", tool: "square", emails } }), NOW);
  assert.equal(
    setupCardOf(both)?.remind?.to,
    "campaigns/sequences/new:moment:visit_tomorrow",
    "a link connected: the door",
  );
  assert.equal(
    setupCardOf(setupSteps(live(), NOW))?.remind?.to,
    "campaigns/sequences/new:moment:visit_tomorrow",
    "connected: the door",
  );
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
  assert.equal(card.foot, "Fills in as you go. You can change any of it later in Settings.");

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
  assert.equal(
    shouldLandOnFirstRun("partner", false, "today", false),
    true,
    "the partner who brought it sets it up (0012)",
  );
  assert.equal(
    shouldLandOnFirstRun("operator", false, "today", false),
    false,
    "an operator may not set it up, so is not sent",
  );
  assert.equal(shouldLandOnFirstRun("viewer", false, "today", false), false);
  assert.equal(
    shouldLandOnFirstRun("manager", false, "today", false),
    false,
    "a role the table does not know is a viewer",
  );
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

/* ---- the first receptionist, from what is known (3c-2) ---- */

// Google's week as the edge stores it: day 0 is Sunday.
const shift = (day, openHour, closeHour, closeDay = day) => ({
  open: { day, hour: openHour, minute: 0 },
  close: { day: closeDay, hour: closeHour, minute: 0 },
});
const googleSaid = (over = {}) => ({
  hours: [2, 3, 4, 5, 6].map((d) => shift(d, 9, 19)),
  phone_e164: "+13055550100",
  phone_display: "(305) 555-0100",
  website: "https://harbor.example.com/",
  primary_type: "moving_company",
  primary_type_label: "Moving company",
  service_area_only: false,
  time_zone: "America/New_York",
  booking_page: null,
  ...over,
});
const listed = (said = {}, over = {}) => ({
  name: "Harbor Moving & Storage",
  address: "12 Pier Rd, Brooklyn, NY 11231",
  facts: googleSaid(said),
  ...over,
});
const NINE_TO_SEVEN = { open: "09:00", close: "19:00" };

test("Google's facts as stored: what the edge wrote reads as it is, a row from before the details read is none, and a malformed period is dropped", () => {
  assert.deepEqual(listingFactsOf(googleSaid()), googleSaid());
  assert.equal(listingFactsOf({}), null, "linked before the details read: nothing was said");
  assert.equal(listingFactsOf(null), null);
  assert.equal(listingFactsOf([]), null);
  const odd = listingFactsOf({
    hours: [
      shift(2, 9, 19),
      null,
      { open: { day: "tue" } },
      { open: { day: 0, hour: 0, minute: 0 }, close: null },
      { open: { day: 3, hour: 9, minute: 0 }, close: "late" },
    ],
    website: 5,
    service_area_only: "yes",
  });
  assert.deepEqual(
    odd.hours,
    [shift(2, 9, 19), { open: { day: 0, hour: 0, minute: 0 }, close: null }],
    "a period with no close is Google's around the clock, and kept",
  );
  assert.equal(odd.website, null);
  assert.equal(odd.service_area_only, false, "only true says it");
  assert.equal(odd.time_zone, null);
});

test("the first receptionist is what Google says: the listing's name, its week with each closed day stated, the address and the website, and the product's own prompt and messages", () => {
  const brain = firstReceptionistOf({ workspaceName: "Harbor", listing: listed() });
  assert.deepEqual(brain, {
    business_name: "Harbor Moving & Storage",
    ...newReceptionistDefaults("Harbor Moving & Storage"),
    profile: {
      hours: {
        mon: {},
        tue: NINE_TO_SEVEN,
        wed: NINE_TO_SEVEN,
        thu: NINE_TO_SEVEN,
        fri: NINE_TO_SEVEN,
        sat: NINE_TO_SEVEN,
        sun: {},
      },
      address: "12 Pier Rd, Brooklyn, NY 11231",
      website: "https://harbor.example.com/",
    },
  });
  assert.ok(TenantConfigWriteSchema.safeParse({ brain }).success, "a save would take it");
  assert.equal(brain.booking_link, undefined, "no link: the website is read for one later");
  assert.equal(brain.phone_display, undefined, "absent is the line it answers");
});

test("what the record cannot hold is left out: a service area has no address, a day past midnight is not stated, around the clock is no week, and a website the schema refuses is none", () => {
  const area = firstReceptionistOf({ workspaceName: null, listing: listed({ service_area_only: true }) });
  assert.equal(area.profile.address, undefined, "it goes to its customers");
  const late = firstReceptionistOf({
    workspaceName: null,
    listing: listed({ hours: [shift(2, 9, 19), shift(5, 18, 2, 6)] }),
  });
  assert.deepEqual(
    late.profile.hours,
    { mon: {}, tue: NINE_TO_SEVEN, wed: {}, thu: {}, sat: {}, sun: {} },
    "Friday closes on Saturday: it is asked about, never stated",
  );
  const allDay = firstReceptionistOf({
    workspaceName: null,
    listing: listed({ hours: [{ open: { day: 0, hour: 0, minute: 0 }, close: null }] }),
  });
  assert.equal(allDay.profile.hours, undefined, "open around the clock: every day is asked about");
  assert.equal(firstReceptionistOf({ workspaceName: null, listing: listed({ hours: null }) }).profile.hours, undefined);
  assert.equal(
    firstReceptionistOf({ workspaceName: null, listing: listed({ website: "harbor dot com" }) }).profile.website,
    undefined,
  );
});

test("a receptionist set up before its listing was linked takes what Google says where it states nothing, and never over what is there", () => {
  const byName = firstReceptionistOf({ workspaceName: "Harbor Moving", listing: null });
  const filled = googleFillsOf(byName, listed());
  assert.equal(filled.business_name, "Harbor Moving", "its own name stays");
  assert.deepEqual(Object.keys(filled.profile).sort(), ["address", "hours", "website"]);
  assert.equal(filled.profile.address, "12 Pier Rd, Brooklyn, NY 11231");
  assert.ok(TenantConfigWriteSchema.safeParse({ brain: filled }).success);
  const own = { ...byName, profile: { hours: { mon: NINE_TO_SEVEN }, website: "https://harbor-own.example.com/" } };
  const kept = googleFillsOf(own, listed());
  assert.deepEqual(kept.profile.hours, { mon: NINE_TO_SEVEN }, "the owner's week is theirs");
  assert.equal(kept.profile.website, "https://harbor-own.example.com/");
  assert.equal(kept.profile.address, "12 Pier Rd, Brooklyn, NY 11231", "and only what it lacks is filled");
  const whole = { ...own, profile: { ...own.profile, address: "1 Dock St, Brooklyn, NY 11201" } };
  assert.equal(googleFillsOf(whole, listed()), null, "nothing to add");
  assert.equal(googleFillsOf(byName, null), null, "no listing, nothing to add");
});

test("not on Google, the first receptionist is the name typed at sign-up and nothing more; with no name at all there is none", () => {
  assert.deepEqual(firstReceptionistOf({ workspaceName: " Harbor Moving ", listing: null }), {
    business_name: "Harbor Moving",
    ...newReceptionistDefaults("Harbor Moving"),
  });
  assert.equal(firstReceptionistOf({ workspaceName: "  ", listing: null }), null);
  const unnamed = firstReceptionistOf({
    workspaceName: "Harbor Moving",
    listing: { name: null, address: null, facts: null },
  });
  assert.equal(unnamed.business_name, "Harbor Moving", "a listing with no name defers to the workspace's");
  assert.equal(unnamed.profile, undefined);
  const long = firstReceptionistOf({
    workspaceName: null,
    listing: listed({}, { name: `Harbor ${"Moving ".repeat(30)}` }),
  });
  assert.ok(long.business_name.length <= 120, "cut to what the schema takes");
  assert.ok(TenantConfigWriteSchema.safeParse({ brain: long }).success);
});

/* ---- Check (3c-2) ---- */

const LISTING = { name: "Harbor Moving", rating: 4.8, review_count: 12, checked_at: null, check_error: null };
const harbor = (business = {}, google = {}) =>
  empty({
    business: {
      name: "Harbor Moving",
      hours: true,
      services: 0,
      bookingLink: false,
      address: true,
      handoff: null,
      broken: false,
      receptionist: "set",
      ...business,
    },
    google: { ready: true, places: true, listing: LISTING, connected: false, unsure: [], ...google },
  });
const OWNER = { owner: true, receptionistName: "Harbor Moving", workspaceName: "Harbor Moving" };
const W = FIRST_RUN_WORDS.check;

test("Check is the business step once Find is not shown: what Google found, in the Business tab's rows, and Looks right held until the step is done", () => {
  const fr = firstRunOf(setupSteps(harbor(), NOW), null, OWNER);
  assert.equal(fr.find, false, "the listing is linked");
  assert.deepEqual(fr.check, {
    made: true,
    make: null,
    waiting: null,
    unsure: null,
    find: null,
    type: null,
    bookingPage: null,
  });
  const found = "https://calendly.com/harbor-moving-example/estimate";
  assert.equal(
    firstRunOf(setupSteps(harbor({}, { bookingPage: found }), NOW), null, OWNER).check.bookingPage,
    found,
    "the booking page the website names, carried to Check to offer",
  );
  assert.equal(fr.heading, "Here's what we found");
  assert.equal(fr.lead, "Your receptionist answers from this. Fix anything that's off.");
  assert.equal(fr.primaryRow, null, "the rows are the Business tab's; Looks right is the step's button");
  assert.deepEqual(
    fr.onward,
    { label: "Looks right", to: "start", leaves: false, held: "Still missing: services." },
    "held, with the facts row's own sentence",
  );
  const done = firstRunOf(setupSteps(harbor({ services: 2 }), NOW), "business", OWNER);
  assert.deepEqual(done.onward, { label: "Looks right", to: "start", leaves: false, held: null });
});

test("Check with nothing on Google asks for the basics, and offers Find again where Google can be searched", () => {
  // Google can be searched here and nothing is linked: "We're not on Google" put it off, and Find is gone.
  const putOff = setupSteps(empty({ ...harbor({}, { listing: null }), later: ["google"] }), NOW);
  const basics = firstRunOf(putOff, null, OWNER);
  assert.equal(basics.find, false, "not on Google, said");
  assert.equal(basics.heading, "Tell us the basics");
  assert.equal(basics.lead, "Your receptionist answers from this. You can add more later in Settings.");
  assert.deepEqual(basics.check.find, { label: "On Google after all? Find it", to: "start/find" });
  assert.equal(
    firstRunOf(putOff, null, { ...OWNER, owner: false }).check.find,
    null,
    "search and link are the owner's",
  );
  const noGoogle = setupSteps(harbor({}, { ready: false, places: false, listing: null }), NOW);
  assert.equal(firstRunOf(noGoogle, null, OWNER).check.find, null, "nothing to search on this deployment");
});

test("Check with no receptionist yet: an owner is offered the one press, from Google or from the name typed at sign-up; anyone else is told an owner does it", () => {
  const none = { name: null, hours: false, address: false, receptionist: "none" };
  const listed = firstRunOf(setupSteps(harbor(none), NOW), null, { ...OWNER, receptionistName: null });
  assert.deepEqual(listed.check, {
    made: false,
    make: {
      sentence: "Your receptionist starts from what your Google listing says, and you check it here.",
      cta: "Set up your receptionist",
      busy: "Setting up…",
    },
    waiting: null,
    unsure: null,
    find: null,
    type: null,
    bookingPage: null,
  });
  assert.equal(listed.onward, null, "the press is the step's one button");
  const noGoogle = { ready: false, places: false, listing: null };
  const named = firstRunOf(setupSteps(harbor(none, noGoogle), NOW), null, { ...OWNER, receptionistName: null });
  assert.equal(
    named.check.make.sentence,
    "Your receptionist starts with the name Harbor Moving, and you add the rest here.",
  );
  const viewer = firstRunOf(setupSteps(harbor(none), NOW), null, { ...OWNER, owner: false, receptionistName: null });
  assert.equal(viewer.check.make, null);
  assert.equal(viewer.check.waiting, "An owner sets up the receptionist here.");
});

test("a config that cannot be read is no Check: Setup's facts row asks for the repair, as it does on Setup", () => {
  const fr = firstRunOf(setupSteps(harbor({ broken: true, receptionist: "broken" }), NOW), null, OWNER);
  assert.equal(fr.check, null);
  assert.equal(fr.heading, "Your business");
  assert.equal(fr.primaryRow, "facts");
  assert.equal(fr.shown.rows.find((r) => r.id === "facts").verb.to, "verb:request-repair");
});

test("the days Google gives hours for that the week cannot hold are named under the hours", () => {
  assert.equal(
    firstRunOf(setupSteps(harbor({}, { unsure: ["fri", "sat"] }), NOW), null, OWNER).check.unsure,
    "Google's hours for Friday and Saturday could not be copied: check those days.",
  );
  assert.equal(unsureHoursWords(["fri"]), "Google's hours for Friday could not be copied: check that day.");
  assert.equal(
    unsureHoursWords(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
    "Google's hours for every day could not be copied: add yours.",
  );
  assert.equal(unsureHoursWords([]), null);
  assert.equal(W.found, "Here's what we found");
});

test("the receptionist card says how a receptionist with no link is reached, for every business (0008, amended 18 Oct 2026)", () => {
  const card = (brain) =>
    receptionistCardOf({
      setup: empty(),
      answering: false,
      brain,
      numbers: null,
      workspaceName: "Harbor Moving",
      tz: "America/New_York",
    }).rows.find((r) => r.key === "books");
  assert.deepEqual(card({ business_name: "Harbor Moving" }), {
    key: "books",
    label: "To book",
    value: "Takes their details",
  });
  const linked = card({ business_name: "Harbor Moving", booking_link: "https://book.example/harbor" });
  assert.equal(linked.label, "Books with");
  assert.match(linked.value, /book\.example/, "the link it sends");
  assert.deepEqual(card(null), { key: "books", label: "Books with", value: null }, "nothing read yet");
});

test("Try it waits for a call: Setup's row names the number to call, the skip lets the first run go on, and Today keeps the row", () => {
  const untried = (over = {}) =>
    live({
      channels: {
        ...live().channels,
        voice: { present: true, active: true, number: VOICE, lastInboundAt: null },
      },
      ...over,
    });
  const vm = setupSteps(untried(), NOW);
  const row = vm.rows.find((r) => r.id === "try");
  assert.deepEqual(
    [row.state, row.required, row.sentence],
    ["waiting_you", false, "Call +1 (305) 555-0124 from your cell."],
  );
  assert.deepEqual(row.verb, { label: "Try it", to: firstRunStepRoute("try") }, "the first run's own step");
  assert.equal(firstRunOf(vm).current, "try", "answering is not tried: the step waits for a call");
  const card = setupCardOf(vm);
  assert.equal(card.start, null, "only the test call left: Setup's rows, not a card that cannot be put away");
  assert.equal(card.rows[0].id, "try");
  assert.ok(card.hide, "and the card can be hidden");
  const putOff = setupSteps(untried({ later: ["try"] }), NOW);
  assert.equal(firstRunOf(putOff).current, "live", "Today's Skip on Try it is a skip too");
  assert.equal(TRY_SKIPPED, "try-skipped");
  const skipped = setupSteps(untried({ later: [TRY_SKIPPED] }), NOW);
  assert.equal(skipped.trySkipped, true);
  assert.equal(firstRunOf(skipped).current, "live", "skipped: the first run goes on");
  assert.equal(setupCardOf(skipped).rows[0].id, "try", "Today keeps Try it, first, until a call comes in");
  const tried = setupSteps(live(), NOW);
  assert.equal(tried.rows.find((r) => r.id === "try").state, "ready");
  assert.equal(tried.rows.find((r) => r.id === "try").verb, null);
  assert.equal(firstRunOf(tried).current, "live");
  // Kept, the number to call is the one customers call, and nobody is to pick up.
  const kept = {
    id: "fw",
    e164: "+13055550100",
    kind: "forwarded",
    provider: "carrier",
    area_code: 305,
    voice_state: "none",
    sms_state: "none",
    whatsapp_state: "none",
    port_state: "none",
    forwarding_state: "instructed",
    step: null,
    last_error: null,
    state_since: "2026-09-07T14:00:00Z",
    created_at: "2026-09-07T14:00:00Z",
  };
  const forwarded = setupSteps(
    untried({ lines: { rows: [kept], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } } }),
    NOW,
  );
  // A phone cannot call itself, and the cell may be the very phone that rings: another phone, unless the number kept
  // is an office phone system's (setup.ts keptPhoneKind, the first run's own rule).
  assert.equal(
    forwarded.rows.find((r) => r.id === "try").sentence,
    "Call +1 (305) 555-0100 from another phone and don't pick up.",
  );
  const office = { ...kept, forwarding: { carrier: "office", mode: "unanswered", destination_e164: VOICE } };
  assert.equal(
    setupSteps(
      untried({ lines: { rows: [office], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } } }),
      NOW,
    ).rows.find((r) => r.id === "try").sentence,
    "Call +1 (305) 555-0100 from your cell and don't pick up.",
  );
  assert.deepEqual([keptPhoneKind(null), keptPhoneKind(kept), keptPhoneKind(office)], [null, "unknown", "office"]);
  assert.equal(keptPhoneKind({ ...kept, forwarding: { carrier: "tmobile" } }), "mobile");
});

test("a number the owner chose to keep holds the phone step until its forwarding is saved, or put off by name", () => {
  // The receptionist's own number answers, and was called: without the choice, the first run is on Live.
  assert.equal(firstRunOf(setupSteps(live(), NOW)).current, "live");
  const want = { way: "keep", number: "+13055550100" };
  const owed = setupSteps(live({ want }), NOW);
  assert.equal(owed.forwardingOwed, true);
  const fr = firstRunOf(owed);
  assert.equal(fr.current, "phone", "the choice is the member's, read from their saved view: the step is not done");
  assert.equal(fr.complete, false);
  assert.equal(fr.steps.find((s) => s.key === "phone").state, "current");
  const card = setupCardOf(owed);
  assert.equal(card.start.status, "Next: your phone", "and Today's card opens the first run there");
  // Saved: a forwarded line is on record, whatever its proof.
  const kept = {
    id: "fw",
    e164: "+13055550100",
    kind: "forwarded",
    provider: "carrier",
    area_code: 305,
    voice_state: "none",
    sms_state: "none",
    whatsapp_state: "none",
    port_state: "none",
    forwarding_state: "instructed",
    step: null,
    last_error: null,
    state_since: "2026-09-07T14:00:00Z",
    created_at: "2026-09-07T14:00:00Z",
  };
  const lines = { rows: [kept], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } };
  const saved = setupSteps(live({ want, lines }), NOW);
  assert.equal(saved.forwardingOwed, false);
  assert.equal(firstRunOf(saved).current, "live");
  // Put off: Setup's own Later on "The number you already have".
  const later = setupSteps(live({ want, later: [KEEP_ROW] }), NOW);
  assert.equal(later.forwardingOwed, false);
  assert.equal(firstRunOf(later).current, "live");
  assert.equal(KEEP_ROW, "keep");
  // Put off for a week, and back on Today since: it still said the forwarding can wait, so the step stays done and
  // the row is Today's to ask again, never the first run's.
  const back = setupSteps(live({ want, rests: { [KEEP_ROW]: ENDED } }), NOW);
  assert.equal(back.forwardingOwed, false);
  assert.equal(firstRunOf(back).current, "live");
  const today = setupCardOf(back);
  assert.equal(today.start, null);
  assert.equal(today.rows.find((r) => r.id === KEEP_ROW).back, true);
});

test("the number kept or moved is read from the member's saved view: a way, a number in E.164, nothing else", () => {
  assert.deepEqual(setupPhoneWantOf({ later: [], phone: { way: "keep", number: "(305) 555-0100" } }), {
    way: "keep",
    number: "+13055550100",
  });
  assert.deepEqual(setupPhoneWantOf({ phone: { way: "move", number: "+13055550100", extra: 1 } }), {
    way: "move",
    number: "+13055550100",
  });
  assert.equal(setupPhoneWantOf({ phone: { way: "new", number: "+13055550100" } }), null, "a new number wants none");
  assert.equal(setupPhoneWantOf({ phone: { way: "keep", number: "nope" } }), null);
  assert.equal(setupPhoneWantOf({ phone: "keep" }), null);
  assert.equal(setupPhoneWantOf({ later: ["keep"] }), null);
  assert.equal(setupPhoneWantOf(null), null);
});

test("(D) the question before a move while typing is unsaved, and the other one while a save is out", async () => {
  const { FIRST_RUN_WORDS, zoneSearchWords } = await import("@chanlytics/contracts");
  const L = FIRST_RUN_WORDS.leave;
  assert.deepEqual([L.question, L.yes, L.no], ["Leave without saving?", "Yes, leave", "Stay"]);
  assert.match(L.detail, /not been saved/);
  assert.equal(L.savingQuestion, "Leave while this saves?");
  assert.doesNotMatch(L.savingDetail, /without saving|not been saved/, "untrue of a change already sent");
  // And a zone is found by the cities it covers, beside its own name.
  assert.match(zoneSearchWords("America/New_York"), /^America\/New York .*Miami/);
  assert.equal(zoneSearchWords("Asia/Tokyo"), "Asia/Tokyo", "a zone with no list is its own name");
});
