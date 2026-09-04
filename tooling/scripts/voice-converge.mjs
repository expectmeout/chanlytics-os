/**
 * Voice shell converger (prod-script bar): dry-run DEFAULT, JSONL backup of the
 * live agent, LLM and number BEFORE any apply, idempotent (a converged line
 * plans nothing), --apply to execute.
 *
 * Brings a hand-typed Retell agent onto the product's shell — the prompt
 * becomes `{{business_facts}}` + `{{caller_context}}`, the greeting becomes
 * `{{greeting}}`, the transfer tool dials `{{handoff_number}}` (warm), and
 * every placeholder gets a spoken default — so the facts the phone agent
 * states come from Settings, per call, like the WhatsApp receptionist's do.
 * The plan is computed by `planVoiceConvergence` in packages/channels, the
 * same function /api/diag uses to report drift, so what the dry run prints is
 * exactly what --apply sends.
 *
 * ⚠️ The phone line runs the LATEST agent version, published or not (proved by
 * real calls carrying agent_version 1 while v0 was the published one). An
 * --apply edits the draft the line is answering with: it changes what the
 * NEXT CALLER hears. Run the dry run, read the plan, then apply. Updating a
 * draft edits it in place; updating a published version creates a new draft —
 * the before/after versions are printed either way, and the diagnostic reads
 * the LLM through the agent's own response_engine, so a version the agent
 * does not point at shows as drift, never as done.
 *
 * Env:  RETELL_API_KEY   (never stored anywhere; paste it for the run)
 *       VOICE_AGENT_ID   e.g. agent_242005d0ce9352af2cef792432
 *       VOICE_NUMBER     the line, E.164 (only read for --pin)
 *       RETELL_FN_SECRET optional — sets the booking tool's x-fn-secret header
 *                        when the live tool has none (the edge refuses calls
 *                        without it). A live header is carried over untouched.
 *       VOICE_FN_URL     optional — where the booking tool posts
 *
 * Usage: node tooling/scripts/voice-converge.mjs [--apply] [--pin] [--retention-days N]
 *   --pin   also bind the number to agent_version "latest_published" (weight
 *           1), so a later draft cannot go live by being saved. REFUSED while
 *           the latest version is unpublished — pinning then would switch the
 *           line back to the stale published one.
 *   --retention-days N   also ask the provider to delete calls after N days
 *           (1–730). Retention is a product decision, so it is never part of
 *           the drift the script closes on its own.
 *
 * The agent's own settings are planned too (planAgentSettings): the
 * transcript_updated event, a 20 s webhook budget, signed recording links.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { desiredVoiceShell, planVoiceConvergence, planAgentSettings, DEFAULT_FN_URL } from "@chanlytics/channels";

const KEY = process.env.RETELL_API_KEY;
const AGENT_ID = process.env.VOICE_AGENT_ID;
if (!KEY || !AGENT_ID) { console.error("RETELL_API_KEY and VOICE_AGENT_ID required"); process.exit(2); }
const apply = process.argv.includes("--apply");
const pin = process.argv.includes("--pin");
const retentionArg = process.argv.indexOf("--retention-days");
const retentionDays = retentionArg >= 0 ? Number(process.argv[retentionArg + 1]) : undefined;
const BASE = "https://api.retellai.com";

async function call(method, path, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await r.text();
  if (!r.ok) { console.error(`${method} ${path} -> HTTP ${r.status}: ${text.slice(0, 400)}`); process.exit(1); }
  return text ? JSON.parse(text) : null;
}

// 1. Read the live objects. The LLM is read at the version the agent points
//    at — a converged LLM the agent does not use would be a false "done".
const agent = await call("GET", `/get-agent/${AGENT_ID}`);
const engine = agent.response_engine ?? {};
if (engine.type !== "retell-llm" || !engine.llm_id) {
  console.error(`agent ${AGENT_ID} is not on a Retell LLM (response_engine: ${JSON.stringify(engine)}); nothing to converge`);
  process.exit(1);
}
const llmPath = `/get-retell-llm/${engine.llm_id}${engine.version !== undefined && engine.version !== null ? `?version=${engine.version}` : ""}`;
const llm = await call("GET", llmPath);
const number = process.env.VOICE_NUMBER
  ? await call("GET", `/get-phone-number/${encodeURIComponent(process.env.VOICE_NUMBER)}`)
  : null;

// 2. Backup, ALWAYS, before any apply. The LLM carries the booking tool's
//    secret header, which is why tooling/backups/ is gitignored.
const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "backups");
mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(backupsDir, `voice-shell-${stamp}.jsonl`);
writeFileSync(
  backupPath,
  [{ kind: "agent", ...agent }, { kind: "llm", ...llm }, ...(number ? [{ kind: "number", ...number }] : [])]
    .map((o) => JSON.stringify(o))
    .join("\n") + "\n",
);
console.log(`backup: ${backupPath}`);
console.log(`agent ${agent.agent_id} "${agent.agent_name}" version ${agent.version} published=${agent.is_published}`);
console.log(`llm ${llm.llm_id} version ${llm.version} (${(llm.general_prompt ?? "").length} chars of prompt)`);

// 3. The plan. The live booking tool's headers are carried over; a tool with
//    none gets the env secret if given, and is otherwise reported.
const liveBooking = (llm.general_tools ?? []).find((t) => t.name === "send_booking_link");
const headers = liveBooking?.headers
  ?? (process.env.RETELL_FN_SECRET ? { "x-fn-secret": process.env.RETELL_FN_SECRET } : null);
const desired = desiredVoiceShell(process.env.VOICE_FN_URL || liveBooking?.url || DEFAULT_FN_URL, headers);
const plan = planVoiceConvergence(llm, desired);

console.log("\nplan:");
if (!plan.drift.length) console.log("  converged — nothing to change");
for (const line of plan.drift) console.log(`  - ${line}`);
if (!headers) console.log("  ! send_booking_link will have NO x-fn-secret header — set RETELL_FN_SECRET or add it in Retell, or the edge refuses the tool");
if (plan.llmPatch) console.log(`  PATCH /update-retell-llm/${llm.llm_id} with: ${Object.keys(plan.llmPatch).join(", ")}`);

// The agent's own settings: the events, the webhook budget, signed links.
const agentPlan = planAgentSettings(agent, retentionDays !== undefined ? { retentionDays } : {});
console.log("\nagent settings:");
if (!agentPlan.drift.length) console.log("  converged — nothing to change");
for (const line of agentPlan.drift) console.log(`  - ${line}`);
if (agentPlan.agentPatch) console.log(`  PATCH /update-agent/${agent.agent_id} with: ${Object.keys(agentPlan.agentPatch).join(", ")}`);

// The pin is a separate decision with its own guard.
let numberPatch = null;
if (pin) {
  if (!number) console.log("  ! --pin needs VOICE_NUMBER");
  else if (!agent.is_published) console.log(`  ! refusing --pin: version ${agent.version} is not published — the line would switch back to the stale published version. Publish first (POST /publish-agent-version/${agent.agent_id}).`);
  else {
    const bound = (number.inbound_agents ?? []).find((a) => a.agent_id === agent.agent_id);
    if (bound?.agent_version === "latest_published") console.log("  number already pinned to latest_published");
    else numberPatch = { inbound_agents: [{ agent_id: agent.agent_id, agent_version: "latest_published", weight: 1 }] };
    if (numberPatch) console.log(`  PATCH /update-phone-number/${number.phone_number} inbound_agents -> ${agent.agent_id} @ latest_published`);
  }
}

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to execute.");
  process.exit(0);
}

// 4. Apply exactly the plan.
if (plan.llmPatch) {
  const after = await call("PATCH", `/update-retell-llm/${llm.llm_id}`, plan.llmPatch);
  console.log(`\nllm updated: version ${llm.version} -> ${after.version}`);
  if (after.version !== llm.version) {
    console.log(`  ! Retell created a new LLM version. The agent's response_engine points at version ${engine.version ?? "latest"}; check /api/diag voiceAgents[].shell before trusting the line.`);
  }
  const again = planVoiceConvergence(after, desired);
  console.log(again.drift.length ? `  ! still drifting: ${again.drift.join("; ")}` : "  converged (re-planned against the response)");
} else {
  console.log("\nllm: nothing to apply");
}
if (agentPlan.agentPatch) {
  const after = await call("PATCH", `/update-agent/${agent.agent_id}`, agentPlan.agentPatch);
  console.log(`agent updated: version ${agent.version} -> ${after.version}`);
} else {
  console.log("agent: nothing to apply");
}
if (numberPatch) {
  const n = await call("PATCH", `/update-phone-number/${encodeURIComponent(number.phone_number)}`, numberPatch);
  console.log(`number bound: ${JSON.stringify(n.inbound_agents)}`);
}
