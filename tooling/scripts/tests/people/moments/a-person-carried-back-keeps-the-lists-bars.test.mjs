/**
 * A person's page carried back to People by a thumb leaves the screen under it as People's: the tab bar and Ask's circle
 * stand there all the way, and nothing of the person's foot comes up as the page goes (Ruben, 20 Oct 2026: "on swipe back
 * it flickers").
 *
 * A person's page watches its head: once the head's acts have scrolled away, the same acts come up docked at the foot
 * (hero.tsx PhoneDock), and a dock takes the tab bar and Ask's circle down (mobile.css, ask.css); once the name is under the
 * bar, the bar says it (useNameAway). The page carried across took its head off the screen at the side, which both watchers
 * read as scrolled away: the dock came up as the page went and the bars went down under it, then came back as People
 * landed. Now only a head gone up past the top is away, and while a page is carried back (data-carrying, kit/motion/
 * held-list.ts) a dock is that page's own, which the bars under it, People's, know nothing of. And both watchers watch
 * the page's own head: a step to the person before or after leaves a still copy of the last page in the document.
 *
 * Run against the two watchers themselves, on the stub React the page tests use, handed what an IntersectionObserver
 * reports; and against the stylesheets' syntax trees.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transform } from "lightningcss";
import { ROOT } from "../../_source.mjs";
import { again, fresh, installLegacyReact } from "../../_legacy-react.mjs";

installLegacyReact();
const fromDashboard = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../../apps/dashboard/src/legacy-bridge/_.js"),
);
const react = fromDashboard("react");
const { useNameAway, PhoneDock } = fromDashboard("../surfaces/people/person/hero.tsx");

/** Each IntersectionObserver made, with what it watches: the test reports to it as a browser would. */
const watchers = [];
globalThis.IntersectionObserver = class {
  constructor(report, options) {
    this.report = report;
    this.options = options;
    watchers.push(this);
  }
  observe(el) {
    this.el = el;
  }
  disconnect() {}
};
/** The head's name and its acts, as the watchers find them inside the page's own element. */
const head = { name: "head" };
const ofTheHead = (sel) => (/cl-prof-name-line|person-acts/.test(sel) ? head : null);
const page = { current: { querySelector: ofTheHead } };
/**
 * The page a step (‹ ›) leaves, put back before the one arriving as a still copy with every class (view-deck.ts adopt):
 * the first the document finds, so a watcher that asked the document watched it until it went, and the bar never named
 * the person stepped to (Ruben, 23 Oct 2026).
 */
const leaving = { name: "the leaving page's head" };
const queried = globalThis.document.querySelector;
globalThis.document.querySelector = (sel) =>
  /cl-prof-name-line|person-acts/.test(sel) ? leaving : queried ? queried.call(globalThis.document, sel) : null;

/** What a watcher is told: the head off the screen at the side (a page carried across), gone up past the top, back. */
const ACROSS = {
  isIntersecting: false,
  boundingClientRect: { top: 120, bottom: 180 },
  rootBounds: { top: 44, bottom: 844 },
};
const UP = {
  isIntersecting: false,
  boundingClientRect: { top: -20, bottom: 40 },
  rootBounds: { top: 44, bottom: 844 },
};
const BACK = {
  isIntersecting: true,
  boundingClientRect: { top: 120, bottom: 180 },
  rootBounds: { top: 44, bottom: 844 },
};

test("the bar names the person only once the name has gone up under it, never as the page is carried across", () => {
  fresh();
  watchers.length = 0;
  const away = () => again(() => useNameAway(true, true, page));
  assert.equal(away(), false);
  const watcher = watchers.at(-1);
  assert.equal(watcher.el, head, "the page's own name is watched, never the leaving page's");
  watcher.report([ACROSS]);
  assert.equal(away(), false, "carried across, the name is not under the bar");
  watcher.report([UP]);
  assert.equal(away(), true, "scrolled up under the bar, it is");
  watcher.report([BACK]);
  assert.equal(away(), false);
});

test("the dock comes up only once the head's acts have scrolled away up, never as the page is carried across", () => {
  fresh();
  watchers.length = 0;
  // What the dock is told to be, as its watcher says: the setter its draw handed out, heard.
  const told = [];
  const useState = react.useState;
  react.useState = (init) => {
    const [value, set] = useState(init);
    return [value, (v) => (told.push(v), set(v))];
  };
  try {
    assert.equal(
      again(() => PhoneDock({ c: { phone: true, page } })),
      null,
    );
  } finally {
    react.useState = useState;
  }
  const watcher = watchers.at(-1);
  assert.equal(watcher.el, head, "the page's own acts are watched, never the leaving page's");
  watcher.report([ACROSS]);
  watcher.report([UP]);
  watcher.report([BACK]);
  assert.deepEqual(told, [false, true, false], "across: no dock; up: the dock; back on screen: none");
});

/** Each style rule of a sheet, its selectors as the parser reads them. */
const rulesOf = (sheet) => {
  const rules = [];
  const { warnings } = transform({
    filename: sheet,
    code: fs.readFileSync(path.join(ROOT, sheet)),
    errorRecovery: true,
    visitor: {
      Rule: {
        style(rule) {
          rules.push(rule.value);
        },
      },
    },
  });
  assert.deepEqual(warnings, [], `${sheet} is read whole`);
  return rules;
};

test("no dock takes the tab bar or Ask's circle down under a page carried back to its list", () => {
  for (const [sheet, bar] of [
    ["apps/dashboard/src/legacy/styles/mobile.css", "phone-places"],
    ["apps/dashboard/src/legacy/styles/ask.css", "phone-ask"],
  ]) {
    let hides = 0;
    for (const rule of rulesOf(sheet)) {
      const takesDown = (rule.declarations.declarations ?? []).some((d) => /^(visibility|opacity)$/.test(d.property));
      if (!takesDown) continue;
      for (const selector of rule.selectors) {
        const s = JSON.stringify(selector);
        if (!s.includes('"name":"data-dock"') || !s.includes(`"name":"${bar}"`)) continue;
        hides += 1;
        assert.ok(s.includes('"name":"data-carrying"'), `${sheet}: a dock takes .${bar} down under a carried page`);
      }
    }
    assert.ok(hides > 0, `${sheet} still takes .${bar} down for a dock: this test would otherwise prove nothing`);
  }
});
