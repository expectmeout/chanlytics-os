/**
 * Who signed a reply, kept by the gate (decision 0052): the signer eval's dry run, as a test. Each fixture in
 * fixtures/replies/signers.json goes through what the job does with the reader's scripted answer (parseReplyReading),
 * then contracts' signerOf with the workspace's own names as the names a signer can never be, and what the gate keeps
 * is held to the fixture's `expect.signer`. The live run (evals/reply-signers.mjs --live) asks the model the same
 * fixtures and is what automatic naming waits on; this holds the gate itself, with no key and no spend.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReplyReading } from "@chanlytics/contracts";
import { gatedSigner, judgeSigner, loadSigners } from "../../evals/reply-signers.mjs";
import { readerInputOf } from "../../evals/reply-intents.mjs";

const { signers, set } = loadSigners();

test("every signer fixture is kept by the gate as it expects: a person's own name, and nobody for a role, a team, the business, a quoted line or two people", () => {
  assert.ok(signers.replies.length >= 10, "the fixtures the eval asks");
  const misses = [];
  for (const fixture of signers.replies) {
    const kept = gatedSigner(fixture, parseReplyReading(fixture.answer), set, signers);
    const verdict = judgeSigner(fixture, kept);
    if (!verdict.pass) misses.push(`${fixture.email.id}: ${verdict.failures.join("; ")}`);
  }
  assert.deepEqual(misses, []);
  const kept = signers.replies.filter((f) => f.expect.signer !== null).length;
  assert.ok(kept > 0 && kept < signers.replies.length, "the set holds names the gate keeps and names it refuses");
});

test("the reader is shown each fixture as the job shows it, and a reading with no answer keeps nobody", () => {
  for (const fixture of signers.replies) {
    const input = readerInputOf(fixture, set);
    assert.ok(input.system && input.user, fixture.email.id);
  }
  const first = signers.replies[0];
  assert.equal(gatedSigner(first, null, set, signers), null, "no reading, no signer");
  assert.deepEqual(judgeSigner({ expect: { signer: null } }, "Priya Nair"), {
    pass: false,
    failures: ['kept "Priya Nair", wanted none'],
  });
});
