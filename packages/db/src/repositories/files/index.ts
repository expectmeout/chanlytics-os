/**
 * The files domain: `@chanlytics/db/files`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
  beginFileVideo,
  deleteFileRow,
  keepFileLook,
  keepFileSound,
  keepManyFiles,
  markFileMediaFailed,
  markFileMediaProcessing,
  markFileMediaReady,
  recordFileFound,
  recordFileMade,
  recordFilePurged,
  removeLapsedUpload,
  setFileListingAside,
  startFile,
  updateFileRow,
} from "./doors";
export type { FileFate, MediaFate, VideoFate } from "./doors";
export {
  filesBucket,
  findFile,
  findFileForWork,
  getFileMade,
  getNewestMade,
  keepClaudeCopy,
  keepVideoSeconds,
  listFiles,
  listFilesNamedBy,
  listFilesOnShelf,
  listFilesTallied,
  listFilesToLookAgain,
  listFilesToPurgeAgain,
  listVideosHeard,
  listVideosToDigestAgain,
  listVideosWaiting,
  markFileSeen,
  readFileSound,
} from "./files";
export type { FileMemberRow, FileRow, VideoToDigest, VideoWaiting } from "./files";
