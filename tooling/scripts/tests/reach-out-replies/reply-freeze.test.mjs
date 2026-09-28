/**
 * A person's answer to a reach-out's reply leaves from the domain the reach-out wrote from, and from the mailbox when
 * it cannot (Reach out Part 5, PR 6; C15, N5): the dashboard's freeze (connections/email.ts freezeReply and
 * replyIdentityOf) run over a database in memory.
 *
 *   - The domain verified: the mailbox's request as ever, and its twin on the own domain, the same words, recipient,
 *     parent and id, answered at the mailbox's reply route on the reply domain the reach-out was answered on. The twin
 *     leaves as that domain at the wire (channels requestLeavesAs over sendsAsOwnDomain).
 *   - The domain held, or removed: the mailbox's alone, and the composer is told why.
 *   - No reach-out on the thread, or only another workspace's: the mailbox's alone, as every other reply.
 *   - Which reach-out: the one the reply's References name, else the latest on the thread.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { requestLeavesAs, sendsAsOwnDomain } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.EMAIL_DOMAIN = "mail.example.com";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { freezeReply, replyIdentityOf, replyFromOf } = await import(
  at("apps/dashboard/src/server/connections/email.ts")
);

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
const MAILBOX = {
  id: "mb1",
  tenant_id: A,
  local_part: "harbor",
  from_name: "Harbor Moving",
  reply_token: "tok1",
  reply_token_prev: null,
};
const REPLY_DOMAIN = "reply.example.com";

const domain = (over = {}) => ({
  id: "d1",
  tenant_id: A,
  host: "owndomain.example.com",
  from_local: "sam",
  from_name: "Sam at Harbor",
  state: "verified",
  held_why: null,
  held_at: null,
  verified_at: "2026-09-01T00:00:00Z",
  clean_since: null,
  provider_status: "verified",
  dmarc: null,
  records: [],
  checked_at: null,
  created_at: "2026-09-01T00:00:00Z",
  sent_recent: 0,
  bounced_recent: 0,
  complaints: 0,
  ...over,
});
/** A reach-out email that left on this thread, as the sender froze it and the receipt stamped it. */
const reachOut = (id, rfc, from, over = {}) => ({
  id,
  tenant_id: A,
  conversation_id: CONV,
  channel: "email",
  direction: "outbound",
  status: "delivered",
  created_at: over.created_at ?? "2026-09-20T14:00:00Z",
  meta: {
    source: "reach_out",
    email: { message_id: rfc, request: { from, reply_to: [`r+tok1@${REPLY_DOMAIN}`] } },
  },
  ...over,
});
const world = ({
  domains = [domain()],
  messages = [reachOut("o1", "<ro-1@owndomain.example.com>", '"Sam at Harbor" <sam@owndomain.example.com>')],
} = {}) => ({
  supabase: fakeDb({ mailboxes: [MAILBOX], sending_domains: domains, messages }),
  userId: "u1",
  email: "ada@example.com",
  params: {},
});
const PARENT = {
  messageId: "in-1",
  from: "office@example.com",
  rfcMessageId: "<their-1@example.com>",
  references: ["<ro-1@owndomain.example.com>"],
  subject: "A quick question",
};
const INPUT = {
  tenantId: A,
  conversationId: CONV,
  messageId: "id-1",
  to: "office@example.com",
  parent: PARENT,
  body: "Happy to. Thursday at 10?",
};

test("the domain verified: the mailbox's request as ever, and its twin on the own domain that leaves as it", async () => {
  const out = await freezeReply(world(), INPUT);
  assert.equal(out.request.from, '"Harbor Moving" <harbor@mail.example.com>');
  assert.deepEqual(out.request.reply_to, ["r+tok1@mail.example.com"]);
  const twin = out.own;
  assert.ok(twin, "a twin was frozen");
  assert.match(twin.from, /<sam@owndomain\.example\.com>$/);
  assert.deepEqual(twin.reply_to, [`r+tok1@${REPLY_DOMAIN}`], "answered on the reply domain the reach-out was");
  for (const k of ["to", "subject", "text", "idempotency_key", "headers"])
    assert.deepEqual(twin[k], out.request[k], `${k}: the same words, recipient, parent and id`);
  assert.equal(twin.idempotency_key, "id-1");
  assert.ok(
    requestLeavesAs(twin, sendsAsOwnDomain(domain(), MAILBOX, "mail.example.com", REPLY_DOMAIN)),
    "the own route takes it at the wire",
  );
  assert.equal(
    requestLeavesAs(twin, sendsAsOwnDomain(domain(), MAILBOX, "mail.example.com", null)),
    false,
    "a retired reply domain does not",
  );
});

test("the domain held or removed: the mailbox's alone, and the composer is told why", async () => {
  const held = world({ domains: [domain({ state: "held", held_why: "bounces" })] });
  assert.equal((await freezeReply(held, INPUT)).own, null);
  assert.deepEqual(
    replyFromOf(
      await replyIdentityOf(held.supabase, { tenantId: A, conversationId: CONV, references: PARENT.references }),
    ),
    {
      from: "mailbox",
      because: "domain_held",
    },
  );
  const removed = world({ domains: [] });
  assert.equal((await freezeReply(removed, INPUT)).own, null);
  assert.deepEqual(
    await replyIdentityOf(removed.supabase, { tenantId: A, conversationId: CONV, references: PARENT.references }),
    {
      from: "mailbox",
      because: "domain_removed",
    },
  );
  const verified = world();
  assert.deepEqual(
    replyFromOf(
      await replyIdentityOf(verified.supabase, { tenantId: A, conversationId: CONV, references: PARENT.references }),
    ),
    {
      from: "own",
      address: "sam@owndomain.example.com",
    },
  );
});

test("no reach-out on the thread, one that never left, or only another workspace's: the mailbox's alone", async () => {
  const none = world({ messages: [] });
  assert.equal((await freezeReply(none, INPUT)).own, null);
  assert.deepEqual(await replyIdentityOf(none.supabase, { tenantId: A, conversationId: CONV, references: [] }), {
    from: "mailbox",
    because: null,
  });
  const failed = world({
    messages: [reachOut("o1", "<ro-1@owndomain.example.com>", "sam@owndomain.example.com", { status: "failed" })],
  });
  assert.equal((await freezeReply(failed, INPUT)).own, null, "an email that never left is not answered");
  const theirs = world({
    messages: [reachOut("o1", "<ro-1@owndomain.example.com>", "sam@owndomain.example.com", { tenant_id: B })],
  });
  assert.equal((await freezeReply(theirs, INPUT)).own, null, "the read is by workspace");
  const customer = world({
    messages: [{ ...reachOut("o1", "<ro-1@owndomain.example.com>", "sam@owndomain.example.com"), meta: { email: {} } }],
  });
  assert.equal((await freezeReply(customer, INPUT)).own, null, "a reply that is not a reach-out's");
});

test("which reach-out: the one the reply's References name, else the latest on the thread", async () => {
  const messages = [
    reachOut("o2", "<ro-2@second.example.com>", "sam@second.example.com", { created_at: "2026-09-24T14:00:00Z" }),
    reachOut("o1", "<ro-1@owndomain.example.com>", "sam@owndomain.example.com", { created_at: "2026-09-20T14:00:00Z" }),
  ];
  const w = world({ domains: [domain(), domain({ id: "d2", host: "second.example.com" })], messages });
  const named = await freezeReply(w, INPUT);
  assert.match(named.own.from, /sam@owndomain\.example\.com/, "the email their reply cites");
  const latest = await freezeReply(w, { ...INPUT, parent: { ...PARENT, references: [], rfcMessageId: null } });
  assert.match(latest.own.from, /sam@second\.example\.com/, "else the latest reach-out on the thread");
});
