/**
 * The three writers read How it reaches out (decision 0113): the sequence's drafter (ownerSaid, which New and a rewrite
 * share), the opening writer at the edge (checkWorkspaceOf), and the reply drafter's steer (replyOfferSteer). A workspace
 * that never opened the page is told what it was told before; one that did is told the owner's own words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { newReceptionistDefaults, replyOfferSteer } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { ownerSaid } = await import("../../../apps/dashboard/src/server/drafts/sequence.ts");
const { checkWorkspaceOf } = await import("../../../apps/edge/lib/campaigns/reach-out/check-one.ts");

const T = "11111111-1111-4111-8111-111111111111";
const said = (known) => ownerSaid(known).filter(Boolean);

test("without the page, the drafter is told the goal, what the business does and its tone, as before", () => {
  const lines = said({ goal: "Twenty new clinics a month", about: "We clean offices", services: [], tone: "Warm" });
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^What it is working toward, which an email to leads offers: /);
  assert.match(lines[1], /^What the business does, in its own words: /);
  assert.match(lines[2], /^How the business sounds, in its own words: /);
});

test("with the page, the offer stands in the goal's place, and who, what it fixes and the claims are told as data", () => {
  const lines = said({
    goal: "Twenty new clinics a month",
    offer: "After-hours cleaning for dental offices",
    whoFor: "Dental clinics in Austin",
    fixes: "Cleaners who come in during opening hours",
    proof: ["We clean 40 clinics across Austin today."],
  });
  assert.match(lines[0], /^What it offers the businesses it writes to, in its owner's words: .*After-hours cleaning/);
  assert.ok(!lines.some((l) => l.startsWith("What it is working toward")), "the goal is Ask's, not the email's");
  assert.match(lines[1], /^Who it writes to, in its owner's words: .*Dental clinics in Austin/);
  assert.match(lines[2], /^What it fixes for them, in its owner's words: /);
  assert.match(lines[3], /use one at most in an email, word for word[\s\S]*We clean 40 clinics across Austin today\./);
});

/** A brain as a saved one is, which the config's parse takes: the product's defaults, the name and the profile. */
const brainWith = (profile) => ({
  business_name: "Brightline Cleaning",
  ...newReceptionistDefaults("Brightline Cleaning"),
  profile,
});

const workspaceDb = (config, about = null) =>
  fakeDb({
    tenants: [{ id: T, name: "Brightline Cleaning" }],
    tenant_config: [{ tenant_id: T, config }],
    business_records: [{ tenant_id: T, about: about ?? "" }],
  });

test("the opening writer reads the offer where the owner wrote one, else what the business does, as before", async () => {
  const before = await checkWorkspaceOf(workspaceDb({ brain: brainWith({ tone: "Warm" }) }, "We clean offices"), T);
  assert.deepEqual(before.opening, { name: "Brightline Cleaning", what_we_do: "We clean offices", tone: "Warm" });
  const after = await checkWorkspaceOf(
    workspaceDb(
      { brain: brainWith({ tone: "Warm" }), reach_out: { offer: "Evening cleaning", tone: "Direct" } },
      "We clean offices",
    ),
    T,
  );
  assert.deepEqual(after.opening, { name: "Brightline Cleaning", what_we_do: "Evening cleaning", tone: "Direct" });
});

test("the sender's workspace carries Sign-off's signature with its phone, and none where the rows are empty", async () => {
  const none = await checkWorkspaceOf(workspaceDb({ brain: brainWith({}) }), T);
  assert.equal(none.signature, null);
  const signed = await checkWorkspaceOf(
    workspaceDb({ brain: brainWith({}), reach_out: { signature: "Maya Ortiz\nOwner", phone: "(512) 555-0142" } }),
    T,
  );
  assert.equal(signed.signature, "Maya Ortiz\nOwner\n(512) 555-0142");
});

test("what an answer to a lead offers: nothing said for the booking link, a call, or the answer alone", () => {
  assert.equal(replyOfferSteer(undefined), null);
  assert.equal(replyOfferSteer("booking_link"), null);
  // No time of its own: the steer is told as the owner's words, and a time there would let a drafted promise of one
  // past the follow-up check (drafts/writer.ts promisesAFollowUpTime).
  assert.equal(replyOfferSteer("call"), "Offer a short call at a time that suits them, and no link.");
  assert.equal(replyOfferSteer("answer"), "Answer what they asked and offer nothing more: no link and no call.");
});
