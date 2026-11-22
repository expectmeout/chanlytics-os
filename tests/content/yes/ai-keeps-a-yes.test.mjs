/**
 * AI keeps a yes the owner tells it (00665; the content PRD's step L4): keep_yes, run as the registry runs it, over a
 * database in memory.
 *
 * What must hold. The act never acts: it reads the file and proposes a card, and nothing is written while the turn
 * runs. A card in the owner's own words (quote, copied from this question) is kept as the turn is saved, through the
 * same door its press uses, and arrives kept with its Undo; one in any other words waits for their press. A yes already
 * kept for every use named makes no card. A take-back is the same: kept as the turn is saved, its card says what was
 * held and where one is still up, and it has no Undo. Nothing is kept from a turn AI asks itself.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { keepYesCards } = await import(at("apps/dashboard/src/server/ask/tools/act/files/yes.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { ASK_MORNING_QUESTION } = await import("@chanlytics/contracts");
beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const FILE = "ffffffff-0000-4000-8000-000000000001";
const THREAD = "77777777-0000-4000-8000-000000000001";
const TZ = "America/New_York";
const SAID = "Ana said yes to being in our posts and our ads";

const fileRow = (over = {}) => ({
  id: FILE,
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: "chair-by-the-window",
  mime: "image/jpeg",
  bytes: 1000,
  width: 1200,
  height: 1500,
  look: { line: "A stylist at the chair by the window.", people: { count: 1, recognizable: 1 } },
  look_status: "done",
  shows: "work",
  who_in_it: "not_asked",
  yes_for: [],
  yes_back: [],
  removed_at: null,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
  ...over,
});

/** One call of keep_yes, as a member asked it in this question, and every write the database saw. */
async function called(input, { file = {}, question = SAID } = {}) {
  const tables = {
    files: [fileRow(file)],
    memberships: [],
    tenants: [{ id: A, name: "Harbor", slug: "harbor", timezone: TZ, status: "active" }],
    tenant_config: [{ tenant_id: A, config: { brain: {} }, version: 1 }],
  };
  const supabase = fakeDb(tables, {}, {});
  const ctx = { supabase, userId: USER, email: "ada@example.com", params: {} };
  const tc = { ...newToolContext(ctx, A, "owner", TZ, new Date("2026-11-20T15:00:00Z")), question, language: "en" };
  const out = await buildProposal(tc, "keep_yes", input);
  return { out, writes: supabase.seen.filter((q) => q.rpc || ["insert", "update", "upsert", "delete"].includes(q.op)) };
}

test("the act never acts: it proposes a yes for the uses named, and nothing is written while the turn runs", async () => {
  const { out, writes } = await called({
    action: "give",
    file: "chair-by-the-window",
    uses: ["ad", "post"],
    who: "Ana",
    quote: SAID,
  });
  assert.equal(out.proposal?.kind, "file_yes", out.result);
  assert.equal(out.proposal.needs, "partner");
  assert.equal(out.proposal.title, "Ana said yes to posts and ads");
  assert.deepEqual(out.proposal.payload, {
    file_id: FILE,
    file: "chair-by-the-window",
    uses: ["post", "ad"],
    who: "Ana",
    theirs: true,
  });
  assert.equal(JSON.parse(out.result).kept, true);
  assert.deepEqual(writes, [], "a proposal reads; it never writes");
});

test("words that are not theirs in this question wait for their press; a yes already kept makes no card", async () => {
  const other = await called(
    { action: "give", file: "chair-by-the-window", uses: ["ad"], who: "Ana", quote: "the client agreed to the ad" },
    { question: "make an ad with the chair photo" },
  );
  assert.equal(other.out.proposal?.payload.theirs, undefined, "a card for their press");
  assert.equal(JSON.parse(other.out.result).kept, false);
  const already = await called(
    { action: "give", file: "chair-by-the-window", uses: ["ad"], who: "Ana", quote: SAID },
    { file: { yes_for: ["ad"] } },
  );
  assert.equal(already.out.proposal, null);
  assert.equal(JSON.parse(already.out.result).already, true);
  // Only the uses not kept yet: a yes for ads beside one for posts already kept.
  const one = await called(
    { action: "give", file: "chair-by-the-window", uses: ["ad", "post"], who: "Ana", quote: SAID },
    { file: { yes_for: ["post"] } },
  );
  assert.deepEqual(one.out.proposal.payload.uses, ["ad"]);
  const none = await called({ action: "give", file: "chair-by-the-window", who: "Ana", quote: SAID });
  assert.match(none.out.refusal, /name what they said yes to/);
  const gone = await called({ action: "give", file: "no-such", uses: ["ad"], who: "Ana", quote: SAID });
  assert.match(gone.out.refusal, /no file named no-such/);
});

test("nothing is kept from a turn AI asks itself", async () => {
  const { out } = await called(
    { action: "give", file: "chair-by-the-window", uses: ["ad"], who: "Ana", quote: SAID },
    { question: ASK_MORNING_QUESTION },
  );
  assert.match(out.refusal, /only from what a member tells you/);
});

/** The turn saved: its cards kept through their doors, over a database that answers the two doors as given. */
async function saved(proposals, answers) {
  const knocks = [];
  const supabase = fakeDb(
    {},
    {},
    {
      file_yes_record: (a) => (knocks.push(["file_yes_record", a]), answers.record),
      file_yes_take_back: (a) => (knocks.push(["file_yes_take_back", a]), answers.back),
    },
  );
  const ctx = { supabase, userId: USER, email: "ada@example.com", params: {} };
  return { cards: await keepYesCards(ctx, A, THREAD, proposals), knocks };
}
const card = (payload) => ({ id: "p-1", kind: "file_yes", needs: "partner", title: "t", summary: "s", payload });

test("a yes in their own words is kept as the turn is saved, with the conversation it was said in, and has an Undo", async () => {
  const yes = card({ file_id: FILE, file: "chair-by-the-window", uses: ["post", "ad"], who: "Ana", theirs: true });
  const waits = card({ file_id: FILE, file: "chair-by-the-window", uses: ["ad"], who: "Ana" });
  const memory = { ...card({ text: "a line" }), kind: "memory" };
  const { cards, knocks } = await saved([yes, waits, memory], {
    record: { kept: ["ad", "post"], again: [], ids: ["y1", "y2"], yes_for: ["ad", "post"], yes_back: [] },
  });
  assert.deepEqual(knocks, [
    ["file_yes_record", { p_tenant_id: A, p_file_id: FILE, p_uses: ["post", "ad"], p_who: "Ana", p_thread_id: THREAD }],
  ]);
  assert.equal(cards[0].outcome.state, "done");
  assert.equal(cards[0].outcome.receipt, "Kept: Ana said yes to posts and ads.");
  assert.deepEqual(cards[0].outcome.undo, { file_id: FILE, uses: ["post", "ad"] });
  assert.equal(cards[1].outcome, undefined, "the one not in their words waits for their press");
  assert.equal(cards[1].payload.thread_id, THREAD, "and carries where it was said, for its press");
  assert.equal(cards[2], memory, "any other card goes through as it came");
});

test("a take-back in their own words is kept as the turn is saved: what was held, where one is still up, and no Undo", async () => {
  const back = card({ file_id: FILE, file: "chair-by-the-window", uses: [], back: true, theirs: true });
  const { cards, knocks } = await saved([back], {
    back: {
      taken_back: 2,
      uses: ["ad", "cold_email", "post", "reply"],
      files: [FILE],
      held: [{ post_id: "p1", file_id: FILE, place: "instagram", kind: "picture", at: "2026-11-21T15:00:00Z" }],
      live: [
        {
          post_id: "p2",
          file_id: FILE,
          place: "instagram",
          kind: "picture",
          status: "published",
          permalink: "https://example.com/p/2",
          at: "2026-11-10T15:00:00Z",
        },
      ],
      ads: [],
    },
  });
  assert.deepEqual(
    knocks.map(([door, a]) => [door, a.p_file_id, a.p_uses]),
    [["file_yes_take_back", FILE, undefined]],
  );
  assert.match(knocks[0][1].p_held, /took back their yes/);
  assert.equal(cards[0].outcome.receipt, "Taken back. 1 waiting post held. Still up on Instagram: take it down there.");
  assert.equal(cards[0].outcome.undo, null);
});

test("a door that refuses leaves the card failed, in the door's own words, never a thrown turn", async () => {
  const yes = card({ file_id: FILE, uses: ["ad"], who: "Ana", theirs: true });
  const supabase = fakeDb(
    {},
    {},
    {
      file_yes_record: () => {
        throw Object.assign(new Error("Not yours to change."), { code: "42501" });
      },
    },
  );
  const ctx = { supabase, userId: USER, email: "ada@example.com", params: {} };
  const [kept] = await keepYesCards(ctx, A, THREAD, [yes]);
  assert.equal(kept.outcome.state, "failed");
  assert.equal(kept.outcome.receipt, "Not yours to change.");
  assert.equal(kept.outcome.undo, null);
});

test("a yes for ads taken back says the ads that show it were paused, and any only Meta can pause now (00676, G16)", async () => {
  const { fileYesReceiptOf } = await import("@chanlytics/contracts");
  const answer = {
    held: [],
    live: [],
    ads: [
      { ad_id: "a1", name: "First visit", act: "pause", outcome: "pending" },
      { ad_id: "a2", name: "Consultation", act: "cancel", outcome: "pending" },
      { ad_id: "a3", name: "Old one", act: "pause", outcome: "needs_person" },
    ],
  };
  assert.equal(
    fileYesReceiptOf({ back: true, who: "" }, answer),
    "Taken back. 2 ads that show it paused. 1 ad can only be paused in Meta now: pause it there.",
  );
  assert.equal(fileYesReceiptOf({ back: true, who: "" }, { held: [], live: [], ads: [] }), "Taken back.");
});
