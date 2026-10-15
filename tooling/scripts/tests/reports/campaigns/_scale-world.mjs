/**
 * The world campaign-scale.db.test.mjs reads: a workspace that talks, written in SQL in one statement (over 200,000 rows
 * through PostgREST would take an hour). `atScale(query)` makes it and returns its id; the test removes it.
 *
 * The brief's workspace (the playbook-totals suite's, run to today): six moments of 600 daily runs, each run sending 24
 * people (20 delivered, 3 read, one that failed late: its recipient stays `sent`, as a late failure leaves it, and its
 * message carries a Graph-shaped error) and skipping one, so 3,600 runs and 90,000 recipients. The people come in four
 * groups of 150, so each is written to every fourth day and a reply an hour after a send answers that send alone; the
 * first person of every fifth run replies. The runs END TODAY (`t0 = today - 599 days`): the newest 30 days hold 180
 * runs and the other 3,420 are outside any window the lens reads, so a count that strayed outside its window would be
 * wrong here (the timing gate cannot tell a read of the window from a read of the workspace at this size: see the
 * test's header). 2,520 more inbound messages of its people's own were written before the first run (the case that made
 * run_counts need its fence).
 *
 * What the brief's list leaves out and a part of the lens reads, so that no part is measured on an empty table:
 *
 *   consent    campaign_answers (and campaign_series' consent part) reads the events of `contact.consent_changed` from the
 *              window's first instant: 1,152 of them, two for each of the 576 people a run sends to, each two hours after
 *              one of that person's sends (so each answers that run and no other: the next send is 96 hours away), the
 *              newer ones within the last 96 days, the older ones 32 days (eight sends) further back, so that a person who
 *              said the same twice in 60 days said it in both periods of a 30-day read; a third of the newer ones are
 *              stops. A person is sent to 150 times in all, so each event is looked up against 150 of their sends.
 *   approval   campaign_ledger's approval part walks the workspace's `broadcast` decisions (decisions_tenant_subject ends
 *              in `created_at`, so the window cannot be read from the index): one approved `send_broadcast` for each of
 *              the 3,600 runs, made 5 to 125 minutes after the run, the most a workspace that approves everything has.
 *   stuck      One thread in ten is `needs_human`, so campaign_stuck's reply probe has threads to look into.
 *   reach-out  The reach-out reads (00404) read the workspace's `reach_out_sends` and the emails they left, and look the
 *              answers up in the workspace's messages: one chain of three emails (four days apart) over the last 99
 *              days to 4,000 businesses (all get the first, 60% the second, 30% the third; one in twenty bounces; one
 *              in twenty writes back, in the thread, answering the first email's message id; one in forty is read as a
 *              question), 7,600 emails in all, on 300 runs of their own.
 */

export const SCALE = { moments: 6, runs: 600, people: 25 };
/** The 600 people: four groups of 150, each of the six moments having 25 of every group's. */
const PEOPLE = 600;
/** The reach-out's businesses; 7,600 emails are written to them (all get the first, 60% the second, 30% the third). */
const REACH_OUT = { businesses: 4000 };
/** The messages of their own the people wrote before the first run. */
export const EARLIER_WORDS = 2520;
/**
 * What the 24th send of each run did, late: the provider stopped it after it was sent. The message is `failed` with a
 * Graph-shaped error (a receipt's code, and the body of the answer, which names a number), the recipient stays `sent`.
 * The ledger reads the code and never repeats the body.
 */
export const LATE_FAILURE = { code: 131026, body: "Call +1 555 0142 about it" };
const LATE_FAILURE_SQL = `jsonb_build_object('errors', jsonb_build_array(jsonb_build_object('code', ${LATE_FAILURE.code}, 'title', 'Message undeliverable')), 'body', '${LATE_FAILURE.body}')`;

const person = (c) => `md5(t || ':person:' || (${c}))::uuid`;
const thread = (c) => `md5(t || ':thread:' || (${c}))::uuid`;
const run = (p, j) => `md5(t || ':run:' || (${p}) || ':' || (${j}))::uuid`;
const moment = (p) => `md5(t || ':moment:' || (${p}))::uuid`;
/** The person run `j` of moment `p` sends to as its `k`th: groups of 150 in turn, 25 to a moment. */
const WHO = "(j % 4) * 150 + p * 25 + k";
/** When run `j` of moment `p` is made and goes: its day, and a minute a moment. */
const AT = "t0 + j * interval '1 day' + p * interval '1 minute'";
const series = (n, alias, from = 0) => `generate_series(${from}, ${n - 1}) ${alias}`;
const MOMENTS = series(SCALE.moments, "p");
const RUNS = series(SCALE.runs, "j");

/** The moments' runs: the brief's workspace, and a thread in ten that needs a person. */
function momentsSql() {
  const sentTo = SCALE.people - 1;
  return `
  insert into public.templates (id, tenant_id, channel, name, language, meta_status)
    values (tpl, t, 'whatsapp', 'scale_offer', 'en_US', 'approved');
  insert into public.playbooks (id, tenant_id, name, trigger, template_id, template_name, template_language, policy_class)
    select ${moment("p")}, t, 'Moment ' || p, 'quiet_30', tpl, 'scale_offer', 'en_US', 'reengage'
      from ${MOMENTS};
  insert into public.contacts (id, tenant_id) select ${person("c")}, t from ${series(PEOPLE, "c")};
  insert into public.conversations (id, tenant_id, contact_id, state)
    select ${thread("c")}, t, ${person("c")}, case when c % 10 = 0 then 'needs_human' else 'open' end
      from ${series(PEOPLE, "c")};
  insert into public.broadcasts (id, tenant_id, name, template_id, template_name, template_language, audience, state,
                                 scheduled_for, recipient_count, playbook_id, run_for, created_at)
    select ${run("p", "j")}, t, 'Run ' || j, tpl, 'scale_offer', 'en_US',
           jsonb_build_object('kind', 'playbook', 'id', ${moment("p")}, 'label', 'Moment ' || p, 'trigger', 'quiet_30'),
           'sent', ${AT}, ${SCALE.people}, ${moment("p")}, (t0 + j * interval '1 day')::date, ${AT}
      from ${MOMENTS}, ${RUNS};
  insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status,
                               error, meta, created_at)
    select md5(t || ':sent:' || p || ':' || j || ':' || k)::uuid, t, ${thread(WHO)}, ${person(WHO)},
           'whatsapp', 'outbound', 'human', 'template', 'We miss you',
           case when k < 20 then 'delivered' when k < 23 then 'read' else 'failed' end,
           case when k = 23 then ${LATE_FAILURE_SQL} end,
           jsonb_build_object('source', 'broadcast'), ${AT} + k * interval '1 second'
      from ${MOMENTS}, ${RUNS}, ${series(sentTo, "k")};
  insert into public.broadcast_recipients (broadcast_id, contact_id, tenant_id, state, reason, message_id, sent_at)
    select ${run("p", "j")}, ${person(WHO)}, t,
           case when k < ${sentTo} then 'sent' else 'skipped' end,
           case when k < ${sentTo} then null else 'opted_out' end,
           case when k < ${sentTo} then md5(t || ':sent:' || p || ':' || j || ':' || k)::uuid end,
           case when k < ${sentTo} then ${AT} + k * interval '1 second' end
      from ${MOMENTS}, ${RUNS}, ${series(SCALE.people, "k")};
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status,
                               meta, created_at)
    select t, ${thread("(j % 4) * 150 + p * 25")}, ${person("(j % 4) * 150 + p * 25")}, 'whatsapp', 'inbound', 'customer',
           'text', 'Yes please', 'received', '{}'::jsonb, ${AT} + interval '1 hour'
      from ${MOMENTS}, generate_series(0, ${SCALE.runs - 1}, 5) j;
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status,
                               meta, created_at)
    select t, ${thread("i % " + PEOPLE)}, ${person("i % " + PEOPLE)}, 'whatsapp', 'inbound', 'customer', 'text',
           'Is Saturday free?', 'received', '{}'::jsonb, t0 - (i + 1) * interval '1 minute'
      from ${series(EARLIER_WORDS, "i")};`;
}

/** What the lens reads beyond the sends: the yeses and stops that answered them, and the approval of every run. */
function answersSql() {
  return `
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data, created_at)
    select t, 'contact.consent_changed', 'contact', 'contact', ${person("c")},
           jsonb_build_object('consent', case when e = 0 and c % 3 = 0 then 'opted_out' else 'opted_in' end,
                              'source', 'customer_message'),
           t0 + (${SCALE.runs - 1} - ((${SCALE.runs - 1} - c / 150) % 4) - 4 * (c % 25 + 8 * e)) * interval '1 day'
              + ((c % 150) / 25) * interval '1 minute' + (c % 25) * interval '1 second' + interval '2 hours'
      from ${series(PEOPLE, "c")}, ${series(2, "e")}
     where c % 25 < ${SCALE.people - 1};
  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, payload, created_at)
    select t, 'broadcast', ${run("p", "j")}, 'send_broadcast', 'user', '{"approved": true}'::jsonb,
           ${AT} + (5 + (j % 7) * 20) * interval '1 minute'
      from ${MOMENTS}, ${RUNS};`;
}

/** The reach-out: a chain of three emails, its businesses, its runs, its emails and the answers that came back. */
function reachOutSql() {
  const rs = (n) => `md5(t || ':ro:step:' || (${n}))::uuid`;
  const contact = (i) => `md5(t || ':ro:contact:' || ${i})::uuid`;
  const lastBusiness = REACH_OUT.businesses - 1;
  // The email a business is written at a step: `i` the business, `s` the step; the first left 8 to 99 days back (so the
  // last, 8 days after it, is not after today), each later one four days after the one before, at 10:00 plus `i % 480`
  // minutes.
  const back = "(8 + (i % 92) - 4 * s)";
  const left = `(today - ${back} * interval '1 day' + interval '10 hours' + (i % 480) * interval '1 minute')`;
  const emailed = `${series(REACH_OUT.businesses, "i")}, ${series(3, "s")} where s = 0 or (s = 1 and i % 5 < 3) or (s = 2 and i % 10 < 3)`;
  const businesses = series(REACH_OUT.businesses, "i");
  return `
  insert into public.lead_searches (id, tenant_id, via, card, name, asked, plan)
    values (rsearch, t, 'people', 'movers', 'Movers · Austin', 'movers in Austin', '{}'::jsonb);
  insert into public.templates (id, tenant_id, channel, name, language, meta_status)
    values (rtpl, t, 'email', 'reach_hello', 'en_US', 'approved');
  insert into public.playbooks (id, tenant_id, kind, trigger, name, template_id, template_name, template_language, params,
                                policy_class, gap_minutes, lead_search_id, state)
    values (${rs(0)}, t, 'reach_out', 'lead_first', 'Reach out · Movers', rtpl, 'reach_hello', 'en_US', '[]'::jsonb,
            'outreach', 12, rsearch, 'running');
  insert into public.playbooks (id, tenant_id, kind, trigger, name, template_id, template_name, template_language, params,
                                policy_class, gap_minutes, after_playbook_id, after_days, state)
    select ${rs("s")}, t, 'reach_out', 'after_step', 'Reach out · Movers · ' || (s + 1), rtpl, 'reach_hello', 'en_US',
           '[]'::jsonb, 'outreach', 12, ${rs("s - 1")}, 4, 'running'
      from ${series(3, "s", 1)};
  insert into public.contacts (id, tenant_id, display_name, email)
    select ${contact("i")}, t, 'Business ' || i, 'business' || i || '@example.com'
      from ${businesses};
  insert into public.conversations (id, tenant_id, contact_id)
    select md5(t || ':ro:thread:' || i)::uuid, t, ${contact("i")}
      from ${businesses};
  insert into public.leads (id, tenant_id, place_id, business_name, city, region, email, email_state, stage, contact_id)
    select md5(t || ':ro:lead:' || i)::uuid, t, 'ChIJscale' || i, 'Scale Movers ' || i, 'Austin', 'TX',
           'business' || i || '@example.com', 'ok', 'nurture', ${contact("i")}
      from ${businesses};
  -- One run of a step for each day it wrote on, the sends hung on it.
  insert into public.broadcasts (id, tenant_id, name, template_id, template_name, template_language, audience, state,
                                 scheduled_for, started_at, recipient_count, playbook_id, run_for, created_at)
    select md5(t || ':ro:run:' || s || ':' || d)::uuid, t, 'Reach out · Movers', rtpl, 'reach_hello', 'en_US',
           jsonb_build_object('kind', 'reach_out', 'root_id', ${rs(0)}, 'step_id', ${rs("s")}),
           'sent', today - d * interval '1 day' + interval '10 hours', today - d * interval '1 day' + interval '10 hours',
           0, ${rs("s")}, (today - d * interval '1 day')::date, today - d * interval '1 day' + interval '10 hours'
      from ${series(3, "s")}, ${series(100, "d")};
  insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status,
                               error, meta, created_at)
    select md5(t || ':ro:email:' || i || ':' || s)::uuid, t, md5(t || ':ro:thread:' || i)::uuid,
           ${contact("i")}, 'email', 'outbound', 'human', 'text', 'Saw your shop.',
           case when i % 20 = 19 then 'failed' when i % 20 < 16 then 'delivered' when i % 20 < 18 then 'read' else 'sent' end,
           case when i % 20 = 19 then jsonb_build_object('provider', 'bounced', 'kind', 'permanent') end,
           jsonb_build_object('source', 'reach_out',
                              'status_at', jsonb_build_object('sent', to_char(${left} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
                              'email', jsonb_build_object('message_id', '<ro-' || i || '-' || s || '@example.com>')),
           ${left}
      from ${emailed};
  insert into public.reach_out_sends (id, tenant_id, broadcast_id, playbook_id, root_id, lead_id, contact_id, state, reason,
                                      send_at, sent_at, angle, message_id)
    select md5(t || ':ro:send:' || i || ':' || s)::uuid, t, md5(t || ':ro:run:' || s || ':' || ${back})::uuid, ${rs("s")},
           ${rs(0)}, md5(t || ':ro:lead:' || i)::uuid, ${contact("i")},
           case when i % 20 = 19 then 'failed' else 'sent' end, case when i % 20 = 19 then 'bounced' end,
           ${left}, case when i % 20 <> 19 then ${left} end, 'angle_' || (i % 10), md5(t || ':ro:email:' || i || ':' || s)::uuid
      from ${emailed};
  -- One business in twenty writes back, in the thread, to the first email.
  insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status,
                               meta, created_at)
    select md5(t || ':ro:in:' || i)::uuid, t, md5(t || ':ro:thread:' || i)::uuid, ${contact("i")},
           'email', 'inbound', 'customer', 'text', 'Tell me more.', 'received',
           jsonb_build_object('email', jsonb_build_object('in_reply_to', '<ro-' || i || '-0@example.com>', 'claim', 'person')),
           today - (8 + (i % 92)) * interval '1 day' + interval '13 hours' + (i % 480) * interval '1 minute'
      from generate_series(0, ${lastBusiness}, 20) i;
  insert into public.reach_out_replies (message_id, tenant_id, conversation_id, contact_id, lead_id, lead_contact_id, claim,
                                        intent, summary)
    select md5(t || ':ro:in:' || i)::uuid, t, md5(t || ':ro:thread:' || i)::uuid, ${contact("i")},
           md5(t || ':ro:lead:' || i)::uuid, ${contact("i")}, 'person', 'question', 'Asks what it costs'
      from generate_series(0, ${lastBusiness}, 40) i;`;
}

/** The workspace's SQL, one statement. `t` is the workspace, `t0` the first run's day, `today` this UTC day's midnight. */
function worldSql(tenant, slug) {
  return `do $$
declare
  t uuid := '${tenant}';
  tpl uuid := md5('${tenant}' || ':template')::uuid;
  rtpl uuid := md5('${tenant}' || ':ro:template')::uuid;
  rsearch uuid := md5('${tenant}' || ':ro:search')::uuid;
  today timestamptz := date_trunc('day', now());
  t0 timestamptz := date_trunc('day', now()) - interval '${SCALE.runs - 1} days';
begin
  insert into public.tenants (id, slug, name, timezone) values (t, '${slug}', 'Campaigns at scale', 'UTC');${momentsSql()}${answersSql()}${reachOutSql()}
end $$`;
}

/**
 * The workspace that talks, written and analyzed as production reads it: `query` runs one statement of SQL on the stack
 * as its owner (the suites' `query()` over `supabase db query`). Returns the workspace's id; `made` is told it BEFORE
 * the build runs, so that a suite which fails at any point after still removes it: a delete by an id that does not
 * exist is a no-op, and the build is one statement, so it is atomic (all of the workspace or none).
 */
export function atScale(query, made = () => {}) {
  const tenant = crypto.randomUUID();
  made(tenant);
  query(worldSql(tenant, `campaign-scale-${tenant.slice(0, 8)}`));
  // Read on statistics that know these rows, as "a workspace that talks" reads them: asked straight after 180,000 rows
  // landed, on the statistics the suite's earlier files left, CI's member passed 8 s where the same call answered in a
  // second once analyzed (the playbook-totals suite, PR #1535's first run).
  query(
    // The sequence tables by their own names (0060): an analyze of a view analyzes nothing.
    `analyze public.messages, public.sequences, public.sequence_batches, public.sequence_sends, public.sequence_steps,
             public.conversations, public.contacts, public.events, public.decisions, public.leads, public.sequence_replies`,
  );
  return tenant;
}
