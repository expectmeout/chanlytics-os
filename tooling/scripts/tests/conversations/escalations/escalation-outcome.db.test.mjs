/**
 * How a hold lands, and why the difference is worth a word -- on a real database.
 *
 * A thread has exactly ONE open escalation (`escalations_one_open`, 00004), so a
 * second reason does not queue behind the first: it replaces it. Every caller
 * that alerts a person alerts on `opened`, which means that for as long as the
 * outcome could only be "opened" or "refreshed", a thread already waiting for
 * one reason went silent when the reason changed to another. An email arriving
 * on a thread held for the carriers is how that was noticed; it was never an
 * email bug.
 *
 * What the unique index does under a concurrent insert is the whole mechanism,
 * so this belongs against Postgres rather than a double. Skipped without a
 * local database.
 *
 * The last two cases put a ledger that refuses the row on `events`, inside a transaction that never commits (through
 * the CLI, as team-changes-and-their-audit.db.test.mjs does for `decisions`; SUPABASE_CLI names the binary when
 * `supabase` is not on PATH): the change event's trap lets the change land without it (00308), and the door refuses a
 * hold whose escalation.opened the ledger refused (00380).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
const { upsertEscalation } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);

let db;
let tenantId;
const stamp = Date.now().toString(36);

/** A person with a thread of their own, so the one-open-row rule is never contended across cases. */
async function thread(tag) {
  const { data: contact, error: cErr } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+1646${String(Date.now()).slice(-7)}${tag}` })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);
  const { data: conv, error: vErr } = await db
    .from("conversations")
    .insert({ tenant_id: tenantId, contact_id: contact.id })
    .select("id")
    .single();
  if (vErr) throw new Error(vErr.message);
  return conv.id;
}
const openRow = async (id) => {
  const { data } = await db
    .from("escalations")
    .select("reason, details, state")
    .eq("conversation_id", id)
    .eq("state", "open")
    .maybeSingle();
  return data;
};

/**
 * A transaction on this machine's database that never commits (as sweep-registry.db.test.mjs runs one): `body` runs in
 * a DO block that ends by raising what it `seen`, so everything it did, the trigger it made included, goes with it.
 */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (/not_this_database/.test(said))
    throw new Error(
      "the CLI reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `escalation-outcome-${stamp}`, name: "escalation-outcome" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip) return;
  // The ledger has no foreign key to a workspace, so a change event would outlive it (00308).
  if (tenantId) {
    await db.from("events").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
});

test(
  "a hold says whether it is new, the same one again, or a different reason wearing the same row",
  { skip },
  async () => {
    const id = await thread("1");
    assert.equal(
      await upsertEscalation(db, tenantId, id, "carriers", "The line is not approved for texting yet."),
      "opened",
    );

    // The same reason, said again with newer words: the thread is already in
    // somebody's queue for this, and telling them twice is noise.
    assert.equal(await upsertEscalation(db, tenantId, id, "carriers", "Still waiting on the carriers."), "refreshed");
    assert.deepEqual(
      await openRow(id),
      { reason: "carriers", details: "Still waiting on the carriers.", state: "open" },
      "the words move, the reason does not",
    );

    // A DIFFERENT reason. There is one open row, so this one replaces what the
    // thread was waiting for -- and a caller that only speaks on "opened" would
    // have said nothing at all about it.
    assert.equal(await upsertEscalation(db, tenantId, id, "email_review", "An email arrived."), "changed");
    assert.deepEqual(await openRow(id), { reason: "email_review", details: "An email arrived.", state: "open" });

    // And back again is a change too: it is the reason that decides, never the order.
    assert.equal(await upsertEscalation(db, tenantId, id, "carriers", "The carriers again."), "changed");

    const { count } = await db
      .from("escalations")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", id);
    assert.equal(count, 1, "one row throughout: this is a replacement, not a queue");
    const row = (await db.from("escalations").select("id, resolved_at").eq("conversation_id", id).single()).data;
    assert.equal(row.resolved_at, null, "still open");
    const { data: changes } = await db
      .from("events")
      .select("subject_id, data")
      .eq("tenant_id", tenantId)
      .eq("kind", "escalation.changed")
      .eq("subject_id", row.id)
      .order("created_at");
    assert.deepEqual(
      changes.map((c) => c.data),
      [
        { from: "carriers", to: "email_review" },
        { from: "email_review", to: "carriers" },
      ],
      "an opening wrote none, a refresh wrote none, and each replacement said what it replaced, back and forth",
    );

    // And it writes nothing for what is not a change, whatever touches the row. The trigger is `after update of reason ...
    // when (old.reason is distinct from new.reason)`, and both halves are held here, beside the assertion above.
    const still = async () =>
      (
        await db
          .from("events")
          .select("data")
          .eq("tenant_id", tenantId)
          .eq("kind", "escalation.changed")
          .eq("subject_id", row.id)
      ).data.length;
    assert.equal(await still(), 2, "the two changes above, and nothing else, to start from");
    // (a) A refresh that writes the SAME reason, through the real writer: it says the words again and moves nothing.
    assert.equal(await upsertEscalation(db, tenantId, id, "carriers", "Still waiting, said again."), "refreshed");
    assert.equal(await still(), 2, "a refresh of the same reason wrote no change event");
    // (b) An update that touches the row without changing its reason. Each is checked to have reached the row (a write that
    // matches nothing succeeds), and the second is the one the WHEN exists for: it names `reason`, so the trigger is
    // entered, and the reason it writes is the one the row already has. upsertEscalation never writes that (its change path
    // is filtered to a different reason), so it is written here as another writer might.
    const touched = await db
      .from("escalations")
      .update({ details: "Only the words." })
      .eq("id", row.id)
      .select("reason");
    assert.equal(touched.error, null);
    assert.deepEqual(touched.data, [{ reason: "carriers" }], "the update reached the row, and its reason stands");
    assert.equal(await still(), 2, "an update that touches the row but not its reason wrote no change event");
    const same = await db
      .from("escalations")
      .update({ reason: "carriers", details: "The reason it already has." })
      .eq("id", row.id)
      .select("reason, details");
    assert.equal(same.error, null);
    assert.deepEqual(
      same.data,
      [{ reason: "carriers", details: "The reason it already has." }],
      "the update reached the row and wrote the reason it already had",
    );
    assert.equal(await still(), 2, "an update that names the reason it already has wrote no change event");
    // The real change still writes its event after all of that: the guard above is not a trigger that has stopped writing.
    assert.equal(await upsertEscalation(db, tenantId, id, "email_review", "A different reason."), "changed");
    assert.equal(await still(), 3, "and a real change, after them, still writes its event");
  },
);

test(
  "a resolved hold is out of the way: the next reason opens a new row rather than reviving theirs",
  { skip },
  async () => {
    const id = await thread("2");
    await upsertEscalation(db, tenantId, id, "rate_cap", "Reply limit reached.");
    await db.from("escalations").update({ state: "resolved" }).eq("conversation_id", id).eq("state", "open");
    assert.equal(
      await upsertEscalation(db, tenantId, id, "email_review", "An email arrived."),
      "opened",
      "the partial index only guards an OPEN row, so a person who dealt with the last one is not shown its ghost",
    );
    const { data: rows } = await db
      .from("escalations")
      .select("state, resolved_at")
      .eq("conversation_id", id)
      .order("created_at");
    assert.deepEqual(
      rows.map((r) => [r.state, r.resolved_at !== null]),
      [
        ["resolved", true],
        ["open", false],
      ],
      "the one a person dealt with ended; the new one has not",
    );
    const { count } = await db
      .from("escalations")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", id);
    assert.equal(count, 2, "the one they resolved is history, and history is kept");
  },
);

test("two holds racing for one thread: one opens, the other is told what it found", { skip }, async () => {
  const id = await thread("3");
  const [a, b] = await Promise.all([
    upsertEscalation(db, tenantId, id, "brain_error", "The receptionist hit an error."),
    upsertEscalation(db, tenantId, id, "email_review", "An email arrived."),
  ]);
  const outcomes = [a, b].sort();
  assert.equal(outcomes.filter((o) => o === "opened").length, 1, `exactly one opened: got ${a} and ${b}`);
  assert.equal(outcomes.filter((o) => o === "changed" || o === "refreshed").length, 1, "and the other found it there");
  assert.notEqual(await openRow(id), null);
});

test(
  "a ledger that cannot take the change event does not take the reason change with it: the replacement lands, no event is written, and a resolve still stamps",
  { skip },
  async () => {
    const id = await thread("4");
    assert.equal(
      await upsertEscalation(db, tenantId, id, "carriers", "The line is not approved for texting yet."),
      "opened",
    );
    const esc = (await db.from("escalations").select("id").eq("conversation_id", id).single()).data;
    const eventsOf = async () =>
      (
        await db
          .from("events")
          .select("data")
          .eq("tenant_id", tenantId)
          .eq("kind", "escalation.changed")
          .eq("subject_id", esc.id)
      ).data;
    // The writer is the one door (escalation_open, 00380), SQL, so the block calls it as upsertEscalation does.
    const replace = (reason, details) => `
    declare said text;
    begin
      said := public.escalation_open('${tenantId}', '${id}', '${reason}', '${details}');
      seen := seen || jsonb_build_object('${reason}', jsonb_build_object('raised', false, 'said', said));
    exception when others then
      seen := seen || jsonb_build_object('${reason}', jsonb_build_object('raised', true, 'message', sqlerrm));
    end;`;
    const seen = rolledBack(`
    -- Before anything is made: this is the database the suite's rows are in, or nothing happens.
    if not exists (select 1 from public.escalations where id = '${esc.id}') then
      raise exception 'not_this_database';
    end if;
    -- The control, with nothing injected: a replacement writes its event, so "none written" below is not a ledger that
    -- never wrote one.
    ${replace("email_review", "An email arrived.")}
    seen := seen || jsonb_build_object('events_before', (select count(*) from public.events where kind = 'escalation.changed' and subject_id = '${esc.id}'));
    -- A ledger that refuses this workspace's change events (a trigger, as the team test refuses decisions), then the
    -- reason replaced again, and the hold resolved.
    create function public.__escalation_changed_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    create trigger __escalation_changed_refused before insert on public.events
      for each row when (new.kind = 'escalation.changed' and new.tenant_id = '${tenantId}') execute function public.__escalation_changed_refused();
    ${replace("carriers", "The carriers again.")}
    begin
      update public.escalations set state = 'resolved' where id = '${esc.id}';
      seen := seen || jsonb_build_object('resolve', jsonb_build_object('raised', false));
    exception when others then
      seen := seen || jsonb_build_object('resolve', jsonb_build_object('raised', true, 'message', sqlerrm));
    end;
    seen := seen || jsonb_build_object(
      'row', (select jsonb_build_object('reason', reason, 'details', details, 'state', state, 'stamped', resolved_at is not null)
                from public.escalations where id = '${esc.id}'),
      'events_after', (select count(*) from public.events where kind = 'escalation.changed' and subject_id = '${esc.id}'));
  `);
    assert.deepEqual(
      seen.email_review,
      { raised: false, said: "changed" },
      "the control: a replacement with a working ledger",
    );
    assert.equal(seen.events_before, 1, "and it wrote its event");
    assert.deepEqual(
      seen.carriers,
      { raised: false, said: "changed" },
      `a ledger that refuses the event must not refuse the replacement (${JSON.stringify(seen.carriers)})`,
    );
    assert.deepEqual(
      [seen.row.reason, seen.row.details],
      ["carriers", "The carriers again."],
      "the update landed with the new reason",
    );
    assert.equal(seen.events_after, 1, "and no event was written for it: the refused one is a warning, not a row");
    assert.deepEqual(seen.resolve, { raised: false }, "a resolve under the same ledger is not refused");
    assert.deepEqual(
      [seen.row.state, seen.row.stamped],
      ["resolved", true],
      "and it stamps, the stamp not needing the ledger",
    );

    // The block never committed: the hold is as this test left it, and a change writes its event again, so no trigger
    // refusing the ledger was left behind.
    assert.deepEqual(
      await openRow(id),
      { reason: "carriers", details: "The line is not approved for texting yet.", state: "open" },
      "nothing the block did was kept",
    );
    assert.deepEqual(await eventsOf(), [], "and none of its events");
    assert.equal(await upsertEscalation(db, tenantId, id, "email_review", "An email arrived."), "changed");
    assert.deepEqual(
      await eventsOf(),
      [{ data: { from: "carriers", to: "email_review" } }],
      "the refusing ledger went with the transaction: the same change writes its event",
    );
  },
);

test(
  "a ledger that refuses a hold's escalation.opened refuses the hold with it: the door opens both or neither",
  { skip },
  async () => {
    const id = await thread("5");
    const seen = rolledBack(`
    if not exists (select 1 from public.conversations where id = '${id}') then
      raise exception 'not_this_database';
    end if;
    create function public.__escalation_opened_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    create trigger __escalation_opened_refused before insert on public.events
      for each row when (new.kind = 'escalation.opened' and new.tenant_id = '${tenantId}')
      execute function public.__escalation_opened_refused();
    begin
      perform public.escalation_open('${tenantId}', '${id}', 'carriers', 'The line is not approved for texting yet.');
      seen := seen || jsonb_build_object('raised', false);
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
    seen := seen || jsonb_build_object(
      'holds', (select count(*) from public.escalations where conversation_id = '${id}'));
  `);
    assert.equal(seen.raised, true, `a ledger that refuses the event must refuse the hold (${JSON.stringify(seen)})`);
    assert.match(seen.message, /ledger is unavailable/);
    assert.equal(seen.holds, 0, "no hold without its event");
    // Outside the block, with the ledger working, the hold opens with its event.
    assert.equal(
      await upsertEscalation(db, tenantId, id, "carriers", "The line is not approved for texting yet."),
      "opened",
    );
    const opened = (
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", tenantId)
        .eq("kind", "escalation.opened")
        .eq("subject_id", id)
    ).data;
    assert.deepEqual(opened, [{ data: { reason: "carriers" } }]);
  },
);
