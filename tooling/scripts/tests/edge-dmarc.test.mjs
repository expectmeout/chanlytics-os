/**
 * Whether a sending domain has a DMARC record (apps/edge lib/email/dmarc.ts), run with DNS answered by the test: at
 * the host, else at a parent down to two labels, and "could not read" kept apart from "has none".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { readDmarc } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/email/dmarc.ts")).href);

const fail = (code) => Object.assign(new Error(code), { code });
/** A resolver over a map of names to TXT answers; a name not in it has no record, and every name asked is kept. */
const dns = (records, errors = {}) => {
  const asked = [];
  const resolve = async (name) => {
    asked.push(name);
    if (errors[name]) throw fail(errors[name]);
    if (records[name]) return records[name];
    throw fail("ENODATA");
  };
  return { asked, resolve };
};

test("found at the host itself", async () => {
  const d = dns({ "_dmarc.getharbor.com": [["v=DMARC1; p=none;"]] });
  assert.equal(await readDmarc("getharbor.com", d.resolve), "found");
  assert.deepEqual(d.asked, ["_dmarc.getharbor.com"]);
});

test("a subdomain inherits its organisation's record", async () => {
  const d = dns({ "_dmarc.harbor.com": [["v=DMARC1; p=quarantine"]] });
  assert.equal(await readDmarc("mail.harbor.com", d.resolve), "found");
  assert.deepEqual(d.asked, ["_dmarc.mail.harbor.com", "_dmarc.harbor.com"]);
});

test("no record anywhere is missing, and the walk stops at two labels: _dmarc.com is never asked", async () => {
  const d = dns(
    { "_dmarc.harbor.com": [["v=spf1 include:amazonses.com ~all"]] },
    { "_dmarc.mail.harbor.com": "ENOTFOUND" },
  );
  assert.equal(await readDmarc("mail.harbor.com", d.resolve), "missing");
  assert.deepEqual(d.asked, ["_dmarc.mail.harbor.com", "_dmarc.harbor.com"]);
});

test("DNS that does not answer is null, never missing: we could not look is not a fact about the domain", async () => {
  for (const code of ["ETIMEOUT", "ESERVFAIL", "ECONNREFUSED"]) {
    const d = dns({}, { "_dmarc.getharbor.com": code });
    assert.equal(await readDmarc("getharbor.com", d.resolve), null, code);
  }
  // A timeout at a parent after the host had none is still null: the answer that decides was never read.
  const d = dns({}, { "_dmarc.harbor.com": "ETIMEOUT" });
  assert.equal(await readDmarc("mail.harbor.com", d.resolve), null);
});
