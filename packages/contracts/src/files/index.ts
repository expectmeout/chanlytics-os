export { FILE_COPIES_DOOR } from "./edge-doors";
export { FILE_WORDS, fileCursorOf, filesSayOf } from "./files";
export {
  FILE_BYTES_MAX,
  FILE_CACHE_S,
  FILE_LOOK_STATUSES,
  FILE_MIMES,
  FILE_NAME_MAX,
  FILE_NAME_WORDS,
  FILE_PIXELS_MAX,
  FILE_SHOWS,
  FILE_SIDE_MIN,
  FILE_SOURCES,
  FILE_STATUSES,
  FILE_TYPES,
  FILE_UPLOADS_AT_ONCE,
  FILE_WHO_IN_IT,
  filePathOf,
  FILES_BUCKET,
  FILES_MAX,
  FILES_PAGE,
  isFileMime,
} from "./limits";
export type { FileLookStatus, FileMime, FileShows, FileSource, FileStatus, FileWhoInIt } from "./limits";
export {
  FILE_COPY_KEEP_S,
  FILE_COPY_SIDE,
  FILE_LOOK_EDITION,
  FILE_LOOK_PLAIN_HINT,
  FILE_LOOK_SCHEMA,
  FILE_LOOK_SYSTEM,
  FILE_PICTURE_KEEP_S,
  fileLookAsked,
  fileLookOf,
} from "./look";
export type { FileLook, FileLookRead } from "./look";
export type { FileQuality } from "./look";
export {
  POST_LAYOUTS,
  POST_LIMITS,
  POST_NO_PHONE,
  POST_PICTURES,
  POST_SHAPES,
  POST_VOICES,
  POST_WORDS,
  postPhotoWont,
  postPlanOf,
  postPlanTidied,
  postWordsIn,
} from "./post";
export type {
  PostLanguage,
  PostLayoutName,
  PostPhotoWont,
  PostPicture,
  PostPlan,
  PostShapeName,
  PostUndrawable,
  PostVoice,
  PostWords,
} from "./post";
export {
  FILE_GOOGLE_WORDS_MAX,
  FILE_SHELVES,
  fileFolderOf,
  fileNameOf,
  fileSaidOf,
  fileShelfOpening,
  filesTallyOf,
  fileViewOf,
  inboxCleanOf,
  postNameOf,
  shelfFilterOf,
  shelfOf,
  uploadNameOf,
  whoStandsOf,
} from "./views";
export type {
  FileDto,
  FileMade,
  FilePeople,
  FilePosted,
  FileRecordDto,
  FileShelf,
  FileShelfFilter,
  FilesPageDto,
  FilesTally,
  FileWhoStands,
} from "./views";
