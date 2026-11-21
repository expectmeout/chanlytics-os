/**
 * The Ads page's own read once an account is or was connected (GET ads/page), and one ad's people (GET ads/people).
 * Read where the page draws them: when it opens, when the owner comes back to the tab, after a press, while a press is
 * still on its way to Meta every few seconds until Meta has been told, and while an account just connected waits for
 * its first read, until it lands. Where the read fails the page keeps
 * what it last drew. A workspace that never connected an account answers null, and the page draws what is true with
 * nothing connected.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SECOND_MS } from "@chanlytics/contracts";
import type { AdPersonLiveDto, AdsLiveDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { adsFirstAnswer } from "@/bridge/surfaces/ads-first-reads";
import { getActiveWorkspace } from "@/bridge/workspace";
import { firstReadOf } from "./model";

/** How often the page reads again while a press of the owner's is on its way to Meta. */
const PENDING_EVERY_MS = 8 * SECOND_MS;
/**
 * How often it reads again while an account just connected waits for its first read: the clock reads it within a
 * minute or two (the first real Connect's came two minutes after), and the page shows it without the owner leaving.
 */
const FIRST_READ_EVERY_MS = 15 * SECOND_MS;
/** How soon after a read the owner coming back to the tab reads again. */
const BACK_AFTER_MS = 30 * SECOND_MS;

export interface AdsLiveHere {
  /** The page's read: undefined until the first is in, null where no account was ever connected. */
  dto: AdsLiveDto | null | undefined;
  failed: boolean;
  again: () => void;
}

/** What the page starts from: the ads to draw first, when they were read, and the account they stand for unread. */
interface PageOpening {
  dto: AdsLiveDto | null | undefined;
  readAt: number;
  standsFor: string | null;
}

/** What the page starts from where the Ads view opened on nothing the boot read. */
const NOTHING_OPENED: PageOpening = { dto: undefined, readAt: 0, standsFor: null };

/**
 * What the page starts from: the ads the Ads view opened on, where the boot read them (bridge/surfaces/ads-first-reads.ts),
 * drawn at once, and the account (`key`) they stand for with no read behind them: none where they have aged.
 */
function openingPage(key: string): PageOpening {
  const first = adsFirstAnswer(Date.now(), getActiveWorkspace());
  if (!first) return NOTHING_OPENED;
  return { dto: first.held.page, readAt: first.held.fetchedAt, standsFor: first.recent ? key : null };
}

/** Whether the page reads now: unless what it opened on stands for the account as it still is and nothing has asked. */
const pageReadsNow = (on: boolean, askedCount: number, key: string, standsFor: string | null): boolean =>
  on && (askedCount > 0 || key !== standsFor);

/** The page's read, where `on` says an account's ads are the page's to draw. */
export function useAdsLive(on: boolean, key: string): AdsLiveHere {
  const [opening] = useState(() => openingPage(key));
  const [dto, setDto] = useState<AdsLiveDto | null | undefined>(opening.dto);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState(0);
  const readAt = useRef(opening.readAt);
  const again = useCallback(() => setAsked((count) => count + 1), []);

  useEffect(() => {
    if (!pageReadsNow(on, asked, key, opening.standsFor)) return undefined;
    let live = true;
    read("GET ads/page").then(
      (answer) => {
        if (!live) return;
        readAt.current = Date.now();
        setDto(answer);
        setFailed(false);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
    // `key` is the account as the card last read it: a connect, a sign-out or a disconnect reads the page again.
  }, [on, asked, key, opening.standsFor]);

  // Back on the tab after a while: the hour's numbers may be in.
  useEffect(() => {
    if (!on || typeof document === "undefined") return undefined;
    const back = () => {
      if (document.visibilityState === "visible" && Date.now() - readAt.current > BACK_AFTER_MS) again();
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [on, again]);

  // A press on its way to Meta, or an account's first read on its way here: read again until it has landed. A first
  // read that failed waits for the clock, which tries again in minutes, and so does the page.
  const pending = dto?.ads.some((ad) => ad.pending !== null) ?? false;
  const firstRead = dto ? firstReadOf(dto.account) === "reading" : false;
  const every = pending ? PENDING_EVERY_MS : firstRead ? FIRST_READ_EVERY_MS : null;
  useEffect(() => {
    if (!on || every === null) return undefined;
    const timer = window.setInterval(again, every);
    return () => window.clearInterval(timer);
  }, [on, every, again]);

  return { dto: on ? dto : null, failed, again };
}

interface AdPeopleHere {
  people: AdPersonLiveDto[];
  state: "reading" | "read" | "failed";
  more: boolean;
  /** The next page, or the first again after a read that failed. */
  next: () => void;
}

/** One ad's people, read when its drawer opens, a page at a time. */
export function useAdPeople(adId: string | null): AdPeopleHere {
  const [people, setPeople] = useState<AdPersonLiveDto[]>([]);
  const [state, setState] = useState<AdPeopleHere["state"]>("reading");
  const [more, setMore] = useState(false);
  const [page, setPage] = useState({ ad: adId, offset: 0, tried: 0 });
  // Another ad is another list: it starts from its first page.
  if (page.ad !== adId) {
    setPage({ ad: adId, offset: 0, tried: 0 });
    setPeople([]);
    setState("reading");
    setMore(false);
  }
  useEffect(() => {
    if (page.ad === null) return undefined;
    let live = true;
    read("GET ads/people", { query: { ad: page.ad, offset: page.offset } }).then(
      (answer) => {
        if (!live) return;
        setPeople((had) => (page.offset === 0 ? answer.people : [...had, ...answer.people]));
        setMore(answer.more);
        setState("read");
      },
      () => {
        if (live) setState("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [page]);
  const next = () => {
    setState("reading");
    setPage((at) => ({ ...at, offset: state === "failed" ? at.offset : people.length, tried: at.tried + 1 }));
  };
  return { people, state, more, next };
}
