/**
 * One face for a person (the wiring plan's task 4.3; D1-face-number, D1-face-email).
 *
 * A person known only by a number was a phone glyph on People and the Pipeline's board, peek and picker, and two digits
 * in a circle in the Inbox, Conversations, Live, their own page and (unless they phoned) Today's queue. One known only by
 * an address was a mail glyph on the board and a phone glyph in the peek beside it, and two letters of the address
 * elsewhere. "Is this name only an identifier?" was typed nine times, and the nine disagreed on the "@" and on digits.
 *
 * What is held here, by executing the code:
 *  - contracts decides the face once (personFaceOf, over the one test isIdentifierName), and the places that retyped the
 *    test now ask it: a message's first name, the Pipeline peek's figures, the calendar's match by name;
 *  - the kit's Face draws a `person` by that decision: initials for a name, the phone glyph for a number, the mail glyph
 *    for an address, with the same words for a pointer, and the page's own title wins;
 *  - People's name cell and phone card, the Pipeline's table and phone card and Today's attention row draw it, so a
 *    number is the same circle on each.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstNameOf,
  isIdentifierName,
  namesAPerson,
  personFaceOf,
  personInText,
  pipelineOf,
  pipelinePeekOf,
  toPersonRowVM,
} from "@chanlytics/contracts";
import { installLegacyReact, fresh, find, byTestId, classes, textOf } from "../../_legacy-react.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
const S = "../../../../../apps/dashboard/src";
const { Face } = await import(`${S}/surfaces/kit/face/face.tsx`);
const { Icon } = await import(`${S}/surfaces/kit/icon/icon.tsx`);
const { AttnRow } = await import(`${S}/surfaces/kit/attention/attn-row.tsx`);
const { PL_COLUMNS, PL_PHONE_COLUMNS } = await import(`${S}/surfaces/people/cells/columns.tsx`);
const { pipeGlassColumns, pipePhoneColumns } = await import(`${S}/surfaces/people/pipeline/columns.tsx`);

const h = (type, props, ...kids) => globalThis.React.createElement(type, props, ...kids);

const TZ = "America/New_York";
const H = 3_600_000;
const DAY = 24 * H;
/** Wednesday, Sep 23, 2026, noon in New York. */
const NOW = Date.parse("2026-09-23T16:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

const NUMBER = "+1 (305) 555-0100";
const ADDRESS = "ana@example.com";

/** The glyph a drawn face holds: the Icon's name, or null where it holds initials. */
const glyphIn = (tree) => find(tree, (n) => n.type === Icon)?.props.name ?? null;
/** The face inside a drawn tree. */
const faceIn = (tree) => find(tree, (n) => n.type === Face);

/** A person as people_list returns them (the shape deals/pipeline.test.mjs pins), who wrote 40 days ago. */
const personRow = (id, name, over = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: null,
  email: null,
  consent: "opted_in",
  consent_source: "in_person",
  consent_updated_at: iso(NOW - 60 * DAY),
  marketing_consent: null,
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: `cv-${id}`,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: iso(NOW - 40 * DAY),
  last_message_at: iso(NOW - 40 * DAY),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Thanks",
  last_inbound_at: iso(NOW - 40 * DAY),
  last_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: iso(NOW - 90 * DAY),
  earliest_row_at: iso(NOW - 90 * DAY),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});

/** A proposal out, so the person is a row of the Pipeline. */
const proposal = {
  deal_id: "d-1",
  deal_stage: "proposed",
  deal_service: "Color correction",
  deal_proposed_at: iso(NOW - 2 * DAY),
  deal_decided_at: null,
  deal_ended_at: null,
  deal_amount_cents: null,
  deal_per: null,
  deal_proposal_url: "https://docs.example.com/proposal",
  deal_valid_until: null,
  deal_lost_reason: null,
};

const vmOf = (id, name, over = {}) => toPersonRowVM(personRow(id, name, over), TZ, new Date(NOW));
const pipelineRowOf = (vm) => pipelineOf([vm], NOW, TZ, null).groups.flatMap((g) => g.rows)[0];

/** What a cell of People's table is handed besides its row. */
const CTX = { attention: {}, onOpen() {}, onWarm() {}, shows: {}, bookingLink: null, drop: null, listsOf: {} };

/* ------------------------------ contracts: the face is decided once ------------------------------ */

test("a face is decided once, by the one test of a name that is only an identifier: initials, a phone, or a mail", () => {
  assert.deepEqual(personFaceOf("Aisha Rahman"), { kind: "named", initials: "AR", glyph: null });
  assert.deepEqual(personFaceOf(NUMBER), { kind: "number", initials: "00", glyph: "phone" });
  assert.deepEqual(personFaceOf(ADDRESS), { kind: "address", initials: "AN", glyph: "mail" });
  assert.equal(
    personFaceOf("(305) 555-0100").kind,
    "number",
    "a bracket opens a number, as the test has always read it",
  );
  assert.equal(personFaceOf("2ana@example.com").kind, "address", "an address that opens with a digit is an address");
  assert.equal(
    personFaceOf("Aisha Rahman", "XY").initials,
    "XY",
    "the view model's own initials are the ones a name wears",
  );
  assert.equal(
    personFaceOf(NUMBER, "XY").glyph,
    "phone",
    "and a number wears its glyph whatever initials it is handed",
  );
  for (const name of ["Aisha Rahman", NUMBER, ADDRESS, "(305) 555-0100", "Dani", ""]) {
    assert.equal(personFaceOf(name).kind !== "named", isIdentifierName(name), `${name}: the face reads the one test`);
  }
});

test("the places that retyped the test ask it now: a first name, the peek's figures, a name found in an event", () => {
  // A message may say "Hi Ana", never "Hi anaexamplecom": an address on file is no first name, as a number is none.
  assert.equal(firstNameOf(ADDRESS, null), null);
  assert.equal(firstNameOf(null, ADDRESS), null);
  assert.equal(firstNameOf(NUMBER, null), null);
  assert.equal(firstNameOf("Ana Reyes", null), "Ana");
  // A name in an event's words is a whole name, never a number or an address made words.
  const people = [
    { id: "p-address", name: ADDRESS, phone: null, email: ADDRESS },
    { id: "p-ana", name: "Ana Reyes", phone: null, email: null },
  ];
  assert.equal(
    personInText(`Gloss · ${ADDRESS}`, people),
    null,
    "the address is matched as an address, by the feed's emails",
  );
  assert.equal(personInText("Gloss · Ana Reyes", people)?.id, "p-ana");
  // The peek draws a number or an address in figures.
  for (const [name, numeric] of [
    [NUMBER, true],
    [ADDRESS, true],
    ["Ana Reyes", false],
  ]) {
    const peek = pipelinePeekOf(pipelineRowOf(vmOf("p-1", name, proposal)), "proposals");
    assert.equal(peek.numeric, numeric, name);
  }
});

test("Today's queue draws a person with a face and a search or a count of steps without one", () => {
  for (const kind of ["handoff", "callback", "window", "call", "reply", "step"])
    assert.equal(namesAPerson({ kind }), true, kind);
  for (const kind of ["search", "steps"]) assert.equal(namesAPerson({ kind }), false, kind);
});

/* ------------------------------------- the kit's Face ------------------------------------- */

test("the kit's Face draws a person by contracts: their initials, the phone glyph for a number, the mail glyph for an address", () => {
  fresh();
  const named = h(Face, { person: { name: "Aisha Rahman", initials: "AR" } });
  assert.equal(textOf(named), "AR");
  assert.equal(glyphIn(named), null);
  assert.equal(named.rendered.props.className, "face");
  assert.equal(named.rendered.props.title, undefined, "a named person has nothing to say to a pointer");

  const number = h(Face, { person: { name: NUMBER, initials: "00" }, size: "sm" });
  assert.equal(glyphIn(number), "phone");
  assert.equal(textOf(number), "", "never the two digits");
  assert.equal(number.rendered.props.className, "face face-glyph face-sm");
  assert.equal(number.rendered.props.title, "No name yet");

  const address = h(Face, { person: { name: ADDRESS, initials: "AN" } });
  assert.equal(glyphIn(address), "mail", "an address is the mail glyph here as on the board, and never a phone");
  assert.equal(address.rendered.props.className, "face face-glyph");

  // The glyph is the Icon at the face's size, whichever page draws it.
  const icon = find(number, (n) => n.type === Icon);
  assert.equal(icon.props.size, 12);

  // Initials come from the name where the view model has none; the page's own title wins; a photo covers either.
  assert.equal(textOf(h(Face, { person: { name: "Aisha Rahman" } })), "AR");
  assert.equal(h(Face, { person: { name: NUMBER }, title: "Open them" }).rendered.props.title, "Open them");
  const photo = h(Face, { person: { name: NUMBER }, photo: "https://example.com/p.jpg" });
  assert.equal(photo.rendered.props.children.filter(Boolean).length, 2, "the glyph, then the picture over it");
  // What it was always, whoever it stands for.
  assert.equal(number.rendered.props["aria-hidden"], "true");
  assert.equal(h(Face, { initials: "ZS" }).rendered.props.className, "face");
  assert.equal(
    glyphIn(h(Face, { glyph: h(Icon, { name: "users", size: 13 }) })),
    "users",
    "a teammate's glyph is its own",
  );
});

test("Today's attention row draws a person with the Face, and what is not one as it did", () => {
  fresh();
  const draw = (extra) => h(AttnRow, { name: "x", sentence: "y", status: [], ...extra });
  const phoned = draw({ person: { name: NUMBER, initials: "00" } });
  assert.equal(glyphIn(phoned), "phone");
  assert.ok(faceIn(phoned), "the kit's Face");
  assert.ok(classes(faceIn(phoned).rendered).includes("cl-attn-pic"), "placed by the row's own class");
  assert.equal(
    find(phoned, (n) => classes(n).includes("cl-attn-avatar")),
    null,
    "no avatar of its own",
  );
  assert.equal(glyphIn(draw({ person: { name: ADDRESS, initials: "AN" } })), "mail");
  assert.equal(textOf(faceIn(draw({ person: { name: "Aisha Rahman", initials: "AR" } }))), "AR");
  // A step's count, a setup row or a run keep the avatar they always drew.
  const run = draw({ initials: "+3" });
  assert.equal(faceIn(run), null);
  assert.equal(textOf(find(run, (n) => classes(n).includes("cl-attn-avatar"))), "+3");
});

/* ---------------------------------- the pages that draw it ---------------------------------- */

test("People's table and phone card draw the same face for a number and for an address, and initials for a name", () => {
  fresh();
  const name = PL_COLUMNS.find((c) => c.key === "name");
  const card = PL_PHONE_COLUMNS[0];
  const rows = [
    [vmOf("p-name", "Rosa Example"), null, "RE"],
    [vmOf("p-number", NUMBER, { phone_e164: "+13055550100" }), "phone", ""],
    [vmOf("p-address", ADDRESS, { email: ADDRESS }), "mail", ""],
  ];
  for (const [vm, glyph, initials] of rows) {
    for (const [where, cell] of [
      ["the table's name cell", name.cell(vm, CTX)],
      ["the phone's card", card.cell(vm, CTX)],
    ]) {
      const face = faceIn(cell);
      assert.ok(face, `${where} draws the kit's Face`);
      assert.deepEqual(face.props.person, { name: vm.name, initials: vm.initials }, `${where} tells it who`);
      assert.equal(glyphIn(face), glyph, `${where}: ${vm.name}`);
      assert.equal(textOf(face), initials, `${where}: ${vm.name}`);
    }
  }
  // "Name them" is offered to anyone named by an identifier, a number or an address, and to no one else.
  assert.ok(byTestId(name.cell(rows[1][0], CTX), "row-name-them"));
  assert.ok(byTestId(name.cell(rows[2][0], CTX), "row-name-them"));
  assert.equal(byTestId(name.cell(rows[0][0], CTX), "row-name-them"), null);
});

test("the Pipeline's table and phone card draw the same face as People's, for the same person", () => {
  fresh();
  const [tableName] = pipeGlassColumns();
  const [phoneCard] = pipePhoneColumns();
  const ctx = { ...CTX, attention: null };
  for (const [name, glyph, over] of [
    ["Rosa Example", null, {}],
    [NUMBER, "phone", { phone_e164: "+13055550100" }],
    [ADDRESS, "mail", { email: ADDRESS }],
  ]) {
    const vm = vmOf("p-1", name, { ...over, ...proposal });
    const row = pipelineRowOf(vm);
    assert.ok(row, `${name} is a row of the Pipeline`);
    assert.equal(glyphIn(faceIn(tableName.cell(row, ctx))), glyph, `the table: ${name}`);
    assert.equal(glyphIn(faceIn(phoneCard.cell(row, ctx))), glyph, `the phone: ${name}`);
  }
});

test("the campaign preview's walk of people draws a person's face by the person rule, never two digits of a number (the wiring's second audit, R11 S9-4)", async () => {
  fresh();
  const { PreviewStepper } = await import(`${S}/surfaces/campaigns/parts/message-preview.tsx`);
  for (const [label, glyph] of [
    [NUMBER, "phone"],
    [ADDRESS, "mail"],
    ["Rosa Example", null],
  ]) {
    const tree = PreviewStepper({
      people: [
        { label, position: "1 of 2" },
        { label: "Someone Else", position: "2 of 2" },
      ],
      index: 0,
      onStep: () => {},
    });
    const face = faceIn(tree);
    assert.deepEqual([face.props.person, face.props.initials], [{ name: label }, undefined], label);
    assert.equal(glyphIn(face), glyph, label);
  }
});
