/**
 * A view of Made drawn as lines (the content canvas, "Made's five views"): what is about when, or about what to do, read in
 * one pass. Needs you says what stopped and why; Scheduled, by the business's day and hour; Posted, this week and earlier,
 * with a door to the post itself. A line opens its piece. Each picture is the piece's own, small and at its own shape.
 */
import type { ReactNode } from "react";
import {
  CONTENT_WORDS as W,
  ON_INSTAGRAM,
  contentMakingSaid,
  fileSaidOf,
  fileViewOf,
  inLocalWeek,
  type ContentLineDto,
  type ContentMakingDto,
  type ContentPageDto,
  type FileDto,
} from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Press } from "../../kit/press";
import { Picture } from "../../files/photo";
import { tileShapeOf } from "./model/tiles";

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

/** How a post goes there, in the owner's words: "Instagram, as a story". */
const placeSaid = (line: ContentLineDto): string => {
  const where = W.piece.place[line.post.place];
  return line.post.place === "instagram" ? `${where}, as ${ON_INSTAGRAM.kind[line.post.kind]}` : where;
};

/** One line: the piece's picture, its name and a line under it, and what stands at its end. A press opens the piece. */
function Line({
  line,
  sub,
  subNeeds = false,
  end,
  door = null,
  onOpen,
}: {
  line: ContentLineDto;
  sub: string;
  subNeeds?: boolean;
  end: string | null;
  door?: ReactNode;
  onOpen: (fileId: string) => void;
}) {
  return (
    <div className="cnv-line" data-testid="cnv-line">
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

/** A video that could not be made: no piece to open, its first clip dim, and why. */
function NotMade({ making }: { making: ContentMakingDto }) {
  const sentence = contentMakingSaid(making);
  return (
    <div className="cnv-line" data-testid="cnv-line-not-made">
      <span className="cnv-line-open">
        {making.first_clip ? (
          <Thumb
            file={{ id: making.first_clip, kind: "video", width: null, height: null, name: sentence.title, line: null }}
            dim
          />
        ) : (
          <span className="cnv-thumb" data-shape="tall" />
        )}
        <span className="cnv-line-words">
          <b>{sentence.title}</b>
          <span data-needs="true">{sentence.failed ?? sentence.state}</span>
        </span>
      </span>
    </div>
  );
}

/** Lines in runs, each under its heading: a day, or This week and Earlier. */
function Runs({ runs }: { runs: { head: string; lines: ReactNode[] }[] }) {
  return (
    <div className="cnv-lines" data-testid="cnv-lines">
      {runs.map((run) => (
        <section key={run.head} className="cnv-run" aria-label={run.head}>
          <h3 className="cnv-run-head">{run.head}</h3>
          {run.lines}
        </section>
      ))}
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

export function ContentLines({ dto, onOpen }: { dto: ContentPageDto; onOpen: (fileId: string) => void }) {
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
            sub={`${W.piece.stands.stuck}: ${line.post.error ?? line.post.held_reason ?? W.piece.place[line.post.place]}`}
            subNeeds
            end={W.piece.step.again}
            onOpen={onOpen}
          />
        ))}
        {dto.making.map((m) => (
          <NotMade key={m.id} making={m} />
        ))}
      </div>
    );
  if (dto.view === "scheduled") {
    const at = (l: ContentLineDto) => Date.parse(l.post.scheduled_for);
    return (
      <Runs
        runs={runsOf(
          dto.lines,
          (line) => clock.dayLabel(at(line)),
          (line) => (
            <Line key={line.post.id} line={line} sub={placeSaid(line)} end={clock.time(at(line))} onOpen={onOpen} />
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
            sub={`${placeSaid(line)} · ${clock.stamp(up(line))}`}
            end={null}
            door={
              line.post.permalink ? (
                <Button size="sm" variant="quiet" href={line.post.permalink} target="_blank" rel="noreferrer">
                  {W.views.open}
                  <Icon name="external" size={12} />
                </Button>
              ) : null
            }
            onOpen={onOpen}
          />
        ),
      )}
    />
  );
}
