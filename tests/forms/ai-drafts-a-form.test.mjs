/**
 * What AI's form drafter is handed and what code holds its answer to (the Forms plan, 3.7 and 3.8): AI writes the
 * heading, the questions and the thank-you; code gives every field the id it keeps for good, lets a service question
 * name only what Services holds, refuses a form that could not be answered or that promises when the business will
 * reply, and decides what happens next itself (the chat where the business has one; the follow-up off). A change keeps
 * the ids of the questions it keeps, so a request that came on the version before still reads against its own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { FormDescription, formDescriptionProblems } = await import(at("packages/contracts/src/forms/shape.ts"));
const { formBriefText, formFromAnswer, formSlugOf, FormCraftAnswerSchema, FORM_CRAFT_JSON_SCHEMA } = await import(
  at("packages/contracts/src/ask/skills/form/brief.ts")
);

const brief = (over = {}) => ({
  job: "draft",
  sentence: "A consultation form for new colour clients: what they want, who, and when they're free",
  business: { name: "Luma Salon", about: "Hair colour, cuts and treatments", tone: "Warm and plain" },
  services: ["Balayage", "Full colour", "Toner"],
  language: "en",
  chat: true,
  ...over,
});

/** A draft as the model answers it: labels and choices in words, no ids. */
const answer = (over = {}) =>
  FormCraftAnswerSchema.parse({
    ask: "",
    heading: "Colour consultation",
    intro: "Tell us about the colour you'd love, and we'll get back to you.",
    lang: "en",
    thanks: "Thanks, we have your request.",
    fields: [
      { id: "", kind: "short", label: "Your name", help: "", needed: true, choices: [] },
      { id: "", kind: "email", label: "Email", help: "", needed: true, choices: [] },
      {
        id: "",
        kind: "long",
        label: "What would you like?",
        help: "Your colour now, and the colour you'd love",
        needed: true,
        choices: [],
      },
      {
        id: "",
        kind: "service",
        label: "Which service?",
        help: "",
        needed: false,
        choices: ["Balayage", "full colour", "Keratin"],
      },
    ],
    words: [],
    said: "",
    ...over,
  });

let n = 0;
const ids = () => `q${++n}`;

test("the brief says the business, its services and the owner's own words, fenced, and what the form may ask", () => {
  const text = formBriefText(brief());
  assert.match(text, /The business: Luma Salon\./);
  assert.match(text, /Balayage/);
  assert.match(text, /<record>\nA consultation form for new colour clients/);
  assert.match(text, /at most 12 questions/);
  assert.match(text, /Write it in English, unless the owner's words ask for another language\./);
  const change = formBriefText(
    brief({
      job: "change",
      sentence: "Make it shorter",
      draft: FormDescription.parse(formFromAnswer(answer(), brief(), ids).form),
    }),
  );
  assert.match(change, /The form as it stands/);
  assert.match(change, /keep its id/i);
});

test("a draft becomes a form: every field with an id of its own, a service question naming only what Services holds, next decided by code", () => {
  n = 0;
  const made = formFromAnswer(answer(), brief(), ids);
  assert.deepEqual(made.problems, []);
  const form = FormDescription.parse(made.form);
  assert.deepEqual(formDescriptionProblems(form), []);
  assert.deepEqual(
    form.fields.map((f) => f.id),
    ["q1", "q2", "q3", "q4"],
  );
  assert.deepEqual(
    form.fields[3].choices.map((c) => c.label),
    ["Balayage", "Full colour"],
    "said as Services says it, and one the business does not offer is not asked",
  );
  assert.deepEqual(form.next, { chat: true, draft: true, follow_up: false });
  assert.equal(form.fields[2].help, "Your colour now, and the colour you'd love");
  assert.equal("help" in form.fields[0], false, "an empty help is no help");
  assert.equal(formFromAnswer(answer(), brief({ chat: false }), ids).form.next.chat, false);
});

test("a sentence with no form in it is answered with one question back, and no form", () => {
  const made = formFromAnswer(answer({ ask: "What should people ask you for?", fields: [] }), brief(), ids);
  assert.equal(made.ask, "What should people ask you for?");
  assert.equal(made.form, null);
});

test("what AI may not write is a problem handed back, never a form: no way to answer, a promised time, too few choices", () => {
  const noWay = formFromAnswer(answer({ fields: answer().fields.filter((f) => f.kind !== "email") }), brief(), ids);
  assert.equal(noWay.form, null);
  assert.match(noWay.problems.join(" "), /email address or a phone number/);
  const promised = formFromAnswer(answer({ thanks: "Thanks! Maria will reply within a day." }), brief(), ids);
  assert.equal(promised.form, null);
  assert.match(promised.problems.join(" "), /when the business will reply/);
  const kept = formFromAnswer(
    answer({ thanks: "Thanks! We reply within a day." }),
    brief({ sentence: "A consultation form; say we reply within a day" }),
    ids,
  );
  assert.deepEqual(kept.problems, [], "the owner's own promise is theirs to make");
  const oneService = formFromAnswer(
    answer({
      fields: [
        ...answer().fields.slice(0, 3),
        { id: "", kind: "service", label: "Which service?", help: "", needed: false, choices: ["Balayage", "Keratin"] },
      ],
    }),
    brief(),
    ids,
  );
  assert.match(oneService.problems.join(" "), /two choices/);
});

test("a change keeps the id of every question it keeps, and of every choice it keeps", () => {
  n = 0;
  const first = FormDescription.parse(
    formFromAnswer(
      answer({
        fields: [
          ...answer().fields,
          { id: "", kind: "one", label: "Who would you like?", help: "", needed: false, choices: ["Maria", "Jo"] },
        ],
      }),
      brief(),
      ids,
    ).form,
  );
  const who = first.fields[4];
  const changed = formFromAnswer(
    answer({
      fields: [
        { id: first.fields[1].id, kind: "email", label: "Your email", help: "", needed: true, choices: [] },
        { id: first.fields[0].id, kind: "short", label: "Your name", help: "", needed: true, choices: [] },
        {
          id: who.id,
          kind: "one",
          label: "Who would you like?",
          help: "",
          needed: false,
          choices: ["Jo", "Maria", "No preference"],
        },
        { id: "made-up", kind: "long", label: "Anything else?", help: "", needed: false, choices: [] },
      ],
      said: "Shorter: four questions.",
    }),
    brief({ job: "change", sentence: "Make it shorter", draft: first }),
    ids,
  );
  const form = FormDescription.parse(changed.form);
  assert.deepEqual(
    form.fields.slice(0, 3).map((f) => f.id),
    [first.fields[1].id, first.fields[0].id, who.id],
  );
  assert.notEqual(form.fields[3].id, "made-up", "an id the draft never had is a new question's own");
  const idOf = (label) => who.choices.find((c) => c.label === label).id;
  assert.deepEqual(
    form.fields[2].choices.slice(0, 2).map((c) => c.id),
    [idOf("Jo"), idOf("Maria")],
  );
  assert.equal(changed.said, "Shorter: four questions.");
});

test("a form in another language carries the page's own lines; English and Spanish never do", () => {
  const pt = formFromAnswer(
    answer({
      lang: "pt",
      words: [
        { key: "send", line: "Enviar pedido" },
        { key: "nonsense", line: "x" },
      ],
    }),
    brief({ language: "pt" }),
    ids,
  );
  assert.deepEqual(pt.form.words, { send: "Enviar pedido" });
  assert.equal(
    "words" in formFromAnswer(answer({ words: [{ key: "send", line: "Send it" }] }), brief(), ids).form,
    false,
  );
});

test("the answer's schema names every part the model must write", () => {
  assert.deepEqual(FORM_CRAFT_JSON_SCHEMA.required, [
    "ask",
    "heading",
    "intro",
    "lang",
    "thanks",
    "fields",
    "words",
    "said",
  ]);
  assert.equal(FORM_CRAFT_JSON_SCHEMA.additionalProperties, false);
});

test("a form's address is its heading in plain letters, never a word the business's page keeps for itself", () => {
  assert.equal(formSlugOf("Colour consultation"), "colour-consultation");
  assert.equal(formSlugOf("Consulta de color: ¡niños!"), "consulta-de-color-ninos");
  assert.equal(formSlugOf("Terms"), "terms-form");
  assert.equal(formSlugOf("  ???  "), "form");
  assert.ok(formSlugOf("x".repeat(200)).length <= 60);
});
