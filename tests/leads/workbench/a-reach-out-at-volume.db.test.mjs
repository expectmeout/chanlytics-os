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
 * reach_out_why_not asked the never-again list of each lead in turn (00640), most of why a drawer at the ceiling ran past a member's
 * 8 s. It touches no more rows of a CTE, and the plan cannot see inside what it calls, so what holds that is how many times each
 * function ran, every call counted: the same on any machine, for one lead or for thousands. Each reason is held beside it, asked of
 * many leads at once and of each alone, before the digests are keyed and after, since production is keyed.
 *
 * Local stack only. Rows are written with triggers off (session_replication_role): this measures the reads, not the writes.
 */
import { randomUUID } from "node:crypto";
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

/**
 * Every way a lead can stand before reach_out_why_not, and what it is told: each reason, each way it is reached, and each pair the
 * rule's order decides. `yes` is what it is told by a reach-out that includes the unconfirmed, where that differs. `held` says what
 * the never-again list holds, `person` who People holds, `send` what was sent, `member` what the finder saw, each beside this lead.
 */
const REASON_CASES = [
  { tag: "lets_go", why: null },
  { tag: "gone_erased", why: "gone", lead: { erased_at: "now()" } },
  { tag: "gone_blanked", why: "gone", lead: { blanked_at: "now()" } },
  { tag: "gone_beats_closed", why: "gone", lead: { erased_at: "now()", stage: "'archived'" } },
  { tag: "closed_by_stage", why: "closed", lead: { stage: "'archived'" } },
  { tag: "closed_nurturing", why: "closed", lead: { stage: "'nurture'" } },
  { tag: "closed_by_reason", why: "closed", lead: { closed_reason: "'said_no'" } },
  { tag: "closed_beats_customer", why: "closed", lead: { stage: "'archived'" }, person: [{ by: "email" }] },
  { tag: "customer_by_email", why: "customer", person: [{ by: "email" }] },
  { tag: "customer_in_another_case", why: "customer", email: "  CASE@Fixture-Why.Example ", person: [{ by: "email" }] },
  { tag: "customer_by_number", why: "customer", person: [{ by: "phone" }] },
  { tag: "customer_wrote_from_it", why: "customer", person: [{ by: "identity" }] },
  { tag: "customer_beats_suppressed", why: "customer", person: [{ by: "email" }], held: [{ kind: "email" }] },
  { tag: "no_customer_erased", why: null, person: [{ by: "email", erased: true }] },
  { tag: "no_customer_erased_identity", why: null, person: [{ by: "identity", erased: true }] },
  { tag: "no_customer_by_text", why: null, person: [{ by: "identity", channel: "sms" }] },
  {
    tag: "no_customer_elsewhere",
    why: null,
    person: [
      { by: "email", elsewhere: true },
      { by: "phone", elsewhere: true },
    ],
  },
  { tag: "suppressed_opted_out", why: "suppressed", held: [{ kind: "email" }] },
  { tag: "suppressed_said_no", why: "suppressed", held: [{ kind: "email", what: "said_no" }] },
  { tag: "suppressed_erased", why: "suppressed", held: [{ kind: "email", what: "erased" }] },
  {
    tag: "suppressed_in_another_case",
    why: "suppressed",
    email: "  MIXED@Fixture-Why.Example ",
    held: [{ kind: "email" }],
  },
  {
    tag: "suppressed_by_domain",
    why: "suppressed",
    email: "someone@held.example",
    held: [{ kind: "domain", value: "held.example" }],
  },
  {
    tag: "suppressed_by_domain_in_another_case",
    why: "suppressed",
    email: "Someone@HELD.Example",
    held: [{ kind: "domain", value: "held.example" }],
  },
  {
    tag: "suppressed_by_the_last_at",
    why: "suppressed",
    email: "a@b@held.example",
    held: [{ kind: "domain", value: "held.example" }],
  },
  { tag: "suppressed_by_place", why: "suppressed", held: [{ kind: "place" }] },
  { tag: "suppressed_by_number", why: "suppressed", held: [{ kind: "phone" }] },
  { tag: "suppressed_beats_written", why: "suppressed", held: [{ kind: "email" }], send: { state: "sent" } },
  {
    tag: "no_suppression_elsewhere",
    why: null,
    held: [
      { kind: "email", elsewhere: true },
      { kind: "place", elsewhere: true },
      { kind: "phone", elsewhere: true },
    ],
  },
  {
    tag: "no_suppression_of_another_kind",
    why: null,
    held: [
      { kind: "phone", of: "place" },
      { kind: "place", of: "phone" },
      { kind: "domain", of: "email" },
    ],
  },
  { tag: "no_domain_without_an_at", why: null, email: "no-at-sign", held: [{ kind: "domain", value: "no-at-sign" }] },
  { tag: "no_domain_after_a_last_at", why: null, email: "someone@", held: [{ kind: "domain", value: "" }] },
  {
    tag: "an_address_row_is_not_a_domain_row",
    why: null,
    email: "someone@not-a-domain-row.example",
    held: [{ kind: "email", value: "not-a-domain-row.example" }],
  },
  { tag: "written_sent", why: "written", send: { state: "sent" } },
  { tag: "written_planned", why: "written", send: { state: "planned" } },
  { tag: "written_held", why: "written", send: { state: "held", reason: "chain" } },
  { tag: "written_skipped_otherwise", why: "written", send: { state: "skipped", reason: "kept_waiting" } },
  { tag: "written_beats_shared", why: "written", send: { state: "sent" }, member: { shares: true } },
  { tag: "not_written_run_canceled", why: null, send: { state: "skipped", reason: "run_canceled" } },
  { tag: "not_written_taken_back", why: null, send: { state: "skipped", reason: "owner_took_back" } },
  { tag: "not_written_moved", why: null, send: { state: "skipped", reason: "moved" } },
  { tag: "not_written_its_own_email", why: null, send: { state: "queued", own: true } },
  { tag: "shared", why: "shared", member: { shares: true } },
  { tag: "shared_beats_no_email", why: "shared", email: null, member: { shares: true } },
  { tag: "not_shared_blanked", why: null, member: { shares: true, blanked: true } },
  { tag: "not_shared_empty", why: null, member: {} },
  { tag: "not_shared_no_key", why: null, member: { judgment: "{}" } },
  { tag: "no_email", why: "no_email", email: null },
  { tag: "no_email_blank", why: "no_email", email: "" },
  { tag: "no_email_spaces", why: "no_email", email: "   " },
  { tag: "no_email_beats_its_state", why: "no_email", email: null, lead: { email_state: "'invalid'" } },
  { tag: "checking", why: "checking", lead: { email_state: "'checking'" } },
  { tag: "unconfirmed", why: "unconfirmed", yes: null, lead: { email_state: "'catch_all'" } },
  { tag: "invalid", why: "invalid", lead: { email_state: "'invalid'" } },
  { tag: "unchecked", why: "unchecked", lead: { email_state: "'none'" } },
  { tag: "unchecked_unknown", why: "unchecked", lead: { email_state: "'unknown'" } },
];
/** A list beside the cases, of which this many are on the never-again list by each of its four kinds. */
const LIST_LEADS = 5_000;
const HELD_EACH = 500;
/** What a read asks, of one lead or of thousands: an address and its domain, a place, a number, each in one read. */
const ASKED_ONCE = {
  lead_addresses_suppressed: 1,
  lead_values_suppressed: 4,
  erasure_digests: 4,
  erasure_digests_legacy: 4,
  erasure_keys: 0,
  // What asks of one value at a time. Any of these in a read grows it with its list.
  lead_address_suppressed: 0,
  lead_suppression_hash: 0,
  erasure_digest: 0,
  erasure_digest_legacy: 0,
  erasure_key: 0,
};
/** Without it a list of one looks cheaper planned for its own values, each call plans again, and one lead takes twice as long. */
const KEEP_ONE_PLAN = ["erasure_keys", "lead_addresses_suppressed", "lead_values_suppressed"];

const sqlText = (s) => (s === null ? "null" : `'${s.replaceAll("'", "''")}'`);

/** The rows of one case, written while the seed's triggers are off. */
function seedOf(c, i, ids) {
  const id = ids[c.tag];
  const email = c.email === undefined ? `case${i}@fixture-why.example` : c.email;
  const address = email === null ? null : email.trim().toLowerCase();
  const phone = `+1737555${String(i).padStart(4, "0")}`;
  const place = `ChIJfixtureWhy${i}`;
  const lead = {
    stage: "'ready'",
    closed_reason: "null",
    email_state: "'ok'",
    erased_at: "null",
    blanked_at: "null",
    ...c.lead,
  };
  const of = { email: address, place, phone };
  const rows = [
    `insert into public.leads (id, tenant_id, place_id, business_name, email, email_state, phone_e164, phone_sources, stage, closed_reason, erased_at, blanked_at, found_at, stage_at)
       values ('${id}', t, '${place}', 'Case ${i}', ${sqlText(email)}, ${lead.email_state}, '${phone}', 1, ${lead.stage}, ${lead.closed_reason}, ${lead.erased_at}, ${lead.blanked_at}, now(), now());`,
  ];
  for (const p of c.person ?? []) {
    const person = randomUUID();
    const workspace = p.elsewhere ? "other" : "t";
    rows.push(`insert into public.contacts (id, tenant_id, email, phone_e164, erased_at)
      values ('${person}', ${workspace}, ${p.by === "email" ? sqlText(address) : "null"}, ${p.by === "phone" ? `'${phone}'` : "null"}, ${p.erased ? "now()" : "null"});`);
    if (p.by === "identity")
      rows.push(
        `insert into public.contact_identities (tenant_id, contact_id, channel, external_id) values (${workspace}, '${person}', '${p.channel ?? "email"}', ${sqlText(address)});`,
      );
  }
  for (const h of c.held ?? []) {
    const value = h.value ?? of[h.of ?? h.kind];
    // Elsewhere, it holds this workspace's own digest: only its workspace says the row is not this one's.
    const workspace = h.elsewhere ? "other" : "t";
    rows.push(`insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (${workspace}, '${h.kind}', public.lead_suppression_hash(t, ${sqlText(value)}), '${h.what ?? "email_opt_out"}') on conflict do nothing;`);
  }
  if (c.send?.own) {
    rows.push(`insert into public.sequence_sends (tenant_id, lead_id, state) values (t, '${id}', '${c.send.state}');`);
  } else if (c.send) {
    const { state, reason } = c.send;
    rows.push(`insert into public.sequence_sends (tenant_id, sequence_id, batch_id, lead_id, state, reason, send_at, sent_at)
      values (t, root, batch, '${id}', '${state}', ${reason ? `'${reason}'` : "null"}, ${state === "planned" ? "now()" : "null"}, ${state === "sent" ? "now()" : "null"});`);
  }
  if (c.member) {
    const judgment =
      c.member.judgment ?? (c.member.shares ? '{"reasons":[],"shares":["x"]}' : '{"reasons":[],"shares":[]}');
    rows.push(`insert into public.lead_search_members (search_id, lead_id, tenant_id, class, counted, counted_month, fit, reason, judgment, blanked_at)
      values (list, '${id}', t, 'qualified', true, to_char(now(), 'YYYY-MM'), 'strong', 'On the list', '${judgment}', ${c.member.blanked ? "now()" : "null"});`);
  }
  return rows.join("\n");
}

/** What a workspace says of the cases and of the list, and how many times each function ran to say it. */
const readOf = (state, ids) => `
  select coalesce(jsonb_object_agg(w.lead_id::text, w.why), '{}') into a from public.reach_out_why_not(t, cases, false) w;
  seen := seen || jsonb_build_object('${state}_together', a);
  select coalesce(jsonb_object_agg(w.lead_id::text, w.why), '{}') into a from public.reach_out_why_not(t, cases, true) w;
  seen := seen || jsonb_build_object('${state}_unconfirmed_too', a);
  select coalesce(jsonb_object_agg(w.lead_id::text, w.why), '{}') into a
    from unnest(cases) c(id) cross join lateral public.reach_out_why_not(t, array[c.id], false) w;
  seen := seen || jsonb_build_object('${state}_alone', a);
  select coalesce(jsonb_object_agg(w.lead_id::text, w.why), '{}') into a
    from public.sequence_queued_why_not(t, cases, array(select root from unnest(cases))) w;
  seen := seen || jsonb_build_object('${state}_queued', a);
  select jsonb_build_object('rows', count(*), 'why', w.why) into a from public.reach_out_why_not(t, array[null::uuid], false) w group by w.why;
  seen := seen || jsonb_build_object('${state}_nobody_at_all', a);
  select coalesce(jsonb_object_agg(x.why, x.n), '{}') into a
    from (select coalesce(w.why, 'lets_go') as why, count(*) as n from public.reach_out_why_not(t, all_of_the_list, false) w group by 1) x;
  seen := seen || jsonb_build_object('${state}_list', a);
  a := pg_temp.calls();
  perform count(*) from public.reach_out_why_not(t, all_of_the_list, false);
  seen := seen || jsonb_build_object('${state}_calls_for_the_list', pg_temp.calls_since(a));
  a := pg_temp.calls();
  perform count(*) from public.reach_out_why_not(t, array['${ids.lets_go}'::uuid], false);
  seen := seen || jsonb_build_object('${state}_calls_for_one', pg_temp.calls_since(a));`;

/** Each case's answer under its tag. */
function byTag(answers, ids) {
  const tags = Object.fromEntries(Object.entries(ids).map(([tag, id]) => [id, tag]));
  return Object.fromEntries(Object.entries(answers).map(([id, why]) => [tags[id] ?? id, why]));
}

test(
  "reach_out_why_not says the same of a lead however it is asked, keyed or not, and asks the never-again list once",
  { skip, timeout: 300_000 },
  () => {
    const ids = {
      ...Object.fromEntries(REASON_CASES.map((c) => [c.tag, randomUUID()])),
      nobody_by_that_id: randomUUID(),
      another_workspace_s: randomUUID(),
    };
    const member = randomUUID();
    const seen = neverCommitted(`
    declare
      t uuid; other uuid; list uuid; root uuid; batch uuid; seen jsonb := '{}'; a jsonb;
      cases uuid[] := array[${Object.values(ids)
        .map((id) => `'${id}'::uuid`)
        .join(", ")}];
      all_of_the_list uuid[];
      body text; conf text[]; plan text; mem text;
    begin
      execute 'set local session_replication_role = replica';
      insert into public.tenants (slug, name) values ('why-' || gen_random_uuid(), 'Why') returning id into t;
      insert into public.tenants (slug, name) values ('why-other-' || gen_random_uuid(), 'Elsewhere') returning id into other;
      insert into public.memberships (tenant_id, user_id, role) values (t, '${member}', 'owner');
      perform set_config('request.jwt.claims', '{"sub":"${member}","role":"authenticated"}', true);
      insert into public.lead_searches (tenant_id, via, card, name, asked, plan) values (t, 'chosen', 'fixture', 'The list', '', '{}') returning id into list;
      root := gen_random_uuid();
      insert into public.sequence_steps (id, sequence_id, place, tenant_id, kind, name, trigger, policy_class, state, lead_search_id, gap_minutes, template_id, template_language, template_name)
        values (root, root, 1, t, 'reach_out', 'Why', 'lead_first', 'outreach', 'running', list, 12, gen_random_uuid(), 'en_US', 'fixture_why');
      insert into public.sequence_batches (tenant_id, name, template_id, template_name, template_language, state, scheduled_for, sequence_id)
        values (t, 'Batch', gen_random_uuid(), 'fixture_why', 'en_US', 'sent', now(), root) returning id into batch;
      insert into public.leads (id, tenant_id, place_id, business_name, email, email_state, phone_e164, phone_sources, stage, found_at, stage_at)
        values ('${ids.another_workspace_s}', other, 'ChIJfixtureWhyTheirs', 'Theirs', 'theirs@fixture-why.example', 'ok', '+17375550000', 1, 'ready', now(), now());
      ${REASON_CASES.map((c, i) => seedOf(c, i + 1, ids)).join("\n")}

      -- The list: ${HELD_EACH} on the never-again list by each kind, and the rest free to go.
      create temp table why_list on commit drop as
        select i, gen_random_uuid() as id,
               'list' || i || case when i > ${3 * HELD_EACH} and i <= ${4 * HELD_EACH} then '@list-held.example' else '@fixture-why.example' end as email,
               'ChIJfixtureWhyList' || i as place, '+1512' || lpad(i::text, 7, '0') as phone
          from generate_series(1, ${LIST_LEADS}) i;
      insert into public.leads (id, tenant_id, place_id, business_name, email, email_state, phone_e164, phone_sources, stage, found_at, stage_at)
        select x.id, t, x.place, 'List ' || x.i, x.email, 'ok', x.phone, 1, 'ready', now(), now() from why_list x;
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
        select t, 'email', public.lead_suppression_hash(t, x.email), 'email_opt_out' from why_list x where x.i <= ${HELD_EACH};
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
        select t, 'place', public.lead_suppression_hash(t, x.place), 'erased' from why_list x where x.i > ${HELD_EACH} and x.i <= ${2 * HELD_EACH};
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
        select t, 'phone', public.lead_suppression_hash(t, x.phone), 'erased' from why_list x where x.i > ${2 * HELD_EACH} and x.i <= ${3 * HELD_EACH};
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
        values (t, 'domain', public.lead_suppression_hash(t, 'list-held.example'), 'said_no');
      all_of_the_list := array(select x.id from why_list x);
      execute 'set local session_replication_role = origin';
      execute 'set local jit = off';
      analyze public.leads, public.lead_suppressions, public.contacts, public.contact_identities, public.lead_search_members, public.sequence_sends;

      -- How many times each has run, every call counted. A function of this session's, gone when the block is.
      create function pg_temp.calls() returns jsonb language sql as $calls$
        select jsonb_object_agg(p.proname, coalesce(pg_stat_get_xact_function_calls(p.oid), 0))
          from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array[${Object.keys(
            ASKED_ONCE,
          )
            .map((f) => `'${f}'`)
            .join(", ")}])
      $calls$;
      create function pg_temp.calls_since(p_then jsonb) returns jsonb language sql as $calls$
        select jsonb_object_agg(k.key, (k.value)::int - coalesce((p_then->>k.key)::int, 0)) from jsonb_each_text(pg_temp.calls()) k
      $calls$;
      set local track_functions = 'all';
      ${readOf("legacy", ids)}

      -- Its own plan, as a call plans it: what it walks of its CTE and of what it asks.
      execute 'set local plan_cache_mode = force_generic_plan';
      ${planOf("why", "public.reach_out_why_not(uuid, uuid[], boolean)", ["p_tenant_id", "p_lead_ids", "p_include_unconfirmed"], "uuid, uuid[], boolean", "%L, %L, false", "t, all_of_the_list")}
      execute 'set local plan_cache_mode = auto';

      -- Keyed, as production is: this workspace's rows by the real re-key, then the mark, which never commits.
      perform public.erasure_rekey(true, t);
      perform public.erasure_rekey(true, other);
      update public.erasure_keying set keyed_at = now() where id;
      ${readOf("keyed", ids)}

      select jsonb_object_agg(p.proname, to_jsonb(p.proconfig)) into a from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = any (array[${KEEP_ONE_PLAN.map((f) => `'${f}'`).join(", ")}]);
      seen := seen || jsonb_build_object('settings', a);
      raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex');
    end;`);

    const told = Object.fromEntries(REASON_CASES.map((c) => [c.tag, c.why]));
    const toldIfIncluded = Object.fromEntries(REASON_CASES.map((c) => [c.tag, c.yes === undefined ? c.why : c.yes]));
    const notThere = { nobody_by_that_id: "gone", another_workspace_s: "gone" };
    const list = { suppressed: 4 * HELD_EACH, lets_go: LIST_LEADS - 4 * HELD_EACH };
    for (const [state, keys] of [
      ["legacy", {}],
      ["keyed", { erasure_keys: 4 }],
    ]) {
      // What it says: the same of everyone at once, of each alone, and through the door a list asks by.
      assert.deepEqual(byTag(seen[`${state}_together`], ids), { ...told, ...notThere }, `${state}: asked of many`);
      assert.deepEqual(byTag(seen[`${state}_alone`], ids), { ...told, ...notThere }, `${state}: asked of each alone`);
      assert.deepEqual(
        byTag(seen[`${state}_unconfirmed_too`], ids),
        { ...toldIfIncluded, ...notThere },
        `${state}: with the unconfirmed`,
      );
      assert.deepEqual(byTag(seen[`${state}_queued`], ids), { ...told, ...notThere }, `${state}: as a list asks`);
      assert.deepEqual(seen[`${state}_nobody_at_all`], { rows: 1, why: "gone" }, `${state}: a null among the asked`);
      assert.deepEqual(seen[`${state}_list`], list, `${state}: the list`);
      // What it takes: one read, the same for one lead as for thousands.
      assert.deepEqual(
        seen[`${state}_calls_for_the_list`],
        { ...ASKED_ONCE, ...keys },
        `${state}: ${LIST_LEADS} leads`,
      );
      assert.deepEqual(seen[`${state}_calls_for_one`], { ...ASKED_ONCE, ...keys }, `${state}: one lead`);
    }
    const walked = rowsWalked(seen.why);
    assert.ok(walked <= MOST_WALKED, `reach_out_why_not walked ${walked} rows: its most is ${MOST_WALKED}`);
    for (const f of KEEP_ONE_PLAN)
      assert.ok(seen.settings[f]?.includes("plan_cache_mode=force_generic_plan"), `${f}: ${seen.settings[f]}`);
  },
);
