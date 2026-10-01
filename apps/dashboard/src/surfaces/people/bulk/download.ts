/**
 * A file the browser saves: text as a CSV with a byte-order mark, so a spreadsheet reads its accents (moved whole from
 * legacy/pages/people.jsx plDownload, decision 0015).
 */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** How long the file's address is kept once it is offered: the download has begun by then. */
const REVOKE_AFTER_MS = 1000;

export function downloadCsv(name: string, text: string): void {
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
