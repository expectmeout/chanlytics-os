/**
 * The one domain all of this deployment's email is on, and how we find out it
 * has stopped working.
 *
 * There is nothing in our own rows to read. A mail domain that loses its DNS
 * has the provider accept mail and drop it, with no bounce to the sender and
 * no webhook to us; a mailbox that receives nothing looks exactly like one
 * nobody happened to write to. So the check is a question put to the provider,
 * and what is proved here is the reading of its answer and the judging of it:
 * the parse (packages/channels), the verdict and the words (edge
 * mail-domain.ts), and that a provider we could not reach pages nobody.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mailDomainsFrom } from "@chanlytics/channels";

const here = path.dirname(fileURLToPath(import.meta.url));
const { judgeMailDomain, describeMailDomainTrouble, checkMailDomain } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/email/mail-domain.ts")).href
);

const OURS = "mail.chanlytics.com";
/** As the provider answers: the shape GET /domains returns, with the fields this reads. */
const domain = (over = {}) => ({
  id: "ab328fa8-3b5e-49c8-b683-ad27f44e345e",
  name: OURS,
  status: "verified",
  created_at: "2026-09-17T13:01:28.037005+00:00",
  region: "us-east-1",
  open_tracking: false,
  click_tracking: false,
  capabilities: { sending: "enabled", receiving: "enabled" },
  ...over,
});
const answer = (...domains) => ({ object: "list", has_more: false, data: domains });
const judge = (...domains) => judgeMailDomain(mailDomainsFrom(answer(...domains)), OURS);

/* -------------------------------------------------------------- the reading */

test("the provider's answer is read for the four facts that matter, and an answer that is not a list is not an empty one", () => {
  assert.deepEqual(mailDomainsFrom(answer(domain())), [
    { name: OURS, status: "verified", sending: "enabled", receiving: "enabled" },
  ]);
  // "we could not ask" must never read as "there are no domains": the caller
  // throws on null, and an empty list is a real and different answer.
  assert.equal(mailDomainsFrom(null), null);
  assert.equal(mailDomainsFrom({ object: "list" }), null);
  assert.equal(mailDomainsFrom("not json at all"), null);
  assert.deepEqual(mailDomainsFrom(answer()), []);
  // A row with no name names nothing and is dropped; the rest of the list survives it.
  assert.deepEqual(
    mailDomainsFrom(answer({ status: "verified" }, domain())).map((d) => d.name),
    [OURS],
  );
  // The name is compared, so it is compared in one spelling.
  assert.equal(mailDomainsFrom(answer(domain({ name: " MAIL.Chanlytics.com " })))[0].name, OURS);
  // A status the provider did not send is not "verified".
  assert.equal(mailDomainsFrom(answer(domain({ status: "   " })))[0].status, "unknown");
});

/* ------------------------------------------------------------- the judgement */

test("verified, sending and receiving: nothing to say", () => {
  assert.equal(judge(domain()), null);
});

test("a domain the provider has never heard of, and one that is somebody else's", () => {
  assert.deepEqual(judge(), { kind: "absent" });
  assert.deepEqual(
    judge(domain({ name: "chanlytics.com" })),
    { kind: "absent" },
    "another domain on the same account is not the one we send and receive on",
  );
});

test("never verified says so, and so does a status this code has never heard of", () => {
  assert.deepEqual(judge(domain({ status: "not_started" })), { kind: "never_verified", status: "not_started" });
  assert.deepEqual(judge(domain({ status: "pending" })), { kind: "never_verified", status: "pending" });
  // The allow-list property: only "verified" is healthy. A status invented
  // after this was written alarms rather than buying silence.
  assert.deepEqual(judge(domain({ status: "quarantined_by_some_future_release" })), {
    kind: "never_verified",
    status: "quarantined_by_some_future_release",
  });
});

test("a domain that WAS verified and stopped is its own kind: somebody's mail is being lost now", () => {
  // temporary_failure is the ONE status a domain reaches only from working.
  assert.deepEqual(judge(domain({ status: "temporary_failure" })), { kind: "stopped", status: "temporary_failure" });
  const { body } = describeMailDomainTrouble({ kind: "stopped", status: "temporary_failure" }, OURS);
  assert.match(body, /WITHOUT a bounce/, "the silence is the point of this one");
});

test("REGRESSION: a domain the provider gave up on is not told it used to work", () => {
  // `failed` was grouped with temporary_failure as "was verified and stopped".
  // The provider gives it for "the records stayed unseen for 72 hours", which a
  // domain reaches from either direction -- and Chanlytics' own mail domain sat
  // at `failed` having never verified once, so the first alarm anybody would
  // have received said a domain that never worked had stopped working.
  assert.deepEqual(judge(domain({ status: "failed" })), { kind: "given_up", status: "failed" });
  const { subject, body } = describeMailDomainTrouble({ kind: "given_up", status: "failed" }, OURS);
  assert.match(subject, /"failed"/);
  assert.doesNotMatch(body, /was verified|stopped being seen/, "it does not claim a history it cannot know");
  assert.match(body, /will not fix itself/, "the fact that matters: the provider stopped looking");
  assert.match(body, /verify the domain again/, "and what a person has to do about it");
});

test("one half verified and the other not", () => {
  assert.deepEqual(judge(domain({ status: "partially_verified" })), { kind: "half", status: "partially_verified" });
  assert.deepEqual(judge(domain({ status: "partially_failed" })), { kind: "half", status: "partially_failed" });
});

test("verified with a half switched off: the address is published and accepts nothing", () => {
  assert.deepEqual(judge(domain({ capabilities: { sending: "enabled", receiving: "disabled" } })), {
    kind: "off",
    sending: "enabled",
    receiving: "disabled",
  });
  assert.deepEqual(judge(domain({ capabilities: { sending: "disabled", receiving: "enabled" } })), {
    kind: "off",
    sending: "disabled",
    receiving: "enabled",
  });
  assert.match(
    describeMailDomainTrouble({ kind: "off", sending: "enabled", receiving: "disabled" }, OURS).body,
    /accepts nothing/,
  );
  assert.match(
    describeMailDomainTrouble({ kind: "off", sending: "disabled", receiving: "enabled" }, OURS).body,
    /no reply can leave/,
  );
});

test("a capability the provider stopped sending is a release note, not an outage", () => {
  // The opposite default from `status`, on purpose: the status is the provider
  // reporting on the world, and capabilities are it reading back what WE set.
  // A field that disappears from the API must not page anybody at 3am.
  assert.equal(judge(domain({ capabilities: {} })), null);
  assert.equal(judge(domain({ capabilities: { sending: "enabled" } })), null);
  const noCaps = domain();
  delete noCaps.capabilities;
  assert.equal(judge(noCaps), null);
});

test("the page names the domain, what the provider said, and what it costs", () => {
  const { subject, body } = describeMailDomainTrouble({ kind: "never_verified", status: "pending" }, OURS);
  assert.match(subject, new RegExp(OURS.replace(/\./g, "\\.")));
  assert.match(subject, /"pending"/);
  assert.match(body, /While this lasts:/);
  assert.match(body, /Resend dashboard/, "the one place a person can go and fix it");
  assert.match(describeMailDomainTrouble({ kind: "absent" }, OURS).subject, /no domain by that name/);
});

/* ----------------------------------------------------------------- the check */

test("a deployment with no email, and one with no provider key, check nothing", async () => {
  let asked = 0;
  const domains = async () => {
    asked += 1;
    return [];
  };
  assert.deepEqual(await checkMailDomain({ domain: null, apiKey: "re_x", domains }), {
    trouble: null,
    skipped: "email_off",
  });
  assert.deepEqual(await checkMailDomain({ domain: OURS, apiKey: undefined, domains }), {
    trouble: null,
    skipped: "no_key",
  });
  assert.equal(asked, 0, "neither one may call the provider");
});

test("a provider we could not reach pages nobody, and is not silence either", async () => {
  const out = await checkMailDomain({
    domain: OURS,
    apiKey: "re_x",
    domains: async () => {
      throw new Error("resend: domains answered 503: upstream");
    },
  });
  assert.equal(out.trouble, null, "an outage at the provider must not page as an outage of ours");
  assert.match(out.error, /503/, "and it is said, so the tick logs it and the next one asks again");
});

test("the check carries the judgement through, and asks with the key it was given", async () => {
  let saw = null;
  const out = await checkMailDomain({
    domain: OURS,
    apiKey: "re_live",
    domains: async (cfg) => {
      saw = cfg;
      return mailDomainsFrom(answer(domain({ status: "temporary_failure" })));
    },
  });
  assert.deepEqual(saw, { apiKey: "re_live" });
  assert.deepEqual(out, { trouble: { kind: "stopped", status: "temporary_failure" } });
});
