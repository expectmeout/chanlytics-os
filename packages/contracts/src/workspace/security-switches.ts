/**
 * The security switches: every place the platform still allows a weaker mode while a rollout finishes, with the day
 * it must be gone.
 *
 * Each began as a fallback that kept production working while a stronger credential was put in place (the voice
 * doors' shared secret beside Retell's signature, the platform key beside the per-call token, the key standing in
 * for the OAuth state's own secret), and each was meant to be temporary. Their retirement dates lived in prose
 * (docs/debt.md), where a date passes without anyone noticing. Here each has a row: what the weaker mode allows,
 * the log event whose readings prove the world is ready to close it, and its sunset. `repo/security-switches.test.mjs`
 * turns red the day a sunset passes while the weaker mode can still be reached, runs each weaker mode to prove its
 * row is not stale, and holds the rows to the switches it can reach; the edge's `/api/diag` says which are open on
 * the deployment it runs in.
 *
 * A row leaves in the change that removes its weaker mode. A sunset moves only with a reason in that change's body.
 */
import { DAY_MS } from "../shared/time";

export interface SecuritySwitch {
  /** The switch, by the variable that closes it, or by the rollout's name where no variable does. */
  readonly name: string;
  /** The deployment whose code holds the weaker mode. */
  readonly app: "edge" | "dashboard";
  /** What the weaker mode allows while it is open, and where it is open. */
  readonly weaker: string;
  /** The last day the weaker mode may exist in the code, as YYYY-MM-DD (UTC). */
  readonly sunset: string;
  /** The log event whose readings prove it can be closed, and what they must say. */
  readonly readiness: { readonly event: string; readonly when: string };
  /** What closes it, in order: the setting first where one is needed, then the change that deletes the weaker mode. */
  readonly closes: string;
}

export const SECURITY_SWITCHES = [
  {
    name: "RETELL_DOORS_SIGNED",
    app: "edge",
    weaker:
      "Unset, the three voice doors (the inbound webhook, the booking-link and availability functions) open for " +
      "RETELL_FN_SECRET (?key= or x-fn-secret) as well as for Retell's signature (lib/voice/voice-door-auth.ts).",
    sunset: "2026-10-17",
    readiness: {
      event: "voice_door_auth",
      when: "sig: true on each of the three doors on real deliveries, read from 3 October 2026",
    },
    closes:
      "Ruben sets RETELL_DOORS_SIGNED=1 after the read; after a clean week the change that empties KEY_READ_FROM and " +
      "stops provisioning the secret.",
  },
  {
    name: "RETELL_WEBHOOK_KEY",
    app: "edge",
    weaker:
      "Unset, the voice doors' signature is checked with RETELL_API_KEY instead of the badged webhook key, so a " +
      "delivery Retell signed with the badged key reads as unsigned and only the shared secret admits it.",
    sunset: "2026-10-17",
    readiness: { event: "voice_door_auth", when: "sig: true on the webhook door with RETELL_WEBHOOK_KEY set" },
    closes: "Set RETELL_WEBHOOK_KEY on the edge; then the change that stops falling back to RETELL_API_KEY.",
  },
  {
    name: "DIAG_KEY",
    app: "edge",
    weaker:
      "On an edge without EDGE_CALL_SECRET (a preview: production refuses to boot without it), the platform key " +
      "alone opens every admin door (lib/admin-auth.ts).",
    sunset: "2026-10-17",
    readiness: {
      event: "admin_door_key_only",
      when: "no ok: true line but the diagnostic's and the sending-domains lift's, read from 3 October 2026",
    },
    closes:
      "EDGE_CALL_SECRET on the preview projects (Ruben's switch); then the change that deletes DIAG_KEY and " +
      "platformKey, the runbook's knock minting a token instead.",
  },
  {
    name: "GOOGLE_OAUTH_STATE_SECRET",
    app: "dashboard",
    weaker:
      "Unset on a preview or a laptop, DIAG_KEY signs the Google OAuth state (src/server/connections/google.ts). " +
      "Production refuses the fallback: without its own secret, Connect Google says it is not set up.",
    sunset: "2026-10-17",
    readiness: { event: "google_state_signed_by_diag_key", when: "no line from any deployment for a week" },
    closes:
      "GOOGLE_OAUTH_STATE_SECRET on every project that offers Connect Google; then the change that deletes the " +
      "fallback.",
  },
  {
    name: "EDGE_TOKEN_UNBOUND",
    app: "edge",
    weaker:
      "A per-call token from a dashboard deployed before tokens were bound is accepted without a body hash, and on " +
      "the live-call doors without a workspace (lib/admin-auth.ts), so either app may deploy first.",
    sunset: "2026-10-13",
    readiness: { event: "edge_token_unbound", when: "no line for a day after both projects deploy" },
    closes:
      "The change that refuses a token with no body hash on a POST, and one with no workspace on a door that acts on one.",
  },
] as const satisfies readonly SecuritySwitch[];

export type SecuritySwitchName = (typeof SECURITY_SWITCHES)[number]["name"];

/** Days from `now` until a switch's sunset, counted in whole UTC days (0 on the day itself, negative after it). */
export function daysToSunset(sw: Pick<SecuritySwitch, "sunset">, now: Date): number {
  const end = Date.parse(`${sw.sunset}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / DAY_MS);
}
