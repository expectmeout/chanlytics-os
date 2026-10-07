/**
 * What the Leads page asks of the peek's file besides drawing it (moved from legacy/pages/leads-peek.jsx, decision 0015):
 * Esc backing out one step, the dialog's focus rule, whether the peek follows the row cursor, the watcher that asks once the
 * owner is back at the tab, and a lead's photo asked for before it is needed.
 */
import type { Armed, ArmedSetter, PeekMode } from "./types";

interface EscapeArgs {
  mode?: PeekMode | null;
  armed?: Armed | null;
  setMode: (mode: PeekMode) => void;
  setArmed: (armed: Armed | null) => void;
  setPeekId: (id: string | null) => void;
  lightbox?: string | null;
  setLightbox?: ((id: string | null) => void) | null;
}

/** Esc backs out one step: the photo it expanded, the question it asked, then the pane it opened, then the peek itself. */
export const leadPeekEscape = ({
  mode,
  armed,
  setMode,
  setArmed,
  setPeekId,
  lightbox = null,
  setLightbox = null,
}: EscapeArgs) => {
  if (lightbox && setLightbox) {
    setLightbox(null);
    return "lightbox";
  }
  if (armed && armed.asked) {
    setArmed(null);
    return "armed";
  }
  if (mode && mode !== "info") {
    setMode("info");
    return "mode";
  }
  setPeekId(null);
  return "peek";
};

/**
 * The dialog's focus rule: focus moves into the peek when it opens, and back to the row when it closes. The row is
 * the cursor (`lead-<id>`, the table's own id from its noun), so Tab carries on from where the owner was.
 */
export const leadPeekFocus = (peekId: string | null, cursor: string | null) => {
  const doc = window.document;
  if (!doc || !doc.getElementById) return;
  const el = peekId ? doc.getElementById("lead-peek-close") : cursor && doc.getElementById(`lead-${cursor}`);
  if (el && el.focus) el.focus({ preventScroll: true });
};

/** The peek follows the row cursor only while it is just showing the lead: a question or a draft holds it still. */
export const leadPeekFollows = (mode: PeekMode | null | undefined, armed: Armed | null | undefined) =>
  (!mode || mode === "info") && !armed;

/**
 * The tab comes back, so the peek may ask. Armed when the owner left for their phone or their mail app; asked only
 * once they are here to answer. One listener pair, taken down with the arming.
 */
export const leadArmOnReturn = (armed: Armed | null | undefined, setArmed: ArmedSetter) => {
  if (!armed || armed.asked) return undefined;
  const wake = () => {
    if (!window.document || !window.document.hidden) setArmed((a) => (a && !a.asked ? { ...a, asked: true } : a));
  };
  window.addEventListener("focus", wake);
  window.document.addEventListener("visibilitychange", wake);
  return () => {
    window.removeEventListener("focus", wake);
    window.document.removeEventListener("visibilitychange", wake);
  };
};

/**
 * A lead's photo, asked for before it is needed: the row under a pointer or a finger (a touch enters as it presses),
 * or reached by Tab, and the leads either side of the one open, so the band is there as it opens. Asked once a page,
 * last in line (fetchpriority low), and never drawn from here: the browser keeps it, and the band's own request is
 * answered from it.
 */
const pkWarmed = new Set<string>();
export const leadPhotoWarm = (url: string | null | undefined) => {
  if (!url || pkWarmed.has(url) || typeof Image === "undefined") return;
  pkWarmed.add(url);
  const img = new Image();
  img.decoding = "async";
  img.fetchPriority = "low";
  img.src = url;
};
