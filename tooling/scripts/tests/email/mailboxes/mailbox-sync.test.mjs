/**
 * A connected mailbox read back (apps/edge/lib/email/mailbox/mailbox-sync.ts; decision 0056), over a database in memory
 * with Gmail and Graph answered by the test. From its cursor, only what sits in a thread a reach-out started is ever
 * fetched; a reply there becomes one intake job, once; a delivery report about one of our emails is applied as the
 * bounce it reports (the row failed, the address stopped, the lead's address marked); a delay is nothing yet. One sync
 * at a time (its lease); a cursor the provider no longer keeps starts again from now; a message that could not be read
 * leaves the cursor where it was, so the next sync reads it again, unless the provider refused that one message for
 * good, which is said and gone on without.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { buildEmailRequest, connectedIdentity, mailboxMessageId } from "@chanlytics/channels";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { fieldsOf, linesOf, withoutRequestId } from "../../_log-lines.mjs";
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
    // 00424: of the threads that changed, the ones holding an email this workspace sent.
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
const report = (
  action,
  status,
  { id = "b1", threadId = "g-thread", diagnostic = `550 ${status} no such user`, recipient = OWNER } = {},
) =>
  gmailMessage(id, threadId, {
    from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
    headers: [{ name: "Content-Type", value: 'multipart/report; report-type=delivery-status; boundary="x"' }],
    parts: [
      { mimeType: "text/plain", body: { data: b64url("Your message wasn't delivered.") } },
      {
        mimeType: "message/delivery-status",
        body: {
          data: b64url(
            `Final-Recipient: rfc822; ${recipient}\nAction: ${action}\nStatus: ${status}\nDiagnostic-Code: smtp; ${diagnostic}`,
          ),
        },
      },
      { mimeType: "text/rfc822-headers", body: { data: b64url(`Message-ID: ${OURS}\nSubject: A quick one`) } },
    ],
  });
const bounce = report("failed", "5.1.1");

/** Gmail's list of the reports the mailbox received since the last read (gmailReports): these ids, else none. */
const reportsList = (c, ids = []) =>
  c.url.includes("/messages?q=from") ? { json: { messages: ids.map((id) => ({ id, threadId: `t-${id}` })) } } : null;

test("a sync reads what arrived from its cursor (decision 0073, R13): a reply in a thread a reach-out started and an email a person wrote are each one intake job, a report the bounce it reports, and a list's email is read and left where it is (D9)", async () => {
  const w = world();
  const net = providers((c) => {
    if (c.url.includes("/history?"))
      return {
        json: {
          history: [
            { messagesAdded: [{ message: { id: "r1", threadId: "g-thread", labelIds: ["INBOX"] } }] },
            { messagesAdded: [{ message: { id: "x1", threadId: "someone-elses", labelIds: ["INBOX"] } }] },
            { messagesAdded: [{ message: { id: "p1", threadId: "a-new-one", labelIds: ["INBOX"] } }] },
            { messagesAdded: [{ message: { id: "b1", threadId: "g-thread", labelIds: ["INBOX"] } }] },
          ],
          historyId: "120",
        },
      };
    const reports = reportsList(c, ["b1"]);
    if (reports) return reports;
    if (c.url.includes("/messages/r1")) return { json: gmailMessage("r1", "g-thread") };
    if (c.url.includes("/messages/x1"))
      return {
        json: gmailMessage("x1", "someone-elses", {
          from: "Shop News <news@shop.example>",
          headers: [{ name: "List-Unsubscribe", value: "<mailto:leave@shop.example>" }],
        }),
      };
    if (c.url.includes("/messages/p1"))
      return {
        json: gmailMessage("p1", "a-new-one", { from: "Rosa Diaz <rosa@example.com>", text: "Do you move pianos?" }),
      };
    if (c.url.includes("/messages/b1")) return { json: bounce };
    return { status: 404 };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual(out, { outcome: "synced", read: 4, bounced: 1, replies: 1, people: 1, dropped: 1, unreadable: 0 });
    assert.deepEqual(
      w.tables.jobs.map((j) => [j.kind, withoutRequestId(j.payload)]),
      [
        ["email_ingest", { source: "mailbox", mailbox_id: w.mailbox.id, received_id: "r1" }],
        ["email_ingest", { source: "mailbox", mailbox_id: w.mailbox.id, received_id: "p1" }],
      ],
      "the list's email is never taken in",
    );
    const m = w.tables.messages[0];
    assert.deepEqual([m.status, m.error?.provider, m.error?.kind], ["failed", "bounced", "Permanent"]);
    assert.equal(w.tables.contacts[0].email_suppressed_reason, "hard_bounce", "the address stops");
    assert.equal(w.tables.leads[0].email_state, "invalid", "and its lead's address is marked");
    assert.deepEqual(w.tables.escalations, [], "a reach-out's bounce flags no thread: nobody there wrote");
    const box = w.tables.mailbox_connections[0];
    assert.deepEqual([box.sync_cursor, box.sync_lease_until, box.last_error], ["120", null, null]);
    assert.ok(box.synced_at);

    // The same changes again: each job once still (the ledger's key), the row already failed.
    await syncMailbox(w.db, { ...w.mailbox, sync_cursor: "100" }, logger({ tenant_id: T }));
    assert.equal(w.tables.jobs.length, 2);
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
    const reports = reportsList(c, ["b1"]);
    if (reports) return reports;
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
  const quiet = providers(
    (c) => reportsList(c) ?? (c.url.includes("/history?") ? { json: { historyId: "101" } } : { status: 404 }),
  );
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
    const reports = reportsList(c);
    if (reports) return reports;
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

test("a message the mailbox refuses for good is said and gone on without, so the cursor moves on; a pace of requests keeps the cursor", async () => {
  // Two arrivals in the reach-out's thread: Gmail will not hand over the first, the second is a reply.
  const answer = (refusal) => (c) => {
    const reports = reportsList(c);
    if (reports) return reports;
    if (c.url.includes("/history?"))
      return {
        json: {
          history: [
            {
              messagesAdded: [
                { message: { id: "r1", threadId: "g-thread" } },
                { message: { id: "r2", threadId: "g-thread" } },
              ],
            },
          ],
          historyId: "130",
        },
      };
    if (c.url.includes("/messages/r1?")) return refusal;
    if (c.url.includes("/messages/r2?")) return { json: gmailMessage("r2", "g-thread") };
    return { status: 404 };
  };
  const refused = world();
  const net = providers(
    answer({
      status: 403,
      json: { error: { code: 403, status: "PERMISSION_DENIED", errors: [{ reason: "forbidden" }] } },
    }),
  );
  try {
    const { result: out, lines } = await linesOf(() =>
      syncMailbox(refused.db, refused.mailbox, logger({ tenant_id: T })),
    );
    assert.deepEqual(
      [out.unreadable, out.replies, out.read],
      [1, 1, 1],
      "the refused one counted apart, the reply read",
    );
    assert.equal(refused.tables.mailbox_connections[0].sync_cursor, "130", "the cursor moves on past it");
    assert.deepEqual(
      refused.tables.jobs.map((j) => j.payload.received_id),
      ["r2"],
      "the reply after it taken in",
    );
    const said = lines.filter((l) => l.event === "mailbox_message_unreadable").map(fieldsOf);
    assert.deepEqual(
      said.map((l) => [l.message, l.stage, l.status, l.reason]),
      [["r1", "sync", 403, "forbidden"]],
      "said once, with Gmail's own reason",
    );
  } finally {
    net.restore();
  }
  // Gmail says a pace of requests as a 403 too: that is no refusal of the message. The sync stops reading at it, and
  // the next sync reads on from the cursor where it was.
  const paced = world();
  const slow = providers(
    answer({ status: 403, json: { error: { code: 403, errors: [{ reason: "userRateLimitExceeded" }] } } }),
  );
  try {
    const { lines } = await linesOf(() => syncMailbox(paced.db, paced.mailbox, logger()));
    assert.equal(paced.tables.mailbox_connections[0].sync_cursor, "100", "read again next time");
    assert.deepEqual(paced.tables.jobs, [], "nothing after the pace read");
    assert.equal(
      slow.calls.filter((c) => c.url.includes("/messages/r2?")).length,
      0,
      "the message after it not asked for",
    );
    assert.deepEqual(
      lines
        .filter((l) => l.event === "mailbox_sync_failed" && l.stage === "paced")
        .map((l) => [l.message, l.status, l.reason]),
      [["r1", 403, "userRateLimitExceeded"]],
    );
  } finally {
    slow.restore();
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
    if (c.url.includes("/mailFolders/junkemail/messages")) return { json: { value: [] } };
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
    if (c.url.includes("/me/messages/y1"))
      return {
        json: {
          id: "y1",
          conversationId: "conv-other",
          subject: "This week's deals",
          from: { emailAddress: { address: "news@shop.example" } },
          body: { contentType: "text", content: "Save 20% this week." },
          internetMessageHeaders: [{ name: "List-Unsubscribe", value: "<mailto:leave@shop.example>" }],
        },
      };
    return { status: 404 };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger());
    // The newsletter is read for what it claims (decision 0073, R13) and left where it is, counted (D9): never taken in.
    assert.deepEqual([out.read, out.bounced, out.replies, out.people, out.dropped], [2, 1, 0, 0, 1]);
    assert.equal(net.calls.filter((c) => c.url.includes("/me/messages/y1")).length, 1);
    assert.equal(w.tables.jobs.length, 0, "a newsletter is never taken in");
    assert.equal(w.tables.messages[0].status, "failed");
    assert.match(w.tables.mailbox_connections[0].sync_cursor, /deltatoken=d2$/);
  } finally {
    net.restore();
  }
});

test("Gmail: a report outside the thread of the email it is about is found by who wrote it, and applied", async () => {
  const w = world();
  const net = providers((c) => {
    if (c.url.includes("/history?"))
      return {
        json: { history: [{ messagesAdded: [{ message: { id: "b2", threadId: "dsn-thread" } }] }], historyId: "122" },
      };
    const reports = reportsList(c, ["b2"]);
    if (reports) return reports;
    if (c.url.includes("/messages/b2"))
      return { json: report("failed", "5.1.1", { id: "b2", threadId: "dsn-thread" }) };
    return { status: 404 };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual([out.read, out.bounced, out.replies], [1, 1, 0]);
    assert.equal(w.tables.messages[0].status, "failed");
    assert.equal(w.tables.mailbox_connections[0].sync_cursor, "122");
  } finally {
    net.restore();
  }
});

test("whose fault a bounce is decides what follows: a refused sender stops no address, the sender's own quota rests the mailbox, a forward's dead address is not ours", async () => {
  const sync = async (r) => {
    const w = world();
    const net = providers((c) => {
      if (c.url.includes("/history?"))
        return {
          json: { history: [{ messagesAdded: [{ message: { id: "b1", threadId: "g-thread" } }] }], historyId: "123" },
        };
      const reports = reportsList(c, ["b1"]);
      if (reports) return reports;
      if (c.url.includes("/messages/b1")) return { json: r };
      return { status: 404 };
    });
    try {
      await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    } finally {
      net.restore();
    }
    return w;
  };
  const blocked = await sync(
    report("failed", "5.7.1", {
      diagnostic: "550 5.7.1 Our system has detected that this message is likely unsolicited mail",
    }),
  );
  assert.deepEqual([blocked.tables.messages[0].status, blocked.tables.messages[0].error?.kind], ["failed", "Blocked"]);
  assert.equal(blocked.tables.contacts[0].email_suppressed_reason, null, "the address is not the one at fault");
  assert.equal(blocked.tables.leads[0].email_state, "ok", "nor is its lead");

  const before = Date.now();
  const limited = await sync(report("failed", "5.4.5", { diagnostic: "550 5.4.5 Daily user sending limit exceeded." }));
  assert.equal(limited.tables.messages[0].error?.kind, "Transient");
  assert.equal(limited.tables.contacts[0].email_suppressed_reason, null);
  const resting = Date.parse(limited.tables.mailbox_connections[0].resting_until ?? "");
  assert.ok(resting >= before + 23 * 3_600_000, "the mailbox rests its provider's day");

  const forwarded = await sync(report("failed", "5.1.1", { recipient: "old-office@elsewhere.example" }));
  assert.equal(forwarded.tables.messages[0].error?.kind, "Transient", "a forward's dead address");
  assert.equal(forwarded.tables.contacts[0].email_suppressed_reason, null, "stops nothing of ours");
});

test("Gmail: the mailbox's own sends and drafts are never read, nor spam outside a thread of ours; a reply Gmail took for spam is read", async () => {
  const w = world();
  const net = providers((c) => {
    if (c.url.includes("/history?"))
      return {
        json: {
          history: [
            { messagesAdded: [{ message: { id: "s1", threadId: "g-thread", labelIds: ["SENT"] } }] },
            { messagesAdded: [{ message: { id: "d1", threadId: "a-draft", labelIds: ["DRAFT"] } }] },
            { messagesAdded: [{ message: { id: "z1", threadId: "spam-thread", labelIds: ["SPAM"] } }] },
            { messagesAdded: [{ message: { id: "t1", threadId: "trash-thread", labelIds: ["TRASH"] } }] },
            { messagesAdded: [{ message: { id: "r9", threadId: "g-thread", labelIds: ["SPAM"] } }] },
          ],
          historyId: "121",
        },
      };
    const reports = reportsList(c);
    if (reports) return reports;
    if (c.url.includes("/messages/r9")) return { json: gmailMessage("r9", "g-thread") };
    return { json: gmailMessage("other", "other", { from: "Rosa Diaz <rosa@example.com>" }) };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    for (const id of ["s1", "d1", "z1", "t1"])
      assert.equal(net.calls.filter((c) => c.url.includes(`/messages/${id}`)).length, 0, `${id} is never read`);
    assert.deepEqual(
      [out.read, out.replies, out.people],
      [1, 1, 0],
      "the reply taken for spam is a reply all the same",
    );
    assert.deepEqual(
      w.tables.jobs.map((j) => withoutRequestId(j.payload).received_id),
      ["r9"],
    );
  } finally {
    net.restore();
  }
});

test("Gmail's tabs: what it filed as promotions outside a thread of ours is read and left; a reply it filed there is a reply all the same, and a person under Updates is a person", async () => {
  const w = world();
  const tabbed = (labels, id, threadId, opts) => ({
    ...gmailMessage(id, threadId, opts),
    labelIds: ["INBOX", ...labels],
  });
  const net = providers((c) => {
    if (c.url.includes("/history?"))
      return {
        json: {
          history: [
            { messagesAdded: [{ message: { id: "r7", threadId: "g-thread", labelIds: ["CATEGORY_PROMOTIONS"] } }] },
            { messagesAdded: [{ message: { id: "a7", threadId: "a-shop", labelIds: ["CATEGORY_PROMOTIONS"] } }] },
            { messagesAdded: [{ message: { id: "u7", threadId: "a-quote", labelIds: ["CATEGORY_UPDATES"] } }] },
          ],
          historyId: "122",
        },
      };
    const reports = reportsList(c);
    if (reports) return reports;
    if (c.url.includes("/messages/r7")) return { json: tabbed(["CATEGORY_PROMOTIONS"], "r7", "g-thread") };
    if (c.url.includes("/messages/a7"))
      return {
        json: tabbed(["CATEGORY_PROMOTIONS"], "a7", "a-shop", {
          from: "Amazon.com <store-news@amazon.com>",
          text: "Today's deals.",
        }),
      };
    if (c.url.includes("/messages/u7"))
      return {
        json: tabbed(["CATEGORY_UPDATES"], "u7", "a-quote", {
          from: "Rosa Diaz <rosa@example.com>",
          text: "Signed and sent back.",
        }),
      };
    return { status: 404 };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual(out, { outcome: "synced", read: 3, bounced: 0, replies: 1, people: 1, dropped: 1, unreadable: 0 });
    assert.deepEqual(
      w.tables.jobs.map((j) => withoutRequestId(j.payload).received_id),
      ["r7", "u7"],
      "the newsletter is never taken in",
    );
  } finally {
    net.restore();
  }
});

test("Graph: a reply Exchange took for junk is read from Junk Email since the last read, when it is in a thread of ours", async () => {
  const w = world({
    box: { provider: "microsoft", address: "dana@getharbor.example", provider_account: "acct-dana" },
    cursor: "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=d1",
  });
  w.tables.messages[0].meta.email.thread_id = "conv-ours";
  const net = providers((c) => {
    if (c.url.includes("/mailFolders/junkemail/messages"))
      return {
        json: {
          value: [
            { id: "j1", conversationId: "conv-ours", from: { emailAddress: { address: OWNER } } },
            { id: "j2", conversationId: "conv-spam", from: { emailAddress: { address: "deals@spam.example" } } },
          ],
        },
      };
    if (c.url.includes("deltatoken=d1"))
      return {
        json: {
          value: [],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=d3",
        },
      };
    if (c.url.includes("/me/messages/j1"))
      return {
        json: {
          id: "j1",
          conversationId: "conv-ours",
          subject: "Re: A quick one",
          from: { emailAddress: { address: OWNER } },
          body: { contentType: "text", content: "Yes, call me." },
          internetMessageHeaders: [],
        },
      };
    return { status: 404 };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual([out.read, out.replies], [1, 1]);
    assert.equal(
      net.calls.filter((c) => c.url.includes("/me/messages/j2")).length,
      0,
      "junk that is not ours is never read",
    );
    assert.deepEqual(
      w.tables.jobs.map((j) => withoutRequestId(j.payload).received_id),
      ["j1"],
    );
  } finally {
    net.restore();
  }
});
