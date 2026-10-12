/**
 * The database tells each workspace what changed (decision 0019, 00265), on a real database.
 *
 * A statement on a watched table puts one notice per workspace it changed on that workspace's private topic,
 * `workspace:<id>:changes`, through realtime.send: the table and the operation, the statuses a call's or a
 * message update's statement left, and the clock it was told by (`at`, 00408), never the row.
 * The tables and events with a trigger are the ones packages/db realtime.ts lists (WATCHED), read from pg_trigger; the
 * updates that must ignore a stamp (00408) are row triggers narrowed to the columns a page draws, and every table the
 * receptionist's runtime stamp reads is on the list (0047). And Realtime lets a member listen to their workspaces'
 * topics and nobody speak on them, which is probed here as Realtime probes a join: a notice written, read back as the
 * caller.
 *
 * Everything happens in a transaction on this machine's database that never commits. Read through the CLI, as
 * sweep-registry.db.test.mjs turns a clock; SUPABASE_CLI names the binary when `supabase` is not on PATH.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite reads the local stack through the CLI"
    : false;

/** The longest statement handed over on the command line: Windows refuses one past 32 KB, and the world is longer. */
const LONGEST_ON_THE_LINE = 8_000;

function cli(args) {
  // A statement past the line's length goes by a file of its own (the CLI's --file), removed once it has run.
  const sql = args[args.length - 1];
  const file =
    sql.length > LONGEST_ON_THE_LINE ? path.join(os.tmpdir(), `told-${process.pid}-${Date.now()}.sql`) : null;
  if (file) fs.writeFileSync(file, sql);
  try {
    const r = spawnSync(CLI, ["db", "query", "--local", ...(file ? [...args.slice(0, -1), "--file", file] : args)], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
    return r;
  } finally {
    if (file) fs.rmSync(file, { force: true });
  }
}

/** One statement, and the rows it returned. */
function query(sql) {
  const r = cli(["--output-format", "json", sql]);
  if (r.status !== 0)
    throw new Error(`supabase db query exited ${r.status}: ${`${r.stderr}\n${r.stdout}`.slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

/** A transaction that never commits: `body` runs in a DO block that ends by raising what it `seen`, as hex. */
function rolledBack(body) {
  const r = cli([
    `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`,
  ]);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

/**
 * What the statements since the last step told the two workspaces, kept under `step`, then cleared for the next. The
 * next step starts with nothing told, as a transaction of its own would (the trigger tells each workspace's table and
 * event once a transaction).
 */
const told = (step) => `
  steps := steps || jsonb_build_object('${step}', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'to', case m.topic when ta then 'a' else 'b' end, 'event', m.event, 'notice', m.payload - 'id' - 'at',
             'private', m.private, 'extension', m.extension)
           order by m.topic = tb, m.payload ->> 'table', m.event, m.payload ->> 'statuses'), '[]')
      from realtime.messages m where m.topic in (ta, tb)));
  ats := ats || (select coalesce(jsonb_agg(m.payload -> 'at'), '[]')
                   from realtime.messages m where m.topic in (ta, tb) and m.event <> 'probe');
  delete from realtime.messages where topic in (ta, tb);
  perform set_config('chanlytics.workspace_told', '', true);`;

/** An inbound message on the thread in workspace a. */
const messageIn = (body) => `
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status)
    values (a, conv, ca, 'whatsapp', 'inbound', 'customer', 'text', '${body}', 'received');`;

/** An outbound message from the receptionist, in the workspace variable `tenant` on the thread `thread` with `contact`. */
const messageOut = (tenant, thread, contact, body, status) => `
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status)
    values (${tenant}, ${thread}, ${contact}, 'whatsapp', 'outbound', 'ai', 'text', '${body}', '${status}');`;

/** As Realtime probes a join: the caller's claims and the topic set, then the notice read back as them. */
const asCaller = (claims, topic) => `
  perform set_config('request.jwt.claims', ${claims}::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(${claims} ->> 'sub', ''), true);
  perform set_config('realtime.topic', ${topic}, true);
  execute 'set local role ' || (${claims} ->> 'role');`;

const member = (uid, aal = "aal1") => `jsonb_build_object('sub', ${uid}, 'role', 'authenticated', 'aal', '${aal}')`;

let seen;
/** Written, told and probed once for every test. */
function world() {
  seen ??= rolledBack(`
    declare
      a uuid; b uuid; ta text; tb text; ca uuid; cb uuid; conv uuid; conv_b uuid; seg_a uuid; seg_b uuid; tpl uuid;
      member_a uuid := gen_random_uuid(); viewer_a uuid := gen_random_uuid(); partner_a uuid := gen_random_uuid();
      member_b uuid := gen_random_uuid(); probe_a uuid; probe_b uuid; n integer; spoke boolean; tr record;
      steps jsonb := '{}'; reads jsonb := '{}'; misfired jsonb := '[]'; ats jsonb := '[]';
      began text := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    begin
      insert into public.tenants (slug, name) values ('told-a-' || gen_random_uuid(), 'Told A') returning id into a;
      insert into public.tenants (slug, name) values ('told-b-' || gen_random_uuid(), 'Told B') returning id into b;
      ta := 'workspace:' || a || ':changes';
      tb := 'workspace:' || b || ':changes';
      insert into public.contacts (tenant_id) values (a) returning id into ca;
      insert into public.contacts (tenant_id) values (b) returning id into cb;
      delete from realtime.messages where topic in (ta, tb);

      insert into public.conversations (tenant_id, contact_id) values (a, ca) returning id into conv;
      ${told("thread_started")}

      ${messageIn("Is Saturday open?")}
      ${told("message_in")}

      update public.messages set status = 'read' where conversation_id = conv;
      delete from public.messages where conversation_id = conv;
      ${told("message_read_and_removed")}

      -- A send's life in workspace a, and a send in b left where it was: the ticks, a failure, and a word on it later.
      insert into public.conversations (tenant_id, contact_id) values (b, cb) returning id into conv_b;
      ${messageOut("a", "conv", "ca", "We open at nine", "queued")}
      ${messageOut("b", "conv_b", "cb", "We open at ten", "queued")}
      ${told("sends_queued")}

      update public.messages set status = 'sent' where tenant_id = a;
      ${told("one_send_left")}

      update public.messages set status = 'delivered' where tenant_id in (a, b);
      ${told("a_receipt_for_each_workspace")}

      ${messageOut("a", "conv", "ca", "Your slot is gone", "failed")}
      ${told("a_send_failed")}
      update public.messages set error = jsonb_build_object('detail', 'not on whatsapp') where tenant_id = a and status = 'failed';
      ${told("the_failure_explained_later")}

      update public.messages set meta = meta || '{"stamped": true}' where tenant_id = a;
      ${told("two_statuses_in_one_statement")}

      ${messageIn("A stamp will follow")}
      ${told("message_in_before_its_stamp")}
      update public.messages set meta = meta || '{"processed_at": "2026-10-05T10:00:00Z"}' where direction = 'inbound' and tenant_id = a;
      ${told("an_arrival_stamped")}

      -- One transaction: a receipt and the same status again is told once, a failure's own word apart.
      update public.messages set status = 'read' where tenant_id = a and status = 'delivered';
      update public.messages set meta = meta || '{"again": true}' where tenant_id = a and status = 'read';
      update public.messages set meta = meta || '{"again": true}' where tenant_id = a and status = 'failed';
      ${told("receipts_in_one_transaction")}

      delete from public.messages where tenant_id in (a, b);
      ${told("messages_removed")}

      insert into public.calls (tenant_id, retell_call_id, status) values
        (a, 'told-1', 'ongoing'), (a, 'told-2', 'ongoing'), (b, 'told-3', 'registered');
      ${told("calls_started")}

      update public.calls set status = case when retell_call_id = 'told-1' then 'ended' else status end where tenant_id = a;
      ${told("one_call_ended")}

      delete from public.calls where tenant_id in (a, b);
      ${told("calls_removed")}

      insert into public.segments (tenant_id, name) values (a, 'Regulars') returning id into seg_a;
      insert into public.segments (tenant_id, name) values (b, 'Regulars') returning id into seg_b;
      insert into public.contacts (tenant_id) select t.w from generate_series(1, 249) cross join (values (a), (b)) as t(w);
      ${told("lists_made")}

      insert into public.segment_members (segment_id, contact_id, tenant_id)
        select case c.tenant_id when a then seg_a else seg_b end, c.id, c.tenant_id
          from public.contacts c where c.tenant_id in (a, b);
      steps := steps || jsonb_build_object('listed_count', (select count(*) from public.segment_members where segment_id in (seg_a, seg_b)));
      ${told("five_hundred_listed")}

      delete from public.segment_members where segment_id in (seg_a, seg_b);
      ${told("five_hundred_unlisted")}

      insert into public.person_notes (tenant_id, contact_id, body) values (b, cb, 'Prefers mornings');
      ${told("note_made")}
      delete from public.person_notes where tenant_id = b;
      ${told("note_removed")}

      -- A playbook made, paused and removed by a teammate (00376): Campaigns' rows and acts repaint. Its template is
      -- told on its own account (00408).
      insert into public.templates (tenant_id, channel, name, language, meta_status)
        values (a, 'whatsapp', 'told_offer', 'en_US', 'approved') returning id into tpl;
      ${told("template_made")}
      insert into public.playbooks (tenant_id, name, trigger, template_id, template_name, template_language, policy_class)
        values (a, 'Win-back', 'quiet_30', tpl, 'told_offer', 'en_US', 'reengage');
      ${told("playbook_made")}
      update public.playbooks set state = 'paused' where tenant_id = a;
      ${told("playbook_paused")}
      delete from public.playbooks where tenant_id = a;
      ${told("playbook_removed")}

      -- The records that were silent (00408), each told to its workspace alone: the table and the event, never the row.
      -- A person. A message's stamp on last_seen_at is no change a page draws; a name is; the same name again is not.
      update public.contacts set last_seen_at = now() where id = ca;
      ${told("a_person_seen_again")}
      update public.contacts set display_name = 'Ana' where id = ca;
      ${told("a_person_named")}
      update public.contacts set display_name = 'Ana' where id = ca;
      ${told("the_same_name_written_again")}
      -- One transaction: a person made (a statement trigger) and two of them changed (a row trigger) tell a workspace's
      -- table and event once each, and the other workspace's own change is told to it.
      insert into public.contacts (tenant_id) values (a);
      update public.contacts set display_name = 'Ana Two', dnc = true where id = ca;
      update public.contacts set email = 'ana@example.com' where id = ca;
      update public.contacts set display_name = 'Ben' where id = cb;
      ${told("people_made_and_changed_in_one_transaction")}

      -- The settings. Told when the version moved; the hourly stamp on calendar_checked_at moves none.
      update public.tenant_config set calendar_checked_at = now() where tenant_id = a;
      ${told("the_calendar_stamped")}
      update public.tenant_config set config = config || '{"told": true}' where tenant_id = a;
      ${told("settings_saved")}
      update public.tenant_config set config = config || '{"told": true}' where tenant_id = a;
      ${told("the_same_settings_saved_again")}

      -- The rules: one statement over two workspaces tells each; a rule for one person is made and removed.
      update public.policies set mode = 'ask' where class = 'reply' and subject_type is null and tenant_id in (a, b);
      ${told("the_rules_changed")}
      insert into public.policies (tenant_id, class, mode, subject_type, subject_id) values (a, 'faq', 'ask', 'contact', ca);
      ${told("a_rule_made_for_one_person")}
      delete from public.policies where tenant_id = a and subject_id = ca;
      ${told("a_rule_for_one_person_removed")}

      -- A template. Meta's answer is told; a sync's stamp is not; a hide is; a removal is.
      update public.templates set meta_status = 'rejected', rejected_reason = 'INVALID_FORMAT' where id = tpl;
      ${told("a_template_rejected")}
      update public.templates set synced_at = now() where id = tpl;
      ${told("a_template_synced")}
      update public.templates set meta_status = 'rejected' where id = tpl;
      ${told("the_same_status_written_again")}
      update public.templates set hidden_at = now() where id = tpl;
      ${told("a_template_hidden")}
      delete from public.templates where id = tpl;
      ${told("a_template_removed")}

      -- The mailbox. Its pause on offers is told, and its end; the mail it receives is not.
      insert into public.mailboxes (tenant_id, local_part, reply_token, from_name)
        values (a, 'told-' || left(md5(random()::text), 12), translate(left(md5(random()::text), 24), '0123456789', 'ghijklmnop'), 'Told A');
      ${told("a_mailbox_made")}
      update public.mailboxes set last_received_at = now() where tenant_id = a;
      ${told("a_mailbox_received_mail")}
      update public.mailboxes set offers_paused_at = now(), offers_paused_reason = 'bounces' where tenant_id = a;
      ${told("offers_paused")}
      update public.mailboxes set offers_paused_at = null, offers_paused_reason = null, offers_resumed_at = now() where tenant_id = a;
      ${told("offers_resumed")}

      -- A booking email the reader held for a look, then settled.
      insert into public.appointment_notices (tenant_id, notice_id, tool, received_at, outcome, hold_reason)
        values (a, 'told-notice', 'a_booking_tool', now(), 'held', 'unreadable');
      ${told("a_booking_email_held")}
      update public.appointment_notices set outcome = 'dismissed', hold_reason = 'not_a_booking' where tenant_id = a;
      ${told("a_booking_email_settled")}

      -- One transaction: a loop of statements, as the lead finder's commits are, tells each workspace once.
      for n in 1..100 loop
        ${messageIn("one of a hundred")}
      end loop;
      insert into public.calls (tenant_id, retell_call_id, status) values (a, 'told-4', 'ongoing');
      update public.calls set status = 'ongoing' where retell_call_id = 'told-4';
      update public.calls set status = 'ongoing' where retell_call_id = 'told-4';
      update public.calls set status = 'ended' where retell_call_id = 'told-4';
      ${told("one_transaction")}

      begin
        ${messageIn("never sent")}
        raise exception 'rolled back';
      exception when raise_exception then
        null;
      end;
      ${told("rolled_back")}

      begin
        ${messageIn("never sent either")}
        raise exception 'rolled back';
      exception when raise_exception then
        null;
      end;
      ${messageIn("sent after the savepoint went back")}
      ${told("told_after_a_rollback")}

      -- Every trigger, fired by a statement that changes no row: each table's runs, and tells nobody. A workspace's own
      -- row (tenants) names its workspace by its id.
      for tr in
        select c.relname as tbl, t.tgname, case when c.relname = 'tenants' then 'id' else 'tenant_id' end as workspace,
               case when t.tgtype & 4 > 0 then 'insert' when t.tgtype & 8 > 0 then 'delete' else 'update' end as ev
          from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where t.tgname like 'workspace_tell_%' and not t.tgisinternal
      loop
        begin
          execute case tr.ev
            when 'insert' then format('insert into public.%I (%I) select %I from public.%I where false', tr.tbl, tr.workspace, tr.workspace, tr.tbl)
            when 'update' then format('update public.%I set %I = %I where false', tr.tbl, tr.workspace, tr.workspace)
            else format('delete from public.%I where false', tr.tbl) end;
        exception when others then
          misfired := misfired || jsonb_build_array(tr.tbl || '.' || tr.tgname || ': ' || sqlerrm);
        end;
      end loop;
      steps := steps || jsonb_build_object('misfired', misfired);
      ${told("nothing_changed")}

      insert into auth.users (id) values (member_a), (viewer_a), (partner_a), (member_b);
      insert into public.memberships (user_id, tenant_id, role) values
        (member_a, a, 'operator'), (viewer_a, a, 'viewer'), (partner_a, a, 'partner'), (member_b, b, 'owner');
      ${told("seats_taken")}
      insert into realtime.messages (topic, extension, event, payload, private)
        values (ta, 'broadcast', 'probe', '{}', true) returning id into probe_a;
      insert into realtime.messages (topic, extension, event, payload, private)
        values (tb, 'broadcast', 'probe', '{}', true) returning id into probe_b;
      for tr in
        select * from (values
          ('member_own', ${member("member_a")}, ta, probe_a),
          ('member_other', ${member("member_a")}, tb, probe_b),
          ('member_other_own', ${member("member_b")}, tb, probe_b),
          ('member_other_asks_for_a_as_b', ${member("member_b")}, tb, probe_a),
          ('viewer_own', ${member("viewer_a")}, ta, probe_a),
          ('partner_first_factor', ${member("partner_a")}, ta, probe_a),
          ('partner_second_factor', ${member("partner_a", "aal2")}, ta, probe_a),
          ('anon', jsonb_build_object('role', 'anon'), ta, probe_a)
        ) as p(who, claims, topic, probe)
      loop
        ${asCaller("tr.claims", "tr.topic")}
        select count(*) into n from realtime.messages m where m.id = tr.probe;
        reset role;
        reads := reads || jsonb_build_object(tr.who, n = 1);
      end loop;

      ${asCaller(member("member_a"), "ta")}
      begin
        insert into realtime.messages (topic, extension, event, payload, private)
          values (ta, 'broadcast', 'UPDATE', '{"table": "deals"}', true);
        spoke := true;
      exception when insufficient_privilege then
        spoke := false;
      end;
      reset role;
      reads := reads || jsonb_build_object('member_speaks', spoke);
      ${told("probes")}

      -- The team and the workspace's own row (00408): a seat's role is told, the member's own saved views are not; an
      -- invitation sent and accepted, a seat left, a workspace paused.
      update public.memberships set views = '{"people": {"sortBy": "name"}}' where user_id = member_a;
      ${told("a_member_saved_their_own_views")}
      update public.memberships set role = 'viewer' where user_id = member_a and tenant_id = a;
      ${told("a_role_changed")}
      update public.memberships set role = 'viewer' where user_id = member_a and tenant_id = a;
      ${told("the_same_role_written_again")}
      insert into public.invitations (tenant_id, email, role) values (a, 'new-teammate@example.com', 'viewer');
      ${told("a_teammate_invited")}
      update public.invitations set accepted_at = now() where tenant_id = a;
      ${told("an_invitation_accepted")}
      delete from public.invitations where tenant_id = a;
      ${told("an_invitation_removed")}
      delete from public.memberships where user_id = viewer_a;
      ${told("a_seat_left")}
      update public.tenants set name = 'Told A, renamed' where id = a;
      ${told("the_workspace_renamed")}
      update public.tenants set status = 'paused' where id = a;
      ${told("the_workspace_paused")}
      update public.tenants set status = 'paused' where id = a;
      ${told("the_workspace_paused_again")}

      seen := jsonb_build_object(
        'steps', steps, 'reads', reads, 'ats', ats, 'began', began,
        'ended', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end;
  `);
  return seen;
}

/**
 * The column a trigger's notice is judged by, as pg_trigger keeps its argument: a call's every event, and a message's
 * update alone (an arrival names no status, and its notice is the one every tab heard before the update was told).
 */
const judgedBy = (tbl, event) => (tbl === "calls" || (tbl === "messages" && event === "UPDATE") ? "status\\000" : "");

const notice = (to, event, table, statuses) => ({
  to,
  event,
  notice: { op: event, table, ...(statuses ? { statuses } : {}) },
  private: true,
  extension: "broadcast",
});

/**
 * The updates told only when a column a page draws holds something else than it did (00408), and the columns each is
 * narrowed to: a row trigger, AFTER UPDATE OF them, WHEN one is distinct. A column added here is a decision about what
 * a page draws. `null` is a table with no list: the settings are told when their version moved, whatever was named.
 */
const NARROWED = {
  contacts: [
    "display_name",
    "wa_profile_name",
    "phone_e164",
    "email",
    "notes",
    "proposal_url",
    "consent",
    "consent_source",
    "consent_updated_at",
    "dnc",
    "marketing_consent",
    "marketing_consent_source",
    "marketing_consent_updated_at",
    "email_marketing",
    "email_marketing_source",
    "email_marketing_updated_at",
    "consent_channels",
    "marketing_channels",
    "email_suppressed_at",
    "email_suppressed_reason",
    "merged_into_contact_id",
    "erased_at",
  ],
  tenant_config: null,
  templates: [
    "meta_status",
    "rejected_reason",
    "quality",
    "category",
    "hidden_at",
    "title",
    "body_preview",
    "components",
    "variables",
  ],
  mailboxes: ["offers_paused_at", "offers_paused_reason", "offers_resumed_at"],
  memberships: ["role"],
  tenants: ["status"],
};

test(
  "the tables and events with a trigger are the ones the live feed lists: a statement's, after it, or a narrowed update's, per row",
  { skip },
  async () => {
    const { watchedEvents } = await import(pathToFileURL(path.join(ROOT, "packages/db/src/realtime.ts")).href);
    const triggers = query(`
    select c.relname as tbl,
           case when t.tgtype & 4 > 0 then 'INSERT' when t.tgtype & 16 > 0 then 'UPDATE' else 'DELETE' end as event,
           p.proname::text as fn,
           t.tgtype & 1 > 0 as per_row,
           t.tgtype & 2 = 0 and t.tgtype & 64 = 0 as after_it,
           coalesce(t.tgnewtable, t.tgoldtable) as transition,
           encode(t.tgargs, 'escape') as args,
           t.tgqual is not null as has_when,
           (select array_agg(a.attname::text order by a.attname) from unnest(t.tgattr::int2[]) as k
              join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = k) as cols
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           join pg_proc p on p.oid = t.tgfoid
     where n.nspname = 'public' and t.tgname like 'workspace_tell_%' and not t.tgisinternal
       and t.tgfoid in ('public.workspace_tell_changes()'::regprocedure, 'public.workspace_tell_row_change()'::regprocedure)
     order by c.relname, case when t.tgtype & 4 > 0 then 1 when t.tgtype & 16 > 0 then 2 else 3 end`);
    const events = new Map();
    for (const t of triggers) events.set(t.tbl, [...(events.get(t.tbl) ?? []), t.event]);
    const inDatabase = [...events].map(([table, told]) => ({ table, events: told }));
    const listed = [...watchedEvents()].sort((x, y) => x.table.localeCompare(y.table));
    assert.deepEqual(inDatabase, listed, "a table joins the live feed with its trigger, in one change");
    for (const t of triggers) {
      const where = `${t.tbl} ${t.event}`;
      assert.equal(t.after_it, true, `${where}: after the change`);
      if (t.event === "UPDATE" && t.tbl in NARROWED) {
        assert.equal(t.fn, "workspace_tell_row_change", `${where}: told by the row function`);
        assert.equal(t.per_row, true, `${where}: per row, the only trigger that can see which columns moved`);
        assert.equal(t.has_when, true, `${where}: told when a value is distinct, not when a column is named`);
        assert.deepEqual(t.cols, NARROWED[t.tbl] && [...NARROWED[t.tbl]].sort(), `${where}: the columns a page draws`);
        assert.equal(t.args, "", `${where}: no column its changes are judged by`);
        continue;
      }
      assert.equal(t.fn, "workspace_tell_changes", `${where}: told by the statement function`);
      assert.equal(t.per_row, false, `${where}: after each statement, not each row`);
      assert.equal(t.transition, "changed", `${where}: reads the rows its statement changed`);
      assert.equal(t.has_when, false, `${where}: every change of it is told`);
      assert.equal(t.cols, null, `${where}: no column list`);
      assert.equal(t.args, judgedBy(t.tbl, t.event), `${where}: the column its changes are judged by`);
    }
  },
);

test("the live feed tells of every table the receptionist's runtime stamp reads (0047)", { skip }, async () => {
  const { watchedEvents } = await import(pathToFileURL(path.join(ROOT, "packages/db/src/realtime.ts")).href);
  const [{ def }] = query(`select pg_get_functiondef('public.runtime_stamp(uuid)'::regprocedure) as def`);
  // The stamp's own text: the tables it selects from, its comments set aside.
  const read = [...def.replace(/--[^\n]*/g, "").matchAll(/\b(?:from|join)\s+(?:public\.)?([a-z_]+)/gi)].map((m) =>
    m[1].toLowerCase(),
  );
  const stamped = [...new Set(read)].sort();
  for (const table of ["tenant_config", "policies", "tenants", "tenant_channels", "google_listings", "lines"])
    assert.ok(stamped.includes(table), `the scan found ${table} in the stamp (${stamped.join(", ")})`);
  const told = new Map(watchedEvents().map((w) => [w.table, w.events]));
  for (const table of stamped) {
    assert.ok(told.has(table), `${table}: the stamp reads it and the live feed does not tell of it`);
    // A stamp moves on a row changed (a version, an updated_at, a status), so an update must be among the events.
    assert.ok(told.get(table).includes("UPDATE"), `${table}: told of its updates, which are what move the stamp`);
  }
});

test("every trigger runs on its table, and a statement that changes nothing tells nobody", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(steps.misfired, []);
  assert.deepEqual(steps.nothing_changed, []);
});

test(
  "a thread started and a message in are told to their workspace alone, as the table and the event",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.thread_started, [notice("a", "INSERT", "conversations")]);
    assert.deepEqual(
      steps.message_in.filter((n) => n.notice.table === "messages"),
      [notice("a", "INSERT", "messages")],
    );
    assert.deepEqual(
      steps.message_in.filter((n) => n.to === "b"),
      [],
      "the other workspace hears nothing",
    );
  },
);

test("a message is told when it arrives and when its status moves, not when it is removed", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(
    steps.message_read_and_removed.filter((n) => n.notice.table === "messages"),
    [notice("a", "UPDATE", "messages", ["read"])],
    "the update that read it is told, with the status it left; its delete is not",
  );
});

const ofMessages = (told) => told.filter((n) => n.notice.table === "messages");

test("a send's status moving is told to its workspace alone, with the status it left (00327)", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(ofMessages(steps.sends_queued), [
    notice("a", "INSERT", "messages"),
    notice("b", "INSERT", "messages"),
  ]);
  assert.deepEqual(steps.one_send_left, [notice("a", "UPDATE", "messages", ["sent"])]);
  assert.deepEqual(
    steps.one_send_left.filter((n) => n.to === "b"),
    [],
    "the other workspace's queued send moved nowhere, and hears nothing",
  );
  assert.deepEqual(ofMessages(steps.a_receipt_for_each_workspace), [
    notice("a", "UPDATE", "messages", ["delivered"]),
    notice("b", "UPDATE", "messages", ["delivered"]),
  ]);
});

test("a failure is told with its status, and a word written to it later says failed again", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(ofMessages(steps.a_send_failed), [notice("a", "INSERT", "messages")]);
  assert.deepEqual(ofMessages(steps.the_failure_explained_later), [notice("a", "UPDATE", "messages", ["failed"])]);
  assert.deepEqual(
    ofMessages(steps.two_statuses_in_one_statement),
    [notice("a", "UPDATE", "messages", ["delivered", "failed"])],
    "one statement over a delivered send and a failed one: one notice, both statuses",
  );
});

test("an arrival's meta stamped after the fact is told as received, which no tick follows", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(ofMessages(steps.message_in_before_its_stamp), [notice("a", "INSERT", "messages")]);
  assert.deepEqual(ofMessages(steps.an_arrival_stamped), [notice("a", "UPDATE", "messages", ["received"])]);
});

test(
  "a transaction tells a message's status once, and each other status a statement leaves; a delete tells nothing",
  {
    skip,
  },
  () => {
    const { steps } = world();
    assert.deepEqual(ofMessages(steps.receipts_in_one_transaction), [
      notice("a", "UPDATE", "messages", ["failed"]),
      notice("a", "UPDATE", "messages", ["read"]),
    ]);
    assert.deepEqual(ofMessages(steps.messages_removed), []);
  },
);

test(
  "a call's notice carries its statuses: one statement ending one call and leaving another on carries both",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.calls_started, [
      notice("a", "INSERT", "calls", ["ongoing"]),
      notice("b", "INSERT", "calls", ["registered"]),
    ]);
    assert.deepEqual(steps.one_call_ended, [notice("a", "UPDATE", "calls", ["ended", "ongoing"])]);
  },
);

test("a delete is told to the workspace it happened in", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(steps.calls_removed, [
    notice("a", "DELETE", "calls", ["ended", "ongoing"]),
    notice("b", "DELETE", "calls", ["registered"]),
  ]);
  assert.deepEqual(steps.note_removed, [notice("b", "DELETE", "person_notes")]);
});

test(
  "a playbook made, paused or removed is told to its workspace alone: the table and the event, never the row (00376)",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(
      steps.template_made,
      [notice("a", "INSERT", "templates")],
      "its template is told on its own (00408)",
    );
    assert.deepEqual(steps.playbook_made, [notice("a", "INSERT", "playbooks")]);
    assert.deepEqual(steps.playbook_paused, [notice("a", "UPDATE", "playbooks")]);
    assert.deepEqual(steps.playbook_removed, [notice("a", "DELETE", "playbooks")]);
  },
);

test(
  "a person made or changed is told to its workspace: a name, an answer and an address are, a message's stamp is not (00408)",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.a_person_seen_again, [], "last_seen_at is a stamp every message puts on a person");
    assert.deepEqual(steps.a_person_named, [notice("a", "UPDATE", "contacts")]);
    assert.deepEqual(steps.the_same_name_written_again, [], "a column named and written as it was tells nothing");
    assert.deepEqual(
      steps.people_made_and_changed_in_one_transaction,
      [notice("a", "INSERT", "contacts"), notice("a", "UPDATE", "contacts"), notice("b", "UPDATE", "contacts")],
      "a person made and three changes: each workspace's table and event once, the other workspace told of its own",
    );
  },
);

test(
  "the settings saved are told when their version moved, and the hourly calendar stamp is not (00408)",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.the_calendar_stamped, [], "calendar_checked_at moves no version");
    assert.deepEqual(steps.settings_saved, [notice("a", "UPDATE", "tenant_config")]);
    assert.deepEqual(steps.the_same_settings_saved_again, [], "a save that changes nothing takes no version");
  },
);

test("the rules changed are told to each workspace they changed in, a person's own rule too (00408)", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(steps.the_rules_changed, [notice("a", "UPDATE", "policies"), notice("b", "UPDATE", "policies")]);
  assert.deepEqual(steps.a_rule_made_for_one_person, [notice("a", "INSERT", "policies")]);
  assert.deepEqual(steps.a_rule_for_one_person_removed, [notice("a", "DELETE", "policies")]);
});

test(
  "a template's status, rejection and visibility are told, a sync's stamp is not, and its removal is (00408)",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.a_template_rejected, [notice("a", "UPDATE", "templates")]);
    assert.deepEqual(steps.a_template_synced, [], "synced_at is stamped on every template by every sync");
    assert.deepEqual(steps.the_same_status_written_again, []);
    assert.deepEqual(steps.a_template_hidden, [notice("a", "UPDATE", "templates")]);
    assert.deepEqual(steps.a_template_removed, [notice("a", "DELETE", "templates")]);
  },
);

test(
  "a pause on offers by email and its end are told; a mailbox made and the mail it receives are not (00408)",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.a_mailbox_made, []);
    assert.deepEqual(steps.a_mailbox_received_mail, []);
    assert.deepEqual(steps.offers_paused, [notice("a", "UPDATE", "mailboxes")]);
    assert.deepEqual(steps.offers_resumed, [notice("a", "UPDATE", "mailboxes")]);
  },
);

test("a booking email held for a look, and settled, is told to its workspace (00408)", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(steps.a_booking_email_held, [notice("a", "INSERT", "appointment_notices")]);
  assert.deepEqual(steps.a_booking_email_settled, [notice("a", "UPDATE", "appointment_notices")]);
});

test(
  "a seat taken, a role changed, an invitation sent and accepted and a seat left are told; a member's own views are not (00408)",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.seats_taken, [notice("a", "INSERT", "memberships"), notice("b", "INSERT", "memberships")]);
    assert.deepEqual(steps.a_member_saved_their_own_views, [], "views change with every sort a member presses");
    assert.deepEqual(steps.a_role_changed, [notice("a", "UPDATE", "memberships")]);
    assert.deepEqual(steps.the_same_role_written_again, []);
    assert.deepEqual(steps.a_teammate_invited, [notice("a", "INSERT", "invitations")]);
    assert.deepEqual(steps.an_invitation_accepted, [notice("a", "UPDATE", "invitations")]);
    assert.deepEqual(steps.an_invitation_removed, [notice("a", "DELETE", "invitations")]);
    assert.deepEqual(
      steps.a_seat_left.filter((n) => n.notice.table === "memberships"),
      [notice("a", "DELETE", "memberships")],
    );
  },
);

test(
  "a workspace's status moving is told to it; its name changing, or the same status again, is not (00408)",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.the_workspace_renamed, []);
    assert.deepEqual(steps.the_workspace_paused, [notice("a", "UPDATE", "tenants")]);
    assert.deepEqual(steps.the_workspace_paused_again, []);
  },
);

test("every notice carries the clock it was told by: UTC to the millisecond, within the run (00408)", { skip }, () => {
  const { ats, began, ended } = world();
  assert.ok(ats.length >= 30, `a run of this many notices (${ats.length}) all carry one`);
  for (const at of ats) {
    assert.match(String(at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "ISO 8601, UTC, to the millisecond");
    assert.equal(new Date(at).toISOString(), at, "a time a browser reads back as it was written");
    assert.ok(at >= began && at <= ended, `${at} lies between the run's start ${began} and its end ${ended}`);
  }
});

test("one statement over 500 rows of two workspaces puts one notice on each", { skip }, () => {
  const { steps } = world();
  assert.equal(steps.listed_count, 500);
  assert.deepEqual(steps.five_hundred_listed, [
    notice("a", "INSERT", "segment_members"),
    notice("b", "INSERT", "segment_members"),
  ]);
  assert.deepEqual(steps.five_hundred_unlisted, [
    notice("a", "DELETE", "segment_members"),
    notice("b", "DELETE", "segment_members"),
  ]);
  assert.deepEqual(steps.lists_made, [
    notice("a", "INSERT", "contacts"),
    notice("a", "INSERT", "segments"),
    notice("b", "INSERT", "contacts"),
    notice("b", "INSERT", "segments"),
  ]);
});

test("a write that rolls back tells nothing, and takes back the memory of having told", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(steps.rolled_back, []);
  assert.deepEqual(steps.told_after_a_rollback, [notice("a", "INSERT", "messages")]);
});

test(
  "a transaction tells each workspace's table and event once, and a call's statuses each time they differ",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.note_made, [notice("b", "INSERT", "person_notes")]);
    assert.deepEqual(steps.one_transaction, [
      notice("a", "INSERT", "calls", ["ongoing"]),
      notice("a", "UPDATE", "calls", ["ended"]),
      notice("a", "UPDATE", "calls", ["ongoing"]),
      notice("a", "INSERT", "messages"),
    ]);
  },
);

test(
  "a member listens to their workspace's topic and no other's; a viewer does; a partner only with the second factor",
  { skip },
  () => {
    const { reads } = world();
    assert.deepEqual(reads.member_own, true);
    assert.deepEqual(reads.member_other, false, "another workspace's topic is not theirs");
    assert.deepEqual(reads.member_other_own, true);
    assert.deepEqual(
      reads.member_other_asks_for_a_as_b,
      false,
      "the topic asked is the one admitted, never another's notice",
    );
    assert.deepEqual(reads.viewer_own, true);
    assert.deepEqual(
      reads.partner_first_factor,
      false,
      "a partner's seat without its second factor hears nothing (00218)",
    );
    assert.deepEqual(reads.partner_second_factor, true);
    assert.deepEqual(reads.anon, false);
  },
);

test("nobody may speak on a workspace's topic, not even its member", { skip }, () => {
  const { reads } = world();
  assert.equal(reads.member_speaks, false);
});
