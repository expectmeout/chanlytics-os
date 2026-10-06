/**
 * The channel-quality sweep, run (the Reports lenses spec, K9): POST /api/cron/channel-quality over a database in memory
 * and a captured wire to Meta's Graph API, which answers what the test writes and never reaches Meta. Each connected
 * number not read lately is read once with its own workspace's token, and what Meta says is kept through the door
 * (channel_keep_quality) only when it is a rating word; every way a read can come to nothing leaves the channel as it was
 * and the next number is read all the same; and a late tick does not read twice.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { HOUR_MS, MIN_MS } from "@chanlytics/contracts";
import { resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { logLineOf, fieldsOf } from "../_log-lines.mjs";
import { at, knock, answer, vault, wire } from "../_cron-doors-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID", "WHATSAPP_ACCESS_TOKEN"])
  delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST, YIELD_AT_MS } = await import(at("apps/edge/api/cron/channel-quality.ts"));
const { readNumberQualities } = await import(at("apps/edge/lib/whatsapp/number-quality.ts"));
after(() => setPg(null));
beforeEach(() => resetBreakers());

const T = (n) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const channel = (n, over = {}) => ({
  id: `ch-${n}`,
  tenant_id: T(n),
  kind: "whatsapp",
  external_id: `10654000000000${n}`,
  status: "active",
  credentials_ref: `ref-${n}`,
  config: {},
  ...over,
});

/**
 * The world: the channels, a vault, the credentials door, and the keeping door as the SQL answers it. `over` names the
 * channels (by id) whose credentials are empty (noToken) or whose read fails (vaultDown), whose keeping the database
 * refuses (refuse), finds gone (gone) or answers with a word the door does not have (strange), and the table faults.
 */
function world(channels, over = {}) {
  // The owner's mailbox is the workspace's own, and the bell is a table: what a number that turns BLOCKED is told through.
  const tables = {
    tenant_channels: channels,
    notifications: [],
    tenant_config: channels.map((c) => ({
      tenant_id: c.tenant_id,
      config: { notifications: { escalation_emails: ["owner@harbor.test"] } },
    })),
  };
  const kept = [];
  const standings = [];
  const db = fakeDb(tables, over.faults ?? {}, {
    ...vault,
    get_channel_credentials: ({ p_channel_id }) => {
      if (over.vaultDown?.includes(p_channel_id)) throw new Error("the vault did not answer");
      return over.noToken?.includes(p_channel_id) ? {} : { access_token: `token-${p_channel_id}`, phone_id: "x" };
    },
    channel_keep_quality: ({ p_tenant_id, p_channel_id, p_rating }) => {
      if (over.refuse?.includes(p_channel_id)) throw new Error("the database refused");
      if (over.gone?.includes(p_channel_id)) return "gone";
      if (over.strange?.includes(p_channel_id)) return "maybe";
      kept.push([p_tenant_id, p_channel_id, p_rating]);
      const ch = tables.tenant_channels.find((c) => c.id === p_channel_id);
      const was = ch.config.quality_read ?? null;
      ch.config = { ...ch.config, quality_read: p_rating, quality_read_at: new Date().toISOString() };
      return was === null ? "first" : was === p_rating ? "same" : "changed";
    },
    // What Meta holds about the number, kept as the SQL door keeps it (00338): whole, beside the rating.
    channel_keep_standing: ({ p_tenant_id, p_channel_id, p_standing }) => {
      if (over.refuseStanding?.includes(p_channel_id)) throw new Error("the database refused");
      if (over.goneStanding?.includes(p_channel_id)) return "gone";
      standings.push([p_tenant_id, p_channel_id, p_standing.can_send]);
      const ch = tables.tenant_channels.find((c) => c.id === p_channel_id);
      const was = ch.config.standing?.can_send ?? null;
      ch.config = { ...ch.config, standing: p_standing, standing_read_at: new Date().toISOString() };
      return was === null ? "first" : was === p_standing.can_send ? "same" : "changed";
    },
  });
  setPg(db);
  return { tables, db, kept, standings };
}

/** Meta's Graph, as the test scripts it: one answer per phone number id. */
function graph(answers) {
  return wire((url) => {
    if (url.startsWith("https://api.resend.com/")) return new Response("{}", { status: 200 });
    const id = /\/(\d{15})\?/.exec(url)?.[1];
    // A number's rating is the answer itself; what Meta holds about it is more reads (the phone's health, and the account's
    // verification, funding and owner), scripted as `standing`, `waba`, `funding` and `owner`: a number with none scripted has a
    // standing that cannot be read.
    const asked = url.includes("fields=health_status")
      ? "standing"
      : url.includes("fields=business_verification_status")
        ? "waba"
        : url.includes("fields=primary_funding_id")
          ? "funding"
          : url.includes("fields=owner_business_info")
            ? "owner"
            : null;
    const a = (asked ? answers[id]?.[asked] : answers[id]) ?? {
      status: 404,
      body: { error: { message: "no such number" } },
    };
    if (a === "throws") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(a.body), {
      status: a.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
}
const rating = (word) => ({ body: { id: "x", quality_rating: word } });
/** Meta's answer for a number that may send (AVAILABLE), is limited, or is blocked, naming a missing payment method as its problem. */
const health = (word) => ({
  body: {
    id: "x",
    verified_name: "Harbor Moving",
    name_status: "APPROVED",
    health_status: {
      can_send_message: word,
      entities:
        word === "BLOCKED"
          ? [
              {
                entity_type: "WABA",
                id: "1",
                errors: [
                  {
                    error_code: 141006,
                    error_description: "A payment method is required to send messages",
                    possible_solution: "Add a payment method in WhatsApp Manager",
                  },
                ],
              },
            ]
          : [],
    },
  },
});
/** The calls that read a rating: what the sweep asked before it asked what a number may do. */
const ratingCalls = (g) => g.calls.filter((c) => c.url.includes("quality_rating"));
/** A standing that is not asked in a test that calls the sweep with its own reads: nothing here may reach a wire. */
const NOT_ASKED = async () => ({ ok: false, error: "not asked in this test", code: null, status: 0 });

/** A logger that keeps what it is told: [level, event, fields]. */
function lines() {
  const said = [];
  const say = (level) => (event, fields) => said.push([level, event, fields]);
  return { said, log: { info: say("info"), warn: say("warn"), error: say("error") } };
}

test("the door: the cron key or nothing; no database is a 503", async () => {
  world([channel(1)]);
  const [status] = await answer(await knock(POST, "channel-quality", "wrong-key"));
  assert.ok(status === 401 || status === 403, `refused: ${status}`);
  setPg(null);
  const [s] = await answer(await knock(POST, "channel-quality"));
  assert.equal(s, 503);
});

test("a tick reads each due number once with its own workspace's token, and keeps what Meta says; a number read lately, a disabled one and a voice line are not asked", async () => {
  const w = world([
    channel(1), // never read
    channel(2, { config: { quality_read: "GREEN", quality_read_at: ago(HOUR_MS) } }), // read an hour ago: not due
    channel(3, { config: { quality_read: "GREEN", quality_read_at: ago(7 * HOUR_MS) } }), // due; Meta says RED now
    channel(4, { status: "disabled" }),
    channel(5, { kind: "voice" }),
  ]);
  const g = graph({ 106540000000001: rating("GREEN"), 106540000000003: rating("RED") });
  try {
    const [status, body] = await answer(await knock(POST, "channel-quality"));
    assert.equal(status, 200);
    assert.deepEqual(body, {
      ok: true,
      due: 2,
      read: 2,
      first: 1,
      changed: 1,
      same: 0,
      gone: 0,
      no_token: 0,
      unreadable: 0,
      not_a_rating: 0,
      left: 0,
      standing_first: 0,
      standing_changed: 0,
      standing_same: 0,
      standing_gone: 0,
      standing_unreadable: 2,
      standing_told: 0,
    });
    assert.deepEqual(w.kept, [
      [T(1), "ch-1", "GREEN"],
      [T(3), "ch-3", "RED"],
    ]);
    assert.equal(ratingCalls(g).length, 2, "two ratings read, not five");
    assert.deepEqual(
      ratingCalls(g).map((c) => [/\/(\d{15})\?/.exec(c.url)[1], c.init.headers.authorization]),
      [
        ["106540000000001", "Bearer token-ch-1"],
        ["106540000000003", "Bearer token-ch-3"],
      ],
      "each with its own workspace's token",
    );
    assert.ok(ratingCalls(g).every((c) => c.url.includes("fields=") && c.url.includes("quality_rating")));
    assert.equal(
      g.calls.length,
      4,
      "and what each number may do, asked beside it (here unreadable: nothing is scripted)",
    );
  } finally {
    g.restore();
  }
});

test("a number is read again five hours after its last read, and not a minute before", async () => {
  const w = world([
    channel(1, { config: { quality_read: "GREEN", quality_read_at: ago(5 * HOUR_MS - MIN_MS) } }),
    channel(2, { config: { quality_read: "GREEN", quality_read_at: ago(5 * HOUR_MS + MIN_MS) } }),
  ]);
  const g = graph({ 106540000000001: rating("GREEN"), 106540000000002: rating("GREEN") });
  try {
    const [, body] = await answer(await knock(POST, "channel-quality"));
    assert.deepEqual([body.due, body.same], [1, 1]);
    assert.deepEqual(
      w.kept.map((k) => k[1]),
      ["ch-2"],
      "only the one read five hours and a minute ago",
    );
  } finally {
    g.restore();
  }
});

test("a read that comes to nothing leaves the channel as it was and never costs the next number its read: an error, a word outside Meta's, no word, a dead network, no credentials, a refusing database", async () => {
  const w = world([channel(1), channel(2), channel(3), channel(4), channel(5), channel(6), channel(7)], {
    noToken: ["ch-5"],
    refuse: ["ch-6"],
  });
  const g = graph({
    106540000000001: { status: 400, body: { error: { message: "token revoked", code: 190 } } },
    106540000000002: rating("SHINY"),
    106540000000003: { body: { id: "x" } },
    106540000000004: "throws",
    106540000000005: rating("GREEN"),
    106540000000006: rating("YELLOW"),
    106540000000007: rating("na"),
  });
  try {
    const [status, body] = await answer(await knock(POST, "channel-quality"));
    assert.equal(status, 200, "Meta's trouble is not the sweep's failure");
    assert.deepEqual(
      [body.unreadable, body.not_a_rating, body.no_token, body.read],
      [3, 2, 1, 1],
      "the error, the dead network and the refusing database are unreadable; SHINY and no word are not a rating; one had no credentials",
    );
    assert.deepEqual(w.kept, [[T(7), "ch-7", "NA"]], "only the last was kept, and in capitals");
    for (const n of [1, 2, 3, 4, 5, 6])
      assert.deepEqual(w.tables.tenant_channels[n - 1].config, {}, `channel ${n} is as it was`);
  } finally {
    g.restore();
  }
});

test("a tick that is out of time starts no read and says what it left; the longest unread are first next time", async () => {
  const channels = Array.from({ length: 9 }, (_, i) =>
    channel(i + 1, { config: { quality_read_at: ago((20 - i) * HOUR_MS) } }),
  );
  const w = world(channels);
  const t0 = Date.now();
  let clock = t0;
  const asked = [];
  const out = await readNumberQualities({
    db: w.db,
    log: { info() {}, warn() {}, error() {} },
    // The first batch is read at once; by the time the second is considered the tick is out of time.
    now: () => (clock += asked.length ? YIELD_AT_MS + 1_000 : 0),
    started: t0,
    yieldAtMs: YIELD_AT_MS,
    standing: NOT_ASKED,
    read: async (_token, id) => (asked.push(id), { ok: true, data: { quality_rating: "GREEN" } }),
  });
  assert.equal(asked.length, 4, "one batch of four");
  assert.deepEqual([out.due, out.read, out.left], [9, 4, 5]);
  assert.deepEqual(
    w.kept.map((k) => k[1]),
    ["ch-1", "ch-2", "ch-3", "ch-4"],
    "the four longest unread",
  );
});

test("a number never read is read before one read long ago, and the longest unread before the rest", async () => {
  const w = world([
    channel(1, { config: { quality_read_at: ago(9 * HOUR_MS) } }),
    channel(2, { config: { quality_read_at: ago(30 * HOUR_MS) } }),
    channel(3), // never read
    channel(4, { config: { quality_read_at: ago(12 * HOUR_MS) } }),
  ]);
  const asked = [];
  await readNumberQualities({
    db: w.db,
    log: lines().log,
    now: Date.now,
    started: Date.now(),
    yieldAtMs: YIELD_AT_MS,
    standing: NOT_ASKED,
    read: async (_token, id) => (asked.push(id), { ok: true, data: { quality_rating: "GREEN" } }),
  });
  assert.deepEqual(asked, ["106540000000003", "106540000000002", "106540000000004", "106540000000001"]);
});

test("channels that cannot be read are a 503, and Meta is not asked", async () => {
  world([channel(1)], { faults: { "tenant_channels.select": { message: "connection reset" } } });
  const g = graph({ 106540000000001: rating("GREEN") });
  try {
    const [status, body] = await answer(await knock(POST, "channel-quality"));
    assert.deepEqual([status, body], [503, { ok: false, error: "no_database" }]);
    assert.equal(g.calls.length, 0);
  } finally {
    g.restore();
  }
});

test("every due number lands in one count: kept, gone, without a token, unreadable, no rating or left; a stamp that is no time is a number never read, and the read heals it", async () => {
  const w = world(
    [
      channel(1, { config: { quality_read: "GREEN", quality_read_at: ago(6 * HOUR_MS) } }), // Meta says GREEN: same
      channel(2), // the channel was disabled between the listing and the keeping: gone
      channel(3), // the vault did not answer: unreadable, and Meta is not asked
      channel(4), // the door answers with a word it does not have: unreadable
      channel(5, { config: { quality_read_at: "last tuesday" } }), // a stamp that is no time: never read, so asked
      channel(6), // no credentials held
    ],
    { gone: ["ch-2"], vaultDown: ["ch-3"], strange: ["ch-4"], noToken: ["ch-6"] },
  );
  const g = graph({
    106540000000001: rating("GREEN"),
    106540000000002: rating("RED"),
    106540000000003: rating("RED"),
    106540000000004: rating("RED"),
    106540000000005: rating("RED"),
    106540000000006: rating("RED"),
  });
  try {
    const [status, body] = await answer(await knock(POST, "channel-quality"));
    assert.equal(status, 200);
    assert.deepEqual(body, {
      ok: true,
      due: 6,
      read: 2,
      first: 1,
      changed: 0,
      same: 1,
      gone: 1,
      no_token: 1,
      unreadable: 2,
      not_a_rating: 0,
      left: 0,
      standing_first: 0,
      standing_changed: 0,
      standing_same: 0,
      standing_gone: 0,
      standing_unreadable: 4,
      standing_told: 0,
    });
    const { due, read, gone, no_token, unreadable, not_a_rating, left } = body;
    assert.equal(due, read + gone + no_token + unreadable + not_a_rating + left, "each due number is counted once");
    assert.deepEqual(
      ratingCalls(g).map((c) => /\/(\d{15})\?/.exec(c.url)[1]),
      ["106540000000002", "106540000000004", "106540000000001", "106540000000005"],
      "Meta is asked only where a token was held: the numbers never read first, then the one read before last, then the stamp that is no time",
    );
    const healed = w.tables.tenant_channels[4].config;
    assert.equal(healed.quality_read, "RED");
    assert.ok(Math.abs(Date.parse(healed.quality_read_at) - Date.now()) < MIN_MS, "its stamp is a time now");
  } finally {
    g.restore();
  }
});

test("Meta's five words are kept in capitals however it cases or pads them; a number, an empty word or a null is not a rating", async () => {
  const w = world([1, 2, 3, 4, 5, 6, 7].map((n) => channel(n)));
  const g = graph({
    106540000000001: rating("yellow"),
    106540000000002: rating(" UNKNOWN\n"),
    106540000000003: rating("Red"),
    106540000000004: rating(""),
    106540000000005: rating(3),
    106540000000006: rating(null),
    106540000000007: rating("NA"),
  });
  try {
    const [, body] = await answer(await knock(POST, "channel-quality"));
    assert.deepEqual([body.read, body.not_a_rating], [4, 3]);
    assert.deepEqual(w.kept.map((k) => k[2]).sort(), ["NA", "RED", "UNKNOWN", "YELLOW"]);
  } finally {
    g.restore();
  }
});

test("what the sweep says of a failed number names the channel and Meta's answer, and carries no token and no number", async () => {
  const w = world([channel(1), channel(2), channel(3)], { refuse: ["ch-2"] });
  const g = graph({
    106540000000001: {
      status: 400,
      body: { error: { message: "Object with ID '106540000000001' does not exist", code: 100 } },
    },
    106540000000002: rating("GREEN"),
    106540000000003: rating("GREEN"),
  });
  const { said, log } = lines();
  try {
    const out = await readNumberQualities({
      db: w.db,
      log,
      now: Date.now,
      started: Date.now(),
      yieldAtMs: YIELD_AT_MS,
    });
    assert.deepEqual([out.unreadable, out.first], [2, 1]);
    const events = said.map(([, event]) => event).filter((event) => event.startsWith("channel_quality_"));
    assert.deepEqual(events.sort(), ["channel_quality_read_failed", "channel_quality_row_failed"]);
    const failed = said.find(([, event]) => event === "channel_quality_read_failed")[2];
    assert.deepEqual(
      [failed.channel_id, failed.status, failed.code],
      ["ch-1", 400, 100],
      "the channel, and what Meta said by its numbers",
    );
    assert.equal(said.find(([, event]) => event === "channel_quality_row_failed")[2].channel_id, "ch-2");
    const text = JSON.stringify(said);
    assert.doesNotMatch(text, /token-ch|Bearer/, "no token");
    assert.doesNotMatch(text, /10654000000000\d/, "no number, not even in what Meta said");
  } finally {
    g.restore();
  }
});

test("the tick ends in one line that carries every count, the number of workspaces without credentials too", async () => {
  // The logger redacts a key that ends in `token`, so the count the answer calls no_token must not be logged by that name.
  world([channel(1), channel(2), channel(3)], { noToken: ["ch-2", "ch-3"] });
  const g = graph({ 106540000000001: rating("GREEN") });
  const said = [];
  const real = console.log;
  console.log = (...a) => said.push(a);
  try {
    await answer(await knock(POST, "channel-quality"));
  } finally {
    console.log = real;
    g.restore();
  }
  const swept = said.map(logLineOf).filter((l) => l?.event === "channel_quality_swept");
  assert.equal(swept.length, 1);
  assert.deepEqual(fieldsOf(swept[0]), {
    sweep: "channel_quality",
    due: 3,
    read: 1,
    first: 1,
    changed: 0,
    same: 0,
    gone: 0,
    tokenless: 2,
    unreadable: 0,
    not_a_rating: 0,
    left: 0,
    standing_first: 0,
    standing_changed: 0,
    standing_same: 0,
    standing_gone: 0,
    standing_unreadable: 1,
    standing_told: 0,
  });
});

test("beside each rating the sweep asks what Meta holds about the number, with the same token, and keeps it whole; the owner is told once when a number turns BLOCKED, and the tick counts every standing it asked for", async () => {
  const blocked = (can_send, extra = {}) => ({
    standing: {
      can_send,
      problems: [],
      notes: [],
      name: null,
      name_status: null,
      verification: null,
      limit: null,
      has_payment_method: null,
      owner_business_id: null,
      waba_id: null,
      ...extra,
    },
  });
  const w = world(
    [
      channel(1, { waba_id: "205540000000001", number_e164: "+13055550142" }), // never read: Meta says BLOCKED, and is asked of its account too
      channel(2, { config: { standing: blocked("BLOCKED").standing } }), // BLOCKED before, and still: not told again
      channel(3, { config: { standing: blocked("AVAILABLE").standing } }), // AVAILABLE before, LIMITED now: kept, not told
      channel(4, { config: { standing: blocked("AVAILABLE").standing } }), // AVAILABLE before, BLOCKED now: told
      channel(5), // the rating cannot be read; the standing can: the two fail apart
      channel(6), // Meta answers the standing with nothing about what the number may do
      channel(7), // the database door says it is not this workspace's channel any more
      channel(8), // the database refuses the keeping
      channel(9), // no credentials: neither is asked
    ],
    { goneStanding: ["ch-7"], refuseStanding: ["ch-8"], noToken: ["ch-9"] },
  );
  const g = graph({
    106540000000001: { ...rating("GREEN"), standing: health("BLOCKED") },
    // The account's own reads are answered by the account's id.
    205540000000001: {
      waba: {
        body: { business_verification_status: "not_verified", whatsapp_business_manager_messaging_limit: "TIER_250" },
      },
      funding: { body: { id: "205540000000001" } },
      owner: { body: { id: "205540000000001", owner_business_info: { id: "410540000000001" } } },
    },
    106540000000002: { ...rating("GREEN"), standing: health("BLOCKED") },
    106540000000003: { ...rating("GREEN"), standing: health("LIMITED") },
    106540000000004: { ...rating("GREEN"), standing: health("BLOCKED") },
    106540000000005: {
      status: 400,
      body: { error: { message: "token revoked", code: 190 } },
      standing: health("AVAILABLE"),
    },
    106540000000006: { ...rating("GREEN"), standing: { body: { id: "x" } } },
    106540000000007: { ...rating("GREEN"), standing: health("AVAILABLE") },
    106540000000008: { ...rating("GREEN"), standing: health("AVAILABLE") },
    106540000000009: { ...rating("GREEN"), standing: health("AVAILABLE") },
  });
  try {
    const [status, body] = await answer(await knock(POST, "channel-quality"));
    assert.equal(status, 200);
    assert.deepEqual(
      [
        body.due,
        body.standing_first,
        body.standing_changed,
        body.standing_same,
        body.standing_gone,
        body.standing_unreadable,
        body.standing_told,
      ],
      [9, 2, 2, 1, 1, 2, 2],
      "asked: ch-1 and ch-5 for the first time, ch-3 and ch-4 changed, ch-2 the same, ch-7 gone; ch-6 and ch-8 unreadable; ch-9 had no credentials. Told: ch-1 and ch-4",
    );
    assert.equal(
      body.standing_first + body.standing_changed + body.standing_same + body.standing_gone + body.standing_unreadable,
      8,
      "every number asked of Meta for its standing is counted once; the one without credentials is asked for neither",
    );
    assert.deepEqual(
      w.standings.map(([, id, word]) => [id, word]).sort(),
      [
        ["ch-1", "BLOCKED"],
        ["ch-2", "BLOCKED"],
        ["ch-3", "LIMITED"],
        ["ch-4", "BLOCKED"],
        ["ch-5", "AVAILABLE"],
      ],
      "kept: the standing of each number whose read and whose door answered",
    );
    assert.deepEqual(w.tables.tenant_channels[0].config.standing.problems, [
      {
        entity: "WABA",
        code: 141006,
        said: "A payment method is required to send messages",
        fix: "Add a payment method in WhatsApp Manager",
      },
    ]);
    assert.deepEqual(
      w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title]).sort(),
      [
        [T(1), "number", "admin/integrations", "WhatsApp can't send from your number"],
        [T(4), "number", "admin/integrations", "WhatsApp can't send from your number"],
      ],
      "the owners of the two numbers that turned BLOCKED are told, on the bell; the one that stayed BLOCKED is not",
    );
    assert.ok(w.tables.notifications.find((n) => n.tenant_id === T(1)).body.includes("+1 (305) 555-0142"));
    // The token each read carried is its own workspace's, the rating's and the standing's alike; the account is asked only where one is on file.
    for (const c of g.calls.filter((x) => x.url.includes("graph.facebook.com")))
      assert.equal(c.init.headers.authorization, `Bearer token-ch-${/\/\d{14}(\d)\?/.exec(c.url)[1]}`, c.url);
    for (const fields of ["business_verification_status", "primary_funding_id", "owner_business_info"]) {
      const reads = g.calls.filter((c) => c.url.includes(`fields=${fields}`));
      assert.deepEqual(
        reads.map((c) => c.url.includes("/205540000000001?")),
        [true],
        `one ${fields} read, for the one number with an account on file`,
      );
    }
    const kept = w.tables.tenant_channels[0].config.standing;
    assert.deepEqual(
      [kept.verification, kept.limit, kept.has_payment_method, kept.owner_business_id, kept.waba_id],
      ["not_verified", "TIER_250", false, "410540000000001", "205540000000001"],
      "and what the account said is in the standing: its verification and tier, no payment method on file, and who owns it",
    );
  } finally {
    g.restore();
  }
});
