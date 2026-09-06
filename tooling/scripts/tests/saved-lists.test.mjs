/**
 * Saved lists: a name and the people on it.
 *
 * People v1 kept six computed lists; what a salon also keeps is a list by
 * hand. Now: a segments table the workspace owns (members read, owner or
 * operator writes), routes that make, change and delete one, a People rail
 * whose Saved section is real, and a profile section that puts a person on
 * a list or takes them off. No ledger rows: a list changes nothing a
 * customer experiences until a broadcast goes to it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the tables: the workspace's, members read, acting members write, a person of another workspace or an erased one cannot be put on a list", () => {
  const m = readRaw("supabase/migrations/00044_saved_lists.sql");
  assert.ok(m.includes("create table public.segments (") && m.includes("create table public.segment_members ("));
  assert.ok(m.includes("unique (tenant_id, name)"), "one name per workspace");
  assert.ok(m.includes("alter table public.segments        enable row level security;") && m.includes("alter table public.segment_members enable row level security;"));
  assert.ok(m.includes("with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid()));"), "a list is made by an acting member, in their own name");
  assert.ok(m.includes("and exists (select 1 from public.contacts c where c.id = contact_id and c.tenant_id = segment_members.tenant_id and c.erased_at is null)"), "the person must be of the workspace and still exist");
  assert.ok(m.includes("grant update (name) on public.segments to authenticated;"), "a session client may rename a list and nothing else about it");
  assert.ok(m.includes("after update of erased_at on public.contacts"), "an erased person leaves every list");
  assert.ok(!/insert into public\.decisions|'create_list'|'delete_list'/.test(m), "no ledger rows for a grouping");
});

test("the routes: one workspace's lists with their ids, owner or operator to change them, the same refusals in the same words", () => {
  const list = readCode("apps/dashboard/app/api/v1/segments/route.ts");
  assert.ok(list.includes('.from("segments").select("id, name").eq("tenant_id", tenantId)'), "scoped by tenant, not by RLS alone");
  assert.ok(list.includes('requireRole(member, "operator");') && list.includes('takeRate(ctx.userId, "lists");'));
  assert.ok(list.includes('if (error.code === "23505") throw new AppError("conflict", "A list with that name already exists.", 409);'));
  const one = readCode("apps/dashboard/app/api/v1/segments/[id]/route.ts");
  assert.ok(one.includes("const add = cleanIdList(body?.add, \"add\");") && one.includes("const remove = cleanIdList(body?.remove, \"remove\");"));
  assert.ok(one.includes('throw new AppError("validation", "Nothing to change.");'));
  assert.ok(one.includes('{ onConflict: "segment_id,contact_id", ignoreDuplicates: true }'), "adding someone twice is not an error");
  assert.ok(one.includes('if (error.code === "42501") throw new AppError("validation", "One of those people is not in this workspace any more.");'), "RLS's refusal gets words");
  assert.ok(one.includes('.delete({ count: "exact" })') && one.includes('if (!count) throw new AppError("not_found", "List not found.", 404);'), "a delete that removed nothing is not a success");
  const helper = readCode("apps/dashboard/src/server/lists.ts");
  assert.ok(helper.includes("export const LIST_NAME_MAX = 60;") && helper.includes("export const LIST_BATCH_MAX = 500;"));
  assert.ok(readCode("apps/dashboard/src/server/rate-limit.ts").includes('lists: { limit: 60, windowMs: 60_000, noun: "list changes" }'));
});

test("the surface: lists ride People, counted over the rows on the page; the verbs re-fetch it", () => {
  const s = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(s.includes('fetchEnvelope<{ lists: { id: string; name: string; ids: string[] }[] }>("/api/v1/segments")'));
  assert.ok(s.includes("const ids = l.ids.filter((id) => rowIds.has(id));"), "an erased person never counts");
  const v = readCode("apps/dashboard/src/legacy-bridge/people-lists.ts");
  for (const verb of ["create:", "rename:", "remove:", "add:", "drop:"]) assert.ok(v.includes(verb), verb);
  assert.ok(v.includes("await refreshSurfaces([peopleOverride]);"), "the chips are the server's");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installLists();"));
});

test("the page: the rail's Saved section is real, a name typed there is the only thing typed, a person joins from their profile", () => {
  const p = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");
  assert.ok(p.includes('data-testid="saved-lists"') && p.includes('data-testid="new-list"') && p.includes('data-testid="new-list-name"'));
  assert.ok(!p.includes("Saved lists need a segments table (Tier 2)"), "the demo-only block is gone");
  assert.ok(p.includes("if (savedId) {") && p.includes('data-testid="saved-filter"'), "a saved list filters the table like a computed one");
  assert.ok(p.includes("Delete “{list.name}”? The people stay."), "deleting a list is asked once, in words that say what stays");
  assert.ok(p.includes('window.__ME.role === "operator"'), "operators keep lists too");
  const prof = readCode("apps/dashboard/src/legacy/pages/client-profile.jsx");
  assert.ok(prof.includes('data-testid="person-lists"') && prof.includes('data-testid="person-list-chip"'));
  assert.ok(prof.includes("No lists yet — make one on the People rail, then add people here."));
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/clients.css").includes(".cl-rail-newlist input {"));
});

test("People › Lists is real: the lists kept by hand and the computed ones with their people, fed by the People surface; the seeded page keeps the demo", async () => {
  const reg = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/legacy-bridge/surface-registry.ts")).href);
  assert.equal(reg.SURFACE_STATES.segments, "real");
  assert.equal(reg.ROUTE_SURFACE.segments, "people", "the same facts as People, never a second fetch");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/pages/segments-real.jsx";'));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/segments.jsx").includes("window.SegmentsSeed = SegmentsPage;"));
  const p = readCode("apps/dashboard/src/legacy/pages/segments-real.jsx");
  for (const id of ["lists-real", "lists-rail-saved", "lists-rail-smart", "lists-members", "lists-use-in-broadcast", "lists-new-name", "lists-delete"]) {
    assert.ok(p.includes(`data-testid="${id}"`), id);
  }
  assert.ok(p.includes('window.addEventListener("segments:new", show);'), "the shell's New list button opens the name box");
  assert.ok(p.includes("window.CHANLY.nav(`broadcasts/${current.id}`)"), "a list's onward step is a broadcast");
  assert.ok(p.includes("Delete “{label}”? The people stay."));
  assert.ok(!/sgParseRules|agent builds|SG_STORE/.test(p), "no list is built from prose by an invented agent");
  const shell = readCode("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('{real ? "New list" : "New segment"}'));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx").includes('(a.kind === "saved" || a.kind === "list") && a.id === initialSegment'), "a broadcast opened from any list preselects it");
});
