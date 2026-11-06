/**
 * What Check offers as chips (the first run, canvas R2): the services a business of Google's kind usually offers, and
 * the common languages, each on when it is already the record's. Run here: contracts' table and view model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serviceSuggestionsOf,
  SERVICE_SUGGESTION_TYPES,
  checkChipsOf,
  COMMON_LANGUAGES,
  PROFILE_LIMITS,
  foldName,
  sameListed,
  profileRefusal,
} from "@chanlytics/contracts";

test("a kind of place suggests what such a business usually offers; a near kind shares its list; one we do not know suggests nothing", () => {
  assert.deepEqual(serviceSuggestionsOf("moving_company").slice(0, 3), ["Local move", "Long-distance move", "Packing"]);
  assert.deepEqual(
    serviceSuggestionsOf("hair_care"),
    serviceSuggestionsOf("hair_salon"),
    "Google's near kinds share one",
  );
  assert.deepEqual(serviceSuggestionsOf("massage_spa"), serviceSuggestionsOf("spa"));
  assert.deepEqual(serviceSuggestionsOf("gym"), serviceSuggestionsOf("fitness_center"));
  assert.deepEqual(serviceSuggestionsOf("sandwich_shop"), [], "a trade we do not know gets no other trade's words");
  assert.deepEqual(serviceSuggestionsOf(null), []);
  assert.deepEqual(serviceSuggestionsOf("  moving_company "), serviceSuggestionsOf("moving_company"));
});

test("every list is a handful of names a service can hold, none of them twice", () => {
  assert.ok(SERVICE_SUGGESTION_TYPES.length >= 20, "the kinds the product meets most");
  for (const type of SERVICE_SUGGESTION_TYPES) {
    const names = serviceSuggestionsOf(type);
    assert.ok(names.length >= 4 && names.length <= 8, `${type}: ${names.length}`);
    assert.equal(new Set(names.map(foldName)).size, names.length, `${type} names one service twice`);
    for (const n of names) assert.ok(n.trim() === n && n.length > 0 && n.length <= PROFILE_LIMITS.serviceName, n);
  }
});

test("the chips: a suggestion is on when a service of its name is listed, however it is written; the languages are the common ones and any chosen one besides", () => {
  const chips = checkChipsOf({
    type: "moving_company",
    services: [{ name: "local move", duration_min: 180 }, { name: "Piano" }],
    languages: ["Spanish", "Tagalog"],
  });
  assert.deepEqual(
    chips.services.chips.slice(0, 3),
    [
      { name: "Local move", on: true },
      { name: "Long-distance move", on: false },
      { name: "Packing", on: false },
    ],
    "the same name, by the one rule (foldName)",
  );
  assert.deepEqual(
    chips.languages.chips.map((l) => [l.name, l.on]),
    [...COMMON_LANGUAGES.map((l) => [l, l === "Spanish"]), ["Tagalog", true]],
    "every common one, and a chosen one the list does not name",
  );
  assert.deepEqual([chips.services.full, chips.languages.full], [null, null]);
  assert.deepEqual(COMMON_LANGUAGES.slice(0, 2), ["English", "Spanish"]);
});

test("a name is the same name however it is written: accents, case and the space around it are not the name", () => {
  assert.equal(sameListed("Haitian Créole", " haitian creole "), true);
  assert.equal(sameListed("Español", "espanol"), true);
  assert.equal(sameListed("Spanish", "Español"), false, "a translation is another name");
  assert.equal(sameListed("", " "), false, "no name is no name");
  const twice = checkChipsOf({ type: null, services: null, languages: ["Tagalog", " tagalog", "Haitian Créole"] });
  assert.deepEqual(
    twice.languages.chips.filter((c) => c.on).map((c) => c.name),
    ["Haitian Creole", "Tagalog"],
    "a chosen language is one chip, however often and however it is written",
  );
});

test("at what the profile keeps, none that is off is offered to add: the ones on stay, and the cap's sentence stands for the rest", () => {
  const many = Array.from({ length: PROFILE_LIMITS.services - 1 }, (_, i) => ({ name: `Service ${i + 1}` }));
  const langs = [...COMMON_LANGUAGES.slice(0, PROFILE_LIMITS.languages - 1), "Tagalog"];
  const chips = checkChipsOf({ type: "moving_company", services: [...many, { name: "Packing" }], languages: langs });
  assert.deepEqual(chips.services, { chips: [{ name: "Packing", on: true }], full: profileRefusal("services") });
  assert.deepEqual(chips.languages, {
    chips: langs.map((name) => ({ name, on: true })),
    full: profileRefusal("languages"),
  });
  // Nothing held back, nothing to stand for: every suggestion is on, or there are none.
  const every = serviceSuggestionsOf("moving_company").map((name) => ({ name }));
  const filled = [...many.slice(0, PROFILE_LIMITS.services - every.length), ...every];
  assert.equal(checkChipsOf({ type: "moving_company", services: filled, languages: [] }).services.full, null);
  assert.deepEqual(checkChipsOf({ type: null, services: [...many, { name: "Packing" }], languages: [] }).services, {
    chips: [],
    full: null,
  });
  const none = checkChipsOf({ type: null, services: null, languages: null });
  assert.deepEqual(none.services, { chips: [], full: null }, "no kind, no suggestions");
  assert.equal(
    none.languages.chips.every((l) => !l.on),
    true,
  );
});
