#!/usr/bin/env node
/**
 * The morning line: once a day, one message that says what is red on main, what is red on production, and what did
 * not run that should have. Or that nothing is, in one short line, so a morning with no message means the line itself
 * broke.
 *
 * Checks existed for almost everything and a red one woke nobody: the weekly AI test and the lead finder's weekly
 * search were red for three Sundays of November 2026, the two AI evals had been skipped since 9 November with nothing
 * saying so, and the voice canary and the weekly compare of production's migrations ended green each time having
 * checked nothing, their secrets unset. Each workflow tells GitHub; this tells a person.
 *
 * What it reads, and holds no secret to read it:
 *   - each watched check's last runs on main, from GitHub's API with the workflow's own token (watched.mjs is the
 *     list): red, how many runs in a row and since when; skipped; a run that ended green with the step that is the
 *     check skipped; a check on a clock that has stopped running;
 *   - the edge's keyless health door: the platform's clocks, the jobs due and unclaimed, the videos' machine image,
 *     and the newest migration production has applied, held to main's;
 *   - with the pager's key, the edge's diagnostic report: the alarms the platform was paged for in the last day
 *     (the text canary's among them) and any that reached nobody.
 *
 * What it writes: the line as the run's summary, always (with no alarm's key in it: the repository is public, and a
 * key can name a workspace). And, only when the repository variable MORNING_LINE is 1 and the run is main's: the
 * message itself, through the edge's pager door (POST /api/admin/page, condition `morning_line`, to the platform's
 * addresses), and one rolling issue for a check red twice running whose workflow opens none of its own, closed by its
 * first green. Off, nothing leaves GitHub's own run page, and no issue is touched.
 *
 *   node tooling/scripts/ops/morning/morning-line.mjs [--summary <file>]
 *
 * Reads GITHUB_REPOSITORY, GH_TOKEN (or GITHUB_TOKEN), GITHUB_REF, GITHUB_SHA, GITHUB_SERVER_URL and GITHUB_RUN_ID;
 * EDGE (the edge's origin); PAGER_URL and PAGER_KEY (the pager's door and the platform's key); MORNING_LINE; OWNER
 * (who a red issue is assigned to). It exits 1 when it was switched on and the message did not go out, so a line that
 * could not be sent is a red run, and 2 when it could not start. tests/ops/workflows/morning-line.test.mjs runs it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { headOf, readLedger } from "../../checks/migration-ledger.mjs";
import { applyPlan, openIssues, planRollingIssue } from "../rolling-issue.mjs";
import { WATCHED } from "./watched.mjs";

const HOUR_MS = 3_600_000;
/** How many of a check's last runs are read: enough to say "ten or more in a row". */
export const RUNS_READ = 10;
/** A check on a clock has stopped when its newest run is older than twice its interval and half a day's lateness. */
const LATE_H = 12;
/** What the pager's door takes as a page's words (apps/edge/lib/ops/outside-page.ts DETAIL_MAX), less a line's room. */
const DETAIL_ROOM = 3800;
/** How a run that ended badly ends: anything but a pass or a skip. */
const isRed = (conclusion) => conclusion !== "success" && conclusion !== "skipped" && conclusion !== "neutral";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A day as the line says it, in UTC: "8 Nov". Written out, since a runtime's own formats differ from one to the next. */
const dayOf = (at) => {
  const d = new Date(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
/** A moment as the line's first words say it: "Sat 28 Nov, 11:02 UTC". */
const momentOf = (ms) => {
  const d = new Date(ms);
  const two = (n) => String(n).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${dayOf(ms)}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
};
const runs = (n, more = "") => `${n}${more} run${n === 1 && !more ? "" : "s"}`;

/**
 * One run as the check the entry names: `green`, `red` or `off`, and for a red by its jobs, which. `jobs` is the
 * run's jobs with their steps, or null where they were not read (the run's own conclusion then speaks for it).
 */
export function stateOfRun(entry, run, jobs) {
  if (entry.jobs && jobs) {
    const mine = jobs.filter((j) => entry.jobs(j.name));
    const ran = mine.filter((j) => j.conclusion !== "skipped");
    if (!ran.length) return { state: "off" };
    const red = ran.filter((j) => isRed(j.conclusion));
    return red.length ? { state: "red", what: [...new Set(red.map((j) => j.name))] } : { state: "green" };
  }
  if (run.conclusion === "skipped") return { state: "off" };
  if (isRed(run.conclusion)) return { state: "red" };
  if (entry.step && jobs) {
    const step = jobs.flatMap((j) => j.steps ?? []).find((s) => s.name === entry.step);
    if (!step || step.conclusion === "skipped") return { state: "off", unchecked: true };
  }
  return { state: "green" };
}

/**
 * A watched check, judged from its last completed runs on main, newest first: its state, the line that says it, how
 * many runs in a row it has been so, and its newest run's address. `jobsOf(run)` answers a run's jobs or null.
 * `enabled` false is a workflow switched off on GitHub itself (Actions, the workflow's menu), which starts nothing
 * and says nothing: the weekly compare of production's migrations sat so from 5 October 2026, unseen for eight weeks.
 */
export function judge(entry, lastRuns, jobsOf, nowMs, enabled = true) {
  const said = { key: entry.key, says: entry.says, where: entry.where, issue: entry.issue ?? null };
  if (!enabled) {
    const last = lastRuns[0] ? `; its last run was on ${dayOf(lastRuns[0].created_at)}` : "";
    return {
      ...said,
      state: "off",
      streak: 0,
      url: lastRuns[0]?.html_url ?? null,
      line: `is disabled on GitHub (Actions, the workflow's menu, Enable workflow)${last}`,
    };
  }
  if (!lastRuns.length) return { ...said, state: "off", streak: 0, url: null, line: "has never run on main" };
  const states = lastRuns.map((run) => stateOfRun(entry, run, jobsOf(run)));
  const [now] = states;
  let streak = 1;
  while (streak < states.length && states[streak].state === now.state) streak++;
  const newest = lastRuns[0];
  const since = dayOf(lastRuns[streak - 1].created_at);
  // A streak as long as the page of runs read began before it: "10 or more runs in a row, since 2 Nov or before".
  const more = streak === lastRuns.length && lastRuns.length >= RUNS_READ ? " or more" : "";
  const inARow =
    streak > 1
      ? `${runs(streak, more)} in a row, since ${since}${more ? " or before" : ""}`
      : `on ${dayOf(newest.created_at)}`;
  const url = newest.html_url ?? null;
  const ageH = (nowMs - Date.parse(newest.created_at)) / HOUR_MS;
  if (entry.every && ageH > entry.every * 2 + LATE_H) {
    const clock = entry.every <= 24 ? "day" : "week";
    return {
      ...said,
      state: "off",
      streak,
      url,
      line: `has not run since ${dayOf(newest.created_at)}, and it runs every ${clock}`,
    };
  }
  if (now.state === "green") return { ...said, state: "green", streak, url, line: `green ${inARow}` };
  if (now.state === "red") {
    const what = now.what?.length ? ` (${now.what.join(", ")})` : "";
    return { ...said, state: "red", streak, url, line: `red ${inARow}${what}` };
  }
  const how = now.unchecked ? "ran and checked nothing" : "skipped";
  return { ...said, state: "off", streak, url, line: `${how} ${inARow}.${entry.off ? ` ${entry.off}` : ""}` };
}

/**
 * The edge's keyless health door, judged: the clocks and the jobs as one check, and production's database held to
 * main's newest migration where the door says what it has applied. `status` 0 is a door that did not answer.
 */
export function judgeEdge(status, body, mainHead) {
  const health = { key: "health", says: "The platform's clocks and jobs", where: "production", issue: null, url: null };
  if (!body || typeof body !== "object" || typeof body.ok !== "boolean")
    return [
      {
        ...health,
        state: "red",
        streak: 1,
        line: status
          ? `the edge's health door answered ${status} with nothing to read`
          : "the edge's health door did not answer",
      },
    ];
  const wrong = [];
  if (Array.isArray(body.unhealthy) && body.unhealthy.length) wrong.push(`stopped: ${body.unhealthy.join(", ")}`);
  if (typeof body.jobs_backlog === "number" && body.jobs_backlog > 0)
    wrong.push(`${body.jobs_backlog} job${body.jobs_backlog === 1 ? "" : "s"} due and unclaimed`);
  if (!body.ok && body.reason) wrong.push(String(body.reason).replace(/_/g, " "));
  if (!body.ok && !wrong.length) wrong.push("not healthy, and the door does not say why");
  if (body.video_machine === false)
    wrong.push("no machine image on record for the video template, so no video can be made");
  const out = [
    wrong.length
      ? { ...health, state: "red", streak: 1, line: wrong.join("; ") }
      : { ...health, state: "green", streak: 1, line: "every clock ticking, no job waiting" },
  ];
  const applied = body.applied_migration;
  if (typeof applied === "string" && mainHead) {
    const level = { key: "database_level", says: "Production's database", where: "production", issue: null, url: null };
    out.push(
      Number(mainHead) > Number(applied)
        ? {
            ...level,
            state: "red",
            streak: 1,
            line: `main carries migrations up to ${mainHead} and production's newest is ${applied}: apply them (docs/runbook.md, Apply a migration)`,
          }
        : { ...level, state: "green", streak: 1, line: `has every migration main carries (${applied})` },
    );
  }
  return out;
}

/**
 * The pager's memory, from the keyed diagnostic report, judged: the conditions the platform was paged for in the last
 * day. `detail` is each one by its key, for the message alone: a key can name a workspace, and the run's summary is
 * public. Null where the report held no pages to read.
 */
export function judgeAlarms(pages, nowMs) {
  if (!pages || !Array.isArray(pages.conditions)) return null;
  const said = { key: "alarms", says: "Health's alarms", where: "production", issue: null, url: null, streak: 1 };
  const lately = pages.conditions.filter((c) => nowMs - Date.parse(c.last_at) < 24 * HOUR_MS);
  if (!lately.length) return { result: { ...said, state: "green", line: "no alarm in the last day" }, detail: [] };
  const untold = lately.filter((c) => c.told === false).length;
  const line =
    `${lately.length} alarm${lately.length === 1 ? "" : "s"} in the last day` +
    (untold ? `, ${untold} of which reached nobody` : "");
  const detail = lately.map(
    (c) =>
      `${String(c.key).replace(/_/g, " ")}: seen ${c.count} time${c.count === 1 ? "" : "s"} since ${dayOf(c.first_at)}` +
      (c.told === false ? ", and nobody was told" : ""),
  );
  return { result: { ...said, state: "red", line }, detail };
}

const PLACES = [
  ["main", "On main"],
  ["production", "On production"],
];

/** One state's checks as lines, under where each runs; `detail` adds the lines only the message may carry. */
function listed(results, detail = {}) {
  const out = [];
  for (const [where, title] of PLACES) {
    const here = results.filter((r) => r.where === where);
    if (!here.length) continue;
    out.push(`${title}:`);
    for (const r of here) {
      out.push(`- ${r.says}: ${r.line.replace(/\.$/, "")}.${r.url ? ` ${r.url}` : ""}`);
      for (const more of detail[r.key] ?? []) out.push(`    ${more}`);
    }
  }
  return out;
}

/**
 * The line, composed: the `headline` a subject carries, the `text` of the message, and the `summary` the run page
 * shows, which holds nothing `detail` adds. Nothing red and nothing skipped is one short line.
 */
export function compose(results, { nowMs, sha = "", runUrl = "", notes = [], detail = {} }) {
  const red = results.filter((r) => r.state === "red");
  const off = results.filter((r) => r.state === "off");
  const green = results.filter((r) => r.state === "green");
  const main = sha ? ` Main is at ${sha.slice(0, 9)}.` : "";
  const foot = [...notes, ...(runUrl ? [`Run: ${runUrl}`] : [])];
  if (!red.length && !off.length) {
    const headline = `nothing red, nothing skipped: all ${green.length} green`;
    const text = [`Nothing is red and nothing was skipped: all ${green.length} checks are green.${main}`, ...foot];
    return { headline, text: text.join("\n"), summary: text.join("\n\n") };
  }
  const headline = [`${red.length} red`, `${off.length} not running`, `${green.length} green`].join(", ");
  const body = (extra) => [
    `${momentOf(nowMs)}.${main}`,
    ...(red.length ? ["", `RED, ${red.length}`, ...listed(red, extra)] : []),
    ...(off.length ? ["", `NOT RUNNING, ${off.length}`, ...listed(off, extra)] : []),
    ...(green.length ? ["", `GREEN, ${green.length}`, green.map((r) => r.says).join("; ")] : []),
    ...(foot.length ? ["", ...foot] : []),
  ];
  let text = body(detail).join("\n");
  if (text.length > DETAIL_ROOM) text = `${text.slice(0, DETAIL_ROOM)}\n(cut here; the run's page has the rest)`;
  // The run page reads Markdown: a blank line between lines keeps each on its own.
  return { headline, text, summary: body({}).filter(Boolean).join("\n\n") };
}

/**
 * What the line does to the issues it keeps: red for a check red twice running whose workflow opens none of its own,
 * green for one that is green again (which closes it, if one is open). `[{ title, state, body }]`.
 */
export function issuesOf(results) {
  const out = [];
  for (const r of results) {
    if (!r.issue) continue;
    if (r.state === "red" && r.streak >= 2)
      out.push({ title: r.issue, state: "red", body: `${r.says}: ${r.line}.${r.url ? ` ${r.url}` : ""}` });
    else if (r.state === "green") out.push({ title: r.issue, state: "green", body: "" });
  }
  return out;
}

/** A GET that answers JSON, asked up to three times: `{ status, body }`, status 0 when nothing answered. */
async function ask(url, headers = {}) {
  let status = 0;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", ...headers },
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
      const body = await res.json().catch(() => null);
      if (body) return { status, body };
    } catch {
      /* asked again */
    }
    if (i < 2) await new Promise((r) => setTimeout(r, 2_000));
  }
  return { status, body: null };
}

/** Every watched check, read from GitHub and judged; one that could not be read is said, never counted green. */
async function readWatched(github, nowMs) {
  const jobsRead = new Map();
  const results = [];
  // Which workflows GitHub itself holds switched off: one that is disabled starts nothing, on any clock.
  const disabled = new Set();
  try {
    const listed = await github("/actions/workflows?per_page=100");
    for (const w of listed.workflows ?? []) if (w.state !== "active") disabled.add(path.posix.basename(w.path ?? ""));
  } catch {
    /* unread: each check is then judged by its runs alone */
  }
  for (const entry of WATCHED) {
    try {
      const query = `branch=main&event=${entry.event}&status=completed&per_page=${RUNS_READ}`;
      const got = await github(`/actions/workflows/${entry.workflow}/runs?${query}`);
      // A deployment's event starts the smoke for every deployment; the ones that are not production's end skipped.
      const lastRuns = (got.workflow_runs ?? []).filter(
        (run) => entry.event !== "deployment_status" || run.conclusion !== "skipped",
      );
      if (entry.jobs || entry.step)
        for (const run of lastRuns)
          if (!jobsRead.has(run.id))
            jobsRead.set(run.id, (await github(`/actions/runs/${run.id}/jobs?per_page=100`)).jobs ?? null);
      const enabled = !disabled.has(entry.workflow);
      results.push(judge(entry, lastRuns, (run) => jobsRead.get(run.id) ?? null, nowMs, enabled));
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      results.push({
        key: entry.key,
        says: entry.says,
        where: entry.where,
        issue: null,
        state: "off",
        streak: 0,
        url: null,
        line: `could not be read from GitHub (${why})`,
      });
    }
  }
  return results;
}

function arg(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

async function main() {
  const env = process.env;
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!repo || !token) {
    console.error("GITHUB_REPOSITORY and GH_TOKEN (or GITHUB_TOKEN) are required");
    process.exit(2);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const nowMs = Date.now();
  const api = (env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  const github = async (at) => {
    const res = await fetch(`${api}/repos/${repo}${at}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    return res.json();
  };

  const results = await readWatched(github, nowMs);
  const edge = (env.EDGE || env.PAGER_URL || "").replace(/\/+$/, "");
  const notes = [];
  const detail = {};
  if (edge) {
    const health = await ask(`${edge}/api/health`);
    const mainHead = String(headOf(readLedger(root))).padStart(5, "0");
    results.push(...judgeEdge(health.status, health.body, mainHead));
    if (env.PAGER_KEY) {
      const diag = await ask(`${edge}/api/diag`, { "x-diag-key": env.PAGER_KEY });
      const alarms = judgeAlarms(diag.body?.pages, nowMs);
      if (alarms) {
        results.push(alarms.result);
        detail.alarms = alarms.detail;
      } else notes.push("Health's alarms could not be read: the edge's diagnostic report did not answer with them.");
    } else notes.push("Health's alarms were not read: this run holds no PAGER_KEY.");
  } else notes.push("The edge was not asked: this run was given no address for it.");

  const runUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`
      : "";
  const line = compose(results, { nowMs, sha: env.GITHUB_SHA ?? "", runUrl, notes, detail });
  const summary = `## Morning line: ${line.headline}\n\n${line.summary}\n`;
  const out = arg("summary");
  if (out) fs.appendFileSync(out, summary);
  console.log(summary);

  const onMain = env.GITHUB_REF === "refs/heads/main";
  if (env.MORNING_LINE !== "1" || !onMain) {
    console.log(
      env.MORNING_LINE !== "1"
        ? "Not sent, and no issue touched: the repository variable MORNING_LINE is not 1. The line above is the whole of it."
        : "Not sent, and no issue touched: this run is not main's.",
    );
    return;
  }

  // The issues first: a line that cannot be sent still leaves its reds where GitHub shows them.
  const today = new Date(nowMs).toISOString().slice(0, 10);
  for (const issue of issuesOf(results)) {
    const open = await openIssues({ repo, token, prefixes: [issue.title] });
    const plan = planRollingIssue({
      open,
      state: issue.state,
      title: issue.title,
      body: issue.body,
      runUrl,
      today,
      assignee: env.OWNER || null,
    });
    const done = await applyPlan(plan, { repo, token });
    if (done.length) console.log(`${issue.title}: ${done.join("; ")}`);
  }

  if (!env.PAGER_URL || !env.PAGER_KEY) {
    console.error("MORNING_LINE is 1 and this run holds no PAGER_URL and PAGER_KEY, so the line could not be sent.");
    process.exit(1);
  }
  const res = await fetch(`${env.PAGER_URL.replace(/\/+$/, "")}/api/admin/page`, {
    method: "POST",
    headers: { "x-diag-key": env.PAGER_KEY, "content-type": "application/json" },
    body: JSON.stringify({ condition: "morning_line", headline: line.headline, detail: line.text }),
    signal: AbortSignal.timeout(30_000),
  });
  const said = await res.json().catch(() => ({}));
  if (res.ok && said.outcome === "sent") {
    console.log("Sent: the morning line went to the platform's addresses.");
    return;
  }
  console.error(
    `The morning line did not go out: the pager's door answered ${res.status}` +
      `${said.outcome ? `, ${said.outcome}` : ""}${said.detail ? ` (${said.detail})` : ""}.`,
  );
  process.exit(1);
}

// Run as a script, not when a test imports it.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) await main();
