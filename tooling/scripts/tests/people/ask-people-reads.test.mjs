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
const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

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
