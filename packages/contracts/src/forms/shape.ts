/**
 * A request form, as one checked shape (the Forms plan, 3.7): what AI writes when it drafts a form, what the visitor's page
 * draws, and what the door checks an entry against. A published version keeps it whole and never changes; a draft is the
 * same shape, changed as the owner works.
 *
 * A field has an id that never changes (an entry names its answers by it), one of eight kinds, its words, whether it is
 * needed, and its choices where its kind has them. A service's choices are the business's own services, copied in when the
 * form is drafted, so AI can never name one the business does not offer. The limits are the shape's: a form has at most 12
 * fields, a field at most 12 choices. Conditions between fields and pages come later, when real forms ask for them; a
 * photo is the plan's F6. What the shape alone cannot say (an id twice, a form that cannot reach the person, a choice
 * field with fewer than two) is `formDescriptionProblems`, in words AI is handed back. Pure.
 */
import { z } from "zod";
import { CHOICE_KINDS, FORM_FIELD_KINDS, FORM_LIMITS } from "./limits";

const FIELD_ID = /^[a-z0-9_-]{1,24}$/;

const textUpTo = (max: number) => z.string().trim().min(1).max(max);

const FormChoice = z.strictObject({ id: z.string().regex(FIELD_ID), label: textUpTo(FORM_LIMITS.label) });

export const FormField = z.strictObject({
  id: z.string().regex(FIELD_ID),
  kind: z.enum(FORM_FIELD_KINDS),
  label: textUpTo(FORM_LIMITS.label),
  help: z.optional(textUpTo(FORM_LIMITS.help)),
  needed: z.boolean(),
  choices: z.optional(z.array(FormChoice).max(FORM_LIMITS.choices)),
});
export type FormField = z.infer<typeof FormField>;

/** The most characters a typed answer may hold, by its field's kind: a longer answer's limit, or a short one's. */
export const answerLimitOf = (field: Pick<FormField, "kind">): number =>
  field.kind === "long" ? FORM_LIMITS.long : FORM_LIMITS.short;

/**
 * What happens after an entry, kept with the version (the plan's 3.4): whether the thank-you offers to carry on in a chat
 * (whichever the business has: a version is kept for good, so the setting is the chat's and never one channel's),
 * whether AI drafts the reply, and whether Campaigns' follow-up runs. The owner is always told: that is no setting.
 */
const FormNext = z.strictObject({ chat: z.boolean(), draft: z.boolean(), follow_up: z.boolean() });

/**
 * Every line a visitor's page says that its owner did not write (page-words.ts holds the house's own, in English and
 * Spanish): the press, the mistakes beside a field, the thank-you's own lines, what a closed form says. A form in any
 * other language carries its own under these names, written with the form (the canvas's call 14).
 */
export const FORM_PAGE_WORD_KEYS = [
  "send",
  "optional",
  "sending",
  "keep_open",
  "booked",
  "thanks",
  "thanks_plain",
  "chat",
  "chat_help",
  "chat_only",
  "or_call",
  "will_call",
  "by_email",
  "closed",
  "closed_lead",
  "message_business",
  "unsent",
  "unsent_lead",
  "try_now",
  "changed",
  "changed_lead",
  "sent_already",
  "sent_lead",
  "send_another",
  "did_you_mean",
  "too_much",
  "privacy",
  "chat_hello",
  "chat_hello_plain",
  "chat_about",
  "problem_needed",
  "problem_too_long",
  "problem_not_an_email",
  "problem_not_a_phone",
  "problem_one_choice",
  "problem_not_a_choice",
  "problem_no_way_to_answer",
  "scan",
  "ask_time",
  "none_of_these",
  "time_confirm",
  "asked_for",
  "confirm_by_email",
  "time_sub",
  "time_taken",
  "time_taken_lead",
  "time_short",
  "time_short_lead",
  "book_page",
  "book_page_lead",
  "sent_time",
  "day_at_time",
] as const;
export type FormPageWordKey = (typeof FORM_PAGE_WORD_KEYS)[number];

/** A form: its heading and words, its language, its fields in order, its thank-you, and what happens next. */
export const FormDescription = z.strictObject({
  heading: textUpTo(FORM_LIMITS.heading),
  intro: z.optional(textUpTo(FORM_LIMITS.intro)),
  lang: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
  fields: z.array(FormField).min(1).max(FORM_LIMITS.fields),
  thanks: textUpTo(FORM_LIMITS.thanks),
  next: FormNext,
  // The page's own lines in the form's language, where the house has none (never English or Spanish: those are its own).
  words: z.optional(z.partialRecord(z.enum(FORM_PAGE_WORD_KEYS), textUpTo(FORM_LIMITS.thanks))),
});
export type FormDescription = z.infer<typeof FormDescription>;

/** What is wrong with one field that its own shape cannot say, or null. */
function fieldProblem(field: FormField): string | null {
  const count = field.choices?.length ?? 0;
  if (CHOICE_KINDS.has(field.kind)) {
    if (count < 2) return `"${field.label}" needs at least two choices.`;
    const ids = new Set(field.choices?.map((choice) => choice.id));
    if (ids.size !== count) return `"${field.label}" has a choice id twice.`;
    return null;
  }
  return count > 0 ? `"${field.label}" is a ${field.kind} answer and has no choices.` : null;
}

/**
 * What a form that passes the shape still gets wrong, each in a sentence AI is handed back to mend, or none: a field id
 * used twice, a choice field with fewer than two choices or a choice id twice, choices on a field that takes none, and a
 * form with no way to answer the person (no email address and no phone number to ask for).
 */
export function formDescriptionProblems(form: FormDescription): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const field of form.fields) {
    if (seen.has(field.id)) problems.push(`The id "${field.id}" is used twice.`);
    seen.add(field.id);
    const problem = fieldProblem(field);
    if (problem) problems.push(problem);
  }
  if (!form.fields.some((field) => field.kind === "email" || field.kind === "phone")) {
    problems.push("A form asks for an email address or a phone number, so the request can be answered.");
  }
  return problems;
}
