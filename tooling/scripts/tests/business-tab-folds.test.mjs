/**
 * A save patches; it never rebuilds.
 *
 * The editor this replaces once started its profile from {} and added the known keys back, which is not a save -- it
 * is a rebuild, and a rebuild silently deletes every key the form does not happen to render. That is how a live
 * workspace lost a 5,000-character prompt. Every fold is held to the opposite, here, before any fold can save (plan
 * Task 3.6): each fold of the Business tab opens a draft from the stored config (draftOf), and writes its own paths onto
 * the config and nothing else (saveFold). Both are pages/business-tab-save.jsx's, run on the stub React as the page
 * tests load it; they are pure, so nothing is drawn.
 *
 * EXECUTED, never read: every claim is something a helper returned for a config it was handed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newReceptionistDefaults, instructionsDraft, FALLBACK_DEFAULTS, unknownDetails, INSTRUCTIONS_MAX, resolveSystemPrompt,
  hasProfile,
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
const W = globalThis.window;
const S = W.__businessTabSave;
// What each fold's "It will say" is asked of: every fold here must be one consequenceOf knows by name.
const { FOLD_BLOCK } = await import("../../../apps/dashboard/src/legacy-bridge/business-tab.ts");

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
  for (const helper of ["draftOf", "saveFold"]) {
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
  // A number outside its range is never written: it is no rule at all.
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
