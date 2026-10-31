/**
 * The kit's table is held to the engine it replaced (decision 0083, §11.3 "every golden equal"): the goldens were
 * recorded from the old engine's own code over these fixtures (`_fixtures.mjs`, step 1), and here the new path gives
 * the same ids in the same order for every case.
 *
 * - People: the view's rows (the state tab and the list, page/shown.ts `plViewRows`), the box's words and the sort,
 *   through the kit's state and table (kit/table/state.ts, use-data-table.ts) as People's page holds them: the sort read
 *   from a saved view (`fromView`, so a heading this page cannot sort falls back to the page's first, its way kept), the
 *   page's tiebreak (cells/sorts.ts `plSortThen`), the words as the table's global filter (`plMatcher`).
 * - Leads: the server's order kept (manual sorting), narrowed by the words, the Excluded view's chip, the band's fit and
 *   the Filter's reach as the table's filters (leads/page/reads.ts `leadNarrowings`), with whether anything narrowed.
 *
 * Drawn on the suite's stub React, as the pages draw it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installLegacyReact, fresh, again } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";
import { peopleOrder } from "../people/_people-shown.mjs";
import {
  PEOPLE,
  PEOPLE_FOUND,
  PEOPLE_SORTS,
  PEOPLE_TABS,
  PEOPLE_LIST_IDS,
  PEOPLE_WORDS,
  LEAD_ROWS,
  LEAD_WORDS,
  LEAD_CHIPS,
  LEAD_FITS,
  LEAD_REACH,
} from "./_fixtures.mjs";

installLegacyReact();
const { useTableState } = await importSrc("apps/dashboard/src/surfaces/kit/table/state.ts");
const { useDataTable } = await importSrc("apps/dashboard/src/surfaces/kit/table/use-data-table.ts");
const { columnsIn } = await importSrc("apps/dashboard/src/surfaces/kit/table/columns.ts");
const { LEAD_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/leads/cells/columns.tsx");
const { leadNarrowings, leadWords } = await importSrc("apps/dashboard/src/surfaces/leads/page/reads.ts");
const { toLeadRowVM } = await importSrc("packages/contracts/src/leads/leads.ts");

const h = (...a) => globalThis.React.createElement(...a);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const golden = (name) => JSON.parse(fs.readFileSync(path.join(HERE, "goldens", name), "utf8"));

/** A store that remembers one view on this device and saves nowhere. */
const storeOf = (view) => ({ load: () => ({ ...view }), save() {}, saver: () => () => {} });

const peopleRows = await peopleOrder();
const peopleShown = ({ sortBy, sortDir, tab, list, q, found }) =>
  peopleRows({
    rows: PEOPLE,
    found: found ? PEOPLE_FOUND : null,
    lists: [{ id: "L", ids: PEOPLE_LIST_IDS }],
    tab,
    listId: list,
    q,
    sortBy,
    sortDir,
  });

test("People's rows are the old engine's, in its order: every heading, way, state tab, list and words, and the server's found", () => {
  const want = golden("people-shown.json");
  let cases = 0;
  for (const sortBy of PEOPLE_SORTS)
    for (const sortDir of ["asc", "desc"])
      for (const tab of PEOPLE_TABS)
        for (const list of [null, "L"])
          for (const q of PEOPLE_WORDS)
            for (const found of q === "example" ? [false, true] : [false]) {
              const key = [sortBy, sortDir, tab, list ?? "-", q || "-", found ? "found" : "-"].join("|");
              assert.deepEqual(peopleShown({ sortBy, sortDir, tab, list, q, found }), want[key], key);
              cases++;
            }
  assert.equal(cases, Object.keys(want).length, "every recorded case is run");
});

const TZ = "America/Chicago";
const NOW = new Date("2026-09-19T15:00:00.000Z");
const LEADS = LEAD_ROWS.map((r) => toLeadRowVM(r, TZ, NOW));
const LEADS_DECLARED = columnsIn(LEAD_COLUMNS, { hasCenter: true });

function leadsShown({ q, chip, fitChip, reach }) {
  let made = null;
  function Probe() {
    const state = useTableState({
      scope: "leads",
      columns: LEAD_COLUMNS,
      first: { by: "fit", dir: "asc" },
      saved: null,
      landed: false,
      store: storeOf({}),
      railRow: "all",
    });
    const model = useDataTable({
      state,
      columns: LEADS_DECLARED,
      data: LEADS,
      words: leadWords,
      server: { sorting: true },
    });
    made = { state, rows: model.rows };
    return null;
  }
  fresh();
  again(() => h(Probe));
  const narrow = leadNarrowings(made.state);
  narrow.setChip(chip);
  narrow.setFitChip(fitChip);
  narrow.setReach(reach);
  made.state.setWords(q);
  again(() => h(Probe));
  return { ids: made.rows.map((l) => l.id), narrowed: made.state.narrowed };
}

test("Leads' rows are the old engine's: the server's order, narrowed by the words, a left-out chip, a fit and the reach", () => {
  const want = golden("leads-shown.json");
  let cases = 0;
  for (const q of LEAD_WORDS)
    for (const chip of LEAD_CHIPS)
      for (const fitChip of LEAD_FITS)
        for (const reach of LEAD_REACH) {
          const key = [q || "-", chip ?? "-", fitChip ?? "-", reach.join("+") || "-"].join("|");
          assert.deepEqual(leadsShown({ q, chip, fitChip, reach }), want[key], key);
          cases++;
        }
  assert.equal(cases, Object.keys(want).length, "every recorded case is run");
});
