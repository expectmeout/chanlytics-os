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
import { readCode, readRaw, importSrc } from "../../_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the tables: the workspace's, members read, acting members write, a person of another workspace or an erased one cannot be put on a list", () => {
  const m = readRaw("supabase/migrations/00044_saved_lists.sql");
  assert.ok(m.includes("create table public.segments (") && m.includes("create table public.segment_members ("));
  assert.ok(m.includes("unique (tenant_id, name)"), "one name per workspace");
  assert.ok(
    m.includes("alter table public.segments        enable row level security;") &&
      m.includes("alter table public.segment_members enable row level security;"),
  );
  assert.ok(
    m.includes("with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid()));"),
    "a list is made by an acting member, in their own name",
  );
  assert.ok(
    m.includes(
      "and exists (select 1 from public.contacts c where c.id = contact_id and c.tenant_id = segment_members.tenant_id and c.erased_at is null)",
    ),
    "the person must be of the workspace and still exist",
  );
  assert.ok(
    m.includes("grant update (name) on public.segments to authenticated;"),
    "a session client may rename a list and nothing else about it",
  );
  assert.ok(m.includes("after update of erased_at on public.contacts"), "an erased person leaves every list");
  assert.ok(!/insert into public\.decisions|'create_list'|'delete_list'/.test(m), "no ledger rows for a grouping");
});

test("the routes: one workspace's lists with their ids, owner or operator to change them, the same refusals in the same words", () => {
  // Scoped by tenant, not by RLS alone, and every member read: people-routes.test.mjs runs the GET over two
  // workspaces and over a list past PostgREST's max_rows.
  const list = readCode("apps/dashboard/app/api/v1/segments/route.ts");
  assert.ok(list.includes('role: "operator",') && list.includes('rate: "lists",'));
  assert.ok(
    list.includes(
      'if (error?.code === "23505") throw new AppError("conflict", "A list with that name already exists.", 409);',
    ),
  );
  const one = readCode("apps/dashboard/app/api/v1/segments/[id]/route.ts");
  assert.ok(
    one.includes('const add = cleanIdList(body?.add, "add");') &&
      one.includes('const remove = cleanIdList(body?.remove, "remove");'),
  );
  assert.ok(one.includes('throw new AppError("validation", "Nothing to change.");'));
  // Adding someone twice is not an error: people-routes.test.mjs runs the PUT twice over the same person.
  assert.ok(
    /if \(error\.code === "42501"\)\s*throw new AppError\("validation", "One of those people is not in this workspace any more\."\);/.test(
      one,
    ),
    "RLS's refusal gets words",
  );
  // The delete counts what it removed (packages/db deleteList); people-routes.test.mjs deletes a list twice.
  assert.ok(
    one.includes('if (!count) throw new AppError("not_found", "List not found.", 404);'),
    "a delete that removed nothing is not a success",
  );
  const helper = readCode("apps/dashboard/src/server/people/lists.ts");
  assert.ok(
    helper.includes("export const LIST_NAME_MAX = 60;") && helper.includes("export const LIST_BATCH_MAX = 500;"),
  );
  assert.ok(
    readCode("apps/dashboard/src/server/rate-limit.ts").includes(
      'lists: { limit: 60, windowMs: MIN_MS, noun: "list changes" }',
    ),
  );
});

test("the surface: lists ride People, counted over the rows on the page; the verbs re-fetch it", async () => {
  const s = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(s.includes('read("GET segments")'));
  assert.ok(
    s.includes('const members = m.state === "ok" ? rows.filter((r) => m.ids.has(r.id)) : [];') &&
      s.includes("action: savedListAction(l.id, members)"),
    "an erased person never counts, and the list carries its one step",
  );
  const v = readCode("apps/dashboard/src/legacy-bridge/people-lists.ts");
  for (const verb of ["create:", "rename:", "remove:", "add:", "drop:"]) assert.ok(v.includes(verb), verb);
  const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  for (const k of ["POST segments", "PUT segments/[id]", "DELETE segments/[id]"])
    assert.deepEqual(
      AFTER[k]().map((o) => o.key),
      ["people", "broadcasts", "playbooks"],
      `${k}: the chips are the server's, and a list is an audience and a playbook's moment too`,
    );
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installLists();"));
});

test("the page: the rail's Saved section is real, a name typed there is the only thing typed, a person joins from their profile", () => {
  const p = readCode("apps/dashboard/src/legacy/pages/people.jsx");
  // The Saved section itself is the rail kit's (RailSection), drawn and pressed in people-honest, not read here.
  assert.ok(p.includes('data-testid="new-list"') && p.includes('data-testid="new-list-name"'));
  assert.ok(!p.includes("Saved lists need a segments table (Tier 2)"), "the demo-only block is gone");
  assert.ok(
    p.includes("if (savedId) {") && p.includes('data-testid="saved-filter"'),
    "a saved list filters the table like a computed one",
  );
  assert.ok(
    p.includes('question={`Delete “${list.name}”?`} detail="The people stay."'),
    "deleting a list is asked once, through the one Confirm, in words that say what stays",
  );
  assert.ok(
    p.includes('["owner", "operator", "partner"].includes(window.__ME.role)'),
    "operators keep lists too, and the partner",
  );
  const prof = readCode("apps/dashboard/src/legacy/pages/client-profile.jsx");
  assert.ok(prof.includes('data-testid="person-lists"') && prof.includes('data-testid="person-list-chip"'));
  assert.ok(
    prof.includes("No lists of your own yet.") && prof.includes("Make one on People"),
    "the empty section is a door to People with the New list box opening; 'the People rail' is not a place a phone has",
  );
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/clients.css").includes(".cl-rail-newlist input {"));
});

test("Lists is a view of People: a kept list is the page's title with its rename, its delete and its one door; the old route lands there; the seeded page keeps the demo", async () => {
  const reg = await import(
    pathToFileURL(path.join(here, "../../../../../apps/dashboard/src/legacy-bridge/surface-registry.ts")).href
  );
  assert.equal(reg.SURFACE_STATES.segments, "real", "the route is real: it lands on People");
  assert.equal(reg.ROUTE_SURFACE.segments, "people", "the same facts as People, never a second fetch");
  assert.ok(
    !readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes("segments-real"),
    "REGRESSION: a second page of the same people",
  );
  assert.ok(
    readCode("apps/dashboard/src/legacy/pages/segments.jsx").includes("window.SegmentsPage = SegmentsPage;"),
    "the demo's page under the name the shell draws",
  );
  const p = readCode("apps/dashboard/src/legacy/pages/people.jsx");
  // The phone's way to the lists is the bar's list button now, pressed in people-honest ("on a phone the lists are
  // behind the bar's list button"), not a testid read here.
  for (const id of [
    "saved-filter",
    "list-rename",
    "list-rename-name",
    "list-action",
    "row-drop-list",
    "bulk-drop-list",
    "show-everyone",
    "people-lists-sheet",
  ]) {
    assert.ok(p.includes(`data-testid="${id}"`), id);
  }
  assert.ok(
    p.includes('window.addEventListener("segments:new", onNew);'),
    "the shell's and a profile's New list open the box",
  );
  assert.ok(p.includes("window.__listRoute = plListRoute;"), "the People page owns where a list's route lands");
  // The rest is behaviour, tested as such: the shell landing segments/<id> on People (shell-status.test.mjs), no
  // Lists tab on a real workspace (shell-status), a kept list's door and sentence (people-honest).
});
