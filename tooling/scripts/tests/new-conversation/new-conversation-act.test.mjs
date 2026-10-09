/**
 * The Inbox's one act and its doors (a conversation begins from the Inbox, the design's 4.1 and 4.7), drawn on the stub
 * React: the Inbox says New conversation to the frame's head through the kit's part for an act's words, its mark kept
 * with its first word, so a phone's capsule says "+ New"; a press asks for the sheet, a pointer reaching it warms the sheet, and a role that may not write is told why
 * and opens nothing; the frame's host answers N on the Inbox's tabs alone, and leaves it alone wherever a page leaves a
 * key alone; and an address that names the sheet is its door.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEW_CONVERSATION_WORDS, newConversationOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find, textOf, press } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
// The standing keeps the minute on a timer (kit/head/dateline.ts), and a test that draws by hand starts none.
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => undefined;
const { useInboxStanding } = await import("../../../../apps/dashboard/src/surfaces/inbox/pages/inbox-head.tsx");
const { NewConversationAct } = await import("../../../../apps/dashboard/src/surfaces/inbox/new-conversation/act.tsx");
const { NewConversationHost } = await import("../../../../apps/dashboard/src/surfaces/inbox/new-conversation/host.tsx");
const { closeNewConversation, newConversationAsked, onWarmAsked, openNewConversation } =
  await import("../../../../apps/dashboard/src/surfaces/inbox/new-conversation/store.ts");
const { standingSaid, forgetStanding } = await import("../../../../apps/dashboard/src/surfaces/kit/head/standing.ts");

const h = (type, props) => globalThis.React.createElement(type, props);
/** The Inbox's route, as far as the head hears it: its standing, said with the act. */
const Page = () => {
  useInboxStanding(h(NewConversationAct));
  return null;
};
/** The act as the head would draw it: the button itself. */
const actSaid = () => {
  forgetStanding();
  fresh();
  again(() => Page());
  return find(standingSaid()?.act ?? null, (n) => n.type === "button" && n.props?.["data-testid"] === "inbox-new");
};
const key = (over = {}) => ({
  type: "keydown",
  key: "n",
  target: { tagName: "DIV" },
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  ...over,
});
/** Where the tab is, as the frame's address says it. */
const at = (route) => {
  globalThis.window.CHANLY = { ...globalThis.window.CHANLY, address: { route: () => route } };
};

test("the Inbox says its one act to the head: New conversation, filled, its mark kept with its first word", () => {
  delete globalThis.window.gate;
  const act = actSaid();
  assert.ok(act, "the act is the head's, at the right of the row of views");
  assert.equal(standingSaid().title, "Inbox");
  assert.ok(act.props.className.includes("btn-primary"), "the page's one filled button");
  assert.ok(act.props.className.includes("btn-lg"), "the head's size, the row of views' own height");
  assert.equal(textOf(act), NEW_CONVERSATION_WORDS.act, "the whole name is the button's own words, at every width");
  // The kit's part for an act's words (kit/head/act-words.tsx), which the frame's phone rules read by its classes
  // (components.css): a bare plus said nothing of what it makes (Ruben, 8 October 2026).
  const part = (name) => find(act, (n) => n.props?.className === name);
  assert.ok(part("pg-act-fit"), "said through the kit's part, so a phone draws a capsule and not the bare circle");
  assert.equal(textOf(part("pg-act-keep")), "New", "the first word is kept with the mark: + New");
  assert.ok(
    find(part("pg-act-keep"), (n) => n.props?.name === "plus"),
    "the mark stands inside what is kept, so the capsule is never words alone",
  );
  assert.equal(textOf(part("pg-act-rest")), " conversation", "the rest follows, heard by a screen reader on a phone");
});

test("a press asks for the sheet, on the pick; a pointer warms it; a role that may not write is told why and opens nothing", () => {
  closeNewConversation();
  delete globalThis.window.gate;
  let warmed = 0;
  const forget = onWarmAsked(() => (warmed += 1));
  const act = actSaid();
  act.props.onPointerEnter();
  act.props.onFocus();
  assert.equal(warmed, 2, "the sheet is loaded as a pointer or focus reaches the act");
  forget();
  act.props.onPointerEnter();
  assert.equal(warmed, 2, "and by nobody once the host has gone");
  press(act);
  assert.deepEqual(
    { open: newConversationAsked().open, personId: newConversationAsked().personId },
    { open: true, personId: null },
  );
  closeNewConversation();
  // The shell's role gate, as data-bits answers a role that may not: spread after the handlers, it takes the press.
  let asked = null;
  globalThis.window.gate = (perm, doing) => {
    asked = [perm, doing];
    return { "aria-disabled": true, title: `Your role can't ${doing}.`, onClick: () => undefined };
  };
  const gated = actSaid();
  assert.deepEqual(asked, ["approve", NEW_CONVERSATION_WORDS.gate]);
  assert.match(gated.props.title, /start a conversation/);
  press(gated);
  assert.equal(newConversationAsked().open, false, "nothing opens for a role that may not write");
  delete globalThis.window.gate;
});

test("the frame's host answers N on the Inbox's tabs, and leaves it alone elsewhere, in a field, with a chord, in a dialog, or for a viewer", () => {
  closeNewConversation();
  fresh();
  globalThis.window.canDo = () => true;
  at("inbox");
  again(() => h(NewConversationHost));
  const send = (over) => {
    const e = key(over);
    globalThis.window.dispatchEvent(e);
    return e;
  };
  for (const [why, over] of [
    ["typed in a field", { target: { tagName: "TEXTAREA" } }],
    ["a chord", { metaKey: true }],
    ["with Shift", { shiftKey: true }],
    ["held down", { repeat: true }],
    ["another listener took it", { defaultPrevented: true }],
    ["inside a dialog over the page", { target: { tagName: "BUTTON", closest: () => ({}) } }],
    ["another key", { key: "m" }],
  ]) {
    send(over);
    assert.equal(newConversationAsked().open, false, why);
  }
  for (const elsewhere of ["clients", "clients/k1", "today", "inboxes", ""]) {
    at(elsewhere);
    send();
    assert.equal(newConversationAsked().open, false, `on ${elsewhere || "no page"} N is not the page's key`);
  }
  at("inbox");
  globalThis.window.canDo = () => false;
  send();
  assert.equal(newConversationAsked().open, false, "a role that may not write");
  globalThis.window.canDo = () => true;
  // Pressed on a row of the list, N is still the page's: the row is an option in a listbox at rest, which stands over
  // nothing. The target answers `closest` as a row would: yes to its own listbox, no to anything over the page.
  closeNewConversation();
  send({
    target: {
      tagName: "DIV",
      closest: (sel) => (sel.split(",").some((s) => s.trim() === '[role="listbox"]') ? {} : null),
    },
  });
  assert.equal(newConversationAsked().open, true, "REGRESSION: N pressed on a row of the list opens the sheet");
  for (const tab of ["inbox", "inbox/th-1", "conversations", "conversations/chats:c1", "live"]) {
    closeNewConversation();
    at(tab);
    const taken = send();
    assert.equal(newConversationAsked().open, true, tab);
    assert.equal(taken.defaultPrevented, true, "the key is the page's: nothing else types it");
  }
  // Open on someone, the key does not put it back on the pick.
  openNewConversation("k1");
  send({ key: "N" });
  assert.equal(newConversationAsked().personId, "k1");
  closeNewConversation();
});

test("each opening is a sheet of its own, and closing keeps what it held while it leaves", () => {
  closeNewConversation();
  const before = newConversationAsked().session;
  openNewConversation("k1");
  assert.deepEqual(
    [newConversationAsked().open, newConversationAsked().personId, newConversationAsked().session],
    [true, "k1", before + 1],
  );
  closeNewConversation();
  assert.deepEqual(
    [newConversationAsked().open, newConversationAsked().personId, newConversationAsked().session],
    [false, "k1", before + 1],
    "closed, and still the sheet that was open: the kit's sheet plays its way out with what it held",
  );
  openNewConversation();
  assert.deepEqual([newConversationAsked().personId, newConversationAsked().session], [null, before + 2]);
  closeNewConversation();
});

test("an address names the sheet, and is never a thread's", () => {
  assert.deepEqual(newConversationOf("new"), { personId: null });
  assert.deepEqual(newConversationOf("new:k1"), { personId: "k1" });
  assert.deepEqual(newConversationOf("new:"), { personId: null });
  for (const thread of ["th-1", "newer", null, undefined, ""]) assert.equal(newConversationOf(thread), null);
});
