/**
 * The plan job over a world in memory (the content loop PRD's 10.2, 12.5, 15.1): a workspace's week drafted from what it
 * has, with nothing made; AI's words asked once for the week (a writer of the test's own here), each held to the claims
 * rule; the clips it picked keep their moments; the owner is told once that the
 * week is ready; a week with thin footage says fewer and asks what to film, once; a plan no longer drafting is left
 * alone. apps/edge/lib/content/plan.ts over tests/_fake-db.mjs.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mondayOf, shiftKey, dayInZone, WEEK_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

for (const k of ["RESEND_API_KEY", "SUPABASE_URL"]) delete process.env[k];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { planTheWeek } = await import(at("apps/edge/lib/content/plan.ts"));
after(() => setPg(null));

const T = "aaaa1111-4444-4000-8000-000000000031";
const PLAN = "bbbb2222-4444-4000-8000-000000000032";
const CLIP = "cccc3333-4444-4000-8000-000000000033";
const DARK = "cccc3333-4444-4000-8000-000000000034";
const ZONE = "America/New_York";
// Next week, so every day of it is still to come whatever day the suite runs.
const WEEK = shiftKey(mondayOf(dayInZone(ZONE, Date.now()).key), 7);
const NOW = new Date().toISOString();

const clip = (id, look) => ({
  id,
  tenant_id: T,
  name: `clip-${id.slice(-2)}`,
  kind: "video",
  source: "upload",
  status: "filed",
  removed_at: null,
  copy_state: "here",
  look_status: "done",
  created_at: NOW,
  look,
});

function world({ footage = true, rung = "ask" } = {}) {
  const written = [];
  const moments = [];
  const holds = [];
  const tables = {
    tenants: [{ id: T, timezone: ZONE, slug: "studio", name: "Studio" }],
    tenant_config: [{ tenant_id: T, config: { features: { content_preview: true, content_plan: true } }, version: 1 }],
    content_plans: [{ id: PLAN, tenant_id: T, week_of: WEEK, status: "drafting", asked_by: "clock" }],
    owner_claims: [
      {
        id: "dddd4444-4444-4000-8000-000000000035",
        tenant_id: T,
        kind: "offer",
        text: "20% off a first colour",
        source: "settings",
        valid_until: shiftKey(WEEK, 5),
        withdrawn_at: null,
        created_at: NOW,
      },
    ],
    content_goals: [],
    files: footage
      ? [
          clip(CLIP, { use: "finished colour result", moments: [{ at: 4, what: "the finished colour" }], issues: [] }),
          clip(DARK, { use: "a toner going on", moments: [], issues: ["too dark to see the colour"] }),
        ]
      : [],
    posts: [],
    pieces: [],
    file_moments: [],
    google_reviews: [],
    google_connections: [],
    tenant_channels: [
      {
        id: "eeee5555-4444-4000-8000-000000000036",
        tenant_id: T,
        kind: "instagram",
        external_id: "17841400000000031",
        credentials_ref: "ref",
        status: "active",
        config: { login: "meta", scopes: ["instagram_basic", "instagram_content_publish"], username: "studio" },
        created_at: NOW,
      },
    ],
    notifications: [],
    jobs: [],
    // Approve the week's rung (00712): the workspace's row, as provision_tenant gives it.
    policies: [
      {
        id: "abab7777-4444-4000-8000-000000000037",
        tenant_id: T,
        class: "plan_approve",
        mode: rung,
        subject_type: null,
        subject_id: null,
        limits: {},
      },
    ],
  };
  const db = fakeDb(
    tables,
    {},
    {
      content_plan_write: (args) => {
        written.push(args);
        const plan = tables.content_plans.find((p) => p.id === args.p_plan_id);
        if (!plan || plan.status !== "drafting") return { fate: plan ? plan.status : "gone" };
        plan.status = "ready";
        plan.fewer = args.p_fewer || null;
        return { fate: "ready", slots: args.p_slots.length };
      },
      file_moments_keep: (args) => {
        moments.push(args);
        return args.p_moments.length;
      },
      // The making queue started once a week is held (00712): it prepares the week ahead, in turn.
      content_weeks_start: () => 1,
      // content_week_hold (00712), as the door: held under a rung that holds or sends the week, else let go.
      content_week_hold: (args) => {
        holds.push(args);
        const plan = tables.content_plans.find((p) => p.id === args.p_plan_id);
        const mode = tables.policies.find((p) => p.class === "plan_approve")?.mode;
        if (!args.p_goes_at || !plan || plan.status !== "ready" || !["veto", "auto"].includes(mode))
          return { fate: "asks" };
        plan.goes_at = args.p_goes_at;
        return { fate: "held", goes_at: args.p_goes_at, mode };
      },
    },
  );
  setPg(db);
  return { db, tables, written, moments, holds };
}

const job = { id: "job-1", tenant_id: T, kind: "content_plan", payload: { plan_id: PLAN }, attempts: 1 };

/**
 * AI's words for the week, as the test's own writer answers them: each creative its line and caption (the caption the test
 * names, else one that says only the owner's offer), and every call it was asked kept, so the test sees what it was asked.
 */
function wordsFor(caption = "Warm colour that grows out soft. 20% off a first colour this week.") {
  const asked = [];
  const writer = async (week) => {
    asked.push(week);
    return new Map(
      week.creatives.map((c) => [c.key, { line: "Warm colour", over: null, under: null, caption, language: "en" }]),
    );
  };
  writer.asked = asked;
  return writer;
}

test("AI words the week once, each creative once, and the words go on its slots as the Week shows them", async () => {
  const w = world();
  const words = wordsFor();
  await planTheWeek(w.db, job, words);
  assert.equal(words.asked.length, 1, "one call a week");
  const creatives = new Set(w.written[0].p_slots.filter((s) => s.state !== "needs_footage").map((s) => s.creative));
  assert.equal(words.asked[0].creatives.length, creatives.size, "each creative once");
  for (const slot of w.written[0].p_slots.filter((s) => s.state === "proposed"))
    assert.equal(slot.words.caption, "Warm colour that grows out soft. 20% off a first colour this week.");
});

test("words that say what the owner never said keep the creative's slots blocked, with the claims rule's words and fix", async () => {
  const w = world();
  await planTheWeek(w.db, job, wordsFor("Book now for $50, this week only."));
  const held = w.written[0].p_slots.filter((s) => s.state === "blocked" && s.blocked_why === "claim");
  assert.ok(held.length >= 1, "the creative waits for the owner");
  assert.match(held[0].blocked_reason, /50/, "the words say what it was");
  assert.equal(
    held[0].words.caption,
    "Book now for $50, this week only.",
    "and keep what AI wrote, for the owner to see",
  );
});

test("a week whose words could not be written is drafted without them, and says so on each row the approval makes", async () => {
  const w = world();
  const none = async () => new Map();
  await planTheWeek(w.db, job, none);
  const live = w.written[0].p_slots.filter((s) => s.state === "proposed");
  assert.ok(live.length >= 1);
  for (const slot of live) assert.equal(slot.words, null);
});

test("a week is drafted from what the business has: within the cadence, each slot with its reason, nothing made", async () => {
  const w = world();
  assert.equal(await planTheWeek(w.db, job, wordsFor()), undefined);
  const [write] = w.written;
  const slots = write.p_slots;
  const live = slots.filter((s) => s.state === "proposed");
  assert.ok(live.length >= 1, "a post for the clip that tells the offer");
  const offer = live.find((s) => s.intent?.offer);
  assert.equal(offer.file_id, CLIP, "the clip that shows the work, not the dark one");
  assert.equal(offer.kind, "reel");
  assert.equal(offer.reason, "20% off a first colour");
  for (const slot of slots) assert.equal(Object.hasOwn(slot, "piece_id"), false, "nothing is made");
  assert.deepEqual(
    w.moments.map((m) => m.p_file_id),
    [CLIP],
    "the clip it picked keeps its moments",
  );
  assert.equal(w.moments[0].p_moments[0].shows[0], "the finished colour");
});

test("the owner is told once that the week is ready, and a plan no longer drafting is left alone", async () => {
  const w = world();
  await planTheWeek(w.db, job, wordsFor());
  const ready = w.tables.notifications.filter((n) => n.kind === "plan_ready");
  assert.equal(ready.length, 1);
  assert.equal(ready[0].title, WEEK_WORDS.readySubject);
  assert.equal(ready[0].route, "campaigns/content:week");
  assert.deepEqual(
    await planTheWeek(w.db, job, wordsFor()),
    { skipped: "ready" },
    "tried again, the week stands as written",
  );
  assert.equal(w.tables.notifications.filter((n) => n.kind === "plan_ready").length, 1, "told once");
});

test("thin footage: the week says fewer and asks what to film, once a week", async () => {
  const w = world({ footage: false });
  await planTheWeek(w.db, job, wordsFor());
  const [write] = w.written;
  assert.match(write.p_fewer, /^Nothing to post this week/);
  const asks = write.p_slots.filter((s) => s.state === "needs_footage");
  assert.ok(asks.length >= 1 && asks.length <= 3);
  assert.equal(asks[0].reason, "20% off a first colour");
  const told = w.tables.notifications.filter((n) => n.kind === "footage_ask");
  assert.equal(told.length, 1);
  assert.match(told[0].body, /^10 seconds of /);
});

test("a plan gone, or one approved since, is left as it is", async () => {
  const w = world();
  w.tables.content_plans[0].status = "approved";
  assert.deepEqual(await planTheWeek(w.db, job, wordsFor()), { skipped: "approved" });
  assert.deepEqual(await planTheWeek(w.db, { ...job, payload: { plan_id: "ffff6666-4444-4000-8000-000000000039" } }), {
    skipped: "gone",
  });
  assert.equal(w.written.length, 0);
});

test("under a rung that asks, a ready week is held to no time and its notice says nothing goes up until the owner approves", async () => {
  const w = world();
  await planTheWeek(w.db, job, wordsFor());
  assert.equal(w.holds.length, 1, "the door is asked, and decides");
  assert.equal(w.holds[0].p_goes_at, undefined, "no time is asked for");
  assert.equal(w.tables.content_plans[0].goes_at, undefined);
  assert.match(
    w.tables.notifications.find((n) => n.kind === "plan_ready").body,
    /Nothing goes up until you approve them/,
  );
});

test("under Holds it, a ready week is held to the next 8:00 AM in the business's zone, and its notice says so", async () => {
  const w = world({ rung: "veto" });
  await planTheWeek(w.db, job, wordsFor());
  const goes = w.tables.content_plans[0].goes_at;
  assert.ok(goes, "held to a time");
  assert.ok(Date.parse(goes) > Date.now() && Date.parse(goes) - Date.now() <= 86_400_000, "within the day ahead");
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(goes));
  assert.equal(local, "8:00 AM");
  assert.match(
    w.tables.notifications.find((n) => n.kind === "plan_ready").body,
    /go up at 8:00 AM unless you stop them/,
  );
});

test("under Sends it, a ready week goes now, and its notice says AI approved it as the owner set", async () => {
  const w = world({ rung: "auto" });
  await planTheWeek(w.db, job, wordsFor());
  assert.ok(Math.abs(Date.parse(w.tables.content_plans[0].goes_at) - Date.now()) < 60_000, "held to now");
  assert.match(w.tables.notifications.find((n) => n.kind === "plan_ready").body, /AI approved them, as you set it/);
});
