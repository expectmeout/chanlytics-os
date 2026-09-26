/**
 * Whether a sending domain has a DMARC record (apps/edge lib/email/dmarc.ts), run with DNS answered by the test: at
 * the host, else at a parent down to two labels, and "could not read" kept apart from "has none".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { readDmarc, dkimPublished } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/email/dmarc.ts")).href);

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

/* Whether a domain's DKIM key is published (Part 2.6): what says a never-verified host is its holder's own work. */
const key = (value, name = "resend._domainkey") => [{ label: "DKIM", type: "TXT", name, value }];

test("a DKIM key is published when a TXT at its name carries it, with other tags beside it or split in chunks", async () => {
  const at = "resend._domainkey.getharbor.com";
  assert.equal(await dkimPublished("getharbor.com", key("p=KEY"), dns({ [at]: [["p=KEY"]] }).resolve), true);
  assert.equal(
    await dkimPublished("getharbor.com", key("p=KEY"), dns({ [at]: [["v=DKIM1; k=rsa; ", "p=KEY"]] }).resolve),
    true,
    "tags beside the key, and the key split across chunks, are the same key",
  );
  assert.equal(await dkimPublished("getharbor.com", key("p=KEY"), dns({ [at]: [["p=ANOTHER"]] }).resolve), false);
  assert.equal(await dkimPublished("getharbor.com", key("p=KEY"), dns({}).resolve), false, "no record at all");
  assert.equal(await dkimPublished("getharbor.com", [], dns({}).resolve), false, "no DKIM record to look for");
});

test("a subdomain host's DKIM name is found whether the provider gave it relative to the host or to its domain", async () => {
  const host = "mail.getharbor.com";
  // Relative to the registered domain, as a dashboard shows it: resend._domainkey.mail under getharbor.com.
  const rel = dns({ "resend._domainkey.mail.getharbor.com": [["p=KEY"]] });
  assert.equal(await dkimPublished(host, key("p=KEY", "resend._domainkey.mail"), rel.resolve), true);
  // Relative to the host, and given whole: the same place.
  const byHost = dns({ "resend._domainkey.mail.getharbor.com": [["p=KEY"]] });
  assert.equal(await dkimPublished(host, key("p=KEY", "resend._domainkey"), byHost.resolve), true);
  const whole = dns({ "resend._domainkey.mail.getharbor.com": [["p=KEY"]] });
  assert.equal(await dkimPublished(host, key("p=KEY", "Resend._DomainKey.Mail.GetHarbor.com."), whole.resolve), true);
  assert.deepEqual(whole.asked, ["resend._domainkey.mail.getharbor.com"], "a whole name is asked as it is");
});

test("DNS that does not answer is null, never 'not published': could not look is not a fact about whose it is", async () => {
  const d = dns({}, { "resend._domainkey.getharbor.com": "ETIMEOUT" });
  assert.equal(await dkimPublished("getharbor.com", key("p=KEY"), d.resolve), null);
  // One place answered with the key: published, whatever another place could not say.
  const some = dns(
    { "resend._domainkey.mail.getharbor.com": [["p=KEY"]] },
    { "resend._domainkey.mail.mail.getharbor.com": "ETIMEOUT" },
  );
  assert.equal(await dkimPublished("mail.getharbor.com", key("p=KEY", "resend._domainkey.mail"), some.resolve), true);
});
