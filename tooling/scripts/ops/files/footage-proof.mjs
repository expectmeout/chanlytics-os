#!/usr/bin/env node
/**
 * The footage proof's runner (footage sources, plan v4, P1; apps/relay/README.md says how the relay it measures is
 * deployed). For one clip in a Google Drive it measures the road the plan chose: Cloudflare Stream fetching the clip
 * itself through the relay (apps/relay), so the bytes never pass through the app. It runs on Ruben's word only, from this
 * PC: a Stream fetch costs money, and a Google sign-in counts toward the app's 100 users.
 *
 *   keys     makes the relay's two keys, into a settings file and a file Wrangler reads; prints neither
 *   sign-in  Google's sign-in for Drive, read only, on this PC; the grant stays in a file here, and is never sent anywhere
 *   take     reads the clip's record and its fingerprint (two reads of Google: a dry run), and with --apply asks Stream to
 *            fetch it through the relay, waits for ready and for the sharpest copy, and prints the times, the requests
 *            the relay served (so Google's units a clip) and, with --break-after, whether a forced break still ends ready
 *   return   deletes a Stream copy and brings it back through the relay, timed (with --apply; a dry run says what it would do)
 *   forget   wipes a run's key from the proof's key door, and with --uid and --apply deletes a Stream copy
 *
 *   node --import tsx tooling/scripts/ops/files/footage-proof.mjs keys --out <folder>
 *   node --import tsx tooling/scripts/ops/files/footage-proof.mjs sign-in --env <settings>
 *   node --import tsx tooling/scripts/ops/files/footage-proof.mjs take --env <settings> --file <Drive file id> [--apply]
 *        [--break-after <seconds>] [--same-as <fingerprint>] [--ready-minutes 30] [--sharpest-minutes 40] [--out <file.json>]
 *   node --import tsx tooling/scripts/ops/files/footage-proof.mjs return --env <settings> --file <Drive file id> --uid <Stream id> [--apply]
 *   node --import tsx tooling/scripts/ops/files/footage-proof.mjs forget --env <settings> --file <Drive file id> [--uid <Stream id> --apply]
 *
 * --env names the settings file `keys` wrote, and may be given more than once (one more file for another Google account's
 * grant); a later file wins. Stream's sharpest copy is looked at under a signing key made for the run and deleted after it.
 * No key, grant or ticket is ever printed. Every run ends by wiping its key from the proof's key door.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { FILE_VIDEO_BYTES_MAX, FILE_VIDEO_SECONDS_MAX } from "@chanlytics/contracts";
import { fileFingerprintOf, FINGERPRINT_BYTES, readStreamCopy, streamTokenOf } from "@chanlytics/channels/files";
import { signTicket } from "../../../../apps/relay/src/ticket.ts";
import {
  askedLines,
  breakLines,
  clipAddressOf,
  DRIVE_UNITS,
  durationWords,
  settingsOf,
  sizeWords,
  unitsOf,
  verdictLines,
} from "./footage-proof-report.mjs";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
/** Each small call's bound: a record, a key, a status. */
const CALL_MS = 20 * SECOND_MS;
/** How often Stream is asked where the clip stands, and how often for its sharpest copy. */
const STATUS_EVERY_MS = 3 * SECOND_MS;
const SHARPEST_EVERY_MS = 30 * SECOND_MS;
/** A ticket for a run: long enough for a slow fetch and a second try, far under the relay's day. */
const TICKET_SECONDS = 2 * 60 * 60;
/** A Drive key is left again at the door this long before Google ends it. */
const KEY_RENEW_MS = 10 * MINUTE_MS;
const SIGN_IN_WAIT_MS = 5 * MINUTE_MS;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

const [mode, ...args] = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const flagsOf = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
const apply = args.includes("--apply");

/** A run that stops itself, with why: thrown, never an exit, so a run in hand still wipes its key from the door. */
class Refusal extends Error {}
function refuse(words) {
  throw new Refusal(words);
}
const say = (line = "") => console.log(line);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The environment, then each --env file in order: read once, when a mode starts. */
let settings = {};
function readSettings() {
  const texts = flagsOf("--env").map((file) =>
    fs.existsSync(file) ? fs.readFileSync(file, "utf8") : refuse(`${file} is not a file`),
  );
  settings = { ...process.env, ...settingsOf(...texts) };
}
const need = (name) => settings[name]?.trim() || refuse(`${name} is not set: the run sheet says where it comes from`);
/** Where each service is; a rehearsal against stand-ins on this PC names its own. */
const googleApi = () => settings.FOOTAGE_PROOF_GOOGLE_API ?? "https://www.googleapis.com/drive/v3";
const googleTokenUrl = () => settings.FOOTAGE_PROOF_GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const cloudflareApi = () => settings.FOOTAGE_PROOF_CLOUDFLARE_API ?? "https://api.cloudflare.com/client/v4/accounts";

const base64Url = (bytes) => Buffer.from(bytes).toString("base64url");
const within = (ms = CALL_MS) => AbortSignal.timeout(ms);

/* -------------------------------------------------------------------------------------------------------- keys -- */

function makeKeys() {
  const out = flag("--out") ?? refuse("--out names the folder the two files are written to (outside the repository)");
  fs.mkdirSync(out, { recursive: true });
  const envFile = path.join(out, "footage-proof.env");
  const secretsFile = path.join(out, "worker-secrets.json");
  for (const file of [envFile, secretsFile])
    if (fs.existsSync(file)) refuse(`${file} exists: nothing kept is overwritten; name another folder`);
  const ticketKey = base64Url(randomBytes(32));
  const appKey = base64Url(randomBytes(32));
  fs.writeFileSync(
    envFile,
    [
      `# The footage proof's settings (plan v4, P1), made ${new Date().toISOString()} by tooling/scripts/ops/files/footage-proof.mjs.`,
      "# Never chat, never git. Delete this folder when the proof is done.",
      `FOOTAGE_TICKET_KEY=${ticketKey}`,
      `FOOTAGE_APP_KEY=${appKey}`,
      "# The two addresses Wrangler prints when each Worker is deployed (the run sheet, step 3):",
      "FOOTAGE_RELAY_URL=",
      "FOOTAGE_KEY_DOOR_URL=",
      "# The proof's Google sign-in client (the run sheet, step 2):",
      "GOOGLE_PROOF_CLIENT_ID=",
      "GOOGLE_PROOF_CLIENT_SECRET=",
      "# Cloudflare: the account's id, and an API token made for the proof with Stream: Edit and nothing else (step 3):",
      "CLOUDFLARE_ACCOUNT_ID=",
      "CLOUDFLARE_STREAM_API_TOKEN=",
      "# Where sign-in keeps the Google grant:",
      `GOOGLE_PROOF_GRANT_FILE=${path.join(out, "google-grant.json")}`,
      "",
    ].join("\n"),
    { flag: "wx", mode: 0o600 },
  );
  fs.writeFileSync(secretsFile, `${JSON.stringify({ TICKET_KEY: ticketKey, KEY_DOOR_SECRET: appKey }, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  say(`Two keys made. Neither is printed.`);
  say(`  settings for this script: ${envFile}`);
  say(`  for Wrangler (both Workers take the same two): ${secretsFile}`);
}

/* ------------------------------------------------------------------------------------------------------ Google -- */

/** Why Google said no at the sign-in, in a person's words. */
const SIGN_IN_REFUSALS = {
  admin_policy_enforced:
    "this Google Workspace's admin does not let the app read Drive (admin_policy_enforced). The admin's steps: Admin console > Security > API controls > trust the app.",
  access_denied: "the sign-in was declined, or the account is not on the app's list of test users (access_denied).",
};

async function signIn() {
  const clientId = need("GOOGLE_PROOF_CLIENT_ID");
  const clientSecret = need("GOOGLE_PROOF_CLIENT_SECRET");
  const keep = need("GOOGLE_PROOF_GRANT_FILE");
  if (fs.existsSync(keep)) refuse(`${keep} exists: a grant is already kept. Delete the file to sign in again.`);
  const port = Number(flag("--port") ?? 8976);
  const redirect = `http://127.0.0.1:${port}/`;
  const verifier = base64Url(randomBytes(32));
  const state = base64Url(randomBytes(16));
  const address = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  address.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: `openid email ${DRIVE_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
    code_challenge: base64Url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
  }).toString();

  const back = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const came = new URL(req.url ?? "/", redirect);
      if (!came.searchParams.has("code") && !came.searchParams.has("error")) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("Chanlytics footage proof: this tab can be closed. The terminal says what happened.");
      server.close();
      resolve(came.searchParams);
    });
    server.listen(port, "127.0.0.1", () => {
      say("Open this address in a browser, and sign in with the account whose Drive holds the clip:");
      say();
      say(address.href);
      say();
      say(`Waiting ${SIGN_IN_WAIT_MS / MINUTE_MS} minutes for Google to come back to ${redirect} ...`);
    });
    setTimeout(() => {
      server.close();
      resolve(null);
    }, SIGN_IN_WAIT_MS).unref();
  });
  if (!back) refuse("nobody came back from Google in time: run sign-in again");
  const error = back.get("error");
  if (error) refuse(SIGN_IN_REFUSALS[error] ?? `Google refused the sign-in (${error}).`);
  if (back.get("state") !== state) refuse("the answer was not this sign-in's: run it again");

  const reply = await fetch(googleTokenUrl(), {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: back.get("code") ?? "",
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirect,
    }),
    signal: within(),
  });
  const granted = await reply.json().catch(() => null);
  if (!reply.ok || typeof granted?.refresh_token !== "string")
    refuse(`Google gave no grant (status ${reply.status}${granted?.error ? `, ${granted.error}` : ""}).`);
  const scopes = String(granted.scope ?? "").split(" ");
  if (!scopes.includes(DRIVE_SCOPE))
    refuse("the grant does not hold Drive (read only): the box was not ticked at Google");
  const who = JSON.parse(
    Buffer.from(String(granted.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8") || "{}",
  );
  fs.writeFileSync(
    keep,
    `${JSON.stringify({ refresh_token: granted.refresh_token, email: who.email ?? null, scope: granted.scope, made_at: new Date().toISOString() }, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  say(`Signed in as ${who.email ?? "an account Google did not name"}. The grant holds: ${scopes.join(", ")}.`);
  say(`It is kept in ${keep}, on this PC only.`);
}

/** An hour's Drive key from the grant kept on this PC. */
async function driveKey() {
  const keep = need("GOOGLE_PROOF_GRANT_FILE");
  if (!fs.existsSync(keep)) refuse(`${keep} is not there: run sign-in first`);
  const { refresh_token: refreshToken } = JSON.parse(fs.readFileSync(keep, "utf8"));
  const reply = await fetch(googleTokenUrl(), {
    method: "POST",
    body: new URLSearchParams({
      client_id: need("GOOGLE_PROOF_CLIENT_ID"),
      client_secret: need("GOOGLE_PROOF_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: within(),
  });
  const said = await reply.json().catch(() => null);
  if (!reply.ok || typeof said?.access_token !== "string")
    refuse(
      said?.error === "invalid_grant"
        ? "Google no longer takes the grant (revoked, or unused too long): delete the grant file and sign in again"
        : `Google gave no key (status ${reply.status}${said?.error ? `, ${said.error}` : ""}).`,
    );
  return { accessToken: said.access_token, expiresAt: Date.now() + Number(said.expires_in ?? 3600) * SECOND_MS };
}

const askDrive = (key, fileId, query, range) =>
  fetch(`${googleApi()}/files/${encodeURIComponent(fileId)}?${query}&supportsAllDrives=true`, {
    headers: { authorization: `Bearer ${key.accessToken}`, ...(range ? { range } : {}) },
    signal: within(MINUTE_MS),
  });

/** The clip as Drive gives it, and its fingerprint from its first MiB: two reads of Google, 205 units. */
async function readClip(key, fileId) {
  const fields =
    "id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,driveId,videoMediaMetadata(durationMillis,width,height)";
  const recordReply = await askDrive(key, fileId, `fields=${encodeURIComponent(fields)}`);
  const record = await recordReply.json().catch(() => null);
  if (!recordReply.ok)
    refuse(
      `Drive would not give the file's record (status ${recordReply.status}, ${record?.error?.errors?.[0]?.reason ?? "no reason"}).`,
    );
  const size = Number(record.size);
  if (!Number.isInteger(size) || size <= 0) refuse("Drive's record gives no size: this is not a file with bytes");
  const headReply = await askDrive(key, fileId, "alt=media", `bytes=0-${Math.min(FINGERPRINT_BYTES, size) - 1}`);
  if (headReply.status !== 206 && headReply.status !== 200)
    refuse(`Drive would not give the first MiB (status ${headReply.status}).`);
  const head = new Uint8Array(await headReply.arrayBuffer());
  const millis = Number(record.videoMediaMetadata?.durationMillis);
  return {
    fileId,
    name: String(record.name ?? ""),
    mime: String(record.mimeType ?? ""),
    size,
    seconds: Number.isFinite(millis) && millis > 0 ? millis / SECOND_MS : null,
    width: record.videoMediaMetadata?.width ?? null,
    height: record.videoMediaMetadata?.height ?? null,
    createdTime: record.createdTime ?? null,
    sharedDrive: Boolean(record.driveId),
    fingerprint: fileFingerprintOf(head, size),
    headBytes: head.length,
  };
}

function sayClip(clip) {
  say(`The clip: "${clip.name}" (${clip.mime}), in ${clip.sharedDrive ? "a shared drive" : "a person's own Drive"}.`);
  say(`  Size, from Drive's record:   ${sizeWords(clip.size)} (${clip.size} bytes)`);
  say(
    `  Length, from Drive's record: ${clip.seconds === null ? "Drive has not given one (yet)" : `${clip.seconds.toFixed(1)} s`}${clip.width ? `, ${clip.width}x${clip.height}` : ""}`,
  );
  say(
    `  Put in Drive:                ${clip.createdTime ?? "not said"} (how soon a length appears is judged from this)`,
  );
  say(`  Fingerprint (first MiB + size, as an upload's): ${clip.fingerprint}`);
  const same = flag("--same-as");
  if (same) say(`  The same as the fingerprint given: ${same === clip.fingerprint ? "YES" : "NO"}`);
  const overSize = clip.size > FILE_VIDEO_BYTES_MAX;
  const overLength = clip.seconds !== null && clip.seconds > FILE_VIDEO_SECONDS_MAX;
  say(
    overSize || overLength
      ? `  Inside the app's caps: NO (${overSize ? "over 500 MB" : "over 10 minutes"}): the app would list it and never take it.`
      : "  Inside the app's caps (10 minutes, 500 MB): yes.",
  );
  say(
    `  Google units so far: ${DRIVE_UNITS.record + DRIVE_UNITS.download} (one record, one download of the first MiB).`,
  );
}

/* --------------------------------------------------------------------------------------- the key door and Stream -- */

async function askDoor(method, route, body) {
  const reply = await fetch(new URL(route, need("FOOTAGE_KEY_DOOR_URL")), {
    method,
    headers: { authorization: `Bearer ${need("FOOTAGE_APP_KEY")}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: within(),
  });
  return { status: reply.status, said: await reply.json().catch(() => null) };
}

/** The run left at the door: the file, an hour's key and, for the broken run, when to break. */
async function leaveRun(clip, key, breakAfterMs) {
  const left = await askDoor("PUT", `/runs/${clip.fileId}`, {
    file_id: clip.fileId,
    access_token: key.accessToken,
    key_expires_at: key.expiresAt,
    size: clip.size,
    ...(breakAfterMs ? { break_after_ms: breakAfterMs } : {}),
  });
  if (left.status !== 200)
    refuse(
      `the proof's key door would not keep the run (status ${left.status}): are both Workers deployed with the same two keys?`,
    );
}

async function askStream(method, route, body) {
  const reply = await fetch(`${cloudflareApi()}/${encodeURIComponent(need("CLOUDFLARE_ACCOUNT_ID"))}/stream${route}`, {
    method,
    headers: {
      authorization: `Bearer ${need("CLOUDFLARE_STREAM_API_TOKEN")}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: within(),
  });
  const said = await reply.json().catch(() => null);
  const errors = (said?.errors ?? []).map((e) => `${e.code} ${e.message}`).join("; ");
  return { status: reply.status, ok: reply.ok && said?.success !== false, result: said?.result ?? null, errors };
}

/** The relay asked as Stream will ask it, before Stream is: a HEAD and one byte. A no here costs nothing at Stream. */
async function tryRelay(address, clip) {
  const head = await fetch(address, { method: "HEAD", signal: within(MINUTE_MS) });
  if (head.status !== 200 || head.headers.get("content-length") !== String(clip.size))
    refuse(
      `the relay's HEAD answered ${head.status}, length ${head.headers.get("content-length")}: Stream is not asked. Nothing was spent there.`,
    );
  const one = await fetch(address, { headers: { range: "bytes=0-0" }, signal: within(MINUTE_MS) });
  const where = one.headers.get("content-range");
  await one.arrayBuffer();
  if (one.status !== 206 || where !== `bytes 0-0/${clip.size}`)
    refuse(`the relay's range read answered ${one.status}, ${where}: Stream is not asked. Nothing was spent there.`);
  say("The relay answers a HEAD and a range as Stream needs.");
}

/**
 * What signs a look at a video's copies: the playback host's customer code (the settings', or read off the video's own
 * playback address) and a signing key (the settings', or one made for this run and deleted after it, so production's key
 * is never needed on this PC). Null where Stream gives neither.
 */
async function signingFor(video) {
  const customerCode =
    settings.CLOUDFLARE_STREAM_CUSTOMER_CODE?.trim() ||
    /customer-([a-z0-9]+)\.cloudflarestream\.com/.exec(video.playback?.hls ?? "")?.[1];
  if (!customerCode) return null;
  const keyId = settings.CLOUDFLARE_STREAM_KEY_ID?.trim();
  const jwk = settings.CLOUDFLARE_STREAM_KEY_JWK?.trim();
  if (keyId && jwk) return { customerCode, keyId, jwk, madeHere: false };
  const made = await askStream("POST", "/keys");
  return made.ok && typeof made.result?.id === "string" && typeof made.result?.jwk === "string"
    ? { customerCode, keyId: made.result.id, jwk: made.result.jwk, madeHere: true }
    : null;
}

/** Stream's sharpest copy, asked for as the app asks before it cuts a video: null while it is still being made. */
async function readSharpest(signing, uid, video) {
  const token = streamTokenOf({ keyId: signing.keyId, jwk: signing.jwk }, { uid, seconds: 60 * 60 });
  const read = await readStreamCopy(signing.customerCode, token, {
    width: video.input?.width > 0 ? video.input.width : null,
    height: video.input?.height > 0 ? video.input.height : null,
  });
  return read.ok ? { width: read.width, height: read.height } : null;
}

async function waitForSharpest(uid, video, startedMs) {
  const signing = await signingFor(video);
  if (!signing) return { ms: null, why: "not checked: Stream gave no signing key or playback address for it" };
  const until = startedMs + Number(flag("--sharpest-minutes") ?? 40) * MINUTE_MS;
  say("Waiting for Stream's sharpest copy (the one a made video is cut from) ...");
  try {
    for (;;) {
      const sharpest = await readSharpest(signing, uid, video);
      if (sharpest) return { ms: Date.now() - startedMs, ...sharpest };
      if (Date.now() >= until)
        return { ms: null, why: `not there ${durationWords(Date.now() - startedMs)} after Stream was asked` };
      await pause(SHARPEST_EVERY_MS);
    }
  } finally {
    if (signing.madeHere) await askStream("DELETE", `/keys/${signing.keyId}`);
  }
}

/**
 * The road itself: the run left at the door, the relay tried, Stream asked to fetch the clip from the relay's address, and
 * the wait for ready. Answers the run's numbers; the key is wiped from the door whatever happens.
 */
async function fetchThroughRelay(clip, firstKey, { breakAfterMs = null, sharpest = true } = {}) {
  let key = firstKey;
  const ticket = await signTicket(need("FOOTAGE_TICKET_KEY"), {
    item: clip.fileId,
    expiresAt: Math.floor(Date.now() / SECOND_MS) + TICKET_SECONDS,
  });
  const address = clipAddressOf(need("FOOTAGE_RELAY_URL"), { item: clip.fileId, mime: clip.mime }, ticket);
  try {
    await askDoor("DELETE", `/runs/${clip.fileId}`);
    await leaveRun(clip, key, null);
    await tryRelay(address, clip);
    // What this script asked is wiped, so the count below is Stream's alone.
    await askDoor("DELETE", `/runs/${clip.fileId}`);
    await leaveRun(clip, key, breakAfterMs);

    const startedMs = Date.now();
    const asked = await askStream("POST", "/copy", {
      input: address,
      meta: { name: `footage-proof ${clip.fileId}` },
      requireSignedURLs: true,
    });
    if (!asked.ok || !/^[0-9a-f]{32}$/i.test(asked.result?.uid ?? ""))
      refuse(`Stream would not take the address (status ${asked.status}${asked.errors ? `: ${asked.errors}` : ""}).`);
    const uid = asked.result.uid;
    say(`Stream was asked to fetch the clip, and calls it ${uid}.`);

    const until = startedMs + Number(flag("--ready-minutes") ?? 30) * MINUTE_MS;
    let video = asked.result;
    let said = "";
    let downloadMs = null;
    for (;;) {
      const state = video.status?.state ?? "unknown";
      const now = `${state}${video.status?.pctComplete ? ` ${Math.round(Number(video.status.pctComplete))}%` : ""}`;
      if (now !== said) say(`  +${durationWords(Date.now() - startedMs).padEnd(11)} ${now}`);
      said = now;
      if (downloadMs === null && state !== "downloading" && state !== "pendingupload")
        downloadMs = Date.now() - startedMs;
      if (video.readyToStream === true || state === "ready" || state === "error" || Date.now() >= until) break;
      await pause(STATUS_EVERY_MS);
      if (Date.now() > key.expiresAt - KEY_RENEW_MS) {
        key = await driveKey();
        await leaveRun(clip, key, breakAfterMs);
      }
      const read = await askStream("GET", `/${uid}`);
      if (read.ok && read.result) video = read.result;
    }
    const endedMs = Date.now() - startedMs;
    const ready = video.readyToStream === true || video.status?.state === "ready";
    const run = {
      uid,
      state: ready ? "ready" : (video.status?.state ?? "unknown"),
      readyMs: ready ? endedMs : null,
      endedMs,
      downloadMs,
      errorCode: video.status?.errorReasonCode || video.status?.errorReasonText || null,
      streamBytes: typeof video.size === "number" ? video.size : null,
      streamSeconds: typeof video.duration === "number" && video.duration > 0 ? video.duration : null,
      driveBytes: clip.size,
      startedMs,
    };
    if (ready && sharpest) run.sharpest = await waitForSharpest(uid, video, startedMs);
    const tally = await askDoor("GET", `/runs/${clip.fileId}`);
    run.asked = tally.status === 200 ? tally.said.asked : [];
    return run;
  } finally {
    // The hour's key leaves the door with the run, whatever became of it.
    await askDoor("DELETE", `/runs/${clip.fileId}`).catch(() =>
      say("The proof's key door could not be reached to wipe the run: run forget."),
    );
  }
}

function sayRun(run, breakAfterMs) {
  const units = unitsOf(run.asked);
  say();
  for (const line of verdictLines(run)) say(line);
  if (run.streamSeconds !== null) say(`Stream gives its length as ${run.streamSeconds.toFixed(1)} s.`);
  if (run.downloadMs !== null) say(`Stream had the bytes ${durationWords(run.downloadMs)} after it was asked.`);
  say(`Requests the relay served for this clip: ${units.requests} (${units.heads} HEAD, ${units.gets} GET).`);
  say(
    `Google units for this clip: ${units.units} (a HEAD is ${DRIVE_UNITS.record}, a GET ${DRIVE_UNITS.download}), beside this script's own reads.`,
  );
  for (const line of askedLines(run.asked, run.startedMs)) say(line);
  if (breakAfterMs) for (const line of breakLines(run.asked, breakAfterMs)) say(line);
  else if (run.downloadMs !== null)
    say(
      `For the break run, half of the download's time: --break-after ${Math.max(0.5, run.downloadMs / 2 / SECOND_MS).toFixed(1)}`,
    );
  say();
  say(`The copy is kept at Stream as ${run.uid} and counts toward the account's minutes.`);
  say(`  to time it coming back: return --file <the same file> --uid ${run.uid} --apply`);
  say(`  to delete it:           forget --file <the same file> --uid ${run.uid} --apply`);
}

function keepRecord(clip, run, more = {}) {
  const out = flag("--out");
  if (!out) return;
  const { name: _name, ...clipFacts } = clip;
  fs.writeFileSync(
    out,
    `${JSON.stringify({ at: new Date().toISOString(), clip: clipFacts, run, ...more }, null, 2)}\n`,
    { flag: "wx" },
  );
  say(`The run's numbers are in ${out} (no key, no name).`);
}

/* ------------------------------------------------------------------------------------------------------- modes -- */

async function take() {
  const fileId = flag("--file") ?? refuse("--file is the clip's id in Drive (the long word in its address)");
  const breakSeconds = flag("--break-after");
  const breakAfterMs = breakSeconds === undefined ? null : Math.round(Number(breakSeconds) * SECOND_MS);
  if (breakAfterMs !== null && !(breakAfterMs > 0))
    refuse("--break-after is a number of seconds, as the first run suggested");
  const key = await driveKey();
  const clip = await readClip(key, fileId);
  sayClip(clip);
  if (!apply) {
    say();
    say(
      "Dry run: Stream was not asked and nothing was spent there. Re-run with --apply to fetch the clip through the relay.",
    );
    return;
  }
  const run = await fetchThroughRelay(clip, key, { breakAfterMs });
  sayRun(run, breakAfterMs);
  keepRecord(clip, run);
}

async function bringBack() {
  const fileId = flag("--file") ?? refuse("--file is the clip's id in Drive");
  const uid = flag("--uid") ?? refuse("--uid is the Stream copy to delete and bring back (a take run printed it)");
  const was = await askStream("GET", `/${uid}`);
  if (!was.ok) refuse(`Stream does not hold ${uid} (status ${was.status}).`);
  say(
    `Stream holds ${uid}: ${was.result?.status?.state ?? "unknown"}, ${was.result?.duration > 0 ? `${was.result.duration.toFixed(1)} s` : "length not said"}.`,
  );
  if (!apply) {
    say(
      "Dry run: with --apply the copy is DELETED at Stream, then fetched again through the relay, and both are timed.",
    );
    return;
  }
  const key = await driveKey();
  const clip = await readClip(key, fileId);
  const deleteStarted = Date.now();
  const gone = await askStream("DELETE", `/${uid}`);
  if (!gone.ok && gone.status !== 404)
    refuse(`Stream would not delete ${uid} (status ${gone.status}${gone.errors ? `: ${gone.errors}` : ""}).`);
  while ((await askStream("GET", `/${uid}`)).status !== 404) await pause(SECOND_MS);
  const deleteMs = Date.now() - deleteStarted;
  say(`Deleted at Stream in ${durationWords(deleteMs)}.`);
  const run = await fetchThroughRelay(clip, key, { sharpest: false });
  say();
  say(
    run.state === "ready"
      ? `Back and playable ${durationWords(run.readyMs)} after it was asked for (letting go took ${durationWords(deleteMs)}).`
      : `NOT back: Stream says "${run.state}" after ${durationWords(run.endedMs)}${run.errorCode ? ` (${run.errorCode})` : ""}.`,
  );
  const units = unitsOf(run.asked);
  say(
    `Requests the relay served: ${units.requests} (${units.heads} HEAD, ${units.gets} GET): ${units.units} Google units, a full download again.`,
  );
  for (const line of askedLines(run.asked, run.startedMs)) say(line);
  say(`The new copy is ${run.uid}. To delete it: forget --file <the same file> --uid ${run.uid} --apply`);
  keepRecord(clip, run, { deleteMs, was: uid });
}

async function forget() {
  const fileId = flag("--file") ?? refuse("--file is the clip's id in Drive");
  const wiped = await askDoor("DELETE", `/runs/${fileId}`);
  say(
    wiped.status === 200
      ? "The run and its key are wiped from the proof's key door."
      : `The key door answered ${wiped.status}.`,
  );
  const uid = flag("--uid");
  if (!uid) return;
  if (!apply) return say(`Dry run: with --apply the Stream copy ${uid} is deleted.`);
  const gone = await askStream("DELETE", `/${uid}`);
  say(
    gone.ok || gone.status === 404
      ? `The Stream copy ${uid} is deleted.`
      : `Stream would not delete ${uid} (status ${gone.status}).`,
  );
}

const MODES = { keys: makeKeys, "sign-in": signIn, take, return: bringBack, forget };
try {
  if (!Object.hasOwn(MODES, mode ?? ""))
    refuse(`say what to do: ${Object.keys(MODES).join(", ")} (the top of this file says what each takes)`);
  const out = flag("--out");
  if (mode !== "keys" && out && fs.existsSync(out))
    refuse(`${out} exists: name a new file, so nothing kept is overwritten`);
  readSettings();
  await MODES[mode]();
} catch (e) {
  if (!(e instanceof Refusal)) throw e;
  console.error(`REFUSING: ${e.message}`);
  process.exitCode = 1;
}
