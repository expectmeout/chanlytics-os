/**
 * Which row may be set to which mode is one rule (contracts policyModeOffered, over POLICY_CLASS_MODES), and the
 * places a mode is chosen read it: the Autonomy pane draws a dot only where it holds, and PUT /api/v1/policies refuses
 * a mode where it does not, in the words policyModeRefusal says. Both run here, for every class and every mode.
 *
 * Veto is where they disagreed. A playbook run under veto is real: planRun schedules it thirty minutes ahead, Today
 * draws it with a Stop, and the Stop withdraws the send (core-run-playbook.test.mjs, playbooks.test.mjs). The pane
 * drew the Re-engage and Standing offers veto dots and said what they do, while the route refused veto for every row
 * but Replies (and, since Reach out Part 3, a reach-out's) -- a rule written before playbooks existed. A tap on those
 * dots was refused.
 *
 * Ask's autonomy card (server/ask/tools/act/policy.ts) still refuses veto on every row but Replies: stricter than the
 * route, so it never offers a card the route would refuse. It moves to policyModeRefusal with Ask Rewired.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const policies = await import(at("apps/dashboard/app/api/v1/policies/route.ts"));
const { uiRows, installPolicyStore, UI_ROWS } = await import(at("apps/dashboard/src/legacy-bridge/policy-store.ts"));
beforeEach(() => setRateStore(memoryStore()));

const W = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const LABEL = { auto: "Auto", veto: "Veto", ask: "Ask", never: "Never" };

/** A workspace with a row for every class. */
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
  // Veto is real wherever something waits to be stopped: a reply in the hold window, a playbook run thirty minutes
  // out, a reach-out's later run.
  for (const cls of ["reply", "reengage", "campaign", "outreach"]) assert.ok(policyModeOffered(cls, "veto"), cls);
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
  assert.equal(policyModeRefusal("outreach", "auto"), "The outreach row cannot be set to auto.");
});

test("the route takes a mode where the rule offers it and refuses it, in the rule's words, where it does not", async () => {
  for (const cls of POLICY_CLASSES)
    for (const mode of POLICY_MODES) {
      // Thirty-six changes in a row would meet the settings rate, which is not the rule under test.
      setRateStore(memoryStore());
      const t = tables();
      setServiceClient(fakeDb(t, {}, {}));
      if (policyModeOffered(cls, mode)) {
        const r = await put(t, { class: cls, mode });
        assert.equal(r.policy.mode, mode, `${cls} ${mode}`);
        assert.equal(t.policies.find((p) => p.class === cls).mode, mode, `${cls} ${mode} is stored`);
      } else {
        await refusedWith(put(t, { class: cls, mode }), policyModeRefusal(cls, mode));
        assert.equal(t.policies.find((p) => p.class === cls).mode, cls === "money" ? "never" : "ask", "nothing moved");
      }
    }
  setServiceClient(null);
});

test("Re-engage and Standing offers can hold a run for thirty minutes: set, stored, and recorded in the ledger", async () => {
  const t = tables();
  setServiceClient(fakeDb(t, {}, {}));
  try {
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
  } finally {
    setServiceClient(null);
  }
});

test("the reply's own dials stay the reply's: a delay on a playbook row is refused, the mode it keeps untouched", async () => {
  const t = tables();
  setServiceClient(fakeDb(t, {}, {}));
  try {
    await refusedWith(
      put(t, { class: "reengage", reply_delay_ms: 60_000 }),
      "A reply delay only applies to the reply policy.",
    );
    // Validated at the boundary, not only on read: a value out of range would be corrected when read, and the
    // workspace would see a number it never chose.
    await assert.rejects(
      put(t, { class: "reply", reply_delay_ms: 1_000 }),
      (e) => e.code === "validation" && /reply delay must be between/.test(e.message),
    );
    // One dial set does not wipe the others the row keeps.
    const r = await put(t, { class: "reply", reply_delay_ms: 60_000 });
    assert.deepEqual([r.policy.mode, r.policy.limits], ["ask", { max_replies_day: 20, reply_delay_ms: 60_000 }]);
  } finally {
    setServiceClient(null);
  }
  // The bounds the route checks are the ones the reader clamps to: two ranges would mean a value the runtime changes.
  assert.equal(REPLY_DELAY_MIN_MS, 5_000);
  assert.equal(REPLY_DELAY_MAX_MS, 600_000);
});

test("changing autonomy is an operator's: a viewer is refused at the door", async () => {
  await assert.rejects(put(tables("viewer"), { class: "reengage", mode: "veto" }), (e) => e.status === 403);
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
