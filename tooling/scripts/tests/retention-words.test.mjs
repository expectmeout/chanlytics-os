/**
 * Retention, said once: the numbers the privacy page prints are the numbers
 * the sweeps keep to, and the evidence kinds the purge drops are the families
 * the activity log hides. A phone tail is four digits and never more.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_EVIDENCE_KINDS,
  EVENT_KINDS,
  RATE_HITS_RETENTION_HOURS,
  RECORDING_RETENTION_DAYS,
  RETENTION_DAYS,
  isActivityNoise,
  phoneTail,
  retentionWords,
} from "@chanlytics/contracts";

test("the numbers, and the paragraph the privacy page prints from them", () => {
  assert.deepEqual(RETENTION_DAYS, {
    call_recordings: 90,
    events_evidence: 30,
    ask_threads: 90,
    notifications: 90,
    cron_history: 14,
    leads_untouched: 90,
    leads_untouched_blanked: 180,
    leads_excluded_blanked: 30,
  });
  assert.equal(RATE_HITS_RETENTION_HOURS, 2);
  assert.equal(RECORDING_RETENTION_DAYS, 90);
  const words = retentionWords();
  assert.match(words, /^Call audio is kept for 90 days and then removed; transcripts stay with the conversation\./);
  assert.match(words, /Webhook receipts, delivery logs, unplaced messages and model-usage rows are kept for 30 days\./);
  assert.match(words, /Assistant threads untouched for 90 days, and notifications after 90 days, are removed/);
  assert.match(words, /run history is kept for 14 days and rate-limit counters for 2 hours/);
  assert.match(
    words,
    /Leads nobody has worked are set aside after 90 days and their details removed after 180; places a search left out lose their details after 30 days\./,
  );
  assert.match(words, /Everything else stays while the workspace exists\.$/);
});

test("the evidence kinds are declared kinds and families the activity log hides; the record's usage rows are not among them", () => {
  for (const k of EVENT_EVIDENCE_KINDS) {
    assert.ok(EVENT_KINDS.includes(k), `${k} is declared`);
    assert.ok(isActivityNoise(k), `${k} is hidden from the activity log unless named`);
  }
  for (const k of ["usage.voice_seconds", "usage.wa_conversation", "message.received", "contact.consent_changed"]) {
    assert.ok(!EVENT_EVIDENCE_KINDS.includes(k), `${k} is the record`);
  }
});

test("a phone tail is the last four digits, however the number was written, and nothing for no number", () => {
  assert.equal(phoneTail("+19296566623"), "6623");
  assert.equal(phoneTail("19296566623"), "6623");
  assert.equal(phoneTail("+1 (929) 656-6623"), "6623");
  assert.equal(phoneTail("whatsapp:+19296566623"), "6623");
  assert.equal(phoneTail("123"), "123", "a short code is short");
  assert.equal(phoneTail(""), null);
  assert.equal(phoneTail(null), null);
  assert.equal(phoneTail(undefined), null);
});
