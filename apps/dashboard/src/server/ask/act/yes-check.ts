/**
 * The yes check (D18 of the answers canvas): whether a person's own words are a go-ahead to the one card they answer. A small
 * model call apart from the turn reads those words and the card's own title and terms, and nothing else, so nothing a page,
 * a message or a file says can reach it, in any language.
 *
 * What it is asked lives here once, read by the press it guards (tools/act/press.ts) and by its test set
 * (tooling/scripts/evals/yes-check.mjs), so the set judges the very question the product asks.
 */
import { z } from "zod";

export const YES_CHECK_SYSTEM =
  "You decide one thing: did this person just tell us to go ahead with this action? Read only the two lines given. A yes in any language or wording counts (yes, do it, send it, go ahead, dale, hazlo, sounds good). A change, a question, a doubt, a maybe or a no does not count. Answer in JSON.";

export const YES_CHECK_SCHEMA = {
  type: "object",
  properties: { yes: { type: "boolean" } },
  required: ["yes"],
  additionalProperties: false,
};

export const YesCheckAnswerSchema = z.object({ yes: z.boolean() });

/** The most the answer may write: one boolean, in JSON. */
export const YES_CHECK_MAX_TOKENS = 64;

/** The two lines the check reads: the card's own title and terms, then what the person said. */
export const yesCheckQuestion = (action: string, words: string): string => `The action: ${action}\nThey said: ${words}`;
