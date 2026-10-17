/**
 * The Sequences loop review (17 Oct 2026) on a real Postgres (00453): a sequence keeps its people and its settings.
 *
 *   1. A customer's batch cut off (skipped, its day gone, failed) gives back the places it gave: a later step's people are
 *      in line again for it from the day their wait ended, and People says them in it, never "up next".
 *   2. A first step's batch cut off before it sent anyone takes away the place it made, and gives back the one a new start
 *      took them from.
 *   3. A first step's hour, cap, last day, trial and name reach the steps after it, on the member's own rights; a step given
 *      a name of its own keeps it; a step added later takes them from the first.
 *
 * Local stack only: it makes a workspace, a member, people, a template and steps with the service key, removes them after.
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
      ? "refusing a database that is not on this machine: this suite writes sequences and their sends"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

const stamp = Date.now();
const DAY = 86_400_000;
let db;
let tenantId;
let templateId;
let operator;
const users = [];
const people = {};

const wrote = (res, why) => {
  assert.equal(res.error, null, `${why ?? "the write"}: ${res.error?.message}`);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = wrote(
    await db
      .from("tenants")
      .insert({ slug: `sequence-loop-${stamp}`, name: "Harbor Studio", timezone: "America/New_York" })
      .select("id")
      .single(),
  ).id;
  templateId = wrote(
    await db
      .from("templates")
      .insert({
        tenant_id: tenantId,
        channel: "whatsapp",
        name: "come_back",
        language: "en_US",
        meta_status: "approved",
      })
      .select("id")
      .single(),
  ).id;
  for (const [key, phone] of [
    ["ana", "+15555550131"],
    ["bo", "+15555550132"],
    ["cy", "+15555550133"],
    ["di", "+15555550134"],
  ])
    people[key] = wrote(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, display_name: key, phone_e164: phone })
        .select("id")
        .single(),
    ).id;
  const email = `seq-loop-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  wrote(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role: "operator" }));
  operator = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await operator.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
});

after(async () => {
  if (skip || !db) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A customer's sequence: its first step on a moment, and steps after it with their waits, as the doors write them. */
async function sequenceWith(name, waits) {
  const root = wrote(
    await db
      .from("sequence_steps")
      .insert({
        tenant_id: tenantId,
        name,
        trigger: "quiet_30",
        template_id: templateId,
        template_name: "come_back",
        template_language: "en_US",
        policy_class: "reengage",
        run_hour: 10,
        cap_per_run: 25,
      })
      .select("id")
      .single(),
    "the first step",
  ).id;
  const ids = [root];
  for (const days of waits)
    ids.push(
      wrote(
        await db
          .from("sequence_steps")
          .insert({
            tenant_id: tenantId,
            name,
            trigger: "after_step",
            after_step_id: ids.at(-1),
            after_days: days,
            template_id: templateId,
            template_name: "come_back",
            template_language: "en_US",
            policy_class: "reengage",
            run_hour: 10,
            cap_per_run: 25,
          })
          .select("id")
          .single(),
        "a step after the first",
      ).id,
    );
  return ids;
}

/** Each batch its own business day: a step makes one batch a day (sequence_batches_step_run). */
let days = 0;

/** A batch of a step, waiting for an OK, with a queued send to each person named. */
async function batchFor(stepId, who) {
  days += 1;
  const id = wrote(
    await db
      .from("sequence_batches")
      .insert({
        tenant_id: tenantId,
        name: "a day's batch",
        template_id: templateId,
        template_name: "come_back",
        template_language: "en_US",
        state: "pending_approval",
        scheduled_for: new Date().toISOString(),
        step_id: stepId,
        run_for: new Date(Date.UTC(2026, 8, 1) + days * DAY).toISOString().slice(0, 10),
        audience: { kind: "playbook", trigger: "quiet_30" },
      })
      .select("id")
      .single(),
    "the batch",
  ).id;
  wrote(
    await db
      .from("sequence_sends")
      .insert(who.map((contactId) => ({ batch_id: id, contact_id: contactId, tenant_id: tenantId }))),
  );
  return id;
}

/** A batch approved and its sends gone, at `sentAt`: its people move on to their next step's day. */
async function sentAll(batchId, sentAt) {
  wrote(await db.from("sequence_batches").update({ state: "scheduled" }).eq("id", batchId));
  wrote(await db.from("sequence_batches").update({ state: "sending" }).eq("id", batchId));
  wrote(await db.from("sequence_sends").update({ state: "sent", sent_at: sentAt }).eq("batch_id", batchId));
  wrote(await db.from("sequence_batches").update({ state: "sent" }).eq("id", batchId));
}

const placesOf = async (sequenceId, contactId) =>
  wrote(
    await db
      .from("sequence_enrollments")
      .select("state, place, why, next_at, sent_at")
      .eq("sequence_id", sequenceId)
      .eq("contact_id", contactId)
      .order("entered_at", { ascending: true }),
    "their places",
  );

test(
  "a later step's batch skipped puts its people back in line for it, from the day their wait ended; People says them in it",
  { skip },
  async () => {
    const [root, second] = await sequenceWith("Win back", [3]);
    const sentAt = new Date(Date.now() - 5 * DAY).toISOString();
    await sentAll(await batchFor(root, [people.ana]), sentAt);
    const waiting = await batchFor(second, [people.ana]);
    const [given] = await placesOf(root, people.ana);
    assert.deepEqual(
      [given.state, given.place, given.next_at],
      ["in", 2, null],
      "the batch gave them the step's place",
    );

    wrote(await db.from("sequence_batches").update({ state: "canceled" }).eq("id", waiting));
    const [back] = await placesOf(root, people.ana);
    assert.deepEqual([back.state, back.place], ["in", 1], "in line again for the step");
    assert.equal(Date.parse(back.next_at), Date.parse(sentAt) + 3 * DAY, "due from the day their wait ended");

    const inIt = wrote(await operator.rpc("sequence_people", { p_tenant_id: tenantId, p_sequence_id: root }));
    assert.equal(inIt.counts.next ?? 0, 0, "a send of a batch cut off is going nowhere: never up next");
    assert.deepEqual(
      inIt.rows.filter((r) => r.contact_id === people.ana).map((r) => [r.group, r.place]),
      [["in", 1]],
    );
    // Its due day is past, so the step's next run reaches them (00441 sequence_follow_ups_due).
    const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10);
    const due = wrote(await db.rpc("sequence_follow_ups_due", { p_step_id: second, p_run_for: tomorrow }));
    assert.deepEqual(
      due.map((d) => d.contact_id),
      [people.ana],
    );
  },
);

test(
  "a batch that failed gives back its places as a skipped one does; one already gone leaves them where they are",
  { skip },
  async () => {
    const [root, second] = await sequenceWith("Failed day", [2]);
    const sentAt = new Date(Date.now() - 3 * DAY).toISOString();
    await sentAll(await batchFor(root, [people.bo]), sentAt);
    const going = await batchFor(second, [people.bo]);
    wrote(await db.from("sequence_batches").update({ state: "scheduled" }).eq("id", going));
    wrote(await db.from("sequence_batches").update({ state: "sending" }).eq("id", going));
    wrote(await db.from("sequence_batches").update({ state: "failed" }).eq("id", going));
    const [back] = await placesOf(root, people.bo);
    assert.deepEqual([back.state, back.place, Date.parse(back.next_at)], ["in", 1, Date.parse(sentAt) + 2 * DAY]);
    const n = wrote(await db.rpc("sequence_batch_places_back", { p_batch_id: going }));
    assert.equal(n, 0, "asked again, nothing moves: the place stands");
  },
);

test(
  "a first step's batch skipped before it sent anyone takes away the place it made, and gives back the one a new start took them from",
  { skip },
  async () => {
    const [root, second] = await sequenceWith("Start again", [2, 5]);
    // Cy never heard from it: the skipped batch's place goes, nobody is left "in" it.
    wrote(
      await db
        .from("sequence_batches")
        .update({ state: "canceled" })
        .eq("id", await batchFor(root, [people.cy])),
    );
    assert.deepEqual(await placesOf(root, people.cy), [], "never in it");

    // Di is in it, at step 2, waiting for step 3, when the first step comes for them again and is skipped.
    const sentAt = new Date(Date.now() - 4 * DAY).toISOString();
    await sentAll(await batchFor(root, [people.di]), new Date(Date.now() - 8 * DAY).toISOString());
    await sentAll(await batchFor(second, [people.di]), sentAt);
    const again = await batchFor(root, [people.di]);
    const before = await placesOf(root, people.di);
    assert.deepEqual(
      before.map((e) => [e.state, e.why]),
      [
        ["left", "started_again"],
        ["in", null],
      ],
    );
    wrote(await db.from("sequence_batches").update({ state: "canceled" }).eq("id", again));
    const after = await placesOf(root, people.di);
    assert.equal(after.length, 1, "the new place goes");
    assert.deepEqual([after[0].state, after[0].why, after[0].place], ["in", null, 2], "the old one stands again");
    assert.equal(Date.parse(after[0].next_at), Date.parse(sentAt) + 5 * DAY, "with its own day");
  },
);

test(
  "a first step's hour, cap, last day, trial and name reach the steps after it; a step with a name of its own keeps it; a step added later takes them",
  { skip },
  async () => {
    const [root, second, third] = await sequenceWith("VIP color clients", [14, 7]);
    wrote(await db.from("sequence_steps").update({ name: "A name of its own" }).eq("id", third));
    wrote(
      await operator.rpc("change_playbook", {
        p_tenant_id: tenantId,
        p_playbook_id: root,
        p_set: {
          run_hour: 15,
          cap_per_run: 40,
          until: "2026-12-31",
          trial_until: "2026-10-31T00:00:00Z",
          name: "VIP regulars",
        },
        p_decision: { name: "VIP regulars" },
      }),
      "the change",
    );
    const steps = wrote(
      await db
        .from("sequence_steps")
        .select("id, name, run_hour, cap_per_run, until, trial_until")
        .eq("sequence_id", root)
        .order("place", { ascending: true }),
    );
    for (const s of steps) {
      assert.deepEqual(
        [s.run_hour, s.cap_per_run, s.until, Date.parse(s.trial_until)],
        [15, 40, "2026-12-31", Date.parse("2026-10-31T00:00:00Z")],
        `step ${s.id} runs on the first step's settings`,
      );
    }
    assert.deepEqual(
      steps.map((s) => s.name),
      ["VIP regulars", "VIP regulars", "A name of its own"],
    );
    assert.equal(steps[1].id, second);

    const added = wrote(
      await operator.rpc("sequence_step_save", {
        p_tenant_id: tenantId,
        p_sequence_id: root,
        p_step: { after_days: 3, template_id: templateId, only_if: [] },
      }),
      "the step added",
    );
    const step = wrote(
      await db
        .from("sequence_steps")
        .select("name, run_hour, cap_per_run, until, trial_until")
        .eq("id", added.id)
        .single(),
    );
    assert.deepEqual(
      [step.name, step.run_hour, step.cap_per_run, step.until, Date.parse(step.trial_until)],
      ["VIP regulars", 15, 40, "2026-12-31", Date.parse("2026-10-31T00:00:00Z")],
    );
  },
);
