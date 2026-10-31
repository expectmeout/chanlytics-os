/**
 * Which model each purpose asks, said once (scorecard move 10; defect 54).
 *
 * Before this, six model ids sat in ten files, each with its own timeout and retries, and one of them (the reach-out
 * reads) repeated another's literal. A purpose is a reason the platform spends its model key: the receptionist's
 * answer, Ask's round, a review's reply, the lead judge, a note, a reach-out's opening and its reading. Each has one
 * route: the model it asks, the model it asks once more when that one is overloaded or down, how long a try may take,
 * how many tries a "not now" earns, and how many tokens an answer may write. The model port
 * (packages/channels/src/models/anthropic.ts) reads the route; nothing else names a model.
 *
 * A fallback is asked only for an answer that never came (a 529, a 5xx or a try that ran out of time) or for a model
 * the API does not know (a 404: a variable's misspelt name, an id since retired). A refusal, a bad request or a 429 is
 * the answer. Ask's model is whatever its deployment names (ASK_MODEL: any Claude model, ask-model.ts), and a model that
 * is not the route's own falls back to the route's: a deployment that runs Ask on Sonnet falls back to Opus 5.5.
 *
 * A purpose whose answer is a closed set may also name a shadow port (`shadow`): a second model that is put the same
 * question beside the primary while its switch is on, in shadow (shadow.ts; decision 0023). It changes nothing a
 * customer receives.
 *
 * Retell's models are Retell's names for the models behind a call (voice-provision.ts): the provider's words, kept
 * here so every model the platform pays for is in one list.
 */

/**
 * The models the platform asks, by their API ids: the only place an id is written (model-registry.test.mjs). Haiku 5.5
 * (15 Oct 2026, the speed plan's step 1) asks the small reads since 30 Oct 2026; Haiku 4.5 and Opus 5 are asked by no
 * route since, and Sonnet 5 is a fallback alone. Each stays listed so a model a variable names is still priced.
 */
export const MODELS = {
  OPUS_5_5: "claude-opus-5-5",
  OPUS_5: "claude-opus-5",
  SONNET_5_5: "claude-sonnet-5-5",
  SONNET_5: "claude-sonnet-5",
  HAIKU_5_5: "claude-haiku-5-5",
  HAIKU_4_5: "claude-haiku-4-5-20251001",
} as const;
/** The same ids as a closed set: a new one is added above, with its price (usage.ts MODEL_PRICES). */
export const MODEL_IDS = [
  MODELS.OPUS_5_5,
  MODELS.OPUS_5,
  MODELS.SONNET_5_5,
  MODELS.SONNET_5,
  MODELS.HAIKU_5_5,
  MODELS.HAIKU_4_5,
] as const;
export type ModelId = (typeof MODEL_IDS)[number];

/**
 * How fast a model writes: at its standard speed, or in fast mode (Anthropic's research preview, the Claude API only:
 * up to 2.5 times the output tokens a second, at twice the price; usage.ts FAST_MODE_PRICES). A request asks for fast
 * mode with `speed: "fast"` in its body and FAST_MODE_BETA in its anthropic-beta header; standard is the request
 * that names no speed. Fast mode has its own rate limit, apart from the model's: the port asks a fast request that
 * limit refuses (a 429) once more at standard speed (channels models/anthropic.ts).
 */
export const MODEL_SPEEDS = ["standard", "fast"] as const;
export type ModelSpeed = (typeof MODEL_SPEEDS)[number];
/** The beta a fast request names (Anthropic's fast mode page, read 15 Oct 2026). */
export const FAST_MODE_BETA = "fast-mode-2026-02-01";

/**
 * A thinking setting a request may name (`thinking.type`): adaptive (the model decides how much, the default of every
 * model here that thinks), between_tools (Sonnet 5.5's lowest: no thinking but between tool calls), or disabled.
 */
export const THINKING_TYPES = ["adaptive", "between_tools", "disabled"] as const;
export type ThinkingType = (typeof THINKING_TYPES)[number];

/**
 * What each model takes of the settings the gateway lets a request name (Anthropic's model pages and migration guide,
 * read 15 Oct 2026): the thinking types it accepts, whether it runs fast mode, and whether it takes an effort said in
 * its messages (ai/effort.ts). The port sends a model only what it takes (channels models/anthropic.ts), so a fallback
 * asked with a request written for another model still answers: Opus 5.5's fast request falls back to Sonnet 5 at
 * standard speed, Sonnet 5.5's `between_tools` to Opus 5.5 thinking as it does, and Opus 5.5's effort messages to
 * Sonnet 5 as the request's own effort.
 *
 * Haiku 5.5 also refuses three things no route sends it: a server-side `fallbacks` list (its refusals have no fallback;
 * the lead judge's `fallbacks: "default"` is taken and does nothing), an assistant prefill (Ask's requests end on the
 * person's turn), and a temperature other than its default (Ask sends none, ask-model.ts). Our routes fall back in our
 * own code (MODEL_ROUTES), so none of them changes anything here.
 */
export interface ModelTakes {
  thinking: readonly ThinkingType[];
  fast: boolean;
  /** An effort message (ai/effort.ts, per-message effort): the API refuses one to a model without ("per-turn effort"). */
  effortMessages: boolean;
  /**
   * A words message (ai/words-message.ts, a mid-conversation system message): the models the API's guide names, read
   * 16 Oct 2026; another is refused one ("role 'system' is not supported on this model") and is sent the words in the
   * person's turn instead.
   */
  systemMessages: boolean;
}

const { OPUS_5_5, OPUS_5, SONNET_5_5, SONNET_5, HAIKU_5_5, HAIKU_4_5 } = MODELS;

export const MODEL_TAKES: Record<ModelId, ModelTakes> = {
  // Thinking can't be turned off on Opus 5.5: effort is its only control.
  [OPUS_5_5]: { thinking: ["adaptive"], fast: true, effortMessages: true, systemMessages: true },
  [OPUS_5]: { thinking: ["adaptive", "disabled"], fast: true, effortMessages: true, systemMessages: true },
  // Sonnet 5.5 takes an effort message only while it thinks: never beside `between_tools`, which no route sends.
  [SONNET_5_5]: { thinking: ["adaptive", "between_tools"], fast: false, effortMessages: true, systemMessages: true },
  [SONNET_5]: { thinking: ["adaptive", "disabled"], fast: false, effortMessages: false, systemMessages: false },
  // Haiku 5.5 takes `disabled` at effort high or below: what a route with its thinking off sends it (routeThinkingFor).
  [HAIKU_5_5]: { thinking: ["adaptive", "disabled"], fast: false, effortMessages: true, systemMessages: false },
  // Haiku 4.5 thinks only on a token budget, which no route sends: it runs without.
  [HAIKU_4_5]: { thinking: ["disabled"], fast: false, effortMessages: false, systemMessages: false },
};

/** What a model takes; null for one the registry does not list (a variable's), which is sent what it is asked. */
export function modelTakes(model: string): ModelTakes | null {
  return (MODEL_TAKES as Record<string, ModelTakes>)[model] ?? null;
}

/** Whether a model runs fast mode: the registry's word, and no for a model it does not list. */
export function hasFastMode(model: string): boolean {
  return modelTakes(model)?.fast === true;
}

/**
 * How hard a request asks a model to think (`output_config.effort`), least first: the levels the gateway lets through,
 * which every model a route asks accepts. Ask's is its deployment's to name (ASK_EFFORT, ask-model.ts), and a draft's
 * (ASK_DRAFT_EFFORT); xhigh and max since 15 Oct 2026, for the drafts (the effort sweep: ai/effort.ts).
 */
export const MODEL_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ModelEffort = (typeof MODEL_EFFORTS)[number];

/** Why the platform spends its model key. The usage ledger (ai_usage.purpose) keeps these words. */
export const MODEL_PURPOSES = [
  "receptionist",
  "reply_draft",
  "ask",
  "lead_json",
  "template_draft",
  "review_reply",
  "lead_judge",
  "note_suggest",
  "reach_out_check",
  "reply_read",
  "booking_read",
  "lead_suggest",
  "ask_journal",
  "receptionist_review",
  "fix_route",
  "website_read",
  "sender_read",
] as const;
export type ModelPurpose = (typeof MODEL_PURPOSES)[number];

/** The ports a model call leaves by: Anthropic's, and TypeSafe's System One (packages/channels/src/models). */
export const MODEL_PORTS = ["anthropic", "typesafe"] as const;
export type ModelPort = (typeof MODEL_PORTS)[number];
/** A port a second opinion may come from: every port but the primary's. */
export type ShadowPort = Exclude<ModelPort, "anthropic">;

export interface ModelRoute {
  model: ModelId;
  /** Asked once when the model's answer never came (529, 5xx, a timeout); null when the purpose waits instead. */
  fallback: ModelId | null;
  /** One try's bound. */
  timeoutMs: number;
  /** Tries after the first on a "not now" (408, 429, a connection that never opened). */
  retries: number;
  /** The most one answer may write. */
  maxTokens: number;
  /** A second port put the same closed-set question in shadow; absent when the purpose has none. */
  shadow?: ShadowPort;
  /**
   * `off`: a short read into a fixed shape, where a model that thinks by default spends its thinking inside the cap and
   * can run out of it before the answer (a customer's website read, 29 Oct 2026: 2,500 tokens and no facts). Each model is
   * sent the off it takes (routeThinkingFor). Absent: each model thinks as it does by default.
   */
  thinking?: "off";
}

/** The efforts a model still takes a thinking off at: Haiku 5.5's `disabled` and Sonnet 5.5's `between_tools` stop at high. */
const THINKING_OFF_EFFORTS: readonly unknown[] = [undefined, "low", "medium", "high"];

/**
 * The least thinking `model` takes: `disabled` where it takes that, `between_tools` for Sonnet 5.5, whose lowest it is;
 * null where it takes neither (Opus 5.5 cannot stop thinking), the registry does not list it, or the effort is past high.
 */
export function thinkingOffOf(model: string, effort?: unknown): { type: "disabled" | "between_tools" } | null {
  const takes = modelTakes(model);
  if (!takes || !THINKING_OFF_EFFORTS.includes(effort)) return null;
  if (takes.thinking.includes("disabled")) return { type: "disabled" };
  if (takes.thinking.includes("between_tools")) return { type: "between_tools" };
  return null;
}

/**
 * The thinking a request on this purpose sends `model` when the request names none: for a route with its thinking off,
 * the least the model takes (thinkingOffOf); null where the route leaves thinking alone.
 */
export function routeThinkingFor(
  purpose: ModelPurpose,
  model: string,
  effort?: unknown,
): { type: "disabled" | "between_tools" } | null {
  return modelRoute(purpose).thinking === "off" ? thinkingOffOf(model, effort) : null;
}

/**
 * The receptionist's try: inside a sixty-second webhook that must still persist, send and escalate. The first try and
 * the fallback's together stay at forty seconds, the two SDK attempts it had before.
 */
const RECEPTIONIST_TRY_MS = 20_000;
/** Ask's round: the edge's door stops at sixty seconds (vercel.json). */
const ASK_TRY_MS = 55_000;
/** The dashboard's small drafts: the edge's door stops at a minute. */
const DRAFT_TRY_MS = 55_000;
/** A Google review's reply: a person may be waiting in Reports. */
const REVIEW_TRY_MS = 15_000;
/** The lead judge: inside a job whose margin core keeps (core/leads/judge.ts JUDGE_TIMEOUT_MS reads this). */
const JUDGE_TRY_MS = 28_000;
/** A note's look: a sweep, nobody waiting. */
const NOTE_TRY_MS = 20_000;
/** A reach-out's opening check and a reply's reading: each inside a tick or a job with its own deadline. */
const READ_TRY_MS = 8_000;
/** A rehearsal's review: the owner waits on the page for it, inside the edge's minute (decision 0069). */
const REVIEW_CONVERSATION_TRY_MS = 40_000;
/** A fix routed to its field: the owner waits on the press. */
const FIX_ROUTE_TRY_MS = 12_000;
/** A website's pages read into Check's facts: a job of its own, while the owner goes on through Check. */
const WEBSITE_READ_TRY_MS = 25_000;

/*
 * 30 Oct 2026, the routes replayed before they moved (Ruben's word on the numbers): the receptionist's 32 nightly cases,
 * the agency's reply drafts, its lead searches and every small read's fixtures, asked of the old route and its
 * candidates and read for what a customer or an owner receives. Opus 5.5 at the brain's low effort held every check
 * Opus 5 held, a quarter cheaper and sooner; Haiku 5.5 with its thinking off read as well or better than Haiku 4.5 at a
 * ninth of the price, and a reach-out's honest openings went from 42% of its checks to 85%; Sonnet 5.5 costs what
 * Sonnet 5 does. Each fallback that was Sonnet 5 on these routes is Sonnet 5.5.
 *
 * The same day, the routes left on Sonnet 5, each draft asked through the dashboard's own code: Sonnet 5 thinks inside a
 * small cap, and the template drafter ran out of its 900 tokens on 3 drafts in 12 ("not well-formed"); Sonnet 5.5 with
 * its thinking off wrote all 12 in a third of the time, and every lead draft and review reply, keeping to the facts
 * given where Sonnet 5 once offered a person's own booked visit as an open slot. Sonnet 5.5 as it thinks by default
 * ran out of a review reply's 300 tokens and wrote nothing, so these routes keep their thinking off. Ask's rounds on
 * Sonnet 5.5 chose the tools Sonnet 5 chose, sooner and for less.
 */
export const MODEL_ROUTES = {
  // Its intent, the class that intent falls under, and whether the customer asked to stop, are closed sets.
  receptionist: {
    model: OPUS_5_5,
    fallback: SONNET_5_5,
    timeoutMs: RECEPTIONIST_TRY_MS,
    retries: 1,
    maxTokens: 900,
    shadow: "typesafe",
  },
  reply_draft: { model: OPUS_5_5, fallback: SONNET_5_5, timeoutMs: RECEPTIONIST_TRY_MS, retries: 1, maxTokens: 900 },
  ask: { model: OPUS_5_5, fallback: SONNET_5_5, timeoutMs: ASK_TRY_MS, retries: 0, maxTokens: 4000 },
  // The dashboard's small drafts (a lead's email, a person's message, a list, a sequence), each a record at low effort.
  lead_json: {
    model: SONNET_5_5,
    fallback: SONNET_5,
    timeoutMs: DRAFT_TRY_MS,
    retries: 0,
    maxTokens: 2000,
    thinking: "off",
  },
  // Its model is the template drafter's (campaigns/templates.ts DRAFT_MODEL), which asks as Ask's round and names its
  // own thinking off (thinkingOffOf). What is asked as this purpose is a skill's craft call on Ask's model at high
  // effort, whose fallback is this model: that one keeps its thinking, so the route leaves thinking alone.
  template_draft: { model: SONNET_5_5, fallback: SONNET_5, timeoutMs: DRAFT_TRY_MS, retries: 0, maxTokens: 900 },
  review_reply: {
    model: SONNET_5_5,
    fallback: SONNET_5,
    timeoutMs: REVIEW_TRY_MS,
    retries: 1,
    maxTokens: 300,
    thinking: "off",
  },
  // The judge's own rescue is the API's server-side fallback (decision 14); an overload is the jobs ledger's retry.
  // Opus 5.5 answers a call in 9 seconds where Opus 5 took 12, and reads a website or an email the listing does not show
  // as missing (fail), where Opus 5 said it could not tell (Ruben, 30 Oct 2026: missing).
  lead_judge: {
    model: OPUS_5_5,
    fallback: null,
    timeoutMs: JUDGE_TRY_MS,
    retries: 0,
    maxTokens: 6000,
    shadow: "typesafe",
  },
  // The small reads, each a short answer into a fixed shape: the smallest model, with its thinking off.
  note_suggest: {
    model: HAIKU_5_5,
    fallback: SONNET_5_5,
    timeoutMs: NOTE_TRY_MS,
    retries: 1,
    maxTokens: 300,
    thinking: "off",
  },
  reach_out_check: {
    model: HAIKU_5_5,
    fallback: SONNET_5_5,
    timeoutMs: READ_TRY_MS,
    retries: 0,
    maxTokens: 400,
    thinking: "off",
  },
  reply_read: {
    model: HAIKU_5_5,
    fallback: SONNET_5_5,
    timeoutMs: READ_TRY_MS,
    retries: 0,
    maxTokens: 400,
    shadow: "typesafe",
    thinking: "off",
  },
  // A booking tool's notice read into an appointment (docs/plans/2026-10-07-bookings-arrive-by-email.md): a short
  // email into a fixed shape, as the reply's reading is; an overload is the ledger's retry, as there.
  booking_read: {
    model: HAIKU_5_5,
    fallback: SONNET_5_5,
    timeoutMs: READ_TRY_MS,
    retries: 0,
    maxTokens: 600,
    thinking: "off",
  },
  // The ideas for a new search (00398): four ready plans written from what a workspace's searches found, a page waiting
  // on them (Ruben, 11 Oct 2026: Sonnet 5.5 for now). The fallback is the small drafts' own model.
  lead_suggest: { model: SONNET_5_5, fallback: SONNET_5, timeoutMs: DRAFT_TRY_MS, retries: 0, maxTokens: 1800 },
  // Ask's journal (decision 0070): a workspace's day, written in a few sentences from its ledgers' lines, by the note
  // sweep inside its minute, asked at low effort (its thinking counts against the tokens). No retry: a day not written
  // in time is let go as failed, never asked twice.
  ask_journal: { model: SONNET_5_5, fallback: SONNET_5, timeoutMs: NOTE_TRY_MS, retries: 0, maxTokens: 1500 },
  // A rehearsal's review (decision 0069, D3): every answer of a conversation judged against what it was told, Sonnet
  // 5.5 for the judgement; and the owner's correction routed to its field, the smallest model, its answer checked in code.
  receptionist_review: {
    model: SONNET_5_5,
    fallback: SONNET_5,
    timeoutMs: REVIEW_CONVERSATION_TRY_MS,
    retries: 0,
    maxTokens: 4000,
  },
  fix_route: {
    model: HAIKU_5_5,
    fallback: SONNET_5_5,
    timeoutMs: FIX_ROUTE_TRY_MS,
    retries: 1,
    maxTokens: 400,
    thinking: "off",
  },
  // The business's website read for Check (decision 0073, R10): a few pages into a fixed shape, the smallest model, its
  // answer checked in code (contracts businessReadFactsOf) and every price confirmed by the owner's tap. Its thinking
  // off: thinking as it did by default, it spent the whole cap on a customer's pages and found nothing (29 Oct 2026).
  website_read: {
    model: HAIKU_5_5,
    fallback: SONNET_5_5,
    timeoutMs: WEBSITE_READ_TRY_MS,
    retries: 0,
    maxTokens: 2500,
    thinking: "off",
  },
  // A stranger's first email to a connected mailbox, read for what its sender is (decision 0080): a short email into a
  // fixed shape, inside a sync's or an import part's minute. Nothing waits on it: no answer leaves the email to the
  // rules, and the next email from the sender is read again.
  sender_read: {
    model: HAIKU_5_5,
    fallback: SONNET_5_5,
    timeoutMs: READ_TRY_MS,
    retries: 0,
    maxTokens: 200,
    thinking: "off",
  },
} as const satisfies Record<ModelPurpose, ModelRoute>;

/** A purpose's route. */
export function modelRoute(purpose: ModelPurpose): ModelRoute {
  return MODEL_ROUTES[purpose];
}

/**
 * The model asked once more when `asked` gave no answer, for this purpose: the route's fallback, or the route's own
 * model when another was asked (a variable's: Ask's, whatever it names). Null when the purpose has none.
 */
export function fallbackModel(purpose: ModelPurpose, asked: string): ModelId | null {
  const r = modelRoute(purpose);
  if (!r.fallback) return null;
  return asked === r.model ? r.fallback : r.model;
}

/** The port a purpose is put beside in shadow, or null when it has none. */
export function shadowPortOf(purpose: ModelPurpose): ShadowPort | null {
  return modelRoute(purpose).shadow ?? null;
}

/** Whether a string is one of the platform's model ids. */
export function isModelId(v: unknown): v is ModelId {
  return typeof v === "string" && (MODEL_IDS as readonly string[]).includes(v);
}

/**
 * Whether a string reads as a Claude model's id, the registry's or not: what a variable that names a model may hold
 * (ASK_MODEL, LEAD_JUDGE_MODEL). The shape alone; whether the API has such a model is the API's to say, and the port
 * asks the route's fallback when it does not.
 */
export function readsAsModel(v: unknown): v is string {
  return typeof v === "string" && /^claude-[a-z0-9][a-z0-9.-]{0,62}$/.test(v);
}

/** The models behind a phone call, in Retell's own names (voice-provision.ts): its language model and its analysis. */
export const RETELL_MODELS = { llm: "claude-4.5-haiku", analysis: "gpt-4.1" } as const;
