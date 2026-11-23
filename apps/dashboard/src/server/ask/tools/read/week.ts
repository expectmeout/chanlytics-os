import "server-only";
import { z } from "zod";
import { CONTENT_WEEK_ROUTE, DAY_KEY, creativesOf, weekSizeSaid } from "@chanlytics/contracts";
import { load } from "../../../shared/reader";
import { contentPlan, opportunities } from "../../../readers/plan";
import { readAction, type ToolContext } from "../context/tool-defs";

/**
 * AI's reads of a week of posts (00702; the content loop PRD's 12.1 read/content_week and read/opportunities), two
 * actions of the files tool (the edge gateway takes forty tools, and the room under it is kept), through the readers the
 * Week and Settings › Content read, so what AI says is what the page shows. Read-only.
 */

const weekAsked = z.object({
  week: z.string().regex(DAY_KEY).optional().describe("The week's Monday, YYYY-MM-DD; left out, the week to plan now."),
});

async function readWeek(toolContext: ToolContext, input: z.output<typeof weekAsked>) {
  const { data } = await load(toolContext.rc, contentPlan, { week: input.week });
  const { plan, slots } = data.week;
  return {
    week_of: data.week_of,
    route: CONTENT_WEEK_ROUTE,
    plan: plan && { id: plan.id, status: plan.status, fewer: plan.fewer, size: weekSizeSaid(creativesOf(slots)) },
    slots: slots.map((s) => ({
      id: s.id,
      title: s.title,
      place: s.place,
      kind: s.kind,
      at: s.at,
      state: s.state,
      why: s.blocked_reason ?? s.reason,
      caption: s.words?.caption ?? null,
      ask: s.ask,
    })),
    claims: data.claims.map((c) => ({
      id: c.id,
      kind: c.kind,
      text: c.text,
      until: c.valid_until,
      withdrawn: !!c.withdrawn_at,
    })),
    goals: data.goals.map((g) => ({ goal: g.goal, words: g.detail })),
    cadence: data.cadence,
  };
}

/** The files tool's action week: this week's posts, as the Week shows them. */
export const weekRead = readAction({
  input: weekAsked,
  examples: [{}],
  label: "Reading this week's posts",
  words:
    "Action week answers this week's posts: the plan (fewer says why it is smaller), each slot's id, when, where, what, why, and what it asks to be filmed; the owner's claims with their ids, what posts are for, how often.",
  run: readWeek,
});

async function readReasons(toolContext: ToolContext, input: z.output<typeof weekAsked>) {
  const { data } = await load(toolContext.rc, opportunities, { week: input.week });
  return {
    week_of: data.week_of,
    reasons: data.reasons.map(({ kind, says, day, until, strength }) => ({ kind, says, day, until, strength })),
  };
}

/** The files tool's action reasons: why to post this week, with evidence. */
export const reasonsRead = readAction({
  input: weekAsked,
  examples: [{}],
  label: "Reading why to post now",
  words:
    "Action reasons answers why to post this week, strongest first: open time, offers, new services, good reviews, new clips.",
  run: readReasons,
});
