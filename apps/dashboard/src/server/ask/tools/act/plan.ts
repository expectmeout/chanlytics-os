import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CONSENT_CHANNELS,
  JOURNEY_STAGE_IDS,
  PLAN_WORDS,
  channelChoices,
  listToken,
  parseTenantConfig,
  planOf,
  readyOrWhatsApp,
  type AskProposal,
  type PlanIntent,
  type PlanStep,
  type PlanWorld,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { channelsReady, config } from "../../../readers/facts";
import { playbooks } from "../../../readers/playbooks";
import {
  actAction,
  offeredTo,
  proposeMany,
  refuse,
  type ActDef,
  type ProposalOutcome,
  type ToolContext,
} from "../context";
import { getRoom } from "../read/calendar";
import { readJourney, readMessages } from "../read/campaigns";
import { listLists } from "../read/people";
import { settingsAct } from "./settings";
import { broadcastAction } from "./broadcast";
import { messageAction } from "./message";
import { playbookAction } from "./playbook";
import { playbookChangeAction } from "./playbook-change";

/** Who an offer goes to where the owner names no list: People's own list of who can receive offers. */
const OFFERS_LIST = listToken({ kind: "builtin", id: "offers_ok" });

/**
 * The action each kind of step is built through (contracts PlanStep.kind): a step's input is that action's input, as
 * planOf writes it (plan-of.test.mjs parses each with the action's own zod).
 */
const STEP_ACTIONS: Record<PlanStep["kind"], ActDef> = {
  message: messageAction,
  note: settingsAct,
  change: playbookChangeAction,
  broadcast: broadcastAction,
  playbook: playbookAction,
};

/** What a plan is asked as (propose_campaign's action plan): contracts PlanIntent, flat, and the message's language. */
interface PlanAsked {
  intent: "offer" | "cover_journey";
  offer?: Extract<PlanIntent, { intent: "offer" }>["offer"];
  say?: string;
  stages?: Extract<PlanIntent, { intent: "cover_journey" }>["stages"];
  language?: "en" | "es";
}

/** The intent as planOf takes it, or why not: an offer with nothing of it named. */
function intentOf(asked: PlanAsked): PlanIntent | { refusal: string } {
  if (asked.intent === "cover_journey") return { intent: "cover_journey", stages: asked.stages };
  if (!asked.offer) return { refusal: PLAN_WORDS.noOffer };
  return { intent: "offer", offer: asked.offer, ...(asked.say ? { say: asked.say } : {}) };
}

/**
 * The workspace as a plan is made against (contracts PlanWorld), each part read by the read Ask's own action of it makes,
 * so what the plan reuses, counts and covers is what those actions say: the Library (campaigns.messages), the lists and
 * their counts (people.lists: People's offered here and the workspace's own), the journey (campaigns.journey, as
 * Campaigns' home composes it), the campaigns (GET playbooks' reader, the journey's own read), the room (calendar.room:
 * none where no calendar can say it, or one with no slot either way), the receptionist's notes (the settings), and the
 * channels an offer may go by now (the channels' readiness with the offer's own rule, contracts channelChoices). Each
 * read once a turn, the independent ones together. And whether the member asking may approve a note for the
 * receptionist (context.ts offeredTo, the registry's own predicate), so a plan is never dead at a step its member may
 * not approve.
 */
async function planWorld(t: ToolContext, language: PlanWorld["language"]): Promise<PlanWorld> {
  const [library, lists, journey, pb, room, ready, cfg] = await Promise.all([
    readMessages(t),
    listLists(t),
    readJourney(t),
    load(t.rc, playbooks, undefined).then((r) => r.data.playbooks),
    getRoom(t),
    load(t.rc, channelsReady, undefined).then((r) => r.data),
    load(t.rc, config, undefined).then((r) => r.data),
  ]);
  // An offer is the business's news (decision D1): whether each channel may carry one now, by the rule a send's ticks are.
  const offers = channelChoices(readyOrWhatsApp(ready), "marketing", "ours");
  const may = (c: "whatsapp" | "email") => offers.some((o) => o.channel === c && o.ok);
  // The stages this workspace can run are the guide's (contracts journeyGuide: an appointment's only with a calendar, a
  // proposal's only where deals are on); the rail draws the others too, as needing what they lack.
  const runs = new Set(journey.guide.map((g) => g.stage));
  return {
    now: t.now,
    tz: t.timezone,
    language,
    channels: { whatsapp: may("whatsapp"), email_offers: may("email") },
    messages: library.messages,
    lists: [
      ...lists.lists.map((l) => ({ token: l.list, name: l.label, count: l.count })),
      ...lists.own.map((l) => ({ token: l.list, name: l.name, count: "count" in l ? (l.count ?? null) : null })),
    ],
    playbooks: pb.map((p) => ({
      id: p.id,
      name: p.name,
      trigger: p.trigger,
      state: p.state,
      template_name: p.template_name ?? null,
    })),
    notes: parseTenantConfig(cfg?.config ?? null)?.brain?.profile?.notes ?? [],
    room: "none" in room || room.open + room.taken === 0 ? null : { open: room.open, days: room.days },
    journey: journey.stages
      .filter((s) => runs.has(s.id))
      .map((s) => ({ id: s.id, covered: s.covered, moment: s.moment })),
    offersList: OFFERS_LIST,
    // Whether this member may approve the receptionist's note, by the predicate the registry offers propose_settings by.
    canNote: offeredTo(settingsAct, t.role),
  };
}

/**
 * One step's card, built by its action's own handler with the step's input as the plan wrote it, a token among it
 * (`@step:n`, which the handler takes for an earlier step's: context.ts stepNamed), parsed by that action's zod first as
 * the registry parses a call; or the step's refusal, in its handler's words.
 */
async function stepCard(t: ToolContext, step: PlanStep): Promise<AskProposal | { refusal: string }> {
  const def = STEP_ACTIONS[step.kind];
  const parsed = def.input.safeParse(step.input);
  if (!parsed.success)
    return { refusal: parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ") };
  const made = await def.build({ ...t, step: step.n }, parsed.data);
  if (made.proposal) return made.proposal;
  const said = JSON.parse(made.result) as { error?: unknown };
  return { refusal: typeof said.error === "string" ? said.error : made.result };
}

/**
 * An offer or a whole setup, as one plan (the marketing manager's spec §5.4): the workspace read once (planWorld), the
 * steps made with no model (contracts planOf, refused in its words), then each step built by its own action into an
 * ordinary card and stamped as one plan: its id, its step of how many, whether it sends nothing, and the steps a send
 * waits for. A step its action refuses is the plan's refusal, naming the step; nothing is proposed then. The cards come
 * back together (proposeMany), with the plan's words and its steps for the model to say.
 */
async function proposePlan(t: ToolContext, asked: PlanAsked): Promise<ProposalOutcome> {
  const intent = intentOf(asked);
  if ("refusal" in intent) return refuse(intent.refusal);
  const planned = planOf(intent, await planWorld(t, asked.language ?? "en"));
  if ("refused" in planned) return refuse(planned.refused);
  const made = await Promise.all(planned.steps.map((s) => stepCard(t, s)));
  const id = `plan-${randomUUID()}`;
  const of = planned.steps.length;
  const cards: AskProposal[] = [];
  for (const [i, s] of planned.steps.entries()) {
    const card = made[i];
    if (!card || "refusal" in card) return refuse(`Step ${s.n} (${s.kind}): ${card?.refusal ?? "it made no card"}`);
    cards.push({ ...card, plan: { id, step: s.n, of, silent: s.silent, after: s.after } });
  }
  return proposeMany(cards, {
    plan: id,
    steps: planned.steps.map((s, i) => ({ n: s.n, kind: s.kind, card: cards[i]?.title ?? "", silent: s.silent })),
    words: planned.words,
  });
}

/** An offer or a whole setup, made into its cards from one call: propose_campaign's action plan. */
export const planAction = actAction({
  // The action makes cards of several kinds; this is what the role it is offered to is judged by (an operator's).
  kind: "playbook",
  input: z.object({
    intent: z.enum(["offer", "cover_journey"]),
    offer: z
      .object({
        words: z.string(),
        from: z.string(),
        until: z.string(),
        service: z.string().optional(),
        who: z.string().optional(),
        channels: z.array(z.enum(CONSENT_CHANNELS)).optional(),
      })
      .optional(),
    say: z.string().optional(),
    stages: z.array(z.enum(JOURNEY_STAGE_IDS)).optional(),
    language: z.enum(["en", "es"]).optional(),
  }),
  examples: [
    { intent: "offer", offer: { words: "10% off colour all November", from: "2026-11-01", until: "2026-11-30" } },
    { intent: "cover_journey" },
  ],
  label: "Making a plan",
  words:
    "Action plan makes every card an offer or a whole setup takes, from one call: intent offer, with offer (words, the offer in their words; from and until, its first and last day, YYYY-MM-DD by the business's calendar; service, who as a list token, and channels, each optional) and say, their own phrasing where they gave one; or intent cover_journey, with optional stages, for a campaign on each moment of the journey not covered yet. Name what they asked for and the days they gave, never an id or a time to send: the plan reads the Library, the lists, the campaigns, the notes, the calendar's room and the channels itself, and reuses a message that fits or writes one in language (en or es, the one their customers read; en where none is named). It comes back as the plan's words and its steps, each its own card in order: those that send nothing (a message, a note for the receptionist, a pause) are approved together, and each send on its own after them; say the plan's words, and never that any of it is done.",
  build: proposePlan,
});
