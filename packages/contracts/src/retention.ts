/**
 * How long the product keeps what, in one place.
 *
 * The privacy page says it and a sweep enforces it, and both read this file, so
 * the two cannot drift. A table is listed here only once something actually
 * removes it on that schedule: a number on this list is a promise the product
 * keeps, not one it would like to. Until 12 Sep 2026 the page said "call
 * recordings are kept for 90 days" and nothing in the repo deleted one.
 */
export const RETENTION_DAYS = {
  /** Call audio in the private media bucket. The transcript and the summary stay with the call. */
  call_recordings: 90,
} as const;

export const RECORDING_RETENTION_DAYS: number = RETENTION_DAYS.call_recordings;

/** What a call says once its audio has been removed on schedule. */
export const RECORDING_PURGED_WORDS = `Recording removed after ${RECORDING_RETENTION_DAYS} days; the transcript is kept`;
