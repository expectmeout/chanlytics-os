/**
 * The theme before first paint, and the browser's own bars with it.
 *
 * The document came down with data-theme="dark" hard-coded and was corrected in an effect after the bundle (2.7 MB)
 * had mounted, so a light-theme workspace opened dark and flipped on every refresh. A script inline in the head
 * stamps the theme the app will resolve, from the same preference the app reads, before anything paints. It is
 * contracts' own text, and this runs it against contracts' own rule -- the stored preference as themePrefOf reads
 * it (what LegacyApp's loadPrefs keeps), then resolveTheme -- for everything a device could hold and both settings.
 *
 * The bars above and below the page had the same bug for longer: theme-color was a pair of metas keyed off
 * (prefers-color-scheme), so they followed the PHONE while the page followed the member's preference, and the two
 * never had to agree. The script now paints them from the theme it resolved, and LegacyApp's paintThemeColor
 * repaints them on every change; both run here, against the one colour per theme contracts keeps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  themeBootScript,
  themePrefOf,
  resolveTheme,
  DEVICE_PREFS_STORAGE,
  DEFAULT_THEME_PREF,
  THEME_COLORS,
} from "../../../packages/contracts/src/chrome.ts";
import { paintThemeColor } from "../../../apps/dashboard/src/legacy-bridge/theme-color.ts";

/**
 * A document with a head, as the page ships it: the theme-color metas the markup declared, none by default beyond
 * the one the layout renders. `bars()` reads the head the way a browser does -- the first theme-color meta in tree
 * order -- and `metas()` is every answer to the same question, which is what the writers have to leave agreeing.
 */
const fakeDoc = ({ markupMetas = [THEME_COLORS.dark] } = {}) => {
  const el = (name) => ({
    name,
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    getAttribute(k) {
      return k in this.attrs ? this.attrs[k] : null;
    },
  });
  const head = markupMetas.map((content) => {
    const m = el("meta");
    m.setAttribute("name", "theme-color");
    m.setAttribute("content", content);
    return m;
  });
  const metas = () => head.filter((n) => n.getAttribute("name") === "theme-color");
  const doc = {
    documentElement: { dataset: {}, setAttribute() {} },
    createElement: el,
    querySelectorAll: (sel) => (String(sel).includes("theme-color") ? metas() : []),
    head: {
      appendChild(node) {
        head.push(node);
        return node;
      },
    },
  };
  return {
    doc,
    contents: () => metas().map((m) => m.getAttribute("content")),
    bars: () => metas()[0]?.getAttribute("content") ?? null,
  };
};

/** The script run in a window: what it stamped, what the bars ended up, or what it threw. */
const boot = ({ stored, systemDark, storageThrows = false, noMatchMedia = false, markupMetas }) => {
  const { doc, bars, contents } = fakeDoc(markupMetas === undefined ? {} : { markupMetas });
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
    fn({ matchMedia, localStorage }, doc, localStorage);
  } catch (e) {
    threw = e;
  }
  return { theme: doc.documentElement.dataset.theme, bars: bars(), metas: contents(), threw };
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
  const dark = resolveTheme(DEFAULT_THEME_PREF, true);
  assert.deepEqual(boot({ stored: null, systemDark: true, storageThrows: true }), {
    theme: dark,
    bars: THEME_COLORS[dark],
    metas: [THEME_COLORS[dark]],
    threw: null,
  });
  assert.deepEqual(boot({ stored: '{"theme":"light"}', systemDark: false, noMatchMedia: true }), {
    theme: "light",
    bars: THEME_COLORS.light,
    metas: [THEME_COLORS.light],
    threw: null,
  });
  assert.deepEqual(
    boot({ stored: '{"theme":"system"}', systemDark: true, noMatchMedia: true }),
    { theme: resolveTheme("system", false), bars: THEME_COLORS.light, metas: [THEME_COLORS.light], threw: null },
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

/* ---------------------------------------------------------------------------
 * The browser's own bars.
 *
 * theme-color was two metas keyed off (prefers-color-scheme), so the strip
 * above the page answered to the phone's Appearance setting while the page
 * answered to the member's. Anyone whose two disagreed read every screen
 * through a band of the wrong theme, and no amount of refreshing fixed it,
 * because nothing in the app ever wrote the meta.
 * ------------------------------------------------------------------------- */

test("the bars open in the theme the page opens in, whatever the device is set to", () => {
  for (const systemDark of [false, true]) {
    for (const stored of [
      '{"theme":"dark"}',
      '{"theme":"light"}',
      '{"theme":"system"}',
      "{}",
      null,
      '{"theme":"junk"}',
      "not json",
    ]) {
      const where = `${stored} on a ${systemDark ? "dark" : "light"} device`;
      const { theme, bars, metas } = boot({ stored, systemDark });
      assert.equal(bars, THEME_COLORS[theme], `${where}: the bars are the page's own paper`);
      assert.deepEqual(metas, [THEME_COLORS[theme]], `${where}: one answer in the head, not two`);
    }
  }
});

test("a light app on a dark phone gets light bars, and a dark app on a light phone dark ones", () => {
  assert.notEqual(THEME_COLORS.light, THEME_COLORS.dark, "the two themes are told apart by their paper");
  assert.deepEqual(
    [boot({ stored: '{"theme":"light"}', systemDark: true }), boot({ stored: '{"theme":"dark"}', systemDark: false })],
    [
      { theme: "light", bars: THEME_COLORS.light, metas: [THEME_COLORS.light], threw: null },
      { theme: "dark", bars: THEME_COLORS.dark, metas: [THEME_COLORS.dark], threw: null },
    ],
  );
});

test("a head with no theme-color of its own gets one, so the bars are never left on the browser's guess", () => {
  assert.deepEqual(boot({ stored: '{"theme":"light"}', systemDark: true, markupMetas: [] }), {
    theme: "light",
    bars: THEME_COLORS.light,
    metas: [THEME_COLORS.light],
    threw: null,
  });
});

test("every meta in the head is written, not the first: React leaves a second one behind at hydration", () => {
  // Measured on /w/<slug>, 22 Sep 2026: the script writes the meta the markup shipped, React finds the attribute it
  // rendered has changed, and plants its own copy behind it. The browser reads the first, so the bars are right --
  // but two answers to one question is a bug waiting for an insertion order, and the app settles it on mount.
  const { doc, contents } = fakeDoc({ markupMetas: [THEME_COLORS.light, THEME_COLORS.dark] });
  paintThemeColor(doc, "light");
  assert.deepEqual(contents(), [THEME_COLORS.light, THEME_COLORS.light], "the stale copy is brought into line");
  assert.deepEqual(
    boot({ stored: '{"theme":"light"}', systemDark: true, markupMetas: [THEME_COLORS.dark, THEME_COLORS.dark] }).metas,
    [THEME_COLORS.light, THEME_COLORS.light],
    "and the boot script writes every one of them too",
  );
});

test("the app repaints the bars whenever the theme changes, through the meta the head already has", () => {
  const { doc, bars, contents } = fakeDoc();
  paintThemeColor(doc, "light");
  assert.equal(bars(), THEME_COLORS.light, "switching to light takes the bars with it");
  paintThemeColor(doc, "dark");
  assert.equal(bars(), THEME_COLORS.dark, "and back again");
  assert.equal(contents().length, 1, "the app writes the meta the boot script left, never a second one");
});

test("the app paints the bars the boot script would have, so hydration changes nothing on screen", () => {
  for (const systemDark of [false, true]) {
    for (const stored of ['{"theme":"dark"}', '{"theme":"light"}', '{"theme":"system"}', null]) {
      const booted = boot({ stored, systemDark });
      const { doc, bars } = fakeDoc();
      paintThemeColor(doc, app(stored, systemDark));
      assert.equal(bars(), booted.bars, `${stored} on a ${systemDark ? "dark" : "light"} device`);
    }
  }
});

test("a document the app cannot write to costs it nothing: the page still runs", () => {
  assert.doesNotThrow(() => paintThemeColor({}, "light"));
});
