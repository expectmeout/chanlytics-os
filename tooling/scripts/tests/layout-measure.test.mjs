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
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readRaw } from "./_source.mjs";

const STYLES = path.join(ROOT, "apps/dashboard/src/legacy/styles");
const sheets = fs.readdirSync(STYLES).filter((f) => f.endsWith(".css"));
// Read once for the tests below: the ratchet counts reads, and a phone rule is proven in the browser, pinned here.
const MOBILE = readRaw("apps/dashboard/src/legacy/styles/mobile.css");
const COMPONENTS = readRaw("apps/dashboard/src/legacy/styles/components.css");

test("the shell is as tall as the phone shows, not as tall as it could show: 100dvh, with 100vh in front of it", () => {
  // On iOS Safari (and Chrome on Android) 100vh is the LARGEST viewport, the one with the browser's toolbar tucked
  // away; with the toolbar showing, the visible page is about 50px shorter. The shell is one 100vh box that never
  // scrolls, its tab bar is fixed to the visible bottom, and the room every page keeps under the bar (.main-scroll's
  // padding) was the part pushed below the visible edge: on the salon's phone the thread's reply box, Today's last
  // card and every page's foot ended behind the tab bar (22 Sep). dvh is the visible height. Chrome's viewport is
  // one size, so the browser cannot show this; the rule is pinned.
  for (const root of [".app-root", ".app", ".shared-root"]) {
    const rule = COMPONENTS.match(new RegExp(`\\${root} \\{[^}]*\\}`));
    assert.ok(rule, `${root} has a rule`);
    assert.match(rule[0], /height: 100vh;\s*height: 100dvh;/, `${root}: 100vh for a browser without dvh, then 100dvh`);
  }
  // The room under the bar, which dvh keeps on screen: the bar is 6 + 44 + 6px and a hairline over the safe area.
  assert.match(MOBILE, /\.main-scroll \{ padding-bottom: calc\(64px \+ env\(safe-area-inset-bottom\)\); \}/);
});

test("the measures are tokens, and every page takes one of them", () => {
  const tokens = readRaw("apps/dashboard/src/legacy/styles/tokens.css");
  for (const t of [
    "--measure-prose: 720px",
    "--measure-page: 1160px",
    "--measure-wide: 1480px",
    "--gutter-page: 28px",
  ]) {
    assert.ok(tokens.includes(t), `tokens.css defines ${t}`);
  }

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
  const settings = readRaw("apps/dashboard/src/legacy/styles/settings.css");
  assert.match(
    settings,
    /\.set-card, \.setup-rows \{ max-width: var\(--measure-prose\); \}/,
    "the cards and the Setup rows are one column, not two widths on one page",
  );

  // A Setup row prints its sentence WHOLE, at every width, and always did.
  // Today's queue rows now clamp to two lines, which needs display:-webkit-box
  // -- and these would have inherited the ceiling with it.
  assert.match(
    settings,
    /.setup-rows .cl-attn-sentence {[^}]*display: block; -webkit-line-clamp: none; }/,
    "a Setup row keeps every line it had",
  );

  // A phone gets the sentence wrapped instead of truncated; that predates this
  // and must survive it.
  assert.ok(
    MOBILE.includes(".setup-rows .cl-attn-sentence { white-space: normal; }"),
    "a row's sentence still wraps on a phone",
  );
});

test("the thread pane has ONE gutter, and the pane owns it", () => {
  const inbox = readRaw("apps/dashboard/src/legacy/styles/inbox.css");
  const scroll = inbox.slice(inbox.indexOf(".ix-th-scroll {"), inbox.indexOf(".ix-th-scroll::-webkit-scrollbar"));
  assert.ok(scroll.includes("padding: 12px 24px;"), "the scroller sets the gutter");
  assert.ok(
    scroll.includes("gap: 12px;") && scroll.includes("flex-direction: column;"),
    "and separates its children with gap, not their margins",
  );

  // The children that used to re-supply it must not carry it any more, or the
  // gutter doubles on some rows and not others.
  const block = (sel) => {
    const at = inbox.indexOf(sel);
    assert.ok(at > -1, `${sel} exists`);
    return inbox.slice(at, inbox.indexOf("}", at));
  };
  assert.ok(
    !/margin: *\d+px +24px/.test(block(".ix-summary {")),
    ".ix-summary no longer carries the gutter as a margin",
  );
  assert.ok(
    !/margin: *\d+px +24px/.test(block(".ix-approval {")),
    ".ix-approval no longer carries the gutter as a margin",
  );
  assert.ok(
    !/padding: *\d+px +24px/.test(block(".ix-timeline {")),
    ".ix-timeline no longer carries the gutter as padding",
  );
});

test("the focus ring is a default, not a list of names", () => {
  // It was thirteen class names. An allowlist of focus rings decays by
  // construction: it covered 29 selectors and missed 39 real controls —
  // calendar appointments, segment rows, policy dots, every chip and inline
  // link — so a keyboard user tabbing through them saw nothing move.
  const components = COMPONENTS;
  assert.match(
    components,
    /:where\(button, a\[href\], summary, \[role="button"\], \[role="switch"\], \[role="tab"\],\s*\[role="option"\], \[tabindex="0"\]\):focus-visible \{/,
    "everything focusable gets the ring by default",
  );
  assert.ok(components.includes("box-shadow: var(--focus-ring)"), "and it is the token, not a literal");
  // :where() carries no specificity, so every component override still wins
  // without !important. That is the whole reason it is safe to add.
  assert.ok(
    !/:where\([^)]*\):focus-visible \{[^}]*!important/.test(components),
    "no !important — :where is zero-specificity by design",
  );
});

test("a settings control is named by the row it sits in", () => {
  // Every switch rendered as an unlabelled role="switch": the words that say
  // what it does live in the left column and nothing tied the two together, so
  // a screen reader announced "switch, on" all the way down Notifications.
  const settings = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(settings.includes("React.useId()"), "the row mints an id for its label");
  assert.ok(settings.includes('aria-labelledby": labelId'), "and hands it to the control");
  assert.ok(
    settings.includes('!kid.props["aria-label"] && !kid.props["aria-labelledby"]'),
    "a control that brings its own name keeps it",
  );
  // The controls have to forward it or the name never lands on the element.
  assert.ok(/const SetToggle = \(\{ on, onChange, \.\.\.rest \}\)/.test(settings), "SetToggle forwards it");
  assert.ok(/const SetSeg = \(\{ value, options, onChange, \.\.\.rest \}\)/.test(settings), "SetSeg forwards it");
});

test("on a phone a thread opens by coming in from the right, over where the list stood -- transform and opacity only, and none under reduced motion", () => {
  // The list cut to a pane fading up in place read as a jolt (Ruben, 22 Sep 2026). A page on a phone comes in from
  // the side, on both pages that open the one thread.
  const mobile = MOBILE;
  assert.match(
    mobile,
    /\.inbox\.phone-thread \.ix-thread-pane, \.conversations\.phone-detail \.ix-thread-pane \{ animation: thread-in \d+ms var\(--ease-out\); \}/,
    "both pages' threads, the one motion",
  );
  const frames = mobile.match(/@keyframes thread-in \{([^}]*)\}/);
  assert.ok(
    frames && /translateX\(\d+px\)/.test(frames[1]) && /opacity: 0/.test(frames[1]),
    "from the right, faded in",
  );
  assert.ok(!/(width|height|top|left):/.test(frames[1]), "never a layout property");
  assert.match(
    mobile,
    /prefers-reduced-motion: reduce\) \{ \.inbox\.phone-thread \.ix-thread-pane, \.conversations\.phone-detail \.ix-thread-pane \{ animation: none; \} \}/,
    "and none under reduced motion",
  );
});

test("a route on its way is an empty pane that says so after a beat, never a skeleton", () => {
  // A skeleton stood in the route view until 22 Sep 2026: the mockup's page anatomy (a title, a subtitle, a stat
  // strip, a list rail beside a detail pane), which no real page kept. Measured on production it matched nothing:
  // a 58px head strip flush at the pane's edge over all eleven pane routes, a 340px rail on the four pages that
  // have none (Calendar, Reports, Playbooks, Templates), one block and a 3x2 card grid over Today's two columns,
  // and a 220px rail beside a 155px column on a 375px phone. Every page jumped when it left. A loading state that
  // moves the page when it leaves is worse than none, so the pane stays empty and says it is reading once a beat
  // has passed (app-shell.jsx, the route view; shell-status.test.mjs draws it).
  const components = COMPONENTS;
  assert.doesNotMatch(components, /\.skel\b|skel-/, "no skeleton rules");
  const reading = components.match(/\.route-reading \{[^}]*\}/);
  assert.ok(reading, "the reading line has a rule");
  const delay = reading[0].match(/animation:[^;]*?\s(\d+)ms both/);
  assert.ok(
    delay && Number(delay[1]) >= 400,
    "the words wait a beat (fill-mode both holds them back until then), so a surface that lands fast is never said",
  );
  assert.match(
    components,
    /@media \(max-width: 900px\) \{ \.route-reading \{ padding: 12px 16px; \} \}/,
    "on a phone the line sits at the 16px gutter, where every page's first line sits",
  );

  // The rails themselves: eight literals for one structural element, of which
  // these four agreed already and now say so.
  const tokens = readRaw("apps/dashboard/src/legacy/styles/tokens.css");
  assert.ok(
    tokens.includes("--rail-nav: 220px") && tokens.includes("--rail-list: 340px"),
    "the two kinds of rail are named",
  );
  for (const [file, sel] of [
    ["settings.css", ".settings"],
    ["clients.css", ".clients"],
  ]) {
    assert.match(
      readRaw(`apps/dashboard/src/legacy/styles/${file}`),
      /grid-template-columns: var\(--rail-nav\) minmax\(0, 1fr\);/,
      `${sel} takes the nav rail`,
    );
  }
  for (const file of ["inbox.css", "conversations.css"]) {
    assert.match(
      readRaw(`apps/dashboard/src/legacy/styles/${file}`),
      /grid-template-columns: var\(--rail-list\) minmax\(0, 1fr\)/,
      `${file} takes the list rail`,
    );
  }
});

test("digits in a column line up without being asked", () => {
  // `.tbl .num` was opt-in and forty-one money cells in Reports had not opted
  // in, so figures a reader is there to COMPARE sat on proportional digits and
  // the column edges wandered. Measured after: 66 numeric cells across four
  // surfaces, none proportional.
  const components = COMPONENTS;
  assert.match(
    components,
    /\.tbl th, \.tbl td, \.cl-table th, \.cl-table td \{ font-variant-numeric: tabular-nums; \}/,
    "the cell decides, not the call site",
  );
  assert.ok(
    !/\.tbl \.num \{ font-variant-numeric/.test(components),
    "and the opt-in rule it replaced is gone, not left to imply a choice",
  );
});
