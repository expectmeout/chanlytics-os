import "server-only";

/**
 * The model call that writes a comment's public answer again as its owner asks (comment-rewrite.ts reads what it is
 * written from): told the post and the comment as the draft was (contracts commentAnswerPrompt), the answer as it stands
 * and what the owner wants changed, on the comment's own line of the AI ledger (comment_rewrite), and held to the rule a
 * draft is held to (contracts commentDraftOf), with what the owner typed counted as theirs to say. Nothing is kept.
 */
import { z } from "zod";
import {
  commentAnswerPrompt,
  commentDraftOf,
  fenced,
  type CommentAnswerFacts,
  type CommentToAnswer,
  type TenantId,
} from "@chanlytics/contracts";
import { askForJson } from "../shared/model-json";

/** What the owner asked: the comment, the answer as the box holds it, and what should change. */
export interface CommentRewriteAsk {
  touch_id: string;
  words: string;
  change: string;
}

/** The answer written again, or why AI can't write this one safely. */
export interface CommentRewritten {
  draft: string | null;
  cannot_why: string | null;
}

const REWRITE_RULES = [
  "Write the answer again as the owner asks: do what they ask, and leave the rest as it stands.",
  "Answer in `answer`: the answer's words alone, or CANNOT: and a few words why, as the rules say.",
];

const REWRITE_JSON_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
} as const;
const RewriteAnswerSchema = z.object({ answer: z.string().max(4000) });

/** What the rewrite is written from: the business, and the comment with the post it is under. */
interface RewriteKnown {
  facts: CommentAnswerFacts;
  comment: CommentToAnswer;
}

/** The answer written again from what is known: one model call, and what is kept of its answer. */
export async function rewriteCommentFrom(
  known: RewriteKnown,
  ask: Pick<CommentRewriteAsk, "words" | "change">,
  asker: { tenantId: TenantId; userId: string },
): Promise<CommentRewritten> {
  const prompt = commentAnswerPrompt(known.facts, known.comment);
  const prompted = [
    prompt.user,
    ask.words.trim() ? `The answer as it stands:\n${fenced("record", ask.words)}` : "There is no answer yet.",
    `What the owner wants changed: ${ask.change.trim()}`,
  ].join("\n\n");
  const answer = await askForJson(
    {
      tenantId: asker.tenantId,
      userId: asker.userId,
      purpose: "comment_rewrite",
      request: {
        max_tokens: 400,
        system: [prompt.system, ...REWRITE_RULES].join("\n"),
        schema: REWRITE_JSON_SCHEMA,
        messages: [{ role: "user", content: prompted }],
      },
    },
    RewriteAnswerSchema,
    "answer",
  );
  // What the owner typed, here or in the box, is theirs to say: a price in it is the owner's word.
  const held = commentDraftOf(answer.answer, [...known.facts.says, ask.change, ask.words]);
  return "words" in held ? { draft: held.words, cannot_why: null } : { draft: null, cannot_why: held.cannotWhy };
}
