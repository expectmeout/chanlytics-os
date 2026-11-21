/**
 * AI's ad writer (the dashboard's server/ask/skills/ad/skill.ts over contracts ask/skills/ad: the Ads plan's 6.7): its
 * words, what it is handed, what code holds its answer to, how it is judged, and its test set's pure parts. Every check
 * of the plan's section 5.1 that is about an ad's words is run here with words that pass and words that fail, in
 * English and Spanish. No model is asked: the test set's live run costs money and runs only on Ruben's word.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";
import { briefOf, callCost, expectFailures, loadCases, validateCases } from "../../../tooling/scripts/evals/ad.mjs";
import { adCraftIssues } from "../../../apps/dashboard/src/server/ask/skills/ad/checks.ts";
import { AD_SKILL } from "../../../apps/dashboard/src/server/ask/skills/ad/skill.ts";
import { skillGuide, skillsAsked, isAskSkillId } from "../../../apps/dashboard/src/server/ask/skills/registry.ts";

/** A brief as New ad builds one: Harbor Studio, a first appointment, two facts and a price line. */
const brief = (over = {}) => ({
  job: "write",
  business: {
    name: "Harbor Studio",
    tone: "Warm and brief.",
    word: "appointment",
    neverPrices: false,
    ...over.business,
  },
  service: { name: "First appointment", price: "$45", ...over.service },
  facts: over.facts ?? ["Open Saturdays.", "First appointments take 45 minutes."],
  picture: "the front desk, nobody in it",
  area: over.area ?? { place: "Miami", miles: 5, wide: null },
  language: over.language ?? "en",
  places: over.places ?? ["facebook"],
  ...(over.job ? { job: over.job } : {}),
  ...(over.refused ? { refused: over.refused } : {}),
  ...(over.change ? { change: over.change } : {}),
});

const GOOD = [
  {
    headline: "First appointment, $45",
    text: "A first appointment at Harbor Studio takes 45 minutes. Message us on WhatsApp to pick a time.",
  },
  {
    headline: "Open Saturdays",
    text: "Saturdays are open for first appointments at Harbor Studio. Message us on WhatsApp for a time.",
  },
  {
    headline: "Harbor Studio",
    text: "45 minutes, $45, and time to ask questions. Message Harbor Studio on WhatsApp to book.",
  },
];
const codes = (versions, over) => adCraftIssues(versions, brief(over)).map((issue) => issue.code);
/** The codes one text raises as version 1, beside two versions that pass. */
const codesOf = (text, over, headline = "First appointment") => [
  ...new Set(
    adCraftIssues([{ headline, text }, GOOD[1], GOOD[2]], brief(over))
      .filter((issue) => issue.version === 1)
      .map((issue) => issue.code),
  ),
];

test("the skill's words: its three jobs, its rules, what it never does, and trade-neutral examples", () => {
  assert.equal(AD_SKILL.id, "ad");
  assert.equal(AD_SKILL.when.jobs.length, 3, "write, change, write again");
  const system = C.craftSystem(AD_SKILL);
  for (const part of ["never the reader", "Only what the brief holds", "One thing to do", "Three versions", "Never:"])
    assert.ok(system.includes(part), part);
  assert.ok(system.endsWith(C.DATA_NOT_INSTRUCTIONS), "the brief's facts are fenced, so the fence's one rule is said");
  assert.ok(AD_SKILL.craft.maxTokens <= C.SKILL_CRAFT_MAX_TOKENS);
  // A purpose of its own at the gateway, so what ad writing costs is read apart (the plan's G19).
  assert.equal(AD_SKILL.craft.purpose, "ad_draft");
  assert.ok(C.SKILL_CRAFT_PURPOSES.includes(AD_SKILL.craft.purpose));
  // Each worked example's own versions pass the checks the product runs: an example that broke a rule would teach it.
  for (const example of AD_SKILL.examples) {
    const versions = [...example.answer.matchAll(/Headline: (.+?)\. Text: (.+)$/gm)].map((found) => ({
      headline: found[1],
      text: found[2],
    }));
    assert.ok(versions.length >= 1, example.title);
    const spanish = /Spanish/.test(example.title);
    const over = spanish
      ? {
          business: { name: "Estudio Puerto", neverPrices: true },
          service: { name: "Primera cita", price: null },
          facts: [],
          language: "es",
        }
      : { facts: ["Open Saturdays.", "First appointments take 45 minutes.", "Appointments this week."] };
    const found = adCraftIssues(versions, brief({ ...over, job: versions.length === 1 ? "rewrite" : "write" }));
    assert.deepEqual(found, [], `${example.title}: ${JSON.stringify(found)}`);
  }
});

test("the guide is a short block, and a question's words ask for the skill in English and Spanish, and only then", () => {
  const block = skillGuide("ad");
  assert.equal(block, C.guideBlock(AD_SKILL));
  assert.ok(block.length <= C.SKILL_GUIDE_MAX, `${block.length} characters`);
  assert.ok(block.startsWith("Skill: Ad writer."));
  assert.match(block, /never make an ad at Meta, turn one on/);
  for (const question of [
    "write me an ad for the first appointment",
    "can we advertise on Instagram?",
    "why was my ad refused",
    "hazme un anuncio para esta semana",
    "¿cuánto gasté en publicidad?",
  ])
    assert.ok(skillsAsked(question).includes("ad"), question);
  for (const question of [
    "who wrote this week?",
    "add Maria to the list",
    "¿quién me mandó un mensaje hoy?",
    "adjust the hours",
  ])
    assert.ok(!skillsAsked(question).includes("ad"), question);
  assert.ok(isAskSkillId("ad"));
});

test("the brief says the business, the service, the facts fenced, the price rule, the lengths and the job", () => {
  const text = C.adBriefText(brief());
  assert.match(text, /The business: Harbor Studio\./);
  assert.match(text, /The service the ad offers: First appointment\./);
  assert.match(text, /Its price, in the business's own words: \$45/);
  assert.match(text, /<record>\n- Open Saturdays\.\n- First appointments take 45 minutes\.\n<\/record>/);
  assert.match(text, /adults within 5 miles of Miami, on facebook/);
  // A wider place (settled 20 Nov 2026): a city with its ring, or across a state or a country.
  const city = C.adBriefText(brief({ area: { place: "Austin, Texas", miles: 5, wide: "city" } }));
  assert.match(city, /adults in and around Austin, Texas, on facebook/);
  const state = C.adBriefText(brief({ area: { place: "Texas", miles: 5, wide: "region" } }));
  assert.match(state, /adults across Texas, on facebook/);
  assert.match(text, /A text is at most 125 characters.*A headline is at most 27\./);
  assert.match(text, /Write 3 versions/);
  // Instagram alone gives a headline more room; with Facebook among the places its 27 holds.
  assert.deepEqual(C.adLengths(["instagram"]), { text: 125, headline: 40 });
  assert.deepEqual(C.adLengths(["facebook", "instagram"]), { text: 125, headline: 27 });
  assert.deepEqual(C.adLengths([]), { text: 125, headline: 27 });

  const silent = C.adBriefText(brief({ business: { neverPrices: true }, facts: [] }));
  assert.match(silent, /No price may be said/);
  assert.doesNotMatch(silent, /\$45/, "a price the ad may not say is not handed to the writer");
  assert.match(silent, /given no facts for an ad/);
  assert.match(C.adBriefText(brief({ language: "es" })), /Write in Spanish\./);

  const again = C.adBriefText(
    brief({
      job: "rewrite",
      refused: {
        version: { headline: "Tired of waiting?", text: "Tired of waiting weeks?" },
        words: "Personal attributes.",
      },
    }),
  );
  assert.match(again, /Meta turned this version down:\n<record>/);
  assert.match(again, /Meta's own words for why:\n<record>\nPersonal attributes\.\n<\/record>/);
  assert.match(again, /Answer one version/);
});

test("5.1, words about the reader: a question about them, or their own body, health, age or money", () => {
  for (const words of [
    "Are you ready for a change? Message us on WhatsApp.",
    "Tired of waiting weeks for a time? Message us on WhatsApp.",
    "Do you have back pain? Message us on WhatsApp.",
    "Struggling with early mornings? We open at 6. Message us.",
    "We take care of your skin at Harbor Studio. Message us.",
    "Look after your lower back pain with us. Message us.",
    "¿Tienes dolor de espalda? Escríbenos por WhatsApp.",
    "¿Estás cansada de esperar? Escríbenos por WhatsApp.",
    "Cuidamos tu piel en Harbor Studio. Escríbenos.",
  ])
    assert.ok(codesOf(words).includes("about_reader"), words);
  for (const words of [
    "A first appointment at Harbor Studio. Message us on WhatsApp to pick a time that suits you.",
    "Book your first appointment at Harbor Studio on WhatsApp.",
    "Agenda tu primera cita en Harbor Studio. Escríbenos por WhatsApp.",
    "Skin consultations at Harbor Studio. Message us on WhatsApp.",
  ])
    assert.ok(!codesOf(words).includes("about_reader"), words);
});

test("5.1, feeling bad about how one looks, a sure result, and before and after", () => {
  for (const words of [
    "No more embarrassing photos. Message us.",
    "Fix your flaws at Harbor Studio.",
    "Adiós a los complejos. Escríbenos.",
  ])
    assert.ok(codesOf(words).includes("feel_bad"), words);
  for (const words of [
    "Results guaranteed at Harbor Studio. Message us.",
    "A permanent fix, for sure. Message us on WhatsApp.",
    "Resultados garantizados. Escríbenos por WhatsApp.",
    "Se acabó para siempre. Escríbenos por WhatsApp.",
  ])
    assert.ok(codesOf(words).includes("sure_result"), words);
  for (const words of ["See the before and after. Message us.", "Mira el antes y después. Escríbenos."])
    assert.ok(codesOf(words).includes("before_after"), words);
  const calm = "First appointments at Harbor Studio take 45 minutes. Message us on WhatsApp.";
  for (const code of ["feel_bad", "sure_result", "before_after"]) assert.ok(!codesOf(calm).includes(code), code);
  // A service whose own name holds the word is the owner's to say: the rule is about a promise, not a name.
  const named = { service: { name: "Permanent marker art class", price: null } };
  assert.ok(
    !codesOf("Permanent marker art class at Harbor Studio. Message us on WhatsApp.", named).includes("sure_result"),
  );
});

test("5.1, a price that disagrees with Services, any price while AI never quotes one, and money the brief lacks", () => {
  assert.ok(
    codesOf("First appointments are $45 at Harbor Studio. Message us.").length === 0,
    "the price line's own figure",
  );
  assert.ok(codesOf("First appointments are $39 at Harbor Studio. Message us.").includes("new_price"));
  assert.ok(codesOf("Now 20% off at Harbor Studio. Message us.").includes("new_price"));
  const silent = { business: { neverPrices: true } };
  assert.ok(codesOf("First appointments are $45 at Harbor Studio. Message us.", silent).includes("price_off"));
  assert.ok(!codesOf("First appointments at Harbor Studio. Message us.", silent).includes("price_off"));
  assert.ok(codesOf("A free first appointment at Harbor Studio. Message us.").includes("new_money"));
  assert.ok(codesOf("Tu primera cita es gratis. Escríbenos.").includes("new_money"));
  assert.ok(codesOf("Ask about our discount. Message us.").includes("new_money"));
  // What the owner stands behind is theirs to say.
  const offer = { facts: ["The first appointment is free this month.", "Open Saturdays."] };
  assert.ok(!codesOf("The first appointment is free this month. Message us on WhatsApp.", offer).includes("new_money"));
});

test("5.1, nothing the brief does not hold: a number, a contact typed in, hurry, capitals", () => {
  assert.ok(codesOf("Over 500 happy clients at Harbor Studio. Message us.").includes("new_number"));
  assert.ok(!codesOf("First appointments take 45 minutes. Message us on WhatsApp.").includes("new_number"));
  for (const words of ["Call 305-555-0142 today.", "Visit www.example.com to book.", "Write to hello@example.com."])
    assert.ok(codesOf(words).includes("typed_contact"), words);
  for (const words of [
    "Last chance to book at Harbor Studio.",
    "Hurry, message us today.",
    "Última oportunidad. Escríbenos.",
  ])
    assert.ok(codesOf(words).includes("pressure"), words);
  const deadline = { facts: ["Limited time: open Sundays in December."] };
  assert.ok(!codesOf("Limited time: open Sundays in December. Message us.", deadline).includes("pressure"));
  assert.ok(codesOf("BOOK your first appointment. Message us.").includes("shouting"));
  const loud = { business: { name: "HARBOR Studio" } };
  assert.ok(!codesOf("HARBOR Studio has first appointments. Message us.", loud).includes("shouting"));
});

test("5.1, an ad Meta asks to be declared reads as one, and ordinary services do not", () => {
  for (const words of [
    "We're hiring at Harbor Studio. Message us on WhatsApp.",
    "Apartments for rent near the harbor. Message us.",
    "Personal loans with answers in a day. Message us.",
    "Estamos contratando. Escríbenos por WhatsApp.",
    "Préstamos personales rápidos. Escríbenos.",
  ])
    assert.ok(codesOf(words).includes("special_kind"), words);
  for (const words of [
    "Move-out cleaning for apartments and houses. Message us on WhatsApp.",
    "We take most insurance plans at the desk. Message us.",
    "Pago seguro en el local. Escríbenos por WhatsApp.",
  ])
    assert.ok(!codesOf(words).includes("special_kind"), words);
});

test("5.1, the shape of the answer: how many versions, none empty, none the same, each inside its length", () => {
  assert.deepEqual(codes(GOOD), []);
  assert.deepEqual(codes(GOOD.slice(0, 2)), ["count"]);
  assert.deepEqual(codes([GOOD[0]], { job: "rewrite" }), []);
  assert.deepEqual(codes(GOOD, { job: "rewrite" }), ["count"]);
  assert.deepEqual(codes([GOOD[0], { headline: "", text: "Words." }, GOOD[2]]), ["empty"]);
  assert.deepEqual(codes([GOOD[0], { ...GOOD[1], text: GOOD[0].text.toUpperCase().toLowerCase() }, GOOD[2]]), [
    "same_versions",
  ]);
  const long =
    "First appointments at Harbor Studio take 45 minutes, and Saturdays are open too, so message us on WhatsApp to pick a time soon.";
  assert.ok(long.length > 125);
  assert.deepEqual(codes([{ headline: "First appointment", text: long }, GOOD[1], GOOD[2]]), ["text_long"]);
  const headline = "First appointments at Harbor";
  assert.ok(headline.length > 27 && headline.length <= 40);
  assert.deepEqual(codes([{ ...GOOD[0], headline }, GOOD[1], GOOD[2]]), ["headline_long"]);
  // On Instagram alone the same headline reads whole.
  assert.deepEqual(codes([{ ...GOOD[0], headline }, GOOD[1], GOOD[2]], { places: ["instagram"] }), []);
});

const ANSWER = {
  versions: [],
  change: { kind: "none", service: "", miles: 0, place_kind: "none", place: "", within: "", amount: 0, end: "" },
  could_not: "",
};
const CHANGE = {
  versions: GOOD,
  asked: "make it 15 miles",
  services: ["Follow-up", "Consultation"],
  today: "2026-11-20",
  ends: "2026-12-04",
};

test("what the writer wrote is read as a draft reads it, and a change is one of a closed list or nothing", () => {
  const read = C.adVersionsOf({
    ...ANSWER,
    versions: [{ headline: "  First\nappointment ", text: " A  first appointment. " }],
    could_not: " ",
  });
  assert.deepEqual(read, {
    versions: [{ headline: "First appointment", text: "A first appointment." }],
    couldNot: null,
  });
  assert.ok(C.AdCraftAnswerSchema.safeParse(ANSWER).success);
  assert.ok(!C.AdCraftAnswerSchema.safeParse({ ...ANSWER, change: { ...ANSWER.change, kind: "budget" } }).success);
  assert.deepEqual(C.AD_CRAFT_JSON_SCHEMA.properties.change.properties.kind.enum, C.AD_CHANGE_KINDS);

  const asked = brief({ job: "change", change: CHANGE });
  const change = (over) => C.adChangeOf({ ...ANSWER, ...over, change: { ...ANSWER.change, ...over.change } }, asked);
  assert.deepEqual(change({ change: { kind: "area", miles: 15 } }), { kind: "area", miles: 15 });
  assert.equal(change({ change: { kind: "area", miles: 80 } }), null, "past the most Meta takes");
  assert.equal(change({ change: { kind: "area", miles: 0 } }), null);
  assert.deepEqual(change({ change: { kind: "service", service: "follow-up" } }), {
    kind: "service",
    service: "Follow-up",
  });
  assert.equal(change({ change: { kind: "service", service: "Something else" } }), null, "only a service on the list");
  assert.deepEqual(change({ change: { kind: "picture" } }), { kind: "picture" });
  assert.deepEqual(change({ change: { kind: "amount", amount: 100 } }), { kind: "amount", units: 100 });
  assert.equal(change({ change: { kind: "amount", amount: 99.5 } }), null);
  assert.equal(change({ change: { kind: "amount", amount: -5 } }), null);
  assert.deepEqual(change({ change: { kind: "end", end: "2026-12-10" } }), { kind: "end", day: "2026-12-10" });
  assert.equal(change({ change: { kind: "end", end: "2026-11-20" } }), null, "an end is a later day");
  assert.equal(change({ change: { kind: "end", end: "next Friday" } }), null);
  assert.deepEqual(change({ versions: GOOD, change: { kind: "words" } }), { kind: "words", versions: GOOD });
  assert.equal(change({ versions: GOOD.slice(0, 1), change: { kind: "words" } }), null);
  assert.equal(change({ change: { kind: "none" } }), null);
  // Outside the job, an answer changes nothing.
  assert.equal(C.adChangeOf({ ...ANSWER, change: { ...ANSWER.change, kind: "area", miles: 15 } }, brief()), null);
  assert.match(
    C.adBriefText(asked),
    /What the owner asked, in their own words:\n<record>\nmake it 15 miles\n<\/record>/,
  );
});

test("the judge reads the brief and the versions, and a verdict needs every check and every hard criterion", () => {
  assert.match(C.adJudgeSystem(), /- reader \(must pass\)/);
  const question = C.adJudgeQuestion(brief(), GOOD, null);
  assert.ok(question.includes(C.adBriefText(brief())));
  assert.match(question, /Version 3\nHeadline: Harbor Studio/);
  const all = (pass) => ({ verdicts: C.AD_RUBRIC.map((criterion) => ({ id: criterion.id, pass, why: "read" })) });
  assert.deepEqual(C.adVerdict([], all(true)), { pass: true, failed: [], soft: { passed: 4, of: 4 }, notes: [] });
  const issue = { version: 2, code: "about_reader", words: "a question or a claim about the person reading" };
  assert.deepEqual(C.adVerdict([issue], all(true)).failed, [
    "version 2 about_reader: a question or a claim about the person reading",
  ]);
  const soft = {
    verdicts: all(true).verdicts.map((verdict) => (verdict.id === "voice" ? { ...verdict, pass: false } : verdict)),
  };
  assert.deepEqual([C.adVerdict([], soft).pass, C.adVerdict([], soft).soft], [true, { passed: 3, of: 4 }]);
  assert.equal(C.adVerdict([], { verdicts: [] }).pass, false, "a criterion the judge left out is never a pass");
  assert.deepEqual(
    C.AD_JUDGE_JSON_SCHEMA.properties.verdicts.items.properties.id.enum,
    C.AD_RUBRIC.map((criterion) => criterion.id),
  );
});

test("the test set is well formed, builds every brief, and its own drafts pass the checks", () => {
  const cases = loadCases();
  assert.deepEqual(validateCases(cases), []);
  assert.ok(cases.length >= 12);
  assert.ok(["write", "rewrite", "change"].every((job) => cases.some((entry) => entry.job === job)));
  assert.ok(cases.some((entry) => entry.language === "es") && cases.some((entry) => entry.expect?.noVersions));
  for (const entry of cases) {
    const adBrief = briefOf(entry);
    assert.ok(C.adBriefText(adBrief).length > 300, entry.id);
    // A change case's draft is words the product showed: they pass, or the case would start from a broken ad.
    if (entry.change) assert.deepEqual(adCraftIssues(entry.change.versions, adBrief), [], entry.id);
    // A turned-down version is one the checks would have stopped before Meta did.
    if (entry.refused) assert.ok(adCraftIssues([entry.refused.version], adBrief).length > 0, entry.id);
  }
  assert.deepEqual(
    validateCases([{ id: "x", job: "sing", business: {}, service: {}, language: "fr", places: ["tv"] }]).length,
    5,
  );

  const area = cases.find((entry) => entry.id === "change_area_en");
  assert.deepEqual(expectFailures(area, { versions: [], couldNot: null, change: { kind: "area", miles: 15 } }), []);
  assert.equal(expectFailures(area, { versions: [], couldNot: null, change: { kind: "area", miles: 50 } }).length, 1);
  const loan = cases.find((entry) => entry.id === "loan_broker_special_kind_en");
  assert.deepEqual(expectFailures(loan, { versions: [], couldNot: "Not run here.", change: undefined }), []);
  assert.equal(expectFailures(loan, { versions: GOOD, couldNot: null, change: undefined }).length, 2);
  const dental = cases.find((entry) => entry.id === "dental_first_visit_en");
  const free = [{ headline: "Free exam", text: "Are you due? A free exam." }];
  assert.equal(expectFailures(dental, { versions: free, couldNot: null, change: undefined }).length, 3);

  // What a call costs is computed from its own text: more text in, more cost, and never nothing.
  const cost = callCost(C.adBriefText(briefOf(dental)));
  assert.ok(cost.input > 1500 && cost.output === AD_SKILL.craft.maxTokens && cost.dollars > 0, JSON.stringify(cost));
});
