/**
 * The people domain: `@chanlytics/db/people`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
  addToList,
  archiveList,
  createList,
  deleteList,
  dropFromList,
  findSavedList,
  listMemberIds,
  listPlaybooksOnList,
  listRow,
  listSavedLists,
  renameList,
  setListRule,
} from "./lists";
export type { ListRow, SavedListRow, WriteError } from "./lists";
export {
  addPersonNote,
  adoptPersonName,
  declinePersonName,
  findKeptPerson,
  findPersonRow,
  getErasureDigests,
  IDS_PER_READ,
  joinPersonToLead,
  leavePersonLead,
  listEveryoneIn,
  listEveryoneOnceIn,
  listNamesOfPeople,
  listPeoplePage,
  listPersonDecisions,
  logPersonCall,
  mergePeople,
  PEOPLE_PAGE,
  peopleCursorOf,
  scrubPersonNotes,
  undoPersonName,
} from "./pages";
export type { PeopleCursor, PersonCallArgs, PersonNameAnswer } from "./pages";
export {
  addPersonByHand,
  dismissPersonDoubt,
  findDoubtOn,
  listPeopleAtLead,
  listSigners,
  markContact,
  markContactSeen,
  openDoubtsOf,
  PERSON_FORGOTTEN,
  recordConsent,
  resolvePerson,
  seePersonNote,
} from "./people";
export type { ResolvedPerson, ResolvePersonInput } from "./people";
export { getThreadIdsWaitingOnYou, getTodayDoneCount, listLastClosedHolds } from "./waiting-on-you";
