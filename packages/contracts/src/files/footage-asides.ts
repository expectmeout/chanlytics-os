/**
 * What a watched folder says quietly, beside where it stands (the content loop PRD v3.1, pass 0, F3 and F5): what it
 * could not bring in, each with its one reason, and the videos Google Drive is still processing. The first real run
 * found both said nowhere but the folder's sheet. Said once, in these words, by the row in Settings, the Library's
 * line and AI's facts (footage.ts footageLineOf, the Connections row, server files/line.ts folderLineOf). Pure.
 */
import { FILE_VIDEO_SECONDS_MAX } from "./kinds";

/** What a folder could not bring in, by its one reason (source_items_tally, 00674). */
export interface FootageMissedDto {
  /** Tried three times, and it would not come. */
  failed: number;
  /** Longer than AI can watch. */
  too_long: number;
  /** Too heavy, or a photo of too many pixels. */
  too_large: number;
}

/** What the quiet lines are read from: a folder's counts. */
interface FootageAsideCounts {
  /** Videos Google Drive is still processing: they wait for their length. */
  processing: number;
  missed: FootageMissedDto;
}

/** One quiet line and its reasons: "7 couldn't be brought in", with why each one did not. */
interface FootageAside {
  key: "processing" | "missed";
  head: string;
  /** Each with its one reason, as AI says them and the folder's sheet lists them. */
  reasons: string[];
}

const LONGEST_MINUTES = FILE_VIDEO_SECONDS_MAX / 60;

/** "1 is", "6 are": a count with its verb. */
const countIs = (count: number): string => `${count.toLocaleString("en-US")} ${count === 1 ? "is" : "are"}`;

/** The reasons, in the order the folder's sheet keeps them; a reason of none is left out. */
function missedReasons(missed: FootageMissedDto): string[] {
  const { failed, too_long: tooLong, too_large: tooLarge } = missed;
  return [
    failed > 0
      ? `${failed.toLocaleString("en-US")} ${failed === 1 ? "was" : "were"} tried three times: check that ${failed === 1 ? "it plays" : "they play"} in Drive`
      : null,
    tooLong > 0
      ? `${countIs(tooLong)} longer than ${LONGEST_MINUTES} minutes, so AI can't watch ${tooLong === 1 ? "it" : "them"}`
      : null,
    tooLarge > 0 ? `${countIs(tooLarge)} too large to bring in` : null,
  ].filter((reason): reason is string => reason !== null);
}

/** What a folder says quietly, the one on its way first; none for a folder with nothing to say. */
export function footageAsidesOf(folder: { counts: FootageAsideCounts }): FootageAside[] {
  const { processing, missed } = folder.counts;
  const asides: FootageAside[] = [];
  if (processing > 0)
    asides.push({
      key: "processing",
      head: `Google Drive is still processing ${processing.toLocaleString("en-US")}`,
      reasons: [
        processing === 1
          ? "It comes in once Drive has finished with it"
          : "They come in once Drive has finished with them",
      ],
    });
  const notIn = missed.failed + missed.too_long + missed.too_large;
  if (notIn > 0)
    asides.push({
      key: "missed",
      head: `${notIn.toLocaleString("en-US")} couldn't be brought in`,
      reasons: missedReasons(missed),
    });
  return asides;
}
