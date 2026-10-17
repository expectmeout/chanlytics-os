/**
 * A sequence on a list goes once to each person (the Sequences loop review's item 6, 17 Oct 2026): its first step's run
 * reaches the list's people it never reached, never again anyone it reached or holds now, whatever its gap (core
 * runPlaybook over the `reached` port, db sequenceReached). A moment's run reads no such thing. A read of who it reached
 * that fails is the run failing: nothing is recorded, and the next sweep asks again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, numberHealth } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");
const NOW = new Date("2026-10-08T14:00:00Z"); // 10:00 in New York
const DAY = 86_400_000;

/** Someone on the list: said yes to offers and to WhatsApp, quiet for a month. */
const onTheList = (id) => ({
  id,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: `+1555010${id.length}${id.charCodeAt(0) % 10}`,
  consent: {
    state: "opted_in",
    dnc: false,
    label: "Opted in",
    sub: "",
    source: "in_person",
    marketing: "opted_in",
    marketingSource: "in_person",
    marketingSub: "",
  },
  lastContact: { ts: NOW.getTime() - 30 * DAY, label: "" },
  booked: false,
  askedMs: NOW.getTime() - 30 * DAY,
  lastVisitMs: null,
});

/** A sequence's first step on a list of the workspace's own. */
const listFirstStep = (over = {}) => ({
  id: "q1",
  tenant_id: "t1",
  name: "VIP color clients",
  kind: "moment",
  trigger: "saved_list",
  list_id: "11111111-1111-4111-8111-111111111111",
  list_key: null,
  template_id: "tpl-1",
  template_name: "spring_offer",
  template_language: "en_US",
  params: [],
  policy_class: "campaign",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner",
  last_run_for: null,
  ...over,
});

/** The workspace as the run reads it: these people, all on the list, nobody heard from anything lately. */
const listWorld = (people) => ({
  tz: "America/New_York",
  now: NOW,
  people,
  modes: new Map([["campaign", "auto"]]),
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  ready: channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: false },
  }),
  touches: { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() },
  calendar: "none",
  visits: new Map(),
  dealsOn: false,
  listMembers: () => ({ state: "ok", ids: new Set(people.map((p) => p.id)) }),
});

/** Ports that log what the run asks: who the sequence reached is `reached`, or a read that fails. */
function listPorts(reached) {
  const log = [];
  const ports = {
    message: async (name, language) => [
      {
        id: "tpl-1",
        channel: "whatsapp",
        name,
        language,
        meta_status: "approved",
        category: "marketing",
        variables: [],
        hidden_at: null,
        title: null,
        source: "meta",
        components: [],
        body_preview: null,
        rejected_reason: null,
      },
    ],
    alreadyRan: async () => false,
    followUpsDue: async () => [],
    leave: async () => 0,
    reached: async (sequenceId) => {
      log.push(["reached", sequenceId]);
      if (reached instanceof Error) throw reached;
      return new Set(reached);
    },
    record: async (...args) => log.push(["record", ...args]),
    assemble: async (row, recipients, sendAt, decision) => {
      log.push(["assemble", row, recipients, sendAt, decision]);
      return { id: "b9", decisionId: decision ? "d9" : null };
    },
    monthSent: async () => 0,
    holdRecipients: async (_id, ids) => ({ skipped: ids, error: null }),
    notify: async () => undefined,
  };
  return { ports, log, of: (name) => log.filter((l) => l[0] === name) };
}

test("a list's sequence reaches the list's people it never reached, and none it already reached or holds, whatever its gap", async () => {
  const f = listPorts(["a", "c"]);
  const r = await runPlaybook(f.ports, {
    playbook: listFirstStep(),
    ctx: listWorld(["a", "b", "c", "d"].map(onTheList)),
    runFor: "2026-10-08",
    by: { kind: "system" },
  });
  assert.equal(r.outcome, "sent", JSON.stringify(r));
  assert.deepEqual(f.of("reached")[0], ["reached", "q1"], "asked of the sequence, by its first step's id");
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(recipients.map((x) => x.contact_id).sort(), ["b", "d"], "the two it never reached");
  assert.equal(row.audience.reach.heardThis, 2, "those it reached are counted as having heard from it");
});

test("a moment's sequence never asks who it reached: its gap is its own", async () => {
  const f = listPorts(["a"]);
  const r = await runPlaybook(f.ports, {
    playbook: listFirstStep({ trigger: "quiet_30", list_id: null }),
    ctx: { ...listWorld(["a", "b"].map(onTheList)), listMembers: () => null },
    runFor: "2026-10-08",
    by: { kind: "system" },
  });
  assert.notEqual(r.outcome, "failed", JSON.stringify(r));
  assert.equal(f.of("reached").length, 0);
});

test("a read of who the sequence reached that fails is the run failing: nothing is recorded, nobody is sent to", async () => {
  const f = listPorts(new Error("connection reset"));
  const r = await runPlaybook(f.ports, {
    playbook: listFirstStep(),
    ctx: listWorld(["a", "b"].map(onTheList)),
    runFor: "2026-10-08",
    by: { kind: "system" },
  });
  assert.equal(r.outcome, "failed");
  assert.match(r.error, /reached: connection reset/);
  assert.deepEqual([f.of("assemble").length, f.of("record").length], [0, 0], "the next sweep asks again");
});
