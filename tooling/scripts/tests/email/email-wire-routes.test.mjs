/**
 * One workspace's email wire, as the edge binds it (apps/edge/lib/email/email.ts emailWireFor; decision 0056): the
 * hosted mailbox on the platform's key, and each mailbox the business connected through its own provider and token
 * while it sends now. Run over a database in memory, with the providers answered by the test, so what is proved is
 * which way each address leaves, and what a send learns about its mailbox.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";
import { MAILBOX_ENV, liveCredentials, providers, vault, withEnv } from "./mailboxes/_mailbox-world.mjs";
import { buildEmailRequest, connectedIdentity, hostedIdentity } from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { emailWireFor } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/email/email.ts")).href);
const { deliver, isWireUnavailable, isWireUnavailableError } = await import(
  pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href
);
const restoreEnv = withEnv({ ...MAILBOX_ENV, EMAIL_DOMAIN: "mail.chanlytics.com", RESEND_API_KEY: "platform-key" });
after(restoreEnv);

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MAILBOX = {
  id: "mb1",
  tenant_id: T,
  local_part: "harbor",
  reply_token: "a".repeat(24),
  reply_token_prev: null,
  from_name: "Harbor",
};
const SENDING = rows.mailboxConnection({ address: "sam@getharbor.example", host: "getharbor.example" });
const PAUSED = rows.mailboxConnection({
  address: "dana@getharbor.example",
  host: "getharbor.example",
  provider_account: "100000000000000000002",
  state: "paused",
});
const request = (identity, id = "00000000-0000-4000-8000-0000000000a1") =>
  buildEmailRequest({
    identity,
    to: "owner@example.com",
    parent: null,
    subject: "Your moving quotes",
    body: "Saw your shop on the map.",
    signature: null,
    actor: "human",
    plain: true,
    autoSubmitted: false,
    campaign: {
      unsubscribeUrl: "https://app.chanlytics.com/u/t",
      footer: 'Not interested? Reply "no thanks" and I won\'t write again.',
    },
    messageId: id,
    tenantId: T,
  });
const own = (m) => request(connectedIdentity(m));
const hosted = () => request(hostedIdentity(MAILBOX, "mail.chanlytics.com"));

/** Resend and Gmail, as a send meets them: the platform's key on one, the mailbox's token on the other. */
function answered() {
  return providers((c) => {
    if (c.url.startsWith("https://api.resend.com")) return { json: { id: "re_1" } };
    if (c.url.endsWith("/messages/send")) return { json: { id: "g-sent-1", threadId: "g-thread-1" } };
    if (c.url.includes("/messages/g-sent-1"))
      return { json: { payload: { headers: [{ name: "Message-ID", value: "<CAGmail-1@mail.gmail.com>" }] } } };
    return { status: 404, json: {} };
  });
}
const auths = (calls) => calls.map((c) => c.headers.Authorization ?? c.headers.authorization);

test("the hosted mailbox leaves on the platform's key, a connected mailbox through Gmail on its own token, and a paused one by no route", async () => {
  const v = vault({ [SENDING.id]: liveCredentials("ya29.sam"), [PAUSED.id]: liveCredentials("ya29.dana") });
  const db = fakeDb({ mailboxes: [MAILBOX], mailbox_connections: [SENDING, PAUSED] }, {}, v.rpcs);
  const wire = await emailWireFor(db, T);
  const net = answered();
  try {
    assert.equal((await wire("owner@example.com", { body: "x", email: hosted() })).ok, true);
    const sent = await wire("owner@example.com", { body: "x", email: own(SENDING), purpose: "outreach" });
    assert.equal(sent.ok, true);
    assert.deepEqual(sent.email, {
      messageId: "<CAGmail-1@mail.gmail.com>",
      threadId: "g-thread-1",
      mailboxId: SENDING.id,
    });
    const paused = await wire("owner@example.com", { body: "x", email: own(PAUSED), purpose: "outreach" });
    assert.equal(paused.errorBody, "request_leaves_as_another_sender");
    assert.deepEqual(auths(net.calls), ["Bearer platform-key", "Bearer ya29.sam", "Bearer ya29.sam"]);
    // The email left as MIME, plain, under a Message-ID minted on the mailbox's own host, with its one-click way out.
    const raw = Buffer.from(JSON.parse(net.calls[1].body).raw, "base64url").toString("utf8");
    assert.match(raw, /^From: "Sam" <sam@getharbor\.example>\r$/m);
    assert.match(raw, /^Message-ID: <cl\.[0-9a-f]{32}@getharbor\.example>\r$/m);
    assert.match(raw, /^List-Unsubscribe-Post: List-Unsubscribe=One-Click\r$/m);
    assert.match(raw, /^Content-Type: text\/plain; charset=utf-8\r$/im);
    assert.doesNotMatch(raw, /Auto-Submitted|text\/html/i);
  } finally {
    net.restore();
  }
});

test("a workspace with no hosted mailbox still has a wire for the mailboxes it connected; one with neither has none", async () => {
  const v = vault({ [SENDING.id]: liveCredentials("ya29.sam") });
  const net = answered();
  try {
    const wire = await emailWireFor(fakeDb({ mailboxes: [], mailbox_connections: [SENDING] }, {}, v.rpcs), T);
    assert.equal((await wire("owner@example.com", { body: "x", email: own(SENDING), purpose: "outreach" })).ok, true);
    assert.equal(await emailWireFor(fakeDb({ mailboxes: [], mailbox_connections: [] }, {}, v.rpcs), T), null);
  } finally {
    net.restore();
  }
});

test("REGRESSION: a mailboxes read that fails is the wire not bound, so a reach-out's email waits instead of failing at a wire built without its route", async () => {
  const v = vault({ [SENDING.id]: liveCredentials("ya29.sam") });
  const tables = { mailboxes: [MAILBOX], mailbox_connections: [SENDING] };
  const net = answered();
  try {
    const wire = await emailWireFor(
      fakeDb(tables, { "mailbox_connections.select": { message: "the database went away" } }, v.rpcs),
      T,
    );
    assert.equal(isWireUnavailable(wire), true, "unavailable, not a wire without the workspace's routes");
    assert.match(wire.error, /the database went away/);

    // Through the send door: the queued row stays queued and nothing is recorded as failed or sent, so the caller asks again.
    const conversation = {
      id: "c1",
      tenant_id: T,
      paused_until: null,
      contacts: {
        consent: "opted_in",
        dnc: false,
        marketing_consent: "opted_out",
        erased_at: null,
        email: "owner@example.com",
        email_suppressed_at: null,
      },
      tenants: { status: "active" },
    };
    const queued = {
      // The row its request was frozen for: the request's own id (request() above).
      id: "00000000-0000-4000-8000-0000000000a1",
      tenant_id: T,
      conversation_id: "c1",
      contact_id: "k1",
      channel: "email",
      direction: "outbound",
      sender: "human",
      status: "queued",
      body: "Saw your shop on the map.",
      created_at: "2026-09-10T09:59:00.000Z",
    };
    const world = { conversations: [conversation], messages: [queued], events: [] };
    await assert.rejects(
      deliver(
        { db: fakeDb(world), wire: { email: wire }, now: () => Date.parse("2026-09-10T10:00:00.000Z") },
        {
          tenantId: T,
          conversationId: "c1",
          contactId: "k1",
          to: "owner@example.com",
          channel: "email",
          sender: "human",
          purpose: "conversational",
          proactive: false,
          body: "Saw your shop on the map.",
          email: hosted(),
          messageId: "00000000-0000-4000-8000-0000000000a1",
        },
      ),
      isWireUnavailableError,
    );
    assert.equal(world.messages[0].status, "queued", "left for the next try");
    assert.deepEqual(world.events, [], "nothing said to have failed");
    assert.deepEqual(net.calls, [], "nothing reached a provider");

    // The same workspace once the read works: the wire has the mailbox's route, and the email leaves through Gmail.
    const bound = await emailWireFor(fakeDb(tables, {}, v.rpcs), T);
    assert.equal(isWireUnavailable(bound), false);
    assert.equal((await bound("owner@example.com", { body: "x", email: own(SENDING), purpose: "outreach" })).ok, true);
  } finally {
    net.restore();
  }
});

test("a provider's day used up rests the mailbox until the next UTC midnight, and the send comes back as not taken", async () => {
  const v = vault({ [SENDING.id]: liveCredentials("ya29.sam") });
  const tables = { mailboxes: [MAILBOX], mailbox_connections: [{ ...SENDING }] };
  const net = providers(() => ({
    status: 429,
    json: { error: { code: 429, message: "User-rate limit exceeded", errors: [{ reason: "dailyLimitExceeded" }] } },
  }));
  try {
    const wire = await emailWireFor(fakeDb(tables, {}, v.rpcs), T);
    const out = await wire("owner@example.com", { body: "x", email: own(SENDING), purpose: "outreach" });
    assert.equal(out.ok, false);
    assert.equal(out.outcome, "retryable", "the outbox hands it to a fresh job, which meets the door's wait");
    assert.equal(out.errorBody, "mailbox_day_used");
    const rested = tables.mailbox_connections[0].resting_until;
    assert.ok(rested && rested.endsWith("T00:00:00.000Z"), `rested until a UTC midnight (${rested})`);
    assert.ok(Date.parse(rested) > Date.now());
  } finally {
    net.restore();
  }
});

test("a grant gone (invalid_grant at the refresh) sets the mailbox to reconnect, says so once, and the send waits", async () => {
  const expired = { ...liveCredentials("ya29.old"), expires_at: Date.now() - 1_000 };
  const v = vault({ [SENDING.id]: expired });
  const tables = { mailboxes: [MAILBOX], mailbox_connections: [{ ...SENDING }], events: [], notifications: [] };
  const net = providers((c) =>
    c.url.startsWith("https://oauth2.googleapis.com/token")
      ? { status: 400, json: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }
      : { status: 500, json: {} },
  );
  try {
    const wire = await emailWireFor(fakeDb(tables, {}, v.rpcs), T);
    const out = await wire("owner@example.com", { body: "x", email: own(SENDING), purpose: "outreach" });
    assert.equal(out.ok, false);
    assert.equal(out.outcome, "retryable");
    assert.equal(tables.mailbox_connections[0].state, "reconnect");
    assert.equal(
      tables.events.filter((e) => e.kind === "mailbox_connection.signed_out").length,
      1,
      "the Activity log says it once",
    );
    assert.ok(
      net.calls.every((c) => !c.url.includes("/messages/send")),
      "nothing was sent with a token that could not be refreshed",
    );
  } finally {
    net.restore();
  }
});
