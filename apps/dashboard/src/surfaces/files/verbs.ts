/**
 * Settings › Files' doors (decision 0099). An upload is three steps: asked for at the door (`files/start`), sent straight
 * to storage over the address it answered, and proven by the server (`files/[id]/done`). A function could not carry 25 MB,
 * so the bytes never pass through one. A phone's signal drops, so the two steps that can be asked again are, a few times, and
 * the third is what says whether anything arrived. An object the pane imports, so a test stands a door in by assigning onto it.
 */
import {
  FILE_BYTES_MAX,
  FILE_CACHE_S,
  FILE_WORDS as W,
  SECOND_MS,
  fileViewOf,
  isFileMime,
  type FileMime,
  type FileShows,
  type PostPicture,
  type PostPlan,
  type PostShapeName,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";

/**
 * What a picker offers, a HEIC by its name too. Asked for only JPEG, a phone converts by itself; what an iPhone hands over
 * when asked for HEIC as well is what the first real uploads will show, and the server takes either.
 */
export const FILE_PICKS = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

/** How long to wait before each new try: a phone between masts is back in seconds. */
const SEND_AGAIN_AFTER_MS = [3 * SECOND_MS, 10 * SECOND_MS] as const;
const DONE_AGAIN_AFTER_MS = [2 * SECOND_MS, 5 * SECOND_MS, 10 * SECOND_MS] as const;
/** How long a post's picture is waited for: a photo read and a drawing, on a slow day. */
const POST_PICTURE_MS = 30 * SECOND_MS;

const waited = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What one photo came to: kept, already kept (`id` is then the one it twins), or the words that refused it. */
export type AddSaid = { kept: true; twin: boolean; id: string } | { kept: false; message: string };

/** A kind by what the file calls itself: a desk browser names no type for a HEIC, and a phone always does. */
function mimeOf(file: File): FileMime | null {
  if (isFileMime(file.type)) return file.type;
  return !file.type && /\.(heic|heif)$/i.test(file.name) ? "image/heic" : null;
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
    let said = 0;
    put.open("PUT", address);
    for (const [name, value] of Object.entries(headers)) put.setRequestHeader(name, value);
    put.upload.onprogress = (e) => {
      if (!e.lengthComputable || e.total === 0) return;
      const sent = e.loaded / e.total;
      if (sent - said < SENT_STEP && sent < 1) return;
      said = sent;
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

async function add(file: File, onSent?: (sent: number) => void): Promise<AddSaid> {
  const mime = mimeOf(file);
  if (!mime) return { kept: false, message: W.wrongType };
  if (file.size > FILE_BYTES_MAX) return { kept: false, message: W.tooBig };
  const started = await api()("POST files/start", { body: { mime, bytes: file.size } });
  if (!started.ok) return { kept: false, message: started.message };
  if (!(await sendBytes(started.data.upload_url, file, mime, onSent))) return { kept: false, message: W.notSaved };
  const done = await proven(started.data.id, file.name, mime);
  if (!done.ok) return { kept: false, message: done.message };
  return { kept: true, twin: done.data.twin, id: done.data.file_id };
}

export interface FileChange {
  name?: string;
  shows?: FileShows;
  who_in_it?: "no_one" | "agreed";
  status?: "filed" | "set_aside";
}

/** What came of asking for a post's picture: the picture and whether the business has a number to print, or what refused it. */
type PostDrawing = { ok: true; picture: Blob; hasPhone: boolean } | { ok: false; refused: string | null };

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
  const said = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null;
  const message = said?.error?.message;
  return { ok: false, refused: res.status === 400 && typeof message === "string" ? message : null };
}

/** A kept post's shape, its bytes: what a phone's sheet is handed. Null where they did not come. */
async function postBytes(id: string, shape: PostShapeName): Promise<Blob | null> {
  const res = await window.fetch(`${fileViewOf(id)}?shape=${shape}`).catch(() => null);
  return res?.ok ? res.blob().catch(() => null) : null;
}

export const fileVerbs = {
  add,
  postBytes,
  postPicture,
  record: (id: string) => api()("GET files/[id]", { params: { id } }),
  savePost: (plan: PostPlan) => api()("POST files/post", { body: plan }),
  postToGoogle: (id: string, summary: string) => api()("POST files/[id]/google", { params: { id }, body: { summary } }),
  takeOffGoogle: (id: string, name: string) => api()("DELETE files/[id]/google", { params: { id }, body: { name } }),
  change: (id: string, body: FileChange) => api()("PATCH files/[id]", { params: { id }, body }),
  keepMany: (ids: readonly string[]) => api()("POST files/keep", { body: { ids: [...ids] } }),
  remove: (id: string) => api()("DELETE files/[id]", { params: { id } }),
};
