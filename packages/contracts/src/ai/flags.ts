/**
 * Every switch that turns a behaviour on or off, in one list, each with its owner and when it goes (category 39,
 * "feature flags"; scorecard move 15). A switch is not a setting a customer makes: it is a lever the platform keeps
 * while something is proven, and a lever nobody owns stays for ever. So each one here says who decides it and the day it
 * is looked at again; `flag-registry.test.mjs` fails a switch that is read and not listed, one listed and no longer read,
 * and a sunset that has passed without a decision.
 *
 * Seven mechanisms carry them, and a new switch uses one of them rather than an eighth: a variable on the edge
 * (lib/env.ts) or the dashboard, a workspace's own feature (tenant_config.features), a secret that turns a CI job on,
 * the deployment itself (production or a preview), a model named by a variable (ASK_MODEL, LEAD_JUDGE_MODEL), which
 * the registry by purpose (models.ts) bounds to the ids it knows, and a rollout: a compatibility window in code that
 * no variable opens or closes, kept while the two apps' deployments may differ.
 *
 * The security switches are here too, and are the ones with a `weaker` mode: a fallback that kept production working
 * while a stronger credential was put in place, and that was meant to be temporary. Each says what its weaker mode
 * allows, the log event whose readings prove the world is ready to close it, and what closes it. A security switch
 * fails closed wherever that needs no reading of production's log: production refuses to boot on a value that would
 * leave it open by accident (a typo for the value that closes it), and where a stronger secret exists production
 * refuses the fallback (the Google OAuth state; the platform key on an edge without `EDGE_CALL_SECRET`). The ones that
 * wait on a reading of production (the voice doors' shared secret, the platform key on a preview) stay open until
 * their day, and the registry's test turns red a month after it.
 */

import { DAY_MS } from "../shared/time";

export const FLAG_MECHANISMS = [
  "edge_env",
  "dashboard_env",
  "workspace_feature",
  "ci_secret",
  "deployment",
  "model_override",
  "rollout",
] as const;
export type FlagMechanism = (typeof FLAG_MECHANISMS)[number];

/** What a security switch's weaker mode is, and how it is proven closable. */
export interface WeakerMode {
  /** What the weaker mode allows while it is open, and where it is open. */
  allows: string;
  /** The log event whose readings prove it can be closed, and what they must say. */
  readiness: { event: string; when: string };
  /** What closes it, in order: the setting first where one is needed, then the change that deletes the weaker mode. */
  closes: string;
}

export interface Flag {
  /** The variable's name, the feature's key, the secret's name, or the rollout's own name. */
  name: string;
  mechanism: FlagMechanism;
  /** What it switches, in a line. */
  does: string;
  /** Who decides it. A one-founder repository: "Ruben" is the product's decision, "platform" a rule of operations. */
  owner: "Ruben" | "platform";
  /** The day it is looked at again (ISO date), or null when it is kept for good, with why. */
  sunset: string | null;
  /** Why it has no sunset. Required when sunset is null. */
  kept?: string;
  /** A security switch: the weaker mode it leaves open until its sunset. */
  weaker?: WeakerMode;
}

/** Days from `now` until a switch's sunset, in whole UTC days (0 on the day itself, negative after it); null when it has none. */
export function daysToSunset(flag: Pick<Flag, "sunset">, now: Date): number | null {
  if (flag.sunset === null) return null;
  const end = Date.parse(`${flag.sunset}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / DAY_MS);
}

export const FLAGS: readonly Flag[] = [
  {
    name: "WHATSAPP_TEST_ALLOWLIST",
    mechanism: "edge_env",
    does: "Limits who the environment's own pilot number answers; empty answers everyone.",
    owner: "platform",
    sunset: null,
    kept: "The environment's pilot line stays as a test line.",
  },
  {
    name: "RETELL_DOORS_SIGNED",
    mechanism: "edge_env",
    does: "'1' makes Retell's signature the only key to the voice doors; unset, the shared secret opens them beside it.",
    owner: "Ruben",
    sunset: "2026-10-17",
    weaker: {
      allows:
        "Unset, the three voice doors (the inbound webhook, the booking-link and availability functions) open for " +
        "RETELL_FN_SECRET (?key= or x-fn-secret) as well as for Retell's signature (lib/voice/voice-door-auth.ts).",
      readiness: {
        event: "voice_door_auth",
        when: "sig: true on each of the three doors on real deliveries, read from 3 October 2026",
      },
      closes:
        "Ruben sets RETELL_DOORS_SIGNED=1 after the read; after a clean week the change that empties KEY_READ_FROM " +
        "and stops provisioning the secret (docs/debt.md).",
    },
  },
  {
    name: "RETELL_FN_SECRET",
    mechanism: "edge_env",
    does: "The shared secret that opens the voice doors beside Retell's signature: `?key=` on the inbound webhook's URL, `x-fn-secret` on the two tools; unset, it opens nothing.",
    owner: "Ruben",
    sunset: "2026-10-17",
    weaker: {
      allows:
        "A secret in a URL (a Retell dashboard, an agent's tool config, any access log) opens the inbound webhook, and " +
        "the same secret in a header opens the two tools, for a caller with no signature.",
      readiness: {
        event: "voice_door_auth",
        when: "secret: false and sig: true on every door for a week under RETELL_DOORS_SIGNED=1",
      },
      closes:
        "RETELL_DOORS_SIGNED=1 first (above); then the change that empties KEY_READ_FROM, stops provisioning the " +
        "secret into the inbound URL and the tools' header, and removes this variable.",
    },
  },
  {
    name: "RETELL_WEBHOOK_KEY",
    mechanism: "edge_env",
    does: "The key Retell's signature is checked with; unset, RETELL_API_KEY is tried instead.",
    owner: "Ruben",
    sunset: "2026-10-17",
    weaker: {
      allows:
        "Unset, the signature is checked with RETELL_API_KEY instead of the badged webhook key, so a delivery Retell " +
        "signed with the badged key reads as unsigned and only the shared secret admits it.",
      readiness: { event: "voice_door_auth", when: "sig: true on the webhook door with RETELL_WEBHOOK_KEY set" },
      closes: "Set RETELL_WEBHOOK_KEY on the edge; then the change that stops falling back to RETELL_API_KEY.",
    },
  },
  {
    name: "DIAG_KEY",
    mechanism: "edge_env",
    does: "The platform's shared key: with EDGE_CALL_SECRET set it opens only the knocks that name it (the diagnostic, the pager, the sending-domains lift); on an edge without the secret it opens every admin door.",
    owner: "Ruben",
    sunset: "2026-10-17",
    weaker: {
      allows:
        "On an edge without EDGE_CALL_SECRET (a preview: a production edge refuses to boot without it), the platform " +
        "key alone opens every admin door (lib/admin-auth.ts).",
      readiness: {
        event: "admin_door_key_only",
        when: "no ok: true line but the diagnostic's, the pager's and the sending-domains lift's, read from 3 October 2026",
      },
      closes:
        "EDGE_CALL_SECRET on the preview projects (Ruben's switch); then the change that deletes DIAG_KEY from every " +
        "door but the platform's, the runbook's knock minting a token instead.",
    },
  },
  {
    name: "GOOGLE_OAUTH_STATE_SECRET",
    mechanism: "dashboard_env",
    does: "Signs the Google OAuth state; unset on a preview or a laptop, DIAG_KEY signs it. Production refuses the stand-in.",
    owner: "Ruben",
    sunset: "2026-10-17",
    weaker: {
      allows:
        "Unset on a preview or a laptop, DIAG_KEY signs the Google OAuth state (src/server/connections/google.ts). " +
        "Production refuses the fallback: without its own secret, Connect Google says it is not set up.",
      readiness: { event: "google_state_signed_by_diag_key", when: "no line from any deployment for a week" },
      closes:
        "GOOGLE_OAUTH_STATE_SECRET on every project that offers Connect Google; then the change that deletes the fallback.",
    },
  },
  {
    name: "EDGE_TOKEN_UNBOUND",
    mechanism: "rollout",
    does: "A per-call token from a dashboard deployed before tokens named their body and workspace is still let in, so either app may deploy first.",
    owner: "platform",
    sunset: "2026-10-13",
    weaker: {
      allows:
        "A per-call token with no body hash is accepted on a POST, and one with no workspace on a door that must check " +
        "whose row it acts on (the live-call doors and steer: tokenWorkspace in lib/admin-auth.ts), so a dashboard built " +
        "before this may still call an edge that reads them. A token about no workspace is otherwise a platform " +
        "operator's on purpose (the runbook's knock), so only these doors say it.",
      readiness: { event: "edge_token_unbound", when: "no line for a day after both projects deploy" },
      closes: "The change that refuses a token with no body hash on a POST, and one with no workspace on those doors.",
    },
  },
  {
    name: "LINES_DRY_RUN",
    mechanism: "edge_env",
    does: "'1' uses the dry line provider (fake SIDs) on a preview or a laptop.",
    owner: "platform",
    sunset: null,
    kept: "Previews must never buy a number.",
  },
  {
    name: "LINE_RELEASE_AFTER_DAYS",
    mechanism: "edge_env",
    does: "Unset reports ended workspaces' numbers; set warns, then releases them after that many days.",
    owner: "Ruben",
    sunset: "2026-12-31",
  },
  {
    name: "APNS_SANDBOX",
    mechanism: "edge_env",
    does: "'on' sends pushes to Apple's sandbox, for development builds.",
    owner: "platform",
    sunset: null,
    kept: "Development builds of the phone app need Apple's sandbox.",
  },
  {
    name: "NOTE_SUGGESTIONS",
    mechanism: "edge_env",
    does: "The note sweep's suggestions; on unless 'off'.",
    owner: "Ruben",
    sunset: "2026-12-31",
  },
  {
    name: "TYPESAFE_SHADOW",
    mechanism: "edge_env",
    does: "'1' (every workspace) or a list of workspace ids (a pilot), with TYPESAFE_API_KEY set, asks TypeSafe's Jev the receptionist's, the reply reader's and the lead judge's closed-set questions beside the primary, in shadow (decision 0023); its answers are never used.",
    owner: "Ruben",
    sunset: "2026-11-30",
  },
  {
    name: "LEAD_JUDGE_FALLBACKS",
    mechanism: "edge_env",
    does: "The lead judge's server-side fallback on a refusal (decision 14); on unless 'off'.",
    owner: "Ruben",
    sunset: "2026-12-31",
  },
  {
    name: "LEAD_JUDGE_MODEL",
    mechanism: "model_override",
    does: "Another Claude model for the lead judge; empty is the registry's (MODEL_ROUTES.lead_judge).",
    owner: "Ruben",
    sunset: "2026-12-31",
  },
  {
    name: "ASK_MODEL",
    mechanism: "model_override",
    does: "The model Ask answers on, one of ASK_MODELS; empty is the registry's (MODEL_ROUTES.ask).",
    owner: "Ruben",
    sunset: null,
    kept: "Ask is built to switch models by one variable (ask-model.ts); the gate re-runs on both at every phase.",
  },
  {
    name: "EDGE_PROVIDERS",
    mechanism: "dashboard_env",
    does: "'live' lets a preview or a laptop reach the real providers through its edge.",
    owner: "platform",
    sunset: null,
    kept: "Only production reaches the providers unless a preview is pointed at sandbox keys.",
  },
  {
    name: "vision",
    mechanism: "workspace_feature",
    does: "The receptionist looks at photos customers send over WhatsApp.",
    owner: "Ruben",
    sunset: "2026-12-31",
  },
  {
    name: "ANTHROPIC_EVAL_KEY",
    mechanism: "ci_secret",
    does: "Runs the nightly evals (nightly-evals.yml) on a sandbox key; unset, the job says it skipped.",
    owner: "Ruben",
    sunset: null,
    kept: "The evals are the model layer's regression tests.",
  },
  {
    name: "E2E_PAID_MODEL",
    mechanism: "ci_secret",
    does: "Lets the e2e specs that run a real model turn run; unset in the nightly.",
    owner: "Ruben",
    sunset: null,
    kept: "A spec that spends the production key never runs by default.",
  },
  {
    name: "VERCEL_ENV",
    mechanism: "deployment",
    does: "Production reaches the providers and spends the keys; a preview does not (deployment.ts providersLive).",
    owner: "platform",
    sunset: null,
    kept: "The deployment is the switch every other rests on.",
  },
];
