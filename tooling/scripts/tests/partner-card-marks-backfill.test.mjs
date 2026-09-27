/**
 * The card-mark backfill (tooling/scripts/partner-card-marks-backfill.mjs, decision 0012): its planning, its reads
 * of Stripe over a stand-in, and its writes over a database in memory. The script's main is not run; its parts are,
 * the ones a dry run and an apply share.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planCardMarks, readFingerprints, rejudge, writeCardMarks } from "../partner-card-marks-backfill.mjs";
import { fakeDb } from "./_fake-db.mjs";

const sub = (fingerprint) => ({
  id: "sub",
  default_payment_method: fingerprint ? { id: "pm", card: { fingerprint } } : null,
});

test("the plan: a subscription to read and no mark kept yet; one marked already, or with no subscription, is left", () => {
  const plan = planCardMarks(
    [
      { tenant_id: "t1", stripe_subscription_id: "sub_1" },
      { tenant_id: "t2", stripe_subscription_id: "sub_2" },
      { tenant_id: "t3", stripe_subscription_id: null },
    ],
    ["t2"],
  );
  assert.deepEqual(plan, [{ tenant_id: "t1", subscription: "sub_1" }]);
});

test("the reads: the card Stripe fingerprints, and a subscription with no card or a read that fails is said, never guessed", async () => {
  const answers = { sub_1: sub("fp_a"), sub_2: sub(null) };
  const { found, missed } = await readFingerprints(
    [
      { tenant_id: "t1", subscription: "sub_1" },
      { tenant_id: "t2", subscription: "sub_2" },
      { tenant_id: "t3", subscription: "sub_3" },
    ],
    async (id) => {
      if (!answers[id]) throw new Error("No such subscription");
      return answers[id];
    },
  );
  assert.deepEqual(found, [{ tenant_id: "t1", subscription: "sub_1", fingerprint: "fp_a" }]);
  assert.deepEqual(
    missed.map((m) => [m.tenant_id, m.why]),
    [
      ["t2", "Stripe says no card on its default payment method"],
      ["t3", "read: No such subscription"],
    ],
  );
});

test("the writes: through the webhook's own door, counted, a refusal said", async () => {
  const asked = [];
  const db = fakeDb(
    {},
    {},
    {
      billing_card_mark: (a) => {
        asked.push(a);
        if (a.p_tenant_id === "t2") throw Object.assign(new Error("boom"), { code: "XX000" });
        return null;
      },
    },
  );
  const { written, skipped } = await writeCardMarks(db, [
    { tenant_id: "t1", fingerprint: "fp_a" },
    { tenant_id: "t2", fingerprint: "fp_b" },
  ]);
  assert.deepEqual(asked, [
    { p_tenant_id: "t1", p_fingerprint: "fp_a" },
    { p_tenant_id: "t2", p_fingerprint: "fp_b" },
  ]);
  assert.deepEqual([written.map((w) => w.tenant_id), skipped.map((s) => s.tenant_id)], [["t1"], ["t2"]]);
});

test("judged again: only the sweep's own qualified decisions, never a person's", async () => {
  const tables = {
    partner_tenants: [
      { tenant_id: "t1", standing: "qualified", standing_by: null, standing_why: null, checks: { same_card: false } },
      { tenant_id: "t2", standing: "qualified", standing_by: "u-admin", standing_why: "Checked." },
    ],
  };
  const db = fakeDb(tables);
  const again = await rejudge(db, [{ tenant_id: "t1" }, { tenant_id: "t2" }]);
  assert.deepEqual(again, ["t1"]);
  assert.equal(tables.partner_tenants[0].standing, null);
  assert.equal(tables.partner_tenants[1].standing, "qualified", "a person's decision stays");
});
