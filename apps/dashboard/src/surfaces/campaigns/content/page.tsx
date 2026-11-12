/**
 * Campaigns › Content: everything Ask made for the business and where each piece stands, in every workspace
 * (campaigns/home/route.tsx). Real data or nothing: what is being made (00613 `pieces`), what was made (`files` made here)
 * and where each was posted (00611 `posts`), read by one read (surface.ts, GET content).
 *
 * It is Campaigns' own split (parts/split.tsx), as Sequences is: the pieces in the list's pane, each at its own shape, and the
 * piece that is open in a pane beside them on a desk, which takes the screen on a phone. The address names the open piece
 * (`campaigns/content:<file id>`), so Back closes it, a link opens it, and the page keeps it while another view is shown.
 * The grid keeps the room and the piece stands narrow beside it, a piece being taller than it is wide.
 *
 * Two lists (stage 2): Made, and the Library it is made from, which was Settings › Files and is now here, its own chunk
 * (library.tsx) read the first time it is shown. A file of the library opens in the same pane as a made piece, and one the
 * address names that was not made here (a bell's row, an old Files link) shows the Library it belongs to.
 *
 * The head holds two doors: Ask, opened on this page, and the Library's, where clips are added. A video being made and a post
 * on its way are told to no page, so while one moves the page asks again, a few seconds apart, and stops when none does.
 */
// The page's own rules, and Files' tile's, loaded with it: the page is loaded on demand (campaigns/home/route.tsx).
import "../../files/files.css";
import "../../files/post.css";
import "./content.css";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  CONTENT_LIBRARY_ROUTE,
  CONTENT_ROUTE,
  CONTENT_WORDS as W,
  SECOND_MS,
  contentMoving,
  contentPlaceOf,
  contentRouteOf,
  contentViewDrawsLines,
  videoPreviewOf,
  type ContentList,
  type ContentMadeDto,
  type ContentPageDto,
  type ContentPlace,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { ActWords } from "../../kit/head/act-words";
import { Icon } from "../../kit/icon/icon";
import { useHeldList, type Arrival } from "../../kit/motion/held-list";
import { askAbout, navigate, refreshSurface, replaceRoute, type FrameFlash } from "../../frame-verbs";
import { fileVerbs } from "../../files/verbs";
import { useSurface } from "../../use-surface";
import { CmHead } from "../parts/head";
import { CmSplit, cmGoing, useCmPhone, type CmView } from "../parts/split";
import { useCampaignsToast } from "../home/route-toast";
import { ContentBody, type ContentActs } from "./body";
import { ContentPiece } from "./piece";
import { askContentView, readMoreContent } from "./surface";
import { ContentLayoutChoice, ContentLists, ContentViews, useContentLayout, type ContentLayout } from "./views";
import { pieceBesideOf } from "./model/piece-open";

/** The library, Files' own: a chunk of its own, asked for the first time Library is shown. */
const ContentLibrary = lazy(() => import("./library"));

/** How often the page asks again while a video is being made or a post is on its way, and how many times before it rests. */
const CONTENT_FOLLOW_MS = 5 * SECOND_MS;
const CONTENT_FOLLOWS_AT_MOST = 120;

/** Asks again while something moves; stops when nothing does, and after ten minutes of asking (the bell says what lands). */
function useAsksWhileMoving(moving: boolean): void {
  const asks = useRef(0);
  useEffect(() => {
    if (!moving) {
      asks.current = 0;
      return undefined;
    }
    const timer = setInterval(() => {
      asks.current += 1;
      if (asks.current > CONTENT_FOLLOWS_AT_MOST) clearInterval(timer);
      else void refreshSurface("content");
    }, CONTENT_FOLLOW_MS);
    return () => clearInterval(timer);
  }, [moving]);
}

/** Ask, opened on this page, so what it makes is for this business's content and not about nothing. */
const askHere = () => askAbout({ about: { kind: "page", id: CONTENT_ROUTE, label: W.tab } });
const toLibrary = () => navigate(CONTENT_LIBRARY_ROUTE);

/**
 * The head's acts: the Library's door, saying what this workspace adds there (clips where it takes videos, photos where it
 * does not), and Ask, the page's one primary. On a phone the shell's own Ask door stands in for Ask, and the Library's door is
 * the page's one act, coral as every view's beside the strip is (Ruben, 11 Nov 2026). On the Library itself its own Add
 * stands at its head, so the door is not drawn twice.
 */
function ContentDoors({ phone, videos, library }: { phone: boolean; videos: boolean; library: boolean }) {
  return (
    <>
      {library ? null : (
        <Button variant={phone ? "primary" : "quiet"} size="sm" onClick={toLibrary} data-testid="cnv-head-files">
          <ActWords icon={<Icon name="plus" size={14} />} words={videos ? W.addClips : W.addPhotos} />
        </Button>
      )}
      {phone ? null : (
        <Button variant="primary" size="sm" onClick={askHere} data-testid="cnv-head-ask">
          <Icon name="sparkle" size={13} /> {W.ask}
        </Button>
      )}
    </>
  );
}

/** The list a piece opens over on a phone: held where it was, and put back there as the piece goes (kit/motion/held-list.ts). */
const contentList = () => document.querySelector<HTMLElement>(".cnv > .cm-list");
const PIECE_ARRIVES: Arrival = {
  page: () => document.querySelector<HTMLElement>(".cnv > .cm-pane.cnv-open"),
  going: cmGoing,
};

/**
 * The pieces a view shows, in its order: what was made, or, where the view is lines, each line's piece once, with the posts
 * its lines hold; none before the page is read. What the open piece walks through, and where a line's piece is found as it
 * opens.
 */
function piecesShownOf(dto: ContentPageDto | null | undefined): ContentMadeDto[] | null {
  if (!dto) return null;
  if (!contentViewDrawsLines(dto.view)) return dto.made;
  const byFile = new Map<string, ContentMadeDto>();
  for (const line of dto.lines) {
    const held = byFile.get(line.file.id);
    if (held) held.posts.push(line.post);
    else byFile.set(line.file.id, { file: line.file, posts: [line.post] });
  }
  return [...byFile.values()];
}

/**
 * A piece the address names that the page does not hold (a link to one further down than was read, a bell's row for a photo,
 * a photo kept off the shelf on screen): read on its own, with nothing beside it, made here or not. One that is gone says so
 * and closes. One already read stays as it was read while the list it belongs to is fetched, and is read again, standing
 * meanwhile, when the page is (`asked`, which a change moves).
 */
function useNamedPiece(
  named: { open: string | null; held: readonly ContentMadeDto[] | null; asked: number },
  tell: { close: () => void; flash: (f: FrameFlash) => void },
): ContentMadeDto | null {
  const { open, held, asked } = named;
  const { close, flash } = tell;
  const [alone, setAlone] = useState<{ piece: ContentMadeDto; asked: number } | null>(null);
  const inList = open && held ? (held.find((m) => m.file.id === open) ?? null) : null;
  const kept = alone && alone.piece.file.id === open ? alone : null;
  const wanted = open && held && !inList && (!kept || kept.asked !== asked) ? open : null;
  // The page's close and flash are new each draw: what is asked for is the piece, and they are read as it answers.
  const says = useRef({ close, flash });
  says.current = { close, flash };
  useEffect(() => {
    if (!wanted) return undefined;
    let live = true;
    void fileVerbs.record(wanted).then((r) => {
      if (!live) return;
      if (r.ok) setAlone({ piece: { file: r.data.file, posts: r.data.instagram?.posts ?? [] }, asked });
      else {
        says.current.flash({ msg: <>{W.piece.gone}</> });
        says.current.close();
      }
    });
    return () => {
      live = false;
    };
  }, [wanted, asked]);
  return inList ?? kept?.piece ?? null;
}

/** The list a piece belongs to: what Ask made is Made's, anything else the Library's. */
const listOfPiece = (piece: ContentMadeDto): ContentList => (piece.file.source === "made" ? "made" : "library");

/** The bar over the list: Made or the Library, Made's views, and on a desk All as tiles or a list. */
function ContentBar(props: {
  place: ContentPlace;
  tally: ContentPageDto["tally"] | null;
  phone: boolean;
  layout: ContentLayout;
  choose: (layout: ContentLayout) => void;
}) {
  const { place, tally, phone } = props;
  const library = place.list === "library";
  return (
    <div className="cnv-bar">
      <div className="cnv-bar-lead">
        <ContentLists
          list={place.list}
          onList={(l) => navigate(contentRouteOf({ list: l, view: "all", open: null }))}
        />
        {library ? null : (
          <ContentViews
            view={place.view}
            tally={tally}
            phone={phone}
            onView={(v) => navigate(contentRouteOf({ list: "made", view: v, open: null }))}
          />
        )}
      </div>
      {!phone && !library && place.view === "all" ? (
        <ContentLayoutChoice layout={props.layout} choose={props.choose} />
      ) : null}
    </div>
  );
}

/** Show more: the next page of what was made, read once at a time; a read that failed says so. */
function useMoreContent(flash: (f: FrameFlash) => void): { gettingMore: boolean; more: () => void } {
  const [gettingMore, setGettingMore] = useState(false);
  const more = () => {
    if (gettingMore) return;
    setGettingMore(true);
    void readMoreContent()
      .catch(() => flash({ tone: "danger", msg: <>{W.moreFailed}</> }))
      .finally(() => setGettingMore(false));
  };
  return { gettingMore, more };
}

export function ContentPage({ route, view }: { route: string; view?: CmView }) {
  const place: ContentPlace = contentPlaceOf(route.split("/")[1]) ?? { list: "made", view: "all", open: null };
  const library = place.list === "library";
  const held = useSurface("content");
  const videos = videoPreviewOf(useSurface("settings")?.settings?.config);
  const phone = useCmPhone();
  const dto = held && held.dto;
  useAsksWhileMoving(!!dto && contentMoving(dto));
  // The view the address names is the one read: what is on screen stands until it answers.
  useEffect(() => {
    if (!library && askContentView(place.view)) void refreshSurface("content");
  }, [library, place.view]);
  const [layout, setLayout] = useContentLayout();
  const toast = useCampaignsToast();
  const flash = (f: FrameFlash) => toast?.(f);
  const go = (open: string | null) => navigate(contentRouteOf({ ...place, open }));
  const close = () => go(null);
  // The library's files, as it tells them once read: what a piece opened from it walks through.
  const [shelf, setShelf] = useState<ContentMadeDto[] | null>(null);
  const pieces = useMemo(() => (library ? shelf : piecesShownOf(dto)), [library, shelf, dto]);
  // How many times a change has asked the page again: a piece read on its own is read again with it.
  const [asked, setAsked] = useState(0);
  const opened = useNamedPiece({ open: place.open, held: pieces, asked }, { close, flash });
  // A photo named while Made is shown (a bell's row, an old Files link) shows the Library it belongs to, in place of Made.
  const belongs = opened ? listOfPiece(opened) : null;
  useEffect(() => {
    if (belongs === "library" && !library && place.open)
      replaceRoute(contentRouteOf({ list: "library", view: "all", open: place.open }));
  }, [belongs, library, place.open]);
  const beside = pieces && opened ? pieceBesideOf(pieces, opened.file.id) : null;
  const over = useHeldList(phone && !!opened, contentList, PIECE_ARRIVES);
  const { gettingMore, more } = useMoreContent(flash);
  const acts: ContentActs = { onOpen: (fileId) => go(fileId), onMore: more, onAsk: askHere, onFiles: toLibrary };
  // What a change to a piece reads again: Made always (a post or a video of it may have moved), and the Library it was
  // opened from.
  const reread = () => {
    void refreshSurface("content");
    if (library) void refreshSurface("files");
    setAsked((n) => n + 1);
  };
  return (
    <CmSplit
      testid="content-page"
      className="cnv"
      view={view}
      list={
        <>
          <CmHead
            title={W.tab}
            quiet
            right={<ContentDoors phone={phone} videos={videos} library={library} />}
            allowance={false}
          />
          <ContentBar place={place} tally={dto ? dto.tally : null} phone={phone} layout={layout} choose={setLayout} />
          {library ? (
            <Suspense fallback={null}>
              <ContentLibrary flash={flash} onOpen={(fileId) => go(fileId)} onPieces={setShelf} />
            </Suspense>
          ) : (
            <ContentBody
              held={dto}
              acts={acts}
              gettingMore={gettingMore}
              videos={videos}
              openId={opened?.file.id ?? null}
              layout={phone ? "grid" : layout}
            />
          )}
        </>
      }
      open={
        opened ? (
          <ContentPiece
            key={opened.file.id}
            made={opened}
            held={pieces ?? []}
            beside={beside}
            phone={phone}
            over={over}
            onClose={close}
            open={(id) => go(id)}
            reread={reread}
            flash={flash}
          />
        ) : null
      }
    />
  );
}
