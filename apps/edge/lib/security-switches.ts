/**
 * The edge's security switches, as this deployment holds them: which weaker modes are open here, and how long each may
 * stay. The rows are the registry's (contracts ai/flags.ts: every flag with a `weaker` mode, its sunset, the log event
 * that proves it can close); what only this file knows is whether each one is open on the deployment it runs in, from
 * the variables it holds now. `/api/diag` reports them, so the 3 October read of the voice and admin logs starts from
 * what each deployment allows.
 */
import { daysToSunset, FLAGS } from "./packages/contracts.js";
import { env } from "./env.js";
import { signatureOnly } from "./voice/voice-door-auth.js";

/** Whether each weaker mode is open on this deployment: what the code allows with the variables it holds now. */
const OPEN: Readonly<Record<string, () => boolean>> = {
  // Unset, the shared secret still opens the three voice doors (voice/voice-door-auth.ts).
  RETELL_DOORS_SIGNED: () => !signatureOnly(),
  // The secret opens a door only while it is set and the signature is not the only key.
  RETELL_FN_SECRET: () => !!env.RETELL_FN_SECRET && !signatureOnly(),
  // Unset, the signature is checked with the API key rather than the badged webhook key.
  RETELL_WEBHOOK_KEY: () => !env.RETELL_WEBHOOK_KEY,
  // Without the secret, the key alone opens every admin door (admin-auth.ts).
  DIAG_KEY: () => !env.EDGE_CALL_SECRET && !!env.DIAG_KEY,
  // A token with no body hash, or no workspace on a live-call door, is still accepted (admin-auth.ts).
  EDGE_TOKEN_UNBOUND: () => !!env.EDGE_CALL_SECRET,
};

interface SwitchHere {
  name: string;
  open: boolean;
  sunset: string | null;
  days_left: number | null;
}

/** The edge's switches on this deployment, in the registry's order: each flag the edge holds a weaker mode for. */
export function securitySwitchesHere(now: Date = new Date()): SwitchHere[] {
  return FLAGS.filter((f) => f.weaker !== undefined && f.name in OPEN).map((f) => ({
    name: f.name,
    open: OPEN[f.name]?.() ?? false,
    sunset: f.sunset,
    days_left: daysToSunset(f, now),
  }));
}
