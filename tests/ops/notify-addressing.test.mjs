/**
 * Who is told, and whether they may see the contents.
 *
 * There were four copies of the alert fetch and two of them fell back to a
 * hardcoded personal address. With one tenant that is untidy; with two it is a
 * disclosure — one business's escalation, quoting its customer's message, or a
 * voice call's full transcript, delivered to a different business's owner.
 *
 * The rule this pins: the platform's address is the platform's own, for a
 * notice about no workspace. For any workspace it is a stranger's mailbox, so
 * an unaddressable workspace gets the FACT and never the content.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chooseAddressing } = await import(
  pathToFileURL(path.join(here, "../../apps/edge/lib/shared/alerts/notify.ts")).href
);

const PLATFORM = { to: ["platform@example.com", "second@example.com"], from: "Platform <noreply@example.com>" };
const TENANT_MAILBOX = { escalation_emails: ["owner@salon.example"], from: "Salon <hi@salon.example>" };

test("a tenant with its own recipients gets the full detail, at its own address", () => {
  const a = chooseAddressing({ tenantId: "t1", notifications: TENANT_MAILBOX }, PLATFORM);
  assert.equal(a.kind, "tenant");
  assert.deepEqual(a.to, ["owner@salon.example"]);
  assert.equal(a.from, "Salon <hi@salon.example>");
});

test("a notice about no workspace is the platform's own, in full", () => {
  const a = chooseAddressing({ tenantId: null, notifications: null }, PLATFORM);
  assert.equal(a.kind, "platform", "the platform's own news, at the platform's address");
  assert.deepEqual(a.to, PLATFORM.to, "every platform address, not the first");
});

test("ANOTHER tenant with no recipients is REDACTED, never sent to the env pair", () => {
  // The disclosure this whole module exists to prevent.
  const a = chooseAddressing({ tenantId: "t2", notifications: null }, PLATFORM);
  assert.equal(a.kind, "redacted", "a second tenant's customer content went to tenant #1's owner");
  assert.deepEqual(a.to, PLATFORM.to, "the operator is still told a workspace needs configuring");
});

test("a tenant with an EMPTY recipient list is treated as unconfigured", () => {
  const a = chooseAddressing({ tenantId: "t2", notifications: { escalation_emails: [], from: "x@y.z" } }, PLATFORM);
  assert.equal(a.kind, "redacted", "an empty list must not read as 'configured'");
});

test("no platform pair configured means nowhere to send, not a guess", () => {
  assert.equal(chooseAddressing({ tenantId: null, notifications: null }, { to: [], from: null }).kind, "none");
  // ...but a tenant's OWN address still works without a platform pair, as long
  // as it supplied a from.
  assert.equal(
    chooseAddressing({ tenantId: "t1", notifications: TENANT_MAILBOX }, { to: [], from: null }).kind,
    "tenant",
  );
});

test("full detail is NEVER addressed anywhere but the tenant it concerns", () => {
  // The invariant, asserted directly rather than inferred from the cases above.
  for (const notifications of [null, TENANT_MAILBOX, { escalation_emails: [], from: "a@b.c" }]) {
    for (const tenantId of [null, "t"]) {
      const a = chooseAddressing({ tenantId, notifications }, PLATFORM);
      if (a.kind === "platform") {
        assert.equal(tenantId, null, "full detail went to the platform's address for a workspace it does not own");
      }
      if (a.kind === "tenant") {
        assert.ok(notifications?.escalation_emails?.length, "addressed a tenant that configured nothing");
      }
    }
  }
});
