/**
 * People's parts that the pages that have not moved still draw or call by name (decision 0015, step 5: "what is shared
 * moves once"). The Leads scope, the Pipeline, the person page, the Reach-out leads sheet and the shell's own strip were
 * written against `people.jsx`, `people-table.jsx` and `clients-bits.jsx`, which are TSX now: the table, the rail kit, the
 * list page's two hooks, the phone's bar and sheets, the row card, the words and rules the scopes share. Each is published
 * under the name it always had, from this one object, which seed-globals publishes before any page loads, so the site
 * moved from the JSX to the bridge and the publishers do not rise. It is deleted, name by name, as the last page that
 * reads one moves: the Leads scope (K3), the Pipeline and the person page.
 *
 * `__listRoute` is People's rule (where a list's own route lands: plListRoute), which the shell's Lists redirect and the
 * demo's seeded Lists page still ask for by name.
 */
import { DealSheetHost, openDealSheet } from "./deal-sheet/deal-sheet";
import { StepSheetHost, openStepSheet } from "./step-sheet/step-sheet";
import { ChannelGlyph } from "./cells/channel-glyph";
import { plNameCell } from "./cells/columns";
import { plRowCard } from "./cells/row-card";
import { PersonDealCard } from "./deal/person-deal";
import { plAddPerson, plAddedWords } from "./lists/doors";
import { PeopleBulkBar } from "./bulk/bulk-bar";
import { usePlControls } from "./hooks/use-controls";
import { usePeople } from "./hooks/use-people";
import { usePlPlace } from "./hooks/use-place";
import { PeopleListsSheet } from "./rail/lists-sheet";
import { PeopleRail } from "./rail/people-rail";
import { PeoplePhoneBar } from "./rail/phone-bar";
import { RailEmpty, RailRow, RailSection, railQuiet, railToggle } from "./rail/rail-kit";
import { PeopleScopeTabs } from "./rail/scope-tabs";
import { PeopleStanding } from "./rail/standing";
import { PhoneSheet, PhoneSheetRow } from "./sheets/phone-sheet";
import { PeopleColumnsMenu } from "./table/columns-menu";
import { plColumnOptions, plDrawnColumns, plSortKeys } from "./table/columns";
import { PL_NO_SEL, PeopleTable } from "./table/table";
import {
  PL_SEARCH_LABEL,
  plFace,
  plIsNumber,
  plListRoute,
  plLoadedWords,
  plMatcher,
  plScopeRoute,
  plScopes,
} from "./words";

export const PEOPLE_GLOBALS = {
  // the shell's strip, the Leads scope and the Pipeline
  plScopes,
  plScopeRoute,
  PeopleScopeTabs,
  PeopleStanding,
  PeopleRail,
  PeopleListsSheet,
  PeopleBulkBar,
  PeoplePhoneBar,
  PhoneSheet,
  PhoneSheetRow,
  RailSection,
  RailRow,
  RailEmpty,
  railQuiet,
  railToggle,
  usePeople,
  usePlControls,
  usePlPlace,
  // the table and the words a scope's rows share
  PeopleTable,
  PeopleColumnsMenu,
  plSortKeys,
  plDrawnColumns,
  plColumnOptions,
  PL_NO_SEL,
  plRowCard,
  plNameCell,
  plFace,
  plIsNumber,
  plMatcher,
  plLoadedWords,
  PL_SEARCH_LABEL,
  // adding a person by hand (the Pipeline's New proposal), and the person page's channel mark
  plAddPerson,
  plAddedWords,
  ChannelGlyph,
  // the person page's Deal section (client-profile.jsx), which the Pipeline's peek draws by import
  PersonDealCard,
  // where a list's own route lands (the shell's Lists redirect, the demo's seeded Lists page)
  __listRoute: plListRoute,
  // the two sheets the frame draws once, and the verbs that ask for them (the Inbox's thread, the Calendar, the Pipeline
  // and the person's deal card open them by name)
  DealSheetHost,
  StepSheetHost,
  openDealSheet,
  openStepSheet,
};
