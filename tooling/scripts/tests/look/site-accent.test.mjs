/**
 * A website's colour, read in code (core look/accent.ts, decision 0075): the theme colour said on purpose, else the
 * buttons', else the most used colour that is neither paper nor ink; always readable under white words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastOnWhite } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { siteAccentOf } = await importSrc("packages/core/src/look/accent.ts");

test("the page's own theme colour comes first, when it is a colour a brand would pick", () => {
  assert.equal(
    siteAccentOf(`<html><head><meta name="theme-color" content="#2A6F97"></head><body></body></html>`),
    "#2a6f97",
  );
  assert.equal(
    siteAccentOf(`<head><meta content="#2a6f97" name="theme-color"></head>`),
    "#2a6f97",
    "either order of the meta's attributes",
  );
  assert.equal(
    siteAccentOf(`<head><meta name="theme-color" content="#ffffff"><style>.btn{background:#c4452e}</style></head>`),
    "#c4452e",
    "a white theme colour is paper, not a brand",
  );
});

test("else the buttons' colour, named or by their class, the most used winning; a light one darkened to read", () => {
  const html = `<style>
    :root{--brand-primary: rgb(16, 94, 200); --text:#222}
    .btn-primary{background:var(--brand-primary)} .cta{background-color:#105ec8;color:#fff}
    .other{background:#eee} a{color:#105ec8} footer{background:#333}
  </style>`;
  assert.equal(siteAccentOf(html), "#105ec8");
  const light = siteAccentOf(`<style>button{background:#ff6f91}</style>`);
  assert.ok(light && light !== "#ff6f91" && contrastOnWhite(light) >= 4.5, light);
  const two = `<style>.btn{background:#7b2cbf}.btn-alt{background:#7b2cbf}.cta{background:#105ec8}</style>`;
  assert.equal(siteAccentOf(two), "#7b2cbf", "the most used among the buttons");
});

test("a page of greys says nothing; inline styles count; nothing is read past the page", () => {
  assert.equal(siteAccentOf(`<style>body{background:#fff;color:#111}.x{background:#999}</style>`), null);
  assert.equal(
    siteAccentOf(`<div style="background: #7b2cbf"><button style="background:#7b2cbf">Book</button></div>`),
    "#7b2cbf",
  );
  assert.equal(
    siteAccentOf(`<p style="color:#2a6f97">x</p><p style="color:#2a6f97">y</p>`),
    "#2a6f97",
    "the most used, when no button says",
  );
  assert.equal(siteAccentOf(""), null);
});
