/**
 * What a video's tile says while its picture is not there: being made ready, or not to be. A module of its own, which
 * FILE_WORDS spreads into `video` (files.ts): Today's Content card says these on the route every page loads, and a bundler
 * takes a module whole, so beside FILE_WORDS they brought all of it, 3 KB gzipped (the bundle check, 17 Nov 2026).
 */
export const VIDEO_TILE_WORDS = {
  gettingReady: "Getting it ready",
  notPrepared: "Couldn't be prepared",
} as const;
