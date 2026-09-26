/* global React */
// Chanlytics -- People › Leads: the map of a search's finds, its streets and its pins. Moved whole from leads-scope.jsx
// (Reach out Part 2.5), which reads it from window.
// leads-cells.jsx, which loads before this file.
const { LeadTile, LeadCallMenu, ldCallProps } = window;

/* --------------------------------------- the same leads, on the ground (D5) */
// Every fact on this page is about a place, so the leads can be looked at as places. The plot is contracts'
// (leadMapPlot): every lead the source gave a point, measured in metres from one centre and scaled into a square,
// with the area the search asked for drawn around it. No projection of the world, no tile, and no request to
// anybody -- the picture is made from what the search already found. (Streets would mean a tile provider, which is
// a third-party request on every view; the seam for one is this square, and nothing above it would change.)
// The pin's colour is contracts' (leadPinTone, tone.ts) -- the same registry the row's dot and its tag read, so
// a pin can no longer say one thing where a row says another. It used to answer in its own words (`strong`,
// `part`, `talking`) and leave a table in leads.css to turn them into colours, which is how a `look` fit came to
// draw amber here and plain everywhere else. Without the bridge (the standalone mockup) every pin is plain.
const ldPinTone = (l, by) => {
  const V = window.__LEAD_VM || {};
  return V.leadPinTone ? V.leadPinTone(l, by) : "plain";
};

// Left out is plain, like a long shot -- so it steps back by being quieter instead of by being another colour.
const ldPinOut = (l) => (l.state === "out" ? " is-out" : "");

const LEAD_MAP_BY = [{ id: "fit", label: "Fit" }, { id: "reach", label: "Reach" }, { id: "stage", label: "Stage" }];

// Streets under the pins, when the product hosts a basemap (legacy-bridge lead-map.ts publishes `__LEAD_MAP`). The
// page asks once what ground the archive covers and draws streets only where it does; everywhere else, and wherever
// there is no archive at all (a test, a laptop without the bundle), the square stands as it always did. The pins on
// the streets are the same elements with the same tones, placed by the bridge from the points the door returned.
const { useRef: useLmRef, useEffect: useLmEffect, useState: useLmState } = React;

const useLeadMapCoverage = () => {
  const [cover, setCover] = useLmState(null);
  useLmEffect(() => {
    const M = window.__LEAD_MAP;
    if (!M) return undefined;
    let on = true;
    M.ready().then((c) => { if (on) setCover(() => c); }, () => {});
    return () => { on = false; };
  }, []);
  return cover;
};

const LeadStreets = ({ rows, plot, by, picked, onPick, x, children }) => {
  const box = useLmRef(null);
  const handle = useLmRef(null);
  const latest = useLmRef({ onPick, x });
  latest.current = { onPick, x };
  useLmEffect(() => {
    const M = window.__LEAD_MAP;
    if (!M || !box.current) return undefined;
    const h = M.mount(box.current, { onPick: (id) => latest.current.onPick(id), onOpen: (id) => latest.current.x.onOpen(id) });
    handle.current = h;
    return () => { h.destroy(); handle.current = null; };
  }, []);
  const ids = plot.pins.map((p) => p.id).join(",");
  const center = plot.center;
  useLmEffect(() => {
    const h = handle.current;
    if (!h) return;
    const byId = new Map(rows.map((l) => [l.id, l]));
    h.setPins(
      plot.pins
        .map((p) => byId.get(p.id))
        .filter((l) => l && l.point)
        .map((l) => ({ id: l.id, lat: l.point.lat, lng: l.point.lng, tone: ldPinTone(l, by), out: l.state === "out", label: `${l.name} — ${l.sub}` })),
      picked,
    );
  }, [rows, ids, by, picked]);
  // The area the search asked for: contracts anchored the square on its centre, so the ring's radius in metres is
  // its share of the span, and its centre is the plot's.
  const ringM = plot.ring && center ? Math.round(plot.ring.r * plot.spanM) : 0;
  useLmEffect(() => {
    const h = handle.current;
    if (!h) return;
    h.setRing(ringM && center ? { lat: center.lat, lng: center.lng, radiusM: ringM } : null);
  }, [ringM, center && center.lat, center && center.lng]);
  useLmEffect(() => {
    const h = handle.current;
    if (h && center) h.fit(center, plot.spanM);
  }, [ids, center && center.lat, center && center.lng, plot.spanM]);
  return (
    <div className="ld-map-streets" data-testid="lead-map-streets" data-own-drag>
      <div className="ld-map-canvas" ref={box} />
      {children}
    </div>
  );
};

// The map fits the screen it opens on (desktop only). Its box took a fixed shape from the column's width, so on a
// wide screen it ran ~790px tall and its bottom -- and the note and Search wider under it -- sat below the fold.
// This measures the room from the map's top to the bottom of whatever scrolls it, less the foot and the padding
// under it, and hands it to the stylesheet as --map-h; the list beside it takes the same height. It measures again
// on a resize and whenever the column above it grows or shrinks (the plan panel opening, the band's fits appearing).
const useLeadMapFit = () => {
  const ref = useLmRef(null);
  useLmEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || !el.getBoundingClientRect) return undefined;
    const wide = window.matchMedia ? window.matchMedia("(min-width: 901px)") : { matches: true };
    const scroller = () => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if (o === "auto" || o === "scroll") return n;
      }
      return null;
    };
    const fit = () => {
      const box = el.querySelector(".ld-map-main > :first-child");
      if (!wide.matches || !box) { el.classList.remove("fit"); return; }
      // Fitted first: .fit takes the padding off under the map and under the page (leads.css), so what is measured
      // next is the room the fitted page really has, and the foot ends on the screen's bottom edge.
      el.classList.add("fit");
      const sc = scroller();
      const top = sc ? box.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop : box.getBoundingClientRect().top + window.scrollY;
      const foot = el.querySelector(".ld-map-foot");
      const pad = (n) => (n ? parseFloat(getComputedStyle(n).paddingBottom) || 0 : 0);
      const under = (foot ? foot.offsetHeight + 8 : 0) + pad(el) + pad(sc);
      const room = (sc ? sc.clientHeight : window.innerHeight) - top - under;
      el.style.setProperty("--map-h", `${Math.max(320, Math.round(room))}px`);
      // Whatever still scrolls below it (the page's own padding under the column) comes off the map too, so the
      // map view never scrolls to empty space.
      const view = sc || document.scrollingElement;
      const spill = view ? view.scrollHeight - view.clientHeight - view.scrollTop : 0;
      if (spill > 0) el.style.setProperty("--map-h", `${Math.max(320, Math.round(room - spill))}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro && el.parentElement) ro.observe(el.parentElement);
    return () => { window.removeEventListener("resize", fit); if (ro) ro.disconnect(); };
  }, []);
  return ref;
};

/**
 * On a phone (`phone`, 900px and under) the map is the places alone: its line (how many are on it, and what the pins
 * are coloured by) sits under the plot, and the leads under that are the list's own rows, which the scope draws
 * (leads-scope.jsx). The side list here was a boxed card of its own -- numbered rows, square tiles, a dot -- under a
 * map on a screen too narrow for a side, and looked like no other list (Ruben, 25 Sep).
 */
const LeadMap = ({ rows, plot, by, onBy, picked, onPick, x, onWiden, nearby, onNearby, canFind, oneSearch, phone = false }) => {
  const V = window.__LEAD_VM || {};
  const byId = new Map(rows.map((l) => [l.id, l]));
  const near = [...plot.pins].sort((a, b) => Math.hypot(a.x - 0.5, a.y - 0.5) - Math.hypot(b.x - 0.5, b.y - 0.5));
  const cover = useLeadMapCoverage();
  const fitRef = useLeadMapFit();
  const streets = !!(cover && plot.center && !plot.tooWide && cover.covers(plot.center));
  const card = picked && byId.get(picked) ? (
    <div className="ld-map-card" data-testid="lead-map-card">
      <LeadTile l={byId.get(picked)} size={34} />
      <div className="b">
        <div className="n">{byId.get(picked).name}</div>
        <div className="s">{byId.get(picked).sub}</div>
      </div>
      {byId.get(picked).slots.phone.value ? (
        <LeadCallMenu {...ldCallProps(byId.get(picked), x)} btnClass="btn btn-sm btn-primary" label="Call" testid="map-card-call" />
      ) : null}
    </div>
  ) : null;
  const bar = (
    <div className="ld-map-bar">
      <span className="ld-map-count" data-testid="lead-map-count">{`${plot.pins.length} on the map`}</span>
      <span className="sp" />
      <span className="ld-map-by" role="group" aria-label="Colour the pins by">
        {LEAD_MAP_BY.map((b) => (
          <button key={b.id} type="button" className={`ld-band-fit${by === b.id ? " on" : ""}`} aria-pressed={by === b.id} onClick={() => onBy(b.id)} data-testid={`map-by-${b.id}`}>{b.label}</button>
        ))}
      </span>
    </div>
  );
  return (
    <div className={`ld-map${phone ? " is-phone" : ""}`} ref={phone ? undefined : fitRef} data-testid="lead-map">
      {phone ? null : (
      <div className="ld-map-side">
        {bar}
        <div className="ld-map-rows">
          {near.map((p, i) => {
            const l = byId.get(p.id);
            return (
              <div key={p.id} className={`ld-map-row${picked === p.id ? " on" : ""}`} data-testid="lead-map-row" onMouseEnter={() => onPick(p.id)} onClick={() => x.onOpen(p.id)}>
                <span className="i">{i + 1}</span>
                <LeadTile l={l} size={28} />
                <div className="b">
                  <div className="n">{l.name}</div>
                  <div className="s">{l.sub}</div>
                </div>
                <span className={`ld-pin-dot tone-${ldPinTone(l, by)}${ldPinOut(l)}`} aria-hidden="true" />
              </div>
            );
          })}
        </div>
      </div>
      )}

      <div className="ld-map-main">
        {plot.tooWide ? (
          <div className="ld-map-plot ld-map-wide" data-testid="lead-map-toowide">
            <span className="ld-map-wide-line">{V.leadMapNote ? V.leadMapNote(plot, !!oneSearch) : ""}</span>
          </div>
        ) : streets ? (
          <LeadStreets rows={rows} plot={plot} by={by} picked={picked} onPick={onPick} x={x}>
            {card}
          </LeadStreets>
        ) : (
        <div className="ld-map-plot" data-testid="lead-map-plot">
          {plot.ring ? (
            <span
              className="ld-map-ring"
              aria-hidden="true"
              data-testid="lead-map-ring"
              style={{ left: `${(plot.ring.x - plot.ring.r) * 100}%`, top: `${(plot.ring.y - plot.ring.r) * 100}%`, width: `${plot.ring.r * 200}%`, height: `${plot.ring.r * 200}%` }}
            />
          ) : null}
          {plot.pins.map((p) => {
            const l = byId.get(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={`ld-pin tone-${ldPinTone(l, by)}${ldPinOut(l)}${picked === p.id ? " on" : ""}`}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                aria-label={`${l.name} — ${l.sub}`}
                data-testid={`lead-pin-${p.id}`}
                onMouseEnter={() => onPick(p.id)}
                onFocus={() => onPick(p.id)}
                onClick={() => x.onOpen(p.id)}
              />
            );
          })}
          {card}
          <span className="ld-map-scale" data-testid="lead-map-scale">{V.leadMapAcross ? V.leadMapAcross(plot.spanM) : ""}</span>
        </div>
        )}
        <div className="ld-map-foot">
          {/* Which picture this is, in contracts' words: the area asked for, or only where the leads are, or --
              across searches in different cities -- that these were never one place at all. Where the plot is
              that sentence already (too wide to draw), it is not said twice. */}
          {plot.tooWide ? null : <span className="ld-map-note" data-testid="lead-map-note">{V.leadMapNote ? V.leadMapNote(plot, !!oneSearch) : ""}</span>}
          <span className="sp" />
          {nearby.map((a) => (
            <button key={a.label} type="button" className="ld-band-fit" onClick={() => onNearby(a)} data-testid={`map-nearby-${a.zip || a.label}`}>{a.label}</button>
          ))}
          <button type="button" className="btn btn-sm" onClick={onWiden} data-testid="map-widen" {...(canFind ? {} : window.gate("find", "search a wider area"))}>Search wider</button>
        </div>
        {phone ? bar : null}
      </div>
    </div>
  );
};

Object.assign(window, { LeadMap });
