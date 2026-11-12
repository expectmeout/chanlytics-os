/**
 * Campaigns › Content's body: what is being made, then everything made, newest first, each a tile that says where it stands.
 * Pure: what it is handed is what it draws, and each press is its page's (page.tsx). A made piece is Files' own tile
 * (files/photo.tsx), so a post or a video looks the same wherever it is drawn, with one line under it that only this page
 * says. What is made is headed by its count ("8 pieces made · 3 posted"): the frame's head keeps a page's sentence for a
 * reader alone, on a desk and on a phone, so the page says it where it is seen, once.
 *
 * Three states apart, never one for another: not read yet (it says it is reading), a read that failed (the kit's failed read,
 * with its Retry), and nothing made (what Ask makes, and the two ways to start).
 *
 * A view of Made is tiles where it is there to be looked at (All, Being made) and lines where it is about when or what to do
 * (Needs you, Scheduled, Posted: lines.tsx). On a desk All may be a list instead (list.tsx), the person's choice.
 */
import {
  CONTENT_WORDS as W,
  LIFECYCLE_WORDS,
  contentHeadOf,
  contentMakingSaid,
  contentMarkOf,
  contentMarkSaid,
  contentViewDrawsLines,
  fileViewOf,
  type ContentMadeDto,
  type ContentMakingDto,
  type ContentPageDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { AskLooking, Photo, Picture } from "../../files/photo";
import { ContentColumns } from "./columns";
import { ContentLines } from "./lines";
import { ContentList } from "./list";
import type { ContentLayout } from "./views";
import { tileShapeOf } from "./model/tiles";

/** What a press on the body does. */
export interface ContentActs {
  /** Open a made piece, by its file: beside the list on a desk, over it on a phone. */
  onOpen: (fileId: string) => void;
  /** Read the next page of what was made. */
  onMore: () => void;
  onAsk: () => void;
  onFiles: () => void;
}

/**
 * A video that is no file yet: the clip it starts from, dim, with Ask's three at work in its corner while it is made, and where
 * it is at in words over it; its words under it, and why where it was not made. With no clip named, its ground and the words.
 */
function MakingTile({ making }: { making: ContentMakingDto }) {
  const words = contentMakingSaid(making);
  const label = `${words.title}: ${words.state}`;
  return (
    <div className="cnv-piece" data-status={making.status} data-testid="cnv-making">
      <span className="files-frame cnv-making" data-shape="tall">
        {making.first_picture ? (
          <>
            <Picture src={`${fileViewOf(making.first_picture)}?w=480`} alt={label} name={words.title} />
            <span className="cnv-making-says">{words.state}</span>
          </>
        ) : (
          <span className="files-pic files-unseen" role="img" aria-label={label}>
            {words.state}
          </span>
        )}
        <AskLooking looking={making.status === "making"} />
      </span>
      <span className="cnv-name">{words.title}</span>
      {words.failed ? (
        <span className="cnv-said" data-mark="stuck" data-testid="cnv-said">
          {words.failed}
        </span>
      ) : null}
    </div>
  );
}

/** A made piece: Files' own tile at its own shape, and where it stands in one line. The open one is marked. */
function MadeTile({ made, open, onOpen }: { made: ContentMadeDto; open: boolean; onOpen: (fileId: string) => void }) {
  const mark = contentMarkOf(made.posts);
  return (
    <div className="cnv-piece" data-open={open || undefined} data-testid="cnv-tile">
      <Photo file={made.file} onOpen={() => onOpen(made.file.id)} shape={tileShapeOf(made.file)} />
      <span className="cnv-said" data-mark={mark.is} data-testid="cnv-said">
        {contentMarkSaid(mark, made.file.kind)}
      </span>
    </div>
  );
}

/** Show more: the next page of what is shown, read after what is there. */
function ShowMore({ acts, shows }: { acts: ContentActs; shows: ContentShows }) {
  return (
    <div className="files-more">
      <Button
        variant="quiet"
        size="sm"
        onClick={acts.onMore}
        disabled={shows.gettingMore}
        aria-busy={shows.gettingMore}
        data-testid="cnv-more"
      >
        {W.more}
      </Button>
    </div>
  );
}

/** What the body is told beside what was read. */
interface ContentShows {
  /** True while the next page of what was made is being read. */
  gettingMore: boolean;
  /** Whether the workspace takes videos (features.video_preview): where it does not, Ask makes no video and none is offered. */
  videos: boolean;
  /** The made piece that is open, by its file, marked on its tile. */
  openId: string | null;
  /** All, as tiles or (a desk's choice) a list. */
  layout: ContentLayout;
}

type ContentReadProps = { dto: ContentPageDto; acts: ContentActs; shows: ContentShows };

/** What is being made, under its heading: where nothing is made yet, or over a list, which draws no tiles. */
function MakingPart({ making }: { making: ContentPageDto["making"] }) {
  return (
    <section className="cnv-part" aria-labelledby="cnv-making-title">
      <h2 className="cnv-part-name" id="cnv-making-title" data-testid="cnv-making-title">
        {W.makingTitle}
      </h2>
      <ContentColumns
        pieces={making}
        shapeOf={() => "tall"}
        keyOf={(m) => m.id}
        draw={(m) => <MakingTile making={m} />}
      />
    </section>
  );
}

/** All as tiles: what is being made leads the grid, as the first tiles of it, so the first screen holds made pieces too. */
function MadeGrid({ dto, acts, shows }: ContentReadProps) {
  return (
    <ContentColumns
      pieces={[
        ...dto.making.map((m) => ({ making: m, made: null })),
        ...dto.made.map((m) => ({ making: null, made: m })),
      ]}
      shapeOf={(t) => (t.made ? tileShapeOf(t.made.file) : "tall")}
      keyOf={(t) => (t.made ? t.made.file.id : (t.making?.id ?? ""))}
      draw={(t) =>
        t.made ? (
          <MadeTile made={t.made} open={t.made.file.id === shows.openId} onOpen={acts.onOpen} />
        ) : t.making ? (
          <MakingTile making={t.making} />
        ) : null
      }
      testid="cnv-made"
    />
  );
}

/** What was made, under its count: a list, or tiles. */
function MadePart(props: ContentReadProps) {
  const { dto, acts, shows } = props;
  return (
    <section className="cnv-part" aria-labelledby="cnv-made-title">
      <h2 className="cnv-part-name" id="cnv-made-title" data-testid="cnv-made-title">
        {contentHeadOf(dto.tally)}
      </h2>
      {shows.layout === "list" ? (
        <ContentList made={dto.made} openId={shows.openId} onOpen={acts.onOpen} />
      ) : (
        <MadeGrid {...props} />
      )}
      {dto.next ? <ShowMore acts={acts} shows={shows} /> : null}
    </section>
  );
}

/** The page, of what was read. */
function ContentRead(props: ContentReadProps) {
  const { dto, acts, shows } = props;
  if (contentViewDrawsLines(dto.view))
    return (
      <>
        <ContentLines dto={dto} onOpen={acts.onOpen} />
        {dto.next ? <ShowMore acts={acts} shows={shows} /> : null}
      </>
    );
  if (dto.view === "making" && dto.making.length === 0)
    return (
      <p className="cnv-none" data-testid="cnv-lines-empty">
        {W.views.empty.making}
      </p>
    );
  if (dto.making.length === 0 && dto.made.length === 0)
    return (
      <EmptyState
        kind="page"
        glyph="content"
        title={W.empty.title}
        body={shows.videos ? W.empty.body : W.empty.bodyPhotos}
        action={{ label: W.empty.ask, onClick: acts.onAsk, testid: "cnv-empty-ask" }}
        also={{ label: W.empty.files, onClick: acts.onFiles, testid: "cnv-empty-files" }}
        testid="cnv-empty"
      />
    );
  const makingAbove = dto.making.length > 0 && (dto.made.length === 0 || shows.layout === "list");
  return (
    <>
      {makingAbove ? <MakingPart making={dto.making} /> : null}
      {dto.made.length > 0 ? <MadePart {...props} /> : null}
    </>
  );
}

/** `held` is the surface's value: undefined until read, null where the read failed. */
export function ContentBody({
  held,
  acts,
  gettingMore = false,
  videos = false,
  openId = null,
  layout = "grid",
}: {
  held: ContentPageDto | null | undefined;
  acts: ContentActs;
  gettingMore?: boolean;
  videos?: boolean;
  openId?: string | null;
  layout?: ContentLayout;
}) {
  if (held === undefined)
    return (
      <div className="route-reading" role="status" aria-busy="true">
        {LIFECYCLE_WORDS.reading}
      </div>
    );
  if (held === null) return <FailedRead kind="page" what={W.failedWhat} surface="content" testid="cnv-failed" />;
  return <ContentRead dto={held} acts={acts} shows={{ gettingMore, videos, openId, layout }} />;
}
