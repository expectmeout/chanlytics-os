/**
 * A mailbox's provider saying it changed (decision 0056), heard: Gmail's Pub/Sub push, whose bearer token must be signed
 * by Google (RS256, a published key) for this deployment's audience and live; Graph's notification, whose clientState
 * must be the one the subscriptions were made with, and whose validation token is echoed once. The readers are
 * packages/channels' (mailbox-push.ts); the doors are the edge's (api/mailbox/gmail.ts, graph.ts), run over a database
 * in memory with Google's keys and the mailboxes' providers answered by the test. What a push says is only "read this
 * mailbox now": a push that cannot be checked reads nothing.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { gmailPushOf, graphNotificationsOf, clientStateMatches, verifyGooglePushToken } from "@chanlytics/channels";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { MAILBOX_ENV, b64url, liveCredentials, providers, vault, withEnv } from "./_mailbox-world.mjs";

const AUD = "https://edge.example.com/api/mailbox/gmail";
const restore = withEnv({
  ...MAILBOX_ENV,
  GMAIL_PUSH_TOPIC: "projects/example/topics/mail",
  GMAIL_PUSH_AUDIENCE: AUD,
  GRAPH_NOTIFY_SECRET: "client-state-made-up",
  EDGE_ORIGIN: "https://edge.example.com",
});
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const gmailDoor = await importSrc("apps/edge/api/mailbox/gmail.ts");
const graphDoor = await importSrc("apps/edge/api/mailbox/graph.ts");
after(() => {
  setPg(null);
  restore();
});

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "kid-made-up-1";
const JWKS = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" }] };
/** A token as Pub/Sub signs one, with these claims over the defaults. */
function token(claims = {}, { kid = KID, key = privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: AUD,
      email: "gmail-push@example-project.iam.gserviceaccount.com",
      email_verified: true,
      iat: now,
      exp: now + 3600,
      ...claims,
    }),
  );
  const sign = createSign("RSA-SHA256");
  sign.update(`${head}.${body}`);
  return `${head}.${body}.${sign.sign(key).toString("base64url")}`;
}
/** Google's published keys, answered through providerFetch's own seam. */
const certs = {
  fetch: async () => new Response(JSON.stringify(JWKS), { status: 200, headers: { "cache-control": "max-age=3600" } }),
  sleep: async () => {},
  random: () => 0,
};

test("a push's token stands only signed by a key Google publishes, issued by Google, for this audience, and live", async () => {
  const ok = await verifyGooglePushToken(`Bearer ${token()}`, AUD, { deps: certs });
  assert.deepEqual(ok, { ok: true, email: "gmail-push@example-project.iam.gserviceaccount.com" });
  const why = async (auth) => (await verifyGooglePushToken(auth, AUD, { deps: certs })).why;
  assert.equal(await why(null), "no_token");
  assert.equal(await why("Bearer not.a"), "malformed");
  assert.equal(await why(`Bearer ${token({ aud: "https://elsewhere.example.com" })}`), "wrong_audience");
  assert.equal(await why(`Bearer ${token({ iss: "https://evil.example.com" })}`), "wrong_issuer");
  assert.equal(await why(`Bearer ${token({ exp: Math.floor(Date.now() / 1000) - 3600 })}`), "expired");
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  assert.equal(await why(`Bearer ${token({}, { key: other })}`), "bad_signature", "a key that is not the one it names");
  assert.equal(await why(`Bearer ${token({}, { kid: "kid-nobody-published" })}`), "unknown_key");
});

test("what a push says, read: Gmail's address and history id, Graph's subscriptions with their clientState; a clientState compared whole", () => {
  const data = b64url(JSON.stringify({ emailAddress: "Sam@GetHarbor.example", historyId: 123456 }));
  assert.deepEqual(gmailPushOf({ message: { data, messageId: "1" }, subscription: "s" }), {
    address: "sam@getharbor.example",
    historyId: "123456",
  });
  assert.equal(gmailPushOf({ message: { data: b64url("not json") } }), null);
  assert.equal(gmailPushOf(null), null);
  assert.deepEqual(
    graphNotificationsOf({
      value: [
        { subscriptionId: "sub-1", clientState: "a", changeType: "created" },
        { subscriptionId: "", clientState: "b" },
        { clientState: "c" },
      ],
    }),
    [{ subscriptionId: "sub-1", clientState: "a" }],
  );
  assert.equal(clientStateMatches("client-state-made-up", "client-state-made-up"), true);
  assert.equal(clientStateMatches("client-state-made-upX", "client-state-made-up"), false);
  assert.equal(clientStateMatches(null, "client-state-made-up"), false);
});

/** A Graph mailbox with its subscription, and the mailboxes clock's row and its door (00363 request_sweep), heard. */
function graphWorld() {
  const box = rows.mailboxConnection({
    provider: "microsoft",
    address: "dana@getharbor.example",
    watch_id: "sub-1",
    sync_cursor: "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=d1",
  });
  const v = vault({ [box.id]: liveCredentials("eyJ.dana") });
  const asked = [];
  const tables = { mailbox_connections: [box], messages: [], jobs: [], sweep_status: [] };
  const request_sweep = (a) => {
    asked.push(a);
    const row = tables.sweep_status.find((r) => r.sweep === a.p_sweep);
    if (row) row.requested_at = new Date().toISOString();
    else tables.sweep_status.push({ sweep: a.p_sweep, requested_at: new Date().toISOString() });
    return 1;
  };
  setPg(fakeDb(tables, {}, { ...v.rpcs, mailbox_threads_known: () => [], request_sweep }));
  return { box, tables, asked };
}
const post = (door, url, body, headers = {}) =>
  door.POST(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

test("Graph's door: the validation token echoed as text; a notification whose clientState is not ours reads nothing; one that is asks the clock, once a minute, and is answered at once", async () => {
  graphWorld();
  const echo = await post(graphDoor, "https://edge.example.com/api/mailbox/graph?validationToken=abc%20123", "");
  assert.deepEqual([echo.status, echo.headers.get("content-type"), await echo.text()], [200, "text/plain", "abc 123"]);

  const net = providers((c) =>
    c.url.includes("/delta")
      ? {
          json: {
            value: [],
            "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=d2",
          },
        }
      : { status: 404 },
  );
  try {
    const forged = await post(graphDoor, "https://edge.example.com/api/mailbox/graph", {
      value: [{ subscriptionId: "sub-1", clientState: "a-guess" }],
    });
    assert.equal(forged.status, 401);
    assert.deepEqual(net.calls, [], "nothing read for a notification that is not ours");

    const { tables, asked } = graphWorld();
    const ours = {
      value: [
        { subscriptionId: "sub-1", clientState: "client-state-made-up" },
        { subscriptionId: "sub-1", clientState: "client-state-made-up" },
      ],
    };
    const real = await post(graphDoor, "https://edge.example.com/api/mailbox/graph", ours);
    assert.equal(real.status, 202);
    assert.deepEqual(
      asked.map((a) => [a.p_sweep, a.p_path]),
      [["mailboxes", "/api/cron/mailboxes"]],
      "the mailboxes clock asked to read now, once however often named",
    );
    assert.equal(net.calls.length, 0, "the door reads nothing itself: Graph wants its answer inside three seconds");
    assert.match(tables.mailbox_connections[0].sync_cursor, /deltatoken=d1$/, "the clock moves the cursor, not the door");
    assert.equal((await post(graphDoor, "https://edge.example.com/api/mailbox/graph", ours)).status, 202);
    assert.equal(asked.length, 1, "a burst of pushes asks once a minute");
  } finally {
    net.restore();
  }
});

test("Gmail's door: a push without Google's token is refused and reads nothing; with it, the address's live mailbox is read; one for nobody is acknowledged", async () => {
  const box = rows.mailboxConnection({ address: "sam@getharbor.example", sync_cursor: "100" });
  const v = vault({ [box.id]: liveCredentials("ya29.sam") });
  const tables = { mailbox_connections: [box], messages: [], jobs: [] };
  setPg(fakeDb(tables, {}, { ...v.rpcs, mailbox_threads_known: () => [] }));
  const net = providers((c) => {
    if (c.url === "https://www.googleapis.com/oauth2/v3/certs") return { json: JWKS };
    if (c.url.includes("/history?")) return { json: { history: [], historyId: "105" } };
    if (c.url.includes("/messages?q=from")) return { json: { messages: [] } };
    return { status: 404 };
  });
  const push = (address) => ({
    message: { data: b64url(JSON.stringify({ emailAddress: address, historyId: 105 })), messageId: "p1" },
    subscription: "projects/example/subscriptions/mail",
  });
  try {
    const bare = await post(gmailDoor, AUD, push("sam@getharbor.example"));
    assert.equal(bare.status, 401);
    assert.equal(net.calls.filter((c) => c.url.includes("gmail")).length, 0);
    const signed = await post(gmailDoor, AUD, push("sam@getharbor.example"), { authorization: `Bearer ${token()}` });
    assert.equal(signed.status, 204);
    assert.equal(net.calls.filter((c) => c.url.includes("/history?")).length, 1);
    assert.equal(tables.mailbox_connections[0].sync_cursor, "105");
    const nobody = await post(gmailDoor, AUD, push("someone@else.example"), { authorization: `Bearer ${token()}` });
    assert.equal(nobody.status, 204, "acknowledged: a push redelivered for nobody helps nobody");
  } finally {
    net.restore();
  }
});
