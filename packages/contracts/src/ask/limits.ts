/** Ask: limits. */

import { MIN_MS } from "../shared/time";

/* ------------------------------------------------------------------ limits */

/** One question, in characters. Longer than this is a document, not a question. */
export const ASK_MAX_CHARS = 1000;

/**
 * The column the Line draws an answer in, as the tab measures it when a question is sent (bridge/ask/column.ts):
 * its width in CSS pixels, and whether a phone is looking. It rides with the question and is told to the model in the
 * turn's words, so the answer is shaped for the space it is read in (18 Oct 2026: a desk's docked panel draws answers
 * 408px wide, a phone 358px). None from an older tab or a script.
 */
export interface AskColumn {
  px: number;
  phone: boolean;
}

/** The narrowest and widest column a tab may say it draws in: anything else is no column. */
const ASK_COLUMN_PX = { min: 240, max: 1600 } as const;

/** A column as a request carries it, read leniently: null where it is not one. */
export function askColumnOf(raw: unknown): AskColumn | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const px = typeof r.px === "number" && Number.isFinite(r.px) ? Math.round(r.px) : Number.NaN;
  return px >= ASK_COLUMN_PX.min && px <= ASK_COLUMN_PX.max ? { px, phone: r.phone === true } : null;
}

/**
 * Tool rounds per turn: reads, then the answer, the last forced to finish. Three from the page riding in (D10) to the
 * operator (15 Oct 2026, Ruben's "running chanlytics end to end"): reading the workspace, what wins and what exists before
 * a plan of several cards takes more than two rounds of reads, and a tool found by search takes one of its own.
 */
export const ASK_MAX_ROUNDS = 8;

/**
 * A typed turn end to end, under the route's ceiling (app/api/v1/ask, maxDuration): long enough for a plan of several
 * cards over many reads (the operator, 15 Oct 2026; his rule that cost never outranks the experience).
 */
export const ASK_TURN_BUDGET_MS = 2 * MIN_MS;

/**
 * A spoken turn end to end (the voice door): a person is listening, so it keeps the budget a turn had before the operator,
 * under the voice claim's own staleness (ASK_VOICE_CLAIM_STALE_MS).
 */
export const ASK_SPOKEN_TURN_BUDGET_MS = 45_000;

/**
 * The most the owner's tools block may be, in characters as the model is sent it with every tool loaded: what a turn
 * pays when tool search is refused and every tool rides up front (66,050 on 11 October 2026; 73,558 on 15 October, Ask
 * reading the sequences as their page does, decision 0060; the operator's full parity, 15 October, every page's verbs
 * as cards, the most it may grow to).
 */
export const ASK_TOOLS_CHARS_CEILING = 130_000;

/**
 * The most the owner's tools loaded on every question may be (the always-loaded core and the search tool), in characters:
 * the rest are found by tool search, out of the cached prefix until one is (the operator, 15 Oct 2026, D11).
 */
export const ASK_CORE_TOOLS_CHARS_CEILING = 40_000;

/**
 * The most people or leads one card acts on (the operator, 15 Oct 2026, D5): a selection by rule, a list or ids, counted
 * before the card is shown, committed in its door's own batches.
 */
export const ASK_SELECTION_MAX = 2_000;

/**
 * The longest the voice door lets pass with nothing speakable sent: ElevenLabs cuts a custom LLM whose stream goes
 * quiet for 15 s (its ceiling) and asks again, so while the model is quiet the door sends the vendor's own buffer words
 * every ten (docs/superpowers/specs/2026-10-03-ask-spoken-spike.md, runs B5 to B9).
 */
export const ASK_VOICE_PULSE_MS = 10_000;

/**
 * The longest the voice door waits for the model's first speakable words before it says "One moment… " itself (the
 * platform's own filler is off: its words reached the chat as the answer's head).
 */
export const ASK_VOICE_FIRST_WORDS_MS = 2_500;

/**
 * A spoken turn's claim may be taken again this long after it was made: the turn's budget and a margin, so a request
 * repeated just as the owner's budget ends is not run a second time.
 */
export const ASK_VOICE_CLAIM_STALE_MS = MIN_MS;

/**
 * The least life the member's token must have when a voice session starts: the session's own ceiling (ten minutes,
 * the agent's `max_duration_seconds`; elevenlabs-agent.test.mjs holds the two together) and a margin. The browser
 * refreshes a shorter one first, so the brain door opens the member to the end. It was thirty-five minutes while a
 * conversation could run thirty, which put a refresh's round trip before most presses of a one-hour token.
 */
export const ASK_VOICE_TOKEN_MIN_MS = 15 * MIN_MS;

/**
 * Ask's one voice, wherever it speaks: the agent's conversation (tooling/scripts/voice/elevenlabs-agent-config.mjs)
 * and the speech route that reads a brief or an answer aloud (apps/edge/lib/voice/ask-voice.ts). Ruben's pick, 4 Oct
 * 2026: "Mark - Natural Conversations", from the account's library. One constant, so the two never drift.
 */
export const ASK_VOICE_ID = "UgBBYS2sOqTuMpoF3BR0";

/**
 * The model Ask's voice speaks on, in both pipes (the agent's conversation and the one-way speech): Turbo v2, the
 * one of the two the vendor allows an English agent (Turbo v2 or Flash v2) that this voice is high quality on. One
 * model, so a brief and a spoken answer sound the same. The vendor marks Turbo v2 deprecated (4 Oct 2026) and still
 * serves it, and holds the agent to it regardless; a move is one constant, after a listen.
 */
export const ASK_VOICE_MODEL = "eleven_turbo_v2";

/** The most one speech request reads aloud: a brief runs 400 to 800 characters, an answer's say under 600. */
export const ASK_SPEECH_MAX_CHARS = 1500;

/** What a clip read aloud is: Today's brief, or an answer's say. For the log alone; both are read the same way. */
export const SPEECH_PURPOSES = ["brief", "answer"] as const;

export type SpeechPurpose = (typeof SPEECH_PURPOSES)[number];

/**
 * How a voice session ended, the browser's word, one of a closed set the row keeps (00300, 00302): a press
 * (Clear), a typed question, another use of the voice in its place, the Line closing, the far side
 * ending it, a start that never came up, or a minute with nothing asked (`idle`, since the hold is the one mic and the
 * session waits silently between questions). The voice doctor groups by it; "stopped" said nothing.
 */
export const VOICE_END_REASONS = ["button", "typed", "superseded", "navigated", "vendor", "start", "idle"] as const;

export type VoiceEndReason = (typeof VOICE_END_REASONS)[number];

/** Whether a word is one of the set: an older bundle's, or the vendor's own, is not, and is kept on a log line alone. */
export const isVoiceEndReason = (word: string | null | undefined): word is VoiceEndReason =>
  (VOICE_END_REASONS as readonly string[]).includes(word ?? "");

/**
 * How long a voice session waits with nothing asked before the browser ends it (`idle`): a minute, long enough for a
 * follow-up, short enough that a session left open costs a minute of the vendor's and not ten. The agent's own
 * re-engage ("..." at its turn timeout) resets the vendor's own after-last-message clock, so this clock is the end.
 */
export const ASK_VOICE_IDLE_MS = MIN_MS;

/**
 * How long a lift waits for a session that is still connecting before the words go the typed way instead (the text
 * turn, then the clip): the connection starts on the press and takes two to four seconds; most holds outlast it.
 */
export const ASK_VOICE_UP_WAIT_MS = 2_500;

/** The longest a browser's timing may claim on a session's end: ten minutes, the conversation's own ceiling. */
export const ASK_VOICE_TIMING_MAX_MS = 10 * MIN_MS;
