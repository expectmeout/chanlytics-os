/**
 * The post New ad's picture went up as, under the head and before the sentence (the content loop's pass 6; the content
 * canvas's Loop1, approved by Ruben on 24 Nov 2026): its still, where and since when, and what it already did in the
 * piece's own one line (contracts pieceResultLineOf), so the owner pays to show it knowing that. Read from the piece's
 * own results (GET files/[id]/results); nothing where the picture never went up, in the page's example, or where the read
 * did not answer. Taken down, it says the ad uses the file and nothing goes back up.
 */
import { Fragment, useEffect, useState } from "react";
import { DAY_MS, MIN_MS, fileSaidOf, pieceResultLineOf, type PieceResultsDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { Icon } from "../../../kit/icon/icon";
import { NEW } from "./words";

const POSTED_ON = { instagram: "Instagram", google: "Google" } as const;

/** When it went up, as the band says it: minutes for the first hour, a weekday for the week, a date after. */
export function sinceSaid(atIso: string, nowMs: number): string {
  const at = Date.parse(atIso);
  const gone = Math.max(0, nowMs - at);
  if (gone < 60 * MIN_MS) return NEW.from.minutes(Math.max(1, Math.round(gone / MIN_MS)));
  const options: Intl.DateTimeFormatOptions =
    gone < 6 * DAY_MS ? { weekday: "short" } : { day: "numeric", month: "short" };
  return new Intl.DateTimeFormat("en-US", options).format(new Date(at));
}

/** The picture's own results, read once for its file; null before the read answers, or where it did not. */
function usePictureResults(fileId: string, on: boolean): PieceResultsDto | null {
  const [data, setData] = useState<PieceResultsDto | null>(null);
  useEffect(() => {
    setData(null);
    if (!on) return undefined;
    let live = true;
    read("GET files/[id]/results", { params: { id: fileId } }).then(
      (answer) => {
        if (live) setData(answer);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [fileId, on]);
  return data;
}

export function FromPost({
  picture,
  example,
}: {
  picture: { id: string; name: string; made: boolean; src: string | null };
  /** The page's example: no piece of the workspace's is read for it. */
  example: boolean;
}) {
  // Only a piece AI made can have gone up from here: a photo of the Library is never read for one.
  const results = usePictureResults(picture.id, picture.made && !example);
  const post = results?.posts.find((one) => one.published_at) ?? null;
  if (!results || !post?.published_at) return null;
  const down = post.down === true;
  const since = sinceSaid(post.published_at, Date.now());
  const where = down
    ? NEW.from.down
    : post.kind === "story"
      ? NEW.from.story(since)
      : NEW.from.up(POSTED_ON[post.place], since);
  const line = pieceResultLineOf(results, { down });
  return (
    <div className="ads-new-from" data-testid="ads-new-from">
      {picture.src ? (
        <img className="ads-new-from-still" src={picture.src} alt="" />
      ) : (
        <span className="ads-new-from-still" />
      )}
      <div>
        <b>{NEW.from.top(fileSaidOf(picture.name), where)}</b>
        {line ? (
          <span className="ads-new-from-line">
            <Icon name="chart" size={13} />
            <span>
              {line.map((part, nth) =>
                typeof part === "string" ? <Fragment key={nth}>{part}</Fragment> : <b key={nth}>{part.number}</b>,
              )}
            </span>
          </span>
        ) : null}
        {down ? <em>{NEW.from.downNote(POSTED_ON[post.place])}</em> : null}
      </div>
    </div>
  );
}
