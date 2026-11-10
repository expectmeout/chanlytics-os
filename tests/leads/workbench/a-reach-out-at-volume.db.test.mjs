/**
 * A reach-out at volume (00572): a list of 10,000 leads, half of them written to, beside 30,000 other workspaces' lists and 3,000
 * other reach-outs, read in a transaction that never commits.
 *
 * What holds it is how many rows a plan reads out of its CTEs and the functions it calls, every loop counted, and not the time.
 * The faults this was written for compare rows in memory: they touch no more blocks, and a line in milliseconds would have to clear
 * whatever else the read does, which at this size is mostly reach_out_why_not asking of each lead in turn. This number is the same
 * on any machine, and the gap is wide: a read that holds walks each a few times, and the faults read tens of millions of rows.
 *
 *   reach_out_root_lines read its list against the leads written to with `not exists`, and reach_out_audience joined its members to
 *   what reach_out_why_not said of them. Each is a join chosen from guesses, and with a low guess each chose a loop. The other
 *   workspaces are what make the guess low: a function's plan is made once, without its values, from the average across every
 *   workspace. So every run reads in that state, and asserts it got there.
 *
 *   reach_out_people_of read the whole audience again for each line, to find that line's place. That took no guess at all.
 *
 * The plan is read from each function's own text, prepared and forced generic, with its own settings: `explain` of a call shows
 * nothing of a function's inside, and a SQL function plans without its values, as this does.
 *
 * A customer's send sits in the reach-out too, with no lead. `not in` is only safe because no row of the walk is ever null, and
 * one null would hide every lead not yet written to, which the counts below would say.
 *
 * Local stack only. Rows are written with triggers off (session_replication_role): this measures the reads, not the writes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { neverCommitted } from "../table/_never-committed.mjs";

const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes tens of thousands of rows"
    : false;

/** The leads on the list, as the seed's own series says, and those written to. */
const LEADS = 10_000;
const WRITTEN = 5_000;
/** The audience takes what it may write to: everyone on the list not written to yet, up to its 5,000. */
const PLACED = 5_000;
/**
 * Trying again (00608, decision 0120), asked at fewer days than a sequence may keep (90 to 365) so the seed's emails,
 * which left 37 to 39 days ago, are old enough: the written leads whose every email has left come back, the half with
 * one still planned do not.
 */
const AGAIN_DAYS = 30;
const BACK = WRITTEN / 2;
/** The most rows a read may walk: each CTE and function a few times over, and never once for each row of another. */
const MOST_WALKED = 10 * LEADS;
/** The guess the old reads' loops came from: past this the run did not reach the state it is here to read. */
const LOW_GUESS = 50;

/** What has no index to go by, so a loop over it reads all of it each time. */
const WALKS = new Set(["CTE Scan", "Function Scan"]);

/** Every row a plan read out of a walk: what it returned and what its filter threw away, on every loop. */
function rowsWalked(node) {
  const here = WALKS.has(node["Node Type"])
    ? ((node["Actual Rows"] ?? 0) + (node["Rows Removed by Filter"] ?? 0)) * (node["Actual Loops"] ?? 0)
    : 0;
  return (node.Plans ?? []).reduce((sum, child) => sum + rowsWalked(child), here);
}

/** The node that makes a CTE, however deep: its Plan Rows are what was guessed of it. */
function cteOf(node, name) {
  if (node["Subplan Name"] === `CTE ${name}`) return node;
  for (const child of node.Plans ?? []) {
    const found = cteOf(child, name);
    if (found) return found;
  }
  return null;
}

/** Any read past its most, or a run that never reached the low guess, fails and says which. */
function holdTheWalks(plans) {
  for (const [name, plan, made] of [
    ["the leads written to", plans.lines, "per"],
    ["the audience's members", plans.audience, "members"],
  ]) {
    const guess = cteOf(plan, made)["Plan Rows"];
    assert.ok(guess <= LOW_GUESS, `${name} were guessed at ${guess}: this run did not read under the low guess`);
  }
  for (const [name, plan] of Object.entries(plans)) {
    const walked = rowsWalked(plan);
    assert.ok(walked <= MOST_WALKED, `${name} walked ${walked} rows: its most is ${MOST_WALKED}`);
  }
}

const walk = (type, rows, loops, removed) => ({
  "Node Type": type,
  "Actual Rows": rows,
  "Actual Loops": loops,
  ...(removed ? { "Rows Removed by Filter": removed } : {}),
});
const cte = (rows, loops, removed) => walk("CTE Scan", rows, loops, removed);
const madeOf = (name, guess) => ({
  "Subplan Name": `CTE ${name}`,
  "Plan Rows": guess,
  "Actual Rows": WRITTEN,
  "Actual Loops": 1,
});
/** As a read that holds is planned: each walk read once. */
const READS_THAT_HOLD = {
  lines: { Plans: [madeOf("per", 1), cte(WRITTEN, 1), cte(WRITTEN, 1)] },
  audience: { Plans: [madeOf("members", 1), cte(LEADS, 1), cte(LEADS, 1), walk("Function Scan", WRITTEN, 1, WRITTEN)] },
  people: {
    Plans: [
      walk("Function Scan", LEADS, 1),
      walk("Function Scan", PLACED, 1),
      cte(LEADS, 1),
      cte(LEADS, 1),
      cte(PLACED, 1),
      cte(PLACED, 1),
    ],
  },
};

test("a plan that walks each CTE and function once holds", () => {
  holdTheWalks(READS_THAT_HOLD);
  assert.equal(rowsWalked(READS_THAT_HOLD.people), 3 * LEADS + 3 * PLACED);
});

test("a read that walks one for each row of another fails, however it came to", () => {
  const faults = {
    "a nested loop over the written leads": { lines: { Plans: [madeOf("per", 1), cte(WRITTEN, LEADS)] } },
    "a not in that stopped hashing": { lines: { Plans: [madeOf("per", 1), { Plans: [cte(WRITTEN, LEADS)] }] } },
    "an audience joined to its reasons by a loop": {
      audience: { Plans: [madeOf("members", 1), walk("Function Scan", WRITTEN, LEADS, WRITTEN)] },
    },
    "a place found by reading the audience again for each line": {
      people: { Plans: [{ "Node Type": "Append", Plans: [cte(0, LEADS, PLACED)] }] },
    },
  };
  for (const [fault, read] of Object.entries(faults))
    assert.throws(() => holdTheWalks({ ...READS_THAT_HOLD, ...read }), /walked \d+ rows: its most is 100000/, fault);
  // Never run is no walk.
  assert.equal(rowsWalked({ Plans: [cte(WRITTEN, 0)] }), 0);
});

test("a run that never reached the low guess fails: it would pass whatever the plan", () => {
  assert.throws(
    () => holdTheWalks({ ...READS_THAT_HOLD, lines: { Plans: [madeOf("per", 37_491)] } }),
    /written to were guessed at 37491: this run did not read under the low guess/,
  );
  assert.throws(
    () => holdTheWalks({ ...READS_THAT_HOLD, audience: { Plans: [madeOf("members", 10_000)] } }),
    /members were guessed at 10000: this run did not read under the low guess/,
  );
});

const SEED = `
  execute 'set local session_replication_role = replica';
  insert into public.tenants (slug, name) values ('volume-' || gen_random_uuid(), 'Volume') returning id into t;
  insert into public.lead_searches (tenant_id, via, card, name, asked, plan) values (t, 'chosen', 'fixture', 'The list', '', '{}') returning id into list;
  root := gen_random_uuid();
  insert into public.sequence_steps (id, sequence_id, place, tenant_id, kind, name, trigger, policy_class, state, lead_search_id, gap_minutes, template_id, template_language, template_name)
    values (root, root, 1, t, 'reach_out', 'Volume', 'lead_first', 'outreach', 'running', list, 12, gen_random_uuid(), 'en_US', 'fixture_volume');

  insert into public.leads (id, tenant_id, place_id, business_name, email, email_state, phone_e164, phone_sources, stage, found_at, stage_at)
    select gen_random_uuid(), t, 'ChIJfixtureVolume' || i, 'Example Business ' || i, 'owner' || i || '@fixture-volume.example', 'ok',
           '+1512' || lpad(i::text, 7, '0'), 1, 'ready', now() - i * interval '1 minute', now()
      from generate_series(1, 10000) i;
  create temp table volume_leads on commit drop as
    select l.id, row_number() over (order by l.found_at desc)::int as i from public.leads l where l.tenant_id = t;
  create unique index on volume_leads (i);
  insert into public.lead_search_members (search_id, lead_id, tenant_id, class, counted, counted_month, fit, reason, judgment)
    select list, v.id, t, 'qualified', true, to_char(now(), 'YYYY-MM'), 'strong', 'On the list', '{"reasons":[],"shares":[]}'
      from volume_leads v;

  insert into public.sequence_batches (tenant_id, name, template_id, template_name, template_language, state, scheduled_for, sequence_id)
    select t, 'Batch ' || b.name, gen_random_uuid(), 'fixture_volume', 'en_US', b.state, now(), root
      from (values ('sent1', 'sent'), ('sent2', 'sent'), ('sent3', 'sent'), ('next', 'scheduled')) b(name, state);
  -- Half the list written to, the longest found: the audience takes those first, so one that let a written lead through says so.
  -- Two emails gone and a third gone or planned.
  insert into public.sequence_sends (tenant_id, sequence_id, step_id, batch_id, lead_id, state, send_at, sent_at, created_at)
    select t, root, case when n = 1 then root end,
           (select b.id from public.sequence_batches b where b.tenant_id = t and b.name = case when a.state = 'sent' then 'Batch sent' || n else 'Batch next' end),
           v.id, a.state, case when a.state = 'planned' then now() + interval '1 day' end,
           case when a.state = 'sent' then now() - interval '40 days' + n * interval '1 day' end, now() - interval '40 days' + n * interval '1 day'
      from volume_leads v
     cross join generate_series(1, 3) n
     cross join lateral (select case when n < 3 or v.i % 2 = 0 then 'sent' else 'planned' end as state) a
     where v.i > ${LEADS - WRITTEN};
  -- A customer's, with no lead: the one row that could put a null in the walk.
  insert into public.sequence_sends (tenant_id, sequence_id, batch_id, contact_id, state, sent_at)
    select t, root, b.id, gen_random_uuid(), 'sent', now() from public.sequence_batches b where b.tenant_id = t and b.name = 'Batch sent1';

  -- Other workspaces, small: what brings the guess of one list, and of what one reach-out wrote to, down to their average.
  insert into public.lead_searches (id, tenant_id, via, card, name, asked, plan)
    select gen_random_uuid(), gen_random_uuid(), 'chosen', 'other', 'Another', '', '{}' from generate_series(1, 30000);
  insert into public.lead_search_members (search_id, lead_id, tenant_id, class, counted, counted_month, reason, judgment)
    select q.id, gen_random_uuid(), q.tenant_id, 'qualified', true, to_char(now(), 'YYYY-MM'), 'Another', '{}'
      from public.lead_searches q cross join generate_series(1, 2) where q.card = 'other';
  create temp table other_chains on commit drop as
    select gen_random_uuid() as root, gen_random_uuid() as batch, gen_random_uuid() as tenant from generate_series(1, 3000);
  insert into public.sequence_batches (id, tenant_id, name, template_id, template_name, template_language, state, scheduled_for, sequence_id)
    select o.batch, o.tenant, 'Another', gen_random_uuid(), 'fixture_volume', 'en_US', 'sent', now(), o.root from other_chains o;
  insert into public.sequence_sends (tenant_id, sequence_id, batch_id, lead_id, state, sent_at)
    select o.tenant, o.root, o.batch, gen_random_uuid(), 'sent', now() from other_chains o cross join generate_series(1, 2);

  execute 'set local session_replication_role = origin';
  -- Production runs with JIT off, and a plan is what is being read.
  execute 'set local jit = off';
  analyze public.leads, public.lead_searches, public.lead_search_members, public.sequence_steps, public.sequence_sends, public.sequence_batches;`;

/** A function's own plan, with its values withheld and its settings on, as a call to it is planned. Its settings end with the plan. */
const planOf = (name, signature, args, types, values, using) => `
  select ${args.reduce((text, arg, i) => `regexp_replace(${text}, '\\m${arg}\\M', '$${i + 1}', 'g')`, "p.prosrc")}, p.proconfig into body, conf
    from pg_proc p where p.oid = '${signature}'::regprocedure;
  mem := current_setting('work_mem');
  perform set_config(split_part(c, '=', 1), split_part(c, '=', 2), true) from unnest(conf) c where c not like 'search_path=%';
  execute 'prepare ${name}(${types}) as ' || body;
  execute format('explain (analyze, timing off, format json) execute ${name}(${values})', ${using}) into plan;
  seen := seen || jsonb_build_object('${name}', (plan::jsonb)->0->'Plan');
  perform set_config('work_mem', mem, true);`;
const ROOT_ARGS = ["p_tenant_id", "p_root_id"];

test(
  "a reach-out at volume reads each of its walks a few times over, and says what it said before",
  { skip, timeout: 300_000 },
  () => {
    const seen = neverCommitted(`
    declare
      t uuid; list uuid; root uuid; seen jsonb := '{}'; t0 timestamptz; a jsonb;
      body text; conf text[]; plan text; mem text;
    begin
      ${SEED}
      execute 'set local plan_cache_mode = force_generic_plan';
      ${planOf("lines", "public.reach_out_root_lines(uuid, uuid)", ROOT_ARGS, "uuid, uuid", "%L, %L", "t, root")}
      ${planOf("audience", "public.reach_out_audience(uuid, uuid, integer, boolean, integer)", ["p_tenant_id", "p_search_id", "p_limit", "p_include_unconfirmed", "p_again_after"], "uuid, uuid, integer, boolean, integer", "%L, %L, 5000, false, null", "t, list")}
      ${planOf("again", "public.reach_out_audience(uuid, uuid, integer, boolean, integer)", ["p_tenant_id", "p_search_id", "p_limit", "p_include_unconfirmed", "p_again_after"], "uuid, uuid, integer, boolean, integer", `%L, %L, 10000, false, ${AGAIN_DAYS}`, "t, list")}
      ${planOf("people", "public.reach_out_people_of(uuid, uuid)", ROOT_ARGS, "uuid, uuid", "%L, %L", "t, root")}

      t0 := clock_timestamp();
      select jsonb_build_object(
               'rows', count(*),
               'written', count(*) filter (where (x.line->>'sent')::int > 0),
               'on_the_list', count(*) filter (where x.line->>'added_at' is not null))
        into a from public.reach_out_root_lines(t, root) x;
      seen := seen || jsonb_build_object('lines_said', a, 'lines_ms', round((extract(epoch from clock_timestamp() - t0) * 1000)::numeric));

      t0 := clock_timestamp();
      select jsonb_build_object(
               'rows', count(*),
               'written', count(*) filter (where exists (select 1 from public.sequence_sends s where s.sequence_id = root and s.lead_id = x.lead_id)))
        into a from public.reach_out_audience(t, list, 5000, false) x;
      seen := seen || jsonb_build_object('audience_said', a, 'audience_ms', round((extract(epoch from clock_timestamp() - t0) * 1000)::numeric));

      -- Trying again (00608): the written whose every email left long enough ago come back, after the new ones.
      t0 := clock_timestamp();
      select jsonb_build_object(
               'rows', count(*),
               'written', count(*) filter (where exists (select 1 from public.sequence_sends s where s.sequence_id = root and s.lead_id = x.lead_id)))
        into a from public.reach_out_audience(t, list, 10000, false, ${AGAIN_DAYS}) x;
      seen := seen || jsonb_build_object('again_said', a, 'again_ms', round((extract(epoch from clock_timestamp() - t0) * 1000)::numeric));
      select jsonb_build_object(
               'rows', count(*),
               'written', count(*) filter (where exists (select 1 from public.sequence_sends s where s.sequence_id = root and s.lead_id = x.lead_id)))
        into a from public.reach_out_audience(t, list, ${PLACED}, false, ${AGAIN_DAYS}) x;
      seen := seen || jsonb_build_object('again_first_said', a);

      t0 := clock_timestamp();
      select jsonb_build_object(
               'rows', count(*),
               'waiting', count(*) filter (where x.grp = 'waiting'),
               'writing', count(*) filter (where x.grp = 'writing'),
               'done', count(*) filter (where x.grp = 'done'),
               'placed', count(*) filter (where x.pos > 0),
               'places', count(distinct x.pos) filter (where x.pos > 0),
               'first_place', min(x.pos) filter (where x.pos > 0),
               'last_place', max(x.pos),
               'written_and_placed', count(*) filter (where x.pos > 0 and (x.line->>'sent')::int > 0))
        into a from public.reach_out_people_of(t, root) x;
      seen := seen || jsonb_build_object('people_said', a, 'people_ms', round((extract(epoch from clock_timestamp() - t0) * 1000)::numeric));
      select p.proconfig into conf from pg_proc p where p.oid = 'public.reach_out_root_lines(uuid, uuid)'::regprocedure;
      seen := seen || jsonb_build_object('lines_settings', to_jsonb(conf));
      raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex');
    end;`);
    const { lines, audience, people, again, ...numbers } = seen;
    const plans = { lines, audience, people, again };
    console.log(
      JSON.stringify({
        ...numbers,
        walked: Object.fromEntries(Object.entries(plans).map(([name, plan]) => [name, rowsWalked(plan)])),
      }),
    );

    // What keeps its `not in` hashed when a count runs far past its rows, which a list this size cannot show.
    assert.ok(numbers.lines_settings.includes("work_mem=64MB"), numbers.lines_settings.join(", "));

    // Every lead once: the written by their sends, the rest by the list. A null in the walk would leave only the written.
    assert.deepEqual(numbers.lines_said, { rows: LEADS, written: WRITTEN, on_the_list: LEADS - WRITTEN });
    // Whoever it may write to, and nobody written to already.
    assert.deepEqual(numbers.audience_said, { rows: PLACED, written: 0 });
    // Trying again: everyone new, then the written whose three emails all left more than AGAIN_DAYS ago (half of them:
    // the other half hold one still planned); and within its limit the new ones come first, so a day's emails go to
    // businesses never written to before any is written to twice.
    assert.deepEqual(numbers.again_said, { rows: PLACED + BACK, written: BACK });
    assert.deepEqual(numbers.again_first_said, { rows: PLACED, written: 0 });
    // Everyone not written to waits, each with a place of their own; a lead written to has none, the audience having let them go.
    assert.deepEqual(numbers.people_said, {
      rows: LEADS,
      waiting: LEADS - WRITTEN,
      writing: WRITTEN,
      done: 0,
      placed: PLACED,
      places: PLACED,
      first_place: 1,
      last_place: PLACED,
      written_and_placed: 0,
    });
    try {
      holdTheWalks(plans);
    } catch (failure) {
      for (const [name, plan] of Object.entries(plans))
        console.log(`${name} walked ${rowsWalked(plan)} rows, planned as ${JSON.stringify(plan)}`);
      throw failure;
    }
  },
);
