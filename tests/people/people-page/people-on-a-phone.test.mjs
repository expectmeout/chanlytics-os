/**
 * People on a phone (the phone pass, 22 Sep): the list, a row's press, and what holds still under the thumb.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { peoplePages } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { lineBox } from "../../shared/_line.mjs";
import { listRuleParts, stateOf } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import {
  Menu,
  PeopleAddSheet,
  PhoneSheetRow,
  TEXTERS,
  addressAt,
  all,
  barMenuOf,
  bulkSheetOpen,
  byTestId,
  click,
  columnsMenu,
  dockActIds,
  dockSays,
  draw,
  drawsAStrip,
  find,
  flashes,
  frames,
  freshPage,
  hasClass,
  headAct,
  idsShown,
  itemOf,
  jobBack,
  json,
  listActsOf,
  mayOnly,
  onPhone,
  openSheet,
  opened,
  person,
  press,
  routeNow,
  rowOf,
  selectWord,
  setOverlayOpen,
  sheetRows,
  sortMenuOf,
  standingSaid,
  textOf,
  toastAfter,
  went,
  wrote,
} from "./_people-page.mjs";

test("REGRESSION: on a phone People is one bar, one line and the people -- a 57px search box, three text buttons and an 'Everyone' title stood between them", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1), person(2)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
    let tree = draw();
    const bar = byTestId(tree, "people-phone-bar");
    assert.ok(bar, "the bar");
    assert.equal(
      all(bar, (n) => n.props?.role === "tab").length,
      0,
      "the scopes are the frame's strip of views over the page, never the bar's",
    );
    assert.equal(textOf(byTestId(bar, "people-phone-lists")).trim(), "Everyone", "the list being shown");
    assert.equal(byTestId(bar, "people-phone-search").props["aria-label"], "Search names, numbers and emails");
    assert.ok(
      find(bar, (n) => n.type === Menu),
      "and the page's more-menu",
    );
    assert.equal(
      find(tree, (n) => n.props?.className === "cl-controls"),
      null,
      "REGRESSION: the controls row",
    );
    assert.equal(
      find(tree, (n) => n.props?.className === "cl-section-head"),
      null,
      "REGRESSION: the list head, under a bar that names the list",
    );
    const standing = byTestId(tree, "people-standing");
    assert.match(textOf(standing), /2 people/, "the one line stays");
    assert.equal(byTestId(standing, "people-lists-pick"), null, "the line holds counts; the list is the bar's");
    // A pick in the sheet names the list in the bar.
    click(byTestId(tree, "people-phone-lists"));
    tree = draw();
    click(find(openSheet(tree, "people-lists-sheet"), (n) => n.type === "button" && textOf(n).includes("Regulars")));
    tree = draw();
    assert.equal(textOf(byTestId(tree, "people-phone-lists")).trim(), "Regulars");
    assert.deepEqual(idsShown(tree), ["person-p1"]);
  }));

test("the switch between the scopes is the frame's strip of views: the page draws none of its own, on a desktop or in a phone's bar, a deal on file or none", async () => {
  // What the strip holds (People, Leads, the Pipeline), which is picked, and where a press goes are the chrome's
  // (people-views.test.mjs); this page says them and draws nothing of them.
  for (const hasDeals of [false, true]) {
    await freshPage({ people: [person(1)], hasDeals });
    assert.equal(drawsAStrip(draw()), false, `a desktop's page draws no strip (a deal on file: ${hasDeals})`);
    await onPhone(async () => {
      await freshPage({ people: [person(1)], hasDeals });
      const tree = draw();
      assert.equal(drawsAStrip(tree), false, `a phone's bar draws no strip (a deal on file: ${hasDeals})`);
      assert.ok(byTestId(tree, "people-phone-lists"), "People keeps its list to pick, the frame's strip over it");
    });
  }
});

// Ruben, 24 Sep: the scopes on a phone should look like the Inbox's views. They were a boxed switch squeezed into the
// bar beside the list button ("All deals 6" shortened at 375px); now they are the shell's own tab strip, the Inbox's
// .stabs, on a row of their own over the bar, and they stay while the bar is the search field.
// A phone's page swipes across its strip, and a tap slides the same way (frame/surface-tabs.tsx stripPlace): People's strip
// is its scopes, in plScopes' order, and a person's page is on none.
test("People's scopes are its strip's order: People, Leads, the Pipeline; a person's page is on no strip", async () => {
  // The strip (surfaces/frame/surface-tabs.tsx), under the names the frame draws and asks it by.
  const surfaceTabs = await importSrc("apps/dashboard/src/surfaces/frame/surface-tabs.tsx");
  Object.assign(globalThis.window, {
    SurfaceTabs: surfaceTabs.SurfaceTabs,
    stripPlace: surfaceTabs.stripPlace,
    stripSlide: surfaceTabs.stripSlide,
    stripSwipe: surfaceTabs.stripSwipe,
  });
  const w = globalThis.window;
  assert.deepEqual(w.stripPlace("clients", null), { strip: "people", at: 0 });
  assert.deepEqual(w.stripPlace("clients", "seg:needs-you"), { strip: "people", at: 0 });
  assert.deepEqual(w.stripPlace("clients", "leads:s-abc"), { strip: "people", at: 1 });
  assert.deepEqual(w.stripPlace("clients", "pipeline"), { strip: "people", at: 2 });
  assert.equal(w.stripPlace("clients", "c-123"), null);
  assert.equal(w.stripSlide(w.stripPlace("clients", "leads"), w.stripPlace("clients", null)), "prev");
});

test("on a phone the top is the list's row and the search under the frame's strip, and the list stays over the search", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1)], hasDeals: true });
    went.length = 0;
    const tree = draw();
    const top = byTestId(tree, "people-phone-bar");
    const kids = (top.props.children || []).filter(Boolean);
    // The frame's strip of views stands over this (SurfaceTabs); the page's top begins at the bar.
    const bar = kids[0];
    assert.equal(bar.props.className, "pp-bar", "the bar is the first row, under the frame's strip");
    assert.equal(all(bar, (n) => n.props?.role === "tab").length, 0, "no switch squeezed beside the list button");
    assert.ok(byTestId(bar, "people-phone-lists"), "the list button has the bar");
    // The top stands over the page's scroller, not in it, as the Inbox's strip does: the rows scroll and bounce under
    // it, and a pull down never takes the strip with them (Ruben, 25 Sep).
    const scroller = find(tree, (n) =>
      String(n.props?.className || "")
        .split(" ")
        .includes("cl-main-scroll"),
    );
    assert.ok(scroller, "the page's scroller");
    assert.equal(byTestId(scroller, "people-phone-bar"), null, "the top is not inside what scrolls");
    // The search is the field from the first draw, no button a press swaps for it (Ruben, 11 Oct 2026), under the list.
    assert.equal(byTestId(top, "people-phone-search-open"), null, "no capsule at rest to press first");
    assert.ok(byTestId(top, "people-phone-search"), "the bar's search is the field");
    assert.ok(byTestId(top, "people-phone-lists"), "and the list stays over it");
  }));

test("a desktop draws no phone bar and no controls row: its search is the bar's line and its tools stand by the act; the list head stays", async () => {
  await freshPage({ people: [person(1)] });
  const tree = draw();
  assert.equal(byTestId(tree, "people-phone-bar"), null);
  assert.equal(
    find(tree, (n) => n.props?.className === "cl-controls"),
    null,
    "the row under the line held them",
  );
  assert.equal(
    find(tree, (n) => n.type === "input" && /^Search/.test(String(n.props?.placeholder || ""))),
    null,
    "no search box of the page's own",
  );
  assert.equal(lineBox().props.placeholder, "Search people, or ask about them", "the bar's line is the search");
  assert.ok(columnsMenu() && byTestId(headAct(), "people-export"), "Columns and Export by the act");
  assert.ok(find(tree, (n) => n.props?.className === "cl-section-head"));
});

test("Add people is the page's act, its one filled button, beside the strip over the list; the controls row holds Columns and Export", async () => {
  await freshPage({ people: [person(1)] });
  let tree = draw();
  const said = standingSaid();
  assert.equal(said?.title, "People", "the list says People's standing itself");
  const act = find(said.act, (n) => n.props?.["data-testid"] === "add-people");
  assert.ok(act, "with Add people for its act, which the frame draws beside the strip");
  assert.equal(act.props.variant, "primary", "the list's one filled button, as Campaigns' New message is");
  assert.equal(byTestId(tree, "people-import"), null, "Import is the sheet's now, not a word in the controls row");
  assert.equal(
    find(tree, (n) => n.type === PeopleAddSheet),
    null,
    "nothing is open yet",
  );
  act.props.onClick();
  tree = draw();
  const sheet = find(tree, (n) => n.type === PeopleAddSheet);
  assert.ok(sheet, "the press opens Add people");
  assert.equal(sheet.props.canImport, true, "an owner may bring a list in from it");
  sheet.props.onAdded("p9");
  assert.deepEqual(opened, ["p9"], "added, the person's page opens");
});

test("on a phone the page's act is Add people too, its first word kept where the row is short, and it opens the one sheet", () =>
  onPhone(async () => {
    // It was the more-menu's alone, and the frame hid the act: a phone showed no way to add a person (Ruben, 7 Oct 2026).
    await freshPage({ people: [person(1)] });
    let tree = draw();
    const said = standingSaid();
    assert.equal(said?.title, "People");
    const act = find(said.act, (n) => n.props?.["data-testid"] === "add-people");
    assert.ok(act, "the head holds Add people");
    // The words come in two parts (kit/head/act-words.tsx): the mark and the first word, which a narrow phone keeps
    // beside three scopes, and the rest, which gives way there and is still read out.
    const part = (name) => find(act, (n) => n.props?.className === name);
    assert.equal(textOf(part("pg-act-keep")), "Add", "the first word is kept with the mark");
    assert.equal(textOf(part("pg-act-rest")), " people", "the rest follows, its own space with it");
    assert.equal(
      find(tree, (n) => n.type === PeopleAddSheet),
      null,
      "nothing is open yet",
    );
    act.props.onClick();
    tree = draw();
    assert.ok(
      find(tree, (n) => n.type === PeopleAddSheet),
      "the press opens Add people, at every width the same sheet",
    );
  }));

test("on a phone search is the field from the first draw: nothing focuses it by itself, the clear empties it, and it stays", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1, { display_name: "Rosa Diaz" }), person(2, { display_name: "Ana Lee" })] });
    let tree = draw();
    // It rested as a capsule a tap only swapped for the field, so a second tap began the typing (Ruben, 11 Oct 2026).
    assert.equal(byTestId(tree, "people-phone-search-open"), null, "no capsule at rest to press first");
    const field = byTestId(tree, "people-phone-search");
    assert.equal(field.props.type, "search");
    assert.notEqual(field.props.autoFocus, true, "nothing focuses by itself: the field takes the tap that lands on it");
    assert.ok(
      byTestId(tree, "people-phone-lists"),
      "the list stays over the field, as the Inbox's buckets stay over its search",
    );
    field.props.onChange({ target: { value: "rosa" } });
    tree = draw();
    assert.deepEqual(idsShown(tree), ["person-p1"]);
    assert.equal(byTestId(tree, "people-phone-search-cancel"), null, "no Cancel: the clear stands in the field");
    click(byTestId(tree, "people-phone-search-clear"));
    tree = draw();
    assert.equal(idsShown(tree).length, 2, "the clear empties the words");
    assert.ok(byTestId(tree, "people-phone-search"), "and the field stays");
    assert.equal(byTestId(tree, "people-phone-search-clear"), null, "with no clear until a word is typed again");
    // The page's / puts the caret in it (the field's ref, a browser's), and draws nothing new.
    press("/");
    assert.ok(byTestId(draw(), "people-phone-search"), "/ leaves the field where it stands");
  }));

test("on a phone Sort sorts as a desktop's headings do, Add people adds one person, and the Lists sheet holds the open list's own acts", () =>
  onPhone(async () => {
    const seen = await freshPage({
      people: [person(1, { display_name: "Zed" }), person(2, { display_name: "Abe" })],
      lists: [{ id: "s1", name: "Regulars", ids: ["p1", "p2"] }],
    });
    let tree = draw();
    assert.deepEqual(
      sortMenuOf(tree)
        .filter((i) => typeof i.checked === "boolean")
        .map((i) => [i.label, i.checked]),
      [
        ["Needs you first", false],
        ["Latest contact first", true],
        ["Name, A to Z", false],
        ["Name, Z to A", false],
      ],
      "the sorts a desktop's headings give, the one in use ticked; Soonest visit only with a calendar",
    );
    sortMenuOf(tree)
      .find((i) => i.label === "Name, A to Z")
      .onClick();
    tree = draw();
    assert.deepEqual(idsShown(tree), ["person-p2", "person-p1"], "A to Z");
    // Add people, one person: the sheet's first way in, its number on a phone's number pad.
    find(standingSaid().act, (n) => n.props?.["data-testid"] === "add-people").props.onClick();
    tree = draw();
    assert.ok(find(tree, (n) => n.type === PeopleAddSheet));
    assert.equal(byTestId(tree, "add-person-phone").props.type, "tel", "a phone's number pad");
    // The box is the kit's Field, a row of the sheet's group: typed through what the field says as it changes.
    byTestId(tree, "add-person-phone").props.onValueChange("+1 786 555 0100");
    tree = draw();
    // The record sheet's Save hands back nothing to wait on: the add settles, then the page is drawn again.
    byTestId(tree, "rec-sheet-save-people-add").props.onClick();
    await until(() => opened.at(-1) === "p9", "the person added opens");
    tree = draw();
    assert.deepEqual(wrote(seen).at(-1), ["POST", "contacts", { phone: "+1 786 555 0100" }]);
    assert.equal(
      find(tree, (n) => n.type === PeopleAddSheet),
      null,
      "added: the sheet closes",
    );
    assert.equal(opened.at(-1), "p9", "and their page opens");
    // A list open: its rename and its delete are at the foot of the Lists sheet.
    draw({ initialSaved: "s1" });
    listActsOf({ initialSaved: "s1" })
      .find((i) => i.label === "Rename this list")
      .onClick();
    tree = draw({ initialSaved: "s1" });
    const name = byTestId(openSheet(tree, "list-act-sheet"), "list-rename-name");
    assert.equal(name.props.value, "Regulars", "the name to change, in the box");
    name.props.onChange({ target: { value: "VIP" } });
    tree = draw({ initialSaved: "s1" });
    await byTestId(tree, "list-rename-save").props.onClick();
    tree = draw({ initialSaved: "s1" });
    assert.deepEqual(wrote(seen).at(-1), ["PUT", "segments/s1", { name: "VIP" }]);
    assert.equal(openSheet(tree, "list-act-sheet"), null);
    assert.ok(
      flashes.some((f) => textOf(f.msg).includes("VIP")),
      "said",
    );
    listActsOf({ initialSaved: "s1" })
      .find((i) => i.label === "Delete this list…")
      .onClick();
    tree = draw({ initialSaved: "s1" });
    const confirm = find(openSheet(tree, "list-act-sheet"), (n) => n.type === globalThis.Confirm);
    assert.equal(confirm.props.detail, "The people stay.", "asked through the one Confirm");
    await confirm.props.onYes();
    tree = draw({ initialSaved: "s1" });
    assert.deepEqual(wrote(seen).at(-1), ["DELETE", "segments/s1", null]);
    assert.equal(textOf(byTestId(tree, "people-phone-lists")).trim(), "Everyone", "the list gone, everyone shown");
  }));

test("the page holds its keys while a phone's sheet is open, leaves its Esc to it, and closes it when it asks", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1), person(2)], lists: [{ id: "s1", name: "Regulars", ids: ["p1", "p2"] }] });
    draw({ initialSaved: "s1" });
    listActsOf({ initialSaved: "s1" })
      .find((i) => i.label === "Rename this list")
      .onClick();
    const tree = draw({ initialSaved: "s1" });
    const sheet = openSheet(tree, "list-act-sheet");
    assert.ok(sheet);
    // The kit's sheet as Base UI draws it open, on the body: the page holds still behind it.
    setOverlayOpen({ role: "dialog", inApp: false, className: "sheet" });
    assert.equal(press("j"), false, "J walks nothing behind the sheet");
    assert.equal(press("Escape"), false, "its Esc is its own");
    setOverlayOpen(null);
    // Its Esc, its wash, its word and a pull down all ask through onClose.
    sheet.props.onClose();
    assert.equal(openSheet(draw({ initialSaved: "s1" }), "list-act-sheet"), null, "asked, the page closed it");
  }));

test("a phone sheet's list is rows of one shape, and a step inside a sheet has a way back", () => {
  const Row = PhoneSheetRow;
  let pressed = 0;
  const row = Row({
    icon: "edit",
    label: "Add a note",
    next: true,
    onClick: () => {
      pressed += 1;
    },
    testid: "r",
  });
  assert.equal(row.type, "button");
  assert.match(row.props.className, /\bpp-sheet-row\b/);
  assert.ok(
    find(row, (n) => n.props?.className === "pp-sheet-row-next"),
    "a row that opens a step says so",
  );
  click(row);
  assert.equal(pressed, 1);
  // A row the member's role refuses is the gate's: focusable, described, inert.
  const refused = Row({
    label: "Export",
    onClick: () => {
      pressed += 1;
    },
    gate: { "aria-disabled": true, onClick: () => {} },
  });
  click(refused);
  assert.equal(pressed, 1, "the gate's press, not the act");
  assert.equal(refused.props["aria-disabled"], true);
  // A step's way back, as the kit's sheet draws it: named, the chevron, and the step it walks back to.
  let backs = 0;
  const back = jobBack(() => {
    backs += 1;
  });
  assert.equal(back.label, "Back");
  assert.equal(back.glyph.props.name, "chevron");
  back.onBack();
  assert.equal(backs, 1, "Back walks to the list the step came from");
});

test("on a phone Select walks a selection -- Select, Select all, Cancel -- the faces are rings, a tap selects, and ✕ ends it", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1), person(2)] });
    let tree = draw();
    assert.equal(selectWord(tree), "Select");
    click(byTestId(tree, "people-phone-select"));
    tree = draw();
    assert.match(
      find(tree, (n) => /\bpl-table-wrap\b/.test(String(n.props?.className || ""))).props.className,
      /\bselecting\b/,
      "the faces are rings, ready for a tap",
    );
    assert.equal(selectWord(tree), "Select all", "the mode on, the word offers everyone");
    const bar = byTestId(tree, "bulk-bar");
    assert.ok(bar, "the bar says the mode is on");
    assert.equal(bar.props["aria-label"], "Select people", "and what to do, with nothing yet to act on");
    assert.equal(byTestId(bar, "bulk-more").props.disabled, true, "its acts stand and wait for someone picked");
    const before = opened.length;
    rowOf(tree, "p1").props.onClick();
    tree = draw();
    assert.equal(opened.length, before, "a tap selects rather than opens");
    assert.equal(dockSays(tree), "1 person selected");
    assert.equal(selectWord(tree), "Select all");
    click(byTestId(tree, "people-phone-select"));
    tree = draw();
    assert.equal(dockSays(tree), "2 people selected", "Select all takes everyone shown");
    assert.equal(selectWord(tree), "Cancel", "everyone picked, the word is the way out");
    click(byTestId(tree, "people-phone-select"));
    tree = draw();
    assert.equal(byTestId(tree, "bulk-bar"), null, "Cancel ends it");
    assert.equal(selectWord(tree), "Select", "and the word starts over");
    click(byTestId(tree, "people-phone-select"));
    rowOf(draw(), "p1").props.onClick();
    rowOf(draw(), "p1").props.onClick();
    tree = draw();
    assert.equal(dockSays(tree), "Select people", "the last one off, the mode stays until ✕");
    click(byTestId(tree, "bulk-clear"));
    tree = draw();
    assert.equal(byTestId(tree, "bulk-bar"), null, "✕ ends it");
    rowOf(tree, "p1").props.onClick();
    assert.equal(opened.at(-1), "p1", "and a tap opens again");
  }));

test("Esc ends a Select-people selection; a member who may neither edit nor export is not offered it", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1)] });
    let tree = draw();
    click(byTestId(tree, "people-phone-select"));
    assert.ok(byTestId(draw(), "bulk-bar"));
    assert.equal(press("Escape"), true, "the page takes the key");
    assert.equal(byTestId(draw(), "bulk-bar"), null, "and the mode ends");
    const me = globalThis.window.__ME;
    globalThis.window.__ME = { role: "viewer" };
    try {
      await freshPage({ people: [person(1)] });
      tree = draw();
      assert.equal(byTestId(tree, "people-phone-select"), null, "nothing a selection could become");
    } finally {
      globalThis.window.__ME = me;
    }
  }));

test("REGRESSION: on a phone a selection is one row in the tab bar's shape -- ✕, the count, then Add to list, Note and More as glyphs over words -- where a menu's chevron stood beside a bare ⋯", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1), person(2), person(3)], lists: [{ id: "s1", name: "Regulars", ids: [] }] });
    byTestId(rowOf(draw(), "p1"), "row-select").props.onChange();
    byTestId(rowOf(draw(), "p2"), "row-select").props.onChange();
    let tree = draw();
    const bar = byTestId(tree, "bulk-bar");
    assert.ok(hasClass(bar, "pp-bulk"), "the phone's row");
    assert.ok(hasClass(bar, "capsule") && bar.props["data-dock"] === true, "the kit's capsule, docked (mobile.css)");
    assert.equal(bar.props["aria-label"], "2 people selected", "the count is the dock's name");
    assert.deepEqual(
      dockActIds(bar),
      ["bulk-clear", "bulk-add-list", "bulk-note", "bulk-more"],
      "Clear first, then the acts",
    );
    assert.deepEqual(
      [...new Set(all(bar, (n) => hasClass(n, "pp-bulk-act")).map((n) => textOf(n).trim()))],
      ["Clear", "Add to list", "Note", "More"],
      "each says what it opens, as the tab bar's tabs do",
    );
    assert.equal(
      find(bar, (n) => n.type === Menu),
      null,
      "REGRESSION: Add to list was a menu with a chevron",
    );
    for (const id of ["bulk-form-note", "bulk-list-name", "bulk-note-line", "bulk-export"])
      assert.equal(byTestId(bar, id), null, `${id} is a sheet's, not the row's`);
    assert.equal(openSheet(tree, "bulk-sheet"), null, "the sheet waits for an act");
    // Add to list is a sheet of the lists kept by hand, then a new one.
    click(byTestId(bar, "bulk-add-list"));
    tree = draw();
    const sheet = openSheet(tree, "bulk-sheet");
    assert.equal(sheet.props.title, "Add to list");
    assert.deepEqual(sheetRows(sheet), ["bulk-list-s1", "bulk-list-new"]);
    assert.match(textOf(byTestId(sheet, "bulk-list-s1")), /Regulars/);
  }));

test("on a phone More opens the selection's sheet -- Messages and AI ›, Export, Delete… -- Note is the dock's own, and a step asks, acts, then shuts", () =>
  onPhone(async () => {
    const seen = await freshPage({ people: [person(1), person(2), person(3)] });
    let tree = bulkSheetOpen();
    let sheet = openSheet(tree, "bulk-sheet");
    assert.equal(sheet.props.title, "2 selected");
    // A yes on record and the receptionist's mode are one step, the person page's own group (Messages and AI):
    // the owner's modes are in it. Select all is the bar's at the top, the note up front in the dock; the deletes last.
    assert.deepEqual(sheetRows(sheet), ["bulk-messages", "bulk-export", "bulk-not-a-person", "bulk-delete"]);
    // A yes on a sign-up form: the step asks which forms, then records, then the sheet shuts.
    click(byTestId(sheet, "bulk-messages"));
    tree = draw();
    sheet = openSheet(tree, "bulk-sheet");
    assert.equal(sheet.props.title, "Messages and AI");
    // The yes to offers has its row too (in writing only, a sign-up form), and the receptionist's four modes after it.
    assert.deepEqual(sheetRows(sheet), [
      "bulk-yes-conversational-in_person",
      "bulk-yes-conversational-phone",
      "bulk-yes-conversational-form",
      "bulk-yes-marketing-form",
      "bulk-mode-auto",
      "bulk-mode-ask",
      "bulk-mode-never",
      "bulk-mode-inherit",
    ]);
    click(byTestId(sheet, "bulk-yes-conversational-form"));
    tree = draw();
    byTestId(tree, "bulk-form-note").props.onChange({ target: { value: "Saturday's slips" } });
    await toastAfter(() => byTestId(draw(), "bulk-form-save").props.onClick(), "the slips' yes");
    tree = draw();
    assert.deepEqual(wrote(seen).at(-1), [
      "PUT",
      "contacts/consent",
      { ids: ["p1", "p2"], consent: "opted_in", source: "form", note: "Saturday's slips" },
    ]);
    assert.equal(openSheet(tree, "bulk-sheet"), null, "the sheet shuts once it lands");
    assert.equal(dockSays(tree), "2 people selected", "the selection stays, as on a desktop");
    // A spoken yes is recorded at the tap.
    click(byTestId(tree, "bulk-more"));
    click(byTestId(draw(), "bulk-messages"));
    await toastAfter(() => click(byTestId(draw(), "bulk-yes-conversational-in_person")), "the spoken yes");
    assert.deepEqual(wrote(seen).at(-1), [
      "PUT",
      "contacts/consent",
      { ids: ["p1", "p2"], consent: "opted_in", source: "in_person" },
    ]);
    assert.equal(openSheet(draw(), "bulk-sheet"), null);
    // Note, from the dock: the note sheet for the selection (step-sheet.tsx, which writes the line through the batch door:
    // notes/step-sheet.test.mjs), asked with who is picked; once it says what it reached, the bar says it and clears.
    // The ask goes through the frame's door (sheets/doors.tsx), said once the frame's sheet listens: drawn here as
    // the frame draws it (surfaces/frame/shell-chrome.tsx).
    const asked = [];
    const hear = (e) => asked.push(e.detail);
    const frameSheet = () => {
      frames.begin();
      return globalThis.React.createElement(peoplePages.StepSheetHost, {});
    };
    globalThis.window.addEventListener("step:sheet", hear);
    frameSheet();
    click(byTestId(draw(), "bulk-note"));
    await until(() => (frameSheet(), asked.length > 0), "the note sheet asked for, once it listens");
    globalThis.window.removeEventListener("step:sheet", hear);
    assert.equal(openSheet(draw(), "bulk-sheet"), null, "the bar's own sheet stays shut: the note is the note sheet's");
    assert.deepEqual(
      asked.map((d) => [d.many, d.note]),
      [[["p1", "p2"], true]],
    );
    await toastAfter(() => asked[0].onDone({ done: 2, failed: 0, line: "Called about the move" }), "the note");
    assert.match(textOf(flashes.at(-1).msg), /Noted on 2 people: Called about the move/);
    assert.equal(byTestId(draw(), "bulk-bar"), null, "noted, the selection clears, as on a desktop");
  }));

test("on a phone Esc shuts the selection's sheet and keeps the selection; Back walks a step back; the bar's Select all picks everyone shown", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1), person(2), person(3)] });
    let tree = bulkSheetOpen();
    click(byTestId(tree, "bulk-messages"));
    tree = draw();
    openSheet(tree, "bulk-sheet").props.back.onBack();
    tree = draw();
    assert.ok(byTestId(openSheet(tree, "bulk-sheet"), "bulk-messages"), "back at More");
    assert.equal(openSheet(tree, "bulk-sheet").props.back, null, "More has no way back of its own");
    // The kit's sheet, open on the body: the page holds still behind it, and its Esc is its own (Base UI's), which asks.
    setOverlayOpen({ role: "dialog", inApp: false, className: "sheet" });
    assert.equal(press("j"), false, "the sheet holds the keys: J walks nothing behind it");
    assert.equal(press("Escape"), false, "its Esc is its own");
    setOverlayOpen(null);
    openSheet(tree, "bulk-sheet").props.onClose();
    tree = draw();
    assert.equal(openSheet(tree, "bulk-sheet"), null, "Esc shut the sheet");
    assert.equal(dockSays(tree), "2 people selected", "REGRESSION: and not the selection behind it");
    assert.equal(selectWord(tree), "Select all", "a selection begun on a face offers everyone too");
    click(byTestId(tree, "people-phone-select"));
    tree = draw();
    assert.equal(dockSays(tree), "3 people selected");
    assert.equal(selectWord(tree), "Cancel");
    assert.equal(press("Escape"), true);
    assert.equal(byTestId(draw(), "bulk-bar"), null, "and the next Esc clears the selection");
  }));

test("on a phone Add to list › New list names the list in the sheet, with its way back; a member who may only export gets Export alone", () =>
  onPhone(async () => {
    const seen = await freshPage({ people: [person(1), person(2)] });
    byTestId(rowOf(draw(), "p1"), "row-select").props.onChange();
    click(byTestId(draw(), "bulk-add-list"));
    click(byTestId(openSheet(draw(), "bulk-sheet"), "bulk-list-new"));
    let tree = draw();
    let sheet = openSheet(tree, "bulk-sheet");
    assert.equal(sheet.props.title, "New list", "the name is asked in the sheet, not in the row");
    sheet.props.back.onBack();
    assert.equal(openSheet(draw(), "bulk-sheet").props.title, "Add to list", "Back walks to the lists");
    click(byTestId(openSheet(draw(), "bulk-sheet"), "bulk-list-new"));
    tree = draw();
    byTestId(tree, "bulk-list-name").props.onChange({ target: { value: "Saturday" } });
    await toastAfter(() => byTestId(draw(), "bulk-list-save").props.onClick(), "the new list");
    assert.deepEqual(
      wrote(seen),
      [
        ["POST", "segments", { name: "Saturday" }],
        ["PUT", "segments/s1", { add: ["p1"] }],
      ],
      "the list is made by its name, then filled with the one selected",
    );
    tree = draw();
    assert.equal(openSheet(tree, "bulk-sheet"), null, "made, the sheet shuts");
    assert.match(textOf(flashes.at(-1).msg), /1 on the new list Saturday/);
    const me = globalThis.window.__ME;
    globalThis.window.__ME = { role: "viewer" };
    // No role may export and not edit (ROLE_PERMS: the file is the owner's, who may also edit), so the two answers the bar
    // asks apart are given apart here: this member may export, and may not edit.
    const restore = mayOnly((action) => action === "export");
    try {
      await freshPage({ people: [person(1), person(2)] });
      byTestId(rowOf(draw(), "p1"), "row-select").props.onChange();
      tree = draw();
      assert.deepEqual(
        dockActIds(byTestId(tree, "bulk-bar")),
        ["bulk-clear", "bulk-export"],
        "no list, note or More for a member who may not edit: Clear and the file alone, which needs no sheet",
      );
    } finally {
      globalThis.window.__ME = me;
      restore();
    }
  }));

test("REGRESSION: on a phone the Lists sheet starts with Everyone and draws no second People | Leads -- the switch was in the sheet and, beside the bar's, would be twice", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1), person(2)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
    draw({ initialSaved: "s1" });
    let tree = draw({ initialSaved: "s1" });
    click(byTestId(tree, "people-phone-lists"));
    tree = draw({ initialSaved: "s1" });
    const sheet = openSheet(tree, "people-lists-sheet");
    assert.equal(byTestId(sheet, "people-scope"), null, "one switch, the bar's");
    const everyone = byTestId(sheet, "rail-everyone");
    assert.match(textOf(everyone), /Everyone\s*2/, "Everyone, first, with everyone's count");
    assert.equal(everyone.props["aria-current"], undefined, "not current while a list is open");
    click(everyone);
    tree = draw({ initialSaved: "s1" });
    assert.equal(openSheet(tree, "people-lists-sheet"), null, "a pick closes the sheet");
    assert.equal(textOf(byTestId(tree, "people-phone-lists")).trim(), "Everyone");
    assert.equal(idsShown(tree).length, 2);
  }));

test("on a phone the face is the checkbox, and while anyone is selected a tap on a row selects them rather than opening them", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1), person(2)] });
    let tree = draw();
    byTestId(rowOf(tree, "p1"), "row-select").props.onChange();
    tree = draw();
    assert.match(rowOf(tree, "p1").props.className, /\bselected\b/);
    const before = opened.length;
    rowOf(tree, "p2").props.onClick();
    tree = draw();
    assert.equal(opened.length, before, "a tap while selecting does not open the person");
    assert.match(rowOf(tree, "p2").props.className, /\bselected\b/, "it selects them");
    const bar = byTestId(tree, "bulk-bar");
    assert.ok(bar, "the bar");
    assert.ok(byTestId(bar, "bulk-add-list"), "its acts open the kit's sheet, drawn on the body");
    click(byTestId(tree, "bulk-clear"));
    tree = draw();
    rowOf(tree, "p2").props.onClick();
    assert.equal(opened.at(-1), "p2", "cleared, a tap opens again");
  }));

test("on a phone the lists are behind the bar's list button, as a sheet; a pick closes it, and New list opens the box in it", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
    let tree = draw();
    assert.equal(openSheet(tree, "people-lists-sheet"), null, "closed until asked");
    click(byTestId(tree, "people-phone-lists"));
    tree = draw();
    const sheet = openSheet(tree, "people-lists-sheet");
    assert.ok(sheet, "the sheet");
    assert.ok(
      find(sheet, (n) => n.type === "aside" && n.props?.className === "cl-rail"),
      "the rail's own rows, in the sheet",
    );
    click(find(sheet, (n) => n.type === "button" && textOf(n).includes("Regulars")));
    tree = draw();
    assert.equal(openSheet(tree, "people-lists-sheet"), null, "a pick closes it");
    assert.equal(textOf(byTestId(tree, "people-phone-lists")).trim(), "Regulars", "and the bar names the list");
    // The shell's and a profile's New list is the address clients/new-list (nothing sends segments:new to People any more):
    // on a phone the sheet comes up with the box open from the first draw.
    await freshPage({ people: [person(1)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
    addressAt("clients/new-list");
    draw({ newList: true });
    tree = draw({ newList: true });
    assert.ok(byTestId(openSheet(tree, "people-lists-sheet"), "new-list-name"), "with the New list box open");
  }));

// Ruben, 24 Sep: the Lists sheet "looks too cluttered, takes most of the screen". On a phone it is compact: one level
// of heading (the groups), no paragraph about lists nobody kept, and a list with nobody in it said in its group's one
// quiet line rather than drawn as a row -- the one picked is drawn even when empty. A desktop's rail is unchanged.
test("on a phone the Lists sheet is compact: the groups name its blocks, an empty list is said in a line, and the one picked is drawn even when empty", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1), person(2)] });
    const lists = globalThis.window.__PEOPLE.lists;
    const empty = lists.filter((l) => l.count === 0);
    const full = lists.filter((l) => l.count > 0);
    assert.ok(empty.length > 0 && full.length > 0, "the fixture has lists of both kinds");
    const rowsIn = (tree) => [
      ...new Set(
        all(
          tree,
          (n) =>
            n.type === "button" &&
            String(n.props?.className || "")
              .split(" ")
              .includes("smart"),
        ),
      ),
    ];
    const sheetOf = (props = {}) => {
      let tree = draw(props);
      click(byTestId(tree, "people-phone-lists"));
      tree = draw(props);
      return openSheet(tree, "people-lists-sheet");
    };
    let sheet = sheetOf();
    assert.equal(
      find(sheet, (n) => n.props?.className === "cl-rail-label" && /Ready-made lists/.test(textOf(n))),
      null,
      "one level of heading: the groups",
    );
    assert.equal(
      find(sheet, (n) => n.props?.className === "cl-rail-hint"),
      null,
      "no paragraph about lists nobody kept",
    );
    assert.deepEqual(
      rowsIn(sheet)
        .map((b) => textOf(b.props.children))
        .sort(),
      full.map((l) => `${l.label}${l.count}`).sort(),
      "a row for each list with somebody in it",
    );
    const lines = [...new Set(all(sheet, (n) => n.props?.className === "cl-rail-empty"))];
    assert.equal(lines.length, 1, "one quiet line for the sheet, not one a group");
    const said = textOf(lines[0]);
    for (const l of empty)
      assert.match(said, new RegExp(l.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${l.label} is said`);
    assert.match(said, /^Empty now: /);
    // The one picked is drawn, empty or not.
    const picked = empty[0];
    sheet = sheetOf({ initialSegment: picked.id });
    const row = rowsIn(sheet).find((b) => b.props["aria-current"] === "true");
    assert.ok(row && textOf(row.props.children).startsWith(picked.label), "the picked list keeps its row");
    assert.doesNotMatch(
      all(sheet, (n) => n.props?.className === "cl-rail-empty")
        .map(textOf)
        .join(" "),
      new RegExp(`\\b${picked.label}\\b`),
      "and is not said twice",
    );
  }));

test("a desktop's rail keeps every list and its heading: compact is the phone's sheet", async () => {
  await freshPage({ people: [person(1), person(2)] });
  const tree = draw();
  const rows = [
    ...new Set(
      all(
        tree,
        (n) =>
          n.type === "button" &&
          String(n.props?.className || "")
            .split(" ")
            .includes("smart"),
      ),
    ),
  ];
  assert.equal(rows.length, globalThis.window.__PEOPLE.lists.length, "an empty list has its row on a desktop");
  assert.equal(
    find(tree, (n) => n.props?.className === "cl-rail-empty"),
    null,
  );
  assert.ok(find(tree, (n) => n.props?.className === "cl-rail-label" && /Ready-made lists/.test(textOf(n))));
});

// Decision 0009, phase 4: a list the address names that People doesn't have is said, never Everyone under its name.
test("a link to a list People doesn't have says so and shows nobody; an archived one says how it comes back", async () => {
  const seen = await freshPage({
    people: [person(1), person(2)],
    lists: [
      { id: "s1", name: "Regulars", ids: ["p1"] },
      { id: "s2", name: "VIP", ids: ["p2"], archived_at: "2026-09-20T12:00:00.000Z" },
    ],
  });
  const tableEmpty = (tree) => find(tree, (n) => n.props?.kind === "line" && typeof n.props?.title === "string");
  for (const props of [{ initialSaved: "cccccccc-1111-4111-8111-cccccccccccc" }, { initialSegment: "nope" }]) {
    // The address's list arrives through an effect, drawn on the next frame, as React would.
    draw(props);
    let tree = draw(props);
    assert.equal(textOf(byTestId(tree, "list-gone")), "This list isn't here", JSON.stringify(props));
    assert.equal(tableEmpty(tree).props.title, "This list isn't here", "the table says it too, over nobody");
    assert.ok(byTestId(tree, "show-everyone"), "and the way back to everyone is there");
    click(byTestId(tree, "show-everyone"));
    tree = draw(props);
    assert.equal(byTestId(tree, "list-gone"), null, "Show everyone leaves it");
  }
  // One of People's this workspace doesn't show (no calendar read here): can't be counted, not gone.
  draw({ initialSegment: "booked" });
  const hidden = draw({ initialSegment: "booked" });
  assert.equal(textOf(byTestId(hidden, "list-gone")), "Booked can't be counted here");
  assert.equal(tableEmpty(hidden).props.body, globalThis.window.__PEOPLE.hidden.find((h) => h.id === "booked").why);
  draw({ initialSaved: "s2" });
  const tree = draw({ initialSaved: "s2" });
  assert.equal(textOf(byTestId(tree, "list-gone")), "VIP is archived");
  const empty = tableEmpty(tree);
  assert.equal(empty.props.body, "It comes back from Archived under your lists.");
  assert.equal(empty.props.action.label, "Bring it back");
  await empty.props.action.onClick();
  assert.deepEqual(wrote(seen), [["PUT", "segments/s2", { archived: false }]]);
});

test("the list verbs: a rule changed through the route, the rule behind a view, and why a smart list has someone", async () => {
  const { lists: verbs } = await import("../../../apps/dashboard/src/surfaces/people/people-lists.ts");
  await freshPage({
    people: [person(1), person(2, { channels: ["sms"] })],
    lists: [{ id: "s2", name: "Texters", ids: [], rule: TEXTERS }],
  });
  // The rule behind a view: one of People's, one of the workspace's smart lists, the standing filter; none for the rest.
  assert.deepEqual(verbs.ruleOf({ builtin: "quiet" }), {
    v: 2,
    all: [{ field: "last_heard", op: "more_than", days: 30 }],
  });
  assert.deepEqual(verbs.ruleOf({ saved: "s2" }), { v: 2, ...TEXTERS });
  assert.deepEqual(verbs.ruleOf({ standing: "needs_you" }), {
    v: 2,
    all: [{ field: "standing", op: "is", value: "needs_you" }],
  });
  assert.equal(verbs.ruleOf({ standing: "quiet" }), null, "Quiet the state is not a rule the language says");
  assert.equal(verbs.ruleOf({}), null);
  // Why the smart list has them, in its rule's words; nobody it doesn't have is given a reason.
  assert.equal(verbs.why("s2", "p1"), "Reaches you by WhatsApp");
  assert.equal(verbs.why("s2", "nobody"), null);
  // A new rule goes to the list's own route, as a rule.
  const sent = [];
  const kept = globalThis.window.fetch;
  globalThis.window.fetch = async (url, init) => {
    sent.push([
      new URL(String(url), "https://app.chanlytics.com").pathname,
      init?.method,
      JSON.parse(init?.body || "null"),
    ]);
    return new Response(JSON.stringify({ ok: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const r = await verbs.setRule("s2", { v: 2, ...TEXTERS });
    assert.equal(r.ok, true);
    assert.deepEqual(sent, [["/api/v1/segments/s2", "PUT", { rule: { v: 2, ...TEXTERS } }]]);
  } finally {
    globalThis.window.fetch = kept;
  }
});

test("a smart list's rule is changed under its title: described, drafted into chips with who it holds today, then saved", async () => {
  const drafted = { name: "Texters", rule: { v: 2, all: [{ field: "calls", op: "at_least", n: 1 }] }, cannot: "" };
  // Both have called: the rule the words were drafted into holds for the two of them today (lists.count, over the rows read).
  const seen = await freshPage({
    people: [person(1, { call_count: 1 }), person(2, { call_count: 3, channels: ["sms"] })],
    lists: [{ id: "s2", name: "Texters", ids: [], rule: TEXTERS }],
    answer: ({ route }) => (route === "segments/draft" ? drafted : undefined),
  });
  draw({ initialSaved: "s2" });
  let tree = draw({ initialSaved: "s2" });
  assert.equal(byTestId(tree, "rule-edit"), null, "closed until asked");
  click(byTestId(tree, "list-rule-edit"));
  tree = draw({ initialSaved: "s2" });
  assert.match(textOf(byTestId(tree, "rule-edit-now")), /^Now: Reaches you by WhatsApp/);
  byTestId(tree, "rule-edit-words").props.onChange({ target: { value: "people who called" } });
  tree = draw({ initialSaved: "s2" });
  await byTestId(tree, "rule-edit-build").props.onClick();
  tree = draw({ initialSaved: "s2" });
  assert.equal(
    textOf(byTestId(tree, "rule-edit-rule")),
    listRuleParts(drafted.rule)[0],
    "the rule's parts, as contracts says them",
  );
  assert.equal(textOf(byTestId(tree, "rule-edit-holds")), "2 people on it today with this rule.");
  await byTestId(tree, "rule-edit-save").props.onClick();
  assert.deepEqual(wrote(seen), [
    ["POST", "segments/draft", { words: "people who called" }],
    ["PUT", "segments/s2", { rule: drafted.rule }],
  ]);
  assert.match(textOf(flashes.at(-1).msg), /^Who is on Texters changed/);
  tree = draw({ initialSaved: "s2" });
  assert.equal(byTestId(tree, "rule-edit"), null, "it closes once saved");
});

test("Save these keeps the rule behind the view by default -- a copy of one of People's lists -- or just the people shown", async () => {
  const seen = await freshPage({ people: [person(1)] });
  // The lists made, as [name, rule]: what the verb sent to the route that makes one.
  const made = () =>
    wrote(seen, (w) => w.method === "POST" && w.route === "segments").map(([, , body]) => [
      body.name,
      body.rule ?? null,
    ]);
  draw({ initialSegment: "opted_in" });
  let tree = draw({ initialSegment: "opted_in" });
  // Just these: the people shown, frozen, as a view no rule says always was.
  click(byTestId(tree, "save-shown"));
  tree = draw({ initialSegment: "opted_in" });
  assert.equal(byTestId(tree, "save-shown-rule").props["aria-checked"], true, "the rule, by default");
  assert.equal(byTestId(tree, "save-shown-name").props.value, "Said yes to messages");
  click(byTestId(tree, "save-shown-people"));
  tree = draw({ initialSegment: "opted_in" });
  byTestId(tree, "save-shown-name").props.onChange({ target: { value: "Frozen" } });
  tree = draw({ initialSegment: "opted_in" });
  await byTestId(tree, "save-shown-save").props.onClick();
  assert.deepEqual(made(), [["Frozen", null]]);
  assert.deepEqual(wrote(seen).at(-1), ["PUT", "segments/s1", { add: ["p1"] }], "and filled with the people shown");
  // The rule: a list that keeps itself current, opened once made.
  tree = draw({ initialSegment: "opted_in" });
  click(byTestId(tree, "save-shown"));
  tree = draw({ initialSegment: "opted_in" });
  byTestId(tree, "save-shown-name").props.onChange({ target: { value: "My yeses" } });
  tree = draw({ initialSegment: "opted_in" });
  await byTestId(tree, "save-shown-save").props.onClick();
  assert.deepEqual(made().at(-1), [
    "My yeses",
    { v: 2, all: [{ field: "said_yes", op: "is", to: "messages", yes: true }] },
  ]);
  assert.match(textOf(flashes.at(-1).msg), /^My yeses made\. It keeps itself current/);
  tree = draw({ initialSegment: "opted_in" });
  assert.equal(byTestId(tree, "list-gone"), null, "the list on its way is not called missing");
  // Once it has arrived it is a list like any other: gone again, it is said to be gone.
  globalThis.window.__PEOPLE.saved = [
    {
      id: "s2",
      name: "My yeses",
      count: 1,
      ids: ["p1"],
      members: ["p1"],
      byHand: false,
      rule: ["Said yes to messages"],
      spec: null,
      unknown: null,
      tip: "",
    },
  ];
  draw({ initialSegment: "opted_in" });
  draw({ initialSegment: "opted_in" });
  globalThis.window.__PEOPLE.saved = [];
  draw({ initialSegment: "opted_in" });
  tree = draw({ initialSegment: "opted_in" });
  assert.equal(
    textOf(byTestId(tree, "list-gone")),
    "This list isn't here",
    "REGRESSION: the made list's guard never cleared",
  );
});

test("on a phone a smart list's rule is shown and changed from the Lists sheet: the phone draws no title line", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1)], lists: [{ id: "s2", name: "Texters", ids: [], rule: TEXTERS }] });
    draw({ initialSaved: "s2" });
    let tree;
    const rule = listActsOf({ initialSaved: "s2" }).find((i) => i.label === "Who is on it");
    assert.ok(rule, "the Lists sheet offers it for a smart list");
    rule.onClick();
    tree = draw({ initialSaved: "s2" });
    const sheet = openSheet(tree, "list-act-sheet");
    assert.match(textOf(byTestId(sheet, "rule-edit-now")), /^Now: Reaches you by WhatsApp/);
  }));

test("a state address for Needs you or You have it opens the list, and any list open is pinned to Today and taken off", async () => {
  const seen = await freshPage({ people: [person(1)] });
  draw({ initialState: "waiting_on_you" });
  let tree = draw({ initialState: "waiting_on_you" });
  assert.equal(textOf(byTestId(tree, "smart-filter")), "You have it", "the list, not a hidden tab");
  assert.equal(byTestId(tree, "state-filter"), null);
  // The pin: this member's Today view, saved over the wire; the page says it, and the list's line says it is on Today.
  const saves = () => seen.viewSaves.map((s) => [s.page, s.view]);
  // The route's answer alone: the verb says the pin on the surface's copy itself, and puts it back on a refusal.
  let refused = false;
  seen.answer = ({ route }) =>
    refused && route === "views/today"
      ? json(422, { ok: false, error: { code: "invalid_input", message: "Could not keep it." } })
      : undefined;
  draw({ initialSegment: "opted_in" });
  tree = draw({ initialSegment: "opted_in" });
  assert.equal(textOf(byTestId(tree, "list-pin")).trim(), "Pin to Today");
  await byTestId(tree, "list-pin").props.onClick();
  assert.deepEqual(saves(), [["today", { pins: ["seg:opted_in"] }]]);
  assert.match(textOf(flashes.at(-1).msg), /^Said yes to messages is on Today/);
  tree = draw({ initialSegment: "opted_in" });
  assert.equal(textOf(byTestId(tree, "list-pin")).trim(), "On Today");
  assert.equal(byTestId(tree, "list-pin").props["aria-pressed"], true);
  await byTestId(tree, "list-pin").props.onClick();
  assert.deepEqual(saves().at(-1), ["today", { pins: [] }]);
  // Refused: the toast says so, and the list is not pinned after all.
  refused = true;
  tree = draw({ initialSegment: "opted_in" });
  await byTestId(tree, "list-pin").props.onClick();
  assert.equal(flashes.at(-1).tone, "danger");
  tree = draw({ initialSegment: "opted_in" });
  assert.equal(textOf(byTestId(tree, "list-pin")).trim(), "Pin to Today", "REGRESSION: a refused pin stayed on");
  // Views that could not be read are never saved over: that would wipe the pins not shown.
  refused = false;
  const before = saves().length;
  globalThis.window.__PEOPLE.viewsRead = false;
  tree = draw({ initialSegment: "opted_in" });
  await byTestId(tree, "list-pin").props.onClick();
  assert.equal(saves().length, before, "nothing saved");
  assert.match(textOf(flashes.at(-1).msg), /couldn't be read just now/);
});

test("export follows the list that is open, and is not offered for a list that can't be counted or isn't here", async () => {
  await freshPage({
    people: [person(1)],
    lists: [{ id: "s3", name: "Booked soon", ids: [], rule: { all: [{ field: "booked", op: "is", yes: true }] } }],
  });
  // Export is a quiet button in the controls row after Columns (file-acts.tsx; the ⋯ that folded it away is gone): the
  // link is the route's (the client's own url for GET contacts/export), opened in place, with its path and the list it is
  // asked for. Its tip is what the item's title was.
  const exportItem = () => byTestId(headAct(), "people-export");
  const opened = [];
  const open = globalThis.window.open;
  globalThis.window.open = (u) => opened.push(String(u));
  try {
    const linkOf = (item) => {
      item.props.onClick();
      const u = new URL(opened.at(-1), "https://app.chanlytics.com");
      return [u.pathname, u.searchParams.get("list")];
    };
    assert.equal(
      find(draw(), (n) => n.type === Menu && n.props.trigger?.props?.["data-testid"] === "people-file-menu"),
      null,
      "the ⋯ More menu is gone: Export stands as a word",
    );
    assert.equal(exportItem(draw()).props["data-tip"], "Download everyone as a CSV file");
    assert.deepEqual(linkOf(exportItem(draw())), ["/api/v1/contacts/export", null], "no list open: everyone");
    draw({ initialSegment: "opted_in" });
    const one = exportItem(draw({ initialSegment: "opted_in" }));
    assert.deepEqual(linkOf(one), ["/api/v1/contacts/export", "seg:opted_in"]);
    assert.equal(one.props["data-tip"], "Download the people on Said yes to messages as a CSV file");
    // A smart list that reads visits, with no calendar read: the route would refuse it, so the button says why and opens nothing.
    draw({ initialSaved: "s3" });
    const blocked = exportItem(draw({ initialSaved: "s3" }));
    assert.equal(blocked.props["data-tip"], globalThis.window.__PEOPLE.saved[0].unknown);
    const before = opened.length;
    const said = flashes.length;
    blocked.props.onClick();
    assert.equal(opened.length, before, "held: nothing opens");
    assert.equal(
      flashes.length,
      said + 1,
      "REGRESSION: pressing it did nothing at all, and the reason was only a hover title",
    );
    assert.equal(flashes.at(-1).msg, blocked.props["data-tip"], "and what it says is the reason, in contracts' words");
    // A list that is not here: the same, in the words of the empty page where it was (its title, then its body).
    draw({ initialSaved: "gone" });
    const gone = exportItem(draw({ initialSaved: "gone" }));
    gone.props.onClick();
    assert.equal(flashes.at(-1).msg, "This list isn't here. It was deleted, or the link is from another workspace.");
    assert.equal(opened.length, before, "and nothing opens");
    // Import is Add people's now (its sheet's second way in); a role that may not export has no file out, pressed:
    // the button stays, gated with the role's reason, and opens nothing.
    assert.equal(
      byTestId(draw(), "people-import"),
      null,
      "no Import word: the owner brings a list in through Add people",
    );
    const me = globalThis.window.__ME;
    globalThis.window.__ME = { role: "viewer" };
    try {
      draw();
      const denied = byTestId(headAct(), "people-export");
      assert.ok(denied, "Export stays, so the member sees it is held rather than missing");
      assert.equal(denied.props["data-gated"], "", "gated");
      assert.equal(typeof denied.props["data-tip"], "string", "with the role's reason as its tip");
      assert.notEqual(denied.props["data-tip"], "Download everyone as a CSV file");
      denied.props.onClick({ preventDefault() {}, stopPropagation() {} });
      assert.equal(opened.length, before, "and pressing it opens nothing");
    } finally {
      globalThis.window.__ME = me;
    }
  } finally {
    globalThis.window.open = open;
  }
});

test("the New list door's address stands until a list is made, then is that list's: a reload opens the list, not the box", async () => {
  const seen = await freshPage({ people: [person(1)] });
  seen.answer = ({ method, route, body }) =>
    method === "POST" && route === "segments" ? { id: "s9", name: body.name, ids: [] } : undefined;
  addressAt("clients/new-list");
  const tree = draw({ newList: true });
  assert.equal(routeNow(), "clients/new-list", "the box is what the address opened");
  await find(tree, (n) => typeof n.props?.onCreateList === "function").props.onCreateList("Regulars");
  globalThis.window.__PEOPLE.saved = [
    { id: "s9", name: "Regulars", count: 0, ids: [], members: [], byHand: true, tip: "" },
  ];
  draw({ newList: true });
  assert.equal(routeNow(), "clients/list:s9", "REGRESSION: clients/new-list stuck, and a reload opened the box again");
});

test("the Pipeline's address is the Pipeline's in every workspace: the list page, still mounted for the moment a move to it takes to draw, does not take it back", async () => {
  // Found on the real app (30 Sep 2026): pressing the Pipeline tab pushed /people/pipeline and this page replaced it with
  // /people in the same tick, so the Pipeline could not be reached by a press. Every workspace has the Pipeline (0008,
  // amended 18 Oct 2026), a deal on file or none.
  for (const hasDeals of [true, false]) {
    await freshPage({ people: [person(1)], hasDeals });
    addressAt("clients/pipeline");
    draw();
    assert.equal(
      routeNow(),
      "clients/pipeline",
      `REGRESSION: the list page replaced the Pipeline's address with its own (a deal on file: ${hasDeals})`,
    );
  }
});

test("every list's tip is the surface's, from contracts: a built-in's line, and a saved list's from what it is", async () => {
  await freshPage({
    people: [person(1)],
    lists: [
      { id: "s1", name: "Regulars", ids: ["p1"] },
      { id: "s2", name: "Texters", ids: [], rule: { all: [{ field: "channel", op: "is", channel: "whatsapp" }] } },
    ],
  });
  const P = globalThis.window.__PEOPLE;
  assert.ok(P.lists.length > 0 && P.lists.every((l) => typeof l.tip === "string" && l.tip.length > 10));
  assert.deepEqual(
    P.saved.map((l) => l.tip),
    ["A list kept by hand · add people from their profile", "Keeps itself current: Reaches you by WhatsApp"],
  );
  const tree = draw();
  const tips = all(tree, (n) => n.type === "button" && typeof n.props?.["data-tip"] === "string").map(
    (n) => n.props["data-tip"],
  );
  for (const l of [...P.lists, ...P.saved])
    assert.ok(tips.includes(l.tip), `${l.label || l.name}'s row carries its tip`);
});

test("on a phone an empty list of your own is said in the quiet line, and a sheet with none of its own draws no Saved over nothing", () =>
  onPhone(async () => {
    const sheetOf = () => {
      let tree = draw();
      click(byTestId(tree, "people-phone-lists"));
      tree = draw();
      return openSheet(tree, "people-lists-sheet");
    };
    await freshPage({
      people: [person(1)],
      lists: [
        { id: "s1", name: "Regulars", ids: ["p1"] },
        { id: "s2", name: "Walk-ins", ids: [] },
      ],
    });
    let saved = byTestId(sheetOf(), "saved-lists");
    const rows = all(saved, (n) => n.type === "button" && typeof n.props?.["data-tip"] === "string").map((n) =>
      textOf(n),
    );
    assert.ok(
      rows.some((t) => t.startsWith("Regulars")),
      "a list with somebody on it keeps its row",
    );
    assert.ok(!rows.some((t) => t.startsWith("Walk-ins")), "REGRESSION: an empty one kept a full row");
    assert.match(textOf(byTestId(saved, "saved-empty")), /^Empty now: Walk-ins/);
    // Still one tap from its own page, where an empty list is renamed, deleted and filled.
    click(byTestId(saved, "saved-empty-open"));
    const tree = draw();
    assert.equal(
      textOf(byTestId(tree, "people-phone-lists")).trim(),
      "Walk-ins",
      "REGRESSION: an empty list could not be opened",
    );
    await freshPage({ people: [person(1)], lists: [] });
    saved = byTestId(sheetOf(), "saved-lists");
    assert.equal(
      find(saved, (n) => n.props?.className === "cl-rail-label"),
      null,
      "REGRESSION: a Saved heading over nothing",
    );
  }));

test("a list's own route lands on People with that list picked -- Playbooks' list, an answer's jump and a kept address still arrive", async () => {
  await freshPage({ people: [person(1)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  const route = globalThis.window.__listRoute;
  assert.equal(route("s1"), "clients/list:s1", "a list kept by hand");
  assert.equal(route("needs_you"), "clients/seg:needs_you", "a smart list");
  // A list People doesn't have: its own address all the same, where People says so (decision 0009).
  assert.equal(route("gone"), "clients/seg:gone", "one of People's that isn't here");
  assert.equal(
    route("cccccccc-1111-4111-8111-cccccccccccc"),
    "clients/list:cccccccc-1111-4111-8111-cccccccccccc",
    "one of the workspace's own that isn't here",
  );
  assert.equal(route(null), "clients");
});

test("the Leads scope imports People's parts: the list page's hooks, the table and the rail kit are on no window, and only what the shell still draws by name is", () => {
  // Leads is TSX (surfaces/leads, decision 0015 step 9): it imports People's hooks, its phone bar and the rail's toggle, so
  // the names the JSX read them by are published no more, and what was published kept them in the shell's chunk.
  for (const name of [
    "usePeople",
    "usePlControls",
    "usePlPlace",
    "PeoplePhoneBar",
    "railToggle",
    "PeopleTable",
    "PhoneSheet",
  ])
    assert.equal(peoplePages[name], undefined, `${name} is imported, not published`);
  // The shell's strip reads People's scope words by name (surfaces/frame/surface-tabs.tsx stripPlace); it draws them from the page's chrome.
  for (const name of ["plScopes", "plScopeRoute"]) assert.equal(typeof peoplePages[name], "function", name);
  assert.equal(peoplePages.PeopleScopeTabs, undefined, "and the page's own copy of the strip is gone");
});

test("REGRESSION: on a list, the Offers column shows the answer about offers -- the Lists page showed the yes to messages under the Offers heading", async () => {
  await freshPage({
    people: [
      person(1, { marketing_consent: "unknown", marketing_consent_source: null, marketing_consent_updated_at: null }),
      person(2),
    ],
    // Offers waits in the Columns menu (off by default, 9 Oct 2026): the member has shown it.
    views: { people: { sortBy: "last", sortDir: "desc", columns: { offers: true } } },
  });
  const tree = draw({ initialSegment: "opted_in" });
  const offers = all(tree, (n) => n.props?.["data-testid"] === "row-offers")
    .map((td) => textOf(td).trim())
    .sort();
  assert.deepEqual(offers, ["Not asked", "Yes"], `the cells: ${offers}`);
});

test("a selection's yes on a sign-up form is recorded with the note that says which slips, and their own message is not offered for many", async () => {
  const seen = await freshPage({ people: [person(1), person(2)] });
  // What the batch doors were sent: the yes to messages about the visit (`visit`) and the yes to offers (`offers`), each by
  // its own route, with the people and the answer.
  const said = () =>
    wrote(seen).map(([method, route, { ids, ...body }]) => [
      { "contacts/consent": "visit", "contacts/marketing-consent": "offers" }[route] ?? `${method} ${route}`,
      [...ids].sort(),
      body,
    ]);
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  const menu = () => barMenuOf(draw(), "Messages");
  assert.deepEqual(
    menu().props.items.map((i) => i.header || i.label),
    [
      "Yes to messages…",
      "In person",
      "On the phone",
      "Sign-up form",
      "Yes to offers and news…",
      "Sign-up form",
      "AI for these people…",
      ...["auto", "ask", "never", "inherit"].map((m) => stateOf("mode", m).label),
    ],
    "their own message names one message, so a selection is not offered it; AI's mode is the same menu's",
  );
  await itemOf(menu(), "Sign-up form").onClick();
  tree = draw();
  assert.deepEqual(said(), [], "REGRESSION: thirty slips were recorded with nothing to say which");
  const note = byTestId(tree, "bulk-form-note");
  assert.ok(note, "the form asks which slips");
  assert.equal(byTestId(tree, "bulk-form-save").props.disabled, true, "and will not record without saying");
  note.props.onChange({ target: { value: "  slips from Saturday " } });
  tree = draw();
  await toastAfter(() => byTestId(tree, "bulk-form-save").props.onClick(), "the slips' yes");
  assert.deepEqual(said(), [
    ["visit", ["p1", "p2"], { consent: "opted_in", source: "form", note: "slips from Saturday" }],
  ]);
  tree = draw();
  assert.equal(byTestId(tree, "bulk-form-note"), null, "the step closes once it lands");

  // Offers, by Enter; and Escape leaves without a word sent.
  await menu()
    .props.items.filter((i) => i.label === "Sign-up form")[1]
    .onClick();
  tree = draw();
  byTestId(tree, "bulk-form-note").props.onChange({ target: { value: "offers slips" } });
  tree = draw();
  await toastAfter(() => byTestId(tree, "bulk-form-note").props.onKeyDown({ key: "Enter" }), "the offers' yes");
  assert.deepEqual(said().at(-1), [
    "offers",
    ["p1", "p2"],
    { consent: "opted_in", source: "form", note: "offers slips" },
  ]);
  await itemOf(menu(), "Sign-up form").onClick();
  tree = draw();
  byTestId(tree, "bulk-form-note").props.onKeyDown({ key: "Escape" });
  assert.equal(byTestId(draw(), "bulk-form-note"), null, "Escape closes the step");
  assert.equal(said().length, 2, "and sends nothing");

  // The spoken ways still record at once, with the source and nothing else.
  await toastAfter(() => itemOf(menu(), "In person").onClick(), "the spoken yes");
  assert.deepEqual(said().at(-1)[2], { consent: "opted_in", source: "in_person" });
});
