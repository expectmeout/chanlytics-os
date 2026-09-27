/**
 * Ask's workspace reads (Ask Rewired, PR 4.3, D13): workspace.connections, .notifications and .activity answer what
 * their pages' builders answer over the same readers -- Setup's rows (contracts setupSteps) and Connections' words for
 * a sending domain (sendingDomainWords), the bell's kept rows (serverNotificationRows), and Settings › Activity's lines --
 * over the database in memory, the registry dispatching as a turn does. Money stays out (the charter, §7): no billing
 * row, no price, no billing notice, no entry about money (billing's or a partner's share). The activity log is an owner's: refused below one by the registry
 * and again by its handler. The readers themselves are GET setup's, GET notifications' and GET activity's
 * (ask/readers.test.mjs).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  agoLabel,
  clockStamp,
  isActivityMoney,
  newReceptionistDefaults,
  sendingDomainWords,
  serverNotificationRows,
  setupSteps,
  unreadCount,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache, readerContext, load } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { connections } = await import(at("apps/dashboard/src/server/readers/connections.ts"));
const { notifications } = await import(at("apps/dashboard/src/server/readers/notifications.ts"));
const { activity } = await import(at("apps/dashboard/src/server/readers/activity.ts"));
const { runTool, newToolContext, READ_DEFS } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const TZ = "America/New_York";
const DAY = 86_400_000;
const ROLES = ["viewer", "operator", "partner", "owner"];
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
const ctxOf = (w) => ({ supabase: fakeDb(w.tables, {}, w.rpcs), userId: USER, email: "ada@example.com", params: {} });
/** Ask's workspace tool for `role` in harbor, on `now`; `rc` stands in for the turn's reads where a test needs it. */
const ask = async (w, input, role, now, rc) => {
  const ctx = ctxOf(w);
  const tc = newToolContext(ctx, A, role, TZ, now, rc?.(ctx, role, now));
  const out = await runTool(tc, { name: "workspace", input });
  return { out: JSON.parse(out.result), isError: out.isError, tc, ctx };
};

/* ------------------------------------------------------------------------------------------ connections */

/** setup.test.mjs, "what the first run's Check reads": Northside's listing and its receptionist, owned in harbor. */
const setupWorld = () => ({
  tables: {
    memberships: [membership(A, "owner", "harbor", "2026-01-01T00:00:00Z")],
    google_listings: [
      {
        tenant_id: A,
        place_id: "ChIJ-northside-movers",
        name: "Northside Movers",
        address: null,
        maps_uri: null,
        business_status: null,
        rating: null,
        review_count: null,
        linked_at: "2026-09-07T14:00:00Z",
        checked_at: null,
        check_error: null,
        facts: {
          hours: [{ open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } }],
          website: null,
          service_area_only: true,
          primary_type: "moving_company",
          booking_page: "https://calendly.com/northside-movers-example/estimate",
          phone_e164: "+13055550100",
        },
      },
    ],
    tenant_config: [
      {
        tenant_id: A,
        version: 3,
        config: { brain: { business_name: "Northside Movers", ...newReceptionistDefaults("Northside Movers") } },
      },
    ],
  },
  rpcs: {
    team_roster: () => [
      { membership_id: "m1", member_user_id: USER, email: "ada@example.com", display_name: "Ada", role: "owner" },
    ],
  },
});
const D1 = "5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e";
/** The same, sending cold email from a domain of its own, still waiting on its records. */
const sendingWorld = () => {
  const w = setupWorld();
  w.tables.mailboxes = [
    {
      id: "mb1",
      tenant_id: A,
      local_part: "harbor",
      reply_token: "a".repeat(24),
      reply_token_prev: null,
      from_name: "Harbor",
      reply_mode: "draft",
      last_received_at: null,
      last_error: null,
    },
  ];
  w.tables.sending_domains = [
    {
      id: D1,
      tenant_id: A,
      host: "send.example.com",
      from_local: "sam",
      from_name: "Sam",
      records: [],
      state: "records",
      provider_status: "not_started",
      dmarc: null,
      held_why: null,
      held_at: null,
      verified_at: null,
      clean_since: null,
      checked_at: null,
      created_at: "2026-09-25T12:00:00Z",
    },
  ];
  return w;
};
const SETUP_NOW = new Date("2026-09-07T15:00:00Z");
/** Setup's rows that are connections, as the tool keeps them. */
const CONNECTION_ROWS = ["line", "keep", "whatsapp", "email", "calendar", "google"];

test("workspace.connections answers Setup's own rows for the connections over GET setup's reader -- whether the receptionist answers, then the line, the number it keeps, WhatsApp, email, the calendar and Google, each in the page's words -- and each sending domain in Connections' words, a row in the read set; for every role", async () => {
  const was = process.env.EMAIL_DOMAIN;
  process.env.EMAIL_DOMAIN = "mail.example.com";
  try {
    for (const role of ROLES) {
      const w = sendingWorld();
      w.tables.memberships = [membership(A, role, "harbor", "2026-01-01T00:00:00Z")];
      const { out, isError, tc } = await ask(w, { action: "connections" }, role, SETUP_NOW);
      assert.equal(isError, false, JSON.stringify(out));
      const setup = (await load(readerContext(ctxOf(w), { tenantId: A, role }, SETUP_NOW), connections)).data.setup;
      const vm = setupSteps({ ...setup, later: [] }, SETUP_NOW.getTime());
      assert.deepEqual(out, {
        route: "start",
        answering: vm.readiness.sentence,
        connections: vm.rows
          .filter((r) => CONNECTION_ROWS.includes(r.id))
          .map((r) => ({
            what: r.title,
            state: r.stateWords,
            says: r.sentence,
            ...(r.details.length ? { details: r.details } : {}),
          })),
        sending_domains: setup.email.sending.domains.map((d) => {
          const words = sendingDomainWords(d);
          return {
            domain_id: d.id,
            route: "admin/integrations",
            host: d.host,
            state: words.pill,
            says: words.line,
            ...(words.stats ? { stats: words.stats } : {}),
            cap: words.cap,
            ...(words.fix ? { fix: words.fix } : {}),
            ...(words.next ? { next: words.next } : {}),
          };
        }),
      });
      assert.ok(out.connections.length > 0, `${role}: some connection is said`);
      assert.deepEqual(tc.read.domain.get(D1), {
        kind: "domain",
        id: D1,
        route: "admin/integrations",
        label: "send.example.com",
      });
    }
  } finally {
    if (was === undefined) delete process.env.EMAIL_DOMAIN;
    else process.env.EMAIL_DOMAIN = was;
  }
});

test("workspace.connections carries no money: Setup's billing row is none of its rows, the plan's price is never said, and a row that waits on Billing says only its state -- over a workspace whose Stripe door is open, with no plan yet and with one that cannot spend", async () => {
  const price = { id: "price_1", currency: "usd", unit_amount: 9_900, interval: "month", product_name: "Chanlytics" };
  for (const status of ["none", "past_due"]) {
    const w = setupWorld();
    const real = (await load(readerContext(ctxOf(w), { tenantId: A, role: "owner" }, SETUP_NOW), connections)).data;
    const billing = {
      ready: true,
      livemode: true,
      mode: "stripe",
      status,
      trial_end: null,
      current_period_end: null,
      trial_days: 14,
      price,
    };
    const setup = { ...real.setup, billing };
    // The turn's reads, the connections read answered with this workspace's own setup and its billing door open.
    const rc = (ctx, role, now) => {
      const base = readerContext(ctx, { tenantId: A, role }, now);
      const turn = base.turn;
      return {
        ...base,
        turn: {
          get: (c, r, args) =>
            r === connections ? Promise.resolve({ data: { setup, role }, rows: [], stamp: 0 }) : turn.get(c, r, args),
        },
      };
    };
    const { out, isError } = await ask(w, { action: "connections" }, "owner", SETUP_NOW, rc);
    assert.equal(isError, false, JSON.stringify(out));
    const said = JSON.stringify(out);
    // What the page itself says here, with the plan in it: the tool leaves it out.
    const page = setupSteps({ ...setup, later: [] }, SETUP_NOW.getTime());
    assert.ok(
      page.rows.some((r) => r.id === "billing"),
      `${status}: the page draws a billing row`,
    );
    assert.ok(!said.includes("$99") && !said.includes("99.00"), `${status}: no price: ${said}`);
    assert.ok(!/\bbilling\b/i.test(said), `${status}: no billing row or word: ${said}`);
    assert.ok(!("billing" in out), status);
    const line = out.connections.find((c) => c.what === page.rows.find((r) => r.id === "line")?.title);
    if (page.rows.find((r) => r.id === "line")?.verb?.to === "admin/billing")
      assert.deepEqual(
        Object.keys(line),
        ["what", "state"],
        `${status}: a row waiting on Billing says its state alone`,
      );
  }
});

/* ---------------------------------------------------------------------------------------- notifications */

const N1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const N2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const N3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const N4 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";
const N5 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc5";
/**
 * reads-routes.test.mjs, "reading notifications", on a clock: harbor's rows a day, two days, three days and forty days
 * old, one of bayside's; my own dismissal of N5, another person's mark on N1; the bell last opened two days ago.
 */
const notificationsWorld = (now) => {
  const ago = (days) => new Date(now - days * DAY).toISOString();
  const row = (id, tenant_id, kind, title, days, over = {}) => ({
    id,
    tenant_id,
    kind,
    title,
    body: "…",
    route: null,
    subject_type: null,
    subject_id: null,
    created_at: ago(days),
    ...over,
  });
  return {
    tables: {
      memberships: [membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z")],
      notifications: [
        row(N1, A, "handoff", "Rosa asked for a person", 1, {
          body: "She wrote: can I talk to someone?\nSecond line",
          route: "inbox/th-x",
          subject_type: "conversation",
          subject_id: "x",
        }),
        row(N5, A, "call", "A missed call", 2),
        row(N2, A, "billing", "Your trial ends in three days", 3, { route: "admin/billing" }),
        row(N3, A, "alert", "Old", 40),
        row(N4, B, "alert", "Elsewhere", 1),
      ],
      notification_marks: [
        { notification_id: N1, user_id: "someone-else", read_at: ago(0), dismissed_at: ago(0) },
        { notification_id: N5, user_id: USER, read_at: ago(1), dismissed_at: ago(1) },
      ],
      notification_reads: [{ tenant_id: A, user_id: USER, seen_at: ago(2.5) }],
    },
    rpcs: {},
  };
};

test("workspace.notifications answers the bell's kept rows over GET notifications' reader, for this person: their own dismissal gone, another's mark not theirs, unread by when they last opened the bell, each with its title, first line, how long ago and where it opens; the unread count the badge's; a billing notice stays out; for every role", async () => {
  const now = Date.parse("2026-09-20T15:00:00Z");
  for (const role of ROLES) {
    const w = notificationsWorld(now);
    const { out, isError } = await ask(w, { action: "notifications" }, role, new Date(now));
    assert.equal(isError, false, JSON.stringify(out));
    const dto = (await load(readerContext(ctxOf(w), { tenantId: A, role }, new Date(now)), notifications)).data;
    const rows = serverNotificationRows({
      ...dto,
      notifications: dto.notifications.filter((n) => n.kind !== "billing"),
    });
    assert.deepEqual(out, {
      unread: unreadCount(rows),
      notifications: rows.map((r) => ({
        title: r.title,
        says: r.message,
        when: agoLabel(r.at, now),
        unread: r.unread,
        open: r.to,
      })),
    });
    assert.deepEqual(
      out.notifications.map((n) => [n.title, n.says, n.when, n.unread, n.open]),
      [["Rosa asked for a person", "She wrote: can I talk to someone?", "1d", true, "inbox/th-x"]],
      `${role}: the handoff alone -- the call dismissed, the trial's notice money's, the old one past the month`,
    );
    assert.equal(out.unread, 1);
  }
});

/* ------------------------------------------------------------------------------------------------ activity */

/**
 * activity.test.mjs's fixture (ask/readers.test.mjs activityWorld), each event with the category its emitter files it
 * under, and beside it two entries about money -- the subscription's and a partner's share -- and a partner's
 * attribution, which is the workspace's and not money.
 */
const activityWorld = () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const C = "22222222-2222-4222-8222-222222222222";
  const K = "33333333-3333-4333-8333-333333333333";
  const decision = (id, tenant_id, verb, subject_type, subject_id, actor, payload, created_at) => ({
    id,
    tenant_id,
    verb,
    subject_type,
    subject_id,
    actor_type: "user",
    actor_user_id: actor,
    payload,
    created_at,
  });
  const event = (id, kind, subject_type, subject_id, data, created_at, category = kind.split(".")[0]) => ({
    id,
    tenant_id: A,
    kind,
    category,
    subject_type,
    subject_id,
    data,
    created_at,
  });
  return {
    tables: {
      memberships: [membership(A, "owner", "harbor", "2026-01-01T00:00:00Z")],
      tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
      conversations: [{ id: C, tenant_id: A, contact_id: P }],
      calls: [{ id: K, tenant_id: A, contact_id: P }],
      decisions: [
        decision(
          "d1",
          A,
          "consent_change",
          "contact",
          P,
          "u-ada",
          { consent: "opted_in", source: "form" },
          "2026-09-11T14:00:00Z",
        ),
        decision("d2", A, "take_over", "conversation", C, "u-bo", {}, "2026-09-11T15:00:00Z"),
        decision("d3", A, "export", "workspace", A, "u-ada", { what: "people", rows: 5 }, "2026-09-12T02:30:00Z"),
        decision("d4", B, "export", "workspace", B, "u-x", {}, "2026-09-11T16:00:00Z"),
      ],
      events: [
        event("e1", "message.received", "message", "m1", {}, "2026-09-11T14:30:00Z"),
        event("e2", "usage.ask_tokens", "user", USER, { tokens: 400 }, "2026-09-11T14:45:00Z"),
        event("e4", "call.recorded", "call", K, {}, "2026-09-10T10:00:00Z"),
        event("e5", "broadcast.sent", "broadcast", "b1", { sent: 3, held: 1 }, "2026-09-12T13:00:00Z"),
        event("e6", "billing.updated", "subscription", null, { status: "active" }, "2026-09-12T12:00:00Z", "billing"),
        event("e7", "partner.earned", "tenant", A, { earned_cents: 1200 }, "2026-09-12T11:00:00Z", "billing"),
        event("e8", "partner.attributed", "tenant", A, {}, "2026-09-12T10:00:00Z", "workspace"),
      ],
    },
    rpcs: {
      team_roster: () => [
        { membership_id: "m1", member_user_id: "u-ada", email: "ada@example.com", display_name: "Ada", role: "owner" },
        { membership_id: "m2", member_user_id: "u-bo", email: "bo@example.com", display_name: "", role: "operator" },
      ],
    },
    person: P,
  };
};
const ACT_NOW = new Date("2026-09-12T16:00:00Z");

test("workspace.activity answers Settings › Activity's lines over GET activity's reader, for an owner: both ledgers newest first, each who and what in the page's words by the business's clock and where it opens, the noise left out, filtered as the route filters; an entry about money (its category billing: the subscription's, a partner's share) stays out, and a kind about money is refused in words", async () => {
  const w = activityWorld();
  for (const [input, filter] of [
    [{}, {}],
    [{ person: w.person }, { person: w.person }],
    [{ day: "2026-09-11" }, { day: "2026-09-11" }],
  ]) {
    const { out, isError } = await ask(w, { action: "activity", ...input }, "owner", ACT_NOW);
    assert.equal(isError, false, JSON.stringify(out));
    const page = (await load(readerContext(ctxOf(w), { tenantId: A, role: "owner" }, ACT_NOW), activity, filter)).data;
    const lines = page.rows
      .filter((r) => !isActivityMoney(r))
      .map((r) => {
        const who = r.actor_user_id
          ? (page.actors[r.actor_user_id] ?? "A member")
          : r.actor_type === "ai"
            ? "Receptionist"
            : r.source === "event"
              ? ""
              : "System";
        const open =
          r.subject_type === "contact"
            ? `clients/${r.subject_id}`
            : r.subject_type === "conversation"
              ? `inbox/th-${r.subject_id}`
              : r.subject_type === "call"
                ? `conversations/cv-${r.subject_id}`
                : null;
        return {
          when: clockStamp(Date.parse(r.at), TZ, ACT_NOW.getTime()),
          what: who ? `${who} · ${r.text}` : r.text,
          open,
        };
      });
    assert.deepEqual(out, {
      route: "admin/activity",
      activity: lines,
      next_cursor: page.page.has_more ? page.page.next_cursor : null,
    });
  }
  const all = (await ask(w, { action: "activity" }, "owner", ACT_NOW)).out;
  assert.equal(all.activity.length, 7, "the ledger's rows and the attribution, less usage, billing and the share");
  assert.ok(!JSON.stringify(all).includes("billing"), "no billing entry");
  const page = (await load(readerContext(ctxOf(w), { tenantId: A, role: "owner" }, ACT_NOW), activity, {})).data;
  const money = page.rows.filter(isActivityMoney).map((r) => r.id);
  assert.deepEqual(money.sort(), ["e-e6", "e-e7"], "the page holds both, and says them");
  assert.ok(!all.activity.some((l) => page.rows.find((r) => r.id === "e-e7").text === l.what), "a partner's share");
  assert.ok(
    all.activity.some((l) => l.what === page.rows.find((r) => r.id === "e-e8").text),
    "an attribution is not",
  );
  assert.ok(
    all.activity.some((l) => l.what.startsWith("Ada · ")),
    "a member is named as the page names them",
  );
  for (const kind of ["billing.updated", "partner.earned"]) {
    const refused = await ask(w, { action: "activity", kind }, "owner", ACT_NOW);
    assert.deepEqual(
      [refused.isError, refused.out.error],
      [true, "that kind is about money, which stays out of Ask: its page has it"],
      kind,
    );
  }
  const attributed = await ask(w, { action: "activity", kind: "partner.attributed" }, "owner", ACT_NOW);
  assert.deepEqual([attributed.isError, attributed.out.activity.length], [false, 1], "the workspace's, said");
  const bad = await ask(w, { action: "activity", day: "Friday" }, "owner", ACT_NOW);
  assert.equal(bad.isError, true);
  assert.match(bad.out.error, /^workspace: day /);
});

test("workspace.activity is an owner's (D13): below an owner the registry refuses it in words before anything is read, and its handler, reached past the registry, refuses again; the other three actions are every member's", async () => {
  const w = activityWorld();
  for (const role of ["viewer", "operator", "partner"]) {
    const { out, isError, ctx } = await ask(w, { action: "activity" }, role, ACT_NOW);
    assert.deepEqual([isError, out.error], [true, "workspace: action activity is an owner's"], role);
    assert.deepEqual(ctx.supabase.seen, [], `${role}: nothing read`);
    const def = READ_DEFS.find((d) => d.name === "workspace").actions.activity;
    const ctx2 = ctxOf(w);
    const direct = await def.run(newToolContext(ctx2, A, role, TZ, ACT_NOW), {});
    assert.deepEqual(direct, { error: "workspace: action activity is an owner's" }, `${role}: the handler's own check`);
    assert.deepEqual(ctx2.supabase.seen, [], `${role}: nothing read past the registry either`);
  }
  const tool = READ_DEFS.find((d) => d.name === "workspace");
  assert.equal(tool.actions.activity.needs, "owner");
  for (const a of ["settings", "connections", "notifications"]) assert.equal(tool.actions[a].needs, undefined, a);
});

test("workspace.activity pages without a gap or a repeat: past the thirty it says, the next read starts right after the last one said; where the rest of the reader's page is money, after the page -- so every line is said once, in order, and the last read has no next_cursor", async () => {
  const T0 = Date.parse("2026-09-12T15:00:00Z");
  const at = (i) => new Date(T0 - i * 60_000).toISOString();
  const K = (i) => `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`;
  // 20 calls, then 80 entries about money filling the rest of the reader's first page of a hundred, then 40 calls.
  const events = [];
  for (let i = 0; i < 140; i++) {
    const money = i >= 20 && i < 100;
    events.push({
      id: `x${String(i).padStart(3, "0")}`,
      tenant_id: A,
      kind: money ? "partner.earned" : "call.recorded",
      category: money ? "billing" : "call",
      subject_type: money ? "tenant" : "call",
      subject_id: money ? A : K(i),
      data: {},
      created_at: at(i),
    });
  }
  const w = activityWorld();
  w.tables.decisions = [];
  w.tables.events = events;
  const said = [];
  const cursors = [];
  let cursor;
  for (let n = 0; n < 10; n++) {
    const { out, isError } = await ask(w, { action: "activity", ...(cursor ? { cursor } : {}) }, "owner", ACT_NOW);
    assert.equal(isError, false, JSON.stringify(out));
    said.push(...out.activity.map((l) => l.open));
    cursors.push(out.next_cursor);
    if (!out.next_cursor) break;
    cursor = out.next_cursor;
  }
  const calls = events.filter((e) => e.category === "call").map((e) => `conversations/cv-${e.subject_id}`);
  assert.deepEqual(said, calls, "every call once, newest first: no gap, no repeat");
  assert.deepEqual(
    cursors,
    [`${at(99)}|e-x099`, `${at(129)}|e-x129`, null],
    "the reader's page end where the rest was money; the thirtieth line said; none at the end",
  );
});
