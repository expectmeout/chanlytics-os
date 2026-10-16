/**
 * 00406 on a real Postgres: campaign_stuck, what is stuck in a workspace's campaigns as it stands now. campaign_ledger
 * (00405) reads a window; a run that waits for an OK, a run that failed, a thread that answered a campaign and may wait
 * on a person, and a message Meta stopped are not in one. The read ships facts and never a verdict: whether an approval
 * is too late, whether a thread waits on a person and whether the number can send are the reader's.
 *
 * The first test builds one workspace whose answer is spelled out; the second holds the replies' prefilter to the
 * product's own rule (`standingOfThread`) for every thread it could meet; the third the caps; the fourth what a reach-out
 * step is not, who may read and that nothing a person wrote comes out; the fifth the reply rule and `replied_at`. Each
 * test builds its own workspace; they are removed when the file ends. Runs against the database `supabase start`
 * builds on this machine, never production.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { standingOfThread } from "../../../../../packages/contracts/src/conversations/standing.ts";
import { STUCK_DAYS } from "../../../../../packages/contracts/src/broadcasts/run-words.ts";
import {
  ANON,
  DAY,
  HOUR,
  URL_,
  cleanup,
  contactRow,
  conversationRow,
  db,
  insert,
  iso,
  member,
  messageRow,
  ok,
  recipientRow,
  skip,
  skipMembers,
  users,
  workspace,
  ymd,
} from "./_answers-world.mjs";

after(cleanup);

const MINUTE = 60_000;
/** Now, to the second: every instant below is a whole second from it, so what the database hands back is exact. */
const T0 = Math.floor(Date.now() / 1000) * 1000;
/**
 * How far back the read looks for a run that failed and for the sends that were answered: the SQL says `interval '30
 * days'` (00406), contracts says it in words (STUCK_DAYS, "30 days") for the lens's sentences. The cases at the edge
 * below sit an hour either side of THIS, so a change to either alone is red here.
 */
const STUCK = Number(/^(\d+) days$/.exec(STUCK_DAYS)?.at(1)) * DAY;
assert.ok(STUCK > 0, `STUCK_DAYS is a whole number of days in words: ${STUCK_DAYS}`);
const PHONE = "+1 555 0142";

/** A workspace with the message (template) its runs send and the playbook its moments belong to. */
async function lab(slug) {
  const w = await workspace(slug);
  const template = ok(
    await db
      .from("templates")
      .insert({
        tenant_id: w.tenantId,
        channel: "whatsapp",
        name: "winback_offer",
        language: "en_US",
        meta_status: "approved",
      })
      .select("id")
      .single(),
  ).id;
  const playbook = {
    tenant_id: w.tenantId,
    name: "Win-back",
    trigger: "quiet_30",
    template_id: template,
    template_name: "winback_offer",
    template_language: "en_US",
    params: [],
    policy_class: "reengage",
    state: "running",
  };
  return { ...w, template, playbook: ok(await db.from("sequence_steps").insert(playbook).select("id").single()).id };
}

/** A teammate: a member of the workspace a thread may be assigned to. */
async function teammate(w) {
  const made = await db.auth.admin.createUser({
    email: `stuck-${w.tenantId}-${users.length}@example.com`,
    password: `pw-${w.tenantId}-Aa1!`,
    email_confirm: true,
  });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  await insert("memberships", { tenant_id: w.tenantId, user_id: made.data.user.id, role: "viewer" });
  return made.data.user.id;
}

/** The audience a run of that kind carries: its `kind` is how a run is told, `playbook_id` may be gone. */
const audienceOf = (l, kind, name) =>
  ({
    moment: { kind: "playbook", id: l.playbook, label: name, trigger: "quiet_30" },
    broadcast: { kind: "everyone" },
    reach_out: { kind: "reach_out", label: name },
  })[kind];

/** An id that sorts as its number does, for the test that reads a tie (the prefix is this run's, so a run never meets another's). */
const PREFIX = crypto.randomUUID().slice(0, 8);
const idOf = (n) => `${PREFIX}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A run's row, made at `created`; `finishedAt` and `updatedAt` are the failed runs' times. */
function runRow(l, spec) {
  const {
    name,
    kind = "broadcast",
    state,
    created,
    runFor = null,
    failure = null,
    finishedAt = null,
    count = 0,
  } = spec;
  const playbook = spec.playbook ?? kind === "moment";
  return {
    id: spec.id ?? crypto.randomUUID(),
    tenant_id: l.tenantId,
    name,
    template_id: l.template,
    template_name: "winback_offer",
    template_language: "en_US",
    audience: audienceOf(l, kind, name),
    state,
    failure,
    scheduled_for: iso(created),
    started_at: state === "sent" ? iso(created) : null,
    finished_at: finishedAt === null ? null : iso(finishedAt),
    created_at: iso(created),
    updated_at: iso(spec.updatedAt ?? created),
    recipient_count: count,
    step_id: playbook ? l.playbook : null,
    run_for: runFor,
  };
}
async function makeRun(l, spec) {
  const row = runRow(l, spec);
  await insert("sequence_batches", row);
  return row.id;
}

/** A person and their one thread, as it stands: its state, its pause, who has it, and an escalation if one was raised. */
async function thread(l, { state = "open", paused = null, assignee = null, escalation = null } = {}) {
  const [contact, conversation] = [crypto.randomUUID(), crypto.randomUUID()];
  await insert("contacts", contactRow(l, contact));
  const row = conversationRow(l, conversation, contact, T0);
  await insert("conversations", {
    ...row,
    state,
    paused_until: paused === null ? null : iso(paused),
    assignee_user_id: assignee,
  });
  if (escalation) {
    const resolved = escalation === "resolved" ? { resolved_at: iso(T0 - HOUR) } : {};
    await insert("escalations", {
      tenant_id: l.tenantId,
      conversation_id: conversation,
      reason: "manual",
      state: escalation,
      ...resolved,
    });
  }
  return { contact, conversation };
}

/** What a run sent a person at `at`: the message in their thread and the run's record of it. */
async function sendTo(l, runId, p, at, { source = "broadcast" } = {}) {
  const message = crypto.randomUUID();
  const row = messageRow(l, message, { conversation: p.conversation, contact: p.contact, channel: "whatsapp", at });
  await insert("messages", { ...row, meta: { source } });
  await insert("sequence_sends", recipientRow(l, { run: runId, contact: p.contact, message, at, channel: "whatsapp" }));
  return message;
}

/** What a person wrote in the thread, at `at`; `over` bends the row (an automated claim, the channel). */
const wrote = (l, p, at, over = {}) =>
  insert("messages", {
    tenant_id: l.tenantId,
    conversation_id: p.conversation,
    contact_id: p.contact,
    channel: "whatsapp",
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "yes please",
    status: "received",
    meta: {},
    created_at: iso(at),
    ...over,
  });

const stuck = async (l) => ok(await db.rpc("campaign_stuck", { p_tenant_id: l.tenantId }), "campaign_stuck");

/** A time the database hands back, as the one string a test can compare. */
const at = (value) => (value === null ? null : new Date(value).toISOString());
/** The replies, their times told as `at` tells them. */
const repliesOf = (answer) =>
  answer.replies.map((r) => ({ ...r, paused_until: at(r.paused_until), replied_at: at(r.replied_at) }));

test("what waits, what failed, who answered and what Meta stopped", { skip }, async () => {
  const l = await lab("harbor-stuck-world");
  const colleague = await teammate(l);

  // What waits for an OK: a moment's run for today, one for yesterday and a reach-out step's, oldest first. Runs that
  // sent, were canceled or are on their way are not waiting.
  const created = { reachOut: T0 - 30 * HOUR, yesterday: T0 - 26 * HOUR, today: T0 - 3 * HOUR };
  const today = ymd(T0);
  const yesterday = ymd(T0 - DAY);
  const W1 = await makeRun(l, {
    name: "Win-back",
    kind: "moment",
    state: "pending_approval",
    created: created.today,
    runFor: today,
    count: 14,
  });
  const W2 = await makeRun(l, {
    name: "Win-back",
    kind: "moment",
    state: "pending_approval",
    created: created.yesterday,
    runFor: yesterday,
    count: 9,
  });
  const W3 = await makeRun(l, {
    name: "Chain step 1",
    kind: "reach_out",
    state: "pending_approval",
    created: created.reachOut,
    count: 4,
  });
  for (const state of ["sent", "canceled", "scheduled", "sending"]) {
    await makeRun(l, { name: `Not waiting, ${state}`, state, created: T0 - 5 * HOUR });
  }

  // What failed inside the window (STUCK): newest first, by the finish, else by the last touch. Not one long ago, and not
  // one whose finish is old even if the row was touched since; at the edge, one that finished an hour inside is listed
  // and one an hour outside is not.
  const F1 = await makeRun(l, {
    name: "Win-back",
    kind: "moment",
    state: "failed",
    failure: "paused",
    created: T0 - 2 * DAY - HOUR,
    finishedAt: T0 - 2 * DAY,
    runFor: ymd(T0 - 2 * DAY),
  });
  const F2 = await makeRun(l, {
    name: "Spring note",
    state: "failed",
    failure: "wire_unavailable:sms",
    created: T0 - 6 * DAY,
    updatedAt: T0 - 5 * DAY,
  });
  const F5 = await makeRun(l, {
    name: "Autumn note",
    state: "failed",
    failure: "paused_5550142",
    created: T0 - DAY,
    finishedAt: T0 - 6 * HOUR,
  });
  const F6 = await makeRun(l, {
    name: "Chain step 2",
    kind: "reach_out",
    state: "failed",
    failure: "paused",
    created: T0 - 4 * DAY,
    finishedAt: T0 - 3 * DAY,
  });
  await makeRun(l, {
    name: "Long ago",
    state: "failed",
    failure: "paused",
    created: T0 - 41 * DAY,
    finishedAt: T0 - 40 * DAY,
  });
  const F7 = await makeRun(l, {
    name: "Just inside",
    state: "failed",
    failure: "paused",
    created: T0 - STUCK - DAY,
    finishedAt: T0 - STUCK + HOUR,
  });
  await makeRun(l, {
    name: "Touched since",
    state: "failed",
    failure: "paused",
    created: T0 - STUCK - DAY,
    finishedAt: T0 - STUCK - HOUR,
    updatedAt: T0 - DAY,
  });

  // Who answered a campaign and may wait on a person: a moment's run sent to eight people (and one older run to a ninth).
  const R = await makeRun(l, {
    name: "Win-back",
    kind: "moment",
    state: "sent",
    created: T0 - 11 * DAY,
    runFor: ymd(T0 - 5 * DAY),
  });
  const Rold = await makeRun(l, { name: "Old note", state: "sent", created: T0 - 41 * DAY });
  const people = {
    T1: await thread(l, { escalation: "open" }), //                              flagged by an open escalation, nobody on it
    T2: await thread(l, { state: "needs_human" }), //                            needs a person
    T3: await thread(l, { paused: T0 - 2 * DAY }), //                            paused, and the pause is over
    T4: await thread(l, { state: "snoozed" }), //                                put aside, nothing open
    T5: await thread(l, { escalation: "open", assignee: colleague }), //         a teammate has it, an escalation is open
    T6: await thread(l), //                                                      quiet
    T7: await thread(l, { state: "needs_human", escalation: "open" }), //        flagged, but the reply came too late
    T8: await thread(l, { state: "needs_human", escalation: "open" }), //        flagged, but reached 40 days ago
    T9: await thread(l, { escalation: "resolved" }), //                          an escalation that is over
  };
  const sentAt = {
    T1: T0 - 5 * DAY,
    T2: T0 - 5 * DAY + HOUR,
    T3: T0 - 4 * DAY,
    T4: T0 - 4 * DAY + HOUR,
    T5: T0 - 3 * DAY,
    T6: T0 - 3 * DAY + HOUR,
    T7: T0 - 10 * DAY,
    T9: T0 - 2 * DAY,
  };
  const repliedAfter = {
    T1: 10 * MINUTE,
    T2: 20 * MINUTE,
    T3: 30 * MINUTE,
    T4: 5 * MINUTE,
    T5: 40 * MINUTE,
    T6: MINUTE,
    T7: 73 * HOUR,
    T9: 10 * MINUTE,
  };
  for (const name of Object.keys(sentAt)) {
    await sendTo(l, R, people[name], sentAt[name]);
    await wrote(l, people[name], sentAt[name] + repliedAfter[name]);
  }
  await sendTo(l, Rold, people.T8, T0 - 40 * DAY);
  await wrote(l, people.T8, T0 - 40 * DAY + HOUR);

  // What Meta stopped: any message of ours, used by a run or not.
  const message = (name, language, meta_status, over = {}) => ({
    tenant_id: l.tenantId,
    channel: "whatsapp",
    name,
    language,
    meta_status,
    ...over,
  });
  ok(await db.from("templates").update({ meta_status: "paused", quality: "YELLOW" }).eq("id", l.template));
  await insert("templates", [
    message("spring_note", "en_US", "approved"),
    message("autumn_wave", "en_US", "pending"),
    message("old_promo", "en_US", "disabled", { quality: "RED" }),
    message("holiday_card", "en_US", "rejected"),
    message("flash_sale", "en_US", "paused", { hidden_at: iso(T0 - DAY) }),
    message("paused_mail", "en_US", "paused", { channel: "email" }),
  ]);

  const answer = await stuck(l);
  assert.deepEqual(
    Object.keys(answer).sort(),
    ["replies", "runs_failed", "runs_waiting", "templates"],
    "four lists, no window",
  );

  assert.deepEqual(
    answer.runs_waiting.map((r) => ({ ...r, created_at: at(r.created_at) })),
    [
      {
        id: W3,
        name: "Chain step 1",
        kind: "reach_out",
        playbook_id: null,
        run_for: null,
        trigger: null,
        audience_kind: "reach_out",
        created_at: iso(created.reachOut),
        recipient_count: 4,
      },
      {
        id: W2,
        name: "Win-back",
        kind: "moment",
        playbook_id: l.playbook,
        run_for: yesterday,
        trigger: "quiet_30",
        audience_kind: "playbook",
        created_at: iso(created.yesterday),
        recipient_count: 9,
      },
      {
        id: W1,
        name: "Win-back",
        kind: "moment",
        playbook_id: l.playbook,
        run_for: today,
        trigger: "quiet_30",
        audience_kind: "playbook",
        created_at: iso(created.today),
        recipient_count: 14,
      },
    ],
    "three runs wait, oldest first, with the facts the day rule reads and none of its verdict",
  );

  assert.deepEqual(
    answer.runs_failed.map((r) => ({ ...r, finished_at: at(r.finished_at) })),
    [
      { id: F5, name: "Autumn note", kind: "broadcast", failure: "other", finished_at: iso(T0 - 6 * HOUR) },
      { id: F1, name: "Win-back", kind: "moment", failure: "paused", finished_at: iso(T0 - 2 * DAY) },
      { id: F6, name: "Chain step 2", kind: "reach_out", failure: "paused", finished_at: iso(T0 - 3 * DAY) },
      {
        id: F2,
        name: "Spring note",
        kind: "broadcast",
        failure: "wire_unavailable:sms",
        finished_at: iso(T0 - 5 * DAY),
      },
      { id: F7, name: "Just inside", kind: "broadcast", failure: "paused", finished_at: iso(T0 - STUCK + HOUR) },
    ],
    "five failed runs in the window, newest first, the last an hour inside it (STUCK_DAYS) and the one an hour outside left out; one with no finish is told by its last touch; a failure that is text is 'other'",
  );

  assert.deepEqual(
    repliesOf(answer),
    [
      {
        state: "open",
        paused_until: null,
        assignee_user_id: null,
        open_escalation: true,
        open_escalation_reason: "manual",
        replied_at: iso(sentAt.T1 + repliedAfter.T1),
      },
      {
        state: "needs_human",
        paused_until: null,
        assignee_user_id: null,
        open_escalation: false,
        open_escalation_reason: null,
        replied_at: iso(sentAt.T2 + repliedAfter.T2),
      },
      {
        state: "open",
        paused_until: iso(T0 - 2 * DAY),
        assignee_user_id: null,
        open_escalation: false,
        open_escalation_reason: null,
        replied_at: iso(sentAt.T3 + repliedAfter.T3),
      },
      {
        state: "open",
        paused_until: null,
        assignee_user_id: colleague,
        open_escalation: true,
        open_escalation_reason: "manual",
        replied_at: iso(sentAt.T5 + repliedAfter.T5),
      },
    ],
    "T1, T2, T3 and T5 answered and are flagged or paused or escalated; not T4, T6, T7, T8 or T9; oldest reply first",
  );

  assert.deepEqual(
    answer.templates,
    [
      { name: "holiday_card", language: "en_US", status: "rejected", quality: null },
      { name: "old_promo", language: "en_US", status: "disabled", quality: "RED" },
      { name: "winback_offer", language: "en_US", status: "paused", quality: "YELLOW" },
    ],
    "paused, disabled and rejected, a message no run used among them; not approved, pending, hidden or not WhatsApp's",
  );
  assert.ok(!JSON.stringify(answer).includes("5550142"), "digits in a failure's text do not come out");
});

test("the replies prefilter is a superset of what standingOfThread calls flagged", { skip }, async () => {
  const l = await lab("harbor-stuck-matrix");
  const colleague = await teammate(l);
  const run = await makeRun(l, { name: "Spring note", state: "sent", created: T0 - 8 * DAY });

  // Every thread the product could meet: three states, three pauses, nobody or a teammate, an escalation open or not.
  const combos = [];
  for (const state of ["open", "needs_human", "snoozed"]) {
    for (const pause of ["none", "past", "future"]) {
      for (const assignee of [null, colleague]) {
        for (const escalation of [false, true]) combos.push({ state, pause, assignee, escalation });
      }
    }
  }
  const pausedAt = { none: null, past: T0 - DAY, future: T0 + DAY };
  const sentAt = (i) => T0 - 6 * DAY + i * 2 * MINUTE;
  const conversations = [];
  for (const [i, c] of combos.entries()) {
    const p = await thread(l, {
      state: c.state,
      paused: pausedAt[c.pause],
      assignee: c.assignee,
      escalation: c.escalation ? "open" : null,
    });
    conversations.push(p.conversation);
    await sendTo(l, run, p, sentAt(i));
    await wrote(l, p, sentAt(i) + MINUTE);
  }

  // The stack sweeps a needs_human thread whose pause is over and that has no open escalation back to open, with nobody
  // on it, every few seconds (expire_stale_pauses, 00006): the product holds that state for a moment and no longer. So the
  // threads are read as they stand, before and after the read, and a thread that moved in between is not judged.
  const standing = async () =>
    new Map(
      ok(
        await db.from("conversations").select("id, state, paused_until, assignee_user_id").eq("tenant_id", l.tenantId),
      ).map((c) => [c.id, { state: c.state, paused_until: at(c.paused_until), assignee_user_id: c.assignee_user_id }]),
    );
  const before = await standing();
  const listed = new Map(repliesOf(await stuck(l)).map((r) => [r.replied_at, r]));
  const after = await standing();
  const nowMs = Date.now();
  const swept = { state: "open", paused_until: null, assignee_user_id: null };
  let [flagged, judged] = [0, 0];
  for (const [i, c] of combos.entries()) {
    const columns = after.get(conversations[i]);
    const planted = {
      state: c.state,
      paused_until: pausedAt[c.pause] === null ? null : iso(pausedAt[c.pause]),
      assignee_user_id: c.assignee,
    };
    const said = JSON.stringify(c);
    if (c.state === "needs_human" && c.pause === "past" && !c.escalation) {
      assert.ok(
        [planted, swept].some((s) => isDeepStrictEqual(columns, s)),
        `as planted or swept: ${said}`,
      );
    } else assert.deepEqual(columns, planted, `nothing else moves a thread: ${said}`);
    if (!isDeepStrictEqual(before.get(conversations[i]), columns)) continue;
    judged += 1;
    const row = listed.get(iso(sentAt(i) + MINUTE));
    if (standingOfThread(columns, c.escalation, nowMs).flagged) {
      flagged += 1;
      assert.ok(row, `the product calls this thread flagged and the read does not list it: ${said}`);
    }
    // The filter is the one the brief names (a person's state, any pause, an open escalation): the superset, exactly.
    assert.equal(
      Boolean(row),
      columns.state === "needs_human" || columns.paused_until !== null || c.escalation,
      `listed as the filter says: ${said}`,
    );
    if (row) {
      assert.deepEqual(
        row,
        {
          ...columns,
          open_escalation: c.escalation,
          // What the open hold is for, so a hold that waits on nobody (a STOP) is not counted (00409, waitsOnAPerson).
          open_escalation_reason: c.escalation ? "manual" : null,
          replied_at: iso(sentAt(i) + MINUTE),
        },
        `the facts of the thread: ${said}`,
      );
    }
  }
  assert.ok(
    judged >= combos.length - 2,
    "all but the two threads the sweep may move (nobody or a teammate on them) are judged",
  );
  assert.ok(flagged > 0 && flagged < judged, "the matrix holds threads the product flags and threads it does not");
  assert.ok(
    listed.size > flagged,
    "a thread nobody is waiting on can be listed: the filter is wider on purpose (a pause that is over)",
  );
  assert.ok(listed.size < judged, "and it still leaves the quiet ones out");
});

test("each list stops at its cap, the waiting oldest first", { skip }, async () => {
  const l = await lab("harbor-stuck-caps");
  // A list's order: by one time and then by id, as the read says it. The tie that lands on the cut is told by the id alone.
  const byId = (a, b) => (a.id < b.id ? -1 : 1);

  // 502 runs waiting, one a second, but the last three made at one instant: the 500th, the 501st and the 502nd. Their ids
  // run A < B < C and they are inserted C, A, B, so that neither the first nor the last of them to be written is the
  // smallest: only the id puts A inside the 500, and B and C are left out.
  const tied = { waiting: [idOf(9003), idOf(9001), idOf(9002)], failed: [idOf(8003), idOf(8001), idOf(8002)] };
  const waiting = Array.from({ length: 502 }, (_, i) =>
    runRow(l, {
      id: i < 499 ? idOf(i) : tied.waiting[i - 499],
      name: `Waiting ${i}`,
      state: "pending_approval",
      created: T0 - 20 * DAY + Math.min(i, 499) * 1000,
    }),
  );
  await insert("sequence_batches", waiting);
  // 502 runs failed, one a minute, newest listed first, but the three oldest finished at one instant.
  const failed = Array.from({ length: 502 }, (_, i) =>
    runRow(l, {
      id: i < 3 ? tied.failed[i] : idOf(2000 + i),
      name: `Failed ${i}`,
      state: "failed",
      failure: "paused",
      created: T0 - 26 * DAY + i * 60_000,
      finishedAt: T0 - 25 * DAY + Math.max(i, 2) * 60_000,
    }),
  );
  await insert("sequence_batches", failed);

  // 502 threads that answered, each flagged; the replies come one a minute.
  const run = await makeRun(l, { name: "Spring note", state: "sent", created: T0 - 12 * DAY });
  const many = Array.from({ length: 502 }, (_, i) => ({
    i,
    contact: crypto.randomUUID(),
    conversation: crypto.randomUUID(),
    message: crypto.randomUUID(),
  }));
  const sentAt = (i) => T0 - 10 * DAY + i * MINUTE;
  await insert(
    "contacts",
    many.map((p) => contactRow(l, p.contact)),
  );
  await insert(
    "conversations",
    many.map((p) => ({ ...conversationRow(l, p.conversation, p.contact, T0), state: "needs_human" })),
  );
  await insert(
    "messages",
    many.map((p) =>
      messageRow(l, p.message, {
        conversation: p.conversation,
        contact: p.contact,
        channel: "whatsapp",
        at: sentAt(p.i),
      }),
    ),
  );
  await insert(
    "sequence_sends",
    many.map((p) =>
      recipientRow(l, { run, contact: p.contact, message: p.message, at: sentAt(p.i), channel: "whatsapp" }),
    ),
  );
  await insert(
    "messages",
    many.map((p) => ({
      tenant_id: l.tenantId,
      conversation_id: p.conversation,
      contact_id: p.contact,
      channel: "whatsapp",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "yes please",
      status: "received",
      meta: {},
      created_at: iso(sentAt(p.i) + 5 * MINUTE),
    })),
  );

  // 102 messages Meta rejected: 101 names, the hundredth in two languages, so the cut falls between them.
  const rejected = (i, language) => ({
    tenant_id: l.tenantId,
    channel: "whatsapp",
    name: `rejected_${String(i).padStart(3, "0")}`,
    language,
    meta_status: "rejected",
  });
  await insert("templates", [...Array.from({ length: 101 }, (_, i) => rejected(i, "en_US")), rejected(99, "es_ES")]);

  const answer = await stuck(l);
  const wantedWaiting = waiting
    .toSorted((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || byId(a, b))
    .slice(0, 500)
    .map((r) => r.id);
  assert.equal(answer.runs_waiting.length, 500);
  assert.deepEqual(
    answer.runs_waiting.map((r) => r.id),
    wantedWaiting,
    "the oldest 500, oldest first, the tie at the cut told by id; the 501st and 502nd are not listed",
  );
  const [A, B, C] = [...tied.waiting].sort();
  const listedWaiting = answer.runs_waiting.map((r) => r.id);
  assert.deepEqual(
    [A, B, C].map((id) => listedWaiting.includes(id)),
    [true, false, false],
    "of three made at one instant the smallest id is inside the 500",
  );
  const wantedFailed = failed
    .toSorted((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at) || byId(a, b))
    .slice(0, 500)
    .map((r) => r.id);
  assert.equal(answer.runs_failed.length, 500);
  assert.deepEqual(
    answer.runs_failed.map((r) => r.id),
    wantedFailed,
    "the 500 newest failures, newest first, the tie at the cut told by id",
  );
  const listedFailed = answer.runs_failed.map((r) => r.id);
  assert.deepEqual(
    [...tied.failed].sort().map((id) => listedFailed.includes(id)),
    [true, false, false],
    "and so of three finished at one instant",
  );
  assert.deepEqual(
    answer.replies.map((r) => at(r.replied_at)),
    many.slice(0, 500).map((p) => iso(sentAt(p.i) + 5 * MINUTE)),
    "the 500 oldest replies, oldest first",
  );
  assert.deepEqual(
    answer.templates.map((t) => t.name),
    Array.from({ length: 100 }, (_, i) => `rejected_${String(i).padStart(3, "0")}`),
    "a hundred messages, by name",
  );
  assert.equal(answer.templates.length, 100);
  assert.deepEqual(
    answer.templates.at(-1),
    { name: "rejected_099", language: "en_US", status: "rejected", quality: null },
    "and the pair the cut falls between is told by language",
  );
});

test("a reach-out run is never a campaign reply, and a stranger reads nothing", { skip }, async () => {
  const l = await lab("harbor-stuck-reach-out");

  // A reach-out step wrote to a business that wrote back and waits on a person. A step's sends are no recipient rows, so
  // nothing ties the thread to a campaign; and where one is planted anyway, a reach-out run's kind keeps it out.
  const step = await makeRun(l, { name: "Chain step 1", kind: "reach_out", state: "sent", created: T0 - 6 * DAY });
  const lead = await thread(l, { state: "needs_human", escalation: "open" });
  const planted = await thread(l, { state: "needs_human", escalation: "open" });
  await insert("messages", {
    ...messageRow(l, crypto.randomUUID(), {
      conversation: lead.conversation,
      contact: lead.contact,
      channel: "email",
      at: T0 - 5 * DAY,
    }),
    meta: { source: "reach_out" },
  });
  await wrote(l, lead, T0 - 5 * DAY + 10 * MINUTE, { channel: "email" });
  await sendTo(l, step, planted, T0 - 5 * DAY, { source: "reach_out" });
  await wrote(l, planted, T0 - 5 * DAY + 10 * MINUTE);

  // A campaign's reply, with a person's name, number and address behind it, and one of each other list.
  const run = await makeRun(l, { name: "Spring note", state: "sent", created: T0 - 6 * DAY });
  const contact = crypto.randomUUID();
  await insert(
    "contacts",
    contactRow(l, contact, { display_name: "Ivy Marlowe", phone_e164: "+15550142", email: "ivy@example.com" }),
  );
  const conversation = crypto.randomUUID();
  await insert("conversations", { ...conversationRow(l, conversation, contact, T0), state: "needs_human" });
  const ivy = { contact, conversation };
  await sendTo(l, run, ivy, T0 - 4 * DAY);
  await wrote(l, ivy, T0 - 4 * DAY + 5 * MINUTE, { body: `Ivy Marlowe here, call me on ${PHONE} or ivy@example.com` });
  await makeRun(l, { name: "Autumn note", state: "pending_approval", created: T0 - HOUR });
  await makeRun(l, {
    name: "Winter note",
    state: "failed",
    failure: `Not sent: ${PHONE}`,
    created: T0 - 2 * DAY,
    finishedAt: T0 - DAY,
  });
  ok(await db.from("templates").update({ meta_status: "rejected", quality: "RED" }).eq("id", l.template));
  await insert("templates", {
    tenant_id: l.tenantId,
    channel: "whatsapp",
    name: "winback_offer",
    language: "es_ES",
    meta_status: "disabled",
  });

  const answer = await stuck(l);
  assert.deepEqual(
    answer.replies.map((r) => at(r.replied_at)),
    [iso(T0 - 4 * DAY + 5 * MINUTE)],
    "only the campaign's reply",
  );
  assert.deepEqual(Object.keys(answer).sort(), ["replies", "runs_failed", "runs_waiting", "templates"]);
  const keys = (rows) => rows.map((r) => Object.keys(r).sort());
  assert.deepEqual(keys(answer.runs_waiting), [
    ["audience_kind", "created_at", "id", "kind", "name", "playbook_id", "recipient_count", "run_for", "trigger"],
  ]);
  assert.deepEqual(keys(answer.runs_failed), [["failure", "finished_at", "id", "kind", "name"]]);
  assert.deepEqual(keys(answer.replies), [
    ["assignee_user_id", "open_escalation", "open_escalation_reason", "paused_until", "replied_at", "state"],
  ]);
  assert.deepEqual(keys(answer.templates), Array(2).fill(["language", "name", "quality", "status"]));
  assert.deepEqual(
    answer.templates.map((t) => [t.name, t.language]),
    [
      ["winback_offer", "en_US"],
      ["winback_offer", "es_ES"],
    ],
    "one message in two languages, by language",
  );
  for (const words of ["Ivy", "Marlowe", "ivy@example.com", "+15550142", "555 0142", "call me", "yes please"]) {
    assert.ok(!JSON.stringify(answer).includes(words), `${words} does not come out`);
  }
  assert.equal(answer.runs_failed.at(0).failure, "other");

  // Whose it is to read: nobody's workspace, an anonymous visitor's, a stranger's and a member's own.
  assert.deepEqual(ok(await db.rpc("campaign_stuck", { p_tenant_id: crypto.randomUUID() })), {
    error: "unknown_tenant",
  });
  if (ANON) {
    const refused = await createClient(URL_, ANON, { auth: { persistSession: false } }).rpc("campaign_stuck", {
      p_tenant_id: l.tenantId,
    });
    assert.ok(refused.error, "anon may not call it");
    assert.equal(refused.data, null);
  }
  if (!skipMembers) {
    const [stranger, own] = [await member(await lab("harbor-stuck-other")), await member(l)];
    assert.deepEqual(ok(await stranger.rpc("campaign_stuck", { p_tenant_id: l.tenantId })), {
      error: "unknown_tenant",
    });
    assert.deepEqual(
      ok(await own.rpc("campaign_stuck", { p_tenant_id: l.tenantId })),
      answer,
      "a member reads what the service role reads",
    );
  }
});

test("a reply is the funnel's reply, and replied_at is the thread's latest first reply", { skip }, async () => {
  const l = await lab("harbor-stuck-reply");
  const sendDay = T0 - 10 * DAY;
  const first = await makeRun(l, { name: "Spring note", state: "sent", created: sendDay - HOUR });
  const second = await makeRun(l, { name: "Autumn note", state: "sent", created: T0 - 7 * DAY });
  const flagged = () => thread(l, { state: "needs_human" });
  const [exact, late, before, atSend, automated, note, outbound, twice, chatty, inside, outside] = [
    await flagged(),
    await flagged(),
    await flagged(),
    await flagged(),
    await flagged(),
    await flagged(),
    await flagged(),
    await flagged(),
    await flagged(),
    await flagged(),
    await flagged(),
  ];

  // The window of sends (STUCK): one an hour inside, one an hour outside.
  const third = await makeRun(l, { name: "Old note", state: "sent", created: T0 - STUCK - DAY });
  await sendTo(l, third, inside, T0 - STUCK + HOUR);
  await wrote(l, inside, T0 - STUCK + HOUR + 10 * MINUTE);
  await sendTo(l, third, outside, T0 - STUCK - HOUR);
  await wrote(l, outside, T0 - STUCK - HOUR + 10 * MINUTE);

  await sendTo(l, first, chatty, T0 - 9 * DAY);
  await wrote(l, chatty, T0 - 9 * DAY + 5 * MINUTE); //                        the first of two replies to one send
  await wrote(l, chatty, T0 - 9 * DAY + 50 * MINUTE);
  await sendTo(l, second, atSend, T0 - 6 * DAY);
  await wrote(l, atSend, T0 - 6 * DAY); //                                     written at the very instant of the send
  await sendTo(l, second, note, T0 - 6 * DAY);
  await wrote(l, note, T0 - 6 * DAY + 5 * MINUTE, { sender: "system", body: "Call ended" }); // a call's note, not the customer
  await sendTo(l, first, exact, sendDay);
  await wrote(l, exact, sendDay + 72 * HOUR); //                               the last instant of the window
  await sendTo(l, first, late, sendDay);
  await wrote(l, late, sendDay + 72 * HOUR + 1000); //                         a second past it
  await sendTo(l, second, before, T0 - 6 * DAY);
  await wrote(l, before, T0 - 6 * DAY - MINUTE); //                            written before the send
  await sendTo(l, second, automated, T0 - 5 * DAY);
  await wrote(l, automated, T0 - 5 * DAY + 5 * MINUTE, { channel: "email", meta: { email: { claim: "auto_reply" } } }); // not a person's words
  await sendTo(l, second, outbound, T0 - 5 * DAY);
  await insert(
    "messages",
    messageRow(l, crypto.randomUUID(), {
      conversation: outbound.conversation,
      contact: outbound.contact,
      channel: "whatsapp",
      at: T0 - 5 * DAY + 10 * MINUTE,
    }),
  ); // the business writing, not the customer
  await sendTo(l, first, twice, T0 - 8 * DAY);
  await wrote(l, twice, T0 - 8 * DAY + 10 * MINUTE);
  await sendTo(l, second, twice, T0 - 3 * DAY);
  await wrote(l, twice, T0 - 3 * DAY + 20 * MINUTE);

  assert.deepEqual(
    repliesOf(await stuck(l)).map((r) => r.replied_at),
    [
      iso(T0 - STUCK + HOUR + 10 * MINUTE),
      iso(T0 - 9 * DAY + 5 * MINUTE),
      iso(sendDay + 72 * HOUR),
      iso(T0 - 3 * DAY + 20 * MINUTE),
    ],
    "a send an hour inside the window (STUCK_DAYS), the first of two replies, the reply at 72 hours, and a thread sent to twice told by its later first reply; not one second past 72 hours, a send an hour outside the window, a message before or at the send, an automated one, a call's note or the business's own",
  );
});

test("a run's kind is told by its audience, in the waiting and the failed", { skip }, async () => {
  const l = await lab("harbor-stuck-kinds");

  // One of each way a run is told: a moment (its audience says playbook; or a playbook stands behind it whatever the
  // audience says), a reach-out step (even with a playbook behind it), a one-off broadcast, and a moment whose playbook
  // was deleted (its row says none, its audience still says playbook).
  const ways = {
    moment: { kind: "moment" },
    "a playbook behind any audience": { kind: "broadcast", playbook: true },
    "a reach-out step with a playbook": { kind: "reach_out", playbook: true },
    broadcast: { kind: "broadcast" },
    "a deleted playbook's moment": { kind: "moment", playbook: false },
  };
  const expected = {
    moment: "moment",
    "a playbook behind any audience": "moment",
    "a reach-out step with a playbook": "reach_out",
    broadcast: "broadcast",
    "a deleted playbook's moment": "moment",
  };
  const made = [];
  for (const [way, spec] of Object.entries(ways)) {
    for (const state of ["pending_approval", "failed"]) {
      const failed = state === "failed";
      const row = { name: way, state, created: T0 - 2 * DAY, finishedAt: failed ? T0 - DAY : null };
      made.push({ id: await makeRun(l, { ...row, failure: failed ? "paused" : null, ...spec }), way, state });
    }
  }
  const answer = await stuck(l);
  const kinds = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.kind]));
  for (const { id, way, state } of made) {
    const told = kinds(state === "failed" ? answer.runs_failed : answer.runs_waiting)[id];
    assert.equal(told, expected[way], `${way}, ${state}`);
  }
  assert.equal(answer.runs_waiting.length, made.length / 2);
  assert.equal(answer.runs_failed.length, made.length / 2);
});

test("a failure comes out as a code of ours, with the channel it names, or as other", { skip }, async () => {
  const l = await lab("harbor-stuck-failures");

  // The column is text the database does not constrain: only a lower-case code, and after a colon one lower-case word,
  // is ours. Anything else (capitals, digits, a second colon, spaces, empty, none, a number written out) is `other`.
  const cases = [
    ["paused", "paused"],
    ["template_not_approved", "template_not_approved"],
    ["run_interrupted", "run_interrupted"],
    ["wire_unavailable:sms", "wire_unavailable:sms"],
    ["throttled:email", "throttled:email"],
    ["Paused", "other"],
    ["paused_2", "other"],
    ["wire_unavailable:SMS", "other"],
    ["wire_unavailable:sms:x", "other"],
    ["wire_unavailable:", "other"],
    [":sms", "other"],
    ["not sent", "other"],
    [`call ${PHONE}`, "other"],
    ["", "other"],
    [null, "other"],
  ];
  const ids = new Map();
  for (const [i, [failure]] of cases.entries()) {
    const spec = {
      name: `Run ${i}`,
      state: "failed",
      failure,
      created: T0 - 3 * DAY,
      finishedAt: T0 - DAY - i * MINUTE,
    };
    ids.set(await makeRun(l, spec), failure);
  }
  const told = (await stuck(l)).runs_failed;
  assert.equal(told.length, cases.length);
  assert.deepEqual(
    told.map((r) => [ids.get(r.id), r.failure]),
    cases,
    "each failure as ours or other, newest first",
  );
  assert.ok(!JSON.stringify(told).includes(PHONE), "and no number comes out");
});
