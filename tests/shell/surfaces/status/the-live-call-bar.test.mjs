/**
 * The live-call bar.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toLiveVM } from "@chanlytics/contracts";
import { importSrc } from "../../../_source.mjs";
import { personDto } from "../../../consent/_person-row.mjs";
import {
  clearPeople,
  find,
  fire,
  frameDoors,
  frames,
  history,
  mount,
  PAGES,
  PART,
  personDetail,
  placeAt,
  readCaches,
  setCells,
  setDeep,
  setPeople,
  setSurfaceValue,
  shell,
  textOf,
  win,
} from "./_status.mjs";
import { bridgeHolds } from "../../_bridge-holds.mjs";

/* ------------------------------ the live-call bar ------------------------------ */

test("the live bar names who is on the line and opens that call; with nobody on it, it draws nothing", () => {
  shell.installShell(win);
  // The bar reads the wall clock, like the Live page's own ticker, so the
  // fixture is "a call that started ninety seconds ago, right now".
  const NOW = Date.now();
  const iso = (ago) => new Date(NOW - ago).toISOString();
  const ongoing = (over = {}) => ({
    id: "c-live",
    retell_call_id: "call_1",
    direction: "inbound",
    call_type: "phone_call",
    status: "ongoing",
    from_e164: "+16465550123",
    from_raw: null,
    to_e164: "+13055550100",
    started_at: iso(90_000),
    ended_at: null,
    duration_ms: null,
    disconnection_reason: null,
    sentiment: null,
    call_successful: null,
    in_voicemail: null,
    summary: null,
    wanted: null,
    outcome: null,
    follow_up: null,
    caller_name: null,
    transcript_object: [],
    recording: null,
    conversation_id: "cv1",
    contact_id: "k1",
    message_id: null,
    created_at: iso(90_000),
    updated_at: iso(2_000),
    contact: { display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123" },
    ...over,
  });
  // The bar runs a one-second clock while a call is up, and only then.
  let clocks = 0;
  win.setInterval = () => {
    clocks += 1;
    return 1;
  };
  win.clearInterval = () => {};
  const drawn = () => {
    setCells([]);
    frames.begin();
    return PART.LiveCallBar({});
  };

  bridgeHolds({ values: { live: undefined } });
  assert.equal(drawn(), null, "no live surface yet: nothing to say");
  bridgeHolds({ values: { live: toLiveVM([], null, "America/New_York", new Date(NOW)) } });
  assert.equal(drawn(), null, "REGRESSION: an empty line still drew a bar");
  assert.equal(clocks, 0, "REGRESSION (defect 29): the clock ticked every second of every session, with no call up");

  bridgeHolds({ values: { live: toLiveVM([ongoing()], null, "America/New_York", new Date(NOW)) } });
  const bar = drawn();
  assert.ok(bar, "someone is on the phone");
  assert.equal(clocks, 1, "a call up: the clock runs");
  assert.match(textOf(bar), /Rosa Díaz/, "the caller in full: one call is named, in the header");
  assert.equal(bar.props["aria-label"], "Rosa Díaz is on the line. Open Live");
  const went = [];
  bridgeHolds({ doors: { navigate: (to) => went.push(to) } });
  bar.props.onClick();
  assert.deepEqual(went, ["live/c-live"], "REGRESSION: it opened the list, so a second call would be a guess");

  // The two controls a call has -- handing it over and ending it -- ask before
  // they act, and they stay on Live. A global bar is a door, not a trigger.
  assert.equal(
    find(bar, (n) => n.type === "button" && n !== bar),
    undefined,
    "nothing to press inside it",
  );

  bridgeHolds({ values: { live: undefined } });
});

test("Conversations and Live are views of the Inbox: the strip is drawn over all three, the rail lights one item, and the trail starts at the Inbox", () => {
  setSurfaceValue("inbox", { THREADS: [] });
  globalThis.LiveMonitorPage = "LiveMonitorPage";
  const at = (hash) => {
    const { tree, title } = mount(hash);
    return {
      title,
      tabs: find(tree, (n) => n.type === PART.SurfaceTabs),
      nav: find(tree, (n) => n.type === PART.Sidebar).props.active,
    };
  };

  const inbox = at("#/inbox");
  assert.equal(inbox.nav, "inbox");
  assert.equal(
    inbox.tabs.props.page,
    "inbox",
    "REGRESSION: the strip skipped the Inbox, so its views had no way back to it",
  );

  const all = at("#/conversations");
  assert.equal(all.nav, "conversations", "the shell still names the route");
  assert.equal(all.tabs.props.page, "conversations");
  assert.equal(
    all.title,
    "Conversations · Inbox · Chanlytics",
    "REGRESSION: the trail led with Conversations, a place the nav no longer has",
  );

  // The trail names a tab as its chip does, from the strip the page draws (always there: the seed's, or the read's).
  setSurfaceValue("conversations", {
    CONVERSATIONS: [],
    CV_CHANNELS: [
      { id: "all", label: "All" },
      { id: "phone", label: "Calls" },
    ],
  });
  const calls = at("#/conversations/phone");
  assert.equal(calls.title, "Calls · Conversations · Inbox · Chanlytics", "a channel is a view of a view");
  setSurfaceValue("conversations", undefined);

  const live = at("#/live");
  assert.equal(live.nav, "live");
  assert.equal(live.tabs.props.page, "live");
  assert.equal(live.title, "Live · Inbox · Chanlytics", "REGRESSION: Live hung off a nav item that is gone");

  delete globalThis.LiveMonitorPage;
});

test("the route that is still `messages` is Campaigns' (decision 0060, D4: it was the Library, and Messages folded into Campaigns on 17 Nov 2026)", () => {
  const { tree, title } = mount("#/messages");
  assert.equal(title, "Campaigns · Chanlytics", "Campaigns, where every message is now, never a page of the Inbox's");
  const strip = find(tree, (n) => n.type === PART.SurfaceTabs);
  assert.equal(strip.props.page, "messages", "the route is untouched: every deep link still works");
  assert.ok(
    find(tree, (n) => n.type === "RoutePage"),
    "and the same page draws (the layout's, in the frame)",
  );
});

test("a list's own route on a real workspace is the App Router page, drawn from the first frame, never the seeded Segments page -- the Lists page folded into People (its redirect to People's address is people-address.test.mjs's)", () => {
  // The frame no longer redirects (the shell's segments effect is gone): `segments/<id>` is a page of its own, which draws
  // the shell's reading pane and replaces the address once People says which list an id names (surfaces/people/lists-route.tsx).
  bridgeHolds({ parts: { surfaceState: () => "real" } });
  win.SegmentsPage = "SegmentsPage";
  const from = history.replaced.length;
  try {
    for (const peopleLanded of [false, true]) {
      if (peopleLanded) setPeople({ rows: [], lists: [], saved: [{ id: "s1", name: "Regulars", ids: [] }] });
      const lists = mount("#/segments/s1");
      assert.ok(
        find(lists.tree, (n) => n.type === "RoutePage"),
        "the page the layout drew is what the frame draws",
      );
      assert.ok(
        !find(lists.tree, (n) => n.type === "SegmentsPage"),
        "never the seeded Segments page on a real workspace",
      );
      assert.equal(lists.title, "People · Chanlytics", "under People in the trail, and the nav");
    }
    assert.deepEqual(history.replaced.slice(from), [], "the frame replaces nothing itself");
  } finally {
    clearPeople();
    bridgeHolds({ parts: { surfaceState: undefined } });
    delete win.SegmentsPage;
  }
});

test("a demo session's list is the App Router page too: the mockup's seeded Lists page went, and its name on the window draws nothing", () => {
  // The seeded page and its row went on 17 October 2026 (the closed-loop audit's S2, Ruben's word); a real workspace's
  // list is the test above's.
  win.SegmentsPage = "SegmentsPage";
  try {
    const demo = mount("#/segments/s1");
    assert.ok(
      find(demo.tree, (n) => n.type === "RoutePage"),
      "a demo draws the page the layout drew",
    );
    assert.ok(!find(demo.tree, (n) => n.type === "SegmentsPage"), "never the seeded page");
    assert.equal(demo.title, "People · Chanlytics", "under People in the trail, as a real workspace's");
  } finally {
    delete win.SegmentsPage;
  }
});

test("a person's page on a cold load is the layout's, and the frame names them before People lands, from the copy the tab holds", async () => {
  // Measured on production (23 Sep 2026): a new tab held Reading… until People's whole list was in (0.87 s) and only
  // then asked for the person. The page reads its own person now, and it is the layout's page (surfaces/people/person),
  // not a row's: the frame must still draw its chrome around it whatever People holds (never "not found"), and name them
  // where it can -- from the copy this tab holds, else "Profile".
  const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";
  assert.equal(
    win.SHELL_ROUTES.find((row) => row.page === "clients" && (!row.when || row.when(ID, {}))),
    undefined,
    "a person's address has no row in the frame's table: a row that took it would draw People over their page",
  );
  bridgeHolds({ parts: { surfaceState: () => "real" } });
  // The copy the tab holds of them: read once through the page's own courier (people-detail.ts), as opening them did.
  bridgeHolds({ who: { workspaces: [{ id: "t-1", timezone: "America/New_York" }] } });
  bridgeHolds({ who: { activeWorkspaceId: "t-1" } });
  win.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        data: {
          person: {
            row: personDto({ id: ID, display_name: "Zoe Martin" }),
            identities: [],
            conversations: [],
            calls: [],
            escalations: [],
            decisions: [],
            receptionist_mode: null,
            workspace_reply_mode: "auto",
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    placeAt(`#/clients/${ID}`);
    await personDetail(ID);
    const held = mount(`#/clients/${ID}`);
    assert.ok(
      find(held.tree, (n) => n.type === "RoutePage"),
      "REGRESSION: a real person with no People rows yet was 'not found'",
    );
    assert.ok(!find(held.tree, (n) => n.type === "LeadsReal"), "and no page of the frame is drawn in their place");
    assert.match(held.title, /Zoe Martin/, "named from the copy the tab kept of them");
    const crumbs = find(held.tree, (n) => n.type === PART.Topbar).props.crumbs;
    assert.equal(crumbs[0].label, "People");
    assert.equal(crumbs[0].go, frameDoors().backToPeople, "its People is the profile's own Back");
    assert.equal(crumbs[1], "Zoe Martin");

    readCaches.clearReadCaches();
    const cold = mount(`#/clients/${ID}`);
    assert.ok(
      find(cold.tree, (n) => n.type === "RoutePage"),
      "a person nobody has read yet: still their page",
    );
    assert.match(cold.title, /Profile/, "and a plain crumb until someone can name them");
  } finally {
    bridgeHolds({ parts: { surfaceState: undefined } });
    bridgeHolds({ who: { workspaces: undefined } });
    bridgeHolds({ who: { activeWorkspaceId: undefined } });
    delete win.fetch;
    readCaches.clearReadCaches();
  }
});

test("REGRESSION: the phone's drawer is a dialog while it is open, named Navigation -- with no role, the Esc that closed it cleared People's selection -- and AI's ✦ stays in the bar's row under it", () => {
  // Drawn again with the state the last draw left, as React draws after a press.
  const redraw = () => {
    setDeep(false);
    frames.begin();
    const tree = win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
    });
    setDeep(true);
    return tree;
  };
  const wrap = (tree) => find(tree, (n) => /\bside-wrap\b/.test(String(n.props?.className || "")));
  const ask = (tree) => find(tree, (n) => n.props?.["data-testid"] === "phone-ask");
  const closed = mount("#/clients").tree;
  assert.equal(wrap(closed).props.role, undefined, "the sidebar on a desk, or the drawer shut, is no dialog");
  assert.equal(wrap(closed).props["aria-label"], undefined);
  find(closed, (n) => n.type === PART.Topbar).props.onMenu();
  const open = redraw();
  assert.match(String(wrap(open).props.className), /\bopen\b/, "the drawer is open");
  assert.equal(
    wrap(open).props.role,
    "dialog",
    "REGRESSION: open, it had no role, so People's keys did not hold still behind it",
  );
  assert.equal(wrap(open).props["aria-label"], "Navigation");
  assert.equal(wrap(open).props["aria-modal"], undefined, "not modal: it does not move focus into itself");
  assert.ok(ask(closed) && ask(open), "REGRESSION: the ✦ stays with the bar while the drawer is open");
  // Its press opens AI (pinned as shell-chrome.tsx's text in ask/line/ until 25 Nov 2026).
  const line = (tree) => find(tree, (n) => n.type === PART.AskBar);
  assert.equal(line(open).props.open, false, "AI is closed until asked");
  ask(open).props.onClick();
  const asked = redraw();
  assert.equal(line(asked).props.open, true, "the ✦ opens it");
  assert.ok(ask(asked), "on the web it stays in the bar's row while AI is open");
  // Inside the native app (the class contracts' boot script puts on the root, IN_APP_CLASS) AI keeps a screen of its own
  // over the circle, which goes while it is open.
  const doc = globalThis.document;
  const root = doc.documentElement;
  doc.documentElement = { ...root, classList: { contains: (name) => name === "in-app" } };
  try {
    assert.equal(ask(redraw()), undefined, "inside the app, the circle goes while AI is open");
  } finally {
    doc.documentElement = root;
  }
});

test("a route whose surface has not landed is an empty pane that says it is reading, never a skeleton, and the page fades in as it lands", () => {
  // The skeleton that stood here was the mockup's page anatomy and matched no real page, so every page jumped when
  // it left (layout-measure.test.mjs says what was measured). Now the pane the page will fill is empty and busy, one
  // status line says it is reading, and the route view is keyed on readiness so the route-in fade plays on the page
  // as it lands, not on the empty pane.
  const timers = [];
  const keepTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    timers.push(ms);
    return 0;
  };
  const byClass = (tree, has) =>
    find(tree, (n) => typeof n.props?.className === "string" && n.props.className.includes(has));
  bridgeHolds({ parts: { surfaceGate: () => false } });
  try {
    const { tree } = mount("#/inbox");
    assert.ok(!byClass(tree, "skel"), "no skeleton");
    assert.ok(!find(tree, (n) => n.type === "RoutePage"), "the page is not drawn before its surface lands");
    const view = byClass(tree, "route-view");
    assert.equal(view.props["aria-busy"], "true", "the pane the page will fill is busy");
    const reading = byClass(tree, "route-reading");
    assert.ok(reading, "one line says it is reading");
    assert.equal(reading.props.role, "status", "as a status, for a screen reader");
    assert.equal(textOf(reading).trim(), "Reading…");
    // The stub draws the shell shallow, so a component returned here would hide its own markup from byClass: the
    // pane is proven empty by what the boundary holds, which is that one line and nothing else.
    const boundary = view.props.children.find((k) => k && typeof k === "object");
    const inside = boundary.props.children.filter((k) => k != null && typeof k === "object");
    assert.equal(inside.length, 1, "the pane holds the one line and nothing else: no skeleton, no page");
    assert.equal(inside[0], reading);
    assert.ok(timers.includes(8000), "the unavailable pane still comes after eight seconds");
    bridgeHolds({ parts: { surfaceGate: () => true } });
    const landed = mount("#/inbox");
    const viewLanded = byClass(landed.tree, "route-view");
    assert.notEqual(viewLanded.props.key, view.props.key, "keyed on readiness: the page fades in as it lands");
    assert.equal(viewLanded.props["aria-busy"], undefined, "and is no longer busy");
    assert.ok(!byClass(landed.tree, "route-reading"), "the line goes with the wait");
    assert.ok(
      find(landed.tree, (n) => n.type === "RoutePage"),
      "the page is there",
    );
  } finally {
    globalThis.setTimeout = keepTimeout;
    bridgeHolds({ parts: { surfaceGate: undefined } });
  }
});

test("Today waits for the card it draws above its queue, and once its own read is in, only for so long", () => {
  // The card that says what is left to set up sits above the queue: landing after it, it pushed the queue down. The
  // gate holds Today for it (surface-registry ROUTE_WAITS); once Today's own surface is in, past the wait it draws.
  const due = new Map();
  const keepTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    due.set(ms, fn);
    return 0;
  };
  const redraw = () => {
    setDeep(false);
    frames.begin();
    const tree = win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
    });
    setDeep(true);
    return tree;
  };
  bridgeHolds({ parts: { routeWaitMs: 3000 } });
  bridgeHolds({ parts: { surfaceGate: (page, param, own) => !!own } });
  try {
    const held = mount("#/today");
    assert.ok(!find(held.tree, (n) => n.type === "RoutePage"), "the queue is not drawn under a card still on its way");
    assert.ok(due.has(3000), "and waits the registry's time, no longer");
    due.get(3000)();
    assert.ok(
      find(redraw(), (n) => n.type === "RoutePage"),
      "past the wait, the page draws with what it has",
    );

    // The wait counts from Today's own surface landing, not from arriving: a slow own read that used the whole wait
    // would draw the moment it landed, and the card would still push the queue down.
    const told = [];
    bridgeHolds({
      parts: {
        onSurfaceReady: (fn) => {
          told.push(fn);
          return () => {};
        },
      },
    });
    bridgeHolds({ parts: { surfaceGate: () => false } });
    due.clear();
    mount("#/today");
    assert.ok(!due.has(3000), "REGRESSION: the wait ran from arriving, before Today's own surface was in");
    assert.ok(!find(redraw(), (n) => n.type === "RoutePage"), "a page whose own surface is not in keeps reading");
    bridgeHolds({ parts: { surfaceGate: (page, param, own) => !!own } });
    for (const fn of told) fn();
    assert.ok(due.has(3000), "armed as Today's own surface lands");
    due.get(3000)();
    assert.ok(
      find(redraw(), (n) => n.type === "RoutePage"),
      "and past it, Today draws",
    );
  } finally {
    globalThis.setTimeout = keepTimeout;
    bridgeHolds({ parts: { surfaceGate: undefined } });
    bridgeHolds({ parts: { onSurfaceReady: undefined } });
    bridgeHolds({ parts: { routeWaitMs: undefined } });
  }
});

test("a move between two views of one strip arrives as the Inbox's tabs do -- People to Leads and back -- and a move within one family that is no strip's draws at once", async () => {
  // The fade was taken off People's scopes when a switch drew the whole scope before anything answered, and the fade
  // on top read as a wait. With the press answered first and the page drawn once (5 Oct 2026), People's scopes arrive
  // as the Inbox's Needs you, Conversations and Live do: from the side the tab stands on, which the view says
  // (`data-slide`) and the kit's deck brings it in by, the same on a desk and a phone (8 Oct 2026; it was a class a
  // phone's stylesheet slid and a desk's ignored). One person's page to the next is the same family and no strip's
  // move, and draws at once. A person's page is People's view since it is drawn over the list (people-route.tsx, 20 Oct
  // 2026): the frame's view stays on screen, and the person comes in over the list by an entrance of the page's own.
  shell.installShell(win);
  // Where a view stands on a strip is the strip's (surface-tabs.tsx stripPlace), over People's scope words (people-globals.ts).
  // The strip (surfaces/frame/surface-tabs.tsx), under the names the frame draws and asks it by.
  await importSrc("apps/dashboard/src/surfaces/frame/surface-tabs.tsx");
  await importSrc("apps/dashboard/src/surfaces/people/words.ts");
  const view = (t) =>
    find(t, (n) => typeof n.props?.className === "string" && n.props.className.includes("route-view"));
  const stays = (t) => view(t).props.className.split(/\s+/).includes("route-stay");
  const go = (hash) => {
    placeAt(hash);
    fire("popstate");
    setDeep(false);
    frames.begin();
    const t = win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
    });
    setDeep(true);
    return t;
  };
  const slides = (t) => view(t).props["data-slide"] ?? null;
  const { tree } = mount("#/clients");
  assert.equal(stays(tree), false, "a page opened cold fades in");
  // People's scopes are one view of the frame since the page keeps them (people-route.tsx, 18 Oct 2026): the frame's view
  // stays where it is, and the scope arriving comes in from its tab's side by the deck inside it (people/scope-view.ts).
  const leads = go("#/clients/leads");
  assert.equal(view(leads).props.key, view(tree).props.key, "Leads is the view already on screen");
  assert.equal(slides(leads), null, "the frame slides nothing: the page moves its own scope");
  const back = go("#/clients");
  assert.equal(view(back).props.key, view(tree).props.key, "and back");
  assert.equal(view(go("#/clients/c-aisha")).props.key, view(tree).props.key, "a person's page is People's view");
  assert.equal(view(go("#/clients/c-bob")).props.key, view(tree).props.key, "the next person's page too");
  assert.equal(view(go("#/clients")).props.key, view(tree).props.key, "and the list, coming back from them");
  assert.equal(stays(go("#/inbox")), false, "another page fades in");
  // A page landing where the reading pane stood fades in, even on the page the reading pane was for.
  bridgeHolds({ parts: { surfaceGate: () => false } });
  try {
    assert.equal(stays(go("#/clients/leads")), false, "the reading pane never stays");
    bridgeHolds({ parts: { surfaceGate: () => true } });
    assert.equal(stays(go("#/clients/leads")), false, "the page that lands where it stood fades in");
  } finally {
    bridgeHolds({ parts: { surfaceGate: undefined } });
  }
});

test("given the router's route, the frame draws that route and no other: an address heard before the router lands moves nothing", () => {
  // The frame and the page read one clock (FrameHost hands the frame the route of Next's pathname, the page reads the
  // same pathname): a pushed entry the router has not drawn yet must not remount the view with the page it is leaving,
  // which on a phone slid People in under Leads' tab before Leads arrived (5 Oct 2026).
  shell.installShell(win);
  const view = (t) =>
    find(t, (n) => typeof n.props?.className === "string" && n.props.className.includes("route-view"));
  const draw = (routeNow) => {
    setDeep(false);
    frames.begin();
    const t = win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
      routeNow,
    });
    setDeep(true);
    return t;
  };
  setCells([]);
  placeAt("#/clients");
  assert.equal(view(draw("clients")).props.key, "clients");
  // The address moves first, as a pushed entry does before the router draws it.
  placeAt("#/inbox");
  fire("popstate");
  assert.equal(view(draw("clients")).props.key, "clients", "the heard address does not move the view");
  // The router lands: the Inbox, under its own mount.
  assert.equal(view(draw("inbox")).props.key, "inbox");
  // And Back, as the router says it.
  placeAt("#/clients");
  fire("popstate");
  assert.equal(view(draw("inbox")).props.key, "inbox", "nor does Back before the router has it");
  assert.equal(view(draw("clients")).props.key, "clients");
});

test("People › Pipeline is an address of People's route (clients/pipeline): the route takes it in every workspace, its crumbs name the view, and the whole family is one mount", async () => {
  // The frame draws no page of its own for it: the route's page does (surfaces/people/people-route.tsx: the Pipeline,
  // every workspace's since 0008 was amended on 18 Oct 2026), and the frame draws what surfaces/people/chrome.ts says
  // of the address around it.
  const { peopleTakes, peopleChrome } = await importSrc("apps/dashboard/src/surfaces/people/chrome.ts");
  const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const chrome = (param) => peopleChrome({ param });
  // The crumbs and the mount are what this pins; the views the frame's strip draws are people/moments/people-views.test.mjs's.
  const where = (param) => {
    const { crumbs, mount } = chrome(param);
    return { crumbs, mount };
  };
  const PEOPLE = { label: "People", to: "clients" };
  try {
    setSurfaceValue("people", { rows: [], lists: [], saved: [] });
    for (const param of ["pipeline", "pipeline:v-proposals", "pipeline:v-proposals:p-5b3c1a2e"])
      assert.equal(peopleTakes(param), true, `the route takes ${param}`);
    assert.equal(peopleTakes("pipelines"), true, "an id that starts with the word is a person's: the page's");
    assert.equal(peopleTakes("leads"), true, "Leads is the page's too (decision 0015, step 9)");
    // People's three scopes are one mount: the page keeps them and shows the one asked for (people-route.tsx, 18 Oct 2026).
    assert.equal(chrome("leads").mount, "clients");
    assert.deepEqual(where("pipeline"), { crumbs: [PEOPLE, "Pipeline"], mount: "clients" });
    // Every view of the Pipeline, and a person open over one, is the page already there: it follows its address (contracts
    // pipelineRoute), and the crumbs name the view.
    const viewed = chrome("pipeline:v-proposals:p-5b3c1a2e");
    assert.equal(viewed.mount, chrome("pipeline").mount, "one mount for the whole address family");
    assert.equal(
      viewed.mount,
      chrome("seg:opted_in").mount,
      "the Pipeline and People are one mount, as Leads and People are",
    );
    assert.deepEqual(viewed.crumbs, [PEOPLE, { label: "Pipeline", to: "clients/pipeline" }, "Proposal out"]);
    assert.deepEqual(
      chrome("pipeline:v-bogus").crumbs,
      [PEOPLE, "Pipeline"],
      "a view it does not know is the whole of it",
    );
    // What waits on the owner is named by the workspace's pace, as the rail names it (0008, amended).
    assert.equal(chrome("pipeline:v-waiting").crumbs.at(-1), "Nothing back in a week");
    setSurfaceValue("people", {
      rows: [],
      lists: [],
      saved: [],
      dealPace: { medianDays: 8, yeses: 6, waitDays: 10, longerThanUsual: true, words: "Usually 8 days to a yes" },
    });
    assert.equal(chrome("pipeline:v-waiting").crumbs.at(-1), "Nothing back in 10 days");
    // Before People has landed the crumbs still say the Pipeline: nothing it holds decides them. People's one mount: the
    // page keeps its three scopes (people-route.tsx, the strips review of 18 Oct 2026).
    setSurfaceValue("people", undefined);
    assert.deepEqual(where("pipeline"), { crumbs: [PEOPLE, "Pipeline"], mount: "clients" });
  } finally {
    setSurfaceValue("people", undefined);
  }
});

test("every surface the shell starts says it stopped refreshing by a word of its own, but who is looking (S2-5)", async () => {
  const { registeredSurfaces } = await import("../../hearing/_reads.mjs");
  const keys = [];
  for (const { name, file } of registeredSurfaces()) keys.push((await importSrc(file))[name].key);
  // Who is looking: a workspace read that fails is the shell's own state ("Can't reach your workspace"), never a line.
  const UNSAID = new Set(["workspace"]);
  assert.deepEqual(
    keys.filter((k) => !UNSAID.has(k) && !shell.SURFACE_LABELS[k]),
    [],
    "a surface the status line cannot name stops refreshing in silence: give it a word in shell.ts SURFACE_LABELS",
  );
  assert.deepEqual(
    Object.keys(shell.SURFACE_LABELS).filter((k) => !keys.includes(k)),
    [],
    "a word for a surface the shell does not start",
  );
  for (const [key, word] of Object.entries(shell.SURFACE_LABELS)) assert.ok(word.trim(), `${key}: a word`);
});

test("on a phone the web's tab bar stands at the thumb with what needs you; inside the app the native bar stands there, and its More opens the drawer", () => {
  // The places are places.ts's (PHONE_TABS), which the bar and the document's outline both draw from.
  const redraw = () => {
    setDeep(false);
    frames.begin();
    const tree = win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
    });
    setDeep(true);
    return tree;
  };
  const tabs = (tree) => find(tree, (n) => n.type === "PhoneTabs" || n.type?.name === "PhoneTabs");
  const wrap = (tree) => find(tree, (n) => /\bside-wrap\b/.test(String(n.props?.className || "")));
  const bar = tabs(mount("#/inbox").tree);
  assert.ok(bar, "the web's bar, outside the app");
  assert.equal(typeof bar.props.inboxNeeds, "number", "carrying what needs you");
  assert.equal(bar.props.page, "inbox", "with the page it is on");
  bar.props.onMenu();
  assert.match(String(wrap(redraw()).props.className), /\bopen\b/, "its More opens the drawer");
  // Inside the native app (the class contracts' boot script puts on the root, IN_APP_CLASS) its own bar stands there.
  const doc = globalThis.document;
  const root = doc.documentElement;
  doc.documentElement = { ...root, classList: { contains: (name) => name === "in-app" } };
  try {
    assert.equal(tabs(mount("#/inbox").tree), undefined, "REGRESSION: two tab bars, the web's under the app's");
    // The native More tab is the bridge's shell:menu (bridge/app-bridge.ts, mobile/app-bridge-page.test.mjs).
    fire("shell:menu");
    assert.match(String(wrap(redraw()).props.className), /\bopen\b/, "the native More opens the drawer");
  } finally {
    doc.documentElement = root;
  }
});
