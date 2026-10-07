import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
// The legacy design system, hoisted out of the client-only chunk (see
// LegacyApp). Next emits it as a stylesheet <link> on this route, so first
// paint is not waiting on the dynamic import to resolve first.
import "@/legacy-bridge/legacy.css";
// MapLibre's own sheet (the canvas, its controls, the cooperative-gesture screen), for the lead map's streets.
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Server-side auth gate for every OS surface (middleware is the first line; this is the guarantee). The token's
 * signature verified as proxy.ts verifies it -- locally where the project signs with an asymmetric key -- so the
 * document no longer waits on a round trip to the Auth server before its body streams (about 900 ms of a cold
 * load's HTML, measured 25 Sep 2026).
 */
export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: verified } = await supabase.auth.getClaims();
  if (!verified?.claims) redirect("/login");
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
