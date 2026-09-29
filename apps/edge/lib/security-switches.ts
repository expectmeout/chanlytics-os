/**
 * The edge's security switches, as this deployment holds them: which weaker modes are open here, and how long each may
 * stay (contracts' SECURITY_SWITCHES has the rows, their sunsets and the log events that prove each can close). The
 * diagnostic reports them, so the 3 October read of the voice and admin logs starts from what each deployment allows.
 */
import { daysToSunset, SECURITY_SWITCHES } from "./packages/contracts.js";
import { env } from "./env.js";

type EdgeSwitch = Extract<(typeof SECURITY_SWITCHES)[number], { app: "edge" }>["name"];

/** Whether each weaker mode is open on this deployment: what the code allows with the variables it holds now. */
const OPEN: Record<EdgeSwitch, () => boolean> = {
  // Unset, the shared secret still opens the three voice doors (voice/voice-door-auth.ts).
  RETELL_DOORS_SIGNED: () => env.RETELL_DOORS_SIGNED !== "1",
  // Unset, the signature is checked with the API key rather than the badged webhook key.
  RETELL_WEBHOOK_KEY: () => !env.RETELL_WEBHOOK_KEY,
  // Without the secret, the key alone opens every admin door (admin-auth.ts).
  DIAG_KEY: () => !env.EDGE_CALL_SECRET && !!env.DIAG_KEY,
  // A token with no body hash, or no workspace on a live-call door, is still accepted (admin-auth.ts).
  EDGE_TOKEN_UNBOUND: () => !!env.EDGE_CALL_SECRET,
};

interface SwitchHere {
  name: EdgeSwitch;
  open: boolean;
  sunset: string;
  days_left: number;
}

/** The edge's switches on this deployment, in the registry's order. */
export function securitySwitchesHere(now: Date = new Date()): SwitchHere[] {
  return SECURITY_SWITCHES.filter((s): s is Extract<typeof s, { app: "edge" }> => s.app === "edge").map((s) => ({
    name: s.name,
    open: OPEN[s.name](),
    sunset: s.sunset,
    days_left: daysToSunset(s, now),
  }));
}
