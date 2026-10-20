/**
 * The frame's head in Glass (the interface kit's step 5.4). The canvases open every page the same way: the date and
 * time in the top bar's row, where Classic's crumbs stand; the page's name with its standing sentence under the bar;
 * and the capsule of views with the page's own act on the row under that. The frame (frame/app-shell.tsx)
 * leaves three empty places for them in Glass alone, and this draws into them, fed by what the page said
 * (standing.ts) and by the crumbs the frame drew. Classic has none of it: the frame leaves no place, and this draws
 * nothing, so the tree Classic draws is the tree it drew.
 *
 * Drawn beside the shell by LegacyApp, in the same React tree, so the head's parts are the kit's TSX and the places
 * are the shell's markup: the shell draws no kit component of its own, and the kit knows nothing of the shell.
 */
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { knownZone } from "@/legacy-bridge/zone";
import { pageDatelineParts, useMinute } from "./dateline";
import { watchFrameTop } from "./frame-top";
import { watchPageGive } from "../motion/page-give";
import { PageHead } from "./page-head";
import { crumbLabel, useCrumbsShown, useStandingSaid } from "./standing";
import type { BackWay, ShownCrumb } from "./standing";
import { navigate } from "../../legacy-verbs";

/** The three places the frame leaves, by id: the dateline in the top bar, the head, and the act beside the views. */
const PLACES = { dateline: "pg-dateline", head: "pg-head", act: "pg-act" } as const;

type Places = { [K in keyof typeof PLACES]: Element | null };

function placesNow(): Places {
  return {
    dateline: document.getElementById(PLACES.dateline),
    head: document.getElementById(PLACES.head),
    act: document.getElementById(PLACES.act),
  };
}

/** Whether the places found are still in the document: the shell drawn again from nothing leaves them behind. */
const stillThere = (p: Places): boolean => !!p.head && document.contains(p.head);

/** How often the head asks for the business's zone while the workspace's read has not landed. */
const ZONE_ASK_MS = 250;

/** The kit's one breakpoint (kit.css): under it the frame's head is a phone's. */
const PHONE_HEAD_QUERY = "(max-width: 900px)";

/** The query's list, asked for once: the store's snapshot reads it on every draw. */
let phoneHeadList: MediaQueryList | null | undefined;
const phoneHeadQuery = (): MediaQueryList | null => {
  if (phoneHeadList === undefined)
    phoneHeadList = typeof window.matchMedia === "function" ? window.matchMedia(PHONE_HEAD_QUERY) : null;
  return phoneHeadList;
};

const watchPhoneHead = (fn: () => void): (() => void) => {
  const q = phoneHeadQuery();
  q?.addEventListener?.("change", fn);
  return () => q?.removeEventListener?.("change", fn);
};

/** Whether the frame wears a phone's head, kept current as the window changes size. */
const usePhoneHead = (): boolean =>
  useSyncExternalStore(
    watchPhoneHead,
    () => !!phoneHeadQuery()?.matches,
    () => false,
  );

/** The way back a crumb offers: the page's own move where it has one, else the route it names. */
function backOf(crumb: ShownCrumb): BackWay | null {
  if (typeof crumb === "string") return null;
  const { label, to, go } = crumb;
  if (go) return { label, go };
  if (to) return { label, go: () => navigate(to) };
  return null;
}

/**
 * The way back the head offers, and where: in the date's place where the page draws its own head (a person's hero, canvas
 * P3) and on every page a phone draws, so a phone's head is two rows, the date's or the way back with the bell, then the
 * name (Ruben, 7 Oct 2026: Sent's ‹ Campaigns stood on a row of its own); above the name on a desk. The way is what the
 * page said, else the crumb before the last; a page that draws its own head says its own or none.
 */
function useBackWay(): { back: BackWay | null; inDate: boolean } {
  const said = useStandingSaid();
  const crumbs = useCrumbsShown();
  const phone = usePhoneHead();
  if (said?.title === null) return { back: said.back ?? null, inDate: true };
  const before = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined;
  const back = said?.back === undefined ? (before ? backOf(before) : null) : said.back;
  return { back, inDate: phone };
}

function BackButton({ back }: { back: BackWay }) {
  return (
    <button type="button" className="pg-back" onClick={back.go}>
      <span className="pg-back-glyph" aria-hidden="true">
        ‹
      </span>
      {back.label}
    </button>
  );
}

/**
 * "Friday, October 2 · 4:02 PM" in the business's zone, in the top bar's row; the hour is a span of its own, which a
 * phone's head leaves out (kit.css: the phone boards say "FRIDAY, OCTOBER 2"). The zone is the workspace's, known once
 * its read lands (legacy-bridge/zone.ts); before that the head says the time in UTC and asks again until it is known,
 * so a page that opens before the read never keeps the wrong hour. Where the way back stands in the date's place
 * (useBackWay), it is drawn here instead.
 */
function PageDateline() {
  const { back, inDate } = useBackWay();
  const now = useMinute();
  const [zone, setZone] = useState<string | null>(() => knownZone());
  useEffect(() => {
    if (zone) return undefined;
    const ask = setInterval(() => {
      const known = knownZone();
      if (known) setZone(known);
    }, ZONE_ASK_MS);
    return () => clearInterval(ask);
  }, [zone]);
  if (back && inDate)
    return (
      <>
        <BackButton back={back} />
        {/* Beside the way back on a desk; in the bell's place on a phone, the bell standing down (components.css). */}
        {back.after ? <span className="pg-back-after">{back.after}</span> : null}
      </>
    );
  const { day, time } = pageDatelineParts(now, zone ?? "UTC");
  return (
    <p className="pg-dateline">
      {day}
      <span className="pg-dateline-time"> · {time}</span>
    </p>
  );
}

/** The page's name and its sentence, and on a desk the way back above them: what the page said, else what the crumbs say. */
function GlassHead() {
  const said = useStandingSaid();
  const crumbs = useCrumbsShown();
  const { back, inDate } = useBackWay();
  // The page draws its own head (a person's hero): the frame's place stays empty.
  if (said?.title === null) return null;
  const last = crumbs.length ? crumbs[crumbs.length - 1] : undefined;
  const title = said?.title ?? (last ? crumbLabel(last) : "");
  return (
    <>
      {back && !inDate && <BackButton back={back} />}
      <PageHead title={title} sentence={said?.sentence} stacked={said?.stacked} />
    </>
  );
}

/** The page's own act, where it named one; the frame's act stands in the same place otherwise (frame/app-shell.tsx). */
function PageAct() {
  const said = useStandingSaid();
  return said?.act ? <>{said.act}</> : null;
}

/**
 * A phone's top bar, at its centre between the way back and the bell: the name and the dot the page said once its own
 * head has scrolled away (a person's, canvas A's hand-off), fading in and out. Always drawn on a phone, so it fades
 * rather than appears; a word for no one, since the page's head says the same.
 */
function BarTitleSaid() {
  const said = useStandingSaid();
  const phone = usePhoneHead();
  if (!phone) return null;
  const bar = said?.bar ?? null;
  return (
    <div className="pg-bartitle" data-shown={bar ? "true" : undefined} aria-hidden="true">
      {bar ? (
        <>
          <span className="pg-bartitle-name">{bar.name}</span>
          <span className="pg-bartitle-dot" data-tone={bar.tone} title={bar.word} />
        </>
      ) : null}
    </div>
  );
}

export function FrameHead({ look }: { look: string }) {
  const [places, setPlaces] = useState<Places | null>(null);
  const crumbs = useCrumbsShown();
  // Found before the commit is painted, never after it: a page that draws in the commit the shell is drawn in (People
  // from the surface cache) stood a head's height up the screen for a frame and was pushed down 33px on a phone when the
  // head came in on the effect after.
  useLayoutEffect(() => {
    if (look !== "glass") {
      setPlaces(null);
      return undefined;
    }
    // The shell draws its places in the commit that draws this (they are siblings under LegacyApp), so they exist by
    // now; a shell that has not drawn yet is asked again on the next frame, and one drawn again from nothing (the
    // crumbs move, or the places left the document, below) is asked for its new places.
    let raf = 0;
    const seek = () => {
      const found = placesNow();
      if (found.head) setPlaces((had) => (had && had.head === found.head ? had : found));
      else raf = requestAnimationFrame(seek);
    };
    setPlaces((had) => (had && stillThere(had) ? had : null));
    seek();
    return () => cancelAnimationFrame(raf);
  }, [look, crumbs, places]);
  // Where the page scrolls (Today), the head's place sits in the page's own scroller (frame/shell-chrome.tsx glassHead), which
  // the shell draws again when the route lands or moves: the place found is left behind in a detached tree, and the
  // head drawn into it is drawn into nothing. So the document is watched, and a place that left it is forgotten,
  // which asks for the new one (the effect above). A stand-in document without an observer is drawn once.
  useEffect(() => {
    if (look !== "glass" || typeof MutationObserver === "undefined") return undefined;
    const watcher = new MutationObserver(() => setPlaces((had) => (had && stillThere(had) ? had : null)));
    watcher.observe(document.body, { childList: true, subtree: true });
    return () => watcher.disconnect();
  }, [look]);
  // The bar's centre is laid over the top bar as the date's place is, in what holds the date's place: the frame's top
  // (frame/shell-chrome.tsx `.frame-top`), whose height and whether the page has gone under it are watched from here before it is
  // painted (frame-top.ts), since the page under it starts that far down.
  const column = places?.dateline?.parentElement ?? null;
  // A stand-in document has no observer, and no top to measure.
  useLayoutEffect(() => (column && typeof ResizeObserver === "function" ? watchFrameTop(column) : undefined), [column]);
  // And the top holds under a pull past the page's end, where the page gives way by itself (page-give.ts).
  useEffect(() => (column ? watchPageGive(window) : undefined), [column]);
  if (!places || !places.head) return null;
  return (
    <>
      {places.dateline && createPortal(<PageDateline />, places.dateline)}
      {createPortal(<GlassHead />, places.head)}
      {places.act && createPortal(<PageAct />, places.act)}
      {column && createPortal(<BarTitleSaid />, column)}
    </>
  );
}
