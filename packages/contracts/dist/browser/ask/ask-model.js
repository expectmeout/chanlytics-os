import { effortAbove } from "../ai/effort.js";
import {
  MODEL_EFFORTS,
  MODEL_ROUTES,
  hasFastMode,
  modelTakes,
  readsAsModel
} from "../ai/models.js";
import { ASK_MAX_TOKENS } from "./ask.js";
export const ASK_MODEL = MODEL_ROUTES.ask.model;
export const ASK_EFFORT = "low";
export const ASK_SPEED = "fast";
const ANSWER_TOOL_OFF = "off";
export const ASK_DRAFT_EFFORT = "high";
export const ASK_DRAFT_MAX_TOKENS = 32e3;
export function askRoundCap(effort) {
  return effort !== null && effortAbove(effort, "medium") ? ASK_DRAFT_MAX_TOKENS : ASK_MAX_TOKENS;
}
const effortOf = (raw) => {
  const asked = (raw ?? "").trim();
  return MODEL_EFFORTS.includes(asked) ? asked : null;
};
export function askModelProfile(name, effort, speed, draft, answer) {
  const named = (name ?? "").trim();
  const id = readsAsModel(named) ? named : ASK_MODEL;
  const wanted = (speed ?? "").trim() === "standard" ? "standard" : ASK_SPEED;
  const at = effortOf(effort) ?? ASK_EFFORT;
  const drafted = (draft ?? "").trim() === "off" ? null : effortOf(draft) ?? ASK_DRAFT_EFFORT;
  return {
    id,
    effort: at,
    speed: wanted === "fast" && hasFastMode(id) ? "fast" : "standard",
    draft: drafted && effortAbove(drafted, at) && modelTakes(id)?.effortMessages === true ? drafted : null,
    answerTool: (answer ?? "").trim() !== ANSWER_TOOL_OFF
  };
}
