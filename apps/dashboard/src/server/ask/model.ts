import "server-only";
import { askModelProfile, type AskModelProfile } from "@chanlytics/contracts";
import { log } from "@/server/log";
import { env } from "../env";

/**
 * The profile this deployment runs Ask on (contracts ask-model.ts): ASK_MODEL in the environment, any Claude model's
 * id, at ASK_EFFORT; the default for either when it is unset. Read on every turn (two string compares) so a test can
 * set them; a deployment sets them once. A value that reads as no model, or no effort, runs the default and says so in
 * the log once, never on every turn. A name that reads as a model is run as named: whether the API has it is the
 * API's to say (the edge then asks the route's own, and its log says it fell back).
 */
let warnedFor: string | null = null;
export function askModel(): AskModelProfile {
  const name = env.ASK_MODEL?.trim() || null;
  const effort = env.ASK_EFFORT?.trim() || null;
  const profile = askModelProfile(name, effort);
  const unread = (name !== null && profile.id !== name) || (effort !== null && profile.effort !== effort);
  const said = `${name}|${effort}`;
  if (unread && warnedFor !== said) {
    warnedFor = said;
    log.warn("ask_model_unknown", { name, effort, ran: profile.id, at: profile.effort });
  }
  return profile;
}
