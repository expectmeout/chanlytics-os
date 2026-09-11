/**
 * Who a person is, in words: the name they gave, never one invented from an
 * email. A profile row per account, written only by its owner; the roster
 * carries the name beside the email; the sidebar and the team card read the
 * same words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { identityWords, memberWords, personInitials, cleanDisplayName, ROLE_WORDS, DISPLAY_NAME_MAX } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

test("the words for the signed-in person: a given name or 'Your account', initials from the name or the email, the role in a word", () => {
  assert.deepEqual(identityWords(null), { name: "Your account", email: "", initials: "?", role: "", named: false });
  assert.deepEqual(identityWords({ email: "billing@rjcapital.io", role: "owner" }), { name: "Your account", email: "billing@rjcapital.io", initials: "B", role: "Owner", named: false });
  assert.deepEqual(identityWords({ email: "billing@rjcapital.io", display_name: "  Ruben Jimenez ", role: "operator" }), { name: "Ruben Jimenez", email: "billing@rjcapital.io", initials: "RJ", role: "Operator", named: true });
  assert.equal(identityWords({ email: "x@y.z", display_name: "Ana", role: "viewer" }).initials, "AN", "one word: two letters, as contacts read");
  assert.equal(identityWords({ email: null, display_name: "", role: "cfo" }).role, "", "an unknown role is no word, not a made-up one");
  assert.equal(identityWords({ email: "hi@chanlytics.agency", role: null }).name, "Your account", "never a name invented from an email");
  assert.equal(personInitials(null, null), "?");
  assert.equal(personInitials("  ", "ops@x.io"), "O");
  assert.equal(personInitials("Melany De La Cruz", null), "MD", "the contacts' rule: the first two words");
  assert.deepEqual(ROLE_WORDS, { owner: "Owner", operator: "Operator", viewer: "Viewer" });
});

test("a member on the roster: the name with the email under it, or the email alone", () => {
  assert.deepEqual(memberWords({ email: "ana@salon.example", display_name: "Ana" }), { name: "Ana", sub: "ana@salon.example" });
  assert.deepEqual(memberWords({ email: "ana@salon.example", display_name: "" }), { name: "ana@salon.example", sub: null });
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

test("the wiring: one profile row per account, written by its owner only, read by the workspaces they share; the roster carries it; the route, the bridge, the chrome, the card", () => {
  const mig = readRaw("supabase/migrations/00068_profiles.sql");
  for (const pin of [
    "create table public.profiles (",
    "user_id      uuid primary key references auth.users (id) on delete cascade,",
    "check (char_length(display_name) <= 80)",
    "create policy profiles_member_select on public.profiles",
    "grant select on public.profiles to authenticated;",
    "create or replace function public.profile_set(p_display_name text)",
    "on conflict (user_id) do update set display_name = excluded.display_name;",
    "revoke all on function public.profile_set(text) from public, anon;",
    "grant execute on function public.profile_set(text) to authenticated;",
    "drop function if exists public.team_roster(uuid);",
    "returns table (membership_id uuid, member_user_id uuid, email text, role text, joined_at timestamptz, display_name text)",
    "left join public.profiles p on p.user_id = m.user_id",
    "raise exception 'Not a member of this workspace.' using errcode = '42501';",
  ]) assert.ok(mig.includes(pin), pin);
  assert.ok(!mig.includes("grant insert") && !mig.includes("grant update"), "no direct writes: profile_set is the door");

  const route = readCode("apps/dashboard/app/api/v1/me/route.ts");
  assert.ok(route.includes('rate: "profile_set",') && route.includes('rpc("profile_set", { p_display_name: cleaned.name })'));
  assert.ok(route.includes("cleanDisplayName(body.display_name"), "the contracts' rule, before the database's");
  assert.ok(!route.includes("memberContext("), "your name needs no workspace");
  assert.ok(readCode("apps/dashboard/src/server/rate-limit.ts").includes("profile_set: {"));

  const ws = readCode("apps/dashboard/app/api/v1/workspaces/route.ts");
  assert.ok(ws.includes('from("profiles").select("display_name").eq("user_id", userId).maybeSingle()'), "the identity the seam fetches at boot carries the name");
  assert.ok((ws.match(/display_name: displayName/g) ?? []).length === 2, "on both answers: nowhere yet, and a workspace");

  const service = readCode("apps/dashboard/src/server/service.ts");
  assert.ok(service.includes("displayName: m.display_name,") && service.includes("displayName: string;"), "the roster carries the name");

  const bridge = readCode("apps/dashboard/src/legacy-bridge/identity.ts");
  assert.ok(bridge.includes("win.__identity = { words: identityWords, member: memberWords, initials: personInitials };"));
  assert.ok(bridge.includes('win.dispatchEvent(new CustomEvent("me:changed"));'), "the chrome hears a change");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installIdentity();"));
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/surface-data.ts").includes("display_name?: string | null"));

  const sidebar = readCode("apps/dashboard/src/legacy/components/sidebar.jsx");
  assert.ok(sidebar.includes("window.__identity.words(me)"), "the chip reads the same words");
  assert.ok(sidebar.includes('window.addEventListener("me:changed", bump);'));
  assert.ok(!sidebar.includes('split("@")[0]'), "never the email's local part as a name");

  const settings = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(settings.includes("const YourName = ") && settings.includes('data-testid="set-you-name"'), "a person names themselves on the team card");
  assert.ok(settings.includes("window.__identity.member({ email: m.email, display_name: m.displayName })"), "the roster reads the same words");
  assert.ok(!settings.includes('name: (m.email || "").split("@")[0]'), "never the local part dressed as a name");
});
