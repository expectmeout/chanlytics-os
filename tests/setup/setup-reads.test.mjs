/**
 * What Setup reads to say where a workspace stands, and when (server/workspace/setup.ts): one wave, and nothing twice.
 *
 * Three things it did until 9 Oct 2026, each run here through the real assembly over a database in memory, with the
 * edge and the calendar's feed scripted:
 *   - whether the email wire can send was asked of the edge after the last of Setup's reads had answered, so the whole
 *     page stood behind an answer a deployment waits up to four seconds for; it is asked with the first of them;
 *   - the calendar's row, which says whether the link reads and names nobody, read everyone in People, and read the
 *     settings a second time behind the workspace's row; it reads nobody, and takes the settings Setup read;
 *   - the workspace's mailbox was read by each of the three that want it (the email line, the calendar's notices, the
 *     offers' count); it is read once.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EMAIL_DOMAIN = "mail.example.com";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { setupDtoFor } = await importSrc("apps/dashboard/src/server/workspace/setup.ts");
const { forgetFeeds } = await importSrc("apps/dashboard/src/server/ask/openings.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-09-07T15:00:00Z");
const FEED = "https://calendar.example.com/harbor.ics";
const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:a1",
  "SUMMARY:Ana Ruiz · Balayage",
  "DESCRIPTION:Ana Ruiz +1 (917) 555-0100",
  "DTSTART;TZID=America/New_York:20260908T140000",
  "DTEND;TZID=America/New_York:20260908T153000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

/** A workspace with a calendar link, a booking tool named, an address on file and a mailbox whose offers may go. */
const tables = () => ({
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  tenant_config: [
    {
      tenant_id: T,
      config: {
        calendar: { ical_url: FEED },
        bookings: { tool: "booksy" },
        brain: {
          business_name: "Harbor",
          system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: { address: "12 Harbor Road, Example City" },
        },
      },
    },
  ],
  mailboxes: [
    {
      id: "mb-1",
      tenant_id: T,
      local_part: "harbor",
      from_name: "Harbor",
      reply_token: "a".repeat(24),
      last_received_at: null,
      last_error: null,
    },
  ],
});
/** People is a door Setup has no business at: a call fails the read that made it, and is in `seen` all the same. */
const doors = () => ({
  people_list: () => {
    throw new Error("Setup read everyone in People");
  },
  offers_email_reach: () => 12,
});
const asked = (db) => db.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`));

const real = globalThis.fetch;
after(() => (globalThis.fetch = real));
/** The network: the calendar's feed, the edge's email door (held where a test holds it), and every other door saying no. */
function network({ wire = Promise.resolve() } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    calls.push(u.pathname);
    if (String(url) === FEED) return new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (u.pathname !== "/api/admin/email/wire") return json(404, { error: "not_found" });
    await wire;
    return json(200, { ok: true, ready: true, offers: true });
  };
  forgetFeeds();
  return calls;
}
/** A database whose reads of one table are not answered until `open()`. */
function heldAt(db, table) {
  let open;
  const gate = new Promise((go) => (open = go));
  const from = db.from.bind(db);
  db.from = (t) => {
    const q = from(t);
    if (t !== table) return q;
    for (const answer of ["then", "single", "maybeSingle"]) {
      const was = q[answer].bind(q);
      q[answer] = (...args) => gate.then(() => was(...args));
    }
    return q;
  };
  return open;
}
/** Long enough for every read that waits on nothing held to have been asked. */
const idle = async () => {
  for (let i = 0; i < 25; i++) await new Promise((go) => setImmediate(go));
};

// First in the file: the edge's answer is kept by the deployment once it is a yes, and this is the asking of it.
test("whether the email wire can send is asked of the edge with Setup's first reads, not after the last of them: with one of those reads still out, the edge has been asked; and its slow answer holds no read of Setup's back", async () => {
  // A read of Setup's first wave is out, and the edge has already been asked.
  const db = fakeDb(tables(), {}, doors());
  const open = heldAt(db, "tenant_channels");
  let release;
  const calls = network({ wire: new Promise((go) => (release = go)) });
  let answered = false;
  const waiting = setupDtoFor(db, T, { kind: "back_office" }, NOW).then((s) => ((answered = true), s));
  await idle();
  assert.equal(answered, false);
  assert.ok(
    calls.includes("/api/admin/email/wire"),
    `REGRESSION: the edge is asked whether email can send only once every read of Setup's has answered (asked: ${calls.join(", ")})`,
  );
  // The edge still has not answered, and every other read has reached the database.
  open();
  await idle();
  assert.equal(answered, false, "Setup waits for the offers' count, which waits for the edge");
  for (const read of ["tenant_config.select", "tenant_channels.select", "templates.select", "contacts.select"])
    assert.ok(asked(db).includes(read), `${read} did not wait for the edge`);
  assert.ok(!asked(db).includes("rpc:offers_email_reach"), "the count is asked for once the edge says offers can go");
  release();
  const setup = await waiting;
  assert.equal(
    setup.consent.offers_by_email,
    12,
    "the count, where the wire can send, the address is on file and offers are not paused",
  );
});

test("Setup's calendar row says whether the link reads, and reads nobody for it: no one in People, the settings once (Setup's own read of them) and the workspace's row once", async () => {
  const db = fakeDb(tables(), {}, doors());
  network();
  const setup = await setupDtoFor(db, T, { kind: "back_office" }, NOW);
  assert.deepEqual(
    [setup.calendar.state, setup.calendar.problem, setup.calendar.tool],
    ["ok", null, "booksy"],
    "the link reads, and the tool is the one the owner named",
  );
  const reads = asked(db);
  assert.ok(
    !reads.includes("rpc:people_list") && !reads.includes("policies.select"),
    "REGRESSION: every Setup of a workspace with a calendar link read everyone in People, to match a week nobody is shown",
  );
  assert.equal(
    reads.filter((r) => r === "tenant_config.select").length,
    1,
    "REGRESSION: the calendar's lookup read the settings Setup had just read",
  );
  assert.equal(reads.filter((r) => r === "tenants.select").length, 1, "the zone, beside the settings");
  assert.ok(!reads.includes("appointments.select"), "and nothing of the record's visits: where it stands, no more");
});

test("the workspace's mailbox is read once for the three that want it: the email line, the address the booking tool's emails go to, and the offers' count", async () => {
  const db = fakeDb(tables(), {}, doors());
  network();
  const setup = await setupDtoFor(db, T, { kind: "back_office" }, NOW);
  assert.equal(
    asked(db).filter((r) => r === "mailboxes.select").length,
    1,
    "REGRESSION: one row, read three times on every Setup",
  );
  assert.equal(setup.email.mailbox.address, "harbor@mail.example.com", "the email line's");
  assert.equal(setup.calendar.emails.address, true, "the notices' address");
  assert.equal(setup.consent.offers_by_email, 12, "and the offers' count's, whose pause it holds");

  // A mailbox that cannot be read fails Setup, as it did: the email line is not "none" because a read failed.
  const down = fakeDb(tables(), { "mailboxes.select": { message: "permission denied" } }, doors());
  network();
  await assert.rejects(setupDtoFor(down, T, { kind: "back_office" }, NOW), /mailbox: permission denied/);

  // No mailbox made: the line says so, the notices offer the address the name would give, and no offer is counted.
  const none = fakeDb({ ...tables(), mailboxes: [] }, {}, doors());
  network();
  const bare = await setupDtoFor(none, T, { kind: "back_office" }, NOW);
  assert.deepEqual(
    [bare.email.mailbox, bare.calendar.emails.address, bare.consent.offers_by_email],
    [null, false, undefined],
  );
  assert.equal(asked(none).filter((r) => r === "mailboxes.select").length, 1);
});
