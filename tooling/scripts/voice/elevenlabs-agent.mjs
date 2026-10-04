#!/usr/bin/env node
/**
 * The ElevenLabs agent, from code (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.7), as the
 * receptionist's Retell agent is converged from code: one script, idempotent, dry-run by default, that creates or
 * updates the one agent by name and reads every field back, so the console is read and never written by hand. The
 * body is elevenlabs-agent-config.mjs.
 *
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --name chanlytics-ask --url https://<host>/api/ask/voice/llm
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --name … --url … --voice <voice_id> [--webhook <id>] --apply
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --read <agent_id>
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --set-url <agent_id> --url <url>     (a laptop's tunnel moved)
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --probe --name chanlytics-ask-probe  (the vendor's field names)
 *   node tooling/scripts/voice/elevenlabs-agent.mjs --delete <agent_id>
 *
 * The key is ELEVENLABS_API_KEY from the environment, else apps/edge/.env.local (the edge holds every provider key),
 * else apps/dashboard/.env.local (a laptop running the spike); it is never printed. The header's value is
 * ELEVENLABS_LLM_SECRET from the environment or the dashboard's .env.local, never printed either.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentConfig, shownConfig } from "./elevenlabs-agent-config.mjs";

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
const SECRET = process.env.ELEVENLABS_LLM_SECRET || dashboardEnv.ELEVENLABS_LLM_SECRET;

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

function keysOf(o, depth = 0) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return typeof o;
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = depth < 2 ? keysOf(v, depth + 1) : typeof v;
  return out;
}

async function findByName(name) {
  const r = await call("GET", `/v1/convai/agents?search=${encodeURIComponent(name)}&page_size=20`);
  const list = r.json?.agents ?? [];
  return list.find((a) => a.name === name) ?? null;
}

/** What --apply reads back, so a converged agent is proved and not assumed. */
function readBack(agent) {
  const cc = agent?.conversation_config ?? {};
  const ps = agent?.platform_settings ?? {};
  return {
    custom_llm: { ...(cc.agent?.prompt?.custom_llm ?? {}), request_headers: "<hidden>" },
    llm: cc.agent?.prompt?.llm,
    cascade_timeout_seconds: cc.agent?.prompt?.cascade_timeout_seconds,
    first_message: cc.agent?.first_message,
    language: cc.agent?.language,
    client_events: cc.conversation?.client_events,
    max_duration_seconds: cc.conversation?.max_duration_seconds,
    turn: cc.turn,
    tts: cc.tts,
    asr: cc.asr,
    auth: ps.auth,
    overrides: ps.overrides,
    privacy: ps.privacy,
    call_limits: ps.call_limits,
    webhooks: ps.workspace_overrides?.webhooks ?? null,
  };
}

async function main() {
  if (!KEY) {
    console.error(
      "ELEVENLABS_API_KEY is not set (the environment, apps/edge/.env.local or apps/dashboard/.env.local).",
    );
    process.exit(2);
  }
  const name = opt("name", "chanlytics-ask");
  if (flag("read")) {
    const r = await call("GET", `/v1/convai/agents/${opt("read")}`);
    console.log(JSON.stringify(r.json ?? r.text, null, 2));
    return;
  }
  if (flag("delete")) {
    const id = opt("delete");
    const r = await call("DELETE", `/v1/convai/agents/${id}`);
    console.log(`delete ${id}: ${r.status}`);
    return;
  }
  if (flag("set-url")) {
    // The brain door's public address changes with every tunnel: patch only the URL on an existing agent.
    const id = opt("set-url");
    const url = opt("url");
    if (!url || !SECRET) {
      console.error("--url and ELEVENLABS_LLM_SECRET are required");
      process.exit(2);
    }
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
  if (flag("probe")) {
    const existing = await findByName(name);
    let id = existing?.agent_id;
    if (!id) {
      const made = await call("POST", "/v1/convai/agents/create", {
        name,
        conversation_config: { agent: { prompt: { prompt: "probe" } } },
      });
      if (!made.ok) {
        console.error("create refused:", made.status, made.text.slice(0, 600));
        process.exit(1);
      }
      id = made.json.agent_id;
    }
    const r = await call("GET", `/v1/convai/agents/${id}`);
    console.log("agent_id:", id);
    console.log(JSON.stringify(keysOf(r.json), null, 2));
    return;
  }
  const url = opt("url");
  if (!url) {
    console.error("--url <the brain door's public URL> is required");
    process.exit(2);
  }
  if (!SECRET) {
    console.error("ELEVENLABS_LLM_SECRET is not set (the environment or apps/dashboard/.env.local).");
    process.exit(2);
  }
  const body = agentConfig({
    name,
    url,
    secret: SECRET,
    voiceId: opt("voice", "SAz9YHcvj6GT2YYXdXww"),
    language: opt("language", "en"),
    webhookId: opt("webhook", null),
    concurrency: Number(opt("concurrency", "4")),
    daily: Number(opt("daily", "200")),
  });
  if (!flag("apply")) {
    console.log("dry run; the body that --apply would send:");
    console.log(JSON.stringify(shownConfig(body), null, 2));
    return;
  }
  const existing = await findByName(name);
  const r = existing
    ? await call("PATCH", `/v1/convai/agents/${existing.agent_id}`, body)
    : await call("POST", "/v1/convai/agents/create", body);
  if (!r.ok) {
    console.error(`${existing ? "update" : "create"} refused:`, r.status, r.text.slice(0, 1200));
    process.exit(1);
  }
  const id = existing?.agent_id ?? r.json?.agent_id;
  console.log(`${existing ? "updated" : "created"} agent_id: ${id}`);
  const back = await call("GET", `/v1/convai/agents/${id}`);
  console.log(JSON.stringify(readBack(back.json), null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
