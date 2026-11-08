/**
 * A reply goes first, and each workspace takes its turn (decision 0018, steps 2 and 3, 00281), on a real database.
 *
 * Each job's lane is generated from its kind and payload: 0 a reply, 1 someone waiting who is not a customer, 2 bulk.
 * claim_due_jobs takes the lowest lane first; within bulk, a workspace with no bulk work running before one with some;
 * then the earliest due. Every kind job_kinds holds (00526) has its lane, each one's value pinned here.
 *
 * The ledger is one queue, and other suites claim from it at the same time, so each case runs in a transaction on this
 * machine's database that never commits and has the ledger to itself: it takes the table in a mode every writer waits
 * on, for the moment the case takes, and moves everyone else's due work out of reach. Nothing of another suite's is
 * claimed, and nothing of this one's is left behind. Between files, the ledger's lock (_file-lock.mjs) runs this
 * and the other claiming suites one after the other. Read through the CLI, as the other database suites under
 * database/ are; SUPABASE_CLI names the binary when `supabase` is not on PATH.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_SETS } from "@chanlytics/contracts";
import { takeLock } from "../_file-lock.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite claims due jobs"
    : false;

// Its transaction holds the table against every other claim for the moment a case takes, and still the suites that
// claim from the one queue take the ledger's lock for the whole file (_file-lock.mjs), so no claim of another's meets
// this one's.
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

/**
 * The ledger to this transaction alone: every writer, and every claim, waits on the table until it ends, and nothing
 * another suite has due is due in it. Then two workspaces of its own, a and b.
 */
const ALONE = `
  lock table public.jobs in share row exclusive mode;
  update public.jobs set due_at = now() + interval '100 years' where state = 'scheduled' and due_at <= now();
  update public.jobs set lease_until = now() + interval '100 years' where state = 'fired' and lease_until < now();
  insert into public.tenants (slug, name) values ('lanes-a-' || gen_random_uuid(), 'Lanes A') returning id into a;
  insert into public.tenants (slug, name) values ('lanes-b-' || gen_random_uuid(), 'Lanes B') returning id into b;`;

/**
 * One job, named by `label` in its payload. `due` is how many seconds ago it fell due (negative: still to come). A
 * claimed one says `fired` seconds ago and a lease that ends `lease` seconds from now (negative: it ran out).
 */
function job(label, { ws = "a", kind, due = 0, payload = {}, fired, lease }) {
  const body = `'${JSON.stringify({ ...payload, label }).replaceAll("'", "''")}'::jsonb`;
  const dueAt = `now() - make_interval(secs => ${due})`;
  if (fired === undefined)
    return `insert into public.jobs (tenant_id, kind, due_at, payload) values (${ws}, '${kind}', ${dueAt}, ${body});`;
  return `insert into public.jobs (tenant_id, kind, due_at, payload, state, fired_at, lease_until, attempts)
    values (${ws}, '${kind}', ${dueAt}, ${body}, 'fired', now() - make_interval(secs => ${fired}),
            now() + make_interval(secs => ${lease}), 1);`;
}

/** Claims one at a time, as the runner does, until nothing is due: the label of each, in the order taken. */
const CLAIM_ALL = `
  for n in 1..50 loop
    select j.payload ->> 'label' into l from public.claim_due_jobs(1, 90) j;
    exit when l is null;
    claimed := claimed || to_jsonb(l);
  end loop;
  seen := jsonb_build_object('claimed', claimed);`;

/** The order the claims take `jobs` in, in a transaction of their own. */
function claimOrder(...jobs) {
  return rolledBack(`
    a uuid; b uuid; n integer; l text; claimed jsonb := '[]';
    begin
      ${ALONE}
      ${jobs.join("\n      ")}
      ${CLAIM_ALL}`).claimed;
}

test("every kind the ledger allows has a lane: replies first, then someone waiting, then bulk", { skip }, () => {
  const { lanes, kinds } = rolledBack(`
    a uuid; b uuid; k text; l smallint; lanes jsonb := '{}'; kinds jsonb := '[]';
    begin
      ${ALONE}
      for k in select jk.kind from public.job_kinds jk order by jk.kind
      loop
        insert into public.jobs (tenant_id, kind, due_at) values (a, k, now() + interval '1 day') returning lane into l;
        lanes := lanes || jsonb_build_object(k, l);
        kinds := kinds || to_jsonb(k);
      end loop;
      insert into public.jobs (tenant_id, kind, due_at, payload)
        values (a, 'outbound_send', now() + interval '1 day', '{"purpose": "outreach"}') returning lane into l;
      lanes := lanes || jsonb_build_object('outreach', l);
      insert into public.jobs (tenant_id, kind, due_at, payload)
        values (a, 'event_deliver', now() + interval '1 day', '{"lane": "0"}') returning lane into l;
      lanes := lanes || jsonb_build_object('delivery_lane_0', l);
      insert into public.jobs (tenant_id, kind, due_at, payload)
        values (a, 'event_deliver', now() + interval '1 day', '{"lane": "nine"}') returning lane into l;
      lanes := lanes || jsonb_build_object('delivery_lane_bad', l);
      seen := jsonb_build_object('lanes', lanes, 'kinds', kinds);`);
  assert.deepEqual(
    [...kinds].sort(),
    [...SCHEMA_SETS["jobs.kind"]].sort(),
    "the kinds read are job_kinds' own (00526)",
  );
  assert.deepEqual(
    kinds.filter((k) => lanes[k] === null),
    [],
    "a kind arrives with its lane, as with its handler, its caller and its job_kinds row",
  );
  const expected = {
    outbound_send: 0, // a member's reply, or the receptionist's
    email_ingest: 0,
    push_send: 0,
    inbound_answer: 0, // a text's answer after its acknowledgement: a customer is waiting (00347)
    canary: 0, // the ledger's own proof that it runs (00526): judged by its claim's lateness, a reply's
    line_provision: 1,
    reply_read: 1,
    booking_read: 1,
    website_read: 1,
    preview_build: 1,
    erasure_finish: 1,
    broadcast_send: 2,
    lead_round_start: 2,
    lead_collect: 2,
    lead_check: 2,
    push_receipts: 2,
    history_import: 2,
    outreach: 2, // an outbound_send whose purpose is outreach: a cold email is bulk
    event_deliver: 2, // a delivery with no lane in its payload: bulk, the safe default (00334)
    delivery_lane_0: 0, // a delivery in its subscription's lane, read from the payload
    delivery_lane_bad: 2, // a lane the payload spells wrong is bulk, never an error
  };
  assert.deepEqual(
    Object.fromEntries(Object.keys(expected).map((k) => [k, lanes[k]])),
    expected,
    "someone waits on a reply; an owner on a line, and a lead who wrote back on its reading; nobody on bulk",
  );
});

test(
  "the claim takes the oldest reply, then someone waiting, then bulk, and a lease that ran out comes back in its lane",
  { skip },
  () => {
    const claimed = claimOrder(
      job("bulk, due longest", { kind: "broadcast_send", due: 600 }),
      job("bulk whose lease ran out", { kind: "lead_collect", due: 900, fired: 400, lease: -310 }),
      job("outreach", { kind: "outbound_send", due: 500, payload: { purpose: "outreach" } }),
      job("lead", { kind: "lead_check", due: 400 }),
      job("line", { kind: "line_provision", due: 300 }),
      job("reply read", { kind: "reply_read", due: 250 }),
      job("reply whose lease ran out", { kind: "push_send", due: 350, fired: 200, lease: -110 }),
      job("email in", { kind: "email_ingest", due: 30 }),
      job("reply", { kind: "outbound_send", due: 0 }),
      job("reply not due yet", { kind: "outbound_send", due: -60 }),
    );
    assert.deepEqual(claimed, [
      "reply whose lease ran out",
      "email in",
      "reply",
      "line",
      "reply read",
      "bulk whose lease ran out",
      "bulk, due longest",
      "outreach",
      "lead",
    ]);
  },
);

test(
  "a workspace's second bulk job goes after every other workspace's first, and still runs when nothing else is due",
  { skip },
  () => {
    const claimed = claimOrder(
      job("a's first batch", { kind: "broadcast_send", due: 180 }),
      job("a's second batch", { kind: "broadcast_send", due: 120 }),
      job("a's lead job", { kind: "lead_collect", due: 60 }),
      job("b's batch", { ws: "b", kind: "broadcast_send", due: 30 }),
      job("a's reply", { kind: "outbound_send", due: 0 }),
    );
    assert.deepEqual(
      claimed,
      ["a's reply", "a's first batch", "b's batch", "a's second batch", "a's lead job"],
      "a reply runs first and holds no bulk place; a's first batch running puts b's before a's second; then a's own, in turn",
    );
  },
);

test(
  "a paused kind (00526) is left where it is: the claim takes the next of another kind, and the pause's end takes it again",
  { skip },
  () => {
    const claimed = claimOrder(
      `update public.job_kinds set paused_at = now(), paused_why = 'a provider answering garbage' where kind = 'broadcast_send';`,
      job("a batch, paused", { kind: "broadcast_send", due: 100 }),
      job("a lead's page", { kind: "lead_collect", due: 50 }),
    );
    assert.deepEqual(claimed, ["a lead's page"], "the paused kind's row waits; nothing of it is claimed");
  },
);

test(
  "turns in every lane (00335): two workspaces' replies alternate when one has a burst, and a reply still goes before bulk",
  { skip },
  () => {
    const claimed = claimOrder(
      job("a's running reply", { kind: "outbound_send", due: 60, fired: 5, lease: 85 }),
      job("a's reply 1", { kind: "outbound_send", due: 100 }),
      job("a's reply 2", { kind: "outbound_send", due: 90 }),
      job("b's reply", { ws: "b", kind: "outbound_send", due: 10 }),
      job("b's batch", { ws: "b", kind: "broadcast_send", due: 500 }),
      job("a's line", { kind: "line_provision", due: 30 }),
    );
    assert.deepEqual(
      claimed,
      ["b's reply", "a's reply 1", "a's reply 2", "a's line", "b's batch"],
      "a's running reply puts b's reply first; then a's own, oldest first; a reply running holds no lane-1 or bulk place",
    );
  },
);

test(
  "work kept for a later try holds its workspace's place until its claim's lease would have ended, and no longer",
  { skip },
  () => {
    const behind = claimOrder(
      job("a's kept batch", { kind: "broadcast_send", due: 300, fired: 30, lease: 600 }),
      job("a's next batch", { kind: "broadcast_send", due: 120 }),
      job("b's batch", { ws: "b", kind: "broadcast_send", due: 60 }),
    );
    assert.deepEqual(behind, ["b's batch", "a's next batch"], "claimed thirty seconds ago, it is running");

    const past = claimOrder(
      job("a's kept batch", { kind: "broadcast_send", due: 300, fired: 100, lease: 600 }),
      job("a's next batch", { kind: "broadcast_send", due: 120 }),
      job("b's batch", { ws: "b", kind: "broadcast_send", due: 60 }),
    );
    assert.deepEqual(
      past,
      ["a's next batch", "b's batch"],
      "claimed a hundred seconds ago, past the ninety of its lease",
    );

    const other = claimOrder(
      job("a's running reply", { kind: "outbound_send", due: 60, fired: 10, lease: 80 }),
      job("a's running line", { kind: "line_provision", due: 60, fired: 10, lease: 80 }),
      job("a's next batch", { kind: "broadcast_send", due: 120 }),
      job("b's batch", { ws: "b", kind: "broadcast_send", due: 60 }),
    );
    assert.deepEqual(other, ["a's next batch", "b's batch"], "only bulk work running holds a workspace's bulk place");
  },
);

/** Workspaces a and b, before the ledger is taken: their backlog is written while no other suite waits on the writing. */
const TWO_WORKSPACES = `
  insert into public.tenants (slug, name) values ('backlog-a-' || gen_random_uuid(), 'Backlog A') returning id into a;
  insert into public.tenants (slug, name) values ('backlog-b-' || gen_random_uuid(), 'Backlog B') returning id into b;`;

/** `n` bulk jobs of a workspace, all due long ago, the oldest named `backlog`: what a claim has to choose among. */
const backlogOf = (ws, n) => `
  insert into public.jobs (tenant_id, kind, due_at, payload)
    select ${ws}, 'broadcast_send', now() - make_interval(secs => 100 + i),
           jsonb_build_object('label', 'backlog', 'broadcast_id', gen_random_uuid())
      from generate_series(1, ${n}) i;
  analyze public.jobs;`;

/** ALONE's two moves, leaving out this case's own workspaces, whose backlog is the point. */
const OTHERS_OUT_OF_REACH = `
  lock table public.jobs in share row exclusive mode;
  update public.jobs set due_at = now() + interval '100 years'
   where state = 'scheduled' and due_at <= now() and tenant_id not in (a, b);
  update public.jobs set lease_until = now() + interval '100 years'
   where state = 'fired' and lease_until < now() and tenant_id not in (a, b);`;

const LEDGER_RELATIONS = `(select 'public.jobs'::regclass::oid as oid
  union all select i.indexrelid from pg_index i where i.indrelid = 'public.jobs'::regclass)`;
const LEDGER_BLOCKS = `(select sum(coalesce(pg_stat_get_xact_blocks_fetched(x.oid), 0))::bigint from ${LEDGER_RELATIONS} x)`;
const LEDGER_BLOCKS_BY = `(select jsonb_object_agg(x.oid::regclass::text, coalesce(pg_stat_get_xact_blocks_fetched(x.oid), 0))
  from ${LEDGER_RELATIONS} x)`;

/** What three claims cost beside a backlog of `n`, one at a time as the runner takes them: blocks, by relation, and milliseconds. */
function claimsBeside(n) {
  return rolledBack(`
    a uuid; b uuid; k integer; before bigint; before_by jsonb; started timestamptz;
    begin
      ${TWO_WORKSPACES}
      ${backlogOf("a", n)}
      ${OTHERS_OUT_OF_REACH}
      perform set_config('enable_seqscan', 'off', true);
      before := ${LEDGER_BLOCKS};
      before_by := ${LEDGER_BLOCKS_BY};
      started := clock_timestamp();
      for k in 1..3 loop
        perform public.claim_due_jobs(1, 90);
      end loop;
      seen := jsonb_build_object(
        'ms', round(extract(epoch from clock_timestamp() - started) * 1000),
        'blocks', ${LEDGER_BLOCKS} - before,
        'by', (select coalesce(jsonb_object_agg(r.key, r.value::bigint - (before_by ->> r.key)::bigint), '{}')
                 from jsonb_each_text(${LEDGER_BLOCKS_BY}) r
                where r.value::bigint > (before_by ->> r.key)::bigint));`);
}

test(
  "taking a job costs the same beside 50,000 waiting as beside 1,000: a backlog never slows its own draining",
  { skip },
  (t) => {
    const small = claimsBeside(1_000);
    const large = claimsBeside(50_000);
    t.diagnostic(
      `three claims: ${small.blocks} blocks, ${small.ms} ms beside 1,000; ${large.blocks} blocks, ${large.ms} ms beside 50,000; ` +
        `by heap and index ${JSON.stringify(small.by)} then ${JSON.stringify(large.by)}`,
    );
    assert.ok(small.blocks > 0, "the ledger is read at all");
    assert.ok(
      large.blocks <= small.blocks * 1.5 + 30,
      `three claims read ${small.blocks} blocks beside 1,000 waiting and ${large.blocks} beside 50,000: a claim that walks the backlog ` +
        `slows as work piles up, when the ledger most needs to drain (by heap and index: ${JSON.stringify(large.by)})`,
    );
  },
);

test(
  "beside 50,000 waiting, a reply still goes first, then someone waiting, then a workspace with nothing running",
  { skip },
  () => {
    const { claimed } = rolledBack(`
    a uuid; b uuid; k integer; l text; claimed jsonb := '[]';
    begin
      ${TWO_WORKSPACES}
      ${backlogOf("a", 50_000)}
      ${job("a's running batch", { kind: "broadcast_send", due: 200_000, fired: 5, lease: 60 })}
      ${OTHERS_OUT_OF_REACH}
      ${job("a reply", { kind: "inbound_answer", payload: { message_id: "11111111-1111-4111-8111-111111111111" } })}
      ${job("someone waiting", { ws: "b", kind: "preview_build" })}
      ${job("next door's batch", { ws: "b", kind: "broadcast_send" })}
      for k in 1..4 loop
        select j.payload ->> 'label' into l from public.claim_due_jobs(1, 90) j;
        claimed := claimed || to_jsonb(l);
      end loop;
      seen := jsonb_build_object('claimed', claimed);`);
    assert.deepEqual(claimed, ["a reply", "someone waiting", "next door's batch", "backlog"]);
  },
);
