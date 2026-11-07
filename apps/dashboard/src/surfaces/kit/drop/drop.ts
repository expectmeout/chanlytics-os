/**
 * Files a person brings to a page rather than picks: dragged in from the desk, or pasted. A panel that takes them where it stands asks
 * whether a drag holds files, and a whole page listens on the window, so a drop anywhere on it lands rather than the browser opening the
 * photo in the tab, and whatever stands over the page and takes them for itself (Ask's panel, by preventing the default on the way up) is
 * left to. Words pasted into a box stay that box's.
 */
import { useEffect, useRef, useState } from "react";

/** Whether what is being dragged holds files, rather than words or a link. */
export const holdsFiles = (transfer: Pick<DataTransfer, "types"> | null): boolean =>
  Array.from(transfer?.types ?? []).includes("Files");

/** The images a paste holds: a screenshot, a photo copied from another app. */
export const imagesIn = (transfer: Pick<DataTransfer, "files"> | null): File[] =>
  Array.from(transfer?.files ?? []).filter((file) => file.type.startsWith("image/"));

/** Whether a person is typing where this came from. */
function typedInto(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return element?.tagName === "INPUT" || element?.tagName === "TEXTAREA" || element?.isContentEditable === true;
}

/**
 * Listen on a window for files brought to it, saying whether a drag is over it and handing on what lands. Answers how to stop. A drag
 * enters and leaves each element it crosses, so what counts is how deep it is, and the end of it wherever it ends.
 */
export function listenForFiles(
  win: Pick<Window, "addEventListener" | "removeEventListener">,
  take: (files: File[]) => void,
  dragged: (over: boolean) => void,
): () => void {
  let depth = 0;
  const entered = (e: DragEvent) => {
    if (!holdsFiles(e.dataTransfer)) return;
    depth += 1;
    dragged(true);
  };
  const moved = (e: DragEvent) => {
    if (!holdsFiles(e.dataTransfer)) return;
    if (e.defaultPrevented) return dragged(false);
    e.preventDefault();
    dragged(true);
  };
  const left = (e: DragEvent) => {
    if (!holdsFiles(e.dataTransfer)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) dragged(false);
  };
  const dropped = (e: DragEvent) => {
    depth = 0;
    dragged(false);
    if (!holdsFiles(e.dataTransfer) || e.defaultPrevented) return;
    e.preventDefault();
    take(Array.from(e.dataTransfer?.files ?? []));
  };
  const pasted = (e: ClipboardEvent) => {
    if (e.defaultPrevented || typedInto(e.target)) return;
    const images = imagesIn(e.clipboardData);
    if (images.length === 0) return;
    e.preventDefault();
    take(images);
  };
  win.addEventListener("dragenter", entered);
  win.addEventListener("dragover", moved);
  win.addEventListener("dragleave", left);
  win.addEventListener("drop", dropped);
  win.addEventListener("paste", pasted);
  return () => {
    win.removeEventListener("dragenter", entered);
    win.removeEventListener("dragover", moved);
    win.removeEventListener("dragleave", left);
    win.removeEventListener("drop", dropped);
    win.removeEventListener("paste", pasted);
  };
}

/** While `on`, the whole page takes files: what lands goes to `take`. Answers whether a drag is over it now. */
export function usePageTakesFiles(take: (files: File[]) => void, on: boolean): boolean {
  const [over, setOver] = useState(false);
  const latest = useRef(take);
  useEffect(() => {
    latest.current = take;
  });
  useEffect(() => {
    if (!on) return undefined;
    return listenForFiles(window, (files) => latest.current(files), setOver);
  }, [on]);
  return over;
}
