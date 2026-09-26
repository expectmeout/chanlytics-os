/**
 * Settings › Business, the page, EXECUTED on the stub React: the gap line, *Who you are* with each row
 * edited where it is stated, the tab's one saver, who may change it, and the two gestures every card draws its rows and
 * folds with (business-tab-gestures.jsx), tested through the rows and folds on the page. Each card's own tests are a
 * file of their own (business-tab-open.test.mjs); the page, the fixture and the presses are _business-tab-harness.mjs.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  stateOf,
  businessGap,
  roleGate,
  newReceptionistDefaults,
  PROFILE_CROSSING_WORDS,
  hasProfile,
  BOOKING_LINK_NEEDED,
} from "@chanlytics/contracts";
import {
  again,
  unmount,
  remount,
  settle,
  all,
  find,
  byTestId,
  textOf,
  classes,
  press,
  atWidth,
} from "./_legacy-react.mjs";
import {
  KNOWN,
  W,
  boxOf,
  cancelFoldOf,
  cancelRow,
  composePromptPreview,
  composed,
  dayOf,
  drawTab,
  escape,
  foldOf,
  inline,
  labelled,
  marisa,
  openFold,
  openFolds,
  openRows,
  ownWords,
  partsOf,
  redrawTab,
  saveFoldOf,
  saveRow,
  saving,
  settings,
  typeAt,
  typeInto,
  went,
  without,
} from "./_business-tab-harness.mjs";

/**
 * The card PaneWorkspace draws INSTEAD of the page for a workspace whose config holds no brain
 * (pages/business-tab-create.jsx). Its own tests are business-tab-create.test.mjs; it is here because who may press
 * its one act is the same question as who may press the page's, and the answer has to be one answer.
 */
const drawCreateCard = () => {
  W.__SETTINGS = { version: 1, config: {}, prompt: null };
  W.__FACTS = {
    facts: { voice_line: { value: null, source: "absent" }, handoff_number: { value: null, source: "absent" } },
    conflicts: [],
  };
  unmount();
  W.__recordFolds.reset();
  W.__businessTabSave.saver.reset();
  return W.React.createElement(W.BtCreateCard, { flash: () => {} });
};

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

/* ------------------------------------ the plan's seven ------------------------------------ */

test("a full record opens on its first card: no title, no stamp, no line restating the rows", () => {
  const tree = drawTab({ profile: marisa });
  assert.equal(businessGap(W.__SETTINGS.config.brain, null), null, "Marisa's record is missing nothing");
  assert.equal(byTestId(tree, "rec-gap"), null, "so nothing stands above the cards");
  assert.equal(
    find(tree, (n) => n.type === "h1"),
    null,
    "the crumb names the page, as every other pane's does",
  );
  assert.equal(
    find(tree, (n) => /both receptionists answer from|It can say|instead of a price/.test(ownWords(n))),
    null,
  );
});

test("a missing voice is named in the gap line, and the link opens its row", () => {
  const tree = drawTab({ profile: { ...marisa, tone: undefined } });
  const band = byTestId(tree, "rec-gap");
  assert.match(textOf(band), /no voice of its own/i);
  assert.ok(
    find(band, (n) => typeof n.props?.onClick === "function"),
    "the gap carries its own door",
  );
});

test("Who you are draws seven rows, in the spec's order", () => {
  const card = byTestId(drawTab({ profile: marisa }), "rec-card-who");
  const keys = all(card, (n) => classes(n).includes("rec-row-key")).map(textOf);
  assert.deepEqual(keys, [
    "Name",
    "Address",
    "Website",
    "Booking link",
    "Answers on",
    "Tells customers to call",
    "Transfer number",
  ]);
});

test("the Workspace row is gone, whatever the workspace is called", () => {
  const same = drawTab({ profile: marisa });
  assert.equal(byTestId(same, "rec-row-workspace"), null);
  W.__WORKSPACES = [{ id: "t-marisa", name: "Billing probe", timezone: "America/New_York" }];
  const different = redrawTab();
  assert.equal(byTestId(different, "rec-row-workspace"), null, "a second name for the business is not a row");
});

test("the line it answers is shown, never offered as a box", () => {
  const row = byTestId(drawTab({ profile: marisa }), "rec-row-voice_line");
  assert.equal(byTestId(row, "rec-row-act-voice_line"), null, "nothing here is typed");
  // The row itself is a press too (record-row.jsx: the whole row presses its act); the door is what is in it.
  const door = find(row, (n) => n !== row && typeof n.props?.onClick === "function");
  assert.ok(door, "one link to Connections");
  // Beyond the plan: the number as Setup writes it, where it came from, where the door goes, and what a screen reader
  // hears it called: where it goes and why, beginning with the word on it, since that word and the row's label
  // together ("Connections Answers on") say nothing.
  assert.match(textOf(row), /\+1 \(305\) 555-0123/);
  assert.match(textOf(row), /your line/);
  assert.equal(door.props["data-testid"], "rec-row-door-voice_line");
  assert.equal(door.props["aria-label"], "Connections, where the line it answers on is set up");
  assert.ok(
    door.props["aria-label"].startsWith(textOf(find(door, (n) => classes(n).includes("rec-row-act-words"))).trim()),
    "a person who says the word on it reaches it",
  );
  went.length = 0;
  press(door);
  assert.deepEqual(went, ["admin/integrations"]);
});

test("the carrier record is named once, at the foot", () => {
  // Changed from the plan's, which counted every node whose children were a string mentioning "Connections". The stub
  // hands every node an array of children, so that count was always 0; and the Answers-on row's own door says
  // Connections too, as the old FactRow's did. What it pins is that the carrier record -- the legal name and the
  // registered address -- is asked for on Connections and said once here, at the foot.
  const card = byTestId(drawTab({ profile: marisa }), "rec-card-who");
  const mentions = all(card, (n) => /legal name|registered address/i.test(ownWords(n)));
  assert.equal(mentions.length, 1, "asked once, said once");
  const foot = byTestId(card, "rec-who-foot");
  assert.match(textOf(foot), /legal name/i);
  const link = find(foot, (n) => typeof n.props?.onClick === "function");
  assert.equal(textOf(link), "Connections", "the foot's one link names where they are asked");
  went.length = 0;
  press(link);
  assert.deepEqual(went, ["admin/integrations"]);
});

test("a conflict sits on the row it is about, and there is no banner", () => {
  const conflict = {
    fact: "phone_display",
    severity: "serious",
    used: "+1 (212) 555-0142",
    known: "+1 (305) 555-0123",
    knownSource: "provisioned",
    sentence: "Your receptionist tells customers to call +1 (212) 555-0142, but it answers on +1 (305) 555-0123.",
    to: "admin/workspace",
  };
  const tree = drawTab({ profile: marisa, conflicts: [conflict] });
  assert.equal(byTestId(tree, "set-conflict-banner"), null, "the banner above the card is gone");
  const row = byTestId(tree, "rec-row-phone_display");
  assert.match(textOf(row), new RegExp(escape(conflict.sentence.slice(0, 40))));
  assert.equal(
    find(row, (n) => classes(n).includes("rec-src"))?.props?.["data-tone"],
    "warn",
    "and it wears warn, because a person settles it",
  );
});

/* ------------------------------------ the facts at rest ------------------------------------ */

test("the prompt's button is not on the page at rest", () => {
  // The prompt's own sheet arrives with Phase 5, and its button with it.
  assert.equal(
    find(drawTab(), (n) => /Read what it/.test(ownWords(n))),
    null,
  );
});

test("a fact that is not the owner's says where it came from; one they set says nothing", () => {
  // Resolved as the settings read resolves them (contracts resolveFacts), since what is said is the source it
  // reports: a typed value that agrees with Google's is reported as typed, and a typed fact says nothing at all --
  // "you set this" on the name, the website and the transfer number is three lines of a record spent on the default.
  let tree = drawTab({
    resolved: {
      ...KNOWN,
      listing: { name: "Marisa's Beauty Salon", address: "1200 Maple Ave, Brooklyn, NY 11208, USA" },
    },
  });
  const chipOf = (row) => {
    const said = find(byTestId(tree, row), (n) => classes(n).includes("rec-src"));
    return said ? textOf(said) : null;
  };
  assert.equal(chipOf("rec-row-name"), null, "typed, and agreeing with Google, is said nothing of");
  assert.equal(chipOf("rec-row-website"), null);
  assert.equal(chipOf("rec-row-voice_line"), stateOf("fact", "provisioned").label, "the line the platform provisioned");
  assert.equal(
    chipOf("rec-row-phone_display"),
    stateOf("fact", "provisioned").label,
    "no number typed: it gives out the line",
  );
  assert.equal(chipOf("rec-row-handoff_number"), null);
  assert.equal(
    textOf(tree).includes(stateOf("fact", "typed").label),
    false,
    "and the words for a typed fact are nowhere on the page",
  );
  assert.match(
    textOf(byTestId(tree, "rec-row-handoff_number")),
    /\+1 \(212\) 555-0142/,
    "written as people write it, never as it is stored",
  );
  assert.doesNotMatch(
    textOf(byTestId(tree, "rec-row-booking_link")),
    /Sent instead of confirming/,
    "a row that has its link states it and stops (24 Sep): what a link is for is an empty row's sentence",
  );
  // What only Google says is Google's: no address typed, and the one it lists.
  tree = drawTab({
    profile: without(marisa, "address"),
    resolved: { ...KNOWN, listing: { name: null, address: "1200 Maple Ave, Brooklyn, NY 11208, USA" } },
  });
  assert.equal(chipOf("rec-row-address"), stateOf("fact", "verified").label, "from Google");
  assert.match(textOf(byTestId(tree, "rec-row-address")), /1200 Maple Ave, Brooklyn, NY 11208, USA/);
});

test("an empty website says what empty means, and claims no page it cannot back", () => {
  const tree = drawTab({ profile: without(marisa, "website"), facts: { website: { value: null, source: "absent" } } });
  const row = byTestId(tree, "rec-row-website");
  assert.equal(row.props["data-empty"], "true");
  // Exactly what the composer does with an empty box: it writes no website line. Not that the receptionist has none to
  // give -- the owner's own words may name one -- and not the page we publish, which no receptionist is told and the
  // carriers are filed only from the business record's own website.
  assert.match(textOf(row), /Optional\. Left empty, the receptionist is given no website\./);
  assert.doesNotMatch(textOf(row), /\/b\/|no website to give/);
  assert.equal(textOf(byTestId(tree, "rec-row-act-website")), "Add one");
});

test("each act is named for what it acts on: its words and its row's label, or what the row holds where the label is a phrase", () => {
  const heard = (tree, row) => {
    const act = byTestId(tree, `rec-row-act-${row}`);
    return (
      act.props["aria-label"] ||
      act.props["aria-labelledby"]
        .split(" ")
        .map((id) => textOf(find(tree, (n) => n.props?.id === id)))
        .join(" ")
    );
  };
  let tree = drawTab();
  assert.deepEqual(
    ["name", "address", "booking_link", "phone_display", "handoff_number"].map((row) => heard(tree, row)),
    [
      "Change Name",
      "Change Address",
      "Change Booking link",
      // Not "Change Tells customers to call" and "Change Transfers a caller to", which say nothing.
      "Change the number customers are told to call",
      "Change the transfer number",
    ],
  );
  // Empty, the act's own words are "Add one", and the name keeps them.
  tree = drawTab({
    profile: without(without(marisa, "website"), "handoff_number"),
    facts: { website: { value: null, source: "absent" }, handoff_number: { value: null, source: "absent" } },
  });
  assert.deepEqual(
    [heard(tree, "website"), heard(tree, "handoff_number")],
    ["Add one Website", "Add one transfer number"],
  );
});

test("a workspace with no receptionist is PaneWorkspace's to draw: the page draws nothing, and nothing throws", () => {
  for (const s of [null, { version: 1, config: {} }, { version: 1, config: { brain: null } }]) {
    unmount();
    W.__SETTINGS = s;
    assert.equal(W.React.createElement(W.BusinessTab, { flash: () => {} }).rendered, null);
  }
});

/* ------------------------------------ one value, edited where it is stated ------------------------------------ */

test("an inline save sends the stored config with its one key changed, and everything else as it was", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "address");
  tree = redrawTab(flash);
  assert.deepEqual(openRows(tree), ["address"], "the row became its field");
  assert.equal(byTestId(tree, "rec-row-address"), null, "in the row's place");
  assert.equal(boxOf(tree, "address").props.value, marisa.address, "starting from what is stored");
  typeInto(tree, "address", "  10 Pier St, Brooklyn, NY 11201  ");
  tree = redrawTab(flash);
  saveRow(tree, "address");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].version, 7, "the version it read, for the compare-and-swap");
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: { ...stored.brain, profile: { ...stored.brain.profile, address: "10 Pier St, Brooklyn, NY 11201" } },
  });
  assert.equal(textOf(flashes.at(-1).msg), "Saved — the receptionist picks it up within a minute");
  assert.deepEqual(openRows(redrawTab(flash)), [], "accepted, the editor closes");

  // A key of the brain itself, beside the profile.
  tree = drawTab({ flash });
  openFold(tree, "booking_link");
  tree = redrawTab(flash);
  typeInto(tree, "booking_link", "https://book.example/marisa");
  tree = redrawTab(flash);
  saveRow(tree, "booking_link");
  assert.deepEqual(sent[1].config, {
    ...stored,
    brain: { ...stored.brain, booking_link: "https://book.example/marisa" },
  });
});

test("an emptied field deletes its key rather than storing an empty string", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "   ");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  assert.equal(sent.length, 1);
  assert.equal("website" in sent[0].config.brain.profile, false, "no website key at all, not an empty one");
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: { ...stored.brain, profile: without(stored.brain.profile, "website") },
  });

  // The transfer number: empty is a choice, a message instead of a transfer, and it is stored as nothing.
  tree = drawTab({ flash });
  openFold(tree, "handoff_number");
  tree = redrawTab(flash);
  typeInto(tree, "handoff_number", "");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  assert.deepEqual(sent[1].config, {
    ...stored,
    brain: { ...stored.brain, profile: without(stored.brain.profile, "handoff_number") },
  });
  assert.equal(textOf(flashes.at(-1).msg), "The receptionist takes a message instead of transferring.");
});

test("what stops a save is said under the box, before any round trip, and nothing is sent", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "marisasbeautysalon");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  tree = redrawTab(flash);
  const box = boxOf(tree, "website");
  assert.equal(box.props["aria-invalid"], true);
  const said = find(inline(tree, "website"), (n) => n.props?.id === box.props["aria-describedby"].split(" ")[0]);
  assert.equal(
    textOf(said),
    "The website needs to be a web address, like example.com.",
    "its sentence, named by the box",
  );
  assert.deepEqual([sent.length, flashes.length], [0, 0], "nothing sent, and nothing said in a toast");
  assert.deepEqual(openRows(tree), ["website"], "the editor stays open");
  assert.equal(box.props.value, "marisasbeautysalon", "with what was typed");
  typeInto(tree, "website", "https://marisasbeautysalon.example.com/home");
  tree = redrawTab(flash);
  assert.equal(boxOf(tree, "website").props["aria-invalid"], undefined, "typing again takes the sentence away");

  // The name is required, and says so under its own box.
  tree = drawTab({ flash });
  openFold(tree, "name");
  tree = redrawTab(flash);
  typeInto(tree, "name", "  ");
  tree = redrawTab(flash);
  saveRow(tree, "name");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "name")), /The receptionist needs a business name before it can answer anyone\./);
  // And so is the booking link, a full web address.
  tree = drawTab({ flash });
  openFold(tree, "booking_link");
  tree = redrawTab(flash);
  typeInto(tree, "booking_link", "booksy");
  tree = redrawTab(flash);
  saveRow(tree, "booking_link");
  tree = redrawTab(flash);
  assert.match(
    textOf(inline(tree, "booking_link")),
    /That booking link needs to be a web address, like booksy\.com\/your-page\./,
  );
  assert.equal(sent.length, 0);
  // The website and the booking link are stored as contracts' one normalizer stores an address: the https:// an owner
  // leaves off, supplied.
  typeInto(tree, "booking_link", "booksy.com/marisa");
  tree = redrawTab(flash);
  saveRow(tree, "booking_link");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.brain.booking_link, "https://booksy.com/marisa");
});

test("(D) a website typed without its https:// is stored with it, as contracts' normalizer stores an address", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  // The address it holds, typed as people type it, is no change: the two are one place.
  typeInto(tree, "website", " marisasbeautysalon.example.com ");
  tree = redrawTab();
  saveRow(tree, "website");
  assert.equal(sent.length, 0, "the address already stored, written without its https://, is no change");
  openFold(redrawTab(), "website");
  tree = redrawTab();
  typeInto(tree, "website", "marisas.example/salon");
  tree = redrawTab();
  assert.equal(boxOf(tree, "website").props["aria-invalid"], undefined);
  saveRow(tree, "website");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.brain.profile.website, "https://marisas.example/salon");
});

test("F2: the transfer number cannot be the number the business keeps and forwards -- said under the box, nothing sent", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  // The salon keeps (718) 555-0142 and forwards the calls nobody picks up to its receptionist.
  let tree = drawTab({ flash, facts: { kept_line: { value: "+17185550142", source: "provisioned" } } });
  openFold(tree, "handoff_number");
  tree = redrawTab(flash);
  typeInto(tree, "handoff_number", "+1 (718) 555-0142");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "handoff_number")), /a caller put through to it would come straight back/);
  assert.deepEqual([sent.length, flashes.length], [0, 0], "nothing sent, and nothing said in a toast");
  // A cell a person answers is still fine.
  typeInto(tree, "handoff_number", "+1 917 555 0100");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.brain.profile.handoff_number, "+19175550100");
});

test("F1: the number the business keeps, given out, says its missed calls reach the receptionist -- not that they never do", () => {
  const flash = () => {};
  // The salon keeps (718) 555-0142 and forwards the calls nobody picks up to its receptionist's line.
  let tree = drawTab({ flash, facts: { kept_line: { value: "+17185550142", source: "provisioned" } } });
  openFold(tree, "phone_display");
  tree = redrawTab(flash);
  press(all(byTestId(tree, "rec-inline-phone_display-choice"), (n) => n.props?.role === "radio")[1]);
  tree = redrawTab(flash);
  typeInto(tree, "phone_display", "+1 (718) 555-0142");
  tree = redrawTab(flash);
  assert.match(
    textOf(byTestId(tree, "rec-inline-phone_display-note")),
    /^Your own number\. The calls nobody picks up there go to your receptionist on \+1 \(305\) 555-0123\.$/,
  );
  typeInto(tree, "phone_display", "+1 (646) 555-0100");
  tree = redrawTab(flash);
  assert.match(
    textOf(byTestId(tree, "rec-inline-phone_display-note")),
    /will not reach your receptionist/,
    "any other number still does not reach it",
  );
});

test("Use Google's and Publish the line instead each send exactly their patch", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  // Facts resolved as the settings read resolves them: Google lists the salon at an address written another way.
  const google = "1200 Maple Ave, Brooklyn, NY 11208, USA";
  let tree = drawTab({
    flash,
    profile: { ...marisa, address: "1200 Maple Avenue" },
    resolved: { ...KNOWN, listing: { name: "Marisa's Beauty Salon", address: google } },
  });
  let stored = structuredClone(W.__SETTINGS.config);
  const address = byTestId(tree, "rec-row-address");
  const minor = W.__FACTS.conflicts.find((k) => k.fact === "address");
  assert.match(textOf(address), new RegExp(escape(minor.sentence)), "the resolver's own sentence, on the row");
  assert.equal(address.props["data-state"], undefined, "a minor disagreement leaves the row as it is");
  // The row's hidden editor keeps the disagreement to read, and not under the id the row's press is described by.
  assert.equal(all(tree, (n) => n.props?.id === "rec-row-address-other").length, 1, "one id, once on the page");
  assert.equal(
    find(address, (n) => n.type === "button" && /Keep/.test(textOf(n))),
    null,
    "nothing stores a choice to keep it, so nothing offers one",
  );
  press(find(address, (n) => n.type === "button" && textOf(n) === "Use Google's"));
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: { ...stored.brain, profile: { ...stored.brain.profile, address: google } },
  });

  // The published number is the transfer number: the serious one, as the live salon had it.
  tree = drawTab({ flash, brain: { phone_display: "(212) 555-0142" }, resolved: KNOWN });
  stored = structuredClone(W.__SETTINGS.config);
  const row = byTestId(tree, "rec-row-phone_display");
  assert.equal(row.props["data-state"], "warn", "the serious one washes its row");
  assert.match(textOf(row), /which is the number it transfers to/);
  assert.equal(
    find(row, (n) => n.type === "button" && /keep/i.test(textOf(n))),
    null,
  );
  press(find(row, (n) => n.type === "button" && textOf(n) === "Publish the line instead"));
  assert.deepEqual(
    sent[1].config,
    { ...stored, brain: without(stored.brain, "phone_display") },
    "the line it answers is what absent means",
  );
  assert.equal(textOf(flashes.at(-1).msg), "Customers are told to call your line.");
});

test("It will say: the lines of the prompt the draft changes, resolved as the edge resolves them, and what goes beside what comes", () => {
  let tree = drawTab();
  const stored = W.__SETTINGS.config.brain;
  openFold(tree, "website");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-says-website"), null, "nothing changed, nothing said");
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  const says = byTestId(tree, "rec-inline-says-website");
  // The one line it changes, from the bridge's own block for the draft, and none of the block around it; and beside
  // it the line as it stands, which goes. A line rewritten is one of each.
  const comes = composed("website", { ...stored, profile: { ...marisa, website: "https://marisas.example" } }).filter(
    (l) => l.includes("https://marisas.example"),
  );
  const goes = composed("website", stored).filter((l) => l.includes("https://marisasbeautysalon.example.com"));
  assert.deepEqual([comes.length, goes.length], [1, 1]);
  assert.deepEqual(partsOf(says), [
    ["It will say", comes[0]],
    ["It will no longer say", goes[0]],
  ]);
  assert.ok(
    boxOf(tree, "website").props["aria-describedby"].split(" ").includes(says.props.id),
    "and the box is described by it",
  );

  typeInto(tree, "website", "marisas");
  tree = redrawTab();
  assert.equal(
    byTestId(tree, "rec-inline-says-website"),
    null,
    "a draft the save refuses is never told to the receptionist",
  );

  typeInto(tree, "website", "");
  tree = redrawTab();
  assert.deepEqual(
    partsOf(byTestId(tree, "rec-inline-says-website")),
    [["It will no longer say", goes[0]]],
    "emptied, it says only what goes",
  );

  // The name rewrites the line the prompt opens with.
  tree = drawTab();
  openFold(tree, "name");
  tree = redrawTab();
  typeInto(tree, "name", "Marisa's Salon & Spa");
  tree = redrawTab();
  const opens = (name) => composed("business_name", { ...stored, business_name: name }).filter((l) => l.includes(name));
  assert.equal(opens("Marisa's Salon & Spa").length, 1);
  assert.deepEqual(partsOf(byTestId(tree, "rec-inline-says-name")), [
    ["It will say", opens("Marisa's Salon & Spa")[0]],
    ["It will no longer say", opens("Marisa's Beauty Salon")[0]],
  ]);

  // The transfer number's words are a call's, read on the phone: what a call is told once it is emptied, and what a
  // call is told today, which goes.
  tree = drawTab();
  openFold(tree, "handoff_number");
  tree = redrawTab();
  typeInto(tree, "handoff_number", "");
  tree = redrawTab();
  const call = composed("handoff_number", stored, "voice");
  const emptied = composed("handoff_number", { ...stored, profile: without(marisa, "handoff_number") }, "voice");
  assert.deepEqual(partsOf(byTestId(tree, "rec-inline-says-handoff_number")), [
    ["It will say", emptied.filter((l) => !call.includes(l)).join("\n")],
    ["It will no longer say", call.filter((l) => !emptied.includes(l)).join("\n")],
  ]);
  assert.deepEqual(
    [emptied.filter((l) => !call.includes(l)).length, call.filter((l) => !emptied.includes(l)).length],
    [1, 1],
    "one sentence for another: taking a message, for the transfer",
  );
  // And only where there is a line to call: a workspace that answers on WhatsApp alone is told no phone-call sentence.
  tree = drawTab({ facts: { voice_line: { value: null, source: "absent" } } });
  openFold(tree, "handoff_number");
  tree = redrawTab();
  typeInto(tree, "handoff_number", "");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-says-handoff_number"), null, "no line to call, nothing a call would be told");
});

test("It will say nothing for a draft the page refuses, even where the save's own schema would take it", () => {
  // "12345" is no number anyone can be reached on, and the row says so under its box. The save's schema holds a
  // published number to three characters or more, so the bridge alone would resolve a prompt that gives it out: what
  // keeps it from being shown as what the receptionist will say is the page's own check.
  let tree = drawTab();
  openFold(tree, "phone_display");
  tree = redrawTab();
  press(all(byTestId(tree, "rec-inline-phone_display-choice"), (n) => n.props?.role === "radio")[1]);
  tree = redrawTab();
  typeInto(tree, "phone_display", "12345");
  tree = redrawTab();
  const stored = W.__SETTINGS.config.brain;
  assert.ok(
    composed("phone_display", { ...stored, phone_display: "12345" }).some((l) => l.includes("12345")),
    "the bridge would tell it",
  );
  assert.equal(byTestId(tree, "rec-inline-says-phone_display"), null, "the page does not");
  // A number the check takes is shown the moment it is typed.
  typeInto(tree, "phone_display", "+1 (646) 555-0100");
  tree = redrawTab();
  const gives = composed("phone_display", { ...stored, phone_display: "+1 (646) 555-0100" }).filter((l) =>
    l.includes("+1 (646) 555-0100"),
  );
  assert.equal(gives.length, 1);
  assert.deepEqual(partsOf(byTestId(tree, "rec-inline-says-phone_display"))[0], ["It will say", gives[0]]);
});

test("a rename writes the product's opening lines again under the new name, and leaves an owner's own words alone", () => {
  const sent = saving();
  const was = "Marisa's Beauty Salon";
  const now = "Marisa's Salon & Spa";
  const baselineOf = (name) => newReceptionistDefaults(name).system_prompt;
  // The lines of a brain that name the business: the one the prompt opens with, and with `carried` the product's own
  // lines carried after it, each found by the name it holds.
  const naming = (brain, name, carried = false) =>
    [
      ...composed("business_name", brain).filter((l) => l.includes(name)),
      ...(carried ? composed("system_prompt", brain).filter((l) => l.includes(name)) : []),
    ].join("\n");
  const renamedIn = (tree) => partsOf(byTestId(tree, "rec-inline-says-name"));
  // What the product stores for every workspace it sets up, carried in the owner's place while their box is empty.
  let tree = drawTab({ brain: { system_prompt: baselineOf(was) } });
  let stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "name");
  tree = redrawTab();
  typeInto(tree, "name", now);
  tree = redrawTab();
  const next = { ...stored.brain, business_name: now, system_prompt: baselineOf(now) };
  assert.equal(naming(next, now, true).split("\n").length, 2);
  assert.deepEqual(
    renamedIn(tree),
    [
      ["It will say", naming(next, now, true)],
      ["It will no longer say", naming(stored.brain, was, true)],
    ],
    "both lines that change, the one the prompt opens with and the product's own lines carried after it, and the two they replace",
  );
  saveRow(tree, "name");
  assert.deepEqual(
    sent[0].config,
    { ...stored, brain: { ...stored.brain, business_name: now, system_prompt: baselineOf(now) } },
    "one patch: the name, and the lines that name it",
  );
  // What the receptionist is then told, resolved as the settings read resolves it, on either channel.
  const told = composePromptPreview(sent[0].config.brain, {
    tz: "America/New_York",
    policy: {},
    known: KNOWN,
    openings: null,
  });
  for (const channel of ["whatsapp", "voice"]) {
    assert.ok(told[channel].includes(now), channel);
    assert.ok(!told[channel].includes(was), `${channel}: the old name is nowhere in what it is told`);
  }

  // Google's name, taken in one press, is a rename like any other.
  tree = drawTab({
    brain: { system_prompt: baselineOf(was) },
    resolved: { ...KNOWN, listing: { name: now, address: null } },
  });
  stored = structuredClone(W.__SETTINGS.config);
  press(find(byTestId(tree, "rec-row-name"), (n) => n.type === "button" && textOf(n) === "Use Google's"));
  assert.deepEqual(sent[1].config, {
    ...stored,
    brain: { ...stored.brain, business_name: now, system_prompt: baselineOf(now) },
  });

  // A prompt the owner's workspace had before its fields is their own words: a rename leaves it as they wrote it.
  tree = drawTab();
  stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "name");
  tree = redrawTab();
  typeInto(tree, "name", now);
  tree = redrawTab();
  assert.deepEqual(renamedIn(tree), [
    ["It will say", naming({ ...stored.brain, business_name: now }, now)],
    ["It will no longer say", naming(stored.brain, was)],
  ]);
  saveRow(tree, "name");
  assert.deepEqual(sent[2].config, { ...stored, brain: { ...stored.brain, business_name: now } }, "the name alone");

  // Only the product's lines word for word, under the name stored beside them, are the product's to write again. The
  // owner's own sentences between its opening and its closing, or its lines under a name that is not the stored one,
  // are left as they are: a rename would have overwritten them.
  for (const prompt of [
    baselineOf(`${was}, a family salon since 1998. We never book walk-ins after 5pm`),
    baselineOf("Bella Nails & Spa"),
  ]) {
    tree = drawTab({ brain: { system_prompt: prompt } });
    stored = structuredClone(W.__SETTINGS.config);
    openFold(tree, "name");
    tree = redrawTab();
    typeInto(tree, "name", now);
    tree = redrawTab();
    assert.deepEqual(
      renamedIn(tree),
      [
        ["It will say", naming({ ...stored.brain, business_name: now }, now)],
        ["It will no longer say", naming(stored.brain, was)],
      ],
      prompt,
    );
    saveRow(tree, "name");
    assert.deepEqual(sent.at(-1).config, { ...stored, brain: { ...stored.brain, business_name: now } }, prompt);
  }
});

test("a save that crosses the resolver's line says so beside the lines it changes, and still goes", () => {
  const sent = saving();
  // A sparse record, as the reviewer's probe had it: the address is the one field the resolver composes from.
  const bare = {
    handoff_number: "+16465550100",
    booking_rules: { lead_hours: 2 },
    guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true },
  };
  const sparse = { ...bare, address: "12 Main St, Brooklyn, NY" };

  // Emptying it hands the receptionist its stored prompt: no identity block is left to show a line of, only the words.
  let tree = drawTab({ profile: sparse, resolved: KNOWN });
  openFold(tree, "address");
  tree = redrawTab();
  typeInto(tree, "address", "");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-inline-says-address-note")), PROFILE_CROSSING_WORDS.stops);
  saveRow(tree, "address");
  assert.equal(sent.length, 1, "not a refusal: the save still goes");
  assert.equal("address" in sent[0].config.brain.profile, false);

  // Typing the first starts composing, and the identity lines it starts with are shown beside the words.
  tree = drawTab({ profile: bare, resolved: KNOWN });
  openFold(tree, "address");
  tree = redrawTab();
  typeInto(tree, "address", "12 Main St, Brooklyn, NY");
  tree = redrawTab();
  const says = byTestId(tree, "rec-inline-says-address");
  assert.equal(textOf(byTestId(says, "rec-inline-says-address-note")), PROFILE_CROSSING_WORDS.starts);
  const next = { ...W.__SETTINGS.config.brain, profile: sparse };
  const identity = W.__businessTab
    .consequenceOf("address", next, "whatsapp")
    .text.split("\n")
    .filter((l) => l.trim());
  assert.equal(
    textOf(find(says, (n) => n.type === "pre")),
    identity.join("\n"),
    "every line of the block it starts with",
  );

  // A save that stays on its side of the line says nothing of it.
  tree = drawTab();
  openFold(tree, "address");
  tree = redrawTab();
  typeInto(tree, "address", "10 Pier St, Brooklyn, NY 11201");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-says-address-note"), null);
});

test("only one editor is open at a time: a clean one gives way, one holding changes asks first", () => {
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["website"]);
  openFold(tree, "address");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"], "the clean one gave way");
  assert.ok(byTestId(tree, "rec-row-website"), "and is its row again");

  typeInto(tree, "address", "10 Pier St");
  // Pressed at once, before the page has drawn again: the keystroke is already what the registry reads.
  openFold(tree, "name");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"], "one holding changes stays open until it is answered");
  assert.match(
    textOf(byTestId(tree, "rec-inline-address-ask-confirm")),
    /Discard your changes\?/,
    "and asks, beside its changes",
  );
  press(byTestId(tree, "rec-inline-address-ask-no"));
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"]);
  assert.equal(boxOf(tree, "address").props.value, "10 Pier St", "keep editing keeps what was typed");

  openFold(tree, "name");
  tree = redrawTab();
  press(byTestId(tree, "rec-inline-address-ask-yes"));
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["name"], "discarded, the row asked for opens");
  openFold(tree, "address");
  tree = redrawTab();
  assert.equal(
    boxOf(tree, "address").props.value,
    marisa.address,
    "and what was thrown away is gone: it opens on what is stored",
  );
});

test("Cancel with changes asks first; with none it closes at once; Escape is Cancel, and Ctrl or Cmd with Enter saves", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  cancelRow(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), [], "nothing changed, nothing asked");

  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  assert.equal(W.__settingsUnsaved(), true, "the Settings rail and the browser ask before this is thrown away");
  cancelRow(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["website"], "not thrown away yet");
  assert.match(textOf(byTestId(tree, "rec-inline-website-cancel-confirm")), /Discard your changes\?/);
  press(byTestId(tree, "rec-inline-website-cancel-no"));
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-website-cancel-confirm"), null);
  assert.equal(boxOf(tree, "website").props.value, "https://marisas.example");

  const key = (k, over = {}) => ({
    key: k,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    currentTarget: { contains: () => true },
    target: {},
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...over,
  });
  inline(tree, "website").props.onKeyDown(key("Escape"));
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-inline-website-cancel-confirm"), "Escape asks, as Cancel does");
  press(byTestId(tree, "rec-inline-website-cancel-yes"));
  tree = redrawTab();
  assert.deepEqual(openRows(tree), []);
  assert.equal(W.__settingsUnsaved(), false);
  assert.equal(sent.length, 0);

  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  inline(tree, "website").props.onKeyDown(key("Enter"));
  assert.equal(sent.length, 0, "Enter alone does not save");
  inline(tree, "website").props.onKeyDown(key("Enter", { ctrlKey: true }));
  assert.equal(sent.length, 1, "Ctrl or Cmd with Enter does");
});

test("answered with Keep editing, an ask gives focus back to the box, whichever ask it was", () => {
  // The stub attaches no ref, so the test stands in for the element React would have put there: the box, the one
  // thing in it Tab stops at.
  const focused = [];
  const box = {
    tabIndex: 0,
    disabled: false,
    value: "",
    getClientRects: () => [{}],
    classList: { contains: () => false },
    closest: () => null,
    focus: () => focused.push("box"),
    setSelectionRange() {},
  };
  const body = { querySelectorAll: () => [box] };
  const element = { querySelector: (sel) => (sel === ".rec-inline-body" ? body : null), contains: () => true };
  // The ask's "Yes, discard" takes focus as it is drawn (autoFocus), and leaves the page with the ask. The stub attaches
  // no elements, so the test says what took focus (the editor's onFocus) and what has left the document since.
  const yes = { closest: (sel) => (sel === ".confirm" || sel === ".rec-inline-body" ? {} : null) };
  const doc = globalThis.document;
  const was = { activeElement: doc.activeElement, contains: doc.contains };
  let asking = true;
  doc.contains = (el) => !(el === yes && !asking);
  try {
    let tree = drawTab();
    openFold(tree, "website");
    tree = redrawTab();
    inline(tree, "website").props.ref.current = element;
    inline(tree, "website").props.onFocus({ target: box });
    typeInto(tree, "website", "https://marisas.example");
    tree = redrawTab();

    // Cancel's own ask: "Yes, discard" had focus, and "Keep editing" takes the ask away.
    cancelRow(tree, "website");
    tree = redrawTab();
    inline(tree, "website").props.onFocus({ target: yes });
    press(byTestId(tree, "rec-inline-website-cancel-no"));
    asking = false;
    tree = redrawTab();
    assert.deepEqual(focused, ["box"], "back in the box, not at the top of the document");

    // The registry's ask, from another row's act: the same.
    openFold(tree, "name");
    asking = true;
    tree = redrawTab();
    inline(tree, "website").props.onFocus({ target: yes });
    press(byTestId(tree, "rec-inline-website-ask-no"));
    asking = false;
    tree = redrawTab();
    assert.deepEqual(focused, ["box", "box"]);
    assert.deepEqual(openRows(tree), ["website"]);

    // Typing takes Cancel's ask away too, with focus in the box being typed in: it is left there, its caret with it. The
    // refocus once fired whenever an ask went, so the caret jumped to the end after one keystroke.
    cancelRow(tree, "website");
    asking = true;
    tree = redrawTab();
    assert.ok(byTestId(tree, "rec-inline-website-cancel-confirm"));
    inline(tree, "website").props.onFocus({ target: box });
    doc.activeElement = box;
    typeInto(tree, "website", "https://marisas.example/h");
    asking = false;
    tree = redrawTab();
    assert.equal(byTestId(tree, "rec-inline-website-cancel-confirm"), null, "a keystroke is an answer: keep editing");
    assert.deepEqual(focused, ["box", "box"], "and focus that was never lost is not moved");
  } finally {
    Object.assign(doc, was);
    if (was.contains === undefined) delete doc.contains;
  }
});

test("a shift or a closed day that was just added is the row focus goes to, by the name the page gave it", () => {
  // After an Add, focus stayed on Add. The fold (the kit's useRecFocus) focuses the first box of the row the page
  // names; what the stub can see is the name handed over, and the row that carries it.
  let tree = drawTab();
  const focusOn = (id) => find(tree, (n) => n.type === W.RecordFold && n.props.id === id).props.focusOn;
  openFold(tree, "hours");
  tree = redrawTab();
  assert.equal(focusOn("hours"), null, "nothing added, nothing to go to");
  press(byTestId(tree, "rec-hours-add-tue"));
  tree = redrawTab();
  assert.deepEqual(focusOn("hours"), { row: "hours-tue-1" });
  const row = find(dayOf(tree, "tue"), (n) => n.props?.["data-rec-row"] === "hours-tue-1");
  assert.deepEqual(
    all(row, (n) => n.type === "input").map((n) => n.props["aria-label"]),
    ["Tuesday opens, second shift", "Tuesday closes, second shift"],
    "the new shift's own boxes",
  );
  // Closed, the name goes with the draft: a fold opened again does not jump to a row added last time.
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  press(byTestId(tree, "rec-fold-hours-cancel-yes"));
  tree = redrawTab();
  openFold(tree, "closures");
  tree = redrawTab();
  assert.equal(focusOn("hours"), null);
  press(byTestId(tree, "rec-closures-add"));
  tree = redrawTab();
  assert.deepEqual(focusOn("closures"), { row: "closure-0" });
  assert.equal(byTestId(tree, "rec-closure-0").props["data-rec-row"], "closure-0");
});

test("Save stays a button focus can rest on while it saves, and a press meanwhile sends nothing more", () => {
  const sent = [];
  let accept = null;
  W.__saveSettings = (config, version, accepted) => {
    sent.push(config);
    accept = accepted;
    return new Promise(() => {});
  };
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  saveRow(tree, "website");
  tree = redrawTab();
  const busy = byTestId(tree, "rec-inline-save-website");
  // Not `disabled`: a disabled button lets go of focus, to the page (record-fold.jsx).
  assert.deepEqual(
    [busy.props.disabled, busy.props["aria-disabled"], busy.props["aria-busy"], busy.props["aria-label"]],
    [undefined, true, true, "Saving…"],
  );
  saveRow(tree, "website");
  assert.equal(sent.length, 1);
  accept();
  assert.deepEqual(openRows(redrawTab()), [], "the moment the server accepts, the editor closes");
});

test("a save in progress is not an open, unsaved editor: its box takes no typing, and what is asked of it waits for the save's answer", async () => {
  // Task 3.2's review. The box stayed editable under "Saving…", and what was typed then was dropped without a word
  // when the save landed; another row's act still asked "Discard your changes?", and a yes stopped nothing.
  const sent = [];
  const flashes = [];
  const flash = (f) => flashes.push(f);
  W.__saveSettings = (config, version, accepted) =>
    new Promise((answer) => {
      sent.push({
        config: structuredClone(config),
        accept: () => accepted({ config: structuredClone(config), version: version + 1 }),
        answer,
      });
    });
  let tree = drawTab({ flash });
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab(flash);
  assert.equal(boxOf(tree, "website").props.readOnly, undefined, "the person's, until it is sent");
  saveRow(tree, "website");
  tree = redrawTab(flash);
  assert.equal(inline(tree, "website").props["aria-busy"], true, "the editor says it is busy");
  assert.equal(
    boxOf(tree, "website").props.readOnly,
    true,
    "and its box is read-only: never disabled, which lets go of focus",
  );
  assert.equal(boxOf(tree, "website").props.disabled, undefined);
  typeInto(tree, "website", "https://typed-while-saving.example");
  tree = redrawTab(flash);
  assert.equal(
    boxOf(tree, "website").props.value,
    "https://marisas.example",
    "what is on its way is what the box holds",
  );

  // Another row's act, and the gap line's door, which both ask the registry: no question is drawn over a change
  // that is on its way, the editor stays, and the rail is told a save is out, to ask in its own words.
  openFold(tree, "address");
  tree = redrawTab(flash);
  assert.deepEqual(openRows(tree), ["website"], "it does not give way while its save is out");
  assert.equal(
    byTestId(tree, "rec-inline-website-ask-confirm"),
    null,
    "and nothing asks whether to discard what is being saved",
  );
  assert.deepEqual([W.__settingsUnsaved(), W.__settingsSaving()], [true, true]);
  const unload = {
    type: "beforeunload",
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  W.dispatchEvent(unload);
  assert.equal(unload.prevented, true, "the browser asks before the tab goes with the request");

  // Taken: the editor closes, and the row that was asked for opens.
  sent[0].accept();
  tree = redrawTab(flash);
  assert.deepEqual(openRows(tree), ["address"], "the save's answer was the answer");
  assert.equal(
    sent[0].config.brain.profile.website,
    "https://marisas.example",
    "and what was sent is what was typed before Save",
  );
  assert.deepEqual([W.__settingsUnsaved(), W.__settingsSaving()], [false, false]);

  // Refused: the question is drawn then, and is true again; the box is the person's, with what was typed.
  tree = drawTab({ flash });
  sent.length = 0;
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  tree = redrawTab(flash);
  openFold(tree, "address");
  tree = redrawTab(flash);
  assert.equal(byTestId(tree, "rec-inline-website-ask-confirm"), null);
  sent[0].answer({
    ok: false,
    code: "conflict",
    message: "Someone else saved settings after you loaded them — reload and reapply.",
  });
  await settle();
  tree = redrawTab(flash);
  assert.deepEqual(openRows(tree), ["website"]);
  assert.match(
    textOf(byTestId(tree, "rec-inline-website-ask-confirm")),
    /Discard your changes\?/,
    "nothing was saved, so the ask is drawn, and says so truly",
  );
  assert.deepEqual(
    [boxOf(tree, "website").props.readOnly, boxOf(tree, "website").props.value],
    [undefined, "https://marisas.example"],
  );
  assert.equal(W.__settingsSaving(), false);

  // The choice of number is held the same way while its row saves.
  tree = drawTab({ flash, brain: { phone_display: "(646) 555-0100" }, resolved: KNOWN });
  sent.length = 0;
  openFold(tree, "phone_display");
  tree = redrawTab(flash);
  const choice = () => byTestId(tree, "rec-inline-phone_display-choice");
  press(find(choice(), (n) => n.props?.role === "radio" && textOf(n) === "Your line"));
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  tree = redrawTab(flash);
  const other = find(choice(), (n) => n.props?.role === "radio" && textOf(n) === "A different number");
  assert.equal(other.props["aria-disabled"], true);
  press(other);
  tree = redrawTab(flash);
  assert.equal(
    find(choice(), (n) => n.props?.role === "radio" && n.props["aria-checked"]).props.children.join(""),
    "Your line",
    "a press while it saves chooses nothing",
  );
});

/* ------------------------------------ the tab's one saver ------------------------------------ */

const google = "1200 Maple Ave, Brooklyn, NY 11208, USA";
/** A record Google lists at another address and under another name: two presses, one on each row. */
const disputed = () => ({
  profile: { ...marisa, address: "1200 Maple Avenue" },
  resolved: { ...KNOWN, listing: { name: "Marisa's Salon & Spa", address: google } },
});
const useOn = (tree, row) =>
  press(find(byTestId(tree, `rec-row-${row}`), (n) => n.type === "button" && textOf(n) === "Use Google's"));

test("two saves close together go one after the other, the second on the first's answer, and neither is refused", () => {
  // The reviewer's case: each row saved on the version the page last drew, so the second press sent version 7 again
  // and the server refused it as someone else's save.
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash, ...disputed() });
  useOn(tree, "address");
  tree = redrawTab(flash);
  useOn(tree, "name");
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8],
    "in order, each on the version before it",
  );
  assert.equal(sent[1].config.brain.profile.address, google, "the second carries the first's change");
  assert.equal(sent[1].config.brain.business_name, "Marisa's Salon & Spa");
  assert.deepEqual(
    flashes.map((f) => f.tone || "ok"),
    ["ok", "ok"],
    "neither is refused",
  );

  // Pressed again before the settings read brings the change back, the address press would write what is there now.
  tree = redrawTab(flash);
  useOn(tree, "address");
  assert.equal(sent.length, 2, "a patch that would change nothing is not sent");
});

test("a save made while another is out waits its turn, and its row says it is saving meanwhile", () => {
  const sent = [];
  const held = [];
  W.__saveSettings = (config, v, accepted) => {
    sent.push({ config: structuredClone(config), version: v });
    return new Promise(() => {
      held.push(() => accepted({ config: structuredClone(config), version: v + 1 }));
    });
  };
  let tree = drawTab(disputed());
  useOn(tree, "address");
  tree = redrawTab();
  useOn(tree, "name");
  tree = redrawTab();
  assert.equal(sent.length, 1, "the second waits while the first is out");
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  saveRow(tree, "website");
  tree = redrawTab();
  assert.equal(
    byTestId(tree, "rec-inline-save-website").props["aria-busy"],
    true,
    "a row whose save waits its turn says it is saving",
  );
  held[0]();
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8],
    "the first taken, the next goes on its answer",
  );
  held[1]();
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8, 9],
  );
  assert.equal(sent[2].config.brain.profile.website, "https://marisas.example");
  assert.equal(sent[2].config.brain.business_name, "Marisa's Salon & Spa", "every change before it, carried");
  assert.equal(sent[2].config.brain.profile.address, google);
});

test("a patch that edits a nested object in place is still sent, and the settings read keeps what the server holds", () => {
  // Task 3.2's review. A patch was handed shallow copies, so one that changed a nested object in place
  // (p.booking_rules.lead_hours = 5) changed the config it was compared with too: the saver found nothing to send, the
  // row closed as if saved, and the settings read showed a value no server held.
  const sent = saving();
  const flashes = [];
  drawTab();
  const stored = structuredClone(W.__SETTINGS.config);
  const inPlace = (b, p) => {
    p.booking_rules.lead_hours = 5;
    b.profile = p;
    return b;
  };
  let closed = 0;
  W.__businessTabSave.saver.save({
    row: "booking_rules",
    change: inPlace,
    said: "Saved",
    done: () => {
      closed += 1;
    },
    flash: (f) => flashes.push(f),
  });
  assert.equal(sent.length, 1, "sent, where it once compared equal to what it changed and nothing went");
  const rules = { ...stored.brain.profile.booking_rules, lead_hours: 5 };
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: { ...stored.brain, profile: { ...stored.brain.profile, booking_rules: rules } },
  });
  assert.deepEqual(W.__SETTINGS.config, stored, "and the read is what the server held, not the unsaved value");
  assert.deepEqual([closed, flashes.map((f) => f.tone || "ok")], [1, ["ok"]]);

  // What a row will say is worked out on the same copy (patched), so its preview leaves the read alone too.
  const next = W.__businessTabSave.patched(W.__SETTINGS.config, { change: inPlace });
  assert.equal(next.brain.profile.booking_rules.lead_hours, 5);
  assert.deepEqual(W.__SETTINGS.config, stored, "the config a patch is applied to is never the one it changes");
});

test("a page drawn again finds the tab's one saver: the answer to the last save, and a save still waiting its turn", () => {
  // Task 3.2's review (its Minor 7). Each page held a saver of its own, so leaving the tab and coming back before the
  // settings read brought a save back drew a new page with a new saver on the old read: the next save went out on
  // version 7 again, and the server refused it as someone else's.
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash, ...disputed() });
  useOn(tree, "address");
  assert.deepEqual(
    sent.map((s) => s.version),
    [7],
  );
  // Another Settings tab, and back: the page goes, and a new one is drawn over the same settings read.
  unmount();
  tree = W.React.createElement(W.BusinessTab, { flash });
  useOn(tree, "name");
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8],
    "on the answer the server gave the first, not the read before it",
  );
  assert.equal(sent[1].config.brain.profile.address, google, "carrying the first's change");
  assert.deepEqual(
    flashes.map((f) => f.tone || "ok"),
    ["ok", "ok"],
    "neither is refused",
  );

  // A save waiting its turn when the page goes is the new page's too: its row says so, and it goes when its turn comes.
  const held = [];
  W.__saveSettings = (config, v, accepted) => {
    sent.push({ config: structuredClone(config), version: v });
    return new Promise(() => {
      held.push(() => accepted({ config: structuredClone(config), version: v + 1 }));
    });
  };
  tree = drawTab(disputed());
  sent.length = 0;
  useOn(tree, "address");
  tree = redrawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  saveRow(tree, "website");
  assert.equal(sent.length, 1, "the website waits while the address is out");
  unmount();
  tree = W.React.createElement(W.BusinessTab, { flash: () => {} });
  assert.equal(
    byTestId(tree, "rec-inline-save-website").props["aria-busy"],
    true,
    "the new page's row says it is saving",
  );
  held[0]();
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8],
    "and it goes on the first's answer when the first is taken",
  );
  assert.equal(sent[1].config.brain.profile.website, "https://marisas.example");
});

/** Stand in for the bridge's PUT, holding each save until the test takes it (`accept`) or answers it (`answer`). */
const holding = () => {
  const sent = [];
  W.__saveSettings = (config, version, accepted) =>
    new Promise((answer) => {
      sent.push({
        config: structuredClone(config),
        version,
        accept: () => accepted({ config: structuredClone(config), version: version + 1 }),
        answer,
      });
    });
  return sent;
};

test("the saver's base is the config the next save goes on: the read, with each save out or waiting applied as if taken", async () => {
  const S = W.__businessTabSave;
  const sent = holding();
  drawTab();
  const read = W.__SETTINGS.config;
  const stored = structuredClone(read);
  assert.equal(S.saver.base(), read, "nothing out: what the settings read holds");
  const job = (row, change) => ({ row, change, said: "Saved", done: () => {}, flash: () => {} });
  S.saver.save(job("address", S.PATCH_OF.address("10 Pier St")));
  S.saver.save(job("website", S.PATCH_OF.website("")));
  assert.equal(sent.length, 1, "one out, one waiting");
  const both = S.saver.base();
  assert.equal(both.brain.profile.address, "10 Pier St", "the save out, as if taken");
  assert.equal("website" in both.brain.profile, false, "and the one waiting its turn after it");
  assert.equal(S.saver.base(), both, "the same config while nothing moves, so what a row will say is worked out once");
  assert.deepEqual(read, stored, "and the read is left as it was");

  // Refused, a save drops out of the base: the next goes on what the server holds.
  sent[0].answer({
    ok: false,
    code: "conflict",
    message: "Someone else saved settings after you loaded them — reload and reapply.",
  });
  await settle();
  assert.equal(sent.length, 2, "the website's turn");
  assert.equal(S.saver.base().brain.profile.address, stored.brain.profile.address, "the refused address is not in it");
  assert.equal("website" in S.saver.base().brain.profile, false);
  // Taken, the server's answer is the base, until a newer read.
  sent[1].accept();
  assert.equal(S.saver.base().brain.profile.address, stored.brain.profile.address);
  assert.equal("website" in S.saver.base().brain.profile, false, "the answer, before the re-read brings it back");
});

test("what a row will say is worked out on the brain its save goes on: a save still out, or taken and not read back", async () => {
  // Task 3.2's review, and its probe. What a row would say, and whether it crossed the resolver's line, were worked
  // out on the settings read, while the saver applies each patch to the config the saves before it leave. With the
  // website's save still out, emptying the address said nothing of the line it crossed, and its save, landing on a
  // record with no website, stopped the prompt composing.
  const bare = {
    handoff_number: "+16465550100",
    booking_rules: { lead_hours: 2 },
    guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true },
  };
  const sparse = { ...bare, website: "https://bella.example", address: "12 Main St, Brooklyn, NY" };
  assert.deepEqual(
    [hasProfile(sparse), hasProfile({ ...bare, address: sparse.address }), hasProfile(bare)],
    [true, true, false],
    "only the website and the address compose",
  );

  const empty = (tree, row) => {
    openFold(tree, row);
    tree = redrawTab();
    typeInto(tree, row, "");
    return redrawTab();
  };
  // Still out. The website's save goes through the tab's saver as its row sends it, with no editor of its own open: a
  // row whose save is out keeps every other row shut until its answer comes (a save in progress, below), so a save
  // out under another row's open editor is one sent from a page since drawn again, or by one press on a row.
  const S = W.__businessTabSave;
  const out = (row, value) =>
    S.saver.save({ row, change: S.PATCH_OF[row](value), said: "Saved", done: () => {}, flash: () => {} });
  let sent = holding();
  let tree = drawTab({ profile: sparse, resolved: KNOWN });
  tree = empty(tree, "website");
  assert.equal(
    byTestId(tree, "rec-inline-says-website-note"),
    null,
    "the address still composes: emptying the website crosses nothing",
  );
  cancelRow(tree, "website");
  tree = redrawTab();
  press(byTestId(tree, "rec-inline-website-cancel-yes"));
  out("website", "");
  assert.equal(sent.length, 1);
  tree = redrawTab();
  tree = empty(tree, "address");
  assert.equal(
    textOf(byTestId(tree, "rec-inline-says-address-note")),
    PROFILE_CROSSING_WORDS.stops,
    "said before the address's save goes",
  );
  saveRow(tree, "address");
  sent[0].accept();
  assert.equal(sent.length, 2);
  assert.equal(hasProfile(sent[1].config.brain.profile), false, "which is what its save did");

  // Taken, and not read back yet: the saver goes on the server's answer, and so does what the next row will say.
  sent = saving();
  tree = drawTab({ profile: sparse, resolved: KNOWN });
  tree = empty(tree, "website");
  saveRow(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), [], "taken: its editor closed");
  tree = empty(tree, "address");
  assert.equal(textOf(byTestId(tree, "rec-inline-says-address-note")), PROFILE_CROSSING_WORDS.stops);
  saveRow(tree, "address");
  assert.deepEqual(
    sent.map((s) => s.version),
    [7, 8],
  );
  assert.equal(hasProfile(sent[1].config.brain.profile), false);

  // And the other way: with the first field's save out, the second is not said to start what the first already has.
  holding();
  tree = drawTab({ profile: bare, resolved: KNOWN });
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://bella.example");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-inline-says-website-note")), PROFILE_CROSSING_WORDS.starts);
  cancelRow(tree, "website");
  tree = redrawTab();
  press(byTestId(tree, "rec-inline-website-cancel-yes"));
  out("website", "https://bella.example");
  tree = redrawTab();
  openFold(tree, "address");
  tree = redrawTab();
  typeInto(tree, "address", "12 Main St, Brooklyn, NY");
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-inline-says-address"), "it says the address line it adds");
  assert.equal(
    byTestId(tree, "rec-inline-says-address-note"),
    null,
    "and nothing of a line the website's save already crossed",
  );
  await settle();
});

test("a rename made on top of another is told against the name that one saves, and waits for it", () => {
  // The Name row's blocks, and the product's own lines it writes again, are read on the saver's base too: with Google's
  // name taken and not read back yet, a second rename replaces that name, not the one the page was drawn with. And
  // while Google's name is still out, the row's own save is: its editor opens, takes no typing, and its Save waits.
  const was = "Marisa's Beauty Salon";
  const google = "Marisa's Salon & Spa";
  const now = "Marisa's Studio";
  const baselineOf = (name) => newReceptionistDefaults(name).system_prompt;
  const naming = (brain, name) =>
    [
      ...composed("business_name", brain).filter((l) => l.includes(name)),
      ...composed("system_prompt", brain).filter((l) => l.includes(name)),
    ].join("\n");
  const sent = holding();
  let tree = drawTab({
    brain: { system_prompt: baselineOf(was) },
    resolved: { ...KNOWN, listing: { name: google, address: null } },
  });
  const stored = W.__SETTINGS.config.brain;
  press(find(byTestId(tree, "rec-row-name"), (n) => n.type === "button" && textOf(n) === "Use Google's"));
  assert.equal(sent.length, 1, "Google's name is out");
  tree = redrawTab();
  openFold(tree, "name");
  tree = redrawTab();
  assert.equal(
    byTestId(tree, "rec-inline-save-name").props["aria-busy"],
    true,
    "the row's own name is out, so its Save waits",
  );
  assert.equal(boxOf(tree, "name").props.readOnly, true, "and its box takes no typing meanwhile");
  typeInto(tree, "name", now);
  tree = redrawTab();
  assert.equal(
    boxOf(tree, "name").props.value,
    was,
    "nothing typed under a save that is out is held, to be dropped when it lands",
  );
  sent[0].accept();
  tree = redrawTab();
  assert.equal(boxOf(tree, "name").props.readOnly, undefined, "taken, the box is the person's again");
  typeInto(tree, "name", now);
  tree = redrawTab();
  const saving = { ...stored, business_name: google, system_prompt: baselineOf(google) };
  const after = { ...stored, business_name: now, system_prompt: baselineOf(now) };
  assert.equal(naming(after, now).split("\n").length, 2, "the line it opens with, and the product's lines");
  assert.deepEqual(partsOf(byTestId(tree, "rec-inline-says-name")), [
    ["It will say", naming(after, now)],
    ["It will no longer say", naming(saving, google)],
  ]);
  assert.equal(naming(stored, was).split("\n").length, 2);
  assert.doesNotMatch(
    textOf(byTestId(tree, "rec-inline-says-name")),
    new RegExp(escape(was)),
    "the name the page was drawn with is already going",
  );
  saveRow(tree, "name");
  assert.deepEqual(sent[1].config.brain, after, "and the save writes what it said");
});

test("a save the server refuses is said in its words, and the editor stays open with what was typed", async () => {
  const sent = [];
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const refusal = "Someone else saved settings after you loaded them — reload and reapply.";
  W.__saveSettings = (config, version) => {
    sent.push({ config, version });
    return Promise.resolve({ ok: false, code: "conflict", message: refusal });
  };
  let tree = drawTab({ flash });
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  await settle();
  tree = redrawTab(flash);
  assert.equal(sent.length, 1, "sent once");
  assert.deepEqual(openRows(tree), ["website"], "the editor is still open");
  assert.equal(boxOf(tree, "website").props.value, "https://marisas.example", "with its draft");
  assert.equal(byTestId(tree, "rec-inline-save-website").props["aria-busy"], undefined, "and Save is not busy");
  assert.deepEqual(
    [flashes.length, flashes[0].tone, textOf(flashes[0].msg)],
    [1, "danger", refusal],
    "the toast carries the server's words, and nothing said it was saved",
  );
});

test("a save whose promise fails before the server takes it says so, and leaves the row ready to try again", async () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  W.__saveSettings = () => Promise.reject(new Error("The network went away."));
  let tree = drawTab({ flash });
  openFold(tree, "website");
  tree = redrawTab(flash);
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab(flash);
  saveRow(tree, "website");
  await settle();
  tree = redrawTab(flash);
  const save = byTestId(tree, "rec-inline-save-website");
  assert.equal(save.props["aria-busy"], undefined, "not saving for good");
  assert.deepEqual(openRows(tree), ["website"], "still open");
  assert.equal(boxOf(tree, "website").props.value, "https://marisas.example", "with what was typed");
  assert.deepEqual([flashes.at(-1).tone, textOf(flashes.at(-1).msg)], ["danger", "The network went away."]);
  cancelRow(tree, "website");
  tree = redrawTab(flash);
  assert.ok(byTestId(tree, "rec-inline-website-cancel-confirm"), "and Cancel still asks, where it did nothing before");
});

test("the number it gives out: your line stores nothing, and a different number is checked, then stored as typed", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(W.__SETTINGS.config);
  assert.match(textOf(byTestId(tree, "rec-row-phone_display")), /\+1 \(305\) 555-0123/);
  openFold(tree, "phone_display");
  tree = redrawTab(flash);
  const radios = (t) => all(byTestId(t, "rec-inline-phone_display-choice"), (n) => n.props?.role === "radio");
  assert.deepEqual(
    radios(tree).map((r) => [textOf(r), r.props["aria-checked"]]),
    [
      ["Your line", true],
      ["A different number", false],
    ],
  );
  assert.match(
    textOf(byTestId(tree, "rec-inline-phone_display-note")),
    /\+1 \(305\) 555-0123 — the line your receptionist answers/,
  );
  press(radios(tree)[1]);
  tree = redrawTab(flash);
  assert.equal(
    boxOf(tree, "phone_display").props.value,
    "+1 (305) 555-0123",
    "a different number starts from the line, as people write it",
  );
  assert.match(textOf(byTestId(tree, "rec-inline-phone_display-note")), /That is your line/);
  typeInto(tree, "phone_display", "12345");
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "phone_display")), /short code/, "refused under its box");
  assert.equal(sent.length, 0);
  typeInto(tree, "phone_display", "+1 (646) 555-0100");
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  assert.deepEqual(sent[0].config, { ...stored, brain: { ...stored.brain, phone_display: "+1 (646) 555-0100" } });
  assert.equal(textOf(flashes.at(-1).msg), "Customers are told to call +1 (646) 555-0100 now.");

  // With no line of its own there is no choice, and the box is the only answer: what is typed is what it gives out.
  // The row this ports sent nothing here, because it read "your line" as chosen where there was no line to choose.
  const none = { value: null, source: "absent" };
  tree = drawTab({ flash, facts: { voice_line: none, phone_display: none } });
  openFold(tree, "phone_display");
  tree = redrawTab(flash);
  assert.equal(byTestId(tree, "rec-inline-phone_display-choice"), null, "no line, no choice");
  saveRow(tree, "phone_display");
  tree = redrawTab(flash);
  assert.match(
    textOf(inline(tree, "phone_display")),
    /There is no line yet, so the receptionist needs a number to give out\./,
  );
  typeInto(tree, "phone_display", "(646) 555-0100");
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  assert.equal(sent.at(-1).config.brain.phone_display, "(646) 555-0100");

  // A number typed before, put back to the line: the key goes, and the line is what it gives out from then on.
  tree = drawTab({ flash, brain: { phone_display: "(646) 555-0100" } });
  const typed = structuredClone(W.__SETTINGS.config);
  openFold(tree, "phone_display");
  tree = redrawTab(flash);
  assert.equal(radios(tree)[1].props["aria-checked"], true, "a typed number opens on its own choice");
  press(radios(tree)[0]);
  tree = redrawTab(flash);
  saveRow(tree, "phone_display");
  assert.deepEqual(sent.at(-1).config, { ...typed, brain: without(typed.brain, "phone_display") });
  assert.equal(textOf(flashes.at(-1).msg), "Customers are told to call your line.");
});

test("an editor whose page goes away lets go of the registry, and one that comes straight back holds on", async () => {
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  redrawTab();
  // React's StrictMode check, which the app runs in development: every effect cleaned up and run again at once.
  remount(() => W.React.createElement(W.BusinessTab, { flash: () => {} }));
  await settle();
  assert.equal(W.__recordFolds.open(), "website", "a row that comes straight back is not gone");
  assert.equal(W.__settingsUnsaved(), true, "and still answers the rail for what was typed");
  // The rail's "Yes, leave" replaces the pane, and the page with it. Left open, the row's dirty test would go on
  // answering, and the rail would ask on every tab and the browser before every reload.
  unmount();
  await settle();
  assert.equal(W.__recordFolds.open(), null);
  assert.equal(W.__settingsUnsaved(), false);
});

test("the transfer number starts from the number as it is shown, is checked under its box, and is stored as E.164", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "handoff_number");
  tree = redrawTab(flash);
  assert.equal(
    boxOf(tree, "handoff_number").props.value,
    "+1 (212) 555-0142",
    "a change starts from the number as it is shown",
  );
  typeInto(tree, "handoff_number", "646 555 0199");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "handoff_number")), /needs the country code/);
  typeInto(tree, "handoff_number", "+1 (305) 555-0123");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  tree = redrawTab(flash);
  assert.match(textOf(inline(tree, "handoff_number")), /the receptionist's own line/, "never the line it answers on");
  assert.equal(sent.length, 0);
  typeInto(tree, "handoff_number", "+1 (646) 555-0199");
  tree = redrawTab(flash);
  saveRow(tree, "handoff_number");
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: { ...stored.brain, profile: { ...stored.brain.profile, handoff_number: "+16465550199" } },
  });
  assert.equal(textOf(flashes.at(-1).msg), "Callers who insist on a person reach +1 (646) 555-0199.");
});

/* ------------------------------------ who may change it ------------------------------------ */

test("every act of the record is a PUT the settings door refuses, and none asks a different door", () => {
  // PUT /settings is owner-only. A card that gated on some OTHER permission would be offered to a role that cannot
  // save, and refused at the round trip -- which is what the form did before it was made owner-only, opening on the
  // autonomy gate. The viewer test below cannot see that: it refuses every permission at once, so a card asking the
  // wrong one is refused too, by luck. These two roles tell them apart.
  const was = W.ST_STORE;
  try {
    // An operator, who may change the autonomy matrix (PUT /policies) and NOT the business.
    W.ST_STORE = { can: (perm) => perm === "autonomy", myRole: () => "operator" };
    let tree = drawTab();
    assert.deepEqual(
      all(tree, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || "")),
      [],
      "no row offers a change",
    );
    assert.equal(byTestId(tree, "rec-gap-door"), null, "and the gap line opens nothing");
    const why = roleGate("operator", "settings", "change the business").reason;
    assert.match(
      textOf(byTestId(tree, "bt-viewer")),
      new RegExp(escape(why)),
      "the page says why once, in the settings door's words",
    );
    // The card a workspace with no receptionist sees keeps its primary act, shown and refused -- so it is the one
    // place a wrong permission would show as a live button. It must be refused, and in the SAME words.
    const empty = drawCreateCard();
    const act = byTestId(empty, "rec-create-open");
    assert.equal(act.props["aria-disabled"], true, "REGRESSION: the act asked a door this role may open");
    assert.equal(act.props["aria-description"], roleGate("operator", "settings", "set up the receptionist").reason);

    // And an operator who may change the business and nothing else is offered all of it, refused nowhere: every act
    // asks "settings", so widening that one permission widens exactly these controls.
    W.ST_STORE = { can: (perm) => perm === "settings", myRole: () => "operator" };
    tree = drawTab();
    const acts = all(tree, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || ""));
    assert.ok(acts.length > 6, "the rows offer their changes");
    assert.deepEqual(
      acts.filter((a) => a.props["aria-disabled"]).map((a) => a.props["data-testid"]),
      [],
      "and none of them is refused",
    );
    assert.equal(byTestId(drawCreateCard(), "rec-create-open").props["aria-disabled"], undefined);
  } finally {
    if (was) W.ST_STORE = was;
    else delete W.ST_STORE;
  }
});

test("a viewer reads everything, is offered no act, and is told why once", () => {
  // data-bits' real gate, over contracts' role table (roleGate): the role is the store's.
  W.ST_STORE = { can: (perm) => perm !== "settings", myRole: () => "viewer" };
  try {
    const sent = saving();
    const google = "1200 Maple Ave, Brooklyn, NY 11208, USA";
    const tree = drawTab({
      profile: { ...marisa, tone: undefined, address: "1200 Maple Avenue" },
      resolved: { ...KNOWN, listing: { name: "Marisa's Beauty Salon", address: google } },
    });
    assert.deepEqual(
      all(tree, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || "")),
      [],
      "no row offers a change",
    );
    const why = roleGate("viewer", "settings", "change the business").reason;
    assert.equal(all(tree, (n) => ownWords(n).includes(why)).length, 1, "the reason is said once");
    assert.match(textOf(byTestId(tree, "bt-viewer")), /You can read everything\./);
    assert.match(textOf(byTestId(tree, "rec-row-name")), /Marisa's Beauty Salon/, "and everything is there to read");

    const band = byTestId(tree, "rec-gap");
    assert.match(textOf(band), /no voice of its own/i, "the gap is still named");
    assert.equal(
      find(band, (n) => typeof n.props?.onClick === "function"),
      null,
      "with no door to a row that would not open",
    );

    // A disagreement is still there to read, and, like each row's act, its press is absent rather than refused: the
    // States board's "Each row's act is simply absent".
    const address = byTestId(tree, "rec-row-address");
    const minor = W.__FACTS.conflicts.find((k) => k.fact === "address");
    assert.match(textOf(address), new RegExp(escape(minor.sentence)), "the resolver's own sentence, on the row");
    assert.equal(find(address, (n) => classes(n).includes("rec-src"))?.props?.["data-tone"], "warn");
    assert.equal(
      find(address, (n) => n.type === "button" && classes(n).includes("btn")),
      null,
      "and no press, not even a refused one",
    );
    // The serious one too: its row still washes warn, and still offers nothing.
    const serious = drawTab({ brain: { phone_display: "(212) 555-0142" }, resolved: KNOWN });
    const published = byTestId(serious, "rec-row-phone_display");
    assert.equal(published.props["data-state"], "warn");
    assert.match(textOf(published), /which is the number it transfers to/);
    assert.equal(
      find(published, (n) => n.type === "button"),
      null,
    );
    assert.equal(sent.length, 0);
    // And nothing opens an editor for it.
    W.__recordFolds.request("website");
    assert.deepEqual(openRows(redrawTab()), []);
  } finally {
    delete W.ST_STORE;
  }
});

test("a name the workspace goes by is shown against the business's, and never offered in its place", () => {
  // Resolved as the settings read resolves it: no Google listing, and a workspace named in a Stripe test.
  const tree = drawTab({ resolved: { ...KNOWN, workspace: { name: "Billing probe", timezone: "America/New_York" } } });
  const row = byTestId(tree, "rec-row-name");
  const conflict = W.__FACTS.conflicts.find((k) => k.fact === "business_name");
  assert.equal(conflict.knownSource, "workspace", "the fixture is the workspace's own name");
  assert.match(
    textOf(row),
    /this workspace is named Billing probe/,
    "the disagreement is on the row, in the resolver's words",
  );
  assert.equal(
    find(row, (n) => n.type === "button" && classes(n).includes("btn")),
    null,
    "with no press that would rename the business to it",
  );
  assert.equal(
    textOf(byTestId(tree, "rec-row-act-name")),
    "Change",
    "the name is still changed the one way, by typing it",
  );

  // Google's answer is a fill: one press takes it.
  const listed = drawTab({ resolved: { ...KNOWN, listing: { name: "Marisa's Salon & Spa", address: null } } });
  assert.ok(find(byTestId(listed, "rec-row-name"), (n) => n.type === "button" && textOf(n) === "Use Google's"));
});

/* ------------------------------------ the gap line's door ------------------------------------ */

test("the gap line's door opens the row it names, and that row asks before its changes go like any other", () => {
  let tree = drawTab({ profile: without(marisa, "address"), facts: { address: { value: null, source: "absent" } } });
  const gap = businessGap(W.__SETTINGS.config.brain, null);
  assert.equal(gap.row, "address");
  const door = byTestId(byTestId(tree, "rec-gap"), "rec-gap-door");
  assert.equal(textOf(door), gap.sentence, "the gap's own words are its door");
  // And a screen reader hears where it goes, not only a statement: the sentence, then the act of the row it opens.
  const heard = (b) =>
    b.props["aria-labelledby"]
      .split(" ")
      .map((id) => find(tree, (n) => n.props?.id === id))
      .filter(Boolean)
      .map(textOf)
      .join(" ");
  assert.equal(heard(door), `${gap.sentence} Add one Address`);
  press(door);
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"]);
  typeInto(tree, "address", "1200 Maple Ave, Brooklyn, NY 11208");
  tree = redrawTab();
  // The door knows only the row's id. What it opened is guarded as the row's own act would have guarded it, by the
  // row's own dirty test: the Settings rail asks, the browser asks, and another row's act waits on an answer.
  assert.equal(W.__settingsUnsaved(), true, "the rail asks before the pane goes");
  const unload = {
    type: "beforeunload",
    returnValue: undefined,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  W.dispatchEvent(unload);
  assert.equal(unload.prevented, true, "the browser asks before the tab closes");
  openFold(tree, "website");
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["address"], "another row's act does not throw the changes away");
  assert.ok(byTestId(tree, "rec-inline-address-ask-confirm"), "it asks first, beside them");
  assert.equal(boxOf(tree, "address").props.value, "1200 Maple Ave, Brooklyn, NY 11208");

  // A fold is opened the same way: the voice's gap opens How it answers' voice fold, and its door is heard with that
  // row's act and label (business-tab-answers.test.mjs holds the fold it opens).
  tree = drawTab({ profile: { ...marisa, tone: undefined } });
  const toTone = byTestId(byTestId(tree, "rec-gap"), "rec-gap-door");
  assert.equal(heard(toTone), `${businessGap(W.__SETTINGS.config.brain, null).sentence} Give it one Its voice`);
  press(toTone);
  assert.equal(W.__recordFolds.open(), "tone");
  assert.deepEqual(openFolds(redrawTab()), ["tone"]);
});

test("nothing a fold works out as it draws can take the page down: a draft its helpers throw on draws no block, and Save says so and sends nothing", () => {
  // The quality review's probe. BtFold works out what it will say DURING RENDER, and the folds' helpers throw on a draft
  // they were not written for (btWhole's TypeError for a switch left out, which the rules fold of Task 3.5 can meet
  // through one slip in its body). In the app a throw while drawing is the shell's error boundary's: the whole of
  // Settings is replaced. The fold loses its block; the page stays.
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const logged = [];
  const was = console.error;
  console.error = (...args) => logged.push(args);
  try {
    drawTab();
    unmount();
    let handed = null;
    const draw = () =>
      W.React.createElement(W.BtFold, {
        id: "guardrails",
        label: "Rules it always keeps",
        saver: W.__businessTabSave.saver,
        canEdit: true,
        flash,
        row: { value: "Four rules" },
        body: (f) => {
          handed = f;
          return null;
        },
      });
    let tree = draw();
    press(byTestId(tree, "rec-row-act-guardrails"));
    tree = again(draw);
    assert.equal(handed.open, true);
    assert.ok(byTestId(tree, "rec-fold-says-guardrails"), "a whole draft says what it will tell the receptionist");
    // A body's slip: it writes the one switch it changed and drops the rest.
    handed.update(() => ({ never_quote_prices: false }));
    assert.doesNotThrow(() => {
      tree = again(draw);
    }, "REGRESSION: the page's render threw btWhole's TypeError");
    assert.equal(
      byTestId(tree, "rec-fold-says-guardrails"),
      null,
      "nothing can be said of a draft the helpers cannot read",
    );
    assert.equal(
      foldOf(tree, "guardrails").props.hidden,
      undefined,
      "and the fold is still open, with what was done to it",
    );
    assert.ok(
      logged.some((args) => args.some((a) => a instanceof TypeError)),
      "the fault is reported, not swallowed",
    );
    // Save cannot check or write it either: said in the danger tone, nothing sent, the fold left open.
    assert.doesNotThrow(() => saveFoldOf(tree, "guardrails"));
    tree = again(draw);
    assert.deepEqual(
      [sent.length, flashes.at(-1).tone, foldOf(tree, "guardrails").props.hidden],
      [0, "danger", undefined],
    );
    assert.match(textOf({ props: { children: flashes.at(-1).msg } }), /^Not saved/);
  } finally {
    console.error = was;
  }
});

test("Cancel's question and another row's are one question: answered once, asked once", () => {
  // Cancel armed its own Confirm; another row's act then drew the registry's over it; "Keep editing" took the
  // registry's away and Cancel's was still armed behind it, so the owner was asked the same thing twice. Both gestures
  // held a copy of this block; it is one helper now.
  const asks = (tree, within) => all(within(tree), (n) => n.type === W.Confirm).map((n) => n.props.testid);
  let tree = drawTab();
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(
    asks(tree, (t) => foldOf(t, "hours")),
    ["rec-fold-hours-cancel"],
  );
  openFold(tree, "website");
  tree = redrawTab();
  assert.deepEqual(
    asks(tree, (t) => foldOf(t, "hours")),
    ["rec-fold-hours-ask"],
    "one question on screen",
  );
  press(byTestId(tree, "rec-fold-hours-ask-no"));
  tree = redrawTab();
  assert.deepEqual(
    asks(tree, (t) => foldOf(t, "hours")),
    [],
    "REGRESSION: Cancel's question came back behind it",
  );
  assert.equal(labelled(tree, "Monday closes").props.value, "17:00", "keep editing keeps what was typed");

  // A row edited in its place, the same.
  tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  cancelRow(tree, "website");
  tree = redrawTab();
  openFold(tree, "address");
  tree = redrawTab();
  assert.deepEqual(
    asks(tree, (t) => inline(t, "website")),
    ["rec-inline-website-ask"],
  );
  press(byTestId(tree, "rec-inline-website-ask-no"));
  tree = redrawTab();
  assert.deepEqual(
    asks(tree, (t) => inline(t, "website")),
    [],
  );
});

test("an untouched fold follows what is stored: a colleague's change read back is shown, said as it stands, and the first keystroke after it is not refused", () => {
  // The quality review's probe. `opened` was taken once, as the fold opened. The hours fold left open with nothing typed
  // while a colleague's Tuesday was read back still showed 18:00, drew "It will no longer be told … Tuesday", and
  // refused the first Save after one keystroke as "changed after you opened it".
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  assert.equal(labelled(tree, "Tuesday closes").props.value, "18:00");
  // A colleague's save, read back into this tab: Tuesday closes at 20:00, version 8.
  const theirs = settings({ ...marisa, hours: { ...marisa.hours, tue: { open: "09:30", close: "20:00" } } });
  W.__SETTINGS = { ...theirs, version: 8 };
  tree = redrawTab(flash);
  assert.equal(
    labelled(tree, "Tuesday closes").props.value,
    "20:00",
    "REGRESSION: the open fold still showed the Tuesday it opened with",
  );
  assert.deepEqual(
    partsOf(byTestId(tree, "rec-fold-says-hours")).map(([eyebrow]) => eyebrow),
    ["Your receptionist will be told"],
    "nothing goes: the week is as stored",
  );
  assert.equal(W.__settingsUnsaved(), false, "and it holds no changes");
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab(flash);
  assert.equal(
    labelled(tree, "Tuesday closes").props.value,
    "20:00",
    "typed into, the draft is the week as read back, with the change",
  );
  saveFoldOf(tree, "hours");
  assert.equal(sent.length, 1, "REGRESSION: refused as changed after it opened");
  assert.equal(sent[0].version, 8);
  assert.deepEqual(sent[0].config.brain.profile.hours, {
    ...marisa.hours,
    mon: { open: "09:30", close: "17:00" },
    tue: { open: "09:30", close: "20:00" },
  });
  assert.equal(flashes.filter((f) => f.tone === "danger").length, 0);

  // A fold that HAS been typed in keeps its draft, and is refused as before: their change is not put back as it was.
  tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes", "17:00");
  redrawTab(flash);
  W.__SETTINGS = {
    ...settings({ ...marisa, hours: { ...marisa.hours, tue: { open: "09:30", close: "20:00" } } }),
    version: 8,
  };
  tree = redrawTab(flash);
  assert.equal(labelled(tree, "Tuesday closes").props.value, "18:00", "what was typed over stays as it was typed over");
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  assert.equal(sent.length, 1);
  assert.match(textOf({ props: { children: flashes.at(-1).msg } }), /changed after you opened it/);
  assert.deepEqual(openFolds(tree), ["hours"]);
});

test("a fold whose own part of the settings moved after it was typed in is refused as moved: said, nothing sent, the fold open with its draft", () => {
  // foldJob's refusal, drawn through a fold: a colleague's Tuesday is read back after Monday was typed over, and the
  // save would have put their Tuesday back as it was.
  const sent = [];
  W.__saveSettings = (config) => {
    sent.push(config);
    return new Promise(() => {});
  };
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes", "17:00");
  redrawTab(flash);
  W.__SETTINGS = {
    ...settings({ ...marisa, hours: { ...marisa.hours, tue: { open: "09:30", close: "20:00" } } }),
    version: 8,
  };
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  assert.equal(sent.length, 0, "nothing sent");
  assert.deepEqual(
    [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
    ["danger", "Not saved — this changed after you opened it. Close it and open it again to see what is there now."],
  );
  assert.deepEqual(
    [openFolds(tree), foldOf(tree, "hours").props["aria-busy"]],
    [["hours"], undefined],
    "open, and not busy",
  );
  assert.deepEqual(
    [labelled(tree, "Monday closes").props.value, labelled(tree, "Tuesday closes").props.value],
    ["17:00", "18:00"],
    "with the draft as typed: their Tuesday is not shown over it",
  );
  // Closed and opened again, it is the week as stored now.
  cancelFoldOf(tree, "hours");
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-fold-hours-cancel-yes"));
  tree = redrawTab(flash);
  openFold(tree, "hours");
  tree = redrawTab(flash);
  assert.equal(labelled(tree, "Tuesday closes").props.value, "20:00");
});

test("a fold's save the server refuses while another row's ask waits: the question is drawn then, once, and is true again", async () => {
  let refuse = null;
  W.__saveSettings = () =>
    new Promise((resolve) => {
      refuse = () => resolve({ ok: false, code: "internal", message: "The server said no." });
    });
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  openFold(tree, "website");
  tree = redrawTab(flash);
  assert.deepEqual(W.__recordFolds.asking(), { holding: "hours", wants: "website" }, "the ask is recorded");
  assert.equal(
    all(foldOf(tree, "hours"), (n) => n.type === W.Confirm).length,
    0,
    "and not drawn while the save is out",
  );
  refuse();
  await settle();
  tree = redrawTab(flash);
  assert.deepEqual(
    [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
    ["danger", "The server said no."],
  );
  const asks = all(foldOf(tree, "hours"), (n) => n.type === W.Confirm);
  assert.deepEqual(
    asks.map((n) => n.props.testid),
    ["rec-fold-hours-ask"],
    "one question, drawn now that nothing is saving, and true: nothing was saved",
  );
  assert.deepEqual(
    [foldOf(tree, "hours").props["aria-busy"], W.__settingsSaving(), labelled(tree, "Monday closes").props.value],
    [undefined, false, "17:00"],
  );
  press(byTestId(tree, "rec-fold-hours-ask-yes"));
  tree = redrawTab(flash);
  assert.deepEqual([openFolds(tree), openRows(tree)], [[], ["website"]], "answered, the row asked for opens");
});

test("a row saved through its own door offers no press on a disagreement: it has no commit to save the other answer through", () => {
  // Task 3.3's re-review. A dispute's press called the row's `commit`, which a row with a `door` (the zone's) does not
  // have, and threw as it was pressed. The will-say block already asked for a commit before calling it.
  drawTab();
  unmount();
  const tree = W.React.createElement(W.BtRow, {
    id: "timezone",
    label: "Timezone",
    brain: W.__SETTINGS.config.brain,
    value: "New York",
    initial: "America/New_York",
    storedAs: (d) => d,
    door: { save: () => {}, pending: () => false },
    disputed: { value: "Chicago", source: "workspace", use: "America/Chicago" },
    body: () => null,
  });
  const row = byTestId(tree, "rec-row-timezone");
  assert.ok(
    find(row, (n) => classes(n).includes("rec-row-dispute")),
    "the disagreement is still there to read",
  );
  assert.equal(
    find(row, (n) => n.type === "button" && classes(n).includes("btn")),
    null,
    "REGRESSION: a press that called a commit the row does not have",
  );
});

/* ------------------------------------ on a phone ------------------------------------ */

// On a phone a fold is drawn as a sheet rising from the bottom (record-fold.jsx); the page calls it the same way at
// every width, so everything the page does with a fold holds there: one editor open, the asks, the one-section save.
/** The fold's own box: the voice's textarea. */
const voiceBox = (tree) =>
  find(foldOf(tree, "tone"), (n) => (n.type === "textarea" || n.type === "input") && classes(n).includes("rec-input"));
const lastDrawn = (tree) =>
  []
    .concat(tree.rendered.props.children)
    .filter((c) => c != null && c !== false)
    .at(-1);

test("on a phone a row opens as a sheet from the bottom, asks there, and its save sends only that fold's keys", () => {
  const width = atWidth(true);
  try {
    const sent = saving();
    let tree = drawTab();
    const stored = structuredClone(W.__SETTINGS.config);
    openFold(tree, "tone");
    tree = redrawTab();
    const sheet = foldOf(tree, "tone");
    assert.deepEqual(
      [sheet.props.role, sheet.props["aria-modal"], sheet.props["aria-labelledby"]],
      ["dialog", true, "rec-fold-tone-label"],
      "a modal dialog, named by the row's label",
    );
    assert.equal(voiceBox(tree).props["aria-labelledby"], "rec-fold-tone-label", "and the box is named by it too");
    assert.deepEqual(openFolds(tree), ["tone"]);
    voiceBox(tree).props.onChange({ target: { value: "Calm and kind." } });
    tree = redrawTab();

    // Another row asked for: the one holding changes asks, in its sheet, above its Save.
    openFold(tree, "booking_rules");
    tree = redrawTab();
    assert.deepEqual(openFolds(tree), ["tone"], "one editor open, as at any width");
    const foot = find(foldOf(tree, "tone"), (n) => classes(n).includes("rec-sheet-foot"));
    assert.match(textOf(byTestId(foot, "rec-fold-tone-ask-confirm")), /Discard your changes\?/, "in the sheet's foot");
    press(byTestId(tree, "rec-fold-tone-ask-no"));
    tree = redrawTab();
    assert.equal(byTestId(tree, "rec-fold-tone-ask-confirm"), null);
    assert.equal(voiceBox(tree).props.value, "Calm and kind.", "Keep editing keeps what was typed");

    saveFoldOf(tree, "tone");
    tree = redrawTab();
    const expected = structuredClone(stored);
    expected.brain.profile.tone = "Calm and kind.";
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].config, expected, "the stored config with the voice written, and nothing else");
    assert.deepEqual(openFolds(tree), [], "taken, the sheet goes");
    assert.equal(
      find(tree, (n) => n.props?.role === "dialog"),
      null,
    );
  } finally {
    width.put();
  }
});

test("a window that crosses a phone's width while a row is open keeps it open, and keeps what was typed", () => {
  // Decided in Task 6.2b: the frame is the kit's and the draft is the page's, so a width crossed while a fold is open
  // draws the same fold in the other frame, and nothing is asked. A phone turned on its side, or a window dragged
  // narrower, is not a person leaving what they typed.
  const width = atWidth(true);
  try {
    let tree = drawTab();
    openFold(tree, "tone");
    tree = redrawTab();
    voiceBox(tree).props.onChange({ target: { value: "Calm and kind." } });
    tree = redrawTab();
    width.resize(false);
    tree = redrawTab();
    const fold = foldOf(tree, "tone");
    // The Business tab's folds are sheets at every width (RecordFold frame="sheet"), so the frame is the same one.
    assert.deepEqual([fold.props.role, fold.props.hidden], ["dialog", undefined], "a desktop's sheet, still open");
    assert.equal(voiceBox(tree).props.value, "Calm and kind.", "with what was typed");
    assert.equal(W.__settingsUnsaved(), true, "and still asked about before it is thrown away");
    width.resize(true);
    tree = redrawTab();
    assert.equal(foldOf(tree, "tone").props.role, "dialog", "and a sheet again");
    assert.equal(voiceBox(tree).props.value, "Calm and kind.");
  } finally {
    width.put();
  }
});

test("on a phone the sheet slot is still the page's last child: a row's sheet is drawn where its fold is, and every row keeps its own", () => {
  // A row's sheet is not the slot's. The slot is for what is drawn only while open (the kit's RecordSheet, which holds
  // hooks then and none while closed); a fold holds the same hooks drawn open or closed, as a sheet or under its row,
  // so it is drawn where the row is and moves no cell after it. The registry keeps one editor open at a time, so a
  // row's sheet and the slot's never stand on the page together.
  const width = atWidth(true);
  try {
    const at = (t) =>
      ["rec-row-tone", "rec-row-services", "rec-row-booking_rules"].map((id) => textOf(byTestId(t, id)));
    let tree = drawTab();
    const rest = at(tree);
    openFold(tree, "hours");
    tree = redrawTab();
    assert.equal(lastDrawn(tree).type, W.BtSheetSlot, "the slot is still last");
    assert.equal(
      find(lastDrawn(tree), (n) => n.props?.role === "dialog"),
      null,
      "and draws no sheet of the row's",
    );
    assert.equal(
      find(byTestId(tree, "rec-card-open"), (n) => n.props?.role === "dialog")?.props["data-testid"],
      "rec-fold-hours",
      "the row's sheet is drawn by its own card",
    );
    assert.deepEqual(at(tree), rest, "every row after it says what it said");
    typeAt(tree, "Monday closes", "17:00");
    tree = redrawTab();
    assert.equal(labelled(tree, "Monday closes").props.value, "17:00");
    press(byTestId(tree, "rec-fold-cancel-hours"));
    tree = redrawTab();
    press(byTestId(tree, "rec-fold-hours-cancel-yes"));
    tree = redrawTab();
    assert.deepEqual(at(tree), rest);
    // The slot's own sheet opens after it, as it always did.
    press(byTestId(tree, "rec-row-act-services"));
    tree = redrawTab();
    assert.deepEqual(
      all(tree, (n) => n.props?.role === "dialog").map((n) => n.props["data-testid"]),
      ["rec-sheet-services"],
    );
    assert.equal(lastDrawn(tree).type, W.BtSheetSlot);
  } finally {
    width.put();
  }
});

/* ------------------------------------ motion: what the stub can see of it ------------------------------------ */

// Spec §9. The stub draws no frame and runs no stylesheet, so the motions themselves are the journey's to prove, by
// computed style (e2e/settings-business.spec.ts). What the page decides is here: WHICH line of what a save will tell
// the receptionist has just changed, which is the one line record.css washes.
const saysLines = (tree, id, part = "says") =>
  all(
    find(byTestId(tree, `rec-fold-says-${id}`), (n) => n.props?.["data-part"] === part),
    (n) => classes(n).includes("rec-says-line"),
  ).map((l) => [textOf(l), l.props["data-changed"] === "true"]);
const ruleBox = (tree, key) => find(byTestId(tree, `rec-rule-${key}`), (n) => n.type === "input");

test("as the draft changes, only the line of what it will be told that changed is marked, and only until the next change", () => {
  let tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  const opened = saysLines(tree, "booking_rules");
  assert.ok(opened.length > 1, "the whole block is drawn as the fold opens");
  assert.deepEqual(
    opened.filter(([, on]) => on),
    [],
    "nothing has changed yet: the block the fold opens with is not a change",
  );

  ruleBox(tree, "lead_hours").props.onChange({ target: { value: "3" } });
  tree = redrawTab();
  const once = saysLines(tree, "booking_rules");
  const was = opened.map(([l]) => l);
  // The lines the draft changed, worked out from the block before and after, as the page must.
  const fresh = once.filter(([l]) => l.trim() !== "" && !was.includes(l)).map(([l]) => l);
  assert.equal(fresh.length, 1, `one line of the block says the notice: ${JSON.stringify(fresh)}`);
  assert.match(fresh[0], /3 hours/);
  assert.deepEqual(
    once.filter(([, on]) => on).map(([l]) => l),
    fresh,
    "that line is marked, and no other",
  );

  // Drawn again with nothing changed, the mark stays where it is: it is the same line, and does not wash twice.
  tree = redrawTab();
  assert.deepEqual(saysLines(tree, "booking_rules"), once);

  // The next change marks its own line, and the last one's mark goes.
  ruleBox(tree, "party_max").props.onChange({ target: { value: "6" } });
  tree = redrawTab();
  const twice = saysLines(tree, "booking_rules");
  const marked = twice.filter(([, on]) => on).map(([l]) => l);
  assert.equal(marked.length, 1, JSON.stringify(marked));
  assert.match(marked[0], /6 people/);
  assert.ok(!/3 hours/.test(marked[0]), "the notice's line, changed a keystroke ago, washes no more");

  // Closed and opened again, the block is new to the person, and nothing in it is a change.
  press(byTestId(tree, "rec-fold-cancel-booking_rules"));
  tree = redrawTab();
  press(byTestId(tree, "rec-fold-booking_rules-cancel-yes"));
  tree = redrawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  assert.deepEqual(
    saysLines(tree, "booking_rules").filter(([, on]) => on),
    [],
  );
});

test("a row's own line of what it will say is marked as it changes, not as it first appears", () => {
  let tree = drawTab();
  press(byTestId(tree, "rec-row-act-website"));
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  const lines = () =>
    all(byTestId(tree, "rec-inline-says-website"), (n) => classes(n).includes("rec-says-line")).map((l) => [
      textOf(l),
      l.props["data-changed"] === "true",
    ]);
  const first = lines().filter(([l]) => l.includes("marisas.example"));
  assert.equal(first.length, 1, "it says the new address");
  assert.equal(first[0][1], false, "what arrives with the block is not a change of it");
  typeInto(tree, "website", "https://marisas.example/book");
  tree = redrawTab();
  const marked = lines().filter(([, on]) => on);
  assert.deepEqual(marked.length, 1);
  assert.match(marked[0][0], /marisas\.example\/book/, "the line the keystroke changed");
});

test("a row drawn again as its editor's save closes it says so, for its value to arrive; opened and cancelled, it does not", () => {
  // Spec §9, item 4, the save settle: the fold closes, and the row's value arrives on the house's rise-in. The row is
  // what says it arrived with a save (data-settled, the kit's RecordRow), for record.css to play rise-in on it once.
  const settled = (tree, id) => byTestId(tree, `rec-row-${id}`).props["data-settled"];
  saving();
  let tree = drawTab();
  assert.equal(settled(tree, "tone"), undefined, "drawn with the page, a row is simply there");
  assert.equal(settled(tree, "website"), undefined);

  // A fold, saved.
  openFold(tree, "tone");
  tree = redrawTab();
  find(foldOf(tree, "tone"), (n) => n.type === "textarea").props.onChange({ target: { value: "Calm and kind." } });
  tree = redrawTab();
  saveFoldOf(tree, "tone");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), []);
  assert.equal(settled(tree, "tone"), "true", "the fold's row, drawn again by its save");
  assert.equal(settled(tree, "website"), undefined, "and no other");

  // A row edited in place, saved.
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  saveRow(tree, "website");
  tree = redrawTab();
  assert.equal(settled(tree, "website"), "true", "the row, drawn again by its save");

  // Opened and cancelled: nothing was saved, so nothing arrives.
  tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  cancelFoldOf(tree, "booking_rules");
  tree = redrawTab();
  assert.equal(settled(tree, "booking_rules"), undefined, "a fold cancelled");
  openFold(tree, "website");
  tree = redrawTab();
  cancelRow(tree, "website");
  tree = redrawTab();
  assert.equal(settled(tree, "website"), undefined, "a row cancelled");
});

test("on a phone a row open as a sheet is still drawn in its card behind it, so nothing under the wash moves", () => {
  // Task 6.2b's note 8: the card under a row's sheet was one row shorter, and grew back as the sheet went, which the
  // sheet's leaving (spec §9, item 1) would have put on show. The fold draws the row behind its sheet (RecordFold's
  // `behind`); the page still draws it itself only while the fold is closed.
  const width = atWidth(true);
  try {
    let tree = drawTab();
    const at = (t) => textOf(byTestId(t, "rec-row-tone"));
    const rest = at(tree);
    openFold(tree, "tone");
    tree = redrawTab();
    const sheet = foldOf(tree, "tone");
    assert.equal(sheet.props.role, "dialog");
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "rec-row-tone").length, 1, "one row, behind the sheet");
    assert.equal(at(tree), rest, "saying what it said");
    assert.equal(byTestId(sheet, "rec-row-tone"), null, "and not inside the dialog");
    assert.ok(
      find(byTestId(tree, "rec-card-answers"), (n) => n.props?.["data-testid"] === "rec-row-tone"),
      "in its own card",
    );
  } finally {
    width.put();
  }
  // At a desktop's width the fold is a sheet too (RecordFold frame="sheet"), and the row stays behind it the same way.
  let tree = drawTab();
  openFold(tree, "tone");
  tree = redrawTab();
  assert.equal(foldOf(tree, "tone").props.role, "dialog");
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "rec-row-tone").length, 1, "one row, behind the sheet");
  assert.equal(byTestId(foldOf(tree, "tone"), "rec-row-tone"), null, "and not inside the dialog");
});

test("the line the page marks as changed is the line the kit draws as a new element, and no other", () => {
  // changedLines (business-tab-folds.jsx) says which lines of a block are new; RecordSays keys each line by its words
  // and which time they occur, so a line that is new to the browser is drawn as a new element, which is what lets the
  // wash play once as it arrives. The two must agree: a marked line that kept its element would never wash, and an
  // unmarked line that arrived new is simply drawn. Both count occurrences in order, so of two lines alike the LATER
  // is the new one on both sides. Only a blank line may be new without being marked: blank lines are never a change.
  const changedLines = W.__businessTabSave.changedLines;
  const keysOf = (text) => {
    const tree = W.React.createElement(W.RecordSays, { text });
    return all(
      find(tree, (n) => n.type === "pre"),
      (n) => n.type === W.React.Fragment,
    ).map((f) => f.props.key);
  };
  const cases = [
    ["reordered", "Mon: 9-5\nTue: 9-5\nWed: closed", "Wed: closed\nMon: 9-5\nTue: 9-5"],
    [
      "a duplicate added",
      "- Walk-ins welcome\n- Parking at the back",
      "- Walk-ins welcome\n- Parking at the back\n- Walk-ins welcome",
    ],
    [
      "a duplicate removed",
      "- Walk-ins welcome\n- Walk-ins welcome\n- Parking at the back",
      "- Walk-ins welcome\n- Parking at the back",
    ],
    [
      "blank lines",
      "Booking rules:\n- At least 2 hours' notice.\n\nHours:",
      "Booking rules:\n- At least 3 hours' notice.\n\n\nHours:",
    ],
    ["one line rewritten", "Tone: warm\nLanguages: English", "Tone: calm\nLanguages: English"],
    ["no change", "Tone: warm", "Tone: warm"],
  ];
  for (const [what, was, now] of cases) {
    const before = new Set(keysOf(was));
    const lines = now.split("\n");
    const fresh = keysOf(now)
      .map((k, i) => (before.has(k) ? null : i))
      .filter((i) => i != null);
    const marked = changedLines(was, now);
    assert.deepEqual(
      fresh.filter((i) => lines[i].trim() !== ""),
      marked,
      `${what}: the marked lines are the new elements`,
    );
    for (const i of fresh.filter((i) => !marked.includes(i))) {
      assert.equal(lines[i].trim(), "", `${what}: only a blank line arrives unmarked`);
    }
  }
  assert.deepEqual(
    changedLines("- Walk-ins welcome", "- Walk-ins welcome\n- Walk-ins welcome"),
    [1],
    "the later of two",
  );
  // A block that appears is arriving, not changing; one that goes marks nothing.
  assert.deepEqual(changedLines(null, "Tone: warm"), []);
  assert.deepEqual(changedLines("Tone: warm", null), []);
});

/* ------------------------------------ what is on screen at rest ------------------------------------ */

// Spec §11, as amended by Task 6.3 and by the 23 Sep quieting: at rest the page draws what an owner acts on without
// looking for it, and every row's act, quietly (record.css: the dim ink at rest, the ink as the row is approached;
// it was opacity 0 until the row was hovered, which read as nothing to press). What the stub can tell is which
// controls are drawn at rest -- nothing in a closed editor, hidden whole; the journey measures the rest by computed
// style.
const CONTROL = (n) =>
  ["button", "a", "input", "select", "textarea"].includes(n.type) ||
  n.props?.role === "switch" ||
  n.props?.tabIndex === 0;
/** Every control the page draws at rest, each with the row it is in: a component is walked as what it rendered. */
const drawnAtRest = (tree) => {
  const out = [];
  const walk = (n, row) => {
    if (n == null || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach((k) => walk(k, row));
    if (n.props?.hidden === true) return;
    const inRow = classes(n).includes("rec-row") ? n : row;
    if (typeof n.type === "string" && CONTROL(n))
      out.push({ id: n.props["data-testid"] || textOf(n).trim(), n, row: inRow });
    if (typeof n.type === "function") walk(n.rendered, inRow);
    else walk(n.props?.children, inRow);
  };
  walk(tree, null);
  return out;
};

test("at rest a whole record draws every row's act, quietly, and three controls an owner acts on without looking for it", () => {
  const drawn = drawnAtRest(drawTab());
  const isAct = (c) => classes(c.n).includes("rec-row-act");
  assert.deepEqual(
    drawn.filter((c) => !isAct(c)).map((c) => c.id),
    [
      // Where the carrier record is asked, a link in Who you are's foot sentence: part of what it says.
      "rec-who-carriers",
      // Look at a photo is off: what is missing says so, with its door, at full strength (§11).
      "rec-can-door-vision",
      // Read it: what the receptionist is told.
      "rec-prompt-open",
    ],
  );
  // Every row with an act draws it, one each, in its own row: nothing is latent any more.
  const acts = drawn.filter(isAct);
  assert.ok(acts.length >= 20, `every row's act: ${acts.length}`);
  assert.ok(
    acts.every((c) => c.row && c.row.props["data-act"] === "true"),
    "each in a row that says it is a press",
  );
  assert.equal(new Set(acts.map((c) => c.row)).size, acts.length, "one act to a row");
  // Nothing is missing from this record, so there is no gap line and no door.
  assert.equal(byTestId(drawTab(), "rec-gap-door"), null);
});

test("at rest an empty record adds only what is empty or missing, and the gap line's door", () => {
  const drawn = drawnAtRest(drawTab({ profile: {} }));
  const why = (c) =>
    c.id === "rec-prompt-open" || c.id === "rec-who-carriers"
      ? "always"
      : c.id === "rec-gap-door"
        ? "the gap"
        : classes(c.n).includes("rec-row-act")
          ? "a row's act, drawn at rest"
          : /^rec-can-door-/.test(c.id)
            ? "missing"
            : null;
  assert.deepEqual(
    drawn.filter((c) => !why(c)).map((c) => c.id),
    [],
    "nothing else is drawn at rest",
  );
  assert.ok(
    drawn.some((c) => c.id === "rec-gap-door"),
    "the gap line's one link",
  );
});

test("a business that quotes may empty its booking link, and the key goes rather than an empty one; a business that books is asked for it, in the first run's words", () => {
  const sent = saving();
  const flash = () => {};
  let tree = drawTab({ flash, sellsBy: "proposal" });
  openFold(tree, "booking_link");
  tree = redrawTab(flash);
  typeInto(tree, "booking_link", "   ");
  tree = redrawTab(flash);
  saveRow(tree, "booking_link");
  assert.equal(sent.length, 1);
  assert.equal(
    Object.prototype.hasOwnProperty.call(sent[0].config.brain, "booking_link"),
    false,
    "an empty one would fail the read's web-address check, and the receptionist would go quiet",
  );
  tree = drawTab({ flash, sellsBy: "booking" });
  openFold(tree, "booking_link");
  tree = redrawTab(flash);
  typeInto(tree, "booking_link", "");
  tree = redrawTab(flash);
  saveRow(tree, "booking_link");
  tree = redrawTab(flash);
  assert.ok(textOf(inline(tree, "booking_link")).includes(BOOKING_LINK_NEEDED), textOf(inline(tree, "booking_link")));
  assert.equal(sent.length, 1, "and nothing more is sent");
});

test("with no booking link, the row says what a business that quotes does instead; one that books, or has not said, reads it is not set", () => {
  const without = { booking_link: undefined };
  assert.match(
    textOf(byTestId(drawTab({ sellsBy: "proposal", brain: without }), "rec-row-booking_link")),
    /None — it takes their details instead/,
  );
  for (const sellsBy of ["booking", null]) {
    assert.match(
      textOf(byTestId(drawTab({ sellsBy, brain: without }), "rec-row-booking_link")),
      /Not set/,
      String(sellsBy),
    );
  }
});
