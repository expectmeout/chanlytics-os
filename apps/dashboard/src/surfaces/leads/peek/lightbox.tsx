/**
 * The photo, expanded (moved from legacy/pages/leads-peek.jsx, decision 0015; D5): the one photo the listing gave (or the
 * tile), and beside it what is about the place -- where it sits, the week's hours as bars, and the listing's facts. The
 * page's own overlay (.pl-aside), so Esc reaches the page's one listener and closes this first. A viewer, not a sheet: on
 * a phone the photo takes the whole screen. With no photo, a phone raises what is about the place as the kit's one
 * sheet, as tall as it, its name and its Close in the sheet's head (the one-sheet move, 25 Nov 2026).
 */
import { LEAD_WORDS as W } from "@chanlytics/contracts";
import type { LeadPeekVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { keepTouch, leaving, onAPhone, touchSwipe } from "../../frame-verbs";
import { customProperties } from "../../kit/variants";

interface LightboxProps {
  vm: LeadPeekVM;
  onClose: () => void;
}

/** Open in Maps, where the listing has one. */
function mapsLink(vm: LeadPeekVM) {
  return vm.links.maps ? (
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
  ) : null;
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
      {mapsLink(vm)}
      <button type="button" className="pk-x" aria-label={W.closePhotos} data-testid="lightbox-close" onClick={onClose}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

/** The photo itself: a photo that fails to load adds `no-img` to the frame, and the initials show. */
function lightboxPhoto(vm: LeadPeekVM) {
  return (
    <div className="ld-lb-photo" data-testid="lightbox-photo">
      <span className="ld-lb-letters" aria-hidden="true">
        {vm.tile.initials}
      </span>
      {vm.tile.band ? (
        <img
          src={vm.tile.band}
          alt=""
          onError={(e) => {
            e.currentTarget.parentElement?.classList.add("no-img");
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
          {vm.week.map((day) => (
            <div key={day.day} className={`ld-lb-day${day.today ? " today" : ""}`} data-testid="lightbox-day">
              <span className="d">{day.day.slice(0, 3)}</span>
              <span className="ld-lb-track">
                {day.bar ? (
                  <span
                    className="ld-lb-bar"
                    style={customProperties({ "--bar-x": `${day.bar.x}%`, "--bar-w": `${day.bar.w}%` })}
                  />
                ) : null}
              </span>
              <span className="h">{day.short}</span>
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

/** On a phone, a place with no photo: what is about it, in the kit's one sheet. */
const NoPhotoSheet = ({ vm, onClose }: LightboxProps) => (
  <Sheet
    open
    onClose={onClose}
    title={vm.name}
    sub={vm.sub}
    close={{ label: W.closePhotos, glyph: <Icon name="x" size={13} /> }}
    tools={mapsLink(vm) ?? undefined}
    toolsInLine
    testid="lead-lightbox"
  >
    <div className="ld-lb-body">
      {lightboxPhoto(vm)}
      {lightboxSide(vm)}
    </div>
  </Sheet>
);

export const LeadLightbox = ({ vm, onClose }: LightboxProps) =>
  !vm.tile.band && onAPhone() ? (
    <NoPhotoSheet vm={vm} onClose={onClose} />
  ) : (
    <>
      <div className="sheet-backdrop ld-photos-wash" role="presentation" onClick={onClose} />
      <div
        className="ld-photos panel panel-pop panel-flush pl-aside"
        role="dialog"
        aria-label={`${W.photos}: ${vm.name}`}
        data-testid="lead-lightbox"
        ref={leaving("lead-lightbox")}
        // On a phone the photos take the whole screen, and a pull down from the top lets them go, as the peek under them
        // does (kit/motion/swipe.ts touchSwipe; Ruben, 8 October 2026: only Close did). The touch stays the photos' own.
        {...keepTouch(touchSwipe({ onDown: onClose, when: onAPhone }))}
      >
        {lightboxHead({ vm, onClose })}
        <div className="ld-lb-body">
          {lightboxPhoto(vm)}
          {lightboxSide(vm)}
        </div>
      </div>
    </>
  );
