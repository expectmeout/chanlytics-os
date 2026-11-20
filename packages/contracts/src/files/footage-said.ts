/**
 * The few sentences of a watched folder that two trees say: its setup's own words (footage-setup.ts) and AI's card for a
 * pasted folder (content/bring-in.ts, whose spec every page carries). A module of its own, so a page that holds a
 * card's spec carries these few and none of the setup's.
 */
/** A folder's or a file's name as a sentence names it. */
export const quotedName = (name: string): string => `“${name}”`;

export const FOOTAGE_SAID = {
  /** The last step's title, and the card's wherever a card is named in a line. */
  watchTitle: (name: string): string => `Watch ${quotedName(name)}`,
  /** What the last press says once it went through: only what is known, no promise of minutes. */
  watching: (name: string): string =>
    `Watching ${quotedName(name)}. The first photos and videos show up in your Library as they come in.`,
  /** Connecting reads a person's Drive, so it follows who may bring things in. */
  notAllowed: "Only an owner or a partner can connect a folder.",
  /** A deployment, or a workspace, where connecting Drive is not offered. */
  notOffered: "Connecting Google Drive isn't available here yet.",
  /** What a watched folder brings is the business's own, so nothing waits for a Keep. */
  straight: "What comes from your folder goes straight into the Library.",
  /** The workspace's video switch is off: said by a folder whose videos wait on it, and by the video maker. */
  videosOff: "Videos aren't on for this workspace yet.",
  /**
   * The folder's older files, asked for through AI (the screens canvas's call 7): what the first look left in Drive, past
   * the newest of the last thirty days. Its card, and what its press says once it went through.
   */
  older: {
    title: (files: number, name: string): string =>
      `Bring in ${files === 1 ? "1 older file" : `${files.toLocaleString("en-US")} older files`} from ${quotedName(name)}`,
    summary: (aDay: number): string =>
      `They come in by themselves, ${aDay} a day, and go straight into the Library. The originals stay in Drive.`,
    done: (files: number): string =>
      `Asked for ${files === 1 ? "1 older file" : `${files.toLocaleString("en-US")} older files`}. They show up in your Library as they come in.`,
  },
} as const;
