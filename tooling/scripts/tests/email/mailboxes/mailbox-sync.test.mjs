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
function world({ box = {}, cursor = "100", said = [] } = {}) {
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
    // 00483: what the workspace said of its senders, by address or domain.
    mailbox_senders: said.map(([sender, verdict]) => ({ tenant_id: T, sender, verdict })),
  };
  /** What the door for the owner's emails was handed (00482), each call; and each email left, noted (00483). */
  const owned = [];
  const left = [];
  const rpcs = {
    ...v.rpcs,
    // 00424: of the threads that changed, the ones holding an email this workspace sent.
    mailbox_threads_known: (a) =>
      a.p_thread_ids.filter((t) =>
        tables.messages.some((m) => m.tenant_id === a.p_tenant_id && m.meta?.email?.thread_id === t),
      ),
    // 00482: the owner's email from the mailbox, kept in the thread of the one person it went to when the workspace knows
    // them, once by its provider id, and the holds that waited on a person there and opened before it, resolved.
    mailbox_owner_wrote: (a) => {
      owned.push(a);
      const who = tables.contacts.find((c) => c.tenant_id === a.p_tenant_id && c.email === a.p_address);
      if (!who) return { kept: false, why: "not_known" };
      if (tables.messages.some((m) => m.tenant_id === a.p_tenant_id && m.external_id === a.p_external_id))
        return { kept: false, why: "already" };
      const conversation = tables.messages.find((m) => m.contact_id === who.id)?.conversation_id ?? `c-${who.id}`;
      tables.messages.push({
        id: `m-${a.p_external_id}`,
        tenant_id: a.p_tenant_id,
        conversation_id: conversation,
        contact_id: who.id,
        channel: "email",
        direction: "outbound",
        sender: "human",
        status: "sent",
        external_id: a.p_external_id,
        body: a.p_body,
        error: null,
        meta: a.p_meta,
      });
      const open = tables.escalations.filter(
        (e) =>
          e.conversation_id === conversation &&
          e.state === "open" &&
          a.p_reasons.includes(e.reason) &&
          e.created_at < a.p_channel_ts,
      );
      for (const e of open) e.state = "resolved";
      return { kept: true, message_id: `m-${a.p_external_id}`, conversation_id: conversation, resolved: open.length };
    },
    // 00483: one more email left from a sender, as the owner's list of them keeps it.
    mailbox_left_note: (a) => {
      left.push([a.p_address, a.p_why]);
      return null;
    },
    // 00128, as the receipts suite models it.
    stamp_email_sent: (a) => {
      const m = tables.messages.find((x) => x.id === a.p_message_id && x.tenant_id === a.p_tenant_id);
      if (!m) return [];
      m.external_id ??= a.p_provider_id;
      return [{ status: m.status, conversation_id: m.conversation_id }];
    },
  };
  return { mailbox, tables, owned, left, db: fakeDb(tables, {}, rpcs) };
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
/**
 * An email the mailbox sent, as Gmail's Sent holds it: from the mailbox, to whom it names, under its own Message-ID
 * (one Chanlytics minted, or Gmail's when the owner wrote it there).
 */
const sentByMailbox = (
  id,
  threadId,
  { to = OWNER, messageId = `<${id}@mail.gmail.com>`, text = "Thursday works.", headers = [] } = {},
) => ({
  id,
  threadId,
  labelIds: ["SENT"],
  internalDate: String(Date.now()),
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "From", value: "Sam <sam@getharbor.example>" },
      { name: "To", value: to },
      { name: "Subject", value: "Re: A quick one" },
      { name: "Message-ID", value: messageId },
      ...headers,
    ],
    body: { data: b64url(text) },
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
    assert.deepEqual(out, {
      outcome: "synced",
      read: 4,
      bounced: 1,
      replies: 1,
      people: 1,
      owner: 0,
      dropped: 1,
      unreadable: 0,
    });
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

test("Gmail: the mailbox's drafts are never read, nor spam outside a thread of ours; a reply Gmail took for spam is read, and what the mailbox sent is read for the owner's words", async () => {
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
    // The reach-out's own email, as Gmail's Sent holds it: under the Message-ID it went with.
    if (c.url.includes("/messages/s1")) return { json: sentByMailbox("s1", "g-thread", { messageId: OURS }) };
    return { json: gmailMessage("other", "other", { from: "Rosa Diaz <rosa@example.com>" }) };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    for (const id of ["d1", "z1", "t1"])
      assert.equal(net.calls.filter((c) => c.url.includes(`/messages/${id}`)).length, 0, `${id} is never read`);
    assert.deepEqual(
      [out.read, out.replies, out.people, out.owner],
      [2, 1, 0, 0],
      "the reply taken for spam is a reply all the same; the reach-out's own email, read, is its row already",
    );
    assert.deepEqual(w.owned, [], "an email Chanlytics sent never reaches the owner's door");
    assert.deepEqual(
      w.tables.jobs.map((j) => withoutRequestId(j.payload).received_id),
      ["r9"],
    );
  } finally {
    net.restore();
  }
});

/** A Gmail message as users.messages.get answers it, under the labels Gmail filed it with. */
const tabbed = (labels, id, threadId, opts) => ({
  ...gmailMessage(id, threadId, opts),
  labelIds: ["INBOX", ...labels],
});

/** Gmail's history of these arrivals, each with its labels, and each message as its read answers it. */
const arrivals = (messages, historyId = "122") =>
  providers((c) => {
    if (c.url.includes("/history?"))
      return {
        json: {
          history: messages.map((m) => ({
            messagesAdded: [{ message: { id: m.id, threadId: m.threadId, labelIds: m.labelIds } }],
          })),
          historyId,
        },
      };
    const reports = reportsList(c);
    if (reports) return reports;
    const id = /\/messages\/([a-z0-9]+)\?/.exec(c.url)?.[1];
    const m = messages.find((x) => x.id === id);
    return m ? { json: m } : { status: 404 };
  });

test("Gmail's tabs: promotions outside a thread of ours is left, a reply filed there is a reply all the same; under Updates a stranger's notice that answers nothing is left, and a person the workspace knows, or a reply, comes in", async () => {
  const w = world();
  const net = arrivals([
    tabbed(["CATEGORY_PROMOTIONS"], "r7", "g-thread"),
    tabbed(["CATEGORY_PROMOTIONS"], "a7", "a-shop", { from: "Amazon.com <store-news@amazon.com>", text: "Deals." }),
    tabbed(["CATEGORY_UPDATES"], "u7", "a-notice", { from: "Rosa Diaz <rosa@example.com>", text: "Signed and sent." }),
    // The owner of the movers' business is in People (the reach-out's person): their email under Updates comes in.
    tabbed(["CATEGORY_UPDATES"], "u8", "a-quote", { text: "Here is our signed quote." }),
    tabbed(["CATEGORY_UPDATES"], "u9", "a-reply", {
      from: "Lee Park <lee@example.com>",
      text: "Yes, Tuesday works.",
      headers: [{ name: "In-Reply-To", value: "<quote-1@getharbor.example>" }],
    }),
  ]);
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual(out, {
      outcome: "synced",
      read: 5,
      bounced: 0,
      replies: 1,
      people: 2,
      owner: 0,
      dropped: 2,
      unreadable: 0,
    });
    assert.deepEqual(
      w.tables.jobs.map((j) => withoutRequestId(j.payload).received_id),
      ["r7", "u8", "u9"],
      "the newsletter and the stranger's notice are never taken in",
    );
    assert.deepEqual(
      w.left,
      [
        ["store-news@amazon.com", "gmail_tab"],
        ["rosa@example.com", "updates"],
      ],
      "each is on the owner's list, with why, one press from coming in",
    );
  } finally {
    net.restore();
  }
});

test("what the workspace said of a sender stands: a person comes in whatever the email looks like, and an automated domain leaves every address at it and below it", async () => {
  const w = world({
    said: [
      ["news.example", "person"],
      ["vendor.example", "automated"],
    ],
  });
  const net = arrivals([
    tabbed([], "n1", "a-news", {
      from: "Shop News <deals@news.example>",
      text: "Our winter rates.",
      headers: [{ name: "List-Unsubscribe", value: "<mailto:leave@news.example>" }],
    }),
    tabbed([], "v1", "a-vendor", { from: "Pat <pat@billing.vendor.example>", text: "Invoice 4471 attached." }),
  ]);
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual([out.people, out.dropped], [1, 1]);
    assert.deepEqual(
      w.tables.jobs.map((j) => withoutRequestId(j.payload).received_id),
      ["n1"],
    );
    assert.deepEqual(w.left, [["pat@billing.vendor.example", "said"]]);
  } finally {
    net.restore();
  }
});

test("mail from the workspace's own domains is its own (the 27 Oct 2026 walk): its website's notifier, a colleague and its other mailbox are left, unlisted and never a person; a sender the owner said is a person still comes in", async () => {
  const w = world();
  const host = w.mailbox.host;
  // Its second mailbox, on a domain of its own.
  w.tables.mailbox_connections.push(
    rows.mailboxConnection({ tenant_id: T, address: "dana@harbor-two.example", host: "harbor-two.example" }),
  );
  w.tables.mailbox_senders.push({ tenant_id: T, sender: `front@${host}`, verdict: "person" });
  const net = arrivals([
    tabbed([], "w1", "a-site", { from: `Harbor Website <site@${host}>`, text: "Promo signup: rosa@example.com" }),
    tabbed([], "c1", "a-colleague", { from: `Lee <lee@${host}>`, text: "Can you take the 3pm?" }),
    tabbed([], "o1", "a-other", { from: "Dana <dana@harbor-two.example>", text: "Testing the inbox." }),
    tabbed([], "f1", "a-front", { from: `Front desk <front@${host}>`, text: "A walk-in wants a quote." }),
    tabbed([], "p1", "a-person", { from: "Rosa <rosa@example.com>", text: "Do you move pianos?" }),
  ]);
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual([out.people, out.dropped], [2, 3]);
    assert.deepEqual(
      w.tables.jobs.map((j) => withoutRequestId(j.payload).received_id),
      ["f1", "p1"],
      "only a stranger's email, and the one the owner said is a person, are taken in",
    );
    assert.deepEqual(w.left, [], "the business's own mail is no stranger's: not on the list of senders left");
  } finally {
    net.restore();
  }
});

test("an owner's alert that reaches their connected mailbox is left there, as the mail Chanlytics sent says it is, never taken in as a person's email and flagged again (27 Oct 2026)", async () => {
  const { postMail } = await importSrc("apps/edge/lib/ops/notify.ts");
  const ALERTS = "alerts@chanlytics.example";
  const resend = providers(() => ({ json: { id: "em_1" } }));
  const keyed = withEnv({ RESEND_API_KEY: "re_test" });
  try {
    await postMail({
      from: `Chanlytics <${ALERTS}>`,
      to: ["sam@getharbor.example"],
      subject: "Rosa Diaz wrote by email: Tuesday?",
      text: "They wrote: “Is Tuesday free?”",
    });
  } finally {
    keyed();
    resend.restore();
  }
  // The headers the alert left with, as the mailbox's copy of it carries them.
  const sent = Object.entries(JSON.parse(resend.calls[0].body).headers).map(([name, value]) => ({ name, value }));
  assert.deepEqual(sent, [{ name: "Auto-Submitted", value: "auto-generated" }]);
  const alert = { from: `Chanlytics <${ALERTS}>`, text: "They wrote: “Is Tuesday free?”" };
  const w = world();
  const net = arrivals([
    tabbed([], "al1", "a-alert", { ...alert, headers: sent }),
    // The same alert as it left before it said so: a person's email to the mailbox's reading.
    tabbed([], "al0", "a-alert-before", alert),
  ]);
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual([out.people, out.dropped], [1, 1]);
    assert.deepEqual(
      w.tables.jobs.map((j) => withoutRequestId(j.payload).received_id),
      ["al0"],
      "the alert that says what it is is never taken in",
    );
    assert.deepEqual(w.left, [[ALERTS, "automated"]], "it is on the owner's list of what was left, with why");
  } finally {
    net.restore();
  }
});

test("what the owner wrote from Gmail to a person the workspace knows is kept in their thread and answers what waited there; to someone it does not know, to many, an automatic one and Chanlytics' own are left", async () => {
  const w = world();
  // A person who wrote, waiting in Need you since an hour ago, on the thread the reach-out started.
  w.tables.escalations.push({
    id: "x-wait",
    tenant_id: T,
    conversation_id: "c1",
    reason: "email_review",
    state: "open",
    created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
  });
  const sent = {
    o1: sentByMailbox("o1", "g-thread", { text: "Thursday at 10 works. See you then." }),
    o2: sentByMailbox("o2", "a-supplier", { to: "orders@supplier.example" }),
    o3: sentByMailbox("o3", "a-crowd", { to: `${OWNER}, b@example.com` }),
    o4: sentByMailbox("o4", "a-merge", {
      headers: [{ name: "List-Unsubscribe", value: "<mailto:leave@getharbor.example>" }],
    }),
    o5: sentByMailbox("o5", "g-thread", { messageId: OURS }),
  };
  const net = providers((c) => {
    if (c.url.includes("/history?"))
      return {
        json: {
          history: [
            ...Object.keys(sent).map((id) => ({
              messagesAdded: [{ message: { id, threadId: sent[id].threadId, labelIds: ["SENT"] } }],
            })),
            { messagesAdded: [{ message: { id: "d2", threadId: "g-thread", labelIds: ["DRAFT"] } }] },
          ],
          historyId: "123",
        },
      };
    const reports = reportsList(c);
    if (reports) return reports;
    const id = /\/messages\/([a-z0-9]+)\?/.exec(c.url)?.[1];
    return id && sent[id] ? { json: sent[id] } : { status: 404 };
  });
  try {
    const out = await syncMailbox(w.db, w.mailbox, logger({ tenant_id: T }));
    assert.deepEqual(
      [out.read, out.owner, out.replies, out.people, out.dropped],
      [5, 1, 0, 0, 0],
      "five sent read, the draft never; one kept as the owner's",
    );
    assert.equal(net.calls.filter((c) => c.url.includes("/messages/d2")).length, 0, "a draft is never read");
    assert.deepEqual(
      w.owned.map((a) => [a.p_address, a.p_external_id]),
      [
        [OWNER, "o1"],
        ["orders@supplier.example", "o2"],
      ],
      "only mail to one person, written by a person, and not Chanlytics' own, asks the door",
    );
    const [kept] = w.owned;
    assert.equal(kept.p_body, "Thursday at 10 works. See you then.");
    assert.ok(kept.p_reasons.includes("email_review"), "the holds a reply settles, as a typed reply settles them");
    assert.equal(kept.p_meta.owner_wrote, true);
    assert.equal(kept.p_meta.source, "mailbox");
    assert.equal(kept.p_meta.thread_id, "g-thread");
    assert.equal(kept.p_meta.email.message_id, "<o1@mail.gmail.com>");
    const mine = w.tables.messages.find((m) => m.external_id === "o1");
    assert.deepEqual([mine.direction, mine.sender, mine.conversation_id], ["outbound", "human", "c1"]);
    assert.equal(w.tables.escalations[0].state, "resolved", "Need you stops asking: the owner answered");
    assert.equal(w.tables.jobs.length, 0, "nothing of the owner's is handed to the intake");

    // The same changes again: kept once, nothing resolved twice.
    await syncMailbox(w.db, { ...w.mailbox, sync_cursor: "100" }, logger({ tenant_id: T }));
    assert.equal(w.tables.messages.filter((m) => m.external_id === "o1").length, 1);
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
