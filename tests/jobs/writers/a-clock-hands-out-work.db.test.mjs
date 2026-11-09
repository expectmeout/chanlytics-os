/**
 * A clock hands out work (decision 0115, 00569), on a real database: the three doors a sweep calls, and the once-only key
 * that makes a knock safe to repeat. A clock finds which workspaces have work due and writes each one job; the ledger runs it.
 *
 * Each case runs in a transaction that never commits: sequence_steps_hand_out and calendars_hand_out read every workspace,
 * so a committed one would leave jobs on other suites' workspaces. Between files, the ledger's lock (_file-lock.mjs) runs this
 * and the suites that claim from the one queue one after the other. Read through the CLI, as jobs-lanes.db.test.mjs is;
 * SUPABASE_CLI names the binary when `supabase` is not on PATH. What a due page holds is sweep-pages.db.test.mjs's.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { takeLock } from "../../_file-lock.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes jobs"
    : false;

let releaseLedger;
before(async () => {
  if (skip) return;
  releaseLedger = await takeLock("jobs-ledger");
});
after(async () => {
  await releaseLedger?.();
});

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

/** Three workspaces of the transaction's own, a, b and c, on UTC so an hour there is the hour written. */
const THREE = `
  insert into public.tenants (slug, name, timezone) values ('hand-a-' || gen_random_uuid(), 'Hand A', 'UTC') returning id into a;
  insert into public.tenants (slug, name, timezone) values ('hand-b-' || gen_random_uuid(), 'Hand B', 'UTC') returning id into b;
  insert into public.tenants (slug, name, timezone) values ('hand-c-' || gen_random_uuid(), 'Hand C', 'UTC') returning id into c;`;

/** How many jobs of a kind each of the three workspaces holds. */
const COUNTS = (kind) => `jsonb_build_object(
  'a', (select count(*) from public.jobs j where j.tenant_id = a and j.kind = '${kind}'),
  'b', (select count(*) from public.jobs j where j.tenant_id = b and j.kind = '${kind}'),
  'c', (select count(*) from public.jobs j where j.tenant_id = c and j.kind = '${kind}')
)`;

/** A running daily moment at ten that has never run, as its row reads. */
const MOMENT = (ws, template, name, over = {}) => `
  insert into public.sequence_steps
    (tenant_id, name, trigger, template_id, template_name, template_language, params, policy_class, state, run_hour, cap_per_run, gap_days, cadence_days)
  values (${ws}, '${name}', 'quiet_30', ${template}, 'winback_offer', 'en_US', '[]', 'reengage',
          '${over.state ?? "running"}', ${over.runHour ?? 10}, 25, 90, 30);`;

const TEMPLATE = (ws, into) => `
  insert into public.templates (tenant_id, channel, name, language, meta_status)
  values (${ws}, 'whatsapp', 'winback_offer', 'en_US', 'approved') returning id into ${into};`;

test(
  "a workspace is handed one job: in the bulk lane, on its kind's own key, due inside the spread, with nothing in it, and a knock repeated writes none",
  { skip },
  () => {
    const s = rolledBack(`
      a uuid; b uuid; c uuid; once integer; twice integer;
      begin
        ${THREE}
        once := public.jobs_hand_out('google_read', array[a, b], 300);
        twice := public.jobs_hand_out('google_read', array[a, b], 300);
        seen := jsonb_build_object(
          'once', once,
          'twice', twice,
          'counts', ${COUNTS("google_read")},
          'rows', (
            select jsonb_agg(jsonb_build_object(
              'lane', j.lane, 'state', j.state, 'payload', j.payload,
              'key_is_the_kinds', j.dedupe_key = public.job_dedupe_key_of('google_read', j.tenant_id, '{}'::jsonb),
              'inside', j.due_at >= now() and j.due_at < now() + interval '300 seconds'
            ))
            from public.jobs j where j.tenant_id in (a, b)
          )
        );`);
    assert.equal(s.once, 2, "it answers how many it wrote");
    assert.equal(s.twice, 0, "each still waits: a clock that knocks twice costs nothing");
    assert.deepEqual(s.counts, { a: 1, b: 1, c: 0 }, "one a workspace named, and none for the one not named");
    assert.deepEqual(
      s.rows,
      Array(2).fill({ lane: 2, state: "scheduled", payload: {}, key_is_the_kinds: true, inside: true }),
      "a customer's reply still goes first, and the job asks what is due when it runs",
    );
  },
);

test(
  "a job that waits or runs holds the workspace's place, a finished one gives it back, and each kind has its own",
  { skip },
  () => {
    const s = rolledBack(`
      a uuid; b uuid; c uuid; after_done integer; while_running integer; other_kind integer;
      begin
        ${THREE}
        perform public.jobs_hand_out('calendar_read', array[a, b], 300);
        -- jobs_guard: a scheduled job may only be fired or canceled, so it finishes as a run does.
        update public.jobs
           set state = 'fired', fired_at = now(), lease_until = now() + interval '90 seconds', attempts = 1
         where tenant_id = a and kind = 'calendar_read';
        update public.jobs set state = 'done' where tenant_id = a and kind = 'calendar_read';
        update public.jobs
           set state = 'fired', fired_at = now(), lease_until = now() + interval '90 seconds', attempts = 1
         where tenant_id = b and kind = 'calendar_read';
        after_done := public.jobs_hand_out('calendar_read', array[a], 300);
        while_running := public.jobs_hand_out('calendar_read', array[b], 300);
        other_kind := public.jobs_hand_out('google_read', array[b], 300);
        seen := jsonb_build_object('after_done', after_done, 'while_running', while_running, 'other_kind', other_kind);`);
    assert.deepEqual(s, { after_done: 1, while_running: 0, other_kind: 1 });
  },
);

test("a kind the ledger does not hold is refused, not written", { skip }, () => {
  const s = rolledBack(`
    a uuid; b uuid; c uuid; refused boolean := false;
    begin
      ${THREE}
      begin
        perform public.jobs_hand_out('no_such_kind', array[a], 300);
      exception when foreign_key_violation then
        refused := true;
      end;
      seen := jsonb_build_object('refused', refused);`);
  assert.equal(s.refused, true);
});

test(
  "nine o'clock is not one herd: each workspace falls due at its own moment in the spread, and at the same one every time",
  { skip },
  () => {
    const s = rolledBack(`
      a uuid; b uuid; c uuid; many uuid[] := '{}'; one uuid;
      begin
        ${THREE}
        for n in 1..12 loop
          insert into public.tenants (slug, name) values ('hand-herd-' || gen_random_uuid(), 'Hand herd') returning id into one;
          many := many || one;
        end loop;
        perform public.jobs_hand_out('reach_out_steps', many, 3600);
        perform public.jobs_hand_out('calendar_read', many, 3600);
        perform public.jobs_hand_out('google_read', array[a], 1);
        seen := jsonb_build_object(
          'moments', (select count(distinct j.due_at) from public.jobs j where j.tenant_id = any(many) and j.kind = 'reach_out_steps'),
          'latest', (select max(extract(epoch from j.due_at - now())) from public.jobs j where j.tenant_id = any(many)),
          'kinds_agree', (
            select count(*) = 0 from public.jobs x join public.jobs y on x.tenant_id = y.tenant_id
             where x.tenant_id = any(many) and x.kind = 'reach_out_steps' and y.kind = 'calendar_read' and x.due_at <> y.due_at
          ),
          'no_spread', (select extract(epoch from j.due_at - now()) from public.jobs j where j.tenant_id = a and j.kind = 'google_read')
        );`);
    assert.ok(s.moments > 1, `twelve workspaces fell due at ${s.moments} moment`);
    assert.ok(s.latest < 3600, `the last falls due ${s.latest} seconds on, inside the spread`);
    assert.equal(s.kinds_agree, true, "by a hash of the workspace, so its place is its own");
    assert.equal(Number(s.no_spread), 0, "a spread of a second is now");
  },
);

test(
  "a clock hands a workspace one job however many of its moments are due, none for one with nothing due, and keeps moments and reach-out steps apart",
  { skip },
  () => {
    const AT = "2026-09-27T11:00:00.000Z";
    const s = rolledBack(`
      a uuid; b uuid; c uuid; ta uuid; tb uuid; tc uuid;
      begin
        ${THREE}
        ${TEMPLATE("a", "ta")}
        ${TEMPLATE("b", "tb")}
        ${TEMPLATE("c", "tc")}
        ${MOMENT("a", "ta", "One")}
        ${MOMENT("a", "ta", "Two")}
        ${MOMENT("a", "ta", "Three")}
        ${MOMENT("b", "tb", "Later today", { runHour: 12 })}
        ${MOMENT("c", "tc", "Paused", { state: "paused" })}
        perform public.sequence_steps_hand_out('moment', 'campaign_moments', '${AT}', 20, 300);
        perform public.sequence_steps_hand_out('moment', 'campaign_moments', '${AT}', 20, 300);
        perform public.sequence_steps_hand_out('reach_out', 'reach_out_steps', '${AT}', 20, 300);
        seen := jsonb_build_object(
          'moments_counts', ${COUNTS("campaign_moments")},
          'reach_counts', ${COUNTS("reach_out_steps")}
        );`);
    assert.deepEqual(
      s.moments_counts,
      { a: 1, b: 0, c: 0 },
      "three moments due, asked twice, are one job; its run reads them together",
    );
    assert.deepEqual(s.reach_counts, { a: 0, b: 0, c: 0 }, "a moment is not a reach-out step");
  },
);

test("a reach-out step due hands its workspace a reach-out job, not a moments one", { skip }, () => {
  const AT = "2026-09-26T16:30:00.000Z";
  const s = rolledBack(`
    a uuid; b uuid; c uuid; search uuid; email uuid;
    begin
      ${THREE}
      insert into public.lead_searches (tenant_id, via, card, name, asked, plan)
      values (a, 'people', 'movers', 'Movers', 'movers', '{}') returning id into search;
      insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components)
      values (a, 'email', 'chanlytics', 'reach_first', 'en', 'marketing', 'approved', '[{"type": "BODY", "text": "Hi {{business}}"}]')
      returning id into email;
      insert into public.sequence_steps
        (tenant_id, kind, policy_class, gap_minutes, template_id, template_name, template_language, params, name, trigger, lead_search_id)
      values (a, 'reach_out', 'outreach', 5, email, 'reach_first', 'en', '[]', 'Movers', 'lead_first', search);
      perform public.sequence_steps_hand_out('moment', 'campaign_moments', '${AT}', 20, 300);
      perform public.sequence_steps_hand_out('reach_out', 'reach_out_steps', '${AT}', 20, 300);
      seen := jsonb_build_object('moments', ${COUNTS("campaign_moments")}, 'reaches', ${COUNTS("reach_out_steps")});`);
  assert.deepEqual(s.reaches, { a: 1, b: 0, c: 0 });
  assert.deepEqual(s.moments, { a: 0, b: 0, c: 0 });
});

test(
  "a calendar due hands its workspace a read; one read this hour, and one with no feed, are handed nothing",
  { skip },
  () => {
    const s = rolledBack(`
      a uuid; b uuid; c uuid; handed integer;
      begin
        ${THREE}
        update public.tenant_config
           set config = jsonb_build_object('calendar', jsonb_build_object('ical_url', 'https://cal.example/a.ics')),
               calendar_checked_at = now() - interval '3 hours'
         where tenant_id = a;
        update public.tenant_config
           set config = jsonb_build_object('calendar', jsonb_build_object('ical_url', 'https://cal.example/b.ics')),
               calendar_checked_at = now() - interval '10 minutes'
         where tenant_id = b;
        handed := public.calendars_hand_out(now() - interval '55 minutes', 300);
        seen := jsonb_build_object('counts', ${COUNTS("calendar_read")}, 'handed_some', handed >= 1);`);
    assert.deepEqual(s.counts, { a: 1, b: 0, c: 0 });
    assert.equal(s.handed_some, true);
  },
);

test("the three doors are the service role's: no member and no visitor may call them", { skip }, () => {
  const s = rolledBack(`
    who text; door text; doors text[] := array[
      'public.jobs_hand_out(text, uuid[], integer)',
      'public.sequence_steps_hand_out(text, text, timestamptz, integer, integer)',
      'public.calendars_hand_out(timestamptz, integer)'
    ];
    begin
      foreach door in array doors loop
        foreach who in array array['anon', 'authenticated', 'service_role'] loop
          seen := seen || jsonb_build_object(who || ' ' || split_part(door, '(', 1), has_function_privilege(who, door, 'execute'));
        end loop;
      end loop;`);
  for (const door of ["jobs_hand_out", "sequence_steps_hand_out", "calendars_hand_out"]) {
    assert.equal(s[`anon public.${door}`], false, door);
    assert.equal(s[`authenticated public.${door}`], false, door);
    assert.equal(s[`service_role public.${door}`], true, door);
  }
});
