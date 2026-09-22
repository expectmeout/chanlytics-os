/**
 * The fixtures are the real shape with invented values. This holds both halves:
 * every key the card reads is on an item, including `location` (E7), every
 * item reads, and nothing in them could be a real business.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARDS, MAPS_FIELDS } from "../../../packages/core/src/leads/cards.ts";
import { probeItems, mainItems, mapsItem, checkerItem, actorRun, webhookBody, LABELS } from "./_lead-fixtures.mjs";

const card = CARDS.local_businesses;

test("every field the card asks the provider for is on a fixture item, and every item reads", () => {
  const items = [...probeItems(), ...mainItems()];
  for (const key of MAPS_FIELDS)
    assert.ok(
      items.some((it) => key in it),
      `no item carries ${key}`,
    );
  assert.equal(probeItems().length, 25);
  assert.equal(items.filter((it) => card.mapItem(it)).length, items.length, "every item reads");
  const one = card.mapItem(mapsItem(7));
  assert.deepEqual(
    [one.title, one.state, one.instagram, one.location],
    ["Place 0007", "Texas", "https://www.instagram.com/place0007", { lat: 30.2672, lng: -97.7631 }],
  );
  assert.equal(
    card.mapItem({ categoryName: "no title" }),
    null,
    "an item without a name does not read; its offset still counts",
  );
});

test("the labels say how a person would answer for every probe and main title", () => {
  for (const it of [...probeItems(), ...mainItems()])
    assert.ok(["fit", "chain", "other"].includes(LABELS.get(it.title)), it.title);
  const probe = probeItems().map((it) => LABELS.get(it.title));
  assert.deepEqual(
    [
      probe.filter((k) => k === "fit").length,
      probe.filter((k) => k === "chain").length,
      probe.filter((k) => k === "other").length,
    ],
    [13, 9, 3],
    "12 fit and one closed fit, 9 chains, 3 other kinds",
  );
});

test("the checker's item reads the calibration's shape: status with is_catch_all", () => {
  assert.deepEqual(card.checker.mapItem(checkerItem("Hello@Place0001.example", "valid")), {
    email: "hello@place0001.example",
    state: "ok",
  });
  assert.deepEqual(card.checker.mapItem(checkerItem("a@b.example", "risky", true)), {
    email: "a@b.example",
    state: "catch_all",
  });
  assert.deepEqual(card.checker.mapItem(checkerItem("a@b.example", "invalid")), {
    email: "a@b.example",
    state: "invalid",
  });
  assert.deepEqual(card.checker.mapItem(checkerItem("a@b.example", "unknown")), {
    email: "a@b.example",
    state: "unknown",
  });
  assert.deepEqual(
    card.checker.buildInput(["a@b.example"]),
    { emails: ["a@b.example"], skipInvalidSyntax: true },
    "the input key is emails",
  );
});

test("nothing in the fixtures could be a real business: .example hosts, 555-01xx numbers, invented place ids, no token-shaped string", () => {
  const text = JSON.stringify([
    ...probeItems(),
    ...mainItems(),
    actorRun(),
    webhookBody(),
    checkerItem("x@y.example", "valid"),
  ]);
  const hosts = [...text.matchAll(/https?:\/\/(?:www\.)?([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  assert.deepEqual(
    hosts.filter((h) => !h.endsWith(".example") && h !== "www.instagram.com" && h !== "instagram.com"),
    [],
  );
  const domains = [...text.matchAll(/[a-z0-9._%+-]+@([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  assert.deepEqual(
    domains.filter((d) => !d.endsWith(".example") && d !== "vagaro.com"),
    [],
    "vagaro.com is the junk the cleaner must drop",
  );
  const phones = [...text.matchAll(/\+1(\d{10})/g)].map((m) => m[1]);
  assert.deepEqual(
    phones.filter((d) => !/^\d{3}55501\d{2}$/.test(d) && d !== "1234567890"),
    [],
    "1234567890 is the placeholder the cleaner must drop",
  );
  assert.deepEqual(
    [...text.matchAll(/"placeId":"([^"]+)"/g)].map((m) => m[1]).filter((id) => !/^ChIJfixture\d{4}$/.test(id)),
    [],
  );
  assert.equal(/apify_api_|sk-ant-|eyJ[A-Za-z0-9_-]{20,}/.test(text), false);
});
