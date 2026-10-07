/**
 * The note sweep, run (0007 phase 2): POST /api/cron/notes over a database in memory, and the look loop it runs
 * (lib/notes.ts) with the model replaced by an answer the test writes.
 *
 * Most looks must end with nothing and never reach the model; the few that pass the checks go through the one door
 * and wait for Keep; the day's cap holds across a batch; a failing model costs its look, never the run.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { at, knock, answer, vault, withEnv } from "../_cron-doors-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "NOTE_SUGGESTIONS"])
  delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/cron/notes.ts"));
const { suggestNotes } = await import(at("apps/edge/lib/notes.ts"));
const { NOTE_SUGGEST_LIMITS } = await import("@chanlytics/contracts");
after(() => setPg(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const said = (text) => ({ who: "customer", text });
const us = (text) => ({ who: "business", text });
const TALK = [
  us("Thanks for calling, how can I help?"),
  said(
    "I'd like to book a colour, and please note I'm allergic to ammonia so use the gentle line, it burned my scalp last time I came in.",
  ),
  us("Of course, I'll send you the link."),
];
const look = (id, over = {}) => ({
  source: "call",
  tenant_id: A,
  contact_id: `c-${id}`,
  source_id: `s-${id}`,
  seconds: 180,
  dnc: false,
  last_suggested: null,
  workspace_today: 0,
  turns: TALK,
  known: [],
  ...over,
});
const FACT = {
  worth: true,
  kind: "sensitivity",
  text: "Allergic to ammonia; use the gentle line.",
  quote: "I'm allergic to ammonia so use the gentle line",
};
const silent = { info() {}, warn() {}, error() {} };

function world(candidates) {
  const suggested = [];
  const db = fakeDb(
    {},
    {},
    {
      ...vault,
      note_candidates: () => candidates,
      person_note_suggest: (a) => (suggested.push(a), { note: { id: `n-${suggested.length}` } }),
    },
  );
  return { db, suggested };
}

test("the door: the cron key or nothing, and NOTE_SUGGESTIONS=off stops it before a look is taken", async () => {
  const w = world([look(1)]);
  setPg(w.db);
  const [status] = await answer(await knock(POST, "notes", "wrong-key"));
  assert.ok(status === 401 || status === 403, `refused: ${status}`);
  await withEnv({ NOTE_SUGGESTIONS: "off" }, async () => {
    const [s, body] = await answer(await knock(POST, "notes"));
    assert.deepEqual([s, body], [200, { ok: true, off: true }]);
  });
  assert.ok(!w.db.seen.some((q) => q.rpc === "note_candidates"), "off means no look was taken, so none is spent");
});

test("with no model key a look ends as no_model, and nothing is written", async () => {
  const w = world([look(1)]);
  setPg(w.db);
  const [s, body] = await answer(await knock(POST, "notes"));
  assert.equal(s, 200);
  assert.deepEqual([body.looked, body.asked, body.suggested, body.ended], [1, 0, 0, { no_model: 1 }]);
  assert.deepEqual(w.suggested, []);
});

test("most looks end with nothing and never reach the model; the rare fact goes through the door as a suggestion, once", async () => {
  const w = world([
    look("short", { seconds: 20 }),
    look("few", { turns: [said("ok thanks bye")] }),
    look("dnc", { dnc: true }),
    look("recent", { last_suggested: new Date(Date.now() - 86_400_000).toISOString() }),
    look("nothing"),
    look("fact", { source: "thread", seconds: null }),
    look("money"),
  ]);
  const asked = [];
  const out = await suggestNotes({
    db: w.db,
    L: silent,
    nowMs: Date.now(),
    ask: async (system, user) => {
      asked.push(user);
      const n = asked.length;
      const a =
        n === 1
          ? { worth: false, kind: "none", text: "", quote: "" }
          : n === 2
            ? FACT
            : {
                worth: true,
                kind: "context",
                text: "Gets half off colour.",
                quote: "I'm allergic to ammonia so use the gentle line",
              };
      return { answer: a, tokens: { input: 900, output: 40 } };
    },
  });
  assert.equal(asked.length, 3, "four looks ended before any model call");
  assert.deepEqual(out.ended, { short_call: 1, few_words: 1, dnc: 1, cooldown: 1, nothing: 1, money: 1 });
  assert.equal(out.suggested, 1);
  assert.deepEqual(w.suggested, [
    {
      p_tenant_id: A,
      p_contact_id: "c-fact",
      p_body: "Allergic to ammonia; use the gentle line.",
      p_source: "thread",
      p_source_id: "s-fact",
    },
  ]);
});

test("the day's cap holds across one batch, and a failing model costs its look, never the run", async () => {
  const cap = NOTE_SUGGEST_LIMITS.perWorkspaceDay;
  const w = world([look("a", { workspace_today: cap - 1 }), look("b"), look("boom"), look("c")]);
  let n = 0;
  const out = await suggestNotes({
    db: w.db,
    L: silent,
    nowMs: Date.now(),
    ask: async () => {
      n += 1;
      if (n === 2) throw new Error("overloaded");
      return { answer: FACT, tokens: { input: 1, output: 1 } };
    },
  });
  assert.equal(out.suggested, 1, "the one the day had room for");
  assert.equal(out.ended.workspace_cap, 3, "the rest of the batch waits for tomorrow, before any model call");
  assert.equal(n, 1, "the model was asked once: a capped look costs nothing");
  assert.equal(w.suggested.length, 1);
  const w2 = world([look("x"), look("y")]);
  let m = 0;
  const out2 = await suggestNotes({
    db: w2.db,
    L: silent,
    nowMs: Date.now(),
    ask: async () => {
      m += 1;
      if (m === 1) throw new Error("overloaded");
      return { answer: FACT, tokens: { input: 1, output: 1 } };
    },
  });
  assert.deepEqual([out2.ended.model_failed, out2.suggested], [1, 1]);
});
