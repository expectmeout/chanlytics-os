/**
 * The Retell "shell": everything the phone agent is told that is NOT a fact.
 *
 * The facts — hours, address, services, closures, the handoff line, the
 * owner's own notes — arrive at call start as dynamic variables, composed by
 * the inbound-call webhook from the same profile the WhatsApp receptionist
 * reads. What is written here is only what the variables cannot say for
 * themselves: where they go in the prompt, which tools exist, and what the
 * agent hears when a variable could not be supplied.
 *
 * ONE definition, in code, for three readers: the converger that brings a
 * live agent onto it, the diagnostic that reports whether a line has
 * drifted off it, and the provisioning endpoint for a new workspace
 * (voice-provision.ts builds the LLM from it; a test proves the converger
 * plans nothing against what it creates). The live agent predates all of this and was
 * typed by hand in Retell's dashboard — its prompt bakes the hours, the
 * address and a transfer number, so correcting the hours in Settings changed
 * what the chat receptionist said and left the phone saying the old ones.
 *
 * Retell's variable semantics decide the shape of the defaults:
 *   - a variable that is omitted or null is substituted from
 *     `default_dynamic_variables`, and left as the literal `{{name}}` when
 *     there is no default either — read aloud, braces and all;
 *   - a variable set to "" is substituted with nothing AND skips the default.
 * So every placeholder in the prompt has a default here that is a real
 * sentence, and the webhook OMITS a variable it cannot fill rather than
 * sending "".
 */

import { CALL_OUTCOMES } from "@chanlytics/contracts";

/** The prompt body. Both placeholders are mandatory; a test pins them. */
export const VOICE_SHELL_PROMPT = "{{business_facts}}\n\nWho you are speaking with:\n{{caller_context}}";

/** Composed by the webhook so the business name never becomes a third copy. */
export const VOICE_SHELL_BEGIN = "{{greeting}}";

/** The transfer tool dials this; the webhook fills it from the profile. */
export const HANDOFF_VAR = "{{handoff_number}}";

/**
 * What the agent is told when the business's facts could not be loaded.
 *
 * It must never be omitted and never be empty. Retell leaves an unsupplied
 * variable in the prompt AS the literal `{{business_facts}}`, and treats ""
 * as a real value that also skips this default -- so the two ways of saying
 * "we have nothing" are an agent reading its own placeholder aloud, or an
 * agent with no knowledge and no idea that it has none. This is the third
 * option: no facts, and told so. The call-start judgement on the edge
 * (apps/edge/lib/voice/call-start.ts) sends this same constant as its fallback, so
 * the shell's default and the webhook's answer cannot drift apart.
 */
export const FACTS_UNAVAILABLE =
  "The business's details could not be loaded for this call. Do not state opening hours, prices, services or an address from memory — you do not have them. Say you will have someone confirm, offer to take a message, and offer to send the booking link to the caller's WhatsApp.";

/** What the agent is told about a caller when nothing could be read: the shell's default, and the webhook's fallback. */
export const CALLER_UNKNOWN = "New caller - no prior interactions on record.";

/**
 * The opening line, with the business named only when we know which it is.
 *
 * Composed here rather than typed into Retell's dashboard, so the business
 * NAME does not become a third hand-kept copy of a fact the product already
 * owns -- a rename would otherwise leave the phone greeting saying the old one.
 *
 * A whole sentence, not the name on its own: Retell leaves a variable it
 * cannot fill in the prompt verbatim, and "Thank you for calling
 * {{business_name}}" read down a phone line is worse than any wording. When
 * the business is unknown this simply greets nobody by name, which is never
 * wrong -- and is the shell's own default, below, so the two are one sentence.
 *
 * Both disclosures -- recording, and that this is an automated assistant --
 * live here rather than in the agent's config, because they are promises the
 * product makes and should not be editable by whoever last opened Retell.
 */
export function greetingFor(name: string | null): string {
  const who = name ? ` ${name}` : "";
  return `Thank you for calling${who}! This call may be recorded. I'm the automated assistant — how can I help you today?`;
}

/** The greeting with no business named -- never wrong, never a placeholder. */
export const GREETING_DEFAULT = greetingFor(null);

/** Where the booking-link tool posts. Overridable for previews. */
export const DEFAULT_FN_URL = "https://chanlytics-messaging.vercel.app/api/retell-fn";

/** The availability tool posts beside it, on the same host and secret. */
export function availabilityUrl(fnUrl: string): string {
  return /\/api\/retell-fn$/.test(fnUrl)
    ? fnUrl.replace(/\/api\/retell-fn$/, "/api/retell-availability")
    : `${fnUrl}-availability`;
}

/** Retell's own tool object, loosely: the fields we set plus whatever it adds. */
export type RetellTool = Record<string, unknown> & { type: string; name: string };

export interface VoiceShellTarget {
  general_prompt: string;
  begin_message: string;
  default_dynamic_variables: Record<string, string>;
  general_tools: RetellTool[];
}

/**
 * The tools, as Retell stores them.
 *
 * `headers` on the booking-link tool carries the shared secret the edge
 * checks (`x-fn-secret`). The converger never knows it unless told, so the
 * live tool's headers are carried over untouched, and a tool with none is
 * reported rather than silently created secret-less.
 */
export function voiceShellTools(
  fnUrl: string = DEFAULT_FN_URL,
  bookingHeaders?: Record<string, string> | null,
): RetellTool[] {
  return [
    {
      type: "end_call",
      name: "end_call",
      description: "End the call once the conversation is complete and the caller has said goodbye.",
    },
    {
      type: "transfer_call",
      name: "transfer_to_staff",
      description:
        "Transfer the caller to a person on the business's own line. Use during opening hours when the caller asks for a person, has a complaint, or needs something the facts do not cover.",
      // A dynamic variable, filled per call from the workspace's profile. An
      // E.164 number typed here would be a fact kept in a second place.
      transfer_destination: { type: "predefined", number: HANDOFF_VAR },
      transfer_option: {
        type: "warm_transfer",
        show_transferee_as_caller: true,
        on_hold_music: "relaxing_sound",
      },
    },
    {
      type: "custom",
      name: "send_booking_link",
      description:
        "Text the booking link to the caller's WhatsApp. Use when the caller wants to book. It goes to the number they are calling from unless another number is given.",
      url: fnUrl,
      method: "POST",
      speak_during_execution: true,
      execution_message_description: "Say you are sending the booking link to their WhatsApp now.",
      speak_after_execution: true,
      ...(bookingHeaders ? { headers: bookingHeaders } : {}),
      // No `required` list: the provider drops an empty one on save, and the
      // plan would then see a difference that is not there.
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description:
              "Alternate number to send the link to, digits only with country code. Omit to use the caller's number.",
          },
        },
      },
    },
    {
      type: "custom",
      name: "check_availability",
      description:
        "Check which appointment times are open right now. Use when the caller asks when they could come in, or before offering a time. Returns the open windows; offer up to three that fit, then send the booking link. Never confirm a slot yourself.",
      url: availabilityUrl(fnUrl),
      method: "POST",
      speak_during_execution: true,
      execution_message_description: "Say you are checking the calendar.",
      speak_after_execution: true,
      ...(bookingHeaders ? { headers: bookingHeaders } : {}),
      parameters: {
        type: "object",
        properties: {
          day: {
            type: "string",
            description: "A day the caller asked about, as YYYY-MM-DD or a weekday name. Omit for the next few days.",
          },
          service: {
            type: "string",
            description: "The service they want, so only windows long enough for it are offered. Omit if unknown.",
          },
        },
      },
    },
  ];
}

/** The whole target: what a converged agent's LLM holds. */
export function desiredVoiceShell(
  fnUrl: string = DEFAULT_FN_URL,
  bookingHeaders?: Record<string, string> | null,
): VoiceShellTarget {
  return {
    general_prompt: VOICE_SHELL_PROMPT,
    begin_message: VOICE_SHELL_BEGIN,
    default_dynamic_variables: {
      business_facts: FACTS_UNAVAILABLE,
      caller_context: CALLER_UNKNOWN,
      greeting: GREETING_DEFAULT,
      // Empty on purpose: with no line to reach, the transfer tool has
      // nowhere to dial and the composed facts tell the agent to take a
      // message instead of transferring.
      handoff_number: "",
    },
    general_tools: voiceShellTools(fnUrl, bookingHeaders),
  };
}

/** What the converger reads off a live Retell LLM. */
export interface LiveVoiceLlm {
  general_prompt?: string | null;
  begin_message?: string | null;
  default_dynamic_variables?: Record<string, string> | null;
  general_tools?: RetellTool[] | null;
}

export interface VoiceConvergencePlan {
  /** Human-readable, one line per difference. Never carries a secret. */
  drift: string[];
  /** The PATCH body for update-retell-llm, or null when nothing differs. */
  llmPatch: Partial<VoiceShellTarget> | null;
  /** Live tools the shell does not define. Listed, never silently dropped. */
  unknownTools: string[];
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\r\n/g, "\n").trim();

/** Deterministic JSON for comparing the fields WE set on a tool. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/**
 * Every field the desired tool sets is present and equal on the live one.
 *
 * Fields the provider adds on save — speak_after_execution on every tool, a
 * bridge audio cue inside transfer_option — are Retell's defaults, not drift,
 * and comparing whole objects reported a freshly converged agent as drifting
 * forever (seen on the first real apply). Objects recurse; arrays and
 * scalars compare whole.
 */
function subsetEqual(live: unknown, desired: unknown): boolean {
  if (Array.isArray(desired)) return stableJson(live) === stableJson(desired);
  if (desired && typeof desired === "object") {
    if (!live || typeof live !== "object" || Array.isArray(live)) return false;
    return Object.entries(desired as Record<string, unknown>).every(([k, v]) =>
      subsetEqual((live as Record<string, unknown>)[k], v),
    );
  }
  return stableJson(live) === stableJson(desired);
}

/**
 * What separates a live LLM from the shell, and the patch that closes it.
 *
 * Pure, so the dry run IS the plan the apply executes: the script prints the
 * result of this function and, with --apply, sends exactly `llmPatch`. Extra
 * default variables on the live LLM are kept (merged), not deleted; tools the
 * shell does not know are reported and would be REPLACED by an apply, which
 * is why they are listed by name in the plan.
 */
export function planVoiceConvergence(live: LiveVoiceLlm, desired: VoiceShellTarget): VoiceConvergencePlan {
  const drift: string[] = [];
  const patch: Partial<VoiceShellTarget> = {};

  if (norm(live.general_prompt) !== norm(desired.general_prompt)) {
    const has = (v: string) => norm(live.general_prompt).includes(v);
    drift.push(
      `general_prompt differs (${norm(live.general_prompt).length} chars live; ` +
        `reads {{business_facts}}: ${has("{{business_facts}}")}, {{caller_context}}: ${has("{{caller_context}}")})`,
    );
    patch.general_prompt = desired.general_prompt;
  }
  if (norm(live.begin_message) !== norm(desired.begin_message)) {
    drift.push(
      `begin_message is typed in (${JSON.stringify(norm(live.begin_message).slice(0, 60))}…), not ${desired.begin_message}`,
    );
    patch.begin_message = desired.begin_message;
  }

  const liveDefaults = live.default_dynamic_variables ?? {};
  const missingDefaults = Object.keys(desired.default_dynamic_variables).filter(
    (k) => liveDefaults[k] !== desired.default_dynamic_variables[k],
  );
  if (missingDefaults.length) {
    drift.push(`default_dynamic_variables missing or different: ${missingDefaults.join(", ")}`);
    patch.default_dynamic_variables = { ...liveDefaults, ...desired.default_dynamic_variables };
  }

  const liveTools = live.general_tools ?? [];
  const byName = new Map(liveTools.map((t) => [t.name, t] as const));
  let toolsDiffer = false;
  for (const want of desired.general_tools) {
    const have = byName.get(want.name);
    if (!have) {
      drift.push(`tool ${want.name} is missing`);
      toolsDiffer = true;
      continue;
    }
    if (!subsetEqual(have, want)) {
      const what =
        want.name === "transfer_to_staff"
          ? ` (live destination: ${JSON.stringify((have.transfer_destination as { number?: string } | undefined)?.number ?? "?")}, ` +
            `option: ${JSON.stringify((have.transfer_option as { type?: string } | undefined)?.type ?? "?")})`
          : "";
      drift.push(`tool ${want.name} differs${what}`);
      toolsDiffer = true;
    }
  }
  const unknownTools = liveTools.map((t) => t.name).filter((n) => !desired.general_tools.some((t) => t.name === n));
  if (unknownTools.length)
    drift.push(`live tools the shell does not define (an apply would drop them): ${unknownTools.join(", ")}`);
  if (toolsDiffer) patch.general_tools = desired.general_tools;

  return { drift, llmPatch: Object.keys(patch).length ? patch : null, unknownTools };
}

/**
 * The diagnostic's view: on the shell or not, and why not. Strings only —
 * this is printed by /api/diag, and the live tools carry a secret header.
 */
export function voiceShellDrift(live: LiveVoiceLlm): { converged: boolean; drift: string[] } {
  const booking = (live.general_tools ?? []).find((t) => t.name === "send_booking_link");
  const url = typeof booking?.url === "string" ? (booking.url as string) : DEFAULT_FN_URL;
  const headers = (booking?.headers as Record<string, string> | undefined) ?? null;
  const plan = planVoiceConvergence(live, desiredVoiceShell(url, headers));
  const drift = [...plan.drift];
  if (booking && !headers) drift.push("send_booking_link has no x-fn-secret header — the edge will refuse it");
  return { converged: drift.length === 0, drift };
}

/* ----------------------------- agent settings ----------------------------- */

/** The webhook events the call pipeline is built on. transcript_updated is
 *  opt-in at Retell and is what makes the Live page's transcript live. */
export const VOICE_WEBHOOK_EVENTS = ["call_started", "call_ended", "call_analyzed", "transcript_updated"] as const;
/** The webhook copies the recording inside its budget; Retell's default 10 s is too short for it. */
export const VOICE_WEBHOOK_TIMEOUT_MS = 20000;
/** What Retell applies when webhook_events is absent. */
const RETELL_DEFAULT_EVENTS = ["call_started", "call_ended", "call_analyzed"];

/**
 * What the agent's post-call analysis fills in after every call, in the
 * caller's own terms: what they wanted, how it ended, what a person should
 * do next, the name they gave. The provider's default summary ("The user
 * called Marisa's Beauty Salon to inquire about…") is kept beside it; these
 * are what the strip, the profile and the call card say. The webhook files
 * them through ingest_call (migration 00061).
 */
export const CALL_ANALYSIS_FIELDS = [
  {
    type: "string",
    name: "caller_wanted",
    description:
      "What the caller wanted, in one short sentence in plain words, the way the business owner would say it. Start with the request itself, never with 'The user' or 'The caller'. Leave empty if they asked for nothing.",
    examples: [
      "Asked whether Saturday at 10 is free.",
      "Wanted Tuesday's hours and a price.",
      "Moved Friday's appointment to next week.",
    ],
  },
  {
    type: "enum",
    name: "outcome",
    description:
      "How the call ended for the caller. answered: their question was answered. booking_link_sent: the receptionist sent them the booking link. callback_needed: a person at the business has to call them back or follow up. voicemail: the call reached voicemail. no_request: they hung up, tested the line or asked for nothing. other: none of these.",
    choices: [...CALL_OUTCOMES],
  },
  {
    type: "string",
    name: "follow_up",
    description:
      "What a person at the business should do next for this caller, in one short sentence. Leave empty when nothing is needed.",
    examples: ["Call back to confirm a Saturday 10:00 gel manicure.", "Text the price list for highlights."],
  },
  {
    type: "string",
    name: "caller_name",
    description: "The caller's name exactly as they gave it. Leave empty if they did not say one.",
    examples: ["Ana", "Daniela R."],
  },
] as const;

type AnalysisField = (typeof CALL_ANALYSIS_FIELDS)[number];

/** The live field is ours, unchanged: same name, type, description, choices and examples. */
function sameAnalysisField(live: Record<string, unknown>, want: AnalysisField): boolean {
  const w = want as unknown as Record<string, unknown>;
  return (
    live.name === w.name &&
    live.type === w.type &&
    live.description === w.description &&
    JSON.stringify(live.choices ?? null) === JSON.stringify(w.choices ?? null) &&
    JSON.stringify(live.examples ?? null) === JSON.stringify(w.examples ?? null)
  );
}

/** The agent-level fields the plan reads, as get-agent returns them. */
export interface LiveAgentSettings {
  /**
   * The call webhook's URL. Raw from the provider it may still carry the
   * retired `?key=`; parsed (voice-retell getAgent) the query is gone and
   * webhook_url_keyed says it was there. Either form is the same drift.
   */
  webhook_url?: string | null;
  webhook_url_keyed?: boolean | null;
  webhook_events?: string[] | null;
  webhook_timeout_ms?: number | null;
  opt_in_signed_url?: boolean | null;
  data_storage_retention_days?: number | null;
  post_call_analysis_data?: unknown[] | null;
}

export interface AgentPlan {
  drift: string[];
  /** The PATCH body for update-agent, or null when nothing differs. */
  agentPatch: Record<string, unknown> | null;
}

/**
 * The agent settings the pipeline depends on, and the patch that sets them.
 *
 * Signed recording URLs: with opt_in_signed_url off, every recording link
 * Retell hands out is public and permanent (review F10 made this urgent).
 * The pipeline copies audio into private storage within seconds of the call
 * and refetches a fresh link through get-call when a copy has to retry, so a
 * link that expires costs it nothing.
 *
 * Retention is NOT drift. How long the provider keeps a call is a product
 * decision, applied only when the converger is told a number.
 */
export function planAgentSettings(live: LiveAgentSettings, opts: { retentionDays?: number } = {}): AgentPlan {
  const drift: string[] = [];
  const patch: Record<string, unknown> = {};
  const events = live.webhook_events ?? RETELL_DEFAULT_EVENTS;
  const missing = VOICE_WEBHOOK_EVENTS.filter((e) => !events.includes(e));
  if (missing.length) {
    drift.push(`webhook_events missing ${missing.join(", ")} (the live transcript needs transcript_updated)`);
    patch.webhook_events = [...new Set([...events, ...VOICE_WEBHOOK_EVENTS])];
  }
  const timeout = live.webhook_timeout_ms ?? 10000;
  if (timeout < VOICE_WEBHOOK_TIMEOUT_MS) {
    drift.push(`webhook_timeout_ms is ${timeout}; the recording copy needs ${VOICE_WEBHOOK_TIMEOUT_MS}`);
    patch.webhook_timeout_ms = VOICE_WEBHOOK_TIMEOUT_MS;
  }
  if (live.opt_in_signed_url !== true) {
    drift.push(
      "recording URLs are public and permanent (opt_in_signed_url off); the pipeline copies audio within seconds and refetches a fresh link when it must",
    );
    patch.opt_in_signed_url = true;
  }
  // The analysis fields: ours present and unchanged; anything else on the
  // agent (a preset, a field added by hand) is kept beside them.
  const liveFields = Array.isArray(live.post_call_analysis_data)
    ? (live.post_call_analysis_data.filter((f) => f !== null && typeof f === "object") as Record<string, unknown>[])
    : [];
  const missingFields = CALL_ANALYSIS_FIELDS.filter((f) => !liveFields.some((l) => sameAnalysisField(l, f)));
  if (missingFields.length) {
    drift.push(
      `post_call_analysis_data lacks ${missingFields.map((f) => f.name).join(", ")} (the strip, the profile and the call card read what the caller wanted)`,
    );
    patch.post_call_analysis_data = [
      ...liveFields.filter((l) => !CALL_ANALYSIS_FIELDS.some((f) => f.name === l.name)),
      ...CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })),
    ];
  }
  // The call webhook's credential is Retell's signature; a `?key=` on the URL
  // is a secret in the provider's dashboard and in access logs, and the door
  // no longer reads it. The same URL, bare.
  if (
    typeof live.webhook_url === "string" &&
    live.webhook_url !== "" &&
    (live.webhook_url_keyed === true || /[?&]key=/.test(live.webhook_url))
  ) {
    drift.push(
      "webhook_url still carries the retired query-string key; the signature is the credential and the door no longer reads one",
    );
    patch.webhook_url = live.webhook_url.split("?")[0];
  }
  if (opts.retentionDays !== undefined && live.data_storage_retention_days !== opts.retentionDays) {
    if (!Number.isInteger(opts.retentionDays) || opts.retentionDays < 1 || opts.retentionDays > 730) {
      drift.push(`retention must be a whole number of days from 1 to 730, not ${opts.retentionDays}`);
    } else {
      drift.push(
        `data_storage_retention_days is ${live.data_storage_retention_days ?? "unset (kept forever)"}; asked for ${opts.retentionDays}`,
      );
      patch.data_storage_retention_days = opts.retentionDays;
    }
  }
  return { drift, agentPatch: Object.keys(patch).length ? patch : null };
}

/** The diagnostic's view of the agent settings. Strings only. */
export function agentSettingsDrift(live: LiveAgentSettings): { converged: boolean; drift: string[] } {
  const plan = planAgentSettings(live);
  return { converged: plan.drift.length === 0, drift: plan.drift };
}
