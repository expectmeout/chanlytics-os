/**
 * A reply keeps what the receptionist was told, on the database (00359; decision 0039), with real sessions: the one
 * write that keeps a turn and the prompt it read, the fence that holds a turn to a conversation of its own workspace,
 * what the tables refuse, who reads them (nobody signed in), how a turn leaves with its conversation, and the two
 * clocks run with their DEFAULTS, so a default that drifts from contracts' RETENTION_DAYS fails here.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows. The
 * member is real: made with the admin API and signed in through the anon key, so the grants judge them as the
 * dashboard's client would be judged.
 *
 * And the two halves joined: the receptionist's real door (apps/edge/lib/receptionist/brain.ts), over a scripted model,
 * writing through the real port to this database, so the write is proved as the edge sends it and not only as this
 * file spells it.
 */
import { test, before, after } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { RETENTION_DAYS } from "@chanlytics/contracts";
import { at } from "../_cron-doors-world.mjs";
import { scripted, json } from "./_model-world.mjs";
import { ROOT } from "../_source.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and rows, and runs two purges"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

const stamp = Date.now().toString(36);
const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
/** A hash of this run's own, in the shape the column takes (16 hex). */
const hash = (n) => `${stamp.padStart(12, "0").slice(-12)}${String(n).padStart(4, "0")}`.replace(/[^0-9a-f]/g, "a");
const PROMPT = "You are the receptionist for Example Studio. Open Monday to Friday, nine to five.";
const REQUEST = {
  now: "It is Monday, 10:02.",
  who: "Name on record: Ana.",
  steer: null,
  messages: [{ role: "user", content: "when do you open?" }],
  photo: null,
};
const RECORD = {
  reply: "We open at nine.",
  intent: "hours",
  escalate: false,
  reason: "",
  confidence: 0.92,
  facts_used: ["hours"],
  language: "en",
};
const RESPONSE = { stop_reason: "end_turn", text: JSON.stringify(RECORD), record: RECORD };

let db;
let A;
let B;
let threadA;
let threadB;
let owner; // an owner of A, signed in
const users = [];

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const workspace = async (slug) =>
  ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${stamp}`, name: slug })
      .select("id")
      .single(),
    slug,
  ).id;
async function threadIn(tenant, phone) {
  const person = ok(
    await db.from("contacts").insert({ tenant_id: tenant, phone_e164: phone }).select("id").single(),
    "contact",
  ).id;
  return ok(
    await db.from("conversations").insert({ tenant_id: tenant, contact_id: person }).select("id").single(),
    "conversation",
  ).id;
}
/** The write, as the model port sends it. */
const keep = (client, over = {}) =>
  client.rpc("model_turn_keep", {
    p_tenant_id: A,
    p_turn_id: globalThis.crypto.randomUUID(),
    p_conversation_id: threadA,
    p_prompt_hash: hash(1),
    p_prompt_text: PROMPT,
    p_request: REQUEST,
    p_response: RESPONSE,
    p_model: "claude-opus-5",
    p_latency_ms: 2140,
    ...over,
  });
const turnsOf = async (tenant) =>
  ok(await db.from("model_turns").select("*").eq("tenant_id", tenant).order("created_at"), "turns");
const promptsOf = async (tenant) =>
  ok(await db.from("model_prompts").select("*").eq("tenant_id", tenant).order("first_seen_at"), "prompts");

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await workspace("model-turns");
  B = await workspace("model-turns-other");
  threadA = await threadIn(A, "+15550100161");
  threadB = await threadIn(B, "+15550100162");
  const email = `turns-owner-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }), "seat");
  owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await owner.auth.signInWithPassword({ email, password }), "sign in");
});

after(async () => {
  if (skip) return;
  // The joined test's ledger rows, which a workspace's removal does not take.
  await db.from("ai_usage").delete().in("tenant_id", [A, B].filter(Boolean));
  for (const id of [A, B]) if (id) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "one write keeps the turn and the prompt it read; the prompt is kept once and its clock moved by the next turn",
  { skip },
  async () => {
    const first = globalThis.crypto.randomUUID();
    ok(await keep(db, { p_turn_id: first }), "keep");
    const [prompt] = await promptsOf(A);
    assert.deepEqual([prompt.prompt_hash, prompt.text], [hash(1), PROMPT]);
    assert.equal(prompt.first_seen_at, prompt.last_seen_at);
    const [turn] = await turnsOf(A);
    assert.deepEqual(
      [turn.id, turn.conversation_id, turn.prompt_hash, turn.model, turn.latency_ms],
      [first, threadA, hash(1), "claude-opus-5", 2140],
    );
    assert.deepEqual(turn.request, REQUEST);
    assert.deepEqual(turn.response, RESPONSE);

    // The next turn under the same prompt: its own row, the text still kept once. Its clock is counted in days, so a
    // turn the same day rewrites nothing (a row every reply rewrote would be a dead row a reply).
    ok(await keep(db, { p_prompt_text: "another writer's copy of the same hash changes nothing" }), "keep again");
    const prompts = await promptsOf(A);
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].text, PROMPT, "the text under a hash is the text");
    assert.equal(prompts[0].last_seen_at, prompts[0].first_seen_at, "the same day: its clock stands");
    assert.equal((await turnsOf(A)).length, 2);
    // Read again two days on, its clock moves to now.
    ok(
      await db
        .from("model_prompts")
        .update({ last_seen_at: ago(2) })
        .eq("tenant_id", A)
        .eq("prompt_hash", hash(1)),
      "two days ago",
    );
    ok(await keep(db), "keep two days on");
    const [moved] = await promptsOf(A);
    assert.ok(Date.now() - Date.parse(moved.last_seen_at) < 60_000, "a turn a day or more on moves it");
    ok(
      await db
        .from("model_turns")
        .delete()
        .eq("tenant_id", A)
        .eq("id", (await turnsOf(A)).at(-1).id),
      "tidy",
    );

    // The same turn sent twice (a retried write) is the turn it already is.
    ok(await keep(db, { p_turn_id: first, p_model: "someone-else" }), "keep the same turn");
    const again = await turnsOf(A);
    assert.equal(again.length, 2);
    assert.equal(again.find((t) => t.id === first).model, "claude-opus-5");

    // A turn that got no answer is kept with none: the three the port leaves out are null.
    ok(
      await db.rpc("model_turn_keep", {
        p_tenant_id: A,
        p_turn_id: globalThis.crypto.randomUUID(),
        p_conversation_id: threadA,
        p_prompt_hash: hash(1),
        p_prompt_text: PROMPT,
        p_request: REQUEST,
      }),
      "keep with no answer",
    );
    const unanswered = (await turnsOf(A)).at(-1);
    assert.deepEqual([unanswered.response, unanswered.model, unanswered.latency_ms], [null, null, null]);
  },
);

test(
  "a turn names a conversation of its own workspace: another workspace's is refused whole, its prompt with it",
  { skip },
  async () => {
    const crossed = await keep(db, { p_conversation_id: threadB, p_prompt_hash: hash(2) });
    assert.equal(
      crossed.error?.code,
      "23503",
      "the fence: (tenant_id, conversation_id) is a conversation of that workspace",
    );
    assert.equal((await promptsOf(A)).filter((p) => p.prompt_hash === hash(2)).length, 0, "nothing of it was kept");
    assert.equal((await turnsOf(B)).length, 0);
    const nowhere = await keep(db, { p_conversation_id: globalThis.crypto.randomUUID(), p_prompt_hash: hash(2) });
    assert.equal(nowhere.error?.code, "23503");
  },
);

test(
  "the tables refuse what is not a turn: a hash that is not one, an empty prompt, a request that is not a record",
  { skip },
  async () => {
    for (const [why, bad] of [
      ["a hash that is not hex", { p_prompt_hash: "not-a-hash-at-all" }],
      ["a hash too short", { p_prompt_hash: "abc123" }],
      ["a prompt with no text", { p_prompt_hash: hash(3), p_prompt_text: "" }],
      ["a request that is a list", { p_request: [REQUEST] }],
      ["a response that is words", { p_response: "We open at nine." }],
      ["a time that runs backwards", { p_latency_ms: -1 }],
      ["a model with no name", { p_model: "" }],
      ["a request past its size", { p_request: { messages: [{ role: "user", content: randomWords(1_400_000) }] } }],
      [
        "an answer past its size",
        { p_response: { stop_reason: "end_turn", text: randomWords(200_000), record: null } },
      ],
    ]) {
      assert.equal((await keep(db, bad)).error?.code, "23514", why);
    }
  },
);

/** Words that do not compress, so a size is the size the table measures. */
function randomWords(chars) {
  let out = "";
  while (out.length < chars) out += Math.random().toString(36).slice(2);
  return out.slice(0, chars);
}

test(
  "nobody signed in reads or writes a turn or a prompt, or calls the write or the clocks: an owner no more than anon",
  { skip },
  async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    for (const [who, client] of [
      ["an owner", owner],
      ["anon", anon],
    ]) {
      for (const table of ["model_turns", "model_prompts"]) {
        const read = await client.from(table).select("*").eq("tenant_id", A);
        assert.equal(read.error?.code, "42501", `${who} reads no ${table}`);
        const gone = await client.from(table).delete().eq("tenant_id", A);
        assert.equal(gone.error?.code, "42501", `${who} removes no ${table}`);
      }
      const wrote = await client.from("model_turns").insert({
        id: globalThis.crypto.randomUUID(),
        tenant_id: A,
        conversation_id: threadA,
        prompt_hash: hash(1),
        request: REQUEST,
      });
      assert.equal(wrote.error?.code, "42501", `${who} writes no turn`);
      assert.equal((await keep(client)).error?.code, "42501", `${who} may not call the write`);
      assert.equal(
        (await client.rpc("model_turns_scrub", { p_tenant_id: A, p_needles: ["5550100161"] })).error?.code,
        "42501",
        `${who} may not call an erasure's hand`,
      );
      assert.equal((await client.rpc("purge_model_turns")).error?.code, "42501", `${who} may not run the turns' clock`);
      assert.equal(
        (await client.rpc("purge_model_prompts")).error?.code,
        "42501",
        `${who} may not run the prompts' clock`,
      );
    }
    assert.ok((await turnsOf(A)).length >= 3, "and all of it stands");
  },
);

test(
  "a turn goes with its conversation, and the prompt it read stays for the turns that still read it",
  { skip },
  async () => {
    const thread = await threadIn(A, "+15550100163");
    ok(await keep(db, { p_conversation_id: thread }), "keep");
    assert.equal((await turnsOf(A)).filter((t) => t.conversation_id === thread).length, 1);
    ok(await db.from("conversations").delete().eq("id", thread), "delete the conversation");
    assert.equal((await turnsOf(A)).filter((t) => t.conversation_id === thread).length, 0);
    assert.equal((await promptsOf(A)).length, 1);
  },
);

test(
  "the clocks, run with their defaults, keep what contracts say: thirty days of turns, and a prompt 400 days past its last turn",
  { skip },
  async () => {
    // Rows aged by the service role's own hand, a day either side of each keep.
    const aged = (days) => ({
      id: globalThis.crypto.randomUUID(),
      tenant_id: A,
      conversation_id: threadA,
      prompt_hash: hash(1),
      request: REQUEST,
      created_at: ago(days),
    });
    const old = aged(RETENTION_DAYS.model_turns + 1);
    const young = aged(RETENTION_DAYS.model_turns - 1);
    ok(await db.from("model_turns").insert([old, young]), "aged turns");
    const turns = await db.rpc("purge_model_turns");
    assert.equal(turns.error, null, turns.error?.message);
    assert.ok(turns.data >= 1, `answers how many it removed (${turns.data})`);
    const left = (await turnsOf(A)).map((t) => t.id);
    assert.ok(!left.includes(old.id), "a turn past its keep is gone");
    assert.ok(left.includes(young.id), "a turn inside it stays");

    const prompt = (days, n) => ({
      tenant_id: A,
      prompt_hash: hash(n),
      text: "An older prompt.",
      first_seen_at: ago(days + 30),
      last_seen_at: ago(days),
    });
    ok(
      await db
        .from("model_prompts")
        .insert([prompt(RETENTION_DAYS.model_prompts + 1, 7), prompt(RETENTION_DAYS.model_prompts - 1, 8)]),
      "aged prompts",
    );
    const prompts = await db.rpc("purge_model_prompts");
    assert.equal(prompts.error, null, prompts.error?.message);
    assert.ok(prompts.data >= 1, `answers how many it removed (${prompts.data})`);
    const hashes = (await promptsOf(A)).map((p) => p.prompt_hash);
    assert.ok(!hashes.includes(hash(7)), "a prompt no turn has read for its keep is gone");
    assert.ok(hashes.includes(hash(8)), "one read inside it stays");
    assert.ok(hashes.includes(hash(1)), "and the prompt in use was never near its clock");

    // A prompt read again is kept again from that day: the write moves its clock.
    ok(
      await db
        .from("model_prompts")
        .update({ last_seen_at: ago(RETENTION_DAYS.model_prompts + 5) })
        .eq("tenant_id", A)
        .eq("prompt_hash", hash(8)),
      "age it",
    );
    ok(await keep(db, { p_prompt_hash: hash(8), p_prompt_text: "An older prompt." }), "read it again");
    ok(await db.rpc("purge_model_prompts"), "purge");
    assert.ok((await promptsOf(A)).map((p) => p.prompt_hash).includes(hash(8)));
  },
);

test(
  "an erasure's hand deletes the workspace's turns that name the person, in anyone's thread, and no other workspace's",
  { skip },
  async () => {
    const NEEDLE = "6465550177";
    const named = (over = {}) => ({
      p_request: { ...REQUEST, who: `Name on record: Bo. A note says: ask Ada on +1${NEEDLE} first.` },
      ...over,
    });
    const quoting = globalThis.crypto.randomUUID();
    const answering = globalThis.crypto.randomUUID();
    const other = globalThis.crypto.randomUUID();
    const theirs = globalThis.crypto.randomUUID();
    ok(await keep(db, named({ p_turn_id: quoting })), "a turn whose notes name them");
    ok(
      await keep(db, {
        p_turn_id: answering,
        p_response: { ...RESPONSE, text: `Call ADA@Example.com or ${NEEDLE}` },
      }),
      "a turn whose answer names them",
    );
    ok(await keep(db, { p_turn_id: other }), "a turn that names nobody");
    ok(
      await keep(db, named({ p_turn_id: theirs, p_tenant_id: B, p_conversation_id: threadB })),
      "another workspace's turn with the same words",
    );
    const left = async () => (await turnsOf(A)).map((t) => t.id);

    // A needle under six characters finds nothing, and one's own LIKE characters are characters.
    for (const needles of [[], ["0177"], ["%"], ["______"]]) {
      const none = await db.rpc("model_turns_scrub", { p_tenant_id: A, p_needles: needles });
      assert.deepEqual([none.error, none.data], [null, 0], JSON.stringify(needles));
    }
    assert.ok((await left()).includes(quoting) && (await left()).includes(answering));

    const byNumber = await db.rpc("model_turns_scrub", { p_tenant_id: A, p_needles: [NEEDLE] });
    assert.deepEqual([byNumber.error, byNumber.data], [null, 2], "both turns that spell the number");
    assert.ok(!(await left()).includes(quoting) && !(await left()).includes(answering));
    assert.ok((await left()).includes(other), "a turn that names nobody stays");
    assert.deepEqual(
      (await turnsOf(B)).map((t) => t.id),
      [theirs],
      "and another workspace's turn is another workspace's",
    );
    // By an address, whatever its case.
    const mailed = globalThis.crypto.randomUUID();
    ok(await keep(db, { p_turn_id: mailed, p_response: { ...RESPONSE, text: "Write to ADA@Example.com" } }), "keep");
    const byAddress = await db.rpc("model_turns_scrub", { p_tenant_id: A, p_needles: ["ada@example.com"] });
    assert.equal(byAddress.data, 1);
    ok(await db.from("model_turns").delete().eq("id", theirs), "tidy");
  },
);

test(
  "the operator's reader prints a kept turn from this database, by the turn and by its conversation",
  { skip },
  async () => {
    const id = globalThis.crypto.randomUUID();
    ok(await keep(db, { p_turn_id: id }), "keep");
    const read = (...args) =>
      spawnSync(process.execPath, ["tooling/scripts/ops/turn-read.mjs", ...args], {
        cwd: ROOT,
        env: { ...process.env, SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY },
        encoding: "utf8",
      });
    const one = read("--turn", id);
    assert.equal(one.status, 0, one.stderr);
    assert.ok(one.stdout.includes(`Turn ${id}`) && one.stdout.includes(PROMPT), "the turn, and the prompt it read");
    assert.match(one.stdout, /\[customer\] when do you open\?/);
    assert.match(one.stdout, /--- What it answered\nWe open at nine\./);
    const listed = read("--conversation", threadA);
    assert.equal(listed.status, 0, listed.stderr);
    assert.ok(
      listed.stdout.includes(id) && /hours, 92% sure/.test(listed.stdout),
      "its line in the conversation's list",
    );
    const none = read("--turn", globalThis.crypto.randomUUID());
    assert.equal(none.status, 1);
    assert.match(none.stderr, /is not kept/);
    const whose = read("--conversation", globalThis.crypto.randomUUID());
    assert.equal(whose.status, 1);
    assert.match(whose.stderr, /No conversation /);
  },
);

test(
  "the receptionist's own door keeps its turn on a real database, and a turn the database refuses costs the reply nothing",
  { skip },
  async () => {
    const held = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
    const { setPg } = await import(at("apps/edge/lib/pg.ts"));
    const { setModelFetch, promptHashOf } = await import(at("apps/edge/lib/model.ts"));
    const { generateReply } = await import(at("apps/edge/lib/receptionist/brain.ts"));
    const system = `${PROMPT} Closed on public holidays. (${stamp})`;
    const ask = (conversation) =>
      generateReply(
        [
          { role: "user", content: "hello" },
          { role: "assistant", content: "Hi Ana, how can I help?" },
        ],
        "when do you open?",
        system,
        "Hold on.",
        "Name on record: Ana.",
        "It is Monday, 10:02.",
        undefined,
        undefined,
        { tenantId: A, subjectId: conversation, configVersion: 1 },
      );
    setPg(db);
    setModelFetch(scripted(json(RESPONSE.record)).fetch);
    const lines = [];
    const real = console.error;
    console.error = (...a) => lines.push(a.join(" "));
    try {
      const reply = await ask(threadA);
      assert.equal(reply.text, "We open at nine.");
      const [turn] = ok(await db.from("model_turns").select("*").eq("id", reply.meta.turn_id), "the turn it names");
      assert.ok(turn, "the reply names a turn that is there");
      assert.deepEqual([turn.tenant_id, turn.conversation_id, turn.prompt_hash], [A, threadA, promptHashOf(system)]);
      assert.deepEqual(turn.request.messages, [
        { role: "user", content: "hello" },
        { role: "assistant", content: "Hi Ana, how can I help?" },
        { role: "user", content: "when do you open?" },
      ]);
      assert.equal(turn.request.now, "It is Monday, 10:02.");
      assert.match(turn.request.who, /Name on record: Ana\.$/);
      assert.deepEqual(turn.response, RESPONSE);
      assert.ok(turn.latency_ms >= 0 && typeof turn.model === "string");
      const [prompt] = ok(
        await db.from("model_prompts").select("text").eq("tenant_id", A).eq("prompt_hash", promptHashOf(system)),
        "the prompt it read",
      );
      assert.equal(prompt.text, system);
      assert.deepEqual(
        lines.filter((l) => l.includes("model_turn_write_failed")),
        [],
      );

      // A subject that is no conversation of the workspace: the fence refuses the turn, and the reply goes as it would.
      const before = (await turnsOf(A)).length;
      const crossed = await ask(threadB);
      assert.equal(crossed.text, "We open at nine.");
      assert.equal(crossed.meta.intent, "hours");
      assert.equal(crossed.meta.turn_id, undefined);
      assert.equal((await turnsOf(A)).length, before);
      assert.equal((await turnsOf(B)).length, 0);
      assert.equal(lines.filter((l) => l.includes("model_turn_write_failed")).length, 1);
    } finally {
      console.error = real;
      setPg(null);
      setModelFetch(null);
      if (held === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = held;
    }
  },
);
