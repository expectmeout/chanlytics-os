import { DAY_MS, MIN_MS, WEEK_MS } from "../shared/time.js";
import { parseLeadsRoute } from "../leads/lead-plan.js";
import { parsePipelineRoute } from "../deals/pipeline/pipeline-views.js";
import { pipelinePersonOf } from "../deals/pipeline/pipeline-vm.js";
import { personRouteOf } from "../person-page/route.js";
import { parseSequencesRoute } from "../sequences/sequence-address.js";
export const ASK_MAX_CHARS = 1e3;
const ASK_COLUMN_PX = { min: 240, max: 1600 };
export function askColumnOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  const px = typeof r.px === "number" && Number.isFinite(r.px) ? Math.round(r.px) : Number.NaN;
  return px >= ASK_COLUMN_PX.min && px <= ASK_COLUMN_PX.max ? { px, phone: r.phone === true } : null;
}
export const ASK_MAX_ROUNDS = 8;
export const ASK_TURN_BUDGET_MS = 2 * MIN_MS;
export const ASK_SPOKEN_TURN_BUDGET_MS = 45e3;
export const ASK_TOOLS_CHARS_CEILING = 13e4;
export const ASK_CORE_TOOLS_CHARS_CEILING = 4e4;
export const ASK_SELECTION_MAX = 2e3;
export const ASK_VOICE_PULSE_MS = 1e4;
export const ASK_VOICE_FIRST_WORDS_MS = 2500;
export const ASK_VOICE_CLAIM_STALE_MS = MIN_MS;
export const ASK_VOICE_TOKEN_MIN_MS = 15 * MIN_MS;
export const ASK_VOICE_ID = "UgBBYS2sOqTuMpoF3BR0";
export const ASK_VOICE_MODEL = "eleven_turbo_v2";
export const ASK_SPEECH_MAX_CHARS = 1500;
export const SPEECH_PURPOSES = ["brief", "answer"];
export const VOICE_END_REASONS = ["button", "typed", "superseded", "navigated", "vendor", "start", "idle"];
export const isVoiceEndReason = (word) => VOICE_END_REASONS.includes(word ?? "");
export const ASK_VOICE_IDLE_MS = MIN_MS;
export const ASK_VOICE_UP_WAIT_MS = 2500;
export const ASK_VOICE_TIMING_MAX_MS = 10 * MIN_MS;
export const ASK_MAX_TOKENS = 4e3;
export const ASK_WARM_MAX_TOKENS = 64;
export const ASK_TOKENS_DAY = 3e6;
export const ASK_CAPS = {
  threads: 20,
  messages: 30,
  messagesMore: 80,
  calls: 20,
  transcript: 40,
  people: 12,
  citations: 6,
  followups: 3,
  needsRows: 10
};
export const ASK_THREAD_VERBS = ["take_over", "hand_back", "snooze", "wake", "archive", "resolve"];
export const ASK_UNDO_MS = 10 * MIN_MS;
const ASK_CARD_FRESH_MS = DAY_MS;
const ASK_PLAN_FRESH_MS = WEEK_MS;
export function askCardLapsed(p, nowMs) {
  const made = typeof p.made_at === "string" ? Date.parse(p.made_at) : NaN;
  return Number.isFinite(made) && nowMs - made > (p.plan ? ASK_PLAN_FRESH_MS : ASK_CARD_FRESH_MS);
}
export const ASK_SCOPE_KINDS = [
  "thread",
  "conversation",
  "call",
  "person",
  "page",
  "lead",
  "search",
  "run",
  "playbook",
  "ad"
];
const UUID = /^[0-9a-f-]{36}$/;
function clientsScope(param, label) {
  const leads = parseLeadsRoute(`clients/${param}`);
  if (leads) {
    if (leads.peek) return { kind: "lead", id: leads.peek, label: label || "this lead" };
    if (leads.searchId) return { kind: "search", id: leads.searchId, label: label || "this search" };
    return null;
  }
  const pipeline = parsePipelineRoute(`clients/${param}`);
  if (pipeline)
    return pipeline.peek ? { kind: "person", id: pipelinePersonOf(pipeline.peek), label: label || "this person" } : null;
  const { id } = personRouteOf(param);
  if (UUID.test(id)) return { kind: "person", id, label: label || "this person" };
  return null;
}
export function scopeFromRoute(page, param, label, chains) {
  if (!param) return null;
  if (page === "inbox" && param.startsWith("th-"))
    return { kind: "thread", id: param.slice(3), label: label || "this thread" };
  if (page === "conversations") {
    const row = param.includes(":") ? param.slice(param.indexOf(":") + 1) : param;
    if (row.startsWith("cv-")) return { kind: "call", id: row.slice(3), label: label || "this call" };
    if (UUID.test(row)) return { kind: "conversation", id: row, label: label || "this conversation" };
    return null;
  }
  if (page === "live" && UUID.test(param)) return { kind: "call", id: param, label: label || "this call" };
  if (page === "broadcasts" && param.startsWith("run:") && UUID.test(param.slice(4)))
    return { kind: "run", id: param.slice(4), label: label || "this run" };
  if (page === "campaigns" || page === "outbound") return campaignsScope(page, param, label, chains);
  if (page === "clients") return clientsScope(param, label);
  return null;
}
function campaignsScope(page, param, label, chains) {
  if (param.startsWith("moment:") && UUID.test(param.slice(7))) {
    const id = param.slice(7);
    const chain = chains?.find((c) => c.root_id === id);
    if (chain) return { kind: "page", id: `campaigns/moment:${id}`, label: label || chain.name || "this reach-out" };
    return { kind: "playbook", id, label: label || "this campaign" };
  }
  if (page === "campaigns" && param.startsWith("ads:ad:") && UUID.test(param.slice(7)))
    return { kind: "ad", id: param.slice(7), label: label || "this ad" };
  const place = page === "campaigns" ? parseSequencesRoute(`campaigns/${param}`) : null;
  if (place?.view === "record" && place.run && UUID.test(place.run))
    return { kind: "run", id: place.run, label: label || "this run" };
  return null;
}
export const ASK_SURFACES = [
  "today",
  "inbox",
  "people",
  "leads",
  "conversations",
  "live",
  "reports",
  "settings",
  "pipeline",
  "calendar",
  "campaigns",
  "start",
  "other"
];
