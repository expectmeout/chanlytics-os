/**
 * A file the browser saves, the kit's one door for it (the chart card's CSV and People's export each had a copy): text as a
 * CSV with a byte-order mark, so a spreadsheet reads its accents. Inside the phone app a WebView cannot save a file made in the
 * page: the app's bridge takes the same words to the share sheet and cancels the event (legacy-bridge/app-bridge.ts); anywhere
 * else nothing listens, and the browser saves it.
 */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** How long the file's address is kept once it is offered: the download has begun by then. */
const REVOKE_AFTER_MS = 1000;

export function downloadCsv(name: string, text: string): void {
  const asked = new CustomEvent("app:file", {
    cancelable: true,
    detail: { name, type: "text/csv", text: BYTE_ORDER_MARK + text },
  });
  if (typeof window.dispatchEvent === "function" && !window.dispatchEvent(asked)) return;
  const blob = new Blob([BYTE_ORDER_MARK + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
