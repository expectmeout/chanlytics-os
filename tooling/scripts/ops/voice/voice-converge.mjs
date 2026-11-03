/**
 * The phone agents brought onto the product's shell and settings, by hand: the platform's knock on the edge's
 * voice-converge door (apps/edge/api/admin/voice-converge.ts), which holds the provider key and plans and applies
 * everything (decision 0092). This script used to call the provider itself with RETELL_API_KEY pasted on a laptop; the
 * key now lives on the edge and nowhere else, as voice-provision.mjs already did.
 *
 * What the door converges, every agent a voice line answers in (or the one named): the LLM's shell (the prompt, its
 * placeholders and their spoken defaults, the four tools, with the shared secret's header only while the voice doors
 * still read it) and the agent's settings (the webhook and its events, the webhook budget, signed recording links, the
 * post-call analysis fields, the silence reminders, the locales its workspace speaks, the call's limits: twenty minutes
 * a call, thirty seconds of silence, a week at the provider). A published version cannot change, so an apply lands the
 * patches on a new draft; --publish publishes it, so a number pinned to latest_published follows. --pin <number>, with
 * --agent, binds that number to latest_published; the door refuses it while the latest version is a draft.
 *
 * Dry run DEFAULT: the door plans and this prints the plan. --apply does it; the answer, which carries each agent as it
 * was before any change (the backup), is kept under tooling/backups/ (ignored) before anything else is said.
 *
 *   EDGE_CALL_SECRET=… node --import tsx tooling/scripts/ops/voice/voice-converge.mjs [--agent agent_…] [--apply] [--publish] [--agents-only] [--pin +1…]
 *   BASE_URL      the edge (default: production's)
 *   BACKUP_DIR    where an apply's answer is kept (default tooling/backups/, ignored)
 *
 * The knock is a token minted for this door and this exact body that names no workspace (the door is the platform's
 * alone). DIAG_KEY in place of the secret opens it only on an edge that holds none (a preview). The secret is read from
 * the environment and never printed.
 *
 * Exit 0 = planned (or done, with --apply). 1 = the door refused, or an agent's step failed. 2 = could not run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";

const DOOR = "/api/admin/voice-converge";
const BASE = (process.env.BASE_URL || "https://chanlytics-messaging.vercel.app").replace(/\/+$/, "");
const SECRET = process.env.EDGE_CALL_SECRET;
const KEY = process.env.DIAG_KEY;
/** How long the door may take: two provider reads an agent, and an apply's draft, patches and publish. */
const WAIT_MS = 90 * 1000;

/** The value after a flag, or null where it is not given. */
function flag(name) {
  const at = process.argv.indexOf(name);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1] : null;
}

const apply = process.argv.includes("--apply");
const publish = process.argv.includes("--publish");
const agentsOnly = process.argv.includes("--agents-only");
const agent = flag("--agent");
const pin = flag("--pin");

if (!SECRET && !KEY) {
  console.error("EDGE_CALL_SECRET (or DIAG_KEY, for an edge without the secret) is required");
  process.exit(2);
}
if (agent && !/^agent_[a-z0-9]+$/i.test(agent)) {
  console.error(`--agent takes an agent id, like agent_… (given: ${agent})`);
  process.exit(2);
}
if (pin && !agent) {
  console.error("--pin takes the number of the agent named with --agent");
  process.exit(2);
}

const body = JSON.stringify({
  ...(agent ? { agent_id: agent } : {}),
  apply,
  publish,
  ...(agentsOnly ? { shell: false } : {}),
  ...(pin ? { pin_number: pin } : {}),
});
// One token for this door and this body, a minute's life, naming no workspace; the key only where no secret is held.
const credential = SECRET ? { "x-edge-token": signEdgeToken(SECRET, DOOR, { body }) } : { "x-diag-key": KEY };

let res;
try {
  res = await fetch(`${BASE}${DOOR}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...credential },
    body,
    signal: AbortSignal.timeout(WAIT_MS),
  });
} catch (e) {
  console.error(`could not reach ${BASE}${DOOR}: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
const answer = await res.json().catch(() => ({}));

// An apply's answer is the record of what each agent was before it: kept before anything else is said.
if (apply) {
  const dir = process.env.BACKUP_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const kept = join(dir, `voice-converge-${stamp}.json`);
  writeFileSync(
    kept,
    JSON.stringify({ at: new Date().toISOString(), base: BASE, status: res.status, answer }, null, 2) + "\n",
  );
  console.log(`kept: ${kept}`);
}

console.log(
  `voice-converge: ${apply ? `APPLY${publish ? " + publish" : ""}` : "dry run"} against ${BASE} (HTTP ${res.status})`,
);
let failed = false;
for (const a of answer.agents ?? []) {
  console.log(`\n${a.agent_id}  v${a.version ?? "?"} published=${a.is_published ?? "?"}`);
  if (a.error && typeof a.error === "string") {
    console.log(`  ! ${a.error}`);
    failed = true;
    continue;
  }
  const shell = a.shell ?? {};
  if (shell.error) console.log(`  shell: ${shell.error}`);
  else if (shell.drift) {
    console.log(`  shell${shell.drift.length ? "" : ": converged"}`);
    for (const line of shell.drift) console.log(`    - ${line}`);
  }
  console.log(`  agent settings${a.drift?.length ? "" : ": converged"}`);
  for (const line of a.drift ?? []) console.log(`    - ${line}`);
  for (const line of [...(shell.notes ?? []), ...(a.notes ?? [])]) console.log(`    (kept) ${line}`);
  if (a.note) console.log(`  ! ${a.note}`);
  if (a.applied) console.log(`  applied${a.published_version ? `, published v${a.published_version}` : ""}`);
  if (a.pin) {
    const p = a.pin;
    console.log(
      `  pin: ${p.refused ? `refused, ${p.refused}` : p.already ? "already latest_published" : p.would_pin ? "would bind to latest_published" : p.pinned ? "bound to latest_published" : `failed, HTTP ${p.error?.status}`}`,
    );
    if (p.error) failed = true;
  }
  if (a.error) {
    console.log(`  ! ${a.error.step}: HTTP ${a.error.status}`);
    failed = true;
  }
}

if (!res.ok || answer.ok === false) {
  console.error(`\nrefused: ${answer.error ?? `HTTP ${res.status}`}${answer.detail ? ` — ${answer.detail}` : ""}`);
  process.exit(1);
}
if (failed) process.exit(1);
if (!apply) console.log("\nDry run only. Re-run with --apply (and --publish) to do it.");
