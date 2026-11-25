"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@chanlytics/db/types";
import { publicEnv, supabaseProject } from "@/lib/public-env";
import { sessionCookieOptions } from "./cookie-options";

export function createClient() {
  const project = supabaseProject(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return createBrowserClient<Database>(project.url, project.anonKey, {
    cookieOptions: sessionCookieOptions(typeof location !== "undefined" && location.protocol === "https:"),
  });
}
