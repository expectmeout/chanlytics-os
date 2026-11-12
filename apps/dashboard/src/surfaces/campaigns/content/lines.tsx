/**
 * A view of Made drawn as lines (the content canvas, "Made's five views"): what is about when, or about what to do, read in
 * one pass. Needs you says what stopped and why; Scheduled, by the business's day and hour; Posted, this week and earlier,
 * with a door to the post itself. A line opens its piece. Each picture is the piece's own, small and at its own shape. All,
 * on a phone that chose rows (its default, as its other pages are lists), is the same line for every piece (PieceLines).
 */
import type { ReactNode } from "react";
import {
  CONTENT_WORDS as W,
  contentMakingSaid,
  contentMarkSaid,
  contentMarkToneOf,
  contentPieceMarkOf,
  clockOf,
  fileSaidOf,
  fileViewOf,
  inLocalWeek,
  postStoppedWhyOf,
  type ContentLineDto,
  type ContentMadeDto,
  type ContentMakingDto,
  type ContentPageDto,
  type FileDto,
} from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import { askAbout } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Press } from "../../kit/press";
import { Picture } from "../../files/photo";
import { tileShapeOf } from "./model/tiles";
import { aheadDayOf, postedWhenOf, tileDayOf } from "./model/tile-day";

/** A piece's picture, small, at its own shape. */
function Thumb({
  file,
  dim = false,
}: {
  file: Pick<FileDto, "id" | "kind" | "width" | "height" | "name" | "line">;
  dim?: boolean;
}) {
  const name = fileSaidOf(file.name);
  return (
    <span className="cnv-thumb" data-shape={tileShapeOf(file)} data-dim={dim || undefined}>
      <Picture src={`${fileViewOf(file.id)}?w=160`} alt={file.line ?? name} name={name} />
    </span>
  );
}

/**
 * Where a post waits to go, in the owner's words (the content canvas, Scheduled): "Instagram story", "Instagram post",
 * "Google". Posted says the place alone ("Instagram · Monday"), as the canvas does.
 */
export const placeSaid = (line: ContentLineDto): string => {
  const where = W.piece.place[line.post.place];
  return line.post.place === "instagram" ? `${where} ${W.viewer.kinds[line.post.kind].toLowerCase()}` : where;
};

/**
 * One line: the piece's picture, its name and a line under it, and what stands at its end. A press opens the piece; the one
 * open beside the list on a desk is marked as the table marks its row.
 */
function Line({
  line,
  sub,
  subNeeds = false,
  end,
  door = null,
  open = false,
  onOpen,
}: {
  line: ContentLineDto;
  sub: string;
  subNeeds?: boolean;
  end: string | null;
  door?: ReactNode;
  open?: boolean;
  onOpen: (fileId: string) => void;
}) {
  return (
    <div className="cnv-line" data-open={open || undefined} data-testid="cnv-line">
      <Press className="cnv-line-open" onClick={() => onOpen(line.file.id)}>
        <Thumb file={line.file} />
        <span className="cnv-line-words">
          <b>{fileSaidOf(line.file.name)}</b>
          <span data-needs={subNeeds || undefined}>{sub}</span>
        </span>
        {end ? <span className="cnv-line-end">{end}</span> : null}
      </Press>
      {door}
    </div>
  );
}

/**
 * A video that could not be made: its first clip dim, and why. No piece to open: it goes back to Ask, the way it was made, in
 * a conversation of its own, asked again in its words with why it was not made (Ask's three at its end says so).
 */
function NotMade({ making }: { making: ContentMakingDto }) {
  const sentence = contentMakingSaid(making);
  const again = () =>
    askAbout({ prompts: W.views.makeAgainAsk(sentence.title, sentence.failed ?? sentence.state), fresh: true });
  return (
    <div className="cnv-line" data-testid="cnv-line-not-made">
      <Press className="cnv-line-open" onClick={again}>
        {making.first_picture ? (
          <Thumb
            file={{
              id: making.first_picture,
              kind: "video",
              width: null,
              height: null,
              name: sentence.title,
              line: null,
            }}
            dim
          />
        ) : (
          <span className="cnv-thumb" data-shape="tall" />
        )}
        <span className="cnv-line-words">
          <b>{sentence.title}</b>
          <span data-needs="true">{W.views.couldntMake(sentence.failed ?? sentence.state)}</span>
        </span>
        <span className="cnv-line-end" aria-hidden="true">
          <Icon name="three" size={14} />
        </span>
      </Press>
    </div>
  );
}

/**
 * All as rows, a phone's: what is being made first (a press opens Being made), then each piece made, newest first, its picture,
 * its name and where it stands in its tone, as Needs you's lines are; a press opens it.
 */
export function PieceLines({
  made,
  making,
  onOpen,
  onMaking,
}: {
  made: readonly ContentMadeDto[];
  making: readonly ContentMakingDto[];
  onOpen: (fileId: string) => void;
  onMaking: () => void;
}) {
  const clock = pageClock();
  const now = Date.now();
  return (
    <div className="cnv-lines" data-testid="cnv-piece-lines">
      {making.map((m) => {
        if (m.status === "failed") return <NotMade key={m.id} making={m} />;
        const said = contentMakingSaid(m);
        return (
          <div key={m.id} className="cnv-line" data-testid="cnv-line-making">
            <Press className="cnv-line-open" onClick={onMaking}>
              {m.first_picture ? (
                <Thumb
                  file={{ id: m.first_picture, kind: "video", width: null, height: null, name: said.title, line: null }}
                  dim
                />
              ) : (
                <span className="cnv-thumb" data-shape="tall" />
              )}
              <span className="cnv-line-words">
                <b>{said.title}</b>
                <span data-tone="going">{said.state}</span>
              </span>
            </Press>
          </div>
        );
      })}
      {made.map((piece) => {
        const mark = contentPieceMarkOf(piece);
        return (
          <div key={piece.file.id} className="cnv-line" data-testid="cnv-line">
            <Press className="cnv-line-open" onClick={() => onOpen(piece.file.id)}>
              <Thumb file={piece.file} />
              <span className="cnv-line-words">
                <b>{fileSaidOf(piece.file.name)}</b>
                <span data-tone={contentMarkToneOf(mark)}>
                  {contentMarkSaid(mark, (at) => tileDayOf(at, clock.zone(), now))}
                </span>
              </span>
            </Press>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The Library as rows, as Made's are (PieceLines): each file's picture, its name, and what it is, a clip with its length, and
 * what Ask's look saw in it where it said; a press opens it.
 */
export function FileLines({ files, onOpen }: { files: readonly FileDto[]; onOpen: (fileId: string) => void }) {
  return (
    <div className="cnv-lines" data-testid="cnv-file-lines">
      {files.map((file) => {
        const what =
          file.kind === "video" && file.seconds !== null ? W.piece.clip(clockOf(file.seconds)) : W.piece.photo;
        return (
          <div key={file.id} className="cnv-line" data-testid="cnv-file-line">
            <Press className="cnv-line-open" onClick={() => onOpen(file.id)}>
              <Thumb file={file} />
              <span className="cnv-line-words">
                <b>{fileSaidOf(file.name)}</b>
                <span>{file.line ? `${what} · ${file.line.replace(/\.$/, "")}` : what}</span>
              </span>
            </Press>
          </div>
        );
      })}
    </div>
  );
}

/** Lines in runs, each under its heading: a day, or This week and Earlier; and a line at the end where the view has one. */
function Runs({ runs, foot = null }: { runs: { head: string; lines: ReactNode[] }[]; foot?: string | null }) {
  return (
    <div className="cnv-lines" data-testid="cnv-lines">
      {runs.map((run) => (
        <section key={run.head} className="cnv-run" aria-label={run.head}>
          <h3 className="cnv-run-head">{run.head}</h3>
          {run.lines}
        </section>
      ))}
      {foot ? <p className="cnv-lines-foot">{foot}</p> : null}
    </div>
  );
}

/** Lines grouped by a heading each one names, in the order they come. */
function runsOf(
  lines: readonly ContentLineDto[],
  headOf: (l: ContentLineDto) => string,
  draw: (l: ContentLineDto) => ReactNode,
) {
  const runs: { head: string; lines: ReactNode[] }[] = [];
  for (const line of lines) {
    const head = headOf(line);
    const run = runs.at(-1);
    if (run && run.head === head) run.lines.push(draw(line));
    else runs.push({ head, lines: [draw(line)] });
  }
  return runs;
}

export function ContentLines({
  dto,
  openId = null,
  onOpen,
}: {
  dto: ContentPageDto;
  /** The piece open beside the list, on a desk. */
  openId?: string | null;
  onOpen: (fileId: string) => void;
}) {
  const clock = pageClock();
  const now = Date.now();
  const empty = dto.lines.length === 0 && (dto.view !== "needs" || dto.making.length === 0);
  if (empty)
    return (
      <p className="cnv-none" data-testid="cnv-lines-empty">
        {W.views.empty[dto.view]}
      </p>
    );
  if (dto.view === "needs")
    return (
      <div className="cnv-lines" data-testid="cnv-lines">
        {dto.lines.map((line) => (
          <Line
            key={line.post.id}
            line={line}
            sub={W.views.didntPost(postStoppedWhyOf(line.post) ?? W.piece.place[line.post.place])}
            subNeeds
            end={null}
            open={line.file.id === openId}
            onOpen={onOpen}
          />
        ))}
        {dto.making.map((m) => (
          <NotMade key={m.id} making={m} />
        ))}
        <p className="cnv-lines-foot">{W.views.nothingElse}</p>
      </div>
    );
  if (dto.view === "scheduled") {
    const at = (l: ContentLineDto) => Date.parse(l.post.scheduled_for);
    return (
      <Runs
        foot={W.views.onCalendar}
        runs={runsOf(
          dto.lines,
          (line) => aheadDayOf(at(line), clock.zone(), now),
          (line) => (
            <Line
              key={line.post.id}
              line={line}
              sub={W.views.byItself(placeSaid(line))}
              end={clock.time(at(line))}
              open={line.file.id === openId}
              onOpen={onOpen}
            />
          ),
        )}
      />
    );
  }
  // Posted: newest first, this week's apart from earlier ones.
  const up = (l: ContentLineDto) => Date.parse(l.post.published_at ?? l.post.created_at);
  return (
    <Runs
      runs={runsOf(
        dto.lines,
        (l) => (inLocalWeek(up(l), clock.zone(), now) ? W.views.thisWeek : W.views.earlier),
        (line) => (
          <Line
            key={line.post.id}
            line={line}
            sub={W.views.upAt(W.piece.place[line.post.place], postedWhenOf(up(line), clock.zone(), now))}
            end={null}
            door={
              line.post.permalink ? (
                <Button size="sm" variant="quiet" href={line.post.permalink} target="_blank" rel="noreferrer">
                  {W.views.open}
                  <Icon name="external" size={12} />
                </Button>
              ) : null
            }
            open={line.file.id === openId}
            onOpen={onOpen}
          />
        ),
      )}
    />
  );
}
