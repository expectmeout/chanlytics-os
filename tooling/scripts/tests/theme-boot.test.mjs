/**
 * The theme before first paint.
 *
 * The document came down with data-theme="dark" hard-coded and was corrected in an effect after the bundle (2.7 MB)
 * had mounted, so a light-theme workspace opened dark and flipped on every refresh. A script inline in the head
 * stamps the theme the app will resolve, from the same preference the app reads, before anything paints. It is
 * contracts' own text, and this runs it against contracts' own rule -- the stored preference as themePrefOf reads
 * it (what LegacyApp's loadPrefs keeps), then resolveTheme -- for everything a device could hold and both settings.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  themeBootScript,
  themePrefOf,
  resolveTheme,
  DEVICE_PREFS_STORAGE,
  DEFAULT_THEME_PREF,
} from "../../../packages/contracts/src/chrome.ts";

/** The script run in a window: what it stamped, or what it threw. */
const boot = ({ stored, systemDark, storageThrows = false, noMatchMedia = false }) => {
  const html = { dataset: {} };
  const localStorage = {
    getItem: () => {
      if (storageThrows) throw new Error("blocked");
      return stored;
    },
  };
  const matchMedia = noMatchMedia
    ? undefined
    : (q) => ({ matches: q === "(prefers-color-scheme: dark)" && systemDark });
  const fn = new Function("window", "document", "localStorage", themeBootScript());
  let threw = null;
  try {
    fn({ matchMedia, localStorage }, { documentElement: html }, localStorage);
  } catch (e) {
    threw = e;
  }
  return { theme: html.dataset.theme, threw };
};

/** What the app paints once mounted, from the same bytes: loadPrefs' parse, then the one rule. */
const app = (stored, systemDark) => {
  let pref;
  try {
    pref = { theme: DEFAULT_THEME_PREF, ...JSON.parse(stored || "{}") }.theme;
  } catch {
    pref = DEFAULT_THEME_PREF;
  }
  return resolveTheme(themePrefOf(pref), systemDark);
};

test("the script stamps what the app will paint, for everything this device could hold and both device settings", () => {
  for (const systemDark of [false, true]) {
    for (const stored of [
      '{"theme":"dark"}',
      '{"theme":"light"}',
      '{"theme":"system"}',
      "{}",
      null,
      '{"theme":"junk"}',
      "not json",
      "null",
      '"dark"',
    ]) {
      const { theme, threw } = boot({ stored, systemDark });
      assert.equal(threw, null, `${stored} on a ${systemDark ? "dark" : "light"} device throws nothing`);
      assert.equal(theme, app(stored, systemDark), `${stored} on a ${systemDark ? "dark" : "light"} device`);
    }
  }
});

test("a device that has chosen nothing opens in the app's default, not its own setting: the app would flip it after mount", () => {
  assert.equal(boot({ stored: null, systemDark: false }).theme, resolveTheme(DEFAULT_THEME_PREF, false));
  assert.equal(boot({ stored: '{"theme":"junk"}', systemDark: false }).theme, resolveTheme(DEFAULT_THEME_PREF, false));
  assert.equal(themePrefOf(undefined), DEFAULT_THEME_PREF);
  assert.equal(themePrefOf("junk"), DEFAULT_THEME_PREF);
  assert.equal(themePrefOf("system"), "system");
});

test("a storage that refuses, or a window with no matchMedia, still stamps a theme: the app's own, never a page with none", () => {
  assert.deepEqual(boot({ stored: null, systemDark: true, storageThrows: true }), {
    theme: resolveTheme(DEFAULT_THEME_PREF, true),
    threw: null,
  });
  assert.deepEqual(boot({ stored: '{"theme":"light"}', systemDark: false, noMatchMedia: true }), {
    theme: "light",
    threw: null,
  });
  assert.deepEqual(
    boot({ stored: '{"theme":"system"}', systemDark: true, noMatchMedia: true }),
    { theme: resolveTheme("system", false), threw: null },
    "no matchMedia reads as a light device, as the app's own useSystemDark does",
  );
});

test("the script reads the preferences the app writes, under the same name", () => {
  assert.equal(DEVICE_PREFS_STORAGE, "chanlytics-os-prefs");
  assert.ok(
    themeBootScript().includes(JSON.stringify(DEVICE_PREFS_STORAGE)),
    "the name is in the script once, from the constant",
  );
});
