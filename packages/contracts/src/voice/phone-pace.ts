/**
 * How fast the phone receptionist speaks (decision 0073, R7). Five paces, each a speed the voice provider takes per call
 * (Retell's agent_override.agent.voice_speed, 0.5 to 2, where 1 is the voice's own), sent by the inbound-call webhook
 * and the rehearsal's call as the voice is (phone-voices.ts), so a change reaches the next call and nothing saved on the
 * agent moves. Natural sends nothing: the line keeps its own pace.
 */

export const PHONE_PACES = ["slower", "a_bit_slower", "natural", "a_bit_faster", "faster"] as const;
export type PhonePace = (typeof PHONE_PACES)[number];

/** Each pace's speed. Steps a caller hears without the voice sounding stretched: past 0.85 or 1.15 it does. */
const PACE_SPEED: Readonly<Record<PhonePace, number>> = {
  slower: 0.85,
  a_bit_slower: 0.92,
  natural: 1,
  a_bit_faster: 1.08,
  faster: 1.15,
};

export const PHONE_PACE_WORDS = {
  label: "Pace",
  options: {
    slower: "Slower",
    a_bit_slower: "A bit slower",
    natural: "Natural",
    a_bit_faster: "A bit faster",
    faster: "Faster",
  } as Record<PhonePace, string>,
  gate: "change how fast it speaks",
  /** A pace not on the list, refused before it is sent: the edge would send no other. */
  unlisted: "Pick one of the five paces.",
  saved: (pace: PhonePace) => `Callers hear it ${PHONE_PACE_WORDS.options[pace].toLowerCase()} from their next call.`,
} as const;

/** The pace a stored value names, or null where it names none on the list (absent, retired or mistyped). */
export function phonePaceOf(stored: unknown): PhonePace | null {
  return typeof stored === "string" && (PHONE_PACES as readonly string[]).includes(stored)
    ? (stored as PhonePace)
    : null;
}

/** The pace a call is spoken at, as the page says it: the one chosen, else natural. */
export function phonePaceShown(stored: unknown): PhonePace {
  return phonePaceOf(stored) ?? "natural";
}

/** The speed a call is sent, or null to send none (natural, or nothing chosen): the line keeps its own pace. */
export function phonePaceSpeed(stored: unknown): number | null {
  const pace = phonePaceOf(stored);
  return pace && pace !== "natural" ? PACE_SPEED[pace] : null;
}
