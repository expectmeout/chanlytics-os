/**
 * Cold email's one line on Today, from a read of its own: Today opens all day, so the note asks only what can make it speak,
 * through the page's one answer. It speaks up where cold email waits on the owner, says nothing otherwise, never nags each
 * morning over a sequence with no one new, and is asked again as the day moves, at most once a minute. And it is in Today's
 * first draw: a load that opens on Today holds that draw for it, and a tab that holds its last answer draws it at once.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { installStubReact, fresh, again, byTestId, textOf } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const T = "11111111-1111-4111-8111-111111111111";
const ROOT = "22222222-2222-4222-8222-222222222222";
const RUN = "33333333-3333-4333-8333-333333333333";
const SEARCH = "44444444-4444-4444-8444-444444444444";

const asked = [];
/** While set, the note's answer waits for it: a read still out. */
let noteHeldBack = null;
installStubReact({
  location: { pathname: "/w/harbor/", hash: "", search: "", origin: "https://app.chanlytics.com" },
  __WORKSPACES: [{ id: T, slug: "harbor", name: "Brightline", status: "active", timezone: "America/Chicago" }],
  __ACTIVE_WORKSPACE: T,
  fetch: (url) => {
    const u = String(url);
    asked.push(u);
    const day = {
      metrics: {},
      conversations: [],
      escalations: [],
      calls: [],
      searches: [{ id: SEARCH, name: "Clinics" }],
    };
    const body = u.includes("settings/reach-out/note")
      ? {
          ok: true,
          data: {
            note: {
              headline: "Your first 12 emails are ready for your OK",
              act: "Read and approve",
              to: `sends/${RUN}`,
            },
          },
        }
      : { ok: true, data: { read: day } };
    const answer = () =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    return u.includes("settings/reach-out/note") && noteHeldBack
      ? noteHeldBack.then(answer)
      : Promise.resolve(answer());
  },
});

const { GET } = await import("../../../apps/dashboard/app/api/v1/settings/reach-out/note/route.ts");
const { coldEmailNoteFactsOf } = await import("../../../apps/dashboard/src/server/readers/cold-email-note.ts");
const { ColdEmailNote } = await import("../../../apps/dashboard/src/surfaces/today/zones/cold-email-note.tsx");
const { holdTodayForNote, keptColdEmailNote } =
  await import("../../../apps/dashboard/src/surfaces/today/cold-email-note-read.ts");
const { PREFETCH_SLOT } = await import("@chanlytics/contracts");
const { clearReadCaches } = await import("../../../apps/dashboard/src/bridge/read-cache.ts");
const { api } = await import("../../../apps/dashboard/src/bridge/api.ts");
const { codeOutFor, markHydrated } = await import("../../../apps/dashboard/src/bridge/surface-status.ts");
const { applyToday } = await import("../../../apps/dashboard/src/surfaces/today/surface.ts");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

after(() => setSurfaceValue("today", undefined));

const connected = { id: "m1", tenant_id: T, state: "connected", held_why: null };
const root = (over = {}) => ({
  id: ROOT,
  sequence_id: ROOT,
  tenant_id: T,
  kind: "reach_out",
  trigger: "lead_first",
  name: "Clinics, first email",
  state: "running",
  lead_search_id: SEARCH,
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});
const FILLED = {
  brain: {
    business_name: "Brightline",
    system_prompt: "You answer as the front desk of Brightline, warmly and briefly.",
    fallbacks: { greeting: "Hi!", error: "One moment.", non_text: "A person will look at this." },
    profile: { address: "1 Main St, Austin, TX" },
  },
};

function contextOf(tables, config = FILLED, rpcs = {}) {
  return {
    supabase: fakeDb(
      {
        memberships: [
          {
            user_id: "u1",
            tenant_id: T,
            role: "owner",
            tenants: { slug: "harbor" },
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        tenants: [{ id: T, name: "Brightline", timezone: "America/Chicago" }],
        tenant_config: [{ tenant_id: T, config, version: 1 }],
        mailbox_connections: [],
        sequence_steps: [],
        sequence_batches: [],
        lead_searches: [
          { id: SEARCH, tenant_id: T, name: "Clinics", created_at: "2026-11-01T00:00:00Z", removed_at: null },
        ],
        ...tables,
      },
      {},
      { sequence_sent_by_step: () => [], ...rpcs },
    ),
    userId: "u1",
    email: "owner@example.com",
    params: {},
  };
}
const noteOf = (ctx) => GET.run(new Request(`http://x/api/v1/settings/reach-out/note?workspace=${T}`), ctx);
/** How many times the page asked for the note. */
const reads = () => asked.filter((u) => u.includes("settings/reach-out/note")).length;
const drawNote = () => again(() => globalThis.React.createElement(ColdEmailNote));
/** The document's head starts the note's read with Today's own and parks its answer, as a load on Today does (contracts routePrefetchScript). */
const headStarts = () => {
  const url = "/api/v1/settings/reach-out/note?workspace=harbor";
  globalThis[PREFETCH_SLOT] = { [url]: globalThis.fetch(url) };
};

test("with cold email set up and going, Today says nothing", async () => {
  const ctx = contextOf({ mailbox_connections: [connected], sequence_steps: [root()] });
  assert.deepEqual(await noteOf(ctx), { note: null });
});

test("a run waiting for an OK opens that run, and says how many", async () => {
  const ctx = contextOf({
    mailbox_connections: [connected],
    sequence_steps: [root()],
    sequence_batches: [
      {
        id: RUN,
        tenant_id: T,
        state: "pending_approval",
        recipient_count: 12,
        audience: { kind: "reach_out", root_id: ROOT, step_id: ROOT, search_id: SEARCH },
      },
    ],
  });
  const { note } = await noteOf(ctx);
  assert.equal(note.headline, "Your first 12 emails are ready for your OK");
  assert.equal(note.act, "Read and approve");
  assert.match(note.to, new RegExp(RUN));
});

test("a mailbox needing its owner speaks up over a running sequence", async () => {
  const ctx = contextOf({
    mailbox_connections: [{ ...connected, state: "reconnect" }],
    sequence_steps: [root()],
  });
  const { note } = await noteOf(ctx);
  assert.equal(note.headline, "Your mailbox needs reconnecting");
});

test("a workspace whose only sequence a list feeds, with no search, hears it too (a search or a sequence)", async () => {
  const ctx = contextOf({
    lead_searches: [],
    mailbox_connections: [{ ...connected, state: "reconnect" }],
    sequence_steps: [root({ lead_search_id: null })],
  });
  const { note } = await noteOf(ctx);
  assert.equal(note.headline, "Your mailbox needs reconnecting");
  assert.equal(note.needs, "settings");
});

test("a workspace that has started no cold email, no search and no sequence, is never asked about it", async () => {
  const ctx = contextOf({ lead_searches: [], mailbox_connections: [{ ...connected, state: "reconnect" }] });
  assert.deepEqual(await noteOf(ctx), { note: null });
});

test("before the first sequence, saying what you sell is one of the things Today counts", async () => {
  const { note } = await noteOf(contextOf({ mailbox_connections: [connected] }));
  assert.equal(note.headline, "1 thing before your first email");
});

test("the business's own words say what it sells, so Today asks for nothing", async () => {
  const own = { business_records: [{ tenant_id: T, about: "We clean clinics in the evening" }] };
  assert.deepEqual(await noteOf(contextOf({ mailbox_connections: [connected], ...own })), { note: null });
});

test("a pitch written on the page says what it sells, so Today asks for nothing", async () => {
  const written = { ...FILLED, reach_out: { offer: "Evening cleaning" } };
  assert.deepEqual(await noteOf(contextOf({ mailbox_connections: [connected] }, written)), { note: null });
});

test("a sequence with no one new is the page's news, not a line on Today every morning", () => {
  const facts = coldEmailNoteFactsOf({
    roots: [root()],
    waiting: [],
    mailboxes: [connected],
    hasAddress: true,
    heldForAddress: 0,
    hasSearch: true,
    hasPitch: true,
    whoFor: null,
    sent: null,
    searchName: null,
    nowMs: Date.UTC(2026, 10, 9),
    tz: "UTC",
  });
  assert.equal(facts.running.length, 1);
  assert.equal(facts.running[0].waitingLeads, null, "who is left is never counted for the note");
});

test("the note is asked once as Today lands, again as the day moves, and at most once a minute", async () => {
  // The note asks its own read as it is drawn, whatever Today has read.
  await applyToday().catch(() => undefined);
  fresh();
  const draw = drawNote;
  draw();
  await until(() => byTestId(draw(), "today-cold-email"), "the note");
  assert.match(textOf(byTestId(draw(), "today-cold-email")), /Your first 12 emails are ready for your OK/);
  assert.equal(reads(), 1);
  assert.equal(
    asked.some((u) => /settings\/reach-out(\?|$)/.test(u)),
    false,
    "never the whole page's read",
  );
  // The day moves within the minute: nothing more is asked.
  setSurfaceValue("today", { moved: 1 });
  draw();
  assert.equal(reads(), 1, "within the minute");
  // A minute on, the day moves again: it is asked again.
  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  try {
    setSurfaceValue("today", { moved: 2 });
    draw();
    await until(() => reads() === 2, "the second read");
  } finally {
    Date.now = realNow;
  }
});

// After the test above: the tab holds the note it read (module state), as it does after an earlier visit.
test("a note the tab holds is in Today's first draw: the page is never drawn without its card and then with it", () => {
  assert.ok(keptColdEmailNote()?.note, "the tab holds the last answer");
  fresh();
  assert.ok(
    byTestId(drawNote(), "today-cold-email"),
    "REGRESSION: a phone's return drew the card in its kept picture, the page without it, then the card 0.2 to 2.5 s later, the day 79 px up and back (10 Nov 2026)",
  );
});

test("a load that opens on Today holds its first draw for the note the document's head started, where the tab holds none; it asks the server nothing itself, and never waits where the tab holds one", async () => {
  // A first visit: the tab holds nothing.
  clearReadCaches();
  api().forget();
  assert.equal(keptColdEmailNote(), null);
  assert.equal(codeOutFor("today"), false);
  const before = reads();
  // The frame loaded with no read of the head's to take (no load on Today began it): nothing is held, and nothing asked.
  holdTodayForNote();
  assert.equal(codeOutFor("today"), false, "nothing to wait for");
  assert.equal(reads(), before, "REGRESSION: the frame's load asked for the note where no page had opened");
  // A load on Today: the head's read is out as the frame loads, and the first draw is held for it.
  headStarts();
  holdTodayForNote();
  assert.equal(
    codeOutFor("today"),
    true,
    "REGRESSION: asked only once the page had drawn, the card landed 0.3 to 0.6 s after it and pushed the day down, 79 px on a phone",
  );
  await until(() => !codeOutFor("today"), "the note's read settled");
  assert.equal(reads(), before + 1, "the head's read alone: the frame took it and asked for nothing more");
  assert.match(keptColdEmailNote()?.note?.headline ?? "", /ready for your OK/);
  // The page draws, its card with it, and the card's own read as it is drawn is the load's. A minute on the day moves and
  // the card asks again: the second read there has been, so the load's was never asked for twice.
  fresh();
  assert.ok(byTestId(drawNote(), "today-cold-email"), "in the first draw");
  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  try {
    setSurfaceValue("today", { moved: 3 });
    drawNote();
    await until(() => reads() >= before + 2, "the read a minute on");
  } finally {
    Date.now = realNow;
  }
  assert.equal(reads(), before + 2, "one read for the load, one a minute on");
  // A return: what the tab holds is drawn at once, and nothing holds the page for the read behind it.
  headStarts();
  holdTodayForNote();
  assert.equal(codeOutFor("today"), false, "a tab that holds the note never waits for it");
  delete globalThis[PREFETCH_SLOT];
});

// LAST in the file: a kept copy of Today cannot be taken back (surface-status.ts has no reset).
test("a tab that opens on a kept copy of Today is held for the note only where a phone's kept picture stands in the page's place; a desk draws its copy at once", async () => {
  let letGo = () => {};
  // A load whose head's read is still out: the client forgets the answer it shared a moment ago, and this one waits to be let go.
  const out = () => {
    api().forget();
    noteHeldBack = new Promise((r) => (letGo = r));
    headStarts();
  };
  const was = globalThis.document;
  try {
    // A desk reopened in a new tab: Today's copy from an earlier visit is in hand, and nothing stands in the page's place.
    clearReadCaches();
    markHydrated(["today"]);
    out();
    holdTodayForNote();
    assert.equal(codeOutFor("today"), true, "held as the frame loads");
    await until(() => !codeOutFor("today"), "the hold let go before the page's first draw");
    assert.equal(
      keptColdEmailNote(),
      null,
      "REGRESSION: a desk's kept copy waited 0.4 to 1 s for the note before it drew (a reopened tab, 10 Nov 2026)",
    );
    letGo();
    await until(() => keptColdEmailNote(), "the note, landing behind the page");
    // A phone reopened: its kept picture stands where the page will, card and all, so the page waits for the note under it.
    clearReadCaches();
    globalThis.document = { ...was, documentElement: { hasAttribute: () => true } };
    out();
    holdTodayForNote();
    // A turn of the page's own, as its first draw takes: the hold is still there.
    await Promise.resolve();
    assert.equal(codeOutFor("today"), true, "the picture stands until the page can draw with its card");
    letGo();
    await until(() => !codeOutFor("today"), "the note in: the page takes the picture's place");
    assert.match(keptColdEmailNote()?.note?.headline ?? "", /ready for your OK/);
  } finally {
    noteHeldBack = null;
    letGo();
    globalThis.document = was;
    delete globalThis[PREFETCH_SLOT];
  }
});
