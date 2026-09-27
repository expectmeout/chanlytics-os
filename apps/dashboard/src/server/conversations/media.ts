import "server-only";
import { serviceDb } from "../service-db";

/** Short-lived signed URL for a private media object (call recordings). */
export async function signedMediaUrl(storagePath: string, seconds = 300): Promise<string | null> {
  const { data, error } = await serviceDb().storage.from("media").createSignedUrl(storagePath, seconds);
  if (error) {
    console.error("signed_media_url_failed", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
