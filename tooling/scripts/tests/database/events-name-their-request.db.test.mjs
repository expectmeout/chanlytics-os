/**
 * An event row names the request it was written in (00279: events.request_id), on a real Postgres through PostgREST.
 *
 * The ledger joins the log by that name. From TypeScript, recordEvent files the row with the request it serves
 * (packages/db events.ts). A SQL function's rows have no such argument, so the database client sends the name on every
 * call (observe.ts namedFetch, made by createServiceClient) as the header x-chanlytics-request-id, PostgREST hands it
 * to SQL as request.headers, and the column's default (request_id_of_caller) reads it. Proved here, as an app installs
 * it at boot (observeDb with the one logger and the request store) and calls it:
 *   - a recordEvent inside a request carries its name, and so does a row nothing named (a plain insert, a SQL function
 *     on the service role, a trigger's row): the header alone is what names them;
 *   - outside a request the row has none, and two requests in flight together each keep their own;
 *   - a header that is not shaped like a request's name (8 to 128 of A-Z a-z 0-9 . _ : -), sent to PostgREST by a raw
 *     fetch, gives a row with no name and never fails the insert; nor does a request.headers that is not JSON at all;
 *   - a migration's or psql's insert, with no header, has none (through the CLI, in a transaction that never commits);
 *   - the column's default runs as whoever inserts, so a signed-in session's insert (which row-level security refuses
 *     for events) is refused for the policy, not for a function it may not execute.
 *
 * Runs the way a-workspace-keeps-an-owner.db.test.mjs does, against the database `supabase start` builds on this
 * machine, never production. The last test goes through the CLI (SUPABASE_CLI names the binary when `supabase` is not
 * on PATH), aimed at SUPABASE_DB_URL when the environment names one.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DB_REQUEST_HEADER, createServiceClient, observeDb, recordEvent } from "@chanlytics/db";
import { logger, requestId, withRequestId } from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, people and events"
      : false;

let db;
let T; // the workspace the events are about
let contact;
const made = { tenants: [], users: [] };
const RUN = Date.now().toString(36);
let serial = 0;
/** A request's name, shaped as the edge and the dashboard make them (request-id.ts): region, then an id. */
const name = (tag) => `iad1::${tag}-${RUN}-${++serial}`;

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const eventsOf = async (kind, extra = (q) => q) =>
  ok(
    await extra(db.from("events").select("id, kind, request_id, data, subject_id").eq("tenant_id", T).eq("kind", kind)),
    kind,
  );

before(async () => {
  if (skip) return;
  // The app's boot: the one logger and the request store handed to db, and a client that names its calls.
  observeDb({ log: logger(), requestId });
  db = createServiceClient({ url: URL_, serviceRoleKey: KEY });
  T = ok(
    await db
      .from("tenants")
      .insert({ name: `Request names ${RUN}`, slug: `request-names-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(T);
  contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: T, phone_e164: "+15550100101", email: `person-${RUN}@example.com` })
      .select("id")
      .single(),
    "contact",
  ).id;
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of made.users) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

test(
  "a signed-in session's insert into events is refused by row-level security, not by the default's function",
  { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env") },
  async () => {
    const email = `request-names-${RUN}@example.com`;
    const password = `pw-${RUN}-Aa1!`;
    const u = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user").user;
    made.users.push(u.id);
    ok(await db.from("memberships").insert({ tenant_id: T, user_id: u.id, role: "owner" }), "membership");
    const member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await member.auth.signInWithPassword({ email, password });
    assert.equal(signedIn.error, null, signedIn.error?.message);
    const r = await member.from("events").insert({ tenant_id: T, kind: `test.request_member_${RUN}` });
    assert.ok(r.error, "a member wrote to the ledger directly");
    assert.match(r.error.message, /row-level security/, "the policy says no");
    assert.doesNotMatch(r.error.message, /request_id_of_caller/, "and the default's function is not what refused it");
  },
);

test("recordEvent inside a request files the row with the request's name", { skip }, async () => {
  const id = name("record");
  const r = await withRequestId(id, () =>
    recordEvent(db, T, "message.sent", "message", crypto.randomUUID(), { sender: "human" }),
  );
  assert.deepEqual(r, { error: null });
  const rows = await eventsOf("message.sent", (q) => q.eq("request_id", id));
  assert.equal(rows.length, 1, "the row is found by the name, and there is one");
  assert.equal(rows[0].request_id, id);
});

test(
  "a row nothing named takes the name from the header the client sent: the column's default reads it",
  { skip },
  async () => {
    const id = name("plain");
    // No request_id in the row: only the header on the call can have named it.
    const kind = `test.request_named_${RUN}`;
    await withRequestId(id, async () => ok(await db.from("events").insert({ tenant_id: T, kind }), "a plain insert"));
    const [row] = await eventsOf(kind);
    assert.equal(row.request_id, id, "the default read the request's name from request.headers");
  },
);

test("a SQL function's event, on the service role, in the same request, carries the same name", { skip }, async () => {
  const id = name("sql");
  const answer = await withRequestId(id, async () =>
    ok(
      await db.rpc("set_email_marketing", {
        p_tenant_id: T,
        p_contact_id: contact,
        p_state: "opted_out",
        p_source: "unsubscribe",
      }),
      "set_email_marketing",
    ),
  );
  assert.equal(answer.changed, true, "the function wrote its event");
  const rows = await eventsOf("contact.consent_changed", (q) => q.eq("subject_id", contact));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].request_id, id, "the function's row is named by the request it ran in");
  assert.equal(rows[0].data.source, "unsubscribe");

  // And a trigger's row: a workspace made in the request says which request made it.
  const made2 = await withRequestId(id, async () =>
    ok(
      await db
        .from("tenants")
        .insert({ name: `Request names trigger ${RUN}`, slug: `request-names-trigger-${RUN}` })
        .select("id")
        .single(),
      "a second workspace",
    ),
  );
  made.tenants.push(made2.id);
  const created = ok(
    await db.from("events").select("request_id").eq("tenant_id", made2.id).eq("kind", "workspace.created"),
    "workspace.created",
  );
  assert.deepEqual(
    created.map((r) => r.request_id),
    [id],
    "the trigger's row carries the name",
  );
});

test("outside a request the row has no name, whoever wrote it", { skip }, async () => {
  assert.equal(requestId(), null, "the test itself is outside a request");
  const r = await recordEvent(db, T, "message.sent", "message", crypto.randomUUID(), { sender: "ai" });
  assert.deepEqual(r, { error: null });
  const kind = `test.request_unnamed_${RUN}`;
  ok(await db.from("events").insert({ tenant_id: T, kind }), "a plain insert");
  const contact2 = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: T, phone_e164: "+15550100102", email: `other-${RUN}@example.com` })
      .select("id")
      .single(),
    "another contact",
  ).id;
  ok(
    await db.rpc("set_email_marketing", {
      p_tenant_id: T,
      p_contact_id: contact2,
      p_state: "opted_out",
      p_source: "complaint",
    }),
    "set_email_marketing",
  );
  const sent = await eventsOf("message.sent", (q) => q.is("request_id", null));
  assert.ok(sent.length >= 1, "the recordEvent row has none");
  assert.deepEqual(
    (await eventsOf(kind)).map((r) => r.request_id),
    [null],
  );
  assert.deepEqual(
    (await eventsOf("contact.consent_changed", (q) => q.eq("subject_id", contact2))).map((r) => r.request_id),
    [null],
    "nor does a function's, outside a request",
  );
});

test("two requests in flight together each keep their own name", { skip }, async () => {
  const [a, b] = [name("left"), name("right")];
  const kind = `test.request_pair_${RUN}`;
  const write = (id, marker) =>
    withRequestId(id, async () => {
      // Awaits in between, so the two interleave: a name held in a shared variable would be lent to the other.
      await new Promise((resolve) => setTimeout(resolve, 5));
      ok(await db.from("events").insert({ tenant_id: T, kind, data: { marker } }), `insert ${marker}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return recordEvent(db, T, "message.sent", "message", crypto.randomUUID(), { sender: marker });
    });
  await Promise.all([write(a, "left"), write(b, "right")]);
  const rows = await eventsOf(kind);
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.data.marker, r.request_id])), { left: a, right: b });
  const sent = await eventsOf("message.sent", (q) => q.in("data->>sender", ["left", "right"]));
  assert.deepEqual(Object.fromEntries(sent.map((r) => [r.data.sender, r.request_id])), { left: a, right: b });
});

/** A raw insert into events with this header, as any HTTP client could send one; answers PostgREST's status and row. */
async function rawInsert(header) {
  const kind = `test.request_raw_${RUN}_${++serial}`;
  const res = await fetch(`${URL_}/rest/v1/events`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(header === undefined ? {} : { [DB_REQUEST_HEADER]: header }),
    },
    body: JSON.stringify({ tenant_id: T, kind }),
  });
  const body = await res.json();
  return { status: res.status, row: Array.isArray(body) ? body[0] : body };
}

test(
  "a header shaped like a request's name is kept; one that is not gives no name and never fails the insert",
  { skip },
  async () => {
    const shaped = ["abcdefgh", "iad1::gwct8-1758-a", "a.b_c:d-e", "x".repeat(128)];
    for (const header of shaped) {
      const { status, row } = await rawInsert(header);
      assert.equal(status, 201, `${header.slice(0, 20)}: ${JSON.stringify(row)}`);
      assert.equal(row.request_id, header, "a name of the right shape is the row's");
    }
    const unshaped = [
      ["seven77", "shorter than eight"],
      ["x".repeat(129), "longer than 128"],
      ["has a space in it", "a space"],
      ["semi;colon-in-it", "a semicolon"],
      ["quote'quote'quote", "a quote"],
      ["slash/slash/slash", "a slash"],
      ["null; drop table events", "not a name at all"],
      ["", "empty"],
    ];
    for (const [header, why] of unshaped) {
      const { status, row } = await rawInsert(header);
      assert.equal(status, 201, `${why}: the insert must not fail (${JSON.stringify(row)})`);
      assert.equal(row.request_id, null, `${why}: no name`);
    }
    const none = await rawInsert(undefined);
    assert.equal(none.status, 201);
    assert.equal(none.row.request_id, null, "no header, no name");
  },
);

/**
 * A transaction on this machine's database that never commits (as sweep-registry.db.test.mjs runs one): `body` runs in
 * a DO block that ends by raising what it `seen`, so everything it did goes with it.
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
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (/not_this_database/.test(said))
    throw new Error(
      "the CLI reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

test(
  "an insert with no header (a migration's, psql's) has no name; a request.headers that is not JSON never fails it",
  { skip },
  () => {
    const write = (label, settings) => `
    ${settings}
    insert into public.events (tenant_id, kind) values ('${T}', 'test.request_sql_${label}_${RUN}');
    seen := seen || jsonb_build_object('${label}', jsonb_build_object(
      'row', (select request_id from public.events where tenant_id = '${T}' and kind = 'test.request_sql_${label}_${RUN}'),
      'fn', public.request_id_of_caller()));`;
    const seen = rolledBack(`
    -- Before anything is made: this is the database the suite's rows are in, or nothing happens.
    if not exists (select 1 from public.tenants where id = '${T}') then
      raise exception 'not_this_database';
    end if;
    ${write("bare", "")}
    ${write("named", `perform set_config('request.headers', '{"${DB_REQUEST_HEADER}": "psql-named-request"}', true);`)}
    ${write("odd", `perform set_config('request.headers', '{"${DB_REQUEST_HEADER}": "no good"}', true);`)}
    ${write("notjson", `perform set_config('request.headers', 'this is not json', true);`)}
    ${write("array", `perform set_config('request.headers', '[1, 2]', true);`)}
    ${write("empty", `perform set_config('request.headers', '', true);`)}
    ${write("other", `perform set_config('request.headers', '{"x-something-else": "psql-named-request"}', true);`)}
  `);
    assert.deepEqual(seen.bare, { row: null, fn: null }, "no header: no name");
    assert.deepEqual(seen.named, { row: "psql-named-request", fn: "psql-named-request" }, "the header's name");
    for (const label of ["odd", "notjson", "array", "empty", "other"])
      assert.deepEqual(seen[label], { row: null, fn: null }, `${label}: no name, and the insert went through`);
  },
);
