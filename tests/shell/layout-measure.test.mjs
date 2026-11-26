/**
 * How wide a surface is allowed to be, and who owns the space between things.
 *
 * There was no token for either, so every surface invented its own answer:
 * 720px on a settings card and the Today brief, 1160px on Templates and
 * Broadcasts, 1480px on Today's grid — and NOTHING on the Setup rows, which is
 * why that one list ran to the pane edge while the two cards above and below it
 * stopped at 720, and why the mismatch got worse the wider the monitor.
 *
 * The same shape of bug inside the Inbox thread: three children carried the
 * pane's gutter themselves and every other child carried none, so a bordered
 * alert sat flush against the dividers this pane shares with the thread list
 * and the agent rail — a rounded red card with its corners cut off by two
 * hairlines.
 *
 * These are contracts because both defects are invisible in a diff and obvious
 * on a wide screen. The file has since collected the rest of that family: a
 * presentation rule every call site has to REMEMBER is a rule half of them
 * will not, so each one here is a default with the exceptions named.
 *
 * Each is asked of the stylesheets the frame links, run as a browser runs them (tests/_css.mjs cascadeOf): what an
 * element is drawn with, on a desk and on a phone, never a slice of a stylesheet's text, which a later rule, a media
 * query or a class the page no longer draws would pass over. Until 26 Nov 2026 these sliced mobile.css,
 * components.css, settings.css, inbox.css and tokens.css.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { PHONE, cascadeOf, element, frameSheets } from "../_css.mjs";

const STYLES = path.join(ROOT, "apps/dashboard/src/styles");
const sheets = fs.readdirSync(STYLES).filter((f) => f.endsWith(".css"));

// The document as the frame stamps it (bridge/device-prefs.ts documentStamps): the tokens are its theme's.
const DOC = 'html[data-theme="light"]';
const desk = cascadeOf(frameSheets());
const phone = cascadeOf(frameSheets(), PHONE);
const at = (...parts) => element(DOC, ...parts);

test("the shell is as tall as the phone shows, not as tall as it could show: 100dvh, with 100vh in front of it", () => {
  // On iOS Safari (and Chrome on Android) 100vh is the LARGEST viewport, the one with the browser's toolbar tucked
  // away; with the toolbar showing, the visible page is about 50px shorter. The shell is one 100vh box that never
  // scrolls, its tab bar is fixed to the visible bottom, and the room every page keeps under the bar (.main-scroll's
  // padding) was the part pushed below the visible edge: on the salon's phone the thread's reply box, Today's last
  // card and every page's foot ended behind the tab bar (22 Sep). dvh is the visible height. Chrome's viewport is
  // one size, so the browser cannot show this; the cascade can: a browser that reads dvh draws with it, and one that
  // does not keeps the 100vh written before it.
  const tablet = { ...PHONE, width: 800 };
  for (const [name, where] of [
    ["a desk", {}],
    ["a tablet", tablet],
  ]) {
    const seen = cascadeOf(frameSheets(), where);
    const noDvh = cascadeOf(frameSheets(), { ...where, unsupported: ["dvh"] });
    for (const root of [".app-root", ".app", ".shared-root"]) {
      assert.equal(seen.style(at(root)).height, "100dvh", `${name}, ${root}: the visible height`);
      assert.equal(noDvh.style(at(root)).height, "100vh", `${name}, ${root}: 100vh for a browser without dvh`);
    }
  }
  // Up to 720px the document is as long as the page and the window is its scroller (mobile.css, 21 Oct 2026): at least
  // the screen at its largest, so even a short page scrolls by the toolbar's height and Safari tucks the toolbar away.
  const shell = phone.style(at(".app-root"));
  assert.deepEqual([shell.height, shell["min-height"]], ["auto", "100lvh"], "a phone's shell grows with its page");
  assert.equal(
    cascadeOf(frameSheets(), { ...PHONE, unsupported: ["lvh"] }).style(at(".app-root"))["min-height"],
    "100vh",
    "100vh for a browser without lvh",
  );
  // The room under the bar, which dvh keeps on screen: the boards' tab bar floats 14px above the bottom (--bar-foot:
  // nearer the edge than the phone's own inset where that is more) and stands 62px tall with its capsule, so the page
  // keeps 76px over that (mobile.css). It is said once, as --page-foot: a page that scrolls inside a pane hands it to
  // that scroller, so its list runs under the bar as Today's does, and ends clear of it (7 Oct 2026).
  const barFoot = "max(14px, calc(env(safe-area-inset-bottom, 0px) - 13px))";
  const scroll = phone.style(at(".app-root", ".main", ".main-scroll"));
  assert.equal(scroll["--page-foot"], `calc(${barFoot} + 76px)`);
  assert.equal(scroll["padding-bottom"], scroll["--page-foot"], "the room under every page is the bar's");
  assert.equal(desk.style(at(".app-root", ".main", ".main-scroll"))["padding-bottom"], undefined, "a desk keeps none");
});

test("the measures are tokens, and every page takes one of them", () => {
  const root = desk.style(element(DOC));
  assert.deepEqual(
    ["--measure-prose", "--measure-page", "--measure-wide", "--gutter-page"].map((t) => root[t]),
    ["720px", "1160px", "1480px", "28px"],
    "the document holds each measure",
  );

  // Nothing outside tokens.css may hard-code a page-sized max-width again. The
  // numbers listed here are the ones that were literals before; a new surface
  // that wants one of these widths takes the token, and a surface that wants a
  // different width is a design decision, not a paste.
  // A DECLARATION, not a breakpoint: `@media (max-width: 720px)` is a phone
  // rule and has nothing to do with how wide a page is allowed to be.
  const PAGE_SIZED = /max-width: *(720|1160|1480)px *[;}]/;
  for (const f of sheets) {
    if (f === "tokens.css") continue;
    const css = fs.readFileSync(path.join(STYLES, f), "utf8");
    css.split("\n").forEach((line, i) => {
      if (line.includes("@media")) return;
      if (PAGE_SIZED.test(line))
        assert.fail(`${f}:${i + 1} hard-codes a page measure — use var(--measure-*): ${line.trim()}`);
    });
  }
});

test("Setup shares the settings column with the cards above and below it", () => {
  // The rows had no measure at all. Measured in the browser before capping
  // them: not one row's sentence or status line clips at 720, so the space
  // they were taking was empty — the fix loses no words.
  const card = desk.style(at(".settings", ".set-card"))["max-width"];
  assert.equal(card, "720px", "a settings card stops at the prose measure");
  assert.equal(
    desk.style(at(".settings", ".setup-rows"))["max-width"],
    card,
    "the cards and the Setup rows are one column, not two widths on one page",
  );
  const wider = cascadeOf([...frameSheets(), { css: ":root:root[data-theme] { --measure-prose: 777px; }" }]);
  for (const part of [".set-card", ".setup-rows"])
    assert.equal(wider.style(at(".settings", part))["max-width"], "777px", `${part} takes the prose measure`);

  // A Setup row prints its sentence WHOLE, at every width, and always did.
  // Today's queue rows now clamp to two lines, which needs display:-webkit-box
  // -- and these would have inherited the ceiling with it.
  const sentence = (where) => where.style(at(".settings", ".setup-rows", ".cl-attn-row", ".cl-attn-sentence"));
  for (const [name, where] of [
    ["a desk", desk],
    ["a phone", phone],
  ]) {
    const s = sentence(where);
    assert.equal(s.display, "block", `${name}: a Setup row keeps every line it had`);
    assert.equal(s["-webkit-line-clamp"], "none", name);
    // A phone gets the sentence wrapped instead of truncated; that predates this and must survive it.
    assert.equal(s["white-space"], "normal", `${name}: a row's sentence wraps`);
  }
});

test("on a phone Settings' one column is as wide as the screen, whatever the strip of sections holds", () => {
  // A bare 1fr is minmax(auto, 1fr): Safari sized it to the strip's tabs laid end to end (775px on a 393px iPhone,
  // 4 Oct), and every pane under the strip ran off the screen. Chromium shrank it, so only a phone showed it.
  assert.equal(
    phone.style(at(".settings"))["grid-template-columns"],
    "minmax(0, 1fr)",
    "the phone's Settings column may shrink below what the strip and the panes hold",
  );
});

test("the thread pane has ONE gutter, and the pane owns it", () => {
  const pane = [".inbox", ".ix-thread-pane", ".ix-th-scroll"];
  const scroll = desk.style(at(...pane));
  assert.deepEqual(
    [scroll["padding-top"], scroll["padding-right"], scroll["padding-bottom"], scroll["padding-left"]],
    ["16px", "24px", "16px", "24px"],
    "the scroller sets the gutter",
  );
  assert.equal(scroll.gap, "12px", "and separates its children with gap, not their margins");
  assert.equal(scroll["flex-direction"], "column");

  // The children that used to re-supply it must not carry it any more, or the
  // gutter doubles on some rows and not others.
  for (const child of [".ix-summary", ".ix-approval"]) {
    const s = desk.style(at(...pane, child));
    for (const side of ["margin-left", "margin-right"])
      assert.notEqual(s[side], "24px", `${child} no longer carries the gutter as a margin`);
  }
  const timeline = desk.style(at(...pane, ".ix-timeline"));
  for (const side of ["padding-left", "padding-right"])
    assert.notEqual(timeline[side], "24px", ".ix-timeline no longer carries the gutter as padding");
});

test("the focus ring is a default, not a list of names", () => {
  // It was thirteen class names. An allowlist of focus rings decays by
  // construction: it covered 29 selectors and missed 39 real controls —
  // calendar appointments, segment rows, policy dots, every chip and inline
  // link — so a keyboard user tabbing through them saw nothing move.
  const ring = desk.style(element(DOC))["--focus-ring"];
  assert.ok(ring, "the theme names the ring");
  for (const control of [
    "button",
    "a[href]",
    "summary",
    '[role="button"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="option"]',
    'span[tabindex="0"]',
  ]) {
    assert.equal(
      desk.style(at(".app-root", `${control}:focus-visible`))["box-shadow"],
      ring,
      `${control}: everything focusable gets the ring by default, and it is the token`,
    );
  }
  assert.equal(desk.style(at(".app-root", "a"))["box-shadow"], undefined, "a link with nowhere to go is not a control");
  // :where() carries no specificity, so every component override still wins
  // without !important. That is the whole reason it is safe to add.
  const ringRule = desk
    .rules(at(".app-root", 'span[tabindex="0"]:focus-visible'))
    .find((r) => r.declarations.some((d) => d.prop === "box-shadow"));
  assert.deepEqual(ringRule.specificity, [0, 1, 0], ":where is zero-specificity by design: only :focus-visible weighs");
  assert.ok(
    ringRule.declarations.every((d) => !d.important),
    "no !important",
  );
});

// A settings control is named by the row it sits in: every switch rendered as an unlabelled role="switch", the words
// that say what it does in the left column and nothing tying the two together, so a screen reader announced "switch,
// on" all the way down Notifications. The row (surfaces/settings/autonomy/controls.tsx SetRow, decision 0015 step 11)
// mints its label's id and hands it to the control it draws; settings-words.test.mjs ("a settings control is named by
// the row it sits in") draws each row's control and reads the name off the element.

test("on a phone a thread opens by coming in from the right, over where the list stood -- transform and opacity only, and none under reduced motion", () => {
  // The list cut to a pane fading up in place read as a jolt (Ruben, 22 Sep 2026). A page on a phone comes in from
  // the side, on both pages that open the one thread. One opened from its list is pushed in over it (kit/motion/held-list.ts,
  // data-pushed; Ruben, 20 Oct 2026, "like iphone imessage"), and plays no entrance of its own: thread-in moves
  // `transform`, which an animation holds over the push's own, so the thread faded in place under it. The rule that says
  // so is one of its own after the entrance, never a `:not()` on it: that outranked the reduced-motion rule below.
  const still = cascadeOf(frameSheets(), { ...PHONE, reducedMotion: true });
  for (const page of [".inbox[data-takeover]", ".conversations[data-takeover]"]) {
    assert.match(
      phone.style(at(page, ".ix-thread-pane")).animation ?? "",
      /^thread-in \d+ms /,
      `${page}: the one motion`,
    );
    assert.equal(
      phone.style(at(page, ".ix-thread-pane[data-pushed]")).animation,
      "none",
      `${page}: a thread pushed in plays none of its own`,
    );
    assert.equal(still.style(at(page, ".ix-thread-pane")).animation, "none", `${page}: and none under reduced motion`);
    assert.doesNotMatch(
      desk.style(at(page, ".ix-thread-pane")).animation ?? "",
      /thread-in/,
      "a desk opens it in place",
    );
  }
  const frames = phone.keyframes("thread-in");
  const from = frames?.from ?? frames?.["0%"];
  assert.ok(from && /translateX\(\d+px\)/.test(from.transform) && from.opacity === "0", "from the right, faded in");
  for (const frame of Object.values(frames))
    assert.deepEqual(
      Object.keys(frame).filter((p) => !["transform", "opacity"].includes(p)),
      [],
      "never a layout property",
    );
});

test("a route on its way is an empty pane that says so after a beat, never a skeleton", () => {
  // A skeleton stood in the route view until 22 Sep 2026: the mockup's page anatomy (a title, a subtitle, a stat
  // strip, a list rail beside a detail pane), which no real page kept. Measured on production it matched nothing:
  // a 58px head strip flush at the pane's edge over all eleven pane routes, a 340px rail on the four pages that
  // have none (Calendar, Reports, Playbooks, Templates), one block and a 3x2 card grid over Today's two columns,
  // and a 220px rail beside a 155px column on a 375px phone. Every page jumped when it left. A loading state that
  // moves the page when it leaves is worse than none, so the pane stays empty and says it is reading once a beat
  // has passed (surfaces/frame/shell-chrome.tsx, the route view; shell/surfaces/status/ draws it).
  const plain = desk.rules(at("div")).length;
  for (const skel of [".skel", ".skel-line", ".skel-card"])
    assert.equal(desk.rules(at(skel)).length, plain, `no rule draws ${skel}`);
  const reading = desk.style(at(".app-root", ".route-reading"));
  const delay = / (\d+)ms both$/.exec(reading.animation ?? "");
  assert.ok(
    delay && Number(delay[1]) >= 400,
    "the words wait a beat (fill-mode both holds them back until then), so a surface that lands fast is never said",
  );
  assert.equal(
    phone.style(at(".app-root", ".route-reading")).padding,
    "12px 16px",
    "on a phone the line sits at the 16px gutter, where every page's first line sits",
  );

  // The rails themselves: eight literals for one structural element, of which
  // these four agreed already and now say so. Taking the token is what follows it: the rails moved, each page moves.
  const root = desk.style(element(DOC));
  assert.deepEqual([root["--rail-nav"], root["--rail-list"]], ["220px", "360px"], "the two kinds of rail are named");
  const moved = cascadeOf([
    ...frameSheets(),
    { css: ":root:root[data-theme] { --rail-nav: 301px; --rail-list: 402px; }" },
  ]);
  for (const page of [".settings", ".clients"]) {
    assert.equal(desk.style(at(page))["grid-template-columns"], "220px minmax(0, 1fr)", page);
    assert.equal(moved.style(at(page))["grid-template-columns"], "301px minmax(0, 1fr)", `${page} takes the nav rail`);
  }
  for (const page of [".inbox", ".conversations"]) {
    assert.equal(desk.style(at(page))["grid-template-columns"], "360px minmax(0, 1fr)", page);
    assert.equal(moved.style(at(page))["grid-template-columns"], "402px minmax(0, 1fr)", `${page} takes the list rail`);
  }
});

test("digits in a column line up without being asked", () => {
  // `.tbl .num` was opt-in and forty-one money cells in Reports had not opted
  // in, so figures a reader is there to COMPARE sat on proportional digits and
  // the column edges wandered. Measured after: 66 numeric cells across four
  // surfaces, none proportional.
  for (const cell of ["th", "td"])
    assert.equal(
      desk.style(at("table.cl-table", "tr", cell))["font-variant-numeric"],
      "tabular-nums",
      `${cell}: the cell decides, not the call site`,
    );
  assert.equal(
    desk.style(at("table.tbl", "tr", "td.num"))["font-variant-numeric"],
    undefined,
    "and the opt-in rule it replaced is gone, not left to imply a choice",
  );
});
