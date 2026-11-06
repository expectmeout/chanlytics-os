/**
 * What a merged person has answered (decision 0028; the 4 Oct wiring review's D5): the most careful answer wins on
 * each question. The database applies the rule (merge_people, 00326) and merge-people.db.test.mjs holds the two
 * spellings equal; this file is the rule itself, in the cases a person would name, and the words that go with it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_KINDS,
  DECISION_VERBS,
  EVENT_KINDS,
  MERGE_CONSENT_SOURCE,
  MERGE_REFUSALS,
  MERGE_WORDS,
  consentChangeOf,
  consentChangeWords,
  consentSourceLabel,
  mergedAnswers,
} from "@chanlytics/contracts";

const ANSWERS = ["unknown", "opted_in", "opted_out"];
const of = (consent, marketing = "unknown", emailMarketing = "unknown", dnc = consent === "opted_out") => ({
  consent,
  dnc,
  marketing,
  emailMarketing,
});

test("a stop on either record is a stop for the person, and it ends every yes to offers without making it a no", () => {
  const stopped = { consent: "opted_out", dnc: true, marketing: "unknown", emailMarketing: "unknown" };
  assert.deepEqual(mergedAnswers(of("opted_in", "opted_in", "opted_in"), of("opted_out")), stopped);
  assert.deepEqual(mergedAnswers(of("opted_out"), of("opted_in", "opted_in", "opted_in")), stopped);
  // Do-not-contact alone, with no answer recorded beside it, is a stop too.
  assert.deepEqual(mergedAnswers(of("opted_in", "opted_in"), of("unknown", "unknown", "unknown", true)), stopped);
});

test("a no to offers wins, and so does an unsubscribe, each on its own question", () => {
  assert.deepEqual(mergedAnswers(of("opted_in", "opted_in", "opted_in"), of("opted_in", "opted_out", "unknown")), {
    consent: "opted_in",
    dnc: false,
    marketing: "opted_out",
    emailMarketing: "opted_in",
  });
  assert.deepEqual(mergedAnswers(of("unknown", "opted_in", "opted_out"), of("opted_in", "unknown", "opted_in")), {
    consent: "opted_in",
    dnc: false,
    marketing: "opted_in",
    emailMarketing: "opted_out",
  });
  // A no stays a no under a stop: the person said it.
  assert.equal(mergedAnswers(of("opted_out", "opted_out"), of("opted_in", "opted_in")).marketing, "opted_out");
});

test("a yes one record gave stands for the person where neither said no; two records that said nothing say nothing", () => {
  assert.deepEqual(mergedAnswers(of("unknown"), of("opted_in", "opted_in", "opted_in")), {
    consent: "opted_in",
    dnc: false,
    marketing: "opted_in",
    emailMarketing: "opted_in",
  });
  assert.deepEqual(mergedAnswers(of("unknown"), of("unknown")), of("unknown"));
});

test("which record is kept never changes an answer, and no answer is ever less careful than either record's", () => {
  const rank = { opted_out: 0, unknown: 1, opted_in: 2 };
  const all = [];
  for (const c of ANSWERS) for (const m of ANSWERS) for (const e of ANSWERS) all.push(of(c, m, e));
  for (const a of all)
    for (const b of all) {
      const merged = mergedAnswers(a, b);
      assert.deepEqual(merged, mergedAnswers(b, a), `${JSON.stringify(a)} + ${JSON.stringify(b)}`);
      for (const [key, x, y] of [
        ["consent", a.consent, b.consent],
        ["marketing", a.marketing, b.marketing],
        ["emailMarketing", a.emailMarketing, b.emailMarketing],
      ]) {
        // A yes only where one of them said yes; a no wherever either said no.
        if (merged[key] === "opted_in") assert.ok(x === "opted_in" || y === "opted_in", key);
        if (x === "opted_out" || y === "opted_out") assert.equal(merged[key], "opted_out", key);
        assert.ok(rank[merged[key]] <= Math.max(rank[x], rank[y]), key);
      }
      assert.equal(merged.dnc, a.dnc || b.dnc);
    }
});

test("the merge is in the closed sets, and a person's page says whose word a changed answer is", () => {
  assert.ok(DECISION_VERBS.includes("merge"));
  assert.ok(EVENT_KINDS.includes("contact.merged"));
  assert.ok(ACTIVITY_KINDS.includes("merge") && ACTIVITY_KINDS.includes("contact.merged"));
  assert.equal(MERGE_CONSENT_SOURCE, "merge");
  assert.equal(consentSourceLabel(MERGE_CONSENT_SOURCE), "From a merged record");
  const change = consentChangeOf({
    id: "ev-1",
    subject_id: "k1",
    created_at: "2026-10-05T16:00:00Z",
    data: { purpose: "marketing", consent: "opted_out", previous: "opted_in", source: MERGE_CONSENT_SOURCE },
  });
  assert.deepEqual(consentChangeWords(change), {
    who: "Offers",
    text: "Said no to offers",
    sub: "Two records of this person were merged, and the more careful answer stands",
  });
  // Every refusal is a sentence a person can act on, and no two are the same.
  const said = Object.values(MERGE_REFUSALS);
  assert.equal(new Set(said).size, said.length);
  for (const s of said) assert.match(s, /^[A-Z].*\.$/);
});

test("the page's words name the two records, and say what cannot be undone", () => {
  assert.equal(MERGE_WORDS.question("Maria Lopez", "maria@example.com"), "Merge maria@example.com into Maria Lopez?");
  assert.match(MERGE_WORDS.detail("Maria Lopez", "maria@example.com"), /cannot be undone/);
  assert.match(MERGE_WORDS.detail("Maria Lopez", "maria@example.com"), /more careful/);
  assert.equal(MERGE_WORDS.typed("Maria Lopez"), "Type Maria Lopez to confirm.");
  assert.equal(MERGE_WORDS.done("Maria Lopez", "maria@example.com"), "maria@example.com merged into Maria Lopez");
  assert.match(MERGE_WORDS.act, /…$/);
});
