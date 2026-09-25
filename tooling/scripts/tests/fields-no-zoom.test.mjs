/**
 * No field zooms a phone.
 *
 * An iPhone zooms the page into any field whose words are under 16px when it
 * takes focus, and stays zoomed after. The type scale sets fields at 12 to
 * 14.5px, so 110 of 123 fields did it, the sign-in first. One rule in
 * app/globals.css lifts every field to 16px under a touch pointer; these pin
 * it, and the two things that would quietly undo it: a field rule that beats
 * it with its own !important, and a viewport that "fixes" the zoom by taking
 * pinch-zoom away.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readRaw } from "./_source.mjs";

const css = (p) => readRaw(p).replace(/\/\*[\s\S]*?\*\//g, "");

/** Every rule in a stylesheet, flattened out of its @media blocks: { sel, body, media }. */
function rules(src) {
  const out = [];
  const stack = [];
  let buf = "";
  for (const c of src) {
    if (c === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (c === "}") {
      const sel = stack.pop();
      if (sel !== undefined && !sel.startsWith("@"))
        out.push({ sel, body: buf, media: stack.filter((s) => s.startsWith("@")).join(" ") });
      buf = "";
    } else if (c === ";" && stack.length === 0) buf = "";
    else buf += c;
  }
  return out;
}

const GLOBALS = "apps/dashboard/app/globals.css";

test("under a touch pointer every text field is 16px, !important, from the root layout's stylesheet", () => {
  const layout = readRaw("apps/dashboard/app/layout.tsx");
  assert.ok(
    layout.includes('import "./globals.css";'),
    "the root layout draws globals.css on every page, the sign-in's and the OS's",
  );
  const rule = rules(css(GLOBALS)).find(
    (r) => /pointer:\s*coarse/.test(r.media) && /font-size:\s*16px\s*!important/.test(r.body),
  );
  assert.ok(rule, "a (pointer: coarse) rule sets font-size: 16px !important");
  const parts = rule.sel.split(/,(?![^(]*\))/).map((s) => s.replace(/\s+/g, " ").trim());
  assert.ok(
    parts.some((s) => /^input:not\(/.test(s)),
    "inputs",
  );
  assert.ok(parts.includes("textarea"), "textareas");
  assert.ok(parts.includes("select"), "selects");
  const notInput = parts.find((s) => /^input:not\(/.test(s));
  for (const t of ["text", "email", "search", "tel", "password", "number", "date", "datetime-local", "url"])
    assert.ok(!notInput.includes(`[type="${t}"]`), `a ${t} field is not excluded`);
});

test("a field excluded from the floor is drawn at 16px or larger already", () => {
  const rule = rules(css(GLOBALS)).find(
    (r) => /pointer:\s*coarse/.test(r.media) && /font-size:\s*16px\s*!important/.test(r.body),
  );
  const excluded = [...rule.sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  assert.ok(excluded.length > 0);
  const dir = path.join(ROOT, "apps/dashboard/src/legacy/styles");
  const all = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".css"))
    .flatMap((f) => rules(css(`apps/dashboard/src/legacy/styles/${f}`)));
  for (const cls of excluded) {
    const own = all.filter((r) => !r.media && r.sel.split(",").some((s) => s.trim() === `.${cls}`));
    const size = own
      .map((r) => r.body.match(/font-size:\s*([\d.]+)px/))
      .filter(Boolean)
      .map((m) => +m[1])
      .at(-1);
    assert.ok(size >= 16, `.${cls} is excluded because it is larger than 16px; its own rule says ${size}px`);
  }
});

test("no field rule under 16px carries its own !important to beat the floor", () => {
  const files = [
    GLOBALS,
    ...fs
      .readdirSync(path.join(ROOT, "apps/dashboard/src/legacy/styles"))
      .filter((f) => f.endsWith(".css"))
      .map((f) => `apps/dashboard/src/legacy/styles/${f}`),
    "apps/dashboard/src/legacy-bridge/legacy.css",
  ];
  const offenders = [];
  for (const f of files)
    for (const r of rules(css(f))) {
      const m = r.body.match(/font-size:\s*([\d.]+)px\s*!important/);
      if (m && +m[1] < 16 && /\b(input|textarea|select)\b|contenteditable|-input\b/.test(r.sel))
        offenders.push(`${f}: ${r.sel}`);
    }
  assert.deepEqual(offenders, []);
});

test("the viewport never solves the zoom by taking pinch-zoom away", () => {
  const layout = readRaw("apps/dashboard/app/layout.tsx");
  assert.ok(
    !/maximumScale|userScalable/.test(layout),
    "maximum-scale / user-scalable in the viewport stops Android's pinch-zoom (WCAG 1.4.4)",
  );
  const html = readRaw("apps/dashboard/src/legacy/Chanlytics.html");
  assert.ok(!/maximum-scale|user-scalable/.test(html));
});
