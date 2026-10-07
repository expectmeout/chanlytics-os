/**
 * A channel's latest word is found in one probe (00257), on a real database.
 *
 * GET channels says when WhatsApp last heard from a customer: the workspace's newest inbound WhatsApp message by the
 * provider's time (apps/dashboard/src/server/readers/channels.ts). Until 00257 no index kept messages in that order, so
 * the read went through every inbound message the workspace ever had and sorted them, and Live runs it on every change
 * to a call. What this proves is that the read no longer grows with the workspace's history: the same query as the
 * reader's, run against a history of a thousand inbound messages and again once it is three thousand, reads the same
 * blocks of messages. Blocks, not rows, because a walk down an index in the wrong order returns one row and reads every
 * block to choose it. Sequential scans are off, so on tables this small the planner shows what it could use. It also
 * holds what the answer is: the newest by when the customer sent it, never a newer row with no provider time, another
 * channel's, a send, or old history stored a moment ago.
 *
 * Everything happens in a transaction on this machine's database that never commits. Read through the CLI, as
 * sweep-registry.db.test.mjs turns a clock; SUPABASE_CLI names the binary when `supabase` is not on PATH.
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

/** `n` more inbound WhatsApp messages on the thread, sent and stored `from` days ago onwards, a minute apart. */
const history = (n, from) => `
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at, channel_ts)
    select t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'an older word ' || i, 'received',
           now() - interval '${from} days' + make_interval(mins => i), now() - interval '${from} days' + make_interval(mins => i)
      from generate_series(1, ${n}) i;`;

/** The reader's query (channels.ts): the workspace's newest inbound WhatsApp message by channel_ts, nulls last. */
const LATEST = `select m.channel_ts from public.messages m
   where m.tenant_id = t and m.direction = 'inbound' and m.channel = 'whatsapp'
   order by m.channel_ts desc nulls last limit 1`;

/** The blocks this transaction has read from messages so far, from its heap and every one of its indexes. */
const BLOCKS = `(coalesce(pg_stat_get_xact_blocks_fetched('public.messages'::regclass), 0)
  + coalesce((select sum(pg_stat_get_xact_blocks_fetched(x.indexrelid))
                from pg_index x where x.indrelid = 'public.messages'::regclass), 0))::bigint`;

/** What the reader's query cost messages, in blocks, with fresh statistics and sequential scans off; and its answer. */
const measured = (name) => `
  analyze public.messages;
  perform set_config('enable_seqscan', 'off', true);
  before := ${BLOCKS};
  ${LATEST} into got;
  cost := cost || jsonb_build_object('${name}', ${BLOCKS} - before);
  answers := answers || jsonb_build_object('${name}', got = newest);
  perform set_config('enable_seqscan', 'on', true);`;

let seen;
/** Seeded and read once for every test: the latest word beside a history of a thousand, then three thousand. */
function reads() {
  seen ??= rolledBack(`
    declare
      t uuid; cid uuid; conv uuid; newest timestamptz := date_trunc('second', now()) - interval '1 hour'; got timestamptz;
      before bigint; cost jsonb := '{}'; answers jsonb := '{}';
    begin
      insert into public.tenants (slug, name) values ('latest-word-' || gen_random_uuid(), 'Latest word') returning id into t;
      insert into public.contacts (tenant_id) values (t) returning id into cid;
      insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;
      insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at, channel_ts) values
        -- The newest word by when the customer sent it: the answer.
        (t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'the newest word', 'received', newest, newest),
        -- Stored after it, but with no provider time: nulls sort last.
        (t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'no time on it', 'received', now() - interval '1 minute', null),
        -- Newer, but a text message, and a send.
        (t, conv, cid, 'sms', 'inbound', 'customer', 'text', 'by text', 'received', now() - interval '5 minutes', now() - interval '5 minutes'),
        (t, conv, cid, 'whatsapp', 'outbound', 'ai', 'text', 'our reply', 'sent', now() - interval '2 minutes', now() - interval '2 minutes'),
        -- A month-old word stored a moment ago, as history moved in is: newest by created_at, not by when it was sent.
        (t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'from the history', 'received', now(), now() - interval '30 days');
      ${history(1000, 40)}
      ${measured("beside_1000")}
      ${history(2000, 80)}
      ${measured("beside_3000")}
      seen := jsonb_build_object('cost', cost, 'answers', answers);
    end;
  `);
  return seen;
}

test(
  "GET channels' latest WhatsApp word is the newest the customer sent, whatever else was stored after it",
  { skip },
  () => {
    const { answers } = reads();
    assert.deepEqual(answers, { beside_1000: true, beside_3000: true });
  },
);

test(
  "GET channels' latest WhatsApp word reads the same blocks however long the workspace's history is",
  { skip },
  () => {
    const { cost } = reads();
    const small = cost.beside_1000;
    const large = cost.beside_3000;
    assert.ok(small > 0, "messages is read at all");
    assert.ok(
      large <= small * 1.5 + 5,
      `the latest word read ${small} blocks of messages beside 1,000 older ones and ${large} beside 3,000 ` +
        "(a read that goes through the workspace's history grows with it)",
    );
  },
);
