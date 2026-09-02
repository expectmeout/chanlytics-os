/**
 * Creating a workspace, without handing anyone the keys to do it.
 *
 * Every tenant to date was inserted by a migration or by hand in SQL, so
 * onboarding a second business was an engineering task. The missing piece was
 * never the UI — it was that `tenants` and `memberships` are SELECT-only under
 * RLS, deliberately: an INSERT policy on tenants would let any signed-in user
 * mint rows, and one on memberships would let them join a workspace nobody
 * invited them to.
 *
 * So the write goes through ONE security-definer function. These pin the
 * properties that make that safe rather than merely convenient — and the two
 * failure modes this project has already had elsewhere: a privileged path
 * reachable by the wrong caller, and a screen that renders a claim before the
 * data behind it has arrived.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRaw, readCode } from "./_source.mjs";

const sql = readRaw("supabase/migrations/00021_create_workspace.sql");
const route = readCode("apps/dashboard/app/api/v1/workspaces/create/route.ts");
const boot = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
const form = readCode("apps/dashboard/src/legacy-bridge/CreateWorkspace.tsx");

/* --------------------------- the privilege boundary ----------------------- */

test("anon cannot mint a tenant; only a signed-in caller can", () => {
  assert.match(sql, /revoke execute on function public\.create_workspace\(text, text\) from public, anon;/);
  assert.match(sql, /grant\s+execute on function public\.create_workspace\(text, text\) to authenticated;/);
});

test("the caller is read inside the function, never passed in", () => {
  // If the user were a parameter, anyone who could call the RPC could make
  // anyone else the owner of a workspace — or add themselves to one.
  assert.match(sql, /v_user\s+uuid\s*:=\s*auth\.uid\(\);/);
  assert.ok(!/p_user|p_owner|p_user_id/.test(sql), "identity must not be an argument");
  assert.match(sql, /if v_user is null then/, "and a session without a user is refused");
});

test("the privilege is scoped, not ambient", () => {
  assert.match(sql, /security definer/);
  // Without a pinned search_path, a definer function resolves unqualified names
  // through the CALLER's path — the classic privilege-escalation route.
  assert.match(sql, /set search_path = public/);
});

test("tenant and membership are one transaction", () => {
  // A tenant whose membership insert failed is a workspace nobody can see,
  // own or delete — and it still holds a slug. Two REST calls could not have
  // this property; a function body is one transaction.
  const tenantAt = sql.indexOf("insert into public.tenants");
  const memberAt = sql.indexOf("insert into public.memberships");
  assert.ok(tenantAt > 0 && memberAt > tenantAt, "both inserts live in the same body");
  assert.ok(!/commit;/i.test(sql), "no explicit commit that could split them");
});

/* ------------------------------ the inputs -------------------------------- */

test("an unreal timezone is refused at the door", () => {
  // describeNow() falls back to "you do not know what day it is" on an unknown
  // zone — so a typo here silently costs the receptionist its clock, forever,
  // with nothing on screen to say why.
  assert.match(sql, /from pg_timezone_names z where z\.name = v_tz/);
  assert.match(sql, /raise exception 'Unknown timezone/);
});

test("pg_timezone_names.name is QUALIFIED, because the function returns a `name`", () => {
  // PL/pgSQL keeps OUT parameters in scope for the whole body, so an
  // unqualified `name` here is ambiguous — and it fails at call time, not at
  // creation. This one shipped broken and was caught by running it.
  assert.ok(!/where name = v_tz/.test(sql), "the unqualified form is the bug");
});

test("slug generation terminates, and always produces something", () => {
  assert.match(sql, /if v_try > 50 then/, "the collision counter is bounded");
  assert.match(sql, /v_base := 'workspace';/, "a name of pure punctuation still gets a slug");
  assert.match(sql, /btrim\(v_base, '-'\);\s*--\s*left\(\) can strand/, "truncation cannot leave a trailing dash");
});

test("there is a cap, so one account cannot fill the tenants table", () => {
  assert.match(sql, /if v_owned >= 10 then/);
  assert.match(sql, /errcode = '54000'/, "a distinct code, so the route can say why");
});

/* -------------------------------- the route ------------------------------- */

test("the route parses its body with a schema", () => {
  // Most /v1 routes hand-check fields; this one is new, so it sets the better
  // precedent rather than inheriting the older one.
  assert.ok(route.includes("Body.safeParse"), "zod, not hand-rolled checks");
  assert.ok(route.includes(".strict()"), "an unexpected field is a mistake, not a silent no-op");
});

test("the route does NOT call requireRole, and says why", () => {
  // Every other mutating route scopes to a workspace the caller belongs to.
  // There is no such workspace here — this is the write that creates the thing
  // roles are scoped to. The session is the authorisation.
  assert.ok(!route.includes("requireRole"), "there is no existing workspace to have a role in");
  assert.ok(!route.includes("SERVICE_ROLE"), "service-role never enters the request path");
  // Checked against the RAW file: an absent guard is the kind of thing a
  // reviewer flags as an oversight unless the reason sits next to it, and
  // readCode() strips exactly the comment that carries it.
  assert.match(
    readRaw("apps/dashboard/app/api/v1/workspaces/create/route.ts"),
    /NOTE THE ABSENT ROLE CHECK, which is deliberate/,
    "the missing role check must explain itself in the file",
  );
});

test("the function's own messages reach the owner", () => {
  // "Unknown timezone: Mars/Olympus" is more useful than "invalid input".
  assert.ok(route.includes("throw new AppError(mapped.code, error.message, mapped.status)"));
  assert.ok(route.includes('"54000"') && route.includes('"22023"') && route.includes('"28000"'));
});

/* ------------------------------- the screen ------------------------------- */

test("the create screen waits for the fetch before claiming there is nothing", () => {
  // Before the workspace surface resolves, EVERY account looks like it has no
  // workspaces. Flashing "create your workspace" at an owner who has one is
  // the same class of lie as painting mockup data during a load — which this
  // project has shipped twice.
  assert.ok(
    boot.includes('isSurfaceReady("workspace") && allWorkspaces.length === 0'),
    "readiness must be part of the condition",
  );
});

test("a created workspace becomes the active one", () => {
  // Otherwise the owner creates a workspace and stays looking at nothing.
  assert.ok(boot.includes("switchWorkspace(w.id)"));
});

test("the form defaults the timezone to the browser's, and says what it decides", () => {
  assert.ok(form.includes("Intl.DateTimeFormat().resolvedOptions().timeZone"));
  assert.ok(form.includes("Your opening hours are read in this timezone."));
});

test("the server's refusal is shown, not swallowed or replaced", () => {
  assert.ok(form.includes("body?.error?.message ??"), "the server's own words first");
  assert.ok(form.includes("setBusy(false)"), "and the form becomes usable again");
});
