/**
 * Words: numbers. A number Ask writes about the owner's business stands only where the owner said it (decision 0113):
 * in a claim on How it reaches out, or in the business's name. What a slot fills in is the slot's ({{opening}}'s numbers
 * are its record's, read by the opening's own reader), and a time claims nothing about anyone.
 */
import { REACH_OUT_SLOT_SET, slotsOut } from "@chanlytics/contracts";

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** What follows a number that makes it a time or a length of time: "10-minute", "15 min", "2 weeks", "9 am". */
const TIME_AFTER = /^[\s-]?(?:minutes?|mins?|hours?|hrs?|seconds?|secs?|days?|weeks?|am\b|pm\b|a\.m\.|p\.m\.)/i;

/** A number's value, whatever way it was written: "1,204" and "1204" are one, "4.90" and "4.9" are one. */
const valueOf = (written: string): number => Number(written.replace(/,/g, ""));

/** Each number in the text as written, with what stands either side of it. */
function figuresIn(text: string): { written: string; before: string; after: string }[] {
  return [...text.matchAll(NUMBER)].map((m) => {
    const at = m.index ?? 0;
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
