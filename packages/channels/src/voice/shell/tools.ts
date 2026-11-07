/** Shell: tools. */

import {
  BRAIN_INTENTS,
  BRAIN_LANGUAGES,
  CALL_OUTCOMES,
  GREETING_DEFAULT,
  MIN_MS,
  POLICY_COVERS,
  SECOND_MS,
} from "@chanlytics/contracts";

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
 * the shell's default and the webhook's answer cannot drift apart. It offers nothing it may not be able to do: with no
 * details there is no knowing whether the business has a booking link or a WhatsApp line to send one by, so it takes a
 * message (11 Oct 2026: it offered the link by WhatsApp to every call it was said on).
 */
export const FACTS_UNAVAILABLE =
  "The business's details could not be loaded for this call. Do not state opening hours, prices, services or an address from memory — you do not have them. Say you will have someone confirm, and offer to take their name and a message so the team can call them back. Do not offer to send anything.";

/** What the agent is told about a caller when nothing could be read: the shell's default, and the webhook's fallback. */
export const CALLER_UNKNOWN = "New caller - no prior interactions on record.";

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
export function voiceShellTools(fnUrl: string, bookingHeaders?: Record<string, string> | null): RetellTool[] {
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
        "Send the booking link to the caller's WhatsApp, or by text message when WhatsApp cannot carry it, when the caller wants to book, unless your instructions say there is no link or no way to send it. It goes to the number they are calling from unless another number is given, and its answer says how it went.",
      url: fnUrl,
      method: "POST",
      speak_during_execution: true,
      // Said while the tool runs, before it has answered: so it promises nothing, and the answer it speaks after says
      // what happened (11 Oct 2026: "sending it to their WhatsApp now" came before every refusal).
      execution_message_description: "Say one moment, please.",
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
          // No `enum`: a plain string and its words, the shape the provider keeps as given, so the plan sees no
          // difference that is not there. The edge reads "text" and nothing else (call-booking-link.ts).
          by: {
            type: "string",
            description:
              'Set to "text" when the caller says they do not use WhatsApp on the number, and your instructions say a text can be sent. Omit to send by WhatsApp first.',
          },
        },
      },
    },
    {
      type: "custom",
      name: "check_availability",
      description:
        "Check which appointment times are open right now. Use when the caller asks when they could come in, or before offering a time. Returns the open windows and what to offer after them; offer up to three that fit, then do what the answer says. Never confirm a slot yourself.",
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
export function desiredVoiceShell(fnUrl: string, bookingHeaders?: Record<string, string> | null): VoiceShellTarget {
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
  /** Read for the notes alone: a model or temperature is never changed here (a model change goes through the gate). */
  model?: string | null;
  model_temperature?: number | null;
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
  /** What differs from the product's defaults and is reported, never changed: the model and its temperature. */
  notes: string[];
}

export const normalizedText = (s: string | null | undefined) => (s ?? "").replace(/\r\n/g, "\n").trim();

/** Deterministic JSON for comparing the fields WE set on a tool. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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
export function subsetEqual(live: unknown, desired: unknown): boolean {
  if (Array.isArray(desired)) return stableJson(live) === stableJson(desired);
  if (desired && typeof desired === "object") {
    if (!live || typeof live !== "object" || Array.isArray(live)) return false;
    return Object.entries(desired as Record<string, unknown>).every(([k, v]) =>
      subsetEqual((live as Record<string, unknown>)[k], v),
    );
  }
  return stableJson(live) === stableJson(desired);
}

/* ----------------------------- agent settings ----------------------------- */

/** The webhook events the call pipeline is built on. transcript_updated is
 *  opt-in at Retell and is what makes the Live page's transcript live. */
export const VOICE_WEBHOOK_EVENTS = ["call_started", "call_ended", "call_analyzed", "transcript_updated"] as const;

/** The webhook copies the recording inside its budget; Retell's default 10 s is too short for it. */
export const VOICE_WEBHOOK_TIMEOUT_MS = 20000;

/** What Retell applies when webhook_events is absent. */
export const RETELL_DEFAULT_EVENTS = ["call_started", "call_ended", "call_analyzed"];

/**
 * How long one call may run, how long a silent line is held, and how long the provider keeps a call (decision 0092).
 * One provider account answers every workspace's line and the platform pays it by the minute, so a line left open or a
 * robocaller once cost up to an hour a call (the provider's default, which provisioning pinned). Our own copy -- the
 * row, the transcript, the audio in the private bucket -- is the record minutes after a call ends (the copy retries
 * for two days at most, call-recording.ts RECORDING_DEFER_LIMIT_MS), so the provider keeps a call a week, not ninety
 * days: less of a customer's call sits where an erasure has to ask for it.
 */
export const CALL_LIMITS = {
  max_call_duration_ms: 20 * MIN_MS,
  end_call_after_silence_ms: 30 * SECOND_MS,
  data_storage_retention_days: 7,
} as const;

/**
 * What the agent's post-call analysis fills in after every call, in the
 * caller's own terms: what they wanted, how it ended, what a person should
 * do next, the name they gave, the email address they spelled out, what the
 * call was mainly about and the language it was spoken in (Reports read both,
 * as the receptionist's texts carry the same two: contracts BRAIN_INTENTS,
 * BRAIN_LANGUAGES). The provider's default summary ("The user called Marisa's
 * Beauty Salon to inquire about…") is kept beside it; these are what the strip,
 * the profile and the call card say. The webhook files them through ingest_call
 * (migration 00061): the first four as columns, the rest inside the analysis it
 * keeps whole (calls.analysis). The name and the address are suggestions for the
 * person's page, never applied to the contact by themselves.
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
  {
    type: "string",
    name: "caller_email",
    description:
      "The email address the caller gave, exactly as they spelled it out. Leave empty if they did not give one.",
    examples: ["ana.ruiz@example.com", "daniela.r@example.net"],
  },
  {
    type: "enum",
    name: "topic",
    // The classes a rule covers are said in the words the receptionist's prompt and its texts' intent say them
    // (POLICY_COVERS), so a call and a text read one meaning; only what no rule covers is said here.
    description: `What the call was mainly about. booking: ${POLICY_COVERS.booking}. pricing: ${POLICY_COVERS.faq}, when it is about what something costs. services: ${POLICY_COVERS.faq}, when it is about what the business offers. money: ${POLICY_COVERS.money}. hours: when the business is open. location: where it is or how to get there. complaint: they were unhappy about something. smalltalk: a greeting or a chat with no request. other: none of these.`,
    choices: [...BRAIN_INTENTS],
  },
  {
    type: "enum",
    name: "language",
    description: "The language the caller mostly spoke. en: English. es: Spanish. other: any other language.",
    choices: [...BRAIN_LANGUAGES],
  },
] as const;

type AnalysisField = (typeof CALL_ANALYSIS_FIELDS)[number];

/** The live field is ours, unchanged: same name, type, description, choices and examples. */
export function sameAnalysisField(live: Record<string, unknown>, want: AnalysisField): boolean {
  const w = want as unknown as Record<string, unknown>;
  return (
    live.name === w.name &&
    live.type === w.type &&
    live.description === w.description &&
    JSON.stringify(live.choices ?? null) === JSON.stringify(w.choices ?? null) &&
    JSON.stringify(live.examples ?? null) === JSON.stringify(w.examples ?? null)
  );
}
