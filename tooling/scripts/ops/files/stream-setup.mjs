#!/usr/bin/env node
/**
 * Cloudflare Stream's two one-time calls (decision 0099, stage B; the PRD's §16.3), on Ruben's word, from this PC with the
 * account's id and its Stream token in the environment for this run only:
 *
 *   PUT  /accounts/{id}/stream/webhook {notificationUrl}   points the account's one webhook at production's edge, and answers
 *                                                          the secret it signs with
 *   POST /accounts/{id}/stream/keys                        makes a signing key, and answers its id and its JWK
 *
 * A dry run by default: it reads the webhook as it stands (the backup) and says what it would do, and changes nothing. With
 * --apply it writes that backup first, then makes both calls, and writes the three values to the file --out names (a .env
 * fragment, made new, never overwritten), for the edge's env: CLOUDFLARE_STREAM_WEBHOOK_SECRET, CLOUDFLARE_STREAM_KEY_ID and
 * CLOUDFLARE_STREAM_KEY_JWK. No value is ever printed. A second key is a key more (up to 1,000); a second webhook call gives a
 * new secret, and the old one stops verifying, so the edge's env takes the new one at once.
 *
 *   node tooling/scripts/ops/files/stream-setup.mjs --edge https://<production-edge-host> --out <path>
 *   node tooling/scripts/ops/files/stream-setup.mjs --edge https://<production-edge-host> --out <path> --apply
 */
import fs from "node:fs";

const API = "https://api.cloudflare.com/client/v4/accounts";
/** Each call's bound: a small answer, with room for a slow one. */
const CALL_MS = 15_000;

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const apply = args.includes("--apply");
const edge = flag("--edge");
const out = flag("--out");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();

function refuse(words) {
  console.error(`REFUSING: ${words}`);
  process.exit(1);
}

if (!accountId || !token) refuse("set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN for this run");
if (!edge || !/^https:\/\/[^/]+$/.test(edge)) refuse("--edge is production's edge origin, https and no path");
if (!out) refuse("--out names the file the three values are written to");
if (fs.existsSync(out)) refuse(`${out} exists: name a new file, so nothing kept is overwritten`);

const notificationUrl = `${edge}/api/stream-webhook`;

async function call(method, path, body) {
  const res = await fetch(`${API}/${encodeURIComponent(accountId)}/stream${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(CALL_MS),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const said = (json?.errors ?? []).map((e) => `${e.code} ${e.message}`).join("; ");
    throw new Error(`${method} ${path} answered ${res.status}${said ? `: ${said}` : ""}`);
  }
  return json.result;
}

// The backup: the webhook as it stands, by its address alone (its secret is not answered by a read).
const was = await call("GET", "/webhook").catch(() => null);
console.log(`the account's webhook now: ${was?.notificationUrl ?? "none"}`);
console.log(`would point it at:        ${notificationUrl}`);
console.log("would make:               one signing key");

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to make both calls and write the three values to --out.");
  process.exit(0);
}

const backup = `${out}.backup.json`;
fs.writeFileSync(backup, `${JSON.stringify({ at: new Date().toISOString(), webhook: was ?? null }, null, 2)}\n`, {
  flag: "wx",
});
console.log(`backup written: ${backup}`);

const hook = await call("PUT", "/webhook", { notificationUrl });
const key = await call("POST", "/keys");
if (typeof hook?.secret !== "string" || typeof key?.id !== "string" || typeof key?.jwk !== "string")
  refuse("an answer named no secret or no key: nothing is written; read the account's webhook and keys by hand");
fs.writeFileSync(
  out,
  [
    `# Cloudflare Stream, made ${new Date().toISOString()} by tooling/scripts/ops/files/stream-setup.mjs: the edge's env, never chat.`,
    `CLOUDFLARE_STREAM_WEBHOOK_SECRET=${hook.secret}`,
    `CLOUDFLARE_STREAM_KEY_ID=${key.id}`,
    `CLOUDFLARE_STREAM_KEY_JWK=${key.jwk}`,
    "",
  ].join("\n"),
  { flag: "wx", mode: 0o600 },
);
console.log(`the webhook points at ${hook.notificationUrl ?? notificationUrl}; a signing key made.`);
console.log(
  `the three values are in ${out}: put them in the edge's env (production and preview), then delete the file.`,
);
