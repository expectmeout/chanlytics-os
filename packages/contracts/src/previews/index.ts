/**
 * A lead's own receptionist before they sign up (decision 0079): the lead read as the listing its receptionist is set up
 * from (lead-as-listing.ts), a preview's states, limits and page (lead-preview.ts), and every word its page says
 * (preview-words.ts), what the sender sees of it (preview-line.ts), and what a lead's trying came to, which Today says too
 * (preview-tried.ts).
 */
export { leadAsListing, previewZoneOf } from "./lead-as-listing";
export type { LeadListingInput } from "./lead-as-listing";
export {
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
export { PREVIEW_LINE_WORDS, previewLineOf } from "./preview-line";
export type { LeadPreviewDto, LeadPreviewFacts, LeadPreviewLineVM } from "./preview-line";
export { PREVIEW_TRIED_DAYS, previewSaidOf, previewTriedWords } from "./preview-tried";
export type { PreviewTriedDto } from "./preview-tried";
export { LEAD_PREVIEW_WORDS } from "./preview-words";
