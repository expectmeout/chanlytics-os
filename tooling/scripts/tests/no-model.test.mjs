/**
 * The receptionist without a model (PRD AI-04): the workspace's greeting goes
 * only as a labelled fallback, the thread goes to a person under a reason the
 * closed set knows, and the platform is paged under one stable key. The plan
 * is a pure step in steps.ts; inbound.ts applies it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESCALATION_REASONS } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { noModelPlan, NO_MODEL_PAGE } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/steps.ts")).href
);

test("no model: the workspace's own greeting goes as a labelled fallback, and the thread goes to a person", () => {
  const plan = noModelPlan({ greeting: "Thanks for writing to Melany's. A person will be with you shortly." });
  assert.equal(
    plan.replyText,
    "Thanks for writing to Melany's. A person will be with you shortly.",
    "the workspace's words, not ours",
  );
  assert.deepEqual(plan.meta, { ack: true, fallback: "no_model" }, "the message row says what it is");
  assert.equal(plan.escalate, true, "a person takes the thread");
  assert.ok(ESCALATION_REASONS.includes(plan.escalationReason), "under a reason the closed set knows");
  const details = plan.escalationDetails("is my order ready?");
  assert.match(details, /no model key/, "the escalation says why");
  assert.match(details, /is my order ready\?/, "and keeps the customer's words");
  assert.equal(plan.alertReason, "no model");
});

test("the platform is paged under one stable key, and the page carries no secret", () => {
  assert.equal(NO_MODEL_PAGE.key, "brain_unavailable");
  assert.match(NO_MODEL_PAGE.subject, /no model key/);
  assert.match(NO_MODEL_PAGE.body, /ANTHROPIC_API_KEY is not set/, "names the variable, so the fix is obvious");
  assert.ok(!/sk-ant-/.test(NO_MODEL_PAGE.body), "and never a value");
});
