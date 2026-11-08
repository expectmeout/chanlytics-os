/**
 * Ask never repeats a failure nobody wrote for a person (decision 0114; the MCP plan's T10 asks the same of its tools).
 * A check's refusal keeps its words; a door's refusal from the database keeps the door's, without the label the log
 * keeps; anything else goes on up to buildProposal, which logs it and says its fixed sentence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { AppError, DbFailure } = await import("@chanlytics/contracts");
const { refuseThrown } = await importSrc("apps/dashboard/src/server/ask/tools/context/context.ts");
const { refusalWords } = await importSrc("apps/dashboard/src/server/shared/with-route.ts");

const RAW = 'canceling statement due to statement timeout on relation "contacts"';

test("a check's refusal is said in its own words", () => {
  const out = refuseThrown(new AppError("validation", "Pick the list it runs on."));
  assert.equal(out.proposal, null);
  assert.equal(out.isError, true);
  assert.equal(out.refusal, "Pick the list it runs on.");
});

test("a door's refusal from the database is said in the door's words, never the label or Postgres's own", () => {
  assert.equal(
    refusalWords(new DbFailure({ code: "P0002", message: "Contact not found." }, "erase_contact")),
    "Contact not found.",
  );
  assert.equal(
    refusalWords(
      new DbFailure({ code: "23505", message: 'duplicate key value violates unique constraint "x"' }, "saving"),
    ),
    "That already exists.",
  );
});

test("anything else is written for nobody: it goes on up, and its text is said to no one here", () => {
  for (const thrown of [
    new Error(RAW),
    new DbFailure({ code: "57014", message: RAW }, "reading"),
    new DbFailure({ code: "P0001", message: RAW }),
    "not an error",
  ]) {
    assert.equal(refusalWords(thrown), null);
    assert.throws(
      () => refuseThrown(thrown),
      (e) => e === thrown,
    );
  }
});
