/**
 * Who a person is, in words: the name they gave, never one invented from an
 * email. A profile row per account, written only by its owner; the roster
 * carries the name beside the email; the sidebar and the team card read the
 * same words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  identityWords,
  memberWords,
  personInitials,
  cleanDisplayName,
  ROLE_WORDS,
  DISPLAY_NAME_MAX,
} from "@chanlytics/contracts";
import { readCode, importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { installStubReact } from "../_stub-react.mjs";
import { bridgeHolds } from "../shell/_bridge-holds.mjs";
import { fromDashboard, stepRunning } from "../shell/boot/_frame-boot.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
bridgeHolds({ who: { workspaces: [], activeWorkspaceId: null } });
installStubReact();
const workspaces = await importSrc("apps/dashboard/app/api/v1/workspaces/route.ts");
const { installIdentity } = await importSrc("apps/dashboard/src/bridge/identity.ts");
const { sbWho } = await importSrc("apps/dashboard/src/surfaces/frame/sidebar/sidebar-who.tsx");

test("the words for the signed-in person: a given name or 'Account', initials from the name or the email, the role in a word", () => {
  assert.deepEqual(identityWords(null), { name: "Account", email: "", initials: "?", role: "", named: false });
  assert.deepEqual(identityWords({ email: "billing@rjcapital.example", role: "owner" }), {
    name: "Account",
    email: "billing@rjcapital.example",
    initials: "B",
    role: "Owner",
    named: false,
  });
  assert.deepEqual(
    identityWords({ email: "billing@rjcapital.example", display_name: "  Ruben Jimenez ", role: "operator" }),
    { name: "Ruben Jimenez", email: "billing@rjcapital.example", initials: "RJ", role: "Operator", named: true },
  );
  assert.equal(
    identityWords({ email: "x@y.z", display_name: "Ana", role: "viewer" }).initials,
    "AN",
    "one word: two letters, as contacts read",
  );
  assert.equal(
    identityWords({ email: null, display_name: "", role: "cfo" }).role,
    "",
    "an unknown role is no word, not a made-up one",
  );
  assert.equal(
    identityWords({ email: "hi@chanlytics.agency", role: null }).name,
    "Account",
    "never a name invented from an email",
  );
  assert.equal(personInitials(null, null), "?");
  assert.equal(personInitials("  ", "ops@x.io"), "O");
  assert.equal(personInitials("Marisa De La Rosa", null), "MD", "the contacts' rule: the first two words");
  assert.deepEqual(ROLE_WORDS, { owner: "Owner", operator: "Operator", partner: "Partner", viewer: "Viewer" });
});

test("a member on the roster: the name with the email under it, or the email alone", () => {
  assert.deepEqual(memberWords({ email: "ana@salon.example", display_name: "Ana" }), {
    name: "Ana",
    sub: "ana@salon.example",
  });
  assert.deepEqual(memberWords({ email: "ana@salon.example", display_name: "" }), {
    name: "ana@salon.example",
    sub: null,
  });
  assert.deepEqual(memberWords({ email: "ana@salon.example" }), { name: "ana@salon.example", sub: null });
  assert.deepEqual(memberWords({ email: null }), { name: "Someone", sub: null });
});

test("a name before it is sent: trimmed, inner spaces folded, at most 80 characters, empty allowed", () => {
  assert.deepEqual(cleanDisplayName("  Ruben   Jimenez "), { ok: true, name: "Ruben Jimenez" });
  assert.deepEqual(cleanDisplayName(""), { ok: true, name: "" });
  assert.equal(cleanDisplayName(42).ok, false);
  assert.equal(cleanDisplayName("x".repeat(81)).ok, false);
  assert.equal(cleanDisplayName("x".repeat(80)).ok, true);
  assert.equal(DISPLAY_NAME_MAX, 80);
});

test("the wiring: the identity the seam fetches at boot carries the name, nowhere yet and in a workspace", async () => {
  // One profile row per account, written by its owner only through profile_set, read by the workspaces they share, and
  // the roster carrying it: run on the replayed database in
  // a-person-s-name-is-theirs-to-set-and-their-team-s-to-read.db.test.mjs (00068's text was pinned here until 25 Nov
  // 2026). The roster's read carries it to the page: team-reads.test.mjs ("each member named").
  // Your name is yours alone to set, needs no workspace, is counted in its own bucket, judged by the contracts' rule
  // before the database's and saved through the one door (profile_set): run through the route in
  // workspace/account-routes.test.mjs ("the three declare their policy", "your name").
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const USER = "99999999-9999-4999-8999-999999999999";
  const tables = (memberships) => ({
    memberships,
    // As RLS answers the session: the workspace row only to its members.
    tenants: memberships.length
      ? [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }]
      : [],
    profiles: [{ user_id: USER, display_name: "Ada Lovelace" }],
    invitations: [],
  });
  const ctx = (memberships) => ({
    supabase: fakeDb(tables(memberships), {}, { platform_staff_state: () => "none" }),
    userId: USER,
    email: "ada@example.com",
    aal: "aal2",
    params: {},
    headers: {},
  });
  const read = (memberships) => workspaces.GET.run(new Request("http://localhost/api/v1/workspaces"), ctx(memberships));
  const seated = await read([
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
  ]);
  assert.equal(seated.user.display_name, "Ada Lovelace", "in a workspace");
  const nowhere = await read([]);
  assert.equal(nowhere.user.display_name, "Ada Lovelace", "and a person in no workspace yet");
});

test("the wiring: the bridge names nobody on the window, and the chip and the roster say the given name, never one made from the email", () => {
  // The words are contracts', imported where they are said (decision 0151): the bridge publishes none of them.
  installIdentity(globalThis.window);
  assert.equal("__identity" in globalThis.window, false, "no window name for the words");
  // A new name reaches the chrome and the roster through the workspace and settings reads the write re-reads
  // (refresh-map.ts "PUT me"), and the bridge patches nothing ahead of them or announces a name of its own:
  // shell/hearing/channels-billing-and-rules-are-heard.test.mjs ("naming yourself is a write ...") runs it.
  // The frame installs the identity at boot, before any page draws (bridge/boot, run in tests/shell/boot/frame-boot.test.mjs).
  assert.ok(stepRunning(fromDashboard("bridge/identity.ts").installIdentity));

  // The sidebar's chip: the name given, else "Account", and never the email's local part.
  bridgeHolds({ who: { me: { email: "ana@salon.example", display_name: "", role: "owner" } } });
  assert.deepEqual(
    [sbWho().name, sbWho().email, sbWho().named],
    ["Account", "ana@salon.example", false],
    "REGRESSION: never 'ana' dressed as a name",
  );
  bridgeHolds({ who: { me: { email: "ana@salon.example", display_name: "Ana Ruiz", role: "operator" } } });
  assert.deepEqual([sbWho().name, sbWho().role, sbWho().named], ["Ana Ruiz", "Operator", true]);
  // It redraws as who is looking is read: the one listener, still read until the chip is drawn here.
  assert.ok(
    readCode("apps/dashboard/src/surfaces/frame/sidebar/sidebar.tsx").includes(
      'window.addEventListener("surface:workspace", bump);',
    ),
    "the chip redraws as who is looking is read",
  );
  // A person names themselves on Profile: drawn in workspace/settings-owner-panes/ ("your name is a row on Profile"). The
  // Team card reads the same words as the chip, each row its member's given name or their address, drawn in
  // team/team-card.test.mjs ("each person is the name they gave, else their address").
});
