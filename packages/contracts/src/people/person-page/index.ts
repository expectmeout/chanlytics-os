/**
 * The person page (decision 0052, canvas A): the head and the business a person works at, the business sheet, the
 * signer's name and its gate, the notices, Up next, the figures and the tabs as addresses.
 */
export { businessRecordOf, leadPeopleIndex, leadPeopleOf, personHeadOf, worksAtOf } from "./business";
export type {
  BusinessPersonVM,
  BusinessRecordVM,
  LeadPeopleIndex,
  LeadPeopleVM,
  PersonFaceVM,
  PersonHeadInput,
  PersonHeadLine,
  PersonHeadVM,
  WorksAtVM,
} from "./business";
export { businessTrailOf } from "./business-trail";
export {
  callBackWaits,
  PERSON_CALL_OUTCOMES,
  PERSON_CALL_SAID_MAX,
  PERSON_CALL_WORDS,
  personCallClosesBack,
  personCallDays,
  personCallFoot,
  personCallLeadArgs,
  personCallNote,
  personCallOf,
  personCallSave,
} from "./call";
export type { PersonCallInput, PersonCallOutcome, PersonCallVM } from "./call";
export { COMBINE_WORDS, combineOf } from "./combine";
export type { CombineVM } from "./combine";
export { personFiguresOf } from "./figures";
export type { PersonFigureFacts, PersonFigureVM } from "./figures";
export { personHeadStateOf } from "./head-state";
export type { PersonHeadStateFacts, PersonHeadStateVM } from "./head-state";
export { LAST_WORDS_TITLE, lastWordsOf } from "./last-words";
export type { LastWordVM } from "./last-words";
export { NEW_SINCE_WORDS, newSinceOf } from "./new-since";
export type { LookedAt } from "./new-since";
export { personNextOf, UP_NEXT_WORDS } from "./next";
export type { UpNextAct, UpNextFacts, UpNextRowVM, UpNextVM } from "./next";
export { personNoticesOf } from "./notices";
export type { CombineAct, NoticeAct, NoticeFacts, NoticeHome, NoticeVM } from "./notices";
export {
  PERSON_FIGURES_LABEL,
  PERSON_TAB_WORDS,
  PERSON_TABS_LABEL,
  personRouteOf,
  personTabRoute,
  personTabsOf,
  personTabWord,
} from "./route";
export type { PersonTab, PersonTabFacts, PersonTabVM } from "./route";
export { PersonCallSchema, PersonNameActSchema, PersonWorksAtSchema } from "./schemas";
export type { PersonCallBody, PersonNameAct } from "./schemas";
export { AUTOMATIC_NAMING, signerAgrees, signerOf } from "./signer";
export type { Signer, SignerFacts } from "./signer";
export { earlierVisitsOf, VISITS_TAB_WORDS } from "./visits";
export type { PersonVisitRowVM, PersonVisitsVM } from "./visits";
export {
  asNameSource,
  BUSINESS_DOOR_LABEL,
  CALL_FACT_WORDS,
  messagesSummaryOf,
  NAME_SOURCES,
  PERSON_ABOUT_WORDS,
  PERSON_LISTS_SHEET_WORDS,
  PERSON_NAME_WORDS,
  PERSON_PEEK_WORDS,
  PERSON_WALK_WORDS,
  PERSON_WASH_WORDS,
  receptionistKnowsOf,
  WORKS_AT_WORDS,
} from "./words";
export type { MessagesSummaryPart, NameSource } from "./words";
