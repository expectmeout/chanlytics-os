/**
 * Decision 0060 on a real Postgres (00442): a sequence is read and changed through its doors, on the member's own session.
 *
 *   1. The readers answer a member what the page draws, and a stranger nothing.
 *   2. A customer's step after the last is added under the first step's class, named as its message's row names it,
 *      and changed in place with what it held; the change_step decision rides with each; a viewer is refused.
 *   3. A step taken away goes with the steps after it, whoever waited for it is done, and a first step never goes.
 *   4. A step's message changes at once where WhatsApp approved it, and otherwise waits with its own values until it does.
 *   5. The leave door takes out only their places in the sequence named, with its decision.
 *   6. A batch is canceled through its door, only from the state it was read in; a member no longer writes its row.
 *
 * Local stack only: it makes two workspaces, members, people, templates and steps with the service key, removes them after.
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
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now();
let db;
let tenantId;
let otherTenant;
let templateId;
let operator;
let viewer;
let stranger;
const users = [];
const people = {};

const ok = (res, why) => {
  assert.equal(res.error, null, `${why ?? "the write"}: ${res.error?.message}`);
  return res.data;
};

async function memberClient(role, tenant) {
  const email = `seq-${role}-${stamp}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), "the membership");
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

const template = async (name, status) =>
  ok(
    await db
      .from("templates")
      .insert({ tenant_id: tenantId, channel: "whatsapp", name, language: "en_US", meta_status: status })
      .select("id")
      .single(),
    `the template ${name}`,
  ).id;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (slug) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `${slug}-${stamp}`, name: "Harbor Studio", timezone: "America/New_York" })
        .select("id")
        .single(),
    ).id;
  tenantId = await workspace("sequence-doors");
  otherTenant = await workspace("sequence-doors-other");
  templateId = await template("come_back", "approved");
  for (const [key, phone] of [
    ["ana", "+15555550121"],
    ["bo", "+15555550122"],
  ])
    people[key] = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, display_name: key, phone_e164: phone })
        .select("id")
        .single(),
    ).id;
  operator = await memberClient("operator", tenantId);
  viewer = await memberClient("viewer", tenantId);
  stranger = await memberClient("owner", otherTenant);
});

after(async () => {
  if (skip || !db) return;
  for (const t of [tenantId, otherTenant]) if (t) await db.from("tenants").delete().eq("id", t);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A moment's first step, as the composers write one: its id is its sequence's. */
const firstStep = async (name) =>
  ok(
    await db
      .from("playbooks")
      .insert({
        tenant_id: tenantId,
        name,
        trigger: "quiet_30",
        template_id: templateId,
        template_name: "come_back",
        template_language: "en_US",
        policy_class: "reengage",
      })
      .select("id")
      .single(),
    "the first step",
  ).id;

/** A batch of a step, in the state asked, with a send to each person named. */
const batchOf = async (stepId, state, who = []) => {
  const id = ok(
    await db
      .from("broadcasts")
      .insert({
        tenant_id: tenantId,
        name: `run ${state}`,
        template_id: templateId,
        template_name: "come_back",
        template_language: "en_US",
        state,
        scheduled_for: new Date().toISOString(),
        playbook_id: stepId,
        run_for: "2026-10-02",
      })
      .select("id")
      .single(),
    "the batch",
  ).id;
  for (const contactId of who)
    ok(await db.from("broadcast_recipients").insert({ broadcast_id: id, contact_id: contactId, tenant_id: tenantId }));
  return id;
};

const enrollmentOf = async (sequenceId, contactId) =>
  ok(
    await db
      .from("sequence_enrollments")
      .select("id, state, place, why")
      .eq("sequence_id", sequenceId)
      .eq("contact_id", contactId)
      .single(),
    "the enrollment",
  );

const addStep = (client, sequenceId, step) =>
  client.rpc("sequence_step_save", { p_tenant_id: tenantId, p_sequence_id: sequenceId, p_step: step });

const decisionOf = async (id) =>
  ok(await db.from("decisions").select("verb, subject_type, subject_id, actor_type, payload").eq("id", id).single());

test("the readers answer a member what the page draws, and a stranger nothing", { skip }, async () => {
  const root = await firstStep("Read me");
  await batchOf(root, "pending_approval", [people.ana]);
  const rows = ok(await operator.rpc("sequence_overview", { p_tenant_id: tenantId, p_sequence_id: root }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Read me");
  assert.equal(rows[0].needs.waiting, 1, "the batch waiting for an OK needs you");
  assert.deepEqual(
    ok(await operator.rpc("sequence_steps_of", { p_tenant_id: tenantId, p_sequence_id: root })).map((s) => s.place),
    [1],
  );
  const inIt = ok(await operator.rpc("sequence_people", { p_tenant_id: tenantId, p_sequence_id: root }));
  assert.equal(inIt.counts.waiting, 1);
  const history = ok(await operator.rpc("sequence_history", { p_tenant_id: tenantId, p_sequence_id: root }));
  assert.equal(history.batches.length, 1);

  const theirs = await stranger.rpc("sequence_overview", { p_tenant_id: tenantId, p_sequence_id: root });
  assert.deepEqual(theirs.error ? [] : theirs.data, [], "another workspace's member reads none of it");
});

test(
  "a step after the last joins under the first step's class, named as its message's row names it; a change says what it held; each writes change_step; a viewer is refused",
  { skip },
  async () => {
    const root = await firstStep("Add to me");
    const added = ok(
      await addStep(operator, root, {
        after_days: 4,
        template_id: templateId,
        template_name: "a forged name",
        only_if: ["no_reply"],
        params: [{ kind: "first_name" }],
      }),
      "the new step",
    );
    assert.equal(added.place, 2);
    assert.deepEqual(
      ok(
        await db
          .from("sequence_steps")
          .select("sequence_id, template_name, after_days, only_if, policy_class, trigger, params")
          .eq("id", added.id)
          .single(),
      ),
      {
        sequence_id: root,
        template_name: "come_back",
        after_days: 4,
        only_if: ["no_reply"],
        policy_class: "reengage",
        trigger: "after_step",
        params: [{ kind: "first_name" }],
      },
    );
    const made = await decisionOf(added.decision_id);
    assert.deepEqual(
      [made.verb, made.subject_type, made.subject_id, made.actor_type],
      ["change_step", "sequence", root, "user"],
    );
    assert.equal(made.payload.added, true);

    const changed = ok(await addStep(operator, root, { id: added.id, after_days: 7, only_if: [] }), "the change");
    assert.equal(changed.was.after_days, 4);
    assert.deepEqual(changed.was.only_if, ["no_reply"]);
    const now = ok(await db.from("sequence_steps").select("after_days, only_if").eq("id", added.id).single());
    assert.deepEqual(now, { after_days: 7, only_if: [] });

    const tooLong = await addStep(operator, root, { after_days: 120, template_id: templateId });
    assert.equal(tooLong.error?.code, "23514", "a wait past ninety days is not a step");
    const asViewer = await addStep(viewer, root, { after_days: 3, template_id: templateId });
    assert.equal(asViewer.error?.code, "P0002", "a viewer changes nothing");
    const asStranger = await addStep(stranger, root, { after_days: 3, template_id: templateId });
    assert.equal(asStranger.error?.code, "P0002");
    const unknownWords = await addStep(operator, root, { after_days: 3, template_id: crypto.randomUUID() });
    assert.equal(unknownWords.error?.code, "P0002", "a message the workspace does not hold");
  },
);

test(
  "a step taken away goes with the steps after it, whoever waited for it is done, and a first step never goes",
  { skip },
  async () => {
    const root = await firstStep("Take from me");
    const second = ok(await addStep(operator, root, { after_days: 3, template_id: templateId }));
    ok(await addStep(operator, root, { after_days: 5, template_id: templateId }));
    await batchOf(root, "sending", [people.ana]);
    assert.equal((await enrollmentOf(root, people.ana)).state, "in");

    const gone = ok(await operator.rpc("sequence_step_remove", { p_tenant_id: tenantId, p_step_id: second.id }));
    assert.equal(gone.removed, 2);
    assert.deepEqual(
      ok(await db.from("sequence_steps").select("id").eq("sequence_id", root)).map((s) => s.id),
      [root],
    );
    assert.equal((await enrollmentOf(root, people.ana)).state, "done", "nothing is left for them to wait for");
    assert.equal((await decisionOf(gone.decision_id)).payload.removed, true);

    const first = await operator.rpc("sequence_step_remove", { p_tenant_id: tenantId, p_step_id: root });
    assert.equal(first.error?.code, "P0002", "the first step is the sequence");
  },
);

test(
  "a step's message changes at once where WhatsApp approved it, and otherwise waits with its own values until it does",
  { skip },
  async () => {
    const root = await firstStep("New words");
    const ready = await template("come_back_ready", "approved");
    const atOnce = ok(
      await operator.rpc("sequence_step_words", {
        p_tenant_id: tenantId,
        p_step_id: root,
        p_template_id: ready,
        p_params: ["15% off"],
      }),
    );
    assert.equal(atOnce.waits, false);
    assert.equal(atOnce.was.template_name, "come_back");
    const step = async () =>
      ok(
        await db
          .from("sequence_steps")
          .select("template_name, params, next_template_name, next_params")
          .eq("id", root)
          .single(),
      );
    assert.deepEqual(await step(), {
      template_name: "come_back_ready",
      params: ["15% off"],
      next_template_name: null,
      next_params: null,
    });

    const pending = await template("come_back_pending", "pending");
    const waits = ok(
      await operator.rpc("sequence_step_words", {
        p_tenant_id: tenantId,
        p_step_id: root,
        p_template_id: pending,
        p_params: [{ kind: "first_name" }, "20% off"],
      }),
    );
    assert.equal(waits.waits, true);
    assert.deepEqual(await step(), {
      template_name: "come_back_ready",
      params: ["15% off"],
      next_template_name: "come_back_pending",
      next_params: [{ kind: "first_name" }, "20% off"],
    });
    ok(await db.from("templates").update({ meta_status: "approved" }).eq("id", pending));
    assert.deepEqual(await step(), {
      template_name: "come_back_pending",
      params: [{ kind: "first_name" }, "20% off"],
      next_template_name: null,
      next_params: null,
    });
  },
);

test("the leave door takes out only their places in the sequence named, with its decision", { skip }, async () => {
  const a = await firstStep("Leave A");
  const b = await firstStep("Leave B");
  await batchOf(a, "sending", [people.bo]);
  await batchOf(b, "sending", [people.bo]);
  const inA = await enrollmentOf(a, people.bo);
  const inB = await enrollmentOf(b, people.bo);

  const elsewhere = await operator.rpc("sequence_leave", {
    p_tenant_id: tenantId,
    p_sequence_id: a,
    p_enrollment_ids: [inB.id],
  });
  assert.equal(elsewhere.error?.code, "P0002", "a place in another sequence is nobody here");

  const left = ok(
    await operator.rpc("sequence_leave", {
      p_tenant_id: tenantId,
      p_sequence_id: a,
      p_enrollment_ids: [inA.id, inB.id],
    }),
  );
  assert.equal(left.left, 1);
  assert.deepEqual(
    [(await enrollmentOf(a, people.bo)).state, (await enrollmentOf(a, people.bo)).why],
    ["left", "removed"],
  );
  assert.equal((await enrollmentOf(b, people.bo)).state, "in", "their place in B stays");
  const d = await decisionOf(left.decision_id);
  assert.deepEqual([d.verb, d.subject_id, d.payload.left], ["leave_sequence", a, 1]);

  const asViewer = await viewer.rpc("sequence_leave", {
    p_tenant_id: tenantId,
    p_sequence_id: b,
    p_enrollment_ids: [inB.id],
  });
  assert.equal(asViewer.error?.code, "P0002");
});

test(
  "a leave is undone (00450): each place comes back with its next step; the sends it skipped stay skipped, and are counted",
  { skip },
  async () => {
    const sendOf = async (batch, contactId) =>
      ok(await db.from("sequence_sends").select("state").eq("batch_id", batch).eq("contact_id", contactId).single());
    const seq = await firstStep("Put back");
    const waits = await batchOf(seq, "scheduled", [people.ana, people.bo]);
    const ana = await enrollmentOf(seq, people.ana);
    const bo = await enrollmentOf(seq, people.bo);

    const left = ok(
      await operator.rpc("sequence_leave", {
        p_tenant_id: tenantId,
        p_sequence_id: seq,
        p_enrollment_ids: [ana.id, bo.id],
      }),
    );
    assert.equal(left.left, 2);
    const kept = (await decisionOf(left.decision_id)).payload.put_back;
    assert.deepEqual([kept.why, kept.places.length, kept.sends], ["removed", 2, 2], "each place it ended, kept");

    const asViewer = await viewer.rpc("sequence_return", {
      p_tenant_id: tenantId,
      p_sequence_id: seq,
      p_undo_of: left.decision_id,
    });
    assert.equal(asViewer.error?.code, "P0002");

    const back = ok(
      await operator.rpc("sequence_return", { p_tenant_id: tenantId, p_sequence_id: seq, p_undo_of: left.decision_id }),
    );
    assert.deepEqual([back.back, back.sends_out], [2, 2]);
    assert.deepEqual(
      [(await enrollmentOf(seq, people.ana)).state, (await enrollmentOf(seq, people.bo)).state],
      ["in", "in"],
    );
    assert.deepEqual(
      [(await sendOf(waits, people.ana)).state, (await sendOf(waits, people.bo)).state],
      ["skipped", "skipped"],
      "a skipped send is final: the batch goes without them",
    );
    const d = ok(
      await db.from("decisions").select("verb, subject_id, undo_of, payload").eq("id", back.decision_id).single(),
    );
    assert.deepEqual(
      [d.verb, d.subject_id, d.undo_of, d.payload.back],
      ["return_to_sequence", seq, left.decision_id, 2],
    );

    const again = ok(
      await operator.rpc("sequence_return", { p_tenant_id: tenantId, p_sequence_id: seq, p_undo_of: left.decision_id }),
    );
    assert.deepEqual([again.back, again.sends_out], [0, 0], "nothing is put back twice");
    const notALeave = await operator.rpc("sequence_return", {
      p_tenant_id: tenantId,
      p_sequence_id: seq,
      p_undo_of: back.decision_id,
    });
    assert.equal(notALeave.error?.code, "P0002", "only a leave of this sequence is undone");
  },
);

test(
  "a batch is canceled through its door, only from the state it was read in; a member no longer writes its row",
  { skip },
  async () => {
    const root = await firstStep("Cancel me");
    const batch = await batchOf(root, "pending_approval");
    const direct = await operator.from("sequence_batches").update({ state: "canceled" }).eq("id", batch).select("id");
    assert.ok(direct.error || (direct.data ?? []).length === 0, "the row is the door's to write");

    const stale = ok(
      await operator.rpc("sequence_batch_cancel", { p_tenant_id: tenantId, p_batch_id: batch, p_from: "scheduled" }),
    );
    assert.equal(stale, false, "read in another state: nothing moves");
    const moved = ok(
      await operator.rpc("sequence_batch_cancel", {
        p_tenant_id: tenantId,
        p_batch_id: batch,
        p_from: "pending_approval",
      }),
    );
    assert.equal(moved, true);
    assert.equal(ok(await db.from("sequence_batches").select("state").eq("id", batch).single()).state, "canceled");
    const asViewer = await viewer.rpc("sequence_batch_cancel", {
      p_tenant_id: tenantId,
      p_batch_id: batch,
      p_from: "canceled",
    });
    assert.equal(asViewer.error?.code, "P0002");
  },
);

test(
  "a new sequence is made whole as a draft that sends nothing, starts on its first step, and goes whole while it never sent",
  { skip },
  async () => {
    const first = {
      name: "First-visit welcome",
      trigger: "visited",
      template_id: templateId,
      // What the body names its message is never the row's: the door names it from the row.
      template_name: "not_its_name",
      params: [],
      policy_class: "booking",
      run_hour: 10,
      cap_per_run: 25,
      channels: ["whatsapp"],
    };
    const then = [{ after_days: 28, only_if: ["no_booking"], template_id: templateId, name: "Come back" }];
    const asViewer = await viewer.rpc("sequence_create", { p_tenant_id: tenantId, p_first: first, p_then: then });
    assert.equal(asViewer.error?.code, "P0002", "a viewer makes nothing");
    const leads = await operator.rpc("sequence_create", {
      p_tenant_id: tenantId,
      p_first: { ...first, trigger: "lead_first" },
    });
    assert.equal(leads.error?.code, "23514", "a sequence to leads is the search's to make");

    const made = ok(
      await operator.rpc("sequence_create", { p_tenant_id: tenantId, p_first: first, p_then: then, p_start: false }),
    );
    assert.deepEqual([made.steps, made.state], [2, "draft"]);
    const q = ok(await db.from("sequences").select("state, name, starts").eq("id", made.id).single());
    assert.deepEqual([q.state, q.name, q.starts], ["draft", "First-visit welcome", "moment"]);
    const steps = ok(
      await db
        .from("sequence_steps")
        .select("id, place, state, template_name, after_days, only_if, policy_class, run_hour, name")
        .eq("sequence_id", made.id)
        .order("place"),
    );
    assert.deepEqual(
      steps.map((s) => [s.place, s.template_name, s.after_days, s.only_if, s.policy_class, s.run_hour, s.name]),
      [
        [1, "come_back", null, [], "booking", 10, "First-visit welcome"],
        [2, "come_back", 28, ["no_booking"], "booking", 10, "Come back"],
      ],
    );
    assert.equal(steps[0].state, "paused", "a draft's first step does not run");
    const d = await decisionOf(made.decision_id);
    assert.deepEqual(
      [d.verb, d.subject_type, d.subject_id, d.payload.started],
      ["make_sequence", "sequence", made.id, false],
    );

    // Paused, a draft stays one; running, it is on.
    ok(await db.from("sequence_steps").update({ name: "First-visit welcome!" }).eq("id", made.id));
    assert.equal(ok(await db.from("sequences").select("state").eq("id", made.id).single()).state, "draft");
    ok(await db.from("sequence_steps").update({ state: "running" }).eq("id", made.id));
    assert.equal(ok(await db.from("sequences").select("state").eq("id", made.id).single()).state, "on");

    // Discarded while it never sent: every step goes, and the sequence with them.
    const gone = ok(await operator.rpc("sequence_discard", { p_tenant_id: tenantId, p_sequence_id: made.id }));
    assert.equal(gone.steps, 2);
    assert.equal(ok(await db.from("sequences").select("id").eq("id", made.id)).length, 0);
    assert.equal(ok(await db.from("sequence_steps").select("id").eq("sequence_id", made.id)).length, 0);
    assert.equal((await decisionOf(gone.decision_id)).verb, "discard_sequence");

    // One that sent keeps its history: it is paused, never taken away.
    const sent = ok(await operator.rpc("sequence_create", { p_tenant_id: tenantId, p_first: first, p_start: true }));
    assert.equal(sent.state, "on");
    await batchOf(sent.id, "sent");
    const kept = await operator.rpc("sequence_discard", { p_tenant_id: tenantId, p_sequence_id: sent.id });
    assert.equal(kept.error?.code, "P0001");
    const elsewhere = await stranger.rpc("sequence_discard", { p_tenant_id: otherTenant, p_sequence_id: sent.id });
    assert.equal(elsewhere.error?.code, "P0002", "another workspace's sequence is none of theirs");
  },
);
