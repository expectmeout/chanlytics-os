/**
 * Today's 'Reply window closing' leaves out a person who asked to stop (consent.ts; D1-closing-window-stop of the wiring plan, task 1.3).
 *
 * A customer who texts STOP on WhatsApp raises one 'asked to stop' hold, and every message after it is held out without a hold
 * of its own (a customer who has stopped can still write). While that hold is open the thread stays out of the closing-window
 * row; once the owner has dealt with it, a later message from the same person brought a warm 'Reply window closing · they wrote
 * last' row for them, built from the WhatsApp window alone, opening a thread whose reply box says nothing may be sent. The row
 * asks the rule every send path asks (isOptedOut, the one predicate over consent and the do-not-contact list).
 *
 * Run on toTodayVM over threads whose window is closing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM } from "@chanlytics/contracts";
import { NOW, metrics, msg, thread } from "./_world.mjs";

/**
 * A thread whose person wrote last at 6 PM yesterday (the WhatsApp window closes at 6 PM today, two hours from NOW), with their
 * consent as `contact` lays it on the person.
 */
const closing = (id, name, contact = {}) =>
  thread(
    id,
    name,
    [msg(`${id}-m`, "Can I move my appointment?", "2026-09-17T22:00:00Z")],
    { last_wa_inbound_at: "2026-09-17T22:00:00Z" },
    contact,
  );
const day = (conversations) => toTodayVM(metrics(), conversations, [], [], NOW);
const windowRows = (vm) => vm.queue.rows.filter((r) => r.kind === "window");

test("control: a person who may be written to, closing, is a row of the queue, a line of the band and a count in the head", () => {
  const vm = day([closing("cv-ok", "Priya Nair", { consent: "opted_in" })]);
  assert.deepEqual(
    windowRows(vm).map((r) => r.who),
    ["Priya Nair"],
  );
  assert.deepEqual(
    vm.windowClosing.rows.map((r) => r.to),
    ["inbox/th-cv-ok"],
  );
  assert.ok(vm.queue.parts.some((p) => /reply window/.test(p)));
  // A payload read without consent fails open, as the predicate does: nobody is hidden for what the read left out.
  assert.equal(windowRows(day([closing("cv-bare", "Bea Lind")])).length, 1);
});

test("a person who asked to stop is not a closing window: not a row, not a line of the band, not a count", () => {
  for (const contact of [{ consent: "opted_out" }, { dnc: true }, { consent: "opted_in", dnc: true }]) {
    const vm = day([closing("cv-stop", "Dulce Amaro", contact)]);
    assert.deepEqual(windowRows(vm), [], JSON.stringify(contact));
    assert.equal(vm.windowClosing, null, "the band names nobody");
    assert.deepEqual(
      vm.queue.parts.filter((p) => /reply window/.test(p)),
      [],
      "and the head does not count them",
    );
    assert.equal(vm.queue.rows.length, 0);
  }
  // Beside one who may be written to, only the stopped one is left out.
  const both = day([
    closing("cv-stop", "Dulce Amaro", { consent: "opted_out" }),
    closing("cv-ok", "Priya Nair", { consent: "opted_in" }),
  ]);
  assert.deepEqual(
    windowRows(both).map((r) => r.who),
    ["Priya Nair"],
  );
  assert.deepEqual(
    both.windowClosing.rows.map((r) => r.to),
    ["inbox/th-cv-ok"],
  );
});

test("and the thread does not come back as 'waiting with nothing back': a reply the box refuses is not asked for there either", () => {
  // The closing-window row used to hold the thread out of that list; with the stopped person out of the row it must be out of the list for its own reason.
  const vm = day([closing("cv-stop", "Dulce Amaro", { consent: "opted_out" }), closing("cv-ok", "Priya Nair")]);
  assert.deepEqual(
    vm.noReply.map((w) => w.conversationId),
    [],
    "the stopped person is not waiting on a reply, and the one in the closing window is the queue's",
  );
  // A stopped person whose window is not closing is out of the list as well.
  const old = thread("cv-old", "Bea Lind", [msg("o1", "STOP", "2026-09-17T10:00:00Z")], {}, { consent: "opted_out" });
  assert.deepEqual(day([old]).noReply, []);
  // A person who may be written to, long since waiting, is still named.
  const ok = thread("cv-ok2", "Ana Reyes", [msg("o2", "Hello?", "2026-09-17T10:00:00Z")]);
  assert.deepEqual(
    day([ok]).noReply.map((w) => w.conversationId),
    ["cv-ok2"],
  );
});
