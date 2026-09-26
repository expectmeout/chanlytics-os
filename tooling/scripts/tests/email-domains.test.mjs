/**
 * The cold account's domain calls (packages/channels email-domains.ts), run against a stubbed fetch: what each asks
 * of the provider, the answer read into its shape, a refusal carried in the provider's words, and nothing thrown.
 * The bodies are the provider's documented examples (resend.com/docs/api-reference/domains).
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createMailDomain,
  dmarcOf,
  getMailDomain,
  providerDomainFrom,
  removeMailDomain,
  verifyMailDomain,
} from "@chanlytics/channels";

const CFG = { apiKey: "re_cold_test" };
const ID = "d91cd9bd-1176-453e-8fc1-35364d380206";
/** The provider's documented domain, as it answers a create or a read. */
const DOMAIN = {
  object: "domain",
  id: ID,
  name: "example.com",
  status: "not_started",
  created_at: "2026-04-26 20:21:26.347412+00",
  region: "us-east-1",
  open_tracking: false,
  click_tracking: false,
  capabilities: { sending: "enabled", receiving: "disabled" },
  records: [
    {
      record: "SPF",
      name: "send",
      type: "MX",
      ttl: "Auto",
      status: "not_started",
      value: "feedback-smtp.us-east-1.amazonses.com",
      priority: 10,
    },
    {
      record: "SPF",
      name: "send",
      value: '"v=spf1 include:amazonses.com ~all"',
      type: "TXT",
      ttl: "Auto",
      status: "not_started",
    },
    {
      record: "DKIM",
      name: "resend._domainkey",
      value: "p=MIGfMA0GCSqGSIb3DQEB",
      type: "TXT",
      status: "not_started",
      ttl: "Auto",
    },
    {
      record: "Tracking",
      name: "links.example.com",
      type: "CNAME",
      value: "links1.resend-dns.com",
      ttl: "Auto",
      status: "not_started",
    },
  ],
};

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});
function answer(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : null,
    });
    if (status === 0) throw new Error("getaddrinfo ENOTFOUND api.resend.com");
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return calls;
}

test("a create asks for sending only, with opens and clicks off by name, and reads the records to publish", async () => {
  const calls = answer(201, DOMAIN);
  const r = await createMailDomain(CFG, "example.com");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/domains");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, "Bearer re_cold_test");
  assert.deepEqual(calls[0].body, {
    name: "example.com",
    region: "us-east-1",
    open_tracking: false,
    click_tracking: false,
    capabilities: { sending: "enabled", receiving: "disabled" },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    id: ID,
    name: "example.com",
    status: "not_started",
    records: [
      {
        label: "SPF",
        type: "MX",
        name: "send",
        value: "feedback-smtp.us-east-1.amazonses.com",
        priority: 10,
        status: "not_started",
      },
      // A registrar wants the value typed without the quotes the provider wraps it in.
      {
        label: "SPF",
        type: "TXT",
        name: "send",
        value: "v=spf1 include:amazonses.com ~all",
        priority: null,
        status: "not_started",
      },
      {
        label: "DKIM",
        type: "TXT",
        name: "resend._domainkey",
        value: "p=MIGfMA0GCSqGSIb3DQEB",
        priority: null,
        status: "not_started",
      },
      // No tracking record: tracking is off, and one is never ours to publish.
    ],
    // When the provider made it, as it said: how an add knows a domain is its own (Part 2.6).
    createdAt: "2026-04-26 20:21:26.347412+00",
  });
});

test("a refusal is carried in the provider's own words, and a network that fails is status 0, never a throw", async () => {
  answer(422, { statusCode: 422, name: "validation_error", message: "The domain example.com is already registered." });
  assert.deepEqual(await createMailDomain(CFG, "example.com"), {
    ok: false,
    status: 422,
    message: "The domain example.com is already registered.",
  });
  answer(500, "upstream exploded");
  assert.deepEqual(await createMailDomain(CFG, "example.com"), {
    ok: false,
    status: 500,
    message: "upstream exploded",
  });
  answer(0);
  const net = await createMailDomain(CFG, "example.com");
  assert.equal(net.ok, false);
  assert.equal(net.status, 0);
  answer(200, { not: "a domain" });
  assert.equal(
    (await createMailDomain(CFG, "example.com")).ok,
    false,
    "an answer that is not a domain is not a domain",
  );
});

test("a read: the domain where it stands; 404 is the provider having none, which is a fact", async () => {
  const calls = answer(200, { ...DOMAIN, status: "verified" });
  const r = await getMailDomain(CFG, ID);
  assert.equal(calls[0].url, `https://api.resend.com/domains/${ID}`);
  assert.equal(calls[0].method, "GET");
  assert.equal(r.ok && r.value.status, "verified");
  answer(404, { statusCode: 404, name: "not_found", message: "Domain not found" });
  assert.deepEqual(await getMailDomain(CFG, ID), { ok: true, value: null });
  answer(503, "");
  assert.equal((await getMailDomain(CFG, ID)).ok, false);
});

test("a check asks the provider to look again; a removal of a domain already gone is gone", async () => {
  const calls = answer(200, { object: "domain", id: ID });
  assert.deepEqual(await verifyMailDomain(CFG, ID), { ok: true, value: true });
  assert.equal(calls[0].url, `https://api.resend.com/domains/${ID}/verify`);
  assert.equal(calls[0].method, "POST");
  const del = answer(200, { object: "domain", id: ID, deleted: true });
  assert.deepEqual(await removeMailDomain(CFG, ID), { ok: true, value: "removed" });
  assert.equal(del[0].method, "DELETE");
  answer(404, { message: "Domain not found" });
  assert.deepEqual(await removeMailDomain(CFG, ID), { ok: true, value: "gone" });
  answer(500, "no");
  assert.equal((await removeMailDomain(CFG, ID)).ok, false);
});

test("a record that is not whole is dropped, and a domain without an id is no domain", () => {
  assert.equal(providerDomainFrom(null), null);
  assert.equal(providerDomainFrom({ name: "x.com" }), null);
  const d = providerDomainFrom({ id: ID, name: "X.com", records: [{ record: "SPF", type: "TXT" }, "junk", null] });
  assert.deepEqual(d, { id: ID, name: "x.com", status: "unknown", records: [], createdAt: null });
});

test("DMARC is a TXT whose chunks, joined, begin v=DMARC1", () => {
  assert.equal(dmarcOf([["v=DMARC1; p=none;"]]), "found");
  assert.equal(dmarcOf([["v=DMARC1; p=quarantine; ", "rua=mailto:d@x.com"]]), "found");
  assert.equal(dmarcOf([["V=dmarc1;p=reject"]]), "found");
  assert.equal(dmarcOf([["v=DMARC1"]]), "found");
  assert.equal(dmarcOf([["v=spf1 include:amazonses.com ~all"]]), "missing");
  assert.equal(dmarcOf([["v=DMARC10; p=none"]]), "missing");
  assert.equal(dmarcOf([]), "missing");
});
