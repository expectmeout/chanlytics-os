/**
 * A business that answers a cold email gets its own preview made, and the draft of the reply carries its link (decision
 * 0079; the canvas's call P8; apps/edge/lib/campaigns/reach-out/reply-draft.ts). Before, only a send whose words named
 * the link, or a member's press, made one: a "yes" to the first email made nothing, and its reply was drafted with
 * nothing to give them.
 *
 *   previewLinkFor     the reply's lead, its preview made or found, and its link; null where none can be made (the
 *                      switch off, a workspace that makes none, a lead its door refuses, a reply that is no lead's)
 *   withPreviewNote    the drafter's note, with the link and what to say of it; the note as it was where there is none
 *
 * Made-up businesses only.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

const { previewLinkFor, withPreviewNote } = await importSrc("apps/edge/lib/campaigns/reach-out/reply-draft.ts");

const WS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const THREAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOKEN = "TokenTokenTokenToken01";
const lead = {
  id: LEAD,
  tenant_id: WS,
  kind: "place",
  stage: "ready",
  business_name: "Harbor Movers",
  city: "Austin",
  region: "TX",
  erased_at: null,
  blanked_at: null,
};
const reply = {
  tenant_id: WS,
  conversation_id: THREAD,
  lead_id: LEAD,
  message_id: "m1",
  read_at: "2026-11-15T15:00:00Z",
};
const was = process.env.LEAD_PREVIEWS;
afterEach(() => {
  if (was === undefined) delete process.env.LEAD_PREVIEWS;
  else process.env.LEAD_PREVIEWS = was;
});

/** A database whose preview door answers as 00497's does for a preview that stands, and remembers what it was asked. */
function world({
  replies = [reply],
  leads = [lead],
  door = () => ({ id: "p1", token: TOKEN, state: "ready", preview_tenant_id: null, made: false }),
} = {}) {
  const asked = [];
  const db = fakeDb(
    { sequence_replies: replies, leads },
    {},
    { preview_make: (args) => (asked.push(args), door(args)) },
  );
  return { db, asked };
}

test("a reply's lead gets its preview made or found, and the link is its page", async () => {
  process.env.LEAD_PREVIEWS = "on";
  const w = world();
  const link = await previewLinkFor(w.db, WS, THREAD);
  assert.match(link, new RegExp(`/preview/${TOKEN}$`));
  assert.deepEqual(
    w.asked.map((a) => [a.p_tenant_id, a.p_lead_id, a.p_name]),
    [[WS, LEAD, "Harbor Movers"]],
    "asked of the one door a preview is made by, under the name the lead is called by",
  );
});

test("no link where none can be made: the switch off, a reply that is no lead's, a lead that is gone", async () => {
  delete process.env.LEAD_PREVIEWS;
  const off = world();
  assert.equal(await previewLinkFor(off.db, WS, THREAD), null);
  assert.deepEqual(off.asked, [], "switched off, nothing is asked of the door");
  process.env.LEAD_PREVIEWS = "on";
  assert.equal(await previewLinkFor(world({ replies: [] }).db, WS, THREAD), null, "a reply that names no lead");
  assert.equal(await previewLinkFor(world({ replies: [{ ...reply, lead_id: null }] }).db, WS, THREAD), null);
  const gone = world({ leads: [] });
  assert.equal(await previewLinkFor(gone.db, WS, THREAD), null, "a lead that is gone");
  assert.deepEqual(gone.asked, [], "and its door is not asked");
});

test("the drafter's note carries the link and what to say of it; with none it is the note it was", () => {
  const note = "Harbor Movers, a business that wrote back by email.";
  assert.equal(withPreviewNote(note, null), note);
  const told = withPreviewNote(note, "https://app.example.com/preview/" + TOKEN);
  assert.ok(told.startsWith(note));
  assert.ok(told.includes("https://app.example.com/preview/" + TOKEN), "the link, whole, as they will press it");
  assert.match(told, /free to try/);
  assert.match(told, /Give them this link exactly as written/);
  assert.doesNotMatch(told, /receptionist/i);
});
