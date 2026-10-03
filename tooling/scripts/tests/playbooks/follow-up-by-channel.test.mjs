/**
 * The proposal follow-up's facts stop on the number or on Meta's approval exactly as its run does (One message, every
 * channel, step 3): by the channels the playbook ticks. The run (core run-playbook) asks contracts' playbookStopBy, and so
 * does the dashboard's followUpFacts (what People and Today say of the follow-up), so the page never promises a run that
 * stops, and never says nothing of one that goes. Before, the facts passed no `byOthers`: a follow-up that also went by
 * email or text was read as stopped by a WhatsApp template Meta had not approved, though its run went on for them.
 *
 * Executed: the real followUpFacts over a database in memory, and the one helper the run asks, over every cell of its table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { playbookRunStop, playbookStopBy } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { followUpFacts } = await import(at("apps/dashboard/src/server/campaigns/playbooks.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-10-03T16:00:00.000Z");
const DAY = 86_400_000;

/**
 * A workspace whose proposal follow-up runs (its class asks, a proposal is out), going by `channels` (none named: the
 * column the database before 00287 has not got, WhatsApp alone), its WhatsApp template at `status` with Meta, and a number
 * connected or not.
 */
const world = ({ channels, status = "approved", number = true } = {}) => ({
  playbooks: [
    {
      id: "pb1",
      tenant_id: A,
      trigger: "proposal_waiting",
      state: "running",
      run_hour: 10,
      last_run_for: null,
      template_name: "proposal_follow_up",
      template_language: "en_US",
      ...(channels ? { channels } : {}),
    },
  ],
  policies: [{ tenant_id: A, class: "follow_up", subject_type: null, subject_id: null, mode: "ask" }],
  tenants: [{ id: A, status: "active", timezone: "UTC" }],
  tenant_channels: number
    ? [{ tenant_id: A, kind: "whatsapp", status: "active", config: { quality_rating: "GREEN" } }]
    : [],
  deals: [
    { id: "d1", tenant_id: A, contact_id: P, stage: "proposed", proposed_at: new Date(NOW - 10 * DAY).toISOString() },
  ],
  templates: [
    {
      tenant_id: A,
      channel: "whatsapp",
      name: "proposal_follow_up",
      language: "en_US",
      meta_status: status,
      category: "utility",
    },
  ],
  broadcasts: [],
  broadcast_recipients: [],
});
const factsOf = (over) => followUpFacts({ supabase: fakeDb(world(over)) }, A, NOW);

test("a follow-up that goes by WhatsApp alone is stopped by a template Meta has not approved: no facts, as its run would send nothing", async () => {
  assert.equal(await factsOf({ channels: ["whatsapp"], status: "pending" }), null, "ticked WhatsApp alone");
  assert.equal(
    await factsOf({ status: "pending" }),
    null,
    "no channels kept (a database before 00287): WhatsApp alone",
  );
  assert.equal(await factsOf({ channels: ["whatsapp"], status: "rejected" }), null);
  // The same follow-up with its template approved has its facts: who had a follow-up, who waits.
  const approved = await factsOf({ channels: ["whatsapp"], status: "approved" });
  assert.deepEqual([approved.run_hour, approved.asks, approved.purpose], [10, true, "conversational"]);
});

test("a follow-up that also goes by email or text is NOT stopped by a WhatsApp template Meta has not approved: its run goes on for them", async () => {
  for (const channels of [
    ["whatsapp", "email"],
    ["whatsapp", "sms"],
    ["whatsapp", "sms", "email"],
  ]) {
    const facts = await factsOf({ channels, status: "pending" });
    assert.notEqual(facts, null, channels.join("+"));
    assert.deepEqual(facts.channels, channels, "and the facts say which channels it goes by");
  }
  // The number's health still stops the whole run, as it does in core: with no number to send on, WhatsApp is ticked and held.
  assert.equal(await factsOf({ channels: ["whatsapp", "email"], status: "approved", number: false }), null);
});

test("a follow-up that goes by email or text alone is stopped by neither the number nor Meta: it never asks them", async () => {
  for (const channels of [["email"], ["sms"], ["email", "sms"]]) {
    for (const status of ["pending", "approved", null])
      assert.notEqual(await factsOf({ channels, status, number: false }), null, `${channels.join("+")} ${status}`);
  }
});

test("playbookStopBy is the run's one reading of its ticks: the number stops it only where WhatsApp is ticked, Meta's approval only where WhatsApp is all it goes by", () => {
  const stop = (channels, templateStatus, numberCanSend) => playbookStopBy({ channels, templateStatus, numberCanSend });
  // WhatsApp alone: the template and the number each stop it.
  assert.equal(stop(["whatsapp"], "approved", true), null);
  assert.equal(stop(["whatsapp"], "pending", true), "template_not_approved");
  assert.equal(stop(["whatsapp"], null, true), "template_not_approved", "a template nobody has is not approved");
  assert.equal(stop(["whatsapp"], "approved", false), "number_flagged");
  // WhatsApp and others: the template no longer stops the run (its WhatsApp people are held), the number still does.
  assert.equal(stop(["whatsapp", "email"], "pending", true), null);
  assert.equal(stop(["whatsapp", "sms"], null, true), null);
  assert.equal(stop(["whatsapp", "email"], "approved", false), "number_flagged");
  // Others alone: nothing about WhatsApp stops it.
  assert.equal(stop(["email"], "pending", false), null);
  assert.equal(stop(["sms"], null, false), null);
  // And it is playbookRunStop with the ticks read out, never a second rule.
  for (const channels of [["whatsapp"], ["whatsapp", "email"], ["email"], ["sms", "email"]])
    for (const templateStatus of ["approved", "pending", null])
      for (const numberCanSend of [true, false])
        assert.equal(
          stop(channels, templateStatus, numberCanSend),
          playbookRunStop({
            templateStatus,
            canSend: !channels.includes("whatsapp") || numberCanSend,
            byOthers: channels.some((c) => c !== "whatsapp"),
          }),
          `${channels.join("+")} ${templateStatus} ${numberCanSend}`,
        );
});
