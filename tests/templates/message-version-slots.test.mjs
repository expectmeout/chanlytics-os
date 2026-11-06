/**
 * A version's words as parts (contracts message-version-slots.ts), the way between the string that is stored and the
 * chips the editor draws (One message, every channel; the review's item 16): the string never changes as it goes to
 * parts and back, a slot is one part wherever it stands, a stray brace is words, a number the message has no slot for
 * is still one thing, and a slot put in or taken out leaves the caret where a person expects it. The slot rule is
 * still the check's, said in the slots' names where the editor draws them. A slot is its key: a number's digits for a
 * campaign message's numbered slots, a name for a reach-out's six (step 5), and the one reader of the words serves both.
 * What the editor draws as a chip is exactly what the fill puts a value in, in every spelling the fill reads (`{{01}}`,
 * `{{ Your Name }}`), so the send never fills what the editor showed as plain words (the review of 3 Oct 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REACH_OUT_SLOT_SET,
  clampWords,
  eraseSlot,
  fillSlots,
  fromSlotParts,
  insertSlot,
  namedProblem,
  numberedSlots,
  playbookName,
  partWritten,
  placeholdersOf,
  reachOutRules,
  slotKnown,
  slotChoices,
  slotLabel,
  slotWritten,
  smsVersionSegments,
  starterByKey,
  starterText,
  templateSlots,
  toSlotParts,
  validateEmailVersion,
  validateOwnVersion,
  validateSmsVersion,
} from "@chanlytics/contracts";

const text = (t) => ({ kind: "text", text: t });
// A slot is its key (a number's digits here); the numbered set is what words are read over unless one is named.
const slot = (n) => ({ kind: "slot", slot: String(n) });

/* ---------------------------------- words to parts ---------------------------------- */

test("words with slots in them are parts: words, a slot, words", () => {
  assert.deepEqual(toSlotParts("Hi {{1}}, our hours start {{2}}."), [
    text("Hi "),
    slot(1),
    text(", our hours start "),
    slot(2),
    text("."),
  ]);
  assert.deepEqual(toSlotParts("no slots here"), [text("no slots here")]);
  assert.deepEqual(toSlotParts(""), [], "nothing is no parts, not one empty one");
});

test("a slot at the start, at the end, alone, or beside another is a part of its own, with no empty words between", () => {
  assert.deepEqual(toSlotParts("{{1}} is here"), [slot(1), text(" is here")]);
  assert.deepEqual(toSlotParts("see you, {{1}}"), [text("see you, "), slot(1)]);
  assert.deepEqual(toSlotParts("{{3}}"), [slot(3)]);
  assert.deepEqual(toSlotParts("{{1}}{{2}}"), [slot(1), slot(2)], "adjacent slots");
  assert.deepEqual(toSlotParts("{{1}}{{1}}"), [slot(1), slot(1)], "the same slot twice");
  assert.deepEqual(toSlotParts("{{1}} {{2}}"), [slot(1), text(" "), slot(2)]);
});

test("a number is the whole number between the braces: {{10}} is one slot, not {{1}} and a 0", () => {
  assert.deepEqual(toSlotParts("{{10}}"), [slot(10)]);
  assert.deepEqual(toSlotParts("{{1}}0"), [slot(1), text("0")]);
  assert.deepEqual(toSlotParts("{{12}}{{3}}"), [slot(12), slot(3)]);
});

test("a number the message has no slot for is still a slot, so the editor can keep it, draw it and refuse it", () => {
  assert.deepEqual(toSlotParts("{{0}} and {{99}}"), [slot(0), text(" and "), slot(99)]);
});

// A slot written in a way but its key between plain braces is the slot it names, which says how it was written.
const written = (n, how) => ({ kind: "slot", slot: String(n), written: how });

test("a number written with leading zeros is the slot it names, as the send fills it, and it keeps its spelling", () => {
  assert.deepEqual(toSlotParts("{{01}}"), [written(1, "{{01}}")]);
  assert.deepEqual(toSlotParts("a {{007}} b {{1}}"), [text("a "), written(7, "{{007}}"), text(" b "), slot(1)]);
  assert.deepEqual(
    toSlotParts("{{99999999999999999999}}"),
    [slot("99999999999999999999")],
    "as many digits as it has: never through a float",
  );
  assert.deepEqual(toSlotParts("{{0000}}"), [written(0, "{{0000}}")]);
  assert.equal(partWritten(written(1, "{{01}}")), "{{01}}");
  assert.equal(partWritten(slot(1)), "{{1}}", "the usual spelling says nothing, and is its key between plain braces");
});

test("a brace that is no slot's is words, wherever it stands and however many", () => {
  for (const words of [
    "{",
    "}",
    "{{",
    "}}",
    "{{1}",
    "{1}}",
    "{ {1} }",
    "{{ 1 }}",
    "{{a}}",
    "{{}}",
    "}}{{",
    "100% {x}",
  ]) {
    assert.deepEqual(toSlotParts(words), [text(words)], words);
  }
  assert.deepEqual(toSlotParts("{{{1}}}"), [text("{"), slot(1), text("}")], "a slot inside spare braces");
  assert.deepEqual(toSlotParts("}}{{1}}{{"), [text("}}"), slot(1), text("{{")]);
  assert.deepEqual(toSlotParts("{{1}}}"), [slot(1), text("}")]);
  assert.deepEqual(toSlotParts("{{{{1}}"), [text("{{"), slot(1)]);
});

test("line breaks stay in the words, and a slot on a line of its own is a part between them", () => {
  assert.deepEqual(toSlotParts("Hi\n{{1}}\n\nBye"), [text("Hi\n"), slot(1), text("\n\nBye")]);
});

test("a slot is the one the check and the fill read: the slots of the parts are the message's placeholders", () => {
  for (const words of ["Hi {{1}}, {{2}}", "{{10}} {{3}} {{3}}", "{{0}}", "plain", "{{1}}{{2}}{{3}}"]) {
    const slots = [...new Set(toSlotParts(words).flatMap((p) => (p.kind === "slot" ? [Number(p.slot)] : [])))].sort(
      (a, b) => a - b,
    );
    assert.deepEqual(slots, placeholdersOf(words), words);
  }
});

/* ---------------------------------- parts to words ---------------------------------- */

test("the stored words are the parts written back: nothing changes on the way, whatever the words", () => {
  const cases = [
    "",
    "plain",
    "Hi {{1}}",
    "{{1}}{{2}}{{10}}",
    "{ {{1}} }",
    "{{01}} {{1}}",
    "a\r\nb {{2}}\n",
    "{{{1}}}",
    "emoji 🙂 {{2}} accents é",
  ];
  for (const words of cases) assert.equal(fromSlotParts(toSlotParts(words)), words, JSON.stringify(words));
  assert.equal(slotWritten(7), "{{7}}");
  assert.equal(fromSlotParts([text("Hi "), slot(1), text("!")]), "Hi {{1}}!");
  assert.equal(fromSlotParts([]), "");
});

test("and over a thousand made-up strings of braces, digits and words: back is the same string, parts are never empty or doubled", () => {
  // A fixed generator, so a failure is the same failure each run.
  let seed = 20261003;
  const next = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const alphabet = ["{", "}", "{{", "}}", "1", "0", "10", "a", " ", "\n", "{{1}}", "{{2}}", "{{10}}", "{{01}}", "é"];
  for (let run = 0; run < 1200; run += 1) {
    const words = Array.from({ length: next(14) }, () => alphabet[next(alphabet.length)]).join("");
    const parts = toSlotParts(words);
    assert.equal(fromSlotParts(parts), words, JSON.stringify(words));
    parts.forEach((p, i) => {
      if (p.kind === "text") {
        assert.notEqual(p.text, "", `an empty run of words in ${JSON.stringify(words)}`);
        assert.notEqual(parts[i + 1]?.kind, "text", `two runs of words together in ${JSON.stringify(words)}`);
      }
    });
    assert.deepEqual(toSlotParts(fromSlotParts(parts)), parts, "parts, written and read again, are the same parts");
  }
});

test("a slot counts as long as it is written, whichever way the words went: the text counter is unchanged", () => {
  const body = "Hi {{1}}, hours start {{2}}.";
  assert.deepEqual(smsVersionSegments(fromSlotParts(toSlotParts(body)), "en_US"), smsVersionSegments(body, "en_US"));
});

/* ---------------------------------- a slot put in ---------------------------------- */

test("a slot put in at the caret goes there and leaves the caret after it", () => {
  assert.deepEqual(insertSlot("Hi , welcome", 1, 3, 3), { text: "Hi {{1}}, welcome", caret: 8 });
  assert.deepEqual(insertSlot("", 2, 0, 0), { text: "{{2}}", caret: 5 });
  assert.deepEqual(insertSlot("Hi ", 1, 3, 3), { text: "Hi {{1}}", caret: 8 }, "at the end");
  assert.deepEqual(insertSlot("Hi", 1, 0, 0), { text: "{{1}}Hi", caret: 5 }, "at the start");
  assert.deepEqual(insertSlot("a{{1}}b", 2, 6, 6), { text: "a{{1}}{{2}}b", caret: 11 }, "beside a slot");
});

test("a slot put in over a selection takes its place, and a selection given backwards is the same one", () => {
  assert.deepEqual(insertSlot("Hi there, welcome", 1, 3, 8), { text: "Hi {{1}}, welcome", caret: 8 });
  assert.deepEqual(insertSlot("Hi there, welcome", 1, 8, 3), { text: "Hi {{1}}, welcome", caret: 8 });
});

test("a slot put in where there is no place, or past the words, goes at the end; {{10}} is written whole", () => {
  assert.deepEqual(insertSlot("Hi", 1, 99, 99), { text: "Hi{{1}}", caret: 7 });
  assert.deepEqual(insertSlot("Hi", 1, -4, -4), { text: "{{1}}Hi", caret: 5 }, "before the start is the start");
  assert.deepEqual(insertSlot("Hi", 1, 1, 99), { text: "H{{1}}", caret: 6 }, "a selection past the end ends at it");
  assert.deepEqual(insertSlot("", 10, 0, 0), { text: "{{10}}", caret: 6 });
});

/* ---------------------------------- a slot taken out ---------------------------------- */

test("Backspace against a slot takes it whole and leaves the caret where it stood; Delete does the same from before it", () => {
  assert.deepEqual(eraseSlot("Hi {{1}}, hi", 8, 8, "back"), { text: "Hi , hi", caret: 3 });
  assert.deepEqual(eraseSlot("Hi {{1}}, hi", 3, 3, "forward"), { text: "Hi , hi", caret: 3 });
  assert.deepEqual(eraseSlot("{{10}}x", 6, 6, "back"), { text: "x", caret: 0 }, "{{10}} is one slot");
  assert.deepEqual(eraseSlot("{{1}}{{2}}", 10, 10, "back"), { text: "{{1}}", caret: 5 }, "the one beside the caret");
  assert.deepEqual(eraseSlot("{{1}}{{2}}", 5, 5, "back"), { text: "{{2}}", caret: 0 });
  assert.deepEqual(eraseSlot("{{1}}{{2}}", 5, 5, "forward"), { text: "{{1}}", caret: 5 });
});

test("words beside the caret, a selection, a caret in the wrong place and braces that name nothing are not a slot's to take", () => {
  assert.equal(eraseSlot("Hi {{1}}", 2, 2, "back"), null, "words before the caret go a letter at a time");
  assert.equal(eraseSlot("Hi {{1}}", 3, 3, "back"), null, "a slot after the caret is Delete's");
  assert.equal(eraseSlot("Hi {{1}}", 8, 8, "forward"), null, "and a slot before it is Backspace's");
  assert.equal(eraseSlot("Hi {{1}} there", 3, 8, "back"), null, "a selection is the browser's to delete");
  assert.equal(eraseSlot("", 0, 0, "back"), null);
  assert.equal(eraseSlot("{{ 1 }}", 7, 7, "back"), null, "{{ 1 }} names no number: words");
  assert.deepEqual(
    eraseSlot("{{01}}", 6, 6, "back"),
    { text: "", caret: 0 },
    "{{01}} is a slot, whole, as it was written",
  );
  assert.deepEqual(eraseSlot("a{{007}}b", 1, 1, "forward"), { text: "ab", caret: 1 });
});

/* ---------------------------------- names ---------------------------------- */

test("a slot is called what the message calls it, and 'Value 5' where it has no name for it", () => {
  const set = numberedSlots(["First name", "Date", "  ", "Link"]);
  assert.equal(slotLabel(set, 1), "First name");
  assert.equal(slotLabel(set, 3), "Value 3", "a blank name is no name");
  assert.equal(slotLabel(set, 5), "Value 5");
  assert.equal(slotLabel(set, 0), "Value 0");
  assert.equal(slotLabel(numberedSlots([]), 1), "Value 1");
  assert.deepEqual(
    [0, 1, 4, 5].map((n) => slotKnown(set, n)),
    [false, true, true, false],
  );
});

const WORDS = (subject, body) => ({ subject, body });

test("the slot rule is the check's own, said in names where the editor draws them: a number with no slot never shows braces", () => {
  const labels = numberedSlots(["First name", "Date"]);
  const check = validateEmailVersion({ subject: "Hours", body: "Hi {{5}}" }, 2);
  assert.equal(check.ok, false);
  assert.equal(
    check.error,
    "{{5}} is not one of this message's values: it has {{1}} to {{2}}.",
    "the check is unchanged",
  );
  assert.equal(
    namedProblem(check, WORDS("Hours", "Hi {{5}}"), labels),
    "Value 5 is not one of this message's values: it has First name and Date.",
  );
  const one = validateSmsVersion({ body: "Hi {{2}}" }, 1, "en_US");
  assert.equal(
    namedProblem(one, WORDS(null, "Hi {{2}}"), numberedSlots(["First name"])),
    "Value 2 is not one of this message's values: it has First name.",
  );
  const three = validateSmsVersion({ body: "Hi {{4}}" }, 3, "en_US");
  assert.equal(
    namedProblem(three, WORDS(null, "Hi {{4}}"), numberedSlots(["First name", "Date", "Link"])),
    "Value 4 is not one of this message's values: it has First name, Date and Link.",
  );
  const none = validateSmsVersion({ body: "Hi {{1}}" }, 0, "en_US");
  assert.equal(
    namedProblem(none, WORDS(null, "Hi {{1}}"), numberedSlots([])),
    "This message fills no values, so Value 1 has nothing to take.",
  );
  const zero = validateSmsVersion({ body: "Hi {{0}}" }, 2, "en_US");
  assert.equal(
    namedProblem(zero, WORDS(null, "Hi {{0}}"), labels),
    "Value 0 is not one of this message's values: it has First name and Date.",
  );
  for (const said of [
    namedProblem(check, WORDS("Hours", "Hi {{5}}"), labels),
    namedProblem(none, WORDS(null, "Hi {{1}}"), numberedSlots([])),
  ]) {
    assert.ok(!said.includes("{{"), said);
  }
});

test("the unknown slot is found in the subject first, as the check finds it, and in the body after", () => {
  const labels = numberedSlots(["First name", "Date"]);
  const both = validateEmailVersion({ subject: "Hi {{7}}", body: "Hi {{5}}" }, 2);
  assert.equal(namedProblem(both, WORDS("Hi {{7}}", "Hi {{5}}"), labels).split(" ")[1], "7");
  const body = validateEmailVersion({ subject: "Hi {{1}}", body: "Hi {{5}}" }, 2);
  assert.equal(namedProblem(body, WORDS("Hi {{1}}", "Hi {{5}}"), labels).split(" ")[1], "5");
});

test("what is not the slot rule's is the check's own sentence, and a version that passes has no problem", () => {
  const labels = numberedSlots(["First name", "Date"]);
  const noSubject = validateEmailVersion({ subject: "", body: "Hi {{5}}" }, 2);
  assert.equal(
    namedProblem(noSubject, WORDS("", "Hi {{5}}"), labels),
    "Give the email a subject.",
    "the first thing wrong, as said",
  );
  const empty = validateSmsVersion({ body: "" }, 2, "en_US");
  assert.equal(namedProblem(empty, WORDS(null, ""), labels), "Write the text.");
  const fine = validateOwnVersion("email", { subject: "Hours", body: "Hi {{1}}" }, 2, "en_US");
  assert.equal(namedProblem(fine, WORDS("Hours", "Hi {{1}}"), labels), null);
});

/* ---------------------------------- a reach-out's named slots (step 5) ---------------------------------- */

const SIX = REACH_OUT_SLOT_SET;
const named = (key) => ({ kind: "slot", slot: key });

test("a reach-out's words are parts over its six named slots: a name is a slot, and a name with a space in it is one slot", () => {
  assert.deepEqual(toSlotParts("Hi {{business}}, from {{your business}}.", SIX), [
    text("Hi "),
    named("business"),
    text(", from "),
    named("your business"),
    text("."),
  ]);
  assert.deepEqual(toSlotParts("{{opening}}{{booking link}}", SIX), [named("opening"), named("booking link")]);
  // The same words read as numbered slots have none, and a number is a name the six do not list: which slots there are
  // is the message's, never the words'.
  assert.deepEqual(toSlotParts("Hi {{business}}"), [text("Hi {{business}}")]);
  assert.deepEqual(toSlotParts("Hi {{1}}", SIX), [text("Hi "), named("1")]);
});

test("a name the message does not list is a slot too, to be drawn and refused; one written in capitals or with extra spaces is the slot it names", () => {
  assert.deepEqual(toSlotParts("{{first name}} and {{city}}", SIX), [
    named("first name"),
    text(" and "),
    named("city"),
  ]);
  // Capitals and extra spaces: the check and the fill read them as slots, so the editor draws them as chips and keeps how
  // each was written. A name of nothing at all is words: no slot is there, and the fill puts no value there either.
  const how = (key, as) => ({ kind: "slot", slot: key, written: as });
  assert.deepEqual(toSlotParts("{{ Business }}", SIX), [how("business", "{{ Business }}")]);
  assert.deepEqual(toSlotParts("{{YOUR   business}}", SIX), [how("your business", "{{YOUR   business}}")]);
  assert.deepEqual(toSlotParts("{{your\nname}}", SIX), [how("your name", "{{your\nname}}")]);
  for (const words of ["{{}}", "{{ }}"])
    assert.deepEqual(toSlotParts(words, SIX), [text(words)], JSON.stringify(words));
  assert.deepEqual(
    toSlotParts("{{{business}}}", SIX),
    [text("{"), named("business"), text("}")],
    "spare braces are words",
  );
  assert.deepEqual(toSlotParts("{business} {{business", SIX), [text("{business} {{business")]);
});

test("the stored words never change on the way through the parts, for named slots as for numbered: over a thousand made-up strings", () => {
  let seed = 20261004;
  const next = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const alphabet = [
    "{",
    "}",
    "{{",
    "}}",
    "business",
    "your name",
    "{{business}}",
    "{{your name}}",
    "{{ City }}",
    "{{}}",
    " ",
    "\n",
    "é",
    "{{opening}}",
  ];
  for (let run = 0; run < 1200; run += 1) {
    const words = Array.from({ length: next(14) }, () => alphabet[next(alphabet.length)]).join("");
    const parts = toSlotParts(words, SIX);
    assert.equal(fromSlotParts(parts), words, JSON.stringify(words));
    assert.deepEqual(
      toSlotParts(fromSlotParts(parts), SIX),
      parts,
      "parts, written and read again, are the same parts",
    );
    parts.forEach((p, i) => {
      if (p.kind === "text")
        assert.notEqual(parts[i + 1]?.kind, "text", `two runs of words together in ${JSON.stringify(words)}`);
    });
  }
});

test("a named slot put in goes where the caret is, whole; Backspace and Delete take it as one thing", () => {
  assert.deepEqual(insertSlot("Hi , sign", "your name", 3, 3), { text: "Hi {{your name}}, sign", caret: 16 });
  assert.deepEqual(insertSlot("", "opening", 0, 0), { text: "{{opening}}", caret: 11 });
  assert.deepEqual(eraseSlot("Hi {{your name}}!", 16, 16, "back", SIX), { text: "Hi !", caret: 3 });
  assert.deepEqual(eraseSlot("Hi {{your name}}!", 3, 3, "forward", SIX), { text: "Hi !", caret: 3 });
  assert.equal(
    eraseSlot("Hi {{your name}}!", 4, 4, "back", SIX),
    null,
    "inside the braces is never a place the caret stands",
  );
  assert.deepEqual(
    eraseSlot("{{ Your Name }}", 15, 15, "back", SIX),
    { text: "", caret: 0 },
    "a spelling of a slot goes whole as it was written",
  );
  assert.equal(eraseSlot("{{ }}", 5, 5, "back", SIX), null, "braces that name nothing are words");
});

test("a named slot is called what the set calls it, and a name it does not list is called as it was written", () => {
  assert.equal(slotLabel(SIX, "your business"), "Your business");
  assert.equal(slotLabel(SIX, "business"), "Their business");
  assert.equal(slotLabel(SIX, "nickname"), "nickname");
  assert.deepEqual(
    ["opening", "business", "city", "your name", "your business", "booking link", "first name", "nickname"].map((k) =>
      slotKnown(SIX, k),
    ),
    [true, true, true, true, true, true, true, false],
    "a company's addressee's first name is a slot too (00430)",
  );
});

test("a named set's sentences already name its slots: the editor says the check's own words as they are", () => {
  const rules = reachOutRules(true);
  const check = validateEmailVersion({ subject: "Hi", body: "Hello {{nickname}}" }, rules);
  assert.equal(check.ok, false);
  assert.equal(namedProblem(check, WORDS("Hi", "Hello {{nickname}}"), SIX), check.error);
  assert.equal(
    namedProblem(validateEmailVersion({ subject: "Hi", body: "Hello {{business}}" }, rules), WORDS("Hi", "x"), SIX),
    null,
  );
});

test("a reach-out's email goes through the editor's parts and back with its named slots, and the one check passes it as it did", () => {
  const email = {
    subject: "A quick one for {{business}}",
    body: "{{opening}}\n\nI run {{your business}}, and we help businesses in {{city}}.\n\nFifteen minutes? {{booking link}}\n\n{{your name}}",
  };
  for (const words of [email.subject, email.body]) {
    const parts = toSlotParts(words, SIX);
    assert.equal(fromSlotParts(parts), words, "the stored words are what the editor leaves");
    // Every slot the words name is a part of the editor's, so no slot is words and none is lost.
    assert.deepEqual(
      parts.flatMap((p) => (p.kind === "slot" ? [p.slot] : [])),
      [...words.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[1]),
    );
  }
  const check = validateEmailVersion(email, reachOutRules(true));
  assert.deepEqual(check, { ok: true, value: email, warnings: [] });
});

/* ---------------------------------- the editor and the send read the same slots ---------------------------------- */

// Every way of writing braces round a number or a name that a person might meet, a fault or not: for each, what the editor
// draws as a chip must be exactly what the fill puts a value in, in both directions.
const NUMBERED_SPELLINGS = [
  "{{1}}",
  "{{01}}",
  "{{001}}",
  "{{10}}",
  "{{010}}",
  "{{0}}",
  "{{00}}",
  "{{ 1 }}",
  "{{1 }}",
  "{{ 1}}",
  "{{1.0}}",
  "{{+1}}",
  "{{-1}}",
  "{{\u0661}}",
  "{{99999999999999999999}}",
  "{{}}",
  "{{{1}}}",
  "{1}",
  "{{1}",
];
const NAMED_SPELLINGS = [
  "{{business}}",
  "{{ business }}",
  "{{Business}}",
  "{{BUSINESS}}",
  "{{your name}}",
  "{{ Your Name }}",
  "{{your  name}}",
  "{{your\tname}}",
  "{{your\nname}}",
  "{{first name}}",
  "{{}}",
  "{{ }}",
  "{{{business}}}",
  "{business}",
  "{{business}",
];

/** The slots of a set, each valued as its own key in capitals, so a filled slot is told from a left one. */
const valuesOf = (set) => set.keys.map((k) => `<${k.toUpperCase()}>`);

test("a spelling is a chip to the editor exactly when the send fills it: no slot is plain words to one and a slot to the other", () => {
  const sets = [
    ["numbered", numberedSlots(["First name", "Date", "Link"])],
    ["reach-out", REACH_OUT_SLOT_SET],
  ];
  for (const [which, set] of sets) {
    const values = valuesOf(set);
    for (const spelling of which === "numbered" ? NUMBERED_SPELLINGS : NAMED_SPELLINGS) {
      for (const words of [spelling, `Hi ${spelling}, ok`, `${spelling}${spelling}`]) {
        const parts = toSlotParts(words, set);
        const chips = parts.filter((p) => p.kind === "slot");
        // The send fills a slot where it has a value: a key the set has. The editor draws a chip there, and only there are the
        // words changed by the fill.
        const filled = fillSlots(words, values, set);
        const filledByParts = parts
          .map((p) => (p.kind === "text" ? p.text : (values[set.keys.indexOf(p.slot)] ?? partWritten(p))))
          .join("");
        assert.equal(filledByParts, filled, `${which}: ${JSON.stringify(words)}: the chips are what the fill fills`);
        // And the words left as words hold nothing the fill would have filled: no plain run of them has a slot of the set.
        for (const part of parts) {
          if (part.kind === "text")
            assert.equal(
              fillSlots(part.text, values, set),
              part.text,
              `${which}: ${JSON.stringify(words)}: words filled`,
            );
        }
        // The check reads the same slots: a numbered message's text passes where every chip is one of its slots, and is
        // refused, in the chip's own name, where one is not.
        if (which === "numbered")
          for (const chip of chips) {
            const verdict = validateSmsVersion({ body: `Hi ${partWritten(chip)}` }, set.keys.length, "en_US");
            assert.equal(
              verdict.ok,
              set.keys.includes(chip.slot),
              `${JSON.stringify(partWritten(chip))} is the check's slot too`,
            );
          }
        // The stored words never change on the way through the parts.
        assert.equal(fromSlotParts(parts), words, `${which}: ${JSON.stringify(words)} comes back as it was`);
      }
    }
  }
});

test("a slot the editor draws is filled by the send, in the spelling it was written: {{01}} and {{ Your Name }} take their values", () => {
  const set = numberedSlots(["First name", "Date"]);
  assert.equal(fillSlots("Hi {{01}}, {{2}} and {{002}}", ["Rosa", "Friday"], set), "Hi Rosa, Friday and Friday");
  assert.deepEqual(
    toSlotParts("Hi {{01}}", set).map((p) => p.kind),
    ["text", "slot"],
    "and the editor draws {{01}} as the chip it is",
  );
  const values = SIX.keys.map((k) => `<${k}>`);
  assert.equal(fillSlots("{{ Your Name }} from {{BUSINESS}}", values, SIX), "<your name> from <business>");
  assert.deepEqual(
    toSlotParts("{{ Your Name }} from {{BUSINESS}}", SIX).map((p) => p.kind),
    ["slot", "text", "slot"],
  );
});

/* ---------------------------------- a limit an input method went past ---------------------------------- */

test("words kept to a limit lose what is over from the letters nearest the caret, those before it first, never a slot", () => {
  assert.deepEqual(clampWords("short", 5, 10), { text: "short", caret: 5 }, "within the limit: as it was");
  assert.deepEqual(
    clampWords("abcdef", 6, 4),
    { text: "abcd", caret: 4 },
    "an edit that ended at the end loses its tail",
  );
  assert.deepEqual(clampWords("abcdef", 3, 4), { text: "adef", caret: 1 }, "the letters before the caret go first");
  assert.deepEqual(
    clampWords("abcdef", 1, 4),
    { text: "cdef", caret: 0 },
    "then, with none left before it, those after",
  );
  assert.deepEqual(clampWords("abcdef", 0, 4), { text: "cdef", caret: 0 }, "a caret at the start: the ones after it");
  assert.deepEqual(clampWords("abc", 3, 0), { text: "", caret: 0 });
  assert.deepEqual(clampWords("abc", 3, -5), { text: "", caret: 0 }, "a limit below nothing is nothing");
});

test("a clamp never cuts a slot or half a character: the slots stay whole, and a pair of units goes as one", () => {
  // "Hi {{1}}" is 8 long: over a limit of 6, the letters go and the slot stays.
  assert.deepEqual(clampWords("Hi {{1}}", 8, 6), { text: "H{{1}}", caret: 6 }, "the slot is held, so the words go");
  assert.deepEqual(clampWords("{{1}}abcd", 9, 7), { text: "{{1}}ab", caret: 7 });
  assert.deepEqual(clampWords("{{01}}xy", 8, 7), { text: "{{01}}x", caret: 7 }, "a slot in any spelling is held");
  const named = { kind: "named" };
  assert.deepEqual(clampWords("{{ Your Name }}abc", 18, 16, named), { text: "{{ Your Name }}a", caret: 16 });
  // Two units of one character: 😀 is a pair, and an over of one takes the pair whole.
  assert.deepEqual(clampWords("ab😀", 4, 3), { text: "ab", caret: 2 });
  assert.deepEqual(clampWords("😀😀", 4, 3), { text: "😀", caret: 2 });
  // Where slots alone are over, nothing else can go, and what is left is slots.
  assert.deepEqual(clampWords("{{1}}{{2}}", 10, 4), { text: "{{1}}{{2}}", caret: 10 });
});

test("and over a thousand made-up strings: a clamp is within the limit whenever it can be, keeps every slot, and keeps the caret in the words", () => {
  let seed = 20261005;
  const next = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const alphabet = ["a", "b", " ", "{{1}}", "{{01}}", "{{2}}", "é", "😀", "{", "}", "\n"];
  for (let run = 0; run < 1200; run += 1) {
    const words = Array.from({ length: next(12) }, () => alphabet[next(alphabet.length)]).join("");
    const caret = next(words.length + 1);
    const max = next(14);
    const kept = clampWords(words, caret, max);
    const slotsBefore = toSlotParts(words).filter((p) => p.kind === "slot").length;
    const slotsAfter = toSlotParts(kept.text).filter((p) => p.kind === "slot").length;
    const room =
      words.length -
      [...toSlotParts(words)].flatMap((p) => (p.kind === "slot" ? [partWritten(p)] : [])).join("").length;
    assert.ok(slotsAfter >= slotsBefore, `${JSON.stringify(words)} keeps its slots`);
    assert.ok(kept.caret >= 0 && kept.caret <= kept.text.length, `${JSON.stringify(words)} the caret is in the words`);
    if (words.length <= max) assert.equal(kept.text, words);
    else if (room >= words.length - max) assert.ok(kept.text.length <= max, `${JSON.stringify(words)} within ${max}`);
    assert.ok(
      !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(kept.text),
      "no half a character",
    );
  }
});

/* ------------------------------- what a moment can fill ------------------------------- */

/** A starter as WhatsApp holds it once approved: the library's words and slots. */
const starterRow = (key) => {
  const s = starterByKey(key);
  const t = starterText(s, "en_US");
  return {
    id: `tpl-${key}`,
    channel: "whatsapp",
    name: s.name,
    language: "en_US",
    meta_status: "approved",
    category: s.category,
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
  };
};

test("which slot a moment can fill (contracts slotChoices): what keeps a known slot true, anything for a guessed one; templateSlots refuses a message a moment cannot fill; playbookName is the route's", () => {
  const o = { known: true, visits: false, bookingLink: true };
  assert.deepEqual(slotChoices("first_name", o), ["first_name"]);
  assert.deepEqual(slotChoices("business_name", o), ["business_name", "text"]);
  assert.deepEqual(slotChoices("booking_link", o), ["booking_link", "text"]);
  assert.deepEqual(slotChoices("booking_link", { ...o, bookingLink: false }), ["text"]);
  // The review link the Google listing keeps (00415), as the booking link: offered where the one choosing knows of one.
  assert.deepEqual(slotChoices("review_link", { ...o, reviewLink: true }), ["review_link", "text"]);
  assert.deepEqual(slotChoices("review_link", { ...o, reviewLink: false }), ["text"]);
  assert.ok(slotChoices("text", { ...o, known: false, reviewLink: true }).includes("review_link"));
  assert.ok(!slotChoices("text", { ...o, known: false, reviewLink: false }).includes("review_link"));
  assert.deepEqual(slotChoices("visit_when", o), []);
  assert.deepEqual(slotChoices("visit_when", { ...o, visits: true }), ["visit_when"]);
  assert.deepEqual(slotChoices("text", o), ["text"]);
  assert.deepEqual(slotChoices("first_name", { ...o, known: false }), [
    "first_name",
    "text",
    "business_name",
    "booking_link",
  ]);
  assert.deepEqual(slotChoices("text", { known: false, visits: true, bookingLink: false }), [
    "text",
    "first_name",
    "business_name",
    "visit_when",
    "visit_service",
  ]);
  assert.equal(templateSlots(starterRow("visit_reminder"), { visits: false, bookingLink: true }), null);
  assert.equal(templateSlots(starterRow("visit_reminder"), { visits: true, bookingLink: true }).length, 4);
  // The follow-up (0006): its link is each proposal's, on its own moment alone, and a message with no slot for it is
  // not one the follow-up can send.
  const follow = { visits: false, bookingLink: true, proposal: true };
  assert.deepEqual(slotChoices("proposal_link", { ...o, proposal: true }), ["proposal_link"]);
  assert.deepEqual(slotChoices("proposal_link", { ...o, proposal: false }), []);
  assert.equal(templateSlots(starterRow("proposal_follow_up"), follow).length, 3);
  assert.equal(templateSlots(starterRow("proposal_follow_up"), { ...follow, proposal: false }), null);
  assert.equal(templateSlots(starterRow("winback_offer"), follow), null, "a win-back's words carry no proposal");
  assert.equal(
    templateSlots({ name: "our_own", variables: [{ position: 1 }] }, follow).length,
    1,
    "a message written elsewhere may have its slot filled with the link",
  );
  assert.equal(playbookName({ id: "quiet_30", label: "Win-back" }, { name: "winback_offer" }), "Win-back");
  assert.equal(
    playbookName({ id: "quiet_30", label: "Win-back" }, { name: "autumn_offer", title: "Autumn offer" }),
    "Win-back · Autumn offer",
  );
});
