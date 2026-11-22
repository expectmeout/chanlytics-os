/**
 * What AI's form drafter is handed and what it answers (the Forms plan, 3.7 and 3.8): a form drafted from its owner's
 * sentence, one change to a draft said in their words, or one question proposed for it.
 *
 * AI writes the words: a heading, the questions with their help and their choices, the thank-you. Code does the rest,
 * and holds what was written before anyone sees it (`formFromAnswer`): every field gets an id it keeps for good (a
 * change keeps the id of every question and choice it keeps, so a request on the version before still reads against
 * its own); a service question names only what Services holds; a form with no way to answer the person, or one that
 * promises when the business will reply, is a problem handed back; and what happens next is the workspace's own (the
 * chat where it has one, the follow-up off until its owner turns it on). Pure.
 */
import { z } from "zod";
import { fenced } from "../../../ai/fence";
import { foldName } from "../../../calendar/service-offer";
import {
  FORM_PAGE_WORD_KEYS,
  FormDescription,
  formDescriptionProblems,
  type FormField,
  type FormPageWordKey,
} from "../../../forms/shape";
import { CHOICE_KINDS, FORM_FIELD_KINDS, FORM_LIMITS } from "../../../forms/limits";

/** What the drafter is asked for: a whole form, a change to one, or one question to add. */
export type FormJob = "draft" | "change" | "question";

/** What the drafter is handed. */
export interface FormBrief {
  job: FormJob;
  /** What the owner typed: what the form is for, the change they want, or what they want to ask. */
  sentence: string;
  business: { name: string; about: string | null; tone: string | null };
  /** What the business offers, as Services says it: a service question may name these and no others. */
  services: readonly string[];
  /** The language the form is in unless the owner's words ask for another: the workspace's own. */
  language: string;
  /** Whether the business has a chat a visitor can carry on in. */
  chat: boolean;
  /** `change` and `question`: the form as it stands. */
  draft?: FormDescription | undefined;
}

const LANGUAGE_NAMES: Record<string, string> = { en: "English", es: "Spanish", pt: "Portuguese", ht: "Haitian Creole" };
const languageName = (lang: string): string => LANGUAGE_NAMES[lang.slice(0, 2).toLowerCase()] ?? lang;

const SENTENCE_MAX = 600;

/** The form as it stands, a line a question: its id, its kind, its words, and its choices. */
function draftLines(form: FormDescription): string {
  return [
    `heading: ${form.heading}`,
    ...(form.intro ? [`intro: ${form.intro}`] : []),
    `language: ${form.lang}`,
    ...form.fields.map(
      (field) =>
        `- id ${field.id} · ${field.kind} · ${field.needed ? "needed" : "optional"} · ${field.label}${
          field.help ? ` (help: ${field.help})` : ""
        }${field.choices?.length ? ` · choices: ${field.choices.map((choice) => choice.label).join(" | ")}` : ""}`,
    ),
    `thank-you: ${form.thanks}`,
  ].join("\n");
}

const JOB_LINES: Record<FormJob, string> = {
  draft: "Draft the whole form from what the owner asked for.",
  change:
    "Make the one change the owner asked for, and write the whole form again. For every question you keep, keep its id, even where you change its words; give a new question an empty id. Say what you changed in `said`, in one short sentence to the owner.",
  question:
    "Propose the ONE question the owner wants to add: answer with that question alone in `fields`, its id empty, and say in `said`, in one short sentence, what it asks and why it is worth asking. Leave the heading, the intro and the thank-you as they stand.",
};

/** The drafter's brief, as the call reads it: the business, what it offers, the job, and the owner's own words, fenced. */
export function formBriefText(brief: FormBrief): string {
  const { business } = brief;
  return [
    [
      `The business: ${business.name}.`,
      business.about ? `What it does, in its own words:\n${fenced("record", business.about.slice(0, 600))}` : "",
      business.tone ? `Its tone, in its own words: ${business.tone}` : "",
      brief.services.length
        ? `What it offers, as its own list says it (a question of kind "service" may name only these):\n${fenced("record", brief.services.map((name) => `- ${name}`).join("\n"))}`
        : `It has listed no services: write no question of kind "service".`,
    ]
      .filter(Boolean)
      .join("\n"),
    brief.draft ? `The form as it stands:\n${fenced("record", draftLines(brief.draft))}` : "",
    [
      JOB_LINES[brief.job],
      `What the owner typed:\n${fenced("record", brief.sentence.trim().slice(0, SENTENCE_MAX))}`,
    ].join("\n"),
    [
      `Write it in ${languageName(brief.language)}, unless the owner's words ask for another language. Say the language you wrote in as \`lang\`, as its two-letter code.`,
      `A form has at most ${FORM_LIMITS.fields} questions, and a question at most ${FORM_LIMITS.choices} choices. Include only what the business needs to answer the request: fewer questions are filled in more often.`,
      "It must ask for an email address or a phone number, so the request can be answered. Ask the person's name first.",
      `The kinds of question: ${FORM_FIELD_KINDS.join(", ")}. "short" is a line, "long" a few lines, "one" one choice, "several" several choices, "when" the days or times of day that suit them, "service" one of the business's own services.`,
      "For a language other than English or Spanish, also write the page's own lines in that language as `words` (each by its key, keeping every part in braces as it is); for English or Spanish leave `words` empty.",
      "Where the owner's words hold no form to draft (a greeting, a question about something else), write nothing but one short question back to them in `ask`.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The answer's shape, as the model is asked for it: words only. Ids are code's. */
export const FORM_CRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ask", "heading", "intro", "lang", "thanks", "fields", "words", "said"],
  properties: {
    ask: { type: "string" },
    heading: { type: "string" },
    intro: { type: "string" },
    lang: { type: "string" },
    thanks: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "label", "help", "needed", "choices"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: FORM_FIELD_KINDS },
          label: { type: "string" },
          help: { type: "string" },
          needed: { type: "boolean" },
          choices: { type: "array", items: { type: "string" } },
        },
      },
    },
    words: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "line"],
        properties: { key: { type: "string" }, line: { type: "string" } },
      },
    },
    said: { type: "string" },
  },
} as const;

export const FormCraftAnswerSchema = z.object({
  ask: z.string().default(""),
  heading: z.string().default(""),
  intro: z.string().default(""),
  lang: z.string().default("en"),
  thanks: z.string().default(""),
  fields: z
    .array(
      z.object({
        id: z.string().default(""),
        kind: z.enum(FORM_FIELD_KINDS),
        label: z.string(),
        help: z.string().default(""),
        needed: z.boolean().default(false),
        choices: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  words: z.array(z.object({ key: z.string(), line: z.string() })).default([]),
  said: z.string().default(""),
});
export type FormCraftAnswer = z.infer<typeof FormCraftAnswerSchema>;

/**
 * A promise of when the business will reply, in a form's own words ("we reply within a day", "you'll hear from us
 * today"): a commitment in the mouth of someone who has not made it. Lower-cased words, English and Spanish.
 */
const REPLY_BY_A_TIME =
  /\b(?:repl(?:y|ies)|respond|answer|get back|be in touch|hear from|call you|write to you|contact you|respond(?:eremos|emos|erán)|contest(?:aremos|amos|arán))\b[^.!?\n]{0,40}\b(?:today|tonight|tomorrow|shortly|right away|asap|same day|within (?:the|an|a|\d+)|in (?:an|a|\d+) (?:hour|minute|day)s?|hoy|mañana|en (?:un|una|\d+) (?:hora|día|dia)s?)\b/;

const promisesATime = (words: string): boolean => REPLY_BY_A_TIME.test(words.toLowerCase().replace(/’/g, "'"));

/** Words on one line, single spaces, the ends trimmed, cut to what the shape holds. */
const tidy = (words: string, max: number): string => words.replace(/\s+/g, " ").trim().slice(0, max);

/** What the drafter's answer came to: a form, a question back to the owner, or what is wrong with what it wrote. */
export interface FormFromAnswer {
  form: FormDescription | null;
  /** One question back to the owner, where their words held no form. */
  ask: string | null;
  /** What it says it did, to the owner: a change's sentence, or why a question is worth asking. */
  said: string | null;
  /** What is wrong with what it wrote, each in a sentence it is handed back to mend; none where there is a form. */
  problems: string[];
}

/** The choices of a field as the form keeps them: a service's only where Services holds it, each with an id it keeps. */
function fieldChoicesOf(
  written: { kind: FormField["kind"]; choices: string[] },
  before: FormField | undefined,
  brief: FormBrief,
): NonNullable<FormField["choices"]> {
  const offered = new Map(brief.services.map((name) => [foldName(name.trim()), name.trim()]));
  const labels = written.choices
    .map((label) => tidy(label, FORM_LIMITS.label))
    .map((label) => (written.kind === "service" ? (offered.get(foldName(label)) ?? "") : label))
    .filter(Boolean);
  const kept = new Map((before?.choices ?? []).map((choice) => [foldName(choice.label), choice.id]));
  const taken = new Set<string>();
  let next = 1;
  return [...new Set(labels)].slice(0, FORM_LIMITS.choices).map((label) => {
    let id = kept.get(foldName(label));
    while (!id || taken.has(id)) id = `c${next++}`;
    taken.add(id);
    return { id, label };
  });
}

/**
 * The questions the drafter wrote, each with an id it keeps for good: one the draft already had keeps its own, and a
 * new one takes `newId`'s, never one a question of the draft holds.
 */
function fieldsFrom(answer: FormCraftAnswer, brief: FormBrief, newId: () => string): FormField[] {
  const beforeById = new Map((brief.draft?.fields ?? []).map((field) => [field.id, field]));
  const used = new Set<string>();
  return answer.fields.slice(0, FORM_LIMITS.fields).map((written) => {
    const before = beforeById.get(written.id);
    let id = before && !used.has(written.id) ? written.id : newId();
    while (used.has(id) || (!before && beforeById.has(id))) id = newId();
    used.add(id);
    const help = tidy(written.help, FORM_LIMITS.help);
    const choices = CHOICE_KINDS.has(written.kind) ? fieldChoicesOf(written, before, brief) : [];
    return {
      id,
      kind: written.kind,
      label: tidy(written.label, FORM_LIMITS.label),
      ...(help ? { help } : {}),
      needed: written.needed,
      ...(choices.length ? { choices } : {}),
    };
  });
}

/** The page's own lines the drafter wrote, each under a name the page says: any other name is dropped. */
function pageWordsFrom(answer: FormCraftAnswer): Partial<Record<FormPageWordKey, string>> {
  const written = new Map(answer.words.map(({ key, line }) => [key, tidy(line, FORM_LIMITS.thanks)]));
  const own: Partial<Record<FormPageWordKey, string>> = {};
  for (const key of FORM_PAGE_WORD_KEYS) {
    const line = written.get(key);
    if (line) own[key] = line;
  }
  return own;
}

/**
 * The page's own lines a form in `lang` carries: none for English and Spanish, whose lines are the house's; else the
 * ones the drafter wrote now, else the ones the draft already had.
 */
function pageWordsIn(lang: string, answer: FormCraftAnswer, brief: FormBrief): { words?: FormDescription["words"] } {
  if (/^(?:en|es)\b/.test(lang)) return {};
  const own = pageWordsFrom(answer);
  if (Object.keys(own).length) return { words: own };
  return brief.draft?.words ? { words: brief.draft.words } : {};
}

/** The form the answer makes, before the shape judges it. */
function formWritten(answer: FormCraftAnswer, brief: FormBrief, fields: FormField[]): unknown {
  // A question proposed alone stands on the form as it is; a draft and a change are the whole form.
  const base = brief.job === "question" ? brief.draft : undefined;
  const lang = (base?.lang ?? tidy(answer.lang, 10).toLowerCase()) || brief.language;
  const intro = base ? base.intro : tidy(answer.intro, FORM_LIMITS.intro);
  return {
    heading: base?.heading ?? tidy(answer.heading, FORM_LIMITS.heading),
    ...(intro ? { intro } : {}),
    lang,
    fields: base ? [...base.fields, ...fields] : fields,
    thanks: base?.thanks ?? tidy(answer.thanks, FORM_LIMITS.thanks),
    // What happens next is the workspace's own, never the drafter's: the chat where it has one, the follow-up off.
    next: base?.next ?? brief.draft?.next ?? { chat: brief.chat, draft: true, follow_up: false },
    ...pageWordsIn(lang, answer, brief),
  };
}

/** What is wrong with a form the shape holds: its own problems, and a reply time the business has not promised. */
function problemsWith(form: FormDescription, brief: FormBrief): string[] {
  const problems = formDescriptionProblems(form);
  const promised = [form.intro ?? "", form.thanks, ...form.fields.map((field) => field.help ?? "")];
  if (promised.some(promisesATime) && !promisesATime(brief.sentence))
    problems.push(
      "It says when the business will reply, which the business has not said. Say only that they will be answered.",
    );
  return problems;
}

/**
 * The drafter's answer as a form the shape holds, or what is wrong with it. `newId` makes a field's id, which it keeps
 * for good; a question the draft already had keeps the id it had.
 */
export function formFromAnswer(answer: FormCraftAnswer, brief: FormBrief, newId: () => string): FormFromAnswer {
  const note = tidy(answer.said, FORM_LIMITS.thanks) || null;
  const ask = tidy(answer.ask, FORM_LIMITS.thanks);
  if (ask && answer.fields.length === 0) return { form: null, ask, said: note, problems: [] };
  const parsed = FormDescription.safeParse(formWritten(answer, brief, fieldsFrom(answer, brief, newId)));
  if (!parsed.success)
    return {
      form: null,
      ask: null,
      said: note,
      problems: parsed.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`),
    };
  const problems = problemsWith(parsed.data, brief);
  return problems.length
    ? { form: null, ask: null, said: note, problems }
    : { form: parsed.data, ask: null, said: note, problems: [] };
}

/** The addresses under a business's page that are the page's own, and never a form's. */
const KEPT_ADDRESSES: ReadonlySet<string> = new Set(["terms", "privacy", "form"]);

/**
 * A form's address under the business's own page, from its heading: plain letters and digits, words joined by a dash,
 * at most 60 characters. A heading with none of either, or one the page keeps for itself, is still an address.
 */
export function formSlugOf(heading: string): string {
  const plain = foldName(heading)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55)
    .replace(/-+$/, "");
  if (!plain) return "form";
  return KEPT_ADDRESSES.has(plain) ? `${plain}-form` : plain;
}
