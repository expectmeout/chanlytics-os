/**
 * The photo, expanded (moved from legacy/pages/leads-peek.jsx, decision 0015; D5): the one photo the listing gave (or the
 * tile), and beside it what is about the place -- where it sits, the week's hours as bars, and the listing's facts. The
 * page's own overlay (.pl-peek), so Esc reaches the page's one listener and closes this first.
 */
import { LEAD_WORDS as W } from "@chanlytics/contracts";
import type { LeadPeekVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { leaving } from "../../legacy-verbs";

interface LightboxProps {
  vm: LeadPeekVM;
  onClose: () => void;
}

/** The lightbox's title row: the name and its sub-line, Open in Maps where the listing has one, and Close. */
function lightboxHead({ vm, onClose }: LightboxProps) {
  return (
    <div className="ld-lb-head">
      <div className="ld-lb-titles">
        <div className="ld-lb-name">{vm.name}</div>
        <div className="ld-lb-sub">{vm.sub}</div>
      </div>
      <span className="sp" />
      {vm.links.maps ? (
        <a
          className="btn btn-ghost btn-sm"
          href={vm.links.maps.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="lightbox-maps"
        >
          <Icon name="pin" size={12} />
          {W.openMaps}
        </a>
      ) : null}
      <button type="button" className="pk-x" aria-label={W.closePhotos} data-testid="lightbox-close" onClick={onClose}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

/** The photo itself, on the kind's tint: a photo that fails to load adds `no-img` to the frame, and the initials show. */
function lightboxPhoto(vm: LeadPeekVM) {
  return (
    <div className={`ld-lb-photo tint-${vm.tile.tint}`} data-testid="lightbox-photo">
      <span className="ld-lb-initials" aria-hidden="true">
        {vm.tile.initials}
      </span>
      {vm.tile.band ? (
        <img
          src={vm.tile.band}
          alt=""
          onError={(e) => {
            const t = e && e.currentTarget;
            const parent = t && (t.parentNode as Element | null);
            if (parent && parent.classList) parent.classList.add("no-img");
          }}
        />
      ) : (
        <span className="ld-lb-nophoto">{W.noPhoto}</span>
      )}
    </div>
  );
}

/** What is about the place: where it sits, the week's hours as bars, and the facts the listing gave. */
function lightboxSide(vm: LeadPeekVM) {
  return (
    <div className="ld-lb-side">
      {vm.where ? (
        <div className="ld-lb-block" data-testid="lightbox-where">
          <div className="pk-label">{W.whereSits}</div>
          <div className="ld-lb-line">{vm.where.line}</div>
          {vm.distance ? <div className="ld-lb-quiet">{vm.distance} from the search's centre</div> : null}
        </div>
      ) : null}
      {vm.week.length ? (
        <div className="ld-lb-block" data-testid="lightbox-week">
          <div className="pk-label">{W.openHours}</div>
          {vm.week.map((d) => (
            <div key={d.day} className={`ld-lb-day${d.today ? " today" : ""}`} data-testid="lightbox-day">
              <span className="d">{d.day.slice(0, 3)}</span>
              <span className="ld-lb-track">
                {d.bar ? <span className="ld-lb-bar" style={{ left: `${d.bar.x}%`, width: `${d.bar.w}%` }} /> : null}
              </span>
              <span className="h">{d.short}</span>
            </div>
          ))}
        </div>
      ) : null}
      {vm.facts.length ? (
        <div className="ld-lb-block" data-testid="lightbox-facts">
          <div className="pk-label">{W.fromListing}</div>
          {vm.facts.map((f) => (
            <div key={f.k} className="ld-lb-fact">
              <span className="k">{f.k}</span>
              <span className="v">{f.v}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const LeadLightbox = ({ vm, onClose }: LightboxProps) => (
  <>
    <div className="ld-lightbox-backdrop" role="presentation" onClick={onClose} />
    <div
      className="ld-lightbox pl-peek"
      role="dialog"
      aria-label={`${W.photos}: ${vm.name}`}
      data-testid="lead-lightbox"
      ref={leaving("lead-lightbox")}
    >
      {lightboxHead({ vm, onClose })}
      <div className="ld-lb-body">
        {lightboxPhoto(vm)}
        {lightboxSide(vm)}
      </div>
    </div>
  </>
);
