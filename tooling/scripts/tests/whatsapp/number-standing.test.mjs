/**
 * What Meta holds about a connected number (apps/edge/lib/whatsapp/meta-graph.ts numberStanding, number-standing.ts
 * readAndKeepStanding), run over a captured wire to Meta's Graph API that answers what the test writes, and a database in
 * memory whose keeping door answers as the SQL door does (00330: first, changed, same, gone).
 *   - the reading: the four Graph calls it makes and the token they carry (the phone's health, and three of the account's, asked
 *     apart: its verification and tier, whether it has a payment method, and the business that owns it); Meta's answer as a
 *     standing (every entity's errors and notes, its words kept as it said them, text and lists cut); an account read that Meta
 *     refuses costs only what it held, and a payment method that cannot be read is never taken for one that is missing; a number
 *     with no WABA on file asks only the phone; a phone that cannot be read, or whose answer says nothing about what it may do, is a
 *     failed read and never a standing;
 *   - the keeping and the telling: a number that turns BLOCKED is told to the owner once (the bell row and the owner's mail, in
 *     the words contracts says); one that stays BLOCKED, or turns LIMITED, or is read for the first time as AVAILABLE, is not;
 *     every way the work can fail is an outcome and a line, never a throw, and no line carries the token, a number or Meta's words.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

// The owner's mailbox is the workspace's own (tenant_config), the platform's is configured, and no environment pair exists.
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID", "WHATSAPP_ACCESS_TOKEN"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { GRAPH_VERSION, numberStanding } = await import(at("apps/edge/lib/whatsapp/meta-graph.ts"));
const { readAndKeepStanding } = await import(at("apps/edge/lib/whatsapp/number-standing.ts"));
beforeEach(() => resetBreakers());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "owner@harbor.test";
const PHONE = "106540000000001";
const WABA = "205540000000001";
const TOKEN = "EAAB-business-token-nobody-may-see";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const NUMBER = { tenant_id: A, channel_id: "ch-1", phone_number_id: PHONE, waba_id: WABA, number_e164: "+13055550142" };

/* -------------------------------- the wire -------------------------------- */

const requests = [];
const realFetch = globalThis.fetch;
/** Meta's answers, by the path asked (without the version); a case replaces it. */
let script = () => ({ status: 404, body: { error: { message: "no such thing", code: 100 } } });
globalThis.fetch = async (url, init) => {
  const u = String(url);
  requests.push({ url: u, init });
  if (u.startsWith("https://api.resend.com/")) return new Response("{}", { status: 200 });
  const a = script(u.replace(GRAPH, ""));
  if (a === "throws") throw new TypeError("fetch failed");
  return new Response(JSON.stringify(a.body ?? {}), {
    status: a.status ?? 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});
const graphCalls = () => requests.filter((r) => r.url.startsWith(GRAPH));
const mailSent = () =>
  requests.filter((r) => r.url.startsWith("https://api.resend.com/")).map((r) => JSON.parse(r.init.body));
/** The business that owns the account, and the account's answers for what is asked of it apart: funded (a funding id), unfunded (none), its owner. */
const BUSINESS = "410540000000001";
const FUNDED = { body: { id: WABA, primary_funding_id: "100200300400500" } };
const UNFUNDED = { body: { id: WABA } };
const OWNED = { body: { id: WABA, owner_business_info: { id: BUSINESS } } };
/** Meta's answers by what is asked: the phone, and the account's verification and tier, its funding, and its owner. */
const asks =
  (phone, waba, funding = UNFUNDED, owner = OWNED) =>
  (p) =>
    p.startsWith(`/${PHONE}?`)
      ? phone
      : p.startsWith(`/${WABA}?fields=primary_funding_id`)
        ? funding
        : p.startsWith(`/${WABA}?fields=owner_business_info`)
          ? owner
          : p.startsWith(`/${WABA}?`)
            ? waba
            : { status: 404, body: {} };

const BLOCKED_PHONE = {
  body: {
    id: PHONE,
    verified_name: "Harbor Moving",
    name_status: "APPROVED",
    health_status: {
      can_send_message: "BLOCKED",
      entities: [
        { entity_type: "PHONE_NUMBER", id: PHONE, can_send_message: "AVAILABLE" },
        {
          entity_type: "WABA",
          id: WABA,
          can_send_message: "BLOCKED",
          errors: [
            {
              error_code: 141006,
              error_description: "A payment method is required to send messages",
              possible_solution: "Add a payment method in WhatsApp Manager",
            },
          ],
        },
      ],
    },
  },
};
const WABA_ANSWER = {
  body: {
    id: WABA,
    business_verification_status: "not_verified",
    whatsapp_business_manager_messaging_limit: "TIER_250",
  },
};
/** What the keeping door is handed for the number above. */
const BLOCKED = {
  can_send: "BLOCKED",
  problems: [
    {
      entity: "WABA",
      code: 141006,
      said: "A payment method is required to send messages",
      fix: "Add a payment method in WhatsApp Manager",
    },
  ],
  notes: [],
  name: "Harbor Moving",
  name_status: "APPROVED",
  verification: "not_verified",
  limit: "TIER_250",
  has_payment_method: false,
  owner_business_id: BUSINESS,
  waba_id: WABA,
};

/* ------------------------------ the reading ------------------------------ */

test("the reading asks Meta four times, the phone's health and three things of the account, with the workspace's own token, and answers what Meta said as a standing", async () => {
  requests.length = 0;
  script = asks(
    {
      body: {
        id: PHONE,
        verified_name: "Harbor Moving",
        name_status: "PENDING_REVIEW",
        health_status: {
          can_send_message: "LIMITED",
          entities: [
            {
              entity_type: "PHONE_NUMBER",
              id: PHONE,
              can_send_message: "LIMITED",
              additional_info: ["Your display name has not been approved yet."],
            },
            { entity_type: "WABA", id: WABA, can_send_message: "AVAILABLE" },
            {
              entity_type: "BUSINESS",
              id: "5",
              can_send_message: "LIMITED",
              errors: [
                {
                  error_code: 141006,
                  error_description: "  A payment method is required to send messages  ",
                  possible_solution: "Add a payment method in WhatsApp Manager",
                },
                { error_code: "n/a", error_description: "No solution said" },
                { error_description: "" },
                null,
              ],
              additional_info: ["Your display name has not been approved yet.", 7],
            },
          ],
        },
      },
    },
    WABA_ANSWER,
    FUNDED,
  );
  const got = await numberStanding(TOKEN, PHONE, WABA);
  assert.deepEqual(got, {
    ok: true,
    data: {
      can_send: "LIMITED",
      problems: [
        {
          entity: "BUSINESS",
          code: 141006,
          said: "A payment method is required to send messages",
          fix: "Add a payment method in WhatsApp Manager",
        },
        { entity: "BUSINESS", code: null, said: "No solution said", fix: null },
      ],
      notes: ["Your display name has not been approved yet."],
      name: "Harbor Moving",
      name_status: "PENDING_REVIEW",
      verification: "not_verified",
      limit: "TIER_250",
      has_payment_method: true,
      owner_business_id: BUSINESS,
      waba_id: WABA,
    },
  });
  assert.deepEqual(
    graphCalls().map((r) => [r.init.method ?? "GET", r.url.replace(GRAPH, ""), r.init.headers.authorization]),
    [
      ["GET", `/${PHONE}?fields=health_status,name_status,verified_name`, `Bearer ${TOKEN}`],
      [
        "GET",
        `/${WABA}?fields=business_verification_status,whatsapp_business_manager_messaging_limit`,
        `Bearer ${TOKEN}`,
      ],
      ["GET", `/${WABA}?fields=primary_funding_id`, `Bearer ${TOKEN}`],
      ["GET", `/${WABA}?fields=owner_business_info{id}`, `Bearer ${TOKEN}`],
    ],
    "four reads, each with the business's own token, the account's three asked apart so that one Meta refuses costs only itself",
  );
});

test("a word of Meta's is kept as it said it, upper-cased where it is a status; text and lists are cut; the answer's own shape decides what is kept", async () => {
  script = asks(
    {
      body: {
        health_status: {
          can_send_message: "restricted",
          entities: Array.from({ length: 12 }, (_, i) => ({
            entity_type: "APP",
            id: String(i),
            errors: [{ error_code: 100 + i, error_description: `${i} ${"x".repeat(400)}` }],
          })),
        },
        name_status: "AVAILABLE_WITHOUT_REVIEW",
      },
    },
    {
      body: {
        business_verification_status: "pending_need_more_info",
        whatsapp_business_manager_messaging_limit: "UNTIERED",
      },
    },
  );
  const { ok, data } = await numberStanding(TOKEN, PHONE, WABA);
  assert.equal(ok, true);
  assert.deepEqual(
    [data.can_send, data.name, data.name_status, data.verification, data.limit],
    ["RESTRICTED", null, "AVAILABLE_WITHOUT_REVIEW", "pending_need_more_info", "UNTIERED"],
  );
  assert.equal(data.problems.length, 10, "ten at most");
  assert.ok(
    data.problems.every((p) => p.said.length === 300),
    "and each cut at three hundred characters",
  );
});

test("each read of the account is asked apart, so one Meta refuses costs only what it held; a payment method that cannot be read is unknown and never missing; a number with no account on file asks only the phone", async () => {
  const refused = { status: 403, body: { error: { message: "(#200) Requires business_management", code: 200 } } };
  const nofield = {
    status: 400,
    body: {
      error: {
        message:
          "(#100) Tried accessing nonexisting field (owner_business_info) on node type (WhatsAppBusinessAccount)",
        code: 100,
      },
    },
  };
  const read = async (...answers) => {
    script = asks(BLOCKED_PHONE, ...answers);
    const got = await numberStanding(TOKEN, PHONE, WABA);
    assert.equal(got.ok, true, "the phone's answer is a standing whatever the account says");
    const d = got.data;
    return [d.verification, d.limit, d.has_payment_method, d.owner_business_id, d.waba_id];
  };
  assert.deepEqual(await read(WABA_ANSWER, FUNDED, OWNED), ["not_verified", "TIER_250", true, BUSINESS, WABA]);
  assert.deepEqual(
    await read(refused, FUNDED, OWNED),
    [null, null, true, BUSINESS, WABA],
    "no verification, no tier: the rest read",
  );
  assert.deepEqual(
    await read(WABA_ANSWER, refused, OWNED),
    ["not_verified", "TIER_250", null, BUSINESS, WABA],
    "unknown, never missing",
  );
  assert.deepEqual(
    await read(WABA_ANSWER, FUNDED, nofield),
    ["not_verified", "TIER_250", true, null, WABA],
    "no owner: the funding is still read",
  );
  assert.deepEqual(
    await read(refused, refused, refused),
    [null, null, null, null, WABA],
    "the account refuses every read: the phone still stands",
  );
  // An answered read with no funding id is a missing payment method; a funding id, as text or as a number, is one on file.
  assert.deepEqual((await read(WABA_ANSWER, UNFUNDED, OWNED))[2], false);
  assert.deepEqual((await read(WABA_ANSWER, { body: { id: WABA, primary_funding_id: null } }, OWNED))[2], false);
  assert.deepEqual((await read(WABA_ANSWER, { body: { id: WABA, primary_funding_id: "  " } }, OWNED))[2], false);
  assert.deepEqual((await read(WABA_ANSWER, { body: { id: WABA, primary_funding_id: 100200300 } }, OWNED))[2], true);
  // No account on file: nothing of the account is asked, and nothing of it is said.
  requests.length = 0;
  const alone = await numberStanding(TOKEN, PHONE, null);
  assert.equal(alone.ok, true);
  assert.equal(graphCalls().length, 1, "one read: there is no account to ask about");
  assert.deepEqual(
    [
      alone.data.verification,
      alone.data.limit,
      alone.data.has_payment_method,
      alone.data.owner_business_id,
      alone.data.waba_id,
    ],
    [null, null, null, null, null],
  );
});

test("a phone Meta will not answer, or answers with nothing about what it may do, is a read that failed: no standing is ever guessed", async () => {
  script = asks({ status: 400, body: { error: { message: "Unsupported get request.", code: 100 } } }, WABA_ANSWER);
  assert.deepEqual(await numberStanding(TOKEN, PHONE, WABA), {
    ok: false,
    error: "Unsupported get request.",
    code: 100,
    status: 400,
  });
  for (const body of [
    { id: PHONE },
    { health_status: {} },
    { health_status: { can_send_message: "" } },
    { health_status: "AVAILABLE" },
  ]) {
    script = asks({ body }, WABA_ANSWER);
    const got = await numberStanding(TOKEN, PHONE, WABA);
    assert.deepEqual([got.ok, got.status, got.code], [false, 200, null], JSON.stringify(body));
  }
  script = asks("throws", WABA_ANSWER);
  assert.equal(
    (await numberStanding(TOKEN, PHONE, WABA)).ok,
    false,
    "a dead network is a failed read, not an exception",
  );
});

/* --------------------------- the keeping and the telling --------------------------- */

/** The log, kept: [level, event, fields]. */
function lines() {
  const said = [];
  const say = (level) => (event, fields) => said.push([level, event, fields]);
  return { said, log: { info: say("info"), warn: say("warn"), error: say("error") } };
}
/** The workspace's world: its owner's mailbox, a bell, and a keeping door that answers from `answers` in turn (or throws what it is handed). */
function world(...answers) {
  const kept = [];
  const tables = {
    notifications: [],
    tenant_config: [{ tenant_id: A, config: { notifications: { escalation_emails: [OWNER] } } }],
  };
  const db = fakeDb(
    tables,
    {},
    {
      channel_keep_standing: (args) => {
        kept.push(args);
        const next = answers.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
  );
  return { tables, db, kept };
}

test("a number that turns BLOCKED is told to the owner, once: the bell row and the owner's mail say which number, Meta's problem and Meta's fix", async () => {
  requests.length = 0;
  script = asks(BLOCKED_PHONE, WABA_ANSWER);
  const w = world("first", "same", "changed");
  const { said, log } = lines();
  const ports = { db: w.db, log };
  assert.deepEqual(await readAndKeepStanding(ports, TOKEN, NUMBER), {
    outcome: "first",
    standing: BLOCKED,
    told: true,
  });
  assert.deepEqual(
    w.kept,
    [{ p_tenant_id: A, p_channel_id: "ch-1", p_standing: BLOCKED }],
    "kept whole, for this workspace's channel",
  );
  const body =
    "WhatsApp can't send from +1 (305) 555-0142: A payment method is required to send messages. Add a payment method in WhatsApp Manager.";
  assert.deepEqual(
    w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title, n.body]),
    [[A, "number", "admin/integrations", "WhatsApp can't send from your number", body]],
    "the workspace's bell, on the path the restricted-account alert uses",
  );
  const mail = mailSent();
  assert.deepEqual([mail.length, mail[0].to, mail[0].subject], [1, [OWNER], "WhatsApp can't send from your number"]);
  assert.ok(mail[0].text.includes(body), mail[0].text);
  assert.deepEqual(
    said.map(([level, event]) => [level, event]),
    [["info", "wa_standing_told"]],
  );

  // Still BLOCKED at the next read: nothing is said again.
  assert.deepEqual(await readAndKeepStanding(ports, TOKEN, NUMBER), {
    outcome: "same",
    standing: BLOCKED,
    told: false,
  });
  assert.equal(w.tables.notifications.length + mailSent().length, 2, "no second row, no second mail");
  // Turned BLOCKED from another word: told.
  assert.equal((await readAndKeepStanding(ports, TOKEN, NUMBER)).told, true);
  assert.equal(w.tables.notifications.length, 2);
});

test("a number that is not BLOCKED is told to nobody: first read AVAILABLE, turned LIMITED, gone from the workspace", async () => {
  for (const [word, kept] of [
    ["AVAILABLE", "first"],
    ["LIMITED", "changed"],
    ["BLOCKED", "gone"],
  ]) {
    requests.length = 0;
    script = asks({ body: { health_status: { can_send_message: word, entities: [] } } }, WABA_ANSWER);
    const w = world(kept);
    const read = await readAndKeepStanding({ db: w.db, log: lines().log }, TOKEN, NUMBER);
    assert.deepEqual([read.outcome, read.told], [kept, false], `${word} ${kept}`);
    assert.deepEqual([w.tables.notifications.length, mailSent().length], [0, 0], `${word} ${kept}`);
  }
});

test("every way the work can fail is an outcome and a line, never a throw: Meta refuses, the database refuses, the owner cannot be told", async () => {
  // Meta refuses: nothing is kept, the line names the channel and what Meta said by its numbers, never its words.
  requests.length = 0;
  script = asks(
    { status: 400, body: { error: { message: "Object with ID '106540000000001' does not exist", code: 100 } } },
    WABA_ANSWER,
  );
  let w = world("first");
  let said = lines();
  assert.deepEqual(await readAndKeepStanding({ db: w.db, log: said.log }, TOKEN, NUMBER), {
    outcome: "unreadable",
    standing: null,
    told: false,
  });
  assert.deepEqual(w.kept, [], "nothing asked of the database");
  assert.deepEqual(said.said, [
    ["warn", "wa_standing_read_failed", { tenant_id: A, channel_id: "ch-1", status: 400, code: 100 }],
  ]);
  // The database refuses the keeping.
  script = asks(BLOCKED_PHONE, WABA_ANSWER);
  w = world(new Error("the database refused"));
  said = lines();
  assert.deepEqual(await readAndKeepStanding({ db: w.db, log: said.log }, TOKEN, NUMBER), {
    outcome: "unreadable",
    standing: null,
    told: false,
  });
  assert.deepEqual(
    said.said.map(([level, event]) => [level, event]),
    [["error", "wa_standing_keep_failed"]],
  );
  assert.equal(w.tables.notifications.length, 0, "a standing that was not kept is not told");
  // The owner cannot be told: the standing is kept all the same, and the outcome says so.
  w = world("first");
  said = lines();
  const read = await readAndKeepStanding(
    {
      db: w.db,
      log: said.log,
      tell: async () => {
        throw new Error("the mail provider is down");
      },
    },
    TOKEN,
    NUMBER,
  );
  assert.deepEqual([read.outcome, read.told], ["first", false]);
  assert.deepEqual(
    said.said.map(([level, event]) => [level, event]),
    [["error", "wa_standing_tell_failed"]],
  );
  // A line carries the workspace and the channel, never the token, a number or Meta's own words.
  const text = JSON.stringify(said.said);
  assert.doesNotMatch(text, /EAAB|Bearer|10654000000000|3055550142|payment/);
});
