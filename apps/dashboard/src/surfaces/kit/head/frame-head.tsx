/**
 * The frame's head in Glass (the interface kit's step 5.4). The canvases open every page the same way: the date and
 * time in the top bar's row, where Classic's crumbs stand; the page's name with its standing sentence under the bar;
 * and the capsule of views with the page's own act on the row under that. The frame (legacy/pages/app-shell.jsx)
 * leaves three empty places for them in Glass alone, and this draws into them, fed by what the page said
 * (standing.ts) and by the crumbs the frame drew. Classic has none of it: the frame leaves no place, and this draws
 * nothing, so the tree Classic draws is the tree it drew.
 *
 * Drawn beside the shell by LegacyApp, in the same React tree, so the head's parts are the kit's TSX and the places
 * are the shell's markup: the shell draws no kit component of its own, and the kit knows nothing of the shell.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { knownZone } from "@/legacy-bridge/zone";
import { pageDateline, useMinute } from "./dateline";
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

/**
 * "Friday, October 2 · 4:02 PM" in the business's zone, in the top bar's row. The zone is the workspace's, known once
 * its read lands (legacy-bridge/zone.ts); before that the head says the time in UTC and asks again until it is known,
 * so a page that opens before the read never keeps the wrong hour.
 */
function PageDateline() {
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
  return <p className="pg-dateline">{pageDateline(now, zone ?? "UTC")}</p>;
}

/** The way back a crumb offers: the page's own move where it has one, else the route it names. */
function backOf(crumb: ShownCrumb): BackWay | null {
  if (typeof crumb === "string") return null;
  const { label, to, go } = crumb;
  if (go) return { label, go };
  if (to) return { label, go: () => navigate(to) };
  return null;
}

/** The page's name and its sentence, and the way back above them: what the page said, else what the crumbs say. */
function GlassHead() {
  const said = useStandingSaid();
  const crumbs = useCrumbsShown();
  const last = crumbs.length ? crumbs[crumbs.length - 1] : undefined;
  const before = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined;
  const title = said?.title ?? (last ? crumbLabel(last) : "");
  const back = said?.back === undefined ? (before ? backOf(before) : null) : said.back;
  return (
    <>
      {back && (
        <button type="button" className="pg-back" onClick={back.go}>
          <span className="pg-back-glyph" aria-hidden="true">
            ‹
          </span>
          {back.label}
        </button>
      )}
      <PageHead title={title} sentence={said?.sentence} stacked={said?.stacked} />
    </>
  );
}

/** The page's own act, where it named one; the frame's act stands in the same place otherwise (app-shell.jsx). */
function PageAct() {
  const said = useStandingSaid();
  return said?.act ? <>{said.act}</> : null;
}

export function FrameHead({ look }: { look: string }) {
  const [places, setPlaces] = useState<Places | null>(null);
  const crumbs = useCrumbsShown();
  useEffect(() => {
    if (look !== "glass") {
      setPlaces(null);
      return undefined;
    }
    // The shell draws its places in the commit that draws this (they are siblings under LegacyApp), so they exist by
    // now; a shell that has not drawn yet is asked again on the next frame, and one drawn again from nothing (the
    // crumbs move) is asked for its new places.
    let raf = 0;
    const seek = () => {
      const found = placesNow();
      if (found.head) setPlaces((had) => (had && had.head === found.head ? had : found));
      else raf = requestAnimationFrame(seek);
    };
    setPlaces((had) => (had && stillThere(had) ? had : null));
    seek();
    return () => cancelAnimationFrame(raf);
  }, [look, crumbs]);
  if (!places || !places.head) return null;
  return (
    <>
      {places.dateline && createPortal(<PageDateline />, places.dateline)}
      {createPortal(<GlassHead />, places.head)}
      {places.act && createPortal(<PageAct />, places.act)}
    </>
  );
}
