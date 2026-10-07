/**
 * The pages a visitor reaches without the app say where they are and how to go on.
 *
 * - A link to a business's page or its opt-in page that names nothing showed Next's bare default page, with no
 *   Chanlytics on it and no way on (the wiring audit's N21).
 * - The privacy policy, the terms and the data-deletion page offered no way back to signing in (N23).
 * - The sign-in, sign-up and reset doors were named "Chanlytics OS" in the tab, like every page before it (N14's doors).
 * Run by calling the pages and walking what they return, as the Terms test in
 * the-pages-say-only-what-is-true.test.mjs does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";

// These pages compile to React.createElement, as a server render would call it.
globalThis.React = React;

const at = (rel) => new URL(`../../../../apps/dashboard/app/${rel}`, import.meta.url).href;
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
    if (typeof n === "string" || typeof n === "number") {
      words.push(String(n).trim());
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
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
  assert.ok(
    words.some((w) => w.includes("ask them for the current link")),
    "and what to do with a link someone sent",
  );
  assert.deepEqual(
    links.map((l) => [l.href, l.text]),
    [
      ["/login", "Sign in"],
      ["https://www.chanlytics.com", "chanlytics.com"],
    ],
    "the ways on: signing in, and Chanlytics' own site",
  );
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

test("REGRESSION (N14): the sign-in, sign-up and reset doors are named in the tab -- each said 'Chanlytics OS', like every page", async () => {
  for (const [rel, title] of [
    ["login/layout.tsx", "Sign in · Chanlytics"],
    ["signup/layout.tsx", "Sign up · Chanlytics"],
    // The reset was the one door with no layout of its own, so it kept the app's title after the other two were named.
    ["reset-password/layout.tsx", "Reset your password · Chanlytics"],
  ]) {
    const layout = await loaded(rel);
    assert.ok(layout, `REGRESSION: there was no ${rel}, so the door took the app's own title`);
    assert.equal(layout.metadata.title, title);
    assert.equal(
      layout.default({ children: "the door" }),
      "the door",
      `${rel} draws the page it wraps, and nothing else`,
    );
  }
});

test("the doors are dressed by one shell: the form comes first, the half beside it is decoration a screen reader skips, and the legal links are in one place", async () => {
  const { default: AuthShell } = await import(
    new URL("../../../../apps/dashboard/src/auth/AuthShell.tsx", import.meta.url).href
  );

  // Walk it as a render would, calling the function components, and keep two
  // things: the order the markup puts words in, and which of them sit under an
  // aria-hidden. A phone gets the form only, and the order is why.
  const order = [],
    hidden = [],
    links = [],
    mains = [];
  const walk = (n, under) => {
    if (n == null || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") {
      const w = String(n).trim();
      if (w) {
        order.push(w);
        if (under) hidden.push(w);
      }
      return;
    }
    if (Array.isArray(n)) {
      n.forEach((c) => walk(c, under));
      return;
    }
    if (typeof n !== "object") return;
    const h = under || n.props?.["aria-hidden"] === true || n.props?.["aria-hidden"] === "true";
    if (typeof n.type === "function") {
      walk(n.type(n.props), h);
      return;
    }
    if (n.type === "main") mains.push(n);
    if (typeof n.props?.href === "string") links.push(n.props.href);
    walk(n.props?.children, h);
  };
  walk(AuthShell({ children: "THE FORM" }), false);

  const formAt = order.indexOf("THE FORM");
  const panelAt = order.findIndex((w) => w.startsWith("The work happens"));
  assert.ok(formAt >= 0 && panelAt >= 0, `both halves render, among: ${order.slice(0, 6).join(" | ")}`);
  assert.ok(
    formAt < panelAt,
    "the form is the work, so it comes first in the markup -- the panel is what a phone drops",
  );

  assert.equal(mains.length, 1, "one main per door: the shell owns it, so the pages inside must not");
  assert.deepEqual(
    links,
    ["/privacy", "/terms"],
    "the two legal links, once, in the shell -- each door used to carry its own",
  );

  // A page anybody can open shows no real workspace messages, and an invented
  // number would be the wrong first impression from a product that spent a month
  // on telling the truth. So the conversation is labelled, and read to no one.
  assert.ok(
    order.some((w) => w.includes("An example")),
    "the conversation says it is an example",
  );
  for (const w of ["Hi! Do you have anything Saturday?", "An example of your receptionist answering"])
    assert.ok(
      hidden.includes(w),
      `"${w}" is aria-hidden -- a screen reader gets the sentence, not a dialogue it would have to disbelieve`,
    );
  assert.ok(
    !hidden.some((w) => w.startsWith("Chanlytics answers")),
    "but the sentence that says what this is, it does get",
  );
});
