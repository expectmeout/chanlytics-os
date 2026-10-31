/**
 * The table's one feature set (decision 0083): every slice of state a list of the app may hold, and the row models that
 * apply them, registered once. A list that needs a slice not listed adds it here, in review, never a state of its own
 * beside the table's. Each row model follows its feature, as table-core requires.
 *
 * Not registered: pagination (the keyset "Load more" is the server's), grouping, expanding and aggregation (the
 * Pipeline's groups are contracts', one derivation for its board and its list), faceting (Leads' chips count their
 * reasons in contracts, over the view's rows), column pinning (the fill column is pinned by its declaration, and
 * the kit draws it so: columns.ts `fill`), row pinning, cell selection, spanning.
 */
import {
  columnFilteringFeature,
  columnOrderingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/table-core";
import type { ChanlyticsColumnMeta } from "./meta";

export const tableFeatureSet = tableFeatures({
  columnVisibilityFeature,
  columnOrderingFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  rowSelectionFeature,
  columnMeta: metaHelper<ChanlyticsColumnMeta>(),
});

/** The features every table of the app is typed by. */
export type AppFeatures = typeof tableFeatureSet;
