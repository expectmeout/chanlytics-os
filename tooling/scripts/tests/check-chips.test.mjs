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
    chips.services.slice(0, 3),
    [
      { name: "Local move", on: true },
      { name: "Long-distance move", on: false },
      { name: "Packing", on: false },
    ],
    "the same name, by the one rule (foldName)",
  );
  assert.deepEqual(
    chips.languages.map((l) => [l.name, l.on]),
    [
      ["English", false],
      ["Spanish", true],
      ["Portuguese", false],
      ["French", false],
      ["Haitian Creole", false],
      ["Mandarin", false],
      ["Tagalog", true],
    ],
    "the first few common ones, and a chosen one the list does not name",
  );
  assert.deepEqual([chips.servicesFull, chips.languagesFull], [false, false]);
  assert.deepEqual(COMMON_LANGUAGES.slice(0, 2), ["English", "Spanish"]);
});

test("a list the profile keeps no more of is full: nothing off is offered to add", () => {
  const many = Array.from({ length: PROFILE_LIMITS.services }, (_, i) => ({ name: `Service ${i + 1}` }));
  const langs = COMMON_LANGUAGES.slice(0, PROFILE_LIMITS.languages);
  const chips = checkChipsOf({ type: "plumber", services: many, languages: langs });
  assert.deepEqual([chips.servicesFull, chips.languagesFull], [true, true]);
  const none = checkChipsOf({ type: null, services: null, languages: null });
  assert.deepEqual(none.services, [], "no kind, no suggestions");
  assert.equal(
    none.languages.every((l) => !l.on),
    true,
  );
});
