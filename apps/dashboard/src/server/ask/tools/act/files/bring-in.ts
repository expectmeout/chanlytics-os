import "server-only";
import { z } from "zod";
import { BRING_IN_WORDS, bringInOf, videoPreviewOf } from "@chanlytics/contracts";
import { load } from "../../../../shared/reader";
import * as readers from "../../../../readers/facts";
import { defineAct, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { approvalWords, propose, refuse } from "../../context/context";

/**
 * A business's photos and videos brought in from a link the owner gave (Content's empty state, 14 Nov 2026: the card's one
 * line to Ask, never a button a place): its website, read again for what it shows and plays, or its Instagram account, its
 * newest posts and reels. The link is read in code (contracts content/bring-in.ts); one nothing here reads is refused back
 * to the model in words it says. The card's press brings them in; what comes waits in the Library for a Keep.
 */
async function bringInOutcome(toolContext: ToolContext, input: { link: string }): Promise<ProposalOutcome> {
  const target = bringInOf(input.link);
  if (target.place === "none") return refuse(BRING_IN_WORDS.refused[target.why]);
  const config = await load(toolContext.rc, readers.config, undefined).then((r) => r.data?.config ?? null);
  return propose({
    kind: "bring_in",
    title: BRING_IN_WORDS.title(target),
    summary: BRING_IN_WORDS.summary(target, videoPreviewOf(config)),
    payload: { link: input.link.trim() },
  });
}

export const bringInAct = defineAct({
  name: "propose_bring_in",
  description: `Bring in the business's own photos and videos from a link they give you: their website (read again for the photos it shows and the videos it plays) or their Instagram account (its newest posts and reels; an "@name" is one). Propose it at once when they paste or name one; nothing is kept until they Keep it in the Library. A YouTube or Vimeo link, a Google Drive or Photos folder, one post's link or another social page is refused in words to say back. Only their own: never a competitor's or a page they did not say is theirs. ${approvalWords("bring_in")}.`,
  kind: "bring_in",
  input: z.object({
    link: z.string().describe("The link as they gave it: a website's address, an Instagram account's link, or @name."),
  }),
  label: "Bringing it in",
  build: bringInOutcome,
});
