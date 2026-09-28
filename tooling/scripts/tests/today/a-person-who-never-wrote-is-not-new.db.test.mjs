/**
 * A person who has never written or phoned is not new (00231), on a real database.
 *
 * Today's "new people" is metrics_summary's count of the people whose first word or call falls in the window. A person
 * with neither used to score 'infinity', after every window's start, so everyone the calendar, a lead, a teammate or
 * an import added before they said a word was new on Today every day, and the list the figure opens (People's New this
 * week) never had them. Here a workspace holds one person who wrote now, one who wrote ten days ago, one imported a
 * hundred days ago who never wrote or phoned, and one the calendar added today who has not written yet: today and this
 * week each count the one who wrote now, and people_list gives the two who never wrote no first contact either.
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

test(
  "Today counts as new only the people whose first word or call is in the window, never one who has had neither",
  { skip },
  () => {
    const seen = rolledBack(`
    declare
      t uuid; cid uuid; conv uuid;
    begin
      insert into public.tenants (slug, name) values ('never-wrote-' || gen_random_uuid(), 'Never wrote') returning id into t;
      -- One who wrote now, and one who wrote ten days ago.
      insert into public.contacts (tenant_id, display_name) values (t, 'Wrote now') returning id into cid;
      insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;
      insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, channel_ts)
        values (t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'hello', 'received', now());
      insert into public.contacts (tenant_id, display_name, created_at)
        values (t, 'Wrote ten days ago', now() - interval '10 days') returning id into cid;
      insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;
      insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, channel_ts, created_at)
        values (t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'hello', 'received',
                now() - interval '10 days', now() - interval '10 days');
      -- One imported a hundred days ago, and one the calendar added today: neither has written or phoned.
      insert into public.contacts (tenant_id, display_name, created_at)
        values (t, 'Imported', now() - interval '100 days') returning id into cid;
      insert into public.events (tenant_id, kind, subject_type, subject_id, data, created_at)
        values (t, 'contact.added', 'contact', cid, '{"source": "import"}', now() - interval '100 days');
      insert into public.contacts (tenant_id, display_name) values (t, 'Booked') returning id into cid;
      insert into public.events (tenant_id, kind, subject_type, subject_id, data)
        values (t, 'contact.added', 'contact', cid, '{"source": "calendar"}');
      seen := jsonb_build_object(
        'today', (public.metrics_summary(t, 1))->'period'->'new_contacts',
        'week', (public.metrics_summary(t, 7))->'period'->'new_contacts',
        'first_contacts', (select jsonb_object_agg(l.display_name, l.first_contact_at is not null) from public.people_list(t) l));
    end;
  `);
    assert.equal(seen.today, 1, "today: the one who wrote now");
    assert.equal(seen.week, 1, "this week: the one who wrote now, not the one ten days ago");
    assert.deepEqual(
      seen.first_contacts,
      { "Wrote now": true, "Wrote ten days ago": true, Imported: false, Booked: false },
      "People gives the two who never wrote no first contact either",
    );
  },
);
