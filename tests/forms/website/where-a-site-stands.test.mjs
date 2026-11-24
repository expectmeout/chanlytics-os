/**
 * Where a website stands and what it and its forms are called (contracts forms/outside.ts; 00709): waiting for its first
 * entry, a test received and nothing real yet, receiving, or nothing lately; a site named by its host once an entry
 * names one, else by the name its first key was given; a form by the owner's name, else the site's, else its kind's;
 * and who a site's entry is about, as typed, read against the one fixed shape the website door takes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SITE_FORM_FIELDS,
  SITE_QUIET_DAYS,
  formSiteNameOf,
  outsideFormNameOf,
  siteFormOf,
  siteReachOf,
  siteStandingOf,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const DAY_MS = 86_400_000;
const ago = (days) => new Date(NOW - days * DAY_MS).toISOString();

test("a site waits, then a test is received, then it receives, then nothing lately: never a fault", () => {
  assert.equal(siteStandingOf({ last_entry_at: null, test_at: null }, NOW), "waiting");
  assert.equal(
    siteStandingOf({ last_entry_at: null, test_at: ago(1) }, NOW),
    "test",
    "a test tells nobody, and says so",
  );
  assert.equal(
    siteStandingOf({ last_entry_at: ago(2), test_at: ago(1) }, NOW),
    "receiving",
    "a real entry outranks a test",
  );
  assert.equal(siteStandingOf({ last_entry_at: ago(SITE_QUIET_DAYS - 1), test_at: null }, NOW), "receiving");
  assert.equal(siteStandingOf({ last_entry_at: ago(SITE_QUIET_DAYS + 1), test_at: null }, NOW), "quiet");
});

test("a site by its host, else its key's name, else the website; a form by the owner's name, the site's, its kind's", () => {
  assert.equal(formSiteNameOf({ host: "luma.example.com", name: "Main site" }), "luma.example.com");
  assert.equal(formSiteNameOf({ host: null, name: " Main site " }), "Main site");
  assert.equal(formSiteNameOf({ host: null, name: "  " }), "Website", "a blank name is no name");
  assert.equal(formSiteNameOf({ host: null, name: null }), "Website");
  assert.equal(outsideFormNameOf({ name: "Ours", sent_name: "Theirs", form: "request" }), "Ours");
  assert.equal(outsideFormNameOf({ name: " ", sent_name: "Theirs", form: "request" }), "Theirs");
  assert.equal(outsideFormNameOf({ name: null, sent_name: null, form: "request" }), "Website form");
  assert.equal(outsideFormNameOf({ name: null, sent_name: null, form: "signup" }), "Sign-ups from your website");
});

test("a site's entry: who it is about as typed, its address one way, read against the door's one shape", () => {
  assert.deepEqual(siteReachOf({ name: " Ana Ruiz ", email: "Ana@Example.com ", phone: "", note: "Hi" }), {
    name: "Ana Ruiz",
    email: "ana@example.com",
    phone: null,
  });
  assert.deepEqual(siteReachOf({ email: 7 }), { name: null, email: null, phone: null }, "only words are read");
  const shape = siteFormOf("Colour consultation");
  assert.equal(shape.heading, "Colour consultation");
  assert.deepEqual(shape.fields, [...SITE_FORM_FIELDS]);
  assert.notEqual(shape.fields, SITE_FORM_FIELDS, "a copy: no reader changes the one shape");
});
