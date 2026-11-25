/**
 * A run by every channel (One message, every channel, step 3), a run's verbs at its head, and Send it again for a
 * message with no WhatsApp row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { byTestId, textOf, press, settle } from "../../_stub-react.mjs";
import {
  BcRunVerbs,
  H,
  NOW,
  ZONE,
  again,
  answers,
  bcOpensOnItsSheet,
  bcPersonRow,
  broadcasts,
  broadcastsSurface,
  detailOf,
  dto,
  iso,
  keptSendOf,
  noteRow,
  offeredOf,
  openedAgain,
  page,
  person,
  playbook,
  playbooksSurface,
  quiet,
  setSurfaceValue,
  toBroadcastVM,
  versionRow,
} from "./_page.mjs";

test("a person's line on a run says the channel it went by where the run went by more than WhatsApp: by email, by text, on WhatsApp -- and says nothing of it for a run that went by WhatsApp alone", () => {
  const run = (recipients, over = {}) =>
    contracts.toRunReportVM(
      { broadcast: dto({ params: [{ kind: "first_name" }], ...over }), recipients },
      { windowMs: contracts.REPLY_WINDOW_MS, nowMs: NOW, clock: (t) => (t ? "10:31" : null) },
    );
  const mixed = run([
    person({ contact_id: "k-wa", name: "Ana Wa", channel: "whatsapp", message_status: "delivered" }),
    person({ contact_id: "k-mail", name: "Mia Mail", channel: "email", message_status: "sent", delivered_at: null }),
    person({ contact_id: "k-text", name: "Tex Text", channel: "sms", message_status: "failed" }),
    person({
      contact_id: "k-held",
      name: "Hal Held",
      channel: "email",
      state: "skipped",
      reason: "no_address",
      sent_at: null,
      message_status: null,
    }),
  ]);
  assert.deepEqual(
    mixed.people.map((p) => p.channel),
    ["on WhatsApp", "by email", "by text", "by email"],
  );
  const lines = Object.fromEntries(
    mixed.people.map((p) => [
      p.name,
      textOf(bcPersonRow(p).props.children.find((c) => c?.props?.className === "bc-person-words")),
    ]),
  );
  assert.ok(lines["Mia Mail"].startsWith("by email · sent"), lines["Mia Mail"]);
  assert.equal(lines["Tex Text"], "by text · the text was not delivered", "not a WhatsApp refusal for a text");
  assert.equal(lines["Hal Held"], "no email address", "a person it never went to has the reason: that is the news");
  // A run of WhatsApp alone reads as it always did.
  const quietRun = run([person({ channel: "whatsapp" }), person({ contact_id: "k2", name: "Bea", channel: null })]);
  assert.deepEqual(
    quietRun.people.map((p) => p.channel),
    [null, null],
  );
  assert.ok(!textOf(bcPersonRow(quietRun.people[0])).includes("on WhatsApp"));
});

test("a run waiting on you says who it reaches on which channel, as the run counted them when it was drawn", async () => {
  const today = globalThis.window.__clock.dayKey(Date.now());
  const offerless = { ...noteRow(), id: "tpl-note", variables: [] };
  const reach = {
    pool: 20,
    will: 14,
    noNumber: 0,
    stopped: 0,
    noYes: 0,
    heardThis: 0,
    heardAny: 0,
    overCap: 0,
    overLimit: 0,
    no_address: 6,
    no_channel: 0,
    by_channel: { whatsapp: 10, sms: 0, email: 4 },
  };
  const waiting = dto({
    id: "b-by",
    name: "Visit reminders",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    counts: quiet,
    recipient_count: 14,
    playbook_id: "pb-visit",
    run_for: today,
    template_id: "tpl-note",
    template_name: "hours_note",
    params: [],
    audience: { kind: "playbook", id: "pb-visit", label: "Visit reminders", reach },
  });
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [offerless], rows: [toBroadcastVM(waiting, ZONE)] }));
  setSurfaceValue(
    "playbooks",
    playbooksSurface({
      rows: [playbook({ id: "pb-visit", name: "Visit reminders", trigger: "visit_tomorrow", policy_class: "booking" })],
    }),
  );
  answers.set("b-by", [
    {
      ok: true,
      data: detailOf(waiting, [
        person({ state: "queued", sent_at: null, message_status: null, delivered_at: null, channel: "email" }),
      ]),
    },
  ]);
  const props = { initialRun: "b-by" };
  page(props);
  await settle();
  const tree = again(props);
  assert.equal(textOf(byTestId(tree, "bc-sheet-by")), "Reaches 14: 10 on WhatsApp, 4 by email");
  // A run counted before channels, or by WhatsApp alone, says nothing new.
  const old = {
    ...waiting,
    audience: { ...waiting.audience, reach: { ...reach, by_channel: { whatsapp: 14, sms: 0, email: 0 } } },
  };
  answers.set("b-by", [
    {
      ok: true,
      data: detailOf(old, [person({ state: "queued", sent_at: null, message_status: null, delivered_at: null })]),
    },
  ]);
  page(props);
  await settle();
  assert.equal(byTestId(again(props), "bc-sheet-by"), null);
});

/* ------------------------- A run's verbs at its head ------------------------- */

test("a waiting run whose day has passed is not offered an Approve the route refuses: the button says why, and approves nothing", async () => {
  // approveRun refuses a playbook's run on a later day than the one it was made for (contracts runApprovalRefusal). The
  // run's sheet said so; the run's card offered Approve all the same, and the route answered 409.
  const stale = dto({
    id: "b-stale",
    name: "Win-back · 2026-09-10",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    counts: quiet,
  });
  assert.equal(stale.run_for, "2026-09-10", "the fixture's day is long gone");
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [stale].map((b) => toBroadcastVM(b, ZONE)) }));
  const keep = broadcasts.approve;
  const approvals = [];
  broadcasts.approve = async (id) => {
    approvals.push(id);
    return { ok: true, data: {} };
  };
  const acts = { canSend: true, armed: false, onArm() {}, stopping: false, cancel() {} };
  const verbs = () =>
    BcRunVerbs({ row: toBroadcastVM(stale, ZONE), ...acts, approve: (row) => void broadcasts.approve(row.id) });
  try {
    // Where the shell gates a control (frame-globals gatedProps), the button carries the verb's own sentence.
    globalThis.window.gatedProps = (reason) => ({ "aria-disabled": true, "data-tip": reason, onClick() {} });
    let approve = byTestId(verbs(), "bc-approve");
    assert.equal(approve.props["aria-disabled"], true);
    assert.match(
      approve.props["data-tip"],
      /^This run was made for .+ and that day has passed: .+ Skip it · the next run reads the calendar again\.$/,
    );
    press(approve);
    await settle();
    assert.deepEqual(approvals, [], "REGRESSION: Approve on a run the verb refuses");
    // And where it does not (the standalone page), the press still approves nothing.
    delete globalThis.window.gatedProps;
    approve = byTestId(verbs(), "bc-approve");
    press(approve);
    await settle();
    assert.deepEqual(approvals, [], "no gate, and still no approve");

    // A reach-out's run has no day to pass: approveRun takes it to its own verb before it asks the day (decision D6), so
    // the predicate says nothing of it (runApprovalRefusal, exemption and all).
    const reach = dto({
      id: "b-reach",
      name: "Dentists · 2026-09-10",
      state: "pending_approval",
      started_at: null,
      finished_at: null,
      scheduled_for: iso(-H),
      audience: { kind: "reach_out", root_id: "pb-1", step_id: "pb-1", label: "Dentists" },
      counts: quiet,
    });
    const { runApprovalRefusal } = await import("@chanlytics/contracts");
    const days = { today: "2026-10-05", sendsOn: "2026-10-05" };
    assert.equal(runApprovalRefusal(reach, days), null, "the predicate itself");
    assert.match(runApprovalRefusal(stale, days), /that day has passed/);
  } finally {
    delete globalThis.window.gatedProps;
    broadcasts.approve = keep;
  }
});

test("a run decided on its sheet alone is never approved or skipped from its pane's head: the pane that is its sheet draws none of it (D1-run-reachout-approve)", () => {
  // The rule is the run's offer (contracts waitingRunOffer), asked once: a reach-out's run is `open`; a playbook's own is
  // approved in place, and one whose day has passed is `skip`, which a row still draws (its Approve says why it cannot).
  const waiting = {
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    counts: quiet,
  };
  const reach = toBroadcastVM(
    dto({
      ...waiting,
      id: "b-reach",
      audience: { kind: "reach_out", root_id: "pb-1", step_id: "pb-1", label: "Dentists" },
    }),
    ZONE,
  );
  const own = toBroadcastVM(
    dto({ ...waiting, id: "b-own", run_for: globalThis.window.__clock.dayKey(Date.now()) }),
    ZONE,
  );
  const stale = toBroadcastVM(dto({ ...waiting, id: "b-stale" }), ZONE);
  assert.equal(bcOpensOnItsSheet(reach), true);
  assert.equal(bcOpensOnItsSheet(own), false);
  assert.equal(
    bcOpensOnItsSheet(stale),
    false,
    "a run whose day has passed is skipped from its row: its offer is skip",
  );
  const acts = { canSend: true, armed: false, onArm() {}, stopping: false, approve() {}, cancel() {} };
  // Its pane is the sheet: Approve and Skip are the sheet's own, so the head's verbs draw nothing for it, asked or not.
  assert.equal(BcRunVerbs({ row: reach, ...acts }), null);
  assert.equal(BcRunVerbs({ row: reach, ...acts, armed: true }), null);
  // A playbook's own run keeps both, and a run that is not waiting keeps its stop.
  const mine = BcRunVerbs({ row: own, ...acts });
  assert.ok(byTestId(mine, "bc-approve"));
  assert.ok(byTestId(mine, "bc-stop"));
  const going = toBroadcastVM(
    dto({ id: "b-going", state: "scheduled", audience: reach.audience, counts: quiet }),
    ZONE,
  );
  assert.ok(byTestId(BcRunVerbs({ row: going, ...acts }), "bc-stop"), "a reach-out's run to come is stopped as before");
});

test("Send it again finds the message a run sent by its name and language: a WhatsApp version added since moved the id the picker lists it by", () => {
  // The run went out when the message had an email version alone, so its template_id is that row's. A WhatsApp version added
  // since is the message's anchor: the surface offers the message by that row's id.
  const rows = [
    versionRow("whatsapp", {
      id: "tpl-offer-whatsapp",
      name: "autumn_offer",
      category: "marketing",
      body_preview: "Hi {{1}}, {{2}}",
      variables: [
        { position: 1, label: "First name", example: "Dani" },
        { position: 2, label: "The offer", example: "20% off" },
      ],
    }),
    versionRow("email", {
      id: "tpl-offer-email",
      name: "autumn_offer",
      category: "marketing",
      header: "Autumn",
      body_preview: "Hi {{1}}, {{2}}",
      variables: [
        { position: 1, label: "First name", example: "Dani" },
        { position: 2, label: "The offer", example: "20% off" },
      ],
    }),
  ];
  const offered = offeredOf(...rows);
  assert.equal(offered[0].id, "tpl-offer-whatsapp", "the picker's id is the WhatsApp version's");
  const byHand = dto({
    id: "b-hand",
    name: "Autumn colour",
    playbook_id: null,
    run_for: null,
    template_id: "tpl-offer-email",
    template_name: "autumn_offer",
    audience: { kind: "saved", id: "s1", label: "Regulars" },
    params: [{ kind: "first_name" }, { kind: "text", value: "20% off colour" }],
  });
  // The send its record keeps names the message by the id the run went out on; New finds the message by any of its
  // versions, and opens on it with the words it said.
  const kept = keptSendOf(byHand);
  assert.equal(kept.tplId, "tpl-offer-email", "the id the run went out on");
  const { message } = openedAgain(kept, rows).steps[0];
  assert.equal(message.template_id, "tpl-offer-whatsapp", "on its message, by the id it is offered by now");
  assert.deepEqual(message.params[1], { kind: "text", value: "20% off colour" }, "and the words it said");
  // The message gone from the Library: New opens on its line, never a Send once quietly filled with something else.
  assert.equal(openedAgain(kept, []), null);
});
