/**
 * A connected mailbox's six months and its people (decision 0073, R19; apps/edge/lib/imports/mail-history.ts and
 * mail-people.ts), run as the job runner runs a part (history-import.ts historyImports) over a database in memory, with
 * Gmail and Google's People API answered by the test. What a person wrote, and what the owner wrote to one person, is
 * kept as before Chanlytics; lists, mail to many and delivery reports are left and counted; the window ends where the
 * mailbox connected; what the owner sent is read before the rest (decision 0080); a part that runs out of time keeps its
 * place; a mailbox removed or signed out stops and says so.
 * The contacts come in through the one person door, only the lists the owner left ticked.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, HISTORY_BACK_DAYS, IMPORT_STOPPED_WORDS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { fieldsOf, linesOf } from "../../_log-lines.mjs";
import { MAILBOX_ENV, b64url, gmailReceived, liveCredentials, providers, vault, withEnv } from "./_mailbox-world.mjs";

const restore = withEnv(MAILBOX_ENV);
after(restore);
const { historyImports, startMailboxHistory } = await importSrc("apps/edge/lib/imports/history-import.ts");
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
after(() => setPg(null));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWN = "sam@getharbor.example";
const CONNECTED = "2026-10-20T15:00:00Z";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const PEOPLE = "https://people.googleapis.com/v1";
const SCOPES = {
  mail: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
  contacts: "https://www.googleapis.com/auth/contacts.readonly",
};

/**
 * The world a mailbox's history runs in: its row and token, the imports ledger as import_ledger_note keeps it, what
 * ingest_before was handed (a person new the first time an address is seen), resolve_person's people, and the threads
 * a reach-out started (`reached`), with the ones asked about.
 */
function world({
  box = {},
  credentials = liveCredentials("ya29.sam"),
  reached = [],
  contacts = [],
  messages = [],
  othersSaid = [],
} = {}) {
  const mailbox = rows.mailboxConnection({
    tenant_id: T,
    provider: "google",
    address: OWN,
    connected_at: CONNECTED,
    scopes: [...SCOPES.mail, SCOPES.contacts],
    ...box,
  });
  const v = vault(credentials ? { [mailbox.id]: credentials } : {});
  const kept = [];
  const people = [];
  const asked = [];
  const left = [];
  const tables = {
    mailbox_connections: [mailbox],
    imports: [],
    jobs: [],
    events: [],
    contacts: contacts.map((c) => ({
      tenant_id: T,
      erased_at: null,
      merged_into_contact_id: null,
      acquired_via: null,
      ...c,
    })),
    messages: messages.map((m) => ({ tenant_id: T, ...m })),
    mailbox_senders: [],
    mailbox_sender_reads: [],
    // What a stranger's reading asks (decision 0080): whether the model may answer for the workspace, its name and its
    // own words, and the model's ledger.
    tenants: [{ id: T, name: "Harbor Moving", status: "active", left_empty_at: null }],
    billing_accounts: [{ tenant_id: T, mode: "stripe", status: "trialing" }],
    business_records: [{ tenant_id: T, about: "Local and long-distance moves." }],
    tenant_config: [],
    ai_usage: [],
  };
  const db = fakeDb(
    tables,
    {},
    {
      ...v.rpcs,
      ingest_before: (a) => {
        const seen = kept.some((k) => k.p_external === a.p_external);
        kept.push(a);
        return {
          is_new: true,
          conversation_id: `c-${a.p_external}`,
          contact_id: `p-${a.p_external}`,
          person: seen ? "known" : "new",
        };
      },
      resolve_person: (a) => {
        const key = a.p_email || a.p_phone;
        const seen = people.some((p) => (p.p_email || p.p_phone) === key);
        people.push(a);
        return { contact_id: `p-${key}`, outcome: seen ? "matched" : "new" };
      },
      // 00483: one more email left from a sender, as the owner's list of them keeps it.
      mailbox_left_note: (a) => {
        left.push([a.p_address, a.p_why]);
        return null;
      },
      // 00495: whether three or more other workspaces' owners said the domain is automated.
      sender_domain_said_automated: (a) => othersSaid.includes(a.p_domain),
      // 00424: of the threads asked about, the ones holding an email this workspace sent.
      mailbox_threads_known: (a) => {
        asked.push(...a.p_thread_ids);
        return a.p_thread_ids.filter((t) => reached.includes(t));
      },
      import_ledger_note: (a) => {
        const i = tables.imports.findIndex((r) => r.tenant_id === a.p_tenant_id && r.source === a.p_source);
        const was = i >= 0 ? tables.imports[i] : null;
        const add = (from, to) => {
          const out = { ...(from ?? {}) };
          for (const [k, n] of Object.entries(to ?? {})) out[k] = (out[k] ?? 0) + n;
          return out;
        };
        const next = {
          tenant_id: a.p_tenant_id,
          source: a.p_source,
          state: a.p_state,
          counts: a.p_add ? add(was?.counts, a.p_counts) : (a.p_counts ?? {}),
          parts_done: a.p_parts_done ?? was?.parts_done ?? 0,
          oldest: a.p_oldest ?? was?.oldest ?? null,
          via: a.p_via ?? was?.via ?? null,
          job_cursor: a.p_cursor ?? was?.job_cursor ?? null,
          last_error: a.p_state === "failed" ? (a.p_error ?? null) : null,
        };
        if (i >= 0) tables.imports[i] = next;
        else tables.imports.push(next);
        return null;
      },
    },
  );
  return { db, tables, kept, people, asked, left, mailbox };
}

/** One part, as the job runner hands it: which try it is, as the claim counts them. */
const part = (w, source, n = 1, deadline = Date.now() + 30_000, attempts = 1) =>
  historyImports(w.db).part(
    {
      id: `job-${source}-${n}`,
      tenant_id: T,
      kind: "history_import",
      payload: { source, seq: `run:${n}`, connection_id: w.mailbox.id },
      attempts,
    },
    deadline,
  );
const ledger = (w, source) => w.tables.imports.find((r) => r.source === source);

/** Gmail's list of the window, a page of ids, and each message as users.messages.get answers it. */
const mail = (messages, next = null) => ({
  messages: messages.map((m) => ({ id: m.id, threadId: m.threadId })),
  ...(next ? { nextPageToken: next } : {}),
});

/** Gmail's list as a part's search asks it: what the mailbox sent (in:sent), the rest (-in:sent), or everything. */
const listedFor = (url, messages, next = null) => {
  const q = new URL(url).searchParams.get("q") ?? "";
  const sent = (m) => (m.labelIds ?? []).includes("SENT");
  if (q.includes("-in:sent"))
    return mail(
      messages.filter((m) => !sent(m)),
      next,
    );
  return q.includes("in:sent") ? mail(messages.filter(sent), next) : mail(messages, next);
};

/** A message the mailbox sent: Gmail's SENT label on it. */
const sentOne = (m) => ({ ...gmailReceived(m), labelIds: ["SENT"] });
const MESSAGES = {
  p1: gmailReceived({
    id: "p1",
    threadId: "t1",
    from: "Rosa Diaz <rosa@example.com>",
    to: OWN,
    subject: "Pianos?",
    messageId: "<p1@example.com>",
    text: "Do you move pianos?",
  }),
  o1: sentOne({
    id: "o1",
    threadId: "t1",
    from: `Sam <${OWN}>`,
    to: "rosa@example.com",
    subject: "Re: Pianos?",
    messageId: "<o1@getharbor.example>",
    text: "We do.",
  }),
  n1: gmailReceived({
    id: "n1",
    threadId: "t2",
    from: "Shop <news@shop.example>",
    to: OWN,
    subject: "Deals",
    messageId: "<n1@shop.example>",
    text: "20% off",
    headers: { "List-Unsubscribe": "<mailto:leave@shop.example>" },
  }),
  m1: sentOne({
    id: "m1",
    threadId: "t3",
    from: `Sam <${OWN}>`,
    to: "a@example.com, b@example.com",
    subject: "Party",
    messageId: "<m1@getharbor.example>",
    text: "All of you",
  }),
  d1: gmailReceived({
    id: "d1",
    threadId: "t4",
    from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
    to: OWN,
    subject: "Undeliverable",
    messageId: "<d1@googlemail.com>",
    text: "550",
  }),
};

test("a mailbox's six months: what a person wrote and what the owner wrote to one person kept as before Chanlytics, lists and mail to many and reports left and counted, the window ending where it connected", async () => {
  const w = world();
  const net = providers((c) => {
    if (c.url.startsWith(`${GMAIL}/messages?`)) return { json: listedFor(c.url, Object.values(MESSAGES)) };
    const id = /\/messages\/([a-z0-9]+)\?/.exec(c.url)?.[1];
    return id && MESSAGES[id] ? { json: MESSAGES[id] } : { status: 404 };
  });
  try {
    await part(w, "mailbox");
  } finally {
    net.restore();
  }
  // The window: six months before the mailbox connected, up to the moment it did (the live read starts there); what the
  // owner sent first, then the rest, drafts never (decision 0080).
  const lists = net.calls
    .filter((c) => c.url.startsWith(`${GMAIL}/messages?`))
    .map((c) => new URL(c.url).searchParams.get("q"));
  const to = Date.parse(CONNECTED) / 1000;
  const span = `after:${to - (HISTORY_BACK_DAYS * DAY_MS) / 1000} before:${to}`;
  assert.deepEqual(lists, [`${span} in:sent`, `${span} -in:sent -in:drafts`]);
  assert.equal(net.calls[0].headers.Authorization, "Bearer ya29.sam", "through the mailbox's own grant");
  assert.deepEqual(
    w.kept.map((k) => [k.p_external, k.p_direction, k.p_channel, k.p_body]),
    [
      ["rosa@example.com", "outbound", "email", "We do."],
      ["rosa@example.com", "inbound", "email", "Do you move pianos?"],
    ],
    "the owner's answer to that one person, read first, and the person's email, each in Rosa's thread",
  );
  assert.equal(w.kept[1].p_meta.email.claim, "person");
  assert.equal(w.kept[1].p_meta.source, "mailbox");
  // The list, the mail to many and the report are left on their headers: never read whole.
  const whole = net.calls
    .filter((c) => c.url.includes("format=full"))
    .map((c) => /\/messages\/(\w+)\?/.exec(c.url)?.[1]);
  assert.deepEqual(whole, ["o1", "p1"], "only what came in is read whole");
  const row = ledger(w, "mailbox");
  assert.equal(row.state, "done");
  assert.deepEqual(row.counts, { messages: 2, people: 1, dropped: 3 }, "the list, the mail to many and the report");
  assert.equal(row.via, "google");
  assert.ok(row.oldest, "how far back it reached");
  assert.equal(w.tables.jobs.length, 0, "done: no part after it");
});

test("an email with only HTML is kept with its words, as the live read keeps them: it is the person writing", async () => {
  // A client that writes HTML alone, a form: no text part. The six months kept such mail with no words, and its person
  // read "Not heard from" beside "They wrote" (the live walk, 27 Oct 2026).
  const alert = gmailReceived({
    id: "h1",
    threadId: "t9",
    from: "Dana Ruiz <dana@example.com>",
    to: OWN,
    subject: "A sofa",
    messageId: "<h1@example.com>",
  });
  alert.payload.mimeType = "text/html";
  alert.payload.body = {
    data: b64url(
      '<html><body><p>Can you move a <b>sofa</b> on Friday?</p><img src="https://example.com/t.gif"></body></html>',
    ),
  };
  const w = world();
  const net = providers((c) => {
    if (c.url.startsWith(`${GMAIL}/messages?`)) return { json: listedFor(c.url, [alert]) };
    return /\/messages\/h1\?/.test(c.url) ? { json: alert } : { status: 404 };
  });
  try {
    await part(w, "mailbox");
  } finally {
    net.restore();
  }
  assert.deepEqual(
    w.kept.map((k) => [k.p_external, k.p_direction, k.p_body]),
    [["dana@example.com", "inbound", "Can you move a sofa on Friday?"]],
    "its words, made plain text; nothing remote fetched for its image",
  );
  assert.equal(net.calls.filter((c) => c.url.includes("example.com/t.gif")).length, 0);
});

test("a part that runs out of time keeps its place in the page, and the next part picks up at the next message", async () => {
  const w = world();
  const realNow = Date.now;
  let late = false;
  const again = gmailReceived({
    id: "p2",
    threadId: "t1",
    from: "Rosa Diaz <rosa@example.com>",
    to: OWN,
    subject: "Re: Pianos?",
    messageId: "<p2@example.com>",
    text: "Great, Friday then.",
  });
  const all = { ...MESSAGES, p2: again };
  const net = providers((c) => {
    if (c.url.startsWith(`${GMAIL}/messages?`)) return { json: listedFor(c.url, [MESSAGES.p1, again, MESSAGES.o1]) };
    const id = /\/messages\/([a-z0-9]+)\?/.exec(c.url)?.[1];
    // The clock runs out as the first message of the rest is read.
    if (id === "p1") late = true;
    return id && all[id] ? { json: all[id] } : { status: 404 };
  });
  Date.now = () => (late ? realNow() + 120_000 : realNow());
  try {
    await part(w, "mailbox", 1, realNow() + 30_000);
  } finally {
    Date.now = realNow;
  }
  let row = ledger(w, "mailbox");
  assert.equal(row.state, "running");
  assert.deepEqual(
    [row.job_cursor.phase, row.job_cursor.page, row.job_cursor.at],
    ["received", null, 1],
    "the rest's first page, past its first message",
  );
  assert.equal(w.kept.length, 2, "the owner's answer, and the first of the rest");
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.payload.source, j.payload.seq]),
    [["mailbox", "run:2"]],
    "the next part, scheduled",
  );
  try {
    await part(w, "mailbox", 2);
  } finally {
    net.restore();
  }
  row = ledger(w, "mailbox");
  assert.equal(row.state, "done");
  assert.deepEqual(
    w.kept.map((k) => k.p_message_external_id),
    ["o1", "p1", "p2"],
    "each message once, the next picked up where the first part stopped",
  );
  assert.equal(
    net.calls.filter((c) => c.url.includes("/messages/p1?format=full")).length,
    1,
    "the first is not read again",
  );
});

test("a mailbox removed, or signed out, stops its history and says so on its row, with nothing scheduled after it", async () => {
  const removed = world({ box: { state: "removed" } });
  await part(removed, "mailbox");
  assert.deepEqual(
    [ledger(removed, "mailbox").state, ledger(removed, "mailbox").last_error],
    ["failed", IMPORT_STOPPED_WORDS.removed],
  );
  // Signed out: the list refused for good (401), the connection marked, the row says connect it again.
  const out = world();
  const net = providers((c) =>
    c.url.startsWith(`${GMAIL}/messages?`)
      ? { status: 401, json: { error: { status: "UNAUTHENTICATED" } } }
      : { status: 404 },
  );
  try {
    await part(out, "mailbox");
  } finally {
    net.restore();
  }
  assert.deepEqual(
    [ledger(out, "mailbox").state, ledger(out, "mailbox").last_error],
    ["failed", IMPORT_STOPPED_WORDS.signedOut],
  );
  assert.equal(out.tables.mailbox_connections[0].state, "reconnect", "the mailbox says it signed out");
  assert.equal(out.tables.jobs.length, 0);
  // A provider that could not be asked now is no stop: the job ledger asks again from the cursor.
  const busy = world();
  const down = providers(() => ({ status: 503, json: {} }));
  try {
    await assert.rejects(part(busy, "mailbox"), /could not be listed: 503/);
  } finally {
    down.restore();
  }
  assert.equal(ledger(busy, "mailbox").state, "running");
});

/** Gmail refusing one message's read; and a pace of requests, which Gmail says as a 403 too. */
const REFUSED = {
  status: 403,
  json: { error: { code: 403, status: "PERMISSION_DENIED", errors: [{ reason: "forbidden" }] } },
};
const PACED = { status: 403, json: { error: { code: 403, errors: [{ reason: "userRateLimitExceeded" }] } } };
/** Gmail's bad minute: no answer about the message at all. */
const DOWN = { status: 500, json: { error: { code: 500, errors: [{ reason: "backendError" }] } } };

/** The window's list, and each message as Gmail answers it, but the ids `odd` answers otherwise. */
const gmailWith = (listed, odd = {}) =>
  providers((c) => {
    if (c.url.startsWith(`${GMAIL}/messages?`)) return { json: listedFor(c.url, listed) };
    const id = /\/messages\/([a-z0-9]+)\?/.exec(c.url)?.[1];
    if (id && odd[id]) return odd[id];
    const m = listed.find((x) => x.id === id && x.payload);
    return m ? { json: m } : { status: 404 };
  });
const keptIds = (w) => w.kept.map((k) => k.p_message_external_id);

test("a message the mailbox refuses for good is counted, said and gone on without: the rest of the six months comes in", async () => {
  const w = world();
  const net = gmailWith([MESSAGES.p1, { id: "r1", threadId: "t9" }, MESSAGES.o1], { r1: REFUSED });
  let lines;
  try {
    ({ lines } = await linesOf(() => part(w, "mailbox")));
  } finally {
    net.restore();
  }
  assert.deepEqual(keptIds(w), ["o1", "p1"], "the rest kept, the refused one gone on without");
  const row = ledger(w, "mailbox");
  assert.equal(row.state, "done");
  assert.deepEqual(row.counts, { messages: 2, people: 1, dropped: 0, unreadable: 1 });
  assert.deepEqual(
    lines
      .filter((l) => l.event === "mailbox_message_unreadable")
      .map(fieldsOf)
      .map((l) => [l.message, l.stage, l.status, l.reason]),
    [["r1", "history", 403, "forbidden"]],
    "said, with Gmail's own reason",
  );
});

test("a part the provider stops part way notes what it brought and where it stood; the job ledger tries it again from there, and its last try says so on the row, with Try again", async () => {
  const w = world();
  const listed = [MESSAGES.p1, MESSAGES.o1, { id: "x1", threadId: "t8" }, MESSAGES.n1];
  const down = gmailWith(listed, { x1: DOWN });
  try {
    await assert.rejects(
      linesOf(() => part(w, "mailbox")),
      /cannot read message x1: 500 \(backendError\)/,
      "the error carries Gmail's own reason",
    );
  } finally {
    down.restore();
  }
  let row = ledger(w, "mailbox");
  assert.equal(row.state, "running", "a first try: the ledger tries it again");
  assert.deepEqual(row.counts, { messages: 2, people: 1, dropped: 0 }, "what came in before it stopped, counted");
  assert.deepEqual(
    [row.job_cursor.phase, row.job_cursor.at],
    ["received", 1],
    "where it stood: the message it could not read, among the rest",
  );
  // The try the ledger will not repeat: the row says it stopped, with Try again beside it.
  const last = gmailWith(listed, { x1: DOWN });
  try {
    await assert.rejects(
      linesOf(() => part(w, "mailbox", 1, undefined, 3)),
      /cannot read message x1: 500/,
    );
  } finally {
    last.restore();
  }
  row = ledger(w, "mailbox");
  assert.deepEqual([row.state, row.last_error], ["failed", IMPORT_STOPPED_WORDS.failed]);
  // Gmail answers again: read on from the message it stopped at, nothing kept or read twice.
  const again = gmailWith(listed);
  try {
    await part(w, "mailbox", 1, undefined, 2);
  } finally {
    again.restore();
  }
  row = ledger(w, "mailbox");
  assert.equal(row.state, "done");
  assert.deepEqual(keptIds(w), ["o1", "p1"]);
  assert.equal(
    again.calls.filter((c) => /\/messages\/(p1|o1)\?/.test(c.url)).length,
    0,
    "the first two not read again",
  );
  assert.deepEqual(row.counts, { messages: 2, people: 1, dropped: 1 }, "the list after it, dropped");
});

test("the mailbox's pace is no failure: the part notes where it stood and ends, and the next part reads on after a rest; one that read nothing rests ten minutes", async () => {
  // Three 403s on 26 Oct, each a different message every hundred or so reads: Gmail's pace, not the messages.
  const w = world();
  const listed = [MESSAGES.p1, MESSAGES.o1, { id: "x1", threadId: "t8" }, MESSAGES.n1];
  const paced = gmailWith(listed, { x1: PACED });
  const before = Date.now();
  let lines;
  try {
    ({ lines } = await linesOf(() => part(w, "mailbox")));
  } finally {
    paced.restore();
  }
  let row = ledger(w, "mailbox");
  assert.deepEqual([row.state, row.last_error], ["running", null], "no stop, and no try used");
  assert.deepEqual(row.counts, { messages: 2, people: 1, dropped: 0 });
  assert.deepEqual(
    [row.job_cursor.phase, row.job_cursor.at],
    ["received", 1],
    "where it stood: the message Gmail paced",
  );
  assert.deepEqual(
    w.tables.jobs.map((j) => j.payload.seq),
    ["run:2"],
    "the next part, scheduled",
  );
  const rest = Date.parse(w.tables.jobs[0].due_at) - before;
  assert.ok(rest >= 60_000 && rest < 70_000, `a minute's rest (${rest} ms)`);
  assert.deepEqual(
    lines
      .filter((l) => l.event === "history_part_paced")
      .map(fieldsOf)
      .map((l) => [l.status, l.reason, l.rest_ms]),
    [[403, "userRateLimitExceeded", 60_000]],
    "said, with Gmail's reason",
  );
  // Paced again before it read anything: a quota that has run out is not asked every minute.
  w.tables.jobs.length = 0;
  const still = gmailWith(listed, { x1: PACED });
  try {
    await linesOf(() => part(w, "mailbox", 2));
  } finally {
    still.restore();
  }
  const rested = Date.parse(w.tables.jobs[0].due_at) - Date.now();
  assert.ok(rested > 9 * 60_000, `ten minutes after a part that read nothing (${rested} ms)`);
  // Gmail answers: the next part reads on from the message it paced, nothing kept twice.
  w.tables.jobs.length = 0;
  const again = gmailWith(listed);
  try {
    await part(w, "mailbox", 3);
  } finally {
    again.restore();
  }
  row = ledger(w, "mailbox");
  assert.equal(row.state, "done");
  assert.deepEqual(keptIds(w), ["o1", "p1"]);
  assert.deepEqual(row.counts, { messages: 2, people: 1, dropped: 1 });
});

test("three messages refused in a row is the grant or the provider, not the messages: the part stops, and the next try reads the run again", async () => {
  const w = world();
  const run = ["r1", "r2", "r3"].map((id) => ({ id, threadId: "t9" }));
  const net = gmailWith([MESSAGES.p1, ...run, MESSAGES.o1], { r1: REFUSED, r2: REFUSED, r3: REFUSED });
  try {
    await assert.rejects(
      linesOf(() => part(w, "mailbox")),
      /refused 3 messages in a row/,
    );
  } finally {
    net.restore();
  }
  const row = ledger(w, "mailbox");
  assert.equal(row.state, "running");
  assert.deepEqual(row.counts, { messages: 2, people: 1, dropped: 0 }, "none of the run counted as unreadable");
  assert.deepEqual([row.job_cursor.phase, row.job_cursor.at], ["received", 1], "the run read again from its first");
});

test("mail from a no-reply sender is left and counted, however Google's reports and alerts spell it", async () => {
  const w = world();
  const robots = [
    "noreply-dmarc-support@google.com",
    "workspace-noreply@google.com",
    "The Google Accounts team <no-reply@accounts.google.com>",
    "no-reply-7uztp@mail.example.com",
  ].map((from, i) =>
    gmailReceived({
      id: `z${i}`,
      threadId: `tz${i}`,
      from,
      to: OWN,
      subject: "Report domain: getharbor.example",
      messageId: `<z${i}@example.com>`,
      text: "Automated.",
    }),
  );
  const net = gmailWith([...robots, MESSAGES.p1]);
  try {
    await part(w, "mailbox");
  } finally {
    net.restore();
  }
  assert.deepEqual(keptIds(w), ["p1"], "only what a person wrote");
  assert.deepEqual(ledger(w, "mailbox").counts, { messages: 1, people: 1, dropped: 4 });
});

// 27 Oct 2026: the six months brought a month of the platform's alerts in as one person, sent before they said what
// they are (#1858). A workspace whose own domain is not the platform's (#1870 leaves its own) would keep them so.
test("the six months leave the platform's own mail, which no header marks as automated, and count it", async () => {
  const w = world();
  const ALERTS = "alerts@chanlytics.example";
  const sender = withEnv({ LEAD_FROM: `Chanlytics <${ALERTS}>` });
  const alerts = ["A background sweep is not running", "New workspace: E2E probe 1", "Promo signup: a@example.com"].map(
    (subject, i) =>
      gmailReceived({
        id: `al${i}`,
        threadId: `tal${i}`,
        from: `Chanlytics <${ALERTS}>`,
        to: OWN,
        subject,
        messageId: `<al${i}@chanlytics.example>`,
        text: "Open it in the Inbox.",
      }),
  );
  const net = gmailWith([...alerts, MESSAGES.p1]);
  try {
    await part(w, "mailbox");
  } finally {
    net.restore();
    sender();
  }
  assert.deepEqual(keptIds(w), ["p1"], "only what a person wrote");
  assert.deepEqual(ledger(w, "mailbox").counts, { messages: 1, people: 1, dropped: 3 });
});

/** A received message with the labels Gmail filed it under. */
const filed = (labels, m) => ({ ...gmailReceived(m), labelIds: ["INBOX", ...labels] });

test("what came in as people on 26 and 27 Oct 2026 is left and counted: DMARC reports by their shape, Amazon's newsletter by its sender's name, social and forums by the tab Gmail filed them under", async () => {
  const w = world();
  const robots = [
    // None carries an automated header or a no-reply address.
    gmailReceived({
      id: "dm1",
      threadId: "tdm1",
      from: "DMARC Aggregate Report <dmarcreport@microsoft.com>",
      to: OWN,
      subject: "Report Domain: getharbor.example Submitter: protection.outlook.com Report-ID: 7d6c4a1e2b3f",
      messageId: "<dm1@microsoft.com>",
      text: "This is a DMARC aggregate report from Microsoft Corporation.",
    }),
    // Rackspace's, by its sender alone.
    gmailReceived({
      id: "dm2",
      threadId: "tdm2",
      from: "DMARC Report <dmarc_reports@reports.emailsrvr.com>",
      to: OWN,
      subject: "Aggregate report for getharbor.example",
      messageId: "<dm2@reports.emailsrvr.com>",
      text: "Attached.",
    }),
    filed(["CATEGORY_PROMOTIONS"], {
      id: "am1",
      threadId: "tam1",
      from: "Amazon.com <store-news@amazon.com>",
      to: OWN,
      subject: "Deals picked for you",
      messageId: "<am1@amazon.com>",
      text: "Today's deals.",
    }),
    filed(["CATEGORY_SOCIAL"], {
      id: "so1",
      threadId: "tso1",
      from: "Pat on Social <pat@social.example>",
      to: OWN,
      subject: "Pat tagged you",
      messageId: "<so1@social.example>",
      text: "See the photo.",
    }),
    filed(["CATEGORY_FORUMS"], {
      id: "fo1",
      threadId: "tfo1",
      from: "Movers Circle <circle@forum.example>",
      to: OWN,
      subject: "New topic: winter rates",
      messageId: "<fo1@forum.example>",
      text: "A new topic.",
    }),
  ];
  const net = gmailWith([...robots, MESSAGES.p1]);
  try {
    await part(w, "mailbox");
  } finally {
    net.restore();
  }
  assert.deepEqual(keptIds(w), ["p1"], "only what a person wrote");
  assert.deepEqual(ledger(w, "mailbox").counts, { messages: 1, people: 1, dropped: 5 });
  assert.deepEqual(
    w.asked,
    ["tso1", "tfo1", "t1"],
    "whether a reach-out started it, asked of a tab's message, and of a stranger's before anything reads them",
  );
  assert.deepEqual(
    w.left,
    [
      ["dmarcreport@microsoft.com", "automated"],
      ["dmarc_reports@reports.emailsrvr.com", "automated"],
      ["store-news@amazon.com", "automated"],
      ["pat@social.example", "gmail_tab"],
      ["circle@forum.example", "gmail_tab"],
    ],
    "each sender left is on the owner's list, with why",
  );
});

test("Gmail's tabs never leave a reply in a thread a reach-out started; under Updates a stranger's notice that answers nothing is left and listed, and a person the business talks with, or a reply, comes in; a person a notice made is no one it talks with", async () => {
  const w = world({
    reached: ["g-reach"],
    contacts: [
      // Rosa: added by hand. The vendor: made by its own notice, which the mailbox brought in before (30 Oct 2026).
      { id: "k-rosa", email: "rosa@example.com", acquired_via: "manual" },
      { id: "k-vend", email: "hello@vend.example", acquired_via: "import" },
    ],
    messages: [{ id: "m-vend", contact_id: "k-vend", channel: "email", direction: "inbound", sender: "customer" }],
  });
  const net = gmailWith([
    // A mailbox connected again reads back over its earlier connection's months, a reach-out's thread among them.
    filed(["CATEGORY_PROMOTIONS"], {
      id: "re1",
      threadId: "g-reach",
      from: "Owner <office@fixture-movers.example>",
      to: OWN,
      subject: "Re: A quick one",
      messageId: "<re1@fixture-movers.example>",
      text: "Sure, call me Thursday.",
    }),
    // Rosa is in People: Gmail filing her signed quote with the receipts leaves nothing.
    filed(["CATEGORY_UPDATES"], {
      id: "up1",
      threadId: "tup1",
      from: "Rosa Diaz <rosa@example.com>",
      to: OWN,
      subject: "Signed: moving quote",
      messageId: "<up1@example.com>",
      text: "Signed and sent back.",
    }),
    // An account's notice from a stranger, answering nothing, from an address with no program's word in it (Amazon's
    // account-update@ is automated by its name): left by the tab, and listed for the owner.
    filed(["CATEGORY_UPDATES"], {
      id: "up2",
      threadId: "tup2",
      from: "Fixture Bank <service@bank.example>",
      to: OWN,
      subject: "Your account",
      messageId: "<up2@bank.example>",
      text: "We updated your account.",
    }),
    // A stranger's reply under Updates answers something: it comes in.
    filed(["CATEGORY_UPDATES"], {
      id: "up3",
      threadId: "tup3",
      from: "Lee Park <lee@example.com>",
      to: OWN,
      subject: "Re: Your quote",
      messageId: "<up3@example.com>",
      text: "Yes, Tuesday works.",
      headers: { "In-Reply-To": "<quote-1@getharbor.example>" },
    }),
    // A notice from a sender a notice once made a person: no one the business talks with, so left as any stranger's.
    filed(["CATEGORY_UPDATES"], {
      id: "up4",
      threadId: "tup4",
      from: "Vend <hello@vend.example>",
      to: OWN,
      subject: "Your weekly summary",
      messageId: "<up4@vend.example>",
      text: "Here is your week.",
    }),
  ]);
  try {
    await part(w, "mailbox");
  } finally {
    net.restore();
  }
  assert.deepEqual(keptIds(w), ["re1", "up1", "up3"]);
  assert.deepEqual(ledger(w, "mailbox").counts, { messages: 3, people: 3, dropped: 2 });
  assert.deepEqual(
    w.left,
    [
      ["service@bank.example", "updates"],
      ["hello@vend.example", "updates"],
    ],
    "the notices are on the owner's list",
  );
  assert.deepEqual(
    w.asked,
    ["g-reach", "tup2", "tup3", "tup4"],
    "a reach-out's thread is asked of what a tab alone would leave, and of a stranger's reply before it is read",
  );
});

test("the six months read a stranger once and count who asked about the business: someone asking comes in, a pitch is left as selling to you, and a notice through a mailing service is left on its headers, never read whole or asked about", async () => {
  const key = withEnv({ ANTHROPIC_API_KEY: "sk-ant-made-up-for-this-file" });
  const w = world();
  setPg(w.db);
  const stranger = (id, from, text, extra = {}) =>
    gmailReceived({
      id,
      threadId: `t-${id}`,
      from,
      to: OWN,
      subject: "Hello",
      messageId: `<${id}@x.example>`,
      text,
      ...extra,
    });
  const listed = [
    stranger("ses1", "Fixture Host <team@host.example>", "A deployment failed.", {
      messageId: "<0101019a835dab19-000000@us-west-2.amazonses.com>",
    }),
    stranger("pi1", "Growth Team <growth@agency.example>", "We can double your reviews this month."),
    stranger("in1", "Lee Park <lee@example.com>", "Do you store furniture between moves?"),
    stranger("in2", "Lee Park <lee@example.com>", "And how much a month?"),
  ];
  const asks = [];
  const net = providers((c) => {
    if (c.url === "https://api.anthropic.com/v1/messages") {
      const user = JSON.parse(c.body).messages[0].content;
      asks.push(/^From: .*<([^>]+)>$/m.exec(user)?.[1]);
      const answer = user.includes("growth@agency.example")
        ? { kind: "pitch", about: "offers more reviews" }
        : { kind: "inquiry", about: "asked about storage between moves" };
      return {
        json: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-haiku-5-5",
          content: [{ type: "text", text: JSON.stringify(answer) }],
          stop_reason: "end_turn",
          usage: { input_tokens: 600, output_tokens: 30 },
        },
      };
    }
    if (c.url.startsWith(`${GMAIL}/messages?`)) return { json: listedFor(c.url, listed) };
    const id = /\/messages\/([a-z0-9]+)\?/.exec(c.url)?.[1];
    const m = listed.find((x) => x.id === id);
    return m ? { json: m } : { status: 404 };
  });
  try {
    await part(w, "mailbox");
  } finally {
    net.restore();
    key();
  }
  assert.deepEqual(keptIds(w), ["in1", "in2"], "the one who asked, both their emails");
  assert.deepEqual(ledger(w, "mailbox").counts, { messages: 2, people: 1, dropped: 2, asked: 1 });
  assert.deepEqual(
    w.left,
    [
      ["team@host.example", "service"],
      ["growth@agency.example", "pitch"],
    ],
    "each sender left on the owner's list, with why",
  );
  assert.deepEqual(asks, ["growth@agency.example", "lee@example.com"], "each stranger read once; the service never");
  assert.deepEqual(
    net.calls.filter((c) => c.url.includes("format=full")).map((c) => /\/messages\/(\w+)\?/.exec(c.url)?.[1]),
    ["pi1", "in1", "in2"],
    "the service's notice never read whole",
  );
  assert.deepEqual(
    w.tables.mailbox_sender_reads.map((r) => [r.address, r.kind]),
    [
      ["growth@agency.example", "pitch"],
      ["lee@example.com", "inquiry"],
    ],
  );
});

test("the mailbox's people: its own contacts, through the one person door, a page at a time; Google's other contacts never asked", async () => {
  const w = world();
  const net = providers((c) => {
    if (c.url.startsWith(`${PEOPLE}/people/me/connections`))
      return c.url.includes("pageToken=p2")
        ? {
            json: {
              connections: [{ names: [{ displayName: "Ben Ode" }], phoneNumbers: [{ value: "(305) 555-0102" }] }],
            },
          }
        : {
            json: {
              connections: [
                { names: [{ displayName: "Rosa Diaz" }], emailAddresses: [{ value: "Rosa@Example.com" }] },
                { names: [{ displayName: "Nobody" }], emailAddresses: [{ value: "not-an-address" }] },
              ],
              nextPageToken: "p2",
            },
          };
    return { status: 404 };
  });
  try {
    await part(w, "contacts");
  } finally {
    net.restore();
  }
  assert.deepEqual(
    w.people.map((p) => [p.p_email || null, p.p_phone || null, p.p_name || null, p.p_assurance, p.p_source]),
    [
      ["rosa@example.com", null, "Rosa Diaz", "asserted", "import"],
      [null, "+13055550102", "Ben Ode", "asserted", "import"],
    ],
    "an address that is none left out",
  );
  assert.equal(
    net.calls.filter((c) => c.url.includes("/otherContacts")).length,
    0,
    "everyone the owner ever wrote to is not People: the six months bring the ones they wrote to, with their threads",
  );
  const row = ledger(w, "contacts");
  assert.deepEqual([row.state, row.counts], ["done", { people: 2 }]);
});

test("a second mailbox adds what it brings to the first's: its first run keeps the workspace's counts and reads from a cursor of its own", async () => {
  // On 27 Oct 2026 a second mailbox connected and the Email card said 222 emails and 0 people: its runs had started the
  // workspace's rows afresh, and the first mailbox's 414 emails and 249 people were gone from them.
  const w = world();
  w.tables.imports.push(
    {
      tenant_id: T,
      source: "mailbox",
      state: "done",
      counts: { messages: 414, people: 34, dropped: 900 },
      parts_done: 9,
      oldest: "2026-06-07T00:00:00Z",
      via: "google",
      job_cursor: { connection: "first-box", window: { from: "2026-04-01T00:00:00Z", to: "2026-10-01T00:00:00Z" } },
      last_error: null,
    },
    {
      tenant_id: T,
      source: "contacts",
      state: "done",
      counts: { people: 249 },
      parts_done: 1,
      oldest: null,
      via: "google",
      job_cursor: { list: "contacts", page: null, connection: "first-box" },
      last_error: null,
    },
  );
  const quiet = { error() {}, warn() {}, info() {} };
  await startMailboxHistory(w.db, {
    tenantId: T,
    mailboxId: w.mailbox.id,
    provider: "google",
    scopes: [...SCOPES.mail, SCOPES.contacts],
    first: true,
    by: null,
    log: quiet,
  });
  for (const source of ["mailbox", "contacts"]) {
    const row = ledger(w, source);
    assert.deepEqual([row.state, row.parts_done, row.job_cursor], ["queued", 0, {}], `${source}: a run of its own`);
  }
  assert.deepEqual(
    ledger(w, "mailbox").counts,
    { messages: 414, people: 34, dropped: 900 },
    "the first's mail counted",
  );
  assert.deepEqual(ledger(w, "contacts").counts, { people: 249 }, "and its people");
  // The second mailbox's people come in on top of the first's.
  const net = providers((c) =>
    c.url.startsWith(`${PEOPLE}/people/me/connections`)
      ? {
          json: {
            connections: [{ names: [{ displayName: "Rosa Diaz" }], emailAddresses: [{ value: "rosa@example.com" }] }],
          },
        }
      : { status: 404 },
  );
  try {
    await part(w, "contacts");
  } finally {
    net.restore();
  }
  assert.deepEqual([ledger(w, "contacts").state, ledger(w, "contacts").counts], ["done", { people: 250 }]);
});

test("the mailbox's people: only the lists the owner left ticked are read, and with none ticked the row says how to bring them", async () => {
  const onlyMine = world({ box: { scopes: [...SCOPES.mail, SCOPES.contacts] } });
  const net = providers((c) =>
    c.url.startsWith(`${PEOPLE}/people/me/connections`) ? { json: { connections: [] } } : { status: 404 },
  );
  try {
    await part(onlyMine, "contacts");
  } finally {
    net.restore();
  }
  assert.equal(ledger(onlyMine, "contacts").state, "done");
  const none = world({ box: { scopes: SCOPES.mail } });
  await part(none, "contacts");
  assert.deepEqual(
    [ledger(none, "contacts").state, ledger(none, "contacts").last_error],
    ["failed", IMPORT_STOPPED_WORDS.notTicked("Your contacts")],
  );
});
