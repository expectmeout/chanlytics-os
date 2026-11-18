/**
 * Google Drive's wire, as a footage source's provider (the footage sources plan, P2): the sign-in that asks for Drive
 * alone, and each call of the provider's contract over a fetch that answers from memory. What goes out is read back as
 * Drive would read it: the change list is asked for ids and never a name, an item's record never for a photo's place,
 * and Drive's own answers are judged once (go on, rest, no access, gone).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";

const { driveSource, SourceKeyRefused, SourceUnanswered } = await import(at("packages/channels/src/files/drive.ts"));
const { driveAuthorizeUrl, driveTokenRequest, DRIVE_SCOPES } = await import(
  at("packages/channels/src/files/drive-sign-in.ts")
);

beforeEach(() => resetBreakers());

const TOKEN = "an-hour's-drive-key";
const MINE = { id: "folder-1", name: "Footage", driveId: null };
const SHARED = { id: "folder-2", name: "Footage", driveId: "drive-9" };

const answers = (...replies) => {
  const calls = [];
  return {
    calls,
    fetch: async (url, init = {}) => {
      calls.push({ url: new URL(String(url)), init });
      const reply = replies.shift();
      if (!reply) throw new Error(`nothing answers ${url}`);
      return reply;
    },
  };
};
const ok = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const refusal = (status, reason, extra = {}, headers = {}) =>
  new Response(JSON.stringify({ error: { code: status, errors: [{ reason, ...extra }] } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const noSleep = { sleep: async () => {} };
const drive = (web) => driveSource({ fetch: web.fetch, ...noSleep });

/* ---------------------------------------------------------------------------------------------------- the sign-in -- */

test("the sign-in asks for Drive, read only, and who the account is, and folds in nothing granted before", () => {
  const url = new URL(
    driveAuthorizeUrl({ clientId: "client-1", redirectUri: "https://app.example.com/back" }, "signed-state", {
      loginHint: "owner@example.com",
      challenge: "challenge-1",
    }),
  );
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.deepEqual(url.searchParams.get("scope").split(" "), [
    "openid",
    "email",
    "https://www.googleapis.com/auth/drive.readonly",
  ]);
  assert.deepEqual([...DRIVE_SCOPES], url.searchParams.get("scope").split(" "));
  assert.equal(url.searchParams.get("include_granted_scopes"), "false", "each Google key opens one door (D17)");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), "signed-state");
  assert.equal(url.searchParams.get("login_hint"), "owner@example.com");
  assert.equal(url.searchParams.get("code_challenge"), "challenge-1");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("the code's exchange carries the verifier only where the consent was asked with its challenge", () => {
  const client = { clientId: "client-1", clientSecret: "secret-1", redirectUri: "https://app.example.com/back" };
  const withVerifier = new URLSearchParams(driveTokenRequest(client, "code-1", "verifier-1").body);
  assert.equal(withVerifier.get("grant_type"), "authorization_code");
  assert.equal(withVerifier.get("code"), "code-1");
  assert.equal(withVerifier.get("code_verifier"), "verifier-1");
  assert.equal(new URLSearchParams(driveTokenRequest(client, "code-1", null).body).has("code_verifier"), false);
});

/* ------------------------------------------------------------------------------------------- a folder, and its items -- */

test("a folder is validated by its own record: its name and its shared drive, and a file or a binned folder is gone", async () => {
  const web = answers(
    ok({ id: "folder-2", name: "Footage", mimeType: "application/vnd.google-apps.folder", driveId: "drive-9" }),
    ok({ id: "clip-1", name: "IMG_1.MOV", mimeType: "video/quicktime" }),
    ok({ id: "folder-3", name: "Old", mimeType: "application/vnd.google-apps.folder", trashed: true }),
  );
  const source = drive(web);
  assert.deepEqual(await source.validateFolder(TOKEN, "folder-2"), { verdict: "ok", answer: SHARED });
  assert.deepEqual(await source.validateFolder(TOKEN, "clip-1"), { verdict: "gone" });
  assert.deepEqual(await source.validateFolder(TOKEN, "folder-3"), { verdict: "gone" });
  const { url, init } = web.calls[0];
  assert.equal(url.pathname, "/drive/v3/files/folder-2");
  assert.equal(url.searchParams.get("supportsAllDrives"), "true");
  assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
});

test("a folder's children come a page at a time, each cut to what the table holds, and never a photo's place or camera", async () => {
  const long = "n".repeat(1200);
  const web = answers(
    ok({
      nextPageToken: "page-2",
      files: [
        {
          id: "clip-1",
          name: "IMG_3185.MOV",
          mimeType: "video/quicktime",
          parents: ["folder-1"],
          modifiedTime: "2026-11-11T10:00:00.000Z",
          md5Checksum: "abc123",
          size: "56812805",
          videoMediaMetadata: { durationMillis: "8200" },
          lastModifyingUser: { displayName: "Dana Reyes" },
        },
        { id: "photo-1", name: long, mimeType: "image/heic", parents: ["folder-1"], size: "4000000" },
        { id: "sub-1", name: "November", mimeType: "application/vnd.google-apps.folder", parents: ["folder-1"] },
        { id: "doc-1", name: "Notes", mimeType: "application/vnd.google-apps.document", parents: ["folder-1"] },
        { id: "raw-1", name: "IMG_1.dng", mimeType: "image/x-adobe-dng", parents: ["folder-1"], size: "30000000" },
        { name: "no id" },
      ],
    }),
  );
  const page = await drive(web).listChildren(TOKEN, "folder-1", null);
  assert.equal(page.verdict, "ok");
  assert.equal(page.answer.nextPage, "page-2");
  assert.deepEqual(
    page.answer.items.map((item) => [item.id, item.kind]),
    [
      ["clip-1", "video"],
      ["photo-1", "image"],
      ["sub-1", "folder"],
      ["doc-1", "other"],
      ["raw-1", "other"],
    ],
    "a document and a RAW photo are seen and passed over; a record with no id is not an item",
  );
  assert.deepEqual(page.answer.items[0], {
    id: "clip-1",
    kind: "video",
    parentId: "folder-1",
    name: "IMG_3185.MOV",
    mime: "video/quicktime",
    modifiedAt: "2026-11-11T10:00:00.000Z",
    createdAt: null,
    checksum: "abc123",
    bytes: 56812805,
    seconds: 8.2,
    addedBy: "Dana Reyes",
    trashed: false,
  });
  assert.equal(page.answer.items[1].name.length, 1000, "a longer name is cut, never refused whole");
  assert.equal(page.answer.items[1].seconds, null);
  const { url } = web.calls[0];
  assert.equal(url.pathname, "/drive/v3/files");
  assert.equal(
    url.searchParams.get("q"),
    "'folder-1' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'image/' or mimeType contains 'video/')",
    "folders, photos and videos alone: a document is never asked for",
  );
  assert.equal(url.searchParams.get("pageSize"), "1000");
  assert.equal(url.searchParams.get("includeItemsFromAllDrives"), "true");
  const fields = url.searchParams.get("fields");
  assert.match(fields, /videoMediaMetadata\(durationMillis\)/);
  assert.doesNotMatch(fields, /imageMediaMetadata|location|camera|owners|permissions|thumbnail/i);
});

test("a page token Drive no longer takes starts the folder again from its first page", async () => {
  const web = answers(
    refusal(400, "invalid", { location: "pageToken", locationType: "parameter" }),
    ok({ files: [{ id: "clip-1", name: "a.mp4", mimeType: "video/mp4", parents: ["folder-1"] }] }),
  );
  const page = await drive(web).listChildren(TOKEN, "folder-1", "a-stale-page");
  assert.equal(page.verdict, "ok");
  assert.equal(page.answer.items.length, 1);
  assert.equal(web.calls[0].url.searchParams.get("pageToken"), "a-stale-page");
  assert.equal(web.calls[1].url.searchParams.has("pageToken"), false);
});

test("one item's own record is read by its id", async () => {
  const web = answers(
    ok({ id: "clip-1", name: "a.mp4", mimeType: "video/mp4", parents: ["sub-1"], trashed: true, size: "10" }),
  );
  const item = await drive(web).getItem(TOKEN, "clip-1");
  assert.equal(item.verdict, "ok");
  assert.equal(item.answer.trashed, true);
  assert.equal(item.answer.parentId, "sub-1");
  assert.equal(web.calls[0].url.pathname, "/drive/v3/files/clip-1");
});

/* ----------------------------------------------------------------------------------------------------- the changes -- */

test("the change list is asked for ids only, of the account's own list or of the shared drive's", async () => {
  const web = answers(
    ok({ startPageToken: "100" }),
    ok({
      nextPageToken: "101",
      changes: [
        { fileId: "clip-1", changeType: "file", file: { id: "clip-1", parents: ["folder-1"], mimeType: "video/mp4" } },
        { fileId: "doc-7", file: { id: "doc-7", parents: ["elsewhere"], mimeType: "application/pdf", trashed: true } },
        { fileId: "clip-2", removed: true },
        { changeType: "drive", driveId: "drive-9" },
      ],
    }),
    ok({ newStartPageToken: "200", changes: [] }),
    ok({ startPageToken: "300" }),
  );
  const source = drive(web);
  assert.deepEqual(await source.getStartCursor(TOKEN, MINE), { verdict: "ok", answer: "100" });
  const first = await source.listChanges(TOKEN, MINE, "100");
  assert.deepEqual(first, {
    verdict: "ok",
    answer: {
      changes: [
        { id: "clip-1", parentId: "folder-1", kind: "video", trashed: false, removed: false },
        // A document is no kind: its change is passed over unread, wherever it sits.
        { id: "doc-7", parentId: "elsewhere", kind: null, trashed: true, removed: false },
        { id: "clip-2", parentId: null, kind: null, trashed: false, removed: true },
      ],
      nextPage: "101",
      cursor: null,
    },
  });
  const last = await source.listChanges(TOKEN, SHARED, "101");
  assert.deepEqual(last.answer, { changes: [], nextPage: null, cursor: "200" });
  await source.getStartCursor(TOKEN, SHARED);

  const [start, mine, shared, sharedStart] = web.calls.map((call) => call.url);
  assert.equal(start.pathname, "/drive/v3/changes/startPageToken");
  assert.equal(start.searchParams.has("driveId"), false);
  assert.equal(mine.pathname, "/drive/v3/changes");
  assert.equal(mine.searchParams.get("pageToken"), "100");
  assert.equal(mine.searchParams.get("includeRemoved"), "true");
  assert.equal(
    mine.searchParams.has("driveId"),
    false,
    "a folder in the account's own Drive is read from its own list",
  );
  assert.equal(
    mine.searchParams.get("fields"),
    "nextPageToken,newStartPageToken,changes(fileId,removed,changeType,file(id,parents,mimeType,trashed))",
    "the list covers the whole account, so no name is asked of it",
  );
  assert.equal(shared.searchParams.get("driveId"), "drive-9", "a shared drive's changes are read there");
  assert.equal(shared.searchParams.get("includeItemsFromAllDrives"), "true");
  assert.equal(sharedStart.searchParams.get("driveId"), "drive-9");
});

test("a place in the change list Drive no longer knows is gone, and its reader starts again from a walk", async () => {
  const web = answers(refusal(400, "invalid", { location: "pageToken", locationType: "parameter" }));
  assert.deepEqual(await drive(web).listChanges(TOKEN, MINE, "long-ago"), { verdict: "gone" });
});

/* ------------------------------------------------------------------------------------------------ Drive's answers -- */

test("Drive's not-now is a rest with its own time, a 404 gone, and a 403 about the one item asked for no access", async () => {
  const web = answers(
    refusal(403, "userRateLimitExceeded"),
    refusal(403, "rateLimitExceeded"),
    refusal(429, "rateLimitExceeded", {}, { "retry-after": "120" }),
    refusal(404, "notFound"),
    refusal(403, "insufficientFilePermissions"),
    refusal(403, "forbidden"),
  );
  const source = drive(web);
  assert.deepEqual(await source.getItem(TOKEN, "a"), { verdict: "pace", restMs: 60_000 });
  assert.deepEqual(await source.getItem(TOKEN, "b"), { verdict: "pace", restMs: 60_000 });
  assert.deepEqual(await source.getItem(TOKEN, "c"), { verdict: "pace", restMs: 120_000 });
  assert.deepEqual(await source.getItem(TOKEN, "d"), { verdict: "gone" });
  assert.deepEqual(await source.getItem(TOKEN, "e"), { verdict: "no_access" });
  assert.deepEqual(
    await source.getItem(TOKEN, "f"),
    { verdict: "no_access" },
    "any 403 on one item's record is that item's",
  );
});

test("a 403 on a list that may be about the project is no answer: nothing is said of the account or the folder", async () => {
  // The API switched off for the project, its billing, a reason nobody has seen yet.
  for (const reason of ["accessNotConfigured", "forbidden", "domainPolicy", "aNewReasonOf2027"]) {
    const web = answers(refusal(403, reason));
    await assert.rejects(
      () => drive(web).listChanges(TOKEN, MINE, "100"),
      (error) => error instanceof SourceUnanswered && error.status === 403 && error.reason === reason,
      reason,
    );
  }
  const listed = answers(refusal(403, "accessNotConfigured"));
  await assert.rejects(() => drive(listed).listChildren(TOKEN, "folder-1", null), SourceUnanswered);
  // About the folder itself, a list's 403 is that folder's.
  const folder = answers(refusal(403, "insufficientFilePermissions"));
  assert.deepEqual(await drive(folder).listChildren(TOKEN, "folder-1", null), { verdict: "no_access" });
  // A shared drive's own list not found: the account is no longer its member.
  const left = answers(refusal(404, "notFound"));
  assert.deepEqual(await drive(left).listChanges(TOKEN, SHARED, "100"), { verdict: "no_access" });
});

test("a refused key and a missing scope are never a verdict: they are thrown for their asker to settle", async () => {
  const web = answers(refusal(401, "authError"), refusal(403, "insufficientPermissions"), refusal(401, "authError"));
  const source = drive(web);
  await assert.rejects(
    () => source.listChanges(TOKEN, MINE, "100"),
    (error) => error instanceof SourceKeyRefused && error.refused === "key",
  );
  await assert.rejects(
    () => source.listChildren(TOKEN, "folder-1", null),
    (error) => error instanceof SourceKeyRefused && error.refused === "scope",
  );
  await assert.rejects(() => source.getItem(TOKEN, "clip-1"), SourceKeyRefused, "on an item's record too");
});

test("each call tells what it cost at Google: a list 100, a record 5, a channel closed 5", async () => {
  const web = answers(
    ok({ changes: [], newStartPageToken: "101" }),
    ok({ id: "clip-1", mimeType: "video/mp4" }),
    new Response(null, { status: 204 }),
  );
  const spent = [];
  const source = driveSource({ fetch: web.fetch, spent: (units) => spent.push(units) });
  await source.listChanges(TOKEN, MINE, "100");
  await source.getItem(TOKEN, "clip-1");
  await source.closeChannel(TOKEN, { id: "channel-1", resourceId: "resource-1" });
  assert.deepEqual(spent, [100, 5, 5]);
});

test("no answer from Drive is not a verdict: the read is asked once more, then throws for its job to be tried again", async () => {
  const web = answers(new Response("upstream", { status: 503 }), new Response("upstream", { status: 503 }));
  await assert.rejects(
    () => drive(web).getItem(TOKEN, "clip-1"),
    (error) => error instanceof SourceUnanswered && error.status === 503,
  );
  assert.equal(web.calls.length, 2);
});

/* ---------------------------------------------------------------------------------------------------- the channel -- */

test("a channel is opened from now with our id, token and address for a week at most, and closed by its two names", async () => {
  const before = Date.now();
  const web = answers(
    ok({ startPageToken: "500" }),
    ok({ kind: "api#channel", id: "channel-1", resourceId: "resource-1", expiration: String(before + 600_000_000) }),
    new Response(null, { status: 204 }),
    refusal(404, "notFound"),
  );
  const source = drive(web);
  const opened = await source.openChannel(TOKEN, SHARED, {
    id: "channel-1",
    token: "channel-token",
    address: "https://edge.example.com/api/sources/drive",
  });
  assert.deepEqual(opened, {
    verdict: "ok",
    answer: { id: "channel-1", resourceId: "resource-1", expiresAt: new Date(before + 600_000_000).toISOString() },
  });
  const watch = web.calls[1];
  assert.equal(watch.url.pathname, "/drive/v3/changes/watch");
  assert.equal(watch.url.searchParams.get("pageToken"), "500");
  assert.equal(watch.url.searchParams.get("driveId"), "drive-9");
  assert.equal(watch.init.method, "POST");
  const body = JSON.parse(watch.init.body);
  assert.deepEqual(
    { id: body.id, type: body.type, address: body.address, token: body.token },
    {
      id: "channel-1",
      type: "web_hook",
      address: "https://edge.example.com/api/sources/drive",
      token: "channel-token",
    },
  );
  const lasts = Number(body.expiration) - before;
  assert.ok(lasts > 6 * 86_400_000 && lasts <= 7 * 86_400_000, "Drive lets a change channel last a week at most");

  const channel = { id: "channel-1", resourceId: "resource-1" };
  assert.deepEqual(await source.closeChannel(TOKEN, channel), { verdict: "ok", answer: null });
  assert.deepEqual(await source.closeChannel(TOKEN, channel), { verdict: "gone" });
  assert.equal(web.calls[2].url.pathname, "/drive/v3/channels/stop");
  assert.deepEqual(JSON.parse(web.calls[2].init.body), channel);
});

/* ---------------------------------------------------------------------------------------------------- the chooser -- */

test("the chooser lists folders only, one place at a time: the account's Drive, its shared drives, what was shared, a folder", async () => {
  const folders = { files: [{ id: "f-1", name: "Clips" }, { id: "f-2" }], nextPageToken: "more" };
  const web = answers(ok(folders), ok({ drives: [{ id: "drive-9", name: "Salon" }] }), ok({ files: [] }), ok(folders));
  const source = drive(web);
  assert.deepEqual(await source.listFolders(TOKEN, { place: "mine" }, null), {
    verdict: "ok",
    answer: {
      folders: [
        { id: "f-1", name: "Clips" },
        { id: "f-2", name: "f-2" },
      ],
      nextPage: "more",
    },
  });
  assert.deepEqual((await source.listFolders(TOKEN, { place: "drives" }, null)).answer, {
    folders: [{ id: "drive-9", name: "Salon" }],
    nextPage: null,
  });
  await source.listFolders(TOKEN, { place: "shared" }, null);
  await source.listFolders(TOKEN, { place: "folder", id: "it's" }, "more");

  const [mine, drives, shared, opened] = web.calls.map((call) => call.url);
  const onlyFolders = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  assert.equal(mine.searchParams.get("q"), `'root' in parents and ${onlyFolders}`);
  assert.equal(
    mine.searchParams.get("fields"),
    "nextPageToken,files(id,name)",
    "no file is listed before a folder is chosen",
  );
  assert.equal(drives.pathname, "/drive/v3/drives");
  assert.equal(shared.searchParams.get("q"), `sharedWithMe = true and ${onlyFolders}`);
  assert.equal(
    opened.searchParams.get("q"),
    `'it\\'s' in parents and ${onlyFolders}`,
    "an id is quoted, its own quote escaped",
  );
  assert.equal(opened.searchParams.get("pageToken"), "more");
});
