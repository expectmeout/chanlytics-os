#!/usr/bin/env node
/**
 * The ElevenLabs agent, from code (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.7 as amended 4 Oct
 * 2026), as the receptionist's Retell agent is converged from code: one script, idempotent, dry-run by default, that
 * creates or updates an agent by name, reads every field back and refuses to say "done" while any differs, so the
 * console is read and never written by hand. The body is elevenlabs-agent-config.mjs.
 *
 * Two agents, one body: production's (`chanlytics-ask`, the one production's edge names in ELEVENLABS_AGENT_ID) and
 * a laptop's (`chanlytics-ask-dev`, pointed at a tunnel). A tunnel's `--set-url` refuses the production name: the one
 * agent of 3 Oct served both, and the command that moved a laptop's tunnel would have moved production's brain.
 *
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --url https://<host>/api/ask/voice/llm                    (dry run, production's name)
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --url … [--webhook <id>] --apply                          (create or converge, then read back and diff)
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --name chanlytics-ask-dev --url https://<tunnel>/… --apply
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --check --url … [--name …] [--webhook <id>]              (read back and diff, write nothing)
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --read <agent_id>
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --set-url <agent_id> --url <url> [--apply]                 (the dev agent's tunnel moved; refused for production's)
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --delete <agent_id> [--apply]                              (refused for production's)
 *
 * Every write is a dry run until --apply, and the agent as it stood is saved first (tooling/backups/, untracked): the
 * body an update replaces, the agent a delete removes. The vendor keeps no history of either.
 *
 * The key is ELEVENLABS_API_KEY from the environment, else apps/edge/.env.local (the edge holds every provider key),
 * else apps/dashboard/.env.local (a laptop running the spike); it is never printed. The header's value is
 * ELEVENLABS_LLM_SECRET from the environment, else the edge's .env.local (which holds production's value beside the
 * key, so an --apply for production carries the header production's brain door checks; 4 Oct 2026 the dashboard's
 * file held a laptop's older one), else the dashboard's; never printed either.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentConfig,
  agentDrift,
  agentWritePlan,
  shownConfig,
  PRODUCTION_AGENT_NAME,
} from "./elevenlabs-agent-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const API = "https://api.elevenlabs.io";

function readEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
    );
  } catch {
    return {};
  }
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const edgeEnv = readEnvFile(path.join(ROOT, "apps/edge/.env.local"));
const dashboardEnv = readEnvFile(path.join(ROOT, "apps/dashboard/.env.local"));
const KEY = process.env.ELEVENLABS_API_KEY || edgeEnv.ELEVENLABS_API_KEY || dashboardEnv.ELEVENLABS_API_KEY;
const SECRET = process.env.ELEVENLABS_LLM_SECRET || edgeEnv.ELEVENLABS_LLM_SECRET || dashboardEnv.ELEVENLABS_LLM_SECRET;

async function call(method, route, body) {
  const r = await fetch(`${API}${route}`, {
    method,
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: r.status, ok: r.ok, json, text };
}

async function findByName(name) {
  const r = await call("GET", `/v1/convai/agents?search=${encodeURIComponent(name)}&page_size=20`);
  const list = r.json?.agents ?? [];
  return list.find((a) => a.name === name) ?? null;
}

/** The agent as it stands, saved before a write changes or removes it (the vendor hides the header's value on a read). */
function backUp(id, agent) {
  const dir = path.join(ROOT, "tooling/backups");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `elevenlabs-agent-${id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(agent, null, 2));
  console.log(`backup: ${file}`);
}

/**
 * One agent named by id, read, and the write to it allowed or not (agentWritePlan): answers the agent as read when
 * the write may go, having saved it; says why and exits when it may not, or when this is a dry run.
 */
async function readForWrite(verb, id) {
  const current = await call("GET", `/v1/convai/agents/${id}`);
  const plan = agentWritePlan({
    verb,
    id,
    agentName: current.ok ? (current.json?.name ?? null) : null,
    apply: flag("apply"),
  });
  if ("refused" in plan) {
    console.error(plan.refused);
    process.exit(1);
  }
  if ("dryRun" in plan) {
    console.log(plan.dryRun);
    process.exit(0);
  }
  backUp(id, current.json);
  return current.json;
}

/** The differences printed, one a line, with the secret never among them (agentDrift leaves the header's value out). */
function sayDrift(drift) {
  for (const d of drift) console.log(`  ${d.path}: want ${JSON.stringify(d.want)}, got ${JSON.stringify(d.got)}`);
}

/** The agent read back and held to the body: exits 1 on a difference, so a converge is proved and never assumed. */
async function checkAgainst(id, body) {
  const back = await call("GET", `/v1/convai/agents/${id}`);
  if (!back.ok) {
    console.error(`read back refused: ${back.status} ${back.text.slice(0, 400)}`);
    process.exit(1);
  }
  const drift = agentDrift(body, back.json);
  if (drift.length) {
    console.error(`${drift.length} field(s) differ from the body on agent ${id}:`);
    sayDrift(drift);
    process.exit(1);
  }
  console.log(
    `agent ${id} is the body, field for field (${Object.keys(body.conversation_config).length} sections read back).`,
  );
}

async function main() {
  if (!KEY) {
    console.error(
      "ELEVENLABS_API_KEY is not set (the environment, apps/edge/.env.local or apps/dashboard/.env.local).",
    );
    process.exit(2);
  }
  const name = opt("name", PRODUCTION_AGENT_NAME);
  if (flag("read")) {
    const r = await call("GET", `/v1/convai/agents/${opt("read")}`);
    console.log(JSON.stringify(r.json ?? r.text, null, 2));
    return;
  }
  if (flag("delete")) {
    const id = opt("delete");
    await readForWrite("delete", id);
    const r = await call("DELETE", `/v1/convai/agents/${id}`);
    console.log(`delete ${id}: ${r.status}`);
    return;
  }
  if (flag("set-url")) {
    // The brain door's public address changes with every tunnel: patch only the URL on the dev agent. Production's is
    // never moved this way: its address is the dashboard's host, and a laptop pointed it at itself once (3 Oct).
    const id = opt("set-url");
    const url = opt("url");
    if (!url || !SECRET) {
      console.error("--url and ELEVENLABS_LLM_SECRET are required");
      process.exit(2);
    }
    await readForWrite("set-url", id);
    const r = await call("PATCH", `/v1/convai/agents/${id}`, {
      conversation_config: {
        agent: {
          prompt: {
            llm: "custom-llm",
            custom_llm: { url, api_type: "chat_completions", request_headers: { "x-chanlytics-agent": SECRET } },
          },
        },
      },
    });
    console.log(`set-url ${id}: ${r.status}${r.ok ? "" : ` ${r.text.slice(0, 400)}`}`);
    return;
  }
  const url = opt("url");
  if (!url) {
    console.error("--url <the brain door's public URL> is required");
    process.exit(2);
  }
  if (!SECRET) {
    console.error(
      "ELEVENLABS_LLM_SECRET is not set (the environment, apps/edge/.env.local or apps/dashboard/.env.local).",
    );
    process.exit(2);
  }
  const body = agentConfig({
    name,
    url,
    secret: SECRET,
    ...(opt("voice") ? { voiceId: opt("voice") } : {}),
    webhookId: opt("webhook", null),
    concurrency: Number(opt("concurrency", "4")),
    daily: Number(opt("daily", "200")),
  });
  if (flag("check")) {
    const existing = await findByName(name);
    if (!existing) {
      console.error(`no agent named ${name}`);
      process.exit(1);
    }
    await checkAgainst(existing.agent_id, body);
    return;
  }
  if (!flag("apply")) {
    console.log("dry run; the body that --apply would send:");
    console.log(JSON.stringify(shownConfig(body), null, 2));
    return;
  }
  const existing = await findByName(name);
  if (existing) {
    const before = await call("GET", `/v1/convai/agents/${existing.agent_id}`);
    if (!before.ok) {
      console.error(`the agent as it stands could not be read to save it: ${before.status}; nothing sent`);
      process.exit(1);
    }
    backUp(existing.agent_id, before.json);
  }
  const r = existing
    ? await call("PATCH", `/v1/convai/agents/${existing.agent_id}`, body)
    : await call("POST", "/v1/convai/agents/create", body);
  if (!r.ok) {
    console.error(`${existing ? "update" : "create"} refused:`, r.status, r.text.slice(0, 1200));
    process.exit(1);
  }
  const id = existing?.agent_id ?? r.json?.agent_id;
  console.log(`${existing ? "updated" : "created"} agent_id: ${id}`);
  await checkAgainst(id, body);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
