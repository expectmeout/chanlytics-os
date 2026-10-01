/**
 * The demo's Playbooks and Broadcasts are samples, not twins (decision 0015, condition 3): a sample business passed through
 * the same contracts functions a real workspace's numbers go through, so a demo session draws the one page there is. What is
 * held here is what a demo would otherwise get wrong: every word a card says is contracts', every count agrees with its parts,
 * the same moment is the same page, and nothing of the mockup's invented campaigns or customers is in it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const S = "../../../../apps/dashboard/src/surfaces/campaigns";
const { playbooksSample } = await import(`${S}/playbooks/sample.ts`);
const { broadcastsSample } = await import(`${S}/broadcasts/sample.ts`);
const { scheduleLine, nextRunLabel, triggerOf, PLAYBOOK_TRIGGERS, triggerOffered } =
  await import("@chanlytics/contracts");

const NOW = new Date("2026-09-28T18:00:00Z");
const MOCKUP = /Serenity|Selena|April win-back|Hot-stone|Lena|\$\d/;

test("Playbooks' sample: three playbooks in the words contracts gives them, one run waiting for its owner, one paused", () => {
  const s = playbooksSample(NOW);
  assert.deepEqual(playbooksSample(NOW), s, "the same moment is the same page");
  assert.equal(s.rows.length, 3);
  for (const p of s.rows) {
    assert.equal(p.schedule, scheduleLine(p), `${p.name}: the schedule is contracts' line`);
    assert.equal(p.next, nextRunLabel(p, s.timezone, NOW), `${p.name}: the next run is contracts' label`);
    assert.equal(p.triggerLabel, triggerOf(p.trigger).label);
    assert.ok(
      s.templates.some((t) => t.id === p.template_id && t.meta_status === "approved"),
      `${p.name}: its message is approved`,
    );
  }
  assert.deepEqual(
    s.rows.map((p) => p.state),
    ["running", "running", "paused"],
  );
  assert.equal(s.rows.filter((p) => p.totals.waiting).length, 1, "one run waits for its owner");
  for (const p of s.rows) {
    const t = p.totals;
    assert.ok(
      t.delivered <= t.sent && t.replied <= t.delivered,
      `${p.name}: replies are of what was delivered, which is of what was sent`,
    );
    assert.equal(
      t.history.reduce((n, h) => n + h.sent, 0) <= t.sent,
      true,
      `${p.name}: the runs shown are among the runs counted`,
    );
  }
  assert.deepEqual(
    s.triggers.map((t) => t.id),
    PLAYBOOK_TRIGGERS.filter((t) => triggerOffered(t, false)).map((t) => t.id),
    "every moment the workspace is offered, none it is not",
  );
  assert.equal(s.countsRead, true);
  assert.equal(s.fetchedAt, NOW.getTime());
  assert.doesNotMatch(JSON.stringify(s), MOCKUP);
});

test("Broadcasts' sample: a run waiting, one scheduled, one sent, and audiences whose two counts agree with their previews", () => {
  const s = broadcastsSample(NOW);
  assert.deepEqual(broadcastsSample(NOW), s, "the same moment is the same page");
  assert.deepEqual(
    s.rows.map((r) => r.state),
    ["pending_approval", "scheduled", "sent"],
  );
  const sent = s.rows[2];
  assert.equal(sent.counts.sent, sent.recipient_count, "a sent broadcast reached everyone it enrolled");
  assert.ok(sent.counts.delivered <= sent.counts.sent && sent.counts.replied <= sent.counts.delivered);
  assert.equal(s.rows[0].open, true);
  assert.equal(s.rows[1].open, true);
  assert.equal(sent.open, false);
  for (const a of s.audiences) {
    assert.equal(
      a.counts.conversational,
      a.preview.conversational.sending,
      `${a.label}: the chip's count is its preview's`,
    );
    assert.equal(a.counts.marketing, a.preview.marketing.sending);
    assert.ok(a.counts.marketing <= a.counts.conversational, `${a.label}: an offer needs a yes a message does not`);
  }
  assert.ok(
    s.templates.every((t) => t.meta_status === "approved" && t.purpose),
    "approved messages, each with the consent it needs",
  );
  assert.equal(s.number.present, true);
  assert.equal(s.fetchedAt, NOW.getTime());
  assert.doesNotMatch(JSON.stringify(s), MOCKUP);
});
