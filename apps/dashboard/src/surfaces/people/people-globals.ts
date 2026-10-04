/**
 * People's parts that the shell still draws or calls by name (decision 0015, step 5: "what is shared moves once"). The
 * pages written against `people.jsx`, `people-table.jsx` and `clients-bits.jsx` have all moved (Leads last, step 9): what
 * is left are the shell's own readers -- the strip's scopes (components/surface-tabs.jsx), the two sheets the frame draws
 * once and the verbs that ask for them (pages/app-shell.jsx), and the demo's seeded Lists page (demo/pages/segments.jsx).
 * Each is published under the name it always had, from this one object, which seed-globals publishes before any page
 * loads. It is deleted, name by name, as the last reader of each moves. Nothing else goes in here: a part a page imports
 * is not a global, and publishing the table, the hooks and the rail kit was what kept them in the shell's chunk.
 *
 * `__listRoute` is People's rule (where a list's own route lands: plListRoute), which the shell's Lists redirect and the
 * demo's seeded Lists page still ask for by name.
 */
import { DealSheetHost, openDealSheet } from "./deal-sheet/deal-sheet";
import { StepSheetHost, openStepSheet } from "./step-sheet/step-sheet";
import { ChannelGlyph } from "./cells/channel-glyph";
import { plListRoute, plScopeRoute, plScopes } from "./words";

export const PEOPLE_GLOBALS = {
  // the shell's strip of People's scopes
  plScopes,
  plScopeRoute,
  // the demo's seeded Lists page: a list's channel mark, and where a list's own route lands
  ChannelGlyph,
  __listRoute: plListRoute,
  // the two sheets the frame draws once, and the verbs that ask for them (the Inbox's thread, the Calendar, the Pipeline
  // and the person's deal card open them by name)
  DealSheetHost,
  StepSheetHost,
  openDealSheet,
  openStepSheet,
};
