/**
 * A website's forms are forms (00709; Campaigns in three tabs, Lane B, the plan's section 5), on a real database: each
 * site and each of its forms keeps its own entry ids, a retry is a repeat after a key change too, the same id with other
 * words is a new entry said as a clash, a key changed and ended leaves its site and forms as they were, a form renamed on
 * its site keeps its row, where the visitor came from is kept in the entry's own write, a test tells nobody, a site's
 * request is open from its form's switch on (a hidden form's too, a sign-up never), answered by a reply that went or a
 * member's word, counted past the list's 200, its results counted once, and the member's doors are a member's.
 *
 * The past filled in by the migration (no event, no entry a request) is proved on the engine before the push
 * (dev-tools/db-without-docker example-doors-website-forms.mjs): a stack replayed here has no past to fill. Skipped
 * without a local database; never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and customers"
      : false;

const RUN = Date.now();
let db;
let tenantId;
let otherId;
let ownerId;
const made = [];

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
let digest = 0;
const hex = () => (digest += 1).toString(16).padStart(64, "0");
const phoneOf = (n) => `+1646555${String(2000 + n).slice(-4)}`;

/** The door's one write, as the edge calls it (packages/db takeFormEntry): a request from visitor `n` unless said. */
const take = (over = {}) => {
  const n = over.n ?? 1;
  return db.rpc("form_entry_take", {
    p_tenant_id: tenantId,
    p_form: "request",
    p_answers: { form: "request", phone: phoneOf(n), about: `Ask ${n}` },
    p_person: { phone: phoneOf(n), email: null, name: `Visitor ${n}`, detail: {} },
    p_words: over.p_words ?? hex(),
    p_owed: ["note", "notice"],
    ...Object.fromEntries(Object.entries(over).filter(([k]) => k.startsWith("p_"))),
  });
};
const open = async () => ok(await db.rpc("form_requests_open", { p_tenant_id: tenantId }), "open");
const lineOf = async (id) => (await open()).find((line) => line.id === id);
const siteOf = async (keyId) => ok(await db.from("form_keys").select("site_id").eq("id", keyId).single()).site_id;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  [tenantId, otherId] = await Promise.all(
    ["sites", "other"].map(
      async (slug) =>
        ok(
          await db
            .from("tenants")
            .insert({ slug: `${slug}-${RUN}`, name: "Harbor" })
            .select("id")
            .single(),
        ).id,
    ),
  );
  for (const [role, who, tenant] of [
    ["owner", "owner", tenantId],
    ["viewer", "viewer", tenantId],
    ["owner", "stranger", otherId],
  ]) {
    const email = `${who}-${RUN}@example.com`;
    const user = ok(
      await db.auth.admin.createUser({ email, password: `pw-${RUN}-Aa1!`, email_confirm: true }),
      who,
    ).user;
    made.push(user.id);
    ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: user.id, role }), `${who}'s seat`);
    if (who === "owner") ownerId = user.id;
  }
});

after(async () => {
  if (skip || !tenantId) return;
  for (const t of [tenantId, otherId]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of made) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

/** A session of a member of the workspace, or of the stranger's. */
async function signedIn(who) {
  const as = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await as.auth.signInWithPassword({ email: `${who}-${RUN}@example.com`, password: `pw-${RUN}-Aa1!` }), who);
  return as;
}

test(
  "each site and each of its forms keeps its own entry ids; a retry is a repeat, after a key change too; other words are a clash",
  { skip },
  async () => {
    const owner = await signedIn("owner");
    const studio = ok(await owner.rpc("form_key_make", { p_tenant_id: tenantId, p_name: "Studio", p_hash: hex() }));
    const popUp = ok(await owner.rpc("form_key_make", { p_tenant_id: tenantId, p_name: "Pop-up", p_hash: hex() }));
    assert.notEqual(await siteOf(studio), await siteOf(popUp), "each key made a site of its own");

    const both = [
      ok(await take({ p_key_id: studio, p_ref: "123", n: 1 })),
      ok(await take({ p_key_id: popUp, p_ref: "123", n: 2 })),
    ];
    assert.deepEqual(
      both.map((r) => r.outcome),
      ["accepted", "accepted"],
      "two sites sending one entry id: both kept",
    );
    const forms = [
      ok(await take({ p_key_id: studio, p_ref: "9", p_form_ref: "colour", n: 3 })),
      ok(await take({ p_key_id: studio, p_ref: "9", p_form_ref: "cut", n: 4 })),
    ];
    assert.deepEqual(
      forms.map((r) => r.outcome),
      ["accepted", "accepted"],
      "two forms on one site with one entry id: both kept",
    );

    const words = hex();
    const first = ok(await take({ p_key_id: studio, p_ref: "77", p_words: words, n: 5 }));
    assert.equal(ok(await take({ p_key_id: studio, p_ref: "77", p_words: words, n: 5 })).outcome, "again");
    const changed = ok(await owner.rpc("form_key_change", { p_tenant_id: tenantId, p_key_id: studio, p_hash: hex() }));
    assert.equal(await siteOf(changed.id), await siteOf(studio), "the key changed keeps its site");
    const retried = ok(await take({ p_key_id: changed.id, p_ref: "77", p_words: words, n: 5 }));
    assert.deepEqual([retried.outcome, retried.entry_id], ["again", first.entry_id], "still a repeat after the change");
    const clash = ok(await take({ p_key_id: changed.id, p_ref: "77", n: 6 }));
    assert.deepEqual([clash.outcome, clash.clash], ["accepted", true], "the same id with other words: a new entry");
    assert.notEqual(clash.entry_id, first.entry_id, "never merged");
  },
);

test("two posts at once with one site id: the same words one entry, other words two", { skip }, async () => {
  const words = hex();
  const same = await Promise.all([
    take({ p_ref: "at-once", p_words: words }),
    take({ p_ref: "at-once", p_words: words }),
  ]);
  assert.deepEqual(same.map((r) => ok(r).outcome).sort(), ["accepted", "again"]);
  const other = await Promise.all([take({ p_ref: "at-once-2", n: 7 }), take({ p_ref: "at-once-2", n: 8 })]);
  assert.deepEqual(
    other.map((r) => ok(r).outcome),
    ["accepted", "accepted"],
    "neither lost as a repeat",
  );
  assert.deepEqual(other.map((r) => ok(r).clash).sort(), [false, true]);
});

test(
  "a key changed and ended leaves its site and forms as they were; a form renamed on its site keeps its row",
  { skip },
  async () => {
    const owner = await signedIn("owner");
    const key = ok(await owner.rpc("form_key_make", { p_tenant_id: tenantId, p_name: "Salon", p_hash: hex() }));
    const site = await siteOf(key);
    const named = ok(await take({ p_key_id: key, p_form_ref: "consult", p_form_name: "Colour consult", n: 9 }));
    const formsOf = async () =>
      ok(await db.from("outside_forms").select("id, ref, form, sent_name").eq("site_id", site).order("id"));
    const changed = ok(await owner.rpc("form_key_change", { p_tenant_id: tenantId, p_key_id: key, p_hash: hex() }));
    const kept = await formsOf();
    assert.equal(ok(await owner.rpc("form_key_end", { p_tenant_id: tenantId, p_key_id: changed.id })), true);
    assert.equal(ok(await db.from("form_sites").select("id").eq("id", site)).length, 1, "the site stands");
    assert.deepEqual(await formsOf(), kept, "its forms as they were");

    const renamed = ok(await take({ p_key_id: key, p_form_ref: "consult", p_form_name: "Colour consultation", n: 10 }));
    const after = await formsOf();
    assert.equal(after.length, 1, "one row for the form");
    assert.equal(after[0].sent_name, "Colour consultation", "named as the site sends it now");
    const entries = ok(await db.from("form_entries").select("id").eq("outside_form_id", after[0].id));
    assert.deepEqual(entries.map((e) => e.id).sort(), [named.entry_id, renamed.entry_id].sort(), "and its history");
  },
);

test("where the visitor came from is in the entry's own write; a test tells nobody", { skip }, async () => {
  const from = { site: "google.com", labels: { utm_source: "google" } };
  const sourced = ok(await take({ p_source: from, n: 11 }));
  assert.deepEqual(ok(await db.from("form_entries").select("source").eq("id", sourced.entry_id).single()).source, from);

  const events = ok(await db.from("events").select("id").eq("tenant_id", tenantId)).length;
  const people = ok(await db.from("contacts").select("id").eq("tenant_id", tenantId)).length;
  const tested = ok(await take({ p_test: true, n: 12 }));
  assert.deepEqual([tested.outcome, tested.contact_id], ["test", null]);
  const row = ok(
    await db
      .from("form_entries")
      .select("contact_id, owed, test, outside_form_id, key_id")
      .eq("id", tested.entry_id)
      .single(),
  );
  assert.deepEqual([row.contact_id, row.owed, row.test, row.outside_form_id], [null, [], true, null]);
  assert.equal(ok(await db.from("events").select("id").eq("tenant_id", tenantId)).length, events, "no event");
  assert.equal(ok(await db.from("contacts").select("id").eq("tenant_id", tenantId)).length, people, "nobody made");
  const site = await siteOf(row.key_id);
  assert.ok(ok(await db.from("form_sites").select("test_at").eq("id", site).single()).test_at, "test received");
  assert.equal(await lineOf(tested.entry_id), undefined, "and no request");
});

test(
  "a site's requests: open from its form's switch, a hidden form's too, a sign-up never; a reply that went answers one",
  { skip },
  async () => {
    const owner = await signedIn("owner");
    const asked = ok(await take({ p_form_ref: "hidden-one", p_form_name: "Consultations", n: 13 }));
    const line = await lineOf(asked.entry_id);
    assert.ok(line?.outside_form_id, "open, naming its form");
    assert.equal(line.heading, "Consultations", "its heading the form's name");
    ok(
      await owner.rpc("outside_form_rename", {
        p_tenant_id: tenantId,
        p_form_id: line.outside_form_id,
        p_name: " Ours ",
      }),
    );
    assert.equal((await lineOf(asked.entry_id)).heading, "Ours", "the owner's name wins");
    ok(await owner.rpc("outside_form_rename", { p_tenant_id: tenantId, p_form_id: line.outside_form_id, p_name: "" }));
    assert.equal((await lineOf(asked.entry_id)).heading, "Consultations", "blank goes back to the site's");
    assert.equal(
      ok(
        await owner.rpc("outside_form_listed", {
          p_tenant_id: tenantId,
          p_form_id: line.outside_form_id,
          p_listed: false,
        }),
      ),
      true,
    );
    const hidden = ok(await take({ p_form_ref: "hidden-one", n: 14 }));
    assert.ok(await lineOf(hidden.entry_id), "a hidden form's request still arrives, open");

    const signup = ok(
      await take({
        p_form: "signup",
        p_answers: { form: "signup", email: `s-${RUN}@example.com` },
        p_person: { phone: null, email: `s-${RUN}@example.com`, name: null, detail: {} },
      }),
    );
    assert.equal(await lineOf(signup.entry_id), undefined, "a sign-up is never in Needs you");

    const conversation = ok(
      await db
        .from("conversations")
        .insert({ tenant_id: tenantId, contact_id: asked.contact_id })
        .select("id")
        .single(),
    ).id;
    const message = async (status) =>
      ok(
        await db
          .from("messages")
          .insert({
            tenant_id: tenantId,
            conversation_id: conversation,
            channel: "email",
            direction: "outbound",
            sender: "human",
            status,
          })
          .select("id")
          .single(),
      ).id;
    const reply = async (status) =>
      ok(
        await db
          .from("form_entry_links")
          .insert({ tenant_id: tenantId, entry_id: asked.entry_id, kind: "reply", message_id: await message(status) }),
      );
    await reply("failed");
    assert.equal((await lineOf(asked.entry_id))?.unreached, true, "a reply that failed leaves it open, unreached");
    await reply("sent");
    assert.equal(await lineOf(asked.entry_id), undefined, "tried again and sent: answered");
    ok(
      await db
        .from("form_entry_links")
        .insert({ tenant_id: tenantId, entry_id: hidden.entry_id, kind: "marked", created_by: ownerId }),
    );
    assert.equal(await lineOf(hidden.entry_id), undefined, "a member's word answers one");
  },
);

test("the open count goes past the list's 200, and the results count each form's entries once", { skip }, async () => {
  const before = ok(await db.rpc("form_requests_open_count", { p_tenant_id: tenantId }));
  for (let n = 0; n < 205; n += 1) ok(await take({ n: 100 + (n % 40), p_form_ref: "many" }), `entry ${n}`);
  assert.equal((await open()).length, 200, "the list stops at 200");
  assert.equal(
    ok(await db.rpc("form_requests_open_count", { p_tenant_id: tenantId })),
    before + 205,
    "the count does not",
  );

  const results = ok(await db.rpc("form_results", { p_tenant_id: tenantId, p_days: 30 }));
  const kept = ok(
    await db
      .from("form_entries")
      .select("outside_form_id")
      .eq("tenant_id", tenantId)
      .eq("test", false)
      .neq("state", "held")
      .not("outside_form_id", "is", null),
  );
  assert.equal(
    results.outside.reduce((sum, form) => sum + form.entries, 0),
    kept.length,
    "every entry counted, once",
  );
  assert.equal(
    new Set(results.outside.map((f) => f.outside_form_id)).size,
    results.outside.length,
    "each form one row",
  );
  assert.equal(results.places.length, 0, "no hosted form's place is made of them");
});

test(
  "a sign-up's confirmed: counted from its own event, once, for the form whose email was pressed; today's yes is apart",
  { skip },
  async () => {
    const email = `confirm-${RUN}@example.com`;
    const signup = ok(
      await take({
        p_form: "signup",
        p_form_ref: "news",
        p_answers: { form: "signup", email },
        p_person: { phone: null, email, name: null, detail: {} },
      }),
    );
    const form = ok(
      await db.from("form_entries").select("outside_form_id").eq("id", signup.entry_id).single(),
    ).outside_form_id;
    const said = async () => {
      const line = ok(await db.rpc("form_results", { p_tenant_id: tenantId, p_days: 30 })).outside.find(
        (f) => f.outside_form_id === form,
      );
      return [line.confirmed, line.subscribers];
    };
    /** Their consent as it stands, written straight on the person: no door, so no event. */
    const stands = (answer, source) =>
      db
        .from("contacts")
        .update({
          email_marketing: answer,
          email_marketing_source: source,
          email_marketing_updated_at: new Date().toISOString(),
        })
        .eq("id", signup.contact_id);
    const before = ok(
      await db.from("contacts").select("email_marketing, email_marketing_source").eq("id", signup.contact_id).single(),
    );
    assert.deepEqual(await said(), [0, 0], "signed up, not confirmed yet: no confirmation, and no yes today");
    // A yes that stands on the person without their press (given another way) is no confirmation: nothing says they
    // pressed. Before 00732 a consent that read "confirmed" today was counted, whenever and however it came to.
    ok(await stands("opted_in", "confirmed_signup"));
    assert.deepEqual(
      await said(),
      [0, 1],
      "a consent that only reads confirmed is not a confirmation; it is a yes today",
    );
    ok(await stands(before.email_marketing, before.email_marketing_source));
    // The email their sign-up sent them, as the edge writes it, and their press on its link: the yes door's own event.
    const conversation = ok(
      await db
        .from("conversations")
        .upsert({ tenant_id: tenantId, contact_id: signup.contact_id }, { onConflict: "tenant_id,contact_id" })
        .select("id")
        .single(),
    ).id;
    const asked = ok(
      await db
        .from("messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: conversation,
          contact_id: signup.contact_id,
          channel: "email",
          direction: "outbound",
          sender: "system",
          type: "text",
          body: "Confirm your sign-up",
          status: "sent",
          meta: {
            source: "signup_confirm",
            email: { request: { to: [email], from: '"Harbor" <harbor@mail.example.com>' } },
            signup_confirm: { key: email, form: { form: "signup", page: null, about: null, lang: null, at: null } },
          },
        })
        .select("id")
        .single(),
    ).id;
    const press = () =>
      db.rpc("set_email_offers_yes", {
        p_tenant_id: tenantId,
        p_contact_id: signup.contact_id,
        p_source: "confirmed_signup",
        p_message_id: asked,
        p_evidence: { via: "link" },
      });
    assert.equal(ok(await press()).changed, true, "their press is their yes");
    assert.deepEqual(await said(), [1, 1], "confirmed from its email: counted from the event, and a yes today");
    assert.equal(ok(await press()).changed, false, "the same link pressed again changes nothing");
    assert.deepEqual(await said(), [1, 1], "and is counted once");
    // They stop offers later. The confirming happened at its own time and is still counted; today's yes is gone.
    ok(await stands("opted_out", "form"));
    assert.deepEqual(await said(), [1, 0], "a stop since takes away today's yes, never the confirmation that was made");
  },
);

test(
  "one booking after two forms is one form's: the first is booked from, the second helped; past the window, nobody's",
  { skip },
  async () => {
    const DAY = 86_400_000;
    const formOf = async (entryId) =>
      ok(await db.from("form_entries").select("outside_form_id").eq("id", entryId).single()).outside_form_id;
    const lines = async () => {
      const results = ok(await db.rpc("form_results", { p_tenant_id: tenantId, p_days: 30 }));
      return (id) => results.outside.find((f) => f.outside_form_id === id);
    };
    /** A visit a member wrote down for them now, or said as made `madeInDays` from now; read from a calendar where said. */
    const visit = (contactId, over = {}) =>
      db
        .from("appointments")
        .insert({
          tenant_id: tenantId,
          contact_id: contactId,
          source: "person",
          status: "booked",
          timezone: "UTC",
          starts_at: new Date(Date.now() + 30 * DAY).toISOString(),
          ends_at: new Date(Date.now() + 30 * DAY + 3_600_000).toISOString(),
          ...over,
        })
        .select("id")
        .single();
    // Noor asks on the first form, then on the second, then books once.
    const first = ok(await take({ n: 901, p_form_ref: "credit-first", p_form_name: "First form" }));
    const second = ok(await take({ n: 901, p_form_ref: "credit-second", p_form_name: "Second form" }));
    assert.equal(first.contact_id, second.contact_id, "one person, two forms");
    const [formA, formB] = [await formOf(first.entry_id), await formOf(second.entry_id)];
    const booked = ok(await visit(first.contact_id)).id;
    // Omar asks on the first form and books 20 days later: past the window, so the form is not what brought it.
    const late = ok(await take({ n: 902, p_form_ref: "credit-first" }));
    ok(await visit(late.contact_id, { created_at: new Date(Date.now() + 20 * DAY).toISOString() }));
    // Pia asks on the first form; her visit was read from the owner's calendar, with no moment it was made.
    const fed = ok(await take({ n: 903, p_form_ref: "credit-first" }));
    ok(await visit(fed.contact_id, { source: "calendar_feed" }));
    // Quin asks on the first form and books through the booking page: its arrival is when it was made.
    const arrived = ok(await take({ n: 904, p_form_ref: "credit-first" }));
    ok(
      await visit(arrived.contact_id, {
        source: "booking_tool",
        arrived_at: new Date(Date.now() + 1000).toISOString(),
      }),
    );

    const line = await lines();
    const [a, b] = [line(formA), line(formB)];
    assert.deepEqual(
      [a.entries, a.people, a.booked, a.helped, a.appointments],
      [4, 4, 2, 0, 2],
      "the first form: four people asked; Noor and Quin booked from it; Omar's and Pia's visits are nobody's",
    );
    assert.deepEqual(
      [b.entries, b.people, b.booked, b.helped, b.appointments],
      [1, 1, 0, 1, 0],
      "the second form helped Noor's booking, and is not counted as what brought it",
    );
    assert.equal(a.visits, a.booked, "the key from before 00732 says the people who booked");
    // The rule itself: Noor's one booking has one main source and one that helped, and nothing is added up twice.
    const put = ok(
      await db.rpc("booking_sources", {
        p_tenant_id: tenantId,
        p_since: new Date(Date.now() - 3_600_000).toISOString(),
        p_people: [first.contact_id],
      }),
    );
    assert.deepEqual(
      put.map((row) => [row.appointment_id, row.subject_type, row.subject_id, row.standing]).sort(),
      [
        [booked, "form", formA, "main"],
        [booked, "form", formB, "helped"],
      ].sort(),
      "one booking: the first form its main source, the second one that helped",
    );
    // As a page reads it: the same booking, its main source first.
    const read = ok(
      await db.rpc("bookings_with_sources", {
        p_tenant_id: tenantId,
        p_since: new Date(Date.now() - 3_600_000).toISOString(),
        p_people: [first.contact_id],
        p_of: "form",
      }),
    );
    assert.equal(read.window_days, 14);
    assert.deepEqual(
      read.bookings.map((one) => [one.appointment_id, one.sources.map((s) => [s.id, s.standing])]),
      [
        [
          booked,
          [
            [formA, "main"],
            [formB, "helped"],
          ],
        ],
      ],
    );
  },
);

test(
  "the member's doors: a viewer and a stranger may do neither, and a stranger reads no site or form",
  { skip },
  async () => {
    const form = ok(await db.from("outside_forms").select("id").eq("tenant_id", tenantId).limit(1).single()).id;
    for (const who of ["viewer", "stranger"]) {
      const as = await signedIn(who);
      const rename = await as.rpc("outside_form_rename", { p_tenant_id: tenantId, p_form_id: form, p_name: "x" });
      const listed = await as.rpc("outside_form_listed", { p_tenant_id: tenantId, p_form_id: form, p_listed: true });
      assert.deepEqual([rename.error?.code, listed.error?.code], ["42501", "42501"], who);
    }
    const stranger = await signedIn("stranger");
    assert.equal(ok(await stranger.from("form_sites").select("id").eq("tenant_id", tenantId)).length, 0);
    assert.equal(ok(await stranger.from("outside_forms").select("id").eq("tenant_id", tenantId)).length, 0);
    const viewer = await signedIn("viewer");
    assert.ok(
      ok(await viewer.from("outside_forms").select("id").eq("tenant_id", tenantId)).length > 0,
      "a member reads them",
    );
  },
);
