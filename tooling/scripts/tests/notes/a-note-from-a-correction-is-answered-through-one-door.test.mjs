/**
 * A note suggested from an owner's correction is answered through one door (POST fact-suggestions/:id, decision 0063),
 * which Settings › Autonomy presses: Keep writes the note into the settings with the version it read (the same write a
 * save on the page makes) and only then marks the suggestion kept with the version it wrote; a note the notes already say
 * is marked kept without a second copy; full notes, an answer already given, another workspace's suggestion and a role
 * below the settings' are each refused, and nothing reaches the door or the settings for a refusal. Dismiss is the door
 * alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

// The settings' audit row is written as the service role, best effort: a dead address here, which it logs and survives.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const route = await import(at("apps/dashboard/app/api/v1/fact-suggestions/[id]/route.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const S = "eeeeeeee-0000-4000-8000-00000000e001";
const PARKING = { title: "Parking", text: "Behind the shop." };
const MONDAYS = { title: "Mondays", text: "We are closed on Mondays." };
/** A workspace's settings as the write schema takes them, with these notes. */
const settingsWith = (notes) => ({
  brain: {
    business_name: "Harbor Salon",
    system_prompt: "You answer customers for Harbor Salon, kindly and briefly.",
    fallbacks: {
      greeting: "Hi, thanks for writing.",
      error: "Sorry, someone will be with you shortly.",
      non_text: "Could you write that as a message?",
    },
    profile: { notes },
  },
});

/** The workspace as the route reads it: the caller's seat, the settings, and the suggestion. */
function world(role, { notes = [PARKING], state = "suggested", tenant = T } = {}) {
  const doors = [];
  const tables = {
    memberships: [
      { user_id: "u1", tenant_id: T, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: T, config: settingsWith(notes), version: 4, updated_at: "2026-10-15T00:00:00Z" }],
    fact_suggestions: [
      {
        id: S,
        tenant_id: tenant,
        state,
        source: "reply",
        title: MONDAYS.title,
        body: MONDAYS.text,
        quote: "we're closed on Mondays now",
        conversation_id: null,
        created_at: "2026-10-16T09:00:00Z",
      },
    ],
  };
  const ctx = {
    supabase: fakeDb(
      tables,
      {},
      {
        fact_suggestion_answer: (a) => {
          doors.push(a);
          return { suggestion: { id: S, state: a.p_keep ? "kept" : "dismissed" } };
        },
      },
    ),
    userId: "u1",
    email: "ada@example.com",
    // A partner's seat asks for the second factor (0013): this session has shown it.
    aal: "aal2",
    params: { id: S },
  };
  return { ctx, doors, tables };
}
const post = (body) =>
  new Request(`http://localhost/api/v1/fact-suggestions/${S}`, { method: "POST", body: JSON.stringify(body) });

test("Keep writes the note with the version it read, then marks the suggestion kept with the version it wrote", async () => {
  const w = world("owner");
  const out = await route.POST.run(post({ keep: true }), w.ctx);
  assert.deepEqual(out, { suggestion: { id: S, state: "kept" }, version: 5, receipt: "Kept as a note: “Mondays”" });
  const [cfg] = w.tables.tenant_config;
  assert.equal(cfg.version, 5);
  assert.deepEqual(cfg.config.brain.profile.notes, [PARKING, MONDAYS], "the note as the receptionist will be told it");
  assert.equal(cfg.updated_by, "u1", "the row says who wrote what customers hear");
  assert.deepEqual(w.doors, [{ p_id: S, p_keep: true, p_config_version: 5 }]);
});

test("a partner keeps too; a note already said is kept without a second copy; Dismiss is the door alone", async () => {
  const said = world("partner", { notes: [PARKING, MONDAYS] });
  const out = await route.POST.run(post({ keep: true }), said.ctx);
  assert.equal(out.receipt, "Your notes already say this: “Mondays”");
  assert.equal(said.tables.tenant_config[0].version, 4, "nothing was written");
  assert.deepEqual(said.doors, [{ p_id: S, p_keep: true, p_config_version: 4 }]);
  const gone = world("owner");
  const out2 = await route.POST.run(post({ keep: false }), gone.ctx);
  assert.deepEqual(out2, { suggestion: { id: S, state: "dismissed" }, version: null, receipt: "Dismissed" });
  assert.equal(gone.tables.tenant_config[0].version, 4);
  assert.deepEqual(gone.doors, [{ p_id: S, p_keep: false }]);
});

test("refused in a sentence: an operator, full notes, an answer already given, another workspace's, and a body that is no answer", async () => {
  const operator = world("operator");
  await assert.rejects(route.POST.run(post({ keep: true }), operator.ctx), (e) => e.status === 403);
  const full = world("owner", {
    notes: Array.from({ length: 10 }, (_, i) => ({ title: `Note ${i}`, text: `Text ${i}.` })),
  });
  await assert.rejects(route.POST.run(post({ keep: true }), full.ctx), (e) => {
    assert.equal(e.code, "validation");
    assert.match(e.message, /Your notes are full \(10\)/);
    return true;
  });
  const answered = world("owner", { state: "kept" });
  await assert.rejects(route.POST.run(post({ keep: true }), answered.ctx), (e) => {
    assert.equal(e.status, 409);
    assert.equal(e.message, "This was answered already.");
    return true;
  });
  const theirs = world("owner", { tenant: OTHER });
  await assert.rejects(route.POST.run(post({ keep: false }), theirs.ctx), (e) => e.code === "not_found");
  const odd = world("owner");
  await assert.rejects(route.POST.run(post({ keep: "yes" }), odd.ctx), (e) => e.code === "validation");
  for (const w of [operator, full, answered, theirs, odd]) {
    assert.deepEqual(w.doors, [], "nothing reached the door for a refusal");
    assert.equal(w.tables.tenant_config[0].version, 4, "and nothing was written");
  }
});
