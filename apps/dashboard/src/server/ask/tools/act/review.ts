import "server-only";
import { z } from "zod";
import { actAction, defineActions, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

/** The longest reply Google keeps on a review, in characters. */
const REPLY_MAX = 4096;

/**
 * A reply to a Google review, as Reports' Reviews lens posts one (the operator, 15 Oct 2026): the review must be one this
 * turn read (report with lens reviews names the ones waiting, each a row an answer may cite), so a card never answers a
 * review nobody read. Public once it lands, so it is approved on its own.
 */
async function proposeReply(t: ToolContext, input: { review_id: string; comment: string }): Promise<ProposalOutcome> {
  const id = str(input.review_id, 120);
  if (!id) return refuse("review_id is a review's id from report with lens reviews");
  if (!t.read.review.has(id))
    return refuse("read the review first (report with lens reviews names the ones waiting), then propose the reply");
  const comment = input.comment.trim();
  if (!comment) return refuse("comment is the reply's words");
  if (comment.length > REPLY_MAX) return refuse(`a reply is at most ${REPLY_MAX} characters`);
  const who = t.read.review.get(id)?.label ?? "the review";
  return propose({
    kind: "review_reply",
    title: `Reply to ${who}`,
    summary: `“${comment}” · posted on Google under the review, for everyone to read; a new reply replaces the last.`,
    payload: { review_id: id, comment, who },
  });
}

export const propose_review = defineActions({
  name: "propose_review",
  description:
    "Propose a reply to a Google review, as a card the person approves; it is posted publicly under the review once approved.",
  tail: "Read the review first (report with lens reviews). Thank them by what they said, answer a complaint plainly and offer to make it right by phone or message; never argue, never name a customer's private details, never offer money or a discount.",
  actions: {
    reply: actAction({
      kind: "review_reply",
      input: z.object({
        review_id: z.string().describe("The review's id, from report with lens reviews."),
        comment: z.string().describe("The reply's words, as the business."),
      }),
      examples: [{ review_id: "accounts/1/locations/2/reviews/3", comment: "Thank you, Ana! We loved having you." }],
      label: "Preparing a review reply",
      words: "Action reply takes review_id and comment and proposes the business's public reply under that review.",
      build: proposeReply,
    }),
  },
});
