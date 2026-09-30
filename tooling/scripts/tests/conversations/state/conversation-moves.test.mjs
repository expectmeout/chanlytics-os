/**
 * A thread's state moves by one table (contracts conversation-moves.ts), and every TypeScript writer of
 * `conversations.state` writes its move's patch: the dashboard's thread ports and a reply's claim, db's hand-off and
 * the owner's echo, each run over the database in memory and read back from the statement it sent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSATION_MOVES,
  CONVERSATION_STATES,
  conversationMoveAllowed,
  conversationPatch,
} from "@chanlytics/contracts";
import { pauseConversation, recordEchoAndPause } from "@chanlytics/db";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";

const { threadPorts, replyPorts } = await import("../../../../../apps/dashboard/src/server/ports/core-ports.ts");
const core = await importSrc("packages/core/src/conversations/index.ts");

const UNTIL = "2026-09-29T15:00:00.000Z";
const AT = "2026-09-29T12:00:00.000Z";
const INPUT = { until: UNTIL, user: "u1", now: AT };
const MOVES = Object.keys(CONVERSATION_MOVES);

/** The columns the session role may update on a thread (00037's grant, which hygiene.test.mjs reads). */
const GRANTED = ["state", "paused_until", "snooze_until", "assignee_user_id", "last_message_at"];

/** The inputs a move names, each given. */
const inputOf = (move) =>
  Object.fromEntries(
    Object.values(CONVERSATION_MOVES[move].sets)
      .filter((v) => v !== null)
      .map((v) => [v, INPUT[v]]),
  );

/** A thread in `state`, with everything a move could clear set. */
const thread = (state, over = {}) => ({
  id: "c1",
  tenant_id: "t1",
  contact_id: "p1",
  state,
  paused_until: "2026-09-29T13:00:00.000Z",
  snooze_until: "2026-09-30T10:00:00.000Z",
  assignee_user_id: "u2",
  last_message_at: "2026-09-28T09:00:00.000Z",
  ...over,
});

/** The one UPDATE a writer sent to conversations: its values. */
function written(db) {
  const updates = db.seen.filter((q) => q.table === "conversations" && q.op === "update");
  assert.equal(updates.length, 1, `one update of the thread: ${JSON.stringify(updates)}`);
  return updates[0].values;
}

test("the table: every state is reachable, every move starts from states and ends in one, and each state is left somehow", () => {
  for (const [move, m] of Object.entries(CONVERSATION_MOVES)) {
    assert.ok(CONVERSATION_STATES.includes(m.to), `${move} ends in a state`);
    assert.ok(m.from.length > 0, `${move} starts somewhere`);
    for (const s of m.from) assert.ok(CONVERSATION_STATES.includes(s), `${move} starts from ${s}, a state`);
  }
  for (const s of CONVERSATION_STATES) {
    assert.ok(
      MOVES.some((move) => CONVERSATION_MOVES[move].to === s),
      `${s} is reachable`,
    );
    assert.ok(
      MOVES.some((move) => CONVERSATION_MOVES[move].to !== s && conversationMoveAllowed(move, s)),
      `${s} can be left`,
    );
  }
});

test("a move's patch is its state and exactly the columns it sets, each from its input; a missing input is refused; the columns are the session role's grant", () => {
  for (const move of MOVES) {
    const m = CONVERSATION_MOVES[move];
    const patch = conversationPatch(move, inputOf(move));
    assert.deepEqual(
      patch,
      {
        state: m.to,
        ...Object.fromEntries(Object.entries(m.sets).map(([col, from]) => [col, from === null ? null : INPUT[from]])),
      },
      move,
    );
    for (const col of Object.keys(patch)) assert.ok(GRANTED.includes(col), `${move} writes ${col}, a granted column`);
    if (Object.keys(inputOf(move)).length) assert.throws(() => conversationPatch(move, {}), /needs/, move);
  }
  assert.deepEqual(conversationPatch("take_over", { until: UNTIL, user: "u1" }), {
    state: "needs_human",
    paused_until: UNTIL,
    snooze_until: null,
    assignee_user_id: "u1",
  });
  assert.deepEqual(conversationPatch("wake"), { state: "open", snooze_until: null });
});

test("a move is allowed from its states and no other", () => {
  for (const move of MOVES)
    for (const s of CONVERSATION_STATES)
      assert.equal(conversationMoveAllowed(move, s), CONVERSATION_MOVES[move].from.includes(s), `${move} from ${s}`);
  assert.equal(conversationMoveAllowed("wake", "needs_human"), false);
  assert.equal(conversationMoveAllowed("reopen", "needs_human"), false, "a customer never overrides a person");
  assert.equal(conversationMoveAllowed("wake", "closed"), false, "not a state");
});

test("the dashboard's thread ports write their moves' patches, whatever state the thread was in", async () => {
  const cases = [
    ["take_over", (p) => p.claim("c1", UNTIL, "u1"), { until: UNTIL, user: "u1" }],
    ["hand_back", (p) => p.release("c1")],
    ["snooze", (p) => p.snooze("c1", UNTIL), { until: UNTIL }],
    ["archive", (p) => p.archive("c1")],
  ];
  for (const [move, call, input] of cases)
    for (const from of CONVERSATION_MOVES[move].from) {
      const t = { conversations: [thread(from)] };
      const db = fakeDb(t);
      assert.equal(await call(threadPorts({ supabase: db, userId: "u1" })), true, `${move} from ${from}`);
      const patch = conversationPatch(move, ...(input ? [input] : []));
      assert.deepEqual(written(db), patch, `${move} from ${from}: the move's patch`);
      assert.deepEqual(t.conversations[0], { ...thread(from), ...patch }, `${move} from ${from}: the row`);
    }
});

test("wake writes its patch from the states it may start from, and leaves every other thread as it was; core's wake refuses the same states", async () => {
  for (const from of CONVERSATION_STATES) {
    const t = { conversations: [thread(from)] };
    const db = fakeDb(t);
    const allowed = conversationMoveAllowed("wake", from);
    assert.equal(await threadPorts({ supabase: db, userId: "u1" }).wake("c1"), allowed, `wake from ${from}`);
    assert.deepEqual(written(db), conversationPatch("wake"));
    assert.deepEqual(t.conversations[0], allowed ? { ...thread(from), ...conversationPatch("wake") } : thread(from));

    const ports = { wake: async () => true, record: async () => "d1" };
    const verb = core.wake(ports, { conv: { id: "c1", tenant_id: "t1", state: from } });
    if (allowed) assert.deepEqual(await verb, { state: "open", decision_id: "d1" });
    else await assert.rejects(verb, (e) => e.code === "conflict", `core refuses a wake from ${from}`);
  }
});

test("a reply's claim writes reply_claim's patch", async () => {
  for (const from of CONVERSATION_MOVES.reply_claim.from) {
    const t = { conversations: [thread(from)] };
    const db = fakeDb(t);
    assert.equal(await replyPorts({ supabase: db, userId: "u1" }).claimForReply("c1", UNTIL, "u1", AT), true);
    assert.deepEqual(written(db), conversationPatch("reply_claim", { until: UNTIL, user: "u1", now: AT }), from);
  }
});

test("db's hand-off writes hand_off's patch: the pause alone, whatever else the thread holds", async () => {
  for (const from of CONVERSATION_MOVES.hand_off.from) {
    const t = { conversations: [thread(from)], messages: [] };
    const db = fakeDb(t);
    assert.equal(await pauseConversation(db, "t1", "c1", UNTIL), true, from);
    assert.deepEqual(written(db), conversationPatch("hand_off", { until: UNTIL }), from);
    assert.deepEqual(t.conversations[0], { ...thread(from), state: "needs_human", paused_until: UNTIL });
  }
});

test("the owner's echo writes owner_echo's patch, the thread touched at the moment it ran", async () => {
  for (const from of CONVERSATION_MOVES.owner_echo.from) {
    const t = {
      contacts: [{ id: "p1", tenant_id: "t1", phone_e164: "+15555550101", consent: "opted_in", dnc: false }],
      conversations: [thread(from)],
      messages: [],
    };
    // A person is one row per number (contacts' unique index): the echo finds theirs, and so their thread.
    const one = {
      table: "contacts",
      name: "contacts_tenant_phone",
      columns: ["tenant_id", "phone_e164"],
      where: () => true,
    };
    const db = fakeDb(t, {}, {}, { uniqueIndexes: [one] });
    const before = Date.now();
    await recordEchoAndPause(db, {
      tenantId: "t1",
      customerPhoneDigits: "15555550101",
      body: "On my way",
      externalId: "wamid.echo-1",
      pausedUntilIso: UNTIL,
    });
    const values = written(db);
    const at = Date.parse(values.last_message_at);
    assert.ok(at >= before && at <= Date.now(), `touched now: ${values.last_message_at}`);
    assert.deepEqual(values, conversationPatch("owner_echo", { until: UNTIL, now: values.last_message_at }), from);
  }
});
