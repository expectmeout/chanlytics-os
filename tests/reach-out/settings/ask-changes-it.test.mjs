/**
 * Ask changes How it reaches out by a card (decision 0113): each op judged by the one change schema, applied to the
 * config's reach_out section as the page's own folds write it, said in the card's one line, and opened on its row. The
 * card is proposed by propose_settings' answers action, its row's words as `text`, run here through the real registry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import {
  AskSettingsChangeSchema,
  applySettingsChange,
  describeSettingsChange,
  REACH_OUT_LIMITS,
} from "@chanlytics/contracts";

const config = { brain: { business_name: "Brightline" }, reach_out: { proof: ["We clean 40 clinics."] } };

test("an offer set, then emptied: the key written, then taken away with the section", () => {
  const set = applySettingsChange({ brain: {} }, { op: "set_offer", offer: "  Evening cleaning  " });
  assert.deepEqual(set.reach_out, { offer: "Evening cleaning" });
  const cleared = applySettingsChange(set, { op: "set_offer", offer: "" });
  assert.equal(cleared.reach_out, undefined);
  assert.equal(JSON.parse(JSON.stringify(cleared)).reach_out, undefined, "saved, it is left out");
});

test("a claim added once, never twice, and taken away by its words", () => {
  const added = applySettingsChange(config, { op: "add_claim", claim: "Every cleaner is insured." });
  assert.deepEqual(added.reach_out.proof, ["We clean 40 clinics.", "Every cleaner is insured."]);
  assert.deepEqual(applySettingsChange(added, { op: "add_claim", claim: "We clean 40 clinics." }).reach_out.proof, [
    "We clean 40 clinics.",
    "Every cleaner is insured.",
  ]);
  assert.deepEqual(applySettingsChange(added, { op: "remove_claim", claim: "We clean 40 clinics." }).reach_out.proof, [
    "Every cleaner is insured.",
  ]);
  assert.deepEqual(applySettingsChange(config, { op: "set_signed_by", name: "Maya" }).brain, config.brain);
});

test("the booking link, what an answer offered before the page, is stored as nothing", () => {
  const call = applySettingsChange(config, { op: "set_reply_offer", offer: "call" });
  assert.equal(call.reach_out.reply_offer, "call");
  assert.equal(
    "reply_offer" in applySettingsChange(call, { op: "set_reply_offer", offer: "booking_link" }).reach_out,
    false,
  );
});

test("the schema holds each op to the section's limits", () => {
  assert.equal(
    AskSettingsChangeSchema.safeParse({ op: "add_claim", claim: "x".repeat(REACH_OUT_LIMITS.claim + 1) }).success,
    false,
  );
  assert.equal(AskSettingsChangeSchema.safeParse({ op: "set_reply_offer", offer: "fax" }).success, false);
  assert.equal(AskSettingsChangeSchema.safeParse({ op: "set_cold_tone", tone: "Direct" }).success, true);
});

test("the card says what it changes in the page's words", () => {
  assert.equal(
    describeSettingsChange({ op: "set_offer", offer: "Evening cleaning" }),
    "What you offer: “Evening cleaning”",
  );
  assert.equal(
    describeSettingsChange({ op: "set_reply_offer", offer: "call" }),
    "An answer to a lead offers a call with you",
  );
});

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { buildProposal, newToolContext } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/ask/tools/index.ts")).href
);

test("Ask's answers action carries a row of How it reaches out, its words as text, to the change its card holds", async () => {
  const t = newToolContext(
    { supabase: fakeDb({}, {}, {}), userId: "u1", email: "ada@example.com", params: {} },
    "11111111-1111-4111-8111-111111111111",
    "owner",
    "America/New_York",
    new Date("2026-11-07T15:00:00Z"),
  );
  const card = async (row) => {
    const out = await buildProposal(t, "propose_settings", { action: "answers", row });
    assert.equal(out.isError, false, out.result);
    return out.proposal;
  };
  const claim = await card({ op: "add_claim", text: "We clean 40 clinics across Austin today." });
  assert.deepEqual(claim.payload.change, { op: "add_claim", claim: "We clean 40 clinics across Austin today." });
  assert.equal(claim.title, "A claim you stand behind");
  assert.equal(claim.summary, describeSettingsChange(claim.payload.change));
  assert.deepEqual((await card({ op: "set_reply_offer", text: "call" })).payload.change, {
    op: "set_reply_offer",
    offer: "call",
  });
  // A tone or a name sent in How it answers' own field is taken too, and an emptied row is a change.
  assert.deepEqual((await card({ op: "set_cold_tone", tone: "Plain" })).payload.change, {
    op: "set_cold_tone",
    tone: "Plain",
  });
  assert.deepEqual((await card({ op: "set_offer", text: "" })).payload.change, { op: "set_offer", offer: "" });
  // What the schema refuses is refused in its words, never proposed.
  const fax = await buildProposal(t, "propose_settings", {
    action: "answers",
    row: { op: "set_reply_offer", text: "fax" },
  });
  assert.equal(fax.isError, true);
});
