/**
 * The Business tab: the plan's seven, the facts at rest, and one value edited where it is stated.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf, businessGap, newReceptionistDefaults, setupSteps } from "@chanlytics/contracts";
import { PROFILE_CROSSING_WORDS } from "../../../../apps/dashboard/src/surfaces/settings/business/model/fold-limits.ts";
import { unmount, settle, all, find, byTestId, textOf, classes, press } from "../../../_stub-react.mjs";
import {
  boxOf,
  BUSINESS_TAB,
  cancelFoldOf,
  cancelRow,
  composed,
  composePromptPreview,
  dayOf,
  drawTab,
  escape,
  factsHeld,
  inline,
  KNOWN,
  labelled,
  landSettings,
  marisa,
  openFold,
  openRows,
  ownWords,
  partsOf,
  POLICIES,
  redrawTab,
  saveRow,
  saving,
  settingsHeld,
  SETUP,
  typeAt,
  typeInto,
  W,
  went,
  without,
} from "../../../_business-tab-harness.mjs";
import { bridgeHolds } from "../../../shell/_bridge-holds.mjs";
import "./_page.mjs";

/* ------------------------------------ the plan's seven ------------------------------------ */

test("a full record opens on its first card: no title, no stamp, no line restating the rows", () => {
  const tree = drawTab({ profile: marisa });
  assert.equal(businessGap(settingsHeld().config.brain, null), null, "Marisa's record is missing nothing");
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

test("On calls holds what a caller hears and who it puts them through to, and says what a call does out of hours", () => {
  // The Settings wiring review, items 6-7 (18 Oct 2026): the greeting was How it talks', the number Who you are's.
  const tree = drawTab({ profile: marisa });
  const card = byTestId(tree, "rec-card-calls");
  assert.match(textOf(card), /On calls/);
  // Out of hours a call takes a message (contracts handoffCallRow), so the card says who it rings in opening hours.
  assert.match(textOf(card), /who it rings in opening hours/);
  assert.deepEqual(all(card, (n) => classes(n).includes("rec-row-key")).map(textOf), [
    "Greets every caller with",
    "Voice",
    // Each call's voice speed (decision 0073, R7).
    "Pace",
    "Transfer number",
    // Setup's own row, where Setup has been read (the next test).
    "The number you already have",
  ]);
  const row = byTestId(card, "rec-row-handoff_number");
  assert.match(textOf(row), /\+1 \(212\) 555-0142/);
  assert.equal(byTestId(byTestId(tree, "rec-card-answers"), "rec-row-phone_greeting"), null, "no longer How it talks'");
  // A line that answers no calls: no greeting, and the number still says a message is what a caller gets.
  const none = byTestId(
    drawTab({
      profile: without(marisa, "handoff_number"),
      facts: { voice_line: { value: null, source: "absent" }, handoff_number: { value: null, source: "absent" } },
    }),
    "rec-card-calls",
  );
  assert.equal(byTestId(none, "rec-row-phone_greeting"), null);
  assert.equal(byTestId(none, "rec-row-phone_voice"), null, "nor a voice: no call is answered in it");
  assert.match(textOf(byTestId(none, "rec-row-handoff_number")), /Takes a message instead/);
});

test("On calls holds the number the business keeps: Setup's own row, by its own name, its one home beside Today's card", async () => {
  // Forwarding was set up on Setup's rows alone, so "The number you already have" could never be put off for good
  // (25 Oct 2026). The row reads Setup's value on the seam, as every card of the page does (drawTab lands it).
  const at = Date.parse("2026-09-21T16:00:00Z");
  const seamOf = (setup) => ({
    ...setup,
    role: "owner",
    later: [],
    rests: {},
    want: null,
    vm: setupSteps({ ...setup.dto, later: [], rests: {} }, at),
    fetchedAt: at,
  });
  const was = W.ST_STORE;
  try {
    const setup = SETUP();
    const card = byTestId(drawTab({ profile: marisa, setup: seamOf(setup) }), "rec-card-calls");
    assert.deepEqual(all(card, (n) => classes(n).includes("rec-row-key")).map(textOf), [
      "Greets every caller with",
      "Voice",
      "Pace",
      "Transfer number",
      "The number you already have",
    ]);
    const row = byTestId(card, "rec-row-kept_number");
    assert.match(textOf(row), /Not forwarded/);
    assert.match(textOf(row), /Keep the number your customers know: forward its calls to/, "Setup's own sentence");
    assert.match(textOf(byTestId(row, "rec-row-act-kept_number")), /Set up forwarding/);

    // A number saved: the number is the row's value, and its act is the next one Setup names.
    const kept = {
      ...setup.dto.lines.rows[0],
      id: "ln-kept",
      e164: "+13055550100",
      kind: "forwarded",
      provider: "carrier",
      voice_state: "none",
      whatsapp_state: "none",
      forwarding_state: "instructed",
      forwarding: {
        carrier: "verizon",
        mode: "unanswered",
        destination_e164: "+13055550123",
        test_until: null,
        verified_at: null,
      },
    };
    const saved = {
      ...setup,
      dto: { ...setup.dto, lines: { ...setup.dto.lines, rows: [...setup.dto.lines.rows, kept] } },
    };
    const after = byTestId(
      byTestId(drawTab({ profile: marisa, setup: seamOf(saved) }), "rec-card-calls"),
      "rec-row-kept_number",
    );
    assert.match(textOf(after), /\+1 \(305\) 555-0100/);
    assert.match(textOf(byTestId(after, "rec-row-act-kept_number")), /Test it/);

    // REGRESSION: someone who may not change the business reads the number and is offered nothing, as on every row of
    // the page; the row offered its card to a viewer too (12 Nov 2026).
    W.ST_STORE = { can: (perm) => perm !== "settings", myRole: () => "viewer" };
    const read = byTestId(
      byTestId(drawTab({ profile: marisa, setup: seamOf(saved) }), "rec-card-calls"),
      "rec-row-kept_number",
    );
    assert.match(textOf(read), /\+1 \(305\) 555-0100/, "the number is read");
    assert.equal(byTestId(read, "rec-row-act-kept_number"), null, "and no act is offered");
  } finally {
    if (was) W.ST_STORE = was;
    else delete W.ST_STORE;
  }
});

test("what the owner's corrections suggest is drawn after What it knows, where a note kept lands", () => {
  // The Settings wiring review, item 8 (18 Oct 2026): it was a card of Autonomy's.
  const waiting = {
    id: "s-1",
    source: "steer",
    title: "Mondays",
    body: "We are closed on Mondays.",
    quote: "tell her we are closed on Mondays now",
    conversation_id: null,
    created_at: "2026-10-16T09:00:00Z",
  };
  const order = (tree) => all(tree, (n) => classes(n).includes("rec-card")).map((n) => n.props["data-testid"]);
  const tree = drawTab({ policies: { ...POLICIES(), suggestions: [waiting] } });
  const cards = order(tree);
  assert.equal(cards[cards.indexOf("rec-card-knows") + 1], "rec-card-learned");
  assert.match(textOf(byTestId(tree, "rec-card-learned")), /We are closed on Mondays\./);
  assert.ok(!order(drawTab()).includes("rec-card-learned"), "nothing while none waits");
});

test("the Workspace row is gone, whatever the workspace is called", () => {
  const same = drawTab({ profile: marisa });
  assert.equal(byTestId(same, "rec-row-workspace"), null);
  bridgeHolds({ who: { workspaces: [{ id: "t-marisa", name: "Billing probe", timezone: "America/New_York" }] } });
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
    known_source: "provisioned",
    sentence: "AI tells customers to call +1 (212) 555-0142, but it answers on +1 (305) 555-0123.",
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
  // "Not set" and nothing under it (Ruben, 10 Oct 2026: a row says its value and stops). Never that the receptionist
  // has none to give -- the owner's own words may name one -- nor the page we publish, which no receptionist is told
  // and the phone networks are filed only from the business record's own website.
  assert.equal(textOf(find(row, (n) => classes(n).includes("rec-row-empty"))), "Not set");
  assert.equal(
    find(row, (n) => classes(n).includes("rec-row-hint")),
    null,
  );
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
    landSettings(s);
    assert.equal(W.React.createElement(W.BusinessTab, { flash: () => {} }).rendered, null);
  }
});

/* ------------------------------------ one value, edited where it is stated ------------------------------------ */

test("an inline save sends the stored config with its one key changed, and everything else as it was", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(settingsHeld().config);
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
  assert.equal(textOf(flashes.at(-1).msg), "Saved · AI picks it up within a minute");
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
  const stored = structuredClone(settingsHeld().config);
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
  assert.equal(textOf(flashes.at(-1).msg), "AI takes a message instead of transferring.");
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
  assert.match(textOf(inline(tree, "name")), /AI needs a business name before it can answer anyone\./);
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

test("F1: the number the business keeps, given out, says its missed calls reach AI -- not that they never do", () => {
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
    /^Your own number\. The calls nobody picks up there go to AI on \+1 \(305\) 555-0123\.$/,
  );
  typeInto(tree, "phone_display", "+1 (646) 555-0100");
  tree = redrawTab(flash);
  assert.match(
    textOf(byTestId(tree, "rec-inline-phone_display-note")),
    /will not reach AI/,
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
  let stored = structuredClone(settingsHeld().config);
  const address = byTestId(tree, "rec-row-address");
  const minor = factsHeld().conflicts.find((k) => k.fact === "address");
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
  stored = structuredClone(settingsHeld().config);
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
  const stored = settingsHeld().config.brain;
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
  assert.equal(byTestId(tree, "rec-inline-says-website"), null, "a draft the save refuses is never told to AI");

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
  const stored = settingsHeld().config.brain;
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
  let stored = structuredClone(settingsHeld().config);
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
  stored = structuredClone(settingsHeld().config);
  press(find(byTestId(tree, "rec-row-name"), (n) => n.type === "button" && textOf(n) === "Use Google's"));
  assert.deepEqual(sent[1].config, {
    ...stored,
    brain: { ...stored.brain, business_name: now, system_prompt: baselineOf(now) },
  });

  // A prompt the owner's workspace had before its fields is their own words: a rename leaves it as they wrote it.
  tree = drawTab();
  stored = structuredClone(settingsHeld().config);
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
    stored = structuredClone(settingsHeld().config);
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
  const next = { ...settingsHeld().config.brain, profile: sparse };
  const identity = BUSINESS_TAB.consequenceOf("address", next, "whatsapp")
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
    /Discard changes\?/,
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

test("Cancel closes a row's one value at once and asks first in a fold of several; Escape is Cancel, and Ctrl or Cmd with Enter saves", () => {
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
  // A row holds one value: its own Cancel throws it away without a question (Ruben, 7 Oct 2026). Moving away is not
  // that decision, which is why the rail and the browser were told of it while it stood open.
  cancelRow(tree, "website");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-inline-website-cancel-confirm"), null, "nothing asked");
  assert.deepEqual(openRows(tree), [], "closed at once: one value, typed again in a breath");
  assert.equal(W.__settingsUnsaved(), false);

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
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  inline(tree, "website").props.onKeyDown(key("Escape"));
  tree = redrawTab();
  assert.deepEqual(openRows(tree), [], "Escape closes it, as Cancel does");
  assert.equal(W.__settingsUnsaved(), false);
  assert.equal(sent.length, 0);

  // A fold of several fields asks first, and a keystroke is an answer: keep editing.
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  assert.match(textOf(byTestId(tree, "rec-fold-hours-cancel-confirm")), /Discard changes\?/);
  press(byTestId(tree, "rec-fold-hours-cancel-no"));
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-fold-hours-cancel-confirm"), null);
  assert.equal(labelled(tree, "Monday closes").props.value, "17:00", "keep editing keeps what was typed");
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-fold-hours-cancel-confirm"));
  typeAt(tree, "Monday closes", "16:30");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-fold-hours-cancel-confirm"), null, "a keystroke is an answer: keep editing");
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  press(byTestId(tree, "rec-fold-hours-cancel-yes"));
  tree = redrawTab();
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

test("answered with Keep editing, another row's ask gives focus back to the box", () => {
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

    // The registry's ask, from another row's act (a row's own Cancel asks nothing: it holds one value). "Yes, discard"
    // had focus, and "Keep editing" takes the ask away. A fold's own ask gives focus back the same way, and a keystroke
    // that answers one leaves focus where it is: the kit's tests hold both (shell/record-kit/).
    openFold(tree, "name");
    tree = redrawTab();
    inline(tree, "website").props.onFocus({ target: yes });
    press(byTestId(tree, "rec-inline-website-ask-no"));
    asking = false;
    tree = redrawTab();
    assert.deepEqual(focused, ["box"], "back in the box, not at the top of the document");
    assert.deepEqual(openRows(tree), ["website"]);
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
    // Its times are menus in the kit's box (open-week.tsx BtoTime), which the fold counts as fields (focus.ts).
    all(row, (n) => n.props?.["aria-haspopup"] === "menu" && "value" in n.props).map((n) => n.props["aria-label"]),
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
  bridgeHolds({
    parts: {
      saveSettings: (config, version, accepted) => {
        sent.push(config);
        accept = accepted;
        return new Promise(() => {});
      },
    },
  });
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
  bridgeHolds({
    parts: {
      saveSettings: (config, version, accepted) =>
        new Promise((answer) => {
          sent.push({
            config: structuredClone(config),
            accept: () => accepted({ config: structuredClone(config), version: version + 1 }),
            answer,
          });
        }),
    },
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
    /Discard changes\?/,
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
