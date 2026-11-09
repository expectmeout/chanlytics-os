/**
 * Leads at full volume (decision 0103): one workspace with 50,000 leads, 60,000 memberships, 40,000 places in a sequence,
 * 150,000 lead sends, 100,000 customer sends and 2,000 replies, beside 30,000 other workspaces' lists, read as a signed-in
 * member, in a transaction that never commits. The gate is each read within 300 ms, which a person holds each read's logged
 * time against; a test here fails well past it.
 *
 * Two numbers hold a read, because each misses what the other sees. Blocks are the runner-proof number: a read that starts
 * walking what it was not asked for shows there. Time holds what blocks cannot: a read gone quadratic over a CTE compares its
 * pairs in memory, and touches no more of them.
 *
 * How the time line holds, from this test's own numbers in 44 attempts on 7-9 Nov 2026. A slow machine does not reach it: the
 * slowest of them (a 37 s seed against the usual 12) read the queue in 968 ms. A bad plan does: 3 of the 44 read it in 5 to 8
 * seconds, one on a 10 s seed, with the reads that never ask for a place as quick as ever and the blocks unchanged. Nothing
 * lands between, so the line sits in the gap, and past it is a plan, not the runner. That rules out the ways to quiet a
 * timing test. Warming a read does nothing: each is already read twice and its second kept, and both were slow. Keeping the
 * better of two does nothing: a transaction plans every call from one set of statistics. Leaving it to the blocks would pass
 * exactly this. So a read past its line fails, and says its plan.
 *
 * Why the other lists are there. Postgres guessed how many leads a list holds from how many lists there are, and the walk it
 * chose over `sequence_places`' CTEs turned on that guess (00568). This test left the table that says so to whenever
 * autovacuum last read it, so the bad plan came and went by the run. Seeded and analyzed, every run reads under the low guess.
 *
 * Local stack only. Rows are written with triggers off (session_replication_role), as they would stand: this measures the
 * reads, not the writes.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { neverCommitted } from "../_never-committed.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes a quarter of a million rows"
      : false;

/** The most a read may take here, in ms; the gate is 300, and each read's time is logged. */
const FAILS_AT_MS = 2000;
/** Every customer's sends too, which Leads never asks and a sequence's own page does. */
const FAILS_AT_MS_OF = { places_everyone: 4000 };
/** What each read touches at this volume, as CI measured it and half again (decision 0103). */
const BLOCK_BUDGET = {
  door: 6_078,
  door_status: 107_910,
  status_whole: 101_832,
  places_whole: 100_329,
  places_everyone: 34_311,
  places_of_a_page: 7_767,
  counts: 107_913,
  page_queue: 116_915,
  page_next: 116_162,
  page_one_search: 30_896,
  page_found: 15_081,
  page_fit: 15_081,
  page_business: 15_081,
  page_rated: 16_380,
  page_words: 15_081,
};
/** Other workspaces' reach-outs, each with a list of its own: enough that Postgres guesses one list holds next to nothing. */
const OTHER_LISTS = 30_000;

/** Every read against its budget and its line. Pure, so what fails here can be shown with no database. */
function holdTheLine(seen) {
  for (const name of Object.keys(BLOCK_BUDGET)) assert.ok(seen[name], `${name} has a budget and was not read`);
  for (const [name, r] of Object.entries(seen)) {
    if (typeof r?.ms !== "number") continue;
    const budget = BLOCK_BUDGET[name];
    if (budget) assert.ok(r.blocks <= budget, `${name} read ${r.blocks} blocks: its budget is ${budget}`);
    const line = FAILS_AT_MS_OF[name] ?? FAILS_AT_MS;
    assert.ok(
      r.ms <= line,
      `${name} took ${r.ms} ms over ${r.blocks} blocks: ${line} is the line this suite holds, the gate is 300. ` +
        "With its blocks in budget that is a plan and not a slow machine, which has never come near the line: read the plans printed above",
    );
  }
}

/** #2206's second attempt as CI logged it (run 42553471519): every read on a good plan. */
const A_RUN_THAT_HELD = {
  door: { ms: 134, blocks: 4_059 },
  counts: { ms: 423, blocks: 69_678 },
  page_fit: { ms: 241, blocks: 10_066 },
  page_next: { ms: 524, blocks: 75_178 },
  page_found: { ms: 247, blocks: 10_066 },
  page_queue: { ms: 552, blocks: 75_685 },
  page_rated: { ms: 283, blocks: 10_933 },
  page_words: { ms: 341, blocks: 10_066 },
  door_status: { ms: 406, blocks: 69_678 },
  places_whole: { ms: 179, blocks: 64_619 },
  status_whole: { ms: 245, blocks: 65_619 },
  page_business: { ms: 287, blocks: 10_066 },
  page_one_search: { ms: 183, blocks: 17_302 },
  places_everyone: { ms: 688, blocks: 22_863 },
  places_of_a_page: { ms: 39, blocks: 5_098 },
};
/** The same commit's first attempt: as quick where no place is read, and 8 s and 24 s where one is, over the same blocks. */
const A_RUN_ON_THE_BAD_PLAN = {
  door: { ms: 107, blocks: 4_058 },
  counts: { ms: 8_141, blocks: 69_783 },
  page_fit: { ms: 187, blocks: 10_065 },
  page_next: { ms: 8_271, blocks: 75_283 },
  page_found: { ms: 193, blocks: 10_065 },
  page_queue: { ms: 8_199, blocks: 75_790 },
  page_rated: { ms: 215, blocks: 11_221 },
  page_words: { ms: 257, blocks: 10_065 },
  door_status: { ms: 8_111, blocks: 69_783 },
  places_whole: { ms: 7_878, blocks: 64_625 },
  status_whole: { ms: 8_100, blocks: 65_725 },
  page_business: { ms: 221, blocks: 10_065 },
  page_one_search: { ms: 141, blocks: 18_146 },
  places_everyone: { ms: 24_118, blocks: 22_867 },
  places_of_a_page: { ms: 27, blocks: 5_124 },
};

test("a run on good plans holds the line", () => {
  holdTheLine(A_RUN_THAT_HELD);
});

test("a read past its block budget fails, however quick it is", () => {
  for (const [name, budget] of Object.entries(BLOCK_BUDGET)) {
    holdTheLine({ ...A_RUN_THAT_HELD, [name]: { ms: 1, blocks: budget } });
    assert.throws(
      () => holdTheLine({ ...A_RUN_THAT_HELD, [name]: { ms: 1, blocks: budget + 1 } }),
      new RegExp(`${name} read ${budget + 1} blocks`),
    );
  }
});

test("a read on the bad plan fails on its time, its blocks being in budget", () => {
  for (const [name, r] of Object.entries(A_RUN_ON_THE_BAD_PLAN)) {
    assert.ok(r.blocks <= BLOCK_BUDGET[name], `${name}: the budget alone would have passed this run`);
  }
  for (const name of [
    "counts",
    "page_next",
    "page_queue",
    "door_status",
    "places_whole",
    "status_whole",
    "places_everyone",
  ]) {
    const { ms } = A_RUN_ON_THE_BAD_PLAN[name];
    assert.throws(
      () => holdTheLine({ ...A_RUN_THAT_HELD, [name]: A_RUN_ON_THE_BAD_PLAN[name] }),
      new RegExp(`${name} took ${ms} ms`),
    );
  }
});

test("a read that was asked for and not read fails", () => {
  const { counts, ...rest } = A_RUN_THAT_HELD;
  assert.ok(counts);
  assert.throws(() => holdTheLine(rest), /counts has a budget and was not read/);
});

const stamp = Date.now().toString(36);
let db;
let member;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const made = await db.auth.admin.createUser({
    email: `volume-${stamp}@fixture-volume.example`,
    password: `pw-${stamp}-Aa1!`,
    email_confirm: true,
  });
  assert.equal(made.error, null, made.error?.message);
  member = made.data.user.id;
});

after(async () => {
  if (skip) return;
  await db.auth.admin.deleteUser(member).catch(() => {});
});

const TABLES = [
  "leads",
  "lead_search_members",
  "sequence_sends",
  "sequence_enrollments",
  "sequence_replies",
  "sequence_batches",
];
const blocks = () => {
  const oids = TABLES.map((t) => `'public.${t}'::regclass`).join(", ");
  return `(select coalesce(sum(coalesce(pg_stat_get_xact_blocks_fetched(x.oid), 0)), 0)::bigint from (
    select c.oid from pg_class c where c.oid in (${oids})
    union all select i.indexrelid from pg_index i where i.indrelid in (${oids})) x)`;
};

/** A read, twice, so its second time is a warm cache's and a planned statement's: its last is what is kept. */
const read = (name, sql) => `
  for turn in 1..2 loop
    mark := ${blocks()};
    t0 := clock_timestamp();
    ${sql};
    took := round((extract(epoch from clock_timestamp() - t0) * 1000)::numeric);
    seen := seen || jsonb_build_object('${name}', jsonb_build_object('ms', took, 'blocks', ${blocks()} - mark));
  end loop;`;

/**
 * What sequence_places is planned as, asked of its own text with the values a call hands it, for a read past its line to say:
 * no number here shows which plan a run got, and without it the same fault was put down to JIT and then to a slow machine.
 */
const planOfPlaces = (name, standing) => `
  plan_lines := '{}';
  for plan_line in execute 'explain ' || places_text using t, null::uuid, null::uuid[], ${standing} loop
    plan_lines := plan_lines || plan_line;
  end loop;
  plans := plans || jsonb_build_object('${name}', to_jsonb(plan_lines));`;

const SEED = (who) => `
  insert into public.tenants (slug, name) values ('volume-' || gen_random_uuid(), 'Volume') returning id into t;
  perform public.provision_tenant(t);
  insert into public.memberships (tenant_id, user_id, role) values (t, '${who}', 'owner');
  insert into public.templates (tenant_id, channel, name, language) values (t, 'whatsapp', 'fixture_volume', 'en_US') returning id into tpl;
  insert into public.lead_searches (tenant_id, via, card, name, asked, plan) values (t, 'people', 'fixture', 'Found', '', '{}') returning id into s_found;
  insert into public.lead_searches (tenant_id, via, card, name, asked, plan) values (t, 'people', 'fixture', 'Second', '', '{}') returning id into s_second;
  insert into public.lead_searches (tenant_id, via, card, name, asked, plan) values (t, 'chosen', 'fixture', 'The list', '', '{}') returning id into s_list;
  insert into public.sequence_steps (tenant_id, kind, name, trigger, policy_class, state, lead_search_id, gap_minutes, template_id, template_language, template_name)
    values (t, 'reach_out', 'Volume', 'lead_first', 'outreach', 'running', s_list, 12, tpl, 'en_US', 'fixture_volume') returning id, sequence_id into step, seq;
  execute 'set local session_replication_role = replica';

  insert into public.sequence_steps (id, sequence_id, place, tenant_id, kind, name, trigger, policy_class, state, lead_search_id, gap_minutes, template_id, template_language, template_name)
    select o.id, o.id, 1, gen_random_uuid(), 'reach_out', 'Another', 'lead_first', 'outreach', 'running', gen_random_uuid(), 12, tpl, 'en_US', 'fixture_volume'
      from (select gen_random_uuid() as id, n from generate_series(1, ${OTHER_LISTS}) n) o;

  insert into public.leads (id, tenant_id, place_id, business_name, category, city, region, postal_code, street, email, email_state, website_host,
                            phone_e164, phone_sources, rating, reviews, stage, closed_reason, contacted_at, found_at, stage_at)
    select gen_random_uuid(), t, 'ChIJfixtureVolume' || i, 'Example Business ' || i, 'Kind ' || (i % 12), 'City ' || (i % 40), 'S' || (i % 8), lpad((i % 99999)::text, 5, '0'),
           i || ' Example St', 'owner' || i || '@fixture-volume.example', case when i % 3 = 0 and i not between 40001 and 42000 then 'unknown' else 'ok' end, 'site' || i || '.example',
           '+1512' || lpad(i::text, 7, '0'), case when i % 2 = 0 then 2 else 1 end,
           case when i % 10 = 0 then null else 3 + (i % 21) / 10.0 end, case when i % 10 = 0 then null else i % 2000 end,
           s.stage, case when s.stage = 'archived' then 'not_a_fit' end, case when s.stage = 'nurture' then now() - (i % 200) * interval '1 day' end,
           now() - i * interval '1 minute', now() - (i % 300) * interval '1 hour'
      from generate_series(1, 50000) i
     cross join lateral (select case when i <= 36000 then 'ready'
                                     when i <= 42000 and i > 40000 then 'ready'
                                     when i % 20 = 0 then 'converted'
                                     when i % 20 = 1 then 'archived'
                                     when i % 5 = 2 then 'nurture'
                                     else 'ready' end as stage) s;
  create temp table volume_leads on commit drop as
    select l.id, row_number() over (order by l.found_at desc)::int as i from public.leads l where l.tenant_id = t;
  create unique index on volume_leads (i);

  insert into public.lead_search_members (search_id, lead_id, tenant_id, class, counted, counted_month, fit, reason, distance_m, judgment)
    select s_found, v.id, t, 'qualified', true, to_char(now(), 'YYYY-MM'),
           case v.i % 3 when 0 then 'strong' when 1 then 'look' else 'long' end, 'Independent, well rated, takes online bookings',
           case when v.i % 4 = 0 then null else v.i % 40000 end, '{"answer":{"fit":"yes","reason":"Independent"},"reasons":[],"shares":[]}'
      from volume_leads v;
  insert into public.lead_search_members (search_id, lead_id, tenant_id, class, counted, counted_month, fit, reason, judgment)
    select s_second, v.id, t, 'qualified', true, to_char(now(), 'YYYY-MM'), 'look', 'Second look', '{"reasons":[],"shares":[]}'
      from volume_leads v where v.i between 42001 and 50000;
  insert into public.lead_search_members (search_id, lead_id, tenant_id, class, counted, counted_month, fit, reason, judgment)
    select s_list, v.id, t, 'qualified', true, to_char(now(), 'YYYY-MM'), 'strong', 'On the list', '{"reasons":[],"shares":[]}'
      from volume_leads v where v.i between 40001 and 42000;

  insert into public.sequence_batches (tenant_id, name, template_id, template_name, template_language, state, scheduled_for, sequence_id)
    select t, 'Batch ' || b.name, tpl, 'fixture_volume', 'en_US', b.state, now(), seq
      from (values ('sent1', 'sent'), ('sent2', 'sent'), ('sent3', 'sent'), ('sent4', 'sent'), ('wait', 'pending_approval'), ('next', 'scheduled'), ('people', 'sent')) b(name, state);

  -- 150,000 lead sends over 40,000 leads, the newest of each saying where it stands.
  insert into public.sequence_sends (tenant_id, sequence_id, step_id, batch_id, lead_id, state, reason, send_at, sent_at, drafted_at, draft, created_at)
    select t, seq, case when n = 1 then step end,
           case when n < a.last or a.state = 'sent' then (select b.id from public.sequence_batches b where b.tenant_id = t and b.name = 'Batch sent' || n)
                when a.state = 'planned' and v.i <= 8000 then (select b.id from public.sequence_batches b where b.tenant_id = t and b.name = 'Batch wait')
                else (select b.id from public.sequence_batches b where b.tenant_id = t and b.name = 'Batch next') end,
           v.id,
           case when n < a.last then 'sent' else a.state end,
           case when n = a.last and a.state = 'held' then 'chain' end,
           case when n = a.last and a.state = 'planned' then now() + (v.i % 90) * interval '1 hour' end,
           case when n < a.last or a.state = 'sent' then now() - interval '40 days' + n * interval '1 day' end,
           case when n = a.last and a.state = 'drafted' then now() - (v.i % 90) * interval '1 hour' end,
           case when n = a.last and a.state = 'drafted' then jsonb_build_object('to', 'owner@fixture-volume.example', 'subject', 'Hello', 'text', 'Hello there') end,
           now() - interval '40 days' + n * interval '1 day'
      from volume_leads v
     cross join lateral (select case when v.i % 4 = 0 then 3 else 4 end as last,
                                case when v.i <= 2000 then 'sent' when v.i <= 4000 then 'drafted' when v.i <= 8000 then 'planned'
                                     when v.i <= 9000 then 'held' when v.i <= 20000 then 'planned' else 'sent' end as state) a
     cross join lateral generate_series(1, a.last) n
     where v.i <= 40000;

  -- 100,000 customer sends beside them, which a read of leads has no business walking.
  insert into public.sequence_sends (tenant_id, sequence_id, batch_id, contact_id, state, created_at)
    select t, seq, (select b.id from public.sequence_batches b where b.tenant_id = t and b.name = 'Batch people'), gen_random_uuid(), 'sent', now() - interval '20 days'
      from generate_series(1, 100000) i;

  insert into public.sequence_enrollments (tenant_id, sequence_id, lead_id, state, place, next_at, why, ended_at)
    select t, seq, v.id, case when v.i <= 36000 then 'in' when v.i <= 38000 then 'done' else 'left' end, 2,
           case when v.i <= 36000 then now() + (v.i % 200) * interval '1 hour' end,
           case when v.i > 38000 then 'removed' end,
           case when v.i > 36000 then now() - interval '1 day' end
      from volume_leads v where v.i <= 40000;

  insert into public.sequence_replies (message_id, tenant_id, conversation_id, lead_id, send_id, claim, intent, summary, read_at)
    select gen_random_uuid(), t, gen_random_uuid(), s.lead_id, s.id, 'person', 'question', 'Asks a question', now() - (v.i % 100) * interval '1 hour'
      from volume_leads v
      join lateral (select x.id, x.lead_id from public.sequence_sends x where x.sequence_id = seq and x.lead_id = v.id order by x.created_at desc limit 1) s on true
     where v.i <= 2000;

  execute 'set local session_replication_role = origin';
  -- Production runs with JIT off (its pg_settings, read 8 Nov 2026 on Postgres 17.6); the local image leaves it on. What is
  -- measured is what production runs.
  execute 'set local jit = off';
  analyze public.leads, public.lead_search_members, public.sequence_sends, public.sequence_enrollments, public.sequence_replies, public.sequence_batches, public.sequence_steps;`;

test("every read of a full workspace holds the line", { skip, timeout: 600_000 }, () => {
  const seen = neverCommitted(`
    declare
      t uuid; tpl uuid; s_found uuid; s_second uuid; s_list uuid; step uuid; seq uuid; seen jsonb := '{}';
      t0 timestamptz; took numeric; mark bigint; turn int; sowed timestamptz := clock_timestamp();
      rows_of int; counts jsonb; last_key text; last_id uuid; ids uuid[];
      places_text text; plan_line text; plan_lines text[]; plans jsonb := '{}';
    begin
      ${SEED(member)}
      seen := seen || jsonb_build_object('seed_ms', round((extract(epoch from clock_timestamp() - sowed) * 1000)::numeric));
      -- As a signed-in member, under row security, as the page reads it.
      perform set_config('request.jwt.claims', '{"sub":"${member}","role":"authenticated"}', true);
      execute 'set local role authenticated';
      ${read("page_queue", "perform count(*) from public.leads_page(t, null, 'qualified', 'stage', null, 500, 'all', 'asc')")}
      ${read("page_found", "perform count(*) from public.leads_page(t, null, 'qualified', 'found', null, 500, 'all', 'asc')")}
      ${read("page_fit", "perform count(*) from public.leads_page(t, null, 'qualified', 'fit', null, 500, 'all', 'asc')")}
      ${read("page_business", "perform count(*) from public.leads_page(t, null, 'qualified', 'business', null, 500, 'all', 'asc')")}
      ${read("page_rated", "perform count(*) from public.leads_page(t, null, 'qualified', 'rating', null, 500, 'all', 'desc')")}
      ${read("page_words", "perform count(*) from public.leads_page(t, null, 'qualified', 'found', null, 500, 'all', 'asc', null, null, '{\"q\":\"kind 3 city 7\"}')")}
      ${read("page_one_search", "perform count(*) from public.leads_page(t, s_second, 'qualified', 'stage', null, 500, 'all', 'asc')")}
      ${read("counts", "perform public.lead_view_counts(t, null, 'qualified', 'all', null)")}
      select count(*) into rows_of from public.leads_page(t, null, 'qualified', 'stage', null, 500, 'all', 'asc') p;
      seen := seen || jsonb_build_object('first_page_rows', rows_of);
      select p.page_key, p.member_id into last_key, last_id from public.leads_page(t, null, 'qualified', 'stage', null, 500, 'all', 'asc') p order by p.page_key desc, p.member_id desc limit 1;
      ${read("page_next", "perform count(*) from public.leads_page(t, null, 'qualified', 'stage', last_key, 500, 'all', 'asc', last_id)")}
      select array_agg(p.lead_id) into ids from public.leads_page(t, null, 'qualified', 'stage', null, 500, 'all', 'asc') p;
      ${read("places_of_a_page", "perform public.sequence_places_of(t, ids)")}
      ${read("door", "perform count(*) from public.lead_view_rows(t, null, 'qualified', 'all', null, false, false)")}
      ${read("door_status", "perform count(*) from public.lead_view_rows(t, null, 'qualified', 'all', null, true, false)")}
      ${read("status_whole", "perform count(*) from public.lead_status_groups(t, null)")}
      ${read("places_whole", "perform count(*) from public.sequence_places(t, null, null, true)")}
      ${read("places_everyone", "perform count(*) from public.sequence_places(t)")}
      counts := public.lead_view_counts(t, null, 'qualified', 'all', null);
      seen := seen || jsonb_build_object('counted', counts - 'excluded_by');
      -- The function's own work_mem, since a plan turns on it.
      perform set_config('work_mem', '64MB', true);
      select substring(p.prosrc from '\\$q\\$(.*)\\$q\\$') into places_text from pg_proc p
       where p.oid = 'public.sequence_places(uuid, uuid, uuid[], boolean)'::regprocedure;
      ${planOfPlaces("what stands", true)}
      ${planOfPlaces("the whole workspace", false)}
      raise exception 'seen %', encode(convert_to((seen || jsonb_build_object('plans', plans))::text, 'UTF8'), 'hex');
    end;`);
  const { plans, ...numbers } = seen;
  console.log(JSON.stringify(numbers));
  assert.equal(numbers.first_page_rows, 500);
  assert.equal(numbers.counted.view, 50_000, "one row a lead, whatever holds it twice");
  assert.deepEqual(numbers.counted.status_groups, { needs: 9_000, in: 29_000, none: 12_000 });
  try {
    holdTheLine(numbers);
  } catch (failure) {
    for (const [name, lines] of Object.entries(plans)) console.log(`sequence_places, ${name}:\n${lines.join("\n")}`);
    throw failure;
  }
});
