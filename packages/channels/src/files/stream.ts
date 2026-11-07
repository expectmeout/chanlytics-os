/**
 * Cloudflare Stream, the wire (decision 0099, stage B; Stream's docs read 7 Nov 2026): a business's video reserved for the
 * browser to send straight to Stream over tus, asked after, its frames and its sound fetched under short signed tokens, its
 * caption track put, its storage counted, and deleted. Stream keeps the video and its encodes; we keep nothing of the original.
 *
 * Every video requires signed URLs: its id alone plays nothing. A token is an RS256 JWT signed here with the account's signing
 * key (`kid`, `sub` the video, `exp`), so no call to Stream is spent on one; `downloadable` lets it fetch the audio download.
 * Stream's webhook (one per account) is signed with an HMAC over `time.body`. Nothing here knows a row, a workspace or a page.
 */
import { isObjectRecord } from "@chanlytics/contracts";
import { createHmac, createPrivateKey, sign as signWith, timingSafeEqual } from "node:crypto";
import { answerObject, providerFetch, type ProviderReply } from "../shared/provider-fetch";
import type { ModelDeps } from "../ai/anthropic";

const STREAM_ACCOUNTS_API = "https://api.cloudflare.com/client/v4/accounts";
/** One try's bound for the API: a reservation, a read, a delete. */
const API_TRY_MS = 8_000;
/** A caption track is a few KB; a frame is a few hundred. */
const CAPTION_TRY_MS = 10_000;
const FRAME_TRY_MS = 12_000;
/** An audio download of ten minutes is about 10 MB. */
const AUDIO_TRY_MS = 25_000;
/** How old a webhook's time may be: older is a replay, refused. */
const WEBHOOK_WINDOW_S = 5 * 60;

/** The account and its API token (scoped to Stream edit on this account and nothing else). */
export interface StreamAccount {
  accountId: string;
  token: string;
}

/** What signs tokens and names the playback host: the signing key's id and its JWK (base64, as Stream gives it), and the customer code. */
export interface StreamSigning {
  keyId: string;
  jwk: string;
  customerCode: string;
}

/** Where a video stands at Stream, in its own words; `unknown` for one it did not say. */
const STREAM_STATES = ["pendingupload", "downloading", "queued", "inprogress", "ready", "error", "unknown"] as const;
export type StreamState = (typeof STREAM_STATES)[number];

/** A video as Stream describes it, from the API or its webhook, read and held. */
export interface StreamVideo {
  uid: string;
  state: StreamState;
  /** Playable: Stream's `readyToStream`. */
  ready: boolean;
  /** Its length, once Stream knows it (it says -1 before). */
  seconds: number | null;
  width: number | null;
  height: number | null;
  /** Why it could not be prepared, Stream's code (`ERR_MALFORMED_VIDEO`); null where it says none. */
  errorCode: string | null;
}

const positive = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const errorWordOf = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const failureWords = (a: ProviderReply): string => {
  const errors = answerObject(a)?.errors;
  const detail = Array.isArray(errors)
    ? errors
        .map((e) => (isObjectRecord(e) ? `${errorWordOf(e.code)} ${errorWordOf(e.message)}`.trim() : ""))
        .filter(Boolean)
        .join("; ")
    : "";
  return a.error ?? (detail ? `status ${a.status}: ${detail}` : `status ${a.status}`);
};
const apiHeaders = (account: StreamAccount): Record<string, string> => ({ authorization: `Bearer ${account.token}` });
const videoUrl = (account: StreamAccount, uid: string, rest = ""): string =>
  `${STREAM_ACCOUNTS_API}/${encodeURIComponent(account.accountId)}/stream/${encodeURIComponent(uid)}${rest}`;

/** A video object (the API's `result`, or the webhook's body) read into ours; null for one with no id. */
export function streamVideoOf(raw: unknown): StreamVideo | null {
  if (!isObjectRecord(raw) || typeof raw.uid !== "string" || !raw.uid) return null;
  const status = isObjectRecord(raw.status) ? raw.status : {};
  const state = STREAM_STATES.find((s) => s === status.state) ?? "unknown";
  const input = isObjectRecord(raw.input) ? raw.input : {};
  const code = typeof status.errorReasonCode === "string" && status.errorReasonCode ? status.errorReasonCode : null;
  return {
    uid: raw.uid,
    state,
    ready: raw.readyToStream === true || state === "ready",
    seconds: positive(raw.duration),
    width: positive(input.width),
    height: positive(input.height),
    errorCode: code,
  };
}

/* ---------------------------------------------------------------------------------------------------- the upload -- */

/** tus's own metadata: each pair a key and its value in base64, a key alone where it is a flag. */
const tusMetadata = (pairs: Record<string, string | true>): string =>
  Object.entries(pairs)
    .map(([k, v]) => (v === true ? k : `${k} ${Buffer.from(v, "utf8").toString("base64")}`))
    .join(",");

export type StreamReserved =
  { ok: true; uploadUrl: string; mediaRef: string } | { ok: false; error: string; full: boolean; retryable: boolean };

/**
 * A reservation for the browser's direct upload (tus, `direct_user=true`): everything the browser knows goes now, so Stream
 * holds the video to its length and time, and the address it answers is one-time, expires, and carries no token of ours.
 * `name` is our file's id, which the webhook carries back in `meta.name`.
 */
export async function reserveStreamUpload(
  account: StreamAccount,
  upload: { bytes: number; maxDurationSeconds: number; expiresAt: Date; name: string },
  deps: ModelDeps = {},
): Promise<StreamReserved> {
  const reply = await providerFetch(
    "cloudflare",
    `${STREAM_ACCOUNTS_API}/${encodeURIComponent(account.accountId)}/stream?direct_user=true`,
    {
      method: "POST",
      headers: {
        ...apiHeaders(account),
        "tus-resumable": "1.0.0",
        "upload-length": String(Math.floor(upload.bytes)),
        "upload-metadata": tusMetadata({
          maxDurationSeconds: String(Math.max(1, Math.ceil(upload.maxDurationSeconds))),
          expiry: upload.expiresAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
          name: upload.name,
          requiresignedurls: true,
        }),
      },
      timeoutMs: API_TRY_MS,
    },
    deps,
  );
  if (reply.outcome !== "ok") {
    const words = failureWords(reply);
    return {
      ok: false,
      error: words,
      // The account's storage is spent: its allowance, not this clip, is what must change.
      full: reply.status >= 400 && reply.status < 500 && /storage|capacity|quota|exceed/i.test(words),
      retryable: reply.outcome === "retryable" || reply.outcome === "unknown",
    };
  }
  const uploadUrl = reply.headers?.get("location") ?? "";
  const mediaRef = reply.headers?.get("stream-media-id") ?? "";
  if (!/^https:\/\//.test(uploadUrl) || !/^[0-9a-f]{32}$/i.test(mediaRef))
    return { ok: false, error: "the reservation named no address or video", full: false, retryable: false };
  return { ok: true, uploadUrl, mediaRef };
}

/* ------------------------------------------------------------------------------------------------- the API reads -- */

export type StreamRead = { ok: true; video: StreamVideo } | { ok: false; gone: boolean; error: string };

/** A video as Stream has it now: what the sweep asks when its webhook did not come. */
export async function readStreamVideo(account: StreamAccount, uid: string, deps: ModelDeps = {}): Promise<StreamRead> {
  const reply = await providerFetch(
    "cloudflare",
    videoUrl(account, uid),
    { method: "GET", headers: apiHeaders(account), timeoutMs: API_TRY_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (reply.status === 404) return { ok: false, gone: true, error: "not at Stream" };
  if (reply.outcome !== "ok") return { ok: false, gone: false, error: failureWords(reply) };
  const video = streamVideoOf(answerObject(reply)?.result);
  return video ? { ok: true, video } : { ok: false, gone: false, error: "the answer named no video" };
}

/** Whether the video is gone from Stream: deleted now, or already (a 404). Its minutes are freed at once. */
export async function deleteStreamVideo(account: StreamAccount, uid: string, deps: ModelDeps = {}): Promise<boolean> {
  const r = await providerFetch(
    "cloudflare",
    videoUrl(account, uid),
    { method: "DELETE", headers: apiHeaders(account), timeoutMs: API_TRY_MS, idempotent: true, tries: 2 },
    deps,
  );
  return r.outcome === "ok" || r.status === 404;
}

/** Where a video's audio download stands: asked for and being made, ready, or not to be had (Stream made none). */
export type StreamAudio = { status: "ready" | "inprogress" | "none" } | { status: "failed"; error: string };

function audioOf(r: ProviderReply): StreamAudio {
  if (r.outcome !== "ok") return { status: "failed", error: failureWords(r) };
  const result = answerObject(r)?.result;
  const audio = isObjectRecord(result) && isObjectRecord(result.audio) ? result.audio : null;
  if (!audio) return { status: "inprogress" };
  if (audio.status === "ready") return { status: "ready" };
  if (audio.status === "error") return { status: "none" };
  return { status: "inprogress" };
}

/** Asks Stream for the video's sound as M4A, or answers where it stands; asked again it changes nothing. */
export async function askStreamAudio(account: StreamAccount, uid: string, deps: ModelDeps = {}): Promise<StreamAudio> {
  const r = await providerFetch(
    "cloudflare",
    videoUrl(account, uid, "/downloads/audio"),
    { method: "POST", headers: apiHeaders(account), timeoutMs: API_TRY_MS, idempotent: true, tries: 2 },
    deps,
  );
  return audioOf(r);
}

/** Where the audio download stands now, without asking for it. */
export async function readStreamAudio(account: StreamAccount, uid: string, deps: ModelDeps = {}): Promise<StreamAudio> {
  const r = await providerFetch(
    "cloudflare",
    videoUrl(account, uid, "/downloads"),
    { method: "GET", headers: apiHeaders(account), timeoutMs: API_TRY_MS, idempotent: true, tries: 2 },
    deps,
  );
  return audioOf(r);
}

/** The caption track in one language, as WebVTT (Stream takes up to 10 MB): put again, it replaces the last. */
export async function putStreamCaptions(
  account: StreamAccount,
  uid: string,
  language: string,
  vtt: string,
  deps: ModelDeps = {},
): Promise<boolean> {
  const form = new FormData();
  form.append("file", new Blob([vtt], { type: "text/vtt" }), `${language}.vtt`);
  const reply = await providerFetch(
    "cloudflare",
    videoUrl(account, uid, `/captions/${encodeURIComponent(language)}`),
    { method: "PUT", headers: apiHeaders(account), body: form, timeoutMs: CAPTION_TRY_MS, idempotent: true, tries: 2 },
    deps,
  );
  return reply.outcome === "ok";
}

/** What the account holds against its allowance: what Health's line says. */
export interface StreamUsage {
  minutes: number;
  limit: number | null;
  videos: number;
}

export async function readStreamUsage(account: StreamAccount, deps: ModelDeps = {}): Promise<StreamUsage | null> {
  const reply = await providerFetch(
    "cloudflare",
    `${STREAM_ACCOUNTS_API}/${encodeURIComponent(account.accountId)}/stream/storage-usage`,
    { method: "GET", headers: apiHeaders(account), timeoutMs: API_TRY_MS, idempotent: true, tries: 2 },
    deps,
  );
  const result = reply.outcome === "ok" ? answerObject(reply)?.result : null;
  if (!isObjectRecord(result) || typeof result.totalStorageMinutes !== "number") return null;
  return {
    minutes: result.totalStorageMinutes,
    limit: typeof result.totalStorageMinutesLimit === "number" ? result.totalStorageMinutesLimit : null,
    videos: typeof result.videoCount === "number" ? result.videoCount : 0,
  };
}

/* ------------------------------------------------------------------------------------------------------ tokens -- */

const base64UrlOf = (v: string | Buffer): string => Buffer.from(v).toString("base64url");

/**
 * A signed token for one video, made here with the account's signing key (no call to Stream): it plays, gives frames, and
 * with `downloadable` fetches the audio download, until `seconds` from now. Stream allows at most a day; ours are minutes to
 * an hour. Throws on a key that does not read: a setting, not a moment's fault.
 */
export function streamTokenOf(
  signing: Pick<StreamSigning, "keyId" | "jwk">,
  claims: { uid: string; seconds: number; downloadable?: boolean; nowMs?: number },
): string {
  const now = Math.floor((claims.nowMs ?? Date.now()) / 1000);
  const header = { alg: "RS256", kid: signing.keyId };
  const payload = {
    sub: claims.uid,
    kid: signing.keyId,
    exp: now + Math.max(60, Math.min(Math.floor(claims.seconds), 86_400)),
    nbf: now - 60,
    ...(claims.downloadable ? { downloadable: true } : {}),
  };
  const head = `${base64UrlOf(JSON.stringify(header))}.${base64UrlOf(JSON.stringify(payload))}`;
  const jwk = JSON.parse(Buffer.from(signing.jwk, "base64").toString("utf8")) as Record<string, unknown>;
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  return `${head}.${base64UrlOf(signWith("sha256", Buffer.from(head), key))}`;
}

const streamHostOf = (customerCode: string): string => `https://customer-${customerCode}.cloudflarestream.com`;

/** Stream's time as it reads one: seconds with up to two decimals, `12.5s`. */
const streamTimeOf = (seconds: number): string => `${Math.max(0, Math.round(seconds * 100) / 100)}s`;

/** One frame of the video at a moment, the whole frame kept inside the size asked (`fit=clip`). */
export function streamFrameUrl(
  customerCode: string,
  token: string,
  frame: { at: number; width: number; height: number },
): string {
  const q = new URLSearchParams({
    time: streamTimeOf(frame.at),
    width: String(Math.round(frame.width)),
    height: String(Math.round(frame.height)),
    fit: "clip",
  });
  return `${streamHostOf(customerCode)}/${token}/thumbnails/thumbnail.jpg?${q}`;
}

/** The video's sound as M4A, under a `downloadable` token. */
export const streamAudioUrl = (customerCode: string, token: string): string =>
  `${streamHostOf(customerCode)}/${token}/downloads/audio.m4a`;

/** Stream's player for one video, under a token: the poster ours, captions on in the language spoken where there are some. */
export function streamPlayerUrl(
  customerCode: string,
  token: string,
  options: { poster?: string | null; captions?: string | null } = {},
): string {
  const q = new URLSearchParams({ preload: "metadata" });
  if (options.poster) q.set("poster", options.poster);
  if (options.captions) q.set("defaultTextTrack", options.captions);
  return `${streamHostOf(customerCode)}/${token}/iframe?${q}`;
}

export type StreamFetched = { ok: true; bytes: Uint8Array; mime: string } | { ok: false; gone: boolean; error: string };

async function fetchBytes(url: string, timeoutMs: number, deps: ModelDeps): Promise<StreamFetched> {
  const reply = await providerFetch(
    "cloudflare",
    url,
    { method: "GET", timeoutMs, idempotent: true, tries: 2, stream: true },
    deps,
  );
  if (reply.status === 404) return { ok: false, gone: true, error: "not at Stream" };
  if (reply.outcome !== "ok" || !reply.body)
    return { ok: false, gone: false, error: reply.error ?? `status ${reply.status}` };
  try {
    const bytes = new Uint8Array(await new Response(reply.body).arrayBuffer());
    return {
      ok: true,
      bytes,
      mime: reply.headers?.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream",
    };
  } catch (e) {
    return { ok: false, gone: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** One frame's bytes (a JPEG). */
export const fetchStreamFrame = (url: string, deps: ModelDeps = {}): Promise<StreamFetched> =>
  fetchBytes(url, FRAME_TRY_MS, deps);

/** The audio download's bytes (M4A). */
export const fetchStreamAudio = (url: string, deps: ModelDeps = {}): Promise<StreamFetched> =>
  fetchBytes(url, AUDIO_TRY_MS, deps);

/* ----------------------------------------------------------------------------------------------------- webhook -- */

/**
 * Whether a webhook is Stream's: `Webhook-Signature: time=<unix>,sig1=<hex>`, the HMAC-SHA256 of `<time>.<body>` under the
 * account's webhook secret, and a time inside five minutes of ours. The body must be the bytes as they came.
 */
export function verifyStreamWebhook(secret: string, header: string | null, body: string, nowMs = Date.now()): boolean {
  if (!secret || !header) return false;
  const parts = new Map(
    header.split(",").map((p) => {
      const at = p.indexOf("=");
      return [p.slice(0, at).trim(), p.slice(at + 1).trim()] as const;
    }),
  );
  const time = parts.get("time") ?? "";
  const sig = parts.get("sig1") ?? "";
  if (!/^\d{1,12}$/.test(time) || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - Number(time)) > WEBHOOK_WINDOW_S) return false;
  const expected = createHmac("sha256", secret).update(`${time}.${body}`).digest();
  const given = Buffer.from(sig, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
