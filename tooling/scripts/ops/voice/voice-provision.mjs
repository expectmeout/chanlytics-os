/**
 * A workspace's phone receptionist on a Retell-owned number, set up by hand: the platform's knock on the edge's
 * voice-provision door (apps/edge/api/admin/voice-provision.ts) for a workspace that asked for a line (Setup's "Ask for
 * a line", which mails the platform: apps/edge/lib/ops/setup-request.ts names this script). Dry run DEFAULT: the door
 * plans and this prints the plan. --apply does it, and a number bought in an area code costs money every month.
 *
 * The knock is a token minted for this door, this workspace and this exact body, as the dashboard mints one
 * (packages/channels edge-token). An edge that holds EDGE_CALL_SECRET (production) lets the platform's key alone in only
 * at a door that names it, and this one does not: the key here answered 403 `token_required`. DIAG_KEY in place of the
 * secret opens the door only on an edge that holds none (a preview).
 *
 *   EDGE_CALL_SECRET=… node tooling/scripts/ops/voice/voice-provision.mjs --tenant <workspace id> --area-code 305 [--apply]
 *   EDGE_CALL_SECRET=… node tooling/scripts/ops/voice/voice-provision.mjs --tenant <workspace id> --number +13055550100 [--apply]
 *     --llm-id llm_… --agent-id agent_…   resume a run that failed after making them (a failure prints both)
 *   BASE_URL      the edge (default: production's)
 *   BACKUP_DIR    where an apply's answer is kept (default tooling/backups/, ignored)
 *
 * An apply's answer is kept, with the ids it made, so a failed run is resumed rather than repeated. The door returns
 * every address without its query string and never a provider's secret; this prints nothing more. The secret itself is
 * read from the environment and never printed.
 *
 * Exit 0 = planned (or done, with --apply). 1 = the door refused, or a step failed. 2 = could not run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";

const DOOR = "/api/admin/voice-provision";
const BASE = (process.env.BASE_URL || "https://chanlytics-messaging.vercel.app").replace(/\/+$/, "");
const SECRET = process.env.EDGE_CALL_SECRET;
const KEY = process.env.DIAG_KEY;
/** How long the door may take: an apply makes the agent, publishes it and buys or binds a number, leg by leg. */
const WAIT_MS = 90 * 1000;

/** The value after a flag, or null where it is not given. */
function flag(name) {
  const at = process.argv.indexOf(name);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1] : null;
}

const apply = process.argv.includes("--apply");
const tenant = flag("--tenant");
const area = flag("--area-code");
const number = flag("--number");
const llmId = flag("--llm-id");
const agentId = flag("--agent-id");

if (!SECRET && !KEY) {
  console.error("EDGE_CALL_SECRET (or DIAG_KEY, for an edge without the secret) is required");
  process.exit(2);
}
if (!tenant || !/^[0-9a-f-]{36}$/i.test(tenant)) {
  console.error("--tenant <workspace id> is required (the id the setup-request mail names)");
  process.exit(2);
}
if (!area && !number) {
  console.error("give --area-code <3 digits> to buy a number there, or --number <E.164> to bind one Retell holds");
  process.exit(2);
}
// The door reads an area code that is not three digits as none at all, so it is refused here, before a knock.
if (area && !/^\d{3}$/.test(area)) {
  console.error(`--area-code takes three digits, like 305 (given: ${area})`);
  process.exit(2);
}

// A number that is not E.164 is the plan's to refuse, in its own words.
const body = JSON.stringify({
  tenant_id: tenant,
  ...(area ? { area_code: Number(area) } : {}),
  ...(number ? { number } : {}),
  ...(llmId ? { llm_id: llmId } : {}),
  ...(agentId ? { agent_id: agentId } : {}),
  apply,
});
// One token for this door, this workspace and this body, a minute's life; the key only where no secret is held.
const credential = SECRET
  ? { "x-edge-token": signEdgeToken(SECRET, DOOR, { workspace: tenant, body }) }
  : { "x-diag-key": KEY };

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

// An apply's answer is the record of what it made: kept before anything else is said, so a failure can be resumed.
if (apply) {
  const dir = process.env.BACKUP_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const kept = join(dir, `voice-provision-${tenant}-${stamp}.json`);
  writeFileSync(
    kept,
    JSON.stringify({ at: new Date().toISOString(), base: BASE, status: res.status, answer }, null, 2) + "\n",
  );
  console.log(`kept: ${kept}`);
}

const who = answer.tenant ? `${answer.tenant.name} (${answer.tenant.slug})` : tenant;
console.log(`voice-provision for ${who}: ${apply ? "APPLY" : "dry run"} against ${BASE} (HTTP ${res.status})`);

const plan = answer.plan;
if (plan) {
  console.log("\nplan:");
  if (plan.nothing) console.log(`  nothing to do: ${plan.reason ?? "the line exists"}`);
  for (const s of plan.steps ?? []) console.log(`  - ${s.id}: ${s.action} — ${s.detail}`);
  for (const e of plan.errors ?? []) console.log(`  ! ${e}`);
}
if (answer.preview && !apply) {
  console.log("\nan apply would create:");
  for (const [k, v] of Object.entries(answer.preview)) console.log(`  ${k}: ${v}`);
}
if (answer.result) {
  console.log("\nresult:");
  for (const [k, v] of Object.entries(answer.result)) console.log(`  ${k}: ${JSON.stringify(v)}`);
}

if (!res.ok || answer.ok === false) {
  console.error(`\nrefused: ${answer.error ?? `HTTP ${res.status}`}${answer.detail ? ` — ${answer.detail}` : ""}`);
  // What a failed apply made is passed back on the next run, which reads each from the provider before trusting it.
  const made = answer.result ?? {};
  const again = [
    made.llm?.llm_id ? `--llm-id ${made.llm.llm_id}` : null,
    made.agent?.agent_id ? `--agent-id ${made.agent.agent_id}` : null,
  ].filter(Boolean);
  if (again.length) console.error(`resume with the same flags and: ${again.join(" ")}`);
  process.exit(1);
}
if (!apply) console.log("\nDry run only. Re-run with --apply to do it.");
