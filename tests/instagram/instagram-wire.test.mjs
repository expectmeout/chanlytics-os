/**
 * Instagram's Graph wire (packages/channels/src/instagram/instagram-graph.ts), against Meta's documented shapes for the
 * Instagram API with Instagram Login: the way in (the authorize URL, the code, the 60-day token, its refresh), the
 * account `/me` names, a person's name, and a DM sent, in parts when it is longer than one DM may be.
 *
 * The network is a fake handed to the calls: what each request carries is read off it, and each answer is Meta's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as channels from "@chanlytics/channels";

const {
  instagramAuthorizeUrl,
  instagramCodeOf,
  instagramCodeRequest,
  instagramLongLivedRequest,
  instagramRefreshRequest,
  instagramMeRequest,
  instagramSubscribeRequest,
  parseInstagramCodeGrant,
  parseInstagramToken,
  parseInstagramMe,
  instagramNameOf,
  readInstagramName,
  instagramDmChunks,
  sendInstagramText,
  instagramRefusalOf,
  instagramThrottled,
  resetBreakers,
  INSTAGRAM_DM_MAX_BYTES,
} = channels;

const APP = {
  clientId: "990000000000001",
  clientSecret: "app-secret",
  redirectUri: "https://app.example.com/api/v1/channels/instagram/callback",
};
const CFG = { accountId: "17841400000000001", accessToken: "IGAA-token" };
const bytes = (s) => new TextEncoder().encode(s).length;

/** A network that answers each call in turn, and keeps what it was asked. */
function network(...answers) {
  const asked = [];
  const fetch = async (url, init) => {
    asked.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: init?.body ?? null,
    });
    const a = answers.shift() ?? { status: 200, json: {} };
    return new Response(JSON.stringify(a.json), { status: a.status, headers: { "content-type": "application/json" } });
  };
  return { asked, fetch };
}

test("the way in: Instagram's consent screen for the two scopes, with the signed state, coming back to our address", () => {
  const url = new URL(instagramAuthorizeUrl(APP, "signed.state"));
  assert.equal(url.origin + url.pathname, "https://www.instagram.com/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), APP.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), APP.redirectUri);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "instagram_business_basic,instagram_business_manage_messages");
  assert.equal(url.searchParams.get("state"), "signed.state");
});

test("the code is traded for a short token by form, then for a 60-day one; a refresh takes the token itself", () => {
  assert.equal(instagramCodeOf("AQB-code#_"), "AQB-code");
  assert.equal(instagramCodeOf(" AQB-code "), "AQB-code");
  const code = instagramCodeRequest(APP, "AQB-code#_");
  assert.equal(code.url, "https://api.instagram.com/oauth/access_token");
  assert.equal(code.method, "POST");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(code.body)), {
    client_id: APP.clientId,
    client_secret: APP.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: APP.redirectUri,
    code: "AQB-code",
  });
  const long = new URL(instagramLongLivedRequest(APP.clientSecret, "short").url);
  assert.equal(long.origin + long.pathname, "https://graph.instagram.com/access_token");
  assert.deepEqual(Object.fromEntries(long.searchParams), {
    grant_type: "ig_exchange_token",
    client_secret: "app-secret",
    access_token: "short",
  });
  const refresh = new URL(instagramRefreshRequest("long").url);
  assert.equal(refresh.origin + refresh.pathname, "https://graph.instagram.com/refresh_access_token");
  assert.deepEqual(Object.fromEntries(refresh.searchParams), { grant_type: "ig_refresh_token", access_token: "long" });
});

test("the account and its webhooks: /me names its Instagram account id, and the subscription is to its messages", () => {
  const me = new URL(instagramMeRequest("long").url);
  assert.equal(me.origin + me.pathname, "https://graph.instagram.com/v26.0/me");
  assert.equal(me.searchParams.get("fields"), "user_id,username,name,account_type");
  const sub = instagramSubscribeRequest("long", CFG.accountId);
  const u = new URL(sub.url);
  assert.equal(sub.method, "POST");
  assert.equal(u.pathname, `/v26.0/${CFG.accountId}/subscribed_apps`);
  assert.equal(u.searchParams.get("subscribed_fields"), "messages");
});

test("each answer is read as Meta gives it, and a refusal throws Meta's own words", () => {
  assert.deepEqual(
    parseInstagramCodeGrant({
      data: [
        {
          access_token: "s1",
          user_id: "123",
          permissions: "instagram_business_basic,instagram_business_manage_messages",
        },
      ],
    }),
    {
      accessToken: "s1",
      userId: "123",
      permissions: ["instagram_business_basic", "instagram_business_manage_messages"],
    },
  );
  assert.deepEqual(
    parseInstagramCodeGrant({ access_token: "s2", user_id: 456, permissions: ["instagram_business_basic"] }),
    {
      accessToken: "s2",
      userId: "456",
      permissions: ["instagram_business_basic"],
    },
  );
  assert.throws(
    () =>
      parseInstagramCodeGrant({ error_type: "OAuthException", code: 400, error_message: "Invalid authorization code" }),
    /Invalid authorization code/,
  );
  assert.deepEqual(parseInstagramToken({ access_token: "long", token_type: "bearer", expires_in: 5183944 }), {
    accessToken: "long",
    expiresInS: 5183944,
  });
  assert.throws(
    () => parseInstagramToken({ error: { message: "Session has expired", code: 190 } }),
    /Session has expired/,
  );
  assert.deepEqual(
    parseInstagramMe({
      user_id: "17841400000000001",
      username: "northside.studio",
      name: "Northside Studio",
      id: "app-scoped",
    }),
    {
      accountId: "17841400000000001",
      username: "northside.studio",
      name: "Northside Studio",
    },
  );
  assert.throws(() => parseInstagramMe({ id: "app-scoped" }), /did not name the account/);
  assert.equal(instagramNameOf({ name: "Dana Ruiz", username: "dana" }), "Dana Ruiz");
  assert.equal(instagramNameOf({ username: "dana" }), "@dana");
  assert.equal(instagramNameOf({}), null);
});

test("a person's name is read once they wrote, and a profile that cannot be read costs the message nothing", async () => {
  resetBreakers();
  const ok = network({ status: 200, json: { name: "Dana Ruiz", username: "dana", id: "6000" } });
  assert.equal(await readInstagramName("long", "6000", { fetch: ok.fetch }), "Dana Ruiz");
  assert.match(ok.asked[0].url, /\/v26\.0\/6000\?fields=name%2Cusername&access_token=long$/);
  const refused = network({
    status: 400,
    json: { error: { message: "User consent is required to access user profile", code: 230 } },
  });
  assert.equal(await readInstagramName("long", "6000", { fetch: refused.fetch }), null);
});

test("a reply that fits is one DM; a longer one is cut at a paragraph, a sentence or a word, never inside a character", () => {
  assert.deepEqual(instagramDmChunks("  Hello there.  "), ["Hello there."]);
  assert.deepEqual(instagramDmChunks("   "), []);
  const sentences = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
  const parts = instagramDmChunks(sentences);
  assert.ok(parts.length > 1);
  for (const p of parts) {
    assert.ok(bytes(p) <= INSTAGRAM_DM_MAX_BYTES, `${bytes(p)} bytes`);
    assert.match(p, /\.$/, "each part ends at a sentence");
  }
  assert.equal(parts.join(" "), sentences);
  // Accents and emoji are two to four bytes each, and a family emoji is several code points: never split.
  const wide = "Á".repeat(600) + " " + "👨‍👩‍👧".repeat(100);
  const wideParts = instagramDmChunks(wide);
  for (const p of wideParts) assert.ok(bytes(p) <= INSTAGRAM_DM_MAX_BYTES);
  assert.equal(wideParts.join(" ").replace(/ /g, ""), wide.replace(/ /g, ""));
  for (const p of wideParts) assert.ok(!/^‍|‍$/.test(p), "no part starts or ends inside a joined emoji");
  // A paragraph break is the first choice.
  const paras = "a".repeat(700) + "\n\n" + "b ".repeat(300);
  assert.equal(instagramDmChunks(paras)[0], "a".repeat(700));
});

test("a DM goes to the person's id from the account, with the token in its header, and its id is Meta's", async () => {
  resetBreakers();
  const net = network({ status: 200, json: { recipient_id: "6000", message_id: "aWdfZAG1-out" } });
  const sent = await sendInstagramText(CFG, "6000", "See you Saturday!", { fetch: net.fetch });
  assert.deepEqual(sent, { ok: true, wamid: "aWdfZAG1-out", status: 200, outcome: "ok" });
  assert.equal(net.asked.length, 1);
  assert.equal(net.asked[0].url, `https://graph.instagram.com/v26.0/${CFG.accountId}/messages`);
  assert.equal(net.asked[0].method, "POST");
  assert.equal(net.asked[0].headers.Authorization, "Bearer IGAA-token");
  assert.deepEqual(JSON.parse(net.asked[0].body), {
    recipient: { id: "6000" },
    message: { text: "See you Saturday!" },
  });
});

test("a long reply leaves as several DMs in order, under the first one's id; one failing after another left is said", async () => {
  resetBreakers();
  const long = Array.from({ length: 60 }, (_, i) => `Line ${i} of the answer.`).join(" ");
  const n = instagramDmChunks(long).length;
  const all = network(...Array.from({ length: n }, (_, i) => ({ status: 200, json: { message_id: `m${i}` } })));
  const sent = await sendInstagramText(CFG, "6000", long, { fetch: all.fetch });
  assert.equal(sent.ok, true);
  assert.equal(sent.wamid, "m0");
  assert.equal(all.asked.length, n);
  assert.equal(all.asked.map((a) => JSON.parse(a.body).message.text).join(" "), long);

  const half = network(
    { status: 200, json: { message_id: "m0" } },
    { status: 400, json: { error: { message: "Invalid parameter", code: 100 } } },
  );
  const partly = await sendInstagramText(CFG, "6000", long, { fetch: half.fetch });
  assert.equal(partly.ok, false);
  assert.equal(partly.wamid, "m0");
  assert.equal(partly.outcome, "unknown", "the person has the start of it: never sent again blind");
  assert.match(partly.errorBody, /^partial: 1 of \d+ parts sent;/);
});

test("Instagram's refusals are named at the wire: the window, a person who cannot be reached, the token, and its 'not now'", async () => {
  resetBreakers();
  const closed = network({
    status: 400,
    json: { error: { message: "This message is sent outside of allowed window.", code: 10, error_subcode: 2018278 } },
  });
  const late = await sendInstagramText(CFG, "6000", "hi", { fetch: closed.fetch });
  assert.equal(late.ok, false);
  assert.equal(late.code, 10);
  assert.equal(late.subcode, 2018278);
  assert.equal(late.outcome, "refused");
  assert.equal(instagramRefusalOf(late), "window_closed");
  assert.equal(instagramRefusalOf({ ok: false, code: 551, subcode: 1545041 }), "not_reachable");
  assert.equal(instagramRefusalOf({ ok: false, code: 100, subcode: 2018001 }), "not_reachable");
  assert.equal(instagramRefusalOf({ ok: false, code: 190, subcode: 463 }), "token");
  assert.equal(instagramRefusalOf({ ok: false, code: 100, subcode: null }), null);
  assert.equal(instagramRefusalOf({ ok: true, code: null, subcode: null }), null);

  const busy = network({ status: 400, json: { error: { message: "Application request limit reached", code: 4 } } });
  const held = await sendInstagramText(CFG, "6000", "hi", { fetch: busy.fetch });
  assert.equal(held.outcome, "retryable", "nothing was taken: it may be tried again");
  assert.equal(instagramThrottled({ ok: false, status: 429, code: null }), true);
  assert.equal(instagramThrottled({ ok: false, status: 400, code: 80002 }), true);
  assert.equal(instagramThrottled({ ok: true, status: 200, code: 4 }), false);

  assert.deepEqual(await sendInstagramText(CFG, "6000", "   "), {
    ok: false,
    wamid: null,
    status: 0,
    errorBody: "empty_message",
  });
});
