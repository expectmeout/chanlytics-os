/**
 * The copies Ask reads pictures by (decision 0099, step 2): the dashboard holds no model key and never reads a copy's id, so it
 * asks here, by the file, and takes what comes back straight into the image blocks of a request. The copy is the one the look
 * already made, or made again where it has run out, and its size comes with it, so the model can be told the pixels it is
 * looking at and name a box in them. A file the model refused is not sent again: a refused picture in a request can refuse
 * the whole of it.
 *
 * A picture made for one turn (a box of a photo enlarged, a post drawn for Ask to look at before it is offered) comes as its
 * bytes, is kept at Anthropic for a day, past any live chain, and is written on no row: it is nobody's file.
 */
import { FILE_PICTURE_KEEP_S, UUID, isFileMime, FILE_COPIES_DOOR } from "@chanlytics/contracts";
import { uploadClaudeFile } from "@chanlytics/channels/ai";
import { imageHeaderOf } from "@chanlytics/core";
import { findFileForWork } from "@chanlytics/db/files";
import { readBody } from "../shared/admin-door.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { env } from "../shared/env.js";
import { json, refuse } from "../shared/http.js";
import { errField, logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import { findClaudeCopy } from "./look.js";

/** The most one call asks for: what one turn's question may carry. */
const COPIES_AT_ONCE = 10;
/** The most pictures one call brings, and how heavy each may be: a box of a photo at the model's size is a few hundred KB. */
const PICTURES_AT_ONCE = 4;
const PICTURE_BYTES_MOST = 2_500_000;

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
    const { key, bytes, mime, name } = p as Record<string, unknown>;
    if (typeof key !== "string" || !key || key.length > 40) return null;
    if (typeof bytes !== "string" || bytes.length > (PICTURE_BYTES_MOST * 4) / 3 + 4) return null;
    if (!isFileMime(mime) || typeof name !== "string" || !name || name.length > 120) return null;
    out.push({ key, bytes, mime, name });
  }
  return out;
}

/** One picture kept for a day, or why not: an id for the request, and the size the model will see. */
async function pictureKept(
  tenantId: string,
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
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string" && UUID.test(i)) : [];
  const pictures = picturesSent(body.pictures);
  if (!pictures)
    return refuse(400, "bad_request", `pictures: 1-${PICTURES_AT_ONCE}, each a key, bytes, a mime and a name`);
  if ((ids.length === 0 && pictures.length === 0) || ids.length > COPIES_AT_ONCE) {
    return refuse(400, "bad_request", `ids: 1-${COPIES_AT_ONCE} files`);
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");
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
  return json(200, { ok: true, copies, ...(pictures.length ? { pictures: kept } : {}) });
}
