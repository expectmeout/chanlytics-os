#!/usr/bin/env node
/**
 * One rolling issue for a condition a workflow watches, instead of one issue per run.
 *
 * The nightly opened an issue on every red night: fourteen sat open with no comment, none closed since 16 Sep, and
 * nobody was told outside GitHub (the scorecard's defect 15). Now a red run comments on the one open issue (opening
 * it the first time, and folding any older per-run issue whose title starts the same way into it), a green run
 * closes it, and the run that makes it `--page-after` red runs in a row also pages the platform through the edge's
 * pager door (apps/edge/api/admin/page.ts), when the workflow holds its address and key.
 *
 *   node tooling/scripts/ops/rolling-issue.mjs --state red --title "Nightly e2e is red" --match "Nightly e2e" \
 *     --body-file summary.md --page-after 2 --condition nightly_red
 *   node tooling/scripts/ops/rolling-issue.mjs --state green --title "Nightly e2e is red" --match "Nightly e2e"
 *
 * Reads GITHUB_REPOSITORY and GH_TOKEN (or GITHUB_TOKEN), and the run's address from GITHUB_SERVER_URL and
 * GITHUB_RUN_ID; PAGER_URL (the edge's origin) and PAGER_KEY (the platform's DIAG_KEY) when it may page. It writes
 * only issues and a page: nothing a customer sees.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** Where an issue keeps its count of red runs in a row, in its body, where a person reading it does not see it. */
const COUNT = /<!-- red-runs: (\d+) -->/;

/** Where the count's line ends; what follows is the first run's own words, kept as they were. */
const HEAD_END = "<!-- /red-runs -->";

/** How many red runs in a row an open issue stands for: its own count, or one for an issue that kept none. */
export const redRunsOf = (issue) => Number(COUNT.exec(issue.body ?? "")?.[1] ?? 1);

/** An issue's body below its count: the first run's words, or the whole body of an issue that kept no count. */
const bodyBelowHead = (issue) => {
  const body = issue.body ?? "";
  const at = body.indexOf(HEAD_END);
  return (at >= 0 ? body.slice(at + HEAD_END.length) : body).trim();
};

/**
 * What a run does to the open issues whose titles start with its prefixes (`open`, newest first): the actions, in
 * order, and how many red runs in a row it makes. Red: the newest open one is the rolling issue, commented on and
 * counted, and the rest are folded into it (each was a red run); none open, one is opened. Green: every one is closed.
 */
export function planRollingIssue({ open, state, title, body, pageAfter = 0, runUrl = "", today }) {
  const run = runUrl ? ` Run: ${runUrl}` : "";
  if (state === "green") {
    return {
      redRuns: 0,
      actions: open.map((i) => ({ kind: "close", number: i.number, comment: `Green on ${today}.${run}` })),
    };
  }
  const redRuns = open.reduce((n, i) => n + redRunsOf(i), 0) + 1;
  const head = (n) =>
    `<!-- red-runs: ${n} -->\n**Red ${n} run${n === 1 ? "" : "s"} in a row**, the last on ${today}.${run} ` +
    `Closed by the first green run; each red run comments below.\n${HEAD_END}`;
  const actions = [];
  if (!open.length) actions.push({ kind: "create", title, body: `${head(1)}\n\n${body}` });
  else {
    const [keep, ...older] = open;
    actions.push({ kind: "comment", number: keep.number, body: `Red on ${today}.${run}\n\n${body}` });
    actions.push({ kind: "update", number: keep.number, title, body: `${head(redRuns)}\n\n${bodyBelowHead(keep)}` });
    for (const i of older)
      actions.push({
        kind: "close",
        number: i.number,
        comment: `Folded into #${keep.number}, the one issue for this.`,
      });
  }
  if (pageAfter > 0 && redRuns >= pageAfter) actions.push({ kind: "page", redRuns });
  return { redRuns, actions };
}

/** The GitHub REST calls a plan's actions make, and the page, over `fetch`. */
export async function applyPlan(plan, { repo, token, fetch: fetchImpl = fetch, pager = null, condition, detail }) {
  const api = async (method, path, payload) => {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  const done = [];
  for (const a of plan.actions) {
    if (a.kind === "create")
      done.push(`opened #${(await api("POST", "/issues", { title: a.title, body: a.body })).number}`);
    if (a.kind === "comment") {
      await api("POST", `/issues/${a.number}/comments`, { body: a.body });
      done.push(`commented on #${a.number}`);
    }
    if (a.kind === "update") await api("PATCH", `/issues/${a.number}`, { title: a.title, body: a.body });
    if (a.kind === "close") {
      await api("POST", `/issues/${a.number}/comments`, { body: a.comment });
      await api("PATCH", `/issues/${a.number}`, { state: "closed", state_reason: "completed" });
      done.push(`closed #${a.number}`);
    }
    if (a.kind === "page") {
      if (!pager) {
        done.push("not paged: the workflow holds no PAGER_URL and PAGER_KEY, so the issue is the only word");
        continue;
      }
      const res = await fetchImpl(`${pager.url.replace(/\/$/, "")}/api/admin/page`, {
        method: "POST",
        headers: { "x-diag-key": pager.key, "content-type": "application/json" },
        body: JSON.stringify({ condition, detail: `${detail} (red ${a.redRuns} runs in a row)` }),
      });
      const said = await res.json().catch(() => ({}));
      done.push(
        res.ok ? `paged: ${said.outcome ?? "sent"}` : `the page was refused: ${res.status} ${said.error ?? ""}`,
      );
    }
  }
  return done;
}

/** The open issues (not pull requests) whose titles start with one of `prefixes`, newest first. */
export async function openIssues({ repo, token, prefixes, fetch: fetchImpl = fetch }) {
  const found = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100&page=${page}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GET issues: ${res.status}`);
    const batch = await res.json();
    found.push(...batch.filter((i) => !i.pull_request && prefixes.some((p) => i.title.startsWith(p))));
    if (batch.length < 100) break;
  }
  return found.sort((a, b) => b.number - a.number).map(({ number, title, body }) => ({ number, title, body }));
}

function arg(name, fallback = undefined) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
}

async function main() {
  const state = arg("state");
  const title = arg("title");
  if (!["red", "green"].includes(state) || !title) {
    console.error("--state red|green and --title are required");
    process.exit(2);
  }
  const prefixes = process.argv.flatMap((a, i) => (a === "--match" ? [process.argv[i + 1]] : []));
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    console.error("GITHUB_REPOSITORY and GH_TOKEN (or GITHUB_TOKEN) are required");
    process.exit(2);
  }
  const bodyFile = arg("body-file");
  const body = bodyFile ? fs.readFileSync(bodyFile, "utf8").trim() : (arg("body") ?? "");
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : "";
  const open = await openIssues({ repo, token, prefixes: prefixes.length ? prefixes : [title] });
  const plan = planRollingIssue({
    open,
    state,
    title,
    body,
    pageAfter: Number(arg("page-after", "0")),
    runUrl,
    today: new Date().toISOString().slice(0, 10),
  });
  const pager =
    process.env.PAGER_URL && process.env.PAGER_KEY ? { url: process.env.PAGER_URL, key: process.env.PAGER_KEY } : null;
  const done = await applyPlan(plan, {
    repo,
    token,
    pager,
    condition: arg("condition"),
    detail: `${title}. ${runUrl}`.trim(),
  });
  console.log(`${title}: ${state}, ${plan.redRuns} red in a row. ${done.join("; ") || "nothing to do"}`);
}

// Run as a script, not when a test imports it.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) await main();
