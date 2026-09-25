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
  return <>{children}</>;
}
