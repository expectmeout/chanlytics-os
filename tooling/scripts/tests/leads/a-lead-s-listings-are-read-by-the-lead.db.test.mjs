/**
 * A lead's listings are found by the lead (00256), on a real database.
 *
 * lead_places keeps the duplicate listings folded into a lead, and until 00256 nothing indexed it by the lead: the
 * Leads page counts each row's listings (leads_page, 00212 :76), the peek counts one lead's (packages/db leads.ts), and
 * lead_blank deletes them when retention or erasure blanks a lead (00161), each through every workspace's listings.
 * What this proves is that those reads grow with the lead and not the platform. A workspace of twenty leads is read
 * beside another whose listings number a thousand, and read again once they number three thousand: the blocks read from
 * lead_places stay where they were. Blocks, not rows, because a walk down a whole index that filters on another column
 * returns only the rows it matched, and reads every block to find them. Sequential scans are off, so on a table this
 * small the planner shows what it could use.
 *
 * Everything happens in a transaction on this machine's database that never commits: both workspaces, their searches,
 * leads and listings, the statistics and the setting go with it. Read through the CLI, as sweep-registry.db.test.mjs
 * turns a clock; SUPABASE_CLI names the binary when `supabase` is not on PATH. The place ids are fixtures, as
 * leads.db.test.mjs's are.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite reads the local stack through the CLI"
    : false;

const HERE = 20;

/** A transaction that never commits: `body` runs in a DO block that ends by raising what it `seen`, as hex. */
function rolledBack(body) {
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

/** `n` more leads in workspace `ws`, each holding two duplicate listings; `tag` keeps their place ids apart. */
const listed = (ws, n, tag) => `
  with l as (insert into public.leads (tenant_id, place_id, business_name)
               select ${ws}, 'ChIJfixture-${tag}-' || i, 'Next door ' || i from generate_series(1, ${n}) i returning id, place_id)
  insert into public.lead_places (lead_id, tenant_id, place_id, title)
    select l.id, ${ws}, l.place_id || '-dup-' || d, 'Next door' from l, generate_series(1, 2) d;`;

/** The blocks this transaction has read from lead_places so far, from its heap and every one of its indexes. */
const BLOCKS = `(coalesce(pg_stat_get_xact_blocks_fetched('public.lead_places'::regclass), 0)
  + coalesce((select sum(pg_stat_get_xact_blocks_fetched(x.indexrelid))
                from pg_index x where x.indrelid = 'public.lead_places'::regclass), 0))::bigint`;

/** What `read` cost lead_places, in blocks, with fresh statistics and sequential scans off. */
const measured = (name, read) => `
  analyze public.lead_places, public.leads, public.lead_search_members;
  perform set_config('enable_seqscan', 'off', true);
  before := ${BLOCKS};
  ${read}
  cost := cost || jsonb_build_object('${name}', ${BLOCKS} - before);
  perform set_config('enable_seqscan', 'on', true);`;

let seen;
/** Seeded and read once for every test: the page, the peek's count and a blanking, beside two sizes next door. */
function reads() {
  seen ??= rolledBack(`
    declare
      t uuid; o uuid; s uuid; one uuid; spare_1 uuid; spare_2 uuid; before bigint; cost jsonb := '{}'; answer jsonb;
    begin
      insert into public.tenants (slug, name) values ('lead-listings-' || gen_random_uuid(), 'Lead listings') returning id into t;
      insert into public.tenants (slug, name) values ('lead-listings-next-door-' || gen_random_uuid(), 'Next door') returning id into o;
      insert into public.lead_searches (tenant_id, via, card, name, asked, plan)
        values (t, 'people', 'fixture', 'Personal trainers', 'Personal trainers nearby', '{}'::jsonb) returning id into s;
      -- Twenty leads, every one qualified and counted in the search, so the page shows them all.
      insert into public.leads (tenant_id, place_id, business_name, found_at)
        select t, 'ChIJfixture-here-' || i, 'Studio ' || i, now() - make_interval(mins => i) from generate_series(1, ${HERE}) i;
      insert into public.lead_search_members (search_id, lead_id, tenant_id, class, counted, counted_month, fit)
        select s, l.id, t, 'qualified', true, to_char(now(), 'YYYY-MM'), 'strong' from public.leads l where l.tenant_id = t;
      -- The six newest hold two duplicate listings each, the next four one: sixteen listings on ten leads.
      insert into public.lead_places (lead_id, tenant_id, place_id, title)
        select l.id, t, l.place_id || '-dup-' || d, l.business_name
          from (select l.*, row_number() over (order by l.found_at desc) as n from public.leads l where l.tenant_id = t) l,
               generate_series(1, 2) d
         where l.n <= 6 or (l.n <= 10 and d = 1);
      select l.id into one from public.leads l where l.tenant_id = t order by l.found_at desc limit 1;
      -- Two leads outside the search, with two listings each, for retention to blank: the page never shows them.
      insert into public.leads (tenant_id, place_id, business_name) values (t, 'ChIJfixture-spare-1', 'Spare 1') returning id into spare_1;
      insert into public.leads (tenant_id, place_id, business_name) values (t, 'ChIJfixture-spare-2', 'Spare 2') returning id into spare_2;
      insert into public.lead_places (lead_id, tenant_id, place_id, title)
        select l.id, t, l.place_id || '-dup-' || d, l.business_name from public.leads l, generate_series(1, 2) d where l.id in (spare_1, spare_2);
      ${listed("o", 500, "near")}
      ${measured("page_beside_1000", "perform count(*) from public.leads_page(t);")}
      ${measured("peek_beside_1000", "perform count(*) from public.lead_places p where p.lead_id = one;")}
      ${measured("blank_beside_1000", "perform public.lead_blank(spare_1);")}
      ${listed("o", 1000, "far")}
      ${measured(
        "page_beside_3000",
        `select jsonb_build_object('rows', count(*), 'places', sum(l.places), 'with', count(*) filter (where l.places > 0))
           into answer
           from public.leads_page(t) l;`,
      )}
      ${measured("peek_beside_3000", "perform count(*) from public.lead_places p where p.lead_id = one;")}
      ${measured("blank_beside_3000", "perform public.lead_blank(spare_2);")}
      seen := jsonb_build_object(
        'answer', answer,
        'cost', cost,
        'next_door', (select count(*) from public.lead_places p where p.tenant_id = o),
        'left_after_blanking', (select count(*) from public.lead_places p where p.lead_id in (spare_1, spare_2)));
    end;
  `);
  return seen;
}

/** A read by the lead costs the same beside three thousand listings as beside one thousand; a scan about three times. */
function staysPut(cost, what) {
  const small = cost[`${what}_beside_1000`];
  const large = cost[`${what}_beside_3000`];
  assert.ok(small > 0, `${what}: lead_places is read at all`);
  assert.ok(
    large <= small * 1.5 + 5,
    `${what}: lead_places read ${small} blocks beside 1,000 listings and ${large} beside 3,000 ` +
      "(a read that goes through the platform's listings grows with them)",
  );
}

test("the Leads page counts each row's listings in the same blocks however many the platform holds", { skip }, () => {
  const { answer, cost, next_door } = reads();
  assert.equal(next_door, 3000, "the workspace next door holds three thousand listings by the second read");
  assert.deepEqual(answer, { rows: HERE, places: 16, with: 10 }, "every lead on the page, with its own listings");
  staysPut(cost, "page");
});

test("the peek counts one lead's listings in the same blocks however many the platform holds", { skip }, () => {
  staysPut(reads().cost, "peek");
});

test("blanking a lead deletes its listings in the same blocks however many the platform holds", { skip }, () => {
  const { cost, left_after_blanking } = reads();
  assert.equal(left_after_blanking, 0, "both blanked leads' listings are gone");
  staysPut(cost, "blank");
});
