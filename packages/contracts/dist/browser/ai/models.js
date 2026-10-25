export const MODELS = {
  OPUS_5_5: "claude-opus-5-5",
  OPUS_5: "claude-opus-5",
  SONNET_5_5: "claude-sonnet-5-5",
  SONNET_5: "claude-sonnet-5",
  HAIKU_5_5: "claude-haiku-5-5",
  HAIKU_4_5: "claude-haiku-4-5-20251001"
};
export const MODEL_IDS = [
  MODELS.OPUS_5_5,
  MODELS.OPUS_5,
  MODELS.SONNET_5_5,
  MODELS.SONNET_5,
  MODELS.HAIKU_5_5,
  MODELS.HAIKU_4_5
];
export const MODEL_SPEEDS = ["standard", "fast"];
export const FAST_MODE_BETA = "fast-mode-2026-02-01";
export const THINKING_TYPES = ["adaptive", "between_tools", "disabled"];
const { OPUS_5_5, OPUS_5, SONNET_5_5, SONNET_5, HAIKU_5_5, HAIKU_4_5 } = MODELS;
export const MODEL_TAKES = {
  // Thinking can't be turned off on Opus 5.5: effort is its only control.
  [OPUS_5_5]: { thinking: ["adaptive"], fast: true, effortMessages: true, systemMessages: true },
  [OPUS_5]: { thinking: ["adaptive", "disabled"], fast: true, effortMessages: true, systemMessages: true },
  // Sonnet 5.5 takes an effort message only while it thinks: never beside `between_tools`, which no route sends.
  [SONNET_5_5]: { thinking: ["adaptive", "between_tools"], fast: false, effortMessages: true, systemMessages: true },
  [SONNET_5]: { thinking: ["adaptive", "disabled"], fast: false, effortMessages: false, systemMessages: false },
  // Haiku 5.5 takes `disabled` at effort high or below; no route sends it either.
  [HAIKU_5_5]: { thinking: ["adaptive", "disabled"], fast: false, effortMessages: true, systemMessages: false },
  // Haiku 4.5 thinks only on a token budget, which no route sends: it runs without.
  [HAIKU_4_5]: { thinking: ["disabled"], fast: false, effortMessages: false, systemMessages: false }
};
export function modelTakes(model) {
  return MODEL_TAKES[model] ?? null;
}
export function hasFastMode(model) {
  return modelTakes(model)?.fast === true;
}
export const MODEL_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
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
  "website_read"
];
export const MODEL_PORTS = ["anthropic", "typesafe"];
const RECEPTIONIST_TRY_MS = 2e4;
const ASK_TRY_MS = 55e3;
const DRAFT_TRY_MS = 55e3;
const REVIEW_TRY_MS = 15e3;
const JUDGE_TRY_MS = 28e3;
const NOTE_TRY_MS = 2e4;
const READ_TRY_MS = 8e3;
const REVIEW_CONVERSATION_TRY_MS = 4e4;
const FIX_ROUTE_TRY_MS = 12e3;
const WEBSITE_READ_TRY_MS = 25e3;
export const MODEL_ROUTES = {
  // Its intent, the class that intent falls under, and whether the customer asked to stop, are closed sets.
  receptionist: {
    model: OPUS_5,
    fallback: SONNET_5,
    timeoutMs: RECEPTIONIST_TRY_MS,
    retries: 1,
    maxTokens: 900,
    shadow: "typesafe"
  },
  reply_draft: { model: OPUS_5, fallback: SONNET_5, timeoutMs: RECEPTIONIST_TRY_MS, retries: 1, maxTokens: 900 },
  ask: { model: OPUS_5_5, fallback: SONNET_5, timeoutMs: ASK_TRY_MS, retries: 0, maxTokens: 4e3 },
  lead_json: { model: SONNET_5, fallback: OPUS_5, timeoutMs: DRAFT_TRY_MS, retries: 0, maxTokens: 2e3 },
  template_draft: { model: SONNET_5, fallback: OPUS_5, timeoutMs: DRAFT_TRY_MS, retries: 0, maxTokens: 900 },
  review_reply: { model: SONNET_5, fallback: OPUS_5, timeoutMs: REVIEW_TRY_MS, retries: 1, maxTokens: 300 },
  // The judge's own rescue is the API's server-side fallback (decision 14); an overload is the jobs ledger's retry.
  lead_judge: {
    model: OPUS_5,
    fallback: null,
    timeoutMs: JUDGE_TRY_MS,
    retries: 0,
    maxTokens: 6e3,
    shadow: "typesafe"
  },
  note_suggest: { model: HAIKU_4_5, fallback: SONNET_5, timeoutMs: NOTE_TRY_MS, retries: 1, maxTokens: 300 },
  reach_out_check: { model: HAIKU_4_5, fallback: SONNET_5, timeoutMs: READ_TRY_MS, retries: 0, maxTokens: 400 },
  reply_read: {
    model: HAIKU_4_5,
    fallback: SONNET_5,
    timeoutMs: READ_TRY_MS,
    retries: 0,
    maxTokens: 400,
    shadow: "typesafe"
  },
  // A booking tool's notice read into an appointment (docs/plans/2026-10-07-bookings-arrive-by-email.md): a short
  // email into a fixed shape, as the reply's reading is; an overload is the ledger's retry, as there.
  booking_read: { model: HAIKU_4_5, fallback: SONNET_5, timeoutMs: READ_TRY_MS, retries: 0, maxTokens: 600 },
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
    maxTokens: 4e3
  },
  fix_route: { model: HAIKU_4_5, fallback: SONNET_5, timeoutMs: FIX_ROUTE_TRY_MS, retries: 1, maxTokens: 400 },
  // The business's website read for Check (decision 0073, R10): a few pages into a fixed shape, the smallest model, its
  // answer checked in code (contracts businessReadFactsOf) and every price confirmed by the owner's tap.
  website_read: { model: HAIKU_5_5, fallback: SONNET_5, timeoutMs: WEBSITE_READ_TRY_MS, retries: 0, maxTokens: 2500 }
};
export function modelRoute(purpose) {
  return MODEL_ROUTES[purpose];
}
export function fallbackModel(purpose, asked) {
  const r = modelRoute(purpose);
  if (!r.fallback) return null;
  return asked === r.model ? r.fallback : r.model;
}
export function shadowPortOf(purpose) {
  return modelRoute(purpose).shadow ?? null;
}
export function isModelId(v) {
  return typeof v === "string" && MODEL_IDS.includes(v);
}
export function readsAsModel(v) {
  return typeof v === "string" && /^claude-[a-z0-9][a-z0-9.-]{0,62}$/.test(v);
}
export const RETELL_MODELS = { llm: "claude-4.5-haiku", analysis: "gpt-4.1" };
