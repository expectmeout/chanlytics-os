/**
 * A message is one thing in every language it has.
 *
 * The composer offered six languages, and Campaigns › Templates drew a slot per
 * language on every row -- "EN ES" down a page of sixteen messages -- with no way
 * to reach a language nobody had written. Now: every language WhatsApp takes, a
 * search that finds one by its English name, its own name, a place or a code,
 * one picker per message that groups what WhatsApp holds, what the library wrote
 * and everything else, and a message written again in a new language from the
 * words it already has -- the same name, the same slots, the same button.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const server = await import("../../../../apps/dashboard/src/server/campaigns/templates.ts");

const {
  WHATSAPP_LANGUAGES,
  TEMPLATE_LANGUAGES,
  templateLanguage,
  languageName,
  languageLabel,
  languageTag,
  findLanguages,
  languageWords,
  languageLabels,
  messageLanguageChoices,
  LANGUAGE_GROUP_WORDS,
  templateUntranslatable,
  templateLinkButton,
  validateTemplateDraft,
  templateComponents,
} = contracts;

test("every language WhatsApp takes, once each, under Meta's own codes", () => {
  const ids = WHATSAPP_LANGUAGES.map((l) => l.id);
  assert.equal(ids.length, 111, "Meta's list, read 21 Sep 2026");
  assert.equal(new Set(ids).size, ids.length, "no code twice");
  for (const id of [
    "af",
    "ar_EG",
    "zh_HK",
    "prs_AF",
    "en_US",
    "en_GB",
    "fil",
    "fr_CI",
    "ky_KG",
    "nb",
    "pt_BR",
    "pt_PT",
    "si_LK",
    "es",
    "es_MX",
    "zu",
  ])
    assert.ok(ids.includes(id), id);
  // Every one reads as a person reads it, and says its own name for a search typed in it.
  for (const l of WHATSAPP_LANGUAGES) {
    assert.ok(l.label && l.name && l.native, l.id);
    assert.equal(l.label, l.region ? `${l.name} (${l.region})` : l.name, l.id);
  }
  // The composer and the routes take any of them -- it was six.
  assert.equal(TEMPLATE_LANGUAGES.length, WHATSAPP_LANGUAGES.length);
  const draft = (language) =>
    validateTemplateDraft({
      name: "offer",
      language,
      category: "utility",
      body: "Your visit is confirmed.",
      examples: [],
    });
  assert.equal(draft("fr").ok, true, "French is a language a template may be written in");
  assert.equal(draft("vi").ok, true);
  assert.equal(draft("tlh").error, "Pick a language from the list.");
});

test("a language by its code, as a person reads it, and as a chip says it", () => {
  assert.equal(templateLanguage("pt-BR").id, "pt_BR", "a hyphen or a case is the same code");
  assert.equal(templateLanguage("PT_br").label, "Portuguese (Brazil)");
  assert.equal(templateLanguage("xx"), null);
  assert.equal(languageLabel("en_US"), "English (US)");
  assert.equal(languageLabel("es"), "Spanish");
  assert.equal(languageName("es_MX"), "Spanish", "the language alone");
  // The words a send has always named its language by are unchanged: the list's first, the runtime's after.
  assert.deepEqual(
    [languageWords("en_US"), languageWords("es"), languageWords("pt-BR")],
    ["English", "Spanish", "Portuguese"],
  );
  assert.equal(languageWords("yo"), "Yoruba", "a code WhatsApp does not list still reads as its language");
  // The chip's letters: the place only beside another of the same language.
  assert.equal(languageTag("en_US"), "EN");
  assert.equal(languageTag("en_US", ["en_US", "es"]), "EN");
  assert.equal(languageTag("en_US", ["en_US", "en_GB"]), "EN-US");
  assert.equal(languageTag("en", ["en", "en_GB"]), "EN", "the language alone has no place to add");
  assert.equal(languageTag("prs_AF"), "PRS");
  // Two codes of one language, in a composer's list: each says its place.
  assert.deepEqual(languageLabels(["en", "en_US", "es"]), { en: "English", en_US: "English (US)", es: "Spanish" });
});

test("a search finds a language the way a person would type it", () => {
  const first = (q) => findLanguages(q)[0]?.id;
  const ids = (q) => findLanguages(q).map((l) => l.id);
  assert.equal(findLanguages("").length, WHATSAPP_LANGUAGES.length, "nothing typed is the whole list");
  assert.equal(first("port"), "pt_BR");
  assert.deepEqual(ids("portu"), ["pt_BR", "pt_PT"]);
  assert.equal(first("pt"), "pt_BR", "a code");
  assert.equal(first("pt_pt"), "pt_PT", "a whole code");
  assert.equal(first("brazil"), "pt_BR", "a place");
  assert.equal(first("mex"), "es_MX");
  assert.equal(first("deutsch"), "de", "its own name");
  assert.equal(first("espanol"), "es", "its own name without the accent");
  assert.equal(first("español"), "es");
  assert.equal(first("中文"), "zh_CN", "its own name in its own script");
  assert.ok(
    ids("es")
      .slice(0, 13)
      .every((id) => id.startsWith("es")),
    "the code first: every Spanish before Estonian",
  );
  assert.ok(ids("es").includes("et"), "and Estonian after them");
  assert.deepEqual(findLanguages("zzzz"), [], "a query only narrows");
  // Any list of languages, not only the whole one: a picker's own choices keep their fields.
  const mine = messageLanguageChoices({ onFile: [{ language: "en_US", meta_status: "approved" }], canAdd: true });
  assert.equal(findLanguages("english (us)", mine)[0].group, "on");
});

test("a message's picker: what WhatsApp holds, what the library wrote, and every other language -- only where one may be added", () => {
  const all = messageLanguageChoices({
    onFile: [
      { language: "en_US", meta_status: "approved" },
      { language: "pt_BR", meta_status: "pending" },
    ],
    ready: ["en_US", "es"],
    canAdd: true,
  });
  const group = (g) => all.filter((c) => c.group === g).map((c) => c.id);
  assert.deepEqual(group("on"), ["en_US", "pt_BR"]);
  assert.deepEqual(
    all.filter((c) => c.group === "on").map((c) => c.status),
    ["approved", "pending"],
  );
  assert.deepEqual(group("ready"), ["es"], "a library language on file is on file, not ready");
  assert.equal(all.find((c) => c.id === "es").status, null, "written, and WhatsApp has never seen it");
  assert.equal(group("add").length, WHATSAPP_LANGUAGES.length - 3);
  assert.equal(all.find((c) => c.id === "fr").status, undefined, "nobody has written it: nothing to draw");
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, "each language once");
  // No one to add it, or nothing it can be written from: the groups WhatsApp and the library hold, and no more.
  const held = messageLanguageChoices({
    onFile: [{ language: "en_US", meta_status: "approved" }],
    ready: ["es"],
    canAdd: false,
  });
  assert.deepEqual(
    held.map((c) => c.group),
    ["on", "ready"],
  );
  // A code WhatsApp does not list is still the message's own.
  const odd = messageLanguageChoices({ onFile: [{ language: "yo", meta_status: "approved" }] });
  assert.deepEqual(
    odd.map((c) => [c.id, c.label, c.group]),
    [["yo", "Yoruba", "on"]],
  );
  assert.deepEqual(Object.keys(LANGUAGE_GROUP_WORDS), ["on", "ready", "add"]);
});

test("a message is written in another language only when it comes whole: the words, a footer and one link button", () => {
  assert.equal(templateUntranslatable({ header: null, buttons: [], blocked: null, category: "MARKETING" }), null);
  assert.equal(
    templateUntranslatable({ buttons: [{ text: "Book now", kind: "url" }] }),
    null,
    "the one button the create route files",
  );
  assert.equal(templateUntranslatable({ header: "Fall news" }), "it has a heading");
  assert.equal(templateUntranslatable({ buttons: [{ text: "Yes", kind: "reply" }] }), "it has a reply button");
  assert.equal(templateUntranslatable({ buttons: [{ text: "Call", kind: "call" }] }), "it has a button that calls");
  assert.equal(
    templateUntranslatable({
      buttons: [
        { text: "A", kind: "url" },
        { text: "B", kind: "url" },
      ],
    }),
    "it has more than one button",
  );
  assert.equal(templateUntranslatable({ blocked: "a picture for a heading" }), "it has a picture for a heading");
  assert.equal(templateUntranslatable({ category: "AUTHENTICATION" }), "WhatsApp files it as authentication");
  // The link button's address, as the create path files it and the sync keeps it.
  const v = validateTemplateDraft({
    name: "offer",
    language: "en_US",
    category: "marketing",
    body: "Hi {{1}}.",
    examples: ["Dani"],
    button: { text: "Book now", url: "https://booksy.com/luna" },
  });
  assert.deepEqual(templateLinkButton(templateComponents(v.value)), {
    text: "Book now",
    url: "https://booksy.com/luna",
  });
  assert.equal(templateLinkButton([{ type: "BODY", text: "Hi" }]), null);
});

/* ------------------------------ the server's half ------------------------------ */

const facts = { businessName: "Luna Studio", services: [{ name: "Colour" }], guardrails: [] };
const source = (over = {}) => ({
  name: "winback_offer",
  category: "marketing",
  language: "en_US",
  body: "Hi {{1}}, it's been a while since we saw you at {{2}}. Book here: {{3}} and we'll take care of the rest.",
  footer: "Reply STOP to opt out",
  examples: ["Dani", "Luna Studio", "https://booksy.com/luna"],
  labels: ["First name", "Business name", "Booking link"],
  kinds: ["first_name", "business_name", "booking_link"],
  button: null,
  ...over,
});

test("the assistant is told the language by its name and its place, and never 'English' for anything it did not know", () => {
  assert.ok(server.draftSystemPrompt(facts, "marketing", "fr").includes("Write in French."));
  assert.ok(
    server
      .draftSystemPrompt(facts, "marketing", "pt_BR")
      .includes("Write in Portuguese (Brazil): the words and spelling people use in Brazil."),
  );
  assert.ok(server.draftSystemPrompt(facts, "utility", "es").includes("Write in Spanish."));
  const t = server.translateSystemPrompt(facts, source(), "es_MX");
  assert.ok(t.includes("from English (US) into Spanish (Mexico)"), t);
  assert.ok(t.includes("people use in Mexico"));
  assert.ok(t.includes("Keep the word STOP as it is"), "the opt-out word works in every language");
  assert.ok(t.includes("MARKETING template: the footer still says how to opt out"));
  // Each slot is given with what it is, so a slot is never guessed at.
  const given = JSON.parse(server.translationInput(source()));
  assert.deepEqual(
    given.slots.map((s) => [s.slot, s.is]),
    [
      ["{{1}}", "First name"],
      ["{{2}}", "Business name"],
      ["{{3}}", "Booking link"],
    ],
  );
});

test("a translation comes back as the same message: its name, its slots, a name and a link kept as they are, and the check a submission passes", () => {
  const good = server.translatedDraft(
    source({ button: { text: "Book now", url: "https://booksy.com/luna" } }),
    "pt_BR",
    {
      body: "Oi {{1}}, faz tempo que não te vemos no {{2}}. Agende aqui: {{3}} e nós cuidamos do resto.",
      footer: "Responda STOP para sair",
      examples: ["Daniela", "Estúdio Luna", "https://example.com/other"],
      button: "Agendar",
    },
  );
  assert.equal(good.ok, true, good.message);
  const d = good.draft;
  assert.equal(d.name, "winback_offer", "the same name: one message in one more language");
  assert.equal(d.language, "pt_BR");
  assert.equal(d.from, "en_US");
  assert.equal(d.category, "marketing");
  assert.deepEqual(
    d.examples,
    ["Dani", "Luna Studio", "https://booksy.com/luna"],
    "a name, a business and a link are the same words in every language",
  );
  assert.deepEqual(
    d.variables.map((v) => v.label),
    ["First name", "Business name", "Booking link"],
    "the slots keep the labels their kinds are read from",
  );
  assert.deepEqual(
    d.button,
    { text: "Agendar", url: "https://booksy.com/luna" },
    "its own button in the new words, at its own address",
  );
  // A slot's typed words are translated.
  const typed = server.translatedDraft(
    source({
      body: "Hi {{1}}, {{2}}",
      examples: ["Dani", "we open late on Thursdays"],
      labels: ["First name", "The note"],
      kinds: ["first_name", "text"],
      footer: "Reply STOP to opt out",
    }),
    "es",
    {
      body: "Hola {{1}}, esta semana: {{2}}",
      footer: "Responde STOP para darte de baja",
      examples: ["Dani", "abrimos tarde los jueves"],
    },
  );
  assert.equal(typed.ok, true, typed.message);
  assert.deepEqual(typed.draft.examples, ["Dani", "abrimos tarde los jueves"]);
  // A translation that lost a slot is refused, not submitted short.
  const lost = server.translatedDraft(source(), "fr", {
    body: "Bonjour {{1}}, réservez ici : {{3}}.",
    footer: "Répondez STOP",
    examples: [],
  });
  assert.equal(lost.ok, false);
  assert.match(lost.message, /lost one of the message's values/);
  // What WhatsApp refuses is refused here, in the check's own words.
  const long = server.translatedDraft(source({ button: { text: "Book now", url: "https://booksy.com/luna" } }), "de", {
    body: "Hallo {{1}}, lange nicht gesehen bei {{2}}. Hier buchen: {{3}} und wir kümmern uns um den Rest.",
    footer: "Antworte STOP",
    button: "Jetzt einen Termin für Sie buchen",
  });
  assert.equal(long.ok, false);
  assert.match(long.message, /under 25 characters/);
  assert.equal(server.translatedDraft(source(), "fr", "not json").ok, false);
  assert.equal(server.translatedDraft(source(), "fr", { footer: "x" }).reason, "malformed");
});
