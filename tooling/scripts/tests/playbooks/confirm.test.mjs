/**
 * One Confirm, one danger button.
 *
 * Five idioms confirmed an act: a hand-rolled Yes/No sentence in four
 * wordings, a button that changed its own label on the first click, a typed
 * name, commit-then-Undo, and nothing at all on the most destructive act on
 * Settings -- removing a teammate fired straight from a menu item (the
 * audit's D13). One primitive now (the kit's Confirm, surfaces/kit/confirm),
 * pure, so every harness draws it. Run here: its shape, then the doors the
 * audit named that stand -- the Team row and a broadcast's stop (a playbook's
 * delete went with its card, decision 0060's S6) -- each mounted over a fake
 * React and pressed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find, byTestId, textOf, classes } from "../_legacy-react.mjs";

/* ------------------------------ the harness ------------------------------ */

const calls = { flash: [], remove: [], cancel: [], arm: [], nav: [] };
installLegacyReact({
  StatStrip: "StatStrip",
  StatCell: "StatCell",
  __chrome: { state: stateOf },
  __ME: { email: "ruben@rjcapital.io", role: "owner" },
  __SETTINGS: { role: "owner" },
  __TEAM: [
    { membershipId: "m-ruben", email: "ruben@rjcapital.io", displayName: "Ruben", role: "owner" },
    { membershipId: "m-lena", email: "lena@example.com", displayName: "Lena Park", role: "operator" },
  ],
  __TEAM_INVITES: [{ id: "i-jay", email: "jay@example.com", role: "viewer", expires_at: "2026-09-20T00:00:00Z" }],
  __identity: {
    member: ({ email, display_name }) => ({ name: display_name || email, sub: display_name ? email : null }),
    initials: (name, email) =>
      String(name || email)
        .slice(0, 2)
        .toUpperCase(),
  },
  CHANLY: { nav: (to) => calls.nav.push(to), R: {} },
  gate: () => ({}),
});
const S = "../../../../apps/dashboard/src";
// The one Confirm is the shell's (surfaces/frame), and so are the Team card's menu and state pill: JSX the frame loads.
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const { Confirm, MoreMenu } = globalThis;
// The Broadcasts and Playbooks pages are TSX (decision 0015): their verbs are imported, and their surfaces are the seam's.
const { BcRunVerbs } = await import(`${S}/surfaces/campaigns/broadcasts/run.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
// The broadcast's own door, as the run's verbs are handed it.
const cancelBroadcast = async (id) => {
  calls.cancel.push(id);
  return { ok: true, data: { was: "sending" } };
};

const byClass = (tree, cls) => find(tree, (n) => classes(n).includes(cls));
const flash = (m) => calls.flash.push(m);

/* ------------------------------ the primitive ---------------------------- */

test("the shape: the question, what happens, a Yes that names the verb as a real button, a quiet No; the testids from one name", () => {
  const c = Confirm({
    question: "Disconnect Google?",
    detail: "The public listing stays.",
    yes: "Yes, disconnect",
    onYes() {},
    onNo() {},
    testid: "google-disconnect",
  });
  assert.equal(c.props.className, "confirm");
  assert.equal(c.props.role, "group");
  assert.equal(c.props["aria-label"], "Disconnect Google?");
  assert.equal(c.props["data-testid"], "google-disconnect-confirm");
  const yes = byTestId(c, "google-disconnect-yes");
  const no = byTestId(c, "google-disconnect-no");
  assert.equal(yes.type, "button");
  assert.equal(yes.props.className, "btn btn-sm", "a real button, not a link");
  assert.equal(textOf(yes), "Yes, disconnect");
  assert.equal(yes.props.autoFocus, true, "the Yes takes focus as the question appears");
  assert.equal(textOf(no), "No");
  assert.equal(no.props.className, "btn btn-sm btn-ghost", "a button of the Yes's height, quiet");
  assert.ok(textOf(c).includes("The public listing stays."));
  assert.equal(byTestId(c, "google-disconnect-typed"), null, "no typing unless asked");
});

test("danger fills the Yes red; block draws a panel; busy holds both buttons and says what it is doing", () => {
  const d = Confirm({
    question: "Delete?",
    yes: "Yes, delete",
    danger: true,
    block: true,
    busy: true,
    busyLabel: "Deleting…",
    onYes() {},
    onNo() {},
    testid: "x",
  });
  assert.equal(d.props.className, "confirm confirm-block confirm-danger");
  const yes = byTestId(d, "x-yes");
  assert.equal(yes.props.className, "btn btn-sm btn-danger");
  assert.equal(yes.props.disabled, true);
  assert.equal(textOf(yes), "Deleting…");
  assert.equal(byTestId(d, "x-no").props.disabled, true);
});

test("a discard is never the red fill: red words on no ground, and the No as the plain button beside it", () => {
  // Ruben, 7 Oct 2026: a red "Yes, discard" stood over a coral Save. A discard touches nothing that was kept, so one
  // question holds no filled colour for it, whatever else it is handed.
  const d = Confirm({
    question: "Discard your changes?",
    detail: "Nothing you changed here has been saved.",
    yes: "Yes, discard",
    no: "Keep editing",
    discard: true,
    danger: true,
    onYes() {},
    onNo() {},
    testid: "x",
  });
  assert.equal(d.props.className, "confirm confirm-discard", "its own mark, and not the mark of an act that destroys");
  assert.equal(byTestId(d, "x-yes").props.className, "btn btn-sm btn-ghost danger", "the quiet red, never btn-danger");
  assert.equal(byTestId(d, "x-no").props.className, "btn btn-sm", "the plain button, a pair with the Yes");
  assert.equal(textOf(byTestId(d, "x-no")), "Keep editing");
  // Ruben, 19 Oct 2026: the answer that keeps the work holds focus, so an Enter out of habit throws nothing away.
  assert.equal(byTestId(d, "x-yes").props.autoFocus, false, "Discard does not take focus");
  assert.equal(byTestId(d, "x-no").props.autoFocus, true, "Keep editing does");
});

test("Escape is No -- unless the act is already on its way", () => {
  let no = 0;
  let stopped = 0;
  Confirm({ question: "?", onYes() {}, onNo: () => no++ }).props.onKeyDown({
    key: "Escape",
    stopPropagation: () => stopped++,
  });
  assert.equal(no, 1);
  assert.equal(stopped, 1, "the key does not reach the row behind");
  Confirm({ question: "?", onYes() {}, onNo: () => no++ }).props.onKeyDown({
    key: "Enter",
    stopPropagation: () => stopped++,
  });
  assert.equal(no, 1, "Enter is the Yes button's own");
  Confirm({ question: "?", busy: true, onYes() {}, onNo: () => no++ }).props.onKeyDown({
    key: "Escape",
    stopPropagation: () => stopped++,
  });
  assert.equal(no, 1, "busy: the act is on its way, Escape does nothing");
});

test("a typed name gates the Yes -- erasure only -- and the page may know a better match", () => {
  const props = {
    question: "Delete this person?",
    typed: "Rosa M",
    yes: "Delete this person",
    danger: true,
    onYes() {},
    onNo() {},
    testid: "delete",
  };
  const empty = Confirm({ ...props, value: "" });
  assert.equal(byTestId(empty, "delete-yes").props.disabled, true);
  const input = byTestId(empty, "delete-typed");
  assert.equal(input.type, "input");
  assert.equal(input.props.placeholder, "Rosa M");
  assert.equal(input.props["aria-label"], "Type Rosa M to confirm");
  assert.equal(input.props.autoFocus, true);
  assert.equal(byTestId(empty, "delete-yes").props.autoFocus, false, "the input has the focus, not the button");
  // On a touch screen the question opens on itself and the name's field waits for a tap (Ruben, 9 October 2026: no
  // editor a press opens raises the keyboard by itself).
  const media = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q === "(pointer: coarse)" });
  try {
    const touched = Confirm({ ...props, value: "" });
    assert.equal(byTestId(touched, "delete-typed").props.autoFocus, false, "the keyboard waits for a tap");
    assert.equal(byTestId(touched, "delete-confirm").props.tabIndex, -1, "and the question's own box can hold focus");
  } finally {
    globalThis.matchMedia = media;
  }
  assert.equal(byTestId(empty, "delete-confirm").props.tabIndex, -1);
  assert.equal(
    byTestId(Confirm({ ...props, value: "rosa" }), "delete-yes").props.disabled,
    true,
    "close is not the name",
  );
  assert.equal(
    byTestId(Confirm({ ...props, value: " Rosa M " }), "delete-yes").props.disabled,
    false,
    "the name, whitespace forgiven",
  );
  assert.equal(
    byTestId(Confirm({ ...props, value: "+1 646 555 0123", ready: true }), "delete-yes").props.disabled,
    false,
    "ready overrides: the page matched their phone number",
  );
  assert.equal(
    byTestId(Confirm({ ...props, value: "Rosa M", ready: false }), "delete-yes").props.disabled,
    true,
    "and can refuse what would otherwise match",
  );
  let typed = null;
  byTestId(
    Confirm({
      ...props,
      value: "",
      onType: (v) => {
        typed = v;
      },
    }),
    "delete-typed",
  ).props.onChange({ target: { value: "Ro" } });
  assert.equal(typed, "Ro", "the text is the page's, so the record keeps it");
  const err = byClass(Confirm({ ...props, value: "Rosa M", error: "Could not delete this person." }), "confirm-error");
  assert.ok(err);
  assert.equal(err.props.role, "alert");
  assert.equal(textOf(err), "Could not delete this person.");
});

/* -------------------- Settings › Team: the D13 door ---------------------- */

// The card is TSX (surfaces/settings/team, decision 0015 step 11): its roster is the seam's settings value, and its three
// doors the bridge's teamVerbs, which a test stands a door in on.
const { TeamSection } = await import(`${S}/surfaces/settings/team/team.tsx`);
const { teamVerbs } = await import(`${S}/legacy-bridge/inbox-verbs.ts`);
Object.assign(teamVerbs, {
  remove: async (id) => {
    calls.remove.push(id);
    return { ok: true, data: { revokedInvite: id.startsWith("i-") } };
  },
  setRole: async () => ({ ok: true }),
  invite: async () => ({ ok: true }),
});
setSurfaceValue("settings", {
  settings: globalThis.window.__SETTINGS,
  facts: null,
  channels: null,
  templatesAll: null,
  templateUse: null,
  templateSent: null,
  team: globalThis.window.__TEAM,
  invites: globalThis.window.__TEAM_INVITES,
});
const drawTeam = () => again(() => TeamSection({ flash }));
/** The row menu that offers `label`, as the props the card handed the shared MoreMenu. */
const menuFor = (tree, label) =>
  find(tree, (n) => n.type === MoreMenu && (n.props.items || []).some((i) => i.label === label));

test("REGRESSION (D13): removing a teammate asks first -- the menu item arms, the row asks, and only the Yes reaches the server, with the membership id", async () => {
  fresh();
  let tree = drawTeam();
  assert.equal(byTestId(tree, "team-remove-confirm"), null, "nothing is asked until the menu is used");
  const menu = menuFor(tree, "Remove from team…");
  assert.ok(menu, "Lena's row has the menu with Remove");
  menu.props.items.find((i) => i.label === "Remove from team…").onClick();
  assert.deepEqual(calls.remove, [], "REGRESSION: the menu item used to remove on the spot");
  tree = drawTeam();
  const ask = byTestId(tree, "team-remove-confirm");
  assert.ok(ask, "the row asks");
  assert.ok(textOf(ask).includes("Remove Lena Park from the team?"), textOf(ask));
  assert.ok(textOf(ask).includes("They lose access at once"));
  const yes = byTestId(tree, "team-remove-yes");
  assert.equal(yes.props.className, "btn btn-sm btn-danger", "the act that cannot be taken back is red");
  assert.equal(textOf(yes), "Yes, remove");
  byTestId(tree, "team-remove-no").props.onClick();
  tree = drawTeam();
  assert.equal(byTestId(tree, "team-remove-confirm"), null, "No disarms");
  menuFor(tree, "Remove from team…")
    .props.items.find((i) => i.label === "Remove from team…")
    .onClick();
  tree = drawTeam();
  await byTestId(tree, "team-remove-yes").props.onClick();
  assert.deepEqual(calls.remove, ["m-lena"], "the membership id, as the route takes it");
  tree = drawTeam();
  assert.equal(byTestId(tree, "team-remove-confirm"), null, "disarmed after the act");
  const said = calls.flash.at(-1);
  assert.equal(said.tone, "ok");
  assert.ok(textOf(said.msg).includes("removed from the team"));
});

test("revoking an invitation asks in its own words", () => {
  fresh();
  let tree = drawTeam();
  menuFor(tree, "Revoke invitation…")
    .props.items.find((i) => i.label === "Revoke invitation…")
    .onClick();
  tree = drawTeam();
  const ask = byTestId(tree, "team-remove-confirm");
  assert.ok(ask, "the invitation's row asks");
  assert.ok(textOf(ask).includes("Revoke the invitation to jay@example.com?"), textOf(ask));
  assert.ok(textOf(ask).includes("The link in their email stops working."));
  assert.equal(textOf(byTestId(tree, "team-remove-yes")), "Yes, revoke");
});

/* ------------------- Broadcasts: three verbs, each armed ------------------ */

// A run as its report's verbs read it (BcRunVerbs, run.tsx), where the stop lives.
const broadcast = (state) => ({
  id: `b-${state}`,
  name: "September offer",
  state,
  stateLabel: state,
  when: "today 10:00",
  audience: { label: "Everyone who said yes" },
  recipient_count: 40,
  counts: { sent: 12, skipped: 1, failed: 0 },
});

test("a broadcast's stop is armed and named for what it does: Stop a send, Skip a run nobody approved, Cancel one still to come", async () => {
  fresh();
  // The verbs (BcRunVerbs, run.tsx), as the run's report draws them for every run still open.
  const draw = (state, armed, canSend = true) =>
    again(() =>
      BcRunVerbs({
        row: broadcast(state),
        canSend,
        armed,
        onArm: (on) => calls.arm.push(on),
        stopping: false,
        approve() {},
        cancel: (r) => cancelBroadcast(r.id),
      }),
    );
  for (const [state, verb, question, yes] of [
    ["sending", "Stop", "Stop September offer?", "Yes, stop it"],
    ["pending_approval", "Skip", "Skip September offer?", "Yes, skip it"],
    ["scheduled", "Cancel", "Cancel September offer?", "Yes, cancel it"],
  ]) {
    const quiet = draw(state, false);
    const trigger = byTestId(quiet, "bc-stop");
    assert.equal(textOf(trigger), verb, state);
    // The kit's Button (surfaces/kit/button/) in its quiet danger form; the host button it draws wears the classes.
    assert.equal(
      find(trigger, (n) => n.type === "button").props.className,
      "btn btn-sm danger",
      "the quiet danger form arms",
    );
    assert.equal(byTestId(quiet, "bc-stop-confirm"), null);
    trigger.props.onClick();
    assert.equal(calls.arm.at(-1), true, "the button arms, it does not cancel");
    const asked = draw(state, true);
    assert.equal(byTestId(asked, "bc-stop"), null, "while asked, the trigger is gone");
    assert.equal(byTestId(asked, "bc-approve"), null, "and so is Approve");
    assert.ok(textOf(byTestId(asked, "bc-stop-confirm")).includes(question), state);
    assert.equal(textOf(byTestId(asked, "bc-stop-yes")), yes);
  }
  assert.deepEqual(calls.cancel, [], "REGRESSION: one click used to cancel");
  await byTestId(draw("sending", true), "bc-stop-yes").props.onClick();
  assert.deepEqual(calls.cancel, ["b-sending"]);
  assert.equal(byTestId(draw("sending", false, false), "bc-stop"), null, "a viewer has no stop to arm");
  // Unarmed, a run waiting for approval offers Approve beside its Skip.
  assert.ok(byTestId(draw("pending_approval", false), "bc-approve"));
});
