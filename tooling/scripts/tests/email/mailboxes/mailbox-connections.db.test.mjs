/**
 * A mailbox the business connected, on the database (00423-00425, decision 0056): the row's own rules (an address
 * written once and its host its own, a hold and a removal whole, the owner's cap within fifty, one live row an
 * address); the limits (ten a workspace, three a domain, a removed one counting for neither, the hint naming which);
 * the connect door (made, found again by its account and back to connected, another workspace's address refused as
 * taken); its token in Vault (kept, read, replaced only over the refresh token it read, dropped); its health's counts
 * (what left, permanent bounces, complaints, and the people who said no, a reply's no counted until it is undone,
 * D18); the threads its sync may read; an email stamped as it left; and every door closed to a session. A mailbox's
 * day, the claim and the due read are proved where reach out reads them (reach-out-doors.db, reach-out-sender.db).
 * Local stack only: it makes workspaces.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const DAY = 86_400_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();

let db;
let A;
let B;
let L;
let root;
let run;
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;
/** A refusal the database raised: its code, and the hint a door maps to its owner's words when it names one. */
const refused = (res, code, hint) => {
  assert.ok(res.error, "refused");
  assert.equal(res.error.code, code, res.error.message);
  if (hint !== undefined) assert.equal(res.error.hint, hint, res.error.message);
};

/** A mailbox connected, on a host of its own unless one is named. */
const mailboxRow = (over = {}, tenant = A) => {
  n += 1;
  const host = over.host ?? `box-${stamp}-${n}.example`;
  return one(
    db.from("mailbox_connections").insert({
      tenant_id: tenant,
      provider: "google",
      provider_account: `acct-${stamp}-${n}`,
      address: `sam${n}@${host}`,
      host,
      from_name: "Sam at Harbor",
      ...over,
    }),
  );
};
const personOf = (email) => one(db.from("contacts").insert({ tenant_id: A, email, display_name: "Fixture Office" }));
/** A person's one thread (a person has one conversation). */
const threads = new Map();
const threadOf = async (contact) => {
  if (!threads.has(contact))
    threads.set(contact, await one(db.from("conversations").insert({ tenant_id: A, contact_id: contact })));
  return threads.get(contact);
};

/**
 * An email a mailbox sent, as the sender writes one: its row, and its send moved along the guard's path (planned,
 * claimed, queued, sent) under the suite's run. What a mailbox's counts read is its sends (00424), never a From.
 */
async function sentFrom(mailbox, { contact = null, status = "sent", error = null, meta = {}, createdAt = null } = {}) {
  n += 1;
  const person = contact ?? (await personOf(`office-${stamp}-${n}@fixture-boxes.example`));
  const id = crypto.randomUUID();
  ok(
    await db.from("messages").insert({
      id,
      tenant_id: A,
      conversation_id: await threadOf(person),
      contact_id: person,
      channel: "email",
      direction: "outbound",
      sender: "human",
      type: "text",
      body: "Saw your shop on the map.",
      status,
      error,
      meta: { source: "reach_out", email: { subject: "A quick one", ...meta } },
      ...(createdAt ? { created_at: createdAt } : {}),
    }),
  );
  const lead = await one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureBoxes${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      email: `lead-${stamp}-${n}@fixture-boxes.example`,
      email_state: "ok",
      stage: "ready",
    }),
  );
  const send = crypto.randomUUID();
  ok(
    await db.from("reach_out_sends").insert({
      id: send,
      tenant_id: A,
      broadcast_id: run,
      playbook_id: root,
      root_id: root,
      lead_id: lead,
      mailbox_id: mailbox,
      send_at: iso(Date.now() - 60_000),
      checked_at: iso(Date.now() - 60_000),
    }),
  );
  for (const patch of [
    { state: "claimed", claimed_at: iso(Date.now()) },
    { state: "queued", message_id: id },
    { state: "sent", sent_at: iso(Date.now()) },
  ])
    ok(await db.from("reach_out_sends").update(patch).eq("id", send));
  return id;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `boxes-a-${stamp}`, name: "Harbor Moving Co" }));
  B = await one(db.from("tenants").insert({ slug: `boxes-b-${stamp}`, name: "Another" }));
  L = await one(db.from("tenants").insert({ slug: `boxes-l-${stamp}`, name: "Limits" }));
  const template = await one(
    db.from("templates").insert({
      tenant_id: A,
      channel: "email",
      source: "chanlytics",
      name: `boxes_${stamp}`,
      language: "en",
      category: "marketing",
      meta_status: "approved",
      components: [{ type: "BODY", text: "Hi {{business}}" }],
    }),
  );
  root = await one(
    db.from("playbooks").insert({
      tenant_id: A,
      kind: "reach_out",
      policy_class: "outreach",
      gap_minutes: 12,
      template_id: template,
      template_name: `boxes_${stamp}`,
      template_language: "en",
      params: [],
      name: "Movers",
      trigger: "lead_first",
      lead_search_id: await one(
        db
          .from("lead_searches")
          .insert({ tenant_id: A, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
      ),
    }),
  );
  run = await one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: "Movers",
      template_id: template,
      template_name: `boxes_${stamp}`,
      template_language: "en",
      audience: { kind: "reach_out", root_id: root, step_id: root },
      state: "sending",
      scheduled_for: iso(Date.now()),
      playbook_id: root,
      run_for: "2026-10-13",
    }),
  );
});
after(async () => {
  if (skip) return;
  for (const t of [A, B, L].filter(Boolean)) ok(await db.from("tenants").delete().eq("id", t));
});

test(
  "the row's own rules: an address written once, its host its own, a hold and a removal whole",
  { skip },
  async () => {
    const host = `rules-${stamp}.example`;
    const row = (over) => ({
      tenant_id: A,
      provider: "google",
      provider_account: `acct-rules-${stamp}`,
      address: `sam@${host}`,
      host,
      from_name: "Sam",
      ...over,
    });
    const insert = (over) => db.from("mailbox_connections").insert(row(over));
    refused(await insert({ address: `Sam@${host}` }), "23514");
    refused(await insert({ address: ` sam@${host}` }), "23514");
    refused(await insert({ address: "sam@localhost" }), "23514");
    refused(await insert({ host: `other-${stamp}.example` }), "23514");
    refused(await insert({ provider: "yahoo" }), "23514");
    refused(await insert({ state: "held" }), "23514");
    refused(await insert({ held_why: "bounces", held_at: iso(Date.now()) }), "23514");
    refused(await insert({ state: "removed" }), "23514");
    refused(await insert({ daily_cap: 51 }), "23514");
    refused(await insert({ daily_cap: 0 }), "23514");
    refused(await insert({ from_name: "  " }), "23514");
    const id = await one(insert({}));
    const made = ok(await db.from("mailbox_connections").select("*").eq("id", id).single());
    assert.deepEqual(
      [made.state, made.daily_cap, made.customer_domain, made.sent_days, made.dns, made.credentials_ref],
      ["connected", 40, false, 0, {}, null],
    );
    // One live row an address, in any workspace; a removed one is kept, and frees it.
    refused(await insert({ tenant_id: B, provider_account: `acct-rules-b-${stamp}` }), "23505");
    ok(
      await db
        .from("mailbox_connections")
        .update({ state: "removed", removed_at: iso(Date.now()) })
        .eq("id", id),
    );
    ok(await insert({ tenant_id: B, provider_account: `acct-rules-b-${stamp}` }));
  },
);

test(
  "ten a workspace and three a domain, a removed one counting for neither; the hint names which",
  { skip },
  async () => {
    const host = `limits-${stamp}.example`;
    const onHost = [];
    for (let i = 0; i < 3; i += 1) onHost.push(await mailboxRow({ host }, L));
    const fourth = () =>
      db.from("mailbox_connections").insert({
        tenant_id: L,
        provider: "google",
        provider_account: `acct-fourth-${stamp}`,
        address: `fourth@${host}`,
        host,
        from_name: "Sam",
      });
    refused(await fourth(), "P0001", "too_many_on_domain");
    ok(
      await db
        .from("mailbox_connections")
        .update({ state: "removed", removed_at: iso(Date.now()) })
        .eq("id", onHost[0]),
    );
    ok(await fourth());
    // Back from removed is a mailbox again, and meets the limit as a new one does.
    refused(
      await db.from("mailbox_connections").update({ state: "connected", removed_at: null }).eq("id", onHost[0]),
      "P0001",
      "too_many_on_domain",
    );
    // Three live on that host; seven more on hosts of their own make ten.
    for (let i = 0; i < 7; i += 1) await mailboxRow({}, L);
    const eleventh = await db.from("mailbox_connections").insert({
      tenant_id: L,
      provider: "microsoft",
      provider_account: `acct-eleventh-${stamp}`,
      address: `eleventh@eleventh-${stamp}.example`,
      host: `eleventh-${stamp}.example`,
      from_name: "Sam",
    });
    refused(eleventh, "P0001", "too_many");
    assert.equal(
      ok(await db.from("mailbox_connections").select("id").eq("tenant_id", L).neq("state", "removed")).length,
      10,
    );
    // Another workspace's ten are its own.
    await mailboxRow({}, B);
  },
);

test(
  "connect: made, found again by its account and back to connected, another workspace's address taken",
  { skip },
  async () => {
    const address = `dana@connect-${stamp}.example`;
    const connect = (tenant, over = {}) =>
      db.rpc("mailbox_connection_connect", {
        p_tenant_id: tenant,
        p_user_id: null,
        p_provider: "google",
        p_account: `acct-connect-${stamp}`,
        p_address: ` Dana@Connect-${stamp}.example `,
        p_from_name: "",
        p_scopes: ["https://www.googleapis.com/auth/gmail.send"],
        p_customer_domain: false,
        ...over,
      });
    const made = ok(await connect(A));
    assert.deepEqual([made.made, made.state], [true, "connected"]);
    const row = ok(await db.from("mailbox_connections").select("*").eq("id", made.id).single());
    assert.deepEqual(
      [row.address, row.host, row.from_name, row.scopes],
      [address, `connect-${stamp}.example`, "dana", ["https://www.googleapis.com/auth/gmail.send"]],
      "its address as written once, its host, its name its local part when the provider gave none",
    );
    // Signed out, then connected again: the same row, connected, its scopes the new grant's.
    ok(
      await db
        .from("mailbox_connections")
        .update({ state: "reconnect", last_error: "Signed out by its provider: connect it again." })
        .eq("id", made.id),
    );
    const again = ok(await connect(A, { p_scopes: ["a", "b"], p_customer_domain: true }));
    assert.deepEqual(again, { id: made.id, made: false, state: "connected" });
    const back = ok(await db.from("mailbox_connections").select("*").eq("id", made.id).single());
    assert.deepEqual([back.scopes, back.customer_domain, back.last_error], [["a", "b"], true, null]);
    // A paused one connected again stays paused: only its owner's word sends it.
    ok(await db.from("mailbox_connections").update({ state: "paused" }).eq("id", made.id));
    assert.equal(ok(await connect(A)).state, "paused");
    // Another workspace's address is that workspace's, under any account.
    refused(await connect(B, { p_account: `acct-connect-b-${stamp}` }), "P0001", "taken");
    ok(
      await db
        .from("mailbox_connections")
        .update({ state: "removed", removed_at: iso(Date.now()) })
        .eq("id", made.id),
    );
    assert.equal(ok(await connect(B, { p_account: `acct-connect-b-${stamp}` })).made, true, "removed, it is free");
  },
);

test("its token in Vault: kept, read, replaced only over the refresh token it read, dropped", { skip }, async () => {
  const box = await mailboxRow();
  const get = async () => ok(await db.rpc("get_mailbox_credentials", { p_connection_id: box }));
  const put = (secret, ifRefresh = null) =>
    db.rpc("put_mailbox_credentials", { p_connection_id: box, p_secret: secret, p_if_refresh_token: ifRefresh });
  assert.equal(await get(), null);
  const first = { refresh_token: "r1", access_token: "a1", expires_at: Date.now() + 3_600_000 };
  assert.equal(ok(await put(first)), `mailbox-creds-${box}`);
  assert.equal(
    ok(await db.from("mailbox_connections").select("credentials_ref").eq("id", box).single()).credentials_ref,
    `mailbox-creds-${box}`,
  );
  assert.deepEqual(await get(), first);
  // A refresh writes over the grant it refreshed; one that read a token since replaced writes nothing (40001).
  const refreshed = { ...first, access_token: "a2" };
  ok(await put(refreshed, "r1"));
  assert.deepEqual(await get(), refreshed);
  const reconnected = { refresh_token: "r2", access_token: "a3", expires_at: Date.now() + 3_600_000 };
  ok(await put(reconnected));
  refused(await put({ ...first, access_token: "stale" }, "r1"), "40001");
  assert.deepEqual(await get(), reconnected, "the reconnect's token stands");
  assert.equal(ok(await db.rpc("drop_mailbox_credentials", { p_connection_id: box })), true);
  assert.equal(await get(), null);
  assert.equal(
    ok(await db.from("mailbox_connections").select("credentials_ref").eq("id", box).single()).credentials_ref,
    null,
  );
  assert.equal(ok(await db.rpc("drop_mailbox_credentials", { p_connection_id: box })), false, "nothing to drop");
  assert.ok(
    (await db.rpc("put_mailbox_credentials", { p_connection_id: crypto.randomUUID(), p_secret: first })).error,
    "no mailbox, no token",
  );
});

test(
  "its health's counts: what left, its permanent bounces and complaints, by its own sends only",
  { skip },
  async () => {
    const box = await mailboxRow();
    const counts = async (since = null) =>
      ok(await db.rpc("mailbox_connection_counts", { p_mailbox_id: box, p_since: since }));
    assert.deepEqual(await counts(), { sent: 0, bounced: 0, complained: 0, unsubscribed: 0 });
    await sentFrom(box);
    await sentFrom(box, { status: "delivered" });
    await sentFrom(box, { meta: { complained_at: iso(Date.now()) } });
    await sentFrom(box, { status: "failed", error: { provider: "bounced", kind: "Permanent" } });
    await sentFrom(box, { status: "failed", error: { provider: "bounced", kind: "Transient" } });
    // What never left is none of it: refused at the provider, or never sent.
    await sentFrom(box, { status: "failed", error: { provider: "rejected" } });
    await sentFrom(box, { status: "canceled", error: { reason: "sending_mailbox_at_cap" } });
    // Another mailbox's mail, and an email no send of this one wrote, count nothing here.
    await sentFrom(await mailboxRow());
    assert.deepEqual(await counts(), { sent: 5, bounced: 1, complained: 1, unsubscribed: 0 });
    // Since a moment: only what was written since.
    await sentFrom(box, { createdAt: iso(Date.now() - 3 * DAY) });
    assert.equal((await counts()).sent, 6);
    assert.equal((await counts(iso(Date.now() - DAY))).sent, 5);
    assert.deepEqual(
      ok(await db.rpc("mailbox_connection_counts", { p_mailbox_id: crypto.randomUUID(), p_since: null })),
      { sent: 0, bounced: 0, complained: 0, unsubscribed: 0 },
    );
  },
);

test(
  "D18 on a mailbox's count: a reply's no counts beside an unsubscribe, and stops counting once it is undone",
  { skip },
  async () => {
    const box = await mailboxRow();
    const marketing = (contact, state, source, over = {}) =>
      db.rpc("set_email_marketing", {
        p_tenant_id: A,
        p_contact_id: contact,
        p_state: state,
        p_source: source,
        p_message_id: null,
        p_evidence: { channel: "email", via: source },
        ...over,
      });
    const p = await personOf(`d18-${stamp}@fixture-boxes.example`);
    const q = await personOf(`d18b-${stamp}@fixture-boxes.example`);
    const first = await sentFrom(box, { contact: p });
    const second = await sentFrom(box, { contact: q });
    await sentFrom(box, { contact: q });
    const third = await sentFrom(box, { contact: p });
    const unsubscribed = async () =>
      ok(await db.rpc("mailbox_connection_counts", { p_mailbox_id: box, p_since: null })).unsubscribed;
    assert.equal(await unsubscribed(), 0);
    ok(await marketing(p, "opted_out", "reply", { p_message_id: first }));
    assert.equal(await unsubscribed(), 1, "the email the reply answered is counted");
    // An undo that names another email is not this no's.
    ok(
      await db.from("events").insert({
        tenant_id: A,
        kind: "contact.consent_changed",
        category: "contact",
        subject_type: "contact",
        subject_id: p,
        data: { purpose: "email_marketing", consent: "unknown", source: "reply_undone", message_id: second },
      }),
    );
    assert.equal(await unsubscribed(), 1, "a reply_undone naming another email leaves the reply counted");
    ok(await marketing(p, "unknown", "reply_undone", { p_message_id: first }));
    assert.equal(await unsubscribed(), 0, "a no undone was never a no");
    ok(await marketing(q, "opted_out", "unsubscribe", { p_message_id: second }));
    assert.equal(await unsubscribed(), 1, "an unsubscribe counts as before");
    ok(await marketing(p, "opted_out", "reply", { p_message_id: first }));
    assert.equal(await unsubscribed(), 2, "a no said again after its undo counts again");
    // One person counts once in the window, however many of its emails their noes name.
    ok(await marketing(p, "opted_out", "unsubscribe", { p_message_id: third }));
    assert.equal(await unsubscribed(), 2, "a reply's no and then an unsubscribe are one person");
  },
);

test(
  "an email stamped as it left, and the threads a sync may read: its workspace's sent ones alone",
  { skip },
  async () => {
    const box = await mailboxRow();
    const mine = await sentFrom(box, { status: "queued" });
    const stampIt = (over = {}) =>
      db.rpc("stamp_email_from_mailbox", {
        p_tenant_id: A,
        p_message_id: mine,
        p_provider_id: "gm-1",
        p_rfc_message_id: `<cl.mine@box-${stamp}.example>`,
        p_thread_id: `gt-mine-${stamp}`,
        p_mailbox_id: box,
        ...over,
      });
    assert.equal(ok(await stampIt({ p_tenant_id: B })), false, "another workspace's email is none of its");
    assert.equal(ok(await stampIt()), true);
    const m = ok(await db.from("messages").select("external_id, meta").eq("id", mine).single());
    assert.deepEqual(
      [m.external_id, m.meta.email.message_id, m.meta.email.thread_id, m.meta.email.mailbox_id, m.meta.email.subject],
      ["gm-1", `<cl.mine@box-${stamp}.example>`, `gt-mine-${stamp}`, box, "A quick one"],
      "stamped beside what the email already said",
    );
    assert.ok(ok(await db.from("mailbox_connections").select("sent_at").eq("id", box).single()).sent_at);
    // A second stamp keeps the provider's first id.
    ok(await stampIt({ p_provider_id: "gm-2" }));
    assert.equal(ok(await db.from("messages").select("external_id").eq("id", mine).single()).external_id, "gm-1");
    const known = async (tenant, ids) =>
      ok(await db.rpc("mailbox_threads_known", { p_tenant_id: tenant, p_thread_ids: ids })).sort();
    assert.deepEqual(await known(A, [`gt-mine-${stamp}`, `gt-theirs-${stamp}`]), [`gt-mine-${stamp}`]);
    assert.deepEqual(await known(B, [`gt-mine-${stamp}`]), [], "another workspace knows none of this one's threads");
    assert.deepEqual(await known(A, []), []);
    assert.deepEqual(await known(A, null), []);
  },
);

test(
  "every door is the service role's: a session calls none of them",
  { skip: skip || (!ANON ? "no SUPABASE_ANON_KEY in env" : false) },
  async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const id = crypto.randomUUID();
    const at = iso(Date.now());
    for (const [fn, args] of [
      ["put_mailbox_credentials", { p_connection_id: id, p_secret: {}, p_if_refresh_token: null }],
      ["get_mailbox_credentials", { p_connection_id: id }],
      ["drop_mailbox_credentials", { p_connection_id: id }],
      [
        "mailbox_connection_connect",
        {
          p_tenant_id: A,
          p_user_id: null,
          p_provider: "google",
          p_account: "x",
          p_address: "x@x.example",
          p_from_name: "x",
          p_scopes: [],
          p_customer_domain: false,
        },
      ],
      ["mailbox_capacity", { p_mailbox_id: id, p_at: at }],
      ["reach_out_claim_from", { p_mailbox_id: id, p_cap: 1, p_at: at, p_limit: 1 }],
      ["reach_out_due_mailboxes", { p_at: at, p_limit: 1 }],
      ["outreach_mailbox_facts", { p_tenant_id: A, p_contact_id: id, p_to: "x@x.example", p_from: "y@y.example" }],
      ["mailbox_connection_counts", { p_mailbox_id: id, p_since: null }],
      ["mailbox_threads_known", { p_tenant_id: A, p_thread_ids: [] }],
      [
        "stamp_email_from_mailbox",
        {
          p_tenant_id: A,
          p_message_id: id,
          p_provider_id: "x",
          p_rfc_message_id: "<x@x.example>",
          p_thread_id: "x",
          p_mailbox_id: id,
        },
      ],
    ]) {
      const r = await anon.rpc(fn, args);
      assert.ok(r.error, `${fn}: refused to a session`);
      assert.equal(r.error.code, "42501", `${fn}: ${r.error.message}`);
    }
    const write = await anon.from("mailbox_connections").insert({
      tenant_id: A,
      provider: "google",
      provider_account: "anon",
      address: `anon@anon-${stamp}.example`,
      host: `anon-${stamp}.example`,
      from_name: "Anon",
    });
    assert.ok(write.error, "no session writes a mailbox");
  },
);
