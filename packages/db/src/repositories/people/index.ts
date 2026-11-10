/**
 * The people domain: `@chanlytics/db/people`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export { noteEmailTheyGave, setPersonEmail } from "./email";
export type { EmailNoted } from "./email";
export { listErasedByEmail, listErasedByPhone } from "./erased";
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
  addBulkNote,
  countPeopleListed,
  findPersonNote,
  listPeopleStanding,
  listPeopleWith,
  listPersonNotes,
  pageReplyRules,
  setPersonName,
  setPersonNotes,
  setPersonProposal,
} from "./member-reads";
export {
  decidePersonNote,
  editPersonNote,
  listNoteCandidates,
  markPersonNoteDone,
  removePersonNote,
  suggestNoteOnPerson,
} from "./notes";
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
