/**
 * How a person is reached, and how their yes is recorded: an email address said once and added in Reach them, the
 * door's refusal said under the field, and their own message chosen from what they wrote (00125, 00137).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, byTestId, find, press, textOf } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { importSrc } from "../../_source.mjs";
import * as contracts from "@chanlytics/contracts";
import {
  D,
  KitIcon,
  Menu,
  NOW,
  VISITS,
  ZONE,
  detail,
  iso,
  peoplePage,
  profile,
  profileRecording,
  profileSaving,
  reply,
  row,
  said,
  segment,
  settle,
  standingSaid,
  takeKeys,
  toPersonRowVM,
  toPersonVM,
  type,
  typeIn,
  way,
  withMessages,
} from "./_person-page.mjs";
import { bridgeHolds, whoIsLooking, provided } from "../../shell/_bridge-holds.mjs";

test("a person's email address is said once, in Reach them, and added there: the row is its own control, and what is wrong with a typed address is said under the field before anything is sent", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS, email: null }) }), ZONE, new Date(NOW));
  assert.equal(vm.email, null);
  const { draw, sent, restore } = await profileSaving(vm);
  try {
    let tree = draw();
    // Reach them holds the address (canvas A): someone who may change it gets the row while it is empty.
    const reach = find(tree, (n) => n.props?.["data-testid"] === "person-reach");
    assert.ok(reach, "Reach them");
    const add = byTestId(reach, "person-email-edit");
    assert.equal(add.props["aria-label"], "Add an email address", "its pencil says what it is for");
    const input = byTestId(reach, "person-email-input");
    assert.equal(input.props["data-placeholder"], "Add an email", "an empty address is an invitation in its box");
    assert.equal(input.props.contentEditable, "plaintext-only", "the row is the field from the first draw");
    takeKeys(input);
    typeIn(byTestId(draw(), "person-email-input"), "ana.example.com");
    tree = draw();
    press(byTestId(tree, "person-email-save"));
    await settle();
    tree = draw();
    assert.match(
      textOf(byTestId(tree, "person-email-problem")),
      /missing the @/,
      "which kind of not-an-address, under the field",
    );
    assert.deepEqual(sent, [], "and nothing went over the wire");
    typeIn(byTestId(tree, "person-email-input"), "  Ana@Example.com ");
    tree = draw();
    assert.equal(byTestId(tree, "person-email-problem"), null, "typing clears what was said about the last attempt");
    press(byTestId(tree, "person-email-save"));
    await settle();
    assert.deepEqual(
      sent,
      [["p1", { email: "Ana@Example.com" }]],
      "the typed address, trimmed; the route and the door decide its stored spelling",
    );
  } finally {
    restore();
  }
});

test("an address that is there shows with a quiet pencil; the door's refusal is said under the field, in its own words; someone who may only read sees the address and no control, or no row at all", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS, email: "ana@example.com" }) }), ZONE, new Date(NOW));
  assert.equal(vm.email, "ana@example.com");
  assert.ok(
    vm.about.some((a) => a.k === "Email" && a.v === "ana@example.com"),
    "About carries it from the contract",
  );
  const taken = "Another person here already has that address.";
  const { draw, sent, restore } = await profileSaving(vm, { ok: false, code: "conflict", message: taken });
  try {
    let tree = draw();
    assert.equal(textOf(byTestId(tree, "person-email-input")), "ana@example.com");
    const edit = byTestId(tree, "person-email-edit");
    assert.equal(textOf(edit).trim(), "", "a pencil, not an invitation");
    press(edit);
    takeKeys(byTestId(draw(), "person-email-input"));
    tree = draw();
    assert.equal(textOf(byTestId(tree, "person-email-input")), "ana@example.com", "the box holds what is stored");
    typeIn(byTestId(tree, "person-email-input"), "bo@example.com");
    tree = draw();
    press(byTestId(tree, "person-email-save"));
    await settle();
    tree = draw();
    assert.deepEqual(sent, [["p1", { email: "bo@example.com" }]]);
    assert.equal(textOf(byTestId(tree, "person-email-problem")), taken);
    assert.ok(byTestId(tree, "person-email-save"), "and the box keeps the keys, on what was typed");
  } finally {
    restore();
  }

  const me = whoIsLooking().me;
  bridgeHolds({ who: { me: { role: "viewer" } } });
  try {
    const withOne = (await profile(vm))();
    assert.equal(textOf(byTestId(withOne, "person-email")), "ana@example.com");
    assert.equal(byTestId(withOne, "person-email-edit"), null, "a viewer reads it");
    const without = (
      await profile(toPersonVM(detail({ row: row({ visits: VISITS, email: null }) }), ZONE, new Date(NOW)))
    )();
    assert.equal(byTestId(without, "person-email"), null, "and with no address there is no empty row to read");
  } finally {
    bridgeHolds({ who: { me: me } });
  }
});

test("a person with an address and no number or name is called by the address everywhere, is invited to be named, and their thread's line says the address instead of 'no phone'", async () => {
  const dto = row({
    display_name: null,
    wa_profile_name: null,
    phone_e164: null,
    email: "ana@example.com",
    channels: [],
    has_chat: false,
    conversation_count: 0,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    latest_conversation_id: null,
    last_inbound_text: null,
    last_message_at: null,
  });
  const vm = toPersonRowVM(dto, ZONE, new Date(NOW));
  assert.equal(vm.name, "ana@example.com", "REGRESSION: 'Unknown' for a person whose only identifier is an address");
  assert.equal(vm.phone, null);
  assert.equal(
    contracts.personName({ display_name: null, wa_profile_name: null, phone_e164: null }),
    "Unknown",
    "a person with nothing is still nobody",
  );
  assert.equal(contracts.isIdentifierName("ana@example.com"), true);
  assert.equal(contracts.isIdentifierName("+1 (786) 555-0181"), true);
  assert.equal(contracts.isIdentifierName("Ana Reyes"), false);

  const draw = await peoplePage([dto]);
  const tr = find(draw(), (n) => n.type === "tr" && n.props?.id === "person-p1");
  assert.ok(byTestId(tr, "row-name-them"), "named by an identifier: the row invites a name");
  assert.equal(
    find(tr, (n) => n.type === KitIcon && n.props?.name === "mail") !== null,
    true,
    "an envelope, not a handset",
  );

  const conv = {
    contact: { id: "p1", display_name: null, wa_profile_name: null, phone_e164: null, email: "ana@example.com" },
  };
  assert.equal(contracts.contactName(conv), "ana@example.com");
  assert.equal(
    contracts.contactMeta(conv),
    "WhatsApp · no name saved",
    "the identifier IS the name, so the line says that instead of repeating it",
  );
  assert.equal(
    contracts.contactMeta({ contact: { ...conv.contact, display_name: "Ana Reyes" } }),
    "WhatsApp · ana@example.com",
    "REGRESSION: 'no phone' under a person who has an address",
  );
  assert.equal(
    contracts.contactMeta({ contact: { ...conv.contact, display_name: "Ana Reyes", email: null } }),
    "WhatsApp · no phone",
  );
});

test("their own message is chosen from what they wrote: the way opens their recent messages, and the one pressed is the one recorded", async () => {
  const vm = withMessages([
    said("m1", 5, "Can I move Saturday to 11?"),
    reply("m2", 4, "Sure, 11 works."),
    said("m3", 1, "And yes, send me your offers", { channel: "sms" }),
  ]);
  const { draw, sent, restore } = await profileRecording(vm);
  try {
    let tree = draw();
    press(segment(tree, "consent-marketing", "Yes"));
    tree = draw();
    press(way(tree, "consent-marketing", "Their own message"));
    tree = draw();
    assert.deepEqual(sent, [], "choosing the way writes nothing");
    const how = byTestId(tree, "consent-marketing-how");
    assert.match(textOf(how), /Which message\? Choose the one where they said it\./);
    const choices = all(how, (n) => n.props?.["data-testid"] === "consent-marketing-message");
    assert.deepEqual(
      vm.ownMessages.map((m) => m.id),
      ["m3", "m1"],
      "what they wrote, newest first; not the reply",
    );
    assert.equal(choices.length, 2);
    vm.ownMessages.forEach((m, i) => {
      for (const part of [m.words, m.via, m.when])
        assert.ok(textOf(choices[i]).includes(part), `choice ${i} says ${part}: ${textOf(choices[i])}`);
      assert.equal(choices[i].type, "button", "a choice is pressed, not read");
    });
    press(choices[0]);
    await until(() => sent.length > 0, "the yes reached its door");
    assert.deepEqual(
      sent,
      [["offers", "p1", { consent: "opted_in", source: "customer_message", message_id: "m3" }]],
      "the message pressed is the message named",
    );
    assert.equal(byTestId(draw(), "consent-marketing-how"), null, "the ask closes once it lands");
  } finally {
    restore();
  }
});

test("a person opened from a People view steps to the one before and after (‹ 2 of 3 ›), the address replaced so Back still leaves the list, at every width: never for one opened from anywhere else (0052)", async () => {
  const { tabMemoryFor } = await importSrc("apps/dashboard/src/bridge/tab-memory.ts");
  const { keepWalk, leaveWalk, takeStep } = await importSrc("apps/dashboard/src/surfaces/people/walk.ts");
  const keep = {
    memory: provided("tabMemory"),
    nav: globalThis.window.CHANLY.nav,
    mq: globalThis.window.matchMedia,
  };
  const steps = [];
  bridgeHolds({ parts: { tabMemory: tabMemoryFor(globalThis.window) } });
  globalThis.window.CHANLY.nav = (to, opts) => steps.push([to, opts]);
  try {
    const vm = toPersonVM(detail(), ZONE, new Date(NOW));
    // The list on screen as they are opened (its clean-up comes after the page is drawn).
    keepWalk("all", ["p-before", vm.id, "p-after"]);
    let draw = await profile(vm);
    let tree = draw();
    // The walk stands with "‹ People" where the date stands (the standing's `back.after`, canvas A): the frame draws it,
    // so it is drawn here from what the page said.
    const walkOf = () => {
      const after = standingSaid()?.back?.after;
      return after ? after.type(after.props) : null;
    };
    const walk = walkOf();
    assert.equal(textOf(walk).replace(/\s+/g, ""), "2of3");
    press(byTestId(walk, "person-walk-next"));
    assert.deepEqual(steps.at(-1), ["clients/p-after", { replace: true }], "the next person, the address replaced");
    assert.equal(takeStep("p-after"), "next", "and the page it lands on turns from the side it went");
    press(byTestId(walk, "person-walk-prev"));
    assert.deepEqual(steps.at(-1), ["clients/p-before", { replace: true }]);
    assert.equal(takeStep("p-before"), "prev");
    assert.equal(takeStep("p-before"), undefined, "taken once: a person opened any other way arrives unturned");
    assert.equal(byTestId(tree, "person-walk"), null, "the page itself draws no walk");
    // A person the view does not hold has no steps.
    keepWalk("all", ["p-before", "p-after"]);
    draw = await profile(vm);
    draw();
    assert.equal(walkOf(), null);
    // REGRESSION (13 Oct 2026): the list gone, a person opened from the Inbox or a link said the last list's "2 of 3".
    keepWalk("all", ["p-before", "p-other", "p-after"]);
    leaveWalk();
    draw = await profile(vm);
    draw();
    assert.equal(walkOf(), null, "REGRESSION: a person not opened from the list stood in it");
    // On a phone the same steps stand in the bell's place (components.css), and More holds none.
    keepWalk("all", ["p-before", vm.id, "p-after"]);
    globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    draw = await profile(vm);
    tree = draw();
    assert.equal(textOf(walkOf()).replace(/\s+/g, ""), "2of3");
    const more = find(byTestId(tree, "person-acts"), (n) => n.type === Menu);
    const labels = more.props.groups.flatMap((g) => g.items.map((i) => i.label));
    assert.ok(!labels.includes("Next person") && !labels.includes("Previous person"), "More holds no steps");
    // The people either side are read ahead (useWalk): let those reads land here, not in the next test's count.
    await settle();
  } finally {
    bridgeHolds({ parts: { tabMemory: keep.memory } });
    globalThis.window.CHANLY.nav = keep.nav;
    globalThis.window.matchMedia = keep.mq;
  }
});

test("a person a lead names, or who works at one, has a Yes no member may press: disabled, with the doors' own sentence as its caption (0052)", async () => {
  const unasked = { consent: "unknown", consent_source: null, consent_updated_at: null };
  const atBusiness = toPersonVM(
    detail({
      row: row({ visits: VISITS, ...unasked, lead_id: "l1", lead_name: "Bloom & Vow Bridal", name_source: "typed" }),
    }),
    ZONE,
    new Date(NOW),
  );
  const theLeads = toPersonVM(
    detail({
      row: row({ visits: VISITS, ...unasked }),
      lead: { id: "l1", business_name: "Bloom & Vow Bridal", found_at: iso(9 * D), reach_out: null },
    }),
    ZONE,
    new Date(NOW),
  );
  assert.equal(atBusiness.yesLocked, contracts.LEAD_CONSENT_REFUSAL, "someone who works at a lead");
  assert.equal(theLeads.yesLocked, contracts.LEAD_CONSENT_REFUSAL, "the person a lead was found as");
  assert.equal(toPersonVM(detail(), ZONE, new Date(NOW)).yesLocked, null, "anyone else");
  const { draw, restore } = await profileRecording(atBusiness);
  try {
    const tree = draw();
    const yes = segment(tree, "consent-control", "Yes");
    assert.equal(yes.props.disabled, true, "the doors refuse it: the page does not offer it");
    assert.equal(yes.props["aria-describedby"], "consent-control-yes-locked", "its caption says why");
    assert.equal(textOf(byTestId(tree, "consent-control-yes-locked")), contracts.LEAD_CONSENT_REFUSAL);
    assert.equal(segment(tree, "consent-control", "No").props.disabled, false, "a no is recorded however it is said");
  } finally {
    restore();
  }
});

test("an answer given somewhere Chanlytics does not see: the picker says to record a sign-up form with a note, and one press opens it", async () => {
  const { draw, sent, restore } = await profileRecording(withMessages([said("m1", 2, "Hi there")]));
  try {
    let tree = draw();
    press(segment(tree, "consent-control", "Yes"));
    tree = draw();
    press(way(tree, "consent-control", "Their own message"));
    tree = draw();
    const elsewhere = byTestId(tree, "consent-control-elsewhere");
    assert.match(textOf(elsewhere), /somewhere Chanlytics doesn't see/);
    assert.match(textOf(elsewhere), /Record a sign-up form/);
    assert.match(textOf(elsewhere), /say where in the note/);
    press(find(elsewhere, (n) => n.type === "button"));
    tree = draw();
    assert.ok(byTestId(tree, "consent-control-note"), "the form's note, one press away");
    assert.equal(
      all(tree, (n) => n.props?.["data-testid"] === "consent-control-message").length,
      0,
      "the messages give way to it",
    );
    assert.deepEqual(sent, [], "and nothing was recorded on the way");
  } finally {
    restore();
  }
});

test("a person who has written nothing here is offered no message, and is told the way that remains", async () => {
  const vm = withMessages([
    reply("m2", 4, "Sure, 11 works."),
    said("m4", 3, null, { type: "media", media: { mime_type: "image/jpeg" } }),
  ]);
  assert.deepEqual(vm.ownMessages, [], "a reply is ours, and a photo with nothing written on it has no words to show");
  const { draw, restore } = await profileRecording(vm);
  try {
    let tree = draw();
    press(segment(tree, "consent-marketing", "Yes"));
    tree = draw();
    press(way(tree, "consent-marketing", "Their own message"));
    tree = draw();
    const how = byTestId(tree, "consent-marketing-how");
    assert.equal(all(how, (n) => n.props?.["data-testid"] === "consent-marketing-message").length, 0);
    assert.match(textOf(how), /Nothing they've written to you is here to choose\./);
    assert.ok(byTestId(tree, "consent-marketing-elsewhere"), "and the way that remains");
  } finally {
    restore();
  }
});

test("a sign-up form is recorded with the note that attests it: nothing is sent until the note says which form, or where", async () => {
  const { draw, sent, restore } = await profileRecording(withMessages([said("m1", 2, "Hi there")]));
  try {
    let tree = draw();
    press(segment(tree, "consent-marketing", "Yes"));
    tree = draw();
    press(way(tree, "consent-marketing", "Sign-up form"));
    tree = draw();
    assert.deepEqual(
      sent,
      [],
      "REGRESSION: a form was recorded the moment its chip was pressed, with nothing to say which",
    );
    const note = byTestId(tree, "consent-marketing-note");
    assert.ok(note, "the form asks for its note");
    assert.equal(note.props.maxLength, 200, "as long as the door keeps");
    assert.equal(byTestId(tree, "consent-marketing-note-save").props.disabled, true, "and will not record without one");
    type(note, "   ");
    tree = draw();
    assert.equal(byTestId(tree, "consent-marketing-note-save").props.disabled, true, "spaces say nothing");
    type(byTestId(tree, "consent-marketing-note"), "  Slip 12, signed at the desk ");
    tree = draw();
    press(byTestId(tree, "consent-marketing-note-save"));
    await settle();
    assert.deepEqual(sent, [
      ["offers", "p1", { consent: "opted_in", source: "form", note: "Slip 12, signed at the desk" }],
    ]);

    // A no on a form, by Enter: the same note, the same door.
    tree = draw();
    press(segment(tree, "consent-control", "No"));
    tree = draw();
    press(way(tree, "consent-control", "Sign-up form"));
    tree = draw();
    type(byTestId(tree, "consent-control-note"), "Opt-out slip");
    tree = draw();
    byTestId(tree, "consent-control-note").props.onKeyDown({ key: "Enter", preventDefault() {} });
    await settle();
    assert.deepEqual(sent.at(-1), ["visit", "p1", { consent: "opted_out", source: "form", note: "Opt-out slip" }]);
  } finally {
    restore();
  }
});

test("the spoken ways still record at once, with the source and nothing else", async () => {
  const { draw, sent, restore } = await profileRecording(withMessages([said("m1", 2, "Hi there")]));
  try {
    let tree = draw();
    press(segment(tree, "consent-control", "Yes"));
    tree = draw();
    press(way(tree, "consent-control", "In person"));
    await settle();
    assert.deepEqual(sent, [["visit", "p1", { consent: "opted_in", source: "in_person" }]]);
  } finally {
    restore();
  }
});
