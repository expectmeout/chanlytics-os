/**
 * The server reads the configuration whole for every member, as the database leaves it after 00365 (executed over the
 * database in memory).
 *
 * The calendar feed's address grants read access to the owner's calendar, so from 00365 only the owner's session reads
 * the tenant_config row; every other member reads it through tenant_config_read, which masks the address and says so
 * (00364). The server still needs the address for them: the Calendar and the receptionist's openings read the feed, and
 * a save writes the whole column back, so a masked one would be fetched as a feed or saved over the real one.
 * workspace/config-row.ts reads the table first, the door where the table answers nothing, and the row again with the
 * service role where the door hid the address. Proved here on configRowOf itself, and on a partner's settings read and
 * save through the route: shown the address masked, and the save keeping the stored one, written through
 * tenant_config_write since the table's own update finds no row the partner cannot read. The doors' own rules are
 * proved on a real database in the-feed-address-is-the-owner-s.db.test.mjs.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { configRowOf } = await import(at("apps/dashboard/src/server/workspace/config-row.ts"));
const settings = await import(at("apps/dashboard/app/api/v1/settings/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const FEED = "https://calendar.example.com/private/abcdef123456/basic.ics";
const MASK = `${FEED.slice(0, 24)}…${FEED.slice(-6)}`;

/** A door's answer as supabase-js hands it back, with the `.maybeSingle()` the callers chain. */
const answer = (data, error = null) => {
  const p = Promise.resolve({ data, error });
  return Object.assign(p, { maybeSingle: () => p, single: () => p });
};
const NO_DOOR = { code: "PGRST202", message: "Could not find the function public.tenant_config_read" };

/**
 * A member's session as 00365 leaves it for anyone but the owner: every table as the world holds it but tenant_config,
 * which shows no row, and the two doors over the world's own row: the read masks the address and says so (as the SQL
 * does, checked against it on a stack), the write is the versioned compare-and-swap, recorded as the caller's.
 */
function sessionPast00365(tables, { door = "masks" } = {}) {
  const sb = fakeDb({ ...tables, tenant_config: [] });
  const rowOf = (id) => tables.tenant_config.find((r) => r.tenant_id === id) ?? null;
  const asked = [];
  return {
    from: sb.from,
    seen: sb.seen,
    asked,
    rpc(name, args) {
      asked.push(name);
      if (name === "tenant_config_read") {
        if (door === "missing") return answer(null, NO_DOOR);
        const row = rowOf(args.p_tenant_id);
        if (!row || door === "stranger") return answer(null);
        const url = row.config?.calendar?.ical_url;
        const hidden = typeof url === "string";
        const config = hidden ? { ...row.config, calendar: { ...row.config.calendar, ical_url: MASK } } : row.config;
        return answer({ ...row, updated_by: row.updated_by ?? null, config, feed_hidden: hidden });
      }
      if (name === "tenant_config_write") {
        const row = rowOf(args.p_tenant_id);
        if (!row) return answer({ outcome: "missing", version: null, updated_at: null, updated_by: null });
        if (row.version !== args.p_version)
          return answer({ outcome: "stale", version: null, updated_at: null, updated_by: null });
        Object.assign(row, { config: args.p_config, version: args.p_version + 1, updated_by: USER });
        row.updated_at = "2026-10-09T12:00:00Z";
        return answer({ outcome: "saved", version: row.version, updated_at: row.updated_at, updated_by: USER });
      }
      return sb.rpc(name, args);
    },
  };
}

/** The service role over the world, which reads every row whole; `refuse` stands for a call that must not be made. */
function serviceOver(tables, { refuse = false } = {}) {
  const sb = fakeDb(tables);
  if (!refuse) return sb;
  return {
    ...sb,
    from() {
      throw new Error("the service role was asked for a row the session read whole");
    },
  };
}

const worldWithFeed = (role) => ({
  memberships: [{ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  tenant_config: [
    {
      tenant_id: A,
      config: { calendar: { ical_url: FEED } },
      version: 3,
      updated_at: "2026-09-01T00:00:00Z",
      updated_by: null,
    },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
  tenant_channels: [],
  google_listings: [],
  events: [],
});

test("a session that reads the row whole (the owner's, or anyone's before 00365) is answered by the table, once, and nobody else is asked", async () => {
  const tables = worldWithFeed("owner");
  setServiceClient(serviceOver(tables, { refuse: true }));
  const sb = fakeDb(tables);
  const row = await configRowOf(sb, A);
  assert.equal(row.config.calendar.ical_url, FEED);
  assert.equal(row.version, 3);
  assert.deepEqual(
    sb.seen.map((q) => q.rpc ?? `${q.table}.${q.op}`),
    ["tenant_config.select"],
  );
});

test("a member the table shows nothing reads through the door; where it hid the feed's address the server reads the row whole with the service role, and where it hid nothing it is not asked", async () => {
  const tables = worldWithFeed("partner");
  setServiceClient(serviceOver(tables));
  const session = sessionPast00365(tables);
  const row = await configRowOf(session, A);
  assert.deepEqual(
    [row.config.calendar.ical_url, row.version, session.asked],
    [FEED, 3, ["tenant_config_read"]],
    "the address whole, for the server's own reads",
  );

  const plain = worldWithFeed("viewer");
  plain.tenant_config[0].config = { notes: "no calendar" };
  setServiceClient(serviceOver(plain, { refuse: true }));
  const bare = await configRowOf(sessionPast00365(plain), A);
  assert.deepEqual(bare.config, { notes: "no calendar" }, "no address: the door's row is the row");
});

test("no row at all, a session of no member of the workspace, and a database before 00364 are each no row: the service role is never asked", async () => {
  const tables = worldWithFeed("viewer");
  setServiceClient(serviceOver(tables, { refuse: true }));
  assert.equal(await configRowOf(sessionPast00365(tables, { door: "stranger" }), A), null, "not a member");
  assert.equal(await configRowOf(sessionPast00365(tables, { door: "missing" }), A), null, "before 00364");
  assert.equal(await configRowOf(sessionPast00365({ ...tables, tenant_config: [] }), A), null, "no row");
});

test("a partner's settings read and save as 00365 leaves the database: shown the address masked, the save keeps the stored one, and it is written through tenant_config_write", async () => {
  const tables = worldWithFeed("partner");
  const ctx = () => {
    setServiceClient(serviceOver(tables));
    return { supabase: sessionPast00365(tables), userId: USER, email: "ada@example.com", aal: "aal2", params: {} };
  };
  const read = await settings.GET.run(new Request(`http://localhost/api/v1/x?workspace=${A}`), ctx());
  assert.equal(read.config.calendar.ical_url, MASK, "a partner is shown the address masked, as before");
  assert.equal(read.version, 3);

  const saving = ctx();
  const saved = await settings.PUT.run(
    new Request(`http://localhost/api/v1/x?workspace=${A}`, {
      method: "PUT",
      body: JSON.stringify({ config: read.config, version: 3 }),
    }),
    saving,
  );
  assert.equal(saved.config.calendar.ical_url, MASK, "the answer does not hand the address over");
  assert.equal(saved.version, 4);
  const [row] = tables.tenant_config;
  assert.deepEqual(
    [row.config.calendar.ical_url, row.version, row.updated_by],
    [FEED, 4, USER],
    "REGRESSION: the mask was saved over the owner's feed, or the save found no row to write",
  );
  assert.ok(saving.supabase.asked.includes("tenant_config_write"), "written through the door");
  assert.equal(
    saving.supabase.seen.filter((q) => q.table === "tenant_config" && q.op === "update").length,
    1,
    "after the table's own update, which found nothing",
  );
});
