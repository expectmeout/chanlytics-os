/**
 * A connected mailbox's six months and its people (decision 0073, R19; apps/edge/lib/imports/mail-history.ts and
 * mail-people.ts), run as the job runner runs a part (history-import.ts historyImports) over a database in memory, with
 * Gmail and Google's People API answered by the test. What a person wrote, and what the owner wrote to one person, is
 * kept as before Chanlytics; lists, mail to many and delivery reports are left and counted; the window ends where the
 * mailbox connected; a part that runs out of time keeps its place; a mailbox removed or signed out stops and says so.
 * The contacts come in through the one person door, only the lists the owner left ticked.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, HISTORY_BACK_DAYS, IMPORT_STOPPED_WORDS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { MAILBOX_ENV, gmailReceived, liveCredentials, providers, vault, withEnv } from "./_mailbox-world.mjs";

const restore = withEnv(MAILBOX_ENV);
after(restore);
const { historyImports } = await importSrc("apps/edge/lib/imports/history-import.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWN = "sam@getharbor.example";
const CONNECTED = "2026-10-20T15:00:00Z";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const PEOPLE = "https://people.googleapis.com/v1";
const SCOPES = {
  mail: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
  contacts: "https://www.googleapis.com/auth/contacts.readonly",
  other: "https://www.googleapis.com/auth/contacts.other.readonly",
};

/**
 * The world a mailbox's history runs in: its row and token, the imports ledger as import_ledger_note keeps it, what
 * ingest_before was handed (a person new the first time an address is seen), and resolve_person's people.
 */
function world({ box = {}, credentials = liveCredentials("ya29.sam") } = {}) {
  const mailbox = rows.mailboxConnection({
    tenant_id: T,
    provider: "google",
    address: OWN,
    connected_at: CONNECTED,
    scopes: [...SCOPES.mail, SCOPES.contacts, SCOPES.other],
    ...box,
  });
  const v = vault(credentials ? { [mailbox.id]: credentials } : {});
  const kept = [];
  const people = [];
  const tables = { mailbox_connections: [mailbox], imports: [], jobs: [], events: [] };
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
  return { db, tables, kept, people, mailbox };
}

/** One part, as the job runner hands it. */
const part = (w, source, n = 1, deadline = Date.now() + 30_000) =>
  historyImports(w.db).part(
    {
      id: `job-${source}-${n}`,
      tenant_id: T,
      kind: "history_import",
      payload: { source, seq: `run:${n}`, connection_id: w.mailbox.id },
    },
    deadline,
  );
const ledger = (w, source) => w.tables.imports.find((r) => r.source === source);

/** Gmail's list of the window, a page of ids, and each message as users.messages.get answers it. */
const mail = (messages, next = null) => ({
  messages: messages.map((m) => ({ id: m.id, threadId: m.threadId })),
  ...(next ? { nextPageToken: next } : {}),
});
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
  o1: gmailReceived({
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
  m1: gmailReceived({
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
    if (c.url.startsWith(`${GMAIL}/messages?`)) return { json: mail(Object.values(MESSAGES)) };
    const id = /\/messages\/([a-z0-9]+)\?/.exec(c.url)?.[1];
    return id && MESSAGES[id] ? { json: MESSAGES[id] } : { status: 404 };
  });
  try {
    await part(w, "mailbox");
  } finally {
    net.restore();
  }
  // The window: six months before the mailbox connected, up to the moment it did (the live read starts there).
  const list = new URL(net.calls.find((c) => c.url.startsWith(`${GMAIL}/messages?`)).url);
  const to = Date.parse(CONNECTED) / 1000;
  assert.equal(list.searchParams.get("q"), `after:${to - (HISTORY_BACK_DAYS * DAY_MS) / 1000} before:${to}`);
  assert.equal(net.calls[0].headers.Authorization, "Bearer ya29.sam", "through the mailbox's own grant");
  assert.deepEqual(
    w.kept.map((k) => [k.p_external, k.p_direction, k.p_channel, k.p_body]),
    [
      ["rosa@example.com", "inbound", "email", "Do you move pianos?"],
      ["rosa@example.com", "outbound", "email", "We do."],
    ],
    "the person's email, and the owner's answer to that one person, each in Rosa's thread",
  );
  assert.equal(w.kept[0].p_meta.email.claim, "person");
  assert.equal(w.kept[0].p_meta.source, "mailbox");
  const row = ledger(w, "mailbox");
  assert.equal(row.state, "done");
  assert.deepEqual(row.counts, { messages: 2, people: 1, dropped: 3 }, "the list, the mail to many and the report");
  assert.equal(row.via, "google");
  assert.ok(row.oldest, "how far back it reached");
  assert.equal(w.tables.jobs.length, 0, "done: no part after it");
});

test("a part that runs out of time keeps its place in the page, and the next part picks up at the next message", async () => {
  const w = world();
  const realNow = Date.now;
  let late = false;
  const net = providers((c) => {
    if (c.url.startsWith(`${GMAIL}/messages?`)) return { json: mail([MESSAGES.p1, MESSAGES.o1]) };
    const id = /\/messages\/([a-z0-9]+)\?/.exec(c.url)?.[1];
    // The clock runs out as the first message is read.
    if (id === "p1") late = true;
    return id && MESSAGES[id] ? { json: MESSAGES[id] } : { status: 404 };
  });
  Date.now = () => (late ? realNow() + 120_000 : realNow());
  try {
    await part(w, "mailbox", 1, realNow() + 30_000);
  } finally {
    Date.now = realNow;
  }
  let row = ledger(w, "mailbox");
  assert.equal(row.state, "running");
  assert.deepEqual([row.job_cursor.page, row.job_cursor.at], [null, 1], "the first page, past its first message");
  assert.equal(w.kept.length, 1);
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
    ["p1", "o1"],
    "each message once, the second picked up where the first part stopped",
  );
  assert.equal(net.calls.filter((c) => c.url.includes("/messages/p1?")).length, 1, "the first is not read again");
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

test("the mailbox's people: its contacts and the people it wrote to, through the one person door, a page at a time, never the mailbox's own address", async () => {
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
    if (c.url.startsWith(`${PEOPLE}/otherContacts`))
      return {
        json: {
          otherContacts: [
            { emailAddresses: [{ value: OWN }, { value: "kim@example.com" }] },
            { emailAddresses: [{ value: "rosa@example.com" }] },
          ],
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
      ["kim@example.com", null, null, "asserted", "import"],
      ["rosa@example.com", null, null, "asserted", "import"],
    ],
    "an address that is none left out; the mailbox's own never a person; Rosa matched the second time",
  );
  const row = ledger(w, "contacts");
  assert.deepEqual([row.state, row.counts], ["done", { people: 3 }]);
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
  assert.equal(
    net.calls.filter((c) => c.url.startsWith(`${PEOPLE}/otherContacts`)).length,
    0,
    "other contacts left unticked: never asked",
  );
  assert.equal(ledger(onlyMine, "contacts").state, "done");
  const none = world({ box: { scopes: SCOPES.mail } });
  await part(none, "contacts");
  assert.deepEqual(
    [ledger(none, "contacts").state, ledger(none, "contacts").last_error],
    ["failed", IMPORT_STOPPED_WORDS.notTicked("Your contacts")],
  );
});
