/**
 * A Google Drive folder, asked of AI (the footage sources plan, P5): "my videos are in Google Drive", or a folder's
 * link pasted, becomes the folder's own card through the tool that brings a link in
 * (apps/dashboard/src/server/ask/tools/act/files/bring-in.ts). The card starts at the step that is left: connect where
 * no Drive is connected, choose where no folder is named, watch where one is. What cannot be done is said to AI in
 * words it says back, never a card that could not be pressed.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { CONNECTION, OWNER, SOURCE, T, sourceRow } from "../sources/_world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.VERCEL_ENV;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const FOLDER = "1AbCdEfGhIjKlMnOpQrStUv";
const LINK = `https://drive.google.com/drive/folders/${FOLDER}`;

/** The edge's sources door, as this file's world answers it: whether Drive is offered, and what a folder is named. */
const edge = { offered: true, folder: { id: FOLDER, name: "Salon reels" }, refusal: null, asked: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/sources")) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? "{}"));
  edge.asked.push(body);
  const answer = (status, said) =>
    new Response(JSON.stringify(said), { status, headers: { "content-type": "application/json" } });
  if (body.op === "readiness")
    return answer(200, {
      ok: true,
      drive: edge.offered,
      oauth: { client_id: "client-1", redirect_uri: "https://app.example/api/v1/sources/connect/callback" },
    });
  if (body.op === "folder")
    return edge.refusal
      ? answer(409, { ok: false, error: "conflict", reason: edge.refusal })
      : answer(200, { ok: true, folders: [edge.folder] });
  return answer(400, { ok: false, error: "bad_request" });
};
after(() => {
  globalThis.fetch = realFetch;
});

const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

beforeEach(() => {
  Object.assign(edge, { offered: true, folder: { id: FOLDER, name: "Salon reels" }, refusal: null, asked: [] });
});

const account = (over = {}) =>
  rows.sourceConnection({
    id: CONNECTION,
    tenant_id: T,
    provider_account: "google-sub-1",
    email: "owner@example.com",
    connected_by: OWNER,
    credentials_ref: `source-creds-${CONNECTION}`,
    ...over,
  });

/** A workspace as AI reads it: its video switch, its Drive account (none by default) and the folder it watches. */
function asked(link, { role = "owner", accounts = [], sources = [], videos = true } = {}) {
  const tables = {
    tenants: [rows.tenant({ id: T })],
    tenant_config: [rows.config({ tenant_id: T, config: { features: { video_preview: videos } } })],
    memberships: [rows.membership({ tenant_id: T, user_id: OWNER, role: "owner" })],
    source_connections: accounts,
    media_sources: sources,
    source_items: [],
  };
  const rpcs = {
    team_roster: () => [{ member_user_id: OWNER, display_name: "Ada", email: "ada@example.com" }],
    source_items_tally: () => ({
      found: 0,
      in: 0,
      coming: 0,
      landed: 0,
      budget: 0,
      room: 0,
      library_full: 0,
      videos_off: 0,
    }),
  };
  const ctx = { supabase: fakeDb(tables, {}, rpcs), userId: OWNER, email: "ada@example.com", params: {} };
  const tc = { ...newToolContext(ctx, T, role, "UTC", new Date()), question: link, askedEarlier: [], language: "en" };
  return buildProposal(tc, "propose_bring_in", { link });
}

test("Drive named with no link and none connected: the card starts at Connect and names no folder", async () => {
  const out = await asked("google drive");
  assert.equal(out.proposal?.kind, "bring_in", out.refusal ?? JSON.stringify(out));
  assert.equal(out.proposal.title, "Watch a Google Drive folder");
  assert.deepEqual(out.proposal.payload, { place: "drive", link: "google drive", folder_id: null, folder_name: null });
  assert.ok(!edge.asked.some((body) => body.op === "folder"), "no folder is asked of a Drive nobody connected");
});

test("a folder's link with none connected carries the folder along, unnamed, to be named once Drive is connected", async () => {
  const out = await asked(LINK);
  assert.equal(out.proposal?.kind, "bring_in", out.refusal ?? JSON.stringify(out));
  assert.deepEqual(out.proposal.payload, { place: "drive", link: LINK, folder_id: FOLDER, folder_name: null });
  assert.ok(!edge.asked.some((body) => body.op === "folder"));
});

test("a folder's link with Drive connected is named by that account, so the card says which folder it is", async () => {
  const out = await asked(LINK, { accounts: [account()] });
  assert.equal(out.proposal?.kind, "bring_in", out.refusal ?? JSON.stringify(out));
  assert.equal(out.proposal.title, "Watch “Salon reels”");
  assert.deepEqual(out.proposal.payload, { place: "drive", link: LINK, folder_id: FOLDER, folder_name: "Salon reels" });
  const named = edge.asked.find((body) => body.op === "folder");
  assert.deepEqual(
    { tenant_id: named.tenant_id, connection_id: named.connection_id, folder_id: named.folder_id },
    { tenant_id: T, connection_id: CONNECTION, folder_id: FOLDER },
    "the folder is asked of this workspace's own account",
  );
});

test("a folder the connected account cannot open is said in words with the way through, and no card is made", async () => {
  for (const refusal of ["no_access", "not_found", "unreadable"]) {
    edge.refusal = refusal;
    const out = await asked(LINK, { accounts: [account()] });
    assert.ok(!out.proposal, refusal);
    assert.match(out.refusal, /^owner@example\.com can't open that folder\./, refusal);
    assert.match(out.refusal, /Share it with that account in Google Drive/, refusal);
    assert.doesNotMatch(out.refusal, /no_access|not_found|unreadable|403|404/, "never Google's word or a code");
  }
});

test("Google not answering is no refusal: the card goes on without the folder's name", async () => {
  edge.refusal = "provider_unavailable";
  const out = await asked(LINK, { accounts: [account()] });
  assert.equal(out.proposal?.kind, "bring_in", out.refusal ?? JSON.stringify(out));
  assert.deepEqual(out.proposal.payload, { place: "drive", link: LINK, folder_id: FOLDER, folder_name: null });
});

test("the folder already watched is said so, and another folder is a card that offers the switch", async () => {
  const watched = sourceRow({ id: SOURCE, folder_id: FOLDER, folder_name: "Salon reels", state: "watching" });
  const same = await asked(LINK, { accounts: [account()], sources: [watched] });
  assert.ok(!same.proposal);
  assert.equal(
    same.refusal,
    "“Salon reels” is already being watched. Its new photos and videos come in by themselves.",
  );

  edge.folder = { id: "1ZzYyXxWwVvUuTtSsRrQq", name: "Winter shoot" };
  const other = await asked("https://drive.google.com/drive/folders/1ZzYyXxWwVvUuTtSsRrQq", {
    accounts: [account()],
    sources: [watched],
  });
  assert.equal(other.proposal?.title, "Watch “Winter shoot”", other.refusal);
});

test("a workspace that takes no videos yet is told the way that still works, and no card is made", async () => {
  // Drive not offered on the deployment at all is its own file (ai-says-when-drive-is-not-offered.test.mjs): the
  // server keeps the edge's word on that for minutes, so one process asks it one way.
  const noVideos = await asked("google drive", { videos: false });
  assert.ok(!noVideos.proposal);
  assert.match(noVideos.refusal, /can't watch a Google Drive folder in this workspace yet/);
  assert.match(noVideos.refusal, /from their phone/);
});

test("Google Photos and a link to one file are refused in words to say back, each with what to do instead", async () => {
  const photos = await asked("https://photos.google.com/album/AF1Qip");
  assert.ok(!photos.proposal);
  assert.match(photos.refusal, /Google Photos can't be watched/);
  const file = await asked("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view");
  assert.ok(!file.proposal);
  assert.match(file.refusal, /one file, not a folder/);
});
