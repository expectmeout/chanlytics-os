import "server-only";
import { z } from "zod";
import {
  AppError,
  DATA_NOT_INSTRUCTIONS,
  LEAD_BUILD_WORDS,
  fenced,
  parseTenantConfig,
  wordsNeedOpening,
  type LeadRewriteDto,
} from "@chanlytics/contracts";
import { makesPreviews } from "@chanlytics/db";
import { askForJson } from "../model-json";
import { load, type ReaderContext } from "../readers";
import * as facts from "../readers/facts";
import { sequences } from "../readers/sequences";
import { storedConfigOf } from "../workspace/config-row";
import { LEAD_RULES, PREVIEW_RULE, orNull, ownerOf, ownerSaid } from "./draft";
import { leadEmail, type OwnerKnown } from "./draft-judge";

/**
 * An email to leads written again as its owner says (POST sequences/:id/rewrite, 2 Nov 2026): one model call, told the
 * email as it stands and what they want changed, under the rules a draft is written under and with what the drafter knows
 * of how they write, so what they ask is no way round a rule: what a rule forbids is left out and said. Words handed back
 * for the sheet's box, never saved here: the chain's own save judges them as it judges typed words. Words that would not
 * hold are refused in words, and the email stays as it was.
 */

/** What the owner said to change, with the email it is for: a later email has no subject (null). */
interface RewriteAsk {
  subject: string | null;
  body: string;
  change: string;
}

type RewriteKnown = OwnerKnown & { business: string; previews?: boolean };

const REWRITE_RULES = [
  "You rewrite one email a small business sends to other businesses it has not written to before, as its owner asks.",
  "Do what the owner asks, and leave the rest as it stands: what they ask now comes before anything remembered about how they write. Keep each value in double braces where it stands unless they ask to drop it; {{opening}} always stays. Where there is no email yet, write it from what they say.",
  "Answer `subject` and `body`, the whole email: `subject` empty on a later one.",
  "Where something they ask goes against the rules here, do the rest and say what you left out in `cannot`, in two short sentences in the language they wrote in: “Left out: “<their words>”.”, then why. Leave `cannot` empty when everything fit.",
  ...LEAD_RULES,
  DATA_NOT_INSTRUCTIONS,
];

const REWRITE_JSON_SCHEMA = {
  type: "object",
  properties: { subject: { type: "string" }, body: { type: "string" }, cannot: { type: "string" } },
  required: ["subject", "body", "cannot"],
  additionalProperties: false,
} as const;
const RewriteAnswerSchema = z.object({
  subject: z.string().max(200),
  body: z.string().max(2000),
  cannot: z.string().trim().max(300),
});

/** What the model is told: the business and how its owner writes, the email as it stands, and what should change. */
function rewriteAsked(known: RewriteKnown, ask: RewriteAsk): string {
  const which = ask.subject === null ? "a later email, which answers in the same thread" : "the first email";
  const email = `${ask.subject ? `Subject: ${ask.subject}\n` : ""}${ask.body}`;
  return [
    `The business: ${known.business}.`,
    ...ownerSaid(known),
    ask.body.trim() ? `The email as it stands, ${which}:\n${fenced("record", email)}` : `No email yet: it is ${which}.`,
    `What the owner wants changed: ${ask.change.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The words the model answered, judged as a draft's are: a subject it left empty stays as it was, and an opening stays. */
function rewriteKept(answer: z.infer<typeof RewriteAnswerSchema>, ask: RewriteAsk): LeadRewriteDto {
  const first = ask.subject !== null;
  const said = answer.cannot.trim() || null;
  const email = leadEmail({ subject: answer.subject.trim() || (ask.subject ?? ""), body: answer.body }, first);
  if (!email.body) throw new AppError("validation", said ?? LEAD_BUILD_WORDS.rewriteBroke, 422);
  if (wordsNeedOpening(ask) && !wordsNeedOpening(email))
    throw new AppError("validation", LEAD_BUILD_WORDS.rewriteLostOpening, 422);
  return { ...email, cannot: said };
}

/** The email written again from what is known: one model call, and what is kept of its answer. */
export async function rewriteFrom(
  known: RewriteKnown,
  ask: RewriteAsk,
  who: { tenantId: string; userId: string },
): Promise<LeadRewriteDto> {
  const answer = await askForJson(
    {
      tenantId: who.tenantId,
      userId: who.userId,
      purpose: "sequence_draft",
      request: {
        max_tokens: 800,
        system: [...REWRITE_RULES, ...(known.previews ? [PREVIEW_RULE] : [])].join("\n"),
        schema: REWRITE_JSON_SCHEMA,
        messages: [{ role: "user", content: rewriteAsked(known, ask) }],
      },
    },
    RewriteAnswerSchema,
    "rewrite",
  );
  return rewriteKept(answer, ask);
}

/** The route's handle: what the drafter reads of the business and its owner, then the rewrite. Only a sequence to leads. */
export async function rewriteLeadEmail(
  rc: ReaderContext,
  seq: { starts: string },
  ask: RewriteAsk,
): Promise<LeadRewriteDto> {
  if (seq.starts !== "leads") throw new AppError("not_found", "Sequence not found.", 404);
  const { ctx, tenantId } = rc;
  const [named, seqs, config, previews] = await Promise.all([
    load(rc, facts.facts, undefined),
    orNull(load(rc, sequences, undefined), "sequences", tenantId),
    orNull(storedConfigOf(ctx.supabase, tenantId).then(parseTenantConfig), "config", tenantId),
    orNull(makesPreviews(ctx.supabase, tenantId), "previews", tenantId),
  ]);
  const owner = await ownerOf(rc, seqs?.data.sequences ?? [], config);
  return rewriteFrom(
    { business: named.data.name, goal: config?.ask?.goal ?? null, ...owner, previews: previews === true },
    ask,
    { tenantId, userId: rc.userId },
  );
}
