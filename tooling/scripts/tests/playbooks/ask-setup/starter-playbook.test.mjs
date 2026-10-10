/**
 * POST playbooks named by a starter's key and no message (the moment spec's A0, D23: Ask's first-day card, one press),
 * run through route() with the database in memory and the edge stubbed with the provider guard open, so a submission to
 * Meta is a call this file counts and nothing leaves the machine. The playbook is judged whole before anything is filed:
 * its moment, list and class, the starter the moment's own and with no words of its own, its numbers, its channels' purpose,
 * and a channel its message holds AT ONCE (an email or text version filed with it, or a WhatsApp version WhatsApp already
 * approved), since a WhatsApp version sent for review cannot carry a campaign until Meta approves it and cannot be taken
 * back. A card that names no channels goes by those, and on WhatsApp where there is a number, its people there held until
 * Meta approves. A refused card files nothing and asks nothing of Meta. Its slots are the starter's own sources.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import {
  FOLLOW_UP_ONE,
  LIBRARY_STARTER_WORDS,
  LIBRARY_WORDS,
  appointmentWordOf,
  channelNeverCarries,
  channelsWords,
  defaultParamSpecs,
  startersForTrigger,
  starterText,
  winBackWords,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The provider guard is read once, as its module loads: open it before the routes are imported, onto a stubbed edge.
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
delete process.env.DIAG_KEY;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const playbooks = await import(at("apps/dashboard/app/api/v1/playbooks/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T1 = "77777777-7777-4777-8777-777777777771";
const USER = "u1";
const inB = `?workspace=${B}`;
const WIN_BACK = startersForTrigger("quiet_30").find((s) => !s.retired);
const REMINDER = startersForTrigger("visit_tomorrow").find((s) => !s.retired);
const OFFER = startersForTrigger("everyone_monthly").find((s) => !s.retired);
const FOLLOW_UP = startersForTrigger("proposal_waiting").find((s) => !s.retired);

/** A template row as the table holds it. */
const tpl = (id, over = {}) => ({
  id,
  tenant_id: B,
  channel: "whatsapp",
  name: "winback_offer",
  language: "en_US",
  body_preview: "Hi {{1}}",
  variables: [],
  category: "marketing",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "chanlytics",
  hidden_at: null,
  title: null,
  ...over,
});
/** A starter's own WhatsApp row, as its submission writes it: its real variables, so its message has its real slots. */
const starterRow = (id, s, over = {}) =>
  tpl(id, {
    name: s.name,
    category: s.category,
    body_preview: starterText(s, "en_US").body,
    variables: starterText(s, "en_US").slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
    ...over,
  });

/**
 * The edge's template submission, stubbed: Meta takes it for review, and the edge writes the row as it does
 * (apps/edge/lib/whatsapp/template-admin.ts: its values numbered from the body, each with its label and example, pending,
 * the Chanlytics row). Every call is counted; any other address is no address this file may reach.
 */
function stubMeta(tables) {
  const calls = [];
  const real = globalThis.fetch;
  let next = 800;
  globalThis.fetch = async (url, init) => {
    const where = String(url);
    calls.push(where);
    if (!where.endsWith("/api/admin/whatsapp/templates-create")) throw new Error(`nothing else is reachable: ${where}`);
    const b = JSON.parse(String(init?.body ?? "{}"));
    const positions = [...new Set([...b.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort(
      (x, y) => x - y,
    );
    const row = tpl(`77777777-7777-4777-8777-${String(next++).padStart(12, "0")}`, {
      tenant_id: b.tenant_id,
      name: b.name,
      language: b.language,
      category: String(b.category).toLowerCase(),
      body_preview: b.body,
      meta_status: "pending",
      variables: positions.map((n) => ({
        position: n,
        label: b.labels?.[n - 1] ?? `Value ${n}`,
        example: b.examples?.[n - 1] ?? null,
      })),
      created_by: b.user_id,
    });
    tables.templates.push(row);
    return new Response(JSON.stringify({ ok: true, id: row.id, meta_id: "meta-1", meta_status: "pending" }), {
      status: 200,
    });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}

/** The doors this file makes refuse, by name: a database that could not write a starter's version just then. */
let failing = new Set();
const refusesNow = (door) => {
  if (failing.has(door)) throw Object.assign(new Error("could not write the version just now"), { code: "XX000" });
};

/**
 * The doors a new playbook and a starter's versions go through, over the same tables (their SQL is proved on Postgres).
 * start_playbook holds the database's one-follow-up index (00167 playbooks_one_follow_up) as Postgres does.
 */
function doors(tables) {
  let next = 900;
  const version = (a, over) => {
    const row = tpl(`77777777-7777-4777-8777-${String(next++).padStart(12, "0")}`, {
      tenant_id: a.p_tenant_id,
      channel: a.p_channel,
      name: a.p_name,
      language: a.p_language,
      body_preview: a.p_body,
      ...over,
    });
    tables.templates.push(row);
    return { id: row.id, channel: row.channel, name: row.name, language: row.language };
  };
  return {
    session: {
      // A version beside the message's rows: its category and values are the message's.
      save_template_version: (a) => {
        refusesNow("save_template_version");
        const source = tables.templates.find((t) => t.tenant_id === a.p_tenant_id && t.name === a.p_name);
        if (!source) throw Object.assign(new Error("Message not found."), { code: "P0002" });
        return version(a, { category: source.category, variables: source.variables });
      },
      start_playbook: (a) => {
        if (
          a.p_playbook.trigger === "proposal_waiting" &&
          tables.playbooks.some((p) => p.tenant_id === a.p_tenant_id && p.trigger === "proposal_waiting")
        )
          throw Object.assign(new Error('duplicate key value violates unique constraint "playbooks_one_follow_up"'), {
            code: "23505",
          });
        const row = {
          id: crypto.randomUUID(),
          tenant_id: a.p_tenant_id,
          ...a.p_playbook,
          state: "running",
          kind: "moment",
          created_by: USER,
        };
        tables.playbooks.push(row);
        const decision = {
          id: `decision-${tables.decisions.length + 1}`,
          tenant_id: a.p_tenant_id,
          subject_type: "playbook",
          subject_id: row.id,
          verb: "start_playbook",
          actor_user_id: USER,
          payload: a.p_decision ?? {},
        };
        tables.decisions.push(decision);
        return { id: row.id, decision_id: decision.id, undo_dropped: false };
      },
    },
    // The first version of a message with no row: the service role's door, as the member it acts for.
    service: {
      create_message_version: (a) => {
        refusesNow("create_message_version");
        return version(a, { category: a.p_category, variables: a.p_variables });
      },
    },
  };
}

const world = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "viewer", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    { user_id: USER, tenant_id: B, role: "operator", tenants: { slug: "bayside" }, created_at: "2026-02-01T00:00:00Z" },
  ],
  tenants: [{ id: B, name: "Bayside", timezone: "America/Chicago" }],
  tenant_channels: [
    {
      id: "ch-wa",
      tenant_id: B,
      kind: "whatsapp",
      status: "active",
      config: { quality_rating: "GREEN" },
      number_e164: "+15550100",
    },
  ],
  templates: [],
  playbooks: [],
  decisions: [],
  events: [],
  broadcasts: [],
  broadcast_recipients: [],
  ...over,
});

let meta;
let tables;
beforeEach(() => setRateStore(memoryStore()));
afterEach(() => {
  meta?.restore();
  setServiceClient(null);
});
/** The world, its doors, and Meta stubbed: what `post` sends a body into. */
function open(over) {
  failing = new Set();
  tables = world(over);
  const d = doors(tables);
  setServiceClient(fakeDb(tables, {}, d.service));
  meta = stubMeta(tables);
  const ctx = { supabase: fakeDb(tables, {}, d.session), userId: USER, email: "ada@example.com", params: {} };
  return (body) =>
    playbooks.POST.run(
      new Request(`http://localhost/api/v1/x${inB}`, { method: "POST", body: JSON.stringify(body) }),
      ctx,
    );
}
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("POST playbooks has a minute, as the starter route does: a starter's submission is a round trip to Meta", () => {
  assert.equal(playbooks.maxDuration, 60);
});

test("a starter on file whose WhatsApp version WhatsApp approved: the campaign goes by it on the channel named, its slots the starter's own, and nothing is asked of Meta", async () => {
  const post = open({ templates: [starterRow(T1, WIN_BACK)] });
  const made = await post({ trigger: "quiet_30", starter_key: WIN_BACK.key, channels: ["whatsapp"] });
  assert.equal(made.state, "running");
  assert.deepEqual(made.starter, { key: WIN_BACK.key, status: "exists", meta_status: "approved" });
  const row = tables.playbooks.find((p) => p.id === made.id);
  assert.deepEqual([row.trigger, row.template_id, row.channels], ["quiet_30", T1, ["whatsapp"]]);
  assert.deepEqual(row.params, defaultParamSpecs({ name: WIN_BACK.name, variables: [] }), "the starter's own slots");
  assert.equal(row.params.length, starterText(WIN_BACK, "en_US").slots.length);
  assert.deepEqual(meta.calls, [], "on file: nothing asked of Meta");
  assert.equal(tables.templates.length, 1, "nothing else filed: the campaign named WhatsApp alone");
  // A body with its own message is the body as it came: the key is never read, and no starter is said.
  const own = await post({ trigger: "quiet_30", template_id: T1, starter_key: "nope", params: row.params });
  assert.equal("starter" in own, false);
});

test("a starter not on file and no channel named: its email version is written at once and its WhatsApp version goes to Meta for review; the campaign goes by both, its WhatsApp people held until Meta approves", async () => {
  const post = open();
  const made = await post({ trigger: "quiet_30", starter_key: WIN_BACK.key });
  assert.deepEqual(made.starter, { key: WIN_BACK.key, status: "submitted", meta_status: "pending" });
  assert.equal(meta.calls.length, 1, "one submission");
  const filed = (channel) => tables.templates.find((t) => t.name === WIN_BACK.name && t.channel === channel);
  assert.equal(filed("whatsapp")?.meta_status, "pending");
  assert.ok(filed("email"), "the email version, written at once beside it");
  const row = tables.playbooks.find((p) => p.id === made.id);
  assert.equal(row.template_id, filed("whatsapp").id, "the message's anchor: its WhatsApp row");
  assert.deepEqual(row.channels, ["whatsapp", "email"], "WhatsApp waits for Meta; email carries it at once");
  assert.deepEqual(row.params, defaultParamSpecs({ name: WIN_BACK.name, variables: [] }));
});

test("a starter not on file where there is no number: no channel named is email alone, its version written at once, and nothing reaches Meta", async () => {
  const post = open({ tenant_channels: [] });
  const made = await post({ trigger: "quiet_30", starter_key: WIN_BACK.key });
  assert.equal(made.starter.status, "skipped");
  assert.deepEqual(meta.calls, []);
  assert.deepEqual(
    tables.templates.map((t) => [t.name, t.channel]),
    [[WIN_BACK.name, "email"]],
  );
  assert.deepEqual(tables.playbooks.find((p) => p.id === made.id).channels, ["email"]);
});

test("WhatsApp named alone with no version WhatsApp approved is refused before anything is filed, in words that say what would carry it; nothing reaches Meta", async () => {
  const words = LIBRARY_STARTER_WORDS.waitsForWhatsApp(
    WIN_BACK.title,
    channelsWords(["whatsapp"]),
    channelsWords(["email"]),
  );
  // The starter not on file: its WhatsApp version would go to Meta and carry nothing until approved.
  const post = open();
  await refused(
    post({ trigger: "quiet_30", starter_key: WIN_BACK.key, channels: ["whatsapp"] }),
    "validation",
    400,
    words,
  );
  assert.deepEqual([tables.templates, tables.playbooks, tables.decisions, meta.calls], [[], [], [], []]);
  // On file and still in review: the same.
  const inReview = starterRow(T1, WIN_BACK, { meta_status: "pending" });
  const again = open({ templates: [inReview] });
  await refused(
    again({ trigger: "quiet_30", starter_key: WIN_BACK.key, channels: ["whatsapp"] }),
    "validation",
    400,
    words,
  );
  assert.deepEqual([tables.templates, tables.playbooks, meta.calls], [[inReview], [], []]);
  // Named with email, it is a campaign: email carries it at once.
  const both = open();
  const made = await both({ trigger: "quiet_30", starter_key: WIN_BACK.key, channels: ["whatsapp", "email"] });
  assert.deepEqual(tables.playbooks.find((p) => p.id === made.id).channels, ["whatsapp", "email"]);
  assert.equal(meta.calls.length, 1);
});

test("a starter card the route would refuse files nothing: a number out of bounds, a moment not offered here, a starter not this moment's, a key the set does not have, a starter that takes words of its own, a channel its purpose never carries; each in the product's words, and nothing reaches Meta", async () => {
  const post = open();
  await refused(
    post({ trigger: "quiet_30", starter_key: WIN_BACK.key, run_hour: 7 }),
    "validation",
    400,
    "The hour must be a whole number from 9 to 20.",
  );
  // The win-back by appointments needs a calendar, and this workspace has none.
  const word = appointmentWordOf({ stored: null, sellsBy: null });
  await refused(post({ trigger: "lapsed", starter_key: WIN_BACK.key }), "validation", 400, winBackWords(word).lapsed);
  await refused(
    post({ trigger: "quiet_30", starter_key: REMINDER.key }),
    "validation",
    400,
    LIBRARY_STARTER_WORDS.notThisMoment("Win-back"),
  );
  await refused(post({ trigger: "quiet_30", starter_key: "nope" }), "validation", 400, "That starter is not");
  await refused(
    post({ trigger: "everyone_monthly", starter_key: OFFER.key }),
    "validation",
    400,
    LIBRARY_STARTER_WORDS.takesOwnWords(OFFER.title),
  );
  await refused(
    post({ trigger: "quiet_30", starter_key: WIN_BACK.key, channels: ["whatsapp", "sms"] }),
    "validation",
    400,
    channelNeverCarries("sms", "marketing"),
  );
  assert.deepEqual(
    [tables.templates, tables.playbooks, tables.decisions],
    [[], [], []],
    "nothing filed, nothing started",
  );
  assert.deepEqual(meta.calls, [], "nothing reached Meta");
});

test("a second proposal follow-up is refused before anything is filed, in the words the database's one-follow-up index is said in: nothing reaches Meta", async () => {
  const one = {
    id: "88888888-8888-4888-8888-888888888881",
    tenant_id: B,
    kind: "moment",
    name: "Proposal follow-up",
    trigger: "proposal_waiting",
    state: "running",
  };
  const post = open({
    tenants: [{ id: B, name: "Bayside", timezone: "America/Chicago", sells_by: "proposal" }],
    playbooks: [one],
  });
  await refused(post({ trigger: "proposal_waiting", starter_key: FOLLOW_UP.key }), "conflict", 409, FOLLOW_UP_ONE);
  assert.deepEqual(
    [tables.templates, tables.playbooks, tables.decisions],
    [[], [one], []],
    "nothing filed, nothing started",
  );
  assert.deepEqual(meta.calls, [], "nothing reached Meta");
});

test("a starter whose WhatsApp version Meta took and whose other versions could not be filed starts nothing, and says its WhatsApp version is in the Library for review; the next press sends nothing to Meta again", async () => {
  const post = open();
  failing.add("save_template_version");
  await refused(
    post({ trigger: "quiet_30", starter_key: WIN_BACK.key }),
    "conflict",
    409,
    LIBRARY_STARTER_WORDS.notAddedSentForReview,
  );
  assert.equal(meta.calls.length, 1, "Meta took the WhatsApp version");
  assert.deepEqual(
    tables.templates.map((t) => [t.name, t.channel, t.meta_status]),
    [[WIN_BACK.name, "whatsapp", "pending"]],
    "in the Library, in review",
  );
  assert.deepEqual(tables.playbooks, [], "nothing started");
  // Pressed again once the version can be written: the WhatsApp version is on file, so Meta is not asked twice.
  failing.clear();
  const made = await post({ trigger: "quiet_30", starter_key: WIN_BACK.key });
  assert.equal(made.starter.status, "exists");
  assert.equal(meta.calls.length, 1, "no second submission");
  assert.deepEqual(tables.playbooks.find((p) => p.id === made.id).channels, ["whatsapp", "email"]);
  // A starter whose WhatsApp version was never sent says the first words: nothing is in review.
  const quiet = open({ tenant_channels: [] });
  failing.add("create_message_version");
  await refused(
    quiet({ trigger: "quiet_30", starter_key: WIN_BACK.key }),
    "conflict",
    409,
    LIBRARY_STARTER_WORDS.notAdded,
  );
});

test("WhatsApp named alone where there is no number is refused in the words that say a number is needed, never that WhatsApp's approval is to come; nothing is filed", async () => {
  const post = open({ tenant_channels: [] });
  await refused(
    post({ trigger: "quiet_30", starter_key: WIN_BACK.key, channels: ["whatsapp"] }),
    "validation",
    400,
    LIBRARY_WORDS.writeNeedsNumber,
  );
  assert.deepEqual([tables.templates, tables.playbooks, meta.calls], [[], [], []]);
});

test("no channel named: a WhatsApp version on file that WhatsApp refused, paused or disabled will never send, so the campaign goes by what holds it and not by WhatsApp", async () => {
  for (const meta_status of ["rejected", "paused", "disabled"]) {
    const post = open({ templates: [starterRow(T1, WIN_BACK, { meta_status })] });
    const made = await post({ trigger: "quiet_30", starter_key: WIN_BACK.key });
    assert.deepEqual(tables.playbooks.find((p) => p.id === made.id).channels, ["email"], meta_status);
    assert.deepEqual(meta.calls, [], `${meta_status}: nothing asked of Meta`);
  }
  // One in review still goes by WhatsApp, its people held until WhatsApp approves it.
  const post = open({ templates: [starterRow(T1, WIN_BACK, { meta_status: "pending" })] });
  const made = await post({ trigger: "quiet_30", starter_key: WIN_BACK.key });
  assert.deepEqual(tables.playbooks.find((p) => p.id === made.id).channels, ["whatsapp", "email"]);
});
