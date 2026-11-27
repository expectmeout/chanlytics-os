/**
 * The shell's status around the page, and the shell's own doors (B6a-2): the top bar, the palette, the drawer and the
 * phone's AI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shellStatusLine,
  toBillingVM,
  LOOK_OPTIONS,
  LOOK_OFFERED,
  retiredRouteOf,
  runRoute,
} from "@chanlytics/contracts";
import { importSrc } from "../../../_source.mjs";
import { keysDrawn } from "../../../_keys.mjs";
import {
  backToPeople,
  clearPeople,
  cvRoute,
  find,
  fire,
  frames,
  heard,
  history,
  mount,
  PAGES,
  PART,
  placeAt,
  setCells,
  setDeep,
  setPeople,
  setSurfaceValue,
  settle,
  shell,
  textOf,
  waitingToday,
  walk,
  win,
} from "./_status.mjs";
import { bridgeHolds, provided, surfaceValue } from "../../_bridge-holds.mjs";

/** The frame's doors (surfaces/frame-doors.ts), which it fills as it draws: what a page presses to move or open Ask. */
const frameDoors = await importSrc("apps/dashboard/src/surfaces/frame-doors.ts");

test("the line under the top bar: a live region that is always there, the words, and the one press", async () => {
  const kept = provided("shell");
  setDeep(true);
  setCells([]);
  const bar = () => {
    frames.begin();
    return PART.ShellStatusBar({});
  };
  const cta = (tree) => find(tree, (n) => n.props?.["data-testid"] === "shell-status-cta");
  bridgeHolds({ parts: { chrome: { statusLine: shellStatusLine } } });
  // What the shell last published for the line (bridge/shell.ts `status()`), as the frame reads it.
  let status = null;
  bridgeHolds({ parts: { shell: { status: () => status } } });

  status = { stale: false, degraded: [] };
  let tree = bar();
  assert.equal(tree.props.role, "status");
  assert.equal(tree.props["aria-live"], "polite", "mounted while all is well, so the next change is announced");
  assert.equal(
    find(tree, (n) => n.props?.["data-testid"] === "shell-status"),
    undefined,
    "and empty",
  );

  status = { stale: false, degraded: [], offline: true };
  tree = bar();
  assert.match(textOf(tree), /You're offline/);
  assert.equal(cta(tree), undefined, "nothing to press without a connection to press it with");

  let retried = 0;
  let finish = () => {};
  bridgeHolds({
    parts: {
      shell: {
        status: () => status,
        retry: () => {
          retried += 1;
          return new Promise((r) => {
            finish = r;
          });
        },
      },
    },
  });
  status = { stale: false, degraded: ["Inbox", "Calendar"] };
  tree = bar();
  assert.match(textOf(tree), /Inbox and Calendar stopped refreshing/);
  assert.match(textOf(tree), /You're seeing what was last loaded\./);
  assert.equal(textOf(cta(tree)), "Retry");
  cta(tree).props.onClick();
  tree = bar();
  assert.equal(textOf(cta(tree)), "Retrying…", "the press is answered where it was made");
  assert.equal(cta(tree).props["aria-busy"], true);
  assert.notEqual(cta(tree).props.disabled, true, "busy, not disabled: the focus stays on the button");
  cta(tree).props.onClick();
  assert.equal(retried, 1, "a second press while it reads is not a second read");
  finish();
  await settle();
  tree = bar();
  assert.equal(textOf(cta(tree)), "Retry");

  // The pause rides with the billing surface, in the shape the billing read keeps.
  const price = { id: "price_1", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Chanlytics OS" };
  const account = {
    mode: "stripe",
    status: "paused",
    price_id: "price_1",
    current_period_end: null,
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    card_brand: null,
    card_last4: null,
    last_payment_failed_at: null,
    last_paid_at: null,
    updated_at: "2026-09-07T14:00:00Z",
  };
  const dto = { ready: true, account, price, trial_days: 14, role: "owner" };
  assert.equal(toBillingVM(dto).paused, true, "the fixture is a paused account");
  setSurfaceValue("billing", { dto, fetchedAt: Date.now() });
  bridgeHolds({ parts: { billing: { vm: (d, nowMs) => toBillingVM(d, nowMs) } } });
  const went = [];
  bridgeHolds({ doors: { navigate: (to) => went.push(to) } });
  status = { stale: true, degraded: [] };
  tree = bar();
  assert.match(textOf(tree), /AI is paused/, "and outranks a newer build");
  cta(tree).props.onClick();
  assert.deepEqual(went, ["admin/billing"]);

  setSurfaceValue("billing", undefined);
  tree = bar();
  assert.equal(textOf(cta(tree)), "Reload");
  cta(tree).props.onClick();
  assert.equal(win.location.reloads, 1);
  bridgeHolds({ parts: { shell: kept } });
});

test("the shell names the tab from the crumbs it draws, counts what needs you, and puts the line directly under the top bar", () => {
  shell.installShell(win);
  // The crumb names Rosa from the Inbox's thread; the number in front is Need you's two people.
  setSurfaceValue("inbox", {
    THREADS: [
      { id: "th-9", who: "Rosa", state: "needs" },
      { id: "th-2", state: "escalated" },
      { id: "th-3", state: "done" },
    ],
  });
  setSurfaceValue("today", waitingToday("th-9", "th-2"));
  const { tree, title } = mount("#/inbox/th-9");
  assert.equal(title, "(2) Rosa · Inbox · Chanlytics");
  // The top bar and the bars under it stand in the frame's top, over the page (surfaces/frame/shell-chrome.tsx `.frame-top`).
  const top = find(tree, (n) => n.props?.className === "frame-top");
  const kids = top.props.children.filter((k) => k && typeof k === "object");
  const at = (type) => kids.findIndex((k) => k.type === type);
  assert.ok(at(PART.Topbar) >= 0, "the top bar");
  // A call happening right now is the one thing on this line that stops being
  // true by itself, so it sits above the status line; both are above the page,
  // on a phone as on a desk, and each draws nothing when it has nothing to say.
  assert.equal(at(PART.LiveCallBar), at(PART.Topbar) + 1, "a call in progress, first");
  assert.equal(at(PART.ShellStatusBar), at(PART.Topbar) + 2, "then the line, above the page, on a phone as on a desk");
  setSurfaceValue("inbox", { THREADS: [] });
  setSurfaceValue("today", undefined);
});

test("on a real workspace a crumb, and so the tab, never names the demo's people or lists", () => {
  assert.equal(
    mount("#/calendar/a-1").title,
    "Calendar · Chanlytics",
    "no appointment is named from a seeded week: it is gone",
  );
  setSurfaceValue("calendar", { vm: { bookingLink: null }, fetchedAt: 1 });
  assert.equal(mount("#/calendar/a-1").title, "Calendar · Chanlytics", "a real calendar is not named from the seeds");

  win.CLIENT_SEGMENTS = [{ id: "lapsed-60", label: "Lapsed 60 days" }];
  setSurfaceValue("broadcasts", { rows: [] });
  // Who each audience reaches is its own read (broadcasts/audiences-surface.ts): an audience's address is named from it.
  setSurfaceValue("audiences", {
    audiences: [{ kind: "list", id: "lapsed", label: "Lapsed", counts: null, hint: "" }],
  });
  // Sent's addresses land on Campaigns' screens (the Campaigns wiring review's lanes 2 and 6: an audience's on New's Send
  // once), and Sent names nothing of its own; New names no list, seeded or real.
  assert.equal(mount("#/broadcasts/lapsed").title, "Campaigns · Chanlytics");
  assert.equal(mount("#/broadcasts/lapsed-60").title, "Campaigns · Chanlytics");
  assert.equal(mount("#/campaigns/sequences/new:once:to:lapsed-60").title, "New · Campaigns · Chanlytics");

  setPeople({ rows: [], lists: [{ id: "opted_in", label: "Opted in" }], saved: [] });
  assert.equal(mount("#/clients/seg:opted_in").title, "Opted in · People · Chanlytics");
  assert.equal(mount("#/clients/seg:lapsed-60").title, "List · People · Chanlytics");

  assert.equal(mount("#/admin").title, "Details · Settings · Chanlytics", "the pane the bare route opens, by name");
  assert.equal(mount("#/admin/memory").title, "Memory · Settings · Chanlytics", "what AI remembers (decision 0070)");
  assert.equal(
    mount("#/admin/platform").title,
    "Profile · Settings · Chanlytics",
    "the back office is not named to a customer: the pane lands on Profile, and so does the crumb",
  );
  bridgeHolds({ who: { me: { platform_admin: true } } });
  assert.equal(
    mount("#/admin/platform").title,
    "The Console · Settings · Chanlytics",
    "and for the people it is for, the crumb names it",
  );
  bridgeHolds({ who: { me: undefined } });
  setSurfaceValue("calendar", undefined);
  setSurfaceValue("broadcasts", undefined);
  setSurfaceValue("audiences", undefined);
  for (const k of ["CLIENT_SEGMENTS"]) delete win[k];
  clearPeople();
});

test("the tab counts Need you's rows alone: a thread a teammate is answering, or one you have, flagged in the Inbox, is not waiting on you", () => {
  shell.installShell(win);
  setSurfaceValue("inbox", {
    THREADS: [
      { id: "th-1", real: true, state: "escalated", needsYou: true, takenOver: false, claimedByOther: false },
      { id: "th-2", real: true, state: "escalated", needsYou: false, takenOver: false, claimedByOther: true },
      { id: "th-3", real: true, state: "escalated", needsYou: false, takenOver: true, claimedByOther: false },
    ],
  });
  // Today's read holds the one who waits on you: the teammate's and your own are no row of Need you.
  setSurfaceValue("today", waitingToday("th-1"));
  assert.equal(
    mount("#/inbox").title,
    "(1) Inbox · Chanlytics",
    "REGRESSION: a teammate's thread was counted as needing you until the Inbox itself mounted",
  );
  setSurfaceValue("inbox", { THREADS: [] });
  setSurfaceValue("today", undefined);
});

test("REGRESSION: the tab keeps its name when the layout's own title lands after the shell's -- a page loaded cold said 'Chanlytics OS' until something it counted changed", () => {
  shell.installShell(win);
  const watches = [];
  win.MutationObserver = class {
    constructor(fn) {
      this.fn = fn;
      this.on = false;
      watches.push(this);
    }
    observe(target, opts) {
      this.on = target === globalThis.document.head && !!opts.childList && !!opts.subtree && !!opts.characterData;
    }
    disconnect() {
      this.on = false;
    }
  };
  globalThis.document.head = {};
  try {
    const { title } = mount("#/admin/autonomy");
    assert.equal(title, "Autonomy · Settings · Chanlytics");
    // What the layout's metadata does when it lands after the shell's first paint: its own title, over the shell's.
    globalThis.document.title = "Chanlytics";
    for (const w of watches) if (w.on) w.fn([]);
    assert.equal(
      globalThis.document.title,
      "Autonomy · Settings · Chanlytics",
      "REGRESSION: the layout's title stayed, and nothing on the page wrote the name again",
    );
    assert.equal(watches.filter((w) => w.on).length, 1, "one watch on the head, for the one name");
  } finally {
    delete win.MutationObserver;
    delete globalThis.document.head;
  }
});

test("REGRESSION (A7): a link to a chat opens that chat -- the shell handed the page only call ids, so a person's profile opened the first conversation in the list", () => {
  shell.installShell(win);
  setSurfaceValue("conversations", {
    CONVERSATIONS: [
      { id: "c-9", who: "Rosa Díaz" },
      { id: "cv-4", who: "Emily Chen" },
    ],
  });
  // The frame names the trail and lights the nav; the page's own props are what the route hands it by the page's one
  // rule (conversations-route.tsx, cvRoute), which the address's word is read by.
  const pageAt = (hash) => {
    const { title } = mount(hash);
    const cv = cvRoute(hash.split("/").slice(2).join("/") || null);
    return { props: { channel: cv.channel, initialId: cv.id }, title };
  };
  try {
    const chat = pageAt("#/conversations/c-9");
    assert.equal(
      chat.props.initialId,
      "c-9",
      "REGRESSION: a chat's id was dropped, and the page opened someone else's",
    );
    assert.equal(
      chat.title,
      "Rosa Díaz · Conversations · Inbox · Chanlytics",
      "Conversations is a view of the Inbox, so the trail says so",
    );
    assert.equal(pageAt("#/conversations/cv-4").props.initialId, "cv-4", "a call's id still opens it");
    const phone = pageAt("#/conversations/phone").props;
    assert.deepEqual([phone.channel, phone.initialId], ["phone", null], "a channel is a filter, not an id");
    const on = pageAt("#/conversations/phone:cv-4");
    assert.deepEqual(
      [on.props.channel, on.props.initialId],
      ["phone", "cv-4"],
      "a row on its tab, as the page writes it when a row opens",
    );
    assert.equal(on.title, "Emily Chen · Conversations · Inbox · Chanlytics", "named in the trail");
    assert.equal(
      find(mount("#/conversations/phone:cv-4").tree, (n) => n.type === PART.Sidebar).props.active,
      "calls",
      "and the nav lights the tab, not the raw word",
    );
  } finally {
    setSurfaceValue("conversations", undefined);
  }
});

test("REGRESSION: a real workspace's WhatsApp and Email tabs filter the list -- the shell knew only the mockup's three, so it opened 'whatsapp' as a conversation nobody could find", async () => {
  shell.installShell(win);
  const { conversationTabs } = await importSrc("apps/dashboard/src/surfaces/inbox/conversations-surface.ts");
  // The strip the surface's override draws for a workspace on the phone, WhatsApp, texts and email.
  const CV_CHANNELS = conversationTabs(true, ["whatsapp", "sms", "email"]);
  setSurfaceValue("conversations", { CONVERSATIONS: [{ id: "c-9", who: "Rosa Díaz" }], CV_CHANNELS });
  const pageAt = (hash) => {
    const { title } = mount(hash);
    const cv = cvRoute(hash.split("/").slice(2).join("/") || null);
    return { props: { channel: cv.channel, initialId: cv.id }, title };
  };
  try {
    for (const tab of CV_CHANNELS.filter((t) => t.id !== "all")) {
      const { props, title } = pageAt(`#/conversations/${tab.id}`);
      assert.deepEqual(
        [props.channel, props.initialId],
        [tab.id, null],
        `REGRESSION: "${tab.id}" was read as a conversation's id`,
      );
      assert.equal(
        title,
        `${tab.label} · Conversations · Inbox · Chanlytics`,
        "the trail names the tab in its chip's words",
      );
    }
    assert.deepEqual(
      [pageAt("#/conversations").props.channel, pageAt("#/conversations").props.initialId],
      ["all", null],
    );
    assert.equal(pageAt("#/conversations/c-9").props.initialId, "c-9", "and a row's id still opens its row");
  } finally {
    setSurfaceValue("conversations", undefined);
  }
});

test("a link to a call opens that call on Live, named in the crumbs -- the route had no place for its id, so Today's door could only open the list", () => {
  shell.installShell(win);
  setSurfaceValue("live", { now: [{ callId: "c-9", who: "Rosa Díaz" }], recent: [], fetchedAtMs: 1 });
  try {
    const crumbs = (hash) => find(mount(hash).tree, (n) => n.type === PART.Topbar).props.crumbs;
    assert.equal(
      crumbs("#/live/c-9").at(-1),
      "Rosa Díaz",
      "REGRESSION: the route dropped the call's id, so nothing named the call",
    );
    assert.deepEqual(crumbs("#/live"), [{ label: "Inbox", to: "inbox" }, "Live"]);
    // Every call is the Live page already on screen: a row writes the address it opens (replaced), so each call
    // being its own mount would tear the page down on every click.
    const key = (hash) =>
      find(mount(hash).tree, (n) => String(n.props?.className || "").includes("main-scroll")).props.key;
    assert.equal(key("#/live/c-9"), key("#/live"), "one mount across its calls");
    assert.equal(key("#/live/c-1"), key("#/live/c-9"));
  } finally {
    setSurfaceValue("live", undefined);
  }
});

test("a page that follows its own address is one mount across it -- Settings' panes, the Inbox's threads, Campaigns' runs, Live's calls -- and every other page's param is its own mount, the safe default", () => {
  // Run, where chrome.test.mjs used to match the Set's source text: the shell as drawn is what decides.
  shell.installShell(win);
  globalThis.LiveMonitorPage = "LiveMonitorPage";
  try {
    const key = (hash) =>
      find(mount(hash).tree, (n) => String(n.props?.className || "").includes("main-scroll")).props.key;
    const one = (...hashes) => assert.equal(new Set(hashes.map(key)).size, 1, `one mount: ${hashes.join(", ")}`);
    one("#/admin/workspace", "#/admin/billing", "#/admin/team");
    one("#/inbox", "#/inbox/th-1", "#/inbox/th-2");
    // Campaigns follows its address: Sequences' list, a run at its home, the one New.
    one("#/campaigns/sequences", "#/campaigns/sequences/q-1/runs/r-1", "#/campaigns/sequences/new:once");
    one("#/live", "#/live/c-1", "#/live/c-2");
    one("#/conversations", "#/conversations/phone", "#/conversations/phone:cv-1", "#/conversations/cv-2");
    // The Calendar follows its address (its views, a day, a visit over a view: the Calendar's lane A), so a view picked
    // keeps the days on screen, where a page mounted afresh for each went back to today.
    one("#/calendar", "#/calendar/month", "#/calendar/2026-10-01", "#/calendar/week:2026-10-01:a-v1");
    // Not following its param: showing another entity in a surface built for the last one is the danger, so the
    // default is a new mount.
    assert.notEqual(key("#/segments/seg-a"), key("#/segments/seg-b"), "a list's address is its own mount");
  } finally {
    delete globalThis.LiveMonitorPage;
  }
});

test("REGRESSION (C9): a link to a run opens that run, named in the crumbs, on the page already open -- at its home under its sequence now (the Campaigns wiring review's lane 2)", () => {
  shell.installShell(win);
  setSurfaceValue("broadcasts", { rows: [{ id: "b-1", name: "Win-back · 2026-09-10" }] });
  try {
    // The frame names the trail and keeps one mount for Campaigns.
    const at = (hash) => {
      const { tree } = mount(hash);
      return {
        crumbs: find(tree, (n) => n.type === PART.Topbar).props.crumbs,
        key: find(tree, (n) => String(n.props?.className || "").includes("main-scroll")).props.key,
      };
    };
    const run = at(`#/${runRoute("b-1", "q-1")}`);
    assert.equal(run.crumbs.at(-1), "Win-back · 2026-09-10");
    assert.equal(
      at(`#/${runRoute("b-older")}`).crumbs.at(-1),
      "Run",
      "a run past the newest fifty is still named for what it is, before its own read names it",
    );
    assert.equal(
      run.key,
      at("#/campaigns/sequences").key,
      "one mount with Sequences' list, which the run opens beside",
    );
  } finally {
    setSurfaceValue("broadcasts", undefined);
  }
});

test("every view of Leads is one mount: a search, a list, a class or an open lead keeps the page that is there -- each rail pick tore it down, and the search box, the scroll and a half-typed Find went with it", () => {
  // Leads is People's page's (decision 0015, step 9): the frame draws the route's page and keys its view by the mount the
  // surface's chrome names (surfaces/people/chrome.ts), one for every view of Leads, which follows its own address.
  shell.installShell(win);
  bridgeHolds({ parts: { surfaceGate: () => true } });
  const SEARCH = "5e000000-0000-4000-8000-000000000001";
  const LEAD = "1ead0000-0000-4000-8000-000000000001";
  const at = (hash) => {
    const { tree } = mount(hash);
    return {
      key: find(tree, (n) => String(n.props?.className || "").includes("main-scroll")).props.key,
      page: find(tree, (n) => n.type === "RoutePage"),
    };
  };
  try {
    const all = at("#/clients/leads");
    assert.ok(all.page, "the route's page draws Leads, in the frame");
    for (const param of [
      `leads:s-${SEARCH}`,
      "leads:l-ready",
      `leads:s-${SEARCH}:c-review`,
      `leads:p-${LEAD}`,
      `leads:s-${SEARCH}:l-nurture:p-${LEAD}`,
    ]) {
      const view = at(`#/clients/${param}`);
      assert.equal(view.key, all.key, `${param} is the Leads page already on screen`);
      assert.ok(view.page, "the same page, which follows the address it is on (people-route.tsx)");
    }
    // People and Leads are one view of the frame: the page keeps both scopes, each its own component with its own sort and
    // columns, and shows the one asked for (people-route.tsx, the strips review of 18 Oct 2026).
    assert.equal(
      at("#/clients").key,
      all.key,
      "People and Leads are one view of the frame, the page keeping its scopes",
    );
    // A person's page is drawn by People's page over the list it was opened from, which stays where it was under it
    // (people-route.tsx, 20 Oct 2026): People's view too, each person a page of their own inside it.
    assert.equal(at("#/clients/c-1").key, all.key, "a person's page is People's view, over its list");
    assert.equal(at("#/clients/c-2").key, at("#/clients/c-1").key, "and so is the next person's");
    // People's views are the page's, which follows its own address (surfaces/people/people-route.tsx): one mount for the
    // list and every view of it. A page it did not write the address of mounts afresh on its own (people-address.test.mjs).
    assert.equal(
      at("#/clients/seg:opted_in").key,
      at("#/clients").key,
      "People's views are one mount, the page following its own address",
    );
    assert.equal(at("#/clients/new-list").key, at("#/clients").key, "the New list door too");
  } finally {
    bridgeHolds({ parts: { surfaceGate: undefined } });
  }
});

test("a page can say the same place more exactly: a replaced address makes no entry, and the shell follows it at once, with nothing to wait for", async () => {
  // The Leads page walks its peek through the address with a replace (surfaces/leads/page/peek-hooks.ts, through the
  // route's own door, people-route.tsx ownGo: the address's replace, quiet): no entry, and the frame stays on the page.
  const { addressReplace } = await importSrc("apps/dashboard/src/surfaces/people/shell-verbs.ts");
  shell.installShell(win);
  bridgeHolds({ parts: { surfaceGate: () => true } });
  const LEAD = "1ead0000-0000-4000-8000-000000000001";
  const before = { pushed: history.pushed.length, replaced: history.replaced.length };
  try {
    const key = (t) => find(t, (n) => String(n.props?.className || "").includes("main-scroll")).props.key;
    const { tree } = mount("#/clients/leads");
    addressReplace(`clients/leads:p-${LEAD}`, { quiet: true });
    assert.deepEqual(
      history.replaced.slice(before.replaced),
      [`/w/acme/people/leads:p-${LEAD}`],
      "replaced, not pushed: Back must not replay every lead the peek walked through",
    );
    assert.equal(history.pushed.length, before.pushed, "no entry");
    // Drawn again with the state it kept, as React would after the shell's own setRoute.
    setDeep(false);
    frames.begin();
    const again = win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
    });
    setDeep(true);
    assert.equal(key(again), key(tree), "the same page, on the address it asked for, with no event to wait for");
    assert.ok(find(again, (n) => n.type === "RoutePage"));
    // A push is the shell's own navigate, the door the frame filled as it drew (surfaces/frame-doors.ts).
    frameDoors.navigate("clients/leads");
    assert.equal(win.location.pathname, "/w/acme/people/leads", "and a plain navigation is still pushed");
    assert.equal(history.pushed.at(-1), "/w/acme/people/leads");
    assert.equal(history.replaced.length, before.replaced + 1);
  } finally {
    bridgeHolds({ parts: { surfaceGate: undefined } });
    win.location.pathname = "/w/acme";
  }
});

test("REGRESSION: a person's Back returns to the list they were opened from -- it pushed plain People, and the list, its scroll and its words went", () => {
  shell.installShell(win);
  const keepHistory = win.history;
  const keepPeople = surfaceValue("people");
  // Back is the browser's; the shell never writes history.state (Next reloads on a Back to an entry it did not mark).
  const h = {
    backs: 0,
    back() {
      h.backs += 1;
    },
  };
  win.history = { ...keepHistory, back: () => h.back() };
  bridgeHolds({ values: { people: { rows: [{ id: "p-1", name: "Rosa Díaz" }], lists: [], saved: [] } } });
  // The shell drawn again with the state it kept, after the browser moved its address (popstate), as React would.
  const arrive = (hash) => {
    // The path says the product's word (contracts ROUTE_WORDS): the shell's route clients is /people.
    win.location.pathname = `/w/acme/${hash.replace(/^#\//, "").replace(/^clients/, "people")}`;
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
  // The person's page asks the frame for its Back through its verbs (person-verbs.ts): the frame's own move, which it
  // makes again each time it draws (window.appBackToPeople), where the JSX row handed the page an `onBack`.
  const profileBack = () => backToPeople();
  try {
    // The list is People's page (an App Router page, its rows open a person by the shell's own door: navigate).
    mount("#/clients/list:L1");
    frameDoors.navigate("clients/p-1");
    assert.equal(win.location.pathname, "/w/acme/people/p-1", "the profile is a new entry");
    arrive("#/clients/p-1");
    profileBack();
    assert.equal(h.backs, 1, "REGRESSION: Back pushed /clients, a second entry, and the list they came from was gone");
    assert.equal(win.location.pathname, "/w/acme/people/p-1", "nothing pushed: the browser's Back is what returns");

    // Reached by a link or a reload: People itself, pushed.
    h.backs = 0;
    mount("#/clients/p-1");
    profileBack();
    assert.deepEqual([h.backs, win.location.pathname], [0, "/w/acme/people"], "by a link: People");
    // Opened from another page's door: People, never a Back out to the Inbox.
    mount("#/inbox/th-1");
    frameDoors.navigate("clients/p-1");
    arrive("#/clients/p-1");
    profileBack();
    assert.deepEqual([h.backs, win.location.pathname], [0, "/w/acme/people"], "from the Inbox: People");
    // Back to the profile from somewhere else: the entry before it is not known to be the list, so People.
    mount("#/clients/list:L1");
    frameDoors.navigate("clients/p-1");
    arrive("#/clients/p-1");
    frameDoors.navigate("calendar");
    arrive("#/clients/p-1");
    profileBack();
    assert.deepEqual(
      [h.backs, win.location.pathname],
      [0, "/w/acme/people"],
      "Back from the Calendar, then Back to People: People",
    );
  } finally {
    win.history = keepHistory;
    bridgeHolds({ values: { people: keepPeople } });
  }
});

test("REGRESSION: a run opened from the Inbox closes back to it by the browser's own Back -- it closed onto Sequences from the Inbox (the Inbox's run review, 18 Oct 2026); it opens over the Inbox now, and by a link at its home (the Campaigns wiring review's lanes 2 and 3)", async () => {
  shell.installShell(win);
  const doors = await importSrc("apps/dashboard/src/surfaces/frame-doors.ts");
  const see = await importSrc("apps/dashboard/src/surfaces/see/see-over.ts");
  const keepHistory = win.history;
  const keepHref = Object.getOwnPropertyDescriptor(win.location, "href");
  // The browser's History as far as the sheet reads it: the entry's state, and a Back counted.
  const h = { backs: 0, state: null };
  win.history = {
    ...keepHistory,
    get state() {
      return h.state;
    },
    pushState(data, unused, url) {
      h.state = data;
      keepHistory.pushState(data, unused, url);
    },
    replaceState(data, unused, url) {
      h.state = data;
      keepHistory.replaceState(data, unused, url);
    },
    back() {
      h.backs += 1;
    },
  };
  Object.defineProperty(win.location, "href", {
    configurable: true,
    get: () => `https://app.example.com${win.location.pathname}${win.location.search || ""}${win.location.hash || ""}`,
  });
  // The frame as the bridge draws it, filling the doors a page asks for (app-shell.tsx `fillDoors`).
  const draw = () => {
    setDeep(false);
    frames.begin();
    const t = win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
      fillDoors: doors.fillDoors,
    });
    setDeep(true);
    return t;
  };
  try {
    setCells([]);
    placeAt("#/inbox");
    win.location.search = "";
    draw();
    // The Inbox's run row opens the run (the frame's own move, as a page's door makes it): over the Inbox, one entry.
    doors.navigate(runRoute("b-1", "q-1"));
    assert.equal(win.location.pathname, "/w/acme/inbox", "the Inbox stays under it, as it was left");
    assert.deepEqual(see.seeOverNow(), { kind: "run", id: "b-1", sequenceId: "q-1" }, "the run, over it");
    see.closeSeeOver();
    assert.equal(h.backs, 1, "its close is the browser's Back, to the Inbox as it was left");

    // An older link to its sheet in Sent is the same run, opened over the page it was pressed on.
    win.location.search = "";
    h.state = null;
    h.backs = 0;
    doors.navigate("broadcasts/run:b-1/sheet");
    assert.equal(win.location.pathname, "/w/acme/inbox");
    assert.deepEqual(see.seeOverNow(), { kind: "run", id: "b-1", sequenceId: null });

    // Reached by a link or a reload (a frame drawn afresh): its home, beside Sequences' list; its way back replaces the
    // address with Sequences, never a Back out of the app.
    win.location.search = "";
    h.state = null;
    h.backs = 0;
    setCells([]);
    placeAt(`#/${runRoute("b-1", "q-1")}`);
    draw();
    doors.backFrom("campaigns/sequences", { replace: true });
    assert.deepEqual([h.backs, win.location.pathname], [0, "/w/acme/campaigns/sequences"], "by a link: Sequences");
  } finally {
    win.history = keepHistory;
    if (keepHref) Object.defineProperty(win.location, "href", keepHref);
    else delete win.location.href;
    win.location.search = "";
    doors.emptyDoors();
  }
});

test("REGRESSION (C13): a link to a playbook lands on its sequence, named in the crumbs -- the route dropped the id", () => {
  shell.installShell(win);
  const keepGate = provided("roles");
  setSurfaceValue("sequences", { sequences: [{ id: "pb-1", name: "Win-back", starts: "moment" }] });
  try {
    const crumbs = (hash) => find(mount(hash).tree, (n) => n.type === PART.Topbar).props.crumbs;
    // The old Playbooks list is retired (contracts retiredRouteOf): `outbound/<id>` lands on its sequence in one move
    // (decision 0060), which the frame names.
    assert.equal(retiredRouteOf("outbound/pb-1"), "campaigns/sequences/pb-1");
    assert.equal(
      crumbs("#/campaigns/sequences/pb-1").at(-1),
      "Win-back",
      "REGRESSION: the route dropped the playbook's id",
    );
    const back = { label: "Campaigns", to: "campaigns/sequences" };
    assert.deepEqual(crumbs("#/campaigns/sequences/pb-1")[0], back, "back to Sequences");
    assert.deepEqual(crumbs("#/campaigns"), ["Campaigns"]);
    assert.deepEqual(crumbs("#/campaigns/sequences/pb-gone"), ["Campaigns"], "one the list does not hold names none");
  } finally {
    setSurfaceValue("sequences", undefined);
    bridgeHolds({ parts: { roles: keepGate } });
  }
});

/* ------------------------------ the shell's own doors (B6a-2) ------------------------------ */

test("REGRESSION (N10): a real workspace's Calendar and Campaigns offer no primary act in the top bar until the page is ready -- Book and New campaign opened Ask over the skeleton or the failure pane", () => {
  shell.installShell(win);
  const keepGate = provided("roles");
  const right = (hash) => find(mount(hash).tree, (n) => n.type === PART.Topbar).props.right;
  try {
    assert.equal(
      right("#/calendar"),
      null,
      "REGRESSION: a Calendar still loading, or failed, offered Book, which opened Ask",
    );
    assert.equal(
      right("#/campaigns"),
      null,
      "REGRESSION: Campaigns still loading, or failed, offered New campaign, which opened Ask",
    );
    setSurfaceValue("calendar", { vm: { bookingLink: "https://book.example/luna" }, fetchedAt: 1 });
    // A ready Calendar has none either: its booking link is in the page's own options menu (calendar/chrome.ts).
    assert.equal(right("#/calendar"), null, "a ready Calendar keeps its link in the page's menu, not the top bar");
    // Ready, New is the page's own, in the head of Sequences (surfaces/campaigns/sequences), and the top bar carries none.
    setSurfaceValue("playbooks", { rows: [] });
    assert.equal(right("#/campaigns"), null, "a ready Campaigns keeps its act on the page, not in the top bar");
  } finally {
    setSurfaceValue("calendar", undefined);
    setSurfaceValue("playbooks", undefined);
    bridgeHolds({ parts: { roles: keepGate } });
  }
});

test("REGRESSION (N16): an address under soon/ opens a page that has shipped, and a name nothing answers to is not found -- #/soon/calendar said the Calendar was not in this release", async () => {
  shell.installShell(win);
  const reg = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  const from = history.replaced.length;
  const replaced = () => history.replaced.slice(from);
  bridgeHolds({ parts: { surfaceState: reg.surfaceStateFor } });
  const shows = (tree, name) =>
    find(tree, (n) => n.type === name || (typeof n.type === "function" && n.type.name === name)) !== undefined;
  try {
    let tree = mount("#/soon/calendar").tree;
    assert.ok(
      !!find(tree, (n) => n.type === "RoutePage") && !shows(tree, "ComingSoon"),
      "REGRESSION: a shipped page answered that it was not in this release",
    );
    assert.deepEqual(
      replaced(),
      ["/w/acme/calendar"],
      "and the address becomes the page's own, in place, so Back does not land on it again",
    );
    assert.ok(shows(mount("#/soon/fleet").tree, "ComingSoon"), "a page kept for the demo still says so");
    // What it says a person reads: "campaigns", never "playbooks" (decision 19).
    const soon = find(mount("#/soon/fleet").tree, (n) => typeof n.type === "function" && n.type.name === "ComingSoon");
    const blurb = textOf(find(soon.type(soon.props), (n) => n.props?.className === "soon-blurb"));
    assert.equal(blurb, "What AI does on its own, its campaigns and how they go.");
    tree = mount("#/soon/nope").tree;
    assert.ok(
      shows(tree, "NotFound") && !shows(tree, "ComingSoon"),
      "a name nothing answers to is not found, rather than promised",
    );
    const now = history.replaced.length;
    bridgeHolds({ parts: { surfaceState: undefined } });
    assert.ok(
      shows(mount("#/soon/calendar").tree, "ComingSoon") && history.replaced.length === now,
      "the standalone mockup, with no registry, keeps its landings",
    );
  } finally {
    bridgeHolds({ parts: { surfaceState: undefined } });
  }
});

test("REGRESSION (N19): the top bar's theme button steps through Light, Dark and System and says which is on -- it flipped light and dark and dropped System", () => {
  shell.installShell(win);
  bridgeHolds({ parts: { toast: () => [null, () => {}] } });
  const chosen = [];
  const themeButton = (themePref, theme) => {
    setDeep(true);
    setCells([]);
    frames.begin();
    const tree = PART.Topbar({
      crumbs: ["Today"],
      theme,
      themePref,
      onTheme: (v) => chosen.push(v),
      onAsk() {},
      onMenu() {},
    });
    return find(tree, (n) => String(n.props?.className || "").includes("tb-theme"));
  };
  try {
    const dark = themeButton("dark", "dark");
    dark.props.onClick();
    assert.equal(
      chosen.at(-1),
      "system",
      "REGRESSION: from Dark the button went to Light, and System could not be reached from the top bar",
    );
    assert.equal(dark.props["aria-label"], "Theme: Dark. Switch to System");
    assert.equal(dark.props["data-tip"], "Theme: Dark. Switch to System");
    themeButton("system", "dark").props.onClick();
    assert.equal(chosen.at(-1), "light", "System, whatever it shows, goes on to Light");
    themeButton("light", "light").props.onClick();
    assert.equal(chosen.at(-1), "dark");

    // The shell hands the top bar the preference, not only the theme it resolves to.
    setDeep(false);
    setCells([]);
    frames.begin();
    placeAt("#/today");
    const shellTree = win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "system",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
    });
    assert.equal(
      find(shellTree, (n) => n.type === PART.Topbar).props.themePref,
      "system",
      "REGRESSION: the top bar was handed only the resolved theme",
    );
  } finally {
    setDeep(true);
    bridgeHolds({ parts: { toast: undefined } });
  }
});

test("the bell's close is the member looking: opening it marks nothing, closing it by its button or the popover's own close marks every row seen, once (Today in three zones, 2 Nov 2026)", () => {
  shell.installShell(win);
  bridgeHolds({ parts: { toast: () => [null, () => {}] } });
  let seen = 0;
  const row = {
    id: "n-1",
    kind: "booking",
    title: "1 booked",
    message: "Tove Lind, Thu 10:00 AM",
    at: 0,
    unread: true,
    actions: [],
  };
  bridgeHolds({
    parts: {
      bell: {
        feed: () => [row],
        alerts: () => null,
        onChange: () => () => undefined,
        older: () => 0,
        seenAll: () => {
          seen += 1;
        },
      },
    },
  });
  const bellOf = (tree) => find(tree, (n) => String(n.props?.className || "").includes("tb-bell "));
  const draw = () => PART.Topbar({ crumbs: ["Today"], theme: "light", themePref: "light", onAsk() {}, onMenu() {} });
  try {
    setDeep(true);
    setCells([]);
    frames.begin();
    bellOf(draw()).props.onClick();
    frames.begin();
    const open = draw();
    assert.equal(seen, 0, "open: New holds while the popover is up");
    bellOf(open).props.onClick();
    assert.equal(seen, 1, "closed by its button: every row seen, and the number starts again from now");
    frames.begin();
    bellOf(draw()).props.onClick();
    frames.begin();
    find(draw(), (n) => typeof n.props?.onClose === "function" && "onReadAll" in n.props).props.onClose();
    assert.equal(seen, 2, "closed by the popover (a press outside, Escape): the same");
  } finally {
    bridgeHolds({ parts: { bell: undefined } });
    bridgeHolds({ parts: { toast: undefined } });
  }
});

test("REGRESSION: the top bar's Ask button says Ask Chanlytics and draws no key -- ⌘K stood in it and in its tip, beside the ? sheet that lists it", () => {
  shell.installShell(win);
  bridgeHolds({ parts: { toast: () => [null, () => {}] } });
  try {
    setDeep(true);
    setCells([]);
    frames.begin();
    let asked = 0;
    const tree = PART.Topbar({
      crumbs: ["Today"],
      theme: "dark",
      themePref: "dark",
      onTheme() {},
      onAsk() {
        asked += 1;
      },
      onMenu() {},
    });
    const ask = find(tree, (n) => n.props?.["data-testid"] === "tb-ask");
    assert.equal(textOf(ask), "Ask Chanlytics", "a real door, never a Soon tag");
    assert.equal(ask.props["data-tip"], "Ask Chanlytics");
    assert.deepEqual(keysDrawn(ask), []);
    ask.props.onClick();
    assert.equal(asked, 1, "pressed, it opens AI (pinned as topbar.tsx's text in ask.test.mjs until 25 Nov 2026)");
  } finally {
    bridgeHolds({ parts: { toast: undefined } });
  }
});

test("the look travels as the theme does: stamped beside it on every root the shell draws, handed to the account menu, and its words published by the bridge", () => {
  shell.installShell(win);
  assert.deepEqual(provided("chrome").looks, LOOK_OPTIONS, "the looks beside the themes");
  assert.equal(
    provided("chrome").lookOffered,
    LOOK_OFFERED,
    "and whether the account menu offers them, as contracts says",
  );
  const onLook = () => {};
  const drawAt = (hash) => {
    setDeep(false);
    setCells([]);
    frames.begin();
    placeAt(hash);
    const theme = { theme: "light", themePref: "light", onTheme() {} };
    return win.ChanlyticsApp({ ...PAGES, ...theme, look: "glass", onLook, sidebar: "open", onSidebar() {} });
  };
  // The first run and the shared viewer are drawn instead of the chrome, each on a root of its own that carries the
  // theme; a [data-look] rule has to find the look on every one of them.
  const keptState = provided("surfaceState");
  bridgeHolds({ parts: { surfaceState: undefined } });
  win.FirstRun = "FirstRun";
  try {
    for (const [hash, root] of [
      ["#/today", "app-root"],
      ["#/start", "fr-shell"],
      ["#/shared", "shared-root"],
    ]) {
      const drawn = drawAt(hash);
      assert.equal(drawn.props.className, root, `${hash} is drawn on its own root`);
      assert.deepEqual(
        [drawn.props["data-theme"], drawn.props["data-look"]],
        ["light", "glass"],
        `${hash}: the look beside the theme`,
      );
    }
    const sidebar = find(drawAt("#/today"), (n) => n.type === PART.Sidebar);
    assert.equal(sidebar.props.look, "glass", "the account menu is handed the look in force");
    assert.equal(sidebar.props.onLook, onLook, "and changes it through the shell's own prop, as the theme");
  } finally {
    setDeep(true);
    if (keptState !== undefined) bridgeHolds({ parts: { surfaceState: keptState } });
  }
});

test("the first run keeps AI: the palette is drawn over the step, closed, and the shell's ⌘K and appAsk open it and its close closes it; nothing else of the chrome, no door (Ask Rewired, Phase 7)", () => {
  shell.installShell(win);
  const keptState = provided("surfaceState");
  bridgeHolds({ parts: { surfaceState: undefined } });
  const draw = () => {
    frames.begin();
    return win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
    });
  };
  const bars = (tree) => {
    const out = [];
    walk(tree, (n) => {
      if (n.type === PART.AskBar) out.push(n);
    });
    return out;
  };
  try {
    setDeep(false);
    setCells([]);
    placeAt("#/start/phone");
    // The shell's own keys, as this draw installs them (an earlier draw's handlers are its own).
    const before = new Set(heard.get("keydown") ?? []);
    let tree = draw();
    const keys = [...(heard.get("keydown") ?? [])].filter((fn) => !before.has(fn));
    assert.equal(tree.props.className, "fr-shell", "the first run, full screen");
    const kids = tree.props.children.filter((k) => k && typeof k === "object");
    // The first run is an App Router page (surfaces/setup/first-run, decision 0015 step 10): the layout's children,
    // which read their step from the path.
    assert.deepEqual(
      kids.map((k) => k.type),
      ["RoutePage", PART.AskBar],
      "the step, then the palette over it",
    );
    assert.equal(kids[0], PAGES.routePage, "the page the layout gave the frame, as it is");
    assert.equal(kids[1].props.open, false, "closed until asked");
    for (const fn of keys) fn({ type: "keydown", key: "k", metaKey: true, target: null, preventDefault() {} });
    tree = draw();
    assert.deepEqual(
      bars(tree).map((b) => b.props.open),
      [true],
      "⌘K opens the Line over the step",
    );
    assert.equal(tree.props.className, "fr-shell", "and the first run stays under it");
    bars(tree)[0].props.onClose();
    tree = draw();
    assert.equal(bars(tree)[0].props.open, false, "its close closes it");
    frameDoors.openAsk();
    assert.equal(bars(draw())[0].props.open, true, "askAbout's door (openAsk) opens it too");
    for (const type of ["Sidebar", "Topbar", "ShortcutsSheet"])
      assert.equal(
        find(tree, (n) => n.type === PART[type]),
        undefined,
        `no ${type} on the first run`,
      );
    assert.equal(
      find(tree, (n) => n.props?.["data-testid"] === "phone-ask"),
      undefined,
      "no door: the first run draws no chrome, and no key is drawn outside the ? sheet",
    );
    // Everywhere else the chrome draws it once, as it always has.
    setCells([]);
    placeAt("#/today");
    assert.equal(bars(draw()).length, 1, "Today: the one palette, in the chrome");
  } finally {
    setDeep(true);
    delete win.FirstRun;
    if (keptState !== undefined) bridgeHolds({ parts: { surfaceState: keptState } });
  }
});

test("the frame fills the bridge's doors as it renders (a move, AI, a person's Back, a page's Back to its opener), and publishes no door name on the window, with a filler handed in or with its own (surfaces/frame-doors.ts, decision 0151)", () => {
  shell.installShell(win);
  const keptState = provided("surfaceState");
  bridgeHolds({ parts: { surfaceState: undefined } });
  const NAMES = ["appNavigate", "appAsk", "appBackToPeople"];
  const kept = Object.fromEntries(NAMES.map((k) => [k, win[k]]));
  const draw = (extra = {}) => {
    frames.begin();
    return win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
      ...extra,
    });
  };
  try {
    setDeep(false);
    setCells([]);
    placeAt("#/start/phone");
    for (const k of NAMES) delete win[k];
    const filled = [];
    draw({ fillDoors: (doors) => filled.push(doors) });
    assert.equal(filled.length, 1, "filled once, as the frame renders");
    assert.deepEqual(Object.keys(filled[0]).sort(), ["backFrom", "backToPeople", "navigate", "openAsk"]);
    for (const k of Object.keys(filled[0])) assert.equal(typeof filled[0][k], "function", `${k} is a door`);
    for (const k of NAMES) assert.equal(win[k], undefined, `the frame does not publish ${k}`);
    // With none handed in, the frame fills the registry itself (frame-doors.ts fillDoors), and still publishes no name.
    draw();
    for (const k of NAMES) assert.equal(win[k], undefined, `nor ${k} with the frame's own filler`);
    assert.deepEqual([...frameDoors.filledDoors()].sort(), ["backFrom", "backToPeople", "navigate", "openAsk"]);
  } finally {
    setDeep(true);
    for (const k of NAMES) {
      if (kept[k] === undefined) delete win[k];
      else win[k] = kept[k];
    }
    if (keptState !== undefined) bridgeHolds({ parts: { surfaceState: keptState } });
  }
});

test("People has no tab strip -- its one real tab is People, and Lists and Leads are views of it; a session that says it is a demo draws the same (N24)", async () => {
  // The strip is the kit's (surfaces/kit/view-tabs), which the shell's SurfaceTabs draws by name, as the app's bridge
  // publishes it; its hooks are this file's stub's.
  const { useStubHooks } = await import("../../../_stub-react.mjs");
  useStubHooks(globalThis.React);
  // The strip (surfaces/frame/surface-tabs.tsx), as the frame imports it.
  await importSrc("apps/dashboard/src/surfaces/frame/surface-tabs.tsx");
  const tabsAt = (param) => {
    setDeep(true);
    setCells([]);
    frames.begin();
    return PART.SurfaceTabs({ page: "clients", param, onNavigate() {} });
  };
  for (const param of [null, "seg:opted_in", "list:regulars", "state:needs", "p-9"])
    assert.equal(tabsAt(param), null, `nothing to switch to at ${param}: one real tab is no strip`);
});

test("⌘B folds the sidebar to its rail and back on a desk, and does nothing on a phone; ⌘1 to ⌘9 switch to that workspace", () => {
  // The shell's own keys (shell-hooks.ts), as a draw installs them; the sheet that lists them is drawn in
  // keys-in-the-sheet.test.mjs, and ⌘K opens AI in the test of the first run above.
  const kept = provided("shell");
  const switched = [];
  bridgeHolds({ parts: { shell: { ...kept, switchWorkspace: (id) => switched.push(id) } } });
  bridgeHolds({
    who: {
      workspaces: [
        { id: "w1", slug: "one", name: "Studio One", status: "active" },
        { id: "w2", slug: "two", name: "Studio Two", status: "active" },
      ],
      activeWorkspaceId: "w1",
    },
  });
  const wide = win.innerWidth;
  const folds = [];
  try {
    placeAt("#/inbox");
    // The handlers this draw installs alone: an earlier draw's are its own.
    const drawAt = (sidebar) => {
      const before = new Set(heard.get("keydown") ?? []);
      setDeep(false);
      setCells([]);
      frames.begin();
      win.ChanlyticsApp({
        ...PAGES,
        theme: "dark",
        themePref: "dark",
        sidebar,
        onSidebar: (v) => folds.push(v),
        onTheme() {},
      });
      setDeep(true);
      return [...(heard.get("keydown") ?? [])].filter((fn) => !before.has(fn));
    };
    const press = (keys, e) => {
      for (const fn of keys) fn({ type: "keydown", target: null, preventDefault() {}, metaKey: true, ...e });
    };
    win.innerWidth = 1400;
    press(drawAt("open"), { key: "b" });
    assert.deepEqual(folds, ["rail"], "open folds to the rail");
    press(drawAt("rail"), { key: "b" });
    assert.deepEqual(folds, ["rail", "open"], "and the rail opens");
    win.innerWidth = 600;
    press(drawAt("open"), { key: "b" });
    assert.deepEqual(folds, ["rail", "open"], "a phone has a drawer, not a rail");
    press(drawAt("open"), { key: "2" });
    assert.deepEqual(switched, ["w2"], "⌘2 is the second workspace");
    press(drawAt("open"), { key: "2", altKey: true });
    assert.deepEqual(switched, ["w2"], "and ⌥⌘2 is not the shell's");
  } finally {
    win.innerWidth = wide;
    bridgeHolds({ parts: { shell: kept } });
    bridgeHolds({ who: { workspaces: undefined } });
    bridgeHolds({ who: { activeWorkspaceId: undefined } });
  }
});

test("the rail is the sidebar folded, and the chrome draws the keys' sheet on every page", () => {
  // The shell as drawn (surfaces/frame/shell-chrome.tsx), where chrome.test.mjs read its source until 26 Nov 2026: the
  // device's preference "rail" folds the sidebar and marks its wrap, "open" does neither; ⌘B moving between the two on a
  // desk alone is pressed in the test above.
  placeAt("#/inbox");
  const drawAt = (sidebar) => {
    setDeep(false);
    setCells([]);
    frames.begin();
    const tree = win.ChanlyticsApp({
      ...PAGES,
      theme: "dark",
      themePref: "dark",
      sidebar,
      onSidebar() {},
      onTheme() {},
    });
    setDeep(true);
    return tree;
  };
  for (const [sidebar, folded] of [
    ["rail", true],
    ["open", false],
  ]) {
    const tree = drawAt(sidebar);
    const wrap = find(tree, (n) =>
      String(n.props?.className ?? "")
        .split(" ")
        .includes("side-wrap"),
    );
    assert.equal(
      String(wrap.props.className).split(" ").includes("rail"),
      folded,
      `${sidebar}: the wrap says the rail`,
    );
    assert.equal(
      find(tree, (n) => n.type === "Sidebar" || n.type?.name === "Sidebar").props.collapsed,
      folded,
      sidebar,
    );
    assert.ok(
      find(tree, (n) => n.type === "ShortcutsSheet" || n.type?.name === "ShortcutsSheet"),
      `${sidebar}: the keys' sheet is the chrome's, drawn on every page for ? to open`,
    );
  }
});
