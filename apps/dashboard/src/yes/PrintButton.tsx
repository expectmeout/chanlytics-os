"use client";

/**
 * The browser's own print dialog, for a page made to be printed. A button rather than "use your browser's Print":
 * on a phone, Print is three taps deep in a share sheet, and the person holding the phone is who this is for.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="yes-btn sign-print" data-testid="desk-sign-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
