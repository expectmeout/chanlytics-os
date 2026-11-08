/**
 * A JSON value the database hands back, read through the shape the code expects of it (decision 0112): a SQL function's
 * answer (`readAnswer`) or a JSON column (`readColumn`). The generated types call both `Json`, which says nothing of
 * their fields, so the code told the checker a shape and the checker took its word: 89 answers and 63 columns, each a
 * shape nothing checked.
 *
 * Report-only for now, as layer 6's doors began: a value its schema does not hold is said, by function or column and by
 * field (`rpc_answer_unexpected`, `json_column_unexpected`), never by value, and it is read as it always was. Once a
 * week of production has said nothing, the reader refuses at the schema instead, and the answer the code reads is the
 * one the schema parsed.
 */
import type { z } from "zod";
import { dbLog, dbRequestId } from "./observe";

/** The fields a value's schema did not hold, at most ten, each once: what a line says instead of the value. */
const fieldsOf = (issues: readonly { path: readonly PropertyKey[] }[]): string[] =>
  [...new Set(issues.map((issue) => issue.path.map(String).join(".") || "(value)"))].sort().slice(0, 10);

/**
 * The value, as its schema says it is. Report-only: the value is read as it came, and one its schema does not hold is
 * said, so the trust the code once wrote at each read is written here once, under the line that checks it.
 */
function readAs<S extends z.ZodType>(schema: S, value: unknown, unexpected: (fields: string[]) => void): z.output<S> {
  const held = schema.safeParse(value);
  if (!held.success) unexpected(fieldsOf(held.error.issues));
  return value as z.output<S>;
}

/** A SQL function's answer, read through its shape: `fn` names the function on the line a mismatch writes. */
export const readAnswer = <S extends z.ZodType>(fn: string, schema: S, value: unknown): z.output<S> =>
  readAs(schema, value, (fields) => dbLog().warn("rpc_answer_unexpected", { fn, fields, request_id: dbRequestId() }));

/** A JSON column's value, read through its shape: `column` is `table.column`, as the line a mismatch writes names it. */
export const readColumn = <S extends z.ZodType>(column: string, schema: S, value: unknown): z.output<S> =>
  readAs(schema, value, (fields) =>
    dbLog().warn("json_column_unexpected", { column, fields, request_id: dbRequestId() }),
  );
