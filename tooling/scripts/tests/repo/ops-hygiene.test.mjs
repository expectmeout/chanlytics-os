/**
 * Two pieces of operational hygiene from the Tier 1 ledger, and what gathered around them.
 *
 * The webhook evidence rows (webhook.auth, webhook.delivery) are written per
 * call turn and were never purged; the e2e suite only ran when somebody
 * remembered to run it. Then the workflows' own rules, the edge's time limits,
 * the log lines, and the database suites' own hygiene: a suite that claims from
 * the jobs ledger takes its lock (October 2026: three claimed without it, and
 * jobs-outbox.db failed on a shared stack whenever another claimed at the same
 * moment).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT, readRaw } from "../_source.mjs";
import { importsOf, parse, repoFiles, stringsIn } from "../_ast.mjs";
import { LEASE_SECONDS, SEND_SETTLE_MS, YIELD_AT_MS, sendByAt } from "../../../../packages/jobs/src/ledger.ts";
import { YIELD_AT_MS as DOMAINS_YIELD_AT_MS } from "../../../../apps/edge/api/cron/domains.ts";
import { YIELD_AT_MS as QUALITY_YIELD_AT_MS } from "../../../../apps/edge/api/cron/channel-quality.ts";
import { GRAPH_TIMEOUT_MS } from "../../../../apps/edge/lib/whatsapp/meta-graph.ts";
import { CHECK_CALLS_UNTIL_MS, CHECK_CALL_MS, CHECK_DONE_BY_MS } from "../../../../apps/edge/lib/reach-out/check.ts";
import { PREVIEW_LIMITS } from "../../../../apps/edge/lib/reach-out/preview.ts";
import {
  SEND_DEADLINE_MS,
  SEND_MIN_MS,
  SEND_TIMEOUT_MS,
} from "../../../../packages/channels/src/email/email-resend.ts";
import { NOTIFY_TIMEOUT_MS } from "../../../../apps/edge/lib/ops/notify.ts";
import { EVENT_EVIDENCE_KINDS, RETENTION_DAYS } from "@chanlytics/contracts";

test("the events purge drops the evidence kinds and only those, past the contract's days, on a minute no sweep uses", () => {
  // 00038 scheduled it and dropped two kinds; 00115 widened the list to every
  // evidence kind (contracts EVENT_EVIDENCE_KINDS) and kept the schedule; a later migration that replaces the function
  // (00342 added person.resolved) is the text held, since an applied file is never edited (migrations are forward-only).
  // retention.db.test.mjs runs the function; this holds the two texts together.
  const sql = readRaw("supabase/migrations/00038_events_purge.sql");
  const defining = fs
    .readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readRaw(`supabase/migrations/${f}`).includes("create or replace function public.purge_events("));
  assert.ok(defining.includes("00115_the_events_purge_covers_the_evidence.sql"), "00115 defines it");
  const now = readRaw(`supabase/migrations/${defining.at(-1)}`);
  assert.ok(
    now.includes(
      `create or replace function public.purge_events(p_keep interval default '${RETENTION_DAYS.events_evidence} days')`,
    ),
    "the default is the contract's number",
  );
  for (const k of EVENT_EVIDENCE_KINDS) assert.ok(now.includes(`'${k}'`), `${k} is purged`);
  for (const k of ["usage.voice_seconds", "usage.wa_conversation", "message.received", "contact.consent_changed"])
    assert.ok(!now.includes(`'${k}'`), `${k} is the record`);
  assert.ok(now.includes("and created_at < now() - p_keep;"));
  assert.ok(now.includes("security definer") && now.includes("set search_path = public"));
  assert.ok(now.includes("revoke execute on function public.purge_events(interval) from public, anon, authenticated;"));
  assert.ok(
    sql.includes(
      "select cron.unschedule('purge-events') where exists (select 1 from cron.job where jobname = 'purge-events');",
    ),
    "re-runnable",
  );
  const m = sql.match(/cron\.schedule\('purge-events', '(\d+) (\d+) \* \* \*'/);
  assert.ok(m, "scheduled daily");
  const minute = Number(m[1]);
  assert.ok(
    minute % 5 !== 0,
    "must not share a minute with call-reconcile (*/5), deadman (*/10) or sweep-health (:13/:43)",
  );
  assert.ok(minute !== 13 && minute !== 43);
});

test("the nightly e2e job exists, runs against production, and is honest about what needs secrets", () => {
  const y = readRaw(".github/workflows/nightly-e2e.yml");
  assert.ok(y.includes('cron: "0 9 * * *"'));
  assert.ok(y.includes("workflow_dispatch:"));
  assert.ok(
    y.includes("E2E_BASE_URL: https://app.chanlytics.com"),
    "the nightly run exercises the address people actually use",
  );
  assert.ok(y.includes("run: pnpm e2e:install") && y.includes("run: pnpm e2e"));
  for (const s of ["E2E_SUPABASE_URL", "E2E_SUPABASE_ANON_KEY", "E2E_SERVICE_ROLE_KEY"]) {
    assert.ok(y.includes(`secrets.${s}`), s);
  }
  assert.ok(y.includes("the owner's decision"), "the rule about live secrets in CI is stated, not silently broken");
  assert.ok(
    y.includes("if: failure()") && y.includes("retention-days: 7"),
    "a report can carry a real workspace's data",
  );
  assert.ok(y.includes("permissions:\n  contents: read"));
});

/** A workflow's lines without its comments. */
const yamlCode = (file) =>
  readRaw(file)
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

test("the nightly evals run on a clock once they are switched on and on demand, fail with no key, and hold no other secret: never the production key", () => {
  const y = yamlCode(".github/workflows/nightly-evals.yml");
  assert.match(y, /cron: "0 10 \* \* \*"/);
  assert.ok(y.includes("workflow_dispatch:"));
  const given = y.split("ANTHROPIC_EVAL_KEY: $" + "{{ secrets.ANTHROPIC_EVAL_KEY }}").length - 1;
  assert.equal(
    given,
    2,
    "the key is given to the step that asks whether it is set and the one that asks the model, no other",
  );
  assert.ok(!/^ {4}env:/m.test(y), "and it is not in the job's environment, where the install's scripts would hold it");
  const secrets = [...y.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(secrets)].sort(),
    ["ANTHROPIC_EVAL_KEY", "GITHUB_TOKEN"],
    "no other secret reaches the job",
  );
  assert.ok(!y.includes("ANTHROPIC_API_KEY"), "the production key is not named");
  assert.ok(!y.includes("E2E_"), "nor is anything of the e2e suite's");
  // Every step that does the work asks whether the key is set; the one that says so runs when it is not.
  const steps = y.split(/\n {6}- /).slice(1);
  const work = steps.filter((st) => !/^name: Say so when/.test(st));
  assert.ok(work.length >= 5);
  for (const st of work)
    assert.ok(st.includes("steps.key.outputs.set == 'true'"), "a step that runs without the key: " + st.split("\n")[0]);
  // Off, the night is skipped in grey and no runner starts; asked for with no key, the run fails. Never green for nothing.
  assert.ok(
    y.includes(
      "    if: $" + "{{ vars.NIGHTLY_EVALS == '1' || github.event_name == 'workflow_dispatch' }}\n    runs-on:",
    ),
    "the job waits for the repository's switch, or a hand",
  );
  assert.ok(
    steps[0].includes("id: key") && steps[0].includes("::error") && /\n\s+exit 1\n/.test(steps[0]),
    "no key is a failure that says so",
  );
  assert.ok(!y.includes("SKIPPED"), "and nothing ends green having said it skipped");
  assert.ok(y.includes("permissions:\n  contents: read"));
  // The runner reads the eval key and never the production key (its behaviour is nightly-evals.test.mjs's).
  const runner = readRaw("tooling/scripts/evals/nightly.mjs").replace(/^\s*(\*|\/\/|\/\*).*$/gm, "");
  assert.ok(runner.includes("process.env.ANTHROPIC_EVAL_KEY") && !runner.includes("ANTHROPIC_API_KEY"));
});

test("the nightly checks Ask's day against its lines (the Ask Rewired Phase 6 plan, D4), apart from the suite: its verdict is its own step and its own issue, titled by whether Ask crossed a line or the check could not run (I2:2), and never turns the suite red", () => {
  const y = readRaw(".github/workflows/nightly-e2e.yml");
  const step = y.slice(
    y.indexOf("- name: Ask's cache and first words hold their lines"),
    y.indexOf("- run: pnpm e2e:install"),
  );
  assert.ok(step.includes("node tooling/scripts/ops/ask-day.mjs --check > ask-day.txt"), "the check, its lines kept");
  assert.ok(
    step.includes("id: ask_day") && step.includes("set +e") && step.includes('echo "code=$code" >> "$GITHUB_OUTPUT"'),
    "its own outcome, never the job's: the exit is read, not thrown",
  );
  assert.ok(step.includes("shell: bash"));
  for (const s of ["E2E_SUPABASE_URL", "E2E_SERVICE_ROLE_KEY"]) assert.ok(step.includes(`secrets.${s}`), s);
  assert.ok(step.includes("CODE: ${{ steps.ask_day.outputs.code }}"), "the issue reads the exit");
  assert.ok(
    step.includes(`--title "Ask's day crossed a line"`) && step.includes(`--title "Ask's day could not be checked"`),
    "a crossed line and a check that could not run are two issues",
  );
  assert.ok(
    step.includes("rolling-issue.mjs") && step.includes("tail -n 1 ask-day.txt"),
    "the verdict's line in one rolling issue",
  );
  assert.ok(y.includes("issues: write"));
});

/** The edge's time limits, from where Vercel reads them. */
const FUNCTIONS = JSON.parse(readRaw("apps/edge/vercel.json")).functions;

test("a claimed job's lease outlives the function that runs it", () => {
  // api/jobs/tick.ts claims a job and runs it inside one function. A lease
  // shorter than the function may live would let the next tick take the row
  // back while the first run is still inside the provider call, and a send run
  // twice is a text sent twice. The ceiling is read from where Vercel reads it,
  // so the two cannot drift apart without this going red.
  const ceiling = FUNCTIONS["api/jobs/tick.ts"]?.maxDuration;
  assert.equal(typeof ceiling, "number", "api/jobs/tick.ts has an explicit ceiling in vercel.json");
  assert.ok(LEASE_SECONDS > ceiling, `a ${LEASE_SECONDS}s lease must outlive the ${ceiling}s ceiling`);
  assert.ok(YIELD_AT_MS < ceiling * 1000, "and a looping handler yields before the ceiling");
});

test("an email send started as late as a batch may start one still ends, and its row is settled, inside the function's ceiling", () => {
  // A broadcast's batch starts no new send after YIELD_AT_MS, but one begun just before it is a send in flight, and the
  // wire's own deadline for it (SEND_DEADLINE_MS, 32 s) is longer than the time a late start has: begun at 44 s it ran to
  // 76, past a ceiling that kills the function at 60 with the email in flight and its row still queued. So a send is
  // bounded by what is left of the function (jobs ledger sendByAt, handed to the door as Delivery.sendBy), and this holds
  // what that comes to under the ceiling.
  const ceiling = FUNCTIONS["api/jobs/tick.ts"].maxDuration * 1000;
  assert.ok(
    YIELD_AT_MS + SEND_DEADLINE_MS > ceiling,
    "the wire's own deadline alone would NOT fit after the yield point: that is why a send is handed the room that is left",
  );
  // Counted from the tick's start, where the handler's deadline is its yield point.
  const latest = sendByAt(YIELD_AT_MS);
  assert.ok(
    latest + SEND_SETTLE_MS <= ceiling,
    `the latest a send may be waited for (${latest} ms) and the ${SEND_SETTLE_MS} ms its row's settle needs must fit in ${ceiling} ms`,
  );
  assert.ok(
    latest - YIELD_AT_MS >= SEND_MIN_MS,
    "and a send started at the yield point is given at least what one request needs",
  );
  // Every moment a send may start, up to the yield: what the wire gives it (the smaller of its own deadline and what is
  // left, never under SEND_MIN_MS) ends by then.
  for (let start = 0; start <= YIELD_AT_MS; start += 500) {
    const given = Math.max(SEND_MIN_MS, Math.min(SEND_DEADLINE_MS, latest - start));
    assert.ok(start + given <= latest, `a send begun at ${start} ms is given ${given} ms and must end by ${latest}`);
  }
});

test("an edge door's time limit is set in one place: vercel.json, never in the door too", () => {
  // Twelve doors once said their limit twice (an `export const config` and a vercel.json entry), eight only in the
  // door, six only in vercel.json: two places that agreed only by care (Reach out Part 2.5). vercel.json is the one
  // the tests above already read. A door with no entry takes the platform's default, which is not written down here,
  // so a sweep or the job runner may not be one: each loops against a budget that is only safe under a known limit.
  const functions = FUNCTIONS;
  const doors = execFileSync("git", ["ls-files", "apps/edge/api"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts"));
  assert.ok(doors.length > 20, "the doors are listed");
  for (const f of doors)
    assert.doesNotMatch(readRaw(f), /^export const config\b/m, `${f}: its limit belongs in apps/edge/vercel.json`);
  for (const [key, entry] of Object.entries(functions)) {
    assert.ok(doors.includes(`apps/edge/${key}`), `vercel.json names ${key}, which is no door`);
    assert.ok(Number.isInteger(entry.maxDuration) && entry.maxDuration > 0, `${key}: a limit in seconds`);
  }
  const looping = doors.filter((f) => /^apps\/edge\/api\/(cron|jobs)\//.test(f));
  assert.ok(looping.length > 10, "the sweeps and the job runner are listed");
  for (const f of looping)
    assert.ok(functions[f.slice("apps/edge/".length)], `${f}: a sweep's limit is written in apps/edge/vercel.json`);
});

test("the domains sweep yields before its limit, with a row's whole check still to come", () => {
  // Its last batch may start just before DOMAINS_YIELD_AT_MS (counted from the door's first line) and wait out one
  // provider read (DNS is read beside it), the notice a hold sends (a page or the owner's mail), then write. Past the
  // limit the platform kills the function mid-write, and the tick is red for nothing it did.
  const ceiling = FUNCTIONS["api/cron/domains.ts"].maxDuration * 1000;
  const WRITES_MS = 3_000;
  const worst = DOMAINS_YIELD_AT_MS + SEND_TIMEOUT_MS + NOTIFY_TIMEOUT_MS + WRITES_MS;
  assert.ok(
    worst <= ceiling,
    `${DOMAINS_YIELD_AT_MS} + ${SEND_TIMEOUT_MS} + ${NOTIFY_TIMEOUT_MS} + ${WRITES_MS} = ${worst} ms must fit in ${ceiling} ms`,
  );
});

test("the channel-quality sweep yields before its limit, with a read of Meta and a notice to the owner still to come", () => {
  // Its last read may start just before QUALITY_YIELD_AT_MS (counted from the door's first line) and wait out Graph's own
  // bound, then keep what Meta said and, for a number that turned BLOCKED, tell its owner (one notice, bound by
  // NOTIFY_TIMEOUT_MS), then write. Past the limit the platform kills the function mid-write.
  const WRITES_MS = 3_000;
  const ceiling = FUNCTIONS["api/cron/channel-quality.ts"].maxDuration * 1000;
  assert.ok(
    QUALITY_YIELD_AT_MS + GRAPH_TIMEOUT_MS + NOTIFY_TIMEOUT_MS + WRITES_MS <= ceiling,
    `${QUALITY_YIELD_AT_MS} + ${GRAPH_TIMEOUT_MS} + ${NOTIFY_TIMEOUT_MS} + ${WRITES_MS} must fit in ${ceiling} ms`,
  );
});

test("the reach-out check starts no call it cannot finish before its limit, nor does the sheet's preview (R1)", () => {
  // Its last call may start just before CHECK_CALLS_UNTIL_MS and run its whole deadline (CHECK_CALL_MS, never past
  // CHECK_DONE_BY_MS), then write what it found. Past the limit the platform kills the function mid-write.
  const WRITES_MS = 3_000;
  const ceiling = FUNCTIONS["api/cron/reach-out-check.ts"].maxDuration * 1000;
  assert.ok(
    CHECK_CALLS_UNTIL_MS + CHECK_CALL_MS <= CHECK_DONE_BY_MS,
    "a call started last still ends by the tick's end",
  );
  assert.ok(CHECK_DONE_BY_MS + WRITES_MS <= ceiling, `${CHECK_DONE_BY_MS} + ${WRITES_MS} must fit in ${ceiling} ms`);
  const preview = FUNCTIONS["api/admin/reach-out-preview.ts"].maxDuration * 1000;
  assert.ok(PREVIEW_LIMITS.callsUntilMs + CHECK_CALL_MS <= PREVIEW_LIMITS.doneByMs);
  assert.ok(PREVIEW_LIMITS.doneByMs + WRITES_MS / 3 <= preview, "the preview writes nothing, and reads little after");
});

test("a log line on the message path carries a phone tail, never the number or the words", () => {
  // A log is read by whoever reads logs. The number and the text are on the
  // rows, under RLS; a tail is enough to follow one message through a batch.
  // Every log call is read to its closing paren, so a field on the next line
  // counts; a value already reduced to a tail does not.
  const files = [
    "apps/edge/lib/whatsapp/webhook.ts",
    "apps/edge/lib/sms/inbound-text.ts",
    "apps/edge/lib/voice/inbound-call.ts",
    "apps/edge/lib/voice/call-start.ts",
    "apps/edge/lib/whatsapp/inbound.ts",
    // The message path itself: a verb over ports, logging through the
    // factory the edge hands it. Same lines, same rule, new home: answer.ts's
    // order and the phase modules beside it.
    ...["answer", "context", "ingest", "gates", "unreadable", "reply-gates", "model-turn", "dispatch"].map(
      (m) => `packages/core/src/inbound/${m}.ts`,
    ),
    "apps/edge/lib/whatsapp/persist.ts",
    "apps/edge/lib/sms/sms.ts",
  ];
  const CALL = /(console\.(log|error|warn)\(|\bL\.(info|warn|error)\(|\blogger\(|ports\.log\(|\.child\()/g;
  const NUMBER = /[{,(]\s*(from|to|phone|phone_e164|recipient_id|e164|number)\s*[:,})]/;
  const WORDS = /[{,]\s*(text|body)\s*:/;
  const offences = [];
  for (const f of files) {
    const src = readRaw(f);
    for (const m of src.matchAll(CALL)) {
      let depth = 0;
      let i = m.index + m[0].length - 1;
      for (; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") {
          depth--;
          if (depth === 0) break;
        }
      }
      const call = src.slice(m.index, i + 1).replace(/phoneTail\([^)]*\)/g, "TAIL");
      if (NUMBER.test(call) || WORDS.test(call))
        offences.push(`${f}:${src.slice(0, m.index).split("\n").length} ${call.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  assert.deepEqual(offences, [], "a whole number or a customer's words on a log line");
  assert.ok(
    readRaw("apps/edge/lib/whatsapp/webhook.ts").includes(
      'L.info("wa_inbound", { from_tail: phoneTail(m.from), type: m.type, id: m.id });',
    ),
    "the WhatsApp inbound line: a tail, a type, an id",
  );
  assert.ok(
    readRaw("apps/edge/lib/sms/inbound-text.ts").includes(
      "from_tail: phoneTail(inbound.from), to_tail: phoneTail(inbound.to)",
    ),
    "the SMS logger's context: tails",
  );
});

/** A call of `name(…)` by its bare identifier. */
const isCallOf = (n, name) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name;

/**
 * Whether a suite claims from the jobs ledger, read on its syntax tree: an `.rpc("claim_due_jobs", …)` call made with
 * the function's own parameters (`p_lease_seconds` among them: a call by names it does not take is refused by the
 * gateway, PGRST202, and claims nothing, which fake-db-agrees.db sends on purpose), or `claim_due_jobs(` in the SQL
 * the suite sends.
 */
function claimsFromTheLedger(sf) {
  let claims = stringsIn(sf).some((s) => /\bclaim_due_jobs\s*\(/.test(s));
  const visit = (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "rpc" &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      n.arguments[0].text === "claim_due_jobs" &&
      n.arguments[1] &&
      ts.isObjectLiteralExpression(n.arguments[1]) &&
      n.arguments[1].properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "p_lease_seconds")
    )
      claims = true;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return claims;
}

/** Whether a suite takes the ledger's lock as the helper says: `takeLock("jobs-ledger")`, imported, inside `before`. */
function takesTheLedgerLock(sf) {
  const imported = importsOf(sf).some(
    (i) => /(^|\/)_file-lock\.mjs$/.test(i.specifier) && (i.names ?? []).includes("takeLock"),
  );
  let inBefore = false;
  const visit = (n) => {
    if (
      isCallOf(n, "takeLock") &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      n.arguments[0].text === "jobs-ledger"
    )
      for (let p = n.parent; p; p = p.parent) if (isCallOf(p, "before")) inBefore = true;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return imported && inBefore;
}

test("a database suite that claims from the jobs ledger takes the ledger's lock, in its before hook", () => {
  // The ledger is one queue: claim_due_jobs takes the oldest due row of all of it, so a suite claiming beside another
  // carries the other's row off, and the suites that claim take _file-lock.mjs's lock for the whole file. First the
  // two readers on planted code, then every stack suite in the tree.
  const planted = (code) => ts.createSourceFile("planted.mjs", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(claimsFromTheLedger(planted('db.rpc("claim_due_jobs", { p_limit: 5, p_lease_seconds: 90 });')), true);
  assert.equal(
    claimsFromTheLedger(planted('db.rpc("claim_due_jobs", { p_limit: 5 });')),
    false,
    "a call by names the function does not take is refused by the gateway and claims nothing",
  );
  assert.equal(claimsFromTheLedger(planted("const sql = `select j from public.claim_due_jobs(1, 90) j`;")), true);
  assert.equal(claimsFromTheLedger(planted('db.rpc("jobs_backlog", {});')), false);
  const lock = 'import { takeLock } from "../_file-lock.mjs";';
  assert.equal(
    takesTheLedgerLock(planted(`${lock} let r; before(async () => { r = await takeLock("jobs-ledger"); });`)),
    true,
  );
  assert.equal(
    takesTheLedgerLock(planted(`${lock} const r = await takeLock("jobs-ledger");`)),
    false,
    "outside before, a lock is taken while the hooks already write",
  );
  assert.equal(
    takesTheLedgerLock(planted(`${lock} before(async () => { await takeLock("lead-platform-list"); });`)),
    false,
    "another lock",
  );
  assert.equal(
    takesTheLedgerLock(planted('before(async () => { await takeLock("jobs-ledger"); });')),
    false,
    "a takeLock of the suite's own is not the helper's",
  );

  const suites = repoFiles(["tooling/scripts/tests"]).filter((f) => f.endsWith(".db.test.mjs"));
  const claiming = suites.filter((f) => claimsFromTheLedger(parse(f)));
  for (const f of [
    "tooling/scripts/tests/jobs/jobs-outbox.db.test.mjs",
    "tooling/scripts/tests/jobs/jobs-lanes.db.test.mjs",
    "tooling/scripts/tests/jobs/the-ledger-wakes-when-a-due-row-is-written.db.test.mjs",
    "tooling/scripts/tests/lines/line-provision.db.test.mjs",
  ])
    assert.ok(claiming.includes(f), `${f} is read as a suite that claims`);
  assert.ok(
    !claiming.includes("tooling/scripts/tests/database/fake-db/fake-db-agrees.db.test.mjs"),
    "a call the gateway refuses claims nothing",
  );
  const unlocked = claiming.filter((f) => !takesTheLedgerLock(parse(f)));
  assert.deepEqual(
    unlocked,
    [],
    'take the lock for the whole file: releaseLedger = await takeLock("jobs-ledger") first in before(), and await releaseLedger?.() last in after() (tooling/scripts/tests/_file-lock.mjs)',
  );
});
