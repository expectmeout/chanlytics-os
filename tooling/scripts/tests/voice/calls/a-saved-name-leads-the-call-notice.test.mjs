/**
 * The owner's notice of an analysed call names the caller as the dashboard does: the saved contact's name first.
 *
 * "Emily phoned · 3 min" is the bell row and the mail's subject, and it led with the name the caller SPOKE (the
 * analysis's caller_name: the agent's free text) over the name the owner saved for that number, where every page names
 * the caller by the person (contracts callerName: their name, their WhatsApp name, then the number). So the bell said
 * "Rosa" and the Calls page said "Ana Reyes" for the same call. The saved name wins now; what they said is the fallback
 * for a caller nobody saved, and the number after that. Run through the real door, over a database in memory.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { openDoor, wire, CALLER } from "./_retell-webhook-world.mjs";

// The door reads its keys at import; each test file is its own process, so this is the whole environment.
process.env.RETELL_WEBHOOK_KEY = "badged-key-for-this-file";
process.env.RETELL_API_KEY = "api-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg, deliver, world } = await openDoor();
after(() => setPg(null));

/**
 * The database as it is, except that the read of a contact's NAME fails: the erasure check reads the same table and must
 * still answer, so only the select that asks for the name is the one that is down.
 */
function nameReadDown(db, tables) {
  const down = fakeDb(tables, { "contacts.select": { message: "contacts are down" } });
  const from = db.from.bind(db);
  db.from = (table) => {
    const builder = from(table);
    if (table !== "contacts") return builder;
    return new Proxy(builder, {
      get(target, key) {
        if (key === "select")
          return (cols, ...rest) =>
            String(cols).includes("wa_profile_name")
              ? down.from(table).select(cols, ...rest)
              : target.select(cols, ...rest);
        const v = target[key];
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  };
}

/** A workspace whose caller is saved as `saved` (columns of the contact), and an analysed call in which they gave `spoken`. */
async function noticeFor({ saved, spoken, unreadable = false }) {
  const w = world();
  w.tables.tenant_config.push({
    tenant_id: w.T,
    config: { notifications: { escalation_emails: ["owner@harbor.test"] } },
  });
  if (saved) w.tables.contacts.push({ id: crypto.randomUUID(), tenant_id: w.T, phone_e164: CALLER, ...saved });
  const db = w.open();
  if (unreadable) nameReadDown(db, w.tables);
  const line = wire();
  try {
    const id = w.callId("named");
    const call = w.analysed(id);
    call.call_analysis.custom_analysis_data.caller_name = spoken;
    const res = await deliver("call_analyzed", call);
    assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);
    assert.equal(w.tables.notifications.length, 1, "the owner is told once");
    return { bell: w.tables.notifications[0].title, mail: line.mail()[0].subject };
  } finally {
    line.restore();
  }
}

test("the saved name leads the bell row and the mail: the person's name, else their WhatsApp name, over what the caller said", async () => {
  const named = await noticeFor({ saved: { display_name: "Ana Reyes", wa_profile_name: "ana" }, spoken: "Rosa" });
  assert.equal(named.bell, "Ana Reyes phoned · 2 min", "was 'Rosa phoned', the spoken name over the saved one");
  assert.equal(named.mail, "Ana Reyes phoned · 2 min", "the mail's subject is the bell's words");

  const whatsapp = await noticeFor({ saved: { display_name: null, wa_profile_name: "Ana R" }, spoken: "Rosa" });
  assert.equal(whatsapp.bell, "Ana R phoned · 2 min", "their WhatsApp name is the saved name when they have no other");
});

test("with no saved name the caller's own word stands, then the number: nothing is guessed", async () => {
  const unnamed = await noticeFor({ saved: { display_name: null, wa_profile_name: null }, spoken: "Rosa" });
  assert.equal(unnamed.bell, "Rosa phoned · 2 min", "a person on file with no name: what they said");
  const stranger = await noticeFor({ spoken: "Rosa" });
  assert.equal(stranger.bell, "Rosa phoned · 2 min", "nobody on file: what they said, as before");
  const silent = await noticeFor({ spoken: "" });
  assert.equal(silent.bell, "+1 (646) 555-0123 phoned · 2 min", "no name anywhere: the number, formatted");
});

test("a name that cannot be read never costs the owner their notice: it falls back to what they said", async () => {
  const unread = await noticeFor({
    saved: { display_name: "Ana Reyes", wa_profile_name: null },
    spoken: "Rosa",
    unreadable: true,
  });
  assert.equal(unread.bell, "Rosa phoned · 2 min", "the bell still rang, and by the old rule");
  assert.equal(unread.mail, "Rosa phoned · 2 min");
});
