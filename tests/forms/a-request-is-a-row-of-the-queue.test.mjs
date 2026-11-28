/**
 * A request sent through one of the business's forms that nobody has answered is a row of Today's queue (00680; the
 * Forms plan, 3.5).
 *
 * A request was a line in a list of its own before it was anybody's to answer, and a second list is a second place to
 * forget. So it is a row of Need you, a person waiting on a reply: who asked, in their own words, how long ago and
 * through which form, with one door, the request where it is answered. It stands with the people waiting, in Need you's
 * one count, worth what a reply from someone new is worth; a reply that left and never reached them says so, in the
 * row's warning; a number alone says nothing can be sent first; and a day that never read the requests draws none.
 *
 * A form's entries held for a look are nobody's to answer yet: they wait in their form's held pile, and go by
 * themselves at thirty days. A pile nobody has looked at in three days is one quiet row a form, with what was found,
 * after everyone waiting and in no count, whose one door is that pile.
 *
 * Run on the day's own view model, over the facts a read of Today hands it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toTodayVM,
  needYouGroupsOf,
  needYouCountOf,
  needYouVerbOf,
  isPersonRow,
  requestAddress,
  requestIdOf,
  namesAPerson,
  formsRouteOf,
  formRequestRowOf,
  NEED_YOU_WORDS,
} from "@chanlytics/contracts";
import { NOW, metrics, waiting, escalation } from "../today/record/_world.mjs";

const HOUR_MS = 3_600_000;
/** A request of the form "Ask for a colour", sent `hours` before now. */
const request = (id, hours, over = {}) => ({
  id,
  form_id: "form-1",
  heading: "Ask for a colour",
  created_at: new Date(NOW.getTime() - hours * HOUR_MS).toISOString(),
  person_id: `person-${id}`,
  name: "Bea Soto",
  words: "Do you have Saturday morning free for a full colour?",
  place: "Instagram",
  phone_only: false,
  unreached: false,
  ...over,
});
/** Today with nobody waiting but those who asked through a form. */
const day = (formRequests, conversations = [], escalations = [], formHeld = []) =>
  toTodayVM(metrics(), conversations, escalations, [], NOW, null, { formRequests, formHeld });
/** A form's pile of `held` entries, the oldest `days` old. */
const pile = (formId, held, days, heading = "Ask for a colour") => ({
  form_id: formId,
  heading,
  held,
  oldest_at: new Date(NOW.getTime() - days * 24 * HOUR_MS).toISOString(),
});
const rowOf = (vm, id) => vm.queue.rows.find((r) => r.id === `q-f-${id}`);

test("a request is one row: who asked, their own words, the wait, its form, and the request as its door", () => {
  const vm = day([request("r1", 3)]);
  const row = rowOf(vm, "r1");
  assert.ok(row, "the request is in the queue");
  assert.deepEqual(
    [row.kind, row.who, row.initials, row.channel, row.via, row.person_id, row.conversationId, row.callId],
    ["form", "Bea Soto", "BS", "Form", "Ask for a colour", "person-r1", null, null],
  );
  assert.equal(row.sentence, "Do you have Saturday morning free for a full colour?");
  assert.equal(row.quoted, true, "their words are quoted");
  assert.match(row.when, /^waited 3/);
  assert.deepEqual(row.status, [NEED_YOU_WORDS.form.status]);
  assert.equal(row.warn, false);
  assert.deepEqual(row.cta, { label: NEED_YOU_WORDS.form.open, to: requestAddress("r1") });
  // The Inbox reads a request's id back from its address, and takes only an id's shape.
  const id = "0b8f6a52-5f0e-4c1d-9a37-2f6f4f1f7c10";
  const [, param] = rowOf(day([request(id, 1)]), id).cta.to.split("/");
  assert.deepEqual([requestIdOf(param), requestIdOf("rq-r1")], [id, null], "the Inbox opens that request");
});

test("it is a person waiting on a reply: in Need you's one count, with the people", () => {
  const vm = day([request("r1", 3), request("r2", 1, { name: "Cy Vale", person_id: "person-2" })]);
  const rows = vm.queue.rows.filter((r) => r.kind === "form");
  assert.equal(rows.length, 2);
  assert.ok(rows.every(isPersonRow), "a request names a person");
  assert.ok(
    rows.every((r) => needYouVerbOf(r) === "reply"),
    "and its verb is a reply",
  );
  const groups = needYouGroupsOf(vm.queue.rows);
  assert.deepEqual(
    [groups.next.length, groups.waiting.length, groups.ok.length, groups.old.length],
    [1, 1, 0, 0],
    "one is up next, the other waits",
  );
  assert.equal(needYouCountOf(groups, 0), 2, "both are counted");
  assert.equal(groups.next[0].id, "q-f-r1", "the longer wait first among equals");
});

test("a reply that never reached them says so, and a number alone says nothing can be sent first", () => {
  const vm = day([
    request("r1", 2, { unreached: true }),
    request("r2", 1, { phone_only: true, name: "+1 646 555 0123", words: "" }),
  ]);
  const failed = rowOf(vm, "r1");
  assert.deepEqual(
    [failed.sentence, failed.quoted, failed.warn, failed.status],
    [NEED_YOU_WORDS.failed.sentence, false, true, [NEED_YOU_WORDS.form.status]],
  );
  const phone = rowOf(vm, "r2");
  assert.deepEqual(phone.status, [NEED_YOU_WORDS.form.phoneOnly]);
  assert.equal(phone.sentence, "Ask for a colour", "with nothing written, the row says which form");
  assert.equal(phone.quoted, false);
});

test("someone who typed no name is still a row, and a request stands beside a person who asked for a person", () => {
  const vm = day([request("r1", 1, { name: null, person_id: null })], [waiting()], [escalation()]);
  const row = rowOf(vm, "r1");
  assert.equal(row.who, NEED_YOU_WORDS.form.someone);
  assert.equal(row.person_id, null);
  const groups = needYouGroupsOf(vm.queue.rows);
  assert.equal(needYouCountOf(groups, 0), 2, "the handoff and the request are two who need you");
});

test("a day that never read the requests draws none, and one a week old is Older, out of the count", () => {
  const unread = toTodayVM(metrics(), [], [], [], NOW);
  assert.equal(
    unread.queue.rows.some((r) => r.kind === "form"),
    false,
  );
  const old = day([request("r1", 8 * 24)]);
  const groups = needYouGroupsOf(old.queue.rows);
  assert.deepEqual([groups.old.map((r) => r.id), needYouCountOf(groups, 0)], [["q-f-r1"], 0]);
});

test("a form's held pile nobody has looked at in three days is one quiet row, in no count, opening that pile", () => {
  const vm = day([request("r1", 2)], [], [], [pile("form-1", 3, 4), pile("form-2", 1, 3, "")]);
  const rows = vm.queue.rows.filter((r) => r.kind === "form_held");
  const HELD = [NEED_YOU_WORDS.formHeld.status];
  assert.deepEqual(
    rows.map((r) => [r.id, r.who, r.sentence, r.status, r.channel, r.person_id]),
    [
      ["q-fh-form-1", "Ask for a colour", "3 held entries · nobody has looked in 4 days", HELD, "Form", null],
      ["q-fh-form-2", NEED_YOU_WORDS.formHeld.aForm, "1 held entry · nobody has looked in 3 days", HELD, "Form", null],
    ],
  );
  assert.deepEqual(rows[0].cta, {
    label: NEED_YOU_WORDS.formHeld.open,
    to: formsRouteOf({ form: "form-1", part: "share" }),
  });
  assert.equal(rows.some(namesAPerson), false, "a pile names a form, never a person");
  assert.equal(rows.some(isPersonRow), false);
  assert.equal(
    rows.every((r) => needYouVerbOf(r) === null),
    true,
    "nobody waits on it",
  );
  const groups = needYouGroupsOf(vm.queue.rows);
  assert.deepEqual(
    groups.found.map((r) => r.id),
    ["q-fh-form-1", "q-fh-form-2"],
    "it stands with what was found",
  );
  assert.equal(needYouCountOf(groups, 0), 1, "only the person who asked is counted");
  assert.equal(vm.queue.rows.at(-1).kind, "form_held", "after everyone waiting");
  assert.ok(vm.queue.parts.includes("4 form entries held for a look"), "and the queue's words say how many");
  assert.equal(
    day([request("r1", 2)]).queue.rows.some((r) => r.kind === "form_held"),
    false,
    "no pile, no row",
  );
});

test("the queue says what is beyond its list: how many, and the request to read on from (00726)", () => {
  const listed = [request("r1", 1), request("r2", 2), request("r3", 3)];
  const beyond = toTodayVM(metrics(), [], [], [], NOW, null, {
    formRequests: listed,
    formRequestsCount: 10,
    formHeld: [],
  });
  assert.deepEqual(
    beyond.queue.requests_beyond,
    { count: 7, after: "r3" },
    "REGRESSION: seven were counted and nothing said where to read on from",
  );
  assert.equal(beyond.queue.more_people >= 7, true, "they are in the count of people past the rows, as before");
  const whole = toTodayVM(metrics(), [], [], [], NOW, null, {
    formRequests: listed,
    formRequestsCount: 3,
    formHeld: [],
  });
  assert.equal(whole.queue.requests_beyond, null, "a list that holds them all says none is beyond");
  assert.equal(day([]).queue.requests_beyond, null, "and a day with none says none");
});

test("a request read on to is the row Needs you gives every request", () => {
  const one = request("r9", 5, { unreached: true });
  const vm = day([one]);
  assert.deepEqual(formRequestRowOf(one, NOW), rowOf(vm, "r9"), "the same words, the same door, the same warning");
});
