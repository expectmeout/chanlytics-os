/** Shell: agent plan. */

import { PHONE_VOICE_DEFAULT, RETELL_MODELS, keysOf } from "@chanlytics/contracts";
import {
  CALL_ANALYSIS_FIELDS,
  CALL_LIMITS,
  RETELL_DEFAULT_EVENTS,
  VOICE_WEBHOOK_EVENTS,
  VOICE_WEBHOOK_TIMEOUT_MS,
  desiredVoiceShell,
  normalizedText,
  sameAnalysisField,
  subsetEqual,
  type LiveVoiceLlm,
  type VoiceConvergencePlan,
  type VoiceShellTarget,
} from "./tools";

/**
 * What separates a live LLM from the shell, and the patch that closes it.
 *
 * Pure, so the dry run IS the plan the apply executes: the script prints the
 * result of this function and, with --apply, sends exactly `llmPatch`. Extra
 * default variables on the live LLM are kept (merged), not deleted; tools the
 * shell does not know are reported and would be REPLACED by an apply, which
 * is why they are listed by name in the plan. A header is ours, never the
 * provider's default: a live tool carrying one the shell does not set (the
 * shared secret once the doors read the signature alone) differs, by its name.
 */
export function planVoiceConvergence(live: LiveVoiceLlm, desired: VoiceShellTarget): VoiceConvergencePlan {
  const drift: string[] = [];
  const patch: Partial<VoiceShellTarget> = {};

  if (normalizedText(live.general_prompt) !== normalizedText(desired.general_prompt)) {
    const has = (v: string) => normalizedText(live.general_prompt).includes(v);
    drift.push(
      `general_prompt differs (${normalizedText(live.general_prompt).length} chars live; ` +
        `reads {{business_facts}}: ${has("{{business_facts}}")}, {{caller_context}}: ${has("{{caller_context}}")})`,
    );
    patch.general_prompt = desired.general_prompt;
  }
  if (normalizedText(live.begin_message) !== normalizedText(desired.begin_message)) {
    drift.push(
      `begin_message is typed in (${JSON.stringify(normalizedText(live.begin_message).slice(0, 60))}…), not ${desired.begin_message}`,
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
      const subject =
        want.name === "transfer_to_staff"
          ? ` (live destination: ${JSON.stringify((have.transfer_destination as { number?: string } | undefined)?.number ?? "?")}, ` +
            `option: ${JSON.stringify((have.transfer_option as { type?: string } | undefined)?.type ?? "?")})`
          : "";
      drift.push(`tool ${want.name} differs${subject}`);
      toolsDiffer = true;
      continue;
    }
    const wanted = (want.headers as Record<string, string> | undefined) ?? {};
    const extra = Object.keys((have.headers as Record<string, string> | undefined) ?? {}).filter((k) => !(k in wanted));
    if (extra.length) {
      drift.push(`tool ${want.name} carries a header the shell does not set (${extra.join(", ")}): an apply drops it`);
      toolsDiffer = true;
    }
  }
  const unknownTools = liveTools.map((t) => t.name).filter((n) => !desired.general_tools.some((t) => t.name === n));
  if (unknownTools.length)
    drift.push(`live tools the shell does not define (an apply would drop them): ${unknownTools.join(", ")}`);
  if (toolsDiffer) patch.general_tools = desired.general_tools;

  return { drift, llmPatch: Object.keys(patch).length ? patch : null, unknownTools, notes: llmNotes(live) };
}

/**
 * The diagnostic's view: on the shell or not, and why not. Strings only —
 * this is printed by /api/diag, and the live tools carry a secret header.
 *
 * `secretRetired`: the edge opens the voice doors for Retell's signature alone (RETELL_DOORS_SIGNED, edge
 * shared/door-auth.ts signatureOnly). Until then a booking tool with no `x-fn-secret` header is refused, so its absence
 * is the drift; once the secret is retired, a header still carrying it is a secret left in the provider's dashboard,
 * so its presence is. The target drops the header either way the switch says.
 */
export function voiceShellDrift(
  live: LiveVoiceLlm,
  fnUrl: string,
  secretRetired = false,
): { converged: boolean; drift: string[] } {
  const booking = (live.general_tools ?? []).find((t) => t.name === "send_booking_link");
  const url = typeof booking?.url === "string" ? booking.url : fnUrl;
  const headers = (booking?.headers as Record<string, string> | undefined) ?? null;
  const plan = planVoiceConvergence(live, desiredVoiceShell(url, secretRetired ? null : headers));
  const drift = [...plan.drift];
  // Once retired, a tool still carrying the header is the plan's own drift: a header the shell does not set.
  if (!secretRetired && booking && !headers)
    drift.push("send_booking_link has no x-fn-secret header — the edge will refuse it");
  return { converged: drift.length === 0, drift };
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
  /** How long a call may run, and a silent line be held; unset is the provider's default (an hour; ten minutes). */
  max_call_duration_ms?: number | null;
  end_call_after_silence_ms?: number | null;
  post_call_analysis_data?: unknown[] | null;
  /** A locale, a list of them, or the deprecated "multi" (stored as its ten locales); unset is en-US. */
  language?: string | string[] | null;
  reminder_trigger_ms?: number | null;
  reminder_max_count?: number | null;
  /** How a call sounds and takes turns (CALL_FEEL, CALL_HANDBOOK); unset is the provider's default. */
  interruption_sensitivity?: number | null;
  begin_message_delay_ms?: number | null;
  enable_backchannel?: boolean | null;
  handbook_config?: Record<string, unknown> | null;
  voice_id?: string | null;
  post_call_analysis_model?: string | null;
}

export interface AgentPlan {
  drift: string[];
  /** The PATCH body for update-agent, or null when nothing differs. */
  agentPatch: Record<string, unknown> | null;
  /** What differs from the product's defaults and is reported, never changed: the voice and the post-call model. */
  notes: string[];
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
 * The call's limits are drift (CALL_LIMITS, decision 0092): the longest a
 * call may run, a silent line's end, and the days the provider keeps a call,
 * which the converger may be told otherwise (`retentionDays`).
 */
export function planAgentSettings(
  live: LiveAgentSettings,
  opts: { retentionDays?: number; locales?: readonly string[] } = {},
): AgentPlan {
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
      `post_call_analysis_data lacks ${missingFields.map((f) => f.name).join(", ")} (the strip, the profile, the call card and Reports read what the call was about)`,
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
  const retentionDays = opts.retentionDays ?? CALL_LIMITS.data_storage_retention_days;
  if (live.data_storage_retention_days !== retentionDays) {
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 730) {
      drift.push(`retention must be a whole number of days from 1 to 730, not ${retentionDays}`);
    } else {
      drift.push(
        `data_storage_retention_days is ${live.data_storage_retention_days ?? "unset (kept forever)"}; the product keeps ${retentionDays}`,
      );
      patch.data_storage_retention_days = retentionDays;
    }
  }
  planCallLimits(live, drift, patch);
  planFirstSeconds(live, opts.locales, drift, patch);
  planCallFeel(live, drift, patch);
  return { drift, agentPatch: Object.keys(patch).length ? patch : null, notes: agentNotes(live) };
}

/**
 * How a call sounds and takes turns, the product's on every line (the call-feel read, 28 Oct 2026). Of the salon's
 * fifteen callers from 7 to 12 October, twelve never spoke, and its agent ran the provider's defaults: no persona set
 * (the provider's is a "professional call-center representative"), stopped by any sound on the line, and speaking 0.2
 * seconds after pickup. Ruben's own line had been set by hand to sound like a person; every line now does.
 *   - interruption_sensitivity 0.8: an "uh-huh" or a noise in the room no longer cuts it off mid-sentence (the
 *     provider's default, 1, is the easiest to interrupt; its own advice for noisy lines is 0.8).
 *   - begin_message_delay_ms 400: a forwarded call's audio settles before the first word, which was clipped.
 *   - enable_backchannel: short listening sounds while the caller talks, so a long answer is not met with silence.
 * The voice and its pace are the owner's (sent with each call), the model goes through the gate, and the reminders are
 * SILENCE_REMINDER_MS.
 */
export const CALL_FEEL = {
  interruption_sensitivity: 0.8,
  begin_message_delay_ms: 400,
  enable_backchannel: true,
} as const;

/**
 * The provider's prompt presets a line runs with (its "handbook"): conversational rather than a call-center script,
 * with natural filler words; key details (a name, a number, a day and time) read back to the caller; numbers, dates and
 * prices said the way people say them. Any other preset on the line is kept as it is.
 */
export const CALL_HANDBOOK = {
  default_personality: false,
  conversational_personality: true,
  natural_filler_words: true,
  echo_verification: true,
  speech_normalization: true,
} as const;

/** The longest a call may run and a silent line's end (CALL_LIMITS): what the platform pays the provider for. */
function planCallLimits(live: LiveAgentSettings, drift: string[], patch: Record<string, unknown>): void {
  for (const key of ["max_call_duration_ms", "end_call_after_silence_ms"] as const) {
    if (live[key] === CALL_LIMITS[key]) continue;
    drift.push(`${key} is ${String(live[key] ?? "unset")}; the product's is ${CALL_LIMITS[key]}`);
    patch[key] = CALL_LIMITS[key];
  }
}

/** The call's feel: each setting the product holds, and the handbook's presets merged into what the line has. */
function planCallFeel(live: LiveAgentSettings, drift: string[], patch: Record<string, unknown>): void {
  for (const key of keysOf(CALL_FEEL)) {
    if (live[key] === CALL_FEEL[key]) continue;
    drift.push(`${key} is ${String(live[key] ?? "unset")}; the product's is ${String(CALL_FEEL[key])}`);
    patch[key] = CALL_FEEL[key];
  }
  const book = live.handbook_config ?? {};
  const differ = keysOf(CALL_HANDBOOK).filter((k) => book[k] !== CALL_HANDBOOK[k]);
  if (!differ.length) return;
  drift.push(
    `the handbook's ${differ.join(", ")} differ from the product's: a conversational receptionist that reads key details back`,
  );
  patch.handbook_config = { ...book, ...CALL_HANDBOOK };
}

/**
 * How long a caller's silence after the agent speaks waits before the agent speaks again, and how many times. Retell's
 * default is ten seconds once; of the salon's twelve callers in thirty days, three heard the whole greeting and hung up
 * after two to nine seconds of silence (the engine review's second pass, 11 Oct 2026). Four seconds, twice.
 */
export const SILENCE_REMINDER_MS = 4_000;

export const SILENCE_REMINDERS = 2;

/** The ten locales Retell's deprecated "multi" is stored as: what every agent was provisioned with. */
const RETELL_MULTI = ["en-US", "es-ES", "fr-FR", "de-DE", "hi-IN", "ru-RU", "pt-PT", "ja-JP", "it-IT", "nl-NL"];

/**
 * The locale for each language a workspace can say it speaks (the Business tab's names, contracts COMMON_LANGUAGES
 * first), lower-cased. Spanish is Latin American and Portuguese Brazilian: the forms a US business's callers speak.
 */
const RETELL_LOCALE_OF: Readonly<Record<string, string>> = {
  english: "en-US",
  spanish: "es-419",
  español: "es-419",
  espanol: "es-419",
  portuguese: "pt-BR",
  french: "fr-FR",
  mandarin: "zh-CN",
  chinese: "zh-CN",
  cantonese: "yue-CN",
  arabic: "ar-SA",
  russian: "ru-RU",
  polish: "pl-PL",
  italian: "it-IT",
  hindi: "hi-IN",
  german: "de-DE",
  japanese: "ja-JP",
  korean: "ko-KR",
  vietnamese: "vi-VN",
  tagalog: "fil-PH",
  filipino: "fil-PH",
  ukrainian: "uk-UA",
  turkish: "tr-TR",
  dutch: "nl-NL",
  greek: "el-GR",
  hebrew: "he-IL",
};

/**
 * The locales an agent listens for, from the languages its workspace speaks, or why what it listens for is kept. Every
 * agent was given Retell's ten-locale "multi", which has recognition choose among ten languages on every word; a
 * workspace that speaks English and Spanish now listens for those two. English is always among them: the greeting is
 * English, so a caller may answer in it. The line is left as it is when the workspace names no language, or names one
 * the table has no locale for (typed by hand, "Spanish (Mexico)", or one Retell lacks, Haitian Creole): narrowed to
 * the rest, a line that understood those callers would stop, for a word nobody meant as a setting.
 */
export function retellLocalesFor(
  languages: readonly string[] | null | undefined,
): { locales: string[] } | { kept: string } {
  const named = (languages ?? []).map((l) => l.trim()).filter(Boolean);
  if (!named.length) return { kept: "the workspace names no language: what the agent listens for is kept" };
  const pairs = named.map((name) => ({ name, locale: RETELL_LOCALE_OF[name.toLowerCase()] }));
  const unknown = pairs.filter((p) => !p.locale).map((p) => p.name);
  if (unknown.length)
    return {
      kept: `the workspace names ${unknown.join(", ")}, which the provider has no locale for here: what the agent listens for is kept`,
    };
  const found = pairs.map((p) => p.locale).filter((l): l is string => typeof l === "string");
  return { locales: [...new Set(["en-US", ...found])] };
}

/** A locale's language, without its region: en-GB and en-US are both English. */
const languageOf = (locale: string) => locale.replace(/-.*$/, "").toLowerCase();

/**
 * Said whenever the agent's latest version is an unpublished draft. The converger never publishes a draft it did not
 * make in that run: it may hold edits made elsewhere. 11 Oct 2026: a draft was patched in place in silence, and the
 * line kept the old words.
 */
export function unpublishedLatestNote(version: unknown): string {
  return `v${String(version)}, the agent's latest, is an unpublished draft: what is planned here is that draft, and a pinned line runs the last published version, which is not read here. The converger never publishes a draft it did not make in this run (it may hold edits made elsewhere): look at v${String(version)} in Retell and publish it there`;
}

/** Said when the converger made a draft and was not told to publish it: a second run will find it and leave it. */
export function newDraftNote(draft: unknown, published: unknown): string {
  return `v${String(draft)} is a draft: a pinned line stays on v${String(published)} until it is published. A second run finds it as a draft it did not make and leaves it, so publish it in Retell, or apply and publish together next time`;
}

/** The live language as locales, whatever form Retell returned it in. */
function liveLocales(language: LiveAgentSettings["language"]): string[] {
  if (Array.isArray(language)) return language;
  if (language === "multi") return RETELL_MULTI;
  return [language || "en-US"];
}

/** The first seconds of a call: the silence reminders, and, where the workspace is known, the locales it listens for. */
function planFirstSeconds(
  live: LiveAgentSettings,
  locales: readonly string[] | undefined,
  drift: string[],
  patch: Record<string, unknown>,
): void {
  const trigger = live.reminder_trigger_ms ?? 10_000;
  const times = live.reminder_max_count ?? 1;
  if (trigger !== SILENCE_REMINDER_MS || times !== SILENCE_REMINDERS) {
    drift.push(
      `a silent caller is reminded after ${trigger} ms, ${times} time(s); the product reminds after ${SILENCE_REMINDER_MS} ms, ${SILENCE_REMINDERS} times`,
    );
    patch.reminder_trigger_ms = SILENCE_REMINDER_MS;
    patch.reminder_max_count = SILENCE_REMINDERS;
  }
  if (!locales?.length) return;
  const have = liveLocales(live.language);
  // By language, not region: a dialect the owner picked (en-GB) is theirs, and is not overwritten with en-US.
  const languages = (ls: readonly string[]) => [...new Set(ls.map(languageOf))].sort().join();
  if (languages(have) !== languages(locales)) {
    drift.push(`listens for ${have.join(", ")}; the workspace speaks ${locales.join(", ")}`);
    patch.language = locales.length === 1 ? locales[0] : [...locales];
  }
}

/** The agent's settings that differ from the product's defaults and stay as they are: the voice, the post-call model. */
function agentNotes(live: LiveAgentSettings): string[] {
  const notes: string[] = [];
  if (live.voice_id && live.voice_id !== PHONE_VOICE_DEFAULT)
    notes.push(
      `voice is ${live.voice_id}; the product's default is ${PHONE_VOICE_DEFAULT} (a voice is the owner's: kept)`,
    );
  if (live.post_call_analysis_model && live.post_call_analysis_model !== RETELL_MODELS.analysis)
    notes.push(
      `post-call analysis runs on ${live.post_call_analysis_model}; the product's is ${RETELL_MODELS.analysis} (kept: a model change goes through the gate)`,
    );
  return notes;
}

/** The LLM's settings that differ from the product's defaults and stay as they are: the model, the temperature. */
function llmNotes(live: LiveVoiceLlm): string[] {
  const notes: string[] = [];
  if (live.model && live.model !== RETELL_MODELS.llm)
    notes.push(
      `model is ${live.model}; the product's is ${RETELL_MODELS.llm} (kept: a model change goes through the gate)`,
    );
  if (typeof live.model_temperature === "number" && live.model_temperature !== 0)
    notes.push(
      `temperature is ${live.model_temperature}; the product's is 0, so the facts are read, not improvised (kept)`,
    );
  return notes;
}

/** The diagnostic's view of the agent settings. Strings only. */
export function agentSettingsDrift(live: LiveAgentSettings): { converged: boolean; drift: string[] } {
  const plan = planAgentSettings(live);
  return { converged: plan.drift.length === 0, drift: plan.drift };
}

export { greetingFor, GREETING_DEFAULT } from "@chanlytics/contracts";
