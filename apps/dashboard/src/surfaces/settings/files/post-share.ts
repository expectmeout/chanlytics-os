/**
 * A kept post handed to the device's own sheet (decision 0099, point 14). Safari opens that sheet only inside the tap, and one that
 * waits on the network first works or not by how fast the network is. So the picture comes before the tap, and the tap asks for
 * nothing.
 */
import type { PostShapeName } from "@chanlytics/contracts";
import { fileVerbs } from "./verbs";

/** Whether this device hands a picture to a sheet of its own: asked of the device, never of how wide it is. */
export function sharesPictures(): boolean {
  try {
    return navigator.canShare?.({ files: [new File(["post"], "post.jpg", { type: "image/jpeg" })] }) === true;
  } catch {
    return false;
  }
}

const fetched = new Map<string, Promise<File | null>>();

/** A shape's picture as the file the sheet is handed, under a name a person can read, asked for once a tab. */
export function postFileOf(id: string, name: string, shape: PostShapeName): Promise<File | null> {
  const key = `${id}:${shape}`;
  const already = fetched.get(key);
  if (already) return already;
  const asked = fileVerbs.postBytes(id, shape).then((blob) => {
    if (blob) return new File([blob], `${name}-${shape}.jpg`, { type: "image/jpeg" });
    // The next look asks again: a phone between masts is back in seconds.
    fetched.delete(key);
    return null;
  });
  fetched.set(key, asked);
  return asked;
}

/** The sheet, opened in the tap's own turn, so nothing here may wait first. A person closing it is no failure. */
export function sharePostFile(file: File): Promise<"went" | "closed" | "failed"> {
  return navigator.share({ files: [file] }).then(
    () => "went" as const,
    (e: unknown) => (e instanceof DOMException && e.name === "AbortError" ? ("closed" as const) : ("failed" as const)),
  );
}
