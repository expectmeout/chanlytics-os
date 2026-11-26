/**
 * The chrome: the sidebar's two menus and its rail, the theme with a system
 * option and the look beside it, the shell's one status line, the shortcuts
 * sheet — and the floating pill retired. The words and rules are contracts;
 * the wiring is pinned so the shell, the bridge and the page keep agreeing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTheme,
  isThemePref,
  isLookPref,
  lookPrefOf,
  isSidebarPref,
  isTypingTarget,
  shellStatusLine,
  shortcutGroups,
  SHORTCUTS,
  THEME_OPTIONS,
  LOOK_OPTIONS,
  DEFAULT_LOOK_PREF,
  LOOK_OFFERED,
} from "@chanlytics/contracts";
import { importSrc, readCode, readRaw } from "../_source.mjs";
import { installStubReact, fresh, again, all, byTestId, classes, press, textOf } from "../_stub-react.mjs";
import { bridgeHolds, frameParts } from "./_bridge-holds.mjs";
import { fromDashboard, stepRunning } from "./boot/_frame-boot.mjs";

const { Icon } = await importSrc("apps/dashboard/src/surfaces/kit/icon/icon.tsx");

test("the theme: a choice, or the device's; unknown values fall back; the sidebar has two states", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("neon", true), "dark", "an unknown preference reads as system");
  assert.equal(resolveTheme(undefined, false), "light");
  assert.ok(isThemePref("system") && !isThemePref("auto") && !isThemePref(null));
  assert.ok(isSidebarPref("rail") && isSidebarPref("open") && !isSidebarPref("collapsed"));
  assert.deepEqual(
    THEME_OPTIONS.map((t) => t.id),
    ["light", "dark", "system"],
  );
  for (const t of THEME_OPTIONS) assert.ok(t.label && t.icon, t.id);
});

test("the look: Glass, the one look since Classic retired, for anything unknown too, and not offered while it is alone", () => {
  assert.deepEqual(
    LOOK_OPTIONS.map((l) => [l.id, l.label]),
    [["glass", "Glass"]],
  );
  assert.ok(isLookPref("glass") && !isLookPref("classic") && !isLookPref("Glass") && !isLookPref(null));
  assert.equal(
    DEFAULT_LOOK_PREF,
    "glass",
    "the canvases' look, the default since 1 October 2026 (the plan's step 5.6)",
  );
  assert.equal(
    lookPrefOf("classic"),
    DEFAULT_LOOK_PREF,
    "a device that kept Classic wears Glass: Classic retired (step 5.7)",
  );
  assert.equal(lookPrefOf("neon"), DEFAULT_LOOK_PREF, "an unknown look is the default, as an unknown theme is");
  assert.equal(
    LOOK_OFFERED,
    false,
    "the account menu offers no Look while there is one: a second look turns it on again (the plan's step 5.7)",
  );
});

test("typing: a field being typed in keeps its keys", () => {
  assert.equal(isTypingTarget("INPUT", false), true);
  assert.equal(isTypingTarget("textarea", false), true);
  assert.equal(isTypingTarget("DIV", true), true);
  assert.equal(isTypingTarget("DIV", false), false);
  assert.equal(isTypingTarget(null, false), false);
});

test("the shell's one line: a newer build outranks stale surfaces, and nothing is nothing", () => {
  // Every state's words, and the order between them, run in shell/surfaces/status/.
  assert.equal(shellStatusLine(null), null);
  // Anthropic has paused the workspace (decision 0097): the same plain state, with no press, since Billing mends nothing.
  const modelPaused = shellStatusLine({ stale: false, degraded: [], modelStanding: "paused" });
  assert.deepEqual(
    [modelPaused.kind, modelPaused.tone, modelPaused.text, modelPaused.action, modelPaused.cta],
    ["paused", "danger", "AI is paused", null, null],
  );
  assert.ok(!/anthropic|safety|violation|banned/i.test(modelPaused.detail), "no reason reaches a member");
  assert.equal(
    shellStatusLine({ stale: false, degraded: [], modelStanding: "paused", paused: true }).action,
    "billing",
  );
  // Limited: Anthropic may still serve it in part, so the line is quieter and does not say it has stopped.
  const limited = shellStatusLine({ stale: false, degraded: [], modelStanding: "limited" });
  assert.deepEqual(
    [limited.kind, limited.tone, limited.text, limited.action, limited.cta],
    ["degraded", "warn", "AI is limited", null, null],
  );
  assert.ok(!/anthropic|safety|violation|banned|restricted/i.test(limited.detail), "no reason reaches a member");
  assert.equal(shellStatusLine({ stale: false, degraded: [], modelStanding: null }), null);
  assert.equal(shellStatusLine({ stale: false, degraded: [] }), null);
  assert.equal(shellStatusLine({ stale: true, degraded: ["Inbox"] }).text, "A newer version is ready");
  assert.equal(shellStatusLine({ stale: true, degraded: ["Inbox"] }).action, "reload");
  assert.equal(
    shellStatusLine({ stale: false, degraded: ["Inbox", "Calendar"] }).text,
    "Inbox and Calendar stopped refreshing",
  );
  assert.equal(
    shellStatusLine({ stale: false, degraded: ["Inbox", "Calendar"] }).action,
    "retry",
    "and offers the read again",
  );
});

test("the shortcuts sheet lists what the app answers to, grouped in order, and nothing the app does not do", () => {
  const groups = shortcutGroups(SHORTCUTS);
  assert.deepEqual(
    groups.map((g) => g.group),
    ["Everywhere", "Ask", "Today", "People", "The pile, on Leads", "A person", "Inbox", "Calendar"],
  );
  // The pile's keys (00426): its rail left to right, Undo, and the way out; the page's one listener hears them.
  assert.deepEqual(
    groups.find((g) => g.group === "The pile, on Leads").items.map((s) => s.keys.join(" ")),
    ["A", "L", "N", "Z", "Esc"],
  );
  assert.deepEqual(
    groups.find((g) => g.group === "Ask").items.map((s) => [s.keys.join(" "), s.does]),
    [
      ["↑ ↓", "Walk what is under the line"],
      ["↵", "Ask, or open the row"],
      ["⌘J", "Earlier conversations"],
      ["Space", "Hold on an empty line to talk"],
      ["Esc", "Stop an answer, then close"],
    ],
    "the Line draws no key (D17): the sheet is where its keys are listed",
  );
  const does = SHORTCUTS.map((s) => s.does);
  for (const d of [
    "Ask Chanlytics",
    "Collapse or expand the sidebar",
    "This sheet",
    "Search People",
    "Next and previous conversation",
    "Approve the draft",
    "Send",
  ])
    assert.ok(does.includes(d), d);
  const where = (key) => SHORTCUTS.filter((s) => s.keys.includes(key)).map((s) => s.group);
  assert.deepEqual(
    [where("/"), where("J")],
    [
      ["Today", "People"],
      ["Today", "People", "A person", "Inbox"],
    ],
    "REGRESSION (N17): the sheet offered / and J/K on every list; / searches People and asks AI about a line of Today's (W12), and J/K walk Today's lines, People's rows, a person's list from their page, and the Inbox's",
  );
  assert.deepEqual(
    groups.find((g) => g.group === "People").items.map((s) => [s.keys.join(" "), s.does]),
    [
      ["/", "Search People"],
      ["J K ↓ ↑", "Next and previous person"],
      ["X Space", "Select the person"],
      ["↵", "Open their profile"],
      ["Esc", "Clear the selection"],
      ["F", "Find leads (on Leads)"],
      ["C", "Call the lead under the cursor (on Leads)"],
      ["A", "Do what the lead under the cursor offers (on Leads)"],
    ],
    "People's keys, the ones its table's foot named: the sheet listed only /",
  );
  // The sheet is the one place a key is drawn (Ruben, 23 Sep 2026), so a key said only where it worked had to join it
  // when that went: the Calendar's legend and its buttons' tips, and the record kit's editors.
  assert.deepEqual(
    groups.find((g) => g.group === "Calendar").items.map((s) => [s.keys.join(" "), s.does]),
    [
      ["← →", "Previous and next"],
      ["T", "Back to today"],
    ],
  );
  assert.deepEqual(where("⌘↵"), ["Everywhere", "Inbox"], "⌘↵ saves an edit anywhere, and sends in the Inbox");
  // Every key the sheet lists is real, pressed where it lives: ⌘K opens AI (shell/surfaces/status/, "the first run
  // keeps AI ... the shell's ⌘K"), ⌘B folds the sidebar on a desk and ⌘1-9 switch workspaces (shell/surfaces/status/,
  // "⌘B folds the sidebar ..."), and ? opens the sheet (shell/surfaces/keys-in-the-sheet.test.mjs).
});

test("the wiring: the pill is retired, the shell bridge carries its two actions and its status, the page has the menus, the rail and the sheet", () => {
  const app = readCode("apps/dashboard/src/bridge/FrameApp.tsx");
  assert.ok(!app.includes("bridge-pill") && !app.includes("pill-signout"), "no floating pill");
  // The shell bridge is installed as the frame loads (bridge/boot, run in tests/shell/boot/frame-boot.test.mjs); the line is the component's.
  assert.ok(stepRunning(fromDashboard("bridge/shell.ts").installShell));
  assert.ok(
    app.includes(
      "publishShellStatus(shellStatusOf(getSurfaceStatuses(), getConnection(), staleRef.current, SURFACE_LABELS));",
    ),
  );
  // What the device's preferences are, what a press keeps and what the page wears are device-prefs.ts's, run by
  // theme-boot.test.mjs against the head's script. The component only holds them: these are its calls.
  for (const pin of [
    "const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(browserStorage));",
    "const { theme, look } = documentStamps(prefs, systemDark);",
    "useDocumentStamps(theme, look);",
    'document.documentElement.setAttribute("data-theme", theme);',
    'document.documentElement.setAttribute("data-look", look);',
    "setPrefs((p) => choosePref(browserStorage, p, key, v))",
    // Made once, so the shell's element is kept until a preference changes (defect 17).
    'const onTheme = useCallback((v: string) => choose("theme", v), [choose]);',
    'const onLook = useCallback((v: string) => choose("look", v), [choose]);',
    'const onSidebar = useCallback((v: string) => choose("sidebar", v), [choose]);',
    "onTheme={onTheme}",
    "onLook={onLook}",
    "onSidebar={onSidebar}",
    "theme={theme}",
    "look={look}",
  ])
    assert.ok(app.includes(pin), `the page wears and keeps what device-prefs.ts says: ${pin}`);
  assert.ok(!readRaw("apps/dashboard/src/bridge/frame.css").includes(".bridge-pill"), "the pill's styles are gone");

  // The shell bridge's doors, run: the sign-out seals the cache before the form posts (shell/surfaces/sign-out-seals),
  // another workspace is one door, said as the event the frame opens its screen on (sign-out-seals, "another workspace
  // is one door"), and the chrome's words and themes are what the account menu draws (below, "the account menu offers
  // the look"). Another workspace's own title and its Back: create-workspace-screen.test.mjs draws the screen and presses
  // them. The frame's own listener for it is FrameApp's, read with the rest of its boot above.
  assert.ok(
    app.includes('window.addEventListener("shell:create-workspace", on);') &&
      app.includes("onCancel={() => setCreating(false)}"),
  );

  const shell = ["shell-chrome.tsx", "shell-hooks.ts"]
    .map((f) => readCode(`apps/dashboard/src/surfaces/frame/${f}`))
    .join("\n");
  assert.ok(
    shell.includes('${s.sidebar === "rail" ? "rail" : ""}') && shell.includes('collapsed={s.sidebar === "rail"}'),
  );
  assert.ok(
    shell.includes("if (window.innerWidth > DESK_MIN_PX) {") &&
      shell.includes('onSidebar(sidebar === "rail" ? "open" : "rail");'),
    "⌘B folds the sidebar on a desk only",
  );
  assert.ok(shell.includes("const Sheet = ShortcutsSheet;") && shell.includes("<Sheet />"));

  // The sidebar's menus are drawn and pressed: the account chip opens a menu, not Settings, and its rows (Settings, the
  // keys' sheet on a desk) are drawn in keys-in-the-sheet.test.mjs, where a workspace pressed is switched to, the new
  // one is the shell's door and Sign out signs out ("the menus' doors are the shell's"); the person in its words is
  // workspace/identity.test.mjs's; a rail item's tip says its count, drawn below ("the account chip says it opens a menu").
  installStubReact({});
  bridgeHolds({ parts: { toast: () => [null, () => {}] } });
  for (const name of ["logout", "keyboard", "chevrons", "monitor", "user", "sidebar"]) {
    const drawn = Icon({ name });
    assert.notDeepEqual(
      drawn,
      Icon({ name: "no-such-glyph" }),
      `${name} is a glyph of its own, not the unknown circle`,
    );
  }

  const css = readRaw("apps/dashboard/src/styles/components.css");
  for (const pin of [
    ".sidebar.collapsed .nav-item { justify-content: center;",
    ".sb-menu { position: fixed;",
    ".sb-theme-seg {",
    ".sb-sheet {",
  ])
    assert.ok(css.includes(pin), pin);
  assert.ok(
    readRaw("apps/dashboard/src/styles/mobile.css").includes(
      ".side-wrap .sidebar.collapsed { width: min(248px, 84vw); }",
    ),
    "the drawer is never a rail",
  );
});

test("the account chip says it opens a menu with the chevrons the workspace row draws, in the same ink", async () => {
  // Both buttons open a popover from the sidebar. The row at the top always drew the chevrons; the chip at the foot drew
  // none, so nothing said it was a button (Ruben, 11 Oct 2026). Drawn as a person sees them, and the rail hides each.
  installStubReact({});
  bridgeHolds({ parts: { toast: () => [null, () => {}] } });
  const Sidebar = (await importSrc("apps/dashboard/src/surfaces/frame/sidebar/sidebar.tsx")).Sidebar;
  bridgeHolds({ parts: { chrome: { themes: THEME_OPTIONS, looks: LOOK_OPTIONS, lookOffered: false } } });
  fresh();
  const drawn = again(() =>
    globalThis.React.createElement(Sidebar, {
      themePref: "dark",
      onTheme: () => {},
      look: "glass",
      onLook: () => {},
    }),
  );
  const chevrons = (testid) =>
    all(byTestId(drawn, testid), (n) => n.type === frameParts().Icon && n.props.name === "chevrons");

  assert.equal(chevrons("sb-workspace").length, 1, "the workspace row, which always had them");
  const chip = chevrons("sb-account");
  assert.equal(chip.length, 1, "the account chip, which opens a menu as the row does");
  assert.equal(chip[0].props.size, 14, "at the row's size");
  assert.ok(
    classes(chip[0]).includes("sb-chev"),
    "wearing the class that gives them the dim ink and hides them in the rail",
  );
});

test("the workspace row says its name, and under it how many workspaces there are only where there is more than one; never the lines", async () => {
  // "1 of 1 line on" under the name said again what Today says, for any workspace (Ruben, 11 Oct 2026). What the row's
  // menu does is switch, so the line under the name says how many there are to switch between.
  installStubReact({});
  bridgeHolds({ parts: { toast: () => [null, () => {}] } });
  const Sidebar = (await importSrc("apps/dashboard/src/surfaces/frame/sidebar/sidebar.tsx")).Sidebar;
  bridgeHolds({ parts: { chrome: { themes: THEME_OPTIONS, looks: LOOK_OPTIONS, lookOffered: false } } });
  bridgeHolds({ values: { today: { standing: { lines: { short: "1 of 1 line on" } } } } });
  const workspace = (id, name) => ({ id, slug: id, name, status: "active", timezone: "UTC", role: "owner" });
  const row = (workspaces) => {
    bridgeHolds({ who: { workspaces: workspaces } });
    bridgeHolds({ who: { activeWorkspaceId: workspaces[0].id } });
    fresh();
    const drawn = byTestId(
      again(() =>
        globalThis.React.createElement(Sidebar, {
          themePref: "dark",
          onTheme: () => {},
          look: "glass",
          onLook: () => {},
        }),
      ),
      "sb-workspace",
    );
    const plan = all(drawn, (n) => classes(n).includes("sb-team-plan"));
    return { name: textOf(all(drawn, (n) => classes(n).includes("sb-team-name"))[0]), under: plan.map(textOf) };
  };
  try {
    assert.deepEqual(
      row([workspace("w1", "Luna Studio")]),
      { name: "Luna Studio", under: [] },
      "one workspace: its name alone, and not the lines Today publishes",
    );
    assert.deepEqual(
      row([workspace("w1", "Luna Studio"), workspace("w2", "Luna Annex")]),
      { name: "Luna Studio", under: ["2 workspaces"] },
      "two: how many there are to switch between",
    );
  } finally {
    bridgeHolds({ values: { today: undefined } });
    bridgeHolds({ who: { workspaces: undefined } });
    bridgeHolds({ who: { activeWorkspaceId: undefined } });
  }
});

test("the workspace's circle wears its own logo over its initials, and its initials alone without one; never AI's three", async () => {
  // 00407: the circle said Ask's three for every business. The initials are contracts' rule, through the bridge.
  installStubReact({});
  bridgeHolds({ parts: { toast: () => [null, () => {}] } });
  const Sidebar = (await importSrc("apps/dashboard/src/surfaces/frame/sidebar/sidebar.tsx")).Sidebar;
  bridgeHolds({ parts: { chrome: { themes: THEME_OPTIONS, looks: LOOK_OPTIONS, lookOffered: false } } });

  const LOGO = "https://proj.supabase.co/storage/v1/object/public/workspace-logos/a/b.png";
  const circleOf = (logo_url) => {
    bridgeHolds({
      who: {
        workspaces: [
          { id: "w1", slug: "w1", name: "Nails & Co", status: "active", timezone: "UTC", role: "owner", logo_url },
          {
            id: "w2",
            slug: "w2",
            name: "The Hair Studio",
            status: "active",
            timezone: "UTC",
            role: "owner",
            logo_url: null,
          },
        ],
      },
    });
    bridgeHolds({ who: { activeWorkspaceId: "w1" } });
    fresh();
    const sidebar = () =>
      globalThis.React.createElement(Sidebar, {
        themePref: "dark",
        onTheme: () => {},
        look: "glass",
        onLook: () => {},
      });
    const row = byTestId(again(sidebar), "sb-workspace");
    const circle = all(row, (n) => n.type === "span" && classes(n).includes("sb-team-mark"))[0];
    press(row);
    const menu = byTestId(again(sidebar), "sb-workspace-menu");
    return {
      initials: textOf(circle),
      picture: all(circle, (n) => n.type === "img").map((n) => [n.props.src, classes(n)]),
      three: all(row, (n) => n.type === frameParts().Icon && n.props.name === "three").length,
      menu: all(menu, (n) => n.type === "span" && classes(n).includes("sb-ws-mark")).map((m) => [
        textOf(m),
        all(m, (n) => n.type === "img").length,
      ]),
    };
  };
  try {
    assert.deepEqual(circleOf(LOGO), {
      initials: "NC",
      picture: [[LOGO, ["face-photo"]]],
      three: 0,
      menu: [
        ["NC", 1],
        ["HS", 0],
      ],
    });
    assert.deepEqual(circleOf(null), {
      initials: "NC",
      picture: [],
      three: 0,
      menu: [
        ["NC", 0],
        ["HS", 0],
      ],
    });
  } finally {
    bridgeHolds({ who: { workspaces: undefined } });
    bridgeHolds({ who: { activeWorkspaceId: undefined } });
  }
});

test("navigating INSIDE a surface does not tear the surface down", () => {
  // The mount key and the gate key used to be the same string, so a second
  // Settings tab or a second Inbox thread unmounted the whole surface and built
  // it again: two 240ms route-in fades compounding (the shell's, and the pane's
  // own) which reads as a flash, plus the surface's state, scroll position and
  // fetches thrown away on a navigation that never left it.
  const shell = ["shell-routes.ts", "shell-hooks.ts", "shell-chrome.tsx"]
    .map((f) => readCode(`apps/dashboard/src/surfaces/frame/${f}`))
    .join("\n");
  assert.ok(shell.includes('const routeKey = `${page}/${param || ""}`;'), "the GATE still asks per pane");
  // What it mounts under is a separate question, and it is asked of the shell as drawn (shell/surfaces/status/: one
  // mount for Broadcasts and its runs, one for every view of Leads), not of its source.
  assert.ok(
    shell.includes("const viewKey = routeLoading && !onStrip && !inPlace ? `${mountKey}/reading` : mountKey;") &&
      shell.includes("key={s.viewKey}"),
    "and the surface is keyed on that, not on the gate key -- and on readiness while its surface is on its way, so the route-in fade plays on the page as it lands; a strip's view still reading is that view, read in place",
  );
  assert.ok(shell.includes("routeReady(page, param)"), "the readiness check still sees the param");

  // Opt-IN, and only for a surface that follows its param: which pages are one mount across their address is run
  // on the shell as drawn (shell/surfaces/status/), the safe default with them. Broadcasts follows its run and its
  // list as props: drawn in runs-honest.test.mjs.
  // Settings derives its tab on every draw (workspace/settings-owner-panes/every-address-of-the-business-lands-on-its-pane,
  // "Settings derives its tab on every draw"), and the Inbox follows a later deep-link and the thread it names arriving
  // (conversations/inbox/inbox-place.test.mjs, "the thread open is the address's").
});

test("the account menu offers the look only once contracts does: none while it is not offered, then the looks under the theme, a press handing it to the shell", async () => {
  // The real sidebar on the stub React, its account menu opened as a person opens it. The chrome's words are what
  // the bridge publishes (shell.ts installShell), with the flag as contracts has it and then turned on.
  installStubReact({});
  bridgeHolds({ parts: { toast: () => [null, () => {}] } });
  const Sidebar = (await importSrc("apps/dashboard/src/surfaces/frame/sidebar/sidebar.tsx")).Sidebar;
  const picked = [];
  const themed = [];
  const accountMenu = (lookOffered) => {
    bridgeHolds({ parts: { chrome: { themes: THEME_OPTIONS, looks: LOOK_OPTIONS, lookOffered } } });
    fresh();
    const sidebar = () =>
      globalThis.React.createElement(Sidebar, {
        themePref: "dark",
        onTheme: (v) => themed.push(v),
        look: "glass",
        onLook: (v) => picked.push(v),
      });
    press(byTestId(again(sidebar), "sb-account"));
    return byTestId(again(sidebar), "sb-account-menu");
  };
  const groups = (menu) => all(menu, (n) => n.props?.role === "radiogroup").map((n) => n.props["aria-label"]);

  const held = accountMenu(false);
  assert.ok(held, "the account menu opens");
  assert.deepEqual(groups(held), ["Theme"], "a chrome that holds the look back: the theme alone, and no Look to press");
  assert.equal(byTestId(held, "sb-look-glass"), null);

  const offered = accountMenu(true);
  assert.deepEqual(groups(offered), ["Theme", "Look"], "offered: the look, under the theme");
  const looks = LOOK_OPTIONS.map((l) => byTestId(offered, `sb-look-${l.id}`));
  assert.deepEqual(
    looks.map((b) => [textOf(b), b.props["aria-checked"]]),
    [["Glass", true]],
    "the look in force is the one checked",
  );
  press(looks[0]);
  assert.deepEqual(picked, ["glass"], "a press hands the look to the shell, as the theme's does");
  assert.deepEqual(themed, [], "and leaves the theme as it was");
});
