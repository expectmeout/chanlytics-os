/**
 * A new workspace's first alert address is its creator's.
 *
 * Without one, the edge's chooseAddressing (apps/edge/lib/ops/notify.ts) sends
 * every "a customer needs you" to the platform, redacted, and the owner is
 * never told: a self-serve workspace in its default state emailed nobody.
 * The address is written through the same schema the runtime reads, so an
 * address the schema would refuse is never saved -- saved, it would make the
 * whole config unreadable, and the receptionist silent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withFirstAlertAddress, parseTenantConfigResult } from "@chanlytics/contracts";

test("F3: the creator's address becomes the first alert address, trimmed and in lower case", () => {
  const next = withFirstAlertAddress({}, "  Ada@Example.com ");
  assert.deepEqual(next, { notifications: { escalation_emails: ["ada@example.com"] } });
  assert.equal(
    parseTenantConfigResult(next).ok,
    true,
    "what is saved reads back: the receptionist never goes silent over it",
  );
});

test("F3: nothing is written over a choice already made, a config that will not parse, or an address the schema refuses", () => {
  assert.equal(
    withFirstAlertAddress({ notifications: { escalation_emails: ["owner@salon.example"] } }, "ada@example.com"),
    null,
    "an address already chosen is kept",
  );
  assert.equal(withFirstAlertAddress({}, "not an email"), null, "an address the schema refuses is never written");
  assert.equal(withFirstAlertAddress({}, ""), null);
  assert.equal(withFirstAlertAddress({}, null), null);
  assert.equal(
    withFirstAlertAddress({ brain: "broken" }, "ada@example.com"),
    null,
    "a config that will not parse is left alone",
  );
});

test("F3: whatever else the config holds rides along unchanged", () => {
  const calendar = { ical_url: "https://calendar.example.com/private/abc/basic.ics" };
  assert.deepEqual(withFirstAlertAddress({ calendar }, "ada@example.com"), {
    calendar,
    notifications: { escalation_emails: ["ada@example.com"] },
  });
});
