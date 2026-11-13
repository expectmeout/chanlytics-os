/**
 * A page of People reads its own people's reply modes (people_reply_modes, 00624), on a real database.
 *
 * The page is people_page's, taken with the arguments people_list takes, so the two reads name the same people; each
 * person's mode is their own reply policy, else the workspace's, else none. What this proves: the same people as
 * people_list's page, a person's own mode over the workspace's, nobody's past the page, and none where the workspace set
 * none. Everything happens in a transaction on this machine's database that never commits, read through the CLI as the
 * other People suites are; SUPABASE_CLI names the binary when `supabase` is not on PATH.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite reads the local stack through the CLI"
    : false;

/** A transaction that never commits: `body` runs in a DO block that ends by raising what it `seen`, as hex. */
function neverCommitted(body) {
  const sql = `do $$ declare seen jsonb := '{}'; ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const run = spawnSync(CLI, ["db", "query", "--local", sql], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 });
  if (run.error)
    throw new Error(`could not run ${CLI} (${run.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [run.stdout, run.stderr].map((s) => (s ?? "").trim()).join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

/** Sixty people in a new workspace `t`, and the ids of the first page of fifty (`page`) and of someone past it (`off`). */
const SIXTY = `
  insert into public.tenants (slug, name) values ('modes-' || gen_random_uuid(), 'Modes') returning id into t;
  insert into public.contacts (tenant_id, display_name) select t, 'Person ' || g from generate_series(1, 60) g;
  select array_agg(l.id) into page from public.people_list(t, null, null, 50) l;
  select c.id into off from public.contacts c where c.tenant_id = t and c.id <> all (page) limit 1;`;

const MODES = `(select coalesce(jsonb_object_agg(m.id, m.mode), '{}') from public.people_reply_modes(t, null, 50) m)`;
const SAME_PEOPLE = `(select array_agg(m.id order by m.id) from public.people_reply_modes(t, null, 50) m)
  = (select array_agg(x order by x) from unnest(page) x)`;

test("a page's modes: its own people, each's own mode over the workspace's, and nobody past the page", { skip }, () => {
  const s = neverCommitted(`
    t uuid; page uuid[]; off uuid;
    begin
      ${SIXTY}
      insert into public.policies (tenant_id, class, mode, subject_type, subject_id) values
        (t, 'reply', 'veto', null, null),
        (t, 'reply', 'ask', 'contact', page[1]),
        (t, 'reply', 'never', 'contact', off);
      seen := jsonb_build_object('same', ${SAME_PEOPLE}, 'modes', ${MODES}, 'own', page[1], 'off', off);`);
  assert.equal(s.same, true, "the people of people_list's page, no more and no fewer");
  assert.equal(Object.keys(s.modes).length, 50);
  assert.equal(s.modes[s.own], "ask", "their own mode");
  assert.equal(s.modes[s.off], undefined, "nobody past the page");
  assert.deepEqual(
    new Set(Object.entries(s.modes).flatMap(([id, mode]) => (id === s.own ? [] : [mode]))),
    new Set(["veto"]),
    "everyone else, the workspace's",
  );
});

test("a workspace that set no mode of its own says none for those without theirs", { skip }, () => {
  const s = neverCommitted(`
    t uuid; page uuid[]; off uuid;
    begin
      ${SIXTY}
      insert into public.policies (tenant_id, class, mode, subject_type, subject_id) values (t, 'reply', 'never', 'contact', page[2]);
      seen := jsonb_build_object('modes', ${MODES}, 'own', page[2]);`);
  assert.equal(s.modes[s.own], "never");
  assert.equal(Object.values(s.modes).filter((mode) => mode === null).length, 49, "none, never a guess");
});
