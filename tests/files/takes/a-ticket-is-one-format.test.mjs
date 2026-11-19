/**
 * A clip's ticket (packages/channels/src/files/relay-ticket.ts and apps/relay/src/ticket.ts, the footage sources plan):
 * the app signs it and the relay reads it, in two modules that share no code, since a Worker imports nothing of ours.
 * These hold the two sides to one format, both ways, and the address the video platform is sent to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";
import { importSrc } from "../../_source.mjs";

const { readRelayTicket, relayClipAddress, signRelayTicket } = await importSrc(
  "packages/channels/src/files/relay-ticket.ts",
);
const relay = await import(at("apps/relay/src/ticket.ts"));

const KEY = "ticket-key-for-this-file";
const ITEM = "0b0e6c1e-6f0a-4b6e-9d3e-2a1f5c7d9e11";
const NOW = Date.parse("2026-11-18T03:00:00Z");
const HOUR_S = 60 * 60;
const inHours = (hours) => NOW / 1000 + hours * HOUR_S;

test("a ticket the app signs is read by the relay, and one the relay's own signer makes is read by the app", async () => {
  const ours = signRelayTicket(KEY, { item: ITEM, expiresAt: inHours(6) });
  assert.deepEqual(await relay.readTicket(KEY, ours, NOW), { ok: true, item: ITEM, expiresAt: inHours(6) });
  const theirs = await relay.signTicket(KEY, { item: ITEM, expiresAt: inHours(6) });
  assert.deepEqual(readRelayTicket(KEY, theirs, NOW), { ok: true, item: ITEM, expiresAt: inHours(6) });
  assert.equal(ours, theirs, "the same claim under the same key is the same ticket, byte for byte");
});

test("both sides refuse the same tickets for the same reasons", async () => {
  const good = signRelayTicket(KEY, { item: ITEM, expiresAt: inHours(6) });
  const [version, claim, signature] = good.split(".");
  const cases = [
    ["another key's", signRelayTicket("another-key", { item: ITEM, expiresAt: inHours(6) }), "signature"],
    ["a claim changed after signing", `${version}.${claim.slice(0, -2)}AA.${signature}`, "signature"],
    ["ended", signRelayTicket(KEY, { item: ITEM, expiresAt: inHours(-1) }), "expired"],
    ["signed for longer than a day", signRelayTicket(KEY, { item: ITEM, expiresAt: inHours(25) }), "too_long"],
    ["another version", `v2.${claim}.${signature}`, "malformed"],
    ["no ticket", null, "malformed"],
    ["not a ticket", "hello", "malformed"],
  ];
  for (const [what, ticket, reason] of cases) {
    assert.deepEqual(readRelayTicket(KEY, ticket, NOW), { ok: false, reason }, `the app: ${what}`);
    assert.deepEqual(await relay.readTicket(KEY, ticket, NOW), { ok: false, reason }, `the relay: ${what}`);
  }
});

test("a ticket names an item by its id, and is never signed with no key", () => {
  assert.throws(() => signRelayTicket(KEY, { item: "Saturday colour.MOV", expiresAt: inHours(1) }), /by its id/);
  assert.throws(() => signRelayTicket("", { item: ITEM, expiresAt: inHours(1) }), /ticket's key/);
  assert.deepEqual(readRelayTicket("", signRelayTicket(KEY, { item: ITEM, expiresAt: inHours(1) }), NOW), {
    ok: false,
    reason: "malformed",
  });
});

test("a clip's address is the relay's, names the item, ends in its type and carries only the ticket", () => {
  const ticket = signRelayTicket(KEY, { item: ITEM, expiresAt: inHours(6) });
  const address = new URL(relayClipAddress("https://relay.example", { item: ITEM, ticket, extension: "mov" }));
  assert.equal(address.origin, "https://relay.example");
  assert.equal(address.pathname, `/clip/${ITEM}/clip.mov`);
  assert.deepEqual([...address.searchParams.keys()], ["ticket"]);
  assert.equal(address.searchParams.get("ticket"), ticket);
  assert.throws(() => relayClipAddress("http://relay.example", { item: ITEM, ticket, extension: "mov" }), /https/);
  assert.throws(() => relayClipAddress("https://relay.example", { item: ITEM, ticket, extension: "../x" }), /type/);
});
