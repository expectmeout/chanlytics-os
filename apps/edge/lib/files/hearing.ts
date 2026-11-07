/**
 * A video's sound, heard (decision 0099, stage B, D8, D15, D16 and D19). Claude cannot hear, so the ear (Gemini) writes down how
 * a clip sounds and, in the one-call shape, what it says; Scribe writes what it says where VIDEO_WORDS_MODEL names it; and the
 * ear answers Ask's own question about a stretch (`files listen`). The sound goes, never the video.
 *
 * Every answer is someone else's words: read here in code (contracts sound.ts) and never trusted whole, and every call is a
 * row of the ledger beside Anthropic's (file_words for the words, file_hear for how it sounds and a question), spent only
 * where the workspace may use models. A call that may not go costs nothing and says so.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HEARING_MODELS,
  SECOND_MS,
  VIDEO_EAR_SCHEMA,
  VIDEO_EAR_SYSTEM,
  VIDEO_EAR_WORDS_SCHEMA,
  earWordsOf,
  hearingUsageBodyOf,
  scribeWordsOf,
  soundNoteOf,
  videoEarAsked,
  videoListenAsked,
  type HeardBy,
  type HearingPurpose,
  type SoundNote,
  type SoundWords,
} from "@chanlytics/contracts";
import { askGemini, transcribeWithScribe, type GeminiAnswer } from "@chanlytics/channels";
import { recordModelUsage, workspaceMayUseModels, type Database } from "@chanlytics/db";
import { errField, logger } from "../shared/log.js";
import { hearingSetup } from "./video-keys.js";

type Db = SupabaseClient<Database>;

/** The sound's type as the ear is told it: Stream's audio download is AAC in an MP4 box. */
const EAR_AUDIO_MIME = "audio/mp4";
/** The note's answer, and a clip's words with it: ten minutes of steady speech is about 2,000 words. */
const NOTE_TOKENS_MAX = 2_000;
const NOTE_WORDS_TOKENS_MAX = 16_000;
/** A question's answer: a few plain sentences. */
const LISTEN_TOKENS_MAX = 800;
/** The language the ear writes its sentences in: the look's, which Ask reads and says in the person's own. */
const EAR_WRITES_IN = "English";

/** Who asks, and what about: the ledger's row. */
export interface HeardFor {
  tenantId: string;
  fileId: string;
  userId: string | null;
}

/** A hearing that did not happen: why, whether asking again may help, and whether it was held before it went. */
type NotHeard = { ok: false; why: string; retryable: boolean; held?: boolean };

/** Whether the workspace may spend on hearing: a paused, ended or unbilled one's videos are kept, and not heard. */
async function mayHear(db: Db, tenantId: string): Promise<boolean> {
  try {
    return await workspaceMayUseModels(db, tenantId);
  } catch (e) {
    logger({ tenant_id: tenantId }).error("ai_spend_read_failed", { purpose: "file_hear", error: errField(e) });
    return false;
  }
}

/** One call's row; a ledger that cannot be written is a line, never a lost answer. */
async function ledger(
  db: Db,
  forWhom: HeardFor,
  call: {
    purpose: HearingPurpose;
    port: "google" | "elevenlabs";
    model: string;
    answered: boolean;
    /** A failure the vendor said no to (a 4xx, a block), rather than one that got no answer. */
    rejected?: boolean;
    input: number;
    output: number;
    seconds?: number;
    error?: string | null;
  },
): Promise<void> {
  try {
    await recordModelUsage(
      db,
      hearingUsageBodyOf({
        tenantId: forWhom.tenantId,
        purpose: call.purpose,
        port: call.port,
        model: call.model,
        outcome: call.answered ? "answered" : call.rejected ? "rejected" : "unreachable",
        input: call.input,
        output: call.output,
        ...(call.seconds !== undefined ? { seconds: call.seconds } : {}),
        userId: forWhom.userId,
        subjectId: forWhom.fileId,
        error: call.error ? { type: call.port, message: call.error } : null,
      }),
    );
  } catch (e) {
    logger({ tenant_id: forWhom.tenantId }).error("ai_usage_write_failed", {
      purpose: call.purpose,
      error: errField(e),
    });
  }
}

const heardBy = (model: string): HeardBy => ({ model, at: new Date().toISOString() });

/** What the ear answered, on the ledger, or why it did not. */
async function askTheEar(
  db: Db,
  forWhom: HeardFor,
  purpose: HearingPurpose,
  ask: { prompt: string; schema: object | null; maxOutputTokens: number; audio: Uint8Array; timeoutMs: number },
): Promise<{ ok: true; answer: Extract<GeminiAnswer, { ok: true }>; model: string } | NotHeard> {
  const setup = hearingSetup();
  if (!setup.geminiKey) return { ok: false, why: "no ear's key", retryable: false, held: true };
  if (!(await mayHear(db, forWhom.tenantId)))
    return { ok: false, why: "the workspace may not spend", retryable: false, held: true };
  const answer = await askGemini(setup.geminiKey, {
    model: setup.ear,
    system: VIDEO_EAR_SYSTEM,
    prompt: ask.prompt,
    audio: { bytes: ask.audio, mime: EAR_AUDIO_MIME },
    schema: ask.schema,
    maxOutputTokens: ask.maxOutputTokens,
    timeoutMs: ask.timeoutMs,
  });
  await ledger(db, forWhom, {
    purpose,
    port: "google",
    model: setup.ear,
    answered: answer.ok,
    rejected: !answer.ok && !answer.retryable,
    input: answer.input,
    output: answer.output,
    error: answer.ok ? null : answer.error,
  });
  if (!answer.ok) {
    logger({ tenant_id: forWhom.tenantId }).warn("video_ear_failed", {
      file: forWhom.fileId,
      purpose,
      error: answer.error,
    });
    return { ok: false, why: answer.error, retryable: answer.retryable };
  }
  return { ok: true, answer, model: setup.ear };
}

/**
 * The digest's ear: how the clip sounds, and, in the one-call shape, what it says too. A note with no sentence for the whole is
 * no note; words that do not read are none read (the words' step asks Scribe, or keeps that none was heard).
 */
export async function hearNote(
  db: Db,
  forWhom: HeardFor,
  clip: { seconds: number; audio: Uint8Array; withWords: boolean; timeoutMs: number },
): Promise<{ ok: true; note: SoundNote | null; words: SoundWords | null; by: HeardBy } | NotHeard> {
  const heard = await askTheEar(db, forWhom, clip.withWords ? "file_words" : "file_hear", {
    prompt: videoEarAsked({ seconds: clip.seconds, language: EAR_WRITES_IN, withWords: clip.withWords }),
    schema: clip.withWords ? VIDEO_EAR_WORDS_SCHEMA : VIDEO_EAR_SCHEMA,
    maxOutputTokens: clip.withWords ? NOTE_WORDS_TOKENS_MAX : NOTE_TOKENS_MAX,
    audio: clip.audio,
    timeoutMs: clip.timeoutMs,
  });
  if (!heard.ok) return heard;
  const note = soundNoteOf(heard.answer.json);
  const words = clip.withWords ? earWordsOf(heard.answer.json, clip.seconds) : null;
  if (!note && !words) return { ok: false, why: "the ear's answer did not read", retryable: true };
  return { ok: true, note, words, by: heardBy(heard.model) };
}

/** Scribe's words for the clip, on the ledger by the hour of sound. */
export async function transcribe(
  db: Db,
  forWhom: HeardFor,
  clip: { seconds: number; audio: Uint8Array; timeoutMs: number },
): Promise<{ ok: true; words: SoundWords; by: HeardBy } | NotHeard> {
  const setup = hearingSetup();
  if (!setup.scribeKey) return { ok: false, why: "no transcriber's key", retryable: false, held: true };
  if (!(await mayHear(db, forWhom.tenantId)))
    return { ok: false, why: "the workspace may not spend", retryable: false, held: true };
  const answer = await transcribeWithScribe(setup.scribeKey, {
    model: HEARING_MODELS.SCRIBE,
    audio: { bytes: clip.audio, mime: EAR_AUDIO_MIME, name: `${forWhom.fileId}.m4a` },
    timeoutMs: clip.timeoutMs,
  });
  await ledger(db, forWhom, {
    purpose: "file_words",
    port: "elevenlabs",
    model: HEARING_MODELS.SCRIBE,
    answered: answer.ok,
    rejected: !answer.ok && !answer.retryable,
    input: 0,
    output: 0,
    seconds: answer.ok ? clip.seconds : 0,
    error: answer.ok ? null : answer.error,
  });
  if (!answer.ok) {
    logger({ tenant_id: forWhom.tenantId }).warn("video_ear_failed", {
      file: forWhom.fileId,
      purpose: "file_words",
      error: answer.error,
    });
    return { ok: false, why: answer.error, retryable: answer.retryable };
  }
  const words = scribeWordsOf(answer.answer, clip.seconds);
  if (!words) return { ok: false, why: "the transcriber's answer did not read", retryable: true };
  return { ok: true, words, by: heardBy(HEARING_MODELS.SCRIBE) };
}

/** How long a question about a stretch is given: a few seconds of listening, inside a turn's patience. */
export const LISTEN_MS = 40 * SECOND_MS;

/** Ask's own question about a stretch of the clip (`files listen`), answered by the ear in a few sentences. */
export async function listenTo(
  db: Db,
  forWhom: HeardFor,
  clip: {
    seconds: number;
    audio: Uint8Array;
    question: string;
    from: number | null;
    to: number | null;
    timeoutMs: number;
  },
): Promise<{ ok: true; answer: string; by: HeardBy } | NotHeard> {
  const heard = await askTheEar(db, forWhom, "file_hear", {
    prompt: videoListenAsked({ seconds: clip.seconds, question: clip.question, from: clip.from, to: clip.to }),
    schema: null,
    maxOutputTokens: LISTEN_TOKENS_MAX,
    audio: clip.audio,
    timeoutMs: clip.timeoutMs,
  });
  if (!heard.ok) return heard;
  return { ok: true, answer: heard.answer.text.slice(0, 2_000), by: heardBy(heard.model) };
}
