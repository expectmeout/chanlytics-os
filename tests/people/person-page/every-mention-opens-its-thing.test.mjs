/**
 * One person, one set of words, and every mention opens its thing: a People row says why someone needs you, a
 * visit opens its day or itself, a profile goes back to People, the timeline narrows by kind and each linked row is its
 * own door, and a person's page says who they are once. Drawn on a stub React over a fake wire (_person-page.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, byTestId, find, press, textOf } from "../../_stub-react.mjs";
import * as contracts from "@chanlytics/contracts";
import { attentionRow } from "../../../apps/dashboard/src/surfaces/people/person/model/attention.ts";
import {
  D,
  H,
  ListsSheet,
  Menu,
  NEXT,
  NOW,
  PersonLists,
  SubTabs,
  VISITS,
  ZONE,
  detail,
  filterTimeline,
  frames,
  iso,
  itemsIn,
  menuByWords,
  newTree,
  pageFor,
  peoplePage,
  profile,
  row,
  setCells,
  setStatus,
  setSurfaceValue,
  settle,
  standingSaid,
  stateOf,
  surfaceValue,
  toPersonRowVM,
  toPersonVM,
  went,
} from "./_person-page.mjs";

/* ------------------------------- the words, in contracts ------------------------------- */

test("REGRESSION (B15): AI's mode has one set of words, a word for following the workspace among them", () => {
  assert.deepEqual(contracts.PERSON_MODE_WORDS, {
    auto: "Answer",
    ask: "Ask me first",
    never: "Never",
    inherit: "Follow the workspace",
  });
  assert.equal(stateOf("mode", "inherit").label, "Follow the workspace", "the pill says it too");
  assert.equal(
    toPersonRowVM(
      row({ needs_human: false, open_escalation_reason: null, effective_reply_mode: "ask" }),
      ZONE,
      new Date(NOW),
    ).receptionist.label,
    "Held for you, set to Ask me first",
    "REGRESSION: a state said Ask of a mode called Ask me first",
  );
  const held = toPersonVM(
    detail({
      row: row({ needs_human: false, open_escalation_reason: null, effective_reply_mode: "never" }),
      escalations: [],
      receptionist_mode: "never",
    }),
    ZONE,
    new Date(NOW),
  );
  const tile = held.facts.find((f) => f.label === "AI");
  assert.deepEqual(
    [tile.value, tile.meta],
    ["Held for you", "set to Never"],
    "REGRESSION: the tile said Paused, and 'held for you, set to never' under it",
  );
});

test("REGRESSION (B16): a profile's facts and About rail no longer repeat consent -- the asks say it, and say how it was given", () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  assert.ok(!vm.facts.some((f) => f.label === "Consent"), `facts: ${vm.facts.map((f) => f.label)}`);
  assert.ok(!vm.about.some((a) => a.k === "Consent"), `about: ${vm.about.map((a) => a.k)}`);
});

test("REGRESSION (B17): every message, escalation and visit on the timeline opens its thread or its day, and the timeline narrows by kind", () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const day = toPersonRowVM(row({ visits: VISITS }), ZONE, new Date(NOW)).nextVisitDate;
  const of = (kind) => vm.timeline.find((i) => i.kind === kind);
  assert.equal(of("customer").link?.to, "inbox/th-cv1", "REGRESSION: only calls linked");
  assert.equal(of("escalation").link?.to, "inbox/th-cv1");
  assert.equal(of("visit").link?.to, `calendar/${day}`, "a visit opens its day on the Calendar");
  assert.deepEqual(
    contracts.TIMELINE_FILTERS?.map((f) => f.id),
    ["all", "messages", "calls", "visits", "consent", "deals"],
  );
  assert.deepEqual(
    filterTimeline(vm.timeline, "visits").map((i) => i.kind),
    ["visit"],
  );
  assert.deepEqual([...new Set(filterTimeline(vm.timeline, "messages").map((i) => i.kind))].sort(), [
    "customer",
    "escalation",
  ]);
  assert.equal(filterTimeline(vm.timeline, "all").length, vm.timeline.length);
});

/* ----------------------------------- the People page ----------------------------------- */

test("REGRESSION (B9): a row says why someone needs you, and their last words -- the reason and the words were computed and never drawn", async () => {
  const dto = row();
  const draw = await peoplePage([dto]);
  const tree = draw();
  const tr = find(tree, (n) => n.type === "tr" && n.props?.id === "person-p1");
  const vm = toPersonRowVM(dto, ZONE, new Date());
  const a = attentionRow(vm, ZONE, Date.now());
  assert.ok(vm.stateDetail, "the fixture needs you, for a reason");
  assert.ok(
    textOf(byTestId(tr, "row-state-detail")).includes(vm.stateDetail),
    `the reason beside the state: ${textOf(tr)}`,
  );
  assert.equal(textOf(byTestId(tr, "row-words")), `“${a.sentence}”`, "their words, as the attention strip says them");
});

test("REGRESSION (B19): People's table is titled for everyone and its first column for a person -- it said All customers and Customer", async () => {
  const draw = await peoplePage([row()]);
  const tree = draw();
  assert.ok(
    all(tree, (n) => n.props?.className === "cl-section-title").some((n) => textOf(n) === "Everyone"),
    "REGRESSION: All customers",
  );
  assert.equal(
    textOf(find(tree, (n) => n.type === "th" && n.props?.["data-sorts"] !== undefined)).replace(/[▲▼↕]/g, ""),
    "Person",
    "REGRESSION: Customer",
  );
});

test("REGRESSION (B26): a row's visit opens that day on the Calendar -- a press on it opened the profile", async () => {
  const dto = row({ visits: VISITS });
  const draw = await peoplePage([dto]);
  const tree = draw();
  const open = byTestId(tree, "row-visit-open");
  assert.ok(open, "the visit is a door of its own");
  press(open);
  assert.deepEqual(went, [`calendar/${toPersonRowVM(dto, ZONE, new Date()).nextVisitDate}`]);
});

test("(A1, D1) a row's visit opens the visit itself when the record has a row for it, not only its day", async () => {
  const dto = row({ visits: { ...VISITS, next: { ...NEXT, record_id: "r-next" } } });
  const draw = await peoplePage([dto]);
  const tree = draw();
  press(byTestId(tree, "row-visit-open"));
  const day = toPersonRowVM(dto, ZONE, new Date()).nextVisitDate;
  assert.deepEqual(went, [`calendar/${day}:a-r-next`], "the Calendar opens the visit's panel on its day");
});

test("(D1-visit-mark) a row's visit says how it stands beside its day -- Past once it has ended and nobody has marked it, the member's word once said, nothing while it is ahead", async () => {
  const LAST = { id: "b0:1", start: iso(3 * D), end: iso(3 * D - 2 * H), title: "Color", all_day: false, via: "phone" };
  const stateOf = async (visits) => {
    const draw = await peoplePage([row({ visits })]);
    const state = byTestId(draw(), "row-visit-state");
    return state ? textOf(state) : null;
  };
  assert.equal(
    await stateOf({ ...VISITS, next: null, last: LAST }),
    "Past",
    "it ended and nobody said: where the cell said only its day",
  );
  assert.equal(
    await stateOf({ ...VISITS, next: null, last: { ...LAST, said: "kept", record_id: "r-last" } }),
    "Kept",
    "a member's word on it",
  );
  assert.equal(await stateOf(VISITS), null, "a visit ahead has no word yet");
});

test("REGRESSION (B15): the bulk bar's receptionist menu uses the one set of words -- it said Answer them and Stay out", async () => {
  const draw = await peoplePage([
    row(),
    row({ id: "p2", display_name: "Ana Ruiz", phone_e164: "+17865550182", latest_conversation_id: "cv2" }),
  ]);
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  const menu = menuByWords(tree, "Messages");
  const modes = menu.props.groups.find((g) => /^AI for/.test(g.header ?? ""));
  assert.deepEqual(
    modes.items.map((i) => i.label),
    ["Answer", "Ask me first", "Never", "Follow the workspace"],
  );
});

/* ------------------------------------- the profile ------------------------------------- */

test("REGRESSION (B19, B15): a profile goes back to People, and names following the workspace the way the menu does", async () => {
  const draw = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  const tree = draw();
  // The way back is the frame's "‹ People" where the date stands (canvas A): the page says it, and draws no button of
  // its own for it.
  const said = standingSaid();
  assert.equal(said?.title, null, "the page is its own head");
  assert.equal(said?.back?.label, "People", "REGRESSION: All clients");
  // Back is the frame's own (the People view they came from, with its place), and People itself where the frame has none.
  said.back.go();
  assert.deepEqual(went, ["back"]);
  const frameBack = globalThis.window.appBackToPeople;
  delete globalThis.window.appBackToPeople;
  try {
    went.length = 0;
    draw();
    standingSaid().back.go();
    assert.deepEqual(went, ["clients"]);
  } finally {
    globalThis.window.appBackToPeople = frameBack;
  }
  const mode = byTestId(tree, "receptionist-mode");
  assert.deepEqual(
    all(mode, (n) => n.props?.className?.includes("cl-prof-aut-seg")).map((b) => textOf(b)),
    ["Answer", "Ask me first", "Never"],
  );
  assert.ok(textOf(mode).includes("Follow the workspace"), `REGRESSION: "Use the workspace setting": ${textOf(mode)}`);
  const following = await profile(toPersonVM(detail({ receptionist_mode: null }), ZONE, new Date(NOW)));
  assert.ok(
    textOf(byTestId(following(), "receptionist-mode")).includes("Following the workspace (Answer)."),
    "a person on the workspace's setting says so in the same words",
  );
});

test("REGRESSION (B16): the profile's facts and About rail draw no consent; the two asks do", async () => {
  const draw = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  const tree = draw();
  assert.ok(
    !all(tree, (n) => n.type === globalThis.StatCell).some((c) => c.props.label === "Consent"),
    "no Consent tile",
  );
  assert.ok(
    !all(tree, (n) => n.props?.className === "cl-prof-attr-key").some((k) => textOf(k) === "Consent"),
    "no Consent row in About",
  );
  assert.ok(
    byTestId(tree, "consent-control") || find(tree, (n) => n.props?.testid === "consent-control"),
    "the ask about their visit is still there",
  );
});

test("REGRESSION (B17): the timeline narrows by kind, and each linked item opens its thread or its day -- only calls opened anything", async () => {
  // A visit that happened, and the fixture's one ahead.
  const PAST = { ...NEXT, id: "b0:1", start: iso(10 * D), end: iso(10 * D - 2 * H) };
  const vm = toPersonVM(detail({ visits: { ...VISITS, all: [PAST, NEXT] } }), ZONE, new Date(NOW));
  // The fixture's one visit has not happened: it is Coming up on the Overview, not History, and it is a door to its day.
  const ahead = all((await profile(vm))(), (n) => n.props?.["data-testid"] === "person-visit-ahead");
  assert.equal(ahead.length, 1, "the visit ahead is Coming up");
  press(ahead[0]);
  const doors = [...went];
  // History is its own tab (0052, 13).
  const draw = await profile(vm, "history");
  let tree = draw();
  // The filters are the kit's sub-tabs (beside the page's own tabs): one for each kind History holds, none for another.
  const filters = (t) =>
    find(t, (n) => n.type === SubTabs && n.props.tabs.some((x) => x.testid?.startsWith("timeline-filter-"))).props;
  assert.deepEqual(
    filters(tree).tabs.map((t) => t.testid),
    ["timeline-filter-all", "timeline-filter-messages", "timeline-filter-visits", "timeline-filter-notes"],
    "a filter for each kind History holds, and none for a kind it does not; their notes are History's last tab",
  );
  for (const open of all(tree, (n) => n.props?.["data-testid"] === "timeline-open")) press(open);
  doors.push(...went);
  const day = toPersonRowVM(row({ visits: VISITS }), ZONE, new Date(NOW)).nextVisitDate;
  assert.ok(doors.includes("inbox/th-cv1") && doors.includes(`calendar/${day}`), `the doors: ${doors}`);
  filters(tree).onSelect("visits");
  tree = draw();
  assert.equal(
    all(tree, (n) =>
      String(n.props?.className || "")
        .split(" ")
        .includes("cl-tl-row"),
    ).length,
    1,
    "only the visit that happened is drawn",
  );
  const timeline = find(tree, (n) => typeof n.type === "function" && n.type.name === "PersonTimeline");
  assert.ok(
    timeline.props.items.every((i) => !i.ahead),
    "History is what has happened: the visit ahead is not handed to it",
  );
  assert.deepEqual(
    filterTimeline(timeline.props.items, timeline.props.filter).map((i) => i.id),
    ["v-b0:1"],
    "Visits shows the visit that happened",
  );
});

test("a call's to-do and what the caller gave are on the person's page, under the call they came from -- the history said only what they wanted (audit of 2 Oct 2026, #8)", async () => {
  const call = (over) => ({
    id: "k1",
    retell_call_id: "r1",
    direction: "inbound",
    call_type: "phone_call",
    status: "ended",
    from_e164: "+17865550181",
    from_raw: null,
    to_e164: null,
    started_at: iso(2 * D),
    ended_at: iso(2 * D - 100_000),
    duration_ms: 100_000,
    disconnection_reason: "agent_hangup",
    sentiment: null,
    call_successful: true,
    in_voicemail: false,
    summary: "Asked about a bridal trial.",
    wanted: "Wants a bridal trial in August",
    outcome: "callback_needed",
    follow_up: "Call back to confirm the bridal trial",
    caller_name: "Daniela Reyes-Ortiz",
    caller_email: "daniela@example.com",
    transcript_object: null,
    recording: { fetch_state: "stored" },
    conversation_id: "cv1",
    contact_id: "p1",
    message_id: null,
    contact: null,
    ...over,
  });
  const vm = toPersonVM(
    detail({
      calls: [
        call({}),
        call({ id: "k2", started_at: iso(5 * D), follow_up: null, caller_name: null, caller_email: null }),
      ],
    }),
    ZONE,
    new Date(NOW),
  );
  const tree = (await profile(vm, "history"))();
  const rows = all(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("cl-tl-row"),
  );
  const callRows = rows.filter((r) => /Inbound call/.test(textOf(r)));
  assert.equal(callRows.length, 2, "both calls are in the history");
  const said = (r) => all(r, (n) => n.props?.["data-testid"] === "timeline-note").map((n) => textOf(n));
  assert.deepEqual(
    said(callRows[0]),
    [
      "To do: Call back to confirm the bridal trial",
      "Gave their name as Daniela Reyes-Ortiz",
      "Gave their email as daniela@example.com",
    ],
    "REGRESSION: the call-back to-do was nowhere on the person's page",
  );
  assert.match(
    textOf(callRows[0]),
    /Wants a bridal trial in August/,
    "what they wanted still leads, and the lines follow it",
  );
  assert.deepEqual(said(callRows[1]), [], "a call that left nothing has no lines");
});

test("REGRESSION (B26): the profile's next visit opens that day on the Calendar -- the tile opened nothing", async () => {
  const draw = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  const tree = draw();
  // The next visit is Coming up's tile (canvas A), a link to its day.
  const open = byTestId(tree, "person-visit-ahead");
  assert.ok(open, "the next visit is a door");
  assert.equal(open.type, "a", "a door is a link");
  press(open);
  assert.deepEqual(went, [`calendar/${toPersonRowVM(row({ visits: VISITS }), ZONE, new Date(NOW)).nextVisitDate}`]);
});

test("(A1, D1) the profile's next visit opens the visit itself when the record has a row for it, and says so", async () => {
  const next = { ...NEXT, record_id: "r-next" };
  const withRow = row({ visits: { ...VISITS, next } });
  const draw = await profile(
    toPersonVM(detail({ row: withRow, visits: { ...VISITS, next, all: [next] } }), ZONE, new Date(NOW)),
  );
  const open = byTestId(draw(), "person-visit-ahead");
  assert.ok(open, "the next visit is a door");
  assert.ok(open.props.href.endsWith(":a-r-next"), `its address is the visit itself: ${open.props.href}`);
  press(open);
  assert.deepEqual(went, [`calendar/${toPersonRowVM(withRow, ZONE, new Date(NOW)).nextVisitDate}:a-r-next`]);
});

test("REGRESSION (B18): a list chip on a profile opens its list -- the name was text", async () => {
  await peoplePage([row()], [{ id: "s1", name: "Regulars", ids: ["p1"] }]);
  setCells([]);
  frames.begin();
  const lists = PersonLists({ personId: "p1", canEdit: true, first: "Daniela", flash: () => {} });
  const open = byTestId(lists, "person-list-open");
  assert.ok(open && textOf(open).includes("Regulars"), "the name is a door");
  press(open);
  assert.deepEqual(went, ["clients/list:s1"], "the list, picked, on People -- the Lists page folded into it");
});

test("REGRESSION: a profile's Add to a list opens over the card -- the card clipped it at its foot, under a header that said the button again", async () => {
  await peoplePage(
    [row()],
    [
      { id: "s1", name: "Regulars", ids: ["p1"] },
      { id: "s2", name: "Best buyers", ids: [] },
    ],
  );
  setCells([]);
  frames.begin();
  const picked = [];
  const lists = PersonLists({
    personId: "p1",
    canEdit: true,
    first: "Daniela",
    flash: () => {},
    onPick: () => picked.push("lists"),
  });
  assert.equal(
    find(lists, (n) => n.type === Menu),
    null,
    "one picker: the lists sheet, never a menu of its own",
  );
  const add = byTestId(lists, "person-list-add");
  assert.ok(
    String(add.props.className).split(" ").includes("is-plain"),
    "a quiet link under the chips, as Add an email is, not a button among them",
  );
  add.props.onClick();
  assert.deepEqual(picked, ["lists"], "it opens the lists sheet, which More's Add to a list opens too");
  // The sheet: a switch for each list kept by hand, on for the ones that hold them, and a new list made in place.
  frames.begin();
  const sheet = ListsSheet({
    c: { p: { id: "p1", smartLists: [] }, first: "Daniela", flash: () => {}, listsOpen: true, setListsOpen: () => {} },
  });
  const switches = all(sheet, (n) => n.props?.testid === "person-lists-sheet-switch");
  assert.deepEqual(
    switches.map((n) => n.props.on),
    [true, false],
    "Regulars holds them, Best buyers does not: each is a switch, in the one picker",
  );
  assert.ok(byTestId(sheet, "person-lists-sheet-new"), "and a new list is made where they are");
});

test("REGRESSION: a person's page says who they are once -- the header held two buttons to one thread and two pills, a card quoted the timeline's first two messages, and six cells said the rail again", async () => {
  const vm = toPersonVM(detail({ booking_link: "https://book.example/salon" }), ZONE, new Date(NOW));
  const draw = await profile(vm);
  const tree = draw();
  const cls = (n) => String(n.props?.className || "");

  // Who they are: the name and the state; their number and where it came from are Reach them's (canvas A), said once.
  assert.equal(byTestId(tree, "person-id-line"), null, "no line of the number under the name");
  // Reach them's number is the press that opens its acts (the kit's Menu, its trigger the row).
  const reachMenu = find(
    tree,
    (n) => n.type === Menu && n.props.trigger?.props?.["data-testid"] === "person-reach-phone",
  );
  const reach = reachMenu?.props.trigger;
  assert.ok(
    reach && textOf(reach).includes(vm.phone) && /Phone · they wrote from it /.test(textOf(reach)),
    `Reach them says the number and where it came from: ${reach && textOf(reach)}`,
  );
  const id = find(tree, (n) => cls(n) === "cl-prof-id");
  assert.deepEqual(
    all(id, (n) => n.type === "button").map((b) => b.props["data-testid"]),
    ["person-rename"],
    "REGRESSION: between 901 and 1250px the header's buttons kept their width and the name's column went to zero",
  );
  assert.deepEqual(
    all(id, (n) => typeof n.type === "function" && n.type.name === "StatePill").map((s) => s.props.value),
    [vm.state],
    "REGRESSION: two pills in the header said Right now's state and the consent again; one word under the name now",
  );

  // One way to the thread, beside who they are, with the booking link beside it.
  const threadButtons = all(
    tree,
    (n) => n.type === "button" && /^(Open conversation|Open in Inbox|Open the conversation)$/.test(textOf(n).trim()),
  );
  assert.equal(
    threadButtons.length,
    1,
    "REGRESSION: Open conversation in the header and Open in Inbox in Right now went to the same conversation",
  );
  assert.equal(
    textOf(threadButtons[0]).trim(),
    "Open the conversation",
    "one door, one label: the card said Open in Inbox and the header said Open conversation",
  );
  const actions = find(tree, (n) => cls(n) === "cl-prof-queue-actions");
  const more = find(actions, (n) => n.type === Menu);
  assert.ok(
    byTestId(actions, "person-open-thread") &&
      more &&
      more.props.trigger.props["data-testid"] === "person-more" &&
      /^More for /.test(more.props.trigger.props["aria-label"]),
    "the conversation beside who they are, and the rest behind its caret, named More (the one page: a menu rides its act)",
  );
  assert.ok(
    itemsIn(more).some((i) => i.label === "Send booking link"),
    "REGRESSION: 'Send the booking-link template' was a button of its own beside a conversation button to the same place",
  );

  assert.ok(
    !find(tree, (n) => cls(n) === "cl-prof-narr"),
    "REGRESSION: Last exchange quoted the two messages the timeline opens on",
  );
  assert.ok(!find(tree, (n) => cls(n).includes("cl-prof-money")), "REGRESSION: six cells said the rail's facts again");

  // The rail's groups say each fact once (canvas A): no About card of keys repeating the figures or the head.
  assert.equal(all(tree, (n) => n.props?.className === "cl-prof-attr-key").length, 0, "no About card of keys");
  assert.ok(textOf(tree).split(vm.phone).length - 1 <= 1, "their number is said once, in Reach them");
  assert.ok(byTestId(tree, "person-visit-ahead"), "the next visit still opens its day, from Coming up");

  assert.ok(
    !textOf(tree).includes("· receptionist"),
    "REGRESSION: every receptionist entry read Receptionist · receptionist",
  );
});

test("someone who said stop keeps their way into the thread, and is offered no booking link", async () => {
  const vm = toPersonVM(
    detail({
      row: row({
        visits: VISITS,
        consent: "opted_out",
        needs_human: false,
        open_escalation_reason: null,
        open_escalation_since: null,
        escalation_count: 0,
      }),
      escalations: [],
      receptionist_mode: null,
      booking_link: "https://book.example/salon",
    }),
    ZONE,
    new Date(NOW),
  );
  assert.equal(vm.rightNow.cta, null, "the silent case: Right now has no button of its own");
  assert.ok(vm.openThread, "and they do have a conversation");
  const draw = await profile(vm);
  const tree = draw();
  const actions = find(tree, (n) => String(n.props?.className || "") === "cl-prof-queue-actions");
  const open = byTestId(actions, "person-open-thread");
  assert.equal(
    open && textOf(open).trim(),
    "Open the conversation",
    "the header's Open conversation was their only way in",
  );
  press(open);
  assert.deepEqual(went, [vm.openThread]);
  assert.equal(
    byTestId(tree, "text-booking-link"),
    null,
    "REGRESSION: a booking link sat under 'Silent, they opted out'",
  );
});

/* ------------------------ the pass over the page: every row a door, said once ------------------------ */

test("the timeline's linked rows are the doors themselves -- a message's door hid in its time, a button that looked like a timestamp", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  // The bridge's window.__href is the API URL builder (inbox-verbs.ts): "GET contacts/export" in, a URL out, and a
  // route string in throws on its route table. The page once built its row hrefs through it and every person's
  // page fell over in production (the error surface: can't access property "path"). Installed here as it behaves.
  globalThis.window.__href = (key) => {
    const routes = {};
    return routes[key].path;
  };
  let tree;
  try {
    const draw = await profile(vm, "history");
    tree = draw();
  } finally {
    delete globalThis.window.__href;
  }
  const doors = all(tree, (n) => n.props?.["data-testid"] === "timeline-open");
  for (const d of doors)
    assert.match(d.props.href, /^#\/(inbox|calendar)\//, `a hash route, the app's own: ${d.props.href}`);
  assert.ok(doors.length >= 2, "the message and the escalation open somewhere");
  for (const d of doors) {
    assert.equal(d.type, "a", "a row that goes somewhere is a link, so it has a URL and a keyboard reaches it");
    assert.ok(d.props.href, "with an href");
    assert.ok(String(d.props.className).includes("cl-tl-row"), "and it is the row, not a control inside it");
    assert.equal(
      all(d, (n) => n.type === "button").length,
      0,
      "REGRESSION: a button inside the row, 44px tall on a touch screen",
    );
  }
  const heads = all(tree, (n) => n.props?.className === "cl-tl-day");
  assert.ok(heads.length >= 1, "the day sits above its rows");
  const rows = all(tree, (n) => String(n.props?.className || "").includes("cl-tl-row"));
  for (const r of rows)
    assert.equal(
      all(r, (n) => n.props?.className === "cl-tl-day").length,
      0,
      "the day is not inside a row, so the rail line stops under it",
    );
  went.length = 0;
  press(doors.find((d) => /inbox\//.test(d.props.href)));
  assert.deepEqual(went, ["inbox/th-cv1"], "a press opens the conversation");
});

test("a long record folds past twenty rows, and a fold of three is not worth a press", async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: `m${i}`,
    conversation_id: "cv1",
    direction: i % 2 ? "outbound" : "inbound",
    sender: i % 2 ? "assistant" : "customer",
    type: "text",
    body: `Message ${i}`,
    media: null,
    meta: null,
    status: i % 2 ? "sent" : "received",
    created_at: iso((3 + i) * H),
  }));
  const d = detail();
  const vm = toPersonVM({ ...d, conversations: [{ ...d.conversations[0], messages: many }] }, ZONE, new Date(NOW));
  assert.ok(vm.timeline.length > 23, `the fixture is long: ${vm.timeline.length}`);
  const draw = await profile(vm, "history");
  let tree = draw();
  const rowsOf = (t) =>
    all(t, (n) =>
      String(n.props?.className || "")
        .split(" ")
        .includes("cl-tl-row"),
    ).length;
  // History is what has happened: a visit still ahead is Coming up, above it.
  const past = vm.timeline.filter((i) => !i.ahead);
  assert.equal(rowsOf(tree), 20, "twenty newest rows, then the fold");
  const older = byTestId(tree, "timeline-older");
  assert.equal(textOf(older).trim(), `Show ${past.length - 20} older`, "the fold says how many wait behind it");
  press(older);
  tree = draw();
  assert.equal(rowsOf(tree), past.length, "one press shows the whole record");
  assert.equal(byTestId(tree, "timeline-older"), null);
  // Twenty-two rows: no fold for two.
  const few = toPersonVM(
    { ...d, conversations: [{ ...d.conversations[0], messages: many.slice(0, 22 - (vm.timeline.length - 30)) }] },
    ZONE,
    new Date(NOW),
  );
  const tree2 = (await profile(few, "history"))();
  const fewPast = few.timeline.filter((i) => !i.ahead).length;
  assert.equal(rowsOf(tree2), fewPast, `${fewPast} rows, all drawn`);
  assert.equal(byTestId(tree2, "timeline-older"), null, "a fold of three rows is not worth a press");
});

test("Right now says the state once: the pill wears the standing's word, the sentence gives the reason, and AI is named once", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  assert.equal(vm.rightNow.tone, "escalated");
  // The operator's first sentence for the reason (contracts ESCALATION_SUMMARIES), after when it began: "Paused until
  // someone answers" was said for every reason, over a person who had asked to stop (the 2 Oct 2026 audit).
  assert.match(
    vm.rightNow.detail,
    /^Since .*\. They asked for a person\. A holding message went out, and they're waiting on you\.$/,
    vm.rightNow.detail,
  );
  const draw = await profile(vm);
  const tree = draw();
  // The head says the person's one state, as People's row does (canvas A): Needs you, never the receptionist's standing,
  // which Messages and AI says.
  const card = byTestId(tree, "person-now");
  assert.equal(card.props["data-state"], vm.state, "the line says the state People's row says");
  assert.equal(vm.state, "needs_you", "an escalation is someone who needs you");
  assert.ok(
    !String(card.props.className).includes("approval"),
    "REGRESSION: an accent edge on a card whose pill is warn",
  );
  const pill = find(card, (n) => typeof n.type === "function" && n.type.name === "StatePill");
  assert.equal(pill.props.value, vm.state);
  assert.equal(
    pill.props.label,
    vm.stateLabel,
    "REGRESSION: the pill carried the whole title -- Escalated · asked for a person -- and spilled past the card between 901 and 990px: it says the state's word alone",
  );
  // The pill is the state's word; why is Now's first row (the one page, D6), and both are read together.
  assert.equal(byTestId(tree, "person-now-why"), null, "the head says the state alone");
  const why = byTestId(tree, "person-now-needs");
  const sub = find(why, (n) => String(n.props?.className || "") === "cl-prof-rung-sub");
  assert.equal(textOf(sub), vm.rightNow.detail, "Now's first row gives the reason");
  const words = `${textOf(card)} ${textOf(why)}`;
  assert.ok((words.match(/eceptionist/g) || []).length <= 1, `AI is named once at most: ${words}`);
  assert.ok(!textOf(card).includes("Escalated"), `the state is the pill's word, not said again by the head: ${words}`);
});

test("a viewer reads the role once, at the top of the rail -- it was said under every locked control", async () => {
  globalThis.window.__ME = { role: "viewer" };
  try {
    const vm = toPersonVM(detail(), ZONE, new Date(NOW));
    const tree = (await profile(vm))();
    assert.ok(byTestId(tree, "person-role-note"), "the note");
    const words = textOf(tree);
    assert.equal(
      (words.match(/owner or operator/g) || []).length,
      1,
      `once: ${words.match(/[^.]*owner or operator[^.]*\./g)}`,
    );
    assert.equal(
      all(tree, (n) => n.props?.className?.includes("cl-prof-aut-seg") && !n.props.disabled).length,
      0,
      "and every segment is locked",
    );
  } finally {
    globalThis.window.__ME = { role: "owner" };
  }
});

test("arming a consent answer does not draw it as the answer on record, and the how is a row of chips", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const draw = await profile(vm);
  let tree = draw();
  const ask = byTestId(tree, "consent-marketing");
  const yes = find(ask, (n) => n.type === "button" && textOf(n).trim() === "Yes");
  assert.ok(
    !String(yes.props.className).includes("active") && yes.props["aria-pressed"] === false,
    "not asked yet: Yes is not the record",
  );
  press(yes);
  tree = draw();
  const armed = find(byTestId(tree, "consent-marketing"), (n) => n.type === "button" && textOf(n).trim() === "Yes");
  assert.ok(String(armed.props.className).includes("armed"), "armed");
  assert.ok(
    !String(armed.props.className).includes("active"),
    "REGRESSION: an armed pick was drawn as the answer on record before anything was written",
  );
  assert.equal(armed.props["aria-pressed"], false, "and the record, for a reader, is unchanged");
  const how = byTestId(tree, "consent-marketing-how");
  assert.deepEqual(
    all(how, (n) => n.props?.className === "cl-prof-how-chip").map((n) => textOf(n).trim()),
    ["Sign-up form", "Their own message"],
    "the written ways, as chips",
  );
  assert.equal(
    find(tree, (n) => n.props?.className === "cl-prof-autonomy" && byTestId(n, "consent-marketing-how")),
    null,
    "REGRESSION: the how sat as a fourth cell in the three-button grid",
  );
});

test("a frame with nobody to draw has no rail column; their calls are a figure; ten seconds on the phone is not one minute", async () => {
  // Nobody at this id: the wire says they are not in the workspace.
  await newTree();
  const frame = () => pageFor("p-none");
  frame();
  await settle();
  const missing = frame();
  assert.ok(
    String(find(missing, (n) => String(n.props?.className || "").includes("cl-profile")).props.className).includes(
      "cl-profile--solo",
    ),
    "REGRESSION: an empty 320px column beside 'This person is not in your workspace'",
  );
  assert.equal(all(missing, (n) => n.type === "button").length, 1, "one way back, not two");

  const vm = toPersonVM(detail({ row: row({ visits: VISITS, call_count: 1, call_seconds: 12 }) }), ZONE, new Date(NOW));
  const tree = (await profile(vm))();
  // Their calls are counted on History's line (the one page: no number tiles), once: no About card says them again.
  assert.equal(
    find(tree, (n) => n.props?.["data-figure"] === "calls"),
    null,
    "no number tiles",
  );
  const line = find(tree, (n) => n.props?.className === "cl-prof-history-line");
  assert.match(textOf(line), /\b1 call\b/, textOf(line));
});

test("each smart list on a profile says why it has them, in its rule's words (decision 0009)", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS }) }), ZONE, new Date(NOW));
  assert.ok(vm.smartLists.length > 0, "the fixture is on one of People's lists");
  for (const l of vm.smartLists) assert.ok(typeof l.why === "string" && l.why.length > 0, `${l.label} says why`);
  // The workspace's own smart list, read as People reads it: a rule that holds for them (they reach the business by
  // WhatsApp), and the words the rule says it in are what the chip says it has them for.
  const saved = surfaceValue("people");
  await peoplePage(
    [row({ visits: VISITS })],
    [
      {
        id: "s2",
        name: "Texters",
        ids: [],
        rule: { all: [{ field: "channel", op: "is", channel: "whatsapp" }] },
      },
    ],
  );
  try {
    const tree = (await profile(vm))();
    const smart = all(tree, (n) => n.props?.["data-testid"] === "person-smart-chip");
    assert.ok(smart.length > 0);
    // A chip's name is a door to its list on People (a link: the kit's chip link), its rule's words its tip.
    for (const chip of smart) assert.match(find(chip, (n) => n.type === "a").props["data-tip"], /^Because: /);
    assert.equal(byTestId(tree, "person-list-open").props["data-tip"], "Because: Reaches you by WhatsApp");
  } finally {
    setSurfaceValue("people", saved);
  }
});

test("a profile opened before People is read says it is reading their lists -- it said there were none (decision 0009)", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS }) }), ZONE, new Date(NOW));
  const saved = surfaceValue("people");
  // As the shell draws it in a real workspace, before People is read.
  setSurfaceValue("people", undefined);
  try {
    const draw = await profile(vm);
    const lists = byTestId(draw(), "person-lists");
    assert.ok(byTestId(lists, "person-lists-reading"), "Reading…, until People lands");
    assert.doesNotMatch(textOf(lists), /No lists/, "REGRESSION: a cold load said there were no lists");
    // And a read that failed says so, rather than reading for ever.
    setStatus("people", "seeded");
    const failed = byTestId(draw(), "person-lists");
    assert.ok(byTestId(failed, "person-lists-failed"));
    assert.equal(byTestId(failed, "person-lists-reading"), null);
  } finally {
    setStatus("people", "live");
    setSurfaceValue("people", saved);
  }
});

test("a person known by number is invited to name them; an empty Lists section is a door to Lists", async () => {
  const vm = toPersonVM(
    detail({ row: row({ visits: VISITS, display_name: null, wa_profile_name: null }) }),
    ZONE,
    new Date(NOW),
  );
  assert.equal(vm.givenName, null);
  const saved = surfaceValue("people");
  setSurfaceValue("people", { ...(saved || {}), saved: [], savedRead: true });
  try {
    const draw = await profile(vm);
    const tree = draw();
    const rename = byTestId(tree, "person-rename");
    assert.equal(rename.props["aria-label"], "Give them a name", "the pencil after the number says what it is for");
    const row = find(tree, (n) => n.props?.className === "cl-prof-name-row");
    assert.equal(row?.props["data-invite"], true, "REGRESSION: a pencil only on hover, which a phone never has");
    const lists = byTestId(tree, "person-lists");
    // Smart lists hold for them (Booked), so what is missing is a list of the workspace's own: never "kept by hand",
    // which said nothing of a list with a rule.
    assert.match(textOf(lists), /No lists of your own yet\./);
    went.length = 0;
    press(byTestId(lists, "person-lists-make"));
    assert.deepEqual(
      went,
      [],
      "REGRESSION: 'make one on the People rail' -- a rail a phone does not have; a list is made in the picker, where they are",
    );
    await settle(2);
    assert.equal(
      find(draw(), (n) => n.props?.testid === "person-lists-sheet")?.props.open,
      true,
      "the door opens the lists sheet, with its new list at its foot",
    );
  } finally {
    setSurfaceValue("people", saved);
  }
});
