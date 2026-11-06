/**
 * Every verified delivery is kept seven days under the provider's own id (00336, decision 0032 step 4), on a real
 * Postgres: a redelivery under the same id keeps the first; the purge drops what is a week old and keeps what is
 * younger, run with its default so a default that drifts from contracts' RETENTION_DAYS fails here; an erasure's scrub
 * deletes the workspace's rows, and the rows no door could place, whose body names the person by any needle, without
 * regard to case and through a form-encoded address, and nothing else, a needle's `_` never a wildcard; and the table
 * is the service role's alone (tenancy.db.test.mjs holds the floor). Runs against the database `supabase start` builds
 * on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { RETENTION_DAYS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes and purges kept deliveries"
      : false;

let db;
const made = [];
const RUN = Date.now().toString(36);
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function workspace(tag) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ name: `Intake ${tag}`, slug: `intake-${tag}-${RUN}` })
      .select("id")
      .single(),
    "workspace",
  ).id;
  made.push(t);
  return t;
}

const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

/** A kept delivery as a door writes it (packages/db keepProviderEvent): the same upsert, ignoring a duplicate. */
const keep = (row) =>
  db
    .from("provider_events")
    .upsert(
      {
        provider: "twilio",
        door: "/api/inbound-sms",
        url: "https://edge.example.com/api/inbound-sms",
        headers: { "x-twilio-signature": "made-up" },
        verified: true,
        ...row,
      },
      { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
    )
    .select("provider_event_id, body");

const kept = async (ids) =>
  ok(await db.from("provider_events").select("provider_event_id, body").in("provider_event_id", ids), "kept");

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  await db.from("provider_events").delete().like("provider_event_id", `%-${RUN}`);
  for (const t of made) await db.from("tenants").delete().eq("id", t);
});

test("a redelivery under the same id keeps the first", { skip }, async () => {
  const t = await workspace("again");
  const id = `SM-again-${RUN}`;
  ok(await keep({ provider_event_id: id, tenant_id: t, body: "From=%2B15550100123&Body=first" }), "first");
  ok(await keep({ provider_event_id: id, tenant_id: t, body: "From=%2B15550100123&Body=second" }), "second");
  assert.deepEqual(await kept([id]), [{ provider_event_id: id, body: "From=%2B15550100123&Body=first" }]);
});

test(
  "the purge drops a delivery a week old and keeps a younger one, with the contract's days as its default",
  { skip },
  async () => {
    const t = await workspace("purge");
    const days = RETENTION_DAYS.provider_events;
    const old = `SM-old-${RUN}`;
    const young = `SM-young-${RUN}`;
    ok(await keep({ provider_event_id: old, tenant_id: t, body: "old", received_at: ago(days + 1) }), "old");
    ok(await keep({ provider_event_id: young, tenant_id: t, body: "young", received_at: ago(days - 1) }), "young");
    const n = ok(await db.rpc("purge_provider_events"), "purge");
    assert.ok(n >= 1, "at least the old one went");
    assert.deepEqual(
      (await kept([old, young])).map((r) => r.provider_event_id),
      [young],
    );
  },
);

test(
  "an erasure's scrub deletes the workspace's rows and the unplaced rows that name the person, and nothing else",
  { skip },
  async () => {
    const t = await workspace("scrub");
    const other = await workspace("other");
    const digits = "15550100777";
    const rows = [
      [`SM-names-${RUN}`, t, `From=%2B${digits}&Body=hi`],
      [`SM-unplaced-${RUN}`, null, `{"entry":[{"changes":[{"value":{"contacts":[{"wa_id":"${digits}"}]}}]}]}`],
      [`SM-another-${RUN}`, t, "From=%2B15550100999&Body=hi"],
      [`SM-theirs-${RUN}`, other, `From=%2B${digits}&Body=hi`],
    ];
    for (const [id, tenant, body] of rows) ok(await keep({ provider_event_id: id, tenant_id: tenant, body }), id);
    const n = ok(
      await db.rpc("provider_events_scrub", { p_tenant_id: t, p_needles: [digits, "no@example.com", "123"] }),
      "scrub",
    );
    assert.equal(n, 2, "the workspace's own and the unplaced one; a needle under six characters matches nothing");
    assert.deepEqual(
      (await kept(rows.map((r) => r[0]))).map((r) => r.provider_event_id).sort(),
      [`SM-another-${RUN}`, `SM-theirs-${RUN}`].sort(),
      "another person's row and another workspace's row stay",
    );
    assert.equal(ok(await db.rpc("provider_events_scrub", { p_tenant_id: t, p_needles: [] }), "none"), 0);
  },
);

test(
  "the scrub reads a body as a provider spells it: any case, an address form-encoded, and a needle's _ as itself",
  { skip },
  async () => {
    const t = await workspace("spelt");
    const rows = [
      [`RE-cased-${RUN}`, `{"type":"email.bounced","data":{"to":["Ada_B@Example.com"]}}`],
      [`SM-encoded-${RUN}`, "From=%2B15550100555&Body=write+to+ada_b%40example.com"],
      [`RE-wildcard-${RUN}`, `{"type":"email.bounced","data":{"to":["adaxb@example.com"]}}`],
    ];
    for (const [id, body] of rows) ok(await keep({ provider_event_id: id, tenant_id: t, body }), id);
    const n = ok(await db.rpc("provider_events_scrub", { p_tenant_id: t, p_needles: ["ada_b@example.com"] }), "scrub");
    assert.equal(n, 2, "the address in another case, and the address a form-encoded body carries");
    assert.deepEqual(
      (await kept(rows.map((r) => r[0]))).map((r) => r.provider_event_id),
      [`RE-wildcard-${RUN}`],
      "a needle's _ is an underscore: another address that differs there stays",
    );
  },
);
