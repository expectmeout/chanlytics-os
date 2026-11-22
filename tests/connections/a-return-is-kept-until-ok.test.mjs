/**
 * What a sign-in came back with is said until its Ok, and every reason has a sentence (21 Nov 2026).
 *
 * A provider's own screen sends the browser back to Connections with one word in the address (`?meta=error&why=…`). The
 * page takes it off the address as it reads it. On a desk the frame draws the page, sets it aside while its reads
 * arrive and draws it again: the second drawing read an address that no longer said anything, so a refused connection
 * said nothing at all (@chanlytics refused in another workspace, twice, with a silent page). What was read is kept for
 * the page until its Ok, however often the page is drawn.
 *
 * And the words: each reason either login's way back can carry (the dashboard's callbacks and the edge's doors) has a
 * sentence an owner can act on, and one nobody named is still a plain sentence, never the reason's own word.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  keepsUntilSeen,
  takeFromAddress,
} from "../../apps/dashboard/src/surfaces/settings/connections/model/came-back.ts";
import { loginSentence } from "../../apps/dashboard/src/surfaces/settings/connections/model/login-words.ts";

/** A page at an address, as the browser holds it: `replaceState` moves the address, as a browser's does. */
function pageAt(address) {
  const url = new URL(address, "https://app.example.com");
  const location = { pathname: url.pathname, search: url.search, hash: url.hash };
  globalThis.window = {
    location,
    history: {
      replaceState(_state, _unused, to) {
        const next = new URL(to, "https://app.example.com");
        Object.assign(location, { pathname: next.pathname, search: next.search, hash: next.hash });
      },
    },
  };
  return location;
}

const NO_NAMES = { workspace: () => null, handle: null };

test("a word in the address is taken off it once, and every later drawing is told the same until Ok", () => {
  const location = pageAt("/w/queens/settings/integrations?meta=error&why=instagram_account_taken#_=_");
  const came = keepsUntilSeen(() => takeFromAddress("meta"));
  const first = came.read();
  assert.deepEqual(first, { outcome: "error", why: "instagram_account_taken", at: null });
  assert.equal(location.search, "", "the address no longer says it");
  assert.equal(location.hash, "#_=_", "what Meta left after the address stays where it was");
  // The frame draws the page again: the address is empty now, and the page still says what came back.
  assert.deepEqual(came.read(), first);
  assert.deepEqual(came.read(), first);
  came.seen();
  assert.equal(came.read(), null, "after Ok it is said no more");
});

test("a newer return takes the place of one nobody said Ok to", () => {
  pageAt("/w/queens/settings/integrations?meta=error&why=declined");
  const came = keepsUntilSeen(() => takeFromAddress("meta"));
  assert.equal(came.read().why, "declined");
  // Tried again without pressing Ok, and it worked: the page says the newer thing.
  pageAt("/w/queens/settings/integrations?meta=connected");
  assert.deepEqual(came.read(), { outcome: "connected", why: null, at: null });
  assert.deepEqual(came.read(), { outcome: "connected", why: null, at: null });
});

test("an address that says nothing keeps nothing, and the other words in it are left alone", () => {
  const location = pageAt("/w/queens/settings/integrations?google=connected&tab=1");
  const came = keepsUntilSeen(() => takeFromAddress("meta"));
  assert.equal(came.read(), null);
  assert.equal(location.search, "?google=connected&tab=1");
  const google = keepsUntilSeen(() => takeFromAddress("google"));
  assert.deepEqual(google.read(), { outcome: "connected", why: null, at: null });
  assert.equal(location.search, "?tab=1");
});

test("whose workspace holds the account rides in the address only as that workspace's own address", () => {
  pageAt("/w/queens/settings/integrations?meta=error&why=instagram_account_taken&at=harbor-nails");
  assert.deepEqual(takeFromAddress("meta"), { outcome: "error", why: "instagram_account_taken", at: "harbor-nails" });
});

test("a connection that worked says so", () => {
  const ok = { outcome: "connected", why: null, at: null };
  assert.equal(loginSentence("Meta", ok, NO_NAMES), "Meta is connected · AI answers the account's DMs through it now.");
  assert.equal(loginSentence("Instagram", ok, NO_NAMES), "Instagram is connected · AI answers its DMs now.");
});

test("an account connected in another workspace: what to do, and the workspace named only to someone who is in it", () => {
  const taken = { outcome: "error", why: "instagram_account_taken", at: null };
  assert.equal(
    loginSentence("Meta", taken, NO_NAMES),
    "That Instagram account is connected to another Chanlytics workspace. Disconnect it there first, then connect it here.",
  );
  const yours = { ...taken, at: "harbor-nails" };
  const names = { workspace: (slug) => (slug === "harbor-nails" ? "Harbor Nails" : null), handle: null };
  assert.equal(
    loginSentence("Meta", yours, names),
    "That Instagram account is connected to your workspace Harbor Nails. Disconnect it there first, then connect it here.",
  );
  // The list of workspaces has not been read yet: still theirs, without a name.
  assert.equal(
    loginSentence("Instagram", yours, NO_NAMES),
    "That Instagram account is connected to another workspace of yours. Disconnect it there first, then connect it here.",
  );
});

test("a second account in a workspace that has one: the one it has is named", () => {
  const another = { outcome: "error", why: "instagram_another_connected", at: null };
  assert.equal(
    loginSentence("Meta", another, { workspace: () => null, handle: "harbor.nails" }),
    "This workspace already has @harbor.nails connected. Disconnect it first, then connect the other account.",
  );
  assert.equal(
    loginSentence("Meta", another, NO_NAMES),
    "This workspace already has an Instagram account connected. Disconnect it first, then connect the other account.",
  );
});

test("our own records or servers not answering is said as that, and that nothing changed", () => {
  for (const why of ["channel_read_failed", "no_database", "edge_504", "edge_502", "edge_0"])
    assert.equal(
      loginSentence("Meta", { outcome: "error", why, at: null }, NO_NAMES),
      "Chanlytics couldn't finish connecting just now, so nothing was changed. Try again in a minute.",
      why,
    );
});

test("a reason nobody named is a plain sentence, never the reason's own word", () => {
  for (const why of ["server_error", "temporarily_unavailable", "xyz_new_thing", null]) {
    for (const provider of ["Meta", "Instagram"]) {
      const sentence = loginSentence(provider, { outcome: "error", why, at: null }, NO_NAMES);
      assert.equal(
        sentence,
        `${provider} didn't connect, and nothing was changed. Try again, or report a problem if it keeps happening.`,
      );
    }
  }
});

/**
 * Every reason a way back can carry: the callbacks' own (a sign-in declined, a state that did not prove itself, a
 * person who may not), and each refusal the edge's two doors answer a connect with. The doors' own tests hold each
 * refusal they make to this list (tests/instagram/meta-connect.test.mjs, instagram-connect.test.mjs).
 */
const REASONS_SENT = [
  "declined",
  "not_available",
  "someone_else",
  "state_missing",
  "state_malformed",
  "state_signature",
  "state_expired",
  "not_owner",
  "no_workspace",
  "no_code",
  "preview",
  "no_edge_credential",
  "no_app_credentials",
  "no_database",
  "meta_off",
  "exchange_failed",
  "instagram_messages_not_granted",
  "instagram_account_unreadable",
  "instagram_accounts_several",
  "instagram_account_taken",
  "instagram_another_connected",
  "channel_read_failed",
  "subscribe_failed",
  "channel_write_failed",
  "credentials_failed",
];

test("every reason the code can send has words of its own, and none prints the reason's word", () => {
  const unknown = (provider) =>
    loginSentence(provider, { outcome: "error", why: "nobody_named_this", at: null }, NO_NAMES);
  for (const provider of ["Meta", "Instagram"]) {
    for (const why of REASONS_SENT) {
      const sentence = loginSentence(provider, { outcome: "error", why, at: null }, NO_NAMES);
      assert.ok(sentence && sentence.length > 20, `${provider} ${why}`);
      // A reason that is a plain word ("declined") may be said as English; one written as a code never is.
      if (why.includes("_"))
        assert.ok(!sentence.includes(why), `${provider} ${why}: the sentence never prints the reason's word`);
      assert.ok(!/\([a-z_0-9]+\)/.test(sentence), `${provider} ${why}: no word in brackets`);
      assert.notEqual(sentence, unknown(provider), `${provider} ${why} has words of its own`);
    }
  }
});
