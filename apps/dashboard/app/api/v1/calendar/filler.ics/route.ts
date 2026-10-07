/**
 * The filler's calendar, served so the address is a real one a person can paste into Settings and
 * preview. The feed itself is made in src/server/calendar/filler-calendar.ts, which `loadFeed` calls directly
 * for this address: the day's read never makes this request, so it cannot fail on a round trip the
 * server makes to its own domain.
 *
 * Public on purpose (proxy.ts PUBLIC_PATHS, and its own door in route-policy.test.mjs): it does NOT go
 * through withRoute (there is no session to verify), it reads nothing, and it holds no tenant's data.
 */
import { fillerCalendar, zoneOk } from "@/server/calendar/filler-calendar";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const asked = new URL(req.url).searchParams.get("tz") ?? "";
  const tz = asked && zoneOk(asked) ? asked : "America/New_York";
  return new Response(fillerCalendar(Date.now(), tz), {
    status: 200,
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
