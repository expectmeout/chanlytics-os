/**
 * Every switch that turns a behaviour on or off, in one list, each with its owner and when it goes (category 39,
 * "feature flags"; scorecard move 15). A switch is not a setting a customer makes: it is a lever the platform keeps
 * while something is proven, and a lever nobody owns stays for ever. So each one here says who decides it and the day it
 * is looked at again; `flag-registry.test.mjs` fails a switch that is read and not listed, one listed and no longer read,
 * and a sunset that has passed without a decision.
 *
 * Six mechanisms carry them, and a new switch uses one of them rather than a seventh: a variable on the edge
 * (lib/env.ts) or the dashboard, a workspace's own feature (tenant_config.features), a secret that turns a CI job on,
 * the deployment itself (production or a preview), and a model named by a variable (ASK_MODEL, LEAD_JUDGE_MODEL), which
 * the registry by purpose (models.ts) bounds to the ids it knows.
 */

export const FLAG_MECHANISMS = [
  "edge_env",
  "dashboard_env",
  "workspace_feature",
  "ci_secret",
  "deployment",
  "model_override",
] as const;
export type FlagMechanism = (typeof FLAG_MECHANISMS)[number];

export interface Flag {
  /** The variable's name, the feature's key, the secret's name. */
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
    does: "'1' makes Retell's signature the only key to the voice doors.",
    owner: "Ruben",
    sunset: "2026-10-17",
    kept: "Set after the 3 October log read; the change that empties KEY_READ_FROM removes it (docs/debt.md).",
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
