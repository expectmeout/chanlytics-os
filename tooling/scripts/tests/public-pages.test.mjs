/**
 * The pages a visitor reaches without the app say where they are and how to go on.
 *
 * - A link to a business's page or its opt-in page that names nothing showed Next's bare default page, with no
 *   Chanlytics on it and no way on (the wiring audit's N21).
 * - The privacy policy, the terms and the data-deletion page offered no way back to signing in (N23).
 * - The sign-in and sign-up doors were named "Chanlytics OS" in the tab, like every page before it (N14's doors).
 * Run by calling the pages and walking what they return, as the Terms test in
 * the-pages-say-only-what-is-true.test.mjs does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";

// These pages compile to React.createElement, as a server render would call it.
globalThis.React = React;

const at =(rel) => new URL(`../../../apps/dashboard/app/${rel}`, import.meta.url).href;
/** A page module, or null when there is none. */
const loaded = (rel) => import(at(rel)).catch(() => null);

const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return textOf(n.props?.children);
};
/** What a page says, string by string, and where its links go. */
const read = (tree) => {
  const words = [];
  const links = [];
  const walk = (n) => {
    if (n == null || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") { words.push(String(n).trim()); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n !== "object") return;
    if (typeof n.props?.href === "string") links.push({ href: n.props.href, text: textOf(n).trim() });
    walk(n.props?.children);
  };
  walk(tree);
  return { words: words.filter(Boolean), links };
};

test("REGRESSION (N21): a link that names nothing lands on a Chanlytics page that says so and offers the way on -- it was Next's bare default", async () => {
  const page = await loaded("not-found.tsx");
  assert.ok(page, "REGRESSION: there was no not-found page, so a bad /yes or /b link showed Next's own");
  const { words, links } = read(page.default());
  assert.ok(words.includes("This page isn’t here"), `its heading, among: ${words.slice(0, 4).join(" | ")}`);
  assert.ok(words.some((w) => w.includes("ask them for the current link")), "and what to do with a link someone sent");
  assert.deepEqual(links.map((l) => [l.href, l.text]), [["/login", "Sign in"], ["https://www.chanlytics.com", "chanlytics.com"]], "the ways on: signing in, and Chanlytics' own site");
  assert.equal(page.metadata.title, "Not found · Chanlytics", "and the tab says it");
});

test("REGRESSION (N23): the privacy policy, the terms and the data-deletion page each offer a way to sign in -- they had no way back", async () => {
  for (const rel of ["privacy/page.tsx", "terms/page.tsx", "data-deletion/page.tsx"]) {
    const { default: Page } = await import(at(rel));
    const signIn = read(Page()).links.find((l) => l.href === "/login");
    assert.ok(signIn, `REGRESSION: ${rel} had no way back to signing in`);
    assert.equal(signIn.text, "Sign in", rel);
  }
});

test("REGRESSION (N14): the sign-in and sign-up doors are named in the tab -- both said 'Chanlytics OS', like every page", async () => {
  for (const [rel, title] of [["login/layout.tsx", "Sign in · Chanlytics"], ["signup/layout.tsx", "Sign up · Chanlytics"]]) {
    const layout = await loaded(rel);
    assert.ok(layout, `REGRESSION: there was no ${rel}, so the door took the app's own title`);
    assert.equal(layout.metadata.title, title);
    assert.equal(layout.default({ children: "the door" }), "the door", `${rel} draws the page it wraps, and nothing else`);
  }
});
