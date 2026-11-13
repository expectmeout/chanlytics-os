/**
 * Ask changes a message on file (propose_sequence's actions message_words, message_rename, message_away and
 * message_delete; the message sheet's review, 12 Nov 2026: Ask could write a new message and change none). Each is a
 * card, never a write, made only where the door its Approve calls would take it, by that door's own checks, and it
 * quotes the words a message had beside the ones it gets. Executed through the real registry over a workspace in
 * memory; each card's commit through its spec (contracts messages.ts).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import * as C from "@chanlytics/contracts";
import { PROPOSAL_SPECS, MESSAGE_CHANGE_WORDS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext, runTool } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-11-12T14:00:00Z");
const V = (n) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;
const WAS_WA = "Hi {{1}}, just checking you had a chance to look at the proposal.";
const WAS_EMAIL = "Hi {{1}},\n\nJust checking in on the proposal.";

/** A template row as the table holds it. */
const tpl = (n, over = {}) => ({
  id: V(n),
  tenant_id: A,
  channel: "whatsapp",
  name: "proposal_nudge",
  language: "en_US",
  body_preview: WAS_WA,
  components: [{ type: "BODY", text: WAS_WA }],
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
const EMAIL = (over = {}) =>
  tpl(2, {
    channel: "email",
    meta_id: null,
    body_preview: WAS_EMAIL,
    components: [
      { type: "HEADER", format: "TEXT", text: "Your proposal" },
      { type: "BODY", text: WAS_EMAIL },
    ],
    ...over,
  });

/** A workspace an operator works in, holding the message on WhatsApp and by email. */
const world = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ }],
  templates: [tpl(1), EMAIL()],
  sequence_batches: [],
  sequence_steps: [],
  ...over,
});

beforeEach(() => readerCache.clear());

/** A proposal of one of the actions over the world: its outcome, and what reached the database. */
async function propose(action, input, over = {}) {
  const supabase = fakeDb(world(over), {}, {});
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
  const r = await buildProposal(t, "propose_sequence", { action, ...input });
  return { ...r, seen: supabase.seen };
}
const said = (r) => JSON.parse(r.result).error;
const wroteNothing = (r) =>
  assert.deepEqual(
    r.seen.filter((q) => q.rpc || q.op !== "select"),
    [],
    "a card writes nothing",
  );
const commitOf = (p) => PROPOSAL_SPECS[p.kind].commit(p, { settings: null });

/** The messages as Ask reads them before it changes one: the library whole, or one message by its name. */
async function readMessages(over, name) {
  const supabase = fakeDb(world(over), {}, {});
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
  const r = await runTool(t, { name: "sequences", input: { action: "messages", ...(name ? { name } : {}) } });
  assert.equal(r.isError, false, r.result);
  return JSON.parse(r.result).messages;
}

test("Ask reads a message's words before it changes them: the library cuts each to a line, one message asked for by what the business calls it is read alone and whole, and a name nothing has reads none", async () => {
  const long = `Hi {{1}}, ${"the proposal is ready whenever you want to look at it together. ".repeat(6)}`.trim();
  const over = { templates: [tpl(1, { body_preview: long, components: [{ type: "BODY", text: long }] }), EMAIL()] };
  const [cut] = await readMessages(over);
  const line = cut.versions.find((v) => v.channel === "whatsapp").words.body;
  assert.ok(line.endsWith("…") && line.length <= 161 && long.startsWith(line.slice(0, -1)), line);
  const [whole, ...others] = await readMessages(over, "Proposal nudge");
  assert.deepEqual(others, []);
  assert.equal(whole.title, "Proposal nudge");
  assert.deepEqual(
    whole.versions.map((v) => [v.channel, v.words]),
    [
      ["whatsapp", { subject: null, body: long }],
      ["email", { subject: "Your proposal", body: WAS_EMAIL }],
    ],
  );
  assert.deepEqual(await readMessages(over, "no such message"), []);
});

test("new WhatsApp words are a card quoting both, which sends them back to WhatsApp through the edit door; the door's refusals come first", async () => {
  const body = "Hi {{1}}, did you get a chance to read the proposal? Happy to answer anything.";
  const r = await propose("message_words", { template_id: V(2), channel: "whatsapp", body });
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.equal(p.kind, "message_words");
  assert.equal(p.title, MESSAGE_CHANGE_WORDS.wordsTitle("Proposal nudge", "WhatsApp"), "found by its email's id too");
  // Quoted as the person reached reads them: each value filled with its example, as the new-message card fills them.
  const filled = (w) => w.replaceAll("{{1}}", "Dana");
  assert.ok(p.summary.startsWith(MESSAGE_CHANGE_WORDS.wordsSaid(filled(body), filled(WAS_WA))), p.summary);
  assert.doesNotMatch(p.summary, /\{\{1\}\}/);
  assert.ok(p.summary.includes(MESSAGE_CHANGE_WORDS.wordsReview), "nothing sends it: WhatsApp's look is said");
  assert.deepEqual(commitOf(p), { route: "PUT templates/[id]", params: { id: V(1) }, body: { words: { body } } });
  assert.equal(p.undo, null, "WhatsApp's change has no undo here");
  wroteNothing(r);

  // The edit door's own refusals: a message WhatsApp never held, one in review, a send going out with it.
  const never = await propose(
    "message_words",
    { template_id: V(1), channel: "whatsapp", body },
    { templates: [tpl(1, { meta_id: null })] },
  );
  assert.match(said(never), /WhatsApp has no copy of this message/);
  const review = await propose(
    "message_words",
    { template_id: V(1), channel: "whatsapp", body },
    { templates: [tpl(1, { meta_status: "pending" })] },
  );
  assert.match(said(review), /still looking at these words/);
  const going = await propose(
    "message_words",
    { template_id: V(1), channel: "whatsapp", body },
    {
      sequence_batches: [
        { id: "b1", tenant_id: A, template_name: "proposal_nudge", template_language: "en_US", state: "sending" },
      ],
    },
  );
  assert.match(said(going), /A send is going out with these words now/);
  // No WhatsApp version: said, and nothing proposed.
  const none = await propose(
    "message_words",
    { template_id: V(2), channel: "whatsapp", body },
    { templates: [EMAIL()] },
  );
  assert.match(said(none), /no WhatsApp version to change/);
});

test("new email words are saved as the version through its own door, and the undo puts the old words back within ten minutes", async () => {
  const r = await propose("message_words", {
    template_id: V(1),
    channel: "email",
    subject: "About your proposal",
    body: "Hi {{1}},\n\nDid you get a chance to read it?",
  });
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.deepEqual(commitOf(p), {
    route: "POST templates/versions",
    body: {
      name: "proposal_nudge",
      language: "en_US",
      channel: "email",
      subject: "About your proposal",
      body: "Hi {{1}},\n\nDid you get a chance to read it?",
    },
  });
  assert.equal(p.undo, MESSAGE_CHANGE_WORDS.putBack);
  const kept = PROPOSAL_SPECS.message_words.undo.record(p, {}, { settings: null });
  assert.deepEqual(PROPOSAL_SPECS.message_words.undo.call(kept, { settings: null }), {
    route: "POST templates/versions",
    body: { name: "proposal_nudge", language: "en_US", channel: "email", subject: "Your proposal", body: WAS_EMAIL },
  });
  // A value the message does not have is refused in the channel's own words, before any card.
  const bad = await propose("message_words", { template_id: V(1), channel: "sms", body: "Hi {{4}}" });
  assert.equal(bad.isError, true);
});

test("a rename is a card on the row that names the message, its undo the name it had; the same name is said, and changes nothing", async () => {
  const r = await propose(
    "message_rename",
    { template_id: V(2), title: "Proposal follow-up" },
    { templates: [tpl(1), EMAIL({ title: "Old nudge" })] },
  );
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.equal(p.title, MESSAGE_CHANGE_WORDS.renameTitle("Old nudge"));
  // Every version of it takes the name, WhatsApp's first: none keeps an old one another could show again.
  assert.deepEqual(commitOf(p), [
    { route: "PUT templates/[id]", params: { id: V(1) }, body: { title: "Proposal follow-up" } },
    { route: "PUT templates/[id]", params: { id: V(2) }, body: { title: "Proposal follow-up" } },
  ]);
  const kept = PROPOSAL_SPECS.message_rename.undo.record(p, {}, { settings: null });
  assert.deepEqual(
    PROPOSAL_SPECS.message_rename.undo.call(kept, { settings: null }).map((c) => [c.params.id, c.body.title]),
    [
      [V(1), null],
      [V(2), "Old nudge"],
    ],
    "each the name it had",
  );
  const same = await propose(
    "message_rename",
    { template_id: V(1), title: "Old nudge" },
    { templates: [tpl(1), EMAIL({ title: "Old nudge" })] },
  );
  assert.match(said(same), /already called/);
  wroteNothing(r);
});

test("putting away says what still sends it, which putting it away does not stop; one already away is said, not proposed", async () => {
  const running = {
    sequence_steps: [
      {
        id: "s1",
        tenant_id: A,
        name: "VIP nurture",
        template_name: "proposal_nudge",
        template_language: "en_US",
        state: "running",
      },
    ],
  };
  const r = await propose("message_away", { template_id: V(1), away: true }, running);
  assert.equal(r.isError, false, r.result);
  assert.equal(r.proposal.summary, MESSAGE_CHANGE_WORDS.awaySaid(true, "“VIP nurture”"));
  assert.deepEqual(commitOf(r.proposal), { route: "PUT templates/[id]", params: { id: V(1) }, body: { hidden: true } });
  const already = await propose(
    "message_away",
    { template_id: V(1), away: true },
    { templates: [tpl(1, { hidden_at: "2026-11-01T00:00:00Z" })] },
  );
  assert.match(said(already), /already put away/);
});

test("a delete takes every version of the message in its language, WhatsApp's first, and is refused as the door refuses: a send using it, a running sequence", async () => {
  const r = await propose("message_delete", { template_id: V(2) });
  assert.equal(r.isError, false, r.result);
  assert.equal(r.proposal.title, MESSAGE_CHANGE_WORDS.deleteTitle("Proposal nudge", "English"));
  assert.deepEqual(commitOf(r.proposal), [
    { route: "DELETE templates/[id]", params: { id: V(1) } },
    { route: "DELETE templates/versions/[id]", params: { id: V(2) } },
  ]);
  assert.equal(r.proposal.undo, null, "nothing undoes it");
  const sending = await propose(
    "message_delete",
    { template_id: V(1) },
    {
      sequence_batches: [
        { id: "b1", tenant_id: A, template_name: "proposal_nudge", template_language: "en_US", state: "scheduled" },
      ],
    },
  );
  assert.match(said(sending), /A send is still using this message/);
  const steps = await propose(
    "message_delete",
    { template_id: V(1) },
    {
      sequence_steps: [
        {
          id: "s1",
          tenant_id: A,
          name: "VIP nurture",
          template_name: "proposal_nudge",
          template_language: "en_US",
          state: "running",
        },
      ],
    },
  );
  assert.match(said(steps), /VIP nurture/);
  const unknown = await propose("message_delete", { template_id: V(9) });
  assert.match(said(unknown), /no message of this workspace has that id/);
});

test("Ask's cards carry no preset changes (Ruben, 12 Nov 2026: no Shorter, Warmer, Spanish too): a change is said on the line", async () => {
  const words = await import(at("apps/dashboard/src/surfaces/ask/words.ts"));
  const all = JSON.stringify(words);
  assert.doesNotMatch(all, /quickChanges|Spanish too|Más corto/);
  const parts = await import(at("apps/dashboard/src/surfaces/ask/card-parts.tsx"));
  assert.equal(parts.AskQuickChanges, undefined);
});

test("an email's new words keep the subject it has where none is given; a text of an offer is refused before any card, in the door's words", async () => {
  const r = await propose("message_words", {
    template_id: V(1),
    channel: "email",
    body: "Hi {{1}}, any questions on it?",
  });
  assert.equal(r.isError, false, r.result);
  assert.equal(r.proposal.payload.subject, "Your proposal", "the subject it had");
  assert.equal(commitOf(r.proposal).body.subject, "Your proposal");
  const text = await propose("message_words", { template_id: V(1), channel: "sms", body: "Hi {{1}}, any questions?" });
  assert.equal(text.isError, true);
  assert.equal(said(text), C.channelNeverCarries("sms", "marketing"));
  wroteNothing(text);
});

test("new WhatsApp words on an approved message name the running sequences that pause while WhatsApp looks", async () => {
  const running = {
    sequence_steps: [
      {
        id: "s1",
        tenant_id: A,
        name: "VIP nurture",
        template_name: "proposal_nudge",
        template_language: "en_US",
        state: "running",
      },
    ],
  };
  const r = await propose(
    "message_words",
    { template_id: V(1), channel: "whatsapp", body: "Hi {{1}}, did you read the proposal?" },
    running,
  );
  assert.equal(r.isError, false, r.result);
  assert.ok(
    r.proposal.summary.endsWith(MESSAGE_CHANGE_WORDS.holdsWhileChecked(["VIP nurture"], false)),
    r.proposal.summary,
  );
});

test("words written where the message had no version are taken away again by the undo, within ten minutes", async () => {
  const r = await propose(
    "message_words",
    { template_id: V(1), channel: "sms", body: "Hi {{1}}, see you soon." },
    {
      templates: [tpl(1, { category: "utility" })],
    },
  );
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.equal(p.payload.was, null);
  assert.equal(p.undo, MESSAGE_CHANGE_WORDS.newBack("text"));
  const kept = PROPOSAL_SPECS.message_words.undo.record(p, { version: { id: V(7) }, warnings: [] }, { settings: null });
  assert.deepEqual(PROPOSAL_SPECS.message_words.undo.call(kept, { settings: null }), {
    route: "DELETE templates/versions/[id]",
    params: { id: V(7) },
    goneIsDone: true,
  });
  assert.equal(PROPOSAL_SPECS.message_words.undo.receipt({}, kept), MESSAGE_CHANGE_WORDS.newGone);
});
