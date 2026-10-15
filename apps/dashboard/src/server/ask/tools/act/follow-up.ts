import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ASK_FOLLOW_UPS_MAX,
  FOLLOW_UP_PROMPT_MAX,
  FOLLOW_UP_SAID_MAX,
  FOLLOW_UP_WAKES,
  followUpsOf,
  type AskFollowUp,
} from "@chanlytics/contracts";
import { memberViewsOf } from "@chanlytics/db";
import {
  actAction,
  defineActions,
  propose,
  refuse,
  stepNamed,
  str,
  UUID,
  type ProposalOutcome,
  type ToolContext,
} from "../context";

/**
 * Ask's follow-ups (the operator, 15 Oct 2026, D3): Ask keeps a note to come back to something when it happens -- a lead
 * search finishing or stopping to ask, replies on a sequence or a cold email, or a day -- and clears it once it came back.
 * Kept in the member's own views (contracts ask/follow-ups.ts), so the card writes the whole list the view will hold and
 * its undo the list it held. It changes nothing of the business; the `signals` read says a due one first.
 */

/** The member's follow-ups as their views hold them now, read on the session client (their own row). */
async function heldNow(t: ToolContext): Promise<AskFollowUp[]> {
  if (!t.ctx.userId) return [];
  return followUpsOf(await memberViewsOf(t.ctx.supabase, { tenantId: t.tenantId, userId: t.ctx.userId }));
}

async function proposeKeep(
  t: ToolContext,
  input: { said: string; prompt: string; wake: AskFollowUp["wake"]; subject?: string; on?: string },
): Promise<ProposalOutcome> {
  const said = input.said.trim().slice(0, FOLLOW_UP_SAID_MAX);
  const prompt = input.prompt.trim().slice(0, FOLLOW_UP_PROMPT_MAX);
  if (!said || !prompt)
    return refuse("said (the line they read) and prompt (what you will ask yourself) are both needed");
  let subject: string | null = null;
  let on: string | null = null;
  if (input.wake === "date") {
    on = /^\d{4}-\d{2}-\d{2}$/.test(input.on ?? "") ? (input.on as string) : null;
    if (!on) return refuse("on is the day, YYYY-MM-DD by the business's calendar");
  } else {
    subject = str(input.subject, 40);
    // An earlier plan step's token (a search it starts) stands in for its id, filled at the commit.
    if (!UUID.test(subject) && stepNamed(t, subject) === null)
      return refuse(
        "subject is the search's, the sequence's or the cold email's id a read returned, or a plan step's token",
      );
  }
  const held = await heldNow(t);
  if (held.length >= ASK_FOLLOW_UPS_MAX)
    return refuse(
      `they hold ${ASK_FOLLOW_UPS_MAX} follow-ups already (${held.map((f) => f.said).join("; ")}): clear one first with action clear`,
    );
  const made: AskFollowUp = {
    id: randomUUID().slice(0, 8),
    said,
    prompt,
    wake: input.wake,
    subject,
    on,
    made_at: t.now.toISOString(),
  };
  return propose({
    kind: "follow_up",
    title: "I'll come back to it",
    summary: said,
    payload: { follow_ups: [...held, made], previous: held, said },
  });
}

async function proposeClear(t: ToolContext, input: { ids: string[] }): Promise<ProposalOutcome> {
  const held = await heldNow(t);
  const gone = new Set(input.ids.map((x) => str(x, 40)));
  const left = held.filter((f) => !gone.has(f.id));
  if (left.length === held.length) return refuse("none of those is a follow-up they hold (signals lists them)");
  const cleared = held.filter((f) => gone.has(f.id));
  return propose({
    kind: "follow_up",
    title: "Done with it",
    summary: cleared.map((f) => f.said).join("; "),
    payload: { follow_ups: left, previous: held, cleared: true },
  });
}

export const propose_follow_up = defineActions({
  name: "propose_follow_up",
  description: `Propose a follow-up of your own, as a card the person approves: a note to come back when something happens (a lead search finishing or stopping to ask, replies on a sequence or a cold email, or a day), or clearing one you came back to. They hold at most ${ASK_FOLLOW_UPS_MAX}; signals says a due one first.`,
  tail: "Offer one after a card whose result comes later (a lead search, a sequence or a cold email started), in the same plan. When a due one is read, do what its prompt says, and clear it beside the cards you make.",
  actions: {
    keep: actAction({
      kind: "follow_up",
      input: z.object({
        said: z
          .string()
          .describe(`The line they read, at most ${FOLLOW_UP_SAID_MAX} characters: what you will come back to.`),
        prompt: z
          .string()
          .describe(`What you will ask yourself when it is due, at most ${FOLLOW_UP_PROMPT_MAX} characters.`),
        wake: z.enum(FOLLOW_UP_WAKES).describe("search_done, replies, or date."),
        subject: z.string().optional().describe("The search's, sequence's or cold email's id, or a plan step's token."),
        on: z.string().optional().describe("For date, the day, YYYY-MM-DD."),
      }),
      examples: [
        {
          said: "When the plumbers search finishes, I'll pick the best and draft the emails",
          prompt: "The plumbers search finished: pick the best leads and propose a cold email sequence to them.",
          wake: "search_done",
          subject: "@step:1",
        },
      ],
      label: "Keeping a follow-up",
      words:
        "Action keep keeps a follow-up: said, prompt, wake, and its subject (an id or a plan step's token) or its day.",
      build: proposeKeep,
    }),
    clear: actAction({
      kind: "follow_up",
      input: z.object({ ids: z.array(z.string()).describe("The follow-ups' ids, from signals.") }),
      examples: [{ ids: ["3fa9c2d1"] }],
      label: "Clearing a follow-up",
      words: "Action clear takes away follow-ups you came back to, by their ids.",
      build: proposeClear,
    }),
  },
});
