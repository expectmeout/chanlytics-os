/**
 * A touch under a strip picks one axis and keeps it. The reader (data-bits `touchSwipe`) chooses at 8px: mostly down,
 * a scroll and the page never moves; else the page walks its strip. The browser was told nothing of that choice, so its
 * own vertical scroll ran on under a page already moving sideways, and a thumb could carry Reports in circles (Ruben's
 * recording, 9 Oct 2026). `touch-action` is read on the element that scrolls, between the finger and it, so each strip
 * page's phone scroller says `pan-y` (components.css): a touch that began across never scrolls it, as a phone's own
 * pagers hold their axis. One scroller a page, found on the dev app at 375px; a sixth page under a strip adds its own.
 *
 * Read from the sheet's syntax tree (lightningcss, the build's own parser), as touch-hover.test.mjs reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { ROOT } from "../_source.mjs";

const SHEET = "apps/dashboard/src/legacy/styles/components.css";
/** The element that scrolls under each strip on a phone: Reports, the Inbox, Conversations, People, Settings. */
const SCROLLERS = ["rpt-body", "ix-threads", "cv-rows", "cl-main-scroll", "set-pane"];
/** Where a finger walks a strip: a page of one column (tokens.css 720px; People's rows to 900px). */
const PHONE_MAX = 900;

function parse(sheet) {
  let parsed = null;
  const { warnings } = transform({
    filename: sheet,
    code: fs.readFileSync(path.join(ROOT, sheet)),
    errorRecovery: true,
    visitor: {
      StyleSheet(s) {
        parsed = s;
      },
    },
  });
  assert.deepEqual(warnings, [], `${sheet} is read whole`);
  assert.ok(parsed, "a stylesheet");
  return parsed;
}

/** The `max-width` a media query asks for, in px (the parser reads it as `width <= N`), or null where it asks for none. */
function maxWidthOf(query) {
  for (const q of query.mediaQueries) {
    const text = JSON.stringify(q.condition ?? null);
    const m = /"name":"width","operator":"less-than-equal".*?"unit":"px","value":(\d+)/.exec(text);
    if (m) return Number(m[1]);
  }
  return null;
}

/** The classes a selector list names in its last compound (the element the rule styles), one per selector. */
function styledClasses(selectors) {
  const named = new Set();
  for (const selector of selectors) {
    let compound = [];
    for (const c of selector) {
      if (c.type === "combinator") compound = [];
      else compound.push(c);
    }
    for (const p of compound) {
      if (p.type === "class") named.add(p.name);
      // `:is(.a, .b)` names each of its own.
      if (p.type === "pseudo-class" && p.kind === "is")
        for (const inner of styledClasses(p.selectors)) named.add(inner);
    }
  }
  return named;
}

/** The words of a `touch-action` declaration, or null where the rule has none. */
function touchActionOf(declarations) {
  for (const d of declarations?.declarations ?? []) {
    if (d.property !== "custom" || d.value.name !== "touch-action") continue;
    return d.value.value
      .filter((t) => t.type === "token" && t.value.type === "ident")
      .map((t) => t.value.value)
      .join(" ");
  }
  return null;
}

/** Every rule of the sheet, with the narrowest `max-width` it stands under. */
function* rules(list, maxWidth = null) {
  for (const r of list) {
    if (r.type === "media") {
      const asked = maxWidthOf(r.value.query);
      yield* rules(r.value.rules, asked === null ? maxWidth : Math.min(asked, maxWidth ?? Infinity));
    } else if (r.type === "style") {
      yield { rule: r.value, maxWidth };
      if (r.value.rules) yield* rules(r.value.rules, maxWidth);
    }
  }
}

test("each strip page's phone scroller holds its axis: touch-action pan-y, under a phone's width", () => {
  const sheet = parse(SHEET);
  const holds = new Map();
  for (const { rule, maxWidth } of rules(sheet.rules)) {
    const action = touchActionOf(rule.declarations);
    if (action === null) continue;
    for (const cls of styledClasses(rule.selectors)) holds.set(cls, { action, maxWidth });
  }
  for (const cls of SCROLLERS) {
    const held = holds.get(cls);
    assert.ok(held, `.${cls} says its touch-action in ${SHEET}`);
    assert.equal(held.action, "pan-y", `.${cls} pans down and nowhere else under a finger`);
    assert.ok(
      held.maxWidth !== null && held.maxWidth <= PHONE_MAX,
      `.${cls}'s rule stands under a phone's width (max-width ${PHONE_MAX}px or under), not on a desk`,
    );
  }
});

test("the measure reads a rule as written: a class under a media query, and a rule with no touch-action", () => {
  const code = `
    @media (max-width: 720px) { .a, .rows :is(.b, .c) { touch-action: pan-y; } }
    .d { overflow-y: auto; }
    @media (min-width: 721px) { .e { touch-action: none; } }
  `;
  let parsed = null;
  transform({ filename: "fixture.css", code: Buffer.from(code), visitor: { StyleSheet: (s) => void (parsed = s) } });
  const seen = [];
  for (const { rule, maxWidth } of rules(parsed.rules))
    seen.push([[...styledClasses(rule.selectors)], touchActionOf(rule.declarations), maxWidth]);
  assert.deepEqual(seen, [
    [["a", "b", "c"], "pan-y", 720],
    [["d"], null, null],
    [["e"], "none", null],
  ]);
});
