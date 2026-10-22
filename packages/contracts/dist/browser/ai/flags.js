import { DAY_MS } from "../shared/time.js";
export const FLAG_MECHANISMS = [
  "edge_env",
  "dashboard_env",
  "workspace_feature",
  "ci_secret",
  "deployment",
  "model_override",
  "rollout"
];
export function daysToSunset(flag, now) {
  if (flag.sunset === null) return null;
  const end = Date.parse(`${flag.sunset}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / DAY_MS);
}
export const FLAGS = [
  {
    name: "WHATSAPP_TEST_ALLOWLIST",
    mechanism: "edge_env",
    does: "Limits who the environment's own pilot number answers; empty answers everyone.",
    owner: "platform",
    sunset: null,
    kept: "The environment's pilot line stays as a test line."
  },
  {
    name: "RETELL_DOORS_SIGNED",
    mechanism: "edge_env",
    does: "'1' makes Retell's signature the only key to the voice doors; unset, the shared secret opens them beside it.",
    owner: "Ruben",
    sunset: "2026-10-17",
    weaker: {
      allows: "Unset, the three voice doors (the inbound webhook, the booking-link and availability functions) open for RETELL_FN_SECRET (?key= or x-fn-secret) as well as for Retell's signature (lib/voice/voice-door-auth.ts).",
      readiness: {
        event: "voice_door_auth",
        when: "sig: true on each of the three doors on real deliveries, read from 3 October 2026"
      },
      closes: "Ruben sets RETELL_DOORS_SIGNED=1 after the read; after a clean week the change that empties KEY_READ_FROM and stops provisioning the secret (docs/debt.md)."
    }
  },
  {
    name: "RETELL_FN_SECRET",
    mechanism: "edge_env",
    does: "The shared secret that opens the voice doors beside Retell's signature: `?key=` on the inbound webhook's URL, `x-fn-secret` on the two tools; unset, it opens nothing.",
    owner: "Ruben",
    sunset: "2026-10-17",
    weaker: {
      allows: "A secret in a URL (a Retell dashboard, an agent's tool config, any access log) opens the inbound webhook, and the same secret in a header opens the two tools, for a caller with no signature.",
      readiness: {
        event: "voice_door_auth",
        when: "secret: false and sig: true on every door for a week under RETELL_DOORS_SIGNED=1"
      },
      closes: "RETELL_DOORS_SIGNED=1 first (above); then the change that empties KEY_READ_FROM, stops provisioning the secret into the inbound URL and the tools' header, and removes this variable."
    }
  },
  {
    name: "RETELL_WEBHOOK_KEY",
    mechanism: "edge_env",
    does: "The key Retell's signature is checked with; unset, RETELL_API_KEY is tried instead.",
    owner: "Ruben",
    sunset: "2026-10-17",
    weaker: {
      allows: "Unset, the signature is checked with RETELL_API_KEY instead of the badged webhook key, so a delivery Retell signed with the badged key reads as unsigned and only the shared secret admits it.",
      readiness: { event: "voice_door_auth", when: "sig: true on the webhook door with RETELL_WEBHOOK_KEY set" },
      closes: "Set RETELL_WEBHOOK_KEY on the edge; then the change that stops falling back to RETELL_API_KEY."
    }
  },
  {
    name: "DIAG_KEY",
    mechanism: "edge_env",
    does: "The platform's shared key: with EDGE_CALL_SECRET set it opens only the knocks that name it (the diagnostic and the pager); on an edge without the secret it opens every admin door.",
    owner: "Ruben",
    sunset: "2026-10-17",
    weaker: {
      allows: "On an edge without EDGE_CALL_SECRET (a preview: a production edge refuses to boot without it), the platform key alone opens every admin door (lib/admin-auth.ts).",
      readiness: {
        event: "admin_door_key_only",
        when: "no ok: true line but the diagnostic's and the pager's, read from 3 October 2026"
      },
      closes: "EDGE_CALL_SECRET on the preview projects (Ruben's switch); then the change that deletes DIAG_KEY from every door but the platform's, the runbook's knock minting a token instead."
    }
  },
  {
    name: "GOOGLE_OAUTH_STATE_SECRET",
    mechanism: "dashboard_env",
    does: "Signs the Google OAuth state; unset on a preview or a laptop, DIAG_KEY signs it. Production refuses the stand-in.",
    owner: "Ruben",
    sunset: "2026-10-17",
    weaker: {
      allows: "Unset on a preview or a laptop, DIAG_KEY signs the Google OAuth state (src/server/connections/google.ts). Production refuses the fallback: without its own secret, Connect Google says it is not set up.",
      readiness: { event: "google_state_signed_by_diag_key", when: "no line from any deployment for a week" },
      closes: "GOOGLE_OAUTH_STATE_SECRET on every project that offers Connect Google; then the change that deletes the fallback."
    }
  },
  {
    name: "EDGE_TOKEN_UNBOUND",
    mechanism: "rollout",
    does: "A per-call token from a dashboard deployed before tokens named their body and workspace is still let in, so either app may deploy first.",
    owner: "platform",
    sunset: "2026-10-13",
    weaker: {
      allows: "A per-call token with no body hash is accepted on a POST, and one with no workspace on a door that must check whose row it acts on (the live-call doors and steer: tokenWorkspace in lib/admin-auth.ts), so a dashboard built before this may still call an edge that reads them. A token about no workspace is otherwise a platform operator's on purpose (the runbook's knock), so only these doors say it.",
      readiness: { event: "edge_token_unbound", when: "no line for a day after both projects deploy" },
      closes: "The change that refuses a token with no body hash on a POST, and one with no workspace on those doors."
    }
  },
  {
    name: "WHATSAPP_ANSWERS_AS_JOBS",
    mechanism: "edge_env",
    does: "Workspace ids, or 'all': their WhatsApp messages are recorded, acknowledged and answered by a job (whatsapp/answer-later.ts); empty answers every message inside the webhook.",
    owner: "Ruben",
    sunset: "2026-12-31"
  },
  {
    name: "LINES_DRY_RUN",
    mechanism: "edge_env",
    does: "'1' uses the dry line provider (fake SIDs) on a preview or a laptop.",
    owner: "platform",
    sunset: null,
    kept: "Previews must never buy a number."
  },
  {
    name: "LINE_RELEASE_AFTER_DAYS",
    mechanism: "edge_env",
    does: "Unset reports ended workspaces' numbers; set warns, then releases them after that many days.",
    owner: "Ruben",
    sunset: "2026-12-31"
  },
  {
    name: "APNS_SANDBOX",
    mechanism: "edge_env",
    does: "'on' sends pushes to Apple's sandbox, for development builds.",
    owner: "platform",
    sunset: null,
    kept: "Development builds of the phone app need Apple's sandbox."
  },
  {
    name: "NOTE_SUGGESTIONS",
    mechanism: "edge_env",
    does: "The note sweep's suggestions; on unless 'off'.",
    owner: "Ruben",
    sunset: "2026-12-31"
  },
  {
    name: "ASK_JOURNAL",
    mechanism: "edge_env",
    does: "Ask's journal (decision 0070): the note sweep writes each active day of a workspace for an owner's Ask; off unless 'on'.",
    owner: "Ruben",
    sunset: "2026-12-31"
  },
  {
    name: "TYPESAFE_SHADOW",
    mechanism: "edge_env",
    does: "'1' (every workspace) or a list of workspace ids (a pilot), with TYPESAFE_API_KEY set, asks TypeSafe's Jev the receptionist's, the reply reader's and the lead judge's closed-set questions beside the primary, in shadow (decision 0023); its answers are never used.",
    owner: "Ruben",
    sunset: "2026-11-30"
  },
  {
    name: "LEAD_JUDGE_FALLBACKS",
    mechanism: "edge_env",
    does: "The lead judge's server-side fallback on a refusal (decision 14); on unless 'off'.",
    owner: "Ruben",
    sunset: "2026-12-31"
  },
  {
    name: "LEAD_JUDGE_MODEL",
    mechanism: "model_override",
    does: "Another Claude model for the lead judge; empty is the registry's (MODEL_ROUTES.lead_judge).",
    owner: "Ruben",
    sunset: "2026-12-31"
  },
  {
    name: "ASK_MODEL",
    mechanism: "model_override",
    does: "The model Ask answers on, any Claude model's id; empty is the registry's (MODEL_ROUTES.ask).",
    owner: "Ruben",
    sunset: null,
    kept: "Ask is built to switch models by one variable (ask-model.ts), so trying one is never a code change."
  },
  {
    name: "ASK_EFFORT",
    mechanism: "dashboard_env",
    does: "How hard Ask's model is asked to think: low, medium or high; empty is low (ask-model.ts ASK_EFFORT).",
    owner: "Ruben",
    sunset: null,
    kept: "It rides with ASK_MODEL: a model tried at another effort is the same variable-and-redeploy."
  },
  {
    name: "ASK_SPEED",
    mechanism: "dashboard_env",
    does: "Fast mode for Ask's rounds on a model that runs it; empty is fast, standard turns it off (ask-model.ts ASK_SPEED).",
    owner: "Ruben",
    sunset: null,
    kept: "Fast mode is a research preview at twice the price: the switch off is a variable, never a code change."
  },
  {
    name: "ASK_ANSWER_TOOL",
    mechanism: "dashboard_env",
    does: "Ask writes its answer through the answer tool, whose input streams after a read; on unless it says off (the eval pair, 17 Oct 2026; ask-model.ts).",
    owner: "Ruben",
    sunset: "2026-11-30"
  },
  {
    name: "ASK_MORNINGS",
    mechanism: "dashboard_env",
    does: "Ask's morning on Today (decision 0070): on runs one turn a member a day when a member who acts arrives; unset, Today offers none and nothing is spent.",
    owner: "Ruben",
    sunset: "2026-12-31"
  },
  {
    name: "EDGE_PROVIDERS",
    mechanism: "dashboard_env",
    does: "'live' lets a preview or a laptop reach the real providers through its edge.",
    owner: "platform",
    sunset: null,
    kept: "Only production reaches the providers unless a preview is pointed at sandbox keys."
  },
  {
    name: "vision",
    mechanism: "workspace_feature",
    does: "The receptionist looks at photos customers send over WhatsApp.",
    owner: "Ruben",
    sunset: "2026-12-31"
  },
  {
    name: "ads_preview",
    mechanism: "workspace_feature",
    does: "Campaigns \u203A Ads (its page, its Reports lens, Ad accounts in Connections) drawn from its sample in this workspace, as a demo session draws it, before the Ads read is wired (0049).",
    owner: "Ruben",
    sunset: "2026-12-31"
  },
  {
    name: "ANTHROPIC_EVAL_KEY",
    mechanism: "ci_secret",
    does: "Runs the nightly evals (nightly-evals.yml) on a sandbox key; unset, the job says it skipped.",
    owner: "Ruben",
    sunset: null,
    kept: "The evals are the model layer's regression tests."
  },
  {
    name: "E2E_PAID_MODEL",
    mechanism: "ci_secret",
    does: "Lets the e2e specs that run a real model turn run; unset in the nightly.",
    owner: "Ruben",
    sunset: null,
    kept: "A spec that spends the production key never runs by default."
  },
  {
    name: "VERCEL_ENV",
    mechanism: "deployment",
    does: "Production reaches the providers and spends the keys; a preview does not (deployment.ts providersLive).",
    owner: "platform",
    sunset: null,
    kept: "The deployment is the switch every other rests on."
  }
];
