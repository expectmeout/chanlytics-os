/**
 * A take-over and a hand-back are each one transaction (00378: conversation_take_over, conversation_hand_back), proved
 * on a real Postgres through PostgREST, called as the dashboard calls them: core takeOver and handBack over the
 * dashboard's own threadPorts, on the member's own session, so RLS and the door's own check are in the way as they
 * are for them.
 *
 * Each used to be four writes on two clients (the claim, the hold, the drafts, the ledger; the release, the hold, the
 * ledger, the escalation), and the ones after the first could stand while a later one failed: a hold taken whose
 * release then failed kept the receptionist off a thread the Inbox showed open for up to a day. What is proved here:
 *   - one call writes all of it: the claim as contracts' take_over move says (conversation-moves.ts), the hold on who
 *     is speaking (00132), the receptionist's queued draft withdrawn with its send job, and the take_over decision
 *     with the moment the pause ends as the dashboard spelled it; a colleague's queued reply, its job and the open
 *     escalation are left alone;
 *   - a hand-back after a take-over leaves the row exactly as it was before, resolves the open escalation by its own
 *     decision, and lets go only this person's hold;
 *   - who may: a viewer, a member of another workspace, the anon key and the service role with no person are each
 *     refused with nothing written, and the verb answers the door's refusal as a 404;
 *   - a thread of another workspace answers null, and the verb refuses with a 409, nothing written anywhere;
 *   - atomicity, on the failure that matters: a database that cannot write the decision. A trigger that refuses every
 *     decision of the workspace is put on `decisions` inside one transaction that never commits (through the CLI, as
 *     team-changes-and-their-audit.db.test.mjs runs one; psql when the CLI is not on this machine), and each door is
 *     called as the member. Each raises and leaves the thread, the hold, the draft, the job and the escalation as
 *     they were.
 *
 * Runs against the database `supabase start` builds on this machine, never production; the atomicity block never
 * commits. Skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { conversationPatch } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here. psql, with no CLI, takes the same database.
const DB_URL = process.env.SUPABASE_DB_URL;
const LOCAL_DB = DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL) ? DB_URL : null;
const CLI_TARGET = LOCAL_DB
  ? ["--db-url", `${LOCAL_DB}${LOCAL_DB.includes("?") ? "&" : "?"}sslmode=disable`]
  : ["--local"];
const PSQL_TARGET = LOCAL_DB ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and threads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const RUN = Date.now().toString(36);
const DAY_S = 24 * 60 * 60;
const HOUR_MS = 3_600_000;
const COLUMNS = [
  "state",
  "paused_until",
  "snooze_until",
  "assignee_user_id",
  "control_kind",
  "control_by",
  "control_ref",
  "control_until",
];

let db;
let core;
let ports;
let serial = 0;
const made = { users: [], tenants: [] };

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
/** An instant as PostgREST spells it (+00:00) is the same instant as written (Z). */
const iso = (v) => (v === null || v === undefined ? null : new Date(v).toISOString());

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  core = await import(at("packages/core/src/index.ts"));
  ports = await import(at("apps/dashboard/src/server/ports/core-ports.ts"));
  // The dashboard's service-role calls (a reply's hold, a job) go to this database; neither door uses them.
  (await import(at("apps/dashboard/src/server/service-db.ts"))).setServiceClient(db);
});

after(async () => {
  if (skip) return;
  for (const id of made.tenants) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of made.users) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

/** A real account, made with the admin API. */
async function person(tag) {
  const email = `take-over-${tag}-${++serial}-${RUN}@example.com`;
  const password = `pw-${RUN}-${serial}-Aa1!`;
  const u = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user").user;
  made.users.push(u.id);
  return { id: u.id, email, password };
}

/** A workspace with a seat for each role given, answering the seats. */
async function workspace(tag, roles) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ name: `Take-over ${tag}`, slug: `take-over-${tag}-${++serial}-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  const seats = [];
  for (const [n, role] of roles.entries()) {
    const who = await person(`${tag}-${n}`);
    ok(await db.from("memberships").insert({ tenant_id: t, user_id: who.id, role }), "membership");
    seats.push({ ...who, role });
  }
  return { t, seats };
}

/** A signed-in session for someone, as the dashboard's own client is. */
async function session(who) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email: who.email, password: who.password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

/** The route's context for a member: their own session, as with-route.ts hands it to the ports. */
const ctxFor = (client, who, over = {}) => ({ supabase: client, userId: who.id, email: who.email, ...over });

/** A thread of a person of its own in workspace `t`, set to `row`; the verb's view of it. */
async function thread(t, row = {}) {
  serial += 1;
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: t, phone_e164: `+1555${String(1000000 + serial).slice(-7)}` })
      .select("id")
      .single(),
    "contact",
  );
  const conv = ok(
    await db
      .from("conversations")
      .insert({ tenant_id: t, contact_id: contact.id, ...row })
      .select("id, paused_until")
      .single(),
    "conversation",
  );
  return { id: conv.id, tenant_id: t, phone_e164: null, paused_until: conv.paused_until, contactId: contact.id };
}

/** A queued outbound message on the thread, with the send job that would fire it. */
async function queued(t, conv, sender) {
  const m = ok(
    await db
      .from("messages")
      .insert({
        tenant_id: t,
        conversation_id: conv.id,
        contact_id: conv.contactId,
        channel: "whatsapp",
        direction: "outbound",
        sender,
        body: sender === "ai" ? "The receptionist's held draft." : "A colleague's reply, still in its grace.",
        status: "queued",
      })
      .select("id")
      .single(),
    "message",
  );
  const j = ok(
    await db
      .from("jobs")
      .insert({ tenant_id: t, kind: "outbound_send", due_at: new Date().toISOString(), payload: { message_id: m.id } })
      .select("id")
      .single(),
    "job",
  );
  return { messageId: m.id, jobId: j.id };
}

const escalate = async (t, conv) =>
  ok(
    await db
      .from("escalations")
      .insert({ tenant_id: t, conversation_id: conv.id, reason: "manual", details: "A person asked for a person." })
      .select("id")
      .single(),
    "escalation",
  ).id;

/** The thread's row, as a move leaves it: the four the moves write and the four of the hold. */
const rowOf = async (id) => {
  const r = ok(await db.from("conversations").select(COLUMNS.join(", ")).eq("id", id).single(), "row");
  return {
    ...r,
    paused_until: iso(r.paused_until),
    snooze_until: iso(r.snooze_until),
    control_until: iso(r.control_until),
  };
};
const messageOf = async (id) => ok(await db.from("messages").select("status, error").eq("id", id).single(), "message");
const jobOf = async (id) => ok(await db.from("jobs").select("state").eq("id", id).single(), "job");
const escalationOf = async (id) =>
  ok(
    await db.from("escalations").select("state, resolved_by_user_id, decision_id, resolved_at").eq("id", id).single(),
    "escalation",
  );
const ledger = async (t) =>
  ok(
    await db
      .from("decisions")
      .select("verb, subject_type, subject_id, actor_type, actor_user_id, payload, undo_of")
      .eq("tenant_id", t)
      .order("created_at"),
    "decisions",
  );

/* -------------------------------------------------------------------------------------------- one call */

test(
  "one call takes a thread over: the claim, the hold, the receptionist's draft and its job, and the ledger; a colleague's reply and the open escalation are left alone",
  { skip },
  async () => {
    const { t, seats } = await workspace("whole", ["owner"]);
    const [owner] = seats;
    const snoozeUntil = new Date(Date.now() + 2 * HOUR_MS).toISOString();
    const conv = await thread(t, { state: "snoozed", snooze_until: snoozeUntil });
    const draft = await queued(t, conv, "ai");
    const theirs = await queued(t, conv, "human");
    const escalation = await escalate(t, conv);
    const before = await rowOf(conv.id);
    assert.deepEqual([before.state, before.snooze_until, before.control_kind], ["snoozed", snoozeUntil, null]);

    const started = Date.now();
    const took = await core.takeOver(ports.threadPorts(ctxFor(await session(owner), owner)), { conv });
    assert.deepEqual(
      { state: took.state, withdrawn_drafts: took.withdrawn_drafts },
      { state: "needs_human", withdrawn_drafts: 1 },
      "the receptionist's one draft was withdrawn, and the colleague's reply was not counted",
    );
    assert.match(
      took.paused_until,
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/,
      "an ISO instant, as the dashboard spells it",
    );
    // The default pause (no reply policy row) is a day: the verb's pauseMs, decided before the door.
    assert.ok(Math.abs(Date.parse(took.paused_until) - (started + DAY_S * 1000)) < 10_000, took.paused_until);

    const after_ = await rowOf(conv.id);
    // The claim is contracts' take_over move, written by SQL now: the state, the pause, the snooze cleared, theirs.
    const claim = conversationPatch("take_over", { until: took.paused_until, user: owner.id });
    for (const [col, want] of Object.entries(claim)) assert.equal(after_[col], want, `the claim writes ${col}`);
    // The hold on who is speaking (00132): this person's, for the pause window capped at a day.
    assert.deepEqual([after_.control_kind, after_.control_by, after_.control_ref], ["person", owner.id, null]);
    assert.ok(
      Math.abs(Date.parse(after_.control_until) - Date.parse(took.paused_until)) < 10_000,
      `the hold lasts the pause window (a day here): ${after_.control_until} against ${took.paused_until}`,
    );
    // The receptionist's draft and its job are withdrawn as the dashboard withdrew them; a colleague's are not.
    assert.deepEqual(await messageOf(draft.messageId), {
      status: "canceled",
      error: { reason: "superseded_by_human" },
    });
    assert.deepEqual(await jobOf(draft.jobId), { state: "canceled" });
    assert.deepEqual(await messageOf(theirs.messageId), { status: "queued", error: null }, "a colleague's words stay");
    assert.deepEqual(await jobOf(theirs.jobId), { state: "scheduled" }, "and so does the job behind them");
    // A take-over leaves the escalation open on purpose (§4): the thread still needs the person who took it.
    assert.equal((await escalationOf(escalation)).state, "open");
    // The ledger: the member's own line, with the moment the pause ends spelled as the dashboard spelled it.
    assert.deepEqual(await ledger(t), [
      {
        verb: "take_over",
        subject_type: "conversation",
        subject_id: conv.id,
        actor_type: "user",
        actor_user_id: owner.id,
        payload: { paused_until: took.paused_until },
        undo_of: null,
      },
    ]);
    assert.equal(
      (await ledger(t))[0].payload.paused_until,
      took.paused_until,
      "byte for byte: a reader of older rows reads this one the same",
    );
  },
);

test(
  "a draft a send run has already claimed is left to that run: the take-over withdraws only the receptionist's drafts nobody has claimed",
  { skip },
  async () => {
    // A claimed row (sending_at set, 00352) may be at the provider: the run that claimed it says what became of it. The
    // door reads past the row policy (00362) as a definer, so it keeps the rule itself, as the edge's pause does.
    const { t, seats } = await workspace("claimed", ["owner"]);
    const [owner] = seats;
    const conv = await thread(t);
    const sending = await queued(t, conv, "ai");
    ok(
      await db
        .from("messages")
        .update({ sending_at: new Date().toISOString() })
        .eq("id", sending.messageId)
        .select("id")
        .single(),
      "claim",
    );
    const held = await queued(t, conv, "ai");
    const took = await core.takeOver(ports.threadPorts(ctxFor(await session(owner), owner)), { conv });
    assert.equal(took.withdrawn_drafts, 1, "the held draft alone");
    assert.deepEqual(await messageOf(held.messageId), { status: "canceled", error: { reason: "superseded_by_human" } });
    assert.deepEqual(await jobOf(held.jobId), { state: "canceled" });
    assert.deepEqual(
      await messageOf(sending.messageId),
      { status: "queued", error: null },
      "REGRESSION: a draft already at the provider was marked canceled while the customer got it",
    );
    assert.deepEqual(await jobOf(sending.jobId), { state: "scheduled" }, "and its run is left to settle it");
  },
);

/* ----------------------------------------------------------------------------------------- and back */

test(
  "a hand-back after a take-over leaves the thread exactly as it was, resolves the open escalation by its own decision, and lets go only this person's hold",
  { skip },
  async () => {
    const { t, seats } = await workspace("back", ["owner", "operator"]);
    const [owner, operator] = seats;
    const conv = await thread(t);
    const escalation = await escalate(t, conv);
    const before = await rowOf(conv.id);
    assert.deepEqual(before, {
      state: "open",
      paused_until: null,
      snooze_until: null,
      assignee_user_id: null,
      control_kind: null,
      control_by: null,
      control_ref: null,
      control_until: null,
    });

    const ownerCtx = ctxFor(await session(owner), owner, { via: "ask" });
    const took = await core.takeOver(ports.threadPorts(ownerCtx), { conv });
    assert.equal((await rowOf(conv.id)).control_by, owner.id);
    const back = await core.handBack(ports.threadPorts(ownerCtx), {
      conv: { ...conv, paused_until: took.paused_until },
    });
    assert.equal(back.state, "open");
    assert.deepEqual(await rowOf(conv.id), before, "the release and the hold let go are one write: nothing is left");
    const resolved = await escalationOf(escalation);
    assert.deepEqual(
      [resolved.state, resolved.resolved_by_user_id, resolved.decision_id],
      ["resolved", owner.id, back.decision_id],
      "the escalation is resolved by the hand-back's own decision",
    );
    assert.ok(resolved.resolved_at, "and stamped");
    assert.deepEqual(
      (await ledger(t)).map((d) => [d.verb, d.actor_user_id, d.payload]),
      [
        ["take_over", owner.id, { paused_until: took.paused_until, via: "ask" }],
        ["hand_back", owner.id, { via: "ask" }],
      ],
      "both lines are the member's, and carry the request's `via` as recordDecision carried it",
    );

    // Somebody else's hold is left where it is: the operator hands back a thread the owner holds, and the row opens,
    // but the owner is still the one speaking, as release_conversation_control answers a release that is not theirs.
    const other = await thread(t);
    await core.takeOver(ports.threadPorts(ownerCtx), { conv: other });
    const held = await rowOf(other.id);
    const operatorCtx = ctxFor(await session(operator), operator);
    await core.handBack(ports.threadPorts(operatorCtx), { conv: other });
    const left = await rowOf(other.id);
    assert.deepEqual(
      [left.state, left.paused_until, left.assignee_user_id],
      ["open", null, null],
      "the row is open and nobody's",
    );
    assert.deepEqual(
      [left.control_kind, left.control_by, left.control_until],
      [held.control_kind, held.control_by, held.control_until],
      "and the owner's hold stands: only the holder lets go",
    );
  },
);

/* ------------------------------------------------------------------------------------------ who may */

test(
  "a viewer, a member of another workspace, the anon key and the service role with no person are refused, and nothing is written",
  { skip },
  async () => {
    const { t, seats } = await workspace("door", ["owner", "viewer"]);
    const [, viewer] = seats;
    const elsewhere = await workspace("door-elsewhere", ["owner"]);
    const conv = await thread(t);
    const escalation = await escalate(t, conv);
    const draft = await queued(t, conv, "ai");
    const before = await rowOf(conv.id);
    const until = new Date(Date.now() + HOUR_MS).toISOString();
    const take = { p_tenant_id: t, p_conversation_id: conv.id, p_paused_until: until };
    const give = { p_tenant_id: t, p_conversation_id: conv.id };
    const viewerSession = await session(viewer);
    const strangerSession = await session(elsewhere.seats[0]);
    const nobody = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const [who, client, code] of [
      ["a viewer", viewerSession, "P0002"],
      ["an owner of another workspace", strangerSession, "P0002"],
      ["the anon key", nobody, "42501"],
      ["the service role with no person", db, "28000"],
    ]) {
      for (const [fn, args] of [
        ["conversation_take_over", take],
        ["conversation_hand_back", give],
      ]) {
        const r = await client.rpc(fn, args);
        assert.ok(r.error, `REGRESSION: ${who} executed ${fn}`);
        assert.equal(r.error.code, code, `${who} calling ${fn}: ${r.error.message}`);
      }
    }
    assert.deepEqual(await rowOf(conv.id), before, "the thread is as it was");
    assert.deepEqual(await messageOf(draft.messageId), { status: "queued", error: null }, "the draft still stands");
    assert.equal((await escalationOf(escalation)).state, "open");
    assert.deepEqual(await ledger(t), [], "no decision was written");
    assert.deepEqual(await ledger(elsewhere.t), []);
    // And through the verb over the dashboard's ports, the door's refusal is a door's: Workspace not found, 404.
    await assert.rejects(
      core.takeOver(ports.threadPorts(ctxFor(viewerSession, viewer)), { conv }),
      (e) => e.code === "not_found" && e.status === 404 && /Workspace not found/.test(e.message),
    );
    await assert.rejects(
      core.handBack(ports.threadPorts(ctxFor(viewerSession, viewer)), { conv }),
      (e) => e.code === "not_found" && e.status === 404,
    );
    assert.deepEqual(await rowOf(conv.id), before);
  },
);

test(
  "a thread of another workspace answers null: the verb refuses with a 409, and nothing is written anywhere",
  { skip },
  async () => {
    const mine = await workspace("theirs-mine", ["owner"]);
    const theirs = await workspace("theirs-theirs", ["owner"]);
    const conv = await thread(theirs.t);
    const draft = await queued(theirs.t, conv, "ai");
    const before = await rowOf(conv.id);
    // The owner of one workspace, naming their own workspace and the other's thread (what a stale tab could send).
    const ctx = ctxFor(await session(mine.seats[0]), mine.seats[0]);
    const named = { ...conv, tenant_id: mine.t };
    await assert.rejects(
      core.takeOver(ports.threadPorts(ctx), { conv: named }),
      (e) => e.code === "conflict" && e.status === 409,
    );
    await assert.rejects(
      core.handBack(ports.threadPorts(ctx), { conv: named }),
      (e) => e.code === "conflict" && e.status === 409,
    );
    assert.deepEqual(await rowOf(conv.id), before);
    assert.deepEqual(await messageOf(draft.messageId), { status: "queued", error: null });
    assert.deepEqual(await ledger(mine.t), []);
    assert.deepEqual(await ledger(theirs.t), []);
  },
);

/* --------------------------------------------------------------------------------------- atomicity */

/**
 * A transaction on this machine's database that never commits (as team-changes-and-their-audit.db.test.mjs runs one):
 * `body` runs in a DO block that ends by raising what it `seen`, so everything it did, the trigger it made included,
 * goes with it. The CLI runs it; psql does when the CLI is not on this machine.
 */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const opts = { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 };
  let r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], opts);
  if (r.error?.code === "ENOENT") r = spawnSync("psql", [PSQL_TARGET, "-v", "ON_ERROR_STOP=0", "-c", sql], opts);
  if (r.error)
    throw new Error(`could not run ${CLI} or psql (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (/not_this_database/.test(said))
    throw new Error(
      "the block reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

test(
  "a database that cannot write the decision takes the whole take-over with it, and the whole hand-back: nothing is left moved and unrecorded",
  { skip },
  async () => {
    // The rows the block acts on are made here: the block itself never commits.
    const { t, seats } = await workspace("atomic", ["owner"]);
    const [owner] = seats;
    const conv = await thread(t);
    const draft = await queued(t, conv, "ai");
    const escalation = await escalate(t, conv);
    const until = new Date(Date.now() + HOUR_MS).toISOString();
    const state = (name) => `
    seen := seen || jsonb_build_object('${name}', (
      select jsonb_build_object(
        'thread', (select jsonb_build_object('state', c.state, 'assignee', c.assignee_user_id, 'paused', c.paused_until is not null,
                                             'hold', c.control_kind, 'holder', c.control_by)
                     from public.conversations c where c.id = '${conv.id}'),
        'draft', (select m.status from public.messages m where m.id = '${draft.messageId}'),
        'job', (select j.state from public.jobs j where j.id = '${draft.jobId}'),
        'escalation', (select e.state from public.escalations e where e.id = '${escalation}'),
        'decisions', (select count(*) from public.decisions d where d.tenant_id = '${t}'))));`;
    const call = (name, fn) => `
    begin
      perform ${fn};
      seen := seen || jsonb_build_object('${name}_raised', false);
    exception when others then
      seen := seen || jsonb_build_object('${name}_raised', true, '${name}_message', sqlerrm);
    end;`;
    const refusing = (on) => `
    ${on ? "" : "drop trigger if exists __thread_decision_refused on public.decisions;"}
    ${
      on
        ? `create trigger __thread_decision_refused before insert on public.decisions
      for each row when (new.tenant_id = '${t}') execute function public.__thread_decision_refused();`
        : ""
    }`;
    const seen = rolledBack(`
    -- Before anything is made: this is the database the suite's rows are in, or nothing happens.
    if not exists (select 1 from public.tenants where id = '${t}') then
      raise exception 'not_this_database';
    end if;
    -- The owner's own session, as PostgREST would set it: auth.uid() is theirs for the rest of the block.
    perform set_config('request.jwt.claims', '{"sub":"${owner.id}","role":"authenticated"}', true);
    -- A ledger that refuses every decision of this workspace, after the change it records has been made.
    create function public.__thread_decision_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    ${refusing(true)}
    ${call("take", `public.conversation_take_over('${t}', '${conv.id}', '${until}'::timestamptz)`)}
    ${state("after_take")}
    -- The ledger back, so the thread can be taken over for real (uncommitted), and refused again for the hand-back.
    ${refusing(false)}
    ${call("taken", `public.conversation_take_over('${t}', '${conv.id}', '${until}'::timestamptz)`)}
    ${state("taken")}
    ${refusing(true)}
    ${call("give", `public.conversation_hand_back('${t}', '${conv.id}')`)}
    ${state("after_give")}
  `);
    assert.equal(
      seen.take_raised,
      true,
      `a ledger that refuses the row must refuse the take-over (${JSON.stringify(seen)})`,
    );
    assert.match(
      seen.take_message,
      /ledger is unavailable/,
      "it was the decision that failed, not something before it",
    );
    assert.deepEqual(
      seen.after_take,
      {
        thread: { state: "open", assignee: null, paused: false, hold: null, holder: null },
        draft: "queued",
        job: "scheduled",
        escalation: "open",
        decisions: 0,
      },
      "the claim, the hold and the withdrawal went back with the decision",
    );
    assert.equal(seen.taken_raised, false, `with the ledger back, the take-over lands (${seen.taken_message ?? ""})`);
    assert.deepEqual(
      seen.taken,
      {
        thread: { state: "needs_human", assignee: owner.id, paused: true, hold: "person", holder: owner.id },
        draft: "canceled",
        job: "canceled",
        escalation: "open",
        decisions: 1,
      },
      "and writes all of it",
    );
    assert.equal(seen.give_raised, true, "a ledger that refuses the row must refuse the hand-back");
    assert.match(seen.give_message, /ledger is unavailable/);
    assert.deepEqual(
      seen.after_give,
      seen.taken,
      "REGRESSION: the release and the hold let go went back with the decision, so the person still has the thread and its hold, and the escalation is still open",
    );
  },
);
