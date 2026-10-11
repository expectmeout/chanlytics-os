/**
 * A chosen or found picture made into the workspace's square (00407), here in the browser, which decodes every kind an
 * owner has (a JPEG, a PNG, a WebP, a GIF's first frame) with no library of ours. How it is laid out is contracts'
 * (logo/layout.ts: a mark trimmed and contained on its plate, a picture to its edges filling the square), decided from
 * its pixels; this file only reads them and draws. What it answers is a PNG: the side the circle needs, smaller only to
 * come in under the weight kept, and the preview drawn from that same PNG, never from the file chosen. The server reads
 * that PNG to its end and remakes it before anything is kept, because it cannot know this page made it.
 */
import {
  LOGO_BYTES_MAX,
  LOGO_CHOSEN_MAX_BYTES,
  LOGO_CHOSEN_TYPES,
  LOGO_SIDE,
  LOGO_SIDE_MIN,
  logoDrawRect,
  logoLayout,
  type LogoNote,
} from "@chanlytics/contracts";

/** The picture is read at this at most on its longer side: enough to judge its edges, and a phone's camera roll is 4000. */
const WORK_SIDE = 512;
/** The sides tried, largest first: the next only where the one before weighs past what is kept. */
const SIDES = [LOGO_SIDE, 192, LOGO_SIDE_MIN] as const;

/** A picture made: the PNG to send, as base64, the address of its preview (a blob: the page lets go of), what to say. */
export interface MadePicture {
  base64: string;
  preview: string;
  notes: LogoNote[];
}

/** Whether a file is one the picker offers, by its kind and its weight, before a byte of it is read. */
export const chosenOk = (file: Blob): boolean =>
  file.size > 0 && file.size <= LOGO_CHOSEN_MAX_BYTES && (LOGO_CHOSEN_TYPES as readonly string[]).includes(file.type);

/** The bytes a found picture travelled in, as a file the page can decode. */
export function blobOf(base64: string, type: string): Blob {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type });
}

const pngOf = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((done) => canvas.toBlob((b) => done(b), "image/png"));

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The picture read into a canvas no wider or taller than WORK_SIDE; null when it does not decode. */
async function readInto(blob: Blob): Promise<HTMLCanvasElement | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return null;
    const scale = Math.min(1, WORK_SIDE / Math.max(w, h));
    const work = document.createElement("canvas");
    work.width = Math.max(1, Math.round(w * scale));
    work.height = Math.max(1, Math.round(h * scale));
    const ctx = work.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, work.width, work.height);
    return work;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The workspace's square made of a picture; null for one that does not decode, holds nothing, or will not fit. */
export async function makePicture(blob: Blob): Promise<MadePicture | null> {
  const work = await readInto(blob);
  const ctx = work?.getContext("2d", { willReadFrequently: true });
  if (!work || !ctx) return null;
  const layout = logoLayout({
    data: ctx.getImageData(0, 0, work.width, work.height).data,
    width: work.width,
    height: work.height,
  });
  if (!layout) return null;
  for (const side of SIDES) {
    const out = document.createElement("canvas");
    out.width = side;
    out.height = side;
    const pen = out.getContext("2d");
    if (!pen) return null;
    if (layout.plate) {
      pen.fillStyle = layout.plate;
      pen.fillRect(0, 0, side, side);
    }
    pen.imageSmoothingEnabled = true;
    pen.imageSmoothingQuality = "high";
    const at = logoDrawRect(layout, side);
    const { crop } = layout;
    pen.drawImage(work, crop.x, crop.y, crop.w, crop.h, at.x, at.y, at.w, at.h);
    const png = await pngOf(out);
    if (png && png.size <= LOGO_BYTES_MAX)
      return { base64: await base64Of(png), preview: URL.createObjectURL(png), notes: layout.notes };
  }
  return null;
}
