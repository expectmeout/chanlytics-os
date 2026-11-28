#!/usr/bin/env node
/**
 * Rules broken on purpose: would the tests notice if a rule were removed?
 *
 * A test that passes says the rule holds today. It does not say the test would fail without the rule: one that seeds
 * the wrong row, asks the wrong caller or asserts what is true either way passes for ever. So each rule the product
 * rests on is named below with the one line that keeps it and the tests that must go red when that line is taken
 * out. This makes the change, runs those tests, expects red, and puts the line back. A rule whose tests stay green
 * has no test: the run fails, and the missing test is written.
 *
 *   node tooling/scripts/checks/break-rules.mjs                      # the list: each rule, its line and its tests
 *   node tooling/scripts/checks/break-rules.mjs --run                # break each rule kept in code, one at a time
 *   node tooling/scripts/checks/break-rules.mjs --run --db           # break each rule kept in the database
 *   node tooling/scripts/checks/break-rules.mjs --run <name> [...]   # only these
 *   node tooling/scripts/checks/break-rules.mjs --run <name> --with=<test file>   # with other tests than the list's
 *                                                                     # (to find which test holds a rule, or try a new one)
 *
 * A rule kept in code is broken in its source file, in place, and the file is written back whatever the tests did; a
 * file with changes of its own is refused, so nothing of a person's is ever overwritten. Run it on a checkout made
 * for it (the workflow's) or a clean tree. A rule kept in the database (`fn`) is broken on the LOCAL stack alone: the
 * function is made again from supabase/schema.sql with the line changed, its database suites run, and it is made
 * again as the snapshot has it. It refuses any database that is not on this machine.
 *
 * It never runs on a push: .github/workflows/rules-broken-on-purpose.yml runs it weekly and on the `rules` label.
 * tests/repo/rules-broken-on-purpose.test.mjs holds the list to the tree on every pull request, with nothing broken:
 * each line stands exactly once where the list says, and each test is there.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Each rule: what it says, where its one line is (`file`, or a SQL function's name in `fn`), the line (`find`), what
 * it becomes (`put`), and the tests that must go red without it. A break changes one condition and nothing else, so
 * the code still compiles and the tests fail by what they assert.
 */
export const BREAKS = [
  {
    name: "stop-everything-at-the-send-door",
    rule: "Stop everything holds what would go by itself (decision 0139): the send door refuses it as stopped",
    file: "packages/core/src/deliver/deliver.ts",
    find: "  return sendingRefusal(wireFacts.sendingHold, kind) ?? heldByThread(delivery, wireFacts, nowMs, kind);",
    put: "  return heldByThread(delivery, wireFacts, nowMs, kind);",
    tests: ["tests/messages/stop/the-door-holds-for-a-stop.test.mjs"],
  },
  {
    name: "an-erased-person-at-the-send-door",
    rule: "A person erased, or being erased, is never written to, on any way out (decision 0036)",
    file: "packages/core/src/deliver/deliver.ts",
    find: '  if (wireFacts.contact.erased_at || wireFacts.contact.erasing_since) return "erased";',
    put: "",
    tests: ["tests/messages/deliver/words-go-or-are-held.test.mjs"],
  },
  {
    name: "a-person-who-said-stop",
    rule: "A person who said stop, or is do not contact, is not written to: the one consent rule says no first",
    file: "packages/contracts/src/consent/consent.ts",
    find: '  if (isOptedOutContact(purposeBearing)) return { ok: false, reason: "opted_out" };',
    put: "",
    tests: ["tests/messages/deliver/words-go-or-are-held.test.mjs", "tests/consent/marketing-consent.test.mjs"],
  },
  {
    name: "a-text-carries-no-offer",
    rule: "A text carries no promotion, whoever asks: the line is registered with the carriers for replies and visits",
    file: "packages/core/src/deliver/text.ts",
    find: '  if (purpose === "marketing") return "sms_carries_no_promotions";',
    put: "",
    tests: ["tests/messages/deliver/words-go-or-are-held.test.mjs", "tests/messages/outbound-gate.test.mjs"],
  },
  {
    name: "a-post-goes-only-as-approved",
    rule: "A post is rechecked right before it goes: one that no longer stands as approved, or is held, is not sent",
    file: "apps/edge/lib/instagram/post-send.ts",
    find: '  if ("held" in bytes || "unread" in bytes) return bytes;',
    put: "",
    tests: ["tests/instagram/a-post-goes-on-instagram.test.mjs"],
  },
  {
    name: "the-shelf-is-asked-before-a-copy-goes",
    rule: "A video's copy is deleted at the platform only once the shelf says it holds the bytes; unsure keeps it here",
    file: "apps/edge/lib/files/copy/let-go.ts",
    find: '  if (says === "put_back" || says === "unsure") {',
    put: '  if (says === "put_back" && says === "unsure") {',
    tests: ["tests/files/shelf/a-second-let-go-asks-the-platform.test.mjs"],
  },
  {
    name: "a-paused-workspace-sends-nothing",
    rule: "A workspace billing paused sends nothing by itself: the send door refuses it as paused",
    file: "packages/core/src/deliver/stop.ts",
    find: '  if (row?.status === "paused") return "paused";',
    put: "",
    tests: ["tests/messages/deliver/words-go-or-are-held.test.mjs"],
  },
  {
    name: "a-thread-a-person-holds-is-theirs",
    rule: "A thread a person holds, or paused, is not answered by AI or a campaign: the send door says a person has it",
    file: "packages/core/src/deliver/hold.ts",
    find: '  if (kind !== "draft" && kind !== "system" && (held || paused)) return "human_has_it";',
    put: "",
    tests: ["tests/messages/deliver/words-go-or-are-held.test.mjs"],
  },
  {
    name: "a-door-asks-about-its-workspace",
    rule: "A door a member may call asks who is calling, about the workspace it is handed (decision 0150)",
    fn: "form_entry_hold",
    find: "    if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then",
    put: "    if p_tenant_id is null then",
    // The catalog's rule (database/privileges.db.test.mjs) reads the door's text and still finds a workspace named
    // beside auth.uid(): only calling the door as a stranger notices.
    tests: ["tests/database/doors/every-door-refuses-the-wrong-caller.db.test.mjs"],
  },
  {
    name: "an-event-is-relayed-once",
    rule: "A second relay of the same event writes no second job: its delivery is keyed by the event and its subscriber",
    fn: "relay_events",
    find: "              'deliver:' || r.event_id::text || ':' || d.subscriber)",
    put: "              'deliver:' || r.event_id::text || ':' || d.subscriber || ':' || gen_random_uuid()::text)",
    tests: ["tests/events/the-relay-delivers-after-the-commit.db.test.mjs"],
  },
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const count = (text, part) => text.split(part).length - 1;

/** A SQL function's statement as supabase/schema.sql prints it, made again in place of the one the database holds. */
export function functionAgain(snapshot, name) {
  const re = new RegExp(
    `^CREATE FUNCTION public\\.${name}\\(([^\\n]*)\\n[\\s\\S]*?\\n\\s*AS (\\$\\w*\\$)[\\s\\S]*?\\2;\\n`,
    "gm",
  );
  const all = [...snapshot.matchAll(re)];
  return all.length === 1 ? all[0][0].replace(/^CREATE FUNCTION/, "CREATE OR REPLACE FUNCTION") : null;
}

/** What is wrong with the list against the tree, as sentences: nothing is broken to say it. */
export function listProblems(breaks = BREAKS) {
  const problems = [];
  const snapshot = read("supabase/schema.sql").replace(/\r\n/g, "\n");
  const names = new Set();
  for (const b of breaks) {
    if (names.has(b.name)) problems.push(`${b.name}: named twice`);
    names.add(b.name);
    if (!b.rule || !b.tests?.length) problems.push(`${b.name}: says its rule and names the tests that must go red`);
    if (b.find === b.put) problems.push(`${b.name}: the line and what it becomes are the same`);
    const text = b.fn
      ? functionAgain(snapshot, b.fn)
      : fs.existsSync(path.join(ROOT, b.file))
        ? read(b.file).replace(/\r\n/g, "\n")
        : null;
    if (text === null)
      problems.push(`${b.name}: ${b.fn ? `no one function ${b.fn} in the snapshot` : `${b.file} is gone`}`);
    else if (count(text, b.find) !== 1)
      problems.push(`${b.name}: its line stands ${count(text, b.find)} times in ${b.fn ?? b.file}, wanted once`);
    for (const t of b.tests ?? [])
      if (!fs.existsSync(path.join(ROOT, t))) problems.push(`${b.name}: its test ${t} is gone`);
    if (b.fn && !(b.tests ?? []).every((t) => t.endsWith(".db.test.mjs")))
      problems.push(`${b.name}: a rule kept in the database is held by database suites`);
  }
  return problems;
}

/** The tests of one break, run by the repository's launcher: whether they ran, and how many failed. */
function runTests(tests) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tooling/scripts/checks/test.mjs"), ...tests], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const failed = Number(/^# fail (\d+)/m.exec(out)?.[1] ?? /ℹ fail (\d+)/.exec(out)?.[1] ?? 0);
  const passed = Number(/^# pass (\d+)/m.exec(out)?.[1] ?? /ℹ pass (\d+)/.exec(out)?.[1] ?? 0);
  const skipped = Number(/^# skipped (\d+)/m.exec(out)?.[1] ?? /ℹ skipped (\d+)/.exec(out)?.[1] ?? 0);
  return { code: r.status, failed, passed, skipped, out };
}

/** One statement on the local stack, as a file: the database suites' own road (`supabase db query --local`). */
function onTheStack(sql) {
  const cli = process.env.SUPABASE_CLI || "supabase";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "break-rules-"));
  const file = path.join(dir, "statement.sql");
  fs.writeFileSync(file, sql);
  try {
    const r = spawnSync(cli, ["db", "query", "--local", "--output-format", "json", "--file", file], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (r.error || r.status !== 0)
      throw new Error(
        `the stack refused the statement: ${(r.error?.message ?? r.stderr ?? r.stdout ?? "").slice(-600)}`,
      );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** What the tests said of one break: red (they noticed), green (no test holds the rule), or that they never ran. */
function verdictOf(ran) {
  if (ran.failed > 0) return "red";
  if (ran.code === 0 && ran.passed > 0) return "green";
  if (ran.code === 0) return "skipped";
  return "did not run";
}

/** One rule kept in code, broken in its file and put back. */
function breakInCode(b) {
  const file = path.join(ROOT, b.file);
  const dirty = spawnSync("git", ["status", "--porcelain", "--", b.file], { cwd: ROOT, encoding: "utf8" });
  if (dirty.status !== 0 || dirty.stdout.trim())
    return { verdict: "refused", why: `${b.file} has changes of its own: this runs on a clean tree` };
  const whole = fs.readFileSync(file, "utf8");
  if (count(whole, b.find) !== 1) return { verdict: "refused", why: "its line does not stand once" };
  try {
    fs.writeFileSync(file, whole.replace(b.find, b.put));
    const ran = runTests(b.tests);
    return { verdict: verdictOf(ran), ran };
  } finally {
    fs.writeFileSync(file, whole);
  }
}

/** One rule kept in the database, broken on the local stack and made again as the snapshot has it. */
function breakInTheDatabase(b) {
  const url = process.env.SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(url))
    return { verdict: "refused", why: "a rule is broken only on a database on this machine (SUPABASE_URL)" };
  const whole = functionAgain(read("supabase/schema.sql").replace(/\r\n/g, "\n"), b.fn);
  if (!whole || count(whole, b.find) !== 1) return { verdict: "refused", why: "its line does not stand once" };
  // Its suites first, with nothing broken: a suite that is red already would read as noticing.
  const before = runTests(b.tests);
  if (verdictOf(before) !== "green") return { verdict: "red before", ran: before };
  try {
    onTheStack(whole.replace(b.find, b.put));
    const ran = runTests(b.tests);
    return { verdict: verdictOf(ran), ran };
  } finally {
    onTheStack(whole);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const named = args.filter((a) => !a.startsWith("--"));
  const unknown = named.filter((n) => !BREAKS.some((b) => b.name === n));
  if (unknown.length) {
    console.error(`no such rule: ${unknown.join(", ")}`);
    process.exit(2);
  }
  const problems = listProblems();
  if (problems.length) {
    console.error(problems.map((p) => `- ${p}`).join("\n"));
    process.exit(2);
  }
  const inDb = args.includes("--db");
  const others = args.filter((a) => a.startsWith("--with=")).map((a) => a.slice("--with=".length));
  const picked = BREAKS.filter((b) => (named.length ? named.includes(b.name) : Boolean(b.fn) === inDb)).map((b) =>
    others.length ? { ...b, tests: others } : b,
  );
  if (!args.includes("--run")) {
    for (const b of BREAKS)
      console.log(
        `${b.name}\n  ${b.rule}\n  kept in ${b.fn ? `the database: ${b.fn}` : b.file}\n  held by ${b.tests.join(", ")}\n`,
      );
    console.log(
      `${BREAKS.length} rules. --run breaks each one kept in code; --run --db each one kept in the database.`,
    );
    process.exit(0);
  }
  let bad = 0;
  for (const b of picked) {
    const started = Date.now();
    const got = b.fn ? breakInTheDatabase(b) : breakInCode(b);
    const seconds = Math.round((Date.now() - started) / 1000);
    const noticed = got.verdict === "red";
    if (!noticed) bad += 1;
    console.log(
      `${noticed ? "RED  " : "FAIL "} ${b.name} (${seconds} s): ${
        noticed
          ? `${got.ran.failed} test(s) failed without the rule, as they must`
          : got.verdict === "green"
            ? "its tests stayed green without the rule: no test holds it. Write the test that goes red"
            : got.verdict === "skipped"
              ? "its tests were skipped: they need the local stack"
              : got.verdict === "refused"
                ? got.why
                : got.verdict === "red before"
                  ? "its tests are not green before anything is broken, so nothing was proved"
                  : "its tests did not run: the change broke the build, so nothing was proved"
      }`,
    );
    if (!noticed && got.ran && got.verdict !== "green") console.log(got.ran.out.split("\n").slice(-30).join("\n"));
  }
  console.log(`${picked.length - bad} of ${picked.length} rules noticed.`);
  process.exit(bad ? 1 : 0);
}
