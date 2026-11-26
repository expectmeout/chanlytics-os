/**
 * A broadcast's page: a slot's words, and a broadcast's state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { again as drawAgain, all, find, byTestId, textOf, press, settle } from "../../_stub-react.mjs";
import {
  BroadcastDetail,
  D,
  Face,
  Field,
  H,
  REGULARS,
  SubTabs,
  TemplateComposer,
  ZONE,
  again,
  answers,
  bcWhenNote,
  bcWhenWords,
  broadcasts,
  broadcastsSurface,
  detailOf,
  dto,
  fresh,
  iso,
  keptSendOf,
  menuItem,
  messagesAgain,
  messagesOpen,
  openedAgain,
  optionsOf,
  page,
  paneOf,
  paneTitle,
  person,
  pickerOf,
  playbook,
  playbooksSurface,
  quiet,
  setSurfaceValue,
  settingsOf,
  starterTemplate,
  starters,
  templateRow,
  templates,
  toBroadcastVM,
  toasts,
  went,
  withMessage,
} from "./_page.mjs";
import { bridgeHolds, heldDoors, provided } from "../../shell/_bridge-holds.mjs";

/* ------------------------------ a slot's words ------------------------------ */

test("REGRESSION (C6): a run's values say what fills them -- the detail printed visit_when", async () => {
  answers.set("b-visit", [
    {
      ok: true,
      data: detailOf(
        dto({
          id: "b-visit",
          name: "Visit reminder · 2026-09-15",
          // Going out: a run that is done is read in Reports, and its report here is a run's that can still change.
          state: "sending",
          params: [{ kind: "visit_when" }, { kind: "first_name" }],
        }),
      ),
    },
  ]);
  const props = { initialRun: "b-visit" };
  page(props);
  await settle();
  const tree = again(props);
  const values = find(
    byTestId(tree, "bc-detail"),
    (n) => n.props?.className === "cl-prof-aut-hint" && textOf(n).startsWith("Values:"),
  );
  assert.equal(textOf(values), "Values: their booked time · their first name", "REGRESSION: visit_when");
});

test("REGRESSION: Send it again puts right a slot a run filled with what it cannot take -- the send it opened took a run's sources as they were", () => {
  // Sent by hand with the old free choice: the first name filled by the booking link, the business name typed, and a link the workspace has since removed.
  const wrong = dto({
    id: "b-wrong",
    name: "Win-back by hand",
    playbook_id: null,
    run_for: null,
    template_id: "tpl-winback_offer",
    template_name: "winback_offer",
    audience: { kind: "saved", id: "s1", label: "Regulars" },
    params: [{ kind: "booking_link" }, { kind: "text", value: "Northside" }, { kind: "booking_link" }],
  });
  // What the record keeps for New is what the run sent; New puts each value right as it opens, against what fills it now.
  const kept = keptSendOf(wrong);
  assert.deepEqual(kept.sources["tpl-winback_offer"], ["booking_link", "text", "booking_link"], "kept as it went");
  assert.deepEqual(
    openedAgain(kept, [starterTemplate("winback_offer")]).steps[0].message.params,
    [{ kind: "first_name" }, { kind: "text", value: "Northside" }, { kind: "text", value: "" }],
    "the booking link that filled the first name put back to each person's own, the words it typed kept, and a link with none on file can only be typed",
  );
  assert.deepEqual(
    openedAgain(kept, [starterTemplate("winback_offer")], REGULARS, { bookingLink: true, reviewLink: false }).steps[0]
      .message.params[2],
    { kind: "booking_link" },
    "with a booking link on file, its slot takes it again",
  );
});

/* ------------------------------ a broadcast's state ------------------------------ */

test("REGRESSION (C12): a failed run says why in the owner's words -- its day in History and its report in Reports, never '· failed' alone", async () => {
  const failed = dto({ id: "b-failed", name: "September offer", state: "failed", failure: "template_not_approved" });
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [toBroadcastVM(failed, ZONE)] }));
  answers.set("b-failed", [{ ok: true, data: detailOf(failed, []) }]);
  const calls = [];
  const keep = heldDoors();
  bridgeHolds({ doors: { navigate: (to, opts) => calls.push([to, opts && opts.replace ? "replace" : "push"]) } });
  try {
    const props = { initialRun: "b-failed" };
    page(props);
    await settle();
    again(props);
    await settle();
    // Done, it is read in Reports: its campaign, over the day it ran for, in the run's place (Back never lands on it again).
    assert.deepEqual(calls.at(-1), ["reports/campaigns:2026-09-10~2026-09-10:seq:pb-1", "replace"]);
  } finally {
    bridgeHolds({ doors: keep });
  }
  // Why, where its day is said: History's row, and Reports' Each send, which says History's words.
  const day = contracts.historyDayWords(
    {
      id: "b-failed",
      state: "failed",
      run_for: "2026-09-10",
      at: iso(-5 * D),
      scheduled_for: iso(-5 * D),
      finished_at: null,
      people: 3,
      failure: "template_not_approved",
      place: null,
      counts: { sent: 0, read: 0, replied: 0 },
    },
    null,
  );
  assert.equal(day.end, "Couldn't send");
  assert.match(day.said, /stopped: its WhatsApp version is no longer approved$/, day.said);
});

test("a one-off that went is sent again from its record: New's Send once, filled with its message, its list and its values -- and New opens on its line when one of them cannot go", () => {
  const note = {
    id: "tpl-note",
    channel: "whatsapp",
    name: "a_quick_note",
    language: "en_US",
    meta_status: "approved",
    category: "utility",
    purpose: "conversational",
    body_preview: "Hi {{1}}",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
  };
  const offer = {
    id: "tpl-offer",
    channel: "whatsapp",
    name: "autumn_offer",
    language: "en_US",
    meta_status: "approved",
    category: "marketing",
    purpose: "marketing",
    body_preview: "Hi {{1}}, {{2}}",
    variables: [
      { position: 1, label: "First name", example: "Dani" },
      { position: 2, label: "The offer", example: "20% off" },
    ],
  };
  const byHand = dto({
    id: "b-hand",
    name: "Autumn colour",
    playbook_id: null,
    run_for: null,
    template_id: "tpl-offer",
    template_name: "autumn_offer",
    audience: { kind: "saved", id: "s1", label: "Regulars" },
    params: [{ kind: "first_name" }, { kind: "text", value: "20% off colour" }],
  });
  // New opens on what its record kept (record-acts.tsx sendAgain): a one-off to people, named for its message, as a send by hand is.
  const draft = openedAgain(keptSendOf(byHand), [note, offer]);
  assert.deepEqual([draft.kind, draft.audience], ["once", "people"]);
  assert.equal(draft.name, contracts.templateTitle("autumn_offer", null));
  assert.deepEqual(draft.who, { kind: "list", token: "list:s1", label: "Regulars" }, "its list");
  assert.equal(draft.steps[0].message.template_id, "tpl-offer", "its message, not the one New would open on");
  assert.deepEqual(
    draft.steps[0].message.params,
    [{ kind: "first_name" }, { kind: "text", value: "20% off colour" }],
    "its values, by what fills them, and the words it said",
  );
  // Its message gone from the Library, or its list gone: nothing quietly filled with something else.
  assert.equal(
    openedAgain(keptSendOf(byHand), [note]),
    null,
    "REGRESSION-IN-WAITING: a Send once filled with another message",
  );
  assert.equal(openedAgain(keptSendOf(byHand), [note, offer], []), null, "a list since deleted");
});

test("a run waiting on you opens as the sheet the canvas draws -- where it sits in the queue, who it reaches by the rules that made it, the words, and Approve alone at the foot -- and approving opens the next one", async () => {
  const today = provided("clock").dayKey(Date.now());
  const offer = {
    id: "tpl-offer",
    channel: "whatsapp",
    name: "monthly_offer",
    language: "en_US",
    meta_status: "approved",
    category: "marketing",
    purpose: "marketing",
    body_preview: "Hi {{1}}, this month at {{2}}: a free gloss with any cut.",
    variables: [],
  };
  const waitingRun = (id, name, pb) =>
    dto({
      id,
      name,
      state: "pending_approval",
      started_at: null,
      finished_at: null,
      scheduled_for: iso(-H),
      counts: quiet,
      recipient_count: 2,
      playbook_id: pb,
      run_for: today,
      template_id: "tpl-offer",
      template_name: "monthly_offer",
      params: [{ kind: "first_name" }, { kind: "business_name" }],
      audience: { kind: "playbook", id: pb, label: name },
    });
  const first = waitingRun("b-wait", "The month's offer", "pb-offer");
  const second = waitingRun("b-wait-2", "Win-back", "pb-1");
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: [offer],
      rows: [first, second].map((b) => toBroadcastVM(b, ZONE)),
    }),
  );
  setSurfaceValue(
    "playbooks",
    playbooksSurface({
      rows: [
        playbook({
          id: "pb-offer",
          name: "The month's offer",
          trigger: "everyone_monthly",
          policy_class: "campaign",
          cap_per_run: 250,
          cadence_days: 30,
          triggerHint: "Everyone who said yes, on a cadence",
        }),
        playbook(),
      ],
    }),
  );
  const people = [
    person({
      contact_id: "k0",
      name: "+1 (917) 555-0142",
      first_name: null,
      state: "queued",
      sent_at: null,
      message_status: null,
      delivered_at: null,
    }),
    person({ state: "queued", sent_at: null, message_status: null, delivered_at: null }),
  ];
  answers.set("b-wait", [{ ok: true, data: detailOf(first, people) }]);
  const approved = [];
  const keep = { approve: broadcasts.approve, cancel: broadcasts.cancel };
  broadcasts.approve = async (id) => {
    approved.push(id);
    return { ok: true, data: { recipient_count: 2, scheduled_for: iso(0), moved_from: null } };
  };
  try {
    const props = { initialRun: "b-wait" };
    page(props);
    await settle();
    let tree = again(props);
    const sheet = byTestId(tree, "bc-sheet");
    assert.ok(sheet, "a run waiting on you is its sheet, not a report of nothing sent");
    assert.equal(byTestId(tree, "bc-figures"), null);
    // The sheet's own top (back, "Waiting for your approval", its place) and its title are the pane's head now (the layout is the
    // Inbox's list + pane, docs/2026-10-02-campaigns-on-the-kit.md §3.1), outside the sheet's body.
    assert.equal(
      textOf(byTestId(tree, "bc-sheet-pos")),
      "Waiting for your approval · 1 of 2",
      "where it sits among the runs waiting",
    );
    assert.equal(paneTitle(tree), "The month's offer");
    // What made the run, first on the sheet's line, in its own words: never a playbook to its reader (decision 19), and no
    // "Campaign ·" before it or when it goes after it, which wrapped onto a line of its own on a phone. When it goes is
    // said beside the Approve it speaks of, as a line of its own.
    const hint = textOf(byTestId(sheet, "bc-sheet-hint"));
    assert.equal(hint, "Everyone who said yes, on a cadence", "its campaign's own words for who it is for");
    assert.doesNotMatch(textOf(sheet), /Playbook · /);
    assert.match(
      textOf(byTestId(sheet, "bc-sheet-goes")),
      /^Goes (the moment you approve it|at .+ once you approve it)\. /,
    );
    const reach = textOf(byTestId(sheet, "bc-sheet-reach"));
    assert.ok(
      reach.includes("2will get it") &&
        reach.includes("each said yes to offers") &&
        reach.includes("none hears from you within a week of it"),
      reach,
    );
    assert.ok(!/ of \d/.test(reach), `REGRESSION-IN-WAITING: a pool the run never recorded -- ${reach}`);
    const words = textOf(byTestId(sheet, "bc-sheet-words"));
    assert.ok(
      words.includes("Hi Rosa, this month at Northside Studio") && words.includes("as Rosa Díaz reads it"),
      words,
    );
    assert.equal(
      textOf(byTestId(sheet, "bc-sheet-hi")),
      "1 gets \u201cHi there\u201d \u00b7 no name on file",
      "the case nobody is shown before a send, shown before this one",
    );
    assert.ok(
      textOf(byTestId(sheet, "bc-sheet-approve")).includes("Approve all 2"),
      textOf(byTestId(sheet, "bc-sheet-approve")),
    );
    // Who gets it, folded under its head, its press at the head's right (19 Oct 2026: it was a half of the foot beside
    // Approve): closed, the head alone; opened, its rows, brought into view as they open (on a phone they opened under
    // the message, off the screen).
    const fold = byTestId(sheet, "bc-sheet-people");
    const foldPress = byTestId(fold, "bc-sheet-people-press");
    assert.equal(textOf(fold).trim(), contracts.WHO_GETS_IT_WORDS.head, "closed, the head alone");
    assert.deepEqual(
      [foldPress.props["aria-label"], foldPress.props["aria-expanded"], fold.props["data-open"]],
      [contracts.WHO_GETS_IT_WORDS.show, false, "false"],
    );
    assert.equal(all(fold, (n) => n.props?.["data-testid"] === "bc-person").length, 0, "closed, no rows");
    assert.equal(byTestId(byTestId(sheet, "bc-sheet-acts"), "bc-sheet-see"), null, "no list press in the foot");
    press(foldPress);
    tree = again(props);
    const opened = byTestId(tree, "bc-sheet-people");
    assert.equal(all(opened, (n) => n.props?.["data-testid"] === "bc-person").length, 2);
    assert.deepEqual(
      [byTestId(opened, "bc-sheet-people-press").props["aria-label"], opened.props["data-open"]],
      [contracts.WHO_GETS_IT_WORDS.hide, "true"],
    );
    let brought = null;
    find(opened, (n) => typeof n.props?.ref === "function").props.ref({ scrollIntoView: (how) => (brought = how) });
    assert.deepEqual(brought, { block: "nearest" }, "the rows, as they mount, scrolled to where they are seen whole");
    // Approved, the next run waiting opens.
    await press(byTestId(tree, "bc-sheet-approve"));
    assert.deepEqual(approved, ["b-wait"]);
    assert.equal(went.at(-1), "campaigns/sequences/pb-1/runs/b-wait-2", "a queue of two is two presses, at its home");

    // Skip arms before it acts, as every stop on the page does (D13).
    const skipped = [];
    broadcasts.cancel = async (id) => {
      skipped.push(id);
      return { ok: true, data: { was: "pending_approval" } };
    };
    page(props);
    await settle();
    tree = again(props);
    // One word per act (decision 19): Skip, as on every row a run is decided.
    assert.equal(textOf(byTestId(tree, "bc-sheet-skip")).trim(), contracts.LIFECYCLE_WORDS.ledger.skip);
    press(byTestId(tree, "bc-sheet-skip"));
    tree = again(props);
    assert.equal(skipped.length, 0, "one press does not skip");
    assert.equal(byTestId(tree, "bc-sheet-approve"), null, "the question stands alone");
    assert.ok(
      textOf(byTestId(tree, "bc-sheet-skip-confirm")).includes("Nothing sends, and the run closes."),
      "and it says what skipping does",
    );
    await press(byTestId(tree, "bc-sheet-skip-yes"));
    assert.deepEqual(skipped, ["b-wait"]);
    assert.equal(went.at(-1), "campaigns/sequences/pb-1/runs/b-wait-2");

    // A run whose day has passed is refused by approveRun: the sheet says why, and offers the skip.
    const stale = { ...first, run_for: "2020-01-01" };
    setSurfaceValue("broadcasts", broadcastsSurface({ templates: [offer], rows: [toBroadcastVM(stale, ZONE)] }));
    answers.set("b-wait", [{ ok: true, data: detailOf(stale, people) }]);
    page(props);
    await settle();
    tree = again(props);
    assert.equal(byTestId(tree, "bc-sheet-approve"), null, "REGRESSION-IN-WAITING: a button the server refuses");
    assert.ok(textOf(byTestId(tree, "bc-sheet-expired")).includes("that day has passed"));
    assert.equal(textOf(byTestId(tree, "bc-sheet-pos")), "Waiting for your approval", "the only one waiting");

    // On a phone the acts dock at the pane's foot, as a sequence's do: Approve and who gets it an equal pair, when it goes
    // a line over them, and Skip in the head's menu, asked in the dock (the Inbox's run review, 18 Oct 2026). They stood
    // after the words, a solid slab halfway down the screen.
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({ templates: [offer], rows: [first, second].map((b) => toBroadcastVM(b, ZONE)) }),
    );
    answers.set("b-wait", [{ ok: true, data: detailOf(first, people) }]);
    const media = globalThis.matchMedia;
    globalThis.matchMedia = (q) => ({
      matches: q === "(max-width: 900px)",
      addEventListener() {},
      removeEventListener() {},
    });
    try {
      page(props);
      await settle();
      tree = again(props);
      const docks = all(tree, (n) => n.props?.["data-testid"] === "bc-sheet-acts");
      assert.equal(docks.length, 1, "the acts once, at the foot, not again in the sheet's body");
      // One row, as a sequence's record docks its Approve: when it goes, then Approve. Its line over the button made two
      // rows in a capsule rounded as one, whose ends cut across the pill's (19 Oct 2026).
      assert.equal(docks[0].props["data-foot-pair"], undefined, "a row, not the stacked pair");
      assert.ok(docks[0].props.className.split(" ").includes("bc-dock-row"), docks[0].props.className);
      const [said, act] = docks[0].props.children.filter(Boolean);
      assert.equal(said.props["data-testid"], "bc-sheet-goes", "when it goes, first");
      // Then Approve, with Skip on its caret: one split pill (no three dots in the head, 20 Oct 2026).
      assert.ok(act.props.className.split(" ").includes("bc-dock-split"), act.props.className);
      assert.ok(byTestId(act, "bc-sheet-approve"), "then the Approve it speaks of");
      // The caret is the kit Menu's trigger (Base UI draws it; the stub holds it as the Menu's `trigger`).
      assert.ok(
        find(act, (n) => Array.isArray(n.props?.groups) && n.props.trigger?.props?.["data-testid"] === "bc-sheet-more"),
        "and its caret, which holds Skip",
      );
      assert.match(textOf(said), /^Goes /, "when it goes, beside the Approve it speaks of");
      assert.ok(byTestId(docks[0], "bc-sheet-approve"), "Approve across the foot");
      assert.equal(
        byTestId(docks[0], "bc-sheet-see"),
        null,
        "who gets it is the sheet's own fold, not a half of the foot",
      );
      assert.equal(
        byTestId(docks[0], "bc-sheet-skip"),
        null,
        "Skip is on Approve's caret, never a press of its own beside it",
      );
      const more = find(tree, (n) => Array.isArray(n.props?.groups) && /^More for /.test(n.props.label ?? ""));
      assert.equal(more.props.label, "More for The month's offer", "Approve's caret's menu, named for the run");
      const skip = more.props.groups[0].items[0];
      assert.equal(skip.label, `${contracts.LIFECYCLE_WORDS.ledger.skip}…`);
      skip.onSelect();
      tree = again(props);
      const asked = byTestId(tree, "bc-sheet-acts");
      assert.equal(byTestId(asked, "bc-sheet-approve"), null, "the question stands alone in the dock");
      assert.ok(textOf(byTestId(asked, "bc-sheet-skip-confirm")).includes("Nothing sends, and the run closes."));
      await press(byTestId(asked, "bc-sheet-skip-yes"));
      assert.deepEqual(skipped, ["b-wait", "b-wait"], "skipped from the dock");
    } finally {
      globalThis.matchMedia = media;
    }
  } finally {
    Object.assign(broadcasts, keep);
  }
});

test("REGRESSION: a run waiting on you says the words on the channel its reader is reached on -- an email's subject and words, a text's words and STOP line -- named for the channel, never WhatsApp's under another's name", async () => {
  const today = provided("clock").dayKey(Date.now());
  const note = withMessage({
    id: "tpl-note",
    channel: "whatsapp",
    name: "visit_note",
    language: "en_US",
    meta_status: "approved",
    category: "utility",
    purpose: "conversational",
    body_preview: "Hi {{1}}, your visit is tomorrow.",
    variables: [{ position: 1, label: "First name" }],
    channels: ["whatsapp", "sms", "email"],
    versions: {
      email: { subject: "Your visit, {{1}}", body: "Hi {{1}},\nwe will see you tomorrow." },
      sms: { subject: null, body: "Visit tomorrow, {{1}}." },
    },
  });
  /** The sheet of a waiting run whose first person is reached on `channel`, over `tpl` and the channels the run counted. */
  const sheetOf = async (channel, tpl = note, by = null) => {
    const run = dto({
      id: "b-ch",
      name: "Visit reminders",
      state: "pending_approval",
      started_at: null,
      finished_at: null,
      scheduled_for: iso(-H),
      counts: quiet,
      recipient_count: 2,
      playbook_id: "pb-visit",
      run_for: today,
      template_id: "tpl-note",
      template_name: "visit_note",
      params: [{ kind: "first_name" }],
      audience: { kind: "playbook", id: "pb-visit", label: "Visit reminders", ...(by ? { reach: by } : {}) },
    });
    setSurfaceValue("broadcasts", broadcastsSurface({ templates: [tpl], rows: [toBroadcastVM(run, ZONE)] }));
    // A visit's moment: its message is about their own visit, which by email carries the visit foot (no postal address owed).
    // The business's news by email carries an offer's, which does (decision D2).
    setSurfaceValue(
      "playbooks",
      playbooksSurface({
        rows: [
          playbook({ id: "pb-visit", name: "Visit reminders", trigger: "visit_tomorrow", policy_class: "booking" }),
        ],
      }),
    );
    const queued = { state: "queued", sent_at: null, message_status: null, delivered_at: null };
    answers.set("b-ch", [
      { ok: true, data: detailOf(run, [person({ ...queued, channel }), person({ ...queued, contact_id: "k2" })]) },
    ]);
    const props = { initialRun: "b-ch" };
    page(props);
    await settle();
    return byTestId(again(props), "bc-sheet-words");
  };

  // By email: the subject, the words of the email, and who reads them, by email -- not one of WhatsApp's words.
  const mail = await sheetOf("email");
  assert.equal(mail.props["data-channel"], "email");
  assert.equal(textOf(byTestId(mail, "bc-sheet-subject")), "Your visit, Rosa");
  assert.ok(textOf(mail).includes("we will see you tomorrow."), textOf(mail));
  assert.ok(!textOf(mail).includes("your visit is tomorrow"), "WhatsApp's words are not an email's");
  assert.equal(textOf(byTestId(mail, "bc-sheet-reader")), "as Rosa Díaz reads it · by email");
  // By text: its words and the STOP line the sender adds.
  const text = await sheetOf("sms");
  assert.equal(byTestId(text, "bc-sheet-subject"), null, "a text has no subject");
  assert.ok(textOf(text).includes("Visit tomorrow, Rosa."), textOf(text));
  assert.ok(textOf(text).includes("Reply STOP to opt out"), "the STOP line is part of what they read");
  assert.equal(textOf(byTestId(text, "bc-sheet-reader")), "as Rosa Díaz reads it · by text");
  // By WhatsApp alone: what the sheet always said, with no channel named.
  const wa = await sheetOf("whatsapp");
  assert.ok(textOf(wa).includes("Hi Rosa, your visit is tomorrow."), textOf(wa));
  assert.equal(textOf(byTestId(wa, "bc-sheet-reader")), "as Rosa Díaz reads it");
  // A run that goes by more than WhatsApp names the channel even for the reader on WhatsApp.
  const split = await sheetOf("whatsapp", note, {
    pool: 2,
    will: 2,
    by_channel: { whatsapp: 1, sms: 0, email: 1 },
    no_number: 0,
    stopped: 0,
    no_yes: 0,
    heard_this: 0,
    heard_any: 0,
    over_cap: 0,
    over_limit: 0,
  });
  assert.equal(textOf(byTestId(split, "bc-sheet-reader")), "as Rosa Díaz reads it · on WhatsApp");
  // The reader's version is not in hand (the page holds none for it): WhatsApp's words stand under no channel's name, and
  // the sheet says why, rather than draw them as an email.
  const bare = await sheetOf("email", { ...note, versions: undefined });
  assert.equal(textOf(byTestId(bare, "bc-sheet-version-note")), "This message has no email version yet.");
  assert.equal(byTestId(bare, "bc-sheet-subject"), null);
  assert.equal(
    textOf(byTestId(bare, "bc-sheet-reader")),
    "as Rosa Díaz reads it",
    "no channel's name on words that are not its own",
  );
});

test("a run that kept who it left out opens as the board's card: of how many, the grey and the amber, a line per reason, and the door to getting their yes", async () => {
  const today = provided("clock").dayKey(Date.now());
  const offer = {
    id: "tpl-offer",
    channel: "whatsapp",
    name: "monthly_offer",
    language: "en_US",
    meta_status: "approved",
    category: "marketing",
    purpose: "marketing",
    body_preview: "Hi {{1}}, a free gloss with any cut.",
    variables: [],
  };
  const reach = {
    pool: 312,
    will: 186,
    no_number: 0,
    stopped: 0,
    no_yes: 94,
    heard_this: 0,
    heard_any: 32,
    over_cap: 0,
    over_limit: 0,
  };
  const waiting = dto({
    id: "b-kept",
    name: "The month's offer",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    counts: quiet,
    recipient_count: 186,
    playbook_id: "pb-offer",
    run_for: today,
    template_id: "tpl-offer",
    template_name: "monthly_offer",
    params: [{ kind: "first_name" }],
    audience: { kind: "playbook", id: "pb-offer", label: "The month's offer", reach },
  });
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [offer], rows: [toBroadcastVM(waiting, ZONE)] }));
  setSurfaceValue(
    "playbooks",
    playbooksSurface({
      rows: [
        playbook({
          id: "pb-offer",
          name: "The month's offer",
          trigger: "everyone_monthly",
          policy_class: "campaign",
          cap_per_run: 250,
          cadence_days: 30,
        }),
      ],
    }),
  );
  answers.set("b-kept", [
    {
      ok: true,
      data: detailOf(waiting, [person({ state: "queued", sent_at: null, message_status: null, delivered_at: null })]),
    },
  ]);
  const props = { initialRun: "b-kept" };
  page(props);
  await settle();
  const tree = again(props);
  const card = byTestId(byTestId(tree, "bc-sheet"), "bc-sheet-reach");
  assert.equal(textOf(byTestId(card, "bc-sheet-pool")), "312", "out of everyone its moment named");
  assert.deepEqual(
    all(byTestId(card, "bc-sheet-why"), (n) => n.type === "li").map((li) => textOf(li)),
    ["94 never said yes to offersGet their yes", "32 hear from you within a week of it"],
  );
  // The bar is the whole list: green reaches, amber waits, and the grey is the rest.
  const parts = all(card, (n) => /^bc-sheet-bar-/.test(String(n.props?.className || ""))).map((n) => [
    n.props.className,
    n.props.style ? n.props.style.width : null,
  ]);
  assert.deepEqual(parts, [
    ["bc-sheet-bar-will", "59.6%"],
    ["bc-sheet-bar-held", "10.3%"],
    ["bc-sheet-bar-rest", null],
  ]);
  assert.equal(textOf(card).includes("each said yes to offers"), false, "the counts stand where the rules stood");
  // Of every reason, the one an owner can change opens where it is changed.
  press(byTestId(card, "bc-sheet-door"));
  assert.equal(went.at(-1), contracts.GET_YES_ROUTE, "People's Get their yes");
});

test("an approve or a stop is said the moment the server takes it, with what it answered -- not after the broadcasts, the playbooks and every contact are read again", async () => {
  // The loading standard's D: the toast waited for the write and the refresh map's re-read of both surfaces (the
  // broadcasts one reads every contact page). The server's answer is what the toast says, so it is said from that.
  const waiting = dto({
    id: "b-wait",
    name: "Win-back · 2026-09-15",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    // Today's run: one made for an earlier day is refused by the verb, and no page offers to approve it.
    run_for: provided("clock").dayKey(Date.now()),
    counts: quiet,
  });
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [waiting].map((b) => toBroadcastVM(b, ZONE)) }));
  const keep = { approve: broadcasts.approve, cancel: broadcasts.cancel };
  const reread = [];
  const acceptThenRead =
    (data) =>
    (_id, opts = {}) => {
      if (opts.onAccepted) opts.onAccepted(data);
      return new Promise((r) => reread.push(() => r({ ok: true, data })));
    };
  broadcasts.approve = acceptThenRead({
    recipient_count: 3,
    scheduled_for: iso(0),
    moved_from: null,
  });
  const stops = [];
  const stopThenRead = acceptThenRead({ was: "sending" });
  broadcasts.cancel = (id, opts) => (stops.push(id), stopThenRead(id, opts));
  answers.set("b-wait", [{ ok: true, data: detailOf(waiting, []) }]);
  // The run waiting on you, open on its sheet beside Sequences' list, where it is approved.
  const props = { initialRun: "b-wait" };
  try {
    toasts.length = 0;
    page(props);
    await settle();
    press(byTestId(again(props), "bc-sheet-approve"));
    await settle();
    assert.equal(toasts.length, 1, "said at acceptance, while the surfaces are read again");
    assert.match(textOf(toasts[0].msg), /approved · 3 people/);
    assert.ok(
      !textOf(byTestId(again(props), "bc-sheet-approve")).includes("Approving…"),
      "the button is back when the server took it",
    );
    while (reread.length) reread.shift()();
    await settle();
    assert.equal(toasts.length, 1, "and said once");
    // The way back, as Send once's toast offers it: "Stop it" for a run that goes now, "Cancel it" for one still to go.
    const goes = bcWhenWords({ recipient_count: 3, scheduled_for: iso(0), moved_from: null });
    assert.equal(
      toasts[0].action?.label,
      contracts.runStopDoorWords(goes !== contracts.SENDING_NOW_WORDS),
      "REGRESSION: an approval's toast offered no way back",
    );
    toasts[0].action.onClick();
    await settle();
    while (reread.length) reread.shift()();
    await settle();
    assert.deepEqual(stops, ["b-wait"], "the run just approved");
    assert.match(textOf(toasts.at(-1).msg), /stops after this send/);
  } finally {
    Object.assign(broadcasts, keep);
  }
});

test("REGRESSION (C14): Approve says it is approving and cannot approve twice -- a second press approved again, and the server refused it", async () => {
  const waiting = dto({
    id: "b-wait",
    name: "Win-back · 2026-09-15",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    // Today's run: one made for an earlier day is refused by the verb, and no page offers to approve it.
    run_for: provided("clock").dayKey(Date.now()),
    counts: quiet,
  });
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [waiting, dto()].map((b) => toBroadcastVM(b, ZONE)) }));
  answers.set("b-wait", [{ ok: true, data: detailOf(waiting, []) }]);
  let release = () => {};
  const approvals = [];
  const keep = broadcasts.approve;
  broadcasts.approve = (id) => {
    approvals.push(id);
    return new Promise((r) => {
      release = () => r({ ok: true, data: { recipient_count: 3, scheduled_for: iso(0), moved_from: null } });
    });
  };
  const props = { initialRun: "b-wait" };
  try {
    page(props);
    await settle();
    let tree = again(props);
    const approve = byTestId(tree, "bc-sheet-approve");
    press(approve);
    press(approve);
    assert.deepEqual(approvals, ["b-wait"], "REGRESSION: a second press approved again, and the server refused it");
    tree = again(props);
    const busy = byTestId(tree, "bc-sheet-approve");
    assert.ok(textOf(busy).includes("Approving…"));
    assert.equal(busy.props.disabled, true);
    release();
    await settle();
  } finally {
    broadcasts.approve = keep;
  }
});

test("REGRESSION (C15): the sending hours are the published ones -- they were typed into the pages beside the constants", () => {
  // The hours are the contracts' published words (SENDING_HOURS_WORDS), the very object the page's clock hands every page
  // (zone.ts pageClock): change them and each page says the new ones; a page that typed its own would say nine to
  // twenty still.
  const realClock = provided("clock");
  const published = { ...realClock.hours };
  Object.assign(realClock.hours, {
    min: 8,
    max: 19,
    first: "8:00",
    range: "8:00–19:59",
    between: "between 8:00 and 19:59",
  });
  try {
    let at = Date.now() + H;
    while (!realClock.nextOpen(at).moved) at += H;
    assert.ok(bcWhenNote(at, 30).words.endsWith("sends wait for 8:00–19:59"), bcWhenNote(at, 30).words);
    const receipt = bcWhenWords({
      scheduled_for: new Date(at + 12 * H).toISOString(),
      moved_from: new Date(at).toISOString(),
    });
    assert.ok(receipt.includes("between 8:00 and 19:59"), receipt);
  } finally {
    Object.assign(realClock.hours, published);
  }
});

test("each run opens on a pane of its own: the open run's filter and expanded rows are its state, and were carried into the next run opened, the pane being one element for every run", async () => {
  const [one, two] = [dto(), dto({ id: "b-sent-2", name: "Win-back · 2026-09-11" })];
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [one, two].map((b) => toBroadcastVM(b, ZONE)) }));
  for (const b of [one, two]) answers.set(b.id, [{ ok: true, data: detailOf(b) }]);
  const paneOf = async (id) => {
    const props = { initialRun: id };
    page(props);
    await settle();
    return find(again(props), (n) => n.type === BroadcastDetail);
  };
  const first = await paneOf("b-sent");
  const second = await paneOf("b-sent-2");
  assert.equal(first.props.id, "b-sent");
  assert.equal(second.props.id, "b-sent-2");
  // The pane is keyed by the run it holds, so React gives the next run fresh state, not the last run's.
  assert.equal(first.props.key, "b-sent");
  assert.equal(second.props.key, "b-sent-2");
});

test("the run open at its home is the address's: closing it goes back to where it was opened from, else onto its sequence's History, and a link out pushes one", async () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  // Going out, so its screen stands: a run that is done moves to Reports (the C12 test above).
  answers.set("b-sent", [{ ok: true, data: detailOf(dto({ state: "sending" })) }]);
  const calls = [];
  const keep = heldDoors();
  // The frame's move (frame-doors.ts navigate): where it went, and whether it replaced the entry or pushed one.
  bridgeHolds({
    doors: {
      navigate: (to, opts) => {
        went.push(to);
        calls.push(opts && opts.replace ? "replace" : "push");
      },
    },
  });
  try {
    const props = { initialRun: "b-sent" };
    page(props);
    await settle();
    let tree = again(props);
    assert.ok(byTestId(tree, "bc-run-solo"), "the run's pane, beside the list");
    // A door out of the page is a link: it pushes, as every link does.
    const door = find(byTestId(tree, "bc-run-solo"), (n) => n.props?.className === "bc-run-link");
    assert.ok(door, "the run's playbook is a link in the pane's head");
    assert.match(textOf(door), / campaign$/, "said as a campaign to its reader (decision 19)");
    press(door);
    assert.equal(went.at(-1), "campaigns/sequences/pb-1", "its campaign, by the campaign's own id the run names");
    assert.equal(calls.at(-1), "push", "and it did not replace the run's entry");
    // Closed with no frame to say what opened it (a link, a reload): onto its sequence's History, the days it is one of,
    // never a Back out of the app, in the run's place (frame-doors.ts backFrom, replaced as the page asks). The frame's own
    // Back to the opener is the shell's (shell/surfaces/status/).
    press(byTestId(tree, "bc-detail-close"));
    assert.equal(went.at(-1), "campaigns/sequences/pb-1/history");
    assert.equal(calls.at(-1), "replace", "the run's entry is its History's now: Back never lands on the closed run");
    tree = again(props);
    assert.ok(
      byTestId(tree, "bc-run-solo"),
      "the pane stays drawn until its page is left, never the list a moment first",
    );
  } finally {
    bridgeHolds({ doors: keep });
  }
});

test("a run's report: who it touched is filtered by the kit's sub-tabs, and a person is the kit's face", async () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  const replied = person({
    contact_id: "k2",
    name: "Mia Ortiz",
    first_name: "Mia",
    replied: true,
    replied_at: iso(-4 * D),
    reply_words: "Yes please, Saturday?",
  });
  // Going out: the report of a run that can still change (one that is done is read in Reports).
  answers.set("b-sent", [{ ok: true, data: detailOf(dto({ state: "sending" }), [person(), replied]) }]);
  const props = { initialRun: "b-sent" };
  page(props);
  await settle();
  let tree = again(props);
  const strip = () => find(byTestId(tree, "bc-touched"), (n) => n.type === SubTabs).props;
  assert.deepEqual(
    strip().tabs.map((t) => [t.id, t.label, t.testid]),
    [
      ["all", "All", "bc-touched-all"],
      ["replied", "Replied", "bc-touched-replied"],
      ["held", "Held back", "bc-touched-held"],
      ["stopped", "Stopped", "bc-touched-stopped"],
    ],
    "the four filters, each with the id its test has always had",
  );
  assert.equal(strip().value, "all");
  const people = () => all(byTestId(tree, "bc-touched"), (n) => n.props?.["data-testid"] === "bc-person");
  assert.equal(people().length, 2, "everyone, to start");
  const nReplied = strip().tabs.find((t) => t.id === "replied").count;
  assert.equal(nReplied, 1, "the count beside it is the report's");
  strip().onSelect("replied");
  tree = again(props);
  assert.equal(strip().value, "replied");
  assert.equal(people().length, nReplied, "picking it shows those who wrote back");
  strip().onSelect("all");
  tree = again(props);
  assert.equal(people().length, 2);
  // A person's mark is the kit's face at the desk row's size, with their initials.
  for (const row of people()) {
    const faces = all(row, (n) => n.type === Face);
    assert.equal(faces.length, 1, "one face to a person");
    assert.equal(faces[0].props.size, "sm");
    assert.ok(faces[0].props.person?.initials, "with their initials, beside their name (the kit face's person)");
  }
});

test("A new template may be written in any language WhatsApp takes, found by typing it -- the composer offered six", async () => {
  const drafts = [];
  const keep = { ...templates };
  Object.assign(templates, {
    draft: async (b) => {
      drafts.push(b);
      return { ok: false, message: "no" };
    },
  });
  try {
    fresh();
    const draw = () => drawAgain(() => TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} }));
    let tree = draw();
    const field = pickerOf(tree, "tpl-language");
    assert.equal(textOf(field.props.face).trim(), "English (US)", "the language in words, as the fields beside it are");
    const options = optionsOf(field);
    assert.equal(options.length, starters.allLanguages.length);
    // The search is the kit Picker's, narrowing by what the contracts' findLanguages finds: a name, its own name, a place.
    const found = options.filter((o) => field.props.search.match(o, "fran")).map((o) => o.value);
    assert.deepEqual(
      found,
      ["fr", "fr_BE", "fr_CA", "fr_CI", "fr_MA", "fr_CH"],
      "French by its own name, every place WhatsApp files it",
    );
    field.props.onValueChange(found[0]);
    tree = draw();
    assert.equal(textOf(pickerOf(tree, "tpl-language").props.face).trim(), "French");
    // The brief is the kit's Field (surfaces/kit/field/), which says what is typed as `onValueChange`.
    byTestId(tree, "tpl-brief").props.onValueChange("Twenty percent off colour this week");
    tree = draw();
    await press(byTestId(tree, "tpl-draft"));
    assert.equal(drafts[0].language, "fr", "the draft is asked for in French");
  } finally {
    Object.assign(templates, keep);
  }
});

test("REGRESSION (C22): a message shows the quality WhatsApp rated it -- the rating was synced and never drawn", () => {
  // The rating is about the message, so it is in the message: the row says what
  // the message is, and opening it says everything WhatsApp knows about it.
  let tree = messagesOpen({
    templatesAll: [templateRow({ name: "front_desk_note", source: "meta", quality: "YELLOW" })],
  });
  const q = byTestId(tree, "template-quality");
  assert.ok(q, "REGRESSION: no rating on the message");
  assert.equal(textOf(q).trim(), "Medium quality");
  // Only a rating that warns is drawn (Messages, the canvas of 10 Nov 2026): high, or none given yet, is nothing to act on.
  for (const quality of ["UNKNOWN", "GREEN", "HIGH"]) {
    tree = messagesOpen({ templatesAll: [templateRow({ name: "front_desk_note", source: "meta", quality })] });
    assert.equal(byTestId(tree, "template-quality"), null, `${quality}: nothing to say`);
  }
  tree = messagesOpen({ templatesAll: [templateRow({ name: "front_desk_note", source: "meta", quality: null })] });
  assert.equal(byTestId(tree, "template-quality"), null, "nothing synced, nothing said");
});

test("REGRESSION (C8): deleting a message a playbook sends names the playbook -- a running one holds the delete back, a paused one is named in the question, and an unread list says so", () => {
  const armed = (playbooks) => {
    const tree = messagesOpen({ templatesAll: [templateRow()], playbooks: playbooks });
    // Delete is an item of the open message's menu (the pane's head, the kit's Menu): its act is what the item does.
    assert.equal(menuItem(tree, "Delete").tone, "danger");
    menuItem(tree, "Delete").onSelect();
    return messagesAgain();
  };
  let tree = armed({
    rows: [playbook({ name: "Win-back", template_name: "offer", template_language: "en_US", state: "running" })],
  });
  assert.equal(
    byTestId(tree, "template-delete-yes"),
    null,
    "REGRESSION: a Yes, and the playbook's runs skipped from then on",
  );
  const held = byTestId(tree, "template-delete-held");
  assert.ok(held && textOf(held).includes("“Win-back” still uses this message."), textOf(held));
  // The old Playbooks list is Campaigns' home now: the door says Campaigns and still goes to `outbound`, which lands there.
  press(find(tree, (n) => n.type === "button" && textOf(n).includes("Campaigns")));
  assert.equal(went.at(-1), "campaigns/sequences", "and a door to the playbooks");

  tree = armed({
    rows: [
      playbook({ name: "Welcome", template_name: "offer", template_language: "en_US", state: "paused" }),
      playbook({
        id: "pb-es",
        name: "Spanish offer",
        template_name: "offer",
        template_language: "es",
        state: "running",
      }),
    ],
  });
  assert.ok(
    byTestId(tree, "template-delete-yes"),
    "a paused playbook does not hold it back, nor one sending another language",
  );
  assert.ok(
    textOf(byTestId(tree, "template-delete-confirm")).includes("“Welcome” is paused and sends it"),
    textOf(byTestId(tree, "template-delete-confirm")),
  );

  tree = armed(undefined);
  assert.ok(
    textOf(byTestId(tree, "template-delete-confirm")).includes("couldn't check which campaigns send it"),
    "a playbooks read that has not landed is said",
  );
});

test("The template a composer opens on does not depend on the order the rows arrived in", () => {
  // The page sorts before it asks, so the rendered picker is steady either way --
  // but `defaultTemplate` is what a caller that does NOT sort gets, and it used
  // to `find` on the list as given. Held here, where the fix is.
  const row = (name, language) => ({
    id: `${name}:${language}`,
    name,
    language,
    category: "marketing",
    source: "chanlytics",
    title: null,
  });
  const list = [
    row("welcome_new", "es"),
    row("winback_offer", "es"),
    row("welcome_new", "en_US"),
    row("winback_offer", "en_US"),
  ];
  const pick = (l) => contracts.defaultTemplate(l, "quiet_30").id;
  assert.equal(pick(list), pick(list.slice().reverse()));
  assert.equal(pick(list), "winback_offer:en_US", "the trigger's starter, in the first language of the total order");
  // And the order IS total: two rows of one name never compare equal.
  assert.notEqual(contracts.compareTemplates(row("winback_offer", "en_US"), row("winback_offer", "es")), 0);
});

test("A template written here keeps its footer everywhere, not only while it is being drafted", () => {
  // The components as the CREATE path files them with Meta, built by contracts --
  // not a shape invented here.
  const written = contracts.templateComponents({
    name: "spring_offer",
    language: "en_US",
    category: "marketing",
    body: "Hi {{1}}, 20% off any service this week.",
    footer: "Reply STOP to opt out",
    examples: ["Dani"],
  });
  // And as the SYNC stores them, which is Meta's own array.
  const fromManager = [
    { type: "BODY", text: "Hi {{1}}, your table is ready." },
    { type: "FOOTER", text: "Not now? Reply STOP" },
  ];

  const mine = templateRow({
    id: "t-mine",
    name: "spring_offer",
    purpose: "marketing",
    body_preview: "Hi {{1}}, 20% off any service this week.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    footer: contracts.footerOf(written),
  });
  const theirs = templateRow({
    id: "t-theirs",
    name: "front_desk_note",
    source: "meta",
    purpose: "marketing",
    body_preview: "Hi {{1}}, your table is ready.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    footer: contracts.footerOf(fromManager),
  });

  // In the message's own sheet, where Messages said a starter's footer or nothing at all (Messages folded into Campaigns,
  // 17 Nov 2026: the sheet is where a message is read): the workspace's OWN message, open alone.
  const msgTree = messagesOpen({ templatesAll: [mine] });
  const own = paneOf(msgTree);
  assert.ok(own, "and its words open beside the list");
  assert.ok(textOf(own).includes("Reply STOP to opt out"), textOf(own));
  // A template synced from WhatsApp Manager keeps ITS words.
  const synced = paneOf(messagesOpen({ templatesAll: [theirs] }));
  assert.ok(textOf(synced).includes("Not now? Reply STOP"), textOf(synced));

  // A row with no footer on file invents none -- and a STARTER still knows its own.
  const bare = templateRow({ id: "t-bare", name: "front_desk_note", footer: null, body_preview: "No footer here." });
  assert.equal(starters.footer(bare), null);
  const s = starters.list[0];
  assert.equal(starters.footer({ name: s.name, language: "es", footer: null }), s.texts.es.footer);
});

test("The preview draws the heading and the buttons, which are the message too", () => {
  // For an appointment business the "Book now" button IS the message, and it was
  // the one part of it the operator could not see: `body_preview` is the BODY
  // component alone, so a heading and a button were drawn as nothing at all.
  const components = [
    { type: "HEADER", format: "TEXT", text: "This week at Luna Studio" },
    { type: "BODY", text: "Hi {{1}}, 20% off any colour service." },
    { type: "FOOTER", text: "Reply STOP to opt out" },
    {
      type: "BUTTONS",
      buttons: [
        { type: "URL", text: "Book now", url: "https://booksy.com/luna" },
        { type: "QUICK_REPLY", text: "Not now" },
      ],
    },
  ];
  const tpl = templateRow({
    id: "t-rich",
    name: "offer",
    purpose: "marketing",
    body_preview: "Hi {{1}}, 20% off any colour service.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    ...contracts.templateParts(components),
    blocked: contracts.templateBlocked({ components }),
  });
  assert.equal(tpl.blocked, null, "static heading and static buttons carry no parameter, so this one sends");

  // The message open on Messages, its words in the pane beside the list.
  const preview = byTestId(paneOf(messagesOpen({ templatesAll: [tpl] })), "message-preview");
  assert.ok(textOf(find(preview, (n) => n.props?.className === "mp-header")).includes("This week at Luna Studio"));
  const buttons = byTestId(preview, "mp-buttons");
  assert.ok(buttons, "the buttons are drawn");
  assert.equal(all(buttons, (n) => n.props?.className === "mp-button").length, 2);
  assert.ok(textOf(buttons).includes("Book now") && textOf(buttons).includes("Not now"), textOf(buttons));
  // A screen reader hears the whole message, not the words alone.
  const said = String(find(preview, (n) => n.props?.className === "mp-bubble").props["aria-label"]);
  assert.ok(said.includes("This week at Luna Studio") && said.includes("Book now"), said);
});

test("A message written here can carry a Book now button, and it is the one kind that sends", () => {
  // For an appointment business the button IS the conversion, and until now one
  // could only arrive by syncing from WhatsApp Manager -- where it could just as
  // easily arrive in a shape that cannot be sent at all.
  const settings = {
    config: { brain: { business_name: "Luna Studio", booking_link: "https://booksy.com/luna-studio" } },
  };
  settingsOf({ settings, channels: [{ kind: "whatsapp" }], templatesAll: [] });
  const made = [];
  const keep = { ...templates };
  Object.assign(templates, {
    create: async (b) => {
      made.push(b);
      return { ok: true, data: { name: b.name } };
    },
  });
  try {
    fresh();
    let tree = TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} });
    // The boxes are the kit's Fields (surfaces/kit/field/): what is typed is their `onValueChange`.
    const set = (id, v) => {
      byTestId(tree, id).props.onValueChange(v);
    };
    set("tpl-name", "spring_offer");
    set("tpl-body", "Hi {{1}}, 20% off any colour service this week.");
    tree = drawAgain(() => TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} }));
    // The address is the workspace's own, and it is shown rather than typed.
    // Its label is the Field's own (a prop), so the words are read from it.
    const buttonLabel = textOf(byTestId(tree, "tpl-button-text").props.label);
    assert.ok(buttonLabel.includes("booksy.com/luna-studio"), buttonLabel);
    byTestId(tree, "tpl-button-text").props.onValueChange("Book now");
    all(tree, (n) => n.props?.["data-testid"] === "tpl-examples").length;
    const ex = find(tree, (n) => n.type === Field && n.props?.placeholder === "Ana");
    if (ex) ex.props.onValueChange("Dani");
    tree = drawAgain(() => TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} }));

    // It is drawn where the customer will see it, before anything is filed.
    assert.ok(textOf(byTestId(tree, "mp-buttons")).includes("Book now"), "the composer draws its own button");

    return press(byTestId(tree, "tpl-submit")).then(() => {
      assert.equal(made.length, 1, "it was filed");
      assert.deepEqual(made[0].button, { text: "Book now", url: "https://booksy.com/luna-studio" });
      // And what is filed is a template that SENDS: a static button carries no
      // parameter, so templateBlocked passes it (unlike every shape #646 refuses).
      const check = contracts.validateTemplateDraft({
        name: "spring_offer",
        language: "en_US",
        category: "marketing",
        body: "Hi {{1}}, come by this week.",
        examples: ["Dani"],
        button: made[0].button,
      });
      assert.ok(check.ok, check.error);
      const components = contracts.templateComponents(check.value);
      assert.equal(contracts.templateBlocked({ components }), null, "a static button is sendable");
      assert.deepEqual(
        contracts.templateParts(components).buttons,
        [{ text: "Book now", kind: "url" }],
        "and it reads back as itself",
      );
    });
  } finally {
    Object.assign(templates, keep);
  }
});

test("A button cannot take a value, and needs somewhere to go", () => {
  const base = { name: "offer", language: "en_US", category: "marketing", body: "Hi {{1}} there.", examples: ["Dani"] };
  const err = (button) => contracts.validateTemplateDraft({ ...base, button }).error;
  // The whole point: a button whose URL takes a value needs a parameter that
  // `sendTemplate` never sends, so Meta refuses every recipient.
  assert.match(err({ text: "Book", url: "https://x.example/{{1}}" }), /cannot take a value/);
  assert.match(err({ text: "Book {{1}}", url: "https://x.example" }), /cannot take a value/);
  assert.match(err({ text: "", url: "https://x.example" }), /Give the button its words/);
  assert.match(err({ text: "Book an appointment with us today", url: "https://x.example" }), /under 25 characters/);
  assert.match(err({ text: "Book", url: "booksy.com/luna" }), /starting with https/);
  assert.equal(contracts.validateTemplateDraft({ ...base, button: null }).ok, true, "and no button at all is fine");

  // With no booking link on file the composer offers no button, and says why.
  settingsOf({
    settings: { config: { brain: { business_name: "Luna Studio", booking_link: "" } } },
    channels: [{ kind: "whatsapp" }],
  });
  fresh();
  const tree = TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} });
  assert.equal(byTestId(tree, "tpl-button-text"), null);
  // The hint stands in the Field's place as its control, a prop of the kit's Field (surfaces/kit/field/).
  const none = find(byTestId(tree, "tpl-button"), (n) => n.type === Field).props.control;
  assert.ok(textOf(none).includes("booking link"), textOf(none));
});
