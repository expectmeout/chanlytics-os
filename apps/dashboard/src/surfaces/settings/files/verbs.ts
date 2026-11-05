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
  isFileMime,
  type FileMime,
  type FileShows,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";

/** How long to wait before each new try: a phone between masts is back in seconds. */
const SEND_AGAIN_AFTER_MS = [3 * SECOND_MS, 10 * SECOND_MS] as const;
const DONE_AGAIN_AFTER_MS = [2 * SECOND_MS, 5 * SECOND_MS, 10 * SECOND_MS] as const;

const waited = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What one photo came to: kept, already kept, or the words that refused it. */
export type AddSaid = { kept: true; twin: boolean } | { kept: false; message: string };

/** A kind by what the file calls itself: a desk browser names no type for a HEIC, and a phone always does. */
function mimeOf(file: File): FileMime | null {
  if (isFileMime(file.type)) return file.type;
  return !file.type && /\.(heic|heif)$/i.test(file.name) ? "image/heic" : null;
}

/**
 * The bytes, to the address the door signed: the form storage's own client sends a Blob in. A network failure or a server's is
 * tried again. Past a first try anything else goes on to done, which proves the bytes either way: storage's answer to a photo
 * that did arrive before the line dropped is not one we need to recognise.
 */
async function sendBytes(address: string, file: File, mime: FileMime): Promise<boolean> {
  for (let tried = 0; ; tried++) {
    const form = new FormData();
    form.append("cacheControl", String(FILE_CACHE_S));
    form.append("", new Blob([file], { type: mime }), file.name);
    try {
      const res = await window.fetch(address, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
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

async function add(file: File): Promise<AddSaid> {
  const mime = mimeOf(file);
  if (!mime) return { kept: false, message: W.wrongType };
  if (file.size > FILE_BYTES_MAX) return { kept: false, message: W.tooBig };
  const started = await api()("POST files/start", { body: { mime, bytes: file.size } });
  if (!started.ok) return { kept: false, message: started.message };
  if (!(await sendBytes(started.data.upload_url, file, mime))) return { kept: false, message: W.notSaved };
  const done = await proven(started.data.id, file.name, mime);
  if (!done.ok) return { kept: false, message: done.message };
  return { kept: true, twin: done.data.twin };
}

export interface FileChange {
  name?: string;
  shows?: FileShows;
  who_in_it?: "no_one" | "agreed";
  status?: "filed" | "set_aside";
}

export const fileVerbs = {
  add,
  change: (id: string, body: FileChange) => api()("PATCH files/[id]", { params: { id }, body }),
  keepMany: (ids: readonly string[]) => api()("POST files/keep", { body: { ids: [...ids] } }),
  remove: (id: string) => api()("DELETE files/[id]", { params: { id } }),
};
