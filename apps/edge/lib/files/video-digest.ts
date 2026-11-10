/**
 * video_digest: a video made ready for Ask, one step a run (decision 0099, stage B, D22). Stream's word that a clip is playable
 * puts its first step on the ledger (00556 file_media_ready); each run does one step and puts the next on the ledger due now, so
 * a short clip is through in under a minute and no step waits on a retry's clock. A step that fails comes back on the kind's
 * retries; one that fails for good marks the look failed (settle.ts), and the sweep schedules the step the row still lacks a day
 * on (upkeep.ts). Every step is idempotent: what a step makes is looked for before it is made again.
 *
 *   sheet   48 frames from Stream, tiled into sheet.jpg in the file's folder, a first poster.jpg (its second frame), and the
 *           sheet uploaded to Anthropic as the file's copy
 *   audio   Stream's audio download asked for and, once ready, kept as audio.m4a in the folder, so a question is never paid
 *           twice; a clip Stream makes no sound for keeps `none`, and goes straight to the look
 *   words   what is said, by the one-call ear (with the note) or by Scribe (VIDEO_WORDS_MODEL), and its captions put on Stream
 *   note    how it sounds, by the ear, where the words' step did not write it already
 *   look    file_look, the small model reading the sheet with the words and the note beside it (look.ts)
 *
 * An ear that is held (no key, a workspace that may not spend) or that refuses is no reason to stop: the look goes ahead with
 * what there is, and says what was not heard.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FILE_MADE_OF_VIDEO,
  FILE_MADE_OF_VIDEO_MIMES,
  SECOND_MS,
  VIDEO_LOOK_EDITION,
  fileMadePathOf,
  fileFolderOf,
  fileSoundOf,
  isDigestStep,
  nextDigestStepOf,
  soundSaidOf,
  videoSheetPlanOf,
  vttOf,
  type FileMadeOfVideo,
  type FileSound,
  type HeardBy,
  type SoundNote,
  type SoundWords,
  type VideoDigestStep,
  DbFailure,
} from "@chanlytics/contracts";
import {
  askStreamAudio,
  fetchStreamAudio,
  putStreamCaptions,
  readStreamAudio,
  readStreamSoundTrack,
  readStreamVideo,
  streamAudioUrl,
  streamTokenOf,
} from "@chanlytics/channels/files";
import { findFileForWork, filesBucket, keepFileSound, keepVideoSeconds, type FileRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { logger } from "../shared/log.js";
import { hearNote, transcribe, type HeardFor } from "./hearing.js";
import { findClaudeCopy } from "./look.js";
import { drawPoster, drawVideoSheet, type VideoAt } from "./video-sheet.js";
import { hearingSetup, streamKeys } from "./video-keys.js";

type Db = SupabaseClient<Database>;

/** The audio download is asked after this often while a run lasts, and the run keeps this much for itself at its end. */
const AUDIO_POLL_MS = 2 * SECOND_MS;
const RUN_MARGIN_MS = 4 * SECOND_MS;
/** The audio download's token: minutes, as every edge token for a video. */
const AUDIO_TOKEN_S = 5 * 60;

/** What makes a step's work: the row, and Stream's keys. */
interface Digest {
  db: Db;
  row: FileRow;
  video: VideoAt;
  deadline: number;
}

const msLeft = (d: Digest): number => d.deadline - Date.now() - RUN_MARGIN_MS;
const heardFor = (row: FileRow): HeardFor => ({ tenantId: row.tenant_id, fileId: row.id, userId: row.created_by });

/** Which of what is made of the video the folder already holds. */
async function madeOf(d: Digest): Promise<Set<string>> {
  const listed = await filesBucket(d.db).list(fileFolderOf(d.row.tenant_id, d.row.id));
  if (listed.error) throw new DbFailure(listed.error, "video_digest");
  return new Set((listed.data ?? []).map((f) => f.name));
}

async function keepMade(d: Digest, which: FileMadeOfVideo, bytes: Uint8Array): Promise<void> {
  const upload = await filesBucket(d.db).upload(fileMadePathOf(d.row.tenant_id, d.row.id, which), bytes, {
    contentType: FILE_MADE_OF_VIDEO_MIMES[which],
    upsert: true,
  });
  if (upload.error) throw new DbFailure(upload.error, `video_digest: ${which} not kept`);
}

/** One part of what was heard, kept, with the list's words for the whole as it now stands. */
async function keepSound(
  digest: Digest,
  sound: FileSound,
  part: { words?: SoundWords; note?: SoundNote; none?: true },
  by: HeardBy | null,
): Promise<FileSound> {
  const next: FileSound = part.none
    ? { none: true }
    : {
        ...sound,
        ...(part.words ? { words: part.words } : {}),
        ...(part.note ? { note: part.note } : {}),
      };
  const soundLine = soundSaidOf(next);
  if (part.none) {
    await keepFileSound(digest.db, {
      tenantId: digest.row.tenant_id,
      id: digest.row.id,
      part: "none",
      value: true,
      by: null,
      said: soundLine,
    });
    return next;
  }
  for (const key of ["words", "note"] as const) {
    const value = part[key];
    if (value)
      await keepFileSound(digest.db, {
        tenantId: digest.row.tenant_id,
        id: digest.row.id,
        part: key,
        value,
        by,
        said: soundLine,
      });
  }
  return next;
}

/* --------------------------------------------------------------------------------------------------- the steps -- */

/** The sheet, its first poster, and the copy Anthropic reads it by. */
async function sheetStep(digest: Digest): Promise<void> {
  const keys = streamKeys();
  if (!keys) throw new Error("video_digest: Stream is not configured here");
  const plan = videoSheetPlanOf({
    seconds: Number(digest.row.seconds),
    width: digest.row.width,
    height: digest.row.height,
  });
  const alreadyMade = await madeOf(digest);
  if (!alreadyMade.has(FILE_MADE_OF_VIDEO.sheet)) {
    const sheet = await drawVideoSheet(keys.signing, digest.video, plan);
    if (!sheet) throw new Error("video_digest: Stream gave none of the sheet's frames");
    await keepMade(digest, "sheet", sheet.bytes);
  }
  if (!alreadyMade.has(FILE_MADE_OF_VIDEO.poster)) {
    const poster = await drawPoster(keys.signing, digest.video, plan.times[1] ?? plan.times[0] ?? 0);
    if (poster) await keepMade(digest, "poster", poster.bytes);
  }
  // The copy is the sheet's (look.ts claudeCopyOf, a video's branch): made now, or kept from a run before.
  const fresh = await findFileForWork(digest.db, digest.row.tenant_id, digest.row.id);
  if (!fresh || fresh.removed_at) return;
  if (!(await findClaudeCopy(digest.db, fresh))) throw new Error("video_digest: no copy of the sheet for the model");
}

/** The sound kept in the folder; `none` where Stream makes no sound for the clip. Answers the step after it. */
async function audioStep(digest: Digest, sound: FileSound): Promise<VideoDigestStep | null> {
  if (sound.none) return "look";
  if ((await madeOf(digest)).has(FILE_MADE_OF_VIDEO.audio)) return "words";
  const keys = streamKeys();
  if (!keys) throw new Error("video_digest: Stream is not configured here");
  // A clip with no sound track is said so by its playback list: Stream answers its audio download with a 500, never with none.
  const listToken = streamTokenOf(keys.signing, { uid: digest.row.media_ref ?? "", seconds: AUDIO_TOKEN_S });
  if ((await readStreamSoundTrack(keys.signing.customerCode, listToken)) === false) {
    logger({ tenant_id: digest.row.tenant_id }).info("video_no_sound", { file: digest.row.id });
    await keepSound(digest, sound, { none: true }, null);
    return "look";
  }
  let state = await askStreamAudio(keys.account, digest.row.media_ref ?? "");
  while (state.status === "inprogress" && msLeft(digest) > AUDIO_POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, AUDIO_POLL_MS));
    state = await readStreamAudio(keys.account, digest.row.media_ref ?? "");
  }
  if (state.status === "none") {
    logger({ tenant_id: digest.row.tenant_id }).info("video_no_sound", { file: digest.row.id });
    await keepSound(digest, sound, { none: true }, null);
    return "look";
  }
  // Not ready inside this run: the kind's retry asks again in two minutes.
  if (state.status !== "ready")
    throw new Error(`video_digest: the sound is not ready yet${state.status === "failed" ? ` (${state.error})` : ""}`);
  const token = streamTokenOf(keys.signing, {
    uid: digest.row.media_ref ?? "",
    seconds: AUDIO_TOKEN_S,
    downloadable: true,
  });
  const audio = await fetchStreamAudio(streamAudioUrl(keys.signing.customerCode, token));
  if (!audio.ok) throw new Error(`video_digest: the sound did not come: ${audio.error}`);
  await keepMade(digest, "audio", audio.bytes);
  return "words";
}

/** The sound kept in the folder, read for an ear. */
async function audioBytesOf(d: Digest): Promise<Uint8Array> {
  const read = await filesBucket(d.db).download(fileMadePathOf(d.row.tenant_id, d.row.id, "audio"));
  if (read.error || !read.data)
    throw new DbFailure(read.error ?? { message: "no answer" }, "video_digest: the kept sound could not be read");
  return new Uint8Array(await read.data.arrayBuffer());
}

/** The caption track, in the language spoken: a viewer's aid, so one that does not go is a line and no more. */
async function putCaptions(d: Digest, words: SoundWords): Promise<void> {
  const vtt = vttOf(words);
  const keys = streamKeys();
  if (!vtt || !keys || "none" in words) return;
  const put = await putStreamCaptions(keys.account, d.row.media_ref ?? "", { language: words.language ?? "en", vtt });
  if (!put) logger({ tenant_id: d.row.tenant_id }).warn("video_captions_failed", { file: d.row.id });
}

/** What is said: the one-call ear (which writes the note too) or Scribe. Answers the step after it. */
async function wordsStep(digest: Digest, sound: FileSound): Promise<VideoDigestStep> {
  if (sound.none) return "look";
  if (sound.words) return sound.note ? "look" : "note";
  const seconds = Number(digest.row.seconds);
  const audio = await audioBytesOf(digest);
  if (hearingSetup().words === "scribe") {
    const heard = await transcribe(digest.db, heardFor(digest.row), { seconds, audio, timeoutMs: msLeft(digest) });
    if (!heard.ok) {
      if (heard.retryable) throw new Error(`video_digest: the words were not heard: ${heard.why}`);
      return "note";
    }
    await keepSound(digest, sound, { words: heard.words }, heard.by);
    await putCaptions(digest, heard.words);
    return "note";
  }
  const heard = await hearNote(digest.db, heardFor(digest.row), {
    seconds,
    audio,
    withWords: true,
    timeoutMs: msLeft(digest),
  });
  if (!heard.ok) {
    if (heard.retryable) throw new Error(`video_digest: the words were not heard: ${heard.why}`);
    return "look";
  }
  await keepSound(
    digest,
    sound,
    { ...(heard.words ? { words: heard.words } : {}), ...(heard.note ? { note: heard.note } : {}) },
    heard.by,
  );
  if (heard.words) await putCaptions(digest, heard.words);
  return heard.note ? "look" : "note";
}

/** How it sounds, where the words' step did not write it. */
async function soundNoteStep(digest: Digest, sound: FileSound): Promise<void> {
  if (sound.none || sound.note) return;
  const audio = await audioBytesOf(digest);
  const heard = await hearNote(digest.db, heardFor(digest.row), {
    seconds: Number(digest.row.seconds),
    audio,
    withWords: false,
    timeoutMs: msLeft(digest),
  });
  if (!heard.ok) {
    if (heard.retryable) throw new Error(`video_digest: how it sounds was not heard: ${heard.why}`);
    return;
  }
  if (heard.note) await keepSound(digest, sound, { note: heard.note }, heard.by);
}

/* ----------------------------------------------------------------------------------------------------- the job -- */

/** The step after this one, scheduled at once: one step a run, the next due now. */
async function scheduleStep(db: Db, row: FileRow, step: VideoDigestStep): Promise<void> {
  await scheduleJobOnce(db, {
    tenantId: row.tenant_id,
    kind: "video_digest",
    dueAt: new Date(),
    payload: { file_id: row.id, step, edition: String(VIDEO_LOOK_EDITION) },
  });
}

/**
 * The step a video lacks, from what its row already holds: what the sweep schedules when a digest stopped short. The sheet's
 * copy says the sheet was made; the sound's parts say what was heard.
 */
function videoStepOf(row: Pick<FileRow, "claude_copy" | "sound">): VideoDigestStep {
  if (!row.claude_copy) return "sheet";
  const sound = fileSoundOf(row.sound);
  if (sound.none) return "look";
  if (!sound.words) return "audio";
  if (!sound.note) return "note";
  return "look";
}

export async function digestVideo(db: Db, job: ClaimedJob, deadline: number): Promise<void> {
  const step = job.payload.step;
  const fileId = String(job.payload.file_id);
  if (!isDigestStep(step)) {
    logger({ tenant_id: job.tenant_id }).warn("video_digest_unknown_step", { file: fileId });
    return;
  }
  const row = await findFileForWork(db, job.tenant_id, fileId);
  // A removed or never-ready video has nothing to make ready: the job is done.
  if (!row || row.removed_at || row.kind !== "video" || row.media_status !== "ready" || !row.media_ref) return;
  if (!(Number(row.seconds) > 0)) {
    // Stream's length is what the sheet is planned by: asked again where the webhook did not say it.
    const keys = streamKeys();
    const read = keys ? await readStreamVideo(keys.account, row.media_ref) : null;
    if (!read?.ok || !read.video.seconds) throw new Error("video_digest: the video's length is not known yet");
    row.seconds = read.video.seconds;
    // Kept on the row: known to this run alone, the page said no length and Ask's every closer look was refused as past the clip's end.
    await keepVideoSeconds(db, row.tenant_id, row.id, read.video.seconds);
  }
  const digest: Digest = {
    db,
    row,
    video: { mediaRef: row.media_ref, width: row.width, height: row.height },
    deadline,
  };
  const sound = fileSoundOf(row.sound);
  let next: VideoDigestStep | null;
  switch (step) {
    case "sheet":
      await sheetStep(digest);
      next = nextDigestStepOf(step);
      break;
    case "audio":
      next = await audioStep(digest, sound);
      break;
    case "words":
      next = await wordsStep(digest, sound);
      break;
    case "note":
      await soundNoteStep(digest, sound);
      next = nextDigestStepOf(step);
      break;
    case "look":
      await scheduleJobOnce(db, {
        tenantId: row.tenant_id,
        kind: "file_look",
        dueAt: new Date(),
        payload: { file_id: row.id, edition: String(VIDEO_LOOK_EDITION) },
      });
      next = null;
      break;
  }
  if (next) await scheduleStep(db, row, next);
}

/** The sweep's word for a video whose digest stopped short: its missing step, on the ledger. */
export const scheduleVideoStep = (db: Db, row: Pick<FileRow, "id" | "tenant_id" | "claude_copy" | "sound">) =>
  scheduleJobOnce(db, {
    tenantId: row.tenant_id,
    kind: "video_digest",
    dueAt: new Date(),
    payload: { file_id: row.id, step: videoStepOf(row), edition: String(VIDEO_LOOK_EDITION) },
  });
