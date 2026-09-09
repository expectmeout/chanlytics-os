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
 * on a wide screen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readRaw } from "./_source.mjs";

const STYLES = path.join(ROOT, "apps/dashboard/src/legacy/styles");
const sheets = fs.readdirSync(STYLES).filter((f) => f.endsWith(".css"));

test("the measures are tokens, and every page takes one of them", () => {
  const tokens = readRaw("apps/dashboard/src/legacy/styles/tokens.css");
  for (const t of ["--measure-prose: 720px", "--measure-page: 1160px", "--measure-wide: 1480px", "--gutter-page: 28px"]) {
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
      if (PAGE_SIZED.test(line)) assert.fail(`${f}:${i + 1} hard-codes a page measure — use var(--measure-*): ${line.trim()}`);
    });
  }
});

test("Setup shares the settings column with the cards above and below it", () => {
  // The rows had no measure at all. Measured in the browser before capping
  // them: not one row's sentence or status line clips at 720, so the space
  // they were taking was empty — the fix loses no words.
  const settings = readRaw("apps/dashboard/src/legacy/styles/settings.css");
  assert.match(settings, /\.set-card, \.setup-rows \{ max-width: var\(--measure-prose\); \}/,
    "the cards and the Setup rows are one column, not two widths on one page");

  // A phone gets the sentence wrapped instead of truncated; that predates this
  // and must survive it.
  assert.ok(
    readRaw("apps/dashboard/src/legacy/styles/mobile.css").includes(".setup-rows .cl-attn-sentence { white-space: normal; }"),
    "a row's sentence still wraps on a phone",
  );
});

test("the thread pane has ONE gutter, and the pane owns it", () => {
  const inbox = readRaw("apps/dashboard/src/legacy/styles/inbox.css");
  const scroll = inbox.slice(inbox.indexOf(".ix-th-scroll {"), inbox.indexOf(".ix-th-scroll::-webkit-scrollbar"));
  assert.ok(scroll.includes("padding: 12px 24px;"), "the scroller sets the gutter");
  assert.ok(scroll.includes("gap: 12px;") && scroll.includes("flex-direction: column;"), "and separates its children with gap, not their margins");

  // The children that used to re-supply it must not carry it any more, or the
  // gutter doubles on some rows and not others.
  const block = (sel) => {
    const at = inbox.indexOf(sel);
    assert.ok(at > -1, `${sel} exists`);
    return inbox.slice(at, inbox.indexOf("}", at));
  };
  assert.ok(!/margin: *\d+px +24px/.test(block(".ix-summary {")), ".ix-summary no longer carries the gutter as a margin");
  assert.ok(!/margin: *\d+px +24px/.test(block(".ix-approval {")), ".ix-approval no longer carries the gutter as a margin");
  assert.ok(!/padding: *\d+px +24px/.test(block(".ix-timeline {")), ".ix-timeline no longer carries the gutter as padding");
});

test("the focus ring is a default, not a list of names", () => {
  // It was thirteen class names. An allowlist of focus rings decays by
  // construction: it covered 29 selectors and missed 39 real controls —
  // calendar appointments, segment rows, policy dots, every chip and inline
  // link — so a keyboard user tabbing through them saw nothing move.
  const components = readRaw("apps/dashboard/src/legacy/styles/components.css");
  assert.match(components, /:where\(button, a\[href\], summary, \[role="button"\], \[role="switch"\], \[role="tab"\],\s*\[role="option"\], \[tabindex="0"\]\):focus-visible \{/,
    "everything focusable gets the ring by default");
  assert.ok(components.includes("box-shadow: var(--focus-ring)"), "and it is the token, not a literal");
  // :where() carries no specificity, so every component override still wins
  // without !important. That is the whole reason it is safe to add.
  assert.ok(!/:where\([^)]*\):focus-visible \{[^}]*!important/.test(components), "no !important — :where is zero-specificity by design");
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
