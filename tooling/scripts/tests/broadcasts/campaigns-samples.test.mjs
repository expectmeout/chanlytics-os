/**
 * The demo's Broadcasts are a sample, not a twin (decision 0015, condition 3): a sample business passed through
 * the same contracts functions a real workspace's numbers go through, so a demo session draws the one page there is. What is
 * held here is what a demo would otherwise get wrong: every word a card says is contracts', every count agrees with its parts,
 * the same moment is the same page, and nothing of the mockup's invented campaigns or customers is in it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const S = "../../../../apps/dashboard/src/surfaces/campaigns";
const { broadcastsSample } = await import(`${S}/broadcasts/sample.ts`);

const NOW = new Date("2026-09-28T18:00:00Z");
const MOCKUP = /Serenity|Selena|April win-back|Hot-stone|Lena|\$\d/;

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
