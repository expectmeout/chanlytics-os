/**
 * Decision 0060 on a real Postgres (00439, 00440): one storage for every sequence, and the loop's own reads and door.
 *
 *   1. A first step made through the old name makes its sequence with its id; a step after it joins it one place on; the
 *      sequence says the first step's name and state; a step stays in its sequence and its place.
 *   2. A customer's step after the first (D6): some days after the one before, only if they have not booked or written
 *      back; a sequence to leads keeps its own shape; nothing but a customer's step after the first says only_if.
 *   3. Someone in a sequence moves with their sends: a first step's send enters them, its going on schedules the next step
 *      by its wait, the last step's makes them done, and a send gone nowhere takes them out with its reason.
 *   4. Who a step after the first is due to on a day is the database's (sequence_follow_ups_due), and only while the
 *      sequence is on (sequence_steps_due).
 *   5. The leave door takes people out, with why, and skips a send of theirs not yet gone.
 *   6. New words wait for WhatsApp: the step keeps its message until WhatsApp approves the new one, which then takes its
 *      place.
 *
 * Local stack only: it makes a workspace, people, a template and steps with the service key and removes them after.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes sequences and their sends"
      : false;

const DAY = 86_400_000;
let db;
let tenantId;
let templateId;
const people = {};

const ok = (res, why) => {
  assert.equal(res.error, null, `${why ?? "the write"}: ${res.error?.message}`);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `sequences-${Date.now()}`, name: "Harbor Studio", timezone: "America/New_York" })
      .select("id")
      .single(),
  ).id;
  templateId = ok(
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
    ["ana", "+15555550111"],
    ["bo", "+15555550112"],
    ["cy", "+15555550113"],
  ])
    people[key] = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, display_name: key, phone_e164: phone })
        .select("id")
        .single(),
    ).id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

/** A moment's first step on the old name, as the composers still write one. */
const firstStep = async (over = {}) =>
  ok(
    await db
      .from("playbooks")
      .insert({
        tenant_id: tenantId,
        name: "Win-back",
        trigger: "quiet_30",
        template_id: templateId,
        template_name: "come_back",
        template_language: "en_US",
        policy_class: "reengage",
        ...over,
      })
      .select("id")
      .single(),
    "the first step",
  ).id;

/** A customer's step after the first, on the new table. */
const laterStep = (after, over = {}) =>
  db
    .from("sequence_steps")
    .insert({
      tenant_id: tenantId,
      name: "Win-back, a nudge",
      trigger: "after_step",
      after_step_id: after,
      after_days: 3,
      only_if: ["no_booking"],
      template_id: templateId,
      template_name: "come_back",
      template_language: "en_US",
      policy_class: "reengage",
      ...over,
    })
    .select("id, sequence_id, place")
    .single();

/** A batch of a step for a day, as the sweep's run writes one. */
const batchOf = async (stepId, runFor) =>
  ok(
    await db
      .from("broadcasts")
      .insert({
        tenant_id: tenantId,
        name: `run ${runFor}`,
        template_id: templateId,
        template_name: "come_back",
        template_language: "en_US",
        state: "sending",
        scheduled_for: new Date().toISOString(),
        playbook_id: stepId,
        run_for: runFor,
      })
      .select("id")
      .single(),
    "the batch",
  ).id;

/** A customer's send on a batch, written through the old name as assemble_broadcast writes one. */
const sendTo = async (batchId, contactId) => {
  ok(
    await db.from("broadcast_recipients").insert({ broadcast_id: batchId, contact_id: contactId, tenant_id: tenantId }),
    "the send",
  );
};

const enrollmentOf = async (sequenceId, contactId) =>
  ok(
    await db
      .from("sequence_enrollments")
      .select("id, state, place, why, sent_at, next_at")
      .eq("sequence_id", sequenceId)
      .eq("contact_id", contactId)
      .order("entered_at", { ascending: false })
      .limit(1)
      .single(),
    "the enrollment",
  );

test(
  "a first step makes its sequence with its id; a step after it joins it, one place on; the sequence says the first step's name and state",
  { skip },
  async () => {
    const root = await firstStep();
    const seq = ok(await db.from("sequences").select("id, name, starts, state").eq("id", root).single());
    assert.deepEqual(seq, { id: root, name: "Win-back", starts: "moment", state: "on" });
    const next = ok(await laterStep(root), "the step after");
    assert.deepEqual([next.sequence_id, next.place], [root, 2]);

    ok(await db.from("playbooks").update({ name: "Win-back, autumn", state: "paused" }).eq("id", root));
    assert.deepEqual(ok(await db.from("sequences").select("name, state").eq("id", root).single()), {
      name: "Win-back, autumn",
      state: "paused",
    });
    const moved = await db.from("sequence_steps").update({ place: 3 }).eq("id", next.id);
    assert.match(moved.error?.message ?? "", /stays in its sequence and its place/);
    ok(await db.from("sequence_steps").delete().eq("id", next.id));
    ok(await db.from("playbooks").delete().eq("id", root));
    assert.equal(
      ok(await db.from("sequences").select("id").eq("id", root)).length,
      0,
      "a sequence that never ran goes",
    );
  },
);

test(
  "a customer's step after the first waits one to ninety days and says what must still hold; a lead's keeps its own shape",
  { skip },
  async () => {
    const root = await firstStep({ name: "Shape" });
    for (const [over, why] of [
      [{ after_days: 0 }, "no wait at all"],
      [{ after_days: 91 }, "past ninety days"],
      [{ only_if: ["no_visit"] }, "a condition nobody wrote"],
      [{ after_step_id: null }, "after no step"],
      [{ policy_class: "outreach" }, "under a lead's class"],
    ]) {
      const r = await laterStep(root, over);
      assert.ok(r.error, `refused: ${why}`);
      assert.match(r.error.message, /sequence_steps_(shape|only_if_check)|violates/, why);
    }
    const onRoot = await db
      .from("sequence_steps")
      .update({ only_if: ["no_booking"] })
      .eq("id", root);
    assert.match(onRoot.error?.message ?? "", /sequence_steps_only_if_check/, "a first step goes on its moment alone");
    ok(await db.from("playbooks").delete().eq("id", root));
  },
);

test(
  "someone moves with their sends: entered by the first step's, the next step scheduled by its wait, done after the last, out on a send gone nowhere",
  { skip },
  async () => {
    const root = await firstStep({ name: "Moves" });
    const next = ok(await laterStep(root, { after_days: 4 })).id;
    const b1 = await batchOf(root, "2026-10-01");
    await sendTo(b1, people.ana);
    await sendTo(b1, people.bo);
    let ana = await enrollmentOf(root, people.ana);
    assert.deepEqual([ana.state, ana.place, ana.next_at], ["in", 1, null], "entered at the first step");

    const sentAt = "2026-10-01T14:00:00.000Z";
    ok(
      await db
        .from("broadcast_recipients")
        .update({ state: "sent", sent_at: sentAt })
        .eq("broadcast_id", b1)
        .eq("contact_id", people.ana),
    );
    ana = await enrollmentOf(root, people.ana);
    assert.equal(ana.state, "in");
    assert.equal(Date.parse(ana.sent_at), Date.parse(sentAt));
    assert.equal(Date.parse(ana.next_at), Date.parse(sentAt) + 4 * DAY, "the next step, four days on");

    ok(
      await db
        .from("broadcast_recipients")
        .update({ state: "skipped", reason: "no_consent" })
        .eq("broadcast_id", b1)
        .eq("contact_id", people.bo),
    );
    const bo = await enrollmentOf(root, people.bo);
    assert.deepEqual([bo.state, bo.why], ["left", "no_consent"], "out, with the send's reason");

    const b2 = await batchOf(next, "2026-10-05");
    await sendTo(b2, people.ana);
    ana = await enrollmentOf(root, people.ana);
    assert.deepEqual([ana.state, ana.place, ana.next_at], ["in", 2, null], "at the step after");
    ok(
      await db
        .from("broadcast_recipients")
        .update({ state: "sent", sent_at: "2026-10-05T14:00:00.000Z" })
        .eq("broadcast_id", b2)
        .eq("contact_id", people.ana),
    );
    ana = await enrollmentOf(root, people.ana);
    assert.deepEqual([ana.state, ana.place], ["done", 2], "the last step went: done");

    // A first step's send of a new occasion enters them again; the one before stays done.
    const b3 = await batchOf(root, "2026-12-01");
    await sendTo(b3, people.ana);
    const all = ok(
      await db.from("sequence_enrollments").select("state").eq("sequence_id", root).eq("contact_id", people.ana),
    );
    assert.deepEqual(all.map((e) => e.state).sort(), ["done", "in"]);
  },
);

test(
  "who a step after the first is due to is the database's, by the business's day, and only while its sequence is on",
  { skip },
  async () => {
    const root = await firstStep({ name: "Due" });
    const next = ok(await laterStep(root, { after_days: 3 })).id;
    const b1 = await batchOf(root, "2026-10-01");
    await sendTo(b1, people.cy);
    ok(
      await db
        .from("broadcast_recipients")
        .update({ state: "sent", sent_at: "2026-10-01T22:30:00.000Z" })
        .eq("broadcast_id", b1)
        .eq("contact_id", people.cy),
    );
    const due = async (day) => ok(await db.rpc("sequence_follow_ups_due", { p_step_id: next, p_run_for: day }));
    // Sent at 6:30 PM in New York on the 1st: due on the 4th by the business's day, not the 3rd.
    assert.equal((await due("2026-10-03")).length, 0);
    const [d] = await due("2026-10-04");
    assert.equal(d.contact_id, people.cy);
    assert.equal(Date.parse(d.sent_at), Date.parse("2026-10-01T22:30:00.000Z"));

    const at = "2026-10-04T14:30:00.000Z"; // 10:30 in New York
    const dueSteps = async () =>
      ok(
        await db.rpc("sequence_steps_due", {
          p_kind: "moment",
          p_at: at,
          p_last_hour: 20,
          p_limit: 100,
          p_tenant_id: tenantId,
        }),
      ).map((r) => r.step.id);
    assert.ok((await dueSteps()).includes(next), "due while its sequence is on");
    ok(await db.from("playbooks").update({ state: "paused" }).eq("id", root));
    assert.ok(!(await dueSteps()).includes(next), "never while its first step is paused");
  },
);

test(
  "the leave door takes people out with why, skips a send of theirs not yet gone, and touches no one else",
  { skip },
  async () => {
    const root = await firstStep({ name: "Leave" });
    const b1 = await batchOf(root, "2026-10-02");
    await sendTo(b1, people.ana);
    await sendTo(b1, people.bo);
    const ana = await enrollmentOf(root, people.ana);
    const left = ok(
      await db.rpc("sequence_enrollments_leave", { p_tenant_id: tenantId, p_ids: [ana.id], p_why: "removed" }),
    );
    assert.equal(left, 1);
    assert.deepEqual(
      [(await enrollmentOf(root, people.ana)).state, (await enrollmentOf(root, people.ana)).why],
      ["left", "removed"],
    );
    const sends = ok(
      await db
        .from("broadcast_recipients")
        .select("contact_id, state, reason")
        .eq("broadcast_id", b1)
        .order("contact_id"),
    );
    const byPerson = Object.fromEntries(sends.map((s) => [s.contact_id, [s.state, s.reason]]));
    assert.deepEqual(byPerson[people.ana], ["skipped", "removed"]);
    assert.deepEqual(byPerson[people.bo], ["queued", null], "nobody else is touched");
    assert.equal(
      ok(await db.rpc("sequence_enrollments_leave", { p_tenant_id: tenantId, p_ids: [ana.id], p_why: "removed" })),
      0,
      "out once",
    );
  },
);

test(
  "new words wait for WhatsApp: the step keeps its message until WhatsApp approves the new one, which then takes its place",
  { skip },
  async () => {
    const root = await firstStep({ name: "Words" });
    const fresh = ok(
      await db
        .from("templates")
        .insert({
          tenant_id: tenantId,
          channel: "whatsapp",
          name: "come_back_v2",
          language: "en_US",
          meta_status: "pending",
        })
        .select("id")
        .single(),
    ).id;
    ok(
      await db
        .from("sequence_steps")
        .update({ next_template_id: fresh, next_template_name: "come_back_v2", next_template_language: "en_US" })
        .eq("id", root),
    );
    const step = async () =>
      ok(await db.from("sequence_steps").select("template_name, next_template_name").eq("id", root).single());
    assert.deepEqual(
      await step(),
      { template_name: "come_back", next_template_name: "come_back_v2" },
      "still sends its own",
    );
    ok(await db.from("templates").update({ meta_status: "rejected" }).eq("id", fresh));
    assert.equal((await step()).template_name, "come_back", "a refusal changes nothing");
    ok(await db.from("templates").update({ meta_status: "approved" }).eq("id", fresh));
    assert.deepEqual(
      await step(),
      { template_name: "come_back_v2", next_template_name: null },
      "approved: they are its words",
    );
    const half = await db.from("sequence_steps").update({ next_template_name: "x" }).eq("id", root);
    assert.match(half.error?.message ?? "", /sequence_steps_next_words_whole/, "new words are whole or none");
  },
);
