/**
 * A card's commit and its undo, executed.
 *
 * Every proposal the assistant makes lands in commit.ts when the person
 * approves it, and every undo comes back through it. Until now a test read
 * its text for the route names; here the committer runs against the typed
 * client bound to a fake fetch, so what is proved is what leaves the tab:
 * the route, the body, the card's mark on every call, the decision id an
 * undo names, the receipt, and what undo is handed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASK_THREAD_VERBS, applySettingsChange } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { commitProposal, undoProposal, editReply, THREAD_ROUTE } = await import(
  at("apps/dashboard/src/legacy-bridge/ask/commit.ts")
);
const { recordDecision } = await import(at("apps/dashboard/src/server/verbs.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const E1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const P1 = "pppppppp-pppp-4ppp-8ppp-ppppppppppp1".replace(/p/g, "a");
const K1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";
const B1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const PB1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const D = (n) => `dddddddd-dddd-4ddd-8ddd-ddddddddddd${n}`;
const DEAL1 = "dddddddd-dddd-4ddd-8ddd-dddddddddd21";

const envelope = (data) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const refusal = (status, code, message) =>
  new Response(JSON.stringify({ ok: false, error: { code, message } }), { status });

/** The routes a card reaches, answered as the server answers them. */
const ANSWERS = {
  [`POST /api/v1/conversations/${C1}/reply`]: {
    message_id: "m-9",
    status: "queued",
    cancelable_until: "2026-09-12T10:00:15.000Z",
    window_open: true,
    withdrawn_drafts: 0,
    decision_id: D(1),
  },
  [`POST /api/v1/messages/${M1}/steer`]: { ok: true },
  [`POST /api/v1/conversations/${C1}/take-over`]: {
    state: "needs_human",
    paused_until: "2026-09-13T10:00:00.000Z",
    decision_id: D(2),
    withdrawn_drafts: 0,
  },
  [`POST /api/v1/conversations/${C1}/hand-back`]: { state: "open", decision_id: D(3) },
  [`POST /api/v1/conversations/${C1}/snooze`]: {
    state: "snoozed",
    snooze_until: "2026-09-13T10:00:00.000Z",
    decision_id: D(4),
  },
  [`POST /api/v1/conversations/${C1}/wake`]: { state: "open", decision_id: D(5) },
  [`POST /api/v1/conversations/${C1}/archive`]: { state: "archived", decision_id: D(6) },
  [`POST /api/v1/escalations/${E1}/resolve`]: { state: "resolved", decision_id: D(7) },
  [`PUT /api/v1/contacts/${P1}/receptionist`]: { contact_id: P1, mode: "never", decision_id: D(8) },
  [`POST /api/v1/contacts/${P1}/deal`]: {
    deal: { id: DEAL1, stage: "won", version: 4 },
    from: "proposed",
    decision_id: "x",
  },
  ["PUT /api/v1/policies"]: { policy: { class: "reply", mode: "ask", limits: {} } },
  ["PUT /api/v1/settings"]: { config: {}, version: 4 },
  [`POST /api/v1/calls/${K1}/whisper`]: { ok: true },
  ["POST /api/v1/team/invite"]: { invited: true },
  ["POST /api/v1/broadcasts"]: {
    id: B1,
    name: "Friday offer",
    state: "scheduled",
    recipient_count: 12,
    scheduled_for: "2026-09-12T15:00:00.000Z",
    decision_id: D(9),
  },
  ["POST /api/v1/playbooks"]: { id: PB1, name: "Win-back", state: "running", decision_id: D(0) },
  ["POST /api/v1/messages/m-9/cancel-send"]: { status: "canceled", decision_id: "x" },
  [`POST /api/v1/broadcasts/${B1}/cancel`]: { id: B1, state: "canceled", was: "scheduled", decision_id: "x" },
  [`DELETE /api/v1/playbooks/${PB1}`]: { deleted: true, id: PB1, decision_id: "x" },
};

/** A tab: the typed client on a fake fetch, and the few window parts the committer touches. */
function tab(answer = null) {
  const sent = [];
  const events = [];
  const client = createApi({
    fetch: async (url, init) => {
      const key = `${init.method} ${String(url).replace(/\?.*$/, "")}`;
      sent.push({
        key,
        body: init.body ? JSON.parse(init.body) : undefined,
        via: init.headers["x-via"],
        undoOf: init.headers["x-undo-of"],
      });
      if (answer) return answer(key);
      const data = ANSWERS[key];
      if (!data) throw new Error(`the card reached a route this test does not answer: ${key}`);
      return envelope(data);
    },
    workspace: () => A,
    onSignedOut: () => events.push("signed-out"),
    onChooseWorkspace: () => events.push("choose-workspace"),
    refresh: async (key) => {
      events.push(`refresh:${key}`);
    },
    now: () => 1_000,
  });
  const win = {
    __SETTINGS: {
      config: { brain: { business_name: "Harbor", profile: { hours: { mon: { open: "09:00", close: "17:00" } } } } },
      version: 3,
    },
    location: { hash: "" },
    dispatchEvent: (e) => {
      events.push(`event:${e.type}`);
      return true;
    },
    setTimeout: (fn) => {
      fn();
      return 1;
    },
  };
  return { client, win, sent, events };
}
const card = (kind, payload, extra = {}) => ({
  id: "p-1",
  kind,
  needs: "operator",
  title: "t",
  summary: "the summary",
  payload,
  undo: null,
  ...extra,
});
const one = (t) => {
  assert.equal(t.sent.length, 1, "exactly one request");
  return t.sent[0];
};

test("every thread verb the assistant may propose is one the committer can send, and resolve closes the escalation instead", () => {
  assert.deepEqual(
    Object.keys(THREAD_ROUTE).sort(),
    ASK_THREAD_VERBS.filter((v) => v !== "resolve").sort(),
    "one list on both sides",
  );
});

test("a reply: the words to the thread's reply route, marked as a card's; the receipt names the person and the cancel window; undo keeps the message, its window and the ledger row", async () => {
  const t = tab();
  const r = await commitProposal(
    t.win,
    card("reply", { conversation_id: C1, text: "On our way.", who: "Rosa" }),
    t.client,
  );
  assert.deepEqual(r, {
    ok: true,
    receipt: "On its way to Rosa — sends in 15 seconds unless you cancel",
    undo: { message_id: "m-9", cancelable_until: "2026-09-12T10:00:15.000Z", decision_id: D(1) },
  });
  assert.deepEqual(one(t), {
    key: `POST /api/v1/conversations/${C1}/reply`,
    body: { text: "On our way." },
    via: "ask",
    undoOf: undefined,
  });
  assert.ok(
    t.events.includes(`refresh:POST conversations/[id]/reply`),
    "the surfaces the map names are re-read, as after the page's own button",
  );
});

test("a steer, a whisper and an invite: each to its route, each with a receipt and no undo", async () => {
  const t = tab();
  assert.deepEqual(await commitProposal(t.win, card("steer", { message_id: M1, instruction: "shorter" }), t.client), {
    ok: true,
    receipt: "Rewritten — the new draft waits its turn",
    undo: null,
  });
  assert.deepEqual(await commitProposal(t.win, card("whisper", { call_id: K1, text: "Saturday is full" }), t.client), {
    ok: true,
    receipt: "Whispered — the receptionist works it into its next answer",
    undo: null,
  });
  assert.deepEqual(
    await commitProposal(t.win, card("invite", { email: "ada@example.com", role: "viewer" }), t.client),
    { ok: true, receipt: "Invited ada@example.com as viewer", undo: null },
  );
  assert.deepEqual(
    t.sent.map((s) => [s.key, s.body, s.via]),
    [
      [`POST /api/v1/messages/${M1}/steer`, { text: "shorter" }, "ask"],
      [`POST /api/v1/calls/${K1}/whisper`, { text: "Saturday is full", trigger: false }, "ask"],
      ["POST /api/v1/team/invite", { email: "ada@example.com", role: "viewer" }, "ask"],
    ],
  );
});

test("thread verbs: each to its Inbox route; the snooze carries its until; the receipt is the verb's; undo is the inverse verb with the ledger row, and none for archive or resolve", async () => {
  const t = tab();
  const took = await commitProposal(
    t.win,
    card("thread_verb", { verb: "take_over", conversation_id: C1, who: "Rosa" }),
    t.client,
  );
  assert.deepEqual(took, {
    ok: true,
    receipt: "You have Rosa's thread",
    undo: { verb: "hand_back", conversation_id: C1, until: null, decision_id: D(2) },
  });
  const snoozed = await commitProposal(
    t.win,
    card("thread_verb", { verb: "snooze", conversation_id: C1, until: "2026-09-13T10:00:00.000Z" }),
    t.client,
  );
  assert.deepEqual(snoozed, {
    ok: true,
    receipt: "Snoozed",
    undo: { verb: "wake", conversation_id: C1, until: "2026-09-13T10:00:00.000Z", decision_id: D(4) },
  });
  assert.deepEqual(
    await commitProposal(t.win, card("thread_verb", { verb: "hand_back", conversation_id: C1 }), t.client),
    {
      ok: true,
      receipt: "The receptionist has it again",
      undo: { verb: "take_over", conversation_id: C1, until: null, decision_id: D(3) },
    },
  );
  assert.deepEqual(await commitProposal(t.win, card("thread_verb", { verb: "wake", conversation_id: C1 }), t.client), {
    ok: true,
    receipt: "Back in the Inbox",
    undo: { verb: "snooze", conversation_id: C1, until: null, decision_id: D(5) },
  });
  assert.deepEqual(
    await commitProposal(t.win, card("thread_verb", { verb: "archive", conversation_id: C1 }), t.client),
    { ok: true, receipt: "Archived", undo: null },
  );
  assert.deepEqual(await commitProposal(t.win, card("thread_verb", { verb: "resolve", escalation_id: E1 }), t.client), {
    ok: true,
    receipt: "Resolved",
    undo: null,
  });
  assert.deepEqual(
    t.sent.map((s) => [s.key, s.body]),
    [
      [`POST /api/v1/conversations/${C1}/take-over`, undefined],
      [`POST /api/v1/conversations/${C1}/snooze`, { until: "2026-09-13T10:00:00.000Z" }],
      [`POST /api/v1/conversations/${C1}/hand-back`, undefined],
      [`POST /api/v1/conversations/${C1}/wake`, undefined],
      [`POST /api/v1/conversations/${C1}/archive`, undefined],
      [`POST /api/v1/escalations/${E1}/resolve`, undefined],
    ],
  );
  assert.ok(
    t.sent.every((s) => s.via === "ask"),
    "every one marked as a card's",
  );
  assert.deepEqual(
    await commitProposal(t.win, card("thread_verb", { verb: "delete", conversation_id: C1 }), t.client),
    { ok: false, message: "This card cannot be approved from here." },
  );
  assert.equal(t.sent.length, 6, "a verb the assistant may not propose reaches no route");
});

test("a person's mode: the owner's route, the people surface told, the previous mode kept for undo with the ledger row", async () => {
  const t = tab();
  const r = await commitProposal(
    t.win,
    card("person_mode", { contact_id: P1, mode: "never", who: "Rosa", previous: "auto" }),
    t.client,
  );
  assert.deepEqual(r, {
    ok: true,
    receipt: "Receptionist for Rosa: Never",
    undo: { contact_id: P1, mode: "auto", decision_id: D(8) },
  });
  assert.deepEqual(one(t), {
    key: `PUT /api/v1/contacts/${P1}/receptionist`,
    body: { mode: "never" },
    via: "ask",
    undoOf: undefined,
  });
  assert.ok(t.events.includes("event:surface:clients"));
  const bare = tab();
  const r2 = await commitProposal(
    bare.win,
    card("person_mode", { contact_id: P1, mode: "never", who: "Rosa" }),
    bare.client,
  );
  assert.equal(
    r2.undo.mode,
    "inherit",
    "no previous mode on record: undo hands the person back to the workspace's rule",
  );
});

test("a deal: the card's body to the person's deal route without the card's own word or the id the route takes as its param, the people surface told, and no undo -- a mis-recorded stage is moved again on the person's page", async () => {
  const t = tab();
  const r = await commitProposal(
    t.win,
    card("deal", {
      contact_id: P1,
      stage: "won",
      deal_id: DEAL1,
      version: 3,
      amount_cents: 250000,
      per: "month",
      who: "Maria",
    }),
    t.client,
  );
  assert.deepEqual(r, { ok: true, receipt: "Maria · Client", undo: null });
  assert.deepEqual(one(t), {
    key: `POST /api/v1/contacts/${P1}/deal`,
    body: { stage: "won", deal_id: DEAL1, version: 3, amount_cents: 250000, per: "month" },
    via: "ask",
    undoOf: undefined,
  });
  assert.ok(t.events.includes("event:surface:clients"));
  assert.deepEqual(
    await undoProposal(
      t.win,
      card("deal", { contact_id: P1, stage: "won", who: "Maria" }),
      { state: "done", receipt: "Maria · Client", atMs: 1, undo: null },
      t.client,
    ),
    { ok: false, message: "This one has no undo." },
  );
  assert.equal(t.sent.length, 1, "an undo the card does not have reaches no route");

  // A proposal's link, the day it stands and a reason for passing (0008) travel in the card's body like the rest.
  const p = tab();
  await commitProposal(
    p.win,
    card("deal", {
      contact_id: P1,
      stage: "proposed",
      amount_cents: 120000,
      per: "once",
      proposal_url: "https://docs.example.com/p/maria",
      valid_until: "2026-09-30",
      who: "Maria",
    }),
    p.client,
  );
  assert.deepEqual(one(p).body, {
    stage: "proposed",
    amount_cents: 120000,
    per: "once",
    proposal_url: "https://docs.example.com/p/maria",
    valid_until: "2026-09-30",
  });
  const l = tab();
  await commitProposal(
    l.win,
    card("deal", { contact_id: P1, stage: "lost", deal_id: DEAL1, version: 4, lost_reason: "price", who: "Maria" }),
    l.client,
  );
  assert.deepEqual(one(l).body, { stage: "lost", deal_id: DEAL1, version: 4, lost_reason: "price" });
});

test("a deal with its next step: the deal first, then the step as a note of the team's that names the row the door wrote, with its day; a step the door refused is said on the receipt, and the deal stands", async () => {
  const deal = `POST /api/v1/contacts/${P1}/deal`;
  const notes = `POST /api/v1/contacts/${P1}/notes`;
  const step = { body: "Send the onboarding form", due_on: "2026-09-18" };
  const withStep = card("deal", { contact_id: P1, stage: "won", deal_id: DEAL1, version: 3, who: "Maria" }, { step });
  const t = tab((key) =>
    key === deal ? envelope(ANSWERS[deal]) : key === notes ? envelope({ note: { id: "n1" } }) : null,
  );
  assert.deepEqual(await commitProposal(t.win, withStep, t.client), {
    ok: true,
    receipt: "Maria · Client · Step added",
    undo: null,
  });
  assert.deepEqual(t.sent, [
    { key: deal, body: { stage: "won", deal_id: DEAL1, version: 3 }, via: "ask", undoOf: undefined },
    {
      key: notes,
      body: { body: "Send the onboarding form", due_on: "2026-09-18", team_only: true, deal_id: DEAL1 },
      via: "ask",
      undoOf: undefined,
    },
  ]);
  assert.ok(t.events.indexOf("event:surface:clients") < t.events.indexOf("event:note:saved"), "People, then the page");
  const r = tab((key) =>
    key === deal ? envelope(ANSWERS[deal]) : refusal(400, "validation", "A note is at most 600 characters."),
  );
  assert.deepEqual(await commitProposal(r.win, withStep, r.client), {
    ok: true,
    receipt: "Maria · Client · the next step was not saved: A note is at most 600 characters.",
    undo: null,
  });
  assert.equal(r.sent.length, 2);
  assert.ok(!r.events.includes("event:note:saved"), "nothing saved, nothing said");
  // A new proposal's card names no deal: the step names the row the door wrote.
  const DEAL2 = "dddddddd-dddd-4ddd-8ddd-dddddddddd22";
  const fresh = tab((key) =>
    key === deal
      ? envelope({ deal: { id: DEAL2, stage: "proposed", version: 1 }, from: null, decision_id: "x" })
      : key === notes
        ? envelope({ note: { id: "n2" } })
        : null,
  );
  await commitProposal(
    fresh.win,
    card("deal", { contact_id: P1, stage: "proposed", service: "SEO", who: "Maria" }, { step }),
    fresh.client,
  );
  assert.deepEqual(
    fresh.sent.map((x) => x.body),
    [
      { stage: "proposed", service: "SEO" },
      { body: "Send the onboarding form", due_on: "2026-09-18", team_only: true, deal_id: DEAL2 },
    ],
  );
  // A deal the door refused writes no step.
  const no = tab(() => refusal(409, "conflict", "Someone moved this deal."));
  assert.equal((await commitProposal(no.win, withStep, no.client)).ok, false);
  assert.equal(no.sent.length, 1);
});

test("the step's write answers as the door takes it: People is read again behind it, after the deal's own read", async () => {
  const log = [];
  const client = createApi({
    fetch: async (url, init) => {
      const key = `${init.method} ${String(url).replace(/\?.*$/, "")}`;
      return envelope(key.endsWith("/deal") ? ANSWERS[`POST /api/v1/contacts/${P1}/deal`] : { note: { id: "n3" } });
    },
    workspace: () => A,
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: (key) => {
      log.push(`read after ${key}`);
      return new Promise((resolve) =>
        setTimeout(() => {
          log.push(`read done ${key}`);
          resolve();
        }, 30),
      );
    },
    now: () => 1_000,
  });
  const step = { body: "Send the onboarding form", due_on: "2026-09-18" };
  await commitProposal(
    { dispatchEvent: () => true },
    card("deal", { contact_id: P1, stage: "won", deal_id: DEAL1, version: 3, who: "Maria" }, { step }),
    client,
  );
  log.push("committed");
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(log, [
    "read after POST contacts/[id]/deal",
    "read done POST contacts/[id]/deal",
    "read after POST contacts/[id]/notes",
    "committed",
    "read done POST contacts/[id]/notes",
  ]);
});

test("a policy: the class with the mode or the dial, whichever the card carries; undo holds the previous values, or says it cannot", async () => {
  const t = tab();
  const r = await commitProposal(
    t.win,
    card("policy", { class: "reply", mode: "ask", previous: { mode: "auto", min_confidence: 0.6 } }),
    t.client,
  );
  assert.deepEqual(r, {
    ok: true,
    receipt: "Autonomy changed: the summary",
    undo: { class: "reply", mode: "auto", min_confidence: 0.6 },
  });
  assert.deepEqual(one(t).body, { class: "reply", mode: "ask" });
  const dial = tab();
  await commitProposal(dial.win, card("policy", { class: "reply", mode: "", min_confidence: 0.75 }), dial.client);
  assert.deepEqual(one(dial).body, { class: "reply", minConfidence: 0.75 }, "a dial edit carries no mode");
  const back = await undoProposal(
    t.win,
    card("policy", { class: "reply" }),
    { state: "done", receipt: "", atMs: 1, undo: { class: "reply", mode: "auto", min_confidence: 0.6 } },
    t.client,
  );
  assert.deepEqual(back, { ok: true, receipt: "Set back", undo: null });
  assert.deepEqual(t.sent.at(-1), {
    key: "PUT /api/v1/policies",
    body: { class: "reply", mode: "auto", minConfidence: 0.6 },
    via: "ask",
    undoOf: undefined,
  });
  assert.deepEqual(
    await undoProposal(
      t.win,
      card("policy", { class: "reply" }),
      { state: "done", receipt: "", atMs: 1, undo: { class: "reply", mode: null, min_confidence: null } },
      t.client,
    ),
    { ok: false, message: "The previous setting is unknown; change it in Settings." },
  );
});

test("a settings change: applied to the loaded config and sent with its version; the undo knows the version it wrote and restores only while nobody has saved since; nothing without a loaded config", async () => {
  const t = tab();
  const change = { op: "add_closure", date: "2026-12-25", note: "Christmas" };
  const before = t.win.__SETTINGS.config;
  const r = await commitProposal(t.win, card("settings", { change }), t.client);
  assert.deepEqual(
    r,
    { ok: true, receipt: "the summary", undo: { config: before, version_after: 4 } },
    "the version the save wrote travels with the undo",
  );
  const expected = applySettingsChange(before, change);
  assert.deepEqual(one(t).body, { config: expected, version: 3 });
  assert.deepEqual(expected.brain.profile.closures, [{ date: "2026-12-25", note: "Christmas" }]);
  // Someone saved again (the tab now reads version 5): the old config is not written over their save.
  t.win.__SETTINGS.version = 5;
  const stale = await undoProposal(
    t.win,
    card("settings", { change }),
    { state: "done", receipt: "", atMs: 1, undo: { config: before, version_after: 4 } },
    t.client,
  );
  assert.deepEqual(
    stale,
    { ok: false, message: "Settings have changed since this card — change them in Settings." },
    "REGRESSION: the undo wrote the whole earlier config over a later save",
  );
  assert.equal(t.sent.length, 1, "and nothing was sent");
  // Nobody saved since (the tab reads the version the card wrote): the undo restores.
  t.win.__SETTINGS.version = 4;
  const back = await undoProposal(
    t.win,
    card("settings", { change }),
    { state: "done", receipt: "", atMs: 1, undo: { config: before, version_after: 4 } },
    t.client,
  );
  assert.deepEqual(back, { ok: true, receipt: "Previous settings are back", undo: null });
  assert.deepEqual(t.sent.at(-1).body, { config: before, version: 4 });
  const cold = tab();
  cold.win.__SETTINGS = null;
  assert.deepEqual(await commitProposal(cold.win, card("settings", { change }), cold.client), {
    ok: false,
    message: "Settings are not loaded yet — open Settings once and try again.",
  });
  assert.deepEqual(
    await undoProposal(
      cold.win,
      card("settings", { change }),
      { state: "done", receipt: "", atMs: 1, undo: { config: {} } },
      cold.client,
    ),
    { ok: false, message: "Settings are not loaded yet." },
  );
  assert.equal(cold.sent.length, 0);
});

test("a broadcast and a playbook: the body the route expects, the receipt from the server's answer, the ids and the ledger rows kept for undo", async () => {
  const t = tab();
  const b = await commitProposal(
    t.win,
    card("broadcast", {
      template_id: "tpl-1",
      params: ["@first_name"],
      audience_kind: "list",
      audience_id: "quiet",
      scheduled_for: "2026-09-12T15:00:00.000Z",
      name: "Friday offer",
    }),
    t.client,
  );
  assert.deepEqual(b, {
    ok: true,
    receipt: "Broadcast “Friday offer” — 12 people, scheduled",
    undo: { broadcast_id: B1, decision_id: D(9) },
  });
  assert.deepEqual(t.sent[0].body, {
    template_id: "tpl-1",
    params: ["@first_name"],
    audience: { kind: "list", id: "quiet" },
    scheduled_for: "2026-09-12T15:00:00.000Z",
    name: "Friday offer",
  });
  const p = await commitProposal(
    t.win,
    card("playbook", {
      name: "Win-back",
      trigger: "quiet_30",
      template_id: "tpl-2",
      params: [],
      run_hour: 10,
      cap_per_run: 25,
      gap_days: 30,
      cadence_days: null,
    }),
    t.client,
  );
  assert.deepEqual(p, {
    ok: true,
    receipt: "Playbook “Win-back” is running — its next run is on the card in Campaigns › Playbooks",
    undo: { playbook_id: PB1, decision_id: D(0) },
  });
  assert.deepEqual(t.sent[1].body, {
    name: "Win-back",
    trigger: "quiet_30",
    template_id: "tpl-2",
    params: [],
    run_hour: 10,
    cap_per_run: 25,
    gap_days: 30,
    cadence_days: null,
  });
});

test("an undo names the decision it reverses: the inverse call carries the commit's ledger row as x-undo-of, on every kind that has one", async () => {
  const t = tab();
  const o = (undo) => ({ state: "done", receipt: "", atMs: 1, undo });
  assert.deepEqual(
    await undoProposal(
      t.win,
      card("reply", {}),
      o({ message_id: "m-9", cancelable_until: "x", decision_id: D(1) }),
      t.client,
    ),
    { ok: true, receipt: "Canceled before it sent", undo: null },
  );
  assert.deepEqual(
    await undoProposal(
      t.win,
      card("thread_verb", {}),
      o({ verb: "hand_back", conversation_id: C1, until: null, decision_id: D(2) }),
      t.client,
    ),
    { ok: true, receipt: "Undone", undo: null },
  );
  assert.deepEqual(
    await undoProposal(
      t.win,
      card("thread_verb", {}),
      o({ verb: "snooze", conversation_id: C1, until: "2026-09-13T10:00:00.000Z", decision_id: D(5) }),
      t.client,
    ),
    { ok: true, receipt: "Undone", undo: null },
  );
  assert.deepEqual(
    await undoProposal(
      t.win,
      card("person_mode", {}),
      o({ contact_id: P1, mode: "auto", decision_id: D(8) }),
      t.client,
    ),
    { ok: true, receipt: "Set back", undo: null },
  );
  assert.deepEqual(
    await undoProposal(t.win, card("broadcast", {}), o({ broadcast_id: B1, decision_id: D(9) }), t.client),
    { ok: true, receipt: "Canceled — nothing will send", undo: null },
  );
  assert.deepEqual(
    await undoProposal(t.win, card("playbook", {}), o({ playbook_id: PB1, decision_id: D(0) }), t.client),
    { ok: true, receipt: "Deleted — nothing will run", undo: null },
  );
  assert.deepEqual(
    t.sent.map((s) => [s.key, s.undoOf, s.via]),
    [
      ["POST /api/v1/messages/m-9/cancel-send", D(1), "ask"],
      [`POST /api/v1/conversations/${C1}/hand-back`, D(2), "ask"],
      [`POST /api/v1/conversations/${C1}/snooze`, D(5), "ask"],
      [`PUT /api/v1/contacts/${P1}/receptionist`, D(8), "ask"],
      [`POST /api/v1/broadcasts/${B1}/cancel`, D(9), "ask"],
      [`DELETE /api/v1/playbooks/${PB1}`, D(0), "ask"],
    ],
  );
  assert.deepEqual(
    t.sent[2].body,
    { until: "2026-09-13T10:00:00.000Z" },
    "the snooze undone by a wake, or here a wake by a snooze, carries its until",
  );
  assert.deepEqual(t.sent[3].body, { mode: "auto" });
  // A commit whose route answered no row (an older receipt): the undo still goes, unlinked.
  const old = tab();
  await undoProposal(old.win, card("reply", {}), o({ message_id: "m-9", cancelable_until: "x" }), old.client);
  assert.deepEqual([old.sent[0].key, old.sent[0].undoOf], ["POST /api/v1/messages/m-9/cancel-send", undefined]);
  // A broadcast already sending is stopped, not canceled, and the receipt says so.
  const mid = tab((key) =>
    envelope(key.endsWith("/cancel") ? { id: B1, state: "canceled", was: "sending", decision_id: "x" } : {}),
  );
  assert.equal(
    (await undoProposal(mid.win, card("broadcast", {}), o({ broadcast_id: B1 }), mid.client)).receipt,
    "Stopped — it ends after this batch",
  );
});

test("no undo, an unknown inverse, and an unknown kind are each refused in words, and nothing leaves the tab", async () => {
  const t = tab();
  assert.deepEqual(await undoProposal(t.win, card("reply", {}), { state: "done", receipt: "", atMs: 1 }, t.client), {
    ok: false,
    message: "This one has no undo.",
  });
  assert.deepEqual(
    await undoProposal(
      t.win,
      card("thread_verb", {}),
      { state: "done", receipt: "", atMs: 1, undo: { verb: "resolve" } },
      t.client,
    ),
    { ok: false, message: "This one has no undo." },
  );
  assert.deepEqual(
    await undoProposal(t.win, card("steer", {}), { state: "done", receipt: "", atMs: 1, undo: { x: 1 } }, t.client),
    { ok: false, message: "This one has no undo." },
  );
  assert.deepEqual(await commitProposal(t.win, card("teleport", {}), t.client), {
    ok: false,
    message: "This card cannot be approved from here.",
  });
  assert.equal(t.sent.length, 0);
});

test("the server's refusal is the card's answer, in the server's words", async () => {
  const t = tab(() => refusal(403, "forbidden", "Viewers can see everything and change nothing."));
  // A5: the refusal carries the kind of no (refusals-in-our-words) beside the server's own sentence.
  assert.deepEqual(
    await commitProposal(t.win, card("reply", { conversation_id: C1, text: "x", who: "Rosa" }), t.client),
    {
      ok: false,
      code: "forbidden",
      status: 403,
      title: "Not allowed",
      message: "Viewers can see everything and change nothing.",
      retryAfterS: null,
      fields: null,
    },
  );
});

test("edit in the composer: the thread's route, then the words handed to the composer", () => {
  const t = tab();
  editReply(t.win, card("reply", { conversation_id: C1, text: "On our way." }));
  assert.equal(t.win.location.hash, `/inbox/th-${C1}`);
  assert.ok(t.events.includes("event:inbox:focus-composer"));
});

test("the ledger writer: an undo that names a decision the database does not have keeps the row without the link, and says so, rather than failing the verb", async () => {
  const inserted = [];
  const said = [];
  const realError = console.error;
  console.error = (...a) => said.push(a.join(" "));
  const supabase = {
    from: (table) => ({
      insert: (row) => {
        assert.equal(table, "decisions");
        inserted.push(row);
        return {
          select: () => ({
            single: async () =>
              inserted.length === 1
                ? {
                    data: null,
                    error: {
                      code: "23503",
                      message: 'insert or update on table "decisions" violates foreign key constraint',
                    },
                  }
                : { data: { id: "d-new" }, error: null },
          }),
        };
      },
    }),
  };
  try {
    const id = await recordDecision(
      { supabase, userId: "u1", via: "ask", undoOf: D(7) },
      A,
      "contact",
      P1,
      "resume_agent",
      { receptionist_mode: "auto" },
    );
    assert.equal(id, "d-new");
    assert.deepEqual(
      inserted.map((r) => r.undo_of),
      [D(7), null],
      "once with the link, then without",
    );
    assert.deepEqual(
      [
        inserted[0].actor_type,
        inserted[0].actor_user_id,
        inserted[0].tenant_id,
        inserted[0].subject_type,
        inserted[0].subject_id,
        inserted[0].verb,
      ],
      ["user", "u1", A, "contact", P1, "resume_agent"],
      "the actor is the session, never an argument",
    );
    assert.deepEqual(inserted[1].payload, { receptionist_mode: "auto", via: "ask" }, "the card's mark stays");
    assert.ok(said.some((l) => l.startsWith("decision_undo_of_unknown")));
  } finally {
    console.error = realError;
  }
  // Any other refusal is the verb's failure, as before.
  const refusing = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { code: "42501", message: "permission denied" } }),
        }),
      }),
    }),
  };
  await assert.rejects(
    recordDecision({ supabase: refusing, userId: "u1", undoOf: D(7) }, A, "contact", P1, "resume_agent"),
    /decision: permission denied/,
  );
});
