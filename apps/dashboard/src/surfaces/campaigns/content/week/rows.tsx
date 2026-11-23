/**
 * A row of the Week (the approved boards, Week 11): one creative once, its still, its name and one line, then its places as
 * small glyphs in the order they go, a dot only where a place is not plain (amber needs you, green up); a row that needs the
 * owner shows its one fix where the glyphs would be. And a row of what to film, AI's ask in a sentence and why: no tick.
 */
import type { WeekMark, WeekRow } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { Picture, rowPictureOf } from "../../../files/photo";

/** A place's glyph: Instagram's reel, story or post, Google's place. */
const GLYPH: Record<WeekMark["glyph"], string> = { reel: "video", story: "clock", post: "image", pin: "pin" };

/** Where a creative goes, as glyphs, each with its dot where it is not plain. */
function Places({ marks }: { marks: readonly WeekMark[] }) {
  return (
    <span className="cwk-places" aria-hidden="true">
      {marks.map((mark, at) => (
        <span key={at} className="cwk-place">
          <Icon name={GLYPH[mark.glyph]} size={14} />
          {mark.dot ? <i className="cwk-dot" data-tone={mark.dot} /> : null}
        </span>
      ))}
    </span>
  );
}

export function WeekRowView({
  row,
  open,
  onOpen,
  onFix,
  busy,
}: {
  row: WeekRow;
  open: boolean;
  onOpen: (row: WeekRow) => void;
  onFix: (row: WeekRow) => void;
  busy: boolean;
}) {
  return (
    <div className="cwk-row" data-open={open || undefined} data-testid="cwk-row">
      <Button variant="quiet" className="cwk-row-open" onClick={() => onOpen(row)} aria-label={row.title}>
        <span className="cwk-still">
          {row.still ? <Picture src={rowPictureOf(row.still)} alt="" name={row.title} /> : null}
        </span>
        <span className="cwk-words">
          <b>{row.title}</b>
          <span data-tone={row.tone || undefined}>{row.line}</span>
        </span>
      </Button>
      {row.fix ? (
        <Button size="sm" variant="glass" onClick={() => onFix(row)} disabled={busy} data-testid="cwk-fix">
          {row.fix.label}
        </Button>
      ) : (
        <Places marks={row.marks} />
      )}
    </div>
  );
}

/** What AI asks to be filmed, a sentence, and why: a row to read, with nothing to tick. */
export function FilmRow({ what, why }: { what: string; why: string }) {
  return (
    <div className="cwk-film" data-testid="cwk-film">
      <span className="cwk-film-glyph" aria-hidden="true">
        <Icon name="video" size={14} />
      </span>
      <span className="cwk-words">
        <b>{what}</b>
        {why ? <span>{why}</span> : null}
      </span>
    </div>
  );
}
