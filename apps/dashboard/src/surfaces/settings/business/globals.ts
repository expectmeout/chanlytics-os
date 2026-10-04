/**
 * The Business tab's names the first run still reads off the window: it draws the tab's rows and takes its saver
 * (setup/shell.ts). The app publishes them from seed-globals.ts before any page loads, under the
 * names the JSX published; each goes when its last reader imports it instead. The tab's other parts import each other.
 */
import { BtLanguagesRow, BtRulesRow } from "./answers";
import { BtCanCard } from "./can";
import { BtServicesRow, btSellsByChoice } from "./offer";
import { BtHoursRow, BtZoneRow } from "./open";
import { businessTabSave } from "./saver";
import { BtServicesSheet } from "./services";
import { BtAddressRow, BtBookingLinkRow, BtWebsiteRow } from "./who";

export const BUSINESS_GLOBALS = {
  // The first run (setup/shell.ts businessPart, businessTabSave, sellsByChoice).
  __businessTabSave: businessTabSave,
  btSellsByChoice,
  BtAddressRow,
  BtWebsiteRow,
  BtBookingLinkRow,
  BtZoneRow,
  BtHoursRow,
  BtServicesRow,
  BtLanguagesRow,
  BtRulesRow,
  BtCanCard,
  BtServicesSheet,
};
