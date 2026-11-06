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
  SECOND_MS,
  fileLookAsked,
  fileLookOf,
  filePathOf,
  parseTenantConfig,
  type FileMime,
} from "@chanlytics/contracts";
import { deleteClaudeFile, uploadClaudeFile } from "@chanlytics/channels";
import { imageHeaderOf } from "@chanlytics/core";
import {
  fileForWork,
  fileLookKeep,
  filesBucket,
  keepClaudeCopy,
  workspaceNameAndConfig,
  type Database,
  type FileRow,
} from "@chanlytics/db";
import type { ClaimedJob } from "@chanlytics/jobs";
import { askJson, firstJson, modelMayGo, promptHashOf, type ModelCallFor } from "../ai/model.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";

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

/** The copy the model reads, made now where there is none: null where Storage or Anthropic would not, for the caller. */
export async function claudeCopyOf(db: Db, row: FileRow): Promise<ClaudeCopy | null> {
  const held = heldCopyOf(row, Date.now());
  if (held) return held;
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const signed = await filesBucket(db).createSignedUrl(
    filePathOf(row.tenant_id, row.id, row.mime as FileMime),
    COPY_URL_S,
    { transform: { width: FILE_COPY_SIDE, height: FILE_COPY_SIDE, resize: "contain", quality: COPY_QUALITY } },
  );
  if (signed.error || !signed.data?.signedUrl) {
    logger({ tenant_id: row.tenant_id }).warn("file_copy_failed", { file: row.id, why: "sign" });
    return null;
  }
  const res = await fetch(signed.data.signedUrl, {
    headers: { accept: "image/webp" },
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
  const w = await workspaceNameAndConfig(db, tenantId);
  const services = parseTenantConfig(w.config)?.brain?.profile?.services ?? [];
  return {
    business: w.name?.trim() || "a local business",
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
  const row = await fileForWork(db, job.tenant_id, fileId);
  if (!row || row.removed_at) return;
  const notRead = () =>
    fileLookKeep(db, {
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
  if (!(await modelMayGo("file_look", asking))) return notRead();
  const copy = await claudeCopyOf(db, row);
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
  await fileLookKeep(db, {
    tenantId: job.tenant_id,
    id: fileId,
    status: read ? "done" : answered.refused ? "refused" : "failed",
    edition: FILE_LOOK_EDITION,
    look: read?.look ?? null,
    name: read?.name || null,
    shows: read?.shows ?? null,
  });
}
