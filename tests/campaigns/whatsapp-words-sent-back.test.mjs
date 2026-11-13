/**
 * PUT templates/[id] { words }: WhatsApp's words changed in Messages and sent back to WhatsApp (template-words.ts), run
 * through route() with the database in memory and the edge stubbed with the provider guard open, so a change sent to
 * WhatsApp is a call this file counts and nothing leaves the machine.
 *
 * What the live demo found (12 Nov 2026), and what is proved here: a message WhatsApp never held (no id of Meta's) is
 * said plainly and the edge is not asked; a send going out with the words now refuses the change, as a delete is refused,
 * since WhatsApp's look stops its WhatsApp people part-way; the approved words a change replaces are kept on the ledger,
 * so a refusal of the new ones can go back to them; and a reason the edge gives with no sentence of its own reaches the
 * person in plain words, never as its code.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The provider guard is read once, as its module loads: open it before the route is imported, onto a stubbed edge.
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
delete process.env.DIAG_KEY;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { WORDS_SAID } = await import(at("apps/dashboard/src/server/campaigns/template-words.ts"));
const route = await import(at("apps/dashboard/app/api/v1/templates/[id]/route.ts"));

const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const ROW = "77777777-7777-4777-8777-000000000001";
const APPROVED = "Hi {{1}}, just checking you had a chance to look at the proposal.";
const NEW_WORDS = "Hi {{1}}, did you get a chance to read the proposal? Happy to answer anything.";

/** A WhatsApp row as the table holds it: approved, held by WhatsApp (its id of Meta's), one value. */
const row = (over = {}) => ({
  id: ROW,
  tenant_id: B,
  channel: "whatsapp",
  name: "proposal_nudge",
  language: "en_US",
  body_preview: APPROVED,
  components: [{ type: "BODY", text: APPROVED }],
  variables: [{ position: 1, label: "First name", example: "Dana" }],
  category: "marketing",
  meta_status: "approved",
  meta_id: "meta-1",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "chanlytics",
  hidden_at: null,
  title: null,
  ...over,
});

/** The edge's edit door, stubbed: taken (the default), or answering a refusal as its door does. Each call is kept. */
function stubEdge(answer = null) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const where = String(url);
    if (!where.endsWith("/api/admin/whatsapp/templates-edit")) throw new Error(`nothing else is reachable: ${where}`);
    calls.push(JSON.parse(String(init?.body ?? "{}")));
    if (answer) return new Response(JSON.stringify({ ok: false, ...answer.body }), { status: answer.status });
    return new Response(JSON.stringify({ ok: true, id: ROW, meta_status: "pending" }), { status: 200 });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}

let edge;
beforeEach(() => setRateStore(memoryStore()));
afterEach(() => {
  edge?.restore();
  setServiceClient(null);
});

/** A world: an operator's workspace holding the row, the sends of it the case names, and the edge as the case says. */
function open({ over = {}, batches = [], answer = null } = {}) {
  const tables = {
    memberships: [
      {
        user_id: USER,
        tenant_id: B,
        role: "operator",
        tenants: { slug: "bayside" },
        created_at: "2026-02-01T00:00:00Z",
      },
    ],
    tenants: [{ id: B, name: "Bayside", timezone: "America/New_York" }],
    templates: [row(over)],
    sequence_batches: batches,
    events: [],
  };
  setServiceClient(fakeDb(tables, {}, {}));
  edge = stubEdge(answer);
  const ctx = { supabase: fakeDb(tables, {}, {}), userId: USER, email: "ada@example.com", params: { id: ROW } };
  const put = (body) =>
    route.PUT.run(
      new Request(`http://localhost/api/v1/templates/${ROW}?workspace=${B}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
      ctx,
    );
  return { tables, put };
}

async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("a message WhatsApp holds no copy of (never sent there) is said plainly, and the edge is not asked", async () => {
  const w = open({ over: { meta_id: null } });
  await refused(w.put({ words: { body: NEW_WORDS } }), "conflict", 409, WORDS_SAID.notAtWhatsApp);
  assert.deepEqual(edge.calls, []);
  assert.doesNotMatch(WORDS_SAID.notAtWhatsApp, /not_found|\(/, "never a code");
});

test("a send going out with the words now refuses the change, as a delete is refused: WhatsApp's look would stop it part-way", async () => {
  const sending = {
    id: "b1",
    tenant_id: B,
    template_name: "proposal_nudge",
    template_language: "en_US",
    state: "sending",
  };
  const w = open({ batches: [sending] });
  await refused(w.put({ words: { body: NEW_WORDS } }), "conflict", 409, WORDS_SAID.sending);
  assert.deepEqual(edge.calls, [], "nothing sent to WhatsApp");
  // A send of another language, or one that has gone, holds nothing back.
  const other = open({
    batches: [
      { ...sending, template_language: "es" },
      { ...sending, id: "b2", state: "sent" },
    ],
  });
  const r = await other.put({ words: { body: NEW_WORDS } });
  assert.equal(r.meta_status, "pending");
});

test("approved words a change replaces are kept on the ledger with it, so a refusal of the new ones can go back to them", async () => {
  const w = open();
  const r = await w.put({ words: { body: NEW_WORDS } });
  assert.equal(r.meta_status, "pending");
  assert.equal(edge.calls.length, 1);
  assert.equal(edge.calls[0].body, NEW_WORDS);
  const said = w.tables.events.filter((e) => e.kind === "template.submitted");
  assert.equal(said.length, 1);
  assert.equal(said[0].subject_id, ROW);
  assert.equal(said[0].data.before, APPROVED, "the words WhatsApp had approved");

  // Words that were not approved (a refused message's) are no way back: nothing is kept as `before`.
  const again = open({ over: { meta_status: "rejected", rejected_reason: "Promotional words" } });
  await again.put({ words: { body: NEW_WORDS } });
  const second = again.tables.events.filter((e) => e.kind === "template.submitted");
  assert.equal(second.length, 1);
  assert.equal("before" in second[0].data, false);
});

test("a reason the edge gives with no sentence of its own reaches the person in plain words, never as its code", async () => {
  const w = open({ answer: { status: 503, body: { error: "timeout" } } });
  await assert.rejects(w.put({ words: { body: NEW_WORDS } }), (e) => {
    assert.doesNotMatch(e.message, /timeout|could not be submitted \(/, e.message);
    assert.match(e.message, /WhatsApp could not be reached just now/);
    return true;
  });
});

/* ------------------------------ Ask's fix for a refusal, kept ------------------------------ */

const { keepFixWords } = await import(at("apps/dashboard/src/server/campaigns/template-words.ts"));
const kernel = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { templates: templatesReader } = await import(at("apps/dashboard/src/server/readers/templates.ts"));

test("Ask's new words for a refused message are kept on the ledger with the refusal they answer; a version not refused keeps none", async () => {
  const refusal = "The words promise a discount without terms.";
  const w = open({ over: { meta_status: "rejected", rejected_reason: refusal } });
  const ctx = { supabase: fakeDb(w.tables, {}, {}), userId: USER, email: "ada@example.com", params: {} };
  await keepFixWords(ctx, B, { template_id: ROW, reason: refusal }, NEW_WORDS);
  const kept = w.tables.events.filter((e) => e.kind === "template.fix_written");
  assert.equal(kept.length, 1);
  assert.equal(kept[0].subject_id, ROW);
  assert.deepEqual([kept[0].data.words, kept[0].data.reason, kept[0].data.by], [NEW_WORDS, refusal, USER]);

  const approved = open();
  const ctx2 = { supabase: fakeDb(approved.tables, {}, {}), userId: USER, email: "ada@example.com", params: {} };
  await keepFixWords(ctx2, B, { template_id: ROW, reason: "anything" }, NEW_WORDS);
  assert.deepEqual(approved.tables.events, [], "nothing kept for a version WhatsApp did not refuse");
});

test("the Library's read hands a refused message its kept fix only for the refusal it answers, and the approved words a change replaced", async () => {
  const refusal = "The words promise a discount without terms.";
  const w = open({ over: { meta_status: "rejected", rejected_reason: refusal } });
  const at0 = "2026-11-12T10:00:00Z";
  w.tables.events.push(
    {
      id: "e1",
      tenant_id: B,
      kind: "template.submitted",
      subject_type: "template",
      subject_id: ROW,
      data: { name: "proposal_nudge", language: "en_US", by: USER, before: APPROVED },
      created_at: at0,
    },
    {
      id: "e2",
      tenant_id: B,
      kind: "template.fix_written",
      subject_type: "template",
      subject_id: ROW,
      data: { words: "old fix", reason: "an older refusal", by: USER },
      created_at: "2026-11-12T10:05:00Z",
    },
    {
      id: "e3",
      tenant_id: B,
      kind: "template.fix_written",
      subject_type: "template",
      subject_id: ROW,
      data: { words: NEW_WORDS, reason: refusal, by: USER },
      created_at: "2026-11-12T10:10:00Z",
    },
  );
  Object.assign(w.tables, { playbooks: [], broadcasts: [], broadcast_recipients: [], messages: [] });
  const ctx = { supabase: fakeDb(w.tables, {}), userId: USER, email: "ada@example.com", params: {} };
  const read = await kernel.load(kernel.readerContext(ctx, { tenantId: B, role: "viewer" }), templatesReader, {
    all: true,
  });
  const row = read.data.templates.find((t) => t.id === ROW);
  assert.equal(row.approved_before, APPROVED);
  assert.equal(row.fix_words, NEW_WORDS, "the newest fix, for the refusal the row carries");
  // A refusal the row no longer carries makes the kept fix stale: not offered.
  w.tables.templates[0].rejected_reason = "Another reason now.";
  kernel.readerCache?.clear?.();
  const again = await kernel.load(kernel.readerContext(ctx, { tenantId: B, role: "viewer" }), templatesReader, {
    all: true,
  });
  assert.equal(again.data.templates.find((t) => t.id === ROW).fix_words, null);
});

/* ------------------------------ only words WhatsApp takes are sent ------------------------------ */

const { AppError } = await import("@chanlytics/contracts");
const { sendWordsBack } = await import(at("apps/dashboard/src/server/campaigns/template-words.ts"));
const look = await import(at("apps/dashboard/src/server/drafts/template/review.ts"));
const HOUR = 3_600_000;
/** A change of approved words the ledger kept, `hoursAgo` ago. */
const changed = (hoursAgo) => ({
  id: `e-${hoursAgo}`,
  tenant_id: B,
  kind: "template.submitted",
  subject_type: "template",
  subject_id: ROW,
  data: { name: "proposal_nudge", language: "en_US", by: USER, before: "the words before" },
  created_at: new Date(Date.now() - hoursAgo * HOUR).toISOString(),
});

test("approved words changed less than a day ago are not sent again: WhatsApp takes one change a day, said with how long is left; a day on they go, and a refused message is changed as often as asked", async () => {
  const today = open();
  today.tables.events.push(changed(3));
  await refused(today.put({ words: { body: NEW_WORDS } }), "conflict", 409, "one change a day");
  await refused(today.put({ words: { body: NEW_WORDS } }), "conflict", 409, "in about 21 hours");
  assert.deepEqual(edge.calls, [], "nothing sent to WhatsApp to be refused");
  const dayOn = open();
  dayOn.tables.events.push(changed(25));
  assert.equal((await dayOn.put({ words: { body: NEW_WORDS } })).meta_status, "pending");
  const refusedRow = open({ over: { meta_status: "rejected", rejected_reason: "Promotional words" } });
  refusedRow.tables.events.push(changed(1));
  assert.equal((await refusedRow.put({ words: { body: NEW_WORDS } })).meta_status, "pending");
});

test("the words of another message WhatsApp already has from the business are refused before they are sent, naming it (WhatsApp refuses a duplicate); one WhatsApp never held is no twin", async () => {
  const twin = (over = {}) =>
    row({
      id: "77777777-7777-4777-8777-000000000002",
      name: "second_nudge",
      title: "Second nudge",
      body_preview: NEW_WORDS,
      components: [{ type: "BODY", text: NEW_WORDS }],
      ...over,
    });
  const held = open();
  held.tables.templates.push(twin());
  await refused(held.put({ words: { body: NEW_WORDS } }), "conflict", 409, "the same words as one it already has");
  await refused(held.put({ words: { body: NEW_WORDS } }), "conflict", 409, "“Second nudge”");
  assert.deepEqual(edge.calls, []);
  const neverHeld = open();
  neverHeld.tables.templates.push(twin({ meta_id: null }));
  assert.equal((await neverHeld.put({ words: { body: NEW_WORDS } })).meta_status, "pending");
});

test("a reader's look comes last, once every rule passed, and what it refuses is never sent; a look that cannot be made holds nothing up", async () => {
  const w = open();
  const ctx = { supabase: fakeDb(w.tables, {}, {}), userId: USER, email: "ada@example.com", params: { id: ROW } };
  const tpl = { id: ROW, tenant_id: B, name: "proposal_nudge", language: "en_US" };
  const looked = [];
  const refuses = async (_ctx, tenantId, words) => {
    looked.push([tenantId, words.body, words.category, words.language]);
    throw new AppError(
      "validation",
      "WhatsApp would refuse this: It asks for a full card number. Ask for the last four.",
    );
  };
  await assert.rejects(sendWordsBack(ctx, tpl, { body: NEW_WORDS }, refuses), (e) => {
    assert.equal(e.message, "WhatsApp would refuse this: It asks for a full card number. Ask for the last four.");
    return true;
  });
  assert.deepEqual(
    looked,
    [[B, NEW_WORDS, "marketing", "en_US"]],
    "what it is asked: the words, and what they are filed as",
  );
  assert.deepEqual(edge.calls, [], "nothing sent to WhatsApp");
  // A rule that refuses first never reaches the look: nothing is spent reading words that cannot go.
  await assert.rejects(
    sendWordsBack(ctx, tpl, { body: "{{1}}, did you read the proposal yet?" }, refuses),
    /starts or ends/,
  );
  assert.equal(looked.length, 1);
  // The route's own look, with no model to reach here: it is logged, and the words go to WhatsApp, the judge either way.
  assert.equal((await w.put({ words: { body: NEW_WORDS } })).meta_status, "pending");
  assert.equal(edge.calls.length, 1);
});

test("the reader's look, run with a model of the test's own: it is told WhatsApp's own reasons and that nothing else is its to judge; a no is said with what to change; a yes, an answer in no shape, a model that refuses or one that cannot be reached all hold nothing up", async () => {
  const ctx = { supabase: fakeDb({}, {}, {}), userId: USER, email: "ada@example.com", params: {} };
  const asked = [];
  /** A model that answers `text`, or does what `answer` says. */
  const model = (answer) => async (_ctx, tenantId, system, user, kind) => {
    asked.push({ tenantId, system, user, kind });
    if (answer instanceof Error) throw answer;
    return typeof answer === "string"
      ? { ok: true, text: answer, blockTypes: ["text"], stopReason: "end_turn", streamError: null }
      : answer;
  };
  const offer = { body: NEW_WORDS, footer: "Reply STOP to opt out", category: "marketing", language: "es_MX" };
  await look.reviewWords(ctx, B, offer, model('{"ok": true}'));
  const [{ system, user, kind, tenantId }] = asked;
  assert.deepEqual([tenantId, kind], [B, "draft"], "one turn, counted against the workspace as a draft's is");
  for (const said of [/full payment card number/, /threatens or shames/, /scam/, /does not allow/, /Spanish/])
    assert.match(system, said);
  assert.match(system, /An ordinary reminder, thank-you, offer, discount/);
  assert.match(system, /When in doubt, it passes/);
  assert.doesNotMatch(system, /filed as a utility message/, "an offer is never judged as a notice");
  assert.equal(user, `Words:\n${NEW_WORDS}\n\nFooter: Reply STOP to opt out`);
  await look.reviewWords(ctx, B, { ...offer, category: "utility", language: "en_US" }, model('{"ok": true}'));
  assert.match(asked.at(-1).system, /filed as a utility message/);
  const no = '{"ok": false, "reason": "It asks for a full card number.", "fix": "Ask for the last four."}';
  await assert.rejects(look.reviewWords(ctx, B, offer, model(no)), (e) => {
    assert.equal(e.code, "validation");
    assert.equal(e.message, "WhatsApp would refuse this: It asks for a full card number. Ask for the last four.");
    return true;
  });
  // WhatsApp's review is the judge either way: a look that came back in no shape, or could not be made, holds nothing up.
  for (const unread of ['{"ok": false}', "fine", { ok: false, reason: "refused", message: "x" }, new Error("no model")])
    await look.reviewWords(ctx, B, offer, model(unread));
});
