/**
 * A block run on the local stack in a transaction that never commits, for a read at volume: its rows stand only as long as it
 * does, and it ends by raising what it saw, as hex.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = process.env.SUPABASE_CLI || "supabase";

export function neverCommitted(body) {
  const sql = `do $do$ ${body} $do$`;
  const r = spawnSync(CLI, ["db", "query", "--local", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-1500)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}
