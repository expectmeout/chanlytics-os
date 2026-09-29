/**
 * A person's rows are found by the person (00253), on a real database.
 *
 * people_list reads each person's channels, thread, escalations and deal by the person alone (00170 :340-366,
 * :421-430), and until 00253 none of those four tables had an index that starts with the person: each read went
 * through the whole platform's table once per person, so the list cost its people times every workspace's rows. What
 * this proves is that the reads grow with the workspace and not the platform. A workspace of twenty people is read
 * beside another workspace of a thousand, and read again once that one has three thousand: the blocks read from each
 * table stay where they were. Blocks, not rows, because a walk down a whole index that filters on its second column
 * returns only the rows it matched, and reads every block to find them. Sequential scans are off, so on tables this
 * small the planner shows what it could use.
 *
 * Everything happens in a transaction on this machine's database that never commits: both workspaces, their people
 * and their rows, the statistics and the setting go with it. Read through the CLI, as sweep-registry.db.test.mjs
 * turns a clock; SUPABASE_CLI names the binary when `supabase` is not on PATH.
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

/** The four tables people_list reads by the person. */
const KEYED = ["contact_identities", "conversations", "escalations", "deals"];
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

/** `n` people in workspace `ws`, each with a WhatsApp identity, a thread, two escalations (one open) and a proposal. */
const people = (ws, n) => `
  with c as (insert into public.contacts (tenant_id) select ${ws} from generate_series(1, ${n}) returning id),
       i as (insert into public.contact_identities (tenant_id, contact_id, channel, external_id)
               select ${ws}, c.id, 'whatsapp', c.id::text from c returning 1),
       v as (insert into public.conversations (tenant_id, contact_id) select ${ws}, c.id from c returning id),
       e as (insert into public.escalations (tenant_id, conversation_id, reason, state, created_at)
               select ${ws}, v.id, 'manual', s.state, now() - s.ago
                 from v, (values ('resolved', interval '2 days'), ('open', interval '1 day')) s(state, ago) returning 1),
       d as (insert into public.deals (tenant_id, contact_id, stage) select ${ws}, c.id, 'proposed' from c returning 1)
  select count(*) into grown from c;`;

/** The blocks this transaction has read from each keyed table so far, from its heap and every one of its indexes. */
const BLOCKS = `(select jsonb_object_agg(k.t, (
    coalesce(pg_stat_get_xact_blocks_fetched(('public.' || k.t)::regclass), 0)
    + coalesce((select sum(pg_stat_get_xact_blocks_fetched(x.indexrelid))
                  from pg_index x where x.indrelid = ('public.' || k.t)::regclass), 0))::bigint)
  from unnest(array[${KEYED.map((t) => `'${t}'`).join(", ")}]) k(t))`;

/** What `read` cost each keyed table, in blocks, with fresh statistics and sequential scans off. */
const measured = (name, read) => `
  analyze public.contact_identities, public.conversations, public.escalations, public.deals;
  perform set_config('enable_seqscan', 'off', true);
  before := ${BLOCKS};
  ${read}
  cost := cost || jsonb_build_object('${name}',
    (select jsonb_object_agg(a.key, a.value::bigint - (before->>a.key)::bigint) from jsonb_each(${BLOCKS}) a));
  perform set_config('enable_seqscan', 'on', true);`;

let seen;
/** Seeded and read once for both tests: two sizes next door, the list and one person's page at each. */
function reads() {
  seen ??= rolledBack(`
    declare
      t uuid; o uuid; one uuid; grown int; before jsonb; cost jsonb := '{}'; answer jsonb;
    begin
      insert into public.tenants (slug, name) values ('person-keys-' || gen_random_uuid(), 'Person keys') returning id into t;
      insert into public.tenants (slug, name) values ('person-keys-next-door-' || gen_random_uuid(), 'Next door') returning id into o;
      ${people("t", HERE)}
      -- Six of them have written by text as well.
      insert into public.contact_identities (tenant_id, contact_id, channel, external_id)
        select t, c.id, 'sms', c.id::text from public.contacts c where c.tenant_id = t order by c.id limit 6;
      select c.id into one from public.contacts c where c.tenant_id = t order by c.id limit 1;
      ${people("o", 1000)}
      ${measured("list_beside_1000", "perform count(*) from public.people_list(t);")}
      ${measured("one_beside_1000", "perform count(*) from public.people_list(t, one);")}
      ${people("o", 2000)}
      ${measured(
        "list_beside_3000",
        `select jsonb_build_object(
                 'people', count(*),
                 'by_text', count(*) filter (where l.channels = array['sms', 'whatsapp']),
                 'threads', sum(l.conversation_count),
                 'escalations', sum(l.escalation_count),
                 'open', count(*) filter (where l.open_escalation_reason = 'manual'),
                 'latest', count(l.latest_conversation_id),
                 'deals', count(*) filter (where l.deal_stage = 'proposed'))
           into answer
           from public.people_list(t) l;`,
      )}
      ${measured("one_beside_3000", "perform count(*) from public.people_list(t, one);")}
      seen := jsonb_build_object('answer', answer, 'cost', cost);
    end;
  `);
  return seen;
}

/** Keyed reads cost the same beside three thousand as beside one thousand; a scan costs about three times as much. */
function staysPut(small, large, table, what) {
  assert.ok(small[table] > 0, `${what}: ${table} is read at all`);
  assert.ok(
    large[table] <= small[table] * 1.5 + 5,
    `${what}: ${table} read ${small[table]} blocks beside 1,000 people and ${large[table]} beside 3,000 ` +
      "(a read that goes through the platform's rows grows with them)",
  );
}

test(
  "the People list reads the same blocks of each keyed table however many people the platform holds",
  { skip },
  () => {
    const { answer, cost } = reads();
    assert.deepEqual(answer, {
      people: HERE,
      by_text: 6,
      threads: HERE,
      escalations: HERE * 2,
      open: HERE,
      latest: HERE,
      deals: HERE,
    });
    for (const table of KEYED) staysPut(cost.list_beside_1000, cost.list_beside_3000, table, "the list");
  },
);

test(
  "one person's page reads the same blocks of each keyed table however many people the platform holds",
  { skip },
  () => {
    const { cost } = reads();
    for (const table of KEYED) staysPut(cost.one_beside_1000, cost.one_beside_3000, table, "one person");
  },
);
