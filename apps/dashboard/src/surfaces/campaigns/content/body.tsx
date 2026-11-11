/**
 * Campaigns › Content's body: what is being made, then everything made, newest first, each a tile that says where it stands.
 * Pure: what it is handed is what it draws, and each press is its page's (page.tsx). A made piece is Files' own tile
 * (files/photo.tsx), so a post or a video looks the same wherever it is drawn, with one line under it that only this page
 * says. What is made is headed by its count ("8 pieces made · 3 posted"): the frame's head keeps a page's sentence for a
 * reader alone, on a desk and on a phone, so the page says it where it is seen, once.
 *
 * Three states apart, never one for another: not read yet (it says it is reading), a read that failed (the kit's failed read,
 * with its Retry), and nothing made (what Ask makes, and the two ways to start).
 */
import {
  CONTENT_WORDS as W,
  LIFECYCLE_WORDS,
  contentHeadOf,
  contentMakingSaid,
  contentMarkOf,
  contentMarkSaid,
  type ContentMadeDto,
  type ContentMakingDto,
  type ContentPageDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Photo } from "../../files/photo";

/** What a press on the body does. */
export interface ContentActs {
  /** Open a made piece where it opens: its file, in Files. */
  onOpen: (fileId: string) => void;
  /** Read the next page of what was made. */
  onMore: () => void;
  onAsk: () => void;
  onFiles: () => void;
}

/** A video that is no file yet: its ground says where it is at, its words under it, and why where it was not made. */
function MakingTile({ making }: { making: ContentMakingDto }) {
  const words = contentMakingSaid(making);
  return (
    <div className="cnv-piece" data-status={making.status} data-testid="cnv-making">
      <span className="files-frame">
        <span className="files-pic files-unseen" role="img" aria-label={`${words.title}: ${words.state}`}>
          {words.state}
        </span>
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

/** A made piece: Files' own tile, and where it stands in one line. */
function MadeTile({ made, onOpen }: { made: ContentMadeDto; onOpen: (fileId: string) => void }) {
  const mark = contentMarkOf(made.posts);
  return (
    <div className="cnv-piece" data-testid="cnv-tile">
      <Photo file={made.file} onOpen={() => onOpen(made.file.id)} />
      <span className="cnv-said" data-mark={mark.is} data-testid="cnv-said">
        {contentMarkSaid(mark, made.file.kind)}
      </span>
    </div>
  );
}

/** What the body is told beside what was read. */
interface ContentShows {
  /** True while the next page of what was made is being read. */
  gettingMore: boolean;
  /** Whether the workspace takes videos (features.video_preview): where it does not, Ask makes no video and none is offered. */
  videos: boolean;
}

/** The page, of what was read. */
function ContentRead({ dto, acts, shows }: { dto: ContentPageDto; acts: ContentActs; shows: ContentShows }) {
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
  return (
    <>
      {dto.making.length > 0 ? (
        <section className="cnv-part" aria-labelledby="cnv-making-title">
          <h2 className="cnv-part-name" id="cnv-making-title" data-testid="cnv-making-title">
            {W.makingTitle}
          </h2>
          <div className="cnv-grid">
            {dto.making.map((m) => (
              <MakingTile key={m.id} making={m} />
            ))}
          </div>
        </section>
      ) : null}
      {dto.made.length > 0 ? (
        <section className="cnv-part" aria-labelledby="cnv-made-title">
          <h2 className="cnv-part-name" id="cnv-made-title" data-testid="cnv-made-title">
            {contentHeadOf(dto.tally)}
          </h2>
          <div className="cnv-grid">
            {dto.made.map((m) => (
              <MadeTile key={m.file.id} made={m} onOpen={acts.onOpen} />
            ))}
          </div>
          {dto.next ? (
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
          ) : null}
        </section>
      ) : null}
    </>
  );
}

/** `held` is the surface's value: undefined until read, null where the read failed. */
export function ContentBody({
  held,
  acts,
  gettingMore = false,
  videos = false,
}: {
  held: ContentPageDto | null | undefined;
  acts: ContentActs;
  gettingMore?: boolean;
  videos?: boolean;
}) {
  if (held === undefined)
    return (
      <div className="route-reading" role="status" aria-busy="true">
        {LIFECYCLE_WORDS.reading}
      </div>
    );
  if (held === null) return <FailedRead kind="page" what={W.failedWhat} surface="content" testid="cnv-failed" />;
  return <ContentRead dto={held} acts={acts} shows={{ gettingMore, videos }} />;
}
