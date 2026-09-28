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
 *
 * The look travels as the theme does (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.2): the same
 * stored object's `look`, stamped as data-look by the same script before first paint, as lookPrefOf reads it (what
 * loadPrefs keeps), so a `[data-look]` rule never flips after mount. Both attributes are run here, for every pairing
 * a device could hold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  themeBootScript,
  themePrefOf,
  resolveTheme,
  lookPrefOf,
  DEVICE_PREFS_STORAGE,
  DEFAULT_THEME_PREF,
  DEFAULT_LOOK_PREF,
  THEME_COLORS,
} from "../../../../packages/contracts/src/shell/chrome.ts";
import { paintThemeColor } from "../../../../apps/dashboard/src/legacy-bridge/theme-color.ts";
import * as manifestModule from "../../../../apps/dashboard/app/manifest.ts";

// TypeScript loaded through tsx, which may hand its default export back wrapped once more.
const manifest = typeof manifestModule.default === "function" ? manifestModule.default : manifestModule.default.default;

/**
 * A document with a head, as the page ships it: the theme-color metas the markup declared, none by default beyond
 * the one the layout renders. `bars()` reads the head the way a browser does -- the first theme-color meta in tree
 * order -- and `metas()` is every answer to the same question, which is what the writers have to leave agreeing.
 * `noHead` is a document with none at all, where writing a meta throws.
 */
const fakeDoc = ({ markupMetas = [THEME_COLORS.dark], noHead = false } = {}) => {
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
    head: noHead
      ? undefined
      : {
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

/** The script run in a window: the theme and the look it stamped, what the bars ended up, or what it threw. */
const boot = ({ stored, systemDark, storageThrows = false, noMatchMedia = false, markupMetas, noHead = false }) => {
  const { doc, bars, contents } = fakeDoc({ ...(markupMetas === undefined ? {} : { markupMetas }), noHead });
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
  const { theme, look } = doc.documentElement.dataset;
  return { theme, look, bars: bars(), metas: contents(), threw };
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

/** The look the app keeps once mounted, from the same bytes: loadPrefs' parse, then lookPrefOf. */
const appLook = (stored) => {
  let pref;
  try {
    pref = { look: DEFAULT_LOOK_PREF, ...JSON.parse(stored || "{}") }.look;
  } catch {
    pref = DEFAULT_LOOK_PREF;
  }
  return lookPrefOf(pref);
};

/**
 * Everything this device could hold under the name: each theme and each look this build knows, one it does not, a
 * look in the wrong case or the wrong shape, and neither, in every pairing; then nothing at all, and bytes that are
 * not a preferences object.
 */
const THEMES_HELD = ['"dark"', '"light"', '"system"', '"junk"', undefined];
const LOOKS_HELD = ['"classic"', '"glass"', '"junk"', '"Glass"', "null", '["glass"]', undefined];
const HELD = [
  ...THEMES_HELD.flatMap((theme) =>
    LOOKS_HELD.map((look) => {
      const fields = [theme && `"theme":${theme}`, look && `"look":${look}`].filter(Boolean);
      return `{${fields.join(",")}}`;
    }),
  ),
  null,
  "not json",
  "null",
  '"dark"',
  '"glass"',
];

test("the script stamps the theme and the look the app will paint, for everything this device could hold and both device settings", () => {
  assert.ok(HELD.includes('{"theme":"light","look":"glass"}') && HELD.includes("{}"), "every pairing, and neither");
  for (const systemDark of [false, true]) {
    for (const stored of HELD) {
      const where = `${stored} on a ${systemDark ? "dark" : "light"} device`;
      const { theme, look, threw } = boot({ stored, systemDark });
      assert.equal(threw, null, `${where} throws nothing`);
      assert.equal(theme, app(stored, systemDark), `${where}: the theme`);
      assert.equal(look, appLook(stored), `${where}: the look`);
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

test("the look is Classic until the device keeps another, and each attribute is read on its own: a value one does not know leaves the other standing", () => {
  assert.equal(DEFAULT_LOOK_PREF, "classic", "the app as it is drawn today");
  assert.equal(lookPrefOf(undefined), DEFAULT_LOOK_PREF);
  assert.equal(lookPrefOf("junk"), DEFAULT_LOOK_PREF);
  assert.equal(lookPrefOf("glass"), "glass");
  const stamped = (stored) => {
    const { theme, look } = boot({ stored, systemDark: false });
    return { theme, look };
  };
  const theme = resolveTheme(DEFAULT_THEME_PREF, false);
  assert.deepEqual(stamped(null), { theme, look: "classic" }, "a device that has chosen nothing");
  assert.deepEqual(stamped('{"theme":"light","look":"glass"}'), { theme: "light", look: "glass" });
  assert.deepEqual(stamped('{"theme":"junk","look":"glass"}'), { theme, look: "glass" }, "a theme it does not know");
  assert.deepEqual(
    stamped('{"theme":"light","look":"junk"}'),
    { theme: "light", look: "classic" },
    "a look it does not know",
  );
});

test("a storage that refuses, or a window with no matchMedia, still stamps a theme and a look: the app's own, never a page with none", () => {
  const dark = resolveTheme(DEFAULT_THEME_PREF, true);
  assert.deepEqual(boot({ stored: null, systemDark: true, storageThrows: true }), {
    theme: dark,
    look: DEFAULT_LOOK_PREF,
    bars: THEME_COLORS[dark],
    metas: [THEME_COLORS[dark]],
    threw: null,
  });
  assert.deepEqual(boot({ stored: '{"theme":"light"}', systemDark: false, noMatchMedia: true }), {
    theme: "light",
    look: DEFAULT_LOOK_PREF,
    bars: THEME_COLORS.light,
    metas: [THEME_COLORS.light],
    threw: null,
  });
  assert.deepEqual(
    boot({ stored: '{"theme":"system","look":"glass"}', systemDark: true, noMatchMedia: true }),
    {
      theme: resolveTheme("system", false),
      look: "glass",
      bars: THEME_COLORS.light,
      metas: [THEME_COLORS.light],
      threw: null,
    },
    "no matchMedia reads as a light device, as the app's own useSystemDark does, and the look it keeps stands",
  );
});

test("a document with no head still wears the theme and the look: both are stamped before any meta is touched", () => {
  const { theme, look, bars, threw } = boot({
    stored: '{"theme":"light","look":"glass"}',
    systemDark: true,
    markupMetas: [],
    noHead: true,
  });
  assert.deepEqual({ theme, look, bars, threw }, { theme: "light", look: "glass", bars: null, threw: null });
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
      { theme: "light", look: DEFAULT_LOOK_PREF, bars: THEME_COLORS.light, metas: [THEME_COLORS.light], threw: null },
      { theme: "dark", look: DEFAULT_LOOK_PREF, bars: THEME_COLORS.dark, metas: [THEME_COLORS.dark], threw: null },
    ],
  );
});

test("a head with no theme-color of its own gets one, so the bars are never left on the browser's guess", () => {
  assert.deepEqual(boot({ stored: '{"theme":"light"}', systemDark: true, markupMetas: [] }), {
    theme: "light",
    look: DEFAULT_LOOK_PREF,
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

test("the installed app launches on the paper its first page paints, not on a third colour", () => {
  // The manifest is read before any page: background_color is the splash an installed app opens on, theme_color the
  // bar the OS paints until the page's own meta is read. They were a dark green-black neither theme's page is, left
  // over from the doors' old palette, so every launch went from that green to the page's paper. A device that has
  // chosen nothing is what a fresh install is, and on either device setting the page it opens paints this.
  const { background_color, theme_color } = manifest();
  for (const systemDark of [false, true]) {
    const first = boot({ stored: null, systemDark }).bars;
    const where = `a fresh install on a ${systemDark ? "dark" : "light"} device`;
    assert.equal(background_color, first, `${where}: the splash is the page's paper`);
    assert.equal(theme_color, first, `${where}: and so is the bar above it`);
  }
});
