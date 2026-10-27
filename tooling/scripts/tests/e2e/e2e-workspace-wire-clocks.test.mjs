/**
 * The nightly's threads say when their person last wrote on each wire (conversation_channel_state, 00484): the clock the
 * reply window reads since 00485 (decision 0001, step 5), where it read conversations.last_wa_inbound_at before. The seed
 * writes its threads itself, past ingest_inbound, so it writes their clocks too. On 27 Oct 2026 it did not: Robin's thread,
 * re-dated in place, still held the clock 00484's backfill gave it the night before, its WhatsApp window read as shut, and
 * thread.spec.ts's reply waited on a Send that never came, four minutes a try, three tries, past the nightly's hour.
 * e2e-workspace.test.mjs holds the rest of the seed (it is at its length).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { DAY_MS } from "@chanlytics/contracts";
import { converge, PEOPLE, SLUG } from "../../ops/e2e-workspace.mjs";

const NOW = Date.parse("2026-09-14T09:00:00Z");
const [ROBIN] = PEOPLE;

/** A database in memory with what converge asks of one beside its tables: provision_tenant, the Vault and an auth admin. */
function seedDb() {
  const t = { tenants: [], memberships: [], lead_platform: [{ id: true, searches_on: false, tenants_on: [] }] };
  const users = [];
  const rows = (name) => (t[name] ??= []);
  const db = fakeDb(
    t,
    {},
    {
      provision_tenant: ({ p_tenant_id }) => {
        if (!rows("tenant_config").some((r) => r.tenant_id === p_tenant_id))
          rows("tenant_config").push({ tenant_id: p_tenant_id, config: {}, version: 1 });
        if (!rows("billing_accounts").some((r) => r.tenant_id === p_tenant_id))
          rows("billing_accounts").push({ tenant_id: p_tenant_id, mode: "stripe", status: "none" });
        return null;
      },
      get_google_credentials: () => null,
    },
  );
  db.auth = {
    admin: {
      listUsers: async ({ page }) => ({ data: { users: page === 1 ? users.map((u) => ({ ...u })) : [] }, error: null }),
      createUser: async ({ email }) => {
        const user = { id: crypto.randomUUID(), email };
        users.push(user);
        return { data: { user }, error: null };
      },
    },
  };
  return { db, t };
}

const night = (w, now) =>
  converge(w.db, { ownerEmail: "e2e-owner@example.com", memberEmail: "e2e-member@example.com", apply: true, now });

/** Each of the workspace's threads: its clocks by wire, and the latest its person wrote on each, from its messages. */
function clocksOf(t, T) {
  const mine = (table) => (t[table] ?? []).filter((r) => r.tenant_id === T);
  return mine("conversations").map((c) => {
    const wrote = {};
    for (const m of mine("messages"))
      if (m.conversation_id === c.id && m.direction === "inbound" && !(wrote[m.channel] >= m.created_at))
        wrote[m.channel] = m.created_at;
    const kept = Object.fromEntries(
      mine("conversation_channel_state")
        .filter((s) => s.conversation_id === c.id)
        .map((s) => [s.channel, s.last_inbound_at]),
    );
    return { thread: c, wrote, kept };
  });
}

test("every seeded thread keeps when its person last wrote on each wire, and WhatsApp's is the column's", async () => {
  const w = seedDb();
  const { tenantId: T } = await night(w, NOW);
  const threads = clocksOf(w.t, T);
  assert.equal(threads.length, 3, "Robin's, Sam's and Casey's");
  for (const { thread, wrote, kept } of threads) {
    assert.deepEqual(kept, wrote, `${thread.id}: one clock a wire its person wrote on, at their latest`);
    assert.equal(kept.whatsapp, thread.last_wa_inbound_at, "the reply window reads what the column says");
  }
});

test("the next night's clocks are that night's: a thread re-dated in place leaves no clock of the night before", async () => {
  const w = seedDb();
  const { tenantId: T } = await night(w, NOW);
  assert.equal(w.t.tenants.find((x) => x.id === T)?.slug, SLUG);
  const robin = w.t.contacts.find((c) => c.tenant_id === T && c.phone_e164 === ROBIN.phone);
  const robins = w.t.conversations.find((c) => c.tenant_id === T && c.contact_id === robin.id);
  // What 00484's backfill wrote for Robin's thread on production: the night before's WhatsApp, and a wire a spec left.
  w.t.conversation_channel_state = w.t.conversation_channel_state.filter((s) => s.conversation_id !== robins.id);
  for (const channel of ["whatsapp", "sms"])
    w.t.conversation_channel_state.push({
      id: crypto.randomUUID(),
      tenant_id: T,
      conversation_id: robins.id,
      channel,
      last_inbound_at: new Date(NOW - DAY_MS).toISOString(),
    });

  await night(w, NOW + DAY_MS);
  const again = clocksOf(w.t, T).find(({ thread }) => thread.id === robins.id);
  assert.ok(again, "Robin's thread is the same thread, re-dated");
  assert.deepEqual(again.kept, { whatsapp: again.thread.last_wa_inbound_at }, "tonight's WhatsApp, and nothing else");
  assert.ok(Date.parse(again.kept.whatsapp) > NOW, "inside the window tonight, as the column is");
});

test("the clocks a run replaces are in its backup, taken before it writes", async () => {
  const w = seedDb();
  await night(w, NOW);
  const kept = w.t.conversation_channel_state.map((s) => s.id);
  let backedUp = [];
  await converge(w.db, {
    ownerEmail: "e2e-owner@example.com",
    memberEmail: "e2e-member@example.com",
    apply: true,
    now: NOW + DAY_MS,
    backup: async (rows) => {
      backedUp = rows;
    },
  });
  assert.deepEqual(
    backedUp
      .filter((r) => r.table === "conversation_channel_state")
      .map((r) => r.row.id)
      .sort(),
    kept.sort(),
  );
});
