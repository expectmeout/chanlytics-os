/**
 * The making queue at full production volume (00712; the content loop PRD's 12.4): ten thousand workspaces in one zone
 * hold their week from Sunday evening, and every one goes up at the same 8:00. Their first posts fall as real plans place
 * them, most on Monday (four in ten between 9:00 and noon), the rest through the week.
 *
 * Played tick by tick, thirty seconds a tick, through the doors the jobs call:
 *   - Sunday 20:00: each week held (content_week_hold), the queue begun (content_weeks_start).
 *   - Through the night: each week PREPARED in turn, the earliest first post first, never more at once than the cap the
 *     contracts derive from what the database's front can take (WEEKS_MAKING_AT_ONCE): its pictures drawn into made files
 *     and each placement's approval readied on its slot (plan_slot_prepared), as the dashboard does; a pass takes a tick.
 *   - From 8:00: each week approved when its job is due (spread over the hour, before its first post), the door placing
 *     every prepared slot in its own transaction; what was not prepared is made in turn after, a slot whose time is too
 *     near held with why, never posted late.
 * Counted: the most weeks made at once, the slots placed late or held late, the slots never placed, the weeks prepared by
 * 8:00, and the database calls a second at the busiest tick (a pass's calls spread over its time, an approval's job's
 * reads at once).
 *
 * Run against the local stack through the CLI, as the catalog suites are, in ONE statement: a block that seeds, plays the
 * night and the week, and ends by raising what it found, so everything it wrote is rolled back. Proved first on PGlite
 * (dev-tools/db-without-docker: run-catalog.sh, or example-see-drain.mjs to print the line).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CALLS_A_WEEK_MADE,
  MAKING_CALLS_A_SECOND,
  SECONDS_A_WEEK_MADE,
  WEEK_MAKING_LEASE_S,
  WEEKS_MAKING_AT_ONCE,
} from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const URL_ = process.env.SUPABASE_URL;
const CLI = process.env.SUPABASE_CLI || "supabase";
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite reads the local stack through the CLI"
    : false;

/** One statement through `supabase db query --local`: what it printed, and whether it failed. */
function run(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  return { failed: r.status !== 0, said: [r.stderr, r.stdout].map((s) => (s ?? "").trim()).join("\n") };
}

/** Workspaces held in one zone at one 8:00. */
const WEEKS = 10000;
/** A tick is thirty seconds; a week's pass takes SECONDS_A_WEEK_MADE. */
const TICK_S = 30;
const PASS_TICKS = Math.ceil(SECONDS_A_WEEK_MADE / TICK_S);
/** Held at 20:00 on Sunday: twelve hours of ticks before 8:00. */
const NIGHT_TICKS = (12 * 3600) / TICK_S;
/** A post is made ready ten minutes ahead; a slot placed later than five minutes before its time counts late. */
const AHEAD_TICKS = (5 * 60) / TICK_S;
/** The reads and writes one week's 8:00 job makes at the database's front (its plan, the stop, the zone, the week, the approval, the queue). */
const CALLS_AN_APPROVAL = 8;

const MORNING = `
do $sim$
declare
  v_weeks     constant integer := ${WEEKS};
  v_cap       constant integer := ${WEEKS_MAKING_AT_ONCE};
  v_lease     constant integer := ${WEEK_MAKING_LEASE_S};
  v_night     constant integer := ${NIGHT_TICKS};
  v_pass      constant integer := ${PASS_TICKS};
  v_ahead     constant integer := ${AHEAD_TICKS};
  v_tick_s    constant integer := ${TICK_S};
  v_at8       constant timestamptz := now() + make_interval(secs => ${NIGHT_TICKS * TICK_S});
  v_tick      integer := 0;
  v_week      record;
  v_slot      record;
  v_job       record;
  v_answer    jsonb;
  v_file      uuid;
  v_out       integer;
  v_most      integer := 0;
  v_approved  integer := 0;
  v_calls     numeric;
  v_peak      numeric := 0;
  v_late      integer;
  v_unplaced  integer;
  v_ready8    integer := 0;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  create temporary table sim (i integer primary key, tenant uuid, plan uuid, first_min integer, due integer, approved integer)
    on commit drop;
  create temporary table sim_slot (slot uuid primary key, i integer, deadline integer, placed integer,
                                   held_late boolean not null default false) on commit drop;
  create temporary table busy (plan uuid primary key, i integer, tenant uuid, began integer, pass text) on commit drop;

  -- Ten thousand workspaces, their first posts as plans place them (minutes after Monday 8:00).
  insert into sim (i, tenant, plan, first_min)
  select g, gen_random_uuid(), gen_random_uuid(),
         case when g % 10 < 4 then 60 + (g * 7919) % 180
              when g % 10 < 7 then 240 + (g * 7919) % 540
              when g % 10 < 9 then 1500 + (g * 7919) % 720
              else 2940 + (g * 7919) % 4000 end
    from generate_series(0, v_weeks - 1) g;
  insert into public.tenants (id, slug, name, timezone)
  select s.tenant, 'held-' || s.i || '-' || substr(s.tenant::text, 1, 8), 'Held ' || s.i, 'America/New_York' from sim s;
  update public.policies p set mode = 'veto' from sim s where p.tenant_id = s.tenant and p.class = 'plan_approve';
  insert into public.content_plans (id, tenant_id, week_of, status, asked_by, ready_at)
  select s.plan, s.tenant, date_trunc('week', now() + interval '7 days')::date, 'ready', 'clock', now() from sim s;
  -- Three posts a week: its first, a story the next day, a post the day after.
  insert into public.plan_slots (tenant_id, plan_id, creative, place, kind, at, title, state)
  select s.tenant, s.plan, gen_random_uuid(), 'instagram', k.kind, v_at8 + make_interval(mins => s.first_min + k.later),
         'Week ' || s.i, 'proposed'
    from sim s
   cross join (values ('picture', 0), ('story', 1440), ('picture', 2880)) as k(kind, later);
  insert into sim_slot (slot, i, deadline)
  select ps.id, s.i, v_night + (extract(epoch from (ps.at - v_at8))::integer / v_tick_s) - v_ahead
    from public.plan_slots ps join sim s on s.plan = ps.plan_id;

  -- Sunday 20:00: each week held to 8:00 as the plan job holds it, its approval's job due within the hour after.
  for v_week in select * from sim order by i loop
    v_answer := public.content_week_hold(v_week.tenant, v_week.plan, v_at8);
    if v_answer ->> 'fate' <> 'held' then
      raise exception 'held weeks broke: week % was not held (%)', v_week.i, v_answer;
    end if;
    update sim set due = v_night + ceil(extract(epoch from ((v_answer ->> 'due_at')::timestamptz - v_at8)) / v_tick_s)::integer
     where i = v_week.i;
  end loop;
  perform public.content_weeks_start(v_cap, v_lease);

  while v_tick <= v_night + 4 * 2880 loop
    -- What the queue began, as each content_week_make job is claimed: its pass is the week's state then.
    for v_job in
      select j.id, (j.payload ->> 'plan_id')::uuid plan from public.jobs j
       where j.kind = 'content_week_make' and j.tenant_id in (select tenant from sim)
    loop
      insert into busy (plan, i, tenant, began, pass)
      select s.plan, s.i, s.tenant, v_tick, case when p.status = 'ready' then 'prepare' else 'make' end
        from sim s join public.content_plans p on p.id = s.plan where s.plan = v_job.plan
      on conflict (plan) do nothing;
      delete from public.jobs where id = v_job.id;
    end loop;
    select count(*) into v_out from public.content_plans p
     where p.made_at is null and p.making_since > now() - make_interval(secs => v_lease);
    v_most := greatest(v_most, v_out);
    if v_out > v_cap then raise exception 'held weeks broke: % at once at tick %', v_out, v_tick; end if;
    -- The front's calls a second: each pass under way spreads its calls over its time; the last tick's approvals' jobs
    -- read at once.
    select count(*) into v_out from busy;
    v_calls := v_out * ${CALLS_A_WEEK_MADE}::numeric / ${SECONDS_A_WEEK_MADE}
               + v_approved * ${CALLS_AN_APPROVAL}::numeric / v_tick_s;
    v_peak := greatest(v_peak, v_calls);

    v_tick := v_tick + 1;
    -- 8:00, for the doors that read the clock.
    if v_tick = v_night then
      update public.content_plans p set goes_at = now() - interval '1 minute' from sim s where s.plan = p.id;
      select count(*) into v_ready8 from sim s join public.content_plans p on p.id = s.plan where p.made_at is not null;
    end if;

    -- Each pass that has taken its time ends, as the dashboard ends it.
    for v_week in select * from busy where began + v_pass <= v_tick order by began, i loop
      delete from busy where plan = v_week.plan;
      if v_week.pass = 'prepare' then
        for v_slot in select * from public.plan_slots where plan_id = v_week.plan and state = 'proposed' loop
          v_file := gen_random_uuid();
          insert into public.files (id, tenant_id, kind, source, status, name, mime, bytes, fingerprint)
          values (v_file, v_week.tenant, 'image', 'made', 'filed', 'drawn-' || substr(v_file::text, 1, 8), 'image/jpeg', 1000, v_file::text);
          perform public.plan_slot_prepared(v_week.tenant, v_slot.id, jsonb_build_object(
            'file_id', v_file, 'at', v_slot.at,
            'approval', jsonb_build_object(
              'snapshot', jsonb_build_object('revision', null, 'renditions', '[]'::jsonb, 'placements', '[]'::jsonb,
                                             'uses', jsonb_build_array('post'), 'spend', null, 'facts', '[]'::jsonb),
              'intent', null, 'renditions', '[]'::jsonb, 'via', 'rung',
              'placements', jsonb_build_array(jsonb_build_object('place', v_slot.place, 'kind', v_slot.kind,
                'at', v_slot.at, 'caption', 'Week', 'good_until', null, 'capability_edition', 1)))));
        end loop;
        perform public.content_week_made(v_week.tenant, v_week.plan, 'prepare', v_cap, v_lease);
      else
        for v_slot in
          select ps.*, ss.deadline from public.plan_slots ps join sim_slot ss on ss.slot = ps.id
           where ps.plan_id = v_week.plan and ps.state = 'approved' and ps.post_id is null and ps.piece_id is null
        loop
          if v_slot.deadline < v_tick then
            perform public.plan_slot_made(v_week.tenant, v_slot.id,
              '{"held": {"why": "late", "reason": "Its time came before it could be made."}}'::jsonb);
            update sim_slot set held_late = true where slot = v_slot.id;
          else
            v_file := gen_random_uuid();
            insert into public.files (id, tenant_id, kind, source, status, name, mime, bytes, fingerprint)
            values (v_file, v_week.tenant, 'image', 'made', 'filed', 'drawn-' || substr(v_file::text, 1, 8), 'image/jpeg', 1000, v_file::text);
            v_answer := public.post_approve(v_week.tenant, v_file, jsonb_build_object(
              'snapshot', jsonb_build_object('revision', null, 'renditions', '[]'::jsonb, 'placements', '[]'::jsonb,
                                             'uses', jsonb_build_array('post'), 'spend', null, 'facts', '[]'::jsonb),
              'intent', null, 'renditions', '[]'::jsonb, 'via', 'rung',
              'placements', jsonb_build_array(jsonb_build_object('place', v_slot.place, 'kind', v_slot.kind,
                'at', v_slot.at, 'caption', 'Week', 'good_until', null, 'capability_edition', 1))));
            perform public.plan_slot_made(v_week.tenant, v_slot.id,
              jsonb_build_object('post_id', v_answer -> 'posts' -> 0 ->> 'post_id'));
            update sim_slot set placed = v_tick where slot = v_slot.id;
          end if;
        end loop;
        perform public.content_week_made(v_week.tenant, v_week.plan, 'make', v_cap, v_lease);
      end if;
    end loop;

    -- The approvals due this tick, as each week's content_week_go job runs: the door places what was prepared.
    v_approved := 0;
    if v_tick >= v_night then
      for v_week in select * from sim where approved is null and due <= v_tick order by i loop
        v_answer := public.content_week_approve(v_week.tenant, v_week.plan, jsonb_build_object('slots', (
          select jsonb_agg(jsonb_build_object('id', ps.id, 'place', ps.place, 'kind', ps.kind, 'at', ps.at,
                                              'file_id', ps.file_id, 'title', ps.title, 'intent', ps.intent))
            from public.plan_slots ps where ps.plan_id = v_week.plan and ps.state = 'proposed')));
        if v_answer ->> 'fate' <> 'approved' then
          raise exception 'held weeks broke: week % was not approved (%)', v_week.i, v_answer;
        end if;
        update sim set approved = v_tick where i = v_week.i;
        update sim_slot ss set placed = v_tick from public.plan_slots ps
         where ps.id = ss.slot and ss.i = v_week.i and ps.post_id is not null and ss.placed is null;
        perform public.content_weeks_start(v_cap, v_lease);
        v_approved := v_approved + 1;
      end loop;
    end if;

    exit when v_tick > v_night and not exists (select 1 from sim where approved is null) and not exists (select 1 from busy)
      and not exists (select 1 from public.content_plans p join sim s on s.plan = p.id
                       where p.make_queued_at is not null and p.made_at is null);
  end loop;

  select count(*) into v_late from sim_slot where held_late or placed > deadline;
  select count(*) into v_unplaced from sim_slot where placed is null and not held_late;
  -- Always raised, so every row this wrote is rolled back.
  raise exception 'held weeks: weeks=% cap=% most_at_once=% prepared_by_8=% late=% unplaced=% peak_calls_a_second=% ticks=%',
    v_weeks, v_cap, v_most, v_ready8, v_late, v_unplaced, round(v_peak), v_tick;
end $sim$;
`;

test(
  `${WEEKS} held weeks at one 8:00: prepared overnight in turn, never more at once than the cap, no post late`,
  { skip },
  () => {
    const { failed, said } = run(MORNING);
    assert.ok(failed, "the block always ends by raising what it found, so nothing it wrote stays");
    assert.doesNotMatch(said, /held weeks broke/, said.slice(-800));
    const found = said.match(
      /held weeks: weeks=(\d+) cap=(\d+) most_at_once=(\d+) prepared_by_8=(\d+) late=(\d+) unplaced=(\d+) peak_calls_a_second=(\d+)/,
    );
    assert.ok(found, said.slice(-800));
    const [, weeks, cap, most, prepared, late, unplaced, peak] = found.map(Number);
    assert.equal(weeks, WEEKS);
    assert.equal(cap, WEEKS_MAKING_AT_ONCE);
    assert.ok(most <= cap, `never more than the cap at once (${most} of ${cap})`);
    assert.ok(prepared > WEEKS / 2, `most weeks prepared before 8:00 (${prepared})`);
    assert.equal(late, 0, "no slot placed after its time less its margin, and none held late");
    assert.equal(unplaced, 0, "every slot placed");
    assert.ok(peak <= 60, `the database's front never asked more than it takes (${peak} calls a second)`);
    assert.ok(MAKING_CALLS_A_SECOND <= 60 && CALLS_A_WEEK_MADE > 0);
  },
);
