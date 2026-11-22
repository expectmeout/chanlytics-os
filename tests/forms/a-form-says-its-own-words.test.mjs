/**
 * What a visitor's form says that its owner did not write, and the code its thank-you carries into a chat (the Forms
 * plan, 3.4, 3.5 and 3.12; the canvas's call 14: a form is in one language, all of it).
 *
 * The house has the page's words in English and Spanish. A form in any other language carries its own, written with the
 * form and kept with the version; one of them that lost a part it must name ({business}, {code}) is not used, and the
 * house's English stands in for that line alone. A request's code is six characters nobody misreads, found in a
 * message wherever it stands, and never mistaken for a service's one-time code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { FormDescription, FORM_PAGE_WORD_KEYS } = await import(at("packages/contracts/src/forms/shape.ts"));
const { formPageWords } = await import(at("packages/contracts/src/forms/page-words.ts"));
const { requestCodeOf, continueMessage, REQUEST_CODE_DAYS } = await import(
  at("packages/contracts/src/forms/request-code.ts")
);
const { oneTimeCodeOf } = await import(at("packages/contracts/src/lines/one-time-code.ts"));

const form = (over = {}) =>
  FormDescription.parse({
    heading: "Colour consultation",
    lang: "en",
    thanks: "Thanks, we have your request.",
    fields: [
      { id: "f1name", kind: "short", label: "Your name", needed: true },
      { id: "f2mail", kind: "email", label: "Email", needed: true },
    ],
    next: { chat: true, draft: true, follow_up: false },
    ...over,
  });

test("the house's words, in English and in Spanish, by the form's language", () => {
  const en = formPageWords(form());
  assert.equal(en.send, "Send request");
  assert.equal(en.chat, "Continue on WhatsApp");
  const es = formPageWords(form({ lang: "es-MX" }));
  assert.equal(es.send, "Enviar solicitud");
  assert.notEqual(es.booked, en.booked);
  for (const key of FORM_PAGE_WORD_KEYS) {
    assert.equal(typeof en[key], "string", key);
    assert.ok(es[key].length > 0, key);
  }
});

test("a form in another language says its own words, and English where it has none", () => {
  const pt = formPageWords(form({ lang: "pt", words: { send: "Enviar pedido", optional: "opcional" } }));
  assert.equal(pt.send, "Enviar pedido");
  assert.equal(pt.optional, "opcional");
  assert.equal(pt.sending, formPageWords(form()).sending, "a line it does not have is the house's English");
});

test("a line that lost a part it must name is not used", () => {
  const en = formPageWords(form());
  const broken = formPageWords(form({ lang: "ht", words: { booked: "Anyen pa rezève.", chat_hello: "Bonjou" } }));
  assert.equal(broken.booked, en.booked, "the line names the business, or it is the house's");
  assert.equal(broken.chat_hello, en.chat_hello, "the hello names the business and the person, or it is the house's");
  const kept = formPageWords(
    form({ lang: "ht", words: { booked: "{business} ap reponn ou. Anyen pa rezève jiskaske yo konfime." } }),
  );
  assert.match(kept.booked, /^\{business\} ap reponn ou/);
});

test("the house's own languages are never overridden by a version's words", () => {
  const es = formPageWords(form({ lang: "es", words: { send: "Mandar" } }));
  assert.equal(es.send, "Enviar solicitud", "English and Spanish are the house's own words");
});

test("the shape takes only the words the page says", () => {
  const stray = FormDescription.safeParse({ ...form(), words: { anything: "x" } });
  assert.equal(stray.success, false);
});

test("a request's code is found wherever it stands, in capitals or not, and nothing else is one", () => {
  assert.equal(requestCodeOf("Hi Luma Salon, it's Ana, about my colour consultation request (R4KQ7X)"), "R4KQ7X");
  assert.equal(requestCodeOf("(r4kq7x) hola, soy Ana"), "R4KQ7X");
  assert.equal(requestCodeOf("my code is R4KQ7X"), null, "a code stands in its brackets");
  assert.equal(requestCodeOf("see you (Friday)"), null);
  assert.equal(requestCodeOf("(ABCDE1)"), null, "a 1 is never in a code");
  assert.equal(requestCodeOf(""), null);
  assert.equal(REQUEST_CODE_DAYS, 30);
});

test("the message that opens in a chat is theirs: who they are, what they asked, and the code", () => {
  const words = formPageWords(form());
  const text = continueMessage(words, {
    business: "Luma Salon",
    name: "Ana",
    heading: "Colour consultation",
    lead: "Dark brown now. I'd love a warm, soft blonde for spring.",
    code: "R4KQ7X",
  });
  assert.match(text, /Luma Salon/);
  assert.match(text, /Ana/);
  assert.match(text, /Dark brown now/);
  assert.ok(text.endsWith("(R4KQ7X)"), text);
  assert.equal(requestCodeOf(text), "R4KQ7X");
  const long = continueMessage(words, {
    business: "Luma Salon",
    name: null,
    heading: "Colour consultation",
    lead: "x".repeat(900),
    code: "R4KQ7X",
  });
  assert.ok(long.length <= 500, "a long answer is cut, the code never");
  assert.equal(requestCodeOf(long), "R4KQ7X");
  assert.equal(oneTimeCodeOf(text), null, "never set aside as a service's one-time code");
});
