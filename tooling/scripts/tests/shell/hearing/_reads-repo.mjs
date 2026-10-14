/**
 * A repository in miniature, for the tracer to be run on (_reads.mjs): a schema with a function, a view and four triggers; two
 * routes of the dashboard with the server code behind them, a wrapper that reads the caller's seat, a namespace import and an
 * edge door; and the shell's list of surfaces. `writeRepo(root)` lays it out under `root`; what the tracer should find in it is
 * said in a-route-is-followed-to-its-tables.test.mjs.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `--
-- a schema in miniature
--
CREATE TABLE public.contacts (
    id uuid
);
CREATE TABLE public.messages (
    id uuid
);
CREATE TABLE public.notes (
    id uuid
);
CREATE TABLE public.audits (
    id uuid
);
CREATE TABLE public.recounts (
    id uuid
);
CREATE TABLE public.erasures (
    id uuid
);
CREATE TABLE public.sweeps (
    id uuid
);
CREATE TABLE public.memberships (
    id uuid
);
CREATE TABLE public.events (
    id uuid
);

CREATE VIEW public.thread_view AS
 SELECT m.id
   FROM public.messages m;

CREATE FUNCTION public.note_add(p_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  -- update public.sweeps is a comment and writes nothing
  insert into public.notes (id) values (p_id);
  perform public.note_count(p_id);
end $$;

CREATE FUNCTION public.note_count(p_id uuid) RETURNS integer
    LANGUAGE sql
    AS $$ select count(*) from public.notes n join public.thread_view v on v.id = n.id $$;

CREATE FUNCTION public.note_audit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ begin insert into public.audits (id) values (new.id); return new; end $$;

CREATE FUNCTION public.note_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ begin update public.recounts set id = new.id; return new; end $$;

CREATE FUNCTION public.note_erase_sweeps() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ begin delete from public.erasures; return new; end $$;

CREATE TRIGGER notes_audit AFTER INSERT ON public.notes FOR EACH ROW EXECUTE FUNCTION public.note_audit();
CREATE TRIGGER notes_changed AFTER UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.note_changed();
CREATE TRIGGER notes_erase_sweeps AFTER INSERT ON public.notes FOR EACH ROW EXECUTE FUNCTION public.note_erase_sweeps();
CREATE TRIGGER events_fan_out AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.note_audit();
`;

const FILES = {
  "supabase/schema.sql": SCHEMA,

  // The routes: a read and a write on one path, a write on another.
  "apps/dashboard/app/api/v1/people/route.ts": `import { read, write } from "@/server/route";
import { everyone } from "@/server/readers/people";
import { addNote } from "@/server/notes";

/** GET people: the book. */
export const GET = read({
  handle: () => everyone(),
});

/** POST people: a note, and the edge asked to sweep. */
export const POST = write({
  handle: () => addNote(),
});
`,
  "apps/dashboard/app/api/v1/people/[id]/route.ts": `import { write } from "@/server/route";
import { touchNote } from "@/server/notes";

export const PATCH = write({
  handle: () => touchNote(),
});
`,

  // The wrapper every route passes through: it reads the caller's seat, which is not what the route answers.
  "apps/dashboard/src/server/route.ts": `export function read(spec) {
  return supabase.from("memberships").select("id");
}
export function write(spec) {
  return supabase.from("memberships").select("id");
}
`,

  // A reader: a table, an embed of two more, and a namespace's member that reaches a SQL function.
  "apps/dashboard/src/server/readers/people.ts": `import { thread } from "./thread";

export async function everyone(db) {
  const rows = await db.from("contacts").select("id, last:messages(body), notes!inner(text)");
  return thread(rows);
}
`,
  "apps/dashboard/src/server/readers/thread.ts": `import * as facts from "./facts";

export function thread(rows) {
  return facts.counted(rows);
}
`,
  "apps/dashboard/src/server/readers/facts.ts": `export async function counted(db) {
  return db.rpc("note_count", {});
}
`,

  // Writes: a function that inserts, a table updated, one upserted; the edge asked; a note updated alone.
  "apps/dashboard/src/server/notes.ts": `import { callEdge } from "./edge";

export async function addNote(db) {
  await db.rpc("note_add", { p_id: 1 });
  await db.from("messages").update({ seen: true }).eq("id", 1);
  await db.from("contacts").upsert({ id: 1 });
  await callEdge("/api/admin/steer", null);
}

export async function touchNote(db) {
  await db.from("notes").update({ body: "x" }).eq("id", 1);
}
`,
  "apps/dashboard/src/server/edge.ts": `export async function callEdge(aud, body) {
  return fetch(aud, { body });
}
`,
  "apps/edge/api/admin/steer.ts": `export default async function handler(req) {
  await db.from("sweeps").insert({ at: 1 });
  return db.from("recounts").select("id");
}
`,

  // A surface's reads, named as the typed client does; a route named in prose is not a read.
  "apps/dashboard/src/surfaces/people/surface.ts": `// It used to read "GET commented" too, in prose.
export async function apply() {
  await read("GET people");
  await read("GET people/[id]", { params: { id: 1 } });
  const words = "GET not a route";
}
`,

  "apps/dashboard/src/legacy-bridge/surface-data.ts": `export const workspaceOverride = { key: "workspace" };
`,

  // The shell's surfaces, as LegacyApp.tsx lists them: names and comments, and the imports they come from (one over lines,
  // one beside a type, a module with no file, and a side effect with no names at all).
  "apps/dashboard/src/legacy-bridge/LegacyApp.tsx": `import "./manifest";
import {
  workspaceOverride,
  switchWorkspace,
  type Workspace,
} from "./surface-data";
import { type PeopleDto, peopleOverride } from "@/surfaces/people/surface";
import { todayOverride } from "@/surfaces/today/surface";
const REQUIRED = ["CHANLY"] as const;

// leadsOverride rides beside peopleOverride: it is only prose.
const SURFACES = [
  workspaceOverride,
  // Today's own read (surfaces/today/surface.ts), not todaysOverride.
  todayOverride,
  /* partnerOverride is a comment too */
  peopleOverride,
];

export function App() {
  return <p>Don't stop here: {SURFACES.length}</p>;
}
`,
};

/** Lay the miniature repository out under `root`. */
export function writeRepo(root) {
  for (const [file, text] of Object.entries(FILES)) {
    const at = path.join(root, file);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, text);
  }
}
