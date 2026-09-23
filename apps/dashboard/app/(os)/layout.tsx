import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
// The legacy design system, hoisted out of the client-only chunk (see
// LegacyApp). Next emits it as a stylesheet <link> on this route, so first
// paint is not waiting on the dynamic import to resolve first.
import "@/legacy-bridge/legacy.css";
// MapLibre's own sheet (the canvas, its controls, the cooperative-gesture screen), for the lead map's streets.
import "maplibre-gl/dist/maplibre-gl.css";

/** Server-side auth gate for every OS surface (middleware is the first line; this is the guarantee). */
export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
