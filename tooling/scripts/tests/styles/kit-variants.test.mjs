/**
 * The kit's class helpers, run (apps/dashboard/src/surfaces/kit/variants.ts;
 * docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4): `cx` joins a component's classes and `variants`
 * maps its props to them. Imported through the kit's index, as a surface imports them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cx, variants } from "../../../../apps/dashboard/src/surfaces/kit/index.ts";

test("cx joins the class names it is given, in order, and leaves out false, null, undefined and the empty one", () => {
  assert.equal(cx("btn", "btn-primary"), "btn btn-primary");
  const open = false;
  assert.equal(cx("more-menu", open && "is-open", null, undefined, "", "more-wrap"), "more-menu more-wrap");
  assert.equal(cx(false, null, undefined, ""), "", "nothing left draws no class, not a space");
  assert.equal(cx(), "");
});

/** The house's button, as the kit will write it: its base class, a map for each prop, and the defaults. */
const button = variants({
  base: "btn",
  variants: {
    variant: { primary: "btn-primary", secondary: "", quiet: "btn-ghost", danger: "btn-danger" },
    size: { sm: "btn-sm", md: "" },
  },
  defaults: { variant: "secondary", size: "md" },
});

test("variants draws the base class, then each prop's class in the order its map names the props", () => {
  assert.equal(button({ variant: "primary", size: "sm" }), "btn btn-primary btn-sm");
  assert.equal(button({ size: "sm", variant: "danger" }), "btn btn-danger btn-sm", "the map's order, not the props'");
});

test("a prop not given, or given as undefined, takes its default; a value that draws no class of its own adds none", () => {
  assert.equal(button(), "btn", "the defaults, secondary and md, draw only the base");
  assert.equal(button({ variant: "quiet" }), "btn btn-ghost");
  assert.equal(button({ variant: undefined, size: "sm" }), "btn btn-sm");
  const pill = variants({
    base: "pill",
    variants: { tone: { ok: "pill-ok", warn: "pill-warn" } },
    defaults: { tone: "ok" },
  });
  assert.equal(pill(), "pill pill-ok");
  assert.equal(pill({ tone: undefined }), "pill pill-ok", "undefined is not given");
  assert.equal(pill({ tone: "warn" }), "pill pill-warn");
});

test("a value and a prop are read from what the map and the props hold themselves, never from what objects inherit", () => {
  const tally = variants({ base: "tally", variants: { tone: { warn: "tally-warn" } } });
  assert.equal(tally({ tone: "constructor" }), "tally", "not Object's source, which a map inherits under that name");
  assert.equal(tally({ tone: "toString" }), "tally");
  assert.equal(tally({ tone: "__proto__" }), "tally", "not [object Object]");
  const toggle = variants({ base: "tg", variants: { constructor: { on: "tg-on" } } });
  assert.equal(toggle(), "tg", "a prop not given is not what the props inherit under its name");
  assert.equal(toggle({ constructor: "on" }), "tg tg-on", "a prop given under that name is read");
});

test("with no defaults, a prop not given draws nothing, and a value its map does not name adds nothing", () => {
  const tally = variants({ base: "tally", variants: { tone: { warn: "tally-warn" } } });
  assert.equal(tally(), "tally");
  assert.equal(tally({ tone: "warn" }), "tally tally-warn");
  assert.equal(tally({ tone: "loud" }), "tally", "a JSX page's stray value is no class");
});
