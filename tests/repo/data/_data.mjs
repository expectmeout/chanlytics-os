/**
 * The data layer, read from the schema (decision 0111): the links between tables and the indexes that serve them, read
 * off supabase/schema.sql as pg prints it. data.test.mjs holds every link to an index, or to a reason it has none, and
 * keeps the reading honest on a schema written for it. The dashboard's service-role statements that name no workspace
 * are counted beside the edge's, in _measures.mjs.
 */
import { statementsOf } from "../../../tooling/scripts/gen/schema-snapshot.mjs";

const columnsOf = (list) =>
  list
    .split(",")
    .map((c) => c.trim().replace(/"/g, "").split(/\s+/)[0])
    .filter(Boolean);

/**
 * Every link between tables in the public schema (`ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY (…) REFERENCES …`), as
 * `{ table, name, columns, parent }`, and the column lists the indexes on each table lead with: a `CREATE [UNIQUE]
 * INDEX … ON public.t USING … (…)`, a primary key or a unique constraint.
 */
export function linksAndIndexesOf(sql) {
  const links = [];
  const indexes = new Map();
  const add = (table, columns) => (indexes.get(table) ?? indexes.set(table, []).get(table)).push(columns);
  for (const { text } of statementsOf(sql)) {
    const flat = text.replace(/\s+/g, " ");
    const fk =
      /^ALTER TABLE (?:ONLY )?public\.(\w+) ADD CONSTRAINT (\w+) FOREIGN KEY \(([^)]*)\) REFERENCES (\w+)\.(\w+)\(/.exec(
        flat,
      );
    if (fk) links.push({ table: fk[1], name: fk[2], columns: columnsOf(fk[3]), parent: `${fk[4]}.${fk[5]}` });
    const key =
      /^ALTER TABLE (?:ONLY )?public\.(\w+) ADD CONSTRAINT \w+ (?:PRIMARY KEY|UNIQUE(?: NULLS NOT DISTINCT)?) \(([^)]*)\)/.exec(
        flat,
      );
    if (key) add(key[1], columnsOf(key[2]));
    const index = /^CREATE (?:UNIQUE )?INDEX \w+ ON (?:ONLY )?public\.(\w+) USING \w+ \(([^)]*)\)/.exec(flat);
    if (index) add(index[1], columnsOf(index[2]));
  }
  return { links, indexes };
}

/**
 * Whether an index serves a link: one that leads with the link's columns, in any order, or, for a link that carries
 * the workspace beside its parent (`(tenant_id, conversation_id)`), one that leads with the parent's own columns: the
 * planner finds the parent's rows by that index and checks the workspace on them, so a delete of the parent reads only
 * those.
 */
export function servedBy(columns, tableIndexes) {
  const own = columns.filter((c) => c !== "tenant_id");
  const leads = (index, cols) => cols.length > 0 && cols.every((c) => index.slice(0, cols.length).includes(c));
  return tableIndexes.some((index) => leads(index, columns) || (own.length < columns.length && leads(index, own)));
}

/** The links no index serves, each with its key, `table.column[+column]`. */
export function linksWithoutAnIndex(sql) {
  const { links, indexes } = linksAndIndexesOf(sql);
  return links
    .filter((l) => !servedBy(l.columns, indexes.get(l.table) ?? []))
    .map((l) => ({ ...l, key: `${l.table}.${l.columns.join("+")}` }));
}

/**
 * The links left with no index, each with why. A link with no index makes the database read the whole child table when
 * its parent row is deleted or its key changes, and a join from the parent reads it all too: these are links whose
 * parent never goes, on a table where another index would cost every write.
 */
export const LINKS_LEFT_UNINDEXED = {
  "jobs.kind":
    "job_kinds is a registry its migrations write and nothing deletes from, and jobs is the busiest table there is: an index on kind would cost every enqueue and claim to serve a delete that never comes",
};
