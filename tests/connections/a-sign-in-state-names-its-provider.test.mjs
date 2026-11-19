/**
 * The one state every sign-in at a provider leaves with and comes back with (channels tokens/sign-in-state.ts; decision
 * 0049, step P0b): Instagram's and Meta's connects make and prove it through one helper, and an ad account's will. The
 * real functions run.
 *
 *   made      the workspace, the person, the provider and the life its caller gives (ten minutes for most), signed
 *   proved    for that provider and the person signed in now, and it gives the workspace
 *   refused   another provider's state, another person's, an old one, an altered one, none: each with its word
 *   deploys   a state signed the way it was before the helper proves itself through it
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATE_TTL_MS,
  newNonce,
  verifyStateFor,
  signStateFor,
  signState,
  verifyState,
} from "@chanlytics/channels/tokens";
import { HOUR_MS, MIN_MS } from "@chanlytics/contracts";

const SECRET = "the-dashboard-s-own-key";
const NOW = Date.parse("2026-11-18T12:00:00Z");
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const SOMEONE = "33333333-3333-4333-8333-333333333333";

const meta = { tenantId: WORKSPACE, userId: OWNER, provider: "meta" };
const proved = (state, expected = {}, at = NOW) =>
  verifyStateFor(SECRET, state, { provider: "meta", userId: OWNER, ...expected }, at);

test("a sign-in's state names the workspace, the person and the provider, for ten minutes", async () => {
  const state = await signStateFor(SECRET, meta, NOW, STATE_TTL_MS);
  const read = await verifyState(SECRET, state, NOW);
  assert.equal(read.ok, true);
  const { n, ...claims } = read.state;
  assert.deepEqual(claims, { t: WORKSPACE, u: OWNER, exp: NOW + STATE_TTL_MS, p: "meta" });
  assert.match(n, /^[A-Za-z0-9_-]{22}$/, "a nonce of 16 random bytes");
  assert.notEqual(state, await signStateFor(SECRET, meta, NOW, STATE_TTL_MS), "two sign-ins never share a state");
});

test("its life is the caller's to say: an ad account's sign-in may make an account and a Page on the way", async () => {
  const state = await signStateFor(SECRET, meta, NOW, HOUR_MS);
  const read = await verifyState(SECRET, state, NOW);
  assert.equal(read.ok && read.state.exp, NOW + HOUR_MS);
  // Back after 23 minutes, as the first real Connect was: past ten, and still proved.
  assert.deepEqual(await proved(state, {}, NOW + 23 * MIN_MS), { ok: true, tenantId: WORKSPACE });
  assert.deepEqual(await proved(state, {}, NOW + HOUR_MS + 1), { ok: false, reason: "expired" });
});

test("it is proved for its provider and the person signed in now, and gives the workspace", async () => {
  const state = await signStateFor(SECRET, meta, NOW, STATE_TTL_MS);
  assert.deepEqual(await proved(state), { ok: true, tenantId: WORKSPACE });
  assert.deepEqual(await proved(state, {}, NOW + STATE_TTL_MS), { ok: true, tenantId: WORKSPACE }, "to the minute");
});

test("anything else is refused, each with the word its callback says", async () => {
  const state = await signStateFor(SECRET, meta, NOW, STATE_TTL_MS);
  const refused = (reason) => ({ ok: false, reason });
  assert.deepEqual(await proved(state, { provider: "instagram" }), refused("malformed"), "another provider's");
  assert.deepEqual(await proved(state, { userId: SOMEONE }), refused("someone_else"), "another person came back");
  assert.deepEqual(await proved(state, {}, NOW + STATE_TTL_MS + 1), refused("expired"));
  assert.deepEqual(await verifyStateFor("another-key", state, meta, NOW), refused("signature"));
  assert.deepEqual(await proved(`${state}x`), refused("signature"), "altered on the way");
  assert.deepEqual(await proved("not-a-state"), refused("malformed"));
  for (const none of [null, undefined, ""]) assert.deepEqual(await proved(none), refused("missing"));
  // A state with no provider (Google Business Profile's own) is no state for a provider that names itself.
  const profile = await signState(SECRET, { t: WORKSPACE, u: OWNER, n: newNonce(), exp: NOW + STATE_TTL_MS });
  assert.deepEqual(await proved(profile), refused("malformed"));
  // The provider is asked before the person: a state for another provider never says who it was for.
  assert.deepEqual(await proved(state, { provider: "instagram", userId: SOMEONE }), refused("malformed"));
});

test("a state signed the way a connect signed it before the helper still proves itself", async () => {
  // What Instagram's and Meta's connects wrote out themselves until this step: a sign-in begun before a deploy ends after it.
  const before = await signState(SECRET, { t: WORKSPACE, u: OWNER, n: newNonce(), exp: NOW + STATE_TTL_MS, p: "meta" });
  assert.deepEqual(await proved(before), { ok: true, tenantId: WORKSPACE });
});
