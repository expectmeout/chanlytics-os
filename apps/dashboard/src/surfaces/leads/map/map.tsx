/**
 * The same leads, on the ground (D5), moved from legacy/pages/leads-map.jsx (decision 0015). Every fact on this page is
 * about a place, so the leads can be looked at as places. The plot is contracts' (leadMapPlot): every lead the source gave a
 * point, measured in metres from one centre and scaled into a square, with the area the search asked for drawn around it.
 * No projection of the world, no tile, and no request to anybody -- the picture is made from what the search already found.
 * Where the product hosts a basemap, the streets are drawn under the pins (lead-map.ts); everywhere else the square stands.
 *
 * The pin's colour is contracts' (leadPinTone, tone.ts) -- the same registry the row's dot and its tag read, so a pin can no
 * longer say one thing where a row says another.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  leadMapAcross,
  leadMapLegend,
  leadMapNote,
  leadPinTone,
  type LeadMapPlot,
  type LeadRowVM,
} from "@chanlytics/contracts";
import { gate } from "../../legacy-verbs";
import type { NearbyArea } from "../bench/types";
import { LeadCallMenu, ldCallProps } from "../cells/call-menu";
import { LeadTile } from "../cells/tile";
import type { LeadCellCtx } from "../cells/types";
import { leadMapApi, type LeadMapCoverage, type LeadMapHandle } from "./lead-map";

const ldPinTone = (l: LeadRowVM) => leadPinTone(l);

// Left out is plain, like a long shot -- so it steps back by being quieter instead of by being another colour.
const ldPinOut = (l: LeadRowVM) => (l.state === "out" ? " is-out" : "");

/**
 * Streets under the pins, when the product hosts a basemap (lead-map.ts). The page asks once what ground the archive
 * covers and draws streets only where it does; everywhere else, and wherever there is no archive at all (a test, a laptop
 * without the bundle), the square stands as it always did.
 */
const useLeadMapCoverage = () => {
  const [cover, setCover] = useState<LeadMapCoverage | null>(null);
  useEffect(() => {
    const M = leadMapApi();
    if (!M) return undefined;
    let on = true;
    M.ready().then(
      (c) => {
        if (on) setCover(() => c);
      },
      () => undefined,
    );
    return () => {
      on = false;
    };
  }, []);
  return cover;
};

/** The pins as the streets take them: each lead the source placed, by the tone its row wears. */
const pinsOf = (rows: readonly LeadRowVM[], plot: LeadMapPlot) => {
  const byId = new Map(rows.map((l) => [l.id, l]));
  return plot.pins
    .map((p) => byId.get(p.id))
    .filter((l): l is LeadRowVM & { point: { lat: number; lng: number } } => !!(l && l.point))
    .map((l) => ({
      id: l.id,
      lat: l.point.lat,
      lng: l.point.lng,
      tone: ldPinTone(l),
      out: l.state === "out",
      label: `${l.name} — ${l.sub}`,
    }));
};

const LeadStreets = ({
  rows,
  plot,
  picked,
  onPick,
  x,
  children,
}: {
  rows: readonly LeadRowVM[];
  plot: LeadMapPlot;
  picked: string | null;
  onPick: (id: string) => void;
  x: LeadCellCtx;
  children?: ReactNode;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<LeadMapHandle | null>(null);
  const latest = useRef({ onPick, x });
  latest.current = { onPick, x };
  useEffect(() => {
    const M = leadMapApi();
    if (!M || !box.current) return undefined;
    const h = M.mount(box.current, {
      onPick: (id) => latest.current.onPick(id),
      onOpen: (id) => latest.current.x.onOpen(id),
    });
    handle.current = h;
    return () => {
      h.destroy();
      handle.current = null;
    };
  }, []);
  const ids = plot.pins.map((p) => p.id).join(",");
  const center = plot.center;
  useEffect(() => {
    const h = handle.current;
    if (!h) return;
    h.setPins(pinsOf(rows, plot), picked);
  }, [rows, ids, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  // The area the search asked for: contracts anchored the square on its centre, so the ring's radius in metres is its
  // share of the span, and its centre is the plot's.
  const ringM = plot.ring && center ? Math.round(plot.ring.r * plot.spanM) : 0;
  useEffect(() => {
    const h = handle.current;
    if (!h) return;
    h.setRing(ringM && center ? { lat: center.lat, lng: center.lng, radiusM: ringM } : null);
  }, [ringM, center && center.lat, center && center.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = handle.current;
    if (h && center) h.fit(center, plot.spanM);
  }, [ids, center && center.lat, center && center.lng, plot.spanM]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ld-map-streets" data-testid="lead-map-streets" data-own-drag>
      <div className="ld-map-canvas" ref={box} />
      {children}
    </div>
  );
};

/** What scrolls the map: the nearest ancestor that scrolls on its own. */
const scrollerOf = (el: HTMLElement): HTMLElement | null => {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if (o === "auto" || o === "scroll") return n;
  }
  return null;
};

/** The map's height, fitted to the room under its top on a desk (the fit `useLeadMapFit` runs). */
function fitMap(el: HTMLElement, wide: { matches: boolean }) {
  const box = el.querySelector<HTMLElement>(".ld-map-main > :first-child");
  if (!wide.matches || !box) {
    el.classList.remove("fit");
    return;
  }
  // Fitted first: .fit takes the padding off under the map and under the page (leads.css), so what is measured next is
  // the room the fitted page really has, and the foot ends on the screen's bottom edge.
  el.classList.add("fit");
  const sc = scrollerOf(el);
  const top = sc
    ? box.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop
    : box.getBoundingClientRect().top + window.scrollY;
  const foot = el.querySelector<HTMLElement>(".ld-map-foot");
  const pad = (n: Element | null) => (n ? parseFloat(getComputedStyle(n).paddingBottom) || 0 : 0);
  const under = (foot ? foot.offsetHeight + 8 : 0) + pad(el) + pad(sc);
  const room = (sc ? sc.clientHeight : window.innerHeight) - top - under;
  el.style.setProperty("--map-h", `${Math.max(320, Math.round(room))}px`);
  // Whatever still scrolls below it (the page's own padding under the column) comes off the map too, so the map view
  // never scrolls to empty space.
  const view = sc || document.scrollingElement;
  const spill = view ? view.scrollHeight - view.clientHeight - view.scrollTop : 0;
  if (spill > 0) el.style.setProperty("--map-h", `${Math.max(320, Math.round(room - spill))}px`);
}

/**
 * The map fits the screen it opens on (desktop only). Its box took a fixed shape from the column's width, so on a wide
 * screen it ran ~790px tall and its bottom -- and the note and Search wider under it -- sat below the fold. This measures
 * the room from the map's top to the bottom of whatever scrolls it, less the foot and the padding under it, and hands it to
 * the stylesheet as --map-h; the list beside it takes the same height. It measures again on a resize and whenever the column
 * above it grows or shrinks (the plan panel opening, the band's fits appearing).
 */
const useLeadMapFit = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || !el.getBoundingClientRect) return undefined;
    const wide = window.matchMedia ? window.matchMedia("(min-width: 901px)") : { matches: true };
    const fit = () => fitMap(el, wide);
    fit();
    window.addEventListener("resize", fit);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro && el.parentElement) ro.observe(el.parentElement);
    return () => {
      window.removeEventListener("resize", fit);
      if (ro) ro.disconnect();
    };
  }, []);
  return ref;
};

/** The picked lead's card over the map: its tile, its words, and Call. */
const pickedCard = (l: LeadRowVM | undefined, x: LeadCellCtx) =>
  l ? (
    <div className="ld-map-card" data-testid="lead-map-card">
      <LeadTile l={l} size={34} />
      <div className="b">
        <div className="n">{l.name}</div>
        <div className="s">{l.sub}</div>
      </div>
      {l.slots.phone.value ? (
        <LeadCallMenu
          {...ldCallProps(l, x)}
          look={{ variant: "primary", size: "sm", iconOnly: false }}
          label="Call"
          testid="map-card-call"
        />
      ) : null}
    </div>
  ) : null;

/** How many are on the map, and what the pins are coloured by: one mark and word per state a pin wears (contracts leadMapLegend). */
const mapBar = (plot: LeadMapPlot, byId: Map<string, LeadRowVM>) => {
  // A map too wide to draw has no pins, so nothing to explain.
  const legend = !plot.tooWide
    ? leadMapLegend(plot.pins.map((p) => byId.get(p.id)).filter((l): l is LeadRowVM => !!l))
    : [];
  return (
    <div className="ld-map-bar">
      <span className="ld-map-count" data-testid="lead-map-count">{`${plot.pins.length} on the map`}</span>
      {legend.length ? (
        <span className="ld-map-legend" data-testid="lead-map-legend">
          {legend.map((e) => (
            <span key={e.state} className="ld-map-key" data-testid={`lead-map-key-${e.state}`}>
              <span className={`ld-pin-dot tone-${e.tone}${e.out ? " is-out" : ""}`} aria-hidden="true" />
              {e.label}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
};

/** The side list on a desk: the leads by how near the middle they sit, the one picked marked. */
const mapSide = (
  plot: LeadMapPlot,
  byId: Map<string, LeadRowVM>,
  a: { picked: string | null; onPick: (id: string) => void; x: LeadCellCtx; bar: ReactNode },
) => {
  const near = [...plot.pins].sort((p, q) => Math.hypot(p.x - 0.5, p.y - 0.5) - Math.hypot(q.x - 0.5, q.y - 0.5));
  return (
    <div className="ld-map-side">
      {a.bar}
      <div className="ld-map-rows">
        {near.map((p, i) => {
          const l = byId.get(p.id) as LeadRowVM;
          return (
            <div
              key={p.id}
              className={`ld-map-row${a.picked === p.id ? " on" : ""}`}
              data-testid="lead-map-row"
              onMouseEnter={() => a.onPick(p.id)}
              onClick={() => a.x.onOpen(p.id)}
            >
              <span className="i">{i + 1}</span>
              <LeadTile l={l} size={28} />
              <div className="b">
                <div className="n">{l.name}</div>
                <div className="s">{l.sub}</div>
              </div>
              <span className={`ld-pin-dot tone-${ldPinTone(l)}${ldPinOut(l)}`} aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** The square: the ring of the area asked for, the pins, the picked card and the scale. */
const mapPlot = (
  plot: LeadMapPlot,
  byId: Map<string, LeadRowVM>,
  a: { picked: string | null; onPick: (id: string) => void; x: LeadCellCtx; card: ReactNode },
) => (
  <div className="ld-map-plot" data-testid="lead-map-plot">
    {plot.ring ? (
      <span
        className="ld-map-ring"
        aria-hidden="true"
        data-testid="lead-map-ring"
        style={{
          left: `${(plot.ring.x - plot.ring.r) * 100}%`,
          top: `${(plot.ring.y - plot.ring.r) * 100}%`,
          width: `${plot.ring.r * 200}%`,
          height: `${plot.ring.r * 200}%`,
        }}
      />
    ) : null}
    {plot.pins.map((p) => {
      const l = byId.get(p.id) as LeadRowVM;
      return (
        <button
          key={p.id}
          type="button"
          className={`ld-pin tone-${ldPinTone(l)}${ldPinOut(l)}${a.picked === p.id ? " on" : ""}`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          aria-label={`${l.name} — ${l.sub}`}
          data-testid={`lead-pin-${p.id}`}
          onMouseEnter={() => a.onPick(p.id)}
          onFocus={() => a.onPick(p.id)}
          onClick={() => a.x.onOpen(p.id)}
        />
      );
    })}
    {a.card}
    <span className="ld-map-scale" data-testid="lead-map-scale">
      {leadMapAcross(plot.spanM)}
    </span>
  </div>
);

interface LeadMapProps {
  rows: readonly LeadRowVM[];
  plot: LeadMapPlot;
  picked: string | null;
  onPick: (id: string) => void;
  x: LeadCellCtx;
  onWiden: () => void;
  nearby: readonly NearbyArea[];
  onNearby: (area: NearbyArea) => void;
  canFind: boolean;
  oneSearch: boolean;
  phone?: boolean;
}

/**
 * On a phone (`phone`, 900px and under) the map is the places alone: its line (how many are on it, and what the pins are
 * coloured by) sits under the plot, and the leads under that are the list's own rows, which the scope draws. The side list
 * here was a boxed card of its own -- numbered rows, square tiles, a dot -- under a map on a screen too narrow for a side,
 * and looked like no other list (Ruben, 25 Sep).
 */
export const LeadMap = ({
  rows,
  plot,
  picked,
  onPick,
  x,
  onWiden,
  nearby,
  onNearby,
  canFind,
  oneSearch,
  phone = false,
}: LeadMapProps) => {
  const byId = new Map(rows.map((l) => [l.id, l]));
  const cover = useLeadMapCoverage();
  const fitRef = useLeadMapFit();
  const streets = !!(cover && plot.center && !plot.tooWide && cover.covers(plot.center));
  const card = picked ? pickedCard(byId.get(picked), x) : null;
  const bar = mapBar(plot, byId);
  return (
    <div className={`ld-map${phone ? " is-phone" : ""}`} ref={phone ? undefined : fitRef} data-testid="lead-map">
      {phone ? null : mapSide(plot, byId, { picked, onPick, x, bar })}

      <div className="ld-map-main">
        {plot.tooWide ? (
          <div className="ld-map-plot ld-map-wide" data-testid="lead-map-toowide">
            <span className="ld-map-wide-line">{leadMapNote(plot, !!oneSearch)}</span>
          </div>
        ) : streets ? (
          <LeadStreets rows={rows} plot={plot} picked={picked} onPick={onPick} x={x}>
            {card}
          </LeadStreets>
        ) : (
          mapPlot(plot, byId, { picked, onPick, x, card })
        )}
        <div className="ld-map-foot">
          {/* Which picture this is, in contracts' words: the area asked for, or only where the leads are, or -- across
              searches in different cities -- that these were never one place at all. Where the plot is that sentence
              already (too wide to draw), it is not said twice. */}
          {plot.tooWide ? null : (
            <span className="ld-map-note" data-testid="lead-map-note">
              {leadMapNote(plot, !!oneSearch)}
            </span>
          )}
          <span className="sp" />
          {nearby.map((a) => (
            <button
              key={a.label}
              type="button"
              className="ld-band-fit"
              onClick={() => onNearby(a)}
              data-testid={`map-nearby-${a.zip || a.label}`}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            onClick={onWiden}
            data-testid="map-widen"
            {...(canFind ? {} : gate("find", "search a wider area"))}
          >
            Search wider
          </button>
        </div>
        {phone && !plot.tooWide ? bar : null}
      </div>
    </div>
  );
};
