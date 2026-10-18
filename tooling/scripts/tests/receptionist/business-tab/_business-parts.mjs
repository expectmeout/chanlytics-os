/**
 * Settings › Business's parts, on a test's window (decision 0015 step 11: the tab is TSX, in
 * apps/dashboard/src/surfaces/settings/business, and its parts import each other). The app publishes only the names a
 * page of the shell or the first run still reads (business/globals.ts); a test draws or drives any part by the name the
 * JSX published, so this puts every one of them on the window. Import it once the stub React is installed
 * (_legacy-react.mjs installLegacyReact, or a test's own stub with its hooks set on "react").
 *
 * Not named *.test.mjs, so the runner skips it.
 */
// answers first: save.tsx is never the first of the tab's modules to load (saver.ts assigns onto what it exports).
// Imported as the harness imports the app's modules, by a dynamic import: a static one from a test file is a second
// copy of each module, and a part drawn by the tab would not be the part a test compares it with.
const BIZ = "../../../../../apps/dashboard/src/surfaces/settings/business";
const part = {};
for (const m of [
  "answers.tsx",
  "can.tsx",
  "create.tsx",
  "gestures/common.tsx",
  "gestures/row.tsx",
  "gestures/editor.tsx",
  "gestures/fold.tsx",
  "offer.tsx",
  "open.tsx",
  "prompt.tsx",
  "save.tsx",
  "saver.ts",
  "services.tsx",
  "tab.tsx",
  "who.tsx",
])
  Object.assign(part, await import(`${BIZ}/${m}`));
const {
  BtBookingRuleRows,
  BusinessLimitRows,
  BtLanguagesRow,
  BtRulesRow,
  BtCanCard,
  BtCreateCard,
  BT_SAVED,
  BtPutBacks,
  BtRow,
  BtFold,
  BtSheet,
  BtOfferCard,
  BtServicesRow,
  BtHoursRow,
  BtOpenCard,
  BtZoneRow,
  BtPromptSheet,
  BtPromptTold,
  useBtPromptSheet,
  phoneShown,
  businessTabSave,
  BtServicesSheet,
  BtSheetSlot,
  BusinessTab,
  BtAddressRow,
  BtBookingLinkRow,
  BtWebsiteRow,
  BtWhoCard,
  btPublishedBox,
} = part;

/** Every part, under the name the JSX published it by. */
export const BUSINESS_PARTS = {
  __businessTabSave: businessTabSave,
  phoneShown,
  BusinessTab,
  BtSheetSlot,
  BtCreateCard,
  BtWhoCard,
  btPublishedBox,
  BtAddressRow,
  BtWebsiteRow,
  BtBookingLinkRow,
  BtOpenCard,
  BtZoneRow,
  BtHoursRow,
  BtOfferCard,
  BtServicesRow,
  BtBookingRuleRows,
  BusinessLimitRows,
  BtLanguagesRow,
  BtRulesRow,
  BtCanCard,
  BtServicesSheet,
  useBtPromptSheet,
  BtPromptTold,
  BtPromptSheet,
  BtRow,
  BtFold,
  BtSheet,
  BtPutBacks,
  BT_SAVED,
};
Object.assign(globalThis.window, BUSINESS_PARTS);
