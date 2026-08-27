import { NextResponse } from "next/server";
import { AppError } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";
import { signedMediaUrl } from "@/server/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/calls/:id/recording — the ONLY way audio reaches a browser.
 * RLS proves the caller may see the call, then a 5-minute signed URL is minted
 * for the private object. The permanent CDN URL never leaves the server.
 */
export const GET = withRoute(async (_req, { supabase, params }) => {
  const id = String(params.id ?? "");
  if (!UUID.test(id)) throw new AppError("not_found", "Call not found.");

  const { data: call, error } = await supabase
    .from("calls")
    .select("id, recording")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!call) throw new AppError("not_found", "Call not found.");

  const rec = call.recording as { storage_path?: string; fetch_state?: string } | null;
  if (!rec?.storage_path || rec.fetch_state !== "stored") {
    throw new AppError("not_found", "No recording stored for this call yet.");
  }
  const url = await signedMediaUrl(rec.storage_path, 300);
  if (!url) throw new AppError("internal", "Could not prepare the recording.");
  return { url };
});

export const dynamic = "force-dynamic";
void NextResponse;
