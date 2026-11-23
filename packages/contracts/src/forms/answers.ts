/**
 * An entry's answers, read against the version the visitor saw (the Forms plan, 3.2 step 2): the page checks them before
 * it sends, and the door again, by the same rule. Each answer is cleaned by its field's kind; a needed answer missing, one
 * too long, an address or a number that is none, and a choice the field does not hold are each a problem beside their
 * field: a code here and on the wire, said in the form's own language where it is drawn (form-words.ts), and read aloud
 * there (3.12). A field the version does not hold is dropped, never kept. A likely typo in an email address is offered to
 * the visitor as a fix (`emailTypoFix`), never refused: it may be right.
 *
 * A "when" question shown as the business's open times (F3) is answered by a slot, or by nothing; one that sent them to
 * the business's own booking page asks nothing here (`reading.when`).
 *
 * Who the entry is about comes from the answers: the first short answer is their name, the first email field their
 * address, the first phone field their number. An entry with neither an address nor a number cannot be answered, and is
 * refused by the first of those fields. Pure.
 */
import { z } from "zod";
import { normalizePhone } from "../shared/phone";
import { answerLimitOf, type FormDescription, type FormField } from "./shape";
import { CHOICE_KINDS, FORM_LIMITS } from "./limits";
import { isFormSlot } from "./times";

/** One answer as kept: words, or the ids of the choices picked. */
export type FormAnswer = string | string[];

/** What can be wrong with one answer: a closed set, the same on the page and at the door. */
export type FormProblem =
  "needed" | "too_long" | "not_an_email" | "not_a_phone" | "one_choice" | "not_a_choice" | "no_way_to_answer";

/** What an entry's answers came to: the answers kept, by field id; what is wrong, by field id; and who it is about. */
export interface FormAnswersRead {
  answers: Record<string, FormAnswer>;
  problems: Record<string, FormProblem>;
  reach: { name: string | null; email: string | null; phone: string | null };
}

const ANSWER_EMAIL = z.email().max(FORM_LIMITS.email);

/** The text of a typed answer, trimmed; "" for anything that is not text. */
const trimmedOf = (raw: unknown): string => (typeof raw === "string" ? raw.trim() : "");

/** The choice ids an answer names, each once, in the order given. */
function pickedOf(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

/**
 * How the "when" question was asked where the page drew it otherwise than the version wrote it (times.ts, F3):
 * `times`, as the business's open times: a slot picked is its answer, and none picked is no answer and no mistake,
 * whether the question is needed or not ("None of these work" is an answer too), and whether the slot is still open is
 * the door's to check, against the openings as they stand; `page`, as a way to the business's own booking page, where
 * it is answered and not here; `asked`, as the version wrote it.
 */
interface FormAnswersReading {
  when: "times" | "page" | "asked";
}

/**
 * One field's answer read by its kind: the answer to keep (null when none was given), or what is wrong with it. A number
 * is read by `phoneOf`, the one rule for a phone number unless the door hands in the business's country's.
 */
function readField(
  field: FormField,
  raw: unknown,
  phoneOf: (typed: string) => string | null,
): { answer: FormAnswer | null } | { problem: FormProblem } {
  if (CHOICE_KINDS.has(field.kind)) {
    const picked = pickedOf(raw);
    if (picked.length === 0) return { answer: null };
    const held = new Set(field.choices?.map((choice) => choice.id));
    if (picked.some((id) => !held.has(id)) || (field.kind !== "several" && picked.length > 1)) {
      return { problem: field.kind === "several" ? "not_a_choice" : "one_choice" };
    }
    return { answer: field.kind === "several" ? picked : (picked[0] ?? null) };
  }
  const typed = trimmedOf(raw);
  if (!typed) return { answer: null };
  if (field.kind === "email") {
    const address = typed.toLowerCase();
    return ANSWER_EMAIL.safeParse(address).success ? { answer: address } : { problem: "not_an_email" };
  }
  if (field.kind === "phone") {
    const number = typed.length <= FORM_LIMITS.phone ? phoneOf(typed) : null;
    return number ? { answer: number } : { problem: "not_a_phone" };
  }
  return typed.length > answerLimitOf(field) ? { problem: "too_long" } : { answer: typed };
}

/** The first kept answer of the first field of a kind, as text, or null. */
function firstAnswerOf(
  form: FormDescription,
  answers: Record<string, FormAnswer>,
  kind: FormField["kind"],
): string | null {
  const field = form.fields.find((one) => one.kind === kind);
  const answer = field ? answers[field.id] : undefined;
  return typeof answer === "string" ? answer : null;
}

/**
 * The answers of an entry, read against its version (`raw`: what the page sent, by field id). `phoneOf` reads a number;
 * the house's own rule unless the door hands in the business's country's.
 */
export function readFormAnswers(
  form: FormDescription,
  raw: Record<string, unknown>,
  phoneOf: (typed: string) => string | null = normalizePhone,
  reading: FormAnswersReading = { when: "asked" },
): FormAnswersRead {
  const answers: Record<string, FormAnswer> = {};
  const problems: Record<string, FormProblem> = {};
  for (const field of form.fields) {
    if (field.kind === "when" && reading.when !== "asked") {
      const picked = raw[field.id];
      if (reading.when === "times" && isFormSlot(picked)) answers[field.id] = picked;
      continue;
    }
    const read = readField(field, raw[field.id], phoneOf);
    if ("problem" in read) problems[field.id] = read.problem;
    else if (read.answer !== null) answers[field.id] = read.answer;
    else if (field.needed) problems[field.id] = "needed";
  }
  const reach = {
    name: firstAnswerOf(form, answers, "short"),
    email: firstAnswerOf(form, answers, "email"),
    phone: firstAnswerOf(form, answers, "phone"),
  };
  if (!reach.email && !reach.phone) {
    const way =
      form.fields.find((field) => field.kind === "email") ?? form.fields.find((field) => field.kind === "phone");
    if (way && !problems[way.id]) problems[way.id] = "no_way_to_answer";
  }
  return { answers, problems, reach };
}
