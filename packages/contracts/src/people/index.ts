/** People: the relationship record, its page, its lists, the pool every list is judged over, and what erasure leaves. */
export { callerName } from "./person-name";
export type { NameableContact, NameableCaller } from "./person-name";
// What to call a person is person-name.ts's one rule; People reads it from there
// like every other surface, and the index exports it from there.
export { personName } from "./person-name";
// A person's wires and where they came from, in words: the leaf the list rules read too (person-words.ts).
export { PERSON_AD_ON, PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS, fromAdWords } from "./person-words";
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
  PersonAtLeadDto,
  PersonSignerDto,
  PersonBusinessDto,
} from "./person-dto";
export {
  asPersonMode,
  PERSON_MODES,
  PERSON_MODE_LABELS,
  PERSON_MODE_WORDS,
  OWN_MODE_NAMED,
  ownModesOf,
  ownModesWords,
} from "./person-receptionist";
export type { PersonMode, ReceptionistTone, PersonReceptionist, HolderNames, OwnModesDto } from "./person-receptionist";
export { ago } from "./person-row-facts";
export type { PersonLastContact, PersonFirstContact } from "./person-row-facts";
export {
  personStanding,
  attentionOf,
  holderOf,
  personStateFor,
  stopToldBesideState,
  PERSON_STATE_LABELS,
  PEOPLE_TABS,
  NEW_WINDOW_DAYS,
  QUIET_AFTER_DAYS,
} from "./person-state";
export type { PersonState, ThreadHolder } from "./person-state";
export {
  bookingLinkAction,
  proposalMessage,
  proposalAction,
  repliesWords,
  rowReachWords,
  mayReach,
} from "./person-reach";
export type { RowReachWords } from "./person-reach";
export type { PersonProposalVM, BookingLinkAction } from "./person-reach";
export { cameFromOf, visitLineForDto, toPersonRowVM } from "./person-row";
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
export type { PersonConsent, NotReceived, ReceiveRow } from "./person-consent";
export { personNotesVM, NOTE_LINE_MAX, NOTE_MAX, NOTE_WORDS, NOTE_REFUSALS } from "../notes/person-notes";
export type { PersonNoteDto, PersonNoteTeamDto, PersonNoteVM } from "../notes/person-notes";
export {
  peopleListAction,
  savedListAction,
  noNumberWords,
  noYesWords,
  noChannelWords,
  cannotBeSentWords,
  saidYesWords,
  peopleAggregates,
  NO_NUMBER_REACH,
  NO_CHANNEL_REACH,
} from "./people-lists";
export type { PeopleListAction, PeopleAggregates } from "./people-lists";
export { attentionRow } from "./person-attention";
export type { AttentionRowVM } from "./person-attention";
export {
  filterTimeline,
  PERSON_ACT_WORDS,
  PERSON_DELETE_WORDS,
  personActs,
  personNextFor,
  timelineFilterLabel,
  toPersonVM,
  TIMELINE_FILTERS,
} from "./person-profile";
export type { TimelineFilterId, PersonVM, PersonActVM, OwnMessageVM, PersonDoubtVM } from "./person-profile";
export type { PersonAboutFact, PersonRightNow, PersonFact } from "./person-cards";
export { consentChangeWords } from "./person-timeline";
export type { TimelineKind, PersonTimelineItemVM, PersonVisitAheadVM } from "./person-timeline";
export {
  asListRule,
  draftListRule,
  listFactWords,
  listConditionWords,
  listRuleParts,
  listRuleWhy,
  ruleUndated,
  listDraftFieldLines,
  ListFactSchema,
  ListConditionSchema,
  ListRuleSchema,
  LIST_DRAFT_JSON_SCHEMA,
} from "./lists/list-rules";
export { ListDraftAnswerSchema, PeopleExportQuerySchema } from "./lists/list-schemas";
export type { ListFact, ListAny, ListCondition, ListRule } from "./lists/list-rules";
export {
  LIST_NEEDS,
  LIST_RULE_FIELDS,
  LIST_PURPOSES,
  LIST_STANDINGS,
  LIST_ASSIGNED,
  LIST_DEAL_STAGES,
  LIST_RULE_MAX,
  LIST_ANY_MAX,
} from "./lists/list-fields";
export type { ListNeed } from "./lists/list-fields";
export { ruleNeeds, ruleLists, listRuleMatches } from "./lists/list-match";
export type { InList } from "./lists/list-match";
export type { ListDraftAnswer } from "./lists/list-schemas";
export { GET_YES_PARAM, GET_YES_ROUTE, parsePeopleRoute, peopleRoute } from "./lists/people-route";
export {
  unmetNeed,
  listMembers,
  savedListIds,
  savedListLookup,
  listNamer,
  listNeeds,
  listsFor,
  resolveList,
  membersOf,
  listUnknownWords,
  savedListTip,
  ruleNeedsViewer,
  viewerListWords,
} from "./lists/lists";
export { PEOPLE_LIST_GROUPS, LIST_GROUP_WORDS, BUILTIN_LISTS, PEOPLE_LISTS, listAsks } from "./lists/builtin-lists";
export { listToken, parseListToken } from "./lists/list-token";
export { pinTokens, todayPins, togglePin, TODAY_PINS_MAX } from "./lists/today-pins";
export type {
  ListContext,
  ListUnknownReason,
  Membership,
  SavedListLike,
  ListLookup,
  ListDef,
  SavedListRowLike,
} from "./lists/lists";
export type { PeopleListGroup } from "./lists/builtin-lists";
export type { ListRef } from "./lists/list-token";
export type { TodayPin, ListCountsDto } from "./lists/today-pins";
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
export { CARRIER_CONSENT_SOURCE, STOP_ENDED_OFFERS_SOURCE, WHATSAPP_CONSENT_SOURCE } from "./person-consent";
export { MERGE_ANSWERS, MERGE_CONSENT_SOURCE, MERGE_REFUSALS, MERGE_WORDS, mergedAnswers } from "./person-merge";
export type { MergedAnswers, RecordAnswers } from "./person-merge";
export { DOUBT_SEEN, DOUBT_SETTLED_AS, DOUBT_WORDS } from "./person-doubts";
export type { DoubtSeen, DoubtSettledAs, PersonDoubtDto } from "./person-doubts";
export {
  ConsentAnswerBody,
  ConsentManyBody,
  NoteWriteBody,
  NotesAppendManyBody,
  PersonAddBody,
  PersonMergeBody,
  ReceptionistManyBody,
  ReceptionistModeBody,
} from "./doors/person-bodies";
export type { ConsentAnswer, NoteWrite, PersonAdd, PersonReceptionistMode } from "./doors/person-bodies";
export {
  SAY_IT_DEAL_JSON_SCHEMA,
  SAY_IT_MAX,
  SAY_IT_NOTE_JSON_SCHEMA,
  SAY_IT_VERBS,
  SAY_IT_WORDS,
  dealFill,
  dealSheetFill,
  noteFill,
  noteSheetFill,
  sayItFilled,
} from "./doors/say-it";
export type {
  SayItDealAnswer,
  SayItDealFill,
  SayItDto,
  SayItNoteAnswer,
  SayItNoteFill,
  SayItVerb,
} from "./doors/say-it";
export { SayItDealAnswerSchema, SayItInputSchema, SayItNoteAnswerSchema } from "./doors/say-it-schema";
export {
  WebsiteFormBody,
  websiteFormLate,
  websiteFormNote,
  websiteFormNotice,
  websiteFormPerson,
} from "./doors/website-form";
export type { WebsiteForm, WebsiteFormInput } from "./doors/website-form";
export type { SayItInput } from "./doors/say-it-schema";
