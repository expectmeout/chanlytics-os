/**
 * The business's own phone greeting (decision 0051): no cap and nothing refused, and one thing held where the line is
 * spoken: the caller is told it is an automated assistant. A line that never says so has the product's clause added;
 * one that denies it plays the standard greeting. The notes say what every other choice means, one at a time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  greetingOf,
  greetingNotes,
  statesAutomated,
  deniesAutomated,
  spokenNameOf,
  greetingFor,
  pausedGreetingFor,
  GREETING_DEFAULT,
  GREETING_TEMPLATE,
  namesMoney,
  violatesNoPrices,
} from "@chanlytics/contracts";

const NAME = "Harbor Moving";
const notesOf = (stored, o = {}) =>
  greetingNotes({
    stored,
    name: NAME,
    neverQuotePrices: true,
    namesMoney,
    namesPrice: violatesNoPrices,
    ...o,
  }).map((n) => n.key);

test("nothing stored or an emptied line: the standard greeting, named; the box's untouched template says the same words", () => {
  for (const stored of [undefined, null, "", "   "]) {
    assert.deepEqual(greetingOf({ name: NAME, stored, paused: false }), {
      text: greetingFor(NAME),
      source: "standard",
    });
  }
  assert.equal(GREETING_TEMPLATE, greetingFor("{business}"), "the box opens on the standard line with the slot in it");
  assert.deepEqual(greetingOf({ name: NAME, stored: GREETING_TEMPLATE, paused: false }), {
    text: greetingFor(NAME),
    source: "owner",
  });
});

test("the owner's line is spoken as written, the name filled, when it already says it is automated", () => {
  const stored = "Hey there, you've reached {business}! This is our virtual assistant. What can I do for you?";
  assert.deepEqual(greetingOf({ name: NAME, stored, paused: false }), {
    text: "Hey there, you've reached Harbor Moving! This is our virtual assistant. What can I do for you?",
    source: "owner",
  });
  // The recording sentence is the owner's to leave out: nothing puts it back.
  assert.ok(!greetingOf({ name: NAME, stored, paused: false }).text.includes("recorded"));
});

test("a line that never says it is automated has the product's clause added, before its closing question, in its language", () => {
  assert.deepEqual(
    greetingOf({ name: NAME, stored: "Thanks for calling {business}. How can I help?", paused: false }),
    {
      text: "Thanks for calling Harbor Moving. I'm the automated assistant. How can I help?",
      source: "owner_disclosed",
    },
  );
  assert.equal(
    greetingOf({ name: NAME, stored: "Welcome to {business}", paused: false }).text,
    "Welcome to Harbor Moving. I'm the automated assistant.",
    "no closing question: the clause goes after it",
  );
  assert.equal(
    greetingOf({ name: NAME, stored: "Hola, gracias por llamar a {business}. ¿Cómo le puedo ayudar?", paused: false })
      .text,
    "Hola, gracias por llamar a Harbor Moving. Soy el asistente automático. ¿Cómo le puedo ayudar?",
  );
});

test("a line that denies being automated, or claims to be a person, is never spoken: the standard greeting is", () => {
  for (const stored of [
    "Hi, this is {business}. I'm not a bot, how can I help?",
    "You're speaking with a real person at {business}.",
    "Thanks for calling, this line is AI-free.",
    "Hola, no soy un robot. ¿En qué le ayudo?",
    "Hola, soy una persona real.",
  ]) {
    assert.deepEqual(
      greetingOf({ name: NAME, stored, paused: false }),
      { text: greetingFor(NAME), source: "standard_denied" },
      stored,
    );
    assert.equal(deniesAutomated(stored, NAME), true, stored);
    assert.deepEqual(notesOf(stored), ["denies_ai"], "the note says so before the save, alone");
  }
});

test("a denial with words between, a n't form or a curly apostrophe is still a denial", () => {
  for (const stored of [
    "You're not talking to a robot, we answer every call!",
    "This isn't a robot, it's Sam.",
    "This isn’t a robot, it’s Sam.",
    "I'm not a virtual assistant, I'm Sam.",
    "Hola, no está hablando con una máquina.",
  ]) {
    assert.equal(greetingOf({ name: NAME, stored, paused: false }).source, "standard_denied", stored);
  }
  // A negation that governs something else is no denial, and the line is spoken as written.
  const open = "We're not open now, but our AI assistant can help. What do you need?";
  assert.deepEqual(greetingOf({ name: NAME, stored: open, paused: false }), { text: open, source: "owner" });
});

test("a bare word is no disclosure: a line that only mentions automation, payments or Iowa has the clause added", () => {
  for (const stored of [
    "Thanks for calling {business} in Des Moines, IA. How can I help?",
    "Thanks for calling {business}. Book with our automated booking system. How can I help?",
    "Thanks for calling {business}. We take automatic payments. How can I help?",
  ]) {
    const g = greetingOf({ name: NAME, stored, paused: false });
    assert.equal(g.source, "owner_disclosed", stored);
    assert.match(g.text, /I'm the automated assistant\. How can I help\?$/, stored);
  }
  assert.equal(statesAutomated("This is an automated line for {business}."), true, "a claim about who answers");
  assert.equal(statesAutomated("You've reached {business}'s AI."), true);
});

test("a Spanish disclosure that says it is no person is spoken as written; a Spanish-sounding name never makes the clause Spanish", () => {
  assert.deepEqual(
    greetingOf({
      name: NAME,
      stored: "No soy una persona real, soy un asistente virtual de {business}.",
      paused: false,
    }),
    { text: "No soy una persona real, soy un asistente virtual de Harbor Moving.", source: "owner" },
  );
  for (const name of ["La Piñata Salon", "Hola Beauty"]) {
    assert.equal(
      greetingOf({ name, stored: "Thanks for calling {business}. How can I help?", paused: false }).text,
      `Thanks for calling ${name}. I'm the automated assistant. How can I help?`,
      name,
    );
  }
});

test("the business's own name never counts as saying, or denying, it is automated", () => {
  assert.equal(statesAutomated("Thanks for calling Botanica Salon.", "Botanica Salon"), false);
  assert.equal(statesAutomated("Hi, Virtual Hair here.", "Virtual Hair"), false);
  assert.equal(statesAutomated("Hi, {business}. Our AI assistant is here.", "Robots R Us"), true);
  assert.equal(statesAutomated("Hola, soy la asistente virtual de {business}."), true);
  assert.equal(statesAutomated("Our assistant will help you."), false, "an assistant may be a person");
  // A negation that does not govern the word is no denial: the correct disclosure must never read as one.
  assert.equal(deniesAutomated("No worries, I'm an AI assistant. How can I help?"), false);
  assert.equal(statesAutomated("No worries, I'm an AI assistant. How can I help?"), true);
});

test("paused, the product's take-a-message line plays whatever is stored; a slot with no name known plays the nameless line", () => {
  assert.deepEqual(greetingOf({ name: NAME, stored: "Yo! {business} here, I'm the AI.", paused: true }), {
    text: pausedGreetingFor(NAME),
    source: "paused",
  });
  assert.deepEqual(greetingOf({ name: "  ", stored: "Hi, {business}. I'm the automated assistant.", paused: false }), {
    text: GREETING_DEFAULT,
    source: "standard",
  });
  assert.equal(spokenNameOf("  Harbor Moving "), "Harbor Moving");
  assert.equal(spokenNameOf(""), null);
});

test("Retell's own {{…}} never sees ours: double braces are made single where the line is spoken", () => {
  const { text } = greetingOf({ name: NAME, stored: "Hi {{business}}, I'm the automated assistant.", paused: false });
  assert.equal(text, "Hi Harbor Moving, I'm the automated assistant.");
  assert.ok(!/\{\{|\}\}/.test(text));
});

test("the notes: one key each, in order, never a refusal", () => {
  assert.deepEqual(notesOf("Hi, {business}. I'm the automated assistant, and calls are recorded. How can I help?"), []);
  assert.deepEqual(notesOf("Hi, {business}. I'm the automated assistant. How can I help?"), ["no_recording"]);
  assert.deepEqual(notesOf("Hi, {business}. How can I help?"), ["adds_ai", "no_recording"]);
  const added = (stored) =>
    greetingNotes({ stored, name: NAME, neverQuotePrices: true, namesMoney, namesPrice: violatesNoPrices }).find(
      (n) => n.key === "adds_ai",
    ).words;
  assert.match(added("Hi, {business}. How can I help?"), /callers also hear “I'm the automated assistant.”/);
  assert.match(added("Hola, gracias por llamar a {business}."), /callers also hear “Soy el asistente automático.”/);
  assert.deepEqual(notesOf("Hi, I'm the automated assistant. Calls are not recorded."), ["denies_recording"]);
  assert.deepEqual(notesOf("Hi, I'm the automated assistant. We don’t record calls."), ["denies_recording"]);
  assert.deepEqual(
    notesOf("I'm the automated assistant. No problem, calls are recorded."),
    [],
    'a "no" that denies nothing',
  );
  assert.deepEqual(notesOf("I'm the automated assistant, calls are recorded. Book at harbor.com."), ["link"]);
  assert.deepEqual(notesOf("I'm the automated assistant, calls are recorded. Call {phone}."), ["slot"]);
  assert.deepEqual(notesOf("I'm the automated assistant, calls are recorded. Ask about our student discount."), [
    "money",
  ]);
  assert.deepEqual(notesOf("I'm the automated assistant, calls are recorded. Moves start at $199."), ["price"]);
  assert.deepEqual(
    notesOf("I'm the automated assistant, calls are recorded. Moves start at $199.", { neverQuotePrices: false }),
    [],
    "a price is the owner's to say while the rule is off",
  );
  const long =
    "Hello and a very warm welcome to {business}, where we have been helping families move across the whole city for over twenty years. I'm the automated assistant, and calls are recorded. How can I help?";
  assert.ok(notesOf(long).includes("long"));
  const [note] = greetingNotes({
    stored: long,
    name: NAME,
    neverQuotePrices: true,
    namesMoney,
    namesPrice: violatesNoPrices,
  }).filter((n) => n.key === "long");
  assert.match(note.words, /^About \d+ seconds before a caller can speak\./);
  assert.ok(
    !notesOf(GREETING_TEMPLATE, { name: "Northside Family Hair & Beauty Studio" }).includes("long"),
    "the standard line with a long name is not long",
  );
});
