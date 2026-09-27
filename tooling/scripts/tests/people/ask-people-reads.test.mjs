/**
 * People's two reads for Ask (Ask Rewired, PR 4.3): the Pipeline's board (readers/people.ts dealBoard), moved out of
 * Ask's Pipeline context, which reads it now, and the lists. Each over the database in memory; what a read asked is in
 * `supabase.seen`. The Pipeline context's answer is held to the bytes it gave before the board moved (frozen below from
 * the provider at 3d2659440, over this file's world), and the board to contracts pipelineOf over the same rows.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dealPaceOf, dealsAreOn, pipelineOf, poolRowOf } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache, readerContext, load } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { dealBoard } = await import(at("apps/dashboard/src/server/readers/people.ts"));
const { pipeline: pipelineContext } = await import(at("apps/dashboard/src/server/ask/context/people.ts"));

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "abababab-abab-4aba-8aba-abababababa1";
const P2 = "abababab-abab-4aba-8aba-abababababa2";
const P3 = "abababab-abab-4aba-8aba-abababababa3";
const P4 = "abababab-abab-4aba-8aba-abababababa4";
const P5 = "abababab-abab-4aba-8aba-abababababa5";
const PB = "abababab-abab-4aba-8aba-ababababababb";
const D1 = "dededede-dede-4ede-8ede-dededededed1";
const D2 = "dededede-dede-4ede-8ede-dededededed2";
const D5 = "dededede-dede-4ede-8ede-dededededed5";
const USER = "u1";
const TZ = "America/New_York";
/** A Monday at 10:00 in New York. */
const NOW = new Date("2026-09-14T14:00:00Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();

/** A People row as people_list answers it. */
const personRow = (id, name, over = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+15555550100",
  consent: "opted_in",
  dnc: false,
  has_chat: true,
  first_seen_at: iso(NOW.getTime() - 60 * DAY),
  last_message_at: iso(NOW.getTime() - 3 * HOUR),
  last_inbound_at: iso(NOW.getTime() - 3 * HOUR),
  latest_conversation_id: null,
  conversation_count: 1,
  ...over,
});
/** Harbor's people: a proposal out nine days, a client, a pass, one with no deal, and a proposal two days old. */
const HARBOR = [
  personRow(P1, "Rosa", {
    last_message_at: iso(NOW.getTime() - 10 * DAY),
    last_inbound_at: iso(NOW.getTime() - 10 * DAY),
    deal_id: D1,
    deal_stage: "proposed",
    deal_service: "Kitchen remodel",
    deal_proposed_at: iso(NOW.getTime() - 9 * DAY),
    deal_amount_cents: 120_000,
    deal_per: "once",
  }),
  personRow(P2, "Quinn", {
    deal_id: D2,
    deal_stage: "won",
    deal_service: "Ad management",
    deal_proposed_at: iso(NOW.getTime() - 40 * DAY),
    deal_decided_at: iso(NOW.getTime() - 30 * DAY),
    deal_amount_cents: 250_000,
    deal_per: "month",
  }),
  personRow(P3, "Lena", {
    deal_id: "dededede-dede-4ede-8ede-dededededed3",
    deal_stage: "lost",
    deal_service: "Kitchen remodel",
    deal_proposed_at: iso(NOW.getTime() - 20 * DAY),
    deal_decided_at: iso(NOW.getTime() - 10 * DAY),
    deal_lost_reason: "price",
  }),
  personRow(P4, "Omar"),
  personRow(P5, "Mia", {
    deal_id: D5,
    deal_stage: "proposed",
    deal_service: "Bathroom",
    deal_proposed_at: iso(NOW.getTime() - 2 * DAY),
    deal_amount_cents: 80_000,
    deal_per: "once",
  }),
];

function tables(sellsBy = "proposal") {
  return {
    memberships: [
      { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [
      { id: A, name: "Harbor", timezone: TZ, sells_by: sellsBy },
      { id: B, name: "Bayside", timezone: "Europe/Madrid", sells_by: "proposal" },
    ],
    tenant_config: [],
    tenant_channels: [],
    policies: [],
    conversations: [],
    messages: [],
    contacts: [],
    deals: [],
    templates: [],
    segments: [],
    segment_members: [],
    playbooks: [],
    broadcasts: [],
    broadcast_recipients: [],
  };
}
const RPCS = {
  people_list: (a) =>
    (a.p_tenant_id === A ? HARBOR : [personRow(PB, "Bruno")]).slice(
      a.p_offset ?? 0,
      (a.p_offset ?? 0) + (a.p_limit ?? 1000),
    ),
};
const ctxFor = (t = tables(), rpcs = RPCS) => ({
  supabase: fakeDb(t, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
/** A turn's reader context in harbor, on the fixture's clock. */
const rcIn = (ctx, role = "owner") => readerContext(ctx, { tenantId: A, role }, NOW, { keep: true });
/** A page context as the tab sends it. */
const page = (rows, view = "all") => ({
  v: 1,
  surface: "pipeline",
  route: "clients/pipeline",
  view,
  focus: null,
  rows,
  askedAt: 1,
});
const onScreen = [P1, P2, P3, P4, P5, PB].map((id) => ({ kind: "person", id }));

/** What the Pipeline context gave before the board moved into its reader (3d2659440), over this world. */
const BEFORE = {
  all: {
    rows: [
      {
        source: "person://abababab-abab-4aba-8aba-abababababa1",
        title: "Rosa",
        text: "Rosa · Proposal out · Kitchen remodel · $1,200 · 9 d · Nothing back · route: clients/abababab-abab-4aba-8aba-abababababa1",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa1",
          route: "clients/abababab-abab-4aba-8aba-abababababa1",
          label: "Rosa",
        },
      },
      {
        source: "person://abababab-abab-4aba-8aba-abababababa2",
        title: "Quinn",
        text: "Quinn · Clients · Ad management · $2,500 a month · 30 d · Since Aug 15 · route: clients/abababab-abab-4aba-8aba-abababababa2",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa2",
          route: "clients/abababab-abab-4aba-8aba-abababababa2",
          label: "Quinn",
        },
      },
      {
        source: "person://abababab-abab-4aba-8aba-abababababa3",
        title: "Lena",
        text: "Lena · Passed or ended · Kitchen remodel · 10 d · Price · Sep 4 · route: clients/abababab-abab-4aba-8aba-abababababa3",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa3",
          route: "clients/abababab-abab-4aba-8aba-abababababa3",
          label: "Lena",
        },
      },
      {
        source: "person://abababab-abab-4aba-8aba-abababababa5",
        title: "Mia",
        text: "Mia · Proposal out · Bathroom · $800 · 2 d · Heard back today · route: clients/abababab-abab-4aba-8aba-abababababa5",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa5",
          route: "clients/abababab-abab-4aba-8aba-abababababa5",
          label: "Mia",
        },
      },
    ],
    aggregate:
      "Pipeline, All deals: 4 on screen · 2 proposals out · $2,000 · 1 waiting over a week · 1 client · $2,500 a month · Proposal out: 2 · Clients: 1 · Passed or ended: 1",
  },
  waiting: {
    rows: [
      {
        source: "person://abababab-abab-4aba-8aba-abababababa1",
        title: "Rosa",
        text: "Rosa · Proposal out · Kitchen remodel · $1,200 · 9 d · Nothing back · route: clients/abababab-abab-4aba-8aba-abababababa1",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa1",
          route: "clients/abababab-abab-4aba-8aba-abababababa1",
          label: "Rosa",
        },
      },
      {
        source: "person://abababab-abab-4aba-8aba-abababababa2",
        title: "Quinn",
        text: "Quinn · Clients · Ad management · $2,500 a month · 30 d · Since Aug 15 · route: clients/abababab-abab-4aba-8aba-abababababa2",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa2",
          route: "clients/abababab-abab-4aba-8aba-abababababa2",
          label: "Quinn",
        },
      },
      {
        source: "person://abababab-abab-4aba-8aba-abababababa3",
        title: "Lena",
        text: "Lena · Passed or ended · Kitchen remodel · 10 d · Price · Sep 4 · route: clients/abababab-abab-4aba-8aba-abababababa3",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa3",
          route: "clients/abababab-abab-4aba-8aba-abababababa3",
          label: "Lena",
        },
      },
      {
        source: "person://abababab-abab-4aba-8aba-abababababa5",
        title: "Mia",
        text: "Mia · Proposal out · Bathroom · $800 · 2 d · Heard back today · route: clients/abababab-abab-4aba-8aba-abababababa5",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa5",
          route: "clients/abababab-abab-4aba-8aba-abababababa5",
          label: "Mia",
        },
      },
    ],
    aggregate:
      "Pipeline, Nothing back in a week: 4 on screen · 2 proposals out · $2,000 · 1 waiting over a week · 1 client · $2,500 a month · Proposal out: 2 · Clients: 1 · Passed or ended: 1",
  },
  off: {
    rows: [
      {
        source: "person://abababab-abab-4aba-8aba-abababababa1",
        title: "Rosa",
        text: "Rosa · Active · last contact Sep 4 · route: clients/abababab-abab-4aba-8aba-abababababa1",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa1",
          route: "clients/abababab-abab-4aba-8aba-abababababa1",
          label: "Rosa",
        },
      },
      {
        source: "person://abababab-abab-4aba-8aba-abababababa2",
        title: "Quinn",
        text: "Quinn · Active · last contact 3h ago · route: clients/abababab-abab-4aba-8aba-abababababa2",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa2",
          route: "clients/abababab-abab-4aba-8aba-abababababa2",
          label: "Quinn",
        },
      },
      {
        source: "person://abababab-abab-4aba-8aba-abababababa3",
        title: "Lena",
        text: "Lena · Active · last contact 3h ago · route: clients/abababab-abab-4aba-8aba-abababababa3",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa3",
          route: "clients/abababab-abab-4aba-8aba-abababababa3",
          label: "Lena",
        },
      },
      {
        source: "person://abababab-abab-4aba-8aba-abababababa4",
        title: "Omar",
        text: "Omar · Active · last contact 3h ago · route: clients/abababab-abab-4aba-8aba-abababababa4",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa4",
          route: "clients/abababab-abab-4aba-8aba-abababababa4",
          label: "Omar",
        },
      },
      {
        source: "person://abababab-abab-4aba-8aba-abababababa5",
        title: "Mia",
        text: "Mia · Active · last contact 3h ago · route: clients/abababab-abab-4aba-8aba-abababababa5",
        ref: {
          kind: "person",
          id: "abababab-abab-4aba-8aba-abababababa5",
          route: "clients/abababab-abab-4aba-8aba-abababababa5",
          label: "Mia",
        },
      },
    ],
    aggregate: "Pipeline, all: 5 people on screen · people: 5",
  },
};

test("the Pipeline context reads the board from its reader and answers what it answered before the move, byte for byte: the rows on screen in their groups, the line over the table and the groups' counts; where deals are off, People's rows", async () => {
  const got = {
    all: await pipelineContext(rcIn(ctxFor()), page(onScreen)),
    waiting: await pipelineContext(rcIn(ctxFor()), page(onScreen, "waiting")),
    off: await pipelineContext(rcIn(ctxFor(tables("booking"))), page(onScreen)),
  };
  if (process.env.CAPTURE) console.log(`CAPTURE ${JSON.stringify(got)}`);
  for (const k of Object.keys(BEFORE)) assert.equal(JSON.stringify(got[k]), JSON.stringify(BEFORE[k]), k);
});

test("the board is the page's: contracts pipelineOf over everyone in People, each row as People draws it for the member asking with their follow-up laid on, and the pace from People's first page, on the turn's clock; each person on it a row a citation names, and each deal one too, opened on its person's page; none where deals are off", async () => {
  const r = await load(rcIn(ctxFor()), dealBoard, undefined);
  // The page's own build, over the same rows: People's first page for the pace and the follow-up (none here).
  const dealsOn = dealsAreOn("proposal");
  const rows = HARBOR.map((p) => poolRowOf(p, { tz: TZ, now: NOW, viewer: USER, dealsOn }));
  const pace = dealPaceOf(null);
  assert.deepEqual(r.data, { deals_on: true, timezone: TZ, board: pipelineOf(rows, NOW.getTime(), TZ, pace) });
  assert.deepEqual(
    r.data.board.groups.map((g) => [g.label, g.rows.map((x) => x.name)]),
    [
      ["Proposal out", ["Rosa", "Mia"]],
      ["Clients", ["Quinn"]],
      ["Passed or ended", ["Lena"]],
    ],
  );
  assert.deepEqual(
    r.rows.filter((x) => x.id === P1 || x.id === D1),
    [
      { kind: "person", id: P1, route: `clients/${P1}`, label: "Rosa" },
      { kind: "deal", id: D1, route: `clients/${P1}`, label: "Rosa · Kitchen remodel" },
    ],
  );
  assert.ok(!r.rows.some((x) => x.id === P4 || x.id === PB), "nobody off the board, and nobody of another workspace");
  const off = await load(rcIn(ctxFor(tables("booking"))), dealBoard, undefined);
  assert.deepEqual([off.data, off.rows], [{ deals_on: false, timezone: TZ, board: null }, []]);
});
