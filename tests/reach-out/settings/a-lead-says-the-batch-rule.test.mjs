/**
 * A lead's line says when its email goes, and "after your OK" only of a sequence whose next batch asks: since first emails
 * follow Before each batch (decision 0077, amended 9 Nov 2026), being on a list no longer means waiting; a first run whose
 * words are new still asks whatever the mode (contracts coldBatchAsks, the rule its run plans by). A mode that could not
 * be read says nothing either way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { findLeadTimeline } = await import("../../../apps/dashboard/src/server/campaigns/reach-out-leads.ts");

const T = "11111111-1111-4111-8111-111111111111";
const story = () => ({
  lead_id: "l1",
  sends: [],
  chain: { root_id: "r1", name: "Clinics", state: "running", fed_by: "list" },
});
/** Its root, with its words let go at `wordsOk` (null: a first run still to approve). */
const read = (mode, wordsOk = "2026-11-08T15:00:00Z") =>
  findLeadTimeline(
    {
      supabase: fakeDb(
        {
          sequences: [{ id: "r1", tenant_id: T, mode }],
          sequence_steps: [
            {
              id: "r1",
              sequence_id: "r1",
              tenant_id: T,
              kind: "reach_out",
              trigger: "lead_first",
              name: "Clinics",
              state: "running",
              lead_search_id: null,
              words_ok_at: wordsOk,
            },
          ],
        },
        {},
        { reach_out_lead_timeline: story },
      ),
    },
    T,
    "l1",
  );

test("a sequence that holds for a stop does not ask, once its words are let go", async () => {
  assert.equal((await read("veto")).chain.asks, false);
});

test("a held sequence's first run, its words new, still asks: its line says after your OK", async () => {
  assert.equal((await read("veto", null)).chain.asks, true);
});

test("a sequence that asks says so, and so does a mode it cannot take", async () => {
  assert.equal((await read("ask")).chain.asks, true);
  assert.equal((await read("something else")).chain.asks, true);
});

test("a lead with no sequence reads no mode", async () => {
  const db = fakeDb({}, {}, { reach_out_lead_timeline: () => ({ lead_id: "l1", sends: [], chain: null }) });
  assert.equal((await findLeadTimeline({ supabase: db }, T, "l1")).chain, null);
});
