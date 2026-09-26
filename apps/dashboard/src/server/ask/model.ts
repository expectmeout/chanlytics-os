import "server-only";
import { askModelProfile, type AskModelProfile } from "@chanlytics/contracts";

/**
 * The profile this deployment runs Ask on: ASK_MODEL in the environment, one
 * of contracts' ASK_MODELS, else the default. Read on every turn (it is one
 * string compare) so a test can set it; a deployment sets it once. An unknown
 * name runs the default and says so in the log once, never on every turn.
 */
let warnedFor: string | null = null;
export function askModel(): AskModelProfile {
  const name = process.env.ASK_MODEL || undefined;
  const profile = askModelProfile(name);
  if (name && profile.id !== name && warnedFor !== name) {
    warnedFor = name;
    console.warn("ask_model_unknown", JSON.stringify({ name, ran: profile.id }));
  }
  return profile;
}
