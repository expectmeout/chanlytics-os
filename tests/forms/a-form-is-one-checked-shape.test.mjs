/**
 * A request form is one checked shape (the Forms plan, 3.7): what AI writes, what the page draws and what the door checks
 * an entry against. A version's fields are a list, each with an id that never changes, a kind (eight, from the start), its
 * words, whether it is needed, and its choices where it has them; at most 12 fields and 12 choices, each answer its own
 * length. A form reaches the person: it asks for an email address or a phone number. And an entry's answers are read
 * against the version the visitor saw: a needed answer missing, too long, or a choice the field does not hold is said in
 * words beside its field; a likely typo in an address is offered as a fix, never refused.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { FormDescription, formDescriptionProblems } = await import(at("packages/contracts/src/forms/shape.ts"));
const { FORM_LIMITS } = await import(at("packages/contracts/src/forms/limits.ts"));
const { readFormAnswers } = await import(at("packages/contracts/src/forms/answers.ts"));
const { emailTypoFix } = await import(at("packages/contracts/src/forms/email-typo.ts"));
const { formProblemWords } = await import(at("packages/contracts/src/forms/page-words.ts"));

/** A consultation form as AI drafts one (the canvas's Colour consultation). */
const consult = () => ({
  heading: "Colour consultation",
  intro: "Tell us about the colour you'd love. Maria or Jo will reply within a day.",
  lang: "en",
  thanks: "Thanks, we have your request. Maria or Jo will reply within a day.",
  fields: [
    { id: "f1name", kind: "short", label: "Your name", needed: true },
    { id: "f2mail", kind: "email", label: "Email", needed: true },
    { id: "f3phon", kind: "phone", label: "Phone", help: "If you'd rather we call or message you", needed: false },
    { id: "f4want", kind: "long", label: "What would you like?", needed: true },
    {
      id: "f5who0",
      kind: "one",
      label: "Who would you like?",
      needed: true,
      choices: [
        { id: "c1", label: "Maria" },
        { id: "c2", label: "Jo" },
        { id: "c3", label: "No preference" },
      ],
    },
    {
      id: "f6when",
      kind: "when",
      label: "When suits you?",
      needed: false,
      choices: [
        { id: "c1", label: "Weekday mornings" },
        { id: "c2", label: "Weekday evenings" },
        { id: "c3", label: "Saturdays" },
      ],
    },
  ],
  next: { chat: true, draft: true, follow_up: false },
});

test("a form AI drafts is the shape, and its problems are none", () => {
  const parsed = FormDescription.safeParse(consult());
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  assert.deepEqual(formDescriptionProblems(parsed.data), []);
});

test("the eight kinds, and no other", () => {
  const kinds = ["short", "long", "email", "phone", "service", "one", "several", "when"];
  for (const kind of kinds) {
    const form = consult();
    const choices = ["service", "one", "several", "when"].includes(kind)
      ? [
          { id: "c1", label: "A" },
          { id: "c2", label: "B" },
        ]
      : undefined;
    form.fields.push({ id: "f7more", kind, label: "More", needed: false, ...(choices ? { choices } : {}) });
    assert.equal(FormDescription.safeParse(form).success, true, kind);
  }
  const photo = consult();
  photo.fields.push({ id: "f7pics", kind: "photo", label: "A photo", needed: false });
  assert.equal(FormDescription.safeParse(photo).success, false, "a photo is F6's");
});

test("the limits are the shape's: 12 fields, 12 choices, nothing else carried", () => {
  assert.equal(FORM_LIMITS.fields, 12);
  assert.equal(FORM_LIMITS.choices, 12);
  const many = consult();
  for (let i = 0; i < 7; i++) many.fields.push({ id: `fx${i}aaa`, kind: "short", label: `Q${i}`, needed: false });
  assert.equal(FormDescription.safeParse(many).success, false, "13 fields");
  const choices = consult();
  choices.fields[4].choices = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, label: `S${i}` }));
  assert.equal(FormDescription.safeParse(choices).success, false, "13 choices");
  const extra = { ...consult(), script: "<script>" };
  assert.equal(FormDescription.safeParse(extra).success, false, "a key the shape does not name");
});

test("what the shape alone cannot say is a problem with its words", () => {
  const twice = consult();
  twice.fields[1].id = "f1name";
  assert.match(formDescriptionProblems(FormDescription.parse(twice)).join(" "), /twice/);

  const noWay = consult();
  noWay.fields = noWay.fields.filter((f) => f.kind !== "email" && f.kind !== "phone");
  assert.match(formDescriptionProblems(FormDescription.parse(noWay)).join(" "), /email address or a phone number/);

  const oneChoice = consult();
  oneChoice.fields[4].choices = [{ id: "c1", label: "Maria" }];
  assert.match(formDescriptionProblems(FormDescription.parse(oneChoice)).join(" "), /two choices/);

  const noChoices = consult();
  delete noChoices.fields[4].choices;
  assert.match(formDescriptionProblems(FormDescription.parse(noChoices)).join(" "), /two choices/);

  const choiceOnText = consult();
  choiceOnText.fields[0].choices = [
    { id: "c1", label: "A" },
    { id: "c2", label: "B" },
  ];
  assert.match(formDescriptionProblems(FormDescription.parse(choiceOnText)).join(" "), /no choices/);
});

test("an entry's answers, read against the version the visitor saw", () => {
  const form = FormDescription.parse(consult());
  const read = readFormAnswers(form, {
    f1name: "  Ana Ruiz ",
    f2mail: "Ana.Ruiz@Gmail.com",
    f3phon: "",
    f4want: "Dark brown now. A warm, soft blonde for spring.",
    f5who0: "c1",
    f6when: "c3",
    stray: "a field this version does not hold",
  });
  assert.deepEqual(read.problems, {});
  assert.deepEqual(read.answers, {
    f1name: "Ana Ruiz",
    f2mail: "ana.ruiz@gmail.com",
    f4want: "Dark brown now. A warm, soft blonde for spring.",
    f5who0: "c1",
    f6when: "c3",
  });
  assert.deepEqual(read.reach, { name: "Ana Ruiz", email: "ana.ruiz@gmail.com", phone: null });
});

test("a needed answer missing, an answer too long, a choice it does not hold: each said beside its field", () => {
  const form = FormDescription.parse(consult());
  const read = readFormAnswers(form, {
    f1name: "Ana",
    f2mail: "ana@example.com",
    f4want: "x".repeat(FORM_LIMITS.long + 1),
    f5who0: "c9",
  });
  assert.deepEqual(Object.keys(read.problems).sort(), ["f4want", "f5who0"]);
  assert.deepEqual(read.problems, { f4want: "too_long", f5who0: "one_choice" });
  const empty = readFormAnswers(form, { f1name: "Ana", f2mail: "ana@example.com", f5who0: "c1" });
  assert.deepEqual(empty.problems, { f4want: "needed" });
});

test("several choices take several, each once, none it does not hold", () => {
  const form = consult();
  form.fields[5].kind = "several";
  const parsed = FormDescription.parse(form);
  const base = { f1name: "A", f2mail: "a@example.com", f4want: "x", f5who0: "c2" };
  assert.deepEqual(readFormAnswers(parsed, { ...base, f6when: ["c1", "c3", "c1"] }).answers.f6when, ["c1", "c3"]);
  assert.equal(readFormAnswers(parsed, { ...base, f6when: ["c1", "c8"] }).problems.f6when, "not_a_choice");
});

test("a person is reached by the address or the number: with neither, the entry is refused by the email's field", () => {
  const form = consult();
  form.fields[1].needed = false;
  const parsed = FormDescription.parse(form);
  const none = readFormAnswers(parsed, { f1name: "Ana", f4want: "x", f5who0: "c1" });
  assert.equal(none.problems.f2mail, "no_way_to_answer", "an email or a phone is needed to answer them");
  const phoneOnly = readFormAnswers(parsed, { f1name: "Dana", f3phon: "+1 786 555 0199", f4want: "x", f5who0: "c3" });
  assert.deepEqual(phoneOnly.problems, {});
  assert.deepEqual(phoneOnly.reach, { name: "Dana", email: null, phone: "+17865550199" });
});

test("a malformed address is refused; a likely typo is offered as a fix, never refused", () => {
  const form = FormDescription.parse(consult());
  const bad = readFormAnswers(form, { f1name: "A", f2mail: "not an address", f4want: "x", f5who0: "c1" });
  assert.equal(bad.problems.f2mail, "not_an_email");
  assert.equal(emailTypoFix("ana.ruiz@gmial.com"), "ana.ruiz@gmail.com");
  assert.equal(emailTypoFix("ana@hotmial.com"), "ana@hotmail.com");
  assert.equal(emailTypoFix("ana@yahoo.con"), "ana@yahoo.com");
  assert.equal(emailTypoFix("ana@gmail.com"), null);
  assert.equal(emailTypoFix("ana@lumasalon.com"), null, "a business's own domain is never 'fixed'");
  const typo = readFormAnswers(form, { f1name: "A", f2mail: "ana@gmial.com", f4want: "x", f5who0: "c1" });
  assert.deepEqual(typo.problems, {}, "a typo is the visitor's to fix, not a refusal");
});

test("a mistake is a code, said beside its field in the form's own language", () => {
  const form = FormDescription.parse(consult());
  const want = form.fields[3];
  const spanish = { ...form, lang: "es-MX" };
  assert.match(formProblemWords("needed", want, form), /What would you like\?.*needs an answer/);
  assert.match(formProblemWords("too_long", want, form), new RegExp(String(FORM_LIMITS.long)));
  assert.match(formProblemWords("too_long", form.fields[0], form), new RegExp(String(FORM_LIMITS.short)));
  assert.match(formProblemWords("not_an_email", form.fields[1], spanish), /correo/);
  assert.match(formProblemWords("needed", want, spanish), /necesita una respuesta/);
  assert.equal(
    formProblemWords("not_a_phone", form.fields[2], { ...form, lang: "ht" }),
    formProblemWords("not_a_phone", form.fields[2], form),
    "a language with no words yet is said in English",
  );
});

test("what happens next names a chat, whichever the business has", () => {
  const old = { ...consult(), next: { whatsapp: true, draft: true, follow_up: false } };
  assert.equal(FormDescription.safeParse(old).success, false, "the setting is the chat's, not one channel's");
});
