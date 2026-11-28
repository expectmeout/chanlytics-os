/**
 * What an erasure leaves in every table that names a person, on the stack (decision 0036).
 *
 * An erased person keeps their row as a tombstone, so a key to it deletes nothing: a table that names a person is
 * reached only if the erasure's door deletes its rows, a trigger on the tombstone does, or somebody decided the row
 * stays. people/erasure/erasure-completeness.db.test.mjs proves the words (every column the registry names is searched
 * for the person's number and address after the real route ran). This proves the rows, and finds its tables in the
 * catalog: every column that is a key to a person or a lead, or is named for one. The door walk's seeded workspace
 * (`_walk.mjs`) holds a row naming one person and one lead in each; the owner erases the lead (`lead_erase`) and the
 * person (`erase_contact`), and each column's rows are counted before and after, in one statement that rolls back.
 *
 * A column whose rows are still there is named in `AN_ERASURE_KEEPS` with why, or this fails: a table added tomorrow
 * with a `contact_id` is deleted with the person, or says why it is kept, in the pull request that adds it.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { AN_ERASURE_KEEPS, A_KEPT_ROW_MAY_STAND } from "./_lists.mjs";
import { erasureSql, noLocalStack, reportOf, saidBy } from "./_walk.mjs";

const skip = noLocalStack();

let report;
before(() => {
  if (skip) return;
  const said = saidBy(erasureSql());
  report = reportOf(said);
  assert.ok(report, `the block itself broke, before it could say what it found:\n${said.slice(-2000)}`);
});

const WHO = { contacts: "a person", leads: "a lead" };

test("every column that names a person or a lead held a row naming them before the erasure", { skip }, () => {
  assert.deepEqual(
    report.unseeded,
    {},
    "a table the walk could not seed: SEED_VALUES (_lists.mjs) says what its row must hold",
  );
  for (const who of Object.keys(WHO)) {
    const columns = Object.entries(report.erasure[who] ?? {});
    assert.ok(columns.length >= 8, `the columns that name ${WHO[who]} are read from the catalog (${columns.length})`);
    assert.deepEqual(
      columns.filter(([, n]) => n.before < 1).map(([name]) => name),
      who === "contacts" ? ["person_doubts.other_id"] : [],
      `a column that names ${WHO[who]} had no row naming them, so nothing is proved of it: its table's row in SEED_VALUES ` +
        "leaves the column out (person_doubts.other_id is the second of two records, and the walk has one person there)",
    );
  }
});

test(
  "after the owner's press every row that named them is gone, but in the columns named with why the row stays",
  { skip },
  () => {
    for (const who of Object.keys(WHO)) {
      const kept = Object.entries(report.erasure[who])
        .filter(([, n]) => n.before > 0 && n.after > 0)
        .map(([name]) => name);
      assert.deepEqual(
        kept.filter((name) => !(name in AN_ERASURE_KEEPS[who])),
        [],
        `a row that names ${WHO[who]} outlived their erasure: delete it with them (the door, or a trigger on the tombstone, since ` +
          "the tombstone's row is kept and a key to it deletes nothing), or name the column in AN_ERASURE_KEEPS with why it stays",
      );
      assert.deepEqual(
        Object.keys(AN_ERASURE_KEEPS[who]).filter((name) => !kept.includes(name)),
        [],
        "named as kept, but its rows went with them (or the column is gone): take it off the list",
      );
    }
  },
);

test("a row that is kept is left where nothing more happens to it, or its state is named with why", { skip }, () => {
  const standing = {};
  for (const who of Object.keys(WHO))
    for (const [name, n] of Object.entries(report.erasure[who]))
      for (const state of n.states ?? []) (standing[name.split(".")[0]] ??= new Set()).add(state);
  const found = Object.entries(standing).flatMap(([table, states]) => [...states].map((s) => `${table}: ${s}`));
  const named = Object.entries(A_KEPT_ROW_MAY_STAND).flatMap(([table, states]) =>
    Object.keys(states).map((s) => `${table}: ${s}`),
  );
  assert.deepEqual(
    found.filter((x) => !named.includes(x)).sort(),
    [],
    "a row kept after an erasure stands in a state not named: end it at the erasure (a trigger on the tombstone), or say in A_KEPT_ROW_MAY_STAND why standing there sends nothing",
  );
  assert.deepEqual(
    named.filter((x) => !found.includes(x)).sort(),
    [],
    "named as a state a kept row may stand in, but no kept row stands there now: take it off the list",
  );
});
