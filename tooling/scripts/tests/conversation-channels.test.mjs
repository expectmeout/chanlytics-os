/**
 * Conversations by wire: which tabs a workspace gets, and which rows each one
 * lists.
 *
 * THE DEFECT THIS EXISTS FOR. The strip was one tab labelled "WhatsApp" that
 * matched WhatsApp, SMS and Instagram alike — so a text already sat under a tab
 * naming the wrong app — and the Email tab filtered on `"mail"`, the mockup's
 * spelling, while the view model has said `"email"` since the row's channel was
 * derived at all. An email conversation therefore matched NO tab: not the
 * chats one, not the mail one. It was reachable only under All, and its count
 * was permanently zero.
 *
 * Two halves, proved apart: the strip a workspace is given (the bridge), and
 * whether a row belongs in a tab (the page's one rule, read by the filter and
 * by the counts so a tab cannot show a number it will not then list).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { conversationTabs } from "../../../apps/dashboard/src/legacy-bridge/surface-data.ts";

/* ------------------------------------------------------------- the strip */

const ids = (hasCalls, channels) => conversationTabs(hasCalls, channels).map((t) => t.id);

test("a tab per wire this workspace has threads on, and none for a wire it does not", () => {
  // What a workspace with a phone line and WhatsApp sees today: unchanged.
  assert.deepEqual(conversationTabs(true, ["whatsapp", "whatsapp"]), [
    { id: "all", label: "All" },
    { id: "phone", label: "Calls" },
    { id: "whatsapp", label: "WhatsApp" },
  ]);
  // The day texting is switched on, and the day email is.
  assert.deepEqual(ids(true, ["whatsapp", "sms"]), ["all", "phone", "whatsapp", "sms"]);
  assert.deepEqual(ids(true, ["whatsapp", "sms", "email"]), ["all", "phone", "whatsapp", "sms", "email"]);
  assert.deepEqual(
    conversationTabs(false, ["email"]),
    [
      { id: "all", label: "All" },
      { id: "email", label: "Email" },
    ],
    "a workspace reached only by email gets the Email tab and no Calls tab",
  );
  // Nothing at all is still a strip: All, and whatever calls there are.
  assert.deepEqual(ids(false, []), ["all"]);
  assert.deepEqual(ids(true, []), ["all", "phone"]);
});

test("the order is the wires' own, not the order the threads happened to arrive in", () => {
  // Otherwise the strip rearranges itself between two reads of one workspace.
  assert.deepEqual(ids(false, ["email", "sms", "whatsapp"]), ["all", "whatsapp", "sms", "email"]);
  assert.deepEqual(ids(false, ["sms", "email"]), ["all", "sms", "email"]);
  // A wire the page has no tab for does not invent one.
  assert.deepEqual(ids(false, ["instagram", "email"]), ["all", "email"]);
});

test("the words are the ones the rest of the product uses for those wires", () => {
  assert.deepEqual(
    conversationTabs(false, ["whatsapp", "sms", "email"]).map((t) => t.label),
    ["All", "WhatsApp", "Text", "Email"],
    "contracts calls sms 'Text'; a tab that called it something else would be the fifth name for one wire",
  );
});

/* -------------------------------------------------------------- the rows */

globalThis.window ??= {};
globalThis.React = {
  useState: () => [null, () => {}],
  useMemo: (f) => f(),
  useEffect: () => {},
  createElement: () => null,
  Fragment: "Fragment",
};
globalThis.Icon = () => null;
globalThis.StatStrip = () => null;
globalThis.StatCell = () => null;
globalThis.TlMedia = () => null;
globalThis.EmptyState = () => null;
globalThis.FailedRead = () => null;
globalThis.CONVERSATIONS_DATA = { CONVERSATIONS: [], CV_CHANNELS: [] };
await import("../../../apps/dashboard/src/legacy/pages/conversations.jsx");
const inChannel = globalThis.window.CV_IN_CHANNEL;

const row = (channel) => ({ channel });

test("REGRESSION: an email row is in the Email tab, whichever spelling the row carries", () => {
  assert.ok(inChannel, "the page publishes its one membership rule");
  // The view model's spelling, which matched nothing before.
  assert.equal(inChannel(row("email"), "email"), true);
  // The mockup's, so the seeded build's own Email tab keeps working.
  assert.equal(inChannel(row("mail"), "email"), true);
  assert.equal(inChannel(row("mail"), "mail"), true);
  assert.equal(inChannel(row("email"), "mail"), true);
});

test("a row belongs to its own wire and to All, and to nothing else", () => {
  for (const c of ["whatsapp", "sms", "email", "phone", "instagram"]) {
    assert.equal(inChannel(row(c), "all"), true, `${c} is in All`);
  }
  assert.equal(inChannel(row("sms"), "sms"), true);
  assert.equal(inChannel(row("sms"), "whatsapp"), false, "REGRESSION: a text under a tab named WhatsApp");
  assert.equal(inChannel(row("email"), "whatsapp"), false);
  assert.equal(inChannel(row("whatsapp"), "email"), false);
  assert.equal(inChannel(row("phone"), "phone"), true);
  assert.equal(inChannel(row("email"), "phone"), false);
});

test("the mockup's grouped tab still groups, because the mockup still uses it", () => {
  for (const c of ["instagram", "sms", "whatsapp"]) assert.equal(inChannel(row(c), "chats"), true, c);
  assert.equal(inChannel(row("email"), "chats"), false);
  assert.equal(inChannel(row("phone"), "chats"), false);
});

/* -------------------------------------------------------------- the route */

test("REGRESSION: every tab a workspace is given is a filter in the address, never a conversation's id", () => {
  const route = globalThis.window.CV_ROUTE;
  assert.ok(route, "the page publishes its one rule for the word after conversations/");
  // The strip the bridge draws for a workspace on every wire it has. The shell knew only the mockup's three tabs, so
  // WhatsApp and Email opened "whatsapp" and "email" as conversations nobody could find, and the list stayed on All.
  for (const { id } of conversationTabs(true, ["whatsapp", "sms", "email"])) {
    assert.deepEqual(route(id), { channel: id, id: null }, `"${id}" is a tab`);
  }
  for (const id of ["phone", "chats", "mail"])
    assert.deepEqual(route(id), { channel: id, id: null }, `the mockup's "${id}"`);
  assert.deepEqual(route(undefined), { channel: "all", id: null }, "the bare address is everything");
  // A row's id stays an id: a conversation's, a call's, and a word only an object inherits.
  assert.deepEqual(route("5b0c6a52-8f1e-4d7a-9c1b-2e7f3a9d4c10"), {
    channel: "all",
    id: "5b0c6a52-8f1e-4d7a-9c1b-2e7f3a9d4c10",
  });
  assert.deepEqual(route("cv-4"), { channel: "all", id: "cv-4" });
  assert.deepEqual(route("constructor"), { channel: "all", id: "constructor" });
});
