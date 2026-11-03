/**
 * Two writes that are one fact, written in one statement (00516, decision 0089), on this machine's Postgres:
 *
 *   queue_send        the receptionist's held reply and the outbound_send job that sends it: both or neither. A run killed
 *                     between the two used to leave a queued reply nothing would send, found ten minutes later.
 *   finish_broadcast  a run marked sent and its broadcast.sent: an event that could not be written used to throw out of
 *                     a run that had finished, and its owner was told it stopped; two chains finishing write one event.
 *
 * Each case runs in a transaction that never commits. Read through the CLI; SUPABASE_CLI names the binary.
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
    ? "refusing a database that is not on this machine"
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

const A_THREAD = `
  insert into public.tenants (slug, name) values ('queue-' || gen_random_uuid(), 'Queue') returning id into t;
  insert into public.contacts (tenant_id) values (t) returning id into cid;
  insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;`;

test(
  "a queued reply and its job are written together: the job names the row, and the row keeps where it goes",
  { skip },
  () => {
    const out = rolledBack(`
    t uuid; cid uuid; conv uuid; mid uuid; j record; m record;
    begin
      ${A_THREAD}
      mid := public.queue_send(
        jsonb_build_object('tenant_id', t, 'conversation_id', conv, 'contact_id', cid, 'channel', 'whatsapp',
                           'sender', 'ai', 'body', 'We have 3pm free.', 'meta', jsonb_build_object('to', '+15550100142')),
        now() + interval '30 seconds',
        '{"to_phone": "+15550100142"}'::jsonb);
      select * into m from public.messages where id = mid;
      select * into j from public.jobs where tenant_id = t and kind = 'outbound_send';
      seen := jsonb_build_object('status', m.status, 'to', m.meta ->> 'to', 'job_names', j.payload ->> 'message_id' = mid::text,
                                 'thread', j.payload ->> 'conversation_id' = conv::text, 'lane', j.lane, 'state', j.state);`);
    assert.deepEqual(out, {
      status: "queued",
      to: "+15550100142",
      job_names: true,
      thread: true,
      lane: 0,
      state: "scheduled",
    });
  },
);

test("a queued reply that cannot be written leaves neither the reply nor its job behind", { skip }, () => {
  const out = rolledBack(`
    t uuid; cid uuid; conv uuid; refused boolean := false; remaining int;
    begin
      ${A_THREAD}
      -- A thread that is not there: the statement fails whole, so no reply and no job of it stand.
      begin
        perform public.queue_send(
          jsonb_build_object('tenant_id', t, 'conversation_id', gen_random_uuid(), 'sender', 'ai', 'body', 'x'),
          now(), '{}'::jsonb);
      exception when others then
        refused := true;
      end;
      select count(*) into remaining from public.messages where tenant_id = t;
      seen := jsonb_build_object('refused', refused, 'messages', remaining,
                                 'jobs', (select count(*) from public.jobs where tenant_id = t));`);
  assert.deepEqual(out, { refused: true, messages: 0, jobs: 0 });
});

test(
  "a run that sent its last batch is marked sent with its event once; a second chain writes nothing",
  { skip },
  () => {
    const out = rolledBack(`
    t uuid; b uuid; first boolean; second boolean; events int; st text;
    begin
      insert into public.tenants (slug, name) values ('finish-' || gen_random_uuid(), 'Finish') returning id into t;
      insert into public.sequence_batches (tenant_id, name, scheduled_for, state, audience)
           values (t, 'A run', now(), 'sending', '{"kind":"reach_out","hand":"note"}') returning id into b;
      first := public.finish_broadcast(t, b, jsonb_build_object('kind', 'broadcast.sent', 'category', 'message',
                 'version', 1, 'subject_type', 'broadcast', 'subject_id', b, 'data', '{"sent": 3, "held": 1}'::jsonb));
      second := public.finish_broadcast(t, b, jsonb_build_object('kind', 'broadcast.sent', 'subject_type', 'broadcast',
                 'subject_id', b, 'data', '{}'::jsonb));
      select count(*) into events from public.events where tenant_id = t and kind = 'broadcast.sent' and subject_id = b;
      select state into st from public.sequence_batches where id = b;
      seen := jsonb_build_object('first', first, 'second', second, 'events', events, 'state', st);`);
    assert.deepEqual(out, { first: true, second: false, events: 1, state: "sent" });
  },
);
