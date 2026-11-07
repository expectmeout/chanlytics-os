/**
 * The dashboard's three knocks for a business's videos (decision 0099, stage B). The dashboard holds no Stream token and no
 * ear's key, so it asks here, for the member it names and the workspace its token names:
 *
 *   video-start  a reservation at Stream for the browser's own upload, and the row made with every fact the browser gave
 *                (00556 file_video_begin), so Stream's word alone can finish it. A workspace whose switch is off (D11) is
 *                answered so before Stream is asked; a twin or no room is answered as such, and the reservation let go.
 *   play         the player's address under a token for that member's session, an hour, for one video; the poster ours.
 *   listen       Ask's question about a stretch of the clip, put to the ear with the sound kept in the file's folder.
 *
 * Nothing a member could use to reach another workspace's video leaves here: Stream's id stays on the row and in the token.
 */
import {
  FILE_VIDEO_BYTES_MAX,
  FILE_VIDEO_SECONDS_MAX,
  HOUR_MS,
  SECOND_MS,
  UUID,
  fileMadePathOf,
  fileSoundOf,
  isVideoMime,
  secondsOf,
  videoPreviewOf,
  type DoorRead,
  type FILE_LISTEN_DOOR,
  type FILE_PLAY_DOOR,
  type FILE_VIDEO_START_DOOR,
} from "@chanlytics/contracts";
import { deleteStreamVideo, reserveStreamUpload, streamPlayerUrl, streamTokenOf } from "@chanlytics/channels/files";
import { beginFileVideo, findFileForWork, filesBucket } from "@chanlytics/db/files";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import { workspaceOf } from "../shared/admin-door.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { errField, logger } from "../shared/log.js";
import { LISTEN_MS, listenTo } from "./hearing.js";
import { streamKeys } from "./video-keys.js";

/** How long an upload's address lives: a slow phone sends 500 MB inside it, and a reload within it resumes. */
const UPLOAD_LIFE_MS = 4 * HOUR_MS;
/** A clip's reservation holds it to its length and a tenth more (a browser's reading of it is not Stream's). */
const LENGTH_SLACK = 1.1;
/** A player's token: one sheet opened, an hour. */
const PLAY_TOKEN_S = 60 * 60;
/** A question's words, as Ask may send them. */
const QUESTION_MOST = 600;

const isFingerprint = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/** POST /api/admin/files/video-start: a reservation, and the row. */
export async function startVideoUpload(
  auth: Admitted,
  body: DoorRead<typeof FILE_VIDEO_START_DOOR>,
): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const at = workspaceOf(ws.tenantId);
  if (!at.ok) return at.response;
  const { db, tenantId } = at;
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  const bytes = typeof body.bytes === "number" && Number.isInteger(body.bytes) ? body.bytes : 0;
  const seconds = body.seconds === null || body.seconds === undefined ? null : secondsOf(body.seconds);
  if (
    !id ||
    !name ||
    !isVideoMime(body.mime) ||
    bytes < 1 ||
    bytes > FILE_VIDEO_BYTES_MAX ||
    !isFingerprint(body.fingerprint)
  )
    return refuse(400, "bad_request", "id, name, a video's mime, its bytes and its fingerprint are required");
  if (seconds !== null && seconds > FILE_VIDEO_SECONDS_MAX) return json(200, { ok: true, fate: "too_long" });
  // The switch (D11), read here: the workspace's config is the service role's to read, not a member's.
  const takesVideos = await findWorkspaceNameAndConfig(db, tenantId)
    .then(({ config }) => videoPreviewOf(config))
    .catch(() => null);
  if (takesVideos === null) return refuse(503, "no_database");
  if (!takesVideos) return json(200, { ok: true, fate: "off" });
  const keys = streamKeys();
  if (!keys) return refuse(503, "no_provider_key", "videos are not set up on this deployment");
  const log = logger({ tenant_id: tenantId });
  const reserved = await reserveStreamUpload(keys.account, {
    bytes,
    maxDurationSeconds: seconds
      ? Math.min(FILE_VIDEO_SECONDS_MAX, Math.ceil(seconds * LENGTH_SLACK))
      : FILE_VIDEO_SECONDS_MAX,
    expiresAt: new Date(Date.now() + UPLOAD_LIFE_MS),
    name: id,
  });
  if (!reserved.ok) {
    log.warn("video_reserve_failed", { file: id, error: reserved.error, full: reserved.full });
    return json(200, { ok: true, fate: reserved.full ? "account_full" : "unreachable" });
  }
  const letGo = async (reason: string) => {
    if (!(await deleteStreamVideo(keys.account, reserved.mediaRef)))
      log.warn("video_reservation_kept", { file: id, why: reason });
  };
  try {
    const begun = await beginFileVideo(db, {
      tenantId,
      id,
      mediaRef: reserved.mediaRef,
      name,
      mime: body.mime,
      bytes,
      fingerprint: body.fingerprint,
      seconds,
      actor: auth.user,
    });
    // An earlier asking made the row with a reservation of its own: this one is let go, and the browser asks again.
    if (begun.fate === "kept" && begun.media_ref && begun.media_ref !== reserved.mediaRef) {
      await letGo("asked twice");
      return json(200, { ok: true, fate: "unreachable" });
    }
    if (begun.fate !== "kept") {
      await letGo(begun.fate);
      return json(200, { ok: true, fate: begun.fate, file_id: begun.file_id });
    }
    log.info("video_started", { file: id, bytes, seconds });
    return json(200, { ok: true, fate: "kept", file_id: id, upload_url: reserved.uploadUrl });
  } catch (e) {
    log.error("video_start_failed", { file: id, error: errField(e) });
    await letGo("door");
    return refuse(503, "no_database");
  }
}

/** A video the member's workspace keeps, playable, or the refusal that says why not. */
async function playableOf(db: Parameters<typeof findFileForWork>[0], tenantId: string, id: unknown) {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const row = await findFileForWork(db, tenantId, id);
  return row && !row.removed_at && row.kind === "video" && row.media_status === "ready" && row.media_ref ? row : null;
}

/** POST /api/admin/files/play: the player's address for one video, under an hour's token, its poster and captions ours. */
export async function signVideoPlay(auth: Admitted, body: DoorRead<typeof FILE_PLAY_DOOR>): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const at = workspaceOf(ws.tenantId);
  if (!at.ok) return at.response;
  const row = await playableOf(at.db, at.tenantId, body.id);
  if (!row?.media_ref) return refuse(404, "not_found", "no playable video by that id");
  const keys = streamKeys();
  if (!keys) return refuse(503, "no_provider_key", "videos are not set up on this deployment");
  const token = streamTokenOf(keys.signing, { uid: row.media_ref, seconds: PLAY_TOKEN_S });
  // The player is Stream's page, so the poster is a signed address of our own still, which it can fetch without a session.
  const poster = await filesBucket(at.db).createSignedUrl(
    fileMadePathOf(row.tenant_id, row.id, "poster"),
    PLAY_TOKEN_S,
  );
  const words = fileSoundOf(row.sound).words;
  const captions = words && !("none" in words) && words.cues.length ? (words.language ?? "en") : null;
  return json(200, {
    ok: true,
    player_url: streamPlayerUrl(keys.signing.customerCode, token, {
      poster: poster.data?.signedUrl ?? null,
      captions,
    }),
    expires_at: new Date(Date.now() + PLAY_TOKEN_S * 1000).toISOString(),
  });
}

/** POST /api/admin/files/listen: Ask's question about a stretch, put to the ear; the answer is data, the dashboard fences it. */
export async function listenToVideo(auth: Admitted, body: DoorRead<typeof FILE_LISTEN_DOOR>): Promise<Response> {
  const started = Date.now();
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const at = workspaceOf(ws.tenantId);
  if (!at.ok) return at.response;
  const question = typeof body.question === "string" ? body.question.trim().slice(0, QUESTION_MOST) : "";
  if (!question) return refuse(400, "bad_request", "a question is required");
  const row = await playableOf(at.db, at.tenantId, body.id);
  if (!row) return refuse(404, "not_found", "no playable video by that id");
  const seconds = Number(row.seconds) || 0;
  const from = body.from === undefined || body.from === null ? null : secondsOf(body.from);
  const to = body.to === undefined || body.to === null ? null : secondsOf(body.to);
  if ((from !== null && from > seconds) || (from !== null && to !== null && to < from))
    return json(200, {
      ok: true,
      wont: `that stretch is not inside the clip, which is ${Math.round(seconds)} seconds long`,
    });
  if (fileSoundOf(row.sound).none) return json(200, { ok: true, wont: "the clip has no sound" });
  const read = await filesBucket(at.db).download(fileMadePathOf(row.tenant_id, row.id, "audio"));
  if (read.error || !read.data)
    return json(200, { ok: true, wont: "its sound is not kept yet; it is still being made ready" });
  const audio = new Uint8Array(await read.data.arrayBuffer());
  const heard = await listenTo(
    at.db,
    { tenantId: at.tenantId, fileId: row.id, userId: auth.user },
    {
      seconds,
      audio,
      question,
      from,
      to: to === null ? null : Math.min(to, seconds),
      timeoutMs: Math.max(SECOND_MS, LISTEN_MS - (Date.now() - started)),
    },
  );
  if (!heard.ok)
    return json(200, {
      ok: true,
      wont: heard.held ? "no ear can be asked just now" : "the ear did not answer just now",
    });
  return json(200, { ok: true, answer: heard.answer, model: heard.by.model });
}
