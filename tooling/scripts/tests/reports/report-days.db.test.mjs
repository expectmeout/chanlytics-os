/**
 * A report draws each day from one pass (00251), on a real database.
 *
 * report_series and campaign_series built each day of their two periods from a scalar subquery per count, and each
 * scanned its whole source for the one day it wanted; report_series ran its contacts pass (firsts, fresh) again for
 * every day. Each source is now read once and grouped by the day. What this proves: the days say what happened on
 * them, a zero on a day with nothing, from calls, escalations, first messages and replies seeded on known days; the
 * contacts pass runs once, not once a day (with sequential scans off, its index is read four times a person: the first
 * word is asked for where the pass filters and where it says the day, and a history moved in once; as written, that
 * was four times a person for each of the fourteen days); and a campaign's sends, receipts and replies land on their
 * days, and so do the answers to its runs (a yes or a stop, dated by when it came: 00403).
 *
 * Everything happens in a transaction on this machine's database that never commits. The workspace keeps UTC, so a
 * day is a UTC date. Read through the CLI, as sweep-registry.db.test.mjs turns a clock; SUPABASE_CLI names the binary
 * when `supabase` is not on PATH.
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

/** The series' days, today last, as {date: row}; `ago(k)` names the date k days before today, in UTC. */
const byDay = (series) => Object.fromEntries(series.map((d) => [d.day, d]));
const ago = (k) => new Date(Date.now() - k * 86_400_000).toISOString().slice(0, 10);

test(
  "report_series: each day says what happened on it, and the contacts pass runs once, not once a day",
  { skip },
  () => {
    const seen = rolledBack(`
    declare
      t uuid; cid uuid; conv uuid; day0 timestamptz; before bigint; report jsonb;
    begin
      insert into public.tenants (slug, name, timezone) values ('report-days-' || gen_random_uuid(), 'Report days', 'UTC')
        returning id into t;
      day0 := (date_trunc('day', now() at time zone 'UTC')) at time zone 'UTC';
      -- Seven people: person k first writes k days ago, a minute into the day, and the receptionist answers in 30 s.
      for k in 0..6 loop
        insert into public.contacts (tenant_id) values (t) returning id into cid;
        insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;
        insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at, channel_ts) values
          (t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'a question', 'received',
           day0 - make_interval(days => k) + interval '1 minute', day0 - make_interval(days => k) + interval '1 minute'),
          (t, conv, cid, 'whatsapp', 'outbound', 'ai', 'text', 'an answer', 'sent',
           day0 - make_interval(days => k) + interval '1 minute 30 seconds', null);
        -- The person of a day ago also called twice, and a dial that never connected is no call.
        if k = 1 then
          insert into public.calls (tenant_id, contact_id, retell_call_id, status, started_at, duration_ms) values
            (t, cid, 'report-days-' || gen_random_uuid(), 'ended', day0 - interval '1 day' + interval '2 minutes', 90000),
            (t, cid, 'report-days-' || gen_random_uuid(), 'ended', day0 - interval '1 day' + interval '3 minutes', 30500),
            (t, cid, 'report-days-' || gen_random_uuid(), 'not_connected', day0 - interval '1 day' + interval '4 minutes', 0);
        end if;
        -- Three escalations two days ago. A thread holds one open at a time (escalations_one_open, 00004), so the first
        -- two were resolved; the report counts each, whatever it came to.
        if k = 2 then
          insert into public.escalations (tenant_id, conversation_id, reason, state, created_at)
            select t, conv, 'manual', case when g < 7 then 'resolved' else 'open' end,
                   day0 - interval '2 days' + make_interval(mins => g)
              from generate_series(5, 7) g;
        end if;
      end loop;
      perform set_config('enable_seqscan', 'off', true);
      before := pg_stat_get_xact_numscans('public.messages_contact_created'::regclass);
      report := public.report_series(t, 7);
      seen := jsonb_build_object(
        'report', report,
        'scans', pg_stat_get_xact_numscans('public.messages_contact_created'::regclass) - before);
    end;
  `);
    const { report, scans } = seen;
    assert.equal(report.days, 7);
    assert.equal(report.series.length, 14, "two periods of seven days");
    const days = byDay(report.series);
    for (let k = 0; k < 7; k++) {
      const d = days[ago(k)];
      assert.ok(d, `the series names ${ago(k)}`);
      assert.deepEqual(
        [d.messages_in, d.conversations, d.answered_ai, d.answered_you, d.unanswered, d.out_ai, d.new_contacts],
        [1, 1, 1, 0, 0, 1, 1],
        `${ago(k)}: one question, answered by the receptionist, from one new person`,
      );
      assert.equal(d.calls, k === 1 ? 2 : 0, `${ago(k)}: calls`);
      assert.equal(d.call_seconds, k === 1 ? 121 : 0, `${ago(k)}: 90 s and 30.5 s make 121 whole seconds`);
      assert.equal(d.escalations, k === 2 ? 3 : 0, `${ago(k)}: escalations`);
    }
    for (let k = 7; k < 14; k++) {
      const d = days[ago(k)];
      assert.ok(d, `the series names ${ago(k)}`);
      assert.deepEqual(
        [d.messages_in, d.answered_ai, d.calls, d.call_seconds, d.escalations, d.new_contacts],
        [0, 0, 0, 0, 0, 0],
        `${ago(k)} had nothing, and says zero`,
      );
    }
    assert.deepEqual(report.reasons, { manual: 3 });
    assert.equal(report.channels.current.voice, 2);
    assert.ok(
      scans > 0 && scans <= 6 * 7,
      `the contacts pass runs once: ${scans} index reads for 7 people over 14 days (once a day was 14 times that)`,
    );
  },
);

test(
  "campaign_series: each day's sends, receipts, replies and answers (a yes or a stop to a run, 00403) land on it",
  { skip },
  () => {
    const seen = rolledBack(`
    declare
      t uuid; tpl uuid; b uuid; cid uuid; first uuid; second uuid; conv uuid; mid uuid; day0 timestamptz; k int; receipt text;
      report jsonb;
    begin
      insert into public.tenants (slug, name, timezone) values ('campaign-days-' || gen_random_uuid(), 'Campaign days', 'UTC')
        returning id into t;
      day0 := (date_trunc('day', now() at time zone 'UTC')) at time zone 'UTC';
      insert into public.templates (tenant_id, name, language, channel) values (t, 'campaign_days', 'en', 'whatsapp') returning id into tpl;
      insert into public.sequence_batches (tenant_id, name, template_id, template_name, template_language, scheduled_for)
        values (t, 'Campaign days', tpl, 'campaign_days', 'en', day0 - interval '5 days') returning id into b;
      -- Six sends: three today (read, delivered, sent; the read one answered an hour later), two three days ago, and
      -- one three days ago that failed and counts nowhere. The second's thread got a call's note and the third's an
      -- out-of-office from their mailbox: rows that came in, and nobody's answer (00320). The second went by email,
      -- the others by WhatsApp (a row naming no channel, as every one did before channels).
      for i in 1..6 loop
        k := case when i <= 3 then 0 else 3 end;
        receipt := (array['read', 'delivered', 'sent', 'sent', 'sent', 'failed'])[i];
        insert into public.contacts (tenant_id) values (t) returning id into cid;
        if i = 1 then first := cid; end if;
        if i = 2 then second := cid; end if;
        insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;
        insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at)
          values (t, conv, cid, case when i = 2 then 'email' else 'whatsapp' end, 'outbound', 'human', 'template', 'an offer', receipt,
                  day0 - make_interval(days => k) + make_interval(mins => i))
          returning id into mid;
        insert into public.sequence_sends (tenant_id, batch_id, contact_id, message_id, state, sent_at, channel)
          values (t, b, cid, mid, case when i = 6 then 'failed' else 'sent' end, day0 - make_interval(days => k) + make_interval(mins => i),
                  case when i = 2 then 'email' end);
        if i = 1 then
          insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at)
            values (t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'yes please', 'received', day0 + interval '61 minutes');
        end if;
        if i = 2 then
          insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at)
            values (t, conv, cid, 'voice', 'inbound', 'system', 'call_summary', 'They phoned about Saturday.', 'received', day0 + interval '62 minutes');
        end if;
        if i = 3 then
          insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at, meta)
            values (t, conv, cid, 'email', 'inbound', 'customer', 'text', 'I am out of the office.', 'received', day0 + interval '63 minutes',
                    '{"email": {"claim": "auto_reply"}}');
        end if;
      end loop;
      -- Three hours into today, after today's three sends and inside their 72 hours: a yes or a stop is an answer to the
      -- run that reached the person, dated by when it came (00403), not a line of the consent ledger on a day of its own.
      -- The first person (reached by WhatsApp) says yes, then presses "stop all" on the unsubscribe page, which writes
      -- the STOP and email's own no for the one press (00174): the stop is the latest they said to the run and stands,
      -- the yes is superseded, and email's no is no answer of a person the run did not reach by email. The second
      -- (reached by email) unsubscribes from offers by email: a stop (00320). Two people stopped and nobody said yes.
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, created_at, data) values
        (t, 'contact.consent_changed', 'contact', 'contact', first, day0 + interval '3 hours', '{"consent": "opted_in"}'),
        (t, 'contact.consent_changed', 'contact', 'contact', first, day0 + interval '3 hours 1 minute', '{"consent": "opted_out"}'),
        (t, 'contact.consent_changed', 'contact', 'contact', first, day0 + interval '3 hours 2 minutes',
         '{"consent": "opted_out", "purpose": "email_marketing"}'),
        (t, 'contact.consent_changed', 'contact', 'contact', second, day0 + interval '3 hours 3 minutes',
         '{"consent": "opted_out", "purpose": "email_marketing"}');
      report := public.campaign_series(t, 7);
      seen := jsonb_build_object('report', report);
    end;
  `);
    const { report } = seen;
    assert.equal(report.series.length, 14);
    const days = byDay(report.series);
    const row = (k) => {
      const d = days[ago(k)];
      return [d.sent, d.delivered, d.read, d.replied, d.opt_ins, d.opt_outs];
    };
    assert.deepEqual(
      row(0),
      [3, 2, 1, 1, 0, 2],
      "today: three sent, two delivered (one read), one replied (a call's note and an out-of-office are no reply); two people stopped and none said yes: the first one's yes is superseded in the run by the stop-all after it (and the email no of that press is no answer of a person not reached by email), and the second one's unsubscribe from offers by email is theirs, reached by email",
    );
    assert.deepEqual(
      row(1),
      [0, 0, 0, 0, 0, 0],
      "a day ago: the answers are dated by when they came, and none came (they were a line of the ledger on this day before 00403)",
    );
    assert.deepEqual(row(3), [2, 0, 0, 0, 0, 0], "three days ago: two sent, and the failed one counts nowhere");
    for (const k of [2, 4, 5, 6, 7, 13]) assert.deepEqual(row(k), [0, 0, 0, 0, 0, 0], `${ago(k)} had nothing`);
    assert.equal(report.sources.length, 1);
    assert.deepEqual(
      [report.sources[0].sent, report.sources[0].delivered, report.sources[0].read, report.sources[0].replied],
      [5, 2, 1, 1],
    );
    assert.deepEqual(
      report.by_channel,
      [
        { channel: "whatsapp", sent: 4, delivered: 1, read: 1, replied: 1 },
        { channel: "email", sent: 1, delivered: 1, read: 0, replied: 0 },
      ],
      "rows from before channels name none: they went by WhatsApp (0030); the second went by email",
    );
  },
);

test(
  "campaign_series by channel (0030): the current period's sends, receipts and replies, each channel its own; a row naming none went by WhatsApp; the period before is not in it",
  { skip },
  () => {
    const seen = rolledBack(`
    declare
      t uuid; tpl uuid; b uuid; cid uuid; conv uuid; mid uuid; day0 timestamptz; report jsonb; spec record;
    begin
      insert into public.tenants (slug, name, timezone) values ('campaign-channels-' || gen_random_uuid(), 'Campaign channels', 'UTC')
        returning id into t;
      day0 := (date_trunc('day', now() at time zone 'UTC')) at time zone 'UTC';
      insert into public.templates (tenant_id, name, language, channel) values (t, 'campaign_channels', 'en', 'whatsapp') returning id into tpl;
      insert into public.sequence_batches (tenant_id, name, template_id, template_name, template_language, scheduled_for)
        values (t, 'Campaign channels', tpl, 'campaign_channels', 'en', day0 - interval '12 days') returning id into b;
      -- The channel the row names, the message's own, its receipt, how many days ago it went, and whether it was answered.
      for spec in select * from (values
          (null::text, 'whatsapp', 'read', 0, true),
          ('whatsapp', 'whatsapp', 'delivered', 1, false),
          ('whatsapp', 'whatsapp', 'sent', 2, false),
          ('sms', 'sms', 'delivered', 0, true),
          ('sms', 'sms', 'sent', 1, false),
          ('email', 'email', 'delivered', 2, false),
          ('sms', 'sms', 'delivered', 10, false)
        ) as v(rc, mc, receipt, k, answered)
      loop
        insert into public.contacts (tenant_id) values (t) returning id into cid;
        insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;
        insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at)
          values (t, conv, cid, spec.mc, 'outbound', 'human', 'text', 'an offer', spec.receipt,
                  day0 - make_interval(days => spec.k) + interval '1 minute')
          returning id into mid;
        insert into public.sequence_sends (tenant_id, batch_id, contact_id, message_id, state, sent_at, channel)
          values (t, b, cid, mid, 'sent', day0 - make_interval(days => spec.k) + interval '1 minute', spec.rc);
        if spec.answered then
          insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at)
            values (t, conv, cid, spec.mc, 'inbound', 'customer', 'text', 'yes please', 'received',
                    day0 - make_interval(days => spec.k) + interval '30 minutes');
        end if;
      end loop;
      report := public.campaign_series(t, 7);
      seen := jsonb_build_object('report', report);
    end;
  `);
    const { report } = seen;
    assert.deepEqual(
      report.by_channel.map((c) => [c.channel, c.sent, c.delivered, c.read, c.replied]),
      [
        ["whatsapp", 3, 2, 1, 1],
        ["sms", 2, 1, 0, 1],
        ["email", 1, 1, 0, 0],
      ],
      "the most sent first; a read receipt is WhatsApp's, a delivered one each channel's own",
    );
    assert.deepEqual(
      [report.sources[0].sent, report.series.reduce((n, d) => n + d.sent, 0)],
      [6, 7],
      "the period before's text is in the days and not in the current period's figures",
    );
  },
);
