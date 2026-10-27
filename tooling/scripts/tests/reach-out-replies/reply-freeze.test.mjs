/**
 * A person's answer to a reach-out's reply leaves from the mailbox the reach-out wrote from, and from the hosted mailbox
 * when it cannot (Reach out Part 5, PR 6; C15, N5; decision 0056): the dashboard's freeze (connections/email.ts
 * freezeReply and replyIdentityOf) run over a database in memory.
 *
 *   - The connected mailbox sending: the hosted mailbox's request as ever, and its twin from the connected mailbox, the
 *     same words, recipient, parent and id, answered at the mailbox itself. The twin leaves as that mailbox at the wire
 *     (channels requestLeavesAs over sendsAsConnected).
 *   - The connected mailbox paused, held, signed out or removed: the hosted mailbox's alone, and the composer is told why.
 *   - No hosted mailbox: the connected mailbox's alone.
 *   - No reach-out on the thread, or only another workspace's: the hosted mailbox's alone, as every other reply.
 *   - Which reach-out: the one the reply's References name, else the latest on the thread.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { requestLeavesAs, sendsAsConnected } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";

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

/** The mailbox the business connected, sending unless a case says otherwise. */
const box = (over = {}) =>
  rows.mailboxConnection({
    tenant_id: A,
    address: "sam@owndomain.example.com",
    host: "owndomain.example.com",
    from_name: "Sam at Harbor",
    ...over,
  });
/** A reach-out email that left on this thread, from a connected mailbox, as the door stamped it. */
const reachOut = (id, rfc, from, over = {}) => ({
  id,
  tenant_id: A,
  conversation_id: CONV,
  channel: "email",
  direction: "outbound",
  status: "sent",
  created_at: over.created_at ?? "2026-09-20T14:00:00Z",
  meta: {
    source: "reach_out",
    email: {
      message_id: rfc,
      thread_id: "g-thread-1",
      request: { from, reply_to: [/<([^>]+)>/.exec(from)?.[1] ?? from] },
    },
  },
  ...over,
});
const world = ({
  boxes = [box()],
  mailboxes = [MAILBOX],
  messages = [reachOut("o1", "<ro-1@owndomain.example.com>", '"Sam at Harbor" <sam@owndomain.example.com>')],
} = {}) => ({
  supabase: fakeDb({ mailboxes, mailbox_connections: boxes, messages }),
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
const identity = (w) =>
  replyIdentityOf(w.supabase, { tenantId: A, conversationId: CONV, references: PARENT.references });

test("the connected mailbox sending: the hosted mailbox's request as ever, and its twin from the connected mailbox that leaves as it", async () => {
  const out = await freezeReply(world(), INPUT);
  assert.equal(out.request.from, '"Harbor Moving" <harbor@mail.example.com>');
  assert.deepEqual(out.request.reply_to, ["r+tok1@mail.example.com"]);
  const twin = out.own;
  assert.ok(twin, "a twin was frozen");
  assert.equal(twin.from, '"Sam at Harbor" <sam@owndomain.example.com>');
  assert.deepEqual(twin.reply_to, ["sam@owndomain.example.com"], "answered at the mailbox itself");
  for (const k of ["to", "subject", "text", "idempotency_key", "headers"])
    assert.deepEqual(twin[k], out.request[k], `${k}: the same words, recipient, parent and id`);
  assert.equal(twin.idempotency_key, "id-1");
  assert.ok(requestLeavesAs(twin, sendsAsConnected({ address: "sam@owndomain.example.com" })), "its route takes it");
  assert.equal(
    requestLeavesAs(twin, sendsAsConnected({ address: "dana@owndomain.example.com" })),
    false,
    "and no other mailbox's",
  );
});

test("the connected mailbox not sending, or removed: the hosted mailbox's alone, and the composer is told why", async () => {
  for (const state of ["paused", "reconnect"]) {
    const w = world({ boxes: [box({ state })] });
    assert.equal((await freezeReply(w, INPUT)).own, null, state);
    assert.deepEqual(
      replyFromOf(await identity(w)),
      { from: "mailbox", because: "own_not_sending", own: "sam@owndomain.example.com" },
      state,
    );
  }
  const held = world({ boxes: [box({ state: "held", held_why: "bounces", held_at: "2026-09-21T00:00:00Z" })] });
  assert.equal((await identity(held)).because, "own_not_sending");
  const resting = world({ boxes: [box({ resting_until: new Date(Date.now() + 3_600_000).toISOString() })] });
  assert.equal((await identity(resting)).because, "own_not_sending", "its provider's day used up");
  const removed = world({ boxes: [] });
  assert.equal((await freezeReply(removed, INPUT)).own, null);
  assert.deepEqual(await identity(removed), {
    from: "mailbox",
    because: "own_removed",
    own: "sam@owndomain.example.com",
  });
  assert.deepEqual(replyFromOf(await identity(world())), { from: "own", address: "sam@owndomain.example.com" });
});

test("a workspace with no hosted mailbox answers from the connected mailbox alone; with neither, nothing is frozen", async () => {
  const only = await freezeReply(world({ mailboxes: [] }), INPUT);
  assert.equal(only.request.from, '"Sam at Harbor" <sam@owndomain.example.com>');
  assert.deepEqual(only.own, only.request, "its twin is itself");
  assert.equal(await freezeReply(world({ mailboxes: [], boxes: [] }), INPUT), null);
});

test("no reach-out on the thread, one that never left, or only another workspace's: the hosted mailbox's alone", async () => {
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
  const w = world({
    boxes: [box(), box({ address: "sam@second.example.com", host: "second.example.com", provider_account: "acct-2" })],
    messages,
  });
  const named = await freezeReply(w, INPUT);
  assert.match(named.own.from, /sam@owndomain\.example\.com/, "the email their reply cites");
  const latest = await freezeReply(w, { ...INPUT, parent: { ...PARENT, references: [], rfcMessageId: null } });
  assert.match(latest.own.from, /sam@second\.example\.com/, "else the latest reach-out on the thread");
});

test("an answer from the connected mailbox is signed as that mailbox signs (00487), the hosted twin too; the hosted mailbox's alone carries what was typed", async () => {
  // With nothing set, the name it sends as ends the email: it ended on the words alone, "Talk soon," on production.
  const named = await freezeReply(world(), INPUT);
  assert.equal(named.signature, "Sam at Harbor");
  assert.ok(named.own.text.endsWith("\n\nSam at Harbor"), "the twin, from the mailbox, signed");
  assert.equal(named.request.text, named.own.text, "and the hosted request, the same words and signature");
  // Gmail's signature, as Gmail keeps it: its markup in the HTML, its words in the text.
  const gmail = '<div dir="ltr"><b>Sam Reyes</b><div>Harbor Moving</div></div>';
  const signed = await freezeReply(world({ boxes: [box({ gmail_signature: gmail })] }), INPUT);
  assert.equal(signed.signature, "Sam Reyes\nHarbor Moving");
  assert.ok(signed.own.html.includes(`<div class="gmail_signature" data-smartmail="gmail_signature">${gmail}</div>`));
  // Off, none; and a thread no connected mailbox answers carries what was typed.
  const off = await freezeReply(world({ boxes: [box({ gmail_signature: gmail, signature_off: true })] }), INPUT);
  assert.equal(off.signature, null);
  assert.ok(!off.own.text.includes("Sam"), "nothing under the words");
  const hosted = await freezeReply(world({ messages: [] }), INPUT);
  assert.equal(hosted.signature, null, "the hosted mailbox's alone is not signed");
});
