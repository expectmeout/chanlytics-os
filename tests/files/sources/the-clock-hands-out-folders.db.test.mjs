/**
 * What 00641 put in the database for a watched folder (the footage sources plan, P2), on a real database: the clock's
 * one statement (sources_hand_out), the account's token in Vault (source_credentials_put, get and drop), the two job
 * kinds' rows, the clock itself (sources_sweep_ask), and what the new columns refuse. The in-memory tests model these by
 * hand (_world.mjs); this is where the SQL itself is run.
 *
 * Each case runs in a transaction that never commits, so nothing it writes is left for another suite. Read through the
 * CLI, as the other ledger suites are; SUPABASE_CLI names the binary when `supabase` is not on PATH.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes jobs and Vault secrets"
    : false;

/** A transaction that never commits: `body` runs in a DO block that ends by raising what it `seen`, as hex. */
function rolledBack(body) {
  const r = spawnSync(
    CLI,
    [
      "db",
      "query",
      "--local",
      `do $$ declare seen jsonb := '{}'; ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`,
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

/** A workspace of the transaction's own, and an account it connected. */
const ACCOUNT = `
  insert into public.tenants (slug, name) values ('footage-' || gen_random_uuid(), 'Footage') returning id into t;
  insert into public.source_connections (tenant_id, provider, provider_account, email)
       values (t, 'google', 'sub-' || gen_random_uuid(), 'owner@example.com') returning id into c;`;

/** A watched folder of that account: its state and whatever else the case says of it. */
const FOLDER = (into, name, columns = "", values = "") => `
  insert into public.media_sources (tenant_id, connection_id, folder_id, folder_name, state${columns})
       values (t, c, '${name}', '${name}', ${values}) returning id into ${into};`;

test(
  "a read asked for soon after the folder's last is handed at once, and a kind an operator paused is handed nothing",
  { skip },
  () => {
    const s = rolledBack(`
      t uuid; c uuid; soon uuid; floor uuid; rewalk uuid;
      first jsonb; held jsonb;
      begin
        ${ACCOUNT}
        ${FOLDER(
          "soon",
          "soon",
          ", next_read_at, last_read_at, read_gap_seconds",
          "'watching', now() - interval '1 second', now() - interval '3 minutes', 300",
        )}
        ${FOLDER(
          "floor",
          "floor",
          ", next_read_at, last_read_at, read_gap_seconds",
          "'watching', now() - interval '1 second', now() - interval '1 hour', 300",
        )}
        first := public.sources_hand_out(300, 1800);
        update public.job_kinds set paused_at = now(), paused_why = 'a test of the off switch'
         where kind in ('source_read', 'source_walk');
        ${FOLDER(
          "rewalk",
          "rewalk",
          ", next_read_at, next_walk_at, walk_run",
          "'watching', now() - interval '1 minute', now() - interval '1 minute', 1",
        )}
        held := public.sources_hand_out(300, 1800);
        seen := jsonb_build_object(
          'first', first,
          'held', held,
          'soon_is_due_now', (
            select j.due_at <= now() from public.jobs j where j.tenant_id = t and j.payload->>'source_id' = soon::text
          ),
          'floor_is_inside_the_spread', (
            select j.due_at >= now() and j.due_at < now() + interval '300 seconds'
              from public.jobs j where j.tenant_id = t and j.payload->>'source_id' = floor::text
          ),
          'jobs_of_the_paused', (
            select count(*) from public.jobs j where j.tenant_id = t and j.payload->>'source_id' = rewalk::text
          )
        );`);
    assert.deepEqual(s.first, { reads: 2, walks: 0, again: 0 });
    assert.equal(s.soon_is_due_now, true, "a signal's read, or a fresh upload's, does not wait out the spread");
    assert.equal(s.floor_is_inside_the_spread, true, "a floor read is spread, as before");
    assert.deepEqual(s.held, { reads: 0, walks: 0, again: 0 }, "paused: nothing is handed, and what is due stays due");
    assert.equal(s.jobs_of_the_paused, 0);
  },
);

test(
  "the clock hands a read to each folder whose read is due, a walk to each whose re-walk is due, takes up a walk that stopped or never began, and writes none twice",
  { skip },
  () => {
    const s = rolledBack(`
      t uuid; c uuid; due uuid; later uuid; frozen uuid; paused uuid; rewalk uuid; stalled uuid; unbegun uuid; fresh uuid;
      once jsonb; twice jsonb;
      begin
        ${ACCOUNT}
        ${FOLDER("due", "due", ", next_read_at", "'watching', now() - interval '1 minute'")}
        ${FOLDER("later", "later", ", next_read_at", "'watching', now() + interval '1 hour'")}
        ${FOLDER("frozen", "frozen", ", next_read_at", "'frozen', now() - interval '1 minute'")}
        ${FOLDER("paused", "paused", ", next_read_at, next_walk_at", "'paused', now() - interval '1 minute', now() - interval '1 minute'")}
        ${FOLDER("rewalk", "rewalk", ", next_walk_at, walk_run", "'watching', now() - interval '1 minute', 3")}
        ${FOLDER(
          "stalled",
          "stalled",
          ", walk_run, walk_kind, walk_started_at, walk_touched_at",
          "'watching', 2, 'reconcile', now() - interval '3 hours', now() - interval '2 hours'",
        )}
        ${FOLDER("unbegun", "unbegun", ", updated_at", "'setting_up', now() - interval '2 hours'")}
        ${FOLDER("fresh", "fresh", "", "'setting_up'")}
        once := public.sources_hand_out(300, 1800);
        twice := public.sources_hand_out(300, 1800);
        seen := jsonb_build_object(
          'once', once,
          'twice', twice,
          'jobs', (
            select jsonb_object_agg(s.folder_name, j.said)
              from public.media_sources s
              join lateral (
                select jsonb_agg(jsonb_build_object(
                         'kind', j.kind, 'lane', j.lane, 'state', j.state,
                         'run', j.payload->>'run', 'walk', j.payload->>'walk',
                         'step_is', case when j.payload->>'step' like 'again-%' then 'again' else j.payload->>'step' end,
                         'names_its_folder', j.payload->>'source_id' = s.id::text,
                         'inside', j.due_at >= now() and j.due_at < now() + interval '300 seconds'
                       ) order by j.kind) as said
                  from public.jobs j
                 where j.tenant_id = t and j.payload->>'source_id' = s.id::text
              ) j on true
             where s.tenant_id = t
          )
        );`);
    assert.deepEqual(s.once, { reads: 2, walks: 1, again: 2 }, "it answers how many of each it wrote");
    assert.deepEqual(
      s.twice,
      { reads: 0, walks: 0, again: 0 },
      "each still waits: a clock that knocks twice costs nothing",
    );
    const read = {
      kind: "source_read",
      lane: 2,
      state: "scheduled",
      run: null,
      walk: null,
      step_is: null,
      names_its_folder: true,
      inside: true,
    };
    const walk = (run, kind, step) => ({
      kind: "source_walk",
      lane: 2,
      state: "scheduled",
      run,
      walk: kind,
      step_is: step,
      names_its_folder: true,
      inside: true,
    });
    assert.deepEqual(s.jobs.due, [read], "a watched folder whose read is due");
    assert.deepEqual(s.jobs.frozen, [read], "a frozen folder is asked after");
    assert.equal(s.jobs.later, null, "one whose read is not due is handed nothing");
    assert.equal(s.jobs.paused, null, "a paused folder is handed nothing, whatever its row says");
    assert.deepEqual(s.jobs.rewalk, [walk("4", "reconcile", "0")], "the first step of the run after its newest");
    assert.deepEqual(
      s.jobs.stalled,
      [walk("2", "reconcile", "again")],
      "a walk that stopped is taken up under its own run",
    );
    assert.deepEqual(s.jobs.unbegun, [walk("1", "snapshot", "0")], "a first walk that never began is begun");
    assert.equal(s.jobs.fresh, null, "a folder chosen a moment ago is left to the walk its watch asked for");
  },
);

test("a read that waits or runs holds its folder's one place, and a finished one gives it back", { skip }, () => {
  const s = rolledBack(`
      t uuid; c uuid; due uuid; while_running jsonb; after_done jsonb;
      begin
        ${ACCOUNT}
        ${FOLDER("due", "due", ", next_read_at", "'watching', now() - interval '1 minute'")}
        perform public.sources_hand_out(300, 1800);
        update public.jobs set state = 'fired', lease_until = now() + interval '90 seconds', attempts = 1
         where tenant_id = t and kind = 'source_read';
        while_running := public.sources_hand_out(300, 1800);
        update public.jobs set state = 'done' where tenant_id = t and kind = 'source_read';
        after_done := public.sources_hand_out(300, 1800);
        seen := jsonb_build_object('while_running', while_running->'reads', 'after_done', after_done->'reads');`);
  assert.deepEqual(s, { while_running: 0, after_done: 1 });
});

test(
  "the two kinds are the ledger's: in the bulk lane, a walk once a folder, run and step, a read once a folder",
  { skip },
  () => {
    const s = rolledBack(`
      begin
        seen := (select jsonb_object_agg(k.kind, jsonb_build_object('lane', k.lane, 'once', k.once_parts, 'kept', k.once_kept))
                   from public.job_kinds k where k.kind in ('source_walk', 'source_read'));`);
    assert.deepEqual(s, {
      source_walk: { lane: 2, once: ["@tenant", "source_id", "run", "step"], kept: false },
      source_read: { lane: 2, once: ["@tenant", "source_id"], kept: false },
    });
  },
);

test(
  "an account's token is kept in Vault and never on its row: stored, read, replaced only over the grant it refreshed, and dropped",
  { skip },
  () => {
    const s = rolledBack(`
      t uuid; c uuid; named text; stale text := 'no';
      begin
        ${ACCOUNT}
        named := public.source_credentials_put(c, '{"refresh_token":"r1","access_token":"a1"}'::jsonb);
        seen := jsonb_build_object(
          'named', named = 'source-creds-' || c::text,
          'ref', (select credentials_ref = named from public.source_connections where id = c),
          'read', public.source_credentials_get(c));
        perform public.source_credentials_put(c, '{"refresh_token":"r1","access_token":"a2"}'::jsonb, 'r1');
        seen := seen || jsonb_build_object('refreshed', public.source_credentials_get(c)->>'access_token');
        begin
          perform public.source_credentials_put(c, '{"refresh_token":"r0","access_token":"a3"}'::jsonb, 'r0');
        exception when sqlstate '40001' then stale := 'refused';
        end;
        seen := seen || jsonb_build_object(
          'stale_write', stale,
          'kept', public.source_credentials_get(c)->>'access_token',
          'dropped', public.source_credentials_drop(c),
          'after', public.source_credentials_get(c),
          'ref_after', (select credentials_ref from public.source_connections where id = c),
          'dropped_again', public.source_credentials_drop(c));`);
    assert.deepEqual(s, {
      named: true,
      ref: true,
      read: { refresh_token: "r1", access_token: "a1" },
      refreshed: "a2",
      stale_write: "refused",
      kept: "a2",
      dropped: true,
      after: null,
      ref_after: null,
      dropped_again: false,
    });
  },
);

test("only the service role may ask the clock's statement or touch an account's token", { skip }, () => {
  const s = rolledBack(`
    begin
      seen := (
        select jsonb_object_agg(f.name || ':' || r.role, has_function_privilege(r.role, f.signature, 'execute'))
          from (values
                  ('sources_hand_out', 'public.sources_hand_out(integer, integer)'),
                  ('sources_sweep_ask', 'public.sources_sweep_ask()'),
                  ('put', 'public.source_credentials_put(uuid, jsonb, text)'),
                  ('get', 'public.source_credentials_get(uuid)'),
                  ('drop', 'public.source_credentials_drop(uuid)')) as f(name, signature)
         cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role));`);
  for (const name of ["sources_hand_out", "sources_sweep_ask", "put", "get", "drop"])
    assert.deepEqual(
      [s[`${name}:anon`], s[`${name}:authenticated`], s[`${name}:service_role`]],
      [false, false, true],
      name,
    );
});

test("the clock asks the edge only while a folder is watched, and records that it looked otherwise", { skip }, () => {
  const s = rolledBack(`
      t uuid; c uuid; f uuid; idle bigint; asked bigint;
      begin
        delete from vault.secrets where name = 'edge_base_url';
        perform vault.create_secret('http://edge.invalid', 'edge_base_url');
        update public.media_sources set state = 'stopped';
        idle := public.sources_sweep_ask();
        seen := jsonb_build_object('idle', idle, 'looked', (select requested_at = now() from public.sweep_status where sweep = 'sources'));
        ${ACCOUNT}
        ${FOLDER("f", "watched", "", "'watching'")}
        asked := public.sources_sweep_ask();
        seen := seen || jsonb_build_object(
          'asked', asked is not null,
          'url', (select url from net.http_request_queue where id = asked),
          'registered', (select jsonb_build_object('jobname', jobname, 'judged_by', judged_by) from public.sweep_status where sweep = 'sources'),
          'schedule', (select schedule from cron.job where jobname = 'sources-sweep'));`);
  assert.deepEqual(s, {
    idle: null,
    looked: true,
    asked: true,
    url: "http://edge.invalid/api/cron/sources",
    registered: { jobname: "sources-sweep", judged_by: "request" },
    schedule: "3-59/5 * * * *",
  });
});

test("a folder's row refuses half a walk, half a hold and a second folder on one channel", { skip }, () => {
  const s = rolledBack(`
      t uuid; c uuid; a uuid; b uuid; refused jsonb := '{}';
      begin
        ${ACCOUNT}
        ${FOLDER("a", "a", "", "'watching'")}
        ${FOLDER("b", "b", "", "'watching'")}
        begin update public.media_sources set walk_kind = 'reconcile' where id = a;
        exception when check_violation then refused := refused || '{"half_a_walk": true}'; end;
        begin update public.media_sources set walk_kind = 'sideways', walk_started_at = now(), walk_touched_at = now() where id = a;
        exception when check_violation then refused := refused || '{"an_unknown_walk": true}'; end;
        begin update public.media_sources set hold_at = now() where id = a;
        exception when check_violation then refused := refused || '{"half_a_hold": true}'; end;
        update public.media_sources
           set channel_id = 'channel-1', channel_token_hash = repeat('a', 64), channel_expires_at = now() + interval '7 days'
         where id = a;
        begin
          update public.media_sources
             set channel_id = 'channel-1', channel_token_hash = repeat('b', 64), channel_expires_at = now() + interval '7 days'
           where id = b;
        exception when unique_violation then refused := refused || '{"a_channel_twice": true}'; end;
        seen := refused;`);
  assert.deepEqual(s, { half_a_walk: true, an_unknown_walk: true, half_a_hold: true, a_channel_twice: true });
});
