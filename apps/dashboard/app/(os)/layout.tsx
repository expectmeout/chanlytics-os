// The legacy design system, hoisted out of the client-only chunk (see
// LegacyApp). Next emits it as a stylesheet <link> on this route, so first
// paint is not waiting on the dynamic import to resolve first.
import "@/legacy-bridge/legacy.css";
// MapLibre's own sheet (the canvas, its controls, the cooperative-gesture screen), for the lead map's streets.
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The signed-in OS's frame, the same for every person and workspace: it reads no request, so the build prerenders it
 * once and a move between pages asks the server for nothing (decision 0053, step 5).
 *
 * The gate is the proxy (proxy.ts), which verifies the session's signature for every OS address, document, move and
 * prefetch alike, and sends anyone without one to sign in; and every read verifies it again (withRoute: signed out,
 * not a member, a second factor owed). This layout verified it too, until 12 October 2026, as a guarantee should the
 * proxy be bypassed (CVE-2025-29927's class). What it guarded is this frame's HTML, a spinner with no one's data in
 * it, which Next's client never asked it for on a move or a prefetch; the data behind the frame is the reads', and
 * the build holds the frame to reading nothing (eslint.config.mjs, "the (os) frame reads no request").
 */
export default function OsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TurnUpright />
    </>
  );
}

/**
 * What a phone held sideways shows in place of the OS (mobile.css, `.turn-upright`): no page is drawn for that shape
 * yet, and a page cannot hold an iPhone upright (Safari reads no orientation from the manifest and takes no lock from a
 * script), so the app stands down and says so (Ruben, 7 Oct 2026). It is drawn beside every page of the OS and the
 * stylesheet alone decides when it shows, so nothing waits on a script and the page under it is hidden, never unloaded:
 * turned back, it is as it was left. The pages outside the OS (the doors, a business's public pages) reflow and keep
 * their sideways view.
 */
function TurnUpright() {
  return (
    <div className="turn-upright" role="alert">
      <svg
        width="26"
        height="40"
        viewBox="0 0 26 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="1" y="1" width="24" height="38" rx="5" />
        <path d="M10 34.5h6" strokeLinecap="round" />
      </svg>
      <strong>Turn your phone upright</strong>
      <span>Chanlytics has no sideways view on a phone yet.</span>
    </div>
  );
}
