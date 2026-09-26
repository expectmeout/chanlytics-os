/**
 * Which row may be set to which mode is one rule (contracts policyModeOffered, over POLICY_CLASS_MODES), and the
 * three places a mode is chosen read it: the Autonomy pane draws a dot only where it holds, PUT /api/v1/policies
 * refuses a mode where it does not, and Ask proposes only what the route would take -- each refusal in the words
 * policyModeRefusal says. All three run here, for every class and every mode.
 *
 * Veto is where they disagreed. A playbook run under veto is real: planRun schedules it thirty minutes ahead, Today
 * draws it with a Stop, and the Stop withdraws the send (core-run-playbook.test.mjs, playbooks.test.mjs). The pane
 * drew the Re-engage and Standing offers veto dots and said what they do, while the route and Ask refused veto for
 * every row but Replies -- a rule written before playbooks existed. A tap on those dots was refused.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import {
  POLICY_CLASSES,
  POLICY_CLASS_MODES,
  POLICY_MODES,
  REPLY_DELAY_MIN_MS,
  REPLY_DELAY_MAX_MS,
  policyModeOffered,
  policyModeRefusal,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const policies = await import(at("apps/dashboard/app/api/v1/policies/route.ts"));
const { newToolContext } = await import(at("apps/dashboard/src/server/ask/tools.ts"));
const { buildProposal } = await import(at("apps/dashboard/src/server/ask/proposals.ts"));
const { uiRows, installPolicyStore, UI_ROWS } = await import(at("apps/dashboard/src/legacy-bridge/policy-store.ts"));
beforeEach(() => setRateStore(memoryStore()));

const W = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const NOW = new Date("2026-09-14T14:00:00Z");
const LABEL = { auto: "Auto", veto: "Veto", ask: "Ask", never: "Never" };

/** A workspace with a row for every class, where deals are on (so Ask may speak of the follow-ups' row, 0006). */
const tables = (role = "operator") => ({
  memberships: [
    { user_id: USER, tenant_id: W, role, tenants: { slug: "bayside" }, created_at: "2026-02-01T00:00:00Z" },
  ],
  tenants: [{ id: W, name: "Bayside", timezone: "America/New_York", sells_by: "proposal" }],
  policies: POLICY_CLASSES.map((cls) => ({
    id: `${cls}-w`,
    tenant_id: W,
    class: cls,
    mode: cls === "money" ? "never" : "ask",
    subject_type: null,
    subject_id: null,
    limits: { max_replies_day: 20 },
    updated_at: "2026-09-01T00:00:00Z",
  })),
  events: [],
  decisions: [],
});
const ctxFor = (t) => ({ supabase: fakeDb(t, {}, {}), userId: USER, email: "ada@example.com", params: {} });
const put = (t, body) =>
  policies.PUT.run(
    new Request(`http://localhost/api/v1/policies?workspace=${W}`, { method: "PUT", body: JSON.stringify(body) }),
    ctxFor(t),
  );
const refusedWith = (p, words) =>
  assert.rejects(p, (e) => {
    assert.equal(e.code, "validation", e.message);
    assert.equal(e.message, words);
    return true;
  });

test("the rule: a class takes exactly the modes POLICY_CLASS_MODES gives it, and nothing it does not know", () => {
  for (const cls of POLICY_CLASSES)
    for (const mode of POLICY_MODES) {
      assert.equal(policyModeOffered(cls, mode), POLICY_CLASS_MODES[cls].includes(mode), `${cls} ${mode}`);
      assert.equal(policyModeRefusal(cls, mode) === null, policyModeOffered(cls, mode), `${cls} ${mode}`);
    }
  assert.equal(policyModeOffered("nope", "auto"), false);
  assert.equal(policyModeOffered("toString", "auto"), false, "a name every object has is not a class");
  assert.equal(policyModeOffered("reply", "loud"), false);
  // Veto is real wherever something waits to be stopped: a reply in the hold window, a playbook run thirty minutes out.
  for (const cls of ["reply", "reengage", "campaign"]) assert.ok(policyModeOffered(cls, "veto"), cls);
  for (const cls of ["booking", "faq", "reviews", "follow_up", "money"])
    assert.ok(!policyModeOffered(cls, "veto"), cls);
});

test("the refusals say why, in the owner's words: nothing to hold, no never for bookings and questions, money locked", () => {
  assert.equal(policyModeRefusal("booking", "veto"), "The Bookings row has nothing to hold for review.");
  assert.equal(policyModeRefusal("reviews", "veto"), "The Reviews row has nothing to hold for review.");
  assert.equal(
    policyModeRefusal("faq", "never"),
    'Bookings and service questions are answered by the receptionist or by you — there is no "never".',
  );
  assert.equal(policyModeRefusal("money", "auto"), "The money row cannot be set to auto.");
});

test("the route takes a mode where the rule offers it and refuses it, in the rule's words, where it does not", async () => {
  for (const cls of POLICY_CLASSES)
    for (const mode of POLICY_MODES) {
      // Thirty-two changes in a row would meet the settings rate, which is not the rule under test.
      setRateStore(memoryStore());
      const t = tables();
      if (policyModeOffered(cls, mode)) {
        const r = await put(t, { class: cls, mode });
        assert.equal(r.policy.mode, mode, `${cls} ${mode}`);
        assert.equal(t.policies.find((p) => p.class === cls).mode, mode, `${cls} ${mode} is stored`);
      } else {
        await refusedWith(put(t, { class: cls, mode }), policyModeRefusal(cls, mode));
        assert.equal(t.policies.find((p) => p.class === cls).mode, cls === "money" ? "never" : "ask", "nothing moved");
      }
    }
});

test("Re-engage and Standing offers can hold a run for thirty minutes: set, stored, and recorded in the ledger", async () => {
  const t = tables();
  for (const cls of ["reengage", "campaign"]) {
    const r = await put(t, { class: cls, mode: "veto" });
    assert.deepEqual([r.policy.class, r.policy.mode], [cls, "veto"]);
  }
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.data.class, e.data.mode]),
    [
      ["policy.changed", "reengage", "veto"],
      ["policy.changed", "campaign", "veto"],
    ],
  );
});

test("the reply's own dials stay the reply's: a delay on a playbook row is refused, the mode it keeps untouched", async () => {
  const t = tables();
  await refusedWith(
    put(t, { class: "reengage", replyDelayMs: 60_000 }),
    "A reply delay only applies to the reply policy.",
  );
  const r = await put(t, { class: "reply", replyDelayMs: 60_000 });
  assert.deepEqual([r.policy.mode, r.policy.limits], ["ask", { max_replies_day: 20, reply_delay_ms: 60_000 }]);
  // The bounds the route checks are the ones the reader clamps to: two ranges would mean a value the runtime changes.
  assert.equal(REPLY_DELAY_MIN_MS, 5_000);
  assert.equal(REPLY_DELAY_MAX_MS, 600_000);
});

test("changing autonomy is an operator's: a viewer is refused at the door", async () => {
  await assert.rejects(put(tables("viewer"), { class: "reengage", mode: "veto" }), (e) => e.status === 403);
});

test("Ask proposes a mode where the route would take it, and refuses with the route's words where it would not", async () => {
  const tc = newToolContext(ctxFor(tables()), W, "operator", "America/New_York", NOW);
  for (const cls of POLICY_CLASSES.filter((c) => c !== "money"))
    for (const mode of POLICY_MODES) {
      const r = await buildProposal(tc, "propose_policy", { class: cls, mode });
      if (policyModeOffered(cls, mode)) {
        assert.equal(r.isError, false, `${cls} ${mode}: ${r.result}`);
        assert.deepEqual([r.proposal.kind, r.proposal.payload.class, r.proposal.payload.mode], ["policy", cls, mode]);
      } else {
        assert.equal(r.isError, true, `${cls} ${mode}`);
        assert.equal(JSON.parse(r.result).error, policyModeRefusal(cls, mode), `${cls} ${mode}`);
      }
    }
  const money = await buildProposal(tc, "propose_policy", { class: "money", mode: "never" });
  assert.match(money.result, /money stays owner-only by charter/, "money is answered in words, never proposed");
});

test("the Autonomy pane draws a dot exactly where the rule offers the mode, and writes only such a mode", () => {
  const rows = uiRows({ rows: [], role: "owner", dealsOn: true });
  assert.deepEqual(
    rows.map((r) => r.cls).sort(),
    POLICY_CLASSES.filter((c) => UI_ROWS.some((r) => r.cls === c)).sort(),
  );
  for (const r of rows)
    assert.deepEqual(
      r.modes,
      POLICY_CLASS_MODES[r.cls].map((m) => LABEL[m]),
      r.cls,
    );

  const writes = [];
  const win = {
    POLICY: undefined,
    __POLICIES: { rows: [], role: "owner", dealsOn: true },
    __setPolicy: async (cls, mode) => writes.push([cls, mode]),
  };
  installPolicyStore(win);
  for (const r of UI_ROWS) for (const m of Object.values(LABEL)) win.POLICY.set(r.id, m);
  const expected = UI_ROWS.filter((r) => !r.locked).flatMap((r) =>
    POLICY_MODES.filter((m) => policyModeOffered(r.cls, m)).map((m) => [r.cls, m]),
  );
  assert.deepEqual(writes, expected, "a tap reaches the route only for a mode the row offers");
  assert.ok(
    writes.some(([c, m]) => c === "reengage" && m === "veto") &&
      writes.some(([c, m]) => c === "campaign" && m === "veto"),
  );
});
