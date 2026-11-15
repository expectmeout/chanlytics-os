/**
 * A picture's print (decision 0134, amended 15 Nov 2026): the picture shrunk to core's 9×9 grey by sharp, and core's print of
 * it. A found photo is printed from the bytes its road read (found.ts), any other photo as its look starts, from a small copy
 * Storage makes, and a video from its poster at its digest's first step. Kept and judged by one door (00630 file_printed): where
 * it twins another, the rule there says which goes. Bytes sharp cannot read print as nothing, and the file is kept as before.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type Sharp from "sharp";
import { PRINT_SIDE, picturePrintOf } from "@chanlytics/core";
import { fileMadePathOf, filePathOf, type FileMadeOfVideo } from "@chanlytics/contracts";
import { filesBucket, recordFilePrint, type FileRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";

type Db = SupabaseClient<Database>;

/** The side Storage shrinks a kept photo to before it is printed: a print reads 9×9, never the whole picture. */
const PRINT_COPY_SIDE = 64;

let sharpLoading: Promise<typeof Sharp> | undefined;
/** sharp, loaded the first time a print is asked for: a job that never prints never pays its start. */
const printSharpOf = (): Promise<typeof Sharp> => (sharpLoading ??= import("sharp").then((m) => m.default));

/** The print of a picture's bytes, or null for bytes no picture reads from, or a picture too plain to tell from another. */
export async function readPicturePrint(bytes: Uint8Array): Promise<string | null> {
  const sharp = await printSharpOf();
  try {
    const grey = await sharp(bytes)
      .rotate()
      .greyscale()
      .resize(PRINT_SIDE, PRINT_SIDE, { fit: "fill" })
      .raw()
      .toBuffer();
    return picturePrintOf(grey);
  } catch {
    // Not a picture sharp reads (a format it lacks, bytes cut short): no print, and the file is judged by its bytes alone.
    return null;
  }
}

/** A kept photo as Storage shrinks it for its print, or null where Storage could not answer now (it is printed another time). */
export async function downloadPrintCopy(
  db: Db,
  row: Pick<FileRow, "tenant_id" | "id" | "mime">,
): Promise<Uint8Array | null> {
  const read = await filesBucket(db).download(filePathOf(row.tenant_id, row.id, row.mime), {
    transform: { width: PRINT_COPY_SIDE, height: PRINT_COPY_SIDE, resize: "contain" },
  });
  return read.data ? new Uint8Array(await read.data.arrayBuffer()) : null;
}

/** What the digest made of a video and kept in its folder (its poster), or null where it is not there. */
export async function downloadMade(
  db: Db,
  row: Pick<FileRow, "tenant_id" | "id">,
  which: FileMadeOfVideo,
): Promise<Uint8Array | null> {
  const read = await filesBucket(db).download(fileMadePathOf(row.tenant_id, row.id, which));
  return read.data ? new Uint8Array(await read.data.arrayBuffer()) : null;
}

/**
 * The file printed from these bytes, its print kept and judged: answers whether it went as the twin of a file already here. A
 * picture too plain to print is no twin of anything, and stays.
 */
export async function keepPrint(db: Db, row: Pick<FileRow, "tenant_id" | "id">, bytes: Uint8Array): Promise<boolean> {
  const print = await readPicturePrint(bytes);
  if (!print) return false;
  return (await recordFilePrint(db, row.tenant_id, row.id, print)).fate === "gone";
}
