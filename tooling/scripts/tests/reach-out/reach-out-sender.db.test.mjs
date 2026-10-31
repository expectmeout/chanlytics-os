/**
 * The reach-out sender on a real database (00187, Reach out Part 3 PR 6; from a connected mailbox since 00424). Its two
 * reads, at the sizes a page would have failed at: the mailboxes with sends due are filtered before their limit, so six
 * hundred sends a paused chain holds on one mailbox never keep another's due send out of the page; the month's count is the workspace's own calendar month in
 * its own zone, and only what left, may have left, or waits to go. Then the writer itself, over the real guards: a due
 * send is claimed, its person made, its email row written, its job scheduled, its send queued and its run sending,
 * each through the constraint or the trigger that holds it; and a second tick writes nothing more. A claim a dead tick
 * left after writing its email is that email's: in a run canceled since, the email is withdrawn and the send adopted,
 * and the clock's next tick skips it, through the same guards. The sender is kept
 * to this suite's workspace (its reads take one). Local stack only: it makes workspaces.
 *
 * Part 4 (00197): a send is claimed only once it is checked, so each send here is planned checked, stamped with the
 * words it was checked against (checked_words, R5); one not yet checked makes no mailbox due (R8); and a checked send's
 * opening is its email's.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const MIN = 60_000;
const DAY = 86_400_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();

let db;
let claimAndWrite;
let checkedWordsOf;
let sendMessageId;
let log;
let A;
let B;
let template;
let search;
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

/** The suite's template's words, as the check stamps them on a send it passed (R5). */
const WORDS = { subject: "A quote for {{business}}", body: "Hi {{business}}, movers in {{city}} ask us for this." };
const workspace = (slug, name) => one(db.from("tenants").insert({ slug, name, timezone: "America/Chicago" }));
/** A chain over a search of its own: a search has one chain (00197). */
const chain = async (tenant, state = "running", tpl = template) =>
  one(
    db.from("sequence_steps").insert({
      tenant_id: tenant,
      kind: "reach_out",
      policy_class: "outreach",
      gap_minutes: 5,
      template_id: tpl,
      template_name: `reach_sender_${stamp}`,
      template_language: "en",
      params: [],
      name: "Movers",
      trigger: "lead_first",
      lead_search_id: await one(
        db
          .from("lead_searches")
          .insert({ tenant_id: tenant, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
      ),
      state,
    }),
  );
/** A mailbox the business connected, on a host of its own (ten a workspace, 00423). */
const mailbox = (tenant, over = {}) => {
  n += 1;
  return one(
    db.from("mailbox_connections").insert({
      tenant_id: tenant,
      provider: "google",
      provider_account: `acct-sender-${stamp}-${n}`,
      address: `sam@sender-${stamp}-${n}.example`,
      host: `sender-${stamp}-${n}.example`,
      from_name: "Sam at Harbor",
      clean_since: iso(Date.now() - 40 * DAY),
      ...over,
    }),
  );
};
async function leads(tenant, count) {
  const rows = Array.from({ length: count }, () => {
    n += 1;
    return {
      tenant_id: tenant,
      place_id: `ChIJfixtureSender${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: `owner-${stamp}-${n}@fixture-sender.example`,
      email_state: "ok",
      stage: "ready",
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
const run = (tenant, root, day, state = "scheduled") =>
  one(
    db.from("sequence_batches").insert({
      tenant_id: tenant,
      name: `Movers · ${day}`,
      template_id: template,
      template_name: `reach_sender_${stamp}`,
      template_language: "en",
      audience: { kind: "reach_out", root_id: root, step_id: root, search_id: search },
      state,
      scheduled_for: iso(Date.now()),
      step_id: root,
      run_for: day,
    }),
  );
/** Sends planned in a run, checked against the suite's words (unless `check` says otherwise). */
async function planned(tenant, runId, root, mailboxId, leadIds, sendAt, check = {}) {
  const rows = leadIds.map((lead) => ({
    id: crypto.randomUUID(),
    tenant_id: tenant,
    batch_id: runId,
    step_id: root,
    sequence_id: root,
    lead_id: lead,
    mailbox_id: mailboxId,
    send_at: iso(sendAt),
    checked_at: iso(Date.now() - MIN),
    checked_words: checkedWordsOf(WORDS, null, false),
    ...check,
  }));
  for (let i = 0; i < rows.length; i += 500) ok(await db.from("sequence_sends").insert(rows.slice(i, i + 500)));
  return rows.map((r) => r.id);
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  ({ claimAndWrite } = await import(at("apps/edge/lib/reach-out/sender.ts")));
  ({ checkedWordsOf } = await import(at("apps/edge/lib/reach-out/request.ts")));
  ({ sendMessageId } = await import(at("packages/core/src/campaigns/reach-out-ids.ts")));
  ({ logger: log } = await import(at("apps/edge/lib/log.ts")));
  A = await workspace(`sender-a-${stamp}`, "Harbor Moving Co");
  B = await workspace(`sender-b-${stamp}`, "Other Movers");
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
      name: `reach_sender_${stamp}`,
      language: "en",
      category: "marketing",
      meta_status: "approved",
      components: [
        { type: "HEADER", format: "TEXT", text: "A quote for {{business}}" },
        { type: "BODY", text: "Hi {{business}}, movers in {{city}} ask us for this." },
      ],
    }),
  );
});
after(async () => {
  if (skip) return;
  for (const t of [A, B]) if (t) ok(await db.from("tenants").delete().eq("id", t));
});

test(
  "the mailboxes with sends due are filtered before their limit: 600 a paused chain holds never keep a due one out",
  { skip },
  async () => {
    const paused = await chain(A, "paused");
    const going = await chain(A);
    const [crowded, due, held, later] = [
      await mailbox(A),
      await mailbox(A),
      await mailbox(A, { state: "held", held_at: iso(Date.now()), held_why: "bounces" }),
      await mailbox(A),
    ];
    const heldRun = await run(A, paused, "2026-09-20");
    const goRun = await run(A, going, "2026-09-21");
    await planned(A, heldRun, paused, crowded, await leads(A, 600), Date.now() - 3 * DAY);
    const [first] = await leads(A, 1);
    await planned(A, goRun, going, due, [first], Date.now() - 2 * MIN);
    await planned(A, goRun, going, held, await leads(A, 1), Date.now() - 3 * MIN);
    await planned(A, goRun, going, later, await leads(A, 1), Date.now() - MIN);
    // A waiting run's sends call nothing either.
    const waiting = await run(A, going, "2026-09-22", "pending_approval");
    await planned(A, waiting, going, crowded, await leads(A, 1), Date.now() - DAY);
    // Nor does a send not yet checked (00197, R8): the claim would pass it by.
    const unchecked = await mailbox(A);
    await planned(A, goRun, going, unchecked, await leads(A, 1), Date.now() - 4 * DAY, {
      checked_at: null,
      checked_words: null,
    });
    // Nor a mailbox its owner paused, or one its provider has rested until later (00424).
    const pausedBox = await mailbox(A, { state: "paused" });
    const resting = await mailbox(A, { resting_until: iso(Date.now() + 60 * MIN) });
    await planned(A, goRun, going, pausedBox, await leads(A, 1), Date.now() - 5 * DAY);
    await planned(A, goRun, going, resting, await leads(A, 1), Date.now() - 5 * DAY);

    const dueMailboxes = (over) =>
      db.rpc("reach_out_due_mailboxes", { p_at: iso(Date.now()), p_limit: 50, p_tenant_id: A, ...over });
    const page = ok(await dueMailboxes({ p_limit: 1 }));
    assert.deepEqual(page, [{ id: due, tenant_id: A }], "the longest-waiting due send's mailbox, past 600 held");
    assert.deepEqual(
      ok(await dueMailboxes({})).map((d) => d.id),
      [due, later],
      "a held, paused or resting mailbox is none, nor one whose due send waits to be checked; the one waiting longest goes first",
    );
    assert.deepEqual(ok(await dueMailboxes({ p_tenant_id: B })), []);
    // Past what the sender is done with this tick: a mailbox it did, and a workspace it holds.
    assert.deepEqual(
      ok(await dueMailboxes({ p_skip_mailboxes: [due] })).map((d) => d.id),
      [later],
      "the next page starts past it",
    );
    assert.deepEqual(ok(await dueMailboxes({ p_skip_tenants: [A] })), [], "a workspace held is none of the page");
    // Tidy, so the writer's case below starts from nothing due, and the workspace keeps well within its ten mailboxes.
    ok(await db.from("sequence_sends").delete().eq("tenant_id", A));
    ok(await db.from("mailbox_connections").delete().in("id", [unchecked, pausedBox, resting]));
  },
);

test(
  "the month's count is the workspace's calendar month in its own zone, and only what left, may have left, or waits",
  { skip },
  async () => {
    const person = await one(
      db.from("contacts").insert({ tenant_id: B, email: `month-${stamp}@fixture-sender.example` }),
    );
    const thread = await one(db.from("conversations").insert({ tenant_id: B, contact_id: person }));
    // Chicago is five hours behind UTC in September: its month starts at 05:00Z on the 1st.
    const row = (created, status, error = null, source = "reach_out") => ({
      tenant_id: B,
      conversation_id: thread,
      channel: "email",
      direction: "outbound",
      sender: "human",
      type: "text",
      body: "Saw your shop on the map.",
      status,
      error,
      meta: { source },
      created_at: created,
    });
    ok(
      await db.from("messages").insert([
        row("2026-09-01T04:59:00Z", "sent"), // August, where the workspace is
        row("2026-09-01T05:01:00Z", "sent"),
        row("2026-09-10T12:00:00Z", "delivered"),
        row("2026-09-10T12:00:00Z", "queued"), // waits for its job: it will leave
        row("2026-09-10T12:00:00Z", "failed", { outcome: "unknown", http_status: 0 }), // may have left
        row("2026-09-10T12:00:00Z", "failed", { provider: "bounced" }), // left, and bounced
        row("2026-09-10T12:00:00Z", "canceled", { reason: "outreach_wrote_back" }), // the door said no
        row("2026-09-10T12:00:00Z", "failed", { http_status: 429 }), // never left
        row("2026-09-10T12:00:00Z", "failed", { reason: "never_delivered" }), // never left
        row("2026-09-10T12:00:00Z", "sent", null, "broadcast"), // not a cold email
      ]),
    );
    const count = async (at) => ok(await db.rpc("reach_out_month_sent", { p_tenant_id: B, p_at: at }));
    assert.equal(await count("2026-09-15T12:00:00Z"), 5);
    assert.equal(
      await count("2026-09-01T04:00:00Z"),
      1,
      "still August in Chicago: August's one, and none of September's",
    );
    assert.equal(await count("2026-10-01T06:00:00Z"), 0, "a new month, where the workspace is");
    ok(await db.from("messages").delete().eq("tenant_id", B));
  },
);

test(
  "the writer over the real guards: one due send becomes its person, its email, its job, a queued send and a sending run",
  { skip },
  async () => {
    ok(
      await db.from("tenant_config").upsert({
        tenant_id: A,
        config: {
          brain: {
            business_name: "Harbor Moving Co",
            system_prompt: "You answer for Harbor Moving Co, a moving company in Austin, Texas.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: { address: "100 Example St, Austin, TX 78701" },
          },
        },
      }),
    );
    const root = await chain(A);
    const dom = await mailbox(A);
    const from = ok(await db.from("mailbox_connections").select("address").eq("id", dom).single()).address;
    const runId = await run(A, root, "2026-09-25");
    const [lead] = await leads(A, 1);
    const [sendId] = await planned(A, runId, root, dom, [lead], Date.now() - MIN);
    const lane = {
      unsubscribeSecret: "unsubscribe-seal-for-this-suite",
      unsubscribeOrigin: "https://app.chanlytics.com",
    };
    const L = log({ suite: "reach_out_sender" });
    const out = await claimAndWrite({ db, now: new Date(), started: Date.now(), lane, log: L, tenantId: A });
    assert.deepEqual([out.claimed, out.written, out.errors, out.skipped], [1, 1, 0, 0]);

    const id = await sendMessageId(sendId, 0);
    const send = ok(
      await db
        .from("sequence_sends")
        .select("*, broadcast_id:batch_id, playbook_id:step_id, root_id:sequence_id")
        .eq("id", sendId)
        .single(),
    );
    const l = ok(await db.from("leads").select("contact_id").eq("id", lead).single());
    assert.deepEqual([send.state, send.message_id, send.contact_id], ["queued", id, l.contact_id]);
    const m = ok(await db.from("messages").select("*").eq("id", id).single());
    assert.deepEqual([m.status, m.channel, m.sender, m.contact_id], ["queued", "email", "human", l.contact_id]);
    assert.equal(m.meta.email.request.from, `"Sam at Harbor" <${from}>`);
    assert.deepEqual(m.meta.email.request.reply_to, [from], "answered at the mailbox it left from");
    assert.equal(m.meta.reach_out.send_id, sendId);
    const jobs = ok(
      await db.from("jobs").select("kind, state, payload").eq("tenant_id", A).eq("payload->>message_id", id),
    );
    assert.deepEqual(
      jobs.map((j) => [j.kind, j.state, j.payload.purpose, j.payload.proactive, j.payload.conversation_id]),
      [["outbound_send", "scheduled", "outreach", true, m.conversation_id]],
    );
    assert.equal(ok(await db.from("sequence_batches").select("state").eq("id", runId).single()).state, "sending");
    // The mailbox's capacity counts the queued email (its send), so the day's share already knows it.
    const cap = ok(await db.rpc("mailbox_capacity", { p_mailbox_id: dom, p_at: iso(Date.now()) }));
    assert.equal(cap.used, 1);

    const again = await claimAndWrite({ db, now: new Date(), started: Date.now(), lane, log: L, tenantId: A });
    assert.deepEqual([again.claimed, again.written, again.rewritten], [0, 0, 0], "a second tick writes nothing more");
    // The job never runs here: withdrawn, so a runner beside this suite sends nothing.
    ok(await db.from("jobs").update({ state: "canceled" }).eq("tenant_id", A).eq("kind", "outbound_send"));
  },
);

test(
  "a claim a dead tick left after writing its email, in a run canceled since: withdrawn, adopted, then skipped, through the guards",
  { skip },
  async () => {
    const { reachOutClock } = await import(at("apps/edge/lib/reach-out/clock.ts"));
    const root = await chain(A);
    // One of the mailboxes the cases above connected.
    const [{ id: dom }] = ok(
      await db.from("mailbox_connections").select("id").eq("tenant_id", A).eq("state", "connected").limit(1),
    );
    const runId = await run(A, root, "2026-09-26");
    const [lead] = await leads(A, 1);
    const [sendId] = await planned(A, runId, root, dom, [lead], Date.now() - 10 * MIN);
    // The dead tick: claimed six minutes ago, its email written, then nothing.
    ok(
      await db
        .from("sequence_sends")
        .update({ state: "claimed", claimed_at: iso(Date.now() - 6 * MIN) })
        .eq("id", sendId),
    );
    const person = await one(
      db.from("contacts").insert({ tenant_id: A, email: `dead-${stamp}@fixture-sender.example` }),
    );
    const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: person }));
    const id = await sendMessageId(sendId, 0);
    ok(
      await db.from("messages").insert({
        id,
        tenant_id: A,
        conversation_id: thread,
        contact_id: person,
        channel: "email",
        direction: "outbound",
        sender: "human",
        type: "text",
        body: "Saw your shop on the map.",
        status: "queued",
        meta: { source: "reach_out", email: { request: { to: [`dead-${stamp}@fixture-sender.example`] } } },
      }),
    );
    // The owner cancels the run.
    ok(await db.from("sequence_batches").update({ state: "canceled" }).eq("id", runId));

    const lane = {
      unsubscribeSecret: "unsubscribe-seal-for-this-suite",
      unsubscribeOrigin: "https://app.chanlytics.com",
    };
    const L = log({ suite: "reach_out_sender" });
    const out = await claimAndWrite({ db, now: new Date(), started: Date.now(), lane, log: L, tenantId: A });
    assert.equal(out.rewritten, 1);
    const m = ok(await db.from("messages").select("status, error").eq("id", id).single());
    assert.deepEqual([m.status, m.error], ["canceled", { reason: "run_canceled" }], "withdrawn: its job sends nothing");
    const adopted = ok(await db.from("sequence_sends").select("state, message_id").eq("id", sendId).single());
    assert.deepEqual([adopted.state, adopted.message_id], ["queued", id], "adopted: the send is its email's");
    const jobs = ok(await db.from("jobs").select("id").eq("tenant_id", A).eq("payload->>message_id", id));
    assert.equal(jobs.length, 0, "no job for a withdrawn email");

    await reachOutClock(db, new Date(), L, Date.now(), A);
    const done = ok(await db.from("sequence_sends").select("state, reason").eq("id", sendId).single());
    assert.deepEqual([done.state, done.reason], ["skipped", "run_canceled"]);
  },
);

test(
  "a checked send's opening is its email's; words changed since its check send it back to be checked (R5)",
  { skip },
  async () => {
    const words = { subject: "A quote for {{business}}", body: "{{opening}}\n\nHi {{business}}." };
    const tpl = await one(
      db.from("templates").insert({
        tenant_id: A,
        channel: "email",
        source: "chanlytics",
        name: `reach_opening_${stamp}`,
        language: "en",
        category: "marketing",
        meta_status: "approved",
        components: [
          { type: "HEADER", format: "TEXT", text: words.subject },
          { type: "BODY", text: words.body },
        ],
      }),
    );
    const root = await chain(A, "running", tpl);
    const [{ id: dom }] = ok(
      await db.from("mailbox_connections").select("id").eq("tenant_id", A).eq("state", "connected").limit(1),
    );
    const runId = await run(A, root, "2026-09-27");
    const [lead, stale] = await leads(A, 2);
    const [written] = await planned(A, runId, root, dom, [lead], Date.now() - MIN, {
      checked_words: checkedWordsOf(words, null, false),
      opening: "A 4.9 from 16 reviews says people find you.",
    });
    const [again] = await planned(A, runId, root, dom, [stale], Date.now() - 2 * MIN, {
      checked_words: checkedWordsOf({ ...words, body: "Older words." }, null, false),
      opening: "Saw your shop.",
      check_gen: 3,
    });
    const lane = {
      unsubscribeSecret: "unsubscribe-seal-for-this-suite",
      unsubscribeOrigin: "https://app.chanlytics.com",
    };
    const out = await claimAndWrite({
      db,
      now: new Date(),
      started: Date.now(),
      lane,
      log: log({ suite: "reach_out_sender" }),
      tenantId: A,
    });
    assert.deepEqual([out.written, out.rechecked], [1, 1]);
    const m = ok(
      await db
        .from("messages")
        .select("body")
        .eq("id", await sendMessageId(written, 0))
        .single(),
    );
    assert.match(m.body, /^A 4\.9 from 16 reviews says people find you\.\n\nHi Fixture Movers \d+\.$/);
    const back = ok(
      await db
        .from("sequence_sends")
        .select("*, broadcast_id:batch_id, playbook_id:step_id, root_id:sequence_id")
        .eq("id", again)
        .single(),
    );
    assert.deepEqual(
      [back.state, back.checked_at, back.check_gen, back.opening, back.claimed_at],
      ["planned", null, 4, null, null],
      "unchecked at the next version, through the guard's claimed -> planned",
    );
    ok(await db.from("jobs").update({ state: "canceled" }).eq("tenant_id", A).eq("kind", "outbound_send"));
  },
);

test(
  "their preview (decision 0079): one being made holds the send and is asked for once the switch is on; an open one goes with it; a failed one skips it",
  { skip },
  async () => {
    // Only a workspace of ours makes previews (00497 preview_make).
    const C = await one(
      db
        .from("tenants")
        .insert({ slug: `sender-c-${stamp}`, name: "Chanlytics", timezone: "America/Chicago", ours: true }),
    );
    try {
      ok(
        await db.from("tenant_config").upsert({
          tenant_id: C,
          config: {
            brain: {
              business_name: "Chanlytics",
              system_prompt: "You answer for Chanlytics, which sets up receptionists for businesses in Austin.",
              fallbacks: { greeting: "g", error: "e", non_text: "n" },
              profile: { address: "100 Example St, Austin, TX 78701" },
            },
          },
        }),
      );
      const words = {
        subject: "Your receptionist, {{business}}",
        body: "Hi {{business}}, here it is: {{their preview}}",
      };
      const tpl = await one(
        db.from("templates").insert({
          tenant_id: C,
          channel: "email",
          source: "chanlytics",
          name: `reach_sender_preview_${stamp}`,
          language: "en",
          category: "marketing",
          meta_status: "approved",
          components: [
            { type: "HEADER", format: "TEXT", text: words.subject },
            { type: "BODY", text: words.body },
          ],
        }),
      );
      const root = await chain(C, "running", tpl);
      const dom = await mailbox(C);
      const runId = await one(
        db.from("sequence_batches").insert({
          tenant_id: C,
          name: "Movers · 2026-09-27",
          template_id: tpl,
          template_name: `reach_sender_preview_${stamp}`,
          template_language: "en",
          audience: { kind: "reach_out", root_id: root, step_id: root, search_id: search },
          state: "scheduled",
          scheduled_for: iso(Date.now()),
          step_id: root,
          run_for: "2026-09-27",
        }),
      );
      const [none, open, failed] = await leads(C, 3);
      const madeFor = async (lead) =>
        ok(
          await db.rpc("preview_make", {
            p_tenant_id: C,
            p_lead_id: lead,
            p_name: "Fixture Movers",
            p_timezone: "America/Chicago",
          }),
        );
      const opened = await madeFor(open);
      ok(await db.rpc("preview_built", { p_id: opened.id, p_ok: true, p_why: null }));
      const broke = await madeFor(failed);
      ok(await db.rpc("preview_built", { p_id: broke.id, p_ok: false, p_why: "build_failed" }));
      const sends = await planned(C, runId, root, dom, [none, open, failed], Date.now() - MIN, {
        checked_words: checkedWordsOf(words, null, false),
      });
      const lane = {
        unsubscribeSecret: "unsubscribe-seal-for-this-suite",
        unsubscribeOrigin: "https://app.chanlytics.com",
      };
      const L = log({ suite: "reach_out_sender" });
      const stateOf = async (id) => ok(await db.from("sequence_sends").select("state, reason").eq("id", id).single());

      // The switch off: the send that needs one is held, and nothing is made.
      const was = process.env.LEAD_PREVIEWS;
      delete process.env.LEAD_PREVIEWS;
      try {
        const out = await claimAndWrite({ db, now: new Date(), started: Date.now(), lane, log: L, tenantId: C });
        assert.deepEqual([out.claimed, out.written, out.held, out.skipped], [3, 1, 1, 1]);
      } finally {
        if (was === undefined) delete process.env.LEAD_PREVIEWS;
        else process.env.LEAD_PREVIEWS = was;
      }
      assert.deepEqual(await stateOf(sends[0]), { state: "planned", reason: null }, "held: planned again, an hour on");
      assert.deepEqual(
        ok(await db.from("lead_previews").select("id").eq("tenant_id", C).eq("lead_id", none)),
        [],
        "switched off, none is made",
      );
      // The open one went with its link, and its thirty days start at this first email.
      assert.equal((await stateOf(sends[1])).state, "queued");
      const sent = ok(await db.from("sequence_sends").select("message_id").eq("id", sends[1]).single());
      const m = ok(await db.from("messages").select("body").eq("id", sent.message_id).single());
      assert.ok(m.body.includes(`/preview/${opened.token}`), m.body);
      const row = ok(await db.from("lead_previews").select("first_sent_at").eq("id", opened.id).single());
      assert.ok(row.first_sent_at, "stamped as sent");
      // The failed one is no link to send: skipped, and its lead's story says why.
      assert.deepEqual(await stateOf(sends[2]), { state: "skipped", reason: "no_preview" });

      // The switch on: the held send, due again, asks for the lead's preview, whose build is scheduled once.
      process.env.LEAD_PREVIEWS = "on";
      try {
        ok(
          await db
            .from("sequence_sends")
            .update({ send_at: iso(Date.now() - MIN) })
            .eq("id", sends[0]),
        );
        const out = await claimAndWrite({ db, now: new Date(), started: Date.now(), lane, log: L, tenantId: C });
        assert.deepEqual([out.claimed, out.held], [1, 1]);
      } finally {
        if (was === undefined) delete process.env.LEAD_PREVIEWS;
        else process.env.LEAD_PREVIEWS = was;
      }
      const made = ok(await db.from("lead_previews").select("id, state").eq("tenant_id", C).eq("lead_id", none));
      assert.deepEqual(
        made.map((p) => p.state),
        ["building"],
      );
      const builds = ok(await db.from("jobs").select("kind, payload").eq("tenant_id", C).eq("kind", "preview_build"));
      assert.deepEqual(
        builds.map((j) => j.payload.preview_id),
        [made[0].id],
      );
      // Nothing here runs: the email's job and the build, withdrawn, so a runner beside this suite does neither.
      ok(await db.from("jobs").update({ state: "canceled" }).eq("tenant_id", C));
    } finally {
      ok(await db.from("tenants").delete().eq("id", C));
    }
  },
);
