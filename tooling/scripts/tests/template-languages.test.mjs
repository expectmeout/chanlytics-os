/**
 * A message is one thing in any language WhatsApp takes.
 *
 * Meta keeps a template once per name PER LANGUAGE, and the pages drew that
 * storage: a slot per language on every Templates row, a toggle per language in
 * every composer's chip, and a composer that could write in six languages. The
 * owner has one message. The pages now show the language in view and find any
 * other in a popover -- which needs the whole list WhatsApp accepts, a search
 * that finds "Deutsch" as readily as "German", and a draft that writes in the
 * language asked for rather than English whenever it was not Spanish or
 * Portuguese.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

const { draftSystemPrompt } = await import("../../../apps/dashboard/src/server/templates.ts");

test("the list is every language WhatsApp takes for a template, each with the words a person would search for", () => {
  const ids = C.TEMPLATE_LANGUAGES.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, "no language twice");
  for (const id of ["en_US", "en", "en_GB", "es", "es_MX", "es_ES", "es_AR", "pt_BR", "pt_PT", "fr", "de", "it", "zh_CN", "zh_TW", "ar", "hi", "fil", "vi", "ru"]) {
    assert.ok(ids.includes(id), `WhatsApp takes ${id}`);
  }
  assert.ok(ids.length >= 70, `the whole list, not six: ${ids.length}`);
  for (const l of C.TEMPLATE_LANGUAGES) assert.ok(l.label && l.native, `${l.id} has a name and its own name`);
  assert.equal(C.TEMPLATE_LANGUAGES[0].id, "en_US", "the composer still opens on English (US)");
});

test("finding a language: by its name, its own name, or its code -- diacritics and case aside, the closest first", () => {
  const find = (q) => C.findLanguages(C.TEMPLATE_LANGUAGES, q).map((l) => l.id);
  assert.deepEqual(find("span"), ["es", "es_AR", "es_MX", "es_ES"], "its name, the plain one first");
  assert.equal(find("deutsch")[0], "de", "its own name");
  assert.equal(find("portugues")[0], "pt_BR", "without the accent a keyboard may not have");
  assert.ok(find("PT").slice(0, 2).every((id) => id.startsWith("pt")), "its code");
  assert.ok(find("español").includes("es_MX"));
  assert.equal(find("").length, C.TEMPLATE_LANGUAGES.length, "nothing typed is everything");
  assert.deepEqual(find("klingon"), [], "and nothing made up");
});

test("a language said in a chip is its two letters, and in a sentence its name", () => {
  assert.equal(C.languageShort("en_US"), "EN");
  assert.equal(C.languageShort("pt_BR"), "PT");
  assert.equal(C.languageShort("fil"), "FIL");
  assert.equal(C.languageName("de"), "German");
  assert.equal(C.languageName("es_MX"), "Spanish (Mexico)");
  assert.equal(C.languageName("xx_YY"), "xx_YY", "a code nobody listed is said as it is, not guessed at");
});

test("a template can be written in any of them, and drafted in the one asked for -- not English whenever it is not Spanish or Portuguese", () => {
  const draft = (language) => C.validateTemplateDraft({ name: "autumn_offer", language, category: "marketing", body: "Hi {{1}}, a free gloss this week.", footer: "Reply STOP to opt out", examples: ["Dani"] });
  assert.equal(draft("de").ok, true, "German is WhatsApp's to review, not ours to refuse");
  assert.equal(draft("xx").ok, false);
  const facts = { businessName: "Melany Studio", services: [], guardrails: [] };
  assert.ok(draftSystemPrompt(facts, "marketing", "de").includes("Write in German."), "REGRESSION: every language that was not Spanish or Portuguese was drafted in English");
  assert.ok(draftSystemPrompt(facts, "marketing", "es_MX").includes("Write in Spanish (Mexico)."));
  assert.ok(draftSystemPrompt(facts, "utility", "en_US").includes("Write in English (US)."));
});
