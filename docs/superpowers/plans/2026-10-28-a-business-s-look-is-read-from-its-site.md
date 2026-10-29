# A business's look is read from its site — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in this session (Ruben: no sub-agents for his design work; one lane, one PR). Steps use checkbox (`- [ ]`) syntax for tracking. **Nothing is committed until Ruben says so**: each task ends staged, typechecked and tested; the commits are his word.

**Goal:** Every email a business sends its customers, and every page such an email opens, wears that business's own logo and colour — read from its website by the first run's `website_read` job with no owner's hand, shown and changeable in Settings › Business, and filled for the workspaces that exist today by one script.

**Architecture:** The look is two facts on the workspace's row: `tenants.logo_path` (00407, exists) and `tenants.accent` (new, 00490). The `website_read` job already fetches the home page; a new step reads the page's colour in code (core `siteAccentOf`) and the site's declared mark (core `leadMarksFrom`, as the Logo row's lookup already does), remakes a square PNG of it (channels
   `remadeLogo`, moved from the dashboard and taught to shrink), stores it in the `workspace-logos` bucket and wears both through one service-role door, `wear_found_look`, which fills only what the owner never set. One letter layout in contracts (`letterHtml`) draws the sign-up confirmation (its first use); the confirm and unsubscribe pages read the same two facts. The Settings row saves the colour through its own member door, `set_workspace_accent`, and previews the very HTML the email sends.

**Tech stack:** TypeScript across `packages/contracts` (pure words, colour math, the letter), `packages/core` (the readers, the PNG), `packages/db` (the row, the doors), `apps/edge` (the job step, the email), `apps/dashboard` (the pages, the route, the row), one SQL migration, `node:test` suites over `_fake-db.mjs`.

**Decided with Ruben, 28 Oct 2026 (this session):** visit mail stays plain; offers get a designed letter later (lane 4, reusing these two facts); no model draws a layout; the brand is read from the site, the owner overrides; the owner's choice stands — including the choice of none — so the read never overwrites what a person set.

---

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/00490_a_business_s_look_is_read_from_its_site.sql` | `tenants.accent`; `set_workspace_accent` (members); `wear_found_look` (service role, fills only what no owner set) |
| `packages/db/src/database.types.ts`, `supabase/schema.sql`, `docs/data-model.md` | The generated shapes, hand-held to the migration (no local stack in this lane; CI replays the migration) |
| `packages/db/src/repositories/look.ts` | `workspaceLookOf`, `setWorkspaceAccent`, `wearFoundLook` |
| `packages/contracts/src/look/colour.ts` | Colour parsing and contrast math, shared by the reader (core) and the letter (contracts) |
| `packages/contracts/src/look/look.ts` | `WorkspaceLook`, `accentOf`, `LOOK_WORDS`, `LETTER_WORDS` |
| `packages/contracts/src/look/letter.ts` | `letterHtml`: the one business → customer layout |
| `packages/contracts/src/people/doors/signup-confirm.ts` | `signupConfirmEmailHtml` (the letter's first use) |
| `packages/contracts/src/imports/business-reads.ts` | `BusinessReadFacts.look`: what the read found and wore |
| `packages/core/src/look/accent.ts` | `siteAccentOf(html)`: the page's colour, in code |
| `packages/core/src/look/logo-png.ts` | `remadeLogo` moved from the dashboard; a square PNG up to 2048 shrunk to 256 |
| `packages/core/src/look/found-logo.ts` | `siteLogoFrom`: the first mark the page declares that is a picture worth keeping (lifted from the dashboard's lookup) |
| `packages/channels/src/email/request.ts` | `EmailRequestInput.html`: an HTML part given whole |
| `apps/edge/lib/imports/look.ts` | `wearSiteLook`: read, remake, store, wear; never throws |
| `apps/edge/lib/imports/website-read.ts` | The job calls `wearSiteLook` once the home page is read; keeps `look` with the read |
| `apps/edge/lib/website/signup-confirm.ts` | The confirmation email carries the letter |
| `apps/dashboard/src/server/public/link-page.ts`, `confirm.ts`, `unsubscribe.ts` | The pages wear the look |
| `apps/dashboard/src/server/workspace/look.ts`, `app/api/v1/workspaces/accent/route.ts` | `PUT`/`DELETE workspaces/accent` |
| `apps/dashboard/src/server/workspace/workspace-list.ts` | The boot's list carries `accent` |
| `apps/dashboard/src/surfaces/settings/business/look/{row,verbs}.tsx` | The Colour row: swatch, change, preview |
| `tooling/scripts/ops/look/look-backfill.mjs` | Existing workspaces: ask the read again (dry-run by default) |
| `docs/decisions/0075-a-business-s-look-is-read-from-its-site.md` | The decision |

---

### Task 1: The row and its doors (00490)

**Files:**
- Create: `supabase/migrations/00490_a_business_s_look_is_read_from_its_site.sql`
- Modify: `packages/db/src/database.types.ts` (tenants Row/Insert/Update; Functions), `supabase/schema.sql` (the column, the constraint, the two functions), `packages/db/src/index.ts`
- Create: `packages/db/src/repositories/look.ts`
- Test: `tooling/scripts/tests/look/workspace-look.db.test.mjs` (skips without credentials; CI replays)

- [ ] **Step 1: Claim the number.** Append `00490 | a_business_s_look_is_read_from_its_site | cm-brand-read | 28 Oct 2026` to `C:\Users\Ruben\Documents\Claude Projects\Claude Video\docs\migration-claims.md` (the claims file lives beside the repos, not in them). Production head is 00489.

- [ ] **Step 2: Write the migration.**

```sql
-- 00490 · A business's look is read from its site (decision 0075).
--
-- A workspace wears a logo (00407) and, from here, a colour: `tenants.accent`, the one hex its emails to customers
-- and the pages they open draw the button and the links in. Two doors write it:
--   set_workspace_accent   a member who may change the workspace's settings, as set_workspace_logo is;
--   wear_found_look        the service role, from the website read (website_read): the logo the site declares and the
--                          colour its page wears, written only where the column is empty AND no person ever set that
--                          field (no settings.changed event naming it with a `by`), so an owner's choice stands,
--                          including the choice of none. Its own event says `by: null, from: 'website'`.
-- Re-runnable throughout.

set local lock_timeout = '3s';

alter table public.tenants add column if not exists accent text;
alter table public.tenants drop constraint if exists tenants_accent_shape;
alter table public.tenants add constraint tenants_accent_shape
  check (accent is null or accent ~ '^#[0-9a-f]{6}$');
comment on column public.tenants.accent is
  'The workspace''s own colour (00490): one lower-case #rrggbb its emails to customers and their pages draw the button and links in; null when it has none and ink stands in. Written by set_workspace_accent (a member) and wear_found_look (the website read, only where no person set it).';

create or replace function public.set_workspace_accent(p_tenant_id uuid, p_accent text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_accent text := nullif(lower(btrim(coalesce(p_accent, ''))), '');
  v_before text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.caller_has_permission(p_tenant_id, 'settings') then
    raise exception 'Only someone who may change this workspace''s settings can change its colour.' using errcode = '42501';
  end if;
  if v_accent is not null and v_accent !~ '^#[0-9a-f]{6}$' then
    raise exception 'A colour is one #rrggbb.' using errcode = '22023';
  end if;
  select t.accent into v_before from public.tenants t where t.id = p_tenant_id for no key update;
  if not found then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  update public.tenants set accent = v_accent where id = p_tenant_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'settings.changed', 'system', 'workspace', p_tenant_id,
          jsonb_build_object('fields', jsonb_build_array('accent'), 'by', v_user, 'version', null));
  return v_before;
end $$;

revoke execute on function public.set_workspace_accent(uuid, text) from public, anon;
grant execute on function public.set_workspace_accent(uuid, text) to authenticated, service_role;
comment on function public.set_workspace_accent(uuid, text) is
  'Sets (or, with null, clears) the workspace''s colour for a caller who may change its settings, refuses anything but one #rrggbb, writes settings.changed {fields: [accent], by} in the same transaction, and answers the colour it held.';

create or replace function public.wear_found_look(p_tenant_id uuid, p_logo_path text, p_accent text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_logo   text := nullif(btrim(coalesce(p_logo_path, '')), '');
  v_accent text := nullif(lower(btrim(coalesce(p_accent, ''))), '');
  v_row    public.tenants%rowtype;
  v_wore   text[] := '{}';
begin
  if p_tenant_id is null then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_logo is not null and split_part(v_logo, '/', 1) <> p_tenant_id::text then
    raise exception 'That picture is not this workspace''s.' using errcode = '22023';
  end if;
  if v_accent is not null and v_accent !~ '^#[0-9a-f]{6}$' then
    raise exception 'A colour is one #rrggbb.' using errcode = '22023';
  end if;
  select * into v_row from public.tenants t where t.id = p_tenant_id for no key update;
  if not found then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- A field a person ever set (or cleared) is theirs: never written here.
  if v_logo is not null and v_row.logo_path is null and not exists (
    select 1 from public.events e
     where e.tenant_id = p_tenant_id and e.kind = 'settings.changed'
       and e.data->'fields' ? 'logo' and e.data->>'by' is not null)
  then
    update public.tenants set logo_path = v_logo where id = p_tenant_id;
    v_wore := v_wore || 'logo';
  end if;
  if v_accent is not null and v_row.accent is null and not exists (
    select 1 from public.events e
     where e.tenant_id = p_tenant_id and e.kind = 'settings.changed'
       and e.data->'fields' ? 'accent' and e.data->>'by' is not null)
  then
    update public.tenants set accent = v_accent where id = p_tenant_id;
    v_wore := v_wore || 'accent';
  end if;
  if cardinality(v_wore) > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'settings.changed', 'system', 'workspace', p_tenant_id,
            jsonb_build_object('fields', to_jsonb(v_wore), 'by', null, 'from', 'website', 'version', null));
  end if;
  return jsonb_build_object('logo', 'logo' = any (v_wore), 'accent', 'accent' = any (v_wore));
end $$;

revoke execute on function public.wear_found_look(uuid, text, text) from public, anon, authenticated;
grant execute on function public.wear_found_look(uuid, text, text) to service_role;
comment on function public.wear_found_look(uuid, text, text) is
  'The website read''s door (00490): wears the logo path and the colour it found, each only where the column is empty and no person ever set that field (no settings.changed naming it with a by), writes one settings.changed {fields, by: null, from: website} for what it wore, and answers {logo, accent} booleans. Service role only.';
```

- [ ] **Step 3: Hold the generated shapes to it.** In `packages/db/src/database.types.ts` find the `tenants:` table block and add `accent: string | null` to `Row` (and `accent?: string | null` to `Insert` and `Update`), next to `logo_path`. In `Functions`, add alphabetically:

```ts
      set_workspace_accent: {
        Args: { p_accent: string; p_tenant_id: string }
        Returns: string
      }
      wear_found_look: {
        Args: { p_accent: string; p_logo_path: string; p_tenant_id: string }
        Returns: Json
      }
```

In `supabase/schema.sql`: after the line `    logo_path text,` in `CREATE TABLE public.tenants` add `    accent text,`; where `tenants_logo_path_shape` is added as a constraint, add `tenants_accent_shape` the same way (`CONSTRAINT tenants_accent_shape CHECK (((accent IS NULL) OR (accent ~ '^#[0-9a-f]{6}$'::text)))`); paste both functions in pg_dump's form (`CREATE FUNCTION public.set_workspace_accent(...) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ … $$;` with their `COMMENT ON FUNCTION` lines) in alphabetical position, and the column comment. The fake database reads this snapshot: a function missing here is "not modelled" in every suite.

Run: `corepack pnpm gen:data-model` (no stack needed). Expected: `docs/data-model.md` gains the column.

- [ ] **Step 4: The repository.**

```ts
// packages/db/src/repositories/look.ts
/**
 * A workspace's look (00407's logo, 00490's colour): read for an email or a page that wears it, written by the member's
 * door or the website read's. Storage keeps the logo's PATH; the address it is served at is contracts workspaceLogoSrc.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

export interface WorkspaceLookRow {
  name: string;
  slug: string;
  logo_path: string | null;
  accent: string | null;
}

const lacksAccent = (message: string): boolean => /\baccent\b/.test(message) && /does not exist|could not find/i.test(message);

/** The row's name, slug, logo path and colour; on a database 00490 has not reached, the colour is not said. */
export async function workspaceLookOf(db: Db, tenantId: string): Promise<WorkspaceLookRow | null> {
  const r = await db.from("tenants").select("name, slug, logo_path, accent").eq("id", tenantId).maybeSingle();
  if (!r.error) return r.data ? { ...r.data, accent: r.data.accent ?? null } : null;
  if (!lacksAccent(r.error.message)) throw new Error(`cannot read the workspace's look: ${r.error.message}`);
  const older = await db.from("tenants").select("name, slug, logo_path").eq("id", tenantId).maybeSingle();
  if (older.error) throw new Error(`cannot read the workspace's look: ${older.error.message}`);
  return older.data ? { ...older.data, accent: null } : null;
}

/** The member's door: the colour set or, with null, cleared; the database decides who may. The envelope, for the route's refusal words. */
export function setWorkspaceAccent(
  db: Db,
  tenantId: string,
  accent: string | null,
): PromiseLike<{ data: unknown; error: PostgrestError | null }> {
  return db.rpc("set_workspace_accent", { p_tenant_id: tenantId, p_accent: accent ?? "" });
}

/** The website read's door: what it wore of what it found. Throws when the door refuses or the read fails. */
export async function wearFoundLook(
  db: Db,
  p: { tenantId: string; logoPath: string | null; accent: string | null },
): Promise<{ logo: boolean; accent: boolean }> {
  const { data, error } = await db.rpc("wear_found_look", {
    p_tenant_id: p.tenantId,
    p_logo_path: p.logoPath ?? "",
    p_accent: p.accent ?? "",
  });
  if (error) throw new Error(`wear_found_look: ${error.message}`);
  const d = data && typeof data === "object" ? (data as { logo?: unknown; accent?: unknown }) : {};
  return { logo: d.logo === true, accent: d.accent === true };
}
```

Export from `packages/db/src/index.ts` beside the business-reads line: `export { setWorkspaceAccent, wearFoundLook, workspaceLookOf } from "./repositories/look"; export type { WorkspaceLookRow } from "./repositories/look";`.

- [ ] **Step 5: The database test** (copy the shape of `tooling/scripts/tests/logo/workspace-logo.db.test.mjs`: its stack, its member sessions, its skip). Cases: an owner sets `#C4452E` and reads back `#c4452e`; a member without settings is refused (42501); `#zzz` is refused (22023); `wear_found_look` on a fresh workspace wears both and writes one event with `by` null; called again it wears nothing (columns filled); after the owner clears the colour (`set_workspace_accent(null)`), `wear_found_look` leaves it null (the event with a `by` stands); the authenticated role cannot execute `wear_found_look`.

- [ ] **Step 6: Build, typecheck.** `corepack pnpm --filter @chanlytics/db build && corepack pnpm --filter @chanlytics/db typecheck`. Expected: clean. Stage.

---

### Task 2: Colour math and the look's words (contracts `look/`)

**Files:**
- Create: `packages/contracts/src/look/colour.ts`, `packages/contracts/src/look/look.ts`, `packages/contracts/src/look/index.ts`
- Modify: `packages/contracts/src/index.ts` (name the barrel as the others are named)
- Test: `tooling/scripts/tests/look/colour.test.mjs`

- [ ] **Step 1: The failing test.**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { accentOk, contrastOnWhite, hexOf, isAccentLike, parseCssColour, readableOnWhite } from "@chanlytics/contracts";

test("a CSS colour is read in its common spellings, and nothing else", () => {
  assert.deepEqual(parseCssColour("#C4452E"), [196, 69, 46]);
  assert.deepEqual(parseCssColour("#abc"), [170, 187, 204]);
  assert.deepEqual(parseCssColour("#c4452eff"), [196, 69, 46]);
  assert.deepEqual(parseCssColour("rgb(16, 94, 200)"), [16, 94, 200]);
  assert.deepEqual(parseCssColour("rgba(16 94 200 / 0.5)"), [16, 94, 200]);
  assert.deepEqual(parseCssColour("rgb(50%, 0%, 100%)"), [128, 0, 255]);
  for (const bad of ["red", "#12", "transparent", "url(x)", "inherit", "var(--x)"]) assert.equal(parseCssColour(bad), null, bad);
  assert.equal(hexOf([196, 69, 46]), "#c4452e");
});

test("an accent is a saturated colour that is neither paper nor ink", () => {
  assert.equal(isAccentLike([196, 69, 46]), true);
  for (const flat of [[255, 255, 255], [0, 0, 0], [128, 128, 128], [240, 240, 238], [20, 20, 24]]) assert.equal(isAccentLike(flat), false);
  assert.equal(accentOk("#c4452e"), true);
  assert.equal(accentOk("#C4452E"), false, "stored lower-case only");
  assert.equal(accentOk("c4452e"), false);
});

test("a colour too light for white words is darkened until they read, and one that reads is left alone", () => {
  assert.equal(readableOnWhite("#c4452e"), "#c4452e");
  const pink = readableOnWhite("#ff6f91");
  assert.notEqual(pink, "#ff6f91");
  assert.ok(contrastOnWhite(pink) >= 4.5, `${pink} reads on white`);
  const [r, g, b] = parseCssColour(pink);
  assert.ok(r > g && r > b, "still pink");
});
```

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/look/colour.test.mjs`. Expected: FAIL (no such exports).

- [ ] **Step 2: Write `colour.ts`.**

```ts
/**
 * Colour as the look reads and draws it (decision 0075): a CSS colour's common spellings into a triplet, a triplet into
 * the one hex the row keeps, whether a colour could be a brand's accent rather than its paper or ink, and the darkening
 * that keeps white words readable on it (WCAG's 4.5:1). Shared by the site reader (core look/accent.ts) and the letter
 * (letter.ts), so what is read is what is drawn.
 */
export type Rgb = [number, number, number];

/** The one shape the row keeps: lower-case, six hex digits. */
export const ACCENT_HEX = /^#[0-9a-f]{6}$/;
export const accentOk = (s: unknown): s is string => typeof s === "string" && ACCENT_HEX.test(s);

const byte = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
const part = (s: string): number | null => {
  const t = s.trim();
  if (/^-?\d*\.?\d+%$/.test(t)) return byte((parseFloat(t) / 100) * 255);
  if (/^-?\d*\.?\d+$/.test(t)) return byte(parseFloat(t));
  return null;
};

/** `#abc`, `#aabbcc`, `#aabbccdd`, `rgb(…)`, `rgba(…)` with commas, spaces or a slash; anything else is null. */
export function parseCssColour(s: string): Rgb | null {
  const v = s.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1];
  if (hex) {
    const h = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = /^rgba?\(\s*([^)]*)\)$/.exec(v)?.[1];
  if (fn === undefined) return null;
  const parts = fn
    .split("/")[0]!
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(part);
  if (parts.length !== 3 || parts.some((p) => p === null)) return null;
  return parts as Rgb;
}

export const hexOf = ([r, g, b]: Rgb): string => `#${[r, g, b].map((n) => byte(n).toString(16).padStart(2, "0")).join("")}`;

/** HSL's saturation and lightness, 0..1. */
function satLight([r, g, b]: Rgb): { s: number; l: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** A colour a brand would pick as its own: saturated, and neither paper nor ink. */
export function isAccentLike(rgb: Rgb): boolean {
  const { s, l } = satLight(rgb);
  return s >= 0.25 && l >= 0.18 && l <= 0.78;
}

const channel = (c: number): number => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminanceOf = ([r, g, b]: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG's contrast of the colour against white. */
export function contrastOnWhite(hex: string): number {
  const rgb = parseCssColour(hex);
  return rgb ? 1.05 / (luminanceOf(rgb) + 0.05) : 1;
}

/** The colour, darkened in steps of six per cent until white words read on it (4.5:1); one that reads is itself. */
export function readableOnWhite(hex: string): string {
  let rgb = parseCssColour(hex);
  if (!rgb) return hex;
  for (let i = 0; i < 40 && 1.05 / (luminanceOf(rgb) + 0.05) < 4.5; i++)
    rgb = rgb.map((c) => c * 0.94) as Rgb;
  return hexOf(rgb);
}
```

- [ ] **Step 3: Write `look.ts`.**

```ts
/**
 * A workspace's look (decision 0075): its logo (00407) and its colour (00490), as an email to its customers and the
 * pages such an email opens wear them. Read off the workspace's row; drawn by the letter (letter.ts) and the link pages.
 */
import { readableOnWhite } from "./colour";

export interface WorkspaceLook {
  /** The name the email leaves as. */
  business: string;
  /** Where its logo is served (contracts workspaceLogoSrc), null for none: the name stands in as a wordmark. */
  logo_url: string | null;
  /** Its colour, #rrggbb, null for none: ink stands in. */
  accent: string | null;
}

/** A letter with no colour of its own is set in ink. */
export const ACCENT_FALLBACK = "#1f2026";

/** The colour a letter or a page draws its button and links in: the workspace's, readable under white words, else ink. */
export const accentOf = (look: Pick<WorkspaceLook, "accent">): string => readableOnWhite(look.accent ?? ACCENT_FALLBACK);

/** Every word the Colour row says. */
export const LOOK_WORDS = {
  label: "Colour",
  hint: "On your emails to customers and the pages they open: the button and the links.",
  none: "None yet",
  add: "Add",
  change: "Change",
  save: "Save",
  cancel: "Cancel",
  remove: "Use ink instead",
  saving: "Saving…",
  saved: "Saved",
  removed: "Removed",
  notSaved: "Not saved — it didn't go through. Try again.",
  unusable: "Pick a colour.",
  preview: "How an email looks",
  previewSub: "The sign-up confirmation, as a customer gets it.",
} as const;

/** The letter's own line, under every business's email. */
export const LETTER_WORDS = {
  sentFor: (business: string): string => `Sent for ${business} by Chanlytics.`,
} as const;
```

- [ ] **Step 4: Barrel.** `packages/contracts/src/look/index.ts` names every export of `colour.ts` and `look.ts` (and, after Task 3, `letter.ts`). Add the folder to `packages/contracts/src/index.ts` the way `./logo` is added there (read that line and copy its form).

- [ ] **Step 5: Build and run.** `corepack pnpm --filter @chanlytics/contracts build && node tooling/scripts/checks/test.mjs tooling/scripts/tests/look/colour.test.mjs`. Expected: PASS. Stage.

---

### Task 3: The letter, and the confirmation written on it

**Files:**
- Create: `packages/contracts/src/look/letter.ts`
- Modify: `packages/contracts/src/people/doors/signup-confirm.ts` (add `signupConfirmEmailHtml`), `packages/contracts/src/people/index.ts` (export it), `packages/contracts/src/look/index.ts`
- Test: `tooling/scripts/tests/look/letter.test.mjs`

- [ ] **Step 1: The failing test.**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmPageWords, letterHtml, signupConfirmEmailHtml } from "@chanlytics/contracts";

const LOOK = { business: "Harbor <Studio>", logo_url: "https://x.example/l.png", accent: "#2a6f97" };

test("a letter wears the business's logo and colour, says its words escaped, one button, and who sent it", () => {
  const html = letterHtml({
    look: LOOK,
    subject: "Confirm & go",
    preview: "First line",
    lines: ["Hello <you>", "Second"],
    button: { words: "Yes, do it", href: "https://x.example/c/a?b=1&c=2" },
    foot: ["A foot line"],
  });
  assert.match(html, /<img[^>]+src="https:\/\/x\.example\/l\.png"/);
  assert.match(html, /Harbor &lt;Studio&gt;/);
  assert.match(html, /Hello &lt;you&gt;/);
  assert.match(html, /background:#2a6f97/);
  assert.match(html, /href="https:\/\/x\.example\/c\/a\?b=1&amp;c=2"[^>]*>Yes, do it</);
  assert.match(html, /Sent for Harbor &lt;Studio&gt; by Chanlytics\./);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.ok(html.indexOf("First line") < html.indexOf("<table"), "the preview line comes first, hidden");
});

test("with no logo the name is the wordmark; with no colour the button is ink; a light colour is darkened", () => {
  const plain = letterHtml({ look: { business: "Nails & Co", logo_url: null, accent: null }, subject: "s", preview: "", lines: ["x"], button: { words: "Go", href: "https://x.example" }, foot: [] });
  assert.ok(!/<img/.test(plain));
  assert.match(plain, /Nails &amp; Co/);
  assert.match(plain, /background:#1f2026/);
  const light = letterHtml({ look: { business: "N", logo_url: null, accent: "#ffe066" }, subject: "s", preview: "", lines: ["x"], button: null, foot: [] });
  assert.ok(!/#ffe066/.test(light), "never the unreadable colour as given");
});

test("the sign-up confirmation is a letter: the page's own button words, the link, nothing that sells", () => {
  const html = signupConfirmEmailHtml({ business: "Harbor Studio", link: "https://app.example.com/c/abc", look: LOOK });
  const button = confirmPageWords("ask", { business: "Harbor Studio", address: null }).button;
  assert.match(html, new RegExp(`href="https://app\\.example\\.com/c/abc"[^>]*>${button}<`));
  assert.match(html, /You signed up on Harbor Studio's website for offers and news\./);
  assert.match(html, /If this wasn't you, ignore this email\./);
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: Write `letter.ts`.**

```ts
/**
 * The letter (decision 0075): the one layout every email a business sends its customers is drawn in, when it is drawn
 * at all. A reply, a reminder and a cold email stay plain, as a person's email is; a sign-up's confirmation (its first
 * use) and, later, an offer wear this. The business's look at the top (its logo, else its name), its words, one button,
 * its foot, and who sent it. Table-built with inline styles, as inboxes draw mail; a dark inbox reads the dark side from
 * the head's one media rule. Every word and address is escaped here.
 */
import { escapeHtml } from "../shared/html";
import { LETTER_WORDS, accentOf, type WorkspaceLook } from "./look";

export interface Letter {
  look: WorkspaceLook;
  subject: string;
  /** The first line an inbox's list shows, before the mail is opened. */
  preview: string;
  /** Paragraphs, in order. */
  lines: string[];
  button: { words: string; href: string } | null;
  /** Lines under the card, before the sender's own. */
  foot: string[];
}

const INK = "#1f2026";
const INK_2 = "#4b4d5a";
const INK_3 = "#6b6d7a";
const LINE = "#e3e4ec";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif";

const DARK = `@media (prefers-color-scheme:dark){.bg{background:#121317!important}.card{background:#1d1e23!important;border-color:#2c2d35!important}.ink{color:#f1f1f4!important}.ink2{color:#c3c4cc!important}.ink3{color:#9a9ba6!important}}
@media (max-width:620px){.wrap{width:100%!important}.pad{padding:22px 20px!important}}`;

export function letterHtml(l: Letter): string {
  const accent = accentOf(l.look);
  const name = escapeHtml(l.look.business);
  const mark = l.look.logo_url
    ? `<img src="${escapeHtml(l.look.logo_url)}" alt="${name}" height="40" style="display:block;height:40px;width:auto;border:0">`
    : `<span class="ink" style="font-size:18px;font-weight:700;color:${INK}">${name}</span>`;
  const lines = l.lines
    .map((p) => `<p class="ink2" style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${INK_2}">${escapeHtml(p)}</p>`)
    .join("\n");
  const button = l.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 0"><tr><td style="border-radius:10px;background:${accent}"><a href="${escapeHtml(l.button.href)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;line-height:18px;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(l.button.words)}</a></td></tr></table>`
    : "";
  const foot = [...l.foot, LETTER_WORDS.sentFor(l.look.business)]
    .map((f) => `<p class="ink3" style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${INK_3}">${escapeHtml(f)}</p>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(l.subject)}</title><style>${DARK}</style></head>
<body class="bg" style="margin:0;padding:0;background:#f6f7fa">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(l.preview)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fa;font-family:${FONT}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px">
<tr><td style="padding:0 4px 16px">${mark}</td></tr>
<tr><td class="card pad" style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:26px 28px">
${lines}
${button}
</td></tr>
<tr><td class="foot" style="padding:16px 4px 0">${foot}</td></tr>
</table></td></tr></table></body></html>`;
}
```

- [ ] **Step 3: The confirmation on it.** In `packages/contracts/src/people/doors/signup-confirm.ts`, import `letterHtml` and `WorkspaceLook` from `../../look/letter` and `../../look/look`, and add under `signupConfirmEmail`:

```ts
/** The same words as a letter (decision 0075): the business's look, two lines, the page's own button words on the link. */
export function signupConfirmEmailHtml(p: { business: string; link: string; look: WorkspaceLook }): string {
  const business = p.business.trim() || "us";
  const words = signupConfirmEmail(p);
  return letterHtml({
    look: { ...p.look, business: p.look.business.trim() || business },
    subject: words.subject,
    preview: `You signed up on ${business}'s website for offers and news.`,
    lines: [
      `You signed up on ${business}'s website for offers and news.`,
      "If this wasn't you, ignore this email. Without your yes, no offers are sent.",
    ],
    button: { words: confirmPageWords("ask", { business, address: null }).button ?? "Yes, send me offers", href: p.link },
    foot: [],
  });
}
```

(`confirmPageWords` is defined later in the same file; a function declaration hoists.) Export it from `packages/contracts/src/people/index.ts` beside `signupConfirmEmail`; export `letterHtml` and `Letter` from `look/index.ts`.

- [ ] **Step 4: Build, run.** `corepack pnpm --filter @chanlytics/contracts build && node tooling/scripts/checks/test.mjs tooling/scripts/tests/look/letter.test.mjs`. Expected: PASS. Stage.

---

### Task 4: The readers (core `look/`): the colour, the PNG that shrinks, the first mark

**Files:**
- Create: `packages/core/src/look/accent.ts`, `packages/core/src/look/logo-png.ts` (moved from `apps/dashboard/src/server/workspace/logo/png.ts`), `packages/core/src/look/found-logo.ts`
- Delete: `apps/dashboard/src/server/workspace/logo/png.ts`
- Modify: `packages/core/src/index.ts`; `apps/dashboard/src/server/workspace/logo/logo.ts` (import `remadeLogo` from `@chanlytics/core`); `apps/dashboard/src/server/workspace/logo/lookup.ts` (`firstPicture` over `siteLogoFrom`); `tooling/scripts/tests/logo/logo-png.test.mjs` (import path)
- Test: `tooling/scripts/tests/look/site-accent.test.mjs`, `tooling/scripts/tests/look/found-logo.test.mjs`, `tooling/scripts/tests/logo/logo-png.test.mjs` (+ the shrink)

- [ ] **Step 1: The accent test.**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastOnWhite } from "@chanlytics/contracts";
import { siteAccentOf } from "@chanlytics/core";

test("the page's own theme colour comes first, when it is a colour a brand would pick", () => {
  assert.equal(siteAccentOf(`<html><head><meta name="theme-color" content="#2A6F97"></head><body></body></html>`), "#2a6f97");
  assert.equal(
    siteAccentOf(`<head><meta name="theme-color" content="#ffffff"><style>.btn{background:#c4452e}</style></head>`),
    "#c4452e",
    "a white theme colour is paper, not a brand",
  );
});

test("else the buttons' colour, named or by their class, the most used winning; a light one darkened to read", () => {
  const html = `<style>
    :root{--brand-primary: rgb(16, 94, 200); --text:#222}
    .btn-primary{background:var(--brand-primary)} .cta{background-color:#105ec8;color:#fff}
    .other{background:#eee} a{color:#105ec8} footer{background:#333}
  </style>`;
  assert.equal(siteAccentOf(html), "#105ec8");
  const light = siteAccentOf(`<style>button{background:#ff6f91}</style>`);
  assert.ok(light && light !== "#ff6f91" && contrastOnWhite(light) >= 4.5, light);
});

test("a page of greys says nothing, and inline styles count", () => {
  assert.equal(siteAccentOf(`<style>body{background:#fff;color:#111}.x{background:#999}</style>`), null);
  assert.equal(siteAccentOf(`<div style="background: #7b2cbf"><button style="background:#7b2cbf">Book</button></div>`), "#7b2cbf");
  assert.equal(siteAccentOf(""), null);
});
```

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/look/site-accent.test.mjs`. Expected: FAIL.

- [ ] **Step 2: Write `accent.ts`.**

```ts
/**
 * A website's colour, read in code (decision 0075): the one its owner would call the brand's. No model: a page says it
 * in three places, in this order of trust --
 *   1. its `theme-color` meta, which a site sets on purpose;
 *   2. the background its buttons and calls to action wear, by their element or their class, and custom properties
 *      named for a brand or a primary colour (resolved one level);
 *   3. failing those, the most used colour on the page that is neither paper nor ink.
 * White, black and greys are never an accent; a colour too light for white words is darkened until they read
 * (contracts readableOnWhite), so what is kept is what a button can wear. Null when the page gives nothing.
 */
import { hexOf, isAccentLike, parseCssColour, readableOnWhite, type Rgb } from "@chanlytics/contracts";

const HTML_MAX = 400_000;
const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;
const BUTTONISH = /button|\.btn|\bcta\b|primary|accent|brand|submit|book|reserve|call-to-action/i;
const VAR_NAME = /--[\w-]*(brand|primary|accent|theme|cta|button)[\w-]*/i;

const first = (s: string, re: RegExp): string | null => re.exec(s)?.[1] ?? null;

/** The colours in a run of CSS text, as triplets, with the custom properties it defines (one level, no nesting). */
function coloursIn(css: string, vars: Map<string, Rgb>): Rgb[] {
  const out: Rgb[] = [];
  for (const m of css.replace(/var\((--[\w-]+)\)/g, (_, v: string) => (vars.has(v) ? hexOf(vars.get(v)!) : "")).match(COLOUR) ?? []) {
    const rgb = parseCssColour(m);
    if (rgb) out.push(rgb);
  }
  return out;
}

function tally(into: Map<string, number>, rgbs: Rgb[], weight = 1): void {
  for (const rgb of rgbs) {
    if (!isAccentLike(rgb)) continue;
    const key = hexOf(rgb);
    into.set(key, (into.get(key) ?? 0) + weight);
  }
}

const mostUsed = (counts: Map<string, number>): string | null =>
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

export function siteAccentOf(html: string): string | null {
  const page = html.slice(0, HTML_MAX);
  // 1. Said on purpose.
  const theme = first(page, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) ?? first(page, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
  const themed = theme ? parseCssColour(theme) : null;
  if (themed && isAccentLike(themed)) return readableOnWhite(hexOf(themed));

  const css = (page.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  const inline = (page.match(/\bstyle=["'][^"']*["']/gi) ?? []).join("\n");
  // Custom properties named for a brand, resolved for the rules that read them.
  const vars = new Map<string, Rgb>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    const rgb = parseCssColour(m[2]!.trim());
    if (rgb) vars.set(m[1]!, rgb);
  }
  // 2. The buttons' own.
  const buttons = new Map<string, number>();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!BUTTONISH.test(selector ?? "")) continue;
    const backgrounds = [...(body ?? "").matchAll(/background(?:-color)?\s*:\s*([^;}]+)/gi)].map((x) => x[1]!);
    tally(buttons, coloursIn(backgrounds.join(";"), vars), 2);
  }
  for (const [name, rgb] of vars) if (VAR_NAME.test(name)) tally(buttons, [rgb], 1);
  for (const m of page.matchAll(/<(?:button|a)\b[^>]*style=["']([^"']*)["']/gi))
    tally(buttons, coloursIn([...(m[1] ?? "").matchAll(/background(?:-color)?\s*:\s*([^;]+)/gi)].map((x) => x[1]!).join(";"), vars), 2);
  const fromButtons = mostUsed(buttons);
  if (fromButtons) return readableOnWhite(fromButtons);
  // 3. The most used colour that is neither paper nor ink.
  const any = new Map<string, number>();
  tally(any, coloursIn(`${css}\n${inline}`, vars));
  const used = mostUsed(any);
  return used ? readableOnWhite(used) : null;
}
```

- [ ] **Step 3: Move the PNG and teach it to shrink.** Copy `apps/dashboard/src/server/workspace/logo/png.ts` to `packages/core/src/look/logo-png.ts`; delete the dashboard file. Edits in the copy:
  - drop `import "server-only";`
  - import `LOGO_FOUND_SIDE_MAX` too; in `headerOf`, the side rule becomes `width !== height || width < LOGO_SIDE_MIN || width > LOGO_FOUND_SIDE_MAX`;
  - after `scanlinesOf`, add the reversal of the five filters and a box shrink:

```ts
/** The pixels, the filters undone: what each row's bytes are, not how they were predicted (PNG's five filters). */
function unfiltered(raw: Uint8Array, h: Header): Uint8Array {
  const stride = h.side * h.bytesPerPixel;
  const out = new Uint8Array(stride * h.side);
  const bpp = h.bytesPerPixel;
  for (let y = 0; y < h.side; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp]! : 0;
      const b = prev ? prev[x]! : 0;
      const c = prev && x >= bpp ? prev[x - bpp]! : 0;
      let v = src[x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = v & 0xff;
    }
  }
  return out;
}

/** A square of pixels made `to` a side by averaging each block it covers; rows written unfiltered (filter 0). */
function shrunk(pixels: Uint8Array, h: Header, to: number): Uint8Array {
  const bpp = h.bytesPerPixel;
  const out = new Uint8Array((1 + to * bpp) * to);
  const f = h.side / to;
  for (let y = 0; y < to; y++) {
    const y0 = Math.floor(y * f), y1 = Math.max(y0 + 1, Math.floor((y + 1) * f));
    for (let x = 0; x < to; x++) {
      const x0 = Math.floor(x * f), x1 = Math.max(x0 + 1, Math.floor((x + 1) * f));
      for (let ch = 0; ch < bpp; ch++) {
        let sum = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += pixels[(yy * h.side + xx) * bpp + ch]!;
        out[y * (1 + to * bpp) + 1 + x * bpp + ch] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
      }
    }
  }
  return out;
}
```

  and in `remadeLogo`, between `const raw = scanlinesOf(...)` and the header write:

```ts
  const header = walked.header;
  const fits = header.side <= LOGO_SIDE;
  const rows = fits ? raw : shrunk(unfiltered(raw, header), header, LOGO_SIDE);
  const side = fits ? header.side : LOGO_SIDE;
```

  (then `view.setUint32(0, side)`, `view.setUint32(4, side)`, `deflateSync(rows, …)`, and the answer's `side`). Update `apps/dashboard/src/server/workspace/logo/logo.ts`: `import { remadeLogo } from "@chanlytics/core";` in place of `./png`. Update `tooling/scripts/tests/logo/logo-png.test.mjs` line 14 to import from `packages/core/src/look/logo-png.ts` (see how it imports today) and add:

```js
test("a square too big for the circle is shrunk to it by averaging, and comes out a PNG the server keeps", () => {
  // 512 square, truecolour: the left half red, the right half blue.
  const side = 512, bpp = 3;
  const raw = Buffer.alloc((1 + side * bpp) * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) raw.set(x < side / 2 ? [255, 0, 0] : [0, 0, 255], y * (1 + side * bpp) + 1 + x * bpp);
  const out = remadeLogo(new Uint8Array(png(ihdr(side, 2), chunk("IDAT", deflateSync(raw)), chunk("IEND"))));
  assert.equal(out.ok, true);
  assert.equal(out.side, 256);
  const again = remadeLogo(out.png);
  assert.deepEqual([again.ok, again.side], [true, 256], "its own output is kept as it is");
  const idat = inflateSync(idatOf(out.png));
  assert.deepEqual([...idat.subarray(1, 4)], [255, 0, 0], "left is red");
  assert.deepEqual([...idat.subarray(1 + 255 * 3, 1 + 256 * 3)], [0, 0, 255], "right is blue");
});
```

  (`ihdr(side, colourType)`, `png(...)`, `chunk(...)` and an `idatOf(bytes)` helper: read the file's existing helpers and extend `ihdr` to take the side and the colour type if it does not already.)

- [ ] **Step 4: The first mark, lifted.**

```ts
// packages/core/src/look/found-logo.ts
/**
 * The first mark a page declares that is a picture worth keeping (00407's lookup, now shared with the website read,
 * decision 0075): the candidates leadMarksFrom finds, best first; a vector or a favicon file passed over by its name;
 * the first whose bytes are an image of a kind we keep, with sides the circle can be made from. The image read is the
 * caller's (channels imageBytes behind a fetcher): this decides, and asks for at most LOGO_TRIES.
 */
import { LOGO_FOUND_SIDE_MAX, LOGO_FOUND_SIDE_MIN } from "@chanlytics/contracts";
import { leadMarksFrom } from "../leads/mark";
import { imageHeaderOf, type MarkImage } from "../leads/mark-image";

/** Past three, what is left is a favicon. */
export const LOGO_TRIES = 3;

/** A candidate worth asking for: the web's own port, and not a vector or a favicon file by its name. */
export function askableMark(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.port && u.port !== "443" && u.port !== "80") return false;
    return !/\.(svg|ico)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Sides the circle can be made from, and a kind the browser and the server both keep. */
export function markFits(head: MarkImage): boolean {
  if (head.kind === "ico") return false;
  const short = Math.min(head.width, head.height);
  const long = Math.max(head.width, head.height);
  return short >= LOGO_FOUND_SIDE_MIN && long <= LOGO_FOUND_SIDE_MAX;
}

export interface FoundLogo {
  url: string;
  bytes: Uint8Array;
  head: MarkImage;
}

export async function siteLogoFrom(
  image: (url: string) => Promise<Uint8Array | null>,
  html: string,
  origin: string,
): Promise<FoundLogo | null> {
  for (const url of leadMarksFrom(html, origin).filter(askableMark).slice(0, LOGO_TRIES)) {
    const bytes = await image(url);
    const head = bytes ? imageHeaderOf(bytes) : null;
    if (bytes && head && markFits(head)) return { url, bytes, head };
  }
  return null;
}
```

  In `apps/dashboard/src/server/workspace/logo/lookup.ts`, replace `askable`, `TRIES` and the loop in `firstPicture` with `const found = await siteLogoFrom((url) => imageBytes(fetcher, url, IMAGE_MS, LOGO_FOUND_MAX_BYTES), html, origin); return found ? { base64: Buffer.from(found.bytes).toString("base64"), content_type: found.head.contentType } : null;` (drop the now-unused imports). Export `siteAccentOf`, `remadeLogo`, `siteLogoFrom`, `askableMark`, `markFits`, `LOGO_TRIES`, `FoundLogo` from `packages/core/src/index.ts`.

- [ ] **Step 5: The found-logo test.** `tooling/scripts/tests/look/found-logo.test.mjs`: a page declaring an SVG icon, then a 32px .ico, then an apple-touch-icon; `image` answers PNG headers (the 8-byte signature + IHDR with the size; see `logo-routes.test.mjs` line 330's helper) — the SVG and the .ico are never asked for, the 180px icon is found; a page whose only mark is 2049px wide answers null; at most three are asked for.

- [ ] **Step 6: Build, run all four, typecheck the dashboard.** `corepack pnpm --filter @chanlytics/core build`, then the four test files one per command, then `corepack pnpm --filter @chanlytics/dashboard typecheck` and `node tooling/scripts/checks/test.mjs tooling/scripts/tests/logo/logo-routes.test.mjs` (the lookup still passes). Stage.

---

### Task 5: An HTML part given whole (channels)

**Files:**
- Modify: `packages/channels/src/email/request.ts`
- Test: the file that holds `buildEmailRequest`'s cases (`grep -l buildEmailRequest tooling/scripts/tests -r`); add two.

- [ ] **Step 1: Failing tests.** In that file: (a) `buildEmailRequest({ …a first email…, html: "<p>drawn</p>" }).html === "<p>drawn</p>"` while `text` is the words; (b) `plain: true` with `html` given → `html === ""`; (c) a campaign with `html` throws `/a campaign's HTML is the builder's/`.

- [ ] **Step 2: The field.** In `EmailRequestInput` add:

```ts
  /**
   * The HTML part drawn whole by the sender (a sign-up's confirmation letter, contracts letterHtml), in place of the
   * twin of the words; `body` stays the words a text-only reader gets. Never with a campaign: its foot and its
   * unsubscribe link are this builder's to put in.
   */
  html?: string | null;
```

  In `buildEmailRequest`, after the campaign footer check: `if (i.html?.trim() && i.campaign) throw new Error("buildEmailRequest: a campaign's HTML is the builder's");` and `const html = i.plain ? "" : i.html?.trim() || htmlOf(i, footerHtml, text);`.

- [ ] **Step 3: Build, run.** `corepack pnpm --filter @chanlytics/channels build` + the test. PASS. Stage.

---

### Task 6: The edge wears it (the job step and the email)

**Files:**
- Create: `apps/edge/lib/imports/look.ts`
- Modify: `apps/edge/lib/imports/website-read.ts`, `apps/edge/lib/website/signup-confirm.ts`, `apps/edge/lib/log-events.ts` (`website_look`, `website_look_failed`), `packages/contracts/src/imports/business-reads.ts` (`look` on the facts)
- Test: `tooling/scripts/tests/imports/a-website-is-read-for-check.test.mjs`, `tooling/scripts/tests/people/doors/signup-confirm.test.mjs`

- [ ] **Step 1: The facts carry the look.** In `business-reads.ts`, `BusinessReadFacts` gains `look: LookRead | null` with

```ts
/** What the website read found of the business's look, and what it wore (decision 0075). */
export interface LookRead {
  /** The mark the site declares, as the site serves it (for the Logo row to offer); null for none found. */
  logo_url: string | null;
  /** The page's colour, readable; null for none. */
  accent: string | null;
  worn: { logo: boolean; accent: boolean };
}
```

  and `businessReadFactsOf` reads it leniently: `look: lookOf(r.look)` where `lookOf` returns null unless an object, with `logo_url`/`accent` as strings or null and `worn` booleans (false unless `=== true`). Export the type from the barrel.

- [ ] **Step 2: Failing test — the read wears the look.** In `a-website-is-read-for-check.test.mjs`, teach `web(pages, answer, images = {})` to answer an image URL with `new Response(images[u], { headers: { "content-type": "image/png" } })`, and give the world a storage stub and the door:

```js
function lookWorld() {
  const w = world();
  w.uploads = [];
  w.removed = [];
  w.db.storage = {
    from: (bucket) => ({
      upload: async (path, bytes, opts) => (w.uploads.push({ bucket, path, bytes: bytes.length, opts }), { error: null }),
      remove: async (paths) => (w.removed.push(...paths), { error: null }),
    }),
  };
  return w;
}
```

  and `fakeDb(tables, {}, { wear_found_look: (a) => ({ logo: !!a.p_logo_path, accent: !!a.p_accent }) })` in `world()` (the third argument). A 180×180 truecolour PNG for the icon: build it with `zlib.deflateSync` as `logo-png.test.mjs` does (lift its `png/ihdr/chunk` helpers into `tooling/scripts/tests/look/_png.mjs` and import them in both). Test:

```js
test("the website's look: its colour and the square icon it declares are worn where the workspace has none, and kept with the read", async () => {
  const w = lookWorld();
  const home = `<html><head><meta name="theme-color" content="#2a6f97"><link rel="apple-touch-icon" href="/icon.png"></head><body><h1>Harbor Moving</h1></body></html>`;
  const net = web({ [`${SITE}/`]: home }, READ, { [`${SITE}/icon.png`]: squarePng(180) });
  try { await read(w); } finally { net.restore(); }
  assert.equal(w.uploads.length, 1);
  assert.match(w.uploads[0].path, new RegExp(`^${A}/[0-9a-f-]{36}\\.png$`));
  assert.equal(w.uploads[0].opts.contentType, "image/png");
  const door = w.db.seen.find((s) => s.rpc === "wear_found_look");
  assert.deepEqual([door.args.p_tenant_id, door.args.p_logo_path, door.args.p_accent], [A, w.uploads[0].path, "#2a6f97"]);
  assert.deepEqual(w.tables.business_reads[0].facts.look, { logo_url: `${SITE}/icon.png`, accent: "#2a6f97", worn: { logo: true, accent: true } });
  assert.deepEqual(w.removed, [], "a picture worn is kept");
});

test("a look the door declines is not left in storage, and a page with no mark or colour wears nothing and says so", async () => {
  const w = lookWorld();
  w.db.rpcs.wear_found_look = () => ({ logo: false, accent: false }); // see how the suite replaces a door; else build the world with it
  const net = web({ [`${SITE}/`]: `<head><link rel="apple-touch-icon" href="/i.png"></head>` }, READ, { [`${SITE}/i.png`]: squarePng(180) });
  try { await read(w); } finally { net.restore(); }
  assert.equal(w.removed.length, 1, "the file nobody wears is removed");
  const bare = lookWorld();
  const net2 = web({ [`${SITE}/`]: HOME }, READ);
  try { await read(bare); } finally { net2.restore(); }
  assert.deepEqual(bare.tables.business_reads[0].facts.look, { logo_url: null, accent: null, worn: { logo: false, accent: false } });
  assert.equal(bare.uploads.length, 0);
});
```

  (Check how `fakeDb` exposes what a test passed as `rpcs`: if it does not, make `lookWorld({ wears })` build the world with the handler it needs.)

- [ ] **Step 3: Write `wear.ts`.**

```ts
/**
 * The website read's look step (decision 0075): the page's colour read in code (core siteAccentOf), the mark the site
 * declares fetched and judged as the Logo row's lookup judges it (core siteLogoFrom), remade as the square PNG a
 * workspace wears (core remadeLogo) and stored in 00407's bucket under the workspace's own folder, and both worn through
 * wear_found_look, which fills only what no person set. What was found is answered for the read to keep, whether or not
 * it was worn: the Logo row offers a mark the server could not make square. Never throws: a look that fails is logged,
 * and the read goes on.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGO_FOUND_MAX_BYTES, SECOND_MS, WORKSPACE_LOGOS_BUCKET, workspaceLogoPath, type LookRead } from "../packages/contracts.js";
import { imageBytes } from "../packages/channels.js";
import { remadeLogo, siteAccentOf, siteLogoFrom } from "../packages/core.js";
import { wearFoundLook, type Database } from "../packages/db.js";
import { errField, logger } from "../log.js";

type Db = SupabaseClient<Database>;

const IMAGE_MS = 4 * SECOND_MS;
const STORE_MS = 4 * SECOND_MS;
/** A day, as the dashboard's save caches a logo: a replaced picture has a new name. */
const CACHE_S = String(24 * 60 * 60);

/** The PNG stored under the workspace's folder, or null when storage refused or did not answer in time. */
async function stored(db: Db, tenantId: string, png: Uint8Array): Promise<string | null> {
  const path = workspaceLogoPath(tenantId, randomUUID());
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<{ error: { message: string } }>((resolve) => {
      timer = setTimeout(() => resolve({ error: { message: `timed out after ${STORE_MS} ms` } }), STORE_MS);
    });
    const upload = db.storage.from(WORKSPACE_LOGOS_BUCKET).upload(path, png, { contentType: "image/png", cacheControl: CACHE_S, upsert: false });
    const { error } = await Promise.race([upload, late]);
    if (error) throw new Error(error.message);
    return path;
  } catch (e) {
    logger({ tenant_id: tenantId }).warn("website_look_failed", { step: "store", error: errField(e) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function wearSiteLook(
  db: Db,
  p: { tenantId: string; html: string; origin: string; fetchImpl?: typeof fetch },
): Promise<LookRead> {
  const L = logger({ tenant_id: p.tenantId });
  const none: LookRead = { logo_url: null, accent: null, worn: { logo: false, accent: false } };
  try {
    const fetchImpl = p.fetchImpl ?? fetch;
    const accent = siteAccentOf(p.html);
    const found = await siteLogoFrom((url) => imageBytes(fetchImpl, url, IMAGE_MS, LOGO_FOUND_MAX_BYTES), p.html, p.origin);
    const made = found ? remadeLogo(found.bytes) : null;
    const path = made?.ok ? await stored(db, p.tenantId, made.png) : null;
    const worn = await wearFoundLook(db, { tenantId: p.tenantId, logoPath: path, accent });
    if (path && !worn.logo) await db.storage.from(WORKSPACE_LOGOS_BUCKET).remove([path]).catch(() => undefined);
    L.info("website_look", {
      logo: !found ? "none" : worn.logo ? "worn" : made?.ok ? "kept" : "offered",
      accent: !accent ? "none" : worn.accent ? "worn" : "kept",
    });
    return { logo_url: found?.url ?? null, accent, worn };
  } catch (e) {
    L.warn("website_look_failed", { step: "wear", error: errField(e) });
    return none;
  }
}
```

  Add `"website_look"` and `"website_look_failed"` to `apps/edge/lib/log-events.ts` beside `website_read`.

- [ ] **Step 4: The job calls it.** In `website-read.ts`: move `if (!env.ANTHROPIC_API_KEY) …` below the home fetch; after `if (!home) return keep({}, WEBSITE_UNREAD_WORDS.silent);` add `const look = await wearSiteLook(db, { tenantId, html: home, origin: new URL(url).origin });` then `if (!env.ANTHROPIC_API_KEY) return keep({ look }, WEBSITE_UNREAD_WORDS.failed);`; the model-failed path keeps `{ look }` too; `kept` gains `look`. The log line `website_read` gains nothing (the look logs itself).

- [ ] **Step 5: The confirmation email wears it.** In `signup-confirm.ts`: read `workspaceLookOf(db, p.tenantId)` in the `Promise.all` with the facts and the mailbox; build

```ts
  const look = {
    business: sendsAs.mailbox.from_name,
    logo_url: workspaceLogoSrc(env.SUPABASE_URL, row?.logo_path),
    accent: row?.accent ?? null,
  };
  const html = signupConfirmEmailHtml({ business: sendsAs.mailbox.from_name, link, look });
```

  and pass `html` to `buildEmailRequest`. (Check the edge's env getter for the Supabase URL in `apps/edge/lib/env.ts`; `workspaceLogoSrc` is contracts'.) Extend `signup-confirm.test.mjs`: the world's tenant row gets `logo_path: "aaaaaaaa-…/11111111-1111-4111-8111-111111111111.png", accent: "#2a6f97"`; assert the queued row's `meta.email.request.html` carries `background:#2a6f97`, the `<img` with the storage address, and the button on the link; and a tenant with neither wears the wordmark and ink.

- [ ] **Step 6: Run both suites; typecheck the edge.** Expected: PASS. Stage.

---

### Task 7: The dashboard: the pages, the route, the list, the row

**Files:**
- Modify: `apps/dashboard/src/server/public/link-page.ts`, `confirm.ts`, `unsubscribe.ts`; `apps/dashboard/src/server/workspace/workspace-list.ts`; `apps/dashboard/src/legacy-bridge/refresh-map.ts`; `apps/dashboard/src/surfaces/settings/business/who.tsx`; `apps/dashboard/src/legacy/styles/settings.css`
- Create: `apps/dashboard/src/server/workspace/look.ts`, `apps/dashboard/app/api/v1/workspaces/accent/route.ts`, `apps/dashboard/src/surfaces/settings/business/look/row.tsx`, `.../look/verbs.ts`
- Modify (generated): `tooling/scripts/tests/route-policy.json`, `apps/dashboard/src/client/routes.generated.ts`, `packages/contracts/src/route-keys.generated.ts`, `docs/api.md`
- Test: `tooling/scripts/tests/look/accent-route.test.mjs`, `tooling/scripts/tests/people/doors/confirm-page.test.mjs` (new, if no suite drives `confirmGet` today), the workspace-list suite if one exists (`grep -rl workspace-list tooling/scripts/tests`)

- [ ] **Step 1: The pages.** In `link-page.ts` turn the constant into `linkPageStyle(accent: string | null): string` (the same CSS; when `accent` is given, `--accent:${accentOf({ accent })};--on-accent:#fff` in both the light and the dark block) and add

```ts
/** The business at the top of the page: its logo, else its name, as the letter wears it. */
export function linkPageMark(look: { business: string | null; logo_url: string | null }): string {
  if (look.logo_url) return `<img class="mark" src="${escapeHtml(look.logo_url)}" alt="${escapeHtml(look.business ?? "")}" height="40">`;
  return look.business ? `<p class="who">${escapeHtml(look.business)}</p>` : "";
}
```

  with `.mark{display:block;height:40px;width:auto;margin:0 0 14px}.who{margin:0 0 14px;font-weight:700;color:var(--ink)}` in the style. `confirm.ts`: `Asked` gains `look: { logo_url: string | null; accent: string | null }`; `confirmationAsked` reads `workspaceLookOf(db, c.tenantId)` in parallel and fills it (`logo_url: workspaceLogoSrc(env.NEXT_PUBLIC_SUPABASE_URL, row?.logo_path)`); `confirmPage` draws `linkPageMark` above the card and `linkPageStyle(asked.look.accent)`; `NOBODY` carries nulls. `unsubscribe.ts`: where `businessName` is read, read the look row too and draw the same mark and style (keep its name source as it is).

- [ ] **Step 2: The route.** `apps/dashboard/src/server/workspace/look.ts`:

```ts
import "server-only";
import { AppError, LOOK_WORDS, accentOk } from "@chanlytics/contracts";
import { setWorkspaceAccent } from "@chanlytics/db";
import type { Member } from "@/server/route";
import type { RouteContext } from "@/server/with-route";
import { doorRefusal } from "./logo/logo";

/** PUT workspaces/accent: the colour, as the route's schema held it; DELETE: cleared. */
export async function saveAccent(ctx: RouteContext, member: Member, accent: string | null): Promise<{ accent: string | null }> {
  if (accent !== null && !accentOk(accent)) throw new AppError("validation", LOOK_WORDS.unusable);
  const { error } = await setWorkspaceAccent(ctx.supabase, member.tenantId, accent);
  if (error) throw doorRefusal(error);
  return { accent };
}
```

  Export `doorRefusal` from `logo/logo.ts` (it is file-local today). The route file mirrors `workspaces/logo/route.ts`: `PUT` with `input: z.object({ accent: z.string().regex(ACCENT_HEX, { error: LOOK_WORDS.unusable }) })`, `DELETE` with `saveAccent(ctx, member, null)`; same scope and role; rate: the logo's `workspace_logo` unless `route.ts` offers a settings rate (read its rate names and pick the one the Business tab's saves use). Add both rows to `route-policy.json`, then `node tooling/scripts/gen/route-types.mjs && corepack pnpm gen:api-reference`.

- [ ] **Step 3: The list.** `workspace-list.ts`: newest `COLUMN_SETS` entry `"id, slug, name, status, timezone, appointment_word, logo_path, accent"`; `lacksNewer`'s regex `\b(appointment_word|logo_path|accent)\b`; `TenantRead.accent?: string | null`; `WorkspaceRow.accent?: string | null`; `listed` sets `accent: t.accent ?? null`. `refresh-map.ts`: `"PUT workspaces/accent"` and `"DELETE workspaces/accent"` read the list again, as the logo's entries do (copy them).

- [ ] **Step 4: The row.** `look/verbs.ts`:

```ts
import type { ApiResult } from "@/client/api";
import { api } from "@/legacy-bridge/api";

export const lookVerbs = {
  save: (accent: string): Promise<ApiResult<{ accent: string | null }>> => api()("PUT workspaces/accent", { body: { accent }, once: true }),
  remove: (): Promise<ApiResult<{ accent: null }>> => api()("DELETE workspaces/accent"),
};
```

  `look/row.tsx`, after the logo row's shape (export `useWorkspace` from `../logo/row.tsx`): a `RecordRow id="accent" label={LOOK_WORDS.label}` whose value is a swatch — `<svg width="18" height="18" aria-hidden="true"><rect width="18" height="18" rx="5" fill={accent} /></svg> {accent}` — or `LOOK_WORDS.none`; `hint={LOOK_WORDS.hint}`; act `Change`/`Add` opens the editor (local `open` state): a `RecordField id="bt-accent" label={LOOK_WORDS.label} type="color" value={draft} onChange={setDraft}`, kit `Button`s Save / Cancel / (when set) `LOOK_WORDS.remove` (variant quiet, danger), and under them the preview: `<iframe className="bt-look-preview" title={LOOK_WORDS.preview} sandbox="" srcDoc={signupConfirmEmailHtml({ business: ws?.name ?? "", link: "#", look: { business: ws?.name ?? "", logo_url: ws?.logo_url ?? null, accent: draft || null } })} />`. Save → `lookVerbs.save(draft.toLowerCase())` → flash `LOOK_WORDS.saved`; remove → `lookVerbs.remove()` → flash `LOOK_WORDS.removed`; a refused save says `r.message || LOOK_WORDS.notSaved` in the hint. Gate every act with `gate("settings", "change the colour")`. Place `<BtColourRow canEdit={canEdit} flash={flash} />` after `<BtLogoRow>` in `who.tsx`. CSS in `settings.css` next to `.bt-logo-acts`: `.bt-look-preview { display: block; width: 100%; height: 440px; margin-top: 10px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }` (use the token names that file already reads for a line and a surface; a new literal is a red build).

- [ ] **Step 5: Tests.** `accent-route.test.mjs` after `logo-routes.test.mjs`: the two policies pinned; `PUT` with `#2A6F97` calls the door with `#2A6F97` (the door lower-cases); `#zz` is refused 400 with `LOOK_WORDS.unusable`; `DELETE` calls it with `""`; a door's 42501 is a 403. `confirm-page.test.mjs` (`setLinkPageClient` over a fakeDb holding `tenants` with `logo_path` + `accent`, `messages` with the confirmation row, and `set_email_offers_yes: () => "recorded"`): GET draws the `<img>` with the storage address and `--accent:#2a6f97`; a tenant with neither draws the name and the product's accent; POST with `confirm=yes` answers the done view. Extend the workspace-list suite, if one exists, so a row answers `accent`.

- [ ] **Step 6: Typecheck, lint the files touched, run the suites.** `corepack pnpm --filter @chanlytics/dashboard typecheck`; `corepack pnpm lint` (the kit rule: no raw `<button>`/`<input>` in the row); the four suites. Then run the app (`.claude/launch.json` entry for `cm-brand-read`, dashboard dev) and open Settings › Business: the Colour row draws, Change shows the picker and the preview, Save lands (the row re-reads the list) — screenshot it. Stage.

---

### Task 8: Existing workspaces (the script)

**Files:**
- Create: `tooling/scripts/ops/look/look-backfill.mjs`
- Test: a dry run against production (reads only), its output pasted in the PR

- [ ] **Step 1: Write it** in the shape of `lead-marks-backfill.mjs` (env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; `--apply`; `--slug <workspace>` to take one; a JSONL backup under `tooling/backups/look-backfill-<ISO>.jsonl` of every planned row before any write):
  1. `tenants` where `status = 'active'` and (`logo_path is null` or `accent is null`): `id, slug, name, logo_path, accent`.
  2. For each: the website from `tenant_config.config.brain.profile.website`, else `google_listings.facts.website`; `feedUrlOk` (contracts) decides; none → skipped, said.
  3. Plan: `{ tenant_id, slug, website, missing: ["logo" | "accent"] }`; print a table and the counts.
  4. `--apply`: `scheduleJobOnce(db, { tenantId, kind: "website_read", dueAt: new Date(), payload: { url } })` from `../../../packages/jobs/src/schedule.ts`; count `scheduled` / `already_scheduled`; the job runner does the rest within minutes.

- [ ] **Step 2: Dry-run it** with the production env from `.secrets/chanlytics/` (read-only; nothing is written without `--apply`): `node --import tsx tooling/scripts/ops/look/look-backfill.mjs`. Expected: the salon's workspace listed with its site. Paste the plan in the PR. **Do not `--apply` until 00490 is on production and Ruben says so.**

---

### Task 9: Docs, hygiene, the pull request's words (no commit without Ruben's word)

- [ ] **Step 1: Decision 0075** `docs/decisions/0075-a-business-s-look-is-read-from-its-site.md` (against the lane's base commit): context (every customer email was plain; the brand is whoever the reader deals with; a model draws no layout), decision (two facts on the row; the read fills what no person set; one letter; visit mail stays plain, offers next), steps (00490; the read; the email and the pages; the row; the script), consequences. Row in `docs/decisions/README.md` in the table's form.
- [ ] **Step 2: `docs/system-prd.md`**: a line under the website read and under Settings › Business.
- [ ] **Step 3: Ratchets.** `corepack pnpm check:dead-exports` (the moved `png.ts`; the lifted lookup helpers); `corepack pnpm lint`; `corepack pnpm format`; `corepack pnpm -r typecheck`; `corepack pnpm --filter "./packages/*" build` and stage every `dist`; the test files touched, one per command; `node tooling/scripts/checks/changed-tests.mjs` if it lists what CI would run.
- [ ] **Step 4: The PR body** (saved to the scratchpad, not committed): what changes for a customer (the confirmation email and its page wear the business; nothing else yet); what to apply before merging (00490 on production, then the backfill's `--apply` on Ruben's word); deploy order either (the edge reads the row leniently; the dashboard's list reads without `accent` on an older database); the dry run's plan; `Bundle:` line if the row's chunk grows past 2 KB (contracts' letter rides into the settings page: say so).

---

## Self-review

- Spec coverage: logo + accent in `website_read`'s output (Task 6 keeps `look` on the read, Task 1's door wears it); preview with override in Settings › Business (Task 7's row previews the very email); backfill (Task 8); the confirmation email and its pages branded (Tasks 3, 6, 7); the owner's choice stands (Task 1's door); no model (Task 4 is code). Gap, said and left: the Logo row does not yet offer the mark the read found but could not make square (`look.logo_url`); the owner's "Use the one on your website" press does the same by hand. Lane 4 (the offer letter) reuses `letterHtml`.
- Types: `WorkspaceLook { business, logo_url, accent }` (contracts) is what `letterHtml`, `signupConfirmEmailHtml` and the row build; `LookRead { logo_url, accent, worn }` (contracts, on `BusinessReadFacts.look`) is what `wearSiteLook` answers; `WorkspaceLookRow { name, slug, logo_path, accent }` (db) is the row; `wearFoundLook` answers `{ logo, accent }` booleans as the door does.
- Placeholders: none; every step names its file and shows its code or its exact command.
