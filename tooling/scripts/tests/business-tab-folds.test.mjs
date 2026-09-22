/**
 * A save patches; it never rebuilds.
 *
 * The editor this replaces once started its profile from {} and added the known keys back, which is not a save -- it
 * is a rebuild, and a rebuild silently deletes every key the form does not happen to render. That is how a live
 * workspace lost a 5,000-character prompt. Every fold is held to the opposite, here, before any fold can save (plan
 * Task 3.6): each fold of the Business tab opens a draft from the stored config (draftOf), is stopped by the old form's
 * own sentences (problemsOf), and writes its own paths onto the config and nothing else (saveFold). All three are
 * pages/business-tab-folds.jsx's, run on the stub React as the page tests load it; they are pure, so nothing is drawn.
 *
 * EXECUTED, never read: every claim is something a helper returned for a config it was handed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newReceptionistDefaults, instructionsDraft, FALLBACK_DEFAULTS, unknownDetails, INSTRUCTIONS_MAX, resolveSystemPrompt,
  hasProfile, MAX_INTERVALS_PER_DAY, MAX_CLOSURES, bookingRuleRefusal, BookingRulesSchema,
} from "@chanlytics/contracts";
import { installLegacyReact } from "./_legacy-react.mjs";

// As the bridge publishes them (inbox-verbs.ts): what a new receptionist starts with, what the instructions box opens
// with and holds, the product's wording for the three messages, and the names in a message nothing fills in.
installLegacyReact({
  __receptionistDefaults: newReceptionistDefaults,
  __instructionsDraft: instructionsDraft,
  __fallbackDefaults: FALLBACK_DEFAULTS,
  __unknownDetails: unknownDetails,
  __instructionsMax: INSTRUCTIONS_MAX,
});
await import("../../../apps/dashboard/src/legacy/pages/business-tab-save.jsx");
await import("../../../apps/dashboard/src/legacy/pages/business-tab-folds.jsx");
const W = globalThis.window;
const S = W.__businessTabSave;
// What each fold's "It will say" is asked of: every fold here must be one consequenceOf knows by name.
const { FOLD_BLOCK, installBusinessTab } = await import("../../../apps/dashboard/src/legacy-bridge/business-tab.ts");
// And what the save's own schema refuses, which schemaProblems puts under the fold's fields.
installBusinessTab();

/* ------------------------------------ the record ------------------------------------ */

/**
 * A stored config, as the settings read hands it over: Melany's record with something in every fold, and three things
 * no form renders, which every save must leave exactly as they are: a key of the profile, a rule of booking_rules, and
 * the config's other sections. Never handed to a helper itself: each call gets its own copy (stored()), and what comes
 * back is compared with this, so a helper that wrote into the config it was handed cannot hide it.
 *
 * Three of its fields are stored the way no fold writes them back, which is what shows those folds' saves are not
 * exact (INEXACT, below): hours for two days of the seven, two guardrails of four, and a prompt from before the
 * workspace had fields, carried as its instructions.
 */
const STORED = {
  brain: {
    business_name: "Melany's Beauty Salon",
    booking_link: "https://booksy.com/en-us/1817434",
    system_prompt: "You are the WhatsApp assistant for Melany's Beauty Salon. Lashes, brows and nails; end with [[HUMAN]] if unsure.",
    fallbacks: { greeting: "Hi! Thanks for reaching out to {business}.", error: "Sorry, something went wrong on our side.", non_text: "Thanks, a person will look at this." },
    profile: {
      address: "2581 Pitkin Ave, Brooklyn, NY 11208",
      website: "https://melanysbeautysalon.com",
      tone: "Warm and unhurried.",
      languages: ["English", "Spanish"],
      hours: { mon: { open: "09:30", close: "18:00" }, sat: { intervals: [{ open: "09:30", close: "13:00" }, { open: "14:00", close: "19:00" }] } },
      closures: [{ date: "2026-12-24", until: "2026-12-26", note: "Christmas" }],
      services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }, { name: "Highlights", duration_min: 45 }],
      notes: [{ title: "Walk-ins", text: "Walk-ins are welcome; appointments are recommended for long services." }],
      escalate_when: ["They ask for Melany", "They are upset, or have a complaint"],
      booking_rules: { lead_hours: 2, slot_min: 30, party_max: 4, consult_first: ["Color correction", "Extensions"], notes: ["No bookings after 5pm on Saturdays"], a_rule_added_later: "keep me" },
      guardrails: { never_quote_prices: true, no_health_advice: true },
      handoff_number: "+16469325775",
      a_key_no_form_renders: "keep me too",
    },
  },
  calendar: { ical_url: "https://calendar.example.com/melany/basic.ics" },
  features: { vision: false },
  notifications: { escalation_emails: ["melany@example.com"] },
};
const stored = () => structuredClone(STORED);
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const without = (o, key) => { const c = { ...o }; delete c[key]; return c; };

/**
 * A copy of a config without the given dotted paths. An object the removal leaves empty goes too: a fold that empties
 * the last of its keys drops the object that held them, as the old save did, and an object holding anything else is
 * kept, so a fold that dropped one holding someone else's key is still caught.
 */
const withoutPaths = (config, paths) => {
  const copy = structuredClone(config);
  for (const path of paths) {
    const keys = path.split(".");
    const chain = [copy];
    for (const key of keys.slice(0, -1)) {
      const next = chain[chain.length - 1][key];
      if (!next || typeof next !== "object") break;
      chain.push(next);
    }
    if (chain.length < keys.length) continue;
    delete chain[chain.length - 1][keys[keys.length - 1]];
    for (let i = chain.length - 1; i > 0 && Object.keys(chain[i]).length === 0; i--) delete chain[i - 1][keys[i - 1]];
  }
  return copy;
};

/**
 * One real change per fold, the test's own: from the draft the fold opens with (draftOf) to a changed one, and where
 * the change must land. Every fold the save file knows has one (the first test holds the two lists together), so a new
 * fold cannot arrive without proving it writes.
 */
const EDITS = {
  tone: [() => "Bright, and quick to the point.", (next) => assert.equal(next.brain.profile.tone, "Bright, and quick to the point.")],
  hours: [
    (d) => ({ ...d, sun: { isOpen: true, shifts: [{ open: "10:00", close: "16:00" }] } }),
    (next) => assert.deepEqual(next.brain.profile.hours.sun, { open: "10:00", close: "16:00" }),
  ],
  closures: [
    (d) => [...d, { date: "2027-01-01", until: "", note: "  New Year  " }],
    (next) => assert.deepEqual(next.brain.profile.closures, [...STORED.brain.profile.closures, { date: "2027-01-01", note: "New Year" }]),
  ],
  services: [
    (d) => d.map((s, i) => (i === 1 ? { ...s, name: " Full highlights ", duration_min: "60" } : s)),
    (next) => assert.deepEqual(next.brain.profile.services, [STORED.brain.profile.services[0], { name: "Full highlights", duration_min: 60 }]),
  ],
  languages: [(d) => [...d, "Portuguese"], (next) => assert.deepEqual(next.brain.profile.languages, ["English", "Spanish", "Portuguese"])],
  notes: [
    (d) => [...d, { title: " Parking ", text: "Behind the building." }],
    (next) => assert.deepEqual(next.brain.profile.notes, [...STORED.brain.profile.notes, { title: "Parking", text: "Behind the building." }]),
  ],
  escalate_when: [
    (d) => `${d}\n  They mention a skin reaction  \n`,
    (next) => assert.deepEqual(next.brain.profile.escalate_when, [...STORED.brain.profile.escalate_when, "They mention a skin reaction"]),
  ],
  booking_rules: [
    (d) => ({ ...d, lead_hours: "24", buffer_min: "10" }),
    (next) => assert.deepEqual([next.brain.profile.booking_rules.lead_hours, next.brain.profile.booking_rules.buffer_min], [24, 10]),
  ],
  consult_first: [
    (d) => `${d}\nKeratin`,
    (next) => assert.deepEqual(next.brain.profile.booking_rules.consult_first, ["Color correction", "Extensions", "Keratin"]),
  ],
  guardrails: [
    (d) => ({ ...d, disclose_ai: false, vision: true }),
    (next) => assert.deepEqual([next.brain.profile.guardrails.disclose_ai, next.features.vision], [false, true]),
  ],
  extra_instructions: [
    (d) => ({ ...d, text: "  Parking is behind the building.  " }),
    (next) => {
      assert.equal(next.brain.profile.extra_instructions, "Parking is behind the building.");
      assert.equal(next.brain.system_prompt, newReceptionistDefaults(STORED.brain.business_name).system_prompt, "and the product's lines take the prompt's place (S4)");
    },
  ],
  fallbacks: [
    (d) => ({ ...d, error: "  Sorry, a person will reply here soon.  " }),
    (next) => assert.deepEqual(next.brain.fallbacks, { ...STORED.brain.fallbacks, error: "Sorry, a person will reply here soon." }),
  ],
  calendar: [
    () => " webcal://calendar.example.com/melany/new.ics ",
    (next) => assert.deepEqual(next.calendar, { ical_url: "webcal://calendar.example.com/melany/new.ics" }),
  ],
};
const FOLDS = Object.keys(EDITS);

/**
 * The folds that cannot write back exactly what they opened with, on this record, and why. Each is held to what
 * matters instead: the prompt the receptionist is given, on either channel, is the same before and after.
 */
const INEXACT = {
  hours: "A day the record leaves out is written as {}, the closed day the schema stores. Both are said as Closed.",
  guardrails: "The four switches are written out where the record left two to their defaults, which say the same.",
  extra_instructions: "The prompt carried into the box is kept as the owner's words, and the product's lines take its place (S4).",
};
/** What the receptionist is told, on both channels, at one moment: the edge's own resolver. */
const NOW = new Date("2026-09-21T15:00:00Z");
const told = (brain) => ["whatsapp", "voice"].map((channel) => resolveSystemPrompt(brain, channel, "America/New_York", NOW, {}, null));

/* ------------------------------------ what each fold owns ------------------------------------ */

test("every fold is named once, owns exactly its paths, and is a fold the bridge can say the consequence of", () => {
  assert.deepEqual(Object.keys(S.KEYS_OF).sort(), [...FOLDS].sort(), "the test's edits cover every fold the save file knows");
  assert.deepEqual(Object.keys(S.PATHS_OF).sort(), [...FOLDS].sort());
  assert.deepEqual(S.KEYS_OF, {
    tone: ["tone"], hours: ["hours"], closures: ["closures"], services: ["services"], languages: ["languages"],
    notes: ["notes"], escalate_when: ["escalate_when"], booking_rules: ["booking_rules"], consult_first: ["booking_rules"],
    guardrails: ["guardrails"], extra_instructions: ["extra_instructions"], fallbacks: [], calendar: [],
  });
  for (const fold of FOLDS) {
    // KEYS_OF says which keys of the profile a fold writes into; PATHS_OF says exactly where, in the whole config.
    const profileKeys = [...new Set(S.PATHS_OF[fold].filter((p) => p.startsWith("brain.profile.")).map((p) => p.split(".")[2]))];
    assert.deepEqual(S.KEYS_OF[fold], profileKeys, `${fold}: the two maps say the same thing`);
    assert.ok(Object.prototype.hasOwnProperty.call(FOLD_BLOCK, fold), `${fold} is a section consequenceOf knows`);
  }
  // Two folds share booking_rules, and neither owns the other's keys.
  assert.deepEqual(S.PATHS_OF.consult_first, ["brain.profile.booking_rules.consult_first"]);
  assert.ok(!S.PATHS_OF.booking_rules.includes("brain.profile.booking_rules.consult_first"));
  assert.deepEqual(
    S.PATHS_OF.booking_rules.map((p) => p.split(".").pop()).sort(),
    ["buffer_min", "lead_hours", "max_days_ahead", "notes", "party_max", "slot_min"],
  );
  assert.deepEqual(FOLDS.filter((f) => S.PATHS_OF[f].includes("brain.system_prompt")), ["extra_instructions"], "one fold owns the stored prompt");
  for (const helper of ["draftOf", "saveFold", "problemsOf"]) {
    assert.throws(() => S[helper]("not_a_fold", stored(), ""), { name: "TypeError", message: /"not_a_fold"/ }, helper);
    assert.throws(() => S[helper]("toString", stored(), ""), { name: "TypeError", message: /"toString"/ }, `${helper}: a name every object has is not a fold`);
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
    if (Array.isArray(v)) { v.forEach(scribble); v.push("scribbled"); return; }
    if (v && typeof v === "object") for (const k of Object.keys(v)) { if (v[k] && typeof v[k] === "object") scribble(v[k]); else v[k] = "scribbled"; }
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
  assert.deepEqual(S.draftOf("languages", s), ["English", "Spanish"]);
  assert.equal(S.draftOf("escalate_when", s), "They ask for Melany\nThey are upset, or have a complaint");
  assert.equal(S.draftOf("consult_first", s), "Color correction\nExtensions");
  assert.deepEqual(S.draftOf("booking_rules", s), { lead_hours: "2", slot_min: "30", buffer_min: "", max_days_ahead: "", party_max: "4", notes: "No bookings after 5pm on Saturdays" }, "numbers as the boxes hold them, and empty where there is no rule");
  assert.deepEqual(S.draftOf("services", s), STORED.brain.profile.services);
  assert.deepEqual(S.draftOf("closures", s), STORED.brain.profile.closures);
  assert.deepEqual(S.draftOf("notes", s), STORED.brain.profile.notes);
  assert.deepEqual(S.draftOf("fallbacks", s), STORED.brain.fallbacks);
  assert.equal(S.draftOf("calendar", s), STORED.calendar.ical_url);
  // The prompt from before the fields, carried into the box and marked so (contracts instructionsDraft, S4).
  assert.deepEqual(S.draftOf("extra_instructions", s), { text: STORED.brain.system_prompt, carried: true });
  // Three rules on unless one is switched off; the health rule and the photos only when switched on.
  assert.deepEqual(S.draftOf("guardrails", s), { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true, vision: false });
  const bare = stored();
  delete bare.brain.profile.guardrails;
  delete bare.features;
  assert.deepEqual(S.draftOf("guardrails", bare), { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: false, vision: false });
  // A record with none of it opens every fold empty, and the messages on the product's wording.
  const none = { brain: { business_name: "Bella Nails", booking_link: "https://bella.example/book", system_prompt: newReceptionistDefaults("Bella Nails").system_prompt } };
  assert.deepEqual(
    FOLDS.map((f) => [f, S.draftOf(f, none)]),
    [
      ["tone", ""],
      ["hours", Object.fromEntries(DAYS.map((d) => [d, { isOpen: false, shifts: [] }]))],
      ["closures", []], ["services", []], ["languages", []], ["notes", []], ["escalate_when", ""],
      ["booking_rules", { lead_hours: "", slot_min: "", buffer_min: "", max_days_ahead: "", party_max: "", notes: "" }],
      ["consult_first", ""],
      ["guardrails", { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: false, vision: false }],
      ["extra_instructions", { text: "", carried: false }],
      ["fallbacks", FALLBACK_DEFAULTS],
      ["calendar", ""],
    ],
  );
});

/* ------------------------------------ the edges ------------------------------------ */

test("an emptied field deletes its key, and nothing anywhere is stored as an empty string or an empty list", () => {
  const EMPTIED = {
    tone: [() => "   ", "brain.profile.tone"],
    hours: [(d) => Object.fromEntries(Object.entries(d).map(([day, v]) => [day, { ...v, isOpen: false }])), "brain.profile.hours"],
    closures: [() => [{ date: "  ", until: "", note: "never finished" }], "brain.profile.closures"],
    services: [(d) => d.map((s) => ({ ...s, name: "  " })), "brain.profile.services"],
    languages: [() => [], "brain.profile.languages"],
    notes: [() => [{ title: " ", text: "" }], "brain.profile.notes"],
    escalate_when: [() => "\n   \n", "brain.profile.escalate_when"],
    consult_first: [() => "  ", "brain.profile.booking_rules.consult_first"],
    extra_instructions: [(d) => ({ ...d, text: "   " }), "brain.profile.extra_instructions"],
    calendar: [() => "  ", "calendar"],
  };
  const found = (config, path) => path.split(".").reduce((o, k) => (o && typeof o === "object" && k in o ? o[k] : undefined), config);
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
  assert.deepEqual(draft.sat, { isOpen: true, shifts: [{ open: "09:30", close: "13:00" }, { open: "14:00", close: "19:00" }] });
  assert.deepEqual(draft.sun, { isOpen: false, shifts: [] });

  const edited = {
    ...draft,
    // Switched off, it keeps its times in the draft (the old form's toggleDay), and stores nothing.
    mon: { isOpen: false, shifts: draft.mon.shifts },
    tue: { isOpen: true, shifts: [{ open: "10:00", close: "12:00" }, { open: "", close: "" }] },
    wed: { isOpen: true, shifts: [{ open: "10:00", close: "" }] },
    thu: { isOpen: true, shifts: [{ open: "09:00", close: "12:00" }, { open: "13:00", close: "17:00" }, { open: "18:00", close: "20:00" }] },
  };
  const hours = S.saveFold("hours", stored(), edited).brain.profile.hours;
  assert.deepEqual(Object.keys(hours), DAYS, "every day is said, a closed one as {}");
  assert.deepEqual(hours.mon, {}, "switched off: nothing, though the draft kept its times");
  assert.deepEqual(hours.tue, { open: "10:00", close: "12:00" }, "one whole shift is open and close; the one left empty goes");
  assert.deepEqual(hours.wed, {}, "a day with no whole shift is closed");
  assert.deepEqual(hours.thu, { intervals: [{ open: "09:00", close: "12:00" }, { open: "13:00", close: "17:00" }, { open: "18:00", close: "20:00" }] });
  assert.deepEqual(hours.sat, STORED.brain.profile.hours.sat);
  assert.deepEqual(hours.sun, {});

  // Every day closed is no hours at all, rather than a week that reads as never open.
  const shut = Object.fromEntries(DAYS.map((d) => [d, { isOpen: false, shifts: draft[d].shifts }]));
  assert.equal("hours" in S.saveFold("hours", stored(), shut).brain.profile, false);

  // A week stored the way the form writes it, all seven days, is written back exactly.
  const seven = stored();
  seven.brain.profile.hours = { mon: { open: "09:30", close: "18:00" }, tue: { open: "09:30", close: "18:00" }, wed: {}, thu: { open: "09:30", close: "18:00" }, fri: { intervals: [{ open: "09:30", close: "13:00" }, { open: "14:00", close: "19:00" }] }, sat: { open: "10:00", close: "16:00" }, sun: {} };
  assert.deepEqual(S.saveFold("hours", structuredClone(seven), S.draftOf("hours", seven)), seven);
});

test("booking_rules and consult_first share one stored object, and each writes only its own of its keys", () => {
  const RULES = STORED.brain.profile.booking_rules;
  // The booking rules: each number inside its range, the notes from lines. The consult-first list and a rule added
  // later stay as stored, and a box left empty is no rule, never zero.
  const draft = { ...S.draftOf("booking_rules", stored()), lead_hours: "24", slot_min: "", buffer_min: " 15 ", max_days_ahead: "30", notes: "Deposit for colour\n\n  Cash or card  " };
  assert.deepEqual(S.saveFold("booking_rules", stored(), draft).brain.profile.booking_rules, {
    consult_first: RULES.consult_first, a_rule_added_later: "keep me",
    lead_hours: 24, buffer_min: 15, max_days_ahead: 30, party_max: 4, notes: ["Deposit for colour", "Cash or card"],
  });
  // A number outside its range is never written: problemsOf stops that save before it goes (below).
  assert.equal("lead_hours" in S.saveFold("booking_rules", stored(), { ...draft, lead_hours: "500" }).brain.profile.booking_rules, false);

  // Consult first: its lines, and every other rule as stored.
  assert.deepEqual(S.saveFold("consult_first", stored(), "Keratin\n  \n Balayage ").brain.profile.booking_rules, { ...RULES, consult_first: ["Keratin", "Balayage"] });
  assert.deepEqual(S.saveFold("consult_first", stored(), "").brain.profile.booking_rules, without(RULES, "consult_first"));
  // Where the fold's own keys were all booking_rules held, emptying them takes booking_rules with them.
  const onlyList = stored();
  onlyList.brain.profile.booking_rules = { consult_first: ["Keratin"] };
  assert.equal("booking_rules" in S.saveFold("consult_first", onlyList, "").brain.profile, false);
  const onlyRules = stored();
  onlyRules.brain.profile.booking_rules = { lead_hours: 2 };
  assert.equal("booking_rules" in S.saveFold("booking_rules", onlyRules, { ...S.draftOf("booking_rules", onlyRules), lead_hours: "" }).brain.profile, false);
  // And where there were none, the list makes them.
  const noRules = stored();
  delete noRules.brain.profile.booking_rules;
  assert.deepEqual(S.saveFold("consult_first", noRules, "Keratin").brain.profile.booking_rules, { consult_first: ["Keratin"] });

  // One after the other, each on the config the other left, as the saver sends them: both land, and the rest stays.
  const both = S.saveFold("consult_first", S.saveFold("booking_rules", stored(), draft), "Keratin").brain.profile.booking_rules;
  assert.deepEqual(both, { ...without(RULES, "slot_min"), lead_hours: 24, buffer_min: 15, max_days_ahead: 30, notes: ["Deposit for colour", "Cash or card"], consult_first: ["Keratin"] });
});

test("guardrails: four switches written, what else is stored beside them kept, and the photos written once touched or stored", () => {
  const draft = S.draftOf("guardrails", stored());
  const next = S.saveFold("guardrails", stored(), { ...draft, never_confirm_booking: false });
  assert.deepEqual(next.brain.profile.guardrails, { never_quote_prices: true, never_confirm_booking: false, disclose_ai: true, no_health_advice: true });
  assert.deepEqual(next.features, { vision: false }, "stored, so written");
  // Never touched and never stored, the photos switch writes nothing: an untouched workspace keeps no features at all.
  const untouched = stored();
  delete untouched.features;
  assert.equal("features" in S.saveFold("guardrails", untouched, S.draftOf("guardrails", untouched)), false);
  assert.deepEqual(S.saveFold("guardrails", untouched, { ...S.draftOf("guardrails", untouched), vision: true }).features, { vision: true });
  // A switch a newer form added, which this one does not draw, stays as it was stored.
  const newer = stored();
  newer.brain.profile.guardrails.a_switch_added_later = true;
  newer.features.a_feature_added_later = true;
  const kept = S.saveFold("guardrails", newer, { ...S.draftOf("guardrails", newer), vision: true });
  assert.equal(kept.brain.profile.guardrails.a_switch_added_later, true);
  assert.deepEqual(kept.features, { vision: true, a_feature_added_later: true });
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
  renamed.brain.business_name = "Melany's Salon & Spa";
  assert.equal(S.saveFold("extra_instructions", renamed, { text: "Our own words.", carried: false }).brain.system_prompt, newReceptionistDefaults("Melany's Salon & Spa").system_prompt);
});

test("fallbacks and the calendar write what the old form wrote: the three messages trimmed, and the feed or no calendar", () => {
  const messages = S.saveFold("fallbacks", stored(), { greeting: " Hello! ", error: "Sorry. ", non_text: " Thanks. " }).brain.fallbacks;
  assert.deepEqual(messages, { greeting: "Hello!", error: "Sorry.", non_text: "Thanks." });
  const newer = stored();
  newer.brain.fallbacks.a_message_added_later = "keep me";
  assert.equal(S.saveFold("fallbacks", newer, S.draftOf("fallbacks", newer)).brain.fallbacks.a_message_added_later, "keep me", "a message a newer form added stays");
  // A workspace set up before the messages existed opens on the product's wording, and saves it.
  const none = stored();
  delete none.brain.fallbacks;
  assert.deepEqual(S.saveFold("fallbacks", none, S.draftOf("fallbacks", none)).brain.fallbacks, FALLBACK_DEFAULTS);

  assert.deepEqual(S.saveFold("calendar", stored(), "https://calendar.example.com/new.ics").calendar, { ical_url: "https://calendar.example.com/new.ics" });
  assert.equal("calendar" in S.saveFold("calendar", stored(), ""), false, "emptied, the section goes");
  const noFeed = stored();
  delete noFeed.calendar;
  assert.deepEqual(S.saveFold("calendar", noFeed, ""), noFeed, "and with none stored, nothing is written");
});

/* ------------------------------------ what stops a save ------------------------------------ */

test("problemsOf says the old form's sentences, but for what an empty box means, each under the field it is about", () => {
  // The booking rules' ranges, each at both ends and past them.
  const rules = S.draftOf("booking_rules", stored());
  const ranges = [
    // The old form's said "leave it empty for no rule" of the least notice and the days ahead, each of which has a
    // default (BOOKING_DEFAULTS): the refusal says it, as the box's hint does.
    ["lead_hours", ["-1", "169", "soon"], ["0", "168"], "Least notice is 0 to 168 hours; leave it empty to use 2 hours."],
    ["slot_min", ["14", "241"], ["15", "240"], "A slot is 15 to 240 minutes; leave it empty for the calendar’s 30 minutes."],
    ["buffer_min", ["-1", "121"], ["0", "120"], "The gap is 0 to 120 minutes; leave it empty for none."],
    ["max_days_ahead", ["0", "91"], ["1", "90"], "Times are offered 1 to 90 days ahead; leave it empty to use 14 days."],
    ["party_max", ["0", "21"], ["1", "20"], "A booking is for 1 to 20 people; leave it empty for no rule."],
  ];
  for (const [key, bad, good, words] of ranges) {
    for (const v of bad) assert.deepEqual(S.problemsOf("booking_rules", { ...rules, [key]: v }), { [key]: words }, `${key} ${v}`);
    for (const v of [...good, "", "  "]) assert.deepEqual(S.problemsOf("booking_rules", { ...rules, [key]: v }), {}, `${key} ${JSON.stringify(v)}`);
  }
  // Every problem at once, each under its own box (S22): the save used to stop at the first.
  assert.deepEqual(Object.keys(S.problemsOf("booking_rules", { ...rules, lead_hours: "500", slot_min: "5", party_max: "0" })), ["lead_hours", "slot_min", "party_max"]);

  // A note needs both its title and its text; one with neither is dropped, not refused.
  const half = "Each note needs both a title and the text to say.";
  assert.deepEqual(
    S.problemsOf("notes", [{ title: "Parking", text: " " }, { title: "Wi-Fi", text: "Ask at the desk." }, { title: "", text: "No title" }, { title: " ", text: "" }]),
    { "note-0": half, "note-2": half },
  );

  // As much as the receptionist takes, and the space around the words is not counted.
  assert.deepEqual(S.problemsOf("extra_instructions", { text: "x".repeat(INSTRUCTIONS_MAX + 1), carried: false }), { extra_instructions: "At most 20,000 characters — this is 20,001." });
  assert.deepEqual(S.problemsOf("extra_instructions", { text: ` ${"x".repeat(INSTRUCTIONS_MAX)} `, carried: false }), {});

  // Each message: nothing to send, more than a message holds, or a name nothing fills in.
  const messages = S.draftOf("fallbacks", stored());
  assert.deepEqual(S.problemsOf("fallbacks", { ...messages, error: "  " }), { error: "Write this message, or use the default wording." });
  assert.deepEqual(S.problemsOf("fallbacks", { ...messages, greeting: "x".repeat(2001) }), { greeting: "At most 2,000 characters — this is 2,001." });
  assert.deepEqual(
    S.problemsOf("fallbacks", { ...messages, non_text: "Call us at {phone number}." }),
    { non_text: "Only {business}, {booking link} and {phone} are filled in — {phone number} would be sent as written." },
  );
  assert.deepEqual(S.problemsOf("fallbacks", { greeting: "", error: "", non_text: "" }), {
    greeting: "Write this message, or use the default wording.",
    error: "Write this message, or use the default wording.",
    non_text: "Write this message, or use the default wording.",
  });
  assert.deepEqual(S.problemsOf("fallbacks", { ...messages, non_text: "x".repeat(2000) }), {}, "2,000 is as much as a message holds");

  // The calendar feed, an address the receptionist can read.
  assert.deepEqual(S.problemsOf("calendar", "calendar"), { ical_url: "The calendar feed needs to be a full address, starting with https:// or webcal://" });
  for (const ok of ["", "  ", "https://calendar.example.com/a.ics", "webcal://calendar.example.com/a.ics"]) assert.deepEqual(S.problemsOf("calendar", ok), {}, ok);

  // Nothing for a good draft: every fold, as it opens on the record.
  for (const fold of FOLDS) assert.deepEqual(S.problemsOf(fold, S.draftOf(fold, stored())), {}, fold);
});

/* ------------------------------------ through the tab's one saver ------------------------------------ */

test("a fold's save goes through the tab's one saver as a patch of the whole config, on the config current when it goes", () => {
  const saver = S.saver;
  W.__SETTINGS = { version: 7, config: stored() };
  const sent = [];
  W.__saveSettings = (config, version, accepted) => {
    sent.push({ config: structuredClone(config), version });
    accepted({ config: structuredClone(config), version: version + 1 });
    return new Promise(() => {});
  };
  saver.reset();
  try {
    const job = (fold, draft) => ({ row: fold, patch: (config) => S.saveFold(fold, config, draft), said: "Saved", done: () => {}, flash: () => {} });
    const rules = { ...S.draftOf("booking_rules", stored()), lead_hours: "24" };
    // What the fold will say is worked out on the saver's base with the same helper its save sends.
    const preview = S.saveFold("booking_rules", saver.base(), rules);
    saver.save(job("booking_rules", rules));
    assert.deepEqual(sent[0].config, preview, "the save is what the preview described");
    saver.save(job("consult_first", "Keratin"));
    saver.save(job("calendar", ""));
    assert.deepEqual(sent.map((s) => s.version), [7, 8, 9], "each on the answer to the one before");
    const last = sent[2].config;
    assert.deepEqual(last.brain.profile.booking_rules, { ...STORED.brain.profile.booking_rules, lead_hours: 24, consult_first: ["Keratin"] });
    assert.equal("calendar" in last, false);
    assert.deepEqual(withoutPaths(last, [...S.PATHS_OF.booking_rules, ...S.PATHS_OF.consult_first, ...S.PATHS_OF.calendar]), withoutPaths(STORED, [...S.PATHS_OF.booking_rules, ...S.PATHS_OF.consult_first, ...S.PATHS_OF.calendar]));
    // A fold opened and saved with no change sends nothing: the saver's own test, on a patch that writes what is there.
    saver.save(job("consult_first", "Keratin"));
    assert.equal(sent.length, 3);
  } finally {
    saver.reset();
    delete W.__SETTINGS;
    delete W.__saveSettings;
  }
});

/* ------------------------------------ a fold's save, through the tab's one saver ------------------------------------ */

const settle = () => new Promise((r) => setImmediate(r));
/** The door the saver sends through, held open: each send waits to be accepted or refused by the test. */
const door = () => {
  const sent = [];
  W.__saveSettings = (config, version, onAccepted) => {
    const call = { config, version };
    sent.push(call);
    return new Promise((resolve) => {
      call.accept = () => { W.__SETTINGS = { config, version: version + 1 }; onAccepted({ config, version: version + 1 }); resolve({ ok: true }); };
      call.refuse = (message) => resolve({ ok: false, message });
    });
  };
  return sent;
};
const read = (config, version = 7) => { S.saver.reset(); W.__SETTINGS = { config: structuredClone(config), version }; };
const said = () => { const toasts = []; return { toasts, flash: (t) => toasts.push(t) }; };
const wordsOf = (n) => (n == null || typeof n === "boolean" ? "" : typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(wordsOf).join("") : wordsOf(n.props?.children));

/** A record with a hand-written prompt and nothing the resolver composes from: the class of record that lost its prompt. */
const PROMPT_ONLY = {
  brain: {
    business_name: "Northside Studio",
    booking_link: "https://northside.example/book",
    system_prompt: "You are the front desk of Northside Studio. ".repeat(30).trim(),
    fallbacks: { greeting: "Hi!", error: "Sorry.", non_text: "Thanks." },
  },
};

for (const record of [["a full record", STORED], ["a record that is only its hand-written prompt", PROMPT_ONLY]]) {
  test(`opened and saved with nothing changed, no fold sends anything, on ${record[0]}`, async () => {
    for (const fold of FOLDS) {
      read(record[1]);
      const sent = door();
      const base = S.saver.base();
      const opened = S.draftOf(fold, base);
      assert.equal(S.holdsChanges(fold, base, S.draftOf(fold, base)), false, `${fold}: a draft as it opened holds no changes`);
      let closed = 0;
      S.saver.save(S.foldJob(fold, S.draftOf(fold, base), { opened, said: "Saved", done: () => { closed += 1; }, flash: () => {} }));
      await settle();
      assert.equal(sent.length, 0, `${fold}: nothing to send, so nothing sent -- no new version, no "last changed by"`);
      assert.equal(closed, 1, `${fold}: and the fold closes, as after any save`);
    }
  });
}

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
  S.saver.save(S.foldJob("languages", langs, { opened: S.draftOf("languages", base2), said: "Saved", flash: () => {} }));
  assert.equal(sent.length, 1, "one at a time");
  sent[0].accept();
  await settle();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].version, 8, "on the version the server answered with");
  assert.equal(sent[1].config.brain.profile.tone, tone, "REGRESSION guard: built on the config at send time, never on the one the fold opened with");
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
  W.__SETTINGS = { config: theirs, version: 8 };
  const a = said();
  let closed = 0;
  S.saver.save(S.foldJob("services", draft, { opened, said: "Saved", done: () => { closed += 1; }, flash: a.flash }));
  await settle();
  assert.equal(sent.length, 0, "REGRESSION guard: sent, it would have put the list back as it was and taken Keratin with it");
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
  W.__SETTINGS = { config: voiced, version: 8 };
  S.saver.save(S.foldJob("services", draft, { opened: opened2, said: "Saved", flash: () => {} }));
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].version, 8);
  assert.equal(sent[0].config.brain.profile.tone, "Formal.");
  assert.equal(sent[0].config.brain.profile.services[0].name, "Full balayage");
});

test("a fold's job needs the draft it opened with, and a fold's name", () => {
  assert.throws(() => S.foldJob("services", [], { said: "Saved", flash: () => {} }), { name: "TypeError", message: /opened/ });
  assert.throws(() => S.foldJob("not_a_fold", [], { opened: [], flash: () => {} }), { name: "TypeError", message: /"not_a_fold"/ });
});

test("a patch that cannot run is said and dropped: it never throws to the page drawing or to the save behind it", async () => {
  read(STORED);
  const sent = door();
  const a = said();
  // Nothing out: the caller is not thrown at, the owner is told, and the job is gone.
  assert.doesNotThrow(() => S.saver.save({ row: "services", patch: () => { throw new Error("boom"); }, said: "Saved", flash: a.flash }));
  assert.equal(sent.length, 0);
  assert.equal(a.toasts.length, 1);
  assert.equal(a.toasts[0].tone, "danger");
  assert.equal(S.saver.pending("services"), false);

  // Queued behind a save that is out: the page can still draw (base() skips it), and once the first is taken the bad
  // one is said and dropped, and the one behind it still goes.
  const b = said();
  S.saver.save(S.foldJob("tone", "Bright.", { opened: S.draftOf("tone", S.saver.base()), said: "Saved", flash: () => {} }));
  S.saver.save({ row: "services", patch: () => null, said: "Saved", flash: b.flash });
  S.saver.save(S.foldJob("languages", ["English"], { opened: S.draftOf("languages", S.saver.base()), said: "Saved", flash: () => {} }));
  assert.doesNotThrow(() => S.saver.base(), "REGRESSION guard: base() ran every queued patch on every render, and one that threw took the page down");
  assert.equal(S.saver.base().brain.profile.tone, "Bright.");
  assert.deepEqual(S.saver.base().brain.profile.languages, ["English"]);
  sent[0].accept();
  await settle();
  assert.equal(b.toasts.length, 1, "a patch that returns no config is said, the same way");
  assert.equal(b.toasts[0].tone, "danger");
  assert.equal(sent.length, 2, "REGRESSION guard: the throw inside the accepted save's callback stopped the queue and skipped the re-read");
  assert.deepEqual(sent[1].config.brain.profile.languages, ["English"]);
});

test("a fold that throws as it closes, or a toast that throws, does not stop the queue", async () => {
  read(STORED);
  const sent = door();
  S.saver.save(S.foldJob("tone", "Bright.", { opened: S.draftOf("tone", S.saver.base()), said: "Saved", done: () => { throw new Error("closing"); }, flash: () => { throw new Error("toast"); } }));
  S.saver.save(S.foldJob("languages", ["English"], { opened: S.draftOf("languages", S.saver.base()), said: "Saved", flash: () => {} }));
  sent[0].accept();
  await settle();
  assert.equal(sent.length, 2);
});

test("a reset forgets a save that is out: its answer closes nothing and says nothing afterwards", async () => {
  read(STORED);
  const sent = door();
  const a = said();
  let closed = 0;
  S.saver.save(S.foldJob("tone", "Bright.", { opened: S.draftOf("tone", S.saver.base()), said: "Saved", done: () => { closed += 1; }, flash: a.flash }));
  S.saver.reset();
  sent[0].accept();
  await settle();
  assert.equal(closed, 0);
  assert.equal(a.toasts.length, 0);
});

/* ------------------------------------ what a draft may not be ------------------------------------ */

test("a rules draft, or a messages draft, with a part missing is a TypeError naming it: absent is never written as off", () => {
  const rules = S.draftOf("guardrails", stored());
  assert.throws(() => S.saveFold("guardrails", stored(), without(rules, "never_quote_prices")), { name: "TypeError", message: /never_quote_prices/ });
  assert.throws(() => S.saveFold("guardrails", stored(), without(rules, "vision")), { name: "TypeError", message: /vision/ });
  const messages = S.draftOf("fallbacks", stored());
  assert.throws(() => S.saveFold("fallbacks", stored(), without(messages, "error")), { name: "TypeError", message: /error/ });
});

test("a booking rule typed as anything but a whole number is refused with its rule's sentence, never read as its first digits", () => {
  const draft = S.draftOf("booking_rules", stored());
  for (const typed of ["2.5", "30min", "1e2", "-1"]) {
    const found = S.problemsOf("booking_rules", { ...draft, lead_hours: typed });
    assert.equal(found.lead_hours, "Least notice is 0 to 168 hours; leave it empty to use 2 hours.", typed);
  }
  assert.deepEqual(S.problemsOf("booking_rules", { ...draft, lead_hours: " 24 " }), {});
});

test("a day stored both ways opens with every stretch it states, and a shift typed half-way is said under its day", () => {
  const both = stored();
  both.brain.profile.hours.mon = { open: "09:30", close: "13:00", intervals: [{ open: "14:00", close: "18:00" }] };
  const week = S.draftOf("hours", both);
  assert.deepEqual(week.mon.shifts, [{ open: "09:30", close: "13:00" }, { open: "14:00", close: "18:00" }], "REGRESSION guard: the intervals won, and the morning went on an unchanged save");
  const next = S.saveFold("hours", both, week);
  assert.deepEqual(told(next.brain), told(both.brain), "what the receptionist is told about Monday is unchanged");

  const half = S.draftOf("hours", stored());
  half.tue = { isOpen: true, shifts: [{ open: "09:00", close: "" }] };
  assert.deepEqual(S.problemsOf("hours", half), { "hours-tue": "Tuesday needs both an opening and a closing time, or neither." });
  // A shift left empty BESIDE one that is filled in is a row nobody filled in: dropped, as before.
  half.tue = { isOpen: true, shifts: [{ open: "09:00", close: "12:00" }, { open: "", close: "" }] };
  assert.deepEqual(S.problemsOf("hours", half), {});
  // But a day switched on with no times at all is not an open day: the save writes it as closed, so the week "changed
  // nothing" and the fold closed without a word, the switch the owner pressed gone with it. Said under the day, in the
  // page's words (the schema has none: a day with no times is a closed day to it).
  for (const shifts of [[{ open: "", close: "" }], [], [{ open: " ", close: "" }, { open: "", close: "" }]]) {
    half.tue = { isOpen: true, shifts };
    assert.deepEqual(S.problemsOf("hours", half), { "hours-tue": "Tuesday is switched on with no times. Give it an opening and a closing time, or switch it off." });
  }
  // Half a shift is the more exact sentence, and wins; a day switched off is asked nothing, whatever it keeps.
  half.tue = { isOpen: true, shifts: [{ open: "09:00", close: "" }, { open: "", close: "" }] };
  assert.deepEqual(S.problemsOf("hours", half), { "hours-tue": "Tuesday needs both an opening and a closing time, or neither." });
  half.tue = { isOpen: false, shifts: [{ open: "", close: "" }] };
  assert.deepEqual(S.problemsOf("hours", half), {});
  // No week a fold opens with trips it: a stored day is open only when it states times.
  assert.deepEqual(S.problemsOf("hours", S.draftOf("hours", stored())), {});
  assert.deepEqual(S.problemsOf("hours", S.draftOf("hours", {})), {});
});

test("what the save's schema would refuse for its length or count is said first, under its field, in the page's words", () => {
  const L = S.LIMITS;
  assert.deepEqual([L.notes, L.services, L.languages, L.reasons], [10, 60, 8, 20], "the counts the schema allows, published once for the folds");
  const services = S.draftOf("services", stored());
  services[1] = { name: "x".repeat(81), duration_min: "2000", price_note: "y".repeat(121) };
  assert.deepEqual(Object.keys(S.problemsOf("services", services)).sort(), ["service-1-duration_min", "service-1-name", "service-1-price_note"]);
  assert.deepEqual(Object.keys(S.problemsOf("tone", "t".repeat(201))), ["tone"]);
  assert.deepEqual(Object.keys(S.problemsOf("languages", ["English", "E"])), ["languages"]);
  assert.deepEqual(Object.keys(S.problemsOf("languages", Array.from({ length: 9 }, (_, i) => `Language ${i}`))), ["languages"]);
  assert.deepEqual(Object.keys(S.problemsOf("escalate_when", Array.from({ length: 21 }, (_, i) => `Reason ${i}`).join("\n"))), ["escalate_when"]);
  assert.deepEqual(Object.keys(S.problemsOf("consult_first", "c".repeat(81))), ["consult_first"]);
  assert.deepEqual(Object.keys(S.problemsOf("notes", Array.from({ length: 11 }, (_, i) => ({ title: `Note ${i}`, text: "Words." })))), ["notes"]);
  for (const fold of FOLDS) assert.deepEqual(S.problemsOf(fold, S.draftOf(fold, stored())), {}, `${fold}: the stored record has no problems`);
});

test("the calendar's address is written onto its section, never in place of it", () => {
  const withMore = stored();
  withMore.calendar.a_setting_added_later = "keep me";
  const next = S.saveFold("calendar", withMore, "webcal://calendar.example.com/new.ics");
  assert.deepEqual(next.calendar, { ical_url: "webcal://calendar.example.com/new.ics", a_setting_added_later: "keep me" });
  assert.equal(S.saveFold("calendar", stored(), "").calendar, undefined, "emptied, with nothing else in it, the section goes");
  assert.deepEqual(S.PATHS_OF.calendar, ["calendar.ical_url"]);
});

test("a fold saved onto a config with no brain, or no profile, writes nothing it has no value for", () => {
  assert.deepEqual(S.saveFold("tone", {}, ""), {}, "REGRESSION guard: an emptied voice wrote { brain: {} } onto a config with no brain");
  assert.deepEqual(S.saveFold("services", { brain: { business_name: "N" } }, []), { brain: { business_name: "N" } }, "and no empty profile is left behind");
  const draft = S.draftOf("services", stored());
  const next = S.saveFold("services", stored(), draft);
  draft[0].name = "changed after the save was built";
  assert.equal(next.brain.profile.services[0].name, "Balayage", "what was built holds nothing of the draft it was built from");
});

/* ------------------------------------ what only the save's schema can judge ------------------------------------ */

/**
 * The record as the save would take it. STORED carries two keys no form renders, to prove every fold leaves them be;
 * the save's schema is strict and refuses both, so what it judges here is the record without them.
 */
const taken = () => {
  const config = stored();
  delete config.brain.profile.a_key_no_form_renders;
  delete config.brain.profile.booking_rules.a_rule_added_later;
  return config;
};

test("what only the save's schema can judge is said under the fold's own field, in the schema's words", () => {
  // Two shifts that overlap: no one box is wrong, so the old form said nothing and the server named no field.
  const week = S.draftOf("hours", taken());
  week.mon = { isOpen: true, shifts: [{ open: "09:00", close: "13:00" }, { open: "12:00", close: "18:00" }] };
  assert.deepEqual(S.problemsOf("hours", week), {}, "nothing the page's own checks can see");
  assert.deepEqual(S.schemaProblems("hours", taken(), week), { "hours-mon": "Monday: two shifts overlap." });

  // A row's place in the DRAFT, not in what is written: the empty first row is dropped before the save's schema sees it.
  const closures = [{ date: "", note: "" }, { date: "2099-11-31", note: "No such day" }];
  assert.deepEqual(Object.keys(S.schemaProblems("closures", taken(), closures)), ["closure-1-date"]);
  const services = [{ name: "" }, { name: "Cut", duration_min: "45" }, { name: "Colour", duration_min: "0" }];
  assert.deepEqual(S.schemaProblems("services", taken(), services), {}, "a duration of nothing is no duration, as it always was");

  // The calendar's part is judged alone: the brain is not the fold's.
  assert.deepEqual(Object.keys(S.schemaProblems("calendar", taken(), "https://localhost/feed.ics")), ["ical_url"]);

  for (const fold of FOLDS) assert.deepEqual(S.schemaProblems(fold, taken(), S.draftOf(fold, taken())), {}, `${fold}: the stored record is one the save would take`);
});

test("a refusal that is not this fold's to fix is said once, as elsewhere, naming where", () => {
  const bad = taken();
  bad.brain.profile.hours.mon = { open: "18:00", close: "09:00" };
  const found = S.schemaProblems("tone", bad, "Bright.");
  assert.deepEqual(Object.keys(found), ["elsewhere"]);
  assert.match(found.elsewhere, /Monday/);
  // Without the bridge (the standalone mockup before it loads, a test that never installed it) there is nothing to ask.
  const tab = W.__businessTab;
  W.__businessTab = undefined;
  try { assert.deepEqual(S.schemaProblems("tone", bad, "Bright."), {}); } finally { W.__businessTab = tab; }
});

/* ------------------------------------ the re-review's refinements ------------------------------------ */

test("a draft with nothing left to write is never refused: the owner's own earlier save, or a colleague's identical one, changed it", async () => {
  // A colleague saved exactly what this draft holds. Nothing to write, so nothing to refuse: the fold closes.
  read(STORED);
  let sent = door();
  const opened = S.draftOf("tone", S.saver.base());
  const theirs = structuredClone(STORED);
  theirs.brain.profile.tone = "Bright.";
  W.__SETTINGS = { config: theirs, version: 8 };
  const a = said();
  let closed = 0;
  S.saver.save(S.foldJob("tone", "Bright.", { opened, said: "Saved", done: () => { closed += 1; }, flash: a.flash }));
  await settle();
  assert.deepEqual([sent.length, closed, a.toasts.length], [0, 1, 0], "REGRESSION guard: refused as changed after it opened, though nothing of theirs would have been lost");

  // A fold that stays open after its own save is taken, and saves the same draft again with the draft it first opened with.
  read(STORED);
  sent = door();
  const first = S.draftOf("tone", S.saver.base());
  const b = said();
  S.saver.save(S.foldJob("tone", "Bright.", { opened: first, said: "Saved", flash: b.flash }));
  sent[0].accept();
  await settle();
  S.saver.save(S.foldJob("tone", "Bright.", { opened: first, said: "Saved", flash: b.flash }));
  await settle();
  assert.equal(sent.length, 1, "the second has nothing to write");
  assert.deepEqual(b.toasts.map((t) => t.tone), [undefined], "and is not told its own save was somebody else's");
});

test("a service's minutes are digits or refused, as a booking rule's are, and an empty or zero box is no duration", () => {
  const services = [{ name: "Cut", duration_min: "1.5" }, { name: "Colour", duration_min: "45min" }, { name: "Blowout", duration_min: " 45 " }, { name: "Consult", duration_min: "" }, { name: "Walk-in", duration_min: "0" }];
  assert.deepEqual(S.problemsOf("services", services), {
    "service-0-duration_min": "Minutes are a whole number, like 45.",
    "service-1-duration_min": "Minutes are a whole number, like 45.",
  });
  const written = S.saveFold("services", stored(), services.slice(2)).brain.profile.services;
  assert.deepEqual(written, [{ name: "Blowout", duration_min: 45 }, { name: "Consult" }, { name: "Walk-in" }]);
});

test("the sentence for a shift typed half-way is the save's own, held to it", () => {
  const half = S.draftOf("hours", taken());
  half.tue = { isOpen: true, shifts: [{ open: "09:00", close: "" }] };
  const brain = taken().brain;
  brain.profile.hours = { ...brain.profile.hours, tue: { open: "09:00" } };
  const schemas = W.__businessTab.saveIssues({ brain }).map((i) => i.message);
  assert.deepEqual(schemas, [S.problemsOf("hours", half)["hours-tue"]], "one sentence, in two places: this holds them together");
});

test("saveProblems is the one question a fold asks before it saves: the page's own sentence wins, and the schema's raw wording never reaches the owner", () => {
  const services = S.draftOf("services", taken());
  services[0] = { ...services[0], name: "x".repeat(81) };
  const found = S.saveProblems("services", taken(), services);
  assert.deepEqual(Object.keys(found), ["service-0-name"]);
  assert.equal(found["service-0-name"], S.problemsOf("services", services)["service-0-name"], "REGRESSION guard: merged the other way, the owner read zod's \"Too big: expected string...\"");
  // Nothing of the page's own to say, and the schema's is its own sentence: said as the schema says it.
  const week = S.draftOf("hours", taken());
  week.mon = { isOpen: true, shifts: [{ open: "09:00", close: "13:00" }, { open: "12:00", close: "18:00" }] };
  assert.deepEqual(S.saveProblems("hours", taken(), week), { "hours-mon": "Monday: two shifts overlap." });
  // A refusal in the schema's default wording is said in the page's words instead.
  const feed = S.saveProblems("calendar", taken(), `https://calendar.example.com/${"a".repeat(2100)}.ics`);
  assert.deepEqual(Object.keys(feed), ["ical_url"]);
  assert.doesNotMatch(feed.ical_url, /Too big|Invalid|expected/);
  assert.deepEqual(S.saveProblems("tone", taken(), "Bright."), {});
});

/* ------------------------------------ what a save will say ------------------------------------ */

// The settings read's own preview, built as the server builds it: willSay resolves a draft with its inputs.
const { composePromptPreview } = await import("../../../apps/dashboard/src/server/prompt-preview.ts");
const previewed = (config) => {
  W.__SETTINGS = {
    version: 7,
    config,
    prompt: composePromptPreview(config.brain, { tz: "America/New_York", policy: {}, known: { workspace: { name: "Melany's Beauty Salon", timezone: "America/New_York" }, channels: [], listing: null }, openings: null }),
  };
  return config;
};
const linesOf = (text) => (text ? text.split("\n").filter((l) => l.trim() !== "") : []);

test("one helper says what a row's or a fold's save will tell the receptionist: what comes, what goes, the whole block, and the crossing", () => {
  try {
    const base = previewed(taken());
    const tab = W.__businessTab;
    const blockOf = (brain) => tab.consequenceOf("hours", brain, "whatsapp");

    // A fold's draft, written as its save writes it: Monday closes an hour earlier.
    const week = S.draftOf("hours", base);
    week.mon = { isOpen: true, shifts: [{ open: "09:30", close: "17:00" }] };
    const next = S.saveFold("hours", base, week).brain;
    const will = S.willSay({ was: base.brain, next, sections: "hours", channel: "whatsapp" });
    assert.equal(will.whole, blockOf(next).text, "the whole block as the save would leave it, in the composer's own words");
    assert.match(will.whole, /17:00/);
    // And its share of the prompt, in characters, for a list too long to quote whole (the services sheet's foot).
    assert.equal(will.chars, blockOf(next).chars);
    // Over the whole prompt the draft would give it: the prompt after the save, as the block is.
    assert.equal(will.total, blockOf(next).total);
    assert.equal(will.total, resolveSystemPrompt(next, "whatsapp", W.__SETTINGS.prompt.tz, new Date(), W.__SETTINGS.prompt.inputs.policy, W.__SETTINGS.prompt.inputs.known).length);
    assert.deepEqual([will.added, will.removed, will.note], [null, null, null], "the hours' lines are runs (the test below), so none is said to come or go while the block stays; and no line crossed");
    // A block whose lines are facts says each that comes and goes: a closed day added is one line that comes.
    const days = S.draftOf("closures", base);
    days.push({ date: "2099-07-04", note: "Independence Day" });
    const more = S.willSay({ was: base.brain, next: S.saveFold("closures", base, days).brain, sections: "closures", channel: "whatsapp" });
    assert.deepEqual([linesOf(more.added).length, more.removed], [1, null], "one line comes, none goes");
    assert.match(more.added, /Independence Day/);

    // Unchanged, a fold still shows its block, and nothing comes or goes.
    const same = S.willSay({ was: base.brain, next: S.saveFold("hours", base, S.draftOf("hours", base)).brain, sections: "hours", channel: "whatsapp" });
    assert.deepEqual([same.added, same.removed, same.note], [null, null, null]);
    assert.equal(same.whole, blockOf(base.brain).text);

    // A block the save takes away whole goes line by line: every day closed, on a record that still composes.
    const shut = S.draftOf("hours", base);
    DAYS.forEach((d) => { shut[d] = { isOpen: false, shifts: shut[d].shifts }; });
    const closed = S.saveFold("hours", base, shut).brain;
    assert.equal("hours" in closed.profile, false);
    const gone = S.willSay({ was: base.brain, next: closed, sections: "hours", channel: "whatsapp" });
    assert.deepEqual([gone.whole, gone.added, gone.note, gone.chars, gone.total], [null, null, null, null, null]);
    assert.deepEqual(linesOf(gone.removed), linesOf(blockOf(base.brain).text), "showing only what a save adds hid that the week goes");

    // No channel that reads the words: nothing is resolved, and nothing is claimed.
    assert.deepEqual(S.willSay({ was: base.brain, next, sections: "hours", channel: null }), { note: null, added: null, removed: null, whole: null, chars: null, total: null });
    // A draft the save's own schema refuses: nothing true can be said of a save that will not go, and a block that is
    // null for THAT reason must not read as one the save takes away.
    const overlap = S.draftOf("hours", base);
    overlap.mon = { isOpen: true, shifts: [{ open: "09:00", close: "13:00" }, { open: "12:00", close: "18:00" }] };
    assert.equal(S.willSay({ was: base.brain, next: S.saveFold("hours", base, overlap).brain, sections: "hours", channel: "whatsapp" }), null);
    assert.equal(S.willSay({ was: null, next, sections: "hours", channel: "whatsapp" }), null);
  } finally {
    delete W.__SETTINGS;
  }
});

test("a save that crosses the resolver's line says so, whichever gesture sends it, and lists no one block's lines for a record that stops composing", () => {
  try {
    // The week is the one thing this record composes from.
    const sparse = { brain: { ...taken().brain, profile: { hours: { mon: { open: "09:30", close: "18:00" } }, guardrails: { never_quote_prices: true }, handoff_number: "+16469325775" } } };
    assert.equal(hasProfile(sparse.brain.profile), true);
    const base = previewed(sparse);
    const shut = S.draftOf("hours", base);
    shut.mon = { isOpen: false, shifts: shut.mon.shifts };
    const stops = S.willSay({ was: base.brain, next: S.saveFold("hours", base, shut).brain, sections: "hours", channel: "whatsapp" });
    assert.match(stops.note, /stops being given the details on this page/);
    assert.deepEqual([stops.whole, stops.added, stops.removed], [null, null, null], "everything composed goes, and the sentence says all of it");

    // The other way: the first field a record composes from, with every line of the block it starts.
    const bare = previewed({ brain: { ...taken().brain, profile: { guardrails: { never_quote_prices: true } } } });
    const opened = S.draftOf("hours", bare);
    opened.mon = { isOpen: true, shifts: [{ open: "09:30", close: "18:00" }] };
    const starts = S.willSay({ was: bare.brain, next: S.saveFold("hours", bare, opened).brain, sections: "hours", channel: "whatsapp" });
    assert.match(starts.note, /starts being given the details on this page/);
    assert.equal(starts.added, linesOf(starts.whole).join("\n"), "every line of the block is new");
  } finally {
    delete W.__SETTINGS;
  }
});

test("each block of the brain a save goes on is resolved once for that brain, by channel and block, and again for a new base", () => {
  const tab = W.__businessTab;
  const real = tab.consequenceOf;
  const asked = [];
  try {
    const base = previewed(taken());
    tab.consequenceOf = (block, brain, channel) => { asked.push([block, channel, brain === base.brain ? "base" : "next"]); return real(block, brain, channel); };
    const nextOf = (close) => { const w = S.draftOf("hours", base); w.mon = { isOpen: true, shifts: [{ open: "09:30", close }] }; return S.saveFold("hours", base, w).brain; };
    // Three keystrokes on one base: the base's block once, the draft's each time.
    for (const close of ["17:00", "17:30", "17:45"]) S.willSay({ was: base.brain, next: nextOf(close), sections: "hours", channel: "whatsapp" });
    assert.deepEqual(asked.filter((a) => a[2] === "base"), [["hours", "whatsapp", "base"]]);
    assert.equal(asked.filter((a) => a[2] === "next").length, 3);
    // Another channel is another block of the same brain; another row's block, another again.
    S.willSay({ was: base.brain, next: nextOf("17:00"), sections: "hours", channel: "voice" });
    S.willSay({ was: base.brain, next: nextOf("17:00"), sections: ["hours", "closures"], channel: "voice" });
    assert.deepEqual(asked.filter((a) => a[2] === "base").map((a) => a.slice(0, 2)), [["hours", "whatsapp"], ["hours", "voice"], ["closures", "voice"]]);
    // A new base (a save taken, a newer read) forgets them all: what was resolved describes a brain that is gone.
    const moved = structuredClone(base);
    asked.length = 0;
    tab.consequenceOf = (block, brain, channel) => { asked.push([block, channel, brain === moved.brain ? "base" : "next"]); return real(block, brain, channel); };
    S.willSay({ was: moved.brain, next: nextOf("17:00"), sections: "hours", channel: "whatsapp" });
    assert.deepEqual(asked.filter((a) => a[2] === "base"), [["hours", "whatsapp", "base"]]);
    // And a new preview under the SAME brain (a zone saved, the settings read again, the config object kept) forgets
    // them too: consequenceOf resolves with the preview's inputs, so a block kept from the old preview would have read
    // the new zone's heading as a change of this save.
    asked.length = 0;
    W.__SETTINGS = { ...W.__SETTINGS, prompt: { ...W.__SETTINGS.prompt, tz: "America/Chicago" } };
    const zoned = S.willSay({ was: moved.brain, next: nextOf("17:00"), sections: "hours", channel: "whatsapp" });
    assert.deepEqual(asked.filter((a) => a[2] === "base"), [["hours", "whatsapp", "base"]], "REGRESSION: the base's block was the old preview's");
    assert.match(zoned.whole, /America\/Chicago/);
  } finally {
    tab.consequenceOf = real;
    delete W.__SETTINGS;
  }
});

test("the two caps the write schema keeps are in LIMITS, once, and a day with more shifts than it takes is said under its day", () => {
  // The fallback literal was `|| 60` in two files, and a day's cap was the body's to remember in three places. A toast's
  // Undo skipped it: Monday came to five shifts, and Save said only "This can't be saved as it is written."
  const was = W.__configLimits;
  try {
    W.__configLimits = { maxIntervalsPerDay: MAX_INTERVALS_PER_DAY, maxClosures: MAX_CLOSURES };
    assert.deepEqual([S.LIMITS.shifts, S.LIMITS.closures], [MAX_INTERVALS_PER_DAY, MAX_CLOSURES], "the bridge's published limits, read when asked");
    delete W.__configLimits;
    assert.deepEqual([S.LIMITS.shifts, S.LIMITS.closures], [4, 60], "and the standalone mockup's fallback, in the one place");
    W.__configLimits = { maxIntervalsPerDay: MAX_INTERVALS_PER_DAY, maxClosures: MAX_CLOSURES };
    const week = S.draftOf("hours", taken());
    const stretch = (n) => ({ open: `${String(8 + 2 * n).padStart(2, "0")}:00`, close: `${String(9 + 2 * n).padStart(2, "0")}:00` });
    week.tue = { isOpen: true, shifts: Array.from({ length: MAX_INTERVALS_PER_DAY + 1 }, (_, n) => stretch(n)) };
    assert.deepEqual(S.problemsOf("hours", week), { "hours-tue": `At most ${MAX_INTERVALS_PER_DAY} shifts in a day — Tuesday has ${MAX_INTERVALS_PER_DAY + 1}.` });
    // A row nobody filled in is not a shift: the save drops it, so it is not counted.
    week.tue = { isOpen: true, shifts: Array.from({ length: MAX_INTERVALS_PER_DAY }, (_, n) => stretch(n)).concat([{ open: "", close: "" }]) };
    assert.deepEqual(S.problemsOf("hours", week), {});
  } finally {
    if (was) W.__configLimits = was; else delete W.__configLimits;
  }
});

test("a block whose lines are runs says nothing goes unless the whole block goes: a changed Friday takes no Monday with it", () => {
  // The quality review's probe. The hours block's lines are run-collapsed ("Monday–Thursday: 09:30–18:00"). Changing
  // only Friday's close re-cut the runs, and "It will no longer be told" listed "Monday–Thursday: 09:30–18:00", a line
  // about days that were unchanged. Which sections say their lines in runs is one table's (RUN_BLOCKS), never an
  // `if (fold === "hours")` in the page.
  try {
    const base = previewed(taken());
    assert.deepEqual(S.RUN_BLOCKS, ["hours"], "the hours are the one block the composer collapses into runs");
    const week = S.draftOf("hours", base);
    week.sat = { isOpen: true, shifts: [{ open: "09:30", close: "13:00" }, { open: "14:00", close: "18:00" }] };
    const friday = S.willSay({ was: base.brain, next: S.saveFold("hours", base, week).brain, sections: "hours", channel: "whatsapp" });
    assert.equal(friday.removed, null, "REGRESSION: it listed lines about days nobody changed");
    assert.match(friday.whole, /Saturday: 09:30–13:00 and 14:00–18:00/, "the whole new block says what Saturday becomes");
    assert.equal(friday.added, null, "and what comes is not listed apart from it either: a run re-cut is not a new fact");
    // The whole block going is still said, line by line.
    const shut = S.draftOf("hours", base);
    DAYS.forEach((d) => { shut[d] = { isOpen: false, shifts: shut[d].shifts }; });
    const gone = S.willSay({ was: base.brain, next: S.saveFold("hours", base, shut).brain, sections: "hours", channel: "whatsapp" });
    assert.deepEqual(linesOf(gone.removed), linesOf(W.__businessTab.consequenceOf("hours", base.brain, "whatsapp").text));
    // A closure's line is one fact, so the closures say each line that goes, as before.
    const days = S.draftOf("closures", base);
    const fewer = S.willSay({ was: base.brain, next: S.saveFold("closures", base, days.slice(1)).brain, sections: "closures", channel: "whatsapp" });
    assert.match(fewer.removed, /Christmas/);
  } finally {
    delete W.__SETTINGS;
  }
});

test("a booking rule's refusal is contracts' bookingRuleRefusal, and the page's ranges are the save's own schema's", () => {
  // The spec review's probe: the refusal is drawn in the hint's place, and said "leave it empty for no rule" under a box
  // whose hint says an empty one uses two hours. The quality review: a sentence with a number in it is contracts'
  // (spec §3), and RULES is a plain table, where its sentences were getters over a bridge that loads after the page.
  const rules = S.draftOf("booking_rules", stored());
  for (const [key, lo, hi] of S.RULES) {
    assert.equal(S.problemsOf("booking_rules", { ...rules, [key]: String(hi + 1) })[key], bookingRuleRefusal(key), key);
    const bound = BookingRulesSchema.shape[key].unwrap();
    assert.deepEqual([lo, hi], [bound.minValue, bound.maxValue], `${key}: the range a check refuses is the range the save keeps`);
  }
  assert.ok(S.RULES.every((rule) => rule.length === 3 && rule.every((x) => typeof x !== "function")), "a plain [key, least, most]");
  // Without the bridge the page states no number of its own: it says only that the box is refused.
  const tab = W.__businessTab;
  try {
    delete W.__businessTab;
    assert.equal(S.problemsOf("booking_rules", { ...rules, lead_hours: "500" }).lead_hours, "That is not a number this rule takes.");
  } finally {
    W.__businessTab = tab;
  }
});
