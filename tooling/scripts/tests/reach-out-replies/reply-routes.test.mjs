/**
 * The replies' routes (Reach out Part 5, PR 6), run through route(): the real route modules, their `run` called with a
 * database in memory and the undo's two doors (00222) answered through the double's rpcs. What is proved is the policy
 * each declares, what the list says of each reading, and that each refusal of the undo is the door's reason in
 * contracts' words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { REPLY_UNDO_REFUSALS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EMAIL_DOMAIN = "mail.example.com";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const list = await import(at("apps/dashboard/app/api/v1/reach-out-replies/route.ts"));
const undo = await import(at("apps/dashboard/app/api/v1/reach-out-replies/[id]/undo/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
const ROOT_ID = "22222222-2222-4222-8222-222222222222";
const STEP2 = "33333333-3333-4333-8333-333333333333";
const NO = "44444444-4444-4444-8444-444444444401";
const YES = "44444444-4444-4444-8444-444444444402";
const THEIRS = "44444444-4444-4444-8444-444444444403";
const LEAD = "55555555-5555-4555-8555-555555555555";
const SEND = "66666666-6666-4666-8666-666666666666";
const HOUR = 3_600_000;

const reading = (id, over = {}) => ({
  message_id: id,
  tenant_id: A,
  conversation_id: CONV,
  read_at: new Date(Date.now() - HOUR).toISOString(),
  intent: "interested",
  claim: "person",
  summary: "Wants more details",
  named_day: null,
  refer_to: null,
  unread: null,
  rereads: 0,
  undone_at: null,
  draft: null,
  draft_state: "none",
  draft_why: null,
  lead_id: LEAD,
  send_id: SEND,
  ...over,
});
const tables = (role = "operator", over = {}) => ({
  memberships: [{ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  billing_accounts: [{ tenant_id: A, mode: "direct", status: "active" }],
  tenants: [{ id: A, name: "Harbor Moving Co", timezone: "America/Chicago" }],
  reach_out_replies: [
    reading(YES, {
      read_at: new Date(Date.now() - 2 * HOUR).toISOString(),
      draft: "Thank you for writing.",
      draft_state: "written",
    }),
    reading(NO, { intent: "no", summary: "Asks to be taken off the list" }),
    reading(THEIRS, { tenant_id: B }),
  ],
  leads: [{ id: LEAD, tenant_id: A, business_name: "Brightwater & Co." }],
  reach_out_sends: [{ id: SEND, tenant_id: A, playbook_id: STEP2, root_id: ROOT_ID }],
  playbooks: [
    { id: ROOT_ID, tenant_id: A, kind: "reach_out", name: "Reach out · Movers", after_playbook_id: null },
    { id: STEP2, tenant_id: A, kind: "reach_out", name: "Reach out · Movers · a nudge", after_playbook_id: ROOT_ID },
  ],
  messages: [],
  sending_domains: [],
  ...over,
});
/** The two doors, answered as the SQL answers: the undoable test from a table the case sets, and the undo it guards. */
const doors = (why = {}) => {
  const undone = [];
  return {
    undone,
    rpcs: {
      reach_out_reply_undoable: (a) => (a.p_message_id in why ? why[a.p_message_id] : null),
      reach_out_reply_undo: (a) => {
        undone.push(a.p_message_id);
        return { restored: 1 };
      },
    },
  };
};
const ctxFor = (t, params = {}, rpcs = {}) => ({
  supabase: fakeDb(t, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
const inA = `?workspace=${A}`;
const get = (q = inA) => new Request(`http://localhost/api/v1/x${q}`);
const post = () => new Request(`http://localhost/api/v1/x${inA}`, { method: "POST" });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    if (words) assert.equal(e.message, words);
    return true;
  });
}
const policy = (r) => ({ ...r.policy });

test("each route declares its policy: every member reads, an owner or operator undoes, the reading is the row", () => {
  assert.deepEqual(policy(list.GET), { kind: "read", scope: "workspace", role: null, rate: null, spend: false });
  assert.deepEqual(policy(undo.POST), {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "playbook",
    spend: false,
  });
});

test("GET reach-out-replies: newest first, what each was read as, its draft, its chain and step, and whether it may be undone", async () => {
  const d = doors({ [NO]: null });
  const { replies } = await list.GET.run(get(), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(
    replies.map((r) => r.message_id),
    [NO, YES],
    "newest first; another workspace's reading is not this one's",
  );
  const [no, yes] = replies;
  assert.deepEqual(
    [no.intent, no.summary, no.can_undo, no.undone, no.business, no.chain, no.step],
    ["no", "Asks to be taken off the list", true, false, "Brightwater & Co.", "Reach out · Movers", 2],
  );
  assert.deepEqual([yes.can_undo, yes.draft, yes.draft_state], [false, "Thank you for writing.", "written"]);
  assert.deepEqual(no.reply_from, { from: "mailbox", because: null }, "no reach-out email on the thread yet");

  const tooLate = await list.GET.run(get(), ctxFor(tables("viewer"), {}, doors({ [NO]: "too_late" }).rpcs));
  assert.equal(tooLate.replies[0].can_undo, false, "the door's own test decides");

  const one = await list.GET.run(get(`${inA}&conversation_id=${CONV}`), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.equal(one.replies.length, 2);
  const other = await list.GET.run(
    get(`${inA}&conversation_id=cccccccc-cccc-4ccc-8ccc-cccccccccc02`),
    ctxFor(tables("viewer"), {}, d.rpcs),
  );
  assert.equal(other.replies.length, 0);
  await refused(list.GET.run(get(`${inA}&conversation_id=nope`), ctxFor(tables("viewer"))), "validation", 400);
});

test("POST undo: an operator undoes a no; a viewer may not; each refusal is the door's reason in contracts' words", async () => {
  const d = doors();
  const out = await undo.POST.run(post(), ctxFor(tables("operator"), { id: NO }, d.rpcs));
  assert.equal(out.undone, true);
  assert.deepEqual(d.undone, [NO]);

  const viewer = doors();
  await refused(undo.POST.run(post(), ctxFor(tables("viewer"), { id: NO }, viewer.rpcs)), "forbidden", 403);
  assert.deepEqual(viewer.undone, [], "the door is never asked");

  for (const [why, code, status] of [
    ["not_a_no", "conflict", 409],
    ["already", "conflict", 409],
    ["too_late", "conflict", 409],
    ["moved", "conflict", 409],
    ["role", "forbidden", 403],
    ["not_found", "not_found", 404],
  ]) {
    const w = doors({ [NO]: why });
    await refused(
      undo.POST.run(post(), ctxFor(tables("operator"), { id: NO }, w.rpcs)),
      code,
      status,
      REPLY_UNDO_REFUSALS[why],
    );
    assert.deepEqual(w.undone, [], `${why}: nothing undone`);
  }
});

test("another workspace's reading, none, or a malformed id is not found, and nothing is undone", async () => {
  await refused(undo.POST.run(post(), ctxFor(tables("operator"), { id: THEIRS }, doors().rpcs)), "not_found", 404);
  await refused(
    undo.POST.run(post(), ctxFor(tables("operator"), { id: "44444444-4444-4444-8444-444444444499" }, doors().rpcs)),
    "not_found",
    404,
    REPLY_UNDO_REFUSALS.not_found,
  );
  // A malformed id names no reading (request-guards requireUuid): not found, and the door is never asked.
  const bad = doors();
  await refused(undo.POST.run(post(), ctxFor(tables("operator"), { id: "nope" }, bad.rpcs)), "not_found", 404);
  assert.deepEqual(bad.undone, []);
});

test("a door that refuses between the test and the act is told in the reason that holds then", async () => {
  let asked = 0;
  const rpcs = {
    reach_out_reply_undoable: () => (asked++ === 0 ? null : "moved"),
    reach_out_reply_undo: () => {
      throw Object.assign(new Error("They unsubscribed since, and that stays."), { code: "22023" });
    },
  };
  await refused(
    undo.POST.run(post(), ctxFor(tables("operator"), { id: NO }, rpcs)),
    "conflict",
    409,
    REPLY_UNDO_REFUSALS.moved,
  );
});
