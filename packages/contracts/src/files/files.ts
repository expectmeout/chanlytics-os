/** Files: files. */

import type { FileDto, FileShelf, FilesTally } from "./views";
import type { FileShows, FileSource, FileWhoInIt } from "./limits";
import { FILE_VIDEO_MINUTES_MAX } from "./kinds";

/** The place in a shelf's order a page ends at, for the next to start from. */
export const fileCursorOf = (file: Pick<FileDto, "created_at" | "id">): string => `${file.created_at}|${file.id}`;

/** What the page says of the workspace's files, as STATUS.md would: how many, how many wait for a person, how many for the look. */
/** "6 photos", "1 video", "6 photos and 2 videos": what is kept, by kind, a kind with none left unsaid unless all are none. */
export function keptSaidOf(keptCount: number, videos: number): string {
  const photos = Math.max(0, keptCount - videos);
  const photosSaid = `${photos} ${photos === 1 ? "photo" : "photos"}`;
  const videosSaid = `${videos} ${videos === 1 ? "video" : "videos"}`;
  if (videos === 0) return photosSaid;
  return photos === 0 ? videosSaid : `${photosSaid} and ${videosSaid}`;
}

export function filesSayOf(tally: Pick<FilesTally, "kept" | "waiting" | "looking"> & { videos?: number }): string {
  const { kept, waiting, looking } = tally;
  return [
    keptSaidOf(kept, tally.videos ?? 0),
    ...(waiting ? [`${waiting} waiting for you`] : []),
    ...(looking ? [`Ask is still looking at ${looking}`] : []),
  ].join(", ");
}

export const FILE_WORDS = {
  askAbout: "Ask about this photo",
  makePost: "Make a post",
  showMore: "Show more",
  newVersion: "New version",
  google: {
    post: "Post to Google",
    words: "What it says on Google",
    wordsNeeded: "Say something to go with it.",
    tooLong: "Google takes up to 1,500 characters.",
    cancel: "Cancel",
    posted: "Sent to Google. It can take a few minutes to show.",
    on: "On your Google profile",
    see: "See it",
    down: "Take it down",
    downAsk: "Take this post off your Google profile?",
    downNote: "It leaves your profile. The post stays here.",
    downKeep: "Keep it up",
    downed: "Taken off your Google profile.",
    notConnected: "Connect your Business Profile first: posts go through it.",
    noToken: "The connection to Google was lost. Connect again from Connections.",
    refused: "Google did not take the post.",
    noPhoto: "The photo this came from was deleted, so it can't be drawn for Google.",
    notAPost: "Only a post can go on Google.",
    notSent: "The post did not go through. Try again.",
    onItsWay: "This post is already on its way to Google.",
    /** A post set for its time whose send got no answer (00616): Google keeps nothing to ask after, so a person looks. */
    unknown: "Google did not say whether this went up. Look on your profile before posting it again.",
    /** Set for its time, and on its way (00616). */
    later: "Set to go on Google at its time.",
    /** The recheck at its time: Google was let go of, or the person who set it may no longer post. */
    heldNoConnection: "It waits until Google is connected again.",
  },
  madeFrom: "Made from",
  madeFromGone: "Made with Ask, from a photo since deleted",
  title: "Files",
  add: "Add photos",
  dropToAdd: "Drop to add",
  orDrop: "or drop them here",
  adding: (done: number, of: number) => `Adding ${done} of ${of}`,
  emptyTitle: "No photos yet",
  emptyBody: "Add the ones that show your place and your work. Ask looks at each one and names it for what it shows.",
  retry: "Try again",
  reading: "Reading your files…",
  failedRead: "Your files could not be read.",
  added: (n: number) => (n === 1 ? "Photo added." : `${n} photos added.`),
  notAdded: (n: number) => (n === 1 ? "1 photo wasn't added." : `${n} photos weren't added.`),
  tookFirst: (n: number, of: number) => `Took the first ${n} of ${of}. Add the rest after these.`,
  sentSoFar: (percent: number) => `${percent}% sent`,
  waitingToSend: "Waiting to send",
  tryAll: (n: number) => `Try all ${n}`,
  takeAway: "Remove",
  noneFiled: "Nothing is kept yet. Your photos are on the other shelves.",
  mayChange: "change a photo",
  saving: "Saving…",
  removed: "Photo deleted.",
  dontDelete: "Don't delete",
  inboxSays: (clean: number, left: number) =>
    clean === 0
      ? left === 1
        ? "1 to look at."
        : `${left} to look at.`
      : [
          clean === 1 ? "1 looks like yours." : `${clean} look like yours.`,
          ...(left === 0 ? [] : [left === 1 ? "1 is left for you to open." : `${left} are left for you to open.`]),
        ].join(" "),
  keepMany: (n: number) => `Keep ${n}`,
  kept: (n: number) => (n === 1 ? "1 photo kept." : `${n} photos kept.`),
  /** Found online: none of what still waits is the business's, set aside together (00619), as Set aside does one. */
  notMine: "Not mine",
  setAsideMany: (n: number) => (n === 1 ? "1 photo set aside." : `${n} photos set aside.`),
  /**
   * The bell, once, as photos found for the business first wait in the Library's inbox (the content canvas, PhDoors "bell",
   * which counts them): no count, since one written as the bell rings is wrong by the time it is read, a photo kept or set
   * aside since.
   */
  bell: {
    title: "New photos are waiting",
    body: "Keep them, or set them aside",
  },
  /**
   * The Library's one row (Ruben, 12 Nov 2026): what is certain of a file, its kind, never a guess at what it shows. What Ask's
   * look saw is found by its words instead (`find`), and what waits for a yes or was set aside is a quiet line, not a tab.
   */
  views: { all: "All", photos: "Photos", videos: "Videos" },
  find: "Find a photo or video",
  findClear: "Clear",
  foundNone: (words: string) => `Nothing matches “${words}”.`,
  /** As short as Made's amber line ("2 posts didn't go out"): what Look opens says where they were found. */
  waitingLine: (n: number) => (n === 1 ? "1 photo found online" : `${n} photos found online`),
  look: "Look",
  setAsideLine: (n: number) => `${n} set aside`,
  backToAll: "All",
  shelves: {
    all: "Kept",
    inbox: "Found online",
    place: "Place",
    work: "Work",
    team: "Team",
    products: "Products & menus",
    brand: "Logos & graphics",
    made: "Made by Ask",
    other: "Other",
    set_aside: "Set aside",
    made_aside: "Set aside",
  } satisfies Record<FileShelf, string>,
  shows: {
    storefront: "Storefront",
    interior: "Inside",
    work: "Work",
    team: "Team",
    product: "Product",
    menu: "Menu or prices",
    logo: "Logo",
    graphic: "Flyer or graphic",
    other: "Something else",
  } satisfies Record<FileShows, string>,
  who: {
    not_asked: "Not asked",
    no_one: "No one's in it",
    agreed: "They agreed",
  } satisfies Record<FileWhoInIt, string>,
  whoClear: "No one you could recognize",
  whoAsk: (seen: number | null) =>
    seen === null
      ? "Did everyone in this photo agree to be shown?"
      : `Ask saw ${seen} ${seen === 1 ? "person" : "people"}. Did they agree to be shown?`,
  whoChange: "Change",
  sources: {
    upload: "Added by you",
    google_profile: "From your Google profile",
    google_listing: "From your Google listing",
    website: "From your website",
    made: "Made with Ask",
  } satisfies Record<FileSource, string>,
  looking: "Ask is looking at it",
  notRead: "Ask couldn't read this one yet. It's still yours to use.",
  refused: "Ask wouldn't read this one, so it's waiting for you.",
  stock: "This may be a stock photo.",
  name: "Name",
  save: "Save",
  shelf: "Shows",
  shelfNone: "Not sorted yet",
  who_label: "Who's in it",
  keep: "Keep it",
  setAside: "Set aside",
  putBack: "Put back",
  download: "Download",
  remove: "Delete",
  removeAsk: "Delete this photo?",
  /** A delete waits ten minutes for Undo (00616, FILE_UNDO_MINUTES) before its bytes go for good. */
  removeNote: "You can undo it for ten minutes.",
  /** Undo, pressed in time: the file is back where it was. */
  restored: "It's back.",
  /** Undo, pressed once its bytes had begun to go. */
  restoreGone: "It's gone now, and can't be brought back.",
  close: "Close",
  nameEmpty: "Give it a name.",
  /** A caption changed where it stands (Content's Details): only what Ask made has one. */
  captionNotMade: "Only a piece Ask made has a caption.",
  captionLong: (most: number) => `A caption takes up to ${most.toLocaleString("en-US")} characters.`,
  full: "This workspace holds as many files as it can. Remove some first.",
  wrongType: "That isn't a photo we can keep. Use a JPEG, PNG, WebP or HEIC.",
  tooBig: "That photo is over 25 MB.",
  tooSmall: "That photo is too small to use.",
  tooManyPixels: "That photo is too large to work with. Use a copy under 50 megapixels.",
  unreadable: "We couldn't read that photo. Try a JPEG or PNG copy.",
  notSaved: "That photo could not be saved. Try again.",
  twin: "Already here",
  alreadyHere: (n: number) => (n === 1 ? "1 was already here." : `${n} were already here.`),
  gone: "That file is gone.",
  /** A video's words (decision 0099, stage B): drawn only where the workspace takes videos (video.ts videoPreviewOf). */
  video: {
    askAbout: "Ask about this video",
    /** What Make a post asks of a video, as MAKE_POST_ASK does of a photo: Ask chooses the moment after looking. */
    makePostAsk: {
      en: "Make a post from the best moment of this video",
      es: "Haz una publicación con el mejor momento de este video",
    },
    add: "Add photos or videos",
    emptyTitle: "No photos or videos yet",
    emptyBody:
      "Add the ones that show your place and your work. Ask looks at each one, and listens to each video, and names it for what it shows.",
    added: (n: number) =>
      n === 1 ? "Video added. It's being prepared." : `${n} videos added. They're being prepared.`,
    gettingReady: "Getting it ready",
    notPrepared: "Couldn't be prepared",
    notPreparedNote: "The video couldn't be read. Delete it, and add another copy.",
    whatIsSaid: "What is said",
    howItSounds: "How it sounds",
    noOneSpeaks: "No one speaks in it.",
    noSound: "It has no sound.",
    notHeardYet: "Not heard yet.",
    voice: (n: number) => `Voice ${n}`,
    showAll: "Show all of it",
    play: "Play",
    cantPlay: "This video can't play just now. Try again in a minute.",
    removeAsk: "Delete this video?",
    removed: "Video deleted.",
    wrongType: "That video isn't one we can keep. Use an MP4, MOV or WebM.",
    tooLong: "Up to 10 minutes a video.",
    tooBig: "Up to 500 MB a video.",
    full: `Your videos are full: ${FILE_VIDEO_MINUTES_MAX} minutes at most. Delete one to add another.`,
    off: "Videos can't be added just now.",
    notSaved: "That video could not be sent. Try again.",
    noDownload: "A video is kept here to play and to show Ask. Its own file stays with you.",
    notAVideo: "That file is a photo, not a video.",
    sending: (sent: number) => `Sending ${Math.round(sent * 100)}%`,
  },
} as const;
