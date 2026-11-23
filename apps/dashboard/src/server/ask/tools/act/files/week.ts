import "server-only";
import { z } from "zod";
import {
  CLAIM_KINDS,
  CLAIM_TEXT_MAX,
  CONTENT_GOALS,
  DAY_KEY,
  WEEK_WORDS,
  creativesOf,
  dayInZone,
  weekDaysSaid,
  weekSizeSaid,
} from "@chanlytics/contracts";
import { load } from "../../../../shared/reader";
import { contentPlan } from "../../../../readers/plan";
import { actAction, defineActions, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { approvalWords, propose, refuse } from "../../context/context";
import { quotedInQuestion } from "../remember";

/**
 * AI's cards for a week of posts (00702; the content loop PRD's 12.1 act/plan and act/claims), one tool with an action
 * each (the edge gateway takes forty tools, and the room under it is kept). The acts never act: each reads the week as the
 * Week does and makes the card, whose press goes through the Week's or Settings › Content's own door.
 */

const WEEK = z.string().regex(DAY_KEY).optional().describe("The week's Monday; left out, the week to plan now.");

const readWeekFor = async (toolContext: ToolContext, week: string | undefined) =>
  (await load(toolContext.rc, contentPlan, { week })).data;

async function planOutcome(toolContext: ToolContext, input: { week?: string | undefined }): Promise<ProposalOutcome> {
  const data = await readWeekFor(toolContext, input.week);
  const status = data.week.plan?.status;
  if (status === "approved" || status === "done") return refuse("this week is approved already. Say so");
  return propose({
    kind: "week",
    title: "Plan the week",
    summary: "AI makes the week from what you have. Nothing goes up until you approve it.",
    payload: { act: "plan", week_of: data.week_of },
  });
}

async function approveOutcome(
  toolContext: ToolContext,
  input: { week?: string | undefined },
): Promise<ProposalOutcome> {
  const data = await readWeekFor(toolContext, input.week);
  const { plan, slots } = data.week;
  if (plan?.status !== "ready")
    return refuse(`the week is ${plan?.status ?? "not planned"}, so not ready to approve. Say so`);
  const ready = slots.filter((s) => s.state === "proposed");
  if (ready.length === 0) return refuse("nothing in this week is ready to approve. Say what needs the owner instead");
  const days = weekDaysSaid(ready.map((s) => dayInZone(toolContext.timezone, Date.parse(s.at)).key));
  return propose({
    kind: "week",
    title: WEEK_WORDS.approve,
    summary: `${weekSizeSaid(creativesOf(ready))}, ${days}.`,
    payload: { act: "approve", plan_id: plan.id, week_of: data.week_of },
  });
}

const slotInput = z.object({
  week: WEEK,
  slot: z.uuid().describe("The slot's id, from files action week."),
  to: z.enum(["removed", "proposed", "at", "approved"]),
  at: z.iso.datetime({ offset: true }).optional().describe("For to at: the new time."),
});

async function slotOutcome(toolContext: ToolContext, input: z.output<typeof slotInput>): Promise<ProposalOutcome> {
  const data = await readWeekFor(toolContext, input.week);
  const slot = data.week.slots.find((s) => s.id === input.slot);
  if (!slot) return refuse("no slot of this week by that id; read files action week");
  if (input.to === "at" && !input.at) return refuse("at: say the new time");
  return propose({
    kind: "week",
    title: slot.title,
    summary: input.to === "removed" ? `Leave it out: ${slot.title}` : `Change it: ${slot.title}`,
    payload: {
      act: "slot",
      slot_id: slot.id,
      change: input.to === "at" ? { to: "at", at: input.at } : { to: input.to },
      week_of: data.week_of,
    },
  });
}

const claimInput = z.object({
  kind: z.enum(CLAIM_KINDS),
  text: z.string().trim().min(1).max(CLAIM_TEXT_MAX).describe("The owner's own words for it."),
  until: z.string().regex(DAY_KEY).optional().describe("Its last day; a fact always has one."),
});

function claimOutcome(toolContext: ToolContext, input: z.output<typeof claimInput>): Promise<ProposalOutcome> {
  if (input.kind === "fact" && (!input.until || !quotedInQuestion(toolContext, input.text)))
    return Promise.resolve(refuse("a fact is quoted from what the owner said this turn, with the day it holds until"));
  const claim = { kind: input.kind, text: input.text, source: "said", valid_until: input.until ?? null };
  return Promise.resolve(
    propose({ kind: "claim", title: "Posts may say this", summary: input.text, payload: { act: "keep", claim } }),
  );
}

async function withdrawOutcome(toolContext: ToolContext, input: { claim: string }): Promise<ProposalOutcome> {
  const data = await readWeekFor(toolContext, undefined);
  const kept = data.claims.find((c) => c.id === input.claim && !c.withdrawn_at);
  if (!kept) return refuse("no claim standing by that id; read files action week");
  return propose({
    kind: "claim",
    title: "Withdraw it",
    summary: kept.text,
    payload: { act: "withdraw", claim_id: kept.id },
  });
}

export const weekAct = defineActions({
  name: "propose_week",
  description:
    "Propose a change to this week's posts as a card the owner approves. Nothing is made, posted or spent by a card until its press. Read files action week first for the ids.",
  actions: {
    plan: actAction({
      kind: "week",
      input: z.object({ week: WEEK }),
      examples: [{}],
      label: "Planning the week",
      words: `Action plan makes the week now, from the owner's footage and reasons. ${approvalWords("week")}.`,
      build: planOutcome,
    }),
    approve: actAction({
      kind: "week",
      input: z.object({ week: WEEK }),
      examples: [{}],
      label: "Approving the week",
      words: `Action approve approves every slot ready, as the week shows it. ${approvalWords("week")}.`,
      build: approveOutcome,
    }),
    slot: actAction({
      kind: "week",
      input: slotInput,
      examples: [{ slot: "00000000-0000-4000-8000-000000000001", to: "removed" }],
      label: "Changing a post of the week",
      words: `Action slot takes a slot and to: removed leaves it out, proposed puts it back, at moves it, approved approves one mended. ${approvalWords("week")}.`,
      build: slotOutcome,
    }),
    aims: actAction({
      kind: "week",
      input: z.object({
        goals: z.array(z.object({ goal: z.enum(CONTENT_GOALS), service: z.string().max(120).optional() })).max(8),
      }),
      examples: [{ goals: [{ goal: "fill_slow_days" }] }],
      label: "Keeping what posts are for",
      words: `Action aims takes goals, the whole set of what posts are for. ${approvalWords("week")}.`,
      build: (_toolContext, input) =>
        Promise.resolve(
          propose({
            kind: "week",
            title: "What the posts are for",
            summary: "Kept for the weeks AI plans.",
            payload: { act: "aims", aims: { goals: input.goals } },
          }),
        ),
    }),
    claim: actAction({
      kind: "claim",
      input: claimInput,
      examples: [{ kind: "offer", text: "20% off a first colour" }],
      label: "Keeping what a post may say",
      words: `Action claim keeps an offer, price or guarantee the owner gave, or a fact they state until its day ends: post words are held to these. ${approvalWords("claim")}.`,
      build: claimOutcome,
    }),
    withdraw: actAction({
      kind: "claim",
      input: z.object({ claim: z.uuid() }),
      examples: [{ claim: "00000000-0000-4000-8000-000000000002" }],
      label: "Withdrawing what a post may say",
      words: `Action withdraw takes a claim's id. ${approvalWords("claim")}.`,
      build: withdrawOutcome,
    }),
  },
});
