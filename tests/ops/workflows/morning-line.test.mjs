/**
 * The morning line (ops/morning/morning-line.mjs): once a day, what is red on main, what is red on production and
 * what did not run, said to a person. Its judgement over runs made up here, in the shapes GitHub's API answers; the
 * list of what it watches held to the workflows as they are; and the script run whole over a stand-in for GitHub and
 * the edge, switched off and on.
 *
 * What it is for, each a case below: two weekly checks of production red for three weeks, two AI checks skipped with
 * nothing saying so, a canary that ended green having placed no call, and a workflow disabled on GitHub for eight
 * weeks (November 2026). Each told GitHub, and nobody was woken.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../_source.mjs";
import {
  RUNS_READ,
  compose,
  issuesOf,
  judge,
  judgeAlarms,
  judgeEdge,
  stateOfRun,
} from "../../../tooling/scripts/ops/morning/morning-line.mjs";
import { WATCHED } from "../../../tooling/scripts/ops/morning/watched.mjs";

const NOW = Date.parse("2026-11-28T11:00:00Z");
const entry = (key) => WATCHED.find((w) => w.key === key);
let ids = 100;
/** A completed run as GitHub lists one. */
const run = (created_at, conclusion = "success") => {
  const id = ids++;
  return { id, created_at, conclusion, html_url: `https://github.example/runs/${id}` };
};
const noJobs = () => null;

test("a check that passed is green, and one red says how many runs in a row and since when", () => {
  const ci = entry("ci");
  const green = judge(ci, [run("2026-11-28T09:00:00Z"), run("2026-11-27T20:00:00Z", "failure")], noJobs, NOW);
  assert.equal(green.state, "green");
  assert.equal(green.line, "green on 28 Nov");

  // The weekly AI test, as it stood on 28 Nov 2026: red on three Sundays, green before them.
  const weekly = [
    run("2026-11-22T08:08:36Z", "failure"),
    run("2026-11-15T07:55:42Z", "failure"),
    run("2026-11-08T07:28:55Z", "failure"),
    run("2026-11-01T07:30:00Z"),
  ];
  const red = judge(entry("ask_weekly"), weekly, noJobs, NOW);
  assert.equal(red.state, "red");
  assert.equal(red.streak, 3);
  assert.equal(red.line, "red 3 runs in a row, since 8 Nov");
  assert.equal(red.url, weekly[0].html_url, "the newest run's address");
  assert.equal(red.where, "production");
  // A job the cap cancelled is a job nobody heard from: red too.
  assert.equal(judge(ci, [run("2026-11-28T09:00:00Z", "cancelled")], noJobs, NOW).line, "red on 28 Nov");
  assert.equal(judge(ci, [run("2026-11-28T09:00:00Z", "timed_out")], noJobs, NOW).state, "red");
});

test("a check its switch skipped is not running, with whose switch it is; a streak as long as what was read began before it", () => {
  const skipped = Array.from({ length: 4 }, (_, i) =>
    run(`2026-11-${String(23 - 7 * i).padStart(2, "0")}T21:50:00Z`, "skipped"),
  );
  const evals = judge(entry("evals"), skipped, noJobs, NOW);
  assert.equal(evals.state, "off");
  assert.equal(
    evals.line,
    "skipped 4 runs in a row, since 2 Nov. The repository variable NIGHTLY_EVALS is not 1. Ruben's switch.",
  );
  const many = Array.from({ length: RUNS_READ }, (_, i) =>
    run(`2026-11-${String(27 - i).padStart(2, "0")}T22:44:00Z`, "skipped"),
  );
  assert.match(
    judge(entry("evals"), many, noJobs, NOW).line,
    /^skipped 10 or more runs in a row, since 18 Nov or before\./,
  );
});

test("a run that ended green with the step that is the check skipped checked nothing, and is said so", () => {
  // The voice canary with no key: "::notice" and a green run, every day.
  const canary = entry("voice_canary");
  const jobs = (placed) => [
    {
      name: "A real call reaches the receptionist and leaves everything behind",
      conclusion: "success",
      steps: [
        { name: "The canary is set up", conclusion: "success" },
        { name: "Ring the canary's line", conclusion: placed ? "success" : "skipped" },
      ],
    },
  ];
  const last = [run("2026-11-27T22:44:55Z"), run("2026-11-26T23:01:47Z")];
  assert.deepEqual(stateOfRun(canary, last[0], jobs(false)), { state: "off", unchecked: true });
  const off = judge(canary, last, () => jobs(false), NOW);
  assert.equal(off.state, "off");
  assert.match(off.line, /^ran and checked nothing 2 runs in a row, since 26 Nov\. VOICE_CANARY_KEY is not set/);
  assert.equal(judge(canary, last, () => jobs(true), NOW).state, "green");
  // Jobs that could not be read leave the run's own conclusion to speak.
  assert.equal(judge(canary, last, noJobs, NOW).state, "green");
});

test("the nightly's two reds are said apart, as its own report says them: the suites on main, the check on production", () => {
  const job = (name, conclusion) => ({ name, conclusion, steps: [] });
  const night = (production, whole = "success") => [
    job("Node suite (1/4)", "success"),
    job("Node suite (2/4)", "success"),
    job("What the suite ran of the code", "success"),
    job("The whole suite on its own stack", whole),
    job("The check of production", production),
    job("Say what the night came to", "success"),
  ];
  const last = [run("2026-11-28T04:43:43Z", "failure")];
  const suites = judge(entry("nightly"), last, () => night("failure"), NOW);
  const check = judge(entry("production_check"), last, () => night("failure"), NOW);
  assert.equal(suites.state, "green", "the suites passed: production's red is not theirs");
  assert.equal(check.state, "red");
  assert.equal(check.line, "red on 28 Nov (The check of production)");
  const other = judge(entry("nightly"), last, () => night("success", "cancelled"), NOW);
  assert.equal(other.line, "red on 28 Nov (The whole suite on its own stack)");
  assert.equal(judge(entry("production_check"), last, () => night("skipped"), NOW).state, "off", "it did not run");
});

test("a check on a clock that has stopped running is not running, whatever it last said; so is one disabled on GitHub, or never run", () => {
  const register = entry("register");
  const stale = judge(register, [run("2026-11-24T20:50:34Z")], noJobs, NOW);
  assert.equal(stale.state, "off");
  assert.equal(stale.line, "has not run since 24 Nov, and it runs every day");
  // GitHub starts a schedule hours late: a day and a half is not stopped.
  assert.equal(judge(register, [run("2026-11-27T19:36:45Z")], noJobs, NOW).state, "green");
  assert.equal(
    judge(entry("leads_weekly"), [run("2026-11-08T09:13:42Z", "failure")], noJobs, NOW).line,
    "has not run since 8 Nov, and it runs every week",
  );
  // The weekly compare of production's migrations, disabled by hand on 5 Oct 2026 and unseen for eight weeks.
  const disabled = judge(entry("migration_compare"), [run("2026-10-05T20:55:27Z", "failure")], noJobs, NOW, false);
  assert.equal(disabled.state, "off");
  assert.equal(
    disabled.line,
    "is disabled on GitHub (Actions, the workflow's menu, Enable workflow); its last run was on 5 Oct",
  );
  assert.equal(judge(register, [], noJobs, NOW).line, "has never run on main");
  // A push's check has no clock: an old green run is a quiet main.
  assert.equal(judge(entry("ci"), [run("2026-11-20T09:00:00Z")], noJobs, NOW).state, "green");
});

test("the edge's health door: its clocks and jobs are one check, and production's database is held to main's newest migration", () => {
  const well = { ok: true, unhealthy: [], jobs_backlog: 0, checked_at: "2026-11-28T11:00:00Z", video_machine: true };
  assert.deepEqual(
    judgeEdge(200, well, "00724").map((r) => [r.key, r.state, r.line]),
    [["health", "green", "every clock ticking, no job waiting"]],
    "an edge that says nothing of its migrations is judged on its clocks alone",
  );
  const ill = { ...well, ok: false, unhealthy: ["partitions", "text_canary"], jobs_backlog: 3, video_machine: false };
  const [health] = judgeEdge(503, ill, "00724");
  assert.equal(health.state, "red");
  assert.equal(
    health.line,
    "stopped: partitions, text_canary; 3 jobs due and unclaimed; no machine image on record for the video template, so no video can be made",
  );
  assert.equal(
    judgeEdge(503, { ...well, ok: false, reason: "health_unreadable" }, "00724")[0].line,
    "health unreadable",
  );
  assert.equal(judgeEdge(0, null, "00724")[0].line, "the edge's health door did not answer");
  assert.equal(judgeEdge(502, null, "00724")[0].state, "red");

  const behind = judgeEdge(200, { ...well, applied_migration: "00724" }, "00726")[1];
  assert.equal(behind.key, "database_level");
  assert.equal(behind.state, "red");
  assert.match(behind.line, /^main carries migrations up to 00726 and production's newest is 00724: apply them/);
  assert.equal(judgeEdge(200, { ...well, applied_migration: "00726" }, "00726")[1].state, "green");
  // A migration applied before its merge: the database ahead of main is the ordinary state.
  assert.equal(judgeEdge(200, { ...well, applied_migration: "00727" }, "00726")[1].state, "green");
});

test("Health's alarms: what the platform was paged for in the last day, each by its key in the message alone", () => {
  const pages = {
    conditions: [
      {
        key: "text_canary_off",
        first_at: "2026-11-10T14:00:00Z",
        last_at: "2026-11-27T14:00:00Z",
        count: 18,
        told: true,
      },
      {
        key: "model_failures:9f1c",
        first_at: "2026-11-28T02:00:00Z",
        last_at: "2026-11-28T03:00:00Z",
        count: 2,
        told: false,
      },
      { key: "mail_domain", first_at: "2026-11-01T00:00:00Z", last_at: "2026-11-20T00:00:00Z", count: 4, told: true },
    ],
  };
  const { result, detail } = judgeAlarms(pages, NOW);
  assert.equal(result.state, "red");
  assert.equal(result.line, "2 alarms in the last day, 1 of which reached nobody");
  assert.deepEqual(detail, [
    "text canary off: seen 18 times since 10 Nov",
    "model failures:9f1c: seen 2 times since 28 Nov, and nobody was told",
  ]);
  assert.equal(judgeAlarms({ conditions: [pages.conditions[2]] }, NOW).result.line, "no alarm in the last day");
  assert.equal(judgeAlarms(null, NOW), null, "a report with no pages to read is not 'no alarm'");
  assert.equal(judgeAlarms({ error: "permission denied" }, NOW), null);
});

const result = (key, state, line, more = {}) => ({
  key,
  says: entry(key)?.says ?? key,
  where: entry(key)?.where ?? "production",
  issue: entry(key)?.issue ?? null,
  state,
  streak: 1,
  url: null,
  line,
  ...more,
});

test("nothing red and nothing skipped is still one short line, so a morning with no message means the line broke", () => {
  const all = [result("ci", "green", "green on 28 Nov"), result("smoke", "green", "green on 28 Nov")];
  const line = compose(all, { nowMs: NOW, sha: "10a175d150aabbccdd", runUrl: "https://github.example/runs/1" });
  assert.equal(line.headline, "nothing red, nothing skipped: all 2 green");
  assert.equal(
    line.text,
    "Nothing is red and nothing was skipped: all 2 checks are green. Main is at 10a175d15.\nRun: https://github.example/runs/1",
  );
});

test("the line says what is red and what is not running, each under where it runs, and the green by name", () => {
  const results = [
    result("ci", "red", "red 2 runs in a row, since 27 Nov", { url: "https://github.example/runs/7", streak: 2 }),
    result("kit", "green", "green on 27 Nov"),
    result(
      "evals",
      "off",
      "skipped 4 runs in a row, since 2 Nov. The repository variable NIGHTLY_EVALS is not 1. Ruben's switch.",
    ),
    result("ask_weekly", "red", "red 3 runs in a row, since 8 Nov", { streak: 3 }),
    result("alarms", "red", "1 alarm in the last day", { says: "Health's alarms" }),
    result("smoke", "green", "green on 28 Nov"),
  ];
  const line = compose(results, {
    nowMs: NOW,
    sha: "10a175d150aabbccdd",
    runUrl: "https://github.example/runs/1",
    notes: ["A note."],
    detail: { alarms: ["model failures:9f1c: seen 2 times since 28 Nov"] },
  });
  assert.equal(line.headline, "3 red, 1 not running, 2 green");
  assert.equal(
    line.text,
    [
      "Sat 28 Nov, 11:00 UTC. Main is at 10a175d15.",
      "",
      "RED, 3",
      "On main:",
      "- CI on main: red 2 runs in a row, since 27 Nov. https://github.example/runs/7",
      "On production:",
      "- The weekly AI test: red 3 runs in a row, since 8 Nov.",
      "- Health's alarms: 1 alarm in the last day.",
      "    model failures:9f1c: seen 2 times since 28 Nov",
      "",
      "NOT RUNNING, 1",
      "On main:",
      "- The receptionist's evals: skipped 4 runs in a row, since 2 Nov. The repository variable NIGHTLY_EVALS is not 1. Ruben's switch.",
      "",
      "GREEN, 2",
      "The kit run; The smoke after a deploy",
      "",
      "A note.",
      "Run: https://github.example/runs/1",
    ].join("\n"),
  );
  // The run's page is public, and an alarm's key can name a workspace: the summary carries the count, never the key.
  assert.ok(line.summary.includes("Health's alarms: 1 alarm in the last day."));
  assert.ok(!line.summary.includes("9f1c"));
  // A line longer than the pager's door takes is cut, and says where the rest is.
  const many = Array.from({ length: 60 }, (_, i) => result("ci", "red", `red on 28 Nov, case ${i} ${"x".repeat(60)}`));
  const long = compose(many, { nowMs: NOW });
  assert.ok(long.text.length < 4000);
  assert.match(long.text, /\(cut here; the run's page has the rest\)$/);
});

test("red twice running opens an issue where the workflow opens none of its own; its first green closes it", () => {
  const twice = result("ci", "red", "red 2 runs in a row, since 27 Nov", {
    streak: 2,
    url: "https://github.example/runs/7",
  });
  assert.deepEqual(issuesOf([twice]), [
    {
      title: "CI is red on main",
      state: "red",
      body: "CI on main: red 2 runs in a row, since 27 Nov. https://github.example/runs/7",
    },
  ]);
  assert.deepEqual(issuesOf([result("ci", "red", "red on 28 Nov")]), [], "once is the next run's to mend");
  assert.deepEqual(issuesOf([result("ci", "green", "green on 28 Nov")]), [
    { title: "CI is red on main", state: "green", body: "" },
  ]);
  // The weekly AI test's own workflow keeps its issue: the line opens no second one.
  assert.deepEqual(issuesOf([result("ask_weekly", "red", "red 3 runs in a row, since 8 Nov", { streak: 3 })]), []);
  assert.deepEqual(issuesOf([result("evals", "off", "skipped")]), []);
});

test("an eval whose own job was skipped did not run, whether its run ends skipped or green beside a job that says why", () => {
  // The two AI checks, skipped at every run since their switch was made (M8). Read by the job that asks the model:
  // a second job that writes "not run, and why" to the summary and ends green must not turn the week green.
  const evals = entry("evals");
  const asks = { name: "The receptionist's cases against a sandbox model key", conclusion: "skipped", steps: [] };
  const whole = judge(evals, [run("2026-11-23T21:50:48Z", "skipped")], () => [asks], NOW);
  assert.equal(whole.state, "off");
  assert.match(whole.line, /^skipped on 23 Nov\. The repository variable NIGHTLY_EVALS is not 1\. Ruben's switch\.$/);
  const said = [asks, { name: "Not run, and why", conclusion: "success", steps: [] }];
  assert.equal(judge(evals, [run("2026-11-23T21:50:48Z", "success")], () => said, NOW).state, "off");
  const ran = [{ ...asks, conclusion: "success" }];
  assert.equal(judge(evals, [run("2026-11-23T21:50:48Z", "success")], () => ran, NOW).state, "green");
  assert.equal(
    judge(evals, [run("2026-11-23T21:50:48Z", "failure")], () => [{ ...asks, conclusion: "failure" }], NOW).state,
    "red",
  );
});

/* ---- What is watched, held to the workflows as they are ---- */

const WORKFLOWS = path.join(ROOT, ".github/workflows");
const yaml = (file) => fs.readFileSync(path.join(WORKFLOWS, file), "utf8").replace(/\r\n/g, "\n");
/** Every job's name in a workflow, a matrix job's as its first part reads. */
const jobNames = (file) => [...yaml(file).matchAll(/^ {4}name: (.+)$/gm)].map((m) => m[1].replace(/ \(\$\{\{.*$/, ""));

test("every check the line watches is a workflow that is there, started the way the line reads it, with the job and the step it names", () => {
  for (const w of WATCHED) {
    assert.ok(fs.existsSync(path.join(WORKFLOWS, w.workflow)), `${w.key}: ${w.workflow}`);
    const y = yaml(w.workflow);
    assert.match(y, new RegExp(`^ {2}${w.event}:`, "m"), `${w.key}: ${w.workflow} starts on ${w.event}`);
    assert.ok(["main", "production"].includes(w.where), w.key);
    if (w.event === "schedule")
      assert.ok(w.every === 24 || w.every === 168, `${w.key}: a check on a clock says how often`);
    if (w.step) assert.ok(y.includes(`name: ${w.step}\n`), `${w.key}: the step "${w.step}" is in ${w.workflow}`);
    if (w.issue) assert.ok(!y.includes(w.issue), `${w.key}: its workflow opens no issue of that title already`);
    if (w.jobs) assert.ok(jobNames(w.workflow).some(w.jobs), `${w.key}: a job of ${w.workflow} is the check`);
  }
  assert.equal(new Set(WATCHED.map((w) => w.key)).size, WATCHED.length, "one entry a key");
  // The nightly's jobs, split between the two entries that share its runs, the report left to neither.
  const night = jobNames("nightly-e2e.yml");
  assert.deepEqual(night.filter(entry("production_check").jobs), ["The check of production"]);
  assert.deepEqual(night.filter(entry("nightly").jobs), [
    "Node suite",
    "What the suite ran of the code",
    "The whole suite on its own stack",
  ]);
});

test("every workflow on a clock is watched, or says here why it is not: a new nightly cannot go unwatched", () => {
  /** A scheduled workflow the line leaves out, with why. */
  const NOT_WATCHED = {
    "morning-line.yml": "the line itself: a morning without it is how its own break is seen",
    "bundle-week.yml": "reads main's own records once a week and keeps its own issue; no customer waits on it",
  };
  const onAClock = fs.readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml") && /^ {2}schedule:/m.test(yaml(f)));
  const watched = new Set(WATCHED.map((w) => w.workflow));
  for (const file of onAClock)
    assert.ok(
      watched.has(file) || file in NOT_WATCHED,
      `${file} runs on a clock and the morning line does not watch it`,
    );
  for (const file of Object.keys(NOT_WATCHED))
    assert.ok(onAClock.includes(file) && !watched.has(file), `${file} is argued and is still on a clock, unwatched`);
});

/* ---- The script, run whole ---- */

const SCRIPT = "tooling/scripts/ops/morning/morning-line.mjs";
const STUB = pathToFileURL(path.join(ROOT, "tests/ops/workflows/_morning-stub.mjs")).href;
const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

/** GitHub and the edge as a quiet morning has them: every watched check green an hour ago. */
function quietWorld() {
  const runs = {};
  const jobs = {};
  let id = 1;
  for (const w of WATCHED) {
    if (runs[w.workflow]) continue;
    const one = { id: id++, created_at: iso(1), conclusion: "success", html_url: `https://github.example/runs/${id}` };
    runs[w.workflow] = [one];
    jobs[one.id] = jobNames(w.workflow).map((name) => ({
      name,
      conclusion: "success",
      steps: [...yaml(w.workflow).matchAll(/^ {6,8}(?:- )?name: (.+)$/gm)].map((m) => ({
        name: m[1],
        conclusion: "success",
      })),
    }));
  }
  return {
    workflows: WATCHED.map((w) => ({ path: `.github/workflows/${w.workflow}`, state: "active" })),
    runs,
    jobs,
    issues: [],
    health: [200, { ok: true, unhealthy: [], jobs_backlog: 0, checked_at: iso(0), video_machine: true }],
    diag: [200, { pages: { ok: true, untold: [], conditions: [] } }],
    page: [200, { ok: true, condition: "morning_line", outcome: "sent" }],
  };
}

/** The script run over a world, as the workflow runs it: its exit, what it printed, its summary, and every request. */
function runLine(world, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "morning-line-"));
  const files = {
    stub: path.join(dir, "world.json"),
    seen: path.join(dir, "seen.jsonl"),
    summary: path.join(dir, "s.md"),
  };
  fs.writeFileSync(files.stub, JSON.stringify(world));
  fs.writeFileSync(files.seen, "");
  const ran = spawnSync(process.execPath, ["--import", STUB, SCRIPT, "--summary", files.summary], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH ?? "",
      GITHUB_REPOSITORY: "example/repo",
      GH_TOKEN: "made-up",
      GITHUB_REF: "refs/heads/main",
      // A run's own commit: a pull request's is a merge commit, and the line must never call it main.
      GITHUB_SHA: "f5b9410c9eeff00112",
      GITHUB_SERVER_URL: "https://github.example",
      GITHUB_RUN_ID: "77",
      EDGE: "https://edge.example.com",
      OWNER: "the-owner",
      MORNING_STUB: files.stub,
      MORNING_SEEN: files.seen,
      ...env,
    },
    encoding: "utf8",
  });
  const seen = fs
    .readFileSync(files.seen, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const summary = fs.existsSync(files.summary) ? fs.readFileSync(files.summary, "utf8") : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: ran.status, out: ran.stdout + ran.stderr, seen, summary };
}
const ON = { MORNING_LINE: "1", PAGER_URL: "https://edge.example.com", PAGER_KEY: "the-platform-key" };
const wrote = (r) => r.seen.filter((s) => s.method !== "GET");

test("switched off, it reads everything and writes the line to its own run, sends nothing and touches no issue", () => {
  const world = quietWorld();
  world.runs["ci.yml"] = [
    { id: 901, created_at: iso(1), conclusion: "failure", html_url: "https://github.example/runs/901" },
    { id: 902, created_at: iso(3), conclusion: "failure", html_url: "https://github.example/runs/902" },
  ];
  const off = runLine(world);
  assert.equal(off.status, 0, off.out);
  assert.match(off.summary, /^## Morning line: 1 red, 0 not running, \d+ green$/m);
  assert.match(off.summary, /- CI on main: red 2 runs in a row, since /);
  assert.deepEqual(wrote(off), [], "nothing was sent and no issue was opened");
  assert.match(off.out, /Not sent, and no issue touched: the repository variable MORNING_LINE is not 1/);
  assert.ok(!off.seen.some((s) => s.path === "/api/diag"), "with no key, the keyed report is not asked");
  assert.match(off.summary, /Health's alarms were not read: this run holds no PAGER_KEY\./);
});

test("switched on, a quiet morning is one short message through the pager's door, with the day's count in its headline", () => {
  const quiet = runLine(quietWorld(), ON);
  assert.equal(quiet.status, 0, quiet.out);
  const sent = wrote(quiet);
  assert.equal(sent.length, 1, "one message, and no issue for a green morning with none open");
  assert.deepEqual(
    [sent[0].host, sent[0].path, sent[0].key],
    ["edge.example.com", "/api/admin/page", "the-platform-key"],
  );
  assert.equal(sent[0].body.condition, "morning_line");
  assert.match(sent[0].body.headline, /^nothing red, nothing skipped: all \d+ green$/);
  assert.match(
    sent[0].body.detail,
    /^Nothing is red and nothing was skipped: all \d+ checks are green\. Main is at 10a175d15\.\nRun: https:\/\/github\.example\/example\/repo\/actions\/runs\/77$/,
  );
  assert.match(quiet.out, /Sent: the morning line went to the platform's addresses\./);
});

test("switched on, a red morning says each red with its run, opens the issue for one red twice running, and carries an alarm's key in the message alone", () => {
  const world = quietWorld();
  world.runs["ci.yml"] = [
    { id: 901, created_at: iso(1), conclusion: "failure", html_url: "https://github.example/runs/901" },
    { id: 902, created_at: iso(3), conclusion: "failure", html_url: "https://github.example/runs/902" },
  ];
  world.runs["nightly-evals.yml"] = [
    { id: 903, created_at: iso(20), conclusion: "skipped", html_url: "https://github.example/runs/903" },
  ];
  world.workflows.find((w) => w.path.endsWith("migration-ledger.yml")).state = "disabled_manually";
  world.unreadable = ["register.yml"];
  world.health = [
    503,
    { ok: false, unhealthy: ["partitions"], jobs_backlog: 0, checked_at: iso(0), video_machine: true },
  ];
  world.diag = [
    200,
    {
      pages: { conditions: [{ key: "model_failures:9f1c", first_at: iso(5), last_at: iso(2), count: 2, told: false }] },
    },
  ];
  const red = runLine(world, ON);
  assert.equal(red.status, 0, red.out);
  const page = wrote(red).find((s) => s.path === "/api/admin/page");
  assert.equal(page.body.headline.replace(/\d+ green$/, "N green"), "3 red, 3 not running, N green");
  for (const said of [
    "- CI on main: red 2 runs in a row, since ",
    "https://github.example/runs/901",
    "- The platform's clocks and jobs: stopped: partitions.",
    "- Health's alarms: 1 alarm in the last day, 1 of which reached nobody.",
    "    model failures:9f1c: seen 2 times since ",
    "- The receptionist's evals: skipped on ",
    "The repository variable NIGHTLY_EVALS is not 1. Ruben's switch.",
    "- The weekly compare of production's migrations: is disabled on GitHub",
    "- The register of what the code owes: could not be read from GitHub (GitHub answered 502).",
  ])
    assert.ok(page.body.detail.includes(said), `the message says: ${said}\n${page.body.detail}`);
  assert.ok(!red.summary.includes("9f1c"), "the public summary names no alarm's key");
  // The issue: opened once, the owner's, for the check whose workflow opens none.
  const opened = wrote(red).filter((s) => s.host === "api.github.com");
  assert.deepEqual(
    opened.map((s) => [s.method, s.path]),
    [["POST", "/repos/example/repo/issues"]],
  );
  assert.equal(opened[0].body.title, "CI is red on main");
  assert.deepEqual(opened[0].body.assignees, ["the-owner"]);
  assert.match(red.out, /CI is red on main: opened #9/);
});

test("a message that did not go out fails the run: nobody on file, a refusing door, an edge a build behind, or no key to knock with", () => {
  const unsent = (page) => runLine({ ...quietWorld(), page }, ON);
  const nobody = unsent([
    503,
    { ok: false, error: "no_platform_mailbox", outcome: "unaddressed", detail: "nobody is on file to page" },
  ]);
  assert.equal(nobody.status, 1);
  assert.match(nobody.out, /did not go out: the pager's door answered 503, unaddressed \(nobody is on file to page\)/);
  assert.equal(unsent([503, { ok: false, outcome: "failed" }]).status, 1);
  assert.equal(unsent([403, { ok: false }]).status, 1, "a wrong key");
  assert.equal(
    unsent([400, { ok: false, error: "bad_request" }]).status,
    1,
    "an edge that does not know the condition yet",
  );
  // The old door answered 200 with the outcome inside: judged by the outcome, as the rolling issue's page is.
  assert.equal(unsent([200, { ok: true, outcome: "failed" }]).status, 1);
  const keyless = runLine(quietWorld(), { MORNING_LINE: "1", PAGER_URL: "https://edge.example.com" });
  assert.equal(keyless.status, 1);
  assert.match(keyless.out, /MORNING_LINE is 1 and this run holds no PAGER_URL and PAGER_KEY/);
  assert.deepEqual(wrote(keyless), []);
});

test("a run by hand on a branch writes its summary and sends nothing, whatever the switch says", () => {
  const branch = runLine(quietWorld(), { ...ON, GITHUB_REF: "refs/heads/ops/told-when-red" });
  assert.equal(branch.status, 0, branch.out);
  assert.deepEqual(wrote(branch), []);
  assert.match(branch.out, /Not sent, and no issue touched: this run is not main's\./);
  assert.match(branch.summary, /^## Morning line: /m);
});
