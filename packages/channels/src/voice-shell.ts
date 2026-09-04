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
 * ONE definition, in code, for three readers: the converger script that
 * brings a live agent onto it, the diagnostic that reports whether a line
 * has drifted off it, and the provisioning script for a new tenant (a mirror,
 * pinned equal by a test). The live salon agent predates all of this and was
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

/** The prompt body. Both placeholders are mandatory; a test pins them. */
export const VOICE_SHELL_PROMPT =
  "{{business_facts}}\n\nWho you are speaking with:\n{{caller_context}}";

/** Composed by the webhook so the business name never becomes a third copy. */
export const VOICE_SHELL_BEGIN = "{{greeting}}";

/** The transfer tool dials this; the webhook fills it from the profile. */
export const HANDOFF_VAR = "{{handoff_number}}";

/**
 * What the agent is told when the business's facts could not be loaded.
 * `apps/edge/api/retell-inbound.ts` keeps a literal copy (a test pins the two
 * equal): the webhook must never depend on a package import to say this.
 */
export const FACTS_UNAVAILABLE =
  "The business's details could not be loaded for this call. Do not state opening hours, prices, services or an address from memory — you do not have them. Say you will have someone confirm, offer to take a message, and offer to text the booking link.";

export const CALLER_UNKNOWN = "New caller - no prior interactions on record.";

/** The greeting with no business named — never wrong, never a placeholder. */
export const GREETING_DEFAULT =
  "Thank you for calling! This call may be recorded. I'm the automated assistant — how can I help you today?";

/** Where the booking-link tool posts. Overridable for previews. */
export const DEFAULT_FN_URL = "https://chanlytics-messaging.vercel.app/api/retell-fn";

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
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description:
              "Alternate number to send the link to, digits only with country code. Omit to use the caller's number.",
          },
        },
        required: [],
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

/** The live tool, restricted to the keys the desired one defines. */
function pick(live: Record<string, unknown>, desired: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(desired)) if (k in live) out[k] = live[k];
  return out;
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
    drift.push(`begin_message is typed in (${JSON.stringify(norm(live.begin_message).slice(0, 60))}…), not ${desired.begin_message}`);
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
    if (stableJson(pick(have, want)) !== stableJson(want)) {
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
  if (unknownTools.length) drift.push(`live tools the shell does not define (an apply would drop them): ${unknownTools.join(", ")}`);
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
