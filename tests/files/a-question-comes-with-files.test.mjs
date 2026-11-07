/**
 * A question that comes with files (decision 0099, step 2). The real turn runs over a database in memory, an edge that answers
 * from memory and a scripted model. A thread keeps the ids alone, so a rename and a removal hold; the pictures go in ahead of the
 * words; a scope's picture is not sent to a live chain that holds it; and a later cold turn carries the name and the note.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

let copies = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/files/copies")) return realFetch(input, init);
  const { ids } = JSON.parse(init.body);
  return new Response(JSON.stringify({ ok: true, copies: ids.map((id) => ({ id, file_id: copies[id] ?? null })) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop/loop.ts"));
const { readThread, modelTurnOf, toMessageVM } = await import(at("apps/dashboard/src/server/ask/store.ts"));
const { attachedIdsOf } = await import(at("apps/dashboard/src/server/files/attached.ts"));
const { scopedRead } = await import(at("apps/dashboard/src/server/ask/cross-page.ts"));
const { prepareAskTurn } = await import(at("apps/dashboard/src/server/ask/turn.ts"));
const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt/prompt.ts"));
const { buildProposal, runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { withFilesAttached } = await import(at("apps/dashboard/src/server/files/line.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const THREAD = "99999999-9999-4999-8999-999999999999";
const TZ = "America/New_York";
const NOW = new Date("2026-11-05T12:00:00Z");
const ID = (n) => `ffffffff-0000-4000-8000-00000000000${n}`;

const fileRow = (n, over = {}) => ({
  id: ID(n),
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: `photo-${n}`,
  mime: "image/jpeg",
  bytes: 1000,
  width: 1200,
  height: 900,
  look: { line: `A shopfront, seen ${n}.`, people: { count: 0, recognizable: 0 } },
  look_status: "done",
  shows: "storefront",
  who_in_it: "not_asked",
  removed_at: null,
  created_at: `2026-11-0${n}T12:00:00Z`,
  updated_at: `2026-11-0${n}T12:00:00Z`,
  ...over,
});

const world = (extra = {}) => ({
  tenants: [{ id: A, name: "Harbor", slug: "harbor", timezone: TZ, status: "active" }],
  tenant_config: [],
  policies: [],
  memberships: [],
  ask_threads: [],
  ask_messages: [],
  files: [fileRow(1), fileRow(2), fileRow(3, { tenant_id: B }), fileRow(4, { removed_at: "2026-11-04T00:00:00Z" })],
  ...extra,
});
const ctxOf = (tables) => ({ supabase: fakeDb(tables, {}, {}), userId: USER, email: "ada@example.com", params: {} });
const member = { tenantId: A, role: "owner", userId: USER };

const asked = (over) => ({
  text: "",
  threadId: null,
  scope: undefined,
  surface: null,
  context: null,
  openedMs: null,
  answering: null,
  ...over,
});

const NONE = { kind: "none", id: "", label: "" };
const answerBlock = (headline) => ({
  type: "text",
  id: "",
  name: "",
  json: "",
  text: JSON.stringify({
    say: { headline, detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NONE } },
    do: { open: { source: NONE, label: "", now: false }, next: [] },
    language: "en",
  }),
});
const ROUND = (blocks) => ({ blocks, stopReason: "end_turn", streamError: null });

/** One turn on a scripted model, and the request it asked with. */
async function turnAsked(ctx, over, tool = runTool) {
  const requests = [];
  const round = async (c) => {
    requests.push(c.request);
    return ROUND([answerBlock("Seen.")]);
  };
  const r = await runAskTurn(
    {
      ctx,
      tenantId: A,
      role: "owner",
      facts: workspaceFacts("Harbor", TZ, null, NOW, []),
      timezone: TZ,
      personLabel: "ada@example.com (owner)",
      language: "en",
      scope: null,
      surface: "today",
      history: [],
      text: "What do you see?",
      emit: () => {},
      now: NOW,
      ...over,
    },
    { round, context: async () => null, shape: async () => "The workspace: Harbor", tool, propose: buildProposal },
  );
  assert.equal(r.failed, false, r.failure ?? "");
  return { r, content: requests[0].messages.findLast((m) => m.role === "user").content, request: requests[0] };
}
const seen = (content) =>
  content.map((b) => (b.type === "image" ? `image:${b.source.file_id}` : b.type === "text" ? b.text : b.type));

beforeEach(() => {
  readerCache.clear();
  copies = {};
});

/* ---------------------------------------------------- what the route takes */

test("the route takes ids in their shape, each once, ten at most, and anything else is none: never a refused question", () => {
  assert.deepEqual(attachedIdsOf([ID(1), ID(2), ID(1), "nope", 7, null]), [ID(1), ID(2)]);
  assert.deepEqual(attachedIdsOf("not a list"), []);
  assert.deepEqual(attachedIdsOf(undefined), []);
  const many = Array.from({ length: 14 }, (_, i) => `ffffffff-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`);
  assert.equal(attachedIdsOf(many).length, 10);
});

/* ---------------------------------------------------- what a thread keeps */

test("a thread keeps the ids alone, of files that are there for the person, in the order they were attached", async () => {
  const t = world();
  const prepared = await prepareAskTurn(
    ctxOf(t),
    member,
    asked({ text: "Which is better?", files: [ID(2), ID(9), ID(3), ID(4), ID(1)] }),
  );
  assert.deepEqual(
    prepared.attached.map((f) => f.id),
    [ID(2), ID(1)],
    "not one that does not exist, another workspace's, or one removed",
  );
  const row = t.ask_messages.at(-1);
  assert.deepEqual(row.content, { text: "Which is better?", files: [ID(2), ID(1)] }, "no name or note goes in the row");
  assert.equal(t.ask_threads.at(-1).title, "Which is better?");
});

test("a question of no words goes with a file that is there, titled by it; with none it is no question", async () => {
  const t = world();
  const prepared = await prepareAskTurn(ctxOf(t), member, asked({ files: [ID(1)] }));
  assert.equal(t.ask_threads.at(-1).title, "Photo 1", "the thread needs a name, and the file has one");
  assert.deepEqual(t.ask_messages.at(-1).content, { text: "", files: [ID(1)] });
  assert.deepEqual(prepared.offered, [], "an empty line is no question the next ones could repeat");
  const empty = world();
  await assert.rejects(
    prepareAskTurn(ctxOf(empty), member, asked({ files: [ID(3)] })),
    /Ask something/,
    "only another workspace's file named: nothing to ask",
  );
  assert.equal(empty.ask_threads.length, 0, "and nothing was kept");
});

/* ---------------------------------------------------- what the model sees */

test("the pictures go in ahead of the words, each named just before it, and an id reaches only the image block", async () => {
  copies = { [ID(1)]: "file_one", [ID(2)]: "file_two" };
  const ctx = ctxOf(world());
  const { content, request } = await turnAsked(ctx, {
    attached: [
      { id: ID(1), name: "photo-1", line: "A shopfront." },
      { id: ID(2), name: "photo-2", line: null },
    ],
  });
  assert.deepEqual(seen(content), [
    "The file photo-1, attached to this question:",
    "image:file_one",
    "The file photo-2, attached to this question:",
    "image:file_two",
    "What do you see?",
  ]);
  const words = JSON.stringify(request.messages.flatMap((m) => m.content).filter((b) => b.type !== "image"));
  assert.ok(!words.includes("file_one"), "the model never reads a copy's id as words");
});

test("a picture that can't be had is said, so Ask says so and never guesses from a note", async () => {
  copies = { [ID(1)]: "file_one" };
  const { content } = await turnAsked(ctxOf(world()), {
    attached: [
      { id: ID(1), name: "photo-1", line: "A shopfront." },
      { id: ID(2), name: "photo-2", line: "A sign." },
    ],
  });
  assert.deepEqual(seen(content), [
    "The file photo-1, attached to this question:",
    "image:file_one",
    "The file photo-2 is attached to this question, but could not be opened. Say so, and do not guess what it shows.",
    "What do you see?",
  ]);
});

test("no files: the question's blocks are what they always were, and no copy is asked for", async () => {
  const { content } = await turnAsked(ctxOf(world()), {});
  assert.deepEqual(seen(content), ["What do you see?"]);
});

/* ---------------------------------------------------- this photo */

test("the scope's file is read by its id, so a rename since is still the one on screen", async () => {
  assert.deepEqual(scopedRead({ kind: "file", id: ID(1), label: "An old name" }), {
    name: "files",
    input: { action: "view", names: [ID(1)] },
  });
  copies = { [ID(1)]: "file_one" };
  const ctx = ctxOf(world());
  const tc = newToolContext(ctx, A, "owner", TZ, NOW);
  const out = await runTool(tc, { name: "files", input: { action: "view", names: [ID(1)] } });
  assert.deepEqual(out.pictures, [{ name: "photo-1", id: ID(1), fileId: "file_one" }]);
  assert.ok(!out.result.includes("file_one"));
});

test("a scope on a file sends its picture with the question; a live chain that holds it is not sent it twice", async () => {
  copies = { [ID(1)]: "file_one" };
  const scope = { kind: "file", id: ID(1), label: "Photo 1" };
  const cold = await turnAsked(ctxOf(world()), { scope, context: null });
  assert.deepEqual(seen(cold.content).slice(-3), ["The file photo-1:", "image:file_one", "What do you see?"]);
  assert.ok(
    cold.content.some((b) => b.type === "search_result"),
    "and what is known of it rides beside it",
  );
  // A chain as the thread keeps one, whose earlier turn saw that picture: the follow-up carries the note, not the pixels.
  const earlier = cold.request.messages;
  const chain = {
    messages: earlier,
    anchor: null,
    results: [],
    model: cold.request.model,
    prefix: null,
    after: "a1",
    lastId: "m1",
    since: [],
    readAt: [Date.now()],
  };
  const { questionPictures } = await import(at("apps/dashboard/src/server/ask/loop/first-reads.ts"));
  const first = {
    scopedRow: { out: { pictures: [{ name: "photo-1", fileId: "file_one" }] } },
    attachedPictures: [],
  };
  assert.deepEqual(questionPictures(first, chain), [], "the chain holds it");
  assert.equal(questionPictures(first).length, 2, "cold, it goes again");
  const another = { scopedRow: { out: { pictures: [{ name: "photo-2", fileId: "file_two" }] } }, attachedPictures: [] };
  assert.equal(questionPictures(another, chain).length, 2, "a file the chain never saw goes");
  const reattached = {
    scopedRow: null,
    attachedPictures: [{ said: "The file photo-1, attached:", fileId: "file_one" }],
  };
  assert.equal(questionPictures(reattached, chain).length, 2, "what they attach goes, whatever the chain holds");
});

/* ---------------------------------------------------- a later turn */

test("the history says what a question came with, by the name that opens it now; one removed says so", () => {
  assert.equal(withFilesAttached("Which?", []), "Which?");
  assert.equal(
    withFilesAttached("Which?", [{ name: "front", line: "A shop." }, { name: "sign", line: null }, null]),
    "Which?\n[Attached: front (A shop.); sign; a file since removed]",
  );
  assert.equal(withFilesAttached("", [null]), "[Attached: a file since removed]", "a turn of no words is never empty");
});

test("a thread read back draws each file as it is now, and its history carries it", async () => {
  const t = world({
    ask_threads: [
      {
        id: THREAD,
        tenant_id: A,
        user_id: USER,
        title: "Which?",
        scope: null,
        last_at: "2026-11-05T11:00:00Z",
        created_at: "2026-11-05T11:00:00Z",
      },
    ],
    ask_messages: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        thread_id: THREAD,
        tenant_id: A,
        user_id: USER,
        role: "user",
        content: { text: "Which?", files: [ID(1), ID(4)] },
        created_at: "2026-11-05T11:00:00Z",
      },
    ],
    files: [fileRow(1, { name: "front-of-shop" }), fileRow(4, { removed_at: "2026-11-04T00:00:00Z" })],
  });
  const found = await readThread(ctxOf(t), THREAD);
  assert.deepEqual(found.messages[0].files, [
    { id: ID(1), name: "front-of-shop" },
    { id: ID(4), name: null },
  ]);
  assert.equal(found.turns[0].text, "Which?\n[Attached: front-of-shop (A shopfront, seen 1.); a file since removed]");
});

test("a thread with no files reads no file, and its turns are what they were", async () => {
  const t = world({
    ask_threads: [
      {
        id: THREAD,
        tenant_id: A,
        user_id: USER,
        title: "Hi",
        scope: null,
        last_at: "2026-11-05T11:00:00Z",
        created_at: "2026-11-05T11:00:00Z",
      },
    ],
    ask_messages: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        thread_id: THREAD,
        tenant_id: A,
        user_id: USER,
        role: "user",
        content: { text: "Hi" },
        created_at: "2026-11-05T11:00:00Z",
      },
    ],
  });
  const ctx = ctxOf(t);
  const found = await readThread(ctx, THREAD);
  assert.equal(found.messages[0].files, undefined);
  assert.equal(found.turns[0].text, "Hi");
  assert.equal(ctx.supabase.seen.filter((q) => q.table === "files").length, 0);
  const row = { id: "x", role: "user", created_at: "2026-11-05T11:00:00Z", content: { text: "Hi", files: [ID(1)] } };
  assert.deepEqual(
    toMessageVM(row).files,
    [{ id: ID(1), name: null }],
    "read with nothing known, a file is not drawn as there",
  );
  assert.equal(modelTurnOf(row).text, "Hi\n[Attached: a file since removed]");
});

test("an answer's history line says which files Ask opened in that turn, by the name that opens them now, so a cold turn knows what it saw", () => {
  const answer = {
    id: "y",
    role: "assistant",
    created_at: "2026-11-05T11:00:01Z",
    content: { text: "A shopfront at dusk.", opened: [ID(1)] },
  };
  assert.equal(modelTurnOf(answer).text, "A shopfront at dusk.\n[Opened: a file since removed]");
  const named = new Map([[ID(1), { id: ID(1), name: "photo-1", line: "Dusk." }]]);
  assert.equal(modelTurnOf(answer, named).text, "A shopfront at dusk.\n[Opened: photo-1 (Dusk.)]");
  assert.equal(modelTurnOf({ ...answer, content: { text: "Nothing opened" } }).text, "Nothing opened");
  assert.equal(
    modelTurnOf({ ...answer, role: "user", content: { text: "Hi", opened: [ID(1)] } }).text,
    "Hi",
    "a question opens nothing",
  );
});
