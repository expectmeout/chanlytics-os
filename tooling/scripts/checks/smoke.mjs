/**
 * After a deploy: does it answer, and is it the build just merged? The doors with no key, read the way a pinger and
 * the phone app read them.
 *
 *   GET <edge>/api/health        200 { ok: true, unhealthy: [], jobs_backlog, checked_at }: the platform's clocks and
 *                                its due work (apps/edge/api/health.ts). 503 { ok: false, ... } is the same door saying
 *                                something is wrong; --allow-unhealthy takes it as an answer (a preview with no database).
 *   GET <edge>/api/version       200 { sha }: the build the edge runs (apps/edge/api/version.ts). A health door answers
 *                                well from the build before a deploy as from the one after, so without this the smoke
 *                                passed while the edge still served the old build (6 Oct 2026).
 *   GET <dashboard>/api/version  200 { sha }: the build the deployment runs (apps/dashboard/app/api/version/route.ts);
 *                                --sha names the one each version door must name.
 *
 *   node tooling/scripts/checks/smoke.mjs --edge https://<edge> --dashboard https://<dashboard> [--sha <commit>]
 *   node tooling/scripts/checks/smoke.mjs https://<one-host>     both doors on one host
 *
 * A protected preview takes VERCEL_AUTOMATION_BYPASS_SECRET as its bypass header. Each door is asked up to three
 * times, two seconds apart, for a cold start; each ask waits ten seconds at most. Exit 0 when every door answered as
 * it should, 1 when one did not, 2 when the command was wrong.
 *
 * Whose turn it is to smoke a production deploy (.github/workflows/production-smoke.yml): the two projects deploy
 * each commit on their own, and neither waits for the other, so a smoke on one project's event can find the other
 * still building. On 2 Nov 2026 the edge finished seven minutes before the dashboard (3f008699c), a smoke on the
 * edge's event alone found the dashboard on the commit before for five minutes, and an issue was opened for a deploy
 * that was fine. Each project's finished deployment asks instead, and the one that finished last smokes:
 *
 *   SHA=<commit> ENVIRONMENT=<the deployment's environment> STATE=<its status> AT=<its status's time> \
 *     GH_TOKEN=<token> GITHUB_REPOSITORY=<owner/repo> node tooling/scripts/checks/smoke.mjs --turn
 *
 * reads the other project's newest production deployment of the commit from GitHub's deployments API, and prints
 * smoke=yes or smoke=no, and why=<the reason>, on stdout, for $GITHUB_OUTPUT, the reason on stderr too, for the log.
 * An API it cannot read is smoke=yes: a deploy is never left unjudged because a question went unanswered.
 */
import { pathToFileURL } from "node:url";

const ASKS = 3;
const PAUSE_MS = 2_000;
const WAIT_MS = 10_000;

/** The two Vercel projects, the edge's first. Vercel names each one's production environment "Production – <project>". */
export const PROJECTS = ["chanlytics-messaging", "chanlytics-os"];
/** The states a deployment ends in. GitHub's `inactive` comes later still, on a deployment a newer one replaced. */
const FINISHED = new Set(["success", "failure", "error"]);

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
  const version = async (host) => {
    const url = `${host}/api/version`;
    const a = await ask(url, headers);
    out.push({ door: "version", url, problem: a.failed ?? judgeVersion(a.status, a.body, args) });
  };
  if (args.edge) {
    const url = `${args.edge}/api/health`;
    const a = await ask(url, headers);
    out.push({ door: "health", url, problem: a.failed ?? judgeHealth(a.status, a.body, args) });
    await version(args.edge);
  }
  // One host serving both is asked once.
  if (args.dashboard && args.dashboard !== args.edge) await version(args.dashboard);
  return out;
}

/** Which project a deployment's environment is the production of, or null for a preview or any other environment. */
export function projectOf(environment) {
  const name = String(environment ?? "");
  if (!name.includes("Production")) return null;
  return PROJECTS.find((p) => name.includes(p)) ?? null;
}

const time = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
};

/** A project's newest production deployment among a commit's (GitHub's list, in any order), or null when it has none. */
export function newestOf(deployments, project) {
  let newest = null;
  for (const d of deployments) {
    if (projectOf(d.environment) !== project) continue;
    const later = newest ? time(d.created_at) - time(newest.created_at) : 1;
    if (later > 0 || (later === 0 && d.id > newest.id)) newest = d;
  }
  return newest;
}

/** How a deployment ended, from its statuses (in any order): `{ state, at }`, or null while it is queued or building. */
export function finishOf(statuses) {
  let end = null;
  for (const s of statuses)
    if (FINISHED.has(s.state) && (!end || time(s.created_at) > time(end.at)))
      end = { state: s.state, at: s.created_at };
  return end;
}

/**
 * Whether this deployment's event smokes the commit: once both projects have finished deploying it, the event of the
 * one that finished last does, the edge's on a tie, so exactly one of the two smokes, whichever runs first. `mine` is
 * the event's `{ project, state, at }`; `other` the other project's newest deployment of the commit, ended
 * (finishOf), `"deploying"`, or null when it has none yet. A deployment that failed has finished: the smoke then
 * fails on its host, still serving the commit before. `{ smoke, why }`.
 */
export function turnOf(mine, other) {
  const them = PROJECTS.find((p) => p !== mine.project);
  if (!PROJECTS.includes(mine.project)) return { smoke: false, why: "Not a production deployment of either project." };
  if (!FINISHED.has(mine.state))
    return { smoke: false, why: `${mine.project}'s deployment has not finished (${mine.state}).` };
  if (!other)
    return {
      smoke: false,
      why: `${them} has no production deployment of this commit yet: its own event smokes once it finishes.`,
    };
  if (other === "deploying")
    return { smoke: false, why: `${them} is still deploying this commit: its own event smokes once it finishes.` };
  const ours = `${mine.project} (${mine.state} at ${mine.at})`;
  const theirs = `${them} (${other.state} at ${other.at})`;
  const after = time(other.at) - time(mine.at);
  if (after > 0) return { smoke: false, why: `${theirs} finished after ${ours}: its event smokes.` };
  if (after === 0 && mine.project !== PROJECTS[0])
    return { smoke: false, why: `${theirs} finished with ${ours}: on a tie the edge's event smokes.` };
  return { smoke: true, why: `${ours} finished last, ${after === 0 ? "with" : "after"} ${theirs}.` };
}

/** GitHub's REST API, read with the workflow's token. */
async function github(path, env) {
  const api = (env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  const r = await fetch(`${api}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GH_TOKEN || env.GITHUB_TOKEN || ""}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(WAIT_MS),
  });
  if (!r.ok) throw new Error(`GET ${path.split("?")[0]} answered ${r.status}`);
  return r.json();
}

/** The turn of the deployment the environment names (SHA, ENVIRONMENT, STATE, AT), the other project read from GitHub. */
export async function turn(env = process.env) {
  const mine = { project: projectOf(env.ENVIRONMENT), state: env.STATE, at: env.AT };
  if (!mine.project) return turnOf(mine, null);
  const them = PROJECTS.find((p) => p !== mine.project);
  const repo = `/repos/${env.GITHUB_REPOSITORY}`;
  let other;
  try {
    const deployments = await github(`${repo}/deployments?sha=${encodeURIComponent(env.SHA ?? "")}&per_page=100`, env);
    const newest = newestOf(deployments, them);
    other =
      newest && (finishOf(await github(`${repo}/deployments/${newest.id}/statuses?per_page=100`, env)) ?? "deploying");
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { smoke: true, why: `GitHub's deployments could not be read (${reason}), so this event smokes.` };
  }
  return turnOf(mine, other);
}

const run = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (run && process.argv[2] === "--turn") {
  const asked = await turn();
  const why = asked.why.replace(/\s+/g, " ");
  console.error(why);
  console.log(`smoke=${asked.smoke ? "yes" : "no"}`);
  console.log(`why=${why}`);
} else if (run) {
  const args = argsOf(process.argv.slice(2));
  if (args.error) {
    console.error(`smoke: ${args.error}`);
    process.exit(2);
  }
  const results = await smoke(args);
  for (const r of results) console.log(`${r.problem ? "FAIL" : "  ok"} ${r.url}${r.problem ? `: ${r.problem}` : ""}`);
  process.exit(results.some((r) => r.problem) ? 1 : 0);
}
