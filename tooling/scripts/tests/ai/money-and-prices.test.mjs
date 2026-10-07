/**
 * The money charter and the price guard (defects 5 and 6), run as the receptionist runs them: the composed prompt on
 * both channels says the money rule, a hand-written prompt carries it too, the brain's record has a money intent that
 * falls under the locked money class, and layer two (core steps.ts layerTwo) holds a reply that names a refund, a
 * discount, a deposit or a payment term, or a price in any currency, whatever the model's intent said, in the answer's
 * language and in no one trade's words. The table is the reviewer's probe (review3/H/price-probe.mjs) and its misses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BRAIN_INTENTS,
  BRAIN_OUTPUT_JSON_SCHEMA,
  DATA_NOT_INSTRUCTIONS,
  composeSystemPrompt,
  resolveSystemPrompt,
  heldLine,
  namesMoney,
  policyAskClass,
  policyClassOfIntent,
  violatesNoPrices,
  autoReplyHold,
} from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { layerTwo } = await import(pathToFileURL(path.join(ROOT, "packages/core/src/inbound/steps.ts")).href);

const PRICES = [
  "It's $45",
  "45 dollars",
  "45 USD",
  "MX$450",
  "450 pesos",
  "€45",
  "45€",
  "45 €",
  "£30",
  "45 euros",
  "45 EUR",
  "USD 45",
  "eur 45",
  "450 MXN",
  "forty-five dollars",
  "a hundred bucks",
  "cuarenta y cinco pesos",
  "doscientos dólares",
  "we can give you 20% off",
  "Te hacemos un 15% de descuento",
  "a discount of 10%",
  "it's half price on Tuesdays",
  "2x1 los martes",
  // The review's probe (29 September): a country's word before the currency, more Spanish numerals, a share said in words.
  "It's 45 US dollars",
  "45 Canadian dollars",
  "forty-five US dollars",
  "quinientos pesos",
  "veintidós dólares",
  "veintiún dólares",
  "twenty percent off",
  "50 percent off",
  "50 per cent off",
  "un 20 por ciento de descuento",
  "a discount of 20 percent",
];
const NOT_PRICES = [
  "It takes 45 minutes.",
  "See you at 9:30 on Saturday.",
  "We are open 7 days a week.",
  "20% of our clients book online.",
  "I am 100% sure we can help.",
  "Suite 200, second floor.",
  "Call us at 555-0142.",
  "Te esperamos el sábado a las diez.",
  "Dura cuarenta y cinco minutos.",
];
const MONEY = [
  "We will refund you in full.",
  "Your deposit will be returned.",
  "We can offer a discount next time.",
  "You can pay in 3 installments.",
  "We offer a payment plan.",
  "We could waive the fee this once.",
  "Le hacemos el reembolso mañana.",
  "Te devolvemos el dinero.",
  "Hay un descuento para amigas.",
  "Puedes pagar a plazos.",
  "Pedimos un anticipo para reservar.",
  "Tenemos meses sin intereses.",
  // The review's probe: a coupon, a promotion, a thing given free of charge.
  "Here is a coupon for your next visit.",
  "Use the promo code SPRING.",
  "We have a voucher for you.",
  "That one is free of charge.",
  "It's on the house.",
  "Te doy un cupón.",
  "Es sin costo.",
  "Hay una promoción en septiembre.",
];
const NOT_MONEY = [
  "We take cards and cash.",
  "Aceptamos tarjeta y efectivo.",
  "Your appointment is on Saturday.",
  "A member of our team will follow up with the details.",
  "There is free parking behind the salon.",
  "Come in for a free consultation.",
  "Complimentary coffee is served in the lounge.",
];

test("the price guard reads every currency, spelled-out amounts and cuts, and leaves durations and times alone", () => {
  assert.deepEqual(
    PRICES.filter((s) => !violatesNoPrices(s)),
    [],
    "each of these names a price",
  );
  assert.deepEqual(
    NOT_PRICES.filter((s) => violatesNoPrices(s)),
    [],
    "none of these is a price",
  );
});

test("the money detector reads a refund, a discount, a deposit or a payment term, in English and Spanish", () => {
  assert.deepEqual(
    MONEY.filter((s) => !namesMoney(s)),
    [],
  );
  assert.deepEqual(
    NOT_MONEY.filter((s) => namesMoney(s)),
    [],
  );
});

test("money is an intent the brain may give, under the locked money class whatever the rows say", () => {
  assert.ok(BRAIN_INTENTS.includes("money"));
  assert.ok(BRAIN_OUTPUT_JSON_SCHEMA.properties.intent.enum.includes("money"));
  assert.equal(policyClassOfIntent("money"), "money");
  assert.equal(policyAskClass({ money: { mode: "never" } }, "money"), "money");
  assert.equal(
    policyAskClass({ money: { mode: "auto" } }, "money"),
    "money",
    "no row can hand money to the receptionist",
  );
  assert.equal(policyAskClass(null, "money"), "money", "and no row read is not a yes");
  assert.equal(policyAskClass({ faq: { mode: "auto" } }, "pricing"), null);
});

const profile = {
  services: [{ name: "Consultation" }],
  guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true },
};
const base = { business_name: "Example Studio", booking_link: "https://book.example.com/x" };
const NOW = new Date("2026-09-29T15:00:00Z");
const POLICY = { money: { mode: "never" }, booking: { mode: "auto" }, faq: { mode: "auto" } };

test("the composed prompt says the money rule and the data rule on WhatsApp and on the phone", () => {
  const chat = composeSystemPrompt(base, profile, "whatsapp", "America/New_York", NOW, POLICY);
  const call = composeSystemPrompt(base, profile, "voice", "America/New_York", NOW, POLICY);
  for (const [name, p] of [
    ["whatsapp", chat],
    ["voice", call],
  ]) {
    assert.match(p, /- Money: a refund, a discount, a deposit, a payment plan/, `${name} says the money rule`);
    assert.ok(p.includes(`- ${DATA_NOT_INSTRUCTIONS}`), `${name} says what is inside a fence is data`);
  }
  assert.match(chat, /set intent to money and escalate to true/);
  assert.match(call, /call them back about it, and take their name/);
});

test("a hand-written prompt keeps its words and is given the same standing rules after them", () => {
  const brain = {
    business_name: "Example Studio",
    booking_link: "https://book.example.com/x",
    system_prompt: "Be kind.",
  };
  const p = resolveSystemPrompt(brain, "whatsapp", "UTC", NOW, POLICY, null);
  assert.ok(p.startsWith("Be kind.\n\n"), "the owner's words first, byte for byte");
  assert.match(p, /- Money: /);
  assert.ok(p.includes(DATA_NOT_INSTRUCTIONS));
});

const brainCfg = {
  business_name: "Example Studio",
  booking_link: "https://book.example.com/x",
  phone_display: "(555) 010-0142",
};
const two = (replyText, intent, language = "en", policy = POLICY) =>
  layerTwo({
    replyText,
    escalate: false,
    escalationReason: "human_token",
    brainCfg,
    policy,
    intent,
    language,
    known: null,
  });

test("layer two holds money named in the words even when the model's intent says otherwise, in the answer's language", () => {
  const faq = two("Sure, we will refund your last visit in full.", "services");
  assert.equal(faq.moneyHeld, true);
  assert.equal(faq.askClass, "money");
  assert.equal(faq.escalate, true);
  assert.equal(faq.escalationReason, "policy_ask");
  assert.equal(faq.replyText, heldLine("money", "en", "(555) 010-0142"));
  assert.doesNotMatch(faq.replyText, /refund/i);

  const es = two("Claro, te hacemos un descuento la próxima vez.", "smalltalk", "es");
  assert.equal(es.moneyHeld, true);
  assert.match(es.replyText, /^Gracias por preguntar\./);
  assert.match(es.replyText, /Si es urgente, llama al \(555\) 010-0142\.$/);

  // The model's own intent is enough: its words about money are never kept, even a promise of a person.
  const said = two("Someone will be in touch.", "money");
  assert.equal(said.moneyHeld, true);
  assert.equal(said.replyText, heldLine("money", "en", "(555) 010-0142"));

  const fine = two("We open at nine.", "hours");
  assert.deepEqual(
    [fine.moneyHeld, fine.askClass, fine.escalate, fine.replyText],
    [false, null, false, "We open at nine."],
  );
});

test("a price in any currency is blocked with a line in the answer's language, in no one trade's words", () => {
  const eur = two("It is 45 euros.", "pricing");
  assert.equal(eur.priceBlocked, true);
  assert.equal(eur.escalationReason, "policy_block");
  assert.equal(eur.replyText, heldLine("price", "en", "(555) 010-0142"));
  const es = two("Cuesta cuarenta y cinco pesos.", "pricing", "es");
  assert.match(es.replyText, /^¡Buena pregunta! Alguien de nuestro equipo/);
  for (const kind of ["price", "money", "booking", "faq"]) {
    for (const lang of ["en", "es", "other", null]) {
      const line = heldLine(kind, lang, null);
      assert.doesNotMatch(line, /consult|salon|stylist|clinic/i, `${kind}/${lang}: no trade's words`);
      assert.ok(!violatesNoPrices(line) && !namesMoney(line), `${kind}/${lang}: the line holds nothing it blocks`);
    }
  }
});

test("a Google review's automatic reply that names a price or money is held, never posted", () => {
  assert.equal(autoReplyHold("Thank you, Ana! We loved having you."), null);
  assert.equal(autoReplyHold("Sorry about that, we will refund your visit."), "money");
  assert.equal(autoReplyHold("Next time it's 20% off for you."), "price");
});
