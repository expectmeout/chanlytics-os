/**
 * tenantDb offers a workspace's tables and nothing else, proved where the compiler reads it (tenant-db.ts): a table
 * whose rows carry a `tenant_id` is offered, and a table that is not a workspace's is refused, so the question "whose
 * rows?" cannot be asked of a table it does not apply to.
 *
 * A type test: each line under `@ts-expect-error <why>` must not compile. Nothing imports this file, so no build
 * reaches it and nothing runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { tenantDb } from "./tenant-db";

declare const db: SupabaseClient<Database>;
const workspaceRows = tenantDb(db, "workspace-id");

// Offered: a workspace's table, each statement typed as the table's own.
void workspaceRows.from("calls").select("id").eq("retell_call_id", "call_1");
void workspaceRows.from("messages").update({ status: "canceled" }).eq("id", "message-id");
void workspaceRows.from("lines").delete().eq("id", "line-id");

// @ts-expect-error a table that is not one workspace's is refused: tenants is the workspaces themselves
void workspaceRows.from("tenants");

// @ts-expect-error the rows are the table's own, typed through the filter: calls has no such column
void workspaceRows.from("calls").select("id").eq("no_such_column", "x");
