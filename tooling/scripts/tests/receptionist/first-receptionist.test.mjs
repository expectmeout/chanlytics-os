/**
 * The receptionist from what is known (the first run's Check): POST /api/v1/settings/receptionist, run through route()
 * with a database in memory. It sets the receptionist up where there is none -- from Google's listing when one is
 * linked, the name typed at sign-up otherwise -- and fills what Google says into one that states none of it: what is
 * proved is the policy it declares, what it writes, and what it refuses to touch.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { newReceptionistDefaults, parseTenantConfig, FALLBACK_DEFAULTS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const receptionist = await import(at("apps/dashboard/app/api/v1/settings/receptionist/route.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));

beforeEach(() => setRateStore(memoryStore()));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const inT = `?workspace=${T}`;
const post = () => new Request(`http://localhost/api/v1/x${inT}`, { method: "POST", body: "{}" });
/** A session over these tables, and the service role over the same ones: settings.changed is the service role's write. */
const ctxFor = (tables) => (
  setServiceClient(fakeDb(tables)),
  { supabase: fakeDb(tables), userId: USER, email: "ada@example.com", params: {} }
);
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
const writes = (ctx) => ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;

// Google's week as the edge stores it (day 0 is Sunday): Monday to Friday, nine to five.
const WEEKDAYS = [1, 2, 3, 4, 5].map((day) => ({
  open: { day, hour: 9, minute: 0 },
  close: { day, hour: 17, minute: 0 },
}));
const tables = ({ config = {}, listing = null, role = "owner" } = {}) => ({
  memberships: [{ user_id: USER, tenant_id: T, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  tenants: [{ id: T, name: "Harbor Moving", timezone: "America/New_York" }],
  tenant_config: [{ tenant_id: T, config, version: 4, updated_at: "2026-09-01T00:00:00Z" }],
  google_listings: listing ? [{ tenant_id: T, ...listing }] : [],
  events: [],
});
const LISTED = {
  name: "Harbor Moving & Storage",
  address: "12 Pier Rd, Brooklyn, NY 11231",
  facts: {
    hours: WEEKDAYS,
    phone_e164: "+17185550100",
    phone_display: "(718) 555-0100",
    website: "https://harbor.example.com/",
    primary_type: "moving_company",
    primary_type_label: "Moving company",
    service_area_only: false,
    time_zone: "America/New_York",
  },
};
const NINE_TO_FIVE = { open: "09:00", close: "17:00" };

test("the policy: a write, the workspace's, the owner's or the partner's (0012), counted with the settings", () => {
  assert.deepEqual(receptionist.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "settings",
    spend: false,
  });
});

test("with a listing linked and no receptionist, the receptionist is Google's: written at the next version, by its author, and recorded", async () => {
  const t = tables({ config: { notifications: { escalation_emails: ["ada@example.com"] } }, listing: LISTED });
  const out = await receptionist.POST.run(post(), ctxFor(t));
  assert.deepEqual(out, { wrote: true });
  const row = t.tenant_config[0];
  assert.deepEqual([row.version, row.updated_by], [5, USER]);
  const saved = parseTenantConfig(row.config);
  assert.deepEqual(saved.brain, {
    business_name: "Harbor Moving & Storage",
    ...newReceptionistDefaults("Harbor Moving & Storage"),
    profile: {
      hours: {
        mon: NINE_TO_FIVE,
        tue: NINE_TO_FIVE,
        wed: NINE_TO_FIVE,
        thu: NINE_TO_FIVE,
        fri: NINE_TO_FIVE,
        sat: {},
        sun: {},
      },
      address: "12 Pier Rd, Brooklyn, NY 11231",
      website: "https://harbor.example.com/",
    },
  });
  assert.deepEqual(saved.notifications, { escalation_emails: ["ada@example.com"] }, "what else the config held stays");
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.subject_id, e.data.fields, e.data.by, e.data.version]),
    [["settings.changed", T, ["address", "business_name", "fallbacks", "hours", "system_prompt", "website"], USER, 5]],
    "the keys that changed, never their values",
  );
  assert.deepEqual(Object.keys(t.events[0].data).sort(), ["by", "fields", "version"]);
});

test("not on Google, the receptionist is the name typed at sign-up, with the product's own prompt and messages", async () => {
  const t = tables();
  assert.deepEqual(await receptionist.POST.run(post(), ctxFor(t)), { wrote: true });
  const saved = parseTenantConfig(t.tenant_config[0].config);
  assert.equal(saved.brain.business_name, "Harbor Moving");
  assert.deepEqual(saved.brain.fallbacks, FALLBACK_DEFAULTS);
  assert.equal(saved.brain.profile, undefined, "nothing is known beyond the name");
});

test("a receptionist already set up is never replaced: Google fills only what it states none of, and nothing when it states it all", async () => {
  const brain = {
    business_name: "Harbor Moving",
    system_prompt: "You are the receptionist for Harbor Moving, which quotes each move before it is booked.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  // Set up with the name alone (not on Google, said), and the listing linked after: Google's facts are filled in.
  const t = tables({ config: { brain }, listing: LISTED });
  assert.deepEqual(await receptionist.POST.run(post(), ctxFor(t)), { wrote: true });
  const filled = parseTenantConfig(t.tenant_config[0].config).brain;
  assert.equal(filled.business_name, "Harbor Moving", "its own name stays");
  assert.equal(filled.system_prompt, brain.system_prompt, "and its own words");
  assert.deepEqual(Object.keys(filled.profile).sort(), ["address", "hours", "website"]);
  assert.deepEqual(
    t.events.map((e) => e.data.fields),
    [["address", "hours", "website"]],
  );
  // Everything Google gives is stated already: nothing written, and the owner's own facts stand.
  const own = {
    ...brain,
    profile: {
      address: "1 Dock St, Brooklyn, NY 11201",
      website: "https://harbor-own.example.com/",
      hours: { mon: {} },
    },
  };
  const set = ctxFor(tables({ config: { brain: own }, listing: LISTED }));
  assert.deepEqual(await receptionist.POST.run(post(), set), { wrote: false });
  assert.equal(writes(set), 0, "nothing written");
  const unlinked = ctxFor(tables({ config: { brain } }));
  assert.deepEqual(await receptionist.POST.run(post(), unlinked), { wrote: false }, "no listing: nothing to add");
  assert.equal(writes(unlinked), 0);
  const broken = ctxFor(tables({ config: "nonsense", listing: LISTED }));
  await refused(receptionist.POST.run(post(), broken), "conflict", 409, "could not be read");
  assert.equal(writes(broken), 0);
  const missing = { ...tables(), tenant_config: [] };
  await refused(receptionist.POST.run(post(), ctxFor(missing)), "conflict", 409, "no settings record yet");
});

test("only an owner sets it up", async () => {
  const ctx = ctxFor(tables({ role: "operator" }));
  await refused(receptionist.POST.run(post(), ctx), "forbidden", 403);
  assert.equal(writes(ctx), 0);
});

test("a colleague who set one up first wins: nothing is written over theirs; a save of something else is the settings' own conflict", async () => {
  const brain = {
    business_name: "Harbor Moving Co",
    system_prompt: "You are the receptionist for Harbor Moving Co, answering customers in a warm, short way.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  // The read sees version 4 with no receptionist; by the write, a colleague's save has moved it to 5.
  const race = (theirs) => {
    const t = tables();
    const ctx = ctxFor(t);
    const from = ctx.supabase.from.bind(ctx.supabase);
    let reads = 0;
    ctx.supabase.from = (table) => {
      if (table === "tenant_config" && ++reads === 2) Object.assign(t.tenant_config[0], { version: 5, config: theirs });
      return from(table);
    };
    return { t, ctx };
  };
  const first = race({ brain });
  assert.deepEqual(await receptionist.POST.run(post(), first.ctx), { wrote: false });
  assert.equal(
    parseTenantConfig(first.t.tenant_config[0].config).brain.business_name,
    "Harbor Moving Co",
    "theirs stays",
  );
  const other = race({ calendar: { ical_url: "https://calendar.example.com/harbor.ics" } });
  await refused(receptionist.POST.run(post(), other.ctx), "conflict", 409, "Someone else saved settings");
});

test("REGRESSION (row 20): setting the receptionist up keeps what a newer build stored, a section and a field inside one", async () => {
  // The config column is written whole. A section this build has never heard of, and a field inside one it has, were
  // left out of what was read, so they were left out of what was written back: deleted by a rolled-back dashboard's
  // first receptionist as by its settings save (contracts withStoredKeysKept). The ledger names only what changed.
  const stored = {
    guardrails: { no_prices: true },
    notifications: { escalation_emails: ["ada@example.com"], digest_hour: 7 },
  };
  const t = tables({ config: structuredClone(stored) });
  assert.deepEqual(await receptionist.POST.run(post(), ctxFor(t)), { wrote: true });
  const row = t.tenant_config[0];
  assert.equal(row.version, 5, "written once, at the next version");
  assert.equal(row.config.brain.business_name, "Harbor Moving", "the receptionist is set up from the workspace's name");
  assert.deepEqual(row.config.guardrails, { no_prices: true }, "a section this build has never heard of is kept");
  assert.equal(row.config.notifications.digest_hour, 7, "and a field inside one it has");
  assert.deepEqual(row.config.notifications.escalation_emails, ["ada@example.com"]);
  assert.ok(
    t.events[0].data.fields.every((f) => f !== "guardrails" && f !== "digest_hour"),
    "the ledger names the receptionist's fields, not the ones kept",
  );
});
