/**
 * Settings › Team, as an owner and as an operator use it (the redesign of 9 Oct 2026), drawn on the stub React through
 * the card itself, its doors the bridge's teamVerbs (a test stands each in) and its alerts the settings save (over a
 * fetch that records what was sent).
 *
 * - The people first, you at the top; a role an owner may change is a picker, everywhere else the word.
 * - Owner is asked for, on the row, before it is given; any other role is given on the press.
 * - The invitations wait in a group of their own, and Resend or Send again sends one again.
 * - Leave asks, and the only owner may not; who gets alerts is changed through the settings save, the section kept.
 * - Several addresses go at once, and each is said apart; the invitations' bucket stops the rest, said as not sent.
 * - An operator reads the roster, the gate's sentence, and whom to ask.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_PERMS, roleGate, roleTable, stateOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, press, settle } from "../_legacy-react.mjs";

const calls = { flash: [], invite: [], setRole: [], remove: [], resend: [], leave: 0, put: [], assign: [], viewAs: [] };
installLegacyReact({
  __chrome: { state: stateOf },
  __ME: { email: "ruben@rjcapital.io", role: "owner" },
  gate: () => ({}),
  // As the bridge publishes them (seed-globals.ts): the role table and the gate's sentence are contracts'.
  ROLE_PERMS,
  __roleGate: roleGate,
});
globalThis.window.location.assign = (to) => calls.assign.push(to);
// The settings save, as the bridge sends it: what was PUT is kept, and the server says yes.
globalThis.window.fetch = async (url, init = {}) => {
  if (String(url).includes("/api/v1/settings") && init.method === "PUT") calls.put.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ ok: true, data: { version: 8 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const S = "../../../../apps/dashboard/src";
await import(`${S}/legacy/components/data-bits.jsx`);
const { MoreMenu } = globalThis;
const { TeamSection } = await import(`${S}/surfaces/settings/team/team.tsx`);
const { teamVerbs } = await import(`${S}/legacy-bridge/inbox-verbs.ts`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);

const flash = (m) => calls.flash.push(m);
const answers = { invite: (email) => ({ ok: true, data: { invited: true, email } }) };
Object.assign(teamVerbs, {
  invite: async (email, role) => {
    calls.invite.push([email, role]);
    return answers.invite(email, role);
  },
  setRole: async (id, role) => {
    calls.setRole.push([id, role]);
    return { ok: true };
  },
  remove: async (id) => {
    calls.remove.push(id);
    return { ok: true, data: { revokedInvite: id.startsWith("i-") } };
  },
  resend: async (id) => {
    calls.resend.push(id);
    return { ok: true, data: { resent: true } };
  },
  leave: async () => {
    calls.leave += 1;
    return { ok: true, data: { left: true } };
  },
});

const OWNER = {
  membershipId: "m-ruben",
  userId: "u1",
  email: "ruben@rjcapital.io",
  displayName: "",
  role: "owner",
  joined_at: "2026-08-28T05:00:00Z",
};
const OTHER_OWNER = {
  membershipId: "m-s",
  userId: "u2",
  email: "s@example.com",
  displayName: "",
  role: "owner",
  joined_at: "2026-09-03T15:00:00Z",
};
const ALEX = {
  membershipId: "m-alex",
  userId: "u3",
  email: "alex@example.com",
  displayName: "Alex Rivera",
  role: "operator",
  joined_at: "2026-10-01T15:00:00Z",
};
const PARTNER = {
  membershipId: "m-p",
  userId: "u4",
  email: "ada@example.com",
  displayName: "",
  role: "partner",
  joined_at: null,
};
const later = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
const JAMIE = {
  id: "i-jamie",
  email: "jamie@example.com",
  role: "viewer",
  created_at: later(-2),
  expires_at: later(5),
};
const SAM = { id: "i-sam", email: "sam@example.com", role: "operator", created_at: later(-14), expires_at: later(-7) };

/** The settings read the card draws from: the caller's role, the config with its alert list, the roster. */
function workspace({
  role = "owner",
  team = [OWNER, ALEX],
  invites = [JAMIE, SAM],
  alerts = ["Ruben@RJCapital.io", "alex@example.com"],
} = {}) {
  setSurfaceValue("settings", {
    settings: {
      config: { brain: {}, notifications: { escalation_emails: alerts, from: "Front desk" } },
      version: 7,
      role,
    },
    facts: null,
    channels: null,
    templatesAll: null,
    templateUse: null,
    templateSent: null,
    team,
    invites,
  });
}
const draw = () => again(() => TeamSection({ flash }));
const rows = (tree) => all(tree, (n) => String(n.props?.className || "").startsWith("set-team-row"));
const menuOf = (tree, testid) => find(tree, (n) => n.type === MoreMenu && n.props.testid === testid);
const item = (menu, label) => {
  const it = menu.props.items.find((i) => i.label === label);
  assert.ok(it, `the menu offers ${label}: ${menu.props.items.map((i) => i.label || i.header).join(", ")}`);
  return it;
};
const reset = () => {
  for (const k of Object.keys(calls)) calls[k] = Array.isArray(calls[k]) ? [] : 0;
  delete globalThis.window.ST_STORE;
};

test("the people come first, you at the top: the joined day and the alerts mark under each name, and the role a picker only where an owner may change it", () => {
  reset();
  fresh();
  workspace({ team: [ALEX, OWNER, PARTNER] });
  const tree = draw();
  const members = rows(tree).filter((r) => !String(r.props.className).includes("pending"));
  assert.deepEqual(
    members.map((r) => r.props["data-testid"]),
    ["team-row-m-ruben", "team-row-m-alex", "team-row-m-p"],
    "you first, then the roster's order",
  );
  const me = members[0];
  assert.ok(
    find(me, (n) => n.props?.className === "chip set-team-you"),
    "You, on your own row",
  );
  assert.match(textOf(find(me, (n) => n.props?.className === "set-team-mail")), /Joined Aug 28 · +Gets alerts/);
  assert.equal(menuOf(me, "team-role-m-ruben"), null, "your own role is a word");
  assert.ok(byTestId(tree, "team-alerts-m-alex"), "the alert list's address, whatever its case, is Alex's");
  const role = menuOf(tree, "team-role-m-alex");
  assert.equal(role.props.label, "Operator", "a picker that says the role it holds");
  assert.deepEqual(
    role.props.items.filter((i) => i.label).map((i) => [i.label, i.checked, i.meta]),
    [
      ["Owner", false, "Everything, billing and the team included"],
      ["Operator", true, "Answers and approves, tunes autonomy"],
      ["Viewer", false, "Sees everything, changes nothing"],
    ],
  );
  assert.equal(menuOf(tree, "team-role-m-p"), null, "a partner's role is the attribution's, never Team's to give");
  assert.equal(textOf(find(tree, (n) => n.props?.className === "rec-card-sub")), "3 people · 2 waiting");
});

test("Owner is asked for on the row before it is given; any other role is given on the press", async () => {
  reset();
  fresh();
  workspace();
  let tree = draw();
  item(menuOf(tree, "team-role-m-alex"), "Owner").onClick();
  assert.deepEqual(calls.setRole, [], "nothing changes before the answer");
  tree = draw();
  const ask = byTestId(tree, "team-promote-confirm");
  assert.ok(ask, "the row asks");
  assert.match(
    textOf(ask),
    /Make Alex Rivera an Owner\?.*Owners run billing and the team, and can remove anyone, you included\./s,
  );
  await byTestId(tree, "team-promote-yes").props.onClick();
  assert.deepEqual(calls.setRole, [["m-alex", "owner"]]);
  assert.match(textOf(calls.flash.at(-1).msg), /Alex Rivera is now an Owner/);

  tree = draw();
  item(menuOf(tree, "team-role-m-alex"), "Viewer").onClick();
  await settle();
  assert.deepEqual(calls.setRole.at(-1), ["m-alex", "viewer"], "a narrower role is given at once");
});

test("the invitations wait in their own group: days left or Expired, Resend or Send again, and ⋯ Revoke, which asks", async () => {
  reset();
  fresh();
  workspace();
  let tree = draw();
  assert.ok(byTestId(tree, "team-waiting"));
  const jamie = byTestId(tree, "team-row-i-jamie");
  assert.match(textOf(jamie), /Viewer · invited .* · 5 days left/);
  assert.equal(textOf(byTestId(tree, "team-resend-i-jamie")), "Resend");
  assert.ok(byTestId(tree, "team-expired-i-sam"), "an expired one says so as a state");
  assert.equal(textOf(byTestId(tree, "team-resend-i-sam")), "Send again");
  await press(byTestId(tree, "team-resend-i-sam"));
  await settle();
  assert.deepEqual(calls.resend, ["i-sam"]);
  assert.match(textOf(calls.flash.at(-1).msg), /Invitation sent to sam@example.com again/);

  tree = draw();
  item(menuOf(tree, "team-more-i-jamie"), "Revoke invitation…").onClick();
  tree = draw();
  assert.match(textOf(byTestId(tree, "team-remove-confirm")), /Revoke the invitation to jamie@example.com\?/);
  assert.equal(menuOf(tree, "team-role-i-jamie"), null, "an invitation has no role to change");
});

test("Leave asks, and the only owner may not leave; with another owner, the Yes leaves and opens the workspaces still held", async () => {
  reset();
  fresh();
  workspace();
  let tree = draw();
  const lone = item(menuOf(tree, "team-more-m-ruben"), "Leave this workspace…");
  assert.ok(lone.gate && Object.keys(lone.gate).length, "the only owner's Leave is gated, saying why when pressed");

  workspace({ team: [OWNER, OTHER_OWNER, ALEX] });
  tree = draw();
  const leave = item(menuOf(tree, "team-more-m-ruben"), "Leave this workspace…");
  assert.equal(leave.gate, undefined);
  leave.onClick();
  tree = draw();
  assert.match(textOf(byTestId(tree, "team-leave-confirm")), /Leave this workspace\?.*You lose access at once/s);
  await byTestId(tree, "team-leave-yes").props.onClick();
  // The alerts save goes first and is read again behind: wait for the leave, by condition, not by a count of ticks.
  for (let i = 0; i < 100 && !calls.leave; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.leave, 1);
  assert.deepEqual(calls.assign, ["/"], "nothing of it is theirs to read now");
});

test("alerts on and off go through the settings save, the rest of the section kept; the last address stays", async () => {
  reset();
  fresh();
  workspace({ team: [OWNER, ALEX, { ...ALEX, membershipId: "m-bo", email: "bo@example.com", displayName: "Bo" }] });
  let tree = draw();
  item(menuOf(tree, "team-more-m-bo"), "Email them alerts").onClick();
  await settle();
  await settle();
  assert.equal(calls.put.length, 1);
  assert.deepEqual(calls.put[0].config.notifications, {
    escalation_emails: ["Ruben@RJCapital.io", "alex@example.com", "bo@example.com"],
    from: "Front desk",
  });
  assert.equal(calls.put[0].version, 7);

  workspace({ team: [OWNER, ALEX], alerts: ["alex@example.com"] });
  tree = draw();
  const stop = item(menuOf(tree, "team-more-m-alex"), "Stop emailing them alerts");
  assert.ok(stop.gate && Object.keys(stop.gate).length, "the last address alerts go to cannot be taken off here");
});

test("removing someone who gets alerts offers to stop emailing them, on by default, and the save follows the removal", async () => {
  reset();
  fresh();
  workspace();
  let tree = draw();
  item(menuOf(tree, "team-more-m-alex"), "Remove from team…").onClick();
  tree = draw();
  const ask = byTestId(tree, "team-remove-confirm");
  assert.match(textOf(ask), /Also stop emailing alex@example.com alerts/);
  assert.equal(find(tree, (n) => n.props?.testid === "team-remove-alerts").props.on, true, "on by default");
  await byTestId(tree, "team-remove-yes").props.onClick();
  await settle();
  await settle();
  assert.deepEqual(calls.remove, ["m-alex"]);
  assert.deepEqual(calls.put.at(-1).config.notifications.escalation_emails, ["Ruben@RJCapital.io"]);
});

test("several addresses go at once and each is said apart; one already waiting offers Resend; the bucket stops the rest as not sent", async () => {
  reset();
  fresh();
  workspace();
  let tree = draw();
  press(byTestId(tree, "team-invite-open"));
  tree = draw();
  const box = find(tree, (n) => n.type === "input" && n.props?.["data-testid"] === "team-invite-email");
  box.props.onChange({ target: { value: "Cy@example.com, jamie@example.com dee@example.com " } });
  tree = draw();
  assert.deepEqual(
    all(
      byTestId(tree, "team-invite-addresses"),
      (n) => n.type === "button" && n.props?.["aria-label"]?.startsWith("Take "),
    ).map((n) => n.props["aria-label"]),
    ["Take cy@example.com off", "Take jamie@example.com off", "Take dee@example.com off"],
  );
  assert.equal(textOf(byTestId(tree, "team-invite-send")), "Send 3 invitations");
  answers.invite = (email) =>
    email === "dee@example.com"
      ? { ok: false, status: 429, message: "Too many invitations. Try again in an hour." }
      : { ok: true, data: { added: true } };
  await byTestId(tree, "team-invite-send").props.onClick();
  await settle();
  tree = draw();
  assert.deepEqual(
    calls.invite,
    [
      ["cy@example.com", "operator"],
      ["dee@example.com", "operator"],
    ],
    "jamie is already waiting",
  );
  const said = textOf(byTestId(tree, "team-invite-said"));
  assert.match(said, /cy@example.com already had an account and joined as Operator/);
  assert.match(said, /jamie@example.com already has an invitation waiting/);
  assert.match(said, /dee@example.com not sent: Too many invitations/);
  await press(byTestId(tree, "team-invite-resend"));
  await settle();
  assert.deepEqual(calls.resend, ["i-jamie"], "Resend from the results is the card's own");
  answers.invite = (email) => ({ ok: true, data: { invited: true, email } });
});

test("an operator reads the roster and the gate's sentence with whom to ask; their own ⋯ holds their name and Leave", () => {
  reset();
  fresh();
  globalThis.window.ST_STORE = { viewAsRole: null, can: (a) => !!ROLE_PERMS.operator[a], myRole: () => "operator" };
  globalThis.window.__ME = { email: "alex@example.com", role: "operator" };
  workspace({ role: "operator", team: [OWNER, ALEX] });
  const tree = draw();
  assert.equal(menuOf(tree, "team-role-m-ruben"), null, "no picker for an operator");
  assert.equal(menuOf(tree, "team-more-m-ruben"), null, "no ⋯ on someone else's row");
  assert.match(textOf(byTestId(tree, "team-gated")), /^Only an owner can change the team\. Ask ruben@rjcapital\.io\.$/);
  const mine = menuOf(tree, "team-more-m-alex");
  assert.deepEqual(
    mine.props.items.filter((i) => i.label).map((i) => i.label),
    ["Change your name", "Leave this workspace…"],
    "an operator may not change who gets alerts",
  );
  globalThis.window.__ME = { email: "ruben@rjcapital.io", role: "owner" };
  delete globalThis.window.ST_STORE;
});

test("the roles' row: Compare opens the table ROLE_PERMS draws; Preview as offers the narrower roles", () => {
  reset();
  fresh();
  workspace();
  let tree = draw();
  assert.equal(byTestId(tree, "team-roles-compare"), null, "the table waits to be asked for");
  press(byTestId(tree, "team-roles-compare-toggle"));
  tree = draw();
  const table = byTestId(tree, "team-roles-compare");
  assert.equal(all(table, (n) => n.type === "tr").length, roleTable().length + 1, "a line a permission, and the head");
  const preview = find(tree, (n) => n.type === MoreMenu && n.props.testid === "team-viewas");
  assert.deepEqual(
    preview.props.items.filter((i) => i.label).map((i) => i.label),
    ["An Operator", "A Viewer"],
  );
});

test("leaving takes your own address off the alerts first, where you may change them, and says so before you press", async () => {
  reset();
  fresh();
  workspace({ team: [OWNER, OTHER_OWNER, ALEX] });
  let tree = draw();
  item(menuOf(tree, "team-more-m-ruben"), "Leave this workspace…").onClick();
  tree = draw();
  assert.match(textOf(byTestId(tree, "team-leave-confirm")), /Your address comes off the alerts too\./);
  await byTestId(tree, "team-leave-yes").props.onClick();
  // The alerts save goes first and is read again behind: wait for the leave, by condition, not by a count of ticks.
  for (let i = 0; i < 100 && !calls.leave; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(
    calls.put.at(-1).config.notifications.escalation_emails,
    ["alex@example.com"],
    "the save went first",
  );
  assert.equal(calls.leave, 1);
  assert.deepEqual(calls.assign, ["/"]);
});

test("a list pasted from a mail's To line gives its addresses, and the names beside them are left out", () => {
  reset();
  fresh();
  workspace({ invites: [] });
  let tree = draw();
  press(byTestId(tree, "team-invite-open"));
  tree = draw();
  const box = find(tree, (n) => n.type === "input" && n.props?.["data-testid"] === "team-invite-email");
  box.props.onChange({ target: { value: 'Ana Perez <Ana@example.com>, "Bo Lee" <bo@example.com>; ' } });
  tree = draw();
  assert.deepEqual(
    all(byTestId(tree, "team-invite-addresses"), (n) => n.type === "button").map((n) => n.props["aria-label"]),
    ["Take ana@example.com off", "Take bo@example.com off"],
  );
  assert.equal(
    find(tree, (n) => String(n.props?.className || "").includes("field-error")),
    null,
    "no name is said to be wrong",
  );
});
