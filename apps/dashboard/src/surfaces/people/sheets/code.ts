/**
 * People's two sheets the frame draws once, the deal sheet (0008) and the step sheet (0007, amended): a chunk of their
 * own, fetched by doors.tsx, which the frame publishes in their place.
 */
export { DealSheetHost, openDealSheet } from "../deal-sheet/deal-sheet";
export { StepSheetHost, openStepSheet } from "../step-sheet/step-sheet";
