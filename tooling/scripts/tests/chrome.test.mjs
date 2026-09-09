/**
 * The chrome: the sidebar's two menus and its rail, the theme with a system
 * option, the shell's one status line, the shortcuts sheet — and the
 * floating pill retired. The words and rules are contracts; the wiring is
 * pinned so the shell, the bridge and the page keep agreeing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTheme,
  isThemePref,
  isSidebarPref,
  workspaceHotkey,
  isTypingTarget,
  shellStatusLine,
  shortcutGroups,
  SHORTCUTS,
  THEME_OPTIONS,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

test("the theme: a choice, or the device's; unknown values fall back; the sidebar has two states", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("neon", true), "dark", "an unknown preference reads as system");
  assert.equal(resolveTheme(undefined, false), "light");
  assert.ok(isThemePref("system") && !isThemePref("auto") && !isThemePref(null));
  assert.ok(isSidebarPref("rail") && isSidebarPref("open") && !isSidebarPref("collapsed"));
  assert.deepEqual(THEME_OPTIONS.map((t) => t.id), ["light", "dark", "system"]);
  for (const t of THEME_OPTIONS) assert.ok(t.label && t.icon, t.id);
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
  assert.equal(shellStatusLine(null), null);
  assert.equal(shellStatusLine({ stale: false, degraded: [] }), null);
  assert.deepEqual(shellStatusLine({ stale: true, degraded: ["Inbox"] }), { text: "A newer version is ready", action: "reload" });
  assert.deepEqual(shellStatusLine({ stale: false, degraded: ["Inbox", "Calendar"] }), { text: "Inbox, Calendar not refreshing", action: null });
});

test("the shortcuts sheet lists what the app answers to, grouped in order, and nothing the app does not do", () => {
  const groups = shortcutGroups(SHORTCUTS);
  assert.deepEqual(groups.map((g) => g.group), ["Everywhere", "Lists", "Inbox"]);
  const does = SHORTCUTS.map((s) => s.does);
  for (const d of ["Ask Chanlytics", "Collapse or expand the sidebar", "This sheet", "Search the page", "Next and previous item", "Approve the draft", "Send"]) assert.ok(does.includes(d), d);
  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('e.key === "k"') && shell.includes('e.key === "b"'), "⌘K and ⌘B are real");
  assert.ok(shell.includes("if (n >= 1 && n <= 9)"), "⌘1–9 are real");
  assert.ok(readCode("apps/dashboard/src/legacy/components/shortcuts.jsx").includes('e.key === "?"'), "? is real");
});

test("the wiring: the pill is retired, the shell bridge carries its two actions and its status, the page has the menus, the rail and the sheet", () => {
  const app = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
  assert.ok(!app.includes("bridge-pill") && !app.includes("pill-signout"), "no floating pill");
  assert.ok(app.includes("installShell();") && app.includes("publishShellStatus({ stale: staleRef.current, degraded });"));
  assert.ok(app.includes("const theme = resolveTheme(prefs.theme, systemDark);") && app.includes('document.documentElement.setAttribute("data-theme", theme);'), "the page paints the resolved theme");
  assert.ok(app.includes("sidebar: isSidebarPref(p.sidebar) ? p.sidebar : PREF_DEFAULTS.sidebar"), "the rail is a device preference");
  assert.ok(!readRaw("apps/dashboard/src/legacy-bridge/legacy.css").includes(".bridge-pill"), "the pill's styles are gone");

  const bridge = readCode("apps/dashboard/src/legacy-bridge/shell.ts");
  assert.ok(bridge.indexOf("clearSurfaceCache();") < bridge.indexOf('form.action = "/auth/signout";'), "the cache is cleared before the server ends the session");
  assert.ok(bridge.includes("form.submit();") && bridge.includes("switchWorkspace(id);"));
  assert.ok(bridge.includes('win.dispatchEvent(new CustomEvent("shell:create-workspace"));'), "another workspace is one door in the menu");
  assert.ok(app.includes('window.addEventListener("shell:create-workspace", on);') && app.includes("onCancel={() => setCreating(false)}"));
  const create = readCode("apps/dashboard/src/legacy-bridge/CreateWorkspace.tsx");
  assert.ok(create.includes('{another ? "New workspace" : "Create your workspace"}') && create.includes('data-testid="create-workspace-back"'));
  assert.ok(bridge.includes("statusLine: shellStatusLine,") && bridge.includes("themes: THEME_OPTIONS,"));

  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('${sidebar === "rail" ? "rail" : ""}') && shell.includes('collapsed={sidebar === "rail"}'));
  assert.ok(shell.includes("if (window.innerWidth > 900) { e.preventDefault(); onSidebar("), "⌘B folds the sidebar on a desk only");
  assert.ok(shell.includes("window.__shell.switchWorkspace(all[n - 1].id)"));
  assert.ok(shell.includes("<ShortcutsSheet />"));

  const sidebar = readCode("apps/dashboard/src/legacy/components/sidebar.jsx");
  for (const pin of [
    "const WorkspaceMenu = ", "const UserMenu = ", "const SbStatus = ", "const useSbMenu = ",
    'className="more-menu sb-menu"', 'testid="sb-account-menu"', 'testid="sb-workspace-menu"',
    "window.__shell.signOut();", "window.__shell.switchWorkspace(w.id)", "window.__identity.words(me)",
    'data-tip={collapsed ? (badge ? `${item.label} · ${badge}` : item.label) : undefined}',
    'window.dispatchEvent(new CustomEvent("shortcuts:open"))',
    "window.__shell.createWorkspace();",
  ]) assert.ok(sidebar.includes(pin), pin);
  assert.ok(!sidebar.includes('onClick={() => onNavigate("admin")}>\n          <div className="avatar">'), "the chip opens a menu, not Settings");

  const icons = readCode("apps/dashboard/src/legacy/components/icons.jsx");
  for (const name of ["logout", "keyboard", "chevrons", "monitor", "user", "sidebar"]) assert.ok(icons.includes(`case "${name}":`), name);
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/components/shortcuts.jsx";'));

  const css = readRaw("apps/dashboard/src/legacy/styles/components.css");
  for (const pin of [".sidebar.collapsed .nav-item { justify-content: center;", ".sb-menu { position: fixed;", ".sb-theme-seg {", ".sb-attn {", ".sb-sheet {"]) assert.ok(css.includes(pin), pin);
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/mobile.css").includes(".side-wrap .sidebar.collapsed { width: min(300px, 84vw); }"), "the drawer is never a rail");
});

test("navigating INSIDE a surface does not tear the surface down", () => {
  // The mount key and the gate key used to be the same string, so a second
  // Settings tab or a second Inbox thread unmounted the whole surface and built
  // it again: two 240ms route-in fades compounding (the shell's, and the pane's
  // own) which reads as a flash, plus the surface's state, scroll position and
  // fetches thrown away on a navigation that never left it.
  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('const routeKey = `${page}/${param || ""}`;'), "the GATE still asks per pane");
  assert.ok(shell.includes("const mountKey = PARAM_FOLLOWED_AS_PROP.has(page) ? page : routeKey;"), "what it mounts under is a separate question");
  assert.ok(shell.includes("<div key={mountKey}"), "and the surface is keyed on that, not on the gate key");
  assert.ok(shell.includes('routeReady(page, param)'), "the readiness check still sees the param");

  // Opt-IN, and only for a surface that follows its param. Getting this list
  // wrong in the other direction shows the wrong entity, so the default has to
  // be the safe one.
  assert.match(shell, /const PARAM_FOLLOWED_AS_PROP = new Set\(\["admin", "inbox"\]\);/);
  const settings = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(settings.includes("const active = SET_TABS.find(t => t.id === tab)"), "Settings derives its tab every render");
  const inbox = readCode("apps/dashboard/src/legacy/pages/inbox.jsx");
  assert.ok(inbox.includes("}, [initialThreadId]);"), "the Inbox follows a later deep-link");
});
