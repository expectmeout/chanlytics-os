/**
 * Files: kinds. A file is a picture or a video (decision 0099, stage B). A video is kept by the video platform, and its folder
 * holds only what was made of it: its sheet of frames, its poster and its sound (video.ts, sound.ts).
 */

/** The most one video weighs (decision 0099, stage B, D7): what a phone makes of ten minutes, and some. */
export const FILE_VIDEO_BYTES_MAX = 500_000_000;

/** The longest video, in seconds: a business's clips are short, and this keeps one workspace from filling the account. */
export const FILE_VIDEO_SECONDS_MAX = 600;

/** How many minutes of video a workspace keeps, its videos and its uploads still on their way together (00556 file_video_begin). */
export const FILE_VIDEO_MINUTES_MAX = 60;

/** A picture, or a video: what the row is, which decides where its bytes live and how it is seen. */
export const FILE_KINDS = ["image", "video"] as const;

export type FileKind = (typeof FILE_KINDS)[number];

/**
 * Where a video stands with the video platform: its bytes on their way (`uploading`, which no page or Ask counts yet),
 * arrived and being prepared (`processing`), playable (`ready`), or refused (`failed`). Null for a picture.
 */
export const FILE_MEDIA_STATUSES = ["uploading", "processing", "ready", "failed"] as const;

export type FileMediaStatus = (typeof FILE_MEDIA_STATUSES)[number];

/** The pictures a member may add. */
export const FILE_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

/** The videos a member may add. */
export const FILE_VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export type FileImageMime = (typeof FILE_IMAGE_MIMES)[number];

export type FileVideoMime = (typeof FILE_VIDEO_MIMES)[number];

/** Whether a type is a video's: what the video platform keeps. */
export const isVideoMime = (value: unknown): value is FileVideoMime =>
  typeof value === "string" && (FILE_VIDEO_MIMES as readonly string[]).includes(value);

/** A type's kind. */
export const fileKindOf = (mime: string): FileKind => (isVideoMime(mime) ? "video" : "image");

/**
 * What is made of a video and kept in its folder: its sheet of frames (what a model is shown of it), its poster (what a tile
 * draws) and its sound (what the ears are sent, and sent again on a question). Each goes with the folder. A video made here
 * (00613) keeps its own file there too, since it exists nowhere else: what its Download gives.
 */
export const FILE_MADE_OF_VIDEO = {
  sheet: "sheet.jpg",
  poster: "poster.jpg",
  audio: "audio.m4a",
  video: "video.mp4",
} as const;

export type FileMadeOfVideo = keyof typeof FILE_MADE_OF_VIDEO;

/** The type each is kept under: Storage holds a folder's types to the bucket's list. */
export const FILE_MADE_OF_VIDEO_MIMES = {
  sheet: "image/jpeg",
  poster: "image/jpeg",
  audio: "audio/mp4",
  video: "video/mp4",
} as const satisfies Record<FileMadeOfVideo, string>;

/** Where one of a video's made things lives in its folder. */
export const fileMadePathOf = (tenantId: string, fileId: string, which: FileMadeOfVideo): string =>
  `${tenantId}/${fileId}/${FILE_MADE_OF_VIDEO[which]}`;

/**
 * Where one moment of a video is kept as a still, in its folder: what a post is drawn from, since a post never reads the video
 * platform. Named by its hundredths of a second, so a moment is one object however often it is asked for, and it goes with the folder.
 */
export const fileFramePathOf = (tenantId: string, fileId: string, at: number): string =>
  `${tenantId}/${fileId}/frame-${Math.round(at * 100)}.jpg`;
