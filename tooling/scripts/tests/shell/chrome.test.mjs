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
  workspaceHotkey,
  isTypingTarget,
  shellStatusLine,
  shortcutGroups,
  SHORTCUTS,
  THEME_OPTIONS,
  LOOK_OPTIONS,
  DEFAULT_LOOK_PREF,
  LOOK_OFFERED,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";
import { installLegacyReact, fresh, again, all, byTestId, press, textOf } from "../_legacy-react.mjs";

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

test("the look: Classic or Glass, Classic by default and for anything unknown, and not offered to members yet", () => {
  assert.deepEqual(
    LOOK_OPTIONS.map((l) => [l.id, l.label]),
    [
      ["classic", "Classic"],
      ["glass", "Glass"],
    ],
  );
  assert.ok(isLookPref("classic") && isLookPref("glass") && !isLookPref("Glass") && !isLookPref(null));
  assert.equal(DEFAULT_LOOK_PREF, "classic", "the app as it is drawn today");
  assert.equal(lookPrefOf("glass"), "glass");
  assert.equal(lookPrefOf("neon"), DEFAULT_LOOK_PREF, "an unknown look is the default, as an unknown theme is");
  assert.equal(LOOK_OFFERED, false, "the account menu offers no Look until Glass is drawn (the plan's step 5.5)");
});

test("hotkeys and typing: ⌘1 to ⌘9 for the first nine workspaces; a field being typed in keeps its keys", () => {
  assert.equal(workspaceHotkey(0), "⌘1");
  assert.equal(workspaceHotkey(8), "⌘9");
  assert.equal(workspaceHotkey(9), null);
  assert.equal(workspaceHotkey(-1), null);
  assert.equal(isTypingTarget("INPUT", false), true);
  assert.equal(isTypingTarget("textarea", false), true);
  assert.equal(isTypingTarget("DIV", true), true);
  assert.equal(isTypingTarget("DIV", false), false);
  assert.equal(isTypingTarget(null, false), false);
});

test("the shell's one line: a newer build outranks stale surfaces, and nothing is nothing", () => {
  // Every state's words, and the order between them, run in shell-status.test.mjs.
  assert.equal(shellStatusLine(null), null);
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
    ["Everywhere", "Ask", "People", "Inbox"],
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
    [["People"], ["People", "Inbox"]],
    "REGRESSION (N17): the sheet offered / and J/K on every list; / searches People, and J/K walk People's rows and the Inbox's",
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
    ],
    "People's keys, the ones its table's foot names: the sheet listed only /",
  );
  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('e.key === "k"') && shell.includes('e.key === "b"'), "⌘K and ⌘B are real");
  assert.ok(shell.includes("if (n >= 1 && n <= 9)"), "⌘1–9 are real");
  assert.ok(readCode("apps/dashboard/src/legacy/components/shortcuts.jsx").includes('e.key === "?"'), "? is real");
});

test("the wiring: the pill is retired, the shell bridge carries its two actions and its status, the page has the menus, the rail and the sheet", () => {
  const app = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
  assert.ok(!app.includes("bridge-pill") && !app.includes("pill-signout"), "no floating pill");
  assert.ok(
    app.includes("installShell();") &&
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
  assert.ok(
    !readRaw("apps/dashboard/src/legacy-bridge/legacy.css").includes(".bridge-pill"),
    "the pill's styles are gone",
  );

  const bridge = readCode("apps/dashboard/src/legacy-bridge/shell.ts");
  assert.ok(
    bridge.indexOf("clearSurfaceCache();") < bridge.indexOf('form.action = "/auth/signout";'),
    "the cache is cleared before the server ends the session",
  );
  assert.ok(bridge.includes("form.submit();") && bridge.includes("switchWorkspace(id);"));
  assert.ok(
    bridge.includes('win.dispatchEvent(new CustomEvent("shell:create-workspace"));'),
    "another workspace is one door in the menu",
  );
  assert.ok(
    app.includes('window.addEventListener("shell:create-workspace", on);') &&
      app.includes("onCancel={() => setCreating(false)}"),
  );
  // Another workspace's own title and its Back: create-workspace-screen.test.mjs draws the screen and presses them.
  assert.ok(bridge.includes("statusLine: shellStatusLine,") && bridge.includes("themes: THEME_OPTIONS,"));

  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('${sidebar === "rail" ? "rail" : ""}') && shell.includes('collapsed={sidebar === "rail"}'));
  assert.ok(
    shell.includes("if (window.innerWidth > 900) { e.preventDefault(); onSidebar("),
    "⌘B folds the sidebar on a desk only",
  );
  assert.ok(shell.includes("window.__shell.switchWorkspace(all[n - 1].id)"));
  assert.ok(shell.includes("<ShortcutsSheet />"));

  const sidebar = readCode("apps/dashboard/src/legacy/components/sidebar.jsx");
  for (const pin of [
    "const WorkspaceMenu = ",
    "const UserMenu = ",
    "const useSbMenu = ",
    'className="more-menu sb-menu"',
    'testid="sb-account-menu"',
    'testid="sb-workspace-menu"',
    "window.__shell.signOut();",
    "window.__shell.switchWorkspace(w.id)",
    "window.__identity.words(me)",
    "data-tip={collapsed ? (badge ? `${item.label} · ${badge}` : item.label) : undefined}",
    'window.dispatchEvent(new CustomEvent("shortcuts:open"))',
    "window.__shell.createWorkspace();",
  ])
    assert.ok(sidebar.includes(pin), pin);
  assert.ok(
    !sidebar.includes('onClick={() => onNavigate("admin")}>\n          <div className="avatar">'),
    "the chip opens a menu, not Settings",
  );

  const icons = readCode("apps/dashboard/src/legacy/components/icons.jsx");
  for (const name of ["logout", "keyboard", "chevrons", "monitor", "user", "sidebar"])
    assert.ok(icons.includes(`case "${name}":`), name);
  assert.ok(
    readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/components/shortcuts.jsx";'),
  );

  const css = readRaw("apps/dashboard/src/legacy/styles/components.css");
  for (const pin of [
    ".sidebar.collapsed .nav-item { justify-content: center;",
    ".sb-menu { position: fixed;",
    ".sb-theme-seg {",
    ".sb-sheet {",
  ])
    assert.ok(css.includes(pin), pin);
  assert.ok(
    readRaw("apps/dashboard/src/legacy/styles/mobile.css").includes(
      ".side-wrap .sidebar.collapsed { width: min(248px, 84vw); }",
    ),
    "the drawer is never a rail",
  );
});

test("navigating INSIDE a surface does not tear the surface down", () => {
  // The mount key and the gate key used to be the same string, so a second
  // Settings tab or a second Inbox thread unmounted the whole surface and built
  // it again: two 240ms route-in fades compounding (the shell's, and the pane's
  // own) which reads as a flash, plus the surface's state, scroll position and
  // fetches thrown away on a navigation that never left it.
  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('const routeKey = `${page}/${param || ""}`;'), "the GATE still asks per pane");
  // What it mounts under is a separate question, and it is asked of the shell as drawn (shell-status.test.mjs: one
  // mount for Broadcasts and its runs, one for every view of Leads), not of its source.
  assert.ok(
    shell.includes("const viewKey = routeLoading ? `${mountKey}/reading` : mountKey;") &&
      shell.includes("key={viewKey}"),
    "and the surface is keyed on that, not on the gate key -- and on readiness while its surface is on its way, so the route-in fade plays on the page as it lands",
  );
  assert.ok(shell.includes("routeReady(page, param)"), "the readiness check still sees the param");

  // Opt-IN, and only for a surface that follows its param: which pages are one mount across their address is run
  // on the shell as drawn (shell-status.test.mjs), the safe default with them. Broadcasts follows its run and its
  // list as props: drawn in runs-honest.test.mjs.
  const settings = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(settings.includes("const active = SET_TAB(tab);"), "Settings derives its tab every render");
  const inbox = readCode("apps/dashboard/src/legacy/pages/inbox.jsx");
  assert.ok(inbox.includes("}, [initialThreadId]);"), "the Inbox follows a later deep-link");
});

test("the account menu offers the look only once contracts does: none while it is not offered, then Classic and Glass under the theme, a press handing it to the shell", async () => {
  // The real sidebar on the stub React, its account menu opened as a person opens it. The chrome's words are what
  // the bridge publishes (shell.ts installShell), with the flag as contracts has it and then turned on.
  installLegacyReact({ usePPToast: () => [null, () => {}] });
  await import("../../../../apps/dashboard/src/legacy/components/sidebar.jsx");
  const picked = [];
  const themed = [];
  const accountMenu = (lookOffered) => {
    globalThis.window.__chrome = { themes: THEME_OPTIONS, looks: LOOK_OPTIONS, lookOffered };
    fresh();
    const sidebar = () =>
      globalThis.React.createElement(globalThis.window.Sidebar, {
        themePref: "dark",
        onTheme: (v) => themed.push(v),
        look: "classic",
        onLook: (v) => picked.push(v),
      });
    press(byTestId(again(sidebar), "sb-account"));
    return byTestId(again(sidebar), "sb-account-menu");
  };
  const groups = (menu) => all(menu, (n) => n.props?.role === "radiogroup").map((n) => n.props["aria-label"]);

  const now = accountMenu(LOOK_OFFERED);
  assert.ok(now, "the account menu opens");
  assert.deepEqual(groups(now), ["Theme"], "not offered yet: the theme alone, and no Look to press");
  assert.equal(byTestId(now, "sb-look-glass"), null);

  const offered = accountMenu(true);
  assert.deepEqual(groups(offered), ["Theme", "Look"], "offered: the look, under the theme");
  const looks = LOOK_OPTIONS.map((l) => byTestId(offered, `sb-look-${l.id}`));
  assert.deepEqual(
    looks.map((b) => [textOf(b), b.props["aria-checked"]]),
    [
      ["Classic", true],
      ["Glass", false],
    ],
    "the look in force is the one checked",
  );
  press(looks[1]);
  assert.deepEqual(picked, ["glass"], "a press hands the look to the shell, as the theme's does");
  assert.deepEqual(themed, [], "and leaves the theme as it was");
});
