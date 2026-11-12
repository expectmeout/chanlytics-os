/**
 * A kept post handed to the device's own sheet (decision 0099, point 14), and a video made here (the content canvas: Save
 * puts it in Photos, where Instagram finds it; a download lands in Files on an iPhone, where it does not). Safari opens that
 * sheet only inside the tap, and one that waits on the network first works or not by how fast the network is. So the file
 * comes before the tap, and the tap asks for nothing.
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

/** Whether this device hands a video to a sheet of its own: asked of the device, as a picture is. */
export function sharesVideos(): boolean {
  try {
    return navigator.canShare?.({ files: [new File(["video"], "video.mp4", { type: "video/mp4" })] }) === true;
  } catch {
    return false;
  }
}

const fetched = new Map<string, Promise<File | null>>();

/** A file the sheet is handed, asked for once a tab: what came, or null, and the next look asks again. */
function fileOnce(key: string, asked: () => Promise<File | null>): Promise<File | null> {
  const already = fetched.get(key);
  if (already) return already;
  const coming = asked().then((file) => {
    // A phone between masts is back in seconds.
    if (!file) fetched.delete(key);
    return file;
  });
  fetched.set(key, coming);
  return coming;
}

/** A shape's picture as the file the sheet is handed, under a name a person can read, asked for once a tab. */
export function postFileOf(id: string, name: string, shape: PostShapeName): Promise<File | null> {
  return fileOnce(`${id}:${shape}`, () =>
    fileVerbs
      .fileBytes(id, shape)
      .then((blob) => (blob ? new File([blob], `${name}-${shape}.jpg`, { type: "image/jpeg" }) : null)),
  );
}

/** A video made here as the file the sheet is handed, under a name a person can read, asked for once a tab. */
export function videoFileOf(id: string, name: string): Promise<File | null> {
  return fileOnce(`${id}:video`, () =>
    fileVerbs
      .fileBytes(id, "video")
      .then((blob) => (blob ? new File([blob], `${name}.mp4`, { type: blob.type || "video/mp4" }) : null)),
  );
}

/** The sheet, opened in the tap's own turn, so nothing here may wait first. A person closing it is no failure. */
export function sharePostFile(file: File): Promise<"went" | "closed" | "failed"> {
  return navigator.share({ files: [file] }).then(
    () => "went" as const,
    (e: unknown) => (e instanceof DOMException && e.name === "AbortError" ? ("closed" as const) : ("failed" as const)),
  );
}
