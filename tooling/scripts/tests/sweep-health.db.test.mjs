/**
 * sweep_health() judges a request clock on what the edge answered, and pg_net
 * keeps an answer for six hours (pg_net.ttl) before it deletes it. A clock
 * that records its looks (jobs, leads) moves requested_at every tick and
 * leaves request_id at its last real ask, so that ask is still judged long
 * after its answer has gone. Proved on a real Postgres: an answer pg_net has
 * let go of with everything as old is not read as one it never recorded; an
 * answer missing while pg_net holds the ones either side of it still is; and
 * after a crash empties pg_net's table and restarts its count, nothing is
 * said (00150).
 *
 * Every case runs inside one transaction through the CLI and never commits,
 * so no other suite and no local clock sees the edge address, the requests or
 * the answers it makes. SUPABASE_CLI names the binary when `supabase` is not
 * on PATH; SUPABASE_WORKDIR points it at an isolated stack.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes sweep rows"
      : false;

/**
 * A transaction on this machine's database that never commits. `body` runs
 * inside a DO block that ends by raising what it `seen`, so everything the
 * block did goes with it: a Vault secret, a request handed to pg_net, a row.
 * No other suite, and no clock, ever reads any of it.
 */
function rolledBack(body) {
  // What the block saw leaves as hex: however the CLI dresses a database error
  // -- a line of JSON here, plain text with more lines after it on CI's Linux --
  // nothing it adds can escape hex or run on into it.
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", "--local", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

// This transaction's own edge. seed.sql leaves every other session a Vault with none.
const AN_EDGE = `
  delete from vault.secrets where name = 'edge_base_url';
  perform vault.create_secret('http://edge.invalid', 'edge_base_url');
`;
// What pg_net writes when the edge answers the request with this id.
const answer = (id) => `
  insert into net._http_response (id, status_code, content_type, content, timed_out, created)
       values (${id}, 200, 'application/json', '{"ok":true}', false, now());
`;
// The lead finder has nothing to do: every five minutes its clock records a
// look, which moves requested_at and leaves request_id at the last real ask
// (00140). The health sweep runs at :13 and :43, three minutes after the
// looks at :10 and :40.
const LOOKED_THREE_MINUTES_AGO = `
  update public.sweep_status set requested_at = now() - interval '3 minutes' where sweep = 'leads';
`;
const leadsHealth = (key) => `
  seen := seen || (select jsonb_build_object('${key}', jsonb_build_object('healthy', healthy, 'detail', detail))
                     from public.sweep_health() where sweep = 'leads');
`;

test("a quiet lead finder stays healthy after pg_net lets go of the last answer it was given", { skip }, () => {
  const seen = rolledBack(`
    ${AN_EDGE}
    -- The finder's last real ask, and the edge's answer to it.
    seen := jsonb_build_object('asked', public.request_sweep('leads', '/api/cron/leads'));
    ${answer("(seen->>'asked')::bigint")}
    ${LOOKED_THREE_MINUTES_AGO}
    ${leadsHealth("answered")}
    -- Six hours on, pg_net has deleted that answer with everything as old,
    -- while the answers the other clocks were given since are held: here,
    -- deadman's, which asks every ten minutes.
    seen := seen || jsonb_build_object('later', public.request_sweep('deadman', '/api/cron/deadman'));
    ${answer("(seen->>'later')::bigint")}
    delete from net._http_response where id <= (seen->>'asked')::bigint;
    ${leadsHealth("let_go")}
  `);
  assert.equal(typeof seen.asked, "number", `the clock enqueued a request (${JSON.stringify(seen)})`);
  assert.ok(seen.later > seen.asked, "the later ask carries a later id");
  assert.deepEqual(
    seen.answered,
    { healthy: true, detail: null },
    "while pg_net holds the answer, the answer is what is judged",
  );
  assert.deepEqual(
    seen.let_go,
    { healthy: true, detail: null },
    "an answer pg_net let go of with everything as old is not one it never recorded",
  );
});

test(
  "an answer pg_net never recorded, while it holds the answers either side of it, is still reported",
  { skip },
  () => {
    const seen = rolledBack(`
    ${AN_EDGE}
    seen := jsonb_build_object('before', public.request_sweep('deadman', '/api/cron/deadman'));
    ${answer("(seen->>'before')::bigint")}
    -- The finder asks, and nothing is ever recorded for it.
    seen := seen || jsonb_build_object('asked', public.request_sweep('leads', '/api/cron/leads'));
    seen := seen || jsonb_build_object('after', public.request_sweep('deadman', '/api/cron/deadman'));
    ${answer("(seen->>'after')::bigint")}
    ${LOOKED_THREE_MINUTES_AGO}
    seen := seen || jsonb_build_object('at', to_char((now() - interval '3 minutes') at time zone 'utc', 'HH24:MI'));
    ${leadsHealth("lost")}
  `);
    assert.ok(
      seen.before < seen.asked && seen.asked < seen.after,
      `the three asks are in order (${JSON.stringify(seen)})`,
    );
    assert.deepEqual(seen.lost, {
      healthy: false,
      detail: `the request was enqueued at ${seen.at} UTC and pg_net never recorded a response`,
    });
  },
);

test("after a crash empties pg_net's table and restarts its count, a missing answer is not reported", { skip }, () => {
  const seen = rolledBack(`
    ${AN_EDGE}
    seen := jsonb_build_object('asked', public.request_sweep('leads', '/api/cron/leads'));
    -- net._http_response is UNLOGGED: a crash truncates it, and the count
    -- behind its ids starts again, so the answers recorded since the restart
    -- carry ids below the one the finder holds.
    delete from net._http_response;
    ${answer("(seen->>'asked')::bigint - 1")}
    ${LOOKED_THREE_MINUTES_AGO}
    ${leadsHealth("truncated")}
  `);
  assert.equal(typeof seen.asked, "number", `the clock enqueued a request (${JSON.stringify(seen)})`);
  assert.deepEqual(
    seen.truncated,
    { healthy: true, detail: null },
    "an emptied table is no evidence that an answer went missing",
  );
});
