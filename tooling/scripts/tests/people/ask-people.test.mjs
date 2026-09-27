/**
 * People for Ask. Its two reads (Ask Rewired, PR 4.3): the Pipeline's board (readers/people.ts dealBoard), moved out of
 * Ask's Pipeline context, which reads it now, and the lists. Each over the database in memory; what a read asked is in
 * `supabase.seen`. The Pipeline context's answer is held to the bytes it gave before the board moved (frozen below from
 * the provider at 3d2659440, over this file's world), and the board to contracts pipelineOf over the same rows.
 *
 * And a person's two cards (PR 4.6, the Phase 4 plan's D8 and D9): propose_person's note and details, each call the
 * model makes run through the registry over the database in memory, from a table (the refusal in the model's words and
 * nothing read, or the card); then each card walked end to end -- built, approved through the palette's commit walk and
 * undone -- against the real routes it names, run over the same world with doors modelled on the migrations.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PEOPLE_LISTS,
  asListRule,
  dealPaceOf,
  dealsAreOn,
  listRuleParts,
  listUnknownWords,
  pipelineOf,
  poolRowOf,
  ruleNeeds,
  unmetNeed,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache, readerContext, load } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { dealBoard } = await import(at("apps/dashboard/src/server/readers/people.ts"));
const { pipeline: pipelineContext } = await import(at("apps/dashboard/src/server/ask/context/people.ts"));
const { audiencePool } = await import(at("apps/dashboard/src/server/readers/audience-pool.ts"));
const { runTool, buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { commitProposal, undoProposal } = await import(at("apps/dashboard/src/legacy-bridge/ask/commit.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const noteWrite = await import(at("apps/dashboard/app/api/v1/contacts/[id]/notes/route.ts"));
const noteRemove = await import(at("apps/dashboard/app/api/v1/contacts/[id]/notes/remove/route.ts"));
const detailsRoute = await import(at("apps/dashboard/app/api/v1/contacts/[id]/details/route.ts"));

beforeEach(() => {
  readerCache.clear();
  setRateStore(memoryStore());
});

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
const L_HAND = "5e5e5e5e-0000-4000-8000-000000000001";
const L_RULE = "5e5e5e5e-0000-4000-8000-000000000002";
const L_CAL = "5e5e5e5e-0000-4000-8000-000000000003";
const L_OLD = "5e5e5e5e-0000-4000-8000-000000000004";
const L_B = "5e5e5e5e-0000-4000-8000-00000000000b";
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
    segments: [
      { id: L_HAND, tenant_id: A, name: "Regulars", rule: null, archived_at: null },
      {
        id: L_RULE,
        tenant_id: A,
        name: "Talkers",
        rule: { v: 2, all: [{ field: "conversations", op: "at_least", n: 1 }] },
        archived_at: null,
      },
      {
        id: L_CAL,
        tenant_id: A,
        name: "Booked ahead",
        rule: { v: 2, all: [{ field: "booked", op: "is", yes: true }] },
        archived_at: null,
      },
      { id: L_OLD, tenant_id: A, name: "Last year", rule: null, archived_at: "2026-09-01T00:00:00Z" },
      { id: L_B, tenant_id: B, name: "Bayside regulars", rule: null, archived_at: null },
    ],
    segment_members: [
      { tenant_id: A, segment_id: L_HAND, contact_id: P1 },
      { tenant_id: A, segment_id: L_HAND, contact_id: P4 },
      { tenant_id: B, segment_id: L_B, contact_id: PB },
    ],
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

/** Ask's people tool, run through the registry for a member of harbor, on the fixture's clock. */
const ask = async (input, t = tables(), role = "operator") => {
  const tc = newToolContext(ctxFor(t), A, role, TZ, NOW);
  const out = await runTool(tc, { name: "people", input });
  assert.equal(out.isError, false, out.result);
  return { out: JSON.parse(out.result), tc };
};

test("people.pipeline answers what the board's reader answers, as the Pipeline draws it: the line over the table, the pace, each group with its count and what it comes to, and each person on it with the deal's id, service, value, time in stage, chip and next step; each person and deal a row in the read set, opened on the person's page; where deals are off, said so", async () => {
  const { out, tc } = await ask({ action: "pipeline" });
  const board = (await load(rcIn(ctxFor(), "operator"), dealBoard, undefined)).data.board;
  assert.deepEqual(out, {
    route: "clients/pipeline",
    deals_on: true,
    summary: board.summary.join(" · "),
    pace: board.pace?.words ?? null,
    groups: board.groups.map((g) => ({
      group: g.label,
      count: g.count,
      comes_to: g.meta,
      people: g.rows.map((row) => ({
        contact_id: row.id,
        deal_id: row.person.deal?.id ?? null,
        route: `clients/${row.id}`,
        name: row.name,
        service: row.service,
        value: row.value,
        in_stage: row.inStage || null,
        chip: row.chip?.words ?? null,
        next_step: row.next ? `${row.next.words} · ${row.next.when}` : null,
      })),
    })),
  });
  assert.deepEqual(
    out.groups.map((g) => [g.group, g.count, g.people.map((p) => [p.name, p.service, p.value])]),
    [
      [
        "Proposal out",
        2,
        [
          ["Rosa", "Kitchen remodel", "$1,200"],
          ["Mia", "Bathroom", "$800"],
        ],
      ],
      ["Clients", 1, [["Quinn", "Ad management", "$2,500 a month"]]],
      ["Passed or ended", 1, [["Lena", "Kitchen remodel", null]]],
    ],
  );
  assert.match(out.summary, /^2 proposals out · \$2,000 · 1 waiting over a week · 1 client/);
  assert.deepEqual(tc.read.person.get(P1), { kind: "person", id: P1, route: `clients/${P1}`, label: "Rosa" });
  assert.deepEqual(tc.read.deal.get(D1), {
    kind: "deal",
    id: D1,
    route: `clients/${P1}`,
    label: "Rosa · Kitchen remodel",
  });
  assert.ok(!tc.read.person.has(P4) && !tc.read.person.has(PB), "nobody off the board is named");
  const off = await ask({ action: "pipeline" }, tables("booking"));
  assert.deepEqual([off.out.deals_on, off.out.groups, off.tc.read.person.size], [false, undefined, 0]);
});

test("people.lists answers the rail People draws, over the audience pool (everyone, for the member asking): People's own lists this workspace can count with what each holds and how many, the ones it cannot count with why, and the workspace's own lists with their rule in the page's words and their count or why not, the archived by name; each list a row in the read set, opened on People at it", async () => {
  const { out, tc } = await ask({ action: "lists" });
  const rc = rcIn(ctxFor(), "operator");
  const pool = (await load(rc, audiencePool, undefined)).data;
  // The page's own build (legacy-bridge/surface-data.ts publishPeople), over the pool's rows.
  const cal = pool.calendar.state;
  const offered = PEOPLE_LISTS.filter(
    (l) =>
      (!l.needsCalendar || cal === "ok") &&
      (!l.needsConsultFirst || pool.consult_first) &&
      (!l.needsDeals || pool.deals_on),
  );
  assert.deepEqual(
    out.lists,
    offered.map((l) => ({ list: `seg:${l.id}`, label: l.label, holds: l.tip, count: pool.rows.filter(l.test).length })),
  );
  assert.deepEqual(
    out.cannot_count,
    PEOPLE_LISTS.flatMap((l) => {
      const need = unmetNeed(ruleNeeds(l.rule), pool.listCtx);
      return need ? [{ label: l.label, why: listUnknownWords(need, cal) }] : [];
    }),
  );
  assert.ok(out.cannot_count.length > 0, "no calendar here: the lists that read one say why");
  // In the lists reader's order (by name); a list kept by hand counts its members on People, a rule counts whom it
  // holds today, and a rule that reads the calendar says why it cannot be counted here.
  assert.deepEqual(out.own, [
    {
      list: `list:${L_CAL}`,
      name: "Booked ahead",
      kept: "by its rule",
      rule: listRuleParts(asListRule({ v: 2, all: [{ field: "booked", op: "is", yes: true }] })).join(" · "),
      cannot_count: listUnknownWords("calendar", cal),
    },
    { list: `list:${L_HAND}`, name: "Regulars", kept: "by hand", rule: null, count: 2 },
    {
      list: `list:${L_RULE}`,
      name: "Talkers",
      kept: "by its rule",
      rule: listRuleParts(asListRule({ v: 2, all: [{ field: "conversations", op: "at_least", n: 1 }] })).join(" · "),
      count: 5,
    },
  ]);
  assert.deepEqual(out.archived, ["Last year"]);
  assert.deepEqual(tc.read.list.get(L_HAND), {
    kind: "list",
    id: L_HAND,
    route: `clients/list:${L_HAND}`,
    label: "Regulars",
  });
  assert.equal(tc.read.list.get(offered[0].id).route, `clients/seg:${offered[0].id}`, "People's own, at its view");
  assert.ok(!tc.read.list.has(L_OLD) && !tc.read.list.has(L_B), "neither the archived nor another workspace's");
});

/* ------------------------------------------------------------- a person's cards (PR 4.6) */

const ROSA = "abababab-abab-4aba-8aba-abababababc1";
const QUINN = "abababab-abab-4aba-8aba-abababababc2";
const GONE = "abababab-abab-4aba-8aba-abababababc9";
const NOBODY = "abababab-abab-4aba-8aba-abababababcf";
const NAMELESS = "abababab-abab-4aba-8aba-abababababc3";
const ELSEWHERE = "abababab-abab-4aba-8aba-abababababcb";

/** A contact as the table holds it: what a card's builder reads, and what the routes' scope reads (loadContact). */
const contactRow = (id, over = {}) => ({
  id,
  tenant_id: A,
  display_name: null,
  wa_profile_name: null,
  phone_e164: "+15555550101",
  email: null,
  erased_at: null,
  marketing_consent: null,
  ...over,
});
/**
 * Harbor for the cards: Rosa, named on her profile and with no address; Quinn, known by his WhatsApp name, with one;
 * someone with nothing on their profile at all; and someone erased. The member asking is an operator unless a case says
 * otherwise, and belongs to Bayside too, whose Bruno they can read (RLS shows a member every workspace of theirs).
 */
const cardWorld = (role = "operator") => ({
  memberships: [
    { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    { user_id: USER, tenant_id: B, role, tenants: { slug: "bayside" }, created_at: "2026-02-01T00:00:00Z" },
  ],
  contacts: [
    contactRow(ROSA, { display_name: "Rosa" }),
    contactRow(QUINN, { wa_profile_name: "Quinn W", phone_e164: "+15555550102", email: "quinn@example.com" }),
    contactRow(NAMELESS, { phone_e164: null }),
    contactRow(GONE, { phone_e164: null, erased_at: "2026-09-01T00:00:00Z" }),
    contactRow(ELSEWHERE, { tenant_id: B, display_name: "Bruno", phone_e164: "+15555550109" }),
  ],
  policies: [],
  person_notes: [],
});

/** One call the model makes, through the registry, over a fresh world: what it came to, what it read, the read set. */
async function personCall(input, role = "operator") {
  const supabase = fakeDb(cardWorld(role), {}, {});
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, role, TZ, NOW);
  const out = await buildProposal(t, "propose_person", input);
  const p = out.proposal;
  return {
    got: p
      ? { kind: p.kind, needs: p.needs, title: p.title, summary: p.summary, payload: p.payload, undo: p.undo }
      : JSON.parse(out.result),
    isError: out.isError,
    reads: supabase.seen.map((q) => `${q.table}.${q.op}`),
    read: t.read,
  };
}

const LONG = "x".repeat(601);
/**
 * Each call and what it comes to: a refusal in the model's words (and what was read before it), or the card. The
 * refusals before a read read nothing; a card reads the person once.
 */
const PERSON_CALLS = [
  // A note (D8).
  [
    "a note on an id no read returned",
    { action: "note", contact_id: "nope", body: "Prefers mornings.", for: "team" },
    { error: "contact_id must be an id a read returned" },
    [],
  ],
  [
    "a note on someone erased",
    { action: "note", contact_id: GONE, body: "Prefers mornings.", for: "team" },
    { error: "no such person in this workspace" },
    ["contacts.select"],
  ],
  [
    "a note on nobody here",
    { action: "note", contact_id: NOBODY, body: "Prefers mornings.", for: "team" },
    { error: "no such person in this workspace" },
    ["contacts.select"],
  ],
  [
    "a note on someone of another workspace the member also belongs to",
    { action: "note", contact_id: ELSEWHERE, body: "Prefers mornings.", for: "team" },
    { error: "no such person in this workspace" },
    ["contacts.select"],
  ],
  [
    "a note with no words",
    { action: "note", contact_id: ROSA, body: "   ", for: "team" },
    { error: "body must be the note's words" },
    [],
  ],
  [
    "a note longer than the table holds, refused and never cut",
    { action: "note", contact_id: ROSA, body: LONG, for: "team" },
    { error: "body is 601 characters; a note is at most 600" },
    [],
  ],
  [
    "a note that does not say who reads it: no default (D8)",
    { action: "note", contact_id: ROSA, body: "Prefers mornings." },
    { error: 'propose_person: for Invalid option: expected one of "receptionist"|"team"' },
    [],
  ],
  [
    "a note for someone the note cannot be for",
    { action: "note", contact_id: ROSA, body: "Prefers mornings.", for: "everyone" },
    { error: 'propose_person: for Invalid option: expected one of "receptionist"|"team"' },
    [],
  ],
  [
    "a note with details' fields",
    { action: "note", contact_id: ROSA, body: "Prefers mornings.", for: "team", email: "rosa@example.com" },
    { error: "propose_person: email not taken by action note" },
    [],
  ],
  [
    "a note the receptionist reads, trimmed",
    { action: "note", contact_id: ROSA, body: "  Prefers mornings.  ", for: "receptionist" },
    {
      kind: "note",
      needs: "operator",
      title: "Note on Rosa",
      summary: "“Prefers mornings.” · The receptionist reads it before it answers Rosa",
      payload: { contact_id: ROSA, body: "Prefers mornings.", team_only: false, who: "Rosa" },
      undo: "Delete it",
    },
    ["contacts.select"],
  ],
  [
    "a note for the team alone, said in the page's words",
    { action: "note", contact_id: QUINN, body: "Owes us a callback.", for: "team" },
    {
      kind: "note",
      needs: "operator",
      title: "Note on Quinn W",
      summary: "“Owes us a callback.” · Team only: the receptionist won't read it",
      payload: { contact_id: QUINN, body: "Owes us a callback.", team_only: true, who: "Quinn W" },
      undo: "Delete it",
    },
    ["contacts.select"],
  ],
  // A person's details (D9).
  [
    "details with neither field",
    { action: "details", contact_id: ROSA },
    { error: "details takes name, email or both" },
    [],
  ],
  [
    "details with an address that is none",
    { action: "details", contact_id: ROSA, email: "rosa.example.com" },
    { error: "That is missing the @." },
    [],
  ],
  [
    "details with a name and its brackets",
    { action: "details", contact_id: ROSA, email: "Rosa <rosa@example.com>" },
    { error: "Only the address itself, like name@example.com, with no name or spaces around it." },
    [],
  ],
  [
    "details that would clear a name",
    { action: "details", contact_id: ROSA, name: "   " },
    { error: "name must be the name they gave; a card never clears one" },
    [],
  ],
  [
    "details on someone erased",
    { action: "details", contact_id: GONE, name: "Ana" },
    { error: "no such person in this workspace" },
    ["contacts.select"],
  ],
  [
    "details on someone of another workspace the member also belongs to",
    { action: "details", contact_id: ELSEWHERE, name: "Bruno Reyes" },
    { error: "no such person in this workspace" },
    ["contacts.select"],
  ],
  [
    "details that change nothing: already their name",
    { action: "details", contact_id: ROSA, name: " Rosa " },
    { error: "already their name" },
    ["contacts.select"],
  ],
  [
    "details that change nothing: already their email, in any spelling",
    { action: "details", contact_id: QUINN, email: " Quinn@Example.COM " },
    { error: "already their email" },
    ["contacts.select"],
  ],
  [
    "a null name is no name: already their email",
    { action: "details", contact_id: QUINN, email: "quinn@example.com", name: null },
    { error: "already their email" },
    ["contacts.select"],
  ],
  [
    "details with a note's field",
    { action: "details", contact_id: ROSA, name: "Rosa Díaz", for: "team" },
    { error: "propose_person: for not taken by action details" },
    [],
  ],
  [
    "a name and an address she did not have, as the route will keep them: old to new",
    { action: "details", contact_id: ROSA, name: "  Rosa   Díaz ", email: " Rosa@Example.com " },
    {
      kind: "person_details",
      needs: "operator",
      title: "Details for Rosa",
      summary: "Name: Rosa → Rosa Díaz · Email: no address → rosa@example.com",
      payload: {
        contact_id: ROSA,
        who: "Rosa",
        name: "Rosa Díaz",
        email: "rosa@example.com",
        previous: { name: "Rosa", email: null },
      },
      undo: "Set it back",
    },
    ["contacts.select"],
  ],
  [
    "a name cut at the route's eighty",
    { action: "details", contact_id: QUINN, name: "Q".repeat(90) },
    {
      kind: "person_details",
      needs: "operator",
      title: "Details for Quinn W",
      summary: `Name: no name of their own (shows as Quinn W) → ${"Q".repeat(80)}`,
      payload: { contact_id: QUINN, who: "Quinn W", name: "Q".repeat(80), previous: { name: null } },
      undo: "Set it back",
    },
    ["contacts.select"],
  ],
  [
    "a field that already says it is left off the card",
    { action: "details", contact_id: QUINN, name: "Quinn Walker", email: "quinn@example.com" },
    {
      kind: "person_details",
      needs: "operator",
      title: "Details for Quinn W",
      summary: "Name: no name of their own (shows as Quinn W) → Quinn Walker",
      payload: { contact_id: QUINN, who: "Quinn W", name: "Quinn Walker", previous: { name: null } },
      undo: "Set it back",
    },
    ["contacts.select"],
  ],
];

const PERSON_CALLS_NAMELESS = [
  [
    "a name for someone whose profile holds nothing at all: no name of their own, and nothing shown instead",
    { action: "details", contact_id: NAMELESS, name: "Ana" },
    {
      kind: "person_details",
      needs: "operator",
      title: "Details for this person",
      summary: "Name: no name of their own → Ana",
      payload: { contact_id: NAMELESS, who: "this person", name: "Ana", previous: { name: null } },
      undo: "Set it back",
    },
    ["contacts.select"],
  ],
];
PERSON_CALLS.push(...PERSON_CALLS_NAMELESS);

test("propose_person's note and details over the database in memory, from a table: each refusal in the model's words, before any read where it can be, and each card with who reads it or each field as it was and becomes; the person a card names is a row the answer may cite", async () => {
  for (const [what, input, want, reads] of PERSON_CALLS) {
    const r = await personCall(input);
    assert.deepEqual(r.got, want, what);
    assert.equal(r.isError, "error" in want, what);
    assert.deepEqual(r.reads, reads, `${what}: what was read`);
  }
  // A card's person is in the turn's read set, with the page the answer opens them on.
  const { read } = await personCall({ action: "note", contact_id: ROSA, body: "Prefers mornings.", for: "team" });
  assert.deepEqual(read.person.get(ROSA), { kind: "person", id: ROSA, route: `clients/${ROSA}`, label: "Rosa" });
  // Both are an operator's, and an owner's and a partner's too (a person's mode stays the owner's); a viewer is
  // offered neither and is refused whole, before anything is read.
  for (const role of ["partner", "owner"])
    assert.equal(
      (await personCall({ action: "details", contact_id: ROSA, name: "Ana" }, role)).got.kind,
      "person_details",
    );
  const viewer = await personCall({ action: "note", contact_id: ROSA, body: "x", for: "team" }, "viewer");
  assert.deepEqual(
    [viewer.got, viewer.reads],
    [{ error: "propose_person: action note is an owner's, a partner's or an operator's" }, []],
  );
  // A deal's card reads its person the same way: this workspace's alone, though RLS would show Bayside's Bruno.
  const supabase = fakeDb(cardWorld(), {}, {});
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
  const deal = await buildProposal(t, "propose_deal", { contact_id: ELSEWHERE, stage: "won" });
  assert.deepEqual(JSON.parse(deal.result), { error: "no such person in this workspace" });
  assert.deepEqual(
    supabase.seen.map((q) => [`${q.table}.${q.op}`, q.filters.find(([, col]) => col === "tenant_id")?.[2]]),
    [["contacts.select", A]],
    "one read, of this workspace's people",
  );
});

const envelope = (data) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });

/**
 * The doors the routes open, over the world's own rows, as the migrations write them: a note added and taken away
 * (00157, 00166: the row back whole, `to_jsonb`), a name (00131: its spaces one, empty is none) and an address (00171:
 * trimmed, lower case, empty is none), each answering what its function returns.
 */
function doors(world) {
  const contact = (id) => world.contacts.find((c) => c.id === id);
  let n = 0;
  return {
    person_note_add: (a) => {
      const at = NOW.toISOString();
      const row = {
        id: `efefefef-0000-4000-8000-00000000000${++n}`,
        tenant_id: A,
        contact_id: a.p_contact_id,
        body: a.p_body,
        author_kind: "member",
        author_user_id: USER,
        for_user_id: a.p_for_user_id ?? null,
        team_only: a.p_team_only,
        state: "kept",
        source: "page",
        version: 1,
        created_at: at,
        updated_at: at,
        due_on: a.p_due_on ?? null,
        done_at: null,
        done_by: null,
        deal_id: a.p_deal_id ?? null,
      };
      world.person_notes.push(row);
      return { note: row };
    },
    person_note_remove: (a) => {
      const i = world.person_notes.findIndex((r) => r.id === a.p_note_id);
      if (i < 0) return { error: "not_found" };
      world.person_notes.splice(i, 1);
      return { removed: a.p_note_id };
    },
    set_person_name: (a) => {
      const name =
        String(a.p_name ?? "")
          .replace(/\s+/g, " ")
          .trim() || null;
      contact(a.p_contact_id).display_name = name;
      return { contact_id: a.p_contact_id, name };
    },
    set_person_email: (a) => {
      const email =
        String(a.p_email ?? "")
          .trim()
          .toLowerCase() || null;
      const tenant = contact(a.p_contact_id).tenant_id;
      // One address per person in a workspace (00125's unique index), refused in the door's own words and code.
      if (email && world.contacts.some((c) => c.id !== a.p_contact_id && c.tenant_id === tenant && c.email === email))
        throw Object.assign(new Error("Another person here already has that address."), { code: "23505" });
      contact(a.p_contact_id).email = email;
      return { contact_id: a.p_contact_id, email };
    },
  };
}

/** The routes a person's card reaches, by method and path: each the real route module, run as the server runs it. */
const CARD_ROUTES = [
  ["POST", /^\/api\/v1\/contacts\/([^/]+)\/notes$/, noteWrite.POST],
  ["POST", /^\/api\/v1\/contacts\/([^/]+)\/notes\/remove$/, noteRemove.POST],
  ["PUT", /^\/api\/v1\/contacts\/([^/]+)\/details$/, detailsRoute.PUT],
];

/**
 * A tab over the world: the typed client on a fetch that runs the route a card names over the same database the card's
 * builder read, answered as the server answers (its envelope, or its refusal); the window the commit walk tells.
 */
function tabOver(world) {
  const sent = [];
  const events = [];
  const supabase = fakeDb(world, {}, doors(world));
  const client = createApi({
    fetch: async (url, init) => {
      const u = new URL(String(url), "http://localhost");
      const hit = CARD_ROUTES.find(([method, re]) => method === init.method && re.test(u.pathname));
      assert.ok(hit, `a route this walk does not run: ${init.method} ${u.pathname}`);
      const [, re, handler] = hit;
      sent.push({
        key: `${init.method} ${u.pathname}`,
        body: init.body ? JSON.parse(init.body) : undefined,
        via: init.headers["x-via"],
      });
      const ctx = { supabase, userId: USER, email: "ada@example.com", params: { id: re.exec(u.pathname)[1] } };
      try {
        return envelope(await handler.run(new Request(u, { method: init.method, body: init.body }), ctx));
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: { code: e.code, message: e.message } }), {
          status: e.status ?? 500,
        });
      }
    },
    workspace: () => A,
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async (key) => {
      events.push(`refresh ${key}`);
    },
    now: () => 1_000,
  });
  const win = {
    __SETTINGS: null,
    location: { hash: "" },
    dispatchEvent: (e) => {
      events.push(e.detail ? `${e.type} ${JSON.stringify(e.detail)}` : e.type);
      return true;
    },
    setTimeout: (fn) => {
      fn();
      return 1;
    },
  };
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
  return { client, win, sent, events, t };
}
const doneWith = (r) => ({ state: "done", receipt: r.receipt, atMs: 1, undo: r.undo });

test("a note card, walked end to end: the model's call makes it, Approve writes the note through the notes route with who reads it and tells the person's page, and Undo takes that very note away by the id the route answered", async () => {
  const world = cardWorld();
  const tab = tabOver(world);
  const built = await buildProposal(tab.t, "propose_person", {
    action: "note",
    contact_id: ROSA,
    body: "Prefers mornings.",
    for: "receptionist",
  });
  assert.equal(built.isError, false, built.result);
  const card = built.proposal;
  const done = await commitProposal(tab.win, card, tab.client);
  const [written] = world.person_notes;
  assert.deepEqual(done, { ok: true, receipt: "Rosa · Note added", undo: { contact_id: ROSA, note_id: written.id } });
  assert.deepEqual(
    [written.contact_id, written.body, written.team_only, written.due_on, written.deal_id],
    [ROSA, "Prefers mornings.", false, null, null],
    "for the receptionist: not team-only, no day and no deal",
  );
  assert.deepEqual(tab.sent, [
    {
      key: `POST /api/v1/contacts/${ROSA}/notes`,
      body: { body: "Prefers mornings.", team_only: false },
      via: "ask",
    },
  ]);
  assert.ok(tab.events.includes("refresh POST contacts/[id]/notes"), "People read again behind it");
  assert.ok(tab.events.includes(`note:saved ${JSON.stringify({ personId: ROSA })}`), "the person's page told");
  const undone = await undoProposal(tab.win, card, doneWith(done), tab.client);
  assert.deepEqual(undone, { ok: true, receipt: "Note deleted", undo: null });
  assert.deepEqual(world.person_notes, [], "the note it wrote is gone");
  assert.deepEqual(tab.sent[1], {
    key: `POST /api/v1/contacts/${ROSA}/notes/remove`,
    body: { note_id: written.id },
    via: "ask",
  });
  // For the team: the same route, team-only, and the receipt says so.
  const team = tabOver(cardWorld());
  const teamCard = await buildProposal(team.t, "propose_person", {
    action: "note",
    contact_id: QUINN,
    body: "Owes us a callback.",
    for: "team",
  });
  const r = await commitProposal(team.win, teamCard.proposal, team.client);
  assert.equal(r.receipt, "Quinn W · Note added · Team only");
  assert.deepEqual(team.sent[0].body, { body: "Owes us a callback.", team_only: true });
});

test("a details card, walked end to end: the model's call makes it from what the profile held, Approve sets only what changes through the details route, and Set it back puts the profile back as it was -- an address she did not have goes again", async () => {
  const world = cardWorld();
  const tab = tabOver(world);
  const built = await buildProposal(tab.t, "propose_person", {
    action: "details",
    contact_id: ROSA,
    name: "Rosa Díaz",
    email: "Rosa@Example.com",
  });
  assert.equal(built.isError, false, built.result);
  const card = built.proposal;
  const done = await commitProposal(tab.win, card, tab.client);
  assert.deepEqual(done, {
    ok: true,
    receipt: "Rosa · Name: Rosa Díaz · Email: rosa@example.com",
    undo: { contact_id: ROSA, name: "Rosa", email: "" },
  });
  const rosa = () => world.contacts.find((c) => c.id === ROSA);
  assert.deepEqual([rosa().display_name, rosa().email], ["Rosa Díaz", "rosa@example.com"]);
  assert.deepEqual(tab.sent, [
    {
      key: `PUT /api/v1/contacts/${ROSA}/details`,
      body: { name: "Rosa Díaz", email: "rosa@example.com" },
      via: "ask",
    },
  ]);
  assert.ok(tab.events.includes("surface:clients") && tab.events.includes("refresh PUT contacts/[id]/details"));
  // Asked again now, the same card is none: the profile says it already.
  const again = await buildProposal(tab.t, "propose_person", {
    action: "details",
    contact_id: ROSA,
    name: "Rosa Díaz",
  });
  assert.deepEqual(JSON.parse(again.result), { error: "already their name" });
  const back = await undoProposal(tab.win, card, doneWith(done), tab.client);
  assert.deepEqual(back, { ok: true, receipt: "Set back", undo: null });
  assert.deepEqual([rosa().display_name, rosa().email], ["Rosa", null], "her name back, and no address, as before");
  assert.deepEqual(tab.sent[1], {
    key: `PUT /api/v1/contacts/${ROSA}/details`,
    body: { name: "Rosa", email: "" },
    via: "ask",
  });
  // A name he never had on his profile: set, then set back to none, and the WhatsApp name shows again.
  const q = cardWorld();
  const qt = tabOver(q);
  const named = await buildProposal(qt.t, "propose_person", {
    action: "details",
    contact_id: QUINN,
    name: "Quinn Walker",
  });
  const set = await commitProposal(qt.win, named.proposal, qt.client);
  assert.deepEqual(set.undo, { contact_id: QUINN, name: "" });
  assert.equal(q.contacts.find((c) => c.id === QUINN).display_name, "Quinn Walker");
  await undoProposal(qt.win, named.proposal, doneWith(set), qt.client);
  assert.equal(q.contacts.find((c) => c.id === QUINN).display_name, null);
  assert.equal(q.contacts.find((c) => c.id === QUINN).email, "quinn@example.com", "his address untouched throughout");
});

test("REGRESSION: a details card with a name and an address another person here already has fails whole, in the door's words: her name is as it was, and no undo is kept -- the route set the name first, so the card failed with the name already changed", async () => {
  const world = cardWorld();
  const tab = tabOver(world);
  const built = await buildProposal(tab.t, "propose_person", {
    action: "details",
    contact_id: ROSA,
    name: "Rosa Díaz",
    email: "quinn@example.com",
  });
  assert.equal(built.isError, false, built.result);
  const failed = await commitProposal(tab.win, built.proposal, tab.client);
  assert.deepEqual(
    [failed.ok, failed.code, failed.status, failed.message, "undo" in failed],
    [false, "conflict", 409, "Another person here already has that address.", false],
    "the card fails in the door's words, keeping no undo",
  );
  const rosa = world.contacts.find((c) => c.id === ROSA);
  assert.deepEqual([rosa.display_name, rosa.email], ["Rosa", null], "nothing of the card was made");
  assert.deepEqual(
    tab.sent.map((s) => [s.key, s.body]),
    [[`PUT /api/v1/contacts/${ROSA}/details`, { name: "Rosa Díaz", email: "quinn@example.com" }]],
  );
  assert.ok(!tab.events.includes("surface:clients"), "nothing landed, nothing said");
});
