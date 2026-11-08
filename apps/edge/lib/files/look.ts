/**
 * The look at a business's file (decision 0099): each read by the small model. The key is here, so the copy the model reads is
 * made here too: Storage resizes the original and answers its bytes, we read the size they came back at, and Anthropic keeps
 * them for 90 days under an id only this edge holds. A file past that is uploaded again when it is next read.
 *
 * Words in a picture are data: the look's answer is read in code (contracts fileLookOf), and none of it reaches a prompt here.
 * No answer is no harm: the file stays usable under the name it came with, and the sweep (upkeep.ts) tries a young one again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAY_MS,
  FILE_COPY_KEEP_S,
  FILE_COPY_SIDE,
  FILE_LOOK_EDITION,
  FILE_LOOK_PLAIN_HINT,
  FILE_LOOK_SCHEMA,
  FILE_LOOK_SYSTEM,
  FILE_MADE_OF_VIDEO_MIMES,
  FILE_VIDEO_LOOK_SCHEMA,
  SECOND_MS,
  VIDEO_LOOK_EDITION,
  fileLookAsked,
  fileLookOf,
  fileMadePathOf,
  filePathOf,
  fileSoundOf,
  fileVideoLookAsked,
  fileVideoLookOf,
  parseTenantConfig,
  soundTurnSaidOf,
  videoSheetPlanOf,
  type FileLookRead,
  type FileMime,
} from "@chanlytics/contracts";
import { deleteClaudeFile, uploadClaudeFile } from "@chanlytics/channels/ai";
import { imageHeaderOf } from "@chanlytics/core";
import { findFileForWork, keepFileLook, filesBucket, keepClaudeCopy, type FileRow } from "@chanlytics/db/files";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob } from "@chanlytics/jobs";
import { askJson, firstJson, mayModelGo, promptHashOf, type ModelCallFor } from "../ai/model.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import { drawPoster } from "./video-sheet.js";
import { streamKeys } from "./video-keys.js";

type Db = SupabaseClient<Database>;

/** A copy's address is asked for only as long as it takes to read it. */
const COPY_URL_S = 60;
const COPY_READ_MS = 8 * SECOND_MS;
/** Storage's default quality is 80: the model reads small print on a menu better from a little more. */
const COPY_QUALITY = 90;
/** The whole look, its fallback's try included: two tries of the route's fifteen seconds. */
const LOOK_WHOLE_MS = 30 * SECOND_MS;
/** Enough for a dense price list's words, which are the likeliest answer to be cut and lost. Only what is used costs. */
const LOOK_TOKENS_MAX = 2000;
/** How much of what a business sells the look is told. */
const SERVICES_TOLD = 20;

/** The copy as a row keeps it. */
interface ClaudeCopy {
  id: string;
  expires_at: string | null;
  width: number;
  height: number;
}

function heldCopyOf(row: FileRow, nowMs: number): ClaudeCopy | null {
  const c = row.claude_copy as Partial<ClaudeCopy> | null;
  if (!c || typeof c.id !== "string" || typeof c.width !== "number" || typeof c.height !== "number") return null;
  // A day short of its end: a read must not start on a copy about to go.
  if (typeof c.expires_at === "string" && Date.parse(c.expires_at) - nowMs < DAY_MS) return null;
  return { id: c.id, expires_at: c.expires_at ?? null, width: c.width, height: c.height };
}

/**
 * The copy the model reads, made now where there is none: null where Storage or Anthropic would not, for the caller. A video's
 * is its sheet (video-digest.ts), read from its folder as it was drawn, already at the size the model reads: never Stream again.
 */
export async function findClaudeCopy(db: Db, row: FileRow): Promise<ClaudeCopy | null> {
  const heldCopy = heldCopyOf(row, Date.now());
  if (heldCopy) return heldCopy;
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const signed =
    row.kind === "video"
      ? await filesBucket(db).createSignedUrl(fileMadePathOf(row.tenant_id, row.id, "sheet"), COPY_URL_S)
      : await filesBucket(db).createSignedUrl(filePathOf(row.tenant_id, row.id, row.mime), COPY_URL_S, {
          transform: { width: FILE_COPY_SIDE, height: FILE_COPY_SIDE, resize: "contain", quality: COPY_QUALITY },
        });
  if (signed.error || !signed.data?.signedUrl) {
    logger({ tenant_id: row.tenant_id }).warn("file_copy_failed", { file: row.id, why: "sign" });
    return null;
  }
  const res = await fetch(signed.data.signedUrl, {
    headers: row.kind === "video" ? {} : { accept: "image/webp" },
    signal: AbortSignal.timeout(COPY_READ_MS),
  });
  const bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  const head = bytes ? imageHeaderOf(bytes) : null;
  if (!bytes || !head) {
    logger({ tenant_id: row.tenant_id }).warn("file_copy_failed", { file: row.id, why: "read", status: res.status });
    return null;
  }
  const up = await uploadClaudeFile(key, {
    bytes,
    mime: head.contentType,
    name: `${row.id}.${head.kind}`,
    expiresInSeconds: FILE_COPY_KEEP_S,
  });
  if (!up.ok) {
    logger({ tenant_id: row.tenant_id }).warn("file_copy_failed", { file: row.id, why: "upload", error: up.error });
    return null;
  }
  const copy = { id: up.id, expires_at: up.expiresAt, width: head.width, height: head.height };
  // Removed while it went up: the purge saw no copy to let go, so it is let go here or it stays for 90 days.
  if (!(await keepClaudeCopy(db, row.tenant_id, row.id, copy))) {
    await deleteClaudeFile(key, up.id);
    return null;
  }
  return copy;
}

/** What the look is told of the business: its name, and its services in its own words. */
async function lookBusinessOf(db: Db, tenantId: string): Promise<{ business: string; services: string[] }> {
  const result = await findWorkspaceNameAndConfig(db, tenantId);
  const services = parseTenantConfig(result.config)?.brain?.profile?.services ?? [];
  return {
    business: result.name?.trim() || "a local business",
    services: services
      .map((s) => s.name)
      .filter(Boolean)
      .slice(0, SERVICES_TOLD),
  };
}

/**
 * file_look: one file read, and what it saw kept. A call that may not go (a paused workspace, a banned person) costs nothing
 * and is no failure of ours: the file says it wasn't read, and the sweep brings it back. A try worth repeating throws; a
 * refusal is an answer. It goes under whoever added the file, so one person's picture falls on their own profile, and an
 * import that nobody asked for by name stays the workspace's.
 */
export async function lookAtFile(db: Db, job: ClaimedJob, deadline: number): Promise<void> {
  const fileId = String(job.payload.file_id);
  const row = await findFileForWork(db, job.tenant_id, fileId);
  if (!row || row.removed_at) return;
  if (row.kind === "video") return row.media_status === "ready" ? lookAtVideo(db, job, row, deadline) : undefined;
  const notRead = () =>
    keepFileLook(db, {
      tenantId: job.tenant_id,
      id: fileId,
      status: "failed",
      edition: FILE_LOOK_EDITION,
      look: null,
      name: null,
      shows: null,
    });
  const asking: ModelCallFor = {
    tenantId: job.tenant_id,
    userId: row.created_by,
    subjectId: fileId,
    promptHash: promptHashOf(FILE_LOOK_SYSTEM),
  };
  if (!(await mayModelGo("file_look", asking))) return notRead();
  const copy = await findClaudeCopy(db, row);
  if (!copy) throw new Error("file_look: no copy to read");
  const about = await lookBusinessOf(db, job.tenant_id);
  const ms = Math.min(LOOK_WHOLE_MS, deadline - Date.now());
  if (ms <= 0) throw new Error("file_look: no time left for the look");
  const answered = await askJson({
    purpose: "file_look",
    system: FILE_LOOK_SYSTEM,
    user: [
      { type: "image", source: { type: "file", file_id: copy.id }, transformations: { oversized_image: "error" } },
      { type: "text", text: fileLookAsked({ width: copy.width, height: copy.height, ...about }) },
    ],
    schema: FILE_LOOK_SCHEMA,
    maxTokens: LOOK_TOKENS_MAX,
    effort: "low",
    plainJsonHint: FILE_LOOK_PLAIN_HINT,
    timeoutMs: ms,
    deadlineMs: ms,
    signal: AbortSignal.timeout(ms),
    for: {
      ...asking,
      // An answer with no sentence in it was paid for and is no use: the ledger says so. A refusal says so itself.
      unreadable: (reply) => reply.message.stop_reason !== "refusal" && !fileLookOf(firstJson(reply.text), copy),
    },
  });
  if (!answered) return notRead();
  const read = fileLookOf(answered.answer, { width: copy.width, height: copy.height });
  await keepFileLook(db, {
    tenantId: job.tenant_id,
    id: fileId,
    status: read ? "done" : answered.refused ? "refused" : "failed",
    edition: FILE_LOOK_EDITION,
    look: read?.look ?? null,
    name: read?.name || null,
    shows: read?.shows ?? null,
  });
}

/**
 * A video's look (stage B): the same small model and catalog, the sheet as the picture, what other models heard of its sound
 * beside it as data, and the frame that best stands for the clip in place of a box. Its edition is the video's own, so a change
 * to one prompt never reads the other's files again. The poster is cut again at the frame it chose; one that does not come
 * leaves the first.
 */
async function lookAtVideo(db: Db, job: ClaimedJob, row: FileRow, deadline: number): Promise<void> {
  const keep = (status: "done" | "refused" | "failed", read: FileLookRead | null) =>
    keepFileLook(db, {
      tenantId: job.tenant_id,
      id: row.id,
      status,
      edition: VIDEO_LOOK_EDITION,
      look: read?.look ?? null,
      name: read?.name || null,
      shows: read?.shows ?? null,
    });
  const asking: ModelCallFor = {
    tenantId: job.tenant_id,
    userId: row.created_by,
    subjectId: row.id,
    promptHash: promptHashOf(FILE_LOOK_SYSTEM),
  };
  if (!(await mayModelGo("file_look", asking))) return keep("failed", null);
  const copy = await findClaudeCopy(db, row);
  if (!copy) throw new Error("file_look: no copy of the sheet to read");
  const plan = videoSheetPlanOf({ seconds: Number(row.seconds), width: row.width, height: row.height });
  const sound = fileSoundOf(row.sound);
  const heard = sound.none || sound.words || sound.note ? soundTurnSaidOf(sound, { for: "look" }) : null;
  const about = await lookBusinessOf(db, job.tenant_id);
  const ms = Math.min(LOOK_WHOLE_MS, deadline - Date.now());
  if (ms <= 0) throw new Error("file_look: no time left for the look");
  const answered = await askJson({
    purpose: "file_look",
    system: FILE_LOOK_SYSTEM,
    user: [
      { type: "image", source: { type: "file", file_id: copy.id }, transformations: { oversized_image: "error" } },
      {
        type: "text",
        text: fileVideoLookAsked({
          seconds: Number(row.seconds),
          frames: plan.times.length,
          step: plan.step,
          width: copy.width,
          height: copy.height,
          ...about,
          sound: heard,
        }),
      },
    ],
    schema: FILE_VIDEO_LOOK_SCHEMA,
    maxTokens: LOOK_TOKENS_MAX,
    effort: "low",
    plainJsonHint: FILE_LOOK_PLAIN_HINT,
    timeoutMs: ms,
    deadlineMs: ms,
    signal: AbortSignal.timeout(ms),
    for: {
      ...asking,
      unreadable: (reply) => reply.message.stop_reason !== "refusal" && !fileVideoLookOf(firstJson(reply.text), plan),
    },
  });
  if (!answered) return keep("failed", null);
  const read = fileVideoLookOf(answered.answer, plan);
  await keep(read ? "done" : answered.refused ? "refused" : "failed", read);
  const at = read?.look.poster_at;
  const keys = streamKeys();
  if (typeof at !== "number" || !keys || !row.media_ref) return;
  const poster = await drawPoster(keys.signing, { mediaRef: row.media_ref, width: row.width, height: row.height }, at);
  const stored = poster
    ? await filesBucket(db).upload(fileMadePathOf(row.tenant_id, row.id, "poster"), poster.bytes, {
        contentType: FILE_MADE_OF_VIDEO_MIMES.poster,
        upsert: true,
      })
    : null;
  if (!stored || stored.error) logger({ tenant_id: row.tenant_id }).warn("video_poster_failed", { file: row.id });
}
