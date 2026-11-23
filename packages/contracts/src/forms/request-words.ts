/**
 * A request, said in words (the Forms plan, 3.5): its answers as the lines an owner reads, and how it came. One
 * reading of the answers (`requestLines`) feeds the request's page, the note on the person's page and the owner's
 * notice (people/doors/form-request.ts), so a request is never said three ways. A choice is said by its label as the
 * version the visitor saw named it; one the version does not name is said as it was kept, since the entry is what was
 * sent; a time asked for from the business's open times is said as its day and hour, on the business's clock. Pure.
 */
import type { FormAnswer } from "./answers";
import type { FormDescription, FormField } from "./shape";
import { CHOICE_KINDS, type FormFieldKind } from "./limits";
import { isFormSlot, formSlotWords } from "./times";

/** The two places every form has, as a sentence says them; any other is said in its owner's own words. */
const OWN_PLACES: Record<string, string> = { "your link": "your link", "printed code": "the printed code" };

/**
 * The place a request's link was shared, as a sentence says it ("Through Instagram", "Through the printed code"), or
 * null for a request that came through none. One spelling: the request's page, the owner's notice and the person's
 * note say it.
 */
export function throughPlace(place: string | null | undefined): string | null {
  const named = place?.trim();
  return named ? `Through ${OWN_PLACES[named.toLowerCase()] ?? named}` : null;
}

/** One answered question of a request: which field, and what was answered, in words. */
export interface RequestLine {
  id: string;
  kind: FormFieldKind;
  label: string;
  words: string;
}

/** An answer in words: what was typed, the labels of what was picked, or a time asked for (F3) as its day and hour. */
function answerWords(field: FormField, answer: unknown): string {
  if (field.kind === "when" && isFormSlot(answer)) return formSlotWords(answer);
  const labelOf = (id: string) => field.choices?.find((choice) => choice.id === id)?.label ?? id;
  if (Array.isArray(answer))
    return answer
      .filter((id): id is string => typeof id === "string")
      .map(labelOf)
      .join(", ");
  if (typeof answer !== "string") return "";
  return CHOICE_KINDS.has(field.kind) ? labelOf(answer) : answer;
}

/** A request's answers as lines, in the form's own order: each question that was answered, with what was said. */
export function requestLines(
  form: Pick<FormDescription, "fields">,
  answers: Record<string, FormAnswer> | Record<string, unknown>,
): RequestLine[] {
  return form.fields.flatMap((field) => {
    const words = answerWords(field, answers[field.id]).trim();
    return words ? [{ id: field.id, kind: field.kind, label: field.label, words }] : [];
  });
}
