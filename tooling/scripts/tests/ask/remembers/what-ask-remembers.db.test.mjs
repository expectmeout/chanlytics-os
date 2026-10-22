/**
 * What Ask remembers, on a real database (00471; decision 0070), with real sessions: the memory's one door by act and
 * by role (an operator keeps and forgets their own line, the settings permission changes and forgets any, a viewer
 * neither, a stranger finds nothing; the same line twice is one line; forty live lines is full), the morning's door (the
 * day claimed once, a viewer refused, the thread named once and only with the member's own, the cards recorded once,
 * each member reading their own morning alone), the journal's door (the service's alone; a due day handed over once,
 * kept once; the owners alone read it), recall (a member finds their own turns, the workspace's memory, and the
 * journal only as an owner), and the rail and the morning's answer as the dashboard reads them (a morning past its day
 * is left off the thread list by the database, however many there are; Today reads the morning's own answer, never a
 * question asked after it in the same thread).
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows. The
 * members are real: made with the admin API and signed in through the anon key, so the grants and the row security
 * judge them as the dashboard's client would be judged.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ASK_MEMORY_LIMITS } from "@chanlytics/contracts";
import { askFirstAnswer } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, users and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const { listThreads } = skip
  ? { listThreads: null }
  : await import("../../../../../apps/dashboard/src/server/ask/store.ts");

const stamp = Date.now().toString(36);
const DAY = 86_400_000;
/** A UTC day, as the doors take it. */
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const TODAY = dayOf(Date.now());
const WORD = `balayage${stamp}`;

let db;
let A;
let B;
const users = [];
const as = {};

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
async function member(tenant, role, name) {
  const email = `remembers-${name}-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), `${name}'s seat`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), `${name} signs in`);
  return { client, id: made.data.user.id };
}
const memory = (who, act, args = {}) =>
  as[who].client.rpc("ask_memory_write", { p_tenant_id: args.tenant ?? A, p_act: act, ...args.p });
const morning = (who, act, p = {}) =>
  as[who].client.rpc("ask_morning_write", { p_tenant_id: A, p_day: TODAY, p_act: act, ...p });
async function threadOf(who, words) {
  const thread = ok(
    await db.from("ask_threads").insert({ tenant_id: A, user_id: as[who].id, title: "A thread" }).select("id").single(),
    "thread",
  ).id;
  ok(
    await db
      .from("ask_messages")
      .insert({ thread_id: thread, tenant_id: A, user_id: as[who].id, role: "user", content: { text: words } }),
    "message",
  );
  return thread;
}
const eventsOf = async (kind) =>
  ok(await db.from("events").select("kind, data").eq("tenant_id", A).eq("kind", kind), kind);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `remembers-${stamp}`, name: "Remembers Co", timezone: "UTC" })
      .select("id")
      .single(),
    "workspace",
  ).id;
  B = ok(
    await db
      .from("tenants")
      .insert({ slug: `remembers-other-${stamp}`, name: "Other Co", timezone: "UTC" })
      .select("id")
      .single(),
    "other workspace",
  ).id;
  as.owner = await member(A, "owner", "owner");
  as.operator = await member(A, "operator", "operator");
  as.viewer = await member(A, "viewer", "viewer");
  as.stranger = await member(B, "owner", "stranger");
});

after(async () => {
  if (skip) return;
  for (const id of [A, B]) if (id) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "the memory's door: kept by who approves, changed by who sets up, forgotten by either, never by a stranger",
  { skip },
  async () => {
    const kept = ok(
      await memory("operator", "keep", { p: { p_text: "  We   close early on Fridays.  ", p_source: "ask" } }),
      "keep",
    );
    assert.equal(kept.again, false);
    assert.equal(kept.memory.text, "We close early on Fridays.", "kept in one line of plain words");
    // The same line again, spelled another way, is the one kept.
    const again = ok(
      await memory("owner", "keep", { p: { p_text: "we close early on fridays.", p_source: "pane" } }),
      "again",
    );
    assert.deepEqual([again.again, again.memory.id], [true, kept.memory.id]);
    assert.deepEqual(ok(await memory("owner", "keep", { p: { p_text: " a " } }), "empty"), { error: "empty" });
    assert.deepEqual(ok(await memory("owner", "keep", { p: { p_text: "x".repeat(301) } }), "long"), {
      error: "too_long",
    });
    const viewerKeeps = await memory("viewer", "keep", { p: { p_text: "A viewer's fact." } });
    assert.equal(viewerKeeps.error?.code, "42501", "a viewer approves nothing, so keeps nothing");

    // Every member of the workspace reads its lines; a stranger reads none.
    const read = async (who) => ok(await as[who].client.from("ask_memory_lines").select("id").eq("tenant_id", A), who);
    assert.equal((await read("viewer")).length, 1);
    assert.equal((await read("stranger")).length, 0);

    // Changing is the settings permission's: an operator, a viewer and a stranger find no such line.
    for (const who of ["operator", "viewer", "stranger"]) {
      const r = await memory(who, "change", { p: { p_id: kept.memory.id, p_text: "We close at noon on Fridays." } });
      assert.equal(r.error?.code, "P0002", `${who} cannot change it`);
    }
    const changed = ok(
      await memory("owner", "change", { p: { p_id: kept.memory.id, p_text: "We close at noon on Fridays." } }),
      "change",
    );
    assert.deepEqual([changed.again, changed.memory.text], [false, "We close at noon on Fridays."]);

    // Forgetting: the member who kept it may (Ask's Undo), a stranger and a viewer may not; kept as forgotten.
    for (const who of ["viewer", "stranger"]) {
      const r = await memory(who, "forget", { p: { p_id: kept.memory.id } });
      assert.equal(r.error?.code, "P0002", `${who} cannot forget it`);
    }
    const theirs = ok(
      await memory("owner", "keep", { p: { p_text: "Parking is behind the shop.", p_source: "pane" } }),
      "owner's",
    );
    const notTheirs = await memory("operator", "forget", { p: { p_id: theirs.memory.id } });
    assert.equal(notTheirs.error?.code, "P0002", "an operator forgets their own line, not the owner's");
    assert.equal(ok(await memory("operator", "forget", { p: { p_id: kept.memory.id } }), "undo").again, false);
    assert.equal(ok(await memory("owner", "forget", { p: { p_id: kept.memory.id } }), "twice").again, true);
    const row = ok(
      await db.from("ask_memory_lines").select("forgotten_at, forgotten_by").eq("id", kept.memory.id).single(),
      "row",
    );
    assert.ok(row.forgotten_at, "forgotten, not deleted");
    assert.equal(row.forgotten_by, as.operator.id);

    // Each act leaves its event, naming the line and never its words.
    for (const kind of ["ask.memory_kept", "ask.memory_changed", "ask.memory_forgotten"]) {
      const rows = await eventsOf(kind);
      assert.ok(rows.length >= 1, kind);
      for (const e of rows) assert.ok(!JSON.stringify(e.data).includes("Friday"), `${kind} names no words`);
    }
  },
);

test("the memory holds forty live lines, as many as a turn reads; a forgotten one makes room", { skip }, async () => {
  const live = async () =>
    ok(await db.from("ask_memory_lines").select("id").eq("tenant_id", A).is("forgotten_at", null), "live");
  const room = ASK_MEMORY_LIMITS.liveMax - (await live()).length;
  ok(
    await db
      .from("ask_memory_lines")
      .insert(
        Array.from({ length: room }, (_, i) => ({ tenant_id: A, text: `Filler fact number ${i}.`, source: "pane" })),
      ),
    "filled",
  );
  assert.deepEqual(ok(await memory("owner", "keep", { p: { p_text: "One more fact." } }), "full"), { error: "full" });
  const [first] = await live();
  ok(await memory("owner", "forget", { p: { p_id: first.id } }), "forget one");
  assert.equal(ok(await memory("owner", "keep", { p: { p_text: "One more fact." } }), "room").again, false);
  ok(await db.from("ask_memory_lines").delete().eq("tenant_id", A).like("text", "Filler fact number %"), "emptied");
});

test(
  "the morning's door: the day claimed once, the thread named once with the member's own, the cards recorded once",
  { skip },
  async () => {
    const first = ok(await morning("owner", "claim"), "claim");
    assert.deepEqual(first, { claimed: true, thread_id: null, cards: null });
    assert.equal(ok(await morning("owner", "claim"), "a second tab").claimed, false, "a second claim runs nothing");
    assert.equal((await eventsOf("ask.morning_claimed")).length, 1, "one event, the winner's");
    assert.deepEqual(ok(await morning("viewer", "claim"), "viewer"), { error: "not_acting" });
    const far = await morning("owner", "claim", { p_day: dayOf(Date.now() + 3 * DAY) });
    assert.equal(far.error?.code, "22023", "never a day far from today");

    // The thread: never another member's, then the member's own, once.
    const operators = await threadOf("operator", "the operator's own question");
    assert.equal(ok(await morning("owner", "thread", { p_thread_id: operators }), "theirs").named, false);
    const own = await threadOf("owner", "the morning's question");
    assert.equal(ok(await morning("owner", "thread", { p_thread_id: own }), "own").named, true);
    const other = await threadOf("owner", "another question");
    assert.equal(ok(await morning("owner", "thread", { p_thread_id: other }), "again").named, false, "named once");

    assert.deepEqual(ok(await morning("owner", "answered", { p_cards: 2 }), "answered"), {
      recorded: true,
      thread_id: own,
      cards: 2,
    });
    assert.equal(ok(await morning("owner", "answered", { p_cards: 3 }), "twice").recorded, false, "recorded once");

    // Each member reads their own morning alone.
    const seen = async (who) => ok(await as[who].client.from("ask_mornings").select("user_id").eq("tenant_id", A), who);
    assert.equal((await seen("owner")).length, 1);
    assert.equal((await seen("operator")).length, 0);
  },
);

test(
  "the journal's door is the service's: a due day handed over once and kept once, read by owners alone",
  { skip },
  async () => {
    // Something happened in the workspace yesterday, by its own clock (UTC), which ended over an hour ago.
    const yesterday = dayOf(Date.now() - DAY);
    const noon = new Date(`${yesterday}T12:00:00Z`).toISOString();
    ok(
      await db.from("events").insert({
        tenant_id: A,
        kind: "contact.created",
        category: "system",
        subject_type: "workspace",
        subject_id: A,
        created_at: noon,
      }),
      "yesterday's event",
    );
    const refused = await as.owner.client.rpc("ask_journal_write", { p_act: "due", p_limit: 50 });
    assert.ok(refused.error, "a member cannot call the sweep's door");

    const due = ok(await db.rpc("ask_journal_write", { p_act: "due", p_limit: 50 }), "due");
    const mine = due.days.filter((d) => d.tenant_id === A);
    assert.deepEqual(
      mine.map((d) => [d.day, d.timezone]),
      [[yesterday, "UTC"]],
    );
    const again = ok(await db.rpc("ask_journal_write", { p_act: "due", p_limit: 50 }), "due again");
    assert.equal(again.days.filter((d) => d.tenant_id === A).length, 0, "a day is handed over once");

    const text = `A quiet morning, then a new ${WORD} client in the afternoon.`;
    const kept = ok(
      await db.rpc("ask_journal_write", {
        p_act: "keep",
        p_tenant_id: A,
        p_day: yesterday,
        p_text: text,
        p_rows_read: 1,
      }),
      "keep",
    );
    assert.deepEqual(kept, { day: { day: yesterday, state: "written" } });
    const twice = ok(
      await db.rpc("ask_journal_write", {
        p_act: "keep",
        p_tenant_id: A,
        p_day: yesterday,
        p_text: "again",
        p_rows_read: 1,
      }),
      "keep again",
    );
    assert.deepEqual(twice, { error: "not_found" }, "kept once");

    const read = async (who) => ok(await as[who].client.from("ask_journal_days").select("day").eq("tenant_id", A), who);
    assert.equal((await read("owner")).length, 1);
    assert.equal((await read("operator")).length, 0, "the journal is written from the Activity log, an owner's");
  },
);

test(
  "recall finds a member's own turns, the workspace's memory, and the journal only for an owner",
  { skip },
  async () => {
    await threadOf("owner", `How did the ${WORD} promo go?`);
    await threadOf("operator", `Book the ${WORD} for Ana`);
    ok(await memory("owner", "keep", { p: { p_text: `Our ${WORD} takes three hours.`, p_source: "pane" } }), "a line");
    const recall = async (who) =>
      ok(await as[who].client.rpc("search_ask", { p_tenant: A, p_words: WORD, p_limit: 10 }), `${who} recalls`);
    const kinds = (rows) => rows.map((r) => r.kind).sort();

    const owners = await recall("owner");
    assert.deepEqual(kinds(owners), ["journal", "memory", "turn"]);
    assert.ok(
      owners.find((r) => r.kind === "turn").snippet.includes("promo"),
      "the owner's own turn, not the operator's",
    );
    assert.deepEqual(kinds(await recall("operator")), ["memory", "turn"], "the operator's own turn and the memory");
    assert.deepEqual(await recall("stranger"), [], "a stranger finds nothing in another workspace");
    assert.deepEqual(
      ok(await as.owner.client.rpc("search_ask", { p_tenant: A, p_words: "   ", p_limit: 10 }), "nothing"),
      [],
      "nothing to look for answers nothing",
    );
  },
);

test(
  "the rail leaves a morning off once its day has passed, however many there are, and the morning reads its own answer",
  { skip },
  async () => {
    // Today's morning, a member's own conversation, and forty past mornings: more than the list holds.
    const today = await threadOf("owner", "today's morning question");
    ok(
      await db
        .from("ask_mornings")
        .insert({ tenant_id: A, user_id: as.owner.id, day: dayOf(Date.now() + DAY), thread_id: today }),
      "today's",
    );
    const mine = await threadOf("owner", "a question of my own");
    const past = [];
    for (let i = 2; i < 42; i += 1) {
      const t = await threadOf("owner", `the morning ${i} days ago`);
      past.push(t);
      ok(
        await db.from("ask_mornings").insert({
          tenant_id: A,
          user_id: as.owner.id,
          day: dayOf(Date.now() - i * DAY),
          thread_id: t,
          made_at: new Date(Date.now() - i * DAY).toISOString(),
        }),
        `a morning ${i} days ago`,
      );
    }
    // Every past morning was touched last, so a list that only left some out would show the rest first.
    ok(await db.from("ask_threads").update({ last_at: new Date().toISOString() }).in("id", past), "touched");
    const rail = (await listThreads({ supabase: as.owner.client, userId: as.owner.id }, A)).map((t) => t.id);
    assert.ok(rail.includes(today), "today's morning is on the list");
    assert.ok(rail.includes(mine), "and the member's own conversation");
    assert.deepEqual(
      rail.filter((id) => past.includes(id)),
      [],
      "REGRESSION: past mornings came back once there were more than a month of them",
    );

    // The morning's own answer, then a question asked after it in the same thread and its answer.
    const at = (ms) => new Date(ms).toISOString();
    const answer = (words, ms) =>
      db
        .from("ask_messages")
        .insert({
          thread_id: today,
          tenant_id: A,
          user_id: as.owner.id,
          role: "assistant",
          content: { v: 2, answer: { say: { headline: words, detail: "" } }, proposals: [] },
          created_at: at(ms),
        })
        .select("id")
        .single();
    const first = ok(await answer("Three things first.", Date.now() - 60_000), "the morning's answer").id;
    ok(await answer("Because Rosa has waited longest.", Date.now()), "a follow-up's answer");
    const read = await askFirstAnswer(as.owner.client, today);
    assert.equal(read.id, first, "REGRESSION: a follow-up in the morning's thread stood in for the morning");
    assert.equal(read.answer.say.headline, "Three things first.");
    assert.equal(await askFirstAnswer(as.operator.client, today), null, "another member reads nothing of it");
  },
);
