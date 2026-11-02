/**
 * Not a person, where the owner meets a program's mail (decision 0080; Ruben, 2 Nov 2026: machine mail in Need you). An
 * email's row in Need you says it under its Not now's times: it opens the person's page with Not a person asked, the typed
 * name and all (00483), as the thread's Actions do, and saying it teaches the sorting (their address, or their domain, is
 * said to be automated, so their mail stays in the mailbox from now on). The owner's alone, and an email's alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAILBOX_SENDERS_WORDS, NEED_YOU_WORDS, addressOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: () => false });
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
  const item = menu?.props.groups.flatMap((g) => g.items ?? []).find((i) => i.label === MAILBOX_SENDERS_WORDS.act);
  return { menu, item };
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
  const times = drawn(rowOf("Text"), "owner").menu.props.groups;
  assert.equal(times.length, 1, "Not now is its times alone");
});
