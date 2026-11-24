/**
 * A website's keys from Settings › Connections (00675), through the dashboard's own route over a database in memory: a
 * key made for a site is answered once and kept only as its hash, the hash the edge's door looks it up by; a key
 * changed is a new one by the same name with the old one honoured a day; a key ended is refused from then; a viewer
 * may press none of it; and the read says each key's last use, when an entry last arrived and where a site sends them,
 * never a key or its hash.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const ENV = {
  EDGE_URL: "https://edge.test",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:1",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-only",
};
const was = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
Object.assign(process.env, ENV);
after(() => {
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const route = await import(at("apps/dashboard/app/api/v1/website-forms/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "11111111-1111-4111-8111-111111111111";
const PERSON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DAY = 86_400_000;
/** The site 00709 fills in for the first key. */
const FIRST_SITE = "5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e";
const sha = (key) => createHash("sha256").update(key, "utf8").digest("hex");

/** The owner's doors as 00675 writes them: an owner or a partner, at most ten keys that work, a change's day. */
function world(role = "owner") {
  const tables = {
    memberships: [{ user_id: U, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
    form_keys: [],
    form_sites: [],
    outside_forms: [],
    form_entries: [
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        tenant_id: A,
        contact_id: PERSON,
        key_id: null,
        form: "request",
        answers: { form: "request" },
        ref: null,
        words: "a".repeat(64),
        owed: ["note", "notice"],
        effects: {},
        state: "processed",
        told_at: "2026-11-20T10:00:05Z",
        created_at: "2026-11-20T10:00:00Z",
      },
    ],
  };
  const may = () => {
    if (role !== "owner" && role !== "partner")
      throw Object.assign(new Error("Not yours to change."), { code: "42501" });
  };
  const live = (k) => !k.ends_at || Date.parse(k.ends_at) > Date.now();
  const supabase = fakeDb(
    tables,
    {},
    {
      form_key_make: (a) => {
        may();
        if (tables.form_keys.filter((k) => k.tenant_id === a.p_tenant_id && live(k)).length >= 10)
          throw Object.assign(new Error("A workspace has at most ten keys that work. End one first."), {
            code: "22023",
          });
        const id = crypto.randomUUID();
        // Its site (00709): the one named, or a new one named as the key is.
        const site = a.p_site_id ?? crypto.randomUUID();
        if (!a.p_site_id)
          tables.form_sites.push({
            id: site,
            tenant_id: a.p_tenant_id,
            name: a.p_name.trim(),
            host: null,
            first_entry_at: null,
            last_entry_at: null,
            test_at: null,
            created_at: new Date().toISOString(),
          });
        tables.form_keys.push({
          id,
          site_id: site,
          tenant_id: a.p_tenant_id,
          name: a.p_name.trim(),
          hash: a.p_hash,
          first: false,
          made_by: U,
          created_at: new Date().toISOString(),
          last_used_at: null,
          ends_at: null,
        });
        return id;
      },
      form_key_change: (a) => {
        may();
        const old = tables.form_keys.find((k) => k.id === a.p_key_id && !k.ends_at);
        if (!old) throw Object.assign(new Error("That key is ending or has ended already."), { code: "P0002" });
        const id = crypto.randomUUID();
        tables.form_keys.push({
          ...old,
          id,
          name: old.name ?? "Website",
          hash: a.p_hash,
          first: false,
          ends_at: null,
          last_used_at: null,
        });
        old.ends_at = new Date(Date.now() + DAY).toISOString();
        return { id, name: old.name ?? "Website" };
      },
      form_key_end: (a) => {
        may();
        const k = tables.form_keys.find((x) => x.id === a.p_key_id && live(x));
        if (!k) return false;
        k.ends_at = new Date().toISOString();
        return true;
      },
    },
  );
  const ctx = { supabase, userId: U, email: "ada@example.com", params: {} };
  return { tables, ctx };
}

const press = (body) =>
  new Request(`http://localhost/api/v1/website-forms?workspace=${A}`, { method: "POST", body: JSON.stringify(body) });
const looked = () => new Request(`http://localhost/api/v1/website-forms?workspace=${A}`);

test("a key made is answered once and kept only as the hash the edge's door looks it up by", async () => {
  const w = world();
  const answer = await route.POST.run(press({ act: "make", name: "  Main site " }), w.ctx);
  assert.equal(answer.ended, false);
  const { made } = answer;
  assert.equal(made.name, "Main site");
  assert.match(made.key, /^[A-Za-z0-9_-]{43}$/, "32 random bytes, the first key's length");
  assert.equal(w.tables.form_keys.length, 1);
  const kept = w.tables.form_keys[0];
  assert.equal(kept.hash, sha(made.key), "its sha-256, as the edge hashes what a site sends");
  assert.ok(!JSON.stringify(w.tables).includes(made.key), "the key itself is kept nowhere");
  const again = (await route.POST.run(press({ act: "make", name: "Main site" }), w.ctx)).made;
  assert.notEqual(again.key, made.key, "each key its own");
});

test("a key changed: a new one by the same name, the old one honoured a day; a key ended stops at once", async () => {
  const w = world();
  const first = (await route.POST.run(press({ act: "make", name: "Main site" }), w.ctx)).made;
  const changed = await route.POST.run(press({ act: "change", key_id: first.id }), w.ctx);
  assert.equal(changed.made.name, "Main site");
  assert.notEqual(changed.made.key, first.key);
  const old = w.tables.form_keys.find((k) => k.id === first.id);
  const grace = Date.parse(old.ends_at) - Date.now();
  assert.ok(grace > DAY - 60_000 && grace <= DAY, "a day more for the site to move");
  assert.deepEqual(await route.POST.run(press({ act: "end", key_id: changed.made.id }), w.ctx), {
    made: null,
    ended: true,
  });
  assert.ok(Date.parse(w.tables.form_keys.find((k) => k.id === changed.made.id).ends_at) <= Date.now());
  await assert.rejects(
    route.POST.run(press({ act: "change", key_id: changed.made.id }), w.ctx),
    // The door's own refusal, which the route answers as a 404 in its words.
    (x) => x.code === "P0002" && /ending or has ended/.test(x.message),
    "a key ended cannot be changed",
  );
  // Nor one already on its last day: changed twice, two old keys would be working.
  await assert.rejects(route.POST.run(press({ act: "change", key_id: first.id }), w.ctx), (x) => x.code === "P0002");
  assert.equal(w.tables.form_keys.length, 2, "nothing more was made");
});

test("a viewer or an operator may press none of it, and a body that is not one is refused", async () => {
  for (const role of ["viewer", "operator"]) {
    const w = world(role);
    await assert.rejects(
      route.POST.run(press({ act: "make", name: "Main site" }), w.ctx),
      (x) => x.code === "forbidden",
    );
    assert.equal(w.tables.form_keys.length, 0);
  }
  const w = world();
  await assert.rejects(route.POST.run(press({ act: "make", name: " " }), w.ctx), (x) => x.status === 400);
  await assert.rejects(route.POST.run(press({ act: "end", key_id: "not-a-key" }), w.ctx), (x) => x.status === 400);
  await assert.rejects(route.POST.run(press({ act: "make", name: "x".repeat(61) }), w.ctx), (x) => x.status === 400);
});

test("the read: each key's last use and end, the last entry, where a site sends them; never a key or its hash", async () => {
  const w = world();
  // The first key, with the site 00709 filled in for it, made before the others.
  w.tables.form_sites.push({
    id: FIRST_SITE,
    tenant_id: A,
    name: null,
    host: "harbor.example.com",
    first_entry_at: null,
    last_entry_at: null,
    test_at: null,
    created_at: "2026-11-01T00:00:00Z",
  });
  const made = (await route.POST.run(press({ act: "make", name: "Main site" }), w.ctx)).made;
  w.tables.form_keys.push({
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    site_id: FIRST_SITE,
    tenant_id: A,
    name: null,
    hash: null,
    first: true,
    made_by: null,
    created_at: "2026-11-01T00:00:00Z",
    last_used_at: "2026-11-19T09:00:00Z",
    ends_at: null,
  });
  // A key ended yesterday is not listed: only the keys that still work are.
  const gone = (await route.POST.run(press({ act: "make", name: "Old site" }), w.ctx)).made;
  w.tables.form_keys.find((k) => k.id === gone.id).ends_at = new Date(Date.now() - DAY).toISOString();
  const dto = await route.GET.run(looked(), w.ctx);
  const keys = dto.sites.flatMap((site) => site.keys);
  assert.ok(!keys.some((k) => k.id === gone.id), "a key that no longer works is not shown");
  assert.deepEqual(
    dto.sites.map((site) => [site.name, site.keys.length]).sort(),
    [
      ["Main site", 1],
      ["Old site", 0],
      ["harbor.example.com", 1],
    ],
    "each key under its site; a site whose keys ended stays, with none",
  );
  assert.equal(dto.last_received_at, "2026-11-20T10:00:00Z");
  assert.deepEqual(dto.door, { address: "https://edge.test/api/website-form", workspace: A });
  assert.equal(dto.can_change, true);
  assert.deepEqual(
    keys.map((k) => [k.name, k.first, k.last_used_at]).sort(),
    [
      ["Main site", false, null],
      [null, true, "2026-11-19T09:00:00Z"],
    ].sort(),
  );
  const said = JSON.stringify(dto);
  assert.ok(!said.includes(made.key) && !said.includes(sha(made.key)), "neither the key nor its hash");
  assert.equal((await route.GET.run(looked(), world("viewer").ctx)).can_change, false, "a viewer reads, and may not");
});
