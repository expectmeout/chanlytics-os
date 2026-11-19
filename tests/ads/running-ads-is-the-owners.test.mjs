/**
 * Running ads is the owner's alone (decision 0050, call 2; decision 0049, step P0b): the permission `ads` in contracts'
 * ROLE_PERMS, and the sentence the gate says before a press. The platform bills the owner, so a partner, who sets a
 * workspace up, does not hold it. SQL's has_permission says the same from 00645, and
 * tests/leads/engine/lead-engine.db.test.mjs holds the two equal, role by role and permission by permission.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_PERMS, ROLES, roleGate } from "@chanlytics/contracts";

test("only an owner may run ads: no partner, no operator, no viewer", () => {
  assert.deepEqual(
    ROLES.filter((role) => ROLE_PERMS[role].ads),
    ["owner"],
  );
});

test("the gate says so before the press, in the words the refusal gives after it", () => {
  assert.equal(roleGate("owner", "ads"), null);
  for (const role of ["partner", "operator", "viewer", "nobody", null, undefined])
    assert.deepEqual(
      roleGate(role, "ads"),
      { needs: "owner", title: roleGate("viewer", "billing").title, reason: "Only an owner can run ads." },
      `${role} is told who may`,
    );
  assert.equal(
    roleGate("partner", "ads", "connect an ad account").reason,
    "Only an owner can connect an ad account.",
    "a control whose own act is narrower names it",
  );
});
