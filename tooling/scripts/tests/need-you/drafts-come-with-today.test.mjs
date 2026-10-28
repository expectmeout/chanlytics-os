/**
 * Ask's drafts on Need you's rows come with Today's own first reads (surfaces/today/need-you/drafts-surface.ts): a row
 * draws with its words from its first frame, and the tab asks a thread for its draft only where the newest the workspace
 * keeps did not hold it. They were read only once the rows had drawn, on every load, and the rows drew empty, then Ask's
 * "writing", then the words, 181 and 397 px each on a desk (the Today load review, 27 Oct 2026).
 *
 * The real draft store (drafts.ts) and the real surface's value, over the stub React and a recorded fetch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, redrawWanted, quiet } from "../_legacy-react.mjs";

installLegacyReact();
globalThis.location.pathname = "/w/harbor";
globalThis.location.hash = "#/today";
/** Every request the store made, and the drafts the server keeps by thread. */
const asked = [];
const keptOnServer = new Map();
const json = (body) =>
  new Response(JSON.stringify({ ok: true, data: body }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  asked.push(
    `${init.method ?? "GET"} ${u.pathname}${u.searchParams.get("ids") ? `?ids=${u.searchParams.get("ids")}` : ""}`,
  );
  if (u.pathname === "/api/v1/conversations/drafts") {
    const ids = (u.searchParams.get("ids") ?? "").split(",");
    return json({ drafts: ids.map((id) => keptOnServer.get(id)).filter(Boolean), complete: true });
  }
  const written = /^\/api\/v1\/conversations\/([^/]+)\/draft$/.exec(u.pathname);
  if (written) return json(draft(written[1], "m-new", "Written now."));
  return new Response("{}", { status: 404 });
};

const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
const { useDraft, useDraftCounts, wantDrafts } =
  await import("../../../../apps/dashboard/src/surfaces/today/need-you/drafts.ts");
// Told as the app tells it: the module the store hears (the stub's own `surfaceLanded` holds a copy of its own).
const { surfaceMoved: surfaceLanded } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-status.ts");

function draft(conversation, forMessage, text) {
  return {
    conversation_id: conversation,
    kind: "reply",
    for_message_id: forMessage,
    words: { text, subject: "", brief: null, asks: [] },
    made_at: "2026-10-27T12:00:00.000Z",
  };
}
const want = (conversationId, forMessageId) => ({ conversationId, kind: "reply", forMessageId });
/** A row's draft as it draws, now: the hook over the stub React. */
const drawn = (w, may = true) => {
  fresh();
  return useDraft(w, may);
};
const settle = () => new Promise((r) => setTimeout(r, 0));

test("a row whose draft came with Today's reads draws with its words from its first frame, and nothing is asked for it", async () => {
  asked.length = 0;
  setSurfaceValue("reply_drafts", {
    drafts: [draft("c-1", "m-1", "Friday works.")],
    complete: true,
    fetchedAt: Date.now(),
  });
  const first = drawn(want("c-1", "m-1"));
  assert.equal(first?.state, "ready", "REGRESSION: the row drew empty, then Ask writing, then its words");
  assert.equal(first.draft.words.text, "Friday works.");
  assert.equal(drawn(want("c-1", "m-1")), first, "the same state each draw, as a store's snapshot must be");
  assert.deepEqual(
    useDraftCounts([want("c-1", "m-1")], true),
    { replies: 1, briefs: 0, writing: 0 },
    "the line over the rows stands with them",
  );
  await wantDrafts([want("c-1", "m-1")], true);
  assert.deepEqual(asked, [], "no read of its thread, no draft written");
});

test("where the newest came whole, a row with none is Ask writing from its first frame for a member who acts, and none for a viewer; only the writing is asked for", async () => {
  asked.length = 0;
  setSurfaceValue("reply_drafts", {
    drafts: [draft("c-1", "m-1", "Friday works."), draft("c-7", "m-1", "Monday, then.")],
    complete: true,
    fetchedAt: Date.now(),
  });
  assert.equal(drawn(want("c-2", "m-2"), true)?.state, "writing");
  assert.equal(drawn(want("c-3", "m-3"), false)?.state, "none");
  // A draft kept for an older message is none of this one's: they have said more.
  assert.equal(drawn(want("c-7", "m-9"), true)?.state, "writing");
  // And one the tab holds for an older message is none of it either: the row never draws words that answer less than it shows.
  assert.equal(drawn(want("c-1", "m-9"), true)?.state, "writing");
  await wantDrafts([want("c-2", "m-2")], true);
  await settle();
  assert.deepEqual(
    asked,
    ["POST /api/v1/conversations/c-2/draft"],
    "the missing draft is written; nothing is read for it",
  );
  assert.equal(drawn(want("c-2", "m-2"))?.state, "ready", "and it is drawn once written");
  asked.length = 0;
  await wantDrafts([want("c-3", "m-3")], false);
  assert.deepEqual(asked, [], "a viewer asks for nothing");
});

test("past the newest the workspace keeps, a row's draft is read by its thread, as before", async () => {
  asked.length = 0;
  keptOnServer.set("c-4", draft("c-4", "m-4", "Tuesday is open."));
  setSurfaceValue("reply_drafts", { drafts: [], complete: false, fetchedAt: Date.now() });
  assert.equal(drawn(want("c-4", "m-4")), null, "not known yet: its thread's read is still to come");
  await wantDrafts([want("c-4", "m-4"), want("c-5", "m-5")], true);
  await settle();
  assert.deepEqual(asked, ["GET /api/v1/conversations/drafts?ids=c-4,c-5", "POST /api/v1/conversations/c-5/draft"]);
  assert.equal(
    drawn(want("c-4", "m-4")).draft.words.text,
    "Tuesday is open.",
    "the thread's kept draft, read by its thread",
  );
});

test("a row draws again as the drafts Today read come in: the store hears the surface move", () => {
  setSurfaceValue("reply_drafts", { drafts: [], complete: false, fetchedAt: Date.now() });
  drawn(want("c-6", "m-6"));
  quiet();
  setSurfaceValue("reply_drafts", {
    drafts: [draft("c-6", "m-6", "See you then.")],
    complete: true,
    fetchedAt: Date.now(),
  });
  surfaceLanded("reply_drafts");
  assert.equal(redrawWanted(), true, "REGRESSION: the row kept drawing nothing until something else moved");
});
