/**
 * The voices a workspace's phone receptionist may speak in (the Settings wiring review, item 11, 18 Oct 2026). Every
 * line spoke in one voice, the product's (Tamsin, MiniMax: Ruben's choice for the salon's line, 17 Sep 2026), even a
 * Spanish-speaking business's. An owner picks one of these on Settings › How it answers › On calls, and each call is
 * answered in it: the inbound-call webhook sends it as the call's own override (Retell's call_inbound.agent_override,
 * which changes nothing saved on the agent), so a change reaches the next call and no agent version is published.
 *
 * A closed list, never a free id: Retell refuses a call whose override it cannot honour, so only voices read from the
 * account's own list (GET list-voices, 18 Oct 2026) are offered, and a stored id that is not one of them is never sent.
 * All MiniMax, the provider of the product's own voice, so a choice never changes what a call minute costs. Each is
 * described by what the provider says of it (a woman or a man, the accent) and heard in the provider's own sample.
 */

export interface PhoneVoice {
  /** Retell's id, as the override carries it. */
  id: string;
  name: string;
  /** What the provider says of it, in the page's words: "Woman · American". */
  says: string;
  /** The provider's own sample of the voice (Retell's public bucket, which the dashboard's media rule names). */
  sample: string;
}

/** Where every sample is: Retell's public bucket (the dashboard's CSP allows media from it, csp.ts). */
export const PHONE_VOICE_SAMPLES_ORIGIN = "https://retell-utils-public.s3.us-west-2.amazonaws.com";

const voice = (id: string, name: string, says: string, file: string): PhoneVoice => ({
  id,
  name,
  says,
  sample: `${PHONE_VOICE_SAMPLES_ORIGIN}/${file}`,
});

export const PHONE_VOICES: readonly PhoneVoice[] = [
  voice("minimax-Tamsin", "Tamsin", "Woman · American", "minimax-Tamsin.mp3"),
  voice("minimax-Grace", "Grace", "Woman · American", "minimax_grace.mp3"),
  voice("minimax-Nia", "Nia", "Woman · American, younger", "minimax_nia.mp3"),
  voice("minimax-Willa", "Willa", "Woman · British", "minimax-Willa.mp3"),
  voice("minimax-Claudia", "Claudia", "Woman · Mexican", "minimax-Claudia.mp3"),
  voice("minimax-Nico", "Nico", "Man · American", "minimax_nico.mp3"),
  voice("minimax-Jack", "Jack", "Man · American", "jack.mp3"),
  voice("minimax-Alejandro", "Alejandro", "Man · Mexican, younger", "minimax-Alejandro.mp3"),
];

/** The product's voice: every line provisioned speaks in it (packages/channels VOICE_AGENT_DEFAULTS). */
export const PHONE_VOICE_DEFAULT = "minimax-Tamsin";

/** The voice a stored id names, or null where it names none on the list (absent, retired or mistyped). */
export function phoneVoiceOf(id: unknown): PhoneVoice | null {
  return typeof id === "string" ? (PHONE_VOICES.find((v) => v.id === id) ?? null) : null;
}

/** The voice the line speaks in, as the page says it: the one chosen, else the product's. */
export function phoneVoiceShown(id: unknown): PhoneVoice {
  return phoneVoiceOf(id) ?? (phoneVoiceOf(PHONE_VOICE_DEFAULT) as PhoneVoice);
}

export const PHONE_VOICE_WORDS = {
  label: "Voice",
  gate: "change the voice callers hear",
  listen: (name: string) => `Hear ${name}`,
  stop: "Stop",
  unlisted: "Choose one of the voices on the list.",
  saved: (name: string) => `Callers hear ${name} from their next call.`,
} as const;
