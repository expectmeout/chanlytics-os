/**
 * The playbook composer: a new playbook and one being changed, in a sheet over Campaigns' home.
 *
 * - Every slot could take any of the six sources, so a starter's first name could be filled with the booking link
 *   and a run greeted everyone "Hi your booking link"; a slot takes only what keeps its message true now
 *   (contracts slotChoices), and a playbook stored the old way is put right the next time it is changed.
 * - A visit's reminder was offered to a win-back, which can fill neither its time nor its service.
 * - It opened on whichever template sorted first when the moment's own was not approved; it opens on the moment's
 *   own, or on nothing, and says what to do.
 * - It was a panel over the Playbooks list: opening it pushed the cards down and took the unset moments away; the home
 *   (3 Oct 2026, which replaced that list) hosts it in a sheet over a rail that stays where it was.
 * The composer is drawn directly (PlaybookComposer, TSX since decision 0015) on a stub React, over the surface the seam
 * hands it and the starter library it imports, as the home hands it one (home/new-message.tsx): the moment a Turn on was
 * pressed for, or the playbook being changed. A playbook's detail is PlaybookPane, and the home is CampaignsHome.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh as freshTree,
  again,
  all,
  find,
  byTestId,
  textOf,
  press,
} from "../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
const NOW = Date.now();

/** A starter as WhatsApp holds it once approved: the library's words and slots. */
const starterRow = (key, over = {}) => {
  const s = contracts.starterByKey(key);
  const t = contracts.starterText(s, over.language || "en_US");
  return {
    id: `tpl-${key}`,
    channel: "whatsapp",
    name: s.name,
    language: "en_US",
    meta_status: "approved",
    category: s.category,
    purpose: s.category === "utility" ? "conversational" : "marketing",
    source: "starter",
    title: null,
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
    ...over,
  };
};
/** A message written elsewhere: its slots known only by their labels. */
const ownRow = (over = {}) => ({
  id: "tpl-own",
  channel: "whatsapp",
  name: "autumn_offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  purpose: "marketing",
  source: "meta",
  title: "Autumn offer",
  body_preview: "Hi {{1}}, {{2}} this autumn.",
  variables: [
    { position: 1, label: "Name", example: "Dani" },
    { position: 2, label: "Value 2", example: "20% off" },
  ],
  ...over,
});
const trig = (id, over = {}) => {
  const t = contracts.triggerOf(id);
  return {
    id,
    label: t.label,
    hint: t.hint,
    cls: t.cls,
    list: t.list,
    kind: t.kind,
    // 2 Oct 2026: every moment is offered here, so each test can press the one it is about (surface.ts says which a
    // new playbook may start from; the moments' own tests are playbooks/home/moments-offered.test.mjs).
    offered: true,
    candidates: 12,
    held: 2,
    named: { pool: 40, noYes: 20, stopped: 4, noNumber: 2 },
    ...over,
  };
};
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-winback_offer",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: null,
  last_run_at: null,
  created_at: new Date(NOW - 30 * 86_400_000).toISOString(),
  triggerLabel: "Win-back",
  triggerHint: "Nothing heard in 30 days",
  schedule: "daily at 10:00 AM",
  next: "tomorrow 10:00 AM",
  candidates: 12,
  held: 2,
  totals: { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
const surface = (over = {}) => ({
  rows: [],
  templates: [starterRow("winback_offer"), starterRow("monthly_offer"), starterRow("visit_reminder"), ownRow()],
  triggers: contracts.PLAYBOOK_TRIGGERS.map((t) => trig(t.id)),
  timezone: ZONE,
  calendar: "ok",
  // How the business works (the surface's shape, 9 Oct 2026): the words this file pins are the word "visit"'s.
  shape: { calendar: "feed", dealsOn: false, word: "visit" },
  number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio",
  bookingLink: true,
  fetchedAt: NOW,
  ...over,
});

/* ---------------------------------- the window ---------------------------------- */

const went = [];
const replaced = [];
const toasts = [];
const said = [];
installLegacyReact({
  location: {
    pathname: "/w/studio",
    hash: "#/outbound",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
});
const SRC = "../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
// The shell's own components the page draws by name (PolicyChip, the record kit's sheet): the frame's JSX, loaded as the
// app loads it; the page and its verbs are TSX (decision 0015) and imported.
await import(`${SRC}/legacy/components/data-bits.jsx`);
Object.assign(globalThis, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to, opts) => (opts && opts.replace ? replaced : went).push(to),
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
const { PlaybookComposer } = await import(`${SRC}/surfaces/campaigns/playbooks/composer.tsx`);
const { PlaybookPane } = await import(`${SRC}/surfaces/campaigns/playbooks/card-detail.tsx`);
const { playbooksSample } = await import(`${SRC}/surfaces/campaigns/playbooks/sample.ts`);
const { CampaignsHome } = await import(`${SRC}/surfaces/campaigns/home/home-page.tsx`);
const { PaneSheet } = await import(`${SRC}/surfaces/campaigns/home/pane-sheet.tsx`);
const { pbGuardWords } = await import(`${SRC}/surfaces/campaigns/playbooks/words.tsx`);
const { playbooks } = await import(`${SRC}/surfaces/campaigns/playbooks/verbs.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { CmSlot } = await import(`${SRC}/surfaces/campaigns/parts/slot.tsx`);
const { CmReachLine } = await import(`${SRC}/surfaces/campaigns/parts/reach.tsx`);
const { CmRuleWord } = await import(`${SRC}/surfaces/campaigns/parts/rule.tsx`);
const { templates: templateVerbs } = await import(`${SRC}/surfaces/campaigns/templates/verbs.ts`);
const { Popover } = await import(`${SRC}/surfaces/kit/popover/popover.tsx`);

/** The message's slots, each the control in the bubble that changes what fills it (parts/slot.tsx), in their order. */
const slotsOf = (tree) => all(tree, (n) => n.type === CmSlot);
/** The slots that are typed, in their order: the boxes the table of slots had. */
const typedOf = (tree) => slotsOf(tree).filter((s) => s.props.kind === "text");

/** One of the composer's choices, the kit's Picker (surfaces/kit/picker/), by its test id. */
const pickerOf = (tree, testid) => find(tree, (n) => n.type === Picker && n.props["data-testid"] === testid);
/** What a picker offers, in its order, and the group each sits under. */
const offered = (p) => p.props.groups.flatMap((g) => g.options.map((o) => ({ value: o.value, group: g.label })));
/** What a picker's token says: the page's face, else the one chosen, else what it says with none. */
const faceOf = (tree, testid) => {
  const p = pickerOf(tree, testid);
  const one = p.props.groups.flatMap((g) => g.options).find((o) => o.value === p.props.value);
  return textOf(p.props.face ?? (one ? one.label : (p.props.placeholder ?? "")));
};
// The verbs, as the page imports them: what the composer sends is what the route would be sent.
playbooks.create = async (body) => {
  said.push(["create", body]);
  return { ok: true, data: { id: "pb-new", name: body.name || "Win-back" } };
};
playbooks.update = async (id, body) => {
  said.push(["update", id, body]);
  return { ok: true, data: { id, name: body.name || "Win-back" } };
};
// The drawer's Goes by row: the channels alone, said the moment the server takes them.
playbooks.channels = async (id, channels, opts = {}) => {
  said.push(["channels", id, channels]);
  const data = { id, name: "Visit reminder", state: "running" };
  if (opts.onAccepted) opts.onAccepted(data);
  return { ok: true, data };
};

const allByTestId = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id);
const closed = [];
const fresh = () => {
  freshTree();
  went.length = 0;
  replaced.length = 0;
  said.length = 0;
  toasts.length = 0;
  closed.length = 0;
};
/** What the composer is open on, as the home hands it (home/new-message.tsx): the surface, the playbook changed, the moment. */
const open = { data: null, editing: null, moment: null };
const page = () =>
  again(() =>
    PlaybookComposer({
      data: open.data,
      editing: open.editing,
      initialTrigger: open.moment,
      onDone: (d, changed) => closed.push(["done", d, changed]),
      onCancel: () => closed.push(["cancel"]),
    }),
  );
/**
 * The composer opened the way a person opens it on the home: a moment's Turn on (the address new:moment:<trigger>), New
 * message's "Every time a moment comes" (new:every, on no moment), or a playbook's Edit (new:edit:<id>, on its row).
 */
const composing = (over = {}, moment = null, changing = null) => {
  const data = surface(over);
  fresh();
  Object.assign(open, { data, moment, editing: changing ? data.rows.find((p) => p.id === changing) : null });
  return page();
};
/** A playbook's detail, as the home's sheet hosts it (home/drawer.tsx), over the surface it reads its message and moment from. */
const paneOf = (p, over = {}, acts = {}) => {
  setSurfaceValue("playbooks", surface({ rows: [p], ...over }));
  fresh();
  return again(() => PlaybookPane({ p, canAct: true, onEdit() {}, flash() {}, onClose() {}, ...acts }));
};
/** Each slot as the composer lists it: what fills it, and what else it offers (nothing, when it has no choice). */
const fillsOf = (tree) =>
  slotsOf(tree).map((s) => ({
    kind: s.props.kind,
    offers: s.props.offers.length > 1 ? s.props.offers.map((o) => o.id) : [],
  }));
const type = (tree, i, words) => typedOf(tree)[i].props.onTyped(words);
/** Picks from one of the composer's lists (the moment's, the message's): opens it, and presses the option. */
const pick = (testid, id) => {
  const p = pickerOf(page(), testid);
  assert.ok(p && offered(p).some((o) => o.value === id), `${testid} offers ${id}`);
  p.props.onValueChange(id);
  return page();
};

/* ---------------------------------- the slots ---------------------------------- */

test("REGRESSION: a starter's first name is each person's own and offers nothing else -- a run greeted everyone 'Hi your booking link'", () => {
  const tree = composing({}, "quiet_30");
  assert.deepEqual(
    fillsOf(tree),
    [
      { kind: "first_name", offers: [] },
      { kind: "business_name", offers: ["business_name", "text"] },
      { kind: "booking_link", offers: ["booking_link", "text"] },
    ],
    "a first name has no choice; the business name and the link may be typed over, and nothing else",
  );
  assert.ok(
    String(slotsOf(tree)[0].props.hint).includes("“there” when none is on file"),
    "and it says what a person with no name on file reads",
  );
  assert.equal(typedOf(tree).length, 0, "nothing to type on a starter that knows every slot");
  assert.equal(byTestId(tree, "pb-save").props.disabled, false);
});

test("a slot on a message written elsewhere may take anything, its guess first; a link the workspace lacks is typed", () => {
  // Only the message written elsewhere is approved, so the composer opens on nothing and it is picked.
  composing({ templates: [ownRow()], bookingLink: false }, "quiet_30");
  let tree = pick("pb-template", "autumn_offer");
  assert.deepEqual(
    fillsOf(tree),
    [
      { kind: "first_name", offers: ["first_name", "text", "business_name"] },
      { kind: "text", offers: ["text", "first_name", "business_name"] },
    ],
    "a guess, and every source there is on a list moment with no link on file",
  );
  // Typed over, a slot keeps its row: an input where the words were, no row added or taken away.
  slotsOf(tree)[0].props.onKind("text");
  tree = page();
  assert.deepEqual(
    fillsOf(tree).map((f) => f.kind),
    ["text", "text"],
  );
  assert.equal(slotsOf(tree).length, 2);
});

test("the business name typed over starts from it, and goes out as typed words", async () => {
  let tree = composing({}, "quiet_30");
  slotsOf(tree)[1].props.onKind("text");
  tree = page();
  assert.equal(typedOf(tree)[0].props.typed, "Northside Studio", "it starts from the name on file");
  type(tree, 0, "Northside");
  tree = page();
  await press(byTestId(tree, "pb-save"));
  const [, body] = said.at(-1);
  assert.deepEqual(body.params, [{ kind: "first_name" }, "Northside", { kind: "booking_link" }]);
});

test("REGRESSION: a visit's reminder is not offered to a list moment, and is to a visit moment -- a win-back could pick it and no run could fill it", () => {
  let tree = composing({}, "quiet_30");
  const names = offered(pickerOf(tree, "pb-template")).map((o) => o.value);
  assert.ok(!names.includes("visit_reminder"), `REGRESSION: ${names.join(", ")}`);
  assert.deepEqual(names, ["winback_offer", "monthly_offer", "autumn_offer"], "the moment's own first, then the rest");
  assert.equal(offered(pickerOf(tree, "pb-template"))[0].group, "Written for this moment");
  // The moment's own leads wherever the library puts it: the month's offer sorts after the win-back there.
  tree = composing({}, "everyone_monthly");
  assert.deepEqual(
    offered(pickerOf(tree, "pb-template")).map((o) => o.value),
    ["monthly_offer", "winback_offer", "autumn_offer"],
  );

  tree = composing({}, "visit_tomorrow");
  assert.deepEqual(
    fillsOf(tree),
    [
      { kind: "first_name", offers: [] },
      { kind: "business_name", offers: ["business_name", "text"] },
      { kind: "visit_when", offers: [] },
      { kind: "visit_service", offers: [] },
    ],
    "the visit reminder, its visit's words each visit's own",
  );
  assert.ok(slotsOf(tree)[2].props.offers[0].label.includes("Their booked time"));
  assert.ok(
    !textOf(byTestId(tree, "pb-recipe")).includes(" a run"),
    "no cap and no gap: a reminder is owed to every visit",
  );
  assert.equal(byTestId(tree, "pb-cap"), null);
  assert.equal(byTestId(tree, "pb-gap"), null);
});

/* ---------------------------------- what it opens on ---------------------------------- */

test("it opens on the moment's own message, and on nothing when that is not approved -- it opened on whichever sorted first", () => {
  let tree = composing({}, "everyone_monthly");
  assert.ok(faceOf(tree, "pb-template").includes("This month's offer"), faceOf(tree, "pb-template"));
  const chosen = offered(pickerOf(tree, "pb-template")).find(
    (o) => o.value === pickerOf(tree, "pb-template").props.value,
  );
  assert.equal(chosen.group, "Written for this moment", "the message the moment was written with, under its heading");

  // Welcome's own is not held: nothing of the Library's is picked for it, its own reads in the preview to be added, and
  // Turn on adds it first (Ruben, 11 Oct 2026); another of the Library's is one word away.
  tree = composing({}, "new_week");
  const own = contracts.starterForTrigger("new_week");
  assert.ok(faceOf(tree, "pb-template").includes("another message"), `REGRESSION: ${faceOf(tree, "pb-template")}`);
  assert.ok(textOf(byTestId(tree, "pb-starter")).includes(own.title), "its own, written for you, to add");
  assert.equal(byTestId(tree, "pb-save").props.disabled, false, "Turn on adds it, then turns it on");
  assert.equal(textOf(byTestId(tree, "pb-foot-say")), contracts.LIFECYCLE_WORDS.compose.sentence.addsFirst(own.title));
  tree = pick("pb-template", "autumn_offer");
  assert.ok(byTestId(tree, "pb-preview"), "picked, it is drawn");
});

test("New playbook opens on the first moment nothing is doing yet", () => {
  const tree = composing({ rows: [playbook()] });
  assert.equal(pickerOf(tree, "pb-moment").props.value, "new_week");
  assert.equal(faceOf(tree, "pb-moment"), "everyone new this week", "the moment said as the people it names");
});

test("a moment moved to keeps the message chosen when it can send it, and gives way to its own when it cannot", () => {
  let tree = composing({}, "visit_tomorrow");
  assert.ok(faceOf(tree, "pb-template").includes("Visit reminder"));
  tree = pick("pb-moment", "quiet_30");
  assert.ok(
    faceOf(tree, "pb-template").includes("Win-back"),
    `the reminder cannot go to a list: ${faceOf(tree, "pb-template")}`,
  );
  pick("pb-template", "autumn_offer");
  tree = pick("pb-moment", "phoned_only");
  assert.ok(faceOf(tree, "pb-template").includes("Autumn offer"), "a message chosen goes with the owner");
});

/* ---------------------------------- what it sends ---------------------------------- */

test("words to write hold Start until they are written, and the name is the route's until it is typed", async () => {
  let tree = composing({}, "everyone_monthly");
  assert.equal(byTestId(tree, "pb-save").props.disabled, true);
  assert.equal(textOf(byTestId(tree, "pb-foot-say")), "Fill in “The offer” to start it.");
  assert.equal(
    byTestId(tree, "pb-name").props.value,
    "The month's offer",
    "the name the route gives it (contracts playbookName)",
  );
  type(tree, 0, "20% off colour this week.");
  tree = page();
  assert.equal(byTestId(tree, "pb-save").props.disabled, false);
  await press(byTestId(tree, "pb-save"));
  const [verb, body] = said.at(-1);
  assert.equal(verb, "create");
  assert.deepEqual(
    body,
    {
      name: null,
      trigger: "everyone_monthly",
      template_id: "tpl-monthly_offer",
      params: [
        { kind: "first_name" },
        { kind: "business_name" },
        "20% off colour this week.",
        { kind: "booking_link" },
      ],
      // The channels it goes by: WhatsApp alone until the owner ticks others (the Send by row, step 3).
      channels: ["whatsapp"],
      run_hour: 10,
      cap_per_run: 25,
      gap_days: 90,
      cadence_days: 30,
    },
    "no name: the route names it, as the sheet said it would",
  );

  tree = composing({}, "everyone_monthly");
  type(tree, 0, "20% off colour this week.");
  // The name is the kit's Field (surfaces/kit/field/): it says what was typed as `onValueChange`.
  byTestId(page(), "pb-name").props.onValueChange("  October offer ");
  // The month's offer's repeat is its cadence: a person hears it once in that many days.
  pickerOf(page(), "pb-gap").props.onValueChange("60");
  pickerOf(page(), "pb-cap").props.onValueChange("100");
  tree = page();
  assert.ok(textOf(byTestId(tree, "pb-recipe")).includes(" a run"));
  await press(byTestId(tree, "pb-save"));
  const [, named] = said.at(-1);
  assert.equal(named.name, "October offer");
  assert.equal(named.cadence_days, 60);
  assert.equal(named.gap_days, 90);
  assert.equal(named.cap_per_run, 100);
});

test("REGRESSION: a playbook stored with its first name filled by the booking link is put right when it is changed, and its detail says so until then", async () => {
  const broken = playbook({ params: [{ kind: "booking_link" }, { kind: "business_name" }, { kind: "booking_link" }] });
  const edited = [];
  const pane = paneOf(broken, {}, { onEdit: (p) => edited.push(p) });
  const wrong = byTestId(pane, "pb-slot-wrong");
  assert.ok(textOf(wrong).includes("“First name” is filled with the booking link"), textOf(wrong));
  press(byTestId(pane, "pb-slot-wrong-edit"));
  press(byTestId(pane, "pb-edit"));
  assert.deepEqual(edited, [broken, broken], "Edit, in the sentence or at the head, opens the composer on it");
  assert.equal(
    byTestId(paneOf(playbook()), "pb-slot-wrong"),
    null,
    "and a playbook whose slots are right says nothing",
  );

  // Changed: the first name is each person's own again, and Save sends it so.
  let tree = composing({ rows: [broken] }, null, "pb-1");
  assert.equal(fillsOf(tree)[0].kind, "first_name");
  assert.equal(textOf(byTestId(tree, "pb-save")), "Save changes");
  await press(byTestId(tree, "pb-save"));
  const [verb, id, body] = said.at(-1);
  assert.deepEqual([verb, id], ["update", "pb-1"]);
  assert.deepEqual(body.params, [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }]);
  assert.equal(body.name, "Win-back", "a stored name stays its own");
});

test("a playbook whose message has no version a run can send says so when changed, and is never moved to another behind its back", () => {
  const p = playbook({ template_id: "tpl-gone", template_name: "old_offer" });
  const tree = composing({ rows: [p] }, null, "pb-1");
  assert.equal(
    textOf(byTestId(tree, "pb-template-lost")),
    contracts.MESSAGE_GONE_WORDS.composer("Old offer"),
    "said as contracts says it, true of a message on any channel: it has no version a run can send",
  );
  assert.ok(!textOf(byTestId(tree, "pb-template-lost")).includes("WhatsApp"), "and not in WhatsApp's words alone");
  assert.ok(faceOf(tree, "pb-template").includes("Pick a message"), "no other message is put in its place");
  assert.equal(byTestId(tree, "pb-save").props.disabled, true);
});

/* ---------------------------------- the page under it ---------------------------------- */

test("REGRESSION: opening the composer moves nothing on the page -- the unset moments stood down and the cards moved down under a panel; on the home it is a sheet over a rail and a ledger that stay", () => {
  setSurfaceValue("playbooks", playbooksSample(new Date(NOW)));
  const home = (param) => {
    fresh();
    return again(() => CampaignsHome({ param, nowMs: NOW }));
  };
  const rail = (t) => allByTestId(t, "cmh-stage").map((s) => [s.props["data-stage"], s.props["data-state"]]);
  const lines = (t) => allByTestId(t, "cmh-row").map((s) => s.props["data-row"]);
  const before = home(null);
  assert.ok(rail(before).length >= 4, "the moments are on the rail");
  assert.ok(lines(before).length >= 3, "and every campaign is a row of the ledger under them");
  assert.equal(
    find(before, (n) => n.type === PlaybookComposer),
    null,
    "no composer until one is opened",
  );
  const after = home("new:every");
  assert.ok(
    find(after, (n) => n.type === PlaybookComposer),
    "the sheet is open",
  );
  assert.deepEqual(rail(after), rail(before), "every moment is where it was, in the state it was");
  assert.deepEqual(lines(after), lines(before), "and every row of the ledger under them");
  // The composer is hosted in the kit's sheet over the page (home/pane-sheet.tsx): the page behind it stays drawn, and
  // Cancel is the composer's own, which asks first where there are words, then closes the sheet to the home.
  const sheet = find(after, (n) => n.type === PaneSheet);
  assert.equal(sheet.props.open, true);
  assert.ok(
    find(sheet, (n) => n.type === PlaybookComposer),
    "the composer is what the sheet holds",
  );
  press(byTestId(after, "pb-cancel"));
  assert.deepEqual(replaced, ["campaigns"], "Cancel closes it to the home");
});

/* ---------------------------------- the rules, in contracts ---------------------------------- */

test("slotChoices: what keeps a known slot true, anything for a guessed one; templateSlots refuses a message a moment cannot fill; playbookName is the route's", () => {
  const { slotChoices, templateSlots, playbookName } = contracts;
  const o = { known: true, visits: false, bookingLink: true };
  assert.deepEqual(slotChoices("first_name", o), ["first_name"]);
  assert.deepEqual(slotChoices("business_name", o), ["business_name", "text"]);
  assert.deepEqual(slotChoices("booking_link", o), ["booking_link", "text"]);
  assert.deepEqual(slotChoices("booking_link", { ...o, bookingLink: false }), ["text"]);
  assert.deepEqual(slotChoices("visit_when", o), []);
  assert.deepEqual(slotChoices("visit_when", { ...o, visits: true }), ["visit_when"]);
  assert.deepEqual(slotChoices("text", o), ["text"]);
  assert.deepEqual(slotChoices("first_name", { ...o, known: false }), [
    "first_name",
    "text",
    "business_name",
    "booking_link",
  ]);
  assert.deepEqual(slotChoices("text", { known: false, visits: true, bookingLink: false }), [
    "text",
    "first_name",
    "business_name",
    "visit_when",
    "visit_service",
  ]);
  assert.equal(templateSlots(starterRow("visit_reminder"), { visits: false, bookingLink: true }), null);
  assert.equal(templateSlots(starterRow("visit_reminder"), { visits: true, bookingLink: true }).length, 4);
  // The follow-up (0006): its link is each proposal's, on its own moment alone, and a message with no slot for it is
  // not one the follow-up can send.
  const follow = { visits: false, bookingLink: true, proposal: true };
  assert.deepEqual(slotChoices("proposal_link", { ...o, proposal: true }), ["proposal_link"]);
  assert.deepEqual(slotChoices("proposal_link", { ...o, proposal: false }), []);
  assert.equal(templateSlots(starterRow("proposal_follow_up"), follow).length, 3);
  assert.equal(templateSlots(starterRow("proposal_follow_up"), { ...follow, proposal: false }), null);
  assert.equal(templateSlots(starterRow("winback_offer"), follow), null, "a win-back's words carry no proposal");
  assert.equal(
    templateSlots({ name: "our_own", variables: [{ position: 1 }] }, follow).length,
    1,
    "a message written elsewhere may have its slot filled with the link",
  );
  assert.equal(playbookName({ id: "quiet_30", label: "Win-back" }, { name: "winback_offer" }), "Win-back");
  assert.equal(
    playbookName({ id: "quiet_30", label: "Win-back" }, { name: "autumn_offer", title: "Autumn offer" }),
    "Win-back · Autumn offer",
  );
});

test("the detail says what it keeps to: the workspace's mode for its class, and for a visit trigger the day's visits and one message each", () => {
  // Once four source pins on outbound-real.jsx; run here since the detail and its words are their own files (Reach out
  // Part 2.5).
  const pane = paneOf(playbook());
  const rule = find(pane, (n) => n.type === CmRuleWord);
  assert.equal(rule?.props.cls, "reengage", "the rule's word is the playbook's class, which opens Settings › Autonomy");

  const visit = paneOf(
    playbook({ id: "pb-v", name: "The day before", trigger: "visit_tomorrow", policy_class: "booking" }),
  );
  const tip = find(
    visit,
    (n) => typeof n.props?.["data-tip"] === "string" && n.props["data-tip"].includes("the day's visits"),
  );
  assert.ok(tip, "a visit playbook's count says the day's visits are picked from the people who said yes");
  assert.match(tip.props["data-tip"], /^Everyone with a recorded yes — the day's visits are picked from them/);

  // The guardrails: who it reaches for the channels it goes by (contracts consentGuardWords), the moment's own rule, and
  // who the wire holds back (contracts heldBackWords). WhatsApp's reach is a recorded yes and a phone number.
  const guard = pbGuardWords({ kind: "visit", word: "visit" }, ["whatsapp"], "conversational");
  assert.equal(
    guard,
    "Only people with a recorded yes to hearing from you and a phone number. One message per visit. People who asked to stop, have no phone number, or are mid-thread with a person are held back at the wire.",
  );
  assert.doesNotMatch(guard, /gap|a week/, "no gap and no breath are promised for a visit trigger");
  assert.match(
    pbGuardWords({ kind: "list", word: "visit" }, ["whatsapp"], "marketing"),
    /^Only people with a recorded yes to offers and a phone number\. Never twice within its gap, and one campaign message per person a week, across every campaign\./,
  );
  assert.match(
    pbGuardWords({ kind: "deal", word: "visit" }, ["whatsapp"], "conversational"),
    /Their proposal has its link and nothing back\. One message per proposal, and one campaign message per person a week, across every campaign\./,
  );
  // An offer by email asks no recorded yes and no number: a yes to offers by email or a relationship on record, and an
  // address that works, and the wire's holds name an address, not a number.
  const byMail = pbGuardWords({ kind: "list", word: "visit" }, ["email"], "marketing");
  assert.ok(
    byMail.startsWith(
      "Only people with a yes to offers by email or a relationship with you on record, and an email address that works.",
    ),
    byMail,
  );
  assert.doesNotMatch(byMail, /phone number|a number/);
  assert.match(byMail, /have no email address that works/);
});

test("the drawer and the composer say the workspace's own word for an appointment, never a visit written in (spec §4.8)", () => {
  const session = { shape: { calendar: "feed", dealsOn: false, word: "session" } };
  const W = contracts.appointmentWords("session");
  // The composer's sentence, on each moment of the appointment: the moment is the people it names.
  const before = faceOf(composing(session, "visit_tomorrow"), "pb-moment");
  assert.equal(before, W.tomorrowWho);
  assert.equal(before, "everyone with a session tomorrow");
  const after = faceOf(composing(session, "visited"), "pb-moment");
  assert.equal(after, W.yesterdayWho);
  assert.doesNotMatch(before + after, /\bvisit/i);
  // Its guardrails, behind the reach line.
  const guard = find(composing(session, "visit_tomorrow"), (n) => n.type === CmReachLine).props.guard;
  assert.match(guard, /One message per session\./);
  assert.equal(
    pbGuardWords({ kind: "visit", word: "session" }, ["whatsapp"], "conversational"),
    "Only people with a recorded yes to hearing from you and a phone number. One message per session. People who asked to stop, have no phone number, or are mid-thread with a person are held back at the wire.",
  );
  // The drawer's count: the day's sessions are picked from the people who said yes.
  const pane = paneOf(
    playbook({ id: "pb-v", name: "The day before", trigger: "visit_tomorrow", policy_class: "booking" }),
    session,
  );
  const tip = find(pane, (n) => n.props?.["data-testid"] === "pb-audience");
  assert.match(tip.props["data-tip"], /^Everyone with a recorded yes — the day's sessions are picked from them/);
});

/* ------------------------------- Send by (One message, every channel, step 3) ------------------------------- */

const { Tooltip } = await import(`${SRC}/surfaces/kit/tooltip/tooltip.tsx`);

/** The workspace's channels as the page reads them (server/campaigns/channels-ready.ts): WhatsApp, a text line, a mailbox. */
const ALL_READY = contracts.channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true },
});
const NO_TEXT_NO_MAIL = contracts.channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: null,
  email: { mailbox: false, domain: true },
});
/** One count of a moment, as the route makes it: who a run reaches now, who it leaves out and why, and on which channel. */
const poolOf = (over = {}) => ({
  candidates: 10,
  held: 0,
  pool: 20,
  noYes: 4,
  stopped: 0,
  noNumber: 6,
  saidYes: 16,
  no_address: 0,
  no_channel: 0,
  by_channel: { whatsapp: 10, sms: 0, email: 0 },
  ...over,
});
/**
 * A visit reminder's moment counted for each set of channels a playbook on it may tick (surface.ts `pools`): twenty
 * people it names, ten it reaches on WhatsApp, eight with an address, fourteen by either (ten on WhatsApp, four more by email).
 */
const VISIT_POOL = poolOf({
  by: [
    poolOf({
      channels: ["email"],
      candidates: 8,
      noYes: 0,
      noNumber: 0,
      no_address: 12,
      by_channel: { whatsapp: 0, sms: 0, email: 8 },
    }),
    poolOf({
      channels: ["whatsapp", "email"],
      candidates: 14,
      noYes: 0,
      noNumber: 0,
      no_address: 6,
      by_channel: { whatsapp: 10, sms: 0, email: 4 },
    }),
  ],
});
/**
 * The message the surface stamps on a template it offers (surfaces/campaigns/parts/channels.ts cmOfferedMessages), made as the
 * reader makes it, of a row on each channel the template holds: what the Send by row reads a closed channel's words from.
 */
const withMessage = (t) => ({
  ...t,
  message: contracts.campaignMessageOf(
    t.channels.map((channel) => ({ ...t, id: channel === "whatsapp" ? t.id : `${t.id}-${channel}`, channel })),
    t.name,
    t.language,
  ),
});
/** A message with a version on each channel; the offer, WhatsApp's alone. */
const reminderRow = (channels = ["whatsapp", "sms", "email"]) =>
  withMessage({ ...starterRow("visit_reminder"), channels });
const viaSurface = (over = {}) =>
  surface({
    ready: ALL_READY,
    pools: { visit_tomorrow: VISIT_POOL },
    templates: [reminderRow(), { ...starterRow("monthly_offer"), channels: ["whatsapp"] }],
    ...over,
  });
/**
 * The Send by row's toggles by channel (parts/send-by.tsx: a capsule each, a switch to a screen reader), read as the
 * switches they replaced were read: whether it is on, whether it takes no press, what describes it, and a press that asks
 * for a state, which presses the toggle where its state is not that one already.
 */
const viaOf = (tree) =>
  Object.fromEntries(
    ["whatsapp", "sms", "email"].map((c) => {
      const one = byTestId(tree, `pb-via-${c}`);
      return [
        c,
        one && {
          props: {
            role: one.props.role,
            checked: one.props["aria-checked"],
            readOnly: one.props["data-fixed"] === "true",
            describedBy: one.props["aria-describedby"],
            onCheckedChange: (on) => {
              if (on !== one.props["aria-checked"]) one.props.onClick();
            },
          },
        },
      ];
    }),
  );
const composingVia = (over = {}, moment = "visit_tomorrow") => composing(viaSurface(over), moment);
/** Why each closed channel is closed, under its word in the channels' list (a channel that says nothing says none). */
const reasonsOf = (tree) =>
  Object.fromEntries(
    ["whatsapp", "sms", "email"].flatMap((c) => {
      const why = byTestId(tree, `pb-via-${c}-why`);
      return why ? [[c, textOf(why)]] : [];
    }),
  );

test("Send by: a switch for each channel after what it says, every open channel on for a new playbook, and a closed channel is off and says why", () => {
  let tree = composingVia();
  assert.ok(byTestId(tree, "pb-via"), "the row is drawn");
  assert.equal(find(byTestId(tree, "pb-via"), (n) => n.props?.role === "group").props["aria-label"], "Send by");
  const via = viaOf(tree);
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => via[c].props.role),
    ["switch", "switch", "switch"],
    "each channel a switch to a screen reader",
  );
  // Every channel the workspace is ready on and the message holds (8 Oct 2026, decision 5): a person is reached once, on
  // their best channel, so each tick widens who is reached and never doubles a message.
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => via[c].props.checked),
    [true, true, true],
    "every open channel, for a message about their visit",
  );
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => via[c].props.readOnly),
    [false, false, false],
    "none is the last one on: each may be turned off",
  );
  // All three open and on: nothing needs saying of any.
  assert.deepEqual(Object.keys(reasonsOf(tree)), []);
  // Two turned off: the one left on stays on, and says so.
  via.sms.props.onCheckedChange(false);
  viaOf(page()).email.props.onCheckedChange(false);
  tree = page();
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => [viaOf(tree)[c].props.checked, viaOf(tree)[c].props.readOnly]),
    [
      [true, true],
      [false, false],
      [false, false],
    ],
    "WhatsApp alone, as every playbook went: it stays on, the others may be turned on",
  );
  assert.deepEqual(Object.keys(reasonsOf(tree)), ["whatsapp"]);
  // The offer: texts carry no offers and offers by email wait for their release.
  tree = composingVia({}, "everyone_monthly");
  const offer = viaOf(tree);
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => [offer[c].props.checked, offer[c].props.readOnly]),
    [
      [true, true],
      [false, true],
      [false, true],
    ],
  );
  assert.equal(reasonsOf(tree).sms, "Texts carry no offers.");
  assert.equal(reasonsOf(tree).email, "Offers by email start once the campaigns domain is set up.");
  // Each reason is the switch's own description too, and stands under its word, where a finger reads it.
  const why = byTestId(tree, "pb-via-sms-why");
  assert.equal(textOf(why), "Texts carry no offers.");
  assert.equal(offer.sms.props.describedBy, why.props.id);
  // Pressing a closed channel changes nothing, and its reason stays where it was.
  offer.sms.props.onCheckedChange(true);
  assert.equal(viaOf(page()).sms.props.checked, false);
  assert.equal(reasonsOf(page()).sms, "Texts carry no offers.");
  assert.equal(byTestId(page(), "pb-via-whys"), null, "no line under the list says a reason a second time");
});

test("a paused workspace is said in the playbook's foot as a note, never a refusal: it can still be saved and runs once billing resumes", () => {
  // The visit reminder is about their own visit: its email goes whatever the workspace's offers are doing, and the pause does not
  // change what each channel can do.
  const paused = { ...ALL_READY, paused: true };
  const live = composingVia();
  assert.equal(textOf(byTestId(live, "pb-foot-say")), "", "nothing under the foot while it is not paused");
  const tree = composingVia({ ready: paused });
  assert.equal(textOf(byTestId(tree, "pb-foot-say")), contracts.CAMPAIGNS_PAUSED_WORDS);
  assert.equal(byTestId(tree, "pb-foot-say").props["data-tone"], "plain", "a note, not an error");
  assert.equal(byTestId(tree, "pb-save").props.disabled, false, "Save is not held by it");
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => viaOf(tree)[c].props.readOnly),
    ["whatsapp", "sms", "email"].map((c) => viaOf(live)[c].props.readOnly),
    "and each channel says what it can do",
  );
  // What else is missing is said first: the pause is the last thing the foot says.
  const noMessage = composing(viaSurface({ ready: paused, templates: [] }), "everyone_monthly");
  assert.notEqual(textOf(byTestId(noMessage, "pb-foot-say")), contracts.CAMPAIGNS_PAUSED_WORDS);
});

test("Send by: a workspace with no texting line or mailbox says what is missing, a message with no version on a channel says so, and an unread workspace offers WhatsApp alone", () => {
  let tree = composingVia({ ready: NO_TEXT_NO_MAIL });
  assert.equal(reasonsOf(tree).sms, "No texting line yet.");
  assert.equal(reasonsOf(tree).email, "Set up email in Settings › Connections first.");
  assert.equal(viaOf(tree).email.props.readOnly, true);
  // The reminder has no text version: the workspace's line is ready, the message is not.
  tree = composingVia({ templates: [reminderRow(["whatsapp", "email"])] });
  assert.equal(reasonsOf(tree).sms, "This message has no text version yet.");
  assert.equal(viaOf(tree).sms.props.readOnly, true);
  assert.equal(viaOf(tree).email.props.readOnly, false, "its email version is there");
  // The workspace's channels could not be read: WhatsApp as it was, the others not offered, and the page says it could not tell.
  tree = composingVia({ ready: null });
  assert.equal(viaOf(tree).whatsapp.props.checked, true);
  assert.equal(reasonsOf(tree).email, "This could not be checked just now.");
  assert.equal(reasonsOf(tree).sms, "This could not be checked just now.");
});

test("the reach says who it reaches on which channel as the owner ticks, and who has no address: the count is the one for the channels it goes by", () => {
  let tree = composingVia();
  // The line's words, the press that opens the rest (the kit popover's trigger, which the stub draws and does not walk).
  const reach = (t) =>
    textOf(
      find(byTestId(t, "pb-reach"), (n) => n.type === Popover && n.props.label === "Who's held back").props.trigger,
    );
  // What the reasons say, behind the line (the kit popover's children, which the stub does not open).
  const heldText = (t) =>
    textOf(
      find(byTestId(t, "pb-reach"), (n) => n.type === Popover && n.props.label === "Who's held back")?.props.children,
    );
  // Every open channel is on as it opens (decision 5): the count is the one for that set, the split said after it.
  assert.equal(textOf(byTestId(tree, "pb-reach-by")), "10 on WhatsApp, 4 by email");
  assert.ok(reach(tree).startsWith("14 of 20 can hear it"), reach(tree));
  // WhatsApp alone, as every playbook went: nothing new is said, the reach is what it always was.
  viaOf(tree).sms.props.onCheckedChange(false);
  viaOf(page()).email.props.onCheckedChange(false);
  tree = page();
  assert.equal(byTestId(tree, "pb-reach-by"), null, "WhatsApp alone says nothing new: the reach is what it always was");
  assert.ok(reach(tree).startsWith("10 of 20 can hear it"), reach(tree));
  // Email too: fourteen, ten on WhatsApp and four more by email, six with neither.
  viaOf(tree).email.props.onCheckedChange(true);
  tree = page();
  assert.deepEqual(
    ["whatsapp", "email"].map((c) => viaOf(tree)[c].props.checked),
    [true, true],
  );
  // The To line's clause after the count; who has no address is behind "Who's held back".
  assert.equal(textOf(byTestId(tree, "pb-reach-by")), "10 on WhatsApp, 4 by email");
  assert.ok(reach(tree).startsWith("14 of 20 can hear it"), reach(tree));
  assert.ok(heldText(tree).includes("6 have no email address on file"), heldText(tree));
  // Both on, so WhatsApp may go: email alone reaches eight, and twelve have no address.
  viaOf(tree).whatsapp.props.onCheckedChange(false);
  tree = page();
  assert.equal(textOf(byTestId(tree, "pb-reach-by")), "8 by email");
  assert.ok(reach(tree).startsWith("8 of 20 can hear it"), reach(tree));
  assert.ok(heldText(tree).includes("12 have no email address on file"), heldText(tree));
  assert.equal(viaOf(tree).email.props.readOnly, true, "the last one on stays on");
  assert.equal(viaOf(tree).whatsapp.props.readOnly, false);
  // Back to WhatsApp alone: the line goes.
  viaOf(tree).whatsapp.props.onCheckedChange(true);
  viaOf(page()).email.props.onCheckedChange(false);
  tree = page();
  assert.equal(byTestId(tree, "pb-reach-by"), null);
});

test("the reasons under the reach are contracts' reachLines alone: no address, an address that stopped and no channel each have their line, and the page types none of them", () => {
  const email = { whatsapp: 0, sms: 0, email: 8 };
  const pool = poolOf({
    by: [
      poolOf({
        channels: ["email"],
        candidates: 8,
        noYes: 0,
        noNumber: 0,
        no_address: 5,
        address_stopped: 3,
        no_channel: 2,
        by_channel: email,
      }),
    ],
  });
  const tree = composingVia({ pools: { visit_tomorrow: pool } });
  viaOf(tree).email.props.onCheckedChange(true);
  viaOf(page()).whatsapp.props.onCheckedChange(false);
  const held = find(byTestId(page(), "pb-reach"), (n) => n.type === Popover && n.props.label === "Who's held back");
  const text = textOf(held.props.children);
  assert.ok(text.includes("5 have no email address on file"), text);
  assert.ok(text.includes("3 have an email address mail no longer goes to"), text);
  assert.ok(text.includes("2 have no channel this message can go by here"), text);
  assert.ok(
    text.indexOf("5 have no") < text.indexOf("3 have an") && text.indexOf("3 have an") < text.indexOf("2 have no"),
    "the most first",
  );
});

test("the guardrails say who the run reaches for the channels it goes by, first in the shield's tip, and on no line of their own", () => {
  let tree = composingVia();
  assert.equal(byTestId(tree, "pb-guard-who"), null, "the reach line says who it reaches: no line says it again");
  // What the guardrails say first, behind the reach line: who it reaches, then the moment's rule and who the wire holds back.
  const tip = (t) => find(t, (n) => n.type === CmReachLine).props.guard;
  const who = (t) => {
    const words = tip(t);
    const at = words.indexOf(" One message per");
    const cut = at >= 0 ? at : words.indexOf(" Never twice");
    return cut >= 0 ? words.slice(0, cut) : words;
  };
  // Every open channel on as it opens (decision 5): one line for each way they differ, from the one predicate.
  assert.equal(
    who(tree),
    contracts.consentGuardWords(["whatsapp", "sms", "email"], "conversational", "theirs").join(" "),
  );
  // WhatsApp alone, a message about their visit: a recorded yes to hearing from you and a phone number.
  viaOf(tree).sms.props.onCheckedChange(false);
  viaOf(page()).email.props.onCheckedChange(false);
  tree = page();
  assert.equal(who(tree), "Only people with a recorded yes to hearing from you and a phone number.");
  assert.ok(tip(tree).length > who(tree).length, "the tip says it first, with the rest");
  // Email ticked too: one line for each way they differ, from the one predicate (contracts consentGuardWords), so an email
  // is never said to ask a recorded yes and a number.
  viaOf(tree).email.props.onCheckedChange(true);
  tree = page();
  // A visit's message is theirs (contracts messageAboutOfTrigger, decision D1): by email it asks an address and no yes.
  assert.equal(who(tree), contracts.consentGuardWords(["whatsapp", "email"], "conversational", "theirs").join(" "));
  assert.ok(who(tree).includes("an email address that works"));
  assert.ok(tip(tree).includes("have no phone number or no email address that works"));
  // An offer: WhatsApp's recorded yes to offers.
  tree = composingVia({}, "everyone_monthly");
  assert.equal(who(tree), "Only people with a recorded yes to offers and a phone number.");
});

test("Save sends the channels it goes by: every open channel by default, the ones ticked when changed, and the ones a playbook has when it is changed", async () => {
  let tree = composingVia();
  await press(byTestId(tree, "pb-save"));
  assert.deepEqual(
    said.at(-1)[1].channels,
    ["whatsapp", "sms", "email"],
    "a new playbook names every channel the workspace is ready on and its message holds (decision 5), in the page's order",
  );
  tree = composingVia();
  viaOf(tree).sms.props.onCheckedChange(false);
  await press(byTestId(page(), "pb-save"));
  assert.deepEqual(said.at(-1)[1].channels, ["whatsapp", "email"], "the ones ticked when changed");
  // A playbook that goes by WhatsApp and email opens on both, and saves them.
  const mine = playbook({
    id: "pb-visit",
    name: "Visit reminder",
    trigger: "visit_tomorrow",
    template_id: "tpl-visit_reminder",
    template_name: "visit_reminder",
    policy_class: "booking",
    poolKey: "visit_tomorrow",
    channels: ["whatsapp", "email"],
    candidates: 14,
  });
  tree = composing(viaSurface({ rows: [mine] }), null, "pb-visit");
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => viaOf(tree)[c].props.checked),
    [true, false, true],
    "its own channels",
  );
  assert.equal(textOf(byTestId(tree, "pb-reach-by")), "10 on WhatsApp, 4 by email");
  await press(byTestId(tree, "pb-save"));
  const [verb, id, body] = said.at(-1);
  assert.deepEqual([verb, id, body.channels], ["update", "pb-visit", ["whatsapp", "email"]]);
});

// A playbook keeps a ticked channel that cannot send yet (its run holds those people until it can): saving it never drops
// the channel the owner chose. A broadcast goes now, so there a closed channel cannot be ticked.
test("a workspace that cannot send on any channel the playbook ticks still saves it, and keeps the channel it ticks, waiting", async () => {
  const none = contracts.channelsReady({
    whatsapp: null,
    textLine: null,
    email: { mailbox: false, domain: false },
  });
  const tree = composingVia({ ready: none });
  assert.equal(viaOf(tree).whatsapp.props.checked, true, "WhatsApp stays ticked: it waits for a number");
  assert.equal(
    reasonsOf(tree).whatsapp,
    `${contracts.CHANNEL_WORDS.noWhatsApp} It sends once it can. Keep at least one on.`,
    "and says why it waits, and why it stays",
  );
  // It is all the playbook keeps: switched off it would keep none, and a save that names none keeps what it had, so the
  // switch would have said one thing and the playbook another.
  assert.equal(viaOf(tree).whatsapp.props.readOnly, true, "the one channel it keeps takes no press");
  assert.equal(byTestId(tree, "pb-save").props.disabled, false, "a playbook may be set up before a channel is");
  await press(byTestId(tree, "pb-save"));
  assert.deepEqual(said.at(-1)[1].channels, ["whatsapp"], "the channel it ticks is kept");
});

test("where the workspace can send on nothing, Send by says so once with a door for each channel a setting mends, and the number's warning is not said twice", () => {
  const none = contracts.channelsReady({
    whatsapp: null,
    textLine: null,
    email: { mailbox: false, domain: true },
  });
  const tree = composingVia({ ready: none, number: { present: false, health: { canSend: false } } });
  const standing = byTestId(tree, "pb-via-standing");
  assert.ok(standing, "the row says where the workspace stands");
  const parts = contracts.channelsStandingParts(none);
  assert.equal(textOf(standing), parts.map((p) => p.words).join("·"), "contracts' words, part by part");
  assert.match(textOf(standing), /^Nothing can send yet/);
  // The link itself: the stub walks a component and what it draws, and each carries the test id.
  const doors = allByTestId(standing, "pb-via-standing-door").filter((n) => n.type === "a");
  assert.equal(doors.length, 3);
  for (const door of doors) assert.match(String(door.props.href), /admin\/integrations$/);
  // In place of the reason line, which the standing line has just given: the channel the playbook keeps says it waits on
  // its own toggle, without its reason a second time.
  assert.equal(byTestId(tree, "pb-via-whys"), null);
  assert.match(textOf(byTestId(tree, "pb-via-whatsapp")), /WhatsApp · waits/);
  assert.equal(byTestId(tree, "pb-number"), null, "the number's own warning would be the same thing said twice");
  assert.equal(viaOf(tree).whatsapp.props.checked, true, "and the playbook still keeps the channel it ticks, waiting");
  // A workspace paused for billing is not one that can send on nothing: the sheet says the pause where Save is, and
  // the row keeps what it says of each channel.
  const paused = composingVia({ ready: { ...ALL_READY, paused: true } });
  assert.equal(byTestId(paused, "pb-via-standing"), null);
  // Anything open, or a readiness that was not read: the row is what it was, and the number's warning stands.
  const some = composingVia({ ready: NO_TEXT_NO_MAIL, number: { present: false, health: { canSend: false } } });
  assert.equal(byTestId(some, "pb-via-standing"), null);
  assert.ok(byTestId(some, "pb-number"));
  assert.equal(byTestId(composingVia({ ready: null }), "pb-via-standing"), null);
});

test("Send by before a message is picked: a switch is closed by what the workspace cannot send on, never by a version no message has yet", () => {
  // The moment's own message is not approved and nothing else is offered: the sheet opens on no message.
  const tree = composingVia({ templates: [] });
  assert.equal(viaOf(tree).email.props.readOnly, false, "email is open before a message is picked");
  assert.equal(viaOf(tree).sms.props.readOnly, false);
  assert.ok(
    Object.values(reasonsOf(tree)).every((why) => !/version/.test(why)),
    "no switch says a message it does not have yet lacks a version",
  );
  // Once a message is picked its versions are asked after, as before.
  const picked = composingVia({ templates: [reminderRow(["whatsapp", "email"])] });
  assert.match(reasonsOf(picked).sms, /no text version/);
});

test("a channel a playbook ticks that closes later stays ticked, says it waits, and is saved: never dropped by a save", async () => {
  const noMailbox = { ...ALL_READY, email: { ready: false, why: contracts.CHANNEL_WORDS.noMailbox } };
  const mine = playbook({
    id: "pb-visit",
    name: "Visit reminder",
    trigger: "visit_tomorrow",
    template_id: "tpl-visit_reminder",
    template_name: "visit_reminder",
    policy_class: "booking",
    poolKey: "visit_tomorrow",
    channels: ["whatsapp", "email"],
    candidates: 10,
  });
  const tree = composing(viaSurface({ rows: [mine], ready: noMailbox }), null, "pb-visit");
  assert.equal(viaOf(tree).email.props.checked, true, "email stays ticked while the mailbox is missing");
  assert.equal(reasonsOf(tree).email, `${contracts.CHANNEL_WORDS.noMailbox} It sends once it can.`);
  await press(byTestId(tree, "pb-save"));
  assert.deepEqual(said.at(-1)[2].channels, ["whatsapp", "email"], "and is saved with the playbook");
});

/** A visit's reminder that goes by all three, in a workspace whose texting line is not there yet: its text waits. */
const NO_LINE = { ...ALL_READY, sms: { ready: false, why: contracts.CHANNEL_WORDS.noTextLine } };
const reminderOnAll = (over = {}) =>
  playbook({
    id: "pb-visit",
    name: "Visit reminder",
    trigger: "visit_tomorrow",
    template_id: "tpl-visit_reminder",
    template_name: "visit_reminder",
    policy_class: "booking",
    poolKey: "visit_tomorrow",
    channels: ["whatsapp", "sms", "email"],
    candidates: 10,
    ...over,
  });
const checkedOf = (tree) => ["whatsapp", "sms", "email"].map((c) => viaOf(tree)[c].props.checked);
/** Lets a press that awaits its verb finish. */
const settled = () => new Promise((done) => setImmediate(done));

test("REGRESSION: a press on one switch never lets go a channel that waits -- it started from what was on, and a playbook lost a channel nobody had switched off", async () => {
  const tree = composing(viaSurface({ rows: [reminderOnAll()], ready: NO_LINE }), null, "pb-visit");
  assert.deepEqual(checkedOf(tree), [true, true, true], "the text it keeps is ticked, waiting for a line");
  assert.equal(viaOf(tree).sms.props.readOnly, false, "and may be let go by its own switch");
  viaOf(tree).email.props.onCheckedChange(false);
  assert.deepEqual(checkedOf(page()), [true, true, false], "Email off: the text it keeps is kept");
  await press(byTestId(page(), "pb-save"));
  assert.deepEqual(said.at(-1)[2].channels, ["whatsapp", "sms"], "and saved");
});

test("the drawer's Goes by row: a press sends the channels it keeps, alone; one that waits is never let go; and the page says what it goes by now", async () => {
  const flashed = [];
  const draw = (p, over = {}, acts = {}) =>
    paneOf(p, { ...viaSurface({ rows: [p], ...over }) }, { flash: (t) => flashed.push(t), ...acts });
  let pane = draw(reminderOnAll(), { ready: NO_LINE });
  assert.equal(byTestId(pane, "pb-via").props["aria-label"], "Goes by", "named to a screen reader as it is labelled");
  assert.deepEqual(checkedOf(pane), [true, true, true]);
  assert.equal(reasonsOf(pane).sms, `${contracts.CHANNEL_WORDS.noTextLine} It sends once it can.`);
  viaOf(pane).email.props.onCheckedChange(false);
  await settled();
  assert.deepEqual(said.at(-1), ["channels", "pb-visit", ["whatsapp", "sms"]], "the channels, and nothing else of it");
  assert.deepEqual(
    flashed.at(-1).msg.props.parts,
    contracts.LIFECYCLE_TOAST.channels("Visit reminder", ["whatsapp", "sms"], false),
    "said in the page's sentence: Visit reminder goes by WhatsApp and Text now",
  );
  assert.equal(
    said.some(([verb]) => verb === "update"),
    false,
    "never the playbook whole: a copy of the rest wrote over whatever had been edited since",
  );

  // A run of it already waits: it was made with the channels the playbook had, and the receipt says so.
  const waiting = reminderOnAll({
    channels: ["whatsapp", "email"],
    totals: {
      ...playbook().totals,
      waiting: { id: "b-1", recipient_count: 4, run_for: "2026-10-08", trigger: "visit_tomorrow" },
    },
  });
  pane = draw(waiting);
  viaOf(pane).email.props.onCheckedChange(false);
  await settled();
  assert.deepEqual(said.at(-1), ["channels", "pb-visit", ["whatsapp"]]);
  assert.deepEqual(
    flashed.at(-1).msg.props.parts,
    contracts.LIFECYCLE_TOAST.channels("Visit reminder", ["whatsapp"], true),
  );

  // What was not read is not guessed: without its message (the templates could not be read, or it was deleted) the row
  // shows what it keeps, says no reason of a message nobody read, and takes no press.
  for (const templates of [null, []]) {
    pane = draw(reminderOnAll({ channels: ["whatsapp", "email"] }), { templates });
    assert.deepEqual(checkedOf(pane), [true, false, true], "what it keeps");
    assert.deepEqual(reasonsOf(pane), {}, "no reason invented");
    assert.deepEqual(
      ["whatsapp", "sms", "email"].map((c) => viaOf(pane)[c].props.readOnly),
      [true, true, true],
    );
  }
  // A role that may not change it sees the switches still.
  pane = draw(reminderOnAll({ channels: ["whatsapp", "email"] }), {}, { canAct: false });
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => viaOf(pane)[c].props.readOnly),
    [true, true, true],
  );
});

test("a new playbook's ticks follow the message in view until a switch is pressed, then they are the owner's", () => {
  // Offers by email can go here; a text never carries one.
  const ready = contracts.channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: { sms_state: "active", reg_mock: false },
    email: { mailbox: true, domain: true, offers: { campaigns: true, address: true, paused: null } },
  });
  const autumn = withMessage({ ...ownRow(), channels: ["whatsapp", "email"] });
  const winter = withMessage({
    ...ownRow({ id: "tpl-own-2", name: "winter_offer", title: "Winter offer" }),
    channels: ["whatsapp"],
  });
  // The win-back's own message is not among the workspace's: nothing is picked, and it stands on WhatsApp alone.
  let tree = composing(viaSurface({ templates: [autumn, winter], ready }), "quiet_30");
  assert.ok(faceOf(tree, "pb-template").includes("another message"), faceOf(tree, "pb-template"));
  assert.deepEqual(checkedOf(tree), [true, false, false]);
  // The message picked says where it can go: every channel it holds that the workspace can send an offer on.
  assert.deepEqual(checkedOf(pick("pb-template", "autumn_offer")), [true, false, true], "WhatsApp and email");
  assert.deepEqual(checkedOf(pick("pb-template", "winter_offer")), [true, false, false], "it holds WhatsApp alone");
  tree = pick("pb-template", "autumn_offer");
  assert.deepEqual(checkedOf(tree), [true, false, true], "and back: still the message's");
  // A press makes them the owner's: another message no longer moves them.
  viaOf(tree).email.props.onCheckedChange(false);
  assert.deepEqual(checkedOf(page()), [true, false, false]);
  pick("pb-template", "winter_offer");
  assert.deepEqual(checkedOf(pick("pb-template", "autumn_offer")), [true, false, false], "the owner's, kept");
});

test("the number's warning is said while the playbook goes by WhatsApp, the one channel that has a number, and never to one that goes by email alone", () => {
  let tree = composingVia({ number: { present: false, health: { canSend: false } } });
  assert.ok(byTestId(tree, "pb-number"), "WhatsApp is ticked and there is no number: it says so, as it did");
  viaOf(tree).email.props.onCheckedChange(true);
  viaOf(page()).whatsapp.props.onCheckedChange(false);
  tree = page();
  assert.equal(byTestId(tree, "pb-number"), null, "email alone never asks");
});

/* ------------------------- The preview by channel, a lighter To row, the split as a bar ------------------------- */

const { Meter } = await import(`${SRC}/surfaces/kit/meter/meter.tsx`);

/** The visit reminder with a version of its own on each channel, each in its own words. */
const reminderWithVersions = () => ({
  ...reminderRow(),
  versions: {
    email: { subject: "Your visit, {{1}}", body: "Hi {{1}},\nsee you {{3}}." },
    sms: { subject: null, body: "Hi {{1}}, see you {{3}} (text)." },
  },
});
/** The words a preview says, a slot as the words it shows (the stub draws the slot's control, not its words, as a leaf). */
const wordsOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(wordsOf).join("");
  if (n.type === CmSlot) return n.props.text;
  return wordsOf(n.rendered !== undefined ? n.rendered : n.props?.children);
};
const classOf = (n) => String(n.props?.className || "");
/** What the preview and its walk say now. */
const previewNow = (tree) => {
  const step = byTestId(tree, "mp-step");
  const name = (c) => find(tree, (n) => classOf(n) === c);
  return {
    step: step ? textOf(step) : null,
    via: byTestId(tree, "mp-via") ? textOf(byTestId(tree, "mp-via")) : null,
    mail: !!find(tree, (n) => classOf(n).includes("mp-mail-frame")),
    subject: name("mp-subject") ? wordsOf(name("mp-subject")) : null,
    words: wordsOf(name("mp-body")),
    foot: byTestId(tree, "mp-mail-foot")
      ? textOf(byTestId(tree, "mp-mail-foot"))
      : name("mp-foot")
        ? textOf(name("mp-foot"))
        : null,
  };
};
const nextChannel = () =>
  press(find(byTestId(page(), "mp-step"), (n) => n.props?.["aria-label"] === "The next channel"));

test("the preview steps through the channels the playbook goes by, each as that channel's version -- a playbook names no one, so the walk is its channels, with how many people each carries", () => {
  let tree = composingVia({ templates: [reminderWithVersions()] });
  // WhatsApp alone, as every playbook went: one bubble, nothing said of channels, no walk.
  viaOf(tree).sms.props.onCheckedChange(false);
  viaOf(page()).email.props.onCheckedChange(false);
  tree = page();
  assert.equal(byTestId(tree, "mp-via"), null);
  assert.equal(byTestId(tree, "mp-step"), null);
  viaOf(tree).email.props.onCheckedChange(true);
  tree = page();
  // WhatsApp first: its template, the channel named, and how many it carries.
  let now = previewNow(tree);
  // The walk over the bubble names the channel; no label over it says it again (the preview is bare, 11 Oct 2026).
  assert.deepEqual([now.step, now.via, now.mail], ["On WhatsApp10 people", null, false]);
  assert.ok(now.words.startsWith("Hi Dani"), now.words);
  // Then the email: a mail, its subject, its words with the visit's time, and the foot the sender adds for a visit.
  nextChannel();
  now = previewNow(page());
  assert.deepEqual(
    [now.step, now.via, now.mail, now.subject, now.words],
    ["By email4 people", null, true, "Your visit, Dani", "Hi Dani,\nsee you tomorrow at 2:00 PM."],
  );
  assert.equal(
    now.foot,
    contracts.emailFoot(
      "Northside Studio",
      null,
      { kind: "visit", facts: { visit_when: "tomorrow at 2:00 PM" } },
      "en_US",
    ),
    "the foot is the one the run sends (contracts emailFoot), with a visit's reason",
  );
  assert.ok(now.foot.startsWith("You're getting this because of your appointment with Northside Studio."));
  assert.ok(now.foot.includes("Reply STOP to stop these emails."));
  // Back to the first, from the last: the walk wraps.
  nextChannel();
  assert.ok(previewNow(page()).step.startsWith("On WhatsApp"));
  // Text too: three channels to walk, the text's bubble with its STOP line between them.
  viaOf(page()).sms.props.onCheckedChange(true);
  tree = page();
  assert.equal(
    all(byTestId(tree, "mp-step"), (n) => classOf(n) === "mp-step-name").length,
    1,
    "one step in view at a time",
  );
  nextChannel();
  now = previewNow(page());
  assert.ok(now.step.startsWith("By text"), now.step);
  assert.deepEqual(
    [now.mail, now.words, now.foot],
    [false, "Hi Dani, see you tomorrow at 2:00 PM (text).", "Reply STOP to opt out"],
  );
  // Email alone is one channel: no walk, but its own preview, named.
  viaOf(page()).email.props.onCheckedChange(true);
  viaOf(page()).whatsapp.props.onCheckedChange(false);
  viaOf(page()).sms.props.onCheckedChange(false);
  now = previewNow(page());
  assert.deepEqual([now.step, now.mail], [null, true], "no walk through one channel, and not WhatsApp's: a mail");
});

test("a playbook whose message has no email version in hand says so, and never draws WhatsApp's words under the email's name", () => {
  const tree = composingVia({ templates: [reminderRow()] });
  // Email alone: the text and WhatsApp turned off (every open channel is on as it opens, decision 5).
  viaOf(tree).sms.props.onCheckedChange(false);
  viaOf(page()).whatsapp.props.onCheckedChange(false);
  const now = previewNow(page());
  assert.equal(now.via, null, "no channel is named over words that are not its");
  assert.equal(now.mail, false);
  assert.equal(textOf(byTestId(page(), "mp-version-note")), "This message has no email version yet.");
});

test("who it reaches is one quiet line under the sentence -- the count and the first reason anybody waits -- and every reason, the split by channel and its bar are behind it", () => {
  let tree = composingVia();
  const who = (t) => byTestId(t, "pb-reach");
  const fold = (t) => find(who(t), (n) => n.type === Popover && n.props.label === "Who's held back");
  const line = (t) => textOf(fold(t).props.trigger);
  // WhatsApp alone (the text and the email turned off: every open channel is on as it opens, decision 5): the count and
  // the reason most people wait, and no bar on the line.
  viaOf(tree).sms.props.onCheckedChange(false);
  viaOf(page()).email.props.onCheckedChange(false);
  tree = page();
  assert.ok(line(tree).startsWith("10 of 20 can hear it · 6 have no number on file"), line(tree));
  assert.equal(who(tree).props["data-tone"], "warn", "somebody waits: the line's dot is amber");
  assert.equal(byTestId(tree, "pb-reach-by"), null);
  assert.equal(
    all(who(tree), (n) => n.type === Meter && n.props["data-testid"] !== "pb-reach-bar").length,
    0,
    "no bar on the line",
  );
  // The rest behind the line, its one press.
  assert.equal(fold(tree).props.trigger.props["data-testid"], "pb-reach-held");
  assert.equal(all(fold(tree).props.children, (n) => classOf(n) === "cm-reach-why").length, 1, "the reasons, once");
  // More than WhatsApp: who it reaches on which channel, and the bar of the channels, its words in the kit's tooltip.
  viaOf(tree).email.props.onCheckedChange(true);
  tree = page();
  assert.equal(textOf(byTestId(fold(tree).props.children, "pb-reach-by")), "10 on WhatsApp, 4 by email");
  const bar = byTestId(tree, "pb-reach-bar");
  assert.equal(bar.type, Meter);
  assert.deepEqual(bar.props.parts, [
    { share: 10, color: "var(--chart-cat-1)" },
    { share: 4, color: "var(--chart-cat-3)" },
  ]);
  assert.equal(bar.props["aria-label"], "Reaches 14: 10 on WhatsApp, 4 by email");
  assert.equal(
    all(tree, (n) => n.type === Tooltip).find((t) => t.props.children?.[0] === bar)?.props.tip,
    "10 on WhatsApp, 4 by email",
  );
});

test("a visit reminder never says the month's emails are running out, because a visit message is never held by them; the To row says it for a moment that is", () => {
  let tree = composingVia({ month_sent: { email: 2000, sms: 500 } });
  viaOf(tree).email.props.onCheckedChange(true);
  tree = page();
  assert.equal(textOf(byTestId(tree, "pb-reach-by")), "10 on WhatsApp, 4 by email");
  assert.equal(byTestId(tree, "pb-reach-allowance"), null, "the visit passes: its reminder always goes");
  // The line holds whatever contracts says for a moment the allowance does hold, quietly behind it.
  const said = CmReachLine({
    will: 4,
    pool: 4,
    by: "4 by email",
    allowance: "Only 2 emails are left this month: 2 of these people will be held back.",
    testid: "pb-reach",
  });
  assert.equal(
    textOf(byTestId(said, "pb-reach-allowance")),
    "Only 2 emails are left this month: 2 of these people will be held back.",
  );
});

/* ------------------------- A message needs no WhatsApp row: what the composer offers, opens on, and says ------------------------- */

const { cmOfferedMessages } = await import(`${SRC}/surfaces/campaigns/parts/channels.ts`);

/** The visit reminder as one of its versions, `channel`'s row of the starter's name, as GET templates returns it. */
const reminderVersion = (channel, over = {}) => ({
  ...starterRow("visit_reminder"),
  id: `tpl-visit-${channel}`,
  channel,
  source: "chanlytics",
  header: channel === "email" ? "Your visit, {{1}}" : null,
  blocked: null,
  hidden_at: null,
  ...over,
});
/** What the surface offers of these rows (playbooks/surface.ts): the read's templates, and its messages, made of every row. */
const offeredOf = (...rows) =>
  cmOfferedMessages({
    templates: rows.filter((r) => r.meta_status === "approved" && !r.hidden_at),
    messages: contracts.campaignMessagesOf(rows),
  });
const NO_NUMBER_READY = contracts.channelsReady({
  whatsapp: null,
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true },
});
const ticksOf = (tree) => ["whatsapp", "sms", "email"].map((c) => viaOf(tree)[c].props.checked);

test("a new playbook on a message with an email version and no WhatsApp row opens on Email, with a number and without: WhatsApp and Text say why they are closed, and it is saved on Email", async () => {
  const email = offeredOf(reminderVersion("email"));
  let tree = composingVia({ templates: email });
  assert.deepEqual(ticksOf(tree), [false, false, true], "the moment's own message holds email alone: it opens there");
  assert.equal(reasonsOf(tree).whatsapp, "This message has no WhatsApp version.");
  assert.equal(reasonsOf(tree).sms, "This message has no text version yet.");
  assert.equal(viaOf(tree).email.props.readOnly, true, "the one channel on stays on");
  // No number: the workspace's reason is WhatsApp's, and the playbook opens on Email as well.
  tree = composingVia({
    templates: email,
    ready: NO_NUMBER_READY,
    number: { present: false, health: { canSend: false } },
  });
  assert.deepEqual(ticksOf(tree), [false, false, true], "not on a WhatsApp the workspace has none of");
  assert.equal(reasonsOf(tree).whatsapp, "Connect a WhatsApp number first.");
  assert.equal(
    byTestId(tree, "pb-number"),
    null,
    "and the number's warning is never said to a playbook that does not go by WhatsApp",
  );
  assert.equal(byTestId(tree, "pb-save").props.disabled, false);
  await press(byTestId(tree, "pb-save"));
  assert.deepEqual(said.at(-1)[1].channels, ["email"], "it names the channel it goes by");
  assert.equal(
    said.at(-1)[1].template_id,
    "tpl-visit-email",
    "on the message's anchor, the email row where there is no other",
  );
});

test("a message with an approved WhatsApp version and an email beside it opens a new playbook on both, and not on the text it has no version for", () => {
  const rows = [reminderVersion("whatsapp", { id: "tpl-visit_reminder" }), reminderVersion("email")];
  const tree = composingVia({ templates: offeredOf(...rows) });
  // Every channel the workspace is ready on and the message holds (decision 5): WhatsApp and email; no text version, so not text.
  assert.deepEqual(ticksOf(tree), [true, false, true]);
  assert.equal(viaOf(tree).email.props.readOnly, false, "and email may be turned off");
  assert.equal(viaOf(tree).sms.props.readOnly, true, "the text, with no version, cannot be turned on");
});

test("a WhatsApp version still in review with an email beside it is offered to a playbook, and WhatsApp's tick says it is being reviewed", () => {
  const rows = [
    reminderVersion("whatsapp", { id: "tpl-visit_reminder", meta_status: "pending" }),
    reminderVersion("email"),
  ];
  const tree = composingVia({ templates: offeredOf(...rows) });
  assert.equal(pickerOf(tree, "pb-template").props.value, "visit_reminder", "the message is on the picker");
  assert.deepEqual(ticksOf(tree), [false, false, true]);
  assert.equal(reasonsOf(tree).whatsapp, "WhatsApp is still reviewing this message's WhatsApp version.");
  // Only that version: not offered, as before.
  const alone = composingVia({
    templates: offeredOf(reminderVersion("whatsapp", { id: "tpl-visit_reminder", meta_status: "pending" })),
  });
  assert.equal(pickerOf(alone, "pb-template"), null);
});

test("a playbook made on a message's email version is changed on that message by its name and language after a WhatsApp version moved its id: found, not called gone, saved on the id it is offered by", async () => {
  // Made when the message had an email version alone, its stored template_id that row's; a WhatsApp version added since is the
  // message's anchor, and the id the composer offers it by.
  const offered = offeredOf(reminderVersion("whatsapp", { id: "tpl-visit_reminder" }), reminderVersion("email"));
  assert.equal(offered[0].id, "tpl-visit_reminder");
  const mine = playbook({
    id: "pb-visit",
    name: "Visit reminder",
    trigger: "visit_tomorrow",
    template_id: "tpl-visit-email",
    template_name: "visit_reminder",
    policy_class: "booking",
    poolKey: "visit_tomorrow",
    channels: ["email"],
    params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "visit_when" }, { kind: "visit_service" }],
  });
  const tree = composing(viaSurface({ rows: [mine], templates: offered }), null, "pb-visit");
  assert.equal(byTestId(tree, "pb-template-lost"), null, "its message is found, whichever version its stored id names");
  assert.equal(pickerOf(tree, "pb-template").props.value, "visit_reminder");
  assert.deepEqual(
    ticksOf(tree),
    [false, false, true],
    "it keeps its stored ticks, not the first channel its message holds",
  );
  assert.deepEqual(
    fillsOf(tree).map((f) => f.kind),
    ["first_name", "business_name", "visit_when", "visit_service"],
    "and what fills each slot, kept under the id the message is offered by",
  );
  await press(byTestId(tree, "pb-save"));
  const [verb, id, body] = said.at(-1);
  assert.deepEqual(
    [verb, id, body.template_id, body.channels],
    ["update", "pb-visit", "tpl-visit_reminder", ["email"]],
  );
  assert.deepEqual(body.params, [
    { kind: "first_name" },
    { kind: "business_name" },
    { kind: "visit_when" },
    { kind: "visit_service" },
  ]);
  // The message gone from the picker (no version a run can send): said, as before, and never moved to another.
  const gone = composing(viaSurface({ rows: [mine], templates: [] }), null, "pb-visit");
  assert.equal(textOf(byTestId(gone, "pb-template-lost")), contracts.MESSAGE_GONE_WORDS.composer("Visit reminder"));
});

test("the words for a message no run can send are contracts', said once, in the composer and on the card, and true of a message on any channel", () => {
  // The same words in the composer and on the card, from contracts, true of an email's message as of a WhatsApp one.
  assert.equal(
    contracts.MESSAGE_GONE_WORDS.card,
    "Its message has no version its runs can send, so they are skipped until it has one again or the campaign sends another.",
  );
  assert.equal(
    contracts.MESSAGE_GONE_WORDS.composer("Autumn offer"),
    "Its message, Autumn offer, has no version its runs can send any more. Pick another to save a change.",
  );
  const mine = playbook({ template_id: "tpl-gone", template_name: "old_offer" });
  const tree = paneOf(mine, { templates: [] });
  assert.equal(textOf(byTestId(tree, "pb-template-gone")), contracts.MESSAGE_GONE_WORDS.card);
});

test("the moment's own message waiting on WhatsApp says where its WhatsApp version stands in contracts' words, and Turn on adds one not added yet", async () => {
  const starter = contracts.starterForTrigger("new_week");
  const withVersion = (status) => {
    setSurfaceValue("settings", { templatesAll: status ? [starterRow(starter.key, { meta_status: status })] : [] });
    return composing({}, "new_week");
  };
  // In review: it appears once approved, and there is nothing to add.
  let tree = withVersion("pending");
  const line = textOf(byTestId(tree, "pb-starter"));
  assert.ok(line.includes(starter.title), line);
  assert.ok(line.includes(contracts.STARTER_LINE_WORDS.standing("pending")), line);
  assert.ok(line.includes("has its WhatsApp version in review"), line);
  assert.equal(byTestId(tree, "pb-add-starter"), null);
  // Refused, paused or disabled: the Library's word for the standing, and the Library to look at it in.
  for (const [status, word] of [
    ["rejected", "refused"],
    ["paused", "paused"],
    ["disabled", "disabled"],
  ]) {
    tree = withVersion(status);
    assert.ok(
      textOf(byTestId(tree, "pb-starter")).includes(`has its WhatsApp version ${word} — see Campaigns › Library.`),
      status,
    );
    assert.ok(!/template/i.test(textOf(byTestId(tree, "pb-starter"))), status);
  }
  // Written here and not added: it reads in the preview, and Turn on adds it (an email and a text at once, a WhatsApp
  // version where a number is), then turns the campaign on once it reads back (Ruben, 11 Oct 2026).
  tree = withVersion(null);
  assert.ok(textOf(byTestId(tree, "pb-starter")).includes(starter.title));
  assert.equal(byTestId(tree, "pb-add-starter"), null, "no link of its own: the sheet's one act adds it");
  assert.equal(
    textOf(byTestId(tree, "pb-foot-say")),
    contracts.LIFECYCLE_WORDS.compose.sentence.addsFirst(starter.title),
  );
  assert.equal(textOf(byTestId(tree, "pb-save")), contracts.LIFECYCLE_WORDS.compose.turnOnShort);
  const added = [];
  const was = templateVerbs.addStarters;
  templateVerbs.addStarters = async (body) => {
    added.push(body);
    return { ok: true, data: {} };
  };
  await press(byTestId(tree, "pb-save"));
  templateVerbs.addStarters = was;
  assert.deepEqual(added, [{ keys: [starter.key], languages: ["en_US"] }], "Turn on adds the moment's own message");
  assert.equal(
    said.some(([verb]) => verb === "create"),
    false,
    "and starts the campaign once the message reads back, never on a message the page does not hold yet",
  );
  setSurfaceValue("settings", undefined);
});

/* ---------------------------------- decision 20: the title, the doors, the notice ---------------------------------- */

test("a Turn on opens a sheet titled for its moment, with no kind switch; New message keeps its title and its choice", () => {
  setSurfaceValue("playbooks", playbooksSample(new Date(NOW)));
  fresh();
  // The sample holds no campaign on the day after: its Turn on names the campaign it would start.
  const turnOn = find(
    again(() => CampaignsHome({ param: "new:moment:visited", nowMs: NOW })),
    (n) => n.type === PaneSheet,
  );
  assert.equal(turnOn.props.title, contracts.LIFECYCLE_WORDS.compose.turnOnShort, "Turn on, as the sheet's kicker");
  const named = byTestId(turnOn, "pb-name");
  assert.ok(named.props.value || named.props.placeholder, "and the campaign's name under it, to rename in place");
  assert.equal(turnOn.props.tools, undefined, "a Turn on is no choice of kind");
  fresh();
  // A moment that already holds one (the sample's Win-back): no second campaign's title is its name.
  const holding = find(
    again(() => CampaignsHome({ param: "new:moment:quiet_30", nowMs: NOW })),
    (n) => n.type === PaneSheet,
  );
  assert.equal(holding.props.title, "New message");
  fresh();
  const plain = find(
    again(() => CampaignsHome({ param: "new", nowMs: NOW })),
    (n) => n.type === PaneSheet,
  );
  assert.equal(plain.props.title, "New message");
  assert.ok(plain.props.tools, "New message chooses between Send once and Every time a moment comes");
});

test("a Turn on's title follows the moment its field holds: another moment chosen in the sheet is the title's", () => {
  setSurfaceValue("playbooks", playbooksSample(new Date(NOW)));
  fresh();
  const draw = () => again(() => CampaignsHome({ param: "new:moment:visited", nowMs: NOW }));
  const titleOf = (tree) => find(tree, (n) => n.type === PaneSheet).props.title;
  let tree = draw();
  assert.equal(titleOf(tree), contracts.LIFECYCLE_WORDS.compose.turnOnShort);
  // The win-back's moment (by visits: the sample has a calendar), whose stage already runs the sample's Win-back: no
  // second campaign's title is its name.
  const moment = pickerOf(tree, "pb-moment");
  assert.ok(
    offered(moment).some((o) => o.value === "lapsed"),
    "the field offers the win-back's moment",
  );
  moment.props.onValueChange("lapsed");
  tree = draw();
  assert.equal(titleOf(tree), "New message", "not 'Turn on' over a Win-back");
  // Back to the day after: its Turn on again, the address never moved.
  pickerOf(tree, "pb-moment").props.onValueChange("visited");
  tree = draw();
  assert.equal(titleOf(tree), contracts.LIFECYCLE_WORDS.compose.turnOnShort);
  assert.equal(find(tree, (n) => n.type === PlaybookComposer).props.initialTrigger, "visited", "the sheet stays open");
  // A choice is the sheet's it was made in: closed and opened again by the same Turn on, it is titled for its moment.
  pickerOf(tree, "pb-moment").props.onValueChange("lapsed");
  again(() => CampaignsHome({ param: null, nowMs: NOW }));
  again(() => CampaignsHome({ param: null, nowMs: NOW }));
  assert.equal(titleOf(draw()), contracts.LIFECYCLE_WORDS.compose.turnOnShort);
});

test("a moment that already holds a campaign says so as the composer opens on it; the one being changed is not news", () => {
  // The harness's surface holds no campaign (`surface()`, rows []): this one holds the file's own Win-back (`playbook()`).
  const holds = { rows: [playbook()] };
  const winback = composing(holds, "quiet_30");
  assert.equal(textOf(byTestId(winback, "pb-holds")), contracts.LIFECYCLE_WORDS.compose.holds("Win-back", false));
  assert.match(textOf(byTestId(winback, "pb-holds")), /Win-back · On/);
  const paused = composing({ rows: [playbook({ state: "paused" })] }, "lapsed");
  assert.match(textOf(byTestId(paused, "pb-holds")), /Win-back · Paused/, "the win-back's two moments are one");
  assert.equal(byTestId(composing(holds, "visited"), "pb-holds"), null, "a moment holding none says nothing");
  assert.equal(
    byTestId(composing(holds, null, "pb-1"), "pb-holds"),
    null,
    "changing the Win-back says nothing of itself",
  );
});

test("the composer's calendar and number sentences are doors to where they are mended", () => {
  // A reminder being changed: a moment of the appointment, no calendar, no WhatsApp number, and it goes by WhatsApp.
  const reminder = playbook({
    id: "pb-r",
    name: "Reminder",
    trigger: "visit_tomorrow",
    template_id: "tpl-visit_reminder",
    template_name: "visit_reminder",
    policy_class: "booking",
    channels: ["whatsapp"],
  });
  const tree = composing(
    { rows: [reminder], calendar: "none", number: { present: false, health: { canSend: false, refusal: null } } },
    null,
    "pb-r",
  );
  const W = contracts.LIFECYCLE_WORDS.compose;
  const cal = byTestId(tree, "pb-calendar");
  assert.ok(cal, "a moment of the appointment, with no calendar");
  assert.ok(textOf(cal).startsWith(W.calendar.words), "contracts' sentence");
  const calDoor = byTestId(cal, "pb-calendar-door");
  assert.match(String(calDoor.props.href), /admin\/workspace\/calendar$/, "the calendar's own row");
  assert.equal(textOf(calDoor), W.calendar.door.label);
  const num = byTestId(tree, "pb-number");
  assert.ok(num, "no WhatsApp number, and the campaign goes by WhatsApp");
  assert.ok(textOf(num).startsWith(W.number.words), "contracts' sentence");
  const numDoor = byTestId(num, "pb-number-door");
  assert.match(String(numDoor.props.href), /admin\/integrations$/);
  assert.equal(textOf(numDoor), W.number.door.label);
  // A number that cannot send says its own refusal, with the same door.
  const flagged = composing(
    {
      rows: [reminder],
      number: { present: true, health: { canSend: false, refusal: "The number is flagged by WhatsApp." } },
    },
    null,
    "pb-r",
  );
  assert.ok(textOf(byTestId(flagged, "pb-number")).startsWith("The number is flagged by WhatsApp."));
  assert.ok(byTestId(byTestId(flagged, "pb-number"), "pb-number-door"));
});
