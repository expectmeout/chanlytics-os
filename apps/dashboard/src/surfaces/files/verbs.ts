/**
 * Settings › Files' doors (decision 0099). An upload is three steps: asked for at the door (`files/start`), sent straight
 * to storage over the address it answered, and proven by the server (`files/[id]/done`). A function could not carry 25 MB,
 * so the bytes never pass through one. A phone's signal drops, so the two steps that can be asked again are, a few times, and
 * the third is what says whether anything arrived. An object the pane imports, so a test stands a door in by assigning onto it.
 *
 * A video (stage B) is the same three steps, its bytes sent to Stream over tus (video-send.ts) and proven there: everything
 * the browser knows of it goes with the first step, so Stream's word alone finishes it, and `done` only says they have all gone.
 */
import {
  FILE_BYTES_MAX,
  FILE_CACHE_S,
  FILE_VIDEO_BYTES_MAX,
  FILE_VIDEO_SECONDS_MAX,
  FILE_WORDS as W,
  SECOND_MS,
  fileViewOf,
  isFileMime,
  isVideoMime,
  recordOrEmpty,
  type FileMime,
  type FileShows,
  type FileVideoMime,
  type InstagramPostKind,
  type PostPlace,
  type PiecePlan,
  type PostPicture,
  type PostPlan,
  type PostShapeName,
} from "@chanlytics/contracts";
import { api } from "@/bridge/api";

/**
 * What a picker offers, a HEIC by its name too. Asked for only JPEG, a phone converts by itself; what an iPhone hands over
 * when asked for HEIC as well is what the first real uploads will show, and the server takes either.
 */
export const FILE_PICKS = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
/** And with videos, where the workspace takes them: a phone's own clips (MP4, an iPhone's MOV) and a browser's recording (WebM). */
export const FILE_PICKS_WITH_VIDEO = `${FILE_PICKS},video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm`;

/** How long to wait before each new try: a phone between masts is back in seconds. */
const SEND_AGAIN_AFTER_MS = [3 * SECOND_MS, 10 * SECOND_MS] as const;
const DONE_AGAIN_AFTER_MS = [2 * SECOND_MS, 5 * SECOND_MS, 10 * SECOND_MS] as const;
/** How long a post's picture is waited for: a photo read and a drawing, on a slow day. */
const POST_PICTURE_MS = 30 * SECOND_MS;

const waited = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What one photo or video came to: kept, already kept (`id` is then the one it twins), or the words that refused it. */
export type AddSaid = { kept: true; twin: boolean; id: string; video?: boolean } | { kept: false; message: string };

/** By its name, where a browser names no type: a desk's HEIC, and some a MOV or a WebM. */
const KIND_BY_NAME: readonly [RegExp, FileMime][] = [
  [/\.(heic|heif)$/i, "image/heic"],
  [/\.mov$/i, "video/quicktime"],
  [/\.mp4$/i, "video/mp4"],
  [/\.webm$/i, "video/webm"],
];

/** A kind by what the file calls itself: a desk browser names no type for a HEIC, and a phone always does. */
export function mimeOf(file: File): FileMime | null {
  if (isFileMime(file.type)) return file.type;
  return file.type ? null : (KIND_BY_NAME.find(([name]) => name.test(file.name))?.[1] ?? null);
}

/** How often a photo's progress is said at most, so a fast line does not draw the grid for every packet. */
const SENT_STEP = 0.02;

/**
 * The PUT itself. A fetch can't say how far an upload has gone in every browser, so one that wants to know goes by XMLHttpRequest, and
 * one that does not, or a browser with none, by fetch: the same request, read the same way.
 */
function putBytes(
  address: string,
  form: FormData,
  onSent?: (sent: number) => void,
): Promise<{ ok: boolean; status: number }> {
  const headers = { "x-upsert": "false" };
  if (!onSent || typeof XMLHttpRequest === "undefined")
    return window.fetch(address, { method: "PUT", body: form, headers });
  return new Promise((resolve, reject) => {
    const put = new XMLHttpRequest();
    let sentBytes = 0;
    put.open("PUT", address);
    for (const [name, value] of Object.entries(headers)) put.setRequestHeader(name, value);
    put.upload.onprogress = (e) => {
      if (!e.lengthComputable || e.total === 0) return;
      const sent = e.loaded / e.total;
      if (sent - sentBytes < SENT_STEP && sent < 1) return;
      sentBytes = sent;
      onSent(sent);
    };
    put.onload = () => resolve({ ok: put.status >= 200 && put.status < 300, status: put.status });
    put.onerror = () => reject(new Error("no answer"));
    put.ontimeout = () => reject(new Error("no answer"));
    put.send(form);
  });
}

/**
 * The bytes, to the address the door signed: the form storage's own client sends a Blob in. A network failure or a server's is
 * tried again. Past a first try anything else goes on to done, which proves the bytes either way: storage's answer to a photo
 * that did arrive before the line dropped is not one we need to recognise.
 */
async function sendBytes(
  address: string,
  file: File,
  mime: FileMime,
  onSent?: (sent: number) => void,
): Promise<boolean> {
  for (let tried = 0; ; tried++) {
    const form = new FormData();
    form.append("cacheControl", String(FILE_CACHE_S));
    form.append("", new Blob([file], { type: mime }), file.name);
    try {
      const res = await putBytes(address, form, onSent);
      if (res.ok || (tried > 0 && res.status < 500)) return true;
      if (res.status < 500) return false;
    } catch {
      // No answer: as a server's failure, below.
    }
    const wait = SEND_AGAIN_AFTER_MS[tried];
    if (wait === undefined) return false;
    await waited(wait);
  }
}

/** The server's proof, asked again where the asking failed: asked twice, it answers the same. The pane reads when all are in. */
async function proven(id: string, name: string, mime: FileMime) {
  for (let tried = 0; ; tried++) {
    const done = await api()("POST files/[id]/done", { params: { id }, body: { name, mime }, refresh: false });
    if (done.ok || !(done.status === 0 || done.status >= 500)) return done;
    const wait = DONE_AGAIN_AFTER_MS[tried];
    if (wait === undefined) return done;
    await waited(wait);
  }
}

/** files/start, for a photo (its type and size) and for a video (its facts besides, so Stream's word alone can finish it). */
const askToStart = (body: {
  mime: FileMime;
  bytes: number;
  name?: string;
  seconds?: number | null;
  fingerprint?: string;
}) => api()("POST files/start", { body });

async function add(file: File, onSent?: (sent: number) => void): Promise<AddSaid> {
  const mime = mimeOf(file);
  if (!mime) return { kept: false, message: W.wrongType };
  if (isVideoMime(mime)) return addVideo(file, mime, onSent);
  if (file.size > FILE_BYTES_MAX) return { kept: false, message: W.tooBig };
  const started = await askToStart({ mime, bytes: file.size });
  if (!started.ok) return { kept: false, message: started.message };
  if (!started.data.upload_url) return { kept: false, message: W.notSaved };
  if (!(await sendBytes(started.data.upload_url, file, mime, onSent))) return { kept: false, message: W.notSaved };
  const done = await proven(started.data.id, file.name, mime);
  if (!done.ok) return { kept: false, message: done.message };
  return { kept: true, twin: done.data.twin, id: done.data.file_id };
}

/**
 * A video: its length and fingerprint read here first, so a clip too long or already kept is said before a byte goes; then
 * its bytes to Stream, from where they stood if this device was sending it before a reload; then `done`, which is only a word
 * that they have all gone, so a failure of it is no failure of the video's. tus' sender loads only now, with the first video.
 */
async function addVideo(file: File, mime: FileVideoMime, onSent?: (sent: number) => void): Promise<AddSaid> {
  if (file.size > FILE_VIDEO_BYTES_MAX) return { kept: false, message: W.video.tooBig };
  const { readVideoSeconds, hashVideo, keptUploadOf, readUploadOffset, keepUpload, sendVideo, forgetUpload } =
    await import("./video-send");
  const [seconds, fingerprint] = await Promise.all([readVideoSeconds(file), hashVideo(file)]);
  if (seconds !== null && seconds > FILE_VIDEO_SECONDS_MAX) return { kept: false, message: W.video.tooLong };
  const stored = keptUploadOf(fingerprint);
  const resumes = stored ? typeof (await readUploadOffset(stored.url)) === "number" : false;
  let at = stored && resumes ? { id: stored.id, url: stored.url } : null;
  if (!at) {
    const started = await askToStart({ mime, bytes: file.size, name: file.name, seconds, fingerprint });
    if (!started.ok) return { kept: false, message: started.message };
    if (started.data.twin || !started.data.upload_url)
      return { kept: true, twin: true, id: started.data.id, video: true };
    at = { id: started.data.id, url: started.data.upload_url };
    keepUpload(fingerprint, at);
  }
  if (!(await sendVideo(at.url, file, onSent))) return { kept: false, message: W.video.notSaved };
  forgetUpload(fingerprint);
  await proven(at.id, file.name, mime);
  return { kept: true, twin: false, id: at.id, video: true };
}

export interface FileChange {
  name?: string;
  shows?: FileShows;
  who_in_it?: "no_one" | "agreed";
  status?: "filed" | "set_aside";
  /** A made piece's caption, written where it stands (server posts/caption.ts). */
  caption?: string;
}

/** What came of asking for a post's picture: the picture and whether the business has a number to print, or what refused it. */
type PostDrawing = { ok: true; picture: Blob; hasPhone: boolean } | { ok: false; refused: string | null };
type PieceBoard = { ok: true; picture: Blob } | { ok: false; refused: string | null };

/** What a picture's refusal says to a person: a 400's own words, as they came; nothing for any other answer. */
async function pictureRefusalOf(res: Response): Promise<string | null> {
  if (res.status !== 400) return null;
  const message = recordOrEmpty(recordOrEmpty(await res.json().catch(() => null)).error).message;
  return typeof message === "string" ? message : null;
}

/**
 * The real picture a post would be (POST files/post/preview), for a card and for an editor as its words change. What the server
 * refuses, it says in the post's own language; anything else, a lost line or a stale press, says nothing, and the last picture stands.
 */
async function postPicture(plan: PostPlan, shape: PostPicture, signal?: AbortSignal): Promise<PostDrawing> {
  const res = await api()
    .raw("POST files/post/preview", { body: { ...plan, shape }, timeoutMs: POST_PICTURE_MS, signal })
    .catch(() => null);
  if (!res) return { ok: false, refused: null };
  if (res.ok)
    return res.blob().then(
      (picture) => ({ ok: true, picture, hasPhone: res.headers.get("x-post-phone") !== "0" }),
      () => ({ ok: false, refused: null }),
    );
  return { ok: false, refused: await pictureRefusalOf(res) };
}

/**
 * A video's storyboard (POST files/video/preview), for its card: each block as the video shows it, the opening words where it
 * shows them. What the server refuses of the plan, it says in the video's own language; a lost line says nothing.
 */
async function pieceBoard(plan: PiecePlan, signal?: AbortSignal): Promise<PieceBoard> {
  const res = await api()
    .raw("POST files/video/preview", { body: plan, timeoutMs: POST_PICTURE_MS, signal })
    .catch(() => null);
  if (!res) return { ok: false, refused: null };
  if (res.ok)
    return res.blob().then(
      (picture) => ({ ok: true, picture }),
      () => ({ ok: false, refused: null }),
    );
  return { ok: false, refused: await pictureRefusalOf(res) };
}

/**
 * What a phone's sheet is handed, its bytes: a kept post at one of its shapes, or a video made here, its own file (`video`), as
 * Save downloads it. Null where they did not come.
 */
async function fileBytes(id: string, as: PostShapeName | "video"): Promise<Blob | null> {
  const address = as === "video" ? `${fileViewOf(id)}?download` : `${fileViewOf(id)}?shape=${as}`;
  const res = await window.fetch(address).catch(() => null);
  return res?.ok ? res.blob().catch(() => null) : null;
}

/** What a post's door answers, as a press reads it: done, or why not in words. */
type PostAnswer = { ok: true } | { ok: false; message: string };

/** A post's two doors at one place: post it (now, or at `when`), and Don't post. Its time moves by its own id (movePost). */
interface PostDoorsAt {
  begin: (id: string, as: InstagramPostKind, words: string, when?: string) => Promise<PostAnswer>;
  pull: (id: string, postId: string) => Promise<PostAnswer>;
}

export const fileVerbs = {
  add,
  pieceBoard,
  /** Where a video asked for stands (GET files/video/[id]): its card asks again while it is being made. */
  piece: (id: string) => api()("GET files/video/[id]", { params: { id } }),
  fileBytes,
  postPicture,
  record: (id: string) => api()("GET files/[id]", { params: { id } }),
  /** A video asked for by its plan (POST files/video): `key` makes a second press of the same draft the same video. */
  makeVideo: (plan: PiecePlan, key: string) => api()("POST files/video", { body: { ...plan, key } }),
  play: (id: string) => api()("GET files/[id]/play", { params: { id } }),
  savePost: (plan: PostPlan) => api()("POST files/post", { body: plan }),
  /** Now, at the press. A time is Ask's to set (its card, contracts content/publish.ts), through the same door. */
  postToGoogle: (id: string, summary: string, when?: string) =>
    api()("POST files/[id]/google", { params: { id }, body: { summary, ...(when ? { when } : {}) } }),
  takeOffGoogle: (id: string, name: string) => api()("DELETE files/[id]/google", { params: { id }, body: { name } }),
  /** Don't post, for a post set for its time on Google (00616). */
  pullFromGoogle: (id: string, postId: string) =>
    api()("DELETE files/[id]/google", { params: { id }, body: { post_id: postId } }),
  /** Now, or at `when` (an instant, as the door reads one): the page's Schedule and Ask's card set it, through the same door. */
  postToInstagram: (id: string, as: InstagramPostKind, caption: string, when?: string) =>
    api()("POST files/[id]/instagram", {
      params: { id },
      body: { ...(as === "story" ? { as } : { as, caption }), ...(when ? { when } : {}) },
    }),
  pullFromInstagram: (id: string, postId: string) =>
    api()("DELETE files/[id]/instagram", { params: { id }, body: { post_id: postId } }),
  /** Change time, for a post set for its time at either place (00621): the same post, set for another. */
  movePost: (id: string, postId: string, when: string) =>
    api()("PATCH files/[id]/posts", { params: { id }, body: { post_id: postId, when } }),
  change: (id: string, body: FileChange) => api()("PATCH files/[id]", { params: { id }, body }),
  /** Keep what was found online, or (`set_aside`) say it is not the business's: Keep and Not mine, for many at once. */
  keepMany: (ids: readonly string[], to: "filed" | "set_aside" = "filed") =>
    api()("POST files/keep", { body: { ids: [...ids], ...(to === "set_aside" ? { to } : {}) } }),
  remove: (id: string) => api()("DELETE files/[id]", { params: { id } }),
  /** Undo of a delete, for ten minutes after it (00616). */
  restore: (id: string) => api()("POST files/[id]/restore", { params: { id } }),
};

/**
 * A post's doors, by its place (Campaigns › Content's sheet, its Undo, its Change time): one shape, so a press never asks where
 * it goes before it knows which door. Google takes a picture alone, so what Instagram is posted as is Instagram's.
 */
export const postDoors = {
  instagram: {
    begin: (id, as, words, when) => fileVerbs.postToInstagram(id, as, words, when),
    pull: (id, postId) => fileVerbs.pullFromInstagram(id, postId),
  },
  google: {
    begin: (id, _as, words, when) => fileVerbs.postToGoogle(id, words, when),
    pull: (id, postId) => fileVerbs.pullFromGoogle(id, postId),
  },
} as const satisfies Record<PostPlace, PostDoorsAt>;
