/**
 * A report is read over the days a member picks (00359), on a real database.
 *
 * Every report function read "p_days ending today". Each takes the window's last day now (`p_end`), and what this
 * proves of it: a window that names no day, today, or a day to come is the read it always was, to the byte; a window
 * that ended earlier says its last day and the workspace's real today; its days are the same slice of the days
 * whichever day they are asked from (each day's row is the row a wider window ending today holds for it); nothing
 * that happened after its last day is counted in it (an escalation, a call); each function has one signature, the one
 * with the day, since PostgREST cannot choose between two; and a member may run each where a visitor may not.
 * reach_out_report asks who is calling, so its window is held over real members in
 * reach-out-back/what-comes-back.db.test.mjs.
 *
 * Everything happens in a transaction on this machine's database that never commits. The workspace keeps UTC, so a
 * day is a UTC date. Read through the CLI, as report-days.db.test.mjs is; SUPABASE_CLI names the binary when
 * `supabase` is not on PATH.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
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

/** The date k days before today, in UTC, and a series as {date: row}. */
const ago = (k) => new Date(Date.now() - k * 86_400_000).toISOString().slice(0, 10);
const byDay = (series) => Object.fromEntries(series.map((d) => [d.day, d]));

/**
 * A workspace in UTC with twenty days behind it: person k first writes k days ago and the receptionist answers; two
 * calls three days ago and one ten days ago; three escalations two days ago and two nine days ago.
 */
const TWENTY_DAYS = `
  insert into public.tenants (slug, name, timezone) values ('report-window-' || gen_random_uuid(), 'Report window', 'UTC')
    returning id into t;
  day0 := (date_trunc('day', now() at time zone 'UTC')) at time zone 'UTC';
  for k in 0..19 loop
    insert into public.contacts (tenant_id) values (t) returning id into cid;
    insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;
    insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at, channel_ts) values
      (t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'a question', 'received',
       day0 - make_interval(days => k) + interval '1 minute', day0 - make_interval(days => k) + interval '1 minute'),
      (t, conv, cid, 'whatsapp', 'outbound', 'ai', 'text', 'an answer', 'sent',
       day0 - make_interval(days => k) + interval '1 minute 30 seconds', null);
    if k in (3, 10) then
      insert into public.calls (tenant_id, contact_id, retell_call_id, status, started_at, duration_ms)
        select t, cid, 'report-window-' || gen_random_uuid(), 'ended',
               day0 - make_interval(days => k) + make_interval(mins => g), 60000
          from generate_series(1, case when k = 3 then 2 else 1 end) g;
    end if;
    if k in (2, 9) then
      insert into public.escalations (tenant_id, conversation_id, reason, state, created_at)
        select t, conv, 'manual', case when g < (case when k = 2 then 3 else 2 end) then 'resolved' else 'open' end,
               day0 - make_interval(days => k) + make_interval(mins => g)
          from generate_series(1, case when k = 2 then 3 else 2 end) g;
    end if;
  end loop;
`;

test(
  "report_series: a window that names no day, today or a day to come is the read it always was; one that ended says its last day, holds the same slice of the days, and counts nothing after it",
  { skip },
  () => {
    const seen = rolledBack(`
    declare
      t uuid; cid uuid; conv uuid; day0 timestamptz; today date; live jsonb; wide jsonb; ended jsonb;
    begin
      ${TWENTY_DAYS}
      today := (now() at time zone 'UTC')::date;
      live := public.report_series(t, 7);
      wide := public.report_series(t, 30);
      ended := public.report_series(t, 7, today - 5);
      seen := jsonb_build_object(
        'live', live,
        'wide', wide,
        'ended', ended,
        'named_today', public.report_series(t, 7, today) = live,
        'to_come', public.report_series(t, 7, today + 5) = live,
        'no_day', public.report_series(t, 7, null) = live);
    end;
  `);
    const { live, wide, ended } = seen;
    assert.deepEqual(
      [seen.no_day, seen.named_today, seen.to_come],
      [true, true, true],
      "no day, today and a day that has not come are one read, to the byte",
    );
    assert.deepEqual([live.today, live.end, live.days], [ago(0), ago(0), 7], "a window that ends today says so");
    // The window that ended five days ago: its last day, the workspace's real today, and the fourteen days to it.
    assert.deepEqual([ended.today, ended.end, ended.days, ended.span_days], [ago(0), ago(5), 7, 14]);
    assert.deepEqual(
      ended.series.map((d) => d.day),
      Array.from({ length: 14 }, (_, i) => ago(18 - i)),
      "two periods of seven days, the last of them the window's last day",
    );
    // The same slice of the days, whichever day they are asked from: each row is the wider window's row for that day.
    const inWide = byDay(wide.series);
    for (const d of ended.series) assert.deepEqual(d, inWide[d.day], `${d.day} says the same in both`);
    for (const d of ended.series)
      assert.deepEqual(
        [d.messages_in, d.answered_ai, d.new_contacts],
        [1, 1, 1],
        `${d.day}: one question, answered, from one new person`,
      );
    // Nothing after the window's last day is counted in it. Its seven days are 11 to 5 days ago: the two escalations
    // nine days ago and the call ten days ago are theirs; the three escalations two days ago and the two calls three
    // days ago came after, and are the live window's.
    assert.deepEqual(ended.reasons, { manual: 2 }, "REGRESSION: a window counted every escalation since its first day");
    assert.equal(ended.channels.current.voice, 1, "one call in its days, not the two that came after");
    assert.deepEqual(live.reasons, { manual: 3 });
    assert.equal(live.channels.current.voice, 2);
    assert.equal(
      ended.reply_seconds.length,
      7,
      "one first reply for each of its seven days, and none of the days after",
    );
  },
);

test(
  "campaign_series and reviews_ledger read the same window: no day named is the read it always was, and a day named is said back with the days to it",
  { skip },
  () => {
    const seen = rolledBack(`
    declare
      t uuid; cid uuid; conv uuid; day0 timestamptz; today date;
    begin
      ${TWENTY_DAYS}
      today := (now() at time zone 'UTC')::date;
      seen := jsonb_build_object(
        'campaigns', public.campaign_series(t, 7, today - 5),
        'campaigns_same', public.campaign_series(t, 7, today) = public.campaign_series(t, 7)
          and public.campaign_series(t, 7, today + 5) = public.campaign_series(t, 7),
        'ledger', public.reviews_ledger(t, 7, today - 5),
        'ledger_same', public.reviews_ledger(t, 7, today) = public.reviews_ledger(t, 7)
          and public.reviews_ledger(t, 7, today + 5) = public.reviews_ledger(t, 7));
    end;
  `);
    assert.equal(seen.campaigns_same, true, "campaign_series: no day, today and a day to come are one read");
    assert.equal(seen.ledger_same, true, "reviews_ledger: no day, today and a day to come are one read");
    assert.deepEqual([seen.campaigns.today, seen.campaigns.end, seen.campaigns.days], [ago(0), ago(5), 7]);
    assert.deepEqual(
      seen.campaigns.series.map((d) => d.day),
      Array.from({ length: 14 }, (_, i) => ago(18 - i)),
      "the campaigns' days are the window's, to its last day",
    );
    assert.deepEqual([seen.ledger.today, seen.ledger.end, seen.ledger.days], [ago(0), ago(5), 7]);
  },
);

test(
  "each report function has one signature, the one that takes the window's last day, and a member may run it where a visitor may not",
  { skip },
  () => {
    const seen = rolledBack(`
    begin
      seen := jsonb_build_object(
        'signatures', (
          select jsonb_object_agg(proname, sigs) from (
            select p.proname, jsonb_agg(pg_get_function_identity_arguments(p.oid) order by 1) as sigs
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname in ('report_series', 'campaign_series', 'reach_out_report', 'reviews_ledger')
             group by p.proname) s),
        'may', (
          select jsonb_object_agg(f, jsonb_build_array(
                   has_function_privilege('authenticated', sig, 'execute'),
                   has_function_privilege('service_role', sig, 'execute'),
                   has_function_privilege('anon', sig, 'execute')))
            from (select f, 'public.' || f || '(uuid, integer, date)' as sig
                    from unnest(array['report_series', 'campaign_series', 'reach_out_report', 'reviews_ledger']) f) x));
    end;
  `);
    for (const f of ["report_series", "campaign_series", "reach_out_report", "reviews_ledger"]) {
      assert.equal(seen.signatures[f].length, 1, `${f}: one signature, or PostgREST cannot choose between them`);
      assert.match(seen.signatures[f][0], /p_end date$/, `${f}: and it is the one that takes the last day`);
      assert.deepEqual(
        seen.may[f],
        [true, true, false],
        `${f}: a member and the service may run it, a visitor may not`,
      );
    }
  },
);
