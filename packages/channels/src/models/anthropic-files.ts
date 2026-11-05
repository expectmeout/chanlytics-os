/**
 * Anthropic's Files API, the wire (decision 0099; its "Files API" page, read 5 Nov 2026, and one real run the same day):
 * a copy of a file uploaded for the model to read by id, and let go. An image goes in a conversation by this id because
 * Ask replays a conversation byte for byte and the id never changes, where a signed address could serve other bytes;
 * and it keeps a request under the gateway's size.
 *
 * Files are visible to every key in the workspace they were uploaded in, so an id is never taken from a person, a page or
 * a tool's input: it is read from the row of the workspace asking. Nothing here knows a row. It runs on the Messages
 * API's own version, which the run proved. Upload and delete are free; a file costs its tokens where it is read.
 */
import { answerObject, providerFetch, type ProviderReply } from "../provider-fetch";
import type { ModelDeps } from "./anthropic";

const FILES_URL = "https://api.anthropic.com/v1/files";
const FILES_VERSION = "2023-06-01";
/** One try's bound: a picture of a few hundred KB, up or gone. */
const FILE_TRY_MS = 8_000;

const fileHeaders = (key: string): Record<string, string> => ({ "x-api-key": key, "anthropic-version": FILES_VERSION });

const failureWords = (a: ProviderReply): string => a.error ?? `status ${a.status}`;

export type ClaudeFileUploaded = { ok: true; id: string; expiresAt: string | null } | { ok: false; error: string };

/** One upload, which is safe to repeat: a second only leaves an unused copy to its expiry. */
export async function uploadClaudeFile(
  key: string,
  file: { bytes: Uint8Array; mime: string; name: string; expiresInSeconds: number },
  deps: ModelDeps = {},
): Promise<ClaudeFileUploaded> {
  const form = new FormData();
  form.append("file", new Blob([file.bytes.slice()], { type: file.mime }), file.name);
  form.append("expires_in_seconds", String(file.expiresInSeconds));
  const a = await providerFetch(
    "anthropic",
    FILES_URL,
    { method: "POST", headers: fileHeaders(key), body: form, timeoutMs: FILE_TRY_MS },
    deps,
  );
  if (a.outcome !== "ok") return { ok: false, error: failureWords(a) };
  const j = answerObject(a);
  if (!j || typeof j.id !== "string" || !j.id.startsWith("file_"))
    return { ok: false, error: "the answer named no file" };
  return { ok: true, id: j.id, expiresAt: typeof j.expires_at === "string" ? j.expires_at : null };
}

/** Whether the copy is gone: deleted now, or already (a 404, or past its expiry). */
export async function deleteClaudeFile(key: string, id: string, deps: ModelDeps = {}): Promise<boolean> {
  const a = await providerFetch(
    "anthropic",
    `${FILES_URL}/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: fileHeaders(key), timeoutMs: FILE_TRY_MS, idempotent: true, tries: 2 },
    deps,
  );
  return a.outcome === "ok" || a.status === 404;
}
