/**
 * 00312 on a real Postgres: a call that ended in a transfer says whether a person picked up (the Reports lenses spec,
 * K7). The trigger is on the call row, so the writer is the real one, ingest_call, whose body this change does not
 * restate: the webhook's call_started, call_ended and call_analyzed all carry the call and the ending they know, and the
 * event is written once, on the update that first makes the ending a transfer, however many times the provider says it
 * after. One predicate, call_transfer_answered, says which endings are a transfer and whether it was answered, and is
 * held to the product's own words for the endings (DISCONNECTION_LABELS) by the case below. The trigger sits beside the
 * first-touch ones of 00306 on the same table and never reads what they write. A ledger that cannot take the event does
 * not take the call with it (a transaction on this machine's database that never commits, through the CLI, as
 * team-changes-and-their-audit.db.test.mjs does). Runs against the database `supabase start` builds on this machine,
 * never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DISCONNECTION_LABELS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes calls and events"
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

const stamp = Date.now();
const agent = `agent_transfer_${stamp}`;
/** How long the caller was on the line when the provider says a call ended. */
const TALKED_MS = 42_000;
let db;
let tenantId;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
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
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-transfer-${stamp}`, name: "Harbor Transfer" })
      .select("id")
      .single(),
  ).id;
  ok(await db.from("tenant_channels").insert({ tenant_id: tenantId, kind: "voice", external_id: agent }));
});

after(async () => {
  if (skip) return;
  if (tenantId) {
    await db.from("events").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
});

/** One caller per call, so a call's events are all one person's. */
const callers = new Map();
const callerOf = (id) => {
  if (!callers.has(id)) callers.set(id, `+1555013${6000 + callers.size}`);
  return callers.get(id);
};

/** A call event as the webhook ingests it, with the provider's ending; `analysis` is what call_analyzed adds. */
const call = (id, status, disconnection, from = callerOf(id), direction = "inbound", analysis = null) =>
  db.rpc("ingest_call", {
    p_tenant_id: tenantId,
    p_retell_call_id: `tr-${id}-${stamp}`,
    p_agent_id: agent,
    p_from_e164: from,
    p_from_raw: from,
    p_to_e164: null,
    p_direction: direction,
    p_call_type: "phone_call",
    p_status: status,
    p_started_at: new Date().toISOString(),
    p_ended_at: null,
    p_duration_ms: status === "ongoing" || status === "registered" ? null : TALKED_MS,
    p_disconnection: disconnection,
    p_sentiment: null,
    p_successful: null,
    p_in_voicemail: false,
    p_summary: null,
    p_transcript: null,
    p_transcript_obj: null,
    p_recording: null,
    p_public_log_url: null,
    p_cost: {},
    p_latency: {},
    p_raw: {},
    p_analysis: analysis,
  });
const callId = async (id) =>
  ok(await db.from("calls").select("id").eq("tenant_id", tenantId).eq("retell_call_id", `tr-${id}-${stamp}`).single())
    .id;
const transfers = async (id) =>
  ok(
    await db
      .from("events")
      .select("category, subject_type, data")
      .eq("tenant_id", tenantId)
      .eq("kind", "call.transferred")
      .eq("subject_id", await callId(id)),
  );
const touchOf = async (id) => {
  const row = ok(
    await db
      .from("calls")
      .select("contact_id")
      .eq("id", await callId(id))
      .single(),
  );
  return ok(await db.from("contacts").select("acquired_via").eq("id", row.contact_id).single()).acquired_via;
};

test(
  "a call that ended in a transfer says whether a person picked up, once, however many times the provider says it: its ending, its redelivery, its analysis, a late word from before",
  { skip },
  async () => {
    for (const [reason, answered] of [
      ["call_transfer", true],
      ["transfer_bridged", true],
      ["transfer_cancelled", false],
    ]) {
      ok(await call(reason, "ongoing", null));
      assert.deepEqual(await transfers(reason), [], `${reason}: nothing while the call runs`);
      ok(await call(reason, "ended", reason));
      assert.deepEqual(
        await transfers(reason),
        [{ category: "call", subject_type: "call", data: { answered } }],
        `${reason}: its ending`,
      );
      ok(await call(reason, "ended", reason)); // call_ended delivered again
      ok(await call(reason, "ended", reason, undefined, undefined, { outcome: "other" })); // call_analyzed: the same ending, and the analysis
      ok(await call(reason, "ongoing", null)); // a transcript turn that arrives late: the provider's older word
      assert.equal((await transfers(reason)).length, 1, `${reason}: said once, however many times it is delivered`);
    }
  },
);

test("a call that arrives already ended in a transfer says so, and an outbound call is a call", { skip }, async () => {
  ok(await call("first-row", "ended", "transfer_bridged"));
  assert.deepEqual(
    (await transfers("first-row")).map((e) => e.data),
    [{ answered: true }],
  );
  ok(await call("first-row", "ended", "transfer_bridged", undefined, undefined, { outcome: "other" }));
  assert.equal((await transfers("first-row")).length, 1, "and not again when its analysis arrives");
  ok(await call("outbound", "ended", "transfer_bridged", undefined, "outbound"));
  assert.equal((await transfers("outbound")).length, 1);
});

test(
  "the first ending that is a transfer is the call's word: a later ending that names another transfer writes nothing more",
  { skip },
  async () => {
    ok(await call("changed-mind", "ended", "call_transfer"));
    ok(await call("changed-mind", "ended", "transfer_cancelled"));
    assert.deepEqual(
      (await transfers("changed-mind")).map((e) => e.data),
      [{ answered: true }],
    );
    // A call that said another ending first and a transfer after it is a transfer from then on.
    ok(await call("hangup-then-transfer", "ended", "agent_hangup"));
    assert.deepEqual(await transfers("hangup-then-transfer"), []);
    ok(await call("hangup-then-transfer", "ended", "transfer_cancelled"));
    assert.deepEqual(
      (await transfers("hangup-then-transfer")).map((e) => e.data),
      [{ answered: false }],
    );
  },
);

test(
  "any other ending, and none, says nothing: a hang-up, the receptionist's, a person taking over from the dashboard",
  { skip },
  async () => {
    for (const reason of ["user_hangup", "agent_hangup", "call_take_over", "manual_stopped", "dial_no_answer", null]) {
      ok(await call(`other-${reason}`, "ended", reason)); // arrives ended: its first row
      assert.deepEqual(await transfers(`other-${reason}`), [], `${reason}: its first row`);
      ok(await call(`later-${reason}`, "ongoing", null));
      ok(await call(`later-${reason}`, "ended", reason)); // the ending arrives on an update
      assert.deepEqual(await transfers(`later-${reason}`), [], `${reason}: its update`);
    }
  },
);

test(
  "the transfer sits beside the first touch of 00306 on the same row, and neither takes the other's place: a call's first row and the update that connects it",
  { skip },
  async () => {
    // First row: connected and inbound (the insert trigger of the first touch fires) and already a transfer (ours does).
    ok(await call("both-insert", "ended", "transfer_bridged"));
    assert.equal(await touchOf("both-insert"), "call", "the person this call made keeps how they first reached us");
    assert.deepEqual(
      (await transfers("both-insert")).map((e) => e.data),
      [{ answered: true }],
    );
    // A call that is only registered, then one update that connects it AND ends it in a transfer: the first touch's update
    // trigger (status, duration) and ours (the ending) fire on the same statement.
    ok(await call("both-update", "registered", null));
    assert.equal(await touchOf("both-update"), null, "a call that has not connected has made nobody's first touch");
    assert.deepEqual(await transfers("both-update"), []);
    ok(await call("both-update", "ended", "call_transfer"));
    assert.equal(await touchOf("both-update"), "call");
    assert.deepEqual(
      (await transfers("both-update")).map((e) => e.data),
      [{ answered: true }],
    );
  },
);

test(
  "the predicate is the labels' twin: a reason the product words as a transfer is one, and answered is the word's",
  { skip },
  async () => {
    for (const [reason, label] of Object.entries(DISCONNECTION_LABELS)) {
      const said = ok(await db.rpc("call_transfer_answered", { p_reason: reason }));
      const transfer = /^Transfer/.test(label);
      assert.equal(said !== null, transfer, `${reason}: ${label}`);
      if (transfer) assert.equal(said, label === "Transferred to a person", reason);
    }
    // The three endings the database knows are all words the product has, so the loop above reaches each of them.
    for (const reason of ["call_transfer", "transfer_bridged", "transfer_cancelled"])
      assert.ok(reason in DISCONNECTION_LABELS, `${reason} is worded by the product`);
    assert.equal(ok(await db.rpc("call_transfer_answered", { p_reason: null })), null);
    assert.equal(ok(await db.rpc("call_transfer_answered", { p_reason: "an_ending_nobody_sent" })), null);
  },
);

test(
  "a ledger that cannot take the event does not take the call with it: the call is on record and no event is written, on its first row and on its update",
  { skip },
  async () => {
    const insert = (id, status) => `insert into public.calls (tenant_id, retell_call_id, status, disconnection_reason)
      values ('${tenantId}', 'tr-trap-${id}-${stamp}', '${status}', ${status === "ended" ? "'transfer_bridged'" : "null"});`;
    const end = (id) => `update public.calls set status = 'ended', disconnection_reason = 'transfer_bridged'
      where tenant_id = '${tenantId}' and retell_call_id = 'tr-trap-${id}-${stamp}';`;
    const count = (id) => `(select count(*) from public.events e join public.calls c on c.id = e.subject_id
      where e.kind = 'call.transferred' and c.retell_call_id = 'tr-trap-${id}-${stamp}')`;
    const reason = (id) =>
      `(select disconnection_reason from public.calls where retell_call_id = 'tr-trap-${id}-${stamp}')`;
    const seen = rolledBack(`
      if not exists (select 1 from public.tenants where id = '${tenantId}') then raise exception 'not_this_database'; end if;
      ${insert("control", "ended")}
      ${insert("update-control", "ongoing")}
      ${end("update-control")}
      seen := seen || jsonb_build_object('control', ${count("control")}, 'update_control', ${count("update-control")});
      create function public.__transfer_refused() returns trigger language plpgsql as $f$
      begin raise exception 'the ledger is unavailable'; end $f$;
      create trigger __transfer_refused before insert on public.events
        for each row when (new.kind = 'call.transferred' and new.tenant_id = '${tenantId}') execute function public.__transfer_refused();
      begin
        ${insert("trap", "ended")}
        seen := seen || jsonb_build_object('raised', false);
      exception when others then
        seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
      end;
      seen := seen || jsonb_build_object('rows', (select count(*) from public.calls where retell_call_id = 'tr-trap-trap-${stamp}'), 'events', ${count("trap")});
      ${insert("update-trap", "ongoing")}
      begin
        ${end("update-trap")}
        seen := seen || jsonb_build_object('update_raised', false);
      exception when others then
        seen := seen || jsonb_build_object('update_raised', true, 'update_message', sqlerrm);
      end;
      seen := seen || jsonb_build_object('update_reason', ${reason("update-trap")}, 'update_events', ${count("update-trap")});
    `);
    assert.deepEqual(
      [seen.control, seen.update_control],
      [1, 1],
      `a working ledger writes both: ${JSON.stringify(seen)}`,
    );
    assert.deepEqual([seen.raised, seen.rows, seen.events], [false, 1, 0], JSON.stringify(seen));
    assert.deepEqual(
      [seen.update_raised, seen.update_reason, seen.update_events],
      [false, "transfer_bridged", 0],
      JSON.stringify(seen),
    );
  },
);
