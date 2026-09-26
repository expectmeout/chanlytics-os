/**
 * The reach-out clock on a real database (00186, Reach out Part 3 PR 5): the edge's clock itself, over a stack, at the
 * sizes a list of ids or a page of a thousand rows would have failed at. Hundreds of queued sends reconcile in one tick;
 * a run with a thousand sends still open is not finished while one with none is; a stale send in a run that goes ahead
 * is planned again however many a waiting run holds; a canceled run's written email is withdrawn before its send is
 * skipped. Every move runs through the real guards. The clock is kept to this suite's workspace (its reads take one), so
 * the database suites running beside it keep their rows. Local stack only: it makes workspaces.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const MIN = 60_000;
const DAY = 86_400_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();

let db;
let clock;
let sendMessageId;
let log;
let A;
let root;
let template;
let search;
let domain;
let thread;
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

/** `count` leads, in one insert. */
async function leads(count, over = {}) {
  const rows = Array.from({ length: count }, () => {
    n += 1;
    return {
      tenant_id: A,
      place_id: `ChIJfixtureClock${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      region: "TX",
      email: `owner-${stamp}-${n}@fixture-clock.example`,
      email_state: "ok",
      stage: "ready",
      ...over,
    };
  });
  const ids = [];
  for (let i = 0; i < rows.length; i += 500)
    ids.push(
      ...ok(
        await db
          .from("leads")
          .insert(rows.slice(i, i + 500))
          .select("id"),
      ),
    );
  return ids.map((r) => r.id);
}
/** A run of the root in a state, for a day of its own. */
const run = (state, day) =>
  one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: `Movers · ${day}`,
      template_id: template,
      template_name: `reach_first_${stamp}`,
      template_language: "en",
      audience: { kind: "reach_out", root_id: root, step_id: root, search_id: search },
      state,
      scheduled_for: iso(Date.now()),
      playbook_id: root,
      run_for: day,
    }),
  );
/** Planned sends of a run for these leads, each at `sendAt`, in one insert. */
async function planned(runId, leadIds, sendAt, over = {}) {
  const rows = leadIds.map((lead) => ({
    id: crypto.randomUUID(),
    tenant_id: A,
    broadcast_id: runId,
    playbook_id: root,
    root_id: root,
    lead_id: lead,
    domain_id: domain,
    send_at: iso(sendAt),
    ...over,
  }));
  for (let i = 0; i < rows.length; i += 500) ok(await db.from("reach_out_sends").insert(rows.slice(i, i + 500)));
  return rows.map((r) => r.id);
}
/** Moves sends along the guard's own path (planned → claimed → queued), each with its email written as `status`. */
async function queuedWith(sendIds, status) {
  const emails = [];
  for (const id of sendIds) {
    const mid = await sendMessageId(id, 0);
    emails.push({
      id: mid,
      tenant_id: A,
      conversation_id: thread,
      channel: "email",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Saw your shop on the map.",
      status,
      meta: status === "sent" ? { status_at: { sent: iso(Date.now() - MIN) } } : {},
    });
  }
  for (let i = 0; i < emails.length; i += 500) ok(await db.from("messages").insert(emails.slice(i, i + 500)));
  for (const id of sendIds) {
    ok(
      await db
        .from("reach_out_sends")
        .update({ state: "claimed", claimed_at: iso(Date.now()) })
        .eq("id", id),
    );
    ok(
      await db
        .from("reach_out_sends")
        .update({ state: "queued", message_id: await sendMessageId(id, 0) })
        .eq("id", id),
    );
  }
}
const states = async (ids) => {
  const out = {};
  for (let i = 0; i < ids.length; i += 100)
    for (const r of ok(
      await db
        .from("reach_out_sends")
        .select("state")
        .in("id", ids.slice(i, i + 100)),
    ))
      out[r.state] = (out[r.state] ?? 0) + 1;
  return out;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  ({ reachOutClock: clock } = await import(at("apps/edge/lib/reach-out/clock.ts")));
  ({ sendMessageId } = await import(at("packages/core/src/campaigns/reach-out-ids.ts")));
  ({ logger: log } = await import(at("apps/edge/lib/log.ts")));
  A = await one(db.from("tenants").insert({ slug: `clock-a-${stamp}`, name: "Clock A", timezone: "America/Chicago" }));
  search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
  );
  template = await one(
    db.from("templates").insert({
      tenant_id: A,
      channel: "email",
      source: "chanlytics",
      name: `reach_first_${stamp}`,
      language: "en",
      category: "marketing",
      meta_status: "approved",
      components: [{ type: "BODY", text: "Hi {{business}}" }],
    }),
  );
  root = await one(
    db.from("playbooks").insert({
      tenant_id: A,
      kind: "reach_out",
      policy_class: "outreach",
      gap_minutes: 5,
      template_id: template,
      template_name: `reach_first_${stamp}`,
      template_language: "en",
      params: [],
      name: "Movers",
      trigger: "lead_first",
      lead_search_id: search,
    }),
  );
  domain = await one(
    db.from("sending_domains").insert({
      tenant_id: A,
      host: `clock-${stamp}.example`,
      from_local: "sam",
      from_name: "Sam",
      state: "verified",
      provider_status: "verified",
      dmarc: "found",
      verified_at: iso(Date.now() - 40 * DAY),
      clean_since: iso(Date.now() - 40 * DAY),
    }),
  );
  const person = await one(
    db.from("contacts").insert({ tenant_id: A, email: `thread-${stamp}@fixture-clock.example` }),
  );
  thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: person }));
});
after(async () => {
  if (skip) return;
  if (A) ok(await db.from("tenants").delete().eq("id", A));
});

test(
  "hundreds of queued sends reconcile in one tick: no list of their ids rides in a request's address",
  { skip },
  async () => {
    const r = await run("sending", "2026-09-01");
    const ids = await planned(r, await leads(250), Date.now() - MIN);
    await queuedWith(ids, "sent");
    const out = await clock(db, new Date(), log({ test: "clock" }), Date.now(), A);
    assert.equal(out.sent >= 250, true, JSON.stringify(out));
    assert.deepEqual(await states(ids), { sent: 250 });
  },
);

test(
  "a run with a thousand sends still open is not finished, whatever a page of a thousand rows would say; one with none is",
  { skip },
  async () => {
    const busy = await run("scheduled", "2026-09-02");
    await planned(busy, await leads(1001), Date.now() + 2 * DAY);
    const done = await run("scheduled", "2026-09-03");
    const [x] = await planned(done, await leads(1), Date.now() + DAY);
    ok(await db.from("reach_out_sends").update({ state: "skipped", reason: "outreach_wrote_back" }).eq("id", x));
    await clock(db, new Date(), log({ test: "clock" }), Date.now(), A);
    const rows = ok(await db.from("broadcasts").select("id, state, finished_at").in("id", [busy, done]));
    const by = Object.fromEntries(rows.map((b) => [b.id, b]));
    assert.equal(by[busy].state, "scheduled", "a thousand and one planned: not finished");
    assert.equal(by[done].state, "sent", "through its own moves: scheduled, sending, sent");
    assert.ok(by[done].finished_at);
  },
);

test(
  "a stale send in a run that goes ahead is planned again, however many old sends a waiting run holds",
  { skip },
  async () => {
    const waiting = await run("pending_approval", "2026-09-04");
    await planned(waiting, await leads(600), Date.now() - 3 * DAY);
    const goes = await run("sending", "2026-09-05");
    const [late] = await planned(goes, await leads(1), Date.now() - 30 * MIN);
    await clock(db, new Date(), log({ test: "clock" }), Date.now(), A);
    const s = ok(await db.from("reach_out_sends").select("state, send_at").eq("id", late).single());
    assert.equal(s.state, "planned");
    assert.ok(Date.parse(s.send_at) > Date.now() - MIN, "planned again from now");
  },
);

test(
  "a canceled run's written email is withdrawn before its send is skipped: its job sends nothing",
  { skip },
  async () => {
    const r = await run("sending", "2026-09-06");
    const [id] = await planned(r, await leads(1), Date.now() - MIN);
    // Claimed eleven minutes ago, its email written, never queued: the writer died between the two.
    ok(
      await db
        .from("reach_out_sends")
        .update({ state: "claimed", claimed_at: iso(Date.now() - 11 * MIN) })
        .eq("id", id),
    );
    const mid = await sendMessageId(id, 0);
    ok(
      await db.from("messages").insert({
        id: mid,
        tenant_id: A,
        conversation_id: thread,
        channel: "email",
        direction: "outbound",
        sender: "ai",
        type: "text",
        body: "Saw your shop on the map.",
        status: "queued",
      }),
    );
    ok(await db.from("broadcasts").update({ state: "canceled" }).eq("id", r));
    await clock(db, new Date(), log({ test: "clock" }), Date.now(), A);
    const m = ok(await db.from("messages").select("status, error").eq("id", mid).single());
    assert.deepEqual([m.status, m.error?.reason], ["canceled", "run_canceled"], "its email is withdrawn");
    await clock(db, new Date(), log({ test: "clock" }), Date.now(), A);
    const s = ok(await db.from("reach_out_sends").select("state, reason").eq("id", id).single());
    assert.deepEqual([s.state, s.reason], ["skipped", "run_canceled"]);
  },
);

test(
  "three hundred stale sends of one step are planned again in one tick: their leads are read a hundred at a time",
  { skip },
  async () => {
    const goes = await run("sending", "2026-09-19");
    const old = Date.now() - 40 * MIN;
    const ids = await planned(goes, await leads(300), old);
    const out = await clock(db, new Date(), log({ test: "clock" }), Date.now(), A);
    assert.equal(out.replanned + out.waiting, 300, JSON.stringify(out));
    const left = [];
    for (let i = 0; i < ids.length; i += 100)
      left.push(
        ...ok(
          await db
            .from("reach_out_sends")
            .select("id")
            .in("id", ids.slice(i, i + 100))
            .eq("send_at", iso(old)),
        ),
      );
    assert.deepEqual(left, [], "none keeps the time it was left at");
  },
);
