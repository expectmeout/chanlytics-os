/** People: the relationship record, its page, its lists, the pool every list is judged over, and what erasure leaves. */
export { callerName } from "./person-name";
export type { NameableContact, NameableCaller } from "./person-name";
// What to call a person is person-name.ts's one rule; People reads it from there
// like every other surface, and the index exports it from there.
export { personName } from "./person-name";
// A person's wires and where they came from, in words: the leaf the list rules read too (person-words.ts).
export { PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS } from "./person-words";
export type { PersonCameFrom, PersonChannel } from "./person-words";
export type {
  PersonRowDto,
  PersonIdentityDto,
  PersonEscalationDto,
  PersonDecisionDto,
  PersonDetailDto,
  PersonCampaignDto,
  PersonLeadDto,
  PersonCampaignVM,
} from "./person-dto";
export { asPersonMode, PERSON_MODES, PERSON_MODE_LABELS, PERSON_MODE_WORDS } from "./person-receptionist";
export type { PersonMode, ReceptionistTone, PersonReceptionist } from "./person-receptionist";
export { reasonShort, ago } from "./person-row-facts";
export type { PersonLastContact, PersonFirstContact } from "./person-row-facts";
export {
  personStanding,
  attentionOf,
  isOwned,
  personStateFor,
  PERSON_STATE_LABELS,
  PEOPLE_TABS,
  NEW_WINDOW_DAYS,
  QUIET_AFTER_DAYS,
} from "./person-state";
export type { PersonState } from "./person-state";
export { bookingLinkAction, proposalMessage, proposalAction, repliesWords, mayReach } from "./person-reach";
export type { PersonProposalVM } from "./person-reach";
export { cameFromOf, visitTitleFor, toPersonRowVM } from "./person-row";
export type { PersonRowVM } from "./person-row";
export {
  offersYesRefusal,
  ownMessageRefusal,
  consentSourceLabel,
  mayReceive,
  whyNotReceive,
  saidYesTo,
  CONSENT_SOURCES,
  CONSENT_RESET_SOURCE,
  OFFERS_YES_SOURCES,
  OWN_MESSAGE_REFUSALS,
} from "./person-consent";
export type { PersonConsent, NotReceived } from "./person-consent";
export { personNotesVM, NOTE_MAX, NOTE_WORDS, NOTE_REFUSALS } from "../notes/person-notes";
export type { PersonNoteDto, PersonNoteTeamDto, PersonNoteVM } from "../notes/person-notes";
export {
  peopleListAction,
  savedListAction,
  noNumberWords,
  saidYesWords,
  peopleAggregates,
  recencyCells,
  GET_YES_ROUTE,
  NO_NUMBER_REACH,
} from "./people-lists";
export type { PeopleListAction, PeopleAggregates } from "./people-lists";
export { attentionRow } from "./person-attention";
export type { AttentionRowVM } from "./person-attention";
export { filterTimeline, personActs, toPersonVM, TIMELINE_FILTERS } from "./person-profile";
export type { TimelineFilterId, PersonVM, PersonActVM, OwnMessageVM } from "./person-profile";
export type { PersonRightNow, PersonFact } from "./person-cards";
export { consentChangeWords } from "./person-timeline";
export type { TimelineKind, PersonTimelineItemVM, PersonVisitAheadVM } from "./person-timeline";
export {
  asListRule,
  draftListRule,
  ruleFacts,
  factNeeds,
  ruleNeeds,
  ruleLists,
  listRuleMatches,
  listFactWords,
  listConditionWords,
  listRuleParts,
  listRuleWhy,
  listDraftFieldLines,
  LIST_NEEDS,
  LIST_RULE_FIELDS,
  LIST_PURPOSES,
  LIST_STANDINGS,
  LIST_ASSIGNED,
  LIST_DEAL_STAGES,
  LIST_RULE_MAX,
  LIST_ANY_MAX,
  ListFactSchema,
  ListConditionSchema,
  ListRuleSchema,
  LIST_DRAFT_JSON_SCHEMA,
  ListDraftAnswerSchema,
} from "./list-rules";
export type { ListNeed, ListFact, ListAny, ListCondition, ListRule, InList, ListDraftAnswer } from "./list-rules";
export {
  listToken,
  parseListToken,
  unmetNeed,
  listMembers,
  savedListIds,
  savedListLookup,
  listNeeds,
  listsFor,
  resolveList,
  membersOf,
  listUnknownWords,
  savedListTip,
  ruleNeedsViewer,
  pinTokens,
  todayPins,
  togglePin,
  PEOPLE_LIST_GROUPS,
  BUILTIN_LISTS,
  PEOPLE_LISTS,
  PeopleExportQuerySchema,
  viewerListWords,
  TODAY_PINS_MAX,
} from "./lists";
export type {
  ListRef,
  PeopleListGroup,
  ListContext,
  ListUnknownReason,
  Membership,
  SavedListLike,
  ListLookup,
  ListDef,
  SavedListRowLike,
  TodayPin,
} from "./lists";
export {
  personLikeOf,
  peopleVisitsOf,
  withVisitsOf,
  poolRowOf,
  poolRowsOf,
  consultFirstOf,
  poolListContext,
} from "./audience-pool";
export type { PoolCalendar, PoolOptions } from "./audience-pool";
export { legacyErasedPhoneHash, legacyErasedEmailHash, legacyLeadSuppressionHash } from "./erasure";
export { CARRIER_CONSENT_SOURCE } from "./person-consent";
