/**
 * Ask's addresses (wiring/records-not-pages, task 1.6; findings A2e and A2f).
 *
 * A2e: a page citation was kept when it began with one of fourteen page words, whatever followed, so `admin/opening`,
 * `calendar/next-week`, `reports/foo`, `messages/x` and `today/x` came back as a door written exactly so, and landed on
 * "Settings - Not in this release", the Calendar's usual week or "No surface at reports". A page is now one of the listed pages
 * or one of the shapes its own page parses (the Calendar's day and visit, Reports' lens and days, People's Leads views and
 * built-in lists, the Sent room's Get their yes); anything else is dropped, as a row not read is.
 *
 * A2f: the readers spell a campaign `outbound/<id>` and the act tools, the page's context and the proposal cards
 * `campaigns/moment:<id>`, which the app resolves to one place (retiredRouteOf), but "one door per place" kept a set of the
 * strings, so an answer that cited a campaign and carried its card drew two doors to it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cardOpenRoute,
  emptyReadSet,
  groundCitations,
  normalizeAnswer,
  oneDoor,
  visitRoute,
} from "@chanlytics/contracts";

const ID = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";
const ID2 = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";

const pages = (ids) =>
  groundCitations(
    ids.map((id) => ({ kind: "page", id, label: id })),
    emptyReadSet(),
  );
const kept = (ids) => pages(ids).kept.map((c) => c.id);

test("a page citation is a listed page, or a shape its page parses", () => {
  const real = [
    "today",
    "inbox",
    "calendar",
    "campaigns/sequences",
    "campaigns/messages",
    "segments",
    "start",
    "admin/team",
    "admin/integrations",
    "reports",
    "reports/reviews",
    "reports/receptionist",
    "reports/receptionist:2026-09-01~2026-09-20",
    "reports/2026-09-01~2026-09-20",
    "clients",
    "clients/leads",
    "clients/leads:l-ready",
    "clients/seg:new_week",
    "calendar/2026-10-11",
    "calendar/month",
    "calendar/week:2026-10-11",
    // Get their yes over People's list, and To send in the Inbox's Needs you (the Campaigns wiring review's lanes 7 and 4).
    "clients/get-yes",
    "inbox/to-send",
    "conversations/phone",
  ];
  assert.deepEqual(kept(real), real, "every one of them is a page a person lands on");
  // The pages that moved (decision 0060: Campaigns' home and its ledger's groups, the old Playbooks list, Sent's list) are
  // kept as the page that replaced them, once: Sequences, which a person lands on.
  const moved = [
    "campaigns",
    "broadcasts",
    "outbound",
    "campaigns/in:before",
    "campaigns/in:reach_out",
    "campaigns/in:sent_once",
  ];
  assert.deepEqual(kept(moved), ["campaigns/sequences"]);
  assert.deepEqual(kept(["campaigns/sequences", ...moved]), ["campaigns/sequences"], "one place, one citation");
  // The Library's old route is Messages, Campaigns' other view (19 Oct 2026).
  assert.deepEqual(kept(["messages"]), ["campaigns/messages"]);
  // Sent's views, in an older card, are where they went: To send the Inbox's, Get their yes People's.
  assert.deepEqual(kept(["broadcasts/to-send", "broadcasts/get-yes"]), ["inbox/to-send", "clients/get-yes"]);
});

test("an address that begins with a page word and is not one of its shapes is dropped (REGRESSION: all came back as a door)", () => {
  const made_up = [
    "admin/opening",
    "admin",
    "admin/setup",
    "calendar/next-week",
    "calendar/2026-13-45",
    "calendar/2026-10-11:a-",
    "calendar/year",
    "reports/foo",
    "reports/reviews:soon",
    "messages/x",
    "today/x",
    "inbox/anything",
    "clients/seg:not_a_list",
    "clients/list:3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c",
    "clients/leads:s-3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c",
    "broadcasts/anyone",
    "campaigns/moment:x1",
    "campaigns/in:nobody",
    "campaigns/in:",
    "conversations/telepathy",
    // A visit is a row, and Ask has no kind to cite one by: whatever id a model writes there is no page it read.
    visitRoute(ID, "2026-10-11"),
    visitRoute(ID),
    // So is a review (`reports/reviews:<id>`): a lens is a page, and one review in it is a row Ask has no kind to cite.
    `reports/reviews:${ID}`,
    "https://evil.example",
    "#/calendar",
    "people",
  ];
  const { kept: k, dropped } = pages(made_up);
  assert.deepEqual(k, [], `kept: ${k.map((c) => c.id).join(", ")}`);
  assert.equal(dropped, made_up.length);
});

test("a source the model writes as an invented page is dropped, and counted", () => {
  const read = emptyReadSet();
  const answer = (id) => ({
    say: { headline: "Your hours are set.", detail: "" },
    show: { items: [{ title: "Hours", source: { kind: "page", id, label: "Hours" } }] },
    do: { open: { source: { kind: "page", id, label: "Hours" }, label: "Open hours" }, next: [] },
  });
  const wrong = normalizeAnswer(answer("admin/opening"), read, "en");
  assert.ok(wrong.ok);
  assert.deepEqual(wrong.answer.show.items, [], "an item is its row: a page that is not one has none");
  assert.equal(wrong.answer.do.open, null, "and no Open to nowhere");
  assert.equal(wrong.dropped, 2);
  const right = normalizeAnswer(answer("admin/team"), read, "en");
  assert.ok(right.ok);
  assert.equal(right.answer.show.items[0].source.to, "admin/team");
  assert.equal(right.answer.do.open.to, "admin/team");
  assert.equal(right.dropped, 0);
});

/* ------------------------------------------------------- one door per place */

const src = (kind, id, to) => ({ kind, id, label: id, to, door: true });
const answerOf = (items, open = null, next = []) => ({
  v: 2,
  form: "structured",
  say: { headline: "A campaign.", detail: "" },
  show: {
    figures: [],
    items: items.map((source) => ({ title: source.id, meta: "", line: "", source })),
    breakdown: null,
  },
  do: { open, next },
  language: "en",
});

test("a campaign the readers spell outbound/<id> and the cards spell campaigns/moment:<id> is one place, and one door", () => {
  const { answer } = oneDoor(
    answerOf([
      src("playbook", ID, `outbound/${ID}`),
      src("playbook", ID2, `campaigns/moment:${ID}`),
      src("playbook", "third", `outbound/${ID2}`),
    ]),
  );
  assert.deepEqual(
    answer.show.items.map((i) => i.source.door),
    [true, false, true],
    "the second item is the same campaign as the first, written the other way",
  );
});

test("Open goes when an item has the same place under the other spelling, and a card's Open hides behind it", () => {
  const { answer, cardOpen } = oneDoor(
    answerOf([src("playbook", ID, `outbound/${ID}`)], { to: `campaigns/moment:${ID}`, label: "Open it", now: false }),
    // The turn's card, with where its Open goes (the proposals' own rule, asserted below), as the page hands it in.
    [{ id: "c1", open: `campaigns/moment:${ID}` }],
  );
  assert.equal(answer.do.open, null, "the item is already the door to that campaign");
  assert.equal(
    cardOpenRoute({
      kind: "playbook",
      payload: {},
      outcome: { state: "done", receipt: "Made.", atMs: 1, undo: { playbook_id: ID } },
    }),
    `campaigns/sequences/${ID}`,
  );
  assert.deepEqual(cardOpen, { c1: false }, "and so is the card's: one door to the place");
});

test("a person is one place whether the route says clients or people, and a reach-out's chain is a moment too", () => {
  const { answer } = oneDoor(answerOf([src("person", ID, `clients/${ID}`), src("person", ID2, `people/${ID}`)]));
  assert.deepEqual(
    answer.show.items.map((i) => i.source.door),
    [true, false],
  );
  const chain = oneDoor(answerOf([src("playbook", ID, `outbound/${ID}`), src("playbook", ID2, `outbound/${ID2}`)]));
  assert.deepEqual(
    chain.answer.show.items.map((i) => i.source.door),
    [true, true],
    "two chains are two places",
  );
});

test("the routes an answer carries are left as written: only the comparison is canonical", () => {
  const { answer } = oneDoor(
    answerOf([src("playbook", ID, `outbound/${ID}`)], { to: "calendar", label: "Open", now: false }),
  );
  assert.equal(answer.show.items[0].source.to, `outbound/${ID}`);
  assert.equal(answer.do.open?.to, "calendar");
});
