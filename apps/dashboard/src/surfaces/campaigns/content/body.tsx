/**
 * Campaigns › Content's body: what is being made, then everything made, newest first, each a tile that says where it stands.
 * Pure: what it is handed is what it draws, and each press is its page's (page.tsx). A made piece is Files' own tile
 * (files/photo.tsx), so a post or a video looks the same wherever it is drawn, with one line under it that only this page
 * says. What is made is headed by its count ("8 pieces made · 3 posted"): the frame's head keeps a page's sentence for a
 * reader alone, on a desk and on a phone, so the page says it where it is seen, once.
 *
 * Three states apart, never one for another: not read yet (it says it is reading), a read that failed (the kit's failed read,
 * with its Retry), and nothing made (the content canvas's first day: what Ask makes, and the ideas it can make now).
 *
 * The tiles are the Library's own grid (files.css .files-grid): squares, three across a phone, so Made and the Library read as
 * one page (Ruben, 12 Nov 2026). Where a piece stands is one mark on its square: a turning ring while it goes up, amber where
 * it needs the owner, green once it is up, nothing while it waits; its words are a screen reader's, and the open piece says
 * them whole. One line over the pieces says what needs them, with Try again. A phone may show All as rows (lines.tsx
 * PieceLines), as its other pages are lists; a desk as the table (list.tsx).
 *
 * A view of Made is tiles where it is there to be looked at (All, Being made) and lines where it is about when or what to do
 * (Needs you, Scheduled, Posted: lines.tsx). On a desk All may be a list instead (list.tsx), the person's choice.
 */
import { useMemo, type ReactNode } from "react";
import {
  CONTENT_WORDS as W,
  FILE_WORDS,
  LIFECYCLE_WORDS,
  PIECE_STAGES,
  contentHeadOf,
  contentIdeasFor,
  contentMakingSaid,
  contentPieceMarkOf,
  contentMarkSaid,
  contentMarkToneOf,
  contentViewDrawsLines,
  fileViewOf,
  type ContentMadeDto,
  type ContentMakingDto,
  type ContentPageDto,
} from "@chanlytics/contracts";
import { ContentLinesTable } from "./lines-table";
import { IdeaRows, type OnIdea } from "./sheets/make";
import { pageClock } from "@/bridge/zone";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { Meter } from "../../kit/meter/meter";
import { Panel } from "../../kit/panel/panel";
import { AskLooking, Photo, Picture } from "../../files/photo";
import { GroupHead } from "../../kit/head/group-head";
import { ContentLines, NeedsRows, PieceLines } from "./lines";
import { QuietMore } from "./heads";
import { ContentList } from "./list";
import { madeFlatOf, madeGroupsOf, piecesUnder, type MadeGroup } from "./model/groups";
import type { ContentLayout } from "./views";
import { tileDayOf } from "./model/tile-day";

/** The day a piece went up, by the business's clock. */
const dayOfTile = (at: string) => tileDayOf(at, pageClock().zone(), Date.now());

/** What a press on the body does. */
export interface ContentActs {
  /** Open a made piece, by its file: beside the list on a desk, over it on a phone. */
  onOpen: (fileId: string) => void;
  /** Read the next page of what was made. */
  onMore: () => void;
  /** Ask for one of the first day's ideas (content/ideas.ts), naming the files its row showed. */
  onIdea: OnIdea;
  /** A stopped or waiting post: its piece, opened straight to its sheet (Post it), the one place a post is acted on. */
  onFix: (fileId: string) => void;
  /** Show what was set aside (Made's Set aside), from the foot of All, as the Library's is. */
  onAside: () => void;
}

/** Where a piece stands, as one mark on its square, in its tone; its words for a screen reader. */
function TileStands({ tone, words }: { tone: string; words: string }) {
  return (
    <span className="cnv-stands" data-tone={tone} data-testid="cnv-said">
      <span className="cnv-stands-dot" aria-hidden="true" />
      <span className="cnv-stands-words">{words}</span>
    </span>
  );
}

/** The tiles, in the Library's grid. */
function TileGrid({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div className="files-grid cnv-grid" data-testid={testid}>
      {children}
    </div>
  );
}

/** How far a video being made has come, by its stage: a share of the way, never a time it cannot know. */
const stageShareOf = (making: ContentMakingDto): number =>
  (PIECE_STAGES.indexOf(making.stage) + 1) / (PIECE_STAGES.length + 1);

/**
 * A video that is no file yet: the clip it starts from, dim, with Ask's three at work in the middle while it is made, where it
 * is at in words under them, and a light meter along its foot (the canvas draws it white, over any picture); its words under
 * it, and why where it was not made. With no clip named, its ground and the words.
 */
function MakingTile({ making }: { making: ContentMakingDto }) {
  const words = contentMakingSaid(making);
  const label = `${words.title}: ${words.state}`;
  const working = making.status === "making";
  return (
    <div className="cnv-piece" data-status={making.status} data-testid="cnv-making">
      <span className="files-frame cnv-making">
        {making.first_picture ? (
          <Picture src={`${fileViewOf(making.first_picture)}?w=480`} alt={label} name={words.title} />
        ) : (
          <span className="files-pic files-unseen" role="img" aria-label={label} />
        )}
        {/* Ask's three at work over its first frame, and where it is at: the canvas's "Cutting your clips". */}
        <span className="cnv-making-work">
          <AskLooking looking={working} />
          <span className="cnv-making-says">{words.state}</span>
        </span>
        {working ? (
          <Meter
            className="cnv-making-run"
            size="sm"
            parts={[
              { share: stageShareOf(making), color: "var(--media-ink)" },
              { share: 1 - stageShareOf(making), tone: "ground" },
            ]}
            aria-label={words.state}
          />
        ) : null}
      </span>
      <span className="files-name">{words.title}</span>
      {/* Being made says itself over the picture; one that was not made is marked as needing the owner. */}
      {words.failed ? <TileStands tone="need" words={words.failed} /> : null}
    </div>
  );
}

/** A made piece: Files' own tile, square as the Library's are, and where it stands as one mark on it. The open one is outlined. */
function MadeTile({ made, open, onOpen }: { made: ContentMadeDto; open: boolean; onOpen: (fileId: string) => void }) {
  const mark = contentPieceMarkOf(made);
  return (
    <div className="cnv-piece" data-open={open || undefined} data-tile={made.file.id} data-testid="cnv-tile">
      <Photo file={made.file} onOpen={() => onOpen(made.file.id)} />
      <TileStands tone={contentMarkToneOf(mark)} words={contentMarkSaid(mark, dayOfTile)} />
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
  /** On a desk: Scheduled and Posted are tables there (lines-table.tsx), lines on a phone. */
  desk: boolean;
}

type ContentReadProps = { dto: ContentPageDto; acts: ContentActs; shows: ContentShows };

/** What is being made, under its heading: where nothing is made yet, or over a list, which draws no tiles. */
function MakingPart({ making }: { making: ContentPageDto["making"] }) {
  return (
    <section className="cnv-part" aria-labelledby="cnv-making-title">
      <h2 className="cnv-part-name" id="cnv-making-title" data-testid="cnv-making-title">
        {W.makingTitle}
      </h2>
      <TileGrid>
        {making.map((m) => (
          <MakingTile key={m.id} making={m} />
        ))}
      </TileGrid>
    </section>
  );
}

/** All as tiles: what is being made leads the grid, as the first tiles of it, so the first screen holds made pieces too. */
function MadeGrid({ dto, acts, shows }: ContentReadProps) {
  return (
    <TileGrid testid="cnv-made">
      {dto.making.map((m) => (
        <MakingTile key={m.id} making={m} />
      ))}
      {dto.made.map((m) => (
        <MadeTile key={m.file.id} made={m} open={m.file.id === shows.openId} onOpen={acts.onOpen} />
      ))}
    </TileGrid>
  );
}

/** A group's pieces as squares: its videos being made or not made, then its pieces; one that needs the owner opens to its sheet. */
function GroupTiles({ group, acts, shows }: { group: MadeGroup; acts: ContentActs; shows: ContentShows }) {
  const open = group.key === "needs" ? acts.onFix : acts.onOpen;
  return (
    <TileGrid>
      {group.making.map((m) => (
        <MakingTile key={m.id} making={m} />
      ))}
      {group.made.map((m) => (
        <MadeTile key={m.file.id} made={m} open={m.file.id === shows.openId} onOpen={open} />
      ))}
    </TileGrid>
  );
}

/** A group's pieces as rows, a phone's: what needs the owner as Needs you's own lines, the rest as All's (lines.tsx). */
function GroupRows({ group, acts, shows }: { group: MadeGroup; acts: ContentActs; shows: ContentShows }) {
  if (group.key === "needs")
    return (
      <div className="cnv-lines">
        <NeedsRows lines={group.lines} notMade={group.making} openId={shows.openId} onOpen={acts.onFix} />
      </div>
    );
  return <PieceLines made={group.made} making={group.making} onOpen={acts.onOpen} />;
}

/**
 * All of Made under its headings (model/groups.ts; Ruben, 12 Nov 2026: Content's list stands under headings, as Sequences',
 * Messages' and the Pipeline's do): Needs you, Being made, This week, Earlier, each that holds anything. Needs you is the
 * amber line that stood over the pieces, opened: each post that stopped is one press from its sheet, where the line took two.
 * Squares or rows under each heading, as chosen; a desk's list is the one table, its groups the table's own (list.tsx).
 */
function MadeGroups({ dto, acts, shows }: ContentReadProps) {
  const zone = pageClock().zone();
  // Held while the read is the same read: the desk's table is made over these rows, and keeps them by reference.
  const groups = useMemo(() => madeGroupsOf(dto, { zone, nowMs: Date.now() }), [dto, zone]);
  return (
    <div className="cnv-groups" data-testid="cnv-made-part">
      {shows.layout === "list" && shows.desk ? (
        <ContentList groups={groups} openId={shows.openId} onOpen={acts.onOpen} onFix={acts.onFix} />
      ) : (
        groups.map((group) => (
          <section key={group.key} className="cnv-group" aria-label={group.label} data-testid={`cnv-group-${group.key}`}>
            <GroupHead
              label={group.label}
              count={shows.layout === "list" ? group.count : piecesUnder(group)}
              needs={group.key === "needs"}
            />
            {shows.layout === "list" ? (
              <GroupRows group={group} acts={acts} shows={shows} />
            ) : (
              <GroupTiles group={group} acts={acts} shows={shows} />
            )}
          </section>
        ))
      )}
      {dto.next ? <ShowMore acts={acts} shows={shows} /> : null}
    </div>
  );
}

/**
 * What was made: squares, or rows (a desk's table, a phone's lines), with no heading of their own: how many there are is the
 * bar's to say, beside Made, as the Library's is beside it.
 */
function MadePart(props: ContentReadProps) {
  const { dto, acts, shows } = props;
  // One group with no heading, for the desk's table (list.tsx): held while the read is the same read.
  const flat = useMemo(() => madeFlatOf(dto), [dto]);
  return (
    <section className="cnv-part" aria-label={contentHeadOf(dto.tally)} data-testid="cnv-made-part">
      {shows.layout === "list" && shows.desk ? (
        <ContentList
          groups={flat}
          flat
          openId={shows.openId}
          onOpen={acts.onOpen}
          onFix={acts.onFix}
        />
      ) : shows.layout === "list" ? (
        <PieceLines made={dto.made} making={dto.making} onOpen={acts.onOpen} />
      ) : (
        <MadeGrid {...props} />
      )}
      {dto.next ? <ShowMore acts={acts} shows={shows} /> : null}
    </section>
  );
}

/**
 * Nothing made yet (the content canvas's first day): a raised card with Ask's three, the words, and what Ask makes; then the
 * ideas it can make now, each a row with the files it would be made from (sheets/make.tsx IdeaRows, Make's own rows), that
 * asks Ask for it on this page.
 */
function FirstDay({ acts, videos, picks }: { acts: ContentActs; videos: boolean; picks: ContentPageDto["ideas"] }) {
  const ideas = contentIdeasFor(videos);
  return (
    <section className="cnv-first" aria-labelledby="cnv-first-title" data-testid="cnv-empty">
      <Panel className="cnv-first-head">
        <span className="cnv-first-three" aria-hidden="true">
          <Icon name="three" size={40} />
        </span>
        <h2 className="cnv-first-title" id="cnv-first-title">
          {W.empty.title}
        </h2>
        <p className="cnv-first-says">{(videos ? W.empty.body : W.empty.bodyPhotos)(ideas.length)}</p>
      </Panel>
      <IdeaRows ideas={ideas} picks={picks} onIdea={acts.onIdea} />
    </section>
  );
}

/** The page, of what was read. */
function ContentRead(props: ContentReadProps) {
  const { dto, acts, shows } = props;
  if (contentViewDrawsLines(dto.view))
    return (
      <>
        {shows.desk && dto.view !== "needs" ? (
          <ContentLinesTable
            dto={dto}
            openId={shows.openId}
            onOpen={dto.view === "scheduled" ? acts.onFix : acts.onOpen}
          />
        ) : (
          <ContentLines dto={dto} openId={shows.openId} onOpen={dto.view === "posted" ? acts.onOpen : acts.onFix} />
        )}
        {dto.next ? <ShowMore acts={acts} shows={shows} /> : null}
      </>
    );
  const none = (said: string) => (
    <p className="cnv-none" data-testid="cnv-lines-empty">
      {said}
    </p>
  );
  if (dto.view === "making" && dto.making.length === 0) return none(W.views.empty.making);
  if (dto.view === "aside" && dto.made.length === 0) return none(W.views.empty.aside);
  // Found by words and nothing there: said, as the Library says it, never the first day's ideas.
  if (dto.about && dto.made.length === 0) return none(FILE_WORDS.foundNone(dto.about));
  if (dto.making.length === 0 && dto.made.length === 0)
    return <FirstDay acts={acts} videos={shows.videos} picks={dto.ideas} />;
  // All of it, where nothing is searched for: under its headings, what needs the owner first.
  if (dto.view === "all" && !dto.about) {
    const aside = dto.next ? 0 : dto.tally.aside;
    return (
      <>
        <MadeGroups {...props} />
        {aside > 0 ? (
          <QuietMore said={FILE_WORDS.setAsideLine(aside)} onPress={acts.onAside} testid="cnv-set-aside" />
        ) : null}
      </>
    );
  }
  // What is found by words, being made or set aside: one flat list. What is being made alone is a part of its own among
  // squares; rows, where rows were chosen, as All's are.
  const makingAlone = dto.making.length > 0 && dto.made.length === 0;
  return (
    <>
      {makingAlone && shows.layout === "grid" ? <MakingPart making={dto.making} /> : null}
      {dto.made.length > 0 || (makingAlone && shows.layout === "list") ? <MadePart {...props} /> : null}
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
  desk = false,
}: {
  held: ContentPageDto | null | undefined;
  acts: ContentActs;
  gettingMore?: boolean;
  videos?: boolean;
  openId?: string | null;
  layout?: ContentLayout;
  desk?: boolean;
}) {
  if (held === undefined)
    return (
      <div className="route-reading" role="status" aria-busy="true">
        {LIFECYCLE_WORDS.reading}
      </div>
    );
  if (held === null) return <FailedRead kind="page" what={W.failedWhat} surface="content" testid="cnv-failed" />;
  return <ContentRead dto={held} acts={acts} shows={{ gettingMore, videos, openId, layout, desk }} />;
}
