/**
 * Becoming a partner and the partner's letters, as the routes read them, apart from partner.ts's words and view
 * models. zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that says these
 * words loads none of it.
 */
import { z } from "zod";

/** POST partner: the code, and the terms said yes to. */
export const PartnerBecomeSchema = z
  .object({
    code: z.string().trim().min(1).max(64),
    terms: z.literal(true, { message: "The terms have to be accepted." }),
  })
  .strict();

/** `PATCH partner`: the daily letter on or off (0014). */
export const PartnerLettersSchema = z.object({ letters: z.boolean() }).strict();

/* --------------------------------------------------------------- the letter (0014) */

/** A sum as the database sends it: a bigint arrives as a number or a string. */
const letterCents = z.coerce.number();

const letterSum = z.object({ currency: z.string(), cents: letterCents });

/**
 * What partner_letters_due (00209) says changed for one partner since their last letter, and where they stand: parsed,
 * never cast, so a letter is only ever written from the shape the function answers. A key it leaves out is empty.
 */
export const PartnerLetterNewsSchema = z.object({
  /** Ledger rows written since: shares and reversals, per kind and currency, void ones left out. */
  written: z
    .array(z.object({ kind: z.string(), currency: z.string(), count: z.coerce.number(), cents: letterCents }))
    .default([]),
  /** Rows written before the last letter that became payable since. */
  matured: z.array(letterSum).default([]),
  /** Shares written before that will not be paid: their workspace was disqualified. */
  voided: z.array(letterSum).default([]),
  paid: z
    .array(z.object({ currency: z.string(), cents: letterCents, reference: z.string(), sent_at: z.string() }))
    .default([]),
  /** A workspace held for review, or a person's decision on one, with the why they wrote for the partner. */
  standing: z
    .array(z.object({ workspace: z.string().nullable(), standing: z.string(), why: z.string().nullable() }))
    .default([]),
  /** Workspaces that came through the link since. */
  brought: z.array(z.string().nullable()).default([]),
  /** Workspaces the partner set up whose owner accepted them, or declined them (0016, 00214). */
  accepted: z.array(z.string().nullable()).default([]),
  declined: z.array(z.string().nullable()).default([]),
  /** The partner's own status, when it changed since. */
  status: z.object({ status: z.string(), why: z.string().nullable() }).nullable().default(null),
  balance: z
    .array(
      z.object({
        currency: z.string(),
        held: letterCents,
        payable: letterCents,
        paid: letterCents,
        next_payable_at: z.string().nullable(),
      }),
    )
    .default([]),
});

export type PartnerLetterNews = z.infer<typeof PartnerLetterNewsSchema>;
