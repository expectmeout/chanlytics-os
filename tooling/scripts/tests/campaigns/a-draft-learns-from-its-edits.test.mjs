/**
 * A draft learns from what its owner changed (decision 0078, step 2): a sequence to leads made from Ask's draft keeps
 * what Ask drafted in its make decision, beside the steps as the owner left them, and never in a step; the ledger's read
 * gives each sequence's newest make, a sequence to leads alone; and Ask's `edited` read says the member's own cold emails
 * whose first email is theirs, marking those words, and no other, as theirs on the turn.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, HOUR_MS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { makeSequenceNow } = await import("../../../../apps/dashboard/src/server/sequences/doors.ts");
const { readerCache } = await import("../../../../apps/dashboard/src/server/readers/index.ts");
const { newToolContext } = await import("../../../../apps/dashboard/src/server/ask/tools/index.ts");
const { editedOf, readEdited } = await import("../../../../apps/dashboard/src/server/ask/tools/read/sequences.ts");
const { sequenceMakes } = await import("@chanlytics/db");
beforeEach(() => readerCache.clear());

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ME = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MATE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SEARCH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const Q = (n) => `11111111-1111-4111-8111-00000000000${n}`;
const NOW = new Date("2026-10-30T14:00:00Z");
const ago = (hours) => new Date(NOW.getTime() - hours * HOUR_MS).toISOString();

/** Ask's email, and the owner's after they changed it. */
const ASKS = { subject: "A quick idea for your shop", body: "{{opening}}\n\nHello! We built a tool for shops." };
const MINE = { subject: "Phones at your shop", body: "{{opening}}\n\nSam here. Worth a chat? Cheers, Sam" };
const AS_DRAFTED = { asked: "Write to auto shops in Brooklyn", steps: [ASKS, null] };

/** A make decision as 00459 sequence_create_leads writes one: its payload is the make's, with what it adds. */
const make = (n, by, hoursAgo, extra = {}, starts = "leads", tenant = T) => ({
  id: `99999999-9999-4999-8999-00000000000${n}`,
  tenant_id: tenant,
  subject_type: "sequence",
  subject_id: Q(n),
  verb: "make_sequence",
  actor_type: "user",
  actor_user_id: by,
  payload: { name: `Sequence ${n}`, copied: null, steps: 2, started: true, starts, ...extra },
  undo_of: null,
  created_at: ago(hoursAgo),
});

/** A chain as Campaigns reads one (readers/playbooks.ts reachOutChains): what `edited` reads of it. */
const chain = (n, first, search = { id: SEARCH, name: "Auto shops in Brooklyn" }) => ({
  root_id: Q(n),
  name: `Sequence ${n}`,
  search,
  state: "running",
  steps: [{ id: Q(n), n: 1, after_days: null, hand: null, ...first }],
});

test("a sequence to leads made from Ask's draft keeps what Ask drafted in its make decision, never in a step; one without carries none", async () => {
  const calls = [];
  const supabase = fakeDb(
    {},
    {},
    {
      sequence_create: (args) => {
        calls.push(args);
        return { id: Q(1), steps: 1, state: "draft", decision_id: "d1" };
      },
    },
  );
  const ctx = { supabase, userId: ME, email: "sam@example.com", params: {} };
  const first = { starts: "leads", name: "Auto shops", search_id: SEARCH, steps: [{ ...MINE, after_days: null }] };
  await makeSequenceNow(ctx, T, { first: { ...first, as_drafted: AS_DRAFTED }, then: [], start: false });
  assert.deepEqual(calls[0].p_decision, { name: "Auto shops", copied: null, as_drafted: AS_DRAFTED });
  assert.equal("as_drafted" in calls[0].p_first, false, "never a step's");
  assert.equal(calls[0].p_first.steps[0].subject, MINE.subject, "the steps are the owner's");

  await makeSequenceNow(ctx, T, { first, then: [], start: false });
  assert.deepEqual(calls[1].p_decision, { name: "Auto shops", copied: null }, "a sequence by hand keeps no draft");
  // What a make takes of it is held to its shape before any write.
  await assert.rejects(
    makeSequenceNow(ctx, T, { first: { ...first, as_drafted: { asked: 1, steps: [] } }, then: [], start: false }),
  );
  assert.equal(calls.length, 2);
});

test("the ledger gives each sequence to leads its newest make, by id or by who made it since a moment; a sequence to people's is none", async () => {
  const decisions = [
    make(1, ME, 2, { as_drafted: AS_DRAFTED }),
    {
      ...make(1, ME, 1, { as_drafted: { asked: "Again", steps: [MINE] } }),
      id: "99999999-9999-4999-8999-000000000011",
    },
    make(2, MATE, 3),
    make(3, ME, 50),
    make(4, ME, 4, {}, "moment"),
    make(5, ME, 1, {}, "leads", OTHER),
  ];
  const db = fakeDb({ decisions }, {}, {});
  const byId = await sequenceMakes(db, { tenantId: T, ids: [Q(1), Q(2), Q(4)], limit: 20 });
  assert.deepEqual(
    byId.map((m) => [m.sequence_id, m.made_by, m.as_drafted?.asked ?? null]),
    [
      [Q(1), ME, "Again"],
      [Q(2), MATE, null],
    ],
    "the newest make of each, a sequence to people's left out, another workspace's never read",
  );
  const mine = await sequenceMakes(db, { tenantId: T, by: ME, since: ago(24), limit: 20 });
  assert.deepEqual(
    mine.map((m) => m.sequence_id),
    [Q(1)],
    "a teammate's, and one made before the moment, are not the member's since",
  );
  assert.deepEqual(await sequenceMakes(db, { tenantId: T, ids: [], limit: 20 }), []);
});

test("edited says the member's own cold emails whose first email is theirs: changed from Ask's draft, or written whole; one sent as drafted is not", () => {
  const makes = [
    { sequence_id: Q(1), made_by: ME, made_at: ago(1), as_drafted: AS_DRAFTED },
    { sequence_id: Q(2), made_by: ME, made_at: ago(2), as_drafted: { asked: "x", steps: [ASKS] } },
    { sequence_id: Q(3), made_by: ME, made_at: ago(3), as_drafted: null },
    { sequence_id: Q(4), made_by: ME, made_at: ago(4), as_drafted: null },
    { sequence_id: Q(5), made_by: ME, made_at: ago(5), as_drafted: AS_DRAFTED },
  ];
  const chains = [
    chain(1, MINE),
    chain(2, { ...ASKS, body: ASKS.body.replace("Hello!", "Hello! ") }),
    chain(3, { subject: "By my hand", body: "{{opening}}\n\nMine." }, null),
    chain(4, { subject: null, body: "", hand: { kind: "call", words: "Call them" } }),
  ];
  assert.deepEqual(editedOf(makes, chains), [
    {
      sequence_id: Q(1),
      name: "Sequence 1",
      for: "Auto shops in Brooklyn",
      state: "running",
      drafted: ASKS,
      sent: MINE,
    },
    {
      sequence_id: Q(3),
      name: "Sequence 3",
      for: null,
      state: "running",
      drafted: null,
      sent: { subject: "By my hand", body: "{{opening}}\n\nMine." },
    },
  ]);
});

test("Ask's edited read marks what the member sent as theirs on the turn, and only that; with none, it says so", async () => {
  const db = fakeDb({ decisions: [make(1, ME, 2, { as_drafted: AS_DRAFTED }), make(2, MATE, 2)] }, {}, {});
  const ctx = { supabase: db, userId: ME, email: "sam@example.com", params: {} };
  const t = newToolContext(ctx, T, "operator", "UTC", NOW);
  t.rc.turn.seed("reachOutChains", {
    chains: [chain(1, MINE), chain(2, { subject: "Mate's", body: "Theirs, not mine." })],
  });
  const out = await readEdited(t, {});
  assert.equal(out.days, 1);
  assert.deepEqual(
    out.edited.map((e) => [e.sequence_id, e.drafted?.subject ?? null, e.sent.subject]),
    [[Q(1), ASKS.subject, MINE.subject]],
  );
  assert.deepEqual(t.theirs, [MINE.subject, MINE.body], "the member's words, never Ask's draft or a teammate's");

  const none = newToolContext(ctx, T, "operator", "UTC", new Date(NOW.getTime() + 3 * DAY_MS));
  none.rc.turn.seed("reachOutChains", { chains: [chain(1, MINE)] });
  const quiet = await readEdited(none, { days: 1 });
  assert.deepEqual([quiet.edited, quiet.none], [[], "No cold email you made in the last day has words of your own."]);
  assert.equal(none.theirs?.length ?? 0, 0);
  assert.equal((await readEdited(none, { days: 7 })).edited.length, 1, "a week back reads it");
});

/* ------------------------------------------- the morning asks about edits only on a morning that has them */

const { morningQuestionFor } = await import("../../../../apps/dashboard/src/server/ask/companion/morning.ts");
const { ASK_MORNING_EDITED_QUESTION, ASK_MORNING_QUESTION, isAskMorningQuestion } =
  await import("@chanlytics/contracts");
const MEMBER = { tenantId: T, role: "operator", facts: null };

test("the morning reads the member's edited cold emails only on a morning after they edited one; any other morning asks as before", async () => {
  /** The morning's question for a world of makes, with the chains Campaigns reads seeded where any are named. */
  const asked = async (decisions, chains = null, faults = {}) => {
    const supabase = fakeDb({ decisions }, faults, {});
    const ctx = { supabase, userId: ME, email: "sam@example.com", params: {} };
    const t = newToolContext(ctx, T, "operator", "UTC", NOW);
    if (chains) t.rc.turn.seed("reachOutChains", { chains });
    return {
      question: await morningQuestionFor(ctx, MEMBER, NOW, t.rc),
      seen: supabase.seen.map((s) => s.table ?? s.rpc),
    };
  };
  // Changed from Ask's draft yesterday: the morning reads it.
  const edited = await asked([make(1, ME, 2, { as_drafted: AS_DRAFTED })], [chain(1, MINE)]);
  assert.equal(edited.question, ASK_MORNING_EDITED_QUESTION);
  // Nothing made: the ledger is read once, and the chains never.
  const none = await asked([]);
  assert.equal(none.question, ASK_MORNING_QUESTION);
  assert.deepEqual(none.seen, ["decisions"], "a member who made none costs one small read");
  // Sent as Ask drafted it, a teammate's edit, or one made before yesterday: as before.
  assert.equal(
    (await asked([make(1, ME, 2, { as_drafted: { asked: "x", steps: [MINE] } })], [chain(1, MINE)])).question,
    ASK_MORNING_QUESTION,
  );
  assert.equal(
    (await asked([make(1, MATE, 2, { as_drafted: AS_DRAFTED })], [chain(1, MINE)])).question,
    ASK_MORNING_QUESTION,
  );
  assert.equal(
    (await asked([make(1, ME, 30, { as_drafted: AS_DRAFTED })], [chain(1, MINE)])).question,
    ASK_MORNING_QUESTION,
  );
  // A ledger that cannot be read asks as before, and the morning still runs.
  assert.equal((await asked([], null, { "decisions.select": { message: "down" } })).question, ASK_MORNING_QUESTION);
  // Either question is the morning's: a turn Ask asks itself.
  assert.deepEqual([ASK_MORNING_QUESTION, ASK_MORNING_EDITED_QUESTION, "Good morning"].map(isAskMorningQuestion), [
    true,
    true,
    false,
  ]);
  assert.ok(
    ASK_MORNING_EDITED_QUESTION.startsWith(ASK_MORNING_QUESTION.slice(0, 200)),
    "the same morning, one sentence more",
  );
  assert.match(ASK_MORNING_EDITED_QUESTION, /edited/);
  assert.match(ASK_MORNING_EDITED_QUESTION, /you don't already remember, in any words/);
  assert.doesNotMatch(ASK_MORNING_QUESTION, /cold email/);
});
