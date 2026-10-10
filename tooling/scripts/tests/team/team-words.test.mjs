/**
 * What Settings › Team says, held where contracts says it (the redesign of 9 Oct 2026).
 *
 * - Who gets alerts: one reading of `notifications.escalation_emails` for Team, Notifications and the calendar, the
 *   addresses compared trimmed and lowercased on both sides, and a change that keeps the rest of the section and
 *   refuses what the save would refuse (no address left, an eleventh).
 * - The roles in words, once: every role has its name, its article and its sentences, and the roles compared are
 *   drawn from ROLE_PERMS itself, so the table cannot say a role may do what the gates refuse it.
 * - An owner previewing a narrower role is told so on every page, by the shell's one status line.
 * - The ledger's two new rows read as what happened: an invitation sent again, a member who left.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALERT_ADDRESSES_MAX,
  ALERT_REFUSED_WORDS,
  NotificationsConfigSchema,
  ROLES,
  ROLE_PERMS,
  ROLE_SAYS,
  ROLE_WORDS,
  activityWords,
  alertAddressesOf,
  memberGetsAlerts,
  ownAddressesOf,
  roleSays,
  roleTable,
  shellStatusLine,
  withAlertAddress,
} from "@chanlytics/contracts";

const N = (...escalation_emails) => ({ escalation_emails, from: "Front desk" });

test("an alert address is the member's however either side was written", () => {
  const n = N(" Ana@Shop.example ", "bo@shop.example");
  assert.deepEqual([...alertAddressesOf(n)], ["ana@shop.example", "bo@shop.example"]);
  assert.equal(memberGetsAlerts("ana@shop.example", n), true);
  assert.equal(memberGetsAlerts("BO@SHOP.EXAMPLE ", n), true);
  assert.equal(memberGetsAlerts("cy@shop.example", n), false);
  assert.equal(memberGetsAlerts("", n), false, "no address is nobody");
  assert.equal(memberGetsAlerts("ana@shop.example", null), false, "a config never saved alerts nobody");
  assert.equal(memberGetsAlerts("ana@shop.example", {}), false);
});

test("the calendar's own addresses are the alert addresses, read by the one helper, and the calendar's owner", () => {
  const own = ownAddressesOf({
    notifications: N("Ana@Shop.example"),
    calendar: { ical_url: "https://calendar.google.com/calendar/ical/owner%40shop.example/private-abc/basic.ics" },
  });
  assert.deepEqual([...own].sort(), ["ana@shop.example", "owner@shop.example"]);
});

test("turning alerts on or off for a member keeps the rest of the section, and refuses what the save would refuse", () => {
  const on = withAlertAddress(N("ana@shop.example"), "Bo@Shop.example", true);
  assert.equal(on.ok, true);
  assert.equal(on.changed, true);
  assert.deepEqual(on.notifications, {
    escalation_emails: ["ana@shop.example", "bo@shop.example"],
    from: "Front desk",
  });
  assert.equal(NotificationsConfigSchema.safeParse(on.notifications).success, true, "what it makes, the save takes");

  const already = withAlertAddress(N("ANA@shop.example"), "ana@shop.example", true);
  assert.equal(already.ok && already.changed, false, "already on is no change");
  assert.deepEqual(already.notifications.escalation_emails, ["ANA@shop.example"], "and the list is left as written");

  const off = withAlertAddress(N("Ana@Shop.example", "bo@shop.example"), "ana@shop.example", false);
  assert.deepEqual(off.ok && off.notifications.escalation_emails, ["bo@shop.example"]);
  assert.equal(off.ok && off.notifications.from, "Front desk", "a field beside the list survives");

  assert.deepEqual(withAlertAddress(N("ana@shop.example"), "ana@shop.example", false), { ok: false, reason: "last" });
  const full = N(...Array.from({ length: ALERT_ADDRESSES_MAX }, (_, i) => `p${i}@shop.example`));
  assert.deepEqual(withAlertAddress(full, "new@shop.example", true), { ok: false, reason: "full" });
  assert.deepEqual(withAlertAddress(full, "p1@shop.example", true).ok, true, "one already there is no eleventh");
  assert.deepEqual(withAlertAddress(N("a@shop.example"), "  ", true), { ok: false, reason: "address" });
  for (const reason of ["last", "full", "address"]) assert.ok(ALERT_REFUSED_WORDS[reason].endsWith("."));

  const fromNothing = withAlertAddress(undefined, "ana@shop.example", true);
  assert.deepEqual(fromNothing.ok && fromNothing.notifications, { escalation_emails: ["ana@shop.example"] });
});

test("every role is said once: a name, its article, a sentence and a short line; the shell's names are the same names", () => {
  for (const r of ROLES) {
    const w = ROLE_SAYS[r];
    assert.ok(w.label && w.can && w.short, r);
    assert.match(w.one, new RegExp(`^an? ${w.label}$`), `${r}: the article goes with the name`);
    assert.equal(ROLE_WORDS[r], w.label, `${r}: the shell's ROLE_WORDS are these`);
  }
  assert.deepEqual(
    roleSays("auditor"),
    { label: "auditor", one: "auditor", can: "", short: "" },
    "a role unknown is said as stored",
  );
});

test("the roles compared are ROLE_PERMS itself, every permission on one line, and seeing is every role's", () => {
  const rows = roleTable();
  const perms = Object.keys(ROLE_PERMS.owner);
  assert.equal(rows.length, perms.length + 1, "a line a permission, and the line everyone has");
  for (const r of ROLES) {
    const can = rows.filter((row) => row.can[r]).length - 1;
    const allowed = perms.filter((p) => ROLE_PERMS[r][p]).length;
    assert.equal(can, allowed, `${r}: the table says what the gates allow, no more and no less`);
  }
  assert.ok(rows[0].says.startsWith("See"));
  assert.ok(
    ROLES.every((r) => rows[0].can[r]),
    "a viewer sees everything",
  );
  assert.ok(
    ROLES.every((r) => !rows.at(-1).can[r] || r === "owner"),
    "the team is the owner's alone",
  );
  assert.equal(rows.find((row) => row.says === "Find leads").note, "uses the month's allowance");
});

test("an owner previewing a narrower role reads it on every page, with the way out, below a pause and above a newer build", () => {
  const base = { stale: false, degraded: [] };
  assert.deepEqual(shellStatusLine({ ...base, previewing: "viewer" }), {
    kind: "preview",
    tone: "info",
    text: "Previewing as a Viewer",
    detail: "Controls a Viewer wouldn't have are hidden. Your own access hasn't changed.",
    action: "exit-preview",
    cta: "Exit preview",
    busy: null,
  });
  assert.equal(shellStatusLine({ ...base, previewing: "operator" }).text, "Previewing as an Operator");
  assert.equal(shellStatusLine({ ...base, previewing: null }), null, "themself is no line");
  assert.equal(
    shellStatusLine({ ...base, previewing: "viewer", paused: true }).kind,
    "paused",
    "a pause reaches customers",
  );
  assert.equal(shellStatusLine({ ...base, previewing: "viewer", offline: true }).kind, "offline");
  assert.equal(shellStatusLine({ ...base, previewing: "viewer", stale: true }).kind, "preview");
  assert.equal(shellStatusLine({ stale: false, degraded: ["Inbox"], previewing: "viewer" }).kind, "preview");
});

test("the ledger's new rows read as what happened: an invitation sent again, and a member who left", () => {
  assert.equal(
    activityWords("invite", { email: "bo@shop.example", role: "viewer", resent: true }),
    "Sent an invitation again",
  );
  assert.equal(activityWords("invite", { email: "bo@shop.example", role: "viewer" }), "Invited a member");
  assert.equal(activityWords("remove_member", { had_role: "operator", left: true }), "Left the team");
  assert.equal(activityWords("remove_member", { had_role: "operator" }), "Removed a member");
});
