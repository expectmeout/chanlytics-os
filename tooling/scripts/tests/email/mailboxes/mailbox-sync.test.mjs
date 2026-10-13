/**
 * A connected mailbox read back (apps/edge/lib/email/mailbox/mailbox-sync.ts; decision 0056), over a database in memory
 * with Gmail and Graph answered by the test. From its cursor, only what sits in a thread a reach-out started is ever
 * fetched; a reply there becomes one intake job, once; a delivery report about one of our emails is applied as the
 * bounce it reports (the row failed, the address stopped, the lead's address marked); a delay is nothing yet. One sync
 * at a time (its lease); a cursor the provider no longer keeps starts again from now; a message that could not be read
 * leaves the cursor where it was, so the next sync reads it again.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { buildEmailRequest, connectedIdentity, mailboxMessageId } from "@chanlytics/channels";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { withoutRequestId } from "../../_log-lines.mjs";
import { MAILBOX_ENV, b64url, liveCredentials, providers, vault, withEnv } from "./_mailbox-world.mjs";

const restore = withEnv(MAILBOX_ENV);
after(restore);
const { syncMailbox } = await importSrc("apps/edge/lib/email/mailbox/mailbox-sync.ts");
const { logger } = await importSrc("apps/edge/lib/log.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "office@fixture-movers.example";
const OURS = mailboxMessageId(M, "getharbor.example");
const request = buildEmailRequest({
  identity: connectedIdentity({ address: "sam@getharbor.example", from_name: "Sam" }),
  to: OWNER,
  parent: null,
  subject: "A quick one",
  body: "Saw your shop on the map.",
  signature: null,
  actor: "human",
  plain: true,
  autoSubmitted: false,
  campaign: { unsubscribeUrl: "https://app.example.com/u/t", footer: 'Reply "no thanks" and I will not write again.' },
  messageId: M,
  tenantId: T,
});

/** A Gmail mailbox, the reach-out email it sent (stamped with its thread), its person and its lead. */
function world({ box = {}, cursor = "100" } = {}) {
  const mailbox = rows.mailboxConnection({ tenant_id: T, sync_cursor: cursor, ...box });
  const v = vault({ [mailbox.id]: liveCredentials("ya29.sam") });
  const tables = {
    mailbox_connections: [mailbox],
    messages: [
      {
        id: M,
        tenant_id: T,
        conversation_id: "c1",
        contact_id: "k1",
        channel: "email",
        direction: "outbound",
        status: "sent",
        external_id: "g-sent-1",
        error: null,
        meta: {
          source: "reach_out",
          email: {
            subject: "A quick one",
            to: [OWNER],
            request,
            message_id: OURS,
            thread_id: "g-thread",
            mailbox_id: mailbox.id,
          },
          reach_out: { lead_id: "l1" },
        },
      },
    ],
    contacts: [{ id: "k1", tenant_id: T, email: OWNER, email_suppressed_at: null, email_suppressed_reason: null }],
    leads: [
      {
        id: "l1",
        tenant_id: T,
        email_state: "ok",
        email_checked_at: null,
        version: 3,
        erased_at: null,
        blanked_at: null,
      },
    ],
    escalations: [],
    events: [],
    jobs: [],
  };
  const rpcs = {
    ...v.rpcs,
    // 00422: of the threads that changed, the ones holding an email this workspace sent.
    mailbox_threads_known: (a) =>
      a.p_thread_ids.filter((t) =>
        tables.messages.some((m) => m.tenant_id === a.p_tenant_id && m.meta?.email?.thread_id === t),
      ),
    // 00128, as the receipts suite models it.
    stamp_email_sent: (a) => {
      const m = tables.messages.find((x) => x.id === a.p_message_id && x.tenant_id === a.p_tenant_id);
      if (!m) return [];
      m.external_id ??= a.p_provider_id;
      return [{ status: m.status, conversation_id: m.conversation_id }];
    },
  };
  return { mailbox, tables, db: fakeDb(tables, {}, rpcs) };
}

const gmailMessage = (id, threadId, { from = OWNER, text = "Sure, call me Thursday.", headers = [], parts } = {}) => ({
  id,
  threadId,
  internalDate: String(Date.now()),
  payload: {
    mimeType: parts ? "multipart/report" : "text/plain",
    headers: [
      { name: "From", value: from },
      { name: "To", value: "sam@getharbor.example" },
      { name: "Subject", value: "Re: A quick one" },
      { name: "Message-ID", value: `<${id}@fixture-movers.example>` },
      ...headers,
    ],
    ...(parts ? { parts } : { body: { data: b64url(text) } }),
  },
});
/** A delivery report about our email, from the receiving server's postmaster: `action` and `status` as RFC 3464 says them. */
const report = (action, status) =>
  gmailMessage("b1", "g-thread", {
    from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
    headers: [{ name: "Content-Type", value: 'multipart/report; report-type=delivery-status; boundary="x"' }],
    parts: [
      { mimeType: "text/plain", body: { data: b64url("Your message wasn't delivered.") } },
      {
        mimeType: "message/delivery-status",
        body: {
          data: b64url(
            `Final-Recipient: rfc822; ${OWNER}\nAction: ${action}\nStatus: ${status}\nDiagnostic-Code: smtp; 550 5.1.1 no such user`,
          ),
        },
      },
      { mimeType: "text/rfc822-headers", body: { data: b64url(`Message-ID: ${OURS}\nSubject: A quick one`) } },
    ],
  });
const bounce = report("failed", "5.1.1");

test("a sync reads from its cursor only the threads a reach-out started: a reply becomes one intake job, a report the bounce it reports", async () => {
  const w = world();
  const net = providers((c) => {
    if (c.url.includes("/history?"))
      return {
        json: {
          history: [
            { messagesAdded: [{ message: { id: "r1", threadId: "g-thread" } }] },
            { messagesAdded: [{ message: { id: "x1", threadId: "someone-elses" } }] },
            { messagesAdded: [{ message: { id: "b1", threadId: "g-thread" } }] },
          ],
          historyId: "120",
        },
      };
    if (c.url.includes("/messages/r1")) return { json: gmailMessage("r1", "g-thread") };
    if (c.url.includes("/messages/b1")) return { json: bounce };
    return { status: 404 };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual(out, { outcome: "synced", read: 2, bounced: 1, replies: 1 });
    assert.equal(
      net.calls.filter((c) => c.url.includes("/messages/x1")).length,
      0,
      "nothing else the business receives is read",
    );
    assert.deepEqual(
      w.tables.jobs.map((j) => [j.kind, withoutRequestId(j.payload)]),
      [["email_ingest", { source: "mailbox", mailbox_id: w.mailbox.id, received_id: "r1" }]],
    );
    const m = w.tables.messages[0];
    assert.deepEqual([m.status, m.error?.provider, m.error?.kind], ["failed", "bounced", "Permanent"]);
    assert.equal(w.tables.contacts[0].email_suppressed_reason, "hard_bounce", "the address stops");
    assert.equal(w.tables.leads[0].email_state, "invalid", "and its lead's address is marked");
    assert.deepEqual(w.tables.escalations, [], "a reach-out's bounce flags no thread: nobody there wrote");
    const box = w.tables.mailbox_connections[0];
    assert.deepEqual([box.sync_cursor, box.sync_lease_until, box.last_error], ["120", null, null]);
    assert.ok(box.synced_at);

    // The same changes again: one job still (the ledger's key), the row already failed.
    await syncMailbox(w.db, { ...w.mailbox, sync_cursor: "100" }, logger({ tenant_id: T }));
    assert.equal(w.tables.jobs.length, 1);
  } finally {
    net.restore();
  }
});

test("a delay is nothing yet; a report that names no email of ours is left", async () => {
  const w = world();
  const delayed = report("delayed", "4.4.7");
  const net = providers((c) => {
    if (c.url.includes("/history?"))
      return {
        json: { history: [{ messagesAdded: [{ message: { id: "b1", threadId: "g-thread" } }] }], historyId: "121" },
      };
    if (c.url.includes("/messages/b1")) return { json: delayed };
    return { status: 404 };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual([out.bounced, out.replies], [0, 0]);
    assert.equal(w.tables.messages[0].status, "sent", "a delay fails nothing");
    assert.deepEqual(w.tables.jobs, [], "and is no reply");
  } finally {
    net.restore();
  }
});

test("one sync at a time: a mailbox another sync holds is left; a lease that lapsed is taken", async () => {
  const held = world({ box: { sync_lease_until: new Date(Date.now() + 60_000).toISOString() } });
  const net = providers(() => ({ status: 500 }));
  try {
    assert.equal((await syncMailbox(held.db, held.mailbox, logger())).outcome, "busy");
    assert.deepEqual(net.calls, [], "nothing asked of the provider");
  } finally {
    net.restore();
  }
  const lapsed = world({ box: { sync_lease_until: new Date(Date.now() - 60_000).toISOString() } });
  const quiet = providers((c) => (c.url.includes("/history?") ? { json: { historyId: "101" } } : { status: 404 }));
  try {
    assert.equal((await syncMailbox(lapsed.db, lapsed.mailbox, logger())).outcome, "synced");
    assert.equal(lapsed.tables.mailbox_connections[0].sync_cursor, "101");
  } finally {
    quiet.restore();
  }
});

test("a cursor Gmail no longer keeps starts again from now; a mailbox with none starts there; a message that could not be read keeps the cursor", async () => {
  const lost = world();
  const net = providers((c) => {
    if (c.url.includes("/history?"))
      return { status: 404, json: { error: { code: 404, message: "Requested entity was not found." } } };
    if (c.url.endsWith("/profile")) return { json: { emailAddress: "sam@getharbor.example", historyId: "900" } };
    return { status: 404 };
  });
  try {
    assert.equal((await syncMailbox(lost.db, lost.mailbox, logger())).outcome, "restarted");
    assert.equal(lost.tables.mailbox_connections[0].sync_cursor, "900");
    const fresh = world({ cursor: null });
    assert.equal((await syncMailbox(fresh.db, fresh.mailbox, logger())).outcome, "started");
    assert.equal(fresh.tables.mailbox_connections[0].sync_cursor, "900");
  } finally {
    net.restore();
  }
  const broken = world();
  const flaky = providers((c) => {
    if (c.url.includes("/history?"))
      return {
        json: { history: [{ messagesAdded: [{ message: { id: "r1", threadId: "g-thread" } }] }], historyId: "130" },
      };
    return { status: 500, json: { error: { code: 500 } } };
  });
  try {
    await syncMailbox(broken.db, broken.mailbox, logger());
    assert.equal(broken.tables.mailbox_connections[0].sync_cursor, "100", "read again next time");
    assert.deepEqual(broken.tables.jobs, []);
  } finally {
    flaky.restore();
  }
});

test("a Graph mailbox reads its delta from its link, and a report from Exchange's own sender is read however it was threaded", async () => {
  const w = world({
    box: {
      provider: "microsoft",
      address: "dana@getharbor.example",
      provider_account: "acct-dana",
    },
    cursor: "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=d1",
  });
  const net = providers((c) => {
    if (c.url.includes("deltatoken=d1"))
      return {
        json: {
          value: [
            {
              id: "ndr-1",
              conversationId: "conv-other",
              from: { emailAddress: { address: "postmaster@outlook.com" } },
            },
            { id: "y1", conversationId: "conv-other", from: { emailAddress: { address: "news@shop.example" } } },
          ],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=d2",
        },
      };
    if (c.url.includes("/me/messages/ndr-1"))
      return {
        json: {
          id: "ndr-1",
          conversationId: "conv-other",
          subject: "Undeliverable: A quick one",
          from: { emailAddress: { address: "postmaster@outlook.com" } },
          body: {
            contentType: "text",
            content: `550 5.1.10 RESOLVER.ADR.RecipientNotFound\nOriginal Message-ID: ${OURS}`,
          },
          internetMessageHeaders: [],
        },
      };
    return { status: 404 };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger());
    assert.deepEqual([out.read, out.bounced, out.replies], [1, 1, 0]);
    assert.equal(net.calls.filter((c) => c.url.includes("/me/messages/y1")).length, 0, "a newsletter is never read");
    assert.equal(w.tables.messages[0].status, "failed");
    assert.match(w.tables.mailbox_connections[0].sync_cursor, /deltatoken=d2$/);
  } finally {
    net.restore();
  }
});
