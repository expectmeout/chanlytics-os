import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ASK_SENDS,
  CONSENT_CHANNELS,
  JOURNEY_STAGE_IDS,
  PLAN_WORDS,
  STEP_TOKEN,
  channelChoices,
  listToken,
  messageLanguageOf,
  messageLanguagesOf,
  notesInForce,
  parseTenantConfigResult,
  planOf,
  type AskProposal,
  type PlanIntent,
  type PlanStep,
  type PlanWorld,
} from "@chanlytics/contracts";
import { reviewLinkOf } from "@chanlytics/db";
import { load } from "../../../readers";
import { channelsReady, config, facts as factsReader } from "../../../readers/facts";
import { playbooks } from "../../../readers/playbooks";
import {
  NO_ACTION,
  actAction,
  defineActions,
  offeredTo,
  proposeMany,
  refuse,
  unread,
  type ActDef,
  type ActTool,
  type ProposalOutcome,
  type ToolContext,
  nullsLeftOut,
} from "../context";
import { getRoom } from "../read/calendar";
import { propose_call } from "./call";
import { propose_deal } from "./deal";
import { propose_follow_up } from "./follow-up";
import { propose_lead_search } from "./leads/lead-search";
import { propose_leads } from "./leads/leads";
import { propose_list } from "./people/list";
import { propose_people } from "./people/people";
import { propose_person } from "./person";
import { propose_reply } from "./reply";
import { propose_review } from "./review";
import { propose_sequence } from "./sequence";
import { propose_thread_verb } from "./thread-verb";
import { readJourney, readMessages } from "../read/campaigns";
import { listLists } from "../read/people";
import { propose_settings, settingsAct } from "./settings";
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

/** What a plan is asked as (propose_plan's action offer): contracts PlanIntent, flat, and the message's language. */
interface PlanAsked {
  intent: "offer" | "cover_journey";
  offer?: Extract<PlanIntent, { intent: "offer" }>["offer"];
  say?: string;
  stages?: Extract<PlanIntent, { intent: "cover_journey" }>["stages"];
  books?: string;
  proposals?: boolean;
  language?: "en" | "es";
}

/** The intent as planOf takes it, or why not: an offer with nothing of it named. */
function intentOf(asked: PlanAsked): PlanIntent | { refusal: string } {
  if (asked.intent === "cover_journey")
    return {
      intent: "cover_journey",
      ...(asked.stages ? { stages: asked.stages } : {}),
      ...(asked.books?.trim() ? { books: asked.books } : {}),
      ...(asked.proposals === true ? { proposals: true } : {}),
    };
  if (!asked.offer) return { refusal: PLAN_WORDS.noOffer };
  return { intent: "offer", offer: asked.offer, ...(asked.say ? { say: asked.say } : {}) };
}

/** A read the world is made of, or null where it failed, said in the log as every tool's failed read is (context.ts unread). */
const orNull = <T>(t: ToolContext, read: string, p: Promise<T>): Promise<T | null> =>
  p.catch(unread(t, "propose_plan.offer", read));

/** Everything a plan reads, each null where its read failed. */
async function worldReads(t: ToolContext) {
  const [library, lists, journey, pb, room, ready, settings, facts, reviewLink] = await Promise.all([
    orNull(t, "messages", readMessages(t)),
    orNull(t, "lists", listLists(t)),
    orNull(t, "journey", readJourney(t)),
    // The campaigns, and with them how the business works and who each moment reaches today (GET playbooks' answer).
    orNull(
      t,
      "playbooks",
      load(t.rc, playbooks, undefined).then((r) => r.data),
    ),
    orNull(t, "room", getRoom(t)),
    // Null where the channels could not be read (campaigns/channels-ready.ts channelsReadyOrNull): never "WhatsApp alone".
    orNull(
      t,
      "channels",
      load(t.rc, channelsReady, undefined).then((r) => r.data),
    ),
    // The row, or none: a workspace with no row has no notes; a read that failed is null.
    orNull(
      t,
      "settings",
      load(t.rc, config, undefined).then((r) => ({ row: r.data })),
    ),
    orNull(
      t,
      "facts",
      load(t.rc, factsReader, undefined).then((r) => r.data),
    ),
    // The link the review ask's slot fills from (db reviewLinkOf, the send's own reading): a read that failed is none, as
    // the starter set counts it (campaigns/starter-templates.ts startersHere), so no review ask is proposed on a guess.
    orNull(t, "review link", reviewLinkOf(t.ctx.supabase, t.tenantId)),
  ]);
  return { library, lists, journey, pb, room, ready, settings, facts, reviewLink };
}

/**
 * The receptionist's notes that still hold, by the one rule for it (contracts notesInForce, the rule Ask's settings read
 * says them by) over the profile as the settings read parses it, every one of them; or null where they could not be
 * read: a read that failed, or a configuration that does not parse, which would otherwise read as no notes and make a
 * second note over the first.
 */
function notesOf(r: Awaited<ReturnType<typeof worldReads>>, now: Date): PlanWorld["notes"] | null {
  if (!r.settings || !r.facts) return null;
  const parsed = parseTenantConfigResult(r.settings.row?.config ?? null);
  if (!parsed.ok) return null;
  // The rule for which notes still hold, with no cap: the prompt's ten (workspaceFacts) is its size, not the rule.
  return notesInForce(parsed.config.brain?.profile?.notes, r.facts.timezone, now);
}

/**
 * The language a plan's message is written in where the model named none: its customers' (contracts messageLanguageOf),
 * by the languages the business's profile says its receptionist answers in and the one the person asked in. A profile
 * that could not be read names none.
 */
function customersLanguage(r: Awaited<ReturnType<typeof worldReads>>, t: ToolContext): PlanWorld["language"] {
  const parsed = parseTenantConfigResult(r.settings?.row?.config ?? null);
  const names = parsed.ok ? (parsed.config.brain?.profile?.languages ?? []) : [];
  return messageLanguageOf(messageLanguagesOf(names), t.language);
}

/**
 * The workspace as a plan is made against (contracts PlanWorld), each part read by the read Ask's own action of it makes,
 * so what the plan reuses, counts and covers is what those actions say: the Library (sequences.messages), the lists and
 * their counts (people.lists: People's offered here and the workspace's own), the journey (sequences.journey, as
 * Campaigns' home composes it), the campaigns (GET playbooks' reader, the journey's own read), the room (calendar.room:
 * none where no calendar can say it, or one with no slot either way), the receptionist's notes in force (notesOf), the
 * channels an offer may go by now and why not (the channels' readiness with the offer's own rule, contracts
 * channelChoices, each entry whole) and whether WhatsApp sends at all, and whether the Google listing keeps a review link
 * (db reviewLinkOf). Each read once a turn, the independent ones together. And whether the member asking may approve a
 * note for the receptionist (context.ts offeredTo, the registry's own predicate), so a plan is never dead at a step its
 * member may not approve.
 *
 * A read that failed is never a guess of what it would have said: the plan is refused in its own words where it needs
 * the read (the channels, the Library and the campaigns always; an offer the lists and the notes, which a setup reads
 * neither of), and goes on without what it can do without: the room not known (never full), an offer's journey (only its
 * reminder's sentence reads it, and is not said), and the review link (none: the day after asks how it went). A setup's
 * journey unread is planOf's own refusal (journeyUnread).
 */
async function planWorld(
  t: ToolContext,
  intent: PlanIntent["intent"],
  language: PlanWorld["language"] | null,
): Promise<PlanWorld | { refusal: string }> {
  const r = await worldReads(t);
  const offer = intent === "offer";
  const notes = notesOf(r, t.rc.now);
  if (!r.ready) return { refusal: PLAN_WORDS.channelsUnread };
  // The campaigns before the Library: the Library's read names the campaigns that send each message, so it fails with them.
  if (!r.pb) return { refusal: offer ? PLAN_WORDS.playbooksUnread : PLAN_WORDS.journeyUnread };
  if (!r.library) return { refusal: PLAN_WORDS.libraryUnread };
  if (offer && !r.lists) return { refusal: PLAN_WORDS.listsUnread };
  if (offer && !notes) return { refusal: PLAN_WORDS.notesUnread };
  // An offer is the business's news (decision D1): whether each channel may carry one now, by the rule a send's ticks
  // are, and why not where it may not (WhatsApp's pause on offers to US numbers is not a missing number).
  const offers = channelChoices(r.ready, "marketing", "ours");
  const offerOn = (c: "whatsapp" | "email") => {
    const o = offers.find((x) => x.channel === c);
    return { ok: o?.ok === true, why: o?.why ?? null };
  };
  // The stages this workspace can run are the guide's (contracts journeyGuide: an appointment's only with a calendar, a
  // proposal's only where deals are on); the rail draws the others too, as needing what they lack.
  const runs = new Set(r.journey?.guide.map((g) => g.stage));
  const room = r.room && !("none" in r.room) && r.room.open + r.room.taken > 0 ? r.room : null;
  return {
    now: t.now,
    tz: t.timezone,
    language: language ?? customersLanguage(r, t),
    // A plan's words (a setup's, an offer's) are said in the question's language; anything but Spanish in English.
    says: t.language === "es" ? "es" : "en",
    // How the business works, as Campaigns says it (contracts lifecycle-inputs businessShapeOf): a calendar connected,
    // readable now or not, is the feed; else its booking tool's emails, else none.
    shape: {
      calendar: r.pb.calendar !== "none" ? "feed" : r.pb.bookings_by_email ? "email" : "none",
      dealsOn: r.pb.deals_on,
      word: r.pb.appointment_word,
    },
    // Who a run on each moment would pick now, the Playbooks page's own count; a moment not counted is null.
    reach: Object.fromEntries(Object.entries(r.pb.pools).map(([k, v]) => [k, v ? v.candidates : null])),
    channels: { whatsapp: offerOn("whatsapp"), email: offerOn("email") },
    // A message about their own appointment (the review ask) goes on WhatsApp where it sends, whatever offers may.
    whatsappSends: r.ready.whatsapp.ready,
    reviewLink: r.reviewLink !== null,
    messages: r.library.messages,
    lists: [
      ...(r.lists?.lists ?? []).map((l) => ({ token: l.list, name: l.label, count: l.count })),
      ...(r.lists?.own ?? []).map((l) => ({
        token: l.list,
        name: l.name,
        count: "count" in l ? (l.count ?? null) : null,
      })),
    ],
    playbooks: r.pb.playbooks.map((p) => ({
      id: p.id,
      name: p.name,
      trigger: p.trigger,
      state: p.state,
      template_name: p.template_name ?? null,
      // Its last day: a month's offer past it sends nothing, so the plan leaves it alone (contracts campaignEnded).
      until: p.until ?? null,
    })),
    notes: notes ?? [],
    room: room ? { open: room.open, days: room.days } : null,
    journey:
      r.journey?.stages
        .filter((s) => runs.has(s.id))
        .map((s) => ({ id: s.id, covered: s.covered, moment: s.moment })) ?? null,
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
  return { refusal: made.refusal ?? made.result };
}

/**
 * An offer or a whole setup, as one plan (the marketing manager's spec §5.4): the workspace read once (planWorld), the
 * steps made with no model (contracts planOf, refused in its words), then each step built by its own action into an
 * ordinary card. Where a step sends nothing, the cards are stamped as one plan (D3): its id, its step of how many,
 * whether it sends nothing, and the steps a send waits for, so its silent steps are one press and its cards keep a
 * plan's week. Where none does (a setup's campaigns, each its own press), they are plain cards, unstamped: a day's lapse
 * and their own keys, with no plan id said. A step its action refuses is the plan's refusal, naming the step; nothing is
 * proposed then. The cards come back together (proposeMany), with the plan's steps for the model and its words, which
 * the round that made it answers with (loop.ts).
 */
async function proposePlan(t: ToolContext, asked: PlanAsked): Promise<ProposalOutcome> {
  const intent = intentOf(asked);
  if ("refusal" in intent) return refuse(intent.refusal);
  const world = await planWorld(t, intent.intent, asked.language ?? null);
  if ("refusal" in world) return refuse(world.refusal);
  const planned = planOf(intent, world);
  if ("refused" in planned) return refuse(planned.refused);
  const made = await Promise.all(planned.steps.map((s) => stepCard(t, s)));
  const id = planned.steps.some((s) => s.silent) ? `plan-${randomUUID()}` : null;
  const of = planned.steps.length;
  const cards: AskProposal[] = [];
  for (const [i, s] of planned.steps.entries()) {
    const card = made[i];
    if (!card || "refusal" in card) return refuse(`Step ${s.n} (${s.kind}): ${card?.refusal ?? "it made no card"}`);
    cards.push(id ? { ...card, plan: { id, step: s.n, of, silent: s.silent, after: s.after } } : card);
  }
  const steps = planned.steps.map((s, i) => ({ n: s.n, kind: s.kind, card: cards[i]?.title ?? "", silent: s.silent }));
  return proposeMany(cards, id ? { plan: id, steps } : { steps }, planned.words, planned.lead ?? null);
}

/** An offer or a whole setup, made into its cards from one call: propose_plan's action offer. */
const planAction = actAction({
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
    books: z.string().optional(),
    proposals: z.boolean().optional(),
    language: z.enum(["en", "es"]).optional(),
  }),
  examples: [
    {
      intent: "offer",
      offer: { words: "10% off every service all November", from: "2026-11-01", until: "2026-11-30" },
    },
    { intent: "cover_journey" },
    { intent: "cover_journey", books: "discovery call", proposals: true },
  ],
  label: "Making a plan",
  words:
    "Action offer makes every card an offer or a whole setup takes, from one call: intent offer, with offer (words, the offer in their words, its days named as a customer reads them on its first day: “all November”, never “next month”; from and until, its first and last day, YYYY-MM-DD by the business's calendar; service, who as a list token, and channels, each optional) and say, their own phrasing of the offer where they gave one, its days named as words names them, never the ask (“I want to offer”); or intent cover_journey, with optional stages, for a campaign on each moment of the journey not covered yet, and what they told you of their business: books, what their customers book in their own words (“discovery call”), and proposals true where they said some customers get a proposal before they buy. The plan says what must be connected or turned on first for the moments it cannot start yet, and leads the answer with it. Name what they asked for and the days they gave, never an id or a time to send: the plan reads the Library, the lists, the campaigns, the notes, the calendar's room and the channels itself, and reuses a message that fits or writes one in language (en or es, as the rule for a message's language says; left out, the business's). It comes back as the plan's words and its steps, each its own card in order: those that send nothing (a message, a note for the receptionist, a pause) are approved together, and each send on its own after them; answer from the plan's words once they come back, and never say any of it is done.",
  build: proposePlan,
});

/* ------------------------------------------------------------ a plan across pages (the operator, 15 Oct 2026) -- */

/** The act tools a plan's step may name: every one but the plan itself. */
const STEP_TOOLS: ReadonlyMap<string, ActTool> = new Map(
  [
    propose_reply,
    propose_thread_verb,
    propose_call,
    propose_person,
    propose_people,
    propose_list,
    propose_deal,
    propose_settings,
    propose_lead_search,
    propose_leads,
    propose_sequence,
    propose_review,
    propose_follow_up,
  ].map((tool) => [tool.name, tool]),
);

/** The most steps one plan takes: a plan longer than this is two questions. */
const PLAN_STEPS_MAX = 12;

/** The earlier steps a payload names by their tokens (`@step:n`), anywhere in it. */
function stepsNamedIn(v: unknown, into: Set<number> = new Set()): Set<number> {
  if (typeof v === "string") {
    const m = STEP_TOKEN.exec(v);
    if (m) into.add(Number(m[1]));
  } else if (Array.isArray(v)) for (const x of v) stepsNamedIn(x, into);
  else if (v && typeof v === "object") for (const x of Object.values(v)) stepsNamedIn(x, into);
  return into;
}

interface PlanStepAsked {
  tool: string;
  action?: string;
  input: Record<string, unknown>;
}

/** One step's card, built by the named action's own handler with the step's input, parsed by its own zod first. */
async function genericStep(t: ToolContext, n: number, step: PlanStepAsked): Promise<AskProposal | { refusal: string }> {
  const tool = STEP_TOOLS.get(step.tool);
  if (!tool) return { refusal: `${step.tool} is not a tool a plan's step takes` };
  const hasActions = !Object.prototype.hasOwnProperty.call(tool.actions, NO_ACTION);
  const key = hasActions ? (step.action ?? "") : NO_ACTION;
  const def = Object.prototype.hasOwnProperty.call(tool.actions, key) ? tool.actions[key] : null;
  if (!def) return { refusal: `${step.tool} takes action ${Object.keys(tool.actions).join(", ")}` };
  if (!offeredTo(def, t.role)) return { refusal: `${step.tool}.${key} is not this member's to approve` };
  const parsed = def.input.safeParse(nullsLeftOut(step.input ?? {}));
  if (!parsed.success)
    return { refusal: parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ") };
  const made = await def.build({ ...t, step: n }, parsed.data);
  if (made.proposal) return made.proposal;
  return { refusal: made.refusal ?? made.result };
}

/**
 * A plan across pages (the operator, 15 Oct 2026): the steps Ask names, each a card of any act tool, built by its own
 * action's handler as one call of it would be, a later step naming what an earlier one makes by its token (`@step:n`:
 * a list, a sequence, a message, a list of leads, a search). Stamped as one plan: the steps that change only what the
 * workspace keeps (a list, a draft, a note, a follow-up) are one press, approved together in step order; each step that
 * reaches outside it (contracts ASK_SENDS: a message, a search, a start, a post) is its own press after them; and a step
 * that names a send's result by its token waits for that send too, pressed on its own after it. A step its action
 * refuses is the plan's refusal, naming the step; nothing is proposed then.
 */
async function proposeSteps(
  t: ToolContext,
  asked: { words?: string; steps: PlanStepAsked[] },
): Promise<ProposalOutcome> {
  if (asked.steps.length < 2) return refuse("a plan is two steps or more; one card is its own tool's call");
  if (asked.steps.length > PLAN_STEPS_MAX) return refuse(`a plan takes at most ${PLAN_STEPS_MAX} steps: split it`);
  const cards: AskProposal[] = [];
  for (const [i, step] of asked.steps.entries()) {
    const n = i + 1;
    const card = await genericStep(t, n, step);
    if ("refusal" in card)
      return refuse(`Step ${n} (${step.tool}${step.action ? `.${step.action}` : ""}): ${card.refusal}`);
    cards.push(card);
  }
  const id = `plan-${randomUUID()}`;
  const of = cards.length;
  // Each step's place in the plan, in order: silent where it changes only what the workspace keeps and names no send's
  // result; else its own press, after every silent step before it and each step it names.
  const silentAt: boolean[] = [];
  const stamped = cards.map((c, i) => {
    const n = i + 1;
    const named = [...stepsNamedIn(c.payload)].filter((k) => k >= 1 && k < n);
    // A step that names a send's result cannot go with the silent press: it waits for that send, on its own.
    const silent = !ASK_SENDS.has(c.kind) && named.every((k) => silentAt[k - 1]);
    silentAt.push(silent);
    const waits = silent
      ? []
      : [...new Set([...silentAt.slice(0, i).flatMap((s, k) => (s ? [k + 1] : [])), ...named])].sort((a, b) => a - b);
    return { ...c, plan: { id, step: n, of, silent, after: waits } };
  });
  const steps = stamped.map((c) => ({ n: c.plan.step, kind: c.kind, card: c.title, silent: c.plan.silent }));
  const words =
    asked.words?.trim() ||
    `${of} steps: ${stamped.filter((c) => c.plan.silent).length} that change only what you keep, approved together, then each send on its own.`;
  return proposeMany(stamped, { plan: id, steps }, words, null);
}

const stepsAction = actAction({
  // The action makes cards of several kinds; this is what the role it is offered to is judged by (an operator's).
  kind: "list",
  input: z.object({
    words: z
      .string()
      .optional()
      .describe("The plan in the person's words, said as the answer: what it does, in a sentence or two."),
    steps: z
      .array(
        z.object({
          tool: z.string().describe("An act tool's name, such as propose_list or propose_sequence."),
          action: z.string().optional().describe("Its action, where the tool takes one."),
          input: z
            .record(z.string(), z.unknown())
            .describe(
              "The action's own input, as one call of it takes it; an id an earlier step makes is its token, @step:n.",
            ),
        }),
      )
      .describe(`Two to ${PLAN_STEPS_MAX} steps, in the order they are approved.`),
  }),
  examples: [
    {
      words: "Keep the 120 best leads as a list, write to them in three emails, and I'll tell you who answers.",
      steps: [
        {
          tool: "propose_leads",
          action: "list",
          input: { name: "Businesses near you", lead_ids: ["5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b"] },
        },
        {
          tool: "propose_sequence",
          action: "cold_email",
          input: {
            name: "Businesses near you",
            search_id: "@step:1",
            steps: [{ subject: "A quick idea for {business_name}", body: "Hi {first_name}, ..." }],
          },
        },
        {
          tool: "propose_follow_up",
          action: "keep",
          input: {
            said: "When they answer, I'll draft the replies",
            prompt: "Businesses near you has replies: read them and propose answers.",
            wake: "replies",
            subject: "@step:2",
          },
        },
      ],
    },
  ],
  label: "Making a plan",
  words: `Action steps makes a plan across pages from the steps you name: each a card of any act tool, by its tool, action and its own input, a later step naming what an earlier one makes by its token (@step:n: a list, a list of leads, a message, a sequence, a search). The steps that change only what the workspace keeps are approved together; each that sends, spends or posts is its own press after them. Call it when one ask takes several cards that build on each other (organize people into lists, a cold email to a list of leads with a follow-up, a sequence and its first steps); for an offer or a whole setup of the journey, action offer.`,
  build: proposeSteps,
});

/**
 * Ask's plans (the operator, 15 Oct 2026): an offer or a whole setup of the journey, made with no model from the
 * workspace (offer, once propose_campaign's plan), and a plan across pages from steps Ask names (steps).
 */
export const propose_plan = defineActions({
  name: "propose_plan",
  description:
    "Propose a plan of several cards from one call, approved as one: an offer or a whole setup of the customer journey, made from the workspace itself; or any steps across pages you name, each a card of an act tool, building on one another.",
  tail: "Call it alone, with no answer beside it: its result comes back with the plan's words, and you write the answer from them. Never say any of it is done.",
  actions: {
    offer: planAction,
    steps: stepsAction,
  },
});
