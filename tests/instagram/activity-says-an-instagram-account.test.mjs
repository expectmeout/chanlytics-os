/**
 * Activity says an Instagram account as one (decision 0143): connected, by its handle, where it read "A WhatsApp number
 * was connected" for every channel; and disconnected, which the ledger did not keep at all. A WhatsApp number's own
 * words are as they were.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityTone, activityWords } from "@chanlytics/contracts";

test("an Instagram account connected is said as one, by its handle, through either sign-in", () => {
  assert.equal(
    activityWords("channel.connected", { kind: "instagram", login: "meta", account_id: "1", username: "harbor.nails" }),
    "An Instagram account was connected · @harbor.nails",
  );
  assert.equal(
    activityWords("channel.connected", { kind: "instagram", account_id: "1", username: null, by: null }),
    "An Instagram account was connected",
  );
});

test("a WhatsApp number connected keeps its own words", () => {
  assert.equal(
    activityWords("channel.connected", { kind: "whatsapp", verified_name: "Harbor Moving" }),
    "A WhatsApp number was connected · Harbor Moving",
  );
  assert.equal(activityWords("channel.connected", { verified_name: null }), "A WhatsApp number was connected");
});

test("an Instagram account disconnected is said, by its handle, in the tone of something stopped", () => {
  assert.equal(
    activityWords("channel.disconnected", { kind: "instagram", login: "meta", username: "harbor.nails", by: "u1" }),
    "An Instagram account was disconnected · @harbor.nails",
  );
  assert.equal(activityWords("channel.disconnected", { kind: "instagram" }), "An Instagram account was disconnected");
  assert.equal(activityTone("channel.disconnected"), "warn");
});
