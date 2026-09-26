/**
 * Two pieces of operational hygiene from the Tier 1 ledger.
 *
 * The webhook evidence rows (webhook.auth, webhook.delivery) are written per
 * call turn and were never purged; the e2e suite only ran when somebody
 * remembered to run it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ROOT, readRaw } from "./_source.mjs";
import { LEASE_SECONDS, YIELD_AT_MS } from "../../../packages/jobs/src/ledger.ts";
import { YIELD_AT_MS as DOMAINS_YIELD_AT_MS } from "../../../apps/edge/api/cron/domains.ts";
import { SEND_TIMEOUT_MS } from "../../../packages/channels/src/email-resend.ts";
import { EVENT_EVIDENCE_KINDS, RETENTION_DAYS } from "@chanlytics/contracts";

test("the events purge drops the evidence kinds and only those, past the contract's days, on a minute no sweep uses", () => {
  // 00038 scheduled it and dropped two kinds; 00115 widened the list to every
  // evidence kind (contracts EVENT_EVIDENCE_KINDS) and kept the schedule.
  // retention.db.test.mjs runs the function; this holds the two texts together.
  const sql = readRaw("supabase/migrations/00038_events_purge.sql");
  const now = readRaw("supabase/migrations/00115_the_events_purge_covers_the_evidence.sql");
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

test("the domains sweep yields before its limit, with a provider read and the writes still to come", () => {
  // Its last batch may start just before DOMAINS_YIELD_AT_MS and wait out one provider read (DNS is read beside it),
  // then write. Past the limit the platform kills the function mid-write, and the tick is red for nothing it did.
  const ceiling = FUNCTIONS["api/cron/domains.ts"].maxDuration * 1000;
  const WRITES_MS = 3_000;
  assert.ok(
    DOMAINS_YIELD_AT_MS + SEND_TIMEOUT_MS + WRITES_MS <= ceiling,
    `${DOMAINS_YIELD_AT_MS} + ${SEND_TIMEOUT_MS} + ${WRITES_MS} ms must fit in ${ceiling} ms`,
  );
});

test("a log line on the message path carries a phone tail, never the number or the words", () => {
  // A log is read by whoever reads logs. The number and the text are on the
  // rows, under RLS; a tail is enough to follow one message through a batch.
  // Every log call is read to its closing paren, so a field on the next line
  // counts; a value already reduced to a tail does not.
  const files = [
    "apps/edge/api/whatsapp.ts",
    "apps/edge/api/inbound-sms.ts",
    "apps/edge/api/retell-inbound.ts",
    "apps/edge/lib/voice/call-start.ts",
    "apps/edge/lib/whatsapp/inbound.ts",
    // The message path itself: a verb over ports, logging through the
    // factory the edge hands it. Same lines, same rule, new home.
    "packages/core/src/inbound/answer.ts",
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
    readRaw("apps/edge/api/whatsapp.ts").includes(
      'L.info("wa_inbound", { from_tail: phoneTail(m.from), type: m.type, id: m.id });',
    ),
    "the WhatsApp inbound line: a tail, a type, an id",
  );
  assert.ok(
    readRaw("apps/edge/api/inbound-sms.ts").includes(
      "from_tail: phoneTail(inbound.from), to_tail: phoneTail(inbound.to)",
    ),
    "the SMS logger's context: tails",
  );
});
