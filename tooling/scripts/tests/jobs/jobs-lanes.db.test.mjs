/**
 * A reply goes first, and each workspace takes its turn (decision 0018, steps 2 and 3, 00281), on a real database.
 *
 * Each job's lane is generated from its kind and payload: 0 a reply, 1 someone waiting who is not a customer, 2 bulk.
 * claim_due_jobs takes the lowest lane first; within bulk, a workspace with no bulk work running before one with some;
 * then the earliest due. Every kind the jobs.kind CHECK allows has a lane, read from the catalogue.
 *
 * The ledger is one queue, and other suites claim from it at the same time, so each case runs in a transaction on this
 * machine's database that never commits and has the ledger to itself: it takes the table in a mode every writer waits
 * on, for the moment the case takes, and moves everyone else's due work out of reach. Nothing of another suite's is
 * claimed, and nothing of this one's is left behind. Read through the CLI, as the other database suites under
 * database/ are; SUPABASE_CLI names the binary when `supabase` is not on PATH.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_SETS } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite claims due jobs"
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
      for k in
        select m[1]
          from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') as m
         where c.conrelid = 'public.jobs'::regclass and c.conname = 'jobs_kind_check'
      loop
        insert into public.jobs (tenant_id, kind, due_at) values (a, k, now() + interval '1 day') returning lane into l;
        lanes := lanes || jsonb_build_object(k, l);
        kinds := kinds || to_jsonb(k);
      end loop;
      insert into public.jobs (tenant_id, kind, due_at, payload)
        values (a, 'outbound_send', now() + interval '1 day', '{"purpose": "outreach"}') returning lane into l;
      lanes := lanes || jsonb_build_object('outreach', l);
      seen := jsonb_build_object('lanes', lanes, 'kinds', kinds);`);
  assert.deepEqual([...kinds].sort(), [...SCHEMA_SETS["jobs.kind"]].sort(), "the kinds read are the CHECK's own");
  assert.deepEqual(
    kinds.filter((k) => lanes[k] === null),
    [],
    "a kind arrives with its lane, as with its handler, its caller and the jobs.kind CHECK",
  );
  const expected = {
    outbound_send: 0, // a member's reply, or the receptionist's
    email_ingest: 0,
    push_send: 0,
    line_provision: 1,
    reply_read: 1,
    broadcast_send: 2,
    lead_round_start: 2,
    lead_collect: 2,
    lead_check: 2,
    push_receipts: 2,
    outreach: 2, // an outbound_send whose purpose is outreach: a cold email is bulk
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
