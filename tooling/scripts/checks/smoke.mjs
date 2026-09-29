/**
 * After a deploy: does it answer? The two doors with no key, read the way a pinger and the phone app read them.
 *
 *   GET <edge>/api/health        200 { ok: true, unhealthy: [], jobs_backlog, checked_at }: the platform's clocks and
 *                                its due work (apps/edge/api/health.ts). 503 { ok: false, ... } is the same door saying
 *                                something is wrong; --allow-unhealthy takes it as an answer (a preview with no database).
 *   GET <dashboard>/api/version  200 { sha }: the build the deployment runs (apps/dashboard/app/api/version/route.ts);
 *                                --sha names the one it must be.
 *
 *   node tooling/scripts/checks/smoke.mjs --edge https://<edge> --dashboard https://<dashboard> [--sha <commit>]
 *   node tooling/scripts/checks/smoke.mjs https://<one-host>     both doors on one host
 *
 * A protected preview takes VERCEL_AUTOMATION_BYPASS_SECRET as its bypass header. Each door is asked up to three
 * times, two seconds apart, for a cold start; each ask waits ten seconds at most. Exit 0 when every door answered as
 * it should, 1 when one did not, 2 when the command was wrong.
 */
import { pathToFileURL } from "node:url";

const ASKS = 3;
const PAUSE_MS = 2_000;
const WAIT_MS = 10_000;

/** What the health door answered, judged: null when it is an answer this run accepts, else why not. */
export function judgeHealth(status, body, { allowUnhealthy = false } = {}) {
  if (!body || typeof body !== "object") return `answered ${status} with no JSON body`;
  if (typeof body.ok !== "boolean") return `answered ${status} without a boolean ok`;
  if (!Array.isArray(body.unhealthy)) return `answered ${status} without an unhealthy list`;
  if (typeof body.checked_at !== "string" || Number.isNaN(Date.parse(body.checked_at)))
    return `answered ${status} without a checked_at time`;
  if (status === 200 && body.ok) return null;
  if (status === 503 && !body.ok)
    return allowUnhealthy
      ? null
      : `answered 503: ${body.reason ?? (body.unhealthy.join(", ") || "unhealthy")} (--allow-unhealthy takes it)`;
  return `answered ${status} with ok: ${body.ok}`;
}

/** What the version door answered, judged: null when it names a build (the one asked for, when one is). */
export function judgeVersion(status, body, { sha = null } = {}) {
  if (status !== 200) return `answered ${status}`;
  if (!body || typeof body.sha !== "string" || !body.sha) return "answered 200 without a sha";
  if (sha && body.sha !== sha && !body.sha.startsWith(sha)) return `runs ${body.sha}, not ${sha}`;
  return null;
}

/** The arguments, read: `{ edge, dashboard, sha, allowUnhealthy }`, or `{ error }`. */
export function argsOf(argv) {
  const out = { edge: null, dashboard: null, sha: null, allowUnhealthy: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--edge" || a === "--dashboard" || a === "--sha") out[a.slice(2)] = argv[++i] ?? null;
    else if (a === "--allow-unhealthy") out.allowUnhealthy = true;
    else if (a.startsWith("-")) return { error: `unknown flag ${a}` };
    else rest.push(a);
  }
  if (rest.length > 1) return { error: "one base URL at most; name two hosts with --edge and --dashboard" };
  if (rest[0]) {
    out.edge ??= rest[0];
    out.dashboard ??= rest[0];
  }
  if (!out.edge && !out.dashboard) return { error: "no host: pass a base URL, or --edge and/or --dashboard" };
  for (const k of ["edge", "dashboard"]) {
    if (!out[k]) continue;
    if (!/^https?:\/\//.test(out[k])) out[k] = `https://${out[k]}`;
    out[k] = out[k].replace(/\/+$/, "");
  }
  return out;
}

async function ask(url, headers) {
  let last = "no answer";
  for (let i = 0; i < ASKS; i++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(WAIT_MS) });
      const text = await r.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      if (r.status < 500 || body) return { status: r.status, body };
      last = `answered ${r.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (i < ASKS - 1) await new Promise((res) => setTimeout(res, PAUSE_MS));
  }
  return { status: 0, body: null, failed: last };
}

/** Every door asked for, asked and judged: `[{ door, url, problem }]`, problem null for a good answer. */
export async function smoke(args, env = process.env) {
  const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const headers = { accept: "application/json", ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}) };
  const out = [];
  if (args.edge) {
    const url = `${args.edge}/api/health`;
    const a = await ask(url, headers);
    out.push({ door: "health", url, problem: a.failed ?? judgeHealth(a.status, a.body, args) });
  }
  if (args.dashboard) {
    const url = `${args.dashboard}/api/version`;
    const a = await ask(url, headers);
    out.push({ door: "version", url, problem: a.failed ?? judgeVersion(a.status, a.body, args) });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = argsOf(process.argv.slice(2));
  if (args.error) {
    console.error(`smoke: ${args.error}`);
    process.exit(2);
  }
  const results = await smoke(args);
  for (const r of results) console.log(`${r.problem ? "FAIL" : "  ok"} ${r.url}${r.problem ? `: ${r.problem}` : ""}`);
  process.exit(results.some((r) => r.problem) ? 1 : 0);
}
