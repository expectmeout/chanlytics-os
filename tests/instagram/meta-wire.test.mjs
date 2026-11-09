/**
 * The Meta link's wire and what reads it (decision 0117): the dialog and the requests built without a network, the
 * proof every call with the business's token carries, Meta's answers read defensively, the webhook fields a token's
 * permissions allow, the five lines made from the permissions by their one reader, the switch, and a DM sent and a name
 * read on Facebook's host for an account connected through Meta, on Instagram's for one connected through Instagram's own
 * login. And the webhook: a `changes[]` delivery (a comment, a story's numbers) is its own kind, asked nothing of yet,
 * beside the DMs it may carry.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  instagramEventsOf,
  metaAppSecretProof,
  metaAssignedAccountsRequest,
  metaDialogUrl,
  metaWebhookFieldsOf,
  parseMetaAssignedAccounts,
  parseMetaDebugToken,
  parseMetaToken,
  readInstagramName,
  sendInstagramText,
} from "@chanlytics/channels/instagram";
import { resetBreakers } from "@chanlytics/channels/shared";
import { contentPreviewOf, metaLinesOf } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { getInstagramCredentials } = await import(at("apps/edge/lib/instagram/credentials.ts"));
const SECRET = "meta-secret-for-the-wire";
const realSecret = process.env.META_APP_SECRET;
after(() => {
  if (realSecret === undefined) delete process.env.META_APP_SECRET;
  else process.env.META_APP_SECRET = realSecret;
});

test("the dialog carries the app, its configuration, the return address, a code and the state, and nothing else", () => {
  const url = new URL(
    metaDialogUrl({ clientId: "990001", configId: "880001", redirectUri: "https://app.example.com/cb" }, "st.sig"),
  );
  assert.equal(url.origin + url.pathname, "https://www.facebook.com/v27.0/dialog/oauth");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    client_id: "990001",
    config_id: "880001",
    redirect_uri: "https://app.example.com/cb",
    response_type: "code",
    state: "st.sig",
  });
});

test("a call with the business's token carries appsecret_proof: the token's HMAC-SHA256 keyed by the app's secret", () => {
  const proof = createHmac("sha256", SECRET).update("bisu-token").digest("hex");
  assert.equal(metaAppSecretProof("bisu-token", SECRET), proof);
  const q = new URL(metaAssignedAccountsRequest("bisu-token", SECRET).url).searchParams;
  assert.equal(q.get("access_token"), "bisu-token");
  assert.equal(q.get("appsecret_proof"), proof);
  assert.equal(q.get("fields"), "id,username");
});

test("Meta's answers are read defensively: a token that never expires, granted permissions, the accounts shared", () => {
  assert.deepEqual(parseMetaToken({ access_token: "t", token_type: "bearer" }), { accessToken: "t", expiresInS: null });
  assert.throws(() => parseMetaToken({ error: { message: "Invalid code", code: 100 } }), /Invalid code/);
  const facts = parseMetaDebugToken({
    data: {
      is_valid: true,
      expires_at: 0,
      scopes: ["instagram_basic", "instagram_manage_messages", 7],
      granular_scopes: [{ scope: "instagram_basic", target_ids: ["17841400000000001"] }, { scope: "x" }],
    },
  });
  assert.deepEqual(facts, {
    valid: true,
    scopes: ["instagram_basic", "instagram_manage_messages", "7"],
    accountsByScope: { instagram_basic: ["17841400000000001"] },
    expiresAt: null,
  });
  assert.equal(
    parseMetaDebugToken({ data: { is_valid: false, expires_at: 1767225600 } }).expiresAt,
    "2026-01-01T00:00:00.000Z",
  );
  assert.equal(parseMetaDebugToken({ data: { is_valid: "yes" } }).valid, false, "only true is valid");
  assert.throws(() => parseMetaDebugToken({ error: { message: "Bad app token" } }), /Bad app token/);
  assert.deepEqual(
    parseMetaAssignedAccounts({ data: [{ id: "17841400000000001", username: "harbor" }, { id: "x" }, null] }),
    [{ id: "17841400000000001", username: "harbor" }],
  );
  assert.throws(() => parseMetaAssignedAccounts({}), /did not list/);
});

test("the webhook fields are those the token's permissions allow, never one it lacks", () => {
  assert.deepEqual(metaWebhookFieldsOf(["instagram_basic"]), []);
  assert.deepEqual(metaWebhookFieldsOf(["instagram_manage_insights", "instagram_manage_comments"]), [
    "comments",
    "live_comments",
    "mentions",
    "story_insights",
  ]);
});

test("the five lines are made from the permissions by their one reader; comments need messages too", () => {
  const all = [
    "instagram_basic",
    "instagram_manage_messages",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_insights",
  ];
  assert.deepEqual(metaLinesOf(all), { messages: true, publish: true, sounds: true, comments: true, insights: true });
  assert.deepEqual(metaLinesOf(["instagram_basic", "instagram_manage_comments"]), {
    messages: false,
    publish: false,
    sounds: false,
    comments: false,
    insights: false,
  });
  assert.deepEqual(metaLinesOf("instagram_manage_messages"), metaLinesOf([]), "anything but a list holds nothing");
  assert.equal(contentPreviewOf({ features: { content_preview: true } }), true);
  for (const off of [null, {}, { features: null }, { features: { content_preview: "true" } }])
    assert.equal(contentPreviewOf(off), false, JSON.stringify(off));
});

/** A network that answers every call as `body` says and keeps what it was asked. */
function network(body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch };
}

test("a DM from an account connected through Meta leaves on Facebook's host with its proof; one through Instagram's own login on Instagram's", async () => {
  resetBreakers();
  const meta = network({ recipient_id: "9001", message_id: "m-1" });
  const cfg = { accountId: "17841400000000001", accessToken: "bisu", graph: "facebook", proof: "pf" };
  const sent = await sendInstagramText(cfg, "9001", "Your table is at 7.", { fetch: meta.fetch });
  assert.equal(sent.ok, true);
  assert.equal(meta.calls[0].url, "https://graph.facebook.com/v27.0/17841400000000001/messages?appsecret_proof=pf");
  assert.equal(meta.calls[0].init.headers.Authorization, "Bearer bisu");
  assert.deepEqual(JSON.parse(meta.calls[0].init.body), {
    recipient: { id: "9001" },
    message: { text: "Your table is at 7." },
  });
  const own = network({ recipient_id: "9001", message_id: "m-2" });
  await sendInstagramText({ accountId: "17841400000000001", accessToken: "ig" }, "9001", "Hi", { fetch: own.fetch });
  assert.equal(own.calls[0].url, "https://graph.instagram.com/v26.0/17841400000000001/messages");
  const names = network({ name: "Mari Lopez", username: "mari.lopez" });
  assert.equal(await readInstagramName(cfg, "9001", { fetch: names.fetch }), "Mari Lopez");
  const read = new URL(names.calls[0].url);
  assert.equal(read.origin, "https://graph.facebook.com");
  assert.equal(read.searchParams.get("appsecret_proof"), "pf");
});

test("the Vault's secret for an account connected through Meta reads as Facebook's host with the token's proof", async () => {
  process.env.META_APP_SECRET = SECRET;
  const vault = {
    "row-meta": { access_token: "bisu", account_id: "17841400000000001", login: "meta", scopes: [] },
    "row-ig": { access_token: "ig", account_id: "17841400000000002", refreshed_at: "2026-11-01T00:00:00Z" },
  };
  const db = fakeDb({}, {}, { get_channel_credentials: ({ p_channel_id }) => vault[p_channel_id] ?? null });
  const meta = await getInstagramCredentials(db, { id: "row-meta", credentials_ref: "ref" });
  assert.deepEqual(meta, {
    outcome: "present",
    credentials: {
      accessToken: "bisu",
      accountId: "17841400000000001",
      graph: "facebook",
      proof: metaAppSecretProof("bisu", SECRET),
    },
  });
  const ig = await getInstagramCredentials(db, { id: "row-ig", credentials_ref: "ref" });
  assert.deepEqual(ig, { outcome: "present", credentials: { accessToken: "ig", accountId: "17841400000000002" } });
});

test("a delivery's changes (a comment, a story's numbers) are their own kind, asked nothing of, beside its DMs", () => {
  const events = instagramEventsOf({
    object: "instagram",
    entry: [
      {
        id: "17841400000000001",
        time: 1762600000,
        changes: [{ field: "comments", value: { id: "178", text: "How much?" } }, "odd"],
      },
      {
        id: "17841400000000001",
        messaging: [
          { sender: { id: "9001" }, recipient: { id: "17841400000000001" }, message: { mid: "m-9", text: "Hi" } },
        ],
      },
    ],
  });
  assert.deepEqual(
    events.map((e) => [e.kind, e.kind === "ignored" ? e.what : e.mid]),
    [
      ["ignored", "change"],
      ["message", "m-9"],
    ],
  );
});
