/**
 * The Business tab's folds: what each owns and opens with, the edges, what stops a save, and a fold's save through
 * the tab's one saver.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_WAY_TO_SEND_LINK,
  GREETING_TEMPLATE,
  newReceptionistDefaults,
  FALLBACK_DEFAULTS,
  INSTRUCTIONS_MAX,
  hasProfile,
  guardrailsInForce,
  PROFILE_LIMITS,
} from "@chanlytics/contracts";
import { profileRefusal } from "../../../../apps/dashboard/src/surfaces/settings/business/model/fold-limits.ts";
import { withStanding } from "../../_prompt-rules.mjs";
import {
  BASELINE_IN_THE_OWNERS_FIELD,
  BUSINESS_TAB,
  DAYS,
  EDITS,
  FOLDS,
  FOLD_BLOCK,
  INEXACT,
  PROMPT_ONLY,
  S,
  STORED,
  door,
  landSettings,
  read,
  said,
  settle,
  stored,
  told,
  without,
  withoutPaths,
  wordsOf,
} from "./_folds.mjs";
import { bridgeHolds } from "../../../shell/_bridge-holds.mjs";

/* ------------------------------------ what each fold owns ------------------------------------ */

test("every fold is named once, owns exactly its paths, and is a fold the bridge can say the consequence of", () => {
  const brain = Object.keys(S.PATHS_OF).filter((f) => !S.PATHS_OF[f].some((p) => p.startsWith("reach_out.")));
  assert.deepEqual(brain.sort(), [...FOLDS].sort(), "the edits cover every brain fold the save file knows");
  assert.deepEqual(Object.keys(S.KEYS_OF).sort(), Object.keys(S.PATHS_OF).sort());
  assert.deepEqual(Object.fromEntries(brain.map((f) => [f, S.KEYS_OF[f]])), {
    tone: ["tone"],
    phone_greeting: ["phone_greeting"],
    hours: ["hours"],
    closures: ["closures"],
    services: ["services"],
    languages: ["languages"],
    notes: ["notes"],
    escalate_when: ["escalate_when"],
    booking_rules: ["booking_rules"],
    consult_first: ["booking_rules"],
    guardrails: ["guardrails"],
    extra_instructions: ["extra_instructions"],
    fallbacks: [],
    calendar: [],
    receptionist: [],
  });
  for (const fold of FOLDS) {
    // KEYS_OF says which keys of the profile a fold writes into; PATHS_OF says exactly where, in the whole config.
    const profileKeys = [
      ...new Set(S.PATHS_OF[fold].filter((p) => p.startsWith("brain.profile.")).map((p) => p.split(".")[2])),
    ];
    assert.deepEqual(S.KEYS_OF[fold], profileKeys, `${fold}: the two maps say the same thing`);
    assert.ok(Object.prototype.hasOwnProperty.call(FOLD_BLOCK, fold), `${fold} is a section consequenceOf knows`);
  }
  // Two folds share booking_rules, and neither owns the other's keys.
  assert.deepEqual(S.PATHS_OF.consult_first, ["brain.profile.booking_rules.consult_first"]);
  assert.ok(!S.PATHS_OF.booking_rules.includes("brain.profile.booking_rules.consult_first"));
  assert.deepEqual(S.PATHS_OF.booking_rules.map((p) => p.split(".").pop()).sort(), [
    "ask_email",
    "buffer_min",
    "lead_hours",
    "max_days_ahead",
    "notes",
    "party_max",
    "slot_min",
  ]);
  // The instructions own the stored prompt; the create fold writes the product's own where none is stored, and no other
  // fold touches it (the create fold's own test says it keeps one that is there).
  assert.deepEqual(
    FOLDS.filter((f) => S.PATHS_OF[f].includes("brain.system_prompt")),
    ["extra_instructions", "receptionist"],
  );
  for (const helper of ["draftOf", "saveFold", "problemsOf"]) {
    assert.throws(() => S[helper]("not_a_fold", stored(), ""), { name: "TypeError", message: /"not_a_fold"/ }, helper);
    assert.throws(
      () => S[helper]("toString", stored(), ""),
      { name: "TypeError", message: /"toString"/ },
      `${helper}: a name every object has is not a fold`,
    );
  }
});

test("what it calls a booking is no fold of the config: the settings save cannot write it, and it tells the receptionist nothing", () => {
  // 0041 J4 (00458): the word is the workspace's (tenants.appointment_word), saved through PATCH workspaces as the zone
  // is, from a row whose menu saves at once (no fold). As a fold of the config it could only go through PUT settings,
  // where an older edge refuses a key it does not know. So no helper of the save file knows it by name...
  for (const id of ["appointment_word", "sells_by"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(S.PATHS_OF, id), false, id);
    assert.equal(Object.prototype.hasOwnProperty.call(S.KEYS_OF, id), false, id);
    for (const helper of ["draftOf", "saveFold", "problemsOf"])
      assert.throws(
        () => S[helper](id, stored(), "meeting"),
        { name: "TypeError", message: new RegExp(`"${id}"`) },
        `${helper}: ${id} is not a fold of the config`,
      );
    // ...and the bridge holds no block a draft of the brain could show for it.
    assert.equal(Object.prototype.hasOwnProperty.call(FOLD_BLOCK, id), false, id);
  }
});

for (const fold of FOLDS) {
  test(`the ${fold} fold writes its own paths, and leaves everything else in the config exactly as it was`, () => {
    const [edit, lands] = EDITS[fold];
    const handed = stored();
    const next = S.saveFold(fold, handed, edit(S.draftOf(fold, handed)));
    assert.deepEqual(handed, STORED, "the config it was handed is as it was");
    // A real write: the change lands where it should.
    lands(next);
    // Nothing outside the fold's own paths changed, in the whole config.
    assert.deepEqual(withoutPaths(next, S.PATHS_OF[fold]), withoutPaths(STORED, S.PATHS_OF[fold]));
    // The two keys no form renders survive, and so do the sections beside the brain.
    assert.equal(next.brain.profile.a_key_no_form_renders, "keep me too");
    assert.equal(next.brain.profile.booking_rules.a_rule_added_later, "keep me");
    assert.deepEqual(next.notifications, STORED.notifications);
    // And the workspace's own prompt is untouched unless this fold owns it.
    if (fold !== "extra_instructions") assert.equal(next.brain.system_prompt, STORED.brain.system_prompt);
  });

  test(`the ${fold} fold, opened and saved with no change, writes nothing new`, () => {
    const handed = stored();
    const next = S.saveFold(fold, handed, S.draftOf(fold, handed));
    assert.deepEqual(handed, STORED);
    assert.deepEqual(withoutPaths(next, S.PATHS_OF[fold]), withoutPaths(STORED, S.PATHS_OF[fold]));
    if (!(fold in INEXACT)) {
      assert.deepEqual(next, STORED);
      // And key for key in the same order, which is how the saver compares what it would send: it sends nothing.
      assert.ok(S.same(next, STORED), `${fold}: the saver would send a save that changes nothing`);
      return;
    }
    // Written differently, and said the same: the list above stays honest both ways.
    assert.notDeepEqual(next, STORED, `${fold} is written back exactly now: take it out of INEXACT`);
    assert.deepEqual(told(next.brain), told(STORED.brain), INEXACT[fold]);
    assert.equal(hasProfile(next.brain.profile), hasProfile(STORED.brain.profile));
  });
}

test("a draft is the fold's own: changing it in place changes nothing stored", () => {
  // The folds edit what draftOf hands them. One that shared an array or an object with the settings read would show a
  // value no server holds, the bug a shallow copy once was for the saver.
  const scribble = (v) => {
    if (Array.isArray(v)) {
      v.forEach(scribble);
      v.push("scribbled");
      return;
    }
    if (v && typeof v === "object")
      for (const k of Object.keys(v)) {
        if (v[k] && typeof v[k] === "object") scribble(v[k]);
        else v[k] = "scribbled";
      }
  };
  for (const fold of FOLDS) {
    const handed = stored();
    scribble(S.draftOf(fold, handed));
    assert.deepEqual(handed, STORED, fold);
  }
});

/* ------------------------------------ what each fold opens with ------------------------------------ */

test("each fold opens with its stored values, as the form it replaces opened them", () => {
  const s = stored();
  assert.equal(S.draftOf("tone", s), "Warm and unhurried.");
  assert.equal(
    S.draftOf("phone_greeting", s),
    GREETING_TEMPLATE,
    "nothing stored: the standard line, to be made their own",
  );
  assert.deepEqual(S.draftOf("languages", s), ["English", "Spanish"]);
  assert.equal(S.draftOf("escalate_when", s), "They ask for Marisa\nThey are upset, or have a complaint");
  assert.equal(S.draftOf("consult_first", s), "Color correction\nExtensions");
  assert.deepEqual(
    S.draftOf("booking_rules", s),
    {
      lead_hours: "2",
      slot_min: "30",
      buffer_min: "",
      max_days_ahead: "",
      party_max: "4",
      notes: "No bookings after 5pm on Saturdays",
      ask_email: false,
    },
    "numbers as the boxes hold them, empty where there is no rule, and the switch off where none is stored",
  );
  assert.deepEqual(S.draftOf("services", s), STORED.brain.profile.services);
  assert.deepEqual(S.draftOf("closures", s), STORED.brain.profile.closures);
  assert.deepEqual(S.draftOf("notes", s), STORED.brain.profile.notes);
  assert.deepEqual(S.draftOf("fallbacks", s), STORED.brain.fallbacks);
  // A link stored and no tool named: a calendar with no tool behind it, as the picker says it (contracts booksWithOf).
  // Booking requests are the booking row's since 18 Oct 2026 (business/choices), so no part of this fold.
  assert.deepEqual(S.draftOf("calendar", s), { with: "calendar", ical_url: STORED.calendar.ical_url });
  const named = stored();
  named.bookings = { tool: "booksy" };
  assert.equal(S.draftOf("calendar", named).with, "booksy", "the tool named outranks the link beside it");
  const byHand = stored();
  delete byHand.calendar;
  byHand.bookings = { by_hand: true };
  assert.deepEqual(S.draftOf("calendar", byHand), { with: "hand", ical_url: "" });
  // The prompt from before the fields, carried into the box and marked so (contracts instructionsDraft, S4).
  assert.deepEqual(S.draftOf("extra_instructions", s), { text: STORED.brain.system_prompt, carried: true });
  // The rules as contracts reads them: the price rule on unless switched off, the booking rule and saying it is an
  // assistant always, the health rule only when switched on. Photos are What it can do's (18 Oct 2026).
  assert.deepEqual(S.draftOf("guardrails", s), {
    never_quote_prices: true,
    never_confirm_booking: true,
    disclose_ai: true,
    no_health_advice: true,
  });
  const bare = stored();
  delete bare.brain.profile.guardrails;
  delete bare.features;
  assert.deepEqual(S.draftOf("guardrails", bare), {
    never_quote_prices: true,
    never_confirm_booking: true,
    disclose_ai: true,
    no_health_advice: false,
  });
  // Which rules are in force is contracts' one predicate (guardrailsInForce, the composer's and Ask's), asked through the
  // bridge, never a copy of it: whatever it answers is what the switches open as.
  for (const g of [undefined, {}, { never_quote_prices: false }, { no_health_advice: true, disclose_ai: false }]) {
    const c = stored();
    if (g === undefined) delete c.brain.profile.guardrails;
    else c.brain.profile.guardrails = g;
    assert.deepEqual(S.draftOf("guardrails", c), guardrailsInForce(g), JSON.stringify(g));
  }
  const was = BUSINESS_TAB.guardrailsInForce;
  try {
    BUSINESS_TAB.guardrailsInForce = () => ({
      never_quote_prices: false,
      never_confirm_booking: false,
      disclose_ai: false,
      no_health_advice: true,
    });
    assert.deepEqual(
      S.draftOf("guardrails", s),
      {
        never_quote_prices: false,
        never_confirm_booking: false,
        disclose_ai: false,
        no_health_advice: true,
      },
      "the switches open as the predicate says",
    );
  } finally {
    BUSINESS_TAB.guardrailsInForce = was;
  }
  // A record with none of it opens every fold empty, and the messages on the product's wording.
  const none = {
    brain: {
      business_name: "Bella Nails",
      booking_link: "https://bella.example/book",
      system_prompt: newReceptionistDefaults("Bella Nails").system_prompt,
    },
  };
  assert.deepEqual(
    FOLDS.map((f) => [f, S.draftOf(f, none)]),
    [
      ["tone", ""],
      // The greeting opens on the standard line, the slot where the name goes (decision 0051).
      ["phone_greeting", GREETING_TEMPLATE],
      ["hours", Object.fromEntries(DAYS.map((d) => [d, { isOpen: false, shifts: [] }]))],
      ["closures", []],
      ["services", []],
      ["languages", []],
      ["notes", []],
      ["escalate_when", ""],
      [
        "booking_rules",
        {
          lead_hours: "",
          slot_min: "",
          buffer_min: "",
          max_days_ahead: "",
          party_max: "",
          notes: "",
          ask_email: false,
        },
      ],
      ["consult_first", ""],
      [
        "guardrails",
        {
          never_quote_prices: true,
          never_confirm_booking: true,
          disclose_ai: true,
          no_health_advice: false,
        },
      ],
      ["extra_instructions", { text: "", carried: false }],
      ["fallbacks", FALLBACK_DEFAULTS],
      ["calendar", { with: "", ical_url: "" }],
      ["receptionist", { name: "Bella Nails", own: true, typed: "", link: "https://bella.example/book" }],
    ],
  );
});

/* ------------------------------------ the edges ------------------------------------ */

test("an emptied field deletes its key, and nothing anywhere is stored as an empty string or an empty list", () => {
  const EMPTIED = {
    tone: [() => "   ", "brain.profile.tone"],
    hours: [
      (d) => Object.fromEntries(Object.entries(d).map(([day, v]) => [day, { ...v, isOpen: false }])),
      "brain.profile.hours",
    ],
    closures: [() => [{ date: "  ", until: "", note: "never finished" }], "brain.profile.closures"],
    services: [(d) => d.map((s) => ({ ...s, name: "  " })), "brain.profile.services"],
    languages: [() => [], "brain.profile.languages"],
    notes: [() => [{ title: " ", text: "" }], "brain.profile.notes"],
    escalate_when: [() => "\n   \n", "brain.profile.escalate_when"],
    consult_first: [() => "  ", "brain.profile.booking_rules.consult_first"],
    extra_instructions: [(d) => ({ ...d, text: "   " }), "brain.profile.extra_instructions"],
    calendar: [(d) => ({ ...d, ical_url: "  " }), "calendar"],
  };
  const found = (config, path) =>
    path.split(".").reduce((o, k) => (o && typeof o === "object" && k in o ? o[k] : undefined), config);
  const hollow = (v, at = "") => {
    if (v === "") return [at];
    if (Array.isArray(v)) return v.length ? v.flatMap((x, i) => hollow(x, `${at}.${i}`)) : [at];
    if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => hollow(x, at ? `${at}.${k}` : k));
    return [];
  };
  for (const [fold, [empty, path]] of Object.entries(EMPTIED)) {
    const next = S.saveFold(fold, stored(), empty(S.draftOf(fold, stored())));
    assert.equal(found(next, path), undefined, `${fold}: no ${path} key at all`);
    assert.deepEqual(hollow(next), [], `${fold}: nothing stored as "" or []`);
  }
  // The booking rules' boxes emptied: no rule at all for any of them, never a zero, and what the fold does not edit stays.
  const blank = { lead_hours: "", slot_min: " ", buffer_min: "", max_days_ahead: "", party_max: "", notes: "\n" };
  const rules = S.saveFold("booking_rules", stored(), blank).brain.profile.booking_rules;
  assert.deepEqual(rules, { consult_first: ["Color correction", "Extensions"], a_rule_added_later: "keep me" });
});

test("hours: a closed day is {}, one shift is open and close, several are intervals, and a week all closed says nothing", () => {
  const draft = S.draftOf("hours", stored());
  // One list of shifts a day, however the day is stored, and a day the record leaves out is closed.
  assert.deepEqual(draft.mon, { isOpen: true, shifts: [{ open: "09:30", close: "18:00" }] });
  assert.deepEqual(draft.sat, {
    isOpen: true,
    shifts: [
      { open: "09:30", close: "13:00" },
      { open: "14:00", close: "19:00" },
    ],
  });
  assert.deepEqual(draft.sun, { isOpen: false, shifts: [] });

  const edited = {
    ...draft,
    // Switched off, it keeps its times in the draft (the old form's toggleDay), and stores nothing.
    mon: { isOpen: false, shifts: draft.mon.shifts },
    tue: {
      isOpen: true,
      shifts: [
        { open: "10:00", close: "12:00" },
        { open: "", close: "" },
      ],
    },
    wed: { isOpen: true, shifts: [{ open: "10:00", close: "" }] },
    thu: {
      isOpen: true,
      shifts: [
        { open: "09:00", close: "12:00" },
        { open: "13:00", close: "17:00" },
        { open: "18:00", close: "20:00" },
      ],
    },
  };
  const hours = S.saveFold("hours", stored(), edited).brain.profile.hours;
  assert.deepEqual(Object.keys(hours), DAYS, "every day is said, a closed one as {}");
  assert.deepEqual(hours.mon, {}, "switched off: nothing, though the draft kept its times");
  assert.deepEqual(
    hours.tue,
    { open: "10:00", close: "12:00" },
    "one whole shift is open and close; the one left empty goes",
  );
  assert.deepEqual(hours.wed, {}, "a day with no whole shift is closed");
  assert.deepEqual(hours.thu, {
    intervals: [
      { open: "09:00", close: "12:00" },
      { open: "13:00", close: "17:00" },
      { open: "18:00", close: "20:00" },
    ],
  });
  assert.deepEqual(hours.sat, STORED.brain.profile.hours.sat);
  assert.deepEqual(hours.sun, {});

  // Every day closed is no hours at all, rather than a week that reads as never open.
  const shut = Object.fromEntries(DAYS.map((d) => [d, { isOpen: false, shifts: draft[d].shifts }]));
  assert.equal("hours" in S.saveFold("hours", stored(), shut).brain.profile, false);

  // A week stored the way the form writes it, all seven days, is written back exactly.
  const seven = stored();
  seven.brain.profile.hours = {
    mon: { open: "09:30", close: "18:00" },
    tue: { open: "09:30", close: "18:00" },
    wed: {},
    thu: { open: "09:30", close: "18:00" },
    fri: {
      intervals: [
        { open: "09:30", close: "13:00" },
        { open: "14:00", close: "19:00" },
      ],
    },
    sat: { open: "10:00", close: "16:00" },
    sun: {},
  };
  assert.deepEqual(S.saveFold("hours", structuredClone(seven), S.draftOf("hours", seven)), seven);
});

test("booking_rules and consult_first share one stored object, and each writes only its own of its keys", () => {
  const RULES = STORED.brain.profile.booking_rules;
  // The booking rules: each number inside its range, the notes from lines. The consult-first list and a rule added
  // later stay as stored, and a box left empty is no rule, never zero.
  const draft = {
    ...S.draftOf("booking_rules", stored()),
    lead_hours: "24",
    slot_min: "",
    buffer_min: " 15 ",
    max_days_ahead: "30",
    notes: "Deposit for colour\n\n  Cash or card  ",
  };
  assert.deepEqual(S.saveFold("booking_rules", stored(), draft).brain.profile.booking_rules, {
    consult_first: RULES.consult_first,
    a_rule_added_later: "keep me",
    lead_hours: 24,
    buffer_min: 15,
    max_days_ahead: 30,
    party_max: 4,
    notes: ["Deposit for colour", "Cash or card"],
  });
  // A number outside its range is never written: problemsOf stops that save before it goes (below).
  assert.equal(
    "lead_hours" in S.saveFold("booking_rules", stored(), { ...draft, lead_hours: "500" }).brain.profile.booking_rules,
    false,
  );
  // The email switch: on is stored as true; off is no key at all (the schema's absent means no), never a false.
  assert.equal(
    S.saveFold("booking_rules", stored(), { ...draft, ask_email: true }).brain.profile.booking_rules.ask_email,
    true,
  );
  assert.equal("ask_email" in S.saveFold("booking_rules", stored(), draft).brain.profile.booking_rules, false);
  const asked = stored();
  asked.brain.profile.booking_rules.ask_email = true;
  assert.equal(S.draftOf("booking_rules", asked).ask_email, true, "the switch reads as it is stored");
  assert.equal(
    "ask_email" in S.saveFold("booking_rules", asked, { ...draft, ask_email: false }).brain.profile.booking_rules,
    false,
    "switched off, the key goes",
  );

  // Consult first: its lines, and every other rule as stored.
  assert.deepEqual(S.saveFold("consult_first", stored(), "Keratin\n  \n Balayage ").brain.profile.booking_rules, {
    ...RULES,
    consult_first: ["Keratin", "Balayage"],
  });
  assert.deepEqual(
    S.saveFold("consult_first", stored(), "").brain.profile.booking_rules,
    without(RULES, "consult_first"),
  );
  // Where the fold's own keys were all booking_rules held, emptying them takes booking_rules with them.
  const onlyList = stored();
  onlyList.brain.profile.booking_rules = { consult_first: ["Keratin"] };
  assert.equal("booking_rules" in S.saveFold("consult_first", onlyList, "").brain.profile, false);
  const onlyRules = stored();
  onlyRules.brain.profile.booking_rules = { lead_hours: 2 };
  assert.equal(
    "booking_rules" in
      S.saveFold("booking_rules", onlyRules, { ...S.draftOf("booking_rules", onlyRules), lead_hours: "" }).brain
        .profile,
    false,
  );
  // And where there were none, the list makes them.
  const noRules = stored();
  delete noRules.brain.profile.booking_rules;
  assert.deepEqual(S.saveFold("consult_first", noRules, "Keratin").brain.profile.booking_rules, {
    consult_first: ["Keratin"],
  });

  // One after the other, each on the config the other left, as the saver sends them: both land, and the rest stays.
  const both = S.saveFold("consult_first", S.saveFold("booking_rules", stored(), draft), "Keratin").brain.profile
    .booking_rules;
  assert.deepEqual(both, {
    ...without(RULES, "slot_min"),
    lead_hours: 24,
    buffer_min: 15,
    max_days_ahead: 30,
    notes: ["Deposit for colour", "Cash or card"],
    consult_first: ["Keratin"],
  });
});

test("guardrails: the health switch written, and everything stored beside it kept, the price rule and photos too", () => {
  const draft = S.draftOf("guardrails", stored());
  // A draft that says otherwise of the rules the fold does not draw changes none of them: they are other rows'.
  const next = S.saveFold("guardrails", stored(), {
    ...draft,
    no_health_advice: false,
    never_quote_prices: false,
    never_confirm_booking: false,
  });
  assert.deepEqual(next.brain.profile.guardrails, { never_quote_prices: true, no_health_advice: false });
  assert.deepEqual(next.features, STORED.features, "the photo switch is What it can do's");
  // Never stored, nothing is written beside it: an untouched workspace keeps no features at all.
  const untouched = stored();
  delete untouched.features;
  assert.equal("features" in S.saveFold("guardrails", untouched, S.draftOf("guardrails", untouched)), false);
  // A switch a newer form added, which this one does not draw, stays as it was stored.
  const newer = stored();
  newer.brain.profile.guardrails.a_switch_added_later = true;
  const kept = S.saveFold("guardrails", newer, S.draftOf("guardrails", newer));
  assert.equal(kept.brain.profile.guardrails.a_switch_added_later, true);
});

test("extra_instructions: the box is the owner's words, and the prompt becomes the product's lines under the name stored (S4)", () => {
  const baseline = newReceptionistDefaults(STORED.brain.business_name).system_prompt;
  const next = S.saveFold("extra_instructions", stored(), { text: " Our own words. ", carried: false });
  assert.equal(next.brain.profile.extra_instructions, "Our own words.");
  assert.equal(next.brain.system_prompt, baseline);
  // Emptied, the owner's field goes and the prompt is still the product's lines: never the old prompt carried back.
  const emptied = S.saveFold("extra_instructions", stored(), { text: "", carried: true });
  assert.equal("extra_instructions" in emptied.brain.profile, false);
  assert.equal(emptied.brain.system_prompt, baseline);
  // Under the name the brain holds when it goes, so a rename saved before it is the name its lines carry.
  const renamed = stored();
  renamed.brain.business_name = "Marisa's Salon & Spa";
  assert.equal(
    S.saveFold("extra_instructions", renamed, { text: "Our own words.", carried: false }).brain.system_prompt,
    newReceptionistDefaults("Marisa's Salon & Spa").system_prompt,
  );
});

test("fallbacks and the calendar write what the old form wrote: the three messages trimmed, and the feed or no calendar", () => {
  const messages = S.saveFold("fallbacks", stored(), { greeting: " Hello! ", error: "Sorry. ", non_text: " Thanks. " })
    .brain.fallbacks;
  assert.deepEqual(messages, { greeting: "Hello!", error: "Sorry.", non_text: "Thanks." });
  const newer = stored();
  newer.brain.fallbacks.a_message_added_later = "keep me";
  assert.equal(
    S.saveFold("fallbacks", newer, S.draftOf("fallbacks", newer)).brain.fallbacks.a_message_added_later,
    "keep me",
    "a message a newer form added stays",
  );
  // A workspace set up before the messages existed opens on the product's wording, and saves it.
  const none = stored();
  delete none.brain.fallbacks;
  assert.deepEqual(S.saveFold("fallbacks", none, S.draftOf("fallbacks", none)).brain.fallbacks, FALLBACK_DEFAULTS);

  const link = (ical_url, withWhat = "calendar") => ({ with: withWhat, ical_url });
  assert.deepEqual(S.saveFold("calendar", stored(), link("https://calendar.example.com/new.ics")).calendar, {
    ical_url: "https://calendar.example.com/new.ics",
  });
  assert.equal("calendar" in S.saveFold("calendar", stored(), link("", "")), false, "emptied, the section goes");
  const noFeed = stored();
  delete noFeed.calendar;
  assert.deepEqual(S.saveFold("calendar", noFeed, link("", "")), noFeed, "and with none stored, nothing is written");
  // What the owner books with: a tool of the list is the tool; "by hand" is its own switch; a calendar with no tool
  // behind it is the address and nothing more. Each answer takes the last one's key away.
  assert.deepEqual(S.saveFold("calendar", noFeed, link("", "booksy")).bookings, { tool: "booksy" });
  const hand = S.saveFold("calendar", S.saveFold("calendar", noFeed, link("", "booksy")), link("", "hand"));
  assert.deepEqual(hand.bookings, { by_hand: true });
  assert.equal("bookings" in S.saveFold("calendar", hand, link("https://calendar.example.com/a.ics")), false);
  // REGRESSION (the review of 8 Oct 2026): "by hand" over a link that is kept is written with no link. Kept beside
  // it, the link outranked the word on the next read (contracts booksWithOf), and the row said "Calendar link".
  const overLink = S.saveFold("calendar", stored(), link(STORED.calendar.ical_url, "hand"));
  assert.equal("calendar" in overLink, false, "the link goes with the word that nothing is read");
  assert.deepEqual(overLink.bookings, { by_hand: true });
  assert.equal(S.draftOf("calendar", overLink).with, "hand", "and it reads back as it was said");
});

/* ------------------------------------ what stops a save ------------------------------------ */

test("problemsOf says the old form's sentences, but for what an empty box means, each under the field it is about", () => {
  // The booking rules' ranges, each at both ends and past them.
  const rules = S.draftOf("booking_rules", stored());
  const ranges = [
    // The old form's said "leave it empty for no rule" of the least notice and the days ahead, each of which has a
    // default (BOOKING_DEFAULTS): the refusal says it, as the box's hint does.
    [
      "lead_hours",
      ["-1", "169", "soon"],
      ["0", "168"],
      "Least notice is 0 to 168 hours · leave it empty to use 2 hours.",
    ],
    [
      "slot_min",
      ["14", "241"],
      ["15", "240"],
      "A slot is 15 to 240 minutes · leave it empty for the calendar’s 30 minutes.",
    ],
    ["buffer_min", ["-1", "121"], ["0", "120"], "The gap is 0 to 120 minutes · leave it empty for none."],
    [
      "max_days_ahead",
      ["0", "91"],
      ["1", "90"],
      "Times are offered 1 to 90 days ahead · leave it empty to use 14 days.",
    ],
    ["party_max", ["0", "21"], ["1", "20"], "A booking is for 1 to 20 people · leave it empty for no rule."],
  ];
  for (const [key, bad, good, words] of ranges) {
    for (const v of bad)
      assert.deepEqual(S.problemsOf("booking_rules", { ...rules, [key]: v }), { [key]: words }, `${key} ${v}`);
    for (const v of [...good, "", "  "])
      assert.deepEqual(S.problemsOf("booking_rules", { ...rules, [key]: v }), {}, `${key} ${JSON.stringify(v)}`);
  }
  // Every problem at once, each under its own box (S22): the save used to stop at the first.
  assert.deepEqual(
    Object.keys(S.problemsOf("booking_rules", { ...rules, lead_hours: "500", slot_min: "5", party_max: "0" })),
    ["lead_hours", "slot_min", "party_max"],
  );

  // A note needs both its title and its text; one with neither is dropped, not refused.
  const half = "Each note needs both a title and the text to say.";
  assert.deepEqual(
    S.problemsOf("notes", [
      { title: "Parking", text: " " },
      { title: "Wi-Fi", text: "Ask at the desk." },
      { title: "", text: "No title" },
      { title: " ", text: "" },
    ]),
    { "note-0": half, "note-2": half },
  );

  // As much as the receptionist takes, and the space around the words is not counted. The sentence is contracts',
  // written from the same cap the check reads (profileRefusal over PROFILE_LIMITS), so the number is stated once.
  assert.deepEqual(S.problemsOf("extra_instructions", { text: "x".repeat(INSTRUCTIONS_MAX + 1), carried: false }), {
    extra_instructions: profileRefusal("instructions", INSTRUCTIONS_MAX + 1),
  });
  assert.deepEqual(
    S.problemsOf("extra_instructions", { text: ` ${"x".repeat(INSTRUCTIONS_MAX)} `, carried: false }),
    {},
  );

  // Each message: nothing to send, more than a message holds, or a name nothing fills in.
  const messages = S.draftOf("fallbacks", stored());
  assert.deepEqual(S.problemsOf("fallbacks", { ...messages, error: "  " }), {
    error: "Write this message, or use the default wording.",
  });
  const tooLong = PROFILE_LIMITS.message + 1;
  assert.deepEqual(S.problemsOf("fallbacks", { ...messages, greeting: "x".repeat(tooLong) }), {
    greeting: profileRefusal("message", tooLong),
  });
  assert.deepEqual(S.problemsOf("fallbacks", { ...messages, non_text: "Call us at {phone number}." }), {
    non_text: "Only {business}, {booking link} and {phone} are filled in · {phone number} would be sent as written.",
  });
  assert.deepEqual(S.problemsOf("fallbacks", { greeting: "", error: "", non_text: "" }), {
    greeting: "Write this message, or use the default wording.",
    error: "Write this message, or use the default wording.",
    non_text: "Write this message, or use the default wording.",
  });
  assert.deepEqual(
    S.problemsOf("fallbacks", { ...messages, non_text: "x".repeat(2000) }),
    {},
    "2,000 is as much as a message holds",
  );

  // The calendar feed, an address the receptionist can read.
  assert.deepEqual(S.problemsOf("calendar", { with: "calendar", ical_url: "calendar" }), {
    ical_url: "The calendar link needs to be a full address, starting with https:// or webcal://",
  });
  for (const ok of ["", "  ", "https://calendar.example.com/a.ics", "webcal://calendar.example.com/a.ics"])
    assert.deepEqual(S.problemsOf("calendar", { with: "calendar", ical_url: ok }), {}, ok);
  // An address the server masked (only an owner is sent it whole) is the stored one, kept as it is: judged, it would
  // refuse a non-owner's change of the tool beside it. Even the mask of a short address, which is the mark alone.
  for (const masked of ["https://calendar.example…ic.ics", "…"])
    assert.deepEqual(S.problemsOf("calendar", { with: "booksy", ical_url: masked }), {}, masked);
  // Under "by hand" no address is drawn or written, so none is judged: a refusal would be of a box not on screen.
  assert.deepEqual(S.problemsOf("calendar", { with: "hand", ical_url: "calendar" }), {});

  // Nothing for a good draft: every fold, as it opens on the record.
  for (const fold of FOLDS) assert.deepEqual(S.problemsOf(fold, S.draftOf(fold, stored())), {}, fold);
});

/* ------------------------------------ through the tab's one saver ------------------------------------ */

test("a fold's save goes through the tab's one saver as a patch of the whole config, on the config current when it goes", () => {
  const saver = S.saver;
  landSettings({ version: 7, config: stored() });
  const sent = [];
  bridgeHolds({
    parts: {
      saveSettings: (config, version, accepted) => {
        sent.push({ config: structuredClone(config), version });
        accepted({ config: structuredClone(config), version: version + 1 });
        return new Promise(() => {});
      },
    },
  });
  saver.reset();
  try {
    const job = (fold, draft) => ({
      row: fold,
      patch: (config) => S.saveFold(fold, config, draft),
      said: "Saved",
      done: () => {},
      flash: () => {},
    });
    const rules = { ...S.draftOf("booking_rules", stored()), lead_hours: "24" };
    // What the fold will say is worked out on the saver's base with the same helper its save sends.
    const preview = S.saveFold("booking_rules", saver.base(), rules);
    saver.save(job("booking_rules", rules));
    assert.deepEqual(sent[0].config, preview, "the save is what the preview described");
    saver.save(job("consult_first", "Keratin"));
    saver.save(job("calendar", { with: "", ical_url: "" }));
    assert.deepEqual(
      sent.map((s) => s.version),
      [7, 8, 9],
      "each on the answer to the one before",
    );
    const last = sent[2].config;
    assert.deepEqual(last.brain.profile.booking_rules, {
      ...STORED.brain.profile.booking_rules,
      lead_hours: 24,
      consult_first: ["Keratin"],
    });
    assert.equal("calendar" in last, false);
    assert.deepEqual(
      withoutPaths(last, [...S.PATHS_OF.booking_rules, ...S.PATHS_OF.consult_first, ...S.PATHS_OF.calendar]),
      withoutPaths(STORED, [...S.PATHS_OF.booking_rules, ...S.PATHS_OF.consult_first, ...S.PATHS_OF.calendar]),
    );
    // A fold opened and saved with no change sends nothing: the saver's own test, on a patch that writes what is there.
    saver.save(job("consult_first", "Keratin"));
    assert.equal(sent.length, 3);
  } finally {
    saver.reset();
    landSettings(undefined);
    bridgeHolds({ parts: { saveSettings: undefined } });
  }
});

for (const record of [
  ["a full record", STORED],
  ["a record that is only its hand-written prompt", PROMPT_ONLY],
  ["a record whose own-words field is the product's own lines", BASELINE_IN_THE_OWNERS_FIELD],
]) {
  test(`opened and saved with nothing changed, no fold sends anything, on ${record[0]}`, async () => {
    for (const fold of FOLDS) {
      read(record[1]);
      const sent = door();
      const base = S.saver.base();
      const opened = S.draftOf(fold, base);
      assert.equal(
        S.holdsChanges(fold, base, S.draftOf(fold, base)),
        false,
        `${fold}: a draft as it opened holds no changes`,
      );
      let closed = 0;
      S.saver.save(
        S.foldJob(fold, S.draftOf(fold, base), {
          opened,
          said: "Saved",
          done: () => {
            closed += 1;
          },
          flash: () => {},
        }),
      );
      await settle();
      assert.equal(sent.length, 0, `${fold}: nothing to send, so nothing sent -- no new version, no "last changed by"`);
      assert.equal(closed, 1, `${fold}: and the fold closes, as after any save`);
    }
  });
}

test("the own-words fold opens the baseline a save before S4 left in the owner's field empty, and an untouched Save writes nothing", async () => {
  // The two failures that kept this box from asking whoseWords in Phase 1 (plan Task 3.8), on the record that has
  // both: an empty box saved over the field DELETED it, and this workspace, whose only composed field is that copy,
  // then fell from a composed prompt to the bare baseline -- no hand-off token, no rule lines. Neither can happen
  // through a fold: an untouched draft holds no changes, so the patch hands the config back and the saver sends
  // nothing at all. Nothing is written, so there is nothing to compare but the prompt itself, before and after.
  const record = BASELINE_IN_THE_OWNERS_FIELD;
  const profile = record.brain.profile;
  assert.equal(hasProfile(profile), true, "it composes");
  assert.equal(
    hasProfile(without(profile, "extra_instructions")),
    false,
    "and the copy in the owner's field is the only reason it does",
  );
  const before = told(record.brain);
  assert.ok(
    before.every((t) => t.length > record.brain.system_prompt.length * 10 && /Rules you must follow/.test(t)),
    "a composed prompt, with the rule lines",
  );
  const bare = { ...record.brain, profile: without(profile, "extra_instructions") };
  assert.deepEqual(
    told(bare),
    [
      withStanding(record.brain.system_prompt, "whatsapp"),
      // A call with the link and no WhatsApp line to send it by is told so first (contracts offersLinkOn).
      withStanding(record.brain.system_prompt, "voice", record.brain.booking_link ? [NO_WAY_TO_SEND_LINK] : []),
    ],
    "and without it the resolver hands the stored prompt back with only the standing rules after it, which is what review measured",
  );

  read(record);
  const sent = door();
  const base = S.saver.base();
  const opened = S.draftOf("extra_instructions", base);
  assert.deepEqual(
    opened,
    { text: "", carried: false },
    "the box opens empty: the product wrote these words, not the owner",
  );
  assert.equal(S.holdsChanges("extra_instructions", base, opened), false, "so there is nothing for Save to send");
  let closed = 0;
  S.saver.save(
    S.foldJob("extra_instructions", opened, {
      opened,
      said: "Saved",
      done: () => {
        closed += 1;
      },
      flash: () => {},
    }),
  );
  await settle();
  assert.equal(
    sent.length,
    0,
    "REGRESSION guard: the save this replaced deleted the field an empty box was saved over",
  );
  assert.equal(closed, 1, "and the fold closes, as after any save");
  assert.deepEqual(S.saver.base(), record, "the config is untouched, down to the key that field was stored under");
  assert.deepEqual(told(S.saver.base().brain), before, "so the receptionist is told exactly what it was told before");
});

test("a fold with a change holds changes, and its save goes on the config as it is when it is sent", async () => {
  read(STORED);
  const sent = door();
  const base = S.saver.base();
  const tone = "Bright, and quick to the point.";
  assert.equal(S.holdsChanges("tone", base, tone), true);
  S.saver.save(S.foldJob("tone", tone, { opened: S.draftOf("tone", base), said: "Saved", flash: () => {} }));
  // Opened while the first is out, on the saver's base, which already holds the new voice.
  const base2 = S.saver.base();
  assert.equal(base2.brain.profile.tone, tone);
  const langs = [...S.draftOf("languages", base2), "Portuguese"];
  S.saver.save(
    S.foldJob("languages", langs, { opened: S.draftOf("languages", base2), said: "Saved", flash: () => {} }),
  );
  assert.equal(sent.length, 1, "one at a time");
  sent[0].accept();
  await settle();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].version, 8, "on the version the server answered with");
  assert.equal(
    sent[1].config.brain.profile.tone,
    tone,
    "REGRESSION guard: built on the config at send time, never on the one the fold opened with",
  );
  assert.deepEqual(sent[1].config.brain.profile.languages, ["English", "Spanish", "Portuguese"]);
});

test("a fold whose part of the settings changed after it opened is refused, and says so; another part changing is no refusal", async () => {
  read(STORED);
  let sent = door();
  const base = S.saver.base();
  const opened = S.draftOf("services", base);
  const draft = opened.map((s, i) => (i === 0 ? { ...s, name: "Full balayage" } : s));
  // A colleague adds a service, and the re-read lands in this tab.
  const theirs = structuredClone(STORED);
  theirs.brain.profile.services.push({ name: "Keratin", duration_min: 120 });
  landSettings({ config: theirs, version: 8 });
  const a = said();
  let closed = 0;
  S.saver.save(
    S.foldJob("services", draft, {
      opened,
      said: "Saved",
      done: () => {
        closed += 1;
      },
      flash: a.flash,
    }),
  );
  await settle();
  assert.equal(
    sent.length,
    0,
    "REGRESSION guard: sent, it would have put the list back as it was and taken Keratin with it",
  );
  assert.equal(closed, 0, "the fold stays open with what was typed");
  assert.equal(a.toasts.length, 1);
  assert.equal(a.toasts[0].tone, "danger");
  assert.match(wordsOf(a.toasts[0].msg), /changed after you opened it/);
  assert.equal(S.saver.pending("services"), false, "and the fold can be saved again once it is opened again");

  // The colleague changed the voice instead: not this fold's part, so its save goes, on their version, keeping theirs.
  read(STORED);
  sent = door();
  const opened2 = S.draftOf("services", S.saver.base());
  const voiced = structuredClone(STORED);
  voiced.brain.profile.tone = "Formal.";
  landSettings({ config: voiced, version: 8 });
  S.saver.save(S.foldJob("services", draft, { opened: opened2, said: "Saved", flash: () => {} }));
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].version, 8);
  assert.equal(sent[0].config.brain.profile.tone, "Formal.");
  assert.equal(sent[0].config.brain.profile.services[0].name, "Full balayage");
});

test("a fold's job needs the draft it opened with, and a fold's name", () => {
  assert.throws(() => S.foldJob("services", [], { said: "Saved", flash: () => {} }), {
    name: "TypeError",
    message: /opened/,
  });
  assert.throws(() => S.foldJob("not_a_fold", [], { opened: [], flash: () => {} }), {
    name: "TypeError",
    message: /"not_a_fold"/,
  });
});

test("a patch that cannot run is said and dropped: it never throws to the page drawing or to the save behind it", async () => {
  read(STORED);
  const sent = door();
  const a = said();
  // Nothing out: the caller is not thrown at, the owner is told, and the job is gone.
  assert.doesNotThrow(() =>
    S.saver.save({
      row: "services",
      patch: () => {
        throw new Error("boom");
      },
      said: "Saved",
      flash: a.flash,
    }),
  );
  assert.equal(sent.length, 0);
  assert.equal(a.toasts.length, 1);
  assert.equal(a.toasts[0].tone, "danger");
  assert.equal(S.saver.pending("services"), false);

  // Queued behind a save that is out: the page can still draw (base() skips it), and once the first is taken the bad
  // one is said and dropped, and the one behind it still goes.
  const b = said();
  S.saver.save(
    S.foldJob("tone", "Bright.", { opened: S.draftOf("tone", S.saver.base()), said: "Saved", flash: () => {} }),
  );
  S.saver.save({ row: "services", patch: () => null, said: "Saved", flash: b.flash });
  S.saver.save(
    S.foldJob("languages", ["English"], {
      opened: S.draftOf("languages", S.saver.base()),
      said: "Saved",
      flash: () => {},
    }),
  );
  assert.doesNotThrow(
    () => S.saver.base(),
    "REGRESSION guard: base() ran every queued patch on every render, and one that threw took the page down",
  );
  assert.equal(S.saver.base().brain.profile.tone, "Bright.");
  assert.deepEqual(S.saver.base().brain.profile.languages, ["English"]);
  sent[0].accept();
  await settle();
  assert.equal(b.toasts.length, 1, "a patch that returns no config is said, the same way");
  assert.equal(b.toasts[0].tone, "danger");
  assert.equal(
    sent.length,
    2,
    "REGRESSION guard: the throw inside the accepted save's callback stopped the queue and skipped the re-read",
  );
  assert.deepEqual(sent[1].config.brain.profile.languages, ["English"]);
});

test("a fold that throws as it closes, or a toast that throws, does not stop the queue", async () => {
  read(STORED);
  const sent = door();
  S.saver.save(
    S.foldJob("tone", "Bright.", {
      opened: S.draftOf("tone", S.saver.base()),
      said: "Saved",
      done: () => {
        throw new Error("closing");
      },
      flash: () => {
        throw new Error("toast");
      },
    }),
  );
  S.saver.save(
    S.foldJob("languages", ["English"], {
      opened: S.draftOf("languages", S.saver.base()),
      said: "Saved",
      flash: () => {},
    }),
  );
  sent[0].accept();
  await settle();
  assert.equal(sent.length, 2);
});

test("a reset forgets a save that is out: its answer closes nothing and says nothing afterwards", async () => {
  read(STORED);
  const sent = door();
  const a = said();
  let closed = 0;
  S.saver.save(
    S.foldJob("tone", "Bright.", {
      opened: S.draftOf("tone", S.saver.base()),
      said: "Saved",
      done: () => {
        closed += 1;
      },
      flash: a.flash,
    }),
  );
  S.saver.reset();
  sent[0].accept();
  await settle();
  assert.equal(closed, 0);
  assert.equal(a.toasts.length, 0);
});
