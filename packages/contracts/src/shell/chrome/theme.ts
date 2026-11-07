/** Chrome: theme. */

export type ThemePref = "light" | "dark" | "system";

export type Theme = "light" | "dark";

type ThemeOption = { id: ThemePref; label: string; icon: string };

/** The three, in the order the top bar's one button steps through them; a fixed three, so each is there to read. */
export const THEME_OPTIONS: readonly [ThemeOption, ThemeOption, ThemeOption] = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "system", label: "System", icon: "monitor" },
];

export const isThemePref = (value: unknown): value is ThemePref =>
  value === "light" || value === "dark" || value === "system";

/**
 * The preference after this one, in THEME_OPTIONS' order, so the top bar's one button reaches all three. It flipped
 * the resolved theme between light and dark, so System could not be chosen there and a press dropped it (the wiring
 * audit's N19). An unknown preference reads as System, so the next is the first.
 */
export function nextThemePref(pref: unknown): ThemePref {
  const at = THEME_OPTIONS.findIndex((o) => o.id === pref);
  return (THEME_OPTIONS[(at + 1) % THEME_OPTIONS.length] ?? THEME_OPTIONS[0]).id;
}

/** What the top bar's theme button shows and says: the preference in force, and what a press makes it. */
export function themeButtonWords(pref: unknown): { icon: string; label: string } {
  const now = THEME_OPTIONS.find((o) => o.id === pref) ?? THEME_OPTIONS[2];
  const next = THEME_OPTIONS.find((o) => o.id === nextThemePref(now.id)) as (typeof THEME_OPTIONS)[number];
  return { icon: now.icon, label: `Theme: ${now.label}. Switch to ${next.label}` };
}

/** What the page paints: a chosen theme, or the device's when the choice is "system". */
export function resolveTheme(pref: unknown, systemDark: boolean): Theme {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
}

/** The preference of a device that has chosen nothing, or holds one this build no longer knows. */
export const DEFAULT_THEME_PREF: ThemePref = "dark";

/** A device's stored preference as the app keeps it: anything unknown is the default, never System. */
export const themePrefOf = (stored: unknown): ThemePref => (isThemePref(stored) ? stored : DEFAULT_THEME_PREF);

/**
 * The look: the finish every page is drawn in, the interface kit's second setting beside the theme
 * (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.1 and §3.2). Glass, the canvases', is the one look
 * since Classic, the app as it was drawn before, retired on 2 October 2026 (the plan's step 5.7): a device that kept
 * Classic is a device that kept a look this build no longer knows, and wears the default. The setting stays as the
 * theme's twin for the next look: kept on this device in the same stored object, stamped as `data-look` beside
 * `data-theme` before first paint (themeBootScript) and on every change, and chosen in the account menu once there
 * are two to choose from (LOOK_OFFERED). It is kept only once chosen, so a device that never chose follows
 * DEFAULT_LOOK_PREF wherever the default goes; nothing resolves it from the device, so the look in force is lookPrefOf
 * of what is kept.
 */
export type LookPref = "glass";

export const LOOK_OPTIONS: ReadonlyArray<{ id: LookPref; label: string }> = [{ id: "glass", label: "Glass" }];

export const isLookPref = (value: unknown): value is LookPref => value === "glass";

/** The look of a device that has chosen nothing, or holds one this build no longer knows (Classic, retired): Glass. */
export const DEFAULT_LOOK_PREF: LookPref = "glass";

/** A device's stored look as the app keeps it: anything unknown is the default. */
export const lookPrefOf = (stored: unknown): LookPref => (isLookPref(stored) ? stored : DEFAULT_LOOK_PREF);

/**
 * Whether the account menu offers the look to members: not while there is one look (Classic retired, the plan's step
 * 5.7); it did from step 5.5 to then. A second look turns it on again.
 */
export const LOOK_OFFERED: boolean = false;

/** Where this device keeps its preferences, the theme and the look among them (bridge/device-prefs.ts). */
export const DEVICE_PREFS_STORAGE = "chanlytics-os-prefs";

/**
 * Each look's paper per theme (tokens.css --bg, as sRGB): what the browser paints its own bars with, so the bars match
 * the page whichever look it wears. The phone's address bar and the tab strip are chrome the page does not draw but
 * does own, and a bar in the other theme's paper reads as a strip of somebody else's app above this one.
 */
export const LOOK_THEME_COLORS: Readonly<Record<LookPref, Readonly<Record<Theme, string>>>> = {
  glass: { light: "#f1f2f6", dark: "#0f1014" },
};

/**
 * The default look's paper per theme: what a document that has run no script keeps (layout.tsx, the manifest), and
 * what the native shell paints its own screens with, beside the page.
 */
export const THEME_COLORS: Readonly<Record<Theme, string>> = LOOK_THEME_COLORS[DEFAULT_LOOK_PREF];

/**
 * The ink on that paper, per look and theme (tokens.css --ink, as sRGB): what the native shell draws its own words and
 * tab labels with, beside the page. The two pairs are the shell's whole palette; the page's other tones stay the page's.
 */
const LOOK_THEME_INK: Readonly<Record<LookPref, Readonly<Record<Theme, string>>>> = {
  glass: { light: "#1b1c20", dark: "#f4f4f6" },
};

/** The default look's ink per theme. */
export const THEME_INK: Readonly<Record<Theme, string>> = LOOK_THEME_INK[DEFAULT_LOOK_PREF];

/** The bars' colour for a resolved theme, in a look; anything else is the app's own, as the document's markup says. */
export function themeColorOf(theme: unknown, look: unknown = DEFAULT_LOOK_PREF): string {
  return LOOK_THEME_COLORS[lookPrefOf(look)][theme === "light" ? "light" : "dark"];
}

/**
 * Where the bars' colour is written. Every match, not the first: React plants a second copy of the meta during
 * hydration whenever the boot script has already changed the one the markup shipped (measured 22 Sep 2026, a light
 * workspace on a dark phone: #fbfaf8 in front and a stale #0c0d0f behind it). A browser reads the first, so the
 * bars were right either way, but a second answer to the same question is one an insertion order can promote.
 */
export const THEME_COLOR_META = 'meta[name="theme-color"]';

/**
 * The theme before first paint: a script for the document's head, run before anything is drawn. The document used
 * to come down with data-theme="dark" hard-coded and be corrected in an effect after the bundle had mounted, so a
 * light-theme workspace opened dark and flipped on every refresh. This is themePrefOf then resolveTheme, spelled once
 * more where an import cannot reach; theme-boot.test.mjs runs it against them for everything a device could hold
 * and both device settings. A storage that refuses or a window with no matchMedia stamps the app's own theme.
 *
 * It paints the browser's bars from the same theme, for the same reason. theme-color was declared against
 * (prefers-color-scheme), which is the DEVICE's setting and not the app's: a member whose app is light on a dark
 * phone got a black strip over a white page for as long as the two disagreed, and nothing ever corrected it. The
 * bars follow the theme the page resolved, here and in the app (paintThemeColor); the meta the markup shipped is
 * what a device running no script keeps, which is the theme that document also keeps. The attribute is stamped
 * before any meta is touched, so a document that somehow has no head still paints in the right theme.
 *
 * The look rides with the theme: the same stored object's `look`, as lookPrefOf reads it, stamped as data-look beside
 * data-theme, so a `[data-look]` rule holds from the first frame rather than from the mount. Each is read on its own:
 * a value one of them does not know leaves the other standing.
 */
export function themeBootScript(): string {
  const known = JSON.stringify(THEME_OPTIONS.map((o) => o.id));
  const looks = JSON.stringify(LOOK_OPTIONS.map((o) => o.id));
  return [
    "try{",
    `var p=${JSON.stringify(DEFAULT_THEME_PREF)},k=${JSON.stringify(DEFAULT_LOOK_PREF)};`,
    `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(DEVICE_PREFS_STORAGE)})||"{}");`,
    `if(s&&${known}.indexOf(s.theme)>=0)p=s.theme;`,
    `if(s&&${looks}.indexOf(s.look)>=0)k=s.look}catch(e){}`,
    'var d=!!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);',
    'var t=p==="system"?(d?"dark":"light"):p;',
    "document.documentElement.dataset.theme=t;",
    "document.documentElement.dataset.look=k;",
    `var l=document.querySelectorAll(${JSON.stringify(THEME_COLOR_META)});`,
    'if(!l.length){var m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m);l=[m]}',
    `for(var i=0;i<l.length;i++)l[i].setAttribute("content",${JSON.stringify(LOOK_THEME_COLORS)}[k][t]);`,
    "}catch(e){}",
  ].join("");
}
