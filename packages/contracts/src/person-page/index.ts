/**
 * The person page (decision 0052, canvas A): the head and the business a person works at, the business sheet, the
 * signer's name and its gate, the notices, Up next, the figures and the tabs as addresses.
 */
export {
  asNameSource,
  BUSINESS_DOOR_LABEL,
  NAME_SOURCES,
  PERSON_NAME_WORDS,
  PERSON_WALK_WORDS,
  PERSON_WASH_WORDS,
  WORKS_AT_WORDS,
} from "./words";
export type { NameSource } from "./words";
export { AUTOMATIC_NAMING, signerAgrees, signerOf } from "./signer";
export type { Signer, SignerFacts } from "./signer";
export { businessRecordOf, businessTrailOf, leadPeopleIndex, leadPeopleOf, personHeadOf, worksAtOf } from "./business";
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
export {
  PERSON_FIGURES_LABEL,
  PERSON_TAB_WORDS,
  PERSON_TABS_LABEL,
  personRouteOf,
  personTabRoute,
  personTabsOf,
} from "./route";
export type { PersonTab, PersonTabFacts, PersonTabVM } from "./route";
export { personFiguresOf } from "./figures";
export type { PersonFigureFacts, PersonFigureVM } from "./figures";
export { personNextOf, UP_NEXT_WORDS } from "./next";
export type { UpNextAct, UpNextFacts, UpNextRowVM, UpNextVM } from "./next";
export { LAST_WORDS_TITLE, lastWordsOf } from "./last-words";
export type { LastWordVM } from "./last-words";
export { personNoticesOf } from "./notices";
export { NEW_SINCE_WORDS, newSinceOf } from "./new-since";
export type { LookedAt } from "./new-since";
export type { NoticeAct, NoticeFacts, NoticeHome, NoticeVM } from "./notices";
export { PersonCallSchema, PersonNameActSchema, PersonWorksAtSchema } from "./schemas";
export type { PersonCallBody, PersonNameAct } from "./schemas";
export {
  PERSON_CALL_OUTCOMES,
  PERSON_CALL_SAID_MAX,
  PERSON_CALL_WORDS,
  personCallDays,
  personCallFoot,
  personCallLeadArgs,
  personCallNote,
  personCallOf,
  personCallSave,
} from "./call";
export type { PersonCallInput, PersonCallOutcome, PersonCallVM } from "./call";
