/**
 * The files domain: `@chanlytics/db/files`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
  deleteFileRow,
  keepFileLook,
  keepManyFiles,
  recordFileFound,
  recordFileMade,
  recordFilePurged,
  setFileListingAside,
  startFile,
  updateFileRow,
} from "./doors";
export type { FileFate } from "./doors";
export {
  filesBucket,
  findFile,
  findFileForWork,
  getFileMade,
  getNewestMade,
  keepClaudeCopy,
  listFiles,
  listFilesNamedBy,
  listFilesOnShelf,
  listFilesTallied,
  listFilesToLookAgain,
  listFilesToPurgeAgain,
  markFileSeen,
} from "./files";
export type { FileMemberRow, FileRow } from "./files";
