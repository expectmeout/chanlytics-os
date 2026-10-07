/**
 * A file the page made, handed to the phone's share sheet: save it to Files or Drive, mail it, open it in a sheet.
 * A WebView cannot save a file made in the page (a chart's CSV is a blob: link, which Android's download manager
 * refuses), so the page hands the app its name, type and words (contracts app-bridge "file"), already checked. A file
 * the server makes (an export) is a real address, and Android's download manager saves it as it always has.
 */
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { PageMessage } from "@chanlytics/contracts/phone-app";

/** What iOS calls each type the page may hand over. */
const UTI: Record<string, string> = {
  "text/csv": "public.comma-separated-values-text",
  "text/plain": "public.plain-text",
};

export async function shareFile(m: Extract<PageMessage, { t: "file" }>): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) return;
    const file = new File(Paths.cache, m.name);
    file.create({ overwrite: true });
    file.write(m.text);
    await Sharing.shareAsync(file.uri, { mimeType: m.type, UTI: UTI[m.type], dialogTitle: m.name });
  } catch (e) {
    // Said in the device's log: a share that fails leaves the person where they were, with nothing lost.
    console.warn("share_file_failed", e instanceof Error ? e.message : String(e));
  }
}
