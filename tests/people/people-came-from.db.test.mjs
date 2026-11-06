/**
 * People says where each person came from -- decided once, in SQL (00138).
 *
 * The page, the profile and every other reader of people_list say the same
 * thing because the rule lives in the function: the door that added them wins
 * (the calendar, a lead, a hand), then how a history moved in from before the
 * database began, then their first spoken event -- a call, or the wire a
 * message travelled. The door is the person's own acquired_via (00464), which
 * their door's contact.added event writes (00307) and the first word keeps, as
 * Reports reads it. A function body, the row it reads under a member's own RLS,
 * and an order that pages without repeating anyone are what reading source
 * cannot prove, so these run against Postgres in the database workflow; skipped
 * without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { cameFromOf } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

let db;
const tenants = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const tenant = async (slug) => {
  const t = ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${Date.now()}-${tenants.length}`, name: slug })
      .select("id")
      .single(),
  );
  tenants.push(t.id);
  return t.id;
};

before(() => {
  if (!skip) db = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of tenants) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

let phones = 0;
/**
 * A person; how a door added them (a contact.added source, `null` for an event with none, or a list of `{ source }`
 * written in that order when doors wrote more than one); how they first reached the workspace when their row already
 * says (`via`, written with the row, as a first message or a writer of the row does); what they said and when.
 */
const person = async (tenantId, name, { added, via, messages = [], calls = [] } = {}) => {
  phones += 1;
  const c = ok(
    await db
      .from("contacts")
      .insert({
        tenant_id: tenantId,
        display_name: name,
        phone_e164: `+1555013${String(phones).padStart(4, "0")}`,
        ...(via ? { acquired_via: via } : {}),
      })
      .select("id")
      .single(),
  );
  if (added !== undefined) {
    const doors = Array.isArray(added) ? added : [{ source: added }];
    for (const { source } of doors)
      ok(
        await db.from("events").insert({
          tenant_id: tenantId,
          kind: "contact.added",
          category: "contact",
          subject_type: "contact",
          subject_id: c.id,
          data: source === null ? {} : { source },
        }),
      );
  }
  if (messages.length || calls.length) {
    const conv = ok(
      await db
        .from("conversations")
        .insert({ tenant_id: tenantId, contact_id: c.id, state: "open" })
        .select("id")
        .single(),
    );
    if (messages.length) {
      ok(
        await db.from("messages").insert(
          messages.map((m) => ({
            tenant_id: tenantId,
            conversation_id: conv.id,
            contact_id: c.id,
            type: "text",
            direction: "inbound",
            sender: "customer",
            status: "received",
            body: "Hello",
            meta: {},
            ...m,
          })),
        ),
      );
    }
    for (const [i, k] of calls.entries()) {
      ok(
        await db.from("calls").insert({
          tenant_id: tenantId,
          contact_id: c.id,
          conversation_id: conv.id,
          retell_call_id: `came-from-${c.id}-${i}`,
          direction: "inbound",
          status: "ended",
          from_e164: "+15550139999",
          ended_at: k.started_at,
          duration_ms: 60_000,
          raw: {},
          ...k,
        }),
      );
    }
  }
  return c.id;
};

const T0 = "2026-08-01T12:00:00Z";
const T1 = "2026-08-02T12:00:00Z";

// A row moved in from before the database, by the import that has since been retired with the store it read: on 'whatsapp', no channel_ts, the created_at it assigned. A call's note is the receptionist's own line.
const movedInText = (at) => ({ channel: "whatsapp", channel_ts: null, meta: { backfill: true }, created_at: at });
const movedInNote = (at) => ({
  ...movedInText(at),
  type: "call_summary",
  direction: "outbound",
  sender: "ai",
  status: "sent",
  body: "[voice call note 2026-08-01T12:00] Caller phoned the business line. Summary: asked about a cut.",
});

test(
  "people_list says where each person came from: how a door added them, from their own row, else how a history moved in began, else their first call or the wire of their first word",
  { skip },
  async () => {
    const t = await tenant("came-from");
    // Moved-in rows a second apart, as backfill.ts assigns them, a minute or two ago: rows inserted in one statement would share one now().
    const x = Date.now() - 120_000;
    const at = (s) => new Date(x + s * 1000).toISOString();
    const ids = {
      calendar: await person(t, "From the calendar", {
        added: "calendar",
        messages: [{ channel: "whatsapp", channel_ts: T0 }],
      }),
      lead: await person(t, "A lead", { added: "lead" }),
      manual: await person(t, "By hand", { added: "manual" }),
      // A form on the business's own website (00488).
      website: await person(t, "Through the website's form", { added: "website" }),
      otherDoor: await person(t, "Through another door", { added: "import_csv" }),
      noSource: await person(t, "An event with no source", { added: null }),
      // Two doors, one after the other: the first to write is the one that added them.
      addedTwice: await person(t, "Added twice", { added: [{ source: "calendar" }, { source: "manual" }] }),
      // A door's word on the row with no event beside it (a writer of the row, as the sample data writes it): the row is what says.
      doorOnTheRow: await person(t, "A lead, said on the row", { via: "lead" }),
      // Their own words came first, and a door added them after (a lead converted onto someone who wrote first): they
      // came from their words, as Reports says, and the door's word does not replace it.
      wroteThenADoor: await person(t, "Wrote, then a lead", {
        via: "whatsapp",
        added: "lead",
        messages: [{ channel: "whatsapp", channel_ts: T0 }],
      }),
      movedIn: await person(t, "Moved in from before", { messages: [movedInText(at(0))], calls: [{ started_at: T0 }] }),
      // A Blob-era caller who never wrote: their thread holds only the receptionist's note, beside the call's own row.
      noteOnly: await person(t, "Phoned before the database", {
        messages: [movedInNote(at(0))],
        calls: [{ started_at: T0 }],
      }),
      // Each thread written later row first, so only its own order can say which came first.
      noteThenText: await person(t, "Phoned, then wrote, before the database", {
        messages: [movedInText(at(1)), movedInNote(at(0))],
        calls: [{ started_at: T0 }],
      }),
      textThenNote: await person(t, "Wrote, then phoned, before the database", {
        messages: [movedInNote(at(1)), movedInText(at(0))],
        calls: [{ started_at: T0 }],
      }),
      phoned: await person(t, "Phoned first", {
        calls: [{ started_at: T0 }],
        messages: [{ channel: "whatsapp", channel_ts: T1 }],
      }),
      tie: await person(t, "Phoned and wrote at once", {
        calls: [{ started_at: T0 }],
        messages: [{ channel: "whatsapp", channel_ts: T0 }],
      }),
      dialNeverConnected: await person(t, "A dial that never connected", {
        calls: [{ started_at: T0, status: "not_connected", duration_ms: 0 }],
        messages: [{ channel: "sms", channel_ts: T1 }],
      }),
      whatsapp: await person(t, "Wrote on WhatsApp first", {
        messages: [{ channel: "whatsapp", channel_ts: T0 }],
        calls: [{ started_at: T1 }],
      }),
      sms: await person(t, "Texted", {
        messages: [
          { channel: "email", direction: "outbound", sender: "ai", status: "failed", channel_ts: T0 },
          { channel: "sms", channel_ts: T1 },
        ],
      }),
      email: await person(t, "Emailed", {
        messages: [
          { channel: "email", channel_ts: T0 },
          { channel: "whatsapp", channel_ts: T1 },
        ],
      }),
      nothing: await person(t, "Nothing yet"),
    };
    const rows = ok(await db.rpc("people_list", { p_tenant_id: t }));
    const said = Object.fromEntries(
      Object.entries(ids).map(([k, id]) => [k, rows.find((r) => r.id === id)?.came_from]),
    );
    assert.ok(
      rows.every((r) => r.came_from == null || cameFromOf({ came_from: r.came_from })),
      "every came_from the SQL can return, cameFromOf already knows",
    );
    assert.deepEqual(
      said,
      {
        calendar: "calendar",
        lead: "lead",
        manual: "manual",
        website: "website",
        otherDoor: "manual",
        noSource: "manual",
        addedTwice: "calendar",
        doorOnTheRow: "lead",
        wroteThenADoor: "whatsapp",
        movedIn: "whatsapp",
        noteOnly: "call",
        noteThenText: "call",
        textThenNote: "whatsapp",
        phoned: "call",
        tie: "call",
        dialNeverConnected: "sms",
        whatsapp: "whatsapp",
        sms: "sms",
        email: "email",
        nothing: null,
      },
      "a door wins over their words, and the first door over a later one; a door said on the row is a door; their own words first stay theirs; a history moved in says how it began, a call's note as call and a word as its wire, and wins over a call; a call wins a tie; a failed send and a dial that never connected are nobody's first word",
    );
    const one = ok(await db.rpc("people_list", { p_tenant_id: t, p_contact_id: ids.calendar }));
    assert.equal(one[0].came_from, "calendar", "one person, as the profile reads them: the same answer");
  },
);

test(
  "a member reads the same answer under their own RLS: the row the rule reads is theirs to read",
  { skip },
  async () => {
    const t = await tenant("came-from-member");
    const id = await person(t, "From the calendar", { added: "calendar" });
    const email = `came-from-${Date.now()}@example.test`;
    const made = ok(await db.auth.admin.createUser({ email, password: "a-long-test-password-1", email_confirm: true }));
    try {
      ok(await db.from("memberships").insert({ tenant_id: t, user_id: made.user.id, role: "viewer" }));
      const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
      const { error: signIn } = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
      assert.equal(signIn, null, signIn?.message);
      const rows = ok(await as.rpc("people_list", { p_tenant_id: t }));
      assert.equal(rows.find((r) => r.id === id)?.came_from, "calendar");
    } finally {
      await db.auth.admin.deleteUser(made.user.id);
    }
  },
);

test(
  "the order is whole: people alike in everything it reads come back by id, falling, so a page never repeats or skips one",
  { skip },
  async () => {
    const t = await tenant("came-from-order");
    // One statement: one created_at, and no message or call to order them by.
    const made = ok(
      await db
        .from("contacts")
        .insert([1, 2, 3, 4, 5].map((i) => ({ tenant_id: t, display_name: `Tie ${i}`, phone_e164: `+155501490${i}` })))
        .select("id"),
    );
    // Falling, as person_moments_order holds it (00276).
    const byId = made
      .map((m) => m.id)
      .sort()
      .reverse();
    const all = ok(await db.rpc("people_list", { p_tenant_id: t }));
    assert.deepEqual(
      all.map((r) => r.id),
      byId,
      "the id decides",
    );
    const pages = [];
    for (const offset of [0, 2, 4])
      pages.push(...ok(await db.rpc("people_list", { p_tenant_id: t, p_limit: 2, p_offset: offset })));
    assert.deepEqual(
      pages.map((r) => r.id),
      byId,
      "and paged two at a time, each person once",
    );
  },
);
