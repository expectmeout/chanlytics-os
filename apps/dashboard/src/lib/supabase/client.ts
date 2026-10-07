"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@chanlytics/db";
import { publicEnv } from "@/lib/public-env";
import { sessionCookieOptions } from "./cookie-options";

export function createClient() {
  return createBrowserClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: sessionCookieOptions(typeof location !== "undefined" && location.protocol === "https:"),
  });
}
