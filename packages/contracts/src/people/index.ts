/** People: the relationship record, its page, its lists, the pool every list is judged over, and what erasure leaves. */
export { NOTE_LINE_MAX, NOTE_MAX, NOTE_REFUSALS, NOTE_WORDS, personNotesVM } from "../notes/person-notes";
export type { PersonNoteDto, PersonNoteTeamDto, PersonNoteVM } from "../notes/person-notes";
export {
  consultFirstOf,
  peopleVisitsOf,
  personLikeOf,
  poolListContext,
  poolRowOf,
  poolRowsOf,
  withVisitsOf,
} from "./audience-pool";
export type { PoolCalendar, PoolOptions } from "./audience-pool";
export {
  ConsentAnswerBody,
  ConsentManyBody,
  NotesAppendManyBody,
  NoteWriteBody,
  PersonAddBody,
  PersonMergeBody,
  ReceptionistManyBody,
  ReceptionistModeBody,
} from "./doors/person-bodies";
export type { ConsentAnswer, NoteWrite, PersonAdd, PersonReceptionistMode } from "./doors/person-bodies";
export {
  dealFill,
  dealSheetFill,
  noteFill,
  noteSheetFill,
  SAY_IT_DEAL_JSON_SCHEMA,
  SAY_IT_MAX,
  SAY_IT_NOTE_JSON_SCHEMA,
  SAY_IT_VERBS,
  SAY_IT_WORDS,
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
export type { SayItInput } from "./doors/say-it-schema";
export {
  confirmPageWords,
  looksMadeUp,
  maskAddress,
  SIGNUP_ASK_LIMITS,
  SIGNUP_CONFIRM_MS,
  SIGNUP_CONFIRM_SOURCE,
  signupAddressKey,
  signupAskLine,
  signupAskOf,
  signupAskRefusal,
  signupConfirmEmail,
} from "./doors/signup-confirm";
export type { ConfirmPageView, SignupAskFacts, SignupAskRefusal } from "./doors/signup-confirm";
export {
  WebsiteFormBody,
  websiteFormLate,
  websiteFormNote,
  websiteFormNotice,
  websiteFormPerson,
} from "./doors/website-form";
export type { WebsiteForm, WebsiteFormInput } from "./doors/website-form";
export { legacyErasedEmailHash, legacyErasedPhoneHash, legacyLeadSuppressionHash } from "./erasure";
export { BUILTIN_LISTS, LIST_GROUP_WORDS, listAsks, PEOPLE_LIST_GROUPS, PEOPLE_LISTS } from "./lists/builtin-lists";
export type { PeopleListGroup } from "./lists/builtin-lists";
export {
  LIST_ANY_MAX,
  LIST_ASSIGNED,
  LIST_DEAL_STAGES,
  LIST_NEEDS,
  LIST_PURPOSES,
  LIST_RULE_FIELDS,
  LIST_RULE_MAX,
  LIST_STANDINGS,
} from "./lists/list-fields";
export type { ListNeed } from "./lists/list-fields";
export { listRuleMatches, ruleLists, ruleNeeds } from "./lists/list-match";
export type { InList } from "./lists/list-match";
export {
  asListRule,
  draftListRule,
  LIST_DRAFT_JSON_SCHEMA,
  ListConditionSchema,
  listConditionWords,
  listDraftFieldLines,
  ListFactSchema,
  listFactWords,
  listRuleParts,
  ListRuleSchema,
  listRuleWhy,
  ruleUndated,
} from "./lists/list-rules";
export type { ListAny, ListCondition, ListFact, ListRule } from "./lists/list-rules";
export { ListDraftAnswerSchema, PeopleExportQuerySchema } from "./lists/list-schemas";
export type { ListDraftAnswer } from "./lists/list-schemas";
export { listToken, parseListToken } from "./lists/list-token";
export type { ListRef } from "./lists/list-token";
export {
  listMembers,
  listNamer,
  listNeeds,
  listsFor,
  listUnknownWords,
  membersOf,
  resolveList,
  ruleNeedsViewer,
  savedListIds,
  savedListLookup,
  savedListTip,
  unmetNeed,
  viewerListWords,
} from "./lists/lists";
export type {
  ListContext,
  ListDef,
  ListLookup,
  ListUnknownReason,
  Membership,
  SavedListLike,
  SavedListRowLike,
} from "./lists/lists";
export { GET_YES_PARAM, GET_YES_ROUTE, parsePeopleRoute, peopleRoute } from "./lists/people-route";
export { pinTokens, TODAY_PINS_MAX, todayPins, togglePin } from "./lists/today-pins";
export type { ListCountsDto, TodayPin } from "./lists/today-pins";
export {
  cannotBeSentWords,
  NO_CHANNEL_REACH,
  NO_NUMBER_REACH,
  noChannelWords,
  noNumberWords,
  noYesWords,
  peopleAggregates,
  peopleListAction,
  saidYesWords,
  savedListAction,
} from "./people-lists";
export type { PeopleAggregates, PeopleListAction } from "./people-lists";
export { attentionRow } from "./person-attention";
export type { AttentionRowVM } from "./person-attention";
export type { PersonAboutFact, PersonFact, PersonRightNow } from "./person-cards";
export {
  CONSENT_RESET_SOURCE,
  CONSENT_SOURCES,
  consentSourceLabel,
  mayReceive,
  OFFERS_YES_SOURCES,
  offersYesRefusal,
  OWN_MESSAGE_REFUSALS,
  ownMessageRefusal,
  saidYesTo,
  whyNotReceive,
} from "./person-consent";
export { CARRIER_CONSENT_SOURCE, STOP_ENDED_OFFERS_SOURCE, WHATSAPP_CONSENT_SOURCE } from "./person-consent";
export type { NotReceived, PersonConsent, ReceiveRow } from "./person-consent";
export { DOUBT_SEEN, DOUBT_SETTLED_AS, DOUBT_WORDS } from "./person-doubts";
export type { DoubtSeen, DoubtSettledAs, PersonDoubtDto } from "./person-doubts";
export type {
  PersonAtLeadDto,
  PersonBusinessDto,
  PersonCampaignDto,
  PersonCampaignVM,
  PersonDecisionDto,
  PersonDetailDto,
  PersonEscalationDto,
  PersonIdentityDto,
  PersonLeadDto,
  PersonRowDto,
  PersonSignerDto,
} from "./person-dto";
export { MERGE_ANSWERS, MERGE_CONSENT_SOURCE, MERGE_REFUSALS, MERGE_WORDS, mergedAnswers } from "./person-merge";
export type { MergedAnswers, RecordAnswers } from "./person-merge";
export { callerName } from "./person-name";
// What to call a person is person-name.ts's one rule; People reads it from there
// like every other surface, and the index exports it from there.
export { personName } from "./person-name";
export type { NameableCaller, NameableContact } from "./person-name";
export {
  filterTimeline,
  PERSON_ACT_WORDS,
  PERSON_DELETE_WORDS,
  personActs,
  personNextFor,
  TIMELINE_FILTERS,
  timelineFilterLabel,
  toPersonVM,
} from "./person-profile";
export type { OwnMessageVM, PersonActVM, PersonDoubtVM, PersonVM, TimelineFilterId } from "./person-profile";
export {
  bookingLinkAction,
  mayReach,
  proposalAction,
  proposalMessage,
  repliesWords,
  rowReachWords,
} from "./person-reach";
export type { RowReachWords } from "./person-reach";
export type { BookingLinkAction, PersonProposalVM } from "./person-reach";
export {
  asPersonMode,
  OWN_MODE_NAMED,
  ownModesOf,
  ownModesWords,
  PERSON_MODE_LABELS,
  PERSON_MODE_WORDS,
  PERSON_MODES,
} from "./person-receptionist";
export type { HolderNames, OwnModesDto, PersonMode, PersonReceptionist, ReceptionistTone } from "./person-receptionist";
export { cameFromOf, toPersonRowVM, visitLineForDto } from "./person-row";
export type { PersonRowVM } from "./person-row";
export { ago } from "./person-row-facts";
export type { PersonFirstContact, PersonLastContact } from "./person-row-facts";
export {
  attentionOf,
  holderOf,
  NEW_WINDOW_DAYS,
  PEOPLE_TABS,
  PERSON_STATE_LABELS,
  personStanding,
  personStateFor,
  QUIET_AFTER_DAYS,
  stopToldBesideState,
} from "./person-state";
export type { PersonState, ThreadHolder } from "./person-state";
export { consentChangeWords } from "./person-timeline";
export type { PersonTimelineItemVM, PersonVisitAheadVM, TimelineKind } from "./person-timeline";
// A person's wires and where they came from, in words: the leaf the list rules read too (person-words.ts).
export { fromAdWords, PERSON_AD_ON, PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS } from "./person-words";
export type { PersonCameFrom, PersonChannel } from "./person-words";
