/**
 * A sequence is approved once, then held (decision 0064, 00462 and 00463), against the replayed database: a new sequence
 * takes its class's row as its mode (never Send it to leads), a step's words are new until a person lets a batch of them
 * go and new again when its message or the message's words change, the change door sets a sequence's mode on a member's
 * own rights and refuses what a sequence does not take, the hourly page carries each step's mode, a held reply's bell row
 * closes once the reply leaves the queue, each sequence's evidence counts what its batches did, Reports' wait for your OK
 * counts the runs skipped unanswered, and a review's held reply keeps its time only beside its words.
 *
 * Runs against a local stack built from every migration. Never production: `supabase start`, then `pnpm test:db` with
 * its keys.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes sequences, batches and decisions"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

let db;
let tenantId;
let templateId;
let operator;
const users = [];

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `held-${Date.now()}`, name: "Held", timezone: "America/New_York" })
      .select("id")
      .single(),
  ).id;
  templateId = ok(
    await db
      .from("templates")
      .insert({
        tenant_id: tenantId,
        channel: "whatsapp",
        name: "winback_offer",
        language: "en_US",
        meta_status: "approved",
      })
      .select("id")
      .single(),
  ).id;
  const email = `held-op-${Date.now()}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role: "operator" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  operator = client;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** The workspace's row for a class (as provision_tenant seeds one, or as the owner set it). */
const classRow = async (cls, mode) =>
  ok(
    await db
      .from("policies")
      .upsert(
        { tenant_id: tenantId, class: cls, mode, limits: {} },
        { onConflict: "tenant_id,class,subject_type,subject_id" },
      ),
  );

/** A first step, as the service role writes one: its sequence is made with it (00440 sequence_steps_place). */
const firstStep = async (over = {}) =>
  ok(
    await db
      .from("sequence_steps")
      .insert({
        tenant_id: tenantId,
        name: `Win-back ${Math.random().toString(36).slice(2, 6)}`,
        trigger: "quiet_30",
        template_id: templateId,
        template_name: "winback_offer",
        template_language: "en_US",
        params: [],
        policy_class: "reengage",
        state: "running",
        run_hour: 10,
        cap_per_run: 25,
        gap_days: 90,
        cadence_days: 30,
        ...over,
      })
      .select("id, sequence_id, words_ok_at")
      .single(),
  );

const sequence = async (id) => ok(await db.from("sequences").select("mode, starts").eq("id", id).single());

test(
  "a new sequence takes its class's row as its mode, asks where the class has no row, and never sends on its own to leads",
  { skip },
  async () => {
    await classRow("reengage", "veto");
    const held = await firstStep();
    assert.equal(held.sequence_id, held.id, "a first step makes its sequence, with its id");
    assert.equal((await sequence(held.id)).mode, "veto");
    assert.equal(held.words_ok_at, null, "its words are new to the owner: its first batch asks");
    await classRow("campaign", "auto");
    const sends = await firstStep({ policy_class: "campaign", trigger: "everyone_monthly" });
    assert.equal((await sequence(sends.id)).mode, "auto");
    await db.from("policies").delete().eq("tenant_id", tenantId).eq("class", "follow_up");
    const unrowed = await firstStep({ policy_class: "follow_up", trigger: "proposal_waiting", name: "Follow-up" });
    assert.equal((await sequence(unrowed.id)).mode, "ask", "no row: ask, the fail-safe");
    // The class row is read as stored, through sequence_mode_for, which the service role alone may call.
    assert.equal(
      ok(await db.rpc("sequence_mode_for", { p_tenant_id: tenantId, p_class: "outreach", p_to_leads: true })),
      "veto",
    );
    await classRow("outreach", "auto");
    assert.equal(
      ok(await db.rpc("sequence_mode_for", { p_tenant_id: tenantId, p_class: "outreach", p_to_leads: true })),
      "ask",
      "never Send it to leads, whatever the row says",
    );
    const refused = await operator.rpc("sequence_mode_for", {
      p_tenant_id: tenantId,
      p_class: "reengage",
      p_to_leads: false,
    });
    assert.ok(refused.error, "a member does not call it");
    // A sequence to leads can never be auto, and a one-off has no mode: the table refuses both.
    const bad = await db.from("sequences").update({ mode: null }).eq("id", held.id);
    assert.equal(bad.error?.code, "23514", "a sequence that starts at a moment always has a mode");
  },
);

test(
  "a step's words are new until a person lets a batch of them go, and new again when its message or slots change, or its message's words change",
  { skip },
  async () => {
    await classRow("reengage", "auto");
    const s = await firstStep();
    const seen = new Date(Date.now() - 3_600_000).toISOString();
    ok(await db.from("sequence_steps").update({ words_ok_at: seen }).eq("id", s.id));
    // An hour, a cap or a name is no new word.
    ok(await db.from("sequence_steps").update({ run_hour: 11, cap_per_run: 30 }).eq("id", s.id));
    const kept = ok(await db.from("sequence_steps").select("words_ok_at").eq("id", s.id).single());
    assert.equal(Date.parse(kept.words_ok_at), Date.parse(seen), "the hour and the cap leave its words seen");
    // Its slots are its words.
    ok(
      await db
        .from("sequence_steps")
        .update({ params: [{ kind: "first_name" }] })
        .eq("id", s.id),
    );
    assert.equal(ok(await db.from("sequence_steps").select("words_ok_at").eq("id", s.id).single()).words_ok_at, null);
    // Its message's words changed in Messages: every step on it asks again.
    ok(await db.from("sequence_steps").update({ words_ok_at: seen }).eq("id", s.id));
    ok(
      await db
        .from("templates")
        .update({ body_preview: "We miss you, {{1}}. Come back this week." })
        .eq("id", templateId),
    );
    assert.equal(
      ok(await db.from("sequence_steps").select("words_ok_at").eq("id", s.id).single()).words_ok_at,
      null,
      "new words in Messages are new to the owner",
    );
  },
);

test(
  "the change door sets a sequence's mode on a member's own rights, answers what it was, and refuses what a sequence does not take",
  { skip },
  async () => {
    await classRow("reengage", "veto");
    const s = await firstStep();
    const changed = ok(
      await operator.rpc("change_playbook", { p_tenant_id: tenantId, p_playbook_id: s.id, p_set: { mode: "ask" } }),
    );
    assert.deepEqual(changed.was, { mode: "veto" });
    assert.ok(changed.decision_id, "on the ledger");
    assert.equal((await sequence(s.id)).mode, "ask");
    // The same mode again is nothing written and no line.
    const same = ok(
      await operator.rpc("change_playbook", { p_tenant_id: tenantId, p_playbook_id: s.id, p_set: { mode: "ask" } }),
    );
    assert.deepEqual([same.was, same.decision_id], [{}, null]);
    const odd = await operator.rpc("change_playbook", {
      p_tenant_id: tenantId,
      p_playbook_id: s.id,
      p_set: { mode: "never" },
    });
    assert.equal(odd.error?.code, "22023", odd.error?.message);
    // The trial is no key (00463).
    const trial = await operator.rpc("change_playbook", {
      p_tenant_id: tenantId,
      p_playbook_id: s.id,
      p_set: { trial_until: null },
    });
    assert.equal(trial.error?.code, "22023", "a key outside the nine is refused, never ignored");
    // A step to leads: held or asked, never sent on its own.
    await classRow("outreach", "veto");
    const leads = await firstStep({
      kind: "reach_out",
      policy_class: "outreach",
      trigger: "lead_first",
      template_id: null,
      template_name: null,
      template_language: null,
      name: "Movers",
    }).catch(() => null);
    if (leads) {
      const auto = await operator.rpc("change_playbook", {
        p_tenant_id: tenantId,
        p_playbook_id: leads.id,
        p_set: { mode: "auto" },
      });
      assert.equal(auto.error?.code, "23514", auto.error?.message);
    }
  },
);

test("the hourly page carries each due step's sequence's mode", { skip }, async () => {
  await classRow("reengage", "veto");
  const s = await firstStep({ run_hour: 9 });
  // 18:00 UTC is past nine and before the last hour on any American workspace's clock: the step is due.
  const page = ok(
    await db.rpc("sequence_steps_due", {
      p_kind: "moment",
      p_at: "2026-10-20T18:00:00Z",
      p_last_hour: 23,
      p_limit: 100,
      p_tenant_id: tenantId,
    }),
  );
  const mine = page.find((r) => r.step.id === s.id);
  assert.ok(mine, "the step is on the page");
  assert.equal(mine.step.mode, "veto");
});

test("each sequence's evidence: what its batches did, from its runs and its ledger", { skip }, async () => {
  await classRow("reengage", "ask");
  const s = await firstStep();
  const batch = async (state, over = {}) =>
    ok(
      await db
        .from("sequence_batches")
        .insert({
          tenant_id: tenantId,
          step_id: s.id,
          name: "Win-back",
          template_id: templateId,
          template_name: "winback_offer",
          template_language: "en_US",
          state,
          scheduled_for: new Date().toISOString(),
          recipient_count: 3,
          audience: { kind: "playbook", id: s.id, label: "Win-back" },
          ...over,
        })
        .select("id")
        .single(),
    ).id;
  const decide = (subject, verb, actor, payload = {}) =>
    db.from("decisions").insert({
      tenant_id: tenantId,
      subject_type: "broadcast",
      subject_id: subject,
      verb,
      actor_type: actor,
      actor_user_id: actor === "user" ? users[0] : null,
      payload,
    });
  const approved = await batch("sent");
  ok(await decide(approved, "send_broadcast", "user", { approved: true }));
  await batch("sent");
  const stopped = await batch("canceled");
  ok(await decide(stopped, "cancel_broadcast", "user", { was: "scheduled" }));
  const skipped = await batch("canceled");
  ok(await decide(skipped, "cancel_broadcast", "system", { reason: "day_passed" }));
  const rows = ok(await operator.rpc("sequence_evidence", { p_tenant_id: tenantId, p_days: 90 }));
  const mine = rows.find((r) => r.sequence_id === s.id);
  assert.deepEqual([mine.policy_class, mine.went, mine.approved, mine.stopped, mine.skipped], ["reengage", 2, 1, 1, 1]);
  // Reports' wait for your OK counts the runs skipped unanswered in its window.
  const ledger = ok(await operator.rpc("campaign_ledger", { p_tenant_id: tenantId, p_days: 30 }));
  assert.equal(ledger.approval.skipped, 1);
});

test(
  "a held reply's bell row closes once the reply leaves the queue and none of the receptionist's is left queued",
  { skip },
  async () => {
    const contact = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, phone_e164: `+1212555${String(Date.now()).slice(-4)}`, display_name: "Ana" })
        .select("id")
        .single(),
    ).id;
    const conversation = ok(
      await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contact }).select("id").single(),
    ).id;
    const queued = ok(
      await db
        .from("messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: conversation,
          contact_id: contact,
          direction: "outbound",
          sender: "ai",
          type: "text",
          body: "We open at 9.",
          status: "queued",
          channel: "whatsapp",
        })
        .select("id")
        .single(),
    ).id;
    const notice = ok(
      await db
        .from("notifications")
        .insert({
          tenant_id: tenantId,
          kind: "reply_held",
          title: "Reply to Ana goes at 2:05 PM",
          body: "x",
          subject_type: "conversation",
          subject_id: conversation,
        })
        .select("id")
        .single(),
    ).id;
    ok(await db.from("messages").update({ status: "sent" }).eq("id", queued));
    const closed = ok(await db.from("notifications").select("closed_at").eq("id", notice).single());
    assert.ok(closed.closed_at, "the reply went: nothing waits");
  },
);

test(
  "a review's held reply keeps its time only beside its words, and Reports' waiting list carries both",
  { skip },
  async () => {
    // A review hangs off its workspace's listing.
    ok(
      await db
        .from("google_listings")
        .upsert(
          { tenant_id: tenantId, place_id: "place-held-reply", name: "Harbor Salon" },
          { onConflict: "tenant_id" },
        ),
    );
    const review = ok(
      await db
        .from("google_reviews")
        .insert({ tenant_id: tenantId, review_id: `g-${Date.now()}`, origin: "profile", rating: 5, author: "Rosa" })
        .select("id")
        .single(),
    ).id;
    const lone = await db.from("google_reviews").update({ posts_at: new Date().toISOString() }).eq("id", review);
    assert.equal(lone.error?.code, "23514", "a time with no reply to post");
    const goes = new Date(Date.now() + 30 * 60_000).toISOString();
    ok(
      await db
        .from("google_reviews")
        .update({ draft_text: "Thank you, Rosa.", drafted_at: new Date().toISOString(), posts_at: goes })
        .eq("id", review),
    );
    // Reports' Reviews draws a waiting review from reviews_ledger (00462 section 12): its held reply and when it goes.
    const ledger = ok(await operator.rpc("reviews_ledger", { p_tenant_id: tenantId, p_days: 30 }));
    const waits = ledger.waiting.find((w) => w.id === review);
    assert.deepEqual([waits?.draft_text, Date.parse(waits?.posts_at)], ["Thank you, Rosa.", Date.parse(goes)]);
  },
);

test(
  "the trial is gone (00463): no column, and a new workspace's sequences start held for a stop",
  { skip },
  async () => {
    const cols = await db.from("sequence_steps").select("trial_until").limit(1);
    assert.ok(cols.error, "no trial_until column");
    const fresh = ok(
      await db
        .from("tenants")
        .insert({ slug: `held-new-${Date.now()}`, name: "Held new" })
        .select("id")
        .single(),
    ).id;
    try {
      ok(await db.rpc("provision_tenant", { p_tenant_id: fresh }));
      const rows = ok(await db.from("policies").select("class, mode").eq("tenant_id", fresh).is("subject_type", null));
      const modeOf = Object.fromEntries(rows.map((r) => [r.class, r.mode]));
      assert.deepEqual(
        [modeOf.reengage, modeOf.campaign, modeOf.follow_up, modeOf.outreach],
        ["veto", "veto", "veto", "veto"],
      );
    } finally {
      await db.from("tenants").delete().eq("id", fresh);
    }
  },
);
