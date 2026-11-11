/**
 * Campaigns › Content: everything Ask made for the business and where each piece stands. Drawn in a workspace whose Content
 * switch is on (shown.ts, campaigns/home/route.tsx). Real data or nothing: what is being made (00613 `pieces`), what was made
 * (`files` made here) and where each was posted (00611 `posts`), read by one read (surface.ts, GET content).
 *
 * The head holds two doors: Ask, opened on this page, and Files, where clips are added. How many are made and how many are
 * out heads the made pieces themselves (content-body.tsx). A tile opens its file where it already opens, in Files, with Back
 * coming home here. A video being made and a post on its way are told to no page, so while one moves the page asks again,
 * a few seconds apart, and stops when none does.
 */
// The page's own rules, and Files' tile's, loaded with it: the page is loaded on demand (campaigns/home/route.tsx).
import "../../files/files.css";
import "./content.css";
import { useEffect, useRef, useState } from "react";
import { CONTENT_ROUTE, CONTENT_WORDS as W, FILES_ROUTE, SECOND_MS, contentMoving } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { ActWords } from "../../kit/head/act-words";
import { Icon } from "../../kit/icon/icon";
import { askAbout, navigate, refreshSurface } from "../../frame-verbs";
import { openFile } from "../../files/file-asked";
import { useSurface } from "../../use-surface";
import { CmHead } from "../parts/head";
import { type CmView, useCmPhone } from "../parts/split";
import { useCampaignsToast } from "../home/route-toast";
import { ContentBody, type ContentActs } from "./content-body";
import { showMoreContent } from "./surface";

/** How often the page asks again while a video is being made or a post is on its way, and how many times before it rests. */
const CONTENT_FOLLOW_MS = 5 * SECOND_MS;
const CONTENT_FOLLOWS_AT_MOST = 120;

/** Asks again while something moves; stops when nothing does, and after ten minutes of asking (the bell says what lands). */
function useAsksWhileMoving(moving: boolean): void {
  const asked = useRef(0);
  useEffect(() => {
    if (!moving) {
      asked.current = 0;
      return undefined;
    }
    const timer = setInterval(() => {
      asked.current += 1;
      if (asked.current > CONTENT_FOLLOWS_AT_MOST) clearInterval(timer);
      else void refreshSurface("content");
    }, CONTENT_FOLLOW_MS);
    return () => clearInterval(timer);
  }, [moving]);
}

/** Ask, opened on this page, so what it makes is for this business's content and not about nothing. */
const askHere = () => askAbout({ about: { kind: "page", id: CONTENT_ROUTE, label: W.tab } });
const toFiles = () => navigate(FILES_ROUTE);

/** The head's acts: Files' door, quiet, and Ask, the page's one primary. On a phone the shell's own Ask door stands in. */
function HeadActs({ phone }: { phone: boolean }) {
  return (
    <>
      <Button variant="quiet" size="sm" onClick={toFiles} data-testid="cnv-head-files">
        <ActWords icon={<Icon name="plus" size={14} />} words={W.addClips} />
      </Button>
      {phone ? null : (
        <Button variant="primary" size="sm" onClick={askHere} data-testid="cnv-head-ask">
          <Icon name="sparkle" size={13} /> {W.ask}
        </Button>
      )}
    </>
  );
}

export function ContentPage({ view }: { view?: CmView }) {
  const held = useSurface("content");
  const phone = useCmPhone();
  const dto = held === undefined || held === null ? held : held.dto;
  useAsksWhileMoving(!!dto && contentMoving(dto));
  const flash = useCampaignsToast();
  const [gettingMore, setGettingMore] = useState(false);
  const more = () => {
    if (gettingMore) return;
    setGettingMore(true);
    void showMoreContent()
      .catch(() => flash?.({ tone: "danger", msg: <>{W.moreFailed}</> }))
      .finally(() => setGettingMore(false));
  };
  const acts: ContentActs = {
    onOpen: (fileId) => openFile(fileId, navigate),
    onMore: more,
    onAsk: askHere,
    onFiles: toFiles,
  };
  return (
    <div ref={view?.ref} className="cmh cnv" data-slide={view?.slide} data-testid="content-page">
      <CmHead title={W.tab} quiet right={<HeadActs phone={phone} />} allowance={false} />
      <ContentBody held={dto} acts={acts} gettingMore={gettingMore} />
    </div>
  );
}
