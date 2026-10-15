import "server-only";
import { MODEL_EFFORTS, MODEL_SPEEDS, askModelProfile, type AskModelProfile } from "@chanlytics/contracts";
import { log } from "@/server/log";
import { env } from "../env";

/**
 * The profile this deployment runs Ask on (contracts ask-model.ts): ASK_MODEL in the environment, any Claude model's
 * id, at ASK_EFFORT, in fast mode unless ASK_SPEED says standard, a draft asked at ASK_DRAFT_EFFORT unless it says off,
 * its answer through the answer tool where ASK_ANSWER_TOOL says on; the default for each when it is unset. Read on every
 * turn (five string compares) so a test can set them; a deployment sets them once. A value that reads as no model, no
 * effort, no speed, no draft's effort or no switch runs the default and says so in the log once, never on every turn. A
 * name that reads as a model is run as named: whether the API has it is the API's to say (the edge then asks the
 * route's own, and its log says it fell back). Fast mode asked of a model without it is standard, and a draft's effort
 * no higher than ASK_EFFORT, or asked of a model that takes no effort message, is none: no surprise, nothing is said.
 */
let warnedFor: string | null = null;
export function askModel(): AskModelProfile {
  const name = env.ASK_MODEL?.trim() || null;
  const effort = env.ASK_EFFORT?.trim() || null;
  const speed = env.ASK_SPEED?.trim() || null;
  const draft = env.ASK_DRAFT_EFFORT?.trim() || null;
  const answer = env.ASK_ANSWER_TOOL?.trim() || null;
  const profile = askModelProfile(name, effort, speed, draft, answer);
  const unread =
    (name !== null && profile.id !== name) ||
    (effort !== null && profile.effort !== effort) ||
    (speed !== null && !(MODEL_SPEEDS as readonly string[]).includes(speed)) ||
    (draft !== null && draft !== "off" && !(MODEL_EFFORTS as readonly string[]).includes(draft)) ||
    (answer !== null && !profile.answerTool && answer !== "off");
  const said = `${name}|${effort}|${speed}|${draft}|${answer}`;
  if (unread && warnedFor !== said) {
    warnedFor = said;
    log.warn("ask_model_unknown", {
      name,
      effort,
      speed,
      draft,
      answer,
      ran: profile.id,
      at: profile.effort,
      pace: profile.speed,
      drafts: profile.draft,
      tool: profile.answerTool,
    });
  }
  return profile;
}
