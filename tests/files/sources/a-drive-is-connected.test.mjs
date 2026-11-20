/**
 * A business's Google Drive connected, a folder chosen and watched (the footage sources plan, P2), through the edge's
 * door as the dashboard's server knocks on it (POST /api/admin/sources), over a database in memory and a Drive and a
 * Google token endpoint that answer from memory. The sign-in's grant is checked to hold Drive, its token goes to
 * Vault and never onto a row, a grant that is not kept goes back to Google only when nothing else rides it, and a
 * folder's place in its provider's changes is saved before its first walk begins.
 */
import { test, after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { rows } from "../../_rows.mjs";
import { CONNECTION, OTHER, OWNER, ROOT, SOURCE, T, firstWalk, runJobs, setEnv, sourceRow, world } from "./_world.mjs";

setEnv();
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { runSourcesOp } = await import(at("apps/edge/lib/files/sources/ops.ts"));

let w;
beforeEach(() => resetBreakers());
afterEach(() => w?.restore());
after(() => setPg(null));

const DRIVE = "https://www.googleapis.com/auth/drive.readonly";
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
/** An id token as Google's token endpoint hands one: who the account is. */
const idToken = (sub, email) => `${b64({ alg: "RS256" })}.${b64({ sub, email })}.signature`;
/** A grant as the token endpoint answers a code with. */
const grantOf = (over = {}) => ({
  access_token: "access-token-new",
  refresh_token: "refresh-token-new",
  expires_in: 3600,
  scope: `openid https://www.googleapis.com/auth/userinfo.email ${DRIVE}`,
  id_token: idToken("google-sub-9", "Owner@Example.com"),
  ...over,
});

/** A world with no account connected yet, the door's database set to it. */
function fresh(more = {}) {
  w = world({
    source: false,
    tables: { source_connections: [], google_connections: [], mailbox_connections: [], ...more },
  });
  w.vault.clear();
  setPg(w.db);
  return w;
}
/** A world with the account connected and nothing watched. */
function connected(more = {}) {
  w = world({ source: false, tables: { google_connections: [], mailbox_connections: [], ...more } });
  setPg(w.db);
  w.drive
    .folder(ROOT, "Footage", null, { root: false })
    .folder("my-root", "My Drive", null, { root: true })
    .folder("clips", "Clips", "my-root")
    .folder("old", "Old", "my-root")
    .photo("a-file", "not a folder.jpg", "my-root")
    .video("clip-1", "a.MOV", ROOT);
  return w;
}

/** A knock at the door as the dashboard's server makes it for this workspace's member. */
const knock = async (body, workspace = T) => {
  const res = await runSourcesOp({ ok: true, via: "token", workspace, user: OWNER }, body);
  return [res.status, await res.json()];
};

/* ------------------------------------------------------------------------------------------------ connecting -- */

test("the door says whether Drive is offered here, with the public half of its client and never its secret", async () => {
  fresh();
  const [status, body] = await knock({ op: "readiness" });
  assert.equal(status, 200);
  assert.deepEqual(body.oauth, {
    client_id: "client-id.apps.googleusercontent.com",
    redirect_uri: "https://app.example.com/api/v1/sources/callback",
  });
  assert.equal(body.drive, true);
  assert.doesNotMatch(JSON.stringify(body), /client-secret/);
});

test("Drive is offered only in the workspaces SOURCES_WORKSPACES names: a connect or a watch elsewhere is refused before Google is asked", async () => {
  const was = process.env.SOURCES_WORKSPACES;
  try {
    for (const [list, offered] of [
      ["", false],
      [OTHER, false],
      [`${OTHER}, ${T}`, true],
      ["*", true],
    ]) {
      process.env.SOURCES_WORKSPACES = list;
      fresh();
      const [, ready] = await knock({ op: "readiness" });
      assert.equal(ready.drive, offered, `"${list}"`);
      assert.equal(ready.oauth === null, !offered, `"${list}": the client's public half only where offered`);
      if (offered) continue;
      w.drive.grant(() => assert.fail("Google is never asked where Drive is not offered"));
      const [status, body] = await knock({ op: "connect", code: "code-from-google", code_verifier: "v".repeat(43) });
      assert.deepEqual([status, body.error, body.reason], [503, "no_oauth_client", "not_available"], `"${list}"`);
      const [watchStatus] = await knock({ op: "watch", connection_id: CONNECTION, folder_id: "f" });
      assert.equal(watchStatus, 503, `"${list}": a watch too`);
    }
  } finally {
    process.env.SOURCES_WORKSPACES = was;
  }
});

test("a connect trades the code for a grant, keeps its token in Vault and writes the account's row", async () => {
  fresh();
  w.drive.grant((form) => {
    assert.equal(form.get("grant_type"), "authorization_code");
    assert.equal(form.get("code"), "code-from-google");
    assert.equal(form.get("code_verifier"), "v".repeat(43));
    assert.equal(form.get("redirect_uri"), "https://app.example.com/api/v1/sources/callback");
    return grantOf();
  });
  const [status, body] = await knock({ op: "connect", code: "code-from-google", code_verifier: "v".repeat(43) });
  assert.equal(status, 200);
  const [row] = w.tables.source_connections;
  assert.equal(body.connection_id, row.id);
  assert.deepEqual(
    [row.tenant_id, row.provider, row.provider_account, row.email, row.health, row.connected_by],
    [T, "google", "google-sub-9", "owner@example.com", "ok", OWNER],
  );
  assert.ok(row.scopes.includes(DRIVE));
  assert.doesNotMatch(JSON.stringify(row), /refresh-token-new|access-token-new/, "no token is on the row");
  assert.equal(w.vault.get(row.id).refresh_token, "refresh-token-new");
  assert.deepEqual(w.drive.revoked, [], "a grant that is kept is not given back");
});

test("a workspace that does not take videos yet is not connected, and Google is not asked", async () => {
  fresh({ tenant_config: [rows.config({ tenant_id: T, config: { features: {} } })] });
  const [status, body] = await knock({ op: "connect", code: "code-from-google" });
  assert.deepEqual([status, body.error, body.reason], [503, "not_ready", "not_enabled"]);
  assert.equal(w.drive.calls.length, 0);
  assert.equal(w.tables.source_connections.length, 0);
});

test("a grant without Drive is not kept, and goes back to Google only when nothing else rides the account", async () => {
  fresh();
  w.drive.grant(grantOf({ scope: "openid email" }));
  const [status, body] = await knock({ op: "connect", code: "code-1" });
  assert.deepEqual([status, body.error], [400, "scope_missing"]);
  assert.deepEqual(w.drive.revoked, ["refresh-token-new"], "alone: given back");
  assert.equal(w.tables.source_connections.length, 0);

  // The same Google account connected a mailbox in another workspace: a revoke would sign that mailbox out.
  fresh({
    mailbox_connections: [
      rows.mailboxConnection({
        tenant_id: OTHER,
        provider: "google",
        provider_account: "google-sub-9",
        state: "connected",
      }),
    ],
  });
  w.drive.grant(grantOf({ scope: "openid email" }));
  await knock({ op: "connect", code: "code-2" });
  assert.deepEqual(w.drive.revoked, [], "held by the mailbox: Google is not asked");
});

test("a grant with no refresh token, or that names no account, is refused", async () => {
  fresh();
  w.drive.grant(grantOf({ refresh_token: undefined }));
  assert.deepEqual((await knock({ op: "connect", code: "code-1" }))[1].error, "no_refresh_token");
  w.drive.grant(grantOf({ id_token: undefined }));
  assert.deepEqual((await knock({ op: "connect", code: "code-2" }))[1].error, "no_account");
  assert.equal(w.tables.source_connections.length, 0);
  assert.equal(w.vault.size, 0);
});

test("an organisation that blocks the app gives no grant: the workspace's row says so, once, until an account that may connects", async () => {
  fresh();
  w.drive.grant({ error: "admin_policy_enforced" }).grant({ error: "admin_policy_enforced" });
  const [status, body] = await knock({ op: "connect", code: "code-1" });
  assert.deepEqual([status, body.error, body.reason], [502, "google_refused", "blocked_by_admin"]);
  await knock({ op: "connect", code: "code-2" });
  assert.equal(w.tables.source_connections.length, 1, "said once, not once a try");
  const [blocked] = w.tables.source_connections;
  assert.deepEqual(
    [blocked.health, blocked.provider_account ?? null, blocked.email ?? null],
    ["blocked_by_admin", null, null],
  );

  w.drive.grant(grantOf());
  assert.equal((await knock({ op: "connect", code: "code-3" }))[0], 200);
  assert.deepEqual(
    w.tables.source_connections.map((row) => row.health),
    ["ok"],
    "an account that may be read ends the word that one could not",
  );
});

test("a reconnect of the same account writes over its row, replaces its token and resumes its paused folders", async () => {
  w = world({
    source: { state: "paused", stopped_why: "signed_out", reconciled_at: "2026-11-10T00:00:00.000Z" },
    tables: { google_connections: [], mailbox_connections: [] },
  });
  setPg(w.db);
  w.tables.source_connections[0].health = "needs_reconnect";
  w.drive.grant(grantOf({ id_token: idToken("google-sub-1", "owner@example.com") }));
  const [status, body] = await knock({ op: "connect", code: "code-again" });
  assert.deepEqual([status, body.connection_id, body.resumed], [200, CONNECTION, 1]);
  assert.equal(w.tables.source_connections.length, 1, "its own row, kept with its folders");
  assert.equal(w.tables.source_connections[0].health, "ok");
  assert.equal(w.vault.get(CONNECTION).refresh_token, "refresh-token-new");
  const source = w.source();
  assert.deepEqual([source.state, source.stopped_why], ["watching", null]);
  assert.ok(
    Date.parse(source.next_read_at) <= Date.now(),
    "read at the clock's next turn, from the place its row kept",
  );
});

test("a new account whose token cannot be kept leaves no row behind", async () => {
  w = world({
    source: false,
    tables: { source_connections: [], google_connections: [], mailbox_connections: [] },
    rpcs: {
      source_credentials_put: () => {
        throw new Error("vault is down");
      },
    },
  });
  w.vault.clear();
  setPg(w.db);
  w.drive.grant(grantOf());
  const [status, body] = await knock({ op: "connect", code: "code-1" });
  assert.deepEqual([status, body.error], [500, "credentials_failed"]);
  assert.equal(w.tables.source_connections.length, 0, "a row without its token would be a lie");
  assert.deepEqual(w.drive.revoked, ["refresh-token-new"]);
});

/* ---------------------------------------------------------------------------------------------- the chooser -- */

test("the folder chooser reads one level at a time, folders only", async () => {
  connected();
  const mine = await knock({ op: "folders", connection_id: CONNECTION, place: "mine" });
  assert.deepEqual(mine, [
    200,
    {
      ok: true,
      folders: [
        { id: "clips", name: "Clips" },
        { id: "old", name: "Old" },
      ],
      next_page: null,
    },
  ]);
  const opened = await knock({ op: "folders", connection_id: CONNECTION, place: "folder", folder_id: ROOT });
  assert.deepEqual(opened[1].folders, [], "a folder with only files in it shows no file");
  assert.equal(w.drive.calls.length, 2, "only the levels a person opened were read");
  assert.equal(w.drive.units(), 200);
  assert.deepEqual((await knock({ op: "folders", connection_id: CONNECTION, place: "folder" }))[0], 400);
});

test("a pasted folder is named by its account, with nothing listed; a file, or a folder not there, is not", async () => {
  connected();
  assert.deepEqual(await knock({ op: "folder", connection_id: CONNECTION, folder_id: "clips" }), [
    200,
    { ok: true, folders: [{ id: "clips", name: "Clips" }], next_page: null },
  ]);
  assert.equal(w.drive.calls.length, 1, "one question to Drive: the folder itself");
  for (const folder_id of ["no-such-folder", "a-file"]) {
    const [status, answer] = await knock({ op: "folder", connection_id: CONNECTION, folder_id });
    assert.deepEqual([status, answer.error], [404, "not_found"], folder_id);
  }
  assert.equal((await knock({ op: "folder", connection_id: CONNECTION }))[0], 400, "a folder is named by its id");
  assert.equal(w.tables.media_sources.length, 0, "naming a folder watches nothing");
  // Another workspace's knock finds no account of its own to ask through.
  const [status, answer] = await knock({ op: "folder", connection_id: CONNECTION, folder_id: "clips" }, OTHER);
  assert.deepEqual([status, answer.error], [404, "not_found"]);
});

test("one workspace cannot reach another's account, folder or token", async () => {
  connected({ media_sources: [sourceRow({ state: "watching" })] });
  for (const body of [
    { op: "folders", connection_id: CONNECTION, place: "mine" },
    { op: "watch", connection_id: CONNECTION, folder_id: ROOT },
    { op: "disconnect", connection_id: CONNECTION },
    { op: "check", source_id: SOURCE },
    { op: "stop", source_id: SOURCE },
  ]) {
    const [status, answer] = await knock(body, OTHER);
    assert.deepEqual([status, answer.error], [404, "not_found"], body.op);
  }
  assert.equal(w.drive.calls.length, 0);
  assert.equal(w.tables.source_connections.length, 1);
  assert.equal(w.source().state, "watching");
  // A body that names another workspace than the knock's token is refused outright.
  const res = await runSourcesOp(
    { ok: true, via: "token", workspace: OTHER, user: OWNER },
    { op: "check", tenant_id: T, source_id: SOURCE },
  );
  assert.equal(res.status, 403);
});

/* ------------------------------------------------------------------------------------------------ a watch -- */

test("the folder's older files are asked for (call 7): its listed photos and videos wait to be taken, nothing else moves", async () => {
  const item = (id, kind, state) => ({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    tenant_id: T,
    source_id: SOURCE,
    provider_id: `item-${id}`,
    kind,
    state,
    why: null,
  });
  connected({
    media_sources: [sourceRow({ state: "watching", folder_id: "old-folder" })],
    source_items: [
      item(1, "video", "listed"),
      item(2, "image", "listed"),
      item(3, "folder", "listed"),
      item(4, "video", "in"),
      item(5, "video", "too_big"),
    ],
  });
  const [status, body] = await knock({ op: "older", source_id: SOURCE });
  assert.deepEqual([status, body.asked], [200, 2]);
  assert.deepEqual(
    w.tables.source_items.map((row) => row.state),
    ["waiting", "waiting", "listed", "in", "too_big"],
    "a folder of the tree, a file in, one too big: as they were",
  );
  const [refused] = await knock({ op: "older", source_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" });
  assert.equal(refused, 404, "a folder not watched here asks for nothing");
});

test("a switch opens the new folder first: one Drive can't find leaves the folder watched now as it was, one it opens takes its place", async () => {
  connected({ media_sources: [sourceRow({ state: "watching", folder_id: "old-folder" })] });
  const [refused] = await knock({ op: "watch", connection_id: CONNECTION, folder_id: "no-such-folder", instead: true });
  assert.notEqual(refused, 200);
  assert.equal(w.source().state, "watching", "a folder that can't be watched never costs the one that is");
  const [status, body] = await knock({ op: "watch", connection_id: CONNECTION, folder_id: ROOT, instead: true });
  assert.equal(status, 200);
  assert.notEqual(body.source_id, SOURCE);
  assert.equal(w.source().state, "stopped", "stopped only once the new one opened");
  assert.equal(w.tables.media_sources.find((row) => row.id === body.source_id).state, "setting_up");
});

test("a watch saves the folder's place in the changes before its first walk begins, so nothing in between is missed", async () => {
  connected();
  const [status, body] = await knock({ op: "watch", connection_id: CONNECTION, folder_id: ROOT });
  assert.deepEqual([status, body.made], [200, true]);
  const source = w.tables.media_sources.find((row) => row.id === body.source_id);
  assert.deepEqual(
    [source.state, source.folder_name, source.include_subfolders, source.walk_run],
    ["setting_up", "Footage", true, 0],
  );
  assert.deepEqual(
    w.drive.calls.map((call) => call.path),
    [`/drive/v3/files/${ROOT}`, "/drive/v3/changes/startPageToken"],
    "the folder is validated, its place is taken, and nothing is listed inside the press",
  );
  const [job] = w.waiting("source_walk");
  assert.deepEqual(job.payload, { source_id: source.id, run: "1", step: "0", walk: "snapshot" });

  // A clip arrives after the place was saved and before the walk has run.
  const place = source.change_cursor;
  w.drive.video("clip-between", "b.MOV", ROOT);
  await runJobs(w);
  const item = w.tables.source_items.find((row) => row.provider_id === "clip-between");
  assert.equal(item.state, "waiting");
  assert.notEqual(w.tables.media_sources[0].change_cursor, place, "and the first read replayed from the saved place");
  assert.equal(w.tables.source_items.filter((row) => row.provider_id === "clip-between").length, 1);
});

test("choosing a folder twice is one watch, and a workspace watches one folder at launch", async () => {
  connected();
  const first = await knock({ op: "watch", connection_id: CONNECTION, folder_id: ROOT });
  const again = await knock({ op: "watch", connection_id: CONNECTION, folder_id: ROOT });
  assert.deepEqual([again[0], again[1].made, again[1].source_id], [200, false, first[1].source_id]);
  assert.equal(w.tables.media_sources.length, 1);
  assert.equal(w.waiting("source_walk").length, 1, "one walk, not two");
  const second = await knock({ op: "watch", connection_id: CONNECTION, folder_id: "clips" });
  assert.deepEqual([second[0], second[1].error], [409, "too_many"]);
});

test("a folder that is not there, or is a file, is not watched", async () => {
  connected();
  assert.deepEqual((await knock({ op: "watch", connection_id: CONNECTION, folder_id: "no-such-folder" }))[0], 404);
  assert.deepEqual((await knock({ op: "watch", connection_id: CONNECTION, folder_id: "a-file" }))[0], 404);
  assert.equal(w.tables.media_sources.length, 0);
});

test("check now reads the folder at once; stop ends the watch, closes its channel and keeps what came in", async () => {
  connected({ media_sources: [sourceRow()] });
  await firstWalk(w);
  assert.ok(w.source().channel_id, "its first read opened its channel");
  assert.deepEqual(await knock({ op: "check", source_id: SOURCE }), [200, { ok: true, scheduled: true }]);
  assert.deepEqual((await knock({ op: "check", source_id: SOURCE }))[1].scheduled, false, "one already waits");

  const items = w.items().length;
  assert.equal((await knock({ op: "stop", source_id: SOURCE }))[0], 200);
  const stopped = w.source();
  assert.deepEqual([stopped.state, stopped.channel_id, stopped.next_read_at], ["stopped", null, null]);
  assert.equal(w.drive.channels.size, 0, "closed at Drive, so it stops signalling");
  assert.equal(w.items().length, items, "what came in stays");
  assert.deepEqual((await knock({ op: "check", source_id: SOURCE }))[0], 404, "a stopped folder is not read");

  // Watched again: a new place, and a whole walk from it.
  w.drive.video("clip-later", "c.MOV", ROOT);
  const [status, body] = await knock({ op: "watch", connection_id: CONNECTION, folder_id: ROOT });
  assert.deepEqual([status, body.source_id, body.made], [200, SOURCE, false]);
  await runJobs(w);
  assert.equal(w.source().state, "watching");
  assert.ok(w.item("clip-later"), "what arrived while it was stopped is found");
});

test("a person's word for a held wave walks the folder at the clock's next turn, and that walk marks them", async () => {
  connected({ media_sources: [sourceRow()] });
  for (let n = 0; n < 30; n++) w.drive.photo(`photo-${n}`, `${n}.jpg`, ROOT);
  await firstWalk(w);
  assert.deepEqual((await knock({ op: "confirm", source_id: SOURCE }))[0], 404, "nothing is held");
  for (let n = 0; n < 25; n++) w.drive.trash(`photo-${n}`);
  w.tables.jobs.push({
    id: "job-read",
    tenant_id: T,
    kind: "source_read",
    state: "scheduled",
    due_at: new Date().toISOString(),
    payload: { source_id: SOURCE },
    attempts: 0,
  });
  await runJobs(w);
  assert.equal(w.source().hold_count, 25);
  assert.equal((await knock({ op: "confirm", source_id: SOURCE }))[0], 200);
  assert.ok(w.source().hold_confirmed_at);
  assert.ok(Date.parse(w.source().next_walk_at) <= Date.now());
});

/* --------------------------------------------------------------------------------------------- disconnecting -- */

test("disconnecting closes the folder's channel, drops the token and gives the grant back when nothing else rides it", async () => {
  connected({ media_sources: [sourceRow()] });
  await firstWalk(w);
  assert.equal(w.drive.channels.size, 1);
  const [status, body] = await knock({ op: "disconnect", connection_id: CONNECTION });
  assert.deepEqual([status, body.removed, body.revoked], [200, true, true]);
  assert.deepEqual(w.drive.revoked, ["refresh-token-1"]);
  assert.equal(w.drive.channels.size, 0);
  assert.equal(w.vault.size, 0, "the token leaves Vault");
  assert.equal(w.tables.source_connections.length, 0);
});

test("disconnecting leaves the grant with Google while a mailbox or a profile of the same account rides it", async () => {
  connected({
    mailbox_connections: [
      rows.mailboxConnection({
        tenant_id: T,
        provider: "google",
        provider_account: "google-sub-1",
        state: "connected",
      }),
    ],
  });
  const [, body] = await knock({ op: "disconnect", connection_id: CONNECTION });
  assert.deepEqual([body.removed, body.revoked], [true, false]);
  assert.deepEqual(w.drive.revoked, [], "a revoke would have signed the mailbox out too");
  assert.equal(w.vault.size, 0, "our own key is dropped all the same");
});
