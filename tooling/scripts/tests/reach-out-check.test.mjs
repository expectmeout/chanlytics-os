/**
 * The check before each send (apps/edge/lib/reach-out/check.ts, Reach out Part 4), run over a model that answers from a
 * script and a database in memory:
 *
 *   one send     words with no opening cost nothing; an opening written, read by code and by the reader; one rewrite
 *                told why, then held; the code holds first; a hold its owner included it past is never made again
 *                (R7); a model that throws, times out, says nothing or says it in no shape fails the try; the budget
 *                asked before every call (R1).
 *   the tick     what passes is checked against its words (checked_words, R5) and its lease ends; a failed try backs
 *                off 1, 2, 4, 8, 15 minutes, and an hour of them holds it check_unavailable (R4); a check never writes
 *                onto words that changed under it (R3, R5); a workspace that may not spend, has no room this month or
 *                checked its day's share is handed back an hour on before any call (R2, R12); a tick past its budget
 *                hands its sends back untouched; a check_unavailable hold is put back an hour on (R4).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, fakeLog } from "./_fake-db.mjs";
import { at } from "./_cron-doors-world.mjs";

const {
  checkOne,
  checkSends,
  checkBudget,
  backoffMs,
  hoursLine,
  CHECK_CALLS_UNTIL_MS,
  CHECK_CALL_MS,
  CHECK_GIVE_UP_MS,
} = await import(at("apps/edge/lib/reach-out/check.ts"));
const { checkedWordsOf } = await import(at("apps/edge/lib/reach-out/request.ts"));
const { REACH_OUT_CHECKS_PER_DAY } = await import("@chanlytics/contracts");

const MIN = 60_000;
const DAY = 86_400_000;

/* ------------------------------------------------------------------ one send -- */

const RECORD = {
  business_name: "Austin Movers",
  category: "Moving company",
  city: "Austin",
  region: "TX",
  rating: 4.9,
  reviews: 16,
  website: "austinmovers.example",
  hours: "Mon 8–6",
  about: "Family-run since 2009.",
  why_it_fits: "Independent mover",
  what_you_asked: "independent movers",
};
const input = (over = {}) => ({
  record: RECORD,
  workspace: { name: "Harbor Moving Co", what_we_do: null, tone: null },
  words: { subject: "Quick one", body: "{{opening}}\n\nI run Harbor." },
  language: "en",
  needsOpening: true,
  chain: null,
  customerDomain: null,
  included: [],
  ...over,
});
/** A budget that never runs out. */
const open = { late: () => false, signal: () => new AbortController().signal };
/** A model that answers each call with the next scripted answer, and remembers what it was asked. */
function scripted(...answers) {
  const asked = [];
  const ask = async (system, user, schema, maxTokens, signal) => {
    asked.push({ system, user, schema, maxTokens, signal });
    const a = answers.shift();
    if (a instanceof Error) throw a;
    return a === undefined ? null : { answer: a, tokens: { input: 100, output: 20 } };
  };
  return { ask, asked };
}
const WROTE = (opening, over = {}) => ({ opening, angle: "their reviews", facts_used: ["rating"], ...over });
const READ = (over = {}) => ({ backed: true, unbacked: "", pitch: false, language: "en", ...over });

test("words that name no opening are checked by code alone, and cost no call", async () => {
  const m = scripted();
  const out = await checkOne(input({ needsOpening: false }), m.ask, open);
  assert.deepEqual([out.kind, out.hold, out.opening, out.calls, m.asked.length], ["checked", null, null, 0, 0]);
});

test("an opening written, read by code and by the reader, and sendable", async () => {
  const m = scripted(WROTE("A 4.9 from 16 reviews says people find you."), READ());
  const out = await checkOne(input(), m.ask, open);
  assert.deepEqual(
    [out.kind, out.hold, out.opening.opening, out.rewritten, out.calls],
    ["checked", null, "A 4.9 from 16 reviews says people find you.", false, 2],
  );
  assert.deepEqual(out.tokens, { input: 200, output: 40 });
  assert.match(m.asked[0].system, /You write the first sentence/);
  assert.match(m.asked[1].user, /The sentence: A 4\.9 from 16 reviews/);
  assert.ok(
    m.asked.every((a) => a.signal instanceof AbortSignal),
    "every call has its deadline",
  );
});

test("a claim the record does not hold is written again once, told why; then held with what it said", async () => {
  const again = scripted(
    WROTE("Loved by locals."),
    READ({ backed: false, unbacked: "Loved by locals" }),
    WROTE("A 4.9 from 16 reviews."),
    READ(),
  );
  const fixed = await checkOne(input(), again.ask, open);
  assert.deepEqual([fixed.hold, fixed.rewritten, fixed.calls], [null, true, 4]);
  assert.match(again.asked[2].user, /It could not be sent: it said “Loved by locals”, which the record does not hold/);
  const twice = scripted(
    WROTE("Loved by locals."),
    READ({ backed: false, unbacked: "Loved by locals" }),
    WROTE("Loved by all."),
    READ({ backed: false, unbacked: "Loved by all" }),
  );
  const held = await checkOne(input(), twice.ask, open);
  assert.deepEqual([held.hold, held.detail, held.opening.opening], ["unbacked_fact", "Loved by all", "Loved by all."]);
  assert.equal(twice.asked.length, 4, "one rewrite, never a second");
});

test("a number code cannot find in the record is held as unbacked; a link reads like a pitch, with the rule it broke", async () => {
  const n = scripted(WROTE("A 4.8 on Google."), READ(), WROTE("A 4.8 again."), READ());
  assert.equal((await checkOne(input(), n.ask, open)).hold, "unbacked_fact");
  const link = scripted(WROTE("See harbor.example today."), READ(), WROTE("See harbor.example now."), READ());
  const out = await checkOne(input(), link.ask, open);
  assert.deepEqual([out.hold, out.detail], ["reads_like_spam", "link"]);
  const pitch = scripted(
    WROTE("Movers love us."),
    READ({ pitch: true }),
    WROTE("Movers love it."),
    READ({ pitch: true }),
  );
  assert.deepEqual((await checkOne(input(), pitch.ask, open)).hold, "reads_like_spam");
});

test("another language holds with no rewrite; the code holds come first, the opening still written for an Include", async () => {
  const es = scripted(WROTE("Una frase."), READ({ language: "es" }));
  const l = await checkOne(input(), es.ask, open);
  assert.deepEqual([l.hold, l.detail, es.asked.length], ["language", "es", 2]);
  const mine = scripted(WROTE("A 4.9 from 16 reviews."), READ());
  const c = await checkOne(
    input({ customerDomain: "austinmovers.example", chain: { by: "site", listings: 3 } }),
    mine.ask,
    open,
  );
  assert.deepEqual(
    [c.hold, c.detail, c.opening.opening],
    ["customer_domain", "austinmovers.example", "A 4.9 from 16 reviews."],
  );
  const chain = await checkOne(
    input({ chain: { by: "name", listings: 4 }, needsOpening: false }),
    scripted().ask,
    open,
  );
  assert.deepEqual([chain.hold, chain.detail], ["chain", "name:4"]);
});

test("a code hold that wins over a refused opening keeps no opening: an Include past it is checked again", async () => {
  const unbacked = scripted(
    WROTE("Loved by locals."),
    READ({ backed: false, unbacked: "Loved by locals" }),
    WROTE("Loved by all."),
    READ({ backed: false, unbacked: "Loved by all" }),
  );
  const held = await checkOne(input({ chain: { by: "site", listings: 3 } }), unbacked.ask, open);
  assert.deepEqual([held.hold, held.detail, held.opening], ["chain", "site:3", null]);
  // The same business, its opening read as sound: kept, so an Include sends it as it reads.
  const sound = await checkOne(
    input({ chain: { by: "site", listings: 3 } }),
    scripted(WROTE("A 4.9."), READ()).ask,
    open,
  );
  assert.deepEqual([sound.hold, sound.opening.opening], ["chain", "A 4.9."]);
});

test("a hold its owner included the send past is never made again (R7)", async () => {
  const both = { customerDomain: "austinmovers.example", chain: { by: "site", listings: 3 }, needsOpening: false };
  const d = await checkOne(input({ ...both, included: ["customer_domain"] }), scripted().ask, open);
  assert.deepEqual([d.hold, d.detail], ["chain", "site:3"], "past the domain, the chain is still said");
  const none = await checkOne(input({ ...both, included: ["customer_domain", "chain"] }), scripted().ask, open);
  assert.equal(none.hold, null);
  const es = scripted(WROTE("Una frase."), READ({ language: "es" }));
  const l = await checkOne(input({ included: ["language"] }), es.ask, open);
  assert.deepEqual([l.hold, l.opening.opening], [null, "Una frase."], "the opening goes as it reads");
});

test("a model that cannot answer fails the try: nothing, no shape, a throw, a deadline", async () => {
  assert.deepEqual(
    [(await checkOne(input(), scripted().ask, open)).kind, (await checkOne(input(), scripted().ask, open)).why],
    ["failed", "no_answer"],
  );
  const garbled = await checkOne(input(), scripted({ nope: 1 }).ask, open);
  assert.deepEqual([garbled.kind, garbled.why, garbled.calls], ["failed", "unparseable", 1]);
  const unread = await checkOne(input(), scripted(WROTE("A 4.9."), { backed: "yes" }).ask, open);
  assert.deepEqual([unread.kind, unread.why, unread.calls], ["failed", "unparseable", 2]);
  const thrown = await checkOne(input(), scripted(new Error("overloaded")).ask, open);
  assert.deepEqual([thrown.kind, thrown.why], ["failed", "error"]);
  const slow = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const late = await checkOne(input(), scripted(WROTE("A 4.9."), slow).ask, open);
  assert.deepEqual([late.kind, late.why, late.calls], ["failed", "timeout", 2]);
});

test("the budget is asked before every call: past it, no call starts (R1)", async () => {
  const m = scripted(WROTE("A 4.9."), READ());
  const out = await checkOne(input(), m.ask, { late: () => true, signal: open.signal });
  assert.deepEqual([out.kind, out.calls, m.asked.length], ["late", 0, 0]);
  // Late between the writer and the reader: the reader is never asked.
  let asked = 0;
  const between = await checkOne(input(), scripted(WROTE("A 4.9."), READ()).ask, {
    late: () => asked++ > 0,
    signal: open.signal,
  });
  assert.deepEqual([between.kind, between.calls], ["late", 1]);
  // Each call's deadline is 8 s, or what is left before the tick is done, whichever is sooner.
  let t = 0;
  const b = checkBudget(0, { callsUntilMs: CHECK_CALLS_UNTIL_MS, doneByMs: 50_000 }, () => t);
  assert.equal(b.late(), false);
  t = CHECK_CALLS_UNTIL_MS + 1;
  assert.equal(b.late(), true);
  assert.ok(CHECK_CALL_MS <= 50_000 - CHECK_CALLS_UNTIL_MS, "a call started at the last moment still ends in time");
});

test("a listing's hours, as words; the backoff, 1, 2, 4, 8, then 15 minutes", () => {
  assert.equal(
    hoursLine([
      { day: "Monday", hours: "8 AM–6 PM" },
      { day: "Sunday", hours: "Closed" },
    ]),
    "Monday 8 AM–6 PM; Sunday Closed",
  );
  assert.equal(hoursLine(null), null);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 9].map((n) => backoffMs(n) / MIN),
    [1, 2, 4, 8, 15, 15],
  );
});

/* ------------------------------------------------------------------ the tick -- */

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TPL = "44444444-aaaa-4aaa-8aaa-444444444444";
const WORDS = { subject: "Quick one", body: "{{opening}}\n\nI run Harbor. {{your name}}" };
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const ahead = (ms) => new Date(Date.now() + ms).toISOString();

let n = 0;
const send = (over = {}) => {
  n += 1;
  return {
    id: `send-${n}`,
    tenant_id: T,
    broadcast_id: "run-1",
    playbook_id: "root-1",
    root_id: "root-1",
    lead_id: `lead-${n}`,
    domain_id: "dom-1",
    send_at: ahead(10 * MIN),
    state: "planned",
    reason: null,
    checked_at: null,
    check_tries: 0,
    check_after: null,
    check_first_at: null,
    check_started_at: null,
    check_gen: 0,
    checked_words: null,
    opening: null,
    angle: null,
    facts_used: [],
    hold_detail: null,
    included_for: [],
    created_at: ago(DAY),
    updated_at: ago(DAY),
    ...over,
  };
};
const record = (name, over = {}) => ({
  business_name: name,
  category: "Moving company",
  city: "Austin",
  region: "TX",
  rating: 4.9,
  reviews: 16,
  website_host: `${name.toLowerCase().replace(/\s+/g, "")}.example`,
  hours: [],
  about: "Family-run since 2009.",
  email: `owner@${name.toLowerCase().replace(/\s+/g, "")}.example`,
  why_it_fits: "Independent mover",
  what_you_asked: "movers",
  site_listings: 1,
  name_listings: 1,
  email_domain_shared: false,
  ...over,
});

/**
 * 00191's lease over the tables, as the SQL makes it: planned, unchecked, past its backoff, not leased in the last two
 * minutes; stamped as it is handed over, with its step, its chain's name and its record. The SQL's round-robin, its
 * horizon and its joins are proved on a stack (reach-out-checked.db.test.mjs).
 */
function world({ sends = [], records = {}, billing = "active", monthSent = 0, spentToday = 0, body = WORDS } = {}) {
  const tables = {
    tenants: [
      { id: T, name: "Harbor Moving Co", status: "active" },
      { id: T2, name: "Second Movers", status: "active" },
    ],
    tenant_config: [],
    business_records: [{ tenant_id: T, about: "We move homes across Austin." }],
    billing_accounts: billing ? [{ tenant_id: T, mode: "stripe", status: billing }] : [],
    templates: [
      {
        id: TPL,
        tenant_id: T,
        channel: "email",
        body_preview: null,
        components: [
          { type: "HEADER", text: body.subject },
          { type: "BODY", text: body.body },
        ],
      },
    ],
    reach_out_sends: sends,
    // What the workspace's model attempts spent this UTC day (00191), counted against its ceiling.
    reach_out_check_spend: [{ tenant_id: T, day: new Date().toISOString().slice(0, 10), attempts: spentToday }],
  };
  const leased = [];
  const db = fakeDb(
    tables,
    {},
    {
      reach_out_unchecked: (a) => {
        const now = new Date().toISOString();
        const free = (s) =>
          s.state === "planned" &&
          s.checked_at == null &&
          (s.check_after == null || s.check_after <= now) &&
          (s.check_started_at == null || s.check_started_at < ago(2 * MIN)) &&
          (!a.p_tenant_id || s.tenant_id === a.p_tenant_id);
        const perWorkspace = new Map();
        const picked = [];
        for (const s of tables.reach_out_sends.filter(free)) {
          const k = perWorkspace.get(s.tenant_id) ?? 0;
          if (k >= a.p_per_workspace || picked.length >= a.p_limit) continue;
          perWorkspace.set(s.tenant_id, k + 1);
          picked.push(s);
        }
        for (const s of picked) {
          s.check_started_at = now;
          leased.push(s.id);
        }
        return picked.map((s) => ({
          send: { ...s },
          check_gen: s.check_gen,
          template_id: TPL,
          template_language: "en",
          signed_by: "Sam",
          included_for: s.included_for,
          ...(records[s.lead_id] ?? record(`Fixture Movers ${s.lead_id}`)),
        }));
      },
      reach_out_month_sent: () => monthSent,
      // 00191's spend and release, as the SQL makes them (proved on a stack, reach-out-checked.db.test.mjs).
      reach_out_check_take: (a) => {
        const day = a.p_at.slice(0, 10);
        let row = tables.reach_out_check_spend.find((x) => x.tenant_id === a.p_tenant_id && x.day === day);
        if (!row) tables.reach_out_check_spend.push((row = { tenant_id: a.p_tenant_id, day, attempts: 0 }));
        if (row.attempts >= a.p_cap) return false;
        row.attempts += 1;
        return true;
      },
      reach_out_release_unavailable: (a) => {
        let n = 0;
        for (const s of tables.reach_out_sends)
          if (
            s.state === "held" &&
            s.reason === "check_unavailable" &&
            s.hold_detail == null &&
            s.updated_at < a.p_before &&
            (!a.p_tenant_id || s.tenant_id === a.p_tenant_id)
          ) {
            Object.assign(s, {
              state: "planned",
              reason: null,
              checked_at: null,
              check_gen: s.check_gen + 1,
              checked_words: null,
              check_tries: 0,
              check_first_at: null,
              check_after: null,
              check_started_at: null,
              opening: null,
              angle: null,
              facts_used: [],
              hold_detail: null,
            });
            n += 1;
          }
        return n;
      },
    },
  );
  const row = (id) => tables.reach_out_sends.find((s) => s.id === id);
  return { db, tables, row, leased };
}
const HOUR_AGO = 3_600_000;
/** A model that answers by the business the record names. */
function byBusiness(scripts) {
  const calls = [];
  const ask = async (system, user) => {
    calls.push(user);
    const key = Object.keys(scripts).find((name) => user.includes(`name: ${name}`));
    const next = key ? scripts[key].shift() : undefined;
    if (next instanceof Error) throw next;
    return next === undefined ? null : { answer: next, tokens: { input: 10, output: 5 } };
  };
  return { ask, calls };
}
const tick = (w, ask, over = {}) =>
  checkSends({ db: w.db, now: new Date(), started: Date.now(), log: fakeLog(), ask, ...over });

test("a tick checks each leased send once: the opening kept, a hold with its reason, the words it was checked against", async () => {
  const plain = send({ lead_id: "plain" });
  const liar = send({ lead_id: "liar" });
  const customer = send({ lead_id: "customer" });
  const w = world({
    sends: [plain, liar, customer],
    records: {
      plain: record("Plain Movers"),
      liar: record("Liar Movers"),
      customer: record("Customer Movers", { email_domain_shared: true }),
    },
  });
  const m = byBusiness({
    "Plain Movers": [WROTE("A 4.9 says people find you."), READ()],
    "Liar Movers": [WROTE("A 4.8 says it."), READ(), WROTE("A 4.7 says it."), READ()],
    "Customer Movers": [WROTE("A 4.9 says it."), READ()],
  });
  const out = await tick(w, m.ask);
  assert.deepEqual([out.read, out.checked, out.held, out.rewritten, out.calls, out.calls_failed], [3, 3, 2, 1, 8, 0]);
  const p = w.row(plain.id);
  assert.deepEqual(
    [p.state, p.opening, p.angle, p.facts_used, !!p.checked_at, p.check_started_at],
    ["planned", "A 4.9 says people find you.", "their reviews", ["rating"], true, null],
    "checked, and its lease ended",
  );
  assert.equal(p.checked_words, checkedWordsOf(WORDS, "Sam", false), "stamped with the words it was checked against");
  assert.deepEqual([w.row(liar.id).state, w.row(liar.id).reason], ["held", "unbacked_fact"]);
  assert.deepEqual(
    [w.row(customer.id).state, w.row(customer.id).reason, w.row(customer.id).hold_detail],
    ["held", "customer_domain", "customermovers.example"],
  );
  // A second tick finds nothing to check.
  const again = await tick(w, m.ask);
  assert.deepEqual([again.read, again.calls], [0, 0]);
});

test("a failed try backs off and ends its lease; an hour of them holds the send check_unavailable (R4)", async () => {
  const fresh = send({ lead_id: "fresh" });
  const third = send({ lead_id: "third", check_tries: 2, check_first_at: ago(10 * MIN) });
  const hour = send({ lead_id: "hour", check_tries: 6, check_first_at: ago(CHECK_GIVE_UP_MS + MIN) });
  const w = world({ sends: [fresh, third, hour] });
  const log = fakeLog();
  const before = Date.now();
  const out = await tick(w, async () => null, { log });
  assert.deepEqual([out.failed, out.gave_up, out.calls, out.calls_failed], [2, 1, 3, 3]);
  const f = w.row(fresh.id);
  assert.equal(f.check_tries, 1);
  assert.equal(f.state, "planned");
  assert.equal(f.check_started_at, null, "its lease ends: the next tick may take it once it has waited");
  assert.ok(Math.abs(Date.parse(f.check_after) - (before + MIN)) < 5_000, "a minute on");
  assert.ok(Math.abs(Date.parse(f.check_first_at) - before) < 5_000, "its first try is remembered");
  const t = w.row(third.id);
  assert.equal(t.check_tries, 3);
  assert.ok(Math.abs(Date.parse(t.check_after) - (before + 4 * MIN)) < 5_000, "the third try waits four minutes");
  assert.equal(t.check_first_at, third.check_first_at);
  const h = w.row(hour.id);
  assert.deepEqual(
    [h.state, h.reason, h.hold_detail, !!h.checked_at, h.check_tries],
    ["held", "check_unavailable", null, true, 7],
  );
  assert.deepEqual(
    log.lines.filter((l) => l.event === "reach_out_check_held").map((l) => [l.level, l.send_id]),
    [["warn", hour.id]],
  );
  // Waiting out its backoff, it is not taken again; the hold is its owner's for the hour (the database stamps
  // updated_at on every write, which this double does not).
  h.updated_at = new Date().toISOString();
  assert.deepEqual([(await tick(w, async () => null)).read, w.row(hour.id).state], [0, "held"]);
});

test("a check never writes onto words that changed under it (R3, R5)", async () => {
  const s = send({ lead_id: "moved" });
  const w = world({ sends: [s], records: { moved: record("Moved Movers") } });
  // The owner edits the step while the model writes: the send's version moves on.
  const ask = async (system) => {
    w.row(s.id).check_gen = 1;
    return { answer: system.includes("You write") ? WROTE("A 4.9 says it.") : READ(), tokens: { input: 1, output: 1 } };
  };
  const out = await tick(w, ask);
  assert.equal(out.checked, 0);
  assert.deepEqual([w.row(s.id).checked_at, w.row(s.id).opening], [null, null]);
});

test("a workspace that may not spend, has no room this month or checked its day's share costs no call (R2, R12)", async () => {
  for (const [why, over] of [
    ["billing", { billing: null }],
    ["billing", { billing: "canceled" }],
    ["month_spent", { monthSent: 2000 }],
    ["day_spent", { spentToday: REACH_OUT_CHECKS_PER_DAY }],
  ]) {
    const s = send();
    const w = world({ sends: [s], ...over });
    const log = fakeLog();
    const m = byBusiness({});
    const out = await tick(w, m.ask, { log });
    assert.deepEqual([out.gated, out.calls, m.calls.length], [1, 0, 0], why);
    const r = w.row(s.id);
    assert.deepEqual([r.state, r.checked_at, r.check_started_at, r.check_tries], ["planned", null, null, 0], why);
    assert.ok(Date.parse(r.check_after) > Date.now() + 59 * MIN, `${why}: asked again an hour on`);
    assert.deepEqual(
      log.lines.filter((l) => l.event === "reach_out_check_gated").map((l) => l.reason),
      [why],
    );
  }
  // Two attempts left of the day: two are checked, the rest wait.
  const three = [1, 2, 3].map(() => send({ lead_id: `room-${++n}` }));
  const w = world({ sends: three, spentToday: REACH_OUT_CHECKS_PER_DAY - 2 });
  const out = await tick(w, async (system) => ({
    answer: system.includes("You write") ? WROTE("A 4.9 says it.") : READ(),
    tokens: { input: 1, output: 1 },
  }));
  assert.deepEqual([out.checked, out.gated], [2, 1]);
});

test("the day's ceiling survives a reset, and a failed attempt spends it too (R12)", async () => {
  // Checked, then reset (its words changed): the attempt stays spent, and the next attempt takes another.
  const s = send();
  const w = world({ sends: [s], spentToday: REACH_OUT_CHECKS_PER_DAY - 2 });
  const ok = async (system) => ({
    answer: system.includes("You write") ? WROTE("A 4.9 says it.") : READ(),
    tokens: { input: 1, output: 1 },
  });
  assert.equal((await tick(w, ok)).checked, 1);
  Object.assign(w.row(s.id), { checked_at: null, check_gen: 1, check_started_at: null });
  // A failure spends the day's last attempt.
  assert.equal((await tick(w, async () => null)).failed, 1);
  const spend = () => w.tables.reach_out_check_spend.find((x) => x.tenant_id === T).attempts;
  assert.equal(spend(), REACH_OUT_CHECKS_PER_DAY, "two attempts, a pass and a failure, both counted");
  Object.assign(w.row(s.id), { check_after: null });
  const m = byBusiness({});
  const out = await tick(w, m.ask);
  assert.deepEqual([out.gated, m.calls.length], [1, 0], "the day is spent, whatever was reset");
  // Words that name no opening ask no model, and take no attempt.
  const plain = world({
    sends: [send()],
    spentToday: REACH_OUT_CHECKS_PER_DAY,
    body: { subject: "Quick one", body: "Hi {{business}}." },
  });
  assert.equal((await tick(plain, byBusiness({}).ask)).checked, 1);
});

test("an opening past 400 characters is rewritten once, then held without its words; never a pass", async () => {
  const longer = "x".repeat(401);
  const s = send();
  const w = world({ sends: [s] });
  const calls = [];
  const out = await tick(w, async (system) => {
    calls.push(system);
    return {
      answer: system.includes("You write") ? WROTE(longer, { facts_used: [] }) : READ(),
      tokens: { input: 1, output: 1 },
    };
  });
  assert.equal(calls.length, 4, "written, read, written again told why, read");
  const r = w.row(s.id);
  assert.deepEqual([r.state, r.reason, r.hold_detail, r.opening], ["held", "check_unavailable", "too_long", null]);
  assert.equal(out.held, 1);
  // A sendable opening the send cannot store (an angle past its column) is a failed try, never a pass.
  const t = send();
  const v = world({ sends: [t] });
  const angle = "Supercalifragilisticexpialidocious-reviews everywhere";
  const tried = await tick(v, async (system) => ({
    answer: system.includes("You write") ? WROTE("A 4.9 says it.", { angle }) : READ(),
    tokens: { input: 1, output: 1 },
  }));
  assert.deepEqual([tried.checked, tried.failed], [0, 1]);
  assert.deepEqual([v.row(t.id).checked_at, v.row(t.id).check_tries], [null, 1]);
});

test("a tick past its budget hands its sends back untouched, and asks nothing (R1)", async () => {
  const s = send();
  const w = world({ sends: [s] });
  const m = byBusiness({});
  const out = await tick(w, m.ask, { started: Date.now() - CHECK_CALLS_UNTIL_MS - 1_000 });
  assert.deepEqual([out.late, out.calls, m.calls.length], [1, 0, 0]);
  const r = w.row(s.id);
  assert.deepEqual([r.check_started_at, r.check_tries, r.check_after, r.checked_at], [null, 0, null, null]);
});

test("words with no opening are checked with no call; a hold its owner included the lead past is not made again", async () => {
  const chain = send({ lead_id: "chain", included_for: ["chain"] });
  const w = world({
    sends: [chain],
    records: { chain: record("Chain Movers", { site_listings: 5 }) },
    body: { subject: "Quick one", body: "Hi {{business}}, I run Harbor." },
  });
  const out = await tick(w, byBusiness({}).ask);
  assert.deepEqual([out.checked, out.held, out.calls], [1, 0, 0]);
  assert.deepEqual([w.row(chain.id).state, w.row(chain.id).opening], ["planned", null]);
});

test("a check_unavailable hold with no rule broken goes back to be checked an hour on; one for a rule keeps (R4)", async () => {
  const back = send({
    lead_id: "back",
    state: "held",
    reason: "check_unavailable",
    checked_at: ago(2 * HOUR_AGO),
    check_tries: 7,
    check_gen: 4,
    updated_at: ago(61 * MIN),
    included_for: ["chain"],
  });
  const rule = send({
    state: "held",
    reason: "check_unavailable",
    hold_detail: "too_long",
    updated_at: ago(2 * HOUR_AGO),
  });
  const young = send({ state: "held", reason: "check_unavailable", updated_at: ago(30 * MIN) });
  const w = world({ sends: [back, rule, young], records: { back: record("Back Movers") } });
  const out = await tick(w, async (system) => ({
    answer: system.includes("You write") ? WROTE("A 4.9 says it.") : READ(),
    tokens: { input: 1, output: 1 },
  }));
  assert.equal(out.released, 1);
  const b = w.row(back.id);
  assert.deepEqual(
    [b.state, b.reason, b.check_gen, b.check_tries, b.included_for],
    ["planned", null, 5, 0, ["chain"]],
    "planned at the next version, its owner's inclusion kept",
  );
  assert.equal(out.checked, 1, "and checked in the same tick");
  assert.equal(w.row(rule.id).state, "held");
  assert.equal(w.row(young.id).state, "held");
});
