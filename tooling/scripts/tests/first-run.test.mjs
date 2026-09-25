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
  firstRunKicker,
  FIRST_RUN_WORDS,
  FIRST_RUN_FIND_ROUTE,
  businessNameOf,
  setupCardOf,
  TRY_SKIPPED,
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
    sellsBy: "booking",
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
    sellsBy: null,
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
    sellsBy: null,
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
  assert.equal(basics.lead, "Your receptionist answers from this. You can add more later in Settings › Business.");
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

test("the receptionist card says how a business that quotes, with no link, is reached; how customers buy is required", () => {
  const card = (brain, sellsBy) =>
    receptionistCardOf({
      setup: empty(),
      answering: false,
      brain,
      numbers: null,
      workspaceName: "Harbor Moving",
      tz: "America/New_York",
      sellsBy,
    }).rows.find((r) => r.key === "books");
  const quoting = { business_name: "Harbor Moving" };
  assert.deepEqual(card(quoting, "proposal"), { key: "books", label: "For a quote", value: "Takes their details" });
  assert.deepEqual(
    card(quoting, "booking"),
    { key: "books", label: "Books with", value: null },
    "missing, for one that books",
  );
  assert.deepEqual(card(null, "proposal"), { key: "books", label: "Books with", value: null }, "nothing read yet");
  assert.throws(
    () =>
      receptionistCardOf({
        setup: empty(),
        answering: false,
        brain: quoting,
        numbers: null,
        workspaceName: null,
        tz: "America/New_York",
      }),
    TypeError,
  );
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
  assert.equal(
    forwarded.rows.find((r) => r.id === "try").sentence,
    "Call +1 (305) 555-0100 from your cell and don't pick up.",
  );
});
