/**
 * Words: numbers. A number Ask writes about the owner's business stands only where the owner said it (decision 0113):
 * in a claim on Cold email, or in the business's name. What a slot fills in is the slot's ({{opening}}'s numbers
 * are its record's, read by the opening's own reader), and a time claims nothing about anyone.
 */
import { REACH_OUT_SLOT_SET, slotsOut, violatesNoPrices, type NewDraftAsk } from "@chanlytics/contracts";

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** What follows a number that makes it a time or a length of time: "10-minute", "15 min", "2 weeks", "9 am". */
const TIME_AFTER = /^[\s-]?(?:minutes?|mins?|hours?|hrs?|seconds?|secs?|days?|weeks?|am\b|pm\b|a\.m\.|p\.m\.)/i;

/** A number's value, whatever way it was written: "1,204" and "1204" are one, "4.90" and "4.9" are one. */
const valueOf = (written: string): number => Number(written.replace(/,/g, ""));

/** Each number in the text as written, with what stands either side of it. */
function figuresIn(text: string): { written: string; before: string; after: string }[] {
  return [...text.matchAll(NUMBER)].map((m) => {
    const at = m.index;
    const written = m[0].replace(/,$/, "");
    return { written, before: text.slice(Math.max(0, at - 1), at), after: text.slice(at + written.length) };
  });
}

/** Every number's value in the texts that back one. */
function backedValues(backing: readonly string[]): Set<number> {
  return new Set(backing.flatMap((text) => figuresIn(text).map((n) => valueOf(n.written))));
}

/** A clock's time, or a number of minutes, hours, days or weeks: no claim. */
const isTime = (n: { before: string; after: string }): boolean =>
  n.before === ":" || n.after.startsWith(":") || TIME_AFTER.test(n.after);

/**
 * What may back a number in words Ask writes: each claim the owner stands behind, the business's name, and what this
 * writing was asked from, the line typed into New, the email being written again, a lead's facts: words the owner or the
 * record already said.
 */
export function numberBacking(
  claims: readonly string[] | null | undefined,
  business: string,
  also: readonly (string | null | undefined)[] = [],
): string[] {
  return [...(claims ?? []), business, ...also].flatMap((text) => text?.trim() || []);
}

/**
 * The numbers in a step's words that nothing backs, each once, as written, in order. The slots are taken out first, so a
 * number a slot fills in is never the words' own.
 */
export function unbackedNumbers(body: string, backing: readonly string[]): string[] {
  const backed = backedValues(backing);
  const out: string[] = [];
  for (const n of figuresIn(slotsOut(REACH_OUT_SLOT_SET, body))) {
    if (isTime(n) || backed.has(valueOf(n.written)) || out.includes(n.written)) continue;
    out.push(n.written);
  }
  return out;
}

/**
 * The owner's own words a price in a customer's message may come from (Ruben, 13 Nov 2026: a customer offer carries the
 * discount its owner asked for, and never one Ask made up): the line, and where the line changes a draft that stands, the
 * line it was drafted from and what its messages say as they stand, a held one's words and the values typed into it too.
 */
export function ownerPriceWords(
  ask: Pick<NewDraftAsk, "words" | "stands">,
  messages: ReadonlyArray<{ templateId: string; body: string }>,
): string[] {
  const stood = (ask.stands?.steps ?? []).flatMap((step) => [
    messages.find((m) => m.templateId === step.template_id)?.body ?? "",
    ...step.texts,
    step.write.whatsapp,
    step.write.text,
    step.write.email_subject,
    step.write.email_body,
  ]);
  return [ask.words, ask.stands?.said ?? "", ...stood].filter((text) => text.trim() !== "");
}

/**
 * Whether words to a customer name a price or a discount the owner did not give: none of their words names one, or a
 * figure in it is none of theirs. A cold email names none at all, whoever gave it (draft-judge.ts leadEmailRefusal).
 */
export function unsaidPrice(words: string, owner: readonly string[]): boolean {
  return violatesNoPrices(words) && (!owner.some(violatesNoPrices) || unbackedNumbers(words, owner).length > 0);
}
