/**
 * One workspace's email wire, as the edge binds it (apps/edge/lib/email/email.ts emailWireFor): the hosted mailbox on
 * the platform's key, and each of its own verified domains on the cold key when this deployment holds one. Run over
 * a database in memory, with the provider answered by the test, so what is proved is which key each address leaves on.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { buildEmailRequest, hostedIdentity, ownDomainIdentity } from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { emailWireFor } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/email/email.ts")).href);
process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
process.env.RESEND_API_KEY = "platform-key";
after(() => {
  for (const k of ["EMAIL_DOMAIN", "RESEND_API_KEY", "RESEND_COLD_API_KEY", "RESEND_COLD_WEBHOOK_SECRET"])
    delete process.env[k];
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MAILBOX = {
  id: "mb1",
  tenant_id: T,
  local_part: "harbor",
  reply_token: "a".repeat(24),
  reply_token_prev: null,
  from_name: "Harbor",
};
const domain = (host, state) => ({ id: host, tenant_id: T, host, from_local: "sam", from_name: "Sam", state });
const request = (identity) =>
  buildEmailRequest({
    identity,
    to: "owner@example.com",
    parent: null,
    subject: "Your moving quotes",
    body: "Saw your shop on the map.",
    signature: null,
    actor: "ai",
    campaign: {
      unsubscribeUrl: "https://app.chanlytics.com/u/t",
      footer: "Unsubscribe: https://app.chanlytics.com/u/t",
    },
    messageId: "m1",
    tenantId: T,
  });
const own = (host) => request(ownDomainIdentity(domain(host), MAILBOX, "mail.chanlytics.com"));
const hosted = () => request(hostedIdentity(MAILBOX, "mail.chanlytics.com"));

function provider() {
  const keys = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    keys.push(init.headers.Authorization);
    return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
  };
  return { keys, restore: () => (globalThis.fetch = real) };
}

test("the hosted mailbox leaves on the platform's key, a verified own domain on the cold key, and a domain not yet verified on none", async () => {
  process.env.RESEND_COLD_API_KEY = "cold-key";
  process.env.RESEND_COLD_WEBHOOK_SECRET = "whsec_cold";
  const db = fakeDb({
    mailboxes: [MAILBOX],
    sending_domains: [domain("getharbor.com", "verified"), domain("harbor-new.com", "records")],
  });
  const wire = await emailWireFor(db, T);
  const net = provider();
  try {
    assert.equal((await wire("owner@example.com", { body: "x", email: hosted() })).ok, true);
    assert.equal(
      (await wire("owner@example.com", { body: "x", email: own("getharbor.com"), purpose: "outreach" })).ok,
      true,
    );
    const notYet = await wire("owner@example.com", { body: "x", email: own("harbor-new.com"), purpose: "outreach" });
    assert.equal(notYet.errorBody, "request_leaves_as_another_sender");
    assert.deepEqual(net.keys, ["Bearer platform-key", "Bearer cold-key"]);
  } finally {
    net.restore();
    delete process.env.RESEND_COLD_API_KEY;
  }
});

test("without the cold key no own domain is a route; a domains read that fails keeps the hosted route; no mailbox, no line", async () => {
  const tables = { mailboxes: [MAILBOX], sending_domains: [domain("getharbor.com", "verified")] };
  const net = provider();
  try {
    const noCold = await emailWireFor(fakeDb(tables), T);
    const out = await noCold("owner@example.com", { body: "x", email: own("getharbor.com"), purpose: "outreach" });
    assert.equal(out.errorBody, "request_leaves_as_another_sender");

    process.env.RESEND_COLD_API_KEY = "cold-key";
    const broken = await emailWireFor(
      fakeDb(tables, { "sending_domains.select": { message: "the database went away" } }),
      T,
    );
    assert.equal((await broken("owner@example.com", { body: "x", email: hosted() })).ok, true, "replies still leave");
    assert.deepEqual(net.keys, ["Bearer platform-key"]);

    assert.equal(await emailWireFor(fakeDb({ mailboxes: [], sending_domains: tables.sending_domains }), T), null);
  } finally {
    net.restore();
    delete process.env.RESEND_COLD_API_KEY;
  }
});

test("cold mail never leaves while its receipts would be refused: the cold key without the cold webhook secret binds no own route (Part 2.5 D6)", async () => {
  process.env.RESEND_COLD_API_KEY = "cold-key";
  delete process.env.RESEND_COLD_WEBHOOK_SECRET;
  const net = provider();
  try {
    const wire = await emailWireFor(
      fakeDb({ mailboxes: [MAILBOX], sending_domains: [domain("getharbor.com", "verified")] }),
      T,
    );
    const out = await wire("owner@example.com", { body: "x", email: own("getharbor.com"), purpose: "outreach" });
    assert.equal(out.errorBody, "request_leaves_as_another_sender");
    assert.deepEqual(net.keys, [], "nothing reached a provider");
    assert.equal((await wire("owner@example.com", { body: "x", email: hosted() })).ok, true, "replies still leave");
  } finally {
    net.restore();
    delete process.env.RESEND_COLD_API_KEY;
  }
});

test("with a cold reply domain (D17), an own domain's email answered there leaves, and one frozen before the switch still does; the hosted mailbox is unchanged", async () => {
  process.env.RESEND_COLD_API_KEY = "cold-key";
  process.env.RESEND_COLD_WEBHOOK_SECRET = "whsec_cold";
  process.env.COLD_REPLY_DOMAIN = "Reply.ColdLinks.example";
  const db = fakeDb({ mailboxes: [MAILBOX], sending_domains: [domain("getharbor.com", "verified")] });
  const net = provider();
  try {
    const wire = await emailWireFor(db, T);
    const cold = request(ownDomainIdentity(domain("getharbor.com"), MAILBOX, "reply.coldlinks.example"));
    assert.deepEqual(cold.reply_to, [`r+${"a".repeat(24)}@reply.coldlinks.example`]);
    assert.equal((await wire("owner@example.com", { body: "x", email: cold, purpose: "outreach" })).ok, true);
    assert.equal(
      (await wire("owner@example.com", { body: "x", email: own("getharbor.com"), purpose: "outreach" })).ok,
      true,
      "frozen on the mail domain before the switch",
    );
    const hostedCold = request({ ...hostedIdentity(MAILBOX, "mail.chanlytics.com"), replyTo: cold.reply_to[0] });
    assert.equal(
      (await wire("owner@example.com", { body: "x", email: hostedCold })).errorBody,
      "request_leaves_as_another_sender",
      "the cold reply domain is cold mail's only",
    );
  } finally {
    delete process.env.COLD_REPLY_DOMAIN;
    delete process.env.RESEND_COLD_API_KEY;
    delete process.env.RESEND_COLD_WEBHOOK_SECRET;
    net.restore();
  }
});

test("on the cold reply domains (D17): the one before still answers while it winds down, a rotated-out token too, another workspace's never, and cold mail leaves on the cold key", async () => {
  const { coldReplyDomain, coldReplyDomains } = await import(
    pathToFileURL(path.join(ROOT, "apps/edge/lib/email/email.ts")).href
  );
  process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
  process.env.RESEND_API_KEY = "platform-key";
  process.env.RESEND_COLD_API_KEY = "cold-key";
  process.env.RESEND_COLD_WEBHOOK_SECRET = "whsec_cold";
  process.env.COLD_REPLY_DOMAIN = "reply-b.coldlinks.example";
  process.env.COLD_REPLY_DOMAIN_PREVIOUS = "reply-a.coldlinks.example";
  const rotated = { ...MAILBOX, reply_token: "c".repeat(24), reply_token_prev: "a".repeat(24) };
  const db = fakeDb({ mailboxes: [rotated], sending_domains: [domain("getharbor.com", "verified")] });
  const net = provider();
  try {
    assert.deepEqual(coldReplyDomains(), ["reply-b.coldlinks.example", "reply-a.coldlinks.example"]);
    const wire = await emailWireFor(db, T);
    const on = (token, host) => request(ownDomainIdentity(domain("getharbor.com"), { reply_token: token }, host));
    const leaves = async (req) => (await wire("owner@example.com", { body: "x", email: req, purpose: "outreach" })).ok;
    assert.equal(await leaves(on("c".repeat(24), "reply-b.coldlinks.example")), true, "the one set now");
    assert.equal(await leaves(on("c".repeat(24), "reply-a.coldlinks.example")), true, "the one before, winding down");
    assert.equal(await leaves(on("a".repeat(24), "reply-b.coldlinks.example")), true, "a rotated-out token");
    const other = await wire("owner@example.com", {
      body: "x",
      email: on("z".repeat(24), "reply-b.coldlinks.example"),
      purpose: "outreach",
    });
    assert.equal(other.errorBody, "request_leaves_as_another_sender", "another workspace's route is never this one's");
    assert.deepEqual([...new Set(net.keys)], ["Bearer cold-key"], "cold mail leaves on the cold key");
    // The cold reply domain named as the mail domain is no cold reply domain.
    process.env.COLD_REPLY_DOMAIN = "Mail.Chanlytics.com";
    delete process.env.COLD_REPLY_DOMAIN_PREVIOUS;
    assert.equal(coldReplyDomain(), null);
    assert.deepEqual(coldReplyDomains(), []);
  } finally {
    for (const k of [
      "COLD_REPLY_DOMAIN",
      "COLD_REPLY_DOMAIN_PREVIOUS",
      "RESEND_COLD_API_KEY",
      "RESEND_COLD_WEBHOOK_SECRET",
    ])
      delete process.env[k];
    net.restore();
  }
});
