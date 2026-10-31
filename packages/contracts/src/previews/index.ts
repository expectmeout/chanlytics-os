/**
 * A lead's own receptionist before they sign up (decision 0079): the lead read as the listing its receptionist is set up
 * from (lead-as-listing.ts), a preview's states, limits and page (lead-preview.ts), and every word its page says
 * (preview-words.ts), and what the sender sees of it (preview-line.ts).
 */
export { leadAsListing, previewZoneOf } from "./lead-as-listing";
export type { LeadListingInput } from "./lead-as-listing";
export {
  PREVIEW_FAILURES,
  PREVIEW_LIMITS,
  PREVIEW_STATES,
  previewClaimable,
  previewFirstRunMarks,
  previewKnowsOf,
  previewMinePath,
  previewPageOf,
  previewSlotOf,
  previewStartersOf,
  previewStateOf,
  previewTurnsOf,
} from "./lead-preview";
export type {
  LeadPreviewSlot,
  PreviewFailure,
  PreviewKnowsRowVM,
  PreviewPageFacts,
  PreviewPageState,
  PreviewPageVM,
  PreviewState,
  PreviewTurnVM,
} from "./lead-preview";
export {
  PREVIEW_LINE_WORDS,
  PREVIEW_TRIED_DAYS,
  previewLineOf,
  previewSaidOf,
  previewTriedWords,
} from "./preview-line";
export type { LeadPreviewDto, LeadPreviewFacts, LeadPreviewLineVM, PreviewTriedDto } from "./preview-line";
export { LEAD_PREVIEW_WORDS } from "./preview-words";
