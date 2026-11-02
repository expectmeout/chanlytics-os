/**
 * Letting a row of Need you go from the row, under its Not now's times (2 Nov 2026: a row was let go only by Mark all
 * done, once a week old, and machine mail stood in it).
 *
 * - Mark done: a hold's row hands its thread back to the receptionist (the thread verb hand_back, as Mark all done does),
 *   says so in its place with Undo, and leaves Need you. A closing window and a reply counting down hold nothing to give.
 * - Not a person, where the owner meets a program's mail (decision 0080): an email's row opens the person's page with Not
 *   a person asked, the typed name and all (00483), as the thread's Actions do, and saying it teaches the sorting (their
 *   address, or their domain, is said to be automated, so their mail stays in the mailbox from now on). The owner's
 *   alone, and an email's alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAILBOX_SENDERS_WORDS, NEED_YOU_WORDS, addressOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, textOf } from "../_legacy-react.mjs";
import { until } from "../shared/_until.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: () => false });
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
/** What the row asked of the wire, by method and path; every ask answered as done. */
const asked = [];
globalThis.fetch = async (url, init = {}) => {
  asked.push(`${init.method ?? "GET"} ${new URL(String(url), "https://app.chanlytics.com").pathname}`);
  return new Response(JSON.stringify({ ok: true, data: { state: "open", decision_id: "d-1" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const { ReplyWork } = await import("../../../../apps/dashboard/src/surfaces/today/need-you/reply-work.tsx");
const { Menu } = await import("../../../../apps/dashboard/src/surfaces/kit/menu/menu.tsx");
const { takeCarriedNotAPerson } = await import("../../../../apps/dashboard/src/surfaces/inbox/carried-reply.ts");

/** A row a reply answers, with its words already written, so no draft is asked for. */
const rowOf = (wire, over = {}) => ({
  id: `q-${wire}`,
  kind: "handoff",
  conversationId: "cv-1",
  callId: null,
  person_id: "p-1",
  who: "Weekly Digest",
  initials: "WD",
  channel: wire,
  when: "waited 3h",
  sentence: "This week's offers",
  quoted: true,
  status: [],
  tone: "escalated",
  warn: false,
  cta: { label: "Open and reply", to: "inbox/th-cv-1" },
  also: null,
  writes: { for_message_id: "m-1", wire, window_open: null, window_closes: null },
  prepared: "Thanks for the note.",
  waitedMs: 3 * 3_600_000,
  ...over,
});

/** The row's work drawn for a member on `rung`: Not now's menu, and the item under its times, where there is one. */
function drawn(row, rung) {
  globalThis.mayAtLeast = (r) =>
    ["viewer", "operator", "owner"].indexOf(rung) >= ["viewer", "operator", "owner"].indexOf(r);
  fresh();
  const tree = again(() =>
    ReplyWork({ row, main: "primary", may: true, tz: "America/New_York", flash: () => {}, keep: () => {} }),
  );
  const menu = all(tree, (n) => n.type === Menu)[0];
  const items = menu?.props.groups.flatMap((g) => g.items ?? []) ?? [];
  const item = items.find((i) => i.label === MAILBOX_SENDERS_WORDS.act);
  const done = items.find((i) => i.label === NEED_YOU_WORDS.oldDone.yes);
  return { menu, item, done, tree };
}

test("an owner's email row says Not a person under Not now's times, and it opens their page with it asked", () => {
  const went = [];
  globalThis.appNavigate = (to) => went.push(to);
  const { menu, item } = drawn(rowOf("Email"), "owner");
  assert.equal(menu.props.label, NEED_YOU_WORDS.notNowFor("Weekly Digest"));
  assert.ok(item, "REGRESSION: a program's mail in Need you could be let go only from its thread, three presses away");
  assert.deepEqual(
    [item.tone, item.meta],
    ["danger", MAILBOX_SENDERS_WORDS.actHint],
    "it deletes, and says what it does",
  );
  const times = menu.props.groups[0].items.map((i) => i.label);
  assert.ok(!times.includes(MAILBOX_SENDERS_WORDS.act), "a group of its own, apart from the times");
  item.onSelect();
  assert.deepEqual(went, [addressOf({ kind: "person", id: "p-1" })], "their page, where Delete person is asked");
  assert.equal(takeCarriedNotAPerson("p-1"), true, "with Not a person asked as it opens, once");
  delete globalThis.appNavigate;
});

test("nobody else is offered it: an operator, another wire, or a row whose person is not known", () => {
  assert.equal(drawn(rowOf("Email"), "operator").item, undefined, "an owner's word, as the door's (00483)");
  assert.equal(drawn(rowOf("WhatsApp"), "owner").item, undefined, "a WhatsApp is a person's");
  assert.equal(drawn(rowOf("Email", { person_id: null }), "owner").item, undefined);
  const groups = drawn(rowOf("Text"), "owner").menu.props.groups;
  assert.deepEqual(
    groups.map((g) => g.items.length),
    [groups[0].items.length, 1],
    "a text's row: the times, then Mark done alone",
  );
});

test("Mark done gives a hold back to the receptionist from its row, says so in its place, and Undo takes it back", async () => {
  fresh();
  const row = rowOf("WhatsApp", { id: "q-done" });
  const { done } = drawn(row, "operator");
  assert.ok(done, "REGRESSION: a row left Need you only by Mark all done, once a week old");
  assert.equal(
    done.meta,
    NEED_YOU_WORDS.oldDone.detail,
    "what it does: they leave, and a new message brings them back",
  );
  asked.length = 0;
  done.onSelect();
  await until(() => asked.includes("POST /api/v1/conversations/cv-1/hand-back"), "the thread handed back");
  /** The row's work as it is drawn now, and what it says of itself where it says it is done. */
  const saidNow = () =>
    all(
      again(() =>
        ReplyWork({ row, main: "primary", may: true, tz: "America/New_York", flash: () => {}, keep: () => {} }),
      ),
      (n) => n.props?.className === "ny-done",
    )[0];
  await until(() => !!saidNow(), "the row saying what became of it");
  const said = saidNow();
  assert.ok(said, "the row says what became of it, in its place");
  assert.match(textOf(said), new RegExp(NEED_YOU_WORDS.oldDone.done(1)));
  const undo = all(said, (n) => n.props?.className === "ny-done-act")[0];
  assert.equal(textOf(undo).trim(), NEED_YOU_WORDS.undo);
});

test("Mark done is a hold's: a closing window and a reply counting down have nothing to give back, and a viewer presses nothing", () => {
  assert.equal(drawn(rowOf("WhatsApp", { id: "q-w", kind: "window" }), "owner").done, undefined, "a window");
  assert.equal(drawn(rowOf("WhatsApp", { id: "q-r", kind: "reply" }), "owner").done?.label, NEED_YOU_WORDS.oldDone.yes);
  globalThis.mayAtLeast = () => false;
  fresh();
  const viewer = again(() =>
    ReplyWork({
      row: rowOf("WhatsApp", { id: "q-v" }),
      main: "primary",
      may: false,
      tz: "America/New_York",
      flash() {},
      keep() {},
    }),
  );
  assert.equal(all(viewer, (n) => n.type === Menu).length, 0, "no Not now, so no Mark done");
});
