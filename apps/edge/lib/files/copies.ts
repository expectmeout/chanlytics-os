/**
 * The copies Ask reads pictures by (decision 0099, step 2): the dashboard holds no model key and never reads a copy's id, so it
 * asks here, by the file, and takes what comes back straight into the image blocks of a request. The copy is the one the look
 * already made, or made again where it has run out, and its size comes with it, so the model can be told the pixels it is
 * looking at and name a box in them. A file the model refused is not sent again: a refused picture in a request can refuse
 * the whole of it.
 *
 * A picture made for one turn (a box of a photo enlarged, a post drawn for Ask to look at before it is offered) comes as its
 * bytes, is kept at Anthropic for a day, past any live chain, and is written on no row: it is nobody's file.
 *
 * A video's moments (stage B) are drawn here, where Stream's keys are: one moment whole, a box of one cut by the photo's rules,
 * or a stretch as a sheet of its own (video-sheet.ts), each kept at Anthropic for a day as a picture made for the turn is. A
 * video's own copy, which `ids` asks for, is its sheet.
 */
import {
  FILE_COPIES_DOOR,
  FILE_PICTURE_KEEP_S,
  UUID,
  isFileMime,
  secondsOf,
  videoSpanPlanOf,
  type ZoomBox,
  type ZoomSize,
  recordOrEmpty,
  isTenantId,
} from "@chanlytics/contracts";
import { uploadClaudeFile } from "@chanlytics/channels/ai";
import { imageHeaderOf } from "@chanlytics/core";
import { findFileForWork } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readBody } from "../shared/admin-door.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { env } from "../shared/env.js";
import { json, refuse } from "../shared/http.js";
import { errField, logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import { findClaudeCopy } from "./look.js";
import { drawMoment, drawMomentBox, drawVideoSheet, type Drawn } from "./video-sheet.js";
import { streamKeys } from "./video-keys.js";
import type { TenantId } from "@chanlytics/contracts";

/** The most one call asks for: what one turn's question may carry. */
const COPIES_AT_ONCE = 10;
/** The most pictures one call brings, and how heavy each may be: a box of a photo at the model's size is a few hundred KB. */
const PICTURES_AT_ONCE = 4;
const PICTURE_BYTES_MOST = 2_500_000;
/** The most of a video's moments one call draws: a moment, a box or a stretch is a few seconds of Stream's frames each. */
const MOMENTS_AT_ONCE = 2;

/** A video's moment as the dashboard asks for it: a moment (`at`), a box of one (`at`, `box`, `of`), or a stretch (`from`, `to`). */
interface MomentAsked {
  key: string;
  id: string;
  at: number | null;
  from: number | null;
  to: number | null;
  box: ZoomBox | null;
  of: ZoomSize | null;
}

const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0);
const isBox = (v: unknown): v is [number, number, number, number] =>
  Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));

const absent = (v: unknown): boolean => v === undefined || v === null;
const momentTimeOf = (v: unknown): number | null => (absent(v) ? null : secondsOf(v));

/** One moment as asked, or null where it is not one this door draws: a moment, a box of one, or a stretch, never two. */
function momentAsked(entry: unknown): MomentAsked | null {
  if (!entry || typeof entry !== "object") return null;
  const fields = recordOrEmpty(entry);
  if (
    typeof fields.key !== "string" ||
    !fields.key ||
    fields.key.length > 40 ||
    typeof fields.id !== "string" ||
    !UUID.test(fields.id)
  )
    return null;
  const [at, from, to] = [momentTimeOf(fields.at), momentTimeOf(fields.from), momentTimeOf(fields.to)];
  const box = absent(fields.box) ? null : isBox(fields.box) ? fields.box : undefined;
  const of = absent(fields.of) ? null : isPair(fields.of) ? fields.of : undefined;
  if (box === undefined || of === undefined) return null;
  const span = from !== null && to !== null;
  if (span === (at !== null) || (box !== null) !== (of !== null) || (box !== null && at === null)) return null;
  return { key: fields.key, id: fields.id, at, from, to, box, of };
}

function momentsAsked(raw: unknown): MomentAsked[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MOMENTS_AT_ONCE) return null;
  const out = raw.map(momentAsked);
  return out.every((m): m is MomentAsked => m !== null) ? out : null;
}

type MomentKept = {
  key: string;
  file_id: string | null;
  width?: number;
  height?: number;
  wont?: string;
  box?: ZoomBox;
  of?: ZoomSize;
  from?: number;
  to?: number;
  step?: number;
  frames?: number;
};

/** A drawn picture kept at Anthropic for a day, or why not. */
async function drawnKept(tenantId: TenantId, key: string, name: string, drawn: Drawn): Promise<MomentKept> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return { key, file_id: null, wont: "no model key" };
  const up = await uploadClaudeFile(apiKey, {
    bytes: new Uint8Array(drawn.bytes),
    mime: "image/jpeg",
    name,
    expiresInSeconds: FILE_PICTURE_KEEP_S,
  });
  if (!up.ok) {
    logger({ tenant_id: tenantId }).warn("file_copy_failed", { file: key, why: "upload", error: up.error });
    return { key, file_id: null, wont: "it could not be shown just now" };
  }
  return { key, file_id: up.id, width: drawn.width, height: drawn.height };
}

/** One of a video's moments, drawn and kept for the turn, or the words that say why not. */
async function momentKept(db: SupabaseClient<Database>, tenantId: TenantId, moment: MomentAsked): Promise<MomentKept> {
  const none = (wont: string): MomentKept => ({ key: moment.key, file_id: null, wont });
  const keys = streamKeys();
  if (!keys) return none("videos are not set up here");
  const row = await findFileForWork(db, tenantId, moment.id);
  if (!row || row.removed_at || row.kind !== "video" || !row.media_ref) return none("no such video");
  if (row.media_status !== "ready") return none("it is still being made ready");
  const seconds = Number(row.seconds) || 0;
  const video = { mediaRef: row.media_ref, width: row.width, height: row.height };
  const past = (t: number) => t > seconds;
  if (moment.from !== null && moment.to !== null) {
    if (past(Math.min(moment.from, moment.to))) return none(`the clip is ${Math.round(seconds)} seconds long`);
    const plan = videoSpanPlanOf({ seconds, width: row.width, height: row.height, from: moment.from, to: moment.to });
    const drawn = await drawVideoSheet(keys.signing, video, plan);
    if (!drawn) return none("Stream gave none of that stretch's frames just now");
    const stored = await drawnKept(tenantId, moment.key, `${row.id}-span.jpg`, drawn);
    return { ...stored, from: plan.from, to: plan.to, step: plan.step, frames: plan.times.length };
  }
  const at = moment.at ?? 0;
  if (past(at)) return none(`the clip is ${Math.round(seconds)} seconds long`);
  if (moment.box && moment.of) {
    const cut = await drawMomentBox(keys.signing, video, { at, box: moment.box, of: moment.of });
    if ("wont" in cut) return none(cut.wont);
    const stored = await drawnKept(tenantId, moment.key, `${row.id}-box.jpg`, cut);
    return { ...stored, box: cut.box, of: cut.of };
  }
  const drawn = await drawMoment(keys.signing, video, at);
  if (!drawn) return none("Stream gave no frame at that moment just now");
  return drawnKept(tenantId, moment.key, `${row.id}-moment.jpg`, drawn);
}

/** A picture as the dashboard sends it: its bytes in base64, what it is, and a name for Anthropic's listing. */
interface PictureSent {
  key: string;
  bytes: string;
  mime: string;
  name: string;
}

function picturesSent(raw: unknown): PictureSent[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > PICTURES_AT_ONCE) return null;
  const out: PictureSent[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") return null;
    const { key, bytes, mime, name } = recordOrEmpty(p);
    if (typeof key !== "string" || !key || key.length > 40) return null;
    if (typeof bytes !== "string" || bytes.length > (PICTURE_BYTES_MOST * 4) / 3 + 4) return null;
    if (!isFileMime(mime) || typeof name !== "string" || !name || name.length > 120) return null;
    out.push({ key, bytes, mime, name });
  }
  return out;
}

/** One picture kept for a day, or why not: an id for the request, and the size the model will see. */
async function pictureKept(
  tenantId: TenantId,
  pictureSent: PictureSent,
): Promise<{ key: string; file_id: string | null; width: number | null; height: number | null }> {
  const none = { key: pictureSent.key, file_id: null, width: null, height: null };
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return none;
  const bytes = new Uint8Array(Buffer.from(pictureSent.bytes, "base64"));
  const head = imageHeaderOf(bytes);
  if (!head || head.contentType !== pictureSent.mime || bytes.byteLength > PICTURE_BYTES_MOST) {
    logger({ tenant_id: tenantId }).warn("file_copy_failed", { file: pictureSent.key, why: "picture" });
    return none;
  }
  const up = await uploadClaudeFile(key, {
    bytes,
    mime: head.contentType,
    name: pictureSent.name,
    expiresInSeconds: FILE_PICTURE_KEEP_S,
  });
  if (!up.ok) {
    logger({ tenant_id: tenantId }).warn("file_copy_failed", { file: pictureSent.key, why: "upload", error: up.error });
    return none;
  }
  return { key: pictureSent.key, file_id: up.id, width: head.width, height: head.height };
}

export async function listFileCopies(auth: Admitted, request: Request): Promise<Response> {
  const body = await readBody(request, FILE_COPIES_DOOR);
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!isTenantId(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string" && UUID.test(i)) : [];
  const pictures = picturesSent(body.pictures);
  if (!pictures)
    return refuse(400, "bad_request", `pictures: 1-${PICTURES_AT_ONCE}, each a key, bytes, a mime and a name`);
  const moments = momentsAsked(body.moments);
  if (!moments)
    return refuse(
      400,
      "bad_request",
      `moments: 1-${MOMENTS_AT_ONCE}, each a key, a video's id, and at (with box and of), or from and to`,
    );
  if ((ids.length === 0 && pictures.length === 0 && moments.length === 0) || ids.length > COPIES_AT_ONCE) {
    return refuse(400, "bad_request", `ids: 1-${COPIES_AT_ONCE} files`);
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const drawn = Promise.all(
    moments.map((m) =>
      momentKept(db, tenantId, m).catch((e: unknown) => {
        logger({ tenant_id: tenantId }).warn("file_copy_failed", { file: m.key, why: "moment", error: errField(e) });
        return { key: m.key, file_id: null, wont: "it could not be drawn just now" } satisfies MomentKept;
      }),
    ),
  );
  const [copies, kept] = await Promise.all([
    Promise.all(
      ids.map(async (id) => {
        try {
          const row = await findFileForWork(db, tenantId, id);
          if (!row || row.removed_at || row.look_status === "refused") return { id, file_id: null };
          const copy = await findClaudeCopy(db, row);
          return copy ? { id, file_id: copy.id, width: copy.width, height: copy.height } : { id, file_id: null };
        } catch (e) {
          logger({ tenant_id: tenantId }).warn("file_copy_failed", { file: id, why: "door", error: errField(e) });
          return { id, file_id: null };
        }
      }),
    ),
    Promise.all(pictures.map((p) => pictureKept(tenantId, p))),
  ]);
  const momentsKept = await drawn;
  return json(200, {
    ok: true,
    copies,
    ...(pictures.length ? { pictures: kept } : {}),
    ...(moments.length ? { moments: momentsKept } : {}),
  });
}
