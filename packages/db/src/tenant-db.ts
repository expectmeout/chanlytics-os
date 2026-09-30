/**
 * A service-role client that cannot forget whose rows it reads.
 *
 * The service role skips row-level security, so a statement the edge or a job runs on a workspace's table is scoped
 * only by the `.eq("tenant_id", …)` its author remembered. On 29 September 2026, 63 of the edge's 214 such
 * statements named no workspace, each trusting an id to be the workspace's already (the scorecard's heuristic, held
 * since by `repo/code-health-ratchets.test.mjs`, "service-role statements that name no workspace").
 *
 * `tenantDb(db, tenantId)` takes the workspace once. Every select, update and delete it builds is filtered by it
 * before the caller adds anything, so a statement cannot reach another workspace's row by an id alone; every row it
 * inserts or upserts is stamped with it, and a row that names another workspace is refused before it is sent. Only
 * tables with a `tenant_id` are offered (`TenantTable`), so the compiler refuses the question for a table that is not
 * a workspace's, and each statement is typed as the table's own (`tenant-db.type-test.ts`). `platformWide(db)` is the
 * other door, by name, for the sweeps that read every workspace on purpose: a reader sees which statements chose it,
 * and the ratchet counts neither.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Db = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];

/** The tables whose every row belongs to one workspace: each has a non-null `tenant_id`. */
type TenantTable = {
  [K in keyof Tables]: Tables[K]["Row"] extends { tenant_id: string } ? K : never;
}[keyof Tables];

/** The table's builder as `db.from` gives it: the type the scoped builder keeps, read from the call itself. */
function builderOf<T extends TenantTable>(db: Db, table: T) {
  return db.from(table);
}
type Builder<T extends TenantTable> = ReturnType<typeof builderOf<T>>;

/** One workspace's rows, through the service role. */
export interface TenantDb {
  readonly tenantId: string;
  /** The table's builder, as `db.from` gives it, with every statement it builds scoped to the workspace. */
  from<T extends TenantTable>(table: T): Builder<T>;
}

/** The verbs whose statements are filtered by the workspace, and the ones whose rows are stamped with it. */
const FILTERED = ["select", "update", "delete"] as const;
const STAMPED = ["insert", "upsert"] as const;

/** A row stamped with the workspace; one that names another is refused. */
function stamped(row: unknown, tenantId: string): unknown {
  if (typeof row !== "object" || row === null) return row;
  const named: unknown = Reflect.get(row, "tenant_id");
  if (named !== undefined && named !== tenantId) throw new Error("tenantDb: a row names another workspace");
  return { ...row, tenant_id: tenantId };
}

/** The builder, with its verbs replaced by ones that scope what they build to the workspace. */
function scoped<B extends object>(builder: B, tenantId: string): B {
  for (const verb of FILTERED) {
    const build: unknown = Reflect.get(builder, verb);
    if (typeof build !== "function") continue;
    Object.defineProperty(builder, verb, {
      value: (...args: unknown[]) => {
        const statement: unknown = Reflect.apply(build, builder, args);
        const eq: unknown = statement && Reflect.get(statement, "eq");
        if (typeof eq !== "function") throw new Error(`tenantDb: ${verb} built nothing to filter`);
        const filtered: unknown = Reflect.apply(eq, statement, ["tenant_id", tenantId]);
        return filtered;
      },
    });
  }
  for (const verb of STAMPED) {
    const build: unknown = Reflect.get(builder, verb);
    if (typeof build !== "function") continue;
    Object.defineProperty(builder, verb, {
      value: (rows: unknown, ...rest: unknown[]) => {
        const statement: unknown = Reflect.apply(build, builder, [
          Array.isArray(rows) ? rows.map((r) => stamped(r, tenantId)) : stamped(rows, tenantId),
          ...rest,
        ]);
        return statement;
      },
    });
  }
  return builder;
}

/** One workspace's rows, through the service role: every statement scoped to `tenantId` before anything else. */
export function tenantDb(db: Db, tenantId: string): TenantDb {
  if (!tenantId) throw new Error("tenantDb: a workspace is required");
  return {
    tenantId,
    from: (table) => scoped(builderOf(db, table), tenantId),
  };
}

/**
 * The service-role client for a statement that reads or writes every workspace on purpose (a sweep, a clock, the
 * platform's own tables), said at the call so the reader and the ratchet see it was chosen.
 */
export function platformWide(db: Db): Db {
  return db;
}
